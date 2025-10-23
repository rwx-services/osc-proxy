# frozen_string_literal: true

require_relative '../test_helper'

module OSCProxy
  class TestConfig < Minitest::Test
    def test_default_config
      config = Config.new

      assert_equal 8000, config.udp_port
      assert_equal '0.0.0.0', config.udp_bind
      assert_equal 8192, config.udp_max_message_size

      assert_equal '127.0.0.1', config.tcp_host
      assert_equal 9000, config.tcp_port
      assert_predicate config, :tcp_keepalive?
      assert_predicate config, :tcp_nodelay?
      assert_equal 10, config.tcp_keepalive_interval
      assert_equal 5, config.tcp_connect_timeout

      assert_equal(-1, config.reconnect_max_attempts)
      assert_in_delta(0.1, config.reconnect_initial_delay)
      assert_in_delta(5.0, config.reconnect_max_delay)
      assert_in_delta(2.0, config.reconnect_backoff_multiplier)

      assert_equal :normal, config.log_level
      assert_predicate config, :show_message_content?
    end

    def test_custom_config
      custom = {
        'udp' => { 'port' => 7000 },
        'tcp' => { 'host' => '192.168.1.50', 'port' => 8000 }
      }

      config = Config.new(custom)

      assert_equal 7000, config.udp_port
      assert_equal '192.168.1.50', config.tcp_host
      assert_equal 8000, config.tcp_port
      assert_equal '0.0.0.0', config.udp_bind
    end

    def test_merge_config
      base = Config.new({ 'udp' => { 'port' => 7000 } })
      override = { 'tcp' => { 'host' => '10.0.0.1' } }

      merged = base.merge(override)

      assert_equal 7000, merged.udp_port
      assert_equal '10.0.0.1', merged.tcp_host
      assert_equal 9000, merged.tcp_port
    end

    def test_from_file_missing
      error = assert_raises(RuntimeError) do
        Config.from_file('/nonexistent/file.yml')
      end

      assert_match(/not found/, error.message)
    end
  end
end
