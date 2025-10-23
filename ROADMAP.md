# OSC Proxy Multi-Transmitter Refactoring Roadmap

**Last Updated:** October 23, 2025
**Current Status:** Phase 1 Complete ✅
**Git Commit:** `b96e7a8` - "Add SQLite database foundation for multi-transmitter architecture"

---

## Project Overview

Refactoring OSC Proxy from a single-transmitter (UDP → TCP) architecture to support:
- **Multiple transmitters** (each with unique name/configuration)
- **Multiple receivers per transmitter** (1-to-many routing)
- **Flexible protocols:** Each transmitter can use UDP or TCP input, each receiver can use UDP or TCP output
- **Per-transmitter and aggregate metrics** tracking

### Example Use Cases

**Use Case 1: Single Source, Multiple Destinations**
```
LightKey (UDP :8000)
  → GrandMA3 (TCP :9000)
  → Backup Console (TCP :9000)
  → Media Server (UDP :7000)
```

**Use Case 2: Multiple Sources, Shared Destination**
```
QLab (UDP :53000)        → GrandMA3 (TCP :9000)
TouchOSC (UDP :8001)     → GrandMA3 (TCP :9000)
LightKey (UDP :8000)     → GrandMA3 (TCP :9000)
```

**Use Case 3: Complex Routing**
```
QLab (UDP :53000)
  → GrandMA3 (TCP :9000)
  → Media Server (UDP :7000)

LightKey (UDP :8000)
  → GrandMA3 (TCP :9000)
  → Backup Console (TCP :9001)
```

---

## Architecture Overview

### Current Architecture (Pre-Refactor)
```
YAML Config → Single UDP Listener → Single TCP Sender
```

### New Architecture
```
SQLite Database
  ↓
MultiProxy (orchestrator)
  ├── TransmitterProxy #1 (QLab)
  │     ├── UDPListener (:53000)
  │     ├── TCPConnection → GrandMA3 (:9000)
  │     └── UDPSender → Media Server (:7000)
  │
  └── TransmitterProxy #2 (LightKey)
        ├── UDPListener (:8000)
        ├── TCPConnection → GrandMA3 (:9000)
        └── TCPConnection → Backup (:9001)
```

### Data Flow
```
1. Electron App (Settings UI)
     ↓
2. SQLite Database (transmitters, receivers)
     ↓
3. Ruby MultiProxy reads database
     ↓
4. Creates TransmitterProxy instances
     ↓
5. Each routes messages: Listener → Multiple Receivers
     ↓
6. Metrics sent as JSON to Electron App
     ↓
7. Dashboard displays per-transmitter and aggregate metrics
```

---

## Phase Breakdown

### ✅ Phase 1: Database Foundation (COMPLETE)

**Commit:** `b96e7a8`
**Status:** Complete and tested

#### What Was Built

**Database Schema:**
- `transmitters` table - OSC message sources (UDP/TCP listeners)
- `receivers` table - OSC message destinations (UDP/TCP senders)
- `metrics_history` table - Performance tracking

**Database Manager ([electron-app/lib/database.js](electron-app/lib/database.js)):**
- Full CRUD operations for transmitters and receivers
- Metrics recording and retrieval
- YAML to SQLite migration
- Export/import functionality

**Electron Integration ([electron-app/main.js](electron-app/main.js)):**
- Database initialization on app startup
- 16 IPC handlers for all database operations
- Auto-migration from `config/lightkey.yml`

**Preload API ([electron-app/preload.js](electron-app/preload.js)):**
- All database methods exposed to renderer processes
- `dbGetTransmitters()`, `dbCreateTransmitter()`, etc.

**Testing:**
- Comprehensive test suite ([electron-app/test-database.js](electron-app/test-database.js))
- All tests passing
- Electron app starts successfully
- YAML migration verified

#### Key Files Created
- `electron-app/lib/database.js` (506 lines) - Database manager
- `electron-app/main.js` (698 lines) - Electron main process
- `electron-app/preload.js` (59 lines) - IPC bridge
- `DATABASE_IMPLEMENTATION.md` (279 lines) - Documentation

