#!/usr/bin/env ruby
# frozen_string_literal: true

require 'bundler/setup'
require 'osc-ruby'
require 'socket'

# Create test OSC message
message = OSC::Message.new('/beat/tempo', 120.0)
data = message.encode

puts "=== Test OSC Message ==="
puts "Address: #{message.address}"
puts "Args: #{message.to_a.inspect}"
puts "Size: #{data.bytesize} bytes"
puts "Hex: #{data.unpack1('H*')}"
puts

# 1. Send via UDP to proxy (port 21650)
puts "1. Sending via UDP to proxy (127.0.0.1:21650)..."
udp_socket = UDPSocket.new
udp_socket.send(data, 0, '127.0.0.1', 21650)
udp_socket.close
puts "   ✓ Sent to proxy"
puts

# 2. Send directly via TCP to receiver (port 21600)
puts "2. Sending directly via TCP to receiver (127.0.0.1:21600)..."
begin
  tcp_socket = TCPSocket.new('127.0.0.1', 21600)
  tcp_socket.write(data)
  tcp_socket.flush
  tcp_socket.close
  puts "   ✓ Sent directly to receiver"
rescue StandardError => e
  puts "   ✗ Failed: #{e.message}"
end
puts

puts "Done! Check both endpoints for received messages."
