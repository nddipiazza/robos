'use strict';

let electronPkg;
try {
  electronPkg = require('electron');
} catch {}

const isElectronRuntime = electronPkg && typeof electronPkg === 'object' && typeof electronPkg.app === 'object';
const app = isElectronRuntime ? electronPkg.app : {
  setName: () => {},
  setPath: () => {},
  commandLine: { appendSwitch: () => {} },
  whenReady: () => new Promise(() => {}),
  on: () => {},
  quit: () => {},
};
const BrowserWindow = isElectronRuntime ? electronPkg.BrowserWindow : class {};
const ipcMain = isElectronRuntime ? electronPkg.ipcMain : { handle: () => {}, on: () => {} };

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

app.setName('robos-documentation');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'robos-documentation'));

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;
const PORT = 19197;

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try {
      _debugServer = require(p);
      if (_debugServer.registerSnapshotIPC) _debugServer.registerSnapshotIPC(ipcMain);
      break;
    } catch {}
  }
} catch {}

let SDLCKnowledgeGraphStore = null;
try {
  const graphLibPaths = [
    path.resolve(__dirname, '..', 'robos-graph', 'index.js'),
    '/usr/local/share/robos/robos-graph/index.js',
  ];
  for (const gp of graphLibPaths) {
    try {
      const g = require(gp);
      if (g.SDLCKnowledgeGraphStore) {
        SDLCKnowledgeGraphStore = g.SDLCKnowledgeGraphStore;
        break;
      }
    } catch {}
  }
} catch {}

let graphStore = null;
function getGraphStore() {
  if (!graphStore && SDLCKnowledgeGraphStore) {
    try {
      const candidates = [
        path.join(process.cwd(), '.robos', 'knowledge-graph.jsonld'),
        path.resolve(__dirname, '..', '..', '.robos', 'knowledge-graph.jsonld'),
      ];
      const repoGraph = candidates.find(c => fs.existsSync(c));
      const storeOpts = repoGraph
        ? { filePath: repoGraph, rootDir: path.dirname(repoGraph) }
        : {};
      graphStore = new SDLCKnowledgeGraphStore(storeOpts);
    } catch (err) {
      console.warn('[robos-documentation] Could not instantiate SDLCKnowledgeGraphStore:', err.message);
    }
  }
  return graphStore;
}

// Parse launch arguments
let initialEntityId = null;
for (const arg of process.argv) {
  if (arg.startsWith('--entity=')) initialEntityId = arg.split('=')[1];
  if (arg.startsWith('--app=')) initialEntityId = arg.split('=')[1];
  if (arg.startsWith('--doc=')) initialEntityId = arg.split('=')[1];
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 920,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS Documentation Hub & Living Architecture Verifier',
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) _debugServer.startDebugServer(win, PORT);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('documentation:get-initial-target', () => ({
  entityId: initialEntityId,
}));

ipcMain.handle('documentation:list-documentable-entries', async () => {
  const store = getGraphStore();
  if (store && typeof store.getDocumentableNodes === 'function') {
    return store.getDocumentableNodes();
  }
  return [];
});

ipcMain.handle('documentation:get-entry-doc', async (_, entityIdOrSlug) => {
  const store = getGraphStore();
  if (!store) return { error: 'Graph store not available' };

  let node = store.getNode(entityIdOrSlug);
  if (!node && typeof store.findApplicationNode === 'function') {
    node = store.findApplicationNode(entityIdOrSlug);
  }
  if (!node) {
    // Check if queried by documentation ID
    const docNode = store.findDocumentation ? store.findDocumentation(entityIdOrSlug) : null;
    if (docNode) {
      const target = docNode['robos:targetEntity'] || docNode['robos:targetNode'];
      node = store.getNode(target);
    }
  }

  if (!node) {
    const all = store.getDocumentableNodes ? store.getDocumentableNodes() : [];
    if (all.length > 0) node = store.getNode(all[0].id);
  }

  if (!node) return { error: 'No documentable entity found' };

  const id = node['@id'];
  const docNode = (store.findDocumentation ? store.findDocumentation(id) : null) ||
    (node['robos:hasDocumentation'] ? store.getNode(Array.isArray(node['robos:hasDocumentation']) ? node['robos:hasDocumentation'][0] : node['robos:hasDocumentation']) : null);

  let markdown = '';
  const docPath = docNode ? docNode['robos:docPath'] : `docs/architecture/${id.replace(/.*:/, '')}.md`;
  const absPath = path.isAbsolute(docPath) ? docPath : path.join(process.cwd(), docPath);

  if (fs.existsSync(absPath)) {
    try {
      markdown = fs.readFileSync(absPath, 'utf8');
    } catch {}
  }

  return {
    entity: node,
    documentation: docNode,
    docPath,
    markdown,
    isDocumented: Boolean(docNode),
  };
});

ipcMain.handle('documentation:generate-doc', async (_, opts = {}) => {
  const store = getGraphStore();
  if (store && typeof store.generateEntityDocumentation === 'function') {
    return store.generateEntityDocumentation(opts);
  }
  return { ok: false, error: 'Store or documentation generator not available' };
});

ipcMain.handle('documentation:save-doc', async (_, opts = {}) => {
  const store = getGraphStore();
  if (store && typeof store.saveEntityDocumentation === 'function') {
    return store.saveEntityDocumentation(opts);
  }
  return { ok: false, error: 'Store or save handler not available' };
});

ipcMain.handle('documentation:export-website', async (_, opts = {}) => {
  const store = getGraphStore();
  if (store && typeof store.generateDocumentationWebsite === 'function') {
    return store.generateDocumentationWebsite(opts);
  }
  return { ok: false, error: 'Store or web generator not available' };
});

// Test viewer runner
let testViewerServer = null;
ipcMain.handle('documentation:launch-test-viewer', async (_, opts = {}) => {
  const store = getGraphStore();
  if (!store) return { ok: false, error: 'Store not available' };

  // 1. Ensure website is exported first
  const exportRes = store.generateDocumentationWebsite ? store.generateDocumentationWebsite(opts) : { ok: false };
  if (!exportRes.ok) {
    return { ok: false, error: exportRes.error || 'Website export failed' };
  }

  const exportFilePath = exportRes.filePath;
  const port = opts.port || 3089;

  if (testViewerServer) {
    return {
      ok: true,
      url: `http://localhost:${port}/system-documentation/`,
      filePath: exportFilePath,
      alreadyRunning: true,
    };
  }

  try {
    testViewerServer = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', app: 'robos-documentation-viewer' }));
      }
      if (fs.existsSync(exportFilePath)) {
        const content = fs.readFileSync(exportFilePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(content);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Exported documentation not found');
    });

    await new Promise((resolve) => {
      testViewerServer.listen(port, '127.0.0.1', () => resolve());
    });

    return {
      ok: true,
      url: `http://localhost:${port}/system-documentation/`,
      filePath: exportFilePath,
      port,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
