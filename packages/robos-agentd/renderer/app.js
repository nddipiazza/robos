'use strict';

let currentAgents = [];

async function load() {
  currentAgents = await window.agentd.listAgents();
  render();
}

function render() {
  const activeAgents = currentAgents.filter(a => a.status === 'active');
  document.getElementById('stat-active').textContent = activeAgents.length;

  const grid = document.getElementById('agent-grid');
  if (!currentAgents.length) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No sub-agent user sessions. Click "+ Spawn Sub-Agent" to initialize.</div>`;
    return;
  }

  grid.innerHTML = currentAgents.map(a => `
    <div class="agent-card ${a.status === 'terminated' ? 'terminated' : ''}" id="card-${a.username}">
      <div class="agent-card-header">
        <span class="agent-user">👤 ${esc(a.username)}</span>
        <span class="agent-badge">${esc(a.status)}</span>
      </div>
      <div class="agent-meta">
        <div><strong>Task:</strong> ${esc(a.taskId)}</div>
        <div><strong>Role:</strong> ${esc(a.role)}</div>
        <div><strong>UID:</strong> ${a.uid} &middot; <strong>RAM:</strong> ${a.memoryMb} MB</div>
        <div><strong>Scope:</strong> ${esc(a.scope)}</div>
      </div>
      <div class="agent-actions">
        <button class="btn btn-secondary btn-sm" onclick="window.inspectAgent('${a.taskId}')">Inspect</button>
        ${a.status === 'active' ? `<button class="btn btn-secondary btn-sm btn-term" style="color:var(--danger);" onclick="window.terminateAgent('${a.taskId}')">Terminate</button>` : ''}
      </div>
    </div>
  `).join('');
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.inspectAgent = async function(taskId) {
  const res = await window.agentd.inspectAgent(taskId);
  if (!res.ok) return;

  const a = res.agent;
  const drawer = document.getElementById('inspect-pane');
  document.getElementById('inspect-title').textContent = `Agent: ${a.username}`;

  document.getElementById('inspect-details').innerHTML = `
    <div class="detail-row"><span class="detail-label">Status</span><span class="detail-val" style="color:var(--success); font-weight:700;">● ${esc(a.status)}</span></div>
    <div class="detail-row"><span class="detail-label">Role</span><span class="detail-val">${esc(a.role)}</span></div>
    <div class="detail-row"><span class="detail-label">Task ID</span><span class="detail-val">${esc(a.taskId)}</span></div>
    <div class="detail-row"><span class="detail-label">UID / GID</span><span class="detail-val">${a.uid} / ${a.gid}</span></div>
    <div class="detail-row"><span class="detail-label">SSH Socket</span><span class="detail-val" style="color:var(--accent); font-weight:600;">${a.sshTunneled ? 'Tunneled (.ssh-auth-sock)' : 'Disabled'}</span></div>
    <div class="detail-row"><span class="detail-label">Git Author</span><span class="detail-val">${esc(a.gitAuthor || 'RobOS Developer')}</span></div>
    <div class="detail-row"><span class="detail-label">GPG Agent</span><span class="detail-val">${a.gpgTunneled ? 'Tunneled (S.gpg-agent)' : 'Disabled'}</span></div>
    <div class="detail-row"><span class="detail-label">AI Tokens</span><span class="detail-val">${esc((a.apiTokensInjected || ['ANTHROPIC_API_KEY']).join(', '))}</span></div>
    <div class="detail-row"><span class="detail-label">Display</span><span class="detail-val" style="color:var(--accent); font-weight:600;">${esc(a.display || ':0')}</span></div>
    <div class="detail-row"><span class="detail-label">RAM / CPU</span><span class="detail-val">${a.memoryMb} MB / ${a.cpuShares || 1024} shares</span></div>
    <div class="detail-row"><span class="detail-label">Home Dir</span><span class="detail-val">${esc(a.home)}</span></div>
    <div class="detail-row"><span class="detail-label">Cgroup Scope</span><span class="detail-val">${esc(a.scope)}</span></div>
    <div class="detail-row"><span class="detail-label">Created At</span><span class="detail-val">${new Date(a.createdAt).toLocaleTimeString()}</span></div>
  `;

  document.getElementById('inspect-logs').textContent = (a.logs && a.logs.length) ? a.logs.join('\n') : '[No log entries recorded]';

  // Render Virtual Display Stream Canvas
  const badge = document.getElementById('display-badge');
  if (badge) badge.textContent = `Virtual Output ${a.display || ':10'} · 60 FPS`;

  const canvas = document.getElementById('display-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw simulated sub-agent terminal / IDE frame
    ctx.fillStyle = '#161b22';
    ctx.fillRect(10, 10, canvas.width - 20, 30);
    ctx.fillStyle = '#00bcd4';
    ctx.font = '11px monospace';
    ctx.fillText(`robos-agent@${a.username}: ~ (${a.display || ':10'})`, 20, 28);

    ctx.fillStyle = '#30363d';
    ctx.fillRect(10, 45, canvas.width - 20, canvas.height - 55);

    ctx.fillStyle = '#7ee787';
    ctx.font = '10px monospace';
    ctx.fillText(`$ ROBOS_TASK_ID=${a.taskId} node task-runner.js`, 20, 70);
    ctx.fillText(`[${a.role}] Processing automated step...`, 20, 90);
    ctx.fillStyle = '#58a6ff';
    ctx.fillText(`> Display stream active on ${a.streamUrl || 'localhost'}`, 20, 110);
    ctx.fillStyle = '#8b949e';
    ctx.fillText(`> RAM: ${a.memoryMb} MB | Scope: ${a.scope}`, 20, 130);
  }

  drawer.classList.remove('hidden');
};

window.terminateAgent = async function(taskId) {
  await window.agentd.terminateAgent(taskId);
  await load();
};

window.spawnAgent = async function(taskId, options = {}) {
  const res = await window.agentd.spawnAgent(taskId, options);
  if (res.ok) {
    await load();
    window.inspectAgent(res.agent.taskId);
  }
  return res;
};

window.wipeAll = async function() {
  await window.agentd.wipeAll();
  await load();
};

// Modal and UI triggers
document.getElementById('btn-spawn-agent').addEventListener('click', () => {
  document.getElementById('spawn-task-id').value = '';
  document.getElementById('modal-spawn').classList.remove('hidden');
});

document.getElementById('btn-cancel-spawn').addEventListener('click', () => {
  document.getElementById('modal-spawn').classList.add('hidden');
});

document.getElementById('btn-confirm-spawn').addEventListener('click', async () => {
  const taskId = document.getElementById('spawn-task-id').value.trim();
  const role = document.getElementById('spawn-role').value;
  const memoryMb = parseInt(document.getElementById('spawn-memory').value, 10) || 2048;

  if (!taskId) return;
  await window.spawnAgent(taskId, { role, memoryMb });
  document.getElementById('modal-spawn').classList.add('hidden');
});

document.getElementById('btn-wipe-all').addEventListener('click', async () => {
  await window.wipeAll();
});

document.getElementById('btn-close-inspect').addEventListener('click', () => {
  document.getElementById('inspect-pane').classList.add('hidden');
});

document.getElementById('btn-refresh').addEventListener('click', load);

load();
