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

const GUIDE = `<!-- saved from url=(0040)https://guides.example/ff1/walkthrough.html -->
<html><head><meta charset="utf-8"><title>Final Fantasy Walkthrough</title></head><body>
<p>PART I. Characters</p>
<p>WARRIOR upgrades to KNIGHT and is the strongest character in the party.</p>
<p>Head to Corneria, a town north of the bridge, and talk to the king there.</p>
<table><tr><td>Monster</td><td>HP</td><td>Experience</td><td>Gil</td><td>Weakness</td></tr>
<tr><td>Agama</td><td>296</td><td>2472</td><td>1200</td><td>ICE</td></tr>
<tr><td>Air</td><td>358</td><td>1614</td><td>807</td><td></td></tr></table>
<table><tr><td>Boss Name</td><td>HP</td><td>Experience</td><td>Gil</td><td>Weakness</td></tr>
<tr><td>Kary - Marilith</td><td>600</td><td>2475</td><td>3000</td><td>STUN, SLEP</td></tr></table>
<table><tr><td>Level 1 (100Gil)</td><td>Level 2 (400Gil)</td></tr>
<tr><td>FIRE1</td><td>BIND (HOLD)</td></tr><tr><td>CURE1 *</td><td>DIA (HARM) * *</td></tr></table>
<p>PART VII. Magic Spell Descriptions</p>
<p>FIRE/ICE</p><p>This will cast that element.</p>
<p>BIND (HOLD)</p><p>The enemy becomes comatose.</p>
</body></html>`;

function makeFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-assets-'));
  fs.writeFileSync(path.join(dir, 'guide.html'), GUIDE);
  fs.writeFileSync(path.join(dir, 'modded.html'), "<title>Let's Play Dawn of Souls: Mod of Balance</title><table><tr><td>Monster</td><td>HP</td><td>Experience</td></tr><tr><td>Imp</td><td>999</td><td>1</td></tr></table>");
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
        classes: [{ name: 'Warrior', upgradesTo: 'Knight', evidence: 'WARRIOR upgrades to KNIGHT and is the strongest character' }],
        places: [
          { name: 'Corneria', type: 'town', evidence: 'Head to Corneria, a town north of the bridge' },
          { name: 'Atlantis', type: 'dungeon', evidence: 'This sentence is not in the guide at all.' },
        ],
        milestones: [{ title: 'Meet the king', place: 'Corneria', evidence: 'talk to the king there' }],
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
    assert.equal(found.find(f => f.name === 'guide.html').savedFrom, 'https://guides.example/ff1/walkthrough.html');
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
    assert.deepEqual(charts.enemies[0], { name: 'Agama', altNames: [], boss: false, hp: 296, xp: 2472, gold: 1200, weakness: ['ICE'], source: 'guide.html' });
    const marilith = charts.enemies.find(e => e.boss);
    assert.equal(marilith.name, 'Marilith');
    assert.deepEqual(marilith.altNames, ['Kary']);
    assert.deepEqual(marilith.weakness, ['STUN', 'SLEP']);
  });

  it('reads spell level, price, school and description', () => {
    const fire = charts.spells.find(s => s.name === 'FIRE1');
    assert.equal(fire.level, 1);
    assert.equal(fire.price, 100);
    assert.equal(fire.school, 'black');
    assert.equal(fire.description, 'This will cast that element.');
    const dia = charts.spells.find(s => s.name === 'DIA');
    assert.equal(dia.altName, 'HARM');
    assert.equal(dia.school, 'white');
    assert.equal(dia.level, 2);
    assert.equal(charts.spells.find(s => s.name === 'BIND').description, 'The enemy becomes comatose.');
  });

  it('cleans spell cells', () => {
    assert.deepEqual(readSpellName('HRM2 ( HRM2   ) * *'), { name: 'HRM2', altName: 'HRM2' });
    assert.deepEqual(readSpellName('FEAR * *'), { name: 'FEAR', altName: null });
  });

  it('falls back to windows-1252 for older pages', () => {
    assert.equal(decodeHtml(Buffer.from([0x63, 0x61, 0x66, 0xe9])), 'café');
  });
});

