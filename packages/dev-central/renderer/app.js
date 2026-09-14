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

  // Feature In-Progress State
  allFeatures: [],
  activeFeature: null,
  taskLifetimeActive: {}, // { [taskId]: boolean }

  // Notifications State
  allNotifications: [],
  notifSubView: 'list', // 'list' | 'prefs'
  notifSearchQuery: '',
  notifCategoryFilters: { pr_review: true, ci_cd: true, task: true, agent: true, system: true },
  notifTierFilters: { critical: true, warning: true, info: true },
  notifDateFilter: '',
  notifPrefs: { quietHours: { enabled: false, start: '22:00', end: '07:00' }, dnd: false },
};

// ── Utility Functions ────────────────────────────────────────────────────────

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

  for (const pr of prs) {
    if (pr.state === 'MERGED') {
      yesterday.push(`Merged PR #${pr.number}: ${pr.title}`);
    }
  }
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
  const featValEl = document.getElementById('kpi-feature-val');
  const featStEl = document.getElementById('kpi-feature-status');
  const notifsValEl = document.getElementById('kpi-notifs-val');
  const notifsDeltaEl = document.getElementById('kpi-notifs-delta');

  if (tasksEl) tasksEl.textContent = appState.allIssues.length;
  if (prsEl) prsEl.textContent = appState.allPRs.length;
  if (reviewsEl) reviewsEl.textContent = appState.allReviews.length;
  if (blockersEl) blockersEl.textContent = appState.allBlockers.length;

  if (healthEl) {
    if (!appState.allPRs.length) {
      healthEl.textContent = '100%';
    } else {
      const failed = appState.allPRs.filter(pr => ciStatus(pr) === 'fail').length;
      const pct = Math.round(((appState.allPRs.length - failed) / appState.allPRs.length) * 100);
      healthEl.textContent = `${pct}%`;
    }
  }

  // Active feature KPI
  if (appState.activeFeature) {
    if (featValEl) featValEl.textContent = appState.activeFeature.code;
    if (featStEl) featStEl.textContent = appState.activeFeature.status.replace('_', ' ');
  }

  // Notifications KPI & unread count
  const unread = appState.allNotifications.filter(n => !n.read).length;
  if (notifsValEl) notifsValEl.textContent = appState.allNotifications.length;
  if (notifsDeltaEl) notifsDeltaEl.textContent = `${unread} unread`;

  // Tab badges
  const tabTasksBadge = document.getElementById('tab-tasks-badge');
  const tabPrsBadge = document.getElementById('tab-prs-badge');
  const tabBlockersBadge = document.getElementById('tab-blockers-badge');
  const tabFeatureBadge = document.getElementById('tab-feature-badge');
  const tabNotifsBadge = document.getElementById('tab-notifs-badge');
  const headerNotifBadge = document.getElementById('header-notif-badge');
  const headerNotifBtn = document.getElementById('btn-header-notifs');

  if (tabTasksBadge) tabTasksBadge.textContent = appState.allIssues.length;
  if (tabPrsBadge) tabPrsBadge.textContent = appState.allPRs.length;
  if (tabBlockersBadge) tabBlockersBadge.textContent = appState.allBlockers.length;
  if (tabFeatureBadge && appState.activeFeature) tabFeatureBadge.textContent = appState.activeFeature.status;
  if (tabNotifsBadge) tabNotifsBadge.textContent = unread;
  if (headerNotifBadge) headerNotifBadge.textContent = unread;

  if (headerNotifBtn) {
    headerNotifBtn.classList.toggle('has-unread', unread > 0);
  }
}

