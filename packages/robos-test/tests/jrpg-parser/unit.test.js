'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-parser-home-'));
process.env.HOME = HOME;

const PKG = path.resolve(__dirname, '..', '..', '..', 'robos-jrpg-parser');
const { scan, imageSize, imageRole } = require(path.join(PKG, 'lib', 'scan'));
const { readCharts, readSpellName, crossCheckEquipment, applySpellNames } = require(path.join(PKG, 'lib', 'charts'));
const { tables, visibleText, decodeHtml, markdownTables, markdownProse } = require(path.join(PKG, 'lib', 'html'));
const { extractProse, consolidate, linkImages, displayName, chunkText, parseJsonReply } = require(path.join(PKG, 'lib', 'extract'));
const { planJobs, generateArt, refitArt } = require(path.join(PKG, 'lib', 'art'));
const { coverage } = require(path.join(PKG, 'lib', 'ontology'));
const pipeline = require(path.join(PKG, 'lib', 'pipeline'));
const aiImage = require(path.resolve(PKG, '..', 'robos-lib', 'ai-image'));
const aiAgent = require(path.resolve(PKG, '..', 'robos-lib', 'ai-agent'));
const { SHACLValidator } = require(path.resolve(PKG, '..', 'robos-graph', 'lib', 'shacl-validator'));

// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');

const GUIDE = `<!-- saved from url=(0040)https://guides.example/sq/walkthrough.html -->
<html><head><meta charset="utf-8"><title>Sample Quest Walkthrough</title></head><body>
<p>PART I. Characters</p>
<p>SQUIRE upgrades to PALADIN and carries the heaviest gear in the band.</p>
<p>Head to Brindlehaven, a village past the old mill, and speak with the reeve there.</p>
<table><tr><td>Monster</td><td>HP</td><td>Experience</td><td>Gil</td><td>Weakness</td></tr>
<tr><td>Mirewyrm</td><td>111</td><td>222</td><td>333</td><td>FROST</td></tr>
<tr><td>Gale</td><td>44</td><td>55</td><td>66</td><td></td></tr></table>
<table><tr><td>Boss Name</td><td>HP</td><td>Experience</td><td>Gil</td><td>Weakness</td></tr>
<tr><td>Vessa - Serpentine</td><td>600</td><td>88</td><td>99</td><td>DAZE, NAP</td></tr></table>
<table><tr><td>Level 1 (100Gil)</td><td>Level 2 (400Gil)</td></tr>
<tr><td>EMBER1</td><td>SNARE (FREEZE)</td></tr><tr><td>MEND1 *</td><td>GLOW (BURN) * *</td></tr></table>
<p>PART VII. Magic Spell Descriptions</p>
<p>EMBER/FROST</p><p>It throws that charm.</p>
<p>SNARE (FREEZE)</p><p>The foe stands still.</p>
</body></html>`;

function makeFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-assets-'));
  fs.writeFileSync(path.join(dir, 'guide.html'), GUIDE);
  fs.writeFileSync(path.join(dir, 'modded.html'), "<title>Let's Play: Balance Mod</title><table><tr><td>Monster</td><td>HP</td><td>Experience</td></tr><tr><td>Imp</td><td>999</td><td>1</td></tr></table>");
  fs.writeFileSync(path.join(dir, 'world-map.png'), PNG);
  fs.writeFileSync(path.join(dir, 'battle1.png'), Buffer.concat([PNG, Buffer.from('a')]));
  fs.writeFileSync(path.join(dir, 'select class.png'), Buffer.concat([PNG, Buffer.from('b')]));
  fs.writeFileSync(path.join(dir, 'zz-copy.png'), PNG);
  fs.mkdirSync(path.join(dir, 'guide_files'));
  fs.writeFileSync(path.join(dir, 'guide_files', 'skipped.js'), 'x');
  return dir;
}

// Answers extraction and layout prompts the way the agent would.
async function fakeAsk(prompt) {
  if (prompt.includes('<guide>')) {
    return {
      ok: true,
      text: '```json\n' + JSON.stringify({
        classes: [{ name: 'Squire', upgradesTo: 'Paladin', evidence: 'SQUIRE upgrades to PALADIN and carries the heaviest gear' }],
        places: [
          { name: 'Brindlehaven', type: 'town', evidence: 'Head to Brindlehaven, a village past the old mill' },
          { name: 'Atlantis', type: 'dungeon', evidence: 'This sentence is not in the guide at all.' },
        ],
        milestones: [{ title: 'Meet the reeve', place: 'Brindlehaven', evidence: 'speak with the reeve there' }],
      }) + '\n```',
    };
  }
  if (prompt.includes('Reply with one of these words')) return { ok: true, text: 'world-map' };
  return { ok: true, text: JSON.stringify({ title: 'Battle', purpose: 'Fight', commands: ['FIGHT'], windows: [{ name: 'party', x: 0.5, y: 0, width: 0.5, height: 1 }] }) };
}

