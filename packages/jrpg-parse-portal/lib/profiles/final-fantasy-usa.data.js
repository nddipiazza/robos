'use strict';

// Curated facts for Final Fantasy (NES, USA) that no single fan page holds in
// table form. Written by the agent from the cited pages; each entry names its
// source so a reviewer can check it.

// Fandom page → NES (USA) name → VGMaps NES atlas files.
const LOCATIONS = [
  { page: 'Cornelia (Final Fantasy)', nes: 'Coneria', type: 'jrpg:Town', maps: ['FinalFantasy-Coneria.png'] },
  { page: 'Castle Cornelia (Final Fantasy)', nes: 'Coneria Castle', type: 'jrpg:Castle', maps: ['FinalFantasy-ConeriaCastle.png'] },
  { page: 'Chaos Shrine (Final Fantasy)', nes: 'Temple of Fiends', type: 'jrpg:Dungeon', maps: ['FinalFantasy-TempleOfFiends(Present).png', 'FinalFantasy-TempleOfFiends(Past).png'] },
  { page: "Matoya's Cave (Final Fantasy)", nes: "Matoya's Cave", type: 'jrpg:Dungeon', maps: ["FinalFantasy-Matoya'sCave.png"] },
  { page: 'Pravoka', nes: 'Pravoka', type: 'jrpg:Town', maps: ['FinalFantasy-Pravoka.png'] },
  { page: 'Elfheim', nes: 'Elfland', type: 'jrpg:Town', maps: ['FinalFantasy-Elfland.png'] },
  { page: 'Elven Castle', nes: 'Elfland Castle', type: 'jrpg:Castle', maps: ['FinalFantasy-ElflandCastle.png'] },
  { page: 'Western Keep', nes: 'Northwest Castle', type: 'jrpg:Castle', maps: ['FinalFantasy-NorthwestCastle.png'] },
  { page: 'Marsh Cave', nes: 'Marsh Cave', type: 'jrpg:Dungeon', maps: ['FinalFantasy-MarshCave.png'] },
  { page: 'Mount Duergar', nes: 'Dwarf Cave', type: 'jrpg:Dungeon', maps: ['FinalFantasy-DwarfCave.png'] },
  { page: 'Melmond', nes: 'Melmond', type: 'jrpg:Town', maps: ['FinalFantasy-Melmond.png'] },
  { page: 'Cavern of Earth', nes: 'Earth Cave', type: 'jrpg:Dungeon', maps: ['FinalFantasy-EarthCave.png'] },
  { page: "Giant's Cave", nes: "Titan's Tunnel", type: 'jrpg:Dungeon', maps: ["FinalFantasy-Titan'sCave.png"] },
  { page: "Sage's Cave", nes: "Sarda's Cave", type: 'jrpg:Dungeon', maps: ["FinalFantasy-Sarda'sCave.png"] },
  { page: 'Crescent Lake', nes: 'Crescent Lake', type: 'jrpg:Town', maps: ['FinalFantasy-CrescentLake.png'] },
  { page: 'Mount Gulg (Final Fantasy)', nes: 'Gurgu Volcano', type: 'jrpg:Dungeon', maps: ['FinalFantasy-GurguVolcano.png'] },
  { page: 'Cavern of Ice', nes: 'Ice Cave', type: 'jrpg:Dungeon', maps: ['FinalFantasy-IceCave.png'] },
  { page: 'Cardian Islands', nes: 'Cardia Islands', type: 'jrpg:Region', maps: ['FinalFantasy-CardiaIslands.png'] },
  { page: 'Citadel of Trials', nes: 'Castle of Ordeals', type: 'jrpg:Castle', maps: ['FinalFantasy-CastleOfOrdeals.png'] },
  { page: 'Gaia (Final Fantasy)', nes: 'Gaia', type: 'jrpg:Town', maps: ['FinalFantasy-Gaia.png'] },
  { page: 'Onrac', nes: 'Onrac', type: 'jrpg:Town', maps: ['FinalFantasy-Onrac.png'] },
  { page: 'Waterfall Cavern', nes: 'Waterfall', type: 'jrpg:Dungeon', maps: ['FinalFantasy-Waterfall.png'] },
  { page: 'Sunken Shrine', nes: 'Sea Shrine', type: 'jrpg:Dungeon', maps: ['FinalFantasy-SeaShrine.png'] },
  { page: 'Lufenia (Final Fantasy)', nes: 'Lefein', type: 'jrpg:Town', maps: ['FinalFantasy-Lefein.png'] },
  { page: 'Mirage Tower', nes: 'Mirage Tower', type: 'jrpg:Dungeon', maps: ['FinalFantasy-MirageTower.png'] },
  { page: 'Flying Fortress', nes: 'Sky Castle', type: 'jrpg:Dungeon', maps: ['FinalFantasy-SkyCastle.png'] },
  { page: 'Cornelia Bridge', nes: 'Coneria Bridge', type: 'jrpg:Region', maps: [] },
  { page: 'Aldean Sea', nes: 'Inner Sea', type: 'jrpg:Region', maps: [] },
  { page: 'Ryukahn Desert', nes: 'Ryukahn Desert', type: 'jrpg:Region', maps: [] },
  { page: 'Caravan (Final Fantasy)', nes: 'Caravan', type: 'jrpg:Region', maps: [] },
  { page: 'Yahnikurm Desert', nes: 'Yahnikurm Desert', type: 'jrpg:Region', maps: [] },
];

