'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// An explicitly configured workspace is a source-only, read-only consumer.
const GRAPH_ROOT = process.env.ROBOS_GRAPH_ROOT;
const EXTERNAL_GRAPH = GRAPH_ROOT !== undefined;
const cp = require('child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'data-sources.json');
const KGRAPH_FILE = path.join(HOME_DIR, '.robos', 'knowledge-graph.jsonld');

// Debug server (optional)
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS Data Sources',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19178);
  }

  return win;
}

app.setName('data-sources');
app.setPath('userData', path.join(HOME_DIR, '.config', 'robos', 'electron', 'data-sources'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Standard OSS Driver Catalog ─────────────────────────────────────────────

const DRIVER_CATALOG = [
  // SQL / Relational
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'sql',
    categoryLabel: 'SQL / Relational',
    defaultPort: 5432,
    defaultUser: 'postgres',
    uriTemplate: 'postgresql://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'postgres',
    description: 'Advanced open-source relational database with JSON, geospatial, and vector support',
    docsUrl: 'https://www.postgresql.org/docs/',
  },
  {
    id: 'mysql',
    name: 'MySQL / MariaDB',
    category: 'sql',
    categoryLabel: 'SQL / Relational',
    defaultPort: 3306,
    defaultUser: 'root',
    uriTemplate: 'mysql://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'mysql',
    description: 'Fast, reliable relational database for web services and microservice backends',
    docsUrl: 'https://dev.mysql.com/doc/',
  },
  {
    id: 'oracle',
    name: 'Oracle Database',
    category: 'sql',
    categoryLabel: 'SQL / Relational',
    defaultPort: 1521,
    defaultUser: 'system',
    uriTemplate: 'oracle://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'oracle',
    description: 'Enterprise relational database with autonomous clustering and PL/SQL',
    docsUrl: 'https://docs.oracle.com/en/database/',
  },
  {
    id: 'mssql',
    name: 'Microsoft SQL Server',
    category: 'sql',
    categoryLabel: 'SQL / Relational',
    defaultPort: 1433,
    defaultUser: 'sa',
    uriTemplate: 'mssql://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'mssql',
    description: 'Enterprise database management system with T-SQL and Azure hybrid integration',
    docsUrl: 'https://learn.microsoft.com/en-us/sql/',
  },
  {
    id: 'sqlite',
    name: 'SQLite / DuckDB',
    category: 'sql',
    categoryLabel: 'SQL / Relational',
    defaultPort: null,
    defaultUser: '',
    uriTemplate: 'sqlite:///{{host}}',
    icon: 'sqlite',
    description: 'Lightweight, self-contained serverless SQL engine and embedded columnar analytical store',
    docsUrl: 'https://www.sqlite.org/docs.html',
  },
  {
    id: 'snowflake',
    name: 'Snowflake / Redshift',
    category: 'warehouse',
    categoryLabel: 'Analytics & Warehouse',
    defaultPort: 443,
    defaultUser: 'admin',
    uriTemplate: 'snowflake://{{user}}@{{host}}/{{database}}',
    icon: 'snowflake',
    description: 'Elastic cloud data warehouse and analytical compute engine',
    docsUrl: 'https://docs.snowflake.com/',
  },

  // NoSQL & Document
  {
    id: 'mongodb',
    name: 'MongoDB',
    category: 'nosql',
    categoryLabel: 'NoSQL & Document',
    defaultPort: 27017,
    defaultUser: 'admin',
    uriTemplate: 'mongodb://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'mongodb',
    description: 'Distributed document-oriented JSON database for flexible schemas',
    docsUrl: 'https://www.mongodb.com/docs/',
  },
  {
    id: 'redis',
    name: 'Redis',
    category: 'nosql',
    categoryLabel: 'NoSQL & Document',
    defaultPort: 6379,
    defaultUser: 'default',
    uriTemplate: 'redis://{{host}}:{{port}}',
    icon: 'redis',
    description: 'In-memory key-value store, cache, and message broker',
    docsUrl: 'https://redis.io/docs/',
  },
  {
    id: 'dynamodb',
    name: 'Amazon DynamoDB',
    category: 'nosql',
    categoryLabel: 'NoSQL & Document',
    defaultPort: 443,
    defaultUser: 'AWS_ACCESS_KEY_ID',
    uriTemplate: 'dynamodb://{{region}}',
    icon: 'aws',
    description: 'Managed serverless key-value and document database by AWS',
    docsUrl: 'https://docs.aws.amazon.com/dynamodb/',
  },

  // Object Storage & Cloud
  {
    id: 's3',
    name: 'Amazon S3 / MinIO',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 443,
    defaultUser: 's3_access_key',
    uriTemplate: 's3://{{bucket}}',
    icon: 's3',
    description: 'Scalable object storage for contracts, artifacts, and backups',
    docsUrl: 'https://aws.amazon.com/s3/',
  },
  {
    id: 'gdrive',
    name: 'Google Drive / GCS',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 443,
    defaultUser: 'service_account',
    uriTemplate: 'gdrive://{{folderId}}',
    icon: 'gdrive',
    description: 'Cloud document and object repository synced with Google Cloud / Workspace',
    docsUrl: 'https://developers.google.com/drive',
  },

  // Streaming & Messaging
  {
    id: 'kafka',
    name: 'Apache Kafka',
    category: 'streaming',
    categoryLabel: 'Streaming & Queues',
    defaultPort: 9092,
    defaultUser: '',
    uriTemplate: 'kafka://{{host}}:{{port}}',
    icon: 'kafka',
    description: 'Distributed event streaming platform for high-throughput pipelines',
    docsUrl: 'https://kafka.apache.org/documentation/',
  },
];

// ── Default Knowledge Graph Data Sources ─────────────────────────────────────

const DEFAULT_DATASOURCES = [
  {
    id: 'postgres-petshop-local',
    name: 'Acme Petshop PostgreSQL Database',
    driverType: 'postgres',
    category: 'sql',
    host: '127.0.0.1',
    port: 5432,
    database: 'petshop',
    user: 'postgres',
    password: '••••••••',
    ssl: false,
    status: 'Connected',
    latencyMs: 1.4,
    boundServices: ['urn:robos:service:petstore-api', 'urn:robos:service:vaccine-gateway'],
    description: 'Primary relational database for pet inventory, adoptions, and rabies certifications',
    schemaSummary: '5 tables (pets, vaccines, surgeries, adoptions, audit)',
    lastChecked: new Date().toISOString(),
  },
  {
    id: 's3-acme-artifacts',
    name: 'AWS S3 Document & Contract Vault',
    driverType: 's3',
    category: 'storage',
    host: 's3.us-east-1.amazonaws.com',
    port: 443,
    region: 'us-east-1',
    bucket: 'acme-petshop-vault-prod',
    user: 'AKIA_PROD_S3_KEY',
    password: '••••••••',
    ssl: true,
    status: 'Connected',
    latencyMs: 14.8,
    boundServices: ['urn:robos:service:petstore-infra', 'urn:robos:service:vaccine-gateway'],
    description: 'Object storage for rabies vaccination PDF certificates and OpenAPI 3.1 artifacts',
    schemaSummary: '3 buckets (specs, certs, backups)',
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'gdrive-sdlc-specs',
    name: 'Google Drive SDLC Specification Hub',
    driverType: 'gdrive',
    category: 'storage',
    host: 'drive.google.com',
    port: 443,
    folderId: '0B123_Acme_SDLC_Engineering_Root',
    user: 'sa-robos-sdlc@acme-corp.iam.gserviceaccount.com',
    password: '••••••••',
    ssl: true,
    status: 'Connected',
    latencyMs: 22.1,
    boundServices: ['urn:robos:service:petstore-api'],
    description: 'Shared engineering documentation, architectural decisions, and requirement docs',
    schemaSummary: '12 active spec folders',
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'oracle-billing-core',
    name: 'Oracle Enterprise Billing Core',
    driverType: 'oracle',
    category: 'sql',
    host: 'oracle-db.internal.acme.com',
    port: 1521,
    database: 'ORCL_FIN',
    user: 'c##billing_app',
    password: '••••••••',
    ssl: true,
    status: 'Connected',
    latencyMs: 8.9,
    boundServices: ['urn:robos:service:petstore-api'],
    description: 'Core financial and merchant billing database for pet adoptions and medical invoicing',
    schemaSummary: '18 tables (invoices, ledgers, accounts)',
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'redis-session-cache',
    name: 'Redis Fastify Session & Rate Limit Cache',
    driverType: 'redis',
    category: 'nosql',
    host: '127.0.0.1',
    port: 6379,
    database: '0',
    user: 'default',
    password: '••••••••',
    ssl: false,
    status: 'Connected',
    latencyMs: 0.6,
    boundServices: ['urn:robos:service:vaccine-gateway'],
    description: 'In-memory token verification cache and rate limiting store for vaccination gateway',
    schemaSummary: '4,280 keys cached',
    lastChecked: new Date().toISOString(),
  },
];

// Sample database tables schema for PostgreSQL
const SAMPLE_POSTGRES_SCHEMA = {
  tables: [
    {
      name: 'pets',
      type: 'BASE TABLE',
      rows: 142,
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, isPrimary: true },
        { name: 'name', type: 'VARCHAR(128)', nullable: false, isPrimary: false },
        { name: 'species', type: 'VARCHAR(64)', nullable: false, isPrimary: false },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, isPrimary: false },
        { name: 'microchip_id', type: 'VARCHAR(64)', nullable: true, isPrimary: false },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, isPrimary: false },
      ],
    },
    {
      name: 'vaccination_certificates',
      type: 'BASE TABLE',
      rows: 89,
      columns: [
        { name: 'cert_id', type: 'VARCHAR(64)', nullable: false, isPrimary: true },
        { name: 'pet_id', type: 'VARCHAR(64)', nullable: false, isPrimary: false },
        { name: 'vaccine_type', type: 'VARCHAR(64)', nullable: false, isPrimary: false },
        { name: 'administered_date', type: 'DATE', nullable: false, isPrimary: false },
        { name: 'expiry_date', type: 'DATE', nullable: false, isPrimary: false },
        { name: 'verified_by_mtls', type: 'BOOLEAN', nullable: false, isPrimary: false },
      ],
    },
    {
      name: 'surgeries',
      type: 'BASE TABLE',
      rows: 18,
      columns: [
        { name: 'booking_id', type: 'VARCHAR(64)', nullable: false, isPrimary: true },
        { name: 'pet_id', type: 'VARCHAR(64)', nullable: false, isPrimary: false },
        { name: 'procedure', type: 'VARCHAR(128)', nullable: false, isPrimary: false },
        { name: 'operating_room', type: 'VARCHAR(32)', nullable: false, isPrimary: false },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, isPrimary: false },
        { name: 'scheduled_time', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, isPrimary: false },
      ],
    },
    {
      name: 'adoptions',
      type: 'BASE TABLE',
      rows: 56,
      columns: [
        { name: 'adoption_id', type: 'VARCHAR(64)', nullable: false, isPrimary: true },
        { name: 'pet_id', type: 'VARCHAR(64)', nullable: false, isPrimary: false },
        { name: 'adopter_name', type: 'VARCHAR(128)', nullable: false, isPrimary: false },
        { name: 'fee_usd', type: 'NUMERIC(10,2)', nullable: false, isPrimary: false },
        { name: 'finalized_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, isPrimary: false },
      ],
    },
  ],
};

