# OSC Proxy - Quick Start Guide

**For resuming work in a new session**

---

## Current Status

✅ **Phase 1 Complete** - Database foundation implemented and tested
📍 **Next:** Phase 2 - Ruby Proxy Refactoring

**Current Commit:** `b96e7a8` - "Add SQLite database foundation for multi-transmitter architecture"

---

## Quick Context

### What We're Building
Refactoring OSC Proxy to support:
- Multiple transmitters (OSC message sources)
- Multiple receivers per transmitter (1-to-many routing)
- Flexible protocols (UDP/TCP for both input and output)
- SQLite database for configuration
- Electron app for management

### Architecture
```
Old: YAML → Single UDP Listener → Single TCP Sender

New: SQLite DB → MultiProxy → Multiple TransmitterProxies
     Each TransmitterProxy: 1 Listener → N Receivers
```

---

## Key Files

### Documentation
- **[ROADMAP.md](ROADMAP.md)** - Complete project plan (read this!)
- **[DATABASE_IMPLEMENTATION.md](DATABASE_IMPLEMENTATION.md)** - Phase 1 details
- **This file** - Quick reference

### Database Layer (Phase 1 ✅)
- `electron-app/lib/database.js` - SQLite manager with CRUD operations
- `electron-app/main.js` - Electron main process with IPC handlers
- `electron-app/preload.js` - API bridge to renderer
- `electron-app/test-database.js` - Comprehensive tests

### Ruby Proxy (Current - Single Transmitter)
- `lib/osc_proxy.rb` - Main proxy class
- `lib/osc_proxy/udp_listener.rb` - UDP listener
- `lib/osc_proxy/tcp_connection.rb` - TCP sender
- `lib/osc_proxy/metrics_logger.rb` - Metrics tracking
- `bin/osc-proxy` - CLI entry point

### Electron UI (Existing)
- `electron-app/src/index.html` - Dashboard
- `electron-app/src/settings.html` - Settings (needs redesign)
- `electron-app/src/js/renderer.js` - Dashboard logic
- `electron-app/src/js/settings.js` - Settings logic (needs rewrite)

---

## Running the App

### Electron GUI
```bash
cd electron-app
unset ELECTRON_RUN_AS_NODE  # IMPORTANT!
npm start
```

**⚠️ Important:** Must unset `ELECTRON_RUN_AS_NODE` or you'll get errors like:
```
TypeError: Cannot read properties of undefined (reading 'handle')
```

### Ruby Proxy (Current Version)
```bash
# With YAML config
ruby bin/osc-proxy -c config/lightkey.yml

# With JSON output for Electron
ruby bin/osc-proxy -c config/lightkey.yml --json
```

### Running Tests
```bash
# Ruby tests
rake test

# Database tests
cd electron-app
node test-database.js
```

---

## Database Schema

**Transmitters** (OSC message sources):
- id, name, enabled, protocol (udp/tcp), bind_address, port, max_message_size

**Receivers** (OSC message destinations):
- id, transmitter_id, name, enabled, protocol (udp/tcp), host, port
- keepalive, keepalive_interval, nodelay, connect_timeout

**Metrics History**:
- id, transmitter_id, timestamp, rate, avg_rate, peak_rate, latency
- total, forwarded, dropped, loss_pct

**Location:** `~/Library/Application Support/osc-proxy-app/proxy.db`

---

## Common Commands

### Git
```bash
# Check status
git log -1
git status

# View Phase 1 commit
git show b96e7a8

# View file changes
git diff lib/osc_proxy.rb
```

### Database
```bash
# Test database operations
cd electron-app
node test-database.js

# View current database
sqlite3 ~/Library/Application\ Support/osc-proxy-app/proxy.db
> .tables
> SELECT * FROM transmitters;
> SELECT * FROM receivers;
> .quit
```

### Development
```bash
# Install Ruby dependencies
bundle install

# Install Node dependencies
cd electron-app
npm install

# Rebuild native modules (if needed)
cd electron-app
unset ELECTRON_RUN_AS_NODE
npx @electron/rebuild
```

---

## Phase 2 Next Steps

**Goal:** Build multi-transmitter Ruby proxy

