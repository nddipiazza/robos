'use strict';

/**
 * RobOS Thunderbird Mail (`robos-lib/thunderbird-mail`)
 *
 * Sends mail through Mozilla Thunderbird with Thunderbird's own MailExtension API
 * (`messenger.compose.beginNew` + `messenger.compose.sendMessage`). Thunderbird has no
 * out-of-process SDK, so RobOS installs a small bridge:
 *
 *   RobOS tool ──JSON line──▶ local pipe/socket ──▶ native messaging host ──▶ RobOS Bridge add-on
 *   (this module)              (per OS user)        (thunderbird-bridge/host.cjs)   (compose API)
 *
 * The add-on sends with the identity's configured SMTP server and OAuth2 sign-in (set up by
 * `robos-lib/thunderbird-google`), and Thunderbird files the sent copy as usual.
 *
 * CLI:
 *   node packages/robos-lib/thunderbird-mail.js install
 *   node packages/robos-lib/thunderbird-mail.js status
 *   node packages/robos-lib/thunderbird-mail.js send --to a@x.com [--cc ..] [--bcc ..] [--from me@x.com]
 *        --subject "Hi" (--body "text" | --body-file note.txt | --html "<p>hi</p>" | --html-file x.html)
 *        [--attach file.pdf ...]
 */

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const tbGoogle = require('./thunderbird-google');

const BRIDGE_ADDON_ID = 'robos-bridge@robos.dev';
const NATIVE_HOST_NAME = 'robos_thunderbird_bridge';
const SOURCE_DIR = path.join(__dirname, 'thunderbird-bridge');
const PREFS_LABEL = 'robos-thunderbird-bridge';

function getHomeDir(options = {}) {
  return options.homeDir || process.env.HOME || os.homedir();
}

function getPlatform(options = {}) {
  return options.platform || process.platform;
}

function getBridgeDir(options = {}) {
  const configDir = options.configDir || path.join(getHomeDir(options), '.config', 'robos');
  return path.join(configDir, 'thunderbird-bridge');
}

function socketPath(options = {}) {
  if (options.socketPath) return options.socketPath;
  if (process.env.ROBOS_TB_BRIDGE_SOCKET) return process.env.ROBOS_TB_BRIDGE_SOCKET;
  if (getPlatform(options) === 'win32') return `\\\\.\\pipe\\robos-thunderbird-bridge-${os.userInfo().username}`;
  return path.join(os.homedir(), '.config', 'robos', 'thunderbird-bridge.sock');
}

/** Directories Thunderbird reads native messaging host manifests from (non-Windows). */
function nativeManifestDirs(options = {}) {
  const home = getHomeDir(options);
  if (getPlatform(options) === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts')];
  }
  return [
    path.join(home, '.mozilla', 'native-messaging-hosts'),
    path.join(home, '.thunderbird', 'native-messaging-hosts'),
  ];
}

function bridgeUserJsBlock() {
  return [
    `${tbGoogle.ROBOS_BLOCK_START} (${PREFS_LABEL})`,
    '// RobOS Thunderbird Bridge add-on (sideloaded from the profile extensions folder).',
    // Scan the profile folder at startup so the bridge is found (default 4 = app folder only).
    // Sideloaded add-ons stay disabled until the user enables them in Thunderbird
    // (extensions.autoDisableScopes is left at its default).
    'user_pref("extensions.startupScanScopes", 5);',
    `${tbGoogle.ROBOS_BLOCK_END} (${PREFS_LABEL})`,
  ].join('\n');
}

/** The program Thunderbird launches: Node, or Electron running as Node inside RobOS apps. */
function hostLauncher(bridgeDir, options = {}) {
  const exe = options.nodePath || process.execPath;
  const electron = !options.nodePath && Boolean(process.versions.electron);
  const host = path.join(bridgeDir, 'host.cjs');
  if (getPlatform(options) === 'win32') {
    const file = path.join(bridgeDir, 'host.cmd');
    const lines = ['@echo off'];
    if (electron) lines.push('set ELECTRON_RUN_AS_NODE=1');
    // Percent expansion is the only expansion still active inside CMD quotes.
    lines.push(`"${exe.replace(/%/g, '%%')}" "${host.replace(/%/g, '%%')}" %*`);
    return { file, content: `${lines.join('\r\n')}\r\n` };
  }
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const file = path.join(bridgeDir, 'host.sh');
  const env = electron ? 'ELECTRON_RUN_AS_NODE=1 ' : '';
  return { file, content: `#!/bin/sh\n${env}exec ${q(exe)} ${q(host)} "$@"\n` };
}

