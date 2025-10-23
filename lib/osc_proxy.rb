# frozen_string_literal: true

require_relative 'osc_proxy/config'
require_relative 'osc_proxy/logger'
require_relative 'osc_proxy/metrics_logger'
require_relative 'osc_proxy/tcp_connection'
require_relative 'osc_proxy/udp_listener'

module OSCProxy
  class Proxy
    def initialize(config)
      @config = config
      @logger = Logger.new(
        level: config.log_level,
        show_content: config.show_message_content?
      )
      @metrics = MetricsLogger.new
      @running = false
      @tcp_connection = nil
      @udp_listener = nil
    end

    def start
      setup_signal_handlers
      setup_udp_listener
      setup_tcp_connection

      @metrics.start
      @running = true
      run_proxy_loop
    rescue Interrupt
      # Silent interrupt
    ensure
      shutdown
    end

    def stop
      @running = false
    end

    private

    def setup_signal_handlers
      %w[INT TERM].each do |signal|
        Signal.trap(signal) do
          stop
        end
      end
    end

    def setup_udp_listener
      @udp_listener = UDPListener.new(
        port: @config.udp_port,
        bind: @config.udp_bind,
        max_size: @config.udp_max_message_size,
        logger: @logger
      )
      @udp_listener.start
    end

    def setup_tcp_connection
      @tcp_connection = TCPConnection.new(
        host: @config.tcp_host,
        port: @config.tcp_port,
        logger: @logger,
        config: @config
      )

      attempt_tcp_connection
    end

    def attempt_tcp_connection
      @tcp_connection.connect
    end

    def run_proxy_loop
      handle_incoming_message while @running
    end

    def handle_incoming_message
      data = @udp_listener.receive

      if data
        @metrics.record_received
        process_osc_message(data)
      end
    rescue StandardError
      # Silently continue on errors
    end

    def process_osc_message(data)
      return if data.nil? || data.empty?

      # Forward raw data immediately and measure latency
      start_time = Time.now
      success = forward_raw_data(data)
      latency_ms = ((Time.now - start_time) * 1000).round(2)

      if success
        @metrics.record_forwarded(latency_ms)
      else
        @metrics.record_dropped
      end
    end

    def forward_raw_data(raw_data)
      ensure_tcp_connected

      return false unless @tcp_connection.connected?

      @tcp_connection.send_data(raw_data)
    end

    def ensure_tcp_connected
      return if @tcp_connection.connected?

      attempt_reconnect
    end

    def attempt_reconnect
      return if @tcp_connection.connected?

      @tcp_connection.reconnect
    end

    def shutdown
      @metrics&.stop
      @udp_listener&.stop
      @tcp_connection&.close
    end
  end
end
