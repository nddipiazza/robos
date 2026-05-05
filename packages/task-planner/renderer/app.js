'use strict';

let serverInfo = null;
let tasks = [];
let existingEpics = [];   // Epics fetched from Jira
let parentEpicKey = null; // Selected top-level parent epic key

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const result = await window.robos.getServerInfo();
  if (!result.ok) {
    document.getElementById('server-badge').textContent = 'No server';
    document.getElementById('no-server').style.display = 'flex';
    document.getElementById('main-content').style.display = 'none';
    return;
  }
  serverInfo = result.server;
  const badge = document.getElementById('server-badge');
  badge.textContent = `${serverInfo.name} (${serverInfo.type})`;
  badge.classList.add('connected');
  document.getElementById('no-server').style.display = 'none';
  document.getElementById('main-content').style.display = 'flex';

  if (serverInfo.type === 'jira') {
    document.getElementById('epic-parent-section').style.display = 'block';
    loadExistingEpics();
  }
}

async function loadExistingEpics() {
  const statusEl = document.getElementById('epic-fetch-status');
  statusEl.textContent = 'Fetching epics…';
  const result = await window.robos.fetchJiraEpics({
    jiraUrl: serverInfo.jiraUrl,
    jiraProject: serverInfo.jiraProject,
    username: serverInfo.jiraUsername,
    tokenPassPath: serverInfo.jiraTokenPassPath,
  });
  if (!result.ok) {
    statusEl.textContent = result.error || 'Could not load epics';
    return;
  }
  existingEpics = result.epics || [];
  statusEl.textContent = existingEpics.length ? '' : 'No existing epics found.';
  renderEpicDropdown();
}

function renderEpicDropdown() {
  const sel = document.getElementById('parent-epic-select');
  sel.innerHTML = '<option value="">— None (create new epics from plan) —</option>' +
    existingEpics.map(e =>
      `<option value="${escHtml(e.key)}">[${escHtml(e.key)}] ${escHtml(e.summary)}</option>`
    ).join('');
  sel.value = parentEpicKey || '';
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('btn-open-task-servers').addEventListener('click', () => window.robos.openTaskServers());

  document.getElementById('btn-generate').addEventListener('click', handleGenerate);

  document.getElementById('prompt-input').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  });

  document.getElementById('btn-add-task').addEventListener('click', () => {
    tasks.push({ title: '', body: '', labels: [], isEpic: false, epicName: '', parentEpicIdx: null, issueType: '' });
    renderTasks();
    document.getElementById('preview-section').style.display = 'block';
    updateCount();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    tasks = [];
    renderTasks();
    updateCount();
    if (!tasks.length) document.getElementById('preview-section').style.display = 'none';
  });

  document.getElementById('parent-epic-select').addEventListener('change', e => {
    parentEpicKey = e.target.value || null;
  });

  document.getElementById('btn-create-all').addEventListener('click', handleCreateAll);
  document.getElementById('btn-plan-again').addEventListener('click', () => {
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('preview-section').style.display = tasks.length ? 'block' : 'none';
  });
});

// ── Generate ──────────────────────────────────────────────────────────────────
async function handleGenerate() {
  const prompt = document.getElementById('prompt-input').value.trim();
  if (!prompt) { showGenerateStatus('Please enter a description.', true); return; }
  if (!serverInfo) { showGenerateStatus('No task server connected.', true); return; }

  setGenerating(true);
  showGenerateStatus('AI is planning your tasks… this may take some time while the AI agent works.');

  const result = await window.robos.generateTasks({ prompt, serverInfo });
  setGenerating(false);

  if (!result.ok) {
    showGenerateStatus('Error: ' + result.error, true);
    return;
  }

  tasks = result.tasks.map(t => ({
    title:          t.title || '',
    body:           t.body || t.description || '',
    labels:         Array.isArray(t.labels) ? t.labels : [],
    isEpic:         !!t.isEpic,
    epicName:       t.epicName || '',
    parentEpicIdx:  typeof t.parentEpicIndex === 'number' ? t.parentEpicIndex : null,
    issueType:      t.issueType || '',
    epicKey:        t.epicKey || null,
  }));

  renderTasks();
  updateCount();
  document.getElementById('preview-section').style.display = 'block';
  document.getElementById('results-section').style.display = 'none';
  showGenerateStatus(`Generated ${tasks.length} task${tasks.length !== 1 ? 's' : ''}.`);
}

