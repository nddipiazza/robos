'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// GitHub recommends serial writes, at least a second apart, and respecting
// Retry-After. Preserve completed uploads when a runner or connection fails.
function client(token, { fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  let nextWrite = 0;
  return async function request(url, { method = 'GET', json, file, allow404 = false } = {}) {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (method !== 'GET') { await sleep(Math.max(0, nextWrite - now())); nextWrite = now() + 1100; }
      const response = await fetcher(url, { method, headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        ...(file ? { 'Content-Type': 'application/octet-stream', 'Content-Length': String(fs.statSync(file).size) } : {}),
      }, ...(json ? { body: JSON.stringify(json) } : {}),
      ...(file ? { body: fs.createReadStream(file), duplex: 'half' } : {}) });
      const body = await response.text();
      let data; try { data = body ? JSON.parse(body) : null; } catch { data = { message: body.slice(0, 500) }; }
      if (allow404 && response.status === 404) return { data: null, headers: response.headers };
      if (response.ok) return { data, headers: response.headers };
      const limited = response.status === 429 || response.status === 403 && /rate limit/i.test(data?.message || '');
      if (attempt < 4 && (limited || response.status >= 500)) {
        const retryAfter = response.headers.get('retry-after');
        const retryMs = retryAfter && (Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now());
        const resetMs = response.headers.get('x-ratelimit-remaining') === '0' ? Number(response.headers.get('x-ratelimit-reset')) * 1000 - now() : 0;
        const delay = Math.max(0, retryMs || 0, resetMs || 0, limited && !retryAfter ? 60000 * 2 ** attempt : 2000 * 2 ** attempt);
        console.log(`GitHub returned ${response.status}; retrying in ${Math.ceil(delay / 1000)} seconds`);
        await sleep(delay);
        continue;
      }
      throw new Error(`GitHub ${method} failed (${response.status}): ${data?.message || 'Unknown response'}`);
    }
  };
}
async function list(request, url) {
  const result = [];
  while (url) {
    const response = await request(url);
    result.push(...response.data);
    url = response.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1];
  }
  return result;
}
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function sameAsset(asset, size, hash) {
  return asset.state === 'uploaded' && asset.size === size && asset.digest === `sha256:${hash}`;
}
async function publish(directory, { token = process.env.GITHUB_TOKEN, repository = process.env.GITHUB_REPOSITORY, request } = {}) {
  if (!request && !token) throw new Error('GITHUB_TOKEN is required');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid repository');
  request ||= client(token);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json')));
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version) || !/^[a-f0-9]{40}$/.test(manifest.revision)) throw new Error('Invalid release identity');
  const tag = `v${manifest.version}`, api = `https://api.github.com/repos/${repository}`;
  const files = fs.readdirSync(directory).filter(name => fs.statSync(path.join(directory, name)).isFile()).sort();
  const hashes = new Map();
  for (const name of files) hashes.set(name, await sha256(path.join(directory, name)));
  let release = (await request(`${api}/releases/tags/${tag}`, { allow404: true })).data;
  // Draft releases may not be discoverable by tag until they are published.
  if (!release) release = (await list(request, `${api}/releases?per_page=100`)).find(item => item.tag_name === tag);
  const ref = (await request(`${api}/git/ref/tags/${tag}`, { allow404: true })).data;
  if (ref) {
    let object = ref.object;
    while (object.type === 'tag') object = (await request(`${api}/git/tags/${object.sha}`)).data.object;
    if (object.sha !== manifest.revision) throw new Error('Existing tag points to a different source revision');
  }
  if (release && release.target_commitish !== manifest.revision) throw new Error('Existing release points to a different source revision');
  if (!release) release = (await request(`${api}/releases`, { method: 'POST', json: {
    tag_name: tag, target_commitish: manifest.revision, name: `RobOS ${tag}`, draft: true, prerelease: tag.includes('-'),
  } })).data;
  const assets = await list(request, `${api}/releases/${release.id}/assets?per_page=100`);
  let reused = 0;
  for (const name of files) {
    const file = path.join(directory, name), size = fs.statSync(file).size;
    const existing = assets.find(asset => asset.name === name);
    if (existing && sameAsset(existing, size, hashes.get(name))) { reused++; continue; }
    if (existing) {
      if (!release.draft || existing.state === 'uploaded') throw new Error(`Conflicting existing release asset: ${name}`);
      await request(`${api}/releases/assets/${existing.id}`, { method: 'DELETE' });
    }
    const url = new URL(release.upload_url.split('{')[0]);
    url.searchParams.set('name', name);
    const uploaded = (await request(url.href, { method: 'POST', file })).data;
    if (!sameAsset(uploaded, size, hashes.get(name))) throw new Error(`Uploaded asset failed verification: ${name}`);
    console.log(`Uploaded ${name}`);
  }
  // Verify the complete remote set again before making a draft public.
  const remote = await list(request, `${api}/releases/${release.id}/assets?per_page=100`);
  for (const name of files) if (!sameAsset(remote.find(asset => asset.name === name) || {}, fs.statSync(path.join(directory, name)).size, hashes.get(name))) throw new Error(`Missing or corrupt remote asset: ${name}`);
  await request(`${api}/releases/${release.id}`, { method: 'PATCH', json: {
    draft: false, prerelease: tag.includes('-'), make_latest: tag.includes('-') ? 'false' : 'true',
    body: 'RobOS App Manager for Windows, Ubuntu GNOME and macOS (Intel and Apple Silicon).\n\nInstall or uninstall one app, several selected apps or the entire library in a batch. Apps download separately for your OS and CPU, with shared components downloaded once and native launchers for every app.\n\nUninstall all apps keeps App Manager available. Uninstall RobOS removes the manager and its managed library. Personal settings are retained.\n\nVerified: core unit tests, the complete Windows app startup audit, packaged manager lifecycle tests and all four platform builds. SHA256SUMS and release-manifest.json identify every download and its source revision.',
  } });
  console.log(`Published ${tag}: ${files.length} verified assets (${reused} completed uploads reused)`);
}
module.exports = { client, list, sameAsset, publish };
if (require.main === module) publish(path.resolve(process.argv[2] || 'release/publish')).catch(error => { console.error(error.message); process.exitCode = 1; });