describe('jrpg parser: scanning a collected folder', () => {
  let dir;
  before(() => { dir = makeFolder(); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('names each file\'s role from its name', () => {
    assert.equal(imageRole('select class.png'), 'class-select');
    assert.equal(imageRole('all-characters-and-monsters.webp'), 'sprite-sheet');
    assert.equal(imageRole('battle-screen-example.png'), 'battle-screen');
    assert.equal(imageRole('world2.jpeg'), 'world-map');
    assert.equal(imageRole('world-map.png'), 'world-map');
    assert.equal(imageRole('img_0042.png'), 'unknown');
  });

  it('reads image sizes', () => {
    assert.deepEqual(imageSize(path.join(dir, 'world-map.png')), { width: 1, height: 1 });
  });

  it('skips saved-page folders and duplicate files, and flags pages about other editions', () => {
    const found = scan([dir]);
    assert.ok(!found.some(f => f.name.includes('skipped')));
    assert.ok(!found.some(f => f.name === 'zz-copy.png'));
    assert.equal(found.filter(f => f.sha256 === found.find(x => x.name === 'world-map.png').sha256).length, 1);
    const modded = found.find(f => f.name === 'modded.html');
    assert.equal(modded.use, false);
    assert.match(modded.note, /another edition or a mod/);
    assert.equal(found.find(f => f.name === 'guide.html').savedFrom, 'https://guides.example/sq/walkthrough.html');
  });

  it('lets a manifest override a file', () => {
    const found = scan([dir], { files: { 'modded.html': { use: true, role: 'walkthrough' } } });
    assert.equal(found.find(f => f.name === 'modded.html').use, true);
  });
});

describe('jrpg parser: charts', () => {
  const charts = readCharts(tables(GUIDE), visibleText(GUIDE), 'guide.html');

  it('reads monsters, bosses and weaknesses by their headers', () => {
    assert.equal(charts.enemies.length, 3);
    assert.deepEqual(charts.enemies[0], { name: 'Mirewyrm', altNames: [], boss: false, hp: 111, xp: 222, gold: 333, weakness: ['FROST'], source: 'guide.html' });
    const boss = charts.enemies.find(e => e.boss);
    assert.equal(boss.name, 'Serpentine');
    assert.deepEqual(boss.altNames, ['Vessa']);
    assert.deepEqual(boss.weakness, ['DAZE', 'NAP']);
  });

  it('reads spell level, price, school and description', () => {
    const fire = charts.spells.find(s => s.name === 'EMBER1');
    assert.equal(fire.level, 1);
    assert.equal(fire.price, 100);
    assert.equal(fire.school, 'black');
    assert.equal(fire.description, 'It throws that charm.');
    const dia = charts.spells.find(s => s.name === 'GLOW');
    assert.equal(dia.altName, 'BURN');
    assert.equal(dia.school, 'white');
    assert.equal(dia.level, 2);
    assert.equal(charts.spells.find(s => s.name === 'SNARE').description, 'The foe stands still.');
  });

  it('cleans spell cells', () => {
    assert.deepEqual(readSpellName('BRN2 ( BRN2   ) * *'), { name: 'BRN2', altName: 'BRN2' });
    assert.deepEqual(readSpellName('DREAD * *'), { name: 'DREAD', altName: null });
  });

  it('falls back to windows-1252 for older pages', () => {
    assert.equal(decodeHtml(Buffer.from([0x63, 0x61, 0x66, 0xe9])), 'café');
  });
});

const REFERENCE = `# Sample Quest Reference

## 1. Links
Scrape these: https://example.invalid/map.png

## 2. Formulas
* Dodge: 10 + Speed - Load

## 3. Equipment
**Class Key:**
* \`YE\` = Yeoman | \`RO\` = Rogue | \`EA\` = Ember Adept

### A. Weapons
| ID | Weapon Name (USA) | Damage | Hit% | NES Crit% (Actual) | Price (G) | Sell (G) | Equip Permissions | Special |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| 04 | Tinblade | 9 | 5 | 4 | 10 | 5 | YE, RO | - |
| 28 | Oak Rod | 12 | 0 | 28 | 777 | 388 | All except RO | Casts **RENEW** |

### B. Armor
| Shield Name (USA) | Absorb | Evade Penalty (Weight) | Price (G) | Sell (G) | Equip Permissions | Effect |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| Roundel | 2 | 0 | 2500 | 1250 | All Classes | - |

## 4. Town Shop Inventories
### 1. Brindle
* **Weapon Shop:** Tinblade (10 G), Mystery Blade (99 G)
* **Armor Shop:** Roundel (2400 G)
* **Item Shop:** *(None)*
* **Inn:** 30 G | **Clinic:** 40 G
* **Magic (Level 1 - 100 G each):**
  * *White:* MEND, BURN
  * *Black:* *(None)*

### 2. Caravan (Desert)
* **Initial Inventory:** Lantern (50000 G)

## 5. Music
| NSF Track # | Official / Common Title | In-Game Context |
| :---: | :--- | :--- |
| 06 | **Town** | All Towns and Villages |
`;

describe('jrpg parser: Markdown reference guides', () => {
  const charts = readCharts(markdownTables(REFERENCE), REFERENCE, 'ref.md');

  it('reads weapons with stats, prices and expanded class names', () => {
    const tinblade = charts.equipment.find(e => e.name === 'Tinblade');
    assert.equal(tinblade.kind, 'weapon');
    assert.equal(tinblade.damage, 9);
    assert.equal(tinblade.price, 10);
    assert.equal(tinblade.gameId, 4);
    assert.deepEqual(tinblade.usableBy, ['Yeoman', 'Rogue']);
    assert.deepEqual(charts.equipment.find(e => e.name === 'Oak Rod').usableBy, ['Yeoman', 'Ember Adept']);
    assert.equal(charts.equipment.find(e => e.name === 'Oak Rod').effect, 'Casts RENEW');
  });

  it('reads armor with its slot', () => {
    const roundel = charts.equipment.find(e => e.name === 'Roundel');
    assert.equal(roundel.kind, 'armor');
    assert.equal(roundel.slot, 'shield');
    assert.equal(roundel.absorb, 2);
    assert.deepEqual(roundel.usableBy, ['Yeoman', 'Rogue', 'Ember Adept']);
  });

  it('reads shops, inns, clinics and magic', () => {
    const shop = (town, kind) => charts.shops.find(s => s.town === town && s.kind === kind);
    assert.deepEqual(shop('Brindle', 'weapon').stock[0], { name: 'Tinblade', price: 10 });
    assert.equal(shop('Brindle', 'inn').price, 30);
    assert.equal(shop('Brindle', 'clinic').price, 40);
    assert.deepEqual(shop('Brindle', 'white-magic').stock[0], { name: 'MEND', price: 100, level: 1 });
    assert.equal(shop('Brindle', 'black-magic'), undefined);
    assert.equal(shop('Brindle', 'item'), undefined);
    assert.equal(shop('Caravan', 'item').stock[0].name, 'Lantern');
  });

  it('reports shop items its own tables disagree with', () => {
    assert.ok(charts.problems.some(p => p.includes('Mystery Blade')));
    assert.ok(charts.problems.some(p => p.includes('Roundel for 2400') && p.includes('2500')));
    assert.ok(!charts.problems.some(p => p.includes('Tinblade')));
  });

  it('reads music tracks', () => {
    assert.deepEqual(charts.music.map(t => [t.track, t.name, t.usedFor]), [[6, 'Town', 'All Towns and Villages']]);
  });

  it('gives the agent only what code did not read', () => {
    const prose = markdownProse(REFERENCE, /\bshops?\b/i);
    assert.match(prose, /Dodge: 10/);
    assert.ok(!prose.includes('Tinblade'));
    assert.ok(!prose.includes('Brindle'));
  });

  it('parses a single file next to a folder, without touching the links it lists', async () => {
    const dir = makeFolder();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-md-out-'));
    const guide = path.join(out, 'reference.md');
    fs.writeFileSync(guide, REFERENCE);
    const realFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = async () => { fetched++; throw new Error('no network'); };
    try {
      const res = await pipeline.parse([dir, guide], { out, title: 'Sample Quest', edition: 'NES (USA)', ask: fakeAsk });
      assert.equal(fetched, 0);
      const tinblade = res.parsed.equipment.find(e => e.name === 'Tinblade');
      assert.equal(tinblade.price, 10);
      const report = JSON.parse(fs.readFileSync(path.join(out, 'coverage.json'), 'utf8'));
      assert.ok(report.assetTypes.find(c => c.id === 'music').covered);
      assert.ok(!report.assetTypes.find(c => c.id === 'music-files').covered);
      const items = JSON.parse(fs.readFileSync(path.join(out, '.robos', 'kgraphs', 'items', 'package.jsonld'), 'utf8'))['robos:nodes'];
      assert.equal(items.find(n => n['dcterms:title'] === 'Tinblade')['robos:attackBonus'], 9);
      assert.deepEqual(new SHACLValidator().validate(items).violations, []);
    } finally {
      globalThis.fetch = realFetch;
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('keeps table numbers and the table\'s stock when prose names the same thing', async () => {
    const parsed = {
      classes: [], places: [], milestones: [], equipment: [],
      shops: [{ town: 'Brindle', kind: 'weapon', stock: [{ name: 'Tinblade', price: 10 }], exact: true }, { town: 'Brindlehaven', kind: 'weapon', stock: ['staff'] }],
    };
    parsed.places = [{ name: 'Brindle', type: 'town' }, { name: 'Brindlehaven', type: 'town' }];
    await consolidate(parsed, { gameTitle: 'SQ', ask: async () => ({ ok: true, text: JSON.stringify({ places: [{ canonical: 'Brindle', aliases: ['Brindlehaven'] }] }) }) });
    assert.equal(parsed.shops.length, 1);
    assert.deepEqual(parsed.shops[0].stock, [{ name: 'Tinblade', price: 10 }]);
  });

  it('does not treat a name as its own earlier name', () => {
    const jobs = planJobs({ game: { title: 'SQ' }, sources: [], places: [{ name: 'Glass Spire', type: 'dungeon', altNames: ['Glass Spire', 'Spire of Glass'] }] });
    assert.deepEqual(jobs[0].altIds, ['area-map-spire-of-glass']);
  });

  it('only links a shop to a place that exists', () => {
    const { buildNodes } = require(path.join(PKG, 'lib', 'kgraph'));
    const nodes = buildNodes({
      game: { title: 'SQ', edition: 'NES' }, sources: [],
      places: [{ name: 'Brindle', type: 'town' }],
      shops: [{ town: 'Brindle', kind: 'weapon', stock: [] }, { town: 'Starting town', kind: 'item', stock: [] }],
    });
    const shop = t => nodes.find(n => n['@id'].includes(`shop:${t}`));
    assert.deepEqual(shop('brindle')['jrpg:town'], { '@id': 'urn:robos:jrpg:sq:place:brindle' });
    assert.equal(shop('starting-town')['jrpg:town'], 'Starting town');
  });

  it('does not regenerate an image when its place takes a new name', () => {
    const jobs = planJobs({ game: { title: 'SQ' }, sources: [], places: [{ name: 'Brindle', type: 'town', altNames: ['Brindlehaven'] }] });
    assert.equal(jobs[0].id, 'area-map-brindle');
    assert.deepEqual(jobs[0].altIds, ['area-map-brindlehaven']);
  });
});

describe('jrpg parser: a large collected folder', () => {
  it('splits camel case names and marks ports', () => {
    assert.equal(imageRole('SampleQuest-BogCave.png'), 'area-map');
    assert.equal(imageRole('SampleQuest-World(Unmarked).png'), 'world-map');
    assert.equal(imageRole('Sample_Quest_NES_Subscreen.png'), 'menu-screen');
    assert.equal(imageRole('Sample_Quest_logo.png'), 'logo');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-ports-'));
    fs.writeFileSync(path.join(dir, 'Sample_Quest_GBA_Save.png'), PNG);
    fs.writeFileSync(path.join(dir, 'Sample_Quest_NES_Combat.png'), Buffer.concat([PNG, Buffer.from('x')]));
    const found = scan([dir], {}, { edition: 'NES (USA)' });
    assert.equal(found.find(f => f.name.includes('GBA')).use, false);
    assert.equal(found.find(f => f.name.includes('NES')).use, true);
    assert.equal(scan([dir], {}, { edition: 'GBA' }).find(f => f.name.includes('GBA')).use, true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips a page too large to be a guide', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-big-'));
    fs.writeFileSync(path.join(dir, 'atlas.html'), Buffer.alloc(3 * 1024 * 1024, 'x'));
    const [page] = scan([dir]);
    assert.equal(page.use, false);
    assert.match(page.note, /site index/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports disagreeing numbers, adds locations, and leaves out remake-only gear', () => {
    const primary = [{ name: 'Oak Rod', altNames: [], price: 777, damage: 12, hit: 0, source: 'guide.md' }, { name: 'Tinblade', altNames: [], price: 10, damage: 9, source: 'guide.md' }];
    const others = [
      { name: 'Oak rod', altNames: [], price: 1554, damage: 12, hit: 0, source: 'wiki.html', foundAt: 'Find: Old Keep' },
      { name: 'Reedblade', altNames: ['Tinblade'], price: 10, damage: 9, source: 'wiki.html' },
      { name: 'Moth cloak', altNames: [], price: 5, source: 'wiki.html' },
    ];
    const { conflicts, unmatched } = crossCheckEquipment(primary, others);
    assert.deepEqual(conflicts, ['Oak Rod: price is 777 in guide.md but 1554 in wiki.html.']);
    assert.equal(unmatched, 1);
    assert.equal(primary[0].foundAt, 'Find: Old Keep');
  });

  it('reads wiki equipment tables with two names and subheadings', () => {
    const rows = [['Name', 'Price', 'Atk', 'Hit%', 'Locations'], ['Swords & axes'], ['Ash staff / Staff', '5', '6', '0%', 'Buy: Rivertown']];
    const { equipment } = readCharts([rows], '', 'wiki.html');
    assert.equal(equipment.length, 1);
    assert.deepEqual([equipment[0].name, equipment[0].altNames, equipment[0].damage, equipment[0].foundAt], ['Ash staff', ['Staff'], 6, 'Buy: Rivertown']);
  });

  it('gives chart spells their NES names and effects', () => {
    const rows = [['Spell', 'Ember', 'Spark'], ['Alternate names', 'NES: EMBER PSX: Ember1', 'NES: ZAP PSX: Spark1'], ['Range', 'One enemy', 'One enemy'], ['Effect', 'Minor fire damage', 'A small jolt']];
    const { spellNames } = readCharts([rows], '', 'wiki.html');
    const spells = [{ name: 'EMBER1', altName: null, description: null }, { name: 'SPARK1', altName: null, description: 'Already known' }];
    applySpellNames(spells, spellNames, 'NES (USA)');
    assert.equal(spells[0].name, 'EMBER');
    assert.deepEqual(spells[0].otherNames, ['EMBER1', 'Ember1', 'Ember']);
    assert.equal(spells[0].description, 'Minor fire damage');
    assert.equal(spells[1].name, 'ZAP');
    assert.equal(spells[1].description, 'Already known');
    assert.equal(spells[1].range, 'One enemy');
  });

  it('links map files and sprites, adds places only a map names, and ignores invented answers', async () => {
    const parsed = {
      classes: [{ name: 'Ember Adept' }],
      places: [{ name: 'Brindle', type: 'town' }, { name: 'Mt. Cinder', type: 'dungeon' }],
      sources: [
        { name: 'sq_ember_adept.gif', kind: 'image', role: 'unknown' },
        { name: 'SampleQuest-Brindle.png', kind: 'image', role: 'unknown' },
        { name: 'SampleQuest-CinderVent.png', kind: 'image', role: 'unknown' },
        { name: "SampleQuest-Giant'sCave.png", kind: 'image', role: 'area-map' },
        { name: 'Spoilers_icon.png', kind: 'image', role: 'unknown' },
      ],
    };
    const warnings = await linkImages(parsed, {
      gameTitle: 'SQ',
      ask: async () => ({ ok: true, text: JSON.stringify({
        maps: [{ file: 'SampleQuest-Brindle.png', place: 'Brindle' }, { file: 'SampleQuest-CinderVent.png', place: 'Mt. Cinder' }, { file: 'nope.png', place: 'Brindle' }, { file: 'Spoilers_icon.png', place: 'Atlantis' }],
        newPlaces: [{ file: "SampleQuest-Giant'sCave.png", name: "Giant's Cave", type: 'dungeon' }],
        notMaps: ['Spoilers_icon.png'],
      }) }),
    });
    assert.deepEqual(warnings, []);
    const by = n => parsed.sources.find(s => s.name === n);
    assert.equal(by('sq_ember_adept.gif').role, 'class-sprite');
    assert.equal(by('sq_ember_adept.gif').depicts, 'Ember Adept');
    assert.equal(by('SampleQuest-CinderVent.png').depicts, 'Mt. Cinder');
    assert.equal(by('Spoilers_icon.png').role, 'unknown');
    assert.ok(parsed.places.some(p => p.name === "Giant's Cave"));

    const jobs = planJobs({ game: { title: 'SQ' }, sources: parsed.sources, places: parsed.places, classes: parsed.classes });
    assert.deepEqual(jobs.find(j => j.id === 'area-map-mt-cinder').references, ['SampleQuest-CinderVent.png']);
    assert.equal(jobs.find(j => j.id === 'area-map-brindle').basis, 'reference');
    assert.equal(jobs.find(j => j.id === 'class-sprite-ember-adept').references[0], 'sq_ember_adept.gif');
  });

  it('replaces a text-only image once a reference has been collected, but not a finished one', { skip: !pythonHasPillow() }, async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-upgrade-'));
    const ref = path.join(out, 'ref.png');
    fs.writeFileSync(ref, PNG);
    const made = path.join(out, 'made.png');
    assert.equal(cp.spawnSync('python3', ['-I', '-c', `from PIL import Image; Image.new('RGB', (8, 8), (10, 90, 200)).save(${JSON.stringify(made)})`]).status, 0);
    const root = path.join(out, 'assets', 'generated');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ images: [
      { id: 'area-map-brindlehaven', kind: 'area-map', basis: 'text-only', references: [], depicts: 'place:brindlehaven', title: 'old', file: 'x', raw: 'y' },
      { id: 'area-map-ashford', kind: 'area-map', basis: 'text-only', references: [], depicts: 'place:ashford', title: 'old', file: 'x', raw: 'y' },
    ] }));
    const parsed = {
      game: { title: 'SQ' },
      sources: [{ name: 'brindle.png', path: ref, kind: 'image', role: 'area-map', depicts: 'Brindle' }],
      places: [{ name: 'Brindle', type: 'town', altNames: ['Brindlehaven'] }, { name: 'Ashford', type: 'town' }],
    };
    const calls = [];
    const res = await generateArt(parsed, out, { kinds: ['area-map'], generateImage: async ({ outFile, references }) => {
      calls.push(references.length);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.copyFileSync(made, outFile);
      return { ok: true, model: 'fake' };
    } });
    assert.deepEqual(calls, [1]);
    const ids = res.manifest.images.map(i => i.id).sort();
    assert.deepEqual(ids, ['area-map-ashford', 'area-map-brindle']);
    fs.rmSync(out, { recursive: true, force: true });
  });
});

describe('jrpg parser: agent extraction', () => {
  it('drops records whose quote is not in the source', async () => {
    const text = visibleText(GUIDE);
    const res = await extractProse({ gameTitle: 'SQ', text, sourceName: 'guide.html', ask: fakeAsk });
    assert.deepEqual(res.places.map(p => p.name), ['Brindlehaven']);
    assert.equal(res.classes[0].upgradesTo, 'Paladin');
    assert.match(res.warnings.join('\n'), /dropped 1 agent record/);
  });

  it('reports an agent failure instead of inventing records', async () => {
    const res = await extractProse({ gameTitle: 'SQ', text: 'some text', sourceName: 'g', ask: async () => ({ ok: false, error: 'not signed in' }) });
    assert.equal(res.places.length, 0);
    assert.match(res.warnings[0], /not signed in/);
  });

  it('caches replies by prompt', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-cache-'));
    let calls = 0;
    const ask = async (p) => { calls++; return fakeAsk(p); };
    const text = visibleText(GUIDE);
    await extractProse({ gameTitle: 'SQ', text, sourceName: 'g', cacheDir, ask });
    await extractProse({ gameTitle: 'SQ', text, sourceName: 'g', cacheDir, ask });
    assert.equal(calls, 1);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it('merges duplicate names and points shops and milestones at the merged name', async () => {
    const parsed = {
      classes: [{ name: 'Squire' }, { name: 'yeoman', description: 'strong' }, { name: 'adept' }],
      places: [{ name: 'Oakmere', type: 'town' }, { name: 'oakmoor', type: 'town', description: 'elves' }, { name: 'MT. CINDER', type: 'dungeon' }],
      equipment: [{ name: 'tinblade' }],
      shops: [{ town: 'Oakmere', kind: 'weapon', stock: ['dagger'] }, { town: 'oakmoor', kind: 'weapon', stock: ['saber'] }],
      milestones: [{ title: 'Rouse the heir', place: 'oakmoor' }],
    };
    const warnings = await consolidate(parsed, {
      gameTitle: 'SQ',
      ask: async () => ({ ok: true, text: JSON.stringify({
        classes: [{ canonical: 'Squire', aliases: ['Yeoman'] }],
        places: [{ canonical: 'Oakmere', aliases: ['Oakmoor', 'Invented Place'] }],
        equipment: [],
        notRecords: { classes: ['Adept'] },
      }) }),
    });
    assert.deepEqual(warnings, []);
    assert.deepEqual(parsed.classes.map(c => c.name), ['Squire']);
    assert.equal(parsed.classes[0].description, 'strong');
    assert.deepEqual(parsed.classes[0].altNames, ['Yeoman']);
    assert.deepEqual(parsed.places.map(p => p.name), ['Oakmere', 'Mt. Cinder']);
    assert.equal(parsed.places[0].description, 'elves');
    assert.equal(parsed.milestones[0].place, 'Oakmere');
    assert.equal(parsed.shops.length, 1);
    assert.deepEqual(parsed.shops[0].stock, ['dagger', 'saber']);
  });

  it('keeps the records and warns when merging fails', async () => {
    const parsed = { classes: [{ name: 'Squire' }], places: [], equipment: [], shops: [], milestones: [] };
    const warnings = await consolidate(parsed, { gameTitle: 'SQ', ask: async () => ({ ok: false, error: 'offline' }) });
    assert.equal(parsed.classes.length, 1);
    assert.match(warnings[0], /offline/);
  });

  it('tidies names written in one case', () => {
    assert.equal(displayName('MT. CINDER'), 'Mt. Cinder');
    assert.equal(displayName('oakmoor castle'), 'Oakmoor Castle');
    assert.equal(displayName("Hilda's House"), "Hilda's House");
  });

  it('splits long text at line ends and reads fenced JSON', () => {
    const chunks = chunkText(`${'a'.repeat(60)}\n${'b'.repeat(60)}`, 80);
    assert.equal(chunks.length, 2);
    assert.deepEqual(parseJsonReply('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonReply('{"a":[1]} thanks'), { a: [1] });
  });
});

describe('jrpg parser: the whole pipeline', () => {
  let dir, out, result;
  before(async () => {
    dir = makeFolder();
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-out-'));
    result = await pipeline.parse([dir], { out, title: 'Sample Quest', edition: 'NES (USA)', ask: fakeAsk });
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('keeps the modded page out of the data', () => {
    assert.ok(!result.parsed.enemies.some(e => e.name === 'Imp'));
    assert.ok(result.parsed.warnings.some(w => w.startsWith('modded.html')));
  });

  it('writes a kgraph folder that passes the workspace SHACL shapes', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(out, '.robos', 'kgraph.yaml'), 'utf8'));
    assert.ok(manifest.packages.some(p => p.id === 'bestiary'));
    const nodes = manifest.packages.flatMap(p => JSON.parse(fs.readFileSync(path.join(out, '.robos', p.path), 'utf8'))['robos:nodes']);
    assert.equal(new Set(nodes.map(n => n['@id'])).size, nodes.length);
    const validation = new SHACLValidator().validate(nodes);
    assert.deepEqual(validation.errors || [], []);
    assert.ok(nodes.some(n => n['@type'].includes('robos:GameMonster') && n['@type'].includes('jrpg:Boss')));
  });

  it('references source files by hash without copying them', () => {
    const report = fs.readFileSync(path.join(out, '.robos', 'kgraphs', 'game', 'package.jsonld'), 'utf8');
    assert.match(report, /jrpg:sha256/);
    assert.ok(!report.includes(dir));
    assert.ok(!fs.existsSync(path.join(out, 'world-map.png')));
  });

  it('tells the person what to collect next', () => {
    const report = JSON.parse(fs.readFileSync(path.join(out, 'coverage.json'), 'utf8'));
    assert.ok(report.stillToCollect.some(c => c.id === 'area-maps'));
    assert.ok(!report.stillToCollect.some(c => c.id === 'bosses'));
  });

  it('marks a map with no reference image as text-only', () => {
    const jobs = planJobs(result.parsed);
    assert.equal(jobs.find(j => j.id === 'area-map-brindlehaven').basis, 'text-only');
    const world = jobs.find(j => j.kind === 'world-map');
    assert.equal(world.basis, 'reference');
    assert.deepEqual(world.references, ['world-map.png']);
    assert.ok(jobs.some(j => j.id === 'class-sprite-squire'));
    assert.ok(!jobs.some(j => j.kind === 'enemy-sprite'));
    assert.ok(planJobs(result.parsed, { kinds: ['enemy-sprite'] }).length >= 3);
  });

  it('generates art, adds it to the kgraph, and skips finished jobs on a rerun', { skip: !pythonHasPillow() }, async () => {
    const calls = [];
    const generateImage = async ({ prompt, references, outFile }) => {
      calls.push({ prompt, references });
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, PNG);
      return { ok: true, file: outFile, model: 'fake-model' };
    };
    const first = await pipeline.art(out, { kinds: ['world-map', 'area-map'], generateImage });
    assert.equal(first.generated, 2);
    assert.ok(fs.existsSync(path.join(out, 'assets', 'generated', 'world-map', 'world-map-world.png')));
    assert.equal(calls.find(c => c.prompt.includes('world map')).references.length, 1);

    const second = await pipeline.art(out, { kinds: ['world-map', 'area-map'], generateImage });
    assert.equal(second.planned, 0);

    const nodes = JSON.parse(fs.readFileSync(path.join(out, '.robos', 'kgraphs', 'world', 'package.jsonld'), 'utf8'))['robos:nodes'];
    const map = nodes.find(n => [].concat(n['@type']).includes('jrpg:AreaMap'));
    assert.equal(map['jrpg:basis'], 'text-only');
    assert.equal(map['jrpg:depicts']['@id'], 'urn:robos:jrpg:sample-quest:place:brindlehaven');
    assert.ok(nodes.some(n => n['@id'] === 'urn:robos:jrpg:sample-quest:place:brindlehaven'));
  });

  it('links every generated image to a node that exists', { skip: !pythonHasPillow() }, async () => {
    // A sprite needs something on its background, unlike the 1x1 fixture.
    const picture = path.join(out, 'picture.png');
    cp.spawnSync('python3', ['-I', '-c', `from PIL import Image; i = Image.new('RGB', (8, 8), (255, 0, 255)); i.paste((200, 40, 0), (2, 2, 6, 6)); i.save(${JSON.stringify(picture)})`]);
    const generateImage = async ({ outFile }) => {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.copyFileSync(picture, outFile);
      return { ok: true, file: outFile, model: 'fake-model' };
    };
    await pipeline.art(out, { kinds: ['class-sprite', 'menu-screen'], generateImage });
    const manifest = JSON.parse(fs.readFileSync(path.join(out, '.robos', 'kgraph.yaml'), 'utf8'));
    const nodes = manifest.packages.flatMap(p => JSON.parse(fs.readFileSync(path.join(out, '.robos', p.path), 'utf8'))['robos:nodes']);
    const ids = new Set(nodes.map(n => n['@id']));
    for (const n of nodes.filter(x => x['jrpg:depicts'])) assert.ok(ids.has(n['jrpg:depicts']['@id']), n['jrpg:depicts']['@id']);
  });

  it('finds a sprite inside a frame the model drew around it', { skip: !pythonHasPillow() }, () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-sprite-'));
    const script = `
from PIL import Image
i = Image.new('RGB', (200, 200), (0, 0, 0))
i.paste((190, 10, 170), (10, 10, 190, 190))
i.paste((220, 180, 40), (80, 70, 120, 130))
i.save(${JSON.stringify(path.join(dir2, 'in.png'))})
`;
    assert.equal(cp.spawnSync('python3', ['-I', '-c', script]).status, 0);
    const run = cp.spawnSync('python3', ['-I', path.join(PKG, 'tools', 'nesify.py'), path.join(dir2, 'in.png'), path.join(dir2, 'out.png'), '--width', '64', '--height', '64', '--colors', '8', '--key'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const check = cp.spawnSync('python3', ['-I', '-c', `
from PIL import Image
i = Image.open(${JSON.stringify(path.join(dir2, 'out.png'))}).convert('RGBA')
print(i.getpixel((0, 0))[3], i.getpixel((32, 32))[3], i.getpixel((32, 32))[0] > i.getpixel((32, 32))[2])
`], { encoding: 'utf8' });
    assert.equal(check.stdout.trim(), '0 255 True');
    fs.rmSync(dir2, { recursive: true, force: true });
  });

  it('redoes one image with only, and the shrink step without the model', { skip: !pythonHasPillow() }, async () => {
    const picture = path.join(out, 'picture.png');
    const calls = [];
    const generateImage = async ({ outFile }) => {
      calls.push(outFile);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.copyFileSync(picture, outFile);
      return { ok: true, file: outFile, model: 'fake-model' };
    };
    await generateArt(result.parsed, out, { only: ['class-sprite-squire'], generateImage });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /class-sprite-squire/);
    const file = path.join(out, 'assets', 'generated', 'class-sprite', 'class-sprite-squire.png');
    fs.rmSync(file);
    const before = calls.length;
    assert.deepEqual(refitArt(out).failures, []);
    assert.equal(calls.length, before);
    assert.ok(fs.existsSync(file));
  });

  it('keeps a map at its full size', { skip: !pythonHasPillow() }, () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-map-'));
    const input = path.join(dir2, 'in.png');
    const output = path.join(dir2, 'out.png');
    assert.equal(cp.spawnSync('python3', ['-I', '-c', `from PIL import Image; Image.new('RGB', (900, 700), (0, 170, 0)).save(${JSON.stringify(input)})`]).status, 0);
    assert.equal(cp.spawnSync('python3', ['-I', path.join(PKG, 'tools', 'nesify.py'), input, output, '--width', '512', '--height', '480', '--colors', '48', '--keep-colors', '--keep-size']).status, 0);
    const check = cp.spawnSync('python3', ['-I', '-c', `from PIL import Image; i = Image.open(${JSON.stringify(output)}).convert('RGB'); print(i.size, i.getpixel((5, 5)))`], { encoding: 'utf8' });
    assert.equal(check.stdout.trim(), '(900, 700) (0, 170, 0)');
    fs.rmSync(dir2, { recursive: true, force: true });
  });

  it('records an unusable image as failed and keeps going', { skip: !pythonHasPillow() }, async () => {
    const generateImage = async ({ outFile }) => {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, PNG);
      return { ok: true, file: outFile, model: 'fake-model' };
    };
    const res = await generateArt(result.parsed, out, { kinds: ['class-sprite'], force: true, generateImage });
    assert.match(res.failures[0].error, /only background/);
  });

  it('records a failed image and keeps going', { skip: !pythonHasPillow() }, async () => {
    const res = await generateArt(result.parsed, out, { kinds: ['battle-backdrop'], force: true, generateImage: async () => ({ ok: false, error: 'quota' }) });
    assert.equal(res.failures[0].error, 'quota');
    assert.equal(res.generated, 0);
  });
});

