'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { client } = require('../app-manager/publish-release.cjs');
const root = path.resolve(__dirname, '../..');
async function sha256(file) { const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
async function publish() {
  if (!process.env.GITHUB_TOKEN) throw new Error('Publishing needs GITHUB_TOKEN');
  const prefix = process.env.GAME_RELEASE_PREFIX || 'games-v';
  const version = require('./catalog.cjs').releaseVersion(prefix), tag = `${prefix}${version}`;
  const directory = path.join(root, 'release/games'), games = require('./catalog.cjs').releaseGames(prefix);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const expected = Object.entries(games).flatMap(([id, game]) => ['Windows-Setup.exe', 'Windows-x64.zip', 'Linux-x64.zip', 'macOS.zip', ...(game.web ? ['Web.zip'] : [])].map(suffix => `${id}-v${version}-${suffix}`));
  for (const name of expected) if (!fs.existsSync(path.join(directory, name)) || !fs.statSync(path.join(directory, name)).size) throw new Error(`Missing game build: ${name}`);
  for (const [id, game] of Object.entries(games)) for (const platform of ['windows', 'linux', 'macos', ...(game.web ? ['web'] : [])]) {
    const proof = JSON.parse(fs.readFileSync(path.join(directory, `${id}-${platform}-build.json`), 'utf8'));
    if (proof.revision !== revision || proof.version !== version || proof.id !== id || proof.platform !== platform) throw new Error(`Wrong build provenance: ${id}/${platform}`);
  }
  const sums = [];
  for (const name of expected) sums.push(`${await sha256(path.join(directory, name))}  ${name}`);
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
  const files = [...expected, 'SHA256SUMS.txt', ...Object.entries(games).flatMap(([id, game]) => ['windows', 'linux', 'macos', ...(game.web ? ['web'] : [])].map(platform => `${id}-${platform}-build.json`))];
  const hashes = new Map(); for (const name of files) hashes.set(name, await sha256(path.join(directory, name)));
  const request = client(process.env.GITHUB_TOKEN), api = 'https://api.github.com/repos/nddipiazza/robos';
  let release = (await request(`${api}/releases/tags/${tag}`, { allow404: true })).data;
  if (!release) release = (await request(`${api}/releases`, { method: 'POST', json: { tag_name: tag, target_commitish: revision, name: `RobOS standalone games v${version}`, draft: true, prerelease: true } })).data;
  const assets = (await request(`${api}/releases/${release.id}/assets?per_page=100`)).data;
  for (const name of files) {
    const file = path.join(directory, name), existing = assets.find(asset => asset.name === name);
    if (existing && existing.digest === `sha256:${hashes.get(name)}` && existing.size === fs.statSync(file).size && existing.state === 'uploaded') continue;
    if (existing) throw new Error(`Existing game release differs: ${name}. Bump VERSION instead of overwriting a published build.`);
    const url = new URL(release.upload_url.split('{')[0]); url.searchParams.set('name', name);
    const uploaded = (await request(url.href, { method: 'POST', file })).data;
    if (uploaded.digest !== `sha256:${hashes.get(name)}` || uploaded.size !== fs.statSync(file).size) throw new Error(`Upload verification failed: ${name}`);
    console.log(`Uploaded ${name}`);
  }
  const notes = ['Free standalone game downloads. No Godot editor, Git or RobOS installation required.', '',
    ...Object.entries(games).map(([id, game]) => `- [${game.title}](https://rowbose.com${require('./catalog.cjs').pagePath(id, game)}#download)`), '',
    'Windows: run the Setup EXE and leave Play checked, or extract the portable ZIP. Linux: extract the ZIP and run the game binary. macOS: extract the universal app ZIP (unsigned).', '',
    'These are development builds. SHA256SUMS.txt and per-platform build provenance are included.'].join('\n');
  await request(`${api}/releases/${release.id}`, { method: 'PATCH', json: { draft: false, prerelease: true, body: notes } });
  console.log(`Published https://github.com/nddipiazza/robos/releases/tag/${tag}`);
}
if (require.main === module) publish().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { publish };