function loadDataSources() {
  if (EXTERNAL_GRAPH) return sourceDataSources();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_DATASOURCES));
}

function saveDataSources(data) {
  if (EXTERNAL_GRAPH) throw new Error(READ_ONLY_MESSAGE);
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

let _kgraphStore = null;
function getKGraphStore() {
  if (EXTERNAL_GRAPH) {
    if (!GRAPH_ROOT.trim()) throw new Error('ROBOS_GRAPH_ROOT must name an available graph workspace');
    if (!_kgraphStore) {
      // Load the shared store directly: package main.js is the Electron app entry.
      let Store;
      try { Store = require('../robos-graph/lib/graph-store').SDLCKnowledgeGraphStore; }
      catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
        Store = require('/usr/local/share/robos/robos-graph/lib/graph-store').SDLCKnowledgeGraphStore;
      }
      _kgraphStore = new Store({ graphRoot: GRAPH_ROOT });
    } else {
      // Re-read accepted state and fail if the workspace has become unavailable.
      _kgraphStore.init();
    }
    const workspace = _kgraphStore.workspace;
    const packages = path.join(workspace.root, 'kgraphs');
    const hasPackages = fs.existsSync(packages) && fs.readdirSync(packages, { withFileTypes: true })
      .some(entry => entry.isDirectory() && fs.existsSync(path.join(packages, entry.name, 'package.jsonld')));
    if (!fs.existsSync(workspace.file) && !hasPackages) throw new Error('Configured graph workspace is unavailable');
    return _kgraphStore;
  }
  if (!_kgraphStore) {
    try {
      const { SDLCKnowledgeGraphStore } = require('../robos-graph');
      _kgraphStore = new SDLCKnowledgeGraphStore();
    } catch {
      try {
        const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');
        _kgraphStore = new SDLCKnowledgeGraphStore();
      } catch {}
    }
  }
  return _kgraphStore;
}