#### Known Issues
- **IMPORTANT:** Must run with `unset ELECTRON_RUN_AS_NODE` before starting Electron
- Missing tray icon (non-critical)

---

### 🔄 Phase 2: Ruby Proxy Refactoring (NEXT)

**Estimated Effort:** 8-12 hours
**Priority:** HIGH - Core backend functionality

#### Objectives
Transform Ruby proxy from single-path (UDP→TCP) to multi-transmitter architecture with flexible protocol routing.

#### Tasks

**2.1 Create TCP Listener Class** (2-3 hours)
- File: `lib/osc_proxy/tcp_listener.rb`
- Accept incoming TCP connections
- Handle connection lifecycle
- Parse OSC messages from TCP stream
- Mirror API of existing `UDPListener`

**2.2 Create UDP Sender Class** (1-2 hours)
- File: `lib/osc_proxy/udp_sender.rb`
- Send UDP packets to destination
- Handle socket creation/cleanup
- Mirror API of existing `TCPConnection`

**2.3 Build TransmitterProxy Class** (3-4 hours)
- File: `lib/osc_proxy/transmitter_proxy.rb`
- Manage one transmitter (1 listener → N receivers)
- Create listener based on transmitter protocol (UDP/TCP)
- Create multiple receivers based on receiver protocols
- Route incoming messages to all receivers
- Track per-transmitter metrics
- Handle receiver failures gracefully

**2.4 Build MultiProxy Orchestrator** (2-3 hours)
- File: `lib/osc_proxy/multi_proxy.rb`
- Load configuration from SQLite database
- Create TransmitterProxy for each enabled transmitter
- Aggregate metrics across all transmitters
- Output JSON metrics for Electron app
- Handle graceful shutdown

**2.5 Update CLI** (1 hour)
- File: `bin/osc-proxy`
- Add `--database` flag to specify SQLite path
- Default to `~/.config/osc-proxy/proxy.db`
- Maintain backward compatibility with `--config` (YAML)
- Update help text

#### Implementation Notes

**Class Structure:**
```ruby
module OSCProxy
  class MultiProxy
    def initialize(database_path)
      @db = SQLite3::Database.new(database_path)
      @transmitter_proxies = []
      @aggregate_metrics = AggregateMetrics.new
    end

    def start
      load_transmitters_from_db
      @transmitter_proxies.each(&:start)
      output_metrics_loop
    end
  end

  class TransmitterProxy
    def initialize(transmitter_config)
      @transmitter = transmitter_config
      @listener = create_listener
      @receivers = create_receivers
      @metrics = MetricsLogger.new
    end

    def start
      @listener.start
      loop { route_message(@listener.receive) }
    end

    private

    def route_message(data)
      @receivers.each do |receiver|
        receiver.send_data(data) if receiver.connected?
      end
    end
  end
end
```

**Database Integration:**
```ruby
# Load transmitters from SQLite
transmitters = db.execute(<<~SQL)
  SELECT t.*,
         GROUP_CONCAT(r.id) as receiver_ids
  FROM transmitters t
  LEFT JOIN receivers r ON r.transmitter_id = t.id
  WHERE t.enabled = 1
  GROUP BY t.id
SQL

transmitters.each do |t_row|
  config = parse_transmitter_config(t_row)
  @transmitter_proxies << TransmitterProxy.new(config)
end
```

**Metrics Output:**
```ruby
# Output JSON metrics for Electron app
def output_metrics
  metrics = {
    aggregate: @aggregate_metrics.to_h,
    transmitters: @transmitter_proxies.map do |tp|
      {
        id: tp.id,
        name: tp.name,
        rate: tp.metrics.rate,
        latency: tp.metrics.latency,
        total: tp.metrics.total,
        forwarded: tp.metrics.forwarded,
        dropped: tp.metrics.dropped,
        receivers: tp.receivers.map { |r| r.status_hash }
      }
    end
  }
  puts JSON.generate(metrics)
end
```

