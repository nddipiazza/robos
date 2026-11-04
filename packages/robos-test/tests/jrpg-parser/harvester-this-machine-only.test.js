'use strict';

// The harvester downloads from this machine and nowhere else. Real fan sites are collected
// by hand. The refused addresses use reserved names, so a broken check cannot reach anyone.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const exec = promisify(execFile);
const harvester = path.resolve(__dirname, '../../../robos-jrpg-parser/tools/harvest_jrpg_assets.py');

const harvest = (args, env = process.env) => exec('python3', [harvester, ...args], { env });

describe('harvester stays on this machine', () => {
  let dir; let server; let url; let seen;
  const outDir = name => path.join(dir, name);
  const writeManifest = (name, manifest) => {
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(manifest));
    return file;
  };

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harvester-'));
    seen = [];
    server = http.createServer((req, res) => {
      seen.push(req);
      if (req.url === '/moved-away') {
        res.writeHead(302, { Location: 'http://fan-site.test/map.png' });
        res.end();
      } else if (req.url === '/moved-here') {
        res.writeHead(302, { Location: '/map.png' });
        res.end();
      } else {
        res.end('a map');
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('names itself honestly', async () => {
    const manifest = writeManifest('honest', { maps: [{ url: `${url}/map.png`, file: 'map.png' }] });
    await harvest(['--out-dir', outDir('honest'), '--manifest', manifest, '--delay', '0']);
    const agent = seen.at(-1).headers['user-agent'];
    assert.match(agent, /^robos-jrpg-harvester\//);
    assert.doesNotMatch(agent, /Mozilla|Chrome|Safari/);
  });

  it('has no default site to fall back on', async () => {
    await assert.rejects(harvest(['--out-dir', outDir('nothing')]), /there is no default site/);
    const page = path.join(dir, 'index.html');
    fs.writeFileSync(page, '<a href="Game-World.png">map</a>');
    await assert.rejects(harvest(['--out-dir', outDir('page'), '--vgmaps-index', page]), /--base-url is required/);
  });

  it('no longer knows how to find wiki pages', async () => {
    await assert.rejects(harvest(['--out-dir', outDir('wiki'), '--wiki-slug', 'Some_Game']), /unrecognized arguments/);
  });

  for (const [name, address] of Object.entries({
    'another host': 'https://fan-site.test/atlas/',
    'a host that only starts like this machine': 'http://127.0.0.1.fan-site.test/atlas/',
    'a host hidden behind a user name': 'http://127.0.0.1@fan-site.test/atlas/',
    'a user name hiding behind a backslash': 'http://fan-site.test\\@127.0.0.1/atlas/',
    'an address on the local network': 'http://192.168.1.10/atlas/',
    'a file link': 'file:///etc/hostname',
  })) {
    it(`refuses ${name} as the index page`, async () => {
      const out = outDir(`index-${name.replace(/\W/g, '-')}`);
      await assert.rejects(harvest(['--out-dir', out, '--vgmaps-index', address]), /Refusing .*only downloads from this machine/);
      assert.ok(!fs.existsSync(path.join(out, 'sources-manifest.json')));
    });
  }

  it('refuses a whole manifest if one address is elsewhere, before downloading anything', async () => {
    const before = seen.length;
    const manifest = writeManifest('mixed', { maps: [{ url: `${url}/map.png`, file: 'map.png' }], strategywiki: [{ url: 'https://fan-site.test/guide.html', file: 'guide.html' }] });
    await assert.rejects(harvest(['--out-dir', outDir('mixed'), '--manifest', manifest, '--delay', '0']), /Refusing https:\/\/fan-site\.test/);
    assert.strictEqual(seen.length, before);
  });

  it('refuses a link on the index page that points elsewhere', async () => {
    const page = path.join(dir, 'links.html');
    fs.writeFileSync(page, '<a href="https://fan-site.test/Game-World.png">map</a>');
    const out = outDir('links');
    await assert.rejects(harvest(['--out-dir', out, '--vgmaps-index', page, '--base-url', `${url}/`, '--map-prefix', 'Game-', '--discover-only']), /Refusing https:\/\/fan-site\.test/);
    assert.ok(!fs.existsSync(path.join(out, 'sources-manifest.json')));
  });

  it('refuses a redirect off this machine but follows one that stays', async () => {
    const away = writeManifest('away', { maps: [{ url: `${url}/moved-away`, file: 'map.png' }] });
    await assert.rejects(harvest(['--out-dir', outDir('away'), '--manifest', away, '--delay', '0']), /Refusing http:\/\/fan-site\.test/);
    const here = writeManifest('here', { maps: [{ url: `${url}/moved-here`, file: 'map.png' }] });
    await harvest(['--out-dir', outDir('here'), '--manifest', here, '--delay', '0']);
    assert.strictEqual(fs.readFileSync(path.join(outDir('here'), 'map.png'), 'utf8'), 'a map');
  });

  it('ignores a proxy set in the environment', async () => {
    const manifest = writeManifest('proxy', { maps: [{ url: `${url}/map.png`, file: 'map.png' }] });
    // Nothing listens on this port, so going through the proxy would fail the download.
    await harvest(['--out-dir', outDir('proxy'), '--manifest', manifest, '--delay', '0'], { ...process.env, http_proxy: 'http://127.0.0.1:9', no_proxy: '' });
    assert.strictEqual(fs.readFileSync(path.join(outDir('proxy'), 'map.png'), 'utf8'), 'a map');
  });
});