const REFERENCE = `# Final Fantasy Reference

## 1. Links
Scrape these: https://example.invalid/map.png

## 2. Formulas
* Evade: 48 + Agility - Weight

## 3. Equipment
**Class Key:**
* \`FI\` = Fighter | \`TH\` = Thief | \`BM\` = Black Mage

### A. Weapons
| ID | Weapon Name (USA) | Damage | Hit% | NES Crit% (Actual) | Price (G) | Sell (G) | Equip Permissions | Special |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| 04 | Rapier | 9 | 5 | 4 | 10 | 5 | FI, TH | - |
| 28 | Power Staff | 12 | 0 | 28 | 12345 | 6172 | All except TH | Casts **HEAL** |

### B. Armor
| Shield Name (USA) | Absorb | Evade Penalty (Weight) | Price (G) | Sell (G) | Equip Permissions | Effect |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| Buckler | 2 | 0 | 2500 | 1250 | All Classes | - |

## 4. Town Shop Inventories
### 1. Coneria
* **Weapon Shop:** Rapier (10 G), Mystery Blade (99 G)
* **Armor Shop:** Buckler (2400 G)
* **Item Shop:** *(None)*
* **Inn:** 30 G | **Clinic:** 40 G
* **Magic (Level 1 - 100 G each):**
  * *White:* CURE, HARM
  * *Black:* *(None)*

### 2. Caravan (Desert)
* **Initial Inventory:** Bottle (50000 G)

## 5. Music
| NSF Track # | Official / Common Title | In-Game Context |
| :---: | :--- | :--- |
| 06 | **Town** | All Towns and Villages |
`;

describe('jrpg parser: Markdown reference guides', () => {
  const charts = readCharts(markdownTables(REFERENCE), REFERENCE, 'ref.md');

  it('reads weapons with stats, prices and expanded class names', () => {
    const rapier = charts.equipment.find(e => e.name === 'Rapier');
    assert.equal(rapier.kind, 'weapon');
    assert.equal(rapier.damage, 9);
    assert.equal(rapier.price, 10);
    assert.equal(rapier.gameId, 4);
    assert.deepEqual(rapier.usableBy, ['Fighter', 'Thief']);
    assert.deepEqual(charts.equipment.find(e => e.name === 'Power Staff').usableBy, ['Fighter', 'Black Mage']);
    assert.equal(charts.equipment.find(e => e.name === 'Power Staff').effect, 'Casts HEAL');
  });

  it('reads armor with its slot', () => {
    const buckler = charts.equipment.find(e => e.name === 'Buckler');
    assert.equal(buckler.kind, 'armor');
    assert.equal(buckler.slot, 'shield');
    assert.equal(buckler.absorb, 2);
    assert.deepEqual(buckler.usableBy, ['Fighter', 'Thief', 'Black Mage']);
  });

  it('reads shops, inns, clinics and magic', () => {
    const shop = (town, kind) => charts.shops.find(s => s.town === town && s.kind === kind);
    assert.deepEqual(shop('Coneria', 'weapon').stock[0], { name: 'Rapier', price: 10 });
    assert.equal(shop('Coneria', 'inn').price, 30);
    assert.equal(shop('Coneria', 'clinic').price, 40);
    assert.deepEqual(shop('Coneria', 'white-magic').stock[0], { name: 'CURE', price: 100, level: 1 });
    assert.equal(shop('Coneria', 'black-magic'), undefined);
    assert.equal(shop('Coneria', 'item'), undefined);
    assert.equal(shop('Caravan', 'item').stock[0].name, 'Bottle');
  });

  it('reports shop items its own tables disagree with', () => {
    assert.ok(charts.problems.some(p => p.includes('Mystery Blade')));
    assert.ok(charts.problems.some(p => p.includes('Buckler for 2400') && p.includes('2500')));
    assert.ok(!charts.problems.some(p => p.includes('Rapier')));
  });

  it('reads music tracks', () => {
    assert.deepEqual(charts.music.map(t => [t.track, t.name, t.usedFor]), [[6, 'Town', 'All Towns and Villages']]);
  });

  it('gives the agent only what code did not read', () => {
    const prose = markdownProse(REFERENCE, /\bshops?\b/i);
    assert.match(prose, /Evade: 48/);
    assert.ok(!prose.includes('Rapier'));
    assert.ok(!prose.includes('Coneria'));
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
      const res = await pipeline.parse([dir, guide], { out, title: 'Final Fantasy', edition: 'NES (USA)', ask: fakeAsk });
      assert.equal(fetched, 0);
      const rapier = res.parsed.equipment.find(e => e.name === 'Rapier');
      assert.equal(rapier.price, 10);
      const report = JSON.parse(fs.readFileSync(path.join(out, 'coverage.json'), 'utf8'));
      assert.ok(report.assetTypes.find(c => c.id === 'music').covered);
      assert.ok(!report.assetTypes.find(c => c.id === 'music-files').covered);
      const items = JSON.parse(fs.readFileSync(path.join(out, '.robos', 'kgraphs', 'items', 'package.jsonld'), 'utf8'))['robos:nodes'];
      assert.equal(items.find(n => n['dcterms:title'] === 'Rapier')['robos:attackBonus'], 9);
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
      shops: [{ town: 'Coneria', kind: 'weapon', stock: [{ name: 'Rapier', price: 10 }], exact: true }, { town: 'Corneria', kind: 'weapon', stock: ['staff'] }],
    };
    parsed.places = [{ name: 'Coneria', type: 'town' }, { name: 'Corneria', type: 'town' }];
    await consolidate(parsed, { gameTitle: 'FF', ask: async () => ({ ok: true, text: JSON.stringify({ places: [{ canonical: 'Coneria', aliases: ['Corneria'] }] }) }) });
    assert.equal(parsed.shops.length, 1);
    assert.deepEqual(parsed.shops[0].stock, [{ name: 'Rapier', price: 10 }]);
  });

  it('does not treat a name as its own earlier name', () => {
    const jobs = planJobs({ game: { title: 'FF' }, sources: [], places: [{ name: 'Mirage Tower', type: 'dungeon', altNames: ['Mirage Tower', 'Tower of Mirage'] }] });
    assert.deepEqual(jobs[0].altIds, ['area-map-tower-of-mirage']);
  });

  it('only links a shop to a place that exists', () => {
    const { buildNodes } = require(path.join(PKG, 'lib', 'kgraph'));
    const nodes = buildNodes({
      game: { title: 'FF', edition: 'NES' }, sources: [],
      places: [{ name: 'Coneria', type: 'town' }],
      shops: [{ town: 'Coneria', kind: 'weapon', stock: [] }, { town: 'Starting town', kind: 'item', stock: [] }],
    });
    const shop = t => nodes.find(n => n['@id'].includes(`shop:${t}`));
    assert.deepEqual(shop('coneria')['jrpg:town'], { '@id': 'urn:robos:jrpg:ff:place:coneria' });
    assert.equal(shop('starting-town')['jrpg:town'], 'Starting town');
  });

  it('does not regenerate an image when its place takes a new name', () => {
    const jobs = planJobs({ game: { title: 'FF' }, sources: [], places: [{ name: 'Coneria', type: 'town', altNames: ['Corneria'] }] });
    assert.equal(jobs[0].id, 'area-map-coneria');
    assert.deepEqual(jobs[0].altIds, ['area-map-corneria']);
  });
});

