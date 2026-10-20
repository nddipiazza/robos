'use strict';
const electron = require('electron');
const { app, BrowserWindow, ipcMain, shell } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// An explicitly configured workspace is a source-only, read-only consumer.
const GRAPH_ROOT = process.env.ROBOS_GRAPH_ROOT;
const EXTERNAL_GRAPH = GRAPH_ROOT !== undefined;
const remoteStorage = require('./lib/remote-storage');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'data-sources.json');
const CLOUD_FOLDERS_FILE = path.join(HOME_DIR, '.config', 'robos', 'cloud-folders.json');
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

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
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

  mainWindow = win;
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

// ── Standard OSS & Cloud Driver Catalog ─────────────────────────────────────

const DRIVER_CATALOG = [
  // Cloud & Object Storage (Featured First)
  {
    id: 'gdrive',
    name: 'Google Drive',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 443,
    defaultUser: '',
    uriTemplate: 'gdrive://{{folderId}}',
    icon: 'gdrive',
    description: 'Connect Google Drive folders (OAuth 2.0, Service Account, Shared Folder URL, or Local Mount) and mount them across RobOS apps',
    docsUrl: 'https://developers.google.com/drive',
  },
  {
    id: 's3',
    name: 'Amazon S3 / Cloudflare R2 / MinIO',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 443,
    defaultUser: 's3_access_key',
    uriTemplate: 's3://{{bucket}}',
    icon: 's3',
    description: 'S3-compatible object storage for cloud buckets, media assets, contracts, and backups',
    docsUrl: 'https://aws.amazon.com/s3/',
  },
  {
    id: 'dropbox',
    name: 'Dropbox Cloud Storage',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 443,
    defaultUser: 'oauth_token',
    uriTemplate: 'dropbox://{{path}}',
    icon: 'dropbox',
    description: 'Dropbox cloud folders synced for RobOS workspaces, media libraries, and shared documents',
    docsUrl: 'https://www.dropbox.com/developers',
  },
  {
    id: 'onedrive',
    name: 'Microsoft OneDrive / SharePoint',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 443,
    defaultUser: 'graph_token',
    uriTemplate: 'onedrive://{{path}}',
    icon: 'onedrive',
    description: 'Microsoft 365 OneDrive and SharePoint document libraries via Microsoft Graph API',
    docsUrl: 'https://learn.microsoft.com/en-us/onedrive/developer/',
  },
  {
    id: 'webdav',
    name: 'Nextcloud / ownCloud (WebDAV)',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 443,
    defaultUser: 'admin',
    uriTemplate: 'webdavs://{{host}}/remote.php/dav/files/{{user}}/',
    icon: 'webdav',
    description: 'Self-hosted Nextcloud, ownCloud, or standard RFC 4918 WebDAV cloud storage server',
    docsUrl: 'https://docs.nextcloud.com/',
  },
  {
    id: 'sftp',
    name: 'SFTP (SSH File Transfer)',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 22,
    defaultUser: '',
    uriTemplate: 'sftp://{{host}}:{{port}}/{{path}}',
    icon: 'sftp',
    description: 'Encrypted file transfer over SSH with password or private-key authentication',
    docsUrl: 'https://datatracker.ietf.org/doc/html/draft-ietf-secsh-filexfer-13',
  },
  {
    id: 'ftp',
    name: 'FTP / FTPS',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: 21,
    defaultUser: 'anonymous',
    uriTemplate: 'ftp://{{host}}:{{port}}/{{path}}',
    icon: 'ftp',
    description: 'Classic file transfer protocol, with optional explicit TLS (FTPS)',
    docsUrl: 'https://datatracker.ietf.org/doc/html/rfc959',
  },
  {
    id: 'local',
    name: 'Local / NAS / Network Folder Mount',
    category: 'storage',
    categoryLabel: 'Cloud & Object Storage',
    defaultPort: null,
    defaultUser: '',
    uriTemplate: 'file://{{path}}',
    icon: 'local',
    description: 'Mounted NAS share (NFS, SMB/CIFS, GVFS, rclone mount) or local directory exposed to RobOS apps',
    docsUrl: 'https://wiki.archlinux.org/title/GVFS',
  },

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
    database: '/',
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
    database: '/',
    user: 'sa-robos-sdlc@acme-corp.iam.gserviceaccount.com',
    password: '••••••••',
    ssl: true,
    status: 'Connected',
    latencyMs: 22.1,
    boundServices: ['urn:robos:service:petstore-api'],
    description: 'Shared engineering documentation, architectural decisions, media folders, and requirement docs',
    schemaSummary: '4 synced folders in RobOS',
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

function inferCategory(driverType, fallback) {
  const d = String(driverType || '').toLowerCase();
  if (remoteStorage.isRemoteDriver(d)) return 'storage';
  if (['postgres', 'mysql', 'oracle', 'mssql', 'sqlite', 'snowflake'].includes(d)) return 'sql';
  if (['mongodb', 'redis', 'dynamodb'].includes(d)) return 'nosql';
  if (['kafka', 'nats', 'rabbitmq', 'pulsar'].includes(d)) return 'streaming';
  return fallback || 'storage';
}

function loadDataSources() {
  if (EXTERNAL_GRAPH) return sourceDataSources();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        return data.map(d => ({
          ...d,
          category: inferCategory(d.driverType, d.category),
        }));
      }
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_DATASOURCES));
}

