'use strict';

let allDataSources = [];
let allDrivers = [];
let allCloudFolders = [];
let currentDataSource = null;
let currentSchema = null;
let currentRemotePath = '/';
let activeCategory = 'all';
let activeServiceFilter = 'all';
let activeTab = 'schema';
let currentTable = null;
let editingDataSourceId = null;
let searchQuery = '';

const DRIVER_ICONS = {
  gdrive: '📁',
  s3: '🪣',
  dropbox: '📦',
  onedrive: '☁️',
  webdav: '🌐',
  sftp: '⇅',
  ftp: '⇅',
  local: '🖧',
  postgres: '🐘',
  mysql: '🐬',
  oracle: '🔴',
  mssql: '🪟',
  sqlite: '🪶',
  snowflake: '❄️',
  mongodb: '🍃',
  redis: '⚡',
  dynamodb: '🔶',
  kafka: '📡',
};

const CATEGORY_LABELS = {
  storage: 'Cloud & Object Storage',
  sql: 'SQL / Relational',
  nosql: 'NoSQL & Document',
  streaming: 'Streaming & Queues',
  warehouse: 'Analytics & Warehouse',
};

const CLOUD_DRIVERS = new Set(['gdrive', 's3', 'dropbox', 'onedrive', 'webdav', 'sftp', 'ftp', 'local']);

function isCloudDriver(driverType) {
  return CLOUD_DRIVERS.has(String(driverType || '').toLowerCase());
}

function inferCategoryForDriver(driverType) {
  const d = String(driverType || '').toLowerCase();
  if (isCloudDriver(d)) return 'storage';
  if (['postgres', 'mysql', 'oracle', 'mssql', 'sqlite', 'snowflake'].includes(d)) return 'sql';
  if (['mongodb', 'redis', 'dynamodb'].includes(d)) return 'nosql';
  if (['kafka', 'nats', 'rabbitmq'].includes(d)) return 'streaming';
  return 'storage';
}

function extractDriveFolderIdClient(input) {
  const s = String(input || '').trim();
  if (!s || s === '/' || s.toLowerCase() === 'root') return 'root';
  const gdriveProto = s.match(/^gdrive:\/\/([^/?#]+)/i);
  if (gdriveProto) return gdriveProto[1];
  const foldersMatch = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch) return foldersMatch[1];
  const idParamMatch = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return s;
}

function showToast(msg, isError = false) {
  const banner = document.getElementById('toast-banner');
  if (!banner) return;
  banner.style.background = isError ? 'rgba(248, 81, 73, 0.18)' : 'rgba(0, 188, 212, 0.16)';
  banner.style.borderColor = isError ? 'rgba(248, 81, 73, 0.45)' : 'rgba(0, 188, 212, 0.45)';
  banner.innerHTML = `<span>${esc(msg)}</span><button class="btn btn-xs" onclick="document.getElementById('toast-banner').classList.add('hidden')">Dismiss</button>`;
  banner.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => banner.classList.add('hidden'), 6000);
}

async function copyTextToClipboard(text, label = 'Path') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${label} to clipboard: ${text}`);
  } catch {
    showToast(`${label}: ${text}`);
  }
}

async function init() {
  const source = await window.dataSources.getSourceWorkspace();
  if (source.sourceOnly) { window.renderSourceWorkspace(source); return; }

  allDrivers = await window.dataSources.getDrivers();
  allDataSources = await window.dataSources.getDataSources();
  try {
    allCloudFolders = await window.dataSources.getCloudFolders();
  } catch {
    allCloudFolders = [];
  }

  setupEventListeners();
  setupResizer();
  updateCategoryCounts();
  renderSidebarDataSources();
  renderMountedFolders();
  renderDataSourcesGrid();

  if (allDataSources.length > 0) {
    await selectDataSource(allDataSources[0].id);
  }
}

function updateCategoryCounts() {
  const sqlCount = allDataSources.filter(d => d.category === 'sql').length;
  const nosqlCount = allDataSources.filter(d => d.category === 'nosql').length;
  const storageCount = allDataSources.filter(d => d.category === 'storage').length;
  const streamCount = allDataSources.filter(d => d.category === 'streaming').length;

  document.getElementById('count-all').textContent = allDataSources.length;
  document.getElementById('count-sql').textContent = sqlCount;
  document.getElementById('count-nosql').textContent = nosqlCount;
  document.getElementById('count-storage').textContent = storageCount;
  document.getElementById('count-streaming').textContent = streamCount;

  const badgeText = document.getElementById('kgraph-badge-text');
  if (badgeText) {
    badgeText.textContent = `Knowledge Graph Connected (${allDataSources.length} Sources)`;
  }
  const mountBadge = document.getElementById('count-mounted-folders');
  if (mountBadge) {
    mountBadge.textContent = allCloudFolders.length;
  }
}

function getFilteredDataSources() {
  let filtered = allDataSources;
  if (activeCategory !== 'all') {
    filtered = filtered.filter(d => d.category === activeCategory);
  }
  if (activeServiceFilter !== 'all') {
    filtered = filtered.filter(d => (d.boundServices || []).some(s => s.includes(activeServiceFilter)));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.driverType || '').toLowerCase().includes(q) ||
      (d.host || '').toLowerCase().includes(q) ||
      (d.database || '').toLowerCase().includes(q) ||
      (d.folderId || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q)
    );
  }
  return filtered;
}

function renderSidebarDataSources() {
  const container = document.getElementById('sidebar-ds-list');
  if (!container) return;
  container.innerHTML = '';

  const filtered = getFilteredDataSources();
  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:8px;font-size:11px;color:#8b949e;">No matching data sources.</div>`;
    return;
  }

  filtered.forEach(ds => {
    const item = document.createElement('div');
    item.className = `sidebar-ds-item ${currentDataSource && currentDataSource.id === ds.id ? 'active' : ''}`;
    const sub = ds.driverType === 'gdrive'
      ? `gdrive://${ds.folderId || ds.database || 'root'}`
      : (ds.host ? `${ds.host}${ds.port ? ':' + ds.port : ''}` : (ds.driverType || 'local'));
    item.innerHTML = `
      <span class="sidebar-ds-icon">${DRIVER_ICONS[ds.driverType] || '🗄️'}</span>
      <div class="sidebar-ds-text">
        <div class="sidebar-ds-name">${esc(ds.name)}</div>
        <div class="sidebar-ds-sub">${esc(sub)}</div>
      </div>
      <span class="sidebar-ds-dot" title="${esc(ds.status || 'Connected')}"></span>
    `;
    item.onclick = () => {
      selectDataSource(ds.id);
      if (activeTab === 'sources-grid') switchTab('schema');
    };
    container.appendChild(item);
  });
}

