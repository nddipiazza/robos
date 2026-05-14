'use strict';

let serverInfo = null;
let allTasks = [];
let selectedTask = null;
let agentRunning = false;

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const result = await window.robos.getServerInfo();
  if (!result.ok) {
    document.getElementById('server-badge').textContent = 'No server';
    document.getElementById('no-server').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';
    return;
  }
  serverInfo = result.server;
  const badge = document.getElementById('server-badge');
  badge.textContent = `${serverInfo.name} (${serverInfo.type})`;
  badge.classList.add('connected');
  document.getElementById('no-server').style.display = 'none';
  document.getElementById('main-layout').style.display = 'flex';

  setupAgentListeners();
  loadTasks();
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('btn-open-task-servers').addEventListener('click', () => window.robos.openTaskServers());
  document.getElementById('btn-refresh').addEventListener('click', loadTasks);
  document.getElementById('filter-state').addEventListener('change', loadTasks);
  document.getElementById('filter-search').addEventListener('input', renderTaskList);
  document.getElementById('btn-start-agent').addEventListener('click', handleStartAgent);
  document.getElementById('btn-stop-agent').addEventListener('click', handleStopAgent);
  document.getElementById('btn-clear-output').addEventListener('click', () => {
    document.getElementById('agent-output').innerHTML = '';
  });
  document.getElementById('desc-toggle').addEventListener('click', () => {
    const desc = document.getElementById('task-description');
    const toggle = document.getElementById('desc-toggle');
    const visible = desc.style.display !== 'none';
    desc.style.display = visible ? 'none' : 'block';
    toggle.textContent = (visible ? '▸' : '▾') + ' Task Description';
  });

  // Wire @-mention file typeahead for robos-ai-textarea
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      const ctxEl = document.getElementById('extra-context');
      if (ctxEl && ctxEl.addEventListener) {
        ctxEl.addEventListener('robos-path-query', async (e) => {
          try {
            const r = await window.robos.searchIndex(e.detail.query);
            if (r && r.ok && ctxEl._showMentions) ctxEl._showMentions(r.items);
          } catch (_) {}
        });
      }
    }).catch(() => {});
  }
});

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
  const state = document.getElementById('filter-state').value;
  document.getElementById('task-list').innerHTML = '<div class="loading-row">Loading…</div>';
  const result = await window.robos.listTasks({ filter: { state } });
  if (!result.ok) {
    document.getElementById('task-list').innerHTML = `<div class="loading-row" style="color:#ef4444">Error: ${escHtml(result.error)}</div>`;
    return;
  }
  allTasks = result.tasks;
  renderTaskList();
}

