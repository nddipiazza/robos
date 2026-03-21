/**
 * RobOS Test Harness — launches Electron apps in a sandboxed environment.
 *
 * Usage:
 *   const { launchApp, killApp } = require('./harness');
 *   const app = await launchApp('security-setup', 'all-good');
 *   // ... run assertions against app.port ...
 *   killApp(app);
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');
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
};

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

  const robosDir = path.join(homeDir, '.config', 'robos');
  fs.mkdirSync(robosDir, { recursive: true });

  const sshDir = path.join(homeDir, '.ssh');
  fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });

  const gnupgDir = path.join(homeDir, '.gnupg');
  fs.mkdirSync(gnupgDir, { recursive: true, mode: 0o700 });

  if (scenario.sshKey) {
    fs.writeFileSync(path.join(sshDir, 'id_ed25519'), scenario.sshKey.private, { mode: 0o600 });
    fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), scenario.sshKey.public);
  }

  if (scenario.gitConfig) {
    const gitcfg = `[user]\n\tname = ${scenario.gitConfig.name}\n\temail = ${scenario.gitConfig.email}\n`;
    fs.writeFileSync(path.join(homeDir, '.gitconfig'), gitcfg);
  }

  if (scenario.ghAuth) {
    const ghDir = path.join(homeDir, '.config', 'gh');
    fs.mkdirSync(ghDir, { recursive: true });
    const hosts = `github.com:\n    user: testuser\n    oauth_token: gho_fake_token_for_dev\n    git_protocol: ssh\n`;
    fs.writeFileSync(path.join(ghDir, 'hosts.yml'), hosts);
  }

  if (scenario.passReady) {
    const passDir = path.join(homeDir, '.password-store');
    fs.mkdirSync(passDir, { recursive: true });
    fs.writeFileSync(path.join(passDir, '.gpg-id'), 'test@example.com\n');
    if (scenario.passEntries) {
      for (const [name, content] of Object.entries(scenario.passEntries)) {
        const entryDir = path.dirname(path.join(passDir, name + '.gpg'));
        fs.mkdirSync(entryDir, { recursive: true });
        fs.writeFileSync(path.join(passDir, name + '.gpg'), content || 'fake-gpg-data');
      }
    }
  }

  if (scenario.gpgAgent) {
    const agentConf = 'pinentry-program /usr/bin/pinentry\ndefault-cache-ttl 86400\nmax-cache-ttl 86400\nallow-preset-passphrase\n';
    fs.writeFileSync(path.join(gnupgDir, 'gpg-agent.conf'), agentConf, { mode: 0o600 });
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

async function waitForHealth(port, timeoutMs = 12000) {
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

async function launchApp(appId, scenarioConfig) {
  const electronBin = findElectron();
  const appDir = path.join(PACKAGES_DIR, appId);
  if (!fs.existsSync(path.join(appDir, 'main.js'))) {
    throw new Error(`App not found: ${appDir}/main.js`);
  }

  const port = PORT_MAP[appId];
  if (!port) throw new Error(`No port registered for app: ${appId}`);

  fs.mkdirSync(RUN_DIR, { recursive: true });
  const sandboxHome = path.join(RUN_DIR, `test-${appId}-${Date.now()}`);
  setupHome(sandboxHome, scenarioConfig);

  const electronArgs = [appDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];

  const proc = spawn(electronBin, electronArgs, {
    env: {
      ...process.env,
      HOME: sandboxHome,
      PATH: `${SANDBOX_BIN}:${process.env.PATH}`,
      ROBOS_SCENARIO: scenarioConfig.name || 'test',
      DISPLAY: process.env.DISPLAY || '',
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

  try {
    await waitForHealth(port);
    // Give the renderer time to complete async initialization (IPC calls, DOM updates)
    await new Promise(r => setTimeout(r, 1500));
  } catch (e) {
    proc.kill('SIGKILL');
    throw new Error(`Failed to launch ${appId}: ${e.message}\nstderr: ${stderr}`);
  }

  return { proc, port, sandboxHome, stderr: () => stderr };
}

function killApp(app) {
  if (!app || !app.proc) return;
  try { app.proc.kill('SIGKILL'); } catch {}
  // Wait a moment for process to fully die before cleaning up
  try {
    const { execSync } = require('child_process');
    execSync(`kill -9 ${app.proc.pid} 2>/dev/null; sleep 0.3`, { timeout: 2000 });
  } catch {}
  // Clean up sandbox
  try { fs.rmSync(app.sandboxHome, { recursive: true, force: true }); } catch {}
}

module.exports = { launchApp, killApp, setupHome, PORT_MAP, PACKAGES_DIR };
