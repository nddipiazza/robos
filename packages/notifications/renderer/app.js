let _all = [];
let _filterSource = '';
let _filterRead   = '';

const ICONS = {
  info:    '🔔',
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  start:   '▶️',
};

function fmt(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60)  return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return ts; }
}

function renderList() {
  const list = document.getElementById('notif-list');
  const empty = document.getElementById('empty-state');
  const filtered = _all.filter(n => {
    if (_filterSource && n.source !== _filterSource) return false;
    if (_filterRead === 'unread' && n.read) return false;
    if (_filterRead === 'read'   && !n.read) return false;
    return true;
  });

  const unread = _all.filter(n => !n.read).length;
  document.getElementById('stat-unread').textContent = `${unread} unread`;
  document.getElementById('stat-total').textContent  = `${_all.length} total`;

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = filtered.map(n => {
    const icon = ICONS[n.icon] || '🔔';
    const readClass = n.read ? 'read' : 'unread';
    const iconClass = `icon-${n.icon || 'info'}`;
    const source = n.source || 'system';
    const job = n.jobName ? `<span class="notif-job">${esc(n.jobName)}</span>` : '';
    const markReadBtn = n.read ? '' : `<button class="notif-act-btn" onclick="markRead('${n.id}')">✓ Read</button>`;
    return `
      <div class="notif-card ${readClass} ${iconClass}" id="nc-${n.id}">
        <div class="notif-icon">${icon}</div>
        <div class="notif-body">
          <div class="notif-title">${esc(n.title)}</div>
          ${n.message ? `<div class="notif-msg">${esc(n.message)}</div>` : ''}
          <div class="notif-meta">
            <span class="notif-source-badge">${esc(source)}</span>
            ${job}
            <span>${fmt(n.timestamp)}</span>
          </div>
        </div>
        <div class="notif-actions">
          ${markReadBtn}
          <button class="notif-act-btn danger" onclick="deleteNotif('${n.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function load() {
  _all = await window.notifs.getNotifications();
  renderList();
}

async function markRead(id) {
  await window.notifs.markRead(id);
  const n = _all.find(x => x.id === id);
  if (n) n.read = true;
  renderList();
}

async function deleteNotif(id) {
  await window.notifs.deleteNotification(id);
  _all = _all.filter(x => x.id !== id);
  renderList();
}

// Controls
document.getElementById('btn-refresh').addEventListener('click', load);

document.getElementById('btn-mark-all-read').addEventListener('click', async () => {
  await window.notifs.markAllRead();
  _all.forEach(n => n.read = true);
  renderList();
});

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  if (!confirm('Delete all notifications?')) return;
  await window.notifs.clearAll();
  _all = [];
  renderList();
});

document.getElementById('filter-source').addEventListener('change', e => {
  _filterSource = e.target.value;
  renderList();
});

document.getElementById('filter-read').addEventListener('change', e => {
  _filterRead = e.target.value;
  renderList();
});

load();
// Auto-refresh every 10s
setInterval(load, 10000);


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'notifications');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
