'use strict';

let serverInfo = null;
let allTasks = [];
let selectedTask = null;
let agentRunning = false;
let activePlanRunId = null;
let currentPlan = [];      // [{ key, title, rationale }]
let depsSearchFilter = '';

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const result = await window.robos.getServerInfo();
  if (!result.ok) {
    document.getElementById('server-badge').textContent = 'No server';
    document.getElementById('no-server').style.display = 'flex';
    document.getElementById('tab-bar').style.display = 'none';
    return;
  }
  serverInfo = result.server;
  const badge = document.getElementById('server-badge');
  badge.textContent = `${serverInfo.name} (${serverInfo.type})`;
  badge.classList.add('connected');
  document.getElementById('no-server').style.display = 'none';
  document.getElementById('tab-bar').style.display = 'flex';
  document.getElementById('tab-tasks').style.display = 'flex';

  setupAgentListeners();
  setupPlanListeners();
  loadTasks();
  loadSavedPlan();
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Tasks tab
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

  // Deps tab
  document.getElementById('deps-search').addEventListener('input', e => {
    depsSearchFilter = e.target.value.toLowerCase();
    renderDepsTree();
  });
  document.getElementById('btn-expand-all').addEventListener('click', () => setAllTreeExpanded(true));
  document.getElementById('btn-collapse-all').addEventListener('click', () => setAllTreeExpanded(false));

  // Plan tab
  document.getElementById('btn-generate-plan').addEventListener('click', handleGeneratePlan);
  document.getElementById('btn-stop-plan').addEventListener('click', handleStopPlan);
  document.getElementById('plan-log-toggle').addEventListener('click', () => {
    const log = document.getElementById('plan-log');
    const toggle = document.getElementById('plan-log-toggle');
    const visible = log.style.display !== 'none';
    log.style.display = visible ? 'none' : 'block';
    toggle.textContent = (visible ? '▸' : '▾') + ' Generation Log';
  });

  // robos-ai-textarea @-mention
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      ['extra-context', 'plan-context'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.addEventListener) {
          el.addEventListener('robos-path-query', async (e) => {
            try {
              const r = await window.robos.searchIndex(e.detail.query);
              if (r && r.ok && el._showMentions) el._showMentions(r.items);
            } catch (_) {}
          });
        }
      });
    }).catch(() => {});
  }
});

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    const isActive = p.id === `tab-${tabId}`;
    p.style.display = isActive ? 'flex' : 'none';
    p.classList.toggle('active', isActive);
  });
  if (tabId === 'deps') renderDepsTree();
}

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
  updatePlanTasksCount();
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

  list.innerHTML = filtered.map(t => {
    const isBlocked = t.blockedBy && t.blockedBy.length > 0 &&
      t.blockedBy.some(b => b.status && !['done', 'closed', 'resolved'].includes(b.status.toLowerCase()));
    return `
    <div class="task-item ${selectedTask && selectedTask.key === t.key ? 'active' : ''} ${isBlocked ? 'task-blocked' : ''}" data-key="${escHtml(t.key)}">
      <div class="task-item-key">${escHtml(t.key)}${isBlocked ? ' <span class="blocked-badge" title="Blocked">🔒</span>' : ''}</div>
      <div class="task-item-title">${escHtml(t.title)}</div>
      <div class="task-item-meta">
        ${t.labels.slice(0, 3).map(l => `<span class="task-label">${escHtml(l)}</span>`).join('')}
        ${t.assignee ? `<span style="color:var(--text-muted)">@${escHtml(t.assignee)}</span>` : ''}
      </div>
    </div>
  `}).join('');

  list.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => {
      const task = allTasks.find(t => t.key === el.dataset.key);
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

  // Show blocked-by warning if applicable
  let blockedWarn = document.getElementById('ws-blocked-warning');
  const activeBlockers = (task.blockedBy || []).filter(b => b.status && !['done', 'closed', 'resolved'].includes(b.status.toLowerCase()));
  if (activeBlockers.length > 0) {
    if (!blockedWarn) {
      blockedWarn = document.createElement('div');
      blockedWarn.id = 'ws-blocked-warning';
      blockedWarn.className = 'ws-blocked-warning';
      const header = document.getElementById('ws-task-key').closest('.workspace-header') || document.getElementById('ws-task-key').parentElement;
      header.after(blockedWarn);
    }
    blockedWarn.innerHTML = `⚠ Blocked by: ${activeBlockers.map(b => `<a href="#" class="blocker-link" data-url="${escHtml(b.url || '')}" title="${escHtml(b.summary)}">${escHtml(b.key)}</a>`).join(', ')}`;
    blockedWarn.style.display = 'block';
    blockedWarn.querySelectorAll('.blocker-link').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); if (a.dataset.url) window.robos.openUrl(a.dataset.url); });
    });
  } else if (blockedWarn) {
    blockedWarn.style.display = 'none';
  }

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
    if (selectedTask && selectedTask.key === taskKey) appendOutput(text, stream);
  });
  window.robos.onAgentDone(({ taskKey, code }) => {
    agentRunning = false;
    setAgentBusy(false);
    setAgentStatus(code === 0 ? 'Agent finished successfully.' : `Agent exited with code ${code}.`, code === 0 ? 'done-ok' : 'done-err');
  });
}

