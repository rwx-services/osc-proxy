// Settings window renderer

const configPath = document.getElementById('config-path');
const configEditor = document.getElementById('config-editor');
const btnLoadConfig = document.getElementById('btn-load-config');
const btnSaveConfig = document.getElementById('btn-save-config');
const btnApplyQuick = document.getElementById('btn-apply-quick');
const btnClose = document.getElementById('btn-close');

const udpPort = document.getElementById('udp-port');
const tcpHost = document.getElementById('tcp-host');
const tcpPort = document.getElementById('tcp-port');

// Load config on startup
async function init() {
  await loadConfig(false); // Silent load on init

  btnLoadConfig.addEventListener('click', () => loadConfig(true));
  btnSaveConfig.addEventListener('click', saveConfig);
  btnApplyQuick.addEventListener('click', applyQuickSettings);
  btnClose.addEventListener('click', closeWindow);

  // Also close on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeWindow();
    }
  });
}

function closeWindow() {
  window.close();
}

async function loadConfig(showNotifications = true) {
  const result = await window.electronAPI.loadConfig(configPath.value);

  if (result.success) {
    configEditor.value = result.content;
    parseConfigToQuickSettings(result.content);
    if (showNotifications) {
      showNotification('Config loaded successfully', 'success');
    }
  } else {
    if (showNotifications) {
      showNotification(`Failed to load config: ${result.error}`, 'error');
    }
  }
}

async function saveConfig() {
  const result = await window.electronAPI.saveConfig(configPath.value, configEditor.value);

  if (result.success) {
    showNotification('Config saved successfully', 'success');
  } else {
    showNotification(`Failed to save config: ${result.error}`, 'error');
  }
}

function applyQuickSettings() {
  const yaml = `udp:
  port: ${udpPort.value}
  bind: '127.0.0.1'

tcp:
  host: '${tcpHost.value}'
  port: ${tcpPort.value}
  keepalive: true
  nodelay: true

reconnect:
  initial_delay: 0.1
  max_delay: 5.0
  backoff_multiplier: 2.0
  max_attempts: 0

logging:
  level: normal
  show_content: false
`;

  configEditor.value = yaml;
  showNotification('Quick settings applied to config', 'success');
}

function parseConfigToQuickSettings(yaml) {
  try {
    // Simple YAML parsing for common values
    const udpMatch = yaml.match(/udp:\s+port:\s+(\d+)/);
    const tcpHostMatch = yaml.match(/tcp:\s+host:\s+'([^']+)'/);
    const tcpPortMatch = yaml.match(/tcp:\s+.*port:\s+(\d+)/);

    if (udpMatch) udpPort.value = udpMatch[1];
    if (tcpHostMatch) tcpHost.value = tcpHostMatch[1];
    if (tcpPortMatch) tcpPort.value = tcpPortMatch[1];
  } catch (e) {
    console.error('Failed to parse config:', e);
  }
}

function showNotification(message, type) {
  // Simple notification - could be enhanced with a toast library
  const color = type === 'success' ? 'text-green-400' : 'text-red-400';
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${color} bg-proxy-gray border border-current rounded-lg px-4 py-3 shadow-lg`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
