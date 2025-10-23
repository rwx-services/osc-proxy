# frozen_string_literal: true

require 'sqlite3'
require 'json'
require_relative 'listener_proxy'
require_relative 'logger'

module OSCProxy
  # MultiProxy orchestrates multiple ListenerProxy instances
  # Loads configuration from SQLite database and manages lifecycle
  class MultiProxy
    def initialize(database_path, logger: nil, json_mode: false, listener_id: nil)
      @database_path = database_path
      @logger = logger || Logger.new(level: :normal, show_content: false)
      @json_mode = json_mode
      @listener_id = listener_id # Optional: if set, only load this specific listener
      @listener_proxies = []
      @running = false
      @metrics_thread = nil
    end

    def start
      @logger.log(:info, "MultiProxy starting with database: #{@database_path}")

      # Load listeners from database
      load_listeners

      if @listener_proxies.empty?
        @logger.log(:error, 'No enabled listeners found in database')
        return false
      end

      # Start all listener proxies
      @listener_proxies.each(&:start)

      # Start metrics output loop
      @running = true
      @metrics_thread = Thread.new { metrics_output_loop } if @json_mode
      @metrics_thread.name = 'metrics-output' if @metrics_thread

      # Start stdin command listener for individual listener control
      @command_thread = Thread.new { command_listener_loop }
      @command_thread.name = 'command-listener'

      @logger.log(:info, "MultiProxy started with #{@listener_proxies.length} listener(s)")

      # Set up signal handlers
      setup_signal_handlers

      # Wait for all listener threads
      wait_for_listeners

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
      @command_thread&.join(2)
      @listener_proxies.each(&:stop)
      @logger.log(:info, 'MultiProxy stopped')
    end

    private

    # rubocop:disable Metrics/AbcSize, Metrics/MethodLength, Metrics/BlockLength
    def load_listeners
      db = SQLite3::Database.new(@database_path)
      db.results_as_hash = true

      # Get all enabled listeners (or just the specified one)
      listeners = if @listener_id
                    db.execute(<<~SQL, @listener_id)
                      SELECT * FROM listeners WHERE id = ? ORDER BY name
                    SQL
                  else
                    db.execute(<<~SQL)
                      SELECT * FROM listeners WHERE enabled = 1 ORDER BY name
                    SQL
                  end

      @logger.log(:info, "Found #{listeners.length} enabled listener(s)")

      listeners.each do |listener_row|
        # Load forwarders for this listener
        forwarders = db.execute(<<~SQL, listener_row['id'])
          SELECT * FROM forwarders WHERE listener_id = ? AND enabled = 1 ORDER BY name
        SQL

        @logger.log(:info, "Listener '#{listener_row['name']}': #{forwarders.length} forwarder(s)")

        # Convert to symbol keys for consistency
        config = {
          id: listener_row['id'],
          name: listener_row['name'],
          enabled: listener_row['enabled'] == 1,
          protocol: listener_row['protocol'],
          bind_address: listener_row['bind_address'],
          port: listener_row['port'],
          max_message_size: listener_row['max_message_size'],
          forwarders: forwarders.map do |f|
            {
              id: f['id'],
              name: f['name'],
              protocol: f['protocol'],
              host: f['host'],
              port: f['port'],
              keepalive: f['keepalive'] == 1,
              keepalive_interval: f['keepalive_interval'],
              nodelay: f['nodelay'] == 1,
              connect_timeout: f['connect_timeout']
            }
          end
        }

        # Create listener proxy
        proxy = ListenerProxy.new(config, logger: @logger, json_mode: @json_mode)
        @listener_proxies << proxy
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

    def wait_for_listeners
      # Wait for all listener threads to finish (or until stopped)
      sleep 1 while @running && @listener_proxies.any?(&:running?)
    end

    def metrics_output_loop
      while @running
        output_metrics
        sleep 0.1 # Output metrics 10 times per second for responsive UI
      end
    rescue StandardError => e
      @logger.log(:error, "Metrics output error: #{e.message}")
    end

    def output_metrics
      metrics = {
        timestamp: Time.now.iso8601,
        aggregate: aggregate_metrics,
        listeners: @listener_proxies.map(&:current_metrics)
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

      @listener_proxies.each do |proxy|
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

    def command_listener_loop
      while @running
        ready = IO.select([$stdin], nil, nil, 1)
        next unless ready

        line = $stdin.gets
        break unless line

        handle_command(line.strip)
      end
    rescue StandardError => e
      @logger.log(:error, "Command listener error: #{e.message}")
    end

    def handle_command(command)
      parts = command.split(' ', 2)
      action = parts[0]
      listener_id = parts[1]&.to_i

      case action
      when 'start'
        start_listener(listener_id) if listener_id
      when 'stop'
        stop_listener(listener_id) if listener_id
      else
        @logger.log(:warn, "Unknown command: #{command}")
      end
    end

    def start_listener(listener_id)
      proxy = @listener_proxies.find { |p| p.current_metrics[:id] == listener_id }
      if proxy
        if proxy.running?
          @logger.log(:warn, "Listener #{listener_id} is already running")
        else
          proxy.start
          @logger.log(:info, "Started listener #{listener_id}")
        end
      else
        @logger.log(:error, "Listener #{listener_id} not found")
      end
    end

    def stop_listener(listener_id)
      proxy = @listener_proxies.find { |p| p.current_metrics[:id] == listener_id }
      if proxy
        if proxy.running?
          proxy.stop
          @logger.log(:info, "Stopped listener #{listener_id}")
        else
          @logger.log(:warn, "Listener #{listener_id} is already stopped")
        end
      else
        @logger.log(:error, "Listener #{listener_id} not found")
      end
    end

    def shutdown
      stop
    end
  end
end
