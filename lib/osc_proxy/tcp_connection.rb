# frozen_string_literal: true

require 'socket'

module OSCProxy
  class TCPConnection
    attr_reader :connected, :attempt_count, :host, :port, :name
    attr_reader :forwarded_count, :dropped_count, :failed_count
    attr_reader :total_latency, :latency_samples

    def initialize(host:, port:, logger:, config:, name: nil)
      @host = host
      @port = port
      @name = name || "#{host}:#{port}"
      @logger = logger
      @config = config
      @socket = nil
      @connected = false
      @attempt_count = 0
      @current_delay = config.reconnect_initial_delay

      # Per-receiver metrics
      @forwarded_count = 0
      @dropped_count = 0
      @failed_count = 0
      @total_latency = 0.0
      @latency_samples = 0
    end

    def connect
      @attempt_count += 1

      @socket = Socket.new(Socket::AF_INET, Socket::SOCK_STREAM, 0)
      sockaddr = Socket.sockaddr_in(@port, @host)

      begin
        @socket.connect_nonblock(sockaddr)
      rescue IO::WaitWritable
        unless @socket.wait_writable(@config.tcp_connect_timeout)
          @socket.close
          raise Errno::ETIMEDOUT, "Connection timeout to #{@host}:#{@port}"
        end

        begin
          @socket.connect_nonblock(sockaddr)
        rescue Errno::EISCONN
          # Connection successful
        end
      end

      configure_socket
      @connected = true
      @attempt_count = 0
      @current_delay = @config.reconnect_initial_delay

      true
    rescue StandardError
      @socket&.close
      @socket = nil
      @connected = false
      false
    end

    def reconnect
      close if @connected

      max_attempts = @config.reconnect_max_attempts
      return false if max_attempts.positive? && @attempt_count >= max_attempts

      sleep(@current_delay) if @attempt_count.positive?

      result = connect

      unless result
        @current_delay = [@current_delay * @config.reconnect_backoff_multiplier, @config.reconnect_max_delay].min
      end

      result
    end

    def send_data(data, latency_ms: 0)
      raise 'Not connected' unless @connected

      # Add SLIP framing (required for OSC over TCP by Lightkey)
      # SLIP uses 0xC0 (END) byte as delimiter before and after each packet
      slip_end = "\xC0".b
      framed_data = slip_end + data + slip_end

      @socket.write(framed_data)
      @socket.flush # Ensure data is sent immediately

      # Track successful send
      @forwarded_count += 1
      if latency_ms.positive?
        @total_latency += latency_ms
        @latency_samples += 1
      end

      true
    rescue Errno::EPIPE, Errno::ECONNRESET, IOError
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

    private

    def configure_socket
      @socket.setsockopt(Socket::SOL_SOCKET, Socket::SO_KEEPALIVE, 1) if @config.tcp_keepalive?
      @socket.setsockopt(Socket::IPPROTO_TCP, Socket::TCP_NODELAY, 1) if @config.tcp_nodelay?
    end
  end
end
