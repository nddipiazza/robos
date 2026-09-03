'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let _debugServer;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
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

const ADAPTERS_DATA = {
  adapters: [
    {
      id: 'backstage',
      name: 'Spotify Backstage Catalog Adapter',
      standard: 'Backstage v1alpha1 (catalog-info.yaml)',
      status: 'synced',
      roundtripStatus: '100% Lossless',
      entitiesCount: 14,
      rawInput: `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: forms-api
  title: Dynamic Forms API
  description: Core microservice handling dynamic form templates
  tags: [robos, microservice, rest]
spec:
  type: service
  lifecycle: production
  owner: team-core
  system: buildbarn-platform`,
      translatedRobos: `# .robos/topology.yaml
version: 1.0.0
services:
  - id: forms-api
    name: Dynamic Forms API
    type: service
    owner: team-core
    system: buildbarn-platform
    description: Core microservice handling dynamic form templates
    tags: [robos, microservice, rest]`,
    },
    {
      id: 'typespec',
      name: 'Microsoft TypeSpec Compiler Adapter',
      standard: '@typespec/compiler (main.tsp)',
      status: 'synced',
      roundtripStatus: 'Compiles in <80ms',
      entitiesCount: 6,
      rawInput: `import "@typespec/http";
using TypeSpec.Http;

@service({ title: "Forms Service" })
namespace FormsService;

model FormTemplate {
  id: string;
  title: string;
  version: int32;
}`,
      translatedRobos: `// Generated OpenAPI 3.1 & TypeScript Models
export interface FormTemplate {
  id: string;
  title: string;
  version: number;
}`,
    },
    {
      id: 'buf',
      name: 'Buf Protobuf Build System Adapter',
      standard: 'Buf Registry (buf.yaml / buf.gen.yaml)',
      status: 'synced',
      roundtripStatus: '0 Wire-Breaking Changes',
      entitiesCount: 4,
      rawInput: `version: v1
breaking:
  use:
    - FILE
lint:
  use:
    - DEFAULT`,
      translatedRobos: `// .robos/schemas/proto/forms.proto
syntax = "proto3";
package robos.forms.v1;

message FormSubmissionEvent {
  string submission_id = 1;
  string form_id = 2;
  int64 timestamp = 3;
}`,
    },
    {
      id: 'pact',
      name: 'Pact Consumer Contract Adapter',
      standard: 'Pact Foundation Matrix (v4)',
      status: 'synced',
      roundtripStatus: '14/14 Interactions Verified',
      entitiesCount: 14,
      rawInput: `{
  "consumer": { "name": "buildbarn-web" },
  "provider": { "name": "forms-api" },
  "interactions": [
    {
      "description": "a request for form schema 102",
      "request": { "method": "GET", "path": "/api/v1/forms/102" },
      "response": { "status": 200 }
    }
  ]
}`,
      translatedRobos: `# RobOS Verification Gate
Pact matrix status: VERIFIED_COMPATIBLE
Broker: local-broker (14/14 passed, 0 failures)`,
    },
    {
      id: 'devcontainer',
      name: 'Development Containers Adapter',
      standard: 'containers.dev (.devcontainer/devcontainer.json)',
      status: 'synced',
      roundtripStatus: 'Docker/Podman Supervised',
      entitiesCount: 3,
      rawInput: `{
  "name": "Forms API Devcontainer",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20-bullseye",
  "forwardPorts": [3000, 5432, 9092],
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  }
}`,
      translatedRobos: `# .robos/packages.yaml
packages:
  - id: forms-api
    runtime: devcontainer
    image: mcr.microsoft.com/devcontainers/typescript-node:20-bullseye
    ports: [3000, 5432, 9092]`,
    },
  ],
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (_debugServer && _debugServer.startDebugServer) {
    _debugServer.startDebugServer(mainWindow, 19167);
  }
}

app.whenReady().then(createWindow);

ipcMain.handle('adapter-get-status', async () => {
  const branchInfo = BRANCH_CATALOG[activeBranch] || BRANCH_CATALOG['main'];
  return {
    ...ADAPTERS_DATA,
    activeBranch,
    branchInfo,
    branches: Object.values(BRANCH_CATALOG).map(b => ({ name: b.name, commit: b.commit, label: b.label })),
  };
});

ipcMain.handle('adapter-sync-all', async () => {
  return {
    ok: true,
    syncedCount: 5,
    message: 'All 5 OSS Ecosystem Adapters synchronized in 140ms.',
  };
});

ipcMain.handle('adapter-export-backstage', async () => {
  return {
    ok: true,
    file: 'catalog-info.yaml',
    entitiesExported: 14,
  };
});

ipcMain.handle('adapter-switch-branch', async (_evt, branchName) => {
  if (BRANCH_CATALOG[branchName]) {
    activeBranch = branchName;
    const branchInfo = BRANCH_CATALOG[branchName];
    return { ok: true, activeBranch, branchInfo };
  }
  return { ok: false, message: 'Branch not found' };
});
