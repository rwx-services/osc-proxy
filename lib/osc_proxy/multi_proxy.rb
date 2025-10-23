# frozen_string_literal: true

require 'sqlite3'
require 'json'
require_relative 'transmitter_proxy'
require_relative 'logger'

module OSCProxy
  # MultiProxy orchestrates multiple TransmitterProxy instances
  # Loads configuration from SQLite database and manages lifecycle
  class MultiProxy
    def initialize(database_path, logger: nil, json_mode: false)
      @database_path = database_path
      @logger = logger || Logger.new(level: :normal, show_content: false)
      @json_mode = json_mode
      @transmitter_proxies = []
      @running = false
      @metrics_thread = nil
    end

    def start
      @logger.log(:info, "MultiProxy starting with database: #{@database_path}")

      # Load transmitters from database
      load_transmitters

      if @transmitter_proxies.empty?
        @logger.log(:error, 'No enabled transmitters found in database')
        return false
      end

      # Start all transmitter proxies
      @transmitter_proxies.each(&:start)

      # Start metrics output loop
      @running = true
      @metrics_thread = Thread.new { metrics_output_loop } if @json_mode
      @metrics_thread.name = 'metrics-output' if @metrics_thread

      @logger.log(:info, "MultiProxy started with #{@transmitter_proxies.length} transmitter(s)")

      # Set up signal handlers
      setup_signal_handlers

      # Wait for all transmitter threads
      wait_for_transmitters

      true
    rescue StandardError => e
      @logger.log(:error, "Failed to start MultiProxy: #{e.message}")
      @logger.log(:error, e.backtrace.join("\n"))
      shutdown
      false
    end

    def stop
      @logger.log(:info, 'MultiProxy stopping...')
      @running = false
      @metrics_thread&.join(2)
      @transmitter_proxies.each(&:stop)
      @logger.log(:info, 'MultiProxy stopped')
    end

    private

    # rubocop:disable Metrics/AbcSize, Metrics/MethodLength, Metrics/BlockLength
    def load_transmitters
      db = SQLite3::Database.new(@database_path)
      db.results_as_hash = true

      # Get all enabled transmitters
      transmitters = db.execute(<<~SQL)
        SELECT * FROM transmitters WHERE enabled = 1 ORDER BY name
      SQL

      @logger.log(:info, "Found #{transmitters.length} enabled transmitter(s)")

      transmitters.each do |tx_row|
        # Load receivers for this transmitter
        receivers = db.execute(<<~SQL, tx_row['id'])
          SELECT * FROM receivers WHERE transmitter_id = ? AND enabled = 1 ORDER BY name
        SQL

        @logger.log(:info, "Transmitter '#{tx_row['name']}': #{receivers.length} receiver(s)")

        # Convert to symbol keys for consistency
        config = {
          id: tx_row['id'],
          name: tx_row['name'],
          enabled: tx_row['enabled'] == 1,
          protocol: tx_row['protocol'],
          bind_address: tx_row['bind_address'],
          port: tx_row['port'],
          max_message_size: tx_row['max_message_size'],
          receivers: receivers.map do |r|
            {
              id: r['id'],
              name: r['name'],
              protocol: r['protocol'],
              host: r['host'],
              port: r['port'],
              keepalive: r['keepalive'] == 1,
              keepalive_interval: r['keepalive_interval'],
              nodelay: r['nodelay'] == 1,
              connect_timeout: r['connect_timeout']
            }
          end
        }

        # Create transmitter proxy
        proxy = TransmitterProxy.new(config, logger: @logger, json_mode: @json_mode)
        @transmitter_proxies << proxy
      end

      db.close
    rescue SQLite3::Exception => e
      @logger.log(:error, "Database error: #{e.message}")
      raise
    end
    # rubocop:enable Metrics/AbcSize, Metrics/MethodLength, Metrics/BlockLength

    def setup_signal_handlers
      %w[INT TERM].each do |signal|
        Signal.trap(signal) do
          @logger.log(:info, "Received #{signal} signal")
          stop
          exit(0)
        end
      end
    end

    def wait_for_transmitters
      # Wait for all transmitter threads to finish (or until stopped)
      sleep 1 while @running && @transmitter_proxies.any?(&:running?)
    end

    def metrics_output_loop
      while @running
        output_metrics
        sleep 1 # Output metrics every second
      end
    rescue StandardError => e
      @logger.log(:error, "Metrics output error: #{e.message}")
    end

    def output_metrics
      metrics = {
        timestamp: Time.now.iso8601,
        aggregate: aggregate_metrics,
        transmitters: @transmitter_proxies.map(&:current_metrics)
      }

      puts JSON.generate(metrics)
      $stdout.flush
    end

    # rubocop:disable Metrics/AbcSize, Metrics/MethodLength
    def aggregate_metrics
      total_rate = 0.0
      total_avg_rate = 0.0
      max_peak_rate = 0.0
      total_latency = 0.0
      active_count = 0
      total_received = 0
      total_forwarded = 0
      total_dropped = 0

      @transmitter_proxies.each do |proxy|
        m = proxy.current_metrics
        total_rate += m[:rate]
        total_avg_rate += m[:avg_rate]
        max_peak_rate = [max_peak_rate, m[:peak_rate]].max
        if m[:latency].positive?
          total_latency += m[:latency]
          active_count += 1
        end
        total_received += m[:total]
        total_forwarded += m[:forwarded]
        total_dropped += m[:dropped]
      end

      avg_latency = active_count.positive? ? (total_latency / active_count).round(2) : 0.0
      loss_pct = total_received.positive? ? ((total_dropped.to_f / total_received) * 100).round(2) : 0.0

      {
        rate: total_rate.round(1),
        avgRate: total_avg_rate.round(1),
        peakRate: max_peak_rate.round(1),
        latency: avg_latency,
        total: total_received,
        forwarded: total_forwarded,
        dropped: total_dropped,
        lossPct: loss_pct
      }
    end
    # rubocop:enable Metrics/AbcSize, Metrics/MethodLength

    def shutdown
      stop
    end
  end
end
