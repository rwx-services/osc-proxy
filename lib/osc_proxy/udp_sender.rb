# frozen_string_literal: true

require 'socket'

module OSCProxy
  # UDPSender sends OSC messages via UDP to a destination
  # Mirrors the TCPConnection API for consistency
  class UDPSender
    attr_reader :host, :port, :name
    attr_reader :forwarded_count, :dropped_count, :failed_count
    attr_reader :total_latency, :latency_samples

    def initialize(host:, port:, logger:, name: nil)
      @host = host
      @port = port
      @name = name || "#{host}:#{port}"
      @logger = logger
      @socket = nil
      @connected = false

      # Per-receiver metrics
      @forwarded_count = 0
      @dropped_count = 0
      @failed_count = 0
      @total_latency = 0.0
      @latency_samples = 0
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
    def send_data(data, latency_ms: 0)
      raise 'Not connected' unless @connected

      # UDP doesn't need SLIP framing - send raw OSC data
      @socket.send(data, 0)

      # Track successful send
      @forwarded_count += 1
      if latency_ms.positive?
        @total_latency += latency_ms
        @latency_samples += 1
      end

      true
    rescue StandardError => e
      @logger.log(:error, "UDP send failed to #{@host}:#{@port}: #{e.message}")
      @connected = false
      @failed_count += 1
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

    def record_drop
      @dropped_count += 1
    end

    def avg_latency_ms
      return 0.0 if @latency_samples.zero?

      (@total_latency / @latency_samples).round(2)
    end
  end
end
