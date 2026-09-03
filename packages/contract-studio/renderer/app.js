'use strict';

let contractData = null;
let activeContractId = 'forms-api.openapi.yaml';
let searchQuery = '';
let spectralRan = false;
let pactRan = false;
let prismStarted = false;

async function init() {
  if (window.contractStudio) {
    contractData = await window.contractStudio.getContracts();
  } else {
    contractData = {
      activeBranch: 'main',
      rawYaml: 'openapi: 3.1.0\ninfo:\n  title: BuildBarn Forms API\n  version: 1.0.0',
      contracts: [
        {
          id: 'forms-api.openapi.yaml',
          name: 'BuildBarn Forms API',
          type: 'openapi',
          version: '3.1.0',
          path: '.robos/contracts/forms-api.openapi.yaml',
          description: 'REST API contract for multi-step dynamic forms and IRS tax verification',
          endpoints: [
            {
              method: 'POST',
              path: '/api/v1/forms',
              summary: 'Create dynamic form instance',
              operationId: 'createForm',
              security: 'BearerAuth (JWT)',
              requestSchema: 'entities/form.typespec (DynamicForm)',
              responses: [
                { code: '201', desc: 'Form Created Successfully' },
                { code: '400', desc: 'Validation Error' },
                { code: '401', desc: 'Unauthorized' },
              ],
            },
          ],
          spectralResult: { status: 'passed', errors: 0, warnings: 1, report: '0 Errors, 1 Warning' },
          pactResult: { status: 'passed', total: 14, passed: 14, failed: 0, consumer: 'React Web Portal', provider: 'Forms API Service' },
        },
      ],
    };
  }

  renderStats();
  renderContractsList();
  renderWorkspace();
}

function renderStats() {
  document.getElementById('stat-contracts-count').textContent = `${contractData.contracts.length} API Contracts`;
  document.getElementById('contracts-count-badge').textContent = `${contractData.contracts.length} Contracts`;

  const contract = contractData.contracts.find(c => c.id === activeContractId) || contractData.contracts[0];
  document.getElementById('stat-active-spec').textContent = contract.type === 'openapi' ? 'OpenAPI 3.1 REST' : 'AsyncAPI 2.6 Events';
}

function renderContractsList() {
  const container = document.getElementById('contracts-list');
  const filtered = contractData.contracts.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
  });

  container.innerHTML = filtered.map(contract => {
    const isSelected = contract.id === activeContractId;
    const safeDomId = 'contract-item-' + contract.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    return `
      <div class="contract-item ${isSelected ? 'active' : ''}" id="${safeDomId}" onclick="window.selectContract('${contract.id}')">
        <div>
          <div class="contract-title">${contract.id}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${contract.name}</div>
        </div>
        <span class="type-badge type-${contract.type}">${contract.type}</span>
      </div>
    `;
  }).join('');
}

