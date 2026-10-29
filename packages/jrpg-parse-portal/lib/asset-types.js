'use strict';

// What it takes to remake a classic JRPG, as kgraph types and asset
// categories. The ontology's subClassOf chain is also what a kgraph site
// viewer walks to find a renderer for a node (own type → parent → generic).

const JRPG_NS = 'https://robos.dev/ns/jrpg#';

// [type, parent, label, description]
const TYPE_HIERARCHY = [
  ['jrpg:Thing', null, 'JRPG Thing', 'Anything recorded about a JRPG remake.'],
  ['jrpg:Game', 'jrpg:Thing', 'Game', 'The game being remade: release, platform, credits and the sources it was rebuilt from.'],
  ['jrpg:Source', 'jrpg:Thing', 'Fan Resource', 'A fan site, wiki, map atlas, walkthrough or data store the kgraph was acquired from.'],
  ['jrpg:Asset', 'jrpg:Thing', 'Asset', 'A visual or audio asset of the game.'],
  ['jrpg:Map', 'jrpg:Asset', 'Map', 'A full map image of a play area.'],
  ['jrpg:WorldMap', 'jrpg:Map', 'World Map', 'The overworld map.'],
  ['jrpg:AreaMap', 'jrpg:Map', 'Area Map', 'A town, castle or dungeon floor map.'],
  ['jrpg:MenuScreen', 'jrpg:Asset', 'Menu Screen', 'A menu or window layout the remake must reproduce.'],
  ['jrpg:MusicTrack', 'jrpg:Asset', 'Music Track', 'A music theme and where it plays.'],
  ['jrpg:Place', 'jrpg:Thing', 'Place', 'A place in the game world.'],
  ['jrpg:Town', 'jrpg:Place', 'Town', 'A town or village with shops, inns and townspeople.'],
  ['jrpg:Castle', 'jrpg:Place', 'Castle', 'A castle.'],
  ['jrpg:Dungeon', 'jrpg:Place', 'Dungeon', 'A cave, tower, shrine or other dungeon.'],
  ['jrpg:Region', 'jrpg:Place', 'Region', 'An overworld region, sea or landmark.'],
  ['jrpg:Character', 'jrpg:Thing', 'Character', 'Something with a sprite and stats.'],
  ['jrpg:PlayableClass', 'jrpg:Character', 'Playable Class', 'A hero, job or class the player controls, with battle and map sprites.'],
  ['jrpg:NPC', 'jrpg:Character', 'NPC', 'A named non-player character.'],
  ['jrpg:Enemy', 'jrpg:Character', 'Enemy', 'A monster with stats, rewards, weaknesses and sprites.'],
  ['jrpg:Boss', 'jrpg:Enemy', 'Boss', 'A scripted boss fight.'],
  ['jrpg:EncounterFormation', 'jrpg:Thing', 'Encounter Formation', 'A group of enemies that can appear together, and where.'],
  ['jrpg:Item', 'jrpg:Thing', 'Item', 'Anything the party can carry.'],
  ['jrpg:Consumable', 'jrpg:Item', 'Consumable', 'An item used up when used.'],
  ['jrpg:KeyItem', 'jrpg:Item', 'Key Item', 'A story item that unlocks progress.'],
  ['jrpg:Equipment', 'jrpg:Item', 'Equipment', 'Something a character can equip.'],
  ['jrpg:Weapon', 'jrpg:Equipment', 'Weapon', 'A weapon.'],
  ['jrpg:Armor', 'jrpg:Equipment', 'Armor', 'Body armor, shields, helmets, gloves.'],
  ['jrpg:Spell', 'jrpg:Thing', 'Spell', 'A spell: school, level, cost, target and effect.'],
  ['jrpg:Shop', 'jrpg:Thing', 'Shop', 'A shop or inn and its stock and prices.'],
  ['jrpg:Rule', 'jrpg:Thing', 'Rule', 'A rule the game engine follows.'],
  ['jrpg:Formula', 'jrpg:Rule', 'Formula', 'A battle, magic or economy formula.'],
  ['jrpg:StatDefinition', 'jrpg:Rule', 'Stat', 'A character or enemy statistic and what it does.'],
  ['jrpg:StatusEffect', 'jrpg:Rule', 'Status Effect', 'A status ailment or buff.'],
  ['jrpg:Element', 'jrpg:Rule', 'Element', 'An element for weaknesses and resistances.'],
  ['jrpg:ProgressionTable', 'jrpg:Rule', 'Progression Table', 'Experience and level-up tables.'],
  ['jrpg:StoryMilestone', 'jrpg:Thing', 'Story Milestone', 'A step of the main quest, in story order, with what it needs and what it unlocks.'],
  ['jrpg:StoryFlag', 'jrpg:Thing', 'Story Flag', 'A story state or vehicle that milestones require or grant.'],
];

