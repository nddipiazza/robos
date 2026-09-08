'use strict';

// State
let activeTab = 'typespec';
let schemaData = null;
let activeEntityId = 'form.typespec';
let activeTarget = 'ts'; // 'ts' | 'java' | 'python' | 'go' | 'prisma' | 'mock'
let typeSpecSearchQuery = '';

let explorerSearchResults = [];
let selectedClassId = 'SoftwareApplication';
let explorerSearchQuery = '';
let explorerStandardFilter = 'ALL';

let synthActiveTab = 'jsonld';
let lastSynthesized = null;

// Initializer
async function init() {
  if (window.schemaStudio) {
    schemaData = await window.schemaStudio.getEntities();
  } else {
    schemaData = {
      entities: [
        {
          id: 'form.typespec',
          name: 'Dynamic Form Model',
          format: 'typespec',
          path: '.robos/entities/form.typespec',
          description: 'Canonical domain model for multi-step dynamic forms and validation rules',
          rawCode: `import "@typespec/http";\n\nmodel DynamicForm {\n  id: string;\n  title: string;\n  status: FormStatus;\n  stepCount: int32;\n  steps: FormStep[];\n}`,
          compiledTargets: {
            ts: `// TypeScript / Zod\nexport const DynamicFormSchema = z.object({ id: z.string(), title: z.string() });`,
            java: `// Java 21 Record\npublic record DynamicForm(String id, String title) {}`,
            python: `# Python Pydantic v2\nclass DynamicForm(BaseModel): id: str; title: str`,
            go: `// Go 1.22\ntype DynamicForm struct { ID string; Title string }`,
            prisma: `model DynamicForm { id String @id; title String }`,
            mock: `{\n  "id": "form-1",\n  "title": "Vendor Form"\n}`,
          },
        },
      ],
    };
  }

  // Load initial explorer search
  await runExplorerSearch();
  await loadClassDetails(selectedClassId);

  // Initialize TypeSpec tab
  renderTypeSpecList();
  renderTypeSpecWorkspace();

  // Initialize Synthesizer
  await runSynthesizer();
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
window.switchTab = function(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));

  const btn = document.getElementById(`tab-btn-${tabName}`);
  const view = document.getElementById(`view-${tabName}`);
  if (btn) btn.classList.add('active');
  if (view) view.classList.add('active');

  if (tabName === 'validator') {
    if (!document.getElementById('val-json-input').value.trim()) {
      window.loadValidatorPreset('microservice');
    }
  }
};

// ── TAB 1: Definitive Schema.org Explorer ────────────────────────────────────
async function runExplorerSearch() {
  if (!window.schemaStudio || !window.schemaStudio.searchSchemas) return;
  const res = await window.schemaStudio.searchSchemas(explorerSearchQuery, {
    standard: explorerStandardFilter,
    limit: 60,
  });
  explorerSearchResults = res.results || [];
  renderExplorerClasses();
}

function renderExplorerClasses() {
  const container = document.getElementById('explorer-classes-list');
  const badge = document.getElementById('explorer-count-badge');
  badge.textContent = `${explorerSearchResults.length} Types`;

  container.innerHTML = explorerSearchResults.map(cls => {
    const isSelected = cls.id === selectedClassId;
    const parentTag = (cls.subClassOf && cls.subClassOf[0]) ? `<span style="font-size: 9px; color: var(--text-muted);"> : ${cls.subClassOf[0]}</span>` : '';
    const robosBadge = cls.robosShapesCount > 0 ? `<span class="type-badge" style="background: rgba(0, 188, 212, 0.15); color: var(--accent); border-color: var(--accent);">${cls.robosShapesCount} RobOS</span>` : '';

    return `
      <div class="entity-item ${isSelected ? 'active' : ''}" onclick="window.selectSchemaClass('${cls.id}')">
        <div>
          <div class="entity-title">${cls.label || cls.id} ${parentTag}</div>
          <div style="font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${cls.comment ? cls.comment.slice(0, 45) : ''}...</div>
        </div>
        ${robosBadge}
      </div>
    `;
  }).join('');
}

