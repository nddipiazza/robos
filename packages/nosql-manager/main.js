'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'nosql-connections.json');

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
    width: 1240,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS NoSQL Database Management',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19180);
  }

  return win;
}

app.setName('nosql-manager');
app.setPath('userData', path.join(HOME_DIR, '.config', 'robos', 'electron', 'nosql-manager'));

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

const DEFAULT_NOSQL_CONNS = [
  {
    id: 'conn-mongo-petshop',
    name: 'Petshop Document Store (MongoDB 7)',
    type: 'mongodb',
    host: '127.0.0.1:27017',
    database: 'petshop_docs',
    status: 'Connected',
    collections: ['pet_profiles', 'medical_records', 'audit_events'],
  },
  {
    id: 'conn-redis-cache',
    name: 'Fastify Session Cache (Redis 7)',
    type: 'redis',
    host: '127.0.0.1:6379',
    database: 'db0',
    status: 'Connected',
    keysCount: 4280,
  },
];

const SAMPLE_MONGO_DOCS = [
  {
    _id: "66d87e1a90b4e2f811a00105",
    petId: "PET-105",
    name: "Luna",
    species: "Canine",
    breed: "Siberian Husky",
    status: "AVAILABLE",
    traits: ["friendly", "high_energy", "vaccinated"],
    vaccinationHistory: [
      { type: "Rabies", date: "2026-09-04", certId: "VAX-CERT-9941", verified: true },
      { type: "DHPP", date: "2026-08-15", certId: "VAX-CERT-8812", verified: true }
    ],
    metadata: { chipId: "CHIP-99014-VAX", shelterBranch: "Seattle-North" }
  },
  {
    _id: "66d87e1a90b4e2f811a00106",
    petId: "PET-106",
    name: "Milo",
    species: "Feline",
    breed: "Domestic Tabby",
    status: "ADOPTED",
    traits: ["calm", "indoor_only"],
    vaccinationHistory: [
      { type: "FVRCP", date: "2026-08-12", certId: "VAX-CERT-9942", verified: true }
    ],
    metadata: { chipId: "CHIP-99015-MED", shelterBranch: "Bellevue-East" }
  }
];

const SAMPLE_REDIS_KEYS = [
  { key: "session:token:usr_991204", type: "STRING", ttl: 3540, value: '{"userId":"usr_991","role":"developer","authMode":"mTLS"}' },
  { key: "ratelimit:vax:127.0.0.1", type: "STRING", ttl: 58, value: "14" },
  { key: "cache:pet:PET-105", type: "HASH", ttl: -1, value: '{"name":"Luna","status":"AVAILABLE","vaxCert":"VAX-CERT-9941"}' },
  { key: "stream:deploy:events", type: "LIST", ttl: -1, value: '["deploy_started","k8s_reconciled","ready_1_1"]' },
];

let _kgraphStore = null;
function getKGraphStore() {
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

function kgraphNodeToNoSQLConnection(node) {
  const slug = (node['@id'] || '').split(':').pop() || 'nosql';
  return {
    id: `conn-${slug}`,
    name: node['dcterms:title'] || slug,
    type: node['robos:engine'] || 'redis',
    host: node['robos:host'] || '127.0.0.1',
    port: node['robos:port'] || (node['robos:engine'] === 'mongodb' ? 27017 : 6379),
    database: node['robos:databaseName'] || slug,
    status: 'Connected',
    collections: node['robos:collections'] || (node['robos:engine'] === 'mongodb' ? ['documents'] : undefined),
    keysCount: node['robos:engine'] === 'redis' ? 4280 : undefined,
    kgraphId: node['@id'],
  };
}

function syncNoSQLToKGraph(conn) {
  const store = getKGraphStore();
  if (!store) return;
  const slug = (conn.id || conn.name || 'nosql').replace(/^conn-/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  store.createNoSQLDatabase({
    '@id': conn.kgraphId || `urn:robos:nosql:${slug}`,
    title: conn.name || `${slug} Store`,
    engine: conn.type || 'redis',
    host: String(conn.host || '127.0.0.1').split(':')[0],
    port: conn.port || (String(conn.host || '').includes(':') ? Number(conn.host.split(':')[1]) : undefined),
    databaseName: conn.database,
    collections: conn.collections,
  });
}

function loadConnections() {
  let conns = [];
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      conns = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}

  if (!conns || conns.length === 0) {
    conns = JSON.parse(JSON.stringify(DEFAULT_NOSQL_CONNS));
    saveConnections(conns);
  }

  const store = getKGraphStore();
  if (store) {
    const kgDbs = store.getNoSQLDatabases();
    if (kgDbs && kgDbs.length > 0) {
      for (const node of kgDbs) {
        const mapped = kgraphNodeToNoSQLConnection(node);
        const existingIdx = conns.findIndex(c => c.id === mapped.id || c.kgraphId === node['@id']);
        if (existingIdx >= 0) {
          conns[existingIdx] = { ...mapped, ...conns[existingIdx], kgraphId: node['@id'] };
        } else {
          conns.push(mapped);
        }
      }
    } else {
      for (const conn of conns) {
        syncNoSQLToKGraph(conn);
      }
    }
  }

  return conns;
}

function saveConnections(conns) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(conns, null, 2), 'utf8');
  } catch {}
}

ipcMain.handle('nosql-get-connections', async () => loadConnections());

ipcMain.handle('nosql-save-connection', async (_, conn) => {
  const list = loadConnections();
  const idx = list.findIndex(c => c.id === conn.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...conn };
  else list.push(conn);
  saveConnections(list);
  syncNoSQLToKGraph(conn);
  return list;
});

ipcMain.handle('nosql-get-documents', async (_, { connId, collection, filter }) => {
  return SAMPLE_MONGO_DOCS;
});

ipcMain.handle('nosql-get-redis-keys', async (_, { pattern = '*' }) => {
  return SAMPLE_REDIS_KEYS;
});

ipcMain.handle('nosql-exec-redis-cmd', async (_, { cmd }) => {
  const c = cmd.trim();
  if (c.toUpperCase().startsWith('GET session:token:usr_991204')) {
    return '{"userId":"usr_991","role":"developer","authMode":"mTLS"}';
  }
  if (c.toUpperCase().startsWith('TTL')) {
    return 3540;
  }
  return 'OK';
});
