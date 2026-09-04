'use strict';

let allDataSources = [];
let allDrivers = [];
let currentDataSource = null;
let currentSchema = null;
let activeCategory = 'all';
let activeServiceFilter = 'all';
let activeTab = 'schema';
let currentTable = null;

// Driver category emoji mapping
const DRIVER_ICONS = {
  postgres: '🐘',
  mysql: '🐬',
  oracle: '🔴',
  mssql: '🪟',
  sqlite: '🪶',
  snowflake: '❄️',
  mongodb: '🍃',
  redis: '⚡',
  dynamodb: '🔶',
  s3: '🪣',
  gdrive: '📁',
  kafka: '📡',
};

async function init() {
  allDrivers = await window.dataSources.getDrivers();
  allDataSources = await window.dataSources.getDataSources();

  setupEventListeners();
  setupResizer();
  updateCategoryCounts();

  if (allDataSources.length > 0) {
    selectDataSource(allDataSources[0].id);
  } else {
    renderEmptyState();
  }

  renderDataSourcesGrid();
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
}

async function selectDataSource(id) {
  currentDataSource = allDataSources.find(d => d.id === id);
  if (!currentDataSource) return;

  // Update Detail Header
  document.getElementById('ds-detail-name').textContent = currentDataSource.name;
  document.getElementById('ds-icon-avatar').textContent = DRIVER_ICONS[currentDataSource.driverType] || '🗄️';
  document.getElementById('ds-detail-type').textContent = `Type: ${currentDataSource.driverType.toUpperCase()}`;
  
  const endpoint = currentDataSource.host ? `${currentDataSource.host}:${currentDataSource.port || ''}/${currentDataSource.database || currentDataSource.bucket || ''}` : currentDataSource.region || 'Local';
  document.getElementById('ds-detail-endpoint').textContent = endpoint;
  document.getElementById('ds-detail-latency').textContent = `Latency: ${currentDataSource.latencyMs || 1.2}ms`;

  const badge = document.getElementById('ds-detail-badge');
  badge.className = `badge ${currentDataSource.status === 'Connected' ? 'badge-green' : 'badge-yellow'}`;
  badge.textContent = currentDataSource.status || 'Connected';

  // Bindings
  const bindingsContainer = document.getElementById('ds-bindings-row');
  const services = currentDataSource.boundServices || [];
  bindingsContainer.innerHTML = `<span class="bind-label">Bound to:</span>` +
    services.map(s => `<span class="badge badge-cyan">${esc(s.replace('urn:robos:service:', ''))}</span>`).join(' ');

  // Load Schema
  await loadSchemaForCurrent();
}

async function loadSchemaForCurrent() {
  if (!currentDataSource) return;

  currentSchema = await window.dataSources.inspectSchema({
    id: currentDataSource.id,
    driverType: currentDataSource.driverType,
  });

  const treeList = document.getElementById('schema-tree-list');
  const paneTitle = document.getElementById('schema-pane-title');
  treeList.innerHTML = '';

  if (currentSchema.tables && currentSchema.tables.length > 0) {
    paneTitle.textContent = `Database Tables (${currentSchema.tables.length})`;
    currentSchema.tables.forEach((tbl, idx) => {
      const item = document.createElement('div');
      item.className = `tree-item ${idx === 0 ? 'active' : ''}`;
      item.innerHTML = `<span>📄</span> <span>${esc(tbl.name)}</span> <span style="margin-left:auto;color:#8b949e;font-size:10px;">${tbl.rows || 0} rows</span>`;
      item.onclick = () => {
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        renderTableDetail(tbl);
      };
      treeList.appendChild(item);
    });

    renderTableDetail(currentSchema.tables[0]);
  } else if (currentSchema.buckets && currentSchema.buckets.length > 0) {
    paneTitle.textContent = `S3 Buckets (${currentSchema.buckets.length})`;
    currentSchema.buckets.forEach((bkt, idx) => {
      const item = document.createElement('div');
      item.className = `tree-item ${idx === 0 ? 'active' : ''}`;
      item.innerHTML = `<span>🪣</span> <span>${esc(bkt.name)}</span> <span style="margin-left:auto;color:#8b949e;font-size:10px;">${bkt.objectsCount} objs</span>`;
      treeList.appendChild(item);
    });

    renderStorageFiles(currentSchema.files || []);
  } else if (currentSchema.folders && currentSchema.folders.length > 0) {
    paneTitle.textContent = `Google Drive Folders (${currentSchema.folders.length})`;
    currentSchema.folders.forEach(fld => {
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.innerHTML = `<span>📁</span> <span>${esc(fld.name)}</span> <span style="margin-left:auto;color:#8b949e;font-size:10px;">${fld.filesCount} files</span>`;
      treeList.appendChild(item);
    });
  }
}

