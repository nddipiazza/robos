'use strict';
// Puts the Electron binary into scripts/source-shortcuts/node_modules/electron/dist when its
// own postinstall did not: npm 11 can hold install scripts back until approved, and its
// extract-zip step stops after the first file on recent Node releases. Downloads (or reuses
// the cached zip) through Electron's own @electron/get, unzips with the OS's tool, and writes
// path.txt the way electron/install.js does.
//   node scripts/source-shortcuts/fetch-electron.cjs
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const electronDir = path.join(__dirname, 'node_modules/electron');
const PLATFORM_PATH = { win32: 'electron.exe', darwin: 'Electron.app/Contents/MacOS/Electron', linux: 'electron' };

async function main() {
  const { version } = require(path.join(electronDir, 'package.json'));
  const { downloadArtifact } = require(require.resolve('@electron/get', { paths: [electronDir] }));
  const zip = await downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch });
  const dist = path.join(electronDir, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true }).status === 0;
  const ok = process.platform === 'win32' ? run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dist])
    // ditto keeps the symlinks inside Electron Framework.framework, which a plain unzip can break.
    : process.platform === 'darwin' ? run('ditto', ['-x', '-k', zip, dist])
      : run('unzip', ['-q', '-o', zip, '-d', dist]) || run('python3', ['-m', 'zipfile', '-e', zip, dist]);
  const bin = path.join(dist, PLATFORM_PATH[process.platform]);
  if (!ok || !fs.existsSync(bin)) throw new Error(`Could not unpack ${zip}`);
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
  fs.writeFileSync(path.join(electronDir, 'path.txt'), PLATFORM_PATH[process.platform]);
  console.log(`Electron ${version} ready: ${bin}`);
}
main().catch(error => { console.error(error.message); process.exit(1); });