function renderTaskList() {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const filtered = search
    ? allTasks.filter(t => t.title.toLowerCase().includes(search) || t.key.toLowerCase().includes(search))
    : allTasks;

  const list = document.getElementById('task-list');
  if (!filtered.length) {
    list.innerHTML = '<div class="loading-row">No tasks found.</div>';
    return;
  }

  list.innerHTML = filtered.map(t => `
    <div class="task-item ${selectedTask && selectedTask.key === t.key ? 'active' : ''}" data-key="${escHtml(t.key)}">
      <div class="task-item-key">${escHtml(t.key)}</div>
      <div class="task-item-title">${escHtml(t.title)}</div>
      <div class="task-item-meta">
        ${t.labels.slice(0, 3).map(l => `<span class="task-label">${escHtml(l)}</span>`).join('')}
        ${t.assignee ? `<span style="color:var(--text-muted)">@${escHtml(t.assignee)}</span>` : ''}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const task = allTasks.find(t => t.key === key);
      if (task) selectTask(task);
    });
  });
}

// ── Select task ───────────────────────────────────────────────────────────────
function selectTask(task) {
  selectedTask = task;
  renderTaskList();

  document.getElementById('workspace-empty').style.display = 'none';
  const wa = document.getElementById('workspace-active');
  wa.style.display = 'flex';
  wa.style.flex = '1';
  wa.style.minHeight = '0';
  wa.style.flexDirection = 'column';
  wa.style.overflow = 'hidden';

  document.getElementById('ws-task-key').textContent = task.key;
  document.getElementById('ws-task-title').textContent = task.title;

  const openLink = document.getElementById('ws-open-url');
  if (task.url) {
    openLink.style.display = 'inline-flex';
    openLink.onclick = (e) => { e.preventDefault(); window.robos.openUrl(task.url); };
  } else {
    openLink.style.display = 'none';
  }

  const descBox = document.getElementById('task-description-box');
  if (task.body && task.body.trim()) {
    descBox.style.display = 'block';
    document.getElementById('task-description').textContent = task.body.trim();
  } else {
    descBox.style.display = 'none';
  }

  document.getElementById('agent-output').innerHTML = '';
  setAgentStatus('', '');
}

// ── Agent ─────────────────────────────────────────────────────────────────────
function setupAgentListeners() {
  window.robos.onAgentStream(({ taskKey, text, stream }) => {
    if (selectedTask && selectedTask.key === taskKey) {
      appendOutput(text, stream);
    }
  });
  window.robos.onAgentDone(({ taskKey, code }) => {
    agentRunning = false;
    setAgentBusy(false);
    if (code === 0) {
      setAgentStatus('Agent finished successfully.', 'done-ok');
    } else {
      setAgentStatus(`Agent exited with code ${code}.`, 'done-err');
    }
  });
}

async function handleStartAgent() {
  if (!selectedTask) return;
  if (agentRunning) return;

  const extraContext = document.getElementById('extra-context').value.trim();
  document.getElementById('agent-output').innerHTML = '';
  setAgentStatus('Starting AI agent…', 'running');
  setAgentBusy(true);
  agentRunning = true;

  const result = await window.robos.startAgent({
    taskKey: selectedTask.key,
    task: selectedTask,
    extraContext,
  });

  if (!result.ok) {
    agentRunning = false;
    setAgentBusy(false);
    setAgentStatus('Error: ' + result.error, 'done-err');
  }
}

async function handleStopAgent() {
  if (!selectedTask) return;
  await window.robos.stopAgent({ taskKey: selectedTask.key });
  agentRunning = false;
  setAgentBusy(false);
  setAgentStatus('Agent stopped.', 'done-err');
}

function setAgentBusy(busy) {
  document.getElementById('btn-start-text').style.display = busy ? 'none' : 'inline';
  document.getElementById('btn-start-spinner').style.display = busy ? 'inline-block' : 'none';
  document.getElementById('btn-start-agent').disabled = busy;
  document.getElementById('btn-stop-agent').style.display = busy ? 'inline-flex' : 'none';
}

function setAgentStatus(msg, cls) {
  const el = document.getElementById('agent-status');
  el.textContent = msg;
  el.className = 'agent-status' + (cls ? ' ' + cls : '');
}

function appendOutput(text, stream) {
  const out = document.getElementById('agent-output');
  const span = document.createElement('span');
  span.className = stream === 'stderr' ? 'line-stderr' : 'line-stdout';
  span.textContent = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Demo helpers — called via evalJS from the demo runner ─────────────────────
window._demoSetServer = function(name, type) {
  const badge = document.getElementById('server-badge');
  badge.textContent = `${name} (${type})`;
  badge.classList.add('connected');
  document.getElementById('no-server').style.display = 'none';
  document.getElementById('main-layout').style.display = 'flex';
};

window._demoInjectTasks = function(tasks) {
  allTasks = tasks;
  renderTaskList();
};

window._demoSelectTask = function(key) {
  const task = allTasks.find(t => t.key === key);
  if (task) selectTask(task);
};

window._demoAppendOutput = function(text, isStderr) {
  appendOutput(text, isStderr ? 'stderr' : 'stdout');
};

window._demoSetAgentBusy = function(busy) {
  agentRunning = busy;
  setAgentBusy(busy);
};

window._demoSetAgentStatus = function(msg, cls) {
  setAgentStatus(msg, cls);
};
