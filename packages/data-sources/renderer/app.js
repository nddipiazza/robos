'use strict';

let drivers = [];
let dsList = [];
let cloudFolders = [];
let selectedDsId = null;
let activeCategoryFilter = 'all';
let currentRemotePath = '/';

// Wizard state
let wizardStep = 1;
let wizardDriverId = 'gdrive';
let wizardEditingId = null;
let wizardAuthState = {
  loggedIn: false,
  user: '',
  accessToken: '',
  refreshToken: '',
  localMountPath: '',
};

const STORAGE_DRIVERS = new Set(['gdrive', 's3', 'dropbox', 'onedrive', 'webdav', 'sftp', 'ftp', 'local']);

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isStorageDs(ds) {
  if (!ds) return false;
  return ds.category === 'storage' || STORAGE_DRIVERS.has(String(ds.driverType || '').toLowerCase());
}

function isGDriveLoggedIn(ds) {
  if (!ds || ds.driverType !== 'gdrive') return true;
  if (ds.authStatus === 'logged_out' || ds.status === 'Login Required' || ds.loggedIn === false) return false;
  return Boolean(ds.accessToken || ds.refreshToken || ds.localMountPath || ds.serviceAccountKeyPath || ds.serviceAccountJson);
}

// ── Source-Only Declaration Mode (when ROBOS_GRAPH_ROOT is set) ─────────────

function renderSourceWorkspace(ws) {
  const label = id => ws.labels?.[id] || String(id || '').split(':').pop();
  const list = values => [].concat(values || []).map(v => typeof v === 'string' ? v : v?.['@id']).filter(Boolean);
  const items = ws.nodes.map(node => {
    const title = esc(node['dcterms:title'] || node['@id']);
    const id = esc(node['@id']);
    const types = [].concat(node['@type'] || []).map(t => `<code>${esc(t)}</code>`).join(' ');
    const engine = node['robos:engine'] || node['robos:driverType'] || node['robos:brokerType'] || '';
    const services = list(node['robos:boundServices']).map(ref => `<li>${esc(label(ref))} <code>${esc(ref)}</code></li>`).join('');
    const evidence = (node['robos:evidence'] || []).map(ev =>
      `<li><code>${esc([ev.repository, ev.path].filter(Boolean).join(':'))}${ev.line ? `:${esc(ev.line)}` : ''}</code></li>`).join('');
    return `<article class="source-card" data-node-id="${id}">
      <h3>${title}</h3>
      <p><code>${id}</code> ${types} ${engine ? `<span>${esc(engine)}</span>` : ''}</p>
      ${services ? `<section><h4>Services</h4><ul>${services}</ul></section>` : ''}
      ${evidence ? `<section><h4>Evidence</h4><ul>${evidence}</ul></section>` : ''}
    </article>`;
  }).join('');
  document.body.innerHTML = `<main class="source-workspace" style="padding:24px;overflow:auto;height:100vh;">
    <header style="margin-bottom:16px;">
      <p>Read-only source workspace</p>
      <h1>${esc(ws.title || ws.appName)}</h1>
      <p><code>${esc(ws.root)}</code></p>
    </header>
    <section aria-label="Declared data and messaging resources">${items || '<p>No data store or messaging declarations found in this graph workspace.</p>'}</section>
  </main>`;
}

// ── Initialization ──────────────────────────────────────────────────────────

async function init() {
  const sourceWorkspace = await window.dataSources.getSourceWorkspace?.();
  if (sourceWorkspace?.sourceOnly) {
    renderSourceWorkspace(sourceWorkspace);
    return;
  }

  drivers = await window.dataSources.getDrivers();
  dsList = await window.dataSources.getDataSources();
  try {
    cloudFolders = await window.dataSources.getCloudFolders();
  } catch {
    cloudFolders = [];
  }

  bindEvents();
  renderWizardProviderCards();

  if (dsList.length > 0 && !selectedDsId) {
    selectedDsId = dsList[0].id;
  }

  renderAll();
}

function renderAll() {
  renderSidebar();
  renderMainWorkspace();
  renderMountedFoldersTab();
}

// ── Sidebar Rendering ───────────────────────────────────────────────────────

function getFilteredDataSources() {
  const q = (document.getElementById('ds-search')?.value || '').trim().toLowerCase();
  return dsList.filter(ds => {
    if (activeCategoryFilter === 'storage' && !isStorageDs(ds)) return false;
    if (activeCategoryFilter === 'database' && isStorageDs(ds)) return false;
    if (!q) return true;
    return (
      (ds.name || '').toLowerCase().includes(q) ||
      (ds.driverType || '').toLowerCase().includes(q) ||
      (ds.user || '').toLowerCase().includes(q) ||
      (ds.host || '').toLowerCase().includes(q)
    );
  });
}

