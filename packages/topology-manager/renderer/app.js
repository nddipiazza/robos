'use strict';

let topology = null;
let selectedNodeId = 'forms-api';
let currentZoom = 'l2'; // 'l1' | 'l2' | 'l3' | 'otel'
let searchQuery = '';

async function init() {
  if (window.topologyManager) {
    topology = await window.topologyManager.getTopology();
  } else {
    topology = {
      system: { id: 'buildbarn-platform', name: 'BuildBarn Platform' },
      nodes: [
        { id: 'web-client', name: 'Web Portal', type: 'frontend', technology: 'React / Vite', repo: 'github.com/acme/buildbarn-web', ownerTeam: 'Core UI Team' },
        { id: 'forms-api', name: 'Forms API Service', type: 'service', technology: 'Node.js 20 / Express', repo: 'github.com/acme/buildbarn-forms', ownerTeam: 'Core Platform Engineering', contracts: ['contracts/forms-api.openapi.yaml'], devcontainer: '.devcontainer/devcontainer.json', upstream: ['web-client'], downstream: ['db-primary', 'event-bus'] },
        { id: 'workflow-svc', name: 'Workflow Orchestrator', type: 'service', technology: 'Go 1.22 / Temporal', repo: 'github.com/acme/buildbarn-workflows', ownerTeam: 'Core Platform Engineering', contracts: ['contracts/workflows.asyncapi.yml'], upstream: ['event-bus'], downstream: ['db-primary'] },
        { id: 'event-bus', name: 'RabbitMQ Event Broker', type: 'broker', technology: 'RabbitMQ 3.13 / AMQP', ownerTeam: 'Infra Platform Team' },
        { id: 'db-primary', name: 'PostgreSQL Database', type: 'database', technology: 'PostgreSQL 16 / TimescaleDB', ownerTeam: 'Data Platform Team' },
      ],
      links: [
        { from: 'web-client', to: 'forms-api', protocol: 'HTTPS / REST', contract: 'contracts/forms-api.openapi.yaml' },
        { from: 'forms-api', to: 'db-primary', protocol: 'TCP / SQL' },
        { from: 'forms-api', to: 'event-bus', protocol: 'AMQP / Events' },
        { from: 'event-bus', to: 'workflow-svc', protocol: 'AMQP / Subscribe' },
        { from: 'workflow-svc', to: 'db-primary', protocol: 'TCP / SQL' },
      ],
    };
  }

  renderStats();
  renderCatalog();
  renderCanvas();
  renderInspector();
}

function renderStats() {
  document.getElementById('stat-system-id').textContent = topology.system.id;
  document.getElementById('stat-nodes-count').textContent = `${topology.nodes.length} System Nodes`;
  document.getElementById('catalog-count-badge').textContent = `${topology.nodes.length} Entities`;

  const zoomLabels = {
    l1: 'C4 Level 1 (System Context)',
    l2: 'C4 Level 2 (Containers & Microservices)',
    l3: 'C4 Level 3 (Components & Modules)',
    otel: 'Live OpenTelemetry Heatmap',
  };
  document.getElementById('stat-c4-level').textContent = zoomLabels[currentZoom] || 'C4 Architecture';
}

function renderCatalog() {
  const container = document.getElementById('catalog-tree');
  const filtered = topology.nodes.filter(n => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.type.toLowerCase().includes(q);
  });

  const categories = {
    frontend: { label: '🌐 Frontends', items: [] },
    service: { label: '⚙️ Microservices', items: [] },
    database: { label: '🗄️ Databases', items: [] },
    broker: { label: '📬 Message Brokers', items: [] },
  };

  filtered.forEach(node => {
    const cat = categories[node.type] || categories.service;
    cat.items.push(node);
  });

  let html = '';
  Object.entries(categories).forEach(([key, cat]) => {
    if (cat.items.length === 0) return;
    html += `<div class="catalog-cat-header">${cat.label} (${cat.items.length})</div>`;
    cat.items.forEach(node => {
      const isSelected = node.id === selectedNodeId;
      html += `
        <div class="catalog-item ${isSelected ? 'active' : ''}" id="cat-item-${node.id}" onclick="window.selectNode('${node.id}')">
          <span>${node.name}</span>
          <span class="type-badge type-${node.type}">${node.type}</span>
        </div>
      `;
    });
  });

  container.innerHTML = html;
}

