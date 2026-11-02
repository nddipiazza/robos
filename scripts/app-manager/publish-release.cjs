'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { packagesTag } = require('../../packages/app-manager/lib/catalog.cjs');

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
const PACKAGE_FILE = /^robos-.+-(win32|linux|darwin)-(x64|arm64)\.(?:tgz|json)$/;
const SYSTEMS = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' };
// Everything else stays in the main release, where people look for something to download.
function groupFiles(files, version) {
  const main = [], packages = new Map();
  for (const name of files) {
    const match = name.match(PACKAGE_FILE);
    if (!match) { main.push(name); continue; }
    const tag = packagesTag(version, match[1], match[2]);
    if (!packages.has(tag)) packages.set(tag, { platform: match[1], arch: match[2], files: [] });
    packages.get(tag).files.push(name);
  }
  return { main, packages };
}
function mainNotes(tag, repository, files, packages) {
  const file = name => `https://github.com/${repository}/releases/download/${tag}/${name}`;
  const installer = artifact => {
    const name = `RobOS-${tag}-${artifact}`;
    if (!files.includes(name)) throw new Error(`Release is missing its installer: ${name}`);
    return `[${name}](${file(name)})`;
  };
  const rows = Object.entries({ '**Windows**': 'Windows-Setup.exe', '**Ubuntu with GNOME**': 'Linux-amd64.deb', '**Mac with Apple chip** (M1 or later)': 'macOS-arm64.dmg',
    '**Mac with Intel chip**': 'macOS-x64.dmg', '**Other Linux** (needs FUSE 2)': 'Linux-x86_64.AppImage' });
  const folders = [...packages].map(([name, item]) => `[${SYSTEMS[item.platform]} ${item.arch}](https://github.com/${repository}/releases/tag/${name})`);
  return [
    '## Download RobOS', '',
    'Choose the one file for your computer. It installs RobOS App Manager, where you pick your apps.', '',
    '| Your computer | Download |', '|---|---|',
    ...rows.map(([label, artifact]) => `| ${label} | ${installer(artifact)} |`), '',
    'App Manager downloads the apps you choose for you, so you need only this one file. Verify any download with [SHA256SUMS](' + file('SHA256SUMS') + ').', '',
    '## What this is', '',
    'Install or uninstall one app, several selected apps or the entire library in a batch. Apps download separately for your OS and CPU, with shared components downloaded once and native launchers for every app.', '',
    'Uninstall all apps keeps App Manager available. Uninstall RobOS removes the manager and its managed library. Personal settings are retained.', '',
    `Verified: core unit tests, the complete Windows app startup audit, packaged manager lifecycle tests and all four platform builds. SHA256SUMS and [release-manifest.json](${file('release-manifest.json')}) identify every download and its source revision.`, '',
    `App packages are kept in separate releases, one for each system: ${folders.join(' · ')}.`,
  ].join('\n');
}
function packageNotes(tag, repository, item) {
  return `App packages for ${SYSTEMS[item.platform]} ${item.arch}. RobOS App Manager downloads these for you, so there is nothing here to install by hand.\n\n**Looking for RobOS? [Download it here](https://github.com/${repository}/releases/tag/${tag}).**`;
}
async function publish(directory, { token = process.env.GITHUB_TOKEN, repository = process.env.GITHUB_REPOSITORY, request } = {}) {
  if (!request && !token) throw new Error('GITHUB_TOKEN is required');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid repository');
  request ||= client(token);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json')));
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version) || !/^[a-f0-9]{40}$/.test(manifest.revision)) throw new Error('Invalid release identity');
  const tag = `v${manifest.version}`, api = `https://api.github.com/repos/${repository}`;
  const all = fs.readdirSync(directory).filter(name => fs.statSync(path.join(directory, name)).isFile()).sort();
  const hashes = new Map();
  for (const name of all) hashes.set(name, await sha256(path.join(directory, name)));
  const { main, packages } = groupFiles(all, manifest.version);
  const notes = mainNotes(tag, repository, main, packages);
  async function upload(releaseTag, title, prerelease, files) {
    let release = (await request(`${api}/releases/tags/${releaseTag}`, { allow404: true })).data;
    // Draft releases may not be discoverable by tag until they are published.
    if (!release) release = (await list(request, `${api}/releases?per_page=100`)).find(item => item.tag_name === releaseTag);
    const ref = (await request(`${api}/git/ref/tags/${releaseTag}`, { allow404: true })).data;
    if (ref) {
      let object = ref.object;
      while (object.type === 'tag') object = (await request(`${api}/git/tags/${object.sha}`)).data.object;
      if (object.sha !== manifest.revision) throw new Error('Existing tag points to a different source revision');
    }
    if (release && release.target_commitish !== manifest.revision) throw new Error('Existing release points to a different source revision');
    if (!release) release = (await request(`${api}/releases`, { method: 'POST', json: {
      tag_name: releaseTag, target_commitish: manifest.revision, name: title, draft: true, prerelease,
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
    for (const name of files) if (!sameAsset(remote.find(asset => asset.name === name) || {}, fs.statSync(path.join(directory, name)).size, hashes.get(name))) throw new Error(`Missing or corrupted release asset: ${name}`);
    return { release, reused };
  }
  // Nothing goes public until every release has verified. The main release goes last, so
  // its installers are never available before the packages they will download.
  const uploads = [];
  for (const [name, item] of packages) uploads.push({ ...await upload(name, `RobOS ${tag} app packages: ${SYSTEMS[item.platform]} ${item.arch}`, true, item.files), json: {
    draft: false, prerelease: true, make_latest: 'false', body: packageNotes(tag, repository, item) } });
  uploads.push({ ...await upload(tag, `RobOS ${tag}`, tag.includes('-'), main), json: {
    draft: false, prerelease: tag.includes('-'), make_latest: tag.includes('-') ? 'false' : 'true', body: notes } });
  for (const { release, json } of uploads) await request(`${api}/releases/${release.id}`, { method: 'PATCH', json });
  console.log(`Published ${tag}: ${all.length} verified assets in ${uploads.length} releases (${uploads.reduce((sum, item) => sum + item.reused, 0)} completed uploads reused)`);
}
module.exports = { client, list, sameAsset, groupFiles, mainNotes, publish };
if (require.main === module) publish(path.resolve(process.argv[2] || 'release/publish')).catch(error => { console.error(error.message); process.exitCode = 1; });
