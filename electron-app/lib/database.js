const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ProxyDatabase {
  constructor(dbPath) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
  }

  initializeSchema() {
    this.db.exec(`
      -- Transmitters (sources of OSC messages)
      CREATE TABLE IF NOT EXISTS transmitters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        protocol TEXT NOT NULL CHECK(protocol IN ('udp', 'tcp')),
        bind_address TEXT NOT NULL,
        port INTEGER NOT NULL,
        max_message_size INTEGER DEFAULT 8192,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Receivers (destinations for OSC messages)
      CREATE TABLE IF NOT EXISTS receivers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transmitter_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        protocol TEXT NOT NULL CHECK(protocol IN ('udp', 'tcp')),
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        keepalive BOOLEAN DEFAULT 1,
        keepalive_interval INTEGER DEFAULT 10,
        nodelay BOOLEAN DEFAULT 1,
        connect_timeout INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (transmitter_id) REFERENCES transmitters(id) ON DELETE CASCADE
      );

      -- Metrics history (for visualization)
      CREATE TABLE IF NOT EXISTS metrics_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transmitter_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        rate REAL,
        avg_rate REAL,
        peak_rate REAL,
        latency REAL,
        total INTEGER,
        forwarded INTEGER,
        dropped INTEGER,
        loss_pct REAL,
        FOREIGN KEY (transmitter_id) REFERENCES transmitters(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_transmitter ON metrics_history(transmitter_id);
    `);
  }

  // ==================== TRANSMITTER OPERATIONS ====================

  /**
   * Get all transmitters with their receivers
   * @returns {Array} Array of transmitter objects with nested receivers
   */
  getAllTransmitters() {
    const transmitters = this.db.prepare(`
      SELECT * FROM transmitters ORDER BY name
    `).all();

    // Fetch receivers for each transmitter
    return transmitters.map(transmitter => ({
      ...transmitter,
      enabled: Boolean(transmitter.enabled),
      receivers: this.getReceiversForTransmitter(transmitter.id)
    }));
  }

  /**
   * Get a single transmitter by ID
   * @param {number} id - Transmitter ID
   * @returns {Object|null} Transmitter object or null
   */
  getTransmitter(id) {
    const transmitter = this.db.prepare(`
      SELECT * FROM transmitters WHERE id = ?
    `).get(id);

    if (!transmitter) return null;

    return {
      ...transmitter,
      enabled: Boolean(transmitter.enabled),
      receivers: this.getReceiversForTransmitter(id)
    };
  }

  /**
   * Get enabled transmitters only
   * @returns {Array} Array of enabled transmitters with receivers
   */
  getEnabledTransmitters() {
    const transmitters = this.db.prepare(`
      SELECT * FROM transmitters WHERE enabled = 1 ORDER BY name
    `).all();

    return transmitters.map(transmitter => ({
      ...transmitter,
      enabled: Boolean(transmitter.enabled),
      receivers: this.getReceiversForTransmitter(transmitter.id).filter(r => r.enabled)
    }));
  }

  /**
   * Create a new transmitter
   * @param {Object} data - Transmitter data
   * @returns {Object} Created transmitter with ID
   */
  createTransmitter(data) {
    const stmt = this.db.prepare(`
      INSERT INTO transmitters (name, enabled, protocol, bind_address, port, max_message_size)
      VALUES (@name, @enabled, @protocol, @bind_address, @port, @max_message_size)
    `);

    const info = stmt.run({
      name: data.name,
      enabled: data.enabled !== false ? 1 : 0,
      protocol: data.protocol || 'udp',
      bind_address: data.bind_address || '0.0.0.0',
      port: data.port,
      max_message_size: data.max_message_size || 8192
    });

    return this.getTransmitter(info.lastInsertRowid);
  }

  /**
   * Update a transmitter
   * @param {number} id - Transmitter ID
   * @param {Object} data - Updated transmitter data
   * @returns {Object|null} Updated transmitter or null
   */
  updateTransmitter(id, data) {
    const stmt = this.db.prepare(`
      UPDATE transmitters
      SET name = @name,
          enabled = @enabled,
          protocol = @protocol,
          bind_address = @bind_address,
          port = @port,
          max_message_size = @max_message_size,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    const info = stmt.run({
      id,
      name: data.name,
      enabled: data.enabled !== false ? 1 : 0,
      protocol: data.protocol,
      bind_address: data.bind_address,
      port: data.port,
      max_message_size: data.max_message_size
    });

    return info.changes > 0 ? this.getTransmitter(id) : null;
  }

  /**
   * Delete a transmitter (cascades to receivers)
   * @param {number} id - Transmitter ID
   * @returns {boolean} True if deleted
   */
  deleteTransmitter(id) {
    const stmt = this.db.prepare(`DELETE FROM transmitters WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Toggle transmitter enabled state
   * @param {number} id - Transmitter ID
   * @returns {Object|null} Updated transmitter
   */
  toggleTransmitter(id) {
    const stmt = this.db.prepare(`
      UPDATE transmitters
      SET enabled = NOT enabled,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
    return this.getTransmitter(id);
  }

  // ==================== RECEIVER OPERATIONS ====================

  /**
   * Get all receivers for a specific transmitter
   * @param {number} transmitterId - Transmitter ID
   * @returns {Array} Array of receiver objects
   */
  getReceiversForTransmitter(transmitterId) {
    const receivers = this.db.prepare(`
      SELECT * FROM receivers WHERE transmitter_id = ? ORDER BY name
    `).all(transmitterId);

    return receivers.map(receiver => ({
      ...receiver,
      enabled: Boolean(receiver.enabled),
      keepalive: Boolean(receiver.keepalive),
      nodelay: Boolean(receiver.nodelay)
    }));
  }

  /**
   * Get a single receiver by ID
   * @param {number} id - Receiver ID
   * @returns {Object|null} Receiver object or null
   */
  getReceiver(id) {
    const receiver = this.db.prepare(`
      SELECT * FROM receivers WHERE id = ?
    `).get(id);

    if (!receiver) return null;

    return {
      ...receiver,
      enabled: Boolean(receiver.enabled),
      keepalive: Boolean(receiver.keepalive),
      nodelay: Boolean(receiver.nodelay)
    };
  }

  /**
   * Create a new receiver
   * @param {number} transmitterId - Transmitter ID
   * @param {Object} data - Receiver data
   * @returns {Object} Created receiver with ID
   */
  createReceiver(transmitterId, data) {
    const stmt = this.db.prepare(`
      INSERT INTO receivers (
        transmitter_id, name, enabled, protocol, host, port,
        keepalive, keepalive_interval, nodelay, connect_timeout
      )
      VALUES (
        @transmitter_id, @name, @enabled, @protocol, @host, @port,
        @keepalive, @keepalive_interval, @nodelay, @connect_timeout
      )
    `);

    const info = stmt.run({
      transmitter_id: transmitterId,
      name: data.name,
      enabled: data.enabled !== false ? 1 : 0,
      protocol: data.protocol || 'tcp',
      host: data.host,
      port: data.port,
      keepalive: data.keepalive !== false ? 1 : 0,
      keepalive_interval: data.keepalive_interval || 10,
      nodelay: data.nodelay !== false ? 1 : 0,
      connect_timeout: data.connect_timeout || 5
    });

    return this.getReceiver(info.lastInsertRowid);
  }

  /**
   * Update a receiver
   * @param {number} id - Receiver ID
   * @param {Object} data - Updated receiver data
   * @returns {Object|null} Updated receiver or null
   */
  updateReceiver(id, data) {
    const stmt = this.db.prepare(`
      UPDATE receivers
      SET name = @name,
          enabled = @enabled,
          protocol = @protocol,
          host = @host,
          port = @port,
          keepalive = @keepalive,
          keepalive_interval = @keepalive_interval,
          nodelay = @nodelay,
          connect_timeout = @connect_timeout,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    const info = stmt.run({
      id,
      name: data.name,
      enabled: data.enabled !== false ? 1 : 0,
      protocol: data.protocol,
      host: data.host,
      port: data.port,
      keepalive: data.keepalive !== false ? 1 : 0,
      keepalive_interval: data.keepalive_interval,
      nodelay: data.nodelay !== false ? 1 : 0,
      connect_timeout: data.connect_timeout
    });

    return info.changes > 0 ? this.getReceiver(id) : null;
  }

  /**
   * Delete a receiver
   * @param {number} id - Receiver ID
   * @returns {boolean} True if deleted
   */
  deleteReceiver(id) {
    const stmt = this.db.prepare(`DELETE FROM receivers WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Toggle receiver enabled state
   * @param {number} id - Receiver ID
   * @returns {Object|null} Updated receiver
   */
  toggleReceiver(id) {
    const stmt = this.db.prepare(`
      UPDATE receivers
      SET enabled = NOT enabled,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
    return this.getReceiver(id);
  }

  // ==================== METRICS OPERATIONS ====================

  /**
   * Record metrics for a transmitter
   * @param {number} transmitterId - Transmitter ID (or null for aggregate)
   * @param {Object} metrics - Metrics data
   */
  recordMetrics(transmitterId, metrics) {
    const stmt = this.db.prepare(`
      INSERT INTO metrics_history (
        transmitter_id, rate, avg_rate, peak_rate, latency,
        total, forwarded, dropped, loss_pct
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      transmitterId,
      metrics.rate || 0,
      metrics.avgRate || 0,
      metrics.peakRate || 0,
      metrics.latency || 0,
      metrics.total || 0,
      metrics.forwarded || 0,
      metrics.dropped || 0,
      metrics.lossPct || 0
    );
  }

  /**
   * Get recent metrics history
   * @param {number|null} transmitterId - Transmitter ID or null for all
   * @param {number} limit - Number of records to return
   * @returns {Array} Array of metrics records
   */
  getMetricsHistory(transmitterId = null, limit = 100) {
    let query;
    let params;

    if (transmitterId === null) {
      query = `
        SELECT * FROM metrics_history
        WHERE transmitter_id IS NULL
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      params = [limit];
    } else {
      query = `
        SELECT * FROM metrics_history
        WHERE transmitter_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      params = [transmitterId, limit];
    }

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get metrics for a time range
   * @param {number|null} transmitterId - Transmitter ID or null for aggregate
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @returns {Array} Array of metrics records
   */
  getMetricsInRange(transmitterId, startTime, endTime) {
    let query;
    let params;

    if (transmitterId === null) {
      query = `
        SELECT * FROM metrics_history
        WHERE transmitter_id IS NULL
          AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `;
      params = [startTime.toISOString(), endTime.toISOString()];
    } else {
      query = `
        SELECT * FROM metrics_history
        WHERE transmitter_id = ?
          AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `;
      params = [transmitterId, startTime.toISOString(), endTime.toISOString()];
    }

    return this.db.prepare(query).all(...params);
  }

  /**
   * Clean old metrics history (older than N days)
   * @param {number} days - Number of days to keep
   * @returns {number} Number of deleted records
   */
  cleanOldMetrics(days = 30) {
    const stmt = this.db.prepare(`
      DELETE FROM metrics_history
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    const info = stmt.run(days);
    return info.changes;
  }

  // ==================== MIGRATION ====================

  /**
   * Migrate from YAML config to database
   * @param {Object} yamlConfig - Parsed YAML configuration
   * @returns {Object} Created transmitter and receiver
   */
  migrateFromYAML(yamlConfig) {
    // Create transmitter from YAML udp config
    const transmitter = this.createTransmitter({
      name: 'Default',
      enabled: true,
      protocol: 'udp',
      bind_address: yamlConfig.udp?.bind || '0.0.0.0',
      port: yamlConfig.udp?.port || 8000,
      max_message_size: yamlConfig.udp?.max_message_size || 8192
    });

    // Create receiver from YAML tcp config
    const receiver = this.createReceiver(transmitter.id, {
      name: 'Default Receiver',
      enabled: true,
      protocol: 'tcp',
      host: yamlConfig.tcp?.host || '127.0.0.1',
      port: yamlConfig.tcp?.port || 9000,
      keepalive: yamlConfig.tcp?.keepalive !== false,
      keepalive_interval: yamlConfig.tcp?.keepalive_interval || 10,
      nodelay: yamlConfig.tcp?.nodelay !== false,
      connect_timeout: yamlConfig.tcp?.connect_timeout || 5
    });

    return { transmitter, receiver };
  }

  /**
   * Export database to JSON (for backup/debugging)
   * @returns {Object} Complete database export
   */
  exportToJSON() {
    return {
      transmitters: this.getAllTransmitters(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = ProxyDatabase;
