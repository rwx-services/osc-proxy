# frozen_string_literal: true

require_relative 'udp_listener'
require_relative 'tcp_listener'
require_relative 'tcp_connection'
require_relative 'udp_sender'
require_relative 'metrics_logger'

module OSCProxy
  # ListenerProxy manages one listener (source) with multiple forwarders (destinations)
  # Broadcasts each incoming message to ALL forwarders
  # rubocop:disable Metrics/ClassLength
  class ListenerProxy
    attr_reader :id, :name, :config, :metrics

    def initialize(listener_config, logger:, json_mode: false)
      @id = listener_config[:id]
      @name = listener_config[:name]
      @config = listener_config
      @logger = logger
      @json_mode = json_mode

      @listener = nil
      @forwarders = []
      @metrics = MetricsLogger.new(json_mode: json_mode)
      @running = false
      @thread = nil
    end

    # Start the listener proxy in a background thread
    def start
      @logger.log(:info, "Starting listener: #{@name}")

      # Create listener based on protocol
      @listener = create_listener
      @listener.start

      # Create all forwarders
      @forwarders = create_forwarders
      connect_forwarders

      # Update metrics with connection info
      @metrics.update_connections(
        udp_listener: @config[:protocol] == 'udp' ? @listener : nil,
        tcp_connection: nil # We have multiple forwarders now
      )

      # Start metrics logging
      @metrics.start

      # Start processing loop in background thread
      @running = true
      @thread = Thread.new { run_proxy_loop }
      @thread.name = "listener-#{@name}"

      @logger.log(:info, "Listener #{@name} started successfully")
      true
    rescue StandardError => e
      @logger.log(:error, "Failed to start listener #{@name}: #{e.message}")
      @logger.log(:error, e.backtrace.join("\n"))
      stop
      false
    end

    def stop
      @logger.log(:info, "Stopping listener: #{@name}")
      @running = false
      @thread&.join(5) # Wait up to 5 seconds for thread to finish
      @metrics&.stop
      @listener&.stop
      @forwarders.each(&:close)
      @forwarders.clear
      @logger.log(:info, "Listener #{@name} stopped")
    end

    def running?
      @running && @thread&.alive?
    end

    # Get current metrics for this listener
    def current_metrics
      {
        id: @id,
        name: @name,
        enabled: @config[:enabled],
        protocol: @config[:protocol],
        port: @config[:port],
        bind_address: @config[:bind_address],
        status: running? ? 'running' : 'stopped',
        rate: @metrics.rate,
        avg_rate: @metrics.avg_rate,
        peak_rate: @metrics.peak_rate,
        latency: @metrics.latency_ms,
        total: @metrics.total_received,
        forwarded: @metrics.total_forwarded,
        dropped: @metrics.total_dropped,
        loss_pct: @metrics.loss_percentage,
        forwarders: @forwarders.map { |f| forwarder_status(f) },
        forwarders_count: @forwarders.length
      }
    end

    private

    def create_listener
      case @config[:protocol]
      when 'udp'
        UDPListener.new(
          port: @config[:port],
          bind: @config[:bind_address],
          max_size: @config[:max_message_size],
          logger: @logger
        )
      when 'tcp'
        TCPListener.new(
          port: @config[:port],
          bind: @config[:bind_address],
          max_size: @config[:max_message_size],
          logger: @logger
        )
      else
        raise "Unknown listener protocol: #{@config[:protocol]}"
      end
    end

    def create_forwarders
      @config[:forwarders].map do |forwarder_config|
        create_forwarder(forwarder_config)
      end
    end

    # rubocop:disable Metrics/MethodLength
    def create_forwarder(forwarder_config)
      case forwarder_config[:protocol]
      when 'tcp'
        # Create a simple config object for TCP connection
        tcp_config = Struct.new(
          :tcp_keepalive?, :tcp_keepalive_interval,
          :tcp_nodelay?, :tcp_connect_timeout,
          :reconnect_max_attempts, :reconnect_initial_delay,
          :reconnect_max_delay, :reconnect_backoff_multiplier
        ).new(
          forwarder_config[:keepalive],
          forwarder_config[:keepalive_interval],
          forwarder_config[:nodelay],
          forwarder_config[:connect_timeout],
          -1, # infinite reconnect attempts
          0.1, # initial delay
          5.0, # max delay
          2.0 # backoff multiplier
        )

        TCPConnection.new(
          host: forwarder_config[:host],
          port: forwarder_config[:port],
          name: forwarder_config[:name],
          logger: @logger,
          config: tcp_config
        )
      when 'udp'
        UDPSender.new(
          host: forwarder_config[:host],
          port: forwarder_config[:port],
          name: forwarder_config[:name],
          logger: @logger
        )
      else
        raise "Unknown forwarder protocol: #{forwarder_config[:protocol]}"
      end
    end
    # rubocop:enable Metrics/MethodLength

    def connect_forwarders
      @forwarders.each(&:connect)
    end

    def run_proxy_loop
      @logger.log(:info, "#{@name}: Proxy loop started")

      handle_incoming_message while @running

      @logger.log(:info, "#{@name}: Proxy loop stopped")
    rescue StandardError => e
      @logger.log(:error, "#{@name}: Proxy loop error: #{e.message}")
      @logger.log(:error, e.backtrace.join("\n"))
    end

    def handle_incoming_message
      data = @listener.receive(timeout: 0.5)

      if data
        @metrics.record_received
        process_osc_message(data)
      end
    rescue StandardError => e
      @logger.log(:error, "#{@name}: Error handling message: #{e.message}")
      # Continue running despite errors
    end

    def process_osc_message(data)
      return if data.nil? || data.empty?

      # Broadcast to ALL forwarders simultaneously
      start_time = Time.now
      successful = 0
      failed = 0

      @forwarders.each do |forwarder|
        send_start = Time.now
        if forward_to_forwarder(forwarder, data, send_start)
          successful += 1
        else
          failed += 1
          forwarder.record_drop if forwarder.respond_to?(:record_drop)
        end
      end

      # Calculate average latency
      latency_ms = ((Time.now - start_time) * 1000).round(2)

      # Record metrics
      @metrics.record_forwarded(latency_ms) if successful.positive?

      failed.times { @metrics.record_dropped }
    end

    def forward_to_forwarder(forwarder, data, send_start)
      # Ensure forwarder is connected
      unless forwarder.connected?
        forwarder.reconnect if forwarder.respond_to?(:reconnect)
        return false unless forwarder.connected?
      end

      # Calculate latency for this specific forwarder
      latency_ms = ((Time.now - send_start) * 1000).round(2)
      forwarder.send_data(data, latency_ms: latency_ms)
    end

    def forwarder_status(forwarder)
      {
        name: forwarder.name,
        host: forwarder.host,
        port: forwarder.port,
        protocol: forwarder.is_a?(TCPConnection) ? 'tcp' : 'udp',
        connected: forwarder.connected?,
        latency: forwarder.avg_latency_ms,
        forwarded: forwarder.forwarded_count,
        dropped: forwarder.dropped_count,
        failed: forwarder.failed_count
      }
    end
  end
  # rubocop:enable Metrics/ClassLength
end
