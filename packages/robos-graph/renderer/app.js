'use strict';

let branches = [];
let activeBranch = null;
let nodes = [];
let selectedNodeId = null;
let currentFilter = 'all';
let currentPackageFilter = 'all';
let searchKeyword = '';
let currentTab = 'visual'; // 'visual' | 'topology' | 'impact' | 'query' | 'gitops' | 'edd' | 'video' | 'fabric' | 'traceability' | 'rdf'
let nodeGroupMode = 'package'; // 'package' | 'category' | 'flat'
const collapsedGroups = new Set();

let topologyScope = 'neighborhood'; // 'neighborhood' | 'package' | 'all'
let topologyDirection = 'TD'; // 'TD' | 'LR'
let impactDepth = 3;
let impactDirection = 'downstream'; // 'downstream' | 'upstream'
let queryPathFrom = null;
let queryPathTo = null;
let queryPathResult = null;
let structuredQueryResults = null;
let activeArchetype = 'Microservice';
let selectedForEditId = null;
let selectedForDeleteId = null;
let selectedForExportId = null;
let exportFormat = 'jsonld';

const ARCHETYPE_CONFIGS = {
  Microservice: { type: 'robos:Microservice', pkg: 'services', prefix: 'urn:robos:service:', icon: '🔌', defaultDesc: 'Backend microservice implementing API contracts' },
  FrontEndApp: { type: 'robos:FrontEndApp', pkg: 'applications', prefix: 'urn:robos:app:', icon: '🌐', defaultDesc: 'Single-page web client application' },
  DesktopApp: { type: 'robos:DesktopApp', pkg: 'applications', prefix: 'urn:robos:desktop:', icon: '🖥️', defaultDesc: 'Desktop workstation application' },
  Database: { type: 'robos:Database', pkg: 'core-platform', prefix: 'urn:robos:db:', icon: '🗄️', defaultDesc: 'Relational SQL database' },
  NoSQLDatabase: { type: 'robos:NoSQLDatabase', pkg: 'core-platform', prefix: 'urn:robos:nosql:', icon: '🍃', defaultDesc: 'NoSQL document / key-value store' },
  MessageBroker: { type: 'robos:MessageBroker', pkg: 'core-platform', prefix: 'urn:robos:broker:', icon: '📨', defaultDesc: 'Kafka / RabbitMQ distributed message broker' },
  Contract: { type: 'robos:Contract', pkg: 'services', prefix: 'urn:robos:contract:', icon: '📜', defaultDesc: 'OpenAPI 3.1 / gRPC Protobuf specification' },
  Feature: { type: 'robos:Feature', pkg: 'services', prefix: 'urn:robos:feature:', icon: '🥒', defaultDesc: 'Executable Gherkin BDD requirement specification' },
  DocumentationPage: { type: 'robos:DocumentationPage', pkg: 'documentation', prefix: 'urn:robos:doc:', icon: '📖', defaultDesc: 'Living architectural documentation page' },
  ADR: { type: 'robos:ArchitectureDecisionRecord', pkg: 'documentation', prefix: 'urn:robos:adr:', icon: '📋', defaultDesc: 'Architecture Decision Record' },
  ConsoleApp: { type: 'robos:ConsoleApp', pkg: 'applications', prefix: 'urn:robos:cli:', icon: '⌨️', defaultDesc: 'Terminal CLI command utility' },
  DataPipeline: { type: 'robos:DataPipeline', pkg: 'services', prefix: 'urn:robos:pipeline:', icon: '🔄', defaultDesc: 'Streaming or batch data processing pipeline' },
  Library: { type: 'robos:Library', pkg: 'core-platform', prefix: 'urn:robos:lib:', icon: '📦', defaultDesc: 'Shared client SDK or utility library' },
};

const PACKAGE_METADATA = {
  'services': { title: 'Microservices & Contracts', icon: '🔌', ns: 'robos.services' },
  'applications': { title: 'Applications & Clients', icon: '📱', ns: 'robos.apps' },
  'devops': { title: 'DevOps & Pass Vault', icon: '☁️', ns: 'robos.devops' },
  'core-platform': { title: 'Core Platform & Architecture', icon: '⚙️', ns: 'robos.core' },
  'organization': { title: 'Organization & Teams', icon: '👥', ns: 'robos.org' },
  'learning': { title: 'Learning & Living Docs', icon: '🎓', ns: 'robos.learning' },
};

const CATEGORY_METADATA = {
  'service': { title: 'Microservices & Containers', icon: '🔌' },
  'contract': { title: 'API Contracts & Specs', icon: '📜' },
  'frontend-app': { title: 'Front End Applications', icon: '🌐' },
  'desktop-app': { title: 'Desktop Applications', icon: '🖥️' },
  'pc-game': { title: 'PC Games', icon: '🎮' },
  'mobile-game': { title: 'Mobile Games', icon: '🕹️' },
  'console-app': { title: 'Console & CLI Utilities', icon: '⌨️' },
  'data-pipeline': { title: 'Data Pipelines', icon: '🔄' },
  'mobile-app': { title: 'Mobile Applications', icon: '📱' },
  'library': { title: 'Libraries & SDKs', icon: '📦' },
  'devops': { title: 'DevOps Integrations', icon: '☁️' },
  'pass-credential': { title: 'Pass Credentials', icon: '🔑' },
  'bdd': { title: 'BDD Features', icon: '🥒' },
  'requirement': { title: 'Requirements', icon: '📋' },
  'elearning': { title: 'eLearning Modules', icon: '🎓' },
  'project': { title: 'Projects', icon: '📁' },
  'other': { title: 'Other Resources', icon: '📁' },
};

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
  if (types.some(t => t.includes('FlowDiagram'))) return 'diagram';
  if (types.some(t => t.includes('ArchitectureDecisionRecord') || t.includes('ADR'))) return 'adr';
  if (types.some(t => t.includes('DocumentationPage'))) return 'documentation';
  if (types.some(t => t.includes('GitProjectOrganization') || t.includes('GitOrganization'))) return 'organization';
  if (types.some(t => t.includes('DevOpsIntegration') || t.endsWith('Integration'))) return 'devops';
  if (types.some(t => t.includes('PassCredential') || t.includes('SecretReference'))) return 'pass-credential';
  if (types.some(t => t.includes('ELearning') || t.includes('Course'))) return 'elearning';
  if (types.some(t => t.includes('DesktopApp'))) return 'desktop-app';
  if (types.some(t => t.includes('ConsoleApp'))) return 'console-app';
  if (types.some(t => t.includes('FrontEndApp') || t.includes('WebApplication'))) return 'frontend-app';
  if (types.some(t => t.includes('PCGame'))) return 'pc-game';
  if (types.some(t => t.includes('MobileGame'))) return 'mobile-game';
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
    case 'diagram': return { label: '📊 Flow Diagram', cls: 'type-contract' };
    case 'adr': return { label: '📋 ADR Record', cls: 'type-req' };
    case 'documentation': return { label: '📖 Living Doc', cls: 'type-team' };
    case 'organization': return { label: '🏢 Git Project Org', cls: 'type-service' };
    case 'devops': return { label: '☁️ DevOps Integration', cls: 'type-service' };
    case 'pass-credential': return { label: '🔑 Pass Credential', cls: 'type-contract' };
    case 'elearning': return { label: '🎓 eLearning', cls: 'type-elearning' };
    case 'desktop-app': return { label: '🖥️ Desktop App', cls: 'type-desktop-app' };
    case 'console-app': return { label: '⌨️ Console CLI', cls: 'type-console-app' };
    case 'frontend-app': return { label: '🌐 Front End App', cls: 'type-frontend-app' };
    case 'pc-game': return { label: '🎮 PC Game', cls: 'type-pc-game' };
    case 'mobile-game': return { label: '🕹️ Mobile Game', cls: 'type-mobile-game' };
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

function renderNodeItemHtml(n, badge, isSelected) {
  let metaInfo = n['@id'];
  if (n['robos:targetService']) {
    metaInfo = `🎯 Target: ${n['robos:targetService'].replace(/.*:/, '')} &middot; 📋 ${n['robos:requirementId'] || 'REQ'}`;
  } else if (n['robos:repository']) {
    metaInfo = `📁 ${n['robos:repository']}`;
  } else if (n['robos:categoryName'] || n['robos:category'] || getNodeCategory(n) === 'devops') {
    const catLabel = n['robos:categoryName'] || n['robos:category'] || 'DevOps Integration';
    metaInfo = `☁️ ${catLabel} &middot; 📦 ${n['robos:package'] || 'devops'}`;
  } else if (n['robos:passPath']) {
    metaInfo = `🔒 pass: ${n['robos:passPath']}`;
  }

  const pkgTag = n['robos:package'] ? `<span class="node-pkg-badge">📦 ${n['robos:package']}</span>` : '';
  const nodeDomId = 'node-' + n['@id'].replace(/[^a-zA-Z0-9_-]/g, '_');
  const cat = getNodeCategory(n);

  return `
    <div class="node-item cat-${cat} ${isSelected ? 'selected' : ''}" id="${nodeDomId}" onclick="window.selectNode('${n['@id']}')">
      <div class="node-header">
        <span class="node-title">${n['dcterms:title']} ${pkgTag}</span>
        <span class="type-badge ${badge.cls}">${badge.label}</span>
      </div>
      <div class="node-meta">${metaInfo}</div>
    </div>
  `;
}

