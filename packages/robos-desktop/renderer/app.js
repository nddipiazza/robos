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

// ── Pinned apps (persist across sessions via localStorage) ─────────────────────
let pinnedApps = JSON.parse(localStorage.getItem('robos-pinned-apps') || '[]');

function savePinnedApps() {
  localStorage.setItem('robos-pinned-apps', JSON.stringify(pinnedApps));
}
function isPinned(instance) {
  return pinnedApps.some(p => p.instance === instance);
}
function pinApp(win) {
  if (win && !isPinned(win.instance)) {
    pinnedApps.push({ instance: win.instance, label: win.label, exec: win.exec || win.instance, iconSvg: win.iconSvg });
    savePinnedApps();
    lastWinSnap = '';
  }
}
function unpinApp(instance) {
  pinnedApps = pinnedApps.filter(p => p.instance !== instance);
  savePinnedApps();
  lastWinSnap = '';
}

// ── Dock scale ─────────────────────────────────────────────────────────────────
const BASE_BTN_PX   = 52;    // default dock button size in px
const SCALE_MIN     = 0.40;  // 25%+ smaller minimum scale (down from 0.55 to 0.40, min ~21px)
const SCALE_MAX     = 1.6;
const SCALE_DEFAULT = 1.0;
const SCALE_PER_PX  = 0.007; // scale change per pixel dragged

let dockScale = parseFloat(localStorage.getItem('dockScale') || SCALE_DEFAULT);
dockScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, dockScale));

function updateDockRect() {
  const dock = document.getElementById('dock');
  if (!dock) return;
  const rect = dock.getBoundingClientRect();
  try {
    window.robos.setDockRect({
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
  } catch (_) {}
}

function applyDockScale(scale) {
  dockScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
  const btnPx = Math.round(BASE_BTN_PX * dockScale);
  document.documentElement.style.setProperty('--dock-btn-size', btnPx + 'px');
  const visibleDockH = btnPx + 20 + 26;
  try { window.robos.setDockZone(visibleDockH); } catch (_) {}
  setTimeout(updateDockRect, 10);
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
  const runningInstances = new Set(windows.map(w => w.instance));
  const snap = JSON.stringify(windows.map(w => w.wid + w.title + (w.iconSvg ? w.iconSvg.length : 0))) +
               JSON.stringify(pinnedApps.map(p => p.instance + (p.iconSvg ? p.iconSvg.length : 0)));
  if (snap === lastWinSnap) return;
  lastWinSnap = snap;

  area.innerHTML = '';

  // Pinned but not running — shown as launcher stubs
  for (const pinned of pinnedApps) {
    if (runningInstances.has(pinned.instance)) continue;
    const btn = document.createElement('button');
    btn.className = 'dock-btn win-btn pinned-not-running';
    btn.dataset.tooltip = pinned.label + ' (not running)';
    if (pinned.iconSvg) {
      const img = document.createElement('img');
      img.className = 'win-icon-img';
      img.src = pinned.iconSvg;
      img.alt = '';
      img.onerror = () => img.replaceWith(makeEmojiIcon('🪟'));
      btn.appendChild(img);
    } else {
      btn.appendChild(makeEmojiIcon('🪟'));
    }
    btn.addEventListener('click', () => window.robos.execDesktopAction(pinned.exec));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showPinnedContextMenu(e.clientX, e.clientY, pinned);
    });
    area.appendChild(btn);
  }

  // Group running windows by application instance
  const groups = new Map();
  for (const win of windows) {
    if (win.instance === 'robos-desktop' || win.instance === 'electron' || (win.title && win.title.toLowerCase().includes('robos desktop')) || win.title === 'electron') continue;
    if (!groups.has(win.instance)) {
      groups.set(win.instance, {
        instance: win.instance,
        label: win.label,
        iconSvg: win.iconSvg,
        icon: win.icon,
        exec: win.exec,
        actions: win.actions || [],
        windows: [],
      });
    }
    groups.get(win.instance).windows.push(win);
  }

  // Running X11 window groups
  for (const [instance, group] of groups) {
    const isMulti = group.windows.length > 1;
    const btn = document.createElement('button');
    btn.className = 'dock-btn win-btn' + (isPinned(instance) ? ' pinned-btn' : '') + (isMulti ? ' multi-win-btn' : '');
    btn.dataset.instance = instance;

    if (!isMulti) {
      const singleWin = group.windows[0];
      btn.dataset.wid = singleWin.wid;
      btn.dataset.tooltip = singleWin.title.length > 40 ? singleWin.title.slice(0, 38) + '…' : singleWin.title;
    } else {
      btn.dataset.tooltip = `${group.label} (${group.windows.length} windows)`;
    }

    if (group.iconSvg) {
      const img = document.createElement('img');
      img.className = 'win-icon-img';
      img.src = group.iconSvg;
      img.alt = '';
      img.onerror = () => img.replaceWith(makeEmojiIcon(group.icon || '🪟'));
      btn.appendChild(img);
    } else {
      btn.appendChild(makeEmojiIcon(group.icon || '🪟'));
    }

    // Add multi-window count badge
    if (isMulti) {
      const badge = document.createElement('span');
      badge.className = 'multi-window-badge';
      badge.textContent = group.windows.length;
      btn.appendChild(badge);
    }

    btn.addEventListener('click', (e) => {
      if (!isMulti) {
        window.robos.focusWindow(group.windows[0].wid);
      } else {
        toggleWindowPicker(e.clientX, e.clientY, group);
      }
    });

    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, isMulti ? group : group.windows[0]);
    });

    area.appendChild(btn);
  }
  setTimeout(updateDockRect, 10);
}

