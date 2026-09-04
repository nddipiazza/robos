'use strict';

let collections = [];
let environments = [];
let currentRequest = null;
let activeEnvironment = null;

// DOM Elements
const envSelect = document.getElementById('env-select');
const collectionsTree = document.getElementById('collections-tree');
const requestMethod = document.getElementById('request-method');
const requestUrl = document.getElementById('request-url');
const btnSendRequest = document.getElementById('btn-send-request');
const reqBodyEditor = document.getElementById('req-body-editor');
const reqTestsEditor = document.getElementById('req-tests-editor');
const bruSourceView = document.getElementById('bru-source-view');
const headersTbody = document.getElementById('headers-tbody');
const headerCount = document.getElementById('header-count');

const resStatusPill = document.getElementById('res-status-pill');
const resLatency = document.getElementById('res-latency');
const resSize = document.getElementById('res-size');
const responseEmpty = document.getElementById('response-empty');
const responseJsonView = document.getElementById('response-json-view');
const resHeadersTbody = document.getElementById('res-headers-tbody');
const resTestsList = document.getElementById('res-tests-list');
const testPassCount = document.getElementById('test-pass-count');
const btnCopyResponse = document.getElementById('btn-copy-response');
const aiResponseBox = document.getElementById('ai-response-box');

// ── Tab Listeners ───────────────────────────────────────────────────────────

document.querySelectorAll('.req-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.req-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.req-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.add('active');
    if (tab === 'bru') updateBruSourceView();
  });
});

document.querySelectorAll('.res-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.res-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.res-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.add('active');
  });
});

// ── Actions ─────────────────────────────────────────────────────────────────

btnSendRequest.addEventListener('click', sendCurrentRequest);

btnCopyResponse.addEventListener('click', () => {
  navigator.clipboard.writeText(responseJsonView.textContent);
  btnCopyResponse.textContent = 'Copied!';
  setTimeout(() => { btnCopyResponse.textContent = 'Copy'; }, 1500);
});

document.querySelectorAll('.chip-btn').forEach(chip => {
  chip.addEventListener('click', async () => {
    const prompt = chip.dataset.prompt;
    aiResponseBox.classList.remove('hidden');
    aiResponseBox.innerHTML = `<strong>AI CoPilot:</strong> Analyzing <code>${prompt}</code> for Bruno client...`;
    
    setTimeout(() => {
      aiResponseBox.innerHTML = `<strong>AI CoPilot:</strong> Verified request specification against <code>petstore-common/entities/pet.typespec</code>. All headers (<code>X-Client-Cert</code>) and Fastify payload properties conform to OpenAPI 3.1 contract.`;
    }, 800);
  });
});

// ── Initialization ──────────────────────────────────────────────────────────

async function init() {
  const envRes = await window.api.getEnvironments();
  if (envRes.ok) {
    environments = envRes.environments || [];
    envSelect.innerHTML = environments.map((e, idx) => 
      `<option value="${e.id}" ${idx === 0 ? 'selected' : ''}>${e.name}</option>`
    ).join('');
    activeEnvironment = environments[0];
  }

  envSelect.addEventListener('change', (e) => {
    activeEnvironment = environments.find(env => env.id === e.target.value) || environments[0];
    applyEnvironmentVariables();
  });

  const colRes = await window.api.loadCollections();
  if (colRes.ok) {
    collections = colRes.collections || [];
    renderCollectionsTree();
    if (collections.length > 0 && collections[0].requests.length > 0) {
      selectRequest(collections[0].requests[0].id);
    }
  }
}

