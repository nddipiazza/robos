'use strict';

let serverInfo = null;
let tasks = [];

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
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('btn-open-task-servers').addEventListener('click', () => window.robos.openTaskServers());

  document.getElementById('btn-generate').addEventListener('click', handleGenerate);
  document.getElementById('btn-prompt-enter', { capture: false });

  document.getElementById('prompt-input').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  });

  document.getElementById('btn-add-task').addEventListener('click', () => {
    tasks.push({ title: '', body: '', labels: [] });
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
    title: t.title || '',
    body: t.body || t.description || '',
    labels: Array.isArray(t.labels) ? t.labels : [],
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

// ── Render tasks ──────────────────────────────────────────────────────────────
function renderTasks() {
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  tasks.forEach((task, i) => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <div class="task-card-header">
        <span class="task-num">#${i + 1}</span>
        <input class="task-title-input" type="text" value="${escHtml(task.title)}" placeholder="Task title…" data-idx="${i}" data-field="title"/>
      </div>
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
    card.querySelector('.task-remove-btn').addEventListener('click', () => {
      tasks.splice(i, 1);
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

    list.appendChild(card);
  });
}

function updateCount() {
  document.getElementById('task-count').textContent = tasks.length;
}

// ── Create ────────────────────────────────────────────────────────────────────
async function handleCreateAll() {
  const toCreate = tasks.filter(t => t.title.trim());
  if (!toCreate.length) { showCreateStatus('No tasks with titles to create.', true); return; }

  setCreating(true);
  showCreateStatus(`Creating ${toCreate.length} task${toCreate.length !== 1 ? 's' : ''}…`);

  const result = await window.robos.createTasks({ tasks: toCreate, serverInfo });
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
      <span class="result-title">${escHtml(r.title || '(untitled)')}</span>
      ${r.ok && r.url ? `<a class="result-link" href="${escHtml(r.url)}" id="link-${encodeURIComponent(r.url)}">${escHtml(r.url)}</a>` : ''}
      ${!r.ok ? `<span class="result-error">${escHtml(r.error)}</span>` : ''}
    </div>
  `).join('');

  // Wire up link clicks
  results.filter(r => r.ok && r.url).forEach(r => {
    const a = list.querySelector(`[id="link-${encodeURIComponent(r.url)}"]`);
    if (a) a.addEventListener('click', e => { e.preventDefault(); window.robos.openUrl(r.url); });
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
