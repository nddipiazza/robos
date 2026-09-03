'use strict';

let openFiles = [];
let ideStatus = {};
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

  const response = await window.ideMcp.rpc(request);
  logTrace('RESPONSE', response);

  await load();
  return response;
}

async function load() {
  ideStatus = await window.ideMcp.getStatus();
  openFiles = await window.ideMcp.getOpenFiles();
  render();
}

function render() {
  document.getElementById('stat-ide-name').textContent = `${ideStatus.name || 'IntelliJ IDEA Ultimate'} (Port ${ideStatus.port || 63343})`;
  document.getElementById('stat-open-files').textContent = `${openFiles.length} Files Open`;

  const filesEl = document.getElementById('files-list');
  filesEl.innerHTML = openFiles.map(f => `
    <div class="item-card ${f.focused ? 'focused' : ''}" onclick="window.openFile('${f.file}', ${f.line}, ${f.column})">
      <div class="item-header">
        <span class="file-name">${f.file.split('/').pop()}</span>
        ${f.focused ? '<span class="status-badge running">FOCUSED</span>' : ''}
      </div>
      <div class="item-meta">Line ${f.line}:${f.column} &middot; <code>${f.file}</code></div>
    </div>
  `).join('');

  const configsEl = document.getElementById('configs-list');
  const configs = [
    { name: 'Debug HelloWorld.main()', type: 'Application', status: 'RUNNING', pid: 14201 },
    { name: 'Maven Build & Test', type: 'Maven', status: 'READY', pid: null },
  ];

  configsEl.innerHTML = configs.map(c => `
    <div class="item-card" onclick="window.runConfig('${c.name}')">
      <div class="item-header">
        <span class="file-name">⚙️ ${c.name}</span>
        <span class="status-badge ${c.status.toLowerCase()}">${c.status}</span>
      </div>
      <div class="item-meta">Type: ${c.type} ${c.pid ? `&middot; PID: ${c.pid}` : ''}</div>
    </div>
  `).join('');
}

window.openFile = async function(file = 'src/main/java/com/robos/HelloWorld.java', line = 6, column = 9) {
  return sendMcpToolCall('robos_ide_open_file', { file, line, column });
};

window.setBreakpoint = async function(file = 'src/main/java/com/robos/HelloWorld.java', line = 6) {
  return sendMcpToolCall('robos_ide_set_breakpoint', { file, line, enabled: true });
};

window.runConfig = async function(name = 'Debug HelloWorld.main()', mode = 'debug') {
  return sendMcpToolCall('robos_ide_run_config', { name, mode });
};

document.getElementById('btn-open-file').addEventListener('click', () => {
  window.openFile('src/main/java/com/robos/HelloWorld.java', 6, 9);
});

document.getElementById('btn-set-bp').addEventListener('click', () => {
  window.setBreakpoint();
});

document.getElementById('btn-run-debug').addEventListener('click', () => {
  window.runConfig();
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '// Log cleared.';
});

// Initial load and status resource query
(async () => {
  await load();
  const id = reqId++;
  const request = {
    jsonrpc: '2.0',
    id,
    method: 'resources/read',
    params: { uri: 'robos://ide-bridge-mcp/ide/status' },
  };
  logTrace('REQUEST', request);
  const res = await window.ideMcp.rpc(request);
  logTrace('RESPONSE', res);
})();
