// Settings window renderer - Database-backed multi-transmitter UI

// State
let transmitters = [];
let selectedTransmitterId = null;
let editingReceiverId = null;
let isInitialized = false;

// DOM Elements (initialized lazily)
let transmittersList;
let noSelection;
let transmitterDetails;
let receiversList;
let noReceivers;
let receiverModal;

// Buttons (will be initialized in init())
let btnClose;
let btnAddTransmitter;
let btnSaveTransmitter;
let btnDeleteTransmitter;
let btnAddReceiver;
let btnSaveReceiver;
let btnCancelReceiver;

// Transmitter form fields (initialized lazily)
let txName;
let txProtocol;
let txPort;
let txBind;
let txTcpPort;
let txTcpBind;
let txEnabled;
let txUdpFields;
let txTcpFields;

// Receiver form fields (initialized lazily)
let rxName;
let rxProtocol;
let rxHost;
let rxPort;
let rxEnabled;
let receiverModalTitle;

// Initialize
async function init() {
  // Get all DOM elements
  transmittersList = document.getElementById('transmitters-list');
  noSelection = document.getElementById('no-selection');
  transmitterDetails = document.getElementById('transmitter-details');
  receiversList = document.getElementById('receivers-list');
  noReceivers = document.getElementById('no-receivers');
  receiverModal = document.getElementById('receiver-modal');

  // Buttons
  btnClose = document.getElementById('btn-close-settings');
  btnAddTransmitter = document.getElementById('btn-add-transmitter');
  btnSaveTransmitter = document.getElementById('btn-save-transmitter');
  btnDeleteTransmitter = document.getElementById('btn-delete-transmitter');
  btnAddReceiver = document.getElementById('btn-add-receiver');
  btnSaveReceiver = document.getElementById('btn-save-receiver');
  btnCancelReceiver = document.getElementById('btn-cancel-receiver');

  // Transmitter form fields
  txName = document.getElementById('tx-name');
  txProtocol = document.getElementById('tx-protocol');
  txPort = document.getElementById('tx-port');
  txBind = document.getElementById('tx-bind');
  txTcpPort = document.getElementById('tx-tcp-port');
  txTcpBind = document.getElementById('tx-tcp-bind');
  txEnabled = document.getElementById('tx-enabled');
  txUdpFields = document.getElementById('tx-udp-fields');
  txTcpFields = document.getElementById('tx-tcp-fields');

  // Receiver form fields
  rxName = document.getElementById('rx-name');
  rxProtocol = document.getElementById('rx-protocol');
  rxHost = document.getElementById('rx-host');
  rxPort = document.getElementById('rx-port');
  rxEnabled = document.getElementById('rx-enabled');
  receiverModalTitle = document.getElementById('receiver-modal-title');

  // Only set up event listeners once
  if (!isInitialized) {
    // Event listeners
    if (btnClose) btnClose.addEventListener('click', closeSettings);
    if (btnAddTransmitter) btnAddTransmitter.addEventListener('click', addTransmitter);
    if (btnSaveTransmitter) btnSaveTransmitter.addEventListener('click', saveTransmitter);
    if (btnDeleteTransmitter) btnDeleteTransmitter.addEventListener('click', deleteTransmitter);
    if (btnAddReceiver) btnAddReceiver.addEventListener('click', showAddReceiverModal);
    if (btnSaveReceiver) btnSaveReceiver.addEventListener('click', saveReceiver);
    if (btnCancelReceiver) btnCancelReceiver.addEventListener('click', hideReceiverModal);

    if (txProtocol) txProtocol.addEventListener('change', updateProtocolFields);

    window.addEventListener('keydown', handleEscapeKey);

    isInitialized = true;
  }

  // Load transmitters (always refresh when opening settings)
  await loadTransmitters();
}