function syncToKnowledgeGraph(dataSources) {
  if (EXTERNAL_GRAPH) throw new Error(READ_ONLY_MESSAGE);
  try {
    const store = getKGraphStore();
    if (!store) return;
    for (const ds of dataSources) {
      if (ds.category === 'sql') {
        store.createDatabase({
          '@id': `urn:robos:datasource:${ds.id}`,
          title: ds.name,
          engine: ds.driverType || 'postgresql',
          databaseName: ds.database || ds.id,
          host: ds.host || '127.0.0.1',
          port: ds.port,
          boundServices: ds.boundServices || [],
        });
      } else if (ds.category === 'nosql' || ds.driverType === 'redis' || ds.driverType === 'mongodb') {
        store.createNoSQLDatabase({
          '@id': `urn:robos:datasource:${ds.id}`,
          title: ds.name,
          engine: ds.driverType || 'redis',
          databaseName: ds.database,
          host: ds.host || '127.0.0.1',
          port: ds.port,
        });
      } else {
        const urn = `urn:robos:datasource:${ds.id}`;
        store.addNode({
          '@id': urn,
          '@type': ['oslc_am:Resource', 'robos:DataSource', 'robos:StorageStore'],
          'dcterms:title': ds.name,
          'robos:driverType': ds.driverType || 'generic',
          'robos:category': ds.category || 'storage',
          'robos:host': ds.host || '127.0.0.1',
          'robos:port': ds.port,
          'robos:databaseName': ds.database || ds.bucket || ds.folderId || ds.id,
          'robos:boundServices': ds.boundServices || [],
          'robos:status': ds.status || 'Configured',
          'robos:package': 'core-platform',
          'robos:namespace': 'robos.core',
          'robos:updatedAt': new Date().toISOString(),
        });
      }
    }
  } catch (_) {}
}