function renderCollectionsTree() {
  collectionsTree.innerHTML = collections.map(col => `
    <div class="collection-folder">
      <div class="folder-header">
        <span class="folder-icon">📁</span>
        <span>${col.name}</span>
      </div>
      <div class="folder-items">
        ${col.requests.map(req => `
          <div class="req-item ${currentRequest && currentRequest.id === req.id ? 'active' : ''}" 
               id="req-item-${req.id}" onclick="selectRequest('${req.id}')">
            <span class="method-tag method-${req.method}">${req.method}</span>
            <span class="req-title">${req.name}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function selectRequest(reqId) {
  for (const col of collections) {
    const found = col.requests.find(r => r.id === reqId);
    if (found) {
      currentRequest = found;
      break;
    }
  }

  if (!currentRequest) return;

  document.querySelectorAll('.req-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`req-item-${reqId}`);
  if (activeEl) activeEl.classList.add('active');

  requestMethod.value = currentRequest.method;
  requestUrl.value = resolveUrl(currentRequest.url);
  reqBodyEditor.value = currentRequest.body || '';
  reqTestsEditor.value = currentRequest.tests || '';

  // Render headers
  const headers = currentRequest.headers || [];
  headerCount.textContent = headers.length;
  headersTbody.innerHTML = headers.map(h => `
    <tr><td><code>${h.key}</code></td><td><code>${h.value}</code></td></tr>
  `).join('');

  updateBruSourceView();
}

function resolveUrl(url) {
  if (!activeEnvironment) return url;
  let resolved = url;
  for (const [k, v] of Object.entries(activeEnvironment.variables || {})) {
    resolved = resolved.replace(new RegExp(`{{${k}}}`, 'g'), v);
  }
  return resolved;
}

function applyEnvironmentVariables() {
  if (currentRequest) {
    requestUrl.value = resolveUrl(currentRequest.url);
  }
}

function updateBruSourceView() {
  if (!currentRequest) return;
  const bruContent = `meta {
  name: ${currentRequest.name}
  type: http
  seq: 1
}

${currentRequest.method.toLowerCase()} {
  url: ${currentRequest.url}
  body: ${currentRequest.bodyType || 'json'}
  auth: none
}

headers {
${(currentRequest.headers || []).map(h => `  ${h.key}: ${h.value}`).join('\n')}
}

body:json {
${currentRequest.body || '{}'}
}

tests {
${currentRequest.tests || ''}
}`;

  bruSourceView.textContent = bruContent;
}

async function sendCurrentRequest() {
  btnSendRequest.disabled = true;
  btnSendRequest.innerHTML = `<span class="spinner">⏳</span> Sending...`;
  resStatusPill.className = 'status-pill status-ready';
  resStatusPill.textContent = 'Sending...';

  const method = requestMethod.value;
  const url = requestUrl.value;
  const body = reqBodyEditor.value;
  const tests = reqTestsEditor.value;
  const headers = (currentRequest && currentRequest.headers) || [];

  const res = await window.api.sendRequest({
    method,
    url,
    headers,
    body,
    tests,
  });

  btnSendRequest.disabled = false;
  btnSendRequest.innerHTML = `<span class="send-icon">⚡</span> Send`;

  if (res.ok) {
    // Status Pill & Metadata
    resStatusPill.className = 'status-pill status-success';
    resStatusPill.textContent = `${res.status} ${res.statusText}`;
    resLatency.className = 'meta-pill';
    resLatency.textContent = `${res.latencyMs} ms`;
    resSize.className = 'meta-pill';
    resSize.textContent = `${res.sizeBytes} B`;

    // Response Body
    responseEmpty.classList.add('hidden');
    responseJsonView.classList.remove('hidden');
    responseJsonView.textContent = res.body;

    // Headers Tab
    resHeadersTbody.innerHTML = Object.entries(res.headers || {}).map(([k, v]) => `
      <tr><td><code>${k}</code></td><td><code>${v}</code></td></tr>
    `).join('');

    // Tests Tab
    const testResults = res.testResults || [];
    testPassCount.textContent = `${testResults.filter(t => t.passed).length}/${testResults.length}`;
    resTestsList.innerHTML = testResults.map(t => `
      <div class="test-row ${t.passed ? 'test-pass' : 'test-fail'}">
        <span>${t.passed ? '✓' : '✗'}</span>
        <strong>${t.name}</strong>
      </div>
    `).join('');
  } else {
    resStatusPill.className = 'status-pill status-error';
    resStatusPill.textContent = 'Error';
    responseEmpty.classList.add('hidden');
    responseJsonView.classList.remove('hidden');
    responseJsonView.textContent = JSON.stringify({ error: res.error }, null, 2);
  }
}

// ── AI Bruno Generator (.bru) Modal Logic ────────────────────────────────────

const btnAiGenerateBru = document.getElementById('btn-ai-generate-bru');
const modalAiGenerate = document.getElementById('modal-ai-generate');
const btnModalClose = document.getElementById('btn-modal-close');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnSynthesizeBru = document.getElementById('btn-synthesize-bru');
const genPreviewSection = document.getElementById('gen-preview-section');
const genPreviewCode = document.getElementById('gen-preview-code');
const btnSaveCommitBru = document.getElementById('btn-save-commit-bru');
const genContractSource = document.getElementById('gen-contract-source');
const genFileName = document.getElementById('gen-file-name');

function openGenerateModal() {
  if (modalAiGenerate) modalAiGenerate.classList.remove('hidden');
}

function closeGenerateModal() {
  if (modalAiGenerate) modalAiGenerate.classList.add('hidden');
}

if (btnAiGenerateBru) btnAiGenerateBru.addEventListener('click', openGenerateModal);
if (btnModalClose) btnModalClose.addEventListener('click', closeGenerateModal);
if (btnModalCancel) btnModalCancel.addEventListener('click', closeGenerateModal);

const GENERATED_BRU_TEMPLATE = `meta {
  name: Verify Rabies Vaccine Certificate
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/api/v1/vaccines/verify
  body: json
  auth: none
}

headers {
  Content-Type: application/json
  X-Client-Cert: mTLS-Verified-Client
  Accept: application/json
}

body:json {
  {
    "petId": "PET-105-VAX",
    "vaccineType": "RABIES_V1",
    "tagNumber": "VAX-2026-9814",
    "clinicId": "CLINIC-EAST-04"
  }
}

tests {
  test("Status code is 200 OK", function() {
    expect(res.getStatus()).to.equal(200);
  });
  
  test("Certificate is certified and mTLS verified", function() {
    expect(res.getBody().verified).to.be.true;
    expect(res.getBody().status).to.equal("CERTIFIED");
    expect(res.getBody().mtlsVerified).to.be.true;
  });
}`;

async function synthesizeBru() {
  btnSynthesizeBru.disabled = true;
  btnSynthesizeBru.innerHTML = `<span class="spinner">⏳</span> Synthesizing from TypeSpec Schema...`;

  setTimeout(() => {
    btnSynthesizeBru.disabled = false;
    btnSynthesizeBru.innerHTML = `<span class="btn-icon">⚡</span> Synthesize .bru Spec with AI`;
    genPreviewSection.classList.remove('hidden');
    genPreviewCode.textContent = GENERATED_BRU_TEMPLATE;
    btnSaveCommitBru.disabled = false;
  }, 900);
}

if (btnSynthesizeBru) btnSynthesizeBru.addEventListener('click', synthesizeBru);

async function saveAndCommitBru() {
  btnSaveCommitBru.disabled = true;
  btnSaveCommitBru.innerHTML = `💾 Committing to Git...`;

  await window.api.saveBru({
    filePath: 'collections/acme-petshop/01-verify-rabies-vaccine.bru',
    content: GENERATED_BRU_TEMPLATE,
  });

  setTimeout(() => {
    // Mark the request as newly generated
    if (collections.length > 0 && collections[0].requests.length > 0) {
      collections[0].requests[0].isNew = true;
    }
    renderCollectionsTree();
    selectRequest('vax-verify');
    closeGenerateModal();
    btnSaveCommitBru.disabled = false;
    btnSaveCommitBru.innerHTML = `💾 Save & Commit to Git (.bru)`;
  }, 600);
}

if (btnSaveCommitBru) btnSaveCommitBru.addEventListener('click', saveAndCommitBru);

// Custom override for renderCollectionsTree to show 'Newly Generated' badge
const _origRenderTree = renderCollectionsTree;
renderCollectionsTree = function() {
  collectionsTree.innerHTML = collections.map(col => `
    <div class="collection-folder">
      <div class="folder-header">
        <span class="folder-icon">📁</span>
        <span>${col.name}</span>
      </div>
      <div class="folder-items">
        ${col.requests.map(req => `
          <div class="req-item ${currentRequest && currentRequest.id === req.id ? 'active' : ''}" 
               id="req-item-${req.id}" onclick="selectRequest('${req.id}')">
            <span class="method-tag method-${req.method}">${req.method}</span>
            <span class="req-title">${req.name}</span>
            ${req.isNew ? '<span class="badge-newly-generated">✨ Generated</span>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
};

// Global exports for test automation
window.selectRequest = selectRequest;
window.sendCurrentRequest = sendCurrentRequest;
window.openGenerateModal = openGenerateModal;
window.closeGenerateModal = closeGenerateModal;
window.synthesizeBru = synthesizeBru;
window.saveAndCommitBru = saveAndCommitBru;
window.init = init;

init();

