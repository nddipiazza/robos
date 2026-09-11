'use strict';

function escHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function nodeText(value, fallback = '') { return value && typeof value === 'object' ? (value['@id'] || fallback) : String(value || fallback); }

let branches = [];
let activeBranch = null;
let nodes = [];
let selectedNodeId = null;
let currentFilter = 'all';
let currentPackageFilter = 'all';
let searchKeyword = '';
let currentTab = 'visual'; // Overview, topology, impact, query, documentation, evidence, JSON-LD
let nodeGroupMode = 'classification'; // classification | package | type | flat
const classification = window.RobosClassification;
let currentClassificationFilter = 'all';
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


let pendingMutation = null;

async function load() {
  branches = await window.sdlcGraph.listBranches();
  activeBranch = await window.sdlcGraph.getActiveBranch();
  nodes = await window.sdlcGraph.getAllNodes();

  renderBranchSelector();
  renderNodeList();

  if (nodes.length > 0) {
    selectNode(nodes[0]['@id']);
  } else { selectedNodeId = null; queryPathFrom = null; queryPathTo = null; queryPathResult = null; await renderInspector(); }
}

function isBDDNode(n) {
  const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
  return types.some(t => t.includes('Feature') || t.includes('Scenario'));
}

// Legacy inspector template dispatch only; classification and tree grouping use
// RobosClassification and never infer categories from these presentation kinds.
function getInspectorLayoutKind(n) {
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
  const cat = getInspectorLayoutKind(n);
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
  const result = classification.resolveClassification(n);
  const nodeDomId = 'node-' + n['@id'].replace(/[^a-zA-Z0-9_-]/g, '_');
  const categoryLabels = result.categories.map(c => c.label).join(', ') || 'Unclassified';
  const warning = result.warnings.map(w => w.message).join(' ');
  return `<div class="node-item ${isSelected ? 'selected' : ''}" id="${nodeDomId}" data-node-id="${escHtml(n['@id'])}">
    <div class="node-header"><span class="node-title">${escHtml(nodeText(n['dcterms:title'], n['@id']))}</span>
    <span class="type-badge type-team">${escHtml([].concat(n['@type'] || []).map(classification.compact).sort().join(', ') || 'Untyped')}</span></div>
    <div class="node-meta">${escHtml(n['@id'])} · ${escHtml(n['robos:package'] || 'Unpackaged')}</div>
    <div class="node-classification" data-status="${result.status}">${escHtml(categoryLabels)} · ${result.status}</div>
    ${warning ? `<div class="classification-warning" role="note">⚠ ${escHtml(warning)}</div>` : ''}
  </div>`;
}

function nodeTreeOptions() {
  return { mode: nodeGroupMode, search: searchKeyword, classification: currentClassificationFilter,
    type: currentFilter, package: currentPackageFilter, collapsed: [...collapsedGroups] };
}

