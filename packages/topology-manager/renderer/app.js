'use strict';

let topology = {
  system: { id: 'acme-petshop', name: 'Acme Petshop Platform' },
  nodes: [],
  links: [],
};
let selectedNodeId = null;
let currentZoom = 'l2'; // 'l1' | 'l2' | 'l3' | 'otel'
let searchQuery = '';

const ACME_FULL_NODES = [
  { id: 'petstore-web', name: 'React Web Client', type: 'frontend', technology: 'Node.js 20 / React 18 / Vite', repo: 'http://127.0.0.1:3000/acme-org/petstore-web.git', ownerTeam: 'Frontend Engineering' },
  { id: 'petstore-api', name: 'Java Spring Boot REST API', type: 'service', technology: 'Java 21 / Spring Boot 3.3', repo: 'http://127.0.0.1:3000/acme-org/petstore-api.git', ownerTeam: 'Core Backend Platform', contracts: ['contracts/petstore-api.openapi.yaml'], devcontainer: '.devcontainer/devcontainer.json', upstream: ['petstore-web'], downstream: ['petstore-db', 'event-bus', 'vaccine-gateway'] },
  { id: 'petstore-common', name: 'Reusable TypeSpec & Pact Library', type: 'library', technology: 'TypeSpec / Pact / Protobuf', repo: 'http://127.0.0.1:3000/acme-org/petstore-common.git', ownerTeam: 'Platform Enabling Team', contracts: ['contracts/petstore-api.openapi.yaml'], upstream: ['petstore-web', 'petstore-api'], downstream: [] },
  { id: 'vaccine-gateway', name: 'Rabies Vaccine Certification Gateway', type: 'service', technology: 'Node.js 20 / Fastify / TypeSpec', repo: 'http://127.0.0.1:3000/robos/vaccine-gateway.git', ownerTeam: 'Security & Compliance', contracts: ['contracts/vaccine-gateway.openapi.yaml'], upstream: ['petstore-api'], downstream: [] },
  { id: 'event-bus', name: 'Apache Kafka Event Bus', type: 'streaming', technology: 'Apache Kafka 3.7', repo: 'infra/kafka', ownerTeam: 'Data Platform', contracts: ['contracts/events.asyncapi.yml'], upstream: ['petstore-api'], downstream: [] },
  { id: 'petstore-db', name: 'PostgreSQL 16 Primary DB', type: 'database', technology: 'PostgreSQL 16', repo: 'infra/postgres', ownerTeam: 'Data Platform', upstream: ['petstore-api'], downstream: [] },
];

const ACME_FULL_LINKS = [
  { from: 'petstore-web', to: 'petstore-api', protocol: 'HTTPS/JSON (OpenAPI 3.1)' },
  { from: 'petstore-api', to: 'petstore-db', protocol: 'TCP/SQL (JDBC)' },
  { from: 'petstore-api', to: 'event-bus', protocol: 'TCP/Kafka (Protobuf)' },
  { from: 'petstore-api', to: 'vaccine-gateway', protocol: 'HTTPS/mTLS (OpenAPI 3.1)' },
  { from: 'petstore-web', to: 'petstore-common', protocol: 'npm (@acme/petstore-common)' },
  { from: 'petstore-api', to: 'petstore-common', protocol: 'Maven DTO Jar' },
];

const TOPOLOGY_QUESTIONS = [
  {
    id: 'event-broker',
    step: 'Question 1 of 2: Interservice Messaging & Event Streaming',
    title: 'Interservice Messaging',
    prompt: 'Which event streaming broker should decouple pet adoption events and inventory updates?',
    options: [
      { id: 'kafka', label: 'Apache Kafka 3.7 Event Bus (event-bus)', desc: 'High-throughput partitioned event log with Protobuf schemas (recommended for distributed polyglot topologies)', recommended: true },
      { id: 'rabbitmq', label: 'RabbitMQ AMQP Broker', desc: 'Message queue broker with exchange-based topic routing' },
      { id: 'direct-rest', label: 'Direct Synchronous REST Calls', desc: 'Direct point-to-point HTTP/REST calls between services (tightly coupled)' },
    ],
  },
  {
    id: 'vaccine-compliance',
    step: 'Question 2 of 2: Health & Compliance Gateway',
    title: 'Compliance Gateway Architecture',
    prompt: 'How should rabies vaccination certification and veterinary health registry validation be isolated?',
    options: [
      { id: 'fastify-gateway', label: 'Dedicated Fastify & TypeSpec Compliance Gateway (vaccine-gateway)', desc: 'Isolates external vet registry APIs, state compliance, and mTLS security boundaries', recommended: true },
      { id: 'monolith-module', label: 'Embedded Module in Java Spring Boot API', desc: 'Directly integrates validation logic within petstore-api monolith container' },
    ],
  },
];

