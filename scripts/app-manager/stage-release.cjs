'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateCatalog } = require('../../packages/app-manager/lib/catalog.cjs');
const repo = path.resolve(__dirname, '../..');
const targets = [['win32', 'x64', 'Windows-Setup.exe'], ['linux', 'x64', 'Linux-x86_64.AppImage'],
  ['darwin', 'arm64', 'macOS-arm64.dmg'], ['darwin', 'x64', 'macOS-x64.dmg']];
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function verify(directory, version) {
  const platforms = [];
  for (const [platform, arch, artifact] of targets) {
    const manager = `RobOS-v${version}-${artifact}`;
    if (!fs.existsSync(path.join(directory, manager))) throw new Error(`Missing manager: ${manager}`);
    const catalog = validateCatalog(JSON.parse(fs.readFileSync(path.join(directory, `robos-catalog-${platform}-${arch}.json`))), platform, arch);
    if (catalog.version !== version) throw new Error('Catalog version does not match release');
    for (const item of catalog.components) {
      const name = new URL(item.url).pathname.split('/').pop();
      const file = path.resolve(directory, name);
      if (path.dirname(file) !== path.resolve(directory) || !fs.existsSync(file)) throw new Error(`Missing component: ${item.id} (${platform}/${arch})`);
      if (fs.statSync(file).size !== item.bytes || await sha256(file) !== item.sha256) throw new Error(`Invalid component checksum: ${name}`);
    }
    platforms.push({ platform, arch, manager, components: catalog.components.length });
  }
  return platforms;
}
async function stage(directory) {
  const version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();
  const platforms = await verify(directory, version);
  const ps = fs.readFileSync(path.join(repo, 'site/downloads/Install-RobOS.ps1'), 'utf8')
    .replace(/\$SourceRef = '[^']+'/, `$SourceRef = 'v${version}'`);
  const cmd = fs.readFileSync(path.join(repo, 'site/downloads/Install-RobOS.cmd'), 'utf8')
    .replace('https://rowbose.com/downloads/Install-RobOS.ps1', `https://github.com/nddipiazza/robos/releases/download/v${version}/Install-RobOS.ps1`);
  fs.writeFileSync(path.join(directory, 'Install-RobOS.ps1'), ps);
  fs.writeFileSync(path.join(directory, 'Install-RobOS.cmd'), cmd.replace(/\r?\n/g, '\r\n'));
  const scripts = [];
  for (const name of ['Install-RobOS.cmd', 'Install-RobOS.ps1']) scripts.push(`${await sha256(path.join(directory, name))}  ${name}`);
  fs.writeFileSync(path.join(directory, 'WINDOWS-SHA256SUMS'), scripts.join('\n') + '\n');
  fs.writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify({ version,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), platforms }, null, 2) + '\n');
  const sums = [];
  for (const name of fs.readdirSync(directory).sort().filter(name => name !== 'SHA256SUMS')) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isFile()) sums.push(`${await sha256(file)}  ${name}`);
  }
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), sums.join('\n') + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=v${version}\n`);
  console.log(`Verified all platform downloads for v${version}`);
}
module.exports = { verify, targets };
if (require.main === module) stage(path.resolve(process.argv[2] || 'release/publish')).catch(error => { console.error(error); process.exitCode = 1; });
