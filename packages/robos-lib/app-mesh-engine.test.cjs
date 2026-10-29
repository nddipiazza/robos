'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {
  createAppMeshEngine,
  getAppPortCatalog,
} = require('./app-mesh-engine');

test('getAppPortCatalog returns all registered RobOS IPC and service ports', () => {
  const catalog = getAppPortCatalog();
  assert.ok(catalog.length >= 90, `expected >= 90 ports, got ${catalog.length}`);
  assert.ok(catalog.some(c => c.appId === 'dev-central' && c.port === 19101));
  assert.ok(catalog.some(c => c.appId === 'point-of-sale-register' && c.port === 3410));
  assert.ok(catalog.some(c => c.appId === 'movie-player-stream' && c.port === 19215));
  assert.ok(catalog.some(c => c.appId === 'app-mesh' && c.port === 19216));
});

test('AppMeshEngine runs mTLS 1.3 gateway, rejects untrusted certs, and tunnels IPC ports across two distinct nodes', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-app-mesh-test-'));
  const nodeADir = path.join(tmpRoot, 'node-a');
  const nodeBDir = path.join(tmpRoot, 'node-b');

  // Create two separate RobOS Machine Mesh engines (Node A and Node B)
  const meshA = createAppMeshEngine({ configDir: nodeADir, listenPort: 0 });
  const meshB = createAppMeshEngine({ configDir: nodeBDir, listenPort: 0 });

  // Start an ephemeral mock RobOS IPC server on Node A
  const mockIpcServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      appId: 'dev-central',
      fromNode: meshA.identity.nodeId,
      path: req.url,
    }));
  });
  await new Promise(r => mockIpcServer.listen(0, '127.0.0.1', r));
  const mockIpcPort = mockIpcServer.address().port;

  try {
    const gwA = await meshA.startGateway(0);
    assert.equal(gwA.listening, true);

    // 1. Before Node A trusts Node B, Node B's ping to Node A MUST be rejected
    const untrustedRes = await meshB.requestPeerGateway({
      host: '127.0.0.1',
      port: gwA.port,
      fingerprint: meshA.identity.fingerprint,
    }, { op: 'ping' });
    assert.equal(untrustedRes.ok, false);
    assert.equal(untrustedRes.error, 'UNTRUSTED_PEER_CERTIFICATE');

    // 2. Mutual Zero-Trust Enrollment: Node A enrolls Node B's token, Node B enrolls Node A's token
    const tokenA = meshA.generateEnrollmentToken('127.0.0.1');
    const tokenB = meshB.generateEnrollmentToken('127.0.0.1');

    meshA.addOrUpdatePeer(tokenB.token);
    const peerAOnB = meshB.addOrUpdatePeer(tokenA.token);

    // 3. Now Node B can ping Node A over mTLS 1.3
    const pingRes = await meshB.requestPeerGateway(peerAOnB, { op: 'ping' });
    assert.equal(pingRes.ok, true);
    assert.equal(pingRes.nodeId, meshA.identity.nodeId);

    // 4. Node B mounts Node A's IPC port locally via startLocalBridgeTunnel
    const tunnel = await meshB.startLocalBridgeTunnel({
      peerId: peerAOnB.id,
      remoteAppId: 'custom-ipc-test',
      remotePort: mockIpcPort,
      localPort: 0,
    });
    assert.ok(tunnel.localPort > 0);

    // 5. Connect to the local bridge port on Node B and verify it reaches Node A's IPC server
    const ipcResponse = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${tunnel.localPort}/snapshot`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    assert.equal(ipcResponse.ok, true);
    assert.equal(ipcResponse.fromNode, meshA.identity.nodeId);
    assert.equal(ipcResponse.path, '/snapshot');

    meshB.stopLocalBridgeTunnel(tunnel.id);

    // 6. Also verify built-in 1-click Zero-Trust Proof
    const proof = await meshA.runZeroTrustVerificationProof();
    assert.equal(proof.ok, true);
    assert.equal(proof.rogueRejected, true);
    assert.equal(proof.authorizedHealth.zeroTrustVerified, true);
  } finally {
    await meshA.stopGateway();
    await meshB.stopGateway();
    mockIpcServer.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Cross-network joinPrivateNetwork over HTTP 101 Upgrade + mTLS 1.3 + Reverse-Mux streams video from Box A to Box B', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-p2p-net-test-'));
  const boxADir = path.join(tmpRoot, 'box-a');
  const boxBDir = path.join(tmpRoot, 'box-b');

  // Box A has a video stream server (like Movie Player :19215) behind its NAT
  const videoBytes = Buffer.alloc(128 * 1024, 0x5a);
  const boxAVideoServer = http.createServer((req, res) => {
    if (req.url === '/api/tv-library?all=1') {
      const host = req.headers.host || '127.0.0.1:19215';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        items: [{
          id: 'vid-1',
          title: 'Frontier Hunters Live',
          mediaType: 'movie',
          streamUrl: `http://${host}/stream/vid-1.mp4`,
        }],
      }));
      return;
    }
    if (req.url === '/stream/vid-1.mp4') {
      const range = req.headers.range;
      if (range) {
        const [s, e] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(s, 10) || 0;
        const end = e ? parseInt(e, 10) : videoBytes.length - 1;
        const chunk = videoBytes.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${videoBytes.length}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length,
          'Content-Type': 'video/mp4',
        });
        res.end(chunk);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': videoBytes.length });
      res.end(videoBytes);
    }
  });
  await new Promise(r => boxAVideoServer.listen(0, '127.0.0.1', r));
  const boxAVideoPort = boxAVideoServer.address().port;

  const meshA = createAppMeshEngine({ configDir: boxADir, listenPort: 0 });
  const meshB = createAppMeshEngine({ configDir: boxBDir, listenPort: 0 });

  try {
    // Box B starts its gateway and HTTP 101 Upgrade bridge (simulating wss:// cross-network relay)
    await meshB.startGateway(0);
    const upgradePortB = await meshB.ensureUpgradeBridgeServer();
    const relayUrlB = `ws://127.0.0.1:${upgradePortB}`;

    // Box B generates a single robos-net:// token with its relay URL
    const inviteB = meshB.generateEnrollmentToken('127.0.0.1', relayUrlB);
    assert.ok(inviteB.privateNetToken.startsWith('robos-net://'));

    // Box A (on a completely separate network) joins Box B using only the single robos-net:// token!
    const joinRes = await meshA.joinPrivateNetwork(inviteB.privateNetToken, { reverseMux: true });
    assert.equal(joinRes.ok, true);
    assert.equal(joinRes.mutualEnrolled, true);
    assert.equal(joinRes.reverseMuxActive, true);

    // Wait briefly for reverse-mux registration on Box B
    await new Promise(r => setTimeout(r, 80));

    // Verify Box B automatically enrolled Box A AND sees an active reverse-mux session to Box A
    const peersOnB = meshB.listPeers();
    assert.equal(peersOnB.length, 1);
    const peerAOnB = peersOnB[0];
    assert.equal(peerAOnB.nodeId, meshA.identity.nodeId);
    assert.equal(peerAOnB.reverseMuxConnected, true);

    // Box B bridges Box A's video server port locally over the reverse-mux tunnel!
    const videoBridge = await meshB.startLocalBridgeTunnel({
      peerId: peerAOnB.id,
      remoteAppId: 'movie-player-stream',
      remotePort: boxAVideoPort,
      localPort: 0,
    });

    // Box B queries Box A's /api/tv-library?all=1 through the local bridge
    const catalog = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${videoBridge.localPort}/api/tv-library?all=1`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    assert.equal(catalog.items.length, 1);
    assert.equal(catalog.items[0].title, 'Frontier Hunters Live');

    // Box B streams a 64KB byte-range slice (HTTP 206) of the video from Box A over the reverse-mux mTLS tunnel
    const rangeRes = await new Promise((resolve, reject) => {
      http.get(catalog.items[0].streamUrl, {
        headers: { Range: 'bytes=0-65535' },
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
    assert.equal(rangeRes.statusCode, 206);
    assert.equal(rangeRes.body.length, 65536);
    assert.ok(rangeRes.body.equals(videoBytes.subarray(0, 65536)));
  } finally {
    await meshA.stopGateway();
    await meshB.stopGateway();
    boxAVideoServer.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

