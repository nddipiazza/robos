'use strict';

// JRPG Parse Portal: acquire everything needed to remake a classic JRPG from
// fan resources, write it as a kgraph folder, and publish that folder as a
// GitHub Pages viewer through KGraph Explorer's site builder.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const portal = require('./lib/portal');
const { discoverSources, suggestionNodes } = require('./lib/agent-discovery');
const { HttpCache } = require('./lib/http-cache');
const { readKgraphFolder } = require('./lib/kgraph-writer');
const { coverage } = require('./lib/asset-types');

const DEBUG_PORT = 19218; // see PORT_REGISTRY in packages/robos-lib/snapshot-cli.js

function requireFirst(name) {
  for (const p of [process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, name), path.resolve(__dirname, '..', 'robos-lib', name), `/usr/local/share/robos/robos-lib/${name}`].filter(Boolean)) {
    try { return require(p); } catch { /* next */ }
  }
  return null;
}

function pagesSite() {
  for (const p of [path.resolve(__dirname, '..', 'robos-graph', 'lib', 'pages-site'), '/usr/local/share/robos/robos-graph/lib/pages-site']) {
    try { return require(p); } catch { /* next */ }
  }
  throw new Error('KGraph Explorer (robos-graph) is not installed: its Pages site builder publishes the viewer');
}

app.setName('robos-jrpg-parse-portal');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;
let preview = null;
let lastDiscovery = null;
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    title: 'JRPG Parse Portal',
    backgroundColor: '#0d1117',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  const snap = requireFirst('dom-snapshot');
  if (snap) {
    try { snap.registerSnapshotIPC && snap.registerSnapshotIPC(win); snap.startDebugServer(win, DEBUG_PORT, 'jrpg-parse-portal'); } catch { /* optional */ }
  }
});

app.on('window-all-closed', () => {
  if (preview) preview.server.close();
  app.quit();
});

const defaultOut = id => path.join(os.homedir(), 'kgraphs', `kgraph-${id.replace(/-usa$/, '')}`);

ipcMain.handle('jrpg:profiles', () => portal.listProfiles().map(p => ({ ...p, defaultOut: defaultOut(p.id) })));
ipcMain.handle('jrpg:plan', (_, id) => portal.plan(id));

ipcMain.handle('jrpg:choose-folder', async (_, current) => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: current || os.homedir(), title: 'Choose the kgraph folder' });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('jrpg:discover', async (_, { profileId, assetTypes }) => {
  const profile = portal.getProfile(profileId);
  const res = await discoverSources(profile, { http: new HttpCache({ retries: 0 }), assetTypes, log: m => send('jrpg:log', m) });
  lastDiscovery = { profileId, suggestions: res.suggestions };
  return { suggestions: res.suggestions, rejected: res.rejected.length, via: res.via };
});

ipcMain.handle('jrpg:acquire', async (_, { profileId, outDir, downloadImages, measureMaps, includeDiscovery }) => {
  const extraSources = includeDiscovery && lastDiscovery && lastDiscovery.profileId === profileId
    ? suggestionNodes(profileId.replace(/-usa$/, ''), lastDiscovery.suggestions) : [];
  const res = await portal.acquire({ profileId, outDir: outDir || defaultOut(profileId), downloadImages, measureMaps, extraSources, log: m => send('jrpg:log', m) });
  return { outDir: res.outDir, nodeCount: res.nodeCount, packages: res.packages, coverage: res.coverage, warnings: res.warnings, http: res.http };
});

ipcMain.handle('jrpg:coverage', (_, dir) => {
  const { nodes } = readKgraphFolder(dir);
  return coverage(nodes);
});

ipcMain.handle('jrpg:build-site', (_, { graphDir, workflow }) => {
  const site = pagesSite();
  const res = site.buildKgraphSite({ graphDir, workflow, log: m => send('jrpg:log', m) });
  return { outDir: res.outDir, nodeCount: res.nodeCount, resolution: res.resolution, workflow: res.workflow };
});

ipcMain.handle('jrpg:agent-renderers', async (_, { graphDir }) => {
  const site = pagesSite();
  const res = await site.authorRenderersWithAgent({ graphDir, log: m => send('jrpg:log', m) });
  return res.results.map(r => ({ type: r.type, ok: r.ok, file: r.file ? path.basename(r.file) : null, errors: r.errors || [] }));
});

ipcMain.handle('jrpg:preview-site', async (_, { siteDir }) => {
  const site = pagesSite();
  if (preview) preview.server.close();
  preview = await site.serveSite(siteDir);
  await shell.openExternal(preview.url);
  return preview.url;
});

ipcMain.handle('jrpg:open-folder', (_, dir) => shell.openPath(dir));
