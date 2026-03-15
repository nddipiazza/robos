/* global journal */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let currentEntry     = null; // { date, file, content }
let previewMode      = false;
let activeTab        = 'editor'; // 'editor' | 'activity'
let activityDate     = null;     // date string for currently shown activity
let activityInterval = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const viewSetup     = document.getElementById('view-setup');
const viewMain      = document.getElementById('view-main');
const repoBadge     = document.getElementById('repo-badge');
const entryList     = document.getElementById('entry-list');
const editorArea    = document.getElementById('editor-area');
const previewArea   = document.getElementById('preview-area');
const editorDate    = document.getElementById('editor-date');
const saveStatus    = document.getElementById('save-status');
const setupStatus   = document.getElementById('setup-status');
const panelEditor   = document.getElementById('panel-editor');
const panelActivity = document.getElementById('panel-activity');
const tabEditor     = document.getElementById('tab-editor');
const tabActivity   = document.getElementById('tab-activity');
const activityFeed  = document.getElementById('activity-feed');
const activityStats = document.getElementById('activity-stats');
const activityDateLabel = document.getElementById('activity-date-label');

function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderMd(md) {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre class="md-pre"><code>${esc(c)}</code></pre>`)
    .replace(/`([^`\n]+)`/g, (_, c) => `<code>${esc(c)}</code>`)
    .replace(/^#{3} (.+)$/gm, (_, t) => `<h3>${esc(t)}</h3>`)
    .replace(/^#{2} (.+)$/gm, (_, t) => `<h2>${esc(t)}</h2>`)
    .replace(/^# (.+)$/gm,    (_, t) => `<h1>${esc(t)}</h1>`)
    .replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong>${esc(t)}</strong>`)
    .replace(/\*(.+?)\*/g,    (_, t) => `<em>${esc(t)}</em>`)
    .replace(/^- (.+)$/gm,    (_, t) => `<li>${esc(t)}</li>`)
    .replace(/(<li>[\s\S]+?<\/li>)/g, b => `<ul>${b}</ul>`)
    .replace(/^---$/gm, '<hr/>')
    .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');
}

// ── Source metadata ───────────────────────────────────────────────────────────
const SOURCE_META = {
  'agent-scheduler':  { color: '#a371f7', icon: '⏰', label: 'Agent Scheduler' },
  'workflow-studio':  { color: '#58a6ff', icon: '🔧', label: 'Workflow Studio' },
  'task-planner':     { color: '#3fb950', icon: '📋', label: 'Task Planner' },
  'context-manager':  { color: '#f0883e', icon: '🗺', label: 'Context Manager' },
  'agents-manager':   { color: '#76e3ea', icon: '🤖', label: 'Agents Manager' },
  'work-journal':     { color: '#e3b341', icon: '📓', label: 'Work Journal' },
};

const STATUS_BADGE = {
  started:   { bg: '#1f2937', text: '#9ca3af', label: '▶ started' },
  completed: { bg: '#052e16', text: '#4ade80', label: '✓ done' },
  failed:    { bg: '#450a0a', text: '#f87171', label: '✗ failed' },
};

function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// ── Activity Feed ─────────────────────────────────────────────────────────────
async function loadActivityFeed(date) {
  activityDate = date || new Date().toISOString().slice(0, 10);
  activityDateLabel.textContent = activityDate;

  const r = await journal.journalReadEvents({ date: activityDate });
  const events = r.events || [];

  // Stats bar
  const bySource = {};
  events.forEach(e => { bySource[e.source] = (bySource[e.source] || 0) + 1; });
  const total = events.length;
  const statsHtml = total === 0
    ? '<span class="stat-empty">No AI activity recorded for this date</span>'
    : `<span class="stat-total">${total} event${total !== 1 ? 's' : ''}</span>` +
      Object.entries(bySource).map(([src, n]) => {
        const m = SOURCE_META[src] || { color: '#888', icon: '•', label: src };
        return `<span class="stat-chip" style="border-color:${m.color};color:${m.color}">${m.icon} ${m.label} <strong>${n}</strong></span>`;
      }).join('');
  activityStats.innerHTML = statsHtml;

  // Event timeline
  if (events.length === 0) {
    activityFeed.innerHTML = '<div class="activity-empty">No AI events on this date.<br>Events are logged automatically when you use AI features in any RobOS app.</div>';
    return;
  }

  activityFeed.innerHTML = events.map((e, i) => {
    const m = SOURCE_META[e.source] || { color: '#888', icon: '•', label: e.source || 'unknown' };
    const sb = STATUS_BADGE[e.status] || STATUS_BADGE.completed;
    const hasDetail = !!e.detail;
    return `<div class="activity-event${hasDetail ? ' ae-expandable' : ''}" data-idx="${i}">
      <div class="ae-dot" style="background:${m.color}"></div>
      <div class="ae-body">
        <div class="ae-header">
          <span class="ae-source" style="color:${m.color}">${m.icon} ${m.label}</span>
          <span class="ae-badge" style="background:${sb.bg};color:${sb.text}">${sb.label}</span>
          <span class="ae-time">${fmtTime(e.timestamp)}</span>
          ${hasDetail ? '<span class="ae-expand-icon">▸</span>' : ''}
        </div>
        <div class="ae-title">${esc(e.title || '')}</div>
        ${hasDetail ? `<div class="ae-detail">${esc(e.detail)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  activityFeed.querySelectorAll('.ae-expandable').forEach((el, i) => {
    el.addEventListener('click', () => {
      const e = events[parseInt(el.dataset.idx, 10)];
      if (!e) return;
      document.getElementById('ae-modal-title').textContent = e.title || '';
      document.getElementById('ae-modal-body').textContent  = e.detail || '';
      document.getElementById('ae-modal').classList.remove('hidden');
    });
  });

  const closeModal = () => document.getElementById('ae-modal').classList.add('hidden');
  document.getElementById('ae-modal-close').onclick = closeModal;
  document.querySelector('.ae-modal-backdrop').onclick = closeModal;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  tabEditor.classList.toggle('active', tab === 'editor');
  tabActivity.classList.toggle('active', tab === 'activity');
  panelEditor.classList.toggle('hidden', tab !== 'editor');
  panelActivity.classList.toggle('hidden', tab !== 'activity');
  if (tab === 'activity') loadActivityFeed(currentEntry ? currentEntry.date : null);
}

tabEditor.onclick   = () => switchTab('editor');
tabActivity.onclick = () => switchTab('activity');
document.getElementById('btn-refresh-activity').onclick = () => loadActivityFeed(activityDate);

// Auto-refresh activity feed every 30s when visible
setInterval(() => { if (activeTab === 'activity') loadActivityFeed(activityDate); }, 30000);

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  const status = await journal.journalStatus();
  if (!status.configured || !status.cloned) {
    showSetup(status);
  } else {
    showMain(status);
  }
})();

function showSetup(status) {
  viewSetup.classList.remove('hidden');
  viewMain.classList.add('hidden');
  if (status && status.repo) document.getElementById('setup-repo').value = status.repo;
}

async function showMain(status) {
  viewSetup.classList.add('hidden');
  viewMain.classList.remove('hidden');
  if (status.repo) {
    const short = status.repo.replace('https://github.com/', '').replace('git@github.com:', '');
    repoBadge.textContent = '📁 ' + short;
    repoBadge.classList.remove('hidden');
  }
  await loadEntries();
  await loadToday();
}

async function loadEntries() {
  const r = await journal.journalListEntries();
  entryList.innerHTML = '';
  (r.entries || []).forEach(e => {
    const el = document.createElement('div');
    el.className = 'entry-item' + (currentEntry && currentEntry.date === e.date ? ' active' : '');
    el.textContent = e.date;
    el.onclick = () => loadEntry(e);
    entryList.appendChild(el);
  });
}

async function loadToday() {
  const r = await journal.journalReadToday();
  if (!r.ok) { showStatus('⚠ ' + r.error, 'red'); return; }
  currentEntry = r;
  editorDate.textContent = r.date;
  editorArea.value = r.content;
  highlightActive(r.date);
  activatePreview(true);
  if (activeTab === 'activity') loadActivityFeed(r.date);
}

async function loadEntry(e) {
  const r = await journal.journalReadEntry({ file: e.file });
  if (!r.ok) return;
  currentEntry = { ...e, content: r.content };
  editorDate.textContent = e.date;
  editorArea.value = r.content;
  highlightActive(e.date);
  activatePreview(true);
  if (activeTab === 'activity') loadActivityFeed(e.date);
}

function activatePreview(on) {
  previewMode = on;
  if (on) {
    previewArea.innerHTML = '<p>' + renderMd(editorArea.value) + '</p>';
    editorArea.classList.add('hidden');
    previewArea.classList.remove('hidden');
    document.getElementById('btn-toggle-view').textContent = '✏ Edit';
  } else {
    editorArea.classList.remove('hidden');
    previewArea.classList.add('hidden');
    document.getElementById('btn-toggle-view').textContent = '👁 Preview';
  }
}

function highlightActive(date) {
  document.querySelectorAll('.entry-item').forEach(el => {
    el.classList.toggle('active', el.textContent === date);
  });
}

function showStatus(msg, color = 'green') {
  saveStatus.textContent = msg;
  saveStatus.style.color = color === 'red' ? 'var(--red)' : 'var(--green)';
  setTimeout(() => (saveStatus.textContent = ''), 3000);
}

// ── Buttons ───────────────────────────────────────────────────────────────────
document.getElementById('btn-new-entry').onclick = loadToday;

document.getElementById('btn-open-folder').onclick = () => {
  const filePath = currentEntry && currentEntry.file;
  if (filePath) journal.openFilePath(filePath);
};

document.getElementById('btn-save-entry').onclick = async () => {
  const content = editorArea.value;
  const r = await journal.journalWriteToday({ content });
  showStatus(r.ok ? '✓ Saved & pushed' : '✗ ' + r.error, r.ok ? 'green' : 'red');
};

document.getElementById('btn-push').onclick = async () => {
  showStatus('⏳ Pushing…', 'green');
  const r = await journal.journalWriteToday({ content: editorArea.value });
  showStatus(r.ok ? '✓ Pushed' : '✗ ' + r.error, r.ok ? 'green' : 'red');
};

document.getElementById('btn-toggle-view').onclick = () => activatePreview(!previewMode);

// ── Settings modal ────────────────────────────────────────────────────────────
document.getElementById('btn-settings').onclick = async () => {
  const s = await journal.readSettings();
  document.getElementById('settings-repo').value = s.journal_repo || '';
  document.getElementById('modal-settings').classList.remove('hidden');
};
document.getElementById('btn-close-settings').onclick = () =>
  document.getElementById('modal-settings').classList.add('hidden');
document.getElementById('btn-save-settings').onclick = async () => {
  const repo = document.getElementById('settings-repo').value.trim();
  if (!repo) return;
  setupStatus.textContent = '⏳ Connecting…';
  const r = await journal.journalInit({ repo });
  if (r.ok) {
    document.getElementById('modal-settings').classList.add('hidden');
    const s = await journal.journalStatus();
    showMain(s);
  } else {
    setupStatus.textContent = '✗ ' + r.error;
    setupStatus.style.color = 'var(--red)';
  }
};

// ── Setup view ────────────────────────────────────────────────────────────────
document.getElementById('btn-connect-repo').onclick = async () => {
  const repo = document.getElementById('setup-repo').value.trim();
  if (!repo) { setupStatus.textContent = 'Please enter a repo (owner/repo)'; return; }
  setupStatus.textContent = '⏳ Cloning and initialising…';
  setupStatus.style.color = 'var(--text-1)';
  const r = await journal.journalInit({ repo });
  if (r.ok) {
    const s = await journal.journalStatus();
    showMain(s);
  } else {
    setupStatus.textContent = '✗ ' + r.error;
    setupStatus.style.color = 'var(--red)';
  }
};

document.getElementById('btn-create-repo').onclick = async () => {
  const input = document.getElementById('setup-repo');
  let val = input.value.trim();
  if (!val) { setupStatus.textContent = 'Enter desired repo name first (owner/repo)'; return; }
  setupStatus.textContent = '⏳ Creating GitHub repo…';
  const parts = val.split('/');
  if (parts.length < 2) { setupStatus.textContent = 'Format: owner/repo'; return; }
  const r = await journal.journalInit({ repo: val });
  setupStatus.textContent = 'ℹ Use: gh repo create ' + val + ' --public --add-readme then click Connect';
  setupStatus.style.color = 'var(--yellow)';
};



// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'work-journal');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
