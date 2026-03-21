'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Extract pure logic from main.js for testing ─────────────────────────────
// These mirror the functions in git-login-manager/main.js

const SSH_DIR_TEST = (home) => path.join(home, '.ssh');
const KEY_FILES = ['id_ed25519', 'id_ecdsa', 'id_rsa'];

function checkSshKeyWith(home) {
  const sshDir = SSH_DIR_TEST(home);
  const found = KEY_FILES.find(f => fs.existsSync(path.join(sshDir, f)));
  return {
    ok: !!found,
    label: 'SSH key exists',
    detail: found ? `~/.ssh/${found}` : `No key found (${KEY_FILES.join(', ')})`,
    keyFile: found || null,
  };
}

function parseGhAuthOutput(output) {
  // Must match "Logged in to" specifically — "not logged in" should NOT match
  const ok = /logged in to/i.test(output);
  const match = output.match(/account\s+(\S+)/i) || output.match(/logged in to \S+ account (\S+)/i);
  const user = match ? match[1] : null;
  return { ok, username: user };
}

function parseSshConnectionOutput(stderr) {
  return stderr.includes('successfully authenticated');
}

function checkGitConfigWith(home) {
  const gitcfgPath = path.join(home, '.gitconfig');
  let name = null, email = null;
  try {
    const content = fs.readFileSync(gitcfgPath, 'utf8');
    const nameMatch = content.match(/name\s*=\s*(.+)/);
    const emailMatch = content.match(/email\s*=\s*(.+)/);
    name = nameMatch ? nameMatch[1].trim() : null;
    email = emailMatch ? emailMatch[1].trim() : null;
  } catch {}
  const ok = !!(name && email);
  return { ok, name: name || '', email: email || '' };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('git-login-manager unit tests', () => {
  let tmpDir;

  it('checkSshKey: returns ok when id_ed25519 exists', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glm-test-'));
    const sshDir = path.join(tmpDir, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_ed25519'), 'fake-key', { mode: 0o600 });

    const result = checkSshKeyWith(tmpDir);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.keyFile, 'id_ed25519');
    assert.ok(result.detail.includes('id_ed25519'));
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('checkSshKey: returns ok when id_rsa exists (fallback)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glm-test-'));
    const sshDir = path.join(tmpDir, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_rsa'), 'fake-key', { mode: 0o600 });

    const result = checkSshKeyWith(tmpDir);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.keyFile, 'id_rsa');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('checkSshKey: returns not ok when no key exists', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glm-test-'));
    fs.mkdirSync(path.join(tmpDir, '.ssh'));

    const result = checkSshKeyWith(tmpDir);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.keyFile, null);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('parseGhAuthOutput: parses logged-in output', () => {
    const output = 'github.com\n  ✓ Logged in to github.com account testuser (/home/robos/.config/gh/hosts.yml)';
    const result = parseGhAuthOutput(output);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.username, 'testuser');
  });

  it('parseGhAuthOutput: detects not authenticated', () => {
    const output = 'You are not logged into any GitHub hosts. Run gh auth login to authenticate.';
    const result = parseGhAuthOutput(output);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.username, null);
  });

  it('parseSshConnectionOutput: detects successful auth', () => {
    assert.strictEqual(parseSshConnectionOutput('Hi testuser! You\'ve successfully authenticated'), true);
  });

  it('parseSshConnectionOutput: detects permission denied', () => {
    assert.strictEqual(parseSshConnectionOutput('Permission denied (publickey).'), false);
  });

  it('checkGitConfig: reads name and email from .gitconfig', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glm-test-'));
    fs.writeFileSync(path.join(tmpDir, '.gitconfig'), '[user]\n\tname = Jane Doe\n\temail = jane@example.com\n');

    const result = checkGitConfigWith(tmpDir);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.name, 'Jane Doe');
    assert.strictEqual(result.email, 'jane@example.com');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('checkGitConfig: fails when .gitconfig missing', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glm-test-'));
    const result = checkGitConfigWith(tmpDir);
    assert.strictEqual(result.ok, false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