#### Testing Strategy
1. Unit tests for new listener/sender classes
2. Integration test with 2 transmitters, 3 receivers
3. Failover test (disable one receiver mid-stream)
4. Performance test (1000+ msg/s)
5. Manual testing with Electron app

#### Files to Create/Modify
- **New:**
  - `lib/osc_proxy/tcp_listener.rb`
  - `lib/osc_proxy/udp_sender.rb`
  - `lib/osc_proxy/transmitter_proxy.rb`
  - `lib/osc_proxy/multi_proxy.rb`
  - `test/unit/test_tcp_listener.rb`
  - `test/unit/test_udp_sender.rb`
  - `test/integration/test_multi_proxy.rb`

- **Modified:**
  - `lib/osc_proxy.rb` - Require new classes
  - `bin/osc-proxy` - Add database support
  - `lib/osc_proxy/metrics_logger.rb` - Per-transmitter metrics

#### Dependencies to Add
```ruby
# Gemfile
gem 'sqlite3', '~> 1.6'
```

---

### 📋 Phase 3: Settings UI Redesign

**Estimated Effort:** 6-10 hours
**Priority:** MEDIUM - Required to manage configurations

#### Objectives
Build intuitive UI for managing transmitters and receivers.

#### UI Layout

**Settings Window Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ OSC Proxy - Settings                                    [X] │
├─────────────┬───────────────────────────────────────────────┤
│ Transmitters│ Selected: LightKey                       [✓]  │
│             │                                                │
│ + New       │ ┌──────────────────────────────────────────┐ │
│             │ │ Listener Configuration                   │ │
│ ○ LightKey  │ │   Protocol: [UDP ▾]                      │ │
│ ○ QLab      │ │   Bind Address: [0.0.0.0        ]       │ │
│ ○ TouchOSC  │ │   Port: [8000]                           │ │
│             │ │   Max Message Size: [8192] bytes         │ │
│             │ └──────────────────────────────────────────┘ │
│             │                                                │
│             │ ┌──────────────────────────────────────────┐ │
│             │ │ Receivers                  + Add Receiver│ │
│             │ ├──────────────────────────────────────────┤ │
│             │ │ [✓] GrandMA3                             │ │
│             │ │     Protocol: TCP                        │ │
│             │ │     Host: 127.0.0.1:9000                 │ │
│             │ │     [Edit] [Remove]                      │ │
│             │ ├──────────────────────────────────────────┤ │
│             │ │ [✓] Backup Console                       │ │
│             │ │     Protocol: TCP                        │ │
│             │ │     Host: 10.0.1.11:9000                 │ │
│             │ │     [Edit] [Remove]                      │ │
│             │ └──────────────────────────────────────────┘ │
│             │                                                │
│             │ [Delete Transmitter]                    [Save]│
└─────────────┴───────────────────────────────────────────────┘
```

#### Tasks

**3.1 Redesign HTML Structure** (2 hours)
- File: `electron-app/src/settings.html`
- Add two-column layout (sidebar + main panel)
- Transmitter list sidebar with "+ New" button
- Listener configuration form
- Receiver list with add/edit/delete buttons
- Receiver modal/inline form

**3.2 Update Settings JavaScript** (3-4 hours)
- File: `electron-app/src/js/settings.js`
- Load transmitters on init
- Handle transmitter selection
- Wire up transmitter CRUD operations
- Wire up receiver CRUD operations
- Form validation (port ranges, IP addresses)
- Dirty state tracking
- Confirmation dialogs for delete

**3.3 Add Receiver Modal Component** (1-2 hours)
- Create modal for add/edit receiver
- Protocol selector (UDP/TCP)
- TCP-specific options (keepalive, nodelay, etc.)
- Show/hide advanced options

**3.4 Styling** (1-2 hours)
- Update `electron-app/src/styles/input.css`
- Sidebar styling
- Form layouts
- Button states (disabled, hover)
- Validation error styling

#### Implementation Details

**Transmitter List Component:**
```javascript
class TransmitterList {
  async loadTransmitters() {
    const result = await window.electronAPI.dbGetTransmitters();
    if (result.success) {
      this.transmitters = result.data;
      this.render();
    }
  }