function makeEmojiIcon(emoji) {
  const span = document.createElement('span');
  span.className = 'win-icon-emoji';
  span.textContent = emoji;
  return span;
}

// ── Menu positioning helper ──────────────────────────────────────────────────
function computeMenuPosition(instance, menuW, menuH, fallbackX, fallbackY) {
  let iconCenterX = fallbackX;
  let iconTop = fallbackY;

  const btn = instance ? document.querySelector(`.dock-btn[data-instance="${instance}"]`) : null;
  if (btn) {
    const rect = btn.getBoundingClientRect();
    iconCenterX = rect.left + rect.width / 2;
    iconTop = rect.top;
  } else if (!iconCenterX || iconCenterX <= 10) {
    const dock = document.getElementById('dock');
    if (dock) {
      const dRect = dock.getBoundingClientRect();
      iconCenterX = dRect.left + dRect.width / 2;
      iconTop = dRect.top;
    } else {
      iconCenterX = window.innerWidth / 2;
      iconTop = window.innerHeight - 80;
    }
  }

  const btnPx = Math.round(BASE_BTN_PX * dockScale);
  const DOCK_BOTTOM = btnPx + 20 + 10;
  const top = Math.max(10, (iconTop ? iconTop - menuH - 12 : window.innerHeight - DOCK_BOTTOM - menuH));
  const left = Math.min(Math.max(10, iconCenterX - menuW / 2), window.innerWidth - menuW - 10);
  return { top, left };
}

