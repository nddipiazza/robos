'use strict';

let cwd        = '';
let history    = [];
let histIdx    = -1;
let showHidden = true;
let sortBy     = 'name';
let sortDir    = 'asc';
let selected   = null;
let treeExpanded = {};

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes === 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 * 7) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileIcon(entry) {
  if (entry.isDir)  return '📁';
  if (entry.isLink) return '🔗';
  const ext = entry.name.split('.').pop().toLowerCase();
  const map = {
    js:'📜', ts:'📜', jsx:'📜', tsx:'📜',
    py:'🐍', rb:'💎', go:'🐹', rs:'🦀', java:'☕', c:'⚙️', cpp:'⚙️', h:'⚙️',
    json:'📋', yaml:'📋', yml:'📋', toml:'📋', xml:'📋', csv:'📊',
    md:'📝', txt:'📝', rst:'📝',
    sh:'🔧', bash:'🔧', zsh:'🔧',
    html:'🌐', css:'🎨', scss:'🎨',
    png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', svg:'🖼️', ico:'🖼️', webp:'🖼️',
    mp4:'🎬', mov:'🎬', avi:'🎬', mkv:'🎬',
    mp3:'🎵', wav:'🎵', ogg:'🎵',
    pdf:'📕', zip:'📦', tar:'📦', gz:'📦', bz2:'📦', xz:'📦',
    log:'📋', conf:'⚙️', cfg:'⚙️', env:'⚙️',
    git:'🔀', lock:'🔒',
  };
  return map[ext] || '📄';
}

// ── Navigate ──────────────────────────────────────────────────────────────────
async function navigate(p, pushHistory = true) {
  const result = await window.fe.readDir(p);
  if (result && result.error) {
    document.getElementById('status-count').textContent = '⚠ ' + result.error;
    return;
  }
  if (pushHistory) {
    history = history.slice(0, histIdx + 1);
    history.push(p);
    histIdx = history.length - 1;
  }
  cwd = p;
  document.getElementById('path-bar').value = p;
  document.getElementById('status-path').textContent = p;
  document.getElementById('btn-back').disabled    = histIdx <= 0;
  document.getElementById('btn-forward').disabled = histIdx >= history.length - 1;
  document.getElementById('btn-up').disabled      = p === '/';
  selected = null;
  renderFiles(result);
  updatePlacesActive();
}

