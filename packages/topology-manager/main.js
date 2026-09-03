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
      id: 'vaccine-gateway',
      name: 'Rabies Vaccine Certification Gateway',
      type: 'service',
      technology: 'Node.js 20 / Fastify / TypeSpec',
      repo: 'http://127.0.0.1:3000/robos/vaccine-gateway.git',
      ownerTeam: 'Security & Compliance',
      contracts: ['contracts/vaccine-gateway.openapi.yaml'],
      upstream: ['petstore-api'],
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
    { from: 'petstore-api', to: 'vaccine-gateway', protocol: 'HTTPS/mTLS (OpenAPI 3.1)' },
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

Person(user, "Pet Adopter / Clinic Staff", "Browses catalog, adopts pets, registers vet vaccine certificates")
System_Boundary(c1, "Acme Petshop Distributed Platform (urn:robos:project:acme-petshop-platform)") {
    Container(web, "React Web Portal", "React 18 / TypeScript / Vite", "Single-page application for pet adoption & checkout")
    Container(api, "Java Spring Boot REST API", "Java 21 / Spring Boot 3.3", "Microservice processing pet catalog, adoption orders, and vet health validation")
    Container(vaccine, "Rabies Vaccine Gateway", "Node.js 20 / Fastify / TypeSpec", "Compliance service verifying vaccine certificates with state vet health registries")
    ContainerDb(db, "PostgreSQL 16 Database", "PostgreSQL 16 / Flyway", "Stores relational entities for pets, inventory, orders, and certificates")
    ContainerQueue(broker, "Apache Kafka Event Bus", "Kafka 3.7", "Publishes async pet adoption events, inventory delta events, and telemetry")
    Container(common, "TypeSpec Schema Library", "TypeSpec / OpenAPI 3.1", "Shared cross-service domain models and DTO definitions")
}

Rel(user, web, "Uses", "HTTPS")
Rel(web, api, "Adopts pets, checkout", "HTTPS / REST (OpenAPI 3.1)")
Rel(api, db, "Reads/Writes pet records & inventory", "TCP / JDBC")
Rel(api, broker, "Publishes pet.adopted & inventory.sync events", "TCP / Kafka")
Rel(api, vaccine, "Validates health & rabies certificates", "HTTPS / mTLS")
Rel(web, common, "Consumes TypeScript models", "npm")
Rel(api, common, "Consumes Java DTOs", "Maven")
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
