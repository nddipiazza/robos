'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// Install global failure logging
try {
  const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
  setupGlobalErrorHandlers('rest-client', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
    setupGlobalErrorHandlers('rest-client', dialog);
  } catch {}
}

// Debug server for E2E testing
var _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0d1117',
    title: 'RobOS REST API Client (Bruno)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
  if (_debugServer) _debugServer.startDebugServer(win, 19177);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Built-in Bruno Collections ──────────────────────────────────────────────

const COLLECTIONS_DIR = path.join(__dirname, 'collections');

const DEFAULT_ENVIRONMENTS = [
  { id: 'kind-local', name: 'Kind Cluster (acme-petshop-local)', variables: { baseUrl: 'http://127.0.0.1:8443', env: 'local-kind' } },
  { id: 'localhost-dev', name: 'Localhost Dev (Port 8443 / 8080)', variables: { baseUrl: 'http://localhost:8443', env: 'dev' } },
  { id: 'staging', name: 'Acme Staging (GKE / EKS)', variables: { baseUrl: 'https://api-staging.acme-petshop.internal', env: 'staging' } },
];

function getHostHome() {
  return process.env.ROBOS_HOST_HOME || process.env.REAL_HOME || os.homedir();
}

function runKubectl(args) {
  const hostHome = getHostHome();
  const bin = path.join(hostHome, '.local', 'bin', 'kubectl');
  const kubeconfig = process.env.KUBECONFIG || path.join(hostHome, '.kube', 'config');
  const env = {
    ...process.env,
    PATH: `${path.join(hostHome, '.local', 'bin')}:${process.env.PATH}`,
    KUBECONFIG: kubeconfig,
  };
  try {
    const out = execSync(`${bin} ${args}`, { encoding: 'utf8', env, timeout: 15000 });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.stdout || e.message || String(e)).trim() };
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('rest-get-environments', () => {
  return { ok: true, environments: DEFAULT_ENVIRONMENTS };
});

ipcMain.handle('rest-load-collections', () => {
  const collections = [
    {
      id: 'acme-petshop',
      name: 'Acme Petshop API Collection',
      repo: 'github.com/acme/petstore-api',
      requests: [
        {
          id: 'create-pet',
          name: 'Create Pet Record [PET-105: Luna]',
          service: 'petstore-api',
          method: 'POST',
          url: '{{baseUrl}}/api/v1/pets',
          headers: [
            { key: 'Content-Type', value: 'application/json', enabled: true },
            { key: 'Accept', value: 'application/json', enabled: true },
          ],
          bodyType: 'json',
          body: JSON.stringify({
            id: 'PET-105-VAX',
            name: 'Luna',
            species: 'Canine',
            breed: 'German Shepherd',
            age: 3,
            status: 'AVAILABLE',
          }, null, 2),
          tests: `test("Pet created successfully", function() {
  expect(res.getStatus()).to.equal(201);
  expect(res.getBody().id).to.equal("PET-105-VAX");
});`,
        },
        {
          id: 'vax-verify',
          name: 'Verify Rabies Vaccine Certificate',
          service: 'vaccine-gateway',
          method: 'POST',
          url: '{{baseUrl}}/api/v1/vaccines/verify',
          headers: [
            { key: 'Content-Type', value: 'application/json', enabled: true },
            { key: 'X-Client-Cert', value: 'mTLS-Verified-Client', enabled: true },
            { key: 'Accept', value: 'application/json', enabled: true },
          ],
          bodyType: 'json',
          body: JSON.stringify({
            petId: 'PET-105-VAX',
            vaccineType: 'RABIES_V1',
            tagNumber: 'VAX-2026-9814',
            clinicId: 'CLINIC-EAST-04',
          }, null, 2),
          tests: `test("Status code is 200 OK", function() {
  expect(res.getStatus()).to.equal(200);
});

test("Certificate is certified and mTLS verified", function() {
  expect(res.getBody().verified).to.be.true;
  expect(res.getBody().status).to.equal("CERTIFIED");
  expect(res.getBody().mtlsVerified).to.be.true;
});`,
        },
        {
          id: 'pets-list',
          name: 'List Available Pets',
          service: 'petstore-api',
          method: 'GET',
          url: '{{baseUrl}}/api/v1/pets?status=AVAILABLE',
          headers: [
            { key: 'Accept', value: 'application/json', enabled: true },
          ],
          bodyType: 'none',
          body: '',
          tests: `test("Returns array of pets", function() {
  expect(res.getStatus()).to.equal(200);
  expect(res.getBody().pets).to.be.an('array');
});

test("Includes newly verified pet", function() {
  expect(res.getBody().pets.some(p => p.id === 'PET-105-VAX')).to.be.true;
});`,
        },
        {
          id: 'pet-adopt',
          name: 'Submit Pet Adoption Request',
          service: 'petstore-api',
          method: 'POST',
          url: '{{baseUrl}}/api/v1/pets/adopt',
          headers: [
            { key: 'Content-Type', value: 'application/json', enabled: true },
            { key: 'Accept', value: 'application/json', enabled: true },
          ],
          bodyType: 'json',
          body: JSON.stringify({
            petId: 'PET-105-VAX',
            adopterName: 'Alex Rivera',
            verificationCert: 'VAX-2026-9814-CERT',
          }, null, 2),
          tests: `test("Adoption created", function() {
  expect(res.getStatus()).to.equal(201);
  expect(res.getBody().status).to.equal("ADOPTED");
});`,
        },
        {
          id: 'health-mtls',
          name: 'Cluster Ingress & mTLS Health Check',
          service: 'petstore-infra',
          method: 'GET',
          url: '{{baseUrl}}/api/v1/health/mtls',
          headers: [
            { key: 'Accept', value: 'application/json', enabled: true },
          ],
          bodyType: 'none',
          body: '',
          tests: `test("mTLS mesh healthy", function() {
  expect(res.getStatus()).to.equal(200);
  expect(res.getBody().mtlsActive).to.be.true;
});`,
        },
      ],
    },
  ];

  return { ok: true, collections };
});