async function handleStartAgent() {
  if (!selectedTask || agentRunning) return;
  const extraContext = document.getElementById('extra-context').value.trim();
  document.getElementById('agent-output').innerHTML = '';
  setAgentStatus('Starting AI agent…', 'running');
  setAgentBusy(true);
  agentRunning = true;
  const result = await window.robos.startAgent({ taskKey: selectedTask.key, task: selectedTask, extraContext });
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

// ── Dependencies tree ─────────────────────────────────────────────────────────
function renderDepsTree() {
  const container = document.getElementById('deps-tree');
  if (!allTasks.length) {
    container.innerHTML = '<div class="loading-row">No tasks loaded. Go to the Tasks tab and load tasks first.</div>';
    return;
  }

  // Build key map and children map (recursive)
  const byKey = {};
  const childrenOf = {};
  allTasks.forEach(t => { byKey[t.key] = t; childrenOf[t.key] = []; });
  allTasks.forEach(t => {
    if (t.parent && byKey[t.parent.key]) {
      childrenOf[t.parent.key].push(t);
    }
  });

  // Root = no parent, or parent not in current task set
  const roots = allTasks.filter(t => !t.parent || !byKey[t.parent.key]);

  // Apply search filter (show node if self or any descendant matches)
  function matchesFilter(task) {
    if (!depsSearchFilter) return true;
    if (task.key.toLowerCase().includes(depsSearchFilter) || task.title.toLowerCase().includes(depsSearchFilter)) return true;
    return (childrenOf[task.key] || []).some(c => matchesFilter(c));
  }

  const visibleRoots = roots.filter(matchesFilter);
  if (!visibleRoots.length) {
    container.innerHTML = '<div class="loading-row">No matching tasks.</div>';
    return;
  }

  container.innerHTML = visibleRoots.map(t => renderTreeNode(t, childrenOf, 0)).join('');

  // Wire toggle clicks
  container.querySelectorAll('.tree-node-header[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const childrenEl = document.getElementById(header.dataset.toggle);
      const toggle = header.querySelector('.tree-toggle');
      if (!childrenEl) return;
      const collapsed = childrenEl.style.display === 'none';
      childrenEl.style.display = collapsed ? '' : 'none';
      toggle.classList.toggle('collapsed', !collapsed);
    });
  });

  // Wire key clicks → navigate to task
  container.querySelectorAll('.tree-node-header[data-key]').forEach(header => {
    header.addEventListener('dblclick', () => {
      const task = byKey[header.dataset.key];
      if (task) { switchTab('tasks'); selectTask(task); }
    });
  });
}

