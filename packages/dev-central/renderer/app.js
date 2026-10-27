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

  // Smart TV Casting State
  smartTvs: [],
  selectedTvId: null,
  tvCastSession: null,
  tvPortalUrl: 'http://127.0.0.1:19210',
  tvCastUrl: 'http://127.0.0.1:19210/dev-central',

  // RobOS Calendar Events & Google / Thunderbird State
  calendarEvents: [],
  calendarFilter: 'all',
  calendarAccount: null,
  calendarThunderbird: null,
  calendarSyncMode: 'caldav-ready',
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
  const states=(pr.statusCheckRollup||[]).map(c=>(c.status==='COMPLETED'?c.conclusion:c.status||c.state||'PENDING').toUpperCase());
  if(states.some(s=>['FAILURE','ERROR','TIMED_OUT','CANCELLED','ACTION_REQUIRED','STARTUP_FAILURE'].includes(s)))return 'fail';
  return states.includes('SUCCESS')&&states.every(s=>['SUCCESS','NEUTRAL','SKIPPED'].includes(s))?'pass':'pending';
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
  // Include today's scheduled calendar events in today's standup plan
  const todayDateStr = new Date().toDateString();
  for (const ev of (appState.calendarEvents || [])) {
    if (ev.start && new Date(ev.start).toDateString() === todayDateStr) {
      const timeStr = new Date(ev.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      today.push(`📅 ${timeStr} — ${ev.summary}`);
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
  const calValEl = document.getElementById('kpi-calendar-val');
  const calDeltaEl = document.getElementById('kpi-calendar-delta');

  if (tasksEl) tasksEl.textContent = appState.allIssues.length;
  if (prsEl) prsEl.textContent = appState.allPRs.length;
  if (reviewsEl) reviewsEl.textContent = appState.allReviews.length;
  if (blockersEl) blockersEl.textContent = appState.allBlockers.length;
  if (calValEl) calValEl.textContent = appState.calendarEvents.length;
  if (calDeltaEl) {
    const todayStr = new Date().toDateString();
    const todayCount = appState.calendarEvents.filter(e => e.start && new Date(e.start).toDateString() === todayStr).length;
    calDeltaEl.textContent = todayCount > 0 ? `${todayCount} today · CalDAV` : (appState.calendarAccount?.email ? 'CalDAV Ready' : 'Local Agenda');
  }

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
  const tabCalendarBadge = document.getElementById('tab-calendar-badge');
  const headerNotifBadge = document.getElementById('header-notif-badge');
  const headerNotifBtn = document.getElementById('btn-header-notifs');

  if (tabTasksBadge) tabTasksBadge.textContent = appState.allIssues.length;
  if (tabPrsBadge) tabPrsBadge.textContent = appState.allPRs.length;
  if (tabBlockersBadge) tabBlockersBadge.textContent = appState.allBlockers.length;
  if (tabFeatureBadge && appState.activeFeature) tabFeatureBadge.textContent = appState.activeFeature.status;
  if (tabNotifsBadge) tabNotifsBadge.textContent = unread;
  if (tabCalendarBadge) tabCalendarBadge.textContent = appState.calendarEvents.length;
  if (headerNotifBadge) headerNotifBadge.textContent = unread;

  if (headerNotifBtn) {
    headerNotifBtn.classList.toggle('has-unread', unread > 0);
  }
}

// ── Tab Navigation ───────────────────────────────────────────────────────────
function applyViewTab(tab) {
  appState.activeTab = tab;
  document.body.dataset.view = tab;
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
    calendar:  document.getElementById('calendar-card'),
    activity:  document.getElementById('activity-card'),
  };

  if (tab === 'all') {
    Object.values(cards).forEach(c => { if (c) c.style.display = ''; });
    // In overview Mission Control, show top cards
    if (cards.notifications) cards.notifications.style.display = '';
    if (cards.feature) cards.feature.style.display = '';
    if (cards.calendar) cards.calendar.style.display = '';
  } else if (tab === 'feature') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.feature) cards.feature.style.display = '';
  } else if (tab === 'notifications') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.notifications) cards.notifications.style.display = '';
  } else if (tab === 'tasks') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.tasks) cards.tasks.style.display = '';
  } else if (tab === 'prs') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.prs) cards.prs.style.display = '';
    if (cards.reviews) cards.reviews.style.display = '';
  } else if (tab === 'calendar') {
    Object.values(cards).forEach(c => { if (c) c.style.display = 'none'; });
    if (cards.calendar) cards.calendar.style.display = '';
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
  const completed = tasks.filter(t => /^(done|closed)$/i.test(t.status || '')).length;
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
    const statusClass = (t.status || 'not-started').toLowerCase().replace(/_/g, '-');
    const prCiClass = t.pr?.ci === 'pass' ? 'ci-pass' : t.pr?.ci === 'fail' ? 'ci-fail' : 'ci-pending';
    const prCiLabel = t.pr?.ci === 'pass' ? 'CI Pass' : t.pr?.ci === 'fail' ? 'CI Fail' : 'CI Pending';
    const prRevLabel = t.pr?.review === 'approved' ? 'Approved' : t.pr?.review === 'changes' ? 'Changes Req' : 'Review Pending';

    return `
      <div class="feature-task-card" id="card-${t.id}">
        <div class="feature-task-top">
          <div class="task-title-group">
            <span class="task-chip ${statusClass}">${String(t.status || '').replace(/[-_]/g, ' ')}</span>
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
  const deliveryMode = document.getElementById('pref-delivery-mode');
  const gnomeEnabled = document.getElementById('pref-gnome-enabled');
  const antiSpamEnabled = document.getElementById('pref-antispam-enabled');
  const antiSpamCooldown = document.getElementById('pref-antispam-cooldown');
  const antiSpamBurst = document.getElementById('pref-antispam-burst');
  const antiSpamBypass = document.getElementById('pref-antispam-bypass');

  if (qEnabled) qEnabled.checked = !!prefs.quietHours?.enabled;
  if (qStart && prefs.quietHours?.start) qStart.value = prefs.quietHours.start;
  if (qEnd && prefs.quietHours?.end) qEnd.value = prefs.quietHours.end;
  if (dndToggle) dndToggle.checked = !!prefs.dnd;
  if (deliveryMode && prefs.deliveryMode) deliveryMode.value = prefs.deliveryMode;
  if (gnomeEnabled) gnomeEnabled.checked = prefs.enableGnomeNotifications !== false;
  if (antiSpamEnabled) antiSpamEnabled.checked = prefs.antiSpam?.enabled !== false;
  if (antiSpamCooldown && prefs.antiSpam?.cooldownSeconds) antiSpamCooldown.value = String(prefs.antiSpam.cooldownSeconds);
  if (antiSpamBurst && prefs.antiSpam?.maxBurst) antiSpamBurst.value = String(prefs.antiSpam.maxBurst);
  if (antiSpamBypass) antiSpamBypass.checked = prefs.antiSpam?.bypassForSecurityAndCritical !== false;
}

window.saveNotifPrefsFromUI = async function() {
  const qEnabled = document.getElementById('pref-quiet-enabled')?.checked || false;
  const qStart = document.getElementById('pref-quiet-start')?.value || '22:00';
  const qEnd = document.getElementById('pref-quiet-end')?.value || '07:00';
  const dndToggle = document.getElementById('pref-dnd')?.checked || false;
  const deliveryMode = document.getElementById('pref-delivery-mode')?.value || 'dual';
  const gnomeEnabled = document.getElementById('pref-gnome-enabled')?.checked !== false;
  const antiSpamEnabled = document.getElementById('pref-antispam-enabled')?.checked !== false;
  const antiSpamCooldown = parseInt(document.getElementById('pref-antispam-cooldown')?.value || '30', 10);
  const antiSpamBurst = parseInt(document.getElementById('pref-antispam-burst')?.value || '4', 10);
  const antiSpamBypass = document.getElementById('pref-antispam-bypass')?.checked !== false;

  const currentPrefs = appState.notifPrefs || {};
  const newPrefs = {
    ...currentPrefs,
    quietHours: { ...(currentPrefs.quietHours || {}), enabled: qEnabled, start: qStart, end: qEnd },
    dnd: dndToggle,
    deliveryMode,
    enableGnomeNotifications: gnomeEnabled,
    antiSpam: {
      ...(currentPrefs.antiSpam || {}),
      enabled: antiSpamEnabled,
      cooldownSeconds: antiSpamCooldown,
      maxBurst: antiSpamBurst,
      bypassForSecurityAndCritical: antiSpamBypass,
    },
  };

  await window.robos.notifications.savePrefs(newPrefs);
  appState.notifPrefs = newPrefs;
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
        const isProg = stage.includes('progress') || stage.includes('implementing') || stage === 'in-progress' || stage === 'in_progress';
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
  const el=document.getElementById('prs-list');if(!el)return;
  const q=appState.searchQuery.toLowerCase();
  const passingOnly=document.getElementById('prs-passing-only')?.checked;
  const filtered=prs.filter(pr=>(!passingOnly||ciStatus(pr)==='pass')&&[pr.number,pr.title,pr.headRefName,pr.repo].join(' ').toLowerCase().includes(q))
    .sort((a,b)=>(ciStatus(b)==='pass')-(ciStatus(a)==='pass')||new Date(b.updatedAt)-new Date(a.updatedAt));
  document.getElementById('prs-count').textContent=filtered.length;
  el.replaceChildren();
  if(appState.prWarning){const warning=document.createElement('p');warning.className='pr-action-status';warning.role='alert';warning.textContent=appState.prWarning;el.append(warning);}
  if(!filtered.length){const empty=document.createElement('div');empty.className='placeholder';empty.textContent=passingOnly?'No PRs with passing CI.':'No open pull requests.';el.append(empty);return;}
  for(const pr of filtered){
    const ci=ciStatus(pr),row=document.createElement('article');row.className='pr-row';
    const info=document.createElement('div');info.className='pr-info';
    const title=document.createElement('button');title.className='pr-title-link';title.textContent=pr.title;
    const meta=document.createElement('p');meta.className='pr-meta';meta.textContent=`${pr.repo||new URL(pr.url).pathname.split('/').slice(1,3).join('/')} #${pr.number} · ${pr.isDraft?'Draft':'In review'} · ${timeAgo(pr.updatedAt)}`;
    const status=document.createElement('span');status.className='ci-badge ci-'+ci;status.textContent=ci==='pass'?'CI passing':ci==='fail'?'CI failed':'CI pending';
    const actions=document.createElement('div');actions.className='pr-row-actions';
    const notice=document.createElement('p');notice.className='pr-action-status';notice.role='status';
    const review=document.createElement('button');review.className='pr-review-action';review.textContent='Open code review';
    const open=async()=>{review.disabled=true;notice.textContent='Opening code review…';try{const r=await window.robos.openReview(pr.url);if(!r.ok)throw Error(r.error);notice.textContent='Code review opened.';}catch(e){notice.textContent=e.message;}finally{review.disabled=false;}};
    review.onclick=open;title.onclick=open;
    actions.append(status,review);
    if(pr.isDraft&&pr.state==='OPEN'&&ci==='pass'){
      const ready=document.createElement('button');ready.className='pr-ready-action';ready.textContent='Move from draft to ready';
      ready.onclick=async()=>{ready.disabled=true;notice.textContent='Checking GitHub…';try{const r=await window.robos.readyPR(pr.url,pr.headRefOid);if(!r.ok)throw Error(r.error);Object.assign(pr,r.pr);renderPRs(appState.allPRs);}catch(e){notice.textContent=e.message;ready.disabled=false;}};actions.append(ready);
    }
    const github=document.createElement('button');github.className='pr-github-action';github.textContent='GitHub ↗';github.onclick=()=>window.robos.openUrl(pr.url);actions.append(github);
    info.append(title,meta);row.append(info,actions,notice);el.append(row);
  }
}
document.getElementById('prs-passing-only')?.addEventListener('change',()=>renderPRs(appState.allPRs));

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