ipcMain.handle('rest-run-collection', async (_, { collectionId, environmentId, delayMs = 60 }) => {
  const runStartTime = Date.now();
  
  // Resolve active pod in local Kind cluster if available
  let activePodName = 'vaccine-gateway-pod';
  const kRes = runKubectl('get pods -n acme-petshop-local -o json');
  if (kRes.ok) {
    try {
      const pData = JSON.parse(kRes.output);
      const vPod = (pData.items || []).find(p => p.metadata.name.includes('vaccine-gateway'));
      if (vPod) activePodName = vPod.metadata.name;
    } catch (_) {}
  }

  const items = [
    {
      id: 'create-pet',
      name: 'Create Pet Record [PET-105: Luna]',
      service: 'petstore-api',
      method: 'POST',
      url: 'http://127.0.0.1:8443/api/v1/pets',
      status: 201,
      statusText: 'Created',
      latencyMs: 14,
      sizeBytes: 198,
      testResults: [
        { name: 'Pet created successfully', passed: true },
        { name: 'Pet ID matches PET-105-VAX', passed: true },
      ],
    },
    {
      id: 'vax-verify',
      name: 'Verify Rabies Vaccine Certificate',
      service: 'vaccine-gateway',
      method: 'POST',
      url: 'http://127.0.0.1:8443/api/v1/vaccines/verify',
      status: 200,
      statusText: 'OK',
      latencyMs: 18,
      sizeBytes: 342,
      testResults: [
        { name: 'Status code is 200 OK', passed: true },
        { name: 'Certificate is certified and mTLS verified', passed: true },
      ],
    },
    {
      id: 'pets-list',
      name: 'List Available Pets',
      service: 'petstore-api',
      method: 'GET',
      url: 'http://127.0.0.1:8443/api/v1/pets?status=AVAILABLE',
      status: 200,
      statusText: 'OK',
      latencyMs: 12,
      sizeBytes: 420,
      testResults: [
        { name: 'Returns array of pets', passed: true },
        { name: 'Includes newly verified pet', passed: true },
      ],
    },
    {
      id: 'pet-adopt',
      name: 'Submit Pet Adoption Request',
      service: 'petstore-api',
      method: 'POST',
      url: 'http://127.0.0.1:8443/api/v1/pets/adopt',
      status: 201,
      statusText: 'Created',
      latencyMs: 16,
      sizeBytes: 256,
      testResults: [
        { name: 'Adoption created', passed: true },
        { name: 'Status changed to ADOPTED', passed: true },
      ],
    },
    {
      id: 'health-mtls',
      name: 'Cluster Ingress & mTLS Health Check',
      service: 'petstore-infra',
      method: 'GET',
      url: 'http://127.0.0.1:8443/api/v1/health/mtls',
      status: 200,
      statusText: 'OK',
      latencyMs: 8,
      sizeBytes: 154,
      testResults: [
        { name: 'mTLS mesh healthy', passed: true },
        { name: 'Serving pod verified in Kind cluster', passed: true },
      ],
    },
  ];

  // Total metrics
  const totalRequests = items.length;
  const passedRequests = items.filter(i => i.status < 400).length;
  const totalAssertions = items.reduce((acc, i) => acc + i.testResults.length, 0);
  const passedAssertions = items.reduce((acc, i) => acc + i.testResults.filter(t => t.passed).length, 0);
  const totalLatencyMs = items.reduce((acc, i) => acc + i.latencyMs, 0);
  const avgLatencyMs = Math.round((totalLatencyMs / totalRequests) * 10) / 10;

  return {
    ok: true,
    collectionName: 'Acme Petshop API Collection',
    environment: 'Kind Cluster (acme-petshop-local)',
    servingPod: activePodName,
    totalDurationMs: Date.now() - runStartTime + 68,
    metrics: {
      totalRequests,
      passedRequests,
      failedRequests: totalRequests - passedRequests,
      totalAssertions,
      passedAssertions,
      failedAssertions: totalAssertions - passedAssertions,
      avgLatencyMs,
      successRate: '100%',
    },
    results: items,
  };
});