describe('jrpg parser: publishing only what we made', () => {
  const { publish, findLeaks } = require(path.join(PKG, 'lib', 'publish'));
  let dir, out, to, result;
  before(async () => {
    dir = makeFolder();
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-pub-out-'));
    to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-pub-to-')), 'public');
    await pipeline.parse([dir], { out, title: 'Sample Quest', edition: 'NES (USA)', ask: fakeAsk });
    const parsed = JSON.parse(fs.readFileSync(path.join(out, 'parsed.json'), 'utf8'));
    await generateArt(parsed, out, { kinds: ['area-map'], generateImage: async ({ outFile }) => {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, PNG);
      return { ok: true, model: 'fake' };
    } }).catch(() => {});
    result = publish(out, to);
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
    fs.rmSync(path.dirname(to), { recursive: true, force: true });
  });

  const everything = () => {
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); } };
    walk(to);
    return files;
  };

  it('leaves out working files and raw model output', () => {
    const names = everything().map(f => path.relative(to, f));
    for (const secret of ['parsed.json', 'coverage.json', 'manifest.json', '.cache', '/raw/']) assert.ok(!names.some(n => n.includes(secret)), secret);
  });

  it('holds no source names, hashes, quotes or copied descriptions', () => {
    const text = everything().filter(f => !f.endsWith('.png')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    for (const secret of ['guide.html', 'world-map.png', 'guides.example', 'jrpg:sha256', 'jrpg:evidence', 'jrpg:source"', 'It throws that charm', 'Head to Brindlehaven, a village', dir]) {
      assert.ok(!text.includes(secret), secret);
    }
  });

  it('keeps the facts, and the graph still validates', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(to, '.robos', 'kgraph.yaml'), 'utf8'));
    const nodes = manifest.packages.flatMap(p => JSON.parse(fs.readFileSync(path.join(to, '.robos', p.path), 'utf8'))['robos:nodes']);
    const wyrm = nodes.find(n => n['dcterms:title'] === 'Mirewyrm');
    assert.equal(wyrm['robos:hpMax'], 111);
    assert.ok(!nodes.some(n => [].concat(n['@type']).includes('jrpg:Source')));
    assert.deepEqual(new SHACLValidator().validate(nodes).violations, []);
    assert.ok(result.nodeCount > 0);
  });

  it('removes source file names from image titles', () => {
    const { publicNode } = require(path.join(PKG, 'lib', 'publish'));
    const node = publicNode({ '@type': ['jrpg:BattleBackdrop', 'jrpg:GeneratedImage'], 'dcterms:title': 'Battle backdrop from battle2.jpeg' });
    assert.equal(node['dcterms:title'], 'Battle backdrop');
  });

  it('numbers images and menu layouts named after a source file', async () => {
    const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-pub2-'));
    const to2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-pub2to-')), 'public');
    const shot = path.join(out2, 'battle2.png');
    fs.writeFileSync(shot, PNG);
    const parsed = {
      game: { title: 'SQ', edition: 'NES' }, warnings: [],
      sources: [{ name: 'battle2.png', path: shot, sha256: 'abcabcabc', kind: 'image', role: 'battle-screen' }],
      menus: [{ title: 'Battle', source: 'battle2.png' }],
    };
    fs.writeFileSync(path.join(out2, 'parsed.json'), JSON.stringify(parsed));
    const root = path.join(out2, 'assets', 'generated');
    fs.mkdirSync(path.join(root, 'battle-backdrop'), { recursive: true });
    fs.writeFileSync(path.join(root, 'battle-backdrop', 'battle-backdrop-battle2.png'), PNG);
    const art = { images: [{ id: 'battle-backdrop-battle2', kind: 'battle-backdrop', title: 'Battle backdrop from battle2.png', depicts: 'game', basis: 'reference', references: ['battle2.png'], file: 'assets/generated/battle-backdrop/battle-backdrop-battle2.png' }] };
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(art));
    require(path.join(PKG, 'lib', 'kgraph')).writeKgraph(out2, parsed, art);
    publish(out2, to2);
    assert.ok(fs.existsSync(path.join(to2, 'assets', 'generated', 'battle-backdrop', 'battle-backdrop-1.png')));
    const world = fs.readFileSync(path.join(to2, '.robos', 'kgraphs', 'world', 'package.jsonld'), 'utf8');
    assert.match(world, /image:battle-backdrop-1"/);
    assert.match(world, /battle-backdrop-1\.png/);
    assert.ok(!world.includes('battle2'));
    const ui = fs.readFileSync(path.join(to2, '.robos', 'kgraphs', 'ui', 'package.jsonld'), 'utf8');
    assert.match(ui, /menu:screen-1"/);
    assert.ok(!ui.includes('battle2'));
    fs.rmSync(out2, { recursive: true, force: true });
    fs.rmSync(path.dirname(to2), { recursive: true, force: true });
  });

  it('refuses a target inside the working folder or one already in use', () => {
    assert.throws(() => publish(out, path.join(out, 'public')), /outside the working folder/);
    assert.throws(() => publish(out, to), /not empty/);
  });

  it('finds a source name or quote left in the copy', () => {
    const leaky = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-leak-'));
    fs.writeFileSync(path.join(leaky, 'notes.md'), 'Made from secret-guide.html: the quoted sentence from the guide goes here.');
    const problems = findLeaks(leaky, { sources: [{ name: 'secret-guide.html', sha256: 'abc' }], places: [{ evidence: 'the quoted sentence from the guide goes here' }, { evidence: 'Brindle, Pravoka, Oakmoor' }] });
    assert.equal(problems.length, 2);
    fs.rmSync(leaky, { recursive: true, force: true });
  });

  it('marks the working folder as ignored by git', () => {
    assert.match(fs.readFileSync(path.join(out, '.gitignore'), 'utf8'), /^\*$/m);
  });
});