// Dungeons added by the Dawn of Souls / 20th Anniversary remakes. Anything only
// found there is left out of the NES kgraph.
const REMAKE_ONLY_PLACES = ['Earthgift Shrine', 'Hellfire Chasm', 'Lifespring Grotto', 'Whisperwind Cove', 'Labyrinth of Time'];

const WALKTHROUGH = 'Walkthrough:Final Fantasy/Apoqliphoth/Part ';

// Main quest in story order (Apoqliphoth walkthrough parts 1-14, key item
// acquisition text from "Final Fantasy items"). requires/grants name key
// items, vehicles and story flags.
const STORY = [
  { chapter: 'Prologue', title: 'Hear the King of Coneria: Princess Sara has been taken by Garland', place: 'Castle Cornelia (Final Fantasy)', grants: [], requires: [], part: 1 },
  { chapter: 'Prologue', title: 'Defeat Garland in the Temple of Fiends and rescue Princess Sara', place: 'Chaos Shrine (Final Fantasy)', boss: 'Garland (Final Fantasy boss)', requires: [], grants: ['Princess Sara rescued'], part: 1 },
  { chapter: 'Prologue', title: 'Return Sara to the king: receive the Lute and the rebuilt bridge north', place: 'Castle Cornelia (Final Fantasy)', requires: ['Princess Sara rescued'], grants: ['Lute', 'Coneria Bridge'], part: 1 },
  { chapter: 'Pravoka', title: "Drive Bikke's pirates out of Pravoka and take their ship", place: 'Pravoka', boss: 'Pirate (Final Fantasy)', requires: ['Coneria Bridge'], grants: ['Ship'], part: 2 },
  { chapter: 'Elfland', title: 'Sail to Elfland: the Elf Prince is under a sleeping curse', place: 'Elven Castle', requires: ['Ship'], grants: [], part: 3 },
  { chapter: 'Elfland', title: 'Take the Crown from the bottom of the Marsh Cave', place: 'Marsh Cave', requires: ['Ship'], grants: ['Crown'], part: 3 },
  { chapter: 'Elfland', title: 'Bring the Crown to the Northwest Castle and defeat Astos', place: 'Western Keep', boss: 'Astos', requires: ['Crown'], grants: ['Crystal Eye'], part: 4 },
  { chapter: 'Elfland', title: 'Return the Crystal Eye to Matoya for the Jolt Tonic (HERB)', place: "Matoya's Cave (Final Fantasy)", requires: ['Crystal Eye'], grants: ['Jolt Tonic'], part: 4 },
  { chapter: 'Elfland', title: 'Wake the Elf Prince with the Jolt Tonic and receive the Mystic Key', place: 'Elven Castle', requires: ['Jolt Tonic'], grants: ['Mystic Key'], part: 4 },
  { chapter: 'Elfland', title: 'Open the locked rooms of Coneria Castle and take the Nitro Powder (TNT)', place: 'Castle Cornelia (Final Fantasy)', requires: ['Mystic Key'], grants: ['Nitro Powder'], part: 4 },
  { chapter: 'Elfland', title: 'Give the Nitro Powder to Nerrick in the Dwarf Cave to blast the canal', place: 'Mount Duergar', requires: ['Nitro Powder'], grants: ['Canal open'], part: 4 },
  { chapter: 'Earth', title: 'Sail through the canal to Melmond, where the land is rotting', place: 'Melmond', requires: ['Canal open'], grants: [], part: 5 },
  { chapter: 'Earth', title: 'Defeat the Vampire in the Earth Cave and take the Star Ruby (RUBY)', place: 'Cavern of Earth', boss: 'Vampire (Final Fantasy)', requires: ['Canal open'], grants: ['Star Ruby'], part: 5 },
  { chapter: 'Earth', title: "Feed the Star Ruby to the Titan to open Titan's Tunnel", place: "Giant's Cave", requires: ['Star Ruby'], grants: ['Titan moved'], part: 6 },
  { chapter: 'Earth', title: "Receive the Earth Rod from Sarda in Sarda's Cave", place: "Sage's Cave", requires: ['Titan moved'], grants: ['Earth Rod'], part: 6 },
  { chapter: 'Earth', title: 'Break the plate in the Earth Cave with the Rod and defeat Lich, Fiend of Earth', place: 'Cavern of Earth', boss: 'Lich (Final Fantasy)', requires: ['Earth Rod'], grants: ['Earth Crystal lit'], part: 6 },
  { chapter: 'Fire', title: 'Visit the Circle of Sages in Crescent Lake and receive the Canoe', place: 'Crescent Lake', requires: ['Earth Crystal lit'], grants: ['Canoe'], part: 7 },
  { chapter: 'Ice', title: 'Find the Levistone (FLOATER) at the bottom of the Ice Cave', place: 'Cavern of Ice', requires: ['Canoe'], grants: ['Levistone'], part: 7 },
  { chapter: 'Ice', title: 'Raise the Airship from the Ryukahn Desert with the Levistone', place: 'Ryukahn Desert', requires: ['Levistone'], grants: ['Airship'], part: 8 },
  { chapter: 'Class change', title: "Take the Rat's Tail (TAIL) from the Castle of Ordeals", place: 'Citadel of Trials', requires: ['Airship'], grants: ["Rat's Tail"], part: 8 },
  { chapter: 'Class change', title: "Give the Rat's Tail to Bahamut for the class change", place: 'Cardian Islands', requires: ["Rat's Tail"], grants: ['Class change'], part: 8, optional: true },
  { chapter: 'Fire', title: 'Defeat Marilith, Fiend of Fire, at the heart of Gurgu Volcano', place: 'Mount Gulg (Final Fantasy)', boss: 'Marilith (Final Fantasy)', requires: ['Canoe'], grants: ['Fire Crystal lit'], part: 9 },
  { chapter: 'Water', title: "Buy the Bottle from the Caravan and free the fairy in Gaia for the Oxyale", place: 'Gaia (Final Fantasy)', requires: ['Airship'], grants: ['Oxyale'], part: 10 },
  { chapter: 'Water', title: 'Collect the Warp Cube (CUBE) from the robot behind the Waterfall', place: 'Waterfall Cavern', requires: ['Canoe', 'Airship'], grants: ['Warp Cube'], part: 10 },
  { chapter: 'Water', title: 'Dive from Onrac with the Oxyale to the Sea Shrine', place: 'Onrac', requires: ['Oxyale'], grants: ['Submarine access'], part: 11 },
  { chapter: 'Water', title: 'Take the Rosetta Stone (SLAB) and defeat Kraken, Fiend of Water', place: 'Sunken Shrine', boss: 'Kraken (Final Fantasy)', requires: ['Submarine access'], grants: ['Rosetta Stone', 'Water Crystal lit'], part: 11 },
  { chapter: 'Air', title: 'Have Dr. Unne in Melmond teach the Lefeinish language from the Rosetta Stone', place: 'Melmond', requires: ['Rosetta Stone'], grants: ['Lufenian language'], part: 12 },
  { chapter: 'Air', title: 'Receive the Chime from the people of Lefein', place: 'Lufenia (Final Fantasy)', requires: ['Lufenian language'], grants: ['Chime'], part: 12 },
  { chapter: 'Air', title: 'Climb the Mirage Tower with the Chime and warp to the Sky Castle with the Cube', place: 'Mirage Tower', requires: ['Chime', 'Warp Cube'], grants: ['Sky Castle access'], part: 12 },
  { chapter: 'Air', title: 'Defeat Tiamat, Fiend of Wind, and find the Adamantite', place: 'Flying Fortress', boss: 'Tiamat (Final Fantasy)', requires: ['Sky Castle access'], grants: ['Adamantite', 'Air Crystal lit'], part: 13 },
  { chapter: 'Finale', title: 'Have Smyth in the Dwarf Cave forge Excalibur from the Adamantite', place: 'Mount Duergar', requires: ['Adamantite'], grants: ['Excalibur'], part: 14, optional: true },
  { chapter: 'Finale', title: 'Play the Lute in the Temple of Fiends and travel 2000 years into the past', place: 'Chaos Shrine (Final Fantasy)', requires: ['Lute', 'Earth Crystal lit', 'Fire Crystal lit', 'Water Crystal lit', 'Air Crystal lit'], grants: ['Past Temple'], part: 14 },
  { chapter: 'Finale', title: 'Defeat the four Fiends again and Chaos (Garland) to close the time loop', place: 'Chaos Shrine (Final Fantasy)', boss: 'Chaos (Final Fantasy boss)', requires: ['Past Temple'], grants: ['Ending'], part: 14 },
];