describe('jrpg parser: a large collected folder', () => {
  it('splits camel case names and marks ports', () => {
    assert.equal(imageRole('FinalFantasy-MarshCave.png'), 'area-map');
    assert.equal(imageRole('FinalFantasy-World(Unmarked).png'), 'world-map');
    assert.equal(imageRole('Final_Fantasy_1_NES_Subscreen.png'), 'menu-screen');
    assert.equal(imageRole('Final_Fantasy_logo.png'), 'logo');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-ports-'));
    fs.writeFileSync(path.join(dir, 'Final_Fantasy_1_GBA_Save.png'), PNG);
    fs.writeFileSync(path.join(dir, 'Final_Fantasy_1_NES_Combat.png'), Buffer.concat([PNG, Buffer.from('x')]));
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
    const primary = [{ name: 'Power Staff', altNames: [], price: 12345, damage: 12, hit: 0, source: 'guide.md' }, { name: 'Rapier', altNames: [], price: 10, damage: 9, source: 'guide.md' }];
    const others = [
      { name: 'Power staff', altNames: [], price: 24690, damage: 12, hit: 0, source: 'wiki.html', foundAt: 'Find: Western Keep' },
      { name: 'Foil', altNames: ['Rapier'], price: 10, damage: 9, source: 'wiki.html' },
      { name: 'Elven cloak', altNames: [], price: 5, source: 'wiki.html' },
    ];
    const { conflicts, unmatched } = crossCheckEquipment(primary, others);
    assert.deepEqual(conflicts, ['Power Staff: price is 12345 in guide.md but 24690 in wiki.html.']);
    assert.equal(unmatched, 1);
    assert.equal(primary[0].foundAt, 'Find: Western Keep');
  });

  it('reads wiki equipment tables with two names and subheadings', () => {
    const rows = [['Name', 'Price', 'Atk', 'Hit%', 'Locations'], ['Swords & axes'], ['Wooden staff / Staff', '5', '6', '0%', 'Buy: Cornelia']];
    const { equipment } = readCharts([rows], '', 'wiki.html');
    assert.equal(equipment.length, 1);
    assert.deepEqual([equipment[0].name, equipment[0].altNames, equipment[0].damage, equipment[0].foundAt], ['Wooden staff', ['Staff'], 6, 'Buy: Cornelia']);
  });

  it('gives chart spells their NES names and effects', () => {
    const rows = [['Spell', 'Fire', 'Thunder'], ['Alternate names', 'NES: FIRE PSX: Fire1', 'NES: LIT PSX: Bolt1'], ['Range', 'One enemy', 'One enemy'], ['Effect', 'Minor fire damage', 'Minor shock']];
    const { spellNames } = readCharts([rows], '', 'wiki.html');
    const spells = [{ name: 'FIRE1', altName: null, description: null }, { name: 'BOLT1', altName: null, description: 'Already known' }];
    applySpellNames(spells, spellNames, 'NES (USA)');
    assert.equal(spells[0].name, 'FIRE');
    assert.deepEqual(spells[0].otherNames, ['FIRE1', 'Fire1', 'Fire']);
    assert.equal(spells[0].description, 'Minor fire damage');
    assert.equal(spells[1].name, 'LIT');
    assert.equal(spells[1].description, 'Already known');
    assert.equal(spells[1].range, 'One enemy');
  });

  it('links map files and sprites, adds places only a map names, and ignores invented answers', async () => {
    const parsed = {
      classes: [{ name: 'Black Mage' }],
      places: [{ name: 'Coneria', type: 'town' }, { name: 'Mt. Gulg', type: 'dungeon' }],
      sources: [
        { name: 'FFI_black_mage.gif', kind: 'image', role: 'unknown' },
        { name: 'FinalFantasy-Coneria.png', kind: 'image', role: 'unknown' },
        { name: 'FinalFantasy-GurguVolcano.png', kind: 'image', role: 'unknown' },
        { name: "FinalFantasy-Titan'sCave.png", kind: 'image', role: 'area-map' },
        { name: 'Spoilers_icon.png', kind: 'image', role: 'unknown' },
      ],
    };
    const warnings = await linkImages(parsed, {
      gameTitle: 'FF',
      ask: async () => ({ ok: true, text: JSON.stringify({
        maps: [{ file: 'FinalFantasy-Coneria.png', place: 'Coneria' }, { file: 'FinalFantasy-GurguVolcano.png', place: 'Mt. Gulg' }, { file: 'nope.png', place: 'Coneria' }, { file: 'Spoilers_icon.png', place: 'Atlantis' }],
        newPlaces: [{ file: "FinalFantasy-Titan'sCave.png", name: "Titan's Cave", type: 'dungeon' }],
        notMaps: ['Spoilers_icon.png'],
      }) }),
    });
    assert.deepEqual(warnings, []);
    const by = n => parsed.sources.find(s => s.name === n);
    assert.equal(by('FFI_black_mage.gif').role, 'class-sprite');
    assert.equal(by('FFI_black_mage.gif').depicts, 'Black Mage');
    assert.equal(by('FinalFantasy-GurguVolcano.png').depicts, 'Mt. Gulg');
    assert.equal(by('Spoilers_icon.png').role, 'unknown');
    assert.ok(parsed.places.some(p => p.name === "Titan's Cave"));

    const jobs = planJobs({ game: { title: 'FF' }, sources: parsed.sources, places: parsed.places, classes: parsed.classes });
    assert.deepEqual(jobs.find(j => j.id === 'area-map-mt-gulg').references, ['FinalFantasy-GurguVolcano.png']);
    assert.equal(jobs.find(j => j.id === 'area-map-coneria').basis, 'reference');
    assert.equal(jobs.find(j => j.id === 'class-sprite-black-mage').references[0], 'FFI_black_mage.gif');
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
      { id: 'area-map-corneria', kind: 'area-map', basis: 'text-only', references: [], depicts: 'place:corneria', title: 'old', file: 'x', raw: 'y' },
      { id: 'area-map-melmond', kind: 'area-map', basis: 'text-only', references: [], depicts: 'place:melmond', title: 'old', file: 'x', raw: 'y' },
    ] }));
    const parsed = {
      game: { title: 'FF' },
      sources: [{ name: 'coneria.png', path: ref, kind: 'image', role: 'area-map', depicts: 'Coneria' }],
      places: [{ name: 'Coneria', type: 'town', altNames: ['Corneria'] }, { name: 'Melmond', type: 'town' }],
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
    assert.deepEqual(ids, ['area-map-coneria', 'area-map-melmond']);
    fs.rmSync(out, { recursive: true, force: true });
  });
});

