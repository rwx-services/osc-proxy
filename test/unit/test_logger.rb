# frozen_string_literal: true

require_relative '../test_helper'
require 'stringio'

module OSCProxy
  class TestLogger < Minitest::Test
    def setup
      @output = StringIO.new
    end

    def test_normal_level_shows_info
      logger = Logger.new(level: :normal, output: @output)
      logger.info('test message')

      assert_match(/test message/, @output.string)
    end

    def test_quiet_level_hides_info
      logger = Logger.new(level: :quiet, output: @output)
      logger.info('test message')

      assert_empty @output.string
    end

    def test_verbose_shows_verbose_messages
      logger = Logger.new(level: :verbose, output: @output)
      logger.verbose('verbose message')

      assert_match(/verbose message/, @output.string)
    end

    def test_normal_hides_verbose_messages
      logger = Logger.new(level: :normal, output: @output)
      logger.verbose('verbose message')

      assert_empty @output.string
    end

    def test_error_always_shows
      logger = Logger.new(level: :quiet, output: @output)
      logger.error('error message')

      assert_match(/✗ error message/, @output.string)
    end

    def test_message_forwarded_with_content
      logger = Logger.new(level: :normal, show_content: true, output: @output)
      osc_msg = OSC::Message.new('/test/address', 1, 2, 3)

      logger.message_forwarded(osc_msg)

      assert_match(%r{→ /test/address}, @output.string)
      assert_match(/\[1, 2, 3\]/, @output.string)
    end

    def test_message_forwarded_without_content
      logger = Logger.new(level: :normal, show_content: false, output: @output)
      osc_msg = OSC::Message.new('/test/address', 1, 2, 3)

      logger.message_forwarded(osc_msg)

      assert_match(/→ Message forwarded/, @output.string)
      refute_match(%r{/test/address}, @output.string)
    end

    def test_message_dropped
      logger = Logger.new(level: :normal, show_content: true, output: @output)
      osc_msg = OSC::Message.new('/test/address')

      logger.message_dropped(osc_msg, 'TCP disconnected')

      assert_match(/✗ DROPPED/, @output.string)
      assert_match(/TCP disconnected/, @output.string)
      assert_match(%r{/test/address}, @output.string)
    end

    def test_timestamp_format
      logger = Logger.new(level: :normal, output: @output)
      logger.info('test')

      assert_match(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/, @output.string)
    end
  end
end
