'use strict';

// ── State Store ─────────────────────────────────────────────────────────────
const appState = {
  activeTab: 'feature',
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
  issueScope: 'all',
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

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
          text: `PR #${pr.number}: awaiting review ${window.robosList.time(pr.updatedAt)}`,
          url: pr.url,
          severity: 'medium',
        });
      }
    }
  }
  // Flag inactivity only when a workflow label actually says work is in progress.
  for (const issue of issues) {
    const inProgress = (issue.labels || []).some(l => /^state:in[-_]progress$/i.test(typeof l === 'string' ? l : l.name));
    if (inProgress && issue.updatedAt) {
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

  if (!yesterday.length) yesterday.push('No merged pull requests in the loaded data');
  if (!today.length) today.push('No open assigned tasks');
  if (!blockerList.length) blockerList.push('No active blockers across pipelines');

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
      healthEl.textContent = '—';
    } else {
      const passed = appState.allPRs.filter(pr => ciStatus(pr) === 'pass').length;
      const pct = Math.round((passed / appState.allPRs.length) * 100);
      healthEl.textContent = `${pct}%`;
    }
  }

  // Active feature KPI
  if (appState.activeFeature) {
    if (featValEl) featValEl.textContent = appState.activeFeature.code;
    if (featStEl) featStEl.textContent = appState.activeFeature.status.replace('_', ' ');
  }

  else {
    if (featValEl) featValEl.textContent = '—';
    if (featStEl) featStEl.textContent = 'No active epic';
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
  if (tabFeatureBadge) tabFeatureBadge.textContent = String(appState.allFeatures.filter(f=>f.assigned).length);
  if (tabNotifsBadge) tabNotifsBadge.textContent = unread;
  if (headerNotifBadge) headerNotifBadge.textContent = unread;

  if (headerNotifBtn) {
    headerNotifBtn.classList.toggle('has-unread', unread > 0);
  }
}

