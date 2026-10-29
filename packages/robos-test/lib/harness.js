/**
 * RobOS Test Harness — launches Electron apps in a sandboxed environment.
 *
 * Headless by default: uses --headless=new with the current DISPLAY.
 * If no DISPLAY, falls back to DISPLAY=:99 (assumes Xvfb is running).
 *
 * Usage:
 *   const { launchApp, killApp } = require('./harness');
 *   const app = await launchApp('security-setup', scenarios['fresh-install']);
 *   // ... run assertions against app.port ...
 *   await killApp(app);
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const net  = require('net');
const { spawn, execSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');

const REPO_ROOT    = path.resolve(__dirname, '../../..');
// On the VM, apps are installed as siblings of robos-test under /usr/local/share/robos/.
// On the host, they live in <repo>/packages/. Fall back to the sibling dir if packages/ doesn't exist.
const _computedPkgDir = path.join(REPO_ROOT, 'packages');
const PACKAGES_DIR = fs.existsSync(_computedPkgDir)
  ? _computedPkgDir
  : path.resolve(__dirname, '../..');
const SANDBOX_BIN  = path.join(__dirname, '..', 'sandbox', 'bin');
const HOME_TMPL    = path.join(__dirname, '..', 'sandbox', 'home-template');
const RUN_DIR      = path.join(__dirname, '..', 'run');
// One lock file per port in use by a test run, shared by every checkout on this machine.
const PORT_LOCK_DIR = path.join(os.tmpdir(), 'robos-test-ports');

const PORT_MAP = {
  'agents-manager': 19104,
  'automation-studio': 19128,
  'context-manager': 19106,
  'security-setup': 19114,
  'pass-manager': 19113,
  'pass-unlock': 19122,
  'git-login-manager': 19123,
  'task-servers': 19112,
  'issue-manager': 19103,
  'workflow-studio': 19120,
  'task-board': 19124,
  'notifications': 19115,
  'robos-preferences': 19116,
  'search-index': 19119,
  'desktop-manager': 19125,
  'robos-toast': 19126,
  'desktop-widgets': 19127,
  'pr-review': 19129,
  'ci-monitor': 19130,
  'stage-demo': 19131,
  'group-manager': 19132,
  'deploy-tracker': 19132,
  'desktop-customizer': 19136,
  'dev-central': 19133,
  'workspace-manager': 19110,
  'dev-tools': 19137,
  'git-projects': 19138,
  'manager-dashboard': 19134,
  'report-builder': 19135,
  'task-planner': 19134,
  'task-implementer': 19135,
  'skills-manager': 19139,
  'ai-prompt': 19140,
  'robos-desktop': 19141,
  'robos-onboarding': 19142,
  'robos-cli': 19143,
  'robos-profiled': 19144,
  'robos-agentd': 19145,
  'agent-sidebar': 19146,
  'desktop-agents': 19147,
  'robos-agent-session': 19148,
  'robos-mcp-lib': 19149,
  'mcp-manager': 19150,
  'robos-mcp-router': 19151,
  'task-manager-mcp': 19152,
  'workspace-manager-mcp': 19153,
  'ekgraph-mcp': 19154,
  'ci-monitor-mcp': 19155,
  'ide-bridge-mcp': 19156,
  'intellij-idea': 19157,
  'system-mcp': 19158,
  'agent-autoconfig': 19159,
  'dev-tools-mcp': 19160,
  'robos-graph': 19161,
  'topology-manager': 19162,
  'people-manager': 19163,
  'schema-studio': 19164,
  'contract-studio': 19165,
  'package-manager': 19166,
  'adapter-studio': 19167,
  'gitea-browser': 19175,
  'kube-studio': 19176,
  'rest-client': 19177,
  'data-sources': 19178,
  'db-manager': 19179,
  'nosql-manager': 19180,
  'grpc-client': 19181,
  'graphql-client': 19182,
  'app-wizard': 19183,
  'remote-execution-studio': 19184,
  'robos-elearning': 19185,
  'voice-prompt': 19188,
  'kgraph-parse-portal': 19192,
  'crpg-editor': 19194,
};



// Track all launched apps for process-exit cleanup
const _activeApps = new Set();
process.on('exit', () => {
  for (const app of _activeApps) {
    try { process.kill(app.proc.pid, 'SIGKILL'); } catch {}
    try { _killTree(app.proc.pid); } catch {}
    _releasePort(app.port);
  }
});
// Also handle SIGINT/SIGTERM so Ctrl-C cleans up
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const app of _activeApps) {
      try { process.kill(app.proc.pid, 'SIGKILL'); } catch {}
      try { _killTree(app.proc.pid); } catch {}
    }
    process.exit(1);
  });
}

function findElectron() {
  const candidates = [
    process.env.ELECTRON_BIN,
    path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron'),
    path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    '/usr/bin/electron',
    '/usr/local/bin/electron',
  ];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  try {
    const which = execSync('which electron 2>/dev/null', { encoding: 'utf8' }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch {}
  throw new Error('electron binary not found. Run: cd packages/robos-test && npm install');
}

function setupHome(homeDir, scenario) {
  fs.rmSync(homeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (fs.existsSync(HOME_TMPL)) {
    fs.cpSync(HOME_TMPL, homeDir, { recursive: true });
  } else {
    fs.mkdirSync(homeDir, { recursive: true });
  }

  fs.mkdirSync(path.join(homeDir, '.config', 'robos'), { recursive: true });
  fs.mkdirSync(path.join(homeDir, '.ssh'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(homeDir, '.gnupg'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(homeDir, '.cache', 'robos'), { recursive: true });

  if (scenario.sshKey) {
    fs.writeFileSync(path.join(homeDir, '.ssh', 'id_ed25519'), scenario.sshKey.private, { mode: 0o600 });
    fs.writeFileSync(path.join(homeDir, '.ssh', 'id_ed25519.pub'), scenario.sshKey.public);
  }

  if (scenario.gitConfig) {
    fs.writeFileSync(path.join(homeDir, '.gitconfig'),
      `[user]\n\tname = ${scenario.gitConfig.name}\n\temail = ${scenario.gitConfig.email}\n`);
  }

  if (scenario.ghAuth) {
    const ghDir = path.join(homeDir, '.config', 'gh');
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, 'hosts.yml'),
      `github.com:\n    user: testuser\n    oauth_token: gho_fake_token_for_dev\n    git_protocol: ssh\n`);
  }

  if (scenario.passReady) {
    const passDir = path.join(homeDir, '.password-store');
    fs.mkdirSync(passDir, { recursive: true });
    fs.writeFileSync(path.join(passDir, '.gpg-id'), 'test@example.com\n');
    if (scenario.passEntries) {
      for (const [name, content] of Object.entries(scenario.passEntries)) {
        fs.mkdirSync(path.dirname(path.join(passDir, name + '.gpg')), { recursive: true });
        fs.writeFileSync(path.join(passDir, name + '.gpg'), content || 'fake-gpg-data');
      }
    }
  }

  if (scenario.gpgAgent) {
    fs.writeFileSync(path.join(homeDir, '.gnupg', 'gpg-agent.conf'),
      'pinentry-program /usr/bin/pinentry\ndefault-cache-ttl 86400\nmax-cache-ttl 86400\nallow-preset-passphrase\n',
      { mode: 0o600 });
  }

  if (scenario.settings) {
    fs.writeFileSync(path.join(homeDir, '.config', 'robos', 'settings.json'),
      JSON.stringify(scenario.settings, null, 2));
  }

  // Arbitrary seed files: { 'relative/to/HOME': string | object }
  if (scenario.files) {
    for (const [rel, content] of Object.entries(scenario.files)) {
      const target = path.join(homeDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
  }

  return homeDir;
}

function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function waitForHealth(port, timeoutMs = 15000, instance) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let health = null;
    try {
      const res = await httpGet(`http://localhost:${port}/health`, 2000);
      if (res.status === 200) health = JSON.parse(res.data);
    } catch {}
    // Another process answering on our port means our app could not bind it.
    if (health && instance && health.instance && health.instance !== instance) {
      throw new Error(`port ${port} is answered by another app instance (${health.appId || 'unknown'})`);
    }
    if (health) return health;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`App on port ${port} did not become healthy within ${timeoutMs}ms`);
}

// ── Port allocation ──────────────────────────────────────────────────────────
// Several test runs (often from different checkouts) can launch the same app at once.
// Each launch claims its port with a lock file, so runs never share or kill each other's
// apps. Port order: scenarioConfig.port, then PORT_MAP + ROBOS_TEST_PORT_OFFSET (skipped
// when ROBOS_TEST_PORT=ephemeral), then a free ephemeral port.

function _pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function _claimPort(port) {
  fs.mkdirSync(PORT_LOCK_DIR, { recursive: true });
  const lock = path.join(PORT_LOCK_DIR, `${port}.pid`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') return false;
      let owner = 0;
      try { owner = parseInt(fs.readFileSync(lock, 'utf8'), 10); } catch {}
      if (owner && _pidAlive(owner)) return false;
      try { fs.unlinkSync(lock); } catch {}  // left by a run that died
    }
  }
  return false;
}

function _releasePort(port) {
  const lock = path.join(PORT_LOCK_DIR, `${port}.pid`);
  try { if (parseInt(fs.readFileSync(lock, 'utf8'), 10) === process.pid) fs.unlinkSync(lock); } catch {}
}

function _listenerPids(port) {
  try {
    return execSync(`lsof -nP -ti tcp:${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf8' })
      .split('\n').filter(Boolean).map(Number);
  } catch { return []; }
}

/**
 * The test runner pid a launch was tagged with. Chromium wipes /proc/<pid>/environ once it
 * starts (and rewrites cmdline as one space-joined string), so the tag is a switch.
 */
