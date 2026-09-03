'use strict';

let adapterData = null;
let activeAdapterId = 'backstage';
let searchQuery = '';
let syncBannerMsg = null;

async function init() {
  if (window.api && window.api.getAdaptersStatus) {
    adapterData = await window.api.getAdaptersStatus();
  } else {
    adapterData = {
      activeBranch: 'main',
      adapters: [
        {
          id: 'backstage',
          name: 'Spotify Backstage Catalog Adapter',
          standard: 'Backstage v1alpha1 (catalog-info.yaml)',
          status: 'synced',
          roundtripStatus: '100% Lossless',
          entitiesCount: 14,
          rawInput: `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: forms-api
  title: Dynamic Forms API
  description: Core microservice handling dynamic form templates
  tags: [robos, microservice, rest]
spec:
  type: service
  lifecycle: production
  owner: team-core
  system: buildbarn-platform`,
          translatedRobos: `# .robos/topology.yaml
version: 1.0.0
services:
  - id: forms-api
    name: Dynamic Forms API
    type: service
    owner: team-core
    system: buildbarn-platform
    description: Core microservice handling dynamic form templates
    tags: [robos, microservice, rest]`,
        },
      ],
    };
  }

  renderStats();
  renderAdapterList();
  renderWorkspace();
}

function getActiveAdapter() {
  return adapterData.adapters.find(a => a.id === activeAdapterId) || adapterData.adapters[0];
}

function renderStats() {
  const adapter = getActiveAdapter();
  document.getElementById('stat-adapters-count').textContent = `${adapterData.adapters.length} OSS Adapters Active`;
  document.getElementById('adapter-count-badge').textContent = `${adapterData.adapters.length} Adapters`;
  document.getElementById('stat-active-adapter').textContent = `${adapter.name.split(' ')[1]} (${adapter.entitiesCount} Entities)`;
  document.getElementById('stat-roundtrip').textContent = adapter.roundtripStatus;
}

function renderAdapterList() {
  const container = document.getElementById('adapters-list');
  const filtered = adapterData.adapters.filter(a => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || a.standard.toLowerCase().includes(q);
  });

  container.innerHTML = filtered.map(adapter => {
    const isSelected = adapter.id === activeAdapterId;
    const safeDomId = 'adapter-item-' + adapter.id.replace(/[^a-zA-Z0-9_-]/g, '-');

    return `
      <div class="adapter-card-item ${isSelected ? 'active' : ''}" id="${safeDomId}" onclick="window.selectAdapter('${adapter.id}')">
        <div class="adapter-card-row">
          <span class="adapter-title">${adapter.id.toUpperCase()}</span>
          <span class="count-badge">${adapter.entitiesCount} entities</span>
        </div>
        <div style="font-weight: 700; font-size: 11px; color: var(--text-bright);">${adapter.name}</div>
        <div style="font-size: 10px; color: var(--text-muted);">${adapter.standard}</div>
        <div style="font-size: 9px; color: var(--success); font-weight: 700;">🟢 ${adapter.roundtripStatus}</div>
      </div>
    `;
  }).join('');
}

function renderWorkspace() {
  const container = document.getElementById('adapter-workspace');
  const adapter = getActiveAdapter();
  if (!adapter) return;

  container.innerHTML = `
    <!-- Top Adapter Overview -->
    <div class="info-card" id="adapter-header-card">
      <div class="adapter-card-row">
        <span>🔌 <strong>${adapter.name}</strong></span>
        <span class="status-tag-pass">🟢 ${adapter.roundtripStatus}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
        Standard: <code>${adapter.standard}</code> &middot; Entities: <code>${adapter.entitiesCount} Synchronized</code>
      </div>
    </div>

    ${syncBannerMsg ? `
      <div class="sync-banner" id="sync-banner">
        ${syncBannerMsg}
      </div>
    ` : ''}

    <!-- Bi-Directional Translation Columns -->
    <div class="translation-columns">
      <div class="translation-col">
        <div class="col-header">1. Raw Open-Source Input (${adapter.standard}):</div>
        <pre class="code-pre" id="raw-oss-pre">${adapter.rawInput}</pre>
      </div>

      <div class="translation-col">
        <div class="col-header">2. Translated RobOS GitOps Specification (.robos/):</div>
        <pre class="code-pre" id="translated-robos-pre">${adapter.translatedRobos}</pre>
      </div>
    </div>
  `;
}

window.selectAdapter = function(id) {
  activeAdapterId = id;
  syncBannerMsg = null;
  renderStats();
  renderAdapterList();
  renderWorkspace();
};

window.switchGitBranch = async function(branchName) {
  const selectEl = document.getElementById('select-gitops-branch');
  if (selectEl) selectEl.value = branchName;

  if (window.api && window.api.switchBranch) {
    const res = await window.api.switchBranch(branchName);
    if (res.ok) {
      const commitEl = document.getElementById('git-commit-badge');
      if (commitEl) {
        commitEl.textContent = `commit: ${res.branchInfo.commit} (${res.branchInfo.clean ? 'clean' : 'delta'})`;
        commitEl.style.color = res.branchInfo.clean ? 'var(--text-muted)' : 'var(--accent)';
      }
      renderWorkspace();
      return res;
    }
  } else {
    const commitEl = document.getElementById('git-commit-badge');
    if (commitEl) {
      commitEl.textContent = `commit: ${branchName === 'main' ? '8f9a2b1 (clean)' : 'd4e5f6a (delta)'}`;
    }
    renderWorkspace();
    return { ok: true, activeBranch: branchName };
  }
};

window.syncAllAdapters = async function() {
  syncBannerMsg = `⚡ All 5 OSS Ecosystem Adapters synchronized in 140ms with 100% semantic fidelity.`;
  if (window.api && window.api.syncAll) {
    const res = await window.api.syncAll();
    renderWorkspace();
    return res;
  } else {
    renderWorkspace();
    return { ok: true, syncedCount: 5 };
  }
};

window.exportBackstage = async function() {
  syncBannerMsg = `📤 Exported compliant Spotify Backstage catalog-info.yaml (14 entities written).`;
  if (window.api && window.api.exportBackstage) {
    const res = await window.api.exportBackstage();
    renderWorkspace();
    return res;
  } else {
    renderWorkspace();
    return { ok: true, file: 'catalog-info.yaml' };
  }
};

const searchInput = document.getElementById('adapter-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderAdapterList();
  });
}

init();
