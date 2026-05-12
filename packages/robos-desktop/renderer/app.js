'use strict';
/**
 * RobOS Desktop Shell — renderer app.js
 *
 * Taskbar layout (left → right):
 *   [🔲 Launcher] | [4 pinned RobOS apps] | [separator] | [X11 windows] → [spacer] | [tray+clock]
 *
 * Pinned apps: always shown, running state (cyan underline) from /proc scan.
 * X11 windows: live-polled via wmctrl, click to focus/raise, first-class citizens.
 */

// ── State ─────────────────────────────────────────────────────────────────────
let appMeta         = {};  // { appId → { label, icon, desc } }
let runningApps     = {};  // { appId → { alive: bool } }
let x11Windows      = [];  // [ { wid, icon, label, title } ]
let lastRunSnap     = '';
let lastWinSnap     = '';

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  appMeta = await window.robos.getAppMeta();
  renderPinnedApps();
  startClock();
  startPoller();
  wireEvents();
}

// ── Clock ─────────────────────────────────────────────────────────────────────
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

// ── Pinned apps (4 RobOS apps) ────────────────────────────────────────────────
function renderPinnedApps() {
  const dock = document.getElementById('pinned-dock');
  dock.innerHTML = '';
  for (const [appId, meta] of Object.entries(appMeta)) {
    const btn = document.createElement('button');
    btn.className = 'dock-btn';
    btn.dataset.appId = appId;
    btn.title = meta.desc || meta.label;
    btn.innerHTML = `
      <span class="dock-icon">${meta.icon}</span>
      <span class="dock-label">${meta.label}</span>
      <span class="dock-run-dot"></span>
    `;
    btn.addEventListener('click', () => handleLaunch(appId));
    dock.appendChild(btn);
  }
}

function updatePinnedRunning() {
  document.querySelectorAll('#pinned-dock .dock-btn').forEach(btn => {
    const appId = btn.dataset.appId;
    const running = !!(runningApps[appId] && runningApps[appId].alive);
    btn.classList.toggle('running', running);
    btn.title = running
      ? `${appMeta[appId]?.label || appId} — Running`
      : (appMeta[appId]?.desc || appMeta[appId]?.label || appId);
  });
}

// ── X11 window buttons ────────────────────────────────────────────────────────
function renderX11Windows(windows) {
  const area = document.getElementById('window-area');
  // Rebuild only when the window list actually changed
  const snap = JSON.stringify(windows.map(w => w.wid + w.title));
  if (snap === lastWinSnap) return;
  lastWinSnap = snap;

  area.innerHTML = '';
  for (const win of windows) {
    const btn = document.createElement('button');
    btn.className = 'win-btn';
    btn.dataset.wid = win.wid;
    btn.title = win.title;
    btn.innerHTML = `
      <span class="win-icon">${win.icon}</span>
      <span class="win-title">${escHtml(win.title)}</span>
    `;
    btn.addEventListener('click', () => window.robos.focusWindow(win.wid));
    area.appendChild(btn);
  }
  // Show/hide the separator
  document.getElementById('win-separator').style.display =
    windows.length ? 'block' : 'none';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Poller ────────────────────────────────────────────────────────────────────
function startPoller() {
  poll();
  setInterval(poll, 2000);
}

async function poll() {
  // Running apps (proc scan)
  try {
    runningApps = await window.robos.getRunningApps() || {};
  } catch { runningApps = {}; }
  const rsnap = JSON.stringify(runningApps);
  if (rsnap !== lastRunSnap) {
    lastRunSnap = rsnap;
    updatePinnedRunning();
  }

  // X11 windows
  try {
    x11Windows = await window.robos.getX11Windows() || [];
  } catch { x11Windows = []; }
  renderX11Windows(x11Windows);
}

// ── Launch RobOS app ──────────────────────────────────────────────────────────
async function handleLaunch(appId) {
  const label = appMeta[appId]?.label || appId;
  showToast(`Launching ${label}…`);
  try {
    await window.robos.launchApp(appId);
  } catch {
    showToast(`Failed to launch ${appId}`);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
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

// ── Events ────────────────────────────────────────────────────────────────────
function wireEvents() {
  document.getElementById('btn-launcher').addEventListener('click', () => {
    handleLaunch('app-launcher');
  });
  document.getElementById('btn-notifications').addEventListener('click', () => {
    handleLaunch('notifications');
  });
  document.getElementById('btn-switch-gnome').addEventListener('click', async () => {
    const confirmed = confirm('Switch to GNOME Desktop?\n\nThis will restore the GNOME panel and close RobOS Desktop.');
    if (!confirmed) return;
    showToast('Restoring GNOME panel…');
    await window.robos.switchToGnome();
  });
  document.getElementById('desktop-area').addEventListener('dblclick', () => {
    handleLaunch('app-launcher');
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
