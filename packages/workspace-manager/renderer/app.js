'use strict';

let allWorkspaces  = [];
let installedIDEs  = [];
let activeWs       = null;
let scanRoots      = [];

const TYPE_LABEL = { vscode: 'VS Code', idea: 'JetBrains' };

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtDate(ms) {
  if (!ms) return '--';
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
  btn.textContent = 'Scanning...';
  btn.disabled = true;
  document.getElementById('ws-list').innerHTML = '<div class="empty-state"><div class="empty-icon">...</div><div>Scanning...</div></div>';

  const [workspaces, ides] = await Promise.all([
    window.api.scanWorkspaces({ roots: scanRoots }),
    window.api.detectIDEs(),
  ]);

  allWorkspaces = workspaces;
  installedIDEs = ides;

  btn.textContent = 'Scan';
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
  document.getElementById('ws-count').textContent = items.length + ' / ' + allWorkspaces.length + ' workspaces';
  const list = document.getElementById('ws-list');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">No results</div><div>No workspaces found</div></div>';
    return;
  }
  list.innerHTML = items.map(ws => {
    const typeIcon = ws.type === 'idea' ? 'JB' : 'VS';
    return '<div class="ws-card' + (ws.path === (activeWs && activeWs.path) ? ' active' : '') + '" data-path="' + escHtml(ws.path) + '">' +
      '<div class="wc-header">' +
        '<span class="wc-icon">[' + typeIcon + ']</span>' +
        '<span class="wc-name">' + escHtml(ws.name) + '</span>' +
        '<span class="wc-badge ' + ws.type + '">' + escHtml(ws.ide) + '</span>' +
      '</div>' +
      '<div class="wc-path">' + escHtml(ws.path) + '</div>' +
      '<div class="wc-date">Modified ' + fmtDate(ws.mtime) + '</div>' +
    '</div>';
  }).join('');

  list.querySelectorAll('.ws-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var ws = allWorkspaces.find(function(w) { return w.path === card.dataset.path; });
      if (ws) openWorkspace(ws);
    });
  });
}

