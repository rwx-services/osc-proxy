// Renderer process - handles UI updates for multi-listener dashboard

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');

// Listeners container
const listenersContainer = document.getElementById('listeners-container');
const noListeners = document.getElementById('no-listeners');

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

  // Load listeners from database to show even when stopped
  await loadListenersFromDatabase();

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

  // Settings close button
  document.getElementById('btn-close-settings').addEventListener('click', () => showView('dashboard'));

  // Open settings button (in empty state)
  const openSettingsBtn = document.getElementById('btn-open-settings');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => showView('settings'));
  }

  // Listen for settings open command from main process
  window.electronAPI.onShowSettings(() => showView('settings'));

  // Listen for listener changes from settings view
  window.addEventListener('listeners-changed', () => {
    loadListenersFromDatabase();
  });
}

function showView(view) {
  const dashboard = document.getElementById('view-dashboard');
  const settings = document.getElementById('view-settings');
  const dashboardHeader = document.getElementById('dashboard-header');
  const settingsHeader = document.getElementById('settings-header');

  if (view === 'dashboard') {
    dashboard.classList.remove('hidden');
    settings.classList.add('hidden');
    dashboardHeader.classList.remove('hidden');
    settingsHeader.classList.add('hidden');

    // Reload listeners on dashboard when switching back
    loadListenersFromDatabase();
  } else if (view === 'settings') {
    dashboard.classList.add('hidden');
    settings.classList.remove('hidden');
    dashboardHeader.classList.add('hidden');
    settingsHeader.classList.remove('hidden');

    // Trigger settings init if it exists
    if (window.settingsInit) {
      window.settingsInit();
    }
  }
}

// Expose showView globally for menu commands
window.showView = showView;

