// Settings window renderer - Database-backed multi-listener UI

// State
let listeners = [];
let selectedListenerId = null;
let editingForwarderId = null;
let isInitialized = false;

// DOM Elements (initialized lazily)
let listenersList;
let noSelection;
let listenerDetails;
let forwardersList;
let noForwarders;
let forwarderModal;

// Buttons (will be initialized in init())
let btnClose;
let btnAddListener;
let btnSaveListener;
let btnDeleteListener;
let btnAddForwarder;
let btnSaveForwarder;
let btnCancelForwarder;

// Listener form fields (initialized lazily)
let listenerName;
let listenerProtocol;
let listenerPort;
let listenerBind;
let listenerTcpPort;
let listenerTcpBind;
let listenerEnabled;
let listenerUdpFields;
let listenerTcpFields;

// Forwarder form fields (initialized lazily)
let fwdName;
let fwdProtocol;
let fwdHost;
let fwdPort;
let fwdEnabled;
let forwarderModalTitle;

// Initialize
async function init() {
  // Get all DOM elements
  listenersList = document.getElementById('listeners-list');
  noSelection = document.getElementById('no-selection');
  listenerDetails = document.getElementById('listener-details');
  forwardersList = document.getElementById('forwarders-list');
  noForwarders = document.getElementById('no-forwarders');
  forwarderModal = document.getElementById('forwarder-modal');

  // Buttons
  btnClose = document.getElementById('btn-close-settings');
  btnAddListener = document.getElementById('btn-add-listener');
  btnSaveListener = document.getElementById('btn-save-listener');
  btnDeleteListener = document.getElementById('btn-delete-listener');
  btnAddForwarder = document.getElementById('btn-add-forwarder');
  btnSaveForwarder = document.getElementById('btn-save-forwarder');
  btnCancelForwarder = document.getElementById('btn-cancel-forwarder');

  // Listener form fields
  listenerName = document.getElementById('listener-name');
  listenerProtocol = document.getElementById('listener-protocol');
  listenerPort = document.getElementById('listener-port');
  listenerBind = document.getElementById('listener-bind');
  listenerTcpPort = document.getElementById('listener-tcp-port');
  listenerTcpBind = document.getElementById('listener-tcp-bind');
  listenerEnabled = document.getElementById('listener-enabled');
  listenerUdpFields = document.getElementById('listener-udp-fields');
  listenerTcpFields = document.getElementById('listener-tcp-fields');

  // Forwarder form fields
  fwdName = document.getElementById('fwd-name');
  fwdProtocol = document.getElementById('fwd-protocol');
  fwdHost = document.getElementById('fwd-host');
  fwdPort = document.getElementById('fwd-port');
  fwdEnabled = document.getElementById('fwd-enabled');
  forwarderModalTitle = document.getElementById('forwarder-modal-title');

  // Only set up event listeners once
  if (!isInitialized) {
    // Event listeners
    if (btnClose) btnClose.addEventListener('click', closeSettings);
    if (btnAddListener) btnAddListener.addEventListener('click', addListener);
    if (btnSaveListener) btnSaveListener.addEventListener('click', saveListener);
    if (btnDeleteListener) btnDeleteListener.addEventListener('click', deleteListener);
    if (btnAddForwarder) btnAddForwarder.addEventListener('click', showAddForwarderModal);
    if (btnSaveForwarder) btnSaveForwarder.addEventListener('click', saveForwarder);
    if (btnCancelForwarder) btnCancelForwarder.addEventListener('click', hideForwarderModal);

    if (listenerProtocol) listenerProtocol.addEventListener('change', updateProtocolFields);

    window.addEventListener('keydown', handleEscapeKey);

    isInitialized = true;
  }

  // Load listeners (always refresh when opening settings)
  await loadListeners();
}

function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('forwarder-modal');
    if (modal && !modal.classList.contains('hidden')) {
      hideForwarderModal();
    } else {
      closeSettings();
    }
  }
}

function closeSettings() {
  // Switch back to dashboard view
  if (window.showView) {
    window.showView('dashboard');
  }
}

// Listener Management
async function loadListeners() {
  try {
    const result = await window.electronAPI.dbGetListeners();
    listeners = result.success ? result.data : [];
    renderListenersList();

    if (listeners.length > 0 && !selectedListenerId) {
      selectListener(listeners[0].id);
    }
  } catch (error) {
    showNotification('Failed to load listeners: ' + error.message, 'error');
  }
}

