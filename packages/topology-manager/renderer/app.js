'use strict';

let topology = null;
let selectedNodeId = 'petstore-api';
let currentZoom = 'l2'; // 'l1' | 'l2' | 'l3' | 'otel'
let searchQuery = '';

async function init() {
  if (window.topologyManager) {
    topology = await window.topologyManager.getTopology();
  } else {
    topology = {
      system: { id: 'acme-petshop', name: 'Acme Petshop Platform' },
      nodes: [
        { id: 'petstore-web', name: 'React Web Client', type: 'frontend', technology: 'Node.js 20 / React 18 / Vite', repo: 'http://127.0.0.1:3000/acme-org/petstore-web.git', ownerTeam: 'Frontend Engineering' },
        { id: 'petstore-api', name: 'Java Spring Boot REST API', type: 'service', technology: 'Java 21 / Spring Boot 3.3', repo: 'http://127.0.0.1:3000/acme-org/petstore-api.git', ownerTeam: 'Core Backend Platform', contracts: ['contracts/petstore-api.openapi.yaml'], devcontainer: '.devcontainer/devcontainer.json', upstream: ['petstore-web'], downstream: ['petstore-db', 'event-bus', 'vaccine-gateway'] },
        { id: 'petstore-common', name: 'Reusable TypeSpec & Pact Library', type: 'library', technology: 'TypeSpec / Pact / Protobuf', repo: 'http://127.0.0.1:3000/acme-org/petstore-common.git', ownerTeam: 'Platform Enabling Team', contracts: ['contracts/petstore-api.openapi.yaml'], upstream: ['petstore-web', 'petstore-api'], downstream: [] },
        { id: 'vaccine-gateway', name: 'Rabies Vaccine Certification Gateway', type: 'service', technology: 'Node.js 20 / Fastify / TypeSpec', repo: 'http://127.0.0.1:3000/robos/vaccine-gateway.git', ownerTeam: 'Security & Compliance', contracts: ['contracts/vaccine-gateway.openapi.yaml'], upstream: ['petstore-api'], downstream: [] },
        { id: 'event-bus', name: 'Apache Kafka Event Bus', type: 'streaming', technology: 'Apache Kafka 3.7', repo: 'infra/kafka', ownerTeam: 'Data Platform', contracts: ['contracts/events.asyncapi.yml'], upstream: ['petstore-api'], downstream: [] },
        { id: 'petstore-db', name: 'PostgreSQL 16 Primary DB', type: 'database', technology: 'PostgreSQL 16', repo: 'infra/postgres', ownerTeam: 'Data Platform', upstream: ['petstore-api'], downstream: [] },
      ],
      links: [
        { from: 'petstore-web', to: 'petstore-api', protocol: 'HTTPS/JSON (OpenAPI 3.1)' },
        { from: 'petstore-api', to: 'petstore-db', protocol: 'TCP/SQL (JDBC)' },
        { from: 'petstore-api', to: 'event-bus', protocol: 'TCP/Kafka (Protobuf)' },
        { from: 'petstore-api', to: 'vaccine-gateway', protocol: 'HTTPS/mTLS (OpenAPI 3.1)' },
        { from: 'petstore-web', to: 'petstore-common', protocol: 'npm (@acme/petstore-common)' },
        { from: 'petstore-api', to: 'petstore-common', protocol: 'Maven DTO Jar' },
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
    service: { label: '⚙️ Microservices & Gateways', items: [] },
    library: { label: '📚 Shared Libraries & TypeSpec', items: [] },
    streaming: { label: '📬 Streaming & Event Bus', items: [] },
    database: { label: '🗄️ Relational Databases', items: [] },
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
        <div class="node-tech">High-level view of external user actors interacting with the Acme Petshop Platform.</div>
      </div>
      <div class="node-card active" id="node-card-system-boundary">
        <div class="node-header">
          <span class="node-title">🏢 Acme Petshop Platform System Boundary</span>
          <span class="type-badge type-service">Enterprise Polyglot System</span>
        </div>
        <div class="node-tech">Encompasses 6 deployable containers (React Web Client, Java Spring Boot REST API, Rabies Vaccine Gateway, PostgreSQL 16 DB, Apache Kafka, TypeSpec Common Lib) bound to <code>urn:robos:project:acme-petshop-platform</code>.</div>
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
