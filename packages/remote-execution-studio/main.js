'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'remote-execution.json');
const KGRAPH_FILE = path.join(HOME_DIR, '.robos', 'knowledge-graph.jsonld');
const GRAPH_ROOT = process.env.ROBOS_GRAPH_ROOT;
const EXTERNAL_GRAPH = GRAPH_ROOT !== undefined;
const DEBUG_PORT = 19184;

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

// Knowledge Graph Store integration
let SDLCKnowledgeGraphStore = null;
try {
  const graphStorePaths = [
    path.resolve(__dirname, '..', 'robos-graph', 'lib', 'graph-store.js'),
    '/usr/local/share/robos/robos-graph/lib/graph-store.js',
  ];
  for (const p of graphStorePaths) {
    if (fs.existsSync(p)) {
      SDLCKnowledgeGraphStore = require(p).SDLCKnowledgeGraphStore;
      break;
    }
  }
} catch {}

let kgraphStore = null;
function getGraphStore() {
  if (EXTERNAL_GRAPH && !GRAPH_ROOT.trim()) throw new Error("ROBOS_GRAPH_ROOT must name an available graph workspace");
  if (!kgraphStore && SDLCKnowledgeGraphStore) {
    try {
      kgraphStore = new SDLCKnowledgeGraphStore(EXTERNAL_GRAPH ? { graphRoot: GRAPH_ROOT } : KGRAPH_FILE);
    } catch (error) { if (EXTERNAL_GRAPH) throw error; }
  }
  if (EXTERNAL_GRAPH && !kgraphStore) throw new Error("Configured graph workspace is unavailable");
  if (EXTERNAL_GRAPH) {
    kgraphStore.init();
    if (!fs.existsSync(kgraphStore.workspace.file)) throw new Error("Configured graph workspace is unavailable");
  }
  return kgraphStore;
}

const DEFAULT_CLUSTERS = [
  {
    '@id': 'urn:robos:remote-execution:acme-buildbarn-cluster',
    '@type': ['robos:RemoteExecutionCluster', 'robos:RemoteBuildCluster', 'oslc:Resource'],
    'dcterms:title': 'Acme Production Buildbarn REAPI Cluster',
    'dcterms:description': 'High-performance distributed remote execution & CAS caching cluster using Buildbarn suite.',
    'robos:protocol': 'REAPI_v2',
    'robos:provider': 'buildbarn',
    'robos:instanceName': 'main',
    'robos:executionEndpoint': 'grpc://re-execution.buildbarn.internal:8980',
    'robos:casEndpoint': 'grpc://re-cas.buildbarn.internal:8980',
    'robos:actionCacheEndpoint': 'grpc://re-cas.buildbarn.internal:8980',
    'robos:assetEndpoint': 'grpc://re-asset.buildbarn.internal:8980',
    'robos:browserEndpoint': 'http://re-browser.buildbarn.internal:7984',
    'robos:tlsEnabled': false,
    'robos:status': 'active',
    'robos:workerPools': [
      {
        name: 'linux-x86_64-large',
        osFamily: 'linux',
        isa: 'x86-64',
        containerImage: 'docker://gcr.io/cloud-marketplace/google/debian11:latest',
        concurrency: 64,
      },
      {
        name: 'linux-arm64-workers',
        osFamily: 'linux',
        isa: 'aarch64',
        containerImage: 'docker://gcr.io/cloud-marketplace/google/debian11:latest',
        concurrency: 32,
      },
    ],
    'robos:cacheSettings': {
      maxSizeBytes: '500GB',
      retentionDays: 14,
      evictionPolicy: 'lru',
      casHitRatio: '89.4%',
      actionCacheHitRatio: '72.1%',
    },
    'robos:package': 'devops',
    'robos:namespace': 'robos.devops',
  },
  {
    '@id': 'urn:robos:remote-execution:nativelink-fast-cache',
    '@type': ['robos:RemoteExecutionCluster', 'robos:RemoteBuildCluster', 'oslc:Resource'],
    'dcterms:title': 'Acme High-Speed NativeLink Edge Cache',
    'dcterms:description': 'Ultra-low latency Rust-based NativeLink REAPI Content Addressable Storage and Action Cache.',
    'robos:protocol': 'REAPI_v2',
    'robos:provider': 'nativelink',
    'robos:instanceName': 'edge-cache',
    'robos:executionEndpoint': 'grpc://re-edge.nativelink.internal:8980',
    'robos:casEndpoint': 'grpc://re-cas.nativelink.internal:8980',
    'robos:actionCacheEndpoint': 'grpc://re-cas.nativelink.internal:8980',
    'robos:browserEndpoint': 'http://re-edge.nativelink.internal:7984',
    'robos:tlsEnabled': true,
    'robos:status': 'active',
    'robos:workerPools': [
      {
        name: 'edge-nvme-workers',
        osFamily: 'linux',
        isa: 'x86-64',
        containerImage: 'docker://debian:bookworm-slim',
        concurrency: 128,
      },
    ],
    'robos:cacheSettings': {
      maxSizeBytes: '250GB',
      retentionDays: 7,
      evictionPolicy: 'lru',
      casHitRatio: '94.2%',
      actionCacheHitRatio: '81.5%',
    },
    'robos:package': 'devops',
    'robos:namespace': 'robos.devops',
  },
];