const READ_ONLY_MESSAGE = 'External graph mode is source-only. Use the graph review workflow for changes; live operations are unavailable.';
function sourceDataSources() {
  const types = ['robos:Database', 'robos:RelationalDatabase', 'robos:NoSQLDatabase', 'robos:DataStore', 'robos:BrokerDefinition', 'robos:DataSource', 'robos:StorageStore', 'robos:MessageBroker', 'robos:ObjectStorage'];
  return getKGraphStore().query({}).filter(node => [].concat(node['@type'] || []).some(type => types.includes(type))).map(node => {
    const nodeTypes = [].concat(node['@type'] || []);
    const engine = node['robos:driverType'] ?? node['robos:engine'] ?? node['robos:brokerType'] ?? 'unknown';
    // UI categories describe the declared technology, never connectivity or deployment.
    const technology = String(engine).toLowerCase();
    const driverType = ({ postgresql: 'postgres', mariadb: 'mysql' })[technology] || technology;
    let category = node['robos:category'] ?? null;
    if (!category) {
      if (nodeTypes.some(type => ['robos:BrokerDefinition', 'robos:MessageBroker'].includes(type))) category = 'streaming';
      else if (['postgres', 'mysql', 'sqlite', 'oracle', 'mssql'].includes(driverType) || nodeTypes.includes('robos:RelationalDatabase')) category = 'sql';
      else if (['redis', 'mongodb', 'dynamodb'].includes(driverType) || nodeTypes.includes('robos:NoSQLDatabase')) category = 'nosql';
      else if (nodeTypes.some(type => ['robos:StorageStore', 'robos:ObjectStorage'].includes(type))) category = 'storage';
    }
    return {
      ...node, id: node['@id'], kgraphId: node['@id'], name: node['dcterms:title'] || node['@id'],
      driverType, category, host: node['robos:host'] ?? null,
      port: node['robos:port'] ?? null, database: node['robos:databaseName'] ?? null,
      description: node['dcterms:description'] ?? '',
      boundServices: [].concat(node['robos:boundServices'] || []).map(ref => typeof ref === 'string' ? ref : ref?.['@id']).filter(Boolean),
      sourceOnly: true, status: 'Unknown', latencyMs: null, lastChecked: null, schemaSummary: null,
    };
  });
}
function registerIPC(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!EXTERNAL_GRAPH) return handler(event, ...args);
    if (channel === 'ds-get-datasources') return sourceDataSources();
    if (channel === 'ds-get-drivers' || channel === 'open-url') return handler(event, ...args);
    throw new Error(READ_ONLY_MESSAGE);
  });
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

