'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verify, targets } = require('../../../scripts/app-manager/stage-release.cjs');
const { validateCatalog, packagesTag } = require('../lib/catalog.cjs');
const { Manager } = require('../lib/manager.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-release-assets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [platform, arch, ...artifacts] of targets) {
    for (const artifact of artifacts) fs.writeFileSync(path.join(directory, `RobOS-v1.2.3-${artifact}`), 'manager');
    const name = `sample-${platform}-${arch}.tgz`, payload = Buffer.from(`payload-${platform}-${arch}`);
    fs.writeFileSync(path.join(directory, name), payload);
    fs.writeFileSync(path.join(directory, `robos-catalog-${platform}-${arch}.json`), JSON.stringify({ schema: 1, version: '1.2.3', platform, arch,
      components: [{ id: 'sample-app', kind: 'app', label: 'Sample', group: 'Tests', version: '1.2.3', dependencies: [],
        bytes: payload.length, unpackedBytes: 100, sha256: crypto.createHash('sha256').update(payload).digest('hex'),
        url: `https://github.com/nddipiazza/robos/releases/download/apps-v1.2.3-${platform}-${arch}/${name}` }] }));
  }
  return directory;
}
test('publication requires complete catalogs and payloads for all four platform targets', async t => {
  const directory = fixture(t);
  assert.equal((await verify(directory, '1.2.3')).length, 4);
  fs.rmSync(path.join(directory, 'RobOS-v1.2.3-macOS-x64.dmg'));
  await assert.rejects(verify(directory, '1.2.3'), /Missing manager/);
  fs.writeFileSync(path.join(directory, 'RobOS-v1.2.3-macOS-x64.dmg'), 'manager');
  fs.rmSync(path.join(directory, 'RobOS-v1.2.3-Linux-amd64.deb'));
  await assert.rejects(verify(directory, '1.2.3'), /Missing manager/);
});
test('publication rejects missing or corrupted component payloads', async t => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'sample-win32-x64.tgz'), 'corrupt');
  await assert.rejects(verify(directory, '1.2.3'), /Invalid component checksum/);
  fs.rmSync(path.join(directory, 'sample-win32-x64.tgz'));
  await assert.rejects(verify(directory, '1.2.3'), /Missing component/);
});
test('catalogs and packages come only from the release for this version, OS and CPU', async t => {
  assert.equal(packagesTag('1.2.3', 'linux', 'x64'), 'apps-v1.2.3-linux-x64');
  const base = 'https://github.com/nddipiazza/robos/releases/download/';
  const doc = url => ({ schema: 1, version: '1.2.3', platform: 'linux', arch: 'x64', components: [{ id: 'sample-app', kind: 'app', label: 'Sample', group: 'Tests',
    version: '1.2.3', dependencies: [], bytes: 1, unpackedBytes: 1, sha256: 'a'.repeat(64), url }] });
  assert.ok(validateCatalog(doc(`${base}apps-v1.2.3-linux-x64/sample.tgz`), 'linux', 'x64'));
  for (const url of [`${base}v1.2.3/sample.tgz`, `${base}apps-v1.2.3-win32-x64/sample.tgz`, `${base}apps-v1.2.4-linux-x64/sample.tgz`, 'https://example.com/apps-v1.2.3-linux-x64/sample.tgz'])
    assert.throws(() => validateCatalog(doc(url), 'linux', 'x64'), /untrusted download URL/, url);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-catalog-url-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let requested;
  globalThis.fetch = async url => { requested = url; return new Response(JSON.stringify(doc(`${base}apps-v1.2.3-linux-x64/sample.tgz`))); };
  const manager = new Manager({ locations: { root: path.join(root, 'managed') }, native: {}, version: '1.2.3', platform: 'linux', arch: 'x64' });
  await manager.refresh();
  assert.equal(requested, `${base}apps-v1.2.3-linux-x64/robos-catalog-linux-x64.json`);
});
test('refreshing the catalog retries once after a network failure, but not after an HTTP error', async t => {
  const body = JSON.stringify({ schema: 1, version: '1.2.3', platform: 'linux', arch: 'x64', components: [] });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-catalog-retry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const manager = new Manager({ locations: { root: path.join(root, 'managed') }, native: {}, version: '1.2.3', platform: 'linux', arch: 'x64' });
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('fetch failed'); return new Response(body); };
  assert.ok((await manager.refresh()).catalog); assert.equal(calls, 2);
  calls = 0; globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
  await assert.rejects(manager.refresh(), /fetch failed/); assert.equal(calls, 2);
  calls = 0; globalThis.fetch = async () => { calls++; return new Response('', { status: 404 }); };
  await assert.rejects(manager.refresh(), /unavailable \(404\)/); assert.equal(calls, 1);
});
