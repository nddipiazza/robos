'use strict';

// ── State ───────────────────────────────────────────────────────────────────
let rules = [];
let jobs = [];
let events = [];
let editingRuleIndex = -1;  // -1 = new
let editingJobIndex = -1;
let logPaused = false;
let logRefreshTimer = null;

// ── Tab switching ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById('tab-' + tab.dataset.tab);
    if (target) target.classList.add('active');

    if (tab.dataset.tab === 'log') startLogRefresh();
    else stopLogRefresh();
  });
});

// ── Rules Tab ───────────────────────────────────────────────────────────────

async function loadRules() {
  rules = await window.studio.loadRules();
  renderRules();
}

function renderRules() {
  const list = document.getElementById('rules-list');
  const empty = document.getElementById('rules-empty');

  if (rules.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = rules.map((r, i) => {
    const condCount = (r.conditions || []).length;
    const actCount = (r.actions || []).length;
    const lastFired = r.lastFired ? new Date(r.lastFired).toLocaleString() : 'Never';
    return `
      <div class="rule-row" data-index="${i}">
        <span class="row-name">${esc(r.name || 'Unnamed Rule')}</span>
        <span class="row-meta">
          <span class="badge badge-${badgeCategory(r.eventType)}">${esc(r.eventType || 'any')}</span>
          <span>${condCount} condition${condCount !== 1 ? 's' : ''}</span>
          <span>${actCount} action${actCount !== 1 ? 's' : ''}</span>
          <span>Last: ${lastFired}</span>
        </span>
        <div class="row-actions">
          <label class="toggle-switch">
            <input type="checkbox" ${r.enabled ? 'checked' : ''} data-toggle-rule="${i}">
            <span class="slider"></span>
          </label>
          <button class="btn btn-small" data-edit-rule="${i}">Edit</button>
          <button class="btn btn-danger btn-small" data-delete-rule="${i}">Del</button>
        </div>
      </div>`;
  }).join('');

  // Event delegation
  list.querySelectorAll('[data-toggle-rule]').forEach(el => {
    el.addEventListener('change', async (e) => {
      const idx = parseInt(e.target.dataset.toggleRule);
      rules[idx].enabled = e.target.checked;
      await window.studio.saveRules(rules);
    });
  });

  list.querySelectorAll('[data-edit-rule]').forEach(el => {
    el.addEventListener('click', (e) => {
      openRuleEditor(parseInt(e.target.dataset.editRule));
    });
  });

  list.querySelectorAll('[data-delete-rule]').forEach(el => {
    el.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.dataset.deleteRule);
      rules.splice(idx, 1);
      await window.studio.saveRules(rules);
      renderRules();
    });
  });
}

function openRuleEditor(index) {
  editingRuleIndex = index;
  const panel = document.getElementById('rule-editor');
  const title = document.getElementById('rule-editor-title');

  if (index >= 0) {
    title.textContent = 'Edit Rule';
    const r = rules[index];
    document.getElementById('rule-name').value = r.name || '';
    document.getElementById('rule-event-type').value = r.eventType || '';
    renderConditions(r.conditions || []);
    renderActions('conditions', r.actions || []);
  } else {
    title.textContent = 'New Rule';
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-event-type').value = '';
    renderConditions([]);
    renderActions('conditions', []);
  }

  panel.classList.remove('hidden');
}

function closeRuleEditor() {
  document.getElementById('rule-editor').classList.add('hidden');
  editingRuleIndex = -1;
}