registerIPC('ds-get-drivers', async () => {
  return DRIVER_CATALOG;
});

registerIPC('ds-get-datasources', async () => {
  return loadDataSources();
});

registerIPC('ds-save-datasource', async (_, ds) => {
  const list = loadDataSources();
  const idx = list.findIndex(d => d.id === ds.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...ds, lastChecked: new Date().toISOString() };
  } else {
    list.push({ ...ds, lastChecked: new Date().toISOString() });
  }
  saveDataSources(list);
  syncToKnowledgeGraph(list);
  return list;
});

registerIPC('ds-delete-datasource', async (_, id) => {
  let list = loadDataSources();
  list = list.filter(d => d.id !== id);
  saveDataSources(list);
  syncToKnowledgeGraph(list);
  return list;
});

registerIPC('ds-test-connection', async (_, ds) => {
  const start = Date.now();
  // Simulate realistic network connection probe
  await new Promise(r => setTimeout(r, 450));
  const latency = Math.round((Date.now() - start) * 0.05 * 10) / 10 + 0.8;
  return {
    ok: true,
    status: 'Connected',
    latencyMs: latency,
    serverVersion: ds.driverType === 'postgres' ? 'PostgreSQL 16.3 (Debian 16.3-1.pgdg120+1)' :
                   ds.driverType === 'oracle' ? 'Oracle Database 23c Enterprise Edition' :
                   ds.driverType === 'mysql' ? 'MySQL Community Server 8.0.36' :
                   ds.driverType === 'redis' ? 'Redis 7.2.4 standalone' :
                   ds.driverType === 's3' ? 'AWS S3 REST API v2 (us-east-1)' :
                   ds.driverType === 'gdrive' ? 'Google Drive v3 REST API' : 'v1.0.0',
    message: `Successfully connected to ${ds.name} (${ds.driverType}) at ${ds.host || ds.region || 'localhost'}. Handshake verified.`,
  };
});

registerIPC('ds-inspect-schema', async (_, { id, driverType }) => {
  if (driverType === 'postgres' || driverType === 'oracle' || driverType === 'mysql' || driverType === 'mssql' || driverType === 'sqlite') {
    return SAMPLE_POSTGRES_SCHEMA;
  }
  if (driverType === 's3') {
    return {
      buckets: [
        { name: 'acme-petshop-vault-prod', objectsCount: 1420, sizeFormatted: '48.2 MB' },
        { name: 'acme-petshop-specs-contracts', objectsCount: 68, sizeFormatted: '2.4 MB' },
        { name: 'acme-petshop-backups', objectsCount: 14, sizeFormatted: '1.2 GB' },
      ],
      files: [
        { key: 'certs/rabies/PET-105-luna-rabies-cert.pdf', size: 142850, modified: '2026-09-04T10:15:00Z' },
        { key: 'contracts/acme-vaccine-gateway-v1.yaml', size: 14920, modified: '2026-09-04T11:00:00Z' },
        { key: 'specs/features/rabies-vaccine-verification.feature', size: 4120, modified: '2026-09-04T09:30:00Z' },
      ],
    };
  }
  if (driverType === 'gdrive') {
    return {
      folders: [
        { id: 'f_specs_01', name: 'Engineering Specs & RFCs', filesCount: 24 },
        { id: 'f_arch_02', name: 'Knowledge Graph Architecture', filesCount: 12 },
        { id: 'f_ops_03', name: 'Production Runbooks & SLOs', filesCount: 9 },
      ],
    };
  }
  return { tables: [] };
});