ipcMain.handle('rest-send-request', async (_, { method, url, headers, body, tests }) => {
  const startTime = Date.now();

  // Resolve active pod in local Kind cluster if available
  let activePodName = 'vaccine-gateway-pod';
  const kRes = runKubectl('get pods -n acme-petshop-local -o json');
  if (kRes.ok) {
    try {
      const pData = JSON.parse(kRes.output);
      const vPod = (pData.items || []).find(p => p.metadata.name.includes('vaccine-gateway'));
      if (vPod) activePodName = vPod.metadata.name;
    } catch (_) {}
  }

  // Simulate network latency (15-35ms)
  await new Promise(r => setTimeout(r, 80));
  const latencyMs = Date.now() - startTime;

  if (url.includes('/api/v1/vaccines/verify')) {
    let parsedBody = {};
    try { parsedBody = typeof body === 'string' ? JSON.parse(body) : (body || {}); } catch (_) {}

    const responseBody = {
      verified: true,
      status: 'CERTIFIED',
      certificateNumber: `${parsedBody.tagNumber || 'VAX-2026-9814'}-CERT`,
      petId: parsedBody.petId || 'PET-105-VAX',
      vaccineType: parsedBody.vaccineType || 'RABIES_V1',
      species: 'Canine',
      issuer: 'Acme Animal Health & Vaccine Authority',
      mtlsVerified: true,
      issuedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      validUntil: new Date(Date.now() + 86400000 * 350).toISOString(),
      cluster: 'kind-robos-local',
      namespace: 'acme-petshop-local',
      servingPod: activePodName,
      timestamp: new Date().toISOString(),
    };

    const responseHeaders = {
      'content-type': 'application/json; charset=utf-8',
      'x-powered-by': 'Fastify / Node.js 20',
      'x-robos-task': 'PET-105',
      'x-mtls-verified': 'true',
      'connection': 'keep-alive',
      'server': 'vaccine-gateway-k8s',
    };

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      latencyMs,
      sizeBytes: JSON.stringify(responseBody).length,
      headers: responseHeaders,
      body: JSON.stringify(responseBody, null, 2),
      testResults: [
        { name: 'Status code is 200 OK', passed: true, error: null },
        { name: 'Certificate is certified and mTLS verified', passed: true, error: null },
      ],
    };
  }

  if (url.includes('/api/v1/pets')) {
    const responseBody = {
      pets: [
        { id: 'PET-101', name: 'Barkley', species: 'Canine', breed: 'Golden Retriever', age: 2, status: 'AVAILABLE', vaccinated: true },
        { id: 'PET-102', name: 'Whiskers', species: 'Feline', breed: 'Siamese', age: 1, status: 'AVAILABLE', vaccinated: true },
        { id: 'PET-105-VAX', name: 'Luna', species: 'Canine', breed: 'German Shepherd', age: 3, status: 'VERIFIED', vaccinated: true },
      ],
      total: 3,
      namespace: 'acme-petshop-local',
      cluster: 'kind-robos-local',
    };

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      latencyMs,
      sizeBytes: JSON.stringify(responseBody).length,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(responseBody, null, 2),
      testResults: [
        { name: 'Returns array of pets', passed: true, error: null },
      ],
    };
  }

  // Default fallback response
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    latencyMs,
    sizeBytes: 120,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Request executed successfully', url, method }, null, 2),
    testResults: [
      { name: 'Request completed', passed: true, error: null },
    ],
  };
});

ipcMain.handle('rest-save-bru', (_, { filePath, content }) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('rest-ai-generate', (_, prompt) => {
  return {
    ok: true,
    request: {
      name: 'Verify Rabies Vaccine (AI Generated)',
      method: 'POST',
      url: '{{baseUrl}}/api/v1/vaccines/verify',
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'X-Client-Cert', value: 'mTLS-Verified', enabled: true },
      ],
      body: JSON.stringify({
        petId: 'PET-105-VAX',
        vaccineType: 'RABIES_V1',
        tagNumber: 'VAX-2026-9814',
      }, null, 2),
    },
  };
});
