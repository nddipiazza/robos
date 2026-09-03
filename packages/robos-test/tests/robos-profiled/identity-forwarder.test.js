'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { IdentityForwarder } = require('../../../robos-profiled/identity-forwarder');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Host Identity & Credential Forwarding Tests with In-Depth Assertions', () => {
  it('IdentityForwarder forwards SSH/GPG sockets, injects git author, propagates AI tokens, and leaves private keys isolated', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ident-unit-'));
    fs.writeFileSync(path.join(tmpHome, '.bashrc'), '# Baseline bashrc\n');

    const hostMockHome = fs.mkdtempSync(path.join(os.tmpdir(), 'host-mock-home-'));
    fs.writeFileSync(path.join(hostMockHome, '.gitconfig'), '[user]\n\tname = Jane Developer\n\temail = jane@example.com\n');
    // Create dummy private key in host home to prove it is NEVER copied
    fs.mkdirSync(path.join(hostMockHome, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(hostMockHome, '.ssh', 'id_ed25519'), '-----BEGIN OPENSSH PRIVATE KEY-----');

    const forwarder = new IdentityForwarder({ hostHome: hostMockHome, hostUid: 1000 });
    const res = forwarder.forwardIdentity(tmpHome, 17001, { env: { ANTHROPIC_API_KEY: 'sk-ant-test-key-001' } });

    assert.strictEqual(res.sshForwarded, true);
    assert.strictEqual(res.gitConfigured, true);
    assert.ok(res.gitAuthor.includes('Jane Developer'));
    assert.ok(res.apiTokensInjected.includes('ANTHROPIC_API_KEY'));

    // Assert files in agent home
    assert.ok(fs.existsSync(path.join(tmpHome, '.gitconfig')), '.gitconfig must exist');
    assert.ok(fs.existsSync(path.join(tmpHome, '.ssh-auth-sock')), '.ssh-auth-sock must exist');
    assert.strictEqual(fs.existsSync(path.join(tmpHome, '.ssh', 'id_ed25519')), false, 'Private keys must NEVER be copied into agent home');

    const bashrc = fs.readFileSync(path.join(tmpHome, '.bashrc'), 'utf8');
    assert.ok(bashrc.includes('SSH_AUTH_SOCK='), 'Agent bashrc must export SSH_AUTH_SOCK');
    assert.ok(bashrc.includes('ANTHROPIC_API_KEY='), 'Agent bashrc must export ANTHROPIC_API_KEY');

    const cleanRes = forwarder.cleanupIdentity(tmpHome);
    assert.strictEqual(cleanRes.ok, true);
    assert.strictEqual(fs.existsSync(path.join(tmpHome, '.ssh-auth-sock')), false, 'SSH socket must be unlinked');

    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(hostMockHome, { recursive: true, force: true });
  });

  it('launches Profile Daemon, provisions git agent, inspects identity/credentials, and terminates session', async () => {
    const app = await launchApp('robos-profiled', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-profiled debug port should be allocated');

      // Provision git reviewer profile
      const spawnRes = await evalJS(app.port, `window.spawnProfile('git-reviewer', { role: 'Code Reviewer' })`);
      assert.strictEqual(spawnRes.ok, true, 'spawnProfile should succeed');

      await new Promise(r => setTimeout(r, 400));

      // Inspect details
      const inspectDetails = await evalJS(app.port, `document.getElementById('inspect-details').textContent`);
      assert.ok(inspectDetails.includes('SSH Agent'), 'Must render SSH Agent row');
      assert.ok(inspectDetails.includes('Git Author'), 'Must render Git Author row');
      assert.ok(inspectDetails.includes('GPG Agent'), 'Must render GPG Agent row');
      assert.ok(inspectDetails.includes('AI Tokens'), 'Must render AI Tokens row');

      // Terminate profile
      await evalJS(app.port, `window.terminateProfile('my-agent-git-reviewer')`);
      await new Promise(r => setTimeout(r, 400));

      const isTerminated = await evalJS(app.port, `document.getElementById('card-my-agent-git-reviewer').classList.contains('terminated')`);
      assert.strictEqual(isTerminated, true, 'Card must reflect terminated status');
    } finally {
      await killApp(app);
    }
  });
});
