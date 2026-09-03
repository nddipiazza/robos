'use strict';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let _profiles = [];

async function load() {
  _profiles = await window.profiled.listProfiles();
  render();
}

function render() {
  const activeCount = _profiles.filter(p => p.status === 'active').length;
  document.getElementById('stat-active').textContent = activeCount;

  const container = document.getElementById('profile-list');
  if (!_profiles.length) {
    container.innerHTML = `<div class="empty-state">No active ephemeral agent profiles. Click "+ Provision Agent Profile" to spawn.</div>`;
    return;
  }

  container.innerHTML = _profiles.map(p => `
    <div class="profile-card ${p.status}" id="card-${p.username}" data-user="${p.username}">
      <div class="profile-info">
        <div class="profile-title">
          <span>👤 ${esc(p.username)}</span>
          <span class="badge ${p.status}">${p.status}</span>
        </div>
        <div class="profile-meta">
          <span>Role: <strong>${esc(p.role)}</strong></span>
          <span>UID: <strong>${p.uid}</strong></span>
          <span>Scope: <strong>${esc(p.scope)}</strong></span>
        </div>
      </div>
      <div class="profile-actions">
        <button class="btn btn-secondary btn-inspect" data-user="${p.username}">Inspect</button>
        ${p.status === 'active' ? `<button class="btn btn-danger btn-term" data-user="${p.username}">Terminate</button>` : ''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-inspect').forEach(btn => {
    btn.addEventListener('click', () => window.inspectProfile(btn.dataset.user));
  });

  container.querySelectorAll('.btn-term').forEach(btn => {
    btn.addEventListener('click', () => window.terminateProfile(btn.dataset.user));
  });
}

window.inspectProfile = async function(username) {
  const res = await window.profiled.inspectProfile(username);
  if (!res.ok) return;

  const p = res.profile;
  const drawer = document.getElementById('inspect-pane');
  document.getElementById('inspect-username').textContent = p.username;

  document.getElementById('inspect-details').innerHTML = `
    <div class="detail-row"><span class="detail-label">Status</span><span class="detail-val" style="color:var(--success); font-weight:700;">● ${esc(p.status)}</span></div>
    <div class="detail-row"><span class="detail-label">Role</span><span class="detail-val">${esc(p.role)}</span></div>
    <div class="detail-row"><span class="detail-label">Model</span><span class="detail-val">${esc(p.model)}</span></div>
    <div class="detail-row"><span class="detail-label">UID / GID</span><span class="detail-val">${p.uid} / ${p.gid}</span></div>
    <div class="detail-row"><span class="detail-label">SSH Agent</span><span class="detail-val" style="color:var(--accent); font-weight:600;">${p.sshForwarded ? 'Forwarded (SSH_AUTH_SOCK)' : 'Disabled'}</span></div>
    <div class="detail-row"><span class="detail-label">Git Author</span><span class="detail-val">${esc(p.gitAuthor || 'RobOS Agent')}</span></div>
    <div class="detail-row"><span class="detail-label">GPG Agent</span><span class="detail-val">${p.gpgForwarded ? 'Forwarded (S.gpg-agent)' : 'Disabled'}</span></div>
    <div class="detail-row"><span class="detail-label">AI Tokens</span><span class="detail-val">${esc((p.apiTokensInjected || ['ANTHROPIC_API_KEY']).join(', '))}</span></div>
    <div class="detail-row"><span class="detail-label">Display (X11)</span><span class="detail-val" style="color:var(--accent); font-weight:600;">${esc(p.display || ':0')}</span></div>
    <div class="detail-row"><span class="detail-label">Audio Server</span><span class="detail-val">${esc(p.audioServer || 'PulseAudio / PipeWire')}</span></div>
    <div class="detail-row"><span class="detail-label">GPU Render</span><span class="detail-val">${esc(p.gpuDri || '/dev/dri/renderD128')}</span></div>
    <div class="detail-row"><span class="detail-label">Home Directory</span><span class="detail-val">${esc(p.home)} (tmpfs)</span></div>
    <div class="detail-row"><span class="detail-label">RAM Quota</span><span class="detail-val">${esc(p.quota || '2G')}</span></div>
    <div class="detail-row"><span class="detail-label">Dotfiles</span><span class="detail-val">${esc((p.dotfiles || ['.bashrc', '.profile']).join(', '))}</span></div>
    <div class="detail-row"><span class="detail-label">Subsystem Groups</span><span class="detail-val">${esc(p.groups.join(', '))}</span></div>
    <div class="detail-row"><span class="detail-label">Systemd Scope</span><span class="detail-val">${esc(p.scope)}</span></div>
    <div class="detail-row"><span class="detail-label">Created At</span><span class="detail-val">${new Date(p.createdAt).toLocaleTimeString()}</span></div>
  `;

  drawer.classList.remove('hidden');
};

window.terminateProfile = async function(username) {
  await window.profiled.terminateProfile(username);
  await load();
};

window.spawnProfile = async function(name, options = {}) {
  const res = await window.profiled.createProfile(name, options);
  if (res.ok) {
    await load();
    window.inspectProfile(res.profile.username);
  }
  return res;
};

window.spawnSwarm = async function(count = 4, prefix = 'swarm') {
  const res = await window.profiled.spawnSwarm(count, prefix);
  await load();
  return res;
};

window.wipeAll = async function() {
  const res = await window.profiled.wipeAll();
  await load();
  return res;
};

// Modal controls
document.getElementById('btn-spawn-profile').addEventListener('click', () => {
  document.getElementById('spawn-name').value = '';
  document.getElementById('modal-spawn').classList.remove('hidden');
});

const btnSpawnSwarm = document.getElementById('btn-spawn-swarm');
if (btnSpawnSwarm) {
  btnSpawnSwarm.addEventListener('click', async () => {
    await window.spawnSwarm(4, 'swarm');
  });
}

document.getElementById('btn-cancel-spawn').addEventListener('click', () => {
  document.getElementById('modal-spawn').classList.add('hidden');
});

document.getElementById('btn-confirm-spawn').addEventListener('click', async () => {
  const name = document.getElementById('spawn-name').value.trim();
  const role = document.getElementById('spawn-role').value;
  const model = document.getElementById('spawn-model').value;

  if (!name) return;
  await window.spawnProfile(name, { role, model });
  document.getElementById('modal-spawn').classList.add('hidden');
});

document.getElementById('btn-close-inspect').addEventListener('click', () => {
  document.getElementById('inspect-pane').classList.add('hidden');
});

document.getElementById('btn-refresh').addEventListener('click', load);

load();