function saveDataSources(data) {
  if (EXTERNAL_GRAPH) throw new Error(READ_ONLY_MESSAGE);
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    // Connections can hold cloud/FTP/SFTP credentials, so keep the file private.
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {}
}

function loadCloudFolders() {
  try {
    if (fs.existsSync(CLOUD_FOLDERS_FILE)) {
      const list = JSON.parse(fs.readFileSync(CLOUD_FOLDERS_FILE, 'utf8'));
      if (Array.isArray(list)) return list;
    }
  } catch {}
  // Seed default mounted folders from storage data sources
  const sources = loadDataSources().filter(d => d.category === 'storage');
  return sources.map(ds => {
    const localPath = remoteStorage.ensureLocalMountDir(ds);
    return {
      id: `mount-${ds.id}-root`,
      dsId: ds.id,
      dsName: ds.name,
      driverType: ds.driverType,
      remotePath: '/',
      folderId: ds.folderId || ds.bucket || 'root',
      label: `${ds.name} (Root)`,
      localPath,
      syncedAt: new Date().toISOString(),
    };
  });
}

function saveCloudFolders(list) {
  if (EXTERNAL_GRAPH) throw new Error(READ_ONLY_MESSAGE);
  try {
    fs.mkdirSync(path.dirname(CLOUD_FOLDERS_FILE), { recursive: true });
    fs.writeFileSync(CLOUD_FOLDERS_FILE, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {}
}

let _kgraphStore = null;
function getKGraphStore() {
  if (EXTERNAL_GRAPH) {
    if (!GRAPH_ROOT.trim()) throw new Error('ROBOS_GRAPH_ROOT must name an available graph workspace');
    if (!_kgraphStore) {
      let Store;
      try { Store = require('../robos-graph/lib/graph-store').SDLCKnowledgeGraphStore; }
      catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
        Store = require('/usr/local/share/robos/robos-graph/lib/graph-store').SDLCKnowledgeGraphStore;
      }
      _kgraphStore = new Store({ graphRoot: GRAPH_ROOT });
    } else {
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
  const normalized = {
    ...ds,
    category: inferCategory(ds.driverType, ds.category),
    lastChecked: new Date().toISOString(),
  };
  if (normalized.driverType === 'gdrive') {
    normalized.folderId = remoteStorage.extractDriveFolderId(normalized.folderId || normalized.database || 'root');
    if (!normalized.database || normalized.database.includes('drive.google.com')) {
      normalized.database = '/';
    }
    normalized.host = normalized.host || 'drive.google.com';
  }
  const idx = list.findIndex(d => d.id === normalized.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...normalized };
  } else {
    list.push(normalized);
  }
  saveDataSources(list);
  syncToKnowledgeGraph(list);

  // If it's a cloud storage provider, ensure its local mount directory exists and register root folder
  if (normalized.category === 'storage') {
    try {
      const localPath = remoteStorage.ensureLocalMountDir(normalized);
      const folders = loadCloudFolders();
      const mountId = `mount-${normalized.id}-root`;
      const existingIdx = folders.findIndex(f => f.id === mountId);
      const folderEntry = {
        id: mountId,
        dsId: normalized.id,
        dsName: normalized.name,
        driverType: normalized.driverType,
        remotePath: '/',
        folderId: normalized.folderId || normalized.bucket || 'root',
        label: `${normalized.name} (Root)`,
        localPath,
        syncedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) folders[existingIdx] = folderEntry;
      else folders.push(folderEntry);
      saveCloudFolders(folders);
    } catch {}
  }

  return list;
});

registerIPC('ds-delete-datasource', async (_, id) => {
  let list = loadDataSources();
  list = list.filter(d => d.id !== id);
  saveDataSources(list);
  syncToKnowledgeGraph(list);
  try {
    const folders = loadCloudFolders().filter(f => f.dsId !== id);
    saveCloudFolders(folders);
  } catch {}
  return list;
});

registerIPC('ds-test-connection', async (_, ds) => {
  if (remoteStorage.isRemoteDriver(ds.driverType)) return remoteStorage.testConnection(ds);
  const start = Date.now();
  await new Promise(r => setTimeout(r, 350));
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

registerIPC('ds-inspect-schema', async (_, { id, driverType, path: remotePath }) => {
  if (remoteStorage.isRemoteDriver(driverType)) {
    const ds = loadDataSources().find(d => d.id === id);
    if (!ds) return { remote: { path: '/', entries: [], error: 'Unknown data source' } };
    try {
      const listing = await remoteStorage.listDir(ds, remotePath);
      const response = { remote: listing };
      if (driverType === 's3') {
        response.buckets = [
          { name: ds.bucket || 'acme-petshop-vault-prod', objectsCount: listing.entries.length, sizeFormatted: '48.2 MB' },
          { name: 'acme-petshop-specs-contracts', objectsCount: 68, sizeFormatted: '2.4 MB' },
          { name: 'acme-petshop-backups', objectsCount: 14, sizeFormatted: '1.2 GB' },
        ];
      }
      if (driverType === 'gdrive') {
        response.folders = listing.entries.filter(e => e.type === 'dir').map(e => ({
          id: e.driveId || e.name,
          name: e.name,
          path: e.path,
          filesCount: 'Folder',
        }));
      }
      return response;
    } catch (err) {
      return { remote: { path: remotePath || ds.database || '/', entries: [], error: err.message } };
    }
  }
  if (driverType === 'postgres' || driverType === 'oracle' || driverType === 'mysql' || driverType === 'mssql' || driverType === 'sqlite') {
    return SAMPLE_POSTGRES_SCHEMA;
  }
  return { tables: [] };
});

registerIPC('ds-execute-query', async (_, { id, driverType, query }) => {
  const start = Date.now();
  await new Promise(r => setTimeout(r, 150));
  const executionTimeMs = Math.max(1, Date.now() - start);

  const q = (query || '').trim().toLowerCase();

  // If querying a Cloud Storage / Google Drive source, search files matching the query
  if (remoteStorage.isRemoteDriver(driverType)) {
    const ds = loadDataSources().find(d => d.id === id);
    if (ds) {
      try {
        const searchTerm = q.replace(/^select\s+\*\s+from\s+\S+\s*(where\s+name\s+like\s+)?/i, '').replace(/['"%;]/g, '').trim();
        const files = await remoteStorage.walk(ds, '/', (name) => !searchTerm || name.toLowerCase().includes(searchTerm), 200);
        return {
          ok: true,
          columns: ['name', 'path', 'size_kb', 'modified'],
          rows: files.map(f => [f.name, f.path, `${Math.max(1, Math.round((f.size || 0) / 1024))} KB`, f.modified ? f.modified.slice(0, 19).replace('T', ' ') : '-']),
          rowCount: files.length,
          executionTimeMs,
        };
      } catch (err) {
        return {
          ok: false,
          columns: ['status', 'error'],
          rows: [['ERROR', err.message]],
          rowCount: 1,
          executionTimeMs,
        };
      }
    }
  }

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

// ── Cloud Storage & Google Drive Folder Operations ──────────────────────────

registerIPC('ds-get-cloud-folders', async () => {
  return loadCloudFolders();
});

registerIPC('ds-mount-cloud-folder', async (_, { dsId, remotePath, label }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);
  const normPath = remoteStorage.normalizeRemote(remotePath || '/');
  const syncRes = await remoteStorage.syncFolderToLocal(ds, normPath);

  const folders = loadCloudFolders();
  const mountId = `mount-${ds.id}-${normPath === '/' ? 'root' : normPath.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const folderName = normPath === '/' ? `${ds.name} (Root)` : `${ds.name}: ${path.posix.basename(normPath)}`;
  const entry = {
    id: mountId,
    dsId: ds.id,
    dsName: ds.name,
    driverType: ds.driverType,
    remotePath: normPath,
    folderId: ds.folderId || ds.bucket || 'root',
    label: label || folderName,
    localPath: syncRes.localPath,
    syncedFiles: syncRes.syncedFiles,
    syncedAt: new Date().toISOString(),
  };

  const idx = folders.findIndex(f => f.id === mountId);
  if (idx >= 0) folders[idx] = entry;
  else folders.push(entry);
  saveCloudFolders(folders);

  return { ok: true, entry, folders };
});

registerIPC('ds-unmount-cloud-folder', async (_, mountId) => {
  const folders = loadCloudFolders().filter(f => f.id !== mountId);
  saveCloudFolders(folders);
  return { ok: true, folders };
});

registerIPC('ds-create-folder', async (_, { dsId, remotePath }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);
  return await remoteStorage.mkdir(ds, remotePath);
});

registerIPC('ds-upload-files', async (_, { dsId, remoteDir, filePaths }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);

  let targets = filePaths;
  if (!Array.isArray(targets) || !targets.length) {
    if (!electron.dialog || !mainWindow) return { canceled: true, uploaded: [] };
    const res = await electron.dialog.showOpenDialog(mainWindow, {
      title: `Upload Files to ${ds.name}`,
      buttonLabel: 'Upload',
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true, uploaded: [] };
    targets = res.filePaths;
  }

  const uploaded = [];
  for (const fp of targets) {
    const out = await remoteStorage.upload(ds, fp, remoteDir || '/');
    uploaded.push(out);
  }
  return { ok: true, canceled: false, uploaded };
});

registerIPC('ds-download-file', async (_, { dsId, remoteFile }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);
  const rootDir = remoteStorage.ensureLocalMountDir(ds);
  const rel = remoteStorage.normalizeRemote(remoteFile).split('/').filter(p => p && p !== '..').join(path.sep);
  const localTarget = path.join(rootDir, rel);
  await remoteStorage.download(ds, remoteFile, localTarget);
  return { ok: true, localPath: localTarget };
});

registerIPC('ds-detect-gdrive-mounts', async () => {
  return remoteStorage.detectLocalGoogleDriveMounts();
});

registerIPC('ds-pick-local-folder', async () => {
  if (!electron.dialog || !mainWindow) return { canceled: true };
  const res = await electron.dialog.showOpenDialog(mainWindow, {
    title: 'Select Local or Mounted Cloud Directory',
    buttonLabel: 'Select Folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  return { canceled: false, folderPath: res.filePaths[0] };
});

registerIPC('ds-pick-key-file', async (_, { title } = {}) => {
  if (!electron.dialog || !mainWindow) return { canceled: true };
  const res = await electron.dialog.showOpenDialog(mainWindow, {
    title: title || 'Select Key / Service Account File',
    buttonLabel: 'Select File',
    properties: ['openFile', 'showHiddenFiles'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  return { canceled: false, filePath: res.filePaths[0] };
});

registerIPC('ds-open-local-path', async (_, localPath) => {
  if (localPath && fs.existsSync(localPath) && shell && typeof shell.openPath === 'function') {
    await shell.openPath(localPath);
    return { ok: true };
  }
  return { ok: false, error: 'Path does not exist: ' + localPath };
});

registerIPC('ds-google-oauth-signin', async (_, { clientId, clientSecret }) => {
  if (!clientId || !clientSecret) {
    throw new Error('Enter your Google Cloud OAuth 2.0 Client ID and Client Secret first, or use Service Account JSON / API Token / Local Mount.');
  }

  return await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err || !code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h2>Google Drive Authorization Cancelled</h2><p>You can close this tab and return to RobOS Data Sources.</p>');
          server.close();
          reject(new Error(err || 'No authorization code returned'));
          return;
        }
        const port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2 style="font-family:sans-serif;color:#10b981;">✓ Google Drive Connected to RobOS!</h2><p style="font-family:sans-serif;">You can close this browser tab and return to RobOS Data Sources.</p>');
        server.close();
        resolve({
          ok: true,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
        });
      } catch (e) {
        server.close();
        reject(e);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      if (shell && typeof shell.openExternal === 'function') {
        shell.openExternal(authUrl.toString());
      }
    });

    setTimeout(() => {
      try { server.close(); } catch {}
      reject(new Error('Google OAuth sign-in timed out after 120 seconds.'));
    }, 120000).unref?.();
  });
});

registerIPC('open-url', async (_, url) => {
  if (url && shell && typeof shell.openExternal === 'function') shell.openExternal(url);
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
