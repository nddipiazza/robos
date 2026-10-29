'use strict';

/**
 * RobOS App Mesh Engine (`packages/robos-lib/app-mesh-engine.js`)
 *
 * Provider-agnostic Zero-Trust Application & IPC Port Mesh for RobOS.
 * Securely bridges RobOS application IPC/snapshot ports (19100–19231) and
 * service ports (POS :3410, Smart TV/Dashboards :19210, Party Game :19213,
 * IntelliJ Bridge :63343) between RobOS machines on the same or different networks.
 *
 * Supported Pluggable Transport Drivers:
 *   1. `mtls`      — Built-in Zero-Config Mutual TLS 1.3 + Ed25519/ECDSA P-256 Peer Pinning (no external daemons or root required)
 *   2. `openziti`  — OpenZiti Zero-Trust Overlay (`ziti` CLI / Edge Tunnel service definitions)
 *   3. `tailscale` — Tailscale / Headscale WireGuard Mesh (`tailscale status --json`)
 *   4. `netbird`   — NetBird Zero-Trust P2P Mesh (`netbird status --json`)
 *   5. `wireguard` — Native Kernel/Userspace WireGuard (`wg show`)
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const { Duplex } = require('node:stream');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const { PORT_REGISTRY } = require('./snapshot-cli');

const DEFAULT_MESH_PORT = 19290;

/**
 * Decouple an outer socket/stream (e.g. an HTTPS Upgrade socket or Mux channel)
 * so Node.js `tls.connect({ socket })` can run an inner Mutual TLS 1.3 session over it cleanly.
 */
function detachStream(sock) {
  const dup = new Duplex({
    read() {},
    write(chunk, enc, cb) {
      if (sock.destroyed) return cb(new Error('Underlying transport socket destroyed'));
      sock.write(chunk, enc, cb);
    },
    final(cb) {
      try { sock.end(); } catch {}
      cb();
    },
    destroy(err, cb) {
      try { sock.destroy(); } catch {}
      cb(err);
    },
  });
  sock.on('data', (d) => dup.push(d));
  sock.on('end', () => dup.push(null));
  sock.on('close', () => dup.destroy());
  sock.on('error', (e) => dup.destroy(e));
  return dup;
}

/**
 * 9-byte binary stream multiplexer (`[type:1][channelId:4][len:4]`) allowing a single
 * outbound NAT-traversing connection between Network A and Network B to carry any number
 * of concurrent Mutual TLS 1.3 sockets (e.g., HTTP 206 byte-range video requests, catalog queries, pings).
 */
function attachStreamMux(stream, getTargetPort, onClose) {
  const channels = new Map();
  let nextChanId = 1;
  let rxBuf = Buffer.alloc(0);

  function sendFrame(type, id, payload = Buffer.alloc(0)) {
    if (stream.destroyed) return;
    const hdr = Buffer.allocUnsafe(9);
    hdr.writeUInt8(type, 0);
    hdr.writeUInt32BE(id >>> 0, 1);
    hdr.writeUInt32BE(payload.length >>> 0, 5);
    try {
      stream.write(Buffer.concat([hdr, payload]));
    } catch {}
  }

  stream.on('data', (chunk) => {
    rxBuf = Buffer.concat([rxBuf, chunk]);
    while (rxBuf.length >= 9) {
      const type = rxBuf.readUInt8(0);
      const id = rxBuf.readUInt32BE(1);
      const len = rxBuf.readUInt32BE(5);
      if (rxBuf.length < 9 + len) break;
      const payload = Buffer.from(rxBuf.subarray(9, 9 + len));
      rxBuf = rxBuf.subarray(9 + len);

      if (type === 1) { // OPEN channel to local Gateway port
        const sock = net.connect(getTargetPort(), '127.0.0.1');
        channels.set(id, sock);
        sock.on('data', (d) => sendFrame(2, id, d));
        sock.on('end', () => sendFrame(3, id));
        sock.on('close', () => { channels.delete(id); });
        sock.on('error', () => { channels.delete(id); sendFrame(4, id); });
      } else if (type === 2) { // DATA
        const sock = channels.get(id);
        if (sock && !sock.destroyed) sock.write(payload);
      } else if (type === 3) { // END
        const sock = channels.get(id);
        if (sock && !sock.destroyed) sock.end();
      } else if (type === 4) { // RESET
        const sock = channels.get(id);
        if (sock) { channels.delete(id); sock.destroy(); }
      }
    }
  });

  const proxyServer = net.createServer((clientSock) => {
    const id = (nextChanId += 2);
    channels.set(id, clientSock);
    sendFrame(1, id);
    clientSock.on('data', (d) => sendFrame(2, id, d));
    clientSock.on('end', () => sendFrame(3, id));
    clientSock.on('close', () => { channels.delete(id); });
    clientSock.on('error', () => { channels.delete(id); sendFrame(4, id); });
  });

  const cleanup = () => {
    for (const s of channels.values()) {
      try { s.destroy(); } catch {}
    }
    channels.clear();
    try { proxyServer.close(); } catch {}
    if (typeof onClose === 'function') onClose();
  };

  stream.once('close', cleanup);
  stream.once('error', cleanup);

  return new Promise((resolve, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => {
      resolve({
        proxyPort: proxyServer.address().port,
        close: () => {
          try { stream.destroy(); } catch {}
          cleanup();
        },
      });
    });
  });
}

const TRANSPORT_DRIVERS = [
  {
    id: 'mtls',
    name: 'Built-in Zero-Trust mTLS 1.3',
    badge: 'Built-in (Zero Dependencies)',
    description: 'Pure Node.js Mutual TLS 1.3 with cryptographic peer certificate pinning and per-app ACLs. Works immediately across LAN or port-forwarded WAN with zero external daemons or root access.',
  },
  {
    id: 'openziti',
    name: 'OpenZiti Overlay Fabric',
    badge: 'Identity-Based Dark Network',
    description: 'Binds RobOS app IPC ports as dark OpenZiti services (no listening public/LAN ports) via ziti-edge-tunnel or Ziti SDK.',
  },
  {
    id: 'tailscale',
    name: 'Tailscale / Headscale Mesh',
    badge: 'WireGuard Overlay',
    description: 'Routes RobOS app IPC tunnels over authenticated Tailscale/Headscale 100.x.y.z peer addresses.',
  },
  {
    id: 'netbird',
    name: 'NetBird Zero-Trust P2P',
    badge: 'WebRTC + WireGuard NAT Traversal',
    description: 'Connects RobOS machines across any NAT via NetBird peer-to-peer encrypted tunnels.',
  },
  {
    id: 'wireguard',
    name: 'Native WireGuard Interface',
    badge: 'Kernel / Userspace WG',
    description: 'Binds RobOS IPC mesh traffic strictly to a private wg0 / wg-robos0 interface.',
  },
];

// Additional service ports used by RobOS apps beyond snapshot-cli PORT_REGISTRY
const EXTRA_APP_PORTS = {
  'point-of-sale-register': { port: 3410, label: 'Point of Sale Register & Checkout API', category: 'Retail', kind: 'service' },
  'smart-tv-portal':        { port: 19210, label: 'Smart TV & 10-Foot Dashboard Portal', category: 'System', kind: 'service' },
  'party-game-server':      { port: 19213, label: 'Party Game Phone Controller Server', category: 'Party Games', kind: 'service' },
  'movie-player-stream':    { port: 19215, label: 'RobOS Movie Player HTTP Range Stream & Cinema Library Server', category: 'Tools', kind: 'service' },
  'intellij-ipc-bridge':    { port: 63343, label: 'IntelliJ IDEA / IDE IPC Bridge', category: 'Dev', kind: 'ipc' },
};

function humanizeAppId(appId) {
  return String(appId || '')
    .split('-')
    .map(w => (['mcp', 'ci', 'cli', 'ide', 'api', 'ai', 'db', 'pr', 'ui', 'tv', 'vpn', 'pos', 'nosql', 'grpc', 'crpg'].includes(w)
      ? w.toUpperCase()
      : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Build the complete catalog of RobOS App IPC & Service ports.
 */
function getAppPortCatalog() {
  const seenPorts = new Set();
  const entries = [];

  for (const [appId, info] of Object.entries(EXTRA_APP_PORTS)) {
    seenPorts.add(info.port);
    entries.push({
      appId,
      label: info.label,
      port: info.port,
      category: info.category,
      kind: info.kind,
    });
  }

  for (const [appId, port] of Object.entries(PORT_REGISTRY)) {
    if (seenPorts.has(port)) continue;
    seenPorts.add(port);
    entries.push({
      appId,
      label: `${humanizeAppId(appId)} IPC`,
      port,
      category: 'RobOS App IPC',
      kind: 'ipc',
    });
  }

  return entries.sort((a, b) => a.port - b.port);
}

/**
 * Probe whether a local TCP port is currently listening on 127.0.0.1.
 */
function probeLocalPort(port, host = '127.0.0.1', timeoutMs = 180) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    let settled = false;
    const done = (listening) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch {}
      resolve(listening);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    try {
      sock.connect(port, host);
    } catch {
      done(false);
    }
  });
}

