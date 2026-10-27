'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { client, publish, list } = require('./publish-release.cjs');
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
test('recovery keeps matching uploads, repairs an incomplete upload and publishes only after verification', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-publisher-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const revision = 'a'.repeat(40), manifest = { version: '0.0.9', revision };
  fs.writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, 'manager.exe'), 'manager');
  const asset = name => ({ id: 5, name, state: 'uploaded', size: fs.statSync(path.join(directory, name)).size,
    digest: 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex') });
  const assets = [asset('release-manifest.json'), { id: 6, name: 'manager.exe', state: 'starter', size: 0 }];
  const mutations = [];
  const request = async (url, options = {}) => {
    const method = options.method || 'GET';
    if (method !== 'GET') mutations.push({ method, url, json: options.json });
    let data;
    if (url.endsWith('/releases/tags/v0.0.9')) data = { id: 10, draft: true, target_commitish: revision, upload_url: 'https://uploads.github.com/test{?name}' };
    else if (url.includes('/git/ref/')) data = { object: { type: 'commit', sha: revision } };
    else if (method === 'DELETE') assets.splice(1, 1);
    else if (method === 'POST') { data = asset(new URL(url).searchParams.get('name')); assets.push(data); }
    else if (method === 'PATCH') { assert.equal(assets.length, 2); assert.equal(options.json.draft, false); }
    else if (url.includes('/assets?')) data = assets.slice();
    else throw new Error('Unexpected request: ' + url);
    return { data, headers: new Headers() };
  };
  await publish(directory, { repository: 'owner/repo', request });
  assert.deepEqual(mutations.map(item => item.method), ['DELETE', 'POST', 'PATCH']);
  assert.match(mutations[1].url, /name=manager.exe/);
  const conflict = async (url, options) => {
    const response = await request(url, options);
    if (url.includes('/git/ref/')) response.data.object.sha = 'b'.repeat(40);
    return response;
  };
  await assert.rejects(publish(directory, { repository: 'owner/repo', request: conflict }), /different source revision/);
});
