'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let _debugServer;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

let mainWindow;
let activeBranch = 'main';
let prismRunning = false;

const REAL_HOME = process.env.REAL_HOME || process.env.ROBOS_HOST_HOME || process.env.HOME || '/home/ndipiazza';
const PROJECT_DIR = path.join(REAL_HOME, '.robos', 'projects', 'acme-petshop-platform');
const CONTRACTS_DIR = path.join(PROJECT_DIR, 'contracts');

function getPetstoreApiYaml() {
  const p = path.join(CONTRACTS_DIR, 'petstore-api.openapi.yaml');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return `openapi: 3.1.0\ninfo:\n  title: Acme Petshop Core REST API\n  version: 1.0.0`;
}

function getVaccineGatewayYaml() {
  const p = path.join(CONTRACTS_DIR, 'vaccine-gateway.openapi.yaml');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return `openapi: 3.1.0\ninfo:\n  title: Rabies Vaccine Gateway\n  version: 1.0.0`;
}

const BRANCH_CATALOG = {
  'main': {
    name: 'main',
    commit: 'a8c2e1f',
    clean: true,
    label: '🌿 main (Production / GitOps HEAD)',
    rawYamlOverlay: null,
  },
  'feature/PET-105-rabies-verification': {
    name: 'feature/PET-105-rabies-verification',
    commit: 'b9d4f21',
    clean: false,
    label: '🌿 feature/PET-105-rabies-verification (Rabies Cert Delta)',
    rawYamlOverlay: null,
  },
};

