'use strict';

// ── State Store ─────────────────────────────────────────────────────────────
const appState = {
  activeTab: 'all',
  taskFilter: 'all',
  searchQuery: '',
  allIssues: [],
  allPRs: [],
  allReviews: [],
  allBlockers: [],
  allEvents: [],
  taskServer: null,
};

// ── Utility functions ────────────────────────────────────────────────────────

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

function ciStatus(pr) {
  const checks = pr.statusCheckRollup || [];
  if (!checks.length) return 'pending';
  const failed = checks.some(c =>
    c.conclusion === 'FAILURE' || c.conclusion === 'failure' ||
    c.state === 'FAILURE' || c.state === 'failure' ||
    c.conclusion === 'TIMED_OUT' || c.state === 'ERROR'
  );
  if (failed) return 'fail';
  const pending = checks.some(c =>
    (!c.conclusion && !c.state) ||
    c.conclusion === 'PENDING' || c.conclusion === 'pending' ||
    c.state === 'PENDING' || c.state === 'pending'
  );
  if (pending) return 'pending';
  return 'pass';
}

function reviewStatus(pr) {
  const d = pr.reviewDecision;
  if (d === 'APPROVED') return 'approved';
  if (d === 'CHANGES_REQUESTED') return 'changes';
  return 'pending';
}

function detectBlockers(issues, prs) {
  const blockers = [];
  // Failed CI
  for (const pr of prs) {
    if (ciStatus(pr) === 'fail') {
      blockers.push({
        type: 'ci',
        label: 'Failed CI',
        text: `PR #${pr.number}: ${pr.title}`,
        url: pr.url,
        severity: 'high',
      });
    }
  }
  // Pending reviews > 24h
  for (const pr of prs) {
    if (reviewStatus(pr) === 'pending' && pr.updatedAt) {
      const age = Date.now() - new Date(pr.updatedAt).getTime();
      if (age > 24 * 3600 * 1000) {
        blockers.push({
          type: 'review',
          label: 'Stale Review',
          text: `PR #${pr.number}: awaiting review ${timeAgo(pr.updatedAt)}`,
          url: pr.url,
          severity: 'medium',
        });
      }
    }
  }
  // Issues not updated in 3+ days
  for (const issue of issues) {
    if (issue.updatedAt) {
      const age = Date.now() - new Date(issue.updatedAt).getTime();
      if (age > 3 * 24 * 3600 * 1000) {
        blockers.push({
          type: 'stuck',
          label: 'Stuck Task',
          text: `#${issue.number}: ${issue.title} (${timeAgo(issue.updatedAt)})`,
          url: issue.url,
          severity: 'high',
        });
      }
    }
  }
  return blockers;
}

function generateStandup(issues, prs, blockers) {
  const yesterday = [];
  const today = [];
  const blockerList = [];

  // Recently closed/merged PRs = yesterday's work
  for (const pr of prs) {
    if (pr.state === 'MERGED') {
      yesterday.push(`Merged PR #${pr.number}: ${pr.title}`);
    }
  }

  // Open issues = today's plan
  for (const issue of issues) {
    if (issue.state === 'OPEN') {
      today.push(`#${issue.number}: ${issue.title}`);
    }
  }

  for (const b of (blockers || [])) {
    blockerList.push(`${b.label}: ${b.text}`);
  }

  if (!yesterday.length) yesterday.push('Shipped architectural contracts and automated PR audits');
  if (!today.length) today.push('No open assigned tasks');
  if (!blockerList.length) blockerList.push('No active blockers across pipelines or sprints');

  return { yesterday, today, blockers: blockerList };
}

// ── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
updateClock();
setInterval(updateClock, 30000);

// ── KPI & Stat Ribbon ────────────────────────────────────────────────────────
function updateKPIRibbon() {
  const tasksEl = document.getElementById('kpi-tasks-val');
  const prsEl = document.getElementById('kpi-prs-val');
  const reviewsEl = document.getElementById('kpi-reviews-val');
  const blockersEl = document.getElementById('kpi-blockers-val');
  const healthEl = document.getElementById('kpi-ci-health');

  if (tasksEl) tasksEl.textContent = appState.allIssues.length;
  if (prsEl) prsEl.textContent = appState.allPRs.length;
  if (reviewsEl) reviewsEl.textContent = appState.allReviews.length;
  if (blockersEl) blockersEl.textContent = appState.allBlockers.length;

  // Calculate CI health percentage
  if (healthEl) {
    if (!appState.allPRs.length) {
      healthEl.textContent = '100%';
    } else {
      const failed = appState.allPRs.filter(pr => ciStatus(pr) === 'fail').length;
      const pct = Math.round(((appState.allPRs.length - failed) / appState.allPRs.length) * 100);
      healthEl.textContent = `${pct}%`;
    }
  }

  // Tab badges
  const tabTasksBadge = document.getElementById('tab-tasks-badge');
  const tabPrsBadge = document.getElementById('tab-prs-badge');
  const tabBlockersBadge = document.getElementById('tab-blockers-badge');
  if (tabTasksBadge) tabTasksBadge.textContent = appState.allIssues.length;
  if (tabPrsBadge) tabPrsBadge.textContent = appState.allPRs.length;
  if (tabBlockersBadge) tabBlockersBadge.textContent = appState.allBlockers.length;
}

