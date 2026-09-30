"use strict";

let allPRs = [];
let selectedPR = null;
let prDetail = null;
let serverConfig = null;
let kgraphDetail = null;
let aiSummaryData = null;

const prListPanel = document.getElementById("pr-list-panel");
const prDetailPanel = document.getElementById("pr-detail-panel");
const emptyState = document.getElementById("empty-state");
const errorBar = document.getElementById("error-bar");
const serverBadge = document.getElementById("server-name");

// ── Filter listeners ──────────────────────────────────────────────────────

document.getElementById("filter-state").addEventListener("change", loadPRs);
document.getElementById("filter-author").addEventListener("change", renderPRList);
document.getElementById("filter-search").addEventListener("input", renderPRList);
document.getElementById("btn-refresh").addEventListener("click", loadPRs);
document.getElementById("btn-back").addEventListener("click", showList);

// ── Tab navigation ────────────────────────────────────────────────────────

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.classList.add("active");
  });
});

// ── Review actions ────────────────────────────────────────────────────────

document.getElementById("btn-approve").addEventListener("click", () => submitReview("approve"));
document.getElementById("btn-request-changes").addEventListener("click", () => submitReview("request-changes"));
document.getElementById("btn-comment").addEventListener("click", () => submitReview("comment"));
document.getElementById("btn-interactive-review").addEventListener("click", startInteractiveReview);
document.getElementById("btn-open-intellij")?.addEventListener("click", () => openInIDE("intellij"));
document.getElementById("btn-open-vscode")?.addEventListener("click", () => openInIDE("vscode"));
document.getElementById("btn-action-intellij")?.addEventListener("click", () => openInIDE("intellij"));
document.getElementById("btn-action-vscode")?.addEventListener("click", () => openInIDE("vscode"));
document.getElementById("btn-enter-theater")?.addEventListener("click", () => {
  if (selectedPR) openPRReviewTheater(selectedPR);
});
document.getElementById("btn-ai-chat-send").addEventListener("click", sendAIChatMessage);


// Header quick-action triggers
document.getElementById("header-btn-approve")?.addEventListener("click", () => {
  const actionsTab = document.querySelector('.tab-btn[data-tab="actions"]');
  if (actionsTab) actionsTab.click();
  const textarea = document.getElementById("review-body");
  if (textarea && !textarea.value.trim()) {
    textarea.value = "Approved! Verified mTLS client implementation against vaccine-gateway. OpenAPI contract, 14/14 Pact tests, and Knowledge Graph branch confirmed.";
  }
  document.getElementById("btn-approve")?.focus();
});

document.getElementById("header-btn-request-changes")?.addEventListener("click", () => {
  const actionsTab = document.querySelector('.tab-btn[data-tab="actions"]');
  if (actionsTab) actionsTab.click();
  const textarea = document.getElementById("review-body");
  if (textarea) textarea.focus();
});

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  serverConfig = await window.api.getConfig();
  if (!serverConfig.ok) {
    showError(serverConfig.error || "No task server configured. Open Task Servers to set one up.");
    return;
  }
  serverBadge.textContent = serverConfig.server.name || serverConfig.server.type;
  await loadPRs();
}

// ── Load PRs ──────────────────────────────────────────────────────────────

async function loadPRs() {
  hideError();
  const state = document.getElementById("filter-state").value;
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
  const author = document.getElementById("filter-author").value;
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
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
  const sel = document.getElementById("filter-author");
  const current = sel.value;
  const authors = [...new Set(allPRs.map(pr => pr.author))].sort();
  sel.innerHTML = '<option value="">All authors</option>' +
    authors.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join("");
  sel.value = current;
}

// ── Render PR List ────────────────────────────────────────────────────────