function renderMountedFolders() {
  const sidebarList = document.getElementById('sidebar-mounts-list');
  const grid = document.getElementById('mounted-folders-grid');
  const mountBadge = document.getElementById('count-mounted-folders');
  if (mountBadge) mountBadge.textContent = allCloudFolders.length;

  if (sidebarList) {
    sidebarList.innerHTML = '';
    if (allCloudFolders.length === 0) {
      sidebarList.innerHTML = `<div style="padding:4px 6px;font-size:11px;color:#8b949e;">No folders mounted yet.</div>`;
    } else {
      allCloudFolders.slice(0, 5).forEach(m => {
        const row = document.createElement('div');
        row.className = 'sidebar-mount-item';
        row.title = `Local RobOS Path: ${m.localPath}`;
        row.innerHTML = `
          <span class="sidebar-mount-label">${DRIVER_ICONS[m.driverType] || '📁'} ${esc(m.label)}</span>
          <button class="btn btn-xs" data-copy="${esc(m.localPath)}" title="Copy local path">📋</button>
        `;
        row.onclick = (e) => {
          if (e.target.closest('[data-copy]')) {
            e.stopPropagation();
            copyTextToClipboard(m.localPath, 'RobOS folder path');
            return;
          }
          if (m.dsId && allDataSources.some(d => d.id === m.dsId)) {
            selectDataSource(m.dsId, m.remotePath || '/');
            switchTab('schema');
          } else {
            switchTab('cloud-folders');
          }
        };
        sidebarList.appendChild(row);
      });
    }
  }

  if (grid) {
    grid.innerHTML = '';
    if (allCloudFolders.length === 0) {
      grid.innerHTML = `
        <div class="ds-card" style="grid-column: 1 / -1; text-align:center; padding: 28px;">
          <div style="font-size:28px;margin-bottom:8px;">📁</div>
          <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:4px;">No Cloud Folders Mounted Yet</div>
          <div style="font-size:12px;color:#8b949e;margin-bottom:12px;">Connect your Google Drive or S3/SFTP storage and click "Use This Folder in RobOS" to mount folders locally.</div>
        </div>
      `;
      return;
    }

    allCloudFolders.forEach(m => {
      const card = document.createElement('div');
      card.className = 'mount-card';
      card.innerHTML = `
        <div class="mount-card-top">
          <div class="mount-card-title">
            <span>${DRIVER_ICONS[m.driverType] || '📁'}</span>
            <span>${esc(m.label)}</span>
          </div>
          <span class="badge badge-cyan">${esc((m.driverType || 'cloud').toUpperCase())}</span>
        </div>
        <div style="font-size:11px;color:#8b949e;">
          Source: <strong style="color:#c9d1d9;">${esc(m.dsName || m.dsId)}</strong> &bull; Remote Path: <code class="mono">${esc(m.remotePath || '/')}</code>
          ${m.folderId && m.driverType === 'gdrive' ? ` &bull; Drive ID: <code class="mono">${esc(m.folderId)}</code>` : ''}
        </div>
        <div>
          <div style="font-size:10px;color:#8b949e;margin-bottom:3px;text-transform:uppercase;font-weight:600;">Local RobOS Filesystem Mount Path:</div>
          <div class="mount-path-box">${esc(m.localPath)}</div>
        </div>
        <div class="mount-card-actions">
          <button class="btn btn-sm btn-gdrive" data-action="copy">📋 Copy Local Path</button>
          <button class="btn btn-sm" data-action="open">📂 Open in File Explorer</button>
          <button class="btn btn-sm" data-action="browse">🔍 Browse in Data Sources</button>
          <button class="btn btn-sm" data-action="sync">🔄 Sync Now</button>
          <button class="btn btn-sm btn-danger" data-action="unmount" style="margin-left:auto;">✕</button>
        </div>
      `;

      card.querySelector('[data-action="copy"]').onclick = () => copyTextToClipboard(m.localPath, 'RobOS folder path');
      card.querySelector('[data-action="open"]').onclick = async () => {
        const res = await window.dataSources.openLocalPath(m.localPath);
        if (!res.ok) showToast(res.error || 'Could not open folder', true);
      };
      card.querySelector('[data-action="browse"]').onclick = async () => {
        if (m.dsId) {
          await selectDataSource(m.dsId, m.remotePath || '/');
          switchTab('schema');
        }
      };
      card.querySelector('[data-action="sync"]').onclick = async () => {
        try {
          const res = await window.dataSources.mountCloudFolder({ dsId: m.dsId, remotePath: m.remotePath || '/', label: m.label });
          allCloudFolders = res.folders || allCloudFolders;
          renderMountedFolders();
          showToast(`✓ Synced "${m.label}" (${res.entry.syncedFiles || 0} files) to ${res.entry.localPath}`);
        } catch (err) {
          showToast(`Sync failed: ${err.message}`, true);
        }
      };
      card.querySelector('[data-action="unmount"]').onclick = async () => {
        const res = await window.dataSources.unmountCloudFolder(m.id);
        allCloudFolders = res.folders || [];
        renderMountedFolders();
        updateCategoryCounts();
        showToast(`Removed mounted folder "${m.label}"`);
      };

      grid.appendChild(card);
    });
  }
}