function renderCanvas() {
  const container = document.getElementById('topology-canvas');

  let html = '';

  if (currentZoom === 'l1') {
    html = `
      <div class="inspector-card" style="margin-bottom: 8px;">
        <div class="card-title"><span>C4 Level 1: System Context Diagram</span></div>
        <div class="node-tech">High-level view of external user actors interacting with the BuildBarn Platform.</div>
      </div>
      <div class="node-card active" id="node-card-system-boundary">
        <div class="node-header">
          <span class="node-title">🏢 BuildBarn Platform System Boundary</span>
          <span class="type-badge type-service">Enterprise System</span>
        </div>
        <div class="node-tech">Encompasses 5 internal deployable containers (React Web Portal, Forms API, Workflow Svc, Postgres DB, RabbitMQ).</div>
      </div>
    `;
  } else {
    topology.nodes.forEach(node => {
      const isSelected = node.id === selectedNodeId;
      const outgoingLinks = topology.links.filter(l => l.from === node.id);

      html += `
        <div class="node-card ${isSelected ? 'active' : ''}" id="node-card-${node.id}" onclick="window.selectNode('${node.id}')">
          <div class="node-header">
            <span class="node-title">${node.name} (<code>${node.id}</code>)</span>
            <span class="type-badge type-${node.type}">${node.type}</span>
          </div>
          <div class="node-tech">
            <strong>Tech:</strong> ${node.technology} &middot; <strong>Team:</strong> ${node.ownerTeam || 'Platform Team'}
          </div>

          ${currentZoom === 'otel' ? `
            <div class="c4-link-row" style="background: rgba(0, 188, 212, 0.08); border-color: var(--accent);">
              <span>⚡ Live Traffic: <strong>${Math.floor(Math.random() * 400 + 100)} req/s</strong></span>
              <span class="status-tag-pass">Latency: 14ms &middot; Errors: 0.00%</span>
            </div>
          ` : ''}

          ${outgoingLinks.length > 0 ? `
            <div class="c4-links-container">
              ${outgoingLinks.map(l => `
                <div class="c4-link-row">
                  <span>${node.id} ──▶ <strong>${l.to}</strong></span>
                  <span class="link-proto">${l.protocol}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

function renderInspector() {
  const container = document.getElementById('node-inspector');
  const node = topology.nodes.find(n => n.id === selectedNodeId) || topology.nodes[0];
  if (!node) return;

  const badgeEl = document.getElementById('inspector-type-badge');
  if (badgeEl) {
    badgeEl.textContent = node.type.toUpperCase();
    badgeEl.className = `type-badge type-${node.type}`;
  }

  const upstream = node.upstream || [];
  const downstream = node.downstream || [];

  container.innerHTML = `
    <div class="inspector-card" id="inspector-card-details">
      <div class="field-label">Node Identifier & Name</div>
      <div class="field-val"><strong>${node.name}</strong> (<code>${node.id}</code>)</div>

      <div class="field-label" style="margin-top: 6px;">Architecture Type</div>
      <div class="field-val"><span class="type-badge type-${node.type}">${node.type}</span></div>

      <div class="field-label" style="margin-top: 6px;">Technology Stack</div>
      <div class="field-val"><code>${node.technology}</code></div>

      <div class="field-label" style="margin-top: 6px;">Responsible Team</div>
      <div class="field-val">👥 ${node.ownerTeam || 'Core Platform Team'}</div>

      <div class="field-label" style="margin-top: 6px;">Repository Workspace</div>
      <div class="field-val"><code>${node.repo || 'github.com/acme/buildbarn-repo'}</code></div>

      ${node.devcontainer ? `
        <div class="field-label" style="margin-top: 6px;">Devcontainer Isolation</div>
        <div class="field-val">🐳 <code>${node.devcontainer}</code></div>
      ` : ''}
    </div>

    <div class="inspector-card" id="inspector-card-contracts">
      <div class="field-label">Linked API Contracts & Schemas</div>
      ${(node.contracts && node.contracts.length > 0) ? `
        ${node.contracts.map(c => `
          <div style="margin-top: 4px; padding: 4px 6px; background: var(--bg-hover); border-radius: 4px;">
            📄 <code>${c}</code> <span class="status-tag-pass" style="float:right;">VALID</span>
          </div>
        `).join('')}
      ` : `<div class="field-val" style="color: var(--text-muted);">No direct contract published</div>`}
    </div>

    <div class="inspector-card" id="inspector-card-blast">
      <div class="field-label">Upstream Callers (${upstream.length})</div>
      <div class="field-val">${upstream.length > 0 ? upstream.map(u => `<code>${u}</code>`).join(', ') : 'None (Entrypoint)'}</div>

      <div class="field-label" style="margin-top: 6px;">Downstream Blast Radius (${downstream.length})</div>
      <div class="field-val">${downstream.length > 0 ? downstream.map(d => `<code>${d}</code>`).join(', ') : 'None (Leaf Node)'}</div>
    </div>
  `;
}

window.selectNode = function(id) {
  selectedNodeId = id;
  renderCatalog();
  renderCanvas();
  renderInspector();
};

window.switchZoom = function(level) {
  currentZoom = level;
  document.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `btn-zoom-${level}`);
  });
  renderStats();
  renderCanvas();
};

window.importBackstageCatalog = async function() {
  if (window.topologyManager) {
    const res = await window.topologyManager.importBackstage();
    if (res.ok && res.node) {
      topology.nodes.push(res.node);
      topology.links.push({ from: 'forms-api', to: 'tax-service', protocol: 'HTTPS / REST (Acme Tax API v2)' });
      selectedNodeId = res.node.id;
      renderStats();
      renderCatalog();
      renderCanvas();
      renderInspector();
      return res;
    }
  }
};

window.exportC4Diagram = async function() {
  if (window.topologyManager) {
    const res = await window.topologyManager.exportC4();
    const container = document.getElementById('topology-canvas');
    container.innerHTML = `
      <div class="inspector-card" id="c4-export-card">
        <div class="node-header">
          <span class="node-title">📐 Structurizr / PlantUML C4 Export</span>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 10px;" onclick="window.renderCanvas()">🔙 Return to Canvas</button>
        </div>
        <pre class="json-pre" id="c4-export-pre">${res.c4Markup}</pre>
      </div>
    `;
    return res;
  }
};

const searchInput = document.getElementById('catalog-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderCatalog();
  });
}

init();