function renderListenersList() {
  listenersList.innerHTML = '';

  if (listeners.length === 0) {
    listenersList.innerHTML = '<div class="text-center py-8 text-gray-500 text-sm">No listeners configured</div>';
    return;
  }

  listeners.forEach(listener => {
    const item = document.createElement('div');
    item.className = `p-3 rounded cursor-pointer transition-colors ${
      listener.id === selectedListenerId
        ? 'bg-proxy-accent/20 border border-proxy-accent'
        : 'hover:bg-proxy-gray-light/20 border border-transparent'
    }`;
    item.onclick = () => selectListener(listener.id);

    const protocol = listener.protocol.toUpperCase();
    const statusColor = listener.enabled ? 'text-green-400' : 'text-gray-500';
    const statusText = listener.enabled ? 'Enabled' : 'Disabled';

    item.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-medium text-sm">${escapeHtml(listener.name)}</span>
        <span class="text-xs ${statusColor}">${statusText}</span>
      </div>
      <div class="text-xs text-gray-400">
        ${protocol} :${listener.port}
      </div>
    `;

    listenersList.appendChild(item);
  });
}

async function selectListener(id) {
  selectedListenerId = id;
  renderListenersList();

  const listener = listeners.find(l => l.id === id);
  if (!listener) return;

  // Show details panel
  noSelection.classList.add('hidden');
  listenerDetails.classList.remove('hidden');

  // Populate form
  listenerName.value = listener.name;
  listenerProtocol.value = listener.protocol;
  listenerEnabled.checked = !!listener.enabled; // Convert to boolean

  listenerPort.value = listener.port || '';
  listenerBind.value = listener.bind_address || '127.0.0.1';
  listenerTcpPort.value = listener.port || '';
  listenerTcpBind.value = listener.bind_address || '127.0.0.1';

  updateProtocolFields();

  // Load forwarders
  await loadForwarders(id);
}

function updateProtocolFields() {
  if (listenerProtocol.value === 'udp') {
    listenerUdpFields.classList.remove('hidden');
    listenerTcpFields.classList.add('hidden');
  } else {
    listenerUdpFields.classList.add('hidden');
    listenerTcpFields.classList.remove('hidden');
  }
}

async function addListener() {
  try {
    const result = await window.electronAPI.dbCreateListener({
      name: 'New Listener',
      protocol: 'udp',
      port: 21650,
      bind_address: '127.0.0.1',
      enabled: true
    });

    await loadListeners();
    if (result.success && result.data) {
      selectListener(result.data.id);
    }

    // Notify dashboard to reload listeners
    notifyDashboardUpdate();

    showNotification('Listener created', 'success');
  } catch (error) {
    showNotification('Failed to create listener: ' + error.message, 'error');
  }
}

async function saveListener() {
  if (!selectedListenerId) return;

  try {
    console.log('=== SAVE LISTENER DEBUG ===');
    console.log('listenerEnabled element:', listenerEnabled);
    console.log('listenerEnabled.checked:', listenerEnabled.checked);
    console.log('listenerEnabled.type:', listenerEnabled.type);

    const data = {
      name: listenerName.value,
      protocol: listenerProtocol.value,
      enabled: listenerEnabled.checked ? 1 : 0
    };

    if (listenerProtocol.value === 'udp') {
      data.port = parseInt(listenerPort.value) || 21650;
      data.bind_address = listenerBind.value || '127.0.0.1';
    } else {
      data.port = parseInt(listenerTcpPort.value) || 21650;
      data.bind_address = listenerTcpBind.value || '127.0.0.1';
    }

    console.log('Data to save:', JSON.stringify(data, null, 2));
    const result = await window.electronAPI.dbUpdateListener(selectedListenerId, data);
    console.log('Update result:', JSON.stringify(result, null, 2));

    await loadListeners();

    // Re-select the listener to refresh the form
    await selectListener(selectedListenerId);
    console.log('After reload - listener enabled:', listeners.find(l => l.id === selectedListenerId)?.enabled);

    // Notify dashboard to reload listeners
    notifyDashboardUpdate();

    showNotification('Listener saved', 'success');
  } catch (error) {
    console.error('Save error:', error);
    showNotification('Failed to save listener: ' + error.message, 'error');
  }
}

async function deleteListener() {
  if (!selectedListenerId) return;

  const listener = listeners.find(l => l.id === selectedListenerId);
  if (!confirm(`Delete listener "${listener.name}"? This will also delete all its forwarders.`)) {
    return;
  }

  try {
    await window.electronAPI.dbDeleteListener(selectedListenerId);
    selectedListenerId = null;
    await loadListeners();

    noSelection.classList.remove('hidden');
    listenerDetails.classList.add('hidden');

    // Notify dashboard to reload listeners
    notifyDashboardUpdate();

    showNotification('Listener deleted', 'success');
  } catch (error) {
    showNotification('Failed to delete listener: ' + error.message, 'error');
  }
}

// Forwarder Management
async function loadForwarders(listenerId) {
  try {
    const result = await window.electronAPI.dbGetForwarders(listenerId);
    console.log('loadForwarders result:', result);
    const forwarders = result.success ? result.data : [];
    console.log('forwarders array:', forwarders);
    renderForwarders(forwarders);
  } catch (error) {
    console.error('loadForwarders error:', error);
    showNotification('Failed to load forwarders: ' + error.message, 'error');
    renderForwarders([]); // Render empty list on error
  }
}

function renderForwarders(forwarders) {
  forwardersList.innerHTML = '';

  // Ensure forwarders is an array
  if (!Array.isArray(forwarders)) {
    console.error('renderForwarders received non-array:', forwarders);
    forwarders = [];
  }

  if (forwarders.length === 0) {
    noForwarders.classList.remove('hidden');
    return;
  }

  noForwarders.classList.add('hidden');

  forwarders.forEach(fwd => {
    const item = document.createElement('div');
    item.className = 'p-3 bg-proxy-gray border border-proxy-gray-light rounded';

    const protocol = fwd.protocol.toUpperCase();
    const statusColor = fwd.enabled ? 'text-green-400' : 'text-gray-500';
    const statusText = fwd.enabled ? 'Enabled' : 'Disabled';

    item.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium text-sm">${escapeHtml(fwd.name)}</span>
            <span class="text-xs ${statusColor}">${statusText}</span>
          </div>
          <div class="text-xs text-gray-400">
            ${protocol} ${fwd.host}:${fwd.port}
          </div>
        </div>
        <div class="flex gap-2">
          <button class="text-xs text-proxy-accent hover:text-proxy-accent-light" onclick="editForwarder(${fwd.id})">
            Edit
          </button>
          <button class="text-xs text-red-400 hover:text-red-300" onclick="deleteForwarder(${fwd.id})">
            Delete
          </button>
        </div>
      </div>
    `;

    forwardersList.appendChild(item);
  });
}