// ── Smart TV Dashboard Casting ───────────────────────────────────────────────

function buildDashboardCastSnapshot() {
  const failedPrs = appState.allPRs.filter(pr => ciStatus(pr) === 'fail').length;
  const ciPct = appState.allPRs.length
    ? `${Math.round(((appState.allPRs.length - failedPrs) / appState.allPRs.length) * 100)}%`
    : '100%';
  const feat = appState.activeFeature;
  const featTasks = (feat && Array.isArray(feat.tasks)) ? feat.tasks : [];
  const featDone = featTasks.filter(t => t.status === 'DONE' || t.status === 'MERGED').length;
  const progressPct = featTasks.length ? Math.round((featDone / featTasks.length) * 100) : 75;

  return {
    sprintName: document.getElementById('sprint-pill')?.textContent || 'Sprint 42',
    activeTab: appState.activeTab || 'all',
    activeFeature: feat
      ? {
          id: feat.id,
          code: feat.code,
          name: feat.name,
          status: feat.status,
          repository: feat.repository,
          service: feat.service,
          progressPct,
        }
      : null,
    kpis: {
      featureCode: feat ? feat.code : 'FEAT-42',
      featureStatus: feat ? feat.status.replace('_', ' ') : 'IN PROGRESS',
      tasksCount: appState.allIssues.length,
      prsCount: appState.allPRs.length,
      reviewsCount: appState.allReviews.length,
      blockersCount: appState.allBlockers.length,
      ciHealth: ciPct,
    },
    issues: appState.allIssues.slice(0, 6),
    prs: appState.allPRs.slice(0, 5),
    reviews: appState.allReviews.slice(0, 5),
    blockers: appState.allBlockers.slice(0, 5),
    standup: generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers),
  };
}

