#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {
  createAppMeshEngine,
  probeLocalPort,
} = require('../robos-lib/app-mesh-engine');

const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
const MOVIE_CFG_DIR = path.join(CONFIG_DIR, 'movie-player');
const ACTIVE_BRIDGE_FILE = path.join(MOVIE_CFG_DIR, 'active-peer-bridge.json');

function findSampleVideos(customVideoPath) {
  const found = [];
  const addFile = (fp, title) => {
    try {
      if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        found.push({
          id: `peer_${Buffer.from(fp).toString('base64url').slice(-16)}`,
          title: title || path.basename(fp, path.extname(fp)).replace(/[-_]+/g, ' '),
          filePath: path.resolve(fp),
          mediaType: 'movie',
          overview: `Streamed over RobOS Private Network Zero-Trust mTLS 1.3 from ${os.hostname()}`,
          year: new Date().getFullYear(),
        });
      }
    } catch {}
  };

  if (customVideoPath) {
    addFile(customVideoPath, path.basename(customVideoPath, path.extname(customVideoPath)));
  }

  const videosDir = path.join(os.homedir(), 'Videos');
  try {
    if (fs.existsSync(videosDir)) {
      for (const entry of fs.readdirSync(videosDir)) {
        if (/\.(mp4|mkv|webm|mov|m4v)$/i.test(entry)) {
          addFile(path.join(videosDir, entry));
        }
      }
    }
  } catch {}

  const repoRoot = path.resolve(__dirname, '..', '..');
  const repoSamples = [
    [path.join(repoRoot, 'site', 'assets', 'games', 'rts', 'frontier-hunters-live.mp4'), 'Frontier Hunters Live (Box A P2P Stream)'],
    [path.join(repoRoot, 'site', 'assets', 'games', 'rts', 'gameplay-preview.mp4'), 'RobOS RTS Gameplay Preview (Box A P2P Stream)'],
    [path.join(repoRoot, 'docs', 'assets', 'games', 'rts', 'frontier-hunters-live.mp4'), 'Frontier Hunters Live (Box A P2P Stream)'],
  ];
  for (const [fp, title] of repoSamples) {
    if (!found.some(x => x.filePath === fp)) {
      addFile(fp, title);
    }
  }

  return found;
}

