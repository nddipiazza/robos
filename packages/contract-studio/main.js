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

const BRANCH_CATALOG = {
  'main': {
    name: 'main',
    commit: '8f9a2b1',
    clean: true,
    label: '🌿 main (Production / GitOps HEAD)',
    rawYamlOverlay: `openapi: 3.1.0
info:
  title: BuildBarn Dynamic Forms API
  version: 1.0.0
  description: Core microservice API for dynamic forms submission and workflow dispatch.
servers:
  - url: https://api.buildbarn.dev/v1
    description: Production Gateway
paths:
  /api/v1/forms:
    get:
      summary: List all active forms
      operationId: listForms
      responses:
        '200':
          description: Successful form list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/DynamicForm'
    post:
      summary: Create dynamic form instance
      operationId: createForm
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DynamicForm'
      responses:
        '201':
          description: Form created successfully
        '400':
          description: Validation error
        '401':
          description: Unauthorized
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    DynamicForm:
      $ref: '.robos/entities/form.typespec#DynamicForm'`,
  },
  'feature/TAX-1099-ein-verification': {
    name: 'feature/TAX-1099-ein-verification',
    commit: 'd4e5f6a',
    clean: false,
    label: '🌿 feature/TAX-1099-ein-verification (EIN Delta)',
    rawYamlOverlay: `openapi: 3.1.0
info:
  title: BuildBarn Dynamic Forms API
  version: 1.1.0-alpha
  description: Forms API with TAX-1099 EIN verification and certification routes.
servers:
  - url: https://api-stage.buildbarn.dev/v1
    description: Staging Feature Gateway
paths:
  /api/v1/forms:
    post:
      summary: Create dynamic form instance (with TAX-1099 EIN)
      operationId: createForm
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DynamicForm'
      responses:
        '201':
          description: Form created with EIN validation
  /api/v1/forms/verify-ein:
    post:
      summary: Instant IRS EIN verification probe
      operationId: verifyEin
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [vendorEin]
              properties:
                vendorEin:
                  type: string
                  pattern: '^[0-9]{2}-[0-9]{7}$'
      responses:
        '200':
          description: EIN valid and registered with IRS
components:
  schemas:
    DynamicForm:
      $ref: '.robos/entities/form.typespec#DynamicForm'`,
  },
  'hotfix/calc-rate': {
    name: 'hotfix/calc-rate',
    commit: 'e2b1c4f',
    clean: true,
    label: '🌿 hotfix/calc-rate',
    rawYamlOverlay: null,
  },
};

const DEFAULT_CONTRACTS = {
  activeContract: 'forms-api.openapi.yaml',
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
            { code: '400', desc: 'Validation Error (Schema mismatch)' },
            { code: '401', desc: 'Unauthorized (Missing JWT)' },
          ],
        },
        {
          method: 'GET',
          path: '/api/v1/forms',
          summary: 'List active forms for tenant',
          operationId: 'listForms',
          security: 'BearerAuth (JWT)',
          requestSchema: 'None (Query Params)',
          responses: [{ code: '200', desc: 'Array of DynamicForms' }],
        },
      ],
      spectralResult: {
        status: 'passed',
        errors: 0,
        warnings: 1,
        report: 'Spectral OpenAPI 3.1 Governance: 0 Errors, 1 Warning (info: add contact email to info block)',
      },
      pactResult: {
        status: 'passed',
        total: 14,
        passed: 14,
        failed: 0,
        consumer: 'React Web Portal (web-client)',
        provider: 'Forms API Service (forms-api)',
      },
    },
    {
      id: 'auth-api.openapi.yaml',
      name: 'Identity & Auth API',
      type: 'openapi',
      version: '3.1.0',
      path: '.robos/contracts/auth-api.openapi.yaml',
      description: 'OAuth2 and JWT token minting service',
      endpoints: [
        {
          method: 'POST',
          path: '/api/v1/auth/token',
          summary: 'Exchange credentials for JWT session',
          operationId: 'mintToken',
          security: 'BasicAuth',
          requestSchema: 'entities/user.typespec (AuthCredentials)',
          responses: [{ code: '200', desc: 'JWT Bearer Token' }],
        },
      ],
      spectralResult: { status: 'passed', errors: 0, warnings: 0, report: 'Spectral: 100% Compliant' },
      pactResult: { status: 'passed', total: 8, passed: 8, failed: 0, consumer: 'Web Portal', provider: 'Auth Service' },
    },
    {
      id: 'form-events.asyncapi.yaml',
      name: 'Form Event Streams (AsyncAPI)',
      type: 'asyncapi',
      version: '2.6.0',
      path: '.robos/contracts/form-events.asyncapi.yaml',
      description: 'RabbitMQ topic exchange event definitions for form lifecycle events',
      endpoints: [
        {
          method: 'PUB',
          path: 'forms.lifecycle.submitted',
          summary: 'Published when user submits a new form',
          operationId: 'onFormSubmitted',
          security: 'AMQP TLS',
          requestSchema: 'entities/form.typespec (FormSubmittedEvent)',
          responses: [{ code: 'ACK', desc: 'Acknowledged by RabbitMQ' }],
        },
      ],
      spectralResult: { status: 'passed', errors: 0, warnings: 0, report: 'AsyncAPI Linter: 0 Violations' },
      pactResult: { status: 'passed', total: 6, passed: 6, failed: 0, consumer: 'Notification Engine', provider: 'Event Broker' },
    },
  ],
};

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

ipcMain.handle('contract-get-contracts', async () => {
  const branchInfo = BRANCH_CATALOG[activeBranch] || BRANCH_CATALOG['main'];
  const activeContractObj = DEFAULT_CONTRACTS.contracts.find(c => c.id === DEFAULT_CONTRACTS.activeContract);
  return {
    ...DEFAULT_CONTRACTS,
    activeBranch,
    branchInfo,
    prismRunning,
    rawYaml: branchInfo.rawYamlOverlay || BRANCH_CATALOG['main'].rawYamlOverlay,
    branches: Object.values(BRANCH_CATALOG).map(b => ({ name: b.name, commit: b.commit, label: b.label })),
  };
});

ipcMain.handle('contract-list-branches', async () => {
  return Object.values(BRANCH_CATALOG);
});

ipcMain.handle('contract-switch-branch', async (_evt, branchName) => {
  if (BRANCH_CATALOG[branchName]) {
    activeBranch = branchName;
    const branchInfo = BRANCH_CATALOG[branchName];
    return { ok: true, activeBranch, branchInfo };
  }
  return { ok: false, message: 'Branch not found' };
});

ipcMain.handle('contract-run-spectral', async (_evt, contractId) => {
  return {
    ok: true,
    contractId,
    errors: 0,
    warnings: 1,
    passed: true,
    report: 'Stoplight Spectral OpenAPI 3.1 Governance: 0 Errors, 1 Info Warning (Passed Quality Gate)',
  };
});

ipcMain.handle('contract-run-pact', async (_evt, contractId) => {
  return {
    ok: true,
    contractId,
    total: 14,
    passed: 14,
    failed: 0,
    durationMs: 312,
    consumer: 'React Web Portal (web-client)',
    provider: 'Forms API Service (forms-api)',
    report: 'Pact Consumer Contract Verification: 14/14 Contracts Passed (0 Breaking Deltas)',
  };
});

ipcMain.handle('contract-start-prism', async (_evt, contractId) => {
  prismRunning = true;
  return {
    ok: true,
    port: 4010,
    pid: 5120,
    url: 'http://localhost:4010',
    status: 'Running Mock Server',
    routesSimulated: 4,
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
