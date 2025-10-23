# frozen_string_literal: true

require_relative 'udp_listener'
require_relative 'tcp_listener'
require_relative 'tcp_connection'
require_relative 'udp_sender'
require_relative 'metrics_logger'

module OSCProxy
  # TransmitterProxy manages one transmitter (source) with multiple receivers (destinations)
  # Broadcasts each incoming message to ALL receivers
  # rubocop:disable Metrics/ClassLength
  class TransmitterProxy
    attr_reader :id, :name, :config, :metrics

    def initialize(transmitter_config, logger:, json_mode: false)
      @id = transmitter_config[:id]
      @name = transmitter_config[:name]
      @config = transmitter_config
      @logger = logger
      @json_mode = json_mode

      @listener = nil
      @receivers = []
      @metrics = MetricsLogger.new(json_mode: json_mode)
      @running = false
      @thread = nil
    end

    # Start the transmitter proxy in a background thread
    def start
      @logger.log(:info, "Starting transmitter: #{@name}")

      # Create listener based on protocol
      @listener = create_listener
      @listener.start

      # Create all receivers
      @receivers = create_receivers
      connect_receivers

      # Update metrics with connection info
      @metrics.update_connections(
        udp_listener: @config[:protocol] == 'udp' ? @listener : nil,
        tcp_connection: nil # We have multiple receivers now
      )

      # Start metrics logging
      @metrics.start

      # Start processing loop in background thread
      @running = true
      @thread = Thread.new { run_proxy_loop }
      @thread.name = "transmitter-#{@name}"

      @logger.log(:info, "Transmitter #{@name} started successfully")
      true
    rescue StandardError => e
      @logger.log(:error, "Failed to start transmitter #{@name}: #{e.message}")
      @logger.log(:error, e.backtrace.join("\n"))
      stop
      false
    end

    def stop
      @logger.log(:info, "Stopping transmitter: #{@name}")
      @running = false
      @thread&.join(5) # Wait up to 5 seconds for thread to finish
      @metrics&.stop
      @listener&.stop
      @receivers.each(&:close)
      @receivers.clear
      @logger.log(:info, "Transmitter #{@name} stopped")
    end

    def running?
      @running && @thread&.alive?
    end

    # Get current metrics for this transmitter
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
        receivers: @receivers.map { |r| receiver_status(r) },
        receivers_count: @receivers.length
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

    def create_receivers
      @config[:receivers].map do |receiver_config|
        create_receiver(receiver_config)
      end
    end

    # rubocop:disable Metrics/MethodLength
    def create_receiver(receiver_config)
      case receiver_config[:protocol]
      when 'tcp'
        # Create a simple config object for TCP connection
        tcp_config = Struct.new(
          :tcp_keepalive?, :tcp_keepalive_interval,
          :tcp_nodelay?, :tcp_connect_timeout,
          :reconnect_max_attempts, :reconnect_initial_delay,
          :reconnect_max_delay, :reconnect_backoff_multiplier
        ).new(
          receiver_config[:keepalive],
          receiver_config[:keepalive_interval],
          receiver_config[:nodelay],
          receiver_config[:connect_timeout],
          -1, # infinite reconnect attempts
          0.1, # initial delay
          5.0, # max delay
          2.0 # backoff multiplier
        )

        TCPConnection.new(
          host: receiver_config[:host],
          port: receiver_config[:port],
          logger: @logger,
          config: tcp_config
        )
      when 'udp'
        UDPSender.new(
          host: receiver_config[:host],
          port: receiver_config[:port],
          logger: @logger
        )
      else
        raise "Unknown receiver protocol: #{receiver_config[:protocol]}"
      end
    end
    # rubocop:enable Metrics/MethodLength

    def connect_receivers
      @receivers.each(&:connect)
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

      # Broadcast to ALL receivers simultaneously
      start_time = Time.now
      successful = 0
      failed = 0

      @receivers.each do |receiver|
        if forward_to_receiver(receiver, data)
          successful += 1
        else
          failed += 1
        end
      end

      # Calculate average latency
      latency_ms = ((Time.now - start_time) * 1000).round(2)

      # Record metrics
      @metrics.record_forwarded(latency_ms) if successful.positive?

      failed.times { @metrics.record_dropped }
    end

    def forward_to_receiver(receiver, data)
      # Ensure receiver is connected
      unless receiver.connected?
        receiver.reconnect if receiver.respond_to?(:reconnect)
        return false unless receiver.connected?
      end

      receiver.send_data(data)
    end

    def receiver_status(receiver)
      {
        host: receiver.respond_to?(:host) ? receiver.host : 'unknown',
        port: receiver.respond_to?(:port) ? receiver.port : 0,
        protocol: receiver.is_a?(TCPConnection) ? 'tcp' : 'udp',
        connected: receiver.connected?
      }
    end
  end
  # rubocop:enable Metrics/ClassLength
end
