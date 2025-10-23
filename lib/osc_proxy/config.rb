# frozen_string_literal: true

require 'yaml'
require 'optparse'

module OSCProxy
  class Config
    DEFAULT_CONFIG = {
      'udp' => {
        'port' => 8000,
        'bind' => '0.0.0.0',
        'max_message_size' => 8192
      },
      'tcp' => {
        'host' => '127.0.0.1',
        'port' => 9000,
        'keepalive' => true,
        'keepalive_interval' => 10,
        'nodelay' => true,
        'connect_timeout' => 5
      },
      'reconnect' => {
        'max_attempts' => -1,
        'initial_delay' => 0.1,
        'max_delay' => 5.0,
        'backoff_multiplier' => 2.0
      },
      'logging' => {
        'level' => 'normal',
        'show_message_content' => true
      }
    }.freeze

    attr_reader :config

    def initialize(config_hash = {})
      @config = deep_merge(DEFAULT_CONFIG, config_hash)
    end

    def self.from_file(file_path)
      config_hash = YAML.load_file(file_path)
      new(config_hash)
    rescue Errno::ENOENT
      raise "Configuration file not found: #{file_path}"
    rescue Psych::SyntaxError => e
      raise "Invalid YAML in configuration file: #{e.message}"
    end

    def self.from_cli(args = ARGV)
      options = {}
      config_file = nil

      parser = OptionParser.new do |opts|
        opts.banner = 'Usage: osc-proxy [options]'

        opts.on('-c', '--config FILE', 'Configuration file path') do |file|
          config_file = file
        end

        opts.on('-u', '--udp-port PORT', Integer, 'UDP listen port') do |port|
          options['udp'] ||= {}
          options['udp']['port'] = port
        end

        opts.on('-b', '--udp-bind ADDRESS', 'UDP bind address') do |addr|
          options['udp'] ||= {}
          options['udp']['bind'] = addr
        end

        opts.on('-H', '--tcp-host HOST', 'TCP destination host') do |host|
          options['tcp'] ||= {}
          options['tcp']['host'] = host
        end

        opts.on('-p', '--tcp-port PORT', Integer, 'TCP destination port') do |port|
          options['tcp'] ||= {}
          options['tcp']['port'] = port
        end

        opts.on('-l', '--log-level LEVEL', %w[quiet normal verbose], 'Log level (quiet/normal/verbose)') do |level|
          options['logging'] ||= {}
          options['logging']['level'] = level
        end

        opts.on('-v', '--version', 'Show version') do
          puts "osc-proxy version #{OSCProxy::VERSION}"
          exit
        end

        opts.on('-h', '--help', 'Show this help message') do
          puts opts
          exit
        end
      end

      parser.parse!(args)

      base_config = config_file ? from_file(config_file) : new
      base_config.merge(options)
    end

    def merge(other_config)
      Config.new(deep_merge(@config, other_config))
    end

    def udp_port
      @config.dig('udp', 'port')
    end

    def udp_bind
      @config.dig('udp', 'bind')
    end

    def udp_max_message_size
      @config.dig('udp', 'max_message_size')
    end

    def tcp_host
      @config.dig('tcp', 'host')
    end

    def tcp_port
      @config.dig('tcp', 'port')
    end

    def tcp_keepalive?
      @config.dig('tcp', 'keepalive')
    end

    def tcp_keepalive_interval
      @config.dig('tcp', 'keepalive_interval')
    end

    def tcp_nodelay?
      @config.dig('tcp', 'nodelay')
    end

    def tcp_connect_timeout
      @config.dig('tcp', 'connect_timeout')
    end

    def reconnect_max_attempts
      @config.dig('reconnect', 'max_attempts')
    end

    def reconnect_initial_delay
      @config.dig('reconnect', 'initial_delay')
    end

    def reconnect_max_delay
      @config.dig('reconnect', 'max_delay')
    end

    def reconnect_backoff_multiplier
      @config.dig('reconnect', 'backoff_multiplier')
    end

    def log_level
      @config.dig('logging', 'level').to_sym
    end

    def show_message_content?
      @config.dig('logging', 'show_message_content')
    end

    private

    def deep_merge(hash1, hash2)
      hash1.merge(hash2) do |_key, old_val, new_val|
        if old_val.is_a?(Hash) && new_val.is_a?(Hash)
          deep_merge(old_val, new_val)
        else
          new_val
        end
      end
    end
  end
end