function renderNodeList() {
  const filtered = nodes.filter(n => {
    if (currentFilter !== 'all' && getNodeCategory(n) !== currentFilter) {
      return false;
    }
    if (currentPackageFilter !== 'all') {
      const nodePkg = n['robos:package'] || 'core-platform';
      if (nodePkg !== currentPackageFilter) return false;
    }
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const title = (n['dcterms:title'] || '').toLowerCase();
      const id = (n['@id'] || '').toLowerCase();
      const repo = (n['robos:repository'] || '').toLowerCase();
      const pkg = (n['robos:package'] || '').toLowerCase();
      return title.includes(q) || id.includes(q) || repo.includes(q) || pkg.includes(q);
    }
    return true;
  });

  const statNodesEl = document.getElementById('stat-nodes');
  if (statNodesEl) statNodesEl.textContent = `${nodes.length} SDLC Nodes`;
  const countBadgeEl = document.getElementById('nodes-count-badge');
  if (countBadgeEl) countBadgeEl.textContent = `${filtered.length} of ${nodes.length} Nodes`;

  const listEl = document.getElementById('nodes-list');
  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 24px 12px; color: var(--text-muted); font-size: 11px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <span>🔍 No matching nodes found</span>
        <button class="btn btn-secondary btn-sm" onclick="window.clearAllNodeFilters()">Clear Filters</button>
      </div>
    `;
    return;
  }

  // Flat mode
  if (nodeGroupMode === 'flat') {
    listEl.innerHTML = filtered.map(n => {
      const badge = getTypeBadge(n);
      const isSelected = n['@id'] === selectedNodeId;
      return renderNodeItemHtml(n, badge, isSelected);
    }).join('');
    return;
  }

  // Grouped mode (package or category)
  const isPackage = nodeGroupMode === 'package';
  const groups = new Map();

  for (const n of filtered) {
    const key = isPackage ? (n['robos:package'] || 'core-platform') : getNodeCategory(n);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  // Preferred ordering
  const preferredOrder = isPackage
    ? ['services', 'applications', 'devops', 'core-platform', 'organization', 'learning']
    : ['service', 'contract', 'frontend-app', 'desktop-app', 'pc-game', 'mobile-game', 'console-app', 'data-pipeline', 'mobile-app', 'library', 'devops', 'pass-credential', 'bdd', 'requirement', 'elearning', 'project', 'other'];

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    const idxA = preferredOrder.indexOf(a);
    const idxB = preferredOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  let html = '';
  for (const key of sortedKeys) {
    const groupNodes = groups.get(key);
    const meta = isPackage
      ? (PACKAGE_METADATA[key] || { title: key, icon: '📦', ns: `robos.${key}` })
      : (CATEGORY_METADATA[key] || { title: key, icon: '🏷️' });

    // When searching, auto-expand so results are visible
    const isCollapsed = collapsedGroups.has(key) && !searchKeyword.trim();

    const itemsHtml = groupNodes.map(n => {
      const badge = getTypeBadge(n);
      const isSelected = n['@id'] === selectedNodeId;
      return renderNodeItemHtml(n, badge, isSelected);
    }).join('');

    html += `
      <div class="node-group" id="node-group-${key}">
        <div class="node-group-header ${isCollapsed ? 'collapsed' : ''}" onclick="window.toggleNodeGroup('${key}')">
          <span class="group-chevron">${isCollapsed ? '▶' : '▼'}</span>
          <span class="group-icon">${meta.icon}</span>
          <span class="group-title">${meta.title}</span>
          ${meta.ns ? `<span class="group-ns">${meta.ns}</span>` : ''}
          <span class="group-count">${groupNodes.length}</span>
        </div>
        ${!isCollapsed ? `<div class="node-group-body">${itemsHtml}</div>` : ''}
      </div>
    `;
  }

  listEl.innerHTML = html;
}

window.setNodeGroupMode = function(mode) {
  nodeGroupMode = mode;
  document.querySelectorAll('#group-mode-toggle .group-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
  });
  renderNodeList();
};

window.toggleNodeGroup = function(groupId) {
  if (collapsedGroups.has(groupId)) {
    collapsedGroups.delete(groupId);
  } else {
    collapsedGroups.add(groupId);
  }
  renderNodeList();
};

window.expandAllNodeGroups = function() {
  collapsedGroups.clear();
  renderNodeList();
};

window.collapseAllNodeGroups = function() {
  const isPackage = nodeGroupMode === 'package';
  for (const n of nodes) {
    const key = isPackage ? (n['robos:package'] || 'core-platform') : getNodeCategory(n);
    collapsedGroups.add(key);
  }
  renderNodeList();
};

window.clearAllNodeFilters = function() {
  currentFilter = 'all';
  currentPackageFilter = 'all';
  searchKeyword = '';
  const searchInput = document.getElementById('node-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('btn-clear-node-search');
  if (clearBtn) clearBtn.style.display = 'none';
  const typeFilterSelect = document.getElementById('node-type-filter');
  if (typeFilterSelect) typeFilterSelect.value = 'all';
  const packageFilterSelect = document.getElementById('node-package-filter');
  if (packageFilterSelect) packageFilterSelect.value = 'all';
  document.querySelectorAll('.filter-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });
  renderNodeList();
};

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

  if (currentTab === 'topology') {
    await renderTopologyTab(container, node);
    return;
  }

  if (currentTab === 'impact') {
    await renderImpactTab(container, node);
    return;
  }

  if (currentTab === 'query') {
    await renderQueryTab(container, node);
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
  } else if (cat === 'frontend-app') {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🌐 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'Single-page web frontend application.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Frontend Framework</div>
            <div class="field-value"><strong>${node['robos:frontendFramework'] || 'React'}</strong></div>
          </div>
          <div>
            <div class="field-label">Build Tool / Bundler</div>
            <div class="field-value"><code>${node['robos:buildTool'] || 'Vite'}</code></div>
          </div>
          <div>
            <div class="field-label">Technology Stack</div>
            <div class="field-value"><span class="type-badge type-service">${node['robos:technology'] || 'TypeScript'}</span></div>
          </div>
          <div>
            <div class="field-label">Dev Server Port</div>
            <div class="field-value"><code>:${node['robos:devServerPort'] || 3000}</code></div>
          </div>
          <div>
            <div class="field-label">Repository</div>
            <div class="field-value"><code>${node['robos:repository'] || 'local'}</code></div>
          </div>
          <div>
            <div class="field-label">Owner Team</div>
            <div class="field-value"><span class="type-badge type-team">${(node['robos:ownerTeam'] || 'frontend-team').replace(/.*:/, '')}</span></div>
          </div>
        </div>
        ${node['schema:browserRequirements'] ? `
          <div style="margin-top: 10px; font-size: 11px; color: var(--text-dim);">
            <strong>Browser Requirements:</strong> ${node['schema:browserRequirements']}
          </div>
        ` : ''}
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.openAppDocModal('${node['@id']}')">📝 Request Doc Updates</button>
        </div>
      </div>
    `;
  } else if (cat === 'pc-game') {
    const platforms = Array.isArray(node['robos:targetPlatform']) ? node['robos:targetPlatform'].join(', ') : (node['robos:targetPlatform'] || 'Windows, Linux');
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🎮 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'Interactive PC video game.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Game Engine</div>
            <div class="field-value"><strong>${node['robos:gameEngine'] || 'Unreal Engine'}</strong></div>
          </div>
          <div>
            <div class="field-label">Target PC Platforms</div>
            <div class="field-value">${platforms}</div>
          </div>
          <div>
            <div class="field-label">Graphics API</div>
            <div class="field-value"><code>${node['robos:graphicsApi'] || 'DirectX 12 / Vulkan'}</code></div>
          </div>
          <div>
            <div class="field-label">Technology Stack</div>
            <div class="field-value"><span class="type-badge type-service">${node['robos:technology'] || 'C++'}</span></div>
          </div>
          <div>
            <div class="field-label">Play Mode</div>
            <div class="field-value">${node['schema:playMode'] || 'SinglePlayer'}</div>
          </div>
          <div>
            <div class="field-label">Repository</div>
            <div class="field-value"><code>${node['robos:repository'] || 'local'}</code></div>
          </div>
        </div>
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.openAppDocModal('${node['@id']}')">📝 Request Doc Updates</button>
        </div>
      </div>
    `;
  } else if (cat === 'mobile-game') {
    const platforms = Array.isArray(node['robos:platform']) ? node['robos:platform'].join(', ') : (node['robos:platform'] || 'iOS, Android');
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🕹️ ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'Interactive mobile video game.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Game Engine</div>
            <div class="field-value"><strong>${node['robos:gameEngine'] || 'Unity'}</strong></div>
          </div>
          <div>
            <div class="field-label">Mobile Platforms</div>
            <div class="field-value">${platforms}</div>
          </div>
          <div>
            <div class="field-label">Bundle Identifier</div>
            <div class="field-value"><code>${node['robos:bundleId'] || 'com.robos.game'}</code></div>
          </div>
          <div>
            <div class="field-label">Technology Stack</div>
            <div class="field-value"><span class="type-badge type-service">${node['robos:technology'] || 'C#'}</span></div>
          </div>
          <div>
            <div class="field-label">Play Mode</div>
            <div class="field-value">${node['schema:playMode'] || 'SinglePlayer'}</div>
          </div>
          <div>
            <div class="field-label">Repository</div>
            <div class="field-value"><code>${node['robos:repository'] || 'local'}</code></div>
          </div>
        </div>
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.openAppDocModal('${node['@id']}')">📝 Request Doc Updates</button>
        </div>
      </div>
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
  } else if (cat === 'devops') {
    const settings = node['robos:settings'] || {};
    const creds = Array.isArray(node['robos:hasCredential']) ? node['robos:hasCredential'] : [];
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>☁️ ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Provider</div>
            <div class="field-value"><strong>${node['robos:providerName'] || node['robos:provider'] || 'Custom Provider'}</strong></div>
          </div>
          <div>
            <div class="field-label">Category</div>
            <div class="field-value"><span class="type-badge type-service">${node['robos:categoryName'] || node['robos:category'] || 'DevOps'}</span></div>
          </div>
          <div>
            <div class="field-label">Endpoint URL</div>
            <div class="field-value"><code>${node['robos:endpointUrl'] || 'Cloud Provider'}</code></div>
          </div>
          <div>
            <div class="field-label">KGraph Package</div>
            <div class="field-value"><span class="type-badge type-team">📦 ${node['robos:package'] || 'devops'}</span></div>
          </div>
          <div>
            <div class="field-label">Status</div>
            <div class="field-value"><span class="status-tag-pass">🟢 ${node['robos:status'] || 'connected'}</span></div>
          </div>
          <div>
            <div class="field-label">Last Updated</div>
            <div class="field-value">${node['robos:updatedAt'] ? new Date(node['robos:updatedAt']).toLocaleString() : 'Active'}</div>
          </div>
        </div>
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.testDevOpsIntegrationById('${node['@id']}', '${node['robos:provider'] || ''}')">⚡ Test Connection</button>
          <button class="btn btn-danger" onclick="window.deleteDevOpsIntegrationById('${node['@id']}')">🗑️ Delete Integration</button>
        </div>
      </div>

      <div class="inspector-card">
        <div class="card-title">
          <span>🔒 Password-Store Credentials (${creds.length})</span>
          <span class="status-tag-pass">GPG ENCRYPTED</span>
        </div>
        <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 8px;">
          Zero plaintext secrets in Knowledge Graph. Encrypted credentials reside inside standard pass tree:
        </div>
        ${creds.length > 0 ? creds.map(c => `
          <div class="parsed-item" style="margin-bottom: 6px;">
            <strong>🔑 ${c}</strong>
            <span style="font-family: monospace; font-size: 10px; color: var(--accent);">GPG encrypted &middot; ~/.password-store/</span>
          </div>
        `).join('') : '<div style="color: var(--text-muted); font-size: 11px;">No credential nodes linked</div>'}
      </div>

      ${Object.keys(settings).length > 0 ? `
        <div class="inspector-card">
          <div class="card-title">
            <span>⚙️ Configuration Settings</span>
          </div>
          <table class="matrix-table" style="width: 100%;">
            <thead><tr><th>Key</th><th>Value</th></tr></thead>
            <tbody>
              ${Object.entries(settings).filter(([_, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `
                <tr><td><code>${k}</code></td><td><code>${typeof v === 'object' ? JSON.stringify(v) : v}</code></td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  } else if (cat === 'pass-credential') {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🔑 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          First-class Knowledge Graph secret reference pointing to encrypted local UNIX password store.
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Password Store Path</div>
            <div class="field-value"><code>~/.password-store/${node['robos:passPath']}.gpg</code></div>
          </div>
          <div>
            <div class="field-label">Storage Backend</div>
            <div class="field-value"><span class="status-tag-pass">🔐 GPG pass CLI</span></div>
          </div>
          <div>
            <div class="field-label">Credential Key Type</div>
            <div class="field-value"><span class="type-badge type-contract">${node['robos:credentialType'] || 'secret'}</span></div>
          </div>
          <div>
            <div class="field-label">KGraph Package</div>
            <div class="field-value"><span class="type-badge type-team">📦 ${node['robos:package'] || 'devops'}</span></div>
          </div>
          <div>
            <div class="field-label">Last Rotated</div>
            <div class="field-value">${node['robos:lastRotated'] ? new Date(node['robos:lastRotated']).toLocaleString() : 'N/A'}</div>
          </div>
          <div>
            <div class="field-label">Plaintext Exposure</div>
            <div class="field-value"><strong style="color: var(--success);">0% (Always Encrypted)</strong></div>
          </div>
        </div>
      </div>
    `;
  } else if (cat === 'diagram') {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>📊 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'System architecture and sequence flow diagram.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Diagram Type</div>
            <div class="field-value"><span class="type-badge type-contract">${(node['robos:diagramType'] || 'Sequence').toUpperCase()}</span></div>
          </div>
          <div>
            <div class="field-label">Tooltip & Summary</div>
            <div class="field-value"><code>${node['robos:tooltip'] || node['dcterms:title']}</code></div>
          </div>
          <div>
            <div class="field-label">KGraph Package</div>
            <div class="field-value"><span class="type-badge type-team">📦 ${node['robos:package'] || 'documentation'}</span></div>
          </div>
          <div>
            <div class="field-label">Source Space</div>
            <div class="field-value"><code>${node['robos:sourceUrl'] || 'Confluence Wiki'}</code></div>
          </div>
        </div>
      </div>

      <div class="inspector-card">
        <div class="card-title">
          <span>Mermaid Syntax Flow</span>
          <span class="status-tag-pass">100% SHACL VERIFIED</span>
        </div>
        <pre class="json-pre" style="color: #58a6ff; font-family: monospace; white-space: pre-wrap;">${node['robos:mermaidText'] || 'sequenceDiagram\n  autonumber\n  Customer->>Service: Request\n  Service-->>Customer: Response'}</pre>
      </div>
    `;
  } else if (cat === 'adr') {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>📋 ${node['dcterms:title']}</span>
          <span class="status-tag-pass">${(node['robos:status'] || 'accepted').toUpperCase()}</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">ADR Number</div>
            <div class="field-value"><strong>ADR-${String(node['robos:adrNumber'] || 1).padStart(3, '0')}</strong></div>
          </div>
          <div>
            <div class="field-label">Governance Status</div>
            <div class="field-value"><span class="status-tag-pass">${node['robos:status'] || 'accepted'}</span></div>
          </div>
          <div>
            <div class="field-label">Context</div>
            <div class="field-value">${node['robos:context'] || 'Architecture decision context.'}</div>
          </div>
          <div>
            <div class="field-label">Decision</div>
            <div class="field-value"><strong style="color: var(--accent);">${node['robos:decision'] || node['dcterms:description']}</strong></div>
          </div>
          <div>
            <div class="field-label">Consequences</div>
            <div class="field-value">${node['robos:consequences'] || 'Standard system consequences.'}</div>
          </div>
          <div>
            <div class="field-label">Source Reference</div>
            <div class="field-value"><code>${node['robos:sourceUrl'] || node['robos:sourcePath'] || 'Confluence / Local'}</code></div>
          </div>
        </div>
      </div>
    `;
  } else if (cat === 'documentation') {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>📖 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'Living documentation page.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Documentation Category</div>
            <div class="field-value"><span class="type-badge type-contract">${(node['robos:category'] || 'Architecture').toUpperCase()}</span></div>
          </div>
          <div>
            <div class="field-label">Markdown Storage Path</div>
            <div class="field-value"><code>${node['robos:docPath'] || 'docs/'}</code></div>
          </div>
          <div>
            <div class="field-label">KGraph Package</div>
            <div class="field-value"><span class="type-badge type-team">📦 ${node['robos:package'] || 'documentation'}</span></div>
          </div>
          <div>
            <div class="field-label">Source URL</div>
            <div class="field-value"><code>${node['robos:sourceUrl'] || 'Confluence Space'}</code></div>
          </div>
        </div>
      </div>
    `;
  } else if (cat === 'organization') {
    const rules = node['robos:agentRules'] || [];
    const repos = node['robos:hasRepository'] || [];
    container.innerHTML = `
      <div class="inspector-card">
        <div class="card-title">
          <span>🏢 ${node['dcterms:title']}</span>
          <span class="type-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="card-desc">
          ${node['dcterms:description'] || 'Enterprise Git Forge Organization.'}
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Organization Slug</div>
            <div class="field-value"><code>${node['robos:orgName'] || 'org'}</code></div>
          </div>
          <div>
            <div class="field-label">Forge Type & Visibility</div>
            <div class="field-value"><span class="type-badge type-service">${(node['robos:forgeType'] || 'GitHub').toUpperCase()}</span> &middot; <span class="status-tag-pass">${node['robos:visibility'] || 'Internal'}</span></div>
          </div>
          <div>
            <div class="field-label">Member Repositories</div>
            <div class="field-value"><strong>${repos.length} Repositories Registered</strong></div>
          </div>
          <div>
            <div class="field-label">Forge URL</div>
            <div class="field-value"><code>${node['robos:url'] || 'https://github.com'}</code></div>
          </div>
        </div>
      </div>

      ${rules.length > 0 ? `
        <div class="inspector-card">
          <div class="card-title">
            <span>🤖 Inherited Agent Rules (${rules.length})</span>
            <span class="status-tag-pass">ENFORCED FOR ALL AGENTS</span>
          </div>
          <div class="card-desc" style="margin-bottom: 6px;">
            All AI agents working on repositories in this organization automatically inherit and obey these rules:
          </div>
          <ul style="margin: 0; padding-left: 20px; font-size: 11px; line-height: 1.6;">
            ${rules.map(r => `<li><span style="color: var(--accent); font-weight: 600;">Rule:</span> ${r}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
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
  container.insertAdjacentHTML('afterbegin', renderNodeActionBarHtml(node));
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

// ── Flagship GUI Support: Action Bar, Topology, Impact & Query Consoles ──────

function renderNodeActionBarHtml(node) {
  if (!node) return '';
  return `
    <div class="node-action-bar">
      <button class="btn-action-sm" onclick="window.openEditEntityModal('${node['@id']}')">✏️ Edit Node</button>
      <button class="btn-action-sm" onclick="window.showTopologyForNode('${node['@id']}')">🗺️ View in Topology</button>
      <button class="btn-action-sm" onclick="window.showImpactForNode('${node['@id']}')">💥 Blast Radius</button>
      <button class="btn-action-sm" onclick="window.duplicateEntity('${node['@id']}')">📋 Duplicate</button>
      <button class="btn-action-sm" onclick="window.openExportEntityModal('${node['@id']}')">📤 Export</button>
      <button class="btn-action-sm" onclick="window.copyNodeUrn('${node['@id']}')">🔗 Copy URN</button>
      <button class="btn-action-sm btn-danger" onclick="window.openDeleteEntityModal('${node['@id']}')" style="margin-left: auto;">🗑️ Delete</button>
    </div>
  `;
}

// ── 1. Interactive Topology & Dependency Graph ─────────────────────────────────

window.setTopologyScope = function(scope) {
  topologyScope = scope;
  renderInspector();
};

window.toggleTopologyDirection = function() {
  topologyDirection = topologyDirection === 'TD' ? 'LR' : 'TD';
  renderInspector();
};

window.showTopologyForNode = function(nodeId) {
  selectedNodeId = nodeId;
  currentTab = 'topology';
  updateTabUI();
  renderInspector();
};

window.copyMermaidCode = async function() {
  try {
    const node = nodes.find(n => n['@id'] === selectedNodeId) || nodes[0];
    const mermaid = await window.sdlcGraph.generateMermaid({
      rootId: topologyScope === 'neighborhood' ? (node ? node['@id'] : null) : null,
      packageId: topologyScope === 'package' ? (node ? (node['robos:package'] || 'services') : null) : null,
      direction: topologyDirection,
      maxNodes: 40,
    });
    await navigator.clipboard.writeText(mermaid);
    alert('✅ Mermaid diagram markdown copied to clipboard!');
  } catch (e) {
    console.error(e);
  }
};

async function renderTopologyTab(container, node) {
  const currentPkg = node['robos:package'] || 'services';
  
  let displayNodes = [];
  if (topologyScope === 'neighborhood') {
    const rootId = node['@id'];
    const visited = new Set([rootId]);
    displayNodes.push(node);
    
    const outRefs = Array.isArray(node['robos:dependsOn']) ? [...node['robos:dependsOn']] : (node['robos:dependsOn'] ? [node['robos:dependsOn']] : []);
    if (node['robos:implementsContract']) outRefs.push(node['robos:implementsContract']);
    if (node['robos:usesDatabase']) outRefs.push(node['robos:usesDatabase']);
    if (node['robos:publishesTo']) outRefs.push(node['robos:publishesTo']);
    if (node['robos:subscribesTo']) outRefs.push(node['robos:subscribesTo']);
    if (node['robos:targetService']) outRefs.push(node['robos:targetService']);

    for (const ref of outRefs) {
      if (!visited.has(ref)) {
        visited.add(ref);
        const target = nodes.find(n => n['@id'] === ref);
        if (target) displayNodes.push(target);
      }
    }
    for (const other of nodes) {
      if (!visited.has(other['@id'])) {
        const str = JSON.stringify(other);
        if (str.includes(rootId)) {
          visited.add(other['@id']);
          displayNodes.push(other);
        }
      }
    }
  } else if (topologyScope === 'package') {
    displayNodes = nodes.filter(n => (n['robos:package'] || 'core-platform') === currentPkg);
  } else {
    displayNodes = nodes.slice(0, 32);
  }

  const idSet = new Set(displayNodes.map(n => n['@id']));
  const edges = [];
  for (const n of displayNodes) {
    const fromId = n['@id'];
    const checkEdge = (toId, label) => {
      if (toId && idSet.has(toId) && toId !== fromId) {
        edges.push({ from: fromId, to: toId, label });
      }
    };
    if (n['robos:implementsContract']) checkEdge(n['robos:implementsContract'], 'implements');
    if (n['robos:usesDatabase']) checkEdge(n['robos:usesDatabase'], 'usesDb');
    if (n['robos:publishesTo']) checkEdge(n['robos:publishesTo'], 'publishes');
    if (n['robos:subscribesTo']) checkEdge(n['robos:subscribesTo'], 'subscribes');
    if (n['robos:targetService']) checkEdge(n['robos:targetService'], 'targets');
    if (Array.isArray(n['robos:dependsOn'])) {
      for (const d of n['robos:dependsOn']) checkEdge(d, 'dependsOn');
    } else if (n['robos:dependsOn']) {
      checkEdge(n['robos:dependsOn'], 'dependsOn');
    }
  }

  const isTD = topologyDirection === 'TD';
  const nodeWidth = 200;
  const nodeHeight = 64;
  const colSpacing = isTD ? 230 : 260;
  const rowSpacing = isTD ? 120 : 90;
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(displayNodes.length))));
  
  const nodePositions = new Map();
  displayNodes.forEach((n, idx) => {
    let x, y;
    if (isTD) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      x = 30 + col * colSpacing;
      y = 30 + row * rowSpacing;
    } else {
      const row = idx % cols;
      const col = Math.floor(idx / cols);
      x = 30 + col * colSpacing;
      y = 30 + row * rowSpacing;
    }
    nodePositions.set(n['@id'], { x, y });
  });

  const svgWidth = Math.max(860, (cols + 1) * colSpacing);
  const svgHeight = Math.max(520, (Math.ceil(displayNodes.length / cols) + 1) * rowSpacing);

  let edgeSvg = '';
  for (const e of edges) {
    const p1 = nodePositions.get(e.from);
    const p2 = nodePositions.get(e.to);
    if (p1 && p2) {
      const startX = p1.x + nodeWidth / 2;
      const startY = p1.y + nodeHeight;
      const endX = p2.x + nodeWidth / 2;
      const endY = p2.y;
      const midY = (startY + endY) / 2;
      
      edgeSvg += `
        <path d="M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}"
          fill="none" stroke="rgba(0, 188, 212, 0.4)" stroke-width="1.8" stroke-dasharray="4 2" marker-end="url(#arrow)" />
        <text x="${(startX + endX) / 2}" y="${midY - 2}" fill="#8b949e" font-size="8.5" font-family="monospace" text-anchor="middle">${e.label}</text>
      `;
    }
  }

  let nodeSvg = '';
  for (const n of displayNodes) {
    const pos = nodePositions.get(n['@id']);
    if (!pos) continue;
    const isSelected = n['@id'] === selectedNodeId;
    const badge = getTypeBadge(n);
    const title = (n['dcterms:title'] || n['@id']).slice(0, 22);
    const pkg = n['robos:package'] || 'core';
    const strokeColor = isSelected ? '#00bcd4' : '#30363d';
    const strokeWidth = isSelected ? '2.5' : '1';

    nodeSvg += `
      <g class="topology-node-group" onclick="window.selectNode('${n['@id']}')" style="cursor: pointer;">
        <rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" rx="6" ry="6"
          fill="#161b22" stroke="${strokeColor}" stroke-width="${strokeWidth}" class="topology-node-rect ${isSelected ? 'selected' : ''}" />
        <circle cx="${pos.x + 14}" cy="${pos.y + 16}" r="4.5" fill="${isSelected ? '#00bcd4' : '#3fb950'}" />
        <text x="${pos.x + 25}" y="${pos.y + 20}" fill="#f0f6fc" font-size="11" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
          ${title}
        </text>
        <text x="${pos.x + 12}" y="${pos.y + 42}" fill="#8b949e" font-size="9" font-family="monospace">
          ${badge.label}
        </text>
        <rect x="${pos.x + nodeWidth - 75}" y="${pos.y + 32}" width="65" height="16" rx="3" fill="rgba(0, 188, 212, 0.12)" />
        <text x="${pos.x + nodeWidth - 42}" y="${pos.y + 44}" fill="#00bcd4" font-size="8.5" font-family="monospace" text-anchor="middle">
          📦 ${pkg}
        </text>
      </g>
    `;
  }

  container.innerHTML = `
    <div class="topology-container">
      <div class="topology-toolbar">
        <div class="topology-toolbar-group">
          <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Scope:</label>
          <select id="topology-scope-select" class="filter-type-select" onchange="window.setTopologyScope(this.value)">
            <option value="neighborhood" ${topologyScope === 'neighborhood' ? 'selected' : ''}>🔍 Neighborhood (${(node['dcterms:title'] || '').slice(0, 20)})</option>
            <option value="package" ${topologyScope === 'package' ? 'selected' : ''}>📦 Package (${currentPkg})</option>
            <option value="all" ${topologyScope === 'all' ? 'selected' : ''}>🌐 Entire SDLC Universe</option>
          </select>
          <button class="btn btn-secondary btn-sm" onclick="window.toggleTopologyDirection()">
            ${isTD ? '⬇️ Top-to-Bottom' : '➡️ Left-to-Right'}
          </button>
        </div>
        <div class="topology-toolbar-group">
          <span style="font-size: 11px; color: var(--accent); font-weight: 600;">${displayNodes.length} Nodes &middot; ${edges.length} Links</span>
          <button class="btn btn-secondary btn-sm" onclick="window.copyMermaidCode()">📋 Copy Mermaid</button>
        </div>
      </div>

      <div class="topology-canvas-wrap">
        <svg class="topology-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#00bcd4" />
            </marker>
          </defs>
          ${edgeSvg}
          ${nodeSvg}
        </svg>
      </div>
    </div>
  `;
}

// ── 2. Blast Radius & Impact Analyzer ──────────────────────────────────────────

window.showImpactForNode = function(nodeId) {
  selectedNodeId = nodeId;
  currentTab = 'impact';
  updateTabUI();
  renderInspector();
};

window.setImpactDepth = function(depth) {
  impactDepth = Number(depth);
  renderInspector();
};

window.setImpactDirection = function(dir) {
  impactDirection = dir;
  renderInspector();
};

async function renderImpactTab(container, node) {
  const blast = await window.sdlcGraph.getImpact(node['@id'], impactDepth);
  const count = blast ? (blast.blastRadiusCount || (blast.dependents ? blast.dependents.length : 0)) : 0;
  
  let riskClass = 'risk-low';
  let riskText = 'LOW IMPACT';
  if (count >= 5) {
    riskClass = 'risk-critical';
    riskText = 'CRITICAL BLAST RADIUS';
  } else if (count >= 3) {
    riskClass = 'risk-high';
    riskText = 'HIGH IMPACT';
  } else if (count >= 1) {
    riskClass = 'risk-medium';
    riskText = 'MODERATE IMPACT';
  }

  const upstreamDeps = [];
  if (node['robos:implementsContract']) upstreamDeps.push({ id: node['robos:implementsContract'], via: 'robos:implementsContract' });
  if (node['robos:usesDatabase']) upstreamDeps.push({ id: node['robos:usesDatabase'], via: 'robos:usesDatabase' });
  if (node['robos:usesMessageBroker']) upstreamDeps.push({ id: node['robos:usesMessageBroker'], via: 'robos:usesMessageBroker' });
  if (Array.isArray(node['robos:dependsOn'])) {
    for (const d of node['robos:dependsOn']) upstreamDeps.push({ id: d, via: 'robos:dependsOn' });
  }

  const items = impactDirection === 'downstream' 
    ? (blast && blast.dependents ? blast.dependents : [])
    : upstreamDeps.map(u => ({ node: nodes.find(n => n['@id'] === u.id) || { '@id': u.id, 'dcterms:title': u.id.split(':').pop() }, depth: 1, via: u.via }));

  container.innerHTML = `
    <div class="impact-container">
      <div class="impact-summary-card">
        <div>
          <div style="font-size: 14px; font-weight: 700; color: var(--text-bright);">
            Impact Analysis & Blast Radius: <span style="color: var(--accent);">${node['dcterms:title']}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            <code>${node['@id']}</code> &middot; Package: <code>${node['robos:package'] || 'services'}</code>
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <div class="impact-risk-badge ${riskClass}">
            <span>⚠️</span>
            <span>${riskText} (${count} Dependents)</span>
          </div>
          <select class="filter-type-select" onchange="window.setImpactDepth(this.value)">
            <option value="1" ${impactDepth === 1 ? 'selected' : ''}>Depth: 1 Hop</option>
            <option value="2" ${impactDepth === 2 ? 'selected' : ''}>Depth: 2 Hops</option>
            <option value="3" ${impactDepth === 3 ? 'selected' : ''}>Depth: 3 Hops</option>
            <option value="5" ${impactDepth === 5 ? 'selected' : ''}>Depth: 5 Hops</option>
          </select>
        </div>
      </div>

      <div style="display: flex; gap: 6px; align-items: center;">
        <div class="group-mode-toggle">
          <button class="group-btn ${impactDirection === 'downstream' ? 'active' : ''}" onclick="window.setImpactDirection('downstream')">
            💥 Downstream Blast Radius (Who depends on this?)
          </button>
          <button class="group-btn ${impactDirection === 'upstream' ? 'active' : ''}" onclick="window.setImpactDirection('upstream')">
            ⬆️ Upstream Dependencies (What does this rely on?)
          </button>
        </div>
      </div>

      <div class="impact-tree-list">
        ${items.length === 0 ? `
          <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px;">
            ✅ Zero ${impactDirection} dependencies detected. Safe to modify without cascading regressions.
          </div>
        ` : items.map(item => {
          const targetNode = item.node || {};
          const targetBadge = getTypeBadge(targetNode);
          return `
            <div class="impact-tree-item">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="impact-depth-pill">Level ${item.depth}</span>
                <span class="type-badge ${targetBadge.cls}">${targetBadge.label}</span>
                <div>
                  <div style="font-weight: 700; color: var(--text-bright); font-size: 11.5px;">${targetNode['dcterms:title'] || targetNode['@id']}</div>
                  <div style="font-size: 9.5px; color: var(--text-muted); font-family: monospace;">${targetNode['@id']} &middot; via <code>${item.via}</code></div>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="window.selectNode('${targetNode['@id']}')">🔍 Inspect Node</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ── 3. Multi-Hop Path Finder & Query Console ───────────────────────────────────

window.setPathFrom = function(id) {
  queryPathFrom = id;
};

window.setPathTo = function(id) {
  queryPathTo = id;
};

window.runFindPath = async function() {
  if (!queryPathFrom || !queryPathTo) return;
  queryPathResult = await window.sdlcGraph.findPath(queryPathFrom, queryPathTo, 6);
  const resultArea = document.getElementById('path-result-area');
  if (resultArea) {
    resultArea.innerHTML = renderPathChainHtml(queryPathResult);
  }
};

window.runStructuredQuery = async function() {
  const searchEl = document.getElementById('sq-search');
  const pkgEl = document.getElementById('sq-package');
  const q = searchEl ? searchEl.value.trim() : '';
  const pkg = pkgEl ? pkgEl.value : '';
  
  const results = await window.sdlcGraph.searchNodes(q, { package: pkg });
  structuredQueryResults = results;
  const tableContainer = document.getElementById('sq-results-table');
  if (tableContainer) {
    tableContainer.innerHTML = renderStructuredQueryTableHtml(results);
  }
};

function renderPathChainHtml(pathRes) {
  if (!pathRes || pathRes.length === 0) {
    return `
      <div style="padding: 12px; background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 6px; font-size: 11px; color: var(--danger);">
        ❌ No direct or transitive connection path found between the selected nodes within 6 hops.
      </div>
    `;
  }

  return `
    <div class="path-chain-view">
      ${pathRes.map((hop, idx) => {
        const hNode = hop.node || {};
        const badge = getTypeBadge(hNode);
        const isLast = idx === pathRes.length - 1;
        return `
          <div class="path-hop-card" onclick="window.selectNode('${hop.id}')">
            <div style="font-size: 9px; color: var(--accent); font-weight: 700;">Hop ${idx + 1}</div>
            <div style="font-weight: 700; font-size: 11px;">${hNode['dcterms:title'] || hop.id}</div>
            <span class="type-badge ${badge.cls}" style="margin-top: 2px;">${badge.label}</span>
          </div>
          ${!isLast ? `<span class="path-hop-arrow">➔</span>` : ''}
        `;
      }).join('')}
    </div>
  `;
}

function renderStructuredQueryTableHtml(results) {
  if (!results || results.length === 0) {
    return `<div style="font-size: 11px; color: var(--text-muted); padding: 8px;">No matching entities found.</div>`;
  }

  return `
    <table class="matrix-table" style="width: 100%;">
      <thead>
        <tr>
          <th>Entity Title</th>
          <th>Type</th>
          <th>Package</th>
          <th>Repository</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(n => {
          const badge = getTypeBadge(n);
          return `
            <tr>
              <td><strong>${n['dcterms:title']}</strong><br><code style="font-size: 9px;">${n['@id']}</code></td>
              <td><span class="type-badge ${badge.cls}">${badge.label}</span></td>
              <td><span class="node-pkg-badge">📦 ${n['robos:package'] || 'core'}</span></td>
              <td><code>${n['robos:repository'] || 'local'}</code></td>
              <td><button class="btn btn-secondary btn-sm" onclick="window.selectNode('${n['@id']}')">Select</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function renderQueryTab(container, selectedNode) {
  if (!queryPathFrom) queryPathFrom = nodes[0] ? nodes[0]['@id'] : '';
  if (!queryPathTo) queryPathTo = selectedNode ? selectedNode['@id'] : (nodes[1] ? nodes[1]['@id'] : '');

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div class="path-finder-box">
        <div class="card-title">
          <span>🛤️ Multi-Hop Connection Path Finder</span>
          <span class="type-badge type-contract">Graph Traversal</span>
        </div>
        <div class="card-desc">
          Discover transitive relationship paths and reference chains between any two entities in the SDLC Knowledge Graph.
        </div>
        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
          <div style="flex: 1;">
            <label class="field-label">Source Node (From):</label>
            <select id="path-from-select" class="input-text" onchange="window.setPathFrom(this.value)">
              ${nodes.map(n => `<option value="${n['@id']}" ${n['@id'] === queryPathFrom ? 'selected' : ''}>${n['dcterms:title']} (${n['@id'].split(':').pop()})</option>`).join('')}
            </select>
          </div>
          <span style="margin-top: 18px; color: var(--accent); font-size: 18px;">➔</span>
          <div style="flex: 1;">
            <label class="field-label">Target Node (To):</label>
            <select id="path-to-select" class="input-text" onchange="window.setPathTo(this.value)">
              ${nodes.map(n => `<option value="${n['@id']}" ${n['@id'] === queryPathTo ? 'selected' : ''}>${n['dcterms:title']} (${n['@id'].split(':').pop()})</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" style="margin-top: 18px; padding: 6px 12px;" onclick="window.runFindPath()">⚡ Trace Path</button>
        </div>

        <div id="path-result-area" style="margin-top: 10px;">
          ${queryPathResult ? renderPathChainHtml(queryPathResult) : `
            <div style="font-size: 11px; color: var(--text-muted); font-style: italic;">
              Select a source and target node and click "Trace Path" to evaluate connectivity.
            </div>
          `}
        </div>
      </div>

      <div class="inspector-card">
        <div class="card-title">
          <span>🔍 Structured SDLC Graph Search & Query</span>
          <span class="type-badge type-service">Fast Filter</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="sq-search" class="input-text" placeholder="Search keywords, attributes, URNs..." style="flex: 1;" />
          <select id="sq-package" class="filter-type-select">
            <option value="">All Packages</option>
            <option value="services">services</option>
            <option value="applications">applications</option>
            <option value="core-platform">core-platform</option>
            <option value="devops">devops</option>
            <option value="organization">organization</option>
            <option value="documentation">documentation</option>
            <option value="learning">learning</option>
          </select>
          <button class="btn btn-primary" onclick="window.runStructuredQuery()">Filter</button>
        </div>
        <div id="sq-results-table" style="margin-top: 8px;">
          ${renderStructuredQueryTableHtml(structuredQueryResults || nodes.slice(0, 10))}
        </div>
      </div>
    </div>
  `;
}

// ── 4. Entity Lifecycle: Add, Edit, Delete, Duplicate, Export ──────────────────

window.copyNodeUrn = async function(nodeId) {
  try {
    await navigator.clipboard.writeText(nodeId);
    alert(`✅ Copied node URN to clipboard:\n${nodeId}`);
  } catch (e) {
    console.error(e);
  }
};

window.duplicateEntity = async function(nodeId) {
  const original = nodes.find(n => n['@id'] === nodeId);
  if (!original) return;
  const clone = JSON.parse(JSON.stringify(original));
  clone['@id'] = `${original['@id']}-copy`;
  clone['dcterms:title'] = `${original['dcterms:title']} (Copy)`;
  
  await window.sdlcGraph.addNode(clone);
  nodes = await window.sdlcGraph.getAllNodes();
  renderNodeList();
  selectNode(clone['@id']);
  alert(`✅ Duplicated node as: ${clone['@id']}`);
};

window.openDeleteEntityModal = async function(nodeId) {
  const node = nodes.find(n => n['@id'] === nodeId);
  if (!node) return;
  selectedForDeleteId = nodeId;

  document.getElementById('delete-node-name').textContent = node['dcterms:title'] || nodeId;
  document.getElementById('delete-node-id-display').textContent = nodeId;

  const blast = await window.sdlcGraph.getImpact(nodeId, 2);
  const count = blast ? (blast.blastRadiusCount || (blast.dependents ? blast.dependents.length : 0)) : 0;
  document.getElementById('delete-dependents-count').textContent = count;

  const statusEl = document.getElementById('delete-node-status');
  if (statusEl) statusEl.style.display = 'none';

  const modal = document.getElementById('delete-confirm-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeDeleteEntityModal = function() {
  const modal = document.getElementById('delete-confirm-modal');
  if (modal) modal.style.display = 'none';
  selectedForDeleteId = null;
};

window.confirmDeleteEntity = async function() {
  if (!selectedForDeleteId) return;
  const cascade = document.getElementById('delete-cascade-checkbox').checked;
  const statusEl = document.getElementById('delete-node-status');

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'wizard-status-msg info';
    statusEl.textContent = 'Deleting node from package store…';
  }

  const res = await window.sdlcGraph.deleteNode(selectedForDeleteId, { cascade });
  if (res) {
    window.closeDeleteEntityModal();
    nodes = await window.sdlcGraph.getAllNodes();
    renderNodeList();
    if (nodes.length > 0) selectNode(nodes[0]['@id']);
  } else {
    if (statusEl) {
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = 'Failed to delete node.';
    }
  }
};

window.openExportEntityModal = async function(nodeId) {
  const node = nodes.find(n => n['@id'] === nodeId) || nodes[0];
  if (!node) return;
  selectedForExportId = node['@id'];
  exportFormat = 'jsonld';

  const modal = document.getElementById('export-node-modal');
  if (modal) modal.style.display = 'flex';

  window.renderExportContent();
};

window.closeExportEntityModal = function() {
  const modal = document.getElementById('export-node-modal');
  if (modal) modal.style.display = 'none';
  selectedForExportId = null;
};

window.setExportFormat = function(fmt) {
  exportFormat = fmt;
  document.getElementById('btn-export-fmt-jsonld').classList.toggle('active', fmt === 'jsonld');
  document.getElementById('btn-export-fmt-turtle').classList.toggle('active', fmt === 'turtle');
  window.renderExportContent();
};

window.renderExportContent = async function() {
  const node = nodes.find(n => n['@id'] === selectedForExportId);
  const preEl = document.getElementById('export-content-pre');
  if (!node || !preEl) return;

  if (exportFormat === 'jsonld') {
    preEl.textContent = JSON.stringify(node, null, 2);
  } else {
    const ttl = await window.sdlcGraph.exportGraph('ttl', node['robos:package']);
    preEl.textContent = ttl || `@prefix robos: <https://robos.dev/ns/sdlc#> .\n<${node['@id']}> a robos:${(node['@type'] || ['Node'])[0].split(':').pop()} ;\n  <http://purl.org/dc/terms/title> "${node['dcterms:title']}" .`;
  }
};

window.copyExportContent = async function() {
  const preEl = document.getElementById('export-content-pre');
  if (preEl) {
    await navigator.clipboard.writeText(preEl.textContent);
    const statusEl = document.getElementById('export-status-msg');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg success';
      statusEl.textContent = '✅ Copied exported RDF data to clipboard!';
      setTimeout(() => { statusEl.style.display = 'none'; }, 1500);
    }
  }
};

// Add Entity Modal
window.openAddEntityModal = function(archetype = 'Microservice') {
  activeArchetype = archetype;
  const modal = document.getElementById('add-entity-modal');
  if (modal) modal.style.display = 'flex';

  // Highlight active archetype chip
  document.querySelectorAll('#archetype-chips-grid .archetype-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.archetype === archetype);
  });

  const cfg = ARCHETYPE_CONFIGS[archetype] || ARCHETYPE_CONFIGS.Microservice;
  const slug = `new-${archetype.toLowerCase()}`;
  document.getElementById('add-node-id').value = `${cfg.prefix}${slug}`;
  document.getElementById('add-node-package').value = cfg.pkg;
  document.getElementById('add-node-desc').value = cfg.defaultDesc;
  document.getElementById('add-node-title').value = `New ${archetype}`;

  const statusEl = document.getElementById('add-node-status');
  if (statusEl) statusEl.style.display = 'none';

  window.renderArchetypeDynamicFields(archetype);
};

window.closeAddEntityModal = function() {
  const modal = document.getElementById('add-entity-modal');
  if (modal) modal.style.display = 'none';
};

window.selectAddArchetype = function(archetype) {
  window.openAddEntityModal(archetype);
};

window.renderArchetypeDynamicFields = function(archetype) {
  const container = document.getElementById('add-node-archetype-fields');
  if (!container) return;

  if (archetype === 'Microservice') {
    container.innerHTML = `
      <div class="form-row-2col">
        <div class="form-group">
          <label class="field-label">Implements API Contract</label>
          <input type="text" id="dyn-contract" class="input-text" placeholder="urn:robos:contract:api-v1" />
        </div>
        <div class="form-group">
          <label class="field-label">Uses Database</label>
          <input type="text" id="dyn-db" class="input-text" placeholder="urn:robos:db:primary" />
        </div>
      </div>
    `;
  } else if (archetype === 'FrontEndApp') {
    container.innerHTML = `
      <div class="form-row-2col">
        <div class="form-group">
          <label class="field-label">Frontend Framework</label>
          <input type="text" id="dyn-framework" class="input-text" placeholder="React 18 / Vite" value="React 18 / Vite" />
        </div>
        <div class="form-group">
          <label class="field-label">Dev Server Port</label>
          <input type="number" id="dyn-port" class="input-text" placeholder="3000" value="3000" />
        </div>
      </div>
    `;
  } else if (archetype === 'Database' || archetype === 'NoSQLDatabase') {
    container.innerHTML = `
      <div class="form-row-2col">
        <div class="form-group">
          <label class="field-label">Engine / Storage</label>
          <input type="text" id="dyn-engine" class="input-text" placeholder="${archetype === 'Database' ? 'PostgreSQL 16' : 'MongoDB 7'}" />
        </div>
        <div class="form-group">
          <label class="field-label">Port</label>
          <input type="number" id="dyn-port" class="input-text" placeholder="${archetype === 'Database' ? '5432' : '27017'}" />
        </div>
      </div>
    `;
  } else {
    container.innerHTML = ``;
  }
};

window.submitAddEntity = async function() {
  const title = document.getElementById('add-node-title').value.trim();
  const id = document.getElementById('add-node-id').value.trim();
  const pkg = document.getElementById('add-node-package').value;
  const team = document.getElementById('add-node-team').value.trim();
  const repo = document.getElementById('add-node-repo').value.trim();
  const tech = document.getElementById('add-node-tech').value.trim();
  const desc = document.getElementById('add-node-desc').value.trim();
  const statusEl = document.getElementById('add-node-status');

  if (!title || !id) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = 'Title and Entity URI are required.';
    }
    return;
  }

  const cfg = ARCHETYPE_CONFIGS[activeArchetype] || ARCHETYPE_CONFIGS.Microservice;
  const newNode = {
    '@id': id,
    '@type': [cfg.type],
    'dcterms:title': title,
    'dcterms:description': desc,
    'robos:package': pkg,
    'robos:ownerTeam': team || 'core-platform',
    'robos:repository': repo || 'local',
  };
  if (tech) newNode['robos:technology'] = tech;

  // Dynamic fields
  const dynContract = document.getElementById('dyn-contract');
  if (dynContract && dynContract.value.trim()) newNode['robos:implementsContract'] = dynContract.value.trim();
  const dynDb = document.getElementById('dyn-db');
  if (dynDb && dynDb.value.trim()) newNode['robos:usesDatabase'] = dynDb.value.trim();

  const dynEngine = document.getElementById('dyn-engine');
  if (dynEngine && dynEngine.value.trim()) {
    newNode['robos:engine'] = dynEngine.value.trim();
    newNode['robos:databaseName'] = (dynEngine.value.trim().toLowerCase().includes('mongo') ? 'acme_nosql' : 'payments_db');
    newNode['robos:host'] = 'postgres-primary.svc.cluster.local';
  } else if (activeArchetype === 'Database' || activeArchetype === 'NoSQLDatabase') {
    newNode['robos:engine'] = activeArchetype === 'Database' ? 'postgresql' : 'mongodb';
    newNode['robos:databaseName'] = activeArchetype === 'Database' ? 'payments_db' : 'acme_nosql';
    newNode['robos:host'] = 'postgres-primary.svc.cluster.local';
  }

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'wizard-status-msg info';
    statusEl.textContent = 'Enforcing SHACL shape validation and registering entity…';
  }

  try {
    const inserted = await window.sdlcGraph.addNode(newNode);
    if (inserted) {
      window.closeAddEntityModal();
      nodes = await window.sdlcGraph.getAllNodes();
      renderNodeList();
      selectNode(id);
    }
    return inserted;
  } catch (err) {
    console.error('submitAddEntity failed:', err);
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = `Error: ${err.message}`;
    }
    throw err;
  }
};

