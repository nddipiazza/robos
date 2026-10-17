'use strict';

let allApps = [];
let activeCategory = 'All';
let activeStatusFilter = 'all';
let searchQuery = '';
let viewMode = 'grid'; // 'grid' | 'table'
let selectedAppIds = new Set();
let inspectedAppId = null;

// DOM elements
const appsGrid = document.getElementById('apps-grid');
const categoryTabs = document.getElementById('category-tabs');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const selectionCountEl = document.getElementById('selection-count');
const progressPanel = document.getElementById('progress-panel');
const progressLabel = document.getElementById('progress-label');
const progressPct = document.getElementById('progress-pct');
const progressFill = document.getElementById('progress-fill');
const statusBanner = document.getElementById('status-banner');

// KPI elements
const statTotal = document.getElementById('stat-total');
const statAppMenu = document.getElementById('stat-app-menu');
const statDesktop = document.getElementById('stat-desktop');
const statDock = document.getElementById('stat-dock');
const statIcons = document.getElementById('stat-icons');

// Modal elements
const detailsModal = document.getElementById('details-modal');
const modalTitle = document.getElementById('modal-app-title');
const modalSubtitle = document.getElementById('modal-app-subtitle');
const modalMetaGrid = document.getElementById('modal-meta-grid');
const modalDesktopCode = document.getElementById('modal-desktop-code');
const modalWrapperCode = document.getElementById('modal-wrapper-code');

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showStatus(message, type = 'ok') {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusBanner.className = 'status-banner hidden';
  }, 5500);
}

function updateKPIs() {
  const total = allApps.length;
  const inAppMenu = allApps.filter(a => a.appMenuInstalled || a.systemMenuInstalled).length;
  const onDesktop = allApps.filter(a => a.desktopShortcutInstalled).length;
  const dockPinned = allApps.filter(a => a.dockPinned).length;
  const iconsReady = allApps.filter(a => a.iconInstalled).length;

  statTotal.textContent = String(total);
  statAppMenu.textContent = `${inAppMenu} / ${total}`;
  statDesktop.textContent = String(onDesktop);
  statDock.textContent = String(dockPinned);
  statIcons.textContent = `${iconsReady} / ${total}`;
}

