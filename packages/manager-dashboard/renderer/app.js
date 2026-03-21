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

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / (24 * 3600 * 1000);
}

function computeCycleTime(prs) {
  const merged = prs.filter(p => p.mergedAt && p.createdAt);
  if (!merged.length) return null;
  const total = merged.reduce((sum, p) => {
    return sum + (new Date(p.mergedAt).getTime() - new Date(p.createdAt).getTime());
  }, 0);
  const avgMs = total / merged.length;
  const avgDays = avgMs / (24 * 3600 * 1000);
  return avgDays;
}

function computeVelocity(prs) {
  const byAuthor = {};
  for (const pr of prs) {
    const author = (pr.author && pr.author.login) || 'unknown';
    if (!byAuthor[author]) byAuthor[author] = 0;
    byAuthor[author]++;
  }
  return Object.entries(byAuthor)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function groupByStage(issues) {
  const stages = new Map();
  for (const issue of issues) {
    const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
    const stateLabel = labels.find(l => l.startsWith('state:'));
    const stage = stateLabel ? stateLabel.replace('state:', '') : (issue.state || 'open');
    if (!stages.has(stage)) stages.set(stage, []);
    stages.get(stage).push(issue);
  }
  return stages;
}

const STAGE_COLORS = {
  'backlog': '#484f58', 'open': '#3b82f6', 'triage': '#eab308',
  'in-progress': '#00bcd4', 'in_progress': '#00bcd4',
  'in-review': '#7c3aed', 'in_review': '#7c3aed',
  'done': '#22c55e', 'closed': '#22c55e',
  'deployed': '#14b8a6',
};

// ── Rendering ────────────────────────────────────────────────────────────────

let _allIssues = [];
let _allPRs = [];
let _allDeploys = [];

function renderKPIs(issues, prs, deploys, days) {
  const openIssues = issues.filter(i => i.state === 'OPEN' || i.state === 'open');
  document.getElementById('kpi-open-issues').textContent = openIssues.length;

  const merged = prs.filter(p => p.mergedAt && daysAgo(p.mergedAt) <= days);
  document.getElementById('kpi-prs-merged').textContent = merged.length;

  const ct = computeCycleTime(merged);
  document.getElementById('kpi-cycle-time').textContent = ct !== null ? `${ct.toFixed(1)}d` : '--';

  const weeks = Math.max(1, days / 7);
  const deploysInRange = deploys.filter(d => daysAgo(d.created_at) <= days);
  document.getElementById('kpi-deploy-freq').textContent =
    deploysInRange.length > 0 ? `${(deploysInRange.length / weeks).toFixed(1)}/wk` : '--';

  const approved = prs.filter(p => p.reviewDecision === 'APPROVED');
  const rate = prs.length > 0 ? Math.round((approved.length / prs.length) * 100) : 0;
  document.getElementById('kpi-approval-rate').textContent = `${rate}%`;
}

function renderSprintBoard(issues) {
  const el = document.getElementById('sprint-board');
  const stages = groupByStage(issues);

  if (stages.size === 0) {
    el.innerHTML = '<div class="placeholder">No issues found</div>';
    return;
  }

  const orderedStages = ['backlog', 'open', 'triage', 'in-progress', 'in_progress', 'in-review', 'in_review', 'done', 'closed', 'deployed'];
  const stageKeys = [...stages.keys()].sort((a, b) => {
    const ai = orderedStages.indexOf(a);
    const bi = orderedStages.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  el.innerHTML = `<div class="sprint-columns">${stageKeys.map(stage => {
    const items = stages.get(stage);
    const color = STAGE_COLORS[stage] || '#484f58';
    return `<div class="sprint-col">
      <div class="sprint-col-header" style="background:${color}22; border-left:3px solid ${color};">
        ${stage} <span class="count">${items.length}</span>
      </div>
      ${items.slice(0, 10).map(i => {
        const assignee = (i.assignees || []).map(a => a.login).join(', ') || '';
        return `<div class="sprint-issue">
          <span class="num">#${i.number}</span>${i.title.substring(0, 40)}${i.title.length > 40 ? '...' : ''}
          ${assignee ? `<br><span class="assignee">${assignee}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('')}</div>`;
}

function renderVelocity(prs, days) {
  const el = document.getElementById('velocity-content');
  const merged = prs.filter(p => p.mergedAt && daysAgo(p.mergedAt) <= days);
  const velocity = computeVelocity(merged);

  if (!velocity.length) {
    el.innerHTML = '<div class="placeholder">No merged PRs in range</div>';
    return;
  }

  const max = velocity[0].count;
  el.innerHTML = velocity.map(v => `
    <div class="velocity-row">
      <span class="velocity-name">${v.name}</span>
      <div class="velocity-bar-bg">
        <div class="velocity-bar" style="width:${Math.round((v.count / max) * 100)}%"></div>
      </div>
      <span class="velocity-val">${v.count}</span>
    </div>
  `).join('');
}

function renderPRActivity(prs, days) {
  const el = document.getElementById('pr-activity-content');
  const recent = prs
    .filter(p => daysAgo(p.updatedAt || p.createdAt) <= days)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 20);

  if (!recent.length) {
    el.innerHTML = '<div class="placeholder">No PR activity in range</div>';
    return;
  }

  el.innerHTML = recent.map(pr => {
    const merged = pr.mergedAt ? `<span class="pr-merged">merged ${timeAgo(pr.mergedAt)}</span>` : '';
    return `<div class="pr-row" data-url="${pr.url || ''}">
      <span class="pr-num">#${pr.number}</span>
      <span class="pr-title">${pr.title}</span>
      <span class="pr-author">${(pr.author && pr.author.login) || ''}</span>
      ${merged}
    </div>`;
  }).join('');

  el.querySelectorAll('.pr-row').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url) window.robos.openUrl(url);
    });
  });
}

function renderDeployments(deploys) {
  const el = document.getElementById('deploy-content');
  if (!deploys.length) {
    el.innerHTML = '<div class="placeholder">No deployments found</div>';
    return;
  }

  el.innerHTML = deploys.slice(0, 20).map(d => `
    <div class="deploy-row">
      <span class="deploy-env">${d.environment || 'production'}</span>
      <span>${d.description || d.ref || 'deployment'}</span>
      <span class="deploy-date">${timeAgo(d.created_at)}</span>
    </div>
  `).join('');
}

function refresh() {
  const days = parseInt(document.getElementById('time-range').value);
  const devFilter = document.getElementById('dev-filter').value;

  let issues = _allIssues;
  let prs = _allPRs;

  if (devFilter) {
    issues = issues.filter(i => (i.assignees || []).some(a => a.login === devFilter));
    prs = prs.filter(p => (p.author && p.author.login) === devFilter);
  }

  renderKPIs(issues, prs, _allDeploys, days);
  renderSprintBoard(issues);
  renderVelocity(prs, days);
  renderPRActivity(prs, days);
  renderDeployments(_allDeploys);
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const settings = await window.robos.readSettings();
  const ts = (settings.task_servers || [])[0];
  const badge = document.getElementById('server-badge');

  if (!ts || !ts.repos || !ts.repos.length) {
    badge.textContent = 'No task server';
    document.getElementById('sprint-board').innerHTML =
      '<div class="placeholder">No task server configured. Open Task Servers app to set up.</div>';
    return;
  }

  badge.textContent = ts.name || ts.type || 'GitHub';
  const repo = `${ts.repos[0].org}/${ts.repos[0].repo}`;

  const [issuesRes, prsRes, deploysRes, contribRes] = await Promise.all([
    window.robos.getAllIssues({ repo, state: 'all' }),
    window.robos.getAllPRs({ repo, state: 'all' }),
    window.robos.getDeployments({ repo }),
    window.robos.getContributors({ repo }),
  ]);

  _allIssues = issuesRes.ok ? issuesRes.data : [];
  _allPRs = prsRes.ok ? prsRes.data : [];
  _allDeploys = deploysRes.ok ? (Array.isArray(deploysRes.data) ? deploysRes.data : []) : [];

  // Populate developer filter
  const devs = contribRes.ok ? contribRes.data : [];
  const devFilter = document.getElementById('dev-filter');
  for (const dev of devs) {
    const opt = document.createElement('option');
    opt.value = dev; opt.textContent = dev;
    devFilter.appendChild(opt);
  }

  refresh();
}

document.getElementById('time-range').addEventListener('change', refresh);
document.getElementById('dev-filter').addEventListener('change', refresh);

init();
setInterval(init, 300000); // refresh every 5 minutes
