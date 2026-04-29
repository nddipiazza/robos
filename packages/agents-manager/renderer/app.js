'use strict';

let providers = [];
let activeProviderId = null;
let selectedProviderId = null;

// ── Copilot CLI flag definitions ─────────────────────────────────────────────
// type: 'bool' | 'text' | 'number' | 'select'
// common: shown in "Most Common" mode

const COPILOT_FLAGS = [
  // ── Most Common ──
  { id: 'model', flag: '--model', type: 'model-select', label: 'Model',
    desc: 'AI model to use — fetched from the GitHub Copilot API (only models you have access to)',
    common: true },
  { id: 'mode', flag: '--mode', type: 'select', label: 'Mode',
    desc: 'Set the initial agent mode',
    options: ['interactive', 'plan', 'autopilot'],
    common: true },
  { id: 'effort', flag: '--effort', type: 'select', label: 'Reasoning Effort',
    desc: 'Set the reasoning effort level',
    options: ['low', 'medium', 'high', 'xhigh'],
    common: true },
  { id: 'yolo', flag: '--yolo', type: 'bool', label: 'Yolo (Allow All)',
    desc: 'Enable all permissions: tools, paths, and URLs — no confirmation prompts',
    common: true },
  { id: 'allow-all-tools', flag: '--allow-all-tools', type: 'bool', label: 'Allow All Tools',
    desc: 'Allow all tools to run automatically without confirmation',
    common: true },
  { id: 'name', flag: '--name', type: 'text', label: 'Session Name',
    desc: 'Set a name for the new session',
    common: true },
  { id: 'cwd', flag: 'cwd', type: 'dir', label: 'Working Directory',
    desc: 'Start Copilot in this directory (cd before launching)',
    common: true },
  // ── All ──
  { id: 'add-dir', flag: '--add-dir', type: 'dir', label: 'Add Directory',
    desc: 'Add a directory to the allowed list for file access',
    common: false },
  { id: 'allow-all-paths', flag: '--allow-all-paths', type: 'bool', label: 'Allow All Paths',
    desc: 'Disable file path verification — allow access to any path',
    common: false },
  { id: 'allow-all-urls', flag: '--allow-all-urls', type: 'bool', label: 'Allow All URLs',
    desc: 'Allow access to all URLs without confirmation',
    common: false },
  { id: 'autopilot', flag: '--autopilot', type: 'bool', label: 'Autopilot',
    desc: 'Start in autopilot mode',
    common: true },
  { id: 'continue', flag: '--continue', type: 'bool', label: 'Continue',
    desc: 'Resume the most recent session',
    common: false },
  { id: 'experimental', flag: '--experimental', type: 'bool', label: 'Experimental',
    desc: 'Enable experimental features',
    common: false },
  { id: 'log-level', flag: '--log-level', type: 'select', label: 'Log Level',
    desc: 'Set the log verbosity level',
    options: ['none', 'error', 'warning', 'info', 'debug', 'all'],
    common: false },
  { id: 'max-autopilot-continues', flag: '--max-autopilot-continues', type: 'number',
    label: 'Max Autopilot Continues',
    desc: 'Maximum number of continuation messages in autopilot mode',
    common: false },
  { id: 'no-ask-user', flag: '--no-ask-user', type: 'bool', label: 'No Ask User',
    desc: 'Disable the ask_user tool — agent works fully autonomously',
    common: false },
  { id: 'no-auto-update', flag: '--no-auto-update', type: 'bool', label: 'No Auto-Update',
    desc: 'Disable automatic CLI update download',
    common: false },
  { id: 'no-color', flag: '--no-color', type: 'bool', label: 'No Color',
    desc: 'Disable all color output',
    common: false },
  { id: 'no-custom-instructions', flag: '--no-custom-instructions', type: 'bool',
    label: 'No Custom Instructions',
    desc: 'Disable loading of custom instructions from AGENTS.md',
    common: false },
  { id: 'no-remote', flag: '--no-remote', type: 'bool', label: 'No Remote',
    desc: 'Disable remote control of your session from GitHub web and mobile',
    common: false },
  { id: 'output-format', flag: '--output-format', type: 'select', label: 'Output Format',
    desc: 'Output format for non-interactive mode',
    options: ['text', 'json'],
    common: false },
  { id: 'plan', flag: '--plan', type: 'bool', label: 'Plan Mode',
    desc: 'Start in plan mode',
    common: false },
  { id: 'plain-diff', flag: '--plain-diff', type: 'bool', label: 'Plain Diff',
    desc: 'Disable rich diff rendering',
    common: false },
  { id: 'stream', flag: '--stream', type: 'select', label: 'Stream',
    desc: 'Enable or disable streaming mode',
    options: ['on', 'off'],
    common: false },
];

let copilotFlagMode = localStorage.getItem('copilotFlagMode') || 'common';
let copilotFlagValues = (() => { try { return JSON.parse(localStorage.getItem('copilotFlagValues') || '{}'); } catch { return {}; } })();
let cachedModels = null; // populated from GitHub Copilot API (policy=enabled only)

function saveFlagState() {
  localStorage.setItem('copilotFlagMode', copilotFlagMode);
  localStorage.setItem('copilotFlagValues', JSON.stringify(copilotFlagValues));
}

// ── Claude Code flag definitions ─────────────────────────────────────────────

