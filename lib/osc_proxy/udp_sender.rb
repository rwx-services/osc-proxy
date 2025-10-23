# frozen_string_literal: true

require 'socket'

module OSCProxy
  # UDPSender sends OSC messages via UDP to a destination
  # Mirrors the TCPConnection API for consistency
  class UDPSender
    attr_reader :host, :port

    def initialize(host:, port:, logger:)
      @host = host
      @port = port
      @logger = logger
      @socket = nil
      @connected = false
    end

    # UDP is connectionless, but we "connect" the socket for efficiency
    # This associates the socket with the destination address
    def connect
      @socket = UDPSocket.new
      # "Connect" the UDP socket (sets default destination, doesn't actually connect)
      @socket.connect(@host, @port)
      @connected = true
      @logger.log(:info, "UDP sender ready: #{@host}:#{@port}")
      true
    rescue StandardError => e
      @logger.log(:error, "Failed to create UDP sender to #{@host}:#{@port}: #{e.message}")
      @socket&.close
      @socket = nil
      @connected = false
      false
    end

    # UDP doesn't need reconnection logic (connectionless)
    # But we provide this method for API compatibility
    def reconnect
      close if @connected
      connect
    end

    # Send data via UDP (fire-and-forget, no acknowledgment)
    def send_data(data)
      raise 'Not connected' unless @connected

      # UDP doesn't need SLIP framing - send raw OSC data
      @socket.send(data, 0)
      true
    rescue StandardError => e
      @logger.log(:error, "UDP send failed to #{@host}:#{@port}: #{e.message}")
      @connected = false
      false
    end

    def close
      return unless @socket

      @socket.close
      @socket = nil
      @connected = false
    end

    def connected?
      @connected
    end
  end
end