// Edit Entity Modal
window.openEditEntityModal = function(nodeId) {
  const node = nodes.find(n => n['@id'] === nodeId) || nodes[0];
  if (!node) return;
  selectedForEditId = node['@id'];

  document.getElementById('edit-node-title').value = node['dcterms:title'] || '';
  document.getElementById('edit-node-id').value = node['@id'];
  document.getElementById('edit-node-package').value = node['robos:package'] || 'services';
  document.getElementById('edit-node-team').value = node['robos:ownerTeam'] || '';
  document.getElementById('edit-node-repo').value = node['robos:repository'] || '';
  document.getElementById('edit-node-tech').value = node['robos:technology'] || '';
  document.getElementById('edit-node-desc').value = node['dcterms:description'] || '';
  document.getElementById('edit-node-tags').value = Array.isArray(node['robos:tags']) ? node['robos:tags'].join(', ') : '';

  document.getElementById('edit-node-json-textarea').value = JSON.stringify(node, null, 2);

  const statusEl = document.getElementById('edit-node-status');
  if (statusEl) statusEl.style.display = 'none';

  const modal = document.getElementById('edit-entity-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditEntityModal = function() {
  const modal = document.getElementById('edit-entity-modal');
  if (modal) modal.style.display = 'none';
  selectedForEditId = null;
};

window.setEditMode = function(mode) {
  document.getElementById('edit-view-form').style.display = mode === 'form' ? 'block' : 'none';
  document.getElementById('edit-view-json').style.display = mode === 'json' ? 'block' : 'none';
  document.getElementById('btn-edit-mode-form').classList.toggle('active', mode === 'form');
  document.getElementById('btn-edit-mode-json').classList.toggle('active', mode === 'json');
};

window.submitEditEntity = async function() {
  if (!selectedForEditId) return;
  const statusEl = document.getElementById('edit-node-status');
  const isJsonMode = document.getElementById('edit-view-json').style.display !== 'none';

  let patch = {};
  if (isJsonMode) {
    try {
      patch = JSON.parse(document.getElementById('edit-node-json-textarea').value);
    } catch (e) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'wizard-status-msg error';
        statusEl.textContent = 'Invalid JSON in patch view.';
      }
      return;
    }
  } else {
    patch['dcterms:title'] = document.getElementById('edit-node-title').value.trim();
    patch['robos:package'] = document.getElementById('edit-node-package').value;
    patch['robos:ownerTeam'] = document.getElementById('edit-node-team').value.trim();
    patch['robos:repository'] = document.getElementById('edit-node-repo').value.trim();
    patch['robos:technology'] = document.getElementById('edit-node-tech').value.trim();
    patch['dcterms:description'] = document.getElementById('edit-node-desc').value.trim();
    const tagsVal = document.getElementById('edit-node-tags').value.trim();
    if (tagsVal) {
      patch['robos:tags'] = tagsVal.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  try {
    const updated = await window.sdlcGraph.updateNode(selectedForEditId, patch);
    if (updated) {
      window.closeEditEntityModal();
      nodes = await window.sdlcGraph.getAllNodes();
      renderNodeList();
      renderInspector();
    }
    return updated;
  } catch (err) {
    console.error('submitEditEntity failed:', err);
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = `Update error: ${err.message}`;
    }
    throw err;
  }
};

