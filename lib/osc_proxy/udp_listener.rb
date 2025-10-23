# frozen_string_literal: true

require 'socket'

module OSCProxy
  class UDPListener
    def initialize(port:, bind:, max_size:, logger:)
      @port = port
      @bind = bind
      @max_size = max_size
      @logger = logger
      @socket = nil
    end

    def start
      @socket = UDPSocket.new
      @socket.bind(@bind, @port)
    rescue StandardError => e
      raise "Failed to start UDP listener: #{e.message}"
    end

    def receive(timeout: 1.0)
      return nil unless @socket.wait_readable(timeout)

      data, = @socket.recvfrom(@max_size)
      data
    end

    def stop
      return unless @socket

      @socket.close
      @socket = nil
    end
  end
end