  render() {
    const listHTML = this.transmitters.map(t => `
      <div class="transmitter-item ${t.id === this.selectedId ? 'selected' : ''}"
           data-id="${t.id}"
           onclick="transmitterList.select(${t.id})">
        <span class="status-indicator ${t.enabled ? 'active' : ''}"></span>
        ${t.name}
      </div>
    `).join('');

    document.getElementById('transmitter-list').innerHTML = listHTML;
  }

  async select(id) {
    this.selectedId = id;
    this.render();
    await transmitterEditor.load(id);
  }
}
```

**Transmitter Editor:**
```javascript
class TransmitterEditor {
  async load(transmitterId) {
    const result = await window.electronAPI.dbGetTransmitter(transmitterId);
    if (result.success) {
      this.transmitter = result.data;
      this.populateForm();
      this.loadReceivers();
    }
  }

  populateForm() {
    document.getElementById('tx-name').value = this.transmitter.name;
    document.getElementById('tx-enabled').checked = this.transmitter.enabled;
    document.getElementById('tx-protocol').value = this.transmitter.protocol;
    document.getElementById('tx-bind').value = this.transmitter.bind_address;
    document.getElementById('tx-port').value = this.transmitter.port;
  }

  async save() {
    const data = {
      name: document.getElementById('tx-name').value,
      enabled: document.getElementById('tx-enabled').checked,
      protocol: document.getElementById('tx-protocol').value,
      bind_address: document.getElementById('tx-bind').value,
      port: parseInt(document.getElementById('tx-port').value)
    };

    const result = await window.electronAPI.dbUpdateTransmitter(
      this.transmitter.id,
      data
    );

    if (result.success) {
      this.showNotification('Saved successfully', 'success');
      transmitterList.loadTransmitters();
    }
  }
}
```

**Form Validation:**
```javascript
function validateTransmitterForm(data) {
  const errors = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (!['udp', 'tcp'].includes(data.protocol)) {
    errors.push('Invalid protocol');
  }

  const port = parseInt(data.port);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  // Validate IP address format
  if (!isValidIP(data.bind_address)) {
    errors.push('Invalid bind address');
  }

  return errors;
}
```

#### Testing
- Create transmitter, verify in database
- Edit transmitter, verify changes persist
- Delete transmitter, verify cascade to receivers
- Add receiver to transmitter
- Edit receiver configuration
- Delete receiver
- Validate form inputs (invalid ports, IPs)

---

### 📊 Phase 4: Dashboard Updates

**Estimated Effort:** 4-6 hours
**Priority:** MEDIUM - Visualization layer

#### Objectives
Update dashboard to display per-transmitter and aggregate metrics with filtering.

#### UI Layout

**Dashboard with Filtering:**
```
┌────────────────────────────────────────────────────────────┐
│ ● Connected    Filter: [All Transmitters ▾]        [Stop] │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ AGGREGATE METRICS (All Transmitters)                      │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│ │ Current Rate│  Avg Rate   │  Peak Rate  │   Latency   │ │
│ │  298.5 msg/s│  245.3 msg/s│  512.0 msg/s│    0.38 ms  │ │
│ │ [========Sparkline========================]             │ │
│ └─────────────┴─────────────┴─────────────┴─────────────┘ │
│                                                            │
│ ┌──────────┬──────────┬──────────┬──────────┐            │
│ │ Latency  │  Total   │Forwarded │ Dropped  │            │
│ │  0.38 ms │  15,234  │  15,134  │   100    │            │
│ └──────────┴──────────┴──────────┴──────────┘            │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ TRANSMITTERS                                               │
│                                                            │
│ ┌─ LightKey ──────────────────────────────────────────┐   │
│ │ ● Active           UDP :8000 → 2 receivers          │   │
│ │ Rate: 192.3 msg/s     Latency: 0.35ms               │   │
│ │   → GrandMA3 (TCP :9000)          [Connected]       │   │
│ │   → Backup Console (TCP :9001)    [Connected]       │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌─ QLab ──────────────────────────────────────────────┐   │
│ │ ● Active           UDP :53000 → 2 receivers         │   │
│ │ Rate: 106.2 msg/s     Latency: 0.42ms               │   │
│ │   → GrandMA3 (TCP :9000)          [Connected]       │   │
│ │   → Media Server (UDP :7000)      [Connected]       │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌─ TouchOSC ──────────────────────────────────────────┐   │
│ │ ⚠ Disconnected     UDP :8001 → 1 receiver           │   │
│ │ Rate: 0.0 msg/s       Latency: --                   │   │
│ │   → GrandMA3 (TCP :9000)          [Disconnected]    │   │
│ └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

