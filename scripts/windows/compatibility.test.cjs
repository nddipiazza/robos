const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { localIpcPath } = require('../../packages/robos-lib/local-ipc-path');

test('IPC endpoints preserve Unix sockets and isolate Windows users', () => {
  assert.equal(localIpcPath('agentd', '/tmp/agentd.sock', { platform: 'linux' }), '/tmp/agentd.sock');
  const a = localIpcPath('agentd', '', { platform: 'win32', home: 'C:\\Users\\Alice' });
  assert.match(a, /^\\\\\.\\pipe\\robos-agentd-[a-f0-9]{16}$/);
  assert.equal(a, localIpcPath('agentd', '', { platform: 'win32', home: 'c:\\users\\alice' }));
  assert.notEqual(a, localIpcPath('agentd', '', { platform: 'win32', home: 'C:\\Users\\Bob' }));
  assert.notEqual(a, localIpcPath('profiled', '', { platform: 'win32', home: 'C:\\Users\\Alice' }));
});

test('browser icon registry matches the canonical app registry', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../packages/robos-icons/builtin-apps-browser.js'), 'utf8'), context);
  assert.equal(JSON.stringify(context.window.ROBOS_BUILTIN_APPS), JSON.stringify(require('../../packages/robos-icons').getAllIcons()));
});

test('bundled game course contains standalone HTML, not Jekyll templates', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../packages/crpg-game-builder-elearning/renderer/course.html'), 'utf8');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(!html.includes('| relative_url }}'));
  assert.match(html, /Game Builder/);
});

test('unconfigured Codex sessions do not require Python', () => {
  const missing = path.join(__dirname, 'nonexistent-codex-home');
  assert.deepEqual(require('../../packages/agents-manager/codex-sessions').list('', { root: missing }), []);
});
