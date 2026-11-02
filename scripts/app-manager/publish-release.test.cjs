'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { client, publish, list, groupFiles, mainNotes } = require('./publish-release.cjs');
const { targets } = require('./stage-release.cjs');
const { verifiedSource, required } = require('./release-source.cjs');

test('API writes are paced and rate limits honor Retry-After before retrying', async () => {
  let time = 0, calls = 0;
  const sleeps = [], writes = [];
  const request = client('test', { now: () => time, sleep: async ms => { sleeps.push(ms); time += ms; },
    fetcher: async (_url, options) => {
      calls++;
      if (calls === 1) return Response.json({ message: 'secondary rate limit' }, { status: 429, headers: { 'retry-after': '2' } });
      if (options.method === 'POST') writes.push(time);
      return Response.json({ ok: true });
    } });
  await request('https://api.github.com/test');
  await request('https://api.github.com/test', { method: 'POST', json: { a: 1 } });
  await request('https://api.github.com/test', { method: 'POST', json: { a: 2 } });
  assert.ok(sleeps.includes(2000));
  assert.ok(writes[1] - writes[0] >= 1000);
});
test('recovery refuses artifacts unless every original platform and regression gate passed', () => {
  const run = { path: '.github/workflows/app-manager.yml', status: 'completed', head_sha: 'a'.repeat(40), head_repository: { full_name: 'owner/repo' } };
  const jobs = required.map(name => ({ name, conclusion: 'success' }));
  assert.equal(verifiedSource(run, jobs, 'owner/repo'), run.head_sha);
  for (const name of required) assert.throws(() => verifiedSource(run, jobs.filter(job => job.name !== name), 'owner/repo'), /Required release check/);
  assert.throws(() => verifiedSource(run, jobs, 'other/repo'), /Not a completed/);
});
test('pagination follows the server next link so large catalogs are fully verified', async () => {
  const result = await list(async url => ({ data: [url], headers: new Headers(url === 'first' ? { link: '<second>; rel="next"' } : {}) }), 'first');
  assert.deepEqual(result, ['first', 'second']);
});
const installers = version => targets.flatMap(([, , ...artifacts]) => artifacts.map(artifact => `RobOS-v${version}-${artifact}`));
// A small stand-in for GitHub that keeps each release's state by tag.
function fakeGitHub(directory, revision, seed = {}) {
  const releases = new Map(), mutations = [];
  const asset = name => ({ id: `${name}-id`, name, state: 'uploaded', size: fs.statSync(path.join(directory, name)).size,
    digest: 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex') });
  const add = (tag, assets = []) => { const id = releases.size + 1; const release = { id, tag_name: tag, draft: true, target_commitish: revision, upload_url: `https://uploads.github.com/${id}{?name}`, assets }; releases.set(tag, release); return release; };
  for (const [tag, assets] of Object.entries(seed)) add(tag, assets);
  const byId = id => [...releases.values()].find(item => item.id === id);
  const request = async (url, options = {}) => {
    const method = options.method || 'GET';
    if (method !== 'GET') mutations.push({ method, url, json: options.json });
    let data = null;
    const tagged = url.match(/\/releases\/tags\/(.+)$/);
    if (tagged) data = releases.get(tagged[1]) || null;
    else if (url.includes('/git/ref/')) data = null;
    else if (method === 'POST' && url.endsWith('/releases')) data = add(options.json.tag_name);
    else if (method === 'DELETE') { for (const item of releases.values()) item.assets = item.assets.filter(entry => !url.endsWith(`/${entry.id}`)); }
    else if (method === 'POST') { const release = byId(Number(new URL(url).pathname.slice(1))); data = asset(new URL(url).searchParams.get('name')); release.assets.push(data); }
    else if (method === 'PATCH') { const release = byId(Number(url.split('/').pop())); Object.assign(release, options.json); data = release; }
    else if (url.includes('/assets?')) data = byId(Number(url.match(/releases\/(\d+)\/assets/)[1])).assets.slice();
    else if (url.includes('/releases?')) data = [...releases.values()];
    else throw new Error('Unexpected request: ' + url);
    return { data, headers: new Headers() };
  };
  return { request, releases, mutations, asset };
}
function releaseFolder(t, version = '0.0.9') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-publisher-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const revision = 'a'.repeat(40);
  fs.writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify({ version, revision }));
  for (const name of ['SHA256SUMS', ...installers(version)]) fs.writeFileSync(path.join(directory, name), name);
  return { directory, revision };
}
test('recovery keeps matching uploads, repairs an incomplete upload and publishes only after verification', async t => {
  const { directory, revision } = releaseFolder(t), windows = 'RobOS-v0.0.9-Windows-Setup.exe';
  const seeded = fakeGitHub(directory, revision);
  const complete = fs.readdirSync(directory).filter(name => name !== windows).map(seeded.asset);
  const { request, mutations, releases } = fakeGitHub(directory, revision, { 'v0.0.9': [...complete, { id: 'partial', name: windows, state: 'starter', size: 0 }] });
  await publish(directory, { repository: 'owner/repo', request });
  assert.deepEqual(mutations.map(item => item.method), ['DELETE', 'POST', 'PATCH']);
  assert.match(mutations[1].url, /name=RobOS-v0.0.9-Windows-Setup.exe/);
  assert.equal(releases.get('v0.0.9').draft, false);
  const conflict = async (url, options) => url.includes('/git/ref/') ? { data: { object: { type: 'commit', sha: 'b'.repeat(40) } }, headers: new Headers() } : request(url, options);
  await assert.rejects(publish(directory, { repository: 'owner/repo', request: conflict }), /different source revision/);
});
test('app packages go to one release per platform, leaving the main release easy to read', async t => {
  const { directory, revision } = releaseFolder(t);
  const packages = ['robos-catalog-linux-x64.json', 'robos-audio-player-v0.0.9-linux-x64.tgz', 'robos-audio-player-v0.0.9-win32-x64.tgz', 'robos-catalog-darwin-arm64.json'];
  for (const name of packages) fs.writeFileSync(path.join(directory, name), name);
  const { request, releases, mutations } = fakeGitHub(directory, revision);
  await publish(directory, { repository: 'owner/repo', request });
  const names = tag => releases.get(tag).assets.map(item => item.name).sort();
  assert.deepEqual([...releases.keys()].sort(), ['apps-v0.0.9-darwin-arm64', 'apps-v0.0.9-linux-x64', 'apps-v0.0.9-win32-x64', 'v0.0.9']);
  assert.deepEqual(names('apps-v0.0.9-linux-x64'), ['robos-audio-player-v0.0.9-linux-x64.tgz', 'robos-catalog-linux-x64.json']);
  assert.deepEqual(names('apps-v0.0.9-win32-x64'), ['robos-audio-player-v0.0.9-win32-x64.tgz']);
  assert.ok(!names('v0.0.9').some(name => name.startsWith('robos-')));
  for (const name of installers('0.0.9')) assert.ok(names('v0.0.9').includes(name));
  // Only the main release can become "Latest", and it goes public after everything it depends on.
  const patches = mutations.filter(item => item.method === 'PATCH');
  assert.ok(mutations.findIndex(item => item.method === 'PATCH') > mutations.map(item => item.method).lastIndexOf('POST'), 'nothing is public until every upload is verified');
  assert.equal(patches.at(-1).json.make_latest, 'true');
  for (const patch of patches.slice(0, -1)) { assert.equal(patch.json.make_latest, 'false'); assert.equal(patch.json.prerelease, true); assert.match(patch.json.body, /releases\/tag\/v0\.0\.9/); }
});
test('the release description links every installer directly', () => {
  const files = ['SHA256SUMS', 'release-manifest.json', ...installers('1.2.3')];
  const { main, packages } = groupFiles([...files, 'robos-catalog-linux-x64.json'], '1.2.3');
  assert.deepEqual(main.sort(), files.sort());
  const notes = mainNotes('v1.2.3', 'owner/repo', main, packages);
  for (const name of installers('1.2.3')) assert.ok(notes.includes(`[${name}](https://github.com/owner/repo/releases/download/v1.2.3/${name})`), name);
  assert.ok(notes.includes('https://github.com/owner/repo/releases/tag/apps-v1.2.3-linux-x64'));
  assert.ok(notes.indexOf('RobOS-v1.2.3-Windows-Setup.exe') < notes.indexOf('## What this is'), 'downloads come first');
  assert.throws(() => mainNotes('v1.2.3', 'owner/repo', main.filter(name => !name.endsWith('.deb')), packages), /missing its installer/);
});