function renderConditions(conditions) {
  const container = document.getElementById('conditions-list');
  container.innerHTML = conditions.map((c, i) => `
    <div class="condition-row">
      <input type="text" placeholder="field" value="${esc(c.field || '')}" data-cond-field="${i}">
      <select data-cond-op="${i}">
        <option value="equals" ${c.operator === 'equals' ? 'selected' : ''}>equals</option>
        <option value="not_equals" ${c.operator === 'not_equals' ? 'selected' : ''}>not equals</option>
        <option value="contains" ${c.operator === 'contains' ? 'selected' : ''}>contains</option>
        <option value="gt" ${c.operator === 'gt' ? 'selected' : ''}>></option>
        <option value="lt" ${c.operator === 'lt' ? 'selected' : ''}><</option>
      </select>
      <input type="text" placeholder="value" value="${esc(c.value || '')}" data-cond-val="${i}">
      <button data-remove-cond="${i}">&times;</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove-cond]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.removeCond);
      const conds = collectConditions();
      conds.splice(idx, 1);
      renderConditions(conds);
    });
  });
}

function collectConditions() {
  const rows = document.querySelectorAll('#conditions-list .condition-row');
  return Array.from(rows).map((row, i) => ({
    field: row.querySelector(`[data-cond-field="${i}"]`)?.value || '',
    operator: row.querySelector(`[data-cond-op="${i}"]`)?.value || 'equals',
    value: row.querySelector(`[data-cond-val="${i}"]`)?.value || '',
  }));
}

function renderActions(context, actions) {
  const containerId = context === 'conditions' ? 'actions-list' : 'job-actions-list';
  const container = document.getElementById(containerId);
  container.innerHTML = actions.map((a, i) => `
    <div class="action-row">
      <select data-action-type="${i}">
        <option value="notify" ${a.type === 'notify' ? 'selected' : ''}>Notify</option>
        <option value="webhook" ${a.type === 'webhook' ? 'selected' : ''}>Webhook</option>
        <option value="exec" ${a.type === 'exec' ? 'selected' : ''}>Execute</option>
        <option value="log" ${a.type === 'log' ? 'selected' : ''}>Log</option>
      </select>
      <input type="text" placeholder="params" value="${esc(a.params || '')}" data-action-params="${i}">
      <button data-remove-action="${i}">&times;</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove-action]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.removeAction);
      const acts = collectActions(containerId);
      acts.splice(idx, 1);
      renderActions(context, acts);
    });
  });
}

function collectActions(containerId) {
  const id = containerId || 'actions-list';
  const rows = document.querySelectorAll(`#${id} .action-row`);
  return Array.from(rows).map((row, i) => ({
    type: row.querySelector(`[data-action-type="${i}"]`)?.value || 'notify',
    params: row.querySelector(`[data-action-params="${i}"]`)?.value || '',
  }));
}

document.getElementById('btn-add-rule').addEventListener('click', () => openRuleEditor(-1));
document.getElementById('btn-close-rule-editor').addEventListener('click', closeRuleEditor);
document.getElementById('btn-cancel-rule').addEventListener('click', closeRuleEditor);

document.getElementById('btn-add-condition').addEventListener('click', () => {
  const conds = collectConditions();
  conds.push({ field: '', operator: 'equals', value: '' });
  renderConditions(conds);
});

document.getElementById('btn-add-action').addEventListener('click', () => {
  const acts = collectActions('actions-list');
  acts.push({ type: 'notify', params: '' });
  renderActions('conditions', acts);
});

document.getElementById('btn-save-rule').addEventListener('click', async () => {
  const rule = {
    name: document.getElementById('rule-name').value.trim(),
    eventType: document.getElementById('rule-event-type').value,
    conditions: collectConditions(),
    actions: collectActions('actions-list'),
    enabled: true,
    lastFired: null,
  };

  if (!rule.name) { alert('Rule name is required'); return; }

  if (editingRuleIndex >= 0) {
    rule.enabled = rules[editingRuleIndex].enabled;
    rule.lastFired = rules[editingRuleIndex].lastFired;
    rules[editingRuleIndex] = rule;
  } else {
    rules.push(rule);
  }

  await window.studio.saveRules(rules);
  closeRuleEditor();
  renderRules();
});

// ── Jobs Tab ────────────────────────────────────────────────────────────────

async function loadJobs() {
  jobs = await window.studio.loadJobs();
  renderJobs();
}

