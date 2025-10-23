// Settings window renderer - Database-backed multi-transmitter UI

// State
let transmitters = [];
let selectedTransmitterId = null;
let editingReceiverId = null;

// DOM Elements
const transmittersList = document.getElementById('transmitters-list');
const noSelection = document.getElementById('no-selection');
const transmitterDetails = document.getElementById('transmitter-details');
const receiversList = document.getElementById('receivers-list');
const noReceivers = document.getElementById('no-receivers');
const receiverModal = document.getElementById('receiver-modal');

// Buttons
const btnClose = document.getElementById('btn-close');
const btnAddTransmitter = document.getElementById('btn-add-transmitter');
const btnSaveTransmitter = document.getElementById('btn-save-transmitter');
const btnDeleteTransmitter = document.getElementById('btn-delete-transmitter');
const btnAddReceiver = document.getElementById('btn-add-receiver');
const btnSaveReceiver = document.getElementById('btn-save-receiver');
const btnCancelReceiver = document.getElementById('btn-cancel-receiver');

// Transmitter form fields
const txName = document.getElementById('tx-name');
const txProtocol = document.getElementById('tx-protocol');
const txPort = document.getElementById('tx-port');
const txBind = document.getElementById('tx-bind');
const txTcpPort = document.getElementById('tx-tcp-port');
const txTcpBind = document.getElementById('tx-tcp-bind');
const txEnabled = document.getElementById('tx-enabled');
const txUdpFields = document.getElementById('tx-udp-fields');
const txTcpFields = document.getElementById('tx-tcp-fields');

// Receiver form fields
const rxName = document.getElementById('rx-name');
const rxProtocol = document.getElementById('rx-protocol');
const rxHost = document.getElementById('rx-host');
const rxPort = document.getElementById('rx-port');
const rxEnabled = document.getElementById('rx-enabled');
const receiverModalTitle = document.getElementById('receiver-modal-title');

// Initialize
async function init() {
  // Event listeners
  btnClose.addEventListener('click', closeWindow);
  btnAddTransmitter.addEventListener('click', addTransmitter);
  btnSaveTransmitter.addEventListener('click', saveTransmitter);
  btnDeleteTransmitter.addEventListener('click', deleteTransmitter);
  btnAddReceiver.addEventListener('click', showAddReceiverModal);
  btnSaveReceiver.addEventListener('click', saveReceiver);
  btnCancelReceiver.addEventListener('click', hideReceiverModal);

  txProtocol.addEventListener('change', updateProtocolFields);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!receiverModal.classList.contains('hidden')) {
        hideReceiverModal();
      } else {
        closeWindow();
      }
    }
  });

  // Load transmitters
  await loadTransmitters();
}

function closeWindow() {
  window.close();
}

// Transmitter Management
async function loadTransmitters() {
  try {
    transmitters = await window.electronAPI.dbGetTransmitters();
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
        ${protocol} :${tx.port || tx.tcp_port}
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
  txEnabled.checked = tx.enabled === 1;

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
    selectTransmitter(result.id);
    showNotification('Transmitter created', 'success');
  } catch (error) {
    showNotification('Failed to create transmitter: ' + error.message, 'error');
  }
}

async function saveTransmitter() {
  if (!selectedTransmitterId) return;

  try {
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

    await window.electronAPI.dbUpdateTransmitter(selectedTransmitterId, data);
    await loadTransmitters();
    showNotification('Transmitter saved', 'success');
  } catch (error) {
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

    showNotification('Transmitter deleted', 'success');
  } catch (error) {
    showNotification('Failed to delete transmitter: ' + error.message, 'error');
  }
}

// Receiver Management
async function loadReceivers(transmitterId) {
  try {
    const receivers = await window.electronAPI.dbGetReceivers(transmitterId);
    renderReceivers(receivers);
  } catch (error) {
    showNotification('Failed to load receivers: ' + error.message, 'error');
  }
}

function renderReceivers(receivers) {
  receiversList.innerHTML = '';

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
    const receiver = await window.electronAPI.dbGetReceiver(id);
    rxName.value = receiver.name;
    rxProtocol.value = receiver.protocol;
    rxHost.value = receiver.host;
    rxPort.value = receiver.port;
    rxEnabled.checked = receiver.enabled === 1;
    receiverModal.classList.remove('hidden');
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

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