const CLAUDE_FLAGS = [
  // ── Most Common ──
  { id: 'model', flag: '--model', type: 'model-select', label: 'Model',
    desc: "Model to use — choose an alias ('sonnet', 'opus') or full model name",
    common: true },
  { id: 'effort', flag: '--effort', type: 'select', label: 'Effort Level',
    desc: 'Effort level for the current session',
    options: ['low', 'medium', 'high', 'xhigh', 'max'],
    common: true },
  { id: 'cwd', flag: 'cwd', type: 'dir', label: 'Working Directory',
    desc: 'Start Claude in this directory (cd before launching)',
    common: true },
  { id: 'add-dir', flag: '--add-dir', type: 'dir', label: 'Add Directory',
    desc: 'Additional directory to allow tool access to',
    common: true },
  { id: 'continue', flag: '--continue', type: 'bool', label: 'Continue Last Session',
    desc: 'Continue the most recent conversation in the current directory',
    common: true },
  { id: 'dangerously-skip-permissions', flag: '--dangerously-skip-permissions', type: 'bool', label: 'Skip Permissions ⚠',
    desc: 'Bypass all permission checks. Recommended only for sandboxed environments.',
    common: true },
  // ── All ──
  { id: 'ide', flag: '--ide', type: 'bool', label: 'Connect to IDE',
    desc: 'Automatically connect to IDE on startup if exactly one valid IDE is available',
    common: false },
  { id: 'append-system-prompt', flag: '--append-system-prompt', type: 'text', label: 'Append System Prompt',
    desc: 'Append a system prompt to the default system prompt',
    common: false },
  { id: 'allowedTools', flag: '--allowedTools', type: 'text', label: 'Allowed Tools',
    desc: 'Comma or space-separated list of tool names to allow (e.g. "Bash(git *) Edit")',
    common: false },
  { id: 'disallowedTools', flag: '--disallowedTools', type: 'text', label: 'Disallowed Tools',
    desc: 'Comma or space-separated list of tool names to deny',
    common: false },
  { id: 'bare', flag: '--bare', type: 'bool', label: 'Bare / Minimal Mode',
    desc: 'Minimal mode: skip hooks, LSP, plugin sync, auto-memory, and background prefetches',
    common: false },
  { id: 'mcp-debug', flag: '--mcp-debug', type: 'bool', label: 'MCP Debug',
    desc: 'Enable MCP debug mode (shows MCP server errors)',
    common: false },
];

let claudeFlagMode = localStorage.getItem('claudeFlagMode') || 'common';
let claudeFlagValues = (() => { try { return JSON.parse(localStorage.getItem('claudeFlagValues') || '{}'); } catch { return {}; } })();
let claudeModelList = [];  // cached from claude-fetch-models

function saveClaudeFlagState() {
  localStorage.setItem('claudeFlagMode', claudeFlagMode);
  localStorage.setItem('claudeFlagValues', JSON.stringify(claudeFlagValues));
}

// ── Codex CLI flag definitions ───────────────────────────────────────────────

const CODEX_FLAGS = [
  // ── Most Common ──
  { id: 'model', flag: '--model', type: 'model-select', label: 'Model',
    desc: 'AI model to use — fetched from codex debug models (only models available to you)',
    common: true },
  { id: 'ask-for-approval', flag: '--ask-for-approval', type: 'select', label: 'Approval Policy',
    desc: 'When to ask for human approval before executing commands',
    options: ['untrusted', 'on-request', 'never'],
    common: true },
  { id: 'sandbox', flag: '--sandbox', type: 'select', label: 'Sandbox Mode',
    desc: 'Filesystem sandbox policy for model-generated shell commands',
    options: ['read-only', 'workspace-write', 'danger-full-access'],
    common: true },
  { id: 'full-auto', flag: '--full-auto', type: 'bool', label: 'Full Auto',
    desc: 'Convenience alias for low-friction sandboxed automatic execution',
    common: true },
  { id: 'search', flag: '--search', type: 'bool', label: 'Web Search',
    desc: 'Enable live web search — adds the native web_search tool (no per-call approval)',
    common: true },
  { id: 'cd', flag: '--cd', type: 'dir', label: 'Working Directory',
    desc: 'Tell the agent to use the specified directory as its working root',
    common: true },
  // ── All ──
  { id: 'profile', flag: '--profile', type: 'text', label: 'Config Profile',
    desc: 'Configuration profile from config.toml to use',
    common: false },
  { id: 'add-dir', flag: '--add-dir', type: 'dir', label: 'Add Writable Directory',
    desc: 'Additional directory that should be writable alongside the primary workspace',
    common: false },
  { id: 'dangerously-bypass-approvals-and-sandbox', flag: '--dangerously-bypass-approvals-and-sandbox',
    type: 'bool', label: 'Bypass All Approvals ⚠',
    desc: 'Skip ALL confirmation prompts and execute without sandboxing. EXTREMELY DANGEROUS.',
    common: false },
  { id: 'oss', flag: '--oss', type: 'bool', label: 'Use OSS Provider',
    desc: 'Use an open-source provider (lmstudio / ollama)',
    common: false },
  { id: 'local-provider', flag: '--local-provider', type: 'select', label: 'Local Provider',
    desc: 'Which local OSS provider to use (requires --oss)',
    options: ['lmstudio', 'ollama'],
    common: false },
  { id: 'no-alt-screen', flag: '--no-alt-screen', type: 'bool', label: 'No Alt Screen',
    desc: 'Disable alternate screen mode — runs TUI inline (useful in Zellij/tmux)',
    common: false },
];

let codexFlagMode = localStorage.getItem('codexFlagMode') || 'common';
let codexFlagValues = (() => { try { return JSON.parse(localStorage.getItem('codexFlagValues') || '{}'); } catch { return {}; } })();
let codexModelList = [];  // cached from codex debug models