async function loadListenersFromDatabase() {
  try {
    const result = await window.electronAPI.dbGetListeners();
    if (result.success && result.data && result.data.length > 0) {
      // Show listeners in idle/stopped state with their forwarders
      const listeners = result.data.map(listener => ({
        name: listener.name,
        protocol: listener.protocol,
        status: 'stopped',
        rate: 0,
        avg_rate: 0,
        peak_rate: 0,
        latency: 0,
        total: 0,
        forwarded: 0,
        dropped: 0,
        bind: listener.bind_address,
        bind_address: listener.bind_address,
        port: listener.port,
        forwarders: (listener.forwarders || []).map(fwd => ({
          name: fwd.name,
          protocol: fwd.protocol,
          host: fwd.host,
          port: fwd.port,
          connected: false,
          latency: 0,
          forwarded: 0,
          dropped: 0,
          failed: 0
        })),
        forwarders_count: listener.forwarders ? listener.forwarders.length : 0
      }));
      updateListeners(listeners);
    }
  } catch (error) {
    console.error('Failed to load listeners from database:', error);
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
  // Handle both old single-listener format and new multi-listener format
  if (metrics.aggregate && metrics.listeners) {
    // New multi-listener format
    updateAggregateMetrics(metrics.aggregate);
    updateListeners(metrics.listeners);
  } else {
    // Old single-listener format (fallback)
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

function updateListeners(listeners) {
  // Clear existing listener cards except the no-listeners message
  const existingCards = listenersContainer.querySelectorAll('.listener-card');
  existingCards.forEach(card => card.remove());

  if (!listeners || listeners.length === 0) {
    noListeners.classList.remove('hidden');
    return;
  }

  noListeners.classList.add('hidden');

  // Adjust grid layout based on listener count
  if (listeners.length === 1) {
    listenersContainer.className = 'grid grid-cols-1 gap-4 mb-6';
  } else {
    listenersContainer.className = 'grid grid-cols-2 gap-4 mb-6';
  }

  // Create a card for each listener
  listeners.forEach(listener => {
    const card = createListenerCard(listener);
    listenersContainer.appendChild(card);
  });
}

function createListenerCard(listener) {
  const card = document.createElement('div');
  card.className = 'listener-card metric-card';

  const statusColor = listener.status === 'running' ? 'text-green-400' : 'text-gray-500';
  const statusIcon = listener.status === 'running' ? 'status-connected' : 'status-idle';

  // Listener header and metrics
  let html = `
    <div class="flex items-center justify-between mb-4 pb-3 border-b border-proxy-gray-light">
      <div class="flex items-center gap-3">
        <div class="status-indicator ${statusIcon}"></div>
        <div>
          <h3 class="text-lg font-semibold">${escapeHtml(listener.name || 'Unnamed')}</h3>
          <div class="text-xs text-gray-400 mt-0.5">
            ${listener.protocol ? listener.protocol.toUpperCase() : 'UDP'} · ${listener.bind_address || '0.0.0.0'}:${listener.port || '-'}
          </div>
        </div>
      </div>
      <div class="text-xs ${statusColor} font-medium">${listener.status === 'running' ? 'Running' : 'Stopped'}</div>
    </div>

    <div class="grid grid-cols-5 gap-4 mb-4">
      <div>
        <div class="text-xs text-gray-400">Rate</div>
        <div class="text-xl font-bold tabular-nums text-green-400">${formatNumber(listener.rate || 0, 1)}</div>
        <div class="text-xs text-gray-500">msg/s</div>
      </div>
      <div>
        <div class="text-xs text-gray-400">Avg Rate</div>
        <div class="text-xl font-bold tabular-nums">${formatNumber(listener.avg_rate || 0, 1)}</div>
        <div class="text-xs text-gray-500">msg/s</div>
      </div>
      <div>
        <div class="text-xs text-gray-400">Peak Rate</div>
        <div class="text-xl font-bold tabular-nums">${formatNumber(listener.peak_rate || 0, 1)}</div>
        <div class="text-xs text-gray-500">msg/s</div>
      </div>
      <div>
        <div class="text-xs text-gray-400">Total</div>
        <div class="text-xl font-bold tabular-nums">${formatNumber(listener.total || 0)}</div>
        <div class="text-xs text-gray-500">messages</div>
      </div>
      <div>
        <div class="text-xs text-gray-400">Forwarded</div>
        <div class="text-xl font-bold tabular-nums text-green-400">${formatNumber(listener.forwarded || 0)}</div>
        <div class="text-xs text-gray-500">messages</div>
      </div>
    </div>
  `;

  // Forwarders table
  if (listener.forwarders && listener.forwarders.length > 0) {
    html += `
      <div class="mt-4">
        <h4 class="text-sm font-semibold mb-2 text-gray-300">Forwarders</h4>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="text-gray-400 border-b border-proxy-gray-light">
              <tr>
                <th class="text-left py-2 px-2 font-medium">Name</th>
                <th class="text-left py-2 px-2 font-medium">Protocol</th>
                <th class="text-left py-2 px-2 font-medium">Address</th>
                <th class="text-right py-2 px-2 font-medium">Latency</th>
                <th class="text-right py-2 px-2 font-medium">Forwarded</th>
                <th class="text-right py-2 px-2 font-medium">Dropped</th>
                <th class="text-right py-2 px-2 font-medium">Failed</th>
                <th class="text-center py-2 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
    `;

    listener.forwarders.forEach(fwd => {
      const connectedColor = fwd.connected ? 'text-green-400' : 'text-red-400';
      const connectedText = fwd.connected ? '●' : '○';
      html += `
              <tr class="border-b border-proxy-gray-light/30 hover:bg-proxy-gray-light/10">
                <td class="py-2 px-2 font-medium">${escapeHtml(fwd.name || 'Unnamed')}</td>
                <td class="py-2 px-2 text-gray-400">${(fwd.protocol || 'udp').toUpperCase()}</td>
                <td class="py-2 px-2 font-mono text-gray-400">${fwd.host}:${fwd.port}</td>
                <td class="py-2 px-2 text-right font-mono">${formatNumber(fwd.latency || 0, 2)} ms</td>
                <td class="py-2 px-2 text-right font-mono text-green-400">${formatNumber(fwd.forwarded || 0)}</td>
                <td class="py-2 px-2 text-right font-mono text-yellow-400">${formatNumber(fwd.dropped || 0)}</td>
                <td class="py-2 px-2 text-right font-mono text-red-400">${formatNumber(fwd.failed || 0)}</td>
                <td class="py-2 px-2 text-center ${connectedColor}">${connectedText}</td>
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="mt-4 text-center py-4 text-gray-500 text-sm border border-proxy-gray-light/30 rounded">
        No forwarders configured
      </div>
    `;
  }

  card.innerHTML = html;
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

  // Reload listeners from database in stopped state instead of clearing
  loadListenersFromDatabase();
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
