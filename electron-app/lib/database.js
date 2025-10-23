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
      -- Listeners (sources of OSC messages)
      CREATE TABLE IF NOT EXISTS listeners (
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

      -- Forwarders (destinations for OSC messages)
      CREATE TABLE IF NOT EXISTS forwarders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listener_id INTEGER NOT NULL,
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
        FOREIGN KEY (listener_id) REFERENCES listeners(id) ON DELETE CASCADE
      );

      -- Metrics history (for visualization)
      CREATE TABLE IF NOT EXISTS metrics_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listener_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        rate REAL,
        avg_rate REAL,
        peak_rate REAL,
        latency REAL,
        total INTEGER,
        forwarded INTEGER,
        dropped INTEGER,
        loss_pct REAL,
        FOREIGN KEY (listener_id) REFERENCES listeners(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_listener ON metrics_history(listener_id);
    `);
  }

  // ==================== LISTENER OPERATIONS ====================

  /**
   * Get all listeners with their forwarders
   * @returns {Array} Array of listener objects with nested forwarders
   */
  getAllListeners() {
    const listeners = this.db.prepare(`
      SELECT * FROM listeners ORDER BY name
    `).all();

    // Fetch forwarders for each listener
    return listeners.map(listener => ({
      ...listener,
      enabled: Boolean(listener.enabled),
      forwarders: this.getForwardersForListener(listener.id)
    }));
  }

  /**
   * Get a single listener by ID
   * @param {number} id - Listener ID
   * @returns {Object|null} Listener object or null
   */
  getListener(id) {
    const listener = this.db.prepare(`
      SELECT * FROM listeners WHERE id = ?
    `).get(id);

    if (!listener) return null;

    return {
      ...listener,
      enabled: Boolean(listener.enabled),
      forwarders: this.getForwardersForListener(id)
    };
  }

  /**
   * Get enabled listeners only
   * @returns {Array} Array of enabled listeners with forwarders
   */
  getEnabledListeners() {
    const listeners = this.db.prepare(`
      SELECT * FROM listeners WHERE enabled = 1 ORDER BY name
    `).all();

    return listeners.map(listener => ({
      ...listener,
      enabled: Boolean(listener.enabled),
      forwarders: this.getForwardersForListener(listener.id).filter(f => f.enabled)
    }));
  }

  /**
   * Create a new listener
   * @param {Object} data - Listener data
   * @returns {Object} Created listener with ID
   */
  createListener(data) {
    const stmt = this.db.prepare(`
      INSERT INTO listeners (name, enabled, protocol, bind_address, port, max_message_size)
      VALUES (@name, @enabled, @protocol, @bind_address, @port, @max_message_size)
    `);

    const info = stmt.run({
      name: data.name,
      enabled: data.enabled ? 1 : 0,
      protocol: data.protocol || 'udp',
      bind_address: data.bind_address || '0.0.0.0',
      port: data.port,
      max_message_size: data.max_message_size || 8192
    });

    return this.getListener(info.lastInsertRowid);
  }

  /**
   * Update a listener
   * @param {number} id - Listener ID
   * @param {Object} data - Updated listener data
   * @returns {Object|null} Updated listener or null
   */
  updateListener(id, data) {
    const stmt = this.db.prepare(`
      UPDATE listeners
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
      enabled: data.enabled ? 1 : 0,
      protocol: data.protocol,
      bind_address: data.bind_address,
      port: data.port,
      max_message_size: data.max_message_size || 8192
    });

    return info.changes > 0 ? this.getListener(id) : null;
  }

  /**
   * Delete a listener (cascades to forwarders)
   * @param {number} id - Listener ID
   * @returns {boolean} True if deleted
   */
  deleteListener(id) {
    const stmt = this.db.prepare(`DELETE FROM listeners WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Toggle listener enabled state
   * @param {number} id - Listener ID
   * @returns {Object|null} Updated listener
   */
  toggleListener(id) {
    const stmt = this.db.prepare(`
      UPDATE listeners
      SET enabled = NOT enabled,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
    return this.getListener(id);
  }

  // ==================== FORWARDER OPERATIONS ====================

  /**
   * Get all forwarders for a specific listener
   * @param {number} listenerId - Listener ID
   * @returns {Array} Array of forwarder objects
   */
  getForwardersForListener(listenerId) {
    const forwarders = this.db.prepare(`
      SELECT * FROM forwarders WHERE listener_id = ? ORDER BY name
    `).all(listenerId);

    return forwarders.map(forwarder => ({
      ...forwarder,
      enabled: Boolean(forwarder.enabled),
      keepalive: Boolean(forwarder.keepalive),
      nodelay: Boolean(forwarder.nodelay)
    }));
  }

  /**
   * Get a single forwarder by ID
   * @param {number} id - Forwarder ID
   * @returns {Object|null} Forwarder object or null
   */
  getForwarder(id) {
    const forwarder = this.db.prepare(`
      SELECT * FROM forwarders WHERE id = ?
    `).get(id);

    if (!forwarder) return null;

    return {
      ...forwarder,
      enabled: Boolean(forwarder.enabled),
      keepalive: Boolean(forwarder.keepalive),
      nodelay: Boolean(forwarder.nodelay)
    };
  }

  /**
   * Create a new forwarder
   * @param {number} listenerId - Listener ID
   * @param {Object} data - Forwarder data
   * @returns {Object} Created forwarder with ID
   */
  createForwarder(listenerId, data) {
    const stmt = this.db.prepare(`
      INSERT INTO forwarders (
        listener_id, name, enabled, protocol, host, port,
        keepalive, keepalive_interval, nodelay, connect_timeout
      )
      VALUES (
        @listener_id, @name, @enabled, @protocol, @host, @port,
        @keepalive, @keepalive_interval, @nodelay, @connect_timeout
      )
    `);

    const info = stmt.run({
      listener_id: listenerId,
      name: data.name,
      enabled: data.enabled ? 1 : 0,
      protocol: data.protocol || 'tcp',
      host: data.host,
      port: data.port,
      keepalive: data.keepalive ? 1 : 0,
      keepalive_interval: data.keepalive_interval || 10,
      nodelay: data.nodelay ? 1 : 0,
      connect_timeout: data.connect_timeout || 5
    });

    return this.getForwarder(info.lastInsertRowid);
  }

  /**
   * Update a forwarder
   * @param {number} id - Forwarder ID
   * @param {Object} data - Updated forwarder data
   * @returns {Object|null} Updated forwarder or null
   */
  updateForwarder(id, data) {
    const stmt = this.db.prepare(`
      UPDATE forwarders
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
      enabled: data.enabled ? 1 : 0,
      protocol: data.protocol,
      host: data.host,
      port: data.port,
      keepalive: data.keepalive ? 1 : 0,
      keepalive_interval: data.keepalive_interval || 10,
      nodelay: data.nodelay ? 1 : 0,
      connect_timeout: data.connect_timeout || 5
    });

    return info.changes > 0 ? this.getForwarder(id) : null;
  }

  /**
   * Delete a forwarder
   * @param {number} id - Forwarder ID
   * @returns {boolean} True if deleted
   */
  deleteForwarder(id) {
    const stmt = this.db.prepare(`DELETE FROM forwarders WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Toggle forwarder enabled state
   * @param {number} id - Forwarder ID
   * @returns {Object|null} Updated forwarder
   */
  toggleForwarder(id) {
    const stmt = this.db.prepare(`
      UPDATE forwarders
      SET enabled = NOT enabled,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
    return this.getForwarder(id);
  }

  // ==================== METRICS OPERATIONS ====================

  /**
   * Record metrics for a listener
   * @param {number} listenerId - Listener ID (or null for aggregate)
   * @param {Object} metrics - Metrics data
   */
  recordMetrics(listenerId, metrics) {
    const stmt = this.db.prepare(`
      INSERT INTO metrics_history (
        listener_id, rate, avg_rate, peak_rate, latency,
        total, forwarded, dropped, loss_pct
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      listenerId,
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
   * @param {number|null} listenerId - Listener ID or null for all
   * @param {number} limit - Number of records to return
   * @returns {Array} Array of metrics records
   */
  getMetricsHistory(listenerId = null, limit = 100) {
    let query;
    let params;

    if (listenerId === null) {
      query = `
        SELECT * FROM metrics_history
        WHERE listener_id IS NULL
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      params = [limit];
    } else {
      query = `
        SELECT * FROM metrics_history
        WHERE listener_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      params = [listenerId, limit];
    }

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get metrics for a time range
   * @param {number|null} listenerId - Listener ID or null for aggregate
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @returns {Array} Array of metrics records
   */
  getMetricsInRange(listenerId, startTime, endTime) {
    let query;
    let params;

    if (listenerId === null) {
      query = `
        SELECT * FROM metrics_history
        WHERE listener_id IS NULL
          AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `;
      params = [startTime.toISOString(), endTime.toISOString()];
    } else {
      query = `
        SELECT * FROM metrics_history
        WHERE listener_id = ?
          AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `;
      params = [listenerId, startTime.toISOString(), endTime.toISOString()];
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
   * @returns {Object} Created listener and forwarder
   */
  migrateFromYAML(yamlConfig) {
    // Create listener from YAML udp config
    const listener = this.createListener({
      name: 'Default',
      enabled: true,
      protocol: 'udp',
      bind_address: yamlConfig.udp?.bind || '0.0.0.0',
      port: yamlConfig.udp?.port || 8000,
      max_message_size: yamlConfig.udp?.max_message_size || 8192
    });

    // Create forwarder from YAML tcp config
    const forwarder = this.createForwarder(listener.id, {
      name: 'Default Forwarder',
      enabled: true,
      protocol: 'tcp',
      host: yamlConfig.tcp?.host || '127.0.0.1',
      port: yamlConfig.tcp?.port || 9000,
      keepalive: yamlConfig.tcp?.keepalive !== false,
      keepalive_interval: yamlConfig.tcp?.keepalive_interval || 10,
      nodelay: yamlConfig.tcp?.nodelay !== false,
      connect_timeout: yamlConfig.tcp?.connect_timeout || 5
    });

    return { listener, forwarder };
  }

  /**
   * Export database to JSON (for backup/debugging)
   * @returns {Object} Complete database export
   */
  exportToJSON() {
    return {
      listeners: this.getAllListeners(),
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