**Files to Create:**
1. `lib/osc_proxy/tcp_listener.rb` - TCP listener (mirror UDPListener API)
2. `lib/osc_proxy/udp_sender.rb` - UDP sender (mirror TCPConnection API)
3. `lib/osc_proxy/transmitter_proxy.rb` - Manages 1 transmitter
4. `lib/osc_proxy/multi_proxy.rb` - Orchestrates multiple transmitters

**Files to Modify:**
1. `bin/osc-proxy` - Add `--database` flag
2. `Gemfile` - Add `gem 'sqlite3', '~> 1.6'`

**See [ROADMAP.md](ROADMAP.md) Phase 2 for detailed implementation plan.**

---

## Key Decisions Made

### Database
- ✅ SQLite with better-sqlite3 (Node) and sqlite3 gem (Ruby)
- ✅ Auto-migrate from YAML on first run
- ✅ Store in user data directory

### Architecture
- ✅ One TransmitterProxy per transmitter
- ✅ Each TransmitterProxy manages N receivers
- ✅ Graceful failover (one receiver fails, others continue)
- ✅ JSON metrics output for Electron app

### UI
- ⏳ Settings: Sidebar with transmitter list + editor panel
- ⏳ Dashboard: Filter dropdown + per-transmitter cards
- ⏳ Keep existing activity log

---

## Troubleshooting

### Electron won't start
```bash
# Check for ELECTRON_RUN_AS_NODE
env | grep ELECTRON

# If set, unset it
unset ELECTRON_RUN_AS_NODE

# Rebuild native modules
cd electron-app
npx @electron/rebuild
```

### Database errors
```bash
# Check database exists
ls -la ~/Library/Application\ Support/osc-proxy-app/

# Reset database (CAUTION: deletes all data)
rm ~/Library/Application\ Support/osc-proxy-app/proxy.db

# Run migration again
cd electron-app
unset ELECTRON_RUN_AS_NODE
npm start
```

### Ruby tests failing
```bash
# Check Ruby version
ruby --version  # Should be 3.x

# Reinstall dependencies
bundle install

# Run specific test
ruby test/unit/test_config.rb
```

---

## Example Configurations

### Single Source, Multiple Destinations
```javascript
// Transmitter: LightKey
{
  name: "LightKey",
  protocol: "udp",
  bind_address: "0.0.0.0",
  port: 8000,
  receivers: [
    { name: "GrandMA3", protocol: "tcp", host: "127.0.0.1", port: 9000 },
    { name: "Backup", protocol: "tcp", host: "10.0.1.11", port: 9000 },
    { name: "MediaServer", protocol: "udp", host: "10.0.2.5", port: 7000 }
  ]
}
```

### Multiple Sources, Shared Destination
```javascript
// Transmitter 1: QLab
{
  name: "QLab",
  protocol: "udp",
  port: 53000,
  receivers: [
    { name: "GrandMA3", protocol: "tcp", host: "127.0.0.1", port: 9000 }
  ]
}

// Transmitter 2: TouchOSC
{
  name: "TouchOSC",
  protocol: "udp",
  port: 8001,
  receivers: [
    { name: "GrandMA3", protocol: "tcp", host: "127.0.0.1", port: 9000 }
  ]
}

// Transmitter 3: LightKey
{
  name: "LightKey",
  protocol: "udp",
  port: 8000,
  receivers: [
    { name: "GrandMA3", protocol: "tcp", host: "127.0.0.1", port: 9000 }
  ]
}
```

---

## Resources

- **Project Roadmap:** [ROADMAP.md](ROADMAP.md)
- **Phase 1 Docs:** [DATABASE_IMPLEMENTATION.md](DATABASE_IMPLEMENTATION.md)
- **Main README:** [README.md](README.md)
- **Electron App README:** [electron-app/README.md](electron-app/README.md)

---

## Questions to Answer Before Phase 2

1. **Primary Use Case:** What's your main routing pattern?
   - Single source → multiple destinations
   - Multiple sources → shared destination
   - Complex routing

2. **Protocol Needs:** Which protocols do you need?
   - UDP listener ✅ (have already)
   - TCP listener ⏳ (need to build)
   - UDP sender ⏳ (need to build)
   - TCP sender ✅ (have already)

3. **Testing Setup:** What OSC software will you test with?
   - Sending from: _______________
   - Receiving on: _______________
   - Network: localhost / LAN / WiFi

---

**Ready to start Phase 2?** Open [ROADMAP.md](ROADMAP.md) and jump to "Phase 2: Ruby Proxy Refactoring"