function setGenerating(busy) {
  const btn = document.getElementById('btn-generate');
  document.getElementById('btn-generate-text').style.display = busy ? 'none' : 'inline';
  document.getElementById('btn-generate-spinner').style.display = busy ? 'inline-block' : 'none';
  btn.disabled = busy;
}

function showGenerateStatus(msg, isError = false) {
  const el = document.getElementById('generate-status');
  el.textContent = msg;
  el.className = 'status-text' + (isError ? ' error' : '');
}

// ── Render tasks (tree view for Jira epics) ───────────────────────────────────
function renderTasks() {
  const list = document.getElementById('task-list');
  list.innerHTML = '';

  const isJira = serverInfo && serverInfo.type === 'jira';

  if (isJira) {
    // Build tree: epics at root, children grouped under their epic
    const epicIndices = tasks.map((t, i) => t.isEpic ? i : null).filter(i => i !== null);
    const rendered = new Set();

    const appendCard = (i, indent) => {
      if (rendered.has(i)) return;
      rendered.add(i);
      list.appendChild(buildCard(i, indent));
    };

    for (const epicIdx of epicIndices) {
      appendCard(epicIdx, 0);
      tasks.forEach((t, i) => {
        if (!t.isEpic && t.parentEpicIdx === epicIdx) appendCard(i, 1);
      });
    }
    // Orphan non-epic tasks (no epic parent)
    tasks.forEach((t, i) => {
      if (!rendered.has(i)) appendCard(i, 0);
    });
  } else {
    tasks.forEach((_, i) => list.appendChild(buildCard(i, 0)));
  }
}

function buildCard(i, indent) {
  const task = tasks[i];
  const isJira = serverInfo && serverInfo.type === 'jira';

  const card = document.createElement('div');
  card.className = 'task-card' + (task.isEpic ? ' task-epic' : '') + (indent ? ' task-child' : '');

  const epicTypeBadge = isJira
    ? `<span class="issue-type-badge ${task.isEpic ? 'badge-epic' : 'badge-story'}">${task.isEpic ? '⬡ Epic' : (task.issueType || 'Story')}</span>`
    : '';

  const epicNameRow = (isJira && task.isEpic)
    ? `<div class="epic-name-row">
        <label class="epic-name-label">Epic name:</label>
        <input class="epic-name-input" type="text" value="${escHtml(task.epicName)}" placeholder="Short epic label…" data-idx="${i}" data-field="epicName"/>
       </div>`
    : '';

  card.innerHTML = `
    <div class="task-card-header">
      ${indent ? '<span class="tree-indent">└</span>' : ''}
      ${epicTypeBadge}
      <span class="task-num">#${i + 1}</span>
      <input class="task-title-input" type="text" value="${escHtml(task.title)}" placeholder="Task title…" data-idx="${i}" data-field="title"/>
    </div>
    ${epicNameRow}
    <textarea class="task-body-input" rows="3" data-idx="${i}" data-field="body" placeholder="Description…">${escHtml(task.body)}</textarea>
    <div class="task-labels" data-idx="${i}">
      ${task.labels.map((lbl, li) => `<span class="label-chip" data-li="${li}" data-ti="${i}" title="Click to remove">${escHtml(lbl)} ×</span>`).join('')}
      <button class="add-label-btn" data-ti="${i}">+ label</button>
    </div>
    <button class="task-remove-btn" data-idx="${i}" title="Remove task">×</button>
  `;

  card.querySelector('.task-title-input').addEventListener('input', e => {
    tasks[i].title = e.target.value;
  });
  card.querySelector('.task-body-input').addEventListener('input', e => {
    tasks[i].body = e.target.value;
  });
  if (task.isEpic) {
    const epicInput = card.querySelector('.epic-name-input');
    if (epicInput) epicInput.addEventListener('input', e => { tasks[i].epicName = e.target.value; });
  }
  card.querySelector('.task-remove-btn').addEventListener('click', () => {
    tasks.splice(i, 1);
    // Remap parentEpicIdx references
    tasks.forEach(t => {
      if (t.parentEpicIdx !== null) {
        if (t.parentEpicIdx === i) t.parentEpicIdx = null;
        else if (t.parentEpicIdx > i) t.parentEpicIdx--;
      }
    });
    renderTasks();
    updateCount();
    if (!tasks.length) document.getElementById('preview-section').style.display = 'none';
  });
  card.querySelectorAll('.label-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const li = parseInt(chip.dataset.li);
      tasks[i].labels.splice(li, 1);
      renderTasks();
    });
  });
  card.querySelector('.add-label-btn').addEventListener('click', () => {
    const lbl = prompt('Label name:');
    if (lbl && lbl.trim()) {
      tasks[i].labels.push(lbl.trim());
      renderTasks();
    }
  });

  return card;
}

