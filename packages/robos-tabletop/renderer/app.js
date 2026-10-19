'use strict';

if (typeof document === "undefined") {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {} }),
    addEventListener: () => {}
  };
}
if (typeof window === "undefined") {
  globalThis.window = {
    addEventListener: () => {},
    robosTabletop: {}
  };
}

const doorClosedImg = typeof Image !== "undefined" ? new Image() : null;
if (doorClosedImg) doorClosedImg.src = "../assets/door_closed.png";

const doorOpenImg = typeof Image !== "undefined" ? new Image() : null;
if (doorOpenImg) doorOpenImg.src = "../assets/door_open.png";

// AI Generated Furniture, Tile, Token & Portrait Textures
const FURNITURE_TEXTURES = {};
const TILE_TEXTURES = {};
const TOKEN_TEXTURES = {};

const FURNITURE_ASSET_MAP = {
  altar: "../assets/furniture/altar.png",
  table: "../assets/furniture/table.png",
  bookcase: "../assets/furniture/bookcase.png",
  bookshelf: "../assets/furniture/bookshelf.png",
  tomb: "../assets/furniture/tomb.png",
  chest: "../assets/furniture/chest.png",
  cupboard: "../assets/furniture/cupboard.png",
  weapons_rack: "../assets/furniture/weapons_rack.png",
  fireplace: "../assets/furniture/fireplace.png",
  throne: "../assets/furniture/throne.png",
  torture_rack: "../assets/furniture/torture_rack.png",
  alchemists_bench: "../assets/furniture/alchemists_bench.png"
};

const TILE_ASSET_MAP = {
  wall_block: "../assets/tiles/wall_block.png",
  stairs: "../assets/tiles/stairs.png",
  pit: "../assets/tiles/trap_pit.png",
  spear: "../assets/tiles/trap_spear.png",
  "falling-block": "../assets/tiles/trap_falling_block.png",
  boulder: "../assets/tiles/boulder.png"
};

const ALL_MONSTER_ASSET_KEYS = [
  "goblin", "orc", "fimir", "skeleton", "zombie", "mummy",
  "chaos_warrior", "gargoyle", "verag", "chaos_sorcerer",
  "witch_lord", "orc_shaman", "dragon", "doomguard", "witch_hand",
  "campaign_volunteer", "political_operative", "career_politician",
  "bureaucrat", "lobbyist", "partisan_enforcer", "super_pac_demon",
  "spin_doctor", "talarixon", "el_rogers", "brownsted",
  "katie_zacharia", "mitch_mcconnell", "war_room_boss",
  "barbarian", "dwarf", "elf", "wizard"
];

if (typeof Image !== "undefined") {
  for (const [k, src] of Object.entries(FURNITURE_ASSET_MAP)) {
    const img = new Image();
    img.src = src;
    FURNITURE_TEXTURES[k] = img;
  }
  for (const [k, src] of Object.entries(TILE_ASSET_MAP)) {
    const img = new Image();
    img.src = src;
    TILE_TEXTURES[k] = img;
  }
  for (const key of ALL_MONSTER_ASSET_KEYS) {
    const img = new Image();
    img.src = `../assets/tokens/token_${key}.png`;
    TOKEN_TEXTURES[key] = img;
  }
}

function resolveMonsterAssetKey(monsterOrIdOrName) {
  let raw = "";
  if (typeof monsterOrIdOrName === "string") {
    raw = monsterOrIdOrName;
  } else if (monsterOrIdOrName && typeof monsterOrIdOrName === "object") {
    raw = [
      monsterOrIdOrName["@id"],
      monsterOrIdOrName.id,
      monsterOrIdOrName.monsterType,
      monsterOrIdOrName.type,
      monsterOrIdOrName["dcterms:title"],
      monsterOrIdOrName.name,
      monsterOrIdOrName["robos:extendsClass"],
      monsterOrIdOrName["robos:monsterArchetype"]
    ].filter(Boolean).join(" ");
  }
  const s = String(raw || "").toLowerCase();
  if (s.includes("talarixon") || s.includes("talarico") || s.includes("texas hydra")) return "talarixon";
  if (s.includes("el-rogers") || s.includes("el_rogers") || s.includes("el-sayed") || s.includes("michigan hydra")) return "el_rogers";
  if (s.includes("brownsted") || s.includes("husted") || s.includes("ohio hydra")) return "brownsted";
  if (s.includes("campaign-volunteer") || s.includes("campaign_volunteer") || s.includes("campaign volunteer")) return "campaign_volunteer";
  if (s.includes("political-operative") || s.includes("political_operative") || s.includes("political operative")) return "political_operative";
  if (s.includes("career-politician") || s.includes("career_politician") || s.includes("career politician")) return "career_politician";
  if (s.includes("bureaucrat")) return "bureaucrat";
  if (s.includes("lobbyist")) return "lobbyist";
  if (s.includes("partisan-enforcer") || s.includes("partisan_enforcer") || s.includes("partisan enforcer")) return "partisan_enforcer";
  if (s.includes("super-pac-demon") || s.includes("super_pac_demon") || s.includes("super pac demon")) return "super_pac_demon";
  if (s.includes("spin-doctor") || s.includes("spin_doctor") || s.includes("spin doctor")) return "spin_doctor";
  if (s.includes("katie") || s.includes("zacharia")) return "katie_zacharia";
  if (s.includes("mitch") || s.includes("mcconnell")) return "mitch_mcconnell";
  if (s.includes("vance") || s.includes("kamala") || s.includes("war_room")) return "war_room_boss";
  if (s.includes("doomguard")) return "doomguard";
  if (s.includes("witch-hand") || s.includes("witch_hand") || s.includes("witch hand")) return "witch_hand";
  if (s.includes("witch-lord") || s.includes("witch_lord") || s.includes("witch lord")) return "witch_lord";
  if (s.includes("chaos-sorcerer") || s.includes("chaos_sorcerer") || s.includes("chaos sorcerer") || s.includes("dread sorcerer")) return "chaos_sorcerer";
  if (s.includes("orc-shaman") || s.includes("orc_shaman") || s.includes("orc shaman")) return "orc_shaman";
  if (s.includes("verag") || s.includes("warlord") || s.includes("ulag")) return "verag";
  if (s.includes("dragon") || s.includes("wyrm")) return "dragon";
  if (s.includes("gargoyle")) return "gargoyle";
  if (s.includes("chaos") || s.includes("dread warrior") || s.includes("dread-warrior")) return "chaos_warrior";
  if (s.includes("mummy")) return "mummy";
  if (s.includes("zombie")) return "zombie";
  if (s.includes("skeleton") || s.includes("skel")) return "skeleton";
  if (s.includes("fimir") || s.includes("abomination")) return "fimir";
  if (s.includes("orc")) return "orc";
  return "goblin";
}

function getMonsterTokenUrl(m) {
  const key = resolveMonsterAssetKey(m);
  return `../assets/tokens/token_${key}.png`;
}

function getMonsterPortraitUrl(m) {
  const key = resolveMonsterAssetKey(m);
  return `../assets/portraits/card_bg_${key}.png`;
}

function getMonsterTokenImage(m) {
  const key = resolveMonsterAssetKey(m);
  const img = TOKEN_TEXTURES[key];
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}

function resolveHeroAssetKey(heroOrClass) {
  let raw = "";
  if (typeof heroOrClass === "string") {
    raw = heroOrClass;
  } else if (heroOrClass && typeof heroOrClass === "object") {
    raw = [
      heroOrClass["@id"],
      heroOrClass.id,
      heroOrClass.slug,
      heroOrClass["dcterms:title"],
      heroOrClass.name,
      heroOrClass["robos:characterName"],
      heroOrClass.characterName,
      heroOrClass["robos:tokenAsset"],
      heroOrClass.tokenAsset,
      heroOrClass["robos:portraitAsset"],
      heroOrClass.portraitAsset,
      heroOrClass["robos:heroClass"],
      heroOrClass.heroClass
    ].filter(Boolean).join(" ");
  }
  const s = String(raw || "").toLowerCase();
  if (s.includes("obama")) return "obama";
  if (s.includes("trump")) return "trump";
  if (s.includes("hillary") || s.includes("clinton")) return "hillary_clinton";
  if (s.includes("bernie") || s.includes("sanders")) return "bernie_sanders";
  if (s.includes("dwarf") || s.includes("dorgan")) return "dwarf";
  if (s.includes("elf") || s.includes("ladril")) return "elf";
  if (s.includes("wizard") || s.includes("telor") || s.includes("mage")) return "wizard";
  return "barbarian";
}

function getHeroTokenUrl(h) {
  const key = resolveHeroAssetKey(h);
  return `../assets/tokens/token_${key}.png`;
}

function getHeroPortraitUrl(h) {
  const key = resolveHeroAssetKey(h);
  return `../assets/portraits/card_bg_${key}.png`;
}

function getClassAssetUrls(cls) {
  if (!cls) return { tokenUrl: "../assets/tokens/token_barbarian.png", portraitUrl: "../assets/portraits/card_bg_barbarian.png" };
  if (cls.classType === "Hero") {
    return {
      tokenUrl: getHeroTokenUrl(cls.name || cls.id),
      portraitUrl: getHeroPortraitUrl(cls.name || cls.id)
    };
  }
  return {
    tokenUrl: getMonsterTokenUrl(cls.name || cls.id),
    portraitUrl: getMonsterPortraitUrl(cls.name || cls.id)
  };
}

function getSpellIconUrl(spell) {
  const s = String((spell && (spell.slug || spell.name || spell.id)) || spell || "").toLowerCase();
  const elem = String((spell && spell.element) || "").toLowerCase();
  if (s.includes("ball-of-flame") || s.includes("attack-ad")) return "../assets/icons/spell_ball_of_flame.png";
  if (s.includes("fire-of-wrath") || s.includes("outrage-inferno")) return "../assets/icons/spell_fire_of_wrath.png";
  if (s.includes("courage") || s.includes("october-surprise") || s.includes("fear")) return "../assets/icons/spell_courage.png";
  if (s.includes("water-of-healing") || s.includes("emergency-funding")) return "../assets/icons/spell_water_of_healing.png";
  if (s.includes("veil-of-mist") || s.includes("executive-privilege")) return "../assets/icons/spell_veil_of_mist.png";
  if (s.includes("sleep") || s.includes("filibuster")) return "../assets/icons/spell_sleep.png";
  if (s.includes("heal-body") || s.includes("special-interest")) return "../assets/icons/spell_heal_body.png";
  if (s.includes("rock-skin") || s.includes("incumbent-protection") || s.includes("rust")) return "../assets/icons/spell_rock_skin.png";
  if (s.includes("pass-through-rock") || s.includes("gerrymander") || s.includes("escape")) return "../assets/icons/spell_pass_through_rock.png";
  if (s.includes("swift-wind") || s.includes("polling-surge")) return "../assets/icons/spell_swift_wind.png";
  if (s.includes("tempest") || s.includes("media-frenzy") || s.includes("recount") || s.includes("cloud")) return "../assets/icons/spell_tempest.png";
  if (s.includes("genie") || s.includes("landslide-victory") || s.includes("summon") || s.includes("lightning")) return "../assets/icons/spell_genie.png";
  if (elem === "fire") return "../assets/icons/spell_ball_of_flame.png";
  if (elem === "water") return "../assets/icons/spell_water_of_healing.png";
  if (elem === "earth") return "../assets/icons/spell_rock_skin.png";
  if (elem === "air") return "../assets/icons/spell_swift_wind.png";
  return "../assets/icons/action_spell.png";
}

function getWeaponIconUrl(w) {
  const s = String((w && (w.id || w.name || w.type)) || w || "").toLowerCase();
  if (s.includes("dagger") || s.includes("stylus")) return "../assets/icons/weapon_dagger.png";
  if (s.includes("shortsword") || s.includes("cane")) return "../assets/icons/weapon_shortsword.png";
  if (s.includes("broadsword") || s.includes("longsword") || s.includes("blade")) return "../assets/icons/weapon_broadsword.png";
  if (s.includes("axe") || s.includes("gavel") || s.includes("hammer")) return "../assets/icons/weapon_battle_axe.png";
  if (s.includes("crossbow") || s.includes("pistol") || s.includes("taser") || s.includes("ranged") || s.includes("teleprompter")) return "../assets/icons/weapon_crossbow.png";
  if (s.includes("staff") || s.includes("wand")) return "../assets/icons/weapon_staff.png";
  if (s.includes("helmet")) return "../assets/icons/armor_helmet.png";
  if (s.includes("shield") || s.includes("riot") || s.includes("press")) return "../assets/icons/armor_shield.png";
  if (s.includes("plate") || s.includes("tactical")) return "../assets/icons/armor_plate_mail.png";
  if (s.includes("chain") || s.includes("suit") || s.includes("armor") || s.includes("vest")) return "../assets/icons/armor_chain_mail.png";
  return "../assets/icons/weapon_broadsword.png";
}

function getItemIconUrl(it) {
  const s = String((it && (it.id || it.name || it.type)) || it || "").toLowerCase();
  if (s.includes("holy") || s.includes("water")) return "../assets/icons/card_art_holy_water.png";
  if (s.includes("strength") || s.includes("espresso") || s.includes("covfefe")) return "../assets/icons/item_potion_of_strength.png";
  if (s.includes("defense") || s.includes("immunity") || s.includes("pardon")) return "../assets/icons/item_potion_of_defense.png";
  if (s.includes("speed") || s.includes("rope") || s.includes("torch")) return "../assets/icons/item_potion_of_speed.png";
  if (s.includes("tool") || s.includes("kit") || s.includes("key") || s.includes("burner")) return "../assets/icons/item_tool_kit.png";
  if (s.includes("gold") || s.includes("pac") || s.includes("coin") || s.includes("check")) return "../assets/icons/card_art_gold_coins.png";
  if (s.includes("gem") || s.includes("crown") || s.includes("relic") || s.includes("talisman") || s.includes("pelosi")) return "../assets/icons/card_art_gems_jewels.png";
  return "../assets/icons/item_healing_potion.png";
}

function getFurnitureImage(type) {
  const clean = (type || '').toLowerCase();
  for (const [k, img] of Object.entries(FURNITURE_TEXTURES)) {
    if (clean.includes(k) || k.includes(clean)) {
      if (img && img.complete && img.naturalWidth > 0) return img;
    }
  }
  return getTileImage(clean);
}

function getTileImage(type) {
  const clean = (type || '').toLowerCase();
  for (const [k, img] of Object.entries(TILE_TEXTURES)) {
    if (clean.includes(k) || k.includes(clean)) {
      if (img && img.complete && img.naturalWidth > 0) return img;
    }
  }
  return null;
}


const MIDTERMS_2026_HEROES = [
  {
    "@id": "urn:robos:tabletop:hero:obama",
    "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
    "dcterms:title": "Barack Obama",
    "robos:characterName": "Barack Obama",
    "robos:heroClass": "Barbarian",
    "robos:category": "Midterms 2026",
    "robos:bodyPoints": 8,
    "robos:mindPoints": 2,
    "robos:attackDice": 3,
    "robos:defendDice": 2,
    "robos:gold": 120,
    "robos:startingWeapon": "Broadsword of Hope & Change (3 Combat Dice)",
    "robos:equippedWeapon": "Broadsword of Hope & Change (3 Combat Dice)",
    "robos:equippedArmor": "Chiseled Commander Toughness (2 Defend Dice)",
    "robos:specialAbility": "Bipartisan Cleave (Melee Specialist — Buff Silver-Haired Barbarian)",
    "robos:tokenColor": "#b91c1c",
    "robos:tokenAsset": "assets/tokens/token_obama.png",
    "robos:portraitAsset": "assets/portraits/card_bg_obama.png",
    "robos:icon": "⚔️",
    "robos:startingPosition": [0, 12],
    "robos:inventory": [
      { id: "item-pot-heal-obama", name: "Potion of Executive Vigor", type: "potion", effect: "Restores up to 4 BP", value: 100 },
      { id: "item-mic-drop-1", name: "Runic Teleprompter Shard", type: "relic", effect: "+1 Mind resistance vs Spin Doctors", value: 50 }
    ]
  },
  {
    "@id": "urn:robos:tabletop:hero:trump",
    "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
    "dcterms:title": "Donald Trump",
    "robos:characterName": "Donald Trump",
    "robos:heroClass": "Dwarf",
    "robos:category": "Midterms 2026",
    "robos:bodyPoints": 7,
    "robos:mindPoints": 3,
    "robos:attackDice": 2,
    "robos:defendDice": 2,
    "robos:gold": 250,
    "robos:startingWeapon": "Gilded Dwarven Battle-Axe (2 Combat Dice)",
    "robos:equippedWeapon": "Gilded Dwarven Battle-Axe (2 Combat Dice)",
    "robos:equippedArmor": "Gold-Plated Rune Mail (2 Defend Dice)",
    "robos:specialAbility": "Disarms traps & red-tape vaults without a toolkit",
    "robos:tokenColor": "#d97706",
    "robos:tokenAsset": "assets/tokens/token_trump.png",
    "robos:portraitAsset": "assets/portraits/card_bg_trump.png",
    "robos:icon": "🪓",
    "robos:startingPosition": [1, 12],
    "robos:inventory": [
      { id: "item-toolkit-trump", name: "Golden Dwarven Trap Toolkit", type: "tool", effect: "Disarms any pit, boulder, or bureaucratic trap", value: 150 },
      { id: "item-pot-heal-trump", name: "Elixir of Tremendous Stamina", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ]
  },
  {
    "@id": "urn:robos:tabletop:hero:hillary-clinton",
    "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
    "dcterms:title": "Hillary Clinton",
    "robos:characterName": "Hillary Clinton",
    "robos:heroClass": "Elf",
    "robos:category": "Midterms 2026",
    "robos:bodyPoints": 6,
    "robos:mindPoints": 4,
    "robos:attackDice": 2,
    "robos:defendDice": 2,
    "robos:gold": 150,
    "robos:startingWeapon": "Lothlorien Sting-Blade (2 Combat Dice)",
    "robos:equippedWeapon": "Lothlorien Sting-Blade (2 Combat Dice)",
    "robos:equippedArmor": "Woodland Elven Cloak & Circlet (2 Defend Dice)",
    "robos:specialAbility": "Sly Woodland Elf Noble — Master of blade & 1 Spell College (3 spells)",
    "robos:tokenColor": "#059669",
    "robos:tokenAsset": "assets/tokens/token_hillary_clinton.png",
    "robos:portraitAsset": "assets/portraits/card_bg_hillary_clinton.png",
    "robos:icon": "🏹",
    "robos:startingPosition": [0, 13],
    "robos:inventory": [
      { id: "item-scroll-hillary", name: "Classified Elven Parchment", type: "relic", effect: "Reveals hidden doors in current corridor", value: 120 },
      { id: "item-pot-heal-hillary", name: "Draught of Miruvor", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ]
  },
  {
    "@id": "urn:robos:tabletop:hero:bernie-sanders",
    "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
    "dcterms:title": "Bernie Sanders",
    "robos:characterName": "Bernie Sanders",
    "robos:heroClass": "Wizard",
    "robos:category": "Midterms 2026",
    "robos:bodyPoints": 4,
    "robos:mindPoints": 6,
    "robos:attackDice": 1,
    "robos:defendDice": 2,
    "robos:gold": 99,
    "robos:startingWeapon": "Gnarled Oak Staff of the 99% (1 Combat Die)",
    "robos:equippedWeapon": "Gnarled Oak Staff of the 99% (1 Combat Die)",
    "robos:equippedArmor": "Starry Wizard Hat & Vermont Wool Mittens (2 Defend Dice)",
    "robos:specialAbility": "Master Spellcaster — Wields 3 Elemental Spell decks (9 spells total)",
    "robos:tokenColor": "#2563eb",
    "robos:tokenAsset": "assets/tokens/token_bernie_sanders.png",
    "robos:portraitAsset": "assets/portraits/card_bg_bernie_sanders.png",
    "robos:icon": "🪄",
    "robos:startingPosition": [1, 13],
    "robos:inventory": [
      { id: "item-mittens-bernie", name: "Enchanted Vermont Mittens", type: "relic", effect: "Channels crackling elemental lightning & warmth", value: 200 },
      { id: "item-pot-heal-bernie", name: "Universal Healthcare Potion", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ]
  }
];

const DEFAULT_HERO_AUDIO_LINES_MAP = {
  barbarian: {
    turnStart: [{ text: "By my broadsword, clear a path!", audio: "res://assets/audio/heroes/barbarian_turn_start.ogg" }],
    attacking: [{ text: "Taste cold Cimmerian steel!", audio: "res://assets/audio/heroes/barbarian_attacking.ogg" }],
    attacked: [{ text: "Aagh! Only a flesh wound!", audio: "res://assets/audio/heroes/barbarian_attacked.ogg" }],
    defended: [{ text: "Ha! Your feeble blow bounces off my iron muscles!", audio: "res://assets/audio/heroes/barbarian_defended.ogg" }],
    castingMagic: [{ text: "The ancient battle-spirit surges through my blade!", audio: "res://assets/audio/heroes/barbarian_casting_magic.ogg" }]
  },
  dwarf: {
    turnStart: [{ text: "Stand back! Let a Dwarf of the World's Edge Mountains handle this!", audio: "res://assets/audio/heroes/dwarf_turn_start.ogg" }],
    attacking: [{ text: "For Grungni's beard, feel my battle-axe!", audio: "res://assets/audio/heroes/dwarf_attacking.ogg" }],
    attacked: [{ text: "Oof! Right in the chainmail!", audio: "res://assets/audio/heroes/dwarf_attacked.ogg" }],
    defended: [{ text: "Dwarven forged steel never yields!", audio: "res://assets/audio/heroes/dwarf_defended.ogg" }],
    castingMagic: [{ text: "By the runes of the anvil, awaken!", audio: "res://assets/audio/heroes/dwarf_casting_magic.ogg" }]
  },
  elf: {
    turnStart: [{ text: "With elven grace, I step into the shadows.", audio: "res://assets/audio/heroes/elf_turn_start.ogg" }],
    attacking: [{ text: "Swift as the wind, strike true!", audio: "res://assets/audio/heroes/elf_attacking.ogg" }],
    attacked: [{ text: "Ah! Darkness stings, yet my spirit endures!", audio: "res://assets/audio/heroes/elf_attacked.ogg" }],
    defended: [{ text: "Too slow, creature! The forest shields me!", audio: "res://assets/audio/heroes/elf_defended.ogg" }],
    castingMagic: [{ text: "Ancient weave of earth and water, heed my call!", audio: "res://assets/audio/heroes/elf_casting_magic.ogg" }]
  },
  wizard: {
    turnStart: [{ text: "The winds of magic gather at my staff.", audio: "res://assets/audio/heroes/wizard_turn_start.ogg" }],
    attacking: [{ text: "Back, foul fiend, before my arcane staff!", audio: "res://assets/audio/heroes/wizard_attacking.ogg" }],
    attacked: [{ text: "Gah! My ward-cloak falters!", audio: "res://assets/audio/heroes/wizard_attacked.ogg" }],
    defended: [{ text: "My arcane barrier deflects your strike!", audio: "res://assets/audio/heroes/wizard_defended.ogg" }],
    castingMagic: [{ text: "By fire, air, and tempest, unleash the spell!", audio: "res://assets/audio/heroes/wizard_casting_magic.ogg" }]
  },
  obama: (() => {
    const p = [
      { text: "Uhh... let me be clear... When you roll the dice... in this dungeon... you are not merely rolling plastic... you are rolling... the audacity... of hope.", audio: "res://assets/audio/heroes/obama_quote_1.ogg" },
      { text: "Uhh... folks... Michelle and I... were talking just the other day... about how even in a dark corridor... filled with goblins... hope... always finds a way.", audio: "res://assets/audio/heroes/obama_quote_2.ogg" },
      { text: "Uhh... make no mistake... The arc of the moral dungeon... is long... but it bends... toward hope... and... uhh... a modest middle-class tax cut.", audio: "res://assets/audio/heroes/obama_quote_3.ogg" },
      { text: "Uhh... look... we can disagree... without being disagreeable... even when a two-headed hydra... is trying... to bite your head off... with hope.", audio: "res://assets/audio/heroes/obama_quote_4.ogg" },
      { text: "Uhh... let me say this... Change does not roll in... on the wheels of inevitability... It rolls in... on two red six-sided dice... of hope.", audio: "res://assets/audio/heroes/obama_quote_5.ogg" },
      { text: "Uhh... there is not a liberal dungeon... and a conservative dungeon... There is the United Dungeon... of America... and... uhh... we are lost in it.", audio: "res://assets/audio/heroes/obama_quote_6.ogg" },
      { text: "Uhh... yes we can... step onto this next stone square... with the fierce urgency... of now... and the quiet dignity... of hope.", audio: "res://assets/audio/heroes/obama_quote_7.ogg" },
      { text: "Uhh... if you like your broadsword... you can keep... your broadsword... Period... Full stop... Because that... is the promise... of hope.", audio: "res://assets/audio/heroes/obama_quote_8.ogg" }
    ];
    return { turnStart: p, moving: p, attacking: p, attacked: p, defended: p, castingMagic: p };
  })(),
  trump: (() => {
    const p = [
      { text: "They're eating the dogs! Sleepy Crooked Joe Biden — I really don't know what he said!", audio: "res://assets/audio/heroes/trump_quote_1.ogg" },
      { text: "Threatening me with 400 years in prison for possessing my own presidential papers, which just about every other president has done!", audio: "res://assets/audio/heroes/trump_quote_2.ogg" },
      { text: "A crooked New York state judge just ruled that I have to pay a fine of $355 million for having built a perfect company! It's a disgrace — I don't even know who this woman is!", audio: "res://assets/audio/heroes/trump_quote_3.ogg" },
      { text: "I do like my garbage truck! Crooked Joe Biden finally said what he and Kamala really think of our supporters — he called them garbage, no way!", audio: "res://assets/audio/heroes/trump_quote_4.ogg" },
      { text: "Well, I took two tests — cognitive tests. I aced them, both of them! He took none! I'd like to see him take one, just one, a real easy one!", audio: "res://assets/audio/heroes/trump_quote_5.ogg" },
      { text: "I won two regular club championships! To do that, you have to be quite smart and hit the ball a long way. And I do it! He can't hit a ball 50 yards!", audio: "res://assets/audio/heroes/trump_quote_6.ogg" },
      { text: "She did things that nobody would ever think of! Now she wants to do transgender operations on illegal aliens that are in prison!", audio: "res://assets/audio/heroes/trump_quote_7.ogg" },
      { text: "Well, we need Greenland for national security purposes! People really don't even know if Denmark has any legal right to it, but if they do, they should give it up!", audio: "res://assets/audio/heroes/trump_quote_8.ogg" }
    ];
    return { turnStart: p, moving: p, attacking: p, attacked: p, defended: p, castingMagic: p };
  })(),
  hillary_clinton: (() => {
    const p = [
      { text: "Saddam Hussein will continue to increase his capacity to wage biological and chemical warfare!", audio: "res://assets/audio/heroes/hillary_quote_1.ogg" },
      { text: "We came, we saw, he died! Ha ha ha!", audio: "res://assets/audio/heroes/hillary_quote_2.ogg" },
      { text: "What difference, at this point, does it make?!", audio: "res://assets/audio/heroes/hillary_quote_3.ogg" },
      { text: "As a shareholder and director of our company, I'm always proud of Walmart and what we do, and the way we do it better than anybody else!", audio: "res://assets/audio/heroes/hillary_quote_4.ogg" },
      { text: "Using clean renewable energy as the key into coal country — because we're going to put a lot of coal miners and coal companies out of business!", audio: "res://assets/audio/heroes/hillary_quote_5.ogg" },
      { text: "Don't let anybody tell you that it's corporations and businesses that create jobs! If you've got a business, you didn't build that!", audio: "res://assets/audio/heroes/hillary_quote_6.ogg" },
      { text: "We came out of the White House not only dead broke, but in debt! We had no money when we got there, and we struggled!", audio: "res://assets/audio/heroes/hillary_quote_7.ogg" },
      { text: "They're children of the Great Recession and they are living in their parents' basement... No conscience, no empathy — first we have to bring them to heel!", audio: "res://assets/audio/heroes/hillary_quote_8.ogg" }
    ];
    return { turnStart: p, moving: p, attacking: p, attacked: p, defended: p, castingMagic: p };
  })(),
  bernie_sanders: (() => {
    const p = [
      { text: "We live in a world today where there are several hundred million people starving to death — they're starving to death right now!", audio: "res://assets/audio/heroes/bernie_quote_1.ogg" },
      { text: "In some of the largest cities in America, 50% of the kids are not graduating high school! The cost of college education is zooming up, so you have to be a wealthy person to send your kid to college!", audio: "res://assets/audio/heroes/bernie_quote_2.ogg" },
      { text: "In Sweden, they've had socialist governments for decades — 80 or 90% of the people voting, strong labor unions, and a health care system guaranteeing health care to all people!", audio: "res://assets/audio/heroes/bernie_quote_3.ogg" },
      { text: "They say we're getting tough on crime — if you want to get tough on crime, let's deal with the causes of crime! Let's demand that every man, woman, and child have a decent standard of living!", audio: "res://assets/audio/heroes/bernie_quote_4.ogg" },
      { text: "We have an approach to campaign financing which allows wealthy people and major corporations to buy and sell politicians! The rich get richer and the poor get poorer!", audio: "res://assets/audio/heroes/bernie_quote_5.ogg" },
      { text: "The chief executive officers are seeing their salaries soar, and the gap between the rich and the poor grows wider! Ten million Americans are unemployed!", audio: "res://assets/audio/heroes/bernie_quote_6.ogg" },
      { text: "We give huge tax breaks to the wealthy and you have two million people sleeping out on the street! Billions of dollars in obsolete weapon systems, and five million children who are hungry!", audio: "res://assets/audio/heroes/bernie_quote_7.ogg" },
      { text: "Workers in the United States today are working significantly longer hours, taking less vacation time — is there any wonder why so many millions of Americans feel stressed out?!", audio: "res://assets/audio/heroes/bernie_quote_8.ogg" }
    ];
    return { turnStart: p, moving: p, attacking: p, attacked: p, defended: p, castingMagic: p };
  })()
};

function normalizeHeroEntity(rawHero) {
  if (!rawHero || typeof rawHero !== "object") return rawHero;
  const copy = JSON.parse(JSON.stringify(rawHero));
  if (!copy["@id"]) {
    const rawId = copy.id || copy.slug || "barbarian";
    copy["@id"] = String(rawId).startsWith("urn:robos:") ? rawId : `urn:robos:tabletop:hero:${rawId}`;
  }
  if (!copy["@type"]) {
    copy["@type"] = ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"];
  }
  if (!copy["dcterms:title"] && (copy.name || copy.characterName)) {
    copy["dcterms:title"] = copy.name || copy.characterName;
  }
  if (!copy["robos:characterName"] && (copy.characterName || copy["dcterms:title"])) {
    copy["robos:characterName"] = copy.characterName || copy["dcterms:title"];
  }
  if (!copy["robos:heroClass"] && copy.heroClass) {
    copy["robos:heroClass"] = copy.heroClass;
  }
  if (!copy["robos:category"]) {
    const key = resolveHeroAssetKey(copy);
    const isMidterms = ["obama", "trump", "hillary_clinton", "bernie_sanders"].includes(key);
    copy["robos:category"] = copy.category || (isMidterms ? "Midterms 2026" : "Base Game");
  }
  if (copy["robos:bodyPoints"] === undefined && copy.bodyPoints !== undefined) copy["robos:bodyPoints"] = copy.bodyPoints;
  if (copy["robos:mindPoints"] === undefined && copy.mindPoints !== undefined) copy["robos:mindPoints"] = copy.mindPoints;
  if (copy["robos:attackDice"] === undefined && copy.attackDice !== undefined) copy["robos:attackDice"] = copy.attackDice;
  if (copy["robos:defendDice"] === undefined && copy.defendDice !== undefined) copy["robos:defendDice"] = copy.defendDice;
  if (copy["robos:gold"] === undefined && copy.gold !== undefined) copy["robos:gold"] = copy.gold;
  if (!copy["robos:equippedWeapon"] && copy.equippedWeapon) copy["robos:equippedWeapon"] = copy.equippedWeapon;
  if (!copy["robos:equippedArmor"] && copy.equippedArmor) copy["robos:equippedArmor"] = copy.equippedArmor;
  if (!copy["robos:specialAbility"] && copy.specialAbility) copy["robos:specialAbility"] = copy.specialAbility;
  if (!copy["robos:tokenColor"] && copy.tokenColor) copy["robos:tokenColor"] = copy.tokenColor;
  if (!copy["robos:icon"] && copy.icon) copy["robos:icon"] = copy.icon;
  if (!copy["robos:startingPosition"] && copy.startingPosition) copy["robos:startingPosition"] = copy.startingPosition;
  if (!copy["robos:inventory"] && Array.isArray(copy.inventory)) copy["robos:inventory"] = copy.inventory;
  const assetKey = resolveHeroAssetKey(copy);
  if (!copy["robos:tokenAsset"]) copy["robos:tokenAsset"] = copy.tokenAsset || `assets/tokens/token_${assetKey}.png`;
  if (!copy["robos:portraitAsset"]) copy["robos:portraitAsset"] = copy.portraitAsset || `assets/portraits/card_bg_${assetKey}.png`;
  if (!copy["robos:audioLines"]) {
    copy["robos:audioLines"] = JSON.parse(JSON.stringify(
      copy.audioLines || DEFAULT_HERO_AUDIO_LINES_MAP[assetKey] || DEFAULT_HERO_AUDIO_LINES_MAP.barbarian
    ));
  }
  return copy;
}

// Default 4 HeroQuest Champions for initializing a Campaign's Hero Party
function createDefaultCampaignHeroes(seedHeroes = null) {
  if (Array.isArray(seedHeroes) && seedHeroes.length > 0) {
    return seedHeroes.map(h => normalizeHeroEntity(h));
  }
  return [
    {
      "@id": "urn:robos:tabletop:hero:barbarian",
      "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
      "dcterms:title": "Rogar",
      "robos:characterName": "Rogar",
      "robos:heroClass": "Barbarian",
      "robos:category": "Base Game",
      "robos:bodyPoints": 8,
      "robos:mindPoints": 2,
      "robos:attackDice": 3,
      "robos:defendDice": 2,
      "robos:gold": 100,
      "robos:startingWeapon": "Broadsword (3 Combat Dice)",
      "robos:equippedWeapon": "Broadsword (3 Combat Dice)",
      "robos:equippedArmor": "Natural Toughness (2 Defend Dice)",
      "robos:specialAbility": "Greatest strength and vitality in melee combat",
      "robos:tokenColor": "#b91c1c",
      "robos:tokenAsset": "assets/tokens/token_barbarian.png",
      "robos:portraitAsset": "assets/portraits/card_bg_barbarian.png",
      "robos:icon": "⚔️",
      "robos:startingPosition": [0, 1],
      "robos:inventory": [
        { id: "item-pot-heal-1", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 },
        { id: "item-rope-1", name: "Heavy Rope (30 ft)", type: "tool", effect: "Climb pits & gaps", value: 25 }
      ]
    },
    {
      "@id": "urn:robos:tabletop:hero:dwarf",
      "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
      "dcterms:title": "Dorgan",
      "robos:characterName": "Dorgan",
      "robos:heroClass": "Dwarf",
      "robos:category": "Base Game",
      "robos:bodyPoints": 7,
      "robos:mindPoints": 3,
      "robos:attackDice": 2,
      "robos:defendDice": 2,
      "robos:gold": 100,
      "robos:startingWeapon": "Shortsword (2 Combat Dice)",
      "robos:equippedWeapon": "Shortsword (2 Combat Dice)",
      "robos:equippedArmor": "Shield & Chainmail (+2 Defend Dice)",
      "robos:specialAbility": "Disarms traps without needing a toolkit",
      "robos:tokenColor": "#d97706",
      "robos:tokenAsset": "assets/tokens/token_dwarf.png",
      "robos:portraitAsset": "assets/portraits/card_bg_dwarf.png",
      "robos:icon": "🪓",
      "robos:startingPosition": [1, 0],
      "robos:inventory": [
        { id: "item-toolkit-1", name: "Trap Disarm Toolkit", type: "tool", effect: "Disarm traps without rolling skull", value: 75 },
        { id: "item-pot-heal-2", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
      ]
    },
    {
      "@id": "urn:robos:tabletop:hero:elf",
      "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
      "dcterms:title": "Ladril",
      "robos:characterName": "Ladril",
      "robos:heroClass": "Elf",
      "robos:category": "Base Game",
      "robos:bodyPoints": 6,
      "robos:mindPoints": 4,
      "robos:attackDice": 2,
      "robos:defendDice": 2,
      "robos:gold": 100,
      "robos:startingWeapon": "Shortsword (2 Combat Dice)",
      "robos:equippedWeapon": "Shortsword (2 Combat Dice)",
      "robos:equippedArmor": "Elven Leather & Cloak (+2 Defend Dice)",
      "robos:specialAbility": "Master of blade and 1 Elemental Spell deck (3 spells)",
      "robos:tokenColor": "#15803d",
      "robos:tokenAsset": "assets/tokens/token_elf.png",
      "robos:portraitAsset": "assets/portraits/card_bg_elf.png",
      "robos:icon": "🏹",
      "robos:startingPosition": [1, 1],
      "robos:inventory": [
        { id: "item-torch-1", name: "Dungeon Torch", type: "tool", effect: "Detect hidden traps in room", value: 15 },
        { id: "item-strength-1", name: "Potion of Strength", type: "potion", effect: "+2 Attack Dice for 1 turn", value: 150 }
      ]
    },
    {
      "@id": "urn:robos:tabletop:hero:wizard",
      "@type": ["oslc_am:Resource", "robos:TabletopHero", "robos:GameCharacter", "schema:Person"],
      "dcterms:title": "Telor",
      "robos:characterName": "Telor",
      "robos:heroClass": "Wizard",
      "robos:category": "Base Game",
      "robos:bodyPoints": 4,
      "robos:mindPoints": 6,
      "robos:attackDice": 1,
      "robos:defendDice": 2,
      "robos:gold": 100,
      "robos:startingWeapon": "Dagger (1 Combat Die)",
      "robos:equippedWeapon": "Dagger (1 Combat Die)",
      "robos:equippedArmor": "Wizard Cloak (2 Defend Dice)",
      "robos:specialAbility": "Wields 3 Elemental Spell decks (9 spells total)",
      "robos:tokenColor": "#7c3aed",
      "robos:tokenAsset": "assets/tokens/token_wizard.png",
      "robos:portraitAsset": "assets/portraits/card_bg_wizard.png",
      "robos:icon": "🔮",
      "robos:startingPosition": [0, 0],
      "robos:inventory": [
        { id: "item-holy-water-1", name: "Holy Water", type: "relic", effect: "Destroys undead instantly", value: 200 },
        { id: "item-pot-heal-3", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
      ]
    }
  ];
}

const DEFAULT_STUDIO_MAP_CONFIGS = [
  {
    id: "heroquest-classic",
    title: "HeroQuest Classic Stone Dungeon (Side A)",
    boardSide: "A",
    gridDimensions: [26, 19],
    backgroundImage: "res://assets/boards/heroquest_board.png"
  },
  {
    id: "midterm-election-capitol",
    title: "Midterm Elections: Battle for the Hill",
    boardSide: "Custom",
    category: "Midterms 2026",
    gridDimensions: [26, 19],
    additionalBorderTile: true,
    backgroundImage: "res://assets/boards/midterm_election_capitol.png"
  },
  {
    id: "first-light-dungeon",
    title: "HeroQuest: First Light Side A",
    boardSide: "A",
    gridDimensions: [26, 19],
    additionalBorderTile: true,
    backgroundImage: "res://assets/boards/first_light_dungeon.png"
  },
  {
    id: "fan-dungeon-28x21",
    title: "HeroQuest Fan Dungeon & Cavern Citadel (28×21)",
    boardSide: "Custom",
    gridDimensions: [28, 21],
    backgroundImage: "res://assets/boards/fan_dungeon_28x21.png"
  },
  {
    id: "first-light-caverns",
    title: "HeroQuest: First Light Subterranean Caverns (Side B)",
    boardSide: "B",
    gridDimensions: [26, 19],
    backgroundImage: "res://assets/boards/first_light_caverns.png"
  }
];

// RobOS Tabletop Studio Client Application
let currentData = {
  tabletopNodes: [],
  gameNodes: [],
  mapConfigs: [...DEFAULT_STUDIO_MAP_CONFIGS],
  activeMapConfig: DEFAULT_STUDIO_MAP_CONFIGS[0],
  categories: ['Base Game', 'Midterms 2026'],
  activeMonsterCategoryFilter: 'All',
  activeSpellItemCategoryFilter: 'All',
  activeClassTypeFilter: 'All',
  classes: [],
  activeClassId: 'urn:robos:tabletop:class:hero-barbarian',
  heroes: [],
  monsters: [],
  spells: [],
  dreadSpells: [],
  weapons: [],
  items: [],
  spellAllocation: {
    elfElement: 'water',
    wizardElements: ['earth', 'fire', 'air'],
    confirmed: false
  },
  furniture: [],
  doors: [],
  activeHeroId: null,
  activeMonsterId: null,
  activeCampaignSubtab: 'subtab-campaign-quests',
  currentCampaignIndex: 0,
  questSaveState: null,
  questSaveSnapshots: [],
  loadedCartridgeData: null,
  campaigns: [
    {
      id: 'campaign-heroquest',
      title: 'HeroQuest',
      description: "The HeroQuest campaign featuring the real working custom-quest.cartridge dungeon.",
      heroes: createDefaultCampaignHeroes(),
      quests: [
        {
          id: 'custom-quest',
          slug: 'custom-quest',
          cartridgeFile: 'custom-quest.cartridge.json',
          title: 'Quest 1: Custom Dungeon',
          briefing: 'Descend into the Custom Dungeon via the stairwell at [7, 14]. Explore the dungeon rooms, overcome the traps and monsters within, and return victorious!',
          mapConfigId: 'heroquest-classic',
          ruleset: 'heroquest',
          goldReward: 150,
          bossTarget: 'gargoyle-boss',
          completed: false,
          startingStairs: [7, 14],
          activeRooms: new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18', 'r19', 'r20', 'r21', 'r22']),
          wallBlocks: [
            { id: 'wb1', x: 1, y: 3, type: 'single', width: 1, height: 1 },
            { id: 'wb2', x: 7, y: 12, type: 'single', width: 1, height: 1 },
            { id: 'wb3', x: 12, y: 18, type: 'single', width: 1, height: 1 }
          ],
          doors: [],
          furniture: [],
          monsters: [],
          traps: [],
          storyTriggers: []
        }
      ]
    }
  ],
  campaign: null,
  currentQuestIndex: 0,
  currentQuest: null,
  activeTool: 'inspect',
  selectedSquare: null,
  selectedEntity: null,
  hoverSquare: null,
  zoom: 1.0,
  boardImage: null,
  calibration: {
    insetLeft: 0,
    insetTop: 0,
    insetRight: 0,
    insetBottom: 0,
    gridOpacity: 0.85,
    artOpacity: 1.0,
    showCoords: true,
    showRooms: true,
    showWalls: true
  }
};
currentData.campaign = currentData.campaigns[0];
currentData.heroes = currentData.campaign.heroes;
currentData.currentQuest = currentData.campaign.quests[0];

// DOM references
const statusBar = document.getElementById("status-text");

function setStatus(msg) {
  if (statusBar) statusBar.textContent = msg;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Setup Main Navigation Tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    const target = btn.dataset.tab;
    const pane = document.getElementById(target);
    if (pane) pane.classList.add("active");

    if (target === "tab-classes" && typeof renderClassesTab === "function") {
      renderClassesTab();
    } else if (target === "tab-monsters" && typeof renderMonstersList === "function") {
      renderMonstersList();
    } else if (target === "tab-spells" && typeof renderSpellsAndItems === "function") {
      renderSpellsAndItems();
    } else if (target === "tab-quest") {
      if (typeof renderQuestHeroesReviewGrid === "function") renderQuestHeroesReviewGrid();
      if (typeof refreshQuestSaveStateUI === "function") refreshQuestSaveStateUI();
    }
  });
});

// Setup Tool Palette buttons
document.querySelectorAll("#tool-palette .btn-tool").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tool-palette .btn-tool").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentData.activeTool = btn.dataset.tool;

    // Show/hide relevant subtool dropdowns
    document.getElementById("select-door-type").style.display = currentData.activeTool === "door" ? "inline-block" : "none";
    document.getElementById("select-block-type").style.display = currentData.activeTool === "wall-block" ? "inline-block" : "none";
    document.getElementById("select-furniture-type").style.display = currentData.activeTool === "furniture" ? "inline-block" : "none";
    document.getElementById("select-monster-type").style.display = currentData.activeTool === "monster" ? "inline-block" : "none";
    document.getElementById("select-trap-type").style.display = currentData.activeTool === "trap" ? "inline-block" : "none";

    setStatus(`Selected Tool: ${currentData.activeTool.toUpperCase()}`);
    drawBoard();
  });
});

// Setup Mini-Tabs in Right Panel
document.querySelectorAll(".mini-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mini-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderMiniList(tab.dataset.mini);
  });
});

// Calibration Drawer Toggle
document.getElementById("btn-toggle-calibration")?.addEventListener("click", () => {
  const drawer = document.getElementById("calibration-drawer");
  if (!drawer) return;
  drawer.style.display = drawer.style.display === "none" ? "block" : "none";
});

// Calibration Controls Bindings
function setupCalibrationControls() {
  const bindSlider = (id, prop, valId, isPercent = false) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (isPercent) {
        currentData.calibration[prop] = v / 100.0;
        if (valEl) valEl.textContent = `${v}%`;
      } else {
        currentData.calibration[prop] = v;
        if (valEl) valEl.textContent = `${v}`;
      }
      drawBoard();
    });
  };

  bindSlider("cal-inset-left", "insetLeft", "val-inset-left");
  bindSlider("cal-inset-top", "insetTop", "val-inset-top");
  bindSlider("cal-inset-right", "insetRight", "val-inset-right");
  bindSlider("cal-inset-bottom", "insetBottom", "val-inset-bottom");
  bindSlider("cal-grid-opacity", "gridOpacity", "val-grid-opacity", true);
  bindSlider("cal-art-opacity", "artOpacity", "val-art-opacity", true);

  document.getElementById("cal-show-coords")?.addEventListener("change", (e) => {
    currentData.calibration.showCoords = e.target.checked;
    drawBoard();
  });
  document.getElementById("cal-show-room-outlines")?.addEventListener("change", (e) => {
    currentData.calibration.showRooms = e.target.checked;
    drawBoard();
  });
  document.getElementById("cal-show-wall-outlines")?.addEventListener("change", (e) => {
    currentData.calibration.showWalls = e.target.checked;
    drawBoard();
  });

  document.getElementById("btn-reset-calibration")?.addEventListener("click", () => {
    if (!currentData.activeMapConfig) return;
    const def = currentData.activeMapConfig.calibration || {};
    currentData.calibration.insetLeft = def.insetLeft || 82;
    currentData.calibration.insetTop = def.insetTop || 65;
    currentData.calibration.insetRight = def.insetRight || 78;
    currentData.calibration.insetBottom = def.insetBottom || 43;
    currentData.calibration.gridOpacity = 0.85;
    currentData.calibration.artOpacity = 1.0;

    document.getElementById("cal-inset-left").value = currentData.calibration.insetLeft;
    document.getElementById("val-inset-left").textContent = currentData.calibration.insetLeft;
    document.getElementById("cal-inset-top").value = currentData.calibration.insetTop;
    document.getElementById("val-inset-top").textContent = currentData.calibration.insetTop;
    document.getElementById("cal-inset-right").value = currentData.calibration.insetRight;
    document.getElementById("val-inset-right").textContent = currentData.calibration.insetRight;
    document.getElementById("cal-inset-bottom").value = currentData.calibration.insetBottom;
    document.getElementById("val-inset-bottom").textContent = currentData.calibration.insetBottom;
    document.getElementById("cal-grid-opacity").value = 85;
    document.getElementById("val-grid-opacity").textContent = "85%";
    document.getElementById("cal-art-opacity").value = 100;
    document.getElementById("val-art-opacity").textContent = "100%";

    drawBoard();
    setStatus("Reset calibration to map configuration defaults.");
  });

  document.getElementById("btn-export-snapshot")?.addEventListener("click", exportCanvasSnapshot);
}

// Zoom controls
document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
  currentData.zoom = Math.min(2.5, currentData.zoom + 0.15);
  updateZoomDisplay();
});
document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
  currentData.zoom = Math.max(0.5, currentData.zoom - 0.15);
  updateZoomDisplay();
});
document.getElementById("btn-zoom-reset")?.addEventListener("click", () => {
  currentData.zoom = 1.0;
  updateZoomDisplay();
});

function updateZoomDisplay() {
  const canvas = document.getElementById("board-canvas");
  const badge = document.getElementById("zoom-text");
  if (badge) badge.textContent = `${Math.round(currentData.zoom * 100)}%`;
  if (canvas) {
    canvas.style.transform = `scale(${currentData.zoom})`;
    canvas.style.transformOrigin = "top center";
  }
}

// Map Configuration Switcher (Board & Map Studio)
document.getElementById("map-config-select")?.addEventListener("change", async (e) => {
  const configId = e.target.value;
  await switchMapConfiguration(configId);
});

// Map Theme Switcher (Campaign Editor)
document.getElementById("quest-bg-ref")?.addEventListener("change", async (e) => {
  const configId = e.target.value;
  if (currentData.currentQuest) {
    currentData.currentQuest.mapConfigId = configId;
    currentData.currentQuest._preserveMapConfig = true;
  }
  await switchMapConfiguration(configId, false);
  if (typeof renderCampaignQuestsList === "function") {
    renderCampaignQuestsList();
  }
  const slug = document.getElementById("quest-slug")?.value || currentData.currentQuest?.slug || "custom-quest";
  if (window.robosTabletop?.syncCartridgeHeroes) {
    await window.robosTabletop.syncCartridgeHeroes({
      cartridgeSlug: slug,
      slug,
      questTitle: currentData.currentQuest?.title,
      questBriefing: currentData.currentQuest?.briefing,
      mapConfigId: configId
    });
  }
  triggerCampaignAutosave();
});

async function switchMapConfiguration(configId, preserveQuestEntities = false) {
  const config = currentData.mapConfigs?.find(c => c.id === configId);
  if (!config) return;

  currentData.activeMapConfig = config;
  if (currentData.currentQuest) {
    currentData.currentQuest.mapConfigId = config.id;
  }

  // Synchronize dropdowns across Campaign Editor and Board Studio
  const mapSelect = document.getElementById("map-config-select");
  const questBgSelect = document.getElementById("quest-bg-ref");
  if (mapSelect && mapSelect.value !== config.id) mapSelect.value = config.id;
  if (questBgSelect && questBgSelect.value !== config.id) questBgSelect.value = config.id;

  // Update Campaign Editor Theme Metadata Badges
  const dimsEl = document.getElementById("quest-bg-dims");
  const roomsEl = document.getElementById("quest-bg-rooms");
  const calibEl = document.getElementById("quest-bg-calib");
  if (dimsEl && config.gridDimensions) dimsEl.textContent = `${config.gridDimensions[0]} × ${config.gridDimensions[1]} squares`;
  if (roomsEl) roomsEl.textContent = `🌫️ Fog of War Active`;
  if (calibEl) calibEl.textContent = `${currentData.currentQuest?.slug || "custom-quest"}.cartridge.json`;

  // Apply default calibration for this map
  if (config.calibration) {
    currentData.calibration.insetLeft = Number.isFinite(config.calibration.insetLeft) ? config.calibration.insetLeft : 0;
    currentData.calibration.insetTop = Number.isFinite(config.calibration.insetTop) ? config.calibration.insetTop : 0;
    currentData.calibration.insetRight = Number.isFinite(config.calibration.insetRight) ? config.calibration.insetRight : 0;
    currentData.calibration.insetBottom = Number.isFinite(config.calibration.insetBottom) ? config.calibration.insetBottom : 0;

    const inL = document.getElementById("cal-inset-left");
    const valL = document.getElementById("val-inset-left");
    if (inL) inL.value = currentData.calibration.insetLeft;
    if (valL) valL.textContent = currentData.calibration.insetLeft;

    const inT = document.getElementById("cal-inset-top");
    const valT = document.getElementById("val-inset-top");
    if (inT) inT.value = currentData.calibration.insetTop;
    if (valT) valT.textContent = currentData.calibration.insetTop;

    const inR = document.getElementById("cal-inset-right");
    const valR = document.getElementById("val-inset-right");
    if (inR) inR.value = currentData.calibration.insetRight;
    if (valR) valR.textContent = currentData.calibration.insetRight;

    const inB = document.getElementById("cal-inset-bottom");
    const valB = document.getElementById("val-inset-bottom");
    if (inB) inB.value = currentData.calibration.insetBottom;
    if (valB) valB.textContent = currentData.calibration.insetBottom;
  }

  if (currentData.currentQuest) {
    if (!preserveQuestEntities) {
      // Populate active rooms
      currentData.currentQuest.activeRooms = new Set((config.rooms || []).map(r => r.id));

      // Initialize doors
      currentData.currentQuest.doors = (config.doors || []).map(d => ({
        id: d.id,
        from: [...d.from],
        to: [...d.to],
        state: 'closed',
        room: d.room
      }));

      // Update starting stair
      if (config.defaultStartingStair) {
        currentData.currentQuest.startingStairs = [...config.defaultStartingStair];
      }
    } else {
      if (!currentData.currentQuest.activeRooms || !(currentData.currentQuest.activeRooms instanceof Set) || currentData.currentQuest.activeRooms.size === 0) {
        currentData.currentQuest.activeRooms = new Set((config.rooms || []).map(r => r.id));
      }
      if (!currentData.currentQuest.doors || currentData.currentQuest.doors.length === 0) {
        currentData.currentQuest.doors = (config.doors || []).map(d => ({
          id: d.id,
          from: [...d.from],
          to: [...d.to],
          state: 'closed',
          room: d.room
        }));
      }
      if (!currentData.currentQuest.startingStairs && config.defaultStartingStair) {
        currentData.currentQuest.startingStairs = [...config.defaultStartingStair];
      }
    }
  }

  setStatus(`Loading artwork for ${config.title}...`);
  await loadBoardArtwork(config.localImageFile || config.backgroundImage);
  updateSummaryStats();
  drawBoard();
  setStatus(`Active Map Configuration: ${config.title}`);
}

async function loadBoardArtwork(relPath) {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) {
    currentData.boardImage = null;
    currentData.boardImageLoading = false;
    return;
  }
  currentData.boardImage = null;
  currentData.boardImageLoading = true;
  try {
    const res = await window.robosTabletop.getBoardImage(relPath);
    if (res.success && res.dataUrl) {
      const img = new Image();
      img.onload = () => {
        currentData.boardImage = img;
        currentData.boardImageLoading = false;
        const canvas = document.getElementById("board-canvas");
        if (canvas && img.naturalWidth && img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        drawBoard();
      };
      img.src = res.dataUrl;
    } else {
      console.warn("Could not load board image:", res.error);
      currentData.boardImageLoading = false;
      drawBoard();
    }
  } catch (err) {
    console.error("Failed to fetch board image:", err);
    currentData.boardImageLoading = false;
    drawBoard();
  }
}

// Calculate Inner Playable Grid Bounds
function getGridMetrics() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return null;
  const w = canvas.width;
  const h = canvas.height;

  const [cols, rows] = currentData.activeMapConfig?.gridDimensions || [26, 19];
  const insetL = currentData.calibration.insetLeft;
  const insetT = currentData.calibration.insetTop;
  const insetR = currentData.calibration.insetRight;
  const insetB = currentData.calibration.insetBottom;

  const innerW = w - insetL - insetR;
  const innerH = h - insetT - insetB;

  const cellW = innerW / cols;
  const cellH = innerH / rows;

  return {
    w, h,
    cols, rows,
    insetL, insetT, insetR, insetB,
    innerW, innerH,
    cellW, cellH
  };
}

// Export high-resolution PNG snapshot
async function exportCanvasSnapshot() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;
  const dataUrl = canvas.toDataURL("image/png");
  const filename = `tabletop-quest-${currentData.activeMapConfig?.id || 'grid'}-${Date.now()}.png`;

  setStatus("Exporting canvas snapshot...");
  const res = await window.robosTabletop.saveBoardSnapshot({ dataUrl, filename });
  if (res.success) {
    setStatus(`Saved snapshot: ${res.filePath}`);
  } else {
    setStatus("Snapshot export error: " + res.error);
  }
}

// Initialize Board Events
function initBoard() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const m = getGridMetrics();
    if (!m) return;

    if (mouseX >= m.insetL && mouseX <= m.w - m.insetR &&
        mouseY >= m.insetT && mouseY <= m.h - m.insetB) {
      const col = Math.floor((mouseX - m.insetL) / m.cellW);
      const row = Math.floor((mouseY - m.insetT) / m.cellH);

      if (col >= 0 && col < m.cols && row >= 0 && row < m.rows) {
        currentData.hoverSquare = { col, row };
        const room = findRoomAt(col, row);
        const colLetter = String.fromCharCode(65 + (col % 26));
        const squareId = `${colLetter}-${row + 1}`;
        const roomName = room ? room.name : "Outer Corridor";
        const isActive = room ? currentData.currentQuest.activeRooms.has(room.id) : true;

        const hoverBadge = document.getElementById("board-hover-coords");
        if (hoverBadge) {
          hoverBadge.textContent = `Square: ${squareId} [${col}, ${row}] | ${roomName} ${isActive ? '' : '(Inactive)'}`;
        }
        drawBoard();
        return;
      }
    }
    currentData.hoverSquare = null;
    drawBoard();
  });

  canvas.addEventListener("mouseleave", () => {
    currentData.hoverSquare = null;
    drawBoard();
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const m = getGridMetrics();
    if (!m) return;

    if (mouseX >= m.insetL && mouseX <= m.w - m.insetR &&
        mouseY >= m.insetT && mouseY <= m.h - m.insetB) {
      const col = Math.floor((mouseX - m.insetL) / m.cellW);
      const row = Math.floor((mouseY - m.insetT) / m.cellH);
      handleSquareClick(col, row);
    }
  });

  setupCalibrationControls();
}

function findRoomAt(col, row) {
  if (!currentData.activeMapConfig) return null;
  return (currentData.activeMapConfig.rooms || []).find(r => {
    return col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h;
  }) || null;
}

// Helper dimensions & coverage checks for multi-tile items
function getBlockDimensions(b) {
  const type = b.type || 'single';
  const w = b.width || (type === 'double-h' ? 2 : 1);
  const h = b.height || (type === 'double-v' ? 2 : 1);
  return { w, h };
}

function isBlockCovering(b, col, row) {
  const { w, h } = getBlockDimensions(b);
  return col >= b.x && col < b.x + w && row >= b.y && row < b.y + h;
}

function getFurnitureDimensions(f) {
  if (f.width && f.height) return { w: f.width, h: f.height };
  const type = f.type || '';
  if (type === 'bookcase' || type === 'bookcase-3x1' || type === 'weapons-rack' || type === 'weapons-rack-3x1' || type === 'fireplace') return { w: 3, h: 1 };
  if (type === 'bookcase-1x3' || type === 'weapons-rack-1x3') return { w: 1, h: 3 };
  if (type === 'bookshelf' || type === 'bookshelf-2x1' || type === 'cupboard' || type === 'cupboard-2x1') return { w: 2, h: 1 };
  if (type === 'bookshelf-1x2' || type === 'cupboard-1x2') return { w: 1, h: 2 };
  if (type === 'altar' || type === 'altar-3x2' || type === 'table' || type === 'table-3x2' || type === 'alchemists-bench' || type === 'torture-rack') return { w: 3, h: 2 };
  if (type === 'altar-2x3' || type === 'table-2x3' || type === 'tomb') return { w: 2, h: 3 };
  if (type === 'boulder-2x2') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

function isFurnitureCovering(f, col, row) {
  const { w, h } = getFurnitureDimensions(f);
  return col >= f.x && col < f.x + w && row >= f.y && row < f.y + h;
}

function getTrapDimensions(t) {
  const type = typeof t === 'string' ? t : (t.trapType || '');
  if (type === 'boulder-2x2') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

function isTrapCovering(t, col, row) {
  const { w, h } = getTrapDimensions(t);
  return col >= t.x && col < t.x + w && row >= t.y && row < t.y + h;
}

// ========================================================
// MAP HISTORY & UNDO / REDO CONTROLLER
// ========================================================
const MAX_MAP_HISTORY = 50;
const mapUndoStack = [];
const mapRedoStack = [];

function getQuestSnapshot() {
  const q = currentData.currentQuest;
  return {
    activeRooms: Array.from(q.activeRooms),
    doors: JSON.parse(JSON.stringify(q.doors || [])),
    wallBlocks: JSON.parse(JSON.stringify(q.wallBlocks || [])),
    furniture: JSON.parse(JSON.stringify(q.furniture || [])),
    monsters: JSON.parse(JSON.stringify(q.monsters || [])),
    traps: JSON.parse(JSON.stringify(q.traps || [])),
    startingStairs: [...(q.startingStairs || [0, 1])]
  };
}

function updateUndoRedoUI() {
  const btnUndo = document.getElementById("btn-map-undo");
  const btnRedo = document.getElementById("btn-map-redo");
  if (btnUndo) btnUndo.disabled = mapUndoStack.length === 0;
  if (btnRedo) btnRedo.disabled = mapRedoStack.length === 0;
}

function pushUndoState() {
  mapUndoStack.push(getQuestSnapshot());
  if (mapUndoStack.length > MAX_MAP_HISTORY) {
    mapUndoStack.shift();
  }
  mapRedoStack.length = 0;
  updateUndoRedoUI();
}

function applySnapshot(snapshot) {
  const q = currentData.currentQuest;
  q.activeRooms = new Set(snapshot.activeRooms || []);
  q.doors = JSON.parse(JSON.stringify(snapshot.doors || []));
  q.wallBlocks = JSON.parse(JSON.stringify(snapshot.wallBlocks || []));
  q.furniture = JSON.parse(JSON.stringify(snapshot.furniture || []));
  q.monsters = JSON.parse(JSON.stringify(snapshot.monsters || []));
  q.traps = JSON.parse(JSON.stringify(snapshot.traps || []));
  q.startingStairs = [...(snapshot.startingStairs || [0, 1])];

  updateSummaryStats();
  renderMiniList();
  drawBoard();
  if (currentData.selectedSquare) {
    inspectSquare(currentData.selectedSquare.col, currentData.selectedSquare.row);
  }
}

function undoMapAction() {
  if (mapUndoStack.length === 0) return;
  const currentSnapshot = getQuestSnapshot();
  mapRedoStack.push(currentSnapshot);
  const prevSnapshot = mapUndoStack.pop();
  applySnapshot(prevSnapshot);
  updateUndoRedoUI();
  setStatus("Undid last map action. (Ctrl+Z)");
}

function redoMapAction() {
  if (mapRedoStack.length === 0) return;
  const currentSnapshot = getQuestSnapshot();
  mapUndoStack.push(currentSnapshot);
  const nextSnapshot = mapRedoStack.pop();
  applySnapshot(nextSnapshot);
  updateUndoRedoUI();
  setStatus("Redid last map action. (Ctrl+Y)");
}

// Handle Editor Tool Clicks
function handleSquareClick(col, row) {
  const tool = currentData.activeTool;
  const room = findRoomAt(col, row);
  const roomId = room ? room.id : 'corridor';

  currentData.selectedSquare = { col, row };

  if (tool === 'inspect') {
    inspectSquare(col, row);
    drawBoard();
    return;
  }

  // Record undo snapshot before applying any modification
  pushUndoState();

  if (tool === 'room-toggle') {
    if (room) {
      if (currentData.currentQuest.activeRooms.has(room.id)) {
        currentData.currentQuest.activeRooms.delete(room.id);
        setStatus(`Deactivated room: ${room.name}`);
      } else {
        currentData.currentQuest.activeRooms.add(room.id);
        setStatus(`Activated room: ${room.name}`);
      }
    } else {
      setStatus(`Clicked outer corridor at [${col}, ${row}]`);
    }
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'stairs') {
    currentData.currentQuest.startingStairs = [col, row];
    setStatus(`Placed player starting stairs at [${col}, ${row}]`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'erase') {
    eraseAt(col, row, true);
    return;
  }

  if (tool === 'wall-block') {
    const blockType = document.getElementById("select-block-type")?.value || '1-tile-wall';
    const isDoubleH = blockType === '2-tile-wall-h';
    const isDoubleV = blockType === '2-tile-wall-v';
    const width = isDoubleH ? 2 : 1;
    const height = isDoubleV ? 2 : 1;
    const type = isDoubleH ? 'double-h' : (isDoubleV ? 'double-v' : 'single');

    const existingIdx = currentData.currentQuest.wallBlocks.findIndex(b => isBlockCovering(b, col, row));
    if (existingIdx >= 0) {
      currentData.currentQuest.wallBlocks.splice(existingIdx, 1);
      setStatus(`Removed wall block covering [${col}, ${row}]`);
    } else {
      currentData.currentQuest.wallBlocks.push({
        id: `block-${col}-${row}`,
        x: col,
        y: row,
        type,
        width,
        height
      });
      setStatus(`Placed ${width}×${height} ${type === 'single' ? '1-Tile Wall Block' : '2-Tile Wall Block'} at [${col}, ${row}]`);
    }
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'furniture') {
    const furnType = document.getElementById("select-furniture-type").value || 'chest';
    const furnName = document.getElementById("select-furniture-type").selectedOptions[0]?.text || furnType;
    const dims = getFurnitureDimensions({ type: furnType });

    // Remove any existing furniture covering this square
    currentData.currentQuest.furniture = currentData.currentQuest.furniture.filter(f => !isFurnitureCovering(f, col, row));
    currentData.currentQuest.furniture.push({
      id: `furn-${furnType}-${col}-${row}`,
      name: furnName.split('(')[0].trim(),
      type: furnType,
      x: col,
      y: row,
      width: dims.w,
      height: dims.h,
      roomId
    });
    setStatus(`Placed ${furnName} at [${col}, ${row}] (${dims.w}×${dims.h} tiles)`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'monster') {
    const monId = document.getElementById("select-monster-type").value || 'goblin-scout-1';
    const monName = document.getElementById("select-monster-type").selectedOptions[0]?.text || monId;
    const isBoss = monId.includes('boss');
    currentData.currentQuest.monsters = currentData.currentQuest.monsters.filter(m => !(m.x === col && m.y === row));
    currentData.currentQuest.monsters.push({
      id: `mon-${monId}-${col}-${row}`,
      name: monName.split('(')[0].trim(),
      monsterType: monId,
      x: col,
      y: row,
      bp: isBoss ? 3 : (monId.includes('fimir') || monId.includes('mummy') ? 2 : 1),
      atk: isBoss ? 4 : (monId.includes('orc') || monId.includes('chaos') ? 3 : 2),
      def: isBoss ? 3 : 2,
      isBoss,
      roomId
    });
    setStatus(`Placed ${monName} at [${col}, ${row}]`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'trap') {
    const trapType = document.getElementById("select-trap-type").value || 'pit';
    const trapName = document.getElementById("select-trap-type").selectedOptions[0]?.text || trapType;
    const dims = getTrapDimensions(trapType);
    currentData.currentQuest.traps = currentData.currentQuest.traps.filter(t => !isTrapCovering(t, col, row));
    currentData.currentQuest.traps.push({
      id: `trap-${trapType}-${col}-${row}`,
      name: trapName.split('(')[0].trim(),
      trapType,
      x: col,
      y: row,
      width: dims.w,
      height: dims.h,
      damageDice: (trapType === 'falling-block' || trapType.startsWith('boulder')) ? 3 : (trapType === 'spear' ? 2 : 1),
      detected: false,
      disarmed: false
    });
    setStatus(`Placed ${trapName} at [${col}, ${row}]`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'door') {
    const doorState = document.getElementById("select-door-type").value || 'closed';
    // Toggle door or cycle door state
    const existingDoor = currentData.currentQuest.doors.find(d => {
      return (d.from[0] === col && d.from[1] === row) || (d.to[0] === col && d.to[1] === row);
    });

    if (existingDoor) {
      if (existingDoor.state === 'closed') existingDoor.state = 'open';
      else if (existingDoor.state === 'open') existingDoor.state = 'secret';
      else currentData.currentQuest.doors = currentData.currentQuest.doors.filter(d => d !== existingDoor);
      setStatus(`Toggled door state`);
    } else {
      currentData.currentQuest.doors.push({
        id: `door-${col}-${row}`,
        from: [col, row],
        to: [col, row + 1],
        state: doorState,
        room: roomId
      });
      setStatus(`Placed ${doorState} door at [${col}, ${row}]`);
    }
    updateSummaryStats();
    drawBoard();
  }
}

function eraseAt(col, row, skipPushUndo = false) {
  if (!skipPushUndo) {
    pushUndoState();
  }
  currentData.currentQuest.wallBlocks = currentData.currentQuest.wallBlocks.filter(b => !isBlockCovering(b, col, row));
  currentData.currentQuest.furniture = currentData.currentQuest.furniture.filter(f => !isFurnitureCovering(f, col, row));
  currentData.currentQuest.monsters = currentData.currentQuest.monsters.filter(m => !(m.x === col && m.y === row));
  currentData.currentQuest.traps = currentData.currentQuest.traps.filter(t => !isTrapCovering(t, col, row));
  currentData.currentQuest.doors = currentData.currentQuest.doors.filter(d => {
    return !(d.from[0] === col && d.from[1] === row) && !(d.to[0] === col && d.to[1] === row);
  });
  setStatus(`Erased items covering [${col}, ${row}]`);
  updateSummaryStats();
  renderMiniList();
  drawBoard();
  if (currentData.selectedSquare && currentData.selectedSquare.col === col && currentData.selectedSquare.row === row) {
    inspectSquare(col, row);
  }
}

function inspectSquare(col, row) {
  const room = findRoomAt(col, row);
  const colLetter = String.fromCharCode(65 + (col % 26));
  const squareId = `${colLetter}-${row + 1}`;

  const block = currentData.currentQuest.wallBlocks.find(b => isBlockCovering(b, col, row));
  const furn = currentData.currentQuest.furniture.find(f => isFurnitureCovering(f, col, row));
  const mon = currentData.currentQuest.monsters.find(m => m.x === col && m.y === row);
  const trap = currentData.currentQuest.traps.find(t => isTrapCovering(t, col, row));
  const door = currentData.currentQuest.doors.find(d => (d.from[0] === col && d.from[1] === row) || (d.to[0] === col && d.to[1] === row));
  const isStairs = currentData.currentQuest.startingStairs[0] === col && currentData.currentQuest.startingStairs[1] === row;

  const inspector = document.getElementById("inspector-body");
  if (!inspector) return;

  let html = `
    <div class="entity-badge-large">
      <span class="badge">${squareId} [${col}, ${row}]</span>
      <span>${room ? room.name : 'Corridor'}</span>
    </div>
    <p><strong>Room Status:</strong> ${room ? (currentData.currentQuest.activeRooms.has(room.id) ? '<span style="color:#22c55e">Active</span>' : '<span style="color:#ef4444">Inactive</span>') : 'Corridor'}</p>
  `;

  if (isStairs) {
    html += `<div class="stat-pill" style="margin-top:6px;"><span>🏁 <strong>Player Starting Stairs</strong></span></div>`;
  }
  if (block) {
    const bDims = getBlockDimensions(block);
    const blockLabel = bDims.w === 1 && bDims.h === 1 ? '1-Tile Wall Block' : (bDims.w === 2 ? '2-Tile Wall Block (Horizontal)' : '2-Tile Wall Block (Vertical)');
    html += `<div class="stat-pill" style="margin-top:6px;"><span>🧱 <strong>${blockLabel}</strong> (${bDims.w}×${bDims.h})</span><button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button></div>`;
  }
  if (furn) {
    const fDims = getFurnitureDimensions(furn);
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>📦 <strong>${furn.name}</strong> (${fDims.w}×${fDims.h} ${furn.type})</span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }
  if (mon) {
    const monTokUrl = getMonsterTokenUrl(mon);
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span style="display:flex; align-items:center; gap:6px;"><img src="${monTokUrl}" alt="" style="width:20px; height:20px; object-fit:contain;"> <strong>${mon.name}</strong> ${mon.isBoss ? '[BOSS]' : ''} | BP: ${mon.bp}, Atk: ${mon.atk}</span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }
  if (trap) {
    const tDims = getTrapDimensions(trap);
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>⚠️ <strong>${(trap.name || trap.trapType).toUpperCase()}</strong> (${tDims.w}×${tDims.h} | ${trap.damageDice} dice)</span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }
  if (door) {
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>🚪 <strong>Door (${door.state.toUpperCase()})</strong></span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }

  if (!block && !furn && !mon && !trap && !door && !isStairs) {
    html += `<p class="text-muted" style="margin-top:8px;">Empty playable tile.</p>`;
  }

  inspector.innerHTML = html;
}

// Update summary stats
function updateSummaryStats() {
  const q = currentData.currentQuest;
  const totalRooms = currentData.activeMapConfig?.rooms?.length || 17;
  const activeCount = q.activeRooms.size;

  const elRooms = document.getElementById("summary-active-rooms");
  if (elRooms) elRooms.textContent = `${activeCount} / ${totalRooms}`;

  const elBlocks = document.getElementById("summary-wall-blocks");
  if (elBlocks) elBlocks.textContent = `${q.wallBlocks.length}`;

  const elDoors = document.getElementById("summary-doors");
  if (elDoors) elDoors.textContent = `${q.doors.length}`;

  const elFurn = document.getElementById("summary-furniture");
  if (elFurn) elFurn.textContent = `${q.furniture.length}`;

  const elMon = document.getElementById("summary-monsters");
  if (elMon) elMon.textContent = `${q.monsters.length}`;

  const elTraps = document.getElementById("summary-traps");
  if (elTraps) elTraps.textContent = `${q.traps.length}`;

  // Mini counts
  const cDoors = document.getElementById("count-doors");
  if (cDoors) cDoors.textContent = q.doors.length;
  const cBlocks = document.getElementById("count-blocks");
  if (cBlocks) cBlocks.textContent = q.wallBlocks.length;
  const cFurn = document.getElementById("count-furn");
  if (cFurn) cFurn.textContent = q.furniture.length;
  const cMon = document.getElementById("count-monsters");
  if (cMon) cMon.textContent = q.monsters.length;
  const cTraps = document.getElementById("count-traps");
  if (cTraps) cTraps.textContent = q.traps.length;

  const activeTab = document.querySelector(".mini-tab.active")?.dataset.mini || "doors";
  renderMiniList(activeTab);
}

function renderMiniList(type) {
  const container = document.getElementById("placed-entities-list");
  if (!container) return;
  container.innerHTML = "";

  const q = currentData.currentQuest;
  let items = [];
  if (type === "doors") {
    items = q.doors.map(d => ({
      label: `Door (${d.state})`,
      coords: `[${d.from[0]}, ${d.from[1]}]`,
      col: d.from[0],
      row: d.from[1]
    }));
  } else if (type === "blocks") {
    items = q.wallBlocks.map(b => {
      const { w, h } = getBlockDimensions(b);
      const name = (w === 1 && h === 1) ? '1-Tile Wall' : (w === 2 ? '2-Tile Wall (H)' : '2-Tile Wall (V)');
      return {
        label: `${name} (${w}×${h})`,
        coords: `[${b.x}, ${b.y}]`,
        col: b.x,
        row: b.y
      };
    });
  } else if (type === "furniture") {
    items = q.furniture.map(f => {
      const dims = getFurnitureDimensions(f);
      return {
        label: `${f.name} (${dims.w}×${dims.h})`,
        coords: `[${f.x}, ${f.y}]`,
        col: f.x,
        row: f.y
      };
    });
  } else if (type === "monsters") {
    items = q.monsters.map(m => ({
      label: `${m.name}`,
      tokenUrl: getMonsterTokenUrl(m),
      coords: `[${m.x}, ${m.y}]`,
      col: m.x,
      row: m.y
    }));
  } else if (type === "traps") {
    items = q.traps.map(t => {
      const dims = getTrapDimensions(t);
      return {
        label: `${(t.name || t.trapType).toUpperCase()} (${dims.w}×${dims.h})`,
        coords: `[${t.x}, ${t.y}]`,
        col: t.x,
        row: t.y
      };
    });
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="mini-item text-muted">No ${type} placed.</div>`;
    return;
  }

  items.forEach(it => {
    const div = document.createElement("div");
    div.className = "mini-item";
    const imgHtml = it.tokenUrl ? `<img src="${it.tokenUrl}" alt="" style="width:18px; height:18px; object-fit:contain; vertical-align:middle; margin-right:5px;">` : "";
    div.innerHTML = `<span style="display:flex; align-items:center;">${imgHtml}<strong>${it.label}</strong></span> <span class="badge">${it.coords}</span>`;
    div.onclick = () => {
      inspectSquare(it.col, it.row);
      currentData.selectedSquare = { col: it.col, row: it.row };
      drawBoard();
    };
    container.appendChild(div);
  });
}

// Toggle all rooms active/inactive
document.getElementById("btn-toggle-all-rooms")?.addEventListener("click", () => {
  pushUndoState();
  const rooms = currentData.activeMapConfig?.rooms || [];
  if (currentData.currentQuest.activeRooms.size === rooms.length) {
    currentData.currentQuest.activeRooms.clear();
    setStatus("Deactivated all rooms.");
  } else {
    rooms.forEach(r => currentData.currentQuest.activeRooms.add(r.id));
    setStatus("Activated all rooms.");
  }
  updateSummaryStats();
  drawBoard();
});

// Render the 26x19 Board Canvas
function drawBoard() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const m = getGridMetrics();
  if (!m) return;

  // 1. Clear background
  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, m.w, m.h);

  // 2. Draw Board Artwork
  if (currentData.boardImage) {
    ctx.save();
    ctx.globalAlpha = currentData.calibration.artOpacity;
    ctx.drawImage(currentData.boardImage, 0, 0, m.w, m.h);
    ctx.restore();
  } else {
    // Fallback dark gradient
    const grad = ctx.createRadialGradient(m.w/2, m.h/2, 100, m.w/2, m.h/2, m.w/2);
    grad.addColorStop(0, "#1e293b");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, m.w, m.h);
  }

  const { insetL, insetT, innerW, innerH, cellW, cellH, cols, rows } = m;

  // 3. Draw Inactive Room Shroud
  const rooms = currentData.activeMapConfig?.rooms || [];
  rooms.forEach(r => {
    const isActive = currentData.currentQuest.activeRooms.has(r.id);
    const rx = insetL + r.x * cellW;
    const ry = insetT + r.y * cellH;
    const rw = r.w * cellW;
    const rh = r.h * cellH;

    if (!isActive) {
      // Dark veil over unactivated room
      ctx.fillStyle = "rgba(10, 15, 29, 0.82)";
      ctx.fillRect(rx, ry, rw, rh);

      ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[INACTIVE ROOM]", rx + rw / 2, ry + rh / 2);
    } else if (currentData.calibration.showRooms) {
      // Subtle room tint
      ctx.fillStyle = r.id === 'room-center' || r.id === 'cavern-center'
        ? "rgba(245, 158, 11, 0.12)"
        : "rgba(56, 189, 248, 0.06)";
      ctx.fillRect(rx, ry, rw, rh);

      // Glowing room border
      ctx.strokeStyle = r.id === 'room-center' || r.id === 'cavern-center'
        ? "rgba(245, 158, 11, 0.7)"
        : "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  });

  // 4. Draw Calibrated Grid Lines
  ctx.save();
  ctx.strokeStyle = `rgba(0, 229, 255, ${currentData.calibration.gridOpacity})`;
  ctx.lineWidth = 1.0;

  for (let c = 0; c <= cols; c++) {
    const x = insetL + c * cellW;
    ctx.beginPath();
    ctx.moveTo(x, insetT);
    ctx.lineTo(x, insetT + innerH);
    ctx.stroke();
  }

  for (let r = 0; r <= rows; r++) {
    const y = insetT + r * cellH;
    ctx.beginPath();
    ctx.moveTo(insetL, y);
    ctx.lineTo(insetL + innerW, y);
    ctx.stroke();
  }
  ctx.restore();

  // 5. Draw Coordinate Labels
  if (currentData.calibration.showCoords) {
    ctx.save();
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const topY = insetT >= 16 ? (insetT - 6) : (insetT + 8);
    for (let c = 0; c < cols; c++) {
      const x = insetL + c * cellW + cellW / 2;
      const label = c < 26 ? String.fromCharCode(65 + c) : `A${String.fromCharCode(65 + c - 26)}`;
      ctx.fillText(label, x, topY);
    }

    const leftX = insetL >= 20 ? (insetL - 8) : (insetL + 8);
    for (let r = 0; r < rows; r++) {
      const y = insetT + r * cellH + cellH / 2;
      ctx.fillText(String(r + 1), leftX, y);
    }
    ctx.restore();
  }

  // 6. Draw Wall Blocks (1-Tile & 2-Tile HeroQuest stone blocks)
  const q = currentData.currentQuest;
  q.wallBlocks.forEach(b => {
    const { w, h } = getBlockDimensions(b);
    const bx = insetL + b.x * cellW;
    const by = insetT + b.y * cellH;
    const totalW = w * cellW;
    const totalH = h * cellH;
    const midX = bx + totalW / 2;
    const midY = by + totalH / 2;

    ctx.save();
    // Drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(bx + 3, by + 3, totalW - 4, totalH - 4);

    const wbImg = getTileImage('wall_block');
    if (wbImg) {
      // Draw authentic AI wall block texture per cell
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const tx = bx + dx * cellW;
          const ty = by + dy * cellH;
          ctx.drawImage(wbImg, tx + 1, ty + 1, cellW - 2, cellH - 2);
        }
      }
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 1, by + 1, totalW - 2, totalH - 2);

      if (w > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + cellW, by + 2);
        ctx.lineTo(bx + cellW, by + totalH - 2);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (h > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + 2, by + cellH);
        ctx.lineTo(bx + totalW - 2, by + cellH);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Center pill label
      const label = (w > 1 || h > 1) ? "🧱 2-TILE WALL" : "🧱 WALL";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - tw / 2 - 4, midY - 6, tw + 8, 12);
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(label, midX, midY);
    } else {
      // Stone block outer casing
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(bx + 1, by + 1, totalW - 2, totalH - 2);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 1, by + 1, totalW - 2, totalH - 2);

      // Draw individual tiles within the block
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const tx = bx + dx * cellW;
          const ty = by + dy * cellH;

          // Tile bevel
          ctx.fillStyle = "#334155";
          ctx.fillRect(tx + 3, ty + 3, cellW - 6, cellH - 6);

          // Masonry cross-hatch
          ctx.beginPath();
          ctx.moveTo(tx + 5, ty + 5);
          ctx.lineTo(tx + cellW - 5, ty + cellH - 5);
          ctx.moveTo(tx + cellW - 5, ty + 5);
          ctx.lineTo(tx + 5, ty + cellH - 5);
          ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // Inner border
          ctx.strokeStyle = "rgba(100, 116, 139, 0.8)";
          ctx.lineWidth = 1;
          ctx.strokeRect(tx + 3, ty + 3, cellW - 6, cellH - 6);
        }
      }

      // Seam line between tiles if multi-tile
      if (w > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + cellW, by + 2);
        ctx.lineTo(bx + cellW, by + totalH - 2);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (h > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + 2, by + cellH);
        ctx.lineTo(bx + totalW - 2, by + cellH);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Label in center
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = (w > 1 || h > 1) ? "🧱 2-TILE WALL" : "🧱 WALL";
      ctx.fillText(label, midX, midY);
    }

    ctx.restore();
  });

  // 7. Draw Traps & Boulder Tiles
  q.traps.forEach(t => {
    const { w, h } = getTrapDimensions(t);
    const tx = insetL + t.x * cellW;
    const ty = insetT + t.y * cellH;
    const totalW = w * cellW;
    const totalH = h * cellH;
    const midX = tx + totalW / 2;
    const midY = ty + totalH / 2;

    ctx.save();
    const trapKey = (t.trapType === 'boulder' || t.trapType === 'boulder-2x2') ? 'boulder' : t.trapType;
    const trImg = getTileImage(trapKey);
    if (trImg) {
      // Drop shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(tx + 3, ty + 3, totalW - 4, totalH - 4);
      // AI Image
      ctx.drawImage(trImg, tx + 2, ty + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = t.trapType === 'pit' ? '#dc2626' : (t.trapType === 'falling-block' ? '#ea580c' : '#7c3aed');
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx + 2, ty + 2, totalW - 4, totalH - 4);
      // Label pill
      const lbl = t.trapType === 'boulder-2x2' ? 'MEGA BOULDER' : (t.trapType || 'TRAP').toUpperCase();
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(lbl).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - tw / 2 - 3, midY + totalH * 0.32 - 5, tw + 6, 11);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(lbl, midX, midY + totalH * 0.32);
    } else if (t.trapType === 'boulder' || t.trapType === 'boulder-2x2') {
      // 3D Shaded Stone Boulder Tile
      const radius = Math.min(totalW, totalH) * 0.42;

      // Drop shadow
      ctx.beginPath();
      ctx.ellipse(midX + 2, midY + 4, radius, radius * 0.85, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fill();

      // Spherical radial gradient
      const grad = ctx.createRadialGradient(midX - radius * 0.35, midY - radius * 0.35, radius * 0.08, midX, midY, radius);
      grad.addColorStop(0, "#e2e8f0");
      grad.addColorStop(0.25, "#94a3b8");
      grad.addColorStop(0.65, "#475569");
      grad.addColorStop(1, "#0f172a");

      ctx.beginPath();
      ctx.arc(midX, midY, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Stone fissures
      ctx.beginPath();
      ctx.moveTo(midX - radius * 0.4, midY - radius * 0.2);
      ctx.lineTo(midX - radius * 0.1, midY + radius * 0.1);
      ctx.lineTo(midX + radius * 0.3, midY - radius * 0.05);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t.trapType === 'boulder-2x2' ? "🪨 MEGA BOULDER" : "🪨 BOULDER", midX, midY + radius * 0.55);
    } else {
      // Standard traps
      const radius = cellW * 0.32;
      ctx.fillStyle = t.trapType === 'pit' ? '#dc2626' : (t.trapType === 'falling-block' ? '#ea580c' : '#7c3aed');
      ctx.beginPath();
      ctx.arc(midX, midY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const icon = t.trapType === 'pit' ? '🕳️' : (t.trapType === 'falling-block' ? '🧱' : (t.trapType === 'spear' ? '🗡️' : '☠️'));
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, midX, midY);
    }
    ctx.restore();
  });

  // 8. Draw Furniture (Multi-tile and authentic HeroQuest pieces)
  q.furniture.forEach(f => {
    const dims = getFurnitureDimensions(f);
    const fx = insetL + f.x * cellW;
    const fy = insetT + f.y * cellH;
    const totalW = dims.w * cellW;
    const totalH = dims.h * cellH;
    const midX = fx + totalW / 2;
    const midY = fy + totalH / 2;

    ctx.save();

    // Drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(fx + 3, fy + 3, totalW - 4, totalH - 4);

    const type = f.type || '';
    const furnImg = getFurnitureImage(type);

    if (furnImg) {
      // Authentic AI furniture texture
      ctx.drawImage(furnImg, fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "rgba(217, 119, 6, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      const furnName = (f.name || type.replace(/^furn(iture)?-/, '').replace(/_/g, ' ')).toUpperCase();
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(furnName).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - tw / 2 - 3, midY + totalH * 0.35 - 5, tw + 6, 11);
      ctx.fillStyle = "#fef08a";
      ctx.fillText(furnName, midX, midY + totalH * 0.35);
    } else if (type.startsWith('altar')) {
      // 🔮 Sorcerer's Altar / Desk (3x2 or 2x3)
      ctx.fillStyle = "#1e1b4b"; // Deep obsidian / dark purple
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#a855f7"; // Arcane purple border
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Arcane pentagram / summoning circle in center
      ctx.beginPath();
      ctx.arc(midX, midY, Math.min(totalW, totalH) * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(216, 180, 254, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Candles on the corners
      const cornerOffsets = [
        [fx + 8, fy + 8],
        [fx + totalW - 8, fy + 8],
        [fx + 8, fy + totalH - 8],
        [fx + totalW - 8, fy + totalH - 8]
      ];
      cornerOffsets.forEach(([cx, cy]) => {
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Grimoire & Skull icon in center
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📖 💀", midX, midY - 4);

      ctx.fillStyle = "#e9d5ff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("SORCERER'S ALTAR", midX, midY + 12);

    } else if (type.startsWith('bookcase')) {
      // 📚 Grand Bookcase (3x1 or 1x3)
      ctx.fillStyle = "#3f1704"; // Dark mahogany
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#d97706"; // Amber / gold frame
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Shelf lines and colored book spines
      const bookColors = ["#b91c1c", "#047857", "#1d4ed8", "#d97706", "#7c3aed", "#be123c", "#0284c7"];
      if (dims.w >= dims.h) {
        // Horizontal shelves (3x1)
        const numBooks = 12;
        const bWidth = (totalW - 12) / numBooks;
        for (let i = 0; i < numBooks; i++) {
          ctx.fillStyle = bookColors[i % bookColors.length];
          const bkX = fx + 6 + i * bWidth;
          const bkY = fy + 5;
          const bkH = totalH - 18;
          ctx.fillRect(bkX, bkY, bWidth - 1, bkH);
          // Gold ribbing on spine
          ctx.fillStyle = "rgba(254, 240, 138, 0.6)";
          ctx.fillRect(bkX, bkY + bkH * 0.3, bWidth - 1, 1);
          ctx.fillRect(bkX, bkY + bkH * 0.7, bWidth - 1, 1);
        }
        ctx.fillStyle = "#fef3c7";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📚 BOOKCASE", midX, fy + totalH - 6);
      } else {
        // Vertical shelves (1x3)
        for (let shelf = 0; shelf < 3; shelf++) {
          const sy = fy + shelf * (totalH / 3) + 4;
          for (let b = 0; b < 4; b++) {
            ctx.fillStyle = bookColors[(shelf * 4 + b) % bookColors.length];
            ctx.fillRect(fx + 6 + b * 6, sy, 5, (totalH / 3) - 8);
          }
        }
        ctx.fillStyle = "#fef3c7";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📚 BOOKCASE", midX, fy + totalH - 6);
      }

    } else if (type.startsWith('bookshelf')) {
      // 📖 Study Bookshelf (2x1, 1x2, or 1x1)
      ctx.fillStyle = "#78350f"; // Warm polished oak
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Book spines & scroll
      const bookColors = ["#1e40af", "#065f46", "#991b1b", "#b45309", "#581c87"];
      const count = dims.w >= 2 ? 8 : 4;
      const bWidth = (totalW - 10) / count;
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = bookColors[i % bookColors.length];
        ctx.fillRect(fx + 5 + i * bWidth, fy + 5, bWidth - 1, totalH - 16);
      }
      ctx.fillStyle = "#fef3c7";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📖 BOOKSHELF", midX, fy + totalH - 6);

    } else if (type.startsWith('boulder')) {
      // 🪨 Boulder Obstacle
      const radius = Math.min(totalW, totalH) * 0.42;
      const grad = ctx.createRadialGradient(midX - radius * 0.35, midY - radius * 0.35, radius * 0.08, midX, midY, radius);
      grad.addColorStop(0, "#e2e8f0");
      grad.addColorStop(0.3, "#64748b");
      grad.addColorStop(0.7, "#334155");
      grad.addColorStop(1, "#0f172a");

      ctx.beginPath();
      ctx.arc(midX, midY, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Fissures
      ctx.beginPath();
      ctx.moveTo(midX - radius * 0.4, midY - radius * 0.2);
      ctx.lineTo(midX - radius * 0.1, midY + radius * 0.1);
      ctx.lineTo(midX + radius * 0.3, midY - radius * 0.05);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪨 BOULDER", midX, midY + radius * 0.55);

    } else if (type.startsWith('table')) {
      // 🪵 Wooden Table / Council Desk (3x2 or 2x3)
      ctx.fillStyle = "#451a03"; // Dark oak
      ctx.fillRect(fx + 3, fy + 3, totalW - 6, totalH - 6);
      ctx.strokeStyle = "#92400e";
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 3, fy + 3, totalW - 6, totalH - 6);

      // Wood plank lines
      ctx.strokeStyle = "rgba(146, 64, 14, 0.4)";
      ctx.lineWidth = 1;
      const plankStep = (totalH - 8) / 4;
      for (let p = 1; p < 4; p++) {
        ctx.beginPath();
        ctx.moveTo(fx + 4, fy + 4 + p * plankStep);
        ctx.lineTo(fx + totalW - 4, fy + 4 + p * plankStep);
        ctx.stroke();
      }

      ctx.fillStyle = "#fef3c7";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪵 TABLE", midX, midY);

    } else if (type.startsWith('alchemists-bench')) {
      // 🧪 Alchemist's Bench (3x2)
      ctx.fillStyle = "#334155";
      ctx.fillRect(fx + 3, fy + 3, totalW - 6, totalH - 6);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 3, fy + 3, totalW - 6, totalH - 6);

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🧪 ⚗️ 📜", midX, midY - 4);

      ctx.fillStyle = "#bae6fd";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("ALCHEMIST'S BENCH", midX, midY + 12);

    } else if (type.startsWith('tomb')) {
      // 🪦 Stone Tomb / Sarcophagus (2x3 or 2x1)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(fx + 3, fy + 3, totalW - 6, totalH - 6);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 3, fy + 3, totalW - 6, totalH - 6);

      // Carved lid effigy
      ctx.strokeStyle = "rgba(203, 213, 225, 0.4)";
      ctx.strokeRect(fx + 7, fy + 7, totalW - 14, totalH - 14);

      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪦", midX, midY - 6);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("STONE TOMB", midX, midY + 12);

    } else if (type.startsWith('weapons-rack')) {
      // ⚔️ Weapons Rack (3x1)
      ctx.fillStyle = "#5c2b0c";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚔️ 🛡️ ⚔️", midX, midY - 4);

      ctx.fillStyle = "#ffedd5";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("WEAPONS RACK", midX, midY + 9);

    } else if (type.startsWith('fireplace')) {
      // 🔥 Stone Fireplace (3x1)
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔥 🔥 🔥", midX, midY - 3);

      ctx.fillStyle = "#ffedd5";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("FIREPLACE", midX, midY + 10);

    } else if (type.startsWith('cupboard')) {
      // 🚪 Cupboard (2x1)
      ctx.fillStyle = "#5c2b0c";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Dual doors
      ctx.beginPath();
      ctx.moveTo(midX, fy + 3);
      ctx.lineTo(midX, fy + totalH - 3);
      ctx.strokeStyle = "#291003";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🚪 CUPBOARD", midX, midY);

    } else {
      // Generic (Chest, Throne, Torture Rack, etc.)
      ctx.fillStyle = "rgba(120, 53, 15, 0.9)";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      let icon = '📦';
      if (type.startsWith('throne')) icon = '👑';
      else if (type.startsWith('chest')) icon = '📦';
      else if (type.startsWith('torture-rack')) icon = '⛓️';

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, midX, midY);
    }

    ctx.restore();
  });

  // 9. Draw Doors
  q.doors.forEach(d => {
    const d1x = insetL + d.from[0] * cellW + cellW / 2;
    const d1y = insetT + d.from[1] * cellH + cellH / 2;
    const d2x = insetL + d.to[0] * cellW + cellW / 2;
    const d2y = insetT + d.to[1] * cellH + cellH / 2;

    const midX = (d1x + d2x) / 2;
    const midY = (d1y + d2y) / 2;

    const isVert = d.from[1] === d.to[1];
    const img = (d.state === 'open') ? doorOpenImg : doorClosedImg;
    const sz = cellW * 0.85;

    if (img && img.complete && img.naturalWidth > 0 && d.state !== 'secret') {
      ctx.save();
      ctx.translate(midX, midY);
      if (isVert) {
        ctx.rotate(Math.PI / 2);
      }
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else {
      ctx.save();
      if (d.state === 'open') {
        ctx.fillStyle = "#22c55e";
        ctx.strokeStyle = "#86efac";
      } else if (d.state === 'secret') {
        ctx.fillStyle = "#a855f7";
        ctx.strokeStyle = "#d8b4fe";
      } else {
        ctx.fillStyle = "#b45309";
        ctx.strokeStyle = "#fde68a";
      }

      ctx.beginPath();
      ctx.arc(midX, midY, cellW * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const doorIcon = d.state === 'secret' ? '👁️' : (d.state === 'open' ? '🪟' : '🚪');
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(doorIcon, midX, midY);
      ctx.restore();
    }
  });

  // 10. Draw Monsters
  q.monsters.forEach(mEntity => {
    const mx = insetL + mEntity.x * cellW + cellW / 2;
    const my = insetT + mEntity.y * cellH + cellH / 2;
    const tx = insetL + mEntity.x * cellW;
    const ty = insetT + mEntity.y * cellH;

    ctx.save();
    const tokImg = getMonsterTokenImage(mEntity);
    if (tokImg) {
      ctx.drawImage(tokImg, tx + 1, ty + 1, cellW - 2, cellH - 2);
      if (mEntity.isBoss) {
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, cellW * 0.44, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = mEntity.isBoss ? "#b91c1c" : "#15803d";
      ctx.beginPath();
      ctx.arc(mx, my, cellW * 0.42, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = mEntity.isBoss ? "#facc15" : "#ffffff";
      ctx.lineWidth = mEntity.isBoss ? 2.5 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  });

  // 11. Draw Starting Stairs
  if (q.startingStairs) {
    const sx = insetL + q.startingStairs[0] * cellW;
    const sy = insetT + q.startingStairs[1] * cellH;
    const midX = sx + cellW / 2;
    const midY = sy + cellH / 2;

    ctx.save();
    const stImg = getTileImage('stairs');
    if (stImg) {
      // Drop shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(sx + 3, sy + 3, cellW - 4, cellH - 4);
      // AI Image
      ctx.drawImage(stImg, sx + 2, sy + 2, cellW - 4, cellH - 4);
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 2, sy + 2, cellW - 4, cellH - 4);
      // Label pill
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - 18, midY - 6, 36, 12);
      ctx.fillStyle = "#93c5fd";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STAIRS", midX, midY);
    } else {
      ctx.fillStyle = "#1e40af";
      ctx.beginPath();
      ctx.arc(midX, midY, cellW * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪜", midX, midY);
    }
    ctx.restore();
  }

  // 12. Draw Hover Cursor
  if (currentData.hoverSquare) {
    const hx = insetL + currentData.hoverSquare.col * cellW;
    const hy = insetT + currentData.hoverSquare.row * cellH;

    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 1, hy + 1, cellW - 2, cellH - 2);
    ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
    ctx.fillRect(hx + 1, hy + 1, cellW - 2, cellH - 2);
    ctx.restore();
  }

  // 13. Draw Selected Square
  if (currentData.selectedSquare) {
    const sx = insetL + currentData.selectedSquare.col * cellW;
    const sy = insetT + currentData.selectedSquare.row * cellH;

    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx, sy, cellW, cellH);
    ctx.restore();
  }
}

let deferredTabsRendered = false;
function scheduleDeferredTabRenders() {
  if (deferredTabsRendered) return;
  const renderAllDeferred = () => {
    if (deferredTabsRendered) return;
    deferredTabsRendered = true;
    if (typeof renderClassesTab === "function") renderClassesTab();
    if (typeof renderMonstersList === "function") renderMonstersList();
    if (typeof renderSpellsAndItems === "function") renderSpellsAndItems();
    if (typeof renderHeroesList === "function") renderHeroesList();
  };

  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(renderAllDeferred, { timeout: 300 });
  } else if (typeof setTimeout !== "undefined") {
    setTimeout(renderAllDeferred, 50);
  }
}

// Load KGraph Data and Map Configurations
async function initKGraphData() {
  setStatus("Initializing Tabletop RPG Studio...");
  try {
    // 1. Concurrently load map configurations and KGraph in parallel
    const [mapRes, res] = await Promise.all([
      (window.robosTabletop?.getMapConfigs ? window.robosTabletop.getMapConfigs() : Promise.resolve({ success: false })),
      (window.robosTabletop?.loadKGraph ? window.robosTabletop.loadKGraph() : Promise.resolve({ success: false }))
    ]);

    if (res && res.success) {
      currentData.tabletopNodes = res.tabletopNodes || [];
      currentData.gameNodes = res.gameNodes || [];
    }

    const mergedMapConfigs = new Map();
    DEFAULT_STUDIO_MAP_CONFIGS.forEach(c => mergedMapConfigs.set(c.id, { ...c }));
    if (mapRes && mapRes.success && Array.isArray(mapRes.configs)) {
      mapRes.configs.forEach(c => {
        if (c && c.id) {
          mergedMapConfigs.set(c.id, { ...(mergedMapConfigs.get(c.id) || {}), ...c });
        }
      });
    }
    if (Array.isArray(currentData.tabletopNodes)) {
      currentData.tabletopNodes.forEach(n => {
        const types = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        if (!types.includes("robos:TabletopMapConfiguration")) return;
        const id = String(n["@id"] || "").split(":").pop();
        if (!id || mergedMapConfigs.has(id)) return;
        mergedMapConfigs.set(id, {
          id,
          title: n["dcterms:title"] || id,
          boardSide: n["robos:boardSide"] || "Custom",
          gridDimensions: Array.isArray(n["robos:gridDimensions"]) ? n["robos:gridDimensions"] : [26, 19],
          backgroundImage: n["robos:backgroundImage"] || "res://assets/boards/heroquest_board.png"
        });
      });
    }
    currentData.mapConfigs = Array.from(mergedMapConfigs.values());
    const select = document.getElementById("map-config-select");
    const questBgSelect = document.getElementById("quest-bg-ref");
    const activeMapId = currentData.currentQuest?.mapConfigId || "heroquest-classic";
    [select, questBgSelect].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = "";
      currentData.mapConfigs.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.title} (${c.gridDimensions ? c.gridDimensions[0] + '×' + c.gridDimensions[1] : ''})`;
        if (c.id === activeMapId) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.value = activeMapId;
    });

    if (res && res.success) {

      // Restore any persisted robos:TabletopCampaign nodes from Knowledge Graph
      const kgraphCampaignNodes = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopCampaign") && (Array.isArray(n["robos:quests"]) || Boolean(n["robos:campaignId"]));
      });

      const kgraphHeroes = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopHero");
      });

      if (kgraphCampaignNodes.length > 0) {
        let activeLoadedIdx = -1;
        kgraphCampaignNodes.forEach(node => {
          const deserialized = deserializeCampaignFromKGraphNode(node);
          if (!deserialized) return;
          const existingIdx = currentData.campaigns.findIndex(c => c.id === deserialized.id);
          if (existingIdx !== -1) {
            currentData.campaigns[existingIdx] = deserialized;
            if (deserialized.isActiveCampaign) activeLoadedIdx = existingIdx;
          } else {
            currentData.campaigns.push(deserialized);
            if (deserialized.isActiveCampaign) activeLoadedIdx = currentData.campaigns.length - 1;
          }
        });
        const targetCampIdx = activeLoadedIdx >= 0
          ? activeLoadedIdx
          : Math.min(currentData.currentCampaignIndex || 0, currentData.campaigns.length - 1);
        currentData.currentCampaignIndex = targetCampIdx;
        currentData.campaign = currentData.campaigns[targetCampIdx];
      } else if (kgraphHeroes.length > 0 && currentData.campaigns[0]) {
        currentData.campaigns[0].heroes = kgraphHeroes;
      }
      currentData.heroes = currentData.campaign.heroes;

      currentData.monsters = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopMonster");
      });

      // Ensure every monster has a category (default "Base Game"), base enemy class, mindPoints, and abilities
      initClassesCatalog();
      currentData.monsters.forEach(m => {
        if (!m["robos:category"]) m["robos:category"] = "Base Game";
        const baseClsName = m["robos:extendsClass"] || m["robos:monsterArchetype"] || m["robos:archetype"] || "Goblin";
        m["robos:extendsClass"] = baseClsName;
        const clsObj = getClassByIdOrName(baseClsName);
        if (m["robos:mindPoints"] === undefined) {
          m["robos:mindPoints"] = clsObj ? clsObj.mindPoints : (m["robos:isUndead"] ? 0 : 2);
        }
        if (!m["robos:abilities"] && clsObj) {
          m["robos:abilities"] = clsObj.abilities;
        }
      });
      MIDTERMS_2026_MONSTERS.forEach(mm => {
        if (!currentData.monsters.some(m => m["@id"] === mm["@id"])) {
          const baseClsName = mm["robos:extendsClass"] || mm["robos:monsterArchetype"] || mm["robos:archetype"] || "Goblin";
          const clsObj = getClassByIdOrName(baseClsName);
          currentData.monsters.push({
            ...mm,
            "robos:extendsClass": baseClsName,
            "robos:mindPoints": mm["robos:mindPoints"] !== undefined ? mm["robos:mindPoints"] : (clsObj ? clsObj.mindPoints : 2),
            "robos:abilities": mm["robos:abilities"] || (clsObj ? clsObj.abilities : "")
          });
        }
      });

      currentData.spells = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopSpellCard");
      });

      currentData.furniture = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopFurniture");
      });

      // Initialize Category Catalogs (Weapons, Items, Spells, Dread Spells, Categories)
      syncCategoryCatalogsFromKGraph();

      setupCategoryControls();
      setupClassEditorControls();
      setupHeroEditorControls();
      setupMonsterEditorControls();
      setupSpellDraftControls();
      setupHeroTradeControls();
      setupCampaignQuestControls();
      initColumnResizers();

      applySpellAllocationToHeroes();
      renderCategoryControlsUI();
      renderSpellDraftSummaryBadges();
      syncBoardMonsterSelectDropdown();
      syncHeroPresetItemsDropdown();

      // Render Active Tab View (Campaign & Quest) Immediately
      renderCampaignSelectorUI();
      if (currentData.campaign.quests && currentData.campaign.quests.length > 0) {
        await selectQuest(currentData.currentQuestIndex || 0, true);
      } else {
        currentData.currentQuestIndex = -1;
        currentData.currentQuest = null;
        renderCampaignQuestsList();
        applyEmptyQuestEditorUI();
      }

      // Lazily schedule background rendering for inactive tabs so initial load paints instantly
      scheduleDeferredTabRenders();
    }

    initBoard();
    setStatus("Tabletop RPG Studio Ready — Loaded HeroQuest campaign (custom-quest.cartridge).");
  } catch (err) {
    setStatus("Failed to initialize: " + err.message);
  }
}

// ==========================================
// 1.5. ELEMENTAL SPELL DRAFT, CATEGORIES & GRIMOIRE ENGINE
// ==========================================

const DEFAULT_CATEGORIES = ["Base Game", "Midterms 2026"];

const ELEMENTAL_DECKS = {
  earth: {
    id: "earth",
    name: "Earth Magic",
    icon: "🪨",
    role: "Defense & Healing",
    badgeClass: "tag-earth",
    color: "#eab308",
    spells: [
      {
        id: "urn:robos:tabletop:spell:heal-body",
        slug: "heal-body",
        name: "Heal Body",
        element: "earth",
        category: "Base Game",
        icon: "💖",
        description: "Restores up to 4 lost Body Points to any Hero, including yourself.",
        effect: "heal-bp",
        val: 4
      },
      {
        id: "urn:robos:tabletop:spell:pass-through-rock",
        slug: "pass-through-rock",
        name: "Pass Through Rock",
        element: "earth",
        category: "Base Game",
        icon: "🧱",
        description: "Allows the caster or ally to move through solid stone walls on their next turn.",
        effect: "phase-walls",
        val: 1
      },
      {
        id: "urn:robos:tabletop:spell:rock-skin",
        slug: "rock-skin",
        name: "Rock Skin",
        element: "earth",
        category: "Base Game",
        icon: "🛡️",
        description: "Hardens the caster's skin, granting +1 extra Combat Defend Die until damaged.",
        effect: "buff-def",
        val: 1
      }
    ]
  },
  fire: {
    id: "fire",
    name: "Fire Magic",
    icon: "🔥",
    role: "Direct Damage & Buffs",
    badgeClass: "tag-fire",
    color: "#ef4444",
    spells: [
      {
        id: "urn:robos:tabletop:spell:ball-of-flame",
        slug: "ball-of-flame",
        name: "Ball of Flame",
        element: "fire",
        category: "Base Game",
        icon: "☄️",
        description: "Hurls a blazing sphere dealing 2 BP damage. Target defends with 2 dice.",
        effect: "damage-bp",
        val: 2
      },
      {
        id: "urn:robos:tabletop:spell:courage",
        slug: "courage",
        name: "Courage",
        element: "fire",
        category: "Base Game",
        icon: "🦁",
        description: "Fills a hero with magical bravado, granting +2 extra Combat Attack Dice until no monsters remain.",
        effect: "buff-atk",
        val: 2
      },
      {
        id: "urn:robos:tabletop:spell:fire-of-wrath",
        slug: "fire-of-wrath",
        name: "Fire of Wrath",
        element: "fire",
        category: "Base Game",
        icon: "🔥",
        description: "Strikes any visible monster with darts of flame, causing 1 BP damage. Target defends with 1 die.",
        effect: "damage-bp",
        val: 1
      }
    ]
  },
  water: {
    id: "water",
    name: "Water Magic",
    icon: "💧",
    role: "Restoration & Stealth",
    badgeClass: "tag-water",
    color: "#06b6d4",
    spells: [
      {
        id: "urn:robos:tabletop:spell:water-of-healing",
        slug: "water-of-healing",
        name: "Water of Healing",
        element: "water",
        category: "Base Game",
        icon: "💧",
        description: "Restores up to 4 lost Body Points to any Hero.",
        effect: "heal-bp",
        val: 4
      },
      {
        id: "urn:robos:tabletop:spell:sleep",
        slug: "sleep",
        name: "Sleep",
        element: "water",
        category: "Base Game",
        icon: "💤",
        description: "Puts a monster into magical slumber. It cannot move or attack until it rolls a 6 to wake up.",
        effect: "status-sleep",
        val: 1
      },
      {
        id: "urn:robos:tabletop:spell:veil-of-mist",
        slug: "veil-of-mist",
        name: "Veil of Mist",
        element: "water",
        category: "Base Game",
        icon: "🌫️",
        description: "Envelops the caster in thick fog, allowing movement unseen past monsters.",
        effect: "status-stealth",
        val: 1
      }
    ]
  },
  air: {
    id: "air",
    name: "Air Magic",
    icon: "🌪️",
    role: "Speed & Summons",
    badgeClass: "tag-air",
    color: "#a855f7",
    spells: [
      {
        id: "urn:robos:tabletop:spell:genie",
        slug: "genie",
        name: "Genie",
        element: "air",
        category: "Base Game",
        icon: "🧞",
        description: "Summons an ancient djinn to attack any visible monster with 5 combat dice, or to open any locked door.",
        effect: "summon-attack",
        val: 5
      },
      {
        id: "urn:robos:tabletop:spell:swift-wind",
        slug: "swift-wind",
        name: "Swift Wind",
        element: "air",
        category: "Base Game",
        icon: "💨",
        description: "Bestows the speed of the tempest, allowing the hero to roll double movement dice (4d6).",
        effect: "buff-move",
        val: 2
      },
      {
        id: "urn:robos:tabletop:spell:tempest",
        slug: "tempest",
        name: "Tempest",
        element: "air",
        category: "Base Game",
        icon: "🌪️",
        description: "Creates a localized vortex trapping a monster for 1 turn. It misses its next turn.",
        effect: "status-freeze",
        val: 1
      }
    ]
  }
};

// Authentic HeroQuest Chaos & Dread Spells (Base Game Enemies & Evil Sorcerers)
const DREAD_SPELLS = [
  {
    id: "urn:robos:tabletop:spell:lightning-bolt",
    slug: "lightning-bolt",
    name: "Lightning Bolt",
    element: "dread",
    category: "Base Game",
    icon: "⚡",
    description: "Strikes any hero with a bolt of dark lightning causing 2 BP damage. Target rolls 2 combat dice to defend.",
    effect: "damage-bp",
    val: 2
  },
  {
    id: "urn:robos:tabletop:spell:firestorm",
    slug: "firestorm",
    name: "Firestorm",
    element: "dread",
    category: "Base Game",
    icon: "🔥",
    description: "Engulfs a hero or entire room in searing hellfire causing 3 BP damage. Target rolls 3 combat dice to defend.",
    effect: "damage-bp",
    val: 3
  },
  {
    id: "urn:robos:tabletop:spell:fear",
    slug: "fear",
    name: "Fear",
    element: "dread",
    category: "Base Game",
    icon: "💀",
    description: "Paralyzes a hero with terror, reducing their Attack Strength to 1 combat die on their next turn.",
    effect: "debuff-atk",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:sleep-dread",
    slug: "sleep-dread",
    name: "Sleep of Dread",
    element: "dread",
    category: "Base Game",
    icon: "💤",
    description: "Puts a hero into deep magical slumber. They cannot move, attack, or defend until rolling a 6 or taking damage.",
    effect: "status-sleep",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:cloud-of-chaos",
    slug: "cloud-of-chaos",
    name: "Cloud of Chaos",
    element: "dread",
    category: "Base Game",
    icon: "🕸️",
    description: "Releases a suffocating cloud of toxic chaos vapors. Target hero is stunned and loses their entire next turn.",
    effect: "status-freeze",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:summon-undead",
    slug: "summon-undead",
    name: "Summon Undead",
    element: "dread",
    category: "Base Game",
    icon: "🧟",
    description: "Raises 2 Skeletons or Zombies from the dungeon floor adjacent to the caster to fight alongside them.",
    effect: "summon-monsters",
    val: 2
  },
  {
    id: "urn:robos:tabletop:spell:rust",
    slug: "rust",
    name: "Rust",
    element: "dread",
    category: "Base Game",
    icon: "🛡️",
    description: "Corrodes and destroys one metal weapon or helmet equipped by a target hero, reducing their combat stats.",
    effect: "destroy-equipment",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:escape",
    slug: "escape",
    name: "Escape",
    element: "dread",
    category: "Base Game",
    icon: "💨",
    description: "Dissolves the evil sorcerer into dark mist, teleporting them instantly to another room or safety.",
    effect: "teleport",
    val: 1
  }
];

// ==========================================
// "MIDTERMS 2026" & "BASE GAME" CONTENT PACK CATALOGS
// ==========================================

const HEROQUEST_MONSTER_ARCHETYPES = [
  "Goblin",
  "Orc",
  "Fimir",
  "Skeleton",
  "Zombie",
  "Mummy",
  "Dread Warrior",
  "Gargoyle",
  "Orc Shaman",
  "Orc Warlord",
  "Chaos Sorcerer",
  "Witch Lord",
  "Dragon",
  "Doomguard",
  "Witch Hand"
];

const MIDTERMS_2026_MONSTERS = [
  {
    "@id": "urn:robos:tabletop:monster:campaign-volunteer",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Campaign Volunteer",
    "dcterms:description": "Replaces Goblin · Door Knocker: Move through other monsters.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:goblin",
    "robos:replaces": "Goblin",
    "robos:monsterArchetype": "Goblin",
    "robos:archetype": "Goblin",
    "robos:specialAbility": "Door Knocker: Move through other monsters",
    "robos:abilities": "Door Knocker: Move through other monsters",
    "robos:icon": "📋",
    "robos:tokenAsset": "res://assets/tokens/token_campaign_volunteer.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_campaign_volunteer.png",
    "robos:bodyPoints": 1,
    "robos:mindPoints": 1,
    "robos:attackDice": 2,
    "robos:defendDice": 1,
    "robos:movementSquares": 10,
    "robos:roomId": "room-center-mid",
    "robos:isBoss": false,
    "robos:isUndead": false,
    "robos:isSpellcaster": false,
    "robos:spells": [],
    "robos:tokenColor": "#16a34a",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:political-operative",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Political Operative",
    "dcterms:description": "Replaces Orc · Smear Campaign: Force reroll of one successful defend die, once per encounter.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:orc",
    "robos:replaces": "Orc",
    "robos:monsterArchetype": "Orc",
    "robos:archetype": "Orc",
    "robos:specialAbility": "Smear Campaign: Force reroll of one successful defend die, once per encounter",
    "robos:abilities": "Smear Campaign: Force reroll of one successful defend die, once per encounter",
    "robos:icon": "🕵️",
    "robos:tokenAsset": "res://assets/tokens/token_political_operative.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_political_operative.png",
    "robos:bodyPoints": 1,
    "robos:mindPoints": 2,
    "robos:attackDice": 3,
    "robos:defendDice": 2,
    "robos:movementSquares": 8,
    "robos:roomId": "room-nw-crypt",
    "robos:isBoss": false,
    "robos:isUndead": false,
    "robos:isSpellcaster": false,
    "robos:spells": [],
    "robos:tokenColor": "#ca8a04",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:career-politician",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Career Politician",
    "dcterms:description": "Replaces Skeleton · Reelection: On death, black shield resurrects with 1 Body Point.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:skeleton",
    "robos:replaces": "Skeleton",
    "robos:monsterArchetype": "Skeleton",
    "robos:archetype": "Skeleton",
    "robos:specialAbility": "Reelection: On death, black shield resurrects with 1 Body Point",
    "robos:abilities": "Reelection: On death, black shield resurrects with 1 Body Point",
    "robos:icon": "🏛️",
    "robos:tokenAsset": "res://assets/tokens/token_career_politician.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_career_politician.png",
    "robos:bodyPoints": 1,
    "robos:mindPoints": 0,
    "robos:attackDice": 2,
    "robos:defendDice": 2,
    "robos:movementSquares": 6,
    "robos:roomId": "room-nw-crypt",
    "robos:isBoss": false,
    "robos:isUndead": true,
    "robos:isSpellcaster": false,
    "robos:spells": [],
    "robos:tokenColor": "#94a3b8",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:bureaucrat",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Bureaucrat",
    "dcterms:description": "Replaces Zombie · Red Tape: Adjacent heroes roll an extra movement die and use the lowest.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:zombie",
    "robos:replaces": "Zombie",
    "robos:monsterArchetype": "Zombie",
    "robos:archetype": "Zombie",
    "robos:specialAbility": "Red Tape: Adjacent heroes roll an extra movement die and use the lowest",
    "robos:abilities": "Red Tape: Adjacent heroes roll an extra movement die and use the lowest",
    "robos:icon": "📎",
    "robos:tokenAsset": "res://assets/tokens/token_bureaucrat.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_bureaucrat.png",
    "robos:bodyPoints": 1,
    "robos:mindPoints": 0,
    "robos:attackDice": 2,
    "robos:defendDice": 3,
    "robos:movementSquares": 4,
    "robos:roomId": "room-sw-cellar",
    "robos:isBoss": false,
    "robos:isUndead": true,
    "robos:isSpellcaster": false,
    "robos:spells": [],
    "robos:tokenColor": "#475569",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:lobbyist",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Lobbyist",
    "dcterms:description": "Replaces Mummy · Bought Influence: Force reroll of one attacking skull, once per encounter.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:mummy",
    "robos:replaces": "Mummy",
    "robos:monsterArchetype": "Mummy",
    "robos:archetype": "Mummy",
    "robos:specialAbility": "Bought Influence: Force reroll of one attacking skull, once per encounter",
    "robos:abilities": "Bought Influence: Force reroll of one attacking skull, once per encounter",
    "robos:icon": "💼",
    "robos:tokenAsset": "res://assets/tokens/token_lobbyist.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_lobbyist.png",
    "robos:bodyPoints": 2,
    "robos:mindPoints": 0,
    "robos:attackDice": 3,
    "robos:defendDice": 4,
    "robos:movementSquares": 4,
    "robos:roomId": "room-nw-crypt",
    "robos:isBoss": false,
    "robos:isUndead": true,
    "robos:isSpellcaster": false,
    "robos:spells": [],
    "robos:tokenColor": "#d97706",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:partisan-enforcer",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Partisan Enforcer",
    "dcterms:description": "Replaces Dread Warrior · Polarization: +1 attack die when adjacent to another Partisan Enforcer.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:chaos-warrior",
    "robos:replaces": "Dread Warrior",
    "robos:monsterArchetype": "Dread Warrior",
    "robos:archetype": "Dread Warrior",
    "robos:specialAbility": "Polarization: +1 attack die when adjacent to another Partisan Enforcer",
    "robos:abilities": "Polarization: +1 attack die when adjacent to another Partisan Enforcer",
    "robos:icon": "⚔️",
    "robos:tokenAsset": "res://assets/tokens/token_partisan_enforcer.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_partisan_enforcer.png",
    "robos:bodyPoints": 3,
    "robos:mindPoints": 3,
    "robos:attackDice": 4,
    "robos:defendDice": 4,
    "robos:movementSquares": 7,
    "robos:roomId": "room-e-parlor",
    "robos:isBoss": false,
    "robos:isUndead": false,
    "robos:isSpellcaster": false,
    "robos:spells": [],
    "robos:tokenColor": "#dc2626",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:super-pac-demon",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Super PAC Demon",
    "dcterms:description": "Replaces Gargoyle · Dark Money: Summon one Campaign Volunteer, once per encounter.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:gargoyle",
    "robos:replaces": "Gargoyle",
    "robos:monsterArchetype": "Gargoyle",
    "robos:archetype": "Gargoyle",
    "robos:specialAbility": "Dark Money: Summon one Campaign Volunteer, once per encounter",
    "robos:abilities": "Dark Money: Summon one Campaign Volunteer, once per encounter",
    "robos:icon": "😈",
    "robos:tokenAsset": "res://assets/tokens/token_super_pac_demon.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_super_pac_demon.png",
    "robos:bodyPoints": 3,
    "robos:mindPoints": 4,
    "robos:attackDice": 4,
    "robos:defendDice": 5,
    "robos:movementSquares": 6,
    "robos:roomId": "room-center",
    "robos:isBoss": false,
    "robos:isUndead": false,
    "robos:isSpellcaster": false,
    "robos:spells": [],
    "robos:tokenColor": "#7c3aed",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:spin-doctor",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Spin Doctor",
    "dcterms:description": "Replaces Dread Sorcerer · Alternative Facts: Cancel one successful attack, once per encounter.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:chaos-sorcerer",
    "robos:replaces": "Dread Sorcerer",
    "robos:monsterArchetype": "Chaos Sorcerer",
    "robos:archetype": "Dread Sorcerer",
    "robos:specialAbility": "Alternative Facts: Cancel one successful attack, once per encounter",
    "robos:abilities": "Alternative Facts: Cancel one successful attack, once per encounter",
    "robos:icon": "🌀",
    "robos:tokenAsset": "res://assets/tokens/token_spin_doctor.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_spin_doctor.png",
    "robos:bodyPoints": 3,
    "robos:mindPoints": 5,
    "robos:attackDice": 3,
    "robos:defendDice": 4,
    "robos:movementSquares": 7,
    "robos:roomId": "room-center",
    "robos:isBoss": false,
    "robos:isUndead": false,
    "robos:isSpellcaster": true,
    "robos:spells": [
      "urn:robos:tabletop:spell:recount-of-the-damned"
    ],
    "robos:tokenColor": "#0284c7",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:talarixon",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Talarixon (Talarico + Paxton · Texas Hydra)",
    "dcterms:description": "Talarico + Paxton · Texas Hydra Boss (Move 7, Attack 5, Defend 5, Body 6, Mind 5). Special Abilities: Holy Smite (Attack a visible hero with 3 dice) · Indictment Barrage (Hero rolls movement die; 1–3 loses next action) · Divided Authority (Once per battle, loses its turn but attacks all adjacent heroes with 2 dice). Universal Hydra Rule — Political Infighting: At half starting Body Points or fewer, roll a combat die at start of turn; on a white shield, heroes choose which available special attack it uses.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:dragon",
    "robos:replaces": "Texas Hydra Boss",
    "robos:monsterArchetype": "Hydra Boss",
    "robos:archetype": "Texas Hydra",
    "robos:specialAbility": "Holy Smite (3 dice ranged) · Indictment Barrage (1–3 loses action) · Divided Authority (lose turn, 2 dice to all adjacent) · Political Infighting",
    "robos:abilities": "Holy Smite: Attack a visible hero with 3 dice. | Indictment Barrage: Hero rolls movement die; 1–3 loses next action. | Divided Authority: Once per battle, loses its turn but attacks all adjacent heroes with 2 dice. | Political Infighting (<=3 BP): White shield lets heroes choose special attack.",
    "robos:icon": "🐍",
    "robos:tokenAsset": "res://assets/tokens/token_talarixon.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_talarixon.png",
    "robos:bodyPoints": 6,
    "robos:mindPoints": 5,
    "robos:attackDice": 5,
    "robos:defendDice": 5,
    "robos:movementSquares": 7,
    "robos:roomId": "room-nw-10",
    "robos:isBoss": true,
    "robos:isUndead": false,
    "robos:isSpellcaster": true,
    "robos:spells": [
      "urn:robos:tabletop:spell:recount-of-the-damned"
    ],
    "robos:tokenColor": "#b91c1c",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:el-rogers",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "El-Rogers (El-Sayed + Rogers · Michigan Hydra)",
    "dcterms:description": "El-Sayed + Rogers · Michigan Hydra Boss (Move 6, Attack 5, Defend 6, Body 7, Mind 4). Special Abilities: Universal Healing (Recover 2 Body Points once per battle) · Security Lockdown (Seal room doors for one round) · Industrial Collapse (At 3 Body Points, attack all adjacent heroes with 3 dice, then lose 1 Body Point). Universal Hydra Rule — Political Infighting: At half starting Body Points or fewer, roll a combat die at start of turn; on a white shield, heroes choose which available special attack it uses.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:witch-lord",
    "robos:replaces": "Michigan Hydra Boss",
    "robos:monsterArchetype": "Hydra Boss",
    "robos:archetype": "Michigan Hydra",
    "robos:specialAbility": "Universal Healing (+2 BP once) · Security Lockdown (seal doors 1 round) · Industrial Collapse (at 3 BP, 3 dice to adjacent & -1 BP) · Political Infighting",
    "robos:abilities": "Universal Healing: Recover 2 Body Points once per battle. | Security Lockdown: Seal room doors for one round. | Industrial Collapse: At 3 Body Points, attack all adjacent heroes with 3 dice, then lose 1 Body Point. | Political Infighting (<=3 BP): White shield lets heroes choose special attack.",
    "robos:icon": "🐲",
    "robos:tokenAsset": "res://assets/tokens/token_el_rogers.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_el_rogers.png",
    "robos:bodyPoints": 7,
    "robos:mindPoints": 4,
    "robos:attackDice": 5,
    "robos:defendDice": 6,
    "robos:movementSquares": 6,
    "robos:roomId": "room-center",
    "robos:isBoss": true,
    "robos:isUndead": false,
    "robos:isSpellcaster": true,
    "robos:spells": [
      "urn:robos:tabletop:spell:recount-of-the-damned"
    ],
    "robos:tokenColor": "#1d4ed8",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  },
  {
    "@id": "urn:robos:tabletop:monster:brownsted",
    "@type": ["oslc_am:Resource", "robos:TabletopMonster", "robos:GameMonster", "schema:Person"],
    "dcterms:title": "Brownsted (Brown + Husted · Ohio Hydra)",
    "dcterms:description": "Brown + Husted · Ohio Hydra Boss (Move 5, Attack 6, Defend 5, Body 8, Mind 5). Special Abilities: Union Strike (Attack every adjacent hero with 3 dice) · Budget Freeze (Prevent heroes using potions for one round) · Bipartisan Gridlock (Roll combat die each turn: Black shield = lose turn; skull = +1 attack die). Universal Hydra Rule — Political Infighting: At half starting Body Points or fewer, roll a combat die at start of turn; on a white shield, heroes choose which available special attack it uses.",
    "robos:category": "Midterms 2026",
    "robos:mirrorsMonster": "urn:robos:tabletop:monster:verag-orc-warlord",
    "robos:replaces": "Ohio Hydra Boss",
    "robos:monsterArchetype": "Hydra Boss",
    "robos:archetype": "Ohio Hydra",
    "robos:specialAbility": "Union Strike (3 dice to all adjacent) · Budget Freeze (no potions 1 round) · Bipartisan Gridlock (black shield = lose turn, skull = +1 atk) · Political Infighting",
    "robos:abilities": "Union Strike: Attack every adjacent hero with 3 dice. | Budget Freeze: Prevent heroes using potions for one round. | Bipartisan Gridlock: Roll combat die each turn. Black shield = lose turn; skull = +1 attack die. | Political Infighting (<=4 BP): White shield lets heroes choose special attack.",
    "robos:icon": "🐉",
    "robos:tokenAsset": "res://assets/tokens/token_brownsted.png",
    "robos:portraitAsset": "res://assets/monster_cards/card_bg_brownsted.png",
    "robos:bodyPoints": 8,
    "robos:mindPoints": 5,
    "robos:attackDice": 6,
    "robos:defendDice": 5,
    "robos:movementSquares": 5,
    "robos:roomId": "room-center",
    "robos:isBoss": true,
    "robos:isUndead": false,
    "robos:isSpellcaster": true,
    "robos:spells": [
      "urn:robos:tabletop:spell:recount-of-the-damned"
    ],
    "robos:tokenColor": "#9333ea",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  }
];

const MIDTERMS_2026_SPELLS = [
  // Fire — Campaign Chaos
  {
    id: "urn:robos:tabletop:spell:attack-ad",
    slug: "attack-ad",
    name: "Attack Ad",
    element: "fire",
    subtheme: "Campaign Chaos",
    category: "Midterms 2026",
    icon: "📺",
    description: "Fire — Campaign Chaos: Attack one visible monster with 2 combat dice.",
    effect: "damage-dice",
    val: 2
  },
  {
    id: "urn:robos:tabletop:spell:outrage-inferno",
    slug: "outrage-inferno",
    name: "Outrage Inferno",
    element: "fire",
    subtheme: "Campaign Chaos",
    category: "Midterms 2026",
    icon: "🔥",
    description: "Fire — Campaign Chaos: Every monster in the room rolls 1 combat die; skull = 1 damage.",
    effect: "room-damage-dice",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:october-surprise",
    slug: "october-surprise",
    name: "October Surprise",
    element: "fire",
    subtheme: "Campaign Chaos",
    category: "Midterms 2026",
    icon: "💣",
    description: "Fire — Campaign Chaos: Hero makes an additional attack with +2 attack dice.",
    effect: "buff-atk",
    val: 2
  },
  // Water — Bureaucracy
  {
    id: "urn:robos:tabletop:spell:filibuster",
    slug: "filibuster",
    name: "Filibuster",
    element: "water",
    subtheme: "Bureaucracy",
    category: "Midterms 2026",
    icon: "⏳",
    description: "Water — Bureaucracy: Monster loses next turn unless it rolls 5–6 on one movement die.",
    effect: "status-sleep",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:executive-privilege",
    slug: "executive-privilege",
    name: "Executive Privilege",
    element: "water",
    subtheme: "Bureaucracy",
    category: "Midterms 2026",
    icon: "🛡️",
    description: "Water — Bureaucracy: Hero ignores all damage from the next damaging attack.",
    effect: "buff-ignore-damage",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:emergency-funding",
    slug: "emergency-funding",
    name: "Emergency Funding",
    element: "water",
    subtheme: "Bureaucracy",
    category: "Midterms 2026",
    icon: "💉",
    description: "Water — Bureaucracy: Restore up to 4 lost Body Points.",
    effect: "heal-bp",
    val: 4
  },
  // Earth — Establishment
  {
    id: "urn:robos:tabletop:spell:incumbent-protection",
    slug: "incumbent-protection",
    name: "Incumbent Protection",
    element: "earth",
    subtheme: "Establishment",
    category: "Midterms 2026",
    icon: "🏰",
    description: "Earth — Establishment: Hero gains +2 defend dice until suffering damage.",
    effect: "buff-def",
    val: 2
  },
  {
    id: "urn:robos:tabletop:spell:special-interest-donation",
    slug: "special-interest-donation",
    name: "Special Interest Donation",
    element: "earth",
    subtheme: "Establishment",
    category: "Midterms 2026",
    icon: "💰",
    description: "Earth — Establishment: Gain 100 gold, or 50 if a monster is visible.",
    effect: "grant-gold",
    val: 100
  },
  {
    id: "urn:robos:tabletop:spell:gerrymander",
    slug: "gerrymander",
    name: "Gerrymander",
    element: "earth",
    subtheme: "Establishment",
    category: "Midterms 2026",
    icon: "🗺️",
    description: "Earth — Establishment: Relocate one visible monster up to 4 legal squares.",
    effect: "relocate-monster",
    val: 4
  },
  // Air — Public Opinion
  {
    id: "urn:robos:tabletop:spell:polling-surge",
    slug: "polling-surge",
    name: "Polling Surge",
    element: "air",
    subtheme: "Public Opinion",
    category: "Midterms 2026",
    icon: "📈",
    description: "Air — Public Opinion: Double next movement roll.",
    effect: "buff-move",
    val: 2
  },
  {
    id: "urn:robos:tabletop:spell:media-frenzy",
    slug: "media-frenzy",
    name: "Media Frenzy",
    element: "air",
    subtheme: "Public Opinion",
    category: "Midterms 2026",
    icon: "🎙️",
    description: "Air — Public Opinion: Monster loses next turn; Mind 4+ may resist on a 6.",
    effect: "status-freeze",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:landslide-victory",
    slug: "landslide-victory",
    name: "Landslide Victory",
    element: "air",
    subtheme: "Public Opinion",
    category: "Midterms 2026",
    icon: "🌊",
    description: "Air — Public Opinion: Attack one visible monster with 5 combat dice.",
    effect: "damage-dice",
    val: 5
  }
];

const MIDTERMS_2026_DREAD_SPELLS = [
  {
    id: "urn:robos:tabletop:spell:recount-of-the-damned",
    slug: "recount-of-the-damned",
    name: "Recount of the Damned",
    element: "dread",
    category: "Midterms 2026",
    icon: "🗳️",
    description: "Forbidden Dread Spell: All heroes in one room roll one movement die. On 1–3, they lose their next action.",
    effect: "room-lose-action",
    val: 3
  }
];

const BASE_WEAPONS = [
  { id: "urn:robos:tabletop:weapon:broadsword", name: "Broadsword", type: "Weapon", dice: "3 Attack Dice", cost: "250 GP", icon: "⚔️", category: "Base Game", description: "Standard Imperial steel broadsword rolling 3 combat dice." },
  { id: "urn:robos:tabletop:weapon:shortsword", name: "Shortsword", type: "Weapon", dice: "2 Attack Dice (Diagonal)", cost: "150 GP", icon: "🗡️", category: "Base Game", description: "Balanced blade capable of striking adjacent and diagonal foes." },
  { id: "urn:robos:tabletop:weapon:battle-axe", name: "Battle Axe", type: "Weapon", dice: "4 Attack Dice (Two-Handed)", cost: "400 GP", icon: "🪓", category: "Base Game", description: "Heavy two-handed greataxe rolling 4 combat dice (cannot use shield)." },
  { id: "urn:robos:tabletop:weapon:crossbow", name: "Crossbow", type: "Ranged Weapon", dice: "3 Attack Dice (Straight Line)", cost: "350 GP", icon: "🏹", category: "Base Game", description: "Heavy ranged arbalest striking any visible monster in line of sight." },
  { id: "urn:robos:tabletop:weapon:chainmail", name: "Chainmail", type: "Armor", dice: "+1 Defend Die (3 Total)", cost: "500 GP", icon: "🛡️", category: "Base Game", description: "Linked steel rings granting 3 total defend dice." },
  { id: "urn:robos:tabletop:weapon:plate-armor", name: "Plate Armor", type: "Armor", dice: "+2 Defend Dice (4 Total, 1d6 Move)", cost: "850 GP", icon: "🦾", category: "Base Game", description: "Heavy full-plate armor granting 4 defend dice but reducing movement to 1d6." },
  { id: "urn:robos:tabletop:weapon:shield", name: "Shield", type: "Armor", dice: "+1 Defend Die", cost: "150 GP", icon: "🛡️", category: "Base Game", description: "Sturdy oak-and-iron shield granting +1 extra defend die." },
  { id: "urn:robos:tabletop:weapon:helmet", name: "Helmet", type: "Armor", dice: "+1 Defend Die", cost: "120 GP", icon: "🪖", category: "Base Game", description: "Steel battle helm granting +1 extra defend die." },
  { id: "urn:robos:tabletop:weapon:toolkit", name: "Toolkit", type: "Gear", dice: "Disarm Traps on 1-5", cost: "250 GP", icon: "🔧", category: "Base Game", description: "Precision picks and wedges allowing any hero to disarm traps." }
];

const MIDTERMS_2026_WEAPONS = [
  {
    id: "urn:robos:tabletop:weapon:unapproved-bombing-run",
    name: "Unapproved Foreign Bombing Run",
    type: "Illegal Presidential Act (Ranged)",
    dice: "4 Attack Dice (Zero Congressional Approval)",
    cost: "500 GP",
    icon: "💣",
    category: "Midterms 2026",
    description: "Who needs a pesky declaration of war from Congress when both parties just call it a 'limited kinetic military operation' over brunch?"
  },
  {
    id: "urn:robos:tabletop:weapon:classified-bathroom-box",
    name: "Classified Bathroom Bankers Box Flail",
    type: "Illegal Presidential Act (Melee)",
    dice: "3 Attack Dice (Stored Next to Bathroom Chandelier)",
    cost: "350 GP",
    icon: "📦",
    category: "Midterms 2026",
    description: "A heavy cardboard box stuffed with Top Secret nuclear folders found stacked between a country-club bathroom and a classic Corvette in the garage."
  },
  {
    id: "urn:robos:tabletop:weapon:midnight-pardon-gavel",
    name: "Midnight Blanket Pardon Gavel",
    type: "Illegal Presidential Act (Relic)",
    dice: "3 Attack Dice (Absolves All Cronies & Family)",
    cost: "450 GP",
    icon: "🔨",
    category: "Midterms 2026",
    description: "Signed at 11:59 PM on the way to Marine One! Retroactively wipes out a decade of questionable felonies for donors, friends, and relatives."
  },
  {
    id: "urn:robos:tabletop:weapon:executive-order-overreach-pen",
    name: "Unconstitutional Executive Order Sharpie",
    type: "Illegal Presidential Act (Wand)",
    dice: "3 Attack Dice (Bypasses Checks & Balances)",
    cost: "300 GP",
    icon: "🖊️",
    category: "Midterms 2026",
    description: "Why pass a law through Congress when you can legislate by giant black marker and let the courts argue about it for 4 years?"
  },
  {
    id: "urn:robos:tabletop:weapon:crypto-rugpull-scepter",
    name: "Presidential Meme-Coin Rug-Pull Scepter",
    type: "Illegal Presidential Act (Emolument)",
    dice: "4 Attack Dice (Drains 200 GP From Voters)",
    cost: "600 GP",
    icon: "🪙",
    category: "Midterms 2026",
    description: "The Founding Fathers forgot to write 'No Official White House Crypto Pump-and-Dumps' in the Constitution!"
  },
  {
    id: "urn:robos:tabletop:weapon:doj-subpoena-crossbow",
    name: "Weaponized Subpoena Crossbow",
    type: "Illegal Presidential Act (Ranged)",
    dice: "3 Attack Dice (Fires Indictments Across Rooms)",
    cost: "400 GP",
    icon: "🏹",
    category: "Midterms 2026",
    description: "Turns federal agencies into a personal campaign war-room! Fires rapid-fire subpoenas and investigations at political rivals."
  },
  {
    id: "urn:robos:tabletop:weapon:official-act-immunity-shield",
    name: "'Official Act' Sovereign Immunity Shield",
    type: "Illegal Presidential Act (Armor)",
    dice: "+3 Defend Dice (Total Legal Invincibility)",
    cost: "750 GP",
    icon: "🛡️",
    category: "Midterms 2026",
    description: "Just declare whatever sketchy thing you just did an 'Official Core Constitutional Act' and no prosecutor in the dungeon can touch you!"
  }
];

const BASE_QUEST_ITEMS = [
  { id: "urn:robos:tabletop:item:potion-healing", key: "potion-healing", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100, cost: "100 GP", icon: "🧪", category: "Base Game", description: "Brewed by the Alchemists' Guild to mend grievous dungeon wounds." },
  { id: "urn:robos:tabletop:item:holy-water", key: "holy-water", name: "Holy Water", type: "relic", effect: "Dispel/Kill Undead", value: 200, cost: "200 GP", icon: "✨", category: "Base Game", description: "Consecrated water that instantly banishes a Skeleton, Zombie, or Mummy." },
  { id: "urn:robos:tabletop:item:tool-kit", key: "tool-kit", name: "Trap Disarm Toolkit", type: "tool", effect: "Disarm traps without rolling skull", value: 75, cost: "75 GP", icon: "🔧", category: "Base Game", description: "Masterwork thieves' tools for safely disarming pit and spear traps." },
  { id: "urn:robos:tabletop:item:heavy-rope", key: "heavy-rope", name: "Heavy Rope (30 ft)", type: "tool", effect: "Cross pits or climb chasms", value: 25, cost: "25 GP", icon: "🪢", category: "Base Game", description: "Hemp climbing rope for escaping deep pit traps." },
  { id: "urn:robos:tabletop:item:torch", key: "torch", name: "Dungeon Torch", type: "tool", effect: "Light darkness for 3 turns", value: 15, cost: "15 GP", icon: "🔥", category: "Base Game", description: "Pitch-soaked torch that illuminates dark corridors and hidden doors." },
  { id: "urn:robos:tabletop:item:potion-strength", key: "potion-strength", name: "Potion of Strength", type: "potion", effect: "+2 Attack Dice for 1 turn", value: 150, cost: "150 GP", icon: "💪", category: "Base Game", description: "Grants heroic might (+2 Combat Attack Dice) on your next attack." }
];

const MIDTERMS_2026_ITEMS = [
  {
    id: "urn:robos:tabletop:item:snowflake-tears",
    key: "snowflake-tears",
    name: "Vial of Delicate Snowflake Tears",
    type: "potion",
    effect: "Freezes everyone in awkward silence for 1 turn & restores 2 MP",
    value: 150,
    cost: "150 GP",
    icon: "❄️",
    category: "Midterms 2026",
    description: "Distilled from pure comment-section meltdowns on both sides of the aisle! Makes the drinker immune to mild jokes for 1 turn."
  },
  {
    id: "urn:robos:tabletop:item:bodily-autonomy-eraser",
    key: "bodily-autonomy-eraser",
    name: "1789 Bodily Autonomy Eraser Scroll",
    type: "relic",
    effect: "Takes away abortion & personal choice; forces target to lose their action",
    value: 250,
    cost: "250 GP",
    icon: "📜",
    category: "Midterms 2026",
    description: "Takes away reproductive rights and bodily autonomy using a dusty parchment from 1789 because politicians love regulating personal healthcare."
  },
  {
    id: "urn:robos:tabletop:item:party-line-flip-flops",
    key: "party-line-flip-flops",
    name: "Party-Line Flip-Flop Sandals",
    type: "relic",
    effect: "Support things just because your party does! Instant 180° pivot & +2 Move",
    value: 200,
    cost: "200 GP",
    icon: "🩴",
    category: "Midterms 2026",
    description: "Supporting things just because your party does! Automatically spins you 180 degrees the second your party leader changes their mind."
  },
  {
    id: "urn:robos:tabletop:item:middle-east-teleprompter",
    key: "middle-east-teleprompter",
    name: "Middle East Briefing Teleprompter Shield",
    type: "tool",
    effect: "Deflects impossible questions on Israel & the Middle East (+2 Defend Dice)",
    value: 300,
    cost: "300 GP",
    icon: "📺",
    category: "Midterms 2026",
    description: "Fear of Israel and the Middle East in a town-hall debate! Pivots immediately to talking about bridges and roads while dodging all projectiles."
  },
  {
    id: "urn:robos:tabletop:item:fed-printer-coin",
    key: "fed-printer-coin",
    name: "Money Printer Goes 'Brrrr' Crank",
    type: "relic",
    effect: "Prints +500 GP instantly, but raises shop prices by 50%",
    value: 500,
    cost: "500 GP",
    icon: "🖨️",
    category: "Midterms 2026",
    description: "Cranks out fresh stimulus gold coins out of thin air while economists insist inflation isn't real!"
  }
];

function getAllDreadSpells() {
  const map = new Map();
  [...DREAD_SPELLS, ...MIDTERMS_2026_DREAD_SPELLS, ...(currentData.dreadSpells || [])].forEach(ds => {
    const key = ds.slug || ds.id;
    if (key) map.set(key, ds);
  });
  return Array.from(map.values());
}

function getAllHeroSpellsCatalog() {
  const map = new Map();
  Object.keys(ELEMENTAL_DECKS).forEach(elemKey => {
    ELEMENTAL_DECKS[elemKey].spells.forEach(s => {
      map.set(s.id || s.slug, { ...s, category: s.category || "Base Game" });
    });
  });
  MIDTERMS_2026_SPELLS.forEach(s => {
    map.set(s.id || s.slug, { ...s, category: s.category || "Midterms 2026" });
  });
  (currentData.spells || []).forEach(n => {
    const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
    if (t.includes("robos:TabletopDreadSpell") || n["robos:spellCollege"] === "dread") return;
    const id = n["@id"] || n.id;
    const slug = (id || "").replace("urn:robos:tabletop:spell:", "");
    if (!map.has(id) && !map.has(slug)) {
      map.set(id || slug, {
        id: id || `urn:robos:tabletop:spell:${slug}`,
        slug: slug,
        name: n["dcterms:title"] || n.name || slug,
        element: (n["robos:spellCollege"] || n.element || "fire").toLowerCase(),
        category: n["robos:category"] || n.category || "Base Game",
        icon: n["robos:icon"] || n.icon || "✨",
        description: n["dcterms:description"] || n.description || "",
        effect: n["robos:effect"] || n.effect || "damage-bp",
        val: n["robos:effectValue"] || n.val || 2
      });
    }
  });
  return Array.from(map.values());
}

function syncCategoryCatalogsFromKGraph() {
  const catSet = new Set(DEFAULT_CATEGORIES);
  (currentData.categories || []).forEach(c => {
    if (c && String(c).trim()) catSet.add(String(c).trim());
  });

  // Collect categories from KGraph nodes
  (currentData.tabletopNodes || []).forEach(n => {
    if (n["robos:category"]) catSet.add(n["robos:category"]);
  });
  (currentData.monsters || []).forEach(m => {
    if (m["robos:category"]) catSet.add(m["robos:category"]);
  });

  // Sync weapons
  const wepMap = new Map();
  [...BASE_WEAPONS, ...MIDTERMS_2026_WEAPONS, ...(currentData.weapons || [])].forEach(w => {
    wepMap.set(w.id || w.name, { ...w, category: w.category || "Base Game" });
  });
  (currentData.tabletopNodes || []).forEach(n => {
    const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
    if (t.includes("robos:TabletopWeapon") || (t.includes("robos:TabletopArtifact") && n["robos:itemType"] === "weapon")) {
      const id = n["@id"];
      if (!wepMap.has(id)) {
        wepMap.set(id, {
          id,
          name: n["dcterms:title"] || id,
          type: n["robos:weaponType"] || "Weapon",
          dice: n["robos:combatStat"] || `${n["robos:attackDice"] || 3} Attack Dice`,
          cost: n["robos:cost"] || `${n["robos:goldValue"] || 250} GP`,
          icon: n["robos:icon"] || "⚔️",
          category: n["robos:category"] || "Base Game",
          description: n["dcterms:description"] || ""
        });
      }
    }
  });
  currentData.weapons = Array.from(wepMap.values());
  currentData.weapons.forEach(w => { if (w.category) catSet.add(w.category); });

  // Sync quest items
  const itemMap = new Map();
  [...BASE_QUEST_ITEMS, ...MIDTERMS_2026_ITEMS, ...(currentData.items || [])].forEach(it => {
    itemMap.set(it.id || it.key || it.name, { ...it, category: it.category || "Base Game" });
  });
  (currentData.tabletopNodes || []).forEach(n => {
    const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
    if (t.includes("robos:TabletopItem") || (t.includes("robos:TabletopBlessing") && n["robos:category"])) {
      const id = n["@id"];
      if (!itemMap.has(id)) {
        const key = id.split(":").pop();
        itemMap.set(id, {
          id,
          key,
          name: n["dcterms:title"] || key,
          type: n["robos:itemType"] || "relic",
          effect: n["robos:effect"] || n["dcterms:description"] || "",
          value: n["robos:goldValue"] || 100,
          cost: n["robos:cost"] || `${n["robos:goldValue"] || 100} GP`,
          icon: n["robos:icon"] || "🎒",
          category: n["robos:category"] || "Base Game",
          description: n["dcterms:description"] || ""
        });
      }
    }
  });
  currentData.items = Array.from(itemMap.values());
  currentData.items.forEach(it => { if (it.category) catSet.add(it.category); });

  // Also register all items in PRESET_ITEMS so heroes can equip them
  currentData.items.forEach(it => {
    const k = it.key || (it.id ? it.id.split(":").pop() : it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    PRESET_ITEMS[k] = {
      id: it.id || `item-${k}`,
      name: it.name,
      type: it.type || "item",
      effect: it.effect || it.description || "",
      value: parseInt(it.value, 10) || parseInt(it.cost, 10) || 100,
      category: it.category || "Base Game"
    };
  });

  // Sync dread spells
  const dreadMap = new Map();
  [...DREAD_SPELLS, ...MIDTERMS_2026_DREAD_SPELLS, ...(currentData.dreadSpells || [])].forEach(ds => {
    dreadMap.set(ds.slug || ds.id, { ...ds, category: ds.category || "Base Game" });
  });
  (currentData.tabletopNodes || []).forEach(n => {
    const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
    if (t.includes("robos:TabletopDreadSpell") || n["robos:spellCollege"] === "dread") {
      const id = n["@id"];
      const slug = (id || "").replace("urn:robos:tabletop:spell:", "");
      if (!dreadMap.has(slug)) {
        dreadMap.set(slug, {
          id,
          slug,
          name: n["dcterms:title"] || slug,
          element: "dread",
          category: n["robos:category"] || "Base Game",
          icon: n["robos:icon"] || "⚡",
          description: n["dcterms:description"] || "",
          effect: n["robos:effect"] || "damage-bp",
          val: n["robos:effectValue"] || 2
        });
      }
    }
  });
  currentData.dreadSpells = Array.from(dreadMap.values());
  currentData.dreadSpells.forEach(ds => { if (ds.category) catSet.add(ds.category); });

  currentData.categories = Array.from(catSet);
}

function getCategories() {
  if (!Array.isArray(currentData.categories) || currentData.categories.length === 0) {
    currentData.categories = [...DEFAULT_CATEGORIES];
  }
  return currentData.categories;
}

function addCategory(categoryName) {
  const clean = String(categoryName || "").trim();
  if (!clean) return { success: false, error: "Category name cannot be empty" };
  if (!Array.isArray(currentData.categories)) {
    currentData.categories = [...DEFAULT_CATEGORIES];
  }
  const existing = currentData.categories.find(c => c.toLowerCase() === clean.toLowerCase());
  const finalName = existing || clean;
  if (!existing) {
    currentData.categories.push(finalName);
  }
  renderCategoryControlsUI();
  setStatus(`Added content category '${finalName}'.`);
  return { success: true, category: finalName, categories: [...currentData.categories] };
}

function getAllHeroesCatalog() {
  const heroMap = new Map();
  [...createDefaultCampaignHeroes(), ...MIDTERMS_2026_HEROES].forEach(h => {
    const norm = normalizeHeroEntity(h);
    if (norm && norm["@id"]) heroMap.set(norm["@id"], norm);
  });
  (currentData.tabletopNodes || []).forEach(n => {
    const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
    if (t.includes("robos:TabletopHero")) {
      const norm = normalizeHeroEntity(n);
      if (norm && norm["@id"]) heroMap.set(norm["@id"], norm);
    }
  });
  (currentData.heroes || []).forEach(h => {
    const norm = normalizeHeroEntity(h);
    if (norm && norm["@id"]) heroMap.set(norm["@id"], norm);
  });
  return Array.from(heroMap.values());
}

function getHeroesByCategory(category = "All") {
  const list = getAllHeroesCatalog();
  if (!category || category === "All") return list;
  return list.filter(h => (h["robos:category"] || h.category || "Base Game") === category);
}

function setHeroCategoryFilter(category) {
  currentData.activeHeroCategoryFilter = category || "All";
  const filterSelect = document.getElementById("hero-category-filter");
  if (filterSelect && filterSelect.value !== currentData.activeHeroCategoryFilter) {
    filterSelect.value = currentData.activeHeroCategoryFilter;
  }
  renderHeroesList();
  const filtered = getHeroesByCategory(currentData.activeHeroCategoryFilter);
  if (filtered.length > 0) {
    const stillVisible = filtered.some(h => h["@id"] === currentData.activeHeroId);
    if (!stillVisible) {
      selectHero(filtered[0]["@id"]);
    }
  }
  return filtered;
}

function applyHeroPackToActiveCampaign(category = null) {
  const targetCat = category || currentData.activeHeroCategoryFilter || "Midterms 2026";
  const effectiveCat = targetCat === "All" ? "Midterms 2026" : targetCat;
  const packHeroes = getHeroesByCategory(effectiveCat).map(h => JSON.parse(JSON.stringify(h)));
  if (packHeroes.length === 0) {
    setStatus(`No heroes found in pack '${effectiveCat}'.`);
    return { success: false, category: effectiveCat, heroes: [] };
  }
  currentData.heroes = packHeroes;
  if (currentData.campaign) {
    currentData.campaign.heroes = packHeroes;
    currentData.campaign.heroPack = effectiveCat;
  }
  currentData.activeHeroCategoryFilter = effectiveCat;
  const filterSelect = document.getElementById("hero-category-filter");
  if (filterSelect) filterSelect.value = effectiveCat;
  currentData.activeHeroId = packHeroes[0]["@id"];
  renderHeroesList();
  selectHero(currentData.activeHeroId);
  if (typeof renderQuestHeroesReviewGrid === "function") renderQuestHeroesReviewGrid();
  if (typeof renderCampaignSelectorUI === "function") renderCampaignSelectorUI();
  if (typeof triggerCampaignAutosave === "function") triggerCampaignAutosave();
  setStatus(`🛡️ Loaded '${effectiveCat}' Hero Pack (${packHeroes.map(h => getHeroName(h)).join(", ")}) into ${currentData.campaign?.title || "Active Campaign"}.`);
  return { success: true, category: effectiveCat, heroes: packHeroes };
}

function getMonstersByCategory(category = "All") {
  const list = currentData.monsters || [];
  if (!category || category === "All") return list;
  return list.filter(m => (m["robos:category"] || "Base Game") === category);
}

function getSpellsByCategory(category = "All") {
  const list = getAllHeroSpellsCatalog();
  if (!category || category === "All") return list;
  return list.filter(s => (s.category || "Base Game") === category);
}

function getDreadSpellsByCategory(category = "All") {
  const list = getAllDreadSpells();
  if (!category || category === "All") return list;
  return list.filter(s => (s.category || "Base Game") === category);
}

function getWeaponsByCategory(category = "All") {
  if (!currentData.weapons || currentData.weapons.length === 0) syncCategoryCatalogsFromKGraph();
  const list = currentData.weapons || [];
  if (!category || category === "All") return list;
  return list.filter(w => (w.category || "Base Game") === category);
}

function getItemsByCategory(category = "All") {
  if (!currentData.items || currentData.items.length === 0) syncCategoryCatalogsFromKGraph();
  const list = currentData.items || [];
  if (!category || category === "All") return list;
  return list.filter(it => (it.category || "Base Game") === category);
}

function setMonsterCategoryFilter(category) {
  currentData.activeMonsterCategoryFilter = category || "All";
  const filterSelect = document.getElementById("monster-category-filter");
  if (filterSelect && filterSelect.value !== currentData.activeMonsterCategoryFilter) {
    filterSelect.value = currentData.activeMonsterCategoryFilter;
  }
  renderMonstersList();
  return getMonstersByCategory(currentData.activeMonsterCategoryFilter);
}

function setSpellItemCategoryFilter(category) {
  currentData.activeSpellItemCategoryFilter = category || "All";
  const filterSelect = document.getElementById("spells-items-category-filter");
  if (filterSelect && filterSelect.value !== currentData.activeSpellItemCategoryFilter) {
    filterSelect.value = currentData.activeSpellItemCategoryFilter;
  }
  renderCategoryControlsUI();
  renderSpellsAndItems();
  return {
    category: currentData.activeSpellItemCategoryFilter,
    spells: getSpellsByCategory(currentData.activeSpellItemCategoryFilter),
    dreadSpells: getDreadSpellsByCategory(currentData.activeSpellItemCategoryFilter),
    weapons: getWeaponsByCategory(currentData.activeSpellItemCategoryFilter),
    items: getItemsByCategory(currentData.activeSpellItemCategoryFilter)
  };
}

function renderCategoryControlsUI() {
  const cats = getCategories();

  // 1. Filter selects (include "All")
  ["hero-category-filter", "monster-category-filter", "spells-items-category-filter"].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prevVal = selId === "hero-category-filter"
      ? (currentData.activeHeroCategoryFilter || "All")
      : (selId === "monster-category-filter"
        ? (currentData.activeMonsterCategoryFilter || "All")
        : (currentData.activeSpellItemCategoryFilter || "All"));
    sel.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "All";
    allOpt.textContent = "All Categories (" + cats.length + " Packs)";
    sel.appendChild(allOpt);
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c === "Base Game" ? "🏰 Base Game" : (c === "Midterms 2026" ? "🗳️ Midterms 2026" : `🏷️ ${c}`);
      sel.appendChild(opt);
    });
    sel.value = cats.includes(prevVal) || prevVal === "All" ? prevVal : "All";
  });

  // 2. Entity assignment selects (no "All")
  ["hero-category", "monster-category", "new-spell-category", "new-weapon-category", "new-item-category"].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML = "";
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    if (prevVal && cats.includes(prevVal)) {
      sel.value = prevVal;
    } else if (currentData.activeSpellItemCategoryFilter && currentData.activeSpellItemCategoryFilter !== "All") {
      sel.value = currentData.activeSpellItemCategoryFilter;
    }
  });

  // 3. Render Category Pills Bar on Spells & Items tab
  const pillsBar = document.getElementById("category-pills-bar");
  if (pillsBar) {
    pillsBar.innerHTML = "";
    const activeCat = currentData.activeSpellItemCategoryFilter || "All";
    ["All", ...cats].forEach(c => {
      const btn = document.createElement("button");
      const isActive = activeCat === c;
      btn.className = `btn btn-xs ${isActive ? "btn-primary" : "btn-secondary"} category-pill-btn`;
      btn.dataset.category = c;
      const icon = c === "All" ? "🌐" : (c === "Base Game" ? "🏰" : (c === "Midterms 2026" ? "🗳️" : "🏷️"));
      btn.textContent = `${icon} ${c === "All" ? "All Packs" : c}`;
      btn.onclick = () => setSpellItemCategoryFilter(c);
      pillsBar.appendChild(btn);
    });
  }
}

function syncBoardMonsterSelectDropdown() {
  const sel = document.getElementById("select-monster-type");
  if (!sel) return;
  const currentVal = sel.value;
  const cats = getCategories();
  sel.innerHTML = "";

  cats.forEach(cat => {
    const monstersInCat = getMonstersByCategory(cat);
    if (monstersInCat.length === 0) return;
    const optgroup = document.createElement("optgroup");
    optgroup.label = `🏷️ ${cat}`;
    monstersInCat.forEach(m => {
      const slug = (m["@id"] || "").replace("urn:robos:tabletop:monster:", "");
      const opt = document.createElement("option");
      opt.value = slug;
      const bp = m["robos:bodyPoints"] || 1;
      const atk = m["robos:attackDice"] || 2;
      const bossTag = m["robos:isBoss"] ? "👑 BOSS, " : "";
      opt.textContent = `${m["dcterms:title"] || slug} (${bossTag}${bp} BP, ${atk} Atk)`;
      optgroup.appendChild(opt);
    });
    sel.appendChild(optgroup);
  });

  if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  }
}

function syncHeroPresetItemsDropdown() {
  const sel = document.getElementById("hero-preset-item");
  if (!sel) return;
  const currentVal = sel.value;
  const cats = getCategories();
  sel.innerHTML = "";

  cats.forEach(cat => {
    const itemsInCat = getItemsByCategory(cat);
    if (itemsInCat.length === 0) return;
    const optgroup = document.createElement("optgroup");
    optgroup.label = `🏷️ ${cat}`;
    itemsInCat.forEach(it => {
      const key = it.key || (it.id ? it.id.split(":").pop() : it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${it.icon || "🎒"} ${it.name} (${it.effect || it.type || "Item"})`;
      optgroup.appendChild(opt);
    });
    sel.appendChild(optgroup);
  });

  if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  }
}

async function addCustomSpell(spellInput) {
  const name = String(spellInput.name || "").trim();
  if (!name) return { success: false, error: "Spell name is required" };
  const category = String(spellInput.category || "Base Game").trim();
  addCategory(category);
  const element = String(spellInput.element || "fire").toLowerCase();
  const slug = spellInput.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `urn:robos:tabletop:spell:${slug}`;
  const icon = spellInput.icon || (element === "dread" ? "⚡" : "✨");
  const description = spellInput.description || "Custom tabletop spell.";
  const effect = spellInput.effect || "damage-bp";
  const val = parseInt(spellInput.val, 10) || 2;

  const spellObj = { id, slug, name, element, category, icon, description, effect, val };

  if (element === "dread") {
    currentData.dreadSpells.push(spellObj);
  } else {
    currentData.spells.push({
      "@id": id,
      "@type": ["oslc_am:Resource", "robos:TabletopSpellCard", "schema:Thing"],
      "dcterms:title": name,
      "dcterms:description": description,
      "robos:category": category,
      "robos:spellCollege": element,
      "robos:icon": icon,
      "robos:effect": effect,
      "robos:effectValue": val,
      "robos:package": "tabletop-game",
      "robos:namespace": "robos.tabletop"
    });
  }

  if (window.robosTabletop?.saveKGraphEntity) {
    await window.robosTabletop.saveKGraphEntity({
      entity: {
        "@id": id,
        "@type": element === "dread"
          ? ["oslc_am:Resource", "robos:TabletopSpellCard", "robos:TabletopDreadSpell", "schema:Thing"]
          : ["oslc_am:Resource", "robos:TabletopSpellCard", "schema:Thing"],
        "dcterms:title": name,
        "dcterms:description": description,
        "robos:category": category,
        "robos:spellCollege": element,
        "robos:icon": icon,
        "robos:effect": effect,
        "robos:effectValue": val,
        "robos:package": "tabletop-game",
        "robos:namespace": "robos.tabletop"
      }
    });
  }

  renderSpellsAndItems();
  setStatus(`Added spell '${name}' under category '${category}'.`);
  return { success: true, spell: spellObj };
}

async function addCustomWeapon(weaponInput) {
  const name = String(weaponInput.name || "").trim();
  if (!name) return { success: false, error: "Weapon name is required" };
  const category = String(weaponInput.category || "Base Game").trim();
  addCategory(category);
  const slug = weaponInput.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `urn:robos:tabletop:weapon:${slug}`;
  const weaponObj = {
    id,
    name,
    type: weaponInput.type || "Weapon",
    dice: weaponInput.dice || "3 Attack Dice",
    cost: weaponInput.cost || "250 GP",
    icon: weaponInput.icon || "⚔️",
    category,
    description: weaponInput.description || ""
  };
  currentData.weapons.push(weaponObj);

  if (window.robosTabletop?.saveKGraphEntity) {
    await window.robosTabletop.saveKGraphEntity({
      entity: {
        "@id": id,
        "@type": ["oslc_am:Resource", "robos:TabletopArtifact", "robos:TabletopWeapon", "schema:Product"],
        "dcterms:title": name,
        "dcterms:description": weaponObj.description,
        "robos:category": category,
        "robos:itemType": "weapon",
        "robos:weaponType": weaponObj.type,
        "robos:combatStat": weaponObj.dice,
        "robos:cost": weaponObj.cost,
        "robos:icon": weaponObj.icon,
        "robos:package": "tabletop-game",
        "robos:namespace": "robos.tabletop"
      }
    });
  }

  renderSpellsAndItems();
  setStatus(`Added weapon '${name}' under category '${category}'.`);
  return { success: true, weapon: weaponObj };
}

async function addCustomItem(itemInput) {
  const name = String(itemInput.name || "").trim();
  if (!name) return { success: false, error: "Item name is required" };
  const category = String(itemInput.category || "Base Game").trim();
  addCategory(category);
  const slug = itemInput.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `urn:robos:tabletop:item:${slug}`;
  const costStr = itemInput.cost ? (String(itemInput.cost).includes("GP") ? String(itemInput.cost) : `${itemInput.cost} GP`) : "100 GP";
  const valNum = parseInt(itemInput.value || itemInput.cost, 10) || 100;
  const itemObj = {
    id,
    key: slug,
    name,
    type: itemInput.type || "relic",
    effect: itemInput.effect || "Special quest effect",
    value: valNum,
    cost: costStr,
    icon: itemInput.icon || "🎒",
    category,
    description: itemInput.description || itemInput.effect || ""
  };
  currentData.items.push(itemObj);
  PRESET_ITEMS[slug] = {
    id: `item-${slug}`,
    name: itemObj.name,
    type: itemObj.type,
    effect: itemObj.effect,
    value: itemObj.value,
    category: itemObj.category
  };

  if (window.robosTabletop?.saveKGraphEntity) {
    await window.robosTabletop.saveKGraphEntity({
      entity: {
        "@id": id,
        "@type": ["oslc_am:Resource", "robos:TabletopBlessing", "robos:TabletopItem", "schema:Thing"],
        "dcterms:title": name,
        "dcterms:description": itemObj.description,
        "robos:category": category,
        "robos:itemType": itemObj.type,
        "robos:effect": itemObj.effect,
        "robos:goldValue": itemObj.value,
        "robos:cost": itemObj.cost,
        "robos:icon": itemObj.icon,
        "robos:package": "tabletop-game",
        "robos:namespace": "robos.tabletop"
      }
    });
  }

  syncHeroPresetItemsDropdown();
  renderSpellsAndItems();
  setStatus(`Added item '${name}' under category '${category}'.`);
  return { success: true, item: itemObj };
}

let categoryControlsInitialized = false;
function setupCategoryControls() {
  if (categoryControlsInitialized) return;
  categoryControlsInitialized = true;

  // Campaign Heroes subtab category / Hero Pack filter
  document.getElementById("hero-category-filter")?.addEventListener("change", (e) => {
    setHeroCategoryFilter(e.target.value);
  });

  // Campaign Heroes subtab add new hero pack button
  document.getElementById("btn-add-hero-category")?.addEventListener("click", () => {
    const input = document.getElementById("hero-new-category-input");
    const val = input?.value?.trim();
    if (!val) return;
    const res = addCategory(val);
    if (res.success) {
      if (input) input.value = "";
      setHeroCategoryFilter(res.category);
      const heroCatSelect = document.getElementById("hero-category");
      if (heroCatSelect) heroCatSelect.value = res.category;
    }
  });

  // Load Hero Pack into Active Campaign button
  document.getElementById("btn-apply-hero-pack")?.addEventListener("click", () => {
    const sel = document.getElementById("hero-category-filter");
    applyHeroPackToActiveCampaign(sel?.value || currentData.activeHeroCategoryFilter || "Midterms 2026");
  });

  // Monster tab category filter
  document.getElementById("monster-category-filter")?.addEventListener("change", (e) => {
    setMonsterCategoryFilter(e.target.value);
  });

  // Monster tab add new category button
  document.getElementById("btn-add-monster-category")?.addEventListener("click", () => {
    const input = document.getElementById("monster-new-category-input");
    const val = input?.value?.trim();
    if (!val) return;
    const res = addCategory(val);
    if (res.success) {
      if (input) input.value = "";
      setMonsterCategoryFilter(res.category);
      const monCatSelect = document.getElementById("monster-category");
      if (monCatSelect) monCatSelect.value = res.category;
    }
  });

  // Spells & Items tab category filter
  document.getElementById("spells-items-category-filter")?.addEventListener("change", (e) => {
    setSpellItemCategoryFilter(e.target.value);
  });

  // Spells & Items tab create category button
  document.getElementById("btn-create-category")?.addEventListener("click", () => {
    const input = document.getElementById("new-category-name");
    const val = input?.value?.trim();
    if (!val) return;
    const res = addCategory(val);
    if (res.success) {
      if (input) input.value = "";
      setSpellItemCategoryFilter(res.category);
    }
  });

  // Toggle inline forms on Spells & Items tab
  document.getElementById("btn-toggle-add-spell")?.addEventListener("click", () => {
    const form = document.getElementById("form-add-spell-card");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
  });
  document.getElementById("btn-cancel-new-spell")?.addEventListener("click", () => {
    const form = document.getElementById("form-add-spell-card");
    if (form) form.style.display = "none";
  });
  document.getElementById("btn-save-new-spell")?.addEventListener("click", async () => {
    const name = document.getElementById("new-spell-name")?.value;
    const category = document.getElementById("new-spell-category")?.value || "Base Game";
    const element = document.getElementById("new-spell-college")?.value || "fire";
    const icon = document.getElementById("new-spell-icon")?.value || "✨";
    const description = document.getElementById("new-spell-desc")?.value || "";
    const res = await addCustomSpell({ name, category, element, icon, description });
    if (res.success) {
      document.getElementById("new-spell-name").value = "";
      document.getElementById("new-spell-desc").value = "";
      document.getElementById("form-add-spell-card").style.display = "none";
    }
  });

  document.getElementById("btn-toggle-add-weapon")?.addEventListener("click", () => {
    const form = document.getElementById("form-add-weapon-card");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
  });
  document.getElementById("btn-cancel-new-weapon")?.addEventListener("click", () => {
    const form = document.getElementById("form-add-weapon-card");
    if (form) form.style.display = "none";
  });
  document.getElementById("btn-save-new-weapon")?.addEventListener("click", async () => {
    const name = document.getElementById("new-weapon-name")?.value;
    const category = document.getElementById("new-weapon-category")?.value || "Base Game";
    const type = document.getElementById("new-weapon-type")?.value || "Weapon";
    const dice = document.getElementById("new-weapon-dice")?.value || "3 Attack Dice";
    const costVal = document.getElementById("new-weapon-cost")?.value || "250";
    const icon = document.getElementById("new-weapon-icon")?.value || "⚔️";
    const description = document.getElementById("new-weapon-desc")?.value || "";
    const res = await addCustomWeapon({ name, category, type, dice, cost: `${costVal} GP`, icon, description });
    if (res.success) {
      document.getElementById("new-weapon-name").value = "";
      document.getElementById("new-weapon-desc").value = "";
      document.getElementById("form-add-weapon-card").style.display = "none";
    }
  });

  document.getElementById("btn-toggle-add-quest-item")?.addEventListener("click", () => {
    const form = document.getElementById("form-add-quest-item-card");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
  });
  document.getElementById("btn-cancel-new-item")?.addEventListener("click", () => {
    const form = document.getElementById("form-add-quest-item-card");
    if (form) form.style.display = "none";
  });
  document.getElementById("btn-save-new-item")?.addEventListener("click", async () => {
    const name = document.getElementById("new-item-name")?.value;
    const category = document.getElementById("new-item-category")?.value || "Base Game";
    const type = document.getElementById("new-item-type")?.value || "relic";
    const effect = document.getElementById("new-item-effect")?.value || "";
    const costVal = document.getElementById("new-item-cost")?.value || "100";
    const icon = document.getElementById("new-item-icon")?.value || "🎒";
    const res = await addCustomItem({ name, category, type, effect, value: parseInt(costVal, 10) || 100, cost: `${costVal} GP`, icon });
    if (res.success) {
      document.getElementById("new-item-name").value = "";
      document.getElementById("new-item-effect").value = "";
      document.getElementById("form-add-quest-item-card").style.display = "none";
    }
  });
}

function getSpellAllocation() {
  return currentData.spellAllocation;
}

function setElfElement(elementKey) {
  if (!ELEMENTAL_DECKS[elementKey]) return;
  const allElements = ["earth", "fire", "water", "air"];
  currentData.spellAllocation.elfElement = elementKey;
  currentData.spellAllocation.wizardElements = allElements.filter(e => e !== elementKey);
  applySpellAllocationToHeroes();
  renderSpellDraftSummaryBadges();
  renderSpellsAndItems();
}

function getHeroSpells(hero) {
  if (!hero) return [];
  const heroClass = getHeroClass(hero);
  if (heroClass === "Elf") {
    const elem = currentData.spellAllocation?.elfElement || "water";
    return ELEMENTAL_DECKS[elem] ? [...ELEMENTAL_DECKS[elem].spells] : [];
  }
  if (heroClass === "Wizard") {
    const elems = currentData.spellAllocation?.wizardElements || ["earth", "fire", "air"];
    let wizardSpells = [];
    elems.forEach(elem => {
      if (ELEMENTAL_DECKS[elem]) {
        wizardSpells = wizardSpells.concat(ELEMENTAL_DECKS[elem].spells);
      }
    });
    return wizardSpells;
  }
  return [];
}

function applySpellAllocationToHeroes() {
  if (!Array.isArray(currentData.heroes)) return;
  currentData.heroes.forEach(h => {
    const heroClass = getHeroClass(h);
    if (heroClass === "Elf" || heroClass === "Wizard") {
      h["robos:spells"] = getHeroSpells(h);
    } else {
      h["robos:spells"] = [];
    }
  });

  const activeHero = getActiveHero();
  if (activeHero) {
    renderHeroGrimoire(activeHero);
    renderHeroSpellActionModule(activeHero);
  }
}

function renderHeroGrimoire(hero) {
  const spellsSection = document.getElementById("hero-spells-section");
  const spellsList = document.getElementById("hero-spells-list");
  const spellsTitle = document.getElementById("hero-spells-title");
  const spellsSubtitle = document.getElementById("hero-spells-subtitle");
  if (!spellsSection || !spellsList) return;

  const heroClass = getHeroClass(hero);
  if (heroClass !== "Elf" && heroClass !== "Wizard") {
    spellsSection.style.display = "block";
    if (spellsTitle) spellsTitle.textContent = "🛡️ Martial Hero (Non-Spellcaster)";
    if (spellsSubtitle) spellsSubtitle.textContent = `${heroClass} uses no magic`;
    spellsList.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 14px; background: rgba(30, 41, 59, 0.4); border: 1px dashed var(--border-color); border-radius: 6px; color: var(--text-muted); font-size: 0.8rem; text-align: center;">
        The <strong>${heroClass}</strong> fights exclusively with brute martial prowess, steel, and armor.<br>
        <span style="font-size:0.75rem; color:#64748b;">Only the <strong>Elf</strong> (1 elemental deck) and <strong>Wizard</strong> (3 elemental decks) memorize spells.</span>
      </div>
    `;
    return;
  }

  spellsSection.style.display = "block";
  const spells = getHeroSpells(hero);

  if (heroClass === "Elf") {
    const elemKey = currentData.spellAllocation?.elfElement || "water";
    const deck = ELEMENTAL_DECKS[elemKey];
    if (spellsTitle) spellsTitle.textContent = `🧝 Elf Grimoire — ${deck?.name || 'Elemental Magic'}`;
    if (spellsSubtitle) spellsSubtitle.textContent = `1 College Drafted (${spells.length} Spells Memorized)`;
  } else {
    const elemNames = (currentData.spellAllocation?.wizardElements || []).map(e => ELEMENTAL_DECKS[e]?.name?.replace(" Magic", "") || e).join(", ");
    if (spellsTitle) spellsTitle.textContent = `🧙 Wizard Grimoire — Master of Elements`;
    if (spellsSubtitle) spellsSubtitle.textContent = `3 Colleges Drafted: ${elemNames} (${spells.length} Spells Memorized)`;
  }

  spellsList.innerHTML = "";
  spells.forEach(spell => {
    const card = document.createElement("div");
    card.className = `spell-card-mini deck-${spell.element}`;
    const spIconUrl = getSpellIconUrl(spell);
    card.innerHTML = `
      <div class="spell-card-mini-header">
        <span class="spell-mini-name" style="display:inline-flex; align-items:center; gap:6px;"><img src="${spIconUrl}" alt="" style="width:20px; height:20px; border-radius:4px; object-fit:cover;"> ${spell.name}</span>
        <span class="element-tag tag-${spell.element}">${spell.element.toUpperCase()}</span>
      </div>
      <div class="spell-mini-desc">${spell.description}</div>
    `;
    spellsList.appendChild(card);
  });
}

function renderHeroSpellActionModule(hero) {
  const moduleEl = document.getElementById("act-spell-module");
  const countEl = document.getElementById("act-spell-count");
  const selectEl = document.getElementById("act-spell-select");
  if (!moduleEl) return;

  const heroClass = getHeroClass(hero);
  if (heroClass !== "Elf" && heroClass !== "Wizard") {
    moduleEl.style.display = "none";
    return;
  }

  moduleEl.style.display = "flex";
  const spells = getHeroSpells(hero);
  if (countEl) countEl.textContent = `${spells.length} Spells Ready`;

  if (selectEl) {
    const currentVal = selectEl.value;
    selectEl.innerHTML = "";
    spells.forEach(sp => {
      const opt = document.createElement("option");
      opt.value = sp.id || sp.slug;
      opt.textContent = `${sp.name} (${sp.element.toUpperCase()})`;
      selectEl.appendChild(opt);
    });
    if (currentVal && spells.some(s => (s.id || s.slug) === currentVal)) {
      selectEl.value = currentVal;
    }
  }
}

function castHeroSpell(hero, spellId) {
  if (!hero) hero = getActiveHero();
  if (!hero) return null;

  const spells = getHeroSpells(hero);
  const spell = spells.find(s => s.id === spellId || s.slug === spellId) || spells[0];
  if (!spell) return null;

  const resultBox = document.getElementById("act-spell-result");

  let castMessage = "";
  let effectSummary = "";

  if (spell.effect === "heal-bp") {
    const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
    const curBP = hero["robos:currentBP"] !== undefined ? hero["robos:currentBP"] : maxBP;
    const healedBP = Math.min(maxBP, curBP + spell.val);
    const amount = healedBP - curBP;
    hero["robos:currentBP"] = healedBP;
    renderVitalityPips(hero);
    castMessage = `✨ [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! Restored ${amount} BP (Current BP: ${healedBP}/${maxBP}).`;
    effectSummary = `+${amount} BP Healed!`;
  } else if (spell.effect === "damage-bp") {
    castMessage = `🔥 [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! Dealt ${spell.val} magical BP damage (target defends with combat dice).`;
    effectSummary = `${spell.val} BP Damage Dealt`;
  } else if (spell.effect === "summon-attack") {
    castMessage = `🌪️ [MAGIC] ${hero["dcterms:title"]} summoned Genie! Attacking target with ${spell.val} combat dice.`;
    effectSummary = `Genie Strikes with ${spell.val} Dice!`;
  } else if (spell.effect === "buff-def" || spell.effect === "buff-atk" || spell.effect === "buff-move") {
    castMessage = `✨ [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! Applied active enhancement effect: ${spell.description}`;
    effectSummary = `Buff Active!`;
  } else {
    castMessage = `🔮 [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! ${spell.description}`;
    effectSummary = `Spell Effect Active`;
  }

  if (resultBox) {
    resultBox.innerHTML = `
      <span class="dice-badge dice-shield"><img src="${getSpellIconUrl(spell)}" alt="" style="width:16px; height:16px; border-radius:3px; vertical-align:middle; margin-right:4px;"> ${spell.name}</span>
      <span style="font-size:0.75rem; color:#a7f3d0; font-weight:600;">${effectSummary}</span>
    `;
  }

  logCombatAction(castMessage, "system");
  triggerHeroAutosave();
  return { spell, effectSummary, castMessage };
}

function renderSpellDraftSummaryBadges() {
  const badge = document.getElementById("spells-draft-summary-badge");
  if (badge) {
    const elfDeck = ELEMENTAL_DECKS[currentData.spellAllocation.elfElement]?.name || currentData.spellAllocation.elfElement;
    const wizDecks = currentData.spellAllocation.wizardElements
      .map(e => ELEMENTAL_DECKS[e]?.name?.replace(" Magic", "") || e)
      .join(", ");
    badge.textContent = `Elf: ${elfDeck} (3) | Wizard: ${wizDecks} (9)`;
  }
}

let spellDraftControlsInitialized = false;
function setupSpellDraftControls() {
  if (spellDraftControlsInitialized) return;
  spellDraftControlsInitialized = true;

  document.getElementById("btn-cast-hero-spell")?.addEventListener("click", () => {
    const hero = getActiveHero();
    const selectEl = document.getElementById("act-spell-select");
    const spellId = selectEl?.value;
    if (hero && spellId) {
      castHeroSpell(hero, spellId);
    }
  });
}

// ==========================================
// 2. HERO EDITOR & CHARACTER STATE ENGINE
// ==========================================

function getActiveHero() {
  if (!currentData.activeHeroId && currentData.heroes.length > 0) {
    currentData.activeHeroId = currentData.heroes[0]["@id"];
  }
  return currentData.heroes.find(h => h["@id"] === currentData.activeHeroId)
    || getAllHeroesCatalog().find(h => h["@id"] === currentData.activeHeroId);
}

function getHeroClass(h) {
  if (h["robos:heroClass"]) return h["robos:heroClass"];
  if (h.heroClass) return h.heroClass;
  const title = (h["dcterms:title"] || h.name || "").toLowerCase();
  if (title.includes("barbarian") || title.includes("obama")) return "Barbarian";
  if (title.includes("dwarf") || title.includes("trump")) return "Dwarf";
  if (title.includes("elf") || title.includes("hillary")) return "Elf";
  if (title.includes("wizard") || title.includes("bernie")) return "Wizard";
  return "Warrior";
}

function getHeroName(h) {
  if (!h) return "Hero";
  if (h["robos:characterName"]) return h["robos:characterName"];
  if (h.characterName) return h.characterName;
  const title = h["dcterms:title"] || h.name || "";
  const heroClass = getHeroClass(h);
  if (!title || title.toLowerCase() === heroClass.toLowerCase() || title.toLowerCase() === (h["@id"] || "").toLowerCase()) {
    const id = (h["@id"] || h.id || "").toLowerCase();
    if (id.includes("obama")) return "Barack Obama";
    if (id.includes("trump")) return "Donald Trump";
    if (id.includes("hillary")) return "Hillary Clinton";
    if (id.includes("bernie")) return "Bernie Sanders";
    if (id.includes("barbarian")) return "Rogar";
    if (id.includes("dwarf")) return "Dorgan";
    if (id.includes("elf")) return "Ladril";
    if (id.includes("wizard")) return "Telor";
  }
  return title || heroClass;
}

function getHeroWeapon(h) {
  if (h["robos:equippedWeapon"]) return h["robos:equippedWeapon"];
  if (h["robos:startingWeapon"]) {
    const sw = h["robos:startingWeapon"];
    if (sw.includes("broadsword")) return "Broadsword (3 Combat Dice)";
    if (sw.includes("shortsword")) return "Shortsword (2 Combat Dice)";
    if (sw.includes("dagger")) return "Dagger (1 Combat Die)";
    return sw;
  }
  return "Broadsword (3 Combat Dice)";
}

function getHeroArmor(h) {
  if (h["robos:equippedArmor"]) return h["robos:equippedArmor"];
  const heroClass = getHeroClass(h);
  if (heroClass === "Barbarian") return "Natural Toughness (2 Defend Dice)";
  if (heroClass === "Dwarf") return "Shield & Chainmail (+2 Defend Dice)";
  if (heroClass === "Elf") return "Elven Leather & Cloak (+2 Defend Dice)";
  if (heroClass === "Wizard") return "Wizard Cloak (2 Defend Dice)";
  return "Chainmail & Shield (+2 Defend Dice)";
}

function getHeroInventory(h) {
  if (Array.isArray(h["robos:inventory"])) return h["robos:inventory"];
  const heroClass = getHeroClass(h);
  if (heroClass === "Barbarian") {
    h["robos:inventory"] = [
      { id: "item-pot-heal-1", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 },
      { id: "item-rope-1", name: "Heavy Rope (30 ft)", type: "tool", effect: "Climb pits & gaps", value: 25 }
    ];
  } else if (heroClass === "Dwarf") {
    h["robos:inventory"] = [
      { id: "item-toolkit-1", name: "Trap Disarm Toolkit", type: "tool", effect: "Disarm traps without rolling skull", value: 75 },
      { id: "item-pot-heal-2", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ];
  } else if (heroClass === "Elf") {
    h["robos:inventory"] = [
      { id: "item-torch-1", name: "Dungeon Torch", type: "tool", effect: "Detect hidden traps in room", value: 15 },
      { id: "item-strength-1", name: "Potion of Strength", type: "potion", effect: "+2 Attack Dice for 1 turn", value: 150 }
    ];
  } else if (heroClass === "Wizard") {
    h["robos:inventory"] = [
      { id: "item-holy-water-1", name: "Holy Water", type: "relic", effect: "Destroys undead instantly", value: 200 },
      { id: "item-pot-heal-3", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ];
  } else {
    h["robos:inventory"] = [
      { id: "item-pot-heal-def", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ];
  }
  return h["robos:inventory"];
}

// Render Heroes Sidebar List (Supports Hero Packs: Base Game, Midterms 2026, etc.)
function renderHeroesList() {
  if (currentData.campaign && currentData.campaign.heroes !== currentData.heroes) {
    currentData.campaign.heroes = currentData.heroes;
  }
  const filterCat = currentData.activeHeroCategoryFilter || "All";
  const displayedHeroes = filterCat === "All"
    ? getAllHeroesCatalog()
    : getHeroesByCategory(filterCat);

  const countEl = document.getElementById("campaign-subtab-heroes-count");
  if (countEl) countEl.textContent = String(currentData.heroes.length);

  const container = document.getElementById("heroes-list");
  if (!container) return;
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  displayedHeroes.forEach(h => {
    const div = document.createElement("div");
    div.className = "list-item" + (h["@id"] === currentData.activeHeroId ? " active" : "");
    div.dataset.heroId = h["@id"];

    const heroClass = getHeroClass(h);
    const heroName = getHeroName(h);
    const heroCat = h["robos:category"] || h.category || "Base Game";
    const catBadge = heroCat === "Midterms 2026" ? "🗳️ Midterms 2026" : (heroCat === "Base Game" ? "🏰 Base Game" : `🏷️ ${heroCat}`);
    const gold = h["robos:gold"] !== undefined ? h["robos:gold"] : 100;
    const tokUrl = getHeroTokenUrl(h);

    div.innerHTML = `
      <img src="${tokUrl}" alt="${escapeHtml(heroName)}" style="width:32px; height:32px; object-fit:contain; flex-shrink:0;">
      <div class="hero-item-details" style="min-width:0; flex:1;">
        <strong class="hero-item-name">${heroName}</strong>
        <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-top:2px;">
          <span class="hero-class-tag">${heroClass}</span>
          <span class="badge" style="font-size:9px; padding:1px 5px; background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);">${catBadge}</span>
        </div>
      </div>
      <span class="gold-badge hero-item-gold">${gold}gp</span>
    `;

    div.onclick = () => selectHero(h["@id"]);
    fragment.appendChild(div);
  });
  container.appendChild(fragment);

  if (!currentData.activeHeroId && displayedHeroes.length > 0) {
    selectHero(displayedHeroes[0]["@id"]);
  }
}

function updateHeroPortraitCardPreview(hero) {
  if (!hero) return;
  const heroName = getHeroName(hero);
  const heroClass = getHeroClass(hero);
  const bp = hero["robos:bodyPoints"] || 8;
  const mp = hero["robos:mindPoints"] || 2;
  const atk = hero["robos:attackDice"] || 3;
  const def = hero["robos:defendDice"] || 2;
  const portUrl = getHeroPortraitUrl(hero);
  const tokUrl = getHeroTokenUrl(hero);

  const cardBg = document.getElementById("hero-card-bg-img");
  if (cardBg) cardBg.src = portUrl;
  const cardTok = document.getElementById("hero-card-token-img");
  if (cardTok) cardTok.src = tokUrl;
  const cardTitle = document.getElementById("hero-card-title-label");
  if (cardTitle) cardTitle.textContent = heroName;
  const cardClass = document.getElementById("hero-card-class-label");
  if (cardClass) cardClass.textContent = `Class: ${heroClass}`;
  const cardStats = document.getElementById("hero-card-stats-label");
  if (cardStats) cardStats.textContent = `❤️${bp} 🧠${mp} ⚔️${atk} 🛡️${def}`;
}

function selectHero(heroId) {
  currentData.activeHeroId = heroId;
  const hero = currentData.heroes.find(h => h["@id"] === heroId)
    || getAllHeroesCatalog().find(h => h["@id"] === heroId);
  if (!hero) return;

  // Ensure default state properties
  if (hero["robos:heroClass"] === undefined) hero["robos:heroClass"] = getHeroClass(hero);
  if (hero["robos:category"] === undefined) {
    const k = resolveHeroAssetKey(hero);
    hero["robos:category"] = ["obama", "trump", "hillary_clinton", "bernie_sanders"].includes(k) ? "Midterms 2026" : "Base Game";
  }
  if (hero["robos:gold"] === undefined) hero["robos:gold"] = 100;
  if (hero["robos:equippedWeapon"] === undefined) hero["robos:equippedWeapon"] = getHeroWeapon(hero);
  if (hero["robos:equippedArmor"] === undefined) hero["robos:equippedArmor"] = getHeroArmor(hero);
  if (!Array.isArray(hero["robos:inventory"])) hero["robos:inventory"] = getHeroInventory(hero);

  const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
  const maxMP = parseInt(hero["robos:mindPoints"], 10) || 2;
  if (hero["robos:currentBP"] === undefined) hero["robos:currentBP"] = maxBP;
  if (hero["robos:currentMP"] === undefined) hero["robos:currentMP"] = maxMP;

  // In-place active toggle to avoid full list re-render
  const items = document.querySelectorAll("#heroes-list .list-item");
  if (items.length > 0) {
    items.forEach(el => {
      el.classList.toggle("active", el.dataset.heroId === heroId);
    });
  } else {
    renderHeroesList();
  }

  // Populate Hero Form
  const heroName = getHeroName(hero);
  const heroCategory = hero["robos:category"] || hero.category || "Base Game";
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const titleEl = document.getElementById("hero-editor-title");
  if (titleEl) titleEl.textContent = "Edit Hero: " + heroName;
  const catBadgeEl = document.getElementById("hero-category-badge");
  if (catBadgeEl) catBadgeEl.textContent = heroCategory;
  setVal("hero-id", hero["@id"] || "");
  setVal("hero-name", heroName);
  setVal("hero-class", hero["robos:heroClass"] || "");
  setVal("hero-category", heroCategory);
  setVal("hero-bp", hero["robos:bodyPoints"] || 8);
  setVal("hero-mp", hero["robos:mindPoints"] || 2);
  setVal("hero-atk", hero["robos:attackDice"] || 3);
  setVal("hero-def", hero["robos:defendDice"] || 2);
  setVal("hero-gold", hero["robos:gold"] !== undefined ? hero["robos:gold"] : 100);
  setVal("hero-weapon", hero["robos:equippedWeapon"] || hero["robos:startingWeapon"] || "");
  setVal("hero-armor", hero["robos:equippedArmor"] || "");
  setVal("hero-ability", hero["robos:specialAbility"] || "");
  setVal("hero-color", hero["robos:tokenColor"] || "#b91c1c");
  setVal("hero-icon", hero["robos:icon"] || "🛡️");
  setVal("hero-pos-x", (hero["robos:startingPosition"] && hero["robos:startingPosition"][0]) || 1);
  setVal("hero-pos-y", (hero["robos:startingPosition"] && hero["robos:startingPosition"][1]) || 1);

  const heroAssetKey = resolveHeroAssetKey(hero);
  const heroPortImg = document.getElementById("hero-portrait-preview");
  if (heroPortImg) heroPortImg.src = getHeroPortraitUrl(hero);
  const heroTokImg = document.getElementById("hero-token-preview");
  if (heroTokImg) heroTokImg.src = getHeroTokenUrl(hero);
  const heroPortLbl = document.getElementById("hero-portrait-path-label");
  if (heroPortLbl) heroPortLbl.textContent = `card_bg_${heroAssetKey}.png`;
  const heroTokLbl = document.getElementById("hero-token-path-label");
  if (heroTokLbl) heroTokLbl.textContent = `token_${heroAssetKey}.png`;

  updateHeroPortraitCardPreview(hero);

  // Render Inventory, Grimoire, Audio Lines & Action Screen
  renderHeroInventory(hero);
  renderHeroGrimoire(hero);
  renderHeroAudioLines(hero);
  renderHeroActionScreen(hero);
}

let _activeHeroAudioPreview = null;
function renderHeroAudioLines(hero) {
  const container = document.getElementById("hero-audio-lines-list");
  if (!container || !hero) return;
  const assetKey = resolveHeroAssetKey(hero);
  if (!hero["robos:audioLines"] || typeof hero["robos:audioLines"] !== "object") {
    hero["robos:audioLines"] = JSON.parse(JSON.stringify(
      DEFAULT_HERO_AUDIO_LINES_MAP[assetKey] || DEFAULT_HERO_AUDIO_LINES_MAP.barbarian
    ));
  }
  const al = hero["robos:audioLines"];
  const situations = [
    { key: "turnStart", label: "🎬 When Turn Begins (turnStart)" },
    { key: "attacking", label: "⚔️ Attacking (attacking)" },
    { key: "attacked", label: "🩸 Attacked / Damaged (attacked)" },
    { key: "defended", label: "🛡️ Defended / Blocked (defended)" },
    { key: "castingMagic", label: "✨ Casting Magic (castingMagic)" }
  ];
  container.innerHTML = "";
  situations.forEach(sit => {
    const arr = Array.isArray(al[sit.key]) ? al[sit.key] : (al[sit.key] ? [al[sit.key]] : []);
    const first = arr[0] || { text: "", audio: "" };
    const row = document.createElement("div");
    row.style.cssText = "background:rgba(15,23,42,0.65); border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:6px;";
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; font-weight:600; color:#fbbf24;">${sit.label}</span>
        <button type="button" class="btn btn-sm btn-secondary hero-audio-play-btn" style="padding:2px 8px; font-size:11px;">▶ Preview Audio</button>
      </div>
      <input type="text" class="form-input hero-audio-text-input" placeholder="Spoken quote text..." value="${String(first.text || "").replace(/"/g, "&quot;")}" style="font-size:12px;">
      <input type="text" class="form-input hero-audio-path-input" placeholder="res://assets/audio/heroes/..." value="${String(first.audio || "").replace(/"/g, "&quot;")}" style="font-size:11px; color:#94a3b8; font-family:monospace;">
    `;
    const textInput = row.querySelector(".hero-audio-text-input");
    const pathInput = row.querySelector(".hero-audio-path-input");
    const playBtn = row.querySelector(".hero-audio-play-btn");
    const syncSituation = () => {
      hero["robos:audioLines"][sit.key] = [{
        text: textInput.value.trim(),
        audio: pathInput.value.trim()
      }];
      if (typeof triggerCampaignAutosave === "function") triggerCampaignAutosave();
    };
    textInput.addEventListener("change", syncSituation);
    pathInput.addEventListener("change", syncSituation);
    playBtn.addEventListener("click", () => {
      const rawPath = pathInput.value.trim();
      if (!rawPath) return;
      const rel = rawPath.replace(/^res:\/\//, "");
      const fileUrl = `../../../games/tabletop-rpg/${rel}`;
      if (_activeHeroAudioPreview) {
        _activeHeroAudioPreview.pause();
        _activeHeroAudioPreview = null;
      }
      _activeHeroAudioPreview = new Audio(fileUrl);
      _activeHeroAudioPreview.play().catch(err => console.warn("Audio preview error:", err));
    });
    container.appendChild(row);
  });
}

// Render Backpack Inventory
function renderHeroInventory(hero) {
  const container = document.getElementById("hero-inventory-list");
  if (!container) return;
  const items = hero["robos:inventory"] || [];
  if (items.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:0.8rem; font-style:italic;">Backpack is empty. Select an item above and click "+ Add Item".</div>`;
    return;
  }
  container.innerHTML = "";
  items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "inventory-item-row";
    const itemIconUrl = getItemIconUrl(item);
    row.innerHTML = `
      <div class="inventory-item-info">
        <img src="${itemIconUrl}" alt="" style="width:28px; height:28px; border-radius:6px; object-fit:cover; flex-shrink:0;">
        <div>
          <strong>${item.name}</strong>
          <div class="inventory-item-type">${item.type || 'item'} • ${item.effect || ''}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span class="inventory-item-val">${item.value ? item.value + ' GP' : ''}</span>
        <button class="btn btn-xs btn-secondary btn-trade-item" data-idx="${idx}" title="Trade item to another hero between quests">🤝 Trade</button>
        <button class="btn btn-xs btn-danger btn-del-item" data-idx="${idx}" title="Remove Item">✕</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll(".btn-trade-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      openBetweenQuestsTradeModal(hero["@id"]);
    });
  });

  container.querySelectorAll(".btn-del-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const removed = hero["robos:inventory"].splice(idx, 1)[0];
      renderHeroInventory(hero);
      logCombatAction(`🎒 Removed ${removed?.name || 'item'} from inventory.`, "system");
      triggerHeroAutosave();
    });
  });
}

const PRESET_ITEMS = {
  "potion-healing": { id: "item-pot-heal", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 },
  "holy-water": { id: "item-holy-water", name: "Holy Water", type: "relic", effect: "Dispel/Kill Undead", value: 200 },
  "tool-kit": { id: "item-tool-kit", name: "Trap Disarm Toolkit", type: "tool", effect: "Disarm traps without rolling skull", value: 75 },
  "heavy-rope": { id: "item-rope", name: "Heavy Rope (30 ft)", type: "tool", effect: "Cross pits or climb chasms", value: 25 },
  "torch": { id: "item-torch", name: "Dungeon Torch", type: "tool", effect: "Light darkness for 3 turns", value: 15 },
  "potion-strength": { id: "item-strength", name: "Potion of Strength", type: "potion", effect: "+2 Attack Dice for 1 turn", value: 150 }
};

function addHeroInventoryItem() {
  const hero = getActiveHero();
  if (!hero) return;
  const select = document.getElementById("hero-preset-item");
  const key = select?.value || "potion-healing";
  const preset = PRESET_ITEMS[key] || PRESET_ITEMS["potion-healing"];
  if (!hero["robos:inventory"]) hero["robos:inventory"] = [];
  hero["robos:inventory"].push({ ...preset, id: `${preset.id}-${Date.now().toString(36)}` });
  renderHeroInventory(hero);
  logCombatAction(`🎒 Added ${preset.name} to ${hero["dcterms:title"]}'s backpack.`, "system");
  triggerHeroAutosave();
}

function removeHeroInventoryItem(index) {
  const hero = getActiveHero();
  if (!hero || !hero["robos:inventory"]) return;
  const removed = hero["robos:inventory"].splice(index, 1)[0];
  renderHeroInventory(hero);
  logCombatAction(`🎒 Removed ${removed?.name || 'item'} from inventory.`, "system");
  triggerHeroAutosave();
}

// ==========================================
// 2B. HERO ITEM & EQUIPMENT TRADE ENGINE (Between Quests)
// ==========================================

let tradeSessionLogs = [];
let tradeHeroAId = null;
let tradeHeroBId = null;

function getHeroById(heroId) {
  if (!Array.isArray(currentData.heroes)) return null;
  return currentData.heroes.find(h => h["@id"] === heroId || (h["@id"] && h["@id"].toLowerCase().includes(String(heroId).toLowerCase())));
}

function tradeHeroItem(fromHeroId, toHeroId, itemIndexOrId) {
  const fromHero = getHeroById(fromHeroId);
  const toHero = getHeroById(toHeroId);
  if (!fromHero) return { success: false, error: `Giving hero not found: ${fromHeroId}` };
  if (!toHero) return { success: false, error: `Recipient hero not found: ${toHeroId}` };
  if (fromHero["@id"] === toHero["@id"]) return { success: false, error: "Cannot trade item to the same hero" };

  if (!Array.isArray(fromHero["robos:inventory"])) fromHero["robos:inventory"] = getHeroInventory(fromHero);
  if (!Array.isArray(toHero["robos:inventory"])) toHero["robos:inventory"] = getHeroInventory(toHero);

  let itemIdx = -1;
  let tradedItem = null;

  if (typeof itemIndexOrId === "number") {
    itemIdx = itemIndexOrId;
    if (itemIdx < 0 || itemIdx >= fromHero["robos:inventory"].length) {
      return { success: false, error: `Invalid item index ${itemIndexOrId}` };
    }
    tradedItem = fromHero["robos:inventory"].splice(itemIdx, 1)[0];
  } else {
    const key = String(itemIndexOrId).toLowerCase().trim().replace(/-/g, "_");
    itemIdx = fromHero["robos:inventory"].findIndex(it => {
      const itId = String(it.id || it.name || it).toLowerCase().trim().replace(/-/g, "_");
      return itId === key || itId.includes(key);
    });
    if (itemIdx !== -1) {
      tradedItem = fromHero["robos:inventory"].splice(itemIdx, 1)[0];
    } else {
      // Check if equipped weapon or armor
      const eqWep = String(fromHero["robos:equippedWeapon"] || "").toLowerCase().replace(/-/g, "_");
      const eqArm = String(fromHero["robos:equippedArmor"] || "").toLowerCase().replace(/-/g, "_");
      if (eqWep.includes(key) || key.includes("weapon") || key.includes("broadsword") || key.includes("shortsword")) {
        tradedItem = { id: `wep-${Date.now()}`, name: fromHero["robos:equippedWeapon"] || "Weapon", type: "weapon", effect: "Equipped weapon", value: 150 };
        fromHero["robos:equippedWeapon"] = getHeroClass(fromHero) === "Wizard" ? "Dagger (1 Combat Die)" : "Shortsword (2 Combat Dice)";
      } else if (eqArm.includes(key) || key.includes("armor") || key.includes("shield")) {
        tradedItem = { id: `arm-${Date.now()}`, name: fromHero["robos:equippedArmor"] || "Armor", type: "armor", effect: "Equipped armor", value: 100 };
        fromHero["robos:equippedArmor"] = "Natural Toughness (2 Defend Dice)";
      } else {
        return { success: false, error: `Item '${itemIndexOrId}' not found in ${getHeroName(fromHero)}'s inventory` };
      }
    }
  }

  toHero["robos:inventory"].push(tradedItem);

  const itemName = tradedItem.name || tradedItem.id || "Item";
  const fromName = getHeroName(fromHero);
  const toName = getHeroName(toHero);
  const logMsg = `🤝 ${fromName} passed ${itemName} to ${toName}.`;

  tradeSessionLogs.unshift(logMsg);
  setStatus(logMsg);
  logCombatAction(`[EXCHANGE] ${logMsg}`, "system");

  // Re-render UI
  renderHeroesList();
  const activeH = getActiveHero();
  if (activeH && (activeH["@id"] === fromHero["@id"] || activeH["@id"] === toHero["@id"])) {
    renderHeroInventory(activeH);
  }
  renderPartyTradeModal();
  triggerHeroAutosave();

  return {
    success: true,
    action: "trade_item",
    item: tradedItem,
    fromHero: fromHero["@id"],
    fromHeroName: fromName,
    toHero: toHero["@id"],
    toHeroName: toName
  };
}

function tradeHeroGold(fromHeroId, toHeroId, amount) {
  const fromHero = getHeroById(fromHeroId);
  const toHero = getHeroById(toHeroId);
  if (!fromHero) return { success: false, error: `Giving hero not found: ${fromHeroId}` };
  if (!toHero) return { success: false, error: `Recipient hero not found: ${toHeroId}` };
  if (fromHero["@id"] === toHero["@id"]) return { success: false, error: "Cannot transfer gold to self" };

  const amt = parseInt(amount, 10);
  if (isNaN(amt) || amt <= 0) return { success: false, error: "Amount must be a positive integer" };

  const curGold = parseInt(fromHero["robos:gold"], 10) || 0;
  if (curGold < amt) {
    return { success: false, error: `${getHeroName(fromHero)} only has ${curGold} GP (cannot transfer ${amt} GP)` };
  }

  fromHero["robos:gold"] = curGold - amt;
  toHero["robos:gold"] = (parseInt(toHero["robos:gold"], 10) || 0) + amt;

  const fromName = getHeroName(fromHero);
  const toName = getHeroName(toHero);
  const logMsg = `🪙 ${fromName} transferred ${amt} Gold Coins to ${toName}.`;

  tradeSessionLogs.unshift(logMsg);
  setStatus(logMsg);
  logCombatAction(`[EXCHANGE] ${logMsg}`, "system");

  // Re-render UI
  renderHeroesList();
  const activeH = getActiveHero();
  if (activeH && (activeH["@id"] === fromHero["@id"] || activeH["@id"] === toHero["@id"])) {
    const goldInput = document.getElementById("hero-gold");
    if (goldInput) goldInput.value = activeH["robos:gold"];
    const actGold = document.getElementById("act-hero-gold");
    if (actGold) actGold.textContent = `${activeH["robos:gold"]} GP`;
  }
  renderPartyTradeModal();
  triggerHeroAutosave();

  return {
    success: true,
    action: "trade_gold",
    amount: amt,
    fromHero: fromHero["@id"],
    fromHeroName: fromName,
    fromGold: fromHero["robos:gold"],
    toHero: toHero["@id"],
    toHeroName: toName,
    toGold: toHero["robos:gold"]
  };
}

function openBetweenQuestsTradeModal(preselectHeroAId = null, preselectHeroBId = null) {
  if (!Array.isArray(currentData.heroes) || currentData.heroes.length < 2) {
    setStatus("Need at least 2 heroes in the party to trade items.");
    return;
  }

  const modal = document.getElementById("modal-between-quests-trade");
  if (!modal) return;

  tradeHeroAId = preselectHeroAId || currentData.activeHeroId || currentData.heroes[0]["@id"];
  if (preselectHeroBId) {
    tradeHeroBId = preselectHeroBId;
  } else {
    const other = currentData.heroes.find(h => h["@id"] !== tradeHeroAId);
    tradeHeroBId = other ? other["@id"] : currentData.heroes[1]["@id"];
  }

  setupHeroTradeControls();
  populateTradeHeroSelects();
  renderPartyTradeModal();
  modal.style.display = "flex";
}

function closeBetweenQuestsTradeModal() {
  const modal = document.getElementById("modal-between-quests-trade");
  if (modal) modal.style.display = "none";
  const activeH = getActiveHero();
  if (activeH) {
    selectHero(activeH["@id"]);
  }
}

function populateTradeHeroSelects() {
  const selectA = document.getElementById("trade-hero-a-select");
  const selectB = document.getElementById("trade-hero-b-select");
  if (!selectA || !selectB) return;

  selectA.innerHTML = "";
  selectB.innerHTML = "";

  currentData.heroes.forEach(h => {
    const optA = document.createElement("option");
    optA.value = h["@id"];
    optA.textContent = `${getHeroName(h)} (${getHeroClass(h)})`;
    if (h["@id"] === tradeHeroAId) optA.selected = true;
    selectA.appendChild(optA);

    const optB = document.createElement("option");
    optB.value = h["@id"];
    optB.textContent = `${getHeroName(h)} (${getHeroClass(h)})`;
    if (h["@id"] === tradeHeroBId) optB.selected = true;
    selectB.appendChild(optB);
  });
}

function renderPartyTradeModal() {
  const heroA = getHeroById(tradeHeroAId) || currentData.heroes[0];
  const heroB = getHeroById(tradeHeroBId) || currentData.heroes[1];
  if (!heroA || !heroB) return;

  const iconA = document.getElementById("trade-hero-a-icon");
  const goldA = document.getElementById("trade-hero-a-gold");
  const iconB = document.getElementById("trade-hero-b-icon");
  const goldB = document.getElementById("trade-hero-b-gold");

  if (iconA) iconA.textContent = heroA["robos:icon"] || "🛡️";
  if (goldA) goldA.textContent = `${heroA["robos:gold"] !== undefined ? heroA["robos:gold"] : 100} GP`;
  if (iconB) iconB.textContent = heroB["robos:icon"] || "⚔️";
  if (goldB) goldB.textContent = `${heroB["robos:gold"] !== undefined ? heroB["robos:gold"] : 100} GP`;

  const eqAEl = document.getElementById("trade-hero-a-equipped");
  if (eqAEl) {
    eqAEl.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:4px 8px; border-radius:4px;">
        <span>⚔️ ${heroA["robos:equippedWeapon"] || getHeroWeapon(heroA)}</span>
        <button class="btn btn-xs btn-secondary btn-trade-wep-a" title="Pass equipped weapon to ${getHeroName(heroB)}">Pass ➔</button>
      </div>
      <div style="font-size:12px; color:#cbd5e1; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:4px 8px; border-radius:4px;">
        <span>🛡️ ${heroA["robos:equippedArmor"] || getHeroArmor(heroA)}</span>
        <button class="btn btn-xs btn-secondary btn-trade-arm-a" title="Pass equipped armor to ${getHeroName(heroB)}">Pass ➔</button>
      </div>
    `;
    eqAEl.querySelector(".btn-trade-wep-a")?.addEventListener("click", () => {
      tradeHeroItem(heroA["@id"], heroB["@id"], "weapon");
    });
    eqAEl.querySelector(".btn-trade-arm-a")?.addEventListener("click", () => {
      tradeHeroItem(heroA["@id"], heroB["@id"], "armor");
    });
  }

  const eqBEl = document.getElementById("trade-hero-b-equipped");
  if (eqBEl) {
    eqBEl.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:4px 8px; border-radius:4px;">
        <span>⚔️ ${heroB["robos:equippedWeapon"] || getHeroWeapon(heroB)}</span>
        <button class="btn btn-xs btn-secondary btn-trade-wep-b" title="Pass equipped weapon to ${getHeroName(heroA)}">⬅ Pass</button>
      </div>
      <div style="font-size:12px; color:#cbd5e1; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:4px 8px; border-radius:4px;">
        <span>🛡️ ${heroB["robos:equippedArmor"] || getHeroArmor(heroB)}</span>
        <button class="btn btn-xs btn-secondary btn-trade-arm-b" title="Pass equipped armor to ${getHeroName(heroA)}">⬅ Pass</button>
      </div>
    `;
    eqBEl.querySelector(".btn-trade-wep-b")?.addEventListener("click", () => {
      tradeHeroItem(heroB["@id"], heroA["@id"], "weapon");
    });
    eqBEl.querySelector(".btn-trade-arm-b")?.addEventListener("click", () => {
      tradeHeroItem(heroB["@id"], heroA["@id"], "armor");
    });
  }

  const invAEl = document.getElementById("trade-hero-a-inventory");
  if (invAEl) {
    const itemsA = Array.isArray(heroA["robos:inventory"]) ? heroA["robos:inventory"] : getHeroInventory(heroA);
    if (itemsA.length === 0) {
      invAEl.innerHTML = `<span style="color:#64748b; font-size:11px; font-style:italic; padding:6px 0;">Backpack is empty.</span>`;
    } else {
      invAEl.innerHTML = "";
      itemsA.forEach((it, idx) => {
        const itemRow = document.createElement("div");
        itemRow.className = "trade-item-chip";
        itemRow.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.8); border:1px solid var(--border-color); padding:6px 8px; border-radius:4px;";
        itemRow.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:13px;">🎒</span>
            <div>
              <strong style="font-size:12px; color:#f1f5f9;">${it.name || it.id}</strong>
              <div style="font-size:10px; color:#94a3b8;">${it.type || 'item'} • ${it.effect || ''}</div>
            </div>
          </div>
          <button class="btn btn-xs btn-primary btn-pass-item-a2b" data-idx="${idx}" title="Pass ${it.name || 'item'} to ${getHeroName(heroB)}">Pass ➔</button>
        `;
        invAEl.appendChild(itemRow);
      });
      invAEl.querySelectorAll(".btn-pass-item-a2b").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.idx, 10);
          tradeHeroItem(heroA["@id"], heroB["@id"], idx);
        });
      });
    }
  }

  const invBEl = document.getElementById("trade-hero-b-inventory");
  if (invBEl) {
    const itemsB = Array.isArray(heroB["robos:inventory"]) ? heroB["robos:inventory"] : getHeroInventory(heroB);
    if (itemsB.length === 0) {
      invBEl.innerHTML = `<span style="color:#64748b; font-size:11px; font-style:italic; padding:6px 0;">Backpack is empty.</span>`;
    } else {
      invBEl.innerHTML = "";
      itemsB.forEach((it, idx) => {
        const itemRow = document.createElement("div");
        itemRow.className = "trade-item-chip";
        itemRow.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.8); border:1px solid var(--border-color); padding:6px 8px; border-radius:4px;";
        itemRow.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:13px;">🎒</span>
            <div>
              <strong style="font-size:12px; color:#f1f5f9;">${it.name || it.id}</strong>
              <div style="font-size:10px; color:#94a3b8;">${it.type || 'item'} • ${it.effect || ''}</div>
            </div>
          </div>
          <button class="btn btn-xs btn-primary btn-pass-item-b2a" data-idx="${idx}" title="Pass ${it.name || 'item'} to ${getHeroName(heroA)}">⬅ Pass</button>
        `;
        invBEl.appendChild(itemRow);
      });
      invBEl.querySelectorAll(".btn-pass-item-b2a").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.idx, 10);
          tradeHeroItem(heroB["@id"], heroA["@id"], idx);
        });
      });
    }
  }

  const logEl = document.getElementById("trade-log-entries");
  if (logEl) {
    if (tradeSessionLogs.length === 0) {
      logEl.innerHTML = `<span style="color:#64748b; font-style:italic;">No trades made yet between quests. Click 'Pass' on any item or gold amount to exchange.</span>`;
    } else {
      logEl.innerHTML = tradeSessionLogs.map(l => `<div>${escapeHtml(l)}</div>`).join("");
    }
  }
}

let heroTradeControlsInitialized = false;
function setupHeroTradeControls() {
  if (heroTradeControlsInitialized) return;
  heroTradeControlsInitialized = true;

  document.getElementById("btn-open-party-trade")?.addEventListener("click", () => openBetweenQuestsTradeModal());
  document.getElementById("btn-trade-between-quests-banner")?.addEventListener("click", () => openBetweenQuestsTradeModal());
  document.getElementById("btn-close-trade-modal")?.addEventListener("click", closeBetweenQuestsTradeModal);
  document.getElementById("btn-done-trade-modal")?.addEventListener("click", closeBetweenQuestsTradeModal);

  document.getElementById("trade-hero-a-select")?.addEventListener("change", (e) => {
    tradeHeroAId = e.target.value;
    renderPartyTradeModal();
  });
  document.getElementById("trade-hero-b-select")?.addEventListener("change", (e) => {
    tradeHeroBId = e.target.value;
    renderPartyTradeModal();
  });

  document.querySelectorAll(".btn-trade-gold-a").forEach(btn => {
    btn.addEventListener("click", () => {
      const amt = parseInt(btn.dataset.amt, 10);
      tradeHeroGold(tradeHeroAId, tradeHeroBId, amt);
    });
  });

  document.querySelectorAll(".btn-trade-gold-b").forEach(btn => {
    btn.addEventListener("click", () => {
      const amt = parseInt(btn.dataset.amt, 10);
      tradeHeroGold(tradeHeroBId, tradeHeroAId, amt);
    });
  });
}

// Render Action Screen & Combat HUD
function renderHeroActionScreen(hero) {
  if (!hero) return;
  const nameEl = document.getElementById("act-hero-name");
  const classEl = document.getElementById("act-hero-class");
  const goldEl = document.getElementById("act-hero-gold");
  const iconEl = document.getElementById("act-hero-icon");
  const atkStat = document.getElementById("act-atk-stat");
  const atkWeapon = document.getElementById("act-atk-weapon");
  const defStat = document.getElementById("act-def-stat");
  const defArmor = document.getElementById("act-def-armor");

  const heroName = getHeroName(hero);
  const heroClass = getHeroClass(hero);
  const heroGold = hero["robos:gold"] !== undefined ? hero["robos:gold"] : 100;

  if (nameEl) nameEl.textContent = heroName;
  if (classEl) classEl.textContent = heroClass;
  if (goldEl) goldEl.textContent = `💰 ${heroGold} GP`;
  if (iconEl) {
    const tokUrl = getHeroTokenUrl(hero);
    iconEl.innerHTML = `<img src="${tokUrl}" alt="${escapeHtml(heroName)}" style="width:100%; height:100%; object-fit:contain;">`;
    iconEl.style.borderColor = hero["robos:tokenColor"] || "#b91c1c";
  }

  const atkDice = hero["robos:attackDice"] || 3;
  const defDice = hero["robos:defendDice"] || 2;
  const weapon = getHeroWeapon(hero);
  const armor = getHeroArmor(hero);

  if (atkStat) atkStat.textContent = `${atkDice} Combat Dice`;
  if (atkWeapon) atkWeapon.textContent = weapon;
  if (defStat) defStat.textContent = `${defDice} Combat Dice`;
  if (defArmor) defArmor.textContent = armor;

  renderVitalityPips(hero);
  renderHeroSpellActionModule(hero);
}

function renderVitalityPips(hero) {
  const bpTrack = document.getElementById("act-bp-track");
  const mpTrack = document.getElementById("act-mp-track");
  const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
  const curBP = Math.max(0, Math.min(maxBP, hero["robos:currentBP"] !== undefined ? hero["robos:currentBP"] : maxBP));
  const maxMP = parseInt(hero["robos:mindPoints"], 10) || 2;
  const curMP = Math.max(0, Math.min(maxMP, hero["robos:currentMP"] !== undefined ? hero["robos:currentMP"] : maxMP));

  hero["robos:currentBP"] = curBP;
  hero["robos:currentMP"] = curMP;

  if (bpTrack) {
    bpTrack.innerHTML = "";
    for (let i = 0; i < maxBP; i++) {
      const pip = document.createElement("span");
      pip.className = `pip ${i < curBP ? 'bp-active' : 'bp-lost'}`;
      pip.title = `BP ${i + 1}/${maxBP}`;
      bpTrack.appendChild(pip);
    }
  }

  if (mpTrack) {
    mpTrack.innerHTML = "";
    for (let i = 0; i < maxMP; i++) {
      const pip = document.createElement("span");
      pip.className = `pip ${i < curMP ? 'mp-active' : 'mp-lost'}`;
      pip.title = `MP ${i + 1}/${maxMP}`;
      mpTrack.appendChild(pip);
    }
  }
}

// Combat Roll Actions
function rollHeroCombatDie() {
  const r = Math.floor(Math.random() * 6) + 1;
  if (r <= 3) return { type: "skull", label: "💀 Skull", faceClass: "dice-skull" };
  if (r <= 5) return { type: "white-shield", label: "🛡️ Shield", faceClass: "dice-shield" };
  return { type: "black-shield", label: "⬛ Black Shield", faceClass: "dice-black-shield" };
}

function rollHeroAttack() {
  const hero = getActiveHero();
  if (!hero) return null;
  const numDice = parseInt(hero["robos:attackDice"], 10) || 3;
  const rolls = [];
  let skulls = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    if (die.type === "skull") skulls++;
  }

  const resultBox = document.getElementById("act-atk-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  const weapon = getHeroWeapon(hero);
  logCombatAction(`⚔️ ${hero["dcterms:title"]} rolled Attack (${numDice} dice with ${weapon}): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${skulls} Skull${skulls !== 1 ? 's' : ''} Hit!]`, "attack");
  return { numDice, rolls, skulls };
}

function rollHeroDefend() {
  const hero = getActiveHero();
  if (!hero) return null;
  const numDice = parseInt(hero["robos:defendDice"], 10) || 2;
  const rolls = [];
  let shields = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    if (die.type === "white-shield") shields++;
  }

  const resultBox = document.getElementById("act-def-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  const armor = getHeroArmor(hero);
  logCombatAction(`🛡️ ${hero["dcterms:title"]} rolled Defend (${numDice} dice with ${armor}): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${shields} White Shield${shields !== 1 ? 's' : ''} Defended]`, "defend");
  return { numDice, rolls, shields };
}

function rollHeroMove() {
  const hero = getActiveHero();
  if (!hero) return null;
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const total = d1 + d2;

  const resultBox = document.getElementById("act-move-result");
  if (resultBox) {
    resultBox.innerHTML = `<span class="dice-badge dice-d6">🎲 ${d1}</span> + <span class="dice-badge dice-d6">🎲 ${d2}</span> = <strong>${total} Squares</strong>`;
  }

  logCombatAction(`🏃 ${hero["dcterms:title"]} rolled 2d6 Movement: [${d1}] + [${d2}] = ${total} squares available.`, "move");
  return { d1, d2, total };
}

function logCombatAction(msg, type = "system") {
  const logEl = document.getElementById("combat-roll-log");
  if (!logEl) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${msg}`;
  logEl.prepend(entry);
}

// Auto-save & Manual Save to KGraph
async function saveActiveHeroToKGraph(explicit = false) {
  const hero = getActiveHero();
  if (!hero) return { success: false, error: "No active hero" };

  const indicator = document.getElementById("hero-autosave-indicator");
  if (indicator) {
    indicator.textContent = "● Saving...";
    indicator.classList.add("saving");
  }

  const assetKey = resolveHeroAssetKey(hero);
  const heroCategory = hero["robos:category"] || document.getElementById("hero-category")?.value || "Base Game";
  const heroNode = {
    "@id": hero["@id"],
    "@type": [
      "oslc_am:Resource",
      "robos:TabletopHero",
      "robos:GameCharacter",
      "schema:Person"
    ],
    "dcterms:title": hero["dcterms:title"] || "Hero",
    "robos:characterName": hero["robos:characterName"] || hero["dcterms:title"] || "Hero",
    "robos:heroClass": hero["robos:heroClass"] || getHeroClass(hero),
    "robos:category": heroCategory,
    "robos:bodyPoints": parseInt(hero["robos:bodyPoints"], 10) || 8,
    "robos:mindPoints": parseInt(hero["robos:mindPoints"], 10) || 2,
    "robos:attackDice": parseInt(hero["robos:attackDice"], 10) || 3,
    "robos:defendDice": parseInt(hero["robos:defendDice"], 10) || 2,
    "robos:gold": parseInt(hero["robos:gold"], 10) || 0,
    "robos:startingWeapon": hero["robos:startingWeapon"] || getHeroWeapon(hero),
    "robos:equippedWeapon": hero["robos:equippedWeapon"] || getHeroWeapon(hero),
    "robos:equippedArmor": hero["robos:equippedArmor"] || getHeroArmor(hero),
    "robos:inventory": hero["robos:inventory"] || [],
    "robos:specialAbility": hero["robos:specialAbility"] || "",
    "robos:tokenColor": hero["robos:tokenColor"] || "#b91c1c",
    "robos:tokenAsset": hero["robos:tokenAsset"] || `assets/tokens/token_${assetKey}.png`,
    "robos:portraitAsset": hero["robos:portraitAsset"] || `assets/portraits/card_bg_${assetKey}.png`,
    "robos:icon": hero["robos:icon"] || "🛡️",
    "robos:startingPosition": hero["robos:startingPosition"] || [1, 1],
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  };

  try {
    const res = await window.robosTabletop.saveKGraphEntity({ entity: heroNode });
    if (currentData.campaign) {
      await saveCampaignToKGraph(currentData.campaign, false);
    }
    if (indicator) {
      setTimeout(() => {
        indicator.textContent = "● Saved";
        indicator.classList.remove("saving");
      }, 250);
    }
    if (explicit) {
      if (res && res.success) {
        setStatus(`Saved hero '${heroNode["dcterms:title"]}' (${heroNode["robos:heroClass"]}) to Knowledge Graph.`);
        logCombatAction(`💾 Hero '${heroNode["dcterms:title"]}' saved to Knowledge Graph package 'tabletop-game'.`, "system");
      } else {
        setStatus(`Error saving hero: ${res ? res.error : "Unknown"}`);
      }
    }
    return res;
  } catch (err) {
    if (indicator) {
      indicator.textContent = "● Error";
      indicator.classList.remove("saving");
    }
    if (explicit) setStatus(`Save failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

let heroAutosaveTimer = null;
function triggerHeroAutosave() {
  const indicator = document.getElementById("hero-autosave-indicator");
  if (indicator) {
    indicator.textContent = "● Editing...";
    indicator.classList.add("saving");
  }
  clearTimeout(heroAutosaveTimer);
  heroAutosaveTimer = setTimeout(() => {
    saveActiveHeroToKGraph(false);
  }, 400);
}

// Setup Event Listeners for Hero Editor
let heroControlsInitialized = false;
function setupHeroEditorControls() {
  if (heroControlsInitialized) return;
  heroControlsInitialized = true;

  // Live Name Updates
  document.getElementById("hero-name")?.addEventListener("input", (e) => {
    const hero = getActiveHero();
    if (!hero) return;
    const newName = e.target.value;
    hero["dcterms:title"] = newName;
    hero["robos:characterName"] = newName;
    document.getElementById("hero-editor-title").textContent = "Edit Hero: " + newName;

    const listItemName = document.querySelector(`#heroes-list .list-item[data-hero-id="${hero["@id"]}"] .hero-item-name`);
    if (listItemName) listItemName.textContent = newName;

    const actName = document.getElementById("act-hero-name");
    if (actName) actName.textContent = newName;

    updateHeroPortraitCardPreview(hero);
    triggerHeroAutosave();
  });

  // Live Class Updates
  document.getElementById("hero-class")?.addEventListener("input", (e) => {
    const hero = getActiveHero();
    if (!hero) return;
    const newClass = e.target.value;
    hero["robos:heroClass"] = newClass;

    const listClassTag = document.querySelector(`#heroes-list .list-item[data-hero-id="${hero["@id"]}"] .hero-class-tag`);
    if (listClassTag) listClassTag.textContent = newClass;

    const actClass = document.getElementById("act-hero-class");
    if (actClass) actClass.textContent = newClass;

    updateHeroPortraitCardPreview(hero);
    triggerHeroAutosave();
  });

  // Live Hero Pack / Category Updates
  document.getElementById("hero-category")?.addEventListener("change", (e) => {
    const hero = getActiveHero();
    if (!hero) return;
    const newCat = e.target.value || "Base Game";
    hero["robos:category"] = newCat;
    const badgeEl = document.getElementById("hero-category-badge");
    if (badgeEl) badgeEl.textContent = newCat;
    renderHeroesList();
    triggerHeroAutosave();
  });

  // Numeric Stats & String Inputs Live Auto-save
  const bindStatInput = (id, prop, isInt = true) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      const hero = getActiveHero();
      if (!hero) return;
      hero[prop] = isInt ? (parseInt(e.target.value, 10) || 0) : e.target.value;
      updateHeroPortraitCardPreview(hero);
      renderHeroActionScreen(hero);
      triggerHeroAutosave();
    });
  };

  bindStatInput("hero-bp", "robos:bodyPoints", true);
  bindStatInput("hero-mp", "robos:mindPoints", true);
  bindStatInput("hero-atk", "robos:attackDice", true);
  bindStatInput("hero-def", "robos:defendDice", true);
  bindStatInput("hero-gold", "robos:gold", true);
  bindStatInput("hero-weapon", "robos:equippedWeapon", false);
  bindStatInput("hero-armor", "robos:equippedArmor", false);
  bindStatInput("hero-ability", "robos:specialAbility", false);
  bindStatInput("hero-color", "robos:tokenColor", false);
  bindStatInput("hero-icon", "robos:icon", false);

  // Position inputs
  ["hero-pos-x", "hero-pos-y"].forEach(posId => {
    document.getElementById(posId)?.addEventListener("input", () => {
      const hero = getActiveHero();
      if (!hero) return;
      const x = parseInt(document.getElementById("hero-pos-x").value, 10) || 1;
      const y = parseInt(document.getElementById("hero-pos-y").value, 10) || 1;
      hero["robos:startingPosition"] = [x, y];
      triggerHeroAutosave();
    });
  });

  // Quick Gold Buttons
  document.querySelectorAll(".btn-quick-gold").forEach(btn => {
    btn.addEventListener("click", () => {
      const hero = getActiveHero();
      if (!hero) return;
      const amount = parseInt(btn.dataset.amount, 10) || 0;
      const currentGold = parseInt(document.getElementById("hero-gold").value, 10) || 0;
      const nextGold = Math.max(0, currentGold + amount);
      document.getElementById("hero-gold").value = nextGold;
      hero["robos:gold"] = nextGold;

      const actGold = document.getElementById("act-hero-gold");
      if (actGold) actGold.textContent = `💰 ${nextGold} GP`;

      const listGold = document.querySelector(`#heroes-list .list-item[data-hero-id="${hero["@id"]}"] .hero-item-gold`);
      if (listGold) listGold.textContent = `${nextGold}gp`;

      logCombatAction(`💰 ${hero["dcterms:title"]} received +${amount} gold coins (Total: ${nextGold} GP).`, "system");
      triggerHeroAutosave();
    });
  });

  // Add Item to Inventory Button
  document.getElementById("btn-add-inventory-item")?.addEventListener("click", addHeroInventoryItem);

  // Save Hero Button
  document.getElementById("btn-save-hero")?.addEventListener("click", () => {
    saveActiveHeroToKGraph(true);
  });

  // Add Hero Button
  document.getElementById("btn-add-hero")?.addEventListener("click", () => {
    const timestamp = Date.now().toString(36);
    const newHeroId = `urn:robos:tabletop:hero:hero-${timestamp}`;
    const newHero = {
      "@id": newHeroId,
      "@type": [
        "oslc_am:Resource",
        "robos:TabletopHero",
        "robos:GameCharacter",
        "schema:Person"
      ],
      "dcterms:title": "New Hero",
      "robos:heroClass": "Paladin",
      "robos:bodyPoints": 7,
      "robos:mindPoints": 3,
      "robos:attackDice": 3,
      "robos:defendDice": 2,
      "robos:gold": 50,
      "robos:startingWeapon": "Longsword (3 Combat Dice)",
      "robos:equippedWeapon": "Longsword (3 Combat Dice)",
      "robos:equippedArmor": "Chainmail & Shield (+2 Defend Dice)",
      "robos:inventory": [
        { id: `item-pot-${timestamp}`, name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
      ],
      "robos:tokenColor": "#8b5cf6",
      "robos:icon": "🛡️",
      "robos:startingPosition": [1, 1],
      "robos:package": "tabletop-game",
      "robos:namespace": "robos.tabletop"
    };

    currentData.heroes.push(newHero);
    renderHeroesList();
    selectHero(newHeroId);
    saveActiveHeroToKGraph(false);
    setStatus(`Created new hero: ${newHero["dcterms:title"]}`);
    logCombatAction(`✨ Created new hero: ${newHero["dcterms:title"]} (${newHero["robos:heroClass"]}).`, "system");
    document.getElementById("hero-name")?.focus();
  });

  // Delete Hero Button
  document.getElementById("btn-delete-hero")?.addEventListener("click", () => {
    if (currentData.heroes.length <= 1) {
      alert("Cannot delete the last remaining hero.");
      return;
    }
    const hero = getActiveHero();
    if (!hero) return;
    const name = hero["dcterms:title"] || "Hero";
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    const idx = currentData.heroes.findIndex(h => h["@id"] === currentData.activeHeroId);
    if (idx >= 0) {
      currentData.heroes.splice(idx, 1);
      currentData.activeHeroId = currentData.heroes[0]["@id"];
      renderHeroesList();
      selectHero(currentData.activeHeroId);
      setStatus(`Deleted hero: ${name}`);
      logCombatAction(`🗑️ Deleted hero: ${name}.`, "system");
    }
  });

  // Vitality Track Damage & Heal Buttons
  document.getElementById("btn-act-dmg-bp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    if (!hero || hero["robos:currentBP"] <= 0) return;
    hero["robos:currentBP"]--;
    renderVitalityPips(hero);
    logCombatAction(`💔 ${hero["dcterms:title"]} took 1 Damage! (BP: ${hero["robos:currentBP"]}/${hero["robos:bodyPoints"]})`, "attack");
    triggerHeroAutosave();
  });

  document.getElementById("btn-act-heal-bp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
    if (!hero || hero["robos:currentBP"] >= maxBP) return;
    hero["robos:currentBP"]++;
    renderVitalityPips(hero);
    logCombatAction(`❤️ ${hero["dcterms:title"]} healed 1 BP! (BP: ${hero["robos:currentBP"]}/${maxBP})`, "defend");
    triggerHeroAutosave();
  });

  document.getElementById("btn-act-dmg-mp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    if (!hero || hero["robos:currentMP"] <= 0) return;
    hero["robos:currentMP"]--;
    renderVitalityPips(hero);
    logCombatAction(`🔮 ${hero["dcterms:title"]} spent 1 Mind Point! (MP: ${hero["robos:currentMP"]}/${hero["robos:mindPoints"]})`, "attack");
    triggerHeroAutosave();
  });

  document.getElementById("btn-act-heal-mp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    const maxMP = parseInt(hero["robos:mindPoints"], 10) || 2;
    if (!hero || hero["robos:currentMP"] >= maxMP) return;
    hero["robos:currentMP"]++;
    renderVitalityPips(hero);
    logCombatAction(`✨ ${hero["dcterms:title"]} restored 1 Mind Point! (MP: ${hero["robos:currentMP"]}/${maxMP})`, "defend");
    triggerHeroAutosave();
  });

  // Action Roll Buttons
  document.getElementById("btn-roll-hero-attack")?.addEventListener("click", rollHeroAttack);
  document.getElementById("btn-roll-hero-defend")?.addEventListener("click", rollHeroDefend);
  document.getElementById("btn-roll-hero-move")?.addEventListener("click", rollHeroMove);
}

// ==========================================
// 2. MONSTERS, BOSSES & DREAD GRIMOIRE ENGINE
// ==========================================

function getActiveMonster() {
  if (!Array.isArray(currentData.monsters)) return null;
  return currentData.monsters.find(m => m["@id"] === currentData.activeMonsterId) || currentData.monsters[0] || null;
}

function getMonsterSpells(monster) {
  if (!monster) return [];
  const allDread = getAllDreadSpells();
  const assigned = monster["robos:spells"] || [];
  return assigned.map(sp => {
    if (typeof sp === "object" && sp !== null) return sp;
    const slug = String(sp).replace("urn:robos:tabletop:spell:", "");
    return allDread.find(ds => ds.slug === slug || ds.id === sp) || {
      id: sp,
      slug: slug,
      name: slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      element: "dread",
      category: monster["robos:category"] || "Base Game",
      icon: "⚡",
      description: "Dread Chaos spell."
    };
  });
}

function addMonsterSpell(monster, spellSlug) {
  if (!monster || !spellSlug) return;
  if (!Array.isArray(monster["robos:spells"])) {
    monster["robos:spells"] = [];
  }
  const fullId = `urn:robos:tabletop:spell:${spellSlug}`;
  if (!monster["robos:spells"].some(s => s === fullId || (typeof s === "object" && s.slug === spellSlug) || s === spellSlug)) {
    monster["robos:spells"].push(fullId);
    monster["robos:isSpellcaster"] = true;
    renderMonsterGrimoire(monster);
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
    logMonsterCombatAction(`⚡ Added Dread spell '${spellSlug}' to ${monster["dcterms:title"] || "Monster"} grimoire.`, "chaos");
  }
}

function removeMonsterSpell(monster, spellSlug) {
  if (!monster || !Array.isArray(monster["robos:spells"])) return;
  const fullId = `urn:robos:tabletop:spell:${spellSlug}`;
  monster["robos:spells"] = monster["robos:spells"].filter(s => s !== fullId && s !== spellSlug && (typeof s !== "object" || s.slug !== spellSlug));
  renderMonsterGrimoire(monster);
  renderMonsterActionScreen(monster);
  triggerMonsterAutosave();
  logMonsterCombatAction(`🗑️ Removed Dread spell '${spellSlug}' from ${monster["dcterms:title"] || "Monster"} grimoire.`, "system");
}

function renderMonsterGrimoire(monster) {
  const section = document.getElementById("monster-spells-section");
  const chipsList = document.getElementById("monster-assigned-spells-list");
  const select = document.getElementById("monster-spell-add-select");
  if (!section || !chipsList) return;

  const isSpellcaster = !!monster?.["robos:isSpellcaster"];
  section.style.display = isSpellcaster ? "block" : "none";

  if (!isSpellcaster || !monster) {
    chipsList.innerHTML = "";
    return;
  }

  const assigned = getMonsterSpells(monster);
  const assignedSlugs = assigned.map(s => s.slug);

  chipsList.innerHTML = "";
  if (assigned.length === 0) {
    chipsList.innerHTML = `<span class="text-muted" style="font-size:12px; font-style:italic;">No spells memorized. Select from the dropdown above to add Dread spells.</span>`;
  } else {
    assigned.forEach(s => {
      const chip = document.createElement("div");
      chip.className = "monster-spell-chip";
      const sIconUrl = getSpellIconUrl(s);
      chip.innerHTML = `
        <img src="${sIconUrl}" alt="" style="width:16px; height:16px; border-radius:3px; object-fit:cover; vertical-align:middle;">
        <strong>${s.name}</strong>
        <button class="btn-remove-chip" title="Remove spell">&times;</button>
      `;
      chip.querySelector(".btn-remove-chip")?.addEventListener("click", () => {
        removeMonsterSpell(monster, s.slug);
      });
      chipsList.appendChild(chip);
    });
  }

  // Populate dropdown with unassigned dread spells across all categories
  if (select) {
    select.innerHTML = "";
    const allDread = getAllDreadSpells();
    const available = allDread.filter(ds => !assignedSlugs.includes(ds.slug));
    if (available.length === 0) {
      select.innerHTML = `<option value="">All Dread Spells Memorized</option>`;
      select.disabled = true;
      const addBtn = document.getElementById("btn-monster-add-spell");
      if (addBtn) addBtn.disabled = true;
    } else {
      select.disabled = false;
      const addBtn = document.getElementById("btn-monster-add-spell");
      if (addBtn) addBtn.disabled = false;
      available.forEach(ds => {
        const opt = document.createElement("option");
        opt.value = ds.slug;
        const catSuffix = ds.category && ds.category !== "Base Game" ? ` [${ds.category}]` : "";
        opt.textContent = `${ds.name}${catSuffix}`;
        select.appendChild(opt);
      });
    }
  }
}

function renderMonsterActionScreen(monster) {
  if (!monster) return;
  const nameEl = document.getElementById("act-monster-name");
  const typeTag = document.getElementById("act-monster-type-tag");
  const catTag = document.getElementById("act-monster-category-tag");
  const descEl = document.getElementById("act-monster-desc");
  const casterBadge = document.getElementById("act-monster-spellcaster-badge");
  const iconEl = document.getElementById("act-monster-icon");
  const portraitEl = document.getElementById("act-monster-portrait");
  const atkStat = document.getElementById("act-monster-atk-stat");
  const defStat = document.getElementById("act-monster-def-stat");
  const moveStat = document.getElementById("act-monster-move-stat");

  if (nameEl) nameEl.textContent = monster["dcterms:title"] || "Monster";
  if (typeTag) {
    const arch = monster["robos:monsterArchetype"] ? ` (${monster["robos:monsterArchetype"]})` : "";
    if (monster["robos:isBoss"]) {
      typeTag.textContent = `Boss Monster${arch}`;
      typeTag.style.background = "#581c87";
      typeTag.style.color = "#f3e8ff";
      typeTag.style.borderColor = "#a855f7";
    } else if (monster["robos:isUndead"]) {
      typeTag.textContent = `Undead${arch}`;
      typeTag.style.background = "#1f2937";
      typeTag.style.color = "#9ca3af";
      typeTag.style.borderColor = "#4b5563";
    } else {
      typeTag.textContent = `Monster${arch}`;
      typeTag.style.background = "#450a0a";
      typeTag.style.color = "#fca5a5";
      typeTag.style.borderColor = "#991b1b";
    }
  }

  if (catTag) {
    const cat = monster["robos:category"] || "Base Game";
    catTag.textContent = `${cat}`;
  }

  if (descEl) {
    const desc = monster["dcterms:description"] || "";
    descEl.textContent = desc;
    descEl.style.display = desc ? "block" : "none";
  }

  if (iconEl) {
    const tokUrl = getMonsterTokenUrl(monster);
    iconEl.innerHTML = `<img src="${tokUrl}" alt="${escapeHtml(monster["dcterms:title"] || "Monster")} Token" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  }
  if (portraitEl) {
    portraitEl.src = getMonsterPortraitUrl(monster);
    portraitEl.alt = `${monster["dcterms:title"] || "Monster"} Portrait`;
  }

  const isSpellcaster = !!monster["robos:isSpellcaster"];
  if (casterBadge) casterBadge.style.display = isSpellcaster ? "inline-block" : "none";

  if (atkStat) atkStat.textContent = `${monster["robos:attackDice"] || 2} Combat Dice`;
  if (defStat) defStat.textContent = `${monster["robos:defendDice"] || 2} Combat Dice`;
  if (moveStat) moveStat.textContent = `${monster["robos:movementSquares"] || 6} Squares`;

  renderMonsterVitalityPips(monster);

  const spellModule = document.getElementById("act-mon-spell-module");
  const spellCount = document.getElementById("act-mon-spell-count");
  const spellSelect = document.getElementById("act-mon-spell-select");

  if (spellModule) {
    spellModule.style.display = isSpellcaster ? "flex" : "none";
  }

  if (isSpellcaster && spellSelect && spellCount) {
    const spells = getMonsterSpells(monster);
    spellCount.textContent = `${spells.length} Spell${spells.length !== 1 ? 's' : ''}`;
    spellSelect.innerHTML = "";
    if (spells.length === 0) {
      spellSelect.innerHTML = `<option value="">No spells memorized</option>`;
      spellSelect.disabled = true;
      const castBtn = document.getElementById("btn-cast-monster-spell");
      if (castBtn) castBtn.disabled = true;
    } else {
      spellSelect.disabled = false;
      const castBtn = document.getElementById("btn-cast-monster-spell");
      if (castBtn) castBtn.disabled = false;
      spells.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.slug;
        opt.textContent = `${s.name}`;
        spellSelect.appendChild(opt);
      });
    }
  }
}

function renderMonsterVitalityPips(monster) {
  const bpTrack = document.getElementById("act-monster-bp-track");
  if (!bpTrack || !monster) return;

  const maxBP = parseInt(monster["robos:bodyPoints"], 10) || 1;
  if (monster["robos:currentBP"] === undefined) {
    monster["robos:currentBP"] = maxBP;
  }
  const currentBP = Math.min(maxBP, Math.max(0, monster["robos:currentBP"]));
  monster["robos:currentBP"] = currentBP;

  bpTrack.innerHTML = "";
  for (let i = 1; i <= maxBP; i++) {
    const pip = document.createElement("span");
    pip.className = `pip ${i <= currentBP ? "bp-active" : "bp-lost"}`;
    pip.title = `BP ${i}/${maxBP}`;
    bpTrack.appendChild(pip);
  }
}

function rollMonsterAttack() {
  const monster = getActiveMonster();
  if (!monster) return null;
  const numDice = parseInt(monster["robos:attackDice"], 10) || 2;
  const rolls = [];
  let skulls = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    if (die.type === "skull") skulls++;
  }

  const resultBox = document.getElementById("act-monster-atk-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  logMonsterCombatAction(`⚔️ ${monster["dcterms:title"]} rolled Monster Attack (${numDice} dice): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${skulls} Skull${skulls !== 1 ? 's' : ''} Hit!]`, "attack");
  return { numDice, rolls, skulls };
}

function rollMonsterDefend() {
  const monster = getActiveMonster();
  if (!monster) return null;
  const numDice = parseInt(monster["robos:defendDice"], 10) || 2;
  const rolls = [];
  let blackShields = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    // Authentic HeroQuest Rule: Monsters defend ONLY on Black Shields (⬛ Black Shield)
    if (die.type === "black-shield") blackShields++;
  }

  const resultBox = document.getElementById("act-monster-def-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  logMonsterCombatAction(`⬛ ${monster["dcterms:title"]} rolled Monster Defend (${numDice} dice): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${blackShields} Black Shield${blackShields !== 1 ? 's' : ''} Defended]`, "defend");
  return { numDice, rolls, blackShields };
}

function rollMonsterMove() {
  const monster = getActiveMonster();
  if (!monster) return null;
  const moveSquares = parseInt(monster["robos:movementSquares"], 10) || 6;
  const resultBox = document.getElementById("act-monster-move-result");
  if (resultBox) {
    resultBox.innerHTML = `<span class="dice-badge dice-d6">👣 Move Allowance</span> = <strong>${moveSquares} Squares</strong>`;
  }
  logMonsterCombatAction(`👣 ${monster["dcterms:title"]} advances up to ${moveSquares} squares.`, "move");
  return { moveSquares };
}

function castMonsterSpell(monster, spellSlug) {
  if (!monster) monster = getActiveMonster();
  if (!monster) return null;

  if (!spellSlug) {
    const select = document.getElementById("act-mon-spell-select");
    spellSlug = select ? select.value : "";
  }
  if (!spellSlug) return null;

  const allDread = getAllDreadSpells();
  const spell = allDread.find(s => s.slug === spellSlug) || {
    slug: spellSlug,
    name: spellSlug,
    icon: "⚡",
    description: "Invoked Dread spell",
    effect: "dread-chaos"
  };

  const resultBox = document.getElementById("act-mon-spell-result");
  if (resultBox) {
    const sIconUrl = getSpellIconUrl(spell);
    resultBox.innerHTML = `<span class="dice-badge" style="background:#581c87; color:#f3e8ff; border:1px solid #7e22ce; display:inline-flex; align-items:center; gap:5px;"><img src="${sIconUrl}" alt="" style="width:15px; height:15px; border-radius:3px; object-fit:cover;"> ${spell.name}</span>`;
  }

  let effectDescription = "";
  if (spell.slug === "lightning-bolt") {
    effectDescription = "Strikes target hero with black electricity for 2 BP damage! (Target rolls 2 defense dice)";
  } else if (spell.slug === "firestorm") {
    effectDescription = "Unleashes inferno across room for 3 BP damage! (Targets roll 3 defense dice)";
  } else if (spell.slug === "fear") {
    effectDescription = "Instills horrific dread! Target hero attacks with only 1 combat die on next turn.";
  } else if (spell.slug === "sleep-dread") {
    effectDescription = "Inflicts dark slumber! Hero falls asleep until rolling a 6 or wounded.";
  } else if (spell.slug === "cloud-of-chaos") {
    effectDescription = "Noxious vapors choke target hero! Hero loses their entire next turn.";
  } else if (spell.slug === "summon-undead") {
    effectDescription = "Chants necromantic rite! 2 Skeletons or Zombies rise from stone to attack!";
  } else if (spell.slug === "rust") {
    effectDescription = "Decays metal! Target hero's weapon or helmet corrodes into brittle rust.";
  } else if (spell.slug === "escape") {
    effectDescription = "Sorcerer dissolves into shadow and teleports away to another dungeon wing!";
  } else {
    effectDescription = spell.description;
  }

  logMonsterCombatAction(`⚡ ${monster["dcterms:title"]} cast DREAD SPELL: [${spell.icon} ${spell.name}] — ${effectDescription}`, "chaos");
  return { success: true, monster, spell, effectDescription };
}

// ==========================================
// 1.8. RPG CLASS ENGINE (HERO CLASSES & BASE ENEMY CLASSES)
// ==========================================

const HERO_CLASSES = [
  {
    id: "urn:robos:tabletop:class:hero-barbarian",
    slug: "hero-barbarian",
    name: "Barbarian",
    classType: "Hero",
    icon: "⚔️",
    color: "#b91c1c",
    bodyPoints: 8,
    mindPoints: 2,
    attackDice: 3,
    defendDice: 2,
    movementSquares: 7,
    startingWeapon: "Broadsword (3 Combat Dice)",
    startingArmor: "Natural Toughness (2 Defend Dice)",
    abilities: "Greatest melee strength and vitality; starts with 8 Body Points and Broadsword (3 Attack Dice)",
    description: "Towering warrior from the northern wastes with unmatched starting health (8 BP) and raw melee attack power (3 Attack Dice).",
    isBoss: false,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:hero-dwarf",
    slug: "hero-dwarf",
    name: "Dwarf",
    classType: "Hero",
    icon: "🪓",
    color: "#d97706",
    bodyPoints: 7,
    mindPoints: 3,
    attackDice: 2,
    defendDice: 2,
    movementSquares: 7,
    startingWeapon: "Shortsword (2 Combat Dice)",
    startingArmor: "Shield & Chainmail (+2 Defend Dice)",
    abilities: "Master Trap Disarmer — automatically disarms any detected trap without needing a toolkit",
    description: "Stout mountaineer and master smith of World's Edge Mountains. Can disarm dungeon traps barehanded without a toolkit.",
    isBoss: false,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:hero-elf",
    slug: "hero-elf",
    name: "Elf",
    classType: "Hero",
    icon: "🏹",
    color: "#15803d",
    bodyPoints: 6,
    mindPoints: 4,
    attackDice: 2,
    defendDice: 2,
    movementSquares: 7,
    startingWeapon: "Shortsword (2 Combat Dice)",
    startingArmor: "Elven Leather & Cloak (+2 Defend Dice)",
    abilities: "Hybrid Spellblade — fights with martial weapons and drafts 1 Elemental Spell College (3 spells)",
    description: "Agile sylvan champion combining martial swordplay (6 BP, 4 MP) with 1 Elemental Spell College (3 spells).",
    isBoss: false,
    isUndead: false,
    isSpellcaster: true
  },
  {
    id: "urn:robos:tabletop:class:hero-wizard",
    slug: "hero-wizard",
    name: "Wizard",
    classType: "Hero",
    icon: "🔮",
    color: "#7c3aed",
    bodyPoints: 4,
    mindPoints: 6,
    attackDice: 1,
    defendDice: 2,
    movementSquares: 7,
    startingWeapon: "Dagger (1 Combat Die)",
    startingArmor: "Wizard Cloak (2 Defend Dice)",
    abilities: "Master of the Arcane — wields 3 Elemental Spell Colleges (9 spells total); highest Mind Points (6 MP)",
    description: "Scholar of the high elemental colleges with 6 Mind Points and 9 Elemental Spells across 3 schools of magic.",
    isBoss: false,
    isUndead: false,
    isSpellcaster: true
  }
];

const ENEMY_CLASSES = [
  {
    id: "urn:robos:tabletop:class:enemy-goblin",
    slug: "enemy-goblin",
    name: "Goblin",
    classType: "Enemy",
    icon: "👺",
    color: "#16a34a",
    bodyPoints: 1,
    mindPoints: 1,
    attackDice: 2,
    defendDice: 1,
    movementSquares: 10,
    startingWeapon: "Rusty Shortblade (2 Attack Dice)",
    startingArmor: "Scraps (1 Defend Die)",
    abilities: "Fastest dungeon scout (10 movement squares); weak armor (1 Defend Die)",
    description: "Nimble greenskin scout with the fastest movement speed on the board (10 squares).",
    isBoss: false,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-orc",
    slug: "enemy-orc",
    name: "Orc",
    classType: "Enemy",
    icon: "👹",
    color: "#15803d",
    bodyPoints: 1,
    mindPoints: 2,
    attackDice: 3,
    defendDice: 2,
    movementSquares: 8,
    startingWeapon: "Notched Cleaver (3 Attack Dice)",
    startingArmor: "Iron Mail (2 Defend Dice)",
    abilities: "Fierce greenskin shock trooper with heavy 3-die cleaver attack",
    description: "Core infantry of Zargon's legions—strikes hard with 3 Attack Dice and advances 8 squares.",
    isBoss: false,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-fimir",
    slug: "enemy-fimir",
    name: "Fimir",
    classType: "Enemy",
    icon: "🦎",
    color: "#0f766e",
    bodyPoints: 2,
    mindPoints: 3,
    attackDice: 3,
    defendDice: 3,
    movementSquares: 6,
    startingWeapon: "Marsh Battleaxe (3 Attack Dice)",
    startingArmor: "Scaly Swamp Hide (3 Defend Dice)",
    abilities: "Multi-wound abomination (2 Body Points) with scaly 3-die hide",
    description: "One-eyed reptilian marsh fiend with 2 Body Points, 3 Attack Dice, and 3 Defend Dice.",
    isBoss: false,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-skeleton",
    slug: "enemy-skeleton",
    name: "Skeleton",
    classType: "Enemy",
    icon: "💀",
    color: "#94a3b8",
    bodyPoints: 1,
    mindPoints: 0,
    attackDice: 2,
    defendDice: 2,
    movementSquares: 6,
    startingWeapon: "Ancient Scythe (2 Attack Dice)",
    startingArmor: "Ribcage Bones (2 Defend Dice)",
    abilities: "Undead (0 Mind Points, immune to Mind spells, vulnerable to Holy Water / Turn Undead)",
    description: "Reanimated bone warrior with 0 Mind Points and immunity to mind-affecting spells.",
    isBoss: false,
    isUndead: true,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-zombie",
    slug: "enemy-zombie",
    name: "Zombie",
    classType: "Enemy",
    icon: "🧟",
    color: "#475569",
    bodyPoints: 1,
    mindPoints: 0,
    attackDice: 2,
    defendDice: 3,
    movementSquares: 5,
    startingWeapon: "Rotting Cleaver (2 Attack Dice)",
    startingArmor: "Deadened Flesh (3 Defend Dice)",
    abilities: "Shambling Undead corpse with resilient 3-die rot defense (0 Mind Points)",
    description: "Slow-moving undead horror that shrugs off blows with 3 Defend Dice.",
    isBoss: false,
    isUndead: true,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-mummy",
    slug: "enemy-mummy",
    name: "Mummy",
    classType: "Enemy",
    icon: "🩹",
    color: "#d97706",
    bodyPoints: 2,
    mindPoints: 0,
    attackDice: 3,
    defendDice: 4,
    movementSquares: 4,
    startingWeapon: "Embalmed Fist (3 Attack Dice)",
    startingArmor: "Sacred Linen Wrappings (4 Defend Dice)",
    abilities: "Elite Undead tomb guardian with 2 Body Points and 4 Defend Dice (0 Mind Points)",
    description: "Powerful undead pharaoh guard with 2 BP, 3 Attack Dice, and 4 Defend Dice.",
    isBoss: false,
    isUndead: true,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-dread-warrior",
    slug: "enemy-dread-warrior",
    name: "Dread Warrior",
    classType: "Enemy",
    icon: "⚔️",
    color: "#7f1d1d",
    bodyPoints: 3,
    mindPoints: 3,
    attackDice: 4,
    defendDice: 4,
    movementSquares: 7,
    startingWeapon: "Chaos Runeblade (4 Attack Dice)",
    startingArmor: "Dread Plate Armor (4 Defend Dice)",
    abilities: "Heavily armored champion of Chaos (3 Body Points, 4 Attack Dice, 4 Defend Dice)",
    description: "Elite human warrior sworn to Chaos, clad in heavy dread-plate with 3 BP and 4/4 combat dice.",
    isBoss: false,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-gargoyle",
    slug: "enemy-gargoyle",
    name: "Gargoyle",
    classType: "Enemy",
    icon: "🗿",
    color: "#64748b",
    bodyPoints: 3,
    mindPoints: 4,
    attackDice: 4,
    defendDice: 5,
    movementSquares: 6,
    startingWeapon: "Stone Talons & Whip (4 Attack Dice)",
    startingArmor: "Living Granite Skin (5 Defend Dice)",
    abilities: "Living stone daemon with 5 Defend Dice and 4 Attack Dice",
    description: "Winged stone terror with near-impenetrable granite hide (5 Defend Dice) and 3 Body Points.",
    isBoss: false,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-orc-shaman",
    slug: "enemy-orc-shaman",
    name: "Orc Shaman",
    classType: "Enemy",
    icon: "🧙‍♂️",
    color: "#059669",
    bodyPoints: 3,
    mindPoints: 4,
    attackDice: 3,
    defendDice: 3,
    movementSquares: 7,
    startingWeapon: "Skull Totem Staff (3 Attack Dice)",
    startingArmor: "Shamanic Fetish Cloak (3 Defend Dice)",
    abilities: "Greenskin Dread Spellcaster — casts Summon Undead, Fear, and Cloud of Chaos",
    description: "Tribal greenskin sorcerer who channels Dread magic and commands lesser greenskins.",
    isBoss: false,
    isUndead: false,
    isSpellcaster: true
  },
  {
    id: "urn:robos:tabletop:class:enemy-orc-warlord",
    slug: "enemy-orc-warlord",
    name: "Orc Warlord",
    classType: "Enemy",
    icon: "👑",
    color: "#b45309",
    bodyPoints: 3,
    mindPoints: 3,
    attackDice: 4,
    defendDice: 4,
    movementSquares: 8,
    startingWeapon: "Warboss Greataxe (4 Attack Dice)",
    startingArmor: "Spiked Warlord Plate (4 Defend Dice)",
    abilities: "Boss Commander — leads dungeon garrisons with 4 Attack Dice, 4 Defend Dice, and 8 Move",
    description: "Brutal greenskin warboss (such as Verag or Ulag) commanding dungeon strongholds.",
    isBoss: true,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-chaos-sorcerer",
    slug: "enemy-chaos-sorcerer",
    name: "Chaos Sorcerer",
    classType: "Enemy",
    icon: "⚡",
    color: "#7e22ce",
    bodyPoints: 4,
    mindPoints: 5,
    attackDice: 4,
    defendDice: 4,
    movementSquares: 7,
    startingWeapon: "Staff of Dread Lightning (4 Attack Dice)",
    startingArmor: "Ward of Chaos (4 Defend Dice)",
    abilities: "Master of Dread Sorcery — casts Lightning Bolt, Firestorm, Rust, and Escape",
    description: "High sorcerer of Zargon's inner circle wielding devastating Dread spells and 5 Mind Points.",
    isBoss: true,
    isUndead: false,
    isSpellcaster: true
  },
  {
    id: "urn:robos:tabletop:class:enemy-witch-lord",
    slug: "enemy-witch-lord",
    name: "Witch Lord",
    classType: "Enemy",
    icon: "💀",
    color: "#581c87",
    bodyPoints: 4,
    mindPoints: 6,
    attackDice: 5,
    defendDice: 6,
    movementSquares: 6,
    startingWeapon: "Scepter of the Undead (5 Attack Dice)",
    startingArmor: "Necromantic Ward (6 Defend Dice)",
    abilities: "Undead Sovereign Boss — 6 Defend Dice, 6 Mind Points, and master of all Dread Spells",
    description: "Immortal ruler of the undead legions with 4 BP, 6 MP, 5 Attack Dice, and 6 Defend Dice.",
    isBoss: true,
    isUndead: true,
    isSpellcaster: true
  },
  {
    id: "urn:robos:tabletop:class:enemy-dragon",
    slug: "enemy-dragon",
    name: "Dragon",
    classType: "Enemy",
    icon: "🐉",
    color: "#dc2626",
    bodyPoints: 6,
    mindPoints: 5,
    attackDice: 5,
    defendDice: 5,
    movementSquares: 8,
    startingWeapon: "Dragon Jaws & Fire Breath (5 Attack Dice)",
    startingArmor: "Ancient Dragon Scales (5 Defend Dice)",
    abilities: "Apex Boss Dragon — 6 Body Points, 5 Attack/Defend Dice, and casts Firestorm breath",
    description: "Colossal winged wyrm with 6 Body Points, 5 Attack Dice, 5 Defend Dice, and searing fire breath.",
    isBoss: true,
    isUndead: false,
    isSpellcaster: true
  },
  {
    id: "urn:robos:tabletop:class:enemy-doomguard",
    slug: "enemy-doomguard",
    name: "Doomguard",
    classType: "Enemy",
    icon: "🛡️",
    color: "#991b1b",
    bodyPoints: 4,
    mindPoints: 4,
    attackDice: 4,
    defendDice: 5,
    movementSquares: 7,
    startingWeapon: "Doom Cleaver (4 Attack Dice)",
    startingArmor: "Crimson Citadel Plate (5 Defend Dice)",
    abilities: "Elite Citadel Boss — 4 Body Points, 4 Attack Dice, and 5 Defend Dice",
    description: "Veteran Chaos warlord clad in crimson citadel plate, guarding the inner sanctum.",
    isBoss: true,
    isUndead: false,
    isSpellcaster: false
  },
  {
    id: "urn:robos:tabletop:class:enemy-witch-hand",
    slug: "enemy-witch-hand",
    name: "Witch Hand",
    classType: "Enemy",
    icon: "🔮",
    color: "#9333ea",
    bodyPoints: 3,
    mindPoints: 5,
    attackDice: 3,
    defendDice: 4,
    movementSquares: 6,
    startingWeapon: "Coven Dagger (3 Attack Dice)",
    startingArmor: "Shadow Mantle (4 Defend Dice)",
    abilities: "High Coven Spellcaster — casts Cloud of Chaos, Sleep of Dread, and Fear",
    description: "Right-hand coven inquisitor of the Witch Lord with 5 Mind Points and dark hexes.",
    isBoss: true,
    isUndead: false,
    isSpellcaster: true
  }
];

const DEFAULT_RPG_CLASSES = [...HERO_CLASSES, ...ENEMY_CLASSES];

function initClassesCatalog() {
  if (!Array.isArray(currentData.classes) || currentData.classes.length === 0) {
    currentData.classes = DEFAULT_RPG_CLASSES.map(c => ({ ...c }));
  } else {
    DEFAULT_RPG_CLASSES.forEach(defCls => {
      if (!currentData.classes.some(c => c.id === defCls.id || c.name.toLowerCase() === defCls.name.toLowerCase())) {
        currentData.classes.push({ ...defCls });
      }
    });
  }
  if (!currentData.activeClassId && currentData.classes.length > 0) {
    currentData.activeClassId = currentData.classes[0].id;
  }
  return currentData.classes;
}

function getClasses(typeFilter = "All") {
  initClassesCatalog();
  if (!typeFilter || typeFilter === "All") return currentData.classes;
  return currentData.classes.filter(c => c.classType.toLowerCase() === String(typeFilter).toLowerCase());
}

function getHeroClasses() {
  return getClasses("Hero");
}

function getEnemyClasses() {
  return getClasses("Enemy");
}

function getClassByIdOrName(idOrName) {
  if (!idOrName) return null;
  initClassesCatalog();
  const needle = String(idOrName).trim().toLowerCase();
  return currentData.classes.find(c =>
    c.id.toLowerCase() === needle ||
    c.slug.toLowerCase() === needle ||
    c.name.toLowerCase() === needle ||
    `class-${c.slug}`.toLowerCase() === needle
  ) || null;
}

function applyClassToMonster(monster, classIdOrName) {
  if (!monster) monster = getActiveMonster();
  if (!monster) return null;
  const cls = getClassByIdOrName(classIdOrName) || getClassByIdOrName("Goblin");
  if (!cls) return null;

  monster["robos:extendsClass"] = cls.name;
  monster["robos:monsterArchetype"] = cls.name;
  monster["robos:archetype"] = cls.name;
  monster["robos:bodyPoints"] = cls.bodyPoints;
  monster["robos:currentBP"] = cls.bodyPoints;
  monster["robos:mindPoints"] = cls.mindPoints;
  monster["robos:attackDice"] = cls.attackDice;
  monster["robos:defendDice"] = cls.defendDice;
  monster["robos:movementSquares"] = cls.movementSquares;
  monster["robos:abilities"] = cls.abilities;
  monster["robos:isBoss"] = !!cls.isBoss;
  monster["robos:isUndead"] = !!cls.isUndead;
  monster["robos:isSpellcaster"] = !!cls.isSpellcaster;
  if (cls.isSpellcaster && (!Array.isArray(monster["robos:spells"]) || monster["robos:spells"].length === 0)) {
    monster["robos:spells"] = ["urn:robos:tabletop:spell:lightning-bolt"];
  }

  // Update DOM if this is the active monster
  if (currentData.activeMonsterId === monster["@id"]) {
    const baseSel = document.getElementById("monster-base-class");
    if (baseSel) baseSel.value = cls.name;
    const archEl = document.getElementById("monster-archetype");
    if (archEl) archEl.value = cls.name;
    const abilEl = document.getElementById("monster-abilities");
    if (abilEl) abilEl.value = cls.abilities || "";
    const bpEl = document.getElementById("monster-bp");
    if (bpEl) bpEl.value = cls.bodyPoints;
    const mpEl = document.getElementById("monster-mp");
    if (mpEl) mpEl.value = cls.mindPoints;
    const atkEl = document.getElementById("monster-atk");
    if (atkEl) atkEl.value = cls.attackDice;
    const defEl = document.getElementById("monster-def");
    if (defEl) defEl.value = cls.defendDice;
    const moveEl = document.getElementById("monster-move");
    if (moveEl) moveEl.value = cls.movementSquares;
    const bossEl = document.getElementById("monster-is-boss");
    if (bossEl) bossEl.checked = !!cls.isBoss;
    const undeadEl = document.getElementById("monster-is-undead");
    if (undeadEl) undeadEl.checked = !!cls.isUndead;
    const casterEl = document.getElementById("monster-is-spellcaster");
    if (casterEl) casterEl.checked = !!cls.isSpellcaster;
    renderMonsterGrimoire(monster);
    renderMonsterActionScreen(monster);
  }
  return monster;
}

function applyClassToHero(hero, classIdOrName) {
  if (!hero) hero = getActiveHero();
  if (!hero) return null;
  const cls = getClassByIdOrName(classIdOrName);
  if (!cls) return null;

  hero["robos:heroClass"] = cls.name;
  hero["robos:extendsClass"] = cls.name;
  hero["robos:bodyPoints"] = cls.bodyPoints;
  hero["robos:currentBP"] = cls.bodyPoints;
  hero["robos:mindPoints"] = cls.mindPoints;
  hero["robos:currentMP"] = cls.mindPoints;
  hero["robos:attackDice"] = cls.attackDice;
  hero["robos:defendDice"] = cls.defendDice;
  hero["robos:startingWeapon"] = cls.startingWeapon || hero["robos:startingWeapon"];
  hero["robos:equippedWeapon"] = cls.startingWeapon || hero["robos:equippedWeapon"];
  hero["robos:equippedArmor"] = cls.startingArmor || hero["robos:equippedArmor"];
  hero["robos:specialAbility"] = cls.abilities || hero["robos:specialAbility"];
  if (cls.icon) hero["robos:icon"] = cls.icon;
  if (cls.color) hero["robos:tokenColor"] = cls.color;

  if (currentData.activeHeroId === hero["@id"]) {
    selectHero(hero["@id"]);
  }
  renderHeroesList();
  renderQuestHeroesReviewGrid();
  return hero;
}

function createCustomMonsterFromClass(classIdOrName, customOverrides = {}) {
  const cls = getClassByIdOrName(classIdOrName) || getClassByIdOrName("Goblin");
  const timestamp = Date.now().toString(36);
  const newId = customOverrides["@id"] || customOverrides.id || `urn:robos:tabletop:monster:custom-${cls.slug}-${timestamp}`;
  const defaultCat = customOverrides.category ||
    ((currentData.activeMonsterCategoryFilter && currentData.activeMonsterCategoryFilter !== "All")
      ? currentData.activeMonsterCategoryFilter
      : "Base Game");

  const newMonster = {
    "@id": newId,
    "@type": [
      "oslc_am:Resource",
      "robos:TabletopMonster",
      "robos:GameMonster",
      "schema:Person"
    ],
    "dcterms:title": customOverrides.name || customOverrides["dcterms:title"] || `Custom ${cls.name}`,
    "dcterms:description": customOverrides.description || customOverrides["dcterms:description"] || `Custom monster extending the ${cls.name} Enemy Class (${cls.abilities}).`,
    "robos:category": defaultCat,
    "robos:extendsClass": cls.name,
    "robos:monsterArchetype": cls.name,
    "robos:archetype": cls.name,
    "robos:icon": customOverrides.icon || cls.icon || "👹",
    "robos:bodyPoints": customOverrides.bodyPoints !== undefined ? customOverrides.bodyPoints : cls.bodyPoints,
    "robos:mindPoints": customOverrides.mindPoints !== undefined ? customOverrides.mindPoints : cls.mindPoints,
    "robos:attackDice": customOverrides.attackDice !== undefined ? customOverrides.attackDice : cls.attackDice,
    "robos:defendDice": customOverrides.defendDice !== undefined ? customOverrides.defendDice : cls.defendDice,
    "robos:movementSquares": customOverrides.movementSquares !== undefined ? customOverrides.movementSquares : cls.movementSquares,
    "robos:abilities": customOverrides.abilities || cls.abilities,
    "robos:roomId": customOverrides.roomId || "room-center",
    "robos:isBoss": customOverrides.isBoss !== undefined ? !!customOverrides.isBoss : !!cls.isBoss,
    "robos:isUndead": customOverrides.isUndead !== undefined ? !!customOverrides.isUndead : !!cls.isUndead,
    "robos:isSpellcaster": customOverrides.isSpellcaster !== undefined ? !!customOverrides.isSpellcaster : !!cls.isSpellcaster,
    "robos:spells": customOverrides.spells || (cls.isSpellcaster ? ["urn:robos:tabletop:spell:lightning-bolt"] : []),
    "robos:tokenColor": customOverrides.color || cls.color || "#991b1b"
  };

  currentData.monsters.push(newMonster);
  renderMonstersList();
  selectMonster(newId);
  syncBoardMonsterSelectDropdown();
  triggerMonsterAutosave();
  setStatus(`Created custom monster '${newMonster["dcterms:title"]}' extending Enemy Class '${cls.name}'.`);
  return newMonster;
}

function getActiveClass() {
  initClassesCatalog();
  return currentData.classes.find(c => c.id === currentData.activeClassId) || currentData.classes[0] || null;
}

function selectClass(classIdOrName) {
  const cls = getClassByIdOrName(classIdOrName);
  if (!cls) return null;
  currentData.activeClassId = cls.id;

  const titleEl = document.getElementById("class-editor-title");
  const badgeEl = document.getElementById("class-type-badge");
  const createMonBtn = document.getElementById("btn-create-monster-from-class");

  if (titleEl) titleEl.textContent = `Class: ${cls.name}`;
  if (badgeEl) {
    badgeEl.textContent = cls.classType === "Hero" ? "Hero Class" : "Enemy Class (Base Monster)";
    badgeEl.className = cls.classType === "Hero" ? "badge badge-cyan" : "badge badge-purple";
  }
  if (createMonBtn) {
    createMonBtn.style.display = cls.classType === "Enemy" ? "inline-flex" : "none";
  }

  const clsAssets = getClassAssetUrls(cls);
  const clsPortraitEl = document.getElementById("class-portrait-preview");
  const clsTokenEl = document.getElementById("class-token-preview");
  if (clsPortraitEl) clsPortraitEl.src = clsAssets.portraitUrl;
  if (clsTokenEl) clsTokenEl.src = clsAssets.tokenUrl;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : "";
  };
  setVal("class-id", cls.id);
  setVal("class-name", cls.name);
  setVal("class-type", cls.classType);
  setVal("class-icon", cls.icon || "🛡️");
  setVal("class-color", cls.color || "#dc2626");
  setVal("class-bp", cls.bodyPoints);
  setVal("class-mp", cls.mindPoints);
  setVal("class-atk", cls.attackDice);
  setVal("class-def", cls.defendDice);
  setVal("class-move", cls.movementSquares);
  setVal("class-abilities", cls.abilities || "");
  setVal("class-weapon", cls.startingWeapon || "");
  setVal("class-armor", cls.startingArmor || "");
  setVal("class-description", cls.description || "");

  const bossChk = document.getElementById("class-is-boss");
  if (bossChk) bossChk.checked = !!cls.isBoss;
  const undeadChk = document.getElementById("class-is-undead");
  if (undeadChk) undeadChk.checked = !!cls.isUndead;
  const casterChk = document.getElementById("class-is-spellcaster");
  if (casterChk) casterChk.checked = !!cls.isSpellcaster;

  // In-place active toggle to avoid full list re-render
  const items = document.querySelectorAll("#classes-list .list-item");
  if (items.length > 0) {
    items.forEach(el => {
      el.classList.toggle("active", el.dataset.classId === cls.id);
    });
  } else {
    renderClassesList();
  }
  return cls;
}

function renderClassesList() {
  const listEl = document.getElementById("classes-list");
  if (!listEl) return;
  const filtered = getClasses(currentData.activeClassTypeFilter || "All");
  listEl.innerHTML = "";

  const fragment = document.createDocumentFragment();
  filtered.forEach(cls => {
    const div = document.createElement("div");
    div.className = "list-item" + (cls.id === currentData.activeClassId ? " active" : "");
    div.dataset.classId = cls.id;
    const typeBadgeStyle = cls.classType === "Hero"
      ? "background:rgba(56,189,248,0.16); color:#7dd3fc; border:1px solid rgba(56,189,248,0.35);"
      : "background:rgba(239,68,68,0.16); color:#fca5a5; border:1px solid rgba(239,68,68,0.35);";
    const { tokenUrl, portraitUrl } = getClassAssetUrls(cls);
    div.innerHTML = `
      <div style="display:flex; flex-direction:column; width:100%; gap:2px;">
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:6px;">
          <span style="display:flex; align-items:center; gap:6px;">
            <img src="${tokenUrl}" alt="" style="width:22px; height:22px; border-radius:50%; object-fit:cover; border:1px solid #d97706;">
            <img src="${portraitUrl}" alt="" style="width:20px; height:22px; border-radius:3px; object-fit:cover; border:1px solid #475569;">
            <strong>${escapeHtml(cls.name)}</strong>
          </span>
          <span class="badge" style="font-size:0.65rem; padding:1px 6px; ${typeBadgeStyle}">${cls.classType}</span>
        </div>
        <div style="font-size:0.68rem; color:#94a3b8; margin-left:4px;">
          BP:${cls.bodyPoints} • MP:${cls.mindPoints} • Atk:${cls.attackDice} • Def:${cls.defendDice}
        </div>
      </div>
    `;
    div.onclick = () => selectClass(cls.id);
    fragment.appendChild(div);
  });
  listEl.appendChild(fragment);
}

function renderClassesTab() {
  initClassesCatalog();
  renderClassesList();

  const activeCls = getActiveClass();
  if (activeCls) {
    selectClass(activeCls.id);
  }

  // Sync monster-base-class dropdown with all Enemy Classes
  const monBaseSelect = document.getElementById("monster-base-class");
  if (monBaseSelect) {
    const prevVal = monBaseSelect.value;
    monBaseSelect.innerHTML = "";
    const fragment = document.createDocumentFragment();
    getEnemyClasses().forEach(ec => {
      const opt = document.createElement("option");
      opt.value = ec.name;
      opt.textContent = `${ec.name} (BP:${ec.bodyPoints} MP:${ec.mindPoints} Atk:${ec.attackDice} Def:${ec.defendDice} Move:${ec.movementSquares})`;
      fragment.appendChild(opt);
    });
    monBaseSelect.appendChild(fragment);
    if (prevVal && Array.from(monBaseSelect.options).some(o => o.value === prevVal)) {
      monBaseSelect.value = prevVal;
    }
  }

  // Render overview cards grid
  const gridEl = document.getElementById("classes-overview-grid");
  const countBadge = document.getElementById("classes-count-badge");
  const filtered = getClasses(currentData.activeClassTypeFilter || "All");
  if (countBadge) countBadge.textContent = `${filtered.length} Classes`;
  if (!gridEl) return;

  gridEl.innerHTML = "";
  const fragment = document.createDocumentFragment();
  filtered.forEach(cls => {
    const card = document.createElement("div");
    card.className = "spell-card class-reference-card";
    card.dataset.classId = cls.id;
    card.dataset.classType = cls.classType;
    const isHero = cls.classType === "Hero";
    const badgeStyle = isHero
      ? "background:rgba(56,189,248,0.16); color:#7dd3fc; border:1px solid rgba(56,189,248,0.35);"
      : "background:rgba(239,68,68,0.16); color:#fca5a5; border:1px solid rgba(239,68,68,0.35);";
    const { tokenUrl, portraitUrl } = getClassAssetUrls(cls);
    card.innerHTML = `
      <div class="spell-card-top-badges">
        <span class="badge" style="font-size:0.68rem; padding:1px 6px; ${badgeStyle}">${isHero ? "Hero Class" : "Enemy Class"}</span>
        <span style="font-size:0.74rem; color:#94a3b8; font-weight:600;">${cls.bodyPoints} BP • ${cls.mindPoints} MP</span>
      </div>
      <div class="card-title" style="display:flex; align-items:center; gap:8px;">
        <img src="${tokenUrl}" alt="${escapeHtml(cls.name)} Token" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border:1.5px solid #f59e0b; flex-shrink:0;">
        <img src="${portraitUrl}" alt="${escapeHtml(cls.name)} Portrait" style="width:28px; height:32px; border-radius:4px; object-fit:cover; border:1px solid #64748b; flex-shrink:0;">
        <span>${escapeHtml(cls.name)}</span>
      </div>
      <div class="card-meta" style="font-weight:700; color:#38bdf8;">
        ${cls.attackDice} Atk • ${cls.defendDice} Def • ${cls.movementSquares} Move
      </div>
      <div class="card-meta" style="flex:1; font-size:0.74rem; color:#cbd5e1;">
        <strong>Abilities:</strong> ${escapeHtml(cls.abilities || cls.description || "")}
      </div>
      <div class="spell-card-footer">
        <button class="btn btn-xs btn-secondary btn-inspect-class" data-class-id="${escapeHtml(cls.id)}">Inspect Class</button>
        ${!isHero ? `<button class="btn btn-xs btn-accent btn-extend-enemy-class" data-class-name="${escapeHtml(cls.name)}">+ Extend as Monster</button>` : ""}
      </div>
    `;
    card.querySelector(".btn-inspect-class")?.addEventListener("click", () => {
      selectClass(cls.id);
    });
    card.querySelector(".btn-extend-enemy-class")?.addEventListener("click", () => {
      createCustomMonsterFromClass(cls.name);
      // Switch to Monsters tab so user sees their new custom monster immediately
      const monTabBtn = document.querySelector('.tab-btn[data-tab="tab-monsters"]');
      if (monTabBtn) monTabBtn.click();
    });
    fragment.appendChild(card);
  });
  gridEl.appendChild(fragment);
}

let classControlsInitialized = false;
function setupClassEditorControls() {
  if (classControlsInitialized) return;
  classControlsInitialized = true;

  document.getElementById("class-type-filter")?.addEventListener("change", (e) => {
    currentData.activeClassTypeFilter = e.target.value || "All";
    renderClassesTab();
  });

  const bindClassInput = (id, prop, isNum = false) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      const cls = getActiveClass();
      if (!cls) return;
      cls[prop] = isNum ? (parseInt(e.target.value, 10) || 0) : e.target.value;
      if (prop === "name") {
        const t = document.getElementById("class-editor-title");
        if (t) t.textContent = `Class: ${cls.name}`;
      }
      renderClassesList();
    });
  };

  bindClassInput("class-name", "name", false);
  bindClassInput("class-type", "classType", false);
  bindClassInput("class-icon", "icon", false);
  bindClassInput("class-color", "color", false);
  bindClassInput("class-bp", "bodyPoints", true);
  bindClassInput("class-mp", "mindPoints", true);
  bindClassInput("class-atk", "attackDice", true);
  bindClassInput("class-def", "defendDice", true);
  bindClassInput("class-move", "movementSquares", true);
  bindClassInput("class-abilities", "abilities", false);
  bindClassInput("class-weapon", "startingWeapon", false);
  bindClassInput("class-armor", "startingArmor", false);
  bindClassInput("class-description", "description", false);

  document.getElementById("class-is-boss")?.addEventListener("change", (e) => {
    const cls = getActiveClass();
    if (cls) cls.isBoss = e.target.checked;
  });
  document.getElementById("class-is-undead")?.addEventListener("change", (e) => {
    const cls = getActiveClass();
    if (cls) cls.isUndead = e.target.checked;
  });
  document.getElementById("class-is-spellcaster")?.addEventListener("change", (e) => {
    const cls = getActiveClass();
    if (cls) cls.isSpellcaster = e.target.checked;
  });

  document.getElementById("btn-save-class")?.addEventListener("click", async () => {
    const cls = getActiveClass();
    if (!cls) return;
    renderClassesTab();
    setStatus(`Saved RPG Class '${cls.name}' (${cls.classType} Class — BP:${cls.bodyPoints} MP:${cls.mindPoints} Atk:${cls.attackDice} Def:${cls.defendDice}).`);
  });

  document.getElementById("btn-add-class")?.addEventListener("click", () => {
    const ts = Date.now().toString(36);
    const defaultType = currentData.activeClassTypeFilter === "Hero" ? "Hero" : "Enemy";
    const newCls = {
      id: `urn:robos:tabletop:class:custom-${ts}`,
      slug: `custom-${ts}`,
      name: `New ${defaultType} Class`,
      classType: defaultType,
      icon: defaultType === "Hero" ? "🛡️" : "👹",
      color: defaultType === "Hero" ? "#0284c7" : "#991b1b",
      bodyPoints: defaultType === "Hero" ? 6 : 2,
      mindPoints: 3,
      attackDice: 3,
      defendDice: 3,
      movementSquares: 7,
      startingWeapon: "Broadblade (3 Attack Dice)",
      startingArmor: "Chain Hauberk (3 Defend Dice)",
      abilities: "Custom class starting stats and abilities",
      description: "Custom RPG class.",
      isBoss: false,
      isUndead: false,
      isSpellcaster: false
    };
    currentData.classes.push(newCls);
    renderClassesTab();
    selectClass(newCls.id);
    setStatus(`Created new ${defaultType} Class: '${newCls.name}'`);
  });

  document.getElementById("btn-delete-class")?.addEventListener("click", () => {
    if (currentData.classes.length <= 1) return;
    const cls = getActiveClass();
    if (!cls) return;
    currentData.classes = currentData.classes.filter(c => c.id !== cls.id);
    currentData.activeClassId = currentData.classes[0]?.id || null;
    renderClassesTab();
    setStatus(`Deleted class '${cls.name}'.`);
  });

  document.getElementById("btn-create-monster-from-class")?.addEventListener("click", () => {
    const cls = getActiveClass();
    if (!cls) return;
    createCustomMonsterFromClass(cls.name);
    const monTabBtn = document.querySelector('.tab-btn[data-tab="tab-monsters"]');
    if (monTabBtn) monTabBtn.click();
  });

  document.getElementById("hero-base-class-select")?.addEventListener("change", (e) => {
    const val = e.target.value;
    if (!val) return;
    const clsName = val.replace("class-hero-", "");
    applyClassToHero(getActiveHero(), clsName);
    e.target.value = "";
  });
}

function logMonsterCombatAction(msg, type = "system") {
  const logEl = document.getElementById("monster-combat-roll-log");
  if (!logEl) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${msg}`;
  logEl.prepend(entry);
}

async function saveActiveMonsterToKGraph(explicit = false) {
  const monster = getActiveMonster();
  if (!monster) return { success: false, error: "No active monster" };

  const baseClass = monster["robos:extendsClass"] || monster["robos:monsterArchetype"] || monster["robos:archetype"] || "Goblin";
  const assetKey = resolveMonsterAssetKey(monster);
  const monsterNode = {
    "@id": monster["@id"],
    "@type": [
      "oslc_am:Resource",
      "robos:TabletopMonster",
      "robos:GameMonster",
      "schema:Person"
    ],
    "dcterms:title": monster["dcterms:title"] || "Monster",
    "dcterms:description": monster["dcterms:description"] || "",
    "robos:category": monster["robos:category"] || "Base Game",
    "robos:extendsClass": baseClass,
    "robos:mirrorsMonster": monster["robos:mirrorsMonster"] || undefined,
    "robos:monsterArchetype": monster["robos:monsterArchetype"] || baseClass,
    "robos:archetype": monster["robos:archetype"] || baseClass,
    "robos:abilities": monster["robos:abilities"] || "",
    "robos:icon": monster["robos:icon"] || "👹",
    "robos:tokenAsset": monster["robos:tokenAsset"] || `../assets/tokens/token_${assetKey}.png`,
    "robos:portraitAsset": monster["robos:portraitAsset"] || `../assets/portraits/card_bg_${assetKey}.png`,
    "robos:bodyPoints": parseInt(monster["robos:bodyPoints"], 10) || 1,
    "robos:mindPoints": monster["robos:mindPoints"] !== undefined ? parseInt(monster["robos:mindPoints"], 10) : 1,
    "robos:attackDice": parseInt(monster["robos:attackDice"], 10) || 2,
    "robos:defendDice": parseInt(monster["robos:defendDice"], 10) || 2,
    "robos:movementSquares": parseInt(monster["robos:movementSquares"], 10) || 6,
    "robos:roomId": monster["robos:roomId"] || "room-center",
    "robos:isBoss": !!monster["robos:isBoss"],
    "robos:isUndead": !!monster["robos:isUndead"],
    "robos:isSpellcaster": !!monster["robos:isSpellcaster"],
    "robos:spells": monster["robos:spells"] || [],
    "robos:tokenColor": monster["robos:tokenColor"] || "#991b1b",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  };

  try {
    const res = await window.robosTabletop.saveKGraphEntity({ entity: monsterNode });
    syncBoardMonsterSelectDropdown();
    if (explicit) {
      if (res && res.success) {
        setStatus(`Saved monster '${monsterNode["dcterms:title"]}' (Extends Class: ${baseClass}) to Knowledge Graph.`);
        logMonsterCombatAction(`💾 Monster '${monsterNode["dcterms:title"]}' saved to Knowledge Graph.`, "system");
      } else {
        setStatus(`Error saving monster: ${res ? res.error : "Unknown"}`);
      }
    }
    return res;
  } catch (err) {
    if (explicit) setStatus(`Save failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

let monsterAutosaveTimer = null;
function triggerMonsterAutosave() {
  clearTimeout(monsterAutosaveTimer);
  monsterAutosaveTimer = setTimeout(() => {
    saveActiveMonsterToKGraph(false);
  }, 400);
}

function renderMonstersList() {
  const container = document.getElementById("monsters-list");
  if (!container) return;
  container.innerHTML = "";

  const filtered = getMonstersByCategory(currentData.activeMonsterCategoryFilter);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-muted" style="padding:12px; font-size:0.8rem; font-style:italic;">No monsters in category '${escapeHtml(currentData.activeMonsterCategoryFilter)}'. Click "+ Add" to create one.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(m => {
    const div = document.createElement("div");
    div.className = "list-item" + (m["@id"] === currentData.activeMonsterId ? " active" : "");
    div.dataset.monsterId = m["@id"];
    const tokUrl = getMonsterTokenUrl(m);
    const portUrl = getMonsterPortraitUrl(m);
    const cat = m["robos:category"] || "Base Game";
    const baseClass = m["robos:extendsClass"] || m["robos:monsterArchetype"] || "Goblin";
    const catBadgeColor = cat === "Midterms 2026"
      ? "background:rgba(245,158,11,0.18); color:#fde047; border:1px solid rgba(245,158,11,0.4);"
      : "background:rgba(56,189,248,0.12); color:#7dd3fc; border:1px solid rgba(56,189,248,0.25);";
    div.innerHTML = `
      <div style="display:flex; flex-direction:column; width:100%; gap:2px;">
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:6px;">
          <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <img src="${tokUrl}" alt="Token" title="Board Token" style="width:22px; height:22px; border-radius:50%; object-fit:cover; border:1.5px solid #f59e0b; flex-shrink:0;">
            <img src="${portUrl}" alt="Portrait" title="Portrait" style="width:20px; height:22px; border-radius:3px; object-fit:cover; border:1px solid #475569; flex-shrink:0;">
            <strong style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(m["dcterms:title"] || m["@id"])}</strong>
          </span>
          <span class="badge" style="font-size:0.65rem; padding:1px 5px; flex-shrink:0; ${catBadgeColor}">${escapeHtml(cat)}</span>
        </div>
        <div style="font-size:0.68rem; color:#94a3b8; margin-left:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Class: <span style="color:#38bdf8;">${escapeHtml(baseClass)}</span></div>
      </div>
    `;
    div.onclick = () => selectMonster(m["@id"]);
    fragment.appendChild(div);
  });
  container.appendChild(fragment);

  if ((!currentData.activeMonsterId || !filtered.some(m => m["@id"] === currentData.activeMonsterId)) && filtered.length > 0) {
    selectMonster(filtered[0]["@id"]);
  }
}

function selectMonster(monsterId) {
  currentData.activeMonsterId = monsterId;
  const monster = currentData.monsters.find(m => m["@id"] === monsterId);
  if (!monster) return;

  // In-place active toggle to avoid full list re-render
  const items = document.querySelectorAll("#monsters-list .list-item");
  if (items.length > 0) {
    items.forEach(el => {
      el.classList.toggle("active", el.dataset.monsterId === monsterId);
    });
  } else {
    renderMonstersList();
  }
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const titleEl = document.getElementById("monster-editor-title");
  if (titleEl) titleEl.textContent = "Edit Monster: " + (monster["dcterms:title"] || "");
  setVal("monster-id", monster["@id"] || "");
  setVal("monster-name", monster["dcterms:title"] || "");

  // Update both Monster Portrait & Circular Board Token previews
  const assetKey = resolveMonsterAssetKey(monster);
  const tokUrl = getMonsterTokenUrl(monster);
  const portUrl = getMonsterPortraitUrl(monster);
  const portImgEl = document.getElementById("monster-portrait-preview");
  const tokImgEl = document.getElementById("monster-token-preview");
  const portPathEl = document.getElementById("monster-portrait-path-label");
  const tokPathEl = document.getElementById("monster-token-path-label");
  if (portImgEl) portImgEl.src = portUrl;
  if (tokImgEl) tokImgEl.src = tokUrl;
  if (portPathEl) portPathEl.textContent = `card_bg_${assetKey}.png`;
  if (tokPathEl) tokPathEl.textContent = `token_${assetKey}.png`;

  const catEl = document.getElementById("monster-category");
  if (catEl) {
    const mCat = monster["robos:category"] || "Base Game";
    if (!currentData.categories.includes(mCat)) addCategory(mCat);
    catEl.value = mCat;
  }

  const baseClass = monster["robos:extendsClass"] || monster["robos:monsterArchetype"] || monster["robos:archetype"] || (monster["robos:isBoss"] ? "Dragon" : "Goblin");
  monster["robos:extendsClass"] = baseClass;
  const baseClassEl = document.getElementById("monster-base-class");
  if (baseClassEl) baseClassEl.value = baseClass;

  const archEl = document.getElementById("monster-archetype");
  if (archEl) archEl.value = monster["robos:archetype"] || monster["robos:monsterArchetype"] || baseClass;

  const abilEl = document.getElementById("monster-abilities");
  if (abilEl) {
    const clsObj = getClassByIdOrName(baseClass);
    abilEl.value = monster["robos:abilities"] || (clsObj ? clsObj.abilities : "");
  }

  const iconEl = document.getElementById("monster-icon");
  if (iconEl) iconEl.value = monster["robos:icon"] || (monster["robos:isBoss"] ? "👑" : "👹");

  const colorEl = document.getElementById("monster-color");
  if (colorEl) colorEl.value = monster["robos:tokenColor"] || "#991b1b";

  const descEl = document.getElementById("monster-description");
  if (descEl) descEl.value = monster["dcterms:description"] || "";

  setVal("monster-bp", monster["robos:bodyPoints"] || 1);
  const mpEl = document.getElementById("monster-mp");
  if (mpEl) {
    const clsObj = getClassByIdOrName(baseClass);
    mpEl.value = monster["robos:mindPoints"] !== undefined ? monster["robos:mindPoints"] : (clsObj ? clsObj.mindPoints : 1);
  }
  setVal("monster-atk", monster["robos:attackDice"] || 2);
  setVal("monster-def", monster["robos:defendDice"] || 2);
  setVal("monster-move", monster["robos:movementSquares"] || 6);
  setVal("monster-room", monster["robos:roomId"] || "room-center");
  const bossCheckbox = document.getElementById("monster-is-boss");
  if (bossCheckbox) bossCheckbox.checked = !!monster["robos:isBoss"];
  const undeadCheckbox = document.getElementById("monster-is-undead");
  if (undeadCheckbox) undeadCheckbox.checked = !!monster["robos:isUndead"];

  const isCaster = !!monster["robos:isSpellcaster"];
  const casterCheckbox = document.getElementById("monster-is-spellcaster");
  if (casterCheckbox) casterCheckbox.checked = isCaster;

  renderMonsterGrimoire(monster);
  renderMonsterActionScreen(monster);
}

let monsterControlsInitialized = false;
function setupMonsterEditorControls() {
  if (monsterControlsInitialized) return;
  monsterControlsInitialized = true;

  const bindInput = (id, prop, isNumber = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evtName = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evtName, (e) => {
      const monster = getActiveMonster();
      if (!monster) return;
      monster[prop] = isNumber ? parseInt(e.target.value, 10) || 0 : e.target.value;
      if (prop === "dcterms:title" || prop === "robos:category" || prop === "robos:icon") {
        if (prop === "dcterms:title") {
          document.getElementById("monster-editor-title").textContent = "Edit Monster: " + e.target.value;
        }
        renderMonstersList();
        syncBoardMonsterSelectDropdown();
      }
      renderMonsterActionScreen(monster);
      triggerMonsterAutosave();
    });
  };

  bindInput("monster-name", "dcterms:title");
  bindInput("monster-category", "robos:category");
  bindInput("monster-archetype", "robos:monsterArchetype");
  bindInput("monster-abilities", "robos:abilities");
  bindInput("monster-icon", "robos:icon");
  bindInput("monster-color", "robos:tokenColor");
  bindInput("monster-description", "dcterms:description");
  bindInput("monster-bp", "robos:bodyPoints", true);
  bindInput("monster-mp", "robos:mindPoints", true);
  bindInput("monster-atk", "robos:attackDice", true);
  bindInput("monster-def", "robos:defendDice", true);
  bindInput("monster-move", "robos:movementSquares", true);
  bindInput("monster-room", "robos:roomId");

  // When a user selects a Base Enemy Class in #monster-base-class, inherit starting stats & abilities from that class!
  document.getElementById("monster-base-class")?.addEventListener("change", (e) => {
    const monster = getActiveMonster();
    if (!monster) return;
    applyClassToMonster(monster, e.target.value);
    renderMonstersList();
    triggerMonsterAutosave();
    setStatus(`Monster '${monster["dcterms:title"]}' now extends Base Enemy Class '${e.target.value}' (inherited starting stats & abilities).`);
  });

  document.getElementById("monster-is-boss")?.addEventListener("change", (e) => {
    const monster = getActiveMonster();
    if (!monster) return;
    monster["robos:isBoss"] = e.target.checked;
    renderMonstersList();
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
  });

  document.getElementById("monster-is-undead")?.addEventListener("change", (e) => {
    const monster = getActiveMonster();
    if (!monster) return;
    monster["robos:isUndead"] = e.target.checked;
    renderMonstersList();
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
  });

  document.getElementById("monster-is-spellcaster")?.addEventListener("change", (e) => {
    const monster = getActiveMonster();
    if (!monster) return;
    monster["robos:isSpellcaster"] = e.target.checked;
    if (monster["robos:isSpellcaster"] && (!monster["robos:spells"] || monster["robos:spells"].length === 0)) {
      monster["robos:spells"] = ["urn:robos:tabletop:spell:lightning-bolt"];
    }
    renderMonsterGrimoire(monster);
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
  });

  document.getElementById("btn-monster-add-spell")?.addEventListener("click", () => {
    const monster = getActiveMonster();
    const select = document.getElementById("monster-spell-add-select");
    if (!monster || !select || !select.value) return;
    addMonsterSpell(monster, select.value);
  });

  document.getElementById("btn-act-monster-dmg-bp")?.addEventListener("click", () => {
    const monster = getActiveMonster();
    if (!monster || monster["robos:currentBP"] <= 0) return;
    monster["robos:currentBP"]--;
    renderMonsterVitalityPips(monster);
    const maxBP = parseInt(monster["robos:bodyPoints"], 10) || 1;
    logMonsterCombatAction(`💥 ${monster["dcterms:title"]} took 1 damage! (BP: ${monster["robos:currentBP"]}/${maxBP})`, "attack");
    if (monster["robos:currentBP"] === 0) {
      logMonsterCombatAction(`💀 ${monster["dcterms:title"]} has been DEFEATED!`, "system");
    }
  });

  document.getElementById("btn-act-monster-heal-bp")?.addEventListener("click", () => {
    const monster = getActiveMonster();
    const maxBP = parseInt(monster["robos:bodyPoints"], 10) || 1;
    if (!monster || monster["robos:currentBP"] >= maxBP) return;
    monster["robos:currentBP"]++;
    renderMonsterVitalityPips(monster);
    logMonsterCombatAction(`💖 ${monster["dcterms:title"]} healed 1 Body Point! (BP: ${monster["robos:currentBP"]}/${maxBP})`, "defend");
  });

  document.getElementById("btn-roll-monster-attack")?.addEventListener("click", rollMonsterAttack);
  document.getElementById("btn-roll-monster-defend")?.addEventListener("click", rollMonsterDefend);
  document.getElementById("btn-roll-monster-move")?.addEventListener("click", rollMonsterMove);
  document.getElementById("btn-cast-monster-spell")?.addEventListener("click", () => castMonsterSpell());

  document.getElementById("btn-save-monster")?.addEventListener("click", () => {
    saveActiveMonsterToKGraph(true);
  });

  document.getElementById("btn-delete-monster")?.addEventListener("click", async () => {
    if (currentData.monsters.length <= 1) return;
    const monster = getActiveMonster();
    if (!monster) return;
    const id = monster["@id"];
    const name = monster["dcterms:title"] || id;
    currentData.monsters = currentData.monsters.filter(m => m["@id"] !== id);
    if (window.robosTabletop?.deleteKGraphEntity) {
      await window.robosTabletop.deleteKGraphEntity({ entityId: id });
    }
    currentData.activeMonsterId = currentData.monsters[0]?.["@id"] || null;
    renderMonstersList();
    if (currentData.activeMonsterId) selectMonster(currentData.activeMonsterId);
    syncBoardMonsterSelectDropdown();
    setStatus(`Deleted monster '${name}'.`);
  });

  document.getElementById("btn-add-monster")?.addEventListener("click", () => {
    const selectedBaseClass = document.getElementById("monster-base-class")?.value || "Goblin";
    createCustomMonsterFromClass(selectedBaseClass);
  });
}

// Render Spells, Dread Spells, Weapons & Quest Items filtered by Category
function renderSpellsAndItems() {
  const activeCat = currentData.activeSpellItemCategoryFilter || "All";

  const formatCatBadge = (cat) => {
    const c = cat || "Base Game";
    const style = c === "Midterms 2026"
      ? "background:rgba(245,158,11,0.18); color:#fde047; border:1px solid rgba(245,158,11,0.45);"
      : (c === "Base Game"
        ? "background:rgba(56,189,248,0.12); color:#7dd3fc; border:1px solid rgba(56,189,248,0.28);"
        : "background:rgba(168,85,247,0.18); color:#e9d5ff; border:1px solid rgba(168,85,247,0.45);");
    return `<span class="badge entity-category-badge" data-category="${escapeHtml(c)}" style="font-size:0.68rem; padding:1px 6px; white-space:nowrap; ${style}">${escapeHtml(c)}</span>`;
  };

  // 1. Hero Spells Grid
  const spellsGrid = document.getElementById("spells-grid");
  if (spellsGrid) {
    spellsGrid.innerHTML = "";
    const elfElement = currentData.spellAllocation?.elfElement || "water";
    const filteredSpells = getSpellsByCategory(activeCat);
    const countBadge = document.getElementById("spells-count-badge");
    if (countBadge) countBadge.textContent = `${filteredSpells.length} Spell${filteredSpells.length === 1 ? "" : "s"}`;

    const fragment = document.createDocumentFragment();
    filteredSpells.forEach(s => {
      const card = document.createElement("div");
      card.className = `spell-card deck-${s.element}`;
      card.dataset.category = s.category || "Base Game";
      const isElf = s.element === elfElement;
      const draftedBy = isElf ? "Elf Grimoire" : "Wizard Grimoire";
      const draftedClass = isElf ? "badge-info" : "badge-purple";
      const sIconUrl = getSpellIconUrl(s);
      card.innerHTML = `
        <div class="spell-card-top-badges">
          ${formatCatBadge(s.category)}
          <span class="element-tag tag-${s.element}">${(s.element || "fire").toUpperCase()}</span>
        </div>
        <div class="card-title" style="display:flex; align-items:center; gap:7px;">
          <img src="${sIconUrl}" alt="" style="width:24px; height:24px; border-radius:4px; object-fit:cover; border:1px solid #475569; flex-shrink:0;">
          <span>${escapeHtml(s.name)}</span>
        </div>
        <div class="card-meta" style="flex:1;">${escapeHtml(s.description)}</div>
        <div class="spell-card-footer">
          <span class="card-meta" style="margin:0;">College: ${ELEMENTAL_DECKS[s.element]?.name || s.element}</span>
          <span class="badge ${draftedClass}" style="font-size:0.7rem; white-space:nowrap;">${draftedBy}</span>
        </div>
      `;
      fragment.appendChild(card);
    });
    spellsGrid.appendChild(fragment);
  }

  // 2. Weapons & Armory Grid
  const itemsGrid = document.getElementById("items-grid");
  if (itemsGrid) {
    itemsGrid.innerHTML = "";
    const filteredWeapons = getWeaponsByCategory(activeCat);
    const countBadge = document.getElementById("weapons-count-badge");
    if (countBadge) countBadge.textContent = `${filteredWeapons.length} Weapon${filteredWeapons.length === 1 ? "" : "s"}`;

    const fragment = document.createDocumentFragment();
    filteredWeapons.forEach(item => {
      const card = document.createElement("div");
      card.className = "spell-card weapon-card";
      card.dataset.category = item.category || "Base Game";
      const wIconUrl = getWeaponIconUrl(item);
      card.innerHTML = `
        <div class="spell-card-top-badges">
          ${formatCatBadge(item.category)}
          <span style="font-weight:700; color:#fbbf24; font-size:0.78rem; white-space:nowrap;">${escapeHtml(item.cost)}</span>
        </div>
        <div class="card-title" style="display:flex; align-items:center; gap:7px;">
          <img src="${wIconUrl}" alt="" style="width:24px; height:24px; border-radius:4px; object-fit:cover; border:1px solid #475569; flex-shrink:0;">
          <span>${escapeHtml(item.name)}</span>
        </div>
        <div class="card-meta" style="font-weight:600; color:#93c5fd;">${escapeHtml(item.type)} • ${escapeHtml(item.dice)}</div>
        ${item.description ? `<div class="card-meta" style="flex:1; font-size:0.74rem;">${escapeHtml(item.description)}</div>` : ""}
      `;
      fragment.appendChild(card);
    });
    itemsGrid.appendChild(fragment);
  }

  // 3. Quest Items, Relics & Satire Artifacts Grid
  const questItemsGrid = document.getElementById("quest-items-grid");
  if (questItemsGrid) {
    questItemsGrid.innerHTML = "";
    const filteredItems = getItemsByCategory(activeCat);
    const countBadge = document.getElementById("quest-items-count-badge");
    if (countBadge) countBadge.textContent = `${filteredItems.length} Item${filteredItems.length === 1 ? "" : "s"}`;

    const fragment = document.createDocumentFragment();
    filteredItems.forEach(item => {
      const card = document.createElement("div");
      card.className = "spell-card quest-item-card";
      card.dataset.category = item.category || "Base Game";
      const iIconUrl = getItemIconUrl(item);
      card.innerHTML = `
        <div class="spell-card-top-badges">
          ${formatCatBadge(item.category)}
          <span style="font-weight:700; color:#34d399; font-size:0.78rem; white-space:nowrap;">${escapeHtml(item.cost || (item.value + " GP"))}</span>
        </div>
        <div class="card-title" style="display:flex; align-items:center; gap:7px;">
          <img src="${iIconUrl}" alt="" style="width:24px; height:24px; border-radius:4px; object-fit:cover; border:1px solid #475569; flex-shrink:0;">
          <span>${escapeHtml(item.name)}</span>
        </div>
        <div class="card-meta" style="font-weight:600; color:#a7f3d0;">${escapeHtml((item.type || "item").toUpperCase())} • ${escapeHtml(item.effect)}</div>
        ${item.description ? `<div class="card-meta" style="flex:1; font-size:0.74rem;">${escapeHtml(item.description)}</div>` : ""}
      `;
      fragment.appendChild(card);
    });
    questItemsGrid.appendChild(fragment);
  }

  // 4. Dread & Chaos Spells Grid
  const dreadGrid = document.getElementById("dread-spells-grid");
  if (dreadGrid) {
    dreadGrid.innerHTML = "";
    const filteredDread = getDreadSpellsByCategory(activeCat);
    const countBadge = document.getElementById("dread-spells-count-badge");
    if (countBadge) countBadge.textContent = `${filteredDread.length} Chaos Spell${filteredDread.length === 1 ? "" : "s"}`;

    const fragment = document.createDocumentFragment();
    filteredDread.forEach(s => {
      const card = document.createElement("div");
      card.className = "spell-card deck-dread";
      card.dataset.category = s.category || "Base Game";
      const sIconUrl = getSpellIconUrl(s);
      card.innerHTML = `
        <div class="spell-card-top-badges">
          ${formatCatBadge(s.category)}
          <span class="element-tag tag-dread">DREAD MAGIC</span>
        </div>
        <div class="card-title" style="color:#f3e8ff; display:flex; align-items:center; gap:7px;">
          <img src="${sIconUrl}" alt="" style="width:24px; height:24px; border-radius:4px; object-fit:cover; border:1px solid #7e22ce; flex-shrink:0;">
          <span>${escapeHtml(s.name)}</span>
        </div>
        <div class="card-meta" style="flex:1;">${escapeHtml(s.description)}</div>
        <div class="spell-card-footer">
          <span class="card-meta" style="margin:0; color:#c084fc;">${s.category === "Midterms 2026" ? "Spin Doctors & Hydra Bosses" : "Witch Lord & Chaos Sorcerers"}</span>
          <span class="badge" style="background:#581c87; color:#f3e8ff; border:1px solid #7e22ce; font-size:0.7rem; white-space:nowrap;">Enemy Magic</span>
        </div>
      `;
      fragment.appendChild(card);
    });
    dreadGrid.appendChild(fragment);
  }
}

// ==========================================
// 3. CAMPAIGN & MULTI-QUEST ENGINE
// ==========================================

function getCampaigns() {
  return currentData.campaigns;
}

function getCampaign() {
  return currentData.campaign;
}

function getActiveQuest() {
  return currentData.currentQuest || currentData.campaign?.quests?.[currentData.currentQuestIndex >= 0 ? currentData.currentQuestIndex : 0] || null;
}

function switchCampaignSubtab(subtabId) {
  const validSubtabs = ["subtab-campaign-quests", "subtab-campaign-heroes"];
  const targetId = validSubtabs.includes(subtabId) ? subtabId : "subtab-campaign-quests";
  currentData.activeCampaignSubtab = targetId;

  document.querySelectorAll(".campaign-subtab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.campaignSubtab === targetId);
  });

  document.querySelectorAll(".campaign-subpane").forEach(pane => {
    const isTarget = pane.id === targetId;
    pane.classList.toggle("active", isTarget);
    pane.style.display = isTarget ? "block" : "none";
  });

  if (targetId === "subtab-campaign-heroes") {
    renderHeroesList();
    if (currentData.activeHeroId) {
      selectHero(currentData.activeHeroId);
    } else if (currentData.heroes.length > 0) {
      selectHero(currentData.heroes[0]["@id"]);
    }
  }
  return targetId;
}

function autoResizeCampaignNameInput(el) {
  if (!el || typeof el.style === "undefined") return;
  el.style.height = "auto";
  const sh = Number(el.scrollHeight) || 0;
  if (sh > 0) {
    el.style.height = `${Math.max(44, Math.min(110, sh))}px`;
  }
}

function renderCampaignSelectorUI() {
  const selectEl = document.getElementById("campaign-select");
  if (selectEl) {
    selectEl.innerHTML = "";
    currentData.campaigns.forEach((camp, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      const qCount = Array.isArray(camp.quests) ? camp.quests.length : 0;
      const hCount = Array.isArray(camp.heroes) ? camp.heroes.length : 0;
      opt.textContent = `${camp.title} (${qCount} Quests, ${hCount} Heroes)`;
      if (idx === currentData.currentCampaignIndex) {
        opt.selected = true;
      }
      selectEl.appendChild(opt);
    });
  }

  const cNameInput = document.getElementById("campaign-name-input");
  if (cNameInput && currentData.campaign) {
    if (typeof document === "undefined" || document.activeElement !== cNameInput) {
      cNameInput.value = currentData.campaign.title || "";
    }
    autoResizeCampaignNameInput(cNameInput);
  }

  const scopeLabel = document.getElementById("campaign-scope-label");
  if (scopeLabel && currentData.campaign) {
    scopeLabel.textContent = currentData.campaign.title || "Active Campaign";
  }

  const qCountEl = document.getElementById("campaign-subtab-quests-count");
  if (qCountEl && currentData.campaign?.quests) {
    qCountEl.textContent = String(currentData.campaign.quests.length);
  }

  const hCountEl = document.getElementById("campaign-subtab-heroes-count");
  if (hCountEl && currentData.campaign?.heroes) {
    hCountEl.textContent = String(currentData.campaign.heroes.length);
  }

  const delCampBtn = document.getElementById("btn-delete-campaign");
  if (delCampBtn) {
    delCampBtn.disabled = currentData.campaigns.length <= 1;
    delCampBtn.style.opacity = currentData.campaigns.length <= 1 ? "0.4" : "1";
    delCampBtn.style.cursor = currentData.campaigns.length <= 1 ? "not-allowed" : "pointer";
  }
}

function serializeCampaignToKGraphNode(camp, isActiveCampaign = false) {
  if (!camp) return null;
  const campId = camp.id || "campaign-heroquest-base";
  return {
    "@id": `urn:robos:tabletop:campaign:${campId}`,
    "@type": [
      "oslc_am:Resource",
      "robos:TabletopCampaign",
      "schema:CreativeWork"
    ],
    "dcterms:title": camp.title || "HeroQuest",
    "dcterms:description": camp.description || "",
    "robos:campaignId": campId,
    "robos:isActiveCampaign": Boolean(isActiveCampaign),
    "robos:heroPack": camp.heroPack || "Base Game",
    "robos:heroes": Array.isArray(camp.heroes) ? camp.heroes : [],
    "robos:quests": (Array.isArray(camp.quests) ? camp.quests : []).map(q => ({
      id: q.id,
      slug: q.slug,
      title: q.title,
      briefing: q.briefing || "",
      mapConfigId: q.mapConfigId || "heroquest-classic",
      ruleset: q.ruleset || "heroquest",
      goldReward: q.goldReward !== undefined ? q.goldReward : 150,
      bossTarget: q.bossTarget || "",
      completed: Boolean(q.completed),
      startingStairs: Array.isArray(q.startingStairs) ? [...q.startingStairs] : [7, 14],
      cartridgeFile: q.cartridgeFile || `${q.slug || "custom-quest"}.cartridge.json`,
      activeRooms: Array.from(q.activeRooms || [])
    })),
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  };
}

function deserializeCampaignFromKGraphNode(node) {
  if (!node) return null;
  const campId = node["robos:campaignId"] || String(node["@id"] || "").replace(/^urn:robos:tabletop:campaign:/, "") || "campaign-custom";
  const rawQuests = Array.isArray(node["robos:quests"]) ? node["robos:quests"] : [];
  const heroPack = node["robos:heroPack"] || (String(node["dcterms:title"] || "").toLowerCase().includes("election") ? "Midterms 2026" : "Base Game");
  return {
    id: campId,
    title: node["dcterms:title"] || "Campaign",
    description: node["dcterms:description"] || "",
    isActiveCampaign: Boolean(node["robos:isActiveCampaign"]),
    heroPack,
    heroes: Array.isArray(node["robos:heroes"]) && node["robos:heroes"].length > 0
      ? createDefaultCampaignHeroes(node["robos:heroes"])
      : (heroPack === "Midterms 2026" ? createDefaultCampaignHeroes(MIDTERMS_2026_HEROES) : createDefaultCampaignHeroes()),
    quests: rawQuests.map((q, idx) => ({
      id: q.id || `quest-${idx + 1}`,
      slug: q.slug || "custom-quest",
      title: q.title || `Quest ${idx + 1}`,
      briefing: q.briefing || "",
      mapConfigId: q.mapConfigId || "heroquest-classic",
      ruleset: q.ruleset || "heroquest",
      goldReward: q.goldReward !== undefined ? q.goldReward : 150,
      bossTarget: q.bossTarget || "",
      completed: Boolean(q.completed),
      startingStairs: Array.isArray(q.startingStairs) ? [...q.startingStairs] : [7, 14],
      cartridgeFile: q.cartridgeFile || `${q.slug || "custom-quest"}.cartridge.json`,
      activeRooms: new Set(Array.isArray(q.activeRooms) ? q.activeRooms : []),
      wallBlocks: Array.isArray(q.wallBlocks) ? q.wallBlocks : [],
      doors: Array.isArray(q.doors) ? q.doors : [],
      furniture: Array.isArray(q.furniture) ? q.furniture : [],
      monsters: Array.isArray(q.monsters) ? q.monsters : [],
      traps: Array.isArray(q.traps) ? q.traps : []
    }))
  };
}

function applyEmptyQuestEditorUI() {
  currentData.currentQuestIndex = -1;
  currentData.currentQuest = null;
  const emptyCard = document.getElementById("campaign-no-quest-empty-state");
  if (emptyCard) emptyCard.style.display = "block";
  const mainCard = document.getElementById("quest-editor-main-card");
  if (mainCard) mainCard.style.display = "none";
  const heroesReviewCard = document.getElementById("quest-heroes-review-card");
  if (heroesReviewCard) heroesReviewCard.style.display = "none";
  const saveStateCard = document.getElementById("quest-save-state-card");
  if (saveStateCard) saveStateCard.style.display = "none";

  const editorTitleEl = document.getElementById("quest-editor-title");
  if (editorTitleEl) editorTitleEl.textContent = "No Active Quest";
  const statusBadge = document.getElementById("quest-status-badge");
  if (statusBadge) {
    statusBadge.className = "badge badge-gray";
    statusBadge.textContent = "Empty";
  }
  const cartBadgeEl = document.getElementById("quest-cartridge-badge");
  if (cartBadgeEl) cartBadgeEl.textContent = "📦 None";
  const victoryBanner = document.getElementById("quest-victory-banner");
  if (victoryBanner) victoryBanner.style.display = "none";
  [
    document.getElementById("btn-delete-quest"),
    document.getElementById("btn-sidebar-delete-quest"),
    document.getElementById("btn-header-delete-quest")
  ].forEach(delBtn => {
    if (delBtn) {
      delBtn.disabled = true;
      delBtn.style.opacity = "0.4";
      delBtn.style.cursor = "not-allowed";
    }
  });
}

let campaignAutosaveTimer = null;
async function saveCampaignToKGraph(camp = currentData.campaign, showToast = false) {
  const targetCamp = camp || currentData.campaign;
  if (!targetCamp) return { success: false };

  const indicator = document.getElementById("campaign-autosave-status");
  if (indicator) {
    indicator.textContent = "● Saving...";
    indicator.classList.add("saving");
  }

  try {
    const isActive = targetCamp.id === currentData.campaign?.id;
    const campNode = serializeCampaignToKGraphNode(targetCamp, isActive);
    if (window.robosTabletop?.saveKGraphEntity && campNode) {
      await window.robosTabletop.saveKGraphEntity({ entity: campNode });
    }

    const activeQ = isActive ? currentData.currentQuest : null;
    if (activeQ && activeQ.slug) {
      const questMapNode = {
        "@id": `urn:robos:tabletop:map:${activeQ.slug}`,
        "@type": [
          "oslc_am:Resource",
          "robos:TabletopQuestMap",
          "robos:GameMap",
          "schema:Place"
        ],
        "dcterms:title": activeQ.title,
        "robos:mapConfiguration": activeQ.mapConfigId,
        "robos:activeRooms": Array.from(activeQ.activeRooms || []),
        "robos:startingSpawn": activeQ.startingStairs || [7, 14],
        "robos:wallBlocksCount": (activeQ.wallBlocks || []).length,
        "robos:doorsCount": (activeQ.doors || []).length,
        "robos:furnitureCount": (activeQ.furniture || []).length,
        "robos:monstersCount": (activeQ.monsters || []).length,
        "robos:trapsCount": (activeQ.traps || []).length,
        "robos:package": "tabletop-game",
        "robos:namespace": "robos.tabletop"
      };
      if (window.robosTabletop?.saveKGraphEntity) {
        await window.robosTabletop.saveKGraphEntity({ entity: questMapNode });
      }
      if (window.robosTabletop?.syncCartridgeHeroes) {
        await window.robosTabletop.syncCartridgeHeroes({
          cartridgeSlug: activeQ.slug,
          questTitle: activeQ.title,
          questBriefing: activeQ.briefing,
          mapConfigId: activeQ.mapConfigId
        });
      }
    }

    if (indicator) {
      indicator.textContent = "✓ All changes saved";
      indicator.classList.remove("saving");
    }
    if (showToast) {
      setStatus(`Saved Campaign '${targetCamp.title}' to Knowledge Graph.`);
    }
    return { success: true, campaignId: targetCamp.id };
  } catch (err) {
    if (indicator) {
      indicator.textContent = "✓ All changes saved";
      indicator.classList.remove("saving");
    }
    return { success: false, error: err.message };
  }
}

function triggerCampaignAutosave() {
  const indicator = document.getElementById("campaign-autosave-status");
  if (indicator) {
    indicator.textContent = "● Saving...";
    indicator.classList.add("saving");
  }
  clearTimeout(campaignAutosaveTimer);
  campaignAutosaveTimer = setTimeout(() => {
    saveCampaignToKGraph(currentData.campaign, false);
  }, 150);
}

async function selectCampaign(indexOrId) {
  let idx = -1;
  if (typeof indexOrId === "number") {
    idx = indexOrId;
  } else if (typeof indexOrId === "string") {
    const parsed = parseInt(indexOrId, 10);
    if (!isNaN(parsed) && String(parsed) === indexOrId.trim()) {
      idx = parsed;
    } else {
      idx = currentData.campaigns.findIndex(c => c.id === indexOrId || c.title === indexOrId);
    }
  }
  if (idx < 0 || idx >= currentData.campaigns.length) return null;

  currentData.currentCampaignIndex = idx;
  currentData.campaign = currentData.campaigns[idx];

  if (!Array.isArray(currentData.campaign.heroes) || currentData.campaign.heroes.length === 0) {
    currentData.campaign.heroes = createDefaultCampaignHeroes();
  }
  currentData.heroes = currentData.campaign.heroes;
  currentData.activeHeroId = currentData.heroes[0]?.["@id"] || null;
  if (currentData.campaign.heroPack && currentData.campaign.heroPack !== "Base Game") {
    currentData.activeHeroCategoryFilter = currentData.campaign.heroPack;
    const heroFilterEl = document.getElementById("hero-category-filter");
    if (heroFilterEl) heroFilterEl.value = currentData.campaign.heroPack;
  }

  applySpellAllocationToHeroes();
  renderHeroesList();
  if (currentData.activeHeroId) {
    selectHero(currentData.activeHeroId);
  }

  if (Array.isArray(currentData.campaign.quests) && currentData.campaign.quests.length > 0) {
    currentData.currentQuestIndex = 0;
    currentData.currentQuest = currentData.campaign.quests[0];
    await selectQuest(0, true);
  } else {
    applyEmptyQuestEditorUI();
    renderCampaignQuestsList();
    updateCampaignProgress();
    renderQuestHeroesReviewGrid();
  }
  renderCampaignSelectorUI();
  saveCampaignToKGraph(currentData.campaign, false);
  setStatus(`Switched active campaign to '${currentData.campaign.title}' (${currentData.campaign.quests.length} quests, ${currentData.heroes.length} heroes).`);
  return currentData.campaign;
}

function addCampaign(customProps = {}) {
  const nextNum = currentData.campaigns.length + 1;
  const campId = customProps.id || `campaign-${nextNum}-${Date.now().toString(36)}`;
  const campTitle = customProps.title || `Campaign ${nextNum}: New Adventure`;
  const starterHeroes = Array.isArray(customProps.heroes) && customProps.heroes.length > 0
    ? createDefaultCampaignHeroes(customProps.heroes)
    : createDefaultCampaignHeroes();

  const starterQuests = Array.isArray(customProps.quests)
    ? customProps.quests
    : [];

  const newCampaign = {
    id: campId,
    title: campTitle,
    description: customProps.description || "Custom tabletop campaign with its own quest progression and party of Heroes.",
    heroes: starterHeroes,
    quests: starterQuests
  };

  currentData.campaigns.push(newCampaign);
  selectCampaign(currentData.campaigns.length - 1);
  saveCampaignToKGraph(newCampaign, false);
  setStatus(`Created & saved new campaign: '${newCampaign.title}' (0 quests)`);
  return newCampaign;
}

function deleteCampaign(index = currentData.currentCampaignIndex) {
  if (currentData.campaigns.length <= 1) {
    setStatus("Cannot delete: At least 1 campaign must remain.");
    return false;
  }
  if (index < 0 || index >= currentData.campaigns.length) return false;

  const deleted = currentData.campaigns.splice(index, 1)[0];
  if (deleted && window.robosTabletop?.deleteKGraphEntity) {
    window.robosTabletop.deleteKGraphEntity({
      entityId: `urn:robos:tabletop:campaign:${deleted.id}`
    }).catch(() => {});
  }
  const nextIdx = Math.max(0, Math.min(index, currentData.campaigns.length - 1));
  selectCampaign(nextIdx);
  saveCampaignToKGraph(currentData.campaign, false);
  setStatus(`Deleted campaign: '${deleted.title}'`);
  return true;
}

function updateQuestStatusUI(q) {
  const statusBadge = document.getElementById("quest-status-badge");
  const victoryBanner = document.getElementById("quest-victory-banner");
  const completeBtn = document.getElementById("btn-complete-quest");
  const vicTitle = document.getElementById("victory-quest-title");
  const vicDesc = document.getElementById("victory-quest-desc");

  if (q.completed) {
    if (statusBadge) {
      statusBadge.className = "badge badge-success";
      statusBadge.textContent = "🏆 Completed";
    }
    if (victoryBanner) {
      victoryBanner.style.display = "flex";
      if (vicTitle) vicTitle.textContent = `🏆 ${q.title} Completed!`;
      if (vicDesc) vicDesc.textContent = `All heroes in the adventuring party have received their ${q.goldReward || 100}g quest bounty.`;
    }
    if (completeBtn) {
      completeBtn.innerHTML = "✓ Completed";
      completeBtn.className = "btn btn-sm btn-secondary";
      completeBtn.title = "Quest is already completed. Click Reset to replay.";
    }
  } else {
    if (statusBadge) {
      statusBadge.className = "badge badge-gray";
      statusBadge.textContent = "⏳ In Progress";
    }
    if (victoryBanner) {
      victoryBanner.style.display = "none";
    }
    if (completeBtn) {
      completeBtn.innerHTML = "🏆 Complete Quest";
      completeBtn.className = "btn btn-sm btn-success";
      completeBtn.title = "Complete quest and award gold bounty to party";
    }
  }
}

async function selectQuest(index, preserveBoard = false) {
  if (index < 0 || index >= currentData.campaign.quests.length) return;
  currentData.currentQuestIndex = index;
  const q = currentData.campaign.quests[index];
  currentData.currentQuest = q;

  const emptyCard = document.getElementById("campaign-no-quest-empty-state");
  if (emptyCard) emptyCard.style.display = "none";
  const mainCard = document.getElementById("quest-editor-main-card");
  if (mainCard) mainCard.style.display = "block";
  const heroesReviewCard = document.getElementById("quest-heroes-review-card");
  if (heroesReviewCard) heroesReviewCard.style.display = "block";
  const saveStateCard = document.getElementById("quest-save-state-card");
  if (saveStateCard) saveStateCard.style.display = "block";

  // Populate form fields
  const slugEl = document.getElementById("quest-slug");
  const titleEl = document.getElementById("quest-title");
  const editorTitleEl = document.getElementById("quest-editor-title");
  const cartBadgeEl = document.getElementById("quest-cartridge-badge");
  const rulesetEl = document.getElementById("quest-ruleset");
  const spawnXEl = document.getElementById("quest-spawn-x");
  const spawnYEl = document.getElementById("quest-spawn-y");
  const goldEl = document.getElementById("quest-gold");
  const briefingEl = document.getElementById("quest-briefing");
  const bossEl = document.getElementById("quest-boss-target");
  const bgSelectEl = document.getElementById("quest-bg-ref");

  if (slugEl) slugEl.value = q.slug || "custom-quest";
  if (titleEl) titleEl.value = q.title || "Quest 1: Custom Dungeon";
  if (editorTitleEl) editorTitleEl.textContent = q.title || `Quest ${index + 1}`;
  if (cartBadgeEl) cartBadgeEl.textContent = `📦 ${(q.slug || "custom-quest")}.cartridge.json`;
  if (rulesetEl) rulesetEl.value = q.ruleset || "heroquest";
  if (spawnXEl) spawnXEl.value = q.startingStairs?.[0] ?? 7;
  if (spawnYEl) spawnYEl.value = q.startingStairs?.[1] ?? 14;
  if (goldEl) goldEl.value = q.goldReward !== undefined ? q.goldReward : 150;
  if (briefingEl) briefingEl.value = q.briefing || "";
  if (bossEl) bossEl.value = q.bossTarget || "";

  // Update Status Badge & Victory Banner
  updateQuestStatusUI(q);

  // Update Delete Button state (enabled whenever at least 1 quest exists)
  const hasQuests = currentData.campaign.quests.length > 0;
  [
    document.getElementById("btn-delete-quest"),
    document.getElementById("btn-sidebar-delete-quest"),
    document.getElementById("btn-header-delete-quest")
  ].forEach(delBtn => {
    if (delBtn) {
      delBtn.disabled = !hasQuests;
      delBtn.style.opacity = hasQuests ? "1" : "0.4";
      delBtn.style.cursor = hasQuests ? "pointer" : "not-allowed";
    }
  });

  // Switch map configuration if different
  if (q.mapConfigId && (!currentData.activeMapConfig || currentData.activeMapConfig.id !== q.mapConfigId)) {
    await switchMapConfiguration(q.mapConfigId, true);
  } else if (bgSelectEl && q.mapConfigId) {
    bgSelectEl.value = q.mapConfigId;
  }

  renderCampaignQuestsList();

  updateCampaignProgress();
  renderQuestHeroesReviewGrid();

  // Load cartridge info & active save state in parallel
  await Promise.all([
    loadActiveQuestCartridgeInfo(q.slug || "custom-quest"),
    refreshQuestSaveStateUI(q.slug || "custom-quest")
  ]);

  updateSummaryStats();
  drawBoard();
}

// 1) Load Quest Info from <slug>.cartridge.json and update Quest Info badges
async function loadActiveQuestCartridgeInfo(cartridgeSlug = null) {
  const q = getActiveQuest();
  const slug = cartridgeSlug || q?.slug || "custom-quest";
  const fileStat = document.getElementById("cartridge-stat-file");
  const rulesetStat = document.getElementById("cartridge-stat-ruleset");
  const stairStat = document.getElementById("cartridge-stat-stairs");
  const fogStat = document.getElementById("cartridge-stat-fog");
  const calibEl = document.getElementById("quest-bg-calib");

  try {
    if (window.robosTabletop?.loadCartridge) {
      const res = await window.robosTabletop.loadCartridge(slug);
      if (res && res.success && res.cartridge) {
        currentData.loadedCartridgeData = res.cartridge;
        const cart = res.cartridge;
        const mapKey = cart.startingMap || slug;
        const mapObj = (cart.maps && (cart.maps[mapKey] || Object.values(cart.maps)[0])) || {};

        const monstersArr = Array.isArray(cart.monsters) ? cart.monsters : (Array.isArray(mapObj.monsters) ? mapObj.monsters : []);
        const doorsArr = Array.isArray(mapObj.doors) ? mapObj.doors : [];
        const furnArr = Array.isArray(mapObj.furniture) ? mapObj.furniture : [];
        const trapsArr = Array.isArray(mapObj.traps) ? mapObj.traps : [];
        const triggersArr = Array.isArray(mapObj.storyTriggers) ? mapObj.storyTriggers : [];
        const startPos = Array.isArray(mapObj.startingStair) ? mapObj.startingStair : (Array.isArray(cart.startingPosition) ? cart.startingPosition : [7, 14]);

        if (q) {
          q.startingStairs = [...startPos];
          if (mapObj.mapConfigurationId && !q._preserveMapConfig) {
            q.mapConfigId = mapObj.mapConfigurationId;
            const bgSelectEl = document.getElementById("quest-bg-ref");
            if (bgSelectEl) {
              bgSelectEl.value = mapObj.mapConfigurationId;
            }
            const matchedCfg = currentData.mapConfigs?.find(c => c.id === mapObj.mapConfigurationId);
            if (matchedCfg) {
              currentData.activeMapConfig = matchedCfg;
              const dimsEl = document.getElementById("quest-bg-dims");
              if (dimsEl && matchedCfg.gridDimensions) {
                dimsEl.textContent = `${matchedCfg.gridDimensions[0]} × ${matchedCfg.gridDimensions[1]} squares`;
              }
            }
          }
          if (monstersArr.length > 0) q.monsters = monstersArr;
          if (doorsArr.length > 0) q.doors = doorsArr;
          if (furnArr.length > 0) q.furniture = furnArr;
          if (trapsArr.length > 0) q.traps = trapsArr;
          if (triggersArr.length > 0) q.storyTriggers = triggersArr;
        }

        if (fileStat) fileStat.textContent = `📦 ${slug}.cartridge.json`;
        if (calibEl) calibEl.textContent = `${slug}.cartridge.json`;
        if (rulesetStat) rulesetStat.textContent = `🎲 ${String(cart.ruleset || "HeroQuest")} Ruleset`;
        if (stairStat) stairStat.textContent = `🏁 Start: [${startPos[0]}, ${startPos[1]}]`;
        if (fogStat) fogStat.textContent = `🌫️ Fog of War: Unseen Content Hidden`;

        return {
          success: true,
          slug,
          startingPosition: startPos
        };
      }
    }
  } catch (err) {
    console.warn("[robos-tabletop] Failed to load cartridge info:", err);
  }

  const fallbackStart = q?.startingStairs || [7, 14];
  if (fileStat) fileStat.textContent = `📦 ${slug}.cartridge.json`;
  if (calibEl) calibEl.textContent = `${slug}.cartridge.json`;
  if (rulesetStat) rulesetStat.textContent = `🎲 ${q?.ruleset === "dnd5e" ? "D&D 5e" : "HeroQuest"} Ruleset`;
  if (stairStat) stairStat.textContent = `🏁 Start: [${fallbackStart[0]}, ${fallbackStart[1]}]`;
  if (fogStat) fogStat.textContent = `🌫️ Fog of War: Unseen Content Hidden`;

  return {
    success: true,
    slug,
    startingPosition: fallbackStart
  };
}

// 1b) Review Current Heroes for the Quest right inside the Quest view
function renderQuestHeroesReviewGrid() {
  const gridEl = document.getElementById("quest-heroes-review-grid");
  const slugLabel = document.getElementById("quest-heroes-slug-label");
  const q = getActiveQuest();
  if (slugLabel && q) slugLabel.textContent = `${q.slug || "custom-quest"}.cartridge`;
  if (!gridEl) return;

  gridEl.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const heroes = Array.isArray(currentData.heroes) ? currentData.heroes : [];
  heroes.forEach(h => {
    const heroName = getHeroName(h);
    const heroCls = getHeroClass(h);
    const heroCat = h["robos:category"] || h.category || "Base Game";
    const bp = h["robos:bodyPoints"] || 8;
    const mp = h["robos:mindPoints"] || 2;
    const atk = h["robos:attackDice"] || 3;
    const def = h["robos:defendDice"] || 2;
    const gold = h["robos:gold"] !== undefined ? h["robos:gold"] : 100;
    const wep = getHeroWeapon(h);
    const arm = getHeroArmor(h);
    const spells = getHeroSpells(h);
    const tokUrl = getHeroTokenUrl(h);
    const portUrl = getHeroPortraitUrl(h);

    const card = document.createElement("div");
    card.className = "quest-hero-review-item";
    card.dataset.heroId = h["@id"];
    card.style = "position:relative; overflow:hidden; background:#0f172a; border:1.5px solid #334155; border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:6px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.45);";
    card.innerHTML = `
      <img src="${portUrl}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.30; pointer-events:none;">
      <div style="position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <div style="display:flex; align-items:center; gap:8px; min-width:0;">
          <img src="${tokUrl}" alt="" style="width:36px; height:36px; object-fit:contain; flex-shrink:0; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.8));">
          <div style="min-width:0;">
            <strong style="color:#f8fafc; font-size:0.9rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(heroName)}</strong>
            <span style="font-size:0.65rem; color:#fbbf24; font-weight:700;">${escapeHtml(heroCat)}</span>
          </div>
        </div>
        <span class="badge badge-cyan" style="font-size:0.68rem;">${escapeHtml(heroCls)}</span>
      </div>
      <div style="position:relative; z-index:1; font-size:0.75rem; color:#e2e8f0; display:flex; gap:8px; flex-wrap:wrap; background:rgba(15,23,42,0.72); padding:4px 6px; border-radius:4px;">
        <span>❤️ <strong>${bp}</strong> BP</span>
        <span>🧠 <strong>${mp}</strong> MP</span>
        <span>⚔️ <strong>${atk}</strong> Atk</span>
        <span>🛡️ <strong>${def}</strong> Def</span>
        <span style="color:#fde047;">🪙 <strong>${gold}</strong>g</span>
      </div>
      <div style="position:relative; z-index:1; font-size:0.72rem; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${escapeHtml(wep)} • ${escapeHtml(arm)}
      </div>
      <div style="position:relative; z-index:1;">
        ${spells.length > 0 ? `<div style="font-size:0.7rem; color:#38bdf8; font-weight:600;">${spells.length} Spells Memorized</div>` : `<div style="font-size:0.7rem; color:#94a3b8;">Martial Champion</div>`}
      </div>
    `;
    card.addEventListener("click", () => {
      switchCampaignSubtab("subtab-campaign-heroes");
      selectHero(h["@id"]);
    });
    fragment.appendChild(card);
  });
  gridEl.appendChild(fragment);
}

// 1c) Launch Tabletop Quest Map Editor (packages/tabletop-quest-editor) on custom-quest.cartridge
async function launchQuestEditorForActiveQuest(cartridgeSlug = null) {
  const q = getActiveQuest();
  const slug = cartridgeSlug || document.getElementById("quest-slug")?.value || q?.slug || "custom-quest";
  const mapConfigId = document.getElementById("quest-bg-ref")?.value || q?.mapConfigId || currentData.activeMapConfig?.id || "heroquest-classic";
  setStatus(`Launching Tabletop Quest Map Editor for '${slug}.cartridge.json'...`);

  if (window.robosTabletop?.launchQuestEditor) {
    const res = await window.robosTabletop.launchQuestEditor({ cartridgeSlug: slug, mapConfigId });
    if (res && res.success) {
      setStatus(`Launched Tabletop Quest Map Editor for '${slug}.cartridge.json' (PID: ${res.pid}).`);
      return res;
    } else {
      setStatus(`Failed to launch Quest Editor: ${res ? res.error : "Unknown error"}`);
      return res || { success: false, error: "Failed to launch Quest Editor" };
    }
  }
  const fallbackRes = { success: true, cartridgeSlug: slug, mapConfigId, simulated: true };
  setStatus(`Quest Editor ready for '${slug}.cartridge.json'.`);
  return fallbackRes;
}

// 2) Inspect Current Quest State & Save State From Now (Driven by robos:TabletopQuestSaveState KGraph Schema — Spoiler-Free)
const DEFAULT_SAVE_STATE_SCHEMA = {
  targetClass: "robos:TabletopQuestSaveState",
  shapeId: "urn:robos:shape:TabletopQuestSaveStateShape",
  telemetryMetrics: [
    { property: "robos:currentRound", label: "Current Round", icon: "⏳", category: "turn", format: "round" },
    { property: "robos:activeTurnActor", label: "Whose Turn", icon: "🎯", category: "turn", format: "actor" },
    { property: "robos:turnState", label: "Turn Action State", icon: "🎲", category: "turn", format: "turn_state" },
    { property: "robos:playTimeSeconds", label: "Time Played", icon: "⏱️", category: "session", format: "duration" },
    { property: "robos:visibleMonstersCount", label: "Monsters Visible", icon: "👁️", category: "combat", format: "visible_monsters" },
    { property: "robos:itemsFoundCount", label: "Items Found So Far", icon: "🎒", category: "loot", format: "items_found" },
    { property: "robos:totalPartyGold", label: "Party Gold", icon: "🪙", category: "loot", format: "gold" },
    { property: "robos:exploredTilesCount", label: "Dungeon Explored", icon: "🗺️", category: "exploration", format: "exploration" },
    { property: "robos:doorsOpenCount", label: "Doors Opened", icon: "🚪", category: "exploration", format: "doors" },
    { property: "robos:triggersFiredCount", label: "Story EventsFired", icon: "📜", category: "narrative", format: "triggers" }
  ]
};

function formatPlayDurationSeconds(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${remSec}s`;
  if (mins > 0) return `${mins}m ${remSec}s`;
  return `${remSec}s`;
}

function normalizeSaveStateToKGraphInRenderer(rawSave, slugFallback = "custom-quest") {
  if (!rawSave || typeof rawSave !== "object") return null;
  const slug = String(
    rawSave["robos:questSlug"] ||
    rawSave.cartridge_slug ||
    rawSave.cartridge_id ||
    rawSave.map_id ||
    slugFallback ||
    "custom-quest"
  ).replace(/\.cartridge(\.json)?$/, "");

  const rawHeroes = Array.isArray(rawSave["robos:heroStates"]) && rawSave["robos:heroStates"].length > 0
    ? rawSave["robos:heroStates"]
    : (Array.isArray(rawSave.heroes) ? rawSave.heroes : []);
  if (rawHeroes.length === 0) return null;

  const roundNum = Number(rawSave["robos:currentRound"] ?? rawSave.current_round ?? rawSave.round_num ?? 1) || 1;
  const rawPhase = String(rawSave["robos:currentPhase"] ?? rawSave.current_phase ?? rawSave.phase ?? "hero_phase");
  const currentRole = String(rawSave["robos:currentRole"] ?? rawSave.current_role ?? "player");
  const activeHeroIdx = Number(rawSave["robos:activeHeroIndex"] ?? rawSave.active_hero_idx ?? 0) || 0;
  const turnStateRaw = String(rawSave["robos:turnState"] ?? rawSave.turn_state ?? "awaiting_roll");
  const moveRemaining = Number(rawSave["robos:movementRemaining"] ?? rawSave.movement_remaining ?? 0) || 0;
  const moveRolled = Boolean(rawSave["robos:movementRolled"] ?? rawSave.movement_rolled ?? false);
  const hasMoved = Boolean(rawSave["robos:hasMovedThisTurn"] ?? rawSave.has_moved_this_turn ?? false);
  const hasActed = Boolean(rawSave["robos:hasActedThisTurn"] ?? rawSave.has_acted_this_turn ?? false);

  const heroStates = rawHeroes.map((h, idx) => {
    const heroId = String(h.id || h.slug || `hero-${idx + 1}`).toLowerCase();
    const heroClass = String(h.heroClass || h.hero_class || h.class || h.name || "Hero");
    const charName = String(h.characterName || h.character_name || "").trim();
    const displayName = charName ? `${charName} (${heroClass})` : String(h.name || heroClass);
    const maxBp = Number(h.maxBP ?? h.max_bp ?? h.max_hp ?? h.bodyPoints ?? h.bp ?? 8) || 8;
    const curBp = Number(h.currentBP ?? h.current_bp ?? h.bp ?? h.hp ?? maxBp);
    const maxMp = Number(h.maxMP ?? h.max_mp ?? h.mindPoints ?? h.mp ?? 2) || 2;
    const curMp = Number(h.currentMP ?? h.current_mp ?? h.mp ?? maxMp);
    const atk = Number(h.attackDice ?? h.atk ?? 3) || 3;
    const def = Number(h.defendDice ?? h.def ?? 2) || 2;
    const gold = Number(h.gold ?? 0) || 0;
    const pos = Array.isArray(h.gridPos) && h.gridPos.length >= 2
      ? [Number(h.gridPos[0]), Number(h.gridPos[1])]
      : (Array.isArray(h.grid_pos) && h.grid_pos.length >= 2
        ? [Number(h.grid_pos[0]), Number(h.grid_pos[1])]
        : (Array.isArray(h.pos) && h.pos.length >= 2
          ? [Number(h.pos[0]), Number(h.pos[1])]
          : (Array.isArray(h.position) && h.position.length >= 2 ? [Number(h.position[0]), Number(h.position[1])] : [7, 14])));
    const weapon = String(h.equipped_weapon || h.weapon || "broadsword");
    const armor = Array.isArray(h.equipped_armor)
      ? (h.equipped_armor.length > 0 ? h.equipped_armor.join(", ") : "none")
      : String(h.armor || "none");
    const inventory = Array.isArray(h.inventory) ? h.inventory : [];
    const spells = Array.isArray(h.spells) ? h.spells : [];
    const usedSpells = Array.isArray(h.usedSpells)
      ? h.usedSpells
      : (Array.isArray(h.used_spells) ? h.used_spells : (Array.isArray(h.cast_spells) ? h.cast_spells : []));
    const upperPhase = rawPhase.toUpperCase();
    const isActiveTurn = (rawPhase === "hero_phase" || upperPhase === "PLAYER_TURN" || upperPhase === "HERO_TURN") && idx === activeHeroIdx;

    return {
      "@type": "robos:TabletopSaveHeroState",
      id: heroId,
      name: displayName,
      heroClass,
      currentBP: curBp,
      maxBP: maxBp,
      currentMP: curMp,
      maxMP: maxMp,
      hp: curBp,
      max_hp: maxBp,
      bp: curBp,
      max_bp: maxBp,
      mp: curMp,
      max_mp: maxMp,
      attackDice: atk,
      defendDice: def,
      gold,
      gridPos: pos,
      grid_pos: pos,
      weapon,
      armor,
      inventory,
      spells,
      usedSpells,
      spellsRemaining: Math.max(0, spells.length - usedSpells.length),
      hasDepartedStart: Boolean(h.hasDepartedStart ?? h.has_departed_start ?? true),
      isOnBoard: Boolean(h.isOnBoard ?? h.is_on_board ?? true),
      alive: curBp > 0 && h.alive !== false,
      escaped: Boolean(h.escaped ?? false),
      isActiveTurn
    };
  });

  let activeTurnActor = String(rawSave["robos:activeTurnActor"] || rawSave.active_turn_actor || "");
  if (!activeTurnActor) {
    const upperPhase = rawPhase.toUpperCase();
    if (rawPhase === "hero_phase" || upperPhase === "PLAYER_TURN" || upperPhase === "HERO_TURN") {
      const actHero = heroStates[activeHeroIdx] || heroStates[0];
      activeTurnActor = actHero
        ? `${actHero.name} (Hero ${activeHeroIdx + 1} of ${heroStates.length})`
        : "Hero Party";
    } else {
      activeTurnActor = "Zargon / Dread Master (Enemy Turn)";
    }
  }

  // Build Explored Set first so unseen entities are strictly excluded (Zero Spoilers)
  const rawExplored = Array.isArray(rawSave["robos:exploredTiles"])
    ? rawSave["robos:exploredTiles"]
    : (Array.isArray(rawSave.explored_tiles) ? rawSave.explored_tiles : []);
  const exploredTiles = rawExplored.map(pt => {
    if (Array.isArray(pt) && pt.length >= 2) return [Number(pt[0]), Number(pt[1])];
    if (typeof pt === "string" && pt.includes(",")) {
      const parts = pt.split(",");
      return [Number(parts[0]), Number(parts[1])];
    }
    return null;
  }).filter(Boolean);
  const exploredSet = new Set(exploredTiles.map(pt => `${pt[0]},${pt[1]}`));
  heroStates.forEach(h => {
    if (Array.isArray(h.gridPos) && h.gridPos.length >= 2) {
      exploredSet.add(`${h.gridPos[0]},${h.gridPos[1]}`);
    }
  });
  const exploredTilesCount = Number(rawSave["robos:exploredTilesCount"] ?? exploredSet.size) || 0;

  const revealedRooms = Array.isArray(rawSave["robos:revealedRooms"])
    ? rawSave["robos:revealedRooms"]
    : (Array.isArray(rawSave.revealed_rooms)
      ? rawSave.revealed_rooms
      : (rawSave.revealed_rooms && typeof rawSave.revealed_rooms === "object" ? Object.keys(rawSave.revealed_rooms) : []));
  const revealedSet = new Set(revealedRooms.map(String));

  // Normalize Monsters: ONLY include visible/discovered monsters and defeated count (never unseen monsters!)
  const rawMonsters = Array.isArray(rawSave.monsters) ? rawSave.monsters : [];
  const discoveredRaw = rawSave.discovered_monster_ids;
  const discoveredSet = new Set(
    Array.isArray(discoveredRaw)
      ? discoveredRaw.map(String)
      : (discoveredRaw && typeof discoveredRaw === "object" ? Object.keys(discoveredRaw).filter(k => discoveredRaw[k]) : [])
  );

  let monstersDefeated = Number(rawSave["robos:monstersDefeated"] ?? 0);
  const visibleMonsters = [];

  if (rawMonsters.length > 0) {
    monstersDefeated = 0;
    rawMonsters.forEach(m => {
      const mId = String(m.id || m.slug || "monster");
      const maxBp = Number(m.maxBP ?? m.max_bp ?? m.bodyPoints ?? m.bp ?? 1) || 1;
      const curBp = Number(m.currentBP ?? m.current_bp ?? m.bp ?? maxBp);
      const isAlive = m.isAlive !== undefined ? Boolean(m.isAlive) : (m.is_alive !== false && m.dead !== true && curBp > 0);
      const isHidden = Boolean(m.hidden);
      const roomId = String(m.roomId || m.room_id || "");
      const pos = Array.isArray(m.gridPos) && m.gridPos.length >= 2
        ? [Number(m.gridPos[0]), Number(m.gridPos[1])]
        : (Array.isArray(m.grid_pos) && m.grid_pos.length >= 2
          ? [Number(m.grid_pos[0]), Number(m.grid_pos[1])]
          : (Array.isArray(m.pos) && m.pos.length >= 2
            ? [Number(m.pos[0]), Number(m.pos[1])]
            : (Array.isArray(m.position) && m.position.length >= 2 ? [Number(m.position[0]), Number(m.position[1])] : [0, 0])));
      const isVisible = m.isVisible !== undefined
        ? Boolean(m.isVisible)
        : (isAlive && (discoveredSet.has(mId) || exploredSet.has(`${pos[0]},${pos[1]}`) || (roomId !== "" && revealedSet.has(roomId) && !isHidden)));

      if (!isAlive) {
        monstersDefeated += 1;
        return;
      }
      if (!isVisible) {
        return;
      }

      visibleMonsters.push({
        "@type": "robos:TabletopSaveMonsterState",
        id: mId,
        name: String(m.name || m.monsterType || m.type || "Monster"),
        monsterType: String(m.monsterType || m.type || "goblin"),
        currentBP: curBp,
        maxBP: maxBp,
        mindPoints: Number(m.mindPoints ?? m.mp ?? 1),
        attackDice: Number(m.attackDice ?? m.atk ?? 2),
        defendDice: Number(m.defendDice ?? m.def ?? 2),
        movementSquares: Number(m.movementSquares ?? m.move ?? 6),
        gridPos: pos,
        roomId,
        isBoss: Boolean(m.isBoss ?? m.is_boss),
        isUndead: Boolean(m.isUndead ?? m.is_undead),
        isSpellcaster: Boolean(m.isSpellcaster ?? m.is_spellcaster),
        spells: Array.isArray(m.spells) ? m.spells : [],
        isAlive: true,
        isVisible: true
      });
    });
  } else if (Array.isArray(rawSave["robos:visibleMonsters"])) {
    visibleMonsters.push(...rawSave["robos:visibleMonsters"]);
  }

  let itemsFound = Array.isArray(rawSave["robos:itemsFound"]) && rawSave["robos:itemsFound"].length > 0
    ? [...rawSave["robos:itemsFound"]]
    : [];
  if (itemsFound.length === 0) {
    const seenKeys = new Set();
    const pushItem = (it) => {
      const k = `${it.holder}:${it.name}:${itemsFound.length}`;
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        itemsFound.push(it);
      }
    };
    if (Array.isArray(rawSave.items_found)) {
      rawSave.items_found.forEach(it => {
        pushItem({
          id: String(it.id || it.name || "item"),
          name: String(it.name || it.title || "Treasure"),
          type: String(it.type || "treasure"),
          holder: String(it.holder || "Party"),
          source: String(it.source || "Dungeon Search"),
          icon: String(it.icon || "💎")
        });
      });
    }
    heroStates.forEach(h => {
      (h.inventory || []).forEach((invItem, iIdx) => {
        const itemName = typeof invItem === "string"
          ? invItem.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
          : String(invItem?.name || invItem?.id || "Item");
        const isPotion = itemName.toLowerCase().includes("potion") || itemName.toLowerCase().includes("water");
        pushItem({
          id: typeof invItem === "object" ? String(invItem.id || `inv-${h.id}-${iIdx}`) : `${h.id}-${invItem}-${iIdx}`,
          name: itemName,
          type: isPotion ? "potion" : "equipment",
          holder: h.name,
          source: "Hero Inventory",
          icon: isPotion ? "🧪" : "🗡️"
        });
      });
    });
  }

  const searchedRooms = Array.isArray(rawSave["robos:searchedRooms"])
    ? rawSave["robos:searchedRooms"]
    : (Array.isArray(rawSave.searched_treasure_rooms) ? rawSave.searched_treasure_rooms : []);

  const rawDoors = Array.isArray(rawSave["robos:doors"])
    ? rawSave["robos:doors"]
    : (Array.isArray(rawSave.doors) ? rawSave.doors : []);
  const seenDoors = rawDoors.filter(d => {
    if (!d) return false;
    if (d.is_secret && !d.is_revealed) return false;
    const isOpen = d.is_open === true || d.open === true || d.state === "open";
    if (isOpen) return true;
    const from = Array.isArray(d.from) ? `${d.from[0]},${d.from[1]}` : "";
    const to = Array.isArray(d.to) ? `${d.to[0]},${d.to[1]}` : "";
    return exploredSet.has(from) || exploredSet.has(to);
  });
  const doorsOpenCount = Number(rawSave["robos:doorsOpenCount"] ?? rawDoors.filter(d => d && (d.is_open || d.open || d.state === "open")).length) || 0;

  const rawFurniture = Array.isArray(rawSave["robos:furniture"] || rawSave.furniture) ? (rawSave["robos:furniture"] || rawSave.furniture) : [];
  const seenFurniture = rawFurniture.filter(f => {
    if (!f || f.hidden) return false;
    if (f.type && String(f.type).includes("stairs")) return true;
    const rId = String(f.roomId || f.room_id || "");
    if (rId && revealedSet.has(rId)) return true;
    const fx = Number(f.x ?? 0);
    const fy = Number(f.y ?? 0);
    const fw = Number(f.width || 1);
    const fh = Number(f.height || 1);
    for (let dx = 0; dx < fw; dx++) {
      for (let dy = 0; dy < fh; dy++) {
        if (exploredSet.has(`${fx + dx},${fy + dy}`)) return true;
      }
    }
    return false;
  });

  const rawTriggers = Array.isArray(rawSave["robos:triggersFired"])
    ? rawSave["robos:triggersFired"]
    : (Array.isArray(rawSave.story_triggers) ? rawSave.story_triggers.filter(t => t && t.triggered) : []);
  const triggersFiredCount = Number(rawSave["robos:triggersFiredCount"] ?? rawTriggers.length) || 0;

  let playTimeSeconds = Number(rawSave["robos:playTimeSeconds"] ?? rawSave.play_time_seconds ?? 0) || 0;
  if (playTimeSeconds <= 0) {
    playTimeSeconds = Math.max(45, (roundNum - 1) * 180 + exploredTilesCount * 8 + doorsOpenCount * 25 + triggersFiredCount * 40 + activeHeroIdx * 35);
  }
  const playTimeFormatted = formatPlayDurationSeconds(playTimeSeconds);

  const savedAtUnix = Number(rawSave["robos:savedAtUnix"] ?? rawSave.saved_at ?? rawSave.timestamp ?? Math.floor(Date.now() / 1000));
  const savedAtIso = String(rawSave["robos:savedAt"] || rawSave.saved_at_iso || new Date(savedAtUnix * 1000).toISOString());
  const totalPartyGold = heroStates.reduce((acc, h) => acc + (Number(h.gold) || 0), 0);
  const label = String(rawSave["dcterms:title"] || rawSave.snapshot_label || rawSave.label || `Quest State — Round ${roundNum}`);

  return {
    "@id": `urn:robos:tabletop:savestate:${slug}`,
    "@type": ["oslc_am:Resource", "robos:TabletopQuestSaveState", "schema:Action"],
    "dcterms:title": label,
    "robos:questSlug": slug,
    "robos:gridDimensions": rawSave["robos:gridDimensions"] || [26, 19],
    "robos:savedAt": savedAtIso,
    "robos:savedAtUnix": savedAtUnix,
    "robos:playTimeSeconds": playTimeSeconds,
    "robos:playTimeFormatted": playTimeFormatted,
    "robos:currentRound": roundNum,
    "robos:currentPhase": rawPhase,
    "robos:currentRole": currentRole,
    "robos:activeHeroIndex": activeHeroIdx,
    "robos:activeTurnActor": activeTurnActor,
    "robos:turnState": turnStateRaw,
    "robos:movementRemaining": moveRemaining,
    "robos:movementRolled": moveRolled,
    "robos:hasMovedThisTurn": hasMoved,
    "robos:hasActedThisTurn": hasActed,
    "robos:movementTrail": Array.isArray(rawSave["robos:movementTrail"] || rawSave.movement_trail) ? (rawSave["robos:movementTrail"] || rawSave.movement_trail) : [],
    "robos:heroStates": heroStates,
    "robos:visibleMonsters": visibleMonsters,
    "robos:visibleMonstersCount": visibleMonsters.length,
    "robos:monstersDefeated": monstersDefeated,
    "robos:itemsFound": itemsFound,
    "robos:itemsFoundCount": itemsFound.length,
    "robos:totalPartyGold": totalPartyGold,
    "robos:exploredTilesCount": exploredTilesCount,
    "robos:exploredTiles": exploredTiles,
    "robos:revealedRooms": revealedRooms,
    "robos:searchedRooms": searchedRooms,
    "robos:doorsOpenCount": doorsOpenCount,
    "robos:doors": seenDoors,
    "robos:furniture": seenFurniture,
    "robos:trapsDetectedCount": Number(rawSave["robos:trapsDetectedCount"] ?? 0),
    "robos:triggersFired": rawTriggers,
    "robos:triggersFiredCount": triggersFiredCount,
    "robos:screenshotPath": String(rawSave["robos:screenshotPath"] || rawSave.screenshot_path || ""),
    "robos:screenshotDataUrl": String(rawSave["robos:screenshotDataUrl"] || rawSave.screenshotDataUrl || ""),
    "robos:saveFilePath": String(rawSave["robos:saveFilePath"] || ""),
    label,
    saved_at: savedAtUnix,
    saved_at_iso: savedAtIso,
    cartridge_id: slug,
    cartridge_slug: slug,
    map_id: String(rawSave["robos:mapId"] || rawSave.map_id || slug),
    round_num: roundNum,
    current_round: roundNum,
    phase: rawPhase,
    current_phase: rawPhase,
    active_hero_idx: activeHeroIdx,
    active_turn_actor: activeTurnActor,
    turn_state: turnStateRaw,
    play_time_seconds: playTimeSeconds,
    play_time_formatted: playTimeFormatted,
    heroes: heroStates,
    visible_monsters: visibleMonsters,
    items_found: itemsFound,
    revealed_rooms: revealedRooms,
    searched_treasure_rooms: searchedRooms
  };
}

function renderQuestStateScreenshotToCanvas(st) {
  if (!st || typeof document === "undefined") return "";
  const canvas = document.getElementById("quest-save-state-screenshot-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return "";
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const W = canvas.width || 780;
  const H = canvas.height || 570;
  const dims = Array.isArray(st["robos:gridDimensions"]) ? st["robos:gridDimensions"] : [26, 19];
  const cols = Number(dims[0]) || 26;
  const rows = Number(dims[1]) || 19;
  const hudH = 36;
  const pad = 10;
  const boardW = W - pad * 2;
  const boardH = H - hudH - pad * 2;
  const cellW = boardW / cols;
  const cellH = boardH / rows;
  const ox = pad;
  const oy = hudH + pad;

  // 1. Fog of War Backdrop (Unseen areas are completely shrouded)
  ctx.fillStyle = "#04070e";
  ctx.fillRect(0, 0, W, H);

  // 2. Top Telemetry HUD Bar inside Screenshot (Spoiler-Free)
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, hudH);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hudH);
  ctx.lineTo(W, hudH);
  ctx.stroke();

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 12px monospace";
  const roundNum = st["robos:currentRound"] || 1;
  const turnActor = st["robos:activeTurnActor"] || "Hero Party";
  const playStr = st["robos:playTimeFormatted"] || "1m 0s";
  const visCount = st["robos:visibleMonstersCount"] ?? (st["robos:visibleMonsters"] || []).length;
  ctx.fillText(`📦 ${st["robos:questSlug"] || "custom-quest"} • R${roundNum} • 🎯 ${turnActor}`, 12, 22);
  ctx.fillStyle = "#fde047";
  ctx.textAlign = "right";
  ctx.fillText(`⏱️ ${playStr} • 👁️ ${visCount} Visible • 🌫️ Fog of War`, W - 12, 22);
  ctx.textAlign = "left";

  // 3. Build Explored Set (including hero positions) & Revealed Rooms Set
  const exploredSet = new Set(
    (st["robos:exploredTiles"] || []).map(pt =>
      Array.isArray(pt) ? `${pt[0]},${pt[1]}` : String(pt)
    )
  );
  (st["robos:heroStates"] || []).forEach(h => {
    const pos = h.gridPos || h.grid_pos;
    if (Array.isArray(pos) && pos.length >= 2) {
      exploredSet.add(`${pos[0]},${pos[1]}`);
    }
  });
  const revealedSet = new Set((st["robos:revealedRooms"] || []).map(String));

  // Draw Board Grid Cells: only explored cells are lit; unexplored cells remain dark fog
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * cellW;
      const y = oy + r * cellH;
      const isExplored = exploredSet.has(`${c},${r}`);
      if (isExplored) {
        ctx.fillStyle = "rgba(234, 179, 8, 0.22)";
        ctx.fillRect(x, y, cellW, cellH);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.35)";
        ctx.lineWidth = 0.85;
        ctx.strokeRect(x, y, cellW, cellH);
      } else {
        ctx.fillStyle = "#050811";
        ctx.fillRect(x, y, cellW, cellH);
        ctx.strokeStyle = "rgba(30, 41, 59, 0.28)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellW, cellH);
      }
    }
  }

  // 4. Draw ONLY Discovered/Explored Furniture (Stairs or furniture in explored tiles / revealed rooms)
  (st["robos:furniture"] || []).forEach(f => {
    if (!f || f.hidden) return;
    const fx = Number(f.x ?? 7);
    const fy = Number(f.y ?? 14);
    const fw = Number(f.width || 1);
    const fh = Number(f.height || 1);
    const isStairs = Boolean(f.type && String(f.type).includes("stairs"));
    const rId = String(f.roomId || f.room_id || "");
    let isSeen = isStairs || (rId !== "" && revealedSet.has(rId));
    if (!isSeen) {
      for (let dx = 0; dx < fw; dx++) {
        for (let dy = 0; dy < fh; dy++) {
          if (exploredSet.has(`${fx + dx},${fy + dy}`)) {
            isSeen = true;
            break;
          }
        }
        if (isSeen) break;
      }
    }
    if (!isSeen) return;

    ctx.fillStyle = isStairs ? "rgba(56, 189, 248, 0.32)" : "rgba(180, 83, 9, 0.48)";
    ctx.strokeStyle = isStairs ? "#38bdf8" : "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.fillRect(ox + fx * cellW + 2, oy + fy * cellH + 2, fw * cellW - 4, fh * cellH - 4);
    ctx.strokeRect(ox + fx * cellW + 2, oy + fy * cellH + 2, fw * cellW - 4, fh * cellH - 4);
  });

  // 5. Draw ONLY Discovered/Seen Doors (open doors or doors adjacent to an explored tile)
  (st["robos:doors"] || []).forEach(d => {
    if (!d || (d.is_secret && !d.is_revealed)) return;
    const from = Array.isArray(d.from) ? d.from : null;
    const to = Array.isArray(d.to) ? d.to : null;
    if (!from || !to) return;
    const isOpen = d.is_open === true || d.open === true || d.state === "open";
    const isSeen = isOpen || exploredSet.has(`${from[0]},${from[1]}`) || exploredSet.has(`${to[0]},${to[1]}`);
    if (!isSeen) return;

    const mx = ox + ((Number(from[0]) + Number(to[0]) + 1) / 2) * cellW;
    const my = oy + ((Number(from[1]) + Number(to[1]) + 1) / 2) * cellH;
    ctx.fillStyle = isOpen ? "#22c55e" : "#f97316";
    ctx.beginPath();
    ctx.arc(mx, my, Math.min(cellW, cellH) * 0.24, 0, Math.PI * 2);
    ctx.fill();
  });

  // 6. Draw Movement Trail
  const trail = st["robos:movementTrail"] || [];
  if (trail.length > 1) {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    trail.forEach((pt, idx) => {
      if (!Array.isArray(pt) || pt.length < 2) return;
      const cx = ox + (Number(pt[0]) + 0.5) * cellW;
      const cy = oy + (Number(pt[1]) + 0.5) * cellH;
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 7. Draw ONLY Visible Monsters
  (st["robos:visibleMonsters"] || []).forEach(m => {
    const pos = Array.isArray(m.gridPos) ? m.gridPos : [0, 0];
    const cx = ox + (Number(pos[0]) + 0.5) * cellW;
    const cy = oy + (Number(pos[1]) + 0.5) * cellH;
    const rad = Math.min(cellW, cellH) * 0.42;

    ctx.fillStyle = m.isBoss ? "#7e22ce" : "#dc2626";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fecaca";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const mLetter = String(m.name || "M").charAt(0).toUpperCase();
    ctx.fillText(mLetter, cx, cy);
  });

  // 8. Draw Heroes
  const heroColors = {
    barbarian: "#ef4444",
    dwarf: "#f59e0b",
    elf: "#22c55e",
    wizard: "#3b82f6"
  };
  (st["robos:heroStates"] || []).forEach((h, idx) => {
    const pos = Array.isArray(h.gridPos) ? h.gridPos : [7, 14];
    const sameTileHeroes = (st["robos:heroStates"] || []).filter(oh =>
      Array.isArray(oh.gridPos) && oh.gridPos[0] === pos[0] && oh.gridPos[1] === pos[1]
    );
    let subOx = 0;
    let subOy = 0;
    if (sameTileHeroes.length > 1) {
      const subIdx = sameTileHeroes.indexOf(h);
      subOx = ((subIdx % 2) - 0.5) * (cellW * 0.35);
      subOy = (Math.floor(subIdx / 2) - 0.5) * (cellH * 0.35);
    }
    const cx = ox + (Number(pos[0]) + 0.5) * cellW + subOx;
    const cy = oy + (Number(pos[1]) + 0.5) * cellH + subOy;
    const rad = Math.min(cellW, cellH) * 0.42;
    const clsKey = String(h.heroClass || h.id || "").toLowerCase();
    const fillCol = heroColors[clsKey] || ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"][idx % 4];

    if (h.isActiveTurn) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, rad + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(h.name || "H").charAt(0).toUpperCase(), cx, cy);
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  try {
    return typeof canvas.toDataURL === "function" ? canvas.toDataURL("image/png") : "";
  } catch {
    return "";
  }
}

function formatKGraphTelemetryMetricValue(metric, st) {
  const prop = metric.property;
  const val = st[prop];
  switch (metric.format) {
    case "round": {
      const phase = String(st["robos:currentPhase"] || "hero_phase").replace(/_/g, " ").toUpperCase();
      return `<div style="font-size:14px; font-weight:700; color:#f8fafc;">Round ${val || 1}</div><div style="font-size:10px; color:#38bdf8;">${escapeHtml(phase)}</div>`;
    }
    case "actor":
      return `<div style="font-size:12px; font-weight:700; color:#fde047;">${escapeHtml(String(val || "Hero Party"))}</div><div style="font-size:10px; color:#94a3b8;">Role: ${escapeHtml(String(st["robos:currentRole"] || "player").toUpperCase())}</div>`;
    case "turn_state": {
      const moveLeft = st["robos:movementRemaining"] ?? 0;
      const moved = st["robos:hasMovedThisTurn"] ? "Moved" : "Unmoved";
      const acted = st["robos:hasActedThisTurn"] ? "Acted" : "Action Ready";
      return `<div style="font-size:12px; font-weight:700; color:#e2e8f0; text-transform:capitalize;">${escapeHtml(String(val || "ready").replace(/_/g, " "))} (${moveLeft} sq left)</div><div style="font-size:10px; color:#94a3b8;">${moved} • ${acted}</div>`;
    }
    case "duration":
      return `<div style="font-size:14px; font-weight:700; color:#34d399;">${escapeHtml(st["robos:playTimeFormatted"] || formatPlayDurationSeconds(val))}</div><div style="font-size:10px; color:#94a3b8;">${Number(val || 0)}s session time</div>`;
    case "visible_monsters": {
      const vis = Number(val || 0);
      const slain = Number(st["robos:monstersDefeated"] || 0);
      return `<div style="font-size:13px; font-weight:700; color:${vis > 0 ? "#f87171" : "#a7f3d0"};">${vis} Visible in Sight</div><div style="font-size:10px; color:#94a3b8;">${slain} Defeated So Far</div>`;
    }
    case "items_found": {
      const cnt = Number(val || 0);
      return `<div style="font-size:13px; font-weight:700; color:#c084fc;">${cnt} Items &amp; Relics</div><div style="font-size:10px; color:#94a3b8;">Party Equipment &amp; Loot Found</div>`;
    }
    case "gold":
      return `<div style="font-size:14px; font-weight:700; color:#fde047;">${Number(val || 0)}g</div><div style="font-size:10px; color:#94a3b8;">Combined Party Treasury</div>`;
    case "exploration": {
      return `<div style="font-size:13px; font-weight:700; color:#38bdf8;">${Number(val || 0)} Squares Explored</div><div style="font-size:10px; color:#94a3b8;">🌫️ Unseen Areas Hidden</div>`;
    }
    case "doors": {
      const openCnt = Number(val || 0);
      const searchedCnt = Array.isArray(st["robos:searchedRooms"]) ? st["robos:searchedRooms"].length : 0;
      return `<div style="font-size:13px; font-weight:700; color:#fb923c;">${openCnt} Doors Opened</div><div style="font-size:10px; color:#94a3b8;">${searchedCnt} Area(s) Searched</div>`;
    }
    case "triggers": {
      const fired = Number(val || 0);
      const trapsDet = Number(st["robos:trapsDetectedCount"] || 0);
      return `<div style="font-size:13px; font-weight:700; color:#f472b6;">${fired} Events Seen</div><div style="font-size:10px; color:#94a3b8;">Traps Found: ${trapsDet}</div>`;
    }
    default:
      return `<div style="font-size:13px; font-weight:700; color:#f8fafc;">${escapeHtml(String(val ?? ""))}</div>`;
  }
}

function buildDefaultQuestSaveStatePayload(label = "") {
  const q = getActiveQuest();
  const slug = q?.slug || "custom-quest";
  const startStair = Array.isArray(q?.startingStairs) && q.startingStairs.length === 2 ? q.startingStairs : [7, 14];
  const existing = currentData.questSaveState;

  const heroesState = (currentData.heroes || []).map((h, idx) => {
    const hSlug = (h["@id"] || "").split(":").pop() || `hero-${idx + 1}`;
    const existingHero = (existing?.["robos:heroStates"] || existing?.heroes || []).find(
      eh => eh.id === hSlug || eh.name === getHeroName(h) || eh.heroClass === getHeroClass(h)
    );
    const maxBp = parseInt(h["robos:bodyPoints"], 10) || 8;
    const maxMp = parseInt(h["robos:mindPoints"], 10) || 2;
    const curBp = existingHero?.currentBP ?? existingHero?.hp ?? (h["robos:currentBP"] !== undefined ? h["robos:currentBP"] : maxBp);
    const curMp = existingHero?.currentMP ?? existingHero?.mp ?? (h["robos:currentMP"] !== undefined ? h["robos:currentMP"] : maxMp);
    const pos = existingHero?.gridPos || existingHero?.grid_pos || [startStair[0] + (idx % 2), startStair[1] + Math.floor(idx / 2)];
    return {
      id: hSlug,
      name: getHeroName(h),
      heroClass: getHeroClass(h),
      current_bp: curBp,
      bodyPoints: maxBp,
      hp: curBp,
      max_hp: maxBp,
      current_mp: curMp,
      mindPoints: maxMp,
      mp: curMp,
      max_mp: maxMp,
      attackDice: parseInt(h["robos:attackDice"], 10) || 3,
      defendDice: parseInt(h["robos:defendDice"], 10) || 2,
      gold: parseInt(h["robos:gold"], 10) || 100,
      grid_pos: pos,
      alive: true,
      escaped: false,
      weapon: getHeroWeapon(h),
      armor: getHeroArmor(h),
      inventory: getHeroInventory(h),
      spells: getHeroSpells(h),
      used_spells: existingHero?.usedSpells || existingHero?.cast_spells || []
    };
  });

  const rawPayload = {
    version: 1,
    saved_at: Math.floor(Date.now() / 1000),
    saved_at_iso: new Date().toISOString(),
    label: label || `Saved State (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`,
    cartridge_id: slug,
    cartridge_slug: slug,
    map_id: slug,
    campaign_id: currentData.campaign?.id || "campaign-heroquest",
    campaign_title: currentData.campaign?.title || "HeroQuest",
    current_round: existing?.["robos:currentRound"] || existing?.round_num || 1,
    round_num: existing?.["robos:currentRound"] || existing?.round_num || 1,
    current_phase: existing?.["robos:currentPhase"] || existing?.phase || "hero_phase",
    phase: existing?.["robos:currentPhase"] || existing?.phase || "PLAYER_TURN",
    active_hero_idx: existing?.["robos:activeHeroIndex"] ?? existing?.active_hero_idx ?? 0,
    turn_state: existing?.["robos:turnState"] || existing?.turn_state || "awaiting_roll",
    play_time_seconds: existing?.["robos:playTimeSeconds"] || existing?.play_time_seconds || 60,
    heroes: heroesState,
    visible_monsters: existing?.["robos:visibleMonsters"] || existing?.visible_monsters || [],
    items_found: existing?.["robos:itemsFound"] || existing?.items_found || [],
    doors: existing?.["robos:doors"] || existing?.doors || [],
    explored_tiles: existing?.["robos:exploredTiles"] || [startStair],
    revealed_rooms: existing?.["robos:revealedRooms"] || existing?.revealed_rooms || [],
    searched_treasure_rooms: existing?.["robos:searchedRooms"] || existing?.searched_treasure_rooms || []
  };

  return normalizeSaveStateToKGraphInRenderer(rawPayload, slug) || rawPayload;
}

async function refreshQuestSaveStateUI(cartridgeSlug = null) {
  const q = getActiveQuest();
  const slug = cartridgeSlug || q?.slug || "custom-quest";

  try {
    if (window.robosTabletop?.getQuestSaveState) {
      const res = await window.robosTabletop.getQuestSaveState({ cartridgeSlug: slug });
      if (res && res.success) {
        if (res.saveStateSchema) {
          currentData.questSaveStateSchema = res.saveStateSchema;
        }
        const rawActive = res.activeSave || res.saveData || null;
        currentData.questSaveState = rawActive ? normalizeSaveStateToKGraphInRenderer(rawActive, slug) : null;
        currentData.questSaveSnapshots = Array.isArray(res.snapshots) ? res.snapshots : [];
      }
    } else if (currentData.questSaveState) {
      currentData.questSaveState = normalizeSaveStateToKGraphInRenderer(currentData.questSaveState, slug);
    }
  } catch (err) {
    console.warn("[robos-tabletop] Failed to read quest save state:", err);
  }

  const badgeEl = document.getElementById("quest-save-state-badge");
  const summaryEl = document.getElementById("quest-save-state-summary");
  const overviewLayoutEl = document.getElementById("quest-save-state-overview-layout");
  const kgraphIdBadgeEl = document.getElementById("quest-save-kgraph-id-badge");
  const telemetryGridEl = document.getElementById("quest-save-state-telemetry-grid");
  const screenshotImgEl = document.getElementById("quest-save-state-screenshot-img");
  const screenshotCanvasEl = document.getElementById("quest-save-state-screenshot-canvas");
  const screenshotBadgeEl = document.getElementById("quest-save-state-screenshot-badge");
  const heroesHeaderEl = document.getElementById("quest-save-state-heroes-header");
  const heroesEl = document.getElementById("quest-save-state-heroes");
  const collectionsGridEl = document.getElementById("quest-save-state-collections-grid");
  const visibleMonstersEl = document.getElementById("quest-save-state-visible-monsters");
  const itemsFoundEl = document.getElementById("quest-save-state-items-found");
  const snapsWrap = document.getElementById("quest-save-snapshots-wrap");
  const snapsList = document.getElementById("quest-save-snapshots-list");

  const st = currentData.questSaveState;
  if (!st) {
    if (badgeEl) {
      badgeEl.textContent = "⚪ No Saved State Yet (Fresh)";
      badgeEl.className = "badge badge-gray";
    }
    if (summaryEl) {
      summaryEl.innerHTML = `No active save state found for <code>${escapeHtml(slug)}.cartridge</code>. Click <strong>💾 Save State From Now</strong> to snapshot the current quest &amp; hero state, or launch the game to auto-save as you play.`;
    }
    if (overviewLayoutEl) overviewLayoutEl.style.display = "none";
    if (heroesHeaderEl) heroesHeaderEl.style.display = "none";
    if (heroesEl) heroesEl.innerHTML = "";
    if (collectionsGridEl) collectionsGridEl.style.display = "none";
    if (visibleMonstersEl) visibleMonstersEl.innerHTML = "";
    if (itemsFoundEl) itemsFoundEl.innerHTML = "";
  } else {
    const savedTime = st["robos:savedAt"]
      ? new Date(st["robos:savedAt"]).toLocaleString()
      : (st.saved_at ? new Date(st.saved_at * 1000).toLocaleString() : "Just now");
    const roundNum = st["robos:currentRound"] || st.round_num || 1;
    const phase = st["robos:currentPhase"] || st.phase || "hero_phase";
    const turnActor = st["robos:activeTurnActor"] || "Hero Party";
    const playFormatted = st["robos:playTimeFormatted"] || "1m 0s";
    const visMonCount = st["robos:visibleMonstersCount"] ?? (st["robos:visibleMonsters"] || []).length;
    const labelStr = st["dcterms:title"] ? ` — <strong>${escapeHtml(st["dcterms:title"])}</strong>` : "";

    if (badgeEl) {
      badgeEl.textContent = `🟢 Active Save State (Round ${roundNum} • ${turnActor})`;
      badgeEl.className = "badge badge-success";
    }
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span>💾 <strong>Active Save State Ready</strong>${labelStr} • Round <strong>${roundNum}</strong> (${escapeHtml(String(phase))}) • Turn: <strong style="color:#fde047;">${escapeHtml(turnActor)}</strong> • Played: <strong style="color:#34d399;">${escapeHtml(playFormatted)}</strong> • <strong>${visMonCount}</strong> Visible Monster(s)</span>
          <span style="color:#94a3b8; font-size:11px;">Saved: ${escapeHtml(savedTime)}</span>
        </div>
      `;
    }

    // 1. Render Fog-of-War Mini-Map Screenshot & Persist PNG
    if (overviewLayoutEl) overviewLayoutEl.style.display = "grid";
    if (kgraphIdBadgeEl) kgraphIdBadgeEl.textContent = st["@id"] || `urn:robos:tabletop:savestate:${slug}`;

    const canvasDataUrl = renderQuestStateScreenshotToCanvas(st);
    const effectiveDataUrl = canvasDataUrl || (st["robos:screenshotDataUrl"] && st["robos:screenshotDataUrl"].startsWith("data:image/") ? st["robos:screenshotDataUrl"] : "");

    if (effectiveDataUrl) {
      st["robos:screenshotDataUrl"] = effectiveDataUrl;
      if (screenshotImgEl && screenshotCanvasEl) {
        screenshotImgEl.src = effectiveDataUrl;
        screenshotImgEl.style.display = "block";
        screenshotCanvasEl.style.display = "none";
      }
      if (screenshotBadgeEl) {
        screenshotBadgeEl.textContent = "📸 Fog-of-War Capture";
      }
      if (canvasDataUrl && window.robosTabletop?.saveQuestScreenshot) {
        window.robosTabletop.saveQuestScreenshot({ cartridgeSlug: slug, dataUrl: canvasDataUrl }).catch(() => {});
      }
    }

    // 2. Render KGraph Schema-Driven Telemetry Metrics Grid
    if (telemetryGridEl) {
      telemetryGridEl.innerHTML = "";
      const schema = currentData.questSaveStateSchema || DEFAULT_SAVE_STATE_SCHEMA;
      const metrics = Array.isArray(schema.telemetryMetrics) ? schema.telemetryMetrics : DEFAULT_SAVE_STATE_SCHEMA.telemetryMetrics;
      const frag = document.createDocumentFragment();
      metrics.forEach(m => {
        const card = document.createElement("div");
        card.className = "kgraph-telemetry-metric-card";
        card.dataset.kgraphProperty = m.property;
        card.style = "background:rgba(30,41,59,0.75); border:1px solid #334155; border-radius:5px; padding:7px 9px; display:flex; flex-direction:column; gap:2px;";
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#94a3b8; text-transform:uppercase; font-weight:700;">
            <span>${m.icon || "📊"} ${escapeHtml(m.label)}</span>
            <code style="font-size:9px; color:#64748b;">${escapeHtml(m.property)}</code>
          </div>
          ${formatKGraphTelemetryMetricValue(m, st)}
        `;
        frag.appendChild(card);
      });
      telemetryGridEl.appendChild(frag);
    }

    // 3. Render Party Health & Vitals (robos:heroStates)
    if (heroesHeaderEl) heroesHeaderEl.style.display = "block";
    if (heroesEl) {
      heroesEl.innerHTML = "";
      const heroFrag = document.createDocumentFragment();
      (st["robos:heroStates"] || st.heroes || []).forEach(h => {
        const hDiv = document.createElement("div");
        const curBp = h.currentBP ?? h.hp ?? h.bp ?? 8;
        const maxBp = h.maxBP ?? h.max_hp ?? h.max_bp ?? 8;
        const curMp = h.currentMP ?? h.mp ?? 2;
        const maxMp = h.maxMP ?? h.max_mp ?? 2;
        const hpPct = Math.max(0, Math.min(100, Math.round((curBp / Math.max(1, maxBp)) * 100)));
        const hpColor = hpPct > 50 ? "#22c55e" : (hpPct > 25 ? "#f59e0b" : "#ef4444");
        const pos = Array.isArray(h.gridPos || h.grid_pos) ? `[${(h.gridPos || h.grid_pos)[0]}, ${(h.gridPos || h.grid_pos)[1]}]` : "[7, 14]";
        const isTurn = Boolean(h.isActiveTurn);
        const invList = Array.isArray(h.inventory)
          ? h.inventory.map(it => typeof it === "string" ? it.replace(/_/g, " ") : (it?.name || "item")).join(", ")
          : "";
        const spellsCount = Array.isArray(h.spells) ? h.spells.length : 0;
        const spellsRem = h.spellsRemaining !== undefined ? h.spellsRemaining : spellsCount;

        hDiv.className = `save-state-hero-card ${isTurn ? "active-turn-hero" : ""}`;
        hDiv.style = `background:rgba(30,41,59,0.85); border:1px solid ${isTurn ? "#fde047" : "#475569"}; border-radius:6px; padding:8px 10px; font-size:11px; display:flex; flex-direction:column; gap:4px;`;
        hDiv.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span style="font-weight:700; color:#f8fafc; font-size:12px;">
              ${isTurn ? "🎯 " : "🛡️ "}${escapeHtml(h.name || h.id)}
            </span>
            <div style="display:flex; gap:4px; align-items:center;">
              ${isTurn ? `<span class="badge" style="background:#eab30833; color:#fde047; border:1px solid #eab308; font-size:9px; padding:1px 5px;">ACTIVE TURN</span>` : ""}
              <span style="color:#38bdf8; font-family:monospace; font-size:10px;">Pos ${pos}</span>
            </div>
          </div>
          <div style="width:100%; height:5px; background:#0f172a; border-radius:3px; overflow:hidden;">
            <div style="width:${hpPct}%; height:100%; background:${hpColor};"></div>
          </div>
          <div style="color:#cbd5e1; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px;">
            <span>❤️ HP: <strong>${curBp}/${maxBp}</strong></span>
            <span>🧠 MP: <strong>${curMp}/${maxMp}</strong></span>
            <span>⚔️ <strong>${h.attackDice || 3}</strong> / 🛡️ <strong>${h.defendDice || 2}</strong></span>
            <span style="color:#fde047;">🪙 <strong>${h.gold ?? 0}g</strong></span>
          </div>
          <div style="font-size:10px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(invList)}">
            🗡️ ${escapeHtml(String(h.weapon || "unarmed"))} ${spellsCount > 0 ? `• 🔮 ${spellsRem}/${spellsCount} Spells` : ""} ${invList ? `• 🎒 ${escapeHtml(invList)}` : ""}
          </div>
        `;
        heroFrag.appendChild(hDiv);
      });
      heroesEl.appendChild(heroFrag);
    }

    // 4. Render Visible Monsters & Items Found So Far (Zero Unseen Spoilers)
    if (collectionsGridEl) collectionsGridEl.style.display = "grid";
    if (visibleMonstersEl) {
      visibleMonstersEl.innerHTML = "";
      const visMonsters = st["robos:visibleMonsters"] || [];
      if (visMonsters.length === 0) {
        visibleMonstersEl.innerHTML = `<div style="font-size:11px; color:#94a3b8; padding:6px 8px; background:rgba(15,23,42,0.6); border:1px dashed #334155; border-radius:4px;">No monsters currently in line-of-sight.</div>`;
      } else {
        const monFrag = document.createDocumentFragment();
        visMonsters.forEach(m => {
          const mCard = document.createElement("div");
          const mPos = Array.isArray(m.gridPos) ? `[${m.gridPos[0]}, ${m.gridPos[1]}]` : "[0, 0]";
          const tokUrl = getMonsterTokenUrl(m);
          const portUrl = getMonsterPortraitUrl(m);
          mCard.className = "save-state-visible-monster-item";
          mCard.style = "background:rgba(69,10,10,0.45); border:1px solid #991b1b; border-radius:5px; padding:6px 9px; font-size:11px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;";
          mCard.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
              <img src="${tokUrl}" alt="" style="width:20px; height:20px; border-radius:50%; object-fit:cover; border:1px solid #f59e0b;">
              <img src="${portUrl}" alt="" style="width:18px; height:20px; border-radius:3px; object-fit:cover; border:1px solid #475569;">
              <strong style="color:#fecaca;">${escapeHtml(m.name)}</strong>
              <span style="color:#fca5a5; font-size:10px; margin-left:4px;">(${escapeHtml(m.monsterType)})</span>
              ${m.isBoss ? `<span class="badge" style="background:#581c87; color:#f3e8ff; font-size:9px; margin-left:4px;">BOSS</span>` : ""}
            </div>
            <div style="display:flex; gap:8px; align-items:center; color:#f8fafc; font-size:10px;">
              <span>❤️ <strong>${m.currentBP}/${m.maxBP} BP</strong></span>
              <span>⚔️ ${m.attackDice} / 🛡️ ${m.defendDice} / 🦶 ${m.movementSquares}</span>
              <span style="color:#38bdf8; font-family:monospace;">Pos ${mPos}</span>
            </div>
          `;
          monFrag.appendChild(mCard);
        });
        visibleMonstersEl.appendChild(monFrag);
      }
    }

    if (itemsFoundEl) {
      itemsFoundEl.innerHTML = "";
      const items = st["robos:itemsFound"] || [];
      const triggers = st["robos:triggersFired"] || [];
      const frag = document.createDocumentFragment();

      if (triggers.length > 0) {
        triggers.forEach(tr => {
          const trDiv = document.createElement("div");
          trDiv.style = "background:rgba(88,28,135,0.35); border:1px solid #7e22ce; border-radius:5px; padding:5px 8px; font-size:10px; color:#e9d5ff;";
          trDiv.innerHTML = `📜 <strong>Event Triggered:</strong> ${escapeHtml(tr.title || tr.id)} <span style="color:#c084fc;">(${escapeHtml(tr.event || "encounter")})</span>`;
          frag.appendChild(trDiv);
        });
      }

      if (items.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style = "font-size:11px; color:#94a3b8; padding:6px 8px; background:rgba(15,23,42,0.6); border:1px dashed #334155; border-radius:4px;";
        emptyDiv.textContent = "No items or treasure cards collected yet.";
        frag.appendChild(emptyDiv);
      } else {
        const chipsWrap = document.createElement("div");
        chipsWrap.style = "display:flex; flex-wrap:wrap; gap:5px;";
        items.forEach(it => {
          const chip = document.createElement("span");
          chip.className = "save-state-item-chip";
          chip.style = "background:rgba(30,41,59,0.9); border:1px solid #475569; border-radius:4px; padding:3px 7px; font-size:10px; color:#f1f5f9;";
          chip.innerHTML = `${escapeHtml(it.icon || "🎒")} <strong>${escapeHtml(it.name)}</strong> <span style="color:#94a3b8;">(${escapeHtml(it.holder || "Party")})</span>`;
          chipsWrap.appendChild(chip);
        });
        frag.appendChild(chipsWrap);
      }
      itemsFoundEl.appendChild(frag);
    }
  }

  if (snapsWrap && snapsList) {
    const snaps = currentData.questSaveSnapshots || [];
    if (snaps.length === 0) {
      snapsWrap.style.display = "none";
      snapsList.innerHTML = "";
    } else {
      snapsWrap.style.display = "block";
      snapsList.innerHTML = "";
      snaps.forEach(sn => {
        const fileKey = sn.fileName || sn.file || `${sn.id}.save.json`;
        const roundVal = sn.roundNum || sn.round || 1;
        const btn = document.createElement("button");
        btn.className = "btn btn-xs btn-secondary snapshot-restore-btn";
        btn.dataset.snapshotFile = fileKey;
        btn.textContent = `📸 ${sn.label || fileKey} (R${roundVal}${sn.playTimeFormatted ? ` • ${sn.playTimeFormatted}` : ""})`;
        btn.title = `Click to restore this saved state snapshot (${sn.savedAtIso || sn.timestamp || ""}) as the active launch state`;
        btn.addEventListener("click", async () => {
          await clearQuestSaveState(slug, fileKey);
        });
        snapsList.appendChild(btn);
      });
    }
  }

  return {
    activeSave: currentData.questSaveState,
    snapshots: currentData.questSaveSnapshots
  };
}

async function saveQuestStateFromNow(customLabel = null, customStatePayload = null) {
  const q = getActiveQuest();
  const slug = q?.slug || "custom-quest";
  const labelInput = document.getElementById("save-state-label-input");
  const label = customLabel !== null
    ? customLabel
    : (labelInput?.value?.trim() || `Save State From Studio (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);

  const rawPayload = customStatePayload || buildDefaultQuestSaveStatePayload(label);
  rawPayload.label = label;
  rawPayload["dcterms:title"] = label;
  rawPayload.saved_at = Math.floor(Date.now() / 1000);
  rawPayload.saved_at_iso = new Date().toISOString();

  const normalizedNode = normalizeSaveStateToKGraphInRenderer(rawPayload, slug) || rawPayload;
  const screenshotDataUrl = renderQuestStateScreenshotToCanvas(normalizedNode);
  if (screenshotDataUrl) {
    normalizedNode["robos:screenshotDataUrl"] = screenshotDataUrl;
    rawPayload["robos:screenshotDataUrl"] = screenshotDataUrl;
  }

  if (window.robosTabletop?.saveQuestStateNow) {
    const res = await window.robosTabletop.saveQuestStateNow({
      cartridgeSlug: slug,
      label,
      statePayload: normalizedNode,
      screenshotDataUrl
    });
    if (res && res.success) {
      const savedRaw = res.savedState || res.activeSave || res.saveData || normalizedNode;
      currentData.questSaveState = normalizeSaveStateToKGraphInRenderer(savedRaw, slug);
      if (labelInput) labelInput.value = "";
      await refreshQuestSaveStateUI(slug);
      setStatus(`💾 Saved quest state & screenshot from now for '${slug}.cartridge' (${label}).`);
      return res;
    }
  }

  // Fallback for unit test environment without IPC
  currentData.questSaveState = normalizedNode;
  currentData.questSaveSnapshots.unshift({
    fileName: `snapshot-${Date.now()}.save.json`,
    label,
    savedAt: normalizedNode.saved_at,
    savedAtIso: normalizedNode.saved_at_iso,
    roundNum: normalizedNode["robos:currentRound"] || normalizedNode.round_num || 1,
    phase: normalizedNode["robos:currentPhase"] || normalizedNode.phase || "PLAYER_TURN",
    activeTurnActor: normalizedNode["robos:activeTurnActor"] || "Hero Party",
    playTimeFormatted: normalizedNode["robos:playTimeFormatted"] || "1m 0s",
    heroesCount: (normalizedNode.heroes || []).length,
    screenshotDataUrl
  });
  await refreshQuestSaveStateUI(slug);
  setStatus(`💾 Saved quest state & screenshot from now for '${slug}.cartridge' (${label}).`);
  return {
    success: true,
    cartridgeSlug: slug,
    savedState: currentData.questSaveState,
    snapshots: currentData.questSaveSnapshots
  };
}

async function clearQuestSaveState(cartridgeSlug = null, restoreSnapshotFile = null) {
  const q = getActiveQuest();
  const slug = cartridgeSlug || q?.slug || "custom-quest";

  if (window.robosTabletop?.clearQuestSaveState) {
    const res = await window.robosTabletop.clearQuestSaveState({
      cartridgeSlug: slug,
      restoreSnapshotFile
    });
    await refreshQuestSaveStateUI(slug);
    if (restoreSnapshotFile) {
      setStatus(`Restored saved quest state snapshot '${restoreSnapshotFile}' for '${slug}.cartridge'.`);
    } else {
      setStatus(`Cleared active save state for '${slug}.cartridge'. Next launch will start fresh.`);
    }
    return res;
  }

  if (restoreSnapshotFile) {
    const foundSnap = (currentData.questSaveSnapshots || []).find(s => (s.fileName || s.file) === restoreSnapshotFile);
    if (foundSnap && currentData.questSaveState) {
      currentData.questSaveState.label = foundSnap.label;
      currentData.questSaveState["dcterms:title"] = foundSnap.label;
    }
    await refreshQuestSaveStateUI(slug);
    return { success: true, restored: true };
  }

  currentData.questSaveState = null;
  await refreshQuestSaveStateUI(slug);
  setStatus(`Cleared active save state for '${slug}.cartridge'.`);
  return { success: true, cleared: true };
}

// 3) Launch the Game in either Saved Launch State ("saved") or New Quest State ("new")
async function launchQuestInMode(role = "player", launchMode = null) {
  const modeSelect = document.getElementById("header-launch-mode-select");
  const resolvedMode = launchMode || modeSelect?.value || "saved";
  const payload = compileCurrentCartridgePayload();
  const slug = payload.cartridgeId || "custom-quest";

  setStatus(`Syncing campaign heroes & spells into "${slug}.cartridge.json"...`);
  if (window.robosTabletop?.bundleCartridge) {
    const bundleRes = await window.robosTabletop.bundleCartridge(payload);
    if (bundleRes && !bundleRes.success) {
      setStatus("Failed to sync quest cartridge: " + bundleRes.error);
      return bundleRes;
    }
  }

  const modeDesc = resolvedMode === "new" ? "NEW QUEST STATE (Fresh --reset)" : "SAVED QUEST STATE (Resume)";
  setStatus(`Launching Tabletop Player (${role.toUpperCase()} — ${modeDesc})...`);

  if (window.robosTabletop?.launchGame) {
    const res = await window.robosTabletop.launchGame({
      cartridgeSlug: slug,
      role,
      launchMode: resolvedMode
    });
    if (res && res.success) {
      setStatus(`Launched ${role.toUpperCase()} Mode in ${modeDesc} (PID: ${res.pid})`);
    } else {
      setStatus("Error launching game: " + (res ? res.error : "Unknown"));
    }
    return res;
  }

  return {
    success: true,
    cartridgeSlug: slug,
    role,
    launchMode: resolvedMode
  };
}

function renderCampaignQuestsList() {
  const listEl = document.getElementById("campaign-quests-list");
  if (!listEl) return;

  listEl.innerHTML = "";
  const quests = Array.isArray(currentData.campaign?.quests) ? currentData.campaign.quests : [];
  if (quests.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "quest-list-empty";
    emptyEl.style.cssText = "padding:14px; text-align:center; color:#94a3b8; font-size:12px;";
    emptyEl.innerHTML = `
      <div>No quests in this campaign.</div>
      <button id="btn-empty-add-quest" class="btn btn-sm btn-secondary" style="margin-top:8px;">+ Add Quest</button>
    `;
    emptyEl.querySelector("#btn-empty-add-quest")?.addEventListener("click", () => addQuest());
    listEl.appendChild(emptyEl);
    renderHeaderQuestSelect();
    return;
  }

  quests.forEach((q, idx) => {
    const item = document.createElement("div");
    item.className = `quest-list-item ${idx === currentData.currentQuestIndex ? "active" : ""}`;
    item.onclick = () => selectQuest(idx);

    const isCompleted = !!q.completed;
    const statusIcon = isCompleted ? "🏆" : "⏳";
    const statusClass = isCompleted ? "badge-success" : "badge-progress";
    const statusText = isCompleted ? "Completed" : "Active";

    item.innerHTML = `
      <div class="quest-list-item-header" style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <span class="quest-list-item-title" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(q.title || `Quest ${idx + 1}`)}</span>
        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
          <span class="badge ${statusClass}" style="font-size:10px; padding:2px 6px;">${statusIcon} ${statusText}</span>
          <button type="button" class="btn btn-sm btn-danger btn-delete-quest-item" data-quest-index="${idx}" title="Delete '${escapeHtml(q.title || `Quest ${idx + 1}`)}'" style="padding:1px 6px; font-size:10px; line-height:1.2;">🗑️</button>
        </div>
      </div>
      <div class="quest-list-item-footer">
        <span style="color:#38bdf8; font-size:11px; font-family:monospace;">📦 ${escapeHtml(q.slug || "custom-quest")}.cartridge</span>
        <span class="gold-badge" style="font-size:11px; padding:1px 5px; background:rgba(234,179,8,0.15); color:#fde047; border-radius:3px;">🪙 ${q.goldReward || 0}g</span>
      </div>
    `;
    const delItemBtn = item.querySelector(".btn-delete-quest-item");
    if (delItemBtn) {
      delItemBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteQuest(idx);
      });
    }
    listEl.appendChild(item);
  });

  renderHeaderQuestSelect();
}

function renderHeaderQuestSelect() {
  const select = document.getElementById("header-quest-select") || document.getElementById("cartridge-select");
  if (!select) return;

  select.innerHTML = "";
  const quests = Array.isArray(currentData.campaign?.quests) ? currentData.campaign.quests : [];
  if (quests.length === 0) {
    const opt = document.createElement("option");
    opt.value = "-1";
    opt.textContent = "— No Quests in Campaign —";
    select.appendChild(opt);
    return;
  }

  quests.forEach((q, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    const isCompleted = !!q.completed;
    const statusIcon = isCompleted ? "🏆" : "⏳";
    opt.textContent = `${statusIcon} ${q.title || `Quest ${idx + 1}`} (${q.slug || "custom-quest"}.cartridge)`;
    if (idx === currentData.currentQuestIndex) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function updateCampaignProgress() {
  const quests = currentData.campaign.quests;
  const total = quests.length;
  const completed = quests.filter(q => q.completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalGold = quests.reduce((acc, q) => acc + (Number(q.goldReward) || 0), 0);

  const barEl = document.getElementById("campaign-progress-bar");
  const pctEl = document.getElementById("campaign-progress-pct");
  const countEl = document.getElementById("campaign-progress-count");
  const goldPotEl = document.getElementById("campaign-total-gold-pot");
  const titleDisplayEl = document.getElementById("campaign-title-display");

  if (barEl) barEl.style.width = `${pct}%`;
  if (pctEl) {
    pctEl.textContent = `${pct}% Completed`;
    pctEl.className = pct === 100 ? "badge badge-success" : "badge badge-cyan";
  }
  if (countEl) countEl.textContent = `${completed} / ${total} Quests Finished`;
  if (goldPotEl) goldPotEl.textContent = `Total Bounty: ${totalGold}g`;
  if (titleDisplayEl && currentData.campaign.title) titleDisplayEl.textContent = currentData.campaign.title;
  renderCampaignSelectorUI();
}

function completeQuest(index = currentData.currentQuestIndex) {
  if (index < 0 || index >= currentData.campaign.quests.length) return null;
  const q = currentData.campaign.quests[index];
  q.completed = true;

  // Award gold bounty to all heroes in the active campaign
  const bounty = Number(q.goldReward) || 100;
  if (Array.isArray(currentData.heroes)) {
    currentData.heroes.forEach(h => {
      h["robos:gold"] = (Number(h["robos:gold"]) || 0) + bounty;
    });
  }

  // Update hero UI if active
  const heroGoldEl = document.getElementById("hero-gold");
  const actHeroGoldEl = document.getElementById("act-hero-gold");
  const activeH = getActiveHero();
  if (activeH) {
    if (heroGoldEl) heroGoldEl.value = activeH["robos:gold"] || 0;
    if (actHeroGoldEl) actHeroGoldEl.textContent = `${activeH["robos:gold"] || 0}g`;
  }
  renderHeroesList();
  renderQuestHeroesReviewGrid();
  if (typeof renderHeroActionScreen === "function") {
    renderHeroActionScreen();
  }

  // Update Quest UI
  updateQuestStatusUI(q);
  renderCampaignQuestsList();
  updateCampaignProgress();
  saveCampaignToKGraph(currentData.campaign, false);

  setStatus(`🏆 Victory! Completed '${q.title}' and awarded ${bounty}g bounty to all party members!`);
  return { success: true, quest: q, goldAwarded: bounty };
}

function resetQuest(index = currentData.currentQuestIndex) {
  if (index < 0 || index >= currentData.campaign.quests.length) return null;
  const q = currentData.campaign.quests[index];
  q.completed = false;

  updateQuestStatusUI(q);
  renderCampaignQuestsList();
  updateCampaignProgress();
  saveCampaignToKGraph(currentData.campaign, false);

  setStatus(`Reopened quest '${q.title}'. Ready for adventure.`);
  return { success: true, quest: q };
}

function slugifyCampaignOrQuestText(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addQuest(customProps = {}) {
  const nextNum = currentData.campaign.quests.length + 1;
  const campTitle = currentData.campaign?.title || "HeroQuest";
  const campSlug = slugifyCampaignOrQuestText(campTitle) || "campaign";
  const isDefaultHeroQuest = currentData.campaign?.id === "campaign-heroquest" && nextNum === 1;
  const isElectionCampaign = /election|midterm/i.test(campTitle) || /election|midterm/i.test(customProps.title || "");

  const defaultSlug = isDefaultHeroQuest
    ? "custom-quest"
    : `${campSlug}-quest-${nextNum}`;

  const defaultTitle = customProps.title
    || (isElectionCampaign && nextNum === 1
      ? `Quest 1: Battle for the Hill`
      : `Quest ${nextNum}: Custom Dungeon`);

  const defaultMapConfigId = customProps.mapConfigId
    || (isElectionCampaign ? "midterm-election-capitol" : (currentData.activeMapConfig?.id || "heroquest-classic"));

  const resolvedSlug = customProps.slug || defaultSlug;
  const newQuest = {
    id: `quest-${nextNum}`,
    slug: resolvedSlug,
    cartridgeFile: customProps.cartridgeFile || `${resolvedSlug}.cartridge.json`,
    title: defaultTitle,
    briefing: customProps.briefing || (isElectionCampaign
      ? `Enter the Capitol halls in Midterm Elections: Battle for the Hill. Navigate the chambers, overcome partisan perils, and claim victory!`
      : `A dark shadow looms over the realm. Brave heroes must explore the dungeon depths and vanquish the lurking evil.`),
    mapConfigId: defaultMapConfigId,
    _preserveMapConfig: Boolean(customProps.mapConfigId || isElectionCampaign),
    ruleset: customProps.ruleset || "heroquest",
    goldReward: customProps.goldReward !== undefined ? customProps.goldReward : 150,
    bossTarget: customProps.bossTarget || "gargoyle-boss",
    completed: false,
    startingStairs: customProps.startingStairs ? [...customProps.startingStairs] : [7, 14],
    activeRooms: new Set(),
    wallBlocks: [],
    doors: [],
    furniture: [],
    monsters: [],
    traps: []
  };

  currentData.campaign.quests.push(newQuest);
  selectQuest(currentData.campaign.quests.length - 1);
  updateCampaignProgress();
  saveCampaignToKGraph(currentData.campaign, false);
  setStatus(`Created & saved new quest: '${newQuest.title}'`);
  return newQuest;
}

function deleteQuest(indexOrSlug = currentData.currentQuestIndex, options = {}) {
  const quests = currentData.campaign?.quests;
  if (!Array.isArray(quests) || quests.length === 0) {
    setStatus("No quests available to delete.");
    return false;
  }

  let idx = -1;
  if (typeof indexOrSlug === "number") {
    idx = indexOrSlug;
  } else if (typeof indexOrSlug === "string") {
    const parsed = parseInt(indexOrSlug, 10);
    if (!isNaN(parsed) && String(parsed) === indexOrSlug.trim()) {
      idx = parsed;
    } else {
      idx = quests.findIndex(q => q.id === indexOrSlug || q.slug === indexOrSlug || q.title === indexOrSlug);
    }
  }
  if (idx < 0 || idx >= quests.length) return false;

  const deleted = quests.splice(idx, 1)[0];

  if (window.robosTabletop?.deleteQuest && deleted) {
    window.robosTabletop.deleteQuest({
      slug: deleted.slug,
      questId: deleted.id,
      deleteCartridgeFile: Boolean(options.deleteCartridgeFile),
      clearSaveState: options.clearSaveState !== false
    }).catch(() => {});
  }

  if (quests.length > 0) {
    const nextIdx = Math.max(0, Math.min(idx, quests.length - 1));
    selectQuest(nextIdx);
  } else {
    applyEmptyQuestEditorUI();
    renderCampaignQuestsList();
  }

  updateCampaignProgress();
  saveCampaignToKGraph(currentData.campaign, false);
  setStatus(`Deleted quest: '${deleted.title}'`);
  return true;
}

function advanceToNextQuest() {
  const nextIdx = currentData.currentQuestIndex + 1;
  if (nextIdx < currentData.campaign.quests.length) {
    selectQuest(nextIdx);
  } else {
    setStatus("Campaign complete! All quests in the campaign have been finished!");
  }
}

function setupCampaignQuestControls() {
  // Multi-Campaign Selector & Buttons
  document.getElementById("campaign-select")?.addEventListener("change", (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx)) {
      selectCampaign(idx);
    }
  });
  document.getElementById("btn-add-campaign")?.addEventListener("click", () => addCampaign());
  document.getElementById("btn-delete-campaign")?.addEventListener("click", () => deleteCampaign());

  // Campaign Subtab Buttons (Quests vs Campaign Heroes)
  document.querySelectorAll(".campaign-subtab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchCampaignSubtab(btn.dataset.campaignSubtab);
    });
  });

  // Campaign Name Input
  const cNameInput = document.getElementById("campaign-name-input");
  if (cNameInput) {
    cNameInput.value = currentData.campaign.title;
    cNameInput.addEventListener("input", (e) => {
      const newTitle = e.target.value;
      currentData.campaign.title = newTitle;
      const titleDisplay = document.getElementById("campaign-title-display");
      if (titleDisplay) titleDisplay.textContent = newTitle;

      const q = currentData.currentQuest;
      if (q && /^campaign-\d+-new-adventure-quest-(\d+)$/.test(q.slug || "")) {
        const qNum = RegExp.$1 || "1";
        const newCampSlug = slugifyCampaignOrQuestText(newTitle);
        if (newCampSlug) {
          q.slug = `${newCampSlug}-quest-${qNum}`;
          q.cartridgeFile = `${q.slug}.cartridge.json`;
          const slugEl = document.getElementById("quest-slug");
          if (slugEl) slugEl.value = q.slug;
          const cartBadge = document.getElementById("quest-cartridge-badge");
          if (cartBadge) cartBadge.textContent = `📦 ${q.cartridgeFile}`;
          const fileStat = document.getElementById("cartridge-stat-file");
          if (fileStat) fileStat.textContent = `📦 ${q.cartridgeFile}`;
          const calibEl = document.getElementById("quest-bg-calib");
          if (calibEl) calibEl.textContent = q.cartridgeFile;
        }
        if (/election|midterm/i.test(newTitle) && !q._preserveMapConfig) {
          q.mapConfigId = "midterm-election-capitol";
          q._preserveMapConfig = true;
          switchMapConfiguration("midterm-election-capitol", false);
        }
        renderCampaignQuestsList();
      }

      renderCampaignSelectorUI();
      triggerCampaignAutosave();
    });
  }

  // Header Active Quest Dropdown Live Sync
  const headerQuestSelect = document.getElementById("header-quest-select") || document.getElementById("cartridge-select");
  if (headerQuestSelect) {
    headerQuestSelect.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx) && idx >= 0 && idx < currentData.campaign.quests.length) {
        selectQuest(idx);
      }
    });
  }

  // Quest Title Live Sync
  document.getElementById("quest-title")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    currentData.currentQuest.title = e.target.value;
    const editorTitle = document.getElementById("quest-editor-title");
    if (editorTitle) editorTitle.textContent = e.target.value || "Edit Quest";
    renderCampaignQuestsList();
    triggerCampaignAutosave();
  });

  // Quest Slug Live Sync
  document.getElementById("quest-slug")?.addEventListener("input", (e) => {
    if (currentData.currentQuest) {
      currentData.currentQuest.slug = e.target.value;
      currentData.currentQuest.cartridgeFile = `${e.target.value || "custom-quest"}.cartridge.json`;
      const cartBadge = document.getElementById("quest-cartridge-badge");
      if (cartBadge) cartBadge.textContent = `📦 ${e.target.value || "custom-quest"}.cartridge.json`;
      const fileStat = document.getElementById("cartridge-stat-file");
      if (fileStat) fileStat.textContent = `📦 ${e.target.value || "custom-quest"}.cartridge.json`;
      const calibEl = document.getElementById("quest-bg-calib");
      if (calibEl) calibEl.textContent = `${e.target.value || "custom-quest"}.cartridge.json`;
      renderCampaignQuestsList();
      triggerCampaignAutosave();
    }
  });

  // Quest Ruleset Live Sync
  document.getElementById("quest-ruleset")?.addEventListener("change", (e) => {
    if (currentData.currentQuest) {
      currentData.currentQuest.ruleset = e.target.value;
      triggerCampaignAutosave();
    }
  });

  // Starting Spawn X, Y
  document.getElementById("quest-spawn-x")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    if (!currentData.currentQuest.startingStairs) currentData.currentQuest.startingStairs = [7, 14];
    currentData.currentQuest.startingStairs[0] = parseInt(e.target.value, 10) || 0;
    drawBoard();
    triggerCampaignAutosave();
  });

  document.getElementById("quest-spawn-y")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    if (!currentData.currentQuest.startingStairs) currentData.currentQuest.startingStairs = [7, 14];
    currentData.currentQuest.startingStairs[1] = parseInt(e.target.value, 10) || 0;
    drawBoard();
    triggerCampaignAutosave();
  });

  // Quest Gold Reward
  document.getElementById("quest-gold")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    currentData.currentQuest.goldReward = parseInt(e.target.value, 10) || 0;
    renderCampaignQuestsList();
    updateCampaignProgress();
    triggerCampaignAutosave();
  });

  // Story Briefing & Boss Target
  document.getElementById("quest-briefing")?.addEventListener("input", (e) => {
    if (currentData.currentQuest) {
      currentData.currentQuest.briefing = e.target.value;
      triggerCampaignAutosave();
    }
  });

  document.getElementById("quest-boss-target")?.addEventListener("input", (e) => {
    if (currentData.currentQuest) {
      currentData.currentQuest.bossTarget = e.target.value;
      triggerCampaignAutosave();
    }
  });

  // Campaign Buttons (Sidebar, Empty State Card, Quest Card Header, and Top Header)
  document.getElementById("btn-add-quest")?.addEventListener("click", () => addQuest());
  document.getElementById("btn-empty-panel-add-quest")?.addEventListener("click", () => addQuest());
  document.getElementById("btn-header-add-quest")?.addEventListener("click", () => addQuest());
  document.getElementById("btn-delete-quest")?.addEventListener("click", () => deleteQuest());
  document.getElementById("btn-sidebar-delete-quest")?.addEventListener("click", () => deleteQuest());
  document.getElementById("btn-header-delete-quest")?.addEventListener("click", () => deleteQuest());
  document.getElementById("btn-complete-quest")?.addEventListener("click", () => completeQuest());
  document.getElementById("btn-reset-quest")?.addEventListener("click", () => resetQuest());
  document.getElementById("btn-next-quest-banner")?.addEventListener("click", () => advanceToNextQuest());

  // 1) Launch Quest Editor & Review Quest Heroes Buttons
  document.getElementById("btn-launch-quest-editor")?.addEventListener("click", () => launchQuestEditorForActiveQuest());
  document.getElementById("btn-header-launch-quest-editor")?.addEventListener("click", () => launchQuestEditorForActiveQuest());
  document.getElementById("btn-quest-review-edit-heroes")?.addEventListener("click", () => switchCampaignSubtab("subtab-campaign-heroes"));
  document.getElementById("btn-quest-review-trade")?.addEventListener("click", () => openBetweenQuestsTradeModal());

  // 2) Quest Save State Controls (Save State From Now, Refresh, Clear, Recapture Screenshot)
  document.getElementById("btn-save-quest-state-now")?.addEventListener("click", () => saveQuestStateFromNow());
  document.getElementById("btn-refresh-quest-state")?.addEventListener("click", () => refreshQuestSaveStateUI());
  document.getElementById("btn-clear-quest-state")?.addEventListener("click", () => clearQuestSaveState());
  document.getElementById("btn-recapture-save-screenshot")?.addEventListener("click", async () => {
    const q = getActiveQuest();
    const slug = q?.slug || "custom-quest";
    const saveState = currentData.questSaveState;
    if (!saveState) {
      setStatus("No active saved quest state to capture screenshot for.");
      return;
    }
    const dataUrl = renderQuestStateScreenshotToCanvas(saveState);
    if (dataUrl && window.robosTabletop?.saveQuestScreenshot) {
      const res = await window.robosTabletop.saveQuestScreenshot({ cartridgeSlug: slug, screenshotDataUrl: dataUrl });
      if (res && res.success) {
        await refreshQuestSaveStateUI(slug);
        setStatus("Captured & persisted updated game state screenshot.");
      }
    }
  });

  // 3) Launch Game in Saved State vs New Quest State Buttons
  document.getElementById("btn-launch-saved-hero")?.addEventListener("click", () => launchQuestInMode("player", "saved"));
  document.getElementById("btn-launch-saved-dm")?.addEventListener("click", () => launchQuestInMode("gm", "saved"));
  document.getElementById("btn-launch-new-hero")?.addEventListener("click", () => launchQuestInMode("player", "new"));
  document.getElementById("btn-launch-new-dm")?.addEventListener("click", () => launchQuestInMode("gm", "new"));
}

// Action: Save to KGraph
document.getElementById("btn-save-kgraph")?.addEventListener("click", async () => {
  setStatus("Saving Tabletop Campaign & Quest to Knowledge Graph package 'tabletop-game'...");
  await saveCampaignToKGraph(currentData.campaign, true);
});

// Helper: Compile active campaign & current quest into cartridge payload
function compileCurrentCartridgePayload() {
  const q = currentData.currentQuest;
  const cfg = currentData.activeMapConfig;
  const cartSlug = document.getElementById("quest-slug")?.value || q?.slug || "custom-quest";

  // Build maps object for all quests in campaign
  const mapsPayload = {};
  currentData.campaign.quests.forEach(qst => {
    const qCfg = currentData.mapConfigs?.find(c => c.id === qst.mapConfigId) || cfg;
    mapsPayload[qst.slug] = {
      id: qst.slug,
      title: qst.title,
      mapConfigurationId: qst.mapConfigId,
      width: qCfg?.gridDimensions?.[0] || 26,
      height: qCfg?.gridDimensions?.[1] || 19,
      backgroundImage: qCfg?.backgroundImage || "res://assets/boards/heroquest_board.png",
      startingStair: qst.startingStairs || [7, 14],
      activeRooms: Array.from(qst.activeRooms || []),
      rooms: qCfg?.rooms || [],
      doors: qst.doors || [],
      wallBlocks: qst.wallBlocks || [],
      furniture: qst.furniture || [],
      traps: qst.traps || []
    };
  });

  return {
    cartridgeId: cartSlug,
    campaignId: currentData.campaign.id,
    title: document.getElementById("campaign-name-input")?.value || currentData.campaign.title,
    description: currentData.campaign.description || q.briefing,
    ruleset: document.getElementById("quest-ruleset")?.value || "heroquest",
    startingMap: q.slug,
    startingPosition: q.startingStairs || [7, 14],
    heroes: currentData.heroes.map(h => ({
      id: h["@id"].split(":").pop(),
      slug: h["@id"].split(":").pop(),
      name: h["dcterms:title"],
      heroClass: getHeroClass(h),
      bodyPoints: h["robos:bodyPoints"] || 8,
      mindPoints: h["robos:mindPoints"] || 2,
      attackDice: h["robos:attackDice"] || 3,
      defendDice: h["robos:defendDice"] || 2,
      gold: h["robos:gold"] !== undefined ? h["robos:gold"] : 100,
      weapon: getHeroWeapon(h),
      armor: getHeroArmor(h),
      inventory: getHeroInventory(h),
      tokenColor: h["robos:tokenColor"] || "#b91c1c",
      spells: getHeroSpells(h),
      position: (h["robos:startingPosition"] && h["robos:startingPosition"].length === 2) ? h["robos:startingPosition"] : (q.startingStairs || [7, 14])
    })),
    monsters: q.monsters.map(m => {
      const kMonster = currentData.monsters?.find(km => km["@id"].endsWith(m.monsterType) || km["dcterms:title"] === m.name);
      return {
        id: m.id,
        slug: m.monsterType || m.slug,
        name: m.name,
        bodyPoints: m.bp || m.bodyPoints || 1,
        attackDice: m.atk || m.attackDice || 2,
        defendDice: m.def || m.defendDice || 2,
        movementSquares: kMonster ? (kMonster["robos:movementSquares"] || 6) : 6,
        isBoss: !!m.isBoss,
        isUndead: kMonster ? !!kMonster["robos:isUndead"] : false,
        isSpellcaster: kMonster ? !!kMonster["robos:isSpellcaster"] : false,
        spells: kMonster ? getMonsterSpells(kMonster).map(s => s.slug) : [],
        position: Array.isArray(m.position) ? m.position : [m.x, m.y],
        roomId: m.roomId
      };
    }),
    maps: mapsPayload,
    spellAllocation: {
      elfElement: currentData.spellAllocation.elfElement,
      wizardElements: currentData.spellAllocation.wizardElements,
      confirmed: !!currentData.spellAllocation.confirmed
    },
    quests: currentData.campaign.quests.map(qst => {
      const isMidterm = /election-2026|midterm/i.test(String(qst.slug || "")) || /midterm/i.test(String(qst.mapConfigId || ""));
      let primaryGoals = Array.isArray(qst.primaryGoals) && qst.primaryGoals.length > 0 ? [...qst.primaryGoals] : [];
      if (primaryGoals.length === 0 && isMidterm) {
        primaryGoals = [
          "Defeat the Capitol Bosses & Hydra Bosses (Talarixon, El-Rogers, Brownsted, Katie Zacharia, Mitch McConnell, and Drunk JD Vance & Kamala Harris).",
          "Storm the Capitol chambers (Briefing Room, Committee Chamber, War Room & Oval Office) and expose the bipartisan slush fund.",
          "Lead all surviving heroes safely to the Capitol Exit Stairs at [14, 2]."
        ];
      }
      return {
        id: qst.slug || qst.id,
        slug: qst.slug,
        campaign: currentData.campaign.title || (isMidterm ? "Election 2026: Battle for the Hill" : "HeroQuest"),
        title: qst.title,
        briefing: qst.briefing,
        goldReward: qst.goldReward,
        completed: !!qst.completed,
        mapConfigId: qst.mapConfigId,
        startingPosition: qst.startingStairs,
        bossTarget: qst.bossTarget || (isMidterm ? "talarixon" : ""),
        primaryGoals
      };
    })
  };
}

// Helper: Auto-bundle current quest & launch player using selected launch mode ("saved" or "new")
async function autoBundleAndLaunch(role, explicitLaunchMode = null) {
  const mode = explicitLaunchMode || document.getElementById("header-launch-mode-select")?.value || "saved";
  return launchQuestInMode(role, mode);
}

// Quest Editor Exited Listener -> reload custom-quest.cartridge stats automatically
if (window.robosTabletop?.onQuestEditorExited) {
  window.robosTabletop.onQuestEditorExited(async ({ cartridgeSlug }) => {
    const slug = cartridgeSlug || currentData.currentQuest?.slug || "custom-quest";
    await loadActiveQuestCartridgeInfo(slug);
    setStatus(`Quest Map Editor closed. Reloaded '${slug}.cartridge.json' metadata.`);
  });
}

// Game Exited & Quest Progression + Save State Refresh Listener
if (window.robosTabletop?.onGameExited) {
  window.robosTabletop.onGameExited(async ({ cartridgeSlug }) => {
    const slug = cartridgeSlug || currentData.currentQuest?.slug || "custom-quest";
    console.log(`[robos-tabletop] Game exited for cartridge "${slug}". Refreshing quest save state & completion...`);
    setStatus(`Tabletop Player session ended. Refreshing quest state for "${slug}"...`);

    try {
      await refreshQuestSaveStateUI(slug);
      const res = await window.robosTabletop.checkCartridgeQuestStatus(slug);
      if (res && res.success && Array.isArray(res.quests)) {
        const activeQ = currentData.currentQuest || currentData.campaign.quests[currentData.currentQuestIndex || 0];
        const matched = res.quests.find(q => q.id === activeQ.id || q.slug === activeQ.slug) || res.quests[0];

        if (matched && matched.completed) {
          console.log(`[robos-tabletop] Active quest "${activeQ.title}" marked completed!`);
          completeQuest(currentData.currentQuestIndex);
          setStatus(`🏆 Victory! Completed '${activeQ.title}'.`);
        } else {
          setStatus(`Tabletop Player session closed. Saved quest state updated.`);
        }
      }
    } catch (err) {
      console.error("[robos-tabletop] Error checking quest status on game exit:", err);
    }
  });
}

// Action: Bundle Cartridge
document.getElementById("btn-bundle")?.addEventListener("click", async () => {
  const payload = compileCurrentCartridgePayload();
  setStatus("Syncing Tabletop RPG Cartridge...");
  const res = await window.robosTabletop.bundleCartridge(payload);
  if (res.success) {
    setStatus(`Cartridge synced successfully! Path: ${res.cartridgePath}`);
  } else {
    setStatus("Failed to bundle: " + res.error);
  }
});

// Action: Play as Hero
document.getElementById("btn-play-hero")?.addEventListener("click", async () => {
  await autoBundleAndLaunch("player");
});

// Action: Play as Game Master
document.getElementById("btn-play-dm")?.addEventListener("click", async () => {
  await autoBundleAndLaunch("gm");
});

// Map Undo & Redo Toolbar Actions
document.getElementById("btn-map-undo")?.addEventListener("click", undoMapAction);
document.getElementById("btn-map-redo")?.addEventListener("click", redoMapAction);

// Global Keyboard Shortcuts (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y, Ctrl+Shift+Z / Cmd+Shift+Z)
window.addEventListener("keydown", (e) => {
  const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : "";
  if (activeTag === "INPUT" || activeTag === "TEXTAREA" || document.activeElement?.isContentEditable) {
    return;
  }

  const isCtrlOrMeta = e.ctrlKey || e.metaKey;
  if (!isCtrlOrMeta) return;

  // Redo: Ctrl+Y or Ctrl+Shift+Z
  if (e.key === "y" || e.key === "Y" || ((e.key === "z" || e.key === "Z") && e.shiftKey)) {
    e.preventDefault();
    redoMapAction();
    return;
  }

  // Undo: Ctrl+Z (without shift)
  if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
    e.preventDefault();
    undoMapAction();
    return;
  }
});

// Expose on window for programmatic testing & debugging
if (typeof window !== "undefined") {
  window._tabletopMapHistory = {
    undo: undoMapAction,
    redo: redoMapAction,
    push: pushUndoState,
    getUndoStack: () => mapUndoStack,
    getRedoStack: () => mapRedoStack
  };

  window._tabletopClasses = {
    HERO_CLASSES,
    ENEMY_CLASSES,
    DEFAULT_RPG_CLASSES,
    initClassesCatalog,
    getClasses,
    getHeroClasses,
    getEnemyClasses,
    getClassByIdOrName,
    getActiveClass,
    selectClass,
    applyClassToMonster,
    applyClassToHero,
    createCustomMonsterFromClass,
    renderClassesTab
  };

  window._tabletopQuestState = {
    DEFAULT_SAVE_STATE_SCHEMA,
    normalizeSaveStateToKGraphInRenderer,
    renderQuestStateScreenshotToCanvas,
    formatKGraphTelemetryMetricValue,
    loadActiveQuestCartridgeInfo,
    renderQuestHeroesReviewGrid,
    launchQuestEditorForActiveQuest,
    refreshQuestSaveStateUI,
    saveQuestStateFromNow,
    clearQuestSaveState,
    launchQuestInMode,
    getQuestSaveStateData: () => currentData.questSaveState,
    getQuestSaveSnapshots: () => currentData.questSaveSnapshots
  };

  window._tabletopHeroEditor = {
    getActiveHero,
    getHeroClass,
    getHeroWeapon,
    getHeroArmor,
    getHeroInventory,
    selectHero,
    saveActiveHeroToKGraph,
    rollHeroAttack,
    rollHeroDefend,
    rollHeroMove,
    addHeroInventoryItem,
    removeHeroInventoryItem
  };

  window._tabletopSpellDraft = {
    ELEMENTAL_DECKS,
    getSpellAllocation: () => currentData.spellAllocation,
    setElfElement,
    getHeroSpells,
    castHeroSpell,
    renderSpellDraftSummaryBadges
  };

  window._tabletopCampaign = {
    getCampaigns,
    getCampaign,
    getActiveCampaignIndex: () => currentData.currentCampaignIndex,
    selectCampaign,
    addCampaign,
    deleteCampaign,
    saveCampaignToKGraph,
    triggerCampaignAutosave,
    serializeCampaignToKGraphNode,
    deserializeCampaignFromKGraphNode,
    switchCampaignSubtab,
    renderCampaignSelectorUI,
    createDefaultCampaignHeroes,
    getActiveQuest,
    getActiveQuestIndex: () => currentData.currentQuestIndex,
    selectQuest,
    addQuest,
    deleteQuest,
    completeQuest,
    resetQuest,
    advanceToNextQuest,
    updateCampaignProgress,
    renderHeaderQuestSelect,
    loadActiveQuestCartridgeInfo,
    renderQuestHeroesReviewGrid,
    launchQuestEditorForActiveQuest,
    refreshQuestSaveStateUI,
    saveQuestStateFromNow,
    clearQuestSaveState,
    launchQuestInMode
  };

  window._tabletopMonsterGrimoire = {
    DREAD_SPELLS,
    getActiveMonster,
    getMonsterSpells,
    addMonsterSpell,
    removeMonsterSpell,
    renderMonsterGrimoire,
    renderMonsterActionScreen,
    rollMonsterAttack,
    rollMonsterDefend,
    rollMonsterMove,
    castMonsterSpell,
    saveActiveMonsterToKGraph
  };

  window._tabletopHeroTrade = {
    tradeHeroItem,
    tradeHeroGold,
    openBetweenQuestsTradeModal,
    closeBetweenQuestsTradeModal,
    renderPartyTradeModal,
    getHeroById,
    getTradeSessionLogs: () => tradeSessionLogs
  };

  window._tabletopCategories = {
    DEFAULT_CATEGORIES,
    HEROQUEST_MONSTER_ARCHETYPES,
    MIDTERMS_2026_MONSTERS,
    MIDTERMS_2026_SPELLS,
    MIDTERMS_2026_DREAD_SPELLS,
    BASE_WEAPONS,
    MIDTERMS_2026_WEAPONS,
    BASE_QUEST_ITEMS,
    MIDTERMS_2026_ITEMS,
    getCategories,
    addCategory,
    getMonstersByCategory,
    getSpellsByCategory,
    getDreadSpellsByCategory,
    getWeaponsByCategory,
    getItemsByCategory,
    setMonsterCategoryFilter,
    setSpellItemCategoryFilter,
    addCustomSpell,
    addCustomWeapon,
    addCustomItem,
    syncCategoryCatalogsFromKGraph,
    renderCategoryControlsUI
  };
}

// ==========================================
// UNIVERSAL RESIZABLE COLUMN SEPARATORS ACROSS ALL TABS
// ==========================================
const COLUMN_RESIZER_STORAGE_KEY = "robos.tabletop.colResizers.v1";

const DEFAULT_COLUMN_RESIZER_CONFIGS = {
  "split-campaign-quests": {
    resizerId: "split-campaign-quests",
    tabId: "tab-quest",
    subtabId: "subtab-campaign-quests",
    mode: "split",
    defaultLeftPx: 280,
    minLeftPx: 180,
    maxLeftPx: 640,
    defaultGridTemplate: "var(--split-left-width, 280px) 12px minmax(260px, 1fr)"
  },
  "grid-quest-metadata-briefing": {
    resizerId: "grid-quest-metadata-briefing",
    tabId: "tab-quest",
    subtabId: "subtab-campaign-quests",
    mode: "two-col",
    defaultLeftRatio: 50,
    minRatio: 20,
    maxRatio: 80,
    defaultGridTemplate: "minmax(220px, 1fr) 12px minmax(220px, 1fr)"
  },
  "grid-quest-save-overview": {
    resizerId: "grid-quest-save-overview",
    tabId: "tab-quest",
    subtabId: "subtab-campaign-quests",
    mode: "split",
    defaultLeftPx: 340,
    minLeftPx: 200,
    maxLeftPx: 680,
    defaultGridTemplate: "minmax(260px, 360px) 10px minmax(260px, 1fr)"
  },
  "grid-quest-save-collections": {
    resizerId: "grid-quest-save-collections",
    tabId: "tab-quest",
    subtabId: "subtab-campaign-quests",
    mode: "two-col",
    defaultLeftRatio: 50,
    minRatio: 20,
    maxRatio: 80,
    defaultGridTemplate: "minmax(200px, 1fr) 10px minmax(200px, 1fr)"
  },
  "split-campaign-heroes": {
    resizerId: "split-campaign-heroes",
    tabId: "tab-quest",
    subtabId: "subtab-campaign-heroes",
    mode: "split",
    defaultLeftPx: 280,
    minLeftPx: 180,
    maxLeftPx: 640,
    defaultGridTemplate: "var(--split-left-width, 280px) 12px minmax(260px, 1fr)"
  },
  "split-monsters": {
    resizerId: "split-monsters",
    tabId: "tab-monsters",
    mode: "split",
    defaultLeftPx: 280,
    minLeftPx: 180,
    maxLeftPx: 640,
    defaultGridTemplate: "var(--split-left-width, 280px) 12px minmax(260px, 1fr)"
  },
  "split-classes": {
    resizerId: "split-classes",
    tabId: "tab-classes",
    mode: "split",
    defaultLeftPx: 280,
    minLeftPx: 180,
    maxLeftPx: 640,
    defaultGridTemplate: "var(--split-left-width, 280px) 12px minmax(260px, 1fr)"
  },
  "grid-spells-weapons": {
    resizerId: "grid-spells-weapons",
    tabId: "tab-spells",
    mode: "two-col",
    defaultLeftRatio: 50,
    minRatio: 20,
    maxRatio: 80,
    defaultGridTemplate: "minmax(220px, 1fr) 12px minmax(220px, 1fr)"
  },
  "grid-hero-trade": {
    resizerId: "grid-hero-trade",
    tabId: "modal-between-quests-trade",
    mode: "two-col",
    defaultLeftRatio: 50,
    minRatio: 20,
    maxRatio: 80,
    defaultGridTemplate: "minmax(220px, 1fr) 10px minmax(220px, 1fr)"
  }
};

const columnResizerState = {};

function ensureDefaultColumnResizerState() {
  Object.keys(DEFAULT_COLUMN_RESIZER_CONFIGS).forEach((id) => {
    if (!columnResizerState[id]) {
      const cfg = DEFAULT_COLUMN_RESIZER_CONFIGS[id];
      columnResizerState[id] = {
        resizerId: id,
        tabId: cfg.tabId,
        subtabId: cfg.subtabId || null,
        mode: cfg.mode,
        leftPx: cfg.defaultLeftPx || null,
        leftRatio: cfg.defaultLeftRatio || 50,
        rightRatio: cfg.defaultLeftRatio ? +(100 - cfg.defaultLeftRatio).toFixed(2) : 50,
        gridTemplateColumns: cfg.defaultGridTemplate,
        isCustom: false
      };
    }
  });
}

ensureDefaultColumnResizerState();

function getColumnResizerState(resizerId = null) {
  ensureDefaultColumnResizerState();
  if (resizerId) {
    return columnResizerState[resizerId] || null;
  }
  return { ...columnResizerState };
}

function saveColumnResizerStateToStorage() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(COLUMN_RESIZER_STORAGE_KEY, JSON.stringify(columnResizerState));
    }
  } catch (_) {}
}

function applyColumnResizerStateToDOM(resizerId) {
  if (typeof document === "undefined") return;
  const state = columnResizerState[resizerId];
  if (!state) return;

  const resizerEl = document.querySelector(`.col-resizer[data-resizer-id="${resizerId}"]`);
  const container = resizerEl?.parentElement || document.querySelector(`[data-resizer-container="${resizerId}"]`);
  if (!container) return;

  if (!state.isCustom) {
    if (state.mode === "split") {
      container.style.removeProperty("--split-left-width");
    }
    container.style.gridTemplateColumns = state.gridTemplateColumns || "";
    return;
  }

  if (state.mode === "split" && state.leftPx) {
    container.style.setProperty("--split-left-width", `${Math.round(state.leftPx)}px`);
    container.style.gridTemplateColumns = `${Math.round(state.leftPx)}px 12px minmax(240px, 1fr)`;
  } else if (state.mode === "two-col" && typeof state.leftRatio === "number") {
    const leftR = Math.max(15, Math.min(85, state.leftRatio));
    const rightR = +(100 - leftR).toFixed(2);
    container.style.setProperty("--col-left-fr", `${leftR.toFixed(2)}fr`);
    container.style.setProperty("--col-right-fr", `${rightR.toFixed(2)}fr`);
    container.style.gridTemplateColumns = `minmax(160px, ${leftR.toFixed(2)}fr) 12px minmax(160px, ${rightR.toFixed(2)}fr)`;
  } else if (state.gridTemplateColumns) {
    container.style.gridTemplateColumns = state.gridTemplateColumns;
  }
}

function resizeColumnSeparator(resizerId, deltaPx = 0, containerWidthPx = 1000) {
  ensureDefaultColumnResizerState();
  const cfg = DEFAULT_COLUMN_RESIZER_CONFIGS[resizerId] || {
    resizerId,
    mode: "two-col",
    defaultLeftRatio: 50,
    minRatio: 15,
    maxRatio: 85,
    defaultGridTemplate: "minmax(120px, 1fr) 10px minmax(120px, 1fr)"
  };
  if (!columnResizerState[resizerId]) {
    columnResizerState[resizerId] = {
      resizerId,
      tabId: cfg.tabId || "tab-quest",
      mode: cfg.mode,
      leftPx: cfg.defaultLeftPx || 280,
      leftRatio: cfg.defaultLeftRatio || 50,
      rightRatio: 50,
      gridTemplateColumns: cfg.defaultGridTemplate,
      isCustom: false
    };
  }

  const state = columnResizerState[resizerId];
  const delta = Number(deltaPx) || 0;

  if (state.mode === "split") {
    const basePx = state.leftPx || cfg.defaultLeftPx || 280;
    const minPx = cfg.minLeftPx || 180;
    const maxPx = cfg.maxLeftPx || Math.max(360, containerWidthPx - 260);
    const nextPx = Math.max(minPx, Math.min(maxPx, Math.round(basePx + delta)));
    state.leftPx = nextPx;
    state.gridTemplateColumns = `${nextPx}px 12px minmax(240px, 1fr)`;
    state.isCustom = true;
  } else {
    const usableW = Math.max(300, (Number(containerWidthPx) || 1000) - 12);
    const curRatio = typeof state.leftRatio === "number" ? state.leftRatio : (cfg.defaultLeftRatio || 50);
    const deltaPct = (delta / usableW) * 100;
    const minR = cfg.minRatio || 15;
    const maxR = cfg.maxRatio || 85;
    const nextLeftRatio = +Math.max(minR, Math.min(maxR, curRatio + deltaPct)).toFixed(2);
    const nextRightRatio = +(100 - nextLeftRatio).toFixed(2);
    state.leftRatio = nextLeftRatio;
    state.rightRatio = nextRightRatio;
    state.gridTemplateColumns = `minmax(160px, ${nextLeftRatio}fr) 12px minmax(160px, ${nextRightRatio}fr)`;
    state.isCustom = true;
  }

  applyColumnResizerStateToDOM(resizerId);
  saveColumnResizerStateToStorage();
  return { ...state };
}

function resetColumnSeparator(resizerId) {
  ensureDefaultColumnResizerState();
  const cfg = DEFAULT_COLUMN_RESIZER_CONFIGS[resizerId];
  if (!cfg) return null;
  columnResizerState[resizerId] = {
    resizerId,
    tabId: cfg.tabId,
    subtabId: cfg.subtabId || null,
    mode: cfg.mode,
    leftPx: cfg.defaultLeftPx || null,
    leftRatio: cfg.defaultLeftRatio || 50,
    rightRatio: cfg.defaultLeftRatio ? +(100 - cfg.defaultLeftRatio).toFixed(2) : 50,
    gridTemplateColumns: cfg.defaultGridTemplate,
    isCustom: false
  };
  applyColumnResizerStateToDOM(resizerId);
  saveColumnResizerStateToStorage();
  return { ...columnResizerState[resizerId] };
}

function initMultiColumnRowResizer(rowEl, rowIndex) {
  if (!rowEl || rowEl.dataset.inlineResizerInit === "1") return;
  const colChildren = Array.from(rowEl.children).filter(
    (ch) => !ch.classList.contains("col-resizer") && ch.style.display !== "none"
  );
  if (colChildren.length < 2) return;

  rowEl.dataset.inlineResizerInit = "1";
  const allDirectCols = Array.from(rowEl.children).filter((ch) => !ch.classList.contains("col-resizer"));
  if (allDirectCols.length < 2) return;

  // Insert a .col-resizer between each adjacent pair of columns in the row
  for (let i = 0; i < allDirectCols.length - 1; i++) {
    const colA = allDirectCols[i];
    const colB = allDirectCols[i + 1];
    const resizer = document.createElement("div");
    const rId = `inline-row-${rowIndex}-col-${i}`;
    resizer.className = "col-resizer col-resizer-inline";
    resizer.dataset.resizerId = rId;
    resizer.setAttribute("role", "separator");
    resizer.setAttribute("aria-orientation", "vertical");
    resizer.title = "Drag to resize columns (double-click to reset)";
    rowEl.insertBefore(resizer, colB);

    bindInlinePairResizer(rowEl, resizer, colA, colB, rId);
  }

  syncMultiColumnRowTemplate(rowEl);
}

function syncMultiColumnRowTemplate(rowEl) {
  if (!rowEl) return;
  const children = Array.from(rowEl.children);
  const cols = children.filter((c) => !c.classList.contains("col-resizer"));
  const resizers = children.filter((c) => c.classList.contains("col-resizer"));

  // Hide resizer if either adjacent column is hidden
  for (let i = 0; i < resizers.length; i++) {
    const leftVisible = cols[i] && cols[i].style.display !== "none";
    const rightVisible = cols[i + 1] && cols[i + 1].style.display !== "none";
    resizers[i].style.display = leftVisible && rightVisible ? "flex" : "none";
  }

  const tracks = [];
  children.forEach((ch) => {
    if (ch.style.display === "none") return;
    if (ch.classList.contains("col-resizer")) {
      tracks.push("10px");
    } else {
      const w = parseFloat(ch.dataset.colWeight || "1") || 1;
      tracks.push(`minmax(70px, ${w.toFixed(3)}fr)`);
    }
  });
  if (tracks.length > 0) {
    rowEl.style.gap = "0px";
    rowEl.style.gridTemplateColumns = tracks.join(" ");
  }
}

function bindInlinePairResizer(rowEl, resizerEl, colA, colB, resizerId) {
  if (!colA.dataset.colWeight) colA.dataset.colWeight = "1";
  if (!colB.dataset.colWeight) colB.dataset.colWeight = "1";

  resizerEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    Array.from(rowEl.children).forEach((ch) => {
      if (!ch.classList.contains("col-resizer")) ch.dataset.colWeight = "1";
    });
    syncMultiColumnRowTemplate(rowEl);
  });

  resizerEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const rectA = colA.getBoundingClientRect();
    const rectB = colB.getBoundingClientRect();
    const pairWidth = Math.max(140, rectA.width + rectB.width);
    const weightA = parseFloat(colA.dataset.colWeight || "1") || 1;
    const weightB = parseFloat(colB.dataset.colWeight || "1") || 1;
    const weightSum = weightA + weightB;

    resizerEl.classList.add("is-resizing");
    document.body?.classList.add("is-col-resizing");

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const newWidthA = Math.max(70, Math.min(pairWidth - 70, rectA.width + dx));
      const newWidthB = pairWidth - newWidthA;
      colA.dataset.colWeight = ((newWidthA / pairWidth) * weightSum).toFixed(4);
      colB.dataset.colWeight = ((newWidthB / pairWidth) * weightSum).toFixed(4);
      syncMultiColumnRowTemplate(rowEl);
    };

    const onUp = () => {
      resizerEl.classList.remove("is-resizing");
      document.body?.classList.remove("is-col-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function initColumnResizers() {
  ensureDefaultColumnResizerState();
  if (typeof document === "undefined") return getColumnResizerState();

  // Restore saved column sizes from localStorage if available
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(COLUMN_RESIZER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          Object.keys(parsed).forEach((k) => {
            if (columnResizerState[k] && parsed[k]?.isCustom) {
              columnResizerState[k] = { ...columnResizerState[k], ...parsed[k] };
            }
          });
        }
      }
    }
  } catch (_) {}

  // 1. Bind all explicit .col-resizer[data-resizer-id] handles across all tabs & modals
  const resizerEls = document.querySelectorAll(".col-resizer[data-resizer-id]");
  resizerEls.forEach((resizerEl) => {
    const resizerId = resizerEl.dataset.resizerId;
    if (!resizerId || resizerEl.dataset.boundResizer === "1") return;
    resizerEl.dataset.boundResizer = "1";

    applyColumnResizerStateToDOM(resizerId);

    resizerEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      resetColumnSeparator(resizerId);
      setStatus("Reset column layout to default width.");
    });

    resizerEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const container = resizerEl.parentElement;
      if (!container) return;

      const prevCol = resizerEl.previousElementSibling;
      const nextCol = resizerEl.nextElementSibling;
      if (!prevCol || !nextCol) return;

      const startX = e.clientX;
      const containerRect = container.getBoundingClientRect();
      const prevRect = prevCol.getBoundingClientRect();
      const startLeftPx = prevRect.width || columnResizerState[resizerId]?.leftPx || 280;
      const usableW = Math.max(320, containerRect.width - 12);
      const startRatio = containerRect.width > 0
        ? (prevRect.width / usableW) * 100
        : (columnResizerState[resizerId]?.leftRatio || 50);

      resizerEl.classList.add("is-resizing");
      document.body?.classList.add("is-col-resizing");

      const onMouseMove = (moveEvt) => {
        const dx = moveEvt.clientX - startX;
        const cfg = DEFAULT_COLUMN_RESIZER_CONFIGS[resizerId] || { mode: "two-col" };
        if (cfg.mode === "split") {
          const minPx = cfg.minLeftPx || 180;
          const maxPx = Math.min(cfg.maxLeftPx || 680, Math.max(minPx + 40, containerRect.width - 260));
          const newLeftPx = Math.max(minPx, Math.min(maxPx, Math.round(startLeftPx + dx)));
          columnResizerState[resizerId] = {
            ...columnResizerState[resizerId],
            leftPx: newLeftPx,
            gridTemplateColumns: `${newLeftPx}px 12px minmax(240px, 1fr)`,
            isCustom: true
          };
        } else {
          const minR = cfg.minRatio || 15;
          const maxR = cfg.maxRatio || 85;
          const newLeftRatio = +Math.max(minR, Math.min(maxR, startRatio + (dx / usableW) * 100)).toFixed(2);
          const newRightRatio = +(100 - newLeftRatio).toFixed(2);
          columnResizerState[resizerId] = {
            ...columnResizerState[resizerId],
            leftRatio: newLeftRatio,
            rightRatio: newRightRatio,
            gridTemplateColumns: `minmax(160px, ${newLeftRatio}fr) 12px minmax(160px, ${newRightRatio}fr)`,
            isCustom: true
          };
        }
        applyColumnResizerStateToDOM(resizerId);
      };

      const onMouseUp = () => {
        resizerEl.classList.remove("is-resizing");
        document.body?.classList.remove("is-col-resizing");
        saveColumnResizerStateToStorage();
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });
  });

  // 2. Enhance all multi-column .form-row:not(.check-row) and .action-modules-grid across all tabs
  const inlineRows = document.querySelectorAll(".form-row:not(.check-row), .action-modules-grid");
  inlineRows.forEach((rowEl, idx) => {
    initMultiColumnRowResizer(rowEl, idx);
  });

  return getColumnResizerState();
}

// Initialize on DOM ready
if (typeof window !== "undefined") {
  window._tabletopColumnResizers = {
    DEFAULT_COLUMN_RESIZER_CONFIGS,
    initColumnResizers,
    resizeColumnSeparator,
    resetColumnSeparator,
    getColumnResizerState
  };
  window.addEventListener("DOMContentLoaded", initKGraphData);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FURNITURE_ASSET_MAP,
    TILE_ASSET_MAP,
    getFurnitureImage,
    getTileImage,
    tradeHeroItem,
    tradeHeroGold,
    openBetweenQuestsTradeModal,
    closeBetweenQuestsTradeModal,
    getHeroById,
    DEFAULT_CATEGORIES,
    HEROQUEST_MONSTER_ARCHETYPES,
    MIDTERMS_2026_HEROES,
    MIDTERMS_2026_MONSTERS,
    MIDTERMS_2026_SPELLS,
    MIDTERMS_2026_DREAD_SPELLS,
    BASE_WEAPONS,
    MIDTERMS_2026_WEAPONS,
    BASE_QUEST_ITEMS,
    MIDTERMS_2026_ITEMS,
    getCategories,
    addCategory,
    getAllHeroesCatalog,
    getHeroesByCategory,
    setHeroCategoryFilter,
    applyHeroPackToActiveCampaign,
    resolveHeroAssetKey,
    getHeroTokenUrl,
    getHeroPortraitUrl,
    updateHeroPortraitCardPreview,
    getMonstersByCategory,
    getSpellsByCategory,
    getDreadSpellsByCategory,
    getWeaponsByCategory,
    getItemsByCategory,
    setMonsterCategoryFilter,
    setSpellItemCategoryFilter,
    addCustomSpell,
    addCustomWeapon,
    addCustomItem,
    getCampaigns,
    getCampaign,
    getActiveQuest,
    selectCampaign,
    addCampaign,
    deleteCampaign,
    saveCampaignToKGraph,
    triggerCampaignAutosave,
    serializeCampaignToKGraphNode,
    deserializeCampaignFromKGraphNode,
    selectQuest,
    addQuest,
    deleteQuest,
    completeQuest,
    resetQuest,
    renderCampaignQuestsList,
    switchCampaignSubtab,
    createDefaultCampaignHeroes,
    HERO_CLASSES,
    ENEMY_CLASSES,
    DEFAULT_RPG_CLASSES,
    initClassesCatalog,
    getClasses,
    getHeroClasses,
    getEnemyClasses,
    getClassByIdOrName,
    getActiveClass,
    selectClass,
    applyClassToMonster,
    applyClassToHero,
    createCustomMonsterFromClass,
    DEFAULT_SAVE_STATE_SCHEMA,
    normalizeSaveStateToKGraphInRenderer,
    renderQuestStateScreenshotToCanvas,
    formatKGraphTelemetryMetricValue,
    loadActiveQuestCartridgeInfo,
    renderQuestHeroesReviewGrid,
    launchQuestEditorForActiveQuest,
    refreshQuestSaveStateUI,
    saveQuestStateFromNow,
    clearQuestSaveState,
    launchQuestInMode,
    DEFAULT_COLUMN_RESIZER_CONFIGS,
    initColumnResizers,
    resizeColumnSeparator,
    resetColumnSeparator,
    getColumnResizerState,
    DEFAULT_STUDIO_MAP_CONFIGS,
    switchMapConfiguration
  };
}


