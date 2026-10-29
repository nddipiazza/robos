'use strict';

// Dragon Warrior (NES, USA, 1989): the worked example. Its facts were already
// acquired from fan strategy guides into the Quest: Warrior Dragon data store
// (games/quest-warrior-dragon/data/v1), and its art is original, generated
// from that data. This profile reads the data store and writes the same
// JRPG kgraph a web-acquired game gets, so both games share one format.

const fs = require('fs');
const path = require('path');
const { slug } = require('../kgraph-writer');

const GAME_SLUG = 'dragon-warrior';
const id = (kind, key) => `urn:robos:jrpg:${GAME_SLUG}:${kind}:${slug(key)}`;
const ref = (kind, key) => ({ '@id': id(kind, key) });

const SOURCES = [
  { key: 'data-store', title: 'Quest: Warrior Dragon v1 data store', url: 'https://github.com/nddipiazza/robos/tree/main/games/quest-warrior-dragon/data/v1', kind: 'local-datastore', license: 'Project data (facts from public strategy guides)', assetTypes: ['enemies', 'weapons', 'armor', 'items', 'spells', 'shops', 'places', 'story', 'rule-engine'] },
  { key: 'generated-assets', title: 'Quest: Warrior Dragon original generated art', url: 'https://github.com/nddipiazza/robos/tree/main/games/quest-warrior-dragon/assets', kind: 'local-datastore', license: 'Original procedural art (tools/generate_original_assets.py)', assetTypes: ['world-map', 'area-maps', 'enemies', 'character-sprites', 'music'] },
  { key: 'ryan8bit', title: "Ryan8bit's Dragon Warrior formula guide (GameFAQs)", url: 'https://gamefaqs.gamespot.com/nes/563408-dragon-warrior/faqs/61640', kind: 'faq', license: 'Cited, not copied', assetTypes: ['rule-engine'] },
  { key: 'mikesrpgcenter', title: "Mike's RPG Center: Dragon Warrior", url: 'https://www.mikesrpgcenter.com/dw1/', kind: 'fan-site', license: 'Cited, not copied', assetTypes: ['enemies', 'items', 'places', 'shops'] },
];

const LOCATION_TYPES = { castle: 'jrpg:Castle', town: 'jrpg:Town', cave: 'jrpg:Dungeon', dungeon: 'jrpg:Dungeon', ruins: 'jrpg:Town' };
const BOSSES = new Set(['golem', 'green_dragon', 'axe_knight', 'dragonlord_form1', 'dragonlord_form2']);

