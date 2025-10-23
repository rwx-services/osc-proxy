#!/usr/bin/env node
/**
 * Migration script to rename:
 * - 'transmitters' table to 'listeners'
 * - 'receivers' table to 'forwarders'
 * - 'transmitter_id' foreign key to 'listener_id'
 */

const path = require('path');
const os = require('os');

// Load better-sqlite3 from electron-app directory
const Database = require(path.join(__dirname, '..', 'electron-app', 'node_modules', 'better-sqlite3'));

// Get database path
const dbPath = process.argv[2] || path.join(
  os.homedir(),
  'Library/Application Support/osc-proxy-app/proxy.db'
);

console.log('Migrating database:', dbPath);

try {
  const db = new Database(dbPath);

  // Start transaction
  db.prepare('BEGIN').run();

  console.log('1. Renaming transmitters table to listeners...');
  db.prepare('ALTER TABLE transmitters RENAME TO listeners').run();

  console.log('2. Renaming receivers table to forwarders...');
  db.prepare('ALTER TABLE receivers RENAME TO forwarders').run();

  console.log('3. Creating new forwarders table with updated schema...');
  // SQLite doesn't support renaming columns directly, so we need to recreate the table
  db.prepare(`
    CREATE TABLE forwarders_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listener_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'tcp',
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      keepalive INTEGER DEFAULT 1,
      keepalive_interval INTEGER DEFAULT 60,
      nodelay INTEGER DEFAULT 1,
      connect_timeout INTEGER DEFAULT 5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (listener_id) REFERENCES listeners(id) ON DELETE CASCADE
    )
  `).run();

  console.log('4. Copying data from forwarders to forwarders_new...');
  db.prepare(`
    INSERT INTO forwarders_new
      (id, listener_id, name, protocol, host, port, enabled, keepalive,
       keepalive_interval, nodelay, connect_timeout, created_at, updated_at)
    SELECT
      id, transmitter_id, name, protocol, host, port, enabled, keepalive,
      keepalive_interval, nodelay, connect_timeout, created_at, updated_at
    FROM forwarders
  `).run();

  console.log('5. Dropping old forwarders table...');
  db.prepare('DROP TABLE forwarders').run();

  console.log('6. Renaming forwarders_new to forwarders...');
  db.prepare('ALTER TABLE forwarders_new RENAME TO forwarders').run();

  console.log('7. Creating indexes...');
  db.prepare('CREATE INDEX idx_forwarders_listener_id ON forwarders(listener_id)').run();
  db.prepare('CREATE INDEX idx_forwarders_enabled ON forwarders(enabled)').run();

  // Commit transaction
  db.prepare('COMMIT').run();

  console.log('✓ Migration completed successfully!');

  // Verify
  const listeners = db.prepare('SELECT COUNT(*) as count FROM listeners').get();
  const forwarders = db.prepare('SELECT COUNT(*) as count FROM forwarders').get();
  console.log(`✓ Listeners: ${listeners.count}`);
  console.log(`✓ Forwarders: ${forwarders.count}`);

  db.close();

} catch (error) {
  console.error('✗ Migration failed:', error.message);
  console.error('The database has been rolled back to its previous state.');
  process.exit(1);
}