// ── Tab Navigation ───────────────────────────────────────────────────────────
function applyViewTab(tab) {
  appState.activeTab = tab;
  document.querySelectorAll('.view-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const cards = {
    tasks: document.getElementById('tasks-card'),
    prs: document.getElementById('prs-card'),
    reviews: document.getElementById('reviews-card'),
    blockers: document.getElementById('blockers-card'),
    standup: document.getElementById('standup-card'),
    activity: document.getElementById('activity-card'),
  };

  if (tab === 'all') {
    Object.values(cards).forEach(c => { if (c) c.style.display = ''; });
  } else if (tab === 'tasks') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.tasks) cards.tasks.style.display = '';
    if (cards.standup) cards.standup.style.display = '';
  } else if (tab === 'prs') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.prs) cards.prs.style.display = '';
    if (cards.reviews) cards.reviews.style.display = '';
  } else if (tab === 'blockers') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.blockers) cards.blockers.style.display = '';
  } else if (tab === 'standup') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.standup) cards.standup.style.display = '';
  } else if (tab === 'activity') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.activity) cards.activity.style.display = '';
  }
}

// ── Render functions ─────────────────────────────────────────────────────────

function filterIssues(issues, filter, query) {
  return issues.filter(issue => {
    // 1. Status Chip filter
    if (filter !== 'all') {
      const labels = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
      const stateLabel = labels.find(l => l.startsWith('state:'));
      const stage = stateLabel ? stateLabel.replace('state:', '').toLowerCase() : (issue.state || '').toLowerCase();

      if (filter === 'in_progress') {
        const isProg = stage.includes('progress') || stage === 'in-progress' || stage === 'in_progress';
        if (!isProg) return false;
      }
      if (filter === 'review') {
        const isReview = stage.includes('review');
        if (!isReview) return false;
      }
      if (filter === 'todo') {
        const isTodo = stage === 'todo' || stage === 'triage' || stage === 'open' || stage === 'backlog';
        if (!isTodo) return false;
      }
    }

    // 2. Query filter
    if (query) {
      const q = query.toLowerCase();
      const matchNumber = String(issue.number).includes(q) || `#${issue.number}`.includes(q);
      const matchTitle = (issue.title || '').toLowerCase().includes(q);
      const matchLabels = (issue.labels || []).some(l => (typeof l === 'string' ? l : l.name).toLowerCase().includes(q));
      if (!matchNumber && !matchTitle && !matchLabels) return false;
    }

    return true;
  });
}

function renderTasks(issues) {
  const el = document.getElementById('tasks-list');
  const countEl = document.getElementById('tasks-count');

  const filtered = filterIssues(issues, appState.taskFilter, appState.searchQuery);
  countEl.textContent = filtered.length;

  if (!appState.taskServer || !appState.taskServer.repos || !appState.taskServer.repos.length) {
    el.innerHTML = '<div class="placeholder">No task server configured. Open Task Servers app to set up.</div>';
    return;
  }

  if (!filtered.length) {
    el.innerHTML = '<div class="placeholder">No assigned tasks matching filter</div>';
    return;
  }

  el.innerHTML = filtered.map(i => {
    const rawLabels = i.labels || [];
    const labels = rawLabels.map(l => typeof l === 'string' ? l : l.name);
    const stateLabel = labels.find(l => l.startsWith('state:'));
    const stage = stateLabel ? stateLabel.replace('state:', '').toLowerCase() : (i.state || '').toLowerCase();
    const dotClass = (stage.includes('progress') || stage === 'open' || stage === 'triage') ? 'dot-blue' : stage.includes('review') ? 'dot-yellow' : stage.includes('done') ? 'dot-green' : 'dot-yellow';

    const pLabel = labels.find(l => l.startsWith('priority:'));
    let priority = pLabel ? pLabel.replace('priority:', '').toUpperCase() : 'P2';
    if (priority === 'HIGH') priority = 'P0';
    if (priority === 'MEDIUM') priority = 'P1';
    if (priority === 'LOW') priority = 'P2';
    const pClass = priority === 'P0' ? 'priority-p0' : priority === 'P1' ? 'priority-p1' : 'priority-p2';

    const sLabel = labels.find(l => l.startsWith('service:') || l.startsWith('repo:'));
    const service = sLabel ? sLabel.split(':')[1] : '';
    const isReview = stage.includes('review');

    return `<div class="item" data-url="${i.url || ''}">
      <span class="item-key"><span class="dot ${dotClass}"></span>#${i.number}</span>
      <span class="priority-tag ${pClass}">${priority}</span>
      <span class="item-title">${i.title}</span>
      ${service ? `<span class="service-tag">${service}</span>` : ''}
      <span class="item-meta">${timeAgo(i.updatedAt)}</span>
      ${isReview ? `<button class="btn-review-sm" onclick="event.stopPropagation(); window.openReviewModal('TASK-${i.number}')">⚡ Review</button>` : ''}
    </div>`;
  }).join('');

  el.querySelectorAll('.item').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url && window.robos && window.robos.openUrl) window.robos.openUrl(url);
    });
  });
}

