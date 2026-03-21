'use strict';

let allDemos = [];
let selectedDemo = null;
let serverConfig = null;

const demoListPanel = document.getElementById('demo-list-panel');
const demoDetailPanel = document.getElementById('demo-detail-panel');
const newDemoPanel = document.getElementById('new-demo-panel');
const emptyState = document.getElementById('empty-state');
const errorBar = document.getElementById('error-bar');
const serverBadge = document.getElementById('server-name');

// ── Listeners ─────────────────────────────────────────────────────────────

document.getElementById('filter-status').addEventListener('change', renderDemoList);
document.getElementById('btn-refresh').addEventListener('click', loadDemos);
document.getElementById('btn-new-demo').addEventListener('click', showNewDemoPanel);
document.getElementById('btn-back').addEventListener('click', showList);
document.getElementById('btn-back-new').addEventListener('click', showList);
document.getElementById('btn-approve-demo').addEventListener('click', () => updateStatus('approved'));
document.getElementById('btn-reject-demo').addEventListener('click', () => updateStatus('rejected'));
document.getElementById('btn-open-pr').addEventListener('click', () => {
  if (selectedDemo && selectedDemo.url) window.api.openUrl(selectedDemo.url);
});

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  serverConfig = await window.api.getConfig();
  if (!serverConfig.ok) {
    showError(serverConfig.error || 'No task server configured. Open Task Servers to set one up.');
    return;
  }
  serverBadge.textContent = serverConfig.server.name || serverConfig.server.type;
  await loadDemos();
}

// ── Load Demos ────────────────────────────────────────────────────────────

async function loadDemos() {
  hideError();
  const result = await window.api.listDemos();
  if (!result.ok) {
    showError(result.error);
    allDemos = [];
  } else {
    allDemos = result.demos.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  }
  renderDemoList();
}

function getFilteredDemos() {
  const status = document.getElementById('filter-status').value;
  if (!status) return allDemos;
  return allDemos.filter(d => d.status === status);
}

// ── Render Demo List ──────────────────────────────────────────────────────

