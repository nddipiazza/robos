'use strict';
// Read-only catalog validation. This never installs or uninstalls software.
const fs = require('node:fs');
const path = require('node:path');
const { PACKAGES, NPM_PACKAGES, runProcess } = require('../../packages/software-center/windows-tools');

async function main() {
  const results = [];
  for (const [id, packageId] of Object.entries(PACKAGES)) {
    const result = await runProcess('winget.exe', ['show', '--id', packageId, '--exact', '--source', 'winget',
      '--accept-source-agreements', '--disable-interactivity'], { timeout: 60000 });
    const entry = { id, provider: 'winget', packageId, ok: result.code === 0, output: result.output.trim() };
    results.push(entry);
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${id}: ${packageId}`);
  }
  for (const [id, npmPackage] of Object.entries(NPM_PACKAGES)) {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(npmPackage)}/latest`, { signal: AbortSignal.timeout(30000) });
    const info = await response.json();
    const entry = { id, provider: 'npm', npmPackage, ok: response.ok && !!info.version && (!info.os || info.os.includes('win32') || !info.os.some(p => !p.startsWith('!')) && !info.os.includes('!win32')),
      version: info.version, engines: info.engines, bin: info.bin };
    results.push(entry);
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${id}: ${npmPackage}`);
  }
  const output = path.resolve(process.argv[2] || 'run/windows-software-center-catalog.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ timestamp: new Date().toISOString(), platform: process.platform, results }, null, 2) + '\n');
  console.log(`Evidence: ${output}`);
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