// ── Tab Navigation ───────────────────────────────────────────────────────────
function applyViewTab(tab) {
  if(['all','activity'].includes(tab))tab='feature';
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

const pendingTaskAssignments=new Set();
const pendingWorkLaunches=new Set();
function workProgressRow(t) {
  const p=t.progress;
  if(!p?.started)return '';
  const steps=states=>states.map(s=>`<span ${s.current?'class="current" aria-current="step"':''}>${escapeHTML(s.label)}</span>`).join('<span aria-hidden="true"> → </span>');
  return `<div class="work-progress" data-progress="${escapeHTML(t.id)}">
    <div><strong>${escapeHTML(p.label)}</strong> · <button class="link-pill" data-runner="${escapeHTML(t.id)}">${p.running?'● Agent running · Open Task Runner':'Open Task Runner session'}</button>${p.updatedAt?` <time title="${escapeHTML(new Date(p.updatedAt).toLocaleString())}">Updated ${escapeHTML(new Date(p.updatedAt).toLocaleTimeString())}</time>`:''}</div>
    <div class="workflow-steps" aria-label="Agent workflow">${steps(p.stages)}</div>
    ${t.workflow?`<div class="workflow-steps" aria-label="Ticket workflow">${escapeHTML(t.workflow.name)}: ${steps(t.workflow.states)}${t.workflow.ambiguous?' · Conflicting state labels':''}</div>`:'<div class="workflow-unconfigured">No ticket-type workflow configured.</div>'}
    <button class="link-pill" data-workflow>Configure in Workflow Studio</button>
    ${p.error?`<div class="work-error">${escapeHTML(p.error)}</div>`:''}
  </div>`;
}
let progressRefreshing=false;
async function refreshWorkProgress() {
  if(progressRefreshing || !appState.allFeatures?.length)return;
  progressRefreshing=true;
  try {
    const items=appState.allFeatures.flatMap(f=>[f,...f.tasks]);
    const updates=await window.robos.getWorkProgress([...new Set(items.map(t=>t.id))]);
    let changed=false;
    items.forEach(t=>{if(updates[t.id]&&JSON.stringify(t.progress)!==JSON.stringify(updates[t.id])){t.progress=updates[t.id];changed=true;}});
    if(changed)renderFeatures(appState.allFeatures,appState.activeFeature);
  } catch(error) { console.warn('Task progress refresh failed:',error.message); }
  finally {progressRefreshing=false;}
}
setInterval(refreshWorkProgress,2000);
function renderFeatures(features, activeFeature) {
  appState.allFeatures = features;
  appState.activeFeature = activeFeature || null;

  const mine=features.filter(f=>f.assigned || f.tasks.some(t=>t.assigned));
  document.getElementById('feature-status-badge').textContent=`${features.filter(f=>f.assigned).length} epics assigned`;
  const list=document.getElementById('feature-tasks-list');
  const collapsed=new Set([...list.querySelectorAll('details:not([open])')].map(d=>d.dataset.feature));
  list.innerHTML=mine.length ? mine.map(f=>`<details class="feature-task-card" data-feature="${escapeHTML(f.id)}" data-list-title="${escapeHTML(f.name)}" data-list-updated="${escapeHTML(f.updatedAt||'')}" ${collapsed.has(f.id)?'':'open'}><summary>
    <button class="link-pill" data-open="${escapeHTML(f.id)}" title="${escapeHTML(f.description.replace(/^#+ /gm,'').slice(0,400))}">${escapeHTML(f.code+': '+f.name)}</button>
    ${window.robosList.time(f.updatedAt)} <span class="task-chip">${escapeHTML(f.status)}</span> ${f.assigned?`<button class="unassign-feature" data-unassign="${escapeHTML(f.id)}">Unassign myself</button>`:'<span>Contains tasks assigned to you</span>'} · ${f.tasks.filter(t=>t.workable && !t.closed).length} workable
    </summary>${f.tasks.length?workProgressRow(f):''}${(f.tasks.length?f.tasks:[f]).map(t=>`<div class="feature-task-top" style="padding:12px 0">
    <button class="link-pill" data-open="${escapeHTML(t.id)}" title="${escapeHTML(t.description.replace(/^#+ /gm,'').slice(0,400))}">${escapeHTML(t.code+': '+t.title)}</button>
    ${window.robosList.time(t.updatedAt)} <span class="task-chip">${escapeHTML(t.progress?.started?t.progress.label:t.status)}</span>
    <span title="${escapeHTML(t.blockedBy.join(', '))}">${t.blockedBy.length?'Waiting for '+t.blockedBy.map(u=>'#'+u.split('/').pop()).join(', '):t.closed?'':'Dependencies satisfied'}</span>
    <button class="btn btn-secondary-sm" data-assign="${escapeHTML(t.id)}" ${t.assigned||pendingTaskAssignments.has(t.id)?'disabled':''} aria-busy="${pendingTaskAssignments.has(t.id)}">${pendingTaskAssignments.has(t.id)?'Assigning to you…':t.assigned?'Assigned to you':'Assign to me'}</button>
    <button class="btn btn-secondary-sm" data-work="${escapeHTML(t.id)}" ${t.workable&&!pendingWorkLaunches.has(t.id)?'':'disabled'} aria-busy="${pendingWorkLaunches.has(t.id)}" title="${t.workable?'Review sandbox settings and launch RobOS Agent Task Runner':'Waiting for dependencies'}">${pendingWorkLaunches.has(t.id)?'Launching…':t.progress?.started?'Continue work':'Work ticket'}</button>
    </div>${workProgressRow(t)}`).join('')}</details>`).join('') : '<p class="feature-empty">No epics assigned to you. Choose an epic to see its next workable tasks.</p>';
  const report=async action=>{try {const result=await action();if(!result.ok)throw Error(result.error);}catch(e){document.getElementById('feature-action-status').textContent=e.message;}};
  list.querySelectorAll('[data-runner]').forEach(b=>b.onclick=()=>report(()=>window.robos.openWorkItem(b.dataset.runner,'runner')));
  list.querySelectorAll('[data-workflow]').forEach(b=>b.onclick=()=>report(()=>window.robos.openTool('workflow-studio')));
  list.querySelectorAll('[data-unassign]').forEach(b=>b.onclick=e=>{e.preventDefault();b.disabled=true;report(async()=>{const r=await window.robos.unassignFeature(b.dataset.unassign);if(r.ok)renderFeatures(r.features,r.activeFeature);else b.disabled=false;return r;});});
  list.querySelectorAll('[data-open]').forEach(b=>b.onclick=e=>{e.preventDefault();report(()=>window.robos.openWorkItem(b.dataset.open,'plan'));});
  list.querySelectorAll('[data-work]').forEach(b=>b.onclick=async()=>{const id=b.dataset.work;if(b.disabled||pendingWorkLaunches.has(id))return;pendingWorkLaunches.add(id);b.disabled=true;b.textContent='Launching…';b.setAttribute('aria-busy','true');try{await report(()=>window.robos.openWorkItem(id,'work'));}finally{pendingWorkLaunches.delete(id);await refreshWorkProgress();renderFeatures(appState.allFeatures,appState.activeFeature);}});
  list.querySelectorAll('[data-assign]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.assign;if(pendingTaskAssignments.has(id)||b.disabled)return;
    pendingTaskAssignments.add(id);b.disabled=true;b.textContent='Assigning to you…';b.setAttribute('aria-busy','true');
    const status=document.getElementById('feature-action-status');status.setAttribute('role','status');status.textContent='Assigning to you…';
    try{const r=await window.robos.setActiveFeature(id);if(!r.ok)throw Error(r.error||'Assignment failed. Try again.');pendingTaskAssignments.delete(id);renderFeatures(r.features,r.activeFeature);status.textContent='Assigned to you.';}
    catch(e){status.textContent='Could not assign this ticket: '+e.message;}
    finally{pendingTaskAssignments.delete(id);renderFeatures(appState.allFeatures,appState.activeFeature);}
  });
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
    if (emptyEl) {
      emptyEl.querySelector('.empty-msg').textContent=notifs.length?'No matching notifications':'No notifications';
      emptyEl.querySelector('.empty-sub').textContent=notifs.length?'Change the category, priority, date, or search filters to see your notifications.':'Assigned task and PR traffic will appear here automatically.';
      emptyEl.classList.remove('hidden');
    }
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
            <span class="notif-title">${escapeHTML(n.title || 'Notification')}</span>
            <span class="notif-time">${window.robosList.time(n.ts,'Received')}</span>
          </div>
          <div class="notif-body">${escapeHTML(n.body || '')}</div>
          <div class="notif-actions">
            ${n.requestStatus==='resolved'?'<span class="notif-auth-resolved">✓ Request resolved</span>':n.authStatus==='resolved'?'<span class="notif-auth-resolved">✓ Connection restored</span>':n.action?.type==='auth-reconcile'?`<button class="btn-notif-action" data-auth-reconcile="${escapeHTML(n.id)}">${escapeHTML(n.action.label||'Reconnect')}</button>${['mcp','slack','github'].includes(n.action.kind)?`<button class="btn-notif-action" data-auth-check="${escapeHTML(n.id)}">Check connection</button>`:''}`:(n.action?.app||n.action?.url)?`<button class="btn-notif-action" data-notif-open="${escapeHTML(n.id)}">${escapeHTML(n.action.label||(n.action.app==='agents-manager'?'Open RobOS Agents':n.action.app==='team-chat-servers'?'Reconnect Slack':'View details'))}</button>`:''}
            <span class="notif-auth-status" role="status" aria-live="polite"></span>
            ${isUnread ? `
              <button class="btn-notif-read" onclick="window.markNotifRead('${n.id}')">✓ Mark Read</button>
            ` : ''}
            <button class="btn-notif-del" onclick="window.deleteNotif('${n.id}')" title="Delete notification">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  listEl.querySelectorAll('[data-notif-open]').forEach(b=>b.onclick=async()=>{const n=filtered.find(n=>n.id===b.dataset.notifOpen);try{b.disabled=true;await (n.action.type==='human-request'?window.robos.notifications.reviewHumanRequest({id:n.id}):window.robos.notifications.openAppContext(n.action));}catch(e){b.parentElement.querySelector('[role=status]').textContent=e.message;}finally{b.disabled=false;}});
  listEl.querySelectorAll('[data-auth-reconcile],[data-auth-check]').forEach(b=>b.onclick=async()=>{const id=b.dataset.authReconcile||b.dataset.authCheck,parent=b.parentElement,status=parent.querySelector('[role=status]');parent.querySelectorAll('[data-auth-reconcile],[data-auth-check]').forEach(x=>x.disabled=true);status.textContent='Connecting…';try{let result=await window.robos.notifications.reconcileAuth({id,check:!!b.dataset.authCheck});if(!result.ok)throw Error(result.error);status.textContent=result.message;const until=Date.now()+5*60*1000;while(result.pending&&Date.now()<until&&b.isConnected){await new Promise(r=>setTimeout(r,2500));if(!b.isConnected)return;result=await window.robos.notifications.reconcileAuth({id,check:true});if(!result.ok)throw Error(result.error);status.textContent=result.message;}if(result.resolved)renderNotifications(await window.robos.notifications.getNotifications());}catch(e){status.textContent=e.message;}finally{parent.querySelectorAll('[data-auth-reconcile],[data-auth-check]').forEach(x=>x.disabled=false);}});
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
    if (el) el.innerHTML = '<div class="placeholder">No issues matching this scope and filter</div>';
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
    let priority = pLabel ? pLabel.replace('priority:', '').toUpperCase() : '';
    if (priority === 'HIGH') priority = 'P1';
    if (priority === 'MEDIUM') priority = 'P2';
    if (priority === 'LOW') priority = 'P3';
    const pClass = priority === 'P0' ? 'priority-p0' : priority === 'P1' ? 'priority-p1' : 'priority-p2';

    const sLabel = labels.find(l => l.startsWith('service:') || l.startsWith('repo:'));
    const service = sLabel ? sLabel.split(':')[1] : '';
    const isReview = stage.includes('review');

    return `<div class="item" data-url="${i.url || ''}">
      <span class="item-key"><span class="dot ${dotClass}"></span>#${i.number}</span>
      ${priority ? `<span class="priority-tag ${pClass}">${priority}</span>` : ''}
      <span class="item-title">${i.title}</span>
      ${service ? `<span class="service-tag">${service}</span>` : ''}
      <span class="item-meta">${window.robosList.time(i.updatedAt)}</span>
      ${isReview ? `<button class="btn-review-sm">⚡ Review</button>` : ''}
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
      <span class="item-meta">${window.robosList.time(pr.updatedAt)}</span>
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
      <span class="item-meta">by ${(pr.author && pr.author.login) || '?'} ${window.robosList.time(pr.updatedAt)}</span>
      <button class="btn-review-sm" ${idx === 0 ? 'id="btn-open-review-hub"' : ''}>Review</button>
    </div>
  `).join('');

  el.querySelectorAll('.item').forEach(row => {
    row.addEventListener('click', () => {
      if (row.dataset.url) window.robos.openUrl(row.dataset.url);
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
          <span>Merged PRs in loaded data</span>
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
          <span>Today (Planned Work & Reviews)</span>
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
let interactionsWired = false;
function wireInteractivity() {
  if (interactionsWired) return;
  interactionsWired = true;
  document.getElementById('issue-scope').addEventListener('change', async e => {
    appState.issueScope = e.target.value;
    if(document.getElementById('task-scope-label'))document.getElementById('task-scope-label').textContent = appState.issueScope === 'assigned' ? 'Assigned Tasks' : 'Repository Tasks';
    await init();
  });
  // Tabs
  document.querySelectorAll('.view-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyViewTab(btn.dataset.tab);
    });
  });

  document.getElementById('btn-assign-feature').onclick=()=>openFeaturePicker();
  document.getElementById('server-badge').onclick=()=>window.robos.openTool('task-servers');
  document.getElementById('btn-ci-servers').onclick=()=>window.robos.openTool('ci-pipeline-servers');

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
    if ('activeFeature' in data) appState.activeFeature = data.activeFeature;

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
    showDataErrors(data.errors);
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

function showDataErrors(errors = {}) {
  for (const [key, id] of Object.entries({ issues: 'tasks-list', prs: 'prs-list', reviews: 'reviews-list', activity: 'activity-list' })) {
    if (errors[key]) {
      const el = document.getElementById(id);
      if (el) el.textContent = `Unable to load: ${errors[key]}`;
    }
  }
}

async function init() {
  wireInteractivity();

  // Load settings and show server badge
  const settings = await window.robos.readSettings();
  const ts = (settings.task_servers || []).find(s => s.id === settings.active_task_server) || (settings.task_servers || [])[0];
  appState.taskServer = ts;
  const badge = document.getElementById('server-badge');
  if (ts) {
    badge.textContent = ts.name || ts.type || 'GitHub';
  } else {
    badge.textContent = 'No task server';
  }

  // Fetch data concurrently
  const [issuesRes, prsRes, reviewsRes, activityRes, featuresRes, notifsRes] = await Promise.all([
    window.robos.getMyIssues(appState.issueScope),
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

  if (featuresRes.data) {
    appState.allFeatures = featuresRes.data;
    appState.activeFeature = featuresRes.activeFeature;
  }

  renderNotifications(notifsRes || []);
  renderFeatures(appState.allFeatures, appState.activeFeature);
  if (!featuresRes.ok) document.getElementById('feature-action-status').textContent = featuresRes.error;
  renderTasks(appState.allIssues);
  renderPRs(appState.allPRs);
  renderReviews(appState.allReviews);
  renderBlockers(appState.allBlockers);
  renderStandup(generateStandup(appState.allIssues, appState.allPRs, appState.allBlockers));
  renderActivity(appState.allEvents);

  updateKPIRibbon();

  applyViewTab(appState.activeTab);
  showDataErrors(Object.fromEntries(Object.entries({ issues: issuesRes, prs: prsRes, reviews: reviewsRes, activity: activityRes }).filter(([, r]) => !r.ok).map(([key, r]) => [key, r.error])));

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

setInterval(async()=>{const r=await window.robos.getFeatures();if(r.ok)renderFeatures(r.data,r.activeFeature);},15000);