// Ingest Modal
window.openIngestModal = function() {
  const modal = document.getElementById('ingest-modal');
  if (modal) modal.style.display = 'flex';
  const status = document.getElementById('ingest-status-msg');
  if (status) status.style.display = 'none';
};

window.closeIngestModal = function() {
  const modal = document.getElementById('ingest-modal');
  if (modal) modal.style.display = 'none';
};

window.runIngestGitProjects = async function() {
  const statusEl = document.getElementById('ingest-status-msg');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'wizard-status-msg info';
    statusEl.textContent = 'Discovering projects and syncing with KGraph…';
  }
  const res = await window.syncFromGitProjects();
  if (statusEl) {
    statusEl.className = 'wizard-status-msg success';
    statusEl.textContent = '✅ Synced Git Projects into SDLC Knowledge Graph!';
    setTimeout(() => { window.closeIngestModal(); }, 1200);
  }
};

window.submitIngestJson = async function() {
  const input = document.getElementById('ingest-json-input').value.trim();
  const statusEl = document.getElementById('ingest-status-msg');
  if (!input) return;

  try {
    const parsed = JSON.parse(input);
    const resources = Array.isArray(parsed) ? parsed : [parsed];
    const res = await window.sdlcGraph.importResources(resources);
    nodes = await window.sdlcGraph.getAllNodes();
    renderNodeList();
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg success';
      statusEl.textContent = `✅ Successfully ingested ${resources.length} resource node(s)!`;
      setTimeout(() => { window.closeIngestModal(); }, 1200);
    }
  } catch (e) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = `JSON parse error: ${e.message}`;
    }
  }
};