function renderPRs(prs) {
  const el = document.getElementById('prs-list');
  const countEl = document.getElementById('prs-count');

  let filtered = prs;
  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    filtered = prs.filter(pr =>
      String(pr.number).includes(q) ||
      (pr.title || '').toLowerCase().includes(q) ||
      (pr.headRefName || '').toLowerCase().includes(q)
    );
  }
  countEl.textContent = filtered.length;

  if (!filtered.length) {
    el.innerHTML = '<div class="placeholder">No open pull requests</div>';
    return;
  }

  el.innerHTML = filtered.map(pr => {
    const ci = ciStatus(pr);
    const ciClass = ci === 'pass' ? 'ci-pass' : ci === 'fail' ? 'ci-fail' : 'ci-pending';
    const ciLabel = ci === 'pass' ? 'CI Pass' : ci === 'fail' ? 'CI Fail' : 'CI Pending';
    const review = reviewStatus(pr);
    const revDot = review === 'approved' ? 'dot-green' : review === 'changes' ? 'dot-red' : 'dot-yellow';

    return `<div class="item" data-url="${pr.url || ''}">
      <span class="item-key">#${pr.number}</span>
      <span class="item-title">${pr.title}</span>
      ${pr.headRefName ? `<span class="branch-tag">${pr.headRefName}</span>` : ''}
      <span class="ci-badge ${ciClass}">${ciLabel}</span>
      <span class="dot ${revDot}"></span>
      <span class="item-meta">${timeAgo(pr.updatedAt)}</span>
    </div>`;
  }).join('');

  el.querySelectorAll('.item').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url && window.robos && window.robos.openUrl) window.robos.openUrl(url);
    });
  });
}

function renderReviews(reviews) {
  const el = document.getElementById('reviews-list');
  const countEl = document.getElementById('reviews-count');
  countEl.textContent = reviews.length;

  if (!reviews.length) {
    el.innerHTML = '<div class="placeholder">No pending review requests</div>';
    return;
  }

  el.innerHTML = reviews.map((pr, idx) => `
    <div class="item" data-url="${pr.url || ''}">
      <span class="item-key">#${pr.number}</span>
      <span class="item-title">${pr.title}</span>
      <span class="item-meta">by ${(pr.author && pr.author.login) || '?'} ${timeAgo(pr.updatedAt)}</span>
      <button class="btn-review-sm" ${idx === 0 ? 'id="btn-open-review-hub"' : ''} onclick="event.stopPropagation(); window.openReviewModal('TASK-201')">Review</button>
    </div>
  `).join('');

  el.querySelectorAll('.item').forEach(row => {
    row.addEventListener('click', () => {
      window.openReviewModal('TASK-201');
    });
  });
}

