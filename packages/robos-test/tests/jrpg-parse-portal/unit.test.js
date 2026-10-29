'use strict';

// JRPG Parse Portal: wikitext reading, the asset catalog, the kgraph folder
// format, both game profiles (Dragon Warrior from the local data store, Final
// Fantasy from an offline copy of its fan sites) and robos agent discovery.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORTAL = path.resolve(__dirname, '../../../jrpg-parse-portal');
const wt = require(path.join(PORTAL, 'lib/wikitext'));
const { ancestors, coverage, ASSET_TYPES, TYPE_HIERARCHY } = require(path.join(PORTAL, 'lib/asset-types'));
const { writeKgraphFolder, readKgraphFolder } = require(path.join(PORTAL, 'lib/kgraph-writer'));
const portal = require(path.join(PORTAL, 'lib/portal'));
const discovery = require(path.join(PORTAL, 'lib/agent-discovery'));
const { HttpCache } = require(path.join(PORTAL, 'lib/http-cache'));
const { createFakeFetch } = require('./fixtures/fake-fan-sites');

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-portal-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const nodesOf = (dir, pkg) => JSON.parse(fs.readFileSync(path.join(dir, '.robos/kgraphs', pkg, 'package.jsonld'), 'utf8'))['robos:nodes'];

describe('wikitext reader', () => {
  it('keeps gallery captions and self-closing refs inside one template parameter', () => {
    const [tpl] = wt.parseTemplates(`{{infobox enemy
| name = Goblin<br>'''NES:''' IMP<ref name="chart"/>
| image = <gallery>
A.png|PR
B.png|NES
</gallery>
| hp = 8
}}`, 'infobox enemy');
    assert.equal(tpl.params.hp, '8');
    assert.deepEqual(wt.extractFiles(tpl.params.image).map(f => [f.file, f.caption]), [['A.png', 'PR'], ['B.png', 'NES']]);
  });

  it('expands rowspan and colspan cells in wikitables', () => {
    const [t] = wt.parseTables(`{|
|-
!A
!B
!C
|-
!rowspan="2"|x
|1
|2
|-
|colspan="2"|wide
|}`);
    assert.deepEqual(t.headers, ['A', 'B', 'C']);
    assert.equal(t.rows[1][0], t.rows[0][0], 'row-spanning cell is shared');
    assert.deepEqual(t.rows[1].map(c => c.text), ['x', 'wide', 'wide']);
  });

  it('reads links with anchors and strips markup to text', () => {
    assert.deepEqual(wt.extractLinks('[[#Potion|Potion]] and [[Elfheim]]').map(l => [l.target, l.label]), [['', 'Potion'], ['Elfheim', 'Elfheim']]);
    assert.equal(wt.stripMarkup("'''Fire'''<br>{{J|ファイア|Faia}} [[Cornelia (Final Fantasy)|Cornelia]]<ref>x</ref>"), 'Fire / Cornelia');
  });

  it('returns a section with its subsections', () => {
    const text = '==A==\na\n===A1===\nb\n==B==\nc';
    assert.match(wt.sectionTree(text, 'A'), /a[\s\S]*A1[\s\S]*b/);
    assert.doesNotMatch(wt.sectionTree(text, 'A'), /\bc\b/);
  });
});

describe('asset catalog', () => {
  it('chains types to their parents, nearest first', () => {
    assert.deepEqual(ancestors('jrpg:Boss'), ['jrpg:Enemy', 'jrpg:Character', 'jrpg:Thing']);
    assert.deepEqual(ancestors('jrpg:Weapon'), ['jrpg:Equipment', 'jrpg:Item', 'jrpg:Thing']);
  });

  it('declares every type an asset category counts', () => {
    const known = new Set(TYPE_HIERARCHY.map(t => t[0]));
    for (const a of ASSET_TYPES) for (const t of a.types) assert.ok(known.has(t), `${a.id}: ${t}`);
  });

  it('counts coverage per asset type against its minimum', () => {
    const cov = coverage([{ '@type': ['jrpg:WorldMap'] }, { '@type': ['jrpg:Boss'] }]);
    assert.equal(cov.find(c => c.id === 'world-map').covered, true);
    assert.equal(cov.find(c => c.id === 'bosses').count, 1);
    assert.equal(cov.find(c => c.id === 'enemies').covered, false, 'one boss is not a bestiary');
  });
});