// ── Multi-window Document Picker ──────────────────────────────────────────────
function toggleWindowPicker(x, y, group) {
  if (activeMenu && activeMenu.classList.contains('window-picker-menu') && activeMenu.dataset.instance === group.instance) {
    removeContextMenu();
    return;
  }
  removeContextMenu();
  try { window.robos.setMenuOpen(true); } catch(_) {}
  document.body.classList.add('has-active-menu');
  const targetBtn1 = group.instance ? document.querySelector(`.dock-btn[data-instance="${group.instance}"]`) : null;
  if (targetBtn1) targetBtn1.classList.add('menu-active');

  const picker = document.createElement('div');
  picker.className = 'window-picker-menu';
  picker.dataset.instance = group.instance;

  const pickerH = Math.min(360, 48 + group.windows.length * 44 + (group.actions.length ? 36 : 0));
  const pickerW = 340;
  const { top, left } = computeMenuPosition(group.instance, pickerW, pickerH, x, y);
  picker.style.top  = top  + 'px';
  picker.style.left = left + 'px';

  let itemsHtml = `
    <div class="window-picker-header">
      <span>${group.label}</span>
      <span class="window-picker-count">${group.windows.length} open documents</span>
    </div>
    <div class="window-picker-list">
  `;

  for (const w of group.windows) {
    const cleanTitle = w.title || 'Untitled Window';
    const displayTitle = cleanTitle.length > 42 ? cleanTitle.slice(0, 40) + '…' : cleanTitle;
    itemsHtml += `
      <div class="window-picker-item" data-wid="${w.wid}">
        <div class="window-picker-item-info">
          <span class="window-picker-doc-icon">📄</span>
          <span class="window-picker-item-title" title="${cleanTitle}">${displayTitle}</span>
        </div>
        <button class="window-picker-close-btn" data-wid="${w.wid}" title="Close Window">✕</button>
      </div>
    `;
  }
  itemsHtml += '</div>';

  if (group.actions.length) {
    itemsHtml += '<div class="ctx-divider"></div>';
    for (const a of group.actions) {
      itemsHtml += `<div class="ctx-item ctx-action" data-exec="${a.exec.replace(/"/g, '&quot;')}">➕ ${a.name}</div>`;
    }
  }

  picker.innerHTML = itemsHtml;

  picker.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.window-picker-close-btn');
    if (closeBtn) {
      e.stopPropagation();
      const wid = closeBtn.dataset.wid;
      window.robos.closeWindow(wid);
      setTimeout(refreshWindows, 200);
      removeContextMenu();
      return;
    }
    const item = e.target.closest('.window-picker-item');
    if (item) {
      const wid = item.dataset.wid;
      window.robos.focusWindow(wid);
      removeContextMenu();
      return;
    }
    const actionItem = e.target.closest('.ctx-action');
    if (actionItem) {
      const execStr = actionItem.dataset.exec;
      if (execStr) window.robos.execDesktopAction(execStr);
      removeContextMenu();
    }
  });

  document.body.appendChild(picker);
  activeMenu = picker;

  activeContextMenuOutsideHandler = (e) => {
    if (picker && picker.contains(e.target)) return;
    removeContextMenu();
  };
  setTimeout(() => {
    if (activeMenu === picker) {
      document.addEventListener('click', activeContextMenuOutsideHandler);
    }
  }, 0);
}

// ── Context menu ───────────────────────────────────────────────────────────────
let activeMenu = null;
let activeContextMenuOutsideHandler = null;

function showContextMenu(x, y, target) {
  removeContextMenu();
  try { window.robos.setMenuOpen(true); } catch(_) {}

  const isMulti = target && target.windows && target.windows.length > 1;
  const instance = isMulti ? target.instance : (target?.instance || target);
  const wid = isMulti ? target.windows[0].wid : (target?.wid || target);
  const actions = (target && target.actions) ? target.actions : [];
  const pinned = isPinned(instance);

  document.body.classList.add('has-active-menu');
  const targetBtn2 = instance ? document.querySelector(`.dock-btn[data-instance="${instance}"]`) : null;
  if (targetBtn2) targetBtn2.classList.add('menu-active');

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  const extraH = actions.length ? (actions.length * 30 + 8) : 0;
  const menuH = (isMulti ? 200 : 160) + extraH;
  const menuW = 230;
  const { top, left } = computeMenuPosition(instance, menuW, menuH, x, y);
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';

  // Desktop actions (e.g. "New Window") go at the top with a divider
  let actionsHtml = '';
  if (actions.length) {
    for (const a of actions) {
      actionsHtml += `<div class="ctx-item ctx-action" data-exec="${a.exec.replace(/"/g, '&quot;')}">🪟 ${a.name}</div>`;
    }
    actionsHtml += '<div class="ctx-divider"></div>';
  }

  const pinLabel = pinned ? '📌 Unpin from Dock' : '📌 Pin to Dock';

  if (!isMulti) {
    menu.innerHTML = `
      ${actionsHtml}
      <div class="ctx-item" data-action="focus">🔍 Bring to Front</div>
      <div class="ctx-item" data-action="maximize">⬜ Maximize / Restore</div>
      <div class="ctx-item" data-action="minimize">➖ Minimize</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item" data-action="pin">${pinLabel}</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item ctx-close" data-action="close">✕ Close</div>
    `;
  } else {
    menu.innerHTML = `
      ${actionsHtml}
      <div class="ctx-item" data-action="pick-windows">📑 Show All Windows (${target.windows.length})</div>
      <div class="ctx-item" data-action="focus-all">🔍 Bring All to Front</div>
      <div class="ctx-item" data-action="minimize-all">➖ Minimize All</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item" data-action="pin">${pinLabel}</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item ctx-close" data-action="close-all">✕ Close All (${target.windows.length})</div>
    `;
  }

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    const action = item.dataset.action;
    const execStr = item.dataset.exec;
    if (execStr) window.robos.execDesktopAction(execStr);
    if (action === 'focus') window.robos.focusWindow(wid);
    if (action === 'minimize') window.robos.minimizeWindow(wid);
    if (action === 'maximize') window.robos.maximizeWindow(wid);
    if (action === 'close') window.robos.closeWindow(wid);
    if (action === 'pick-windows') {
      removeContextMenu();
      toggleWindowPicker(x, y, target);
      return;
    }
    if (action === 'focus-all') {
      target.windows.forEach(w => window.robos.focusWindow(w.wid));
    }
    if (action === 'minimize-all') {
      target.windows.forEach(w => window.robos.minimizeWindow(w.wid));
    }
    if (action === 'close-all') {
      target.windows.forEach(w => window.robos.closeWindow(w.wid));
      setTimeout(refreshWindows, 200);
    }
    if (action === 'pin') {
      isPinned(instance) ? unpinApp(instance) : pinApp(isMulti ? target.windows[0] : target);
    }
    removeContextMenu();
  });
  document.body.appendChild(menu);
  activeMenu = menu;

  activeContextMenuOutsideHandler = (e) => {
    if (menu && menu.contains(e.target)) return;
    removeContextMenu();
  };
  setTimeout(() => {
    if (activeMenu === menu) {
      document.addEventListener('click', activeContextMenuOutsideHandler);
    }
  }, 0);
}