#### Tasks

**4.1 Add Filter Dropdown** (1 hour)
- File: `electron-app/src/index.html`
- Add dropdown in header
- Options: "All Transmitters", "Aggregate Only", individual transmitters
- Wire up change event

**4.2 Add Transmitter Cards** (2 hours)
- Create expandable/collapsible transmitter cards
- Show per-transmitter metrics
- List receivers with connection status
- Color-code status indicators

**4.3 Update Renderer Logic** (2-3 hours)
- File: `electron-app/src/js/renderer.js`
- Parse multi-transmitter JSON metrics
- Handle filtered view (show only selected transmitter)
- Update aggregate metrics calculation
- Update sparkline for filtered data
- Handle receiver status updates

**4.4 Update Main Process** (1 hour)
- File: `electron-app/main.js`
- Modify `startProxy()` to pass database path to Ruby
- Parse multi-transmitter JSON output from Ruby
- Route metrics by transmitter ID to renderer

#### Implementation Details

**Metrics Data Structure:**
```javascript
// From Ruby proxy (JSON output)
{
  "timestamp": "2025-10-23T12:34:56Z",
  "aggregate": {
    "rate": 298.5,
    "avgRate": 245.3,
    "peakRate": 512.0,
    "latency": 0.38,
    "total": 15234,
    "forwarded": 15134,
    "dropped": 100,
    "lossPct": 0.66
  },
  "transmitters": [
    {
      "id": 1,
      "name": "LightKey",
      "enabled": true,
      "rate": 192.3,
      "avgRate": 180.5,
      "peakRate": 350.0,
      "latency": 0.35,
      "total": 9500,
      "forwarded": 9450,
      "dropped": 50,
      "receivers": [
        {
          "id": 1,
          "name": "GrandMA3",
          "status": "connected",
          "forwarded": 9450,
          "latency": 0.35
        },
        {
          "id": 2,
          "name": "Backup Console",
          "status": "connected",
          "forwarded": 9450,
          "latency": 0.38
        }
      ]
    },
    {
      "id": 2,
      "name": "QLab",
      "enabled": true,
      "rate": 106.2,
      "avgRate": 95.8,
      "peakRate": 200.0,
      "latency": 0.42,
      "total": 5734,
      "forwarded": 5684,
      "dropped": 50,
      "receivers": [...]
    }
  ]
}
```

**Filter Implementation:**
```javascript
class MetricsFilter {
  constructor() {
    this.selectedTransmitterId = null; // null = all
  }

  updateMetrics(metricsData) {
    if (this.selectedTransmitterId === null) {
      // Show aggregate + all transmitters
      this.displayAggregate(metricsData.aggregate);
      this.displayAllTransmitters(metricsData.transmitters);
    } else if (this.selectedTransmitterId === 'aggregate') {
      // Show only aggregate
      this.displayAggregate(metricsData.aggregate);
      this.hideTransmitters();
    } else {
      // Show only selected transmitter
      const tx = metricsData.transmitters.find(
        t => t.id === this.selectedTransmitterId
      );
      this.displayTransmitter(tx);
      this.hideAggregate();
    }
  }
}
```