function readJson(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function image(rel, caption, opts) {
  const src = path.join(opts.gameDir, rel);
  if (!fs.existsSync(src)) return null;
  let contentUrl = `https://raw.githubusercontent.com/nddipiazza/robos/main/games/quest-warrior-dragon/${rel}`;
  if (opts.outDir && opts.copyAssets) {
    const dest = path.join(opts.outDir, 'assets', rel.replace(/^assets\//, ''));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    contentUrl = path.posix.join('assets', rel.replace(/^assets\//, ''));
  }
  return { '@type': 'schema:ImageObject', 'schema:contentUrl': contentUrl, 'schema:caption': caption, 'schema:creditText': 'Quest: Warrior Dragon original art', 'jrpg:license': 'Original work' };
}

const sourceRefs = keys => keys.map(k => ({ '@id': id('source', k) }));

module.exports = {
  id: 'dragon-warrior-usa',
  title: 'Dragon Warrior',
  platform: 'NES',
  region: 'USA',
  year: 1989,
  description: 'Dragon Warrior (NES, USA): rebuilt from the Quest: Warrior Dragon data store, which was acquired from public strategy guides.',
  sources: SOURCES,

  async acquire(ctx) {
    const repoRoot = ctx.repoRoot || path.resolve(__dirname, '..', '..', '..', '..');
    const gameDir = path.join(repoRoot, 'games', 'quest-warrior-dragon');
    const dataDir = path.join(gameDir, 'data', 'v1');
    if (!fs.existsSync(dataDir)) throw new Error(`Dragon Warrior data store not found at ${dataDir}`);
    const opts = { gameDir, outDir: ctx.outDir, copyAssets: ctx.copyAssets !== false };
    const log = ctx.log || (() => {});
    const nodes = [];
    const add = n => { nodes.push(n); return n; };
    const ds = sourceRefs(['data-store']);

    log('Reading monsters, spells and equipment from the data store');
    const monsters = readJson(dataDir, 'monsters.json');
    for (const m of monsters) {
      const img = image(`assets/sprites/bestiary/${m.key}.png`, `${m.name} battle sprite`, opts);
      add({
        '@id': id('enemy', m.key),
        '@type': [BOSSES.has(m.key) ? 'jrpg:Boss' : 'jrpg:Enemy', 'schema:Thing'],
        'dcterms:title': m.name,
        'robos:package': 'bestiary',
        'jrpg:hp': m.hp_min === m.hp_max ? m.hp_max : `${m.hp_min}-${m.hp_max}`,
        'jrpg:strength': m.strength,
        'jrpg:agility': m.agility,
        'jrpg:experience': m.xp,
        'jrpg:gold': m.gp_min === m.gp_max ? m.gp_max : `${m.gp_min}-${m.gp_max}`,
        'jrpg:resistSleep': m.resist_sleep,
        'jrpg:resistStopspell': m.resist_stopspell,
        ...(m.resist_hurt !== undefined ? { 'jrpg:resistHurt': m.resist_hurt } : {}),
        ...(m.dodge !== undefined ? { 'jrpg:dodge': m.dodge } : {}),
        ...(img ? { 'schema:image': [img] } : {}),
        'jrpg:sources': ds,
      });
    }

    for (const s of readJson(dataDir, 'spells.json')) {
      add({
        '@id': id('spell', s.id), '@type': ['jrpg:Spell'], 'dcterms:title': s.name, 'robos:package': 'magic',
        'dcterms:description': s.effect, 'jrpg:cost': `${s.mp_cost} MP`, 'jrpg:levelLearned': s.level_learned, 'jrpg:target': s.target,
        ...(s.formula ? { 'jrpg:formula': s.formula } : {}),
        ...(image(`assets/images/spells/${s.id}.png`, `${s.name} effect`, opts) ? { 'schema:image': [image(`assets/images/spells/${s.id}.png`, `${s.name} effect`, opts)] } : {}),
        'jrpg:sources': ds,
      });
    }

    for (const [file, type, slot] of [['weapons.json', 'jrpg:Weapon', 'weapon'], ['armor.json', 'jrpg:Armor', 'armor'], ['shields.json', 'jrpg:Armor', 'shield']]) {
      for (const w of readJson(dataDir, file)) {
        add({
          '@id': id(slot, w.id), '@type': [type], 'dcterms:title': w.name, 'robos:package': 'items', 'jrpg:slot': slot,
          ...(w.attack !== undefined ? { 'jrpg:attack': w.attack } : {}), ...(w.defense !== undefined ? { 'jrpg:defense': w.defense } : {}),
          'jrpg:price': w.cost, 'jrpg:soldIn': (w.sold_in || []).join(', '), 'jrpg:sources': ds,
        });
      }
    }
    for (const it of readJson(dataDir, 'items.json')) {
      add({ '@id': id('item', it.id), '@type': ['jrpg:Consumable'], 'dcterms:title': it.name, 'robos:package': 'items', 'dcterms:description': it.effect || '', 'jrpg:price': it.cost, 'jrpg:soldIn': (it.sold_in || []).join(', '), 'jrpg:sources': ds });
    }
    for (const q of readJson(dataDir, 'quest_items.json')) {
      add({ '@id': id('item', q.id), '@type': ['jrpg:KeyItem'], 'dcterms:title': q.name, 'robos:package': 'items', 'dcterms:description': q.effect || '', 'jrpg:foundAt': q.found_description || q.location || '', 'jrpg:sources': ds });
    }

    log('Reading places, maps and shops');
    const mapFiles = fs.readdirSync(path.join(gameDir, 'assets', 'maps')).filter(f => /\.png$/.test(f) && !/grid|terrain|over2|throne_room/.test(f));
    const locations = readJson(dataDir, 'locations.json');
    const dungeons = readJson(dataDir, 'dungeons.json');
    const places = [
      ...locations.map(l => ({ key: l.id, name: l.name, type: l.type, description: l.description, inn: l.inn_price })),
      ...dungeons.map(d => ({ key: d.id, name: d.name, type: 'dungeon', description: d.description })),
    ];
    const usedMaps = new Set();
    for (const p of places) {
      const prefix = p.key.replace(/_/g, '-');
      const maps = mapFiles.filter(f => !usedMaps.has(f) && (f.startsWith(prefix) || f.startsWith(prefix.replace(/-castle$/, ''))));
      maps.forEach(f => usedMaps.add(f));
      add({
        '@id': id('place', p.key), '@type': [LOCATION_TYPES[p.type] || 'jrpg:Region'], 'dcterms:title': p.name, 'robos:package': 'world',
        'dcterms:description': p.description || '', ...(p.inn ? { 'jrpg:innPrice': p.inn } : {}),
        'jrpg:maps': maps.map(f => ref('map', f.replace(/\.png$/, ''))), 'jrpg:sources': ds,
      });
      for (const f of maps) {
        const key = f.replace(/\.png$/, '');
        add({ '@id': id('map', key), '@type': ['jrpg:AreaMap'], 'dcterms:title': `${p.name} ${key.slice(prefix.length).replace(/^-/, '').toUpperCase() || ''}`.trim(), 'robos:package': 'world', 'jrpg:place': ref('place', p.key), 'schema:image': [image(`assets/maps/${f}`, `${p.name} map`, opts)].filter(Boolean), 'jrpg:sources': sourceRefs(['generated-assets']) });
      }
    }
    add({ '@id': id('map', 'world'), '@type': ['jrpg:WorldMap'], 'dcterms:title': 'Alefgard', 'robos:package': 'world', 'dcterms:description': 'The overworld of Alefgard, 124 by 124 tiles, split into an 8 by 8 grid of encounter zones.', 'schema:image': [image('assets/maps/world-map.png', 'Alefgard overworld', opts)].filter(Boolean), 'jrpg:sources': sourceRefs(['generated-assets']) });

    const shopIds = new Set();
    for (const shop of readJson(dataDir, 'shops.json')) {
      let shopKey = shop.id;
      for (let n = 2; shopIds.has(shopKey); n++) shopKey = `${shop.id}-${n}`;
      shopIds.add(shopKey);
      add({
        '@id': id('shop', shopKey), '@type': ['jrpg:Shop'], 'dcterms:title': `${shop.location_name} ${shop.type.replace(/_/g, ' ')}`, 'robos:package': 'economy',
        'jrpg:shopType': shop.type, 'jrpg:place': ref('place', shop.location_id),
        'jrpg:stock': (shop.inventory || []).map(i => ({ 'jrpg:item': i.item_id, 'jrpg:price': i.price })), 'jrpg:sources': ds,
      });
    }

    // Each overworld zone draws one-enemy fights from a pool of five slots.
    const zones = readJson(dataDir, 'worldmap_zones.json');
    for (const [setId, pool] of Object.entries(zones.monster_sets || {})) {
      const cells = [];
      (zones.grid || []).forEach((row, r) => row.forEach((z, c) => { if (String(z) === setId) cells.push(`(${c},${r})`); }));
      const counts = pool.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
      add({
        '@id': id('formation', `zone-${setId}`), '@type': ['jrpg:EncounterFormation'], 'dcterms:title': `Overworld zone ${setId} encounter pool`, 'robos:package': 'bestiary',
        'dcterms:description': 'Dragon Warrior fights one monster at a time; each fight picks one of the five slots of the zone pool.',
        'jrpg:formationNumber': Number(setId), 'jrpg:enemies': [...counts].map(([k, n]) => `${monsters.find(m => m.key === k)?.name || k} ${n}/5`).join(', '),
        'jrpg:members': [...counts.keys()].map(k => ref('enemy', k)), 'jrpg:appears': cells.length ? [{ 'jrpg:where': `World map zones ${cells.join(' ')}` }] : [],
        'jrpg:sources': ds,
      });
    }

    log('Reading the hero, rules and milestones');
    const hero = image('assets/sprites/hero-custom.png', 'Hero sprite sheet', opts);
    add({ '@id': id('class', 'hero'), '@type': ['jrpg:PlayableClass'], 'dcterms:title': 'Hero (descendant of Erdrick)', 'robos:package': 'characters', 'dcterms:description': 'The single playable hero. Stats grow by level from the progression table; spells are learned at set levels.', ...(hero ? { 'schema:image': [hero] } : {}), 'jrpg:sources': ds });
    for (const [key, name, desc] of [['king-lorik', 'King Lorik', 'Ruler of Alefgard; saves the adventure log and gives the quest.'], ['princess-gwaelin', 'Princess Gwaelin', 'Held by a dragon in the Swamp Cave; gives Gwaelin\'s Love when returned.'], ['dragonlord', 'Dragonlord', 'Holds the Ball of Light in Charlock Castle.']]) {
      add({ '@id': id('npc', key), '@type': ['jrpg:NPC'], 'dcterms:title': name, 'robos:package': 'characters', 'dcterms:description': desc, 'jrpg:sources': ds });
    }

    const levels = readJson(dataDir, 'levels.json');
    add({ '@id': id('rule', 'level-table'), '@type': ['jrpg:ProgressionTable'], 'dcterms:title': 'Experience and level table', 'robos:package': 'rules', 'jrpg:columns': ['level', 'exp_required', 'spell'], 'jrpg:rows': levels.map(l => [l.level, l.exp_required, l.spell || '']), 'jrpg:sources': ds });
    const formulas = readJson(dataDir, 'combat_formulas.json');
    for (const [key, value] of Object.entries(formulas)) {
      if (key.startsWith('$') || key.startsWith('_')) continue;
      const body = typeof value === 'string' ? { expression: value } : value;
      add({
        '@id': id('rule', key), '@type': ['jrpg:Formula'], 'dcterms:title': key.replace(/_/g, ' '), 'robos:package': 'rules',
        'dcterms:description': body.description || '', 'jrpg:expression': Object.entries(body).filter(([k]) => k !== 'description').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'),
        'jrpg:sources': sourceRefs(['data-store', 'ryan8bit']),
      });
    }

    const ms = readJson(dataDir, 'milestones.json').milestones;
    let prev = null;
    for (const m of ms) {
      add({
        '@id': id('milestone', `${String(m.seq).padStart(3, '0')}-${m.id}`), '@type': ['jrpg:StoryMilestone'], 'dcterms:title': m.name, 'robos:package': 'story',
        'jrpg:sequence': m.seq, 'jrpg:chapter': m.phase, 'jrpg:kind': m.type, 'jrpg:optional': Boolean(m.optional), 'jrpg:minLevel': m.min_level || 1,
        'jrpg:where': m.map, 'jrpg:doneWhen': m.done_when ? JSON.stringify(m.done_when) : '', ...(prev ? { 'jrpg:after': { '@id': prev } } : {}),
        'jrpg:sources': ds,
      });
      prev = id('milestone', `${String(m.seq).padStart(3, '0')}-${m.id}`);
    }

    for (const [key, title, items] of [['command', 'Command window', 'TALK, SPELL, STATUS, ITEM, STAIRS, DOOR, SEARCH, TAKE'], ['battle', 'Battle command window', 'FIGHT, SPELL, RUN, ITEM'], ['shop', 'Shop list', 'Item names with right-aligned prices; YES/NO confirm']]) {
      add({ '@id': id('menu', key), '@type': ['jrpg:MenuScreen'], 'dcterms:title': title, 'robos:package': 'ui', 'jrpg:commands': items, 'dcterms:description': 'Drawn by MenuKit in the remake: measured text, right-aligned numbers, scrolling lists.', 'jrpg:sources': ds });
    }
    const mp3 = fs.readdirSync(path.join(gameDir, 'assets', 'music', 'mp3')).filter(f => /\.mp3$/.test(f)).slice(0, 60);
    for (const f of mp3) add({ '@id': id('music', f.replace(/\.mp3$/, '')), '@type': ['jrpg:MusicTrack'], 'dcterms:title': f.replace(/\.mp3$/, '').replace(/_/g, ' '), 'robos:package': 'audio', 'jrpg:sources': sourceRefs(['generated-assets']) });

    const game = {
      '@id': id('game', 'dragon-warrior'), '@type': ['jrpg:Game', 'schema:VideoGame'], 'dcterms:title': 'Dragon Warrior', 'robos:package': 'game',
      'dcterms:description': 'Dragon Warrior (NES, USA, 1989), the first Dragon Quest. One hero, one kingdom, the Dragonlord and the Ball of Light.',
      'jrpg:platform': 'NES', 'jrpg:region': 'USA', 'jrpg:year': 1989, 'jrpg:remake': { '@id': 'urn:robos:jrpg:game:quest-warrior-dragon' },
      'schema:image': [image('assets/title-screen.png', 'Remake title screen', opts)].filter(Boolean),
    };
    return { game, nodes, sources: SOURCES.map(s => sourceNode(GAME_SLUG, s)), warnings: [] };
  },
};

function sourceNode(gameSlug, s) {
  return {
    '@id': `urn:robos:jrpg:${gameSlug}:source:${slug(s.key)}`, '@type': ['jrpg:Source', 'schema:WebSite'], 'dcterms:title': s.title, 'robos:package': 'game',
    'schema:url': s.url, 'jrpg:sourceKind': s.kind, 'jrpg:license': s.license, 'jrpg:assetTypes': s.assetTypes, 'jrpg:status': s.status || 'used',
  };
}

module.exports.sourceNode = sourceNode;
