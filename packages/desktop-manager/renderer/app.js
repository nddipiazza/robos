'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let allApps = [];
let currentFilter = 'all';
let searchQuery = '';
let keepAliveState = { keepAliveApps: [], paused: [], running: {} };

// ── DOM References ───────────────────────────────────────────────────────────
const socketPathDisplay = document.getElementById('socket-path-display');
const appGrid           = document.getElementById('app-grid');
const appsCount         = document.getElementById('apps-count');
const notifCount        = document.getElementById('notif-count');
const watchdogCount     = document.getElementById('watchdog-count');
const appSearch         = document.getElementById('app-search');
const socketEventLog    = document.getElementById('socket-event-log');
const customSocketInput = document.getElementById('custom-socket-input');
const notifContainer    = document.getElementById('notif-container');
const watchdogGrid      = document.getElementById('watchdog-grid');

// ── Navigation Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// ── Search & Filter ──────────────────────────────────────────────────────────
appSearch.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderApps();
});

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    renderApps();
  });
});

// ── Render Apps ──────────────────────────────────────────────────────────────
function renderApps() {
  const filtered = allApps.filter(app => {
    const title = (app.label || app.name || app.id).toLowerCase();
    const desc = (app.desc || app.description || '').toLowerCase();
    const matchesSearch = !searchQuery ||
      title.includes(searchQuery) ||
      desc.includes(searchQuery) ||
      app.id.toLowerCase().includes(searchQuery);
    const matchesFilter = currentFilter === 'all' ||
      (app.category && app.category.toLowerCase().includes(currentFilter.toLowerCase()));
    return matchesSearch && matchesFilter;
  });

  appsCount.textContent = allApps.length;
  appGrid.innerHTML = '';

  if (filtered.length === 0) {
    appGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No applications found matching query "${searchQuery}"</div>`;
    return;
  }

  filtered.forEach(app => {
    const card = document.createElement('div');
    card.className = 'app-card app-item';
    card.id = `app-item-${app.id}`;
    const title = app.label || app.name || app.id;
    const desc = app.desc || app.description || '';
    card.innerHTML = `
      <div class="app-icon">${app.icon || '📦'}</div>
      <div class="app-details">
        <div class="app-name">${title}</div>
        <div class="app-meta">${app.category || 'Tool'} &bull; ${desc}</div>
      </div>
      <div class="app-actions">
        <button class="btn btn-primary btn-launch" data-id="${app.id}">Launch</button>
      </div>
    `;

    card.querySelector('.btn-launch').addEventListener('click', async (e) => {
      e.stopPropagation();
      card.classList.add('click-feedback');
      setTimeout(() => card.classList.remove('click-feedback'), 300);
      appendSocketLog(`LAUNCH_REQ: ${app.id}`, 'Dispatching launch via IPC...');
      const res = await window.api.launchApp(app.id);
      appendSocketLog(`LAUNCH_RESP: ${app.id}`, JSON.stringify(res, null, 2));
    });

    appGrid.appendChild(card);
  });
}

// ── Live Socket Event Stream ─────────────────────────────────────────────────
function appendSocketLog(title, body) {
  const item = document.createElement('div');
  item.className = 'log-item';
  const now = new Date().toISOString().split('T')[1].slice(0, -1);
  item.innerHTML = `
    <div class="log-header">
      <span style="color: var(--accent); font-weight: 600;">${title}</span>
      <span>${now}</span>
    </div>
    <div class="log-body">${body}</div>
  `;
  socketEventLog.insertBefore(item, socketEventLog.firstChild);
}

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  socketEventLog.innerHTML = '';
});

// ── Socket Quick Actions ─────────────────────────────────────────────────────
document.getElementById('btn-ping-socket').addEventListener('click', async () => {
  const start = performance.now();
  const res = await window.api.sendSocketMessage({ ping: true });
  const latency = (performance.now() - start).toFixed(2);
  appendSocketLog(`SOCKET PING (Roundtrip: ${latency}ms)`, JSON.stringify(res, null, 2));
});

document.getElementById('btn-query-apps').addEventListener('click', async () => {
  const start = performance.now();
  const res = await window.api.sendSocketMessage({ getApps: true });
  const latency = (performance.now() - start).toFixed(2);
  appendSocketLog(`SOCKET GET_APPS (${latency}ms)`, `Retrieved ${res.apps ? res.apps.length : 0} registered applications over Unix socket.`);
});

document.getElementById('btn-query-status').addEventListener('click', async () => {
  const start = performance.now();
  const res = await window.api.sendSocketMessage({ status: true });
  const latency = (performance.now() - start).toFixed(2);
  appendSocketLog(`SOCKET STATUS (${latency}ms)`, JSON.stringify(res, null, 2));
});

document.getElementById('btn-send-test-notif').addEventListener('click', async () => {
  const notif = {
    title: 'Agent Review Completed',
    body: 'Automated E2E assertion pass verified by Desktop Manager',
    icon: 'check',
    source: 'desktop-manager-demo',
  };
  const res = await window.api.sendSocketMessage({ notify: notif });
  appendSocketLog(`SOCKET NOTIFY`, JSON.stringify(res, null, 2));
  await refreshNotifications();
});

document.getElementById('btn-send-custom-socket').addEventListener('click', async () => {
  try {
    const payload = JSON.parse(customSocketInput.value);
    const start = performance.now();
    const res = await window.api.sendSocketMessage(payload);
    const latency = (performance.now() - start).toFixed(2);
    appendSocketLog(`CUSTOM IPC (${latency}ms)`, JSON.stringify(res, null, 2));
  } catch (err) {
    appendSocketLog(`SOCKET ERROR`, `Invalid JSON payload: ${err.message}`);
  }
});

// ── Notifications Pane ───────────────────────────────────────────────────────
async function refreshNotifications() {
  const notifs = await window.api.getNotifications();
  const unread = notifs.filter(n => !n.read).length;
  notifCount.textContent = unread;
  notifContainer.innerHTML = '';

  if (notifs.length === 0) {
    notifContainer.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted); font-size: 12px;">No active notifications. System inbox is clean.</div>`;
    return;
  }

  notifs.forEach(n => {
    const el = document.createElement('div');
    el.className = `notif-card ${!n.read ? 'unread' : ''}`;
    el.innerHTML = `
      <div style="font-size: 18px;">${n.icon === 'error' ? '⚠️' : '🔔'}</div>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:13px; color:var(--text-main);">${n.title || 'Notification'}</strong>
          <span class="notif-badge">${n.source || 'system'}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:3px;">${n.body || ''}</div>
      </div>
    `;
    notifContainer.appendChild(el);
  });
}