describe('kgraph folder', () => {
  it('writes packages, ontology, coverage and a README, and reads them back', () => {
    const dir = path.join(tmp, 'roundtrip');
    const game = { '@id': 'urn:robos:jrpg:t:game:t', '@type': ['jrpg:Game'], 'dcterms:title': 'Test Quest', 'robos:package': 'game' };
    const nodes = [{ '@id': 'urn:robos:jrpg:t:enemy:slime', '@type': ['jrpg:Enemy'], 'dcterms:title': 'Slime', 'robos:package': 'bestiary' }];
    const res = writeKgraphFolder(dir, { game, nodes, sources: [] });
    assert.equal(res.nodeCount, 2);
    const back = readKgraphFolder(dir);
    assert.deepEqual(back.nodes.map(n => n['@id']).sort(), [game['@id'], nodes[0]['@id']].sort());
    assert.ok(back.ontology['robos:classes'].some(c => c['@id'] === 'jrpg:Boss' && c['rdfs:subClassOf']['@id'] === 'jrpg:Enemy'));
    assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /Test Quest Knowledge Graph/);
    assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /cache\//);
  });

  it('refuses duplicate node ids', () => {
    const game = { '@id': 'urn:x:game', '@type': ['jrpg:Game'], 'dcterms:title': 'Dup' };
    assert.throws(() => writeKgraphFolder(path.join(tmp, 'dup'), { game, nodes: [{ '@id': 'urn:x:a', '@type': [] }, { '@id': 'urn:x:a', '@type': [] }] }), /Duplicate node id/);
  });
});

describe('Dragon Warrior (local data store)', () => {
  let res; let dir;
  before(async () => {
    dir = path.join(tmp, 'kgraph-dragon-warrior');
    res = await portal.acquire({ profileId: 'dragon-warrior-usa', outDir: dir });
  });

  it('covers every asset type a remake needs', () => {
    assert.deepEqual(res.coverage.filter(c => !c.covered).map(c => c.id), []);
    const zone = nodesOf(dir, 'bestiary').find(n => n['@id'].endsWith(':formation:zone-0'));
    assert.match(zone['jrpg:enemies'], /Slime 3\/5, Red Slime 2\/5/, 'zone pools are its encounter formations');
    assert.equal(nodesOf(dir, 'bestiary').filter(n => n['@type'].includes('jrpg:Enemy') || n['@type'].includes('jrpg:Boss')).length, 40);
  });

  it('copies the original generated art next to the graph', () => {
    const slime = nodesOf(dir, 'bestiary').find(n => n['dcterms:title'] === 'Slime');
    const img = slime['schema:image'][0]['schema:contentUrl'];
    assert.equal(img, 'assets/sprites/bestiary/slime.png');
    assert.ok(fs.existsSync(path.join(dir, img)));
  });

  it('keeps the story in order and ships the renderer pack', () => {
    const story = nodesOf(dir, 'story').sort((a, b) => a['jrpg:sequence'] - b['jrpg:sequence']);
    assert.equal(story[0]['jrpg:sequence'], 1);
    assert.equal(story[1]['jrpg:after']['@id'], story[0]['@id']);
    assert.ok(fs.existsSync(path.join(dir, 'site/renderers/jrpg-characters.js')));
  });
});