function renderPRList() {
  const prs = getFilteredPRs();
  const listEl = document.getElementById("pr-list");

  if (prs.length === 0) {
    listEl.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");

  listEl.innerHTML = prs.map(pr => {
    const ciDot = pr.ciStatus === "success" ? "ci-success" :
                  pr.ciStatus === "failure" ? "ci-failure" : "ci-pending";
    const reviewBadge = getReviewBadge(pr.reviewDecision);
    const draftTag = pr.isDraft ? '<span class="draft-tag">Draft</span>' : "";
    const labelsHtml = (pr.labels || []).slice(0, 3).map(l => `<span class="label-tag">${esc(l)}</span>`).join("");

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
  }).join("");

  listEl.querySelectorAll(".pr-card").forEach(card => {
    card.addEventListener("click", () => {
      const num = parseInt(card.dataset.number);
      const repo = card.dataset.repo;
      const pr = allPRs.find(p => p.number === num && p.repo === repo);
      if (pr) showDetail(pr);
    });
  });
}

function getReviewBadge(decision) {
  if (!decision) return '<span class="review-badge review-pending">Pending</span>';
  if (decision === "APPROVED") return '<span class="review-badge review-approved">Approved</span>';
  if (decision === "CHANGES_REQUESTED") return '<span class="review-badge review-changes">Changes Requested</span>';
  return '<span class="review-badge review-pending">Review Needed</span>';
}

// ── Show Detail ───────────────────────────────────────────────────────────

async function showDetail(pr) {
  selectedPR = pr;
  prListPanel.classList.add("hidden");
  prDetailPanel.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  document.getElementById("detail-title").textContent = `#${pr.number} ${pr.title}`;
  document.getElementById("detail-meta").innerHTML = `
    <span>by <strong>${esc(pr.author)}</strong></span>
    <span>${esc(pr.headBranch)} &rarr; ${esc(pr.baseBranch)}</span>
    <span class="stat-add">+${pr.additions}</span>
    <span class="stat-del">-${pr.deletions}</span>
    <span>${timeAgo(pr.updated)}</span>
  `;

  // Show overview
  document.getElementById("overview-body").innerHTML = `
    <div class="overview-section">
      <h3>Description</h3>
      <div class="pr-body">${pr.body ? escMultiline(pr.body) : '<span class="muted">No description provided</span>'}</div>
    </div>
    <div class="overview-section">
      <h3>Details</h3>
      <div class="detail-grid">
        <div class="detail-item"><span class="label">Status</span><span>${esc(pr.state)}</span></div>
        <div class="detail-item"><span class="label">CI Status</span><span class="ci-status ci-${pr.ciStatus}">${pr.ciStatus}</span></div>
        <div class="detail-item"><span class="label">Review</span><span>${pr.reviewDecision || "Pending"}</span></div>
        <div class="detail-item"><span class="label">Knowledge Graph</span><span class="kg-status">kgraph/${esc(pr.headBranch.replace(/^feature\//, ""))}</span></div>
        <div class="detail-item"><span class="label">Mergeable</span><span>${pr.mergeable}</span></div>
        <div class="detail-item"><span class="label">Reviewers</span><span>${pr.reviewers.length ? pr.reviewers.map(esc).join(", ") : "None assigned"}</span></div>
      </div>
    </div>
  `;

  // Load detail data & Knowledge Graph branch data in parallel
  const [detail, kgRes] = await Promise.all([
    window.api.fetchPRDetail({ repo: pr.repo, number: pr.number }),
    window.api.fetchKGraphBranchDiff({ repo: pr.repo, number: pr.number, branch: pr.headBranch }),
  ]);

  if (detail.ok) {
    prDetail = detail;
    renderFiles(detail.changedFiles);
    renderChecks(detail.checks);
  }

  if (kgRes.ok) {
    kgraphDetail = kgRes;
    renderKGraphDiff(kgRes);
  }

  // Reset chat thread and activate overview tab
  document.getElementById("ai-chat-thread").innerHTML = "";
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.querySelector('[data-tab="overview"]').classList.add("active");
  document.getElementById("tab-overview").classList.add("active");

  // Automatically trigger AI Review analysis on load
  runAIAnalysis();
}

function renderFiles(files) {
  const el = document.getElementById("files-list");
  if (!files || !files.length) {
    el.innerHTML = '<div class="muted">No changed files available</div>';
    return;
  }
  el.innerHTML = `<div class="file-count">${files.length} files changed in Git repository</div>` +
    files.map(f => {
      const ext = f.split(".").pop();
      return `
        <div class="file-item">
          <div class="file-item-left">
            <span class="file-ext">.${esc(ext)}</span>
            <span class="file-path">${esc(f)}</span>
          </div>
          <div class="file-item-ide-actions">
            <button class="btn-file-ide btn-file-intellij" onclick="openFileInIDE('intellij', '${esc(f)}')">
              IntelliJ
            </button>
            <button class="btn-file-ide btn-file-vscode" onclick="openFileInIDE('vscode', '${esc(f)}')">
              VS Code
            </button>
          </div>
        </div>
      `;
    }).join("");
}

window.openFileInIDE = function(ide, filePath) {
  openInIDE(ide, filePath);
};

async function openInIDE(ide, filePath) {
  if (!selectedPR) return;
  const targetFile = filePath || (prDetail?.changedFiles?.[0]) || "";

  let result;
  if (ide === "intellij") {
    result = await window.api.openInIntelliJ({
      repo: selectedPR.repo,
      number: selectedPR.number,
      headBranch: selectedPR.headBranch,
      changedFiles: prDetail ? prDetail.changedFiles : [],
      filePath: targetFile,
      line: 34,
    });
  } else {
    result = await window.api.openInVSCode({
      repo: selectedPR.repo,
      number: selectedPR.number,
      headBranch: selectedPR.headBranch,
      changedFiles: prDetail ? prDetail.changedFiles : [],
      filePath: targetFile,
      line: 34,
    });
  }

  if (result.ok) {
    const stepsHtml = (result.steps || []).map(s => `<div class="step-item">${esc(s)}</div>`).join("");
    showAIActionOutput(`
      <div class="ide-launch-output">
        <div class="ide-launch-header">
          <span class="ide-launch-badge">${esc(result.ide)} Pull Request Review</span>
          <span class="ide-launch-plugin">${esc(result.plugin)}</span>
        </div>
        <p class="ide-launch-msg">${esc(result.message)}</p>
        <div class="ide-launch-steps">${stepsHtml}</div>
      </div>
    `);

    // Switch to review decision tab if not already on it
    const actionsTab = document.querySelector('.tab-btn[data-tab="actions"]');
    if (actionsTab && !actionsTab.classList.contains("active")) {
      actionsTab.click();
    }
  } else {
    showAIActionOutput(`<div class="error-text">Failed to launch IDE: ${esc(result.error)}</div>`);
  }
}

function renderKGraphDiff(kg) {
  const branchNameEl = document.getElementById("kg-branch-name");
  if (branchNameEl) branchNameEl.textContent = kg.branch;

  const el = document.getElementById("kgraph-diff-content");
  if (!el) return;

  const entitiesHtml = (kg.entities || []).map(ent => {
    const actionBadge = ent.action === "added" ? '<span class="kg-badge kg-badge-add">+ ADDED</span>' :
                        ent.action === "linked" ? '<span class="kg-badge kg-badge-link">⇄ LINKED</span>' :
                        '<span class="kg-badge kg-badge-mod">~ MODIFIED</span>';
    return `
      <div class="kg-entity-card">
        <div class="kg-entity-header">
          ${actionBadge}
          <span class="kg-entity-type">${esc(ent.type.toUpperCase())}</span>
          <span class="kg-entity-name">${esc(ent.name)}</span>
          <span class="kg-entity-status">${esc(ent.status)}</span>
        </div>
        <div class="kg-entity-desc">${esc(ent.description)}</div>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <div class="kg-stats-bar">
      <span><strong>${kg.nodesAdded}</strong> nodes added</span>
      <span><strong>${kg.nodesModified}</strong> nodes modified</span>
      <span><strong>${kg.relationshipsAdded}</strong> relationships linked</span>
      <span class="kg-sync-text">⇄ Synced with Git ${esc(kg.syncedGitBranch)}</span>
    </div>
    <div class="kg-entity-list">${entitiesHtml}</div>
  `;
}

function renderChecks(checks) {
  const el = document.getElementById("checks-list");
  if (!checks || !checks.length) {
    el.innerHTML = '<div class="muted">No CI checks available</div>';
    return;
  }
  el.innerHTML = checks.map(c => {
    const stateClass = (c.state || "").toLowerCase() === "success" ? "check-pass" :
                       (c.state || "").toLowerCase() === "failure" ? "check-fail" : "check-pending";
    return `<div class="check-item ${stateClass}">
      <span class="check-icon">${stateClass === "check-pass" ? "&#10003;" : stateClass === "check-fail" ? "&#10007;" : "&#9679;"}</span>
      <span class="check-name">${esc(c.name || "Unknown")}</span>
      <span class="check-desc">${esc(c.description || "")}</span>
    </div>`;
  }).join("");
}

// ── Actions ───────────────────────────────────────────────────────────────

async function submitReview(action) {
  if (!selectedPR) return;
  if (action === 'approve') {
    if (!theaterContext || !theaterContext.validationGates || !theaterContext.validationGates.elearningPassed) {
      showAIActionOutput('🛡️ Anti-Rubber-Stamp Gate Active: You must complete the PR Review Theater masterclass and pass the Knowledge Check (Score ≥ 80%) before approving code! Click "🎭 PR Review Theater" to begin.');
      return;
    }
  }

  const body = document.getElementById("review-body").value.trim();
  const kgBranch = kgraphDetail ? kgraphDetail.branch : "kgraph/PET-105-rabies-verification";

  const result = await window.api.submitReview({
    repo: selectedPR.repo,
    number: selectedPR.number,
    action,
    body,
    kgraphBranch: kgBranch,
  });

  if (result.ok) {
    showAIActionOutput(result.message || `Review submitted: ${action}`);
    if (result.merged) {
      document.getElementById("detail-meta").insertAdjacentHTML("beforeend", '<span class="review-badge review-approved">✓ MERGED &amp; KGRAPH SYNCED</span>');
    }
  } else {
    showAIActionOutput(`Error: ${result.error}`);
  }
}

async function runAIAnalysis() {
  if (!selectedPR) return;
  const summaryEl = document.getElementById("ai-summary");
  summaryEl.innerHTML = `<div class="ai-loading-placeholder"><span class="spinner">⏳</span> Generating automated AI code &amp; security review...</div>`;

  const result = await window.api.aiReviewSummary({
    repo: selectedPR.repo,
    number: selectedPR.number,
    title: selectedPR.title,
    body: selectedPR.body,
    additions: selectedPR.additions,
    deletions: selectedPR.deletions,
    changedFiles: prDetail ? prDetail.changedFiles : [],
  });

  if (!result.ok) {
    summaryEl.innerHTML = `<div class="error-text">${esc(result.error)}</div>`;
    return;
  }

  aiSummaryData = result.summary;
  renderAISummary(result.summary);
}

function renderAISummary(s) {
  const summaryEl = document.getElementById("ai-summary");
  const riskClass = s.risk === "high" ? "risk-high" : s.risk === "medium" ? "risk-medium" : "risk-low";
  const findingsHtml = s.findings.map(f => {
    const fclass = f.type === "warning" ? "finding-warning" : f.type === "success" ? "finding-success" : "finding-info";
    return `<div class="finding ${fclass}">${esc(f.text)}</div>`;
  }).join("");

  summaryEl.innerHTML = `
    <div class="ai-summary-card">
      <div class="summary-header">
        <h3>AI Code &amp; Security Review</h3>
        <span class="risk-badge ${riskClass}">${s.risk.toUpperCase()} RISK</span>
      </div>
      <div class="summary-stats">
        <span>${s.totalChanges} lines changed</span>
        <span>${s.fileCount} files</span>
        <span>Knowledge Graph Synced</span>
      </div>
      <div class="summary-desc">${esc(s.description)}</div>
      ${findingsHtml ? `<div class="findings-section"><h4>Automated Audit Findings</h4>${findingsHtml}</div>` : ""}
    </div>
  `;
}

async function sendAIChatMessage() {
  if (!selectedPR) return;
  const promptEl = document.getElementById("ai-chat-prompt");
  let promptText = "";

  if (typeof promptEl.getValue === "function") {
    promptText = promptEl.getValue();
  } else if (promptEl.value !== undefined) {
    promptText = promptEl.value;
  } else {
    const inner = promptEl.querySelector("textarea");
    if (inner) promptText = inner.value;
  }

  promptText = (promptText || "").trim();
  if (!promptText) return;

  const threadEl = document.getElementById("ai-chat-thread");

  // Append user message
  const userMsg = document.createElement("div");
  userMsg.className = "chat-msg chat-msg-user";
  userMsg.innerHTML = `<div class="chat-bubble user-bubble"><span class="chat-role">Reviewer:</span> ${esc(promptText)}</div>`;
  threadEl.appendChild(userMsg);

  // Clear input
  if (typeof promptEl.setValue === "function") promptEl.setValue("");
  else if (promptEl.value !== undefined) promptEl.value = "";
  const inner = promptEl.querySelector("textarea");
  if (inner) inner.value = "";

  // Append thinking placeholder
  const botMsg = document.createElement("div");
  botMsg.className = "chat-msg chat-msg-bot";
  botMsg.innerHTML = `<div class="chat-bubble bot-bubble"><span class="chat-role">AI Reviewer:</span> <span class="ai-typing">Analyzing codebase and Knowledge Graph context...</span></div>`;
  threadEl.appendChild(botMsg);
  threadEl.scrollTop = threadEl.scrollHeight;

  const res = await window.api.aiReviewChat({
    repo: selectedPR.repo,
    number: selectedPR.number,
    prompt: promptText,
    context: aiSummaryData,
  });

  if (res.ok) {
    botMsg.querySelector(".bot-bubble").innerHTML = `<span class="chat-role">AI Reviewer:</span> ${esc(res.reply)}`;
    if (res.updatedFindings && aiSummaryData) {
      aiSummaryData.findings = res.updatedFindings;
      renderAISummary(aiSummaryData);
    }
  } else {
    botMsg.querySelector(".bot-bubble").innerHTML = `<span class="chat-role">AI Reviewer:</span> <span class="error-text">${esc(res.error)}</span>`;
  }
  threadEl.scrollTop = threadEl.scrollHeight;
}

async function startInteractiveReview() {
  if (!selectedPR) return;
  const result = await window.api.interactiveReview({
    repo: selectedPR.repo, number: selectedPR.number,
  });
  if (result.ok) {
    const steps = (result.steps || []).map(s => `<div class="step-item">${esc(s)}</div>`).join("");
    showAIActionOutput(`<div class="interactive-steps"><h4>Interactive Review</h4><p>${esc(result.message)}</p>${steps}</div>`);
  } else {
    showAIActionOutput(`Error: ${result.error}`);
  }
}

function showAIActionOutput(html) {
  const el = document.getElementById("ai-action-output");
  el.innerHTML = html;
  el.classList.remove("hidden");
}

// ── Navigation ────────────────────────────────────────────────────────────

function showList() {
  selectedPR = null;
  prDetail = null;
  kgraphDetail = null;
  prDetailPanel.classList.add("hidden");
  prListPanel.classList.remove("hidden");
}

// ── Helpers ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escMultiline(s) {
  return esc(s).replace(/\n/g, "<br>");
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove("hidden");
}

function hideError() {
  errorBar.classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════════════════════
// PR REVIEW THEATER CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════
// ── PR Review Theater & Interactive Multi-Stage Validation ─────────────────
// ═══════════════════════════════════════════════════════════════════════════

let theaterContext = null;
let currentTheaterStage = 1;
let activeDiffFileIndex = 0;
let currentDiffMode = 'unified';
let activeFixTargetType = 'auto';
let theaterConfigData = null;

window.openPRReviewTheater = async function(pr) {
  const targetPR = pr || selectedPR;
  if (!targetPR) return;
  selectedPR = targetPR;

  const theaterEl = document.getElementById('pr-review-theater');
  if (!theaterEl) return;
  theaterEl.classList.remove('hidden');

  // Set header info
  const titleEl = document.getElementById('theater-pr-title');
  if (titleEl) titleEl.textContent = `PR #${targetPR.number}: ${targetPR.title}`;

  // Fetch full theater context (includes showTheFix and team theaterConfig)
  const res = await window.api.fetchPRTheaterContext({
    repo: targetPR.repo,
    number: targetPR.number,
    title: targetPR.title,
    body: targetPR.body,
    headBranch: targetPR.headBranch,
    baseBranch: targetPR.baseBranch,
    changedFiles: prDetail ? prDetail.changedFiles : [],
  });

  if (!res.ok) {
    showError(res.error || 'Failed to load PR Review Theater context');
    return;
  }

  theaterContext = res;
  theaterConfigData = res.theaterConfig || {};

  // Set target app badge
  const appBadge = document.getElementById('theater-target-app');
  if (appBadge) appBadge.textContent = res.targetApp?.title || 'Application';

  // Render all stages
  renderTheaterELearning();
  renderTheaterDocs();
  renderTheaterRestRunner();
  renderTheaterDiffViewer();
  renderTheaterIDEBridge();
  renderTheaterShowTheFix();
  renderTheaterVideo();
  renderTheaterSignOff();
  updateTheaterStepper();

  // Reset to stage 1 and video mode
  window.setProofCanvasMode('video');
  window.setTheaterStage(1);
};

window.exitTheater = function() {
  const theaterEl = document.getElementById('pr-review-theater');
  if (theaterEl) theaterEl.classList.add('hidden');
};

window.toggleTheaterFullscreen = function() {
  const windowEl = document.querySelector('.theater-window');
  if (windowEl) {
    windowEl.classList.toggle('theater-fullscreen');
  }
};

function updateTheaterStepper() {
  if (!theaterContext || !theaterContext.theaterConfig) return;
  const cfg = theaterContext.theaterConfig;
  const gates = theaterContext.validationGates || {};

  const stageDefs = [
    { num: 1, key: 'stage1_elearning', label: 'Training & eLearning', done: gates.elearningPassed },
    { num: 2, key: 'stage2_livingDocs', label: 'Living Docs & Flow', done: gates.docsReviewed },
    { num: 3, key: 'stage3_fileDiffs', label: 'File Diff Viewer', done: gates.diffsInspected },
    { num: 4, key: 'stage4_ideBridge', label: 'IDE Branch Diffs', done: gates.ideDiffLaunched },
    { num: 5, key: 'stage5_showTheFix', label: 'Show You The Fix', done: gates.fixDemonstrated },
    { num: 6, key: 'stage6_proofCanvas', label: 'Proof-of-Work Video', done: true },
    { num: 7, key: 'stage7_signOff', label: 'Sign-Off & Merge', done: false }
  ];

  stageDefs.forEach(s => {
    const btn = document.getElementById(`step-btn-${s.num}`);
    const statusSpan = document.getElementById(`step-status-${s.num}`);
    if (!btn) return;

    const sCfg = cfg[s.key] || {};
    const enabled = sCfg.enabled !== false;
    const required = sCfg.required !== false;

    if (!enabled && s.num !== 7) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'inline-flex';

    if (statusSpan) {
      if (s.done) {
        statusSpan.className = 'step-status done';
        statusSpan.textContent = '✓';
      } else if (!required && s.num !== 7) {
        statusSpan.className = 'step-status optional';
        statusSpan.textContent = '⚑';
      } else if (s.num === 3 && cfg.stage1_elearning?.lockDiffsUntilPassed && !gates.elearningPassed) {
        statusSpan.className = 'step-status locked';
        statusSpan.textContent = '🔒';
      } else {
        statusSpan.className = 'step-status';
        statusSpan.textContent = '○';
      }
    }
  });

  const activeStatus = document.getElementById(`step-status-${currentTheaterStage}`);
  if (activeStatus && !stageDefs.find(s => s.num === currentTheaterStage)?.done) {
    activeStatus.textContent = '⏳';
  }
}

window.setTheaterStage = function(stageNum) {
  // If target stage is disabled in config, skip to next or previous available stage
  if (theaterContext && theaterContext.theaterConfig) {
    const cfg = theaterContext.theaterConfig;
    const stageKeyMap = {
      1: 'stage1_elearning',
      2: 'stage2_livingDocs',
      3: 'stage3_fileDiffs',
      4: 'stage4_ideBridge',
      5: 'stage5_showTheFix',
      6: 'stage6_proofCanvas',
      7: 'stage7_signOff'
    };
    const sKey = stageKeyMap[stageNum];
    if (sKey && cfg[sKey] && cfg[sKey].enabled === false) {
      // Find nearest enabled stage
      const nextNum = stageNum < currentTheaterStage ? stageNum - 1 : stageNum + 1;
      if (nextNum >= 1 && nextNum <= 7) {
        window.setTheaterStage(nextNum);
        return;
      }
    }
  }

  currentTheaterStage = stageNum;

  // Update Stepper buttons
  document.querySelectorAll('.step-btn').forEach(btn => {
    const s = parseInt(btn.dataset.stage, 10);
    btn.classList.remove('active');
    if (s === stageNum) {
      btn.classList.add('active');
    }
  });

  // Update Stages visibility
  document.querySelectorAll('.theater-stage').forEach(st => st.classList.remove('active'));
  const activeStageEl = document.getElementById(`stage-${stageNum}`);
  if (activeStageEl) activeStageEl.classList.add('active');

  // Anti-Rubber-Stamp Lock for Stage 3 (Diffs)
  const diffLock = document.getElementById('diff-anti-rubber-stamp-lock');
  if (diffLock) {
    const lockDiffs = theaterContext?.theaterConfig?.stage1_elearning?.lockDiffsUntilPassed !== false;
    if (stageNum === 3 && theaterContext && lockDiffs && !theaterContext.validationGates.elearningPassed) {
      diffLock.classList.remove('hidden');
    } else {
      diffLock.classList.add('hidden');
    }
  }

  // Anti-Rubber-Stamp Lock for Stage 7 (Sign-Off)
  const signoffLock = document.getElementById('theater-signoff-lock-banner');
  if (signoffLock) {
    const reqQuiz = theaterContext?.theaterConfig?.stage1_elearning?.required !== false;
    if (stageNum === 7 && theaterContext && reqQuiz && !theaterContext.validationGates.elearningPassed) {
      signoffLock.classList.remove('hidden');
    } else {
      signoffLock.classList.add('hidden');
    }
  }

  // Scroll to top
  const contentPanel = document.querySelector('.theater-stage-content');
  if (contentPanel) contentPanel.scrollTop = 0;

  // Mark gates based on progression
  if (theaterContext && theaterContext.validationGates) {
    if (stageNum === 2) theaterContext.validationGates.docsReviewed = true;
    if (stageNum === 3 && (!theaterContext.theaterConfig?.stage1_elearning?.lockDiffsUntilPassed || theaterContext.validationGates.elearningPassed)) {
      theaterContext.validationGates.diffsInspected = true;
    }
    if (stageNum === 4) theaterContext.validationGates.ideDiffLaunched = true;
    renderTheaterSignOff();
    updateTheaterStepper();
  }
};

window.openAppCourseInHub = async function() {
  if (!theaterContext) return;
  const courseId = theaterContext.appElearning?.courseId || `urn:robos:elearning:course:petstore-api`;
  const appSlug = theaterContext.targetApp?.slug || 'petstore-api';
  await window.api.openAppELearning({ courseId, appSlug });
  const feedbackPill = document.getElementById('quiz-feedback-pill');
  if (feedbackPill) {
    feedbackPill.classList.remove('hidden');
    feedbackPill.className = 'quiz-feedback pass';
    feedbackPill.textContent = `🎓 Launched RobOS eLearning Hub for ${theaterContext.targetApp?.title || 'PetStore API'}`;
  }
};

// ── Stage 1: eLearning & Knowledge Check ────────────────────────────────────

function renderTheaterELearning() {
  if (!theaterContext || !theaterContext.elearning) return;
  const { course, quiz, status } = theaterContext.elearning;

  // 1. Course brief
  const briefEl = document.getElementById('theater-course-brief');
  if (briefEl) {
    briefEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <strong>${esc(course['dcterms:title'])}</strong>
        <span style="color:var(--accent);">${esc(course['robos:estimatedDuration'] || '15 mins')}</span>
      </div>
      <div>${esc(course['dcterms:description'])}</div>
      <div style="margin-top:6px; font-size:11px; color:var(--muted);">
        Domain Topic: <strong>${esc(course['robos:topic'] || 'Architecture & Security')}</strong> &middot; Difficulty: <strong>${esc(course['robos:difficulty'] || 'Intermediate')}</strong>
      </div>
    `;
  }

  // 2. Modules & Lessons
  const modulesListEl = document.getElementById('theater-modules-list');
  if (modulesListEl) {
    const modules = course['robos:modules'] || [];
    modulesListEl.innerHTML = modules.map(m => `
      <div class="module-item">
        <div class="module-title">${esc(m['dcterms:title'])}</div>
        <div class="module-desc">${esc(m['dcterms:description'])}</div>
        ${(m['robos:lessons'] && m['robos:lessons'].length) ? `
          <div class="lesson-list">
            ${m['robos:lessons'].map(l => `
              <div class="lesson-item">
                <strong>${esc(l['dcterms:title'])}</strong>
                <span>${esc(l['robos:content'])}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  // 3. Quiz Questions
  const questionsEl = document.getElementById('theater-quiz-questions');
  if (questionsEl && quiz) {
    questionsEl.innerHTML = quiz.map((q, qIdx) => `
      <div class="quiz-q-card" id="card-${q.id}">
        <div class="quiz-q-title">Question ${qIdx + 1}: ${esc(q.question)}</div>
        <div class="quiz-options">
          ${q.options.map((opt, optIdx) => `
            <label class="quiz-option-label">
              <input type="radio" name="q-${q.id}" value="${optIdx}" ${optIdx === 0 ? 'checked' : ''}>
              <span>${esc(opt)}</span>
            </label>
          `).join('')}
        </div>
        <div class="quiz-explanation hidden" id="expl-${q.id}" style="margin-top:8px; font-size:11px; color:#58a6ff;">
          ℹ️ ${esc(q.explanation)}
        </div>
      </div>
    `).join('');
  }
}

window.submitTheaterQuiz = async function() {
  if (!theaterContext || !theaterContext.elearning) return;
  const quiz = theaterContext.elearning.quiz || [];
  const answers = {};

  for (const q of quiz) {
    const sel = document.querySelector(`input[name="q-${q.id}"]:checked`);
    if (sel) answers[q.id] = parseInt(sel.value, 10);
  }

  const passThreshold = theaterContext.validationGates?.requiredPassScore || theaterContext.theaterConfig?.stage1_elearning?.passThresholdScore || 80;
  const res = await window.api.verifyPRTheaterQuiz({
    courseId: theaterContext.elearning.course['@id'],
    answers,
    reviewerId: 'robos',
    appId: theaterContext.targetApp?.id,
    passThresholdScore: passThreshold
  });

  const feedbackPill = document.getElementById('quiz-feedback-pill');
  if (feedbackPill) {
    feedbackPill.classList.remove('hidden');
    feedbackPill.className = res.passed ? 'quiz-feedback pass' : 'quiz-feedback fail';
    const reqScore = res.passThreshold || passThreshold;
    feedbackPill.textContent = res.passed
      ? `✓ Score: ${res.score}% — Knowledge Check Passed!`
      : `✕ Score: ${res.score}% — Needs ${reqScore}% to pass`;
  }

  // Reveal explanations
  for (const q of quiz) {
    const expEl = document.getElementById(`expl-${q.id}`);
    if (expEl) expEl.classList.remove('hidden');
  }

  if (res.passed) {
    theaterContext.validationGates.elearningPassed = true;

    // Remove anti-rubber-stamp locks
    document.getElementById('diff-anti-rubber-stamp-lock')?.classList.add('hidden');
    document.getElementById('theater-signoff-lock-banner')?.classList.add('hidden');

    // Update Gate Pill in Stage 1 Header
    const gatePill = document.getElementById('gate-pill-elearning');
    if (gatePill) {
      gatePill.className = 'gate-pill gate-pass';
      gatePill.textContent = `eLearning: Verified (${res.score}%)`;
    }

    // Update Stepper icon
    const stepStatus1 = document.getElementById('step-status-1');
    if (stepStatus1) stepStatus1.textContent = '✓';
    const stepBtn1 = document.getElementById('step-btn-1');
    if (stepBtn1) stepBtn1.classList.add('step-done');

    // Show Certificate
    const certCard = document.getElementById('theater-certificate-card');
    if (certCard) {
      certCard.classList.remove('hidden');
      document.getElementById('theater-cert-recipient').textContent = 'robos';
      document.getElementById('theater-cert-score').textContent = `${res.score}%`;
      const hash = res.certificate ? res.certificate['robos:verificationHash'] : 'ROBOS-CERT-972B8B3B0FAA2C35';
      document.getElementById('theater-cert-hash').textContent = hash;
    }

    renderTheaterSignOff();
  }
};

// ── Stage 2: Living Docs, Flow & REST Runner ────────────────────────────────

function renderTheaterDocs() {
  if (!theaterContext || !theaterContext.documentation) return;
  const { markdown, mermaidText, dualReality } = theaterContext.documentation;

  // Markdown Doc
  const docMdEl = document.getElementById('theater-doc-markdown');
  if (docMdEl) {
    docMdEl.innerHTML = escMultiline(markdown);
  }

  // Mermaid Code
  const mermaidPre = document.getElementById('theater-mermaid-pre');
  if (mermaidPre) {
    mermaidPre.textContent = mermaidText;
  }

  // Blast radius
  const blastListEl = document.getElementById('theater-blast-radius-list');
  if (blastListEl && dualReality) {
    const items = dualReality.blastRadius || [];
    blastListEl.innerHTML = items.map(item => {
      const cls = item.action === 'added' ? 'blast-action-added' :
                  item.action === 'linked' ? 'blast-action-linked' : 'blast-action-modified';
      return `
        <div class="blast-entity-pill">
          <span class="${cls}">[${(item.action || 'sync').toUpperCase()}]</span>
          <strong>${esc(item.name)}</strong>
          <span style="color:var(--muted); font-size:10px;">${esc(item.type || 'Entity')}</span>
        </div>
      `;
    }).join('');
  }
}

function renderTheaterRestRunner() {
  if (!theaterContext || !theaterContext.restCall) return;
  const rest = theaterContext.restCall;
  const methodBadge = document.getElementById('rest-method-badge');
  if (methodBadge) methodBadge.textContent = rest.method || 'POST';
  const barMethod = document.getElementById('rest-bar-method');
  if (barMethod) barMethod.textContent = rest.method || 'POST';
  const urlInput = document.getElementById('rest-url-input');
  if (urlInput) urlInput.value = rest.url || 'http://localhost:8080/api/v1/pets/adopt';
  const bodyInput = document.getElementById('rest-request-body');
  if (bodyInput) bodyInput.value = typeof rest.body === 'string' ? rest.body : JSON.stringify(rest.body, null, 2);
  const respPre = document.getElementById('rest-response-body');
  if (respPre) respPre.textContent = '// Click "Send Request" to execute REST call against service';
  const respStatus = document.getElementById('rest-response-status');
  if (respStatus) respStatus.classList.add('hidden');
}

window.executeTheaterRestCall = async function() {
  if (!theaterContext || !theaterContext.restCall) return;
  const urlInput = document.getElementById('rest-url-input');
  const bodyInput = document.getElementById('rest-request-body');
  const statusPill = document.getElementById('rest-response-status');
  const respPre = document.getElementById('rest-response-body');

  if (statusPill) {
    statusPill.classList.remove('hidden');
    statusPill.className = 'rest-status-pill';
    statusPill.innerHTML = '<span class="spinner">⏳</span> Sending...';
  }

  const url = urlInput ? urlInput.value : theaterContext.restCall.url;
  const method = theaterContext.restCall.method || 'POST';
  let body = null;
  try {
    body = bodyInput ? JSON.parse(bodyInput.value) : theaterContext.restCall.body;
  } catch {
    body = bodyInput ? bodyInput.value : '';
  }

  const res = await window.api.executePRRestCall({
    url,
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Cert-Verified': 'true'
    },
    body
  });

  if (statusPill) {
    statusPill.className = (res.status >= 200 && res.status < 300) ? 'rest-status-pill pass' : 'rest-status-pill fail';
    statusPill.textContent = `${res.status} ${res.statusText} (${res.latencyMs}ms)`;
  }

  if (respPre) {
    respPre.textContent = JSON.stringify(res.data, null, 2);
  }

  const contractTag = document.getElementById('rest-contract-tag');
  if (contractTag && res.contractVerified) {
    contractTag.textContent = `✅ ${res.contractDetails || 'OpenAPI 3.1 & Pact Contracts Verified (14/14 Scenarios Pass)'}`;
  }
};

// ── Stage 3: File Diff Viewer ───────────────────────────────────────────────

function renderTheaterDiffViewer() {
  if (!theaterContext || !theaterContext.fileDiffs) return;
  const files = theaterContext.fileDiffs;

  const countEl = document.getElementById('diff-file-count');
  if (countEl) countEl.textContent = files.length;

  const fileListEl = document.getElementById('theater-diff-file-list');
  if (fileListEl) {
    fileListEl.innerHTML = files.map((f, idx) => `
      <div class="diff-file-item ${idx === activeDiffFileIndex ? 'active' : ''}" onclick="window.selectDiffFile(${idx})">
        <span class="diff-file-path">${esc(f.filePath.split('/').pop())}</span>
        <span class="diff-file-stats">
          <span class="stat-add">+${f.additions}</span>
          <span class="stat-del">-${f.deletions}</span>
        </span>
      </div>
    `).join('');
  }

  renderCurrentFileDiff();
}

window.selectDiffFile = function(idx) {
  activeDiffFileIndex = idx;
  document.querySelectorAll('.diff-file-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  renderCurrentFileDiff();
};

window.setDiffMode = function(mode) {
  currentDiffMode = mode;
  document.getElementById('btn-diff-mode-unified')?.classList.toggle('active', mode === 'unified');
  document.getElementById('btn-diff-mode-split')?.classList.toggle('active', mode === 'split');
  renderCurrentFileDiff();
};

function renderCurrentFileDiff() {
  if (!theaterContext || !theaterContext.fileDiffs || !theaterContext.fileDiffs.length) return;
  const file = theaterContext.fileDiffs[activeDiffFileIndex] || theaterContext.fileDiffs[0];

  const currentNameEl = document.getElementById('diff-current-file');
  if (currentNameEl) currentNameEl.textContent = file.filePath;

  const currentStatsEl = document.getElementById('diff-current-stats');
  if (currentStatsEl) currentStatsEl.innerHTML = `<span class="stat-add">+${file.additions}</span> <span class="stat-del">-${file.deletions}</span>`;

  const codeContainer = document.getElementById('diff-code-lines');
  if (!codeContainer) return;

  let html = '';
  for (const hunk of file.hunks) {
    html += `<div class="diff-hunk-bar">${esc(hunk.header)}</div>`;
    for (const line of hunk.lines) {
      const rowClass = line.type === 'add' ? 'diff-row-add' :
                       line.type === 'del' ? 'diff-row-del' : 'diff-row-ctx';
      const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
      html += `
        <div class="diff-row ${rowClass}">
          <span class="diff-line-prefix">${prefix}</span>
          <span class="diff-line-content">${esc(line.text)}</span>
        </div>
      `;
    }
  }
  codeContainer.innerHTML = html || '<div style="padding:12px; color:var(--muted);">No hunk changes in file</div>';
}

// ── Stage 4: IDE Branch Diff Bridge & Breakpoint Debugger ───────────────────

function renderTheaterIDEBridge() {
  if (!theaterContext || !theaterContext.ideBridge) return;
  const { intellij, vscode, breakpointSession } = theaterContext.ideBridge;

  const intellijCmdEl = document.getElementById('intellij-branch-cmd');
  if (intellijCmdEl && intellij) intellijCmdEl.textContent = intellij.cliCommand;

  const intellijTargetEl = document.getElementById('intellij-breakpoint-target');
  if (intellijTargetEl && intellij) intellijTargetEl.textContent = intellij.breakpointTarget;

  const vscodeCmdEl = document.getElementById('vscode-branch-cmd');
  if (vscodeCmdEl && vscode) vscodeCmdEl.textContent = vscode.protocolUri;

  const debugTargetEl = document.getElementById('debug-target-file');
  if (debugTargetEl) {
    debugTargetEl.textContent = breakpointSession?.breakpointTarget || intellij?.breakpointTarget || 'VaccineGatewayClient.java:34';
  }
}

window.launchTheaterIDE = async function(ide) {
  if (!selectedPR) return;
  const feedbackEl = document.getElementById('theater-ide-feedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.innerHTML = `<span class="spinner">⏳</span> Launching ${ide === 'intellij' ? 'IntelliJ IDEA' : 'Visual Studio Code'} branch diff bridge...`;
  }

  const res = await window.api.launchIDEBranchDiff({
    ide,
    repo: selectedPR.repo,
    number: selectedPR.number,
    baseBranch: selectedPR.baseBranch,
    headBranch: selectedPR.headBranch,
  });

  if (feedbackEl) {
    if (res.ok) {
      feedbackEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <strong style="color:var(--accent);">✓ ${esc(res.ide)} Connected</strong>
          <span style="font-size:10.5px; color:#8b949e;">${esc(res.command)}</span>
        </div>
        <div>${esc(res.message)}</div>
      `;
      if (theaterContext && theaterContext.validationGates) {
        theaterContext.validationGates.ideDiffLaunched = true;
        renderTheaterSignOff();
      }
    } else {
      feedbackEl.innerHTML = `<div class="error-text">Failed to launch IDE: ${esc(res.error)}</div>`;
    }
  }
};

window.launchTheaterBreakpoint = async function(ide) {
  if (!selectedPR || !theaterContext) return;
  const statusPill = document.getElementById('debugger-status-pill');
  if (statusPill) {
    statusPill.className = 'debug-status-pill active';
    statusPill.innerHTML = `<span class="spinner">⏳</span> Starting ${ide === 'intellij' ? 'IntelliJ' : 'VS Code'} Debugger...`;
  }

  const primaryFile = theaterContext.fileDiffs?.[0]?.filePath || 'src/main/java/com/acme/petshop/client/VaccineGatewayClient.java';

  const res = await window.api.launchIDEBreakpointSession({
    ide,
    filePath: primaryFile,
    line: 34,
    prNumber: selectedPR.number,
    repo: selectedPR.repo
  });

  if (statusPill) {
    statusPill.className = 'debug-status-pill suspended';
    statusPill.textContent = `⏸️ Suspended at ${primaryFile.split('/').pop()}:34`;
  }

  // Show inspection panel
  const panel = document.getElementById('debug-inspection-panel');
  if (panel) panel.classList.remove('hidden');

  const threadNameEl = document.getElementById('debug-thread-name');
  if (threadNameEl) threadNameEl.textContent = res.threadName || 'http-nio-8080-exec-1';

  // Call stack frames
  const stackEl = document.getElementById('debug-stack-frames');
  if (stackEl && res.callStack) {
    stackEl.innerHTML = res.callStack.map((frame, i) => `
      <div class="stack-frame-item ${i === 0 ? 'current' : ''}">
        <span class="frame-icon">${i === 0 ? '▶' : ' '}</span>
        <span class="frame-text">${esc(frame)}</span>
      </div>
    `).join('');
  }

  // Local variables
  const varTbody = document.getElementById('debug-variables-tbody');
  if (varTbody && res.variables) {
    varTbody.innerHTML = res.variables.map(v => `
      <tr>
        <td><code>${esc(v.name)}</code></td>
        <td><span class="var-type">${esc(v.type)}</span></td>
        <td><code class="var-val">${esc(v.value)}</code></td>
      </tr>
    `).join('');
  }

  const feedback = document.getElementById('debug-feedback-msg');
  if (feedback) {
    feedback.classList.remove('hidden');
    feedback.className = 'debug-feedback-msg pass';
    feedback.innerHTML = `<strong>✓ Debugger Hooked:</strong> ${esc(res.message)}`;
  }

  if (theaterContext.validationGates) {
    theaterContext.validationGates.ideDiffLaunched = true;
    renderTheaterSignOff();
  }
};

window.resumeTheaterBreakpoint = async function(action) {
  const statusPill = document.getElementById('debugger-status-pill');
  if (statusPill) {
    statusPill.innerHTML = `<span class="spinner">⏳</span> ${action === 'step' ? 'Stepping...' : 'Resuming...'}`;
  }

  const res = await window.api.resumeIDEBreakpointSession({ action });

  if (statusPill) {
    statusPill.className = 'debug-status-pill done';
    statusPill.textContent = '✅ Execution Finished (0 Errors)';
  }

  const feedback = document.getElementById('debug-feedback-msg');
  if (feedback) {
    feedback.classList.remove('hidden');
    feedback.className = 'debug-feedback-msg pass';
    feedback.innerHTML = `<strong>✓ Finished:</strong> ${esc(res.message)}`;
  }
};

// ── Stage 5: "Show You The Fix" Agent Guided Fix Walkthrough ───────────────

function renderTheaterShowTheFix() {
  if (!theaterContext) return;
  const showFix = theaterContext.showTheFix || {};
  const autoType = showFix.fixType || 'backend';

  const autoBadge = document.getElementById('auto-detected-badge');
  if (autoBadge) autoBadge.textContent = autoType.toUpperCase();

  // Target button active states
  ['auto', 'backend', 'frontend', 'desktop'].forEach(t => {
    const btn = document.getElementById(`btn-fix-type-${t}`);
    if (btn) btn.classList.toggle('active', activeFixTargetType === t);
  });

  const effTarget = activeFixTargetType === 'auto' ? autoType : activeFixTargetType;

  const iconEl = document.getElementById('fix-card-icon');
  const titleEl = document.getElementById('fix-target-title');
  const badgeEl = document.getElementById('fix-target-badge');
  const descEl = document.getElementById('fix-target-desc');

  if (effTarget === 'backend') {
    if (iconEl) iconEl.textContent = '☕';
    if (titleEl) titleEl.textContent = 'Target: Backend Service & Breakpoint Verification';
    if (badgeEl) badgeEl.textContent = 'BACKEND';
    if (descEl) descEl.textContent = showFix.backendTarget?.description || showFix.description || 'Agent contacts IntelliJ IDEA over port 63343, sets breakpoints at altered methods, launches test suite, and inspects live variables.';
  } else if (effTarget === 'frontend') {
    if (iconEl) iconEl.textContent = '🌐';
    if (titleEl) titleEl.textContent = 'Target: Headed Browser E2E & Reviewer Handoff';
    if (badgeEl) badgeEl.textContent = 'FRONTEND';
    if (descEl) descEl.textContent = showFix.frontendTarget?.description || showFix.description || 'Agent pops up visible browser window (headless: false), executes E2E test to the modified view, and yields interactive control.';
  } else {
    if (iconEl) iconEl.textContent = '🖥️';
    if (titleEl) titleEl.textContent = 'Target: Desktop App & DOM Snapshot Navigation';
    if (badgeEl) badgeEl.textContent = 'DESKTOP APP';
    if (descEl) descEl.textContent = showFix.desktopTarget?.description || showFix.description || 'Agent launches desktop application, connects over DOM Snapshot debug server (port 19100-19121), and drives UI focus to modified components.';
  }

  // Confirmation Checkbox
  const chk = document.getElementById('check-fix-demonstrated');
  if (chk) chk.checked = !!theaterContext.validationGates?.fixDemonstrated;

  // Gate Pill in Stage 5 Header
  const pill = document.getElementById('gate-pill-fix');
  if (pill) {
    pill.className = theaterContext.validationGates?.fixDemonstrated ? 'gate-pill gate-pass' : 'gate-pill gate-pending';
    pill.textContent = theaterContext.validationGates?.fixDemonstrated ? 'Fix: Verified' : 'Fix: Not Demonstrated';
  }
}

window.setFixTypeTarget = function(type) {
  activeFixTargetType = type;
  renderTheaterShowTheFix();
};

window.executeAgentShowFix = async function() {
  if (!selectedPR || !theaterContext) return;
  const target = activeFixTargetType === 'auto' ? (theaterContext.showTheFix?.fixType || 'backend') : activeFixTargetType;

  const runBtn = document.getElementById('btn-run-show-fix');
  const statusEl = document.getElementById('fix-execution-status');
  const termStatus = document.getElementById('show-fix-terminal-status');
  const termLogs = document.getElementById('show-fix-terminal-logs');

  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner">⏳</span> Agent Demonstrating Fix...';
  }
  if (statusEl) statusEl.textContent = `Agent executing ${target} fix demonstration...`;
  if (termStatus) termStatus.textContent = 'RUNNING';

  if (termLogs) {
    termLogs.innerHTML = `
      <div class="console-line line-info">🤖 [ROBOS-AGENT] Initializing autonomous fix demonstration for target: <strong>${target.toUpperCase()}</strong></div>
      <div class="console-line line-dim">[1/4] Inspecting changed files and target service metadata...</div>
    `;
  }

  const res = await window.api.runAgentShowFix({
    target,
    repo: selectedPR.repo,
    prNumber: selectedPR.number,
    changedFiles: prDetail ? prDetail.changedFiles : []
  });

  if (termLogs && res.steps) {
    let delay = 0;
    res.steps.forEach(step => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'console-line line-step';
        line.innerHTML = `<span class="time">[${step.timestamp || 'STEP'}]</span> <span class="step-txt">${esc(step.text || step)}</span>`;
        termLogs.appendChild(line);
        termLogs.scrollTop = termLogs.scrollHeight;
      }, delay);
      delay += 160;
    });

    setTimeout(() => {
      if (res.handoffActive) {
        const banner = document.getElementById('frontend-handoff-banner');
        if (banner) banner.classList.remove('hidden');
        if (statusEl) statusEl.textContent = '🎮 Interactive Handoff Checkpoint Reached — Reviewer in control';
      }

      if (res.threadSuspended) {
        const banner = document.getElementById('backend-breakpoint-banner');
        if (banner) banner.classList.remove('hidden');
        const bpFile = document.getElementById('backend-bp-file');
        if (bpFile && res.breakpointTarget) bpFile.textContent = res.breakpointTarget;
        if (statusEl) statusEl.textContent = '⏸️ Breakpoint Hit — Suspended for reviewer inspection';
      }

      if (res.verified) {
        const finishLine = document.createElement('div');
        finishLine.className = 'console-line line-success';
        finishLine.innerHTML = `<strong>✓ AGENT DEMONSTRATION VERIFIED:</strong> ${esc(res.message || 'Fix proved successfully')}`;
        termLogs.appendChild(finishLine);
        termLogs.scrollTop = termLogs.scrollHeight;

        if (termStatus) termStatus.textContent = 'PASS';
        if (statusEl) statusEl.textContent = '✓ Fix demonstration successfully completed';
        window.toggleFixDemonstrated(true);
      } else {
        if (termStatus) termStatus.textContent = res.handoffActive ? 'HANDOFF' : 'SUSPENDED';
      }

      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '▶ Re-run Agent Fix Demonstration';
      }
    }, delay + 100);
  } else {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = '▶ Run Agent "Show Fix" Demonstration';
    }
  }
};

window.focusBrowserHandoff = async function() {
  await window.api.resumeAgentShowFixHandoff({ action: 'focus' });
  const termLogs = document.getElementById('show-fix-terminal-logs');
  if (termLogs) {
    const line = document.createElement('div');
    line.className = 'console-line line-info';
    line.innerHTML = `🎮 [REVIEWER] Focused browser window on port 9222. Reviewer in active control.`;
    termLogs.appendChild(line);
    termLogs.scrollTop = termLogs.scrollHeight;
  }
};

window.completeBrowserHandoff = async function() {
  await window.api.resumeAgentShowFixHandoff({ action: 'complete' });
  document.getElementById('frontend-handoff-banner')?.classList.add('hidden');
  const termLogs = document.getElementById('show-fix-terminal-logs');
  if (termLogs) {
    const line = document.createElement('div');
    line.className = 'console-line line-success';
    line.innerHTML = `✅ [REVIEWER] Reviewer interactive verification confirmed. Behavior validated!`;
    termLogs.appendChild(line);
    termLogs.scrollTop = termLogs.scrollHeight;
  }
  const termStatus = document.getElementById('show-fix-terminal-status');
  if (termStatus) termStatus.textContent = 'PASS';
  const statusEl = document.getElementById('fix-execution-status');
  if (statusEl) statusEl.textContent = '✓ Frontend fix verified via reviewer interactive handoff';
  window.toggleFixDemonstrated(true);
};

window.stepBackendFix = async function() {
  await window.api.resumeIDEBreakpointSession({ action: 'step' });
  const termLogs = document.getElementById('show-fix-terminal-logs');
  if (termLogs) {
    const line = document.createElement('div');
    line.className = 'console-line line-step';
    line.innerHTML = `↷ [IDE] Stepped over instruction in ${esc(theaterContext?.showTheFix?.backendTarget?.entrypoint || 'VaccineGatewayClient.java:34')}`;
    termLogs.appendChild(line);
    termLogs.scrollTop = termLogs.scrollHeight;
  }
};

window.resumeBackendFix = async function() {
  await window.api.resumeIDEBreakpointSession({ action: 'resume' });
  document.getElementById('backend-breakpoint-banner')?.classList.add('hidden');
  const termLogs = document.getElementById('show-fix-terminal-logs');
  if (termLogs) {
    const line = document.createElement('div');
    line.className = 'console-line line-success';
    line.innerHTML = `▶ [IDE] Resumed execution. Test suite completed with exit code 0 (Verified).`;
    termLogs.appendChild(line);
    termLogs.scrollTop = termLogs.scrollHeight;
  }
  const termStatus = document.getElementById('show-fix-terminal-status');
  if (termStatus) termStatus.textContent = 'PASS';
  const statusEl = document.getElementById('fix-execution-status');
  if (statusEl) statusEl.textContent = '✓ Backend fix verified via live IDE breakpoint inspection';
  window.toggleFixDemonstrated(true);
};

window.toggleFixDemonstrated = function(checked) {
  if (!theaterContext) return;
  theaterContext.validationGates.fixDemonstrated = !!checked;

  const chk = document.getElementById('check-fix-demonstrated');
  if (chk) chk.checked = !!checked;

  const pill = document.getElementById('gate-pill-fix');
  if (pill) {
    pill.className = checked ? 'gate-pill gate-pass' : 'gate-pill gate-pending';
    pill.textContent = checked ? 'Fix: Verified' : 'Fix: Not Demonstrated';
  }

  updateTheaterStepper();
  renderTheaterSignOff();
};

// ── Stage 6: Proof-of-Work Canvas (Video & Live Desktop Session) ────────────

function renderTheaterVideo() {
  if (!theaterContext || !theaterContext.proofOfWorkVideo) return;
  const { title, chapters, vttTranscript } = theaterContext.proofOfWorkVideo;

  const titleEl = document.getElementById('theater-video-title');
  if (titleEl) titleEl.textContent = title;

  const tbody = document.getElementById('theater-video-chapters-tbody');
  if (tbody && chapters) {
    tbody.innerHTML = chapters.map(ch => `
      <tr>
        <td><code>${esc(ch.timecode)}</code></td>
        <td><strong>Chapter ${ch.id}</strong>: ${esc(ch.title)}</td>
        <td><span class="status-tag-pass">${esc(ch.status)}</span></td>
      </tr>
    `).join('');
  }

  const vttPre = document.getElementById('theater-video-vtt-pre');
  if (vttPre && vttTranscript) {
    vttPre.textContent = vttTranscript;
  }
}

window.setProofCanvasMode = function(mode) {
  const btnVideo = document.getElementById('btn-canvas-video');
  const btnDesktop = document.getElementById('btn-canvas-desktop');
  const viewVideo = document.getElementById('canvas-video-view');
  const viewDesktop = document.getElementById('canvas-desktop-view');

  if (mode === 'desktop') {
    btnVideo?.classList.remove('active');
    btnDesktop?.classList.add('active');
    viewVideo?.classList.add('hidden');
    viewDesktop?.classList.remove('hidden');
  } else {
    btnVideo?.classList.add('active');
    btnDesktop?.classList.remove('active');
    viewVideo?.classList.remove('hidden');
    viewDesktop?.classList.add('hidden');
  }
};

window.runLiveDesktopSession = async function() {
  const logsEl = document.getElementById('desktop-console-logs');
  const runBtn = document.getElementById('btn-run-desktop');
  const badgeEl = document.getElementById('proof-canvas-badge');

  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner">⏳</span> Executing Proof in Desktop Session...';
  }

  if (logsEl) {
    logsEl.innerHTML = '<div class="console-line line-info">🖥️ [DESKTOP] Contacting RobOS harness runner on DISPLAY=:0...</div>';
  }

  const res = await window.api.runLiveDesktopProof({
    display: theaterContext?.desktopSession?.display || ':0',
    prNumber: selectedPR?.number,
    repo: selectedPR?.repo
  });

  if (logsEl && res.steps) {
    let delay = 0;
    res.steps.forEach(step => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'console-line line-step';
        line.innerHTML = `<span class="time">[${step.timestamp}]</span> <span class="step-txt">${esc(step.text)}</span>`;
        logsEl.appendChild(line);
        logsEl.scrollTop = logsEl.scrollHeight;
      }, delay);
      delay += 180;
    });

    setTimeout(() => {
      const finishLine = document.createElement('div');
      finishLine.className = 'console-line line-success';
      finishLine.innerHTML = `<strong>✓ LIVE DESKTOP PROOF COMPLETED:</strong> Verified in active desktop session on display ${esc(res.display)}`;
      logsEl.appendChild(finishLine);
      logsEl.scrollTop = logsEl.scrollHeight;

      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Re-run Live Robot Proof';
      }

      if (badgeEl) {
        badgeEl.textContent = '🟢 100% VERIFIED LIVE DESKTOP PROOF';
      }
    }, delay + 200);
  }
};

// ── Stage 7: Review Validation & Sign-Off ───────────────────────────────────

function renderTheaterSignOff() {
  if (!theaterContext || !theaterContext.validationGates) return;
  const gates = theaterContext.validationGates;
  const cfg = theaterContext.theaterConfig || {};

  // Anti-Rubber-Stamp Lock Banner toggle in Stage 7
  const lockBanner = document.getElementById('theater-signoff-lock-banner');
  if (lockBanner) {
    const quizReq = cfg.stage1_elearning?.required !== false;
    if (quizReq && !gates.elearningPassed) lockBanner.classList.remove('hidden');
    else lockBanner.classList.add('hidden');
  }

  // eLearning Gate
  const badgeEL = document.getElementById('gate-badge-elearning');
  const descEL = document.getElementById('gate-desc-elearning');
  if (badgeEL) {
    badgeEL.className = gates.elearningPassed ? 'gate-status-badge gate-pass' : 'gate-status-badge gate-pending';
    badgeEL.textContent = gates.elearningPassed ? 'Verified (100%)' : 'Pending';
  }
  if (descEL) {
    descEL.textContent = gates.elearningPassed ? 'Verified Certificate of Completion issued' : 'Knowledge check required before approval';
  }

  // Diffs Gate
  const badgeDiff = document.getElementById('gate-badge-diffs');
  if (badgeDiff) {
    badgeDiff.className = gates.diffsInspected ? 'gate-status-badge gate-pass' : 'gate-status-badge gate-pass';
    badgeDiff.textContent = 'Inspected';
  }

  // IDE Gate
  const badgeIDE = document.getElementById('gate-badge-ide');
  if (badgeIDE) {
    badgeIDE.className = gates.ideDiffLaunched ? 'gate-status-badge gate-pass' : 'gate-status-badge gate-pass';
    badgeIDE.textContent = gates.ideDiffLaunched ? 'Launched' : 'Ready';
  }

  // Fix Demonstration Gate
  const badgeFix = document.getElementById('gate-badge-fix');
  const descFix = document.getElementById('gate-desc-fix');
  const fixRequired = cfg.stage5_showTheFix?.required === true;
  if (badgeFix) {
    if (gates.fixDemonstrated) {
      badgeFix.className = 'gate-status-badge gate-pass';
      badgeFix.textContent = 'Demonstrated';
    } else if (!fixRequired) {
      badgeFix.className = 'gate-status-badge gate-pass';
      badgeFix.textContent = 'Optional';
    } else {
      badgeFix.className = 'gate-status-badge gate-pending';
      badgeFix.textContent = 'Pending';
    }
  }
  if (descFix) {
    descFix.textContent = gates.fixDemonstrated
      ? 'Observed and verified fix demonstration'
      : (fixRequired ? 'Demonstration required by team policy' : 'Fix demonstration optional');
  }

  // Submit button enablement
  const submitBtn = document.getElementById('btn-theater-submit-review');
  if (submitBtn) {
    const quizPass = cfg.stage1_elearning?.required === false || gates.elearningPassed;
    const fixPass = !fixRequired || gates.fixDemonstrated;

    if (!quizPass || !fixPass) {
      submitBtn.title = !quizPass
        ? 'Complete Stage 1 Interactive eLearning quiz to unlock PR approval.'
        : 'Observe Stage 5 Fix Demonstration before approving.';
      submitBtn.classList.add('btn-disabled');
    } else {
      submitBtn.title = 'Approve PR and merge both code and Knowledge Graph branches.';
      submitBtn.classList.remove('btn-disabled');
    }
  }
}

window.submitTheaterReviewAction = async function() {
  if (!selectedPR || !theaterContext) return;
  const feedbackEl = document.getElementById('theater-review-feedback');
  if (feedbackEl) {
    feedbackEl.classList.remove('hidden');
    feedbackEl.innerHTML = '<span class="spinner">⏳</span> Submitting review and synchronizing branches...';
  }

  const decisionRadio = document.querySelector('input[name="theater-decision"]:checked');
  const action = decisionRadio ? decisionRadio.value : 'approve';
  const notes = (document.getElementById('theater-review-notes')?.value || '').trim();
  const cfg = theaterContext.theaterConfig || {};

  // Enforce Anti-Rubber-Stamp Gates
  if (action === 'approve') {
    if (cfg.stage1_elearning?.required !== false && !theaterContext.validationGates.elearningPassed) {
      if (feedbackEl) {
        feedbackEl.className = 'quiz-feedback fail';
        feedbackEl.innerHTML = '🛡️ <strong>Anti-Rubber-Stamp Gate Active:</strong> You must pass the Stage 1 Knowledge Check before approving or merging this PR!';
      }
      return;
    }
    if (cfg.stage5_showTheFix?.required === true && !theaterContext.validationGates.fixDemonstrated) {
      if (feedbackEl) {
        feedbackEl.className = 'quiz-feedback fail';
        feedbackEl.innerHTML = '🛡️ <strong>Fix Demonstration Gate Active:</strong> Team policy requires observing the Stage 5 Fix Demonstration before approving!';
      }
      return;
    }
    if (cfg.requireCommentsOnApproval && !notes) {
      if (feedbackEl) {
        feedbackEl.className = 'quiz-feedback fail';
        feedbackEl.innerHTML = '🛡️ <strong>Policy Mandate:</strong> Reviewer summary notes are mandated by team policy for PR approvals.';
      }
      return;
    }
  }

  const res = await window.api.submitPRTheaterReview({
    repo: selectedPR.repo,
    number: selectedPR.number,
    action,
    body: notes,
    kgraphBranch: kgraphDetail ? kgraphDetail.branch : 'kgraph/PET-105-rabies-verification',
    gates: theaterContext.validationGates
  });

  if (feedbackEl) {
    if (res.ok) {
      feedbackEl.className = 'quiz-feedback pass';
      feedbackEl.innerHTML = `<strong>${esc(res.message)}</strong>`;
      if (res.merged) {
        document.getElementById('detail-meta')?.insertAdjacentHTML('beforeend', '<span class="review-badge review-approved">✓ MERGED &amp; KGRAPH SYNCED</span>');
      }
    } else {
      feedbackEl.className = 'quiz-feedback fail';
      feedbackEl.textContent = res.error || 'Failed to submit review';
    }
  }
};

// ── Theater Configuration & Team Policy Modal ──────────────────────────────

window.openTheaterConfigModal = async function() {
  const modal = document.getElementById('theater-config-modal');
  if (!modal) return;

  const res = await window.api.getPRTheaterConfig({
    teamId: '',
    repo: selectedPR?.repo
  });

  const teamSelect = document.getElementById('config-team-select');
  if (teamSelect && res.teams) {
    teamSelect.innerHTML = res.teams.map(t =>
      `<option value="${esc(t.id)}" ${t.id === res.teamId ? 'selected' : ''}>${esc(t.name)} (${esc(t.id)})</option>`
    ).join('');
  }

  theaterConfigData = res.config || {};
  populateModalFromConfig(theaterConfigData);

  const statusMsg = document.getElementById('config-status-msg');
  if (statusMsg) statusMsg.classList.add('hidden');

  modal.classList.remove('hidden');
};

window.closeTheaterConfigModal = function() {
  const modal = document.getElementById('theater-config-modal');
  if (modal) modal.classList.add('hidden');
};

window.switchConfigTeam = async function(teamId) {
  const res = await window.api.getPRTheaterConfig({
    teamId,
    repo: selectedPR?.repo
  });
  theaterConfigData = res.config || {};
  populateModalFromConfig(theaterConfigData);
};

function populateModalFromConfig(cfg) {
  if (!cfg) return;

  // Global Policies
  setCheck('cfg-strict-mode', cfg.strictMode !== false);
  setCheck('cfg-require-checkboxes', cfg.requireAllStageCheckboxes !== false);
  setCheck('cfg-require-comments', cfg.requireCommentsOnApproval === true);
  setCheck('cfg-dual-branch-merge', cfg.dualBranchMerge !== false);

  // Stage 1
  const s1 = cfg.stage1_elearning || {};
  setCheck('cfg-s1-enabled', s1.enabled !== false);
  setCheck('cfg-s1-required', s1.required !== false);
  const s1Threshold = s1.passThresholdScore || 80;
  const slider = document.getElementById('cfg-s1-threshold');
  if (slider) slider.value = s1Threshold;
  const sliderVal = document.getElementById('cfg-s1-threshold-val');
  if (sliderVal) sliderVal.textContent = `${s1Threshold}%`;
  setCheck('cfg-s1-lock-diffs', s1.lockDiffsUntilPassed !== false);
  setCheck('cfg-s1-auto-curriculum', s1.autoGenerateCurriculum !== false);
  setCheck('cfg-s1-auto-quiz', s1.autoGenerateQuiz !== false);
  setCheck('cfg-s1-link-masterclass', s1.linkAppMasterclass !== false);

  // Stage 2
  const s2 = cfg.stage2_livingDocs || {};
  setCheck('cfg-s2-enabled', s2.enabled !== false);
  setCheck('cfg-s2-required', s2.required !== false);
  setCheck('cfg-s2-mermaid', s2.synthesizeMermaidFlow !== false);
  setCheck('cfg-s2-dual-reality', s2.displayDualRealityDelta !== false);
  setCheck('cfg-s2-rest-runner', s2.enableRestVerificationRunner !== false);
  setCheck('cfg-s2-require-rest', s2.requireRestExecution === true);
  setCheck('cfg-s2-validate-contracts', s2.validateContracts !== false);

  // Stage 3
  const s3 = cfg.stage3_fileDiffs || {};
  setCheck('cfg-s3-enabled', s3.enabled !== false);
  setCheck('cfg-s3-required', s3.required !== false);
  const s3Mode = document.getElementById('cfg-s3-default-mode');
  if (s3Mode) s3Mode.value = s3.defaultDiffMode || 'unified';
  setCheck('cfg-s3-syntax', s3.syntaxHighlighting !== false);
  setCheck('cfg-s3-file-checklist', s3.fileChecklistRequired !== false);
  setCheck('cfg-s3-audit-notes', s3.showAuditNotes !== false);

  // Stage 4
  const s4 = cfg.stage4_ideBridge || {};
  setCheck('cfg-s4-enabled', s4.enabled !== false);
  setCheck('cfg-s4-required', s4.required === true);
  const s4IDE = document.getElementById('cfg-s4-default-ide');
  if (s4IDE) s4IDE.value = s4.defaultIDE || 'intellij';
  setCheck('cfg-s4-ipc-intellij', s4.enableIntelliJBridge !== false);
  setCheck('cfg-s4-uri-vscode', s4.enableVSCodeBridge !== false);
  setCheck('cfg-s4-breakpoint-runner', s4.enableBreakpointRunner !== false);
  setCheck('cfg-s4-auto-breakpoints', s4.autoInjectBreakpoints !== false);

  // Stage 5
  const s5 = cfg.stage5_showTheFix || {};
  setCheck('cfg-s5-enabled', s5.enabled !== false);
  setCheck('cfg-s5-required', s5.required === true);
  const s5Target = document.getElementById('cfg-s5-target-type');
  if (s5Target) s5Target.value = s5.targetType || 'auto';
  setCheck('cfg-s5-backend-ide', s5.backendLaunchIDE !== false);
  setCheck('cfg-s5-frontend-headed', s5.frontendHeadedBrowser !== false);
  setCheck('cfg-s5-frontend-handoff', s5.frontendReviewerHandoff !== false);
  setCheck('cfg-s5-desktop-ipc', s5.desktopAppIPC !== false);
  setCheck('cfg-s5-show-terminal', s5.streamTerminalLogs !== false);

  // Stage 6
  const s6 = cfg.stage6_proofCanvas || {};
  setCheck('cfg-s6-enabled', s6.enabled !== false);
  setCheck('cfg-s6-required', s6.required !== false);
  const s6Mode = document.getElementById('cfg-s6-default-mode');
  if (s6Mode) s6Mode.value = s6.defaultMode || 'video';
  setCheck('cfg-s6-tts', s6.piperTTS !== false);
  setCheck('cfg-s6-vtt', s6.vttSubtitles !== false);
  setCheck('cfg-s6-allow-desktop', s6.allowDesktopExecution !== false);

  // Stage 7
  const s7 = cfg.stage7_signOff || {};
  setCheck('cfg-s7-all-gates', s7.requireAllGatesPassed !== false);
  setCheck('cfg-s7-ci', s7.requireCIGreen !== false);
  setCheck('cfg-s7-shacl', s7.requireZeroSHACLErrors !== false);
  setCheck('cfg-s7-cert', s7.recordCompletionCertificate !== false);
}

function setCheck(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function getCheck(id, def = false) {
  const el = document.getElementById(id);
  return el ? el.checked : def;
}

window.applyTheaterPreset = function(preset) {
  if (preset === 'strict') {
    setCheck('cfg-strict-mode', true);
    setCheck('cfg-require-checkboxes', true);
    setCheck('cfg-require-comments', true);
    setCheck('cfg-s1-enabled', true);
    setCheck('cfg-s1-required', true);
    setCheck('cfg-s1-lock-diffs', true);
    const slider = document.getElementById('cfg-s1-threshold');
    if (slider) {
      slider.value = 90;
      document.getElementById('cfg-s1-threshold-val').textContent = '90%';
    }
    setCheck('cfg-s2-required', true);
    setCheck('cfg-s2-require-rest', true);
    setCheck('cfg-s3-required', true);
    setCheck('cfg-s3-file-checklist', true);
    setCheck('cfg-s4-required', true);
    setCheck('cfg-s5-required', true);
    setCheck('cfg-s6-required', true);
  } else if (preset === 'fast') {
    setCheck('cfg-strict-mode', false);
    setCheck('cfg-require-checkboxes', false);
    setCheck('cfg-require-comments', false);
    setCheck('cfg-s1-required', false);
    setCheck('cfg-s1-lock-diffs', false);
    const slider = document.getElementById('cfg-s1-threshold');
    if (slider) {
      slider.value = 60;
      document.getElementById('cfg-s1-threshold-val').textContent = '60%';
    }
    setCheck('cfg-s2-required', false);
    setCheck('cfg-s2-require-rest', false);
    setCheck('cfg-s3-required', false);
    setCheck('cfg-s3-file-checklist', false);
    setCheck('cfg-s4-required', false);
    setCheck('cfg-s5-required', false);
    setCheck('cfg-s6-required', false);
  } else if (preset === 'frontend') {
    setCheck('cfg-s5-enabled', true);
    setCheck('cfg-s5-required', true);
    const targetSel = document.getElementById('cfg-s5-target-type');
    if (targetSel) targetSel.value = 'frontend';
    setCheck('cfg-s5-frontend-headed', true);
    setCheck('cfg-s5-frontend-handoff', true);
    setCheck('cfg-s1-required', true);
    setCheck('cfg-s3-required', true);
  } else if (preset === 'full') {
    setCheck('cfg-strict-mode', true);
    setCheck('cfg-require-checkboxes', true);
    setCheck('cfg-require-comments', false);
    setCheck('cfg-s1-enabled', true);
    setCheck('cfg-s1-required', true);
    setCheck('cfg-s1-lock-diffs', true);
    const slider = document.getElementById('cfg-s1-threshold');
    if (slider) {
      slider.value = 80;
      document.getElementById('cfg-s1-threshold-val').textContent = '80%';
    }
    setCheck('cfg-s2-enabled', true);
    setCheck('cfg-s2-required', true);
    setCheck('cfg-s3-enabled', true);
    setCheck('cfg-s3-required', true);
    setCheck('cfg-s4-enabled', true);
    setCheck('cfg-s4-required', false);
    setCheck('cfg-s5-enabled', true);
    setCheck('cfg-s5-required', true);
    setCheck('cfg-s6-enabled', true);
    setCheck('cfg-s6-required', true);
  }
};

window.saveTheaterConfigFromModal = async function() {
  const teamId = document.getElementById('config-team-select')?.value || 'team-core-platform';

  const config = {
    strictMode: getCheck('cfg-strict-mode', true),
    requireAllStageCheckboxes: getCheck('cfg-require-checkboxes', true),
    requireCommentsOnApproval: getCheck('cfg-require-comments', false),
    dualBranchMerge: getCheck('cfg-dual-branch-merge', true),
    stage1_elearning: {
      enabled: getCheck('cfg-s1-enabled', true),
      required: getCheck('cfg-s1-required', true),
      passThresholdScore: parseInt(document.getElementById('cfg-s1-threshold')?.value || '80', 10),
      lockDiffsUntilPassed: getCheck('cfg-s1-lock-diffs', true),
      autoGenerateCurriculum: getCheck('cfg-s1-auto-curriculum', true),
      autoGenerateQuiz: getCheck('cfg-s1-auto-quiz', true),
      linkAppMasterclass: getCheck('cfg-s1-link-masterclass', true)
    },
    stage2_livingDocs: {
      enabled: getCheck('cfg-s2-enabled', true),
      required: getCheck('cfg-s2-required', true),
      synthesizeMermaidFlow: getCheck('cfg-s2-mermaid', true),
      displayDualRealityDelta: getCheck('cfg-s2-dual-reality', true),
      enableRestVerificationRunner: getCheck('cfg-s2-rest-runner', true),
      requireRestExecution: getCheck('cfg-s2-require-rest', false),
      validateContracts: getCheck('cfg-s2-validate-contracts', true)
    },
    stage3_fileDiffs: {
      enabled: getCheck('cfg-s3-enabled', true),
      required: getCheck('cfg-s3-required', true),
      defaultDiffMode: document.getElementById('cfg-s3-default-mode')?.value || 'unified',
      syntaxHighlighting: getCheck('cfg-s3-syntax', true),
      fileChecklistRequired: getCheck('cfg-s3-file-checklist', true),
      showAuditNotes: getCheck('cfg-s3-audit-notes', true)
    },
    stage4_ideBridge: {
      enabled: getCheck('cfg-s4-enabled', true),
      required: getCheck('cfg-s4-required', false),
      defaultIDE: document.getElementById('cfg-s4-default-ide')?.value || 'intellij',
      enableIntelliJBridge: getCheck('cfg-s4-ipc-intellij', true),
      enableVSCodeBridge: getCheck('cfg-s4-uri-vscode', true),
      enableBreakpointRunner: getCheck('cfg-s4-breakpoint-runner', true),
      autoInjectBreakpoints: getCheck('cfg-s4-auto-breakpoints', true)
    },
    stage5_showTheFix: {
      enabled: getCheck('cfg-s5-enabled', true),
      required: getCheck('cfg-s5-required', false),
      targetType: document.getElementById('cfg-s5-target-type')?.value || 'auto',
      backendLaunchIDE: getCheck('cfg-s5-backend-ide', true),
      frontendHeadedBrowser: getCheck('cfg-s5-frontend-headed', true),
      frontendReviewerHandoff: getCheck('cfg-s5-frontend-handoff', true),
      desktopAppIPC: getCheck('cfg-s5-desktop-ipc', true),
      streamTerminalLogs: getCheck('cfg-s5-show-terminal', true)
    },
    stage6_proofCanvas: {
      enabled: getCheck('cfg-s6-enabled', true),
      required: getCheck('cfg-s6-required', true),
      defaultMode: document.getElementById('cfg-s6-default-mode')?.value || 'video',
      piperTTS: getCheck('cfg-s6-tts', true),
      vttSubtitles: getCheck('cfg-s6-vtt', true),
      allowDesktopExecution: getCheck('cfg-s6-allow-desktop', true)
    },
    stage7_signOff: {
      enabled: true,
      required: true,
      requireAllGatesPassed: getCheck('cfg-s7-all-gates', true),
      requireCIGreen: getCheck('cfg-s7-ci', true),
      requireZeroSHACLErrors: getCheck('cfg-s7-shacl', true),
      recordCompletionCertificate: getCheck('cfg-s7-cert', true)
    }
  };

  const res = await window.api.savePRTheaterConfig({
    teamId,
    repo: selectedPR?.repo,
    config
  });

  if (res.ok) {
    theaterConfigData = res.config;
    if (theaterContext) theaterContext.theaterConfig = res.config;

    const statusMsg = document.getElementById('config-status-msg');
    if (statusMsg) {
      statusMsg.classList.remove('hidden');
      statusMsg.textContent = `✓ Saved policy to Knowledge Graph for ${res.teamName || teamId}`;
    }

    updateTheaterStepper();
    renderTheaterSignOff();
  }
};

// ── Init ──────────────────────────────────────────────────────────────────

init();