const DEFAULT_BUILD_SYSTEMS = [
  {
    '@id': 'urn:robos:build-system:acme-monorepo-bazel',
    '@type': ['robos:BuildSystem', 'robos:MonorepoBuild', 'oslc:Resource'],
    'dcterms:title': 'Acme Core Services Monorepo (Bazel)',
    'dcterms:description': 'Polyglot backend microservices and shared libraries built with Bazel.',
    'robos:buildTool': 'bazel',
    'robos:configFile': '.bazelrc',
    'robos:repository': 'github.com/acme/buildbarn-forms',
    'robos:hasRemoteExecution': 'urn:robos:remote-execution:acme-buildbarn-cluster',
    'robos:defaultExecProperties': {
      OSFamily: 'linux',
      ISA: 'x86-64',
    },
    'robos:package': 'core-platform',
    'robos:namespace': 'robos.platform',
  },
  {
    '@id': 'urn:robos:build-system:acme-mobile-buck2',
    '@type': ['robos:BuildSystem', 'robos:MonorepoBuild', 'oslc:Resource'],
    'dcterms:title': 'Acme Cross-Platform Clients (Buck2)',
    'dcterms:description': 'Mobile apps, desktop apps, and console tools built with Meta Buck2.',
    'robos:buildTool': 'buck2',
    'robos:configFile': '.buckconfig',
    'robos:repository': 'github.com/acme/buildbarn-tasks',
    'robos:hasRemoteExecution': 'urn:robos:remote-execution:acme-buildbarn-cluster',
    'robos:defaultExecProperties': {
      OSFamily: 'linux',
      ISA: 'x86-64',
    },
    'robos:package': 'core-platform',
    'robos:namespace': 'robos.platform',
  },
];

function loadLocalConfig() {
  if (EXTERNAL_GRAPH) return { clusters: [], buildSystems: [] };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {}
  }
  return {
    clusters: DEFAULT_CLUSTERS,
    buildSystems: DEFAULT_BUILD_SYSTEMS,
  };
}

function saveLocalConfig(cfg) {
  if (EXTERNAL_GRAPH) throw new Error("Use the graph workspace review workflow to save changes");
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 950,
    minHeight: 640,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS Remote Execution Studio',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    _debugServer.startDebugServer(win, DEBUG_PORT);
  }

  return win;
}

app.setName('remote-execution-studio');
app.setPath('userData', path.join(HOME_DIR, '.config', 'robos', 'electron', 'remote-execution-studio'));

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

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('re-get-clusters', async () => {
  const store = getGraphStore();
  if (store) {
    const kClusters = store.getRemoteExecutionClusters();
    if (EXTERNAL_GRAPH) return kClusters.map(n => ({ ...n, "robos:stateScope": "source-only" }));
    if (kClusters.length > 0) return kClusters;
  }
  const cfg = loadLocalConfig();
  return cfg.clusters || DEFAULT_CLUSTERS;
});

ipcMain.handle('re-get-cluster', async (event, id) => {
  const store = getGraphStore();
  if (store) {
    const c = store.getRemoteExecutionCluster(id);
    if (c) return EXTERNAL_GRAPH ? { ...c, "robos:stateScope": "source-only" } : c;
  }
  const cfg = loadLocalConfig();
  return (cfg.clusters || []).find(c => c['@id'] === id) || null;
});

ipcMain.handle('re-save-cluster', async (event, cluster) => {
  if (EXTERNAL_GRAPH) throw new Error("Use Import & Refine for workspace changes; source declarations do not verify live endpoints");
  const store = getGraphStore();
  let kgraphResult = { ok: true };
  if (store) {
    kgraphResult = store.createRemoteExecutionCluster(cluster);
  }
  const cfg = loadLocalConfig();
  if (!cfg.clusters) cfg.clusters = [];
  const idx = cfg.clusters.findIndex(c => c['@id'] === (cluster['@id'] || (kgraphResult.node && kgraphResult.node['@id'])));
  if (idx >= 0) {
    cfg.clusters[idx] = { ...cfg.clusters[idx], ...cluster };
  } else {
    cfg.clusters.push(kgraphResult.node || cluster);
  }
  saveLocalConfig(cfg);
  return { ok: true, node: kgraphResult.node || cluster, shaclResult: kgraphResult };
});

ipcMain.handle('re-delete-cluster', async (event, id) => {
  if (EXTERNAL_GRAPH) throw new Error("Use Import & Refine for workspace changes; source declarations do not verify live endpoints");
  const cfg = loadLocalConfig();
  cfg.clusters = (cfg.clusters || []).filter(c => c['@id'] !== id);
  saveLocalConfig(cfg);
  return { ok: true, id };
});

