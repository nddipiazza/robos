#!/usr/bin/env node
// RobOS Dev Harness
// Usage: node harness.js --app <app-name> --scenario <scenario-name>
//        node harness.js --list-apps
//        node harness.js --list-scenarios

const path  = require('path');
const fs    = require('fs');
const { spawnSync, spawn } = require('child_process');

const REPO_ROOT    = path.resolve(__dirname, '../..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const HARNESS_DIR  = __dirname;
const SANDBOX_BIN  = path.join(HARNESS_DIR, 'sandbox', 'bin');
const HOME_TMPL    = path.join(HARNESS_DIR, 'sandbox', 'home-template');
const RUN_DIR      = path.join(HARNESS_DIR, 'run');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

if (args.includes('--list-apps')) {
  console.log('\nAvailable apps:');
  fs.readdirSync(PACKAGES_DIR).filter(d => {
    const pkg = path.join(PACKAGES_DIR, d, 'package.json');
    if (!fs.existsSync(pkg)) return false;
    const main = path.join(PACKAGES_DIR, d, 'main.js');
    return fs.existsSync(main);
  }).forEach(d => console.log(' ', d));
  process.exit(0);
}

if (args.includes('--list-scenarios')) {
  const scenarios = require('./scenarios');
  console.log('\nAvailable scenarios:');
  Object.entries(scenarios).forEach(([name, s]) => console.log(`  ${name.padEnd(24)} ${s.description}`));
  process.exit(0);
}

const appName  = get('--app');
const scenario = get('--scenario') || 'all-good';

if (!appName) {
  console.error('Usage: node harness.js --app <app-name> --scenario <scenario>');
  console.error('       node harness.js --list-apps');
  console.error('       node harness.js --list-scenarios');
  process.exit(1);
}

// ── locate app ───────────────────────────────────────────────────────────────

const appDir = path.join(PACKAGES_DIR, appName);
if (!fs.existsSync(path.join(appDir, 'main.js'))) {
  console.error(`App not found: ${appDir}`);
  process.exit(1);
}

// ── find electron ─────────────────────────────────────────────────────────────
// Use harness's own electron, or fall back to app's bundled electron

function findElectron() {
  const candidates = [
    path.join(HARNESS_DIR, 'node_modules', 'electron', 'dist', 'electron'),
    path.join(appDir, 'node_modules', 'electron', 'dist', 'electron'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  console.error('electron binary not found. Run: npm install inside packages/dev-harness/');
  process.exit(1);
}

const electronBin = findElectron();

// ── set up sandbox home ───────────────────────────────────────────────────────

const scenarios = require('./scenarios');
const scenarioCfg = scenarios[scenario];
if (!scenarioCfg) {
  console.error(`Unknown scenario: "${scenario}". Run --list-scenarios.`);
  process.exit(1);
}

const sandboxHome = path.join(RUN_DIR, `${scenario}-home`);
setupHome(sandboxHome, scenarioCfg);

function setupHome(homeDir, cfg) {
  fs.rmSync(homeDir, { recursive: true, force: true });
  fs.cpSync(HOME_TMPL, homeDir, { recursive: true });

  const sshDir = path.join(homeDir, '.ssh');
  fs.mkdirSync(sshDir, { recursive: true });
  fs.chmodSync(sshDir, 0o700);

  if (cfg.sshKey) {
    fs.writeFileSync(path.join(sshDir, 'id_ed25519'),     cfg.sshKey.private, { mode: 0o600 });
    fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), cfg.sshKey.public);
  }

  if (cfg.gitConfig) {
    const gitcfg = `[user]\n\tname = ${cfg.gitConfig.name}\n\temail = ${cfg.gitConfig.email}\n`;
    fs.writeFileSync(path.join(homeDir, '.gitconfig'), gitcfg);
  }

  if (cfg.ghAuth) {
    const ghDir = path.join(homeDir, '.config', 'gh');
    fs.mkdirSync(ghDir, { recursive: true });
    const hosts = `github.com:\n    user: testuser\n    oauth_token: gho_fake_token_for_dev\n    git_protocol: ssh\n`;
    fs.writeFileSync(path.join(ghDir, 'hosts.yml'), hosts);
  }
}

// ── launch ────────────────────────────────────────────────────────────────────

console.log(`\n🚀 RobOS Dev Harness`);
console.log(`   app:      ${appName}`);
console.log(`   scenario: ${scenario} — ${scenarioCfg.description}`);
console.log(`   home:     ${sandboxHome}`);
console.log(`   electron: ${electronBin}\n`);

const child = spawn(electronBin, [appDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
  env: {
    ...process.env,
    HOME:            sandboxHome,
    PATH:            `${SANDBOX_BIN}:${process.env.PATH}`,
    ROBOS_SCENARIO:  scenario,
    DISPLAY:         process.env.DISPLAY || ':0',
    // Prevent apps from picking up real user's gh/git creds
    GH_CONFIG_DIR:   path.join(sandboxHome, '.config', 'gh'),
    GIT_CONFIG_GLOBAL: path.join(sandboxHome, '.gitconfig'),
  },
  stdio: 'inherit',
});

child.on('exit', (code) => {
  console.log(`\nApp exited with code ${code}`);
});