function showAddForwarderModal() {
  if (!selectedListenerId) return;

  editingForwarderId = null;
  forwarderModalTitle.textContent = 'Add Forwarder';
  fwdName.value = '';
  fwdProtocol.value = 'tcp';
  fwdHost.value = '127.0.0.1';
  fwdPort.value = '21600';
  fwdEnabled.checked = true;
  forwarderModal.classList.remove('hidden');
}

window.editForwarder = async function(id) {
  editingForwarderId = id;
  forwarderModalTitle.textContent = 'Edit Forwarder';

  try {
    const result = await window.electronAPI.dbGetForwarder(id);
    if (result.success && result.data) {
      const forwarder = result.data;
      fwdName.value = forwarder.name;
      fwdProtocol.value = forwarder.protocol;
      fwdHost.value = forwarder.host;
      fwdPort.value = forwarder.port;
      fwdEnabled.checked = !!forwarder.enabled; // Convert to boolean
      forwarderModal.classList.remove('hidden');
    }
  } catch (error) {
    showNotification('Failed to load forwarder: ' + error.message, 'error');
  }
};

window.deleteForwarder = async function(id) {
  if (!confirm('Delete this forwarder?')) return;

  try {
    await window.electronAPI.dbDeleteForwarder(id);
    await loadForwarders(selectedListenerId);
    showNotification('Forwarder deleted', 'success');
  } catch (error) {
    showNotification('Failed to delete forwarder: ' + error.message, 'error');
  }
};

function hideForwarderModal() {
  forwarderModal.classList.add('hidden');
  editingForwarderId = null;
}

async function saveForwarder() {
  if (!selectedListenerId) return;

  const data = {
    name: fwdName.value,
    protocol: fwdProtocol.value,
    host: fwdHost.value,
    port: parseInt(fwdPort.value) || 21600,
    enabled: fwdEnabled.checked ? 1 : 0
  };

  try {
    if (editingForwarderId) {
      await window.electronAPI.dbUpdateForwarder(editingForwarderId, data);
      showNotification('Forwarder updated', 'success');
    } else {
      await window.electronAPI.dbCreateForwarder(selectedListenerId, data);
      showNotification('Forwarder created', 'success');
    }

    hideForwarderModal();
    await loadForwarders(selectedListenerId);
  } catch (error) {
    showNotification('Failed to save forwarder: ' + error.message, 'error');
  }
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type) {
  const color = type === 'success' ? 'text-green-400' : 'text-red-400';
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${color} bg-proxy-gray border border-current rounded-lg px-4 py-3 shadow-lg z-50`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Notify dashboard to reload listeners
function notifyDashboardUpdate() {
  // Trigger a custom event that the dashboard can listen to
  window.dispatchEvent(new CustomEvent('listeners-changed'));
}

// Expose init for view switching
window.settingsInit = init;

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