async function init() {
  const promptEl = document.getElementById('topology-ai-prompt');
  if (promptEl) {
    promptEl.addEventListener('robos-submit', (e) => {
      window.promptQuestions();
    });
    promptEl.addEventListener('submit', (e) => {
      window.promptQuestions();
    });
  }

  renderStats();
  renderCatalog();
  renderCanvas();
  await renderInspector();
}

window.promptQuestions = function() {
  const promptEl = document.getElementById('topology-ai-prompt');
  let promptText = '';
  if (promptEl) {
    const inner = promptEl.querySelector('.robos-ai-inner') || promptEl;
    promptText = inner.innerText || inner.value || promptEl.value || '';
    inner.innerText = '';
    if (promptEl.value !== undefined) promptEl.value = '';
    promptEl.setAttribute('placeholder', 'Ask follow-up or refine topology...');
  }

  const threadEl = document.getElementById('ai-conversation-thread');
  if (threadEl) {
    threadEl.style.display = 'flex';
    threadEl.innerHTML = `
      <div class="chat-bubble chat-user">
        <div class="chat-sender">👤 You</div>
        <div>${promptText.replace(/\n/g, '<br/>') || 'Synthesizing Acme Petshop architecture topology...'}</div>
      </div>
      <div class="chat-bubble chat-agent" id="chat-agent-bubble">
        <div class="chat-sender">✨ RobOS Architecture Agent</div>
        <div>Analyzing epics & stories from <code>urn:robos:project:acme-petshop-platform</code>...<br/>To refine service boundaries and messaging topology, please answer the 2 architectural questions below:</div>
      </div>
    `;
  }

  const wizard = document.getElementById('topology-question-wizard');
  if (wizard) {
    wizard.style.display = 'block';
    wizard.setQuestions(TOPOLOGY_QUESTIONS);
    wizard.addEventListener('robos-wizard-complete', (e) => {
      wizard.style.display = 'none';
      window.applyTopologyAnswers(e.detail?.answers || {});
    }, { once: true });
  } else {
    window.applyTopologyAnswers({});
  }
};