// ── Tab Navigation ───────────────────────────────────────────────────────────
function applyViewTab(tab) {
  appState.activeTab = tab;
  document.querySelectorAll('.view-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const cards = {
    feature:   document.getElementById('feature-card'),
    notifications: document.getElementById('notifications-card'),
    tasks:     document.getElementById('tasks-card'),
    prs:       document.getElementById('prs-card'),
    reviews:   document.getElementById('reviews-card'),
    blockers:  document.getElementById('blockers-card'),
    standup:   document.getElementById('standup-card'),
    activity:  document.getElementById('activity-card'),
  };

  if (tab === 'all') {
    Object.values(cards).forEach(c => { if (c) c.style.display = ''; });
    // In overview Mission Control, show top cards
    if (cards.notifications) cards.notifications.style.display = '';
    if (cards.feature) cards.feature.style.display = '';
  } else if (tab === 'feature') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.feature) cards.feature.style.display = '';
  } else if (tab === 'notifications') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.notifications) cards.notifications.style.display = '';
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

window.switchTab = function(tab) {
  applyViewTab(tab);
};

// ── Active Feature Rendering & Lifetime Timeline ────────────────────────────

function renderFeatures(features, activeFeature) {
  appState.allFeatures = features;
  appState.activeFeature = activeFeature || features[0];

  const selector = document.getElementById('feature-selector');
  if (selector) {
    selector.innerHTML = features.map(f =>
      `<option value="${f.id}" ${f.id === appState.activeFeature?.id ? 'selected' : ''}>${f.code}: ${f.name}</option>`
    ).join('');
  }

  const f = appState.activeFeature;
  if (!f) return;

  const codeEl = document.getElementById('feature-code');
  const nameEl = document.getElementById('feature-name');
  const descEl = document.getElementById('feature-desc');
  const stBadge = document.getElementById('feature-status-badge');
  const repoTag = document.getElementById('feature-repo-tag');
  const serviceTag = document.getElementById('feature-service-tag');
  const progressTag = document.getElementById('feature-progress-tag');
  const progressFill = document.getElementById('feature-progress-fill');
  const progressPct = document.getElementById('feature-progress-pct');
  const tasksCount = document.getElementById('feature-tasks-count');
  const tasksList = document.getElementById('feature-tasks-list');

  if (codeEl) codeEl.textContent = f.code;
  if (nameEl) nameEl.textContent = f.name;
  if (descEl) descEl.textContent = f.description || '';
  if (stBadge) {
    stBadge.textContent = f.status.replace('_', ' ');
    stBadge.className = `badge-status-pill ${f.status.toLowerCase().replace('_', '-')}`;
  }
  if (repoTag) repoTag.textContent = `Repository: ${f.repository || 'repo'}`;
  if (serviceTag) serviceTag.textContent = `Service: ${f.targetService || 'general'}`;

  const tasks = f.tasks || [];
  const completed = tasks.filter(t => t.status === 'DONE').length;
  const total = tasks.length || 1;
  const pct = Math.round((completed / total) * 100);

  if (progressTag) progressTag.textContent = `Progress: ${completed} / ${tasks.length} tasks`;
  if (progressFill) progressFill.style.width = `${pct}%`;
  if (progressPct) progressPct.textContent = `${pct}% Complete`;
  if (tasksCount) tasksCount.textContent = `${tasks.length} Tasks`;

  if (!tasksList) return;
  if (!tasks.length) {
    tasksList.innerHTML = '<div class="placeholder">No linked tasks for this feature.</div>';
    return;
  }

  tasksList.innerHTML = tasks.map(t => {
    const isLifetimeOpen = !!appState.taskLifetimeActive[t.id];
    const statusClass = (t.status || 'todo').toLowerCase().replace('_', '-');
    const prCiClass = t.pr?.ci === 'pass' ? 'ci-pass' : t.pr?.ci === 'fail' ? 'ci-fail' : 'ci-pending';
    const prCiLabel = t.pr?.ci === 'pass' ? 'CI Pass' : t.pr?.ci === 'fail' ? 'CI Fail' : 'CI Pending';
    const prRevLabel = t.pr?.review === 'approved' ? 'Approved' : t.pr?.review === 'changes' ? 'Changes Req' : 'Review Pending';

    return `
      <div class="feature-task-card" id="card-${t.id}">
        <div class="feature-task-top">
          <div class="task-title-group">
            <span class="task-chip ${statusClass}">${t.status}</span>
            <span class="priority-tag priority-${(t.priority || 'p2').toLowerCase()}">${t.priority || 'P2'}</span>
            <span class="task-heading">#${t.number || t.id}: ${t.title}</span>
          </div>
          <span class="meta-tag">👤 ${t.assignee || 'Unassigned'}</span>
        </div>

        <div class="task-desc">${t.description || ''}</div>

        <div class="feature-task-links">
          ${t.taskServerUrl ? `
            <a href="#" class="link-pill link-task-server" onclick="event.preventDefault(); window.robos.openUrl('${t.taskServerUrl}')" title="Open task server issue">
              🔗 Task Server Issue #${t.number} ↗
            </a>
          ` : ''}
          ${t.pr?.url ? `
            <a href="#" class="link-pill link-pr" onclick="event.preventDefault(); window.robos.openUrl('${t.pr.url}')" title="Open Pull Request">
              🌿 PR #${t.pr.number}: ${t.pr.branch} ↗
            </a>
            <span class="ci-badge ${prCiClass}">${prCiLabel}</span>
            <span class="badge-subtle">${prRevLabel}</span>
          ` : ''}
        </div>

        <!-- Task Drawer: Lifetime Ticket State Tab -->
        <div class="task-drawer">
          <div class="task-tabs-nav">
            <button class="btn-task-tab ${!isLifetimeOpen ? 'active' : ''}" onclick="window.setTaskDrawerTab('${t.id}', 'overview')">Overview</button>
            <button class="btn-task-tab btn-lifetime-tab ${isLifetimeOpen ? 'active' : ''}" id="btn-lifetime-${t.id}" onclick="window.setTaskDrawerTab('${t.id}', 'lifetime')">
              ⏱️ Ticket State Over Lifetime (${(t.lifetimeHistory || []).length} events)
            </button>
          </div>

          ${isLifetimeOpen ? `
            <div class="lifetime-timeline" id="lifetime-timeline-${t.id}">
              ${(t.lifetimeHistory || []).map(event => {
                const stCls = (event.state || '').toLowerCase();
                return `
                  <div class="timeline-item ${stCls}">
                    <div class="timeline-marker"></div>
                    <div class="timeline-header">
                      <span class="timeline-state-pill">${event.state}</span>
                      <span class="timeline-time">${new Date(event.timestamp).toLocaleString()}</span>
                      <span class="timeline-actor">👤 ${event.actor}</span>
                    </div>
                    <div class="timeline-note">${event.note}</div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.setTaskDrawerTab = function(taskId, tabName) {
  appState.taskLifetimeActive[taskId] = (tabName === 'lifetime');
  renderFeatures(appState.allFeatures, appState.activeFeature);
};

// ── Absorbed Notifications Rendering & Operations ────────────────────────────

function filterNotifications(notifs) {
  return notifs.filter(n => {
    // Category filter
    const cat = n.category || 'system';
    if (!appState.notifCategoryFilters[cat]) return false;

    // Tier filter
    const tier = n.tier || 'info';
    if (!appState.notifTierFilters[tier]) return false;

    // Search query
    if (appState.notifSearchQuery) {
      const q = appState.notifSearchQuery.toLowerCase();
      const matchTitle = (n.title || '').toLowerCase().includes(q);
      const matchBody  = (n.body || '').toLowerCase().includes(q);
      const matchCat   = (n.category || '').toLowerCase().includes(q);
      if (!matchTitle && !matchBody && !matchCat) return false;
    }

    // Date filter
    if (appState.notifDateFilter && n.ts) {
      const notifTime = new Date(n.ts).getTime();
      const now = Date.now();
      if (appState.notifDateFilter === 'today' && now - notifTime > 86400000) return false;
      if (appState.notifDateFilter === '7d' && now - notifTime > 7 * 86400000) return false;
      if (appState.notifDateFilter === '30d' && now - notifTime > 30 * 86400000) return false;
    }

    return true;
  });
}

function renderNotifications(notifs) {
  appState.allNotifications = notifs;

  // Unread badge counts per category
  const catCounts = { pr_review: 0, ci_cd: 0, task: 0, agent: 0, system: 0 };
  notifs.forEach(n => {
    if (!n.read) {
      const c = n.category || 'system';
      if (catCounts[c] !== undefined) catCounts[c]++;
    }
  });

  Object.entries(catCounts).forEach(([cat, count]) => {
    const el = document.getElementById(`badge-${cat}`);
    if (el) el.textContent = count;
  });

  const unreadTotal = notifs.filter(n => !n.read).length;
  const unreadBadge = document.getElementById('notif-unread-count-badge');
  if (unreadBadge) unreadBadge.textContent = `${unreadTotal} Unread`;

  const statUnread = document.getElementById('stat-unread');
  const statTotal  = document.getElementById('stat-total');
  if (statUnread) statUnread.textContent = `${unreadTotal} unread`;
  if (statTotal)  statTotal.textContent  = `${notifs.length} total`;

  const filtered = filterNotifications(notifs);
  const listEl   = document.getElementById('notif-list');
  const emptyEl  = document.getElementById('notif-empty-state');

  if (!listEl) return;

  if (!filtered.length) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');

  listEl.innerHTML = filtered.map(n => {
    const isUnread = !n.read;
    const cat = n.category || 'system';
    const tier = n.tier || 'info';

    return `
      <div class="notif-card ${isUnread ? 'unread' : ''} tier-${tier}" id="notif-card-${n.id}">
        <div class="notif-icon-wrap">
          ${cat === 'ci_cd' ? '⚙️' : cat === 'pr_review' ? '🌿' : cat === 'task' ? '📋' : cat === 'agent' ? '🤖' : '🔔'}
        </div>
        <div class="notif-content">
          <div class="notif-top">
            <span class="notif-pill ${cat}">${cat.replace('_', ' ')}</span>
            <span class="notif-title">${n.title || 'Notification'}</span>
            <span class="notif-time">${timeAgo(n.ts)}</span>
          </div>
          <div class="notif-body">${n.body || ''}</div>
          <div class="notif-actions">
            ${n.action?.url ? `
              <button class="btn-notif-action" onclick="window.robos.openUrl('${n.action.url}')">View Details ↗</button>
            ` : ''}
            ${isUnread ? `
              <button class="btn-notif-read" onclick="window.markNotifRead('${n.id}')">✓ Mark Read</button>
            ` : ''}
            <button class="btn-notif-del" onclick="window.deleteNotif('${n.id}')" title="Delete notification">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.switchNotifView = function(view) {
  appState.notifSubView = view;
  const listBtn = document.getElementById('notif-tab-btn-list');
  const prefsBtn = document.getElementById('notif-tab-btn-prefs');
  const listView = document.getElementById('notif-view-list');
  const prefsView = document.getElementById('notif-view-prefs');

  if (view === 'list') {
    listBtn?.classList.add('active');
    prefsBtn?.classList.remove('active');
    listView?.classList.remove('hidden');
    prefsView?.classList.add('hidden');
  } else {
    listBtn?.classList.remove('active');
    prefsBtn?.classList.add('active');
    listView?.classList.add('hidden');
    prefsView?.classList.remove('hidden');
    loadPrefsToUI();
  }
};

async function loadPrefsToUI() {
  const prefs = await window.robos.notifications.getPrefs();
  appState.notifPrefs = prefs;
  const qEnabled = document.getElementById('pref-quiet-enabled');
  const qStart = document.getElementById('pref-quiet-start');
  const qEnd = document.getElementById('pref-quiet-end');
  const dndToggle = document.getElementById('pref-dnd');

  if (qEnabled) qEnabled.checked = !!prefs.quietHours?.enabled;
  if (qStart && prefs.quietHours?.start) qStart.value = prefs.quietHours.start;
  if (qEnd && prefs.quietHours?.end) qEnd.value = prefs.quietHours.end;
  if (dndToggle) dndToggle.checked = !!prefs.dnd;
}

window.saveNotifPrefsFromUI = async function() {
  const qEnabled = document.getElementById('pref-quiet-enabled')?.checked || false;
  const qStart = document.getElementById('pref-quiet-start')?.value || '22:00';
  const qEnd = document.getElementById('pref-quiet-end')?.value || '07:00';
  const dndToggle = document.getElementById('pref-dnd')?.checked || false;

  const newPrefs = {
    ...appState.notifPrefs,
    quietHours: { enabled: qEnabled, start: qStart, end: qEnd },
    dnd: dndToggle,
  };

  await window.robos.notifications.savePrefs(newPrefs);
  const statusMsg = document.getElementById('pref-status-msg');
  if (statusMsg) {
    statusMsg.style.display = 'inline';
    setTimeout(() => { statusMsg.style.display = 'none'; }, 2500);
  }
};

window.markNotifRead = async function(id) {
  await window.robos.notifications.markRead(id);
  const notifs = await window.robos.notifications.getNotifications();
  renderNotifications(notifs);
  updateKPIRibbon();
};

window.deleteNotif = async function(id) {
  await window.robos.notifications.deleteNotification(id);
  const notifs = await window.robos.notifications.getNotifications();
  renderNotifications(notifs);
  updateKPIRibbon();
};

window.setSearch = function(q) {
  const notifSearch = document.getElementById('notif-search-input');
  if (notifSearch) notifSearch.value = q;
  appState.notifSearchQuery = q;
  renderNotifications(appState.allNotifications);
};

// ── Render Other Cards (Tasks, PRs, Reviews, Blockers, Standup, Activity) ────

function filterIssues(issues, filter, query) {
  return issues.filter(issue => {
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
  if (countEl) countEl.textContent = filtered.length;

  if (!appState.taskServer || !appState.taskServer.repos || !appState.taskServer.repos.length) {
    if (el) el.innerHTML = '<div class="placeholder">No task server configured. Open Task Servers app to set up.</div>';
    return;
  }

  if (!filtered.length) {
    if (el) el.innerHTML = '<div class="placeholder">No assigned tasks matching filter</div>';
    return;
  }

  if (!el) return;
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
  if (countEl) countEl.textContent = filtered.length;

  if (!el) return;
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
  if (countEl) countEl.textContent = reviews.length;

  if (!el) return;
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

  if (!el) return;
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
  if (!el) return;
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

  // Feature selector dropdown
  const featSelect = document.getElementById('feature-selector');
  if (featSelect) {
    featSelect.addEventListener('change', async (e) => {
      const res = await window.robos.setActiveFeature(e.target.value);
      if (res.ok) {
        renderFeatures(res.features, res.activeFeature);
        updateKPIRibbon();
      }
    });
  }

  // Feature status button ("Set In Progress")
  const btnSetProgress = document.getElementById('btn-set-feature-progress');
  if (btnSetProgress) {
    btnSetProgress.addEventListener('click', async () => {
      if (!appState.activeFeature) return;
      const res = await window.robos.updateFeatureStatus(appState.activeFeature.id, 'IN_PROGRESS');
      if (res.ok) {
        renderFeatures(res.features, res.activeFeature);
        updateKPIRibbon();
      }
    });
  }

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

  // Notifications Category Filters
  document.querySelectorAll('#notif-category-filters input').forEach(input => {
    input.addEventListener('change', (e) => {
      const cat = e.target.dataset.cat;
      appState.notifCategoryFilters[cat] = e.target.checked;
      renderNotifications(appState.allNotifications);
    });
  });

  // Notifications Tier Filters
  document.querySelectorAll('#notif-tier-filters input').forEach(input => {
    input.addEventListener('change', (e) => {
      const tier = e.target.dataset.tier;
      appState.notifTierFilters[tier] = e.target.checked;
      renderNotifications(appState.allNotifications);
    });
  });

  // Notifications Date Filter
  const notifDate = document.getElementById('filter-date');
  if (notifDate) {
    notifDate.addEventListener('change', (e) => {
      appState.notifDateFilter = e.target.value;
      renderNotifications(appState.allNotifications);
    });
  }

  // Notifications Text Filter
  const notifSearch = document.getElementById('notif-search-input');
  if (notifSearch) {
    notifSearch.addEventListener('input', (e) => {
      appState.notifSearchQuery = e.target.value.trim();
      renderNotifications(appState.allNotifications);
    });
  }

  // Bulk Notification Actions
  document.getElementById('btn-mark-all-read')?.addEventListener('click', async () => {
    await window.robos.notifications.markAllRead();
    const notifs = await window.robos.notifications.getNotifications();
    renderNotifications(notifs);
    updateKPIRibbon();
  });

  document.getElementById('btn-clear-read')?.addEventListener('click', async () => {
    await window.robos.notifications.clearRead();
    const notifs = await window.robos.notifications.getNotifications();
    renderNotifications(notifs);
    updateKPIRibbon();
  });

  document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
    await window.robos.notifications.clearAll();
    renderNotifications([]);
    updateKPIRibbon();
  });

  document.getElementById('btn-save-prefs')?.addEventListener('click', () => {
    window.saveNotifPrefsFromUI();
  });

  // IPC Event Listeners from Main
  window.robos.onSwitchTab((tab) => applyViewTab(tab));

  window.robos.onDataUpdated(async (data) => {
    if (data.issues) appState.allIssues = data.issues;
    if (data.prs) appState.allPRs = data.prs;
    if (data.reviews) appState.allReviews = data.reviews;
    if (data.activity) appState.allEvents = data.activity;
    if (data.features) appState.allFeatures = data.features;
    if (data.activeFeature) appState.activeFeature = data.activeFeature;

    appState.allBlockers = detectBlockers(appState.allIssues, appState.allPRs);

    const notifs = await window.robos.notifications.getNotifications();
    renderNotifications(notifs);
    renderFeatures(appState.allFeatures, appState.activeFeature);
    renderTasks(appState.allIssues);
    renderPRs(appState.allPRs);
    renderReviews(appState.allReviews);
    renderBlockers(appState.allBlockers);
    renderStandup(generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers));
    renderActivity(appState.allEvents);
    updateKPIRibbon();
  });

  window.robos.onTrafficNotification((notif) => {
    // Traffic notification received: reload and pulse header bell
    window.robos.notifications.getNotifications().then(notifs => {
      renderNotifications(notifs);
      updateKPIRibbon();
    });
  });
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

  // Fetch data concurrently
  const [issuesRes, prsRes, reviewsRes, activityRes, featuresRes, notifsRes] = await Promise.all([
    window.robos.getMyIssues(),
    window.robos.getMyPRs(),
    window.robos.getReviewRequests(),
    window.robos.getRecentActivity(),
    window.robos.getFeatures(),
    window.robos.notifications.getNotifications(),
  ]);

  appState.allIssues  = issuesRes.ok  ? issuesRes.data  : [];
  appState.allPRs     = prsRes.ok     ? prsRes.data     : [];
  appState.allReviews = reviewsRes.ok ? reviewsRes.data : [];
  appState.allEvents  = activityRes.ok ? activityRes.data : [];
  appState.allBlockers = detectBlockers(appState.allIssues, appState.allPRs);

  if (featuresRes.ok) {
    appState.allFeatures = featuresRes.data;
    appState.activeFeature = featuresRes.activeFeature;
  }

  renderNotifications(notifsRes || []);
  renderFeatures(appState.allFeatures, appState.activeFeature);
  renderTasks(appState.allIssues);
  renderPRs(appState.allPRs);
  renderReviews(appState.allReviews);
  renderBlockers(appState.allBlockers);
  renderStandup(generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers));
  renderActivity(appState.allEvents);

  updateKPIRibbon();

  // Show error if no task server
  if (!ts && !issuesRes.ok) {
    const tasksEl = document.getElementById('tasks-list');
    if (tasksEl) {
      tasksEl.innerHTML = '<div class="placeholder">No task server configured. Open Task Servers app to set up.</div>';
    }
  }
}

init();

// Periodic UI refresh every 2 minutes as fallback
setInterval(init, 120000);
