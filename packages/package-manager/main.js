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

const BRANCH_CATALOG = {
  'main': {
    name: 'main',
    commit: '8f9a2b1',
    clean: true,
    label: '🌿 main (Production / GitOps HEAD)',
  },
  'feature/TAX-1099-ein-verification': {
    name: 'feature/TAX-1099-ein-verification',
    commit: 'd4e5f6a',
    clean: false,
    label: '🌿 feature/TAX-1099-ein-verification (EIN Delta)',
  },
  'hotfix/calc-rate': {
    name: 'hotfix/calc-rate',
    commit: 'e2b1c4f',
    clean: true,
    label: '🌿 hotfix/calc-rate',
  },
};

const DEFAULT_PACKAGES = {
  activePackage: 'forms-api',
  packages: [
    {
      id: 'forms-api',
      name: 'Forms API Microservice',
      type: 'app',
      runtime: 'Node.js 20.12.0 (Mise)',
      devcontainer: '.devcontainer/devcontainer.json',
      port: 3000,
      healthEndpoint: 'http://localhost:3000/healthz',
      status: 'running',
      pid: 18490,
      cpu: '0.4%',
      memory: '142 MB',
      description: 'Dynamic forms backend microservice with OpenAPI 3.1 & PostgreSQL ORM',
      logs: `[forms-api] 2026-09-03T13:48:00.102Z INFO: Devcontainer runtime initialized (Node 20.12.0)
[forms-api] 2026-09-03T13:48:00.115Z INFO: Connected to PostgreSQL 16 at localhost:5432/buildbarn
[forms-api] 2026-09-03T13:48:00.142Z INFO: Registered OpenAPI 3.1 routes (/api/v1/forms)
[forms-api] 2026-09-03T13:48:00.150Z INFO: HTTP server listening on http://0.0.0.0:3000
[forms-api] 2026-09-03T13:48:05.210Z INFO: GET /healthz 200 OK (1.2ms)`,
    },
    {
      id: 'web-client',
      name: 'React Web Portal Client',
      type: 'app',
      runtime: 'Node.js 20.12.0 (Vite / React 18)',
      devcontainer: '.devcontainer/devcontainer.json',
      port: 5173,
      healthEndpoint: 'http://localhost:5173',
      status: 'running',
      pid: 18512,
      cpu: '0.2%',
      memory: '98 MB',
      description: 'Single-page React application for user form filling and reviews',
      logs: `[web-client] 2026-09-03T13:48:02.001Z INFO: Vite v5.2.0 dev server running at http://localhost:5173/`,
    },
    {
      id: 'postgres-db',
      name: 'PostgreSQL 16 Database Daemon',
      type: 'daemon',
      runtime: 'Docker / OCI Container',
      devcontainer: '.devcontainer/docker-compose.yml',
      port: 5432,
      healthEndpoint: 'tcp://localhost:5432',
      status: 'running',
      pid: 18401,
      cpu: '0.1%',
      memory: '64 MB',
      description: 'Primary relational database for form schemas and submission records',
      logs: `[postgres-db] 2026-09-03T13:47:50.000Z LOG: database system is ready to accept connections`,
    },
    {
      id: 'rabbitmq-broker',
      name: 'RabbitMQ Event Broker',
      type: 'daemon',
      runtime: 'Docker / OCI Container',
      devcontainer: '.devcontainer/docker-compose.yml',
      port: 5672,
      healthEndpoint: 'tcp://localhost:5672',
      status: 'running',
      pid: 18420,
      cpu: '0.3%',
      memory: '110 MB',
      description: 'Message broker for AsyncAPI topic exchange distribution',
      logs: `[rabbitmq-broker] 2026-09-03T13:47:52.000Z INFO: Server startup complete; 4 plugins started`,
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
    _debugServer.startDebugServer(mainWindow, 19166);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('pkg-get-packages', async () => {
  const branchInfo = BRANCH_CATALOG[activeBranch] || BRANCH_CATALOG['main'];
  return {
    ...DEFAULT_PACKAGES,
    activeBranch,
    branchInfo,
    branches: Object.values(BRANCH_CATALOG).map(b => ({ name: b.name, commit: b.commit, label: b.label })),
  };
});

ipcMain.handle('pkg-list-branches', async () => {
  return Object.values(BRANCH_CATALOG);
});

ipcMain.handle('pkg-switch-branch', async (_evt, branchName) => {
  if (BRANCH_CATALOG[branchName]) {
    activeBranch = branchName;
    const branchInfo = BRANCH_CATALOG[branchName];
    return { ok: true, activeBranch, branchInfo };
  }
  return { ok: false, message: 'Branch not found' };
});

ipcMain.handle('pkg-start-service', async (_evt, pkgId) => {
  const pkg = DEFAULT_PACKAGES.packages.find(p => p.id === pkgId);
  if (pkg) {
    pkg.status = 'running';
    pkg.pid = 19100 + Math.floor(Math.random() * 500);
    pkg.logs += `\n[${pkg.id}] ${new Date().toISOString()} INFO: Started service successfully inside Devcontainer (PID ${pkg.pid})`;
    return { ok: true, package: pkg };
  }
  return { ok: false, message: 'Package not found' };
});

ipcMain.handle('pkg-stop-service', async (_evt, pkgId) => {
  const pkg = DEFAULT_PACKAGES.packages.find(p => p.id === pkgId);
  if (pkg) {
    pkg.status = 'stopped';
    pkg.pid = null;
    pkg.logs += `\n[${pkg.id}] ${new Date().toISOString()} WARN: Service stopped by user`;
    return { ok: true, package: pkg };
  }
  return { ok: false, message: 'Package not found' };
});

ipcMain.handle('pkg-health-probe', async (_evt, pkgId) => {
  const pkg = DEFAULT_PACKAGES.packages.find(p => p.id === pkgId) || DEFAULT_PACKAGES.packages[0];
  return {
    ok: true,
    packageId: pkg.id,
    endpoint: pkg.healthEndpoint,
    statusCode: 200,
    latencyMs: 14,
    statusText: '200 OK (Healthy)',
    report: `Health probe to ${pkg.healthEndpoint} succeeded in 14ms.`,
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