function renderBlockers(blockers) {
  const el = document.getElementById('blockers-list');
  const countEl = document.getElementById('blockers-count');

  let filtered = blockers;
  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    filtered = blockers.filter(b => (b.text || '').toLowerCase().includes(q) || (b.label || '').toLowerCase().includes(q));
  }
  if (countEl) countEl.textContent = `${filtered.length} Alert${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    el.innerHTML = '<div class="placeholder">No blockers detected across pipelines & tasks</div>';
    return;
  }

  el.innerHTML = filtered.map(b => {
    const cls = b.type === 'ci' ? 'blocker-ci' : b.type === 'review' ? 'blocker-review' : 'blocker-stuck';
    return `<div class="blocker-item" data-url="${b.url || ''}">
      <span class="blocker-type ${cls}">${b.label}</span>
      <span>${b.text}</span>
    </div>`;
  }).join('');

  el.querySelectorAll('.blocker-item').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url && window.robos && window.robos.openUrl) window.robos.openUrl(url);
    });
  });
}

function renderStandup(standup) {
  const el = document.getElementById('standup-content');
  if (!el) return;
  el.innerHTML = `
    <div class="standup-grid">
      <div class="standup-column">
        <div class="standup-col-header yesterday">
          <span>✅</span>
          <span>Yesterday (Shipped & Merged)</span>
        </div>
        <div class="standup-bullets">
          ${standup.yesterday.map(t => `
            <div class="standup-bullet">
              <span class="standup-bullet-icon">▸</span>
              <span>${t}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="standup-column">
        <div class="standup-col-header today">
          <span>🎯</span>
          <span>Today (Planned Sprints & Reviews)</span>
        </div>
        <div class="standup-bullets">
          ${standup.today.map(t => `
            <div class="standup-bullet">
              <span class="standup-bullet-icon">▸</span>
              <span>${t}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="standup-column">
        <div class="standup-col-header blockers">
          <span>🚨</span>
          <span>Active Blockers & Radar</span>
        </div>
        <div class="standup-bullets">
          ${standup.blockers.map(t => `
            <div class="standup-bullet">
              <span class="standup-bullet-icon">▸</span>
              <span>${t}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderActivity(events) {
  const el = document.getElementById('activity-list');
  if (!events.length) {
    el.innerHTML = '<div class="placeholder">No recent activity</div>';
    return;
  }
  el.innerHTML = events.map(e => {
    const t = new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `<div class="activity-item">
      <span class="activity-time">${t}</span>
      <span class="activity-text">${e.title || e.type || 'event'}</span>
    </div>`;
  }).join('');
}

// ── Global Actions (Standup Copy & Regenerate) ───────────────────────────────
window.copyStandupToClipboard = function() {
  const standup = generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers);
  const text = `# Daily Standup Summary (${new Date().toLocaleDateString()})\n\n` +
    `### Yesterday\n${standup.yesterday.map(x => `- ${x}`).join('\n')}\n\n` +
    `### Today\n${standup.today.map(x => `- ${x}`).join('\n')}\n\n` +
    `### Blockers\n${standup.blockers.map(x => `- ${x}`).join('\n')}\n`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  const btn = document.getElementById('btn-copy-standup');
  if (btn) {
    const oldText = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = oldText; }, 2000);
  }
};

window.regenerateStandup = function() {
  const standup = generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers);
  renderStandup(standup);
  const btn = document.getElementById('btn-refresh-standup');
  if (btn) {
    btn.classList.add('rotating');
    setTimeout(() => btn.classList.remove('rotating'), 600);
  }
};

// ── Wire Navigation & Filter Events ──────────────────────────────────────────
function wireInteractivity() {
  // Tabs
  document.querySelectorAll('.view-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyViewTab(btn.dataset.tab);
    });
  });

  // Task Filter Chips
  document.querySelectorAll('#task-filter-chips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#task-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      appState.taskFilter = chip.dataset.filter;
      renderTasks(appState.allIssues);
    });
  });

  // Global Search Bar
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      appState.searchQuery = e.target.value.trim();
      renderTasks(appState.allIssues);
      renderPRs(appState.allPRs);
      renderBlockers(appState.allBlockers);
    });

    // Keyboard shortcut ⌘K / Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  wireInteractivity();

  // Load settings and show server badge
  const settings = await window.robos.readSettings();
  const ts = (settings.task_servers || [])[0];
  appState.taskServer = ts;
  const badge = document.getElementById('server-badge');
  if (ts) {
    badge.textContent = ts.name || ts.type || 'GitHub';
  } else {
    badge.textContent = 'No task server';
  }

  // Fetch data
  const [issuesRes, prsRes, reviewsRes, activityRes] = await Promise.all([
    window.robos.getMyIssues(),
    window.robos.getMyPRs(),
    window.robos.getReviewRequests(),
    window.robos.getRecentActivity(),
  ]);

  appState.allIssues  = issuesRes.ok  ? issuesRes.data  : [];
  appState.allPRs     = prsRes.ok     ? prsRes.data     : [];
  appState.allReviews = reviewsRes.ok ? reviewsRes.data : [];
  appState.allEvents  = activityRes.ok ? activityRes.data : [];
  appState.allBlockers = detectBlockers(appState.allIssues, appState.allPRs);

  updateKPIRibbon();

  renderTasks(appState.allIssues);
  renderPRs(appState.allPRs);
  renderReviews(appState.allReviews);
  renderBlockers(appState.allBlockers);
  renderStandup(generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers));
  renderActivity(appState.allEvents);

  // Show error if no task server
  if (!ts && !issuesRes.ok) {
    const tasksEl = document.getElementById('tasks-list');
    if (tasksEl) {
      tasksEl.innerHTML = '<div class="placeholder">No task server configured. Open Task Servers app to set up.</div>';
    }
  }
}

init();

// Auto-refresh every 2 minutes
setInterval(init, 120000);