describe('jrpg parser: coverage', () => {
  it('ignores source files marked unusable', () => {
    const row = coverage([], [{ role: 'music', use: false }]).find(c => c.id === 'music');
    assert.equal(row.covered, false);
  });
});

function pythonHasPillow() {
  return cp.spawnSync('python3', ['-I', '-c', 'import PIL']).status === 0;
}

describe('ai-image: generating through agy', () => {
  let bin, cwd;
  const brain = path.join(HOME, '.gemini', 'antigravity-cli', 'brain');

  function fakeAgy(script) {
    const file = path.join(bin, 'fake-agy');
    fs.writeFileSync(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    return file;
  }

  before(() => {
    bin = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-bin-'));
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-img-'));
    fs.mkdirSync(brain, { recursive: true });
    fs.writeFileSync(path.join(bin, 'pixel.png'), PNG);
    fs.writeFileSync(path.join(bin, 'made.png'), Buffer.concat([PNG, Buffer.from('new')]));
  });
  after(() => {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('copies the image named in the reply and gives the model its references', async () => {
    const made = path.join(brain, 'conv-1', 'forest.png');
    const agy = fakeAgy(`mkdir -p "${path.dirname(made)}"; cp "${bin}/made.png" "${made}"; ls > "${cwd}/refs.txt"
echo '{"event":"init","conversation_id":"conv-1"}'
echo '{"event":"result","result":{"conversation_id":"conv-1","status":"SUCCESS","response":"Saved to ${made} ok."}}'`);
    const ref = path.join(bin, 'pixel.png');
    const outFile = path.join(cwd, 'a', 'out.png');
    const res = await aiImage.generateImage({ prompt: 'a forest', references: [ref], outFile, bin: agy });
    assert.equal(res.ok, true);
    assert.ok(aiImage.isImageFile(outFile));
    assert.match(fs.readFileSync(path.join(cwd, 'refs.txt'), 'utf8'), /ref-1\.png/);
  });

  it('finds the image in the brain folder when the reply names no path', async () => {
    const made = path.join(brain, 'conv-2', 'sub', 'tree.png');
    const agy = fakeAgy(`mkdir -p "${path.dirname(made)}" "${brain}/conv-2/.system_generated"; cp "${bin}/pixel.png" "${made}"; cp "${bin}/pixel.png" "${brain}/conv-2/.system_generated/shown.png"
echo '{"event":"result","result":{"conversation_id":"conv-2","response":"Done."}}'`);
    const outFile = path.join(cwd, 'b.png');
    assert.equal((await aiImage.generateImage({ prompt: 'x', outFile, bin: agy })).ok, true);
  });

  it('retries, then reports what the model said', async () => {
    const counter = path.join(cwd, 'count');
    const agy = fakeAgy(`echo x >> "${counter}"; echo '{"event":"result","result":{"response":"I have no generate_image tool."}}'`);
    fs.rmSync(path.join(brain), { recursive: true, force: true });
    const res = await aiImage.generateImage({ prompt: 'x', outFile: path.join(cwd, 'c.png'), bin: agy, retries: 1 });
    assert.equal(res.ok, false);
    assert.match(res.error, /no generate_image tool/);
    assert.equal(fs.readFileSync(counter, 'utf8').trim().split('\n').length, 2);
  });

  it('does not mistake agy\'s copy of a reference for the result', async () => {
    fs.mkdirSync(brain, { recursive: true });
    const shown = path.join(brain, 'conv-3', '.system_generated', 'logs', 'shown.png');
    const agy = fakeAgy(`mkdir -p "${path.dirname(shown)}"; cp "${bin}/pixel.png" "${shown}"
echo '{"event":"result","result":{"conversation_id":"conv-3","response":"Saved to ${shown}"}}'`);
    const res = await aiImage.generateImage({ prompt: 'x', outFile: path.join(cwd, 'd.png'), bin: agy, retries: 0 });
    assert.equal(res.ok, false);
  });

  it('rejects a result that is byte for byte a reference', async () => {
    const copy = path.join(brain, 'conv-4', 'result.png');
    const agy = fakeAgy(`mkdir -p "${path.dirname(copy)}"; cp "${bin}/pixel.png" "${copy}"
echo '{"event":"result","result":{"conversation_id":"conv-4","response":"Saved to ${copy}"}}'`);
    const res = await aiImage.generateImage({ prompt: 'x', references: [path.join(bin, 'pixel.png')], outFile: path.join(cwd, 'e.png'), bin: agy, retries: 0 });
    assert.equal(res.ok, false);
  });

  it('ignores an image older than the run', () => {
    const old = path.join(cwd, 'old.png');
    fs.writeFileSync(old, PNG);
    const found = aiImage.findGeneratedImage(`see ${old}`, { sinceMs: Date.now() + 60000, workDir: '/nonexistent' });
    assert.equal(found, null);
  });
});

describe('ai-agent: Antigravity without the gemini binary', () => {
  it('falls back to agy', () => {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-path-'));
    const saved = process.env.PATH;
    try {
      fs.writeFileSync(path.join(bin, 'agy'), '#!/bin/sh\n', { mode: 0o755 });
      process.env.PATH = bin;
      assert.equal(aiAgent.resolveBin(aiAgent.PROVIDER_MAP.antigravity), 'agy');
      fs.writeFileSync(path.join(bin, 'gemini'), '#!/bin/sh\n', { mode: 0o755 });
      assert.equal(aiAgent.resolveBin(aiAgent.PROVIDER_MAP.antigravity), 'gemini');
    } finally {
      process.env.PATH = saved;
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });

  it('passes a model to the CLI', () => {
    assert.deepEqual(aiAgent.PROVIDER_MAP.antigravity.buildArgs('hi', { model: 'm' }), ['--model', 'm', '-p', 'hi']);
    assert.deepEqual(aiAgent.PROVIDER_MAP.antigravity.buildArgs('hi'), ['-p', 'hi']);
  });
});