function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('receiver-modal');
    if (modal && !modal.classList.contains('hidden')) {
      hideReceiverModal();
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

// Transmitter Management
async function loadTransmitters() {
  try {
    const result = await window.electronAPI.dbGetTransmitters();
    transmitters = result.success ? result.data : [];
    renderTransmittersList();

    if (transmitters.length > 0 && !selectedTransmitterId) {
      selectTransmitter(transmitters[0].id);
    }
  } catch (error) {
    showNotification('Failed to load transmitters: ' + error.message, 'error');
  }
}

function renderTransmittersList() {
  transmittersList.innerHTML = '';

  if (transmitters.length === 0) {
    transmittersList.innerHTML = '<div class="text-center py-8 text-gray-500 text-sm">No transmitters configured</div>';
    return;
  }

  transmitters.forEach(tx => {
    const item = document.createElement('div');
    item.className = `p-3 rounded cursor-pointer transition-colors ${
      tx.id === selectedTransmitterId
        ? 'bg-proxy-accent/20 border border-proxy-accent'
        : 'hover:bg-proxy-gray-light/20 border border-transparent'
    }`;
    item.onclick = () => selectTransmitter(tx.id);

    const protocol = tx.protocol.toUpperCase();
    const statusColor = tx.enabled ? 'text-green-400' : 'text-gray-500';
    const statusText = tx.enabled ? 'Enabled' : 'Disabled';

    item.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-medium text-sm">${escapeHtml(tx.name)}</span>
        <span class="text-xs ${statusColor}">${statusText}</span>
      </div>
      <div class="text-xs text-gray-400">
        ${protocol} :${tx.port}
      </div>
    `;

    transmittersList.appendChild(item);
  });
}

async function selectTransmitter(id) {
  selectedTransmitterId = id;
  renderTransmittersList();

  const tx = transmitters.find(t => t.id === id);
  if (!tx) return;

  // Show details panel
  noSelection.classList.add('hidden');
  transmitterDetails.classList.remove('hidden');

  // Populate form
  txName.value = tx.name;
  txProtocol.value = tx.protocol;
  txEnabled.checked = !!tx.enabled; // Convert to boolean

  txPort.value = tx.port || '';
  txBind.value = tx.bind_address || '127.0.0.1';
  txTcpPort.value = tx.port || '';
  txTcpBind.value = tx.bind_address || '127.0.0.1';

  updateProtocolFields();

  // Load receivers
  await loadReceivers(id);
}

function updateProtocolFields() {
  if (txProtocol.value === 'udp') {
    txUdpFields.classList.remove('hidden');
    txTcpFields.classList.add('hidden');
  } else {
    txUdpFields.classList.add('hidden');
    txTcpFields.classList.remove('hidden');
  }
}

async function addTransmitter() {
  try {
    const result = await window.electronAPI.dbCreateTransmitter({
      name: 'New Transmitter',
      protocol: 'udp',
      port: 21650,
      bind_address: '127.0.0.1',
      enabled: true
    });

    await loadTransmitters();
    if (result.success && result.data) {
      selectTransmitter(result.data.id);
    }

    // Notify dashboard to reload transmitters
    notifyDashboardUpdate();

    showNotification('Transmitter created', 'success');
  } catch (error) {
    showNotification('Failed to create transmitter: ' + error.message, 'error');
  }
}

async function saveTransmitter() {
  if (!selectedTransmitterId) return;

  try {
    console.log('=== SAVE TRANSMITTER DEBUG ===');
    console.log('txEnabled element:', txEnabled);
    console.log('txEnabled.checked:', txEnabled.checked);
    console.log('txEnabled.type:', txEnabled.type);

    const data = {
      name: txName.value,
      protocol: txProtocol.value,
      enabled: txEnabled.checked ? 1 : 0
    };

    if (txProtocol.value === 'udp') {
      data.port = parseInt(txPort.value) || 21650;
      data.bind_address = txBind.value || '127.0.0.1';
    } else {
      data.port = parseInt(txTcpPort.value) || 21650;
      data.bind_address = txTcpBind.value || '127.0.0.1';
    }

    console.log('Data to save:', JSON.stringify(data, null, 2));
    const result = await window.electronAPI.dbUpdateTransmitter(selectedTransmitterId, data);
    console.log('Update result:', JSON.stringify(result, null, 2));

    await loadTransmitters();

    // Re-select the transmitter to refresh the form
    await selectTransmitter(selectedTransmitterId);
    console.log('After reload - transmitter enabled:', transmitters.find(t => t.id === selectedTransmitterId)?.enabled);

    // Notify dashboard to reload transmitters
    notifyDashboardUpdate();

    showNotification('Transmitter saved', 'success');
  } catch (error) {
    console.error('Save error:', error);
    showNotification('Failed to save transmitter: ' + error.message, 'error');
  }
}

async function deleteTransmitter() {
  if (!selectedTransmitterId) return;

  const tx = transmitters.find(t => t.id === selectedTransmitterId);
  if (!confirm(`Delete transmitter "${tx.name}"? This will also delete all its receivers.`)) {
    return;
  }

  try {
    await window.electronAPI.dbDeleteTransmitter(selectedTransmitterId);
    selectedTransmitterId = null;
    await loadTransmitters();

    noSelection.classList.remove('hidden');
    transmitterDetails.classList.add('hidden');

    // Notify dashboard to reload transmitters
    notifyDashboardUpdate();

    showNotification('Transmitter deleted', 'success');
  } catch (error) {
    showNotification('Failed to delete transmitter: ' + error.message, 'error');
  }
}

// Receiver Management
async function loadReceivers(transmitterId) {
  try {
    const result = await window.electronAPI.dbGetReceivers(transmitterId);
    console.log('loadReceivers result:', result);
    const receivers = result.success ? result.data : [];
    console.log('receivers array:', receivers);
    renderReceivers(receivers);
  } catch (error) {
    console.error('loadReceivers error:', error);
    showNotification('Failed to load receivers: ' + error.message, 'error');
    renderReceivers([]); // Render empty list on error
  }
}

function renderReceivers(receivers) {
  receiversList.innerHTML = '';

  // Ensure receivers is an array
  if (!Array.isArray(receivers)) {
    console.error('renderReceivers received non-array:', receivers);
    receivers = [];
  }

  if (receivers.length === 0) {
    noReceivers.classList.remove('hidden');
    return;
  }

  noReceivers.classList.add('hidden');

  receivers.forEach(rx => {
    const item = document.createElement('div');
    item.className = 'p-3 bg-proxy-gray border border-proxy-gray-light rounded';

    const protocol = rx.protocol.toUpperCase();
    const statusColor = rx.enabled ? 'text-green-400' : 'text-gray-500';
    const statusText = rx.enabled ? 'Enabled' : 'Disabled';

    item.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium text-sm">${escapeHtml(rx.name)}</span>
            <span class="text-xs ${statusColor}">${statusText}</span>
          </div>
          <div class="text-xs text-gray-400">
            ${protocol} ${rx.host}:${rx.port}
          </div>
        </div>
        <div class="flex gap-2">
          <button class="text-xs text-proxy-accent hover:text-proxy-accent-light" onclick="editReceiver(${rx.id})">
            Edit
          </button>
          <button class="text-xs text-red-400 hover:text-red-300" onclick="deleteReceiver(${rx.id})">
            Delete
          </button>
        </div>
      </div>
    `;

    receiversList.appendChild(item);
  });
}

function showAddReceiverModal() {
  if (!selectedTransmitterId) return;

  editingReceiverId = null;
  receiverModalTitle.textContent = 'Add Receiver';
  rxName.value = '';
  rxProtocol.value = 'tcp';
  rxHost.value = '127.0.0.1';
  rxPort.value = '21600';
  rxEnabled.checked = true;
  receiverModal.classList.remove('hidden');
}

window.editReceiver = async function(id) {
  editingReceiverId = id;
  receiverModalTitle.textContent = 'Edit Receiver';

  try {
    const result = await window.electronAPI.dbGetReceiver(id);
    if (result.success && result.data) {
      const receiver = result.data;
      rxName.value = receiver.name;
      rxProtocol.value = receiver.protocol;
      rxHost.value = receiver.host;
      rxPort.value = receiver.port;
      rxEnabled.checked = !!receiver.enabled; // Convert to boolean
      receiverModal.classList.remove('hidden');
    }
  } catch (error) {
    showNotification('Failed to load receiver: ' + error.message, 'error');
  }
};

window.deleteReceiver = async function(id) {
  if (!confirm('Delete this receiver?')) return;

  try {
    await window.electronAPI.dbDeleteReceiver(id);
    await loadReceivers(selectedTransmitterId);
    showNotification('Receiver deleted', 'success');
  } catch (error) {
    showNotification('Failed to delete receiver: ' + error.message, 'error');
  }
};

function hideReceiverModal() {
  receiverModal.classList.add('hidden');
  editingReceiverId = null;
}

async function saveReceiver() {
  if (!selectedTransmitterId) return;

  const data = {
    name: rxName.value,
    protocol: rxProtocol.value,
    host: rxHost.value,
    port: parseInt(rxPort.value) || 21600,
    enabled: rxEnabled.checked ? 1 : 0
  };

  try {
    if (editingReceiverId) {
      await window.electronAPI.dbUpdateReceiver(editingReceiverId, data);
      showNotification('Receiver updated', 'success');
    } else {
      await window.electronAPI.dbCreateReceiver(selectedTransmitterId, data);
      showNotification('Receiver created', 'success');
    }

    hideReceiverModal();
    await loadReceivers(selectedTransmitterId);
  } catch (error) {
    showNotification('Failed to save receiver: ' + error.message, 'error');
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

// Notify dashboard to reload transmitters
function notifyDashboardUpdate() {
  // Trigger a custom event that the dashboard can listen to
  window.dispatchEvent(new CustomEvent('transmitters-changed'));
}

// Expose init for view switching
window.settingsInit = init;

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
