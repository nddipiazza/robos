'use strict';

let schemaData = null;
let activeEntityId = 'form.typespec';
let activeTarget = 'ts'; // 'ts' | 'java' | 'python' | 'go' | 'prisma' | 'mock'
let searchQuery = '';
let isCompiled = false;
let isBreakingAudited = false;

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

  renderStats();
  renderSchemasList();
  renderWorkspace();
}

function renderStats() {
  document.getElementById('stat-entities-count').textContent = `${schemaData.entities.length} Domain Models`;
  document.getElementById('schemas-count-badge').textContent = `${schemaData.entities.length} Models`;

  const entity = schemaData.entities.find(e => e.id === activeEntityId) || schemaData.entities[0];
  document.getElementById('stat-active-format').textContent = entity.format === 'typespec' ? 'Microsoft TypeSpec (.tsp)' : entity.format.toUpperCase();
}

function renderSchemasList() {
  const container = document.getElementById('schemas-list');
  const filtered = schemaData.entities.filter(e => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
  });

  container.innerHTML = filtered.map(entity => {
    const isSelected = entity.id === activeEntityId;
    const safeDomId = 'entity-item-' + entity.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    return `
      <div class="entity-item ${isSelected ? 'active' : ''}" id="${safeDomId}" onclick="window.selectEntity('${entity.id}')">
        <div>
          <div class="entity-title">${entity.id}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${entity.name}</div>
        </div>
        <span class="type-badge type-${entity.format}">${entity.format}</span>
      </div>
    `;
  }).join('');
}

function renderWorkspace() {
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
    <!-- Top Schema Details -->
    <div class="info-card" id="schema-info-card">
      <div class="card-title">
        <span>📐 <strong>${entity.id}</strong> (${entity.name})</span>
        <span class="status-tag-pass" id="schema-status-pill">${isBreakingAudited ? '🛡️ 100% BACKWARD COMPATIBLE' : '🟢 0 SYNTAX ERRORS'}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted);">${entity.description}</div>
      <div style="font-size: 10px; margin-top: 4px;">
        <strong>Storage Location:</strong> <code>${entity.path}</code> &middot; <strong>Compiler:</strong> <code>TypeSpec v0.61</code>
      </div>
    </div>

    <!-- Raw Schema Code Block -->
    <div>
      <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Canonical TypeSpec DSL:</div>
      <pre class="code-pre" id="raw-schema-pre">${entity.rawCode}</pre>
    </div>

    <!-- Multi-Language Target Code Generation Tabs -->
    <div style="margin-top: 8px;">
      <div style="font-size: 10px; color: var(--accent); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">
        ⚡ Compiled Multi-Language Targets (${isCompiled ? '6/6 Generated in 48ms' : 'Ready to Compile'}):
      </div>

      <div class="target-tabs">
        <button class="target-tab ${activeTarget === 'ts' ? 'active' : ''}" id="target-tab-ts" onclick="window.switchTarget('ts')">TypeScript (Zod)</button>
        <button class="target-tab ${activeTarget === 'java' ? 'active' : ''}" id="target-tab-java" onclick="window.switchTarget('java')">Java 21 (Records)</button>
        <button class="target-tab ${activeTarget === 'python' ? 'active' : ''}" id="target-tab-py" onclick="window.switchTarget('python')">Python (Pydantic)</button>
        <button class="target-tab ${activeTarget === 'go' ? 'active' : ''}" id="target-tab-go" onclick="window.switchTarget('go')">Go 1.22 (Structs)</button>
        <button class="target-tab ${activeTarget === 'prisma' ? 'active' : ''}" id="target-tab-prisma" onclick="window.switchTarget('prisma')">Prisma (ORM)</button>
        <button class="target-tab ${activeTarget === 'mock' ? 'active' : ''}" id="target-tab-mock" onclick="window.switchTarget('mock')">Synthetic Mock JSON</button>
      </div>

      <pre class="code-pre" id="compiled-target-pre" style="margin-top: 6px;">${compiledCode}</pre>
    </div>
  `;
}

window.selectEntity = function(id) {
  activeEntityId = id;
  renderStats();
  renderSchemasList();
  renderWorkspace();
};

window.switchGitBranch = async function(branchName) {
  if (window.schemaStudio) {
    const res = await window.schemaStudio.switchBranch(branchName);
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

window.switchTarget = function(targetKey) {
  activeTarget = targetKey;
  renderWorkspace();
};

window.compileAllTargets = async function() {
  if (window.schemaStudio) {
    const res = await window.schemaStudio.compileTargets(activeEntityId);
    if (res.ok) {
      isCompiled = true;
      renderWorkspace();
      return res;
    }
  } else {
    isCompiled = true;
    renderWorkspace();
    return { ok: true, targetsCompiled: 6 };
  }
};

window.detectBreakingChanges = async function() {
  if (window.schemaStudio) {
    const res = await window.schemaStudio.detectBreaking(activeEntityId);
    if (res.ok) {
      isBreakingAudited = true;
      renderWorkspace();
      return res;
    }
  } else {
    isBreakingAudited = true;
    renderWorkspace();
    return { ok: true, breakingChangesCount: 0 };
  }
};

const searchInput = document.getElementById('schema-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderSchemasList();
  });
}

init();