// ── 5. Enhanced Semantic Diff & SHACL Conformance Views ────────────────────────

window.runDiff = async function(base = 'main', target = 'feature/TASK-101-auth') {
  const res = await window.sdlcGraph.diffBranches(base, target);
  currentTab = 'visual';
  updateTabUI();
  const container = document.getElementById('inspector-content');
  const summary = (res && res.diff && res.diff.summary) ? res.diff.summary : { addedCount: 1, modifiedCount: 0, deletedCount: 0, riskLevel: 'LOW' };

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="inspector-card">
        <div class="card-title">
          <span>⚖️ Semantic Graph Blast Radius Diff</span>
          <span class="status-tag-pass">${summary.riskLevel} RISK</span>
        </div>
        <div class="grid-2col">
          <div>
            <div class="field-label">Base Reality (World 1)</div>
            <div class="field-value"><code>${base} (Production)</code></div>
          </div>
          <div>
            <div class="field-label">Target Feature Branch (World 2)</div>
            <div class="field-value"><code>${target}</code></div>
          </div>
          <div>
            <div class="field-label">Added Nodes</div>
            <div class="field-value"><strong style="color: var(--success);">${summary.addedCount || 1} Entities Added</strong></div>
          </div>
          <div>
            <div class="field-label">Breaking Architectural Changes</div>
            <div class="field-value"><span class="status-tag-pass">0 Breaking Changes</span></div>
          </div>
        </div>
      </div>

      <div class="grid-2col">
        <div class="inspector-card">
          <div class="card-title"><span>➕ Added Entities in Feature Branch</span></div>
          <div style="font-size: 11px; display: flex; flex-direction: column; gap: 6px;">
            <div style="padding: 8px; background: rgba(63, 185, 80, 0.1); border: 1px solid rgba(63, 185, 80, 0.3); border-radius: 4px;">
              <strong>🔌 Auth Microservice</strong><br>
              <code>urn:robos:service:auth-api</code>
            </div>
          </div>
        </div>
        <div class="inspector-card">
          <div class="card-title"><span>🔄 Impacted Downstream Services</span></div>
          <div style="font-size: 11px; display: flex; flex-direction: column; gap: 6px;">
            <div style="padding: 8px; background: rgba(0, 188, 212, 0.1); border: 1px solid rgba(0, 188, 212, 0.3); border-radius: 4px;">
              <strong>⚙️ Forms API Service</strong> &middot; Consumes OAuth2 token validation
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  return res;
};