function renderTreeNode(task, childrenOf, depth) {
  const children = (childrenOf[task.key] || []).filter(c =>
    !depsSearchFilter || c.key.toLowerCase().includes(depsSearchFilter) || c.title.toLowerCase().includes(depsSearchFilter)
      || (childrenOf[c.key] || []).some(gc => gc.key.toLowerCase().includes(depsSearchFilter) || gc.title.toLowerCase().includes(depsSearchFilter))
  );
  const hasChildren = children.length > 0;
  const nodeId = `tn-${task.key.replace(/[^a-z0-9]/gi, '-')}`;
  const orphan = depth === 0 && task.parent && !allTasks.find(t => t.key === task.parent.key);
  const activeBlockers = (task.blockedBy || []).filter(b => b.status && !['done', 'closed', 'resolved'].includes(b.status.toLowerCase()));
  const blockedHtml = activeBlockers.length > 0
    ? `<span class="tree-blocked-indicator" title="Blocked by: ${escHtml(activeBlockers.map(b => b.key).join(', '))}">🔒 Blocked by ${activeBlockers.map(b => `<span class='blocker-key'>${escHtml(b.key)}</span>`).join(', ')}</span>`
    : '';
  const blocksHtml = (task.blocks || []).length > 0
    ? `<span class="tree-blocks-indicator" title="Blocks: ${escHtml(task.blocks.map(b => b.key).join(', '))}">⛓ Blocks ${task.blocks.map(b => `<span class='blocker-key'>${escHtml(b.key)}</span>`).join(', ')}</span>`
    : '';

  return `
    <div class="tree-node">
      <div class="tree-node-header" data-key="${escHtml(task.key)}" ${hasChildren ? `data-toggle="${nodeId}"` : ''}
           style="padding-left:${16 + depth * 20}px">
        <span class="tree-toggle ${hasChildren ? '' : ''}" style="opacity:${hasChildren ? 1 : 0}">${hasChildren ? '▼' : '▶'}</span>
        <span class="tree-type-icon" title="${escHtml(task.issueType || '')}">${typeIcon(task.issueType)}</span>
        <span class="tree-key">${escHtml(task.key)}</span>
        <span class="tree-title">${escHtml(task.title)}</span>
        <div class="tree-meta">
          ${orphan ? `<span class="tree-orphan-label">orphan</span>` : ''}
          ${blockedHtml}
          ${blocksHtml}
          <span class="status-pill ${statusClass(task.status)}">${escHtml(task.status || '')}</span>
          <span class="tree-priority" title="${escHtml(task.priority || '')}">${priorityIcon(task.priority)}</span>
          ${task.assignee ? `<span class="tree-assignee">@${escHtml(task.assignee)}</span>` : ''}
        </div>
      </div>
      ${hasChildren ? `<div id="${nodeId}" class="tree-children">${children.map(c => renderTreeNode(c, childrenOf, depth + 1)).join('')}</div>` : ''}
    </div>`;
}

function setAllTreeExpanded(expanded) {
  document.querySelectorAll('.tree-children').forEach(el => {
    el.style.display = expanded ? '' : 'none';
  });
  document.querySelectorAll('.tree-toggle').forEach(el => {
    el.classList.toggle('collapsed', !expanded);
  });
}

function typeIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('epic'))    return '🟣';
  if (t.includes('story'))   return '🟢';
  if (t.includes('bug'))     return '🔴';
  if (t.includes('sub'))     return '🔵';
  if (t.includes('task'))    return '⚪';
  return '⚪';
}

function priorityIcon(p) {
  const pr = (p || '').toLowerCase();
  if (pr.includes('highest') || pr === 'critical') return '🔴';
  if (pr.includes('high'))   return '🟠';
  if (pr.includes('medium')) return '🟡';
  if (pr.includes('low'))    return '🔵';
  return '';
}

function statusClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'done';
  if (s.includes('progress') || s.includes('review') || s.includes('active')) return 'indeterminate';
  return 'todo';
}

// ── Plan tab ──────────────────────────────────────────────────────────────────
async function loadSavedPlan() {
  if (!serverInfo) return;
  const result = await window.robos.loadPlan({ serverId: serverInfo.id });
  if (result.ok && result.plan && result.plan.length) {
    currentPlan = result.plan;
    renderPlan();
  }
}

function updatePlanTasksCount() {
  const el = document.getElementById('plan-tasks-count');
  if (el) el.textContent = allTasks.length ? `${allTasks.length} tasks loaded` : 'No tasks loaded yet';
}

function setupPlanListeners() {
  window.robos.onPlanStream(({ runId, text, isErr }) => {
    if (runId !== activePlanRunId) return;
    const log = document.getElementById('plan-log');
    log.textContent += text;
    log.scrollTop = log.scrollHeight;
  });

  window.robos.onPlanDone(({ runId, code, fullText }) => {
    if (runId !== activePlanRunId) return;
    activePlanRunId = null;
    setPlanBusy(false);

    if (code !== 0) {
      appendPlanLog(`\n[Error] Process exited with code ${code}`);
      return;
    }

    // Extract JSON array from Claude's response
    let parsed = null;
    try {
      // Try direct parse first
      parsed = JSON.parse(fullText.trim());
    } catch (_) {
      // Find first [...] block in the output
      const match = fullText.match(/\[[\s\S]*\]/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (_) {}
      }
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      appendPlanLog('\n[Error] Could not parse a JSON plan from the response. Raw output above.');
      return;
    }

    // Validate and normalize
    currentPlan = parsed.map(item => ({
      key: String(item.key || ''),
      title: String(item.title || allTasks.find(t => t.key === item.key)?.title || ''),
      rationale: String(item.rationale || ''),
    })).filter(item => item.key);

    renderPlan();
    savePlan();
  });
}