function renderDemoList() {
  const demos = getFilteredDemos();
  const listEl = document.getElementById('demo-list');

  if (demos.length === 0 && allDemos.length === 0) {
    listEl.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  if (demos.length === 0) {
    listEl.innerHTML = '<div class="muted" style="padding:20px">No demos matching filter.</div>';
    return;
  }

  listEl.innerHTML = demos.map(demo => {
    const statusClass = demo.status === 'approved' ? 'status-approved' :
                        demo.status === 'rejected' ? 'status-rejected' : 'status-pending';
    const statusLabel = demo.status === 'pending-review' ? 'Pending Review' :
                        demo.status.charAt(0).toUpperCase() + demo.status.slice(1);

    return `<div class="demo-card" data-id="${esc(demo.id)}">
      <div class="demo-card-header">
        <span class="demo-title">${esc(demo.prTitle)}</span>
        <span class="demo-status ${statusClass}">${esc(statusLabel)}</span>
      </div>
      <div class="demo-card-meta">
        <span class="demo-pr">${esc(demo.repo)} #${demo.prNumber}</span>
        <span class="demo-author">by ${esc(demo.author)}</span>
        <span class="demo-branch">${esc(demo.branch)}</span>
        <span class="demo-time">${timeAgo(demo.generatedAt)}</span>
      </div>
      <div class="demo-card-stats">
        <span class="stat-add">+${demo.additions}</span>
        <span class="stat-del">-${demo.deletions}</span>
        <span>${demo.changedFiles.length} files</span>
        <span>${(demo.walkthrough || []).length} steps</span>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.demo-card').forEach(card => {
    card.addEventListener('click', () => {
      const demo = allDemos.find(d => d.id === card.dataset.id);
      if (demo) showDetail(demo);
    });
  });
}

// ── Show Detail ───────────────────────────────────────────────────────────

function showDetail(demo) {
  selectedDemo = demo;
  demoListPanel.classList.add('hidden');
  newDemoPanel.classList.add('hidden');
  demoDetailPanel.classList.remove('hidden');
  emptyState.classList.add('hidden');

  document.getElementById('detail-title').textContent = demo.prTitle;
  document.getElementById('detail-meta').innerHTML = `
    <span>${esc(demo.repo)} #${demo.prNumber}</span>
    <span>by <strong>${esc(demo.author)}</strong></span>
    <span>${esc(demo.branch)} &rarr; ${esc(demo.baseBranch)}</span>
    <span>+${demo.additions} / -${demo.deletions}</span>
  `;

  const statusLabel = demo.status === 'pending-review' ? 'Pending Review' :
                      demo.status.charAt(0).toUpperCase() + demo.status.slice(1);
  const statusClass = demo.status === 'approved' ? 'status-approved' :
                      demo.status === 'rejected' ? 'status-rejected' : 'status-pending';
  document.getElementById('detail-status-area').innerHTML =
    `<span class="demo-status ${statusClass}">${esc(statusLabel)}</span>`;

  // Render walkthrough steps
  const stepsEl = document.getElementById('walkthrough-steps');
  const steps = demo.walkthrough || [];
  stepsEl.innerHTML = steps.map((step, i) => `
    <div class="walkthrough-step">
      <div class="step-number">${i + 1}</div>
      <div class="step-content">
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.description)}</p>
      </div>
    </div>
  `).join('');

  // Changed files
  const filesEl = document.getElementById('changed-files-list');
  filesEl.innerHTML = (demo.changedFiles || []).map(f =>
    `<div class="file-item"><span class="file-path">${esc(f)}</span></div>`
  ).join('') || '<div class="muted">No file data</div>';
}

// ── New Demo ──────────────────────────────────────────────────────────────

async function showNewDemoPanel() {
  demoListPanel.classList.add('hidden');
  demoDetailPanel.classList.add('hidden');
  emptyState.classList.add('hidden');
  newDemoPanel.classList.remove('hidden');

  const listEl = document.getElementById('merged-prs-list');
  listEl.innerHTML = '<div class="muted">Loading merged PRs...</div>';

  const result = await window.api.fetchMergedPRs();
  if (!result.ok) {
    listEl.innerHTML = `<div class="error-text">${esc(result.error)}</div>`;
    return;
  }

  if (!result.prs.length) {
    listEl.innerHTML = '<div class="muted">No recently merged PRs found.</div>';
    return;
  }

  listEl.innerHTML = result.prs.map(pr => `
    <div class="pr-pick-card" data-repo="${esc(pr.repo)}" data-number="${pr.number}">
      <div class="pr-pick-title">${esc(pr.title)}</div>
      <div class="pr-pick-meta">
        <span>${esc(pr.repo)} #${pr.number}</span>
        <span>by ${esc(pr.author)}</span>
        <span>${esc(pr.branch)}</span>
        <span>${timeAgo(pr.mergedAt)}</span>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.pr-pick-card').forEach(card => {
    card.addEventListener('click', async () => {
      card.style.opacity = '0.5';
      card.style.pointerEvents = 'none';
      const result = await window.api.generateDemo({
        repo: card.dataset.repo,
        prNumber: parseInt(card.dataset.number),
      });
      if (result.ok) {
        allDemos.unshift(result.demo);
        showDetail(result.demo);
      } else {
        showError(result.error);
        card.style.opacity = '1';
        card.style.pointerEvents = '';
      }
    });
  });
}

// ── Status Update ─────────────────────────────────────────────────────────

async function updateStatus(status) {
  if (!selectedDemo) return;
  const result = await window.api.updateDemoStatus({ demoId: selectedDemo.id, status });
  if (result.ok) {
    selectedDemo.status = status;
    showDetail(selectedDemo);
    // Update in list too
    const idx = allDemos.findIndex(d => d.id === selectedDemo.id);
    if (idx >= 0) allDemos[idx].status = status;
  } else {
    showError(result.error);
  }
}

// ── Navigation ────────────────────────────────────────────────────────────

function showList() {
  selectedDemo = null;
  demoDetailPanel.classList.add('hidden');
  newDemoPanel.classList.add('hidden');
  demoListPanel.classList.remove('hidden');
  renderDemoList();
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
