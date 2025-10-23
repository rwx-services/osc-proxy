// Renderer process - handles UI updates for multi-transmitter dashboard

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');

// Transmitters container
const transmittersContainer = document.getElementById('transmitters-container');
const noTransmitters = document.getElementById('no-transmitters');

// Aggregate metric displays
const metricRate = document.getElementById('metric-rate');
const metricAvgRate = document.getElementById('metric-avg-rate');
const metricPeakRate = document.getElementById('metric-peak-rate');
const metricLatency = document.getElementById('metric-latency');
const metricTotal = document.getElementById('metric-total');
const metricForwarded = document.getElementById('metric-forwarded');
const metricDropped = document.getElementById('metric-dropped');
const metricLoss = document.getElementById('metric-loss');

const rateSparkline = document.getElementById('rate-sparkline');

// State
let isRunning = false;
let rateHistory = [];
const MAX_SPARKLINE_POINTS = 30;

// Initialize
async function init() {
  // Get initial state
  const state = await window.electronAPI.getProxyState();
  updateProxyState(state);

  // Listen for updates from main process
  window.electronAPI.onMetricsUpdate(updateMetrics);
  window.electronAPI.onProxyStateChanged(updateProxyState);

  // Set up button handlers
  startButton.addEventListener('click', async () => {
    await window.electronAPI.startProxy();
  });

  stopButton.addEventListener('click', async () => {
    await window.electronAPI.stopProxy();
  });

  // Open settings button (in empty state)
  const openSettingsBtn = document.getElementById('btn-open-settings');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      window.electronAPI.openSettings();
    });
  }
}

function updateProxyState(state) {
  isRunning = state.running;

  // Update status indicator
  statusIndicator.className = 'status-indicator';
  if (state.running && state.connected) {
    statusIndicator.classList.add('status-connected');
    statusText.textContent = 'Connected';
  } else if (state.running) {
    statusIndicator.classList.add('status-disconnected');
    statusText.textContent = 'Starting...';
  } else {
    statusIndicator.classList.add('status-idle');
    statusText.textContent = 'Idle';
  }

  // Update button visibility
  if (state.running) {
    startButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
  } else {
    startButton.classList.remove('hidden');
    stopButton.classList.add('hidden');
  }

  // Reset metrics if stopped
  if (!state.running) {
    resetMetrics();
  }
}

function updateMetrics(metrics) {
  // Handle both old single-transmitter format and new multi-transmitter format
  if (metrics.aggregate && metrics.transmitters) {
    // New multi-transmitter format
    updateAggregateMetrics(metrics.aggregate);
    updateTransmitters(metrics.transmitters);
  } else {
    // Old single-transmitter format (fallback)
    updateAggregateMetrics(metrics);
  }

  // Update sparkline with aggregate rate
  const rate = metrics.aggregate ? metrics.aggregate.rate : metrics.rate;
  updateSparkline(rate || 0);
}

function updateAggregateMetrics(metrics) {
  // Update primary metrics
  metricRate.textContent = formatNumber(metrics.rate || 0, 1);
  metricAvgRate.textContent = formatNumber(metrics.avg_rate || metrics.avgRate || 0, 1);
  metricPeakRate.textContent = formatNumber(metrics.peak_rate || metrics.peakRate || 0, 1);

  // Update secondary metrics
  metricLatency.textContent = formatNumber(metrics.latency || 0, 2);
  metricTotal.textContent = formatNumber(metrics.total || 0);
  metricForwarded.textContent = formatNumber(metrics.forwarded || 0);
  metricDropped.textContent = formatNumber(metrics.dropped || 0);
  metricLoss.textContent = formatNumber(metrics.loss_pct || metrics.lossPct || 0, 1);
}

