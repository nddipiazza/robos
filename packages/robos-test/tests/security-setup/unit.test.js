'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Extract pure logic from security-setup/main.js ───────────────────────────

function parseGpgKeysFromColons(output) {
  const keys = [];
  let curFpr = '';
  for (const line of output.split('\n')) {
    const parts = line.split(':');
    if (parts[0] === 'fpr') curFpr = parts[9];
    if (parts[0] === 'uid') {
      keys.push({ id: curFpr, label: parts[9] || curFpr });
    }
  }
  return keys;
}

function parseGpgUids(output) {
  const uids = output.split('\n').filter(l => l.startsWith('uid:'));
  return uids.map(l => {
    const parts = l.split(':');
    return parts[9] || parts[7] || '';
  }).filter(Boolean);
}

function checkPinentryConfigured(agentConf) {
  try {
    return agentConf.includes('pinentry-program');
  } catch {
    return false;
  }
}

function checkSshKey(home) {
  const sshDir = path.join(home, '.ssh');
  const files = ['id_ed25519', 'id_ecdsa', 'id_rsa'];
  return files.find(f => fs.existsSync(path.join(sshDir, f))) || null;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('security-setup unit tests', () => {
  it('parseGpgKeysFromColons: extracts key fingerprints and UIDs', () => {
    const output = [
      'pub:u:4096:1:ABC123:1711000000:::-:::scESC:',
      'fpr:::::::::ABCDEF1234567890ABCDEF1234567890ABC123DEF456:',
      'uid:u::::1711000000::0::Jane Dev <jane@example.com>:',
      'sub:u:4096:1:789:1711000000::::::e:',
      'fpr:::::::::789012345678ABCDEF:',
    ].join('\n');

    const keys = parseGpgKeysFromColons(output);
    assert.strictEqual(keys.length, 1);
    assert.strictEqual(keys[0].id, 'ABCDEF1234567890ABCDEF1234567890ABC123DEF456');
    assert.strictEqual(keys[0].label, 'Jane Dev <jane@example.com>');
  });

  it('parseGpgKeysFromColons: returns empty for no keys', () => {
    assert.deepStrictEqual(parseGpgKeysFromColons(''), []);
  });

  it('parseGpgUids: extracts UIDs from colons format', () => {
    const output = 'uid:u::::1711000000::0::Bob <bob@test.com>:\nuid:u::::1711000000::0::Alice <alice@test.com>:';
    const uids = parseGpgUids(output);
    assert.strictEqual(uids.length, 2);
    assert.ok(uids[0].includes('Bob'));
    assert.ok(uids[1].includes('Alice'));
  });

  it('checkPinentryConfigured: detects pinentry in config', () => {
    assert.strictEqual(checkPinentryConfigured('pinentry-program /usr/bin/pinentry-gtk-2\ndefault-cache-ttl 86400'), true);
  });

  it('checkPinentryConfigured: returns false for empty/missing config', () => {
    assert.strictEqual(checkPinentryConfigured(''), false);
    assert.strictEqual(checkPinentryConfigured('default-cache-ttl 86400'), false);
  });

  it('checkSshKey: finds id_ed25519', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-test-'));
    const sshDir = path.join(tmp, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_ed25519'), 'key', { mode: 0o600 });

    assert.strictEqual(checkSshKey(tmp), 'id_ed25519');
    fs.rmSync(tmp, { recursive: true });
  });

  it('checkSshKey: returns null when no key', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-test-'));
    fs.mkdirSync(path.join(tmp, '.ssh'));
    assert.strictEqual(checkSshKey(tmp), null);
    fs.rmSync(tmp, { recursive: true });
  });
});