function renderSidebar() {
  const listEl = document.getElementById('sidebar-ds-list');
  const countBadge = document.getElementById('ds-count-badge');
  if (countBadge) countBadge.textContent = String(dsList.length);
  if (!listEl) return;

  const filtered = getFilteredDataSources();
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="padding:24px 12px;text-align:center;color:var(--text-muted);font-size:12px;">
        ${dsList.length === 0 ? 'No data sources added yet.<br>Click <b>+ Add Google Drive</b> or <b>+ Add Data Source</b> above.' : 'No matching data sources.'}
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(ds => {
    const active = ds.id === selectedDsId ? 'active' : '';
    const needsLogin = ds.driverType === 'gdrive' && !isGDriveLoggedIn(ds);
    const statusLabel = needsLogin ? '🔑 Login Required' : (ds.status || 'Connected');
    const statusCls = needsLogin ? 'status-warn' : (ds.status === 'Failed' || ds.status === 'Error' ? 'status-error' : '');
    const subText = ds.driverType === 'gdrive'
      ? (ds.user || 'Google Drive Account')
      : (ds.host || ds.bucket || ds.database || ds.driverType);

    return `
      <div class="ds-item ${active}" data-id="${esc(ds.id)}">
        <div class="ds-item-top">
          <span class="ds-item-name">${esc(ds.name)}</span>
          <span class="driver-badge" style="font-size:9px;padding:2px 6px;">${esc((ds.driverType || 'DS').toUpperCase())}</span>
        </div>
        <div class="ds-item-sub">
          <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;">${esc(subText)}</span>
          <span class="status-pill ${statusCls}" style="font-size:10px;padding:1px 7px;">${esc(statusLabel)}</span>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.ds-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedDsId = item.dataset.id;
      currentRemotePath = '/';
      renderAll();
    });
  });
}

// ── Main Workspace Rendering ────────────────────────────────────────────────

async function renderMainWorkspace() {
  const emptyPanel = document.getElementById('empty-welcome-panel');
  const wsPanel = document.getElementById('ds-workspace-panel');

  if (dsList.length === 0) {
    emptyPanel?.classList.remove('hidden');
    wsPanel?.classList.add('hidden');
    return;
  }

  emptyPanel?.classList.add('hidden');
  wsPanel?.classList.remove('hidden');

  let ds = dsList.find(d => d.id === selectedDsId);
  if (!ds) {
    ds = dsList[0];
    selectedDsId = ds.id;
  }

  // Populate top Admin bar
  document.getElementById('ds-detail-type').textContent = (ds.driverType || 'DS').toUpperCase();
  document.getElementById('ds-detail-name').textContent = ds.name || 'Unnamed Data Source';

  const needsLogin = ds.driverType === 'gdrive' && !isGDriveLoggedIn(ds);
  const statusPill = document.getElementById('ds-status-pill');
  if (needsLogin) {
    statusPill.textContent = '🔑 Login Required';
    statusPill.className = 'status-pill status-warn';
  } else if (ds.status === 'Failed' || ds.status === 'Error') {
    statusPill.textContent = 'Error';
    statusPill.className = 'status-pill status-error';
  } else {
    statusPill.textContent = ds.user && ds.driverType === 'gdrive' ? `Connected (${ds.user})` : (ds.status || 'Connected');
    statusPill.className = 'status-pill';
  }

  const endpointEl = document.getElementById('ds-detail-endpoint');
  if (ds.driverType === 'gdrive') {
    endpointEl.textContent = `Google Drive · Account: ${ds.user || 'Not signed in'} · Root Folder: ${ds.folderId || 'root'}`;
  } else if (isStorageDs(ds)) {
    endpointEl.textContent = `${ds.host || ds.bucket || 'Local Mount'}${ds.port ? ':' + ds.port : ''} · Path: ${ds.database || '/'}`;
  } else {
    endpointEl.textContent = `${ds.host || '127.0.0.1'}${ds.port ? ':' + ds.port : ''} / ${ds.database || ''}`;
  }

  // Show/hide Google Drive browser login & logout buttons in Admin bar
  const btnBrowserLogin = document.getElementById('btn-admin-browser-login');
  const btnLogout = document.getElementById('btn-admin-logout');
  const authBanner = document.getElementById('auth-required-banner');

  if (ds.driverType === 'gdrive') {
    btnBrowserLogin.classList.remove('hidden');
    btnBrowserLogin.textContent = needsLogin ? '🌐 Log in with Browser' : '🔄 Re-login in Browser';
    if (needsLogin) {
      btnLogout.classList.add('hidden');
      authBanner.classList.remove('hidden');
      document.getElementById('auth-banner-desc').textContent =
        `"${ds.name}" is logged out. Sign in with your browser to access and mount Google Drive folders in RobOS.`;
    } else {
      btnLogout.classList.remove('hidden');
      authBanner.classList.add('hidden');
    }
  } else {
    btnBrowserLogin.classList.add('hidden');
    btnLogout.classList.add('hidden');
    authBanner.classList.add('hidden');
  }

  // Render Browse vs DB view
  const storageContainer = document.getElementById('storage-browser-container');
  const dbContainer = document.getElementById('db-browser-container');
  const browseTabBtn = document.getElementById('tab-btn-browse');

  if (isStorageDs(ds)) {
    browseTabBtn.textContent = '📂 Browse & Mount Folders';
    storageContainer.classList.remove('hidden');
    dbContainer.classList.add('hidden');
    await loadStorageDirectory(ds, currentRemotePath);
  } else {
    browseTabBtn.textContent = '🗄️ Database Overview';
    storageContainer.classList.add('hidden');
    dbContainer.classList.remove('hidden');
    document.getElementById('db-summary-text').textContent =
      `${ds.name} (${(ds.driverType || '').toUpperCase()}) at ${ds.host || '127.0.0.1'}${ds.port ? ':' + ds.port : ''}/${ds.database || ''}`;
  }

  renderDetailsTab(ds);
}

// ── Cloud Storage Folder Browser ────────────────────────────────────────────

async function loadStorageDirectory(ds, remotePath = '/') {
  currentRemotePath = remotePath || '/';
  const tbody = document.getElementById('storage-entries-tbody');
  const providerLabel = document.getElementById('storage-provider-label');
  const localMountEl = document.getElementById('storage-local-mount-path');

  providerLabel.textContent = `Provider: ${(ds.driverType || 'Storage').toUpperCase()}`;
  renderBreadcrumbs(currentRemotePath);

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Loading folder contents...</td></tr>`;

  const res = await window.dataSources.inspectSchema({
    id: ds.id,
    driverType: ds.driverType,
    path: currentRemotePath,
  });

  const remote = res?.remote || { path: currentRemotePath, entries: [] };
  if (remote.localMountPath) {
    localMountEl.textContent = remote.localMountPath;
  }

  if (remote.error) {
    const isAuthErr = Boolean(remote.authRequired || String(remote.error).toLowerCase().includes('logged out'));
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:32px;">
          <div style="color:${isAuthErr ? '#fde047' : 'var(--danger)'};font-weight:700;font-size:14px;margin-bottom:8px;">
            ${isAuthErr ? '🔑 Authentication Required — Logged Out' : '⚠️ Unable to Load Folder'}
          </div>
          <div style="color:var(--text-muted);margin-bottom:16px;">${esc(remote.error)}</div>
          ${isAuthErr ? `<button class="btn btn-primary btn-sm" id="btn-table-login-now">🌐 Sign in with Google in Browser</button>` : ''}
        </td>
      </tr>
    `;
    document.getElementById('btn-table-login-now')?.addEventListener('click', () => triggerBrowserLoginForDs(ds));
    return;
  }

  const entries = remote.entries || [];
  if (entries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:var(--text-muted);padding:28px;">
          This folder is empty. Use <b>＋ New Folder</b> or <b>⬆️ Upload Files</b> above to add content, or click <b>📌 Mount Current Folder for RobOS</b>.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = entries.map(e => {
    const isDir = e.type === 'dir';
    const icon = isDir ? '📁' : '📄';
    const sizeText = isDir ? 'Folder' : `${Math.max(1, Math.round((e.size || 0) / 1024))} KB`;
    const modText = e.modified ? e.modified.slice(0, 16).replace('T', ' ') : '—';

    return `
      <tr class="storage-row" data-path="${esc(e.path)}" data-type="${esc(e.type)}">
        <td>
          <span style="cursor:${isDir ? 'pointer' : 'default'};font-weight:${isDir ? '600' : '400'};color:${isDir ? '#58a6ff' : 'var(--text)'};" class="entry-name-link">
            ${icon} ${esc(e.name)}
          </span>
        </td>
        <td>${isDir ? 'Folder' : 'File'}</td>
        <td class="mono">${esc(sizeText)}</td>
        <td class="mono">${esc(modText)}</td>
        <td style="text-align:right;">
          ${isDir
            ? `<button class="btn btn-secondary btn-xs btn-open-dir" data-path="${esc(e.path)}">Open</button>
               <button class="btn btn-primary btn-xs btn-mount-dir" data-path="${esc(e.path)}" data-name="${esc(e.name)}">📌 Mount</button>`
            : `<button class="btn btn-secondary btn-xs btn-download-file" data-path="${esc(e.path)}">⬇️ Download</button>`
          }
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.entry-name-link, .btn-open-dir').forEach(el => {
    el.addEventListener('click', (ev) => {
      const row = ev.target.closest('tr');
      const p = ev.target.dataset.path || row?.dataset.path;
      const t = row?.dataset.type;
      if (t === 'dir' && p) {
        loadStorageDirectory(ds, p);
      }
    });
  });

  tbody.querySelectorAll('.btn-mount-dir').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = btn.dataset.path;
      const name = btn.dataset.name;
      await mountFolderForRobOS(ds, p, `${ds.name}: ${name}`);
    });
  });

  tbody.querySelectorAll('.btn-download-file').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = btn.dataset.path;
      const res = await window.dataSources.downloadFile({ dsId: ds.id, remoteFile: p });
      if (res?.ok && res.localPath) {
        await window.dataSources.openLocalPath(res.localPath);
      }
    });
  });
}