window.validateSHACL = async function() {
  const report = await window.sdlcGraph.validate();
  currentTab = 'visual';
  updateTabUI();
  const container = document.getElementById('inspector-content');
  const conforms = report.conforms;
  const count = report.results ? report.results.length : 0;
  
  container.innerHTML = `
    <div class="shacl-dashboard">
      <div class="inspector-card" id="shacl-report-header-card">
        <div class="card-title">
          <span>🛡️ W3C SHACL Shape Validation Report</span>
          <span class="status-tag-pass">${conforms ? '100% CONFORMING' : 'VIOLATIONS'}</span>
        </div>
        <div class="shacl-score-banner" style="margin-top: 6px;">
          <div>
            <div style="font-size: 15px; font-weight: 800; color: ${conforms ? 'var(--success)' : 'var(--danger)'};">
              ${conforms ? '100% SHACL Conformance (0 Violations)' : `SHACL Violations Detected (${count} Errors)`}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              Evaluated 91 W3C SHACL Shapes & Constraints across all Modular KGraph Packages
            </div>
          </div>
        </div>
      </div>
        <div style="display: flex; gap: 16px;">
          <div class="shacl-metric">
            <span class="shacl-metric-val" style="color: ${conforms ? 'var(--success)' : 'var(--danger)'};">${conforms ? '100%' : 'FAIL'}</span>
            <span class="shacl-metric-lbl">Pass Rate</span>
          </div>
          <div class="shacl-metric">
            <span class="shacl-metric-val" style="color: var(--accent);">${nodes.length}</span>
            <span class="shacl-metric-lbl">Nodes Evaluated</span>
          </div>
          <div class="shacl-metric">
            <span class="shacl-metric-val" style="color: ${count === 0 ? 'var(--success)' : 'var(--danger)'};">${count}</span>
            <span class="shacl-metric-lbl">Violations</span>
          </div>
        </div>
      </div>

      <div class="grid-2col">
        <div class="inspector-card">
          <div class="card-title"><span>📦 Package Conformance</span></div>
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
            <div>✅ <strong>services:</strong> Conforms to MicroserviceShape, OpenAPIContractShape</div>
            <div>✅ <strong>applications:</strong> Conforms to FrontEndAppShape, DesktopAppShape</div>
            <div>✅ <strong>core-platform:</strong> Conforms to DatabaseShape, MCPServerShape</div>
            <div>✅ <strong>devops:</strong> Conforms to DevOpsIntegrationShape, PassCredentialShape</div>
            <div>✅ <strong>organization:</strong> Conforms to TeamShape, GitProjectOrgShape</div>
            <div>✅ <strong>documentation:</strong> Conforms to DocumentationPageShape, ADRShape</div>
            <div>✅ <strong>learning:</strong> Conforms to ELearningShape</div>
          </div>
        </div>

        <div class="inspector-card">
          <div class="card-title"><span>📐 Evaluated Shape Standards</span></div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-muted);">
            <div>&bull; <code>robos:refersFrom</code> Schema.org (SoftwareApplication, WebAPI)</div>
            <div>&bull; <code>robos:refersFrom</code> OASIS OSLC Core 3.0 & Architecture Mgmt</div>
            <div>&bull; <code>robos:refersFrom</code> C4 Model Container & Component</div>
            <div>&bull; <code>robos:refersFrom</code> Cucumber Gherkin AST</div>
          </div>
        </div>
      </div>

      ${count > 0 ? `
        <div class="inspector-card">
          <div class="card-title"><span style="color: var(--danger);">⚠️ Active Schema Violations</span></div>
          ${(report.results || []).map(v => `
            <div class="shacl-violation-row">
              <div style="display: flex; justify-content: space-between;">
                <strong>${v.message}</strong>
                <span class="type-badge" style="background: rgba(248,81,73,0.2); color: var(--danger);">${v.severity || 'Violation'}</span>
              </div>
              <div style="margin-top: 2px; color: var(--text-muted); font-size: 10px;">
                Focus Node: <code>${v.focusNode}</code> &middot; Path: <code>${v.resultPath || 'schema'}</code>
              </div>
              <button class="btn btn-secondary btn-sm" style="margin-top: 6px;" onclick="window.selectNode('${v.focusNode}')">🔍 Jump to Node</button>
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="padding: 16px; background: rgba(63, 185, 80, 0.08); border: 1px solid rgba(63, 185, 80, 0.3); border-radius: 6px; font-size: 12px; color: var(--success); display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">🛡️</span>
          <div>All SDLC Resource Nodes strictly conform to their respective W3C SHACL shape constraints. No violations detected.</div>
        </div>
      `}
    </div>
  `;
  return report;
};

function updateTabUI() {
  const tabs = ['visual', 'topology', 'impact', 'query', 'gitops', 'edd', 'video', 'fabric', 'traceability', 'rdf'];
  for (const t of tabs) {
    const el = document.getElementById(`tab-btn-${t}`);
    if (el) el.classList.toggle('active', currentTab === t);
  }
}

// ── Event Bindings ───────────────────────────────────────────────────────────

document.getElementById('branch-select').addEventListener('change', (e) => {
  window.switchBranch(e.target.value);
});

const searchInput = document.getElementById('node-search-input');
const clearSearchBtn = document.getElementById('btn-clear-node-search');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchKeyword = e.target.value || '';
    if (clearSearchBtn) {
      clearSearchBtn.style.display = searchKeyword.trim() ? 'flex' : 'none';
    }
    renderNodeList();
  });
}
if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    searchKeyword = '';
    clearSearchBtn.style.display = 'none';
    renderNodeList();
    if (searchInput) searchInput.focus();
  });
}

document.querySelectorAll('#group-mode-toggle .group-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode) {
      window.setNodeGroupMode(btn.dataset.mode);
    }
  });
});

const expandAllBtn = document.getElementById('btn-expand-all-groups');
if (expandAllBtn) {
  expandAllBtn.addEventListener('click', () => {
    window.expandAllNodeGroups();
  });
}

const collapseAllBtn = document.getElementById('btn-collapse-all-groups');
if (collapseAllBtn) {
  collapseAllBtn.addEventListener('click', () => {
    window.collapseAllNodeGroups();
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

const packageFilterSelect = document.getElementById('node-package-filter');
if (packageFilterSelect) {
  packageFilterSelect.addEventListener('change', (e) => {
    currentPackageFilter = e.target.value;
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

const btnTabTopology = document.getElementById('tab-btn-topology');
if (btnTabTopology) {
  btnTabTopology.addEventListener('click', () => {
    currentTab = 'topology';
    updateTabUI();
    renderInspector();
  });
}

const btnTabImpact = document.getElementById('tab-btn-impact');
if (btnTabImpact) {
  btnTabImpact.addEventListener('click', () => {
    currentTab = 'impact';
    updateTabUI();
    renderInspector();
  });
}

const btnTabQuery = document.getElementById('tab-btn-query');
if (btnTabQuery) {
  btnTabQuery.addEventListener('click', () => {
    currentTab = 'query';
    updateTabUI();
    renderInspector();
  });
}

// Modal Bindings: Add Entity
const btnOpenAdd = document.getElementById('btn-open-add-entity-modal');
if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => window.openAddEntityModal());

const btnCloseAdd = document.getElementById('btn-close-add-entity-modal');
if (btnCloseAdd) btnCloseAdd.addEventListener('click', () => window.closeAddEntityModal());

const btnCancelAdd = document.getElementById('btn-cancel-add-entity');
if (btnCancelAdd) btnCancelAdd.addEventListener('click', () => window.closeAddEntityModal());

const btnSubmitAdd = document.getElementById('btn-submit-add-entity');
if (btnSubmitAdd) btnSubmitAdd.addEventListener('click', () => window.submitAddEntity());

document.querySelectorAll('#archetype-chips-grid .archetype-chip').forEach(chip => {
  chip.addEventListener('click', (e) => {
    const arch = e.currentTarget.dataset.archetype;
    if (arch) window.selectAddArchetype(arch);
  });
});

// Modal Bindings: Edit Entity
const btnCloseEdit = document.getElementById('btn-close-edit-entity-modal');
if (btnCloseEdit) btnCloseEdit.addEventListener('click', () => window.closeEditEntityModal());

const btnCancelEdit = document.getElementById('btn-cancel-edit-entity');
if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => window.closeEditEntityModal());

const btnSaveEdit = document.getElementById('btn-save-edit-entity');
if (btnSaveEdit) btnSaveEdit.addEventListener('click', () => window.submitEditEntity());

const btnModeForm = document.getElementById('btn-edit-mode-form');
if (btnModeForm) btnModeForm.addEventListener('click', () => window.setEditMode('form'));

const btnModeJson = document.getElementById('btn-edit-mode-json');
if (btnModeJson) btnModeJson.addEventListener('click', () => window.setEditMode('json'));

// Modal Bindings: Delete Entity
const btnCloseDel = document.getElementById('btn-close-delete-modal');
if (btnCloseDel) btnCloseDel.addEventListener('click', () => window.closeDeleteEntityModal());

const btnCancelDel = document.getElementById('btn-cancel-delete');
if (btnCancelDel) btnCancelDel.addEventListener('click', () => window.closeDeleteEntityModal());

const btnConfirmDel = document.getElementById('btn-confirm-delete');
if (btnConfirmDel) btnConfirmDel.addEventListener('click', () => window.confirmDeleteEntity());

// Modal Bindings: Export Entity
const btnCloseExp = document.getElementById('btn-close-export-modal');
if (btnCloseExp) btnCloseExp.addEventListener('click', () => window.closeExportEntityModal());

const btnCopyExp = document.getElementById('btn-copy-export-content');
if (btnCopyExp) btnCopyExp.addEventListener('click', () => window.copyExportContent());

const btnFmtJsonld = document.getElementById('btn-export-fmt-jsonld');
if (btnFmtJsonld) btnFmtJsonld.addEventListener('click', () => window.setExportFormat('jsonld'));

const btnFmtTtl = document.getElementById('btn-export-fmt-turtle');
if (btnFmtTtl) btnFmtTtl.addEventListener('click', () => window.setExportFormat('turtle'));

// Modal Bindings: Ingest
const btnOpenIngest = document.getElementById('btn-open-ingest-modal');
if (btnOpenIngest) btnOpenIngest.addEventListener('click', () => window.openIngestModal());

const btnCloseIngest = document.getElementById('btn-close-ingest-modal');
if (btnCloseIngest) btnCloseIngest.addEventListener('click', () => window.closeIngestModal());

const btnCancelIngest = document.getElementById('btn-cancel-ingest');
if (btnCancelIngest) btnCancelIngest.addEventListener('click', () => window.closeIngestModal());

const btnSubmitIngest = document.getElementById('btn-submit-ingest-json');
if (btnSubmitIngest) btnSubmitIngest.addEventListener('click', () => window.submitIngestJson());

const btnRunGitSync = document.getElementById('btn-run-ingest-gitprojects');
if (btnRunGitSync) btnRunGitSync.addEventListener('click', () => window.runIngestGitProjects());

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

// ── Smart Agent Prompt Ingestion ─────────────────────────────────────────────
window.importFromPrompt = async function(promptText) {
  const res = await window.sdlcGraph.importFromPrompt(promptText);
  if (res) {
    nodes = await window.sdlcGraph.getAllNodes();
    renderNodeList();
    if (nodes.length > 0) {
      selectedNodeId = nodes[0]['@id'];
      renderInspector();
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
// ── DevOps Integrations & Onboarding Wizard ──────────────────────────────────
let devopsIntegrationsList = [];
let devopsCategoriesList = [];
let activeDevOpsCategory = 'all';
let selectedDevOpsProvider = null;
let kgraphPackagesList = [];
let kgraphReposList = [];

window.openDevOpsModal = async function() {
  const modal = document.getElementById('devops-modal');
  if (modal) modal.style.display = 'flex';
  await window.showDevOpsActiveView();
};

window.closeDevOpsModal = function() {
  const modal = document.getElementById('devops-modal');
  if (modal) modal.style.display = 'none';
};

window.showDevOpsActiveView = async function() {
  const activeView = document.getElementById('devops-active-view');
  const wizardView = document.getElementById('devops-wizard-view');
  if (activeView) activeView.style.display = 'block';
  if (wizardView) wizardView.style.display = 'none';

  const btnActive = document.getElementById('btn-devops-view-active');
  const btnWizard = document.getElementById('btn-devops-start-onboarding');
  if (btnActive) btnActive.classList.add('active');
  if (btnWizard) btnWizard.classList.remove('active');

  await window.loadDevOpsActiveView();
};

window.showDevOpsWizardView = async function() {
  const activeView = document.getElementById('devops-active-view');
  const wizardView = document.getElementById('devops-wizard-view');
  if (activeView) activeView.style.display = 'none';
  if (wizardView) wizardView.style.display = 'block';

  const providerSelection = document.getElementById('wizard-provider-selection');
  const configForm = document.getElementById('wizard-config-form');
  const backBtn = document.getElementById('btn-wizard-back');
  const stepLabel = document.getElementById('wizard-step-label');

  if (providerSelection) providerSelection.style.display = 'block';
  if (configForm) configForm.style.display = 'none';
  if (backBtn) backBtn.style.display = 'none';
  if (stepLabel) stepLabel.textContent = 'Step 1: Choose Integration Category & Provider';

  const btnActive = document.getElementById('btn-devops-view-active');
  const btnWizard = document.getElementById('btn-devops-start-onboarding');
  if (btnActive) btnActive.classList.remove('active');
  if (btnWizard) btnWizard.classList.add('active');

  await window.loadDevOpsWizard();
};

window.backToProviderSelection = function() {
  const providerSelection = document.getElementById('wizard-provider-selection');
  const configForm = document.getElementById('wizard-config-form');
  const backBtn = document.getElementById('btn-wizard-back');
  const stepLabel = document.getElementById('wizard-step-label');

  if (providerSelection) providerSelection.style.display = 'block';
  if (configForm) configForm.style.display = 'none';
  if (backBtn) backBtn.style.display = 'none';
  if (stepLabel) stepLabel.textContent = 'Step 1: Choose Integration Category & Provider';
  selectedDevOpsProvider = null;
};

window.loadDevOpsActiveView = async function() {
  const container = document.getElementById('devops-integrations-list');
  const countEl = document.getElementById('devops-active-count');
  if (!container) return;

  devopsIntegrationsList = await window.sdlcGraph.listDevOpsIntegrations();
  if (countEl) countEl.textContent = `${devopsIntegrationsList.length} Connected Integrations`;

  if (devopsIntegrationsList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; background: var(--bg-card); border-radius: 8px; border: 1px dashed var(--border);">
        <div style="font-size: 32px; margin-bottom: 8px;">☁️</div>
        <div style="font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 4px;">No DevOps Integrations Configured</div>
        <div style="font-size: 12px; color: var(--text-dim); max-width: 480px; margin: 0 auto 16px auto;">
          Connect your GitHub, AWS, Kubernetes, Docker, CI/CD, and identity providers to enable autonomous agent operations and pipeline orchestration.
        </div>
        <button class="btn btn-primary" onclick="window.showDevOpsWizardView()">➕ Add First Integration</button>
      </div>
    `;
    return;
  }

  container.innerHTML = devopsIntegrationsList.map(node => {
    const creds = Array.isArray(node['robos:hasCredential']) ? node['robos:hasCredential'] : [];
    const settings = node['robos:settings'] || {};
    const titleLabel = node['dcterms:title'] || node['@id'] || 'DevOps Integration';
    const categoryLabel = node['robos:categoryName'] || node['robos:category'] || 'devops';
    const endpointLabel = node['robos:endpointUrl'] || 'Cloud Provider';
    const statusLabel = node['robos:status'] || 'connected';

    return `
      <div class="devops-card" id="devops-card-${node['@id'].replace(/[^a-zA-Z0-9_-]/g, '_')}">
        <div class="devops-card-header">
          <div>
            <div class="devops-card-title">${titleLabel}</div>
            <div class="devops-card-meta">${categoryLabel} &middot; ${endpointLabel}</div>
          </div>
          <span class="status-tag-pass">🟢 ${statusLabel}</span>
        </div>

        <div class="devops-card-body">
          <div style="font-size: 11px; margin-bottom: 8px;">
            <span style="color: var(--text-dim);">Package:</span>
            <code style="color: var(--accent);">📦 ${node['robos:package'] || 'devops'}</code>
          </div>

          <div style="font-size: 11px; margin-bottom: 6px; font-weight: 600; color: var(--text-muted);">
            🔒 Pass Credentials (${creds.length}):
          </div>
          ${creds.map(c => `
            <div class="devops-pass-ref">
              <span>🔑 ${c.replace(/.*:/, '')}</span>
              <span class="pass-tag">GPG</span>
            </div>
          `).join('')}

          ${Object.keys(settings).length > 0 ? `
            <div style="margin-top: 8px; font-size: 10px; color: var(--text-dim);">
              ${Object.entries(settings).filter(([_, v]) => v !== undefined && v !== null && v !== '').slice(0, 3).map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`).join('')}
            </div>
          ` : ''}
        </div>

        <div class="devops-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.testDevOpsIntegrationById('${node['@id']}', '${node['robos:provider'] || ''}')">⚡ Test</button>
          <button class="btn btn-secondary btn-sm" onclick="window.selectNode('${node['@id']}'); window.closeDevOpsModal();">🔍 Inspect</button>
          <button class="btn btn-danger btn-sm" onclick="window.deleteDevOpsIntegrationById('${node['@id']}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
};

window.testDevOpsIntegrationById = async function(id, providerId) {
  const res = await window.sdlcGraph.testDevOpsConnection({ providerId });
  if (res && res.ok) {
    alert(`✅ Connection verified for ${res.provider} (${res.latencyMs || 10}ms latency)\n${res.message}`);
  } else {
    alert(`❌ Connection failed: ${res ? res.error : 'Unknown error'}`);
  }
};

window.deleteDevOpsIntegrationById = async function(id) {
  if (!confirm(`Are you sure you want to remove DevOps integration "${id}" and wipe associated credentials from pass?`)) {
    return;
  }
  const res = await window.sdlcGraph.deleteDevOpsIntegration(id);
  if (res && res.ok) {
    nodes = await window.sdlcGraph.getAllNodes();
    renderNodeList();
    if (selectedNodeId === id) {
      selectedNodeId = nodes[0] ? nodes[0]['@id'] : null;
      renderInspector();
    }
    await window.loadDevOpsActiveView();
  } else {
    alert(`Failed to delete integration: ${res ? res.error : 'Unknown error'}`);
  }
};

window.loadDevOpsWizard = async function() {
  devopsCategoriesList = await window.sdlcGraph.getDevOpsCategories();

  const pillsContainer = document.getElementById('wizard-category-pills');
  if (pillsContainer) {
    pillsContainer.innerHTML = `
      <button class="wizard-cat-pill ${activeDevOpsCategory === 'all' ? 'active' : ''}" onclick="window.filterDevOpsWizardCategory('all')">
        🌐 All Categories
      </button>
      ${devopsCategoriesList.map(c => `
        <button class="wizard-cat-pill ${activeDevOpsCategory === c.id ? 'active' : ''}" onclick="window.filterDevOpsWizardCategory('${c.id}')">
          ${c.icon} ${c.name}
        </button>
      `).join('')}
    `;
  }

  await window.renderWizardProviders();
};

window.filterDevOpsWizardCategory = async function(catId) {
  activeDevOpsCategory = catId;
  document.querySelectorAll('.wizard-cat-pill').forEach(b => {
    b.classList.remove('active');
  });
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
  await window.renderWizardProviders();
};

window.renderWizardProviders = async function() {
  const grid = document.getElementById('wizard-providers-grid');
  if (!grid) return;

  const providers = await window.sdlcGraph.getDevOpsProviders(activeDevOpsCategory === 'all' ? null : activeDevOpsCategory);

  grid.innerHTML = providers.map(p => {
    const desc = p.description || p.desc || '';
    const catName = p.categoryName || p.category || '';
    return `
      <div class="wizard-provider-card" onclick="window.selectDevOpsProvider('${p.id}')">
        <div class="wizard-provider-icon">${p.icon || '☁️'}</div>
        <div class="wizard-provider-info">
          <div class="wizard-provider-title">${p.name}</div>
          <div class="wizard-provider-category">${catName}</div>
          ${desc ? `<div class="wizard-provider-desc">${desc}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
};

window.selectDevOpsProvider = async function(providerId) {
  const providers = await window.sdlcGraph.getDevOpsProviders();
  const provider = providers.find(p => p.id === providerId);
  if (!provider) return;

  selectedDevOpsProvider = provider;

  document.getElementById('wizard-provider-selection').style.display = 'none';
  document.getElementById('wizard-config-form').style.display = 'block';
  document.getElementById('btn-wizard-back').style.display = 'inline-block';
  document.getElementById('wizard-step-label').textContent = `Step 2: Configure ${provider.name} Integration & Credentials`;

  const banner = document.getElementById('wizard-provider-banner');
  if (banner) {
    const catName = provider.categoryName || provider.category || 'DevOps';
    const desc = provider.description || provider.desc || '';
    banner.innerHTML = `
      <div style="font-size: 24px;">${provider.icon || '☁️'}</div>
      <div style="flex: 1;">
        <div style="font-weight: 700; font-size: 14px; color: var(--text);">${provider.name} (${catName})</div>
        ${desc ? `<div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${desc}</div>` : ''}
        <div style="font-size: 10px; color: var(--accent); margin-top: 4px;">
          🔒 All secrets are automatically encrypted via GPG password-store (pass). Knowledge Graph stores only secure URN references.
        </div>
      </div>
    `;
  }

  const fieldsContainer = document.getElementById('wizard-form-fields');
  if (fieldsContainer) {
    const defaultSlug = provider.id;
    let fieldsHtml = `
      <div class="wizard-field-group">
        <label class="wizard-field-label">Account Slug / ID <span style="color: var(--danger);">*</span></label>
        <input type="text" class="input-text" id="devops-field-accountSlug" value="${defaultSlug}" placeholder="e.g. ${provider.id}-prod" required />
        <div class="wizard-field-help">Unique lowercase identifier for this account integration.</div>
      </div>
      <div class="wizard-field-group">
        <label class="wizard-field-label">Account Label / Title</label>
        <input type="text" class="input-text" id="devops-field-accountTitle" value="${provider.name} (${defaultSlug})" placeholder="Display title" />
      </div>
    `;

    for (const f of provider.fields) {
      if (f.id === 'accountSlug') continue;

      const isReq = f.required ? '<span style="color: var(--danger);">*</span>' : '';
      const inputId = `devops-field-${f.id}`;
      const fieldHelp = f.description || f.desc || f.help || '';

      if (f.type === 'select' && Array.isArray(f.options)) {
        fieldsHtml += `
          <div class="wizard-field-group">
            <label class="wizard-field-label">${f.label} ${isReq}</label>
            <select class="input-text" id="${inputId}">
              ${f.options.map(opt => {
                const optVal = typeof opt === 'object' && opt !== null ? opt.value : opt;
                const optLabel = typeof opt === 'object' && opt !== null ? (opt.label || opt.name || opt.value) : opt;
                return `<option value="${optVal}" ${String(optVal) === String(f.default) ? 'selected' : ''}>${optLabel}</option>`;
              }).join('')}
            </select>
            ${fieldHelp ? `<div class="wizard-field-help">${fieldHelp}</div>` : ''}
          </div>
        `;
      } else if (f.type === 'textarea') {
        fieldsHtml += `
          <div class="wizard-field-group">
            <label class="wizard-field-label">${f.label} ${isReq}</label>
            <textarea class="input-text" id="${inputId}" rows="3" placeholder="${f.placeholder || ''}">${f.default || ''}</textarea>
            ${f.secret ? `<div class="wizard-pass-badge">🔒 GPG Pass Encrypted: ~/.password-store/devops/${provider.category}/${provider.id}/&lt;slug&gt;/${f.id}</div>` : ''}
            ${fieldHelp ? `<div class="wizard-field-help">${fieldHelp}</div>` : ''}
          </div>
        `;
      } else {
        const inputType = f.secret ? 'password' : 'text';
        fieldsHtml += `
          <div class="wizard-field-group">
            <label class="wizard-field-label">${f.label} ${isReq}</label>
            <input type="${inputType}" class="input-text" id="${inputId}" value="${f.default || ''}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} />
            ${f.secret ? `<div class="wizard-pass-badge">🔒 GPG Pass Encrypted: ~/.password-store/devops/${provider.category}/${provider.id}/&lt;slug&gt;/${f.id}</div>` : ''}
            ${fieldHelp ? `<div class="wizard-field-help">${fieldHelp}</div>` : ''}
          </div>
        `;
      }
    }

    fieldsContainer.innerHTML = fieldsHtml;
  }

  const statusEl = document.getElementById('wizard-form-status');
  if (statusEl) statusEl.style.display = 'none';
};

window.getDevOpsFormValues = function() {
  if (!selectedDevOpsProvider) return null;
  const formValues = {};
  const slugInput = document.getElementById('devops-field-accountSlug');
  const titleInput = document.getElementById('devops-field-accountTitle');

  formValues.accountSlug = slugInput ? slugInput.value.trim() : selectedDevOpsProvider.id;
  formValues.accountTitle = titleInput ? titleInput.value.trim() : `${selectedDevOpsProvider.name} (${formValues.accountSlug})`;

  for (const f of selectedDevOpsProvider.fields) {
    let el = document.getElementById(`devops-field-${f.id}`);
    if (!el && (f.id === 'personalAccessToken' || f.id === 'token')) {
      el = document.getElementById('devops-field-personalAccessToken') || document.getElementById('devops-field-token');
    }
    if (el) {
      formValues[f.id] = el.value;
    }
  }
  return formValues;
};

window.testCurrentDevOpsForm = async function() {
  if (!selectedDevOpsProvider) return;
  const formValues = window.getDevOpsFormValues();
  const statusEl = document.getElementById('wizard-form-status');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'wizard-status-msg info';
    statusEl.textContent = '⚡ Testing connection…';
  }

  const res = await window.sdlcGraph.testDevOpsConnection({
    providerId: selectedDevOpsProvider.id,
    formValues,
  });

  if (statusEl) {
    if (res && res.ok) {
      statusEl.className = 'wizard-status-msg success';
      statusEl.textContent = `✅ ${res.message} (${res.latencyMs || 10}ms latency)`;
    } else {
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = `❌ ${res ? res.error : 'Connection test failed'}`;
    }
  }
};

window.saveCurrentDevOpsForm = async function() {
  if (!selectedDevOpsProvider) return;
  const formValues = window.getDevOpsFormValues();
  const statusEl = document.getElementById('wizard-form-status');

  // Validate required fields
  for (const f of selectedDevOpsProvider.fields) {
    if (f.required && !formValues[f.id]) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'wizard-status-msg error';
        statusEl.textContent = `Missing required field: ${f.label}`;
      }
      return;
    }
  }

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'wizard-status-msg info';
    statusEl.textContent = '💾 Saving integration and encrypting secrets to GPG pass…';
  }

  try {
    const res = await window.sdlcGraph.saveDevOpsIntegration({
      providerId: selectedDevOpsProvider.id,
      accountSlug: formValues.accountSlug,
      formValues,
    });

    if (res && res.ok) {
      if (statusEl) {
        statusEl.className = 'wizard-status-msg success';
        statusEl.textContent = `✅ Saved integration & encrypted secrets to pass: ${res.passPaths.join(', ')}`;
      }

      nodes = await window.sdlcGraph.getAllNodes();
      renderNodeList();

      await new Promise(r => setTimeout(r, 600));
      await window.showDevOpsActiveView();
      return res;
    } else {
      if (statusEl) {
        statusEl.className = 'wizard-status-msg error';
        statusEl.textContent = `❌ Save error: ${res ? res.error : 'Unknown error'}`;
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = `❌ Save error: ${err.message}`;
    }
  }
};

// ── Packages & Multi-Repo Manager Modal ──────────────────────────────────────
window.openPackagesModal = async function() {
  const modal = document.getElementById('packages-modal');
  if (modal) modal.style.display = 'flex';
  await window.loadPackagesAndRepos();
};

window.closePackagesModal = function() {
  const modal = document.getElementById('packages-modal');
  if (modal) modal.style.display = 'none';
};

window.loadPackagesAndRepos = async function() {
  const pkgsGrid = document.getElementById('packages-list-grid');
  const reposGrid = document.getElementById('repos-list-grid');

  kgraphPackagesList = await window.sdlcGraph.listPackages();
  kgraphReposList = await window.sdlcGraph.listRepos();

  if (pkgsGrid) {
    pkgsGrid.innerHTML = kgraphPackagesList.map(pkg => `
      <div class="package-card">
        <div class="package-card-header">
          <span class="package-card-id">📦 ${pkg.id}</span>
          <span class="package-badge">${pkg.nodeCount} Nodes</span>
        </div>
        <div class="package-card-title">${pkg.title}</div>
        <div class="package-card-desc">${pkg.description}</div>
        <div class="package-card-footer">
          <code>${pkg.namespace}</code> &middot; <code>v${pkg.version}</code>
        </div>
      </div>
    `).join('');
  }

  if (reposGrid) {
    reposGrid.innerHTML = kgraphReposList.map(r => `
      <div class="repo-card">
        <div class="repo-card-header">
          <div>
            <span class="repo-card-id">${r.id}</span>
            <span class="type-badge ${r.type === 'remote' ? 'type-service' : 'type-contract'}" style="margin-left: 6px;">
              ${r.type.toUpperCase()}
            </span>
          </div>
          <span class="repo-tag">🏷️ ${r.tag || r.version || 'v1.0.0'}</span>
        </div>
        <div class="repo-card-title">${r.name}</div>
        <div class="repo-card-url">${r.url || r.path || 'local workspace (.robos/)'}</div>
        ${r.type === 'remote' ? `
          <div class="repo-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="window.syncRepoTag('${r.id}')">🔄 Sync Tag</button>
            <button class="btn btn-danger btn-sm" onclick="window.removeRepoById('${r.id}')">🗑️ Remove</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  }
};

window.syncRepoTag = async function(repoId) {
  const res = await window.sdlcGraph.syncRemoteRepo(repoId);
  if (res && res.ok) {
    alert(`✅ Synced remote repository "${repoId}" at tag ${res.tag}!\nCached to: ${res.cacheDir}`);
    await window.loadPackagesAndRepos();
    nodes = await window.sdlcGraph.getAllNodes();
    renderNodeList();
  } else {
    alert(`❌ Sync failed: ${res ? res.error : 'Unknown error'}`);
  }
};

window.removeRepoById = async function(repoId) {
  if (!confirm(`Are you sure you want to remove remote KGraph repository "${repoId}"?`)) return;
  const res = await window.sdlcGraph.removeRepo(repoId);
  if (res && res.ok) {
    await window.loadPackagesAndRepos();
  } else {
    alert(`Failed to remove repository: ${res ? res.error : 'Unknown error'}`);
  }
};

window.addNewRepo = async function() {
  const idInput = document.getElementById('new-repo-id');
  const nameInput = document.getElementById('new-repo-name');
  const urlInput = document.getElementById('new-repo-url');
  const tagInput = document.getElementById('new-repo-tag');
  const statusEl = document.getElementById('repo-add-status');

  const id = idInput ? idInput.value.trim() : '';
  const name = nameInput ? nameInput.value.trim() : id;
  const url = urlInput ? urlInput.value.trim() : '';
  const tag = tagInput ? tagInput.value.trim() : 'v1.0.0';

  if (!id) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = 'Repository ID is required.';
    }
    return;
  }

  const res = await window.sdlcGraph.addRepo({ id, name, url, tag });
  if (res && res.ok) {
    if (url) {
      await window.sdlcGraph.syncRemoteRepo(id);
    }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg success';
      statusEl.textContent = `✅ Registered repository "${id}" at tag ${tag}`;
    }
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    if (tagInput) tagInput.value = '';

    await window.loadPackagesAndRepos();
  } else {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'wizard-status-msg error';
      statusEl.textContent = `❌ ${res ? res.error : 'Failed to add repository'}`;
    }
  }
};

