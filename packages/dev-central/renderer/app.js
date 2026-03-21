'use strict';

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
  const failed = checks.some(c => c.conclusion === 'FAILURE' || c.conclusion === 'failure');
  if (failed) return 'fail';
  const pending = checks.some(c => !c.conclusion || c.conclusion === 'PENDING');
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
      blockers.push({ type: 'ci', label: 'Failed CI', text: `PR #${pr.number}: ${pr.title}`, url: pr.url });
    }
  }
  // Pending reviews > 24h
  for (const pr of prs) {
    if (reviewStatus(pr) === 'pending' && pr.updatedAt) {
      const age = Date.now() - new Date(pr.updatedAt).getTime();
      if (age > 24 * 3600 * 1000) {
        blockers.push({ type: 'review', label: 'Stale Review', text: `PR #${pr.number}: awaiting review ${timeAgo(pr.updatedAt)}`, url: pr.url });
      }
    }
  }
  // Issues not updated in 3+ days
  for (const issue of issues) {
    if (issue.updatedAt) {
      const age = Date.now() - new Date(issue.updatedAt).getTime();
      if (age > 3 * 24 * 3600 * 1000) {
        blockers.push({ type: 'stuck', label: 'Stuck', text: `#${issue.number}: ${issue.title} (${timeAgo(issue.updatedAt)})`, url: issue.url });
      }
    }
  }
  return blockers;
}

function generateStandup(issues, prs) {
  const yesterday = [];
  const today = [];

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

  if (!yesterday.length) yesterday.push('No recent completions found');
  if (!today.length) today.push('No assigned tasks');

  return { yesterday, today };
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

// ── Render functions ─────────────────────────────────────────────────────────

function renderTasks(issues) {
  const el = document.getElementById('tasks-list');
  const countEl = document.getElementById('tasks-count');
  countEl.textContent = issues.length;

  if (!issues.length) {
    el.innerHTML = '<div class="placeholder">No assigned tasks</div>';
    return;
  }

  el.innerHTML = issues.map(i => {
    const labels = (i.labels || []).map(l => typeof l === 'string' ? l : l.name);
    const stateLabel = labels.find(l => l.startsWith('state:'));
    const stage = stateLabel ? stateLabel.replace('state:', '') : i.state;
    const dotClass = stage === 'open' ? 'dot-blue' : stage === 'done' ? 'dot-green' : 'dot-yellow';
    return `<div class="item" data-url="${i.url || ''}">
      <span class="item-key"><span class="dot ${dotClass}"></span>#${i.number}</span>
      <span class="item-title">${i.title}</span>
      <span class="item-meta">${timeAgo(i.updatedAt)}</span>
    </div>`;
  }).join('');

  el.querySelectorAll('.item').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url) window.robos.openUrl(url);
    });
  });
}

function renderPRs(prs) {
  const el = document.getElementById('prs-list');
  const countEl = document.getElementById('prs-count');
  countEl.textContent = prs.length;

  if (!prs.length) {
    el.innerHTML = '<div class="placeholder">No open pull requests</div>';
    return;
  }

  el.innerHTML = prs.map(pr => {
    const ci = ciStatus(pr);
    const ciClass = ci === 'pass' ? 'ci-pass' : ci === 'fail' ? 'ci-fail' : 'ci-pending';
    const ciLabel = ci === 'pass' ? 'CI Pass' : ci === 'fail' ? 'CI Fail' : 'CI Pending';
    const review = reviewStatus(pr);
    const revDot = review === 'approved' ? 'dot-green' : review === 'changes' ? 'dot-red' : 'dot-yellow';
    return `<div class="item" data-url="${pr.url || ''}">
      <span class="item-key">#${pr.number}</span>
      <span class="item-title">${pr.title}</span>
      <span class="ci-badge ${ciClass}">${ciLabel}</span>
      <span class="dot ${revDot}"></span>
      <span class="item-meta">${timeAgo(pr.updatedAt)}</span>
    </div>`;
  }).join('');

  el.querySelectorAll('.item').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url) window.robos.openUrl(url);
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

  el.innerHTML = reviews.map(pr => `
    <div class="item" data-url="${pr.url || ''}">
      <span class="item-key">#${pr.number}</span>
      <span class="item-title">${pr.title}</span>
      <span class="item-meta">by ${(pr.author && pr.author.login) || '?'} ${timeAgo(pr.updatedAt)}</span>
    </div>
  `).join('');

  el.querySelectorAll('.item').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url) window.robos.openUrl(url);
    });
  });
}

function renderBlockers(blockers) {
  const el = document.getElementById('blockers-list');
  if (!blockers.length) {
    el.innerHTML = '<div class="placeholder">No blockers detected</div>';
    return;
  }
  el.innerHTML = blockers.map(b => {
    const cls = b.type === 'ci' ? 'blocker-ci' : b.type === 'review' ? 'blocker-review' : 'blocker-stuck';
    return `<div class="blocker-item" data-url="${b.url || ''}">
      <span class="blocker-type ${cls}">${b.label}</span>
      <span>${b.text}</span>
    </div>`;
  }).join('');

  el.querySelectorAll('.blocker-item').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url) window.robos.openUrl(url);
    });
  });
}

function renderStandup(standup) {
  const el = document.getElementById('standup-content');
  el.innerHTML = `
    <div class="standup-section">
      <div class="standup-label">Yesterday</div>
      <div class="standup-text">${standup.yesterday.map(t => `&bull; ${t}`).join('<br>')}</div>
    </div>
    <div class="standup-section">
      <div class="standup-label">Today</div>
      <div class="standup-text">${standup.today.map(t => `&bull; ${t}`).join('<br>')}</div>
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

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Load settings and show server badge
  const settings = await window.robos.readSettings();
  const ts = (settings.task_servers || [])[0];
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

  const issues  = issuesRes.ok  ? issuesRes.data  : [];
  const prs     = prsRes.ok     ? prsRes.data     : [];
  const reviews = reviewsRes.ok ? reviewsRes.data : [];
  const events  = activityRes.ok ? activityRes.data : [];

  renderTasks(issues);
  renderPRs(prs);
  renderReviews(reviews);
  renderBlockers(detectBlockers(issues, prs));
  renderStandup(generateStandup(issues, prs));
  renderActivity(events);

  // Show error if no task server
  if (!ts) {
    document.getElementById('tasks-list').innerHTML =
      '<div class="placeholder">No task server configured. Open Task Servers app to set up.</div>';
  }
}

init();

// Auto-refresh every 2 minutes
setInterval(init, 120000);