// ── Render file list ──────────────────────────────────────────────────────────
function renderFiles(entries) {
  const list = document.getElementById('files-list');
  let items = entries.filter(e => showHidden || !e.hidden);

  // Sort
  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let av, bv;
    if (sortBy === 'name')  { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    else if (sortBy === 'size')  { av = a.size;  bv = b.size;  }
    else if (sortBy === 'mtime') { av = a.mtime; bv = b.mtime; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const count = items.length;
  const dirs  = items.filter(e => e.isDir).length;
  const files = count - dirs;
  document.getElementById('status-count').textContent =
    `${dirs} folder${dirs !== 1 ? 's' : ''}, ${files} file${files !== 1 ? 's' : ''}`;

  // Header
  function colHeader(label, key) {
    const active = sortBy === key;
    return `<span class="col-sort ${active ? sortDir : ''}" data-sort="${key}">${label}</span>`;
  }

  list.innerHTML = `
    <div class="files-header">
      <span></span>
      ${colHeader('Name', 'name')}
      ${colHeader('Size', 'size')}
      ${colHeader('Modified', 'mtime')}
    </div>
    ${items.length === 0 ? '<div class="empty-dir">Empty folder</div>' : ''}
    ${items.map(e => `
      <div class="file-row${e.hidden ? ' hidden-file' : ''}${selected === e.path ? ' selected' : ''}"
           data-path="${escHtml(e.path)}" data-isdir="${e.isDir}">
        <span class="file-icon">${fileIcon(e)}</span>
        <span class="file-name${e.isDir ? ' is-dir' : ''}${e.isLink ? ' is-link' : ''}">${escHtml(e.name)}</span>
        <span class="file-size">${e.isDir ? '—' : fmtSize(e.size)}</span>
        <span class="file-mtime">${fmtDate(e.mtime)}</span>
      </div>
    `).join('')}
  `;

  // Sort click
  list.querySelectorAll('.col-sort').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.sort;
      if (sortBy === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortBy = key; sortDir = 'asc'; }
      navigate(cwd, false);
    });
  });

  // Row click / dblclick
  list.querySelectorAll('.file-row').forEach(row => {
    const p     = row.dataset.path;
    const isDir = row.dataset.isdir === 'true';

    row.addEventListener('click', () => {
      selected = p;
      list.querySelectorAll('.file-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      if (!isDir) showPreview(p, row.querySelector('.file-name').textContent);
    });

    row.addEventListener('dblclick', () => {
      if (isDir) navigate(p);
      else window.fe.openFile(p);
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      selected = p;
      list.querySelectorAll('.file-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      window.fe.showContextMenu(p, isDir);
    });
  });
}

// ── Preview ───────────────────────────────────────────────────────────────────
async function showPreview(p, name) {
  const panel = document.getElementById('preview-panel');
  panel.classList.remove('hidden');
  document.getElementById('preview-name').textContent = name;

  const ext = name.split('.').pop().toLowerCase();
  const imageExts = ['png','jpg','jpeg','gif','svg','webp','ico'];
  const previewEl = document.getElementById('preview-content');
  const metaEl    = document.getElementById('preview-meta');

  metaEl.textContent = '';

  if (imageExts.includes(ext)) {
    previewEl.innerHTML = `<img src="file://${p}" style="max-width:100%;border-radius:4px;"/>`;
    return;
  }

  const r = await window.fe.getFileContent(p);
  if (r.error) {
    previewEl.textContent = r.error;
    return;
  }
  const lines = r.content.split('\n').length;
  metaEl.textContent = `${lines} lines · ${fmtSize(r.content.length)}`;
  previewEl.textContent = r.content.slice(0, 20000) + (r.content.length > 20000 ? '\n…(truncated)' : '');
}

// ── Sidebar places ────────────────────────────────────────────────────────────
async function buildSidebar() {
  const home = await window.fe.getHome();

  const sections = [
    {
      label: 'Places',
      items: [
        { icon: '🏠', label: 'Home',       path: home },
        { icon: '💻', label: 'Source Projects', path: home + '/source', special: true },
        { icon: '📥', label: 'Downloads',  path: home + '/Downloads' },
        { icon: '📄', label: 'Documents',  path: home + '/Documents' },
        { icon: '🖥️', label: 'Root (/)',   path: '/' },
      ],
    },
    {
      label: 'RobOS Config',
      items: [
        { icon: '⚙️', label: 'RobOS Config',        path: home + '/.config/robos' },
        { icon: '📅', label: 'Agent Scheduler',      path: home + '/.config/robos/agent-scheduler' },
        { icon: '🖥️', label: 'Desktops',             path: home + '/.config/robos/desktops' },
        { icon: '🔬', label: 'Tech Workbench',       path: home + '/.config/robos/tech-workbench' },
        { icon: '🔧', label: 'Workflow Drafts',      path: home + '/.config/robos/workflow-studio-drafts' },
        { icon: '🗒️', label: 'Journal Events',       path: home + '/.config/robos' },
        { icon: '🔔', label: 'Notifications',        path: home + '/.config/robos' },
      ],
    },
    {
      label: 'RobOS Apps',
      items: [
        { icon: '🤖', label: 'Agent Panel',          path: '/usr/local/share/robos/agent_panel.py',      isFile: true },
        { icon: '🗓️', label: 'Agent Scheduler',      path: '/usr/local/share/robos/agent-scheduler' },
        { icon: '🧩', label: 'Agents Manager',       path: '/usr/local/share/robos/agents-manager' },
        { icon: '🚀', label: 'App Launcher',         path: '/usr/local/share/robos/app-launcher' },
        { icon: '🧠', label: 'Context Manager',      path: '/usr/local/share/robos/context-manager' },
        { icon: '📁', label: 'File Explorer',        path: '/usr/local/share/robos/file-explorer' },
        { icon: '🗂️', label: 'Git Projects',         path: '/usr/local/share/robos/git-projects' },
        { icon: '🐛', label: 'Issue Manager',        path: '/usr/local/share/robos/issue-manager' },
        { icon: '🔔', label: 'Notifications',        path: '/usr/local/share/robos/notifications' },
        { icon: '📦', label: 'RobOS CLI',            path: '/usr/local/share/robos/robos-cli' },
        { icon: '🎨', label: 'RobOS UI Lib',         path: '/usr/local/share/robos/robos-ui' },
        { icon: '✅', label: 'Task Planner',         path: '/usr/local/share/robos/task-planner' },
        { icon: '🔬', label: 'Tech Workbench',       path: '/usr/local/share/robos/tech-workbench' },
        { icon: '📓', label: 'Work Journal',         path: '/usr/local/share/robos/work-journal' },
        { icon: '🔧', label: 'Workflow Studio',      path: '/usr/local/share/robos/issue-manager' },
      ],
    },
  ];

  const list = document.getElementById('places-list');
  list.innerHTML = sections.map(sec => `
    <div class="places-section">
      <div class="places-section-hdr">${sec.label}</div>
      ${sec.items.map(pl => `
        <div class="place-item${pl.special ? ' place-special' : ''}" data-path="${escHtml(pl.path)}">
          <span class="place-icon">${pl.icon}</span>
          <span>${pl.label}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  list.querySelectorAll('.place-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.path));
  });

  // Tree: Home subdirs
  await buildTree(home);
  navigate(home);
}

async function buildTree(rootPath) {
  const treeEl = document.getElementById('tree-root');
  const children = await window.fe.readTreeChildren(rootPath);
  treeEl.innerHTML = '';
  for (const child of children.slice(0, 20)) {
    treeEl.appendChild(makeTreeNode(child.path, child.name, 0));
  }
}

function makeTreeNode(p, name, depth) {
  const node = document.createElement('div');
  node.className = 'tree-node';
  node.dataset.path = p;

  const label = document.createElement('div');
  label.className = 'tree-node-label';
  label.style.paddingLeft = (8 + depth * 14) + 'px';
  label.innerHTML = `<span class="tree-arrow">▶</span> <span>📁 ${escHtml(name)}</span>`;
  node.appendChild(label);

  const childrenEl = document.createElement('div');
  childrenEl.className = 'tree-children';
  childrenEl.style.display = 'none';
  node.appendChild(childrenEl);

  label.addEventListener('click', async (e) => {
    e.stopPropagation();
    navigate(p);
    const arrow = label.querySelector('.tree-arrow');
    if (childrenEl.style.display === 'none') {
      arrow.classList.add('open');
      childrenEl.style.display = 'block';
      if (!childrenEl.children.length) {
        const kids = await window.fe.readTreeChildren(p);
        for (const k of kids.slice(0, 30)) {
          childrenEl.appendChild(makeTreeNode(k.path, k.name, depth + 1));
        }
      }
    } else {
      arrow.classList.remove('open');
      childrenEl.style.display = 'none';
    }
  });

  return node;
}

function updatePlacesActive() {
  document.querySelectorAll('.place-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === cwd);
  });
  document.querySelectorAll('.tree-node-label').forEach(el => {
    const p = el.closest('.tree-node')?.dataset.path;
    el.classList.toggle('active', p === cwd);
  });
}

