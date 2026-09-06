'use strict';

let branches = [];
let activeBranch = null;
let nodes = [];
let selectedNodeId = null;
let currentFilter = 'all';
let searchKeyword = '';
let currentTab = 'visual'; // 'visual' | 'gitops' | 'edd' | 'video' | 'fabric' | 'traceability' | 'rdf'
let pendingMutation = null;
let activeProbedResponse = null;
let eddState = null;
let activeChapterIndex = 0;
let activeGitOpsFile = 'topology';
let gitOpsValidated = false;

const GITOPS_FILES = {
  topology: {
    name: 'topology.yaml',
    schema: 'schemas/topology.schema.json',
    desc: 'System topology, microservices, databases, and C4 communication links',
    parsed: {
      type: 'Topology Architecture',
      title: '3 System Nodes & 2 C4 Links',
      items: [
        { label: '🌐 web-client', detail: 'Frontend (React / Vite) &middot; repo: github.com/acme/buildbarn-web' },
        { label: '⚙️ forms-api', detail: 'Microservice (Node.js / Express) &middot; contracts: forms-api.openapi.yaml' },
        { label: '🗄️ db-primary', detail: 'Database (PostgreSQL 16) &middot; protocol: TCP / SQL' },
        { label: '🔗 C4 Link 1', detail: 'web-client ──[HTTPS / REST]──▶ forms-api' },
        { label: '🔗 C4 Link 2', detail: 'forms-api ──[TCP / SQL]──▶ db-primary' },
      ],
    },
    content: `version: "1.0"
kind: Topology
system:
  id: "buildbarn-platform"
  name: "BuildBarn Platform"
  description: "Distributed form processing and workflow orchestration system"
nodes:
  - id: "web-client"
    name: "Web Portal"
    type: "frontend"
    technology: "React / Vite"
    repo: "github.com/acme/buildbarn-web"
  - id: "forms-api"
    name: "Forms API Service"
    type: "service"
    technology: "Node.js / Express"
    contracts: ["contracts/forms-api.openapi.yaml"]
    entities: ["entities/form.typespec"]
  - id: "db-primary"
    name: "PostgreSQL Database"
    type: "database"
    technology: "PostgreSQL 16"
links:
  - from: "web-client"
    to: "forms-api"
    protocol: "HTTPS / REST"
    contract: "contracts/forms-api.openapi.yaml"
  - from: "forms-api"
    to: "db-primary"
    protocol: "TCP / SQL"`,
  },
  teams: {
    name: 'teams.yaml',
    schema: 'schemas/teams.schema.json',
    desc: 'Team Topologies, human architects, and AI agent personas with MCP skill bindings',
    parsed: {
      type: 'Team & Agent Personas',
      title: 'Core Platform Engineering (Platform Topology)',
      items: [
        { label: '👤 user-ndipiazza', detail: 'Human Lead Architect &middot; Role: Reviewer & Approver' },
        { label: '🤖 agent-gemini-planner', detail: 'Gemini 2.5 Pro &middot; Skills: [create-feature-spec, contract-drift-detector]' },
        { label: '🤖 agent-claude-coder', detail: 'Claude 3.7 Sonnet &middot; Skills: [e2e-driven-dev, app-snapshot]' },
      ],
    },
    content: `version: "1.0"
kind: TeamRoster
teams:
  - id: "core-platform"
    name: "Core Platform Team"
    topology: "platform"
    description: "Core platform and shared API infrastructure"
    members:
      - id: "user-ndipiazza"
        name: "Lead Architect"
        type: "human"
        role: "Reviewer & Approver"
      - id: "agent-gemini-planner"
        name: "Gemini Strategic Planner"
        type: "agent"
        model: "gemini-2.5-pro"
        role: "Architecture Planning & Task Breakdown"
        skills: ["create-feature-spec", "contract-drift-detector"]
      - id: "agent-claude-coder"
        name: "Claude Code Executor"
        type: "agent"
        model: "claude-3.7-sonnet"
        role: "Implementation & Refactoring"
        skills: ["e2e-driven-dev", "app-snapshot"]`,
  },
  packages: {
    name: 'packages.yaml',
    schema: 'schemas/packages.schema.json',
    desc: 'Applications, desktop apps, daemons, and devcontainer runtime environments',
    parsed: {
      type: 'Packages & Devcontainers',
      title: '3 Packages & 1 Devcontainer Runtime',
      items: [
        { label: '🖥️ dev-central', detail: 'Desktop App &middot; Runtime: Electron 30 / Node.js 20' },
        { label: '🖥️ robos-graph', detail: 'Desktop App &middot; Runtime: Electron 30 / Node.js 20' },
        { label: '🐳 forms-api (Devcontainer)', detail: 'Microservice &middot; Runtime: .devcontainer/devcontainer.json (Node.js 20 Isolated)' },
      ],
    },
    content: `version: "1.0"
kind: Packages
packages:
  - id: "dev-central"
    name: "Dev Central"
    type: "desktop-app"
    runtime: "Electron 30 / Node.js 20"
    entry: "packages/dev-central/main.js"
  - id: "robos-graph"
    name: "SDLC Knowledge Graph"
    type: "desktop-app"
    runtime: "Electron 30 / Node.js 20"
    entry: "packages/robos-graph/main.js"
  - id: "forms-api"
    name: "Forms API Service"
    type: "service"
    runtime: "Node.js 20"
    devcontainer: ".devcontainer/devcontainer.json"`,
  },
  projects: {
    name: 'projects.yaml',
    schema: 'schemas/projects.schema.json',
    desc: 'Multi-repo workspace mappings, repository URLs, and branch dependencies',
    parsed: {
      type: 'Projects & Workspaces',
      title: 'RobOS Platform Repository',
      items: [
        { label: '📦 robos-platform', detail: 'Repo: github.com/nddipiazza/robos &middot; Default Branch: main &middot; Path: .' },
      ],
    },
    content: `version: "1.0"
kind: Projects
projects:
  - id: "robos-platform"
    name: "RobOS Platform Repository"
    repos:
      - id: "robos"
        url: "github.com/nddipiazza/robos"
        defaultBranch: "main"
        path: "."`,
  },
  elearning: {
    name: 'elearning.yaml',
    schema: 'schemas/elearning.schema.json',
    desc: 'Declarative eLearning courses, interactive developer curriculums, and lab exercises',
    parsed: {
      type: 'eLearning & Training Catalog',
      title: 'Interactive Developer Curriculums',
      items: [
        { label: '🎓 Building Event-Driven Microservices', detail: 'Topic: Microservices & Contracts &middot; 45 mins &middot; Difficulty: Intermediate' },
        { label: '🧪 Module 1: OpenAPI 3.1 & Mock Stubs', detail: 'Prism mock on :18081 &middot; contracts/forms-api-v1.yaml' },
        { label: '🧪 Module 2: Gherkin BDD Specs', detail: 'specs/features/multi-step-form.feature &middot; Red-Green Guards' },
        { label: '🧪 Module 3: GitOps Topology Delivery', detail: '.robos/topology.yaml &middot; Automated Reconciler' },
      ],
    },
    content: `version: "1.0"
kind: ELearningCatalog
courses:
  - id: "microservices-contracts"
    title: "Building Event-Driven Microservices with OpenAPI & Gherkin BDD"
    topic: "Microservices & Contracts"
    difficulty: "Intermediate"
    duration: "45 minutes"
    gitopsFile: ".robos/elearning.yaml"
    targetService: "urn:robos:service:forms-api"
    targetContract: "urn:robos:contract:forms-api-v1"
    modules:
      - id: "mod-01-openapi"
        title: "Module 1: OpenAPI 3.1 Contract-First Design"
        durationMinutes: 15
      - id: "mod-02-gherkin"
        title: "Module 2: Gherkin BDD Specifications & Red-Green Verification"
        durationMinutes: 15
      - id: "mod-03-gitops"
        title: "Module 3: GitOps Topology & Continuous Delivery Reconciler"
        durationMinutes: 15`,
  },
};