function updateHeaderCastButton() {
  const btn = document.getElementById('btn-cast-tv');
  const label = document.getElementById('btn-cast-tv-label');
  const badge = document.getElementById('tv-cast-status-badge');
  if (!btn) return;

  const isActive = Boolean(appState.tvCastSession && appState.tvCastSession.active);
  btn.classList.toggle('casting-active', isActive);
  if (isActive) {
    if (label) label.textContent = `Casting: ${appState.tvCastSession.tvName || 'Smart TV'}`;
    if (badge) badge.textContent = 'LIVE';
  } else {
    if (label) label.textContent = 'Cast to TV';
    if (badge) badge.textContent = appState.smartTvs.length ? `${appState.smartTvs.length} TVs` : 'TV';
  }
}

function renderSmartTvCastList() {
  const listEl = document.getElementById('tv-cast-list');
  const subEl = document.getElementById('tv-cast-portal-url');
  const bannerEl = document.getElementById('tv-cast-active-banner');
  if (!listEl) return;

  if (subEl && appState.tvCastUrl) {
    subEl.textContent = `10-Foot TV Wallboard Endpoint: ${appState.tvCastUrl} · Select any paired Smart TV below to cast your live Dev Central dashboard.`;
  }

  if (bannerEl) {
    if (appState.tvCastSession && appState.tvCastSession.active) {
      bannerEl.classList.remove('hidden');
      bannerEl.innerHTML = `<strong>● Live Dashboard Cast Active</strong> → <strong>${appState.tvCastSession.tvName}</strong> (${appState.tvCastSession.tvIp}) · Serving 10-foot wallboard at <code>${appState.tvCastUrl}</code>`;
    } else {
      bannerEl.classList.add('hidden');
      bannerEl.innerHTML = '';
    }
  }

  if (!appState.smartTvs.length) {
    listEl.innerHTML = '<div class="placeholder">No paired Smart TVs found. Click "Open Smart TV Studio" to discover or pair a TV on your LAN.</div>';
    return;
  }

  if (!appState.selectedTvId || !appState.smartTvs.some(t => t.id === appState.selectedTvId)) {
    appState.selectedTvId = (appState.tvCastSession && appState.tvCastSession.tvId) || appState.smartTvs[0].id;
  }

  listEl.innerHTML = appState.smartTvs
    .map(tv => {
      const selected = tv.id === appState.selectedTvId;
      const isCurrentlyCasting = Boolean(
        appState.tvCastSession && appState.tvCastSession.active && appState.tvCastSession.tvId === tv.id
      );
      return `
        <button type="button" class="tv-cast-item ${selected ? 'selected' : ''}" data-tv-id="${tv.id}">
          <div class="tv-cast-item-main">
            <div class="tv-cast-item-name">📺 ${tv.name} ${isCurrentlyCasting ? '· (Casting Now)' : ''}</div>
            <div class="tv-cast-item-meta">${tv.ip} · ${tv.model || tv.platformName} · ${tv.sideloadStatus || 'Ready'}</div>
          </div>
          <div class="tv-cast-item-right">
            <span class="tv-cast-pill">${isCurrentlyCasting ? '● LIVE CAST' : selected ? '✓ Selected' : 'Select TV'}</span>
          </div>
        </button>
      `;
    })
    .join('');

  listEl.querySelectorAll('.tv-cast-item').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.selectedTvId = btn.dataset.tvId;
      renderSmartTvCastList();
    });
  });
}

