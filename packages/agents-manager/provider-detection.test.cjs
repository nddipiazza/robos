'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the registered IPC handler so a provider wired to the wrong detector
// cannot pass just because each individual detector works in isolation.
function detectionHandler(installed) {
  const handlers = new Map();
  const electron = {
    app: {
      setName() {}, setPath() {}, requestSingleInstanceLock: () => true,
      on() {}, commandLine: { appendSwitch() {} }, whenReady: () => ({ then() {} }),
    },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} },
  };
  const cp = {
    exec(command, options, callback) {
      const output = command === 'claude --version' ? '2.1.0 (Claude Code)'
        : command === 'claude auth status' ? JSON.stringify({ loggedIn: true, account: { emailAddress: 'test@example.com' } })
        : command === 'codex --version' ? 'codex-cli 1.0.0' : 'Logged in';
      callback(installed ? null : { code: 127 }, installed ? output : '', installed ? '' : 'not found');
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8'), {
    require(id) {
      if (id === 'electron') return electron;
      if (id === 'child_process') return cp;
      if (id === './copilot-auth') return { detect: async () => ({
        id: 'github-copilot', name: 'GitHub Copilot', installed, authenticated: installed,
      }) };
      if (id.includes('dom-snapshot')) throw Error('No debug server in test');
      return require(id);
    },
    __dirname, process, console, setTimeout, clearTimeout, setInterval, clearInterval,
  });
  return handlers.get('detect-providers');
}

for (const installed of [true, false]) {
  test(`provider catalogue keeps Copilot and Claude distinct when installed=${installed}`, async () => {
    const providers = await detectionHandler(installed)();
    assert.equal(new Set(providers.map(p => p.id)).size, providers.length);
    for (const id of ['github-copilot', 'claude-code']) {
      const provider = providers.find(p => p.id === id);
      assert.ok(provider, `${id} must remain visible`);
      assert.equal(provider.installed, installed);
      assert.equal(provider.authenticated, installed);
    }
    if (installed) assert.equal(providers.find(p => p.id === 'claude-code').user, 'test@example.com');
  });
}