describe('jrpg parser: agent extraction', () => {
  it('drops records whose quote is not in the source', async () => {
    const text = visibleText(GUIDE);
    const res = await extractProse({ gameTitle: 'FF', text, sourceName: 'guide.html', ask: fakeAsk });
    assert.deepEqual(res.places.map(p => p.name), ['Corneria']);
    assert.equal(res.classes[0].upgradesTo, 'Knight');
    assert.match(res.warnings.join('\n'), /dropped 1 agent record/);
  });

  it('reports an agent failure instead of inventing records', async () => {
    const res = await extractProse({ gameTitle: 'FF', text: 'some text', sourceName: 'g', ask: async () => ({ ok: false, error: 'not signed in' }) });
    assert.equal(res.places.length, 0);
    assert.match(res.warnings[0], /not signed in/);
  });

  it('caches replies by prompt', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-cache-'));
    let calls = 0;
    const ask = async (p) => { calls++; return fakeAsk(p); };
    const text = visibleText(GUIDE);
    await extractProse({ gameTitle: 'FF', text, sourceName: 'g', cacheDir, ask });
    await extractProse({ gameTitle: 'FF', text, sourceName: 'g', cacheDir, ask });
    assert.equal(calls, 1);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it('merges duplicate names and points shops and milestones at the merged name', async () => {
    const parsed = {
      classes: [{ name: 'Warrior' }, { name: 'fighter', description: 'strong' }, { name: 'mage' }],
      places: [{ name: 'Elfheim', type: 'town' }, { name: 'elfland', type: 'town', description: 'elves' }, { name: 'MT. GULG', type: 'dungeon' }],
      equipment: [{ name: 'rapier' }],
      shops: [{ town: 'Elfheim', kind: 'weapon', stock: ['dagger'] }, { town: 'elfland', kind: 'weapon', stock: ['saber'] }],
      milestones: [{ title: 'Wake the prince', place: 'elfland' }],
    };
    const warnings = await consolidate(parsed, {
      gameTitle: 'FF',
      ask: async () => ({ ok: true, text: JSON.stringify({
        classes: [{ canonical: 'Warrior', aliases: ['Fighter'] }],
        places: [{ canonical: 'Elfheim', aliases: ['Elfland', 'Invented Place'] }],
        equipment: [],
        notRecords: { classes: ['Mage'] },
      }) }),
    });
    assert.deepEqual(warnings, []);
    assert.deepEqual(parsed.classes.map(c => c.name), ['Warrior']);
    assert.equal(parsed.classes[0].description, 'strong');
    assert.deepEqual(parsed.classes[0].altNames, ['Fighter']);
    assert.deepEqual(parsed.places.map(p => p.name), ['Elfheim', 'Mt. Gulg']);
    assert.equal(parsed.places[0].description, 'elves');
    assert.equal(parsed.milestones[0].place, 'Elfheim');
    assert.equal(parsed.shops.length, 1);
    assert.deepEqual(parsed.shops[0].stock, ['dagger', 'saber']);
  });

  it('keeps the records and warns when merging fails', async () => {
    const parsed = { classes: [{ name: 'Warrior' }], places: [], equipment: [], shops: [], milestones: [] };
    const warnings = await consolidate(parsed, { gameTitle: 'FF', ask: async () => ({ ok: false, error: 'offline' }) });
    assert.equal(parsed.classes.length, 1);
    assert.match(warnings[0], /offline/);
  });

  it('tidies names written in one case', () => {
    assert.equal(displayName('MT. GULG'), 'Mt. Gulg');
    assert.equal(displayName('elfland castle'), 'Elfland Castle');
    assert.equal(displayName("Matoya's House"), "Matoya's House");
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
    result = await pipeline.parse([dir], { out, title: 'Final Fantasy', edition: 'NES (USA)', ask: fakeAsk });
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
    assert.equal(jobs.find(j => j.id === 'area-map-corneria').basis, 'text-only');
    const world = jobs.find(j => j.kind === 'world-map');
    assert.equal(world.basis, 'reference');
    assert.deepEqual(world.references, ['world-map.png']);
    assert.ok(jobs.some(j => j.id === 'class-sprite-warrior'));
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
    assert.equal(map['jrpg:depicts']['@id'], 'urn:robos:jrpg:final-fantasy:place:corneria');
    assert.ok(nodes.some(n => n['@id'] === 'urn:robos:jrpg:final-fantasy:place:corneria'));
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
    await generateArt(result.parsed, out, { only: ['class-sprite-warrior'], generateImage });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /class-sprite-warrior/);
    const file = path.join(out, 'assets', 'generated', 'class-sprite', 'class-sprite-warrior.png');
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
