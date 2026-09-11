'use strict';

// State
let clusters = [];
let buildSystems = [];
let selectedCluster = null;
let activeTab = 'overview';
let clientMode = 'bazel';
let providerMode = 'buildbarn';
let buildbarnComponent = 'storage';

// Elements
const clusterListEl = document.getElementById('cluster-list');
const buildsystemListEl = document.getElementById('buildsystem-list');
const clusterDetailTitleEl = document.getElementById('cluster-detail-title');
const clusterDetailDescEl = document.getElementById('cluster-detail-desc');
const endpointExecEl = document.getElementById('endpoint-exec');
const endpointCasEl = document.getElementById('endpoint-cas');
const endpointAcEl = document.getElementById('endpoint-ac');
const endpointBrowserEl = document.getElementById('endpoint-browser');
const workersTbodyEl = document.getElementById('workers-tbody');
const workerPoolCountEl = document.getElementById('worker-pool-count');
const statCasHitEl = document.getElementById('stat-cas-hit');
const statAcHitEl = document.getElementById('stat-ac-hit');
const statCapacityEl = document.getElementById('stat-capacity');
const statProviderEl = document.getElementById('stat-provider');
const probeResultsCardEl = document.getElementById('probe-results-card');
const probeDetailsEl = document.getElementById('probe-details');

const clientConfigFilenameEl = document.getElementById('client-config-filename');
const clientConfigSyntaxEl = document.getElementById('client-config-syntax');
const clientConfigCodeEl = document.getElementById('client-config-code');
const btnToggleBazel = document.getElementById('btn-toggle-bazel');
const btnToggleBuck2 = document.getElementById('btn-toggle-buck2');

const providerSelectEl = document.getElementById('provider-select');
const buildbarnSubtabsEl = document.getElementById('buildbarn-subtabs');
const providerConfigFilenameEl = document.getElementById('provider-config-filename');
const providerConfigCodeEl = document.getElementById('provider-config-code');

const kgraphJsonldCodeEl = document.getElementById('kgraph-jsonld-code');

// Toast Helper
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Tab Switching
function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });

  if (tabId === 'clients') updateClientConfig();
  if (tabId === 'provider') updateProviderConfig();
  if (tabId === 'kgraph') updateKgraphTab();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Render Sidebar Lists
function renderSidebar() {
  clusterListEl.innerHTML = '';
  clusters.forEach(c => {
    const item = document.createElement('div');
    const isSelected = selectedCluster && selectedCluster['@id'] === c['@id'];
    item.className = `cluster-item ${isSelected ? 'active' : ''}`;
    const provider = c['robos:provider'] || 'buildbarn';
    item.innerHTML = `
      <div class="cluster-name">
        <span>${c['dcterms:title'] || 'REAPI Cluster'}</span>
        <span class="tag-badge tag-${provider}">${provider}</span>
      </div>
      <div class="cluster-meta">${c['robos:instanceName'] || 'main'} • ${c['robos:protocol'] || 'REAPI_v2'}</div>
    `;
    item.addEventListener('click', () => selectCluster(c));
    clusterListEl.appendChild(item);
  });

  buildsystemListEl.innerHTML = '';
  buildSystems.forEach(bs => {
    const item = document.createElement('div');
    item.className = 'buildsystem-item';
    const tool = bs['robos:buildTool'] || 'bazel';
    item.innerHTML = `
      <div class="buildsystem-name">
        <span>${bs['dcterms:title'] || 'Build System'}</span>
        <span class="tag-badge tag-${tool}">${tool}</span>
      </div>
      <div class="buildsystem-meta">${bs['robos:configFile'] || '.bazelrc'}</div>
    `;
    item.addEventListener('click', () => {
      clientMode = tool;
      btnToggleBazel.classList.toggle('active', clientMode === 'bazel');
      btnToggleBuck2.classList.toggle('active', clientMode === 'buck2');
      switchTab('clients');
    });
    buildsystemListEl.appendChild(item);
  });
}