// ── Context menu actions ──────────────────────────────────────────────────────
function bindContextActions() {
  window.fe.onCtxAction(async ({ action, path: p }) => {
    if (action === 'open') {
      const isDir = (await window.fe.readDir(p)) && !Array.isArray(await window.fe.readDir(p));
      // just navigate or open
      window.fe.openFile(p);
    }
    if (action === 'terminal')  window.fe.openTerminalHere(p);
    if (action === 'editor')    window.fe.openInEditor(p);
    if (action === 'copy-path') window.fe.copyPath(p);
    if (action === 'delete') {
      if (confirm(`Delete "${p}"? This cannot be undone.`)) {
        await window.fe.deleteItem(p);
        navigate(cwd, false);
      }
    }
    if (action === 'rename') startRename(p);
  });
}

function startRename(p) {
  const row = document.querySelector(`.file-row[data-path="${CSS.escape(p)}"]`);
  if (!row) return;
  const nameEl = row.querySelector('.file-name');
  const rect   = nameEl.getBoundingClientRect();
  const input  = document.getElementById('rename-input');
  input.style.left   = rect.left + 'px';
  input.style.top    = rect.top + 'px';
  input.style.width  = Math.max(rect.width, 200) + 'px';
  input.value        = nameEl.textContent;
  input.classList.remove('hidden');
  input.focus();
  input.select();

  const finish = async () => {
    input.classList.add('hidden');
    const newName = input.value.trim();
    const oldName = p.split('/').pop();
    if (newName && newName !== oldName) {
      const dir    = p.substring(0, p.lastIndexOf('/'));
      const newPath = dir + '/' + newName;
      await window.fe.renameItem(p, newPath);
      navigate(cwd, false);
    }
  };
  input.onblur  = finish;
  input.onkeydown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { input.classList.add('hidden'); }
  };
}

