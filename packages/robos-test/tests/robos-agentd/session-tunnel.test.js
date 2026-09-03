'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { SessionTunnel } = require('../../../robos-agentd/session-tunnel');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Sub-Agent Credential & Socket Tunneling Tests with In-Depth Assertions', () => {
  it('SessionTunnel forwards SSH/GPG sockets, inherits git author, injects API tokens, and guarantees private key isolation', () => {
    const tmpAgentHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-unit-agent-'));
    fs.writeFileSync(path.join(tmpAgentHome, '.bashrc'), '# Baseline bashrc\n');

    const mockHostHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-unit-host-'));
    fs.writeFileSync(path.join(mockHostHome, '.gitconfig'), '[user]\n\tname = Alice Architect\n\temail = alice@corp.local\n');

    // Create private SSH key in host home to verify it is NEVER copied
    fs.mkdirSync(path.join(mockHostHome, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(mockHostHome, '.ssh', 'id_ed25519'), '-----BEGIN OPENSSH PRIVATE KEY-----');

    const tunnel = new SessionTunnel({ hostHome: mockHostHome, hostUid: 1000 });
    const res = tunnel.tunnelSession(tmpAgentHome, 22001, { env: { ANTHROPIC_API_KEY: 'sk-ant-test-999' } });

    assert.strictEqual(res.sshTunneled, true);
    assert.strictEqual(res.gitConfigured, true);
    assert.ok(res.gitAuthor.includes('Alice Architect'));
    assert.ok(res.apiTokensInjected.includes('ANTHROPIC_API_KEY'));

    // Assert files in agent home
    assert.ok(fs.existsSync(path.join(tmpAgentHome, '.gitconfig')), '.gitconfig must exist in agent home');
    assert.ok(fs.existsSync(path.join(tmpAgentHome, '.ssh-auth-sock')), '.ssh-auth-sock must exist');
    assert.strictEqual(fs.existsSync(path.join(tmpAgentHome, '.ssh', 'id_ed25519')), false, 'Private keys must NEVER be copied');

    const bashrc = fs.readFileSync(path.join(tmpAgentHome, '.bashrc'), 'utf8');
    assert.ok(bashrc.includes('SSH_AUTH_SOCK='), 'Bashrc must export SSH_AUTH_SOCK');
    assert.ok(bashrc.includes('ANTHROPIC_API_KEY='), 'Bashrc must export ANTHROPIC_API_KEY');

    // Test cleanup
    const cleanRes = tunnel.cleanupTunnel(tmpAgentHome);
    assert.strictEqual(cleanRes.ok, true);
    assert.strictEqual(fs.existsSync(path.join(tmpAgentHome, '.ssh-auth-sock')), false, 'SSH socket must be unlinked');

    fs.rmSync(tmpAgentHome, { recursive: true, force: true });
    fs.rmSync(mockHostHome, { recursive: true, force: true });
  });

  it('launches Desktop Agents Manager, provisions agent session, verifies tunneled credentials in drawer, and terminates', async () => {
    const app = await launchApp('robos-agentd', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-agentd debug port should be allocated');

      // 1. Spawn sub-agent
      const spawnRes = await evalJS(app.port, `window.spawnAgent('task-tunnel-e2e', { role: 'Lead Architect Agent' })`);
      assert.strictEqual(spawnRes.ok, true);

      await new Promise(r => setTimeout(r, 400));

      // 2. Inspect Details
      const inspectDetails = await evalJS(app.port, `document.getElementById('inspect-details').textContent`);
      assert.ok(inspectDetails.includes('SSH Socket'), 'Inspect drawer must render SSH Socket row');
      assert.ok(inspectDetails.includes('Git Author'), 'Inspect drawer must render Git Author row');
      assert.ok(inspectDetails.includes('GPG Agent'), 'Inspect drawer must render GPG Agent row');
      assert.ok(inspectDetails.includes('AI Tokens'), 'Inspect drawer must render AI Tokens row');

      // 3. Terminate agent
      await evalJS(app.port, `window.terminateAgent('task-tunnel-e2e')`);
      await new Promise(r => setTimeout(r, 400));

      const isTerminated = await evalJS(app.port, `document.getElementById('card-agent-task-tunnel-e2e').classList.contains('terminated')`);
      assert.strictEqual(isTerminated, true, 'Card must reflect terminated state');
    } finally {
      await killApp(app);
    }
  });
});