function removeContextMenu() {
  if (activeContextMenuOutsideHandler) {
    document.removeEventListener('click', activeContextMenuOutsideHandler);
    activeContextMenuOutsideHandler = null;
  }
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
  document.body.classList.remove('has-active-menu');
  document.querySelectorAll('.dock-btn.menu-active').forEach(b => b.classList.remove('menu-active'));
  try { window.robos.setMenuOpen(false); } catch(_) {}
}

function showPinnedContextMenu(x, y, pinned) {
  removeContextMenu();
  try { window.robos.setMenuOpen(true); } catch(_) {}
  document.body.classList.add('has-active-menu');
  const targetBtn = pinned.instance ? document.querySelector(`.dock-btn[data-instance="${pinned.instance}"]`) : null;
  if (targetBtn) targetBtn.classList.add('menu-active');

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  const menuH = 100, menuW = 210;
  const { top, left } = computeMenuPosition(pinned.instance, menuW, menuH, x, y);
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';

  menu.innerHTML = `
    <div class="ctx-item" data-action="launch">▶ Launch</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" data-action="unpin">📌 Unpin from Dock</div>
  `;
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'launch') window.robos.execDesktopAction(pinned.exec);
    if (action === 'unpin')  unpinApp(pinned.instance);
    removeContextMenu();
  });
  document.body.appendChild(menu);
  activeMenu = menu;

  activeContextMenuOutsideHandler = (e) => {
    if (menu && menu.contains(e.target)) return;
    removeContextMenu();
  };
  setTimeout(() => {
    if (activeMenu === menu) {
      document.addEventListener('click', activeContextMenuOutsideHandler);
    }
  }, 0);
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
  try { window.robos.setMenuOpen(true); } catch(_) {}
  document.removeEventListener('click', closeSysMenuOutside);
  setTimeout(() => document.addEventListener('click', closeSysMenuOutside), 0);
}

function closeSysMenu() {
  const menu = document.getElementById('sys-menu');
  const btn  = document.getElementById('robos-logo-btn');
  sysMenuOpen = false;
  menu.style.display = 'none';
  btn.classList.remove('active');
  document.removeEventListener('click', closeSysMenuOutside);
  try { window.robos.setMenuOpen(false); } catch(_) {}
}

function closeSysMenuOutside(e) {
  const menu = document.getElementById('sys-menu');
  const btn  = document.getElementById('robos-logo-btn');
  if ((menu && menu.contains(e.target)) || (btn && btn.contains(e.target))) return;
  closeSysMenu();
}