**Transmitter Card Component:**
```javascript
function renderTransmitterCard(transmitter) {
  const statusClass = transmitter.enabled ? 'status-active' : 'status-idle';
  const statusText = transmitter.enabled ? 'Active' : 'Disabled';

  return `
    <div class="transmitter-card ${statusClass}" data-id="${transmitter.id}">
      <div class="card-header">
        <h3>${transmitter.name}</h3>
        <span class="status-badge">${statusText}</span>
      </div>

      <div class="card-metrics">
        <div class="metric">
          <span class="label">Rate:</span>
          <span class="value">${transmitter.rate.toFixed(1)} msg/s</span>
        </div>
        <div class="metric">
          <span class="label">Latency:</span>
          <span class="value">${transmitter.latency.toFixed(2)} ms</span>
        </div>
      </div>

      <div class="receivers-list">
        ${transmitter.receivers.map(renderReceiver).join('')}
      </div>
    </div>
  `;
}

function renderReceiver(receiver) {
  const statusIcon = receiver.status === 'connected' ? '✓' : '⚠';
  return `
    <div class="receiver-item ${receiver.status}">
      <span class="status-icon">${statusIcon}</span>
      ${receiver.name} (${receiver.protocol.toUpperCase()} :${receiver.port})
      <span class="receiver-status">[${receiver.status}]</span>
    </div>
  `;
}
```

#### Testing
- Verify aggregate metrics calculation
- Test filter: All / Aggregate / Individual transmitters
- Verify per-transmitter sparklines
- Test receiver status display (connected/disconnected)
- Verify metrics update in real-time

---

### ✅ Phase 5: Testing & Polish

**Estimated Effort:** 4-6 hours
**Priority:** HIGH - Quality assurance

#### Objectives
Comprehensive testing and final polish before release.

#### Tasks

**5.1 End-to-End Testing** (2 hours)
- Create 3 transmitters with different configurations
- Start proxy, verify all listen on correct ports
- Send OSC messages to each transmitter
- Verify routing to all receivers
- Check metrics accuracy
- Test enable/disable toggle

**5.2 Failover Testing** (1 hour)
- Disconnect one receiver mid-stream
- Verify other receivers continue working
- Verify metrics show dropped messages
- Reconnect receiver, verify recovery

**5.3 Performance Testing** (1 hour)
- Send 1000+ msg/s to multiple transmitters
- Monitor CPU/memory usage
- Verify no message loss at high rates
- Test with large OSC messages (4KB+)

**5.4 UI Polish** (1-2 hours)
- Add loading states
- Improve error messages
- Add tooltips/help text
- Keyboard shortcuts (Cmd+S to save, etc.)
- Smooth animations
- Responsive design testing

**5.5 Documentation** (1 hour)
- Update [README.md](README.md) with new features
- Add multi-transmitter examples
- Update screenshots
- Document migration from YAML
- Create troubleshooting guide

#### Test Scenarios

**Scenario 1: Basic Multi-Transmitter**
```
1. Create LightKey transmitter (UDP :8000)
2. Add receiver: GrandMA3 (TCP :9000)
3. Create QLab transmitter (UDP :53000)
4. Add receiver: GrandMA3 (TCP :9000)
5. Start proxy
6. Send messages to both ports
7. Verify routing and metrics
```

**Scenario 2: Receiver Failover**
```
1. Create transmitter with 2 receivers
2. Start proxy
3. Send messages
4. Stop one receiver
5. Verify other receiver continues
6. Check dropped message count
7. Restart failed receiver
8. Verify recovery
```

**Scenario 3: Protocol Variety**
```
1. Create UDP listener → TCP receiver
2. Create UDP listener → UDP receiver
3. Create TCP listener → TCP receiver
4. Create TCP listener → UDP receiver
5. Test all combinations
```

#### Known Issues to Address
- Missing tray icon (create or remove tray functionality)
- ELECTRON_RUN_AS_NODE environment variable issue (document)
- Database path configuration (default vs. custom)
- Metrics history cleanup (implement auto-cleanup)

---

## Decision Points

### Question 1: Implementation Order
**Options:**
- **Option A:** Complete backend first (Phase 2 → 3 → 4 → 5)
- **Option B:** Iterative (Phase 2a [UDP only] → 3 → 4 → 2b [add TCP] → 5)

**Recommendation:** Option A - Complete backend first. Building UI before backend is functional leads to frustration and rework.