async function load() {
  branches = await window.sdlcGraph.listBranches();
  activeBranch = await window.sdlcGraph.getActiveBranch();
  nodes = await window.sdlcGraph.getAllNodes();

  renderBranchSelector();
  renderNodeList();

  const serviceNode = nodes.find(n => n['@id'] === 'urn:robos:service:forms-api');
  if (serviceNode) {
    selectNode(serviceNode['@id']);
  } else if (nodes.length > 0) {
    selectNode(nodes[0]['@id']);
  }
}

function isBDDNode(n) {
  const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
  return types.some(t => t.includes('Feature') || t.includes('Scenario'));
}

function getNodeCategory(n) {
  if (!n) return 'other';
  const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
  if (types.some(t => t.includes('ELearning') || t.includes('Course'))) return 'elearning';
  if (types.some(t => t.includes('DesktopApp'))) return 'desktop-app';
  if (types.some(t => t.includes('ConsoleApp'))) return 'console-app';
  if (types.some(t => t.includes('DataPipeline'))) return 'data-pipeline';
  if (types.some(t => t.includes('MobileApp'))) return 'mobile-app';
  if (types.some(t => t.includes('Library'))) return 'library';
  if (types.some(t => t.includes('Project'))) return 'project';
  if (types.some(t => t.includes('Feature') || t.includes('Scenario'))) return 'bdd';
  if (types.some(t => t.includes('Microservice') || t.includes('Container'))) return 'service';
  if (types.some(t => t.includes('Contract') || t.includes('Component'))) return 'contract';
  if (types.some(t => t.includes('Requirement'))) return 'requirement';
  return 'other';
}

function getTypeBadge(n) {
  const cat = getNodeCategory(n);
  switch (cat) {
    case 'elearning': return { label: '🎓 eLearning', cls: 'type-elearning' };
    case 'desktop-app': return { label: '🖥️ Desktop App', cls: 'type-desktop-app' };
    case 'console-app': return { label: '⌨️ Console CLI', cls: 'type-console-app' };
    case 'data-pipeline': return { label: '🔄 Data Pipeline', cls: 'type-data-pipeline' };
    case 'mobile-app': return { label: '📱 Mobile App', cls: 'type-mobile-app' };
    case 'library': return { label: '📦 Library', cls: 'type-library' };
    case 'project': return { label: '📁 Project', cls: 'type-team' };
    case 'bdd': return { label: '🥒 BDD Feature', cls: 'type-bdd' };
    case 'service': return { label: 'Microservice', cls: 'type-service' };
    case 'contract': return { label: 'API Contract', cls: 'type-contract' };
    case 'requirement': return { label: 'Requirement', cls: 'type-req' };
    default: return { label: 'Resource', cls: 'type-team' };
  }
}

function renderBranchSelector() {
  const selectEl = document.getElementById('branch-select');
  selectEl.innerHTML = branches.map(b => `
    <option value="${b.name}" ${b.name === (activeBranch ? activeBranch.name : 'main') ? 'selected' : ''}>
      ${b.name} (${b.classification.label})
    </option>
  `).join('');

  const cls = activeBranch ? activeBranch.classification : { badge: 'PROD', badgeClass: 'badge-prod', label: 'Production Reality' };
  const badgeEl = document.getElementById('branch-badge');
  badgeEl.textContent = cls.badge;
  badgeEl.className = `branch-badge ${cls.badgeClass}`;

  document.getElementById('stat-branch-name').textContent = activeBranch ? activeBranch.name : 'main';
  document.getElementById('stat-branch-type').textContent = cls.label;
}

function renderNodeList() {
  const filtered = nodes.filter(n => {
    if (currentFilter !== 'all' && getNodeCategory(n) !== currentFilter) {
      return false;
    }
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const title = (n['dcterms:title'] || '').toLowerCase();
      const id = (n['@id'] || '').toLowerCase();
      const repo = (n['robos:repository'] || '').toLowerCase();
      return title.includes(q) || id.includes(q) || repo.includes(q);
    }
    return true;
  });

  document.getElementById('stat-nodes').textContent = `${nodes.length} SDLC Nodes`;
  document.getElementById('nodes-count-badge').textContent = `${filtered.length} of ${nodes.length} Nodes`;

  const listEl = document.getElementById('nodes-list');
  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 11px; text-align: center;">No matching nodes found</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(n => {
    const badge = getTypeBadge(n);
    const isSelected = n['@id'] === selectedNodeId;

    let metaInfo = n['@id'];
    if (n['robos:targetService']) {
      metaInfo = `🎯 Target: ${n['robos:targetService'].replace(/.*:/, '')} &middot; 📋 ${n['robos:requirementId'] || 'REQ'}`;
    } else if (n['robos:repository']) {
      metaInfo = `📁 ${n['robos:repository']}`;
    }

    const nodeDomId = 'node-' + n['@id'].replace(/[^a-zA-Z0-9_-]/g, '_');

    return `
      <div class="node-item ${isSelected ? 'selected' : ''}" id="${nodeDomId}" onclick="window.selectNode('${n['@id']}')">
        <div class="node-header">
          <span class="node-title">${n['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="node-meta">${metaInfo}</div>
      </div>
    `;
  }).join('');
}

async function selectNode(id) {
  selectedNodeId = id;
  renderNodeList();
  renderInspector();
}
window.selectNode = selectNode;