// ── Open workspace detail ─────────────────────────────────────────────────────
async function openWorkspace(ws) {
  activeWs = ws;
  renderList();

  const detail = document.getElementById('detail-panel');
  const typeIcon = ws.type === 'idea' ? '[JB]' : '[VS]';

  const ideChips = installedIDEs.map(function(ide) {
    return '<button class="ide-chip' + (ide.installed ? ' installed' : '') + '"' +
      (ide.installed ? '' : ' disabled title="Not installed"') +
      ' data-ide-cmd="' + escHtml(ide.cmd) + '" data-ws-path="' + escHtml(ws.path) + '">' +
      escHtml(ide.label) +
      (ide.installed ? ' [ok]' : '') +
    '</button>';
  }).join('');

  detail.innerHTML =
    '<div class="detail-header">' +
      '<div class="dh-icon">' + typeIcon + '</div>' +
      '<div class="dh-info">' +
        '<div class="dh-name">' + escHtml(ws.name) + '</div>' +
        '<div class="dh-path">' + escHtml(ws.path) + '</div>' +
        '<div class="dh-meta">' +
          '<span class="dh-meta-item">Type: ' + escHtml(ws.ide) + '</span>' +
          '<span class="dh-meta-item">Modified: ' + fmtDate(ws.mtime) + '</span>' +
          '<span class="dh-meta-item">Config: ' + escHtml(ws.configDir.split('/').pop()) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div>' +
      '<div class="section-label">Open With</div>' +
      '<div class="action-row">' +
        '<button class="action-btn primary" data-action="open-ide" data-cmd="code" data-path="' + escHtml(ws.path) + '">VS Code</button>' +
        '<button class="action-btn primary" data-action="open-ide" data-cmd="cursor" data-path="' + escHtml(ws.path) + '">Cursor</button>' +
        '<button class="action-btn" data-action="open-files" data-path="' + escHtml(ws.path) + '">File Manager</button>' +
        '<button class="action-btn" data-action="open-terminal" data-path="' + escHtml(ws.path) + '">Terminal</button>' +
      '</div>' +
    '</div>' +

    '<div>' +
      '<div class="section-label">All Detected IDEs</div>' +
      '<div class="ide-chips">' + ideChips + '</div>' +
    '</div>' +

    '<div id="git-section"></div>' +
    '<div id="settings-section"></div>';

  // Attach action button handlers
  detail.querySelectorAll('[data-action="open-ide"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      openInIDE(btn.dataset.cmd, btn.dataset.path);
    });
  });
  detail.querySelectorAll('[data-action="open-files"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      window.api.openInFiles({ p: btn.dataset.path });
    });
  });
  detail.querySelectorAll('[data-action="open-terminal"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      window.api.openTerminal({ p: btn.dataset.path });
    });
  });
  detail.querySelectorAll('.ide-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      if (!chip.disabled) openInIDE(chip.dataset.ideCmd, chip.dataset.wsPath);
    });
  });

  // Load git info
  try {
    var gitInfo = await window.api.getGitInfo({ wsPath: ws.path });
    var gitSection = document.getElementById('git-section');
    if (gitInfo && gitInfo.isGit) {
      var changesClass = gitInfo.changedFiles > 0 ? 'changes' : 'clean';
      var changesText = gitInfo.changedFiles > 0 ? gitInfo.changedFiles + ' changed files' : 'Clean';
      gitSection.innerHTML =
        '<div class="section-label">Git Info</div>' +
        '<div class="git-info">' +
          '<div class="git-info-row"><span class="git-label">Branch:</span><span class="git-value branch">' + escHtml(gitInfo.branch) + '</span></div>' +
          '<div class="git-info-row"><span class="git-label">Remote:</span><span class="git-value">' + escHtml(gitInfo.remote || 'none') + '</span></div>' +
          '<div class="git-info-row"><span class="git-label">Status:</span><span class="git-value ' + changesClass + '">' + changesText + '</span></div>' +
        '</div>';
    }
  } catch (e) {}

  // Load settings preview
  if (ws.type === 'vscode') {
    try {
      var r = await window.api.readVscodeSettings({ configDir: ws.configDir });
      document.getElementById('settings-section').innerHTML =
        '<div class="settings-box">' +
          '<div class="settings-box-header">.vscode/settings.json</div>' +
          '<pre>' + escHtml(r.content) + '</pre>' +
        '</div>';
    } catch (e) {}
  }
}

async function openInIDE(cmd, wsPath) {
  var r = await window.api.openInIDE({ ideCmd: cmd, workspacePath: wsPath });
  if (!r.ok) {
    // Show error inline rather than alert
    console.error('Could not open IDE:', r.error);
  }
}

// ── Bindings ──────────────────────────────────────────────────────────────────
document.getElementById('btn-scan').addEventListener('click', scan);
document.getElementById('search-input').addEventListener('input', renderList);
document.getElementById('filter-type').addEventListener('change', renderList);

document.getElementById('btn-scan-opts').addEventListener('click', function() {
  document.getElementById('scan-opts-bar').classList.toggle('hidden');
});

document.getElementById('btn-apply-roots').addEventListener('click', function() {
  var raw = document.getElementById('scan-roots').value.trim();
  scanRoots = raw ? raw.split('\n').map(function(l) { return l.trim(); }).filter(Boolean) : [];
  // Save config
  window.api.saveWorkspaceConfig({ scan_roots: scanRoots, max_depth: 6 });
  scan();
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async function() {
  var home = await window.api.getHome();
  var config = await window.api.loadWorkspaceConfig();
  if (config && config.scan_roots && config.scan_roots.length) {
    scanRoots = config.scan_roots;
    document.getElementById('scan-roots').value = scanRoots.join('\n');
  } else {
    document.getElementById('scan-roots').value = [
      home,
      home + '/source',
      '/usr/local/share/robos',
    ].join('\n');
  }
  scan();
})();
