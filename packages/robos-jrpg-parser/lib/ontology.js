'use strict';

// What it takes to remake a classic JRPG, as kgraph types and asset categories.
// Nodes also carry the workspace's jrpg package types (robos:GameMonster,
// robos:GameSpell, robos:GameItem, schema:Place), so its SHACL shapes apply.

const JRPG_NS = 'https://robos.dev/ns/jrpg#';

// [type, parent, label, description]
const TYPE_HIERARCHY = [
  ['jrpg:Thing', null, 'JRPG Thing', 'Anything recorded about a JRPG remake.'],
  ['jrpg:Game', 'jrpg:Thing', 'Game', 'The game being remade.'],
  ['jrpg:Source', 'jrpg:Thing', 'Source File', 'A file a person collected and gave to the parser.'],
  ['jrpg:Asset', 'jrpg:Thing', 'Asset', 'A visual asset of the remake.'],
  ['jrpg:GeneratedImage', 'jrpg:Asset', 'Generated Image', 'An image a model generated from the source files or from text.'],
  ['jrpg:Map', 'jrpg:GeneratedImage', 'Map', 'A map image of a play area.'],
  ['jrpg:WorldMap', 'jrpg:Map', 'World Map', 'The overworld map.'],
  ['jrpg:AreaMap', 'jrpg:Map', 'Area Map', 'A town, castle or dungeon map.'],
  ['jrpg:BattleBackdrop', 'jrpg:GeneratedImage', 'Battle Backdrop', 'The scenery strip behind a battle.'],
  ['jrpg:Sprite', 'jrpg:GeneratedImage', 'Sprite', 'A character or enemy sprite.'],
  ['jrpg:MenuArt', 'jrpg:GeneratedImage', 'Menu Art', 'A rendered menu screen.'],
  ['jrpg:MenuScreen', 'jrpg:Thing', 'Menu Screen', 'A menu layout: its windows and what each holds.'],
  ['jrpg:Place', 'jrpg:Thing', 'Place', 'A place in the game world.'],
  ['jrpg:Town', 'jrpg:Place', 'Town', 'A town or village.'],
  ['jrpg:Castle', 'jrpg:Place', 'Castle', 'A castle.'],
  ['jrpg:Dungeon', 'jrpg:Place', 'Dungeon', 'A cave, tower, shrine or other dungeon.'],
  ['jrpg:Region', 'jrpg:Place', 'Region', 'An overworld region or landmark.'],
  ['jrpg:Character', 'jrpg:Thing', 'Character', 'Something with a sprite and stats.'],
  ['jrpg:PlayableClass', 'jrpg:Character', 'Playable Class', 'A class the player controls.'],
  ['jrpg:Enemy', 'jrpg:Character', 'Enemy', 'A monster with stats and rewards.'],
  ['jrpg:Boss', 'jrpg:Enemy', 'Boss', 'A scripted boss fight.'],
  ['jrpg:Item', 'jrpg:Thing', 'Item', 'Anything the party can carry.'],
  ['jrpg:Consumable', 'jrpg:Item', 'Consumable', 'An item used up when used.'],
  ['jrpg:KeyItem', 'jrpg:Item', 'Key Item', 'A story item that unlocks progress.'],
  ['jrpg:Equipment', 'jrpg:Item', 'Equipment', 'Something a character can equip.'],
  ['jrpg:Weapon', 'jrpg:Equipment', 'Weapon', 'A weapon.'],
  ['jrpg:Armor', 'jrpg:Equipment', 'Armor', 'Armor, shields, helmets, gloves.'],
  ['jrpg:Spell', 'jrpg:Thing', 'Spell', 'A spell: school, level, cost and effect.'],
  ['jrpg:Shop', 'jrpg:Thing', 'Shop', 'A shop or inn and what it sells.'],
  ['jrpg:Rule', 'jrpg:Thing', 'Rule', 'A rule the game engine follows.'],
  ['jrpg:Formula', 'jrpg:Rule', 'Formula', 'A battle, magic or economy formula.'],
  ['jrpg:StatDefinition', 'jrpg:Rule', 'Stat', 'A statistic and what it does.'],
  ['jrpg:StatusEffect', 'jrpg:Rule', 'Status Effect', 'A status ailment or buff.'],
  ['jrpg:Element', 'jrpg:Rule', 'Element', 'An element for weaknesses and resistances.'],
  ['jrpg:StoryMilestone', 'jrpg:Thing', 'Story Milestone', 'A step of the main quest, in order.'],
];

