'use strict';

let app, BrowserWindow, ipcMain, clipboard;
try {
  ({ app, BrowserWindow, ipcMain, clipboard } = require('electron'));
} catch (error) {
  if (process.versions.electron) throw error;
  app = {
    requestSingleInstanceLock: () => true,
    commandLine: { appendSwitch: () => {} },
    setName: () => {},
    setPath: () => {},
    whenReady: () => new Promise(() => {}),
    on: () => {},
    quit: () => {},
  };
  BrowserWindow = class {};
  ipcMain = { handle: () => {} };
  clipboard = { writeText: () => {} };
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const APP_ID = 'app-mesh';
const DEBUG_PORT = 19215;
const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');

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
      break;
    } catch {}
  }
} catch {}

let meshModule = null;
for (const base of [
  process.env.ROBOS_LIB_PATH,
  path.resolve(__dirname, '..', 'robos-lib'),
  '/usr/local/share/robos/robos-lib',
].filter(Boolean)) {
  try {
    meshModule = require(path.join(base, 'app-mesh-engine'));
    break;
  } catch {}
}

const meshEngine = meshModule.createAppMeshEngine({ configDir: CONFIG_DIR });

app.setPath?.('userData', path.join(CONFIG_DIR, 'electron', APP_ID));

if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock?.();
  if (gotLock === false) {
    app.quit();
    process.exit(0);
  }
}

app.commandLine?.appendSwitch('no-sandbox');
app.commandLine?.appendSwitch('disable-gpu');
app.commandLine?.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
app.setName?.('robos-app-mesh');

app.whenReady?.().then(async () => {
  try {
    await meshEngine.startGateway();
  } catch {}

  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS App Mesh',
    width: 1140,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(mainWindow);
      }
      _debugServer.startDebugServer(mainWindow, DEBUG_PORT, APP_ID);
    } catch {}
  }
});

app.on?.('window-all-closed', () => app.quit());
app.on?.('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('get-mesh-state', async () => {
  try {
    return await meshEngine.getStatusSnapshot();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('toggle-gateway', async (_, enable) => {
  try {
    if (enable) await meshEngine.startGateway();
    else await meshEngine.stopGateway();
    return await meshEngine.getStatusSnapshot();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('update-policy', async (_, patch) => {
  try {
    meshEngine.updatePolicy(patch || {});
    return await meshEngine.getStatusSnapshot();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('enroll-peer', async (_, peerInput) => {
  try {
    const peer = meshEngine.addOrUpdatePeer(peerInput);
    const snapshot = await meshEngine.getStatusSnapshot();
    return { ...snapshot, enrolledPeer: peer };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('remove-peer', async (_, peerId) => {
  try {
    meshEngine.removePeer(peerId);
    return await meshEngine.getStatusSnapshot();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ping-peer', async (_, peerId) => {
  try {
    const snap = await meshEngine.getStatusSnapshot();
    const peer = peerId === 'self-loopback'
      ? {
          id: 'self-loopback',
          nodeId: snap.identity.nodeId,
          name: `${snap.identity.nodeName} (Local Node)`,
          host: '127.0.0.1',
          port: snap.gateway.port,
          fingerprint: snap.identity.fingerprint,
        }
      : snap.peers.find(p => p.id === peerId || p.nodeId === peerId);
    if (!peer) throw new Error('Peer not found');
    const pong = await meshEngine.requestPeerGateway(peer, { op: 'ping' });
    return { ok: true, pong, state: await meshEngine.getStatusSnapshot() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('query-peer-catalog', async (_, peerId) => {
  try {
    const snap = await meshEngine.getStatusSnapshot();
    const peer = peerId === 'self-loopback'
      ? {
          id: 'self-loopback',
          nodeId: snap.identity.nodeId,
          name: `${snap.identity.nodeName} (Local Node)`,
          host: '127.0.0.1',
          port: snap.gateway.port,
          fingerprint: snap.identity.fingerprint,
        }
      : snap.peers.find(p => p.id === peerId || p.nodeId === peerId);
    if (!peer) throw new Error('Peer not found');
    const catalogRes = await meshEngine.requestPeerGateway(peer, { op: 'catalog' });
    return { ok: true, catalog: catalogRes.apps || [], peerName: catalogRes.nodeName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('create-bridge-tunnel', async (_, opts) => {
  try {
    await meshEngine.startGateway();
    const tunnel = await meshEngine.startLocalBridgeTunnel(opts || {});
    const snapshot = await meshEngine.getStatusSnapshot();
    return { ...snapshot, createdTunnel: tunnel };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('stop-bridge-tunnel', async (_, tunnelId) => {
  try {
    meshEngine.stopLocalBridgeTunnel(tunnelId);
    return await meshEngine.getStatusSnapshot();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('run-zt-proof', async () => {
  try {
    const proof = await meshEngine.runZeroTrustVerificationProof();
    const snapshot = await meshEngine.getStatusSnapshot();
    return { ...snapshot, proof };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('copy-text', async (_, text) => {
  try {
    clipboard?.writeText?.(String(text || ''));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
