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
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

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
  emptyState.classList.add("hidden");

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

// ── Init ──────────────────────────────────────────────────────────────────

init();