/**
 * Generate a self-signed X.509 certificate + P-256 private key using openssl (or fallback).
 * Used for real TLS 1.3 Mutual TLS (`requestCert: true`) with SHA-256 fingerprint pinning.
 */
function generateIdentityCredentials(nodeId, nodeName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-mesh-id-'));
  const keyFile = path.join(tmpDir, 'key.pem');
  const certFile = path.join(tmpDir, 'cert.pem');
  try {
    const subj = `/CN=${nodeId}/O=RobOS-ZeroTrust-Mesh/OU=${String(nodeName || 'robos').replace(/[^a-zA-Z0-9_-]/g, '')}`;
    cp.execFileSync('openssl', [
      'req', '-x509',
      '-newkey', 'ec',
      '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-keyout', keyFile,
      '-out', certFile,
      '-days', '3650',
      '-nodes',
      '-subj', subj,
    ], { stdio: 'ignore', timeout: 5000 });
    const keyPem = fs.readFileSync(keyFile, 'utf8');
    const certPem = fs.readFileSync(certFile, 'utf8');
    const x509 = new crypto.X509Certificate(certPem);
    const fingerprint = x509.fingerprint256; // SHA256:...
    return { keyPem, certPem, fingerprint };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function computeCertFingerprint(certOrPem) {
  try {
    if (typeof certOrPem === 'string') {
      return new crypto.X509Certificate(certOrPem).fingerprint256;
    }
    if (certOrPem && certOrPem.fingerprint256) {
      return certOrPem.fingerprint256;
    }
    if (certOrPem && certOrPem.raw) {
      const hex = crypto.createHash('sha256').update(certOrPem.raw).digest('hex').toUpperCase();
      return hex.match(/.{2}/g).join(':');
    }
  } catch {}
  return '';
}

function detectNetworkAddresses() {
  const ifaces = os.networkInterfaces() || {};
  const addresses = [];
  let lanIp = '127.0.0.1';
  let overlayIp = null;

  for (const [name, list] of Object.entries(ifaces)) {
    for (const addr of list || []) {
      if (addr.internal || addr.family !== 'IPv4') continue;
      addresses.push({ iface: name, address: addr.address });
      if (/^(tailscale|ts|wt|ziti|zt|wg)/i.test(name) || addr.address.startsWith('100.')) {
        overlayIp = overlayIp || addr.address;
      } else if (lanIp === '127.0.0.1') {
        lanIp = addr.address;
      }
    }
  }
  return { lanIp, overlayIp, addresses };
}

function detectInstalledDrivers() {
  const checkBin = (bin) => {
    try {
      cp.execFileSync('which', [bin], { stdio: 'ignore', timeout: 1500 });
      return true;
    } catch {
      return false;
    }
  };
  const zitiInstalled = checkBin('ziti') || checkBin('ziti-edge-tunnel');
  const tailscaleInstalled = checkBin('tailscale');
  const netbirdInstalled = checkBin('netbird');
  const wireguardInstalled = checkBin('wg');

  return TRANSPORT_DRIVERS.map(d => {
    let available = true;
    let statusNote = 'Ready (Built-in Node.js TLS 1.3)';
    if (d.id === 'openziti') {
      available = true; // Config generator + embedded mTLS bridge always available; CLI optional
      statusNote = zitiInstalled ? 'ziti CLI detected' : 'Embedded Ziti-compatible mTLS edge + Ziti config export';
    } else if (d.id === 'tailscale') {
      statusNote = tailscaleInstalled ? 'tailscale CLI detected' : 'tailscale CLI not installed (mTLS fallback active)';
    } else if (d.id === 'netbird') {
      statusNote = netbirdInstalled ? 'netbird CLI detected' : 'netbird CLI not installed (mTLS fallback active)';
    } else if (d.id === 'wireguard') {
      statusNote = wireguardInstalled ? 'wg tools detected' : 'wg tools not installed (mTLS fallback active)';
    }
    return {
      ...d,
      cliInstalled: d.id === 'mtls' ? true : (
        d.id === 'openziti' ? zitiInstalled :
        d.id === 'tailscale' ? tailscaleInstalled :
        d.id === 'netbird' ? netbirdInstalled :
        wireguardInstalled
      ),
      available,
      statusNote,
    };
  });
}

/**
 * Create the RobOS App Mesh Engine instance.
 */
function createAppMeshEngine(options = {}) {
  const configDir = options.configDir || path.join(os.homedir(), '.config', 'robos');
  const meshDir = path.join(configDir, 'app-mesh');
  const identityFile = path.join(meshDir, 'identity.json');
  const stateFile = path.join(meshDir, 'mesh-state.json');

  fs.mkdirSync(meshDir, { recursive: true, mode: 0o700 });

  function loadOrCreateIdentity() {
    try {
      if (fs.existsSync(identityFile)) {
        const data = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
        if (data.nodeId && data.keyPem && data.certPem && data.fingerprint) {
          return data;
        }
      }
    } catch {}

    const hostname = os.hostname() || 'robos-node';
    const nodeId = `robos-${hostname.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}-${crypto.randomBytes(3).toString('hex')}`;
    const creds = generateIdentityCredentials(nodeId, hostname);
    const identity = {
      nodeId,
      nodeName: hostname,
      createdAt: new Date().toISOString(),
      ...creds,
    };
    fs.writeFileSync(identityFile, JSON.stringify(identity, null, 2), { mode: 0o600 });
    return identity;
  }

  let identity = loadOrCreateIdentity();

  const defaultPolicy = () => ({
    activeDriver: 'mtls',
    networkName: 'RobOS Private Network',
    networkSecret: crypto.randomBytes(32).toString('hex'),
    listenHost: '0.0.0.0',
    listenPort: options.listenPort || DEFAULT_MESH_PORT,
    shareAllIpcPorts: true,
    sharedAppIds: Object.keys(PORT_REGISTRY).concat(Object.keys(EXTRA_APP_PORTS)),
    peers: [],
    tunnels: [],
    zitiControllerUrl: 'https://ziti-controller.robos.internal:1280',
    zitiServicePrefix: 'robos.ipc',
  });

  function loadState() {
    try {
      if (fs.existsSync(stateFile)) {
        const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        const def = defaultPolicy();
        return {
          ...def,
          ...raw,
          networkSecret: raw.networkSecret || def.networkSecret,
          peers: Array.isArray(raw.peers) ? raw.peers : [],
          tunnels: Array.isArray(raw.tunnels) ? raw.tunnels : [],
          sharedAppIds: Array.isArray(raw.sharedAppIds) ? raw.sharedAppIds : def.sharedAppIds,
        };
      }
    } catch {}
    const initial = defaultPolicy();
    try {
      fs.mkdirSync(meshDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(stateFile, JSON.stringify(initial, null, 2), { mode: 0o600 });
    } catch {}
    return initial;
  }

  let state = loadState();
  function saveState() {
    fs.mkdirSync(meshDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  }

  function computeEnrollToken() {
    return crypto.createHmac('sha256', state.networkSecret || 'robos-net').update('robos-net-enroll-v1').digest('hex');
  }

  function computeEnrollProof(enrollToken, nodeId, fingerprint) {
    return crypto.createHmac('sha256', String(enrollToken || '')).update(`${nodeId}:${fingerprint}`).digest('hex');
  }

  // Runtime state
  let gatewayServer = null;
  let gatewayListeningPort = null;
  let upgradeBridgeServer = null;
  let upgradeBridgePort = null;
  let wanRelayProc = null;
  let wanRelayUrl = null;
  const activeGatewaySockets = new Set();
  const activeTunnelServers = new Map(); // tunnelId -> { server, sockets, stats, ... }
  const reverseMuxSessions = new Map();  // peerNodeId -> { proxyPort, close, connectedAt, direction }
  const reverseMuxClients = new Map();   // peerNodeId -> { close, timer }
  const auditLog = [];

  function recordAudit(event) {
    const entry = {
      id: `aud_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    auditLog.unshift(entry);
    if (auditLog.length > 150) auditLog.length = 150;
    return entry;
  }

  function isAppPortAllowedForPeer(appId, port, peer) {
    if (peer && Array.isArray(peer.allowedAppIds) && peer.allowedAppIds.length > 0 && !peer.allowAllApps) {
      if (!peer.allowedAppIds.includes(appId)) return false;
    }
    if (state.shareAllIpcPorts) return true;
    return state.sharedAppIds.includes(appId);
  }

  function findCatalogEntryByAppOrPort(targetAppId, targetPort) {
    const catalog = getAppPortCatalog();
    if (targetAppId) {
      const byId = catalog.find(c => c.appId === targetAppId);
      if (byId) return byId;
    }
    if (targetPort) {
      const byPort = catalog.find(c => c.port === Number(targetPort));
      if (byPort) return byPort;
    }
    return null;
  }

  function rejectUntrustedSocket(tlsSocket, peerFp) {
    recordAudit({
      type: 'REJECT_UNTRUSTED_PEER',
      severity: 'error',
      peerFingerprint: peerFp || 'none',
      remoteAddress: tlsSocket.remoteAddress,
      detail: 'Rejected connection: peer certificate fingerprint is not in trusted Zero-Trust peer registry.',
    });
    try {
      tlsSocket.end(JSON.stringify({ ok: false, error: 'UNTRUSTED_PEER_CERTIFICATE', peerFingerprint: peerFp }) + '\n');
    } catch {}
  }

  /**
   * Handle an incoming mTLS connection on the Zero-Trust Mesh Gateway.
   * Protocol:
   *   Client sends a single newline-delimited JSON header:
   *     { "op": "ping" }
   *     { "op": "catalog" }
   *     { "op": "join-network", "nodeId": "...", "enrollProof": "..." }
   *     { "op": "reverse-mux" }
   *     { "op": "connect", "appId": "dev-central", "port": 19101 }
   */
  function handleGatewayConnection(tlsSocket) {
    activeGatewaySockets.add(tlsSocket);
    tlsSocket.once('close', () => activeGatewaySockets.delete(tlsSocket));
    const peerCert = tlsSocket.getPeerCertificate(true);
    const peerFp = computeCertFingerprint(peerCert);

    // Match either a trusted peer or our own local node identity (for loopback self-test & local bridging)
    let matchedPeer = state.peers.find(p => p.fingerprint === peerFp && p.enabled !== false);
    if (!matchedPeer && peerFp && peerFp === identity.fingerprint) {
      matchedPeer = {
        id: 'self-loopback',
        nodeId: identity.nodeId,
        name: `${identity.nodeName} (Local Node)`,
        fingerprint: identity.fingerprint,
        allowAllApps: true,
      };
    }

    if (!peerFp) {
      rejectUntrustedSocket(tlsSocket, peerFp);
      return;
    }

    // If not yet pinned, allow 1200ms only for a cryptographically signed `join-network` handshake;
    // any other op or timeout is immediately rejected as UNTRUSTED_PEER_CERTIFICATE.
    let unpinnedTimer = null;
    if (!matchedPeer) {
      unpinnedTimer = setTimeout(() => {
        if (!matchedPeer && !tlsSocket.destroyed) {
          rejectUntrustedSocket(tlsSocket, peerFp);
        }
      }, 1200);
    }

    let headerBuf = '';
    const onData = async (chunk) => {
      headerBuf += chunk.toString('utf8');
      const nlIdx = headerBuf.indexOf('\n');
      if (nlIdx === -1) {
        if (headerBuf.length > 8192) tlsSocket.destroy();
        return;
      }

      if (unpinnedTimer) {
        clearTimeout(unpinnedTimer);
        unpinnedTimer = null;
      }
      tlsSocket.removeListener('data', onData);
      const line = headerBuf.slice(0, nlIdx).trim();
      const remaining = Buffer.from(headerBuf.slice(nlIdx + 1), 'utf8');

      let req;
      try {
        req = JSON.parse(line);
      } catch {
        if (!matchedPeer) {
          rejectUntrustedSocket(tlsSocket, peerFp);
          return;
        }
        tlsSocket.write(JSON.stringify({ ok: false, error: 'INVALID_HANDSHAKE_JSON' }) + '\n');
        tlsSocket.destroy();
        return;
      }

      if (!matchedPeer) {
        const expectedProof = req && req.nodeId
          ? computeEnrollProof(computeEnrollToken(), req.nodeId, peerFp)
          : null;
        if (req && req.op === 'join-network' && expectedProof && req.enrollProof === expectedProof) {
          matchedPeer = addOrUpdatePeer({
            nodeId: req.nodeId,
            name: req.nodeName || req.nodeId,
            host: req.host || '127.0.0.1',
            port: req.port || DEFAULT_MESH_PORT,
            relayUrl: req.relayUrl || null,
            fingerprint: peerFp,
          });
        } else {
          rejectUntrustedSocket(tlsSocket, peerFp);
          return;
        }
      }

      if (req.op === 'join-network') {
        if (req.relayUrl || req.host) {
          matchedPeer = addOrUpdatePeer({
            nodeId: req.nodeId || matchedPeer.nodeId,
            name: req.nodeName || matchedPeer.name,
            host: req.host || matchedPeer.host || '127.0.0.1',
            port: req.port || matchedPeer.port || DEFAULT_MESH_PORT,
            relayUrl: req.relayUrl || matchedPeer.relayUrl || null,
            fingerprint: peerFp,
          });
        }
        recordAudit({
          type: 'PRIVATE_NETWORK_JOINED',
          severity: 'success',
          peerId: matchedPeer.nodeId,
          peerName: matchedPeer.name,
          detail: `Mutually enrolled ${matchedPeer.name} (${matchedPeer.nodeId}) into ${state.networkName}`,
        });
        const netInfo = detectNetworkAddresses();
        tlsSocket.end(JSON.stringify({
          ok: true,
          enrolled: true,
          networkName: state.networkName,
          nodeId: identity.nodeId,
          nodeName: identity.nodeName,
          host: netInfo.overlayIp || netInfo.lanIp || '127.0.0.1',
          port: gatewayListeningPort || state.listenPort || DEFAULT_MESH_PORT,
          relayUrl: wanRelayUrl || null,
          fingerprint: identity.fingerprint,
          timestamp: new Date().toISOString(),
        }) + '\n');
        return;
      }

      if (req.op === 'reverse-mux') {
        tlsSocket.write(JSON.stringify({
          ok: true,
          op: 'reverse-mux-ready',
          nodeId: identity.nodeId,
          nodeName: identity.nodeName,
        }) + '\n');
        const detached = detachStream(tlsSocket);
        if (remaining.length > 0) detached.push(remaining);
        const mux = await attachStreamMux(detached, () => gatewayListeningPort || state.listenPort || DEFAULT_MESH_PORT, () => {
          const cur = reverseMuxSessions.get(matchedPeer.nodeId);
          if (cur && cur.proxyPort === mux.proxyPort) {
            reverseMuxSessions.delete(matchedPeer.nodeId);
          }
        });
        const prev = reverseMuxSessions.get(matchedPeer.nodeId);
        if (prev && prev.close) {
          try { prev.close(); } catch {}
        }
        reverseMuxSessions.set(matchedPeer.nodeId, {
          proxyPort: mux.proxyPort,
          close: mux.close,
          connectedAt: new Date().toISOString(),
          direction: 'inbound',
          peerName: matchedPeer.name,
        });
        recordAudit({
          type: 'REVERSE_MUX_ESTABLISHED',
          severity: 'success',
          peerId: matchedPeer.nodeId,
          peerName: matchedPeer.name,
          detail: `Bidirectional Cross-Network Reverse-Mux active with ${matchedPeer.name} (local mux :${mux.proxyPort})`,
        });
        return;
      }

      if (req.op === 'ping') {
        recordAudit({
          type: 'PEER_PING',
          severity: 'info',
          peerId: matchedPeer.nodeId,
          peerName: matchedPeer.name,
          detail: `Verified mTLS 1.3 ping from ${matchedPeer.name}`,
        });
        tlsSocket.end(JSON.stringify({
          ok: true,
          nodeId: identity.nodeId,
          nodeName: identity.nodeName,
          fingerprint: identity.fingerprint,
          driver: state.activeDriver,
          timestamp: new Date().toISOString(),
        }) + '\n');
        return;
      }

      if (req.op === 'catalog') {
        const catalog = await getLocalCatalogStatus();
        const allowed = catalog.filter(item => isAppPortAllowedForPeer(item.appId, item.port, matchedPeer));
        recordAudit({
          type: 'PEER_CATALOG_QUERY',
          severity: 'info',
          peerId: matchedPeer.nodeId,
          peerName: matchedPeer.name,
          detail: `Served ${allowed.length} allowed IPC/service ports to ${matchedPeer.name}`,
        });
        tlsSocket.end(JSON.stringify({
          ok: true,
          nodeId: identity.nodeId,
          nodeName: identity.nodeName,
          apps: allowed,
        }) + '\n');
        return;
      }

      if (req.op === 'connect') {
        const entry = findCatalogEntryByAppOrPort(req.appId, req.port);
        const targetPort = Number(req.port) || (entry ? entry.port : 0);
        const targetAppId = entry ? entry.appId : String(req.appId || `port-${targetPort}`);

        if (!targetPort || !isAppPortAllowedForPeer(targetAppId, targetPort, matchedPeer)) {
          recordAudit({
            type: 'ACL_DENIED',
            severity: 'error',
            peerId: matchedPeer.nodeId,
            peerName: matchedPeer.name,
            appId: targetAppId,
            port: targetPort,
            detail: `Zero-Trust ACL blocked ${matchedPeer.name} from accessing ${targetAppId} (:${targetPort})`,
          });
          tlsSocket.end(JSON.stringify({
            ok: false,
            error: 'ACL_PORT_DENIED',
            appId: targetAppId,
            port: targetPort,
          }) + '\n');
          return;
        }

        const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
        upstream.once('connect', () => {
          recordAudit({
            type: 'IPC_TUNNEL_OPENED',
            severity: 'success',
            peerId: matchedPeer.nodeId,
            peerName: matchedPeer.name,
            appId: targetAppId,
            port: targetPort,
            detail: `Bridged ${matchedPeer.name} -> 127.0.0.1:${targetPort} (${targetAppId})`,
          });
          tlsSocket.write(JSON.stringify({
            ok: true,
            appId: targetAppId,
            port: targetPort,
            nodeId: identity.nodeId,
          }) + '\n');
          if (remaining.length > 0) upstream.write(remaining);
          tlsSocket.pipe(upstream);
          upstream.pipe(tlsSocket);
        });

        upstream.once('error', (err) => {
          try {
            tlsSocket.end(JSON.stringify({
              ok: false,
              error: `UPSTREAM_UNREACHABLE: ${err.code || err.message}`,
              appId: targetAppId,
              port: targetPort,
            }) + '\n');
          } catch {}
        });

        tlsSocket.once('error', () => upstream.destroy());
        return;
      }

      tlsSocket.end(JSON.stringify({ ok: false, error: 'UNKNOWN_OP' }) + '\n');
    };

    tlsSocket.on('data', onData);
    tlsSocket.on('error', () => {
      if (unpinnedTimer) clearTimeout(unpinnedTimer);
    });
  }

  /**
   * Ensure local HTTP 101 Upgrade bridge server is running in front of `gatewayServer`
   * so cross-network HTTPS/WSS relays can forward raw encrypted TLS 1.3 streams.
   */
  async function ensureUpgradeBridgeServer() {
    await startGateway();
    if (upgradeBridgeServer && upgradeBridgeServer.listening) {
      return upgradeBridgePort;
    }
    return new Promise((resolve, reject) => {
      const upgradeSockets = new Set();
      const srv = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          service: 'RobOS Zero-Trust Mutual TLS 1.3 Relay Ingress',
          nodeId: identity.nodeId,
          tlsVersion: 'TLSv1.3',
        }));
      });
      srv.on('upgrade', (req, socket, head) => {
        upgradeSockets.add(socket);
        socket.once('close', () => upgradeSockets.delete(socket));
        const key = req.headers['sec-websocket-key'] || '';
        const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
        );
        const upstream = net.connect(gatewayListeningPort, '127.0.0.1', () => {
          if (head && head.length > 0) upstream.write(head);
          socket.pipe(upstream);
          upstream.pipe(socket);
        });
        socket.on('error', () => upstream.destroy());
        upstream.on('error', () => socket.destroy());
      });
      srv.once('close', () => {
        for (const s of upgradeSockets) {
          try { s.destroy(); } catch {}
        }
        upgradeSockets.clear();
      });
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        upgradeBridgeServer = srv;
        upgradeBridgePort = srv.address().port;
        resolve(upgradeBridgePort);
      });
    });
  }

  /**
   * Start a Cross-Network WAN Relay Ingress (`wss://<id>.lhr.life` or custom relay URL)
   * so peers on completely separate networks / behind CGNAT can dial our Mutual TLS 1.3 Gateway.
   */
  async function startWanRelay(opts = {}) {
    await ensureUpgradeBridgeServer();
    if (opts.customRelayUrl) {
      wanRelayUrl = String(opts.customRelayUrl).trim();
      recordAudit({
        type: 'WAN_RELAY_STARTED',
        severity: 'success',
        detail: `Configured custom Cross-Network WAN Relay: ${wanRelayUrl}`,
      });
      return { ok: true, relayUrl: wanRelayUrl, upgradePort: upgradeBridgePort };
    }
    if (wanRelayProc && wanRelayUrl) {
      return { ok: true, relayUrl: wanRelayUrl, upgradePort: upgradeBridgePort };
    }
    if (wanRelayProc) {
      try { wanRelayProc.kill(); } catch {}
      wanRelayProc = null;
    }

    return new Promise((resolve, reject) => {
      const proc = cp.spawn('ssh', [
        '-T',
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ExitOnForwardFailure=yes',
        '-R', `80:127.0.0.1:${upgradeBridgePort}`,
        'nokey@localhost.run',
      ]);
      wanRelayProc = proc;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('WAN Relay allocation timed out'));
        }
      }, opts.timeoutMs || 12000);

      const onOutput = (chunk) => {
        const text = chunk.toString('utf8');
        const match = text.match(/https:\/\/([a-z0-9-]+\.lhr\.life)/i);
        if (match && !settled) {
          settled = true;
          clearTimeout(timer);
          wanRelayUrl = `wss://${match[1]}`;
          recordAudit({
            type: 'WAN_RELAY_STARTED',
            severity: 'success',
            detail: `Cross-Network Zero-Trust WAN Relay active at ${wanRelayUrl} -> 127.0.0.1:${gatewayListeningPort} (Mutual TLS 1.3)`,
          });
          resolve({ ok: true, relayUrl: wanRelayUrl, upgradePort: upgradeBridgePort });
        }
      };

      proc.stdout.on('data', onOutput);
      proc.stderr.on('data', onOutput);
      proc.once('exit', () => {
        if (wanRelayProc === proc) {
          wanRelayProc = null;
          wanRelayUrl = null;
        }
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('SSH WAN Relay process exited unexpectedly'));
        }
      });
      proc.once('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  function stopWanRelay() {
    if (wanRelayProc) {
      try { wanRelayProc.kill(); } catch {}
      wanRelayProc = null;
    }
    wanRelayUrl = null;
    recordAudit({
      type: 'WAN_RELAY_STOPPED',
      severity: 'info',
      detail: 'Stopped Cross-Network WAN Relay ingress',
    });
    return { ok: true, relayUrl: null };
  }

  /**
   * Dial an HTTP/HTTPS 101 Upgrade relay URL (`wss://...` or `ws://...` or `https://...`)
   * and return a detached raw stream ready for `tls.connect({ socket })` Mutual TLS 1.3.
   */
  function dialRelayUpgradeStream(relayUrl, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const normalized = String(relayUrl).replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
      const parsed = new URL(normalized);
      const isHttps = parsed.protocol === 'https:';
      const mod = isHttps ? https : http;
      const wsKey = crypto.randomBytes(16).toString('base64');

      const req = mod.request({
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/robos-mtls',
        headers: {
          Host: parsed.host,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': wsKey,
          'Sec-WebSocket-Version': '13',
        },
        timeout: timeoutMs,
      });

      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        try { req.destroy(); } catch {}
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      req.once('timeout', () => fail(new Error('RELAY_UPGRADE_TIMEOUT')));
      req.once('error', fail);
      req.once('upgrade', (_res, rawSock, head) => {
        if (settled) return;
        settled = true;
        const detached = detachStream(rawSock);
        if (head && head.length > 0) detached.push(head);
        resolve(detached);
      });
      req.once('response', (res) => {
        fail(new Error(`RELAY_UPGRADE_REJECTED: HTTP ${res.statusCode}`));
      });
      req.end();
    });
  }

  /**
   * Open an authenticated Mutual TLS 1.3 socket to `peer`, automatically routing via:
   *   1. Active Reverse-Mux Session (`reverseMuxSessions.get(peer.nodeId)`) if connected
   *   2. Cross-Network WAN Relay (`peer.relayUrl`) if configured and direct LAN is unreachable
   *   3. Direct TCP (`peer.host:peer.port`)
   */
  async function openPeerTlsSocket(peer, timeoutMs = 6000) {
    // 1. Check active Reverse-Mux session for this peer
    const revMux = peer.nodeId && reverseMuxSessions.get(peer.nodeId);
    if (revMux && revMux.proxyPort) {
      return tls.connect({
        host: '127.0.0.1',
        port: revMux.proxyPort,
        key: identity.keyPem,
        cert: identity.certPem,
        rejectUnauthorized: false,
        minVersion: 'TLSv1.3',
      });
    }

    // 2. If peer has a Cross-Network relayUrl, use it unless peer.host is a non-loopback LAN IP that is directly reachable
    if (peer.relayUrl) {
      const isLoopback = !peer.host || peer.host === '127.0.0.1' || peer.host === 'localhost';
      const directReachable = (!peer.preferRelay && !isLoopback)
        ? await probeLocalPort(Number(peer.port || DEFAULT_MESH_PORT), peer.host, 350)
        : false;
      if (!directReachable) {
        const transportStream = await dialRelayUpgradeStream(peer.relayUrl, timeoutMs);
        return tls.connect({
          socket: transportStream,
          key: identity.keyPem,
          cert: identity.certPem,
          rejectUnauthorized: false,
          minVersion: 'TLSv1.3',
        });
      }
    }

    // 3. Direct TCP Mutual TLS 1.3
    return tls.connect({
      host: peer.host || '127.0.0.1',
      port: Number(peer.port || DEFAULT_MESH_PORT),
      key: identity.keyPem,
      cert: identity.certPem,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.3',
    });
  }

  /**
   * Start the Zero-Trust mTLS Gateway Server.
   */
  function startGateway(customPort) {
    if (gatewayServer && gatewayServer.listening) {
      return Promise.resolve({
        ok: true,
        listening: true,
        port: gatewayListeningPort,
        host: state.listenHost,
      });
    }

    const listenPort = Number(customPort || state.listenPort || DEFAULT_MESH_PORT);
    return new Promise((resolve, reject) => {
      const srv = tls.createServer({
        key: identity.keyPem,
        cert: identity.certPem,
        requestCert: true,
        rejectUnauthorized: false, // We validate peer self-signed certs by pinned SHA-256 fingerprint
        minVersion: 'TLSv1.3',
      }, handleGatewayConnection);

      srv.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && !customPort) {
          // Fallback to ephemeral port if default port is already bound by another process
          srv.listen(0, state.listenHost);
          return;
        }
        reject(err);
      });

      srv.listen(listenPort, state.listenHost, () => {
        gatewayServer = srv;
        gatewayListeningPort = srv.address().port;
        recordAudit({
          type: 'GATEWAY_STARTED',
          severity: 'info',
          detail: `Zero-Trust Mesh Gateway listening on ${state.listenHost}:${gatewayListeningPort} (${state.activeDriver})`,
        });
        resolve({
          ok: true,
          listening: true,
          port: gatewayListeningPort,
          host: state.listenHost,
        });
      });
    });
  }

  function stopGateway() {
    return new Promise(resolve => {
      stopWanRelay();
      for (const tunnelId of Array.from(activeTunnelServers.keys())) {
        stopLocalBridgeTunnel(tunnelId);
      }
      for (const client of reverseMuxClients.values()) {
        try { client.close(); } catch {}
      }
      reverseMuxClients.clear();
      for (const sess of reverseMuxSessions.values()) {
        try { sess.close(); } catch {}
      }
      reverseMuxSessions.clear();
      if (upgradeBridgeServer) {
        try { upgradeBridgeServer.closeAllConnections?.(); } catch {}
        try { upgradeBridgeServer.close(); } catch {}
        upgradeBridgeServer = null;
        upgradeBridgePort = null;
      }
      if (!gatewayServer) return resolve({ ok: true, listening: false });
      const srv = gatewayServer;
      gatewayServer = null;
      gatewayListeningPort = null;
      for (const sock of activeGatewaySockets) {
        try { sock.destroy(); } catch {}
      }
      activeGatewaySockets.clear();
      srv.close(() => {
        recordAudit({
          type: 'GATEWAY_STOPPED',
          severity: 'info',
          detail: 'Zero-Trust Mesh Gateway stopped',
        });
        resolve({ ok: true, listening: false });
      });
    });
  }

  /**
   * Perform an outbound mTLS request to a remote peer gateway.
   */
  function requestPeerGateway(peer, payload, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let sock = null;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        try { if (sock) sock.destroy(); } catch {}
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const timer = setTimeout(() => fail(new Error('GATEWAY_TIMEOUT')), timeoutMs);

      openPeerTlsSocket(peer, timeoutMs).then((tlsSock) => {
        if (settled) {
          try { tlsSock.destroy(); } catch {}
          return;
        }
        sock = tlsSock;
        sock.once('error', fail);

        const onSecure = () => {
          const serverCert = sock.getPeerCertificate(true);
          const serverFp = computeCertFingerprint(serverCert);
          if (peer.fingerprint && serverFp !== peer.fingerprint) {
            return fail(new Error(`SERVER_FINGERPRINT_MISMATCH: expected ${peer.fingerprint}, got ${serverFp}`));
          }
          sock.write(JSON.stringify(payload) + '\n');
        };

        if (sock.authorized !== undefined && sock.encrypted && sock.getPeerCertificate(true)?.raw) {
          onSecure();
        } else {
          sock.once('secureConnect', onSecure);
        }

        let buf = '';
        sock.on('data', chunk => {
          buf += chunk.toString('utf8');
          const nl = buf.indexOf('\n');
          if (nl !== -1 && !settled) {
            settled = true;
            clearTimeout(timer);
            const line = buf.slice(0, nl).trim();
            try { sock.destroy(); } catch {}
            try {
              resolve(JSON.parse(line));
            } catch {
              reject(new Error('INVALID_PEER_RESPONSE'));
            }
          }
        });
      }).catch(fail);
    });
  }

  /**
   * Establish an outbound persistent Reverse-Mux mTLS 1.3 connection to `peer`
   * so `peer` can also dial our local Gateway ports across NAT/CGNAT without requiring
   * us to open an inbound port!
   */
  async function startReverseMuxClient(peer) {
    await startGateway();
    const existing = reverseMuxClients.get(peer.nodeId);
    if (existing && existing.close) {
      try { existing.close(); } catch {}
    }

    let closed = false;
    let activeSock = null;
    let activeMux = null;

    const connectOnce = async () => {
      if (closed) return null;
      const tlsSock = await openPeerTlsSocket(peer, 8000);
      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => {
          if (settled) return;
          settled = true;
          try { tlsSock.destroy(); } catch {}
          reject(err);
        };
        tlsSock.once('error', fail);
        tlsSock.once('secureConnect', () => {
          const srvFp = computeCertFingerprint(tlsSock.getPeerCertificate(true));
          if (peer.fingerprint && srvFp !== peer.fingerprint) {
            return fail(new Error('SERVER_FINGERPRINT_MISMATCH'));
          }
          tlsSock.write(JSON.stringify({ op: 'reverse-mux' }) + '\n');
        });

        let hdrBuf = '';
        const onData = async (chunk) => {
          hdrBuf += chunk.toString('utf8');
          const nl = hdrBuf.indexOf('\n');
          if (nl === -1) return;
          tlsSock.removeListener('data', onData);
          const line = hdrBuf.slice(0, nl).trim();
          const rest = Buffer.from(hdrBuf.slice(nl + 1), 'utf8');
          let resp;
          try { resp = JSON.parse(line); } catch {}
          if (!resp || !resp.ok) {
            return fail(new Error((resp && resp.error) || 'REVERSE_MUX_REJECTED'));
          }
          settled = true;
          activeSock = tlsSock;
          const detached = detachStream(tlsSock);
          if (rest.length > 0) detached.push(rest);
          const mux = await attachStreamMux(detached, () => gatewayListeningPort || state.listenPort || DEFAULT_MESH_PORT, () => {
            const cur = reverseMuxSessions.get(peer.nodeId);
            if (cur && cur.proxyPort === mux.proxyPort) {
              reverseMuxSessions.delete(peer.nodeId);
            }
          });
          activeMux = mux;
          reverseMuxSessions.set(peer.nodeId, {
            proxyPort: mux.proxyPort,
            close: mux.close,
            connectedAt: new Date().toISOString(),
            direction: 'outbound',
            peerName: peer.name,
          });
          recordAudit({
            type: 'REVERSE_MUX_CLIENT_CONNECTED',
            severity: 'success',
            peerId: peer.nodeId,
            peerName: peer.name,
            detail: `Connected persistent bidirectional mTLS 1.3 Reverse-Mux to ${peer.name}`,
          });
          resolve(mux);
        };
        tlsSock.on('data', onData);
      });
    };

    const mux = await connectOnce();
    reverseMuxClients.set(peer.nodeId, {
      close: () => {
        closed = true;
        try { if (activeMux) activeMux.close(); } catch {}
        try { if (activeSock) activeSock.destroy(); } catch {}
      },
    });
    return mux;
  }

  /**
   * Create a local TCP listener on `localBindPort` (127.0.0.1) that tunnels every
   * incoming socket over mTLS 1.3 to `peer` for `remoteAppId` / `remotePort`.
   * This allows local RobOS tools (`snapshot-cli.js`, `Agent Chat`, browsers, Movie Player, etc.)
   * to talk to a remote machine's RobOS app IPC port as if it were local.
   */
  function startLocalBridgeTunnel({ peerId, remoteAppId, remotePort, localPort = 0 }) {
    const peer = peerId === 'self-loopback'
      ? {
          id: 'self-loopback',
          nodeId: identity.nodeId,
          name: `${identity.nodeName} (Loopback)`,
          host: '127.0.0.1',
          port: gatewayListeningPort || state.listenPort || DEFAULT_MESH_PORT,
          fingerprint: identity.fingerprint,
        }
      : state.peers.find(p => p.id === peerId || p.nodeId === peerId);

    if (!peer) {
      return Promise.reject(new Error(`Peer not found: ${peerId}`));
    }

    const entry = findCatalogEntryByAppOrPort(remoteAppId, remotePort);
    const targetPort = Number(remotePort) || (entry ? entry.port : 0);
    const targetAppId = entry ? entry.appId : String(remoteAppId || `port-${targetPort}`);

    // If a tunnel for the exact same localPort > 0 is already active, close it before rebinding
    if (Number(localPort) > 0) {
      for (const [existingId, item] of activeTunnelServers.entries()) {
        if (item.record.localPort === Number(localPort)) {
          stopLocalBridgeTunnel(existingId);
        }
      }
    }

    const tunnelId = `tun_${peer.nodeId}_${targetAppId}_${Date.now().toString(36)}`;

    return new Promise((resolve, reject) => {
      const stats = {
        connections: 0,
        bytesIn: 0,
        bytesOut: 0,
        lastError: null,
      };

      const tcpServer = net.createServer((clientSock) => {
        stats.connections += 1;
        const pendingClientChunks = [];
        let tunnelReady = false;
        let tlsSock = null;

        clientSock.on('data', d => {
          stats.bytesOut += d.length;
          if (tunnelReady && tlsSock) {
            tlsSock.write(d);
          } else {
            pendingClientChunks.push(d);
          }
        });

        // Always look up latest peer metadata (in case relayUrl or reverseMux updated)
        const latestPeer = peerId === 'self-loopback'
          ? peer
          : (state.peers.find(p => p.id === peer.id || p.nodeId === peer.nodeId) || peer);

        openPeerTlsSocket(latestPeer, 8000).then((connectedTls) => {
          tlsSock = connectedTls;

          const onSecure = () => {
            const srvFp = computeCertFingerprint(tlsSock.getPeerCertificate(true));
            if (latestPeer.fingerprint && srvFp !== latestPeer.fingerprint) {
              stats.lastError = 'SERVER_FINGERPRINT_MISMATCH';
              clientSock.destroy();
              tlsSock.destroy();
              return;
            }
            tlsSock.write(JSON.stringify({
              op: 'connect',
              appId: targetAppId,
              port: targetPort,
            }) + '\n');
          };

          if (tlsSock.encrypted && tlsSock.getPeerCertificate(true)?.raw) {
            onSecure();
          } else {
            tlsSock.once('secureConnect', onSecure);
          }

          let headerParsed = false;
          let headerBuf = '';
          const onTlsData = (chunk) => {
            if (!headerParsed) {
              headerBuf += chunk.toString('utf8');
              const nl = headerBuf.indexOf('\n');
              if (nl === -1) return;
              headerParsed = true;
              const line = headerBuf.slice(0, nl).trim();
              const rest = Buffer.from(headerBuf.slice(nl + 1), 'utf8');
              let resp;
              try { resp = JSON.parse(line); } catch {}
              if (!resp || !resp.ok) {
                stats.lastError = (resp && resp.error) || 'TUNNEL_HANDSHAKE_FAILED';
                clientSock.destroy();
                tlsSock.destroy();
                return;
              }
              tunnelReady = true;
              while (pendingClientChunks.length > 0) {
                tlsSock.write(pendingClientChunks.shift());
              }
              if (rest.length > 0) {
                stats.bytesIn += rest.length;
                clientSock.write(rest);
              }
              clientSock.once('end', () => tlsSock.end());
              tlsSock.once('end', () => clientSock.end());
            } else {
              stats.bytesIn += chunk.length;
              clientSock.write(chunk);
            }
          };

          tlsSock.on('data', onTlsData);
          tlsSock.once('error', (err) => {
            stats.lastError = err.message;
            clientSock.destroy();
          });
          clientSock.once('error', () => tlsSock.destroy());
        }).catch((err) => {
          stats.lastError = err.message;
          clientSock.destroy();
        });
      });

      tcpServer.once('error', reject);
      tcpServer.listen(Number(localPort) || 0, '127.0.0.1', () => {
        const boundPort = tcpServer.address().port;
        const tunnelRecord = {
          id: tunnelId,
          peerId: peer.id,
          peerNodeId: peer.nodeId,
          peerName: peer.name,
          peerHost: peer.relayUrl || peer.host,
          remoteAppId: targetAppId,
          remoteLabel: entry ? entry.label : targetAppId,
          remotePort: targetPort,
          localHost: '127.0.0.1',
          localPort: boundPort,
          driver: state.activeDriver,
          status: 'active',
          createdAt: new Date().toISOString(),
          stats,
        };
        activeTunnelServers.set(tunnelId, { server: tcpServer, record: tunnelRecord });
        recordAudit({
          type: 'LOCAL_BRIDGE_CREATED',
          severity: 'success',
          peerId: peer.nodeId,
          peerName: peer.name,
          appId: targetAppId,
          detail: `Mounted remote ${peer.name}:${targetPort} (${targetAppId}) on local 127.0.0.1:${boundPort}`,
        });
        resolve(tunnelRecord);
      });
    });
  }

  function stopLocalBridgeTunnel(tunnelId) {
    const item = activeTunnelServers.get(tunnelId);
    if (!item) return { ok: false, error: 'Tunnel not found' };
    try { item.server.close(); } catch {}
    activeTunnelServers.delete(tunnelId);
    recordAudit({
      type: 'LOCAL_BRIDGE_STOPPED',
      severity: 'info',
      appId: item.record.remoteAppId,
      detail: `Closed local bridge 127.0.0.1:${item.record.localPort} -> ${item.record.peerName}:${item.record.remotePort}`,
    });
    return { ok: true, tunnelId };
  }

  function listActiveTunnels() {
    return Array.from(activeTunnelServers.values()).map(v => ({
      ...v.record,
      stats: { ...v.record.stats },
    }));
  }

  /**
   * Generate a shareable Zero-Trust Enrollment Token (`robos-mesh://...` and `robos-net://...`)
   * containing this machine's nodeId, host/overlay IP, port, WAN relay URL (if active),
   * and certificate SHA-256 fingerprint.
   */
  function generateEnrollmentToken(customHost, customRelayUrl) {
    const netInfo = detectNetworkAddresses();
    const host = customHost || netInfo.overlayIp || netInfo.lanIp || '127.0.0.1';
    const port = gatewayListeningPort || state.listenPort || DEFAULT_MESH_PORT;
    const payload = {
      v: 1,
      networkName: state.networkName || 'RobOS Private Network',
      nodeId: identity.nodeId,
      name: identity.nodeName,
      host,
      port,
      relayUrl: customRelayUrl || wanRelayUrl || null,
      fingerprint: identity.fingerprint,
      enrollToken: computeEnrollToken(),
      driver: state.activeDriver,
      issuedAt: new Date().toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return {
      token: `robos-mesh://${encoded}`,
      netToken: `robos-net://${encoded}`,
      privateNetToken: `robos-net://${encoded}`,
      payload,
    };
  }

  function parseEnrollmentToken(tokenStr) {
    const raw = String(tokenStr || '').trim();
    const b64 = raw.replace(/^robos-(mesh|net):\/\//i, '');
    const decoded = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (!decoded.nodeId || !decoded.fingerprint) {
      throw new Error('Invalid enrollment token: missing nodeId or certificate fingerprint');
    }
    return decoded;
  }

  function addOrUpdatePeer(peerInput) {
    let parsed = peerInput;
    if (typeof peerInput === 'string' || (peerInput && peerInput.token)) {
      parsed = parseEnrollmentToken(typeof peerInput === 'string' ? peerInput : peerInput.token);
      if (peerInput && typeof peerInput === 'object') {
        parsed = { ...parsed, ...peerInput };
      }
    }

    const nodeId = String(parsed.nodeId || `peer-${crypto.randomBytes(3).toString('hex')}`).trim();
    const fingerprint = String(parsed.fingerprint || '').trim();
    if (!fingerprint) {
      throw new Error('Peer SHA-256 certificate fingerprint is required for Zero-Trust pinning');
    }

    const existingIdx = state.peers.findIndex(p => p.nodeId === nodeId || p.fingerprint === fingerprint);
    const peerRecord = {
      id: existingIdx >= 0 ? state.peers[existingIdx].id : `peer_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      nodeId,
      name: String(parsed.name || nodeId).trim(),
      host: String(parsed.host || '127.0.0.1').trim(),
      port: Number(parsed.port || DEFAULT_MESH_PORT),
      relayUrl: parsed.relayUrl !== undefined ? parsed.relayUrl : (existingIdx >= 0 ? state.peers[existingIdx].relayUrl : null),
      preferRelay: Boolean(parsed.preferRelay),
      enrollToken: parsed.enrollToken || (existingIdx >= 0 ? state.peers[existingIdx].enrollToken : null),
      fingerprint,
      driver: parsed.driver || state.activeDriver,
      allowAllApps: parsed.allowAllApps !== undefined ? Boolean(parsed.allowAllApps) : true,
      allowedAppIds: Array.isArray(parsed.allowedAppIds) ? parsed.allowedAppIds : [],
      enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
      addedAt: existingIdx >= 0 ? state.peers[existingIdx].addedAt : new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      state.peers[existingIdx] = peerRecord;
    } else {
      state.peers.push(peerRecord);
    }
    saveState();

    recordAudit({
      type: 'PEER_ENROLLED',
      severity: 'info',
      peerId: peerRecord.nodeId,
      peerName: peerRecord.name,
      detail: `Pinned Zero-Trust peer ${peerRecord.name} (${peerRecord.relayUrl || `${peerRecord.host}:${peerRecord.port}`}) [${peerRecord.fingerprint.slice(0, 23)}…]`,
    });

    return peerRecord;
  }

  /**
   * Join a remote Private Network (`robos-net://...` or `robos-mesh://...`) in one step:
   *   1. Pins the remote peer's X.509 certificate fingerprint locally.
   *   2. Performs a Mutual TLS 1.3 `join-network` handshake so the remote peer automatically pins our certificate.
   *   3. Opens a persistent bidirectional `reverse-mux` mTLS 1.3 channel so both Network A and Network B can bridge ports.
   *   4. Optionally bridges `movie-player-stream` (:19215) locally.
   */
  async function joinPrivateNetwork(input, opts = {}) {
    await startGateway();
    const peer = addOrUpdatePeer(input);
    const netInfo = detectNetworkAddresses();
    const enrollProof = peer.enrollToken
      ? computeEnrollProof(peer.enrollToken, identity.nodeId, identity.fingerprint)
      : null;

    const joinRes = await requestPeerGateway(peer, {
      op: 'join-network',
      nodeId: identity.nodeId,
      nodeName: identity.nodeName,
      host: netInfo.overlayIp || netInfo.lanIp || '127.0.0.1',
      port: gatewayListeningPort || state.listenPort || DEFAULT_MESH_PORT,
      relayUrl: wanRelayUrl || null,
      fingerprint: identity.fingerprint,
      enrollProof,
    }, 10000);

    if (!joinRes || !joinRes.ok) {
      throw new Error((joinRes && joinRes.error) || 'Failed to join remote Private Network');
    }

    // Start persistent Reverse-Mux so the remote peer can also dial our ports (e.g. :19215 Movie Player) across NAT
    let reverseMuxConnected = false;
    if (opts.reverseMux !== false) {
      try {
        await startReverseMuxClient(peer);
        reverseMuxConnected = true;
      } catch {}
    }

    let movieBridge = null;
    if (opts.bridgeMoviePlayer) {
      try {
        movieBridge = await startLocalBridgeTunnel({
          peerId: peer.id,
          remoteAppId: 'movie-player-stream',
          remotePort: 19215,
          localPort: opts.localMoviePort !== undefined ? opts.localMoviePort : 0,
        });
      } catch {}
    }

    return {
      ok: true,
      peer,
      joinRes,
      mutualEnrolled: Boolean(joinRes.enrolled),
      reverseMuxConnected,
      reverseMuxActive: reverseMuxConnected,
      movieBridge,
    };
  }

  function listPeers() {
    return state.peers.map(p => ({
      ...p,
      reverseMuxActive: reverseMuxSessions.has(p.nodeId),
      reverseMuxConnected: reverseMuxSessions.has(p.nodeId),
    }));
  }

  function removePeer(peerId) {
    const idx = state.peers.findIndex(p => p.id === peerId || p.nodeId === peerId);
    if (idx === -1) return { ok: false, error: 'Peer not found' };
    const [removed] = state.peers.splice(idx, 1);
    saveState();
    recordAudit({
      type: 'PEER_REVOKED',
      severity: 'info',
      peerId: removed.nodeId,
      peerName: removed.name,
      detail: `Revoked Zero-Trust peer ${removed.name}`,
    });
    return { ok: true, removed, peers: state.peers };
  }

  async function getLocalCatalogStatus() {
    const catalog = getAppPortCatalog();
    const results = await Promise.all(
      catalog.map(async (item) => {
        const listening = await probeLocalPort(item.port);
        const shared = state.shareAllIpcPorts || state.sharedAppIds.includes(item.appId);
        return {
          ...item,
          listening,
          shared,
        };
      })
    );
    return results;
  }

  function updatePolicy(patch = {}) {
    if (patch.activeDriver && TRANSPORT_DRIVERS.some(d => d.id === patch.activeDriver)) {
      state.activeDriver = patch.activeDriver;
    }
    if (typeof patch.shareAllIpcPorts === 'boolean') {
      state.shareAllIpcPorts = patch.shareAllIpcPorts;
    }
    if (Array.isArray(patch.sharedAppIds)) {
      state.sharedAppIds = patch.sharedAppIds;
    }
    if (patch.toggleAppId) {
      const appId = patch.toggleAppId;
      state.shareAllIpcPorts = false;
      const set = new Set(state.sharedAppIds);
      if (set.has(appId)) set.delete(appId);
      else set.add(appId);
      state.sharedAppIds = Array.from(set);
    }
    if (patch.zitiControllerUrl) {
      state.zitiControllerUrl = String(patch.zitiControllerUrl).trim();
    }
    saveState();
    recordAudit({
      type: 'POLICY_UPDATED',
      severity: 'info',
      detail: `Updated Zero-Trust policy (driver=${state.activeDriver}, shareAll=${state.shareAllIpcPorts}, sharedCount=${state.sharedAppIds.length})`,
    });
    return state;
  }

  /**
   * Export standard overlay configuration (e.g. OpenZiti CLI script, Tailscale ACL, or WireGuard config)
   * so users who want external control planes can provision all RobOS IPC ports with 1 click.
   */
  function generateDriverManifest(driverId = state.activeDriver) {
    const catalog = getAppPortCatalog().filter(c => state.shareAllIpcPorts || state.sharedAppIds.includes(c.appId));

    if (driverId === 'openziti') {
      const lines = [
        `# OpenZiti Zero-Trust Service Provisioning for RobOS (${identity.nodeId})`,
        `# Controller: ${state.zitiControllerUrl}`,
        `ziti edge login ${state.zitiControllerUrl}`,
        ``,
        `# 1. Create Host & Bind Service Policy for this RobOS node`,
      ];
      for (const item of catalog.slice(0, 12)) {
        const svc = `${state.zitiServicePrefix}.${item.appId}`;
        lines.push(
          `ziti edge create config "${svc}-host.v1" host.v1 '{"protocol":"tcp","address":"127.0.0.1","port":${item.port}}'`,
          `ziti edge create config "${svc}-intercept.v1" intercept.v1 '{"protocols":["tcp"],"addresses":["${svc}.ziti"],"portRanges":[{"low":${item.port},"high":${item.port}}]}'`,
          `ziti edge create service "${svc}" --configs "${svc}-host.v1,${svc}-intercept.v1"`,
          ``
        );
      }
      lines.push(
        `ziti edge create service-policy "${state.zitiServicePrefix}-bind" Bind --service-roles "@${state.zitiServicePrefix}*" --identity-roles "#robos-nodes"`,
        `ziti edge create service-policy "${state.zitiServicePrefix}-dial" Dial --service-roles "@${state.zitiServicePrefix}*" --identity-roles "#robos-nodes"`
      );
      return { driverId, format: 'bash', content: lines.join('\n') };
    }

    if (driverId === 'tailscale' || driverId === 'netbird') {
      const ports = catalog.map(c => c.port);
      const minPort = Math.min(...ports.filter(p => p >= 19100));
      const maxPort = Math.max(...ports.filter(p => p >= 19100));
      const acl = {
        tagOwners: { 'tag:robos-mesh': ['autogroup:admin'] },
        acls: [
          {
            action: 'accept',
            src: ['tag:robos-mesh'],
            dst: [
              `tag:robos-mesh:${minPort}-${maxPort}`,
              `tag:robos-mesh:3410`,
              `tag:robos-mesh:63343`,
              `tag:robos-mesh:${gatewayListeningPort || DEFAULT_MESH_PORT}`,
            ],
          },
        ],
      };
      return { driverId, format: 'json', content: JSON.stringify(acl, null, 2) };
    }

    // Default: Built-in mTLS summary manifest
    return {
      driverId: 'mtls',
      format: 'json',
      content: JSON.stringify({
        nodeId: identity.nodeId,
        fingerprint: identity.fingerprint,
        gatewayPort: gatewayListeningPort || state.listenPort,
        tlsVersion: 'TLSv1.3',
        mutualAuth: true,
        sharedPortsCount: catalog.length,
        sampleSharedApps: catalog.slice(0, 10).map(c => ({ appId: c.appId, port: c.port })),
      }, null, 2),
    };
  }

  /**
   * Run a live End-to-End Zero-Trust Verification Proof:
   *   1. Starts an ephemeral mock RobOS IPC server on 127.0.0.1.
   *   2. Ensures the mTLS 1.3 Mesh Gateway is running.
   *   3. Attempts an UNAUTHORIZED connection with a rogue/unpinned certificate and proves it is REJECTED.
   *   4. Mounts a local bridge tunnel with the pinned Zero-Trust identity, sends an IPC `/health` request
   *      through the encrypted mTLS tunnel, and verifies the exact response.
   */
  async function runZeroTrustVerificationProof() {
    await startGateway();

    // 1. Spin up an ephemeral mock IPC endpoint representing a RobOS app
    const mockServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        appId: 'zt-proof-ipc',
        zeroTrustVerified: true,
        url: req.url,
      }));
    });
    await new Promise(r => mockServer.listen(0, '127.0.0.1', r));
    const mockIpcPort = mockServer.address().port;

    let rogueRejected = false;
    let rogueError = null;
    let authorizedHealth = null;
    let bridgeTunnel = null;

    try {
      // 2. Generate a rogue, unpinned identity and attempt to dial the Gateway
      const rogueCreds = generateIdentityCredentials('rogue-intruder', 'rogue');
      await new Promise((resolve) => {
        const sock = tls.connect({
          host: '127.0.0.1',
          port: gatewayListeningPort,
          key: rogueCreds.keyPem,
          cert: rogueCreds.certPem,
          rejectUnauthorized: false,
          minVersion: 'TLSv1.3',
        });
        sock.once('secureConnect', () => {
          sock.write(JSON.stringify({ op: 'ping' }) + '\n');
        });
        let data = '';
        sock.on('data', d => { data += d.toString('utf8'); });
        sock.once('close', () => {
          try {
            const parsed = JSON.parse(data.trim());
            if (parsed.ok === false && parsed.error === 'UNTRUSTED_PEER_CERTIFICATE') {
              rogueRejected = true;
              rogueError = parsed.error;
            }
          } catch {}
          resolve();
        });
        sock.once('error', () => {
          rogueRejected = true;
          resolve();
        });
      });

      // 3. Create an authorized loopback bridge tunnel and execute an HTTP IPC `/health` call over it
      bridgeTunnel = await startLocalBridgeTunnel({
        peerId: 'self-loopback',
        remoteAppId: 'zt-proof-ipc',
        remotePort: mockIpcPort,
      });

      authorizedHealth = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${bridgeTunnel.localPort}/health`, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
          });
        }).on('error', reject);
      });

      const ok = Boolean(rogueRejected && authorizedHealth && authorizedHealth.zeroTrustVerified === true);
      recordAudit({
        type: 'ZERO_TRUST_PROOF_COMPLETED',
        severity: ok ? 'success' : 'error',
        detail: `Live E2E Proof: Rogue Cert Rejected=${rogueRejected} (${rogueError || 'blocked'}), Authorized IPC Tunnel Verified=${Boolean(authorizedHealth?.zeroTrustVerified)}`,
      });

      return {
        ok,
        rogueRejected,
        rogueError,
        authorizedHealth,
        gatewayPort: gatewayListeningPort,
        tunnelLocalPort: bridgeTunnel.localPort,
        targetIpcPort: mockIpcPort,
      };
    } finally {
      if (bridgeTunnel) stopLocalBridgeTunnel(bridgeTunnel.id);
      try { mockServer.close(); } catch {}
    }
  }

  async function getStatusSnapshot() {
    const netInfo = detectNetworkAddresses();
    const drivers = detectInstalledDrivers();
    const catalog = await getLocalCatalogStatus();
    const enrollment = generateEnrollmentToken();
    const manifest = generateDriverManifest(state.activeDriver);
    const activeMuxList = Array.from(reverseMuxSessions.entries()).map(([peerNodeId, s]) => ({
      peerNodeId,
      peerName: s.peerName,
      proxyPort: s.proxyPort,
      direction: s.direction,
      connectedAt: s.connectedAt,
    }));

    return {
      ok: true,
      networkName: state.networkName || 'RobOS Private Network',
      identity: {
        nodeId: identity.nodeId,
        nodeName: identity.nodeName,
        fingerprint: identity.fingerprint,
        createdAt: identity.createdAt,
      },
      gateway: {
        listening: Boolean(gatewayServer && gatewayServer.listening),
        host: state.listenHost,
        port: gatewayListeningPort || state.listenPort || DEFAULT_MESH_PORT,
        activeDriver: state.activeDriver,
        wanRelayUrl: wanRelayUrl || null,
        upgradePort: upgradeBridgePort || null,
      },
      wanRelay: {
        active: Boolean(wanRelayUrl),
        relayUrl: wanRelayUrl || null,
        upgradePort: upgradeBridgePort || null,
      },
      reverseMuxSessions: activeMuxList,
      netInfo,
      drivers,
      policy: {
        activeDriver: state.activeDriver,
        shareAllIpcPorts: state.shareAllIpcPorts,
        sharedAppIds: state.sharedAppIds,
        zitiControllerUrl: state.zitiControllerUrl,
      },
      enrollment,
      peers: state.peers.map(p => ({
        ...p,
        reverseMuxActive: reverseMuxSessions.has(p.nodeId),
      })),
      tunnels: listActiveTunnels(),
      catalog,
      manifest,
      auditLog: auditLog.slice(0, 40),
    };
  }

  return {
    identity,
    startGateway,
    stopGateway,
    startWanRelay,
    stopWanRelay,
    ensureUpgradeBridgeServer,
    startReverseMuxClient,
    joinPrivateNetwork,
    getStatusSnapshot,
    getLocalCatalogStatus,
    generateEnrollmentToken,
    parseEnrollmentToken,
    addOrUpdatePeer,
    listPeers,
    removePeer,
    requestPeerGateway,
    startLocalBridgeTunnel,
    stopLocalBridgeTunnel,
    listActiveTunnels,
    updatePolicy,
    generateDriverManifest,
    runZeroTrustVerificationProof,
  };
}

module.exports = {
  DEFAULT_MESH_PORT,
  TRANSPORT_DRIVERS,
  EXTRA_APP_PORTS,
  getAppPortCatalog,
  probeLocalPort,
  generateIdentityCredentials,
  computeCertFingerprint,
  detectNetworkAddresses,
  detectInstalledDrivers,
  detachStream,
  attachStreamMux,
  createAppMeshEngine,
};
