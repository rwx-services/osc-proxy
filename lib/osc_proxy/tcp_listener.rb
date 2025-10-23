# frozen_string_literal: true

require 'socket'

module OSCProxy
  # TCPListener accepts incoming TCP connections and parses SLIP-framed OSC messages
  # Mirrors the UDPListener API for consistency
  class TCPListener
    def initialize(port:, bind:, max_size:, logger:)
      @port = port
      @bind = bind
      @max_size = max_size
      @logger = logger
      @server_socket = nil
      @client_socket = nil
      @buffer = String.new(encoding: Encoding::BINARY)
    end

    def start
      @server_socket = TCPServer.new(@bind, @port)
      @logger.log(:info, "TCP listener started on #{@bind}:#{@port}")
    rescue StandardError => e
      raise "Failed to start TCP listener: #{e.message}"
    end

    # Accept connection and receive SLIP-framed messages
    # Returns one complete OSC message (without SLIP framing)
    def receive(timeout: 1.0)
      # Accept new connection if we don't have one
      unless @client_socket
        return nil unless @server_socket.wait_readable(timeout)

        @client_socket = @server_socket.accept
        @buffer.clear
        @logger.log(:info, "TCP client connected from #{@client_socket.peeraddr[2]}")
      end

      # Read data from client
      loop do
        unless @client_socket.wait_readable(timeout)
          # Timeout - check if we have a complete message in buffer
          message = extract_slip_message
          return message if message

          return nil
        end

        begin
          data = @client_socket.read_nonblock(@max_size)
          @buffer << data

          # Try to extract a complete SLIP message
          message = extract_slip_message
          return message if message
        rescue EOFError, Errno::ECONNRESET
          # Client disconnected
          @logger.log(:info, 'TCP client disconnected')
          @client_socket.close
          @client_socket = nil
          @buffer.clear
          return nil
        rescue IO::WaitReadable
          # No data available yet, continue loop
          next
        end
      end
    end

    def stop
      @client_socket&.close
      @client_socket = nil
      @server_socket&.close
      @server_socket = nil
      @buffer.clear
    end

    private

    # Extract one SLIP-framed message from the buffer
    # SLIP uses 0xC0 (END) byte as delimiter
    # Format: END + data + END
    def extract_slip_message
      slip_end = "\xC0".b

      # Find first END byte
      start_index = @buffer.index(slip_end)
      return nil unless start_index

      # Find next END byte (marks end of message)
      end_index = @buffer.index(slip_end, start_index + 1)
      return nil unless end_index

      # Extract message (without SLIP framing bytes)
      message = @buffer[(start_index + 1)...end_index]

      # Remove extracted message from buffer (including END bytes)
      @buffer.slice!(0..end_index)

      # Handle SLIP escaping if present
      # SLIP ESC (0xDB) followed by:
      #   0xDC = escaped END (0xC0)
      #   0xDD = escaped ESC (0xDB)
      slip_esc = "\xDB".b
      slip_esc_end = "\xDC".b
      slip_esc_esc = "\xDD".b

      message.gsub!(slip_esc + slip_esc_end, slip_end)
      message.gsub!(slip_esc + slip_esc_esc, slip_esc)

      message.empty? ? nil : message
    end
  end
end
