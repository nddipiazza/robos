'use strict';

let streams = [];
let focusedAgent = null;
let isManualControl = false;

function init() {
  streams = window.viewer ? window.viewer.getStreams() : [
    { taskId: 'TASK-101', username: 'agent-task-101', role: 'Senior Code Reviewer', display: ':10', status: 'active', fps: 60, cpu: '12%', memory: '340 MB' },
    { taskId: 'TASK-202', username: 'agent-task-202', role: 'Lead Security Auditor', display: ':11', status: 'active', fps: 60, cpu: '18%', memory: '480 MB' },
    { taskId: 'TASK-303', username: 'agent-task-303', role: 'BDD Test Implementer', display: ':12', status: 'active', fps: 60, cpu: '9%', memory: '290 MB' },
  ];

  document.getElementById('stat-active-streams').textContent = streams.length;
  renderGrid();
  attachEvents();
}

function renderGrid() {
  const container = document.getElementById('view-grid-container');
  container.innerHTML = streams.map((s, idx) => `
    <div class="agent-stream-card" id="card-${s.taskId}">
      <div class="card-header">
        <span class="card-user">👤 ${s.username}</span>
        <span class="card-display">${s.display}</span>
      </div>
      <div class="card-canvas-wrapper" onclick="window.focusAgent('${s.taskId}')">
        <canvas class="card-canvas" id="canvas-${s.taskId}" width="300" height="170"></canvas>
        <div class="card-overlay-fps">● ${s.fps} FPS</div>
      </div>
      <div class="card-footer">
        <span>${s.role}</span>
        <span>RAM: ${s.memory}</span>
      </div>
    </div>
  `).join('');

  // Draw simulated screen buffers
  setTimeout(() => {
    streams.forEach(s => drawMiniStream(s));
  }, 50);
}

function drawMiniStream(s) {
  const canvas = document.getElementById(`canvas-${s.taskId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#161b22';
  ctx.fillRect(10, 10, canvas.width - 20, 24);
  ctx.fillStyle = '#00bcd4';
  ctx.font = '10px monospace';
  ctx.fillText(`robos-agent@${s.username} (${s.display})`, 18, 26);

  ctx.fillStyle = '#30363d';
  ctx.fillRect(10, 40, canvas.width - 20, canvas.height - 50);

  ctx.fillStyle = '#7ee787';
  ctx.font = '9px monospace';
  ctx.fillText(`$ ROBOS_TASK_ID=${s.taskId}`, 18, 60);
  ctx.fillText(`[${s.role}] Live Stream Active`, 18, 78);
  ctx.fillStyle = '#8b949e';
  ctx.fillText(`CPU: ${s.cpu} &middot; RAM: ${s.memory}`, 18, 96);
}

function drawFocusedStream(s) {
  const canvas = document.getElementById('focused-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#06090e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw simulated IDE and Terminal
  ctx.fillStyle = '#161b22';
  ctx.fillRect(20, 20, canvas.width - 40, 40);
  ctx.fillStyle = '#00bcd4';
  ctx.font = '13px monospace';
  ctx.fillText(`🖥️ RobOS Virtual Desktop Display ${s.display} &mdash; ${s.role} (${s.username})`, 35, 45);

  ctx.fillStyle = '#1b222d';
  ctx.fillRect(20, 70, canvas.width - 40, canvas.height - 90);

  ctx.fillStyle = '#7ee787';
  ctx.font = '12px monospace';
  ctx.fillText(`[${s.username}@robos-desktop ~]$ npm test -- --coverage`, 40, 110);
  ctx.fillStyle = '#f0f6fc';
  ctx.fillText(`PASS packages/auth/tests/jwt.test.js (42 tests passed)`, 40, 140);
  ctx.fillText(`Coverage: 98.4% Stmts | 96.2% Branch | 100% Funcs`, 40, 165);

  ctx.fillStyle = '#58a6ff';
  ctx.fillText(`> Live 60 FPS Xvfb Stream Bridge | Input Socket Active`, 40, 210);
}

window.focusAgent = function(taskId) {
  const agent = streams.find(s => s.taskId === taskId) || streams[0];
  focusedAgent = agent;

  document.getElementById('focused-user').textContent = agent.username;
  document.getElementById('focused-role').textContent = agent.role;
  document.getElementById('focused-display').textContent = agent.display;

  document.getElementById('view-grid-container').classList.add('hidden');
  document.getElementById('view-single-container').classList.remove('hidden');

  document.getElementById('btn-view-grid').classList.remove('active');
  document.getElementById('btn-view-single').classList.add('active');

  drawFocusedStream(agent);
};

window.exitFocus = function() {
  focusedAgent = null;
  document.getElementById('view-single-container').classList.add('hidden');
  document.getElementById('view-grid-container').classList.remove('hidden');

  document.getElementById('btn-view-single').classList.remove('active');
  document.getElementById('btn-view-grid').classList.add('active');

  if (isManualControl) {
    window.toggleManualControl();
  }
};

window.toggleManualControl = function() {
  isManualControl = !isManualControl;
  const btn = document.getElementById('btn-manual-control');
  const banner = document.getElementById('control-banner');
  const statStatus = document.getElementById('stat-control-status');

  if (isManualControl) {
    btn.classList.add('active-control');
    btn.textContent = '⚡ Releasing Control...';
    banner.classList.remove('hidden');
    statStatus.textContent = 'INTERACTIVE';
    statStatus.style.color = '#3fb950';
  } else {
    btn.classList.remove('active-control');
    btn.textContent = '🎮 Take Manual Control';
    banner.classList.add('hidden');
    statStatus.textContent = 'Observing';
    statStatus.style.color = '#00bcd4';
  }
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

window.approveProofOfWork = function() {
  const bar = document.getElementById('pow-overlay-bar');
  if (bar) {
    bar.innerHTML = `<span style="color:#3fb950; font-weight:700;">✓ Proof of Work Approved &mdash; Pull Request #142 Created &amp; Merged!</span>`;
  }
  showToast('🚀 Proof of Work Verified: PR #142 Merged successfully!');
};

function attachEvents() {
  document.getElementById('btn-view-grid').addEventListener('click', window.exitFocus);
  document.getElementById('btn-view-single').addEventListener('click', () => {
    window.focusAgent(streams[0].taskId);
  });
  document.getElementById('btn-back-grid').addEventListener('click', window.exitFocus);
  document.getElementById('btn-manual-control').addEventListener('click', window.toggleManualControl);
  document.getElementById('btn-pow-approve').addEventListener('click', window.approveProofOfWork);
  document.getElementById('btn-pow-reject').addEventListener('click', () => {
    showToast('⚠️ Refinements requested from sub-agent.');
  });
}

init();