function renderBreadcrumbs(remotePath) {
  const wrap = document.getElementById('storage-breadcrumbs');
  if (!wrap) return;
  const parts = String(remotePath || '/').split('/').filter(Boolean);
  let acc = '';
  const crumbs = [`<span class="crumb ${parts.length === 0 ? 'active' : ''}" data-path="/">/ (Root)</span>`];
  parts.forEach((p, idx) => {
    acc += '/' + p;
    const isLast = idx === parts.length - 1;
    crumbs.push(`<span class="crumb ${isLast ? 'active' : ''}" data-path="${esc(acc)}">${esc(p)}</span>`);
  });
  wrap.innerHTML = crumbs.join(' <span>/</span> ');
  wrap.querySelectorAll('.crumb').forEach(c => {
    c.addEventListener('click', () => {
      const ds = dsList.find(d => d.id === selectedDsId);
      if (ds) loadStorageDirectory(ds, c.dataset.path);
    });
  });
}

async function mountFolderForRobOS(ds, remotePath, label) {
  try {
    const res = await window.dataSources.mountCloudFolder({
      dsId: ds.id,
      remotePath,
      label,
    });
    if (res?.folders) {
      cloudFolders = res.folders;
      renderMountedFoldersTab();
      switchTab('mounts');
    }
  } catch (err) {
    alert('Failed to mount folder: ' + err.message);
  }
}

// ── Mounted Folders Tab ─────────────────────────────────────────────────────