const ACME_CONTRACTS = [
  {
    id: 'petstore-api.openapi.yaml',
    name: 'Acme Petshop Core REST API',
    type: 'openapi',
    version: '3.1.0',
    path: 'contracts/petstore-api.openapi.yaml',
    description: 'Java 21 Spring Boot 3.3 microservice REST API for catalog, adoption checkout, and health validation',
    endpoints: [
      {
        method: 'POST',
        path: '/pets',
        summary: 'Add new pet to inventory',
        operationId: 'createPet',
        security: 'BearerAuth (JWT)',
        requestSchema: 'entities/pet.typespec (NewPetRequest)',
        responses: [
          { code: '201', desc: 'Pet created successfully' },
          { code: '400', desc: 'Validation Error (Schema mismatch)' },
        ],
      },
      {
        method: 'GET',
        path: '/pets',
        summary: 'List all active pets in catalog',
        operationId: 'listPets',
        security: 'None (Public)',
        requestSchema: 'None (Query Params: status, species)',
        responses: [{ code: '200', desc: 'Array of Pet entities' }],
      },
      {
        method: 'GET',
        path: '/pets/{id}',
        summary: 'Get pet details by ID',
        operationId: 'getPetById',
        security: 'None (Public)',
        requestSchema: 'Path: id (UUID)',
        responses: [
          { code: '200', desc: 'Pet entity details' },
          { code: '404', desc: 'Pet not found' },
        ],
      },
      {
        method: 'POST',
        path: '/pets/{id}/adopt',
        summary: 'Process pet adoption checkout',
        operationId: 'adoptPet',
        security: 'BearerAuth (JWT)',
        requestSchema: 'entities/pet.typespec (AdoptionRequest)',
        responses: [
          { code: '200', desc: 'Adoption receipt confirmed' },
          { code: '400', desc: 'Invalid adopter information' },
        ],
      },
      {
        method: 'GET',
        path: '/pets/{id}/vaccines',
        summary: 'Fetch verified rabies and health certificates',
        operationId: 'getPetVaccines',
        security: 'mTLS / Internal Service',
        requestSchema: 'Path: id (UUID)',
        responses: [{ code: '200', desc: 'Array of validated vaccine certificates' }],
      },
    ],
    spectralResult: {
      status: 'passed',
      errors: 0,
      warnings: 0,
      report: 'Spectral OpenAPI 3.1 Governance: 0 Errors, 100% Compliant with RobOS API Style Guidelines',
    },
    pactResult: {
      status: 'passed',
      total: 14,
      passed: 14,
      failed: 0,
      consumer: 'React Web Client (petstore-web)',
      provider: 'Java Spring Boot REST API (petstore-api)',
    },
  },
  {
    id: 'vaccine-gateway.openapi.yaml',
    name: 'Rabies Vaccine Certification Gateway',
    type: 'openapi',
    version: '3.1.0',
    path: 'contracts/vaccine-gateway.openapi.yaml',
    description: 'High-assurance Fastify compliance gateway interfacing with state veterinary certification registries over mTLS',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/vaccines/verify',
        summary: 'Validate rabies vaccination certificate against state health registry',
        operationId: 'verifyVaccineCertificate',
        security: 'MutualTLS (State Vet Authority Cert)',
        requestSchema: 'entities/pet.typespec (VerificationRequest)',
        responses: [
          { code: '200', desc: 'Verification response with digital signature' },
          { code: '400', desc: 'Invalid certificate format or missing veterinarian license' },
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/registries/{state}/status',
        summary: 'Health check and sync status for state veterinary board registry',
        operationId: 'getRegistryStatus',
        security: 'None (Health Probe)',
        requestSchema: 'Path: state (2-Letter Code)',
        responses: [{ code: '200', desc: 'Registry online status and API latency' }],
      },
    ],
    spectralResult: {
      status: 'passed',
      errors: 0,
      warnings: 0,
      report: 'Spectral: 100% Compliant (mTLS SecurityScheme verified)',
    },
    pactResult: {
      status: 'passed',
      total: 8,
      passed: 8,
      failed: 0,
      consumer: 'Java Spring Boot API (petstore-api)',
      provider: 'Rabies Vaccine Gateway (vaccine-gateway)',
    },
  },
  {
    id: 'events.asyncapi.yml',
    name: 'Acme Petshop Domain Event Streams',
    type: 'asyncapi',
    version: '3.0.0',
    path: 'contracts/events.asyncapi.yml',
    description: 'Apache Kafka 3.7 event streaming topics published for async pet adoption and inventory sync',
    endpoints: [
      {
        method: 'PUB',
        path: 'acme.petshop.pet.adopted',
        summary: 'Published when user completes pet adoption checkout',
        operationId: 'onPetAdopted',
        security: 'Kafka SASL/SCRAM',
        requestSchema: 'entities/pet.typespec (PetAdoptedEvent)',
        responses: [{ code: 'ACK', desc: 'Partitioned event committed to Kafka cluster' }],
      },
      {
        method: 'PUB',
        path: 'acme.petshop.inventory.delta',
        summary: 'Published on inventory count delta adjustments',
        operationId: 'onInventoryDelta',
        security: 'Kafka SASL/SCRAM',
        requestSchema: 'entities/pet.typespec (InventoryDeltaEvent)',
        responses: [{ code: 'ACK', desc: 'Committed to Kafka event log' }],
      },
    ],
    spectralResult: { status: 'passed', errors: 0, warnings: 0, report: 'AsyncAPI Linter: 0 Violations' },
    pactResult: { status: 'passed', total: 6, passed: 6, failed: 0, consumer: 'Apache Kafka Event Bus', provider: 'Java Spring Boot API' },
  },
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextBridge: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer && _debugServer.startDebugServer) {
    _debugServer.startDebugServer(mainWindow, 19165);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('cs-get-contracts', async () => {
  return {
    activeBranch,
    contracts: ACME_CONTRACTS,
    rawYaml: getPetstoreApiYaml(),
  };
});

ipcMain.handle('cs-switch-branch', async (_evt, branchName) => {
  activeBranch = branchName || 'main';
  const branchInfo = BRANCH_CATALOG[activeBranch] || BRANCH_CATALOG['main'];
  return {
    ok: true,
    activeBranch,
    branchInfo,
  };
});

ipcMain.handle('cs-run-spectral', async (_evt, contractId) => {
  const contract = ACME_CONTRACTS.find(c => c.id === contractId) || ACME_CONTRACTS[0];
  return {
    ok: true,
    contractId: contract.id,
    result: contract.spectralResult,
  };
});

ipcMain.handle('cs-run-pact', async (_evt, contractId) => {
  const contract = ACME_CONTRACTS.find(c => c.id === contractId) || ACME_CONTRACTS[0];
  return {
    ok: true,
    contractId: contract.id,
    result: contract.pactResult,
  };
});

ipcMain.handle('cs-start-prism', async (_evt, contractId) => {
  prismRunning = true;
  return {
    ok: true,
    port: 4010,
    url: 'http://127.0.0.1:4010',
    routes: [
      'GET  http://127.0.0.1:4010/pets',
      'POST http://127.0.0.1:4010/pets',
      'GET  http://127.0.0.1:4010/pets/{id}',
      'POST http://127.0.0.1:4010/pets/{id}/adopt',
      'GET  http://127.0.0.1:4010/pets/{id}/vaccines',
      'POST http://127.0.0.1:4010/api/v1/vaccines/verify',
    ],
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
