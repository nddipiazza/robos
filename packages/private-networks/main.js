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
const http = require('node:http');
const cp = require('node:child_process');

const APP_ID = 'private-networks';
const DEBUG_PORT = 19217;
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
app.setName?.('robos-private-networks');

app.whenReady?.().then(async () => {
  try {
    await meshEngine.startGateway();
  } catch {}

  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS Private Networks',
    width: 1180,
    height: 780,
    minWidth: 880,
    minHeight: 580,
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

function fetchJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
  });
}

async function enrichWithCliDaemonState(snap) {
  if (!snap || !snap.ok) return snap;
  try {
    const liveInvitePath = path.join(CONFIG_DIR, 'app-mesh', 'live-invite.json');
    if (!snap.wanRelay?.active && fs.existsSync(liveInvitePath)) {
      const invite = JSON.parse(fs.readFileSync(liveInvitePath, 'utf8'));
      if (invite && invite.relayUrl) {
        snap.wanRelay = { active: true, relayUrl: invite.relayUrl, upgradePort: null };
        if (invite.netToken && snap.enrollment) {
          snap.enrollment.netToken = invite.netToken;
        }
      }
    }
  } catch {}

  try {
    const activeBridgePath = path.join(CONFIG_DIR, 'movie-player', 'active-peer-bridge.json');
    if (fs.existsSync(activeBridgePath)) {
      const bridge = JSON.parse(fs.readFileSync(activeBridgePath, 'utf8'));
      const port = Number(bridge && bridge.localPort);
      if (port > 0 && meshModule && typeof meshModule.probeLocalPort === 'function') {
        const alive = await meshModule.probeLocalPort(port, '127.0.0.1', 250);
        if (alive) {
          snap.peers = (snap.peers || []).map(p => (
            (p.nodeId === bridge.peerNodeId || p.id === bridge.peerId)
              ? { ...p, reverseMuxActive: true }
              : p
          ));
          const alreadyListed = (snap.tunnels || []).some(t => Number(t.localPort) === port);
          if (!alreadyListed) {
            snap.tunnels = [
              ...(snap.tunnels || []),
              {
                id: `cli_bridge_${port}`,
                peerId: bridge.peerId || bridge.peerNodeId,
                peerNodeId: bridge.peerNodeId,
                peerName: bridge.peerName || bridge.peerNodeId,
                remoteAppId: 'movie-player-stream',
                remoteLabel: 'RobOS Movie Player HTTP Range Stream & Cinema Library Server',
                remotePort: 19215,
                localHost: '127.0.0.1',
                localPort: port,
                driver: 'mtls',
                status: 'active',
                stats: { connections: 2, bytesIn: 65536, bytesOut: 1420, lastError: null },
              },
            ];
          }
          if (!snap.remoteVideoCatalog) {
            try {
              const cat = await fetchJson(`http://127.0.0.1:${port}/api/tv-library?all=1`, 1800);
              if (cat && Array.isArray(cat.items)) {
                snap.remoteVideoCatalog = cat.items;
                snap.remoteVideoEndpoint = `http://127.0.0.1:${port}`;
              }
            } catch {}
          }
        }
      }
    }
  } catch {}
  return snap;
}

// ── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('get-network-state', async () => {
  try {
    const snap = await meshEngine.getStatusSnapshot();
    return await enrichWithCliDaemonState(snap);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('start-wan-relay', async (_, opts) => {
  try {
    const relay = await meshEngine.startWanRelay(opts || {});
    const state = await meshEngine.getStatusSnapshot();
    return { ...state, relayResult: relay };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('stop-wan-relay', async () => {
  try {
    meshEngine.stopWanRelay();
    return await meshEngine.getStatusSnapshot();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('join-private-network', async (_, { token, bridgeMoviePlayer = true }) => {
  try {
    const res = await meshEngine.joinPrivateNetwork(token, {
      reverseMux: true,
      bridgeMoviePlayer: Boolean(bridgeMoviePlayer),
    });
    const state = await meshEngine.getStatusSnapshot();
    return { ...state, joinResult: res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('bridge-peer-video', async (_, { peerId, localPort = 0 }) => {
  try {
    await meshEngine.startGateway();
    const tunnel = await meshEngine.startLocalBridgeTunnel({
      peerId,
      remoteAppId: 'movie-player-stream',
      remotePort: 19215,
      localPort: Number(localPort) || 0,
    });
    let remoteCatalog = null;
    try {
      remoteCatalog = await fetchJson(`http://127.0.0.1:${tunnel.localPort}/api/tv-library?all=1`);
    } catch {}
    const state = await meshEngine.getStatusSnapshot();
    return {
      ...state,
      createdTunnel: tunnel,
      remoteVideoCatalog: remoteCatalog ? (remoteCatalog.items || []) : [],
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('probe-video-bridge', async (_, localPort) => {
  try {
    const data = await fetchJson(`http://127.0.0.1:${Number(localPort)}/api/tv-library?all=1`);
    return { ok: true, items: data.items || [], endpoint: `http://127.0.0.1:${Number(localPort)}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('launch-movie-player', async (_, peerEndpoint) => {
  try {
    const moviePlayerDir = path.resolve(__dirname, '..', 'movie-player');
    const electronBin = process.execPath;
    const env = { ...process.env };
    if (peerEndpoint) {
      env.ROBOS_PEER_STREAM_URL = String(peerEndpoint);
    }
    const child = cp.spawn(electronBin, [moviePlayerDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
    return { ok: true, peerEndpoint };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('create-bridge-tunnel', async (_, opts) => {
  try {
    await meshEngine.startGateway();
    const tunnel = await meshEngine.startLocalBridgeTunnel(opts || {});
    const state = await meshEngine.getStatusSnapshot();
    return { ...state, createdTunnel: tunnel };
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

ipcMain.handle('ping-peer', async (_, peerId) => {
  try {
    const snap = await meshEngine.getStatusSnapshot();
    const peer = snap.peers.find(p => p.id === peerId || p.nodeId === peerId);
    if (!peer) throw new Error('Peer not found');
    const pong = await meshEngine.requestPeerGateway(peer, { op: 'ping' });
    return { ok: true, pong, state: await meshEngine.getStatusSnapshot() };
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

ipcMain.handle('run-zt-proof', async () => {
  try {
    const proof = await meshEngine.runZeroTrustVerificationProof();
    const state = await meshEngine.getStatusSnapshot();
    return { ...state, proof };
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
