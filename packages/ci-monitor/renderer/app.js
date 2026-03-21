'use strict';

let allRuns = [];
let selectedRun = null;
let runDetail = null;
let serverConfig = null;

const runListPanel = document.getElementById('run-list-panel');
const runDetailPanel = document.getElementById('run-detail-panel');
const emptyState = document.getElementById('empty-state');
const errorBar = document.getElementById('error-bar');
const serverBadge = document.getElementById('server-name');

// ── Listeners ─────────────────────────────────────────────────────────────

document.getElementById('filter-status').addEventListener('change', loadRuns);
document.getElementById('filter-branch').addEventListener('change', renderRunList);
document.getElementById('filter-search').addEventListener('input', renderRunList);
document.getElementById('btn-refresh').addEventListener('click', loadRuns);
document.getElementById('btn-back').addEventListener('click', showList);
document.getElementById('btn-rerun').addEventListener('click', rerunWorkflow);
document.getElementById('btn-open-gh').addEventListener('click', () => {
  if (selectedRun && selectedRun.url) window.api.openUrl(selectedRun.url);
});
document.getElementById('btn-diagnose').addEventListener('click', runDiagnosis);

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  serverConfig = await window.api.getConfig();
  if (!serverConfig.ok) {
    showError(serverConfig.error || 'No task server configured. Open Task Servers to set one up.');
    return;
  }
  serverBadge.textContent = serverConfig.server.name || serverConfig.server.type;
  await loadRuns();

  // Auto-refresh every 30s
  setInterval(loadRuns, 30000);
}

// ── Load Runs ─────────────────────────────────────────────────────────────

async function loadRuns() {
  hideError();
  const status = document.getElementById('filter-status').value;
  const result = await window.api.fetchRuns({ status: status === 'all' ? undefined : status });

  if (!result.ok) {
    showError(result.error);
    allRuns = [];
    renderRunList();
    return;
  }

  allRuns = result.runs;
  populateBranchFilter();
  renderRunList();
  updateStats();
}

function getFilteredRuns() {
  let runs = allRuns;
  const branch = document.getElementById('filter-branch').value;
  const search = document.getElementById('filter-search').value.trim().toLowerCase();
  if (branch) runs = runs.filter(r => r.branch === branch);
  if (search) runs = runs.filter(r =>
    r.name.toLowerCase().includes(search) ||
    r.branch.toLowerCase().includes(search) ||
    r.workflowName.toLowerCase().includes(search)
  );
  return runs;
}

function populateBranchFilter() {
  const sel = document.getElementById('filter-branch');
  const current = sel.value;
  const branches = [...new Set(allRuns.map(r => r.branch))].sort();
  sel.innerHTML = '<option value="">All branches</option>' +
    branches.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  sel.value = current;
}

function updateStats() {
  const total = allRuns.length;
  const passed = allRuns.filter(r => r.conclusion === 'success').length;
  const failed = allRuns.filter(r => r.conclusion === 'failure').length;
  const running = allRuns.filter(r => r.status === 'in_progress' || r.status === 'queued').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-passed').textContent = passed;
  document.getElementById('stat-failed').textContent = failed;
  document.getElementById('stat-running').textContent = running;
}

// ── Render Run List ───────────────────────────────────────────────────────