// The asset categories a remake needs. `types` are the kgraph types counted
// for coverage; `min` is the smallest count that counts as covered.
const ASSET_TYPES = [
  { id: 'world-map', label: 'World map', package: 'world', types: ['jrpg:WorldMap'], min: 1, hints: ['map atlas (VGMaps, NESMaps)', 'ROM map documentation'] },
  { id: 'area-maps', label: 'Town, castle & dungeon maps', package: 'world', types: ['jrpg:AreaMap'], min: 5, hints: ['map atlas (VGMaps)', 'walkthrough maps'] },
  { id: 'places', label: 'Places & regions', package: 'world', types: ['jrpg:Town', 'jrpg:Castle', 'jrpg:Dungeon', 'jrpg:Region'], min: 5, hints: ['fan wiki location lists'] },
  { id: 'character-sprites', label: 'Playable classes & character sprites', package: 'characters', types: ['jrpg:PlayableClass'], min: 1, hints: ['fan wiki job pages', 'sprite archives'] },
  { id: 'npcs', label: 'NPCs', package: 'characters', types: ['jrpg:NPC'], min: 1, hints: ['fan wiki character list', 'walkthrough'] },
  { id: 'enemies', label: 'Enemies & enemy sprites', package: 'bestiary', types: ['jrpg:Enemy', 'jrpg:Boss'], min: 10, hints: ['fan wiki bestiary', 'enemy FAQ'] },
  { id: 'bosses', label: 'Bosses', package: 'bestiary', types: ['jrpg:Boss'], min: 1, hints: ['fan wiki boss pages', 'boss FAQ'] },
  { id: 'formations', label: 'Encounter formations', package: 'bestiary', types: ['jrpg:EncounterFormation'], min: 1, hints: ['enemy formation tables', 'ROM data'] },
  { id: 'weapons', label: 'Weapons', package: 'items', types: ['jrpg:Weapon'], min: 1, hints: ['fan wiki weapon tables'] },
  { id: 'armor', label: 'Armor', package: 'items', types: ['jrpg:Armor'], min: 1, hints: ['fan wiki armor tables'] },
  { id: 'items', label: 'Items & key items', package: 'items', types: ['jrpg:Consumable', 'jrpg:KeyItem'], min: 1, hints: ['fan wiki item tables'] },
  { id: 'spells', label: 'Spells', package: 'magic', types: ['jrpg:Spell'], min: 1, hints: ['fan wiki magic pages', 'magic FAQ'] },
  { id: 'shops', label: 'Shops & inns', package: 'economy', types: ['jrpg:Shop'], min: 1, hints: ['fan wiki town pages', 'shop lists'] },
  { id: 'menus', label: 'Menu screens (menu type)', package: 'ui', types: ['jrpg:MenuScreen'], min: 1, hints: ['fan wiki menu page', 'screenshots'] },
  { id: 'rule-engine', label: 'Rule engine (formulas, stats, statuses, elements, levels)', package: 'rules', types: ['jrpg:Formula', 'jrpg:StatDefinition', 'jrpg:StatusEffect', 'jrpg:Element', 'jrpg:ProgressionTable'], min: 3, hints: ['battle mechanics guides', 'fan wiki stat pages', 'disassembly notes'] },
  { id: 'story', label: 'Story milestones & progression', package: 'story', types: ['jrpg:StoryMilestone'], min: 5, hints: ['walkthroughs', 'fan wiki story section'] },
  { id: 'music', label: 'Music themes', package: 'audio', types: ['jrpg:MusicTrack'], min: 1, hints: ['soundtrack pages'] },
];

const PACKAGES = [
  { id: 'game', title: 'Game & Sources', description: 'The game, its release and every fan resource the kgraph was acquired from.' },
  { id: 'world', title: 'World, Places & Maps', description: 'Overworld and area maps, towns, castles, dungeons and regions.' },
  { id: 'characters', title: 'Playable Classes & NPCs', description: 'Party classes with battle and map sprites, and named characters.' },
  { id: 'bestiary', title: 'Enemies, Bosses & Formations', description: 'Every enemy with stats, rewards, sprites and encounter formations.' },
  { id: 'items', title: 'Weapons, Armor & Items', description: 'Equipment and items with stats, prices and who can use them.' },
  { id: 'magic', title: 'Magic', description: 'Spells by school and level.' },
  { id: 'economy', title: 'Shops & Inns', description: 'What each town sells and for how much.' },
  { id: 'ui', title: 'Menus & UI', description: 'Menu screens and window layouts.' },
  { id: 'rules', title: 'Rule Engine', description: 'Battle and magic formulas, stats, statuses, elements and level tables.' },
  { id: 'story', title: 'Story & Progression', description: 'Main quest milestones in order, with requirements and unlocks.' },
  { id: 'audio', title: 'Music', description: 'Music themes and where they play.' },
];

function ontologyDocument() {
  return {
    '@context': {
      jrpg: JRPG_NS,
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      dcterms: 'http://purl.org/dc/terms/',
    },
    '@id': 'urn:robos:ontology:jrpg',
    'dcterms:title': 'RobOS JRPG remake ontology',
    'robos:classes': TYPE_HIERARCHY.map(([id, parent, label, description]) => ({
      '@id': id,
      '@type': 'rdfs:Class',
      'rdfs:label': label,
      'rdfs:comment': description,
      ...(parent ? { 'rdfs:subClassOf': { '@id': parent } } : {}),
    })),
  };
}

// Parent chain for a type, nearest first (the type itself is not included).
function ancestors(type) {
  const parentOf = new Map(TYPE_HIERARCHY.map(([id, parent]) => [id, parent]));
  const out = [];
  let cur = parentOf.get(type);
  while (cur) { out.push(cur); cur = parentOf.get(cur); }
  return out;
}

function coverage(nodes) {
  const typeCount = new Map();
  for (const n of nodes) for (const t of [].concat(n['@type'] || [])) typeCount.set(t, (typeCount.get(t) || 0) + 1);
  return ASSET_TYPES.map(a => {
    const count = a.types.reduce((sum, t) => sum + (typeCount.get(t) || 0), 0);
    return { id: a.id, label: a.label, package: a.package, count, min: a.min, covered: count >= a.min };
  });
}

module.exports = { JRPG_NS, TYPE_HIERARCHY, ASSET_TYPES, PACKAGES, ontologyDocument, ancestors, coverage };