### Question 2: Protocol Priority
**Options:**
- **Option A:** Implement all protocols (UDP listener, TCP listener, UDP sender, TCP sender)
- **Option B:** Start with UDP listener only, add others later
- **Option C:** Focus on user's specific use case first

**Recommendation:** Option A - Implement all protocols. The architecture is the same for all, and partial implementation leaves features missing.

### Question 3: Backward Compatibility
**Options:**
- **Option A:** Keep YAML support, auto-migrate on first run (DONE)
- **Option B:** Remove YAML, require manual migration
- **Option C:** Support both YAML and database permanently

**Recommendation:** Option A (already implemented). Auto-migration on first run provides best UX.

### Question 4: Database Location
**Options:**
- **Option A:** User data directory (current: `~/Library/Application Support/osc-proxy-app/proxy.db`)
- **Option B:** Project directory (e.g., `./config/proxy.db`)
- **Option C:** Let user choose location

**Recommendation:** Option A for Electron app, Option C for CLI (via `--database` flag).

---

## Technical Considerations

### Ruby Database Access
**Options:**
- **Option A:** Use `sqlite3` gem directly in Ruby
- **Option B:** Ruby reads JSON export from database
- **Option C:** Electron app generates Ruby config files

**Recommendation:** Option A - Direct SQLite access. Cleanest architecture, no intermediate formats.

**Implementation:**
```ruby
# Gemfile
gem 'sqlite3', '~> 1.6'

# Load from database
db = SQLite3::Database.new(database_path)
db.results_as_hash = true

transmitters = db.execute(<<~SQL)
  SELECT * FROM transmitters WHERE enabled = 1
SQL
```

### Metrics Output Format
**Current:** Ruby outputs JSON to stdout
**Electron:** Parses stdout via spawned process

**Works well, no changes needed.**

### Error Handling
**Strategy:**
- Transmitter failure: Log error, mark as disconnected, continue other transmitters
- Receiver failure: Log error, mark as disconnected, continue other receivers
- Database errors: Fatal, exit with error message
- Invalid config: Show validation errors in UI, prevent save

### Performance Optimization
**Targets:**
- Support 1000+ msg/s per transmitter
- Sub-millisecond latency for message routing
- Minimal CPU usage (< 5% per transmitter at 100 msg/s)
- Memory efficient (< 50MB total for 10 transmitters)

**Optimizations:**
- Use threads for each transmitter (parallel processing)
- Minimize database queries (load once on startup)
- Buffer metrics (write to DB every 5 seconds, not every message)
- Use binary protocol for internal message passing

---

## Dependencies

### Ruby Dependencies
```ruby
# Gemfile (add)
gem 'sqlite3', '~> 1.6'  # SQLite database access
```

### Node.js Dependencies
Already installed:
- `better-sqlite3` - Fast SQLite access from Node.js
- `electron` - Desktop app framework
- `js-yaml` - YAML parsing (for migration)

---

## File Manifest

### Phase 1 (Complete)
```
DATABASE_IMPLEMENTATION.md          # Phase 1 documentation
electron-app/
  lib/
    database.js                     # SQLite database manager
  main.js                           # Electron main process
  preload.js                        # IPC bridge
  test-database.js                  # Database tests
  src/
    index.html                      # Dashboard (existing)
    settings.html                   # Settings (existing)
    activity-log.html               # Activity log (existing)
    js/
      renderer.js                   # Dashboard logic (existing)
      settings.js                   # Settings logic (existing)
      activity-log.js               # Activity log logic (existing)
lib/
  osc_proxy.rb                      # Modified: JSON mode support
  osc_proxy/
    config.rb                       # Modified: --json flag
    metrics_logger.rb               # Modified: JSON output
```

