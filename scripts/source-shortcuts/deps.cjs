'use strict';
// Lazy dependency setup for apps started from source. Apps run on the shared Electron in
// scripts/source-shortcuts (as App Manager runs them all on its own), so a package only needs
// its other runtime dependencies, and npm skips downloading its own copy of Electron.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** Runtime dependencies (other than electron) that packages/<id>/node_modules lacks. */
function missingDeps(dir) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return []; }
  return Object.keys(pkg.dependencies || {}).filter(name => name !== 'electron' &&
    !fs.existsSync(path.join(dir, 'node_modules', name, 'package.json')));
}

/**
 * npm install in `dir`. A package with no node_modules yet gets runtime dependencies only
 * (--omit=dev); one that has some keeps its dev dependencies, which --omit=dev would prune.
 * Resolves with npm's exit code; output goes to onOutput.
 */
function installDeps(dir, { onOutput = () => {}, nodeDir = null, env = process.env } = {}) {
  const args = ['install', '--no-audit', '--no-fund'];
  if (!fs.existsSync(path.join(dir, 'node_modules'))) args.push('--omit=dev');
  const childEnv = { ...env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  // Launched from a desktop menu, PATH may lack the Node the shortcuts were installed with.
  if (nodeDir) {
    const current = childEnv.PATH || childEnv.Path || '';
    delete childEnv.Path; // Windows spells it Path; keep a single key.
    childEnv.PATH = `${nodeDir}${path.delimiter}${current}`;
  }
  return new Promise(resolve => {
    onOutput(`> npm ${args.join(' ')}\n`);
    let child;
    try {
      // One fixed command string (no user input): the shell finds npm / npm.cmd on every OS.
      child = spawn(`npm ${args.join(' ')}`, { cwd: dir, env: childEnv, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { onOutput(`${error.message}\n`); resolve(1); return; }
    child.stdout.on('data', data => onOutput(String(data)));
    child.stderr.on('data', data => onOutput(String(data)));
    child.on('error', error => { onOutput(`${error.message}\n`); resolve(1); });
    child.on('close', code => resolve(code ?? 1));
  });
}

module.exports = { missingDeps, installDeps };