function updateTransmitters(transmitters) {
  // Clear existing transmitter cards except the no-transmitters message
  const existingCards = transmittersContainer.querySelectorAll('.transmitter-card');
  existingCards.forEach(card => card.remove());

  if (!transmitters || transmitters.length === 0) {
    noTransmitters.classList.remove('hidden');
    return;
  }

  noTransmitters.classList.add('hidden');

  // Create a card for each transmitter
  transmitters.forEach(tx => {
    const card = createTransmitterCard(tx);
    transmittersContainer.appendChild(card);
  });
}

function createTransmitterCard(tx) {
  const card = document.createElement('div');
  card.className = 'transmitter-card metric-card';

  const statusColor = tx.status === 'running' ? 'text-green-400' : 'text-gray-500';
  const statusIcon = tx.status === 'running' ? 'status-connected' : 'status-idle';

  card.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <div class="status-indicator ${statusIcon}"></div>
        <h3 class="text-sm font-semibold">${escapeHtml(tx.name || 'Unnamed')}</h3>
      </div>
      <span class="text-xs ${statusColor}">${tx.protocol ? tx.protocol.toUpperCase() : 'UDP'}</span>
    </div>

    <div class="grid grid-cols-2 gap-4 mb-3">
      <div>
        <div class="text-xs text-gray-400">Rate</div>
        <div class="text-lg font-bold tabular-nums text-green-400">${formatNumber(tx.rate || 0, 1)}</div>
        <div class="text-xs text-gray-500">msg/s</div>
      </div>
      <div>
        <div class="text-xs text-gray-400">Latency</div>
        <div class="text-lg font-bold tabular-nums">${formatNumber(tx.latency || 0, 2)}</div>
        <div class="text-xs text-gray-500">ms</div>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 text-xs mb-3">
      <div>
        <div class="text-gray-400">Total</div>
        <div class="font-mono">${formatNumber(tx.total || 0)}</div>
      </div>
      <div>
        <div class="text-gray-400">Forwarded</div>
        <div class="font-mono text-green-400">${formatNumber(tx.forwarded || 0)}</div>
      </div>
      <div>
        <div class="text-gray-400">Dropped</div>
        <div class="font-mono text-red-400">${formatNumber(tx.dropped || 0)}</div>
      </div>
    </div>

    <div class="text-xs text-gray-500 border-t border-proxy-gray-light pt-2">
      <div class="flex justify-between">
        <span>Listen:</span>
        <span class="font-mono">${tx.bind || tx.bind_address || '0.0.0.0'}:${tx.port || '-'}</span>
      </div>
      <div class="flex justify-between mt-1">
        <span>Receivers:</span>
        <span class="font-mono">${tx.receivers_count || 0}</span>
      </div>
    </div>
  `;

  return card;
}

function updateSparkline(rate) {
  rateHistory.push(rate);
  if (rateHistory.length > MAX_SPARKLINE_POINTS) {
    rateHistory.shift();
  }

  const maxRate = Math.max(...rateHistory, 1);

  rateSparkline.innerHTML = '';
  rateHistory.forEach(value => {
    const bar = document.createElement('div');
    const height = Math.max((value / maxRate) * 100, 2);
    bar.className = 'flex-1 bg-green-400/30 rounded-sm transition-all duration-300';
    bar.style.height = `${height}%`;
    rateSparkline.appendChild(bar);
  });
}

function resetMetrics() {
  metricRate.textContent = '0.0';
  metricAvgRate.textContent = '0.0';
  metricPeakRate.textContent = '0.0';
  metricLatency.textContent = '0.00';
  metricTotal.textContent = '0';
  metricForwarded.textContent = '0';
  metricDropped.textContent = '0';
  metricLoss.textContent = '0.0';

  rateHistory = [];
  rateSparkline.innerHTML = '';

  // Clear transmitter cards
  const existingCards = transmittersContainer.querySelectorAll('.transmitter-card');
  existingCards.forEach(card => card.remove());
  noTransmitters.classList.remove('hidden');
}

function formatNumber(value, decimals = 0) {
  if (typeof value !== 'number') {
    value = parseFloat(value) || 0;
  }

  if (decimals > 0) {
    return value.toFixed(decimals);
  }

  // Add commas for thousands
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
