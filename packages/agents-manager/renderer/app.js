'use strict';

let providers = [];
let activeProviderId = null;
let selectedProviderId = null;

// ── Provider icons (inline SVG) ─────────────────────────────────────────────

const PROVIDER_ICONS = {
  'github-copilot': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 19 4.77 5.07 5.07 0 0 0 18.91 1S17.73.65 15 2.48a13.38 13.38 0 0 0-7 0C5.27.65 4.09 1 4.09 1A5.07 5.07 0 0 0 4 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 8 18.13V22"/></svg>`,
  'claude-code': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>`,
};

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  activeProviderId = await window.agents.getActiveProvider();
  providers = await window.agents.detectProviders();
  renderSidebar();
  document.getElementById('empty-detecting').textContent =
    providers.some(p => p.installed) ? 'Select a provider to get started.' : 'No AI providers detected. Install GitHub Copilot or Claude Code to get started.';

  // Auto-select first installed provider
  const firstInstalled = providers.find(p => p.installed);
  if (firstInstalled) selectProvider(firstInstalled.id);

  // Handle --check-provider mode
  window.agents.onOpenProvider((id) => selectProvider(id));

  // Init resizer
  initResizer();
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  const nav = document.getElementById('provider-nav');
  nav.innerHTML = '';

  for (const p of providers) {
    const item = document.createElement('button');
    item.className = 'provider-nav-item' + (selectedProviderId === p.id ? ' active' : '');
    const statusDot = p.installed
      ? (p.authenticated ? '<span class="status-dot green"></span>' : '<span class="status-dot yellow"></span>')
      : '<span class="status-dot red"></span>';
    item.innerHTML = `
      <span class="provider-nav-icon">${PROVIDER_ICONS[p.id] || ''}</span>
      <span class="provider-nav-label">${esc(p.name)}</span>
      ${statusDot}`;
    item.onclick = () => selectProvider(p.id);
    nav.appendChild(item);
  }

  // Active provider indicator
  const indicator = document.getElementById('active-provider-indicator');
  const active = providers.find(p => p.id === activeProviderId);
  if (active) {
    indicator.innerHTML = `<div class="active-indicator">
      <span class="active-indicator-label">Active Provider</span>
      <span class="active-indicator-name">${esc(active.name)}</span>
    </div>`;
  }
}

// ── Provider Selection ──────────────────────────────────────────────────────

async function selectProvider(id) {
  selectedProviderId = id;
  renderSidebar();

  document.getElementById('empty-state').classList.add('hidden');
  const detail = document.getElementById('provider-detail');
  detail.classList.remove('hidden');

  const provider = providers.find(p => p.id === id);
  if (id === 'github-copilot') {
    await renderCopilotDetail(provider);
  } else if (id === 'claude-code') {
    await renderClaudeDetail(provider);
  }
}

// ── GitHub Copilot Detail ───────────────────────────────────────────────────

async function renderCopilotDetail(provider) {
  const detail = document.getElementById('provider-detail');
  const isActive = activeProviderId === 'github-copilot';

  detail.innerHTML = `
    <div class="detail-scroll">
      <div class="detail-header">
        <div class="detail-title-row">
          <span class="detail-icon">${PROVIDER_ICONS['github-copilot']}</span>
          <h2>GitHub Copilot</h2>
          ${isActive ? '<span class="active-badge">ACTIVE PROVIDER</span>' : `<button class="btn btn-primary btn-sm" id="btn-set-active">Set as Active</button>`}
        </div>
        <p class="detail-sub">GitHub Copilot CLI via gh extension</p>
      </div>

      <!-- Status -->
      <div class="detail-section">
        <h3 class="section-title">Status</h3>
        <div class="info-grid">
          <span class="info-label">gh CLI</span>
          <span class="info-value mono">${esc(provider.version || 'not installed')}</span>
          <span class="info-label">Copilot Extension</span>
          <span class="info-value mono">${esc(provider.extensionVersion || 'not installed')}</span>
          <span class="info-label">Logged in as</span>
          <span class="info-value">${esc(provider.user || 'not logged in')}</span>
          <span class="info-label">Status</span>
          <span class="info-value" style="color:${provider.authenticated ? '#3fb950' : '#e3b341'}">
            ${provider.authenticated ? 'Connected' : provider.installed ? 'Not authenticated' : 'Not installed'}
          </span>
        </div>
        <div class="section-actions">
          <button class="btn btn-sm" id="btn-cop-refresh">Refresh</button>
          ${provider.ghInstalled && !provider.installed ? `<button class="btn btn-primary btn-sm" id="btn-cop-install-ext">Install gh-copilot Extension</button>` : ''}
          ${provider.installed ? `<button class="btn btn-sm" id="btn-cop-update">Update Extension</button>` : ''}
          <button class="btn btn-primary btn-sm" id="btn-cop-login">Login / Re-auth</button>
          <button class="btn btn-ai btn-sm" id="btn-cop-terminal">Open Terminal</button>
        </div>
      </div>

      <!-- Sessions -->
      <div class="detail-section">
        <h3 class="section-title">Sessions</h3>
        <div id="copilot-sessions-list" class="sessions-list">
          <div class="text-muted" style="padding:12px">Loading sessions...</div>
        </div>
      </div>
    </div>`;

  // Wire buttons
  if (!isActive) {
    document.getElementById('btn-set-active').onclick = async () => {
      await window.agents.setActiveProvider('github-copilot');
      activeProviderId = 'github-copilot';
      renderSidebar();
      await renderCopilotDetail(provider);
    };
  }

  document.getElementById('btn-cop-refresh').onclick = async () => {
    providers = await window.agents.detectProviders();
    const updated = providers.find(p => p.id === 'github-copilot');
    renderSidebar();
    await renderCopilotDetail(updated);
  };

  document.getElementById('btn-cop-login').onclick = () => window.agents.copilotLogin();
  const updateBtn = document.getElementById('btn-cop-update');
  if (updateBtn) {
    updateBtn.onclick = async () => {
      updateBtn.disabled = true;
      updateBtn.textContent = 'Updating...';
      await window.agents.copilotUpdate();
      updateBtn.textContent = 'Update Extension';
      updateBtn.disabled = false;
    };
  }
  const installExtBtn = document.getElementById('btn-cop-install-ext');
  if (installExtBtn) {
    installExtBtn.onclick = async () => {
      installExtBtn.disabled = true;
      installExtBtn.textContent = 'Installing...';
      await window.agents.copilotInstallExtension();
      installExtBtn.textContent = 'Install gh-copilot Extension';
      installExtBtn.disabled = false;
      providers = await window.agents.detectProviders();
      renderSidebar();
      await renderCopilotDetail(providers.find(p => p.id === 'github-copilot'));
    };
  }
  document.getElementById('btn-cop-terminal').onclick = () => window.agents.copilotLaunchTerminal();

  // Load sessions
  const sessions = await window.agents.copilotSessions();
  renderCopilotSessions(sessions);
}

function renderCopilotSessions(sessions) {
  const container = document.getElementById('copilot-sessions-list');
  if (!sessions.length) {
    container.innerHTML = '<div class="empty-sessions">No Copilot sessions found. Open a terminal to start one.</div>';
    return;
  }

  container.innerHTML = '';
  for (const s of sessions) {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.innerHTML = `
      <div class="session-card-main">
        <div class="session-card-name">${esc(s.name)}</div>
        <div class="session-card-message">${esc(s.first_message || 'No messages')}</div>
        <div class="session-card-meta">
          <span class="mono text-muted">${esc(s.cwd || '')}</span>
          <span class="text-muted">${formatDate(s.updated_at || s.created_at)}</span>
        </div>
      </div>
      <div class="session-card-actions">
        <button class="btn btn-ai btn-sm btn-resume" title="Resume in terminal">Resume</button>
        <button class="btn btn-danger btn-sm btn-delete" title="Delete session">Delete</button>
      </div>`;

    card.querySelector('.btn-resume').onclick = () =>
      window.agents.copilotLaunchTerminal(s.session_id);
    card.querySelector('.btn-delete').onclick = async () => {
      if (!confirm(`Delete session "${s.name}"?`)) return;
      await window.agents.copilotDeleteSession(s.session_id);
      const updated = await window.agents.copilotSessions();
      renderCopilotSessions(updated);
    };
    container.appendChild(card);
  }
}

// ── Claude Code Detail ──────────────────────────────────────────────────────

async function renderClaudeDetail(provider) {
  const detail = document.getElementById('provider-detail');
  const isActive = activeProviderId === 'claude-code';

  let config = { settings: {}, projects: [] };
  if (provider.installed) {
    config = await window.agents.claudeConfig();
  }

  detail.innerHTML = `
    <div class="detail-scroll">
      <div class="detail-header">
        <div class="detail-title-row">
          <span class="detail-icon">${PROVIDER_ICONS['claude-code']}</span>
          <h2>Claude Code</h2>
          ${isActive ? '<span class="active-badge">ACTIVE PROVIDER</span>' : `<button class="btn btn-primary btn-sm" id="btn-set-active">Set as Active</button>`}
        </div>
        <p class="detail-sub">Anthropic Claude Code CLI</p>
      </div>

      <!-- Status -->
      <div class="detail-section">
        <h3 class="section-title">Status</h3>
        <div class="info-grid">
          <span class="info-label">claude CLI</span>
          <span class="info-value mono">${esc(provider.version || 'not installed')}</span>
          <span class="info-label">Status</span>
          <span class="info-value" style="color:${provider.installed ? '#3fb950' : '#f85149'}">
            ${provider.installed ? 'Installed' : 'Not installed'}
          </span>
        </div>
        <div class="section-actions">
          <button class="btn btn-sm" id="btn-cl-refresh">Refresh</button>
          ${!provider.installed ? '<button class="btn btn-primary btn-sm" id="btn-cl-install">Install Claude Code</button>' : ''}
          <button class="btn btn-ai btn-sm" id="btn-cl-terminal">Open Terminal</button>
        </div>
      </div>

      <!-- Configuration -->
      ${provider.installed ? `
      <div class="detail-section">
        <h3 class="section-title">Configuration</h3>
        <div class="config-grid">
          <div class="config-item">
            <label class="config-label">Default Mode</label>
            <select class="config-select" id="cfg-default-mode">
              <option value="normal" ${(config.settings.defaultMode || 'normal') === 'normal' ? 'selected' : ''}>Normal (ask for permissions)</option>
              <option value="bypassPermissions" ${config.settings.defaultMode === 'bypassPermissions' ? 'selected' : ''}>Bypass Permissions</option>
              <option value="plan" ${config.settings.defaultMode === 'plan' ? 'selected' : ''}>Plan Mode</option>
            </select>
          </div>
          <div class="config-item">
            <label class="config-label">
              <input type="checkbox" id="cfg-skip-danger-prompt" ${config.settings.skipDangerousModePermissionPrompt ? 'checked' : ''}/>
              Skip dangerous mode permission prompt
            </label>
          </div>
        </div>
        <div class="section-actions">
          <button class="btn btn-primary btn-sm" id="btn-cl-save-config">Save Configuration</button>
        </div>
      </div>

      <!-- Projects -->
      ${config.projects.length ? `
      <div class="detail-section">
        <h3 class="section-title">Projects</h3>
        <div class="projects-list">
          ${config.projects.map(p => `
            <div class="project-card">
              <span class="project-path mono">${esc(p.decodedPath)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Sessions -->
      <div class="detail-section">
        <h3 class="section-title">Sessions</h3>
        <div id="claude-sessions-list" class="sessions-list">
          <div class="text-muted" style="padding:12px">Loading sessions...</div>
        </div>
      </div>
      ` : `
      <div class="detail-section">
        <div class="empty-sessions">Claude Code is not installed. Click "Install Claude Code" to set it up.</div>
      </div>`}
    </div>`;

  // Wire buttons
  if (!isActive) {
    document.getElementById('btn-set-active').onclick = async () => {
      await window.agents.setActiveProvider('claude-code');
      activeProviderId = 'claude-code';
      renderSidebar();
      await renderClaudeDetail(provider);
    };
  }

  document.getElementById('btn-cl-refresh').onclick = async () => {
    providers = await window.agents.detectProviders();
    const updated = providers.find(p => p.id === 'claude-code');
    renderSidebar();
    await renderClaudeDetail(updated);
  };

  const installBtn = document.getElementById('btn-cl-install');
  if (installBtn) installBtn.onclick = () => window.agents.claudeInstall();

  document.getElementById('btn-cl-terminal').onclick = () => window.agents.claudeLaunchTerminal();

  // Save config
  const saveBtn = document.getElementById('btn-cl-save-config');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const settings = { ...config.settings };
      settings.defaultMode = document.getElementById('cfg-default-mode').value;
      settings.skipDangerousModePermissionPrompt = document.getElementById('cfg-skip-danger-prompt').checked;
      await window.agents.claudeWriteSettings(settings);
      saveBtn.textContent = 'Saved!';
      setTimeout(() => { saveBtn.textContent = 'Save Configuration'; }, 2000);
    };
  }

  // Load sessions
  if (provider.installed) {
    const sessions = await window.agents.claudeSessions();
    renderClaudeSessions(sessions);
  }
}

function renderClaudeSessions(sessions) {
  const container = document.getElementById('claude-sessions-list');
  if (!sessions.length) {
    container.innerHTML = '<div class="empty-sessions">No Claude sessions found. Open a terminal to start one.</div>';
    return;
  }

  container.innerHTML = '';
  for (const s of sessions) {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.innerHTML = `
      <div class="session-card-main">
        <div class="session-card-name">${esc(s.name)}</div>
        <div class="session-card-message">${esc(s.first_message || 'No messages')}</div>
        <div class="session-card-meta">
          <span class="mono text-muted">${esc(s.cwd || '')}</span>
          <span class="text-muted">${s.message_count || 0} messages</span>
          <span class="text-muted">${formatDate(s.started_at)}</span>
        </div>
      </div>
      <div class="session-card-actions">
        <button class="btn btn-ai btn-sm btn-resume" title="Resume in terminal">Resume</button>
      </div>`;

    card.querySelector('.btn-resume').onclick = () =>
      window.agents.claudeLaunchTerminal(s.session_id);
    container.appendChild(card);
  }
}

// ── Resizable sidebar ───────────────────────────────────────────────────────

function initResizer() {
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('resizer');
  let startX, startW;

  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e) => {
      const w = startW + (e.clientX - startX);
      sidebar.style.width = Math.max(180, Math.min(400, w)) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
}

// ── RobOS icon registry injection ───────────────────────────────────────────

(function () {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'agents-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();

// ── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
