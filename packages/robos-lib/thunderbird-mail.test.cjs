'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const tbMail = require('./thunderbird-mail');
const tbGoogle = require('./thunderbird-google');

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-tb-mail-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { homeDir: home, configDir: path.join(home, '.config', 'robos') };
}

function uniqueSocket(home) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\robos-tb-bridge-test-${process.pid}-${Date.now()}`
    : path.join(home, 'bridge.sock');
}

/** Starts host.cjs and plays Thunderbird on its stdin/stdout with the given handler. */
function startHost(t, home, onRequest) {
  const socket = uniqueSocket(home);
  const child = spawn(process.execPath, [path.join(__dirname, 'thunderbird-bridge', 'host.cjs')], {
    env: { ...process.env, ROBOS_TB_BRIDGE_SOCKET: socket, HOME: home, USERPROFILE: home },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  t.after(() => child.kill());
  let buf = Buffer.alloc(0);
  child.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
      const len = buf.readUInt32LE(0);
      const msg = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
      buf = buf.subarray(4 + len);
      const reply = Buffer.from(JSON.stringify({ id: msg.id, ...onRequest(msg) }));
      const header = Buffer.alloc(4);
      header.writeUInt32LE(reply.length, 0);
      child.stdin.write(Buffer.concat([header, reply]));
    }
  });
  return { child, socket };
}

test('native host relays tool requests to Thunderbird and replies back', async (t) => {
  const env = tempHome(t);
  const seen = [];
  const { socket } = startHost(t, env.homeDir, (msg) => {
    seen.push(msg);
    if (msg.action === 'ping') return { ok: true, result: { bridge: '1.0.0', thunderbird: '159.0' } };
    if (msg.action === 'send') return { ok: true, result: { mode: 'sendNow', headerMessageId: 'abc@robos', from: 'me@example.com', sentCopies: [] } };
    return { ok: false, error: 'nope' };
  });
  const ping = await tbMail.waitForBridge({ socketPath: socket, waitMs: 10000 });
  assert.equal(ping.thunderbird, '159.0');

  const sent = await tbMail.sendEmail({ to: 'a@example.com, b@example.com', subject: 'Hi', text: 'Body' }, { socketPath: socket, launch: false });
  assert.equal(sent.headerMessageId, 'abc@robos');
  const sendReq = seen.find((m) => m.action === 'send');
  assert.deepEqual(sendReq.to, ['a@example.com', 'b@example.com']);
  assert.equal(sendReq.text, 'Body');
  assert.equal(sendReq.mode, 'sendNow');

  // The log records the action, never the message content.
  const log = fs.readFileSync(path.join(env.homeDir, '.config', 'robos', 'logs', 'thunderbird-bridge.log'), 'utf8');
  assert.match(log, /request send to=2 recipient/);
  assert.doesNotMatch(log, /a@example\.com|Body/);
});

test('send errors from Thunderbird surface to the caller', async (t) => {
  const env = tempHome(t);
  const { socket } = startHost(t, env.homeDir, (msg) => (msg.action === 'ping'
    ? { ok: true, result: {} }
    : { ok: false, error: 'SMTP authentication failed' }));
  await tbMail.waitForBridge({ socketPath: socket, waitMs: 10000 });
  await assert.rejects(tbMail.sendEmail({ to: 'a@example.com', subject: 'x' }, { socketPath: socket, launch: false }), /SMTP authentication failed/);
});

test('sendEmail validates recipients and reports a missing bridge', async (t) => {
  const env = tempHome(t);
  await assert.rejects(tbMail.sendEmail({ subject: 'x' }), /recipient/);
  await assert.rejects(
    tbMail.sendEmail({ to: 'a@example.com', subject: 'x' }, { socketPath: uniqueSocket(env.homeDir), launch: false }),
    (err) => err.code === 'BRIDGE_UNAVAILABLE',
  );
});

test('installBridge sideloads the add-on into each profile and registers the native host', (t) => {
  const env = tempHome(t);
  const opts = { ...env, platform: 'linux', mockBinaryPath: null, nodePath: '/usr/bin/node' };
  const res = tbMail.installBridge(opts);
  assert.ok(fs.existsSync(path.join(res.extensionDir, 'manifest.json')));
  const manifest = JSON.parse(fs.readFileSync(res.nativeManifest, 'utf8'));
  assert.equal(manifest.name, tbMail.NATIVE_HOST_NAME);
  assert.deepEqual(manifest.allowed_extensions, [tbMail.BRIDGE_ADDON_ID]);
  assert.match(fs.readFileSync(manifest.path, 'utf8'), /exec '\/usr\/bin\/node' '.*host\.cjs'/);
  assert.ok(res.registered.every((p) => fs.existsSync(p)));

  const [profile] = res.profiles;
  assert.equal(fs.readFileSync(profile.proxyFile, 'utf8').trim(), res.extensionDir);
  const userJs = fs.readFileSync(path.join(profile.profilePath, 'user.js'), 'utf8');
  assert.match(userJs, /extensions\.startupScanScopes", 5/);
  // The user approves the sideloaded add-on in Thunderbird; RobOS does not bypass that prompt.
  assert.doesNotMatch(userJs, /autoDisableScopes|signatures\.required/);

  tbMail.installBridge(opts);
  const again = fs.readFileSync(path.join(profile.profilePath, 'user.js'), 'utf8');
  assert.equal(again.split(tbGoogle.ROBOS_BLOCK_START).length - 1, 1, 'idempotent');
});

test('Windows launcher runs Electron as Node and escapes percent signs', () => {
  const l = tbMail.hostLauncher('C:\\cfg\\thunderbird-bridge', { platform: 'win32', nodePath: 'C:\\100%\\node.exe' });
  assert.ok(l.file.endsWith('host.cmd'));
  assert.match(l.content, /^@echo off\r\n"C:\\100%%\\node\.exe" ".*host\.cjs" %\*\r\n$/);
});

test('CLI argument parsing supports repeated and comma-separated recipients', () => {
  const a = tbMail.parseArgs(['send', '--to', 'a@x.com', '--to', 'b@x.com', '--subject', 'S', '--send-later']);
  assert.deepEqual(a.to, ['a@x.com', 'b@x.com']);
  assert.equal(a.subject, 'S');
  assert.equal(a['send-later'], true);
});