function getFilteredApps() {
  const q = searchQuery.trim().toLowerCase();
  return allApps.filter(app => {
    if (activeCategory !== 'All' && app.category !== activeCategory) {
      return false;
    }
    if (activeStatusFilter === 'app-menu' && !app.appMenuInstalled && !app.systemMenuInstalled) {
      return false;
    }
    if (activeStatusFilter === 'not-installed' && (app.appMenuInstalled || app.systemMenuInstalled)) {
      return false;
    }
    if (activeStatusFilter === 'on-desktop' && !app.desktopShortcutInstalled) {
      return false;
    }
    if (activeStatusFilter === 'no-desktop' && app.desktopShortcutInstalled) {
      return false;
    }
    if (activeStatusFilter === 'dock-pinned' && !app.dockPinned) {
      return false;
    }
    if (q) {
      const hay = `${app.label} ${app.name} ${app.appId} ${app.category} ${app.comment}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function getTargetAppIds() {
  if (selectedAppIds.size > 0) {
    return Array.from(selectedAppIds);
  }
  return getFilteredApps().map(a => a.appId);
}

function updateSelectionBadge() {
  const filtered = getFilteredApps();
  if (selectedAppIds.size > 0) {
    selectionCountEl.textContent = `${selectedAppIds.size} selected`;
  } else {
    selectionCountEl.textContent = `All ${filtered.length} visible`;
  }
}

function renderCategoryTabs() {
  const counts = { All: allApps.length };
  for (const app of allApps) {
    const c = app.category || 'System';
    counts[c] = (counts[c] || 0) + 1;
  }

  const categories = ['All', ...Object.keys(counts).filter(k => k !== 'All').sort()];
  categoryTabs.innerHTML = categories.map(cat => {
    const isActive = cat === activeCategory;
    return `
      <button class="cat-pill ${isActive ? 'active' : ''}" data-category="${esc(cat)}">
        ${esc(cat)}<span class="cat-pill-count">(${counts[cat]})</span>
      </button>
    `;
  }).join('');

  categoryTabs.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      renderCategoryTabs();
      renderApps();
    });
  });
}

function renderApps() {
  const filtered = getFilteredApps();
  updateSelectionBadge();
  appsGrid.className = viewMode === 'table' ? 'apps-grid table-view' : 'apps-grid';

  if (filtered.length === 0) {
    appsGrid.innerHTML = `
      <div class="empty-state">
        No RobOS applications match your current filter criteria.
      </div>
    `;
    return;
  }

  appsGrid.innerHTML = filtered.map(app => {
    const isSelected = selectedAppIds.has(app.appId);
    const inMenu = app.appMenuInstalled || app.systemMenuInstalled;
    const onDesktop = app.desktopShortcutInstalled;
    const isPinned = app.dockPinned;

    return `
      <div class="app-card ${isSelected ? 'selected' : ''}" data-appid="${esc(app.appId)}">
        <div class="app-card-top">
          <input type="checkbox" class="app-checkbox" data-action="select" data-appid="${esc(app.appId)}" ${isSelected ? 'checked' : ''} title="Select ${esc(app.label)}">
          <div class="app-icon-box">${app.iconSvg || ''}</div>
          <div class="app-title-wrap">
            <div class="app-title-row">
              <span class="app-name" title="${esc(app.name)}">${esc(app.label)}</span>
              <span class="app-cat-badge">${esc(app.category)}</span>
            </div>
            <div class="app-id-code">${esc(app.appId)}</div>
          </div>
        </div>

        <div class="app-comment" title="${esc(app.comment)}">${esc(app.comment)}</div>

        <div class="app-status-row">
          <span class="status-pill ${inMenu ? 'active-cyan' : ''}">
            ${inMenu ? '✓ App Grid' : '○ Not in Grid'}
          </span>
          <span class="status-pill ${onDesktop ? 'active-green' : ''}">
            ${onDesktop ? (app.desktopShortcutTrusted ? '✓ ~/Desktop (Trusted)' : '✓ ~/Desktop') : '○ No Desktop Icon'}
          </span>
          <span class="status-pill ${isPinned ? 'active-purple' : ''}">
            ${isPinned ? '★ Dock Pinned' : '☆ Dock Unpinned'}
          </span>
        </div>

        <div class="app-actions-row">
          <button class="toggle-btn ${inMenu ? 'on-menu' : ''}" data-action="install-menu" data-appid="${esc(app.appId)}" title="Install or repair .desktop entry in ~/.local/share/applications and ~/.local/bin/${esc(app.appId)}">
            ${inMenu ? '↻ Update App Grid' : '+ Install App Grid'}
          </button>
          <button class="toggle-btn ${onDesktop ? 'on-desktop' : ''}" data-action="toggle-desktop" data-appid="${esc(app.appId)}" title="Toggle trusted shortcut in ~/Desktop/${esc(app.appId)}.desktop">
            ${onDesktop ? '✓ On Desktop' : '+ ~/Desktop'}
          </button>
          <button class="toggle-btn ${isPinned ? 'on-dock' : ''}" data-action="toggle-dock" data-appid="${esc(app.appId)}" title="Toggle pin on GNOME Shell Favorites Dock">
            ${isPinned ? '★ Pinned' : '+ Dock'}
          </button>
          <button class="icon-btn" data-action="launch" data-appid="${esc(app.appId)}" title="Launch ${esc(app.label)}">▶</button>
          <button class="icon-btn" data-action="inspect" data-appid="${esc(app.appId)}" title="Inspect .desktop &amp; wrapper script">{ }</button>
        </div>
      </div>
    `;
  }).join('');
}

function replaceSingleAppInState(updatedApp) {
  if (!updatedApp) return;
  const idx = allApps.findIndex(a => a.appId === updatedApp.appId);
  if (idx !== -1) {
    allApps[idx] = updatedApp;
  }
  updateKPIs();
  renderApps();
}

// Event delegation on appsGrid
appsGrid.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const appId = target.dataset.appid;
  const app = allApps.find(a => a.appId === appId);
  if (!app) return;

  if (action === 'select') {
    if (target.checked) {
      selectedAppIds.add(appId);
    } else {
      selectedAppIds.delete(appId);
    }
    renderApps();
    return;
  }

  if (action === 'install-menu') {
    target.disabled = true;
    const res = await window.robosDesktopInstaller.installApp(appId, { appMenu: true });
    target.disabled = false;
    if (res.ok) {
      replaceSingleAppInState(res.app);
      showStatus(`Installed ${app.label} (${appId}.desktop) into GNOME App Grid & ~/.local/bin`, 'ok');
    } else {
      showStatus(`Failed to install ${appId}: ${res.error}`, 'err');
    }
    return;
  }

  if (action === 'toggle-desktop') {
    target.disabled = true;
    const nextState = !app.desktopShortcutInstalled;
    const res = await window.robosDesktopInstaller.setDesktopShortcut(appId, nextState);
    target.disabled = false;
    if (res.ok) {
      replaceSingleAppInState(res.app);
      showStatus(
        nextState
          ? `Created trusted GNOME Desktop shortcut: ~/Desktop/${appId}.desktop`
          : `Removed ~/Desktop/${appId}.desktop`,
        'ok'
      );
    } else {
      showStatus(`Desktop shortcut error for ${appId}: ${res.error}`, 'err');
    }
    return;
  }

  if (action === 'toggle-dock') {
    target.disabled = true;
    const nextPinned = !app.dockPinned;
    const res = await window.robosDesktopInstaller.setDockPinned(appId, nextPinned);
    target.disabled = false;
    if (res.ok) {
      replaceSingleAppInState(res.app);
      showStatus(
        nextPinned
          ? `Pinned ${app.label} to GNOME Shell Dock`
          : `Unpinned ${app.label} from GNOME Shell Dock`,
        'ok'
      );
    } else {
      showStatus(`Dock update error for ${appId}: ${res.error}`, 'err');
    }
    return;
  }

  if (action === 'launch') {
    const res = await window.robosDesktopInstaller.launchApp(appId);
    if (res.ok) {
      showStatus(`Launched ${app.label} (PID ${res.pid || 'spawned'})`, 'ok');
    } else {
      showStatus(`Failed to launch ${app.label}: ${res.error}`, 'err');
    }
    return;
  }

  if (action === 'inspect') {
    await openDetailsModal(appId);
  }
});

// ── Bulk Actions (Background Worker Thread) ──────────────────────────────────

const bulkButtons = [
  document.getElementById('btn-install-all-menu'),
  document.getElementById('btn-add-all-desktop'),
  document.getElementById('btn-remove-all-desktop'),
  document.getElementById('btn-refresh-caches'),
  document.getElementById('btn-reload'),
];

function setToolbarBusy(busy) {
  for (const btn of bulkButtons) {
    if (btn) btn.disabled = busy;
  }
}

async function runBulkInstall(options, startLabel) {
  const targetIds = getTargetAppIds();
  if (targetIds.length === 0) {
    showStatus('No apps match current selection.', 'err');
    return;
  }

  setToolbarBusy(true);
  progressPanel.classList.remove('hidden');
  progressLabel.textContent = `${startLabel} (0/${targetIds.length})...`;
  progressPct.textContent = '0%';
  progressFill.style.width = '0%';

  window.robosDesktopInstaller.onProgress((stepData) => {
    requestAnimationFrame(() => {
      const pct = Math.round((stepData.step / stepData.total) * 100);
      progressLabel.textContent = `[${stepData.step}/${stepData.total}] ${stepData.label} (${stepData.appId})`;
      progressPct.textContent = `${pct}%`;
      progressFill.style.width = `${pct}%`;
    });
  });

  const res = await window.robosDesktopInstaller.bulkInstall(targetIds, options);
  progressPanel.classList.add('hidden');
  setToolbarBusy(false);

  if (res.apps) {
    allApps = res.apps;
    updateKPIs();
    renderCategoryTabs();
    renderApps();
  }

  showStatus(
    res.ok
      ? `Completed: ${res.succeeded} RobOS apps installed on background worker and GNOME caches updated.`
      : `Finished with ${res.succeeded} succeeded, ${res.failed} failed.`,
    res.ok ? 'ok' : 'err'
  );
}

document.getElementById('btn-install-all-menu').addEventListener('click', () => {
  runBulkInstall({ appMenu: true }, 'Installing apps to GNOME App Grid');
});

document.getElementById('btn-add-all-desktop').addEventListener('click', () => {
  runBulkInstall({ appMenu: true, desktopShortcut: true }, 'Creating trusted ~/Desktop shortcuts');
});

document.getElementById('btn-remove-all-desktop').addEventListener('click', async () => {
  const targetIds = getTargetAppIds();
  setToolbarBusy(true);
  const res = await window.robosDesktopInstaller.bulkRemoveDesktop(targetIds);
  setToolbarBusy(false);
  if (res.apps) {
    allApps = res.apps;
    updateKPIs();
    renderApps();
  }
  showStatus(`Removed ${res.removed} shortcut(s) from ~/Desktop.`, 'ok');
});

document.getElementById('btn-refresh-caches').addEventListener('click', async () => {
  setToolbarBusy(true);
  const res = await window.robosDesktopInstaller.refreshCaches();
  setToolbarBusy(false);
  if (res.apps) {
    allApps = res.apps;
    updateKPIs();
    renderApps();
  }
  showStatus('Rebuilt GTK hicolor icon cache, desktop entry database, and GIO desktop trust flags.', 'ok');
});

document.getElementById('btn-reload').addEventListener('click', () => loadApps());

// ── Filters & Selection ──────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  renderApps();
});

statusFilter.addEventListener('change', () => {
  activeStatusFilter = statusFilter.value;
  renderApps();
});

document.getElementById('btn-select-visible').addEventListener('click', () => {
  for (const app of getFilteredApps()) {
    selectedAppIds.add(app.appId);
  }
  renderApps();
});

document.getElementById('btn-clear-selection').addEventListener('click', () => {
  selectedAppIds.clear();
  renderApps();
});

document.getElementById('btn-view-grid').addEventListener('click', (e) => {
  viewMode = 'grid';
  e.currentTarget.classList.add('active');
  document.getElementById('btn-view-table').classList.remove('active');
  renderApps();
});

document.getElementById('btn-view-table').addEventListener('click', (e) => {
  viewMode = 'table';
  e.currentTarget.classList.add('active');
  document.getElementById('btn-view-grid').classList.remove('active');
  renderApps();
});

// ── Inspector Modal ──────────────────────────────────────────────────────────

async function openDetailsModal(appId) {
  const res = await window.robosDesktopInstaller.getDetails(appId);
  if (!res.ok) {
    showStatus(res.error || 'Could not load details', 'err');
    return;
  }

  inspectedAppId = appId;
  const { app, generatedDesktop, activeDesktopContent, generatedWrapper } = res;
  modalTitle.textContent = `${app.name} (${app.appId})`;
  modalSubtitle.textContent = app.comment;

  modalMetaGrid.innerHTML = `
    <div class="meta-item">
      <div class="meta-item-label">StartupWMClass</div>
      <div class="meta-item-val">${esc(app.wmClass)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-item-label">Package Directory</div>
      <div class="meta-item-val">${esc(app.packageDir || '(system)')}</div>
    </div>
    <div class="meta-item">
      <div class="meta-item-label">App Grid Entry Path</div>
      <div class="meta-item-val">${esc(app.userDesktopPath)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-item-label">Desktop Shortcut Path</div>
      <div class="meta-item-val">${esc(app.desktopShortcutPath)}</div>
    </div>
  `;

  modalDesktopCode.textContent = activeDesktopContent || generatedDesktop;
  modalWrapperCode.textContent = generatedWrapper;
  detailsModal.classList.remove('hidden');
}

document.getElementById('btn-close-modal').addEventListener('click', () => {
  detailsModal.classList.add('hidden');
  inspectedAppId = null;
});

detailsModal.addEventListener('click', (e) => {
  if (e.target === detailsModal) {
    detailsModal.classList.add('hidden');
    inspectedAppId = null;
  }
});

document.getElementById('btn-modal-uninstall').addEventListener('click', async () => {
  if (!inspectedAppId) return;
  const appId = inspectedAppId;
  const res = await window.robosDesktopInstaller.uninstallApp(appId);
  detailsModal.classList.add('hidden');
  if (res.ok) {
    replaceSingleAppInState(res.app);
    showStatus(`Uninstalled GNOME launcher, desktop shortcut, and wrapper for ${appId}`, 'ok');
  } else {
    showStatus(`Uninstall failed: ${res.error}`, 'err');
  }
});

document.getElementById('btn-modal-launch').addEventListener('click', async () => {
  if (!inspectedAppId) return;
  await window.robosDesktopInstaller.launchApp(inspectedAppId);
  showStatus(`Launched ${inspectedAppId}`, 'ok');
});

document.getElementById('btn-modal-reinstall').addEventListener('click', async () => {
  if (!inspectedAppId) return;
  const res = await window.robosDesktopInstaller.installApp(inspectedAppId, { appMenu: true });
  if (res.ok) {
    replaceSingleAppInState(res.app);
    await openDetailsModal(inspectedAppId);
    showStatus(`Reinstalled ${inspectedAppId}`, 'ok');
  }
});

// ── Initial Load (Non-blocking on Background Worker Thread) ──────────────────

async function loadApps() {
  if (allApps.length === 0) {
    appsGrid.innerHTML = `
      <div class="empty-state">
        Scanning RobOS packages and GNOME Desktop directories on background worker thread...
      </div>
    `;
  }
  setToolbarBusy(true);
  const res = await window.robosDesktopInstaller.listApps();
  setToolbarBusy(false);
  if (!res || !res.ok) {
    showStatus('Failed to discover RobOS applications.', 'err');
    return;
  }
  allApps = res.apps || [];
  updateKPIs();
  renderCategoryTabs();
  renderApps();
}

requestAnimationFrame(() => {
  loadApps();
});