function renderRunList() {
  const runs = getFilteredRuns();
  const listEl = document.getElementById('run-list');

  if (runs.length === 0) {
    listEl.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  listEl.innerHTML = runs.map(run => {
    const statusIcon = getStatusIcon(run.status, run.conclusion);
    const statusClass = getStatusClass(run.status, run.conclusion);
    const duration = getDuration(run.created, run.updated);

    return `<div class="run-card ${statusClass}" data-id="${run.id}" data-repo="${esc(run.repo)}">
      <div class="run-card-header">
        <span class="run-status-icon">${statusIcon}</span>
        <span class="run-name">${esc(run.name)}</span>
        <span class="run-workflow">${esc(run.workflowName)}</span>
      </div>
      <div class="run-card-meta">
        <span class="run-branch">${esc(run.branch)}</span>
        <span class="run-event">${esc(run.event)}</span>
        <span class="run-duration">${duration}</span>
        <span class="run-time">${timeAgo(run.updated)}</span>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.run-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      const repo = card.dataset.repo;
      const run = allRuns.find(r => r.id === id && r.repo === repo);
      if (run) showDetail(run);
    });
  });
}

function getStatusIcon(status, conclusion) {
  if (status === 'in_progress' || status === 'queued') return '&#9679;';
  if (conclusion === 'success') return '&#10003;';
  if (conclusion === 'failure') return '&#10007;';
  if (conclusion === 'cancelled') return '&#9676;';
  return '&#8226;';
}

function getStatusClass(status, conclusion) {
  if (status === 'in_progress' || status === 'queued') return 'run-in-progress';
  if (conclusion === 'success') return 'run-success';
  if (conclusion === 'failure') return 'run-failure';
  return 'run-neutral';
}

function getDuration(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

// ── Show Detail ───────────────────────────────────────────────────────────

async function showDetail(run) {
  selectedRun = run;
  runListPanel.classList.add('hidden');
  runDetailPanel.classList.remove('hidden');
  emptyState.classList.add('hidden');

  const statusIcon = getStatusIcon(run.status, run.conclusion);
  document.getElementById('detail-title').innerHTML = `${statusIcon} ${esc(run.name)}`;
  document.getElementById('detail-meta').innerHTML = `
    <span>Workflow: <strong>${esc(run.workflowName)}</strong></span>
    <span>Branch: <strong>${esc(run.branch)}</strong></span>
    <span>Event: ${esc(run.event)}</span>
    <span>${timeAgo(run.updated)}</span>
  `;

  // Reset tabs
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="jobs"]').classList.add('active');
  document.getElementById('tab-jobs').classList.add('active');
  document.getElementById('diagnosis-output').innerHTML = '';

  // Fetch detail
  const detail = await window.api.fetchRunDetail({ repo: run.repo, runId: run.id });
  if (detail.ok) {
    runDetail = detail;
    renderJobs(detail.jobs);
    document.getElementById('log-output').textContent = detail.failedLog || 'No failed log available.';
  } else {
    document.getElementById('jobs-list').innerHTML = `<div class="muted">Failed to load: ${esc(detail.error)}</div>`;
    document.getElementById('log-output').textContent = 'Failed to load log.';
  }
}

function renderJobs(jobs) {
  const el = document.getElementById('jobs-list');
  if (!jobs || !jobs.length) {
    el.innerHTML = '<div class="muted">No job data available</div>';
    return;
  }

  el.innerHTML = jobs.map(job => {
    const icon = getStatusIcon(job.status, job.conclusion);
    const cls = getStatusClass(job.status, job.conclusion);
    const stepsHtml = (job.steps || []).map(s => {
      const sIcon = getStatusIcon(s.status, s.conclusion);
      const sCls = getStatusClass(s.status, s.conclusion);
      return `<div class="step-item ${sCls}"><span>${sIcon}</span> <span>${esc(s.name)}</span></div>`;
    }).join('');

    return `<div class="job-card ${cls}">
      <div class="job-header">
        <span class="job-icon">${icon}</span>
        <span class="job-name">${esc(job.name)}</span>
        <span class="job-status">${esc(job.conclusion || job.status)}</span>
      </div>
      ${stepsHtml ? `<div class="job-steps">${stepsHtml}</div>` : ''}
    </div>`;
  }).join('');
}

// ── Actions ───────────────────────────────────────────────────────────────

async function rerunWorkflow() {
  if (!selectedRun) return;
  const btn = document.getElementById('btn-rerun');
  btn.disabled = true;
  btn.textContent = 'Re-running...';
  const result = await window.api.rerunWorkflow({ repo: selectedRun.repo, runId: selectedRun.id });
  btn.disabled = false;
  btn.textContent = 'Re-run';
  if (!result.ok) showError(result.error);
}

async function runDiagnosis() {
  if (!selectedRun) return;
  const btn = document.getElementById('btn-diagnose');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  const failedLog = runDetail ? runDetail.failedLog : '';
  const failedJob = runDetail?.jobs?.find(j => j.conclusion === 'failure');

  const result = await window.api.aiDiagnoseFailure({
    repo: selectedRun.repo,
    runId: selectedRun.id,
    failedLog,
    jobName: failedJob?.name || '',
  });

  btn.disabled = false;
  btn.textContent = 'Run AI Diagnosis';

  if (!result.ok) {
    document.getElementById('diagnosis-output').innerHTML = `<div class="error-text">${esc(result.error)}</div>`;
    return;
  }

  const d = result.diagnosis;
  const categoryLabel = {
    'test-failure': 'Test Failure',
    'lint-error': 'Lint Error',
    'type-error': 'Type Error',
    'build-failure': 'Build Failure',
    'generic': 'Generic Failure',
    'unknown': 'Unknown',
  }[d.category] || d.category;

  const findingsHtml = d.findings.map(f => {
    const cls = f.type === 'error' ? 'finding-error' : f.type === 'detail' ? 'finding-detail' : 'finding-info';
    return `<div class="finding ${cls}">${esc(f.text)}</div>`;
  }).join('');

  document.getElementById('diagnosis-output').innerHTML = `
    <div class="diagnosis-card">
      <div class="diagnosis-header">
        <h3>AI Diagnosis</h3>
        <span class="category-badge">${esc(categoryLabel)}</span>
        ${d.canAutoFix ? '<span class="autofix-badge">Auto-fixable</span>' : ''}
      </div>
      ${d.jobName ? `<div class="diagnosis-job">Job: ${esc(d.jobName)}</div>` : ''}
      ${findingsHtml}
      <div class="diagnosis-suggestion">
        <h4>Suggested Action</h4>
        <p>${esc(d.suggestedAction)}</p>
      </div>
      ${d.canAutoFix ? '<button class="btn-primary btn-autofix">Apply Auto-Fix (requires AI agent)</button>' : ''}
    </div>
  `;
}

// ── Navigation ────────────────────────────────────────────────────────────

function showList() {
  selectedRun = null;
  runDetail = null;
  runDetailPanel.classList.add('hidden');
  runListPanel.classList.remove('hidden');
}

// ── Helpers ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
}

function hideError() {
  errorBar.classList.add('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────

init();