function renderJobs() {
  const list = document.getElementById('jobs-list');
  const empty = document.getElementById('jobs-empty');

  if (jobs.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = jobs.map((j, i) => {
    const lastRun = j.lastRun ? new Date(j.lastRun).toLocaleString() : 'Never';
    const nextRun = j.nextRun ? new Date(j.nextRun).toLocaleString() : 'N/A';
    const actSummary = (j.actions || []).map(a => a.type).join(', ') || 'No actions';
    const statusCls = j.status === 'error' ? 'status-error' : j.enabled ? 'status-active' : 'status-disabled';
    const statusLabel = j.status === 'error' ? 'Error' : j.enabled ? 'Active' : 'Disabled';
    return `
      <div class="job-row" data-index="${i}">
        <span class="row-name">${esc(j.name || 'Unnamed Job')}</span>
        <span class="row-meta">
          <span>${esc(j.scheduleHuman || j.cron || 'No schedule')}</span>
          <span>${esc(actSummary)}</span>
          <span>Next: ${nextRun}</span>
          <span>Last: ${lastRun}</span>
          <span class="${statusCls}">${statusLabel}</span>
        </span>
        <div class="row-actions">
          <label class="toggle-switch">
            <input type="checkbox" ${j.enabled ? 'checked' : ''} data-toggle-job="${i}">
            <span class="slider"></span>
          </label>
          <button class="btn-run" data-run-job="${i}">Run Now</button>
          <button class="btn btn-small" data-edit-job="${i}">Edit</button>
          <button class="btn btn-danger btn-small" data-delete-job="${i}">Del</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-toggle-job]').forEach(el => {
    el.addEventListener('change', async (e) => {
      const idx = parseInt(e.target.dataset.toggleJob);
      jobs[idx].enabled = e.target.checked;
      await window.studio.saveJobs(jobs);
    });
  });

  list.querySelectorAll('[data-run-job]').forEach(el => {
    el.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.runJob);
      jobs[idx].lastRun = new Date().toISOString();
      jobs[idx].status = 'ran';
      window.studio.saveJobs(jobs);
      renderJobs();
    });
  });

  list.querySelectorAll('[data-edit-job]').forEach(el => {
    el.addEventListener('click', (e) => {
      openJobEditor(parseInt(e.target.dataset.editJob));
    });
  });

  list.querySelectorAll('[data-delete-job]').forEach(el => {
    el.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.dataset.deleteJob);
      jobs.splice(idx, 1);
      await window.studio.saveJobs(jobs);
      renderJobs();
    });
  });
}

function openJobEditor(index) {
  editingJobIndex = index;
  const panel = document.getElementById('job-editor');
  const title = document.getElementById('job-editor-title');

  if (index >= 0) {
    title.textContent = 'Edit Job';
    const j = jobs[index];
    document.getElementById('job-name').value = j.name || '';
    document.getElementById('job-cron').value = j.cron || '';
    document.getElementById('job-enabled').checked = j.enabled !== false;
    renderActions('job', j.actions || []);
    updateCronHint();
  } else {
    title.textContent = 'New Job';
    document.getElementById('job-name').value = '';
    document.getElementById('job-cron').value = '';
    document.getElementById('job-enabled').checked = true;
    renderActions('job', []);
    document.getElementById('job-cron-hint').textContent = '';
  }

  panel.classList.remove('hidden');
}

function closeJobEditor() {
  document.getElementById('job-editor').classList.add('hidden');
  editingJobIndex = -1;
}

async function updateCronHint() {
  const expr = document.getElementById('job-cron').value;
  if (expr.trim()) {
    const human = await window.studio.cronToHuman(expr);
    document.getElementById('job-cron-hint').textContent = human;
  } else {
    document.getElementById('job-cron-hint').textContent = '';
  }
}

document.getElementById('job-cron').addEventListener('input', updateCronHint);

document.getElementById('btn-add-job').addEventListener('click', () => openJobEditor(-1));
document.getElementById('btn-close-job-editor').addEventListener('click', closeJobEditor);
document.getElementById('btn-cancel-job').addEventListener('click', closeJobEditor);

document.getElementById('btn-add-job-action').addEventListener('click', () => {
  const acts = collectActions('job-actions-list');
  acts.push({ type: 'notify', params: '' });
  renderActions('job', acts);
});

document.getElementById('btn-save-job').addEventListener('click', async () => {
  const cronExpr = document.getElementById('job-cron').value.trim();
  const human = cronExpr ? await window.studio.cronToHuman(cronExpr) : '';

  const job = {
    name: document.getElementById('job-name').value.trim(),
    cron: cronExpr,
    scheduleHuman: human,
    actions: collectActions('job-actions-list'),
    enabled: document.getElementById('job-enabled').checked,
    lastRun: null,
    nextRun: null,
    status: 'idle',
  };

  if (!job.name) { alert('Job name is required'); return; }

  if (editingJobIndex >= 0) {
    job.lastRun = jobs[editingJobIndex].lastRun;
    job.nextRun = jobs[editingJobIndex].nextRun;
    job.status = jobs[editingJobIndex].status;
    jobs[editingJobIndex] = job;
  } else {
    jobs.push(job);
  }

  await window.studio.saveJobs(jobs);
  closeJobEditor();
  renderJobs();
});

// ── Event Log Tab ───────────────────────────────────────────────────────────

async function loadEventLog() {
  const today = await window.studio.getToday();
  events = await window.studio.loadEventLog(today);
  renderEventLog();
}

function renderEventLog() {
  const list = document.getElementById('event-log-list');
  const empty = document.getElementById('log-empty');

  const typeFilter = document.getElementById('log-filter-type').value;
  const catFilter = document.getElementById('log-filter-category').value;

  let filtered = events;
  if (typeFilter) {
    filtered = filtered.filter(e => (e.type || '').startsWith(typeFilter));
  }
  if (catFilter) {
    filtered = filtered.filter(e => (e.category || '') === catFilter);
  }

  // Newest first
  filtered = filtered.slice().reverse();

  if (filtered.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = filtered.map((ev, i) => {
    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '??:??';
    const cat = badgeCategory(ev.type);
    const payloadStr = ev.payload ? JSON.stringify(ev.payload).substring(0, 80) : '';
    const fullJson = JSON.stringify(ev, null, 2);
    return `
      <div class="event-row" data-event="${i}">
        <div class="event-summary">
          <span class="event-time">${esc(ts)}</span>
          <span class="badge badge-${cat}">${esc(ev.type || 'unknown')}</span>
          <span class="event-source">${esc(ev.source || '')}</span>
          <span class="event-payload-summary">${esc(payloadStr)}</span>
        </div>
        <div class="event-detail">${esc(fullJson)}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.event-row').forEach(row => {
    row.addEventListener('click', () => row.classList.toggle('expanded'));
  });
}

document.getElementById('log-filter-type').addEventListener('change', renderEventLog);
document.getElementById('log-filter-category').addEventListener('change', renderEventLog);

document.getElementById('btn-toggle-pause').addEventListener('click', () => {
  logPaused = !logPaused;
  document.getElementById('btn-toggle-pause').textContent = logPaused ? 'Resume' : 'Pause';
  if (logPaused) stopLogRefresh();
  else startLogRefresh();
});

document.getElementById('btn-refresh-log').addEventListener('click', loadEventLog);

function startLogRefresh() {
  stopLogRefresh();
  if (!logPaused) {
    loadEventLog();
    logRefreshTimer = setInterval(loadEventLog, 5000);
  }
}

function stopLogRefresh() {
  if (logRefreshTimer) {
    clearInterval(logRefreshTimer);
    logRefreshTimer = null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function badgeCategory(type) {
  if (!type) return 'agent';
  if (type.startsWith('ci')) return 'ci';
  if (type.startsWith('pr')) return 'pr';
  if (type.startsWith('issue')) return 'issue';
  if (type.startsWith('deploy')) return 'deploy';
  if (type.startsWith('git')) return 'git';
  return 'agent';
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  await loadRules();
  await loadJobs();
  // Don't auto-load event log unless on that tab
}

init();