async function handleGeneratePlan() {
  if (!allTasks.length) {
    alert('Load tasks first (Tasks tab).');
    return;
  }
  if (activePlanRunId) return;

  const ctxEl = document.getElementById('plan-context');
  const context = ctxEl ? (ctxEl.value || '').trim() : '';

  document.getElementById('plan-log').textContent = '';
  document.getElementById('plan-log-wrap').style.display = 'flex';
  setPlanBusy(true);

  const result = await window.robos.generatePlan({
    tasks: allTasks,
    context,
    serverId: serverInfo?.id || 'default',
  });

  if (!result.ok) {
    setPlanBusy(false);
    appendPlanLog(`[Error] ${result.error}`);
    return;
  }
  activePlanRunId = result.runId;
}

async function handleStopPlan() {
  if (!activePlanRunId) return;
  await window.robos.stopPlan({ runId: activePlanRunId });
  activePlanRunId = null;
  setPlanBusy(false);
  appendPlanLog('\n[Stopped]');
}

function setPlanBusy(busy) {
  document.getElementById('btn-plan-text').style.display = busy ? 'none' : 'inline';
  document.getElementById('btn-plan-spinner').style.display = busy ? 'inline-block' : 'none';
  document.getElementById('btn-generate-plan').disabled = busy;
  document.getElementById('btn-stop-plan').style.display = busy ? 'inline-flex' : 'none';
}

function appendPlanLog(text) {
  const log = document.getElementById('plan-log');
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

function renderPlan() {
  const empty = document.getElementById('plan-empty');
  const list = document.getElementById('plan-list');
  const count = document.getElementById('plan-item-count');

  if (!currentPlan.length) {
    empty.style.display = 'flex';
    list.style.display = 'none';
    count.textContent = '';
    return;
  }

  empty.style.display = 'none';
  list.style.display = 'flex';
  count.textContent = `${currentPlan.length} tasks`;

  const taskByKey = {};
  allTasks.forEach(t => { taskByKey[t.key] = t; });

  list.innerHTML = currentPlan.map((item, i) => {
    const live = taskByKey[item.key];
    const stale = !live;
    return `
      <div class="plan-item ${stale ? 'plan-item-stale' : ''}">
        <div class="plan-item-row1">
          <span class="plan-num">${i + 1}</span>
          <span class="plan-item-key">${escHtml(item.key)}</span>
          <span class="plan-item-title">${escHtml(item.title || live?.title || '')}</span>
          ${!stale ? `<button class="plan-item-implement" data-key="${escHtml(item.key)}">▶ Implement</button>` : ''}
        </div>
        ${item.rationale ? `<div class="plan-item-rationale">${escHtml(item.rationale)}</div>` : ''}
      </div>`;
  }).join('');

  list.querySelectorAll('.plan-item-implement').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = taskByKey[btn.dataset.key];
      if (task) { switchTab('tasks'); selectTask(task); }
    });
  });
}

async function savePlan() {
  if (!serverInfo || !currentPlan.length) return;
  await window.robos.savePlan({
    serverId: serverInfo.id,
    plan: currentPlan,
    meta: { generatedAt: new Date().toISOString(), taskCount: allTasks.length },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Demo helpers ──────────────────────────────────────────────────────────────
window._demoSetServer = function(name, type) {
  const badge = document.getElementById('server-badge');
  badge.textContent = `${name} (${type})`;
  badge.classList.add('connected');
  document.getElementById('no-server').style.display = 'none';
  document.getElementById('tab-bar').style.display = 'flex';
  document.getElementById('tab-tasks').style.display = 'flex';
};
window._demoInjectTasks = function(tasks) { allTasks = tasks; renderTaskList(); };
window._demoSelectTask  = function(key)  { const t = allTasks.find(t => t.key === key); if (t) selectTask(t); };
window._demoAppendOutput= function(text, isStderr) { appendOutput(text, isStderr ? 'stderr' : 'stdout'); };
window._demoSetAgentBusy= function(busy) { agentRunning = busy; setAgentBusy(busy); };
window._demoSetAgentStatus = function(msg, cls) { setAgentStatus(msg, cls); };

