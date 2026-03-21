'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Extract pure logic from workspace-manager/main.js for testing ────────────

function scanWorkspaces(rootDirs, maxDepth = 6) {
  const results = [];
  const visited = new Set();

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (visited.has(dir)) return;
    visited.add(dir);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.vscode' && e.name !== '.idea') continue;
      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        if (e.name === '.vscode' || e.name === '.idea') {
          const parent = dir;
          const stat = tryStat(parent);
          const wsType = e.name === '.vscode' ? 'vscode' : 'idea';
          results.push({
            path: parent,
            type: wsType,
            ide: wsType === 'vscode' ? 'VS Code / Cursor' : 'JetBrains',
            name: path.basename(parent),
            mtime: stat ? stat.mtimeMs : 0,
            configDir: full,
          });
        } else if (e.name !== 'node_modules' && e.name !== '.git') {
          walk(full, depth + 1);
        }
      }
    }
  }

  for (const root of rootDirs) {
    walk(root, 0);
  }

  const seen = new Set();
  const unique = [];
  for (const ws of results) {
    if (!seen.has(ws.path)) {
      seen.add(ws.path);
      unique.push(ws);
    }
  }

  return unique.sort((a, b) => b.mtime - a.mtime);
}

function tryStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function loadSettings(settingsFile) {
  try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); }
  catch { return {}; }
}

function saveSettings(settingsFile, data) {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
}

function loadWorkspaceConfig(settingsFile) {
  const s = loadSettings(settingsFile);
  return s.workspace_manager || { scan_roots: [], max_depth: 6 };
}

function saveWorkspaceConfig(settingsFile, config) {
  const s = loadSettings(settingsFile);
  s.workspace_manager = config;
  saveSettings(settingsFile, s);
}

function saveWorkspaceState(homeDir, wsPath, state) {
  const stateDir = path.join(homeDir, '.config', 'robos', 'workspace-states');
  fs.mkdirSync(stateDir, { recursive: true });
  const id = Buffer.from(wsPath).toString('base64url');
  const stateFile = path.join(stateDir, `${id}.json`);
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, path: wsPath, updated: Date.now() }, null, 2));
}

function loadWorkspaceState(homeDir, wsPath) {
  const stateDir = path.join(homeDir, '.config', 'robos', 'workspace-states');
  const id = Buffer.from(wsPath).toString('base64url');
  const stateFile = path.join(stateDir, `${id}.json`);
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return null; }
}

