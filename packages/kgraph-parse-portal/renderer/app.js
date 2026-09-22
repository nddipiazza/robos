// RobOS Kgraph Parse Portal UI Application
(() => {
  'use strict';

  // API Client abstraction supporting both Electron preload (window.robosApi) and Browser fetch
  const API_BASE = window.location.origin.includes('http') ? window.location.origin : 'http://localhost:19192';

  const client = {
    async getStatus() {
      if (window.robosApi?.getStatus) return await window.robosApi.getStatus();
      const res = await fetch(`${API_BASE}/api/v1/status`);
      return await res.json();
    },
    async parseResource(data) {
      if (window.robosApi?.parseResource) return await window.robosApi.parseResource(data);
      const res = await fetch(`${API_BASE}/api/v1/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    },
    async crawlDirectory(data) {
      if (window.robosApi?.crawlDirectory) return await window.robosApi.crawlDirectory(data);
      const res = await fetch(`${API_BASE}/api/v1/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    },
    async ingestToGraph(data) {
      if (window.robosApi?.ingestToGraph) return await window.robosApi.ingestToGraph(data);
      const res = await fetch(`${API_BASE}/api/v1/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    },
    async searchLuxir(data) {
      if (window.robosApi?.searchLuxir) return await window.robosApi.searchLuxir(data);
      const q = encodeURIComponent(data.query || '');
      const type = encodeURIComponent(data.filters?.type || '');
      const res = await fetch(`${API_BASE}/api/v1/search?q=${q}&type=${type}`);
      return await res.json();
    },
    async getRbeStatus(endpoint) {
      if (window.robosApi?.getRbeStatus) return await window.robosApi.getRbeStatus(endpoint);
      const ep = encodeURIComponent(endpoint || '');
      const res = await fetch(`${API_BASE}/api/v1/rbe/status?endpoint=${ep}`);
      return await res.json();
    },
    async generateRbeValues(data) {
      if (window.robosApi?.generateRbeValues) return await window.robosApi.generateRbeValues(data);
      const res = await fetch(`${API_BASE}/api/v1/rbe/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    },
    async registerRbeCluster(data) {
      if (window.robosApi?.registerRbeCluster) return await window.robosApi.registerRbeCluster(data);
      const res = await fetch(`${API_BASE}/api/v1/rbe/register-cluster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    },
  };

  // DOM Elements
  const tabs = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');
  const badgeTika = document.getElementById('badge-tika');
  const badgeLuxir = document.getElementById('badge-luxir');
  const badgeRbe = document.getElementById('badge-rbe');
  const jsonldViewer = document.getElementById('jsonld-viewer');
  const crawlerStats = document.getElementById('crawler-stats');
  const archetypeBanner = document.getElementById('archetype-banner');
  const archetypeName = document.getElementById('archetype-name');
  const archetypeDetails = document.getElementById('archetype-details');
  const luxirIndexCount = document.getElementById('luxir-index-count');
  const searchResultsList = document.getElementById('search-results-list');
  const rbeHelmViewer = document.getElementById('rbe-helm-viewer');

  // Tab Switching
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panes.forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // Health / Status Polling
  async function refreshStatus() {
    try {
      const status = await client.getStatus();
      if (status.ok) {
        if (status.tika?.online) {
          badgeTika.classList.add('online');
          badgeTika.innerHTML = '<span class="dot"></span> Tika gRPC: Live';
        } else {
          badgeTika.classList.remove('online');
          badgeTika.innerHTML = '<span class="dot"></span> Tika: Offline Engine';
        }

        if (status.luxir?.luxirOnline) {
          badgeLuxir.classList.add('online');
          badgeLuxir.innerHTML = `<span class="dot"></span> Luxir: C++ (${status.luxir.indexedCount})`;
        } else {
          badgeLuxir.classList.remove('online');
          badgeLuxir.innerHTML = `<span class="dot"></span> Luxir: Cached (${status.luxir?.indexedCount || 0})`;
        }
        luxirIndexCount.textContent = `${status.luxir?.indexedCount || 0} items indexed`;
      }
    } catch {}
  }

  // Crawler Actions
  document.getElementById('btn-crawl').addEventListener('click', async () => {
    const pathVal = document.getElementById('crawl-path').value.trim();
    const depthVal = parseInt(document.getElementById('crawl-depth').value, 10);
    const pkgVal = document.getElementById('crawl-package').value;

    crawlerStats.textContent = 'Crawling filesystem...';
    jsonldViewer.innerHTML = '<code>Scanning directory and extracting semantic KGraph nodes...</code>';

    try {
      const res = await client.crawlDirectory({
        directoryPath: pathVal,
        maxDepth: depthVal,
        package: pkgVal,
      });

      if (res.ok) {
        crawlerStats.textContent = `${res.nodeCount} nodes extracted (${res.fileCount} files)`;
        archetypeBanner.classList.remove('hidden');
        archetypeName.textContent = res.archetype?.title || res.archetype?.archetype || 'Generic';
        archetypeDetails.textContent = `[BuildSystem: ${res.archetype?.buildSystem || 'None'} | Target: ${res.archetype?.targetClass || 'robos:SourceArtifact'}]`;
        jsonldViewer.innerHTML = `<code>${escapeHtml(JSON.stringify(res.nodes, null, 2))}</code>`;
        refreshStatus();
      } else {
        crawlerStats.textContent = 'Crawl failed';
        jsonldViewer.innerHTML = `<code>Error: ${escapeHtml(res.error || 'Failed to crawl')}</code>`;
      }
    } catch (e) {
      crawlerStats.textContent = 'Error';
      jsonldViewer.innerHTML = `<code>Error: ${escapeHtml(e.message)}</code>`;
    }
  });

  // Ingest Actions
  document.getElementById('btn-ingest').addEventListener('click', async () => {
    const pathVal = document.getElementById('crawl-path').value.trim();
    const depthVal = parseInt(document.getElementById('crawl-depth').value, 10);
    const pkgVal = document.getElementById('crawl-package').value;

    crawlerStats.textContent = 'Committing to Dual-State KGraph...';

    try {
      const res = await client.ingestToGraph({
        directoryPath: pathVal,
        maxDepth: depthVal,
        package: pkgVal,
      });

      if (res.ok) {
        crawlerStats.textContent = `✔ Committed ${res.nodesCommitted} nodes to KGraph`;
        archetypeBanner.classList.remove('hidden');
        archetypeName.textContent = res.archetype?.title || 'Generic';
        jsonldViewer.innerHTML = `<code>${escapeHtml(JSON.stringify(res.nodes, null, 2))}</code>`;
        refreshStatus();
      } else {
        crawlerStats.textContent = 'Ingest error';
      }
    } catch (e) {
      crawlerStats.textContent = 'Error: ' + e.message;
    }
  });

  // Parse Document Action
  document.getElementById('btn-parse-doc').addEventListener('click', async () => {
    const fileName = document.getElementById('parse-filename').value.trim();
    const content = document.getElementById('parse-content').value;

    crawlerStats.textContent = 'Parsing via Tika gRPC...';

    try {
      const res = await client.parseResource({
        fileName,
        filePath: fileName,
        content,
      });

      if (res.ok) {
        crawlerStats.textContent = `✔ Extracted node (${res.parseResult.astSymbols.length} AST symbols)`;
        jsonldViewer.innerHTML = `<code>// Extracted Graph Node:\n${escapeHtml(JSON.stringify(res.graphNode, null, 2))}\n\n// Tika Parse Metadata:\n${escapeHtml(JSON.stringify(res.parseResult, null, 2))}</code>`;
        refreshStatus();
      }
    } catch (e) {
      crawlerStats.textContent = 'Error: ' + e.message;
    }
  });

  // Disambiguation Classifier Demo
  document.getElementById('btn-test-classify').addEventListener('click', () => {
    const inputPath = document.getElementById('test-classify-input').value.trim();
    const mockClassify = classifyPathDemo(inputPath);

    document.getElementById('classify-result').classList.remove('hidden');
    document.getElementById('res-semantic-type').textContent = mockClassify.semanticType;
    document.getElementById('res-target-class').textContent = mockClassify.targetClass;
    document.getElementById('res-raw-mime').textContent = mockClassify.rawMime;
    document.getElementById('res-role').textContent = mockClassify.semanticRole;
  });

  function classifyPathDemo(filePath) {
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    const base = filePath.split('/').pop();

    if (base === 'package.json') {
      return { semanticType: 'robos:NodeManifest', rawMime: 'application/json', semanticRole: 'Node.js Package Manifest & Dependencies', targetClass: 'robos:SourceArtifact' };
    }
    if (base.includes('openapi') || base.includes('swagger')) {
      return { semanticType: 'robos:Contract', rawMime: 'text/yaml', semanticRole: 'REST API Contract (OpenAPI 3.1)', targetClass: 'robos:Contract' };
    }
    if (ext === 'proto') {
      return { semanticType: 'robos:ProtobufContract', rawMime: 'text/x-protobuf', semanticRole: 'gRPC Protobuf Microservice Contract', targetClass: 'robos:Contract' };
    }
    if (base === 'Chart.yaml' || base === 'Chart.yml') {
      return { semanticType: 'robos:HelmChartDefinition', rawMime: 'application/x-yaml', semanticRole: 'Kubernetes Helm Chart Metadata', targetClass: 'robos:GitOpsDeployment' };
    }
    if (ext === 'service') {
      return { semanticType: 'robos:SystemdService', rawMime: 'text/plain', semanticRole: 'Linux Systemd Service Unit', targetClass: 'robos:SourceArtifact' };
    }
    if (filePath.startsWith('/dev/')) {
      return { semanticType: 'robos:LinuxDeviceNode', rawMime: 'inode/blockdevice', semanticRole: 'Linux Hardware Device Node', targetClass: 'robos:SourceArtifact' };
    }
    return { semanticType: 'robos:SourceArtifact', rawMime: 'text/plain', semanticRole: 'Source Code / Data Resource', targetClass: 'robos:SourceArtifact' };
  }

  // Luxir Search
  let activeFacet = '';
  document.querySelectorAll('.facet-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.facet-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      activeFacet = pill.dataset.filter;
      triggerSearch();
    });
  });

  document.getElementById('btn-search').addEventListener('click', triggerSearch);
  document.getElementById('search-query').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') triggerSearch();
  });

  async function triggerSearch() {
    const q = document.getElementById('search-query').value.trim();
    try {
      const res = await client.searchLuxir({
        query: q,
        filters: { type: activeFacet },
      });

      if (res.ok && res.results.length > 0) {
        searchResultsList.innerHTML = res.results
          .map(
            (item) => `
          <div class="search-card">
            <div class="search-card-header">
              <span class="search-card-title">${escapeHtml(item.title || item.id)}</span>
              <span class="search-card-type">${escapeHtml((item.types || []).join(', '))}</span>
            </div>
            <div class="search-card-desc">${escapeHtml(item.description || 'No description available.')}</div>
            <div class="search-card-meta">
              <span>MIME: ${escapeHtml(item.mimeType || 'n/a')}</span>
              <span>Role: ${escapeHtml(item.semanticRole || 'n/a')}</span>
              <span>Package: ${escapeHtml(item.package || 'core-platform')}</span>
            </div>
          </div>
        `
          )
          .join('');
      } else {
        searchResultsList.innerHTML = '<div class="empty-state">No matching items found in the search index.</div>';
      }
    } catch {}
  }

  // Hermetiq Buildbarn RBE Actions
  document.getElementById('btn-generate-helm').addEventListener('click', async () => {
    const clusterName = document.getElementById('rbe-cluster-name').value;
    const replicas = parseInt(document.getElementById('rbe-replicas').value, 10);
    const storage = document.getElementById('rbe-storage').value;
    const endpoint = document.getElementById('rbe-endpoint').value;

    const res = await client.generateRbeValues({
      clusterName,
      replicaCount: replicas,
      storageCapacity: storage,
      executionPort: parseInt(endpoint.split(':')[1] || '8980', 10),
    });

    if (res.ok) {
      rbeHelmViewer.innerHTML = `<code># Install Command:\n# ${escapeHtml(res.installCommand)}\n\n${escapeHtml(res.valuesYaml)}</code>`;
    }
  });

  document.getElementById('btn-probe-rbe').addEventListener('click', async () => {
    const endpoint = document.getElementById('rbe-endpoint').value;
    const probeBox = document.getElementById('rbe-probe-result');
    probeBox.classList.remove('hidden');
    probeBox.innerHTML = 'Probing RBE endpoint...';

    const res = await client.getRbeStatus(endpoint);
    if (res.ok && res.rbe) {
      probeBox.innerHTML = `Endpoint: <strong>${escapeHtml(res.rbe.endpoint)}</strong> | Status: <strong class="${res.rbe.ok ? 'cyan-text' : ''}">${escapeHtml(res.rbe.status)}</strong> (${escapeHtml(res.rbe.provider)} - ${escapeHtml(res.rbe.protocol)})`;
    }
  });

  document.getElementById('btn-register-rbe-node').addEventListener('click', async () => {
    const clusterName = document.getElementById('rbe-cluster-name').value;
    const endpoint = document.getElementById('rbe-endpoint').value;
    const res = await client.registerRbeCluster({
      clusterId: clusterName,
      title: `${clusterName} REAPI v2 Cluster`,
      executionEndpoint: `grpc://${endpoint}`,
    });

    if (res.ok) {
      alert(`Successfully registered ${clusterName} in RobOS Knowledge Graph!`);
      refreshStatus();
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initial load
  refreshStatus();

  // ==========================================================================
  // QA E2E & Cucumber Overlay Controller (window.qaOverlay)
  // ==========================================================================
  const qaSplash = document.getElementById('qa-scenario-splash');
  const qaSplashTitle = document.getElementById('qa-splash-title');
  const qaSplashDesc = document.getElementById('qa-splash-desc');
  const qaStepHud = document.getElementById('qa-step-hud');
  const qaHudBadge = document.getElementById('qa-hud-badge');
  const qaHudTitle = document.getElementById('qa-hud-title');
  const qaHudDesc = document.getElementById('qa-hud-desc');
  const qaCursor = document.getElementById('qa-virtual-cursor');
  const qaRoot = document.getElementById('qa-overlay-root');

  const qaOverlay = {
    showScenarioSplash({ title, description, tags, pills, durationMs = 0 } = {}) {
      if (title && qaSplashTitle) qaSplashTitle.textContent = title;
      if (description && qaSplashDesc) qaSplashDesc.textContent = description;
      if (qaSplash) {
        qaSplash.classList.remove('hidden');
        qaSplash.style.display = 'flex';
        qaSplash.style.opacity = '1';
      }
      if (durationMs > 0) {
        setTimeout(() => qaOverlay.hideScenarioSplash(), durationMs);
      }
    },

    hideScenarioSplash() {
      if (qaSplash) {
        qaSplash.style.opacity = '0';
        setTimeout(() => {
          qaSplash.classList.add('hidden');
          qaSplash.style.display = 'none';
        }, 350);
      }
    },

    setStep({ stepType = 'GIVEN', title = '', description = '' } = {}) {
      if (qaHudBadge) {
        qaHudBadge.textContent = stepType;
        qaStepHud.setAttribute('data-step', stepType);
        if (stepType === 'GIVEN') qaHudBadge.style.backgroundColor = '#38bdf8';
        else if (stepType === 'WHEN') qaHudBadge.style.backgroundColor = '#facc15';
        else if (stepType === 'THEN') qaHudBadge.style.backgroundColor = '#10b981';
        else qaHudBadge.style.backgroundColor = '#a855f7';
      }
      if (qaHudTitle) qaHudTitle.textContent = title;
      if (qaHudDesc) qaHudDesc.textContent = description;
      if (qaStepHud) qaStepHud.classList.remove('hidden');
    },

    hideStep() {
      if (qaStepHud) qaStepHud.classList.add('hidden');
    },

    async animateCursorTo(target, durationMs = 350) {
      if (!qaCursor) return;
      qaCursor.classList.remove('hidden');

      let x = 0;
      let y = 0;
      if (typeof target === 'string') {
        const el = document.querySelector(target);
        if (el) {
          const rect = el.getBoundingClientRect();
          x = rect.left + rect.width / 2;
          y = rect.top + rect.height / 2;
        }
      } else if (target && typeof target.x === 'number') {
        x = target.x;
        y = target.y;
      }

      qaCursor.style.left = `${x}px`;
      qaCursor.style.top = `${y}px`;
      await new Promise((r) => setTimeout(r, durationMs));
      return { x, y };
    },

    async triggerClickWithRipple(target) {
      const coords = await qaOverlay.animateCursorTo(target, 300);
      if (!coords) return;

      const ripple = document.createElement('div');
      ripple.className = 'qa-ripple';
      ripple.style.left = `${coords.x}px`;
      ripple.style.top = `${coords.y}px`;
      qaRoot.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);

      if (typeof target === 'string') {
        const el = document.querySelector(target);
        if (el) el.click();
      }
      await new Promise((r) => setTimeout(r, 200));
    },

    async simulateTyping(target, text, speedMs = 35) {
      await qaOverlay.animateCursorTo(target, 250);
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;
      el.focus();
      el.value = '';
      for (let i = 0; i < text.length; i++) {
        el.value += text[i];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, speedMs));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));
    },

    async switchTab(tabId) {
      const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
      if (btn) {
        await qaOverlay.triggerClickWithRipple(`.tab-btn[data-tab="${tabId}"]`);
      }
    },
  };

  window.qaOverlay = qaOverlay;
})();