async function loadSmartTvs() {
  if (!window.robos || typeof window.robos.getSmartTvs !== 'function') return;
  try {
    const res = await window.robos.getSmartTvs();
    if (res && res.ok) {
      appState.smartTvs = Array.isArray(res.tvs) ? res.tvs : [];
      appState.tvCastSession = res.devCentralCast || null;
      if (res.portalUrl) appState.tvPortalUrl = res.portalUrl;
      if (res.castUrl) appState.tvCastUrl = res.castUrl;
      if (!appState.selectedTvId && appState.smartTvs.length) {
        appState.selectedTvId = (res.devCentralCast && res.devCentralCast.tvId) || appState.smartTvs[0].id;
      }
      updateHeaderCastButton();
      renderSmartTvCastList();
    }
  } catch {}
}

window.openTvCastModal = async function() {
  const modal = document.getElementById('tv-cast-modal');
  if (modal) modal.classList.remove('hidden');
  await loadSmartTvs();
};

window.closeTvCastModal = function() {
  const modal = document.getElementById('tv-cast-modal');
  if (modal) modal.classList.add('hidden');
};

window.refreshSmartTvList = async function() {
  const alertEl = document.getElementById('tv-cast-permission-alert');
  await loadSmartTvs();
  if (appState.selectedTvId && window.robos && typeof window.robos.diagnoseSmartTv === 'function') {
    const diag = await window.robos.diagnoseSmartTv(appState.selectedTvId);
    if (diag && diag.ok && diag.allControlReady && alertEl) {
      alertEl.classList.add('hidden');
      alertEl.innerHTML = '';
    }
  }
};