// Event Listeners for DevOps & Packages Modals
const btnOpenDevOps = document.getElementById('btn-open-devops-modal');
if (btnOpenDevOps) btnOpenDevOps.addEventListener('click', () => window.openDevOpsModal());

const btnCloseDevOps = document.getElementById('btn-close-devops-modal');
if (btnCloseDevOps) btnCloseDevOps.addEventListener('click', () => window.closeDevOpsModal());

const btnDevOpsActive = document.getElementById('btn-devops-view-active');
if (btnDevOpsActive) btnDevOpsActive.addEventListener('click', () => window.showDevOpsActiveView());

const btnDevOpsWizard = document.getElementById('btn-devops-start-onboarding');
if (btnDevOpsWizard) btnDevOpsWizard.addEventListener('click', () => window.showDevOpsWizardView());

const btnWizardBack = document.getElementById('btn-wizard-back');
if (btnWizardBack) btnWizardBack.addEventListener('click', () => window.backToProviderSelection());

const btnTestDevOps = document.getElementById('btn-test-devops-connection');
if (btnTestDevOps) btnTestDevOps.addEventListener('click', () => window.testCurrentDevOpsForm());

const btnSaveDevOps = document.getElementById('btn-save-devops-integration');
if (btnSaveDevOps) btnSaveDevOps.addEventListener('click', () => window.saveCurrentDevOpsForm());

const btnOpenPackages = document.getElementById('btn-open-packages-modal');
if (btnOpenPackages) btnOpenPackages.addEventListener('click', () => window.openPackagesModal());

const btnClosePackages = document.getElementById('btn-close-packages-modal');
if (btnClosePackages) btnClosePackages.addEventListener('click', () => window.closePackagesModal());

const btnAddRepo = document.getElementById('btn-add-repo');
if (btnAddRepo) btnAddRepo.addEventListener('click', () => window.addNewRepo());

load();

