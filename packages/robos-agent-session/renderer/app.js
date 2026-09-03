'use strict';

let sessions = [];

async function load() {
  sessions = await window.agentSession.list();
  render();
}

function logEvent(msg) {
  const logEl = document.getElementById('event-log');
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.textContent += (logEl.textContent ? '\n' : '') + entry;
  logEl.scrollTop = logEl.scrollHeight;

  document.getElementById('stat-last-event').textContent = msg.split(' ')[0] || 'Event';
}

function render() {
  const activeSessions = sessions.filter(s => s.status === 'active');
  document.getElementById('stat-sessions').textContent = activeSessions.length;

  const grid = document.getElementById('session-grid');
  if (!sessions.length) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:30px;">No active sessions. Click "+ Spawn via Library" to initialize.</div>`;
    return;
  }

  grid.innerHTML = sessions.map(s => `
    <div class="session-card ${s.status === 'terminated' ? 'terminated' : ''}" id="session-${s.taskId}">
      <div class="session-header">
        <span>👤 ${s.username}</span>
        <span style="font-size:10px; color:${s.status === 'active' ? '#3fb950' : '#8b949e'};">${s.status}</span>
      </div>
      <div class="session-meta">
        <div><strong>Role:</strong> ${s.role}</div>
        <div><strong>Display:</strong> ${s.display}</div>
        <div><strong>RAM:</strong> ${s.memoryMb} MB &middot; <strong>Scope:</strong> ${s.scope}</div>
      </div>
      <div class="session-actions">
        ${s.status === 'active' ? `<button class="btn btn-secondary btn-sm" onclick="window.terminateSession('${s.taskId}')" style="color:var(--danger);">Terminate</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.spawnSession = async function(taskId, options = {}) {
  logEvent(`Calling spawnAgentSession('${taskId}')...`);
  const res = await window.agentSession.spawn(taskId, options);
  if (res.ok) {
    logEvent(`Session spawned: ${res.agent.username} (Display ${res.agent.display})`);
    await load();
  } else {
    logEvent(`Spawn failed: ${res.error}`);
  }
  return res;
};

window.terminateSession = async function(taskId) {
  logEvent(`Calling terminateAgentSession('${taskId}')...`);
  const res = await window.agentSession.terminate(taskId);
  if (res.ok) {
    logEvent(`Session terminated: ${taskId}`);
    await load();
  }
};

window.sendCommand = async function(taskId, command) {
  logEvent(`Calling sendAgentCommand('${taskId}', '${command}')...`);
  const res = await window.agentSession.sendCommand(taskId, command);
  if (res.ok) {
    logEvent(`Command dispatched to ${taskId}: ${command}`);
  }
};

document.getElementById('btn-spawn-client').addEventListener('click', () => {
  const id = `client-task-${Math.floor(Math.random() * 900 + 100)}`;
  window.spawnSession(id, { role: 'Automated DevCentral Agent', memoryMb: 1024 });
});

document.getElementById('btn-send-cmd').addEventListener('click', () => {
  const taskId = document.getElementById('cmd-task-id').value.trim();
  const cmd = document.getElementById('cmd-text').value.trim();
  if (taskId && cmd) {
    window.sendCommand(taskId, cmd);
  }
});

document.getElementById('btn-refresh').addEventListener('click', load);

load();
