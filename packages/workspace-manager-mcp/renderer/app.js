'use strict';

let workspaces = [];
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

  const response = await window.wsMcp.rpc(request);
  logTrace('RESPONSE', response);

  await load();
  return response;
}

async function load() {
  workspaces = await window.wsMcp.list();
  render();
}

function render() {
  document.getElementById('stat-total-ws').textContent = workspaces.length;
  const active = workspaces.find(w => w.status === 'ACTIVE') || workspaces[0];
  document.getElementById('stat-active-ws').textContent = active ? active.name : 'None';
  document.getElementById('stat-devserver').textContent = active?.devServer?.running
    ? `Port ${active.devServer.port} (Live)`
    : 'Stopped';

  const grid = document.getElementById('ws-grid');
  grid.innerHTML = workspaces.map(w => `
    <div class="ws-card ${w.status === 'ACTIVE' ? 'active' : ''}" id="card-${w.id}">
      <div class="ws-header">
        <span class="ws-title">${w.name}</span>
        <span class="ws-status-badge ${w.status.toLowerCase()}">${w.status}</span>
      </div>
      <div class="ws-meta">
        <div><strong>Repo:</strong> <code>${w.repo}</code> &middot; <strong>Branch:</strong> <code>${w.branch}</code></div>
        <div><strong>Path:</strong> <code>${w.path}</code></div>
        <div><strong>DevServer:</strong> ${w.devServer?.running ? `🟢 ${w.devServer.url}` : '⚪ Inactive'}</div>
      </div>
      <div class="ws-footer">
        <button class="btn btn-secondary btn-sm" onclick="window.startDevServer('${w.id}')">🚀 Start DevServer</button>
        <button class="btn btn-primary btn-sm" onclick="window.openInIde('${w.id}')">💻 Open IDE</button>
      </div>
    </div>
  `).join('');
}

window.createWorkspace = async function(taskId = 'TASK-102') {
  return sendMcpToolCall('robos_workspace_create', {
    taskId,
    repo: 'nddipiazza/robos',
    branch: `feat/${taskId.toLowerCase()}-flow`,
  });
};

window.openInIde = async function(id) {
  return sendMcpToolCall('robos_workspace_open_in_ide', { id, ide: 'intellij' });
};

window.startDevServer = async function(id) {
  return sendMcpToolCall('robos_workspace_start_devserver', { id, port: 3000 });
};

document.getElementById('btn-create-ws').addEventListener('click', () => {
  window.createWorkspace('TASK-103');
});

document.getElementById('btn-open-ide').addEventListener('click', () => {
  const active = workspaces.find(w => w.status === 'ACTIVE') || workspaces[0];
  if (active) window.openInIde(active.id);
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '// Log cleared.';
});

load();
