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
