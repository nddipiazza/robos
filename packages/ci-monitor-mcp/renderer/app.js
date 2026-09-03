'use strict';

let runs = [];
let selectedRunId = 'run-102';
let reqId = 1;

function logTrace(type, json) {
  const log = document.getElementById('trace-log');
  const entry = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${JSON.stringify(json, null, 2)}\n`;
  log.textContent = (log.textContent.startsWith('//') ? '' : log.textContent) + entry;
  log.scrollTop = log.scrollHeight;
}

async function sendMcpToolCall(name, args) {
  const id = reqId++;
  const request = {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  };
  logTrace('REQUEST', request);

  const response = await window.ciMcp.rpc(request);
  logTrace('RESPONSE', response);

  await load();
  return response;
}

async function load() {
  runs = await window.ciMcp.listRuns();
  render();
}

function render() {
  document.getElementById('stat-total-runs').textContent = runs.length;
  const passed = runs.filter(r => r.status === 'SUCCESS').length;
  const passRate = runs.length > 0 ? Math.round((passed / runs.length) * 100) : 0;
  document.getElementById('stat-pass-rate').textContent = `${passRate}%`;

  const listEl = document.getElementById('runs-list');
  listEl.innerHTML = runs.map(r => `
    <div class="run-item ${r.id === selectedRunId ? 'selected' : ''}" onclick="window.selectRun('${r.id}')">
      <div class="run-header">
        <span class="run-id">${r.id} &middot; <code>${r.branch}</code></span>
        <span class="status-badge ${r.status.toLowerCase()}">${r.status}</span>
      </div>
      <div class="run-meta">
        Commit: <code>${r.commit}</code> &middot; Passed: ${r.testsPassed} &middot; Failed: ${r.testsFailed} &middot; Duration: ${r.durationSec}s
      </div>
    </div>
  `).join('');

  renderLogs();
}

async function renderLogs() {
  const logsEl = document.getElementById('run-logs-text');
  const run = runs.find(r => r.id === selectedRunId) || runs[0];
  if (!run) {
    logsEl.textContent = '// No run selected';
    return;
  }
  logsEl.textContent = run.logs || '// No logs available';
}

window.selectRun = function(id) {
  selectedRunId = id;
  render();
  sendMcpToolCall('robos_ci_get_logs', { runId: id });
};

window.inspectFailures = async function(runId = selectedRunId) {
  return sendMcpToolCall('robos_ci_get_failures', { runId });
};

window.retryFailed = async function(runId = selectedRunId) {
  return sendMcpToolCall('robos_ci_retry_run', { runId });
};

document.getElementById('btn-inspect-failures').addEventListener('click', () => {
  window.inspectFailures();
});

document.getElementById('btn-retry-failed').addEventListener('click', () => {
  window.retryFailed();
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '// Log cleared.';
});

load();