function renderMountedFoldersTab() {
  const countEl = document.getElementById('mounted-folders-count');
  const grid = document.getElementById('mounted-folders-grid');
  if (countEl) countEl.textContent = String(cloudFolders.length);
  if (!grid) return;

  if (cloudFolders.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:28px;text-align:center;color:var(--text-muted);background:var(--bg-panel);border:1px solid var(--border);border-radius:10px;">
        No folders mounted yet. Open <b>📂 Browse &amp; Mount Folders</b> and click <b>📌 Mount Current Folder for RobOS</b>.
      </div>
    `;
    return;
  }

  grid.innerHTML = cloudFolders.map(f => `
    <div class="mount-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="mount-card-title">📌 ${esc(f.label || f.dsName)}</span>
        <span class="driver-badge" style="font-size:10px;">${esc((f.driverType || 'CLOUD').toUpperCase())}</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);">Remote Path: <code>${esc(f.remotePath || '/')}</code></div>
      <div class="mount-card-path mono">${esc(f.localPath || '')}</div>
      <div class="mount-card-actions">
        <button class="btn btn-secondary btn-xs btn-open-mount-dir" data-local="${esc(f.localPath || '')}">📂 Open Folder</button>
        <button class="btn btn-secondary btn-xs btn-resync-mount" data-ds="${esc(f.dsId)}" data-remote="${esc(f.remotePath || '/')}" data-label="${esc(f.label || '')}">🔄 Sync</button>
        <button class="btn btn-danger-outline btn-xs btn-unmount-folder" data-id="${esc(f.id)}">Unmount</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.btn-open-mount-dir').forEach(btn => {
    btn.addEventListener('click', () => window.dataSources.openLocalPath(btn.dataset.local));
  });

  grid.querySelectorAll('.btn-resync-mount').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ds = dsList.find(d => d.id === btn.dataset.ds);
      if (ds) await mountFolderForRobOS(ds, btn.dataset.remote, btn.dataset.label);
    });
  });

  grid.querySelectorAll('.btn-unmount-folder').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await window.dataSources.unmountCloudFolder(btn.dataset.id);
      if (res?.folders) {
        cloudFolders = res.folders;
        renderMountedFoldersTab();
      }
    });
  });
}

// ── Details & Diagnostics Tab ───────────────────────────────────────────────

function renderDetailsTab(ds) {
  const grid = document.getElementById('ds-config-kv-grid');
  if (!grid || !ds) return;

  const items = [
    { label: 'Name', value: ds.name },
    { label: 'Provider / Driver', value: (ds.driverType || '').toUpperCase() },
    { label: 'Status', value: ds.driverType === 'gdrive' && !isGDriveLoggedIn(ds) ? 'Login Required (Logged Out)' : (ds.status || 'Connected') },
    { label: 'Account / User', value: ds.user || '—' },
    { label: 'Host / Endpoint', value: ds.host || '—' },
    { label: 'Folder ID / Database', value: ds.folderId || ds.bucket || ds.database || '/' },
    { label: 'Last Checked', value: ds.lastChecked ? ds.lastChecked.slice(0, 19).replace('T', ' ') : '—' },
  ];

  grid.innerHTML = items.map(i => `
    <div class="kv-item">
      <div class="kv-label">${esc(i.label)}</div>
      <div class="kv-val mono">${esc(i.value)}</div>
    </div>
  `).join('');
}

// ── Browser Login Trigger for Existing Data Source ──────────────────────────

async function triggerBrowserLoginForDs(ds) {
  if (!ds) return;
  const btn = document.getElementById('btn-admin-browser-login');
  const origText = btn ? btn.textContent : '';
  if (btn) btn.textContent = '⏳ Signing in via Browser...';

  try {
    const res = await window.dataSources.googleBrowserLogin({
      dsId: ds.id,
      name: ds.name,
      user: ds.user || '',
      folderId: ds.folderId || 'root',
    });
    if (res?.ok) {
      dsList = await window.dataSources.getDataSources();
      cloudFolders = await window.dataSources.getCloudFolders();
      renderAll();
    }
  } catch (err) {
    alert('Browser login cancelled or failed: ' + err.message);
  } finally {
    if (btn) btn.textContent = origText;
  }
}

// ── 3-Step Add / Edit Data Source Wizard ────────────────────────────────────

function renderWizardProviderCards() {
  const storageGrid = document.getElementById('wizard-storage-providers');
  const dbGrid = document.getElementById('wizard-db-providers');
  if (!storageGrid || !dbGrid) return;

  const storageDrivers = drivers.filter(d => d.category === 'storage');
  const dbDrivers = drivers.filter(d => d.category !== 'storage');

  const cardHtml = (d) => `
    <div class="provider-card ${d.id === wizardDriverId ? 'selected' : ''}" data-driver="${esc(d.id)}">
      <div class="provider-card-title">${esc(d.name)}</div>
      <div class="provider-card-desc">${esc(d.description)}</div>
    </div>
  `;

  storageGrid.innerHTML = storageDrivers.map(cardHtml).join('');
  dbGrid.innerHTML = dbDrivers.map(cardHtml).join('');

  document.querySelectorAll('#add-ds-modal .provider-card').forEach(card => {
    card.addEventListener('click', () => {
      wizardDriverId = card.dataset.driver;
      document.querySelectorAll('#add-ds-modal .provider-card').forEach(c => c.classList.toggle('selected', c.dataset.driver === wizardDriverId));
      setWizardStep(2);
    });
  });
}