async function ensureLocalVideoStreamServer(customVideoPath) {
  const alreadyListening = await probeLocalPort(19215, '127.0.0.1', 350);
  if (alreadyListening) {
    return { startedStandalone: false, port: 19215 };
  }

  const CastServiceMod = require('../movie-player/lib/cast-service');
  const CastService = CastServiceMod.CastService || CastServiceMod;
  const tracks = findSampleVideos(customVideoPath);
  const cast = new CastService(() => tracks);
  for (const t of tracks) {
    cast.registerFile(t.filePath);
  }
  const { port } = await cast.startStreamServer(19215);
  return { startedStandalone: true, port, tracksCount: tracks.length, cast };
}

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
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function runHost(args) {
  let customVideo = null;
  const vIdx = args.indexOf('--video');
  if (vIdx !== -1 && args[vIdx + 1]) {
    customVideo = args[vIdx + 1];
  }

  const streamSrv = await ensureLocalVideoStreamServer(customVideo);
  if (streamSrv.startedStandalone) {
    console.log(`[RobOS Private Networks] Started local Movie Player stream server on 127.0.0.1:${streamSrv.port} (${streamSrv.tracksCount} video(s) ready)`);
  } else {
    console.log(`[RobOS Private Networks] Detected running RobOS Movie Player stream server on 127.0.0.1:19215`);
  }

  const mesh = createAppMeshEngine({ configDir: CONFIG_DIR });
  await mesh.startGateway();

  const saveLiveInvite = async (relayUrl) => {
    try {
      const s = await mesh.getStatusSnapshot();
      fs.mkdirSync(MOVIE_CFG_DIR, { recursive: true });
      fs.writeFileSync(path.join(CONFIG_DIR, 'app-mesh', 'live-invite.json'), JSON.stringify({
        updatedAt: new Date().toISOString(),
        nodeId: s.identity.nodeId,
        nodeName: s.identity.nodeName,
        fingerprint: s.identity.fingerprint,
        relayUrl: relayUrl || s.wanRelay?.relayUrl || null,
        netToken: s.enrollment.netToken,
      }, null, 2));
      return s;
    } catch {
      return null;
    }
  };

  const noWan = args.includes('--lan-only');
  let relayInfo = null;
  if (!noWan) {
    console.log('[RobOS Private Networks] Allocating Cross-Network Zero-Trust WAN Relay (mTLS 1.3 over SSH Upgrade)...');
    try {
      relayInfo = await mesh.startWanRelay({
        onRelayUpdate: async (newRelayUrl) => {
          const updatedSnap = await saveLiveInvite(newRelayUrl);
          if (updatedSnap) {
            console.log(`\n[RobOS Private Networks] WAN Relay refreshed: ${newRelayUrl}`);
            console.log(`  Updated Invite Token:\n  ${updatedSnap.enrollment.netToken}\n`);
          }
        },
      });
    } catch (err) {
      console.warn('[RobOS Private Networks] WAN relay warning (falling back to LAN/Overlay IP):', err.message);
    }
  }

  const snap = (await saveLiveInvite(relayInfo ? relayInfo.relayUrl : null)) || (await mesh.getStatusSnapshot());
  const netToken = snap.enrollment.netToken;

  console.log('\n================================================================================');
  console.log('  ROBOS PRIVATE NETWORKS — ZERO-TRUST mTLS 1.3 HOST READY');
  console.log('================================================================================');
  console.log(`  Node ID          : ${snap.identity.nodeId} (${snap.identity.nodeName})`);
  console.log(`  Cert SHA-256 Pin : ${snap.identity.fingerprint}`);
  console.log(`  Local Gateway    : ${snap.netInfo.lanIp}:${snap.gateway.port}`);
  if (relayInfo && relayInfo.relayUrl) {
    console.log(`  Cross-Net Relay  : ${relayInfo.relayUrl} (End-to-End Mutual TLS 1.3)`);
  }
  console.log('--------------------------------------------------------------------------------');
  console.log('  PRIVATE NETWORK INVITE TOKEN (robos-net://):');
  console.log(`\n  ${netToken}\n`);
  console.log('--------------------------------------------------------------------------------');
  console.log('  RUN THIS COMMAND ON REMOTE PEER TO LINK NETWORK A <-> NETWORK B & STREAM VIDEO:');
  console.log(`\n  node packages/private-networks/cli.js join "${netToken}"\n`);
  console.log('================================================================================\n');

  const bridgedPeers = new Map();
  setInterval(async () => {
    try {
      const current = await mesh.getStatusSnapshot();
      for (const peer of current.peers) {
        if (bridgedPeers.has(peer.nodeId)) continue;
        let peerLive = Boolean(peer.reverseMuxActive);
        if (!peerLive && peer.host && peer.host !== '127.0.0.1') {
          try {
            const pong = await mesh.requestPeerGateway(peer, { op: 'ping' }, 1800);
            peerLive = Boolean(pong && pong.ok);
          } catch {
            peerLive = false;
          }
        }
        if (peerLive) {
          const port19225Busy = await probeLocalPort(19225, '127.0.0.1', 150);
          const preferredPort = port19225Busy ? 0 : 19225;
          const tunnel = await mesh.startLocalBridgeTunnel({
            peerId: peer.id,
            remoteAppId: 'movie-player-stream',
            remotePort: 19215,
            localPort: preferredPort,
          });
          bridgedPeers.set(peer.nodeId, tunnel);
          const endpoint = `http://127.0.0.1:${tunnel.localPort}`;
          console.log(`\n[RobOS Private Networks] Connected peer ${peer.name} (${peer.nodeId})!`);
          console.log(`[RobOS Private Networks] Bridged ${peer.name}:19215 (Movie Player Stream) -> ${endpoint}`);

          try {
            fs.mkdirSync(MOVIE_CFG_DIR, { recursive: true });
            fs.writeFileSync(ACTIVE_BRIDGE_FILE, JSON.stringify({
              updatedAt: new Date().toISOString(),
              peerId: peer.id,
              peerNodeId: peer.nodeId,
              peerName: peer.name,
              endpoint,
              localPort: tunnel.localPort,
            }, null, 2));
          } catch {}

          try {
            const cat = await fetchJson(`${endpoint}/api/tv-library?all=1`);
            const items = cat.items || [];
            console.log(`[RobOS Private Networks] Discovered ${items.length} streamable video(s) on ${peer.name}:`);
            for (const item of items) {
              console.log(`  - "${item.title}" -> ${item.streamUrl}`);
            }
          } catch {}
        }
      }
    } catch {}
  }, 1500);
}

