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

function envClass(env) {
  if (!env) return 'env-default';
  const e = env.toLowerCase();
  if (e.includes('prod')) return 'env-production';
  if (e.includes('stag')) return 'env-staging';
  if (e.includes('prev') || e.includes('dev')) return 'env-preview';
  return 'env-default';
}

function computeMTTR(deploys) {
  // MTTR: average time between failure deployment and next success deployment
  const sorted = [...deploys].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const recoveryTimes = [];
  let lastFailure = null;

  for (const d of sorted) {
    if (d._latestStatus === 'failure' && !lastFailure) {
      lastFailure = new Date(d.created_at);
    } else if (d._latestStatus === 'success' && lastFailure) {
      recoveryTimes.push(new Date(d.created_at).getTime() - lastFailure.getTime());
      lastFailure = null;
    }
  }

  if (!recoveryTimes.length) return null;
  const avgMs = recoveryTimes.reduce((s, t) => s + t, 0) / recoveryTimes.length;
  return avgMs / (3600 * 1000); // hours
}

// ── State ────────────────────────────────────────────────────────────────────
let _deploys = [];
let _releases = [];
let _prs = [];

// ── Rendering ────────────────────────────────────────────────────────────────

function renderKPIs(deploys, releases, days) {
  const inRange = deploys.filter(d => daysAgo(d.created_at) <= days);
  document.getElementById('kpi-total-deploys').textContent = inRange.length;

  const weeks = Math.max(1, days / 7);
  document.getElementById('kpi-deploy-freq').textContent =
    inRange.length > 0 ? `${(inRange.length / weeks).toFixed(1)}/wk` : '--';

  const relInRange = releases.filter(r => daysAgo(r.publishedAt) <= days);
  document.getElementById('kpi-releases').textContent = relInRange.length;

  // Average PRs per deploy as proxy for deploy size
  const totalPRs = _prs.filter(p => daysAgo(p.mergedAt) <= days).length;
  const avgSize = inRange.length > 0 ? (totalPRs / inRange.length).toFixed(1) : '--';
  document.getElementById('kpi-deploy-size').textContent = avgSize !== '--' ? `${avgSize} PRs` : '--';

  const mttr = computeMTTR(inRange);
  document.getElementById('kpi-mttr').textContent = mttr !== null ? `${mttr.toFixed(1)}h` : '--';
}

function renderTimeline(deploys, days) {
  const el = document.getElementById('timeline-content');
  const filtered = deploys.filter(d => daysAgo(d.created_at) <= days);

  if (!filtered.length) {
    el.innerHTML = '<div class="placeholder">No deployments found in range</div>';
    return;
  }

  el.innerHTML = filtered.map(d => {
    const env = d.environment || 'unknown';
    const statusCls = d._latestStatus === 'success' ? 'status-success' :
                      d._latestStatus === 'failure' ? 'status-failure' : 'status-pending';
    const statusLabel = d._latestStatus || 'pending';
    const creator = (d.creator && d.creator.login) || '';
    return `<div class="deploy-row">
      <span class="deploy-env ${envClass(env)}">${env}</span>
      <span class="deploy-desc">${d.description || d.ref || d.sha?.substring(0, 7) || 'deploy'}</span>
      <span class="deploy-status ${statusCls}">${statusLabel}</span>
      <span class="deploy-creator">${creator}</span>
      <span class="deploy-date">${timeAgo(d.created_at)}</span>
    </div>`;
  }).join('');
}

function renderReleases(releases) {
  const el = document.getElementById('releases-content');
  if (!releases.length) {
    el.innerHTML = '<div class="placeholder">No releases found</div>';
    return;
  }

  el.innerHTML = releases.slice(0, 20).map(r => `
    <div class="release-row">
      <span class="release-tag">${r.tagName}</span>
      <span class="release-name">${r.name || r.tagName}</span>
      ${r.isPrerelease ? '<span class="release-pre">pre-release</span>' : ''}
      <span class="release-date">${timeAgo(r.publishedAt)}</span>
    </div>
  `).join('');
}

function renderChangesets(prs, days) {
  const el = document.getElementById('changeset-content');
  const recent = prs.filter(p => daysAgo(p.mergedAt) <= days).slice(0, 30);

  if (!recent.length) {
    el.innerHTML = '<div class="placeholder">No merged PRs in range</div>';
    return;
  }

  el.innerHTML = recent.map(pr => `
    <div class="changeset-row">
      <span class="changeset-num">#${pr.number}</span>
      <span class="changeset-title">${pr.title}</span>
      <span class="changeset-author">${(pr.author && pr.author.login) || ''}</span>
      <span class="changeset-date">${timeAgo(pr.mergedAt)}</span>
    </div>
  `).join('');
}

function refresh() {
  const days = parseInt(document.getElementById('time-range').value);
  const envFilter = document.getElementById('env-filter').value;

  let deploys = _deploys;
  if (envFilter) {
    deploys = deploys.filter(d => (d.environment || '').toLowerCase() === envFilter.toLowerCase());
  }

  renderKPIs(deploys, _releases, days);
  renderTimeline(deploys, days);
  renderReleases(_releases);
  renderChangesets(_prs, days);
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const settings = await window.robos.readSettings();
  const ts = (settings.task_servers || [])[0];
  const badge = document.getElementById('server-badge');

  if (!ts || !ts.repos || !ts.repos.length) {
    badge.textContent = 'No task server';
    document.getElementById('timeline-content').innerHTML =
      '<div class="placeholder">No task server configured. Open Task Servers app to set up.</div>';
    return;
  }

  badge.textContent = ts.name || ts.type || 'GitHub';
  const repo = `${ts.repos[0].org}/${ts.repos[0].repo}`;

  const [deploysRes, releasesRes, prsRes] = await Promise.all([
    window.robos.getDeployments({ repo }),
    window.robos.getReleases({ repo }),
    window.robos.getMergedPRs({ repo }),
  ]);

  _deploys = deploysRes.ok ? (Array.isArray(deploysRes.data) ? deploysRes.data : []) : [];
  _releases = releasesRes.ok ? (Array.isArray(releasesRes.data) ? releasesRes.data : []) : [];
  _prs = prsRes.ok ? (Array.isArray(prsRes.data) ? prsRes.data : []) : [];

  // For each deploy, set _latestStatus (we'll use a simplified approach)
  for (const d of _deploys) {
    d._latestStatus = 'success'; // default; real status fetching could be done async
  }

  // Populate environment filter
  const envs = [...new Set(_deploys.map(d => d.environment).filter(Boolean))];
  const envFilter = document.getElementById('env-filter');
  for (const env of envs) {
    const opt = document.createElement('option');
    opt.value = env; opt.textContent = env;
    envFilter.appendChild(opt);
  }

  refresh();
}

document.getElementById('time-range').addEventListener('change', refresh);
document.getElementById('env-filter').addEventListener('change', refresh);

init();
setInterval(init, 300000);