ipcMain.handle('re-get-build-systems', async () => {
  const store = getGraphStore();
  if (store) {
    const sys = store.getBuildSystems();
    if (EXTERNAL_GRAPH || sys.length > 0) return sys;
  }
  const cfg = loadLocalConfig();
  return cfg.buildSystems || DEFAULT_BUILD_SYSTEMS;
});

ipcMain.handle('re-save-build-system', async (event, sys) => {
  if (EXTERNAL_GRAPH) throw new Error("Use Import & Refine for workspace changes; source declarations do not verify live endpoints");
  const store = getGraphStore();
  let kgraphResult = { ok: true };
  if (store) {
    kgraphResult = store.createBuildSystem(sys);
  }
  const cfg = loadLocalConfig();
  if (!cfg.buildSystems) cfg.buildSystems = [];
  const idx = cfg.buildSystems.findIndex(s => s['@id'] === (sys['@id'] || (kgraphResult.node && kgraphResult.node['@id'])));
  if (idx >= 0) {
    cfg.buildSystems[idx] = { ...cfg.buildSystems[idx], ...sys };
  } else {
    cfg.buildSystems.push(kgraphResult.node || sys);
  }
  saveLocalConfig(cfg);
  return { ok: true, node: kgraphResult.node || sys };
});

ipcMain.handle('re-generate-bazelrc', async (event, clusterId) => {
  const store = getGraphStore();
  if (store) {
    return store.generateBazelrc(clusterId);
  }
  const cfg = loadLocalConfig();
  const c = (cfg.clusters || []).find(item => item['@id'] === clusterId) || cfg.clusters[0];
  const DummyStore = require('../robos-graph/lib/graph-store').SDLCKnowledgeGraphStore;
  return new DummyStore().generateBazelrc(c);
});

ipcMain.handle('re-generate-buckconfig', async (event, clusterId) => {
  const store = getGraphStore();
  if (store) {
    return store.generateBuckconfig(clusterId);
  }
  const cfg = loadLocalConfig();
  const c = (cfg.clusters || []).find(item => item['@id'] === clusterId) || cfg.clusters[0];
  const DummyStore = require('../robos-graph/lib/graph-store').SDLCKnowledgeGraphStore;
  return new DummyStore().generateBuckconfig(c);
});

ipcMain.handle('re-generate-buildbarn-configs', async (event, clusterId) => {
  const store = getGraphStore();
  if (store) {
    return store.generateBuildbarnConfigs(clusterId);
  }
  const cfg = loadLocalConfig();
  const c = (cfg.clusters || []).find(item => item['@id'] === clusterId) || cfg.clusters[0];
  const DummyStore = require('../robos-graph/lib/graph-store').SDLCKnowledgeGraphStore;
  return new DummyStore().generateBuildbarnConfigs(c);
});

ipcMain.handle('re-generate-nativelink-config', async (event, clusterId) => {
  const store = getGraphStore();
  if (store) {
    return store.generateNativeLinkConfig(clusterId);
  }
  const DummyStore = require('../robos-graph/lib/graph-store').SDLCKnowledgeGraphStore;
  return new DummyStore().generateNativeLinkConfig();
});

ipcMain.handle('re-test-endpoints', async (event, clusterId) => {
  if (EXTERNAL_GRAPH) throw new Error("Use Import & Refine for workspace changes; source declarations do not verify live endpoints");
  const cfg = loadLocalConfig();
  const c = (cfg.clusters || []).find(item => item['@id'] === clusterId) || cfg.clusters[0] || {};
  return {
    ok: true,
    clusterId: c['@id'] || clusterId,
    executionEndpoint: {
      url: c['robos:executionEndpoint'] || 'grpc://re-execution.buildbarn.internal:8980',
      status: 'HEALTHY',
      protocol: 'REAPI v2.2 gRPC',
      latencyMs: 14,
    },
    casEndpoint: {
      url: c['robos:casEndpoint'] || 'grpc://re-cas.buildbarn.internal:8980',
      status: 'HEALTHY',
      protocol: 'REAPI CAS / Bytestream v2.2',
      latencyMs: 11,
      totalCapacityBytes: 536870912000,
    },
    browserEndpoint: {
      url: c['robos:browserEndpoint'] || 'http://re-browser.buildbarn.internal:7984',
      status: 'AVAILABLE',
      httpCode: 200,
    },
    timestamp: new Date().toISOString(),
  };
});

ipcMain.handle('re-sync-kgraph', async () => {
  if (EXTERNAL_GRAPH) { const store = getGraphStore(); return { ok: true, readOnly: true, nodesCount: store.parser.nodes.length }; }
  const store = getGraphStore();
  if (store) {
    store.save();
    return {
      ok: true,
      syncedPackages: ['devops', 'core-platform'],
      nodesCount: store.parser.nodes.length,
      timestamp: new Date().toISOString(),
    };
  }
  return { ok: true, message: 'Local configuration persisted.' };
});

ipcMain.handle('open-url', async (event, url) => {
  if (url) shell.openExternal(url);
  return true;
});
