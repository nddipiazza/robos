'use strict';

let tasks = [];
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

  const response = await window.taskMcp.rpc(request);
  logTrace('RESPONSE', response);

  document.getElementById('stat-last-op').textContent = name.replace('robos_tasks_', '').toUpperCase();
  await load();
  return response;
}

async function load() {
  tasks = await window.taskMcp.list();
  render();
}

function render() {
  document.getElementById('stat-total-tasks').textContent = tasks.length;
  const activeCount = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  document.getElementById('stat-active-tasks').textContent = activeCount;

  const cols = {
    'TODO': document.getElementById('list-todo'),
    'IN_PROGRESS': document.getElementById('list-in-progress'),
    'REVIEW': document.getElementById('list-review'),
    'DONE': document.getElementById('list-done'),
  };

  const counts = {
    'TODO': document.getElementById('count-todo'),
    'IN_PROGRESS': document.getElementById('count-in-progress'),
    'REVIEW': document.getElementById('count-review'),
    'DONE': document.getElementById('count-done'),
  };

  Object.values(cols).forEach(c => c.innerHTML = '');
  const groupCounts = { 'TODO': 0, 'IN_PROGRESS': 0, 'REVIEW': 0, 'DONE': 0 };

  tasks.forEach(t => {
    const status = t.status || 'TODO';
    if (groupCounts[status] !== undefined) groupCounts[status]++;
    const targetCol = cols[status] || cols['TODO'];

    const card = document.createElement('div');
    card.className = 'task-card';
    card.id = `card-${t.id}`;
    card.innerHTML = `
      <div class="task-card-header">
        <span class="task-id">${t.id}</span>
        <span class="task-priority">${t.priority || 'MEDIUM'}</span>
      </div>
      <div class="task-title">${t.title}</div>
      <div class="task-footer">
        <span>👤 ${t.assignee || 'unassigned'}</span>
        <span>⏱️ ${t.hoursLogged || 0}h</span>
      </div>
    `;
    card.onclick = () => window.advanceTask(t.id);
    targetCol.appendChild(card);
  });

  Object.entries(groupCounts).forEach(([k, v]) => {
    if (counts[k]) counts[k].textContent = v;
  });
}

window.advanceTask = async function(id) {
  return sendMcpToolCall('robos_tasks_advance_workflow', { id });
};

window.createTask = async function(title = 'Automated Verification Flow', priority = 'HIGH') {
  return sendMcpToolCall('robos_tasks_create', {
    title,
    priority,
    type: 'story',
    assignee: 'agent-task-101',
  });
};

window.addComment = async function(id, comment) {
  return sendMcpToolCall('robos_tasks_add_comment', { id, comment });
};

document.getElementById('btn-create-task').addEventListener('click', () => {
  window.createTask();
});

document.getElementById('btn-advance-active').addEventListener('click', () => {
  const active = tasks.find(t => t.status === 'IN_PROGRESS') || tasks[0];
  if (active) window.advanceTask(active.id);
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '// Log cleared.';
});

load();