### Phase 2 (To Create)
```
lib/
  osc_proxy/
    tcp_listener.rb                 # NEW: TCP listener class
    udp_sender.rb                   # NEW: UDP sender class
    transmitter_proxy.rb            # NEW: Single transmitter manager
    multi_proxy.rb                  # NEW: Multi-transmitter orchestrator
test/
  unit/
    test_tcp_listener.rb            # NEW: Tests
    test_udp_sender.rb              # NEW: Tests
    test_transmitter_proxy.rb       # NEW: Tests
  integration/
    test_multi_proxy.rb             # NEW: Integration tests
bin/
  osc-proxy                         # MODIFY: Add --database flag
Gemfile                             # MODIFY: Add sqlite3 gem
```

### Phase 3 (To Modify)
```
electron-app/
  src/
    settings.html                   # REDESIGN: Transmitter list UI
    js/
      settings.js                   # REWRITE: Database CRUD operations
    styles/
      input.css                     # ADD: New component styles
```

### Phase 4 (To Modify)
```
electron-app/
  src/
    index.html                      # ADD: Filter dropdown, transmitter cards
    js/
      renderer.js                   # MODIFY: Multi-transmitter metrics
  main.js                           # MODIFY: Pass database path to Ruby
```

---

## Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|----------------|--------------|
| Phase 1 | **COMPLETE** | None |
| Phase 2 | 8-12 hours | Phase 1 |
| Phase 3 | 6-10 hours | Phase 2 |
| Phase 4 | 4-6 hours | Phase 2, 3 |
| Phase 5 | 4-6 hours | Phase 2, 3, 4 |
| **Total** | **22-34 hours** | Sequential |

**Note:** Times assume focused work. Real-world timeline may be longer due to:
- Testing/debugging
- Learning curve
- Design decisions/rework
- Performance optimization

---

## Success Criteria

### Phase 2 Complete When:
- [ ] Ruby proxy can load transmitters from SQLite database
- [ ] Multiple transmitters run simultaneously
- [ ] Messages route correctly (1 listener → N receivers)
- [ ] Per-transmitter metrics output as JSON
- [ ] All unit tests pass
- [ ] Integration test with 2 transmitters, 3 receivers passes

### Phase 3 Complete When:
- [ ] Can create/edit/delete transmitters via UI
- [ ] Can add/edit/delete receivers via UI
- [ ] Form validation works
- [ ] Changes persist to database
- [ ] Electron app can manage full configuration

### Phase 4 Complete When:
- [ ] Dashboard shows per-transmitter metrics
- [ ] Filter dropdown works
- [ ] Transmitter cards display correctly
- [ ] Receiver status shows in real-time
- [ ] Aggregate metrics calculate correctly

### Phase 5 Complete When:
- [ ] All test scenarios pass
- [ ] No data loss at 1000+ msg/s
- [ ] Failover works correctly
- [ ] Documentation updated
- [ ] README has multi-transmitter examples

---

## Rollback Plan

If issues arise, can rollback to single-transmitter mode:
1. Git revert to commit before Phase 2
2. Use YAML configuration
3. Original `lib/osc_proxy.rb` still works

Database is additive, doesn't break existing functionality.

---

## Questions for User

Before starting Phase 2:

1. **Primary Use Case:** What's your main use case?
   - Single source → multiple destinations?
   - Multiple sources → shared destination?
   - Complex routing?

2. **Protocol Priority:** Which protocols do you need first?
   - UDP listener (like current setup)?
   - TCP listener?
   - UDP sender?
   - All of the above?

3. **Testing:** Do you have OSC-capable software to test with?
   - What software will send OSC messages?
   - What software will receive?
   - Network topology (localhost, LAN, WiFi)?

4. **Timeline:** Any deadlines or milestones?

---

## Resources

- **SQLite3 Ruby Gem:** https://github.com/sparklemotion/sqlite3-ruby
- **Electron IPC:** https://www.electronjs.org/docs/latest/tutorial/ipc
- **OSC Protocol:** http://opensoundcontrol.org/spec-1_0
- **Better SQLite3:** https://github.com/WiseLibs/better-sqlite3

---

**Next Session:** Start Phase 2 - Ruby Proxy Refactoring

**Quick Start:**
```bash
# Resume work
cd /Users/blueninja/projects/osc-proxy
git log -1  # Verify at commit b96e7a8
cat ROADMAP.md  # Review this document
```