async function selectDataSource(id, initialRemotePath = '/') {
  currentDataSource = allDataSources.find(d => d.id === id);
  if (!currentDataSource) return;
  currentRemotePath = initialRemotePath || '/';

  renderSidebarDataSources();

  // Update Detail Header
  document.getElementById('ds-detail-name').textContent = currentDataSource.name;
  document.getElementById('ds-icon-avatar').textContent = DRIVER_ICONS[currentDataSource.driverType] || '🗄️';
  document.getElementById('ds-detail-type').textContent = `Type: ${currentDataSource.driverType.toUpperCase()}`;

  const catPill = document.getElementById('ds-detail-category-pill');
  if (catPill) {
    catPill.textContent = CATEGORY_LABELS[currentDataSource.category] || 'Data Source';
  }

  let endpoint = '';
  if (currentDataSource.driverType === 'gdrive') {
    endpoint = `gdrive://${currentDataSource.folderId || currentDataSource.database || 'root'}`;
  } else if (currentDataSource.host) {
    endpoint = `${currentDataSource.host}${currentDataSource.port ? ':' + currentDataSource.port : ''}/${currentDataSource.database || currentDataSource.bucket || ''}`;
  } else {
    endpoint = currentDataSource.localMountPath || currentDataSource.region || (currentDataSource.sourceOnly ? 'Unknown' : 'Local');
  }
  document.getElementById('ds-detail-endpoint').textContent = endpoint;
  document.getElementById('ds-detail-latency').textContent =
    currentDataSource.sourceOnly && currentDataSource.latencyMs == null
      ? 'Latency: Unknown'
      : `Latency: ${currentDataSource.latencyMs ?? 1.2}ms`;

  const badge = document.getElementById('ds-detail-badge');
  badge.className = `badge ${currentDataSource.status === 'Connected' ? 'badge-green' : 'badge-yellow'}`;
  badge.textContent = currentDataSource.status || 'Connected';

  // Bindings
  const bindingsContainer = document.getElementById('ds-bindings-row');
  const services = currentDataSource.boundServices || [];
  bindingsContainer.innerHTML = `<span class="bind-label">Bound to:</span>` +
    (services.length
      ? services.map(s => `<span class="badge badge-cyan">${esc(s.replace('urn:robos:service:', ''))}</span>`).join(' ')
      : `<span style="color:#8b949e;">All RobOS Apps</span>`);

  const isCloud = isCloudDriver(currentDataSource.driverType);
  const mountBtn = document.getElementById('btn-mount-current-ds');
  if (mountBtn) mountBtn.classList.toggle('hidden', !isCloud);

  const schemaTabLabel = document.getElementById('tab-btn-schema-label');
  if (schemaTabLabel) {
    schemaTabLabel.textContent = isCloud ? 'Cloud File & Folder Explorer' : 'Schema Inspector';
  }

  // Load Schema or Cloud Directory Listing
  await loadSchemaForCurrent(currentRemotePath);
}

async function loadSchemaForCurrent(remotePath = '/') {
  if (!currentDataSource) return;
  currentRemotePath = remotePath || '/';

  currentSchema = await window.dataSources.inspectSchema({
    id: currentDataSource.id,
    driverType: currentDataSource.driverType,
    path: currentRemotePath,
  });

  const treeList = document.getElementById('schema-tree-list');
  const paneTitle = document.getElementById('schema-pane-title');
  const cloudToolbar = document.getElementById('cloud-explorer-toolbar');
  const mountBar = document.getElementById('ds-cloud-mount-bar');
  const thead = document.getElementById('schema-table-thead');
  treeList.innerHTML = '';

  if (currentSchema.remote) {
    if (cloudToolbar) cloudToolbar.classList.remove('hidden');
    if (mountBar && currentSchema.remote.localMountPath) {
      mountBar.classList.remove('hidden');
      document.getElementById('ds-cloud-mount-path').textContent = currentSchema.remote.localMountPath;
    }
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Folder / File Name</th>
          <th>Size</th>
          <th>Last Modified</th>
          <th>Type &amp; RobOS Actions</th>
        </tr>
      `;
    }
    renderRemoteListing(currentSchema.remote, currentSchema.buckets);
    return;
  }

  if (cloudToolbar) cloudToolbar.classList.add('hidden');
  if (mountBar) mountBar.classList.add('hidden');
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th>Column Name</th>
        <th>Data Type</th>
        <th>Nullable</th>
        <th>Key Constraint</th>
      </tr>
    `;
  }

  if (currentSchema.tables && currentSchema.tables.length > 0) {
    paneTitle.textContent = `Database Tables (${currentSchema.tables.length})`;
    currentSchema.tables.forEach((tbl, idx) => {
      const item = document.createElement('div');
      item.className = `tree-item ${idx === 0 ? 'active' : ''}`;
      item.innerHTML = `<span>📄</span> <span>${esc(tbl.name)}</span> <span style="margin-left:auto;color:#8b949e;font-size:10px;">${tbl.rows || 0} rows</span>`;
      item.onclick = () => {
        document.querySelectorAll('#schema-tree-list .tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        renderTableDetail(tbl);
      };
      treeList.appendChild(item);
    });

    renderTableDetail(currentSchema.tables[0]);
  } else {
    paneTitle.textContent = 'Schema Objects (0)';
    document.getElementById('table-detail-title').textContent = 'No tables or objects found';
    document.getElementById('table-columns-tbody').innerHTML = '';
  }
}

function renderBreadcrumbs(remotePath) {
  const crumbsEl = document.getElementById('cloud-breadcrumbs');
  if (!crumbsEl || !currentDataSource) return;
  crumbsEl.innerHTML = '';

  const rootBtn = document.createElement('button');
  rootBtn.className = 'crumb-btn';
  rootBtn.textContent = currentDataSource.driverType === 'gdrive'
    ? `📁 ${currentDataSource.name} (${currentDataSource.folderId || 'root'})`
    : `☁️ ${currentDataSource.name} (/)`;
  rootBtn.onclick = () => loadSchemaForCurrent('/');
  crumbsEl.appendChild(rootBtn);

  const parts = String(remotePath || '/').split('/').filter(Boolean);
  parts.forEach((part, idx) => {
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '/';
    crumbsEl.appendChild(sep);

    const btn = document.createElement('button');
    btn.className = 'crumb-btn';
    btn.textContent = part;
    const subPath = '/' + parts.slice(0, idx + 1).join('/');
    btn.onclick = () => loadSchemaForCurrent(subPath);
    crumbsEl.appendChild(btn);
  });
}

function renderRemoteListing(listing, buckets) {
  const treeList = document.getElementById('schema-tree-list');
  const tbody = document.getElementById('table-columns-tbody');
  treeList.innerHTML = '';
  tbody.innerHTML = '';

  currentRemotePath = listing.path || '/';
  renderBreadcrumbs(currentRemotePath);

  const isGDrive = currentDataSource && currentDataSource.driverType === 'gdrive';
  const dirs = (listing.entries || []).filter(e => e.type === 'dir');
  document.getElementById('schema-pane-title').textContent = isGDrive
    ? `Google Drive Folders (${dirs.length})`
    : buckets && buckets.length
      ? `S3 Buckets & Folders (${dirs.length})`
      : `Folders in ${listing.path} (${dirs.length})`;

  document.getElementById('table-detail-title').textContent = listing.error
    ? `Error: ${listing.error}`
    : `${listing.entries.length} items in ${listing.path === '/' ? (currentDataSource.name + ' Root') : listing.path}`;

  const browse = async (p) => {
    await loadSchemaForCurrent(p);
  };

  if (listing.path && listing.path !== '/') {
    const up = document.createElement('div');
    up.className = 'tree-item';
    up.innerHTML = '<span>⬆️</span> <span>.. (Parent Folder)</span>';
    up.onclick = () => browse(listing.path.replace(/\/[^/]*$/, '') || '/');
    treeList.appendChild(up);
  }

  // If S3 buckets are provided, show them in the left tree too
  if (buckets && buckets.length > 0 && listing.path === '/') {
    buckets.forEach((bkt, idx) => {
      const item = document.createElement('div');
      item.className = `tree-item ${idx === 0 ? 'active' : ''}`;
      item.innerHTML = `<span>🪣</span> <span>${esc(bkt.name)}</span> <span style="margin-left:auto;color:#8b949e;font-size:10px;">${bkt.objectsCount} objs</span>`;
      item.onclick = () => browse('/');
      treeList.appendChild(item);
    });
  }

  dirs.forEach(e => {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.innerHTML = `<span>📁</span> <span>${esc(e.name)}</span>`;
    item.onclick = () => browse(e.path);
    treeList.appendChild(item);
  });

  if (listing.entries.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" style="text-align:center;color:#8b949e;padding:24px;">This folder is empty. Click "➕ New Folder" or "⬆️ Upload Files" above to add content.</td>`;
    tbody.appendChild(tr);
    return;
  }

  listing.entries.forEach(e => {
    const tr = document.createElement('tr');
    if (e.type === 'dir') tr.className = 'clickable-row';
    const sizeText = e.type === 'dir' ? 'Folder' : `${Math.max(1, Math.round((e.size || 0) / 1024))} KB`;
    const modText = e.modified ? esc(e.modified.slice(0, 10)) : '-';

    tr.innerHTML = `
      <td style="font-weight:600;color:${e.type === 'dir' ? '#38bdf8' : '#c9d1d9'};" data-role="name">
        ${e.type === 'dir' ? '📁' : '📄'} ${esc(e.name)}${e.type === 'dir' ? '/' : ''}
      </td>
      <td style="color:#7ee787;">${sizeText}</td>
      <td>${modText}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge ${e.type === 'dir' ? 'badge-cyan' : 'badge-green'}">${e.type === 'dir' ? 'FOLDER' : 'SYNCED'}</span>
          ${e.type === 'dir'
            ? `<button class="btn btn-xs btn-gdrive" data-action="mount-folder" title="Sync and mount this folder for use in RobOS apps">📌 Use in RobOS</button>`
            : `<button class="btn btn-xs" data-action="download-file" title="Sync file to local RobOS mount">⬇️ Sync</button>`
          }
          ${e.localPath ? `<button class="btn btn-xs" data-action="copy-path" title="Copy local RobOS path">📋 Path</button>` : ''}
          ${e.webViewLink ? `<button class="btn btn-xs" data-action="open-web" title="Open in Google Drive Web">🌐</button>` : ''}
        </div>
      </td>
    `;

    tr.querySelector('[data-role="name"]').onclick = () => {
      if (e.type === 'dir') browse(e.path);
    };

    const mountBtn = tr.querySelector('[data-action="mount-folder"]');
    if (mountBtn) {
      mountBtn.onclick = async (ev) => {
        ev.stopPropagation();
        await mountFolderForRobOS(currentDataSource.id, e.path, `${currentDataSource.name}: ${e.name}`);
      };
    }

    const dlBtn = tr.querySelector('[data-action="download-file"]');
    if (dlBtn) {
      dlBtn.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          const res = await window.dataSources.downloadFile({ dsId: currentDataSource.id, remoteFile: e.path });
          showToast(`✓ Synced file to RobOS: ${res.localPath}`);
        } catch (err) {
          showToast(`Download failed: ${err.message}`, true);
        }
      };
    }

    const copyBtn = tr.querySelector('[data-action="copy-path"]');
    if (copyBtn) {
      copyBtn.onclick = (ev) => {
        ev.stopPropagation();
        copyTextToClipboard(e.localPath, 'Local file path');
      };
    }

    const webBtn = tr.querySelector('[data-action="open-web"]');
    if (webBtn) {
      webBtn.onclick = (ev) => {
        ev.stopPropagation();
        window.dataSources.openUrl(e.webViewLink);
      };
    }

    tbody.appendChild(tr);
  });
}

