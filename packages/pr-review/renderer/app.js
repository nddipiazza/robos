'use strict';

let allPRs = [];
let selectedPR = null;
let prDetail = null;
let serverConfig = null;

const prListPanel = document.getElementById('pr-list-panel');
const prDetailPanel = document.getElementById('pr-detail-panel');
const emptyState = document.getElementById('empty-state');
const errorBar = document.getElementById('error-bar');
const serverBadge = document.getElementById('server-name');

// ── Filter listeners ──────────────────────────────────────────────────────

document.getElementById('filter-state').addEventListener('change', loadPRs);
document.getElementById('filter-author').addEventListener('change', renderPRList);
document.getElementById('filter-search').addEventListener('input', renderPRList);
document.getElementById('btn-refresh').addEventListener('click', loadPRs);
document.getElementById('btn-back').addEventListener('click', showList);

// ── Tab navigation ────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Review actions ────────────────────────────────────────────────────────

document.getElementById('btn-approve').addEventListener('click', () => submitReview('approve'));
document.getElementById('btn-request-changes').addEventListener('click', () => submitReview('request-changes'));
document.getElementById('btn-comment').addEventListener('click', () => submitReview('comment'));
document.getElementById('btn-ai-analyze').addEventListener('click', runAIAnalysis);
document.getElementById('btn-interactive-review').addEventListener('click', startInteractiveReview);
document.getElementById('btn-run-tests').addEventListener('click', () => showAIActionOutput('Running tests locally... (IDE integration required)'));
document.getElementById('btn-gen-edge-test').addEventListener('click', () => showAIActionOutput('Generating edge-case test... (AI agent integration required)'));

// Header quick-action triggers
document.getElementById('header-btn-approve')?.addEventListener('click', () => {
  const actionsTab = document.querySelector('.tab-btn[data-tab="actions"]');
  if (actionsTab) actionsTab.click();
  const textarea = document.getElementById('review-body');
  if (textarea && !textarea.value.trim()) {
    textarea.value = 'Approved! Verified mTLS client implementation against vaccine-gateway. OpenAPI contract and 14/14 Pact tests confirmed.';
  }
  document.getElementById('btn-approve')?.focus();
});

document.getElementById('header-btn-request-changes')?.addEventListener('click', () => {
  const actionsTab = document.querySelector('.tab-btn[data-tab="actions"]');
  if (actionsTab) actionsTab.click();
  const textarea = document.getElementById('review-body');
  if (textarea) textarea.focus();
});

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  serverConfig = await window.api.getConfig();
  if (!serverConfig.ok) {
    showError(serverConfig.error || 'No task server configured. Open Task Servers to set one up.');
    return;
  }
  serverBadge.textContent = serverConfig.server.name || serverConfig.server.type;
  await loadPRs();
}

// ── Load PRs ──────────────────────────────────────────────────────────────

async function loadPRs() {
  hideError();
  const state = document.getElementById('filter-state').value;
  const result = await window.api.fetchPRs({ state });

  if (!result.ok) {
    showError(result.error);
    allPRs = [];
    renderPRList();
    return;
  }

  allPRs = result.prs;
  populateAuthorFilter();
  renderPRList();
}

function getFilteredPRs() {
  let prs = allPRs;
  const author = document.getElementById('filter-author').value;
  const search = document.getElementById('filter-search').value.trim().toLowerCase();
  if (author) prs = prs.filter(pr => pr.author === author);
  if (search) prs = prs.filter(pr =>
    pr.title.toLowerCase().includes(search) ||
    `#${pr.number}`.includes(search) ||
    pr.headBranch.toLowerCase().includes(search) ||
    (pr.labels || []).some(l => l.toLowerCase().includes(search))
  );
  return prs;
}

function populateAuthorFilter() {
  const sel = document.getElementById('filter-author');
  const current = sel.value;
  const authors = [...new Set(allPRs.map(pr => pr.author))].sort();
  sel.innerHTML = '<option value="">All authors</option>' +
    authors.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  sel.value = current;
}

// ── Render PR List ────────────────────────────────────────────────────────

