'use strict';

let _all = [];
let _selectedCategories = new Set(['pr_review', 'ci_cd', 'task', 'agent', 'system']);
let _selectedTiers = new Set(['critical', 'warning', 'info']);
let _filterDate = '';
let _searchQuery = '';

const CATEGORY_ICONS = {
  pr_review: '🔍',
  ci_cd:     '⚙️',
  task:      '📋',
  agent:     '🤖',
  system:    '🔔',
};

const TIER_COLORS = {
  critical: '#f85149',
  warning:  '#d29922',
  info:     '#00bcd4',
};

function fmt(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60)  return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function matchesDateFilter(ts) {
  if (!_filterDate) return true;
  const d = new Date(ts);
  const now = new Date();
  if (_filterDate === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (_filterDate === '7d') {
    return (now - d) < 7 * 86400000;
  }
  if (_filterDate === '30d') {
    return (now - d) < 30 * 86400000;
  }
  return true;
}

function renderList() {
  const list = document.getElementById('notif-list');
  const empty = document.getElementById('empty-state');
  const q = _searchQuery.toLowerCase();

  const filtered = _all.filter(n => {
    const cat = n.category || 'system';
    const tier = n.tier || 'info';
    if (!_selectedCategories.has(cat)) return false;
    if (!_selectedTiers.has(tier)) return false;
    if (!matchesDateFilter(n.ts || n.timestamp)) return false;
    if (q && !(n.title || '').toLowerCase().includes(q) && !(n.body || n.message || '').toLowerCase().includes(q)) return false;
    return true;
  });

  // Update badge counts
  const unreadByCategory = {};
  _all.forEach(n => {
    if (!n.read) {
      const cat = n.category || 'system';
      unreadByCategory[cat] = (unreadByCategory[cat] || 0) + 1;
    }
  });
  ['pr_review', 'ci_cd', 'task', 'agent', 'system'].forEach(cat => {
    const el = document.getElementById('badge-' + cat);
    if (el) el.textContent = unreadByCategory[cat] || 0;
  });

  const unread = _all.filter(n => !n.read).length;
  document.getElementById('stat-unread').textContent = unread + ' unread';
  document.getElementById('stat-total').textContent  = _all.length + ' total';

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = filtered.map(n => {
    const cat = n.category || 'system';
    const tier = n.tier || 'info';
    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.system;
    const readClass = n.read ? 'read' : 'unread';
    const tierColor = TIER_COLORS[tier] || TIER_COLORS.info;
    const source = n.source || 'system';
    const markReadBtn = n.read ? '' : '<button class="notif-act-btn btn-mark-read" onclick="markRead(\'' + n.id + '\')">Mark Read</button>';
    return '<div class="notif-card ' + readClass + '" style="border-left-color: ' + tierColor + '" id="nc-' + n.id + '">' +
      '<div class="notif-icon">' + icon + '</div>' +
      '<div class="notif-body">' +
        '<div class="notif-meta-top">' +
          '<span class="notif-cat-badge">' + esc(cat.replace('_', ' ')) + '</span>' +
          '<span class="notif-tier-badge tier-' + tier + '">' + tier + '</span>' +
        '</div>' +
        '<div class="notif-title">' + esc(n.title) + '</div>' +
        (n.body || n.message ? '<div class="notif-msg">' + esc(n.body || n.message) + '</div>' : '') +
        '<div class="notif-meta">' +
          '<span class="notif-source-badge">' + esc(source) + '</span>' +
          '<span>' + fmt(n.ts || n.timestamp) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="notif-actions">' +
        markReadBtn +
        '<button class="notif-act-btn danger btn-delete-notif" onclick="deleteNotif(\'' + n.id + '\')">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function load() {
  _all = await window.notifs.getNotifications();
  renderList();
}

window.markRead = async function(id) {
  await window.notifs.markRead(id);
  const n = _all.find(x => x.id === id);
  if (n) n.read = true;
  renderList();
};

window.deleteNotif = async function(id) {
  await window.notifs.deleteNotification(id);
  _all = _all.filter(x => x.id !== id);
  renderList();
};

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Category filters
document.querySelectorAll('#category-filters input').forEach(cb => {
  cb.addEventListener('change', () => {
    if (cb.checked) _selectedCategories.add(cb.dataset.cat);
    else _selectedCategories.delete(cb.dataset.cat);
    renderList();
  });
});

// Tier filters
document.querySelectorAll('#tier-filters input').forEach(cb => {
  cb.addEventListener('change', () => {
    if (cb.checked) _selectedTiers.add(cb.dataset.tier);
    else _selectedTiers.delete(cb.dataset.tier);
    renderList();
  });
});

// Date filter
document.getElementById('filter-date').addEventListener('change', e => {
  _filterDate = e.target.value;
  renderList();
});

// Search & Filter programmatic helpers
window.setSearch = function(val) {
  _searchQuery = (val || '').trim();
  const el = document.getElementById('search-input');
  if (el) el.value = val || '';
  renderList();
};

window.setCategoryFilter = function(cat, checked) {
  if (checked) _selectedCategories.add(cat);
  else _selectedCategories.delete(cat);
  const el = document.getElementById('filter-' + cat);
  if (el) el.checked = !!checked;
  renderList();
};

window.setTierFilter = function(tier, checked) {
  if (checked) _selectedTiers.add(tier);
  else _selectedTiers.delete(tier);
  const el = document.getElementById('filter-tier-' + tier);
  if (el) el.checked = !!checked;
  renderList();
};

// Search event listeners
['input', 'change'].forEach(evt => {
  document.getElementById('search-input').addEventListener(evt, function(e) {
    _searchQuery = (this.value || (e.target && e.target.value) || '').trim();
    renderList();
  });
});

// Bulk actions
document.getElementById('btn-mark-all-read').addEventListener('click', async () => {
  await window.notifs.markAllRead();
  _all.forEach(n => n.read = true);
  renderList();
});

document.getElementById('btn-clear-read').addEventListener('click', async () => {
  await window.notifs.clearRead();
  _all = _all.filter(n => !n.read);
  renderList();
});

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  await window.notifs.clearAll();
  _all = [];
  renderList();
});

// Preferences
async function loadPrefs() {
  const prefs = await window.notifs.getPrefs();
  document.getElementById('pref-quiet-enabled').checked = prefs.quietHours?.enabled || false;
  document.getElementById('pref-quiet-start').value = prefs.quietHours?.start || '22:00';
  document.getElementById('pref-quiet-end').value = prefs.quietHours?.end || '07:00';
  document.getElementById('pref-dnd').checked = prefs.dnd || false;
}

document.getElementById('btn-save-prefs').addEventListener('click', async () => {
  const prefs = {
    categoryOverrides: {},
    quietHours: {
      enabled: document.getElementById('pref-quiet-enabled').checked,
      start: document.getElementById('pref-quiet-start').value,
      end: document.getElementById('pref-quiet-end').value,
    },
    dnd: document.getElementById('pref-dnd').checked,
  };
  await window.notifs.savePrefs(prefs);
  const msg = document.getElementById('pref-status-msg');
  if (msg) {
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
  }
});

load();
loadPrefs();
setInterval(load, 5000);
