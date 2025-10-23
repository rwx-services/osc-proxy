# frozen_string_literal: true

require_relative '../test_helper'
require 'socket'
require 'timeout'

module OSCProxy
  class TestProxyIntegration < Minitest::Test
    def setup
      @tcp_port = 19_000
      @udp_port = 18_000
      @received_messages = []
      @tcp_server = nil
      @proxy = nil
      @proxy_thread = nil
    end

    def teardown
      @proxy&.stop
      @proxy_thread&.kill if @proxy_thread&.alive?
      @proxy_thread&.join(1)
      begin
        @tcp_server&.close
      rescue StandardError
        nil
      end
      sleep 0.1
    end

    def test_forwards_osc_message_from_udp_to_tcp
      start_tcp_server
      start_proxy

      send_osc_message('/test/cue', 1, 'go')

      wait_for_messages(1)

      assert_equal 1, @received_messages.size
      message = OSC::OSCPacket.messages_from_network(@received_messages.first).first

      assert_equal '/test/cue', message.address
      assert_equal [1, 'go'], message.to_a
    end

    def test_forwards_multiple_messages_in_order
      start_tcp_server
      start_proxy

      send_osc_message('/cue/1')
      send_osc_message('/cue/2')
      send_osc_message('/cue/3')

      wait_for_messages(3)

      assert_equal 3, @received_messages.size

      msg1 = OSC::OSCPacket.messages_from_network(@received_messages[0]).first
      msg2 = OSC::OSCPacket.messages_from_network(@received_messages[1]).first
      msg3 = OSC::OSCPacket.messages_from_network(@received_messages[2]).first

      assert_equal '/cue/1', msg1.address
      assert_equal '/cue/2', msg2.address
      assert_equal '/cue/3', msg3.address
    end

    def test_reconnects_after_tcp_disconnect
      start_tcp_server
      start_proxy

      send_osc_message('/before/disconnect')
      wait_for_messages(1)

      @tcp_server.close
      sleep 0.2

      start_tcp_server
      sleep 0.5

      send_osc_message('/after/reconnect')
      wait_for_messages(1)

      message = OSC::OSCPacket.messages_from_network(@received_messages.last).first

      assert_equal '/after/reconnect', message.address
    end

    private

    def start_tcp_server
      @tcp_server = TCPServer.new('127.0.0.1', @tcp_port)

      Thread.new do
        loop do
          client = @tcp_server.accept
          Thread.new do
            loop do
              data = client.recv(8192)
              break if data.empty?

              @received_messages << data
            end
          rescue StandardError
            # Client disconnected
          end
        end
      rescue StandardError
        # Server closed
      end
    end

    def start_proxy
      config = Config.new({
                            'udp' => { 'port' => @udp_port, 'bind' => '127.0.0.1' },
                            'tcp' => { 'host' => '127.0.0.1', 'port' => @tcp_port },
                            'logging' => { 'level' => 'quiet' },
                            'reconnect' => { 'initial_delay' => 0.1, 'max_delay' => 0.5 }
                          })

      @proxy = Proxy.new(config)

      @proxy_thread = Thread.new { @proxy.start }

      sleep 0.3
    end

    def send_osc_message(address, *args)
      socket = UDPSocket.new
      message = OSC::Message.new(address, *args)
      socket.send(message.encode, 0, '127.0.0.1', @udp_port)
      socket.close
      sleep 0.05
    end

    def wait_for_messages(count, timeout_seconds = 2)
      Timeout.timeout(timeout_seconds) do
        sleep 0.01 until @received_messages.size >= count
      end
    rescue Timeout::Error
      flunk "Expected #{count} messages, but only received #{@received_messages.size}"
    end
  end
end
