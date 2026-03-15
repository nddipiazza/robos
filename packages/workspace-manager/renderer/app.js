'use strict';

let allWorkspaces  = [];
let installedIDEs  = [];
let activeWs       = null;
let scanRoots      = [];

const TYPE_ICON = { vscode: '🔵', idea: '🟠' };
const TYPE_LABEL = { vscode: 'VS Code', idea: 'JetBrains' };

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const now = new Date();
  if (now - d < 7 * 86400000) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Scan ──────────────────────────────────────────────────────────────────────
async function scan() {
  const btn = document.getElementById('btn-scan');
  btn.textContent = '⏳ Scanning…';
  btn.disabled = true;
  document.getElementById('ws-list').innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div>Scanning…</div></div>';

  const [workspaces, ides] = await Promise.all([
    window.wm.scanWorkspaces({ roots: scanRoots }),
    window.wm.detectIDEs(),
  ]);

  allWorkspaces = workspaces;
  installedIDEs = ides;

  btn.textContent = '🔍 Scan';
  btn.disabled = false;

  renderList();
}

function getFiltered() {
  const q    = document.getElementById('search-input').value.trim().toLowerCase();
  const type = document.getElementById('filter-type').value;
  return allWorkspaces.filter(ws => {
    if (type && ws.type !== type) return false;
    if (q && !ws.name.toLowerCase().includes(q) && !ws.path.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderList() {
  const items = getFiltered();
  document.getElementById('ws-count').textContent = `${items.length} / ${allWorkspaces.length} workspaces`;
  const list = document.getElementById('ws-list');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🗂️</div><div>No workspaces found</div></div>';
    return;
  }
  list.innerHTML = items.map(ws => `
    <div class="ws-card${ws.path === activeWs?.path ? ' active' : ''}" data-path="${escHtml(ws.path)}">
      <div class="wc-header">
        <span class="wc-icon">${TYPE_ICON[ws.type] || '📁'}</span>
        <span class="wc-name">${escHtml(ws.name)}</span>
        <span class="wc-badge ${ws.type}">${escHtml(ws.ide)}</span>
      </div>
      <div class="wc-path">${escHtml(ws.path)}</div>
      <div class="wc-date">Modified ${fmtDate(ws.mtime)}</div>
    </div>
  `).join('');

  list.querySelectorAll('.ws-card').forEach(card => {
    card.addEventListener('click', () => {
      const ws = allWorkspaces.find(w => w.path === card.dataset.path);
      if (ws) openWorkspace(ws);
    });
  });
}

// ── Open workspace detail ─────────────────────────────────────────────────────
async function openWorkspace(ws) {
  activeWs = ws;
  renderList();

  const detail = document.getElementById('detail-panel');

  // Relevant IDEs for this workspace type
  const relevantIDEs = installedIDEs.filter(ide => {
    if (ws.type === 'vscode') return ide.id === 'code' || ide.id === 'cursor';
    if (ws.type === 'idea') return ['idea', 'webstorm', 'pycharm', 'goland', 'clion', 'rider'].includes(ide.id);
    return true;
  });

  const ideChips = installedIDEs.map(ide => `
    <button class="ide-chip${ide.installed ? ' installed' : ''}"
      ${ide.installed ? '' : 'disabled title="Not installed"'}
      onclick="openInIDE('${escHtml(ide.cmd)}', '${escHtml(ws.path)}')">
      ${ideIcon(ide.id)} ${escHtml(ide.label)}
      ${ide.installed ? ' ✓' : ''}
    </button>
  `).join('');

  detail.innerHTML = `
    <div class="detail-header">
      <div class="dh-icon">${TYPE_ICON[ws.type] || '📁'}</div>
      <div class="dh-info">
        <div class="dh-name">${escHtml(ws.name)}</div>
        <div class="dh-path">${escHtml(ws.path)}</div>
        <div class="dh-meta">
          <span class="dh-meta-item">🏷 ${escHtml(ws.ide)}</span>
          <span class="dh-meta-item">🕐 ${fmtDate(ws.mtime)}</span>
          <span class="dh-meta-item">⚙️ ${escHtml(ws.configDir.split('/').pop())}</span>
        </div>
      </div>
    </div>

    <div>
      <div class="section-label">Open With</div>
      <div class="action-row">
        <button class="action-btn primary" onclick="openInIDE('code', '${escHtml(ws.path)}')">
          🔵 VS Code
        </button>
        <button class="action-btn primary" onclick="openInIDE('cursor', '${escHtml(ws.path)}')">
          🖱 Cursor
        </button>
        <button class="action-btn" onclick="window.wm.openInFiles({ p: '${escHtml(ws.path)}' })">
          📁 File Manager
        </button>
        <button class="action-btn" onclick="window.wm.openTerminal({ p: '${escHtml(ws.path)}' })">
          💻 Terminal
        </button>
      </div>
    </div>

    <div>
      <div class="section-label">All Detected IDEs</div>
      <div class="ide-chips">${ideChips}</div>
    </div>

    <div id="settings-section"></div>
  `;

  // Load settings
  if (ws.type === 'vscode') {
    const r = await window.wm.readVscodeSettings({ configDir: ws.configDir });
    document.getElementById('settings-section').innerHTML = `
      <div class="settings-box">
        <div class="settings-box-header">📋 .vscode/settings.json</div>
        <pre>${escHtml(r.content)}</pre>
      </div>
    `;
  }
}

async function openInIDE(cmd, wsPath) {
  const r = await window.wm.openInIDE({ ideCmd: cmd, workspacePath: wsPath });
  if (!r.ok) alert('Could not open IDE: ' + (r.error || 'unknown error'));
}

function ideIcon(id) {
  const icons = { cursor:'🖱', code:'🔵', idea:'🟠', webstorm:'🟣', pycharm:'🐍', goland:'🐹', clion:'⚙️', rider:'🎯' };
  return icons[id] || '💻';
}

// ── Bindings ──────────────────────────────────────────────────────────────────
document.getElementById('btn-scan').addEventListener('click', scan);
document.getElementById('search-input').addEventListener('input', renderList);
document.getElementById('filter-type').addEventListener('change', renderList);

document.getElementById('btn-scan-opts').addEventListener('click', () => {
  document.getElementById('scan-opts-bar').classList.toggle('hidden');
});

document.getElementById('btn-apply-roots').addEventListener('click', () => {
  const raw = document.getElementById('scan-roots').value.trim();
  scanRoots = raw ? raw.split('\n').map(l => l.trim()).filter(Boolean) : [];
  scan();
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  const home = await window.wm.getHome();
  document.getElementById('scan-roots').value = [
    home,
    home + '/source',
    '/usr/local/share/robos',
  ].join('\n');
  scan();
})();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'workspace-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
