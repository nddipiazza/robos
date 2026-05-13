'use strict';
/**
 * RobOS Desktop Shell — renderer app.js
 *
 * Layout:
 *   Top: thin #menu-bar  (logo-btn | notifications, clock)
 *   Bottom: floating #dock  (App Launcher | resize-handle | running X11 windows)
 *
 * Click-through: cursor polling in main.js toggles setIgnoreMouseEvents.
 * Dock scale: drag the separator handle up/down to resize. Saved in localStorage.
 *   Uses --dock-btn-size CSS variable so real layout dimensions change (no zoom/transform tricks).
 */

let x11Windows  = [];
let lastWinSnap = '';

// ── Dock scale ─────────────────────────────────────────────────────────────────
const BASE_BTN_PX   = 52;    // default dock button size in px
const SCALE_MIN     = 0.55;
const SCALE_MAX     = 1.6;
const SCALE_DEFAULT = 1.0;
const SCALE_PER_PX  = 0.007; // scale change per pixel dragged

let dockScale = parseFloat(localStorage.getItem('dockScale') || SCALE_DEFAULT);
dockScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, dockScale));

function applyDockScale(scale) {
  dockScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
  const btnPx = Math.round(BASE_BTN_PX * dockScale);
  document.documentElement.style.setProperty('--dock-btn-size', btnPx + 'px');
  // Keep cursor-polling zone in sync: dock height = btnPx+20, bottom margin 10px, buffer 16px
  const visibleDockH = btnPx + 20 + 26;
  try { window.robos.setDockZone(visibleDockH); } catch (_) {}
}

async function init() {
  applyDockScale(dockScale);
  startClock();
  startPoller();
  wireEvents();
  wireDockResize();
}

// ── Clock ──────────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now  = new Date();
    const hh   = String(now.getHours()).padStart(2, '0');
    const mm   = String(now.getMinutes()).padStart(2, '0');
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    document.getElementById('clock-time').textContent = `${hh}:${mm}`;
    document.getElementById('clock-date').textContent =
      `${days[now.getDay()]} ${mons[now.getMonth()]} ${now.getDate()}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ── Dock resize handle ─────────────────────────────────────────────────────────
function wireDockResize() {
  const handle = document.getElementById('dock-resize-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startY     = e.clientY;
    const startScale = dockScale;

    handle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';

    // Disable click-through for the duration of the drag
    try { window.robos.setDragLock(true); } catch (_) {}

    function onMove(ev) {
      const delta    = startY - ev.clientY; // drag up = positive = bigger
      applyDockScale(startScale + delta * SCALE_PER_PX);
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      localStorage.setItem('dockScale', dockScale);
      try { window.robos.setDragLock(false); } catch (_) {}
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Dock window buttons ────────────────────────────────────────────────────────
function renderX11Windows(windows) {
  const area = document.getElementById('window-area');
  const snap = JSON.stringify(windows.map(w => w.wid + w.title));
  if (snap === lastWinSnap) return;
  lastWinSnap = snap;

  area.innerHTML = '';
  for (const win of windows) {
    const btn = document.createElement('button');
    btn.className = 'dock-btn win-btn';
    btn.dataset.wid = win.wid;
    btn.dataset.tooltip = win.title.length > 40 ? win.title.slice(0, 38) + '…' : win.title;

    if (win.iconSvg) {
      const img = document.createElement('img');
      img.className = 'win-icon-img';
      img.src = win.iconSvg;
      img.alt = '';
      img.onerror = () => img.replaceWith(makeEmojiIcon(win.icon || '🪟'));
      btn.appendChild(img);
    } else {
      btn.appendChild(makeEmojiIcon(win.icon || '🪟'));
    }

    btn.addEventListener('click', () => window.robos.focusWindow(win.wid));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, win.wid);
    });
    area.appendChild(btn);
  }
}

function makeEmojiIcon(emoji) {
  const span = document.createElement('span');
  span.className = 'win-icon-emoji';
  span.textContent = emoji;
  return span;
}

// ── Context menu ───────────────────────────────────────────────────────────────
let activeMenu = null;

function showContextMenu(x, y, wid) {
  removeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  const btnPx = Math.round(BASE_BTN_PX * dockScale);
  const DOCK_BOTTOM = btnPx + 20 + 10;
  const menuH = 130;
  const menuW = 190;
  const top  = Math.max(4, window.innerHeight - DOCK_BOTTOM - menuH);
  const left = Math.min(Math.max(4, x - menuW / 2), window.innerWidth - menuW - 4);
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';

  menu.innerHTML = `
    <div class="ctx-item" data-action="focus">🔍 Bring to Front</div>
    <div class="ctx-item" data-action="maximize">⬜ Maximize / Restore</div>
    <div class="ctx-item" data-action="minimize">➖ Minimize</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item ctx-close" data-action="close">✕ Close</div>
  `;
  menu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    if (action === 'focus')    window.robos.focusWindow(wid);
    if (action === 'minimize') window.robos.minimizeWindow(wid);
    if (action === 'maximize') window.robos.maximizeWindow(wid);
    if (action === 'close')    window.robos.closeWindow(wid);
    removeContextMenu();
  });
  document.body.appendChild(menu);
  activeMenu = menu;
  setTimeout(() => document.addEventListener('click', removeContextMenu, { once: true }), 0);
}

function removeContextMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}

// ── RobOS System Settings menu ─────────────────────────────────────────────────
let sysMenuOpen = false;

function openSysMenu() {
  const menu = document.getElementById('sys-menu');
  const btn  = document.getElementById('robos-logo-btn');
  if (sysMenuOpen) { closeSysMenu(); return; }
  sysMenuOpen = true;
  menu.style.display = 'block';
  btn.classList.add('active');
  setTimeout(() => document.addEventListener('click', closeSysMenuOutside, { once: true }), 0);
}

function closeSysMenu() {
  const menu = document.getElementById('sys-menu');
  const btn  = document.getElementById('robos-logo-btn');
  sysMenuOpen = false;
  menu.style.display = 'none';
  btn.classList.remove('active');
}

function closeSysMenuOutside(e) {
  const menu = document.getElementById('sys-menu');
  if (menu && menu.contains(e.target)) return;
  closeSysMenu();
}

// ── Poller ─────────────────────────────────────────────────────────────────────
function startPoller() {
  poll();
  setInterval(poll, 500);
}

async function poll() {
  try {
    x11Windows = await window.robos.getX11Windows() || [];
  } catch { x11Windows = []; }
  renderX11Windows(x11Windows);
}

// ── Toast ──────────────────────────────────────────────────────────────────────
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

// ── Wire events ────────────────────────────────────────────────────────────────
function wireEvents() {
  document.getElementById('robos-logo-btn').addEventListener('click', openSysMenu);

  document.getElementById('sys-back-to-gnome').addEventListener('click', async () => {
    closeSysMenu();
    const confirmed = confirm('Switch to GNOME Desktop?\n\nThis will restore the GNOME panel and close RobOS Desktop.');
    if (!confirmed) return;
    showToast('Restoring GNOME panel…');
    await window.robos.switchToGnome();
  });

  document.getElementById('btn-notifications').addEventListener('click', () => {
    window.robos.launchApp('notifications');
  });

  document.getElementById('btn-launcher').addEventListener('click', () => {
    window.robos.launchApp('app-launcher');
  });
}

document.addEventListener('DOMContentLoaded', init);