registerIPC('ds-execute-query', async (_, { id, driverType, query }) => {
  const start = Date.now();
  await new Promise(r => setTimeout(r, 200));
  const executionTimeMs = Date.now() - start;

  const q = (query || '').trim().toLowerCase();

  if (q.includes('select') && q.includes('pets')) {
    return {
      ok: true,
      columns: ['id', 'name', 'species', 'status', 'microchip_id', 'created_at'],
      rows: [
        ['PET-105', 'Luna', 'Canine (Husky)', 'AVAILABLE', 'CHIP-99014-VAX', '2026-09-04 09:12:00 UTC'],
        ['PET-106', 'Milo', 'Feline (Tabby)', 'ADOPTED', 'CHIP-99015-MED', '2026-09-04 10:30:00 UTC'],
        ['PET-107', 'Barnaby', 'Canine (Golden)', 'PENDING_SURGERY', 'CHIP-99016-SURG', '2026-09-04 11:45:00 UTC'],
        ['PET-108', 'Cleo', 'Feline (Siamese)', 'AVAILABLE', 'CHIP-99017-VAX', '2026-09-04 12:00:00 UTC'],
        ['PET-109', 'Rocky', 'Canine (Bulldog)', 'AVAILABLE', 'CHIP-99018-NONE', '2026-09-04 12:15:00 UTC'],
      ],
      rowCount: 5,
      executionTimeMs,
    };
  }

  if (q.includes('select') && q.includes('vaccin')) {
    return {
      ok: true,
      columns: ['cert_id', 'pet_id', 'vaccine_type', 'administered_date', 'expiry_date', 'verified_by_mtls'],
      rows: [
        ['VAX-CERT-9941', 'PET-105', 'Rabies (3-Year PureVax)', '2026-09-04', '2029-09-04', true],
        ['VAX-CERT-9942', 'PET-106', 'FVRCP Core Feline', '2026-08-12', '2027-08-12', true],
        ['VAX-CERT-9943', 'PET-107', 'DHPP Canine Core', '2026-08-20', '2027-08-20', true],
      ],
      rowCount: 3,
      executionTimeMs,
    };
  }

  // Default query response
  return {
    ok: true,
    columns: ['status', 'message', 'timestamp'],
    rows: [
      ['SUCCESS', 'Query executed successfully against ' + id, new Date().toISOString()],
    ],
    rowCount: 1,
    executionTimeMs,
  };
});

registerIPC('open-url', async (_, url) => {
  if (url) shell.openExternal(url);
  return { ok: true };
});

// Source workspaces use declaration UI, not the legacy live-driver demo panels.
ipcMain.handle('ds-source-workspace', () => {
  if (!EXTERNAL_GRAPH) return { sourceOnly: false };
  const store = getKGraphStore(), document = store.workspace.read(), all = document['robos:nodes'];
  const types = ['robos:DataStore','robos:Database','robos:NoSQLDatabase','robos:MessageBroker','robos:BrokerDefinition','robos:MessageTopic','robos:ConsumerGroup','robos:DataModel','robos:DatabaseTable','robos:DatabaseColumn'];
  return { sourceOnly: true, appName: 'Data Sources', title: document['dcterms:title'], root: store.workspace.root,
    nodes: all.filter(n => [].concat(n['@type']).some(t => types.includes(t))),
    labels: Object.fromEntries(all.map(n => [n['@id'], n['dcterms:title'] || n['@id']])) };
});
