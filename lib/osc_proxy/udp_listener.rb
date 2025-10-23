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
      @logger.success("UDP listener started on #{@bind}:#{@port}")
    rescue StandardError => e
      @logger.error("Failed to start UDP listener: #{e.message}")
      raise
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
      @logger.info('UDP listener stopped')
    end
  end
end
