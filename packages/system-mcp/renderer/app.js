'use strict';

let prefs = {};
let notifications = [];
let tools = [];
let activeTask = {};
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

  const response = await window.systemMcp.rpc(request);
  logTrace('RESPONSE', response);

  await load();
  return response;
}

async function load() {
  prefs = await window.systemMcp.getPreferences();
  notifications = await window.systemMcp.getNotifications();
  tools = await window.systemMcp.getTools();
  activeTask = await window.systemMcp.getActiveTask();
  render();
}

function render() {
  document.getElementById('stat-ai-model').textContent = prefs.aiModel || 'Claude 3.7 Sonnet';
  document.getElementById('stat-active-task').textContent = activeTask.id || 'TASK-101';
  document.getElementById('stat-notifs').textContent = `${notifications.length} Recent`;

  const toolsEl = document.getElementById('tools-list');
  toolsEl.innerHTML = tools.map(t => `
    <div class="item-card" onclick="window.installTool('${t.id}')">
      <div class="item-header">
        <span class="item-title">🛠️ ${t.name} (<code>${t.id}</code>)</span>
        <span class="status-badge installed">${t.status}</span>
      </div>
      <div class="item-meta">Version: ${t.version}</div>
    </div>
  `).join('');

  const notifsEl = document.getElementById('notifs-list');
  notifsEl.innerHTML = notifications.map(n => `
    <div class="item-card">
      <div class="item-header">
        <span class="item-title">🔔 ${n.title}</span>
        <span class="status-badge normal">${n.urgency}</span>
      </div>
      <div class="item-meta">${n.body} &middot; <small>${new Date(n.timestamp).toLocaleTimeString()}</small></div>
    </div>
  `).join('');
}

window.sendNotification = async function(title = 'AI Agent Notification', body = 'Test completed successfully: 48/48 passed.') {
  return sendMcpToolCall('robos_system_send_notification', { title, body, urgency: 'NORMAL' });
};

window.searchFiles = async function(query = '@router') {
  return sendMcpToolCall('robos_system_search_files', { query });
};

window.installTool = async function(toolId = 'terraform') {
  return sendMcpToolCall('robos_system_install_tool', { toolId });
};

document.getElementById('btn-send-toast').addEventListener('click', () => {
  window.sendNotification();
});

document.getElementById('btn-search-files').addEventListener('click', () => {
  window.searchFiles();
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '// Log cleared.';
});

load();