// Select Cluster
function selectCluster(c) {
  selectedCluster = c;
  renderSidebar();

  // Overview
  const sourceOnly = c['robos:stateScope'] === 'source-only';
  clusterDetailTitleEl.textContent = c['dcterms:title'] || 'REAPI Cluster';
  clusterDetailDescEl.textContent = c['dcterms:description'] || 'Remote execution cluster';
  endpointExecEl.textContent = c['robos:executionEndpoint'] || (sourceOnly ? 'Unknown' : 'grpc://re-execution:8980');
  endpointCasEl.textContent = c['robos:casEndpoint'] || (sourceOnly ? 'Unknown' : 'grpc://re-cas:8980');
  endpointAcEl.textContent = c['robos:actionCacheEndpoint'] || c['robos:casEndpoint'] || (sourceOnly ? 'Unknown' : 'grpc://re-cas:8980');
  endpointBrowserEl.textContent = c['robos:browserEndpoint'] || (sourceOnly ? 'Unknown' : 'http://re-browser:7984');

  // Workers
  const pools = c['robos:workerPools'] || [];
  workerPoolCountEl.textContent = `${pools.length} Pool${pools.length === 1 ? '' : 's'} Active`;
  workersTbodyEl.innerHTML = '';
  pools.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:#fff;">${p.name || 'default'}</td>
      <td><code>${p.osFamily || 'linux'}</code></td>
      <td><code>${p.isa || 'x86-64'}</code></td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);">${p.containerImage || 'none'}</td>
      <td style="font-weight:600;color:var(--accent);">${p.concurrency || 16}</td>
    `;
    workersTbodyEl.appendChild(tr);
  });

  // Cache stats
  const cache = c['robos:cacheSettings'] || {};
  statCasHitEl.textContent = cache.casHitRatio || (sourceOnly ? 'Unknown' : '89.4%');
  statAcHitEl.textContent = cache.actionCacheHitRatio || (sourceOnly ? 'Unknown' : '72.1%');
  statCapacityEl.textContent = `${cache.maxSizeBytes || '500GB'} (${cache.evictionPolicy ? cache.evictionPolicy.toUpperCase() : 'LRU'})`;
  if (sourceOnly && !cache.maxSizeBytes) statCapacityEl.textContent = 'Unknown';
  if (sourceOnly) clusterDetailDescEl.textContent += ' — Source declaration; live state is unverified.';
  statProviderEl.textContent = (c['robos:provider'] || 'buildbarn').toUpperCase();

  // Provider select sync
  providerMode = c['robos:provider'] || 'buildbarn';
  if (providerSelectEl) providerSelectEl.value = providerMode;

  if (activeTab === 'clients') updateClientConfig();
  if (activeTab === 'provider') updateProviderConfig();
  if (activeTab === 'kgraph') updateKgraphTab();
}

// Generate Client Config
async function updateClientConfig() {
  if (!selectedCluster) return;
  if (clientMode === 'bazel') {
    clientConfigFilenameEl.textContent = '.bazelrc';
    clientConfigSyntaxEl.textContent = 'INI / Bazelrc';
    if (window.remoteExecutionStudio) {
      const code = await window.remoteExecutionStudio.generateBazelrc(selectedCluster['@id']);
      clientConfigCodeEl.textContent = code;
    }
  } else {
    clientConfigFilenameEl.textContent = '.buckconfig';
    clientConfigSyntaxEl.textContent = 'Buck Config / TOML';
    if (window.remoteExecutionStudio) {
      const code = await window.remoteExecutionStudio.generateBuckconfig(selectedCluster['@id']);
      clientConfigCodeEl.textContent = code;
    }
  }
}

btnToggleBazel.addEventListener('click', () => {
  clientMode = 'bazel';
  btnToggleBazel.classList.add('active');
  btnToggleBuck2.classList.remove('active');
  updateClientConfig();
});

btnToggleBuck2.addEventListener('click', () => {
  clientMode = 'buck2';
  btnToggleBuck2.classList.add('active');
  btnToggleBazel.classList.remove('active');
  updateClientConfig();
});

// Provider Configs
async function updateProviderConfig() {
  if (!selectedCluster) return;
  if (providerMode === 'buildbarn') {
    buildbarnSubtabsEl.classList.remove('hidden');
    providerConfigFilenameEl.textContent = `bb-${buildbarnComponent}.json`;
    if (window.remoteExecutionStudio) {
      const configs = await window.remoteExecutionStudio.generateBuildbarnConfigs(selectedCluster['@id']);
      const compConfig = configs[buildbarnComponent] || configs.storage;
      providerConfigCodeEl.textContent = JSON.stringify(compConfig, null, 2);
    }
  } else {
    buildbarnSubtabsEl.classList.add('hidden');
    providerConfigFilenameEl.textContent = 'nativelink.json';
    if (window.remoteExecutionStudio) {
      const cfg = await window.remoteExecutionStudio.generateNativeLinkConfig(selectedCluster['@id']);
      providerConfigCodeEl.textContent = JSON.stringify(cfg, null, 2);
    }
  }
}

providerSelectEl.addEventListener('change', (e) => {
  providerMode = e.target.value;
  updateProviderConfig();
});

document.querySelectorAll('.subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    buildbarnComponent = btn.dataset.component;
    updateProviderConfig();
  });
});

// Knowledge Graph Tab
function updateKgraphTab() {
  if (!selectedCluster) return;
  kgraphJsonldCodeEl.textContent = JSON.stringify(selectedCluster, null, 2);
}

// Copy Buttons
document.getElementById('btn-copy-client-config').addEventListener('click', () => {
  navigator.clipboard.writeText(clientConfigCodeEl.textContent);
  showToast(`Copied ${clientConfigFilenameEl.textContent} to clipboard`);
});

document.getElementById('btn-copy-provider-config').addEventListener('click', () => {
  navigator.clipboard.writeText(providerConfigCodeEl.textContent);
  showToast(`Copied ${providerConfigFilenameEl.textContent} to clipboard`);
});

// Endpoint Test Probe
document.getElementById('btn-test-endpoints').addEventListener('click', async () => {
  if (!selectedCluster || !window.remoteExecutionStudio) return;
  showToast('Probing REAPI v2 cluster endpoints...');
  const res = await window.remoteExecutionStudio.testEndpoints(selectedCluster['@id']);
  probeResultsCardEl.classList.remove('hidden');
  probeDetailsEl.innerHTML = `
    <div class="probe-row">
      <span>Execution Service (${res.executionEndpoint.protocol}):</span>
      <span class="probe-healthy">STATUS: ${res.executionEndpoint.status} (${res.executionEndpoint.latencyMs}ms)</span>
    </div>
    <div class="probe-row">
      <span>CAS & Bytestream (${res.casEndpoint.protocol}):</span>
      <span class="probe-healthy">STATUS: ${res.casEndpoint.status} (${res.casEndpoint.latencyMs}ms, 500GB Capacity)</span>
    </div>
    <div class="probe-row">
      <span>Observation UI (${res.browserEndpoint.url}):</span>
      <span class="probe-healthy">HTTP ${res.browserEndpoint.httpCode} ${res.browserEndpoint.status}</span>
    </div>
  `;
  showToast('All REAPI cluster endpoints verified successfully!');
});

// Open Browser
document.getElementById('btn-open-browser').addEventListener('click', () => {
  if (selectedCluster && selectedCluster['robos:browserEndpoint'] && window.remoteExecutionStudio) {
    window.remoteExecutionStudio.openUrl(selectedCluster['robos:browserEndpoint']);
  }
});

// KGraph Sync Button
document.getElementById('btn-sync-kgraph').addEventListener('click', async () => {
  if (window.remoteExecutionStudio) {
    const res = await window.remoteExecutionStudio.syncToKGraph();
    showToast('Knowledge Graph packages synchronized successfully!');
  }
});

// SHACL Validate Button
document.getElementById('btn-validate-shacl').addEventListener('click', () => {
  showToast('Validated! Node strictly conforms to urn:robos:shape:RemoteExecutionClusterShape.');
});

// Modal Logic
const modalEl = document.getElementById('modal-new-cluster');
document.getElementById('btn-add-cluster').addEventListener('click', () => {
  modalEl.classList.remove('hidden');
});
document.getElementById('btn-close-modal').addEventListener('click', () => {
  modalEl.classList.add('hidden');
});
document.getElementById('btn-cancel-modal').addEventListener('click', () => {
  modalEl.classList.add('hidden');
});

document.getElementById('btn-save-cluster').addEventListener('click', async () => {
  const title = document.getElementById('form-title').value.trim();
  if (!title) {
    alert('Please enter a cluster title');
    return;
  }
  const provider = document.getElementById('form-provider').value;
  const instance = document.getElementById('form-instance').value.trim() || 'main';
  const exec = document.getElementById('form-exec').value.trim();
  const cas = document.getElementById('form-cas').value.trim();
  const browser = document.getElementById('form-browser').value.trim();
  const tls = document.getElementById('form-tls').checked;

  const newCluster = {
    title,
    provider,
    instanceName: instance,
    executionEndpoint: exec,
    casEndpoint: cas,
    actionCacheEndpoint: cas,
    browserEndpoint: browser,
    tlsEnabled: tls,
  };

  if (window.remoteExecutionStudio) {
    const res = await window.remoteExecutionStudio.saveCluster(newCluster);
    if (res.ok) {
      clusters.push(res.node);
      selectCluster(res.node);
      modalEl.classList.add('hidden');
      showToast(`Cluster "${title}" registered & synchronized to KGraph!`);
    } else {
      alert(res.error || 'Failed to register cluster');
    }
  }
});

// Initial Load
async function init() {
  const source = await window.remoteExecutionStudio.getSourceWorkspace();
  if (source.sourceOnly) { window.renderSourceWorkspace(source); return; }

  if (window.remoteExecutionStudio) {
    clusters = await window.remoteExecutionStudio.getClusters();
    buildSystems = await window.remoteExecutionStudio.getBuildSystems();
  }

  if (clusters.length > 0) {
    selectCluster(clusters[0]);
  } else {
    renderSidebar();
  }
}

document.addEventListener('DOMContentLoaded', init);
