// Renderer process - handles UI updates

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');

// Metric displays
const metricRate = document.getElementById('metric-rate');
const metricAvgRate = document.getElementById('metric-avg-rate');
const metricPeakRate = document.getElementById('metric-peak-rate');
const metricLatency = document.getElementById('metric-latency');
const metricTotal = document.getElementById('metric-total');
const metricForwarded = document.getElementById('metric-forwarded');
const metricDropped = document.getElementById('metric-dropped');
const metricLoss = document.getElementById('metric-loss');

// Connection displays
const inboundType = document.getElementById('inbound-type');
const inboundBind = document.getElementById('inbound-bind');
const inboundPort = document.getElementById('inbound-port');
const inboundStatus = document.getElementById('inbound-status');
const inboundStatusIndicator = document.getElementById('inbound-status-indicator');

const outboundType = document.getElementById('outbound-type');
const outboundHost = document.getElementById('outbound-host');
const outboundPort = document.getElementById('outbound-port');
const outboundStatus = document.getElementById('outbound-status');
const outboundStatusIndicator = document.getElementById('outbound-status-indicator');

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

  // Update metrics if provided
  if (state.metrics) {
    updateMetrics(state.metrics);
  }
}

function updateMetrics(metrics) {
  // Update primary metrics
  metricRate.textContent = formatNumber(metrics.rate || 0, 1);
  metricAvgRate.textContent = formatNumber(metrics.avgRate || 0, 1);
  metricPeakRate.textContent = formatNumber(metrics.peakRate || 0, 1);

  // Update secondary metrics
  metricLatency.textContent = formatNumber(metrics.latency || 0, 2);
  metricTotal.textContent = formatNumber(metrics.total || 0);
  metricForwarded.textContent = formatNumber(metrics.forwarded || 0);
  metricDropped.textContent = formatNumber(metrics.dropped || 0);
  metricLoss.textContent = formatNumber(metrics.lossPct || 0, 1);

  // Update connections
  if (metrics.connections) {
    updateConnections(metrics.connections);
  }

  // Update sparkline
  updateSparkline(metrics.rate || 0);
}

function updateConnections(connections) {
  // Update inbound connection
  if (connections.inbound) {
    const inbound = connections.inbound;
    inboundType.textContent = inbound.type || '-';
    inboundBind.textContent = inbound.bind || '-';
    inboundPort.textContent = inbound.port || '-';
    inboundStatus.textContent = inbound.status || '-';

    // Update status indicator
    inboundStatusIndicator.className = 'status-indicator';
    if (inbound.status === 'listening') {
      inboundStatusIndicator.classList.add('status-connected');
    } else {
      inboundStatusIndicator.classList.add('status-disconnected');
    }
  }

  // Update outbound connection
  if (connections.outbound) {
    const outbound = connections.outbound;
    outboundType.textContent = outbound.type || '-';
    outboundHost.textContent = outbound.host || '-';
    outboundPort.textContent = outbound.port || '-';
    outboundStatus.textContent = outbound.status || '-';

    // Update status indicator
    outboundStatusIndicator.className = 'status-indicator';
    if (outbound.status === 'connected') {
      outboundStatusIndicator.classList.add('status-connected');
    } else {
      outboundStatusIndicator.classList.add('status-disconnected');
    }
  }
}

function updateSparkline(rate) {
  rateHistory.push(rate);
  if (rateHistory.length > MAX_SPARKLINE_POINTS) {
    rateHistory.shift();
  }

  const maxRate = Math.max(...rateHistory, 1);

  rateSparkline.innerHTML = rateHistory.map(value => {
    const height = (value / maxRate) * 100;
    const color = value > maxRate * 0.7 ? 'bg-green-500' :
                  value > maxRate * 0.4 ? 'bg-blue-500' :
                  'bg-gray-600';

    return `<div class="${color} rounded-t flex-1 transition-all duration-300" style="height: ${height}%"></div>`;
  }).join('');
}

function formatNumber(value, decimals = 0) {
  if (typeof value !== 'number') {
    value = parseFloat(value) || 0;
  }

  if (decimals > 0) {
    return value.toFixed(decimals);
  }

  return value.toLocaleString();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
