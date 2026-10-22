'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const version = fs.readFileSync(path.resolve(__dirname, '../VERSION'), 'utf8').trim();
const output = path.resolve(process.argv[2] || '_site');
for (const file of ['index.html', 'download/index.html', 'v1/getting-started.html']) {
  const html = fs.readFileSync(path.join(output, file), 'utf8');
  assert.ok(!html.includes('0.0.7'), `${file}: stale version`);
  assert.ok(!html.includes('{{ site.data.release'), `${file}: unrendered release data`);
  assert.ok(html.includes(`v${version}`), `${file}: missing current version`);
}
const download = fs.readFileSync(path.join(output, 'download/index.html'), 'utf8');
for (const file of ['Install-RobOS.cmd', 'Install-RobOS.ps1', 'WINDOWS-SHA256SUMS']) {
  assert.ok(download.includes(`https://github.com/nddipiazza/robos/releases/download/v${version}/${file}`), `Missing release asset: ${file}`);
}
assert.ok(download.includes('id="windows"') && download.includes('id="linux-distro"'));
console.log(`Install documentation verified for v${version}.`);