/**
 * Installs the RobOS Bridge add-on into every Thunderbird profile and registers its native
 * messaging host for this OS user. Safe to run repeatedly. Thunderbird finds the add-on on its
 * next start (`restartRequired` is true while it is running) and asks the user once whether to
 * enable it ("RobOS Thunderbird Bridge was added to Thunderbird").
 */
function installBridge(options = {}) {
  const bridgeDir = getBridgeDir(options);
  const extensionDir = path.join(bridgeDir, 'extension');
  fs.mkdirSync(bridgeDir, { recursive: true });
  // Copied out of the clone so moving or deleting the checkout does not break Thunderbird.
  fs.rmSync(extensionDir, { recursive: true, force: true });
  fs.cpSync(path.join(SOURCE_DIR, 'extension'), extensionDir, { recursive: true });
  fs.copyFileSync(path.join(SOURCE_DIR, 'host.cjs'), path.join(bridgeDir, 'host.cjs'));

  const launcher = hostLauncher(bridgeDir, options);
  fs.writeFileSync(launcher.file, launcher.content, 'utf8');
  if (getPlatform(options) !== 'win32') fs.chmodSync(launcher.file, 0o755);

  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'RobOS Thunderbird Bridge native messaging host',
    path: launcher.file,
    type: 'stdio',
    allowed_extensions: [BRIDGE_ADDON_ID],
  };
  const manifestPath = path.join(bridgeDir, `${NATIVE_HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const registered = [];
  if (getPlatform(options) === 'win32') {
    const key = `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;
    if (!options.skipRegistry) {
      execFileSync('reg.exe', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { windowsHide: true, stdio: 'pipe' });
    }
    registered.push(key);
  } else {
    for (const dir of nativeManifestDirs(options)) {
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `${NATIVE_HOST_NAME}.json`);
      fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      registered.push(target);
    }
  }

  const profiles = tbGoogle.ensureThunderbirdProfiles(options);
  const installedProfiles = [];
  let restartRequired = false;
  for (const prof of profiles) {
    const extDir = path.join(prof.fullPath, 'extensions');
    fs.mkdirSync(extDir, { recursive: true });
    // A proxy file (named after the add-on id, holding the folder path) loads an unpacked add-on.
    const proxy = path.join(extDir, BRIDGE_ADDON_ID);
    const previous = fs.existsSync(proxy) ? fs.readFileSync(proxy, 'utf8').trim() : '';
    fs.writeFileSync(proxy, `${extensionDir}\n`, 'utf8');

    const userJsPath = path.join(prof.fullPath, 'user.js');
    const existing = fs.existsSync(userJsPath) ? fs.readFileSync(userJsPath, 'utf8') : '';
    fs.writeFileSync(userJsPath, tbGoogle.mergeUserJsContent(existing, PREFS_LABEL, bridgeUserJsBlock()), 'utf8');

    const inUse = tbGoogle.isProfileInUse(prof.fullPath);
    if (inUse && previous !== extensionDir) restartRequired = true;
    installedProfiles.push({ profilePath: prof.fullPath, proxyFile: proxy, inUse });
  }

  return {
    ok: true,
    addonId: BRIDGE_ADDON_ID,
    bridgeDir,
    extensionDir,
    hostLauncher: launcher.file,
    nativeManifest: manifestPath,
    registered,
    profiles: installedProfiles,
    restartRequired,
    socket: socketPath(options),
  };
}

/** Sends one request to the bridge and resolves with its reply ({ ok, result | error }). */
function request(action, params = {}, options = {}) {
  const where = socketPath(options);
  const timeoutMs = Number(options.timeoutMs) || 120000;
  return new Promise((resolve, reject) => {
    const socket = net.connect(where);
    let buf = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`The Thunderbird bridge did not answer within ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs + 5000);
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: 1, action, timeoutMs, ...params })}\n`));
    socket.on('data', (d) => {
      buf += d;
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      clearTimeout(timer);
      socket.end();
      try { resolve(JSON.parse(buf.slice(0, nl))); } catch (err) { reject(err); }
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      const e = new Error('Thunderbird is not running with the RobOS Bridge add-on. Start Thunderbird (or run `thunderbird-mail.js install` and restart it).');
      e.code = 'BRIDGE_UNAVAILABLE';
      e.cause = err;
      reject(e);
    });
  });
}

async function waitForBridge(options = {}) {
  const deadline = Date.now() + (Number(options.waitMs) || 45000);
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const reply = await request('ping', {}, { ...options, timeoutMs: 10000 });
      if (reply.ok) return reply.result;
      lastErr = new Error(reply.error);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw lastErr || new Error('The Thunderbird bridge did not come up.');
}