async function mountFolderForRobOS(dsId, remotePath, label) {
  try {
    const res = await window.dataSources.mountCloudFolder({ dsId, remotePath, label });
    allCloudFolders = res.folders || [];
    renderMountedFolders();
    updateCategoryCounts();
    showToast(`✓ Mounted "${res.entry.label}" for RobOS at ${res.entry.localPath}`);
  } catch (err) {
    showToast(`Failed to mount folder: ${err.message}`, true);
  }
}

function renderTableDetail(table) {
  currentTable = table;
  document.getElementById('table-detail-title').textContent = `Table: ${table.name} (${table.type || 'BASE TABLE'})`;

  const actionsEl = document.getElementById('table-detail-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `<button class="btn btn-xs btn-primary" id="btn-query-this-table">▶ Query ${esc(table.name)}</button>`;
    const qBtn = document.getElementById('btn-query-this-table');
    if (qBtn) {
      qBtn.onclick = () => {
        document.getElementById('query-input').value = `SELECT * FROM ${table.name} LIMIT 25;`;
        switchTab('query');
        runCurrentQuery();
      };
    }
  }

  const tbody = document.getElementById('table-columns-tbody');
  tbody.innerHTML = '';

  (table.columns || []).forEach(col => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:${col.isPrimary ? '#58a6ff' : '#c9d1d9'};">${col.isPrimary ? '🔑 ' : ''}${esc(col.name)}</td>
      <td style="color:#7ee787;">${esc(col.type)}</td>
      <td>${col.nullable ? '<span style="color:#8b949e;">YES</span>' : '<span style="color:#f85149;">NO</span>'}</td>
      <td>${col.isPrimary ? '<span class="badge badge-cyan">PRIMARY KEY</span>' : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function runCurrentQuery() {
  if (!currentDataSource) return;
  const query = document.getElementById('query-input').value.trim();

  const res = await window.dataSources.executeQuery({
    id: currentDataSource.id,
    driverType: currentDataSource.driverType,
    query,
  });

  const thead = document.getElementById('results-thead');
  const tbody = document.getElementById('results-tbody');
  const statusEl = document.getElementById('query-status-text');

  statusEl.textContent = `${res.rowCount} rows returned in ${res.executionTimeMs}ms`;

  thead.innerHTML = '<tr>' + (res.columns || []).map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
  tbody.innerHTML = (res.rows || []).map(r => '<tr>' + r.map(cell => `<td>${esc(cell)}</td>`).join('') + '</tr>').join('');
}

function exportQueryResultsCsv() {
  const thead = document.getElementById('results-thead');
  const tbody = document.getElementById('results-tbody');
  if (!thead || !tbody) return;
  const headers = [...thead.querySelectorAll('th')].map(th => `"${th.textContent.replace(/"/g, '""')}"`).join(',');
  const rows = [...tbody.querySelectorAll('tr')].map(tr =>
    [...tr.querySelectorAll('td')].map(td => `"${td.textContent.replace(/"/g, '""')}"`).join(',')
  );
  const csv = [headers, ...rows].join('\n');
  copyTextToClipboard(csv, 'CSV query results');
}

function renderDataSourcesGrid() {
  const grid = document.getElementById('datasources-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const filtered = getFilteredDataSources();

  filtered.forEach(ds => {
    const card = document.createElement('div');
    card.className = 'ds-card';
    const endpoint = ds.driverType === 'gdrive'
      ? `gdrive://${ds.folderId || ds.database || 'root'}`
      : (ds.host || ds.region || (ds.sourceOnly ? 'Unknown' : 'local'));

    card.innerHTML = `
      <div class="ds-card-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:20px;">${DRIVER_ICONS[ds.driverType] || '🗄️'}</span>
          <span class="ds-card-title">${esc(ds.name)}</span>
        </div>
        <span class="badge ${ds.status === 'Connected' ? 'badge-green' : 'badge-yellow'}">${esc(ds.status || 'Connected')}</span>
      </div>
      <div class="ds-card-desc">${esc(ds.description || '')}</div>
      <div class="ds-card-footer">
        <span>${esc(ds.schemaSummary || CATEGORY_LABELS[ds.category] || '')}</span>
        <span class="mono">${esc(endpoint)}</span>
      </div>
      <div class="ds-card-actions">
        <button class="btn btn-xs btn-primary" data-card-action="browse">Explore</button>
        <button class="btn btn-xs" data-card-action="edit">Configure</button>
        <button class="btn btn-xs btn-danger" data-card-action="delete" style="margin-left:auto;">Delete</button>
      </div>
    `;

    card.onclick = (e) => {
      const actionBtn = e.target.closest('[data-card-action]');
      if (actionBtn) {
        e.stopPropagation();
        const act = actionBtn.dataset.cardAction;
        if (act === 'browse') {
          selectDataSource(ds.id);
          switchTab('schema');
        } else if (act === 'edit') {
          openEditModal(ds);
        } else if (act === 'delete') {
          deleteDataSourceById(ds.id);
        }
        return;
      }
      selectDataSource(ds.id);
      switchTab('schema');
    };
    grid.appendChild(card);
  });
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));

  if (tabName === 'query' && document.getElementById('results-tbody').children.length === 0) {
    runCurrentQuery();
  }
  if (tabName === 'cloud-folders') {
    renderMountedFolders();
  }
}

const DRIVER_FORM_DEFAULTS = {
  gdrive:   { host: 'drive.google.com', port: 443, user: '', database: 'root', dbLabel: 'Google Drive Folder URL or Folder ID (use "root" for My Drive)', userLabel: 'Google Account Email (optional)', passLabel: 'OAuth Access Token / Google API Key (optional for RobOS Mount)' },
  s3:       { host: 's3.us-east-1.amazonaws.com', port: 443, user: '', database: 'my-bucket', dbLabel: 'S3 Bucket Name', userLabel: 'AWS Access Key ID', passLabel: 'AWS Secret Access Key' },
  dropbox:  { host: 'api.dropboxapi.com', port: 443, user: '', database: '/', dbLabel: 'Dropbox Folder Path', userLabel: 'Dropbox Account / App Key', passLabel: 'Dropbox OAuth2 Access Token' },
  onedrive: { host: 'graph.microsoft.com', port: 443, user: '', database: '/', dbLabel: 'OneDrive Folder Path', userLabel: 'Microsoft 365 Account', passLabel: 'Microsoft Graph Access Token' },
  webdav:   { host: 'nextcloud.example.com', port: 443, user: '', database: '/remote.php/dav/files/user/', dbLabel: 'WebDAV Remote Path', userLabel: 'Username', passLabel: 'App Password' },
  sftp:     { host: '', port: 22, user: '', database: '/', dbLabel: 'Start Directory', userLabel: 'SSH Username', passLabel: 'SSH Password / Key Passphrase' },
  ftp:      { host: '', port: 21, user: 'anonymous', database: '/', dbLabel: 'Start Directory', userLabel: 'FTP Username', passLabel: 'FTP Password' },
  local:    { host: 'localhost', port: 0, user: '', database: '/', dbLabel: 'Local / Mounted Directory Path', userLabel: 'Owner (optional)', passLabel: 'Token (optional)' },
};

function onGDriveAuthModeChange() {
  const mode = document.getElementById('modal-gdrive-auth-mode').value;
  document.getElementById('gdrive-local-mount-row').classList.toggle('hidden', mode !== 'local_mount');
  document.getElementById('gdrive-oauth-row').classList.toggle('hidden', mode !== 'oauth');
  document.getElementById('gdrive-sa-row').classList.toggle('hidden', mode !== 'service_account');

  const passLabel = document.getElementById('lbl-ds-password');
  if (mode === 'api_key') passLabel.textContent = 'Google Cloud API Key (AIza...)';
  else if (mode === 'oauth') passLabel.textContent = 'Google OAuth 2.0 Access Token (ya29...)';
  else passLabel.textContent = 'OAuth Token / API Key (optional)';
}

function onModalDriverChange(preserveValues = false) {
  const driver = document.getElementById('modal-ds-driver').value;
  const preset = DRIVER_FORM_DEFAULTS[driver];
  const isGDrive = driver === 'gdrive';

  document.getElementById('gdrive-setup-panel').classList.toggle('hidden', !isGDrive);
  document.getElementById('grp-ds-keyfile').classList.toggle('hidden', driver !== 'sftp');
  document.getElementById('row-host-port').classList.toggle('hidden', isGDrive || driver === 'local');

  document.getElementById('lbl-ds-database').textContent = preset ? preset.dbLabel : 'Database / Bucket / Folder ID';
  document.getElementById('lbl-ds-user').textContent = preset ? preset.userLabel : 'Username / Key ID';
  document.getElementById('lbl-ds-password').textContent = preset ? preset.passLabel : 'Password / Secret';

  if (!preserveValues) {
    if (preset) {
      document.getElementById('modal-ds-host').value = preset.host;
      document.getElementById('modal-ds-port').value = preset.port || '';
      document.getElementById('modal-ds-user').value = preset.user;
      document.getElementById('modal-ds-database').value = preset.database;
    } else {
      document.getElementById('modal-ds-host').value = '127.0.0.1';
      document.getElementById('modal-ds-port').value = '5432';
      document.getElementById('modal-ds-user').value = 'postgres';
      document.getElementById('modal-ds-database').value = 'petshop';
    }
  }

  if (isGDrive) {
    onGDriveAuthModeChange();
    updateGDriveFolderIdPreview();
  } else {
    document.getElementById('gdrive-folder-id-preview').classList.add('hidden');
  }
}

function updateGDriveFolderIdPreview() {
  const driver = document.getElementById('modal-ds-driver').value;
  const preview = document.getElementById('gdrive-folder-id-preview');
  if (!preview || driver !== 'gdrive') {
    if (preview) preview.classList.add('hidden');
    return;
  }
  const raw = document.getElementById('modal-ds-database').value.trim();
  const extracted = extractDriveFolderIdClient(raw);
  preview.classList.remove('hidden');
  preview.textContent = extracted === 'root'
    ? '✓ Target Folder: My Drive Root ("root") — will be mounted in ~/.robos/cloud-mounts/'
    : `✓ Extracted Google Drive Folder ID: ${extracted}`;
}

function openAddModal(presetDriver = 'postgres') {
  editingDataSourceId = null;
  const driverToUse = typeof presetDriver === 'string' && presetDriver ? presetDriver : 'postgres';
  document.getElementById('ds-modal-title').textContent =
    driverToUse === 'gdrive' ? 'Connect Google Drive to RobOS' : 'Add New Data Source';
  document.getElementById('modal-ds-driver').value = driverToUse;
  document.getElementById('modal-ds-name').value = driverToUse === 'gdrive' ? 'My Google Drive' : '';
  document.getElementById('modal-ds-password').value = '';
  document.getElementById('modal-ds-keyfile').value = '';
  document.getElementById('modal-ds-local-mount').value = '';
  document.getElementById('modal-gdrive-sa-path').value = '';
  document.getElementById('modal-gdrive-client-id').value = '';
  document.getElementById('modal-gdrive-client-secret').value = '';
  document.getElementById('modal-gdrive-auth-mode').value = 'workspace';
  document.getElementById('modal-test-banner').classList.add('hidden');
  onModalDriverChange(false);
  document.getElementById('modal-ds-services').value = 'petstore-api, vaccine-gateway';
  document.getElementById('ds-modal').classList.remove('hidden');
}

function openEditModal(ds) {
  if (!ds) return;
  editingDataSourceId = ds.id;
  document.getElementById('ds-modal-title').textContent = `Configure: ${ds.name}`;
  document.getElementById('modal-ds-driver').value = ds.driverType || 'postgres';
  document.getElementById('modal-ds-name').value = ds.name || '';
  document.getElementById('modal-ds-host').value = ds.host || '';
  document.getElementById('modal-ds-port').value = ds.port || '';
  document.getElementById('modal-ds-database').value = ds.driverType === 'gdrive' ? (ds.folderId || ds.database || 'root') : (ds.database || ds.bucket || '');
  document.getElementById('modal-ds-user').value = ds.user || '';
  document.getElementById('modal-ds-password').value = (ds.password && ds.password !== '••••••••') ? ds.password : '';
  document.getElementById('modal-ds-keyfile').value = ds.privateKeyPath || '';
  document.getElementById('modal-ds-local-mount').value = ds.localMountPath || '';
  document.getElementById('modal-gdrive-sa-path').value = ds.serviceAccountKeyPath || '';
  document.getElementById('modal-gdrive-client-id').value = ds.clientId || '';
  document.getElementById('modal-gdrive-client-secret').value = ds.clientSecret || '';
  document.getElementById('modal-gdrive-auth-mode').value = ds.authMode || 'workspace';
  document.getElementById('modal-ds-ssl').checked = Boolean(ds.ssl);
  document.getElementById('modal-ds-services').value = (ds.boundServices || []).map(s => s.replace('urn:robos:service:', '')).join(', ');
  document.getElementById('modal-test-banner').classList.add('hidden');
  onModalDriverChange(true);
  document.getElementById('ds-modal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('ds-modal').classList.add('hidden');
}

function buildModalDataSourceObject() {
  const driver = document.getElementById('modal-ds-driver').value;
  const name = document.getElementById('modal-ds-name').value.trim() || (driver === 'gdrive' ? 'My Google Drive' : 'New Data Source');
  const host = document.getElementById('modal-ds-host').value.trim() || (driver === 'gdrive' ? 'drive.google.com' : '127.0.0.1');
  const port = parseInt(document.getElementById('modal-ds-port').value, 10) || (driver === 'gdrive' ? 443 : 5432);
  const rawDb = document.getElementById('modal-ds-database').value.trim();
  const user = document.getElementById('modal-ds-user').value.trim();
  const ssl = document.getElementById('modal-ds-ssl').checked;
  const password = document.getElementById('modal-ds-password').value;
  const privateKeyPath = driver === 'sftp' ? document.getElementById('modal-ds-keyfile').value.trim() : undefined;
  const localMountPath = document.getElementById('modal-ds-local-mount').value.trim() || undefined;
  const serviceAccountKeyPath = document.getElementById('modal-gdrive-sa-path').value.trim() || undefined;
  const clientId = document.getElementById('modal-gdrive-client-id').value.trim() || undefined;
  const clientSecret = document.getElementById('modal-gdrive-client-secret').value.trim() || undefined;
  const authMode = driver === 'gdrive' ? document.getElementById('modal-gdrive-auth-mode').value : undefined;

  const servicesStr = document.getElementById('modal-ds-services').value.trim();
  const boundServices = servicesStr
    ? servicesStr.split(',').map(s => s.trim()).filter(Boolean).map(s => s.startsWith('urn:') ? s : `urn:robos:service:${s}`)
    : [];

  const id = editingDataSourceId || (name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6));
  const category = inferCategoryForDriver(driver);
  const folderId = driver === 'gdrive' ? extractDriveFolderIdClient(rawDb) : undefined;
  const database = driver === 'gdrive' ? '/' : (rawDb || '/');

  return {
    id,
    name,
    driverType: driver,
    category,
    host,
    port,
    database,
    ...(driver === 'gdrive' ? { folderId, authMode, localMountPath, serviceAccountKeyPath, clientId, clientSecret } : {}),
    ...(driver === 's3' ? { bucket: rawDb || 'default-bucket' } : {}),
    ...(driver === 'local' ? { localMountPath: rawDb || localMountPath } : {}),
    user,
    ...(password ? { password } : {}),
    ...(privateKeyPath ? { privateKeyPath } : {}),
    ssl,
    status: 'Connected',
    latencyMs: 1.5,
    boundServices,
    description: driver === 'gdrive'
      ? `Google Drive folder (${folderId}) mounted for RobOS applications`
      : `${name} managed through RobOS Knowledge Graph`,
    schemaSummary: driver === 'gdrive' ? `Drive Folder (${folderId})` : 'Initialized data source',
  };
}

async function saveModalDataSource() {
  const dsObj = buildModalDataSourceObject();
  allDataSources = await window.dataSources.saveDataSource(dsObj);
  try {
    allCloudFolders = await window.dataSources.getCloudFolders();
  } catch {}
  closeAddModal();
  updateCategoryCounts();
  renderSidebarDataSources();
  renderMountedFolders();
  await selectDataSource(dsObj.id);
  renderDataSourcesGrid();
  showToast(`✓ Saved "${dsObj.name}" and synced with RobOS Knowledge Graph`);
}

async function deleteDataSourceById(id) {
  if (!id) return;
  const target = allDataSources.find(d => d.id === id);
  allDataSources = await window.dataSources.deleteDataSource(id);
  try {
    allCloudFolders = await window.dataSources.getCloudFolders();
  } catch {}
  updateCategoryCounts();
  renderSidebarDataSources();
  renderMountedFolders();
  renderDataSourcesGrid();
  if (allDataSources.length > 0) {
    await selectDataSource(allDataSources[0].id);
  }
  showToast(`Removed data source "${target ? target.name : id}"`);
}

async function testCurrentConnection() {
  if (!currentDataSource) return;
  const res = await window.dataSources.testConnection(currentDataSource);

  const title = document.querySelector('#test-conn-result-card [style*="font-weight:600"]');
  if (title) {
    title.textContent = res.ok ? 'Connection Successful' : 'Connection Failed';
    title.style.color = res.ok ? '#7ee787' : '#f85149';
  }
  document.getElementById('test-conn-latency').textContent = `Round-trip latency: ${res.latencyMs} ms`;
  document.getElementById('test-conn-version').textContent = res.serverVersion;
  document.getElementById('test-conn-msg').textContent = res.message;
  document.getElementById('test-conn-modal').classList.remove('hidden');
}

function setupEventListeners() {
  // Category Navigation
  document.querySelectorAll('#category-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('#category-nav .nav-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      activeCategory = item.dataset.cat;
      renderSidebarDataSources();
      renderDataSourcesGrid();
      const filtered = getFilteredDataSources();
      if (filtered.length > 0 && (!currentDataSource || !filtered.some(d => d.id === currentDataSource.id))) {
        selectDataSource(filtered[0].id);
      }
    });
  });

  // Microservice tags filter
  document.querySelectorAll('#bound-services-list .service-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      document.querySelectorAll('#bound-services-list .service-tag').forEach(el => el.classList.remove('active'));
      tag.classList.add('active');
      activeServiceFilter = tag.dataset.service;
      renderSidebarDataSources();
      renderDataSourcesGrid();
    });
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderSidebarDataSources();
    renderDataSourcesGrid();
  });

  // Header & Sidebar Add Buttons
  document.getElementById('btn-add-datasource').addEventListener('click', () => openAddModal('postgres'));
  document.getElementById('btn-connect-gdrive').addEventListener('click', () => openAddModal('gdrive'));
  document.getElementById('btn-sidebar-add').addEventListener('click', () => openAddModal('gdrive'));
  document.getElementById('btn-sidebar-view-mounts').addEventListener('click', () => switchTab('cloud-folders'));
  document.getElementById('btn-mounts-add-gdrive').addEventListener('click', () => openAddModal('gdrive'));
  document.getElementById('btn-mounts-refresh').addEventListener('click', async () => {
    allCloudFolders = await window.dataSources.getCloudFolders();
    renderMountedFolders();
    showToast('✓ Refreshed mounted RobOS cloud folders');
  });

  // Quick-Connect Provider Cards in Catalog Tab
  document.querySelectorAll('.quick-provider-btn').forEach(btn => {
    btn.addEventListener('click', () => openAddModal(btn.dataset.driver));
  });

  // Detail Header Actions
  document.getElementById('btn-test-conn').addEventListener('click', testCurrentConnection);
  document.getElementById('btn-edit-current-ds').addEventListener('click', () => openEditModal(currentDataSource));
  document.getElementById('btn-delete-current-ds').addEventListener('click', () => {
    if (currentDataSource) deleteDataSourceById(currentDataSource.id);
  });
  document.getElementById('btn-mount-current-ds').addEventListener('click', () => {
    if (currentDataSource) mountFolderForRobOS(currentDataSource.id, '/', `${currentDataSource.name} (Root)`);
  });
  document.getElementById('btn-copy-mount-path').addEventListener('click', () => {
    const p = document.getElementById('ds-cloud-mount-path').textContent;
    if (p) copyTextToClipboard(p, 'RobOS local folder path');
  });
  document.getElementById('btn-open-mount-path').addEventListener('click', async () => {
    const p = document.getElementById('ds-cloud-mount-path').textContent;
    if (p) {
      const res = await window.dataSources.openLocalPath(p);
      if (!res.ok) showToast(res.error || 'Could not open folder', true);
    }
  });

  // Cloud Explorer Toolbar Actions
  document.getElementById('btn-mount-current-folder').addEventListener('click', () => {
    if (!currentDataSource) return;
    const label = currentRemotePath === '/'
      ? `${currentDataSource.name} (Root)`
      : `${currentDataSource.name}: ${currentRemotePath.split('/').filter(Boolean).pop()}`;
    mountFolderForRobOS(currentDataSource.id, currentRemotePath, label);
  });

  document.getElementById('btn-new-cloud-folder').addEventListener('click', () => {
    const bar = document.getElementById('new-folder-bar');
    bar.classList.remove('hidden');
    const inp = document.getElementById('new-folder-name-input');
    inp.value = '';
    inp.focus();
  });

  document.getElementById('btn-cancel-new-folder').addEventListener('click', () => {
    document.getElementById('new-folder-bar').classList.add('hidden');
  });

  document.getElementById('btn-confirm-new-folder').addEventListener('click', async () => {
    const name = document.getElementById('new-folder-name-input').value.trim();
    if (!name || !currentDataSource) return;
    const targetPath = (currentRemotePath === '/' ? '' : currentRemotePath) + '/' + name;
    try {
      await window.dataSources.createFolder({ dsId: currentDataSource.id, remotePath: targetPath });
      document.getElementById('new-folder-bar').classList.add('hidden');
      await loadSchemaForCurrent(currentRemotePath);
      showToast(`✓ Created folder "${name}" in ${currentDataSource.name}`);
    } catch (err) {
      showToast(`Could not create folder: ${err.message}`, true);
    }
  });

  document.getElementById('btn-upload-cloud-files').addEventListener('click', async () => {
    if (!currentDataSource) return;
    try {
      const res = await window.dataSources.uploadFiles({ dsId: currentDataSource.id, remoteDir: currentRemotePath });
      if (!res.canceled && res.uploaded && res.uploaded.length) {
        await loadSchemaForCurrent(currentRemotePath);
        showToast(`✓ Uploaded ${res.uploaded.length} file(s) to ${currentDataSource.name}`);
      }
    } catch (err) {
      showToast(`Upload failed: ${err.message}`, true);
    }
  });

  document.getElementById('btn-refresh-schema').addEventListener('click', () => {
    loadSchemaForCurrent(currentRemotePath);
  });

  // Modal Controls
  document.getElementById('btn-ds-modal-close').addEventListener('click', closeAddModal);
  document.getElementById('btn-ds-modal-cancel').addEventListener('click', closeAddModal);
  document.getElementById('modal-ds-driver').addEventListener('change', () => onModalDriverChange(false));
  document.getElementById('modal-gdrive-auth-mode').addEventListener('change', onGDriveAuthModeChange);
  document.getElementById('modal-ds-database').addEventListener('input', updateGDriveFolderIdPreview);
  document.getElementById('btn-ds-modal-save').addEventListener('click', saveModalDataSource);

  document.getElementById('btn-modal-test-conn').addEventListener('click', async () => {
    const banner = document.getElementById('modal-test-banner');
    banner.classList.remove('hidden');
    banner.style.color = '#8b949e';
    banner.textContent = 'Testing connection...';
    const dsObj = buildModalDataSourceObject();
    const res = await window.dataSources.testConnection(dsObj);
    banner.style.color = res.ok ? '#7ee787' : '#f85149';
    banner.textContent = `${res.ok ? '✓' : '✕'} ${res.message} (${res.latencyMs}ms)`;
  });

  // Google Drive Modal Helpers
  document.getElementById('btn-browse-local-folder').addEventListener('click', async () => {
    const res = await window.dataSources.pickLocalFolder();
    if (!res.canceled && res.folderPath) {
      document.getElementById('modal-ds-local-mount').value = res.folderPath;
    }
  });

  document.getElementById('btn-detect-gdrive').addEventListener('click', async () => {
    const mounts = await window.dataSources.detectGDriveMounts();
    const listEl = document.getElementById('detected-mounts-list');
    listEl.innerHTML = '';
    if (!mounts || mounts.length === 0) {
      listEl.innerHTML = `<span style="font-size:11px;color:#e3b341;">No existing GVFS or ~/Google Drive mounts found. Use "RobOS Managed Cloud Folder" or OAuth/Service Account mode, or click Browse Folder.</span>`;
      return;
    }
    mounts.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-xs btn-gdrive';
      btn.textContent = `Use ${m.label}: ${m.path}`;
      btn.onclick = () => {
        document.getElementById('modal-ds-local-mount').value = m.path;
      };
      listEl.appendChild(btn);
    });
  });

  document.getElementById('btn-pick-sa-json').addEventListener('click', async () => {
    const res = await window.dataSources.pickKeyFile({ title: 'Select Google Cloud Service Account JSON Key' });
    if (!res.canceled && res.filePath) {
      document.getElementById('modal-gdrive-sa-path').value = res.filePath;
    }
  });

  document.getElementById('btn-pick-ssh-key').addEventListener('click', async () => {
    const res = await window.dataSources.pickKeyFile({ title: 'Select SSH Private Key File' });
    if (!res.canceled && res.filePath) {
      document.getElementById('modal-ds-keyfile').value = res.filePath;
    }
  });

  document.getElementById('btn-launch-google-oauth').addEventListener('click', async () => {
    const clientId = document.getElementById('modal-gdrive-client-id').value.trim();
    const clientSecret = document.getElementById('modal-gdrive-client-secret').value.trim();
    const statusLbl = document.getElementById('oauth-status-label');
    try {
      statusLbl.style.color = '#38bdf8';
      statusLbl.textContent = 'Waiting for Google Sign-In in your browser...';
      const res = await window.dataSources.googleOAuthSignIn({ clientId, clientSecret });
      if (res.ok && res.accessToken) {
        document.getElementById('modal-ds-password').value = res.accessToken;
        statusLbl.style.color = '#7ee787';
        statusLbl.textContent = '✓ Google Drive OAuth 2.0 token acquired!';
      }
    } catch (err) {
      statusLbl.style.color = '#f85149';
      statusLbl.textContent = err.message;
    }
  });

  // Test Connection Modal
  document.getElementById('btn-test-conn-close').addEventListener('click', () => document.getElementById('test-conn-modal').classList.add('hidden'));
  document.getElementById('btn-test-conn-ok').addEventListener('click', () => document.getElementById('test-conn-modal').classList.add('hidden'));

  // Query Console
  document.getElementById('btn-run-query').addEventListener('click', runCurrentQuery);
  document.getElementById('btn-export-query').addEventListener('click', exportQueryResultsCsv);
  document.getElementById('query-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCurrentQuery();
    }
  });
}

function setupResizer() {
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('resizer');
  let startX, startW;

  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e) => {
      const w = startW + (e.clientX - startX);
      sidebar.style.width = Math.max(220, Math.min(400, w)) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init().catch(console.error);
