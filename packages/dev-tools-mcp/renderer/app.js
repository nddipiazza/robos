'use strict';

let tools = [];
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

  const response = await window.devToolsMcp.rpc(request);
  logTrace('RESPONSE', response);

  await load();
  return response;
}

async function load() {
  tools = await window.devToolsMcp.listTools();
  render();
}

function render() {
  const installedCount = tools.filter(t => t.installed).length;
  document.getElementById('stat-installed').textContent = `${installedCount} Installed`;
  document.getElementById('stat-total').textContent = `${tools.length} Catalog`;

  const catalogEl = document.getElementById('tools-catalog');
  catalogEl.innerHTML = tools.map(t => `
    <div class="tool-card" onclick="window.toggleTool('${t.id}')">
      <div>
        <div class="tool-header">
          <span class="tool-name">${t.name}</span>
          <span class="status-badge ${t.installed ? 'installed' : 'available'}">
            ${t.installed ? 'INSTALLED' : 'AVAILABLE'}
          </span>
        </div>
        <div class="tool-desc">${t.description}</div>
      </div>
      <div class="tool-footer">
        <span>📁 ${t.category}</span>
        <span>${t.installed ? `v${t.version}` : 'Click to Install'}</span>
      </div>
    </div>
  `).join('');
}

window.checkTool = async function(toolId = 'docker') {
  return sendMcpToolCall('robos_devtools_check', { toolId });
};

window.installTool = async function(toolId = 'terraform') {
  return sendMcpToolCall('robos_devtools_install', { toolId });
};

window.uninstallTool = async function(toolId = 'terraform') {
  return sendMcpToolCall('robos_devtools_uninstall', { toolId });
};

window.toggleTool = async function(toolId) {
  const tool = tools.find(t => t.id === toolId);
  if (!tool) return;
  if (tool.installed) {
    return window.checkTool(toolId);
  } else {
    return window.installTool(toolId);
  }
};

document.getElementById('btn-check-docker').addEventListener('click', () => {
  window.checkTool('docker');
});

document.getElementById('btn-install-terraform').addEventListener('click', () => {
  window.installTool('terraform');
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '// Log cleared.';
});

load();
