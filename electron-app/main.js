const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
// const ProxyDatabase = require('./lib/database');
const fs = require('fs');
const yaml = require('js-yaml');

// Load database after electron is fully initialized
let ProxyDatabase = null;

let mainWindow = null;
let settingsWindow = null;
let activityLogWindow = null;
let tray = null;
let proxyProcess = null;
let db = null;

// Keep track of proxy state
let proxyState = {
  running: false,
  connected: false,
  metrics: {
    rate: 0,
    avgRate: 0,
    peakRate: 0,
    latency: 0,
    total: 0,
    forwarded: 0,
    dropped: 0,
    lossPct: 0
  }
};

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1200,
    maxWidth: 1200,
    minHeight: 750,
    maxHeight: 750,
    resizable: false,
    maximizable: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Set up menu
  createMenu();

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Hide window instead of closing it so it can be reopened from tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Show settings in main window (overlay)
function showSettings() {
  if (mainWindow) {
    mainWindow.webContents.send('show-settings');
    mainWindow.focus();
  }
}

// Legacy function - no longer used, kept for backward compatibility
function createSettingsWindow() {
  // Now just shows settings in main window instead
  showSettings();
}

function createActivityLogWindow() {
  if (activityLogWindow) {
    activityLogWindow.focus();
    return;
  }

  activityLogWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    title: 'OSC Proxy - Activity Log',
    backgroundColor: '#0f172a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  activityLogWindow.loadFile(path.join(__dirname, 'src', 'activity-log.html'));

  activityLogWindow.on('closed', () => {
    activityLogWindow = null;
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: 'OSC Proxy',
      submenu: [
        {
          label: 'About OSC Proxy',
          click: () => {
            app.showAboutPanel();
          }
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: createSettingsWindow
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createMainWindow();
          }
        },
        { type: 'separator' },
        ...(!isMac ? [
          {
            label: 'Settings...',
            accelerator: 'Ctrl+,',
            click: createSettingsWindow
          },
          { type: 'separator' }
        ] : []),
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // Proxy menu
    {
      label: 'Proxy',
      submenu: [
        {
          label: 'Start',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (!proxyState.running) {
              startProxy();
            }
          },
          enabled: true
        },
        {
          label: 'Stop',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            if (proxyState.running) {
              stopProxy();
            }
          },
          enabled: true
        },
        { type: 'separator' },
        {
          label: 'Restart',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (proxyState.running) {
              stopProxy();
              setTimeout(() => startProxy(), 1000);
            } else {
              startProxy();
            }
          }
        }
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Activity Log',
          accelerator: 'CmdOrCtrl+L',
          click: createActivityLogWindow
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    // Help menu
    {
      role: 'help',
      submenu: [
        ...(!isMac ? [
          {
            label: 'About OSC Proxy',
            click: () => {
              app.showAboutPanel();
            }
          }
        ] : [])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  // Create a simple tray icon (you'll want to add a real icon later)
  tray = new Tray(path.join(__dirname, 'assets', 'trayIcon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: proxyState.running ? 'Stop Proxy' : 'Start Proxy',
      click: () => {
        if (proxyState.running) {
          stopProxy();
        } else {
          startProxy();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: createSettingsWindow
    },
    {
      label: 'Quit',
      click: () => {
        stopProxy();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('OSC Proxy');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });

  updateTrayStatus();
}

function updateTrayStatus() {
  if (!tray) return;

  const status = proxyState.running
    ? (proxyState.connected ? 'Running' : 'Starting...')
    : 'Stopped';

  tray.setToolTip(`OSC Proxy - ${status}`);
}

function startProxy(configPath = null) {
  if (proxyProcess) {
    console.log('Proxy already running');
    return;
  }

  // Determine Ruby proxy path
  const isProduction = app.isPackaged;
  const rubyProxyPath = isProduction
    ? path.join(process.resourcesPath, 'ruby-proxy', 'bin', 'osc-proxy')
    : path.join(__dirname, '..', 'bin', 'osc-proxy');

  // Use database for multi-listener mode
  const dbPath = path.join(app.getPath('userData'), 'proxy.db');

  console.log('Starting Ruby proxy:', rubyProxyPath);
  console.log('Using database:', dbPath);

  const args = ['--database', dbPath, '--json'];

  proxyProcess = spawn('ruby', [rubyProxyPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  proxyState.running = true;
  updateTrayStatus();
  sendToRenderer('proxy-state-changed', proxyState);

  // Parse JSON output from Ruby proxy
  let buffer = '';
  proxyProcess.stdout.on('data', (data) => {
    buffer += data.toString();

    // Try to parse complete JSON lines
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      try {
        const metrics = JSON.parse(line);
        proxyState.metrics = metrics;

        // Update connected state and notify renderer
        const wasConnected = proxyState.connected;
        proxyState.connected = true;

        updateTrayStatus();
        sendToRenderer('metrics-update', metrics);

        // Send state change event if this is the first connection
        if (!wasConnected) {
          sendToRenderer('proxy-state-changed', proxyState);
        }
      } catch (e) {
        // Not JSON, might be a regular log line
        console.log('Proxy output:', line);
        sendToRenderer('proxy-log', { message: line, type: 'info' });
      }
    });
  });

  proxyProcess.stderr.on('data', (data) => {
    console.error('Proxy error:', data.toString());
    sendToRenderer('proxy-log', { message: data.toString(), type: 'error' });
  });

  proxyProcess.on('close', (code) => {
    console.log(`Proxy process exited with code ${code}`);
    proxyProcess = null;
    proxyState.running = false;
    proxyState.connected = false;
    updateTrayStatus();
    sendToRenderer('proxy-state-changed', proxyState);
  });

  proxyProcess.on('error', (err) => {
    console.error('Failed to start proxy:', err);
    proxyProcess = null;
    proxyState.running = false;
    proxyState.connected = false;
    updateTrayStatus();
    sendToRenderer('proxy-log', { message: `Failed to start: ${err.message}`, type: 'error' });
    sendToRenderer('proxy-state-changed', proxyState);
  });
}

function stopProxy() {
  if (!proxyProcess) return;

  console.log('Stopping proxy...');
  proxyProcess.kill('SIGTERM');

  setTimeout(() => {
    if (proxyProcess) {
      proxyProcess.kill('SIGKILL');
    }
  }, 5000);
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(channel, data);
  }
  if (activityLogWindow && !activityLogWindow.isDestroyed()) {
    activityLogWindow.webContents.send(channel, data);
  }
}

// IPC handlers
ipcMain.handle('get-proxy-state', () => {
  return proxyState;
});

ipcMain.handle('start-proxy', (event, configPath) => {
  startProxy(configPath);
  return { success: true };
});

ipcMain.handle('stop-proxy', () => {
  stopProxy();
  return { success: true };
});

ipcMain.handle('open-settings', () => {
  // Send event to main window to show settings view
  if (mainWindow) {
    mainWindow.webContents.send('show-settings');
  }
  return { success: true };
});

ipcMain.handle('open-activity-log', () => {
  createActivityLogWindow();
  return { success: true };
});

ipcMain.handle('load-config', async (event, configPath) => {
  const fs = require('fs').promises;
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-config', async (event, configPath, content) => {
  const fs = require('fs').promises;
  try {
    await fs.writeFile(configPath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ==================== DATABASE INITIALIZATION ====================

function initializeDatabase() {
  // Load the database module now that Electron is ready
  if (!ProxyDatabase) {
    ProxyDatabase = require('./lib/database');
  }

  const dbPath = path.join(app.getPath('userData'), 'proxy.db');
  const oldConfigPath = path.join(__dirname, '..', 'config', 'lightkey.yml');

  console.log('Initializing database at:', dbPath);
  db = new ProxyDatabase(dbPath);

  // Check if database is empty and YAML config exists - auto-migrate
  const listeners = db.getAllListeners();
  if (listeners.length === 0 && fs.existsSync(oldConfigPath)) {
    console.log('Migrating from YAML config:', oldConfigPath);
    try {
      const yamlContent = fs.readFileSync(oldConfigPath, 'utf8');
      const yamlConfig = yaml.load(yamlContent);
      const result = db.migrateFromYAML(yamlConfig);
      console.log('Migration successful:', result);
    } catch (err) {
      console.error('Failed to migrate YAML config:', err);
    }
  }

  return db;
}

// ==================== DATABASE IPC HANDLERS ====================

// Listener operations
ipcMain.handle('db-get-listeners', async () => {
  try {
    return { success: true, data: db.getAllListeners() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-get-listener', async (event, id) => {
  try {
    const listener = db.getListener(id);
    return { success: true, data: listener };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-get-enabled-listeners', async () => {
  try {
    return { success: true, data: db.getEnabledListeners() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-create-listener', async (event, data) => {
  try {
    const listener = db.createListener(data);
    return { success: true, data: listener };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-update-listener', async (event, id, data) => {
  try {
    const listener = db.updateListener(id, data);
    return { success: true, data: listener };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-delete-listener', async (event, id) => {
  try {
    const deleted = db.deleteListener(id);
    return { success: true, data: deleted };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-toggle-listener', async (event, id) => {
  try {
    const listener = db.toggleListener(id);
    return { success: true, data: listener };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Forwarder operations
ipcMain.handle('db-get-forwarders', async (event, listenerId) => {
  try {
    const forwarders = db.getForwardersForListener(listenerId);
    return { success: true, data: forwarders };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-get-forwarder', async (event, id) => {
  try {
    const forwarder = db.getForwarder(id);
    return { success: true, data: forwarder };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-create-forwarder', async (event, listenerId, data) => {
  try {
    const forwarder = db.createForwarder(listenerId, data);
    return { success: true, data: forwarder };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-update-forwarder', async (event, id, data) => {
  try {
    const forwarder = db.updateForwarder(id, data);
    return { success: true, data: forwarder };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-delete-forwarder', async (event, id) => {
  try {
    const deleted = db.deleteForwarder(id);
    return { success: true, data: deleted };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-toggle-forwarder', async (event, id) => {
  try {
    const forwarder = db.toggleForwarder(id);
    return { success: true, data: forwarder };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Metrics operations
ipcMain.handle('db-get-metrics-history', async (event, listenerId, limit) => {
  try {
    const metrics = db.getMetricsHistory(listenerId, limit);
    return { success: true, data: metrics };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-export', async () => {
  try {
    const data = db.exportToJSON();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// App lifecycle
app.whenReady().then(() => {
  initializeDatabase();
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit - keep running in tray
  // if (process.platform !== 'darwin') {
  //   app.quit();
  // }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopProxy();
});
