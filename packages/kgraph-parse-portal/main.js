'use strict';

let electronPkg;
try {
  electronPkg = require('electron');
} catch {}

const isElectronRuntime = electronPkg && typeof electronPkg === 'object' && typeof electronPkg.app === 'object';
const app = isElectronRuntime ? electronPkg.app : {
  setName: () => {},
  commandLine: { appendSwitch: () => {} },
  requestSingleInstanceLock: () => true,
  whenReady: () => new Promise(() => {}),
  on: () => {},
  quit: () => {},
};
const BrowserWindow = isElectronRuntime ? electronPkg.BrowserWindow : class {};
const ipcMain = isElectronRuntime ? electronPkg.ipcMain : { handle: () => {}, on: () => {} };

const path = require('path');
const { ParsePortalServer } = require('./server');
const { detectDirectoryArchetype, classifyFile, scanPathToGraphNodes } = require('./lib/fs-mime-classifier');
const { generateBuildbarnHelmValues, generateHelmInstallCommand, checkRbeClusterStatus, generateKgraphClusterNode } = require('./lib/buildbarn-rbe');

// Debug server for E2E testing and snapshot captures
let _debugServer = null;
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

app.setName('kgraph-parse-portal');
if (app.commandLine && app.commandLine.appendSwitch) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
}

let mainWindow = null;
const portalServer = new ParsePortalServer({
  port: parseInt(process.env.ROBOS_PARSE_PORT || '19193', 10),
});

// Setup IPC handlers
ipcMain.handle('portal:get-status', async () => {
  const tikaOnline = await portalServer.tika.isAvailable();
  const luxirStats = await portalServer.luxir.getIndexStats();
  return {
    ok: true,
    port: portalServer.port,
    tika: { online: tikaOnline, endpoint: portalServer.tika.endpoint },
    luxir: luxirStats,
  };
});

ipcMain.handle('portal:parse-resource', async (evt, data = {}) => {
  const content = data.content || '';
  const filePath = data.filePath || 'doc.txt';
  const parseResult = await portalServer.tika.parseDocument(content, { filePath });
  const classification = classifyFile(filePath, null, content);
  const graphNode = {
    '@id': `urn:robos:source:${path.basename(filePath).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')}`,
    '@type': [classification.semanticType, classification.targetClass, 'schema:CreativeWork'],
    'dcterms:title': path.basename(filePath),
    'dcterms:description': `${classification.semanticRole} (${classification.rawMime})`,
    'robos:mimeType': classification.rawMime,
    'robos:semanticRole': classification.semanticRole,
    'robos:sourcePath': filePath,
    'robos:astSymbols': parseResult.astSymbols,
  };
  await portalServer.luxir.indexNodes([graphNode]);
  return { ok: true, parseResult, graphNode };
});

ipcMain.handle('portal:crawl-directory', async (evt, data = {}) => {
  const targetPath = data.directoryPath || data.path || process.cwd();
  const res = scanPathToGraphNodes(targetPath, {
    maxDepth: data.maxDepth || 6,
    package: data.package || 'core-platform',
  });
  await portalServer.luxir.indexNodes(res.nodes);
  return { ok: true, ...res };
});

ipcMain.handle('portal:ingest-to-graph', async (evt, data = {}) => {
  const targetPath = data.directoryPath || data.path || process.cwd();
  const res = scanPathToGraphNodes(targetPath, {
    maxDepth: data.maxDepth || 6,
    package: data.package || 'core-platform',
  });
  const store = portalServer.getGraphStore();
  let added = 0;
  if (store) {
    for (const node of res.nodes) {
      store.addNode(node);
      added++;
    }
  }
  await portalServer.luxir.indexNodes(res.nodes);
  return { ok: true, committed: Boolean(store), nodesCommitted: added, archetype: res.archetype, nodes: res.nodes };
});

ipcMain.handle('portal:search-luxir', async (evt, data = {}) => {
  const q = data.query || '';
  const filters = data.filters || {};
  const results = await portalServer.luxir.search(q, filters);
  return { ok: true, count: results.length, results };
});

ipcMain.handle('portal:get-rbe-status', async (evt, endpoint) => {
  const status = await checkRbeClusterStatus(endpoint || '127.0.0.1:8980');
  return { ok: true, rbe: status };
});

ipcMain.handle('portal:generate-rbe-values', async (evt, data = {}) => {
  const valuesYaml = generateBuildbarnHelmValues(data);
  const installCommand = generateHelmInstallCommand(data);
  return { ok: true, valuesYaml, installCommand };
});

ipcMain.handle('portal:register-rbe-cluster', async (evt, data = {}) => {
  const node = generateKgraphClusterNode(data);
  const store = portalServer.getGraphStore();
  if (store) {
    store.addNode(node);
  }
  await portalServer.luxir.indexNodes([node]);
  return { ok: true, clusterNode: node, committed: Boolean(store) };
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 860,
    backgroundColor: '#0a101d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (_debugServer) {
    try {
      if (_debugServer.registerSnapshotIPC) _debugServer.registerSnapshotIPC(mainWindow);
      _debugServer.startDebugServer(mainWindow, 19192, 'kgraph-parse-portal');
    } catch (err) {
      console.warn('Debug server error:', err.message);
    }
  }
}

if (isElectronRuntime) {
  app.whenReady().then(async () => {
    try {
      await portalServer.start();
    } catch {}
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      portalServer.stop().finally(() => app.quit());
    }
  });
}

module.exports = {
  portalServer,
  createWindow,
};