describe('Final Fantasy (offline copy of its fan sites)', () => {
  let res; let dir; const requests = [];
  before(async () => {
    dir = path.join(tmp, 'kgraph-final-fantasy');
    res = await portal.acquire({ profileId: 'final-fantasy-usa', outDir: dir, fetchImpl: createFakeFetch({ requests }), measureMaps: false, minIntervalMs: 0 });
  });

  it('keeps NES enemies with NES names, stats and sprites, and drops remake-only ones', () => {
    const enemies = nodesOf(dir, 'bestiary').filter(n => /Enemy|Boss/.test(n['@type'].join()));
    assert.deepEqual(enemies.map(n => n['dcterms:title']).sort(), ['Goblin', 'Lich']);
    const goblin = enemies.find(n => n['dcterms:title'] === 'Goblin');
    assert.equal(goblin['jrpg:nesName'], 'IMP');
    assert.deepEqual(goblin['jrpg:stats'], { hp: 8, attack: 4, defense: 4, exp: 6, gil: 6 });
    assert.equal(goblin['jrpg:drop'], undefined, 'NES enemies drop nothing');
    assert.match(goblin['schema:image'][0]['schema:contentUrl'], /IMP%20from%20FFI%20NES%20sprite\.png$/);
  });

  it('reads both fights of a boss fought twice', () => {
    const lich = nodesOf(dir, 'bestiary').find(n => n['dcterms:title'] === 'Lich');
    assert.deepEqual(lich['@type'], ['jrpg:Boss']);
    assert.equal(lich['jrpg:stats'].attack, '40 - 80', 'NES value wins over the remake value');
    assert.equal(lich['jrpg:otherForms'][0]['jrpg:stats'].hp, 500);
    assert.equal(lich['jrpg:elements'].fire, 'Weak');
  });

  it('builds formations from row-spanning tables and skips remake dungeons', () => {
    const forms = nodesOf(dir, 'bestiary').filter(n => n['@type'].includes('jrpg:EncounterFormation'));
    assert.equal(forms.length, 1);
    assert.equal(forms[0]['jrpg:appears'].length, 2);
    assert.equal(forms[0]['jrpg:members'][0]['@id'], 'urn:robos:jrpg:final-fantasy:enemy:goblin');
  });

  it('keeps only equipment and items that exist on the NES', () => {
    const items = nodesOf(dir, 'items');
    const titles = items.map(n => n['dcterms:title']).sort();
    assert.ok(titles.includes('Dagger') && !titles.includes('Lust Dagger'));
    assert.ok(titles.includes('Potion') && !titles.includes('Hi-Potion'));
    assert.ok(titles.includes('Lute') && !titles.includes('House Key'));
    const dagger = items.find(n => n['dcterms:title'] === 'Dagger');
    assert.equal(dagger['jrpg:nesName'], 'Large');
    assert.equal(dagger['jrpg:price'], 175, 'NES uses the Normal price');
    assert.equal(items.find(n => n['dcterms:title'] === 'Helm')['jrpg:nesName'], 'Wooden');
  });

  it('reads spells, shops, classes, menus, music and fan arrangements', () => {
    const fire = nodesOf(dir, 'magic').find(n => n['dcterms:title'] === 'Fire');
    assert.equal(fire['jrpg:nesName'], 'FIRE');
    assert.equal(fire['jrpg:spellLevel'], 1);
    const shop = nodesOf(dir, 'economy')[0];
    assert.deepEqual(shop['jrpg:stock'], [{ 'jrpg:item': 'Potion', 'jrpg:price': 60 }], 'remake-only stock (N/A on NES) is skipped');
    const chars = nodesOf(dir, 'characters');
    const warrior = chars.find(n => n['dcterms:title'] === 'Warrior');
    assert.equal(warrior['jrpg:initialStats'].HP, 35);
    assert.equal(chars.find(n => n['dcterms:title'] === 'Knight')['schema:image'].length, 2, 'upgrade has battle and map sprites');
    assert.ok(!chars.some(n => n['dcterms:title'] === 'Chronodia'), 'remake-only NPCs are left out');
    const tracks = nodesOf(dir, 'audio');
    assert.deepEqual(tracks.map(t => t['dcterms:title']).sort(), ['Main Theme', 'Prelude']);
    const prelude = tracks.find(t => t['dcterms:title'] === 'Prelude');
    assert.equal(prelude['jrpg:fanArrangements'][0]['schema:creator'], 'Jane Arranger');
  });

  it('links places to their VGMaps map and records the story with requirements', () => {
    const world = nodesOf(dir, 'world');
    const coneria = world.find(n => n['@id'].endsWith(':place:cornelia'));
    assert.equal(coneria['jrpg:nesName'], 'Coneria');
    assert.equal(coneria['jrpg:maps'][0]['@id'], 'urn:robos:jrpg:final-fantasy:map:coneria');
    assert.ok(world.some(n => n['@type'].includes('jrpg:WorldMap')));
    const story = nodesOf(dir, 'story').filter(n => n['@type'].includes('jrpg:StoryMilestone'));
    assert.ok(story.length >= 30);
    const lute = story.find(s => /Lute/.test(s['dcterms:title']));
    assert.ok(lute['jrpg:grants'].some(g => g['@id'] === 'urn:robos:jrpg:final-fantasy:key-item:lute'), 'grants link to key item nodes');
  });

  it('names its gaps instead of guessing', () => {
    assert.ok(res.warnings.some(w => /experience-per-level table/.test(w)));
    assert.ok(requests.every(u => !/spriters-resource|gamefaqs/.test(u)), 'sites that refuse automated clients are cited, not fetched');
  });
});

