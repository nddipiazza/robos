'use strict';
/* RobOS Logs — renderer */

const APP_ICONS = {
  'task-planner':   '📋',
  'task-servers':   '🔗',
  'task-implementer': '⚙️',
  'issue-manager':  '🐛',
  'git-projects':   '🌿',
  'group-manager':  '👥',
  'work-journal':   '📓',
  'agents-manager': '🤖',
  'dev-central':    '🏠',
  'robos-logs':     '📋',
};

let state = {
  apps: [],
  entries: [],
  filtered: [],
  selectedApp: '__all__',
  selectedLevel: 'all',
  searchQuery: '',
  selectedEntry: null,
  autoRefresh: false,
  refreshTimer: null,
};

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  bindControls();
  await loadApps();
  await loadLogs();
}

async function loadApps() {
  const apps = await window.roboLogs.listApps();
  state.apps = ['__all__', ...apps];
  renderSidebar(apps);
}

async function loadLogs() {
  const opts = {};
  if (state.selectedApp !== '__all__') opts.appId = state.selectedApp;
  if (state.selectedLevel !== 'all')   opts.level  = state.selectedLevel;
  if (state.searchQuery)               opts.search = state.searchQuery;
  opts.limit = 1000;

  state.entries = await window.roboLogs.read(opts);
  applyFilter();
}

function applyFilter() {
  state.filtered = state.entries;
  renderTable(state.filtered);
  document.getElementById('entry-count').textContent = `${state.filtered.length} entries`;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar(apps) {
  const list = document.getElementById('app-list');
  list.innerHTML = `
    <li class="app-item${state.selectedApp === '__all__' ? ' active' : ''}" data-app="__all__">
      <span class="app-icon">🌐</span>
      <span class="app-name">All Apps</span>
    </li>
    ${apps.map(a => `
      <li class="app-item${state.selectedApp === a ? ' active' : ''}" data-app="${escHtml(a)}">
        <span class="app-icon">${APP_ICONS[a] || '📄'}</span>
        <span class="app-name">${escHtml(a)}</span>
      </li>
    `).join('')}
  `;
  list.querySelectorAll('.app-item').forEach(el => {
    el.addEventListener('click', async () => {
      state.selectedApp = el.dataset.app;
      list.querySelectorAll('.app-item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      await loadLogs();
    });
  });
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(entries) {
  const tbody = document.getElementById('log-tbody');
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No log entries found${state.searchQuery ? ' matching "' + escHtml(state.searchQuery) + '"' : ''}.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map((e, idx) => {
    const time  = e.ts ? new Date(e.ts).toLocaleTimeString() : '—';
    const level = (e.level || 'info').toLowerCase();
    const lvlCls = { info: 'lvl-info', warn: 'lvl-warn', error: 'lvl-error', debug: 'lvl-debug' }[level] || 'lvl-other';
    const rowCls = level === 'error' ? 'row-error' : level === 'warn' ? 'row-warn' : '';
    return `<tr class="${rowCls}" data-idx="${idx}" title="${escHtml(e.msg || '')}">
      <td class="col-time"><span class="col-time-val">${escHtml(time)}</span></td>
      <td class="col-app"><span class="col-app-val">${escHtml(e.app || '—')}</span></td>
      <td><span class="badge-level ${lvlCls}">${escHtml(level)}</span></td>
      <td class="event-cell">${escHtml(e.event || '—')}</td>
      <td class="msg-cell">${escHtml(e.msg || '')}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.idx, 10);
      showDetail(entries[idx]);
    });
  });
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function showDetail(entry) {
  state.selectedEntry = entry;
  const panel = document.getElementById('detail-panel');
  const title = document.getElementById('detail-title');
  const body  = document.getElementById('detail-body');
  panel.style.display = 'flex';
  title.textContent = `${entry.event || 'event'} · ${entry.app || ''} · ${entry.ts ? new Date(entry.ts).toLocaleString() : ''}`;
  body.textContent = JSON.stringify(entry, null, 2);
}

// ── Controls ──────────────────────────────────────────────────────────────────
function bindControls() {
  // Search
  const searchInput = document.getElementById('search-input');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.searchQuery = searchInput.value.trim();
      await loadLogs();
    }, 250);
  });

  // Level filters
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedLevel = btn.dataset.level;
      await loadLogs();
    });
  });

  // Refresh
  document.getElementById('btn-refresh').addEventListener('click', loadLogs);

  // Clear
  document.getElementById('btn-clear-app').addEventListener('click', async () => {
    if (state.selectedApp === '__all__') {
      alert('Select a specific app to clear its logs.');
      return;
    }
    if (!confirm(`Clear all logs for "${state.selectedApp}"?`)) return;
    await window.roboLogs.clear(state.selectedApp);
    await loadLogs();
  });

  // Auto-refresh toggle
  const autoRefreshChk = document.getElementById('auto-refresh');
  autoRefreshChk.addEventListener('change', () => {
    state.autoRefresh = autoRefreshChk.checked;
    if (state.autoRefresh) {
      state.refreshTimer = setInterval(loadLogs, 3000);
    } else {
      clearInterval(state.refreshTimer);
    }
  });

  // Detail close
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-panel').style.display = 'none';
    state.selectedEntry = null;
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

boot().catch(console.error);