// What a remake needs. `types` are counted for coverage, `roles` count source
// files, and `collect` tells the person what to add when it is missing.
const ASSET_TYPES = [
  { id: 'world-map', label: 'World map reference', package: 'world', roles: ['world-map'], min: 1, collect: 'a full world map image' },
  { id: 'area-maps', label: 'Town, castle & dungeon map references', package: 'world', roles: ['area-map'], min: 1, collect: 'town, castle and dungeon map images; without them those maps are invented from text' },
  { id: 'places', label: 'Places', package: 'world', types: ['jrpg:Town', 'jrpg:Castle', 'jrpg:Dungeon', 'jrpg:Region'], min: 5, collect: 'a walkthrough that names each place' },
  { id: 'classes', label: 'Playable classes', package: 'characters', types: ['jrpg:PlayableClass'], min: 1, collect: 'class descriptions' },
  { id: 'sprite-refs', label: 'Sprite references', package: 'characters', roles: ['sprite-sheet', 'class-select'], min: 1, collect: 'a sprite sheet or class select screenshot' },
  { id: 'enemies', label: 'Enemies', package: 'bestiary', types: ['jrpg:Enemy'], min: 10, collect: 'a bestiary or monster chart' },
  { id: 'bosses', label: 'Bosses', package: 'bestiary', types: ['jrpg:Boss'], min: 1, collect: 'a boss chart' },
  { id: 'weapons', label: 'Weapons', package: 'items', types: ['jrpg:Weapon'], min: 10, collect: 'a weapon table with stats and prices' },
  { id: 'armor', label: 'Armor', package: 'items', types: ['jrpg:Armor'], min: 10, collect: 'an armor table with stats and prices' },
  { id: 'items', label: 'Items & key items', package: 'items', types: ['jrpg:Consumable', 'jrpg:KeyItem'], min: 5, collect: 'an item list' },
  { id: 'spells', label: 'Spells', package: 'magic', types: ['jrpg:Spell'], min: 1, collect: 'a spell chart' },
  { id: 'shops', label: 'Shops & inns', package: 'economy', types: ['jrpg:Shop'], min: 1, collect: 'a shop list with prices for this edition' },
  { id: 'menu-refs', label: 'Menu & battle screens', package: 'ui', types: ['jrpg:MenuScreen'], min: 1, collect: 'menu and battle screenshots' },
  { id: 'shop-screen', label: 'Shop screen reference', package: 'ui', roles: ['shop-screen'], min: 1, collect: 'a shop screen screenshot' },
  { id: 'rules', label: 'Rules (stats, statuses, elements)', package: 'rules', types: ['jrpg:StatDefinition', 'jrpg:StatusEffect', 'jrpg:Element', 'jrpg:Rule'], min: 3, collect: 'a guide to how stats, statuses and elements work' },
  { id: 'formulas', label: 'Battle formulas', package: 'rules', types: ['jrpg:Formula'], min: 5, collect: 'a battle mechanics guide with damage, hit and evade formulas' },
  { id: 'story', label: 'Story milestones', package: 'story', types: ['jrpg:StoryMilestone'], min: 5, collect: 'a walkthrough' },
  { id: 'music', label: 'Music', package: 'audio', roles: ['music'], min: 1, collect: 'music files or a track list' },
];

const PACKAGES = [
  { id: 'game', title: 'Game & Sources', description: 'The game and every file it was parsed from.' },
  { id: 'world', title: 'World, Places & Maps', description: 'World and area maps, towns, castles, dungeons and regions.' },
  { id: 'characters', title: 'Playable Classes', description: 'Party classes and their sprites.' },
  { id: 'bestiary', title: 'Enemies & Bosses', description: 'Every enemy with stats and rewards.' },
  { id: 'items', title: 'Weapons, Armor & Items', description: 'Equipment and items.' },
  { id: 'magic', title: 'Magic', description: 'Spells by school and level.' },
  { id: 'economy', title: 'Shops & Inns', description: 'What each town sells.' },
  { id: 'ui', title: 'Menus & UI', description: 'Menu layouts, battle layouts and rendered screens.' },
  { id: 'rules', title: 'Rule Engine', description: 'Formulas, stats, statuses and elements.' },
  { id: 'story', title: 'Story & Progression', description: 'Main quest milestones in order.' },
];

function ontologyDocument() {
  return {
    '@context': { jrpg: JRPG_NS, rdfs: 'http://www.w3.org/2000/01/rdf-schema#', dcterms: 'http://purl.org/dc/terms/' },
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

function coverage(nodes, sources = []) {
  const typeCount = new Map();
  for (const n of nodes) for (const t of [].concat(n['@type'] || [])) typeCount.set(t, (typeCount.get(t) || 0) + 1);
  const usable = sources.filter(s => s.use !== false);
  return ASSET_TYPES.map(a => {
    const count = a.roles
      ? usable.filter(s => a.roles.includes(s.role)).length
      : a.types.reduce((sum, t) => sum + (typeCount.get(t) || 0), 0);
    return { id: a.id, label: a.label, package: a.package, count, min: a.min, covered: count >= a.min, collect: a.collect };
  });
}

module.exports = { JRPG_NS, TYPE_HIERARCHY, ASSET_TYPES, PACKAGES, ontologyDocument, coverage };