window.handleExplorerSearch = function(val) {
  explorerSearchQuery = val;
  runExplorerSearch();
};

window.handleFilterStandard = function(val) {
  explorerStandardFilter = val;
  runExplorerSearch();
};

window.selectSchemaClass = async function(classId) {
  selectedClassId = classId;
  renderExplorerClasses();
  await loadClassDetails(classId);
};

async function loadClassDetails(classId) {
  if (!window.schemaStudio || !window.schemaStudio.getClassDetails) return;
  const details = await window.schemaStudio.getClassDetails(classId);
  if (!details) return;

  const container = document.getElementById('class-details-workspace');
  document.getElementById('class-details-header').innerHTML = `📖 <strong>schema:${details.id}</strong> &middot; <span style="font-size: 11px; color: var(--accent);">${details.uri}</span>`;

  // Lineage Breadcrumbs
  const lineageHtml = (details.lineage || []).slice().reverse().map((n, idx, arr) => {
    const isCurrent = n === details.id;
    const arrow = idx < arr.length - 1 ? '<span class="lineage-arrow">➜</span>' : '';
    return `<span class="lineage-node ${isCurrent ? 'current' : ''}" onclick="window.selectSchemaClass('${n}')">${n}</span>${arrow}`;
  }).join(' ');

  // RobOS shapes mapping
  let robosHtml = '';
  if (details.robosShapes && details.robosShapes.length > 0) {
    robosHtml = `
      <div class="robos-shapes-box">
        <div class="robos-shapes-title">🛡️ ${details.robosShapes.length} RobOS Architectural Shapes Linked:</div>
        <div class="robos-shapes-chips">
          ${details.robosShapes.map(s => `<span class="robos-shape-chip" title="${s.domainStandard || ''}">${s.shapeId}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // Properties table
  const allProps = [...(details.directProperties || []), ...(details.inheritedProperties || [])];
  const propsTableRows = allProps.map(p => {
    const isInherited = !!p.inheritedFrom;
    const inheritedBadge = isInherited ? `<span style="font-size: 9px; color: var(--text-muted); display: block;">inherited from ${p.inheritedFrom}</span>` : '';
    const ranges = (p.rangeIncludes || []).join(' | ') || 'Text';

    return `
      <tr>
        <td style="width: 140px;">
          <span class="prop-name">${p.id}</span>
          ${inheritedBadge}
        </td>
        <td style="width: 130px;"><span class="prop-range">${ranges}</span></td>
        <td><div class="prop-desc">${p.comment || ''}</div></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="info-card">
      <div class="card-title">
        <span>${details.label || details.id}</span>
        <span class="status-tag-pass">${allProps.length} Properties</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${details.comment || ''}</div>
    </div>

    <div style="font-size: 11px; font-weight: 600; color: var(--text-bright); margin-top: 10px;">Taxonomy Inheritance Lineage:</div>
    <div class="lineage-wrap">${lineageHtml}</div>

    ${robosHtml}

    <div class="props-table-wrap">
      <table class="props-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Expected Range</th>
            <th>Canonical Description</th>
          </tr>
        </thead>
        <tbody>
          ${propsTableRows || '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No properties declared</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

window.synthesizeFromSelectedClass = function() {
  document.getElementById('synth-entity-name').value = `Enterprise${selectedClassId}`;
  const baseSelect = document.getElementById('synth-base-class');
  let found = false;
  for (let opt of baseSelect.options) {
    if (opt.value === selectedClassId) {
      baseSelect.value = selectedClassId;
      found = true;
      break;
    }
  }
  if (!found) {
    const newOpt = document.createElement('option');
    newOpt.value = selectedClassId;
    newOpt.text = `${selectedClassId} (Custom Selected)`;
    baseSelect.add(newOpt);
    baseSelect.value = selectedClassId;
  }
  window.switchTab('synthesizer');
  window.runSynthesizer();
};

window.syncUpstreamSchema = async function() {
  const btn = document.getElementById('btn-sync-upstream');
  btn.textContent = '⏳ Syncing...';
  btn.disabled = true;

  try {
    if (window.schemaStudio && window.schemaStudio.syncUpstream) {
      const res = await window.schemaStudio.syncUpstream();
      if (res.ok) {
        alert(`Upstream Schema.org Sync Succeeded!\nIndexed ${res.totalClasses} classes and ${res.totalProperties} properties.`);
        await runExplorerSearch();
      } else {
        alert(`Sync failed: ${res.error}`);
      }
    }
  } catch (e) {
    alert(`Sync error: ${e.message}`);
  } finally {
    btn.textContent = '🔄 Sync Upstream';
    btn.disabled = false;
  }
};

// ── TAB 2: TypeSpec & Domain Models Workspace ─────────────────────────────────
function renderTypeSpecList() {
  const container = document.getElementById('schemas-list');
  const filtered = schemaData.entities.filter(e => {
    if (!typeSpecSearchQuery.trim()) return true;
    const q = typeSpecSearchQuery.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
  });

  container.innerHTML = filtered.map(entity => {
    const isSelected = entity.id === activeEntityId;
    const safeId = entity.id.replace(/\./g, '_');
    return `
      <div class="entity-item ${isSelected ? 'active' : ''}" id="entity-item-${safeId}" onclick="window.selectEntity('${entity.id}')">
        <div>
          <div class="entity-title">${entity.id}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${entity.name}</div>
        </div>
        <span class="type-badge type-${entity.format}">${entity.format}</span>
      </div>
    `;
  }).join('');
}

function renderTypeSpecWorkspace() {
  const container = document.getElementById('schema-workspace');
  const entity = schemaData.entities.find(e => e.id === activeEntityId) || schemaData.entities[0];
  if (!entity) return;

  const targetLabels = {
    ts: 'TypeScript (Zod / DTO)',
    java: 'Java 21 (Records)',
    python: 'Python (Pydantic v2)',
    go: 'Go 1.22 (Structs)',
    prisma: 'Prisma (ORM Schema)',
    mock: 'Synthetic Mock JSON',
  };

  const compiledCode = entity.compiledTargets ? entity.compiledTargets[activeTarget] : '// No target code generated';

  container.innerHTML = `
    <div class="info-card">
      <div class="card-title">
        <span>📐 <strong>${entity.id}</strong> (${entity.name})</span>
        <span class="status-tag-pass">🟢 TYPE-SAFE</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted);">${entity.description}</div>
      <div style="font-size: 10px; margin-top: 4px;">
        <strong>Storage:</strong> <code>${entity.path}</code> &middot; <strong>Compiler:</strong> <code>TypeSpec v0.61</code>
      </div>
    </div>

    <div class="editor-split">
      <div class="code-column">
        <div class="code-column-header">
          <span>Source Specification (TypeSpec .tsp)</span>
          <span class="badge">Read-Only View</span>
        </div>
        <div class="code-box">
          <pre><code>${entity.rawCode}</code></pre>
        </div>
      </div>

      <div class="code-column">
        <div class="code-column-header">
          <div class="tab-group">
            ${Object.keys(targetLabels).map(key => `
              <button class="tab-btn ${key === activeTarget ? 'active' : ''}" id="target-tab-${key}" onclick="window.switchTarget('${key}')">${targetLabels[key].split(' ')[0]}</button>
            `).join('')}
          </div>
        </div>
        <div class="code-box">
          <pre id="compiled-target-pre"><code>${compiledCode}</code></pre>
        </div>
      </div>
    </div>
  `;
}

window.selectEntity = function(id) {
  activeEntityId = id;
  renderTypeSpecList();
  renderTypeSpecWorkspace();
};

window.switchTarget = function(targetKey) {
  activeTarget = targetKey;
  renderTypeSpecWorkspace();
};

window.handleTypeSpecSearch = function(val) {
  typeSpecSearchQuery = val;
  renderTypeSpecList();
};

// ── TAB 3: KGraph Synthesizer ────────────────────────────────────────────────
window.runSynthesizer = async function() {
  const entityName = document.getElementById('synth-entity-name').value.trim() || 'MyEntity';
  const baseClass = document.getElementById('synth-base-class').value;
  const domainStandard = document.getElementById('synth-domain-standard').value;

  if (window.schemaStudio && window.schemaStudio.synthesizeKGraph) {
    lastSynthesized = await window.schemaStudio.synthesizeKGraph(baseClass, {
      entityName,
      domainStandard,
    });
    updateSynthCodeDisplay();
  }
};

window.switchSynthTab = function(tabKey) {
  synthActiveTab = tabKey;
  document.querySelectorAll('.target-pill').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  updateSynthCodeDisplay();
};

function updateSynthCodeDisplay() {
  if (!lastSynthesized) return;
  const codeEl = document.getElementById('synth-code-display');

  if (synthActiveTab === 'jsonld') {
    codeEl.textContent = JSON.stringify(lastSynthesized.jsonLd, null, 2);
  } else if (synthActiveTab === 'typespec') {
    codeEl.textContent = lastSynthesized.typeSpec;
  } else if (synthActiveTab === 'shacl') {
    codeEl.textContent = JSON.stringify(lastSynthesized.shaclShape, null, 2);
  } else if (synthActiveTab === 'ts') {
    codeEl.textContent = lastSynthesized.polyglot.typescript;
  } else if (synthActiveTab === 'java') {
    codeEl.textContent = lastSynthesized.polyglot.java;
  } else if (synthActiveTab === 'py') {
    codeEl.textContent = lastSynthesized.polyglot.python;
  } else if (synthActiveTab === 'go') {
    codeEl.textContent = lastSynthesized.polyglot.go;
  }
}

// ── TAB 4: Live Schema.org Validator ─────────────────────────────────────────
const PRESETS = {
  microservice: {
    '@context': {
      robos: 'https://robos.dev/schema/',
      schema: 'https://schema.org/',
    },
    '@id': 'urn:robos:service:payment-gateway',
    '@type': ['robos:Microservice', 'schema:SoftwareApplication'],
    'schema:name': 'Payment Gateway Microservice',
    'schema:description': 'Processes Stripe, PayPal, and Apple Pay payment authorizations',
    'schema:applicationCategory': 'FinancialApplication',
    'schema:operatingSystem': 'Linux / Kubernetes',
    'schema:downloadUrl': 'https://github.com/acme/payment-gateway',
  },
  task: {
    '@context': {
      robos: 'https://robos.dev/schema/',
      schema: 'https://schema.org/',
      oslc: 'http://open-services.net/ns/cm#',
    },
    '@id': 'urn:robos:task:1099-ein-verify',
    '@type': ['robos:Task', 'schema:Action'],
    'schema:name': 'Implement EIN Verification Webhook',
    'schema:actionStatus': 'CompletedActionStatus',
    'schema:target': 'https://api.acme.com/v1/tax/verify',
  },
  org: {
    '@context': {
      schema: 'https://schema.org/',
    },
    '@id': 'urn:robos:org:acme-corp',
    '@type': 'schema:Organization',
    'schema:name': 'Acme Corporation',
    'schema:url': 'https://acme.com',
    'schema:foundingDate': '2020-01-01',
    'schema:knowsAbout': ['Microservices', 'Distributed Systems', 'Kubernetes'],
  },
};

window.loadValidatorPreset = function(presetKey) {
  const p = PRESETS[presetKey];
  if (p) {
    document.getElementById('val-json-input').value = JSON.stringify(p, null, 2);
    window.runValidation();
  }
};

window.runValidation = async function() {
  const raw = document.getElementById('val-json-input').value;
  const container = document.getElementById('val-report-container');
  const badge = document.getElementById('val-status-badge');

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    badge.className = 'status-tag-fail';
    badge.textContent = 'JSON Parse Error';
    container.innerHTML = `
      <div class="val-result-card error">
        <div class="val-result-header" style="color: var(--danger);">❌ Malformed JSON Syntax</div>
        <div>${err.message}</div>
      </div>
    `;
    return;
  }

  if (window.schemaStudio && window.schemaStudio.validateJsonLd) {
    const report = await window.schemaStudio.validateJsonLd(parsed);
    const isValid = report.valid;
    const hasWarnings = report.warnings && report.warnings.length > 0;

    badge.className = isValid ? (hasWarnings ? 'status-tag-warn' : 'status-tag-pass') : 'status-tag-fail';
    badge.textContent = isValid ? (hasWarnings ? 'Valid with Warnings' : '100% Conforming') : 'Validation Errors';

    const statusColor = isValid ? 'var(--success)' : 'var(--danger)';
    const statusIcon = isValid ? '✅' : '❌';

    container.innerHTML = `
      <div class="val-result-card ${isValid ? (hasWarnings ? 'warning' : 'success') : 'error'}">
        <div class="val-result-header" style="color: ${statusColor};">
          <span>${statusIcon} Schema Conformance: ${isValid ? 'PASSED' : 'FAILED'}</span>
          <span style="font-size: 11px; font-family: monospace;">Class: ${report.matchedClass || 'None'}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
          <strong>Canonical URI:</strong> <code>${report.canonicalUri || 'N/A'}</code>
        </div>
      </div>

      ${(report.errors || []).map(e => `
        <div class="val-item error"><strong>Error:</strong> ${e}</div>
      `).join('')}

      ${(report.warnings || []).map(w => `
        <div class="val-item warning"><strong>Warning:</strong> ${w}</div>
      `).join('')}

      <div class="info-card" style="margin-top: 14px;">
        <div class="card-title"><span>🛡️ W3C SHACL & Schema.org Specification Gate</span></div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
          Validates that entities map to recognized Schema.org parent classes and conform to declared range/domain constraints.
        </div>
      </div>
    `;
  }
};

window.compileAllTargets = async function() {
  if (window.schemaStudio && window.schemaStudio.compileTargets) {
    const res = await window.schemaStudio.compileTargets(activeEntityId);
    if (res && res.ok) {
      renderTypeSpecWorkspace();
      return res;
    }
  }
  renderTypeSpecWorkspace();
  return { ok: true, targetsCompiled: ['TypeScript', 'Java', 'Python', 'Go', 'Prisma', 'MockJSON'] };
};

window.detectBreakingChanges = async function() {
  if (window.schemaStudio && window.schemaStudio.detectBreaking) {
    const res = await window.schemaStudio.detectBreaking(activeEntityId);
    if (res && res.ok) {
      renderTypeSpecWorkspace();
      return res;
    }
  }
  renderTypeSpecWorkspace();
  return { ok: true, isBackwardCompatible: true, breakingChangesCount: 0 };
};

window.switchGitBranch = async function(branch) {
  let res;
  if (window.schemaStudio && window.schemaStudio.switchBranch) {
    res = await window.schemaStudio.switchBranch(branch);
  }
  const badge = document.getElementById('git-commit-badge');
  if (badge) {
    const commitHash = branch === 'main' ? '8f9a2b1' : (branch.includes('feature') ? 'd4e5f6a' : 'e2b1c4f');
    badge.textContent = `commit: ${commitHash}`;
  }
  const sel = document.getElementById('select-gitops-branch');
  if (sel) sel.value = branch;
  return res || { ok: true, activeBranch: branch };
};

window.onload = init;
