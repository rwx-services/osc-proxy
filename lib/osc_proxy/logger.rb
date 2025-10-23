# frozen_string_literal: true

module OSCProxy
  class Logger
    LEVELS = {
      quiet: 0,
      normal: 1,
      verbose: 2
    }.freeze

    def initialize(level: :normal, show_content: true, output: $stdout)
      @level = LEVELS[level] || LEVELS[:normal]
      @show_content = show_content
      @output = output
    end

    # Generic log method that routes to appropriate level
    def log(level, message)
      case level
      when :info
        info(message)
      when :error
        error(message)
      when :verbose
        verbose(message)
      when :warn
        warn(message)
      when :success
        success(message)
      else
        info(message) # Default to info
      end
    end

    def info(message)
      return unless @level >= LEVELS[:normal]

      log_with_timestamp(message)
    end

    def verbose(message)
      return unless @level >= LEVELS[:verbose]

      log_with_timestamp(message)
    end

    def error(message)
      log_with_timestamp("✗ #{message}")
    end

    def warn(message)
      return unless @level >= LEVELS[:normal]

      log_with_timestamp("⚠️  #{message}")
    end

    def success(message)
      return unless @level >= LEVELS[:normal]

      log_with_timestamp("✓ #{message}")
    end

    def message_forwarded(osc_message)
      return unless @level >= LEVELS[:normal]

      if @show_content
        args = osc_message.to_a.empty? ? '' : " #{osc_message.to_a.inspect}"
        log_with_timestamp("→ #{osc_message.address}#{args}")
      else
        log_with_timestamp('→ Message forwarded')
      end
    end

    def message_dropped(osc_message, reason)
      if @show_content
        args = osc_message.to_a.empty? ? '' : " #{osc_message.to_a.inspect}"
        error("DROPPED (#{reason}): #{osc_message.address}#{args}")
      else
        error("DROPPED: #{reason}")
      end
    end

    private

    def log_with_timestamp(message)
      timestamp = Time.now.strftime('%Y-%m-%d %H:%M:%S')
      @output.puts "[#{timestamp}] #{message}"
      @output.flush
    end
  end
end