async function runJoin(args) {
  const tokenArg = args.find(a => a.startsWith('robos-net://') || a.startsWith('robos-mesh://'));
  if (!tokenArg) {
    console.error('Usage: node packages/private-networks/cli.js join "robos-net://..." [--video /path/to/file.mp4]');
    process.exit(1);
  }

  let customVideo = null;
  const vIdx = args.indexOf('--video');
  if (vIdx !== -1 && args[vIdx + 1]) {
    customVideo = args[vIdx + 1];
  }

  const streamSrv = await ensureLocalVideoStreamServer(customVideo);
  if (streamSrv.startedStandalone) {
    console.log(`[RobOS Private Networks] Started local Movie Player stream server on 127.0.0.1:${streamSrv.port} (${streamSrv.tracksCount} video(s) ready)`);
  } else {
    console.log(`[RobOS Private Networks] Detected running RobOS Movie Player stream server on 127.0.0.1:19215`);
  }

  const mesh = createAppMeshEngine({ configDir: CONFIG_DIR });
  console.log('[RobOS Private Networks] Dialing remote Private Network over Mutual TLS 1.3...');
  const port19225Busy = await probeLocalPort(19225, '127.0.0.1', 150);
  const res = await mesh.joinPrivateNetwork(tokenArg, {
    reverseMux: true,
    bridgeMoviePlayer: true,
    localMoviePort: port19225Busy ? 0 : 19225,
  });

  const endpoint = res.movieBridge ? `http://127.0.0.1:${res.movieBridge.localPort}` : null;
  if (res.movieBridge && endpoint) {
    try {
      fs.mkdirSync(MOVIE_CFG_DIR, { recursive: true });
      fs.writeFileSync(ACTIVE_BRIDGE_FILE, JSON.stringify({
        updatedAt: new Date().toISOString(),
        peerId: res.peer.id,
        peerNodeId: res.peer.nodeId,
        peerName: res.peer.name,
        endpoint,
        localPort: res.movieBridge.localPort,
      }, null, 2));
    } catch {}
  }

  console.log('\n================================================================================');
  console.log('  ROBOS PRIVATE NETWORKS — LINK ESTABLISHED (NETWORK A <-> NETWORK B)');
  console.log('================================================================================');
  console.log(`  Local Node       : ${mesh.identity.nodeId} (${mesh.identity.nodeName})`);
  console.log(`  Remote Peer      : ${res.peer.name} (${res.peer.nodeId})`);
  console.log(`  Remote Cert Pin  : ${res.peer.fingerprint}`);
  console.log(`  Mutual TLS 1.3   : VERIFIED (Zero-Trust Certificate Pinning)`);
  console.log(`  Reverse-Mux Link : ${res.reverseMuxActive ? 'ACTIVE (Bidirectional Port Tunneling Ready)' : 'DIRECT'}`);
  if (res.movieBridge) {
    console.log(`  Remote Video URL : ${endpoint}/api/tv-library?all=1`);
  }
  console.log('--------------------------------------------------------------------------------');
  console.log('  Your local RobOS Video Player stream (:19215) is now securely accessible to');
  console.log(`  ${res.peer.name} over Mutual TLS 1.3. Keep this process running while streaming.`);
  console.log('================================================================================\n');

  if (endpoint) {
    try {
      const cat = await fetchJson(`${endpoint}/api/tv-library?all=1`);
      const items = cat.items || [];
      console.log(`[RobOS Private Networks] Discovered ${items.length} streamable video(s) on ${res.peer.name}:`);
      for (const item of items) {
        console.log(`  - "${item.title}" -> ${item.streamUrl}`);
      }
    } catch {}
  }

  // Keep process alive so Reverse-Mux and local bridge tunnels stay open
  setInterval(() => {}, 30000);
}

async function runStatus() {
  const mesh = createAppMeshEngine({ configDir: CONFIG_DIR });
  const snap = await mesh.getStatusSnapshot();
  console.log(JSON.stringify(snap, null, 2));
}

const cmd = process.argv[2] || 'host';
const restArgs = process.argv.slice(3);

if (cmd === 'host') {
  runHost(restArgs).catch(err => {
    console.error('[RobOS Private Networks] Error:', err.message);
    process.exit(1);
  });
} else if (cmd === 'join') {
  runJoin(restArgs).catch(err => {
    console.error('[RobOS Private Networks] Join failed:', err.message);
    process.exit(1);
  });
} else if (cmd === 'status') {
  runStatus().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  console.log('Usage: node packages/private-networks/cli.js [host | join <robos-net://...> | status]');
}