/** Bridge status: whether Thunderbird answers, its version and the identities it can send as. */
async function getStatus(options = {}) {
  const tb = tbGoogle.detectThunderbird(options);
  const bridgeDir = getBridgeDir(options);
  const base = {
    thunderbirdInstalled: tb.installed,
    thunderbirdVersion: tb.version,
    bridgeInstalled: fs.existsSync(path.join(bridgeDir, 'extension', 'manifest.json')),
    socket: socketPath(options),
  };
  try {
    const ping = await request('ping', {}, { ...options, timeoutMs: 10000 });
    const ids = await request('identities', {}, { ...options, timeoutMs: 10000 });
    return { ...base, running: Boolean(ping.ok), bridge: ping.result, identities: ids.ok ? ids.result : [], error: ping.ok ? undefined : ping.error };
  } catch (err) {
    return { ...base, running: false, identities: [], error: err.message };
  }
}

function asList(v) {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean);
}

/**
 * Sends an email through Thunderbird. Starts Thunderbird when it is not running.
 * @param {object} message { to, cc, bcc, from, subject, text | html, attachments: [path | {name, path | base64, contentType}] }
 */
async function sendEmail(message = {}, options = {}) {
  const to = asList(message.to);
  const cc = asList(message.cc);
  const bcc = asList(message.bcc);
  if (!to.length && !cc.length && !bcc.length) throw new Error('At least one recipient (to, cc or bcc) is required.');
  if (!message.subject && !message.text && !message.html) throw new Error('A subject or a body is required.');

  const attachments = (message.attachments || []).map((a) => {
    const att = typeof a === 'string' ? { path: a } : a;
    const base64 = att.base64 || fs.readFileSync(att.path).toString('base64');
    return { name: att.name || path.basename(att.path), contentType: att.contentType, base64 };
  });

  try {
    await request('ping', {}, { ...options, timeoutMs: 10000 });
  } catch (err) {
    if (err.code !== 'BRIDGE_UNAVAILABLE' || options.launch === false) throw err;
    launchThunderbirdInBackground(options);
    await waitForBridge(options);
  }

  const reply = await request('send', {
    to, cc, bcc,
    from: message.from,
    subject: message.subject || '',
    text: message.html ? undefined : (message.text || ''),
    html: message.html,
    mode: message.sendLater ? 'sendLater' : 'sendNow',
    attachments,
  }, options);
  if (!reply.ok) throw new Error(`Thunderbird could not send the message: ${reply.error}`);
  return reply.result;
}

function launchThunderbirdInBackground(options = {}) {
  const tb = tbGoogle.detectThunderbird(options);
  if (!tb.installed) throw new Error('Mozilla Thunderbird is not installed. Install it from the RobOS Software Center.');
  const args = tb.primaryProfilePath ? ['--profile', tb.primaryProfilePath] : [];
  const child = spawn(tb.binaryPath, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return { pid: child.pid, binaryPath: tb.binaryPath, args };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const val = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (out[key] === undefined) out[key] = val;
    else out[key] = [].concat(out[key], val);
  }
  return out;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const print = (o) => console.log(JSON.stringify(o, null, 2));
  if (cmd === 'install') return print(installBridge());
  if (cmd === 'status') return print(await getStatus());
  if (cmd === 'send') {
    const read = (f) => fs.readFileSync(f, 'utf8');
    const result = await sendEmail({
      to: args.to, cc: args.cc, bcc: args.bcc, from: args.from,
      subject: args.subject === true ? '' : args.subject,
      text: args['body-file'] ? read(args['body-file']) : args.body === true ? '' : args.body,
      html: args['html-file'] ? read(args['html-file']) : args.html === true ? undefined : args.html,
      attachments: asList(args.attach),
      sendLater: Boolean(args['send-later']),
    }, { launch: !args['no-launch'] });
    return print({ ok: true, ...result });
  }
  console.error('Usage: thunderbird-mail.js install | status | send --to <addr> --subject <s> --body <text> [--cc] [--bcc] [--from] [--html] [--attach <file>]');
  process.exitCode = 64;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  BRIDGE_ADDON_ID,
  NATIVE_HOST_NAME,
  getBridgeDir,
  socketPath,
  hostLauncher,
  bridgeUserJsBlock,
  installBridge,
  request,
  waitForBridge,
  getStatus,
  sendEmail,
  launchThunderbirdInBackground,
  parseArgs,
  main,
};