function saveCodexFlagState() {
  localStorage.setItem('codexFlagMode', codexFlagMode);
  localStorage.setItem('codexFlagValues', JSON.stringify(codexFlagValues));
}

// ── Provider icons (inline SVG) ─────────────────────────────────────────────

const PROVIDER_ICONS = {
  'github-copilot': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 19 4.77 5.07 5.07 0 0 0 18.91 1S17.73.65 15 2.48a13.38 13.38 0 0 0-7 0C5.27.65 4.09 1 4.09 1A5.07 5.07 0 0 0 4 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 8 18.13V22"/></svg>`,
  'claude-code': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>`,
  'codex': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`,
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
  } else if (id === 'codex') {
    await renderCodexDetail(provider);
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
          <span class="info-label">Logged in as</span>
          <span class="info-value">${esc(provider.user || 'not logged in')}</span>
          <span class="info-label">Status</span>
          <span class="info-value" style="color:${provider.authenticated ? '#3fb950' : '#e3b341'}">
            ${provider.authenticated ? 'Connected' : provider.installed ? 'Not authenticated' : 'Not installed'}
          </span>
        </div>
        <div class="section-actions">
          <button class="btn btn-sm" id="btn-cop-refresh">Refresh</button>
          <button class="btn btn-primary btn-sm" id="btn-cop-login">${provider.authenticated ? 'Re-auth to GitHub' : 'Login to GitHub'}</button>
          ${provider.authenticated ? '<button class="btn btn-danger btn-sm" id="btn-cop-logout">Logout</button>' : ''}
          <div class="split-btn-group" id="cop-terminal-group">
            <button class="btn btn-ai btn-sm" id="btn-cop-terminal">Open Copilot CLI Terminal</button>
            <button class="btn btn-ai btn-sm split-btn-arrow" id="btn-cop-flags-toggle" title="Configure launch flags">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
        <div class="flags-dropdown hidden" id="cop-flags-dropdown">
          <div class="flags-dropdown-header">
            <span class="flags-dropdown-title">Launch Flags</span>
            <div class="flags-mode-toggle">
              <button class="flags-mode-btn ${copilotFlagMode === 'common' ? 'active' : ''}" id="flags-mode-common">Most Common</button>
              <button class="flags-mode-btn ${copilotFlagMode === 'all' ? 'active' : ''}" id="flags-mode-all">All</button>
            </div>
          </div>
          <div id="flags-list" class="flags-list"></div>
        </div>
        <div id="cop-install-status" style="display:none"></div>
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
  const copLogoutBtn = document.getElementById('btn-cop-logout');
  if (copLogoutBtn) copLogoutBtn.onclick = () => window.agents.copilotLogout();
  document.getElementById('btn-cop-terminal').onclick = () =>
    window.agents.copilotLaunchTerminal(null, buildCopilotArgs(), copilotFlagValues['cwd'] || null);

  // Flags dropdown toggle
  document.getElementById('btn-cop-flags-toggle').onclick = (e) => {
    e.stopPropagation();
    const dd = document.getElementById('cop-flags-dropdown');
    dd.classList.toggle('hidden');
    if (!dd.classList.contains('hidden')) {
      renderFlagsDropdown();
      // Auto-fetch models the first time the panel opens
      if (!cachedModels) {
        window.agents.copilotFetchModels().then(result => {
          if (!result.error) {
            cachedModels = result.models;
            renderFlagsDropdown();
          }
        });
      }
    }
  };
  document.getElementById('cop-flags-dropdown').addEventListener('click', e => e.stopPropagation());
  document.getElementById('flags-mode-common').onclick = () => {
    copilotFlagMode = 'common';
    saveFlagState();
    renderFlagsDropdown();
  };
  document.getElementById('flags-mode-all').onclick = () => {
    copilotFlagMode = 'all';
    saveFlagState();
    renderFlagsDropdown();
  };
  // Initial render if dropdown was open
  renderFlagsDropdown();

  // Load sessions
  const sessions = await window.agents.copilotSessions();
  renderCopilotSessions(sessions);
}

// ── Copilot flags dropdown ───────────────────────────────────────────────────

