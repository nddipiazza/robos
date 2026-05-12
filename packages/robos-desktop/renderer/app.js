'use strict';
/**
 * RobOS Desktop Shell — renderer app.js
 *
 * Responsibilities:
 *  - Live clock (updates every second)
 *  - Unified app dock: all registered apps, running state shown inline
 *    • Running  → full opacity, cyan underline, cyan dot
 *    • Not running → 45% opacity, no indicator, dimmed
 *  - App launcher button → launches app-launcher
 *  - Desktop double-click → open app launcher
 *  - Launch feedback toast
 */

// ── State ───────────────────────────────────────────────────────────────────
let appMeta    = {};    // { appId → { label, icon, desc } }
let runningApps = {};   // { appId → { alive: bool } }
let lastRunningSnapshot = '';

// ── Boot ────────────────────────────────────────────────────────────────────
async function init() {
  appMeta = await window.robos.getAppMeta();
  renderDock();
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

// ── Unified dock ─────────────────────────────────────────────────────────────

/**
 * Build the full dock from appMeta. Each button is rendered once; running state
 * is applied/removed by updateDockRunningState() without rebuilding the DOM.
 */
function renderDock() {
  const dock = document.getElementById('app-dock');
  dock.innerHTML = '';

  for (const [appId, meta] of Object.entries(appMeta)) {
    dock.appendChild(makeDockBtn(appId, meta));
  }
}

function makeDockBtn(appId, meta) {
  const btn = document.createElement('button');
  btn.className = 'dock-btn';
  btn.dataset.appId = appId;
  btn.title = meta.label;
  btn.innerHTML = `
    <span class="dock-icon">${meta.icon}</span>
    <span class="dock-label">${meta.label}</span>
    <span class="dock-run-dot"></span>
  `;
  btn.addEventListener('click', () => handleLaunch(appId));
  return btn;
}

/**
 * Update running/not-running CSS state on every dock button without rebuilding.
 */
function updateDockRunningState() {
  document.querySelectorAll('#app-dock .dock-btn').forEach(btn => {
    const appId    = btn.dataset.appId;
    const isRunning = !!(runningApps[appId] && runningApps[appId].alive);
    btn.classList.toggle('running', isRunning);
    btn.title = isRunning ? `${appMeta[appId]?.label || appId} — Running` : (appMeta[appId]?.label || appId);
  });
}

// ── Running poller ───────────────────────────────────────────────────────────
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

  const snapshot = JSON.stringify(runningApps);
  if (snapshot === lastRunningSnapshot) return;
  lastRunningSnapshot = snapshot;

  updateDockRunningState();
}

// ── Launch ───────────────────────────────────────────────────────────────────
async function handleLaunch(appId) {
  const label = appMeta[appId]?.label || appId;
  showToast(`Launching ${label}…`);
  try {
    await window.robos.launchApp(appId);
  } catch {
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
  document.getElementById('btn-launcher').addEventListener('click', () => {
    handleLaunch('app-launcher');
  });

  document.getElementById('btn-notifications').addEventListener('click', () => {
    handleLaunch('notifications');
  });

  document.getElementById('btn-switch-gnome').addEventListener('click', async () => {
    const confirmed = confirm('Switch to GNOME Desktop?\n\nThis will restore the GNOME panel and close RobOS Desktop. You can relaunch RobOS Desktop from the GNOME app menu.');
    if (!confirmed) return;
    showToast('Restoring GNOME panel…');
    await window.robos.switchToGnome();
  });

  document.getElementById('desktop-area').addEventListener('dblclick', () => {
    handleLaunch('app-launcher');
  });
}

// ── Start ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
