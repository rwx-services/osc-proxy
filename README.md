# OSC Proxy

A low-latency UDP-to-TCP proxy for OSC (Open Sound Control) messages, designed for reliable DMX lighting control over WiFi networks.

## Features

- **Guaranteed In-Order Delivery**: Uses TCP to ensure OSC messages arrive in the correct order
- **WiFi-Optimized**: Persistent TCP connections with keepalive and automatic reconnection
- **Low Latency**: TCP_NODELAY enabled, optimized for 5-10 messages/second
- **Real-Time Logging**: See forwarded messages with OSC addresses and arguments
- **Graceful Error Handling**: Drops messages during disconnects to prevent timing issues
- **Highly Configurable**: YAML config files with CLI overrides
- **Well Tested**: Comprehensive unit and integration tests

## Use Case

This proxy is designed for live lighting control scenarios where:
- Audio playback software sends OSC messages over UDP
- DMX lighting system receives commands over TCP
- Sequential cue ordering is critical (e.g., "next cue" commands)
- Connection is over WiFi with potential packet loss/reordering

## Requirements

- Ruby >= 3.0.0
- Bundler

## Installation

### From Source

```bash
git clone https://github.com/yourusername/osc-proxy.git
cd osc-proxy
bundle install
```

### As a Gem (future)

```bash
gem install osc-proxy
```

## Quick Start

### 1. Create Configuration File

```bash
cp config/osc_proxy.yml.example config/osc_proxy.yml
```

Edit `config/osc_proxy.yml`:

```yaml
udp:
  port: 8000                    # Port to listen for OSC messages
  bind: "0.0.0.0"              # Listen on all interfaces

tcp:
  host: "192.168.1.100"        # IP of your DMX/lighting system
  port: 9000                    # TCP port of your DMX/lighting system
  keepalive: true
  nodelay: true

logging:
  level: "normal"
  show_message_content: true
```

### 2. Run the Proxy

```bash
bin/osc-proxy --config config/osc_proxy.yml
```

### 3. Send Test OSC Message

```bash
# Using oscsend (from liblo-tools package)
oscsend localhost 8000 /cue/fire is 1 "next"
```

## Usage

### Command-Line Options

```bash
# Using config file
bin/osc-proxy --config config/osc_proxy.yml

# Using CLI arguments
bin/osc-proxy --udp-port 8000 --tcp-host 192.168.1.100 --tcp-port 9000

# Override config file settings
bin/osc-proxy --config config.yml --tcp-host 10.0.0.50

# Show help
bin/osc-proxy -h
# or
bin/osc-proxy --help

# Show version
bin/osc-proxy -v
# or
bin/osc-proxy --version
```

### Configuration Options

#### UDP Settings

- `port`: UDP port to listen on (default: 8000)
- `bind`: Interface to bind to (default: "0.0.0.0")
- `max_message_size`: Maximum OSC message size in bytes (default: 8192)

#### TCP Settings

- `host`: Destination IP address (default: "127.0.0.1")
- `port`: Destination TCP port (default: 9000)
- `keepalive`: Enable TCP keepalive (default: true)
- `keepalive_interval`: Keepalive interval in seconds (default: 10)
- `nodelay`: Disable Nagle's algorithm for lower latency (default: true)
- `connect_timeout`: Connection timeout in seconds (default: 5)

#### Reconnection Strategy

- `max_attempts`: Maximum reconnection attempts, -1 for infinite (default: -1)
- `initial_delay`: Initial delay before first reconnect (default: 0.1)
- `max_delay`: Maximum delay between attempts (default: 5.0)
- `backoff_multiplier`: Exponential backoff multiplier (default: 2.0)

#### Logging

- `level`: Log verbosity - "quiet", "normal", or "verbose" (default: "normal")
- `show_message_content`: Show OSC addresses and arguments (default: true)

## Example Output

```
[2025-10-22 14:32:01] Starting OSC Proxy...
[2025-10-22 14:32:01] UDP: 0.0.0.0:8000 -> TCP: 192.168.1.100:9000
[2025-10-22 14:32:01] ✓ UDP listener started on 0.0.0.0:8000
[2025-10-22 14:32:01] ✓ Connected to 192.168.1.100:9000
[2025-10-22 14:32:01] ✓ Proxy running. Press Ctrl+C to stop.
[2025-10-22 14:32:03] → /cue/fire [1, "next"]
[2025-10-22 14:32:05] → /dmx/intensity [1, 255]
[2025-10-22 14:32:07] ⚠️  TCP connection lost: Broken pipe
[2025-10-22 14:32:07] ✗ DROPPED (TCP disconnected): /cue/fire [2, "next"]
[2025-10-22 14:32:07] ✓ Connected to 192.168.1.100:9000
[2025-10-22 14:32:09] → /cue/fire [3, "next"]
```

## Development

### Running Tests

```bash
# Run all tests
bundle exec rake test

# Run specific test file
bundle exec ruby test/unit/test_config.rb

# Run integration tests
bundle exec ruby test/integration/test_proxy.rb
```

### Running Rubocop

```bash
bundle exec rake rubocop

# Auto-fix issues
bundle exec rubocop -a
```

### Running Tests and Linter

```bash
bundle exec rake  # Runs both test and rubocop
```

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Audio Software │  UDP    │   OSC Proxy      │  TCP    │  DMX Lighting   │
│  (e.g., QLab)   │────────▶│                  │────────▶│     System      │
│                 │  :8000  │  • Parse OSC     │  :9000  │                 │
│                 │         │  • Forward Data  │         │                 │
│                 │         │  • Auto-Reconnect│         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

### Key Components

- **UDPListener**: Receives OSC messages on UDP port
- **TCPConnection**: Manages persistent TCP connection with keepalive and reconnection
- **Logger**: Formats and outputs OSC message details in real-time
- **Config**: Handles YAML configuration and CLI argument parsing
- **Proxy**: Orchestrates all components and message forwarding

## Why TCP for Lighting Control?

While OSC commonly uses UDP, this proxy uses TCP for the following reasons:

1. **Ordered Delivery**: Sequential "next cue" commands must arrive in order
2. **Reliability**: Critical lighting cues cannot be dropped
3. **WiFi Resilience**: TCP handles packet reordering from WiFi retransmissions
4. **Error Detection**: TCP ensures data integrity

### Message Handling During Disconnects

The proxy **drops messages** when TCP is disconnected rather than buffering them. This is intentional:

- **Time-sensitive cues**: Buffering old cues would desync the show
- **State management**: Lighting state may have changed during disconnect
- **Operator awareness**: Dropped messages are logged prominently for manual intervention

## Troubleshooting

### Proxy won't start

```bash
# Check if port is already in use
lsof -i :8000

# Try a different port
bin/osc-proxy --udp-port 8001
```

### Messages not forwarding

1. Check TCP destination is reachable:
   ```bash
   nc -zv 192.168.1.100 9000
   ```

2. Enable verbose logging:
   ```bash
   bin/osc-proxy --config config.yml --log-level verbose
   ```

3. Test with known-good OSC sender:
   ```bash
   oscsend localhost 8000 /test i 123
   ```

### High latency

- Ensure `tcp.nodelay` is set to `true` in config
- Check WiFi signal strength and interference
- Reduce reconnection delays if experiencing frequent disconnects

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and rubocop (`bundle exec rake`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [osc-ruby](https://github.com/aberant/osc-ruby) for OSC message parsing
- Designed for live theatrical lighting control workflows
- Inspired by the needs of lighting designers and technicians

## Support

For issues, questions, or contributions, please open an issue on GitHub.
