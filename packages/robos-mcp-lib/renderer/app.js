'use strict';

let reqId = 1;

function logTrace(type, json) {
  const log = document.getElementById('trace-log');
  const entry = `[${new Date().toLocaleTimeString()}] ${type.toUpperCase()}:\n${JSON.stringify(json, null, 2)}\n`;
  log.textContent += (log.textContent ? '\n' : '') + entry;
  log.scrollTop = log.scrollHeight;
}

async function sendRpc(method, params = {}) {
  const id = reqId++;
  const request = { jsonrpc: '2.0', id, method, params };
  logTrace('req', request);

  const response = await window.mcp.rpc(request);
  logTrace('res', response);
  return response;
}

async function load() {
  // Query tools/list
  const toolsRes = await sendRpc('tools/list');
  const tools = toolsRes.result?.tools || [];
  document.getElementById('stat-tools').textContent = tools.length;

  const toolsEl = document.getElementById('tools-list');
  toolsEl.innerHTML = tools.map(t => `
    <div class="item-card" onclick="window.callTool('${t.name}')">
      <div class="item-name">🛠️ ${t.name}</div>
      <div class="item-desc">${t.description || 'No description provided'}</div>
    </div>
  `).join('');

  // Query resources/list
  const resRes = await sendRpc('resources/list');
  const resources = resRes.result?.resources || [];
  document.getElementById('stat-resources').textContent = resources.length;

  const resEl = document.getElementById('resources-list');
  resEl.innerHTML = resources.map(r => `
    <div class="item-card" onclick="window.readResource('${r.uri}')">
      <div class="item-name">📄 ${r.uri}</div>
      <div class="item-desc">${r.name} &middot; ${r.mimeType}</div>
    </div>
  `).join('');
}

window.callTool = async function(name, args = {}) {
  if (name.includes('calculate_metrics')) {
    args = { taskId: 'TASK-101' };
  }
  return sendRpc('tools/call', { name, arguments: args });
};

window.readResource = async function(uri) {
  return sendRpc('resources/read', { uri });
};

document.getElementById('btn-call-demo-tool').addEventListener('click', () => {
  window.callTool('robos_demo_calculate_metrics');
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '';
});

load();