function listWorkspaceStates(homeDir) {
  const stateDir = path.join(homeDir, '.config', 'robos', 'workspace-states');
  try {
    return fs.readdirSync(stateDir)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf8')); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('workspace-manager unit tests', () => {
  describe('scanWorkspaces', () => {
    it('finds .vscode workspace', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      const proj = path.join(tmp, 'my-project');
      fs.mkdirSync(path.join(proj, '.vscode'), { recursive: true });
      fs.writeFileSync(path.join(proj, '.vscode', 'settings.json'), '{}');

      const results = scanWorkspaces([tmp]);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].path, proj);
      assert.strictEqual(results[0].type, 'vscode');
      assert.strictEqual(results[0].name, 'my-project');
      assert.strictEqual(results[0].ide, 'VS Code / Cursor');
      fs.rmSync(tmp, { recursive: true });
    });

    it('finds .idea workspace', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      const proj = path.join(tmp, 'java-app');
      fs.mkdirSync(path.join(proj, '.idea'), { recursive: true });

      const results = scanWorkspaces([tmp]);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'idea');
      assert.strictEqual(results[0].ide, 'JetBrains');
      fs.rmSync(tmp, { recursive: true });
    });

    it('returns empty for dir with no workspaces', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      fs.mkdirSync(path.join(tmp, 'just-a-dir'));

      const results = scanWorkspaces([tmp]);
      assert.strictEqual(results.length, 0);
      fs.rmSync(tmp, { recursive: true });
    });

    it('returns empty for nonexistent dir', () => {
      const results = scanWorkspaces(['/tmp/nonexistent-' + Date.now()]);
      assert.strictEqual(results.length, 0);
    });

    it('deduplicates workspaces with both .vscode and .idea', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      const proj = path.join(tmp, 'dual-project');
      fs.mkdirSync(path.join(proj, '.vscode'), { recursive: true });
      fs.mkdirSync(path.join(proj, '.idea'), { recursive: true });

      const results = scanWorkspaces([tmp]);
      // Should find both entries since they are different types, but deduplicated by path
      // The first one found wins
      assert.strictEqual(results.length, 1);
      fs.rmSync(tmp, { recursive: true });
    });

    it('respects maxDepth', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      // Create deeply nested workspace
      const deep = path.join(tmp, 'a', 'b', 'c', 'project');
      fs.mkdirSync(path.join(deep, '.vscode'), { recursive: true });

      const shallow = scanWorkspaces([tmp], 2);
      assert.strictEqual(shallow.length, 0);

      const deeper = scanWorkspaces([tmp], 5);
      assert.strictEqual(deeper.length, 1);
      fs.rmSync(tmp, { recursive: true });
    });

    it('skips node_modules directories', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      fs.mkdirSync(path.join(tmp, 'node_modules', 'pkg', '.vscode'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'real-project', '.vscode'), { recursive: true });

      const results = scanWorkspaces([tmp]);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].name, 'real-project');
      fs.rmSync(tmp, { recursive: true });
    });
  });

  describe('workspace config', () => {
    it('loadWorkspaceConfig: returns defaults when no settings', () => {
      const result = loadWorkspaceConfig('/tmp/nonexistent-' + Date.now());
      assert.deepStrictEqual(result, { scan_roots: [], max_depth: 6 });
    });

    it('saveWorkspaceConfig: persists config and preserves other settings', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      const settingsFile = path.join(tmp, 'settings.json');
      fs.writeFileSync(settingsFile, JSON.stringify({ myProfileUid: 'testuser' }));

      saveWorkspaceConfig(settingsFile, { scan_roots: ['/home/dev'], max_depth: 4 });

      const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      assert.strictEqual(data.myProfileUid, 'testuser', 'other settings preserved');
      assert.deepStrictEqual(data.workspace_manager.scan_roots, ['/home/dev']);
      assert.strictEqual(data.workspace_manager.max_depth, 4);
      fs.rmSync(tmp, { recursive: true });
    });

    it('saveWorkspaceConfig: creates settings file if missing', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      const settingsFile = path.join(tmp, 'new', 'settings.json');

      saveWorkspaceConfig(settingsFile, { scan_roots: ['/opt'], max_depth: 3 });

      assert.ok(fs.existsSync(settingsFile));
      const config = loadWorkspaceConfig(settingsFile);
      assert.deepStrictEqual(config.scan_roots, ['/opt']);
      fs.rmSync(tmp, { recursive: true });
    });
  });

  describe('workspace state', () => {
    it('saves and loads workspace state', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      const wsPath = '/home/dev/my-project';

      saveWorkspaceState(tmp, wsPath, { branch: 'feature-1', openFiles: ['src/app.js'] });
      const state = loadWorkspaceState(tmp, wsPath);

      assert.ok(state);
      assert.strictEqual(state.branch, 'feature-1');
      assert.deepStrictEqual(state.openFiles, ['src/app.js']);
      assert.strictEqual(state.path, wsPath);
      assert.ok(state.updated > 0);
      fs.rmSync(tmp, { recursive: true });
    });

    it('loadWorkspaceState: returns null for unknown workspace', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));
      const state = loadWorkspaceState(tmp, '/no/such/workspace');
      assert.strictEqual(state, null);
      fs.rmSync(tmp, { recursive: true });
    });

    it('listWorkspaceStates: lists all saved states', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-test-'));

      saveWorkspaceState(tmp, '/proj/alpha', { branch: 'main' });
      saveWorkspaceState(tmp, '/proj/beta', { branch: 'develop' });

      const states = listWorkspaceStates(tmp);
      assert.strictEqual(states.length, 2);
      const paths = states.map(s => s.path).sort();
      assert.deepStrictEqual(paths, ['/proj/alpha', '/proj/beta']);
      fs.rmSync(tmp, { recursive: true });
    });

    it('listWorkspaceStates: returns empty for nonexistent dir', () => {
      const states = listWorkspaceStates('/tmp/nonexistent-' + Date.now());
      assert.deepStrictEqual(states, []);
    });
  });
});