function openAddModal(initialDriverId = null, existingDs = null) {
  wizardEditingId = existingDs ? existingDs.id : null;
  wizardDriverId = existingDs ? existingDs.driverType : (initialDriverId || 'gdrive');

  if (existingDs) {
    wizardAuthState = {
      loggedIn: isGDriveLoggedIn(existingDs),
      user: existingDs.user || '',
      accessToken: existingDs.accessToken || '',
      refreshToken: existingDs.refreshToken || '',
      localMountPath: existingDs.localMountPath || '',
    };
    document.getElementById('modal-ds-name').value = existingDs.name || '';
    document.getElementById('modal-gdrive-email').value = existingDs.user || '';
    document.getElementById('modal-gdrive-folder').value = existingDs.folderId || 'root';
    document.getElementById('modal-gdrive-local-path').value = existingDs.localMountPath || '';
    document.getElementById('modal-gdrive-token').value = existingDs.accessToken || '';
    document.getElementById('modal-ds-host').value = existingDs.host || '';
    document.getElementById('modal-ds-port').value = existingDs.port || '';
    document.getElementById('modal-ds-database').value = existingDs.database || existingDs.bucket || '/';
    document.getElementById('modal-ds-user').value = existingDs.user || '';
    document.getElementById('modal-ds-password').value = '';
    document.getElementById('modal-ds-keyfile').value = existingDs.privateKeyPath || '';
  } else {
    wizardAuthState = {
      loggedIn: false,
      user: '',
      accessToken: '',
      refreshToken: '',
      localMountPath: '',
    };
    const drv = drivers.find(d => d.id === wizardDriverId);
    document.getElementById('modal-ds-name').value = wizardDriverId === 'gdrive' ? 'My Google Drive' : (drv ? `My ${drv.name}` : '');
    document.getElementById('modal-gdrive-email').value = '';
    document.getElementById('modal-gdrive-folder').value = 'root';
    document.getElementById('modal-gdrive-local-path').value = '';
    document.getElementById('modal-gdrive-token').value = '';
    document.getElementById('modal-ds-host').value = '';
    document.getElementById('modal-ds-port').value = drv?.defaultPort || '';
    document.getElementById('modal-ds-database').value = '/';
    document.getElementById('modal-ds-user').value = drv?.defaultUser || '';
    document.getElementById('modal-ds-password').value = '';
    document.getElementById('modal-ds-keyfile').value = '';
  }

  document.getElementById('ds-modal-title').textContent = existingDs
    ? `Edit Data Source: ${existingDs.name}`
    : 'Add Data Source Wizard';

  renderWizardProviderCards();
  updateWizardAuthCardUI();

  // If caller asked for a specific driver (e.g. "+ Add Google Drive") or editing, jump right to Step 2
  setWizardStep(initialDriverId || existingDs ? 2 : 1);
  document.getElementById('add-ds-modal').classList.remove('hidden');
}

// Keep global reference for tests/legacy callers
window.openAddModal = openAddModal;

function updateWizardAuthCardUI() {
  const card = document.getElementById('wiz-gdrive-login-card');
  const icon = document.getElementById('wiz-gdrive-auth-icon');
  const title = document.getElementById('wiz-gdrive-auth-title');
  const sub = document.getElementById('wiz-gdrive-auth-sub');
  const badge = document.getElementById('wiz-gdrive-auth-badge');
  const btn = document.getElementById('btn-wizard-gdrive-login');

  if (wizardAuthState.loggedIn) {
    card.classList.add('authenticated');
    icon.textContent = '✅';
    title.textContent = `Signed in as ${wizardAuthState.user || 'Google Account'}`;
    sub.textContent = 'Your Google Drive account is authenticated and ready to test or save.';
    badge.textContent = 'Authenticated';
    badge.className = 'status-pill';
    btn.textContent = '🔄 Sign in with a Different Google Account';
  } else {
    card.classList.remove('authenticated');
    icon.textContent = '🔑';
    title.textContent = 'Sign in with Google Account';
    sub.textContent = 'Click below to open your web browser and log in to your Google Drive account.';
    badge.textContent = 'Login Required';
    badge.className = 'status-pill status-warn';
    btn.textContent = '🌐 Sign in with Google in Browser';
  }
}

function setWizardStep(step) {
  wizardStep = step;

  [1, 2, 3].forEach(n => {
    const ind = document.getElementById(`wiz-step-ind-${n}`);
    const pane = document.getElementById(`wizard-step-${n}`);
    if (ind) {
      ind.classList.toggle('active', n === step);
      ind.classList.toggle('done', n < step);
    }
    if (pane) {
      pane.classList.toggle('active', n === step);
    }
  });

  const btnBack = document.getElementById('btn-wiz-back');
  const btnNext = document.getElementById('btn-wiz-next');
  const btnSave = document.getElementById('btn-ds-modal-save');

  btnBack.classList.toggle('hidden', step === 1);
  btnNext.classList.toggle('hidden', step === 3);
  btnSave.classList.toggle('hidden', step !== 3);

  if (step === 1) {
    btnNext.textContent = 'Next: Account & Login →';
  } else if (step === 2) {
    configureWizardStep2Fields();
    btnNext.textContent = 'Next: Test & Save →';
  } else if (step === 3) {
    renderWizardStep3Review();
    runWizardConnectionTest();
  }
}

