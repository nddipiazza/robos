'use strict';
/**
 * RobOS Desktop Shell — renderer app.js
 *
 * Responsibilities:
 *  - Live clock (updates every second)
 *  - Pinned apps bar (loaded from config, persisted on change)
 *  - Running apps bar (polled from desktop-manager every 3s)
 *  - App launcher button → launches app-launcher
 *  - Desktop double-click → open app launcher
 *  - Launch feedback toast
 */

// ── App metadata (mirrors main.js APP_META) ────────────────────────────────
let appMeta = {};

// ── State ───────────────────────────────────────────────────────────────────
let pinnedApps  = [];
let runningApps = {};
let lastRunningSnapshot = '';

// ── Boot ────────────────────────────────────────────────────────────────────
async function init() {
  appMeta    = await window.robos.getAppMeta();
  pinnedApps = await window.robos.getPinnedApps();

  renderPinned();
  startClock();
  startRunningPoller();
  wireEvents();
}

// ── Clock ───────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now  = new Date();
    const hh   = String(now.getHours()).padStart(2, '0');
    const mm   = String(now.getMinutes()).padStart(2, '0');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    document.getElementById('clock-time').textContent = `${hh}:${mm}`;
    document.getElementById('clock-date').textContent =
      `${days[now.getDay()]} ${mons[now.getMonth()]} ${now.getDate()}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ── Pinned apps ──────────────────────────────────────────────────────────────
function getMeta(appId) {
  return appMeta[appId] || { label: appId, icon: '📦', desc: appId };
}

function renderPinned() {
  const container = document.getElementById('pinned-apps');
  container.innerHTML = '';
  for (const appId of pinnedApps) {
    container.appendChild(makePinnedBtn(appId));
  }
}

function makePinnedBtn(appId) {
  const meta = getMeta(appId);
  const isRunning = !!runningApps[appId];

  const btn = document.createElement('button');
  btn.className = 'app-btn';
  btn.title = meta.label;
  btn.dataset.appId = appId;
  btn.innerHTML = `
    <span class="app-icon">${meta.icon}</span>
    <span class="app-label">${meta.label}</span>
    ${isRunning ? '<span class="running-dot"></span>' : ''}
  `;
  btn.addEventListener('click', () => handleLaunch(appId));
  return btn;
}

// ── Running apps ─────────────────────────────────────────────────────────────
function startRunningPoller() {
  pollRunning();
  setInterval(pollRunning, 3000);
}

async function pollRunning() {
  try {
    runningApps = await window.robos.getRunningApps() || {};
  } catch {
    runningApps = {};
  }

  // Only re-render if something changed
  const snapshot = JSON.stringify(runningApps);
  if (snapshot === lastRunningSnapshot) return;
  lastRunningSnapshot = snapshot;

  renderRunning();
  updatePinnedDots();
}

function renderRunning() {
  const container = document.getElementById('running-apps');
  container.innerHTML = '';

  for (const [appId, info] of Object.entries(runningApps)) {
    if (!info || !info.alive) continue;
    // Skip apps that are in pinned — they already show a dot there
    if (pinnedApps.includes(appId)) continue;
    // Skip background/system apps that don't need taskbar presence
    if (['robos-toast', 'notifications', 'desktop-manager', 'robos-desktop'].includes(appId)) continue;

    const meta = getMeta(appId);
    const btn  = document.createElement('button');
    btn.className = 'running-app-btn';
    btn.title = meta.desc || meta.label;
    btn.dataset.appId = appId;
    btn.innerHTML = `
      <span class="app-icon">${meta.icon}</span>
      <span class="app-name">${meta.label}</span>
    `;
    btn.addEventListener('click', () => handleLaunch(appId));
    container.appendChild(btn);
  }
}

function updatePinnedDots() {
  document.querySelectorAll('#pinned-apps .app-btn').forEach(btn => {
    const appId = btn.dataset.appId;
    const isRunning = runningApps[appId] && runningApps[appId].alive;
    const existing = btn.querySelector('.running-dot');
    if (isRunning && !existing) {
      const dot = document.createElement('span');
      dot.className = 'running-dot';
      btn.appendChild(dot);
    } else if (!isRunning && existing) {
      existing.remove();
    }
  });
}

// ── Launch ───────────────────────────────────────────────────────────────────
async function handleLaunch(appId) {
  showToast(`Launching ${getMeta(appId).label}…`);
  try {
    await window.robos.launchApp(appId);
  } catch (err) {
    showToast(`Failed to launch ${appId}`);
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('launch-toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => { el.style.display = 'none'; }, 200);
  }, 2000);
}

// ── Events ───────────────────────────────────────────────────────────────────
function wireEvents() {
  // Launcher button → open app-launcher
  document.getElementById('btn-launcher').addEventListener('click', () => {
    handleLaunch('app-launcher');
  });

  // Notifications button
  document.getElementById('btn-notifications').addEventListener('click', () => {
    handleLaunch('notifications');
  });

  // Double-click anywhere on desktop → open app-launcher
  document.getElementById('desktop-area').addEventListener('dblclick', () => {
    handleLaunch('app-launcher');
  });
}

// ── Start ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