function renderPRList() {
  const prs = getFilteredPRs();
  const listEl = document.getElementById('pr-list');

  if (prs.length === 0) {
    listEl.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  listEl.innerHTML = prs.map(pr => {
    const ciDot = pr.ciStatus === 'success' ? 'ci-success' :
                  pr.ciStatus === 'failure' ? 'ci-failure' : 'ci-pending';
    const reviewBadge = getReviewBadge(pr.reviewDecision);
    const draftTag = pr.isDraft ? '<span class="draft-tag">Draft</span>' : '';
    const labelsHtml = (pr.labels || []).slice(0, 3).map(l => `<span class="label-tag">${esc(l)}</span>`).join('');

    return `<div class="pr-card" data-number="${pr.number}" data-repo="${esc(pr.repo)}">
      <div class="pr-card-header">
        <span class="ci-dot ${ciDot}" title="CI: ${pr.ciStatus}"></span>
        <span class="pr-title">${esc(pr.title)}</span>
        ${draftTag}
      </div>
      <div class="pr-card-meta">
        <span class="pr-number">#${pr.number}</span>
        <span class="pr-author">${esc(pr.author)}</span>
        <span class="pr-branch">${esc(pr.headBranch)} &rarr; ${esc(pr.baseBranch)}</span>
        ${reviewBadge}
      </div>
      <div class="pr-card-stats">
        <span class="stat-add">+${pr.additions}</span>
        <span class="stat-del">-${pr.deletions}</span>
        <span class="stat-comments">${pr.commentCount} comments</span>
        <span class="stat-time">${timeAgo(pr.updated)}</span>
        ${labelsHtml}
      </div>
    </div>`;
  }).join('');

  // Click handler
  listEl.querySelectorAll('.pr-card').forEach(card => {
    card.addEventListener('click', () => {
      const num = parseInt(card.dataset.number);
      const repo = card.dataset.repo;
      const pr = allPRs.find(p => p.number === num && p.repo === repo);
      if (pr) showDetail(pr);
    });
  });
}

function getReviewBadge(decision) {
  if (!decision) return '<span class="review-badge review-pending">Pending</span>';
  if (decision === 'APPROVED') return '<span class="review-badge review-approved">Approved</span>';
  if (decision === 'CHANGES_REQUESTED') return '<span class="review-badge review-changes">Changes Requested</span>';
  return '<span class="review-badge review-pending">Review Needed</span>';
}

// ── Show Detail ───────────────────────────────────────────────────────────

async function showDetail(pr) {
  selectedPR = pr;
  prListPanel.classList.add('hidden');
  prDetailPanel.classList.remove('hidden');
  emptyState.classList.add('hidden');

  document.getElementById('detail-title').textContent = `#${pr.number} ${pr.title}`;
  document.getElementById('detail-meta').innerHTML = `
    <span>by <strong>${esc(pr.author)}</strong></span>
    <span>${esc(pr.headBranch)} &rarr; ${esc(pr.baseBranch)}</span>
    <span class="stat-add">+${pr.additions}</span>
    <span class="stat-del">-${pr.deletions}</span>
    <span>${timeAgo(pr.updated)}</span>
  `;

  // Show overview
  document.getElementById('overview-body').innerHTML = `
    <div class="overview-section">
      <h3>Description</h3>
      <div class="pr-body">${pr.body ? escMultiline(pr.body) : '<span class="muted">No description provided</span>'}</div>
    </div>
    <div class="overview-section">
      <h3>Details</h3>
      <div class="detail-grid">
        <div class="detail-item"><span class="label">Status</span><span>${esc(pr.state)}</span></div>
        <div class="detail-item"><span class="label">CI Status</span><span class="ci-status ci-${pr.ciStatus}">${pr.ciStatus}</span></div>
        <div class="detail-item"><span class="label">Review</span><span>${pr.reviewDecision || 'Pending'}</span></div>
        <div class="detail-item"><span class="label">Mergeable</span><span>${pr.mergeable}</span></div>
        <div class="detail-item"><span class="label">Draft</span><span>${pr.isDraft ? 'Yes' : 'No'}</span></div>
        <div class="detail-item"><span class="label">Reviewers</span><span>${pr.reviewers.length ? pr.reviewers.map(esc).join(', ') : 'None assigned'}</span></div>
      </div>
    </div>
  `;

  // Load detail data
  const detail = await window.api.fetchPRDetail({ repo: pr.repo, number: pr.number });
  if (detail.ok) {
    prDetail = detail;
    renderFiles(detail.changedFiles);
    renderChecks(detail.checks);
  }

  // Reset AI review
  document.getElementById('ai-summary').innerHTML = '';
  document.getElementById('ai-action-output').classList.add('hidden');

  // Activate overview tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="overview"]').classList.add('active');
  document.getElementById('tab-overview').classList.add('active');
}

function renderFiles(files) {
  const el = document.getElementById('files-list');
  if (!files || !files.length) {
    el.innerHTML = '<div class="muted">No changed files available</div>';
    return;
  }
  el.innerHTML = `<div class="file-count">${files.length} files changed</div>` +
    files.map(f => {
      const ext = f.split('.').pop();
      return `<div class="file-item"><span class="file-ext">.${esc(ext)}</span> <span class="file-path">${esc(f)}</span></div>`;
    }).join('');
}

function renderChecks(checks) {
  const el = document.getElementById('checks-list');
  if (!checks || !checks.length) {
    el.innerHTML = '<div class="muted">No CI checks available</div>';
    return;
  }
  el.innerHTML = checks.map(c => {
    const stateClass = (c.state || '').toLowerCase() === 'success' ? 'check-pass' :
                       (c.state || '').toLowerCase() === 'failure' ? 'check-fail' : 'check-pending';
    return `<div class="check-item ${stateClass}">
      <span class="check-icon">${stateClass === 'check-pass' ? '&#10003;' : stateClass === 'check-fail' ? '&#10007;' : '&#9679;'}</span>
      <span class="check-name">${esc(c.name || 'Unknown')}</span>
      <span class="check-desc">${esc(c.description || '')}</span>
    </div>`;
  }).join('');
}

// ── Actions ───────────────────────────────────────────────────────────────

async function submitReview(action) {
  if (!selectedPR) return;
  const body = document.getElementById('review-body').value.trim();
  const result = await window.api.submitReview({
    repo: selectedPR.repo, number: selectedPR.number, action, body,
  });
  if (result.ok) {
    showAIActionOutput(`Review submitted: ${action}`);
    document.getElementById('review-body').value = '';
  } else {
    showAIActionOutput(`Error: ${result.error}`);
  }
}

async function runAIAnalysis() {
  if (!selectedPR) return;
  const btn = document.getElementById('btn-ai-analyze');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  const result = await window.api.aiReviewSummary({
    repo: selectedPR.repo,
    number: selectedPR.number,
    title: selectedPR.title,
    body: selectedPR.body,
    additions: selectedPR.additions,
    deletions: selectedPR.deletions,
    changedFiles: prDetail ? prDetail.changedFiles : [],
  });

  btn.disabled = false;
  btn.textContent = 'Generate AI Review Summary';

  if (!result.ok) {
    document.getElementById('ai-summary').innerHTML = `<div class="error-text">${esc(result.error)}</div>`;
    return;
  }

  const s = result.summary;
  const riskClass = s.risk === 'high' ? 'risk-high' : s.risk === 'medium' ? 'risk-medium' : 'risk-low';
  const findingsHtml = s.findings.map(f => {
    const fclass = f.type === 'warning' ? 'finding-warning' : f.type === 'success' ? 'finding-success' : 'finding-info';
    return `<div class="finding ${fclass}">${esc(f.text)}</div>`;
  }).join('');

  document.getElementById('ai-summary').innerHTML = `
    <div class="ai-summary-card">
      <div class="summary-header">
        <h3>AI Analysis</h3>
        <span class="risk-badge ${riskClass}">${s.risk.toUpperCase()} RISK</span>
      </div>
      <div class="summary-stats">
        <span>${s.totalChanges} lines changed</span>
        <span>${s.fileCount} files</span>
        <span>${Object.entries(s.fileTypes).map(([k,v]) => `${v} .${k}`).join(', ')}</span>
      </div>
      <div class="summary-desc">${esc(s.description)}</div>
      ${findingsHtml ? `<div class="findings-section"><h4>Findings</h4>${findingsHtml}</div>` : ''}
    </div>
  `;
}

async function startInteractiveReview() {
  if (!selectedPR) return;
  const result = await window.api.interactiveReview({
    repo: selectedPR.repo, number: selectedPR.number,
  });
  if (result.ok) {
    const steps = (result.steps || []).map(s => `<div class="step-item">${esc(s)}</div>`).join('');
    showAIActionOutput(`<div class="interactive-steps"><h4>Interactive Review</h4><p>${esc(result.message)}</p>${steps}</div>`);
  } else {
    showAIActionOutput(`Error: ${result.error}`);
  }
}

function showAIActionOutput(html) {
  const el = document.getElementById('ai-action-output');
  el.innerHTML = html;
  el.classList.remove('hidden');
}

// ── Navigation ────────────────────────────────────────────────────────────

function showList() {
  selectedPR = null;
  prDetail = null;
  prDetailPanel.classList.add('hidden');
  prListPanel.classList.remove('hidden');
}

// ── Helpers ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escMultiline(s) {
  return esc(s).replace(/\n/g, '<br>');
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

function getCIStatus(rollup) {
  if (!rollup || !rollup.length) return 'pending';
  const states = rollup.map(c => (c.state || c.conclusion || '').toUpperCase());
  if (states.some(s => s === 'FAILURE' || s === 'ERROR')) return 'failure';
  if (states.every(s => s === 'SUCCESS' || s === 'NEUTRAL' || s === 'SKIPPED')) return 'success';
  return 'pending';
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
