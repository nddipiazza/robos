'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verify, targets } = require('../../../scripts/app-manager/stage-release.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-release-assets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [platform, arch, artifact] of targets) {
    fs.writeFileSync(path.join(directory, `RobOS-v1.2.3-${artifact}`), 'manager');
    const name = `sample-${platform}-${arch}.tgz`, payload = Buffer.from(`payload-${platform}-${arch}`);
    fs.writeFileSync(path.join(directory, name), payload);
    fs.writeFileSync(path.join(directory, `robos-catalog-${platform}-${arch}.json`), JSON.stringify({ schema: 1, version: '1.2.3', platform, arch,
      components: [{ id: 'sample-app', kind: 'app', label: 'Sample', group: 'Tests', version: '1.2.3', dependencies: [],
        bytes: payload.length, unpackedBytes: 100, sha256: crypto.createHash('sha256').update(payload).digest('hex'),
        url: `https://github.com/nddipiazza/robos/releases/download/v1.2.3/${name}` }] }));
  }
  return directory;
}
test('publication requires complete catalogs and payloads for all four platform targets', async t => {
  const directory = fixture(t);
  assert.equal((await verify(directory, '1.2.3')).length, 4);
  fs.rmSync(path.join(directory, 'RobOS-v1.2.3-macOS-x64.dmg'));
  await assert.rejects(verify(directory, '1.2.3'), /Missing manager/);
});
test('publication rejects missing or corrupted component payloads', async t => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'sample-win32-x64.tgz'), 'corrupt');
  await assert.rejects(verify(directory, '1.2.3'), /Invalid component checksum/);
  fs.rmSync(path.join(directory, 'sample-win32-x64.tgz'));
  await assert.rejects(verify(directory, '1.2.3'), /Missing component/);
});