function configureWizardStep2Fields() {
  const drv = drivers.find(d => d.id === wizardDriverId) || { id: wizardDriverId, name: wizardDriverId.toUpperCase(), description: '' };
  document.getElementById('wiz-provider-badge').textContent = drv.id.toUpperCase();
  document.getElementById('wiz-provider-name').textContent = drv.name;
  document.getElementById('wiz-provider-desc').textContent = drv.description || '';

  const nameInput = document.getElementById('modal-ds-name');
  if (!nameInput.value.trim() || nameInput.value.startsWith('My ')) {
    nameInput.value = `My ${drv.name}`;
  }

  const gdriveSec = document.getElementById('wiz-gdrive-section');
  const genericSec = document.getElementById('wiz-generic-section');

  if (wizardDriverId === 'gdrive') {
    gdriveSec.classList.remove('hidden');
    genericSec.classList.add('hidden');
    updateWizardAuthCardUI();
  } else {
    gdriveSec.classList.add('hidden');
    genericSec.classList.remove('hidden');

    const portInput = document.getElementById('modal-ds-port');
    if (drv.defaultPort && !portInput.value) portInput.value = drv.defaultPort;

    const isLocal = wizardDriverId === 'local' || wizardDriverId === 'sqlite';
    document.getElementById('wiz-host-port-row').classList.toggle('hidden', isLocal);
    document.getElementById('wiz-user-pass-row').classList.toggle('hidden', isLocal);
    document.getElementById('btn-wiz-pick-generic-folder').classList.toggle('hidden', wizardDriverId !== 'local');
    document.getElementById('grp-modal-ssh-key').classList.toggle('hidden', wizardDriverId !== 'sftp');

    document.getElementById('lbl-modal-database').textContent =
      wizardDriverId === 's3' ? 'Bucket Name' :
      wizardDriverId === 'local' ? 'Local Folder Path' :
      STORAGE_DRIVERS.has(wizardDriverId) ? 'Remote Folder Path' : 'Database Name';
  }
}

function buildWizardCandidatePayload() {
  const name = document.getElementById('modal-ds-name').value.trim() || `My ${wizardDriverId.toUpperCase()}`;
  const id = wizardEditingId || `${wizardDriverId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36).slice(-4)}`;

  if (wizardDriverId === 'gdrive') {
    const email = document.getElementById('modal-gdrive-email').value.trim() || wizardAuthState.user || '';
    const folderId = document.getElementById('modal-gdrive-folder').value.trim() || 'root';
    const localMountPath = document.getElementById('modal-gdrive-local-path').value.trim() || wizardAuthState.localMountPath || '';
    const accessToken = document.getElementById('modal-gdrive-token').value.trim() || wizardAuthState.accessToken || '';
    const loggedIn = Boolean(wizardAuthState.loggedIn || accessToken || localMountPath);

    return {
      id,
      name,
      driverType: 'gdrive',
      category: 'storage',
      host: 'drive.google.com',
      port: 443,
      user: email,
      folderId,
      database: '/',
      accessToken,
      refreshToken: wizardAuthState.refreshToken || '',
      localMountPath,
      authStatus: loggedIn ? 'authenticated' : 'logged_out',
      loggedIn,
      status: loggedIn ? 'Connected' : 'Login Required',
    };
  }

  const host = document.getElementById('modal-ds-host').value.trim() || '127.0.0.1';
  const port = Number(document.getElementById('modal-ds-port').value) || null;
  const database = document.getElementById('modal-ds-database').value.trim() || '/';
  const user = document.getElementById('modal-ds-user').value.trim();
  const password = document.getElementById('modal-ds-password').value;
  const privateKeyPath = document.getElementById('modal-ds-keyfile').value.trim();

  return {
    id,
    name,
    driverType: wizardDriverId,
    category: STORAGE_DRIVERS.has(wizardDriverId) ? 'storage' : 'sql',
    host,
    port,
    database,
    bucket: wizardDriverId === 's3' ? database : undefined,
    localMountPath: wizardDriverId === 'local' ? database : undefined,
    user,
    password: password || undefined,
    privateKeyPath: privateKeyPath || undefined,
    status: 'Connected',
  };
}

function renderWizardStep3Review() {
  const candidate = buildWizardCandidatePayload();
  const grid = document.getElementById('wiz-review-grid');
  if (!grid) return;

  const rows = [
    { label: 'Data Source Name', val: candidate.name },
    { label: 'Provider', val: candidate.driverType.toUpperCase() },
    { label: 'Account / User', val: candidate.user || (candidate.driverType === 'gdrive' ? 'Not signed in yet' : '—') },
    { label: 'Target / Folder', val: candidate.folderId || candidate.database || '/' },
    { label: 'Authentication', val: candidate.driverType === 'gdrive' ? (candidate.loggedIn ? '✅ Browser Signed In' : '🟠 Login Required') : 'Configured' },
  ];

  grid.innerHTML = rows.map(r => `
    <div class="kv-item">
      <div class="kv-label">${esc(r.label)}</div>
      <div class="kv-val mono">${esc(r.val)}</div>
    </div>
  `).join('');
}

async function runWizardConnectionTest() {
  const box = document.getElementById('wiz-test-result');
  if (!box) return;
  box.className = 'test-result-box';
  box.textContent = '⏳ Testing connection and verifying credentials...';

  const candidate = buildWizardCandidatePayload();
  const res = await window.dataSources.testConnection(candidate);

  if (res?.ok) {
    box.className = 'test-result-box ok';
    box.innerHTML = `<strong>✅ Connection Verified (${res.latencyMs || 1} ms)</strong><br>${esc(res.message)}`;
  } else {
    box.className = 'test-result-box err';
    box.innerHTML = `<strong>⚠️ ${esc(res?.status || 'Connection Check')}</strong><br>${esc(res?.message || 'Connection failed')}`;
  }
}

