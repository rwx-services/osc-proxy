#!/usr/bin/env node

/**
 * Test script for database operations
 * Run with: node test-database.js
 */

const ProxyDatabase = require('./lib/database');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = path.join(__dirname, 'test-proxy.db');

// Clean up test database if it exists
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
  console.log('Cleaned up existing test database');
}

console.log('\n=== Testing OSC Proxy Database ===\n');

// Initialize database
console.log('1. Initializing database...');
const db = new ProxyDatabase(TEST_DB_PATH);
console.log('   ✓ Database initialized');

// Test creating a transmitter
console.log('\n2. Creating transmitter "LightKey"...');
const transmitter1 = db.createTransmitter({
  name: 'LightKey',
  enabled: true,
  protocol: 'udp',
  bind_address: '0.0.0.0',
  port: 8000,
  max_message_size: 8192
});
console.log('   ✓ Created:', transmitter1);

// Test creating another transmitter
console.log('\n3. Creating transmitter "QLab"...');
const transmitter2 = db.createTransmitter({
  name: 'QLab',
  enabled: true,
  protocol: 'udp',
  bind_address: '0.0.0.0',
  port: 53000,
  max_message_size: 8192
});
console.log('   ✓ Created:', transmitter2);

// Test creating receivers for transmitter 1
console.log('\n4. Creating receivers for LightKey...');
const receiver1 = db.createReceiver(transmitter1.id, {
  name: 'GrandMA3',
  enabled: true,
  protocol: 'tcp',
  host: '127.0.0.1',
  port: 9000,
  keepalive: true,
  keepalive_interval: 10,
  nodelay: true,
  connect_timeout: 5
});
console.log('   ✓ Created receiver 1:', receiver1);

const receiver2 = db.createReceiver(transmitter1.id, {
  name: 'Backup Console',
  enabled: true,
  protocol: 'tcp',
  host: '10.0.1.11',
  port: 9000
});
console.log('   ✓ Created receiver 2:', receiver2);

// Test creating receiver for transmitter 2
console.log('\n5. Creating receiver for QLab...');
const receiver3 = db.createReceiver(transmitter2.id, {
  name: 'Media Server',
  enabled: true,
  protocol: 'udp',
  host: '10.0.2.5',
  port: 7000
});
console.log('   ✓ Created receiver 3:', receiver3);

// Test getting all transmitters
console.log('\n6. Getting all transmitters...');
const allTransmitters = db.getAllTransmitters();
console.log('   ✓ Found', allTransmitters.length, 'transmitters');
allTransmitters.forEach(t => {
  console.log(`     - ${t.name}: ${t.protocol.toUpperCase()} on ${t.bind_address}:${t.port} with ${t.receivers.length} receiver(s)`);
  t.receivers.forEach(r => {
    console.log(`       → ${r.name}: ${r.protocol.toUpperCase()} to ${r.host}:${r.port}`);
  });
});

// Test getting enabled transmitters
console.log('\n7. Getting enabled transmitters...');
const enabledTransmitters = db.getEnabledTransmitters();
console.log('   ✓ Found', enabledTransmitters.length, 'enabled transmitters');

// Test updating a transmitter
console.log('\n8. Updating transmitter port...');
const updatedTransmitter = db.updateTransmitter(transmitter1.id, {
  name: 'LightKey',
  enabled: true,
  protocol: 'udp',
  bind_address: '0.0.0.0',
  port: 8001, // Changed port
  max_message_size: 8192
});
console.log('   ✓ Updated port to:', updatedTransmitter.port);

// Test toggling transmitter
console.log('\n9. Toggling transmitter enabled state...');
const toggledTransmitter = db.toggleTransmitter(transmitter2.id);
console.log('   ✓ Transmitter enabled:', toggledTransmitter.enabled);

// Test recording metrics
console.log('\n10. Recording metrics...');
db.recordMetrics(transmitter1.id, {
  rate: 245.8,
  avgRate: 198.3,
  peakRate: 412.0,
  latency: 0.42,
  total: 10000,
  forwarded: 9950,
  dropped: 50,
  lossPct: 0.5
});
console.log('    ✓ Recorded metrics for transmitter 1');

db.recordMetrics(null, {
  rate: 298.3,
  avgRate: 250.5,
  peakRate: 500.0,
  latency: 0.38,
  total: 15000,
  forwarded: 14900,
  dropped: 100,
  lossPct: 0.67
});
console.log('    ✓ Recorded aggregate metrics');

// Test getting metrics history
console.log('\n11. Getting metrics history...');
const metricsHistory = db.getMetricsHistory(transmitter1.id, 10);
console.log('    ✓ Found', metricsHistory.length, 'metrics records for transmitter 1');

const aggregateMetrics = db.getMetricsHistory(null, 10);
console.log('    ✓ Found', aggregateMetrics.length, 'aggregate metrics records');

// Test YAML migration
console.log('\n12. Testing YAML migration...');
const yamlConfig = {
  udp: {
    port: 21650,
    bind: '0.0.0.0',
    max_message_size: 8192
  },
  tcp: {
    host: '127.0.0.1',
    port: 21600,
    keepalive: true,
    keepalive_interval: 10,
    nodelay: true,
    connect_timeout: 5
  }
};
const migrated = db.migrateFromYAML(yamlConfig);
console.log('    ✓ Migrated YAML config to transmitter:', migrated.transmitter.name);
console.log('    ✓ Created receiver:', migrated.receiver.name);

// Test export
console.log('\n13. Exporting database to JSON...');
const exportData = db.exportToJSON();
console.log('    ✓ Exported', exportData.transmitters.length, 'transmitters');

// Test deleting a receiver
console.log('\n14. Deleting a receiver...');
const deleted = db.deleteReceiver(receiver2.id);
console.log('    ✓ Deleted receiver:', deleted);

// Final state
console.log('\n15. Final database state:');
const finalTransmitters = db.getAllTransmitters();
console.log('    Total transmitters:', finalTransmitters.length);
finalTransmitters.forEach(t => {
  console.log(`    - ${t.name} (${t.enabled ? 'enabled' : 'disabled'}): ${t.receivers.length} receiver(s)`);
});

// Close database
db.close();
console.log('\n✓ All tests completed successfully!\n');

// Clean up test database
fs.unlinkSync(TEST_DB_PATH);
console.log('Cleaned up test database');
