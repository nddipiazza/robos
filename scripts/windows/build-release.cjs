'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function configuration(suite, output) {
  const repo = path.resolve(__dirname, '../..');
  const version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();
  const report = JSON.parse(fs.readFileSync(path.join(suite, 'install-report.json'), 'utf8'));
  if (report.failures.length) throw new Error('Cannot release an incomplete suite installation.');
  for (const file of ['apps.json', 'runtime/node.exe', 'runtime/git/cmd/git.exe', 'windows/main.cjs']) {
    if (!fs.existsSync(path.join(suite, file))) throw new Error(`Missing release input: ${file}`);
  }
  const app = path.join(output, 'app-source');
  fs.mkdirSync(app, { recursive: true });
  fs.cpSync(path.join(suite, 'windows'), path.join(app, 'windows'), { recursive: true });
  // Always package the launcher for this build, including packaged-path handling.
  fs.copyFileSync(path.join(repo, 'scripts/windows/main.cjs'), path.join(app, 'windows/main.cjs'));
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'robos-windows', version,
    description: 'RobOS native Windows app suite', author: 'RobOS', license: 'Apache-2.0', main: 'windows/main.cjs' }, null, 2));
  fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(app, 'LICENSE'));
  return {
    appId: 'com.rowbose.robos', productName: 'RobOS', electronVersion: '33.4.11',
    directories: { app, output }, files: ['windows/**/*', 'package.json', 'LICENSE'],
    npmRebuild: false, asar: true,
    extraResources: [{ from: suite, to: 'suite', filter: [
      'apps.json', 'install-report.json', 'packages/**/*', 'games/**/*', '.robos/**/*', 'runtime/**/*', 'windows/**/*',
      '!**/.git/**', '!**/.godot/**', '!**/__pycache__/**', '!**/tests/e2e/reports/**', '!**/*.log',
      '!**/node_modules/.cache/**', '!**/node_modules/electron/**', '!**/node_modules/playwright-core/**',
    ] }],
    win: { target: [{ target: 'portable', arch: ['x64'] }, { target: 'nsis', arch: ['x64'] }],
      icon: path.join(repo, 'docs/assets/images/favicon.ico'), executableName: 'RobOS' },
    portable: { artifactName: 'RobOS-v${version}-Windows-Portable.${ext}', requestExecutionLevel: 'user' },
    nsis: { artifactName: 'RobOS-v${version}-Windows-Setup.${ext}', oneClick: false, perMachine: false,
      allowElevation: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true,
      createStartMenuShortcut: true, shortcutName: 'RobOS', deleteAppDataOnUninstall: false,
      license: path.join(repo, 'LICENSE') },
  };
}

async function main() {
  const suite = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3] || 'release/windows-native');
  const config = configuration(suite, output);
  const { build, Platform, Arch } = require('../../installer/node_modules/electron-builder');
  await build({ targets: Platform.WINDOWS.createTarget(['portable', 'nsis'], Arch.x64), config, publish: 'never' });
  const artifacts = fs.readdirSync(output).filter(name => /^RobOS-v.*-Windows-(Portable|Setup)\.exe$/.test(name));
  if (artifacts.length !== 2) throw new Error('Both Windows EXE variants must be produced.');
  const checksums = [];
  for (const name of artifacts) {
    const file = path.join(output, name);
    if (fs.statSync(file).size >= 2147483648) throw new Error(`${name} exceeds GitHub's asset limit.`);
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    checksums.push(`${hash.digest('hex')}  ${name}`);
  }
  fs.writeFileSync(path.join(output, 'WINDOWS-EXE-SHA256SUMS'), checksums.join('\n') + '\n');
  fs.writeFileSync(path.join(output, 'windows-build.json'), JSON.stringify({ version: config.extraMetadata?.version ||
    JSON.parse(fs.readFileSync(path.join(config.directories.app, 'package.json'))).version,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), artifacts }, null, 2));
}
module.exports = { configuration };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