// Menu screens of the NES version (images on "Menu (Final Fantasy)").
const MENUS = [
  { key: 'main', title: 'Main menu', file: 'FF NES Main Menu.png', commands: 'ITEM, MAGIC, WEAPON, ARMOR, STATUS; party portraits with HP and spell charges, gold' },
  { key: 'item', title: 'Item menu', file: 'FF NES Item Menu.png', commands: 'Consumables and key items in one grid; key items show a description' },
  { key: 'magic', title: 'Magic menu', file: 'FF NES Magic Menu.png', commands: 'Spells by level 1-8, three per level, with charges left per level' },
  { key: 'equip', title: 'Weapon / Armor menu', file: 'FF NES Equip Menu.png', commands: 'EQUIP, TRADE, DROP; four slots per character, E marks equipped' },
  { key: 'status', title: 'Status screen', file: 'FF NES Status Menu.png', commands: 'Class, level, EXP to next level, STR, AGL, INT, VIT, LUCK, damage, hit %, absorb, evade %' },
  { key: 'row', title: 'Party order', file: 'FF NES Row Menu.png', commands: 'Swap character order; the first two slots are attacked most' },
];

// RPGamer fan-music theme names → "All Sounds" track titles.
const FAN_MUSIC_THEMES = {
  'Airship': 'Airship', 'Battle Theme': 'Battle', "Chaos' Temple": 'Chaos Shrine', 'Temple of Fiends': 'Chaos Shrine',
  'City Theme': 'Town', 'Town Theme': 'Town', 'Cornelia Castle': 'Castle Cornelia', 'Dead Theme': 'Game Over',
  'Dungeon': 'Dungeon', 'Ending Theme': 'End Theme', 'The Floating Castle': 'Flying Fortress', 'Gurgu Volcano': 'Mt. Gulg',
  'Main Theme': 'Main Theme', "Matouya's Cave": "Matoya's Cave", 'Menu Screen': 'Menu Screen', 'Status Screen': 'Menu Screen',
  'The Prelude': 'Prelude', 'Prelude Theme': 'Prelude', 'Sailing Ship': 'Sailing Ship', 'Shop Theme': 'Shop',
  'Victory Theme': 'Victory', 'Fanfare': 'Victory', 'Opening Theme': 'Opening Theme', 'Sunken Shrine': 'Sunken Shrine',
};

module.exports = { LOCATIONS, REMAKE_ONLY_PLACES, STORY, MENUS, WALKTHROUGH, FAN_MUSIC_THEMES };
