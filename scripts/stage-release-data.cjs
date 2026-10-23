'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release VERSION');
const data = { version, tag: `v${version}`, url: `https://github.com/nddipiazza/robos/releases/tag/v${version}`,
  download: `https://github.com/nddipiazza/robos/releases/download/v${version}` };
for (const site of ['site', 'docs']) {
  const file = path.join(root, site, '_data/release.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
// The website bootstrap must install the displayed release, rather than main.
const setup = path.join(root, 'site/downloads/Install-RobOS.ps1');
fs.writeFileSync(setup, fs.readFileSync(setup, 'utf8').replace(/\$SourceRef = '[^']+'/, `$SourceRef = 'v${version}'`));
console.log(`Staged release v${version} for both documentation sites.`);