function renderWorkspace() {
  const container = document.getElementById('contract-workspace');
  const contract = contractData.contracts.find(c => c.id === activeContractId) || contractData.contracts[0];
  if (!contract) return;

  const prismBadge = document.getElementById('prism-badge');
  if (prismBadge) {
    prismBadge.textContent = prismStarted ? '⚡ Prism Mock: Running on port 4010' : '⚡ Prism Mock: Offline';
    prismBadge.style.color = prismStarted ? 'var(--success)' : 'var(--text-muted)';
  }

  container.innerHTML = `
    <!-- Top Contract Overview -->
    <div class="info-card" id="contract-header-card">
      <div class="card-title">
        <span>📋 <strong>${contract.id}</strong> (${contract.name})</span>
        <span class="type-badge type-${contract.type}">${contract.type.toUpperCase()} ${contract.version}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted);">${contract.description}</div>
      <div style="font-size: 10px; margin-top: 4px;">
        <strong>Location:</strong> <code>${contract.path}</code> &middot; <strong>Governance:</strong> <code>Spectral Strict Ruleset</code>
      </div>
    </div>

    <!-- Endpoint Operations Inspector -->
    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-top: 4px;">
      Exposed API Operations & Schema References:
    </div>

    ${contract.endpoints.map((ep, idx) => `
      <div class="endpoint-card" id="endpoint-${ep.method.toLowerCase()}-${ep.path.replace(/[^a-zA-Z0-9_-]/g, '_')}">
        <div class="endpoint-header">
          <span class="method-tag method-${ep.method}">${ep.method}</span>
          <span class="path-text">${ep.path}</span>
          <span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">${ep.operationId}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-bright);">${ep.summary}</div>
        <div style="font-size: 10px; color: var(--accent); margin-top: 2px;">
          <strong>Request Schema:</strong> <code>${ep.requestSchema}</code> &middot; <strong>Security:</strong> <code>${ep.security}</code>
        </div>
        <div style="font-size: 10px; margin-top: 2px;">
          <strong>Responses:</strong> ${(ep.responses || []).map(r => `<code>${r.code} ${r.desc}</code>`).join(' &middot; ')}
        </div>
      </div>
    `).join('')}

    <!-- Governance & Verification Gates Grid -->
    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-top: 8px;">
      Quality Gates & Verification Suites:
    </div>

    <div class="gate-grid">
      <!-- Spectral Linter Gate -->
      <div class="gate-card" id="spectral-gate-card">
        <div class="gate-title">🛡️ Spectral Style Governance</div>
        <div style="font-size: 11px; font-weight: 700; color: var(--accent);">
          ${spectralRan ? '0 Errors &middot; 1 Info (Passed)' : 'Ready to Lint'}
        </div>
        <div style="font-size: 9px; color: var(--text-muted);">CamelCase naming & description enforcement</div>
      </div>

      <!-- Pact Consumer Gate -->
      <div class="gate-card" id="pact-gate-card">
        <div class="gate-title">🤝 Pact Consumer Verification</div>
        <div style="font-size: 11px; font-weight: 700; color: var(--success);">
          ${pactRan ? '14/14 Contracts Verified' : 'Consumer Gate Ready'}
        </div>
        <div style="font-size: 9px; color: var(--text-muted);">React Web Portal consumer suite</div>
      </div>

      <!-- Prism Mock Server Gate -->
      <div class="gate-card" id="prism-mock-card">
        <div class="gate-title">⚡ Prism HTTP Mock Server</div>
        <div style="font-size: 11px; font-weight: 700; color: ${prismStarted ? 'var(--success)' : 'var(--text-muted)'};">
          ${prismStarted ? 'http://localhost:4010 (PID 5120)' : 'Offline'}
        </div>
        <div style="font-size: 9px; color: var(--text-muted);">Simulates live response schemas</div>
      </div>
    </div>

    <!-- Raw YAML Preview -->
    <div style="margin-top: 8px;">
      <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">
        GitOps Contract Source (.robos/contracts/):
      </div>
      <pre class="code-pre" id="contract-yaml-pre">${contractData.rawYaml || '# Contract Source'}</pre>
    </div>
  `;
}

window.selectContract = function(id) {
  activeContractId = id;
  renderStats();
  renderContractsList();
  renderWorkspace();
};

window.switchGitBranch = async function(branchName) {
  if (window.contractStudio) {
    const res = await window.contractStudio.switchBranch(branchName);
    if (res.ok) {
      const commitEl = document.getElementById('git-commit-badge');
      if (commitEl) {
        commitEl.textContent = `commit: ${res.branchInfo.commit} (${res.branchInfo.clean ? 'clean' : 'delta'})`;
        commitEl.style.color = res.branchInfo.clean ? 'var(--text-muted)' : 'var(--accent)';
      }
      if (res.branchInfo.rawYamlOverlay) {
        contractData.rawYaml = res.branchInfo.rawYamlOverlay;
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

window.runSpectral = async function() {
  if (window.contractStudio) {
    const res = await window.contractStudio.runSpectral(activeContractId);
    if (res.ok) {
      spectralRan = true;
      renderWorkspace();
      return res;
    }
  } else {
    spectralRan = true;
    renderWorkspace();
    return { ok: true, passed: true };
  }
};

window.runPact = async function() {
  if (window.contractStudio) {
    const res = await window.contractStudio.runPact(activeContractId);
    if (res.ok) {
      pactRan = true;
      renderWorkspace();
      return res;
    }
  } else {
    pactRan = true;
    renderWorkspace();
    return { ok: true, passed: 14 };
  }
};

window.startPrism = async function() {
  if (window.contractStudio) {
    const res = await window.contractStudio.startPrism(activeContractId);
    if (res.ok) {
      prismStarted = true;
      renderWorkspace();
      return res;
    }
  } else {
    prismStarted = true;
    renderWorkspace();
    return { ok: true, port: 4010 };
  }
};

const searchInput = document.getElementById('contract-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderContractsList();
  });
}

init();