// ── Poller ─────────────────────────────────────────────────────────────────────
function startPoller() {
  poll();
  setInterval(poll, 2500);
}

async function poll() {
  try {
    x11Windows = await window.robos.getX11Windows() || [];
  } catch { x11Windows = []; }
  renderX11Windows(x11Windows);
}
window.poll = poll;
window.refreshWindows = poll;

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

// ── Agent Swarm Widget & Menu ────────────────────────────────────────────────
let agentMenuOpen = false;
let agentProfiles = [];

async function pollAgents() {
  try {
    if (window.robos && window.robos.listAgentProfiles) {
      agentProfiles = await window.robos.listAgentProfiles();
    }
  } catch {}

  const active = agentProfiles.filter(p => p.status === 'active');
  const chipBtn = document.getElementById('btn-agent-widget');
  const chipCount = document.getElementById('agent-chip-count');
  const menuBadge = document.getElementById('agent-menu-badge');

  if (chipCount) chipCount.textContent = `${active.length} Agent${active.length === 1 ? '' : 's'}`;
  if (chipBtn) chipBtn.classList.toggle('has-agents', active.length > 0);
  if (menuBadge) menuBadge.textContent = `${active.length} Active`;

  if (agentMenuOpen) renderAgentMenu();
}

function renderAgentMenu() {
  const container = document.getElementById('agent-menu-list');
  if (!container) return;
  const active = agentProfiles.filter(p => p.status === 'active');

  if (!active.length) {
    container.innerHTML = `<div class="agent-empty">No active agent sessions running.</div>`;
    return;
  }

  container.innerHTML = active.map(p => `
    <div class="agent-item" data-user="${p.username}">
      <div class="agent-item-info">
        <div class="agent-item-name">👤 ${esc(p.username)}</div>
        <div class="agent-item-meta">
          <span>${esc(p.role || 'Agent')}</span>
          <span>&middot;</span>
          <span>${esc(p.quota || '2G')} RAM</span>
        </div>
      </div>
      <button class="btn-kill-agent" data-user="${p.username}">Kill & Wipe</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-kill-agent').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.killAgentProfile(btn.dataset.user);
    });
  });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.toggleAgentMenu = function() {
  agentMenuOpen = !agentMenuOpen;
  const menu = document.getElementById('agent-menu');
  if (menu) {
    menu.style.display = agentMenuOpen ? 'block' : 'none';
    if (agentMenuOpen) renderAgentMenu();
  }
};

window.killAgentProfile = async function(username) {
  if (window.robos && window.robos.killAgentProfile) {
    await window.robos.killAgentProfile(username);
  }
  await pollAgents();
  showToast(`Agent session ${username} terminated`);
};

window.wipeAllAgents = async function() {
  if (window.robos && window.robos.wipeAllAgentProfiles) {
    await window.robos.wipeAllAgentProfiles();
  }
  await pollAgents();
  showToast('All agent sessions wiped');
};

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

  const btnAgentWidget = document.getElementById('btn-agent-widget');
  if (btnAgentWidget) {
    btnAgentWidget.addEventListener('click', (e) => {
      e.stopPropagation();
      window.toggleAgentMenu();
    });
  }

  const btnWipeAll = document.getElementById('btn-wipe-all-agents');
  if (btnWipeAll) {
    btnWipeAll.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.wipeAllAgents();
    });
  }

  const btnShowDesktop = document.getElementById('btn-show-desktop');
  if (btnShowDesktop) {
    btnShowDesktop.addEventListener('click', async () => {
      const res = await window.robos.toggleShowDesktop();
      const isShowing = res && res.showingDesktop;
      btnShowDesktop.classList.toggle('active', isShowing);
      showToast(isShowing ? 'Desktop (Windows Minimized)' : 'Windows Restored');
      setTimeout(poll, 300);
    });
  }

  window.addEventListener('resize', () => {
    removeContextMenu();
    closeSysMenu();
    updateDockRect();
    lastWinSnap = '';
    poll();
  });

  setInterval(pollAgents, 1000);
  pollAgents();
}

document.addEventListener('DOMContentLoaded', init);