// ── Toolbar bindings ──────────────────────────────────────────────────────────
function bindToolbar() {
  document.getElementById('btn-back').addEventListener('click', () => {
    if (histIdx > 0) { histIdx--; navigate(history[histIdx], false); }
  });
  document.getElementById('btn-forward').addEventListener('click', () => {
    if (histIdx < history.length - 1) { histIdx++; navigate(history[histIdx], false); }
  });
  document.getElementById('btn-up').addEventListener('click', () => {
    const parent = cwd.includes('/') ? cwd.substring(0, cwd.lastIndexOf('/')) || '/' : '/';
    navigate(parent);
  });
  document.getElementById('btn-home').addEventListener('click', async () => {
    navigate(await window.fe.getHome());
  });
  document.getElementById('btn-refresh').addEventListener('click', () => navigate(cwd, false));
  document.getElementById('btn-showhide').addEventListener('click', () => {
    showHidden = !showHidden;
    document.getElementById('btn-showhide').style.opacity = showHidden ? '1' : '0.5';
    navigate(cwd, false);
  });
  document.getElementById('btn-newdir').addEventListener('click', async () => {
    const name = prompt('New folder name:');
    if (!name) return;
    await window.fe.mkdir(cwd + '/' + name);
    navigate(cwd, false);
  });

  const btnCopyPath = document.getElementById('btn-copy-path');
  btnCopyPath.addEventListener('click', () => {
    window.fe.copyPath(cwd);
    btnCopyPath.textContent = '✅';
    btnCopyPath.classList.add('copied');
    setTimeout(() => {
      btnCopyPath.textContent = '📋';
      btnCopyPath.classList.remove('copied');
    }, 1500);
  });

  const pathBar = document.getElementById('path-bar');
  pathBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(pathBar.value.trim());
    if (e.key === 'Escape') pathBar.value = cwd;
  });

  document.getElementById('btn-close-preview').addEventListener('click', () => {
    document.getElementById('preview-panel').classList.add('hidden');
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
      if (histIdx > 0) { histIdx--; navigate(history[histIdx], false); }
    }
    if (e.key === 'F5') navigate(cwd, false);
    if (e.key === 'Delete' && selected) {
      if (confirm(`Delete "${selected}"?`)) {
        window.fe.deleteItem(selected).then(() => navigate(cwd, false));
      }
    }
    if (e.key === 'F2' && selected) startRename(selected);
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      document.getElementById('path-bar').focus();
      document.getElementById('path-bar').select();
    }
  });
}

// ── Escape HTML ───────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
bindToolbar();
document.getElementById('btn-showhide').style.opacity = showHidden ? '1' : '0.5';
bindKeyboard();
bindContextActions();
buildSidebar();

// Listen for external navigation (e.g., from git-projects "open in explorer")
window.fe.onNavigateTo(p => { navigate(p); });