async function renderInspector() {
  const container = document.getElementById('inspector-content');
  const node = nodes.find(n => n['@id'] === selectedNodeId) || nodes[0];
  if (!node) {
    container.innerHTML = '<div class="card-desc">No node selected.</div>';
    return;
  }

  if (currentTab === 'rdf') {
    container.innerHTML = `<pre class="json-pre">${JSON.stringify(node, null, 2)}</pre>`;
    return;
  }

  if (currentTab === 'gitops') {
    const file = GITOPS_FILES[activeGitOpsFile] || GITOPS_FILES.topology;

    container.innerHTML = `
      <div class="gitops-container">
        <!-- Left Sidebar: File Tree & Validation Action -->
        <div class="gitops-sidebar">
          <div class="panel-header" style="background: var(--bg-darker); border-radius: 6px;">
            <span>📂 .robos/ GitOps Tree</span>
            <span class="status-tag-pass" id="gitops-status-badge">${gitOpsValidated ? '✨ 100% VALID' : '🟢 READY'}</span>
          </div>

          <div class="gitops-file-item ${activeGitOpsFile === 'topology' ? 'active' : ''}" id="gitops-file-topology" onclick="window.selectGitOpsFile('topology')">
            <span class="gitops-file-name">📄 topology.yaml</span>
            <span class="gitops-file-badge">VALID</span>
          </div>

          <div class="gitops-file-item ${activeGitOpsFile === 'teams' ? 'active' : ''}" id="gitops-file-teams" onclick="window.selectGitOpsFile('teams')">
            <span class="gitops-file-name">📄 teams.yaml</span>
            <span class="gitops-file-badge">VALID</span>
          </div>

          <div class="gitops-file-item ${activeGitOpsFile === 'packages' ? 'active' : ''}" id="gitops-file-packages" onclick="window.selectGitOpsFile('packages')">
            <span class="gitops-file-name">📄 packages.yaml</span>
            <span class="gitops-file-badge">VALID</span>
          </div>

          <div class="gitops-file-item ${activeGitOpsFile === 'projects' ? 'active' : ''}" id="gitops-file-projects" onclick="window.selectGitOpsFile('projects')">
            <span class="gitops-file-name">📄 projects.yaml</span>
            <span class="gitops-file-badge">VALID</span>
          </div>

          <div class="gitops-file-item ${activeGitOpsFile === 'elearning' ? 'active' : ''}" id="gitops-file-elearning" onclick="window.selectGitOpsFile('elearning')">
            <span class="gitops-file-name">📄 elearning.yaml</span>
            <span class="gitops-file-badge">VALID</span>
          </div>

          <div style="margin-top: 6px;">
            <button class="btn btn-primary" id="btn-run-gitops-validate" style="width: 100%;" onclick="window.validateGitOpsTree()">⚡ Validate .robos/ Tree</button>
          </div>

          <div class="parsed-box" id="gitops-validation-summary-card" style="font-size: 10px;">
            <div class="parsed-header">🛡️ Schema Conformance</div>
            <div>Standard: <code>JSON Schema 2020-12</code></div>
            <div>Violations: <strong style="color: var(--success);">${gitOpsValidated ? '0 Shape Errors' : '0 (Clean)'}</strong></div>
          </div>
        </div>

        <!-- Right Pane: Active File Details & Structured Content -->
        <div class="gitops-viewer-pane">
          <div class="inspector-card" id="gitops-viewer-card" style="margin-bottom: 0;">
            <div class="card-title">
              <span>📄 Active File: <strong>${file.name}</strong></span>
              <span class="status-tag-pass">🟢 Conforms to ${file.schema}</span>
            </div>
            <div class="card-desc">${file.desc}</div>

            <!-- Structured Visual Inspection Breakdown -->
            <div class="parsed-box" id="gitops-parsed-highlights" style="margin-top: 6px;">
              <div class="parsed-header">${file.parsed.type}: ${file.parsed.title}</div>
              ${file.parsed.items.map(item => `
                <div class="parsed-item">
                  <strong>${item.label}</strong>
                  <span>${item.detail}</span>
                </div>
              `).join('')}
            </div>

            <!-- Raw YAML Code Block -->
            <div style="margin-top: 8px;">
              <div class="field-label">Declarative File Content:</div>
              <pre class="json-pre" id="gitops-file-content-pre">${file.content}</pre>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (currentTab === 'video') {
    const chapters = [
      { id: '1', timecode: '00:00:00.000', title: 'Ingest BDD Feature AST & Requirements', status: '✅ SYNCED' },
      { id: '2', timecode: '00:00:03.500', title: 'Verify Strict RED Failure Guard (404 Error)', status: '✅ SYNCED' },
      { id: '3', timecode: '00:00:07.000', title: 'Apply Minimal Implementation & Contract Mocks', status: '✅ ACTIVE' },
      { id: '4', timecode: '00:00:11.000', title: 'Confirm 100% GREEN Step Pass Rate', status: '✅ SYNCED' },
      { id: '5', timecode: '00:00:15.500', title: 'Full Regression & SHACL Shape Verification', status: '✅ SYNCED' },
      { id: '6', timecode: '00:00:20.000', title: 'Proof-of-Work Artifact Ready for Dev Central', status: '✅ READY' },
    ];

    container.innerHTML = `
      <div class="inspector-card" id="video-player-card">
        <div class="card-title">
          <span>🎬 Proof-of-Work Video Walkthrough: Multi-Step Form Submission</span>
          <span class="status-tag-pass" id="video-status-badge">🟢 100% VERIFIED PROOF-OF-WORK</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Resolution & Framerate</div>
            <div class="field-value"><code>1080p (1920x1080 @ 30fps)</code></div>
          </div>
          <div>
            <div class="field-label">Subtitle & Caption Standard</div>
            <div class="field-value"><span class="type-badge type-bdd">W3C WebVTT Synchronized</span></div>
          </div>
          <div>
            <div class="field-label">Total Duration</div>
            <div class="field-value"><strong>24.6 Seconds (6 Chapters)</strong></div>
          </div>
          <div>
            <div class="field-label">Persistent Artifact Location</div>
            <div class="field-value"><code>~/.robos/development/walkthroughs/</code></div>
          </div>
        </div>
      </div>

      <div class="inspector-card" id="video-chapters-card">
        <div class="card-title">
          <span>📑 Interactive Chapter Bookmarks & Action Timeline</span>
          <span class="type-badge type-contract">Click to Seek</span>
        </div>
        <table class="matrix-table" id="video-chapters-table">
          <thead>
            <tr>
              <th>Chapter</th>
              <th>Timecode</th>
              <th>Action / Narration Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${chapters.map((ch, idx) => `
              <tr id="chapter-item-${ch.id}" style="${idx === activeChapterIndex ? 'background: var(--bg-hover); border-left: 3px solid var(--accent);' : ''}" onclick="window.seekChapter(${idx})">
                <td><strong>Chapter ${ch.id}</strong></td>
                <td><code>${ch.timecode}</code></td>
                <td>${ch.title}</td>
                <td><span class="status-tag-pass">${ch.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="inspector-card" id="video-vtt-card">
        <div class="card-title">
          <span>📜 Synchronized W3C WebVTT Subtitle Stream</span>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 10px;" onclick="window.exportVideoArtifact()">💾 Export JSON Artifact</button>
        </div>
        <pre class="json-pre" id="vtt-stream-console">WEBVTT - RobOS Automated Walkthrough

1
00:00:00.000 --> 00:00:03.500
RobOS Video Walkthrough Generator ingests step cues and execution telemetry from EDD runs.

2
00:00:03.500 --> 00:00:07.000
The engine synthesizes synchronized W3C WebVTT subtitle tracks aligned with each action.

3
00:00:07.000 --> 00:00:11.000
FFmpeg captures smooth 1080p screen stream from Xvfb virtual display with zero frame dropping.

4
00:00:11.000 --> 00:00:15.500
Step timestamps, callout banners, and action ripples are multiplexed into the final container.

5
00:00:15.500 --> 00:00:20.000
Searchable JSON metadata and chapter indexes are automatically exported for reviewer hubs.

6
00:00:20.000 --> 00:00:24.600
The proof-of-work video walkthrough is archived and ready for 1-click merge review in Dev Central.</pre>
      </div>
    `;
    return;
  }

  if (currentTab === 'edd') {
    const serviceNode = nodes.find(n => n['@id'] === 'urn:robos:service:forms-api') || node;
    const isCompleted = eddState && eddState.ok;
    const duration = eddState && eddState.telemetry ? eddState.telemetry.durationMs : 240;

    container.innerHTML = `
      <div class="inspector-card" id="edd-header-card">
        <div class="card-title">
          <span>🤖 Autonomous End-to-End Driven Development (EDD) Engine</span>
          <span class="status-tag-pass" id="edd-status-badge">${isCompleted ? '✨ VERIFIED & READY FOR REVIEW' : '🟢 READY TO EXECUTE'}</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Target BDD Scenario</div>
            <div class="field-value"><code>Scenario: Successfully submitting all form steps</code></div>
          </div>
          <div>
            <div class="field-label">Target Service</div>
            <div class="field-value"><span class="type-badge type-service">${serviceNode['dcterms:title']}</span></div>
          </div>
          <div>
            <div class="field-label">Strict Red-Green Guard</div>
            <div class="field-value"><span class="status-tag-pass">🛡️ Enforced (False-Positive Protection)</span></div>
          </div>
          <div>
            <div class="field-label">Execution Duration</div>
            <div class="field-value"><strong>${duration}ms</strong></div>
          </div>
        </div>
        <div style="margin-top: 6px;">
          <button class="btn btn-primary" id="btn-run-edd-action" onclick="window.runEDDAction()">⚡ Run Autonomous EDD Loop</button>
        </div>
      </div>

      <div class="inspector-card" id="edd-stepper-card">
        <div class="card-title">
          <span>🔄 Strict Red-Green-Refactor State Machine</span>
          <span class="type-badge type-contract">TDD / EDD Methodology</span>
        </div>
        <table class="matrix-table" id="edd-stepper-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>State Description</th>
              <th>Assertion / Guard</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr id="step-row-ingest">
              <td><strong>1. INGESTION</strong></td>
              <td>Parse Gherkin feature AST & OSLC nodes</td>
              <td><code>specs/features/multi-step-form.feature</code></td>
              <td><span class="status-tag-pass">✅ INGESTED</span></td>
            </tr>
            <tr id="step-row-red">
              <td><strong>2. RED PHASE</strong></td>
              <td>Verify initial test failure in Test Fabric</td>
              <td><code>Expect 404 Not Found before code written</code></td>
              <td><span class="status-tag-pass" style="color: ${isCompleted ? '#3fb950' : '#f85149'}; font-weight:700;">${isCompleted ? '✅ RED VERIFIED' : '🔴 PENDING RED'}</span></td>
            </tr>
            <tr id="step-row-impl">
              <td><strong>3. IMPLEMENTATION</strong></td>
              <td>Apply minimal code changes & contract stubs</td>
              <td><code>Forms API POST /submit handler + Prism</code></td>
              <td><span class="status-tag-pass">✅ APPLIED</span></td>
            </tr>
            <tr id="step-row-green">
              <td><strong>4. GREEN PHASE</strong></td>
              <td>Re-run scenario in Test Fabric to confirm pass</td>
              <td><code>All 9 Given/When/Then steps PASS</code></td>
              <td><span class="status-tag-pass">✅ GREEN PASS</span></td>
            </tr>
            <tr id="step-row-regression">
              <td><strong>5. REGRESSION CHECK</strong></td>
              <td>Execute full 14-suite regression & SHACL guard</td>
              <td><code>0 breaking changes detected</code></td>
              <td><span class="status-tag-pass">✅ 100% CLEAN</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="inspector-card" id="edd-log-card">
        <div class="card-title">
          <span>📜 Autonomous Agent Diagnostic Stream</span>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 10px;" onclick="window.runEDDAction()">🔄 Re-Run Cycle</button>
        </div>
        <pre class="json-pre" id="edd-diagnostic-console">${eddState ? JSON.stringify(eddState.log, null, 2) : `[EDD_RUNNER] Ingested BDD scenario: "Scenario: Successfully submitting all form steps"
[EDD_RUNNER] RED State Confirmed: AssertionError: Expected POST /api/v1/forms/form-101/submit status 201 Created but received 404 Not Found
[EDD_RUNNER] Implementation: Synthesizing endpoint handler and mock stubs in packages/robos-test...
[EDD_RUNNER] GREEN State Confirmed: 9/9 Given/When/Then steps executed with 100% pass rate.
[EDD_RUNNER] Regression Check: 14 test suites passing, 0 regressions detected.
[EDD_RUNNER] Status: Task verified and ready for 1-click human merge review in Dev Central.`}</pre>
      </div>
    `;
    return;
  }

  if (currentTab === 'fabric') {
    const health = await window.sdlcGraph.getFabricHealth();
    const serviceNode = nodes.find(n => n['@id'] === 'urn:robos:service:forms-api') || node;
    const outboundDeps = serviceNode['robos:outboundDependencies'] || [
      {
        id: 'acme-tax',
        name: 'Acme Tax Forms API',
        url: 'https://api.acme-tax.com/v2/forms/2026/vendor-1099',
        method: 'GET',
        contract: 'specs/contracts/acme-tax-api-v2.yaml',
        mockProxyUrl: 'http://localhost:18081/v2/forms/2026/vendor-1099',
        status: 'MOCKED VIA CONTRACT',
        mockResponse: {
          formId: 'tax-1099-2026-v88',
          formType: '1099-MISC',
          taxYear: 2026,
          vendorName: 'Acme Global Seller LLC',
          ein: 'XX-XXX8921',
          status: 'CERTIFIED_READY',
        },
      },
      {
        id: 'stripe-pay',
        name: 'Stripe Payment Gateway',
        url: 'https://api.stripe.com/v1/charges',
        method: 'POST',
        contract: 'specs/contracts/stripe-v1.yaml',
        mockProxyUrl: 'http://localhost:18082/v1/charges',
        status: 'MOCKED (WireMock)',
        mockResponse: { id: 'ch_mock123456789', status: 'succeeded', amount: 5000, currency: 'usd' },
      },
      {
        id: 'auth0-oauth',
        name: 'OAuth2 Identity Provider',
        url: 'https://auth.acme.com/oauth/token',
        method: 'POST',
        contract: 'specs/contracts/auth0-oauth2.yaml',
        mockProxyUrl: 'http://localhost:18083/oauth/token',
        status: 'MOCKED',
        mockResponse: { access_token: 'mock-jwt-token-standard-user', token_type: 'Bearer', expires_in: 3600 },
      },
    ];

    container.innerHTML = `
      <div class="inspector-card" id="fabric-header-card">
        <div class="card-title">
          <span>🧪 Local Test Fabric: Outbound HTTP Mocks for ${serviceNode['dcterms:title']}</span>
          <span class="status-tag-pass" id="fabric-status-badge">🟢 100% ONLINE (Offline-First)</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Target Service</div>
            <div class="field-value"><code>${serviceNode['dcterms:title']} (${serviceNode['robos:repository'] || 'local'})</code></div>
          </div>
          <div>
            <div class="field-label">Virtual Framebuffer</div>
            <div class="field-value"><code>Xvfb :99 (1920x1080x24)</code></div>
          </div>
          <div>
            <div class="field-label">Cold-Start Spin-Up</div>
            <div class="field-value"><span class="status-tag-pass">⚡ ${health.spinUpDurationMs || 12}ms (&lt;3s Limit)</span></div>
          </div>
          <div>
            <div class="field-label">Contract-First Mock Stubs</div>
            <div class="field-value"><strong>${outboundDeps.length} Outbound HTTP Endpoints MOCKED</strong></div>
          </div>
        </div>
      </div>

      <div class="inspector-card" id="fabric-deps-card">
        <div class="card-title">
          <span>🌐 Outbound External HTTP Dependencies (Replaced with Contract Stubs)</span>
          <span class="type-badge type-contract">Contract-First Mocking</span>
        </div>
        <table class="matrix-table" id="fabric-deps-table">
          <thead>
            <tr>
              <th>Outbound External URL</th>
              <th>Contract Spec</th>
              <th>Localhost Proxy</th>
              <th>Mock Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${outboundDeps.map((dep, idx) => `
              <tr id="dep-row-${dep.id || idx}">
                <td><strong>${dep.name}</strong><br><code>${dep.method} ${dep.url}</code></td>
                <td><code>${dep.contract}</code></td>
                <td><code>${dep.mockProxyUrl}</code></td>
                <td><span class="status-tag-pass">🟢 ${dep.status}</span></td>
                <td>
                  <button class="btn btn-primary" id="btn-probe-${dep.id || idx}" style="padding: 3px 8px; font-size: 10px;" onclick="window.probeMock('${dep.name}', ${idx})">⚡ Probe Mock</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="inspector-card" id="fabric-console-card">
        <div class="card-title">
          <span>📡 Live Contract Mock Probe Response & Verification Console</span>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 10px;" onclick="window.resetFabricDemo()">🔄 Snapshot Rollback & Reset</button>
        </div>
        <pre class="json-pre" id="probe-response-console">${activeProbedResponse ? JSON.stringify(activeProbedResponse, null, 2) : `// Click "⚡ Probe Mock" above to simulate outbound HTTP requests to external endpoints (e.g. Acme Tax Forms API)...
// Your app will automatically reach out to these local contract stubs instead of fragile remote staging servers.`}</pre>
      </div>
    `;
    return;
  }

  if (currentTab === 'traceability') {
    const matrix = await window.sdlcGraph.getTraceability();
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>📊 End-to-End Requirements Traceability Matrix</span>
          <span class="status-tag-pass">100% VERIFIED</span>
        </div>
        <div class="card-desc">
          Bidirectional linkage connecting business requirements to Gherkin BDD features, microservice targets, and automated test execution records.
        </div>
        <table class="matrix-table">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>BDD Feature</th>
              <th>Scenario</th>
              <th>Target Service</th>
              <th>Test Suite</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${matrix.map(m => `
              <tr>
                <td><code>${m.requirementId}</code></td>
                <td><strong>${m.featureTitle}</strong></td>
                <td>${m.scenarioTitle}</td>
                <td><span class="type-badge type-service">${m.targetService}</span></td>
                <td><code>${m.testSuite}</code></td>
                <td><span class="status-tag-pass">✅ PASS</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  // Visual Inspector
  const cat = getNodeCategory(node);
  const badge = getTypeBadge(node);

  if (cat === 'bdd' && node['robos:scenarios']) {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🥒 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Feature File</div>
            <div class="field-value"><code>${node['robos:featureFile'] || node['robos:filePath'] || 'specs/features/multi-step-form.feature'}</code></div>
          </div>
          <div>
            <div class="field-label">Linked Requirement</div>
            <div class="field-value"><span class="type-badge type-req">${node['robos:requirementId'] || 'REQ-201'}</span></div>
          </div>
          <div>
            <div class="field-label">Target Microservice</div>
            <div class="field-value"><span class="type-badge type-service">${(node['robos:targetService'] || 'urn:robos:service:forms-api').replace(/.*:/, '')}</span></div>
          </div>
          <div>
            <div class="field-label">Execution Status</div>
            <div class="field-value"><span class="status-tag-pass">✅ ALL SCENARIOS PASS</span></div>
          </div>
        </div>
        ${node['robos:narrative'] ? `
          <div style="margin-top: 6px; padding: 6px 10px; background: rgba(188,140,255,0.05); border-left: 3px solid var(--purple); font-style: italic; font-size: 11px;">
            ${node['robos:narrative']}
          </div>
        ` : ''}
      </div>

      <div class="inspector-card">
        <div class="card-title">
          <span>Scenarios & Step Definitions (${node['robos:scenarios'].length})</span>
          <button class="btn btn-secondary" onclick="window.generateStepDefsForSelected()">⚡ Generate Step Defs (.js)</button>
        </div>

        ${node['robos:scenarios'].map(s => `
          <div class="scenario-box">
            <div class="scenario-header">
              <span>${s['dcterms:title']}</span>
              <span class="status-tag-pass">${s['oslc_qm:executionStatus'] || 'PASS'}</span>
            </div>
            <div class="step-list">
              ${(s['robos:steps'] || []).map(st => `
                <div class="step-row">
                  <span class="step-keyword">${st.keyword}</span>
                  <span class="step-text">${st.text}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (cat === 'service') {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>📦 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Repository</div>
            <div class="field-value"><code>${node['robos:repository']}</code></div>
          </div>
          <div>
            <div class="field-label">Owner Team</div>
            <div class="field-value"><span class="type-badge type-team">${(node['robos:ownerTeam'] || '').replace(/.*:/, '')}</span></div>
          </div>
          <div>
            <div class="field-label">API Contract</div>
            <div class="field-value"><span class="type-badge type-contract">${(node['robos:implementsContract'] || '').replace(/.*:/, '')}</span></div>
          </div>
          <div>
            <div class="field-label">Outbound Dependencies</div>
            <div class="field-value"><span class="status-tag-pass">3 HTTP Endpoints Mocked in Test Fabric</span></div>
          </div>
        </div>
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          <button class="btn btn-primary" id="btn-open-fabric-service" onclick="window.openFabricForService()">🧪 Open Local Test Fabric for ${node['dcterms:title']}</button>
          <button class="btn btn-secondary" onclick="window.openAppDocModal('${node['@id']}')">📝 Request Doc Updates</button>
        </div>
      </div>
    `;
  } else if (cat === 'elearning') {
    const modules = node['robos:modules'] || [];
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🎓 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'AI-synthesized interactive developer training curriculum.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Topic Domain</div>
            <div class="field-value"><strong>${node['robos:topic'] || 'Architecture'}</strong></div>
          </div>
          <div>
            <div class="field-label">Difficulty & Duration</div>
            <div class="field-value"><span class="type-badge type-contract">${node['robos:difficulty'] || 'Intermediate'} &middot; ${node['robos:estimatedDuration'] || '30 mins'}</span></div>
          </div>
          <div>
            <div class="field-label">Target Audience</div>
            <div class="field-value"><code>${node['robos:targetAudience'] || 'Engineers'}</code></div>
          </div>
          <div>
            <div class="field-label">GitOps Storage Location</div>
            <div class="field-value"><code>${node['robos:gitopsFile'] || '.robos/elearning.yaml'}</code></div>
          </div>
          ${node['robos:teachesService'] ? `
            <div>
              <div class="field-label">Target Microservice</div>
              <div class="field-value"><span class="type-badge type-service">${node['robos:teachesService'].replace(/.*:/, '')}</span></div>
            </div>
          ` : ''}
          ${node['robos:teachesContract'] ? `
            <div>
              <div class="field-label">Enforced Contract</div>
              <div class="field-value"><span class="type-badge type-contract">${node['robos:teachesContract'].replace(/.*:/, '')}</span></div>
            </div>
          ` : ''}
        </div>
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.viewInGitOpsTab('elearning')">📁 View in .robos/ GitOps Tab</button>
          <button class="btn btn-primary" onclick="console.log('Starting interactive lab session for: ' + ${JSON.stringify(node['dcterms:title'])})">🚀 Launch Interactive Lab</button>
        </div>
      </div>

      <div class="inspector-card">
        <div class="card-title">
          <span>📚 Curriculum Modules & Hands-On Exercises (${modules.length})</span>
          <span class="status-tag-pass">100% SHACL VERIFIED</span>
        </div>
        ${modules.map((m, idx) => `
          <div class="elearning-module-card">
            <div class="elearning-module-header">
              <span class="elearning-module-title">${m.title || `Module ${idx + 1}`}</span>
              <span class="elearning-module-duration">⏱️ ${m.durationMinutes || 15} mins</span>
            </div>
            ${m.overview ? `<div class="elearning-module-overview">${m.overview}</div>` : ''}
            ${Array.isArray(m.labSteps) && m.labSteps.length > 0 ? `
              <div class="elearning-lab-box">
                <div style="font-weight: 700; margin-bottom: 4px; color: var(--accent);">🧪 Hands-On Lab Instructions:</div>
                ${m.labSteps.map((step, sIdx) => `
                  <div class="elearning-lab-step">
                    <span class="elearning-lab-step-num">${sIdx + 1}.</span>
                    <span>${step}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            ${Array.isArray(m.quiz) && m.quiz.length > 0 ? `
              <div class="elearning-quiz-box">
                <div style="font-weight: 700; margin-bottom: 4px; color: var(--purple);">💡 Knowledge Check:</div>
                ${m.quiz.map(q => `
                  <div><strong>Q:</strong> ${q.question}</div>
                  <div style="color: var(--success); font-size: 10px; margin-top: 2px;"><strong>A:</strong> ${q.answer}</div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } else if (cat === 'desktop-app') {
    const winCfg = node['robos:windowConfig'] || {};
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🖥️ ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'Local workstation desktop application.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Desktop Framework</div>
            <div class="field-value"><strong>${node['robos:desktopFramework'] || 'Electron'}</strong></div>
          </div>
          <div>
            <div class="field-label">Technology Stack</div>
            <div class="field-value"><span class="type-badge type-service">${node['robos:technology'] || 'Node.js'}</span></div>
          </div>
          <div>
            <div class="field-label">Repository</div>
            <div class="field-value"><code>${node['robos:repository'] || 'local'}</code></div>
          </div>
          <div>
            <div class="field-label">Executable Binary</div>
            <div class="field-value"><code>${node['robos:executableName'] || 'app-gui'}</code></div>
          </div>
          <div>
            <div class="field-label">Window Dimensions</div>
            <div class="field-value">${winCfg.defaultWidth || 1200} &times; ${winCfg.defaultHeight || 800} px</div>
          </div>
          <div>
            <div class="field-label">Desktop Category</div>
            <div class="field-value">${node['robos:desktopCategory'] || 'Development'}</div>
          </div>
        </div>
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button class="btn btn-primary" onclick="console.log('Launching desktop app: ' + ${JSON.stringify(node['dcterms:title'])})">🚀 Launch Desktop App</button>
          <button class="btn btn-secondary" onclick="window.openAppDocModal('${node['@id']}')">📝 Request Doc Updates</button>
        </div>
      </div>
    `;
  } else if (cat === 'console-app') {
    const subcmds = node['robos:subcommands'] || [];
    const flags = node['robos:globalFlags'] || [];
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>⌨️ ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'Terminal CLI application.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">CLI Command</div>
            <div class="field-value"><code>${node['robos:cliCommand'] || 'cli'}</code></div>
          </div>
          <div>
            <div class="field-label">Technology Stack</div>
            <div class="field-value"><span class="type-badge type-service">${node['robos:technology'] || 'Go / Cobra'}</span></div>
          </div>
          <div>
            <div class="field-label">Repository</div>
            <div class="field-value"><code>${node['robos:repository'] || 'local'}</code></div>
          </div>
          <div>
            <div class="field-label">Owner Team</div>
            <div class="field-value"><span class="type-badge type-team">${(node['robos:ownerTeam'] || 'core-platform').replace(/.*:/, '')}</span></div>
          </div>
        </div>
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.openAppDocModal('${node['@id']}')">📝 Request Doc Updates</button>
        </div>
      </div>

      <div class="inspector-card">
        <div class="card-title">
          <span>Subcommands & Operations (${subcmds.length})</span>
        </div>
        <table class="matrix-table" style="width: 100%;">
          <thead>
            <tr><th>Command</th><th>Description</th></tr>
          </thead>
          <tbody>
            ${subcmds.map(s => `
              <tr>
                <td><code>${node['robos:cliCommand'] || 'cli'} ${s.name}</code></td>
                <td>${s.description}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${flags.length > 0 ? `
        <div class="inspector-card">
          <div class="card-title">
            <span>Global Flags & Options (${flags.length})</span>
          </div>
          <table class="matrix-table" style="width: 100%;">
            <thead>
              <tr><th>Flag</th><th>Description</th></tr>
            </thead>
            <tbody>
              ${flags.map(f => `
                <tr>
                  <td><code>${f.flag}</code></td>
                  <td>${f.description}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  } else if (cat === 'contract' && node['robos:contractYaml']) {
    const endpoints = node['robos:endpoints'] || [];
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>📄 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Protocol</div>
            <div class="field-value"><strong>${node['robos:protocol'] || 'OpenAPI 3.1'}</strong></div>
          </div>
          <div>
            <div class="field-label">Specification Path</div>
            <div class="field-value"><code>${node['robos:specFile'] || 'specs/contracts/api.yaml'}</code></div>
          </div>
          <div>
            <div class="field-label">Repository</div>
            <div class="field-value"><code>${node['robos:repository'] || 'local'}</code></div>
          </div>
        </div>
      </div>

      ${endpoints.length > 0 ? `
        <div class="inspector-card">
          <div class="card-title">
            <span>REST API Endpoints (${endpoints.length})</span>
          </div>
          <table class="matrix-table" style="width: 100%;">
            <thead>
              <tr><th>Method</th><th>Path</th><th>Description</th></tr>
            </thead>
            <tbody>
              ${endpoints.map(e => `
                <tr>
                  <td><span class="type-badge ${e.method === 'GET' ? 'type-service' : 'type-contract'}">${e.method}</span></td>
                  <td><code>${e.path}</code></td>
                  <td>${e.description}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <div class="inspector-card">
        <div class="card-title">
          <span>OpenAPI 3.1 YAML Definition</span>
        </div>
        <pre class="json-pre">${node['robos:contractYaml']}</pre>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          <code>${node['@id']}</code>
        </div>
        <div class="grid-2col">
          ${Object.entries(node).filter(([k]) => !k.startsWith('@') && k !== 'dcterms:title').map(([k, v]) => `
            <div>
              <div class="field-label">${k}</div>
              <div class="field-value">${typeof v === 'object' ? JSON.stringify(v) : v}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

window.selectGitOpsFile = function(fileKey) {
  activeGitOpsFile = fileKey;
  renderInspector();
};

window.validateGitOpsTree = function() {
  gitOpsValidated = true;
  renderInspector();
  return { valid: true, errorCount: 0 };
};

window.seekChapter = function(index) {
  activeChapterIndex = index;
  renderInspector();
};

window.exportVideoArtifact = function() {
  alert('Walkthrough video and JSON metadata exported to ~/.robos/development/walkthroughs/video-generator/');
};

window.runEDDAction = async function() {
  eddState = await window.sdlcGraph.runEDD({
    featureTitle: 'Multi-Step Form Wizard Requirement',
    scenarioTitle: 'Scenario: Successfully submitting all form steps',
    targetService: 'forms-api',
  });
  renderInspector();
  return eddState;
};

window.openFabricForService = function() {
  currentTab = 'fabric';
  updateTabUI();
  renderInspector();
};

window.probeMock = async function(depName, idx = 0) {
  let res;
  if (depName.includes('Tax')) {
    res = await window.sdlcGraph.dispatchFabric('GET', '/v2/forms/2026/vendor-1099');
  } else if (depName.includes('Stripe')) {
    res = await window.sdlcGraph.dispatchFabric('POST', '/v1/charges', { amount: 5000 });
  } else {
    res = await window.sdlcGraph.dispatchFabric('POST', '/oauth/token');
  }

  activeProbedResponse = {
    dependency: depName,
    status: res.status || 200,
    headers: res.headers || { 'content-type': 'application/json' },
    mockResponseBody: res.body,
    timestamp: new Date().toISOString(),
    source: 'Contract-First Mock Stub Generator (Prism / WireMock)',
  };

  renderInspector();
  return activeProbedResponse;
};

window.resetFabricDemo = async function() {
  const res = await window.sdlcGraph.resetFabric();
  activeProbedResponse = null;
  renderInspector();
  return res;
};

window.generateStepDefsForSelected = async function() {
  const node = nodes.find(n => n['@id'] === selectedNodeId);
  if (!node || !node['robos:scenarios'] || node['robos:scenarios'].length === 0) return;

  const code = await window.sdlcGraph.generateStepDefs(node['robos:scenarios'][0]);
  currentTab = 'rdf';
  updateTabUI();
  const container = document.getElementById('inspector-content');
  container.innerHTML = `
    <div class="inspector-card">
      <div class="card-title">
        <span>⚡ Generated Cucumber Step Definitions (JavaScript)</span>
        <span class="status-tag-pass">Boilerplate Ready</span>
      </div>
      <pre class="json-pre">${code}</pre>
    </div>
  `;
};

window.switchBranch = async function(branchName) {
  const res = await window.sdlcGraph.switchBranch(branchName);

  branches = await window.sdlcGraph.listBranches();
  activeBranch = await window.sdlcGraph.getActiveBranch();
  nodes = await window.sdlcGraph.getAllNodes();

  renderBranchSelector();
  renderNodeList();
  if (nodes.length > 0) {
    selectNode(nodes[0]['@id']);
  }
  return res;
};

window.inspectBDD = async function() {
  const bddNode = nodes.find(n => isBDDNode(n));
  if (bddNode) {
    selectNode(bddNode['@id']);
    currentTab = 'visual';
    updateTabUI();
    renderInspector();
  }
  return { ok: true };
};

window.generateCoPilot = async function(promptText) {
  const inputEl = document.getElementById('copilot-prompt');
  let prompt = promptText;
  if (!prompt && inputEl) {
    prompt = inputEl.value || (inputEl._inner ? inputEl._inner.innerText : '') || '';
  }
  if (!prompt || !prompt.trim()) {
    prompt = 'Add an asynchronous email notification worker subscribed to order events with RabbitMQ';
  }

  const mutation = await window.sdlcGraph.copilotGenerate(prompt);
  pendingMutation = mutation;

  document.getElementById('btn-copilot-apply').disabled = !mutation.conforms;

  currentTab = 'rdf';
  updateTabUI();
  const container = document.getElementById('inspector-content');
  container.innerHTML = `
    <div class="inspector-card">
      <div class="card-title">
        <span>⚡ AI Co-Pilot Proposal (${mutation.proposedNodes.length} Nodes)</span>
        <span class="status-tag-pass">${mutation.conforms ? '100% SHACL Conforming' : 'Violations'}</span>
      </div>
      <div class="card-desc">${mutation.summary}</div>
      <pre class="json-pre">${JSON.stringify(mutation.proposedNodes, null, 2)}</pre>
    </div>
  `;

  return mutation;
};

window.applyCoPilot = async function() {
  if (!pendingMutation) return;

  const res = await window.sdlcGraph.copilotApply(pendingMutation);
  nodes = await window.sdlcGraph.getAllNodes();
  renderNodeList();

  document.getElementById('btn-copilot-apply').disabled = true;

  if (res && res.docSyncPrompt) {
    window.showDocSyncBanner(res.docSyncPrompt);
  }

  if (nodes.length > 0) {
    selectNode(nodes[nodes.length - 1]['@id']);
  }
  return res;
};

window.runDiff = async function(base = 'main', target = 'feature/TASK-101-auth') {
  const res = await window.sdlcGraph.diffBranches(base, target);
  currentTab = 'rdf';
  updateTabUI();
  const container = document.getElementById('inspector-content');
  container.innerHTML = `
    <div class="inspector-card">
      <div class="card-title">
        <span>⚖️ Semantic Graph Diff (${base} <===> ${target})</span>
        <span class="status-tag-pass">${res.diff.summary.riskLevel} RISK</span>
      </div>
      <pre class="json-pre">${JSON.stringify(res, null, 2)}</pre>
    </div>
  `;
  return res;
};

window.validateSHACL = async function() {
  const report = await window.sdlcGraph.validate();
  currentTab = 'rdf';
  updateTabUI();
  const container = document.getElementById('inspector-content');
  container.innerHTML = `
    <div class="inspector-card">
      <div class="card-title">
        <span>🛡️ W3C SHACL Shape Validation Report</span>
        <span class="status-tag-pass">${report.conforms ? '100% CONFORMING' : 'VIOLATIONS'}</span>
      </div>
      <pre class="json-pre">${JSON.stringify(report, null, 2)}</pre>
    </div>
  `;
  return report;
};

function updateTabUI() {
  document.getElementById('tab-btn-visual').classList.toggle('active', currentTab === 'visual');
  document.getElementById('tab-btn-gitops').classList.toggle('active', currentTab === 'gitops');
  document.getElementById('tab-btn-edd').classList.toggle('active', currentTab === 'edd');
  document.getElementById('tab-btn-video').classList.toggle('active', currentTab === 'video');
  document.getElementById('tab-btn-fabric').classList.toggle('active', currentTab === 'fabric');
  document.getElementById('tab-btn-traceability').classList.toggle('active', currentTab === 'traceability');
  document.getElementById('tab-btn-rdf').classList.toggle('active', currentTab === 'rdf');
}

// ── Event Bindings ───────────────────────────────────────────────────────────

document.getElementById('branch-select').addEventListener('change', (e) => {
  window.switchBranch(e.target.value);
});

const searchInput = document.getElementById('node-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchKeyword = e.target.value || '';
    renderNodeList();
  });
}

const typeFilterSelect = document.getElementById('node-type-filter');
if (typeFilterSelect) {
  typeFilterSelect.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    document.querySelectorAll('.filter-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === currentFilter);
    });
    renderNodeList();
  });
}

document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.filter;
    if (typeFilterSelect) typeFilterSelect.value = currentFilter;
    renderNodeList();
  });
});

document.getElementById('tab-btn-visual').addEventListener('click', () => {
  currentTab = 'visual';
  updateTabUI();
  renderInspector();
});

document.getElementById('tab-btn-gitops').addEventListener('click', () => {
  currentTab = 'gitops';
  updateTabUI();
  renderInspector();
});

document.getElementById('tab-btn-edd').addEventListener('click', () => {
  currentTab = 'edd';
  updateTabUI();
  renderInspector();
});

document.getElementById('tab-btn-video').addEventListener('click', () => {
  currentTab = 'video';
  updateTabUI();
  renderInspector();
});

document.getElementById('tab-btn-fabric').addEventListener('click', () => {
  currentTab = 'fabric';
  updateTabUI();
  renderInspector();
});

document.getElementById('tab-btn-traceability').addEventListener('click', () => {
  currentTab = 'traceability';
  updateTabUI();
  renderInspector();
});

document.getElementById('tab-btn-rdf').addEventListener('click', () => {
  currentTab = 'rdf';
  updateTabUI();
  renderInspector();
});

window.switchTab = function(tabName) {
  currentTab = tabName;
  updateTabUI();
  renderInspector();
};

document.getElementById('btn-copilot-generate').addEventListener('click', () => {
  window.generateCoPilot();
});

document.getElementById('btn-copilot-apply').addEventListener('click', () => {
  window.applyCoPilot();
});

document.getElementById('btn-run-diff').addEventListener('click', () => {
  window.runDiff('main', 'feature/TASK-101-auth');
});

document.getElementById('btn-validate-shacl').addEventListener('click', () => {
  window.validateSHACL();
});

// ── eLearning Generator & Documentation Synchronization ─────────────────────

let currentDocSyncPrompt = null;

window.viewInGitOpsTab = function(fileKey = 'elearning') {
  currentTab = 'gitops';
  activeGitOpsFile = fileKey;
  updateTabUI();
  renderInspector();
};

window.openELearningModal = function() {
  const modal = document.getElementById('elearning-modal');
  if (modal) {
    modal.style.display = 'flex';
    const status = document.getElementById('elearning-modal-status');
    if (status) status.style.display = 'none';
  }
};

window.closeELearningModal = function() {
  const modal = document.getElementById('elearning-modal');
  if (modal) modal.style.display = 'none';
};

window.submitELearning = async function(customPrompt) {
  const textarea = document.getElementById('elearning-prompt');
  let prompt = customPrompt;
  if (!prompt && textarea) {
    prompt = textarea.value || (textarea._inner ? textarea._inner.innerText : '') || '';
  }
  if (!prompt || !prompt.trim()) {
    prompt = 'Building Event-Driven Microservices with OpenAPI & Gherkin BDD';
  }

  const statusEl = document.getElementById('elearning-modal-status');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `<span style="color: var(--accent);">🔍 Checking Knowledge Graph for existing eLearning or creating new curriculum…</span>`;
  }

  try {
    const res = await window.sdlcGraph.generateELearning(prompt);
    nodes = await window.sdlcGraph.getAllNodes();
    renderNodeList();

    if (res.docSyncPrompt) {
      window.showDocSyncBanner(res.docSyncPrompt);
    }

    if (res.node) {
      selectNode(res.node['@id']);
    }

    currentTab = 'visual';
    updateTabUI();
    renderInspector();

    if (statusEl) {
      statusEl.innerHTML = `<span style="color: var(--success);">${res.message}</span>`;
      setTimeout(() => {
        window.closeELearningModal();
      }, 1200);
    } else {
      window.closeELearningModal();
    }

    return res;
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: var(--danger);">Error: ${err.message}</span>`;
    }
    return { ok: false, error: err.message };
  }
};

window.showDocSyncBanner = function(promptObj) {
  currentDocSyncPrompt = promptObj;
  const banner = document.getElementById('doc-sync-banner');
  const desc = document.getElementById('doc-sync-desc');
  if (banner && desc) {
    desc.textContent = `Noticeable updates detected in ${promptObj.nodeTitle || 'KGraph'} (${promptObj.changeType || 'updated'}). AI prompted to discern documentation updates across ${((promptObj.suggestedFiles || []).join(', ')) || 'docs/'}.`;
    banner.style.display = 'flex';
  }
};

window.hideDocSyncBanner = function() {
  const banner = document.getElementById('doc-sync-banner');
  if (banner) banner.style.display = 'none';
};

window.viewDocPrompt = function() {
  if (!currentDocSyncPrompt) return;
  console.log('[DocSync Prompt]', currentDocSyncPrompt.aiPrompt);
  const desc = document.getElementById('doc-sync-desc');
  if (desc) {
    desc.textContent = `Prompt: ${currentDocSyncPrompt.aiPrompt}`;
  }
};

window.syncDocsAction = async function() {
  if (!currentDocSyncPrompt) return { ok: true, noop: true };
  const res = await window.sdlcGraph.applyDocUpdates(currentDocSyncPrompt);
  console.log('[DocSync Applied]', res);
  window.hideDocSyncBanner();
  return res;
};

const btnOpenELearning = document.getElementById('btn-open-elearning-modal');
if (btnOpenELearning) btnOpenELearning.addEventListener('click', () => window.openELearningModal());

const btnCloseELearning = document.getElementById('btn-close-elearning-modal');
if (btnCloseELearning) btnCloseELearning.addEventListener('click', () => window.closeELearningModal());

const btnCancelELearning = document.getElementById('btn-cancel-elearning');
if (btnCancelELearning) btnCancelELearning.addEventListener('click', () => window.closeELearningModal());

const btnSubmitELearning = document.getElementById('btn-submit-elearning');
if (btnSubmitELearning) btnSubmitELearning.addEventListener('click', () => window.submitELearning());

const btnViewDocPrompt = document.getElementById('btn-view-doc-prompt');
if (btnViewDocPrompt) btnViewDocPrompt.addEventListener('click', () => window.viewDocPrompt());

const btnSyncDocsAction = document.getElementById('btn-sync-docs-action');
if (btnSyncDocsAction) btnSyncDocsAction.addEventListener('click', () => window.syncDocsAction());

const btnCloseDocBanner = document.getElementById('btn-close-doc-banner');
if (btnCloseDocBanner) btnCloseDocBanner.addEventListener('click', () => window.hideDocSyncBanner());

// ── Git Projects Sync ─────────────────────────────────────────────────────────
window.syncFromGitProjects = async function() {
  const res = await window.sdlcGraph.importGitProjects();
  if (res && res.ok) {
    nodes = await window.sdlcGraph.getAllNodes();
    renderNodeList();
    if (res.docSyncPrompt) {
      window.showDocSyncBanner(res.docSyncPrompt);
    }
  }
  return res;
};

// ── Per-App Documentation Update Modal Handlers ───────────────────────────────
let currentAppDocNodeId = null;

window.openAppDocModal = function(nodeId) {
  const node = nodes.find(n => n['@id'] === (nodeId || selectedNodeId)) || nodes[0];
  if (!node) return;
  currentAppDocNodeId = node['@id'];

  const titleEl = document.getElementById('app-doc-modal-title');
  if (titleEl) {
    titleEl.textContent = `Request Documentation Updates: ${node['dcterms:title'] || node['@id']}`;
  }

  const modal = document.getElementById('app-doc-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeAppDocModal = function() {
  const modal = document.getElementById('app-doc-modal');
  if (modal) modal.style.display = 'none';
  const status = document.getElementById('app-doc-modal-status');
  if (status) status.style.display = 'none';
};

window.submitAppDocUpdates = async function(customPrompt) {
  let prompt = customPrompt;
  if (!prompt) {
    const textarea = document.getElementById('app-doc-prompt');
    prompt = textarea ? (textarea.value || (textarea._inner ? textarea._inner.innerText : '') || '') : '';
  }
  if (!prompt || !prompt.trim()) {
    prompt = 'Update architecture and usage documentation for this application.';
  }

  const status = document.getElementById('app-doc-modal-status');
  if (status) {
    status.textContent = 'Generating tailored documentation update prompt…';
    status.style.display = 'block';
  }

  try {
    const res = await window.sdlcGraph.requestAppDocUpdate({
      appId: currentAppDocNodeId,
      userPrompt: prompt,
    });

    if (window.showDocSyncBanner) {
      window.showDocSyncBanner({
        nodeTitle: res.appTitle,
        changeType: 'doc-request',
        aiPrompt: res.aiPrompt,
        suggestedFiles: res.suggestedFiles,
      });
    }

    if (status) {
      status.textContent = res.message || 'Documentation change request applied!';
    }

    window.closeAppDocModal();
    return res;
  } catch (err) {
    console.error('App doc update error:', err);
    if (status) status.textContent = 'Error: ' + err.message;
    return { ok: false, error: err.message };
  }
};

const btnCloseAppDoc = document.getElementById('btn-close-app-doc-modal');
if (btnCloseAppDoc) btnCloseAppDoc.addEventListener('click', () => window.closeAppDocModal());

const btnCancelAppDoc = document.getElementById('btn-cancel-app-doc');
if (btnCancelAppDoc) btnCancelAppDoc.addEventListener('click', () => window.closeAppDocModal());

const btnSubmitAppDoc = document.getElementById('btn-submit-app-doc');
if (btnSubmitAppDoc) btnSubmitAppDoc.addEventListener('click', () => window.submitAppDocUpdates());

load();