function updateCount() {
  document.getElementById('task-count').textContent = tasks.length;
  const epicCount = tasks.filter(t => t.isEpic).length;
  const epicBadge = document.getElementById('epic-count');
  if (epicBadge) {
    epicBadge.textContent = epicCount ? `${epicCount} epic${epicCount !== 1 ? 's' : ''}` : '';
    epicBadge.style.display = epicCount ? 'inline-flex' : 'none';
  }
}

// ── Create ────────────────────────────────────────────────────────────────────
async function handleCreateAll() {
  const toCreate = tasks.filter(t => t.title.trim());
  if (!toCreate.length) { showCreateStatus('No tasks with titles to create.', true); return; }

  setCreating(true);
  showCreateStatus(`Creating ${toCreate.length} task${toCreate.length !== 1 ? 's' : ''}…`);

  const result = await window.robos.createTasks({ tasks: toCreate, serverInfo, parentEpicKey });
  setCreating(false);

  if (!result.ok) { showCreateStatus('Error: ' + result.error, true); return; }

  renderResults(result.results);
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'block';
  tasks = [];
  updateCount();
}

function setCreating(busy) {
  const btn = document.getElementById('btn-create-all');
  document.getElementById('btn-create-text').style.display = busy ? 'none' : 'inline';
  document.getElementById('btn-create-spinner').style.display = busy ? 'inline-block' : 'none';
  btn.disabled = busy;
}

function showCreateStatus(msg, isError = false) {
  const el = document.getElementById('create-status');
  el.textContent = msg;
  el.className = 'status-text' + (isError ? ' error' : '');
}

function renderResults(results) {
  const list = document.getElementById('results-list');
  list.innerHTML = results.map(r => `
    <div class="result-item ${r.ok ? 'success' : 'fail'}">
      <span class="result-icon">${r.ok ? '✓' : '✗'}</span>
      ${r.isEpic ? '<span class="result-epic-badge">Epic</span>' : ''}
      <span class="result-title">${escHtml(r.title || '(untitled)')}</span>
      ${r.ok && r.url ? `<a class="result-link" href="${escHtml(r.url)}" id="link-${encodeURIComponent(r.url)}">${escHtml(r.key || r.url)}</a>` : ''}
      ${!r.ok ? `<span class="result-error">${escHtml(r.error)}</span>` : ''}
    </div>
  `).join('');

  results.filter(r => r.ok && r.url).forEach(r => {
    const a = list.querySelector(`[id="link-${encodeURIComponent(r.url)}"]`);
    if (a) a.addEventListener('click', e => { e.preventDefault(); window.robos.openUrl(r.url); });
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
