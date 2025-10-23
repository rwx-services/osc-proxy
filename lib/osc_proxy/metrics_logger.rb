# frozen_string_literal: true

module OSCProxy
  # rubocop:disable Metrics/ClassLength
  class MetricsLogger
    attr_reader :metrics

    def initialize(output: $stdout, interval: 1.0, json_mode: false)
      @output = output
      @interval = interval
      @json_mode = json_mode
      @metrics = {
        total_received: 0,
        total_forwarded: 0,
        total_dropped: 0,
        latencies: [],
        peak_rate: 0.0,
        rate_samples: []
      }
      @interval_metrics = {
        received: 0,
        forwarded: 0,
        dropped: 0
      }
      @connections = {
        udp_listener: nil,
        tcp_connection: nil
      }
      @start_time = Time.now
      @last_display = Time.now
      @running = false
      @display_thread = nil
      @mutex = Mutex.new
    end

    def start
      @running = true
      @start_time = Time.now
      @last_display = Time.now

      # In JSON mode, set stdout to sync mode and send immediate status
      if @json_mode
        @output.sync = true
        send_immediate_status
      end

      start_display_thread
    end

    def stop
      @running = false
      @display_thread&.join(2)
      display_final_stats
    end

    def record_received
      @mutex.synchronize do
        @metrics[:total_received] += 1
        @interval_metrics[:received] += 1
      end
    end

    def record_forwarded(latency_ms)
      @mutex.synchronize do
        @metrics[:total_forwarded] += 1
        @interval_metrics[:forwarded] += 1
        @metrics[:latencies] << latency_ms
        # Keep only last 100 latencies for calculating average
        @metrics[:latencies].shift if @metrics[:latencies].size > 100
      end
    end

    def record_dropped
      @mutex.synchronize do
        @metrics[:total_dropped] += 1
        @interval_metrics[:dropped] += 1
      end
    end

    def update_connections(udp_listener:, tcp_connection:)
      @mutex.synchronize do
        @connections[:udp_listener] = udp_listener
        @connections[:tcp_connection] = tcp_connection
      end
    end

    private

    def send_immediate_status
      # Send initial status immediately so GUI doesn't wait for first interval
      stats = build_stats_hash(0.0)
      @output.puts format_stats_json(stats)
      @output.flush
    end

    def start_display_thread
      @display_thread = Thread.new do
        loop do
          break unless @running

          sleep @interval
          display_stats if @running
        end
      rescue StandardError => e
        @output.puts "Metrics error: #{e.message}"
      end
    end

    def display_stats
      now = Time.now
      elapsed = now - @last_display
      return if elapsed < @interval

      stats = calculate_stats(elapsed)
      @last_display = now

      if @json_mode
        @output.puts format_stats_json(stats)
        @output.flush
      else
        # Clear line and move cursor up to overwrite previous stats
        print "\r\033[K"
        @output.print format_stats(stats)
        @output.flush
      end
    end

    def calculate_stats(elapsed)
      @mutex.synchronize do
        rate = (@interval_metrics[:received] / elapsed).round(1)
        update_rate_stats(rate)

        stats = build_stats_hash(rate)
        reset_interval_counters

        stats
      end
    end

    def update_rate_stats(rate)
      @metrics[:rate_samples] << rate
      @metrics[:peak_rate] = rate if rate > @metrics[:peak_rate]
    end

    def build_stats_hash(rate)
      {
        messages_per_sec: rate,
        peak_rate: @metrics[:peak_rate],
        avg_rate: calculate_average_rate,
        total_received: @metrics[:total_received],
        total_forwarded: @metrics[:total_forwarded],
        total_dropped: @metrics[:total_dropped],
        avg_latency: calculate_average_latency,
        packet_loss_pct: calculate_packet_loss_percentage
      }
    end

    def reset_interval_counters
      @interval_metrics[:received] = 0
      @interval_metrics[:forwarded] = 0
      @interval_metrics[:dropped] = 0
    end

    def calculate_average_rate
      return 0.0 if @metrics[:rate_samples].empty?

      (@metrics[:rate_samples].sum / @metrics[:rate_samples].size).round(1)
    end

    def calculate_average_latency
      return 0 if @metrics[:latencies].empty?

      (@metrics[:latencies].sum / @metrics[:latencies].size).round(2)
    end

    def calculate_packet_loss_percentage
      total = @metrics[:total_received]
      return 0.0 if total.zero?

      ((@metrics[:total_dropped].to_f / total) * 100).round(2)
    end

    def format_stats(stats)
      format(
        'Rate: %<rate>s msg/s (avg: %<avg>s, peak: %<peak>s) | ' \
        'Latency: %<latency>s ms | Total: %<total>d | ' \
        'Forwarded: %<forwarded>d | Dropped: %<dropped>d (%<loss>s%%)',
        rate: stats[:messages_per_sec].to_s.rjust(5),
        avg: stats[:avg_rate].to_s.rjust(5),
        peak: stats[:peak_rate].to_s.rjust(5),
        latency: stats[:avg_latency].to_s.rjust(5),
        total: stats[:total_received],
        forwarded: stats[:total_forwarded],
        dropped: stats[:total_dropped],
        loss: stats[:packet_loss_pct]
      )
    end

    def format_stats_json(stats)
      require 'json'
      {
        rate: stats[:messages_per_sec],
        avgRate: stats[:avg_rate],
        peakRate: stats[:peak_rate],
        latency: stats[:avg_latency],
        total: stats[:total_received],
        forwarded: stats[:total_forwarded],
        dropped: stats[:total_dropped],
        lossPct: stats[:packet_loss_pct],
        connections: get_connection_info
      }.to_json
    end

    def get_connection_info
      udp = @connections[:udp_listener]
      tcp = @connections[:tcp_connection]

      {
        inbound: udp ? {
          type: 'UDP',
          bind: udp.instance_variable_get(:@bind),
          port: udp.instance_variable_get(:@port),
          status: 'listening'
        } : nil,
        outbound: tcp ? {
          type: 'TCP',
          host: tcp.instance_variable_get(:@host),
          port: tcp.instance_variable_get(:@port),
          status: tcp.connected? ? 'connected' : 'disconnected'
        } : nil
      }
    end

    def display_final_stats
      @output.puts "\n"
      @output.puts '=== Final Statistics ==='

      elapsed = Time.now - @start_time
      stats = calculate_final_stats(elapsed)

      @output.puts "Duration: #{stats[:duration]}s"
      @output.puts "Total Received: #{stats[:total_received]}"
      @output.puts "Total Forwarded: #{stats[:total_forwarded]}"
      @output.puts "Total Dropped: #{stats[:total_dropped]} (#{stats[:packet_loss_pct]}%)"
      @output.puts "Average Latency: #{stats[:avg_latency]} ms"
      @output.puts "Peak Rate: #{stats[:peak_rate]} msg/s"
      @output.puts "Average Rate: #{stats[:avg_rate]} msg/s"
      @output.puts "Overall Rate: #{(stats[:total_received] / elapsed).round(1)} msg/s"
    end

    def calculate_final_stats(elapsed)
      @mutex.synchronize do
        {
          total_received: @metrics[:total_received],
          total_forwarded: @metrics[:total_forwarded],
          total_dropped: @metrics[:total_dropped],
          avg_latency: calculate_average_latency,
          peak_rate: @metrics[:peak_rate],
          avg_rate: calculate_average_rate,
          packet_loss_pct: calculate_packet_loss_percentage,
          duration: elapsed.round(1)
        }
      end
    end
  end
  # rubocop:enable Metrics/ClassLength
end