document.getElementById('btn-emit-urgent-notif').addEventListener('click', async () => {
  await window.api.sendNotification({
    title: 'High Priority Blocker Alert',
    body: 'CI build failure detected on branch feat/knowledge-graph-engine',
    icon: 'error',
    source: 'ci-monitor',
    tier: 'urgent',
  });
  appendSocketLog('URGENT TOAST EMITTED', 'Dispatched urgent toast alert to overlay daemon.');
  await refreshNotifications();
});

document.getElementById('btn-clear-all-notif').addEventListener('click', async () => {
  await window.api.clearNotifications();
  appendSocketLog('NOTIFICATIONS CLEARED', 'Cleared all stored notifications.');
  await refreshNotifications();
});

// ── Watchdog Supervision Grid ────────────────────────────────────────────────
async function refreshWatchdog() {
  keepAliveState = await window.api.getKeepAliveState();
  watchdogCount.textContent = keepAliveState.keepAliveApps.length;
  watchdogGrid.innerHTML = '';

  keepAliveState.keepAliveApps.forEach(appId => {
    const isPaused = keepAliveState.paused.includes(appId);
    const card = document.createElement('div');
    card.className = 'watchdog-card';
    card.id = `watchdog-${appId}`;
    card.innerHTML = `
      <div class="watchdog-header">
        <div style="font-weight:600; font-size:13px; color:var(--text-main);">${appId}</div>
        <label class="toggle-switch">
          <input type="checkbox" ${!isPaused ? 'checked' : ''} data-id="${appId}">
          <span class="slider"></span>
        </label>
      </div>
      <div style="font-size:11px; color:var(--text-muted);">
        Status: <span style="color:${!isPaused ? 'var(--success)' : 'var(--warning)'}; font-weight:600;">
          ${!isPaused ? '● SUPERVISED' : '⏸ PAUSED'}
        </span>
      </div>
      <div style="font-size:10px; color:var(--text-muted);">Policy: Auto-restart on exit &bull; Interval: 2500ms</div>
    `;

    card.querySelector('input').addEventListener('change', async (e) => {
      const shouldPause = !e.target.checked;
      await window.api.toggleKeepAlive(appId, shouldPause);
      appendSocketLog(`WATCHDOG ${appId}`, shouldPause ? 'Paused keep-alive supervision' : 'Resumed keep-alive supervision');
      await refreshWatchdog();
    });

    watchdogGrid.appendChild(card);
  });
}

// ── Initialization ───────────────────────────────────────────────────────────
async function init() {
  try {
    const sockPath = await window.api.getSocketPath();
    socketPathDisplay.textContent = `Socket: ${sockPath}`;
  } catch {}

  try {
    allApps = await window.api.getApps();
    renderApps();
  } catch (err) {
    console.error('Failed to load apps:', err);
  }

  await refreshNotifications();
  await refreshWatchdog();
}

init();
