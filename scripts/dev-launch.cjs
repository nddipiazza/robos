'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packages = path.join(root, 'packages');
const isApp = dir => ['main.js', 'package.json'].every(file => fs.existsSync(path.join(dir, file)));
const [id, ...appArgs] = process.argv.slice(2);

function main() {
  if (!id) {
    console.log('Usage: node scripts/dev-launch.cjs <app-id> [app arguments]\n\nAvailable apps:');
    for (const name of fs.readdirSync(packages)) if (isApp(path.join(packages, name))) console.log(`  ${name}`);
    process.exitCode = 1;
    return;
  }
  const dir = path.join(packages, id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !isApp(dir)) throw new Error(`No app found in packages/${id}`);
  const requireApp = createRequire(path.join(dir, 'package.json'));
  const electronPath = () => {
    try {
      const bin = requireApp('electron');
      if (typeof bin === 'string' && fs.existsSync(bin)) return bin;
    } catch {}
  };

  let electron = electronPath();
  if (!electron) {
    console.log(`Installing dependencies for ${id}…`);
    const options = { cwd: dir, stdio: 'inherit' };
    const install = process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm install --quiet'], options)
      : spawnSync('npm', ['install', '--quiet'], options);
    if (install.error) throw install.error;
    if (install.status !== 0) throw new Error(`npm install failed for ${id}`);
    electron = electronPath();
    if (!electron) throw new Error(`No local Electron runtime found for ${id}`);
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const flags = ['--disable-gpu'];
  if (process.platform === 'linux') {
    flags.push('--no-sandbox', '--disable-dev-shm-usage');
    if (!env.WAYLAND_DISPLAY && !env.WAYLAND_SOCKET) env.DISPLAY ||= ':0';
  }
  console.log(`Launching ${id}…`);
  const child = spawn(electron, [...flags, '--require', path.join(__dirname, 'dev-launch-icons.cjs'), dir, ...appArgs],
    { env, stdio: 'inherit' });
  child.on('error', fail);
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
  });
}

function fail(error) {
  console.error(error.message);
  process.exitCode = 1;
}

try { main(); } catch (error) { fail(error); }
