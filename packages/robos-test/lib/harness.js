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
const { spawn, execSync } = require('child_process');
const http = require('http');

const REPO_ROOT    = path.resolve(__dirname, '../../..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const SANDBOX_BIN  = path.join(__dirname, '..', 'sandbox', 'bin');
const HOME_TMPL    = path.join(__dirname, '..', 'sandbox', 'home-template');
const RUN_DIR      = path.join(__dirname, '..', 'run');

const PORT_MAP = {
  'security-setup': 19114,
  'pass-manager': 19113,
  'pass-unlock': 19122,
  'git-login-manager': 19123,
  'task-servers': 19112,
  'issue-manager': 19103,
};

// Track all launched apps for process-exit cleanup
const _activeApps = new Set();
process.on('exit', () => {
  for (const app of _activeApps) {
    try { process.kill(app.proc.pid, 'SIGKILL'); } catch {}
    try { _killTree(app.proc.pid); } catch {}
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
    path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron'),
    path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('electron binary not found. Run: cd packages/robos-test && npm install');
}

function setupHome(homeDir, scenario) {
  fs.rmSync(homeDir, { recursive: true, force: true });
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

async function waitForHealth(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await httpGet(`http://localhost:${port}/health`, 2000);
      if (res.status === 200) return JSON.parse(res.data);
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`App on port ${port} did not become healthy within ${timeoutMs}ms`);
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

  const port = PORT_MAP[appId];
  if (!port) throw new Error(`No port registered for app: ${appId}`);

  // Ensure no leftover process is using our port
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (pids) {
      for (const pid of pids.split('\n').filter(Boolean)) {
        const p = parseInt(pid);
        if (p !== process.pid && p !== process.ppid) {
          try { process.kill(p, 'SIGKILL'); } catch {}
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch {}

  fs.mkdirSync(RUN_DIR, { recursive: true });
  const sandboxHome = path.join(RUN_DIR, `test-${appId}-${Date.now()}`);
  setupHome(sandboxHome, scenarioConfig);

  const electronArgs = [appDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
  const display = process.env.DISPLAY || ':0';

  const proc = spawn(electronBin, electronArgs, {
    env: {
      ...process.env,
      HOME: sandboxHome,
      PATH: `${SANDBOX_BIN}:${process.env.PATH}`,
      ROBOS_SCENARIO: scenarioConfig.name || 'test',
      DISPLAY: display,
      GH_CONFIG_DIR: path.join(sandboxHome, '.config', 'gh'),
      GIT_CONFIG_GLOBAL: path.join(sandboxHome, '.gitconfig'),
      ROBOS_LIB_PATH: path.join(PACKAGES_DIR, 'robos-lib'),
      GNUPGHOME: path.join(sandboxHome, '.gnupg'),
      PASSWORD_STORE_DIR: path.join(sandboxHome, '.password-store'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', d => stderr += d.toString());

  const app = { proc, port, sandboxHome, pid: proc.pid, stderr: () => stderr };
  _activeApps.add(app);

  try {
    await waitForHealth(port);
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

  // Clean up sandbox home
  try { fs.rmSync(app.sandboxHome, { recursive: true, force: true }); } catch {}
}

module.exports = { launchApp, killApp, testDelay, setupHome, PORT_MAP, PACKAGES_DIR };
