'use strict';

let reqId = 1;

function logDispatch(type, text) {
  const log = document.getElementById('dispatch-log');
  const entry = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${text}\n`;
  log.textContent = (log.textContent.startsWith('//') ? '' : log.textContent) + entry;
  log.scrollTop = log.scrollHeight;
}

async function sendRouterRpc(method, params = {}) {
  const id = reqId++;
  const request = { jsonrpc: '2.0', id, method, params };
  logDispatch('REQUEST', JSON.stringify(request, null, 2));

  const response = await window.routerApi.rpc(request);
  logDispatch('RESPONSE', JSON.stringify(response, null, 2));
  return response;
}

async function load() {
  const servers = await window.routerApi.getServers();
  const serverKeys = Object.keys(servers);
  document.getElementById('stat-servers').textContent = serverKeys.length;

  // Query aggregated tools
  const toolsRes = await sendRouterRpc('tools/list');
  const tools = toolsRes.result?.tools || [];
  document.getElementById('stat-tools').textContent = tools.length;

  const toolsEl = document.getElementById('tools-list');
  toolsEl.innerHTML = tools.map(t => `
    <div class="item-card" onclick="window.dispatchTool('${t.name}')">
      <div class="item-name">🛠️ ${t.name}</div>
      <div class="item-desc">${t.description || 'Multiplexed via RobOS MCP Router'}</div>
    </div>
  `).join('');

  // Query aggregated resources
  const resRes = await sendRouterRpc('resources/list');
  const resources = resRes.result?.resources || [];
  document.getElementById('stat-resources').textContent = resources.length;

  const resEl = document.getElementById('resources-list');
  resEl.innerHTML = resources.map(r => `
    <div class="item-card" onclick="window.dispatchResource('${r.uri}')">
      <div class="item-name">📄 ${r.uri}</div>
      <div class="item-desc">${r.name || r.uri}</div>
    </div>
  `).join('');
}

window.dispatchTool = async function(name, args = {}) {
  if (name.includes('get_task')) args = { taskId: 'TASK-101' };
  return sendRouterRpc('tools/call', { name, arguments: args });
};

window.dispatchResource = async function(uri) {
  return sendRouterRpc('resources/read', { uri });
};

document.getElementById('btn-dispatch-test').addEventListener('click', () => {
  window.dispatchTool('robos_task_manager_get_task');
});

document.getElementById('btn-claude-config').addEventListener('click', async () => {
  const config = await window.routerApi.getClaudeConfig();
  logDispatch('CLAUDE_CONFIG', JSON.stringify(config, null, 2));
});

document.getElementById('btn-clear-log').addEventListener('click', () => {
  document.getElementById('dispatch-log').textContent = '// Log cleared.';
});

load();
