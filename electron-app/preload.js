const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Proxy control
  getProxyState: () => ipcRenderer.invoke('get-proxy-state'),
  startProxy: (configPath) => ipcRenderer.invoke('start-proxy', configPath),
  stopProxy: () => ipcRenderer.invoke('stop-proxy'),

  // Settings
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openActivityLog: () => ipcRenderer.invoke('open-activity-log'),
  loadConfig: (configPath) => ipcRenderer.invoke('load-config', configPath),
  saveConfig: (configPath, content) => ipcRenderer.invoke('save-config', configPath, content),

  // Database - Transmitters
  dbGetTransmitters: () => ipcRenderer.invoke('db-get-transmitters'),
  dbGetTransmitter: (id) => ipcRenderer.invoke('db-get-transmitter', id),
  dbGetEnabledTransmitters: () => ipcRenderer.invoke('db-get-enabled-transmitters'),
  dbCreateTransmitter: (data) => ipcRenderer.invoke('db-create-transmitter', data),
  dbUpdateTransmitter: (id, data) => ipcRenderer.invoke('db-update-transmitter', id, data),
  dbDeleteTransmitter: (id) => ipcRenderer.invoke('db-delete-transmitter', id),
  dbToggleTransmitter: (id) => ipcRenderer.invoke('db-toggle-transmitter', id),

  // Database - Receivers
  dbGetReceivers: (transmitterId) => ipcRenderer.invoke('db-get-receivers', transmitterId),
  dbGetReceiver: (id) => ipcRenderer.invoke('db-get-receiver', id),
  dbCreateReceiver: (transmitterId, data) => ipcRenderer.invoke('db-create-receiver', transmitterId, data),
  dbUpdateReceiver: (id, data) => ipcRenderer.invoke('db-update-receiver', id, data),
  dbDeleteReceiver: (id) => ipcRenderer.invoke('db-delete-receiver', id),
  dbToggleReceiver: (id) => ipcRenderer.invoke('db-toggle-receiver', id),

  // Database - Metrics
  dbGetMetricsHistory: (transmitterId, limit) => ipcRenderer.invoke('db-get-metrics-history', transmitterId, limit),
  dbExport: () => ipcRenderer.invoke('db-export'),

  // Event listeners
  onMetricsUpdate: (callback) => {
    ipcRenderer.on('metrics-update', (event, metrics) => callback(metrics));
  },
  onProxyStateChanged: (callback) => {
    ipcRenderer.on('proxy-state-changed', (event, state) => callback(state));
  },
  onProxyLog: (callback) => {
    ipcRenderer.on('proxy-log', (event, log) => callback(log));
  },
  onShowSettings: (callback) => {
    ipcRenderer.on('show-settings', () => callback());
  },

  // Remove listeners
  removeMetricsListener: () => {
    ipcRenderer.removeAllListeners('metrics-update');
  },
  removeStateListener: () => {
    ipcRenderer.removeAllListeners('proxy-state-changed');
  },
  removeLogListener: () => {
    ipcRenderer.removeAllListeners('proxy-log');
  }
});