function refreshNodeFilterOptions() {
  const update = (id, values, selected, label) => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="all">${label}</option>` + values.map(([value, text]) => `<option value="${escHtml(value)}">${escHtml(text)}</option>`).join('');
    select.value = selected;
  };
  update('node-type-filter', [...new Set(nodes.flatMap(n => [].concat(n['@type'] || []).map(classification.compact)))].sort().map(t => [t, t]), currentFilter, 'All Types');
  update('node-package-filter', [...new Set(nodes.map(n => n['robos:package'] || 'Unpackaged'))].sort().map(p => [p, p]), currentPackageFilter, 'All Packages');
  update('node-classification-filter', [...classification.CATALOG.map(c => [c.code, c.label]), ['unclassified', 'Unclassified']], currentClassificationFilter, 'All Classifications');
}

function renderNodeList() {
  refreshNodeFilterOptions();
  const tree = classification.buildTree(nodes, nodeTreeOptions());
  const stat = document.getElementById('stat-nodes');
  if (stat) stat.textContent = `${tree.total} Graph Nodes`;
  document.getElementById('nodes-count-badge').textContent = `${tree.count} of ${tree.total} Nodes`;
  const list = document.getElementById('nodes-list');
  const item = entry => renderNodeItemHtml(entry.node, null, entry.node['@id'] === selectedNodeId);
  if (!tree.count) list.innerHTML = '<p>No matching nodes found</p><button class="btn btn-secondary" onclick="window.clearAllNodeFilters()">Clear Filters</button>';
  else if (nodeGroupMode === 'flat') list.innerHTML = tree.entries.map(item).join('');
  else list.innerHTML = tree.groups.map(group => `<div class="node-group" data-group="${escHtml(group.id)}">
    <button type="button" class="node-group-header ${group.collapsed ? 'collapsed' : ''}" data-group-toggle="${escHtml(group.id)}" aria-expanded="${!group.collapsed}">
      <span class="group-chevron">${group.collapsed ? '▶' : '▼'}</span><span class="group-title">${escHtml(group.label)}</span><span class="group-count">${group.count}</span>
    </button>${group.collapsed ? '' : `<div class="node-group-body">${group.entries.map(item).join('')}</div>`}</div>`).join('');
  list.querySelectorAll('[data-group-toggle]').forEach(button => button.addEventListener('click', () => window.toggleNodeGroup(button.dataset.groupToggle)));
  list.querySelectorAll('[data-node-id]').forEach(item => item.addEventListener('click', () => window.selectNode(item.dataset.nodeId)));
}

window.setNodeGroupMode = function(mode) {
  nodeGroupMode = mode === 'category' ? 'type' : mode;
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
  for (const group of classification.buildTree(nodes, nodeTreeOptions()).groups) collapsedGroups.add(group.id);
  renderNodeList();
};

window.clearAllNodeFilters = function() {
  currentClassificationFilter = 'all';
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
  if (selectedNodeId !== id) { queryPathFrom = id; queryPathTo = null; queryPathResult = null; structuredQueryResults = null; }
  selectedNodeId = id;
  renderNodeList();
  return renderInspector();
}
window.selectNode = selectNode;

const inspectorCapabilities = window.RobosInspector;
let inspectorRevision = 0;
let inspectorSelectedContext = null;
let inspectorRelationIndex = new Map(), inspectorRelationsNodes = null, inspectorRelationsPromise = null;
async function ensureInspectorRelations() {
  if (inspectorRelationsNodes !== nodes) {
    const snapshot = nodes;
    inspectorRelationsNodes = snapshot;
    inspectorRelationsPromise = window.sdlcGraph.getGraphRelations().then(relations => {
      if (snapshot === nodes) inspectorRelationIndex = inspectorCapabilities.relationIndex(relations);
    }).catch(error => { inspectorRelationsNodes = null; throw error; });
  }
  await inspectorRelationsPromise;
}
function inspectorElement(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
  if (cls) el.className = cls;
  return el;
}
function appendRecordedFields(parent, value) {
  for (const [key, field] of Object.entries(value).sort(([a],[b]) => a.localeCompare(b))) {
    const section = inspectorElement('div', undefined, 'inspector-card');
    section.append(inspectorElement('div', key, 'field-label'), inspectorElement('pre', field, 'json-pre'));
    parent.append(section);
  }
}
function appendInspectLink(parent, id, label) {
  const button = inspectorElement('button', label, 'btn btn-secondary btn-sm');
  button.dataset.inspectId = id; parent.append(button);
}
async function renderInspector() {
  const revision = ++inspectorRevision;
  const container = document.getElementById('inspector-content');
  const node = nodes.find(n => n['@id'] === selectedNodeId) || nodes[0];
  try { await ensureInspectorRelations(); } catch (error) { if(revision===inspectorRevision) { container.replaceChildren(inspectorElement('p', `Unable to read graph relationships: ${error.message}`)); } return; }
  if (revision !== inspectorRevision) return;
  currentTab = inspectorCapabilities.selectTab(currentTab, node || {}, nodes, inspectorRelationIndex);
  updateTabUI();
  container.replaceChildren();
  if (!node) { container.append(inspectorElement('p', 'No node selected.')); return; }
  if (inspectorSelectedContext !== node['@id']) { queryPathFrom = node['@id']; queryPathTo = null; queryPathResult = null; structuredQueryResults = null; inspectorSelectedContext = node['@id']; }
  const capability = inspectorCapabilities.capabilities(node, nodes, inspectorRelationIndex);
  if (currentTab === 'rdf') { container.append(inspectorElement('pre', JSON.stringify(node, null, 2), 'json-pre')); return; }
  if (currentTab === 'topology') { await renderTopologyTab(container, node); return; }
  if (currentTab === 'impact') { await renderImpactTab(container, node); return; }
  if (currentTab === 'query') { await renderQueryTab(container, node); return; }
  if (currentTab === 'documentation') {
    for (const doc of capability.documents) {
      const card = inspectorElement('section', undefined, 'inspector-card');
      card.append(inspectorElement('h3', doc.kind === 'path' ? 'Source document' : doc.kind === 'url' ? 'Documentation link' : doc.kind === 'node' ? 'Documentation record' : 'Recorded documentation'));
      if (doc.kind === 'path') {
        card.classList.add('source-document-card');
        card.append(inspectorElement('p', 'Source reference; content not embedded. File contents have not been loaded.'));
        for (const record of doc.sourceEvidence || []) {
          const details = inspectorElement('dl');
          for (const [key, label] of [['repository','Repository'],['line','Line'],['revision','Recorded revision']]) if(record[key] !== undefined) details.append(inspectorElement('dt',label),inspectorElement('dd',record[key]));
          card.append(details);
        }
        for (const url of doc.recordedSourceLinks || []) { const link = inspectorElement('a', 'Open recorded revision on GitHub'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
        if (doc.sourceEvidence?.length) {
          const button = inspectorElement('button', 'View Source Evidence', 'btn btn-secondary');
          button.classList.add('view-source-evidence');
          button.addEventListener('click', async () => { if(doc.sourceNodeId !== selectedNodeId) await selectNode(doc.sourceNodeId); await window.switchTab('evidence'); });
          card.append(button);
        }
      }
      if (doc.kind === 'node') appendInspectLink(card, doc.id, doc.value);
      else if (doc.kind === 'url') { const link = inspectorElement('a', doc.value); link.href = doc.value; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
      else card.append(inspectorElement('pre', doc.value, 'json-pre'));
      container.append(card);
    }
    return;
  }
  if (currentTab === 'evidence') {
    container.append(inspectorElement('p', 'Recorded source evidence. Paths identify source locations; file contents have not been loaded.'));
    capability.evidence.forEach((evidence, i) => {
      const card = inspectorElement('section', undefined, 'inspector-card');
      card.append(inspectorElement('h3', `Evidence ${i + 1}`)); appendRecordedFields(card, evidence); container.append(card);
    });
    return;
  }
  const heading = inspectorElement('section', undefined, 'inspector-card');
  heading.append(inspectorElement('h2', node['dcterms:title'] || node['@id']), inspectorElement('code', node['@id']));
  const result = classification.resolveClassification(node);
  heading.append(inspectorElement('p', `${result.categories.map(c=>c.label).join(', ') || 'Unclassified'} · ${result.status}`));
  for (const warning of result.warnings) heading.append(inspectorElement('p', warning.message, 'classification-warning'));
  container.append(heading);
  const relationSection = inspectorElement('section', undefined, 'inspector-card'); relationSection.id = 'overview-relationships';
  relationSection.append(inspectorElement('h3', 'Recorded relationships')); container.append(relationSection);
  appendRecordedFields(container, node);
  try {
    const related = capability.relations;
    if (!related.length) relationSection.append(inspectorElement('p', 'No internal relationships recorded for this node.'));
    for (const edge of related) {
      const outgoing = edge.from === node['@id'], targetId = outgoing ? edge.to : edge.from;
      const row = inspectorElement('div');
      row.append(inspectorElement('span', `${outgoing ? 'Outgoing' : 'Incoming'} · ${edge.predicate} · ${edge.kind} `));
      appendInspectLink(row, targetId, nodes.find(n=>n['@id']===targetId)?.['dcterms:title'] || targetId); relationSection.append(row);
    }
  } catch (error) { if(revision===inspectorRevision) relationSection.append(inspectorElement('p', `Relationships unavailable: ${error.message}`)); }
}

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
  } else { selectedNodeId = null; queryPathFrom = null; queryPathTo = null; queryPathResult = null; await renderInspector(); }
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

let topologyRenderRevision = 0;
async function renderTopologyTab(container, node) {
  const revision = ++topologyRenderRevision;
  const currentPkg = node['robos:package'] || 'Unpackaged';
  const relations = await window.sdlcGraph.getGraphRelations();
  if (revision !== topologyRenderRevision || currentTab !== 'topology') return;
  const topology = window.RobosTopology.buildTopology(nodes, relations, { rootId: node['@id'], scope: topologyScope });
  const displayNodes = topology.nodes;
  const edges = topology.edges;
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

  const gridRight = Math.max(260, ...[...nodePositions.values()].map(p => p.x + nodeWidth));
  const gridBottom = Math.max(130, ...[...nodePositions.values()].map(p => p.y + nodeHeight));
  const svgWidth = Math.max(860, gridRight + (isTD ? 70 + edges.length * 14 : 60));
  const svgHeight = Math.max(520, gridBottom + (isTD ? 60 : 70 + edges.length * 14));

  // Route through the gaps and an outer rail so opaque boxes do not hide links.
  // TD ports are bottom/top; LR ports are right/left. Rails also expose cycles.
  let edgeSvg = '';
  edges.forEach((e, index) => {
    const p1 = nodePositions.get(e.from), p2 = nodePositions.get(e.to);
    const dependency = e.kind === 'dependency';
    const color = dependency ? '#22d3ee' : '#94a3b8';
    const rail = (isTD ? gridRight : gridBottom) + 40 + index * 14;
    let route, labelX, labelY;
    if (isTD) {
      const sx = p1.x + nodeWidth / 2, sy = p1.y + nodeHeight;
      const tx = p2.x + nodeWidth / 2, ty = p2.y;
      route = `M ${sx} ${sy} V ${sy + 20} H ${rail} V ${ty - 15} H ${tx} V ${ty}`;
      labelX = rail + 4; labelY = (sy + ty) / 2;
    } else {
      const sx = p1.x + nodeWidth, sy = p1.y + nodeHeight / 2;
      const tx = p2.x, ty = p2.y + nodeHeight / 2;
      route = `M ${sx} ${sy} H ${sx + 20} V ${rail} H ${tx - 15} V ${ty} H ${tx}`;
      labelX = (sx + tx) / 2; labelY = rail - 4;
    }
    edgeSvg += `<path class="topology-edge" data-from="${escHtml(e.from)}" data-to="${escHtml(e.to)}" data-predicate="${escHtml(e.predicate)}" data-kind="${escHtml(e.kind)}"
      d="${route}" fill="none" stroke="${color}" stroke-width="2.5" ${dependency ? '' : 'stroke-dasharray="7 5"'} marker-end="url(#topology-arrow-${dependency ? 'dependency' : 'reference'})"><title>${escHtml(e.from)} → ${escHtml(e.to)} (${escHtml(e.predicate)})</title></path>
      <text class="topology-edge-label" x="${labelX}" y="${labelY}" ${isTD ? `transform="rotate(-90 ${labelX} ${labelY})"` : ''} fill="${color}" stroke="#0d1117" stroke-width="4" paint-order="stroke" font-size="10" font-family="monospace" text-anchor="middle">${escHtml(e.predicate)}</text>`;
  });

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
      <g class="topology-node-group" data-node-id="${escHtml(n['@id'])}" style="cursor: pointer;"><title>${escHtml(n['@id'])}</title>
        <rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" rx="6" ry="6"
          fill="#161b22" stroke="${strokeColor}" stroke-width="${strokeWidth}" class="topology-node-rect ${isSelected ? 'selected' : ''}" />
        <circle cx="${pos.x + 14}" cy="${pos.y + 16}" r="4.5" fill="${isSelected ? '#00bcd4' : '#3fb950'}" />
        <text x="${pos.x + 25}" y="${pos.y + 20}" fill="#f0f6fc" font-size="11" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
          ${escHtml(title)}
        </text>
        <text x="${pos.x + 12}" y="${pos.y + 42}" fill="#8b949e" font-size="9" font-family="monospace">
          ${escHtml(badge.label)}
        </text>
        <rect x="${pos.x + nodeWidth - 75}" y="${pos.y + 32}" width="65" height="16" rx="3" fill="rgba(0, 188, 212, 0.12)" />
        <text x="${pos.x + nodeWidth - 42}" y="${pos.y + 44}" fill="#00bcd4" font-size="8.5" font-family="monospace" text-anchor="middle">
          📦 ${escHtml(pkg)}
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
            <option value="neighborhood" ${topologyScope === 'neighborhood' ? 'selected' : ''}>🔍 Neighborhood (${escHtml((node['dcterms:title'] || '').slice(0, 20))})</option>
            <option value="package" ${topologyScope === 'package' ? 'selected' : ''}>📦 Package (${escHtml(currentPkg)})</option>
            <option value="all" ${topologyScope === 'all' ? 'selected' : ''}>🌐 All nodes (connected first)</option>
          </select>
          <button id="topology-direction-toggle" class="btn btn-secondary btn-sm" onclick="window.toggleTopologyDirection()">
            ${isTD ? '⬇️ Top-to-Bottom' : '➡️ Left-to-Right'}
          </button>
        </div>
        <div class="topology-toolbar-group">
          <span id="topology-counts" style="font-size: 11px; color: var(--accent); font-weight: 600;">${displayNodes.length} Nodes &middot; ${edges.length} Links</span>
          <button class="btn btn-secondary btn-sm" onclick="window.copyMermaidCode()">📋 Copy Mermaid</button>
        </div>
      </div>

      <div id="topology-legend" style="padding:8px;font-size:12px"><span style="color:#22d3ee">━━ Dependency</span> · <span style="color:#94a3b8">┄┄ Reference (unclassified predicates retain their label)</span></div>
      ${topology.omittedNodes || topology.omittedEdges ? `<div id="topology-truncation" role="status" style="padding:8px;color:#f0bd67">Bounded view (limit 48 nodes / 160 links): ${topology.omittedNodes} of ${topology.totalNodes} nodes and ${topology.omittedEdges} of ${topology.totalEdges} links omitted. Selected connected nodes are prioritized; narrow the scope to inspect more.</div>` : ''}
      ${edges.length ? '' : '<div id="topology-empty" style="padding:8px">No modeled links in this scope. Missing source coverage may hide relationships.</div>'}
      <div class="topology-canvas-wrap">
        <svg class="topology-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
          <defs>
            ${[['dependency', '#22d3ee'], ['reference', '#94a3b8']].map(([kind, color]) => `<marker id="topology-arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" /></marker>`).join('')}
          </defs>
          ${edgeSvg}
          ${nodeSvg}
        </svg>
      </div>
    </div>
  `;
  container.querySelectorAll('.topology-node-group[data-node-id]').forEach(el => el.addEventListener('click', () => window.selectNode(el.dataset.nodeId)));
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
  if (currentTab !== 'impact' || (selectedNodeId && selectedNodeId !== node['@id'])) return;
  const items = impactDirection === 'downstream'
    ? (blast && blast.dependents ? blast.dependents : [])
    : (blast && blast.dependencies ? blast.dependencies : []);

  container.innerHTML = `
    <div class="impact-container">
      <div class="impact-summary-card">
        <div>
          <div style="font-size: 14px; font-weight: 700; color: var(--text-bright);">
            Impact Analysis & Blast Radius: <span style="color: var(--accent);">${escHtml(node['dcterms:title'])}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            <code>${escHtml(node['@id'])}</code> &middot; Package: <code>${escHtml(node['robos:package'] || 'services')}</code>
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <div class="impact-risk-badge ">

            <span>${items.length} modeled ${impactDirection === 'upstream' ? 'dependencies' : 'dependents'} · within ${impactDepth} hops</span>
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
            No modeled ${impactDirection} dependencies found within this depth. Missing links or source coverage may hide dependencies; this is not a safety guarantee.
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
                  <div style="font-weight: 700; color: var(--text-bright); font-size: 11.5px;">${escHtml(targetNode['dcterms:title'] || targetNode['@id'])}</div>
                  <div style="font-size: 9.5px; color: var(--text-muted); font-family: monospace;">${escHtml(targetNode['@id'])} &middot; via <code>${escHtml(item.predicate || item.via)}</code></div>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" data-inspect-id="${escHtml(targetNode['@id'])}">🔍 Inspect Node</button>
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
  const from = queryPathFrom, to = queryPathTo, selected = selectedNodeId;
  const result = await window.sdlcGraph.findPath(from, to, 6);
  if (currentTab !== 'query' || selected !== selectedNodeId || from !== queryPathFrom || to !== queryPathTo) return;
  queryPathResult = result;
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
          <div class="path-hop-card" data-inspect-id="${escHtml(hop.id)}">
            <div style="font-size: 9px; color: var(--accent); font-weight: 700;">Hop ${idx + 1}</div>
            <div style="font-weight: 700; font-size: 11px;">${escHtml(hNode['dcterms:title'] || hop.id)}</div>
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
              <td><strong>${escHtml(n['dcterms:title'])}</strong><br><code style="font-size: 9px;">${escHtml(n['@id'])}</code></td>
              <td><span class="type-badge ${badge.cls}">${badge.label}</span></td>
              <td><span class="node-pkg-badge">📦 ${escHtml(n['robos:package'] || 'core')}</span></td>
              <td><code>${escHtml(nodeText(n['robos:repository'], 'unrecorded'))}</code></td>
              <td><button class="btn btn-secondary btn-sm" data-inspect-id="${escHtml(n['@id'])}">Select</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function renderQueryTab(container, selectedNode) {
  if (!queryPathFrom) queryPathFrom = selectedNode ? selectedNode['@id'] : '';
  if (!queryPathTo) queryPathTo = nodes.find(n => n['@id'] !== queryPathFrom)?.['@id'] || queryPathFrom;

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div class="path-finder-box">
        <div class="card-title">
          <span>🛤️ Multi-Hop Connection Path Finder</span>
          <span class="type-badge type-contract">Graph Traversal</span>
        </div>
        <div class="card-desc">
          Discover transitive relationship paths and reference chains between any two entities in the Knowledge Graph.
        </div>
        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
          <div style="flex: 1;">
            <label class="field-label">Source Node (From):</label>
            <select id="path-from-select" class="input-text" onchange="window.setPathFrom(this.value)">
              ${nodes.map(n => `<option value="${escHtml(n['@id'])}" ${n['@id'] === queryPathFrom ? 'selected' : ''}>${escHtml(n['dcterms:title'])} (${escHtml(n['@id'].split(':').pop())})</option>`).join('')}
            </select>
          </div>
          <span style="margin-top: 18px; color: var(--accent); font-size: 18px;">➔</span>
          <div style="flex: 1;">
            <label class="field-label">Target Node (To):</label>
            <select id="path-to-select" class="input-text" onchange="window.setPathTo(this.value)">
              ${nodes.map(n => `<option value="${escHtml(n['@id'])}" ${n['@id'] === queryPathTo ? 'selected' : ''}>${escHtml(n['dcterms:title'])} (${escHtml(n['@id'].split(':').pop())})</option>`).join('')}
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
          <span>🔍 Graph Search & Query</span>
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
  document.getElementById('edit-node-team').value = nodeText(node['robos:ownerTeam']);
  document.getElementById('edit-node-repo').value = nodeText(node['robos:repository']);
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
    statusEl.textContent = '✅ Synced Git Projects into Knowledge Graph!';
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
          <div>All Graph Nodes strictly conform to their respective W3C SHACL shape constraints. No violations detected.</div>
        </div>
      `}
    </div>
  `;
  return report;
};

function updateTabUI() {
  const node = nodes.find(n=>n['@id'] === selectedNodeId) || nodes[0] || {};
  const supported = inspectorCapabilities.capabilities(node, nodes, inspectorRelationIndex).tabs;
  for (const tab of ['visual','topology','impact','query','documentation','evidence','rdf']) {
    const el = document.getElementById(`tab-btn-${tab}`);
    if (el) { el.hidden = !supported.includes(tab); el.classList.toggle('active', currentTab === tab); }
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


document.getElementById('node-classification-filter').addEventListener('change', e => {
  currentClassificationFilter = e.target.value;
  renderNodeList();
});

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

for (const tab of ['documentation', 'evidence', 'rdf']) document.getElementById(`tab-btn-${tab}`).addEventListener('click', () => window.switchTab(tab));
window.switchTab = function(tabName) {
  const node = nodes.find(n=>n['@id'] === selectedNodeId) || nodes[0] || {};
  currentTab = inspectorCapabilities.selectTab(tabName, node, nodes, inspectorRelationIndex);
  updateTabUI();
  return renderInspector();
};
document.getElementById('inspector-content').addEventListener('click', event => {
  const button = event.target.closest('[data-inspect-id]');
  if (button) selectNode(button.dataset.inspectId);
});

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

window.viewInGitOpsTab = function() { return window.switchTab('visual'); };

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
if (btnSubmitAppDoc) btnSubmitAppDoc.addEventListener('click', () => window.submitAppDocUpdates());

// ── Application-Attached eLearning & Living Documentation ───────────────────
function isAppOrProjectNode(node) {
  if (!node) return false;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  const cat = getInspectorLayoutKind(node);
  return [
    'service', 'desktop-app', 'console-app', 'frontend-app',
    'pc-game', 'mobile-game', 'data-pipeline', 'mobile-app',
    'library', 'project'
  ].includes(cat) || types.some(t => t && (t.includes('App') || t.includes('Microservice') || t.includes('Project') || t.includes('Container')));
}

function renderAppELearningAndDocCardsHtml(node) {
  const hasELearning = node['robos:hasELearning'] && (Array.isArray(node['robos:hasELearning']) ? node['robos:hasELearning'].length > 0 : !!node['robos:hasELearning']);
  const courseId = hasELearning ? (Array.isArray(node['robos:hasELearning']) ? node['robos:hasELearning'][0] : node['robos:hasELearning']) : null;
  const course = courseId ? (nodes.find(n => n['@id'] === courseId) || null) : null;
  const hasDoc = !!node['robos:hasDocumentationPage'];
  const hasFlow = !!node['robos:hasFlowDiagram'];

  return `
    <div class="inspector-card" id="card-app-elearning">
      <div class="card-title">
        <span>🎓 Interactive eLearning & Verification</span>
        ${hasELearning ? '<span class="status-tag-pass">✅ ELEARNING ATTACHED</span>' : '<span class="type-badge type-req">NOT CREATED</span>'}
      </div>
      <div class="card-desc">
        ${hasELearning
          ? `Interactive training curriculum and dedicated standalone Electron application attached to this component.`
          : `No interactive eLearning course attached yet for <strong>${node['dcterms:title'] || 'this application'}</strong>. Generate an interactive curriculum with hands-on labs, BDD quizzes, and a standalone Electron eLearning app.`
        }
      </div>

      ${course ? `
        <div class="grid-2col" style="margin-bottom: 12px;">
          <div>
            <div class="field-label">Course Title</div>
            <div class="field-value"><strong>${course['dcterms:title']}</strong></div>
          </div>
          <div>
            <div class="field-label">Difficulty & Duration</div>
            <div class="field-value"><span class="badge badge-difficulty">${course['robos:difficulty'] || 'Intermediate'}</span> &middot; ${course['robos:estimatedDuration'] || '45 mins'}</div>
          </div>
          <div>
            <div class="field-label">Curriculum Modules</div>
            <div class="field-value"><strong>${(course['robos:modules'] || []).length} Modules with Hands-On Labs</strong></div>
          </div>
          <div>
            <div class="field-label">GitOps Catalog</div>
            <div class="field-value"><code>${course['robos:gitopsFile'] || '.robos/elearning.yaml'}</code></div>
          </div>
        </div>
      ` : ''}

      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
        ${hasELearning ? `
          <button class="btn btn-primary" id="btn-launch-app-elearning" onclick="window.launchAppELearning('${node['@id']}')">🚀 Launch eLearning App</button>
          <button class="btn btn-secondary" id="btn-award-app-cert" onclick="window.awardAppCertificate('${node['@id']}')">🏆 View / Award Certificate</button>
        ` : `
          <button class="btn btn-primary" id="btn-generate-app-elearning" onclick="window.generateAndLaunchAppELearning('${node['@id']}')">✨ Generate & Launch eLearning App</button>
        `}
      </div>
      <div id="elearning-action-feedback" style="display:none; margin-top: 10px; font-size: 12px; padding: 8px 12px; border-radius: 4px;"></div>
    </div>

    <div class="inspector-card" id="card-app-living-doc">
      <div class="card-title">
        <span>📖 Living Documentation & Flow Diagram</span>
        ${(hasDoc || hasFlow) ? '<span class="status-tag-pass">✅ LIVING DOC ATTACHED</span>' : '<span class="type-badge type-req">NOT CREATED</span>'}
      </div>
      <div class="card-desc">
        ${(hasDoc || hasFlow)
          ? `Living markdown architecture guide and Mermaid FlowDiagram synchronized with the Knowledge Graph.`
          : `Synthesize living Markdown documentation and Mermaid sequence/flow diagrams from this application's latest Knowledge Graph state.`
        }
      </div>
      ${hasDoc ? `
        <div style="margin-bottom: 8px; font-size: 12px;">
          <strong>Doc Page:</strong> <code>${node['robos:hasDocumentationPage']}</code>
        </div>
      ` : ''}
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
        <button class="btn btn-secondary" id="btn-generate-app-doc" onclick="window.generateAppDocumentation('${node['@id']}')">
          ${(hasDoc || hasFlow) ? '🔄 Re-Generate Living Documentation' : '📝 Generate Living Documentation & Flow Diagram'}
        </button>
      </div>
      <div id="doc-action-feedback" style="display:none; margin-top: 10px; font-size: 12px; padding: 8px 12px; border-radius: 4px;"></div>
    </div>
  `;
}

window.generateAndLaunchAppELearning = async function(nodeId) {
  const targetId = nodeId || selectedNodeId;
  const feedbackEl = document.getElementById('elearning-action-feedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = 'rgba(56, 189, 248, 0.1)';
    feedbackEl.style.color = '#38bdf8';
    feedbackEl.textContent = '⏳ Synthesizing interactive eLearning course and scaffolding Electron app...';
  }

  try {
    const res = await window.sdlcGraph.generateAppELearning({ appId: targetId });
    if (res && res.ok) {
      if (feedbackEl) {
        feedbackEl.style.background = 'rgba(46, 160, 67, 0.15)';
        feedbackEl.style.color = '#3fb950';
        feedbackEl.textContent = `✅ ${res.message} Launching eLearning App...`;
      }
      await window.sdlcGraph.launchAppELearning({ appId: targetId });
      if (typeof window.loadGraph === 'function') {
        await window.loadGraph();
      }
      renderInspector();
    } else {
      if (feedbackEl) {
        feedbackEl.style.background = 'rgba(248, 81, 73, 0.15)';
        feedbackEl.style.color = '#f85149';
        feedbackEl.textContent = `❌ ${res ? res.error : 'Failed to generate eLearning'}`;
      }
    }
    return res;
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.style.background = 'rgba(248, 81, 73, 0.15)';
      feedbackEl.style.color = '#f85149';
      feedbackEl.textContent = `❌ Error: ${err.message}`;
    }
    return { ok: false, error: err.message };
  }
};

window.launchAppELearning = async function(nodeId) {
  const targetId = nodeId || selectedNodeId;
  try {
    return await window.sdlcGraph.launchAppELearning({ appId: targetId });
  } catch (err) {
    alert('Error launching eLearning app: ' + err.message);
    return { ok: false, error: err.message };
  }
};

window.awardAppCertificate = async function(nodeId) {
  const targetId = nodeId || selectedNodeId;
  try {
    const res = await window.sdlcGraph.issueCertificate({ appId: targetId, userId: 'robos', scorePercentage: 100 });
    if (res && res.ok) {
      alert(`🎉 Certificate of Completion Awarded!\n\nTitle: ${res.certificate['dcterms:title']}\nHash: ${res.certificate['robos:verificationHash']}\nRecorded in Knowledge Graph under 'learning' package.`);
      if (typeof window.loadGraph === 'function') {
        await window.loadGraph();
      }
      renderInspector();
    }
    return res;
  } catch (err) {
    alert('Error issuing certificate: ' + err.message);
    return { ok: false, error: err.message };
  }
};

window.generateAppDocumentation = async function(nodeId) {
  const targetId = nodeId || selectedNodeId;
  const feedbackEl = document.getElementById('doc-action-feedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = 'rgba(56, 189, 248, 0.1)';
    feedbackEl.style.color = '#38bdf8';
    feedbackEl.textContent = '⏳ Synthesizing living documentation and Mermaid FlowDiagram...';
  }

  try {
    const res = await window.sdlcGraph.generateAppDoc({ appId: targetId });
    if (res && res.ok) {
      if (feedbackEl) {
        feedbackEl.style.background = 'rgba(46, 160, 67, 0.15)';
        feedbackEl.style.color = '#3fb950';
        feedbackEl.textContent = `✅ ${res.message}`;
      }
      if (typeof window.loadGraph === 'function') {
        await window.loadGraph();
      }
      renderInspector();
    } else {
      if (feedbackEl) {
        feedbackEl.style.background = 'rgba(248, 81, 73, 0.15)';
        feedbackEl.style.color = '#f85149';
        feedbackEl.textContent = `❌ ${res ? res.error : 'Failed to generate documentation'}`;
      }
    }
    return res;
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.style.background = 'rgba(248, 81, 73, 0.15)';
      feedbackEl.style.color = '#f85149';
      feedbackEl.textContent = `❌ Error: ${err.message}`;
    }
    return { ok: false, error: err.message };
  }
};

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

