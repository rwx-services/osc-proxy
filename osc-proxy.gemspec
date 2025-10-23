# frozen_string_literal: true

require_relative 'lib/version'

Gem::Specification.new do |spec|
  spec.name = 'osc-proxy'
  spec.version = OSCProxy::VERSION
  spec.authors = ['Your Name']
  spec.email = ['your.email@example.com']

  spec.summary = 'UDP to TCP proxy for OSC messages with guaranteed in-order delivery'
  spec.description = 'A low-latency proxy that forwards OSC messages from UDP to TCP, ' \
                     'designed for reliable DMX lighting control over WiFi networks.'
  spec.homepage = 'https://github.com/yourusername/osc-proxy'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.0.0'

  spec.metadata['homepage_uri'] = spec.homepage
  spec.metadata['source_code_uri'] = spec.homepage
  spec.metadata['changelog_uri'] = "#{spec.homepage}/blob/main/CHANGELOG.md"

  spec.files = Dir.glob(%w[
                          lib/**/*.rb
                          bin/*
                          config/*.example
                          *.md
                          LICENSE
                        ])
  spec.bindir = 'bin'
  spec.executables = ['osc-proxy']
  spec.require_paths = ['lib']

  spec.add_dependency 'osc-ruby', '~> 1.1'

  spec.metadata['rubygems_mfa_required'] = 'true'
end
