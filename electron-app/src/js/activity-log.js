// Activity Log window renderer

const activityLog = document.getElementById('activity-log');
const btnClearLog = document.getElementById('btn-clear-log');
const btnClose = document.getElementById('btn-close');

const MAX_LOG_ENTRIES = 500;

// Initialize
async function init() {
  btnClearLog.addEventListener('click', clearLog);
  btnClose.addEventListener('click', closeWindow);

  // ESC key to close
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeWindow();
    }
  });

  // Listen for log entries from main process
  window.electronAPI.onProxyLog(addLogEntry);

  addLogEntry({ message: 'Activity log window opened', type: 'info' });
}

function addLogEntry(log) {
  const entry = document.createElement('div');
  const timestamp = new Date().toLocaleTimeString();

  const typeClass = log.type === 'error' ? 'log-error' :
                    log.type === 'success' ? 'log-success' :
                    'log-info';

  entry.className = typeClass;
  entry.textContent = `[${timestamp}] ${log.message}`;

  // Remove placeholder if exists
  if (activityLog.querySelector('.text-gray-500')) {
    activityLog.innerHTML = '';
  }

  activityLog.insertBefore(entry, activityLog.firstChild);

  // Limit log entries
  while (activityLog.children.length > MAX_LOG_ENTRIES) {
    activityLog.removeChild(activityLog.lastChild);
  }
}

function clearLog() {
  activityLog.innerHTML = '<div class="text-gray-500 text-center py-8">Log cleared</div>';
}

function closeWindow() {
  window.close();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
