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

const REAL_HOME = process.env.REAL_HOME || process.env.ROBOS_HOST_HOME || process.env.HOME || '/home/ndipiazza';
const PROJECT_DIR = path.join(REAL_HOME, '.robos', 'projects', 'acme-petshop-platform');
const TOPOLOGY_FILE = path.join(PROJECT_DIR, '.robos', 'topology.yaml');

function parseOpenApiYaml(rawYaml) {
  const info = {};
  const endpoints = [];
  const schemas = [];

  const titleMatch = rawYaml.match(/title:\s*([^\n\r]+)/);
  if (titleMatch) info.title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');

  const versionMatch = rawYaml.match(/version:\s*([^\n\r]+)/);
  if (versionMatch) info.version = versionMatch[1].trim().replace(/^['"]|['"]$/g, '');

  // Extract paths and operations
  const lines = rawYaml.split('\n');
  let currentPath = null;
  let currentMethod = null;
  let currentSummary = '';
  let inPaths = false;
  let inSchemas = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === 'paths:') {
      inPaths = true;
      inSchemas = false;
      continue;
    }
    if (trimmed === 'components:' || trimmed === 'schemas:') {
      if (trimmed === 'schemas:') inSchemas = true;
      inPaths = false;
      continue;
    }

    if (inPaths) {
      if (/^\s{2}\/[\w/{}-]+:/.test(line)) {
        currentPath = trimmed.replace(/:$/, '');
      } else if (currentPath && /^\s{4}(get|post|put|delete|patch):/.test(line)) {
        currentMethod = trimmed.replace(/:$/, '').toUpperCase();
        currentSummary = '';
        // Look ahead for summary or operationId
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const sub = lines[j].trim();
          if (sub.startsWith('summary:')) {
            currentSummary = sub.replace(/^summary:\s*/, '').replace(/^['"]|['"]$/g, '');
            break;
          }
          if (sub.startsWith('operationId:')) {
            currentSummary = sub.replace(/^operationId:\s*/, '').replace(/^['"]|['"]$/g, '');
          }
        }
        endpoints.push({
          path: currentPath,
          method: currentMethod,
          summary: currentSummary || currentMethod,
        });
      }
    } else if (inSchemas) {
      if (/^\s{4}[A-Za-z0-9_]+:/.test(line)) {
        schemas.push(trimmed.replace(/:$/, ''));
      }
    }
  }

  return { info, endpoints, schemas };
}

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
  if (fs.existsSync(TOPOLOGY_FILE)) {
    try {
      const raw = fs.readFileSync(TOPOLOGY_FILE, 'utf8');
      return { ok: true, rawYaml: raw, source: TOPOLOGY_FILE };
    } catch (err) {
      console.error('Failed reading topology file from disk:', err);
    }
  }

  return {
    ok: true,
    source: 'empty',
  };
});

ipcMain.handle('top-save-topology', async (_evt, topologyData) => {
  try {
    fs.mkdirSync(path.dirname(TOPOLOGY_FILE), { recursive: true });
    fs.writeFileSync(TOPOLOGY_FILE, JSON.stringify(topologyData, null, 2), 'utf8');
    return { ok: true, path: TOPOLOGY_FILE };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('top-read-contract', async (_evt, relativeContractPath) => {
  try {
    const fullPath = path.join(PROJECT_DIR, relativeContractPath);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, error: `Contract file not found at ${fullPath}` };
    }

    const rawYaml = fs.readFileSync(fullPath, 'utf8');
    const { info, endpoints, schemas } = parseOpenApiYaml(rawYaml);

    return {
      ok: true,
      fullPath,
      rawYaml,
      info,
      endpoints,
      schemas,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
