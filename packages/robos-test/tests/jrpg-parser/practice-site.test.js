'use strict';

// The course's Ember Quest demo, end to end: the real harvester downloads from the
// practice site on this machine, the real parser reads it, and a robot plays the result.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const demo = path.resolve(__dirname, '../../../robos-jrpg-parser/demo');
const { build } = require(path.join(demo, 'practice-site'));
const { serve } = require(path.join(demo, 'serve'));
const { addGuidePages } = require(path.join(demo, 'collect'));
const { buildGame } = require(path.join(demo, 'build-game'));
const { createGame } = require(path.join(demo, 'game/engine'));
const { run } = require(path.join(demo, 'game/robot'));

const exec = promisify(execFile);
const harvester = path.resolve(demo, '../tools/harvest_jrpg_assets.py');
const parser = path.resolve(demo, '../bin/jrpg-parser.js');

describe('Ember Quest practice demo', () => {
  let dir; let site; let requests; let parsed; let data;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-quest-'));
    build(path.join(dir, 'site'));
    requests = [];
    site = await serve(path.join(dir, 'site'), { onRequest: r => requests.push(r) });
  });
  after(() => {
    site.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('downloads only the Ember Quest maps and the listed guide pages', async () => {
    const collection = path.join(dir, 'collection');
    const atlas = `${site.url}/atlas/`;
    await exec('python3', [harvester, '--out-dir', collection, '--vgmaps-index', atlas, '--base-url', atlas, '--map-prefix', 'EmberQuest-', '--discover-only']);
    const manifest = addGuidePages(collection, site.url);
    assert.strictEqual(manifest.maps.length, 3);
    await exec('python3', [harvester, '--out-dir', collection, '--manifest', path.join(collection, 'sources-manifest.json'), '--delay', '0']);
    assert.ok(fs.existsSync(path.join(collection, 'EmberQuest-AshfordTown.png')));
    assert.ok(!fs.existsSync(path.join(collection, 'StarKnight-World.png')));
    assert.ok(!requests.some(r => r.url.includes('StarKnight')), 'The other game on the site must never be requested');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(collection, 'download-receipt.json'), 'utf8')).length, 10);
  });

  it('sets the remake aside and reports the price the sources disagree on', async () => {
    const { stdout: scan } = await exec('node', [parser, 'scan', path.join(dir, 'collection')]);
    assert.match(scan, /skip\s+document\s+guide\/anniversary-prices\.html/);
    await exec('node', [parser, 'parse', path.join(dir, 'collection'), '--out', path.join(dir, 'kgraph'), '--title', 'Ember Quest', '--edition', 'Retro (1989)', '--no-agent']);
    parsed = JSON.parse(fs.readFileSync(path.join(dir, 'kgraph', 'parsed.json'), 'utf8'));
    assert.strictEqual(parsed.equipment.find(e => e.name === 'Iron Sword').price, 40);
    assert.deepStrictEqual(parsed.conflicts, ['Iron Sword: price is 40 in guide/weapons.html but 45 in guide/shopkeeper-notes.html.']);
  });

  it('cuts the maps into numbered tiles the rules can use', () => {
    data = buildGame(path.join(dir, 'collection'), path.join(dir, 'kgraph', 'parsed.json'), path.join(dir, 'game'));
    assert.strictEqual(data.maps['Ashford Town'].grid.length, 12);
    assert.strictEqual(data.maps['Ashford Town'].grid[0].length, 16);
    const tree = data.tiles[data.maps['Ashford Town'].grid[0][0]];
    assert.strictEqual(tree.kind, 'tree');
    assert.strictEqual(tree.walkable, false);
  });

  it('lets the robot finish the game with the parsed numbers', async () => {
    const game = createGame(data);
    const feature = fs.readFileSync(path.join(demo, 'game/first-adventure.feature'), 'utf8');
    const results = await run(feature, { game, press: async key => game.press(key) });
    assert.deepStrictEqual(results.filter(r => r.status !== 'passed'), []);
    assert.strictEqual(game.state.mode, 'won');
    assert.ok(game.state.hp > 0, 'The hero must survive');
  });

  it('fails the robot when the game does not match the script', async () => {
    const game = createGame({ ...data, startingGold: 45 });
    const feature = fs.readFileSync(path.join(demo, 'game/first-adventure.feature'), 'utf8');
    const results = await run(feature, { game, press: async key => game.press(key) });
    const failed = results.find(r => r.status === 'failed');
    assert.match(failed.error, /Expected the gold to be 50 but it is 45/);
  });

  it('shows a hero standing in a tree can still satisfy a check that only reads the map name', () => {
    const game = createGame(data, { spawn: { x: 10, y: 8 } });
    assert.strictEqual(game.state.map, 'Ashford Town');
    assert.strictEqual(game.tileAt(game.state.map, game.state.x, game.state.y).kind, 'tree');
  });
});