// ── Event Bindings ──────────────────────────────────────────────────────────

function switchTab(tabId) {
  document.querySelectorAll('.ws-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(pane => pane.classList.toggle('active', pane.id === `tab-${tabId}`));
}
window.switchTab = switchTab;

function bindEvents() {
  // Header & Empty State buttons
  document.getElementById('btn-connect-gdrive')?.addEventListener('click', () => openAddModal('gdrive'));
  document.getElementById('btn-add-ds')?.addEventListener('click', () => openAddModal(null));
  document.getElementById('btn-empty-add-gdrive')?.addEventListener('click', () => openAddModal('gdrive'));
  document.getElementById('btn-empty-add-other')?.addEventListener('click', () => openAddModal(null));

  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    dsList = await window.dataSources.getDataSources();
    cloudFolders = await window.dataSources.getCloudFolders();
    renderAll();
  });

  // Search & Category filter pills
  document.getElementById('ds-search')?.addEventListener('input', () => renderSidebar());
  document.querySelectorAll('#category-filter-pills .cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activeCategoryFilter = pill.dataset.cat;
      document.querySelectorAll('#category-filter-pills .cat-pill').forEach(p => p.classList.toggle('active', p === pill));
      renderSidebar();
    });
  });

  // Workspace tabs
  document.querySelectorAll('.ws-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Admin Bar Actions
  document.getElementById('btn-admin-browser-login')?.addEventListener('click', () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (ds) triggerBrowserLoginForDs(ds);
  });

  document.getElementById('btn-banner-browser-login')?.addEventListener('click', () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (ds) triggerBrowserLoginForDs(ds);
  });

  document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds) return;
    dsList = await window.dataSources.logoutDataSource(ds.id);
    renderAll();
  });

  document.getElementById('btn-test-conn')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds) return;
    await showQuickConnectionTestModal(ds);
  });

  document.getElementById('btn-db-test-now')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (ds) await showQuickConnectionTestModal(ds);
  });

  document.getElementById('btn-details-test')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds) return;
    const out = document.getElementById('details-test-output');
    out.classList.remove('hidden');
    out.className = 'test-result-box';
    out.textContent = '⏳ Testing connection...';
    const res = await window.dataSources.testConnection(ds);
    out.className = `test-result-box ${res?.ok ? 'ok' : 'err'}`;
    out.textContent = res?.message || 'Test finished.';
    dsList = await window.dataSources.getDataSources();
    renderSidebar();
  });

  document.getElementById('btn-edit-ds')?.addEventListener('click', () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (ds) openAddModal(ds.driverType, ds);
  });

  document.getElementById('btn-details-edit')?.addEventListener('click', () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (ds) openAddModal(ds.driverType, ds);
  });

  document.getElementById('btn-delete-ds')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds) return;
    dsList = await window.dataSources.deleteDataSource(ds.id);
    cloudFolders = await window.dataSources.getCloudFolders();
    selectedDsId = dsList[0]?.id || null;
    renderAll();
  });

  // Storage Browser Toolbar
  document.getElementById('btn-storage-up')?.addEventListener('click', () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds || currentRemotePath === '/') return;
    const parts = currentRemotePath.split('/').filter(Boolean);
    parts.pop();
    loadStorageDirectory(ds, '/' + parts.join('/'));
  });

  document.getElementById('btn-storage-refresh')?.addEventListener('click', () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (ds) loadStorageDirectory(ds, currentRemotePath);
  });

  document.getElementById('btn-storage-mkdir')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds) return;
    const folderName = prompt('New folder name:');
    if (!folderName || !folderName.trim()) return;
    const newPath = (currentRemotePath === '/' ? '' : currentRemotePath) + '/' + folderName.trim();
    try {
      await window.dataSources.createFolder({ dsId: ds.id, remotePath: newPath });
      await loadStorageDirectory(ds, currentRemotePath);
    } catch (err) {
      await loadStorageDirectory(ds, currentRemotePath);
    }
  });

  document.getElementById('btn-storage-upload')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds) return;
    try {
      const res = await window.dataSources.uploadFiles({ dsId: ds.id, remoteDir: currentRemotePath });
      if (!res?.canceled) {
        await loadStorageDirectory(ds, currentRemotePath);
      }
    } catch {
      await loadStorageDirectory(ds, currentRemotePath);
    }
  });

  document.getElementById('btn-mount-current-folder')?.addEventListener('click', async () => {
    const ds = dsList.find(d => d.id === selectedDsId);
    if (!ds) return;
    const label = currentRemotePath === '/' ? `${ds.name} (Root)` : `${ds.name}: ${currentRemotePath.split('/').pop()}`;
    await mountFolderForRobOS(ds, currentRemotePath, label);
  });

  document.getElementById('btn-open-local-mount')?.addEventListener('click', () => {
    const p = document.getElementById('storage-local-mount-path')?.textContent;
    if (p) window.dataSources.openLocalPath(p);
  });

  // Wizard Modal Controls
  document.getElementById('btn-ds-modal-close')?.addEventListener('click', () => {
    document.getElementById('add-ds-modal').classList.add('hidden');
  });
  document.getElementById('btn-wiz-cancel')?.addEventListener('click', () => {
    document.getElementById('add-ds-modal').classList.add('hidden');
  });
  document.getElementById('btn-wiz-change-provider')?.addEventListener('click', () => setWizardStep(1));
  document.getElementById('btn-wiz-back')?.addEventListener('click', () => {
    if (wizardStep > 1) setWizardStep(wizardStep - 1);
  });
  document.getElementById('btn-wiz-next')?.addEventListener('click', () => {
    if (wizardStep < 3) setWizardStep(wizardStep + 1);
  });

  // Wizard Step 2: Google Drive Browser Login button
  document.getElementById('btn-wizard-gdrive-login')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-wizard-gdrive-login');
    const name = document.getElementById('modal-ds-name').value.trim() || 'My Google Drive';
    const email = document.getElementById('modal-gdrive-email').value.trim();
    const folderId = document.getElementById('modal-gdrive-folder').value.trim() || 'root';

    btn.textContent = '⏳ Opening Browser for Google Sign-In...';
    btn.disabled = true;
    try {
      const res = await window.dataSources.googleBrowserLogin({
        dsId: wizardEditingId || undefined,
        name,
        user: email,
        folderId,
      });
      if (res?.ok) {
        wizardAuthState = {
          loggedIn: true,
          user: res.user || email || 'Google Account',
          accessToken: res.accessToken || '',
          refreshToken: res.refreshToken || '',
          localMountPath: res.localMountPath || '',
        };
        if (res.user) document.getElementById('modal-gdrive-email').value = res.user;
        if (res.folderId) document.getElementById('modal-gdrive-folder').value = res.folderId;
        if (res.localMountPath) document.getElementById('modal-gdrive-local-path').value = res.localMountPath;
        updateWizardAuthCardUI();
      }
    } catch (err) {
      alert('Browser login did not complete: ' + err.message);
    } finally {
      btn.disabled = false;
      updateWizardAuthCardUI();
    }
  });

  document.getElementById('btn-wiz-pick-local')?.addEventListener('click', async () => {
    const res = await window.dataSources.pickLocalFolder();
    if (!res?.canceled && res?.folderPath) {
      document.getElementById('modal-gdrive-local-path').value = res.folderPath;
      wizardAuthState.localMountPath = res.folderPath;
      wizardAuthState.loggedIn = true;
      updateWizardAuthCardUI();
    }
  });

  document.getElementById('btn-wiz-pick-generic-folder')?.addEventListener('click', async () => {
    const res = await window.dataSources.pickLocalFolder();
    if (!res?.canceled && res?.folderPath) {
      document.getElementById('modal-ds-database').value = res.folderPath;
    }
  });

  document.getElementById('btn-wiz-pick-keyfile')?.addEventListener('click', async () => {
    const res = await window.dataSources.pickKeyFile({ title: 'Select SSH Private Key' });
    if (!res?.canceled && res?.filePath) {
      document.getElementById('modal-ds-keyfile').value = res.filePath;
    }
  });

  document.getElementById('btn-wiz-test-conn')?.addEventListener('click', () => runWizardConnectionTest());

  // Save Data Source
  document.getElementById('btn-ds-modal-save')?.addEventListener('click', async () => {
    const payload = buildWizardCandidatePayload();
    dsList = await window.dataSources.saveDataSource(payload);
    cloudFolders = await window.dataSources.getCloudFolders();
    selectedDsId = payload.id;
    document.getElementById('add-ds-modal').classList.add('hidden');
    renderAll();
  });

  // Quick Connection Test Modal
  document.getElementById('btn-test-conn-close')?.addEventListener('click', () => {
    document.getElementById('test-conn-modal').classList.add('hidden');
  });
  document.getElementById('btn-test-conn-ok')?.addEventListener('click', () => {
    document.getElementById('test-conn-modal').classList.add('hidden');
  });
  document.getElementById('btn-test-conn-login')?.addEventListener('click', async () => {
    document.getElementById('test-conn-modal').classList.add('hidden');
    const ds = dsList.find(d => d.id === selectedDsId);
    if (ds) await triggerBrowserLoginForDs(ds);
  });

  // Live IPC listeners from main process (Toast click & Browser login completion)
  window.dataSources.onAuthUpdated?.((data) => {
    if (data?.dataSources) {
      dsList = data.dataSources;
      if (data.dsId) selectedDsId = data.dsId;
      renderAll();
    }
  });

  window.dataSources.onSelectAndLogin?.((data) => {
    if (data?.dsId) {
      selectedDsId = data.dsId;
      renderAll();
    }
  });
}

async function showQuickConnectionTestModal(ds) {
  const modal = document.getElementById('test-conn-modal');
  const msgEl = document.getElementById('test-conn-msg');
  const loginBtn = document.getElementById('btn-test-conn-login');

  modal.classList.remove('hidden');
  loginBtn.classList.add('hidden');
  msgEl.className = 'test-result-box';
  msgEl.textContent = `⏳ Testing connection to "${ds.name}"...`;

  const res = await window.dataSources.testConnection(ds);
  dsList = await window.dataSources.getDataSources();
  renderSidebar();

  if (res?.ok) {
    msgEl.className = 'test-result-box ok';
    msgEl.innerHTML = `<strong>✅ Connected (${res.latencyMs || 1} ms)</strong><br>${esc(res.message)}`;
  } else {
    msgEl.className = 'test-result-box err';
    msgEl.innerHTML = `<strong>⚠️ ${esc(res?.status || 'Connection Failed')}</strong><br>${esc(res?.message || 'Unable to connect.')}`;
    if (res?.authRequired || ds.driverType === 'gdrive') {
      loginBtn.classList.remove('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