function renderTableDetail(table) {
  currentTable = table;
  document.getElementById('table-detail-title').textContent = `Table: ${table.name} (${table.type || 'BASE TABLE'})`;

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

function renderStorageFiles(files) {
  document.getElementById('table-detail-title').textContent = 'Objects in S3 Vault';
  const tbody = document.getElementById('table-columns-tbody');
  tbody.innerHTML = '';

  files.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:#58a6ff;">📄 ${esc(f.key)}</td>
      <td style="color:#7ee787;">${Math.round(f.size / 1024)} KB</td>
      <td>-</td>
      <td><span class="badge badge-green">SYNCED</span></td>
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

function renderDataSourcesGrid() {
  const grid = document.getElementById('datasources-grid');
  grid.innerHTML = '';

  let filtered = allDataSources;
  if (activeCategory !== 'all') {
    filtered = filtered.filter(d => d.category === activeCategory);
  }
  if (activeServiceFilter !== 'all') {
    filtered = filtered.filter(d => (d.boundServices || []).some(s => s.includes(activeServiceFilter)));
  }

  filtered.forEach(ds => {
    const card = document.createElement('div');
    card.className = 'ds-card';
    card.innerHTML = `
      <div class="ds-card-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:20px;">${DRIVER_ICONS[ds.driverType] || '🗄️'}</span>
          <span class="ds-card-title">${esc(ds.name)}</span>
        </div>
        <span class="badge ${ds.status === 'Connected' ? 'badge-green' : 'badge-yellow'}">${esc(ds.status)}</span>
      </div>
      <div class="ds-card-desc">${esc(ds.description || '')}</div>
      <div class="ds-card-footer">
        <span>${esc(ds.schemaSummary || '')}</span>
        <span class="mono">${esc(ds.host || ds.region || 'local')}</span>
      </div>
    `;
    card.onclick = () => {
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
}

function openAddModal() {
  document.getElementById('ds-modal-title').textContent = 'Add New Data Source';
  document.getElementById('modal-ds-name').value = '';
  document.getElementById('modal-ds-host').value = '127.0.0.1';
  document.getElementById('modal-ds-port').value = '5432';
  document.getElementById('modal-ds-database').value = 'petshop';
  document.getElementById('modal-ds-user').value = 'postgres';
  document.getElementById('modal-ds-password').value = '';
  document.getElementById('modal-ds-services').value = 'petstore-api, vaccine-gateway';
  document.getElementById('ds-modal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('ds-modal').classList.add('hidden');
}

async function saveModalDataSource() {
  const driver = document.getElementById('modal-ds-driver').value;
  const name = document.getElementById('modal-ds-name').value.trim() || 'New Data Source';
  const host = document.getElementById('modal-ds-host').value.trim();
  const port = parseInt(document.getElementById('modal-ds-port').value, 10) || 5432;
  const database = document.getElementById('modal-ds-database').value.trim();
  const user = document.getElementById('modal-ds-user').value.trim();
  const ssl = document.getElementById('modal-ds-ssl').checked;
  const servicesStr = document.getElementById('modal-ds-services').value.trim();
  const boundServices = servicesStr ? servicesStr.split(',').map(s => s.trim().startsWith('urn:') ? s.trim() : `urn:robos:service:${s.trim()}`) : [];

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6);

  const dsObj = {
    id,
    name,
    driverType: driver,
    category: (driver === 'postgres' || driver === 'oracle' || driver === 'mysql' || driver === 'mssql' || driver === 'sqlite') ? 'sql' :
              (driver === 's3' || driver === 'gdrive') ? 'storage' : 'nosql',
    host,
    port,
    database,
    user,
    ssl,
    status: 'Connected',
    latencyMs: 1.5,
    boundServices,
    description: `${name} managed through RobOS Knowledge Graph`,
    schemaSummary: 'Initialized data source',
  };

  allDataSources = await window.dataSources.saveDataSource(dsObj);
  closeAddModal();
  updateCategoryCounts();
  selectDataSource(id);
  renderDataSourcesGrid();
}

async function testCurrentConnection() {
  if (!currentDataSource) return;
  const res = await window.dataSources.testConnection(currentDataSource);

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
      renderDataSourcesGrid();
      if (activeTab === 'sources-grid') renderDataSourcesGrid();
    });
  });

  // Microservice tags filter
  document.querySelectorAll('#bound-services-list .service-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      document.querySelectorAll('#bound-services-list .service-tag').forEach(el => el.classList.remove('active'));
      tag.classList.add('active');
      activeServiceFilter = tag.dataset.service;
      renderDataSourcesGrid();
    });
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.ds-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? 'flex' : 'none';
    });
  });

  // Action Buttons
  document.getElementById('btn-add-datasource').addEventListener('click', openAddModal);
  document.getElementById('btn-ds-modal-close').addEventListener('click', closeAddModal);
  document.getElementById('btn-ds-modal-cancel').addEventListener('click', closeAddModal);
  document.getElementById('btn-ds-modal-save').addEventListener('click', saveModalDataSource);

  document.getElementById('btn-test-conn').addEventListener('click', testCurrentConnection);
  document.getElementById('btn-test-conn-close').addEventListener('click', () => document.getElementById('test-conn-modal').classList.add('hidden'));
  document.getElementById('btn-test-conn-ok').addEventListener('click', () => document.getElementById('test-conn-modal').classList.add('hidden'));

  document.getElementById('btn-run-query').addEventListener('click', runCurrentQuery);
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
      sidebar.style.width = Math.max(200, Math.min(380, w)) + 'px';
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
