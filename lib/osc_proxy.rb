# frozen_string_literal: true

require 'osc-ruby'
require_relative 'osc_proxy/config'
require_relative 'osc_proxy/logger'
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
      @running = false
      @tcp_connection = nil
      @udp_listener = nil
    end

    def start
      @logger.info('Starting OSC Proxy...')
      @logger.info("UDP: #{@config.udp_bind}:#{@config.udp_port} -> TCP: #{@config.tcp_host}:#{@config.tcp_port}")

      setup_signal_handlers
      setup_udp_listener
      setup_tcp_connection

      @running = true
      run_proxy_loop
    rescue Interrupt
      @logger.info('Received interrupt signal')
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
          @logger.info("Received #{signal} signal")
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
      return if @tcp_connection.connect

      @logger.warn('Initial TCP connection failed, will retry on first message')
    end

    def run_proxy_loop
      @logger.success('Proxy running. Press Ctrl+C to stop.')

      handle_incoming_message while @running
    end

    def handle_incoming_message
      data = @udp_listener.receive
      process_osc_message(data)
    rescue StandardError => e
      @logger.error("Error receiving UDP message: #{e.message}")
      @logger.verbose(e.backtrace.join("\n"))
    end

    def process_osc_message(data)
      messages = OSC::OSCPacket.messages_from_network(data)
      osc_message = messages.first

      forward_message(osc_message, data)
    rescue StandardError => e
      @logger.error("Invalid OSC message: #{e.message}")
    end

    def forward_message(osc_message, raw_data)
      ensure_tcp_connected

      if @tcp_connection.connected?
        if @tcp_connection.send_data(raw_data)
          @logger.message_forwarded(osc_message)
        else
          @logger.message_dropped(osc_message, 'TCP send failed')
          attempt_reconnect
        end
      else
        @logger.message_dropped(osc_message, 'TCP disconnected')
      end
    end

    def ensure_tcp_connected
      return if @tcp_connection.connected?

      @logger.warn('TCP not connected, attempting to connect...')
      attempt_reconnect
    end

    def attempt_reconnect
      return if @tcp_connection.connected?

      @tcp_connection.reconnect
    end

    def shutdown
      @logger.info('Shutting down...')
      @udp_listener&.stop
      @tcp_connection&.close
      @logger.info('Proxy stopped')
    end
  end
end
