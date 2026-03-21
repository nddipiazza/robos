'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Extract pure logic from task-servers/main.js for testing ─────────────────

function loadSettings(settingsFile) {
  try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); }
  catch { return {}; }
}

function saveSettings(settingsFile, data) {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
}

function loadTaskServers(settingsFile) {
  const s = loadSettings(settingsFile);
  return s.task_servers || [];
}

function saveTaskServers(settingsFile, servers) {
  const s = loadSettings(settingsFile);
  s.task_servers = servers;
  saveSettings(settingsFile, s);
}

function walkPassStore(storeDir) {
  try {
    const entries = [];
    function walk(dir, prefix) {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
          walk(full, prefix ? `${prefix}/${name}` : name);
        } else if (name.endsWith('.gpg')) {
          entries.push(prefix ? `${prefix}/${name.slice(0, -4)}` : name.slice(0, -4));
        }
      }
    }
    walk(storeDir, '');
    return entries.sort();
  } catch { return []; }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('task-servers unit tests', () => {
  it('loadTaskServers: returns empty array when no settings', () => {
    const result = loadTaskServers('/tmp/nonexistent-' + Date.now());
    assert.deepStrictEqual(result, []);
  });

  it('loadTaskServers: reads servers from settings file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-test-'));
    const settingsFile = path.join(tmp, '.config', 'robos', 'settings.json');
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify({
      task_servers: [
        { id: 'gh-1', type: 'github', name: 'My GitHub' },
        { id: 'jira-1', type: 'jira', name: 'My Jira' },
      ]
    }));

    const servers = loadTaskServers(settingsFile);
    assert.strictEqual(servers.length, 2);
    assert.strictEqual(servers[0].type, 'github');
    assert.strictEqual(servers[1].name, 'My Jira');
    fs.rmSync(tmp, { recursive: true });
  });

  it('saveTaskServers: persists servers and preserves other settings', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-test-'));
    const settingsFile = path.join(tmp, '.config', 'robos', 'settings.json');
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify({ myProfileUid: 'testuser' }));

    saveTaskServers(settingsFile, [{ id: 'gh-1', type: 'github' }]);

    const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.strictEqual(data.myProfileUid, 'testuser', 'other settings preserved');
    assert.strictEqual(data.task_servers.length, 1);
    assert.strictEqual(data.task_servers[0].id, 'gh-1');
    fs.rmSync(tmp, { recursive: true });
  });

  it('saveTaskServers: creates settings file if it does not exist', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-test-'));
    const settingsFile = path.join(tmp, 'new', 'settings.json');

    saveTaskServers(settingsFile, [{ id: 'j-1', type: 'jira' }]);

    assert.ok(fs.existsSync(settingsFile));
    const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.strictEqual(data.task_servers[0].type, 'jira');
    fs.rmSync(tmp, { recursive: true });
  });

  it('walkPassStore: lists gpg entries from store', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-test-'));
    fs.writeFileSync(path.join(tmp, '.gpg-id'), 'test@test.com');
    fs.writeFileSync(path.join(tmp, 'github-token.gpg'), 'enc');
    fs.mkdirSync(path.join(tmp, 'work'));
    fs.writeFileSync(path.join(tmp, 'work', 'jira-token.gpg'), 'enc');

    const entries = walkPassStore(tmp);
    assert.deepStrictEqual(entries, ['github-token', 'work/jira-token']);
    fs.rmSync(tmp, { recursive: true });
  });

  it('walkPassStore: returns empty for nonexistent dir', () => {
    assert.deepStrictEqual(walkPassStore('/tmp/nonexistent-' + Date.now()), []);
  });

  it('walkPassStore: skips non-.gpg files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-test-'));
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'text');
    fs.writeFileSync(path.join(tmp, 'secret.gpg'), 'enc');

    const entries = walkPassStore(tmp);
    assert.deepStrictEqual(entries, ['secret']);
    fs.rmSync(tmp, { recursive: true });
  });
});