window.castDashboardToSelectedTv = async function() {
  if (!window.robos || typeof window.robos.castDashboardToTv !== 'function') return;
  const tvId = appState.selectedTvId || (appState.smartTvs[0] && appState.smartTvs[0].id);
  const dashboard = buildDashboardCastSnapshot();
  const btn = document.getElementById('btn-cast-dashboard-now');
  const alertEl = document.getElementById('tv-cast-permission-alert');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '📡 Casting Dashboard to TV...';
  }
  try {
    const res = await window.robos.castDashboardToTv({ tvId, dashboard });
    if (res.castSession) appState.tvCastSession = res.castSession;
    if (res.castUrl) appState.tvCastUrl = res.castUrl;
    if (res.portalUrl) appState.tvPortalUrl = res.portalUrl;
    updateHeaderCastButton();
    renderSmartTvCastList();

    if (res.blocked && alertEl) {
      const stepsHtml = Array.isArray(res.setupSteps) && res.setupSteps.length
        ? `<ol>${res.setupSteps.map(s => `<li>${s}</li>`).join('')}</ol>`
        : '';
      alertEl.classList.remove('hidden');
      alertEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <strong>⚠️ ${res.setupTitle || 'TV Remote Control Permission Required'}</strong>
          <button class="btn btn-secondary-sm" onclick="window.castDashboardToSelectedTv()">↻ Refresh / Try Again</button>
        </div>
        <div style="margin-top:6px;">${res.setupMessage || res.message || ''}</div>
        ${stepsHtml}
        <div style="margin-top:8px;color:#a7f3d0;">✓ Note: Your 10-Foot Dev Central Wallboard is already live at <code>${appState.tvCastUrl}</code>. Once you re-enable the TV setting above, click <strong>↻ Refresh / Try Again</strong>.</div>
      `;
    } else if (alertEl) {
      alertEl.classList.add('hidden');
      alertEl.innerHTML = '';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📺 Cast Dashboard to Selected TV';
    }
  }
};

window.stopDashboardTvCast = async function() {
  if (!window.robos || typeof window.robos.stopTvCast !== 'function') return;
  const res = await window.robos.stopTvCast({ tvId: appState.selectedTvId });
  if (res && res.ok) {
    appState.tvCastSession = res.devCentralCast || null;
    const alertEl = document.getElementById('tv-cast-permission-alert');
    if (alertEl) {
      alertEl.classList.add('hidden');
      alertEl.innerHTML = '';
    }
    updateHeaderCastButton();
    renderSmartTvCastList();
  }
};

window.previewTvWallboard = function() {
  const url = appState.tvCastUrl || 'http://127.0.0.1:19210/dev-central';
  if (window.robos && typeof window.robos.openUrl === 'function') {
    window.robos.openUrl(url);
  }
};

window.openSmartTvStudioApp = function() {
  if (window.robos && typeof window.robos.openTvStudio === 'function') {
    window.robos.openTvStudio();
  }
};

// ── RobOS Calendar Events & Google / Thunderbird Integration ─────────────────

function formatEventTimeRange(startStr, endStr) {
  if (!startStr) return 'All Day';
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : null;
  const now = new Date();
  const isToday = start.toDateString() === now.toDateString();
  const dayLabel = isToday
    ? 'Today'
    : start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t1 = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const t2 = end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  return t2 ? `${dayLabel} · ${t1} – ${t2}` : `${dayLabel} · ${t1}`;
}

function renderCalendarEvents(events = appState.calendarEvents) {
  const listEl = document.getElementById('calendar-events-list');
  const countEl = document.getElementById('calendar-events-count');
  const acctBadgeEl = document.getElementById('calendar-account-badge');
  const summaryEl = document.getElementById('calendar-sync-summary');

  const acctEmail = appState.calendarAccount?.email || 'nicholas.dipiazza@gmail.com';
  if (acctBadgeEl) {
    acctBadgeEl.textContent = `Google (${acctEmail})`;
  }
  if (summaryEl) {
    const tbConfigured = appState.calendarAccount?.thunderbirdConfigured || appState.calendarThunderbird?.configuredAccounts?.length > 0;
    summaryEl.innerHTML = `Connected to <strong>RobOS Cloud Accounts</strong> (<code>${acctEmail}</code>) · ${tbConfigured ? '<span style="color:#3fb950;">✓ Thunderbird CalDAV &amp; CardDAV Synced</span>' : 'CalDAV Endpoint Ready'}`;
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const q = (appState.searchQuery || '').toLowerCase();

  const filtered = (events || []).filter(ev => {
    if (q) {
      const hay = `${ev.summary || ''} ${ev.description || ''} ${ev.location || ''} ${ev.category || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (appState.calendarFilter === 'today') {
      return ev.start && new Date(ev.start).toDateString() === todayStr;
    }
    if (appState.calendarFilter === 'upcoming') {
      return ev.start && new Date(ev.end || ev.start).getTime() >= now.getTime() - 1800000;
    }
    if (appState.calendarFilter === 'sprint') {
      return ['standup', 'sprint', 'review'].includes(ev.category);
    }
    return true;
  });

  if (countEl) countEl.textContent = filtered.length;
  if (!listEl) return;

  if (!filtered.length) {
    listEl.innerHTML = '<div class="placeholder">No matching calendar events. Click "+ Add Event" to schedule a meeting or focus block.</div>';
    return;
  }

  const categoryMeta = {
    standup: { icon: '🤖', label: 'Standup', color: '#00bcd4' },
    sprint:  { icon: '🏃', label: 'Sprint', color: '#a855f7' },
    review:  { icon: '👀', label: 'Code Review', color: '#3b82f6' },
    focus:   { icon: '🎯', label: 'Deep Focus', color: '#22c55e' },
    meeting: { icon: '📅', label: 'Google Calendar', color: '#eab308' },
  };

  listEl.innerHTML = filtered.map(ev => {
    const cat = categoryMeta[ev.category] || categoryMeta.meeting;
    const isToday = ev.start && new Date(ev.start).toDateString() === todayStr;
    const safeSummary = String(ev.summary || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeDesc = String(ev.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeLoc = String(ev.location || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <div class="list-item calendar-event-row" data-event-id="${ev.id}" style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:11px 14px;border-bottom:1px solid #21262d;">
        <div style="display:flex;align-items:flex-start;gap:11px;min-width:0;flex:1;">
          <div style="width:34px;height:34px;border-radius:8px;background:rgba(0,188,212,0.12);border:1px solid ${cat.color}55;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
            ${cat.icon}
          </div>
          <div style="min-width:0;flex:1;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:13.5px;color:#f0f6fc;">${safeSummary}</strong>
              <span class="badge-subtle" style="border:1px solid ${cat.color}66;color:${cat.color};">${cat.label}</span>
              ${isToday ? '<span class="badge-subtle" style="background:rgba(63,185,80,0.15);color:#3fb950;">Today</span>' : ''}
            </div>
            ${safeDesc ? `<div style="font-size:12px;color:#8b949e;margin-top:3px;">${safeDesc}</div>` : ''}
            <div style="font-size:11.5px;color:#8b949e;margin-top:5px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <span style="color:#58a6ff;font-weight:600;">🕒 ${formatEventTimeRange(ev.start, ev.end)}</span>
              ${safeLoc ? `<span>📍 ${safeLoc}</span>` : ''}
              <span>☁️ ${ev.calendarName || `Google Calendar (${acctEmail})`}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${ev.meetingUrl ? `<button class="btn btn-secondary-sm" onclick="window.robos.openUrl('${String(ev.meetingUrl).replace(/'/g, "\\'")}')">Join / Open</button>` : ''}
          <button class="btn btn-secondary-sm" title="Remove event" onclick="window.deleteDevCentralCalendarEvent('${String(ev.id).replace(/'/g, "\\'")}')">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadCalendarEvents() {
  if (!window.robos || typeof window.robos.getCalendarEvents !== 'function') return;
  try {
    const res = await window.robos.getCalendarEvents();
    if (res && res.ok) {
      appState.calendarEvents = Array.isArray(res.events) ? res.events : [];
      appState.calendarAccount = res.account || null;
      appState.calendarThunderbird = res.thunderbird || null;
      appState.calendarSyncMode = res.syncMode || 'caldav-ready';
      renderCalendarEvents(appState.calendarEvents);
      renderStandup(generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers));
      updateKPIRibbon();
    }
  } catch {}
}

window.toggleAddCalendarEventForm = function() {
  const form = document.getElementById('calendar-add-form');
  if (!form) return;
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    const startInput = document.getElementById('cal-input-start');
    const endInput = document.getElementById('cal-input-end');
    if (startInput && !startInput.value) {
      const s = new Date(Date.now() + 3600000);
      const e = new Date(Date.now() + 5400000);
      const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      startInput.value = toLocal(s);
      if (endInput) endInput.value = toLocal(e);
    }
    document.getElementById('cal-input-title')?.focus();
  }
};

window.submitNewCalendarEvent = async function() {
  const titleEl = document.getElementById('cal-input-title');
  const catEl = document.getElementById('cal-input-category');
  const startEl = document.getElementById('cal-input-start');
  const endEl = document.getElementById('cal-input-end');
  const locEl = document.getElementById('cal-input-location');
  const summary = titleEl ? titleEl.value.trim() : '';
  if (!summary) return;

  const res = await window.robos.addCalendarEvent({
    summary,
    category: catEl ? catEl.value : 'meeting',
    start: startEl && startEl.value ? new Date(startEl.value).toISOString() : undefined,
    end: endEl && endEl.value ? new Date(endEl.value).toISOString() : undefined,
    location: locEl ? locEl.value.trim() : '',
    meetingUrl: locEl && locEl.value.trim().startsWith('http') ? locEl.value.trim() : '',
  });
  if (res && res.ok) {
    if (titleEl) titleEl.value = '';
    if (locEl) locEl.value = '';
    document.getElementById('calendar-add-form')?.classList.add('hidden');
    appState.calendarEvents = res.events || [];
    renderCalendarEvents(appState.calendarEvents);
    renderStandup(generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers));
    updateKPIRibbon();
  }
};

window.deleteDevCentralCalendarEvent = async function(eventId) {
  if (!eventId || !window.robos?.deleteCalendarEvent) return;
  const res = await window.robos.deleteCalendarEvent(eventId);
  if (res && res.ok) {
    appState.calendarEvents = res.events || [];
    renderCalendarEvents(appState.calendarEvents);
    renderStandup(generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers));
    updateKPIRibbon();
  }
};

