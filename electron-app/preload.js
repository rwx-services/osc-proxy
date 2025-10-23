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

  // Database - Listeners
  dbGetListeners: () => ipcRenderer.invoke('db-get-listeners'),
  dbGetListener: (id) => ipcRenderer.invoke('db-get-listener', id),
  dbGetEnabledListeners: () => ipcRenderer.invoke('db-get-enabled-listeners'),
  dbCreateListener: (data) => ipcRenderer.invoke('db-create-listener', data),
  dbUpdateListener: (id, data) => ipcRenderer.invoke('db-update-listener', id, data),
  dbDeleteListener: (id) => ipcRenderer.invoke('db-delete-listener', id),
  dbToggleListener: (id) => ipcRenderer.invoke('db-toggle-listener', id),

  // Database - Forwarders
  dbGetForwarders: (listenerId) => ipcRenderer.invoke('db-get-forwarders', listenerId),
  dbGetForwarder: (id) => ipcRenderer.invoke('db-get-forwarder', id),
  dbCreateForwarder: (listenerId, data) => ipcRenderer.invoke('db-create-forwarder', listenerId, data),
  dbUpdateForwarder: (id, data) => ipcRenderer.invoke('db-update-forwarder', id, data),
  dbDeleteForwarder: (id) => ipcRenderer.invoke('db-delete-forwarder', id),
  dbToggleForwarder: (id) => ipcRenderer.invoke('db-toggle-forwarder', id),

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