function renderFlagsDropdown() {
  const listEl = document.getElementById('flags-list');
  if (!listEl) return;

  // Update mode button states
  document.getElementById('flags-mode-common')?.classList.toggle('active', copilotFlagMode === 'common');
  document.getElementById('flags-mode-all')?.classList.toggle('active', copilotFlagMode === 'all');

  const flags = copilotFlagMode === 'common'
    ? COPILOT_FLAGS.filter(f => f.common)
    : [...COPILOT_FLAGS].sort((a, b) => a.label.localeCompare(b.label));

  listEl.innerHTML = '';
  for (const f of flags) {
    const row = document.createElement('div');
    row.className = 'flags-row';

    if (f.type === 'bool') {
      const checked = !!copilotFlagValues[f.id];
      row.innerHTML = `
        <label class="flags-bool-label" title="${esc(f.desc)}">
          <input type="checkbox" class="flags-checkbox" data-id="${f.id}" ${checked ? 'checked' : ''}/>
          <span class="flags-flag-name">${esc(f.flag)}</span>
          <span class="flags-label-text">${esc(f.label)}</span>
          <span class="flags-desc">${esc(f.desc)}</span>
        </label>`;
      row.querySelector('input').onchange = (e) => {
        if (e.target.checked) copilotFlagValues[f.id] = true;
        else delete copilotFlagValues[f.id];
        saveFlagState();
      };
    } else if (f.type === 'model-select') {
      // Dynamic select populated from the Copilot API (policy=enabled only)
      const val = copilotFlagValues[f.id] || '';
      const enabled = !!val;
      const models = cachedModels || [];
      const optionsHtml = models.length
        ? models.map(m => `<option value="${esc(m)}" ${val === m ? 'selected' : ''}>${esc(m)}</option>`).join('')
        : (val ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : '');
      row.innerHTML = `
        <div class="flags-value-row" title="${esc(f.desc)}">
          <input type="checkbox" class="flags-checkbox" data-id="${f.id}" ${enabled ? 'checked' : ''}/>
          <span class="flags-flag-name">${esc(f.flag)}</span>
          <select class="flags-select flags-value-input" data-id="${f.id}" id="model-select">
            <option value="">${models.length ? '-- choose model --' : '(click ↻ to load)'}</option>
            ${optionsHtml}
          </select>
          <button class="btn btn-sm flags-fetch-btn" id="btn-fetch-models" title="Fetch available models from GitHub API">↻</button>
          <span class="flags-desc">${esc(f.desc)}</span>
        </div>`;
      const checkbox = row.querySelector('.flags-checkbox');
      const select = row.querySelector('.flags-value-input');
      checkbox.onchange = (e) => {
        if (!e.target.checked) { delete copilotFlagValues[f.id]; select.value = ''; }
        else if (select.value) copilotFlagValues[f.id] = select.value;
        saveFlagState();
      };
      select.onchange = () => {
        if (select.value) { copilotFlagValues[f.id] = select.value; checkbox.checked = true; }
        else { delete copilotFlagValues[f.id]; checkbox.checked = false; }
        saveFlagState();
      };
    } else {
      const val = copilotFlagValues[f.id] || '';
      const enabled = !!val;
      const isDirType = f.type === 'dir';
      row.innerHTML = `
        <div class="flags-value-row" title="${esc(f.desc)}">
          <input type="checkbox" class="flags-checkbox" data-id="${f.id}" ${enabled ? 'checked' : ''}/>
          <span class="flags-flag-name">${esc(f.flag)}</span>
          ${f.type === 'select' ? `
            <select class="flags-select flags-value-input" data-id="${f.id}">
              <option value="">-- choose --</option>
              ${f.options.map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
            </select>` : isDirType ? `
            <div class="flags-dir-group">
              <input type="text" class="flags-text-input flags-value-input" data-id="${f.id}"
                value="${esc(String(val))}" placeholder="choose directory…" readonly/>
              <button class="btn btn-sm flags-dir-browse" title="Browse…">📁</button>
            </div>` : `
            <input type="${f.type === 'number' ? 'number' : 'text'}" class="flags-text-input flags-value-input"
              data-id="${f.id}" value="${esc(String(val))}"
              placeholder="${f.type === 'number' ? '0' : f.label}"/>`}
          <span class="flags-desc">${esc(f.desc)}</span>
        </div>`;
      const checkbox = row.querySelector('.flags-checkbox');
      const input = row.querySelector('.flags-value-input');
      checkbox.onchange = (e) => {
        if (!e.target.checked) { delete copilotFlagValues[f.id]; input.value = ''; }
        else if (input.value) copilotFlagValues[f.id] = input.value;
        saveFlagState();
      };
      if (isDirType) {
        row.querySelector('.flags-dir-browse').onclick = async () => {
          const chosen = await window.agents.openDirDialog();
          if (chosen) {
            input.value = chosen;
            copilotFlagValues[f.id] = chosen;
            checkbox.checked = true;
            saveFlagState();
          }
        };
        input.oninput = input.onchange = () => {
          if (input.value) { copilotFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete copilotFlagValues[f.id]; checkbox.checked = false; }
          saveFlagState();
        };
      } else {
        input.oninput = input.onchange = () => {
          if (input.value) { copilotFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete copilotFlagValues[f.id]; checkbox.checked = false; }
          saveFlagState();
        };
      }
    }
    listEl.appendChild(row);
  }

  // Wire the fetch-models refresh button
  const fetchBtn = document.getElementById('btn-fetch-models');
  if (fetchBtn) {
    fetchBtn.onclick = async (e) => {
      e.stopPropagation();
      fetchBtn.textContent = '…';
      fetchBtn.disabled = true;
      fetchBtn.title = 'Fetching models…';
      const result = await window.agents.copilotFetchModels();
      fetchBtn.disabled = false;
      if (result.error) {
        fetchBtn.textContent = '✗';
        fetchBtn.title = result.error;
        setTimeout(() => { fetchBtn.textContent = '↻'; fetchBtn.title = 'Fetch available models from GitHub API'; }, 3000);
        return;
      }
      cachedModels = result.models;
      fetchBtn.textContent = '✓';
      fetchBtn.title = `${result.models.length} models available`;
      setTimeout(() => { fetchBtn.textContent = '↻'; fetchBtn.title = 'Refresh model list from GitHub API'; }, 2000);
      // Re-render to populate the select with fresh models
      renderFlagsDropdown();
    };
  }
}

function buildCopilotArgs() {
  const args = [];
  for (const f of COPILOT_FLAGS) {
    if (f.id === 'cwd') continue;  // handled via cd before launch, not a real copilot flag
    const val = copilotFlagValues[f.id];
    if (!val) continue;
    if (f.type === 'bool') {
      args.push(f.flag);
    } else {
      const str = String(val).trim();
      if (str) { args.push(f.flag, str); }
    }
  }
  return args;
}

// ── Copilot sessions ─────────────────────────────────────────────────────────

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
          <span class="info-label">Logged in as</span>
          <span class="info-value">${esc(provider.user || 'not logged in')}</span>
          <span class="info-label">Status</span>
          <span class="info-value" style="color:${provider.authenticated ? '#3fb950' : provider.installed ? '#e3b341' : '#f85149'}">
            ${provider.authenticated ? 'Connected' : provider.installed ? 'Not authenticated' : 'Not installed'}
          </span>
        </div>
        <div class="section-actions">
          <button class="btn btn-sm" id="btn-cl-refresh">Refresh</button>
          ${!provider.installed ? '<button class="btn btn-primary btn-sm" id="btn-cl-install">Install Claude Code</button>' : ''}
          ${provider.installed && !provider.authenticated ? '<button class="btn btn-primary btn-sm" id="btn-cl-login">Login</button>' : ''}
          ${provider.installed && provider.authenticated ? '<button class="btn btn-danger btn-sm" id="btn-cl-logout">Logout</button>' : ''}
          ${provider.installed ? `
          <div class="split-btn-group" id="cl-terminal-group">
            <button class="btn btn-ai btn-sm" id="btn-cl-terminal">Open Claude Terminal</button>
            <button class="btn btn-ai btn-sm split-btn-arrow" id="btn-cl-flags-toggle" title="Configure launch flags">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>` : ''}
        </div>
        ${provider.installed ? `
        <div class="flags-dropdown hidden" id="cl-flags-dropdown">
          <div class="flags-dropdown-header">
            <span class="flags-dropdown-title">Launch Flags</span>
            <div class="flags-mode-toggle">
              <button class="flags-mode-btn ${claudeFlagMode === 'common' ? 'active' : ''}" id="cl-flags-mode-common">Most Common</button>
              <button class="flags-mode-btn ${claudeFlagMode === 'all' ? 'active' : ''}" id="cl-flags-mode-all">All</button>
            </div>
          </div>
          <div id="cl-flags-list" class="flags-list"></div>
        </div>` : ''}
      </div>

      ${provider.installed ? `
      <!-- Sessions -->
      <div class="detail-section">
        <h3 class="section-title">Sessions</h3>
        <div id="claude-sessions-list" class="sessions-list">
          <div class="text-muted" style="padding:12px">Loading sessions...</div>
        </div>
      </div>` : `
      <div class="detail-section">
        <div class="empty-sessions">Claude Code is not installed. Click "Install Claude Code" to set it up.</div>
      </div>`}
    </div>`;

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

  const clLoginBtn = document.getElementById('btn-cl-login');
  if (clLoginBtn) clLoginBtn.onclick = () => window.agents.claudeLogin();

  const clLogoutBtn = document.getElementById('btn-cl-logout');
  if (clLogoutBtn) clLogoutBtn.onclick = () => window.agents.claudeLogout();

  const termBtn = document.getElementById('btn-cl-terminal');
  if (termBtn) termBtn.onclick = () => window.agents.claudeLaunchTerminal(null, buildClaudeArgs(), claudeFlagValues['cwd'] || null);

  const flagsToggle = document.getElementById('btn-cl-flags-toggle');
  if (flagsToggle) {
    // Auto-fetch models the first time the panel opens
    if (claudeModelList.length === 0) {
      window.agents.claudeFetchModels().then(result => {
        if (result && result.models) {
          claudeModelList = result.models;
          renderClaudeFlagsDropdown();
        }
      });
    }
    flagsToggle.onclick = (e) => {
      e.stopPropagation();
      const dd = document.getElementById('cl-flags-dropdown');
      dd.classList.toggle('hidden');
      if (!dd.classList.contains('hidden')) renderClaudeFlagsDropdown();
    };
    document.getElementById('cl-flags-dropdown').addEventListener('click', e => e.stopPropagation());
    document.getElementById('cl-flags-mode-common').onclick = () => {
      claudeFlagMode = 'common'; saveClaudeFlagState(); renderClaudeFlagsDropdown();
    };
    document.getElementById('cl-flags-mode-all').onclick = () => {
      claudeFlagMode = 'all'; saveClaudeFlagState(); renderClaudeFlagsDropdown();
    };
    renderClaudeFlagsDropdown();
  }

  if (provider.installed) {
    const sessions = await window.agents.claudeSessions();
    renderClaudeSessions(sessions);
  }
}

// ── Claude flags dropdown ────────────────────────────────────────────────────

function renderClaudeFlagsDropdown() {
  const listEl = document.getElementById('cl-flags-list');
  if (!listEl) return;

  document.getElementById('cl-flags-mode-common')?.classList.toggle('active', claudeFlagMode === 'common');
  document.getElementById('cl-flags-mode-all')?.classList.toggle('active', claudeFlagMode === 'all');

  const flags = claudeFlagMode === 'common'
    ? CLAUDE_FLAGS.filter(f => f.common)
    : [...CLAUDE_FLAGS].sort((a, b) => a.label.localeCompare(b.label));

  listEl.innerHTML = '';
  for (const f of flags) {
    const row = document.createElement('div');
    row.className = 'flags-row';

    if (f.type === 'bool') {
      const checked = !!claudeFlagValues[f.id];
      row.innerHTML = `
        <label class="flags-bool-label" title="${esc(f.desc)}">
          <input type="checkbox" class="flags-checkbox" data-id="${f.id}" ${checked ? 'checked' : ''}/>
          <span class="flags-flag-name">${esc(f.flag)}</span>
          <span class="flags-label-text">${esc(f.label)}</span>
          <span class="flags-desc">${esc(f.desc)}</span>
        </label>`;
      row.querySelector('input').onchange = (e) => {
        if (e.target.checked) claudeFlagValues[f.id] = true;
        else delete claudeFlagValues[f.id];
        saveClaudeFlagState();
      };
    } else {
      const val = claudeFlagValues[f.id] || '';
      const enabled = !!val;
      const inputHtml = f.type === 'select'
        ? `<select class="flags-select flags-value-input" data-id="${f.id}">
             <option value="">-- choose --</option>
             ${f.options.map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
           </select>`
        : f.type === 'model-select'
        ? `<div class="flags-dir-group">
             <select class="flags-select flags-value-input" data-id="${f.id}" style="width:200px">
               <option value="">-- choose model --</option>
               ${claudeModelList.map(m => `<option value="${esc(m.id)}" ${val === m.id ? 'selected' : ''}>${esc(m.label || m.id)}</option>`).join('')}
             </select>
             <button class="btn btn-sm flags-fetch-btn" id="btn-cl-fetch-models" title="Refresh model list">↻</button>
           </div>`
        : f.type === 'dir'
        ? `<div class="flags-dir-group">
             <input type="text" class="flags-text-input flags-value-input"
               data-id="${f.id}" value="${esc(String(val))}" placeholder="${esc(f.label)}" readonly/>
             <button class="btn btn-sm flags-dir-browse" data-id="${f.id}" title="Browse\u2026">\uD83D\uDCC1</button>
           </div>`
        : `<input type="text" class="flags-text-input flags-value-input"
             data-id="${f.id}" value="${esc(String(val))}" placeholder="${esc(f.label)}"/>`;
      row.innerHTML = `
        <div class="flags-value-row" title="${esc(f.desc)}">
          <input type="checkbox" class="flags-checkbox" data-id="${f.id}" ${enabled ? 'checked' : ''}/>
          <span class="flags-flag-name">${esc(f.flag)}</span>
          ${inputHtml}
          <span class="flags-desc">${esc(f.desc)}</span>
        </div>`;
      const checkbox = row.querySelector('.flags-checkbox');
      const input = row.querySelector('.flags-value-input');
      checkbox.onchange = (e) => {
        if (!e.target.checked) { delete claudeFlagValues[f.id]; input.value = ''; }
        else if (input.value) claudeFlagValues[f.id] = input.value;
        saveClaudeFlagState();
      };
      if (f.type === 'model-select') {
        const refreshBtn = row.querySelector('#btn-cl-fetch-models');
        refreshBtn.onclick = async () => {
          refreshBtn.textContent = '⟳'; refreshBtn.disabled = true;
          const result = await window.agents.claudeFetchModels();
          refreshBtn.disabled = false;
          if (result && result.models) {
            claudeModelList = result.models;
            refreshBtn.title = `${claudeModelList.length} models loaded`;
            renderClaudeFlagsDropdown();
          } else {
            refreshBtn.textContent = '✗';
            setTimeout(() => { refreshBtn.textContent = '↻'; refreshBtn.title = 'Refresh model list'; }, 3000);
          }
        };
        input.onchange = () => {
          if (input.value) { claudeFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete claudeFlagValues[f.id]; checkbox.checked = false; }
          saveClaudeFlagState();
        };
      } else if (f.type === 'dir') {
        row.querySelector('.flags-dir-browse').onclick = async () => {
          const chosen = await window.agents.openDirDialog();
          if (chosen) {
            input.value = chosen;
            claudeFlagValues[f.id] = chosen;
            checkbox.checked = true;
            saveClaudeFlagState();
          }
        };
        input.oninput = input.onchange = () => {
          if (input.value) { claudeFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete claudeFlagValues[f.id]; checkbox.checked = false; }
          saveClaudeFlagState();
        };
      } else {
        input.oninput = input.onchange = () => {
          if (input.value) { claudeFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete claudeFlagValues[f.id]; checkbox.checked = false; }
          saveClaudeFlagState();
        };
      }
    }
    listEl.appendChild(row);
  }
}

function buildClaudeArgs() {
  const args = [];
  for (const f of CLAUDE_FLAGS) {
    if (f.id === 'cwd') continue;  // handled via cd before launch, not a real claude flag
    const val = claudeFlagValues[f.id];
    if (!val) continue;
    if (f.type === 'bool') {
      args.push(f.flag);
    } else {
      const str = String(val).trim();
      if (str) args.push(f.flag, str);
    }
  }
  return args;
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

// ── Codex Detail ────────────────────────────────────────────────────────────

async function renderCodexDetail(provider) {
  const detail = document.getElementById('provider-detail');
  const isActive = activeProviderId === 'codex';

  detail.innerHTML = `
    <div class="detail-scroll">
      <div class="detail-header">
        <div class="detail-title-row">
          <span class="detail-icon">${PROVIDER_ICONS['codex']}</span>
          <h2>Codex</h2>
          ${isActive ? '<span class="active-badge">ACTIVE PROVIDER</span>' : `<button class="btn btn-primary btn-sm" id="btn-set-active">Set as Active</button>`}
        </div>
        <p class="detail-sub">OpenAI Codex CLI</p>
      </div>

      <!-- Status -->
      <div class="detail-section">
        <h3 class="section-title">Status</h3>
        <div class="info-grid">
          <span class="info-label">codex CLI</span>
          <span class="info-value mono">${esc(provider.version || 'not installed')}</span>
          <span class="info-label">Logged in as</span>
          <span class="info-value">${esc(provider.user || 'not logged in')}</span>
          <span class="info-label">Status</span>
          <span class="info-value" style="color:${provider.authenticated ? '#3fb950' : provider.installed ? '#e3b341' : '#f85149'}">
            ${provider.authenticated ? 'Connected' : provider.installed ? 'Not authenticated' : 'Not installed'}
          </span>
        </div>
        <div class="section-actions">
          <button class="btn btn-sm" id="btn-cx-refresh">Refresh</button>
          ${provider.installed && !provider.authenticated ? `<button class="btn btn-primary btn-sm" id="btn-cx-login">Login / Re-auth</button>` : ''}
          ${provider.installed && provider.authenticated ? `<button class="btn btn-danger btn-sm" id="btn-cx-logout">Logout</button>` : ''}
          ${provider.installed ? `
          <div class="split-btn-group" id="cx-terminal-group">
            <button class="btn btn-ai btn-sm" id="btn-cx-terminal">Open Codex Terminal</button>
            <button class="btn btn-ai btn-sm split-btn-arrow" id="btn-cx-flags-toggle" title="Configure launch flags">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>` : ''}
        </div>
        ${provider.installed ? `
        <div class="flags-dropdown hidden" id="cx-flags-dropdown">
          <div class="flags-dropdown-header">
            <span class="flags-dropdown-title">Launch Flags</span>
            <div class="flags-mode-toggle">
              <button class="flags-mode-btn ${codexFlagMode === 'common' ? 'active' : ''}" id="cx-flags-mode-common">Most Common</button>
              <button class="flags-mode-btn ${codexFlagMode === 'all' ? 'active' : ''}" id="cx-flags-mode-all">All</button>
            </div>
          </div>
          <div id="cx-flags-list" class="flags-list"></div>
        </div>` : ''}
      </div>

      ${provider.installed ? `
      <!-- Sessions -->
      <div class="detail-section">
        <h3 class="section-title">Recent Sessions</h3>
        <div id="codex-sessions-list" class="sessions-list">
          <div class="text-muted" style="padding:12px">Loading sessions...</div>
        </div>
      </div>` : `
      <div class="detail-section">
        <div class="empty-sessions">Codex is not installed. Install it via Dev Tools.</div>
      </div>`}
    </div>`;

  if (!isActive) {
    document.getElementById('btn-set-active').onclick = async () => {
      await window.agents.setActiveProvider('codex');
      activeProviderId = 'codex';
      renderSidebar();
      await renderCodexDetail(provider);
    };
  }

  document.getElementById('btn-cx-refresh').onclick = async () => {
    providers = await window.agents.detectProviders();
    const updated = providers.find(p => p.id === 'codex');
    renderSidebar();
    await renderCodexDetail(updated);
  };

  const loginBtn = document.getElementById('btn-cx-login');
  if (loginBtn) loginBtn.onclick = () => window.agents.codexLogin();

  const cxLogoutBtn = document.getElementById('btn-cx-logout');
  if (cxLogoutBtn) cxLogoutBtn.onclick = () => window.agents.codexLogout();

  const termBtn = document.getElementById('btn-cx-terminal');
  if (termBtn) termBtn.onclick = () => window.agents.codexLaunchTerminal(null, buildCodexArgs());

  // Flags dropdown toggle
  const flagsToggle = document.getElementById('btn-cx-flags-toggle');
  if (flagsToggle) {
    // Auto-fetch models the first time the panel opens
    if (codexModelList.length === 0) {
      window.agents.codexFetchModels().then(result => {
        if (result && result.models) {
          codexModelList = result.models;
          renderCodexFlagsDropdown();
        }
      });
    }
    flagsToggle.onclick = (e) => {
      e.stopPropagation();
      const dd = document.getElementById('cx-flags-dropdown');
      dd.classList.toggle('hidden');
      if (!dd.classList.contains('hidden')) renderCodexFlagsDropdown();
    };
    document.getElementById('cx-flags-dropdown').addEventListener('click', e => e.stopPropagation());
    document.getElementById('cx-flags-mode-common').onclick = () => {
      codexFlagMode = 'common'; saveCodexFlagState(); renderCodexFlagsDropdown();
    };
    document.getElementById('cx-flags-mode-all').onclick = () => {
      codexFlagMode = 'all'; saveCodexFlagState(); renderCodexFlagsDropdown();
    };
    renderCodexFlagsDropdown();
  }

  if (provider.installed) {
    const sessions = await window.agents.codexSessions();
    renderCodexSessions(sessions);
  }
}

// ── Codex flags dropdown ─────────────────────────────────────────────────────

function renderCodexFlagsDropdown() {
  const listEl = document.getElementById('cx-flags-list');
  if (!listEl) return;

  document.getElementById('cx-flags-mode-common')?.classList.toggle('active', codexFlagMode === 'common');
  document.getElementById('cx-flags-mode-all')?.classList.toggle('active', codexFlagMode === 'all');

  const flags = codexFlagMode === 'common'
    ? CODEX_FLAGS.filter(f => f.common)
    : [...CODEX_FLAGS].sort((a, b) => a.label.localeCompare(b.label));

  listEl.innerHTML = '';
  for (const f of flags) {
    const row = document.createElement('div');
    row.className = 'flags-row';

    if (f.type === 'bool') {
      const checked = !!codexFlagValues[f.id];
      row.innerHTML = `
        <label class="flags-bool-label" title="${esc(f.desc)}">
          <input type="checkbox" class="flags-checkbox" data-id="${f.id}" ${checked ? 'checked' : ''}/>
          <span class="flags-flag-name">${esc(f.flag)}</span>
          <span class="flags-label-text">${esc(f.label)}</span>
          <span class="flags-desc">${esc(f.desc)}</span>
        </label>`;
      row.querySelector('input').onchange = (e) => {
        if (e.target.checked) codexFlagValues[f.id] = true;
        else delete codexFlagValues[f.id];
        saveCodexFlagState();
      };
    } else {
      const val = codexFlagValues[f.id] || '';
      const enabled = !!val;
      const inputHtml = f.type === 'select'
        ? `<select class="flags-select flags-value-input" data-id="${f.id}">
             <option value="">-- choose --</option>
             ${f.options.map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
           </select>`
        : f.type === 'model-select'
        ? `<div class="flags-dir-group">
             <select class="flags-select flags-value-input" data-id="${f.id}" style="width:150px">
               <option value="">-- choose model --</option>
               ${codexModelList.map(m => `<option value="${esc(m.slug)}" ${val === m.slug ? 'selected' : ''}>${esc(m.label || m.slug)}</option>`).join('')}
             </select>
             <button class="btn btn-sm flags-fetch-btn" id="btn-cx-fetch-models" title="Refresh model list from Codex">↻</button>
           </div>`
        : f.type === 'dir'
        ? `<div class="flags-dir-group">
             <input type="text" class="flags-text-input flags-value-input"
               data-id="${f.id}" value="${esc(String(val))}" placeholder="${esc(f.label)}" readonly/>
             <button class="btn btn-sm flags-dir-browse" data-id="${f.id}" title="Browse\u2026">\uD83D\uDCC1</button>
           </div>`
        : `<input type="text" class="flags-text-input flags-value-input"
             data-id="${f.id}" value="${esc(String(val))}" placeholder="${esc(f.label)}"/>`;
      row.innerHTML = `
        <div class="flags-value-row" title="${esc(f.desc)}">
          <input type="checkbox" class="flags-checkbox" data-id="${f.id}" ${enabled ? 'checked' : ''}/>
          <span class="flags-flag-name">${esc(f.flag)}</span>
          ${inputHtml}
          <span class="flags-desc">${esc(f.desc)}</span>
        </div>`;
      const checkbox = row.querySelector('.flags-checkbox');
      const input = row.querySelector('.flags-value-input');
      checkbox.onchange = (e) => {
        if (!e.target.checked) { delete codexFlagValues[f.id]; input.value = ''; }
        else if (input.value) codexFlagValues[f.id] = input.value;
        saveCodexFlagState();
      };
      if (f.type === 'model-select') {
        const refreshBtn = row.querySelector('#btn-cx-fetch-models');
        refreshBtn.onclick = async () => {
          refreshBtn.textContent = '⟳'; refreshBtn.disabled = true;
          const result = await window.agents.codexFetchModels();
          refreshBtn.disabled = false;
          if (result && result.models) {
            codexModelList = result.models;
            refreshBtn.title = `${codexModelList.length} models available`;
            renderCodexFlagsDropdown();
          } else {
            refreshBtn.textContent = '✗'; refreshBtn.title = result.error || 'Failed';
            setTimeout(() => { refreshBtn.textContent = '↻'; refreshBtn.title = 'Refresh model list'; }, 3000);
          }
        };
        input.onchange = () => {
          if (input.value) { codexFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete codexFlagValues[f.id]; checkbox.checked = false; }
          saveCodexFlagState();
        };
      } else if (f.type === 'dir') {
        row.querySelector('.flags-dir-browse').onclick = async () => {
          const chosen = await window.agents.openDirDialog();
          if (chosen) {
            input.value = chosen;
            codexFlagValues[f.id] = chosen;
            checkbox.checked = true;
            saveCodexFlagState();
          }
        };
        input.oninput = input.onchange = () => {
          if (input.value) { codexFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete codexFlagValues[f.id]; checkbox.checked = false; }
          saveCodexFlagState();
        };
      } else {
        input.oninput = input.onchange = () => {
          if (input.value) { codexFlagValues[f.id] = input.value; checkbox.checked = true; }
          else { delete codexFlagValues[f.id]; checkbox.checked = false; }
          saveCodexFlagState();
        };
      }
    }
    listEl.appendChild(row);
  }
}

function buildCodexArgs() {
  const args = [];
  for (const f of CODEX_FLAGS) {
    const val = codexFlagValues[f.id];
    if (!val) continue;
    if (f.type === 'bool') {
      args.push(f.flag);
    } else {
      const str = String(val).trim();
      if (str) args.push(f.flag, str);
    }
  }
  return args;
}

function renderCodexSessions(sessions) {
  const container = document.getElementById('codex-sessions-list');
  if (!sessions.length) {
    container.innerHTML = `<div class="empty-sessions">
      No Codex sessions found.
      <button class="btn btn-ai btn-sm" id="btn-cx-resume-picker" style="margin-left:8px">Resume a session…</button>
    </div>`;
    document.getElementById('btn-cx-resume-picker').onclick = () => window.agents.codexLaunchTerminal('--resume-picker');
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
          ${s.model ? `<span class="text-muted">${esc(s.model)}</span>` : ''}
          <span class="text-muted">${formatDate(s.updated_at)}</span>
        </div>
      </div>
      <div class="session-card-actions">
        <button class="btn btn-ai btn-sm btn-resume" title="Resume in terminal">Resume</button>
      </div>`;
    card.querySelector('.btn-resume').onclick = () =>
      window.agents.codexLaunchTerminal(s.session_id);
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

document.addEventListener('DOMContentLoaded', () => {
  // Close flags dropdown when clicking outside
  document.addEventListener('click', () => {
    document.getElementById('cop-flags-dropdown')?.classList.add('hidden');
  });
  init();
});