function _testOwner(pid) {
  try {
    const m = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').match(/--robos-test-owner=(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch { return 0; }
}

/** A listener we may kill: an app this harness launched whose test run has exited. */
function _isOrphanedTestApp(pid) {
  const owner = _testOwner(pid);
  if (!owner) return false;  // the user's own app (or one an older harness launched): never killed
  if (owner === process.pid) return ![..._activeApps].some(a => a.proc.pid === pid);
  return !_pidAlive(owner);
}

function _ephemeralPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '0.0.0.0', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

/** Claim a port for appId that nothing else is listening on. */
async function _allocatePort(appId, scenarioConfig) {
  const offset = parseInt(process.env.ROBOS_TEST_PORT_OFFSET || '0', 10) || 0;
  const fixed = scenarioConfig.port || (process.env.ROBOS_TEST_PORT === 'ephemeral' ? null : PORT_MAP[appId] + offset);
  const candidates = fixed ? [fixed] : [];
  if (!scenarioConfig.port) for (let i = 0; i < 5; i++) candidates.push(null);

  const busy = [];
  for (let port of candidates) {
    if (!port) port = await _ephemeralPort();
    if (!_claimPort(port)) { busy.push(`${port} (claimed by another test run)`); continue; }
    let pids = _listenerPids(port);
    const orphans = pids.filter(p => p !== process.pid && _isOrphanedTestApp(p));
    if (orphans.length) {
      for (const p of orphans) _killTree(p);
      await new Promise(r => setTimeout(r, 500));
      pids = _listenerPids(port);
    }
    if (!pids.length) return port;
    _releasePort(port);
    busy.push(`${port} (listening: pid ${pids.join(', ')})`);
  }
  throw new Error(`No free test port for ${appId}; tried ${busy.join('; ')}`);
}

/** Kill a process and all its children */
function _killTree(pid) {
  try {
    // Get child pids
    const children = execSync(`pgrep -P ${pid} 2>/dev/null`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const child of children) {
      _killTree(parseInt(child));
    }
  } catch {}
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

async function launchApp(appId, scenarioConfig) {
  const electronBin = findElectron();
  const appDir = path.join(PACKAGES_DIR, appId);
  if (!fs.existsSync(path.join(appDir, 'main.js'))) {
    throw new Error(`App not found: ${appDir}/main.js`);
  }

  const basePort = PORT_MAP[appId];
  if (!basePort) throw new Error(`No port registered for app: ${appId}`);
  const port = await _allocatePort(appId, scenarioConfig);
  const instance = crypto.randomBytes(8).toString('hex');

  fs.mkdirSync(RUN_DIR, { recursive: true });
  // `home` reuses a sandbox home prepared by the test (for example two "machines" that
  // are opened more than once); `keepHome` leaves it in place when the app is killed.
  const sandboxHome = scenarioConfig.home || path.join(RUN_DIR, `test-${appId}-${Date.now()}`);
  if (!scenarioConfig.home) setupHome(sandboxHome, scenarioConfig);

  const display = process.env.ROBOS_DISPLAY || process.env.XVFB_DISPLAY || (process.env.ROBOS_TEST === '1' || process.env.ROBOS_HEADLESS === '1' ? ':99' : (process.env.DISPLAY || ':99'));
  const electronArgs = [appDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--robos-test-owner=${process.pid}`, ...(scenarioConfig.electronArgs || [])];

  const useRealBinaries = scenarioConfig.useRealBinaries || process.env.ROBOS_REAL_BINARIES === '1';
  const pathEnv = useRealBinaries ? process.env.PATH : `${SANDBOX_BIN}:${process.env.PATH}`;

  const proc = spawn(electronBin, electronArgs, {
    env: {
      ...process.env,
      HOME: sandboxHome,
      PATH: pathEnv,
      ROBOS_SCENARIO: scenarioConfig.name || 'test',
      ROBOS_REAL_BINARIES: useRealBinaries ? '1' : '0',
      ROBOS_HEADLESS: process.env.ROBOS_DEMO_SHOW ? '0' : '1',
      ROBOS_TEST_MODE: process.env.ROBOS_DEMO_SHOW ? '0' : '1',
      ROBOS_DM_SOCKET: `/tmp/robos-dm-${Date.now()}-${Math.floor(Math.random() * 1000)}.sock`,
      DISPLAY: display,
      GH_CONFIG_DIR: path.join(sandboxHome, '.config', 'gh'),
      GIT_CONFIG_GLOBAL: path.join(sandboxHome, '.gitconfig'),
      ROBOS_LIB_PATH: path.join(PACKAGES_DIR, 'robos-lib'),
      GNUPGHOME: path.join(sandboxHome, '.gnupg'),
      PASSWORD_STORE_DIR: path.join(sandboxHome, '.password-store'),
      REAL_HOME: process.env.HOME || '/home/ndipiazza',
      ROBOS_HOST_HOME: process.env.HOME || '/home/ndipiazza',
      // The app's debug server moves from basePort to the port claimed above.
      ROBOS_DEBUG_PORT_REMAP: `${basePort}:${port}`,
      ROBOS_DEBUG_INSTANCE: instance,
      ...(appId === 'voice-prompt' ? { ROBOS_VOICE_PORT: String(port) } : {}),
      ...(scenarioConfig.env || {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', d => stderr += d.toString());

  const app = { proc, port, sandboxHome, pid: proc.pid, stderr: () => stderr, keepHome: Boolean(scenarioConfig.home || scenarioConfig.keepHome) };
  _activeApps.add(app);

  try {
    await waitForHealth(port, 15000, instance);
    // Give the renderer time to complete async initialization (IPC calls, DOM updates)
    await new Promise(r => setTimeout(r, 1500));
  } catch (e) {
    await killApp(app);
    throw new Error(`Failed to launch ${appId}: ${e.message}\nstderr: ${stderr}`);
  }

  return app;
}

/** Pause between test steps so you can see what's on screen. Set ROBOS_TEST_DELAY=3000 for 3s. */
async function testDelay(label) {
  const ms = parseInt(process.env.ROBOS_TEST_DELAY || '0', 10);
  if (ms > 0) {
    if (label) process.stdout.write(`  [delay] ${label} — waiting ${ms}ms\n`);
    await new Promise(r => setTimeout(r, ms));
  }
}

async function killApp(app) {
  if (!app || !app.proc) return;
  await testDelay('before kill');
  _activeApps.delete(app);

  // Kill process tree
  _killTree(app.proc.pid);

  // Wait for process to fully exit
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 2000);
    app.proc.on('exit', () => { clearTimeout(timeout); resolve(); });
    // In case it's already exited
    if (app.proc.exitCode !== null || app.proc.signalCode !== null) {
      clearTimeout(timeout);
      resolve();
    }
  });
  _releasePort(app.port);

  // Clean up sandbox home
  if (!app.keepHome) try { fs.rmSync(app.sandboxHome, { recursive: true, force: true }); } catch {}
}

module.exports = { launchApp, killApp, testDelay, setupHome, PORT_MAP, PACKAGES_DIR };
