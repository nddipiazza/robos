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

const DEFAULT_TOPOLOGY = {
  version: '1.0',
  kind: 'Topology',
  system: {
    id: 'acme-petshop',
    name: 'Acme Petshop Platform',
    description: 'Enterprise distributed e-commerce pet store & clinic management platform',
  },
  nodes: [
    {
      id: 'petstore-web',
      name: 'React Web Client',
      type: 'frontend',
      technology: 'Node.js 20 / React 18 / Vite',
      repo: 'http://127.0.0.1:3000/acme-org/petstore-web.git',
      ownerTeam: 'Frontend Engineering',
      contracts: [],
    },
    {
      id: 'petstore-api',
      name: 'Java Spring Boot REST API',
      type: 'service',
      technology: 'Java 21 / Spring Boot 3.3',
      repo: 'http://127.0.0.1:3000/acme-org/petstore-api.git',
      ownerTeam: 'Core Backend Platform',
      contracts: ['contracts/petstore-api.openapi.yaml'],
      entities: ['entities/pet.typespec'],
      devcontainer: '.devcontainer/devcontainer.json',
      upstream: ['petstore-web'],
      downstream: ['petstore-db', 'event-bus'],
    },
    {
      id: 'petstore-common',
      name: 'Reusable TypeSpec & Pact Library',
      type: 'library',
      technology: 'TypeSpec / Pact / Protobuf',
      repo: 'http://127.0.0.1:3000/acme-org/petstore-common.git',
      ownerTeam: 'Platform Enabling Team',
      contracts: ['contracts/petstore-api.openapi.yaml'],
      upstream: ['petstore-web', 'petstore-api'],
      downstream: [],
    },
    {
      id: 'event-bus',
      name: 'Apache Kafka Event Bus',
      type: 'streaming',
      technology: 'Apache Kafka 3.7',
      repo: 'infra/kafka',
      ownerTeam: 'Data Platform',
      contracts: ['contracts/events.asyncapi.yml'],
      upstream: ['petstore-api'],
      downstream: [],
    },
    {
      id: 'petstore-db',
      name: 'PostgreSQL 16 Primary DB',
      type: 'database',
      technology: 'PostgreSQL 16',
      repo: 'infra/postgres',
      ownerTeam: 'Data Platform',
      contracts: [],
      upstream: ['petstore-api'],
      downstream: [],
    },
  ],
  links: [
    { from: 'petstore-web', to: 'petstore-api', protocol: 'HTTPS/JSON (OpenAPI 3.1)' },
    { from: 'petstore-api', to: 'petstore-db', protocol: 'TCP/SQL (JDBC)' },
    { from: 'petstore-api', to: 'event-bus', protocol: 'TCP/Kafka (Protobuf)' },
    { from: 'petstore-web', to: 'petstore-common', protocol: 'npm (@acme/petstore-common)' },
    { from: 'petstore-api', to: 'petstore-common', protocol: 'Maven DTO Jar' },
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
    _debugServer.startDebugServer(mainWindow, 19162);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('top-get-topology', async () => {
  return DEFAULT_TOPOLOGY;
});

ipcMain.handle('top-import-backstage', async (_evt, backstageYaml) => {
  const importedNode = {
    id: 'tax-service',
    name: 'Acme Tax Calculation API',
    type: 'service',
    technology: 'Java 21 / Spring Boot 3',
    repo: 'github.com/acme/tax-calculator',
    ownerTeam: 'Fintech Platform Team',
    contracts: ['specs/contracts/acme-tax-api-v2.yaml'],
    upstream: ['forms-api'],
    downstream: ['db-primary'],
  };
  return {
    ok: true,
    message: 'Imported Backstage catalog-info.yaml successfully',
    node: importedNode,
  };
});

ipcMain.handle('top-export-c4', async () => {
  const c4Markup = `@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(user, "Customer / Vendor", "Interacts via Web Portal")
System_Boundary(c1, "BuildBarn Platform") {
    Container(web, "Web Portal", "React / Vite", "Interactive client UI")
    Container(api, "Forms API Service", "Node.js 20 / Express", "Processes multi-step dynamic forms")
    Container(wf, "Workflow Orchestrator", "Go 1.22", "Executes long-running business workflows")
    ContainerDb(db, "PostgreSQL Database", "PostgreSQL 16", "Stores verified forms and audit logs")
    ContainerQueue(broker, "RabbitMQ Event Broker", "AMQP", "Event bus for async form events")
}

Rel(user, web, "Uses", "HTTPS")
Rel(web, api, "Submits form data", "HTTPS / REST (OpenAPI 3.1)")
Rel(api, db, "Reads/Writes forms", "TCP / SQL")
Rel(api, broker, "Publishes form events", "AMQP")
Rel(broker, wf, "Consumes events", "AMQP")
Rel(wf, db, "Updates state", "TCP / SQL")
@enduml`;

  return {
    ok: true,
    format: 'PlantUML / Structurizr C4 DSL',
    c4Markup,
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