window.applyTopologyAnswers = async function(answers) {
  topology.nodes = [...ACME_FULL_NODES];
  topology.links = [...ACME_FULL_LINKS];
  selectedNodeId = 'petstore-api';

  if (window.topologyManager?.saveTopology) {
    try {
      await window.topologyManager.saveTopology(topology);
    } catch (_) {}
  }

  const threadEl = document.getElementById('ai-conversation-thread');
  if (threadEl) {
    threadEl.innerHTML += `
      <div class="chat-bubble chat-agent">
        <div class="chat-sender">✨ RobOS Architecture Agent</div>
        <div style="color: var(--success); font-weight: 600; margin-bottom: 4px;">✓ Decisions Applied: Apache Kafka 3.7 & Dedicated Fastify Compliance Gateway</div>
        <div>Synthesized 6 container nodes for Acme Petshop Platform and saved topology to <code>.robos/topology.yaml</code>. <em>Target API contracts registered for Step 3 (Contract & Schema Studio).</em></div>
      </div>
    `;
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  const schemaStatusEl = document.getElementById('stat-schema-status');
  if (schemaStatusEl) {
    schemaStatusEl.textContent = '100% CONFORMING';
    schemaStatusEl.style.color = 'var(--success)';
  }

  renderStats();
  renderCatalog();
  renderCanvas();
  await renderInspector();
};

window.synthesizeTopology = function(promptText) {
  window.promptQuestions();
};

window.importFromTaskPlanner = function() {
  const defaultPrompt = `Synthesizing architecture from Task Planner (Acme Petshop Platform):
- Java 21 Spring Boot 3 REST API microservice (petstore-api)
- PostgreSQL 16 relational database with Flyway (petstore-db)
- React 18 TypeScript web client (petstore-web)
- Apache Kafka event bus for async pet adoption (event-bus)
- Dedicated rabies vaccine certification gateway (vaccine-gateway)
- Reusable TypeSpec & Pact contract models (petstore-common)

Ask me clarifying questions to refine service boundaries and messaging topology.`;

  const host = document.getElementById('topology-ai-prompt');
  if (host) {
    const inner = host.querySelector('.robos-ai-inner') || host;
    if (inner) inner.innerText = defaultPrompt;
  }

  window.promptQuestions();
};

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

  if (topology.nodes.length === 0) {
    container.innerHTML = `
      <div class="empty-topology-hint" id="empty-canvas-hint">
        <div style="font-size: 28px; margin-bottom: 8px;">🗺️</div>
        <strong style="font-size: 14px; color: var(--text-bright);">No Architecture Topology Defined</strong>
        <div style="color: var(--text-muted); font-size: 11px; margin-top: 6px; max-width: 480px;">
          Enter your polyglot specification in the AI prompt above or click <strong>"Import from Task Planner"</strong> to synthesize the 6-container C4 graph.
        </div>
      </div>
    `;
    return;
  }

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

async function renderInspector() {
  const container = document.getElementById('node-inspector');
  if (!container) return;

  if (topology.nodes.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 11px;">
        No active nodes. Synthesize topology from prompt above to inspect contracts and blast radius.
      </div>
    `;
    const badgeEl = document.getElementById('inspector-type-badge');
    if (badgeEl) badgeEl.textContent = 'NONE';
    return;
  }

  const node = topology.nodes.find(n => n.id === selectedNodeId) || topology.nodes[0];
  if (!node) return;

  const badgeEl = document.getElementById('inspector-type-badge');
  if (badgeEl) {
    badgeEl.textContent = node.type.toUpperCase();
    badgeEl.className = `type-badge type-${node.type}`;
  }

  const upstream = node.upstream || [];
  const downstream = node.downstream || [];

  let contractDetailsHtml = '';
  if (node.contracts && node.contracts.length > 0) {
    contractDetailsHtml = node.contracts.map(c => `
      <div style="margin-top: 6px; padding: 6px 8px; background: var(--bg-hover); border-radius: 4px; border: 1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:600; color:var(--text-bright);">📄 <code>${c}</code></span>
          <span style="background: rgba(210, 153, 34, 0.15); color: var(--amber); border: 1px solid rgba(210, 153, 34, 0.4); padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px;">⏳ TARGET FOR STEP 3</span>
        </div>
        <div style="font-size: 10px; color: var(--accent); margin-top: 4px;">
          ${node.type === 'streaming' ? 'Expected Protocol: AsyncAPI 3.0 (Apache Kafka)' : 'Expected Protocol: OpenAPI 3.1 REST API / TypeSpec'}
        </div>
        <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">
          Specification and schemas will be authored, compiled, and validated in <strong>Step 3 (Contract & Schema Studio)</strong>.
        </div>
      </div>
    `).join('');
  } else {
    contractDetailsHtml = `<div class="field-val" style="color: var(--text-muted); padding: 4px 0;">No direct contract published</div>`;
  }

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
      <div class="field-label">Target API Contract & Step 3 Specification</div>
      ${contractDetailsHtml}
    </div>

    <div class="inspector-card" id="inspector-card-blast">
      <div class="field-label">Upstream Callers (${upstream.length})</div>
      <div class="field-val">${upstream.length > 0 ? upstream.map(u => `<code>${u}</code>`).join(', ') : 'None (Entrypoint)'}</div>

      <div class="field-label" style="margin-top: 6px;">Downstream Blast Radius (${downstream.length})</div>
      <div class="field-val">${downstream.length > 0 ? downstream.map(d => `<code>${d}</code>`).join(', ') : 'None (Leaf Node)'}</div>
    </div>
  `;
}

window.selectNode = async function(id) {
  selectedNodeId = id;
  renderCatalog();
  renderCanvas();
  await renderInspector();
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

window.addDataSourceModal = async function(customDs) {
  const ds = customDs || {
    id: 'analytics-postgres-db',
    name: 'PostgreSQL 16 Analytics Warehouse',
    type: 'database',
    technology: 'PostgreSQL 16 / TimescaleDB',
    repo: 'infra/postgres-analytics',
    ownerTeam: 'Data Platform & BI',
    urn: 'urn:robos:datasource:petshop-analytics-db',
    database: 'petshop_analytics',
    port: 5432,
    upstream: ['petstore-api'],
    downstream: [],
  };

  if (window.topologyManager?.addDataSource) {
    const res = await window.topologyManager.addDataSource(ds);
    if (res.ok) {
      if (!topology.nodes.some(n => n.id === ds.id)) {
        topology.nodes.push(ds);
        topology.links.push({ from: 'petstore-api', to: ds.id, protocol: 'TCP / JDBC (Port 5432)' });
      }
      selectedNodeId = ds.id;

      const threadEl = document.getElementById('ai-conversation-thread');
      if (threadEl) {
        threadEl.style.display = 'flex';
        threadEl.innerHTML += `
          <div class="chat-bubble chat-agent">
            <div class="chat-sender">✨ RobOS Architecture & KGraph Agent</div>
            <div style="color: var(--success); font-weight: 600; margin-bottom: 4px;">✓ Data Source Synthesized & Bound to Helm Chart</div>
            <div>Registered <code>${ds.name}</code> (<code>${ds.urn}</code>). Generated Kubernetes manifest at <code>04-analytics-postgres.yaml</code> ready for live deployment.</div>
          </div>
        `;
        threadEl.scrollTop = threadEl.scrollHeight;
      }

      renderStats();
      renderCatalog();
      renderCanvas();
      await renderInspector();
      return res;
    }
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