describe('robos agent discovery', () => {
  const profile = portal.getProfile('final-fantasy-usa');

  it('briefs the agent with the asset types and the sources already known', () => {
    const brief = discovery.discoveryBrief(profile, { assetTypes: ['music'] });
    assert.match(brief, /music: Music themes/);
    assert.doesNotMatch(brief, /world-map:/);
    assert.match(brief, /vgmaps\.com/);
  });

  it('validates suggestions: real http(s) URLs with known asset types only', () => {
    const { suggestions, rejected } = discovery.validateSuggestions([
      { title: 'Atlas', url: 'https://www.vgmaps.com/Atlas/NES/', assetTypes: ['area-maps', 'nonsense'] },
      { title: 'Bad', url: 'javascript:alert(1)', assetTypes: ['music'] },
      { title: 'Creds', url: 'https://u:p@example.com/', assetTypes: ['music'] },
      { title: 'None', url: 'https://example.com/', assetTypes: ['nonsense'] },
    ]);
    assert.deepEqual(suggestions.map(s => [s.title, s.assetTypes, s.connector]), [['Atlas', ['area-maps'], 'vgmaps']]);
    assert.equal(rejected.length, 3);
  });

  it('asks, parses fenced JSON, drops known sources and probes the rest', async () => {
    const answer = '```json\n[{"title":"Mike","url":"https://mikesrpgcenter.com/ffantasy/","assetTypes":["enemies"],"kind":"fan-site"},{"title":"Known","url":"https://www.vgmaps.com/Atlas/NES/index.htm#F","assetTypes":["world-map"]}]\n```';
    const http = new HttpCache({ minIntervalMs: 0, retries: 0, fetchImpl: async () => ({ status: 200, ok: true, headers: { get: () => 'text/html' }, text: async () => 'ok' }) });
    const res = await discovery.discoverSources(profile, { ask: async () => ({ ok: true, text: answer }), http });
    assert.deepEqual(res.suggestions.map(s => [s.title, s.status]), [['Mike', 'reachable']]);
    const [node] = discovery.suggestionNodes('final-fantasy', res.suggestions);
    assert.equal(node['jrpg:status'], 'agent-suggested, reachable');
  });

  it('fails visibly when the agent does not answer or answers without JSON', async () => {
    await assert.rejects(discovery.discoverSources(profile, { ask: async () => ({ ok: false, error: 'no CLI' }) }), /did not answer: no CLI/);
    await assert.rejects(discovery.discoverSources(profile, { ask: async () => ({ ok: true, text: 'Sure! Here are some sites.' }) }), /no JSON array/);
  });

  it('records a saved discovery run as agent-suggested sources', () => {
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ff1-agent-discovery.json'), 'utf8'));
    const nodes = discovery.suggestionNodes('final-fantasy', saved.suggestions);
    assert.equal(nodes.length, saved.suggestions.length);
    assert.ok(nodes.every(n => n['@type'].includes('jrpg:Source') && /^agent-suggested/.test(n['jrpg:status'])));
  });
});