window.syncDevCentralCalendar = async function() {
  const btn = document.getElementById('btn-sync-calendar');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '🔄 Syncing...';
  }
  try {
    const res = await window.robos.syncThunderbirdCalendar(appState.calendarAccount?.id || null);
    if (res && res.ok) {
      appState.calendarEvents = res.events || [];
      appState.calendarAccount = res.account || appState.calendarAccount;
      appState.calendarThunderbird = res.thunderbird || appState.calendarThunderbird;
      renderCalendarEvents(appState.calendarEvents);
      updateKPIRibbon();
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Sync CalDAV';
    }
  }
};

window.openGoogleCalendarSetup = function() {
  window.robos?.openCalendarApp?.('google-calendar');
};

window.openThunderbirdCalendarApp = function() {
  window.robos?.openCalendarApp?.('thunderbird');
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

  // Calendar Filter Chips
  document.querySelectorAll('#calendar-filter-chips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#calendar-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      appState.calendarFilter = chip.dataset.calFilter || 'all';
      renderCalendarEvents(appState.calendarEvents);
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
      renderCalendarEvents(appState.calendarEvents);
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
    appState.prWarning=data.prWarning||'';
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
  appState.prWarning=prsRes.warning||prsRes.error||'';
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
  loadSmartTvs();
  loadCalendarEvents();

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
