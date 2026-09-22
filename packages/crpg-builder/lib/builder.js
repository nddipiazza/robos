'use strict';

const fs = require('fs');
const path = require('path');
const { FLARE_CREATURE_SPRITES, FLARE_TILESETS, FLARE_ICONS } = require('./flare-asset-catalog');
const { SRD_CLASSES, SRD_SPELLS, SRD_MONSTERS, SRD_EQUIPMENT } = require('./srd-data');

class CRPGGameBuilder {
  constructor(options = {}) {
    this.options = options;
    this.kgraphPackagePath = options.kgraphPackagePath || path.resolve(__dirname, '../../../.robos/kgraphs/crpg/package.jsonld');
    this.targetDir = options.targetDir || path.resolve(__dirname, '../../../games/crpg-realm');
  }

  loadGraph() {
    if (!fs.existsSync(this.kgraphPackagePath)) {
      throw new Error(`CRPG KGraph package not found: ${this.kgraphPackagePath}`);
    }
    const raw = JSON.parse(fs.readFileSync(this.kgraphPackagePath, 'utf8'));
    return raw['robos:nodes'] || [];
  }

  validateGraph(nodes) {
    const report = { valid: true, errors: [], warnings: [] };
    const byType = (type) => nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return types.includes(type);
    });

    const games = byType('robos:CRPGGame');
    if (games.length === 0) report.errors.push('No robos:CRPGGame root node found');

    const zones = byType('robos:CRPGMapZone');
    const zoneIds = new Set(zones.map(z => z['@id']));

    for (const game of games) {
      if (!zoneIds.has(game['robos:startingZone'])) {
        report.errors.push(`Game startingZone '${game['robos:startingZone']}' does not match any known CRPGMapZone`);
      }
    }

    const monsters = byType('robos:CRPGMonster');
    for (const m of monsters) {
      const spriteRef = m['robos:spriteAssetRef'];
      if (!spriteRef) {
        report.errors.push(`Monster ${m['@id']} is missing robos:spriteAssetRef`);
      } else {
        const key = spriteRef.replace('flare:creature:', '');
        if (!FLARE_CREATURE_SPRITES[key]) {
          report.warnings.push(`Monster ${m['@id']} references unknown sprite '${spriteRef}', will use skeleton fallback`);
        }
      }
    }

    report.valid = report.errors.length === 0;
    return report;
  }

  generateDataStore(nodes) {
    const dataDir = path.join(this.targetDir, 'data/v1');
    fs.mkdirSync(dataDir, { recursive: true });

    const byType = (type) => nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return types.includes(type);
    });

    // 1. game.json
    const gameNode = byType('robos:CRPGGame')[0] || {};
    const gameData = {
      title: gameNode['dcterms:title'] || 'Realm of Heroes: A Night Without Memory',
      ruleset: gameNode['robos:ruleset'] || 'dnd5e',
      combatModel: gameNode['robos:combatModel'] || 'real-time-with-pause',
      startingZone: gameNode['robos:startingZone'] || 'urn:robos:crpg:zone:homestead',
      maxPartySize: gameNode['robos:maxPartySize'] || 4,
      assetPackage: gameNode['robos:assetPackage'] || 'flare-game'
    };
    fs.writeFileSync(path.join(dataDir, 'game.json'), JSON.stringify(gameData, null, 2), 'utf8');

    // 2. classes.json
    const classNodes = byType('robos:CRPGClass');
    const classesData = classNodes.map(c => {
      const id = c['@id'].split(':').pop();
      const srd = SRD_CLASSES.find(sc => sc.id === id) || {};
      return {
        id,
        title: c['dcterms:title'],
        hitDie: c['robos:hitDie'] || srd.hitDie || 'd8',
        primaryAbility: c['robos:primaryAbility'] || srd.primaryAbility || 'STR',
        savingThrows: c['robos:savingThrows'] || srd.savingThrows || ['STR'],
        baseHpAtLevel1: c['robos:baseHpAtLevel1'] || srd.baseHpAtLevel1 || 8,
        proficiencies: srd.proficiencies || []
      };
    });
    fs.writeFileSync(path.join(dataDir, 'classes.json'), JSON.stringify(classesData, null, 2), 'utf8');

    // 3. npcs.json
    const npcNodes = byType('robos:CRPGNPC');
    const npcsData = npcNodes.map(n => ({
      id: n['@id'].split(':').pop(),
      urn: n['@id'],
      title: n['dcterms:title'],
      dialogueTree: (n['robos:dialogueTree'] || '').split(':').pop(),
      location: (n['robos:location'] || '').split(':').pop()
    }));
    fs.writeFileSync(path.join(dataDir, 'npcs.json'), JSON.stringify(npcsData, null, 2), 'utf8');

    // 4. monsters.json
    const monsterNodes = byType('robos:CRPGMonster');
    const monstersData = monsterNodes.map(m => {
      const id = m['@id'].split(':').pop();
      const srd = SRD_MONSTERS.find(sm => sm.id === id || sm.id.replace(/_/g, '-') === id) || {};
      const spriteKey = (m['robos:spriteAssetRef'] || '').replace('flare:creature:', '');
      const spriteMeta = FLARE_CREATURE_SPRITES[spriteKey] || FLARE_CREATURE_SPRITES.skeleton;

      return {
        id,
        title: m['dcterms:title'],
        challengeRating: m['robos:challengeRating'] || srd.challengeRating || '1/4',
        armorClass: m['robos:armorClass'] || srd.armorClass || 10,
        hitPoints: m['robos:hitPoints'] || srd.hitPoints || 10,
        speed: m['robos:speed'] || srd.speed || 30,
        abilities: m['robos:abilities'] || srd.abilities || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        attacks: srd.attacks || [{ name: 'Attack', attackBonus: 3, damage: '1d6', damageType: 'physical', range: 5 }],
        sprite: {
          assetRef: m['robos:spriteAssetRef'] || 'flare:creature:skeleton',
          frameWidth: spriteMeta.frameWidth,
          frameHeight: spriteMeta.frameHeight,
          directions: spriteMeta.directions,
          animations: spriteMeta.animations
        }
      };
    });
    fs.writeFileSync(path.join(dataDir, 'monsters.json'), JSON.stringify(monstersData, null, 2), 'utf8');

    // 5. spells.json
    const spellNodes = byType('robos:CRPGSpell');
    const spellsData = spellNodes.map(s => {
      const id = s['@id'].split(':').pop();
      const srd = SRD_SPELLS.find(ss => ss.id.replace(/_/g, '-') === id || ss.id === id) || {};
      return {
        id,
        title: s['dcterms:title'],
        level: s['robos:spellLevel'] !== undefined ? s['robos:spellLevel'] : srd.level || 1,
        school: s['robos:magicSchool'] || srd.school || 'Evocation',
        castingTime: s['robos:castingTime'] || srd.castingTime || '1 action',
        range: s['robos:range'] || srd.range || '60 feet',
        damageFormula: s['robos:damageFormula'] || srd.damageFormula || '1d6',
        damageType: s['robos:damageType'] || srd.damageType || 'force',
        icon: srd.icon || 'assets/icons/spells/magic_missile.png'
      };
    });
    fs.writeFileSync(path.join(dataDir, 'spells.json'), JSON.stringify(spellsData, null, 2), 'utf8');

    // 6. items.json
    const itemNodes = byType('robos:CRPGItem');
    const itemsData = itemNodes.map(i => {
      const id = i['@id'].split(':').pop();
      const srd = SRD_EQUIPMENT.find(se => se.id.replace(/_/g, '-') === id || se.id === id) || {};
      return {
        id,
        title: i['dcterms:title'],
        category: i['robos:itemCategory'] || srd.itemCategory || 'weapon',
        equipSlot: i['robos:equipSlot'] || srd.equipSlot || 'main_hand',
        damageDice: i['robos:damageDice'] || srd.damageDice || null,
        acBonus: i['robos:acBonus'] || srd.acBonus || 0,
        cost: i['robos:cost'] || srd.cost || 10,
        icon: srd.icon || 'assets/icons/weapons/longsword.png'
      };
    });
    fs.writeFileSync(path.join(dataDir, 'items.json'), JSON.stringify(itemsData, null, 2), 'utf8');

    // 7. zones.json
    const zoneNodes = byType('robos:CRPGMapZone');
    const zonesData = zoneNodes.map(z => ({
      id: z['@id'].split(':').pop(),
      urn: z['@id'],
      title: z['dcterms:title'],
      zoneType: z['robos:zoneType'] || 'interior',
      scenePath: z['robos:scenePath'] || 'scenes/Homestead.tscn',
      ambientAudio: z['robos:ambientAudio'] || 'assets/audio/homestead_ambience.ogg',
      tilesetRef: z['robos:tilesetRef'] || 'flare:tileset:dungeon_stone'
    }));
    fs.writeFileSync(path.join(dataDir, 'zones.json'), JSON.stringify(zonesData, null, 2), 'utf8');

    // 8. encounters.json
    const encounterNodes = byType('robos:CRPGEncounterTable');
    const encountersData = encounterNodes.map(e => ({
      id: e['@id'].split(':').pop(),
      title: e['dcterms:title'],
      minLevel: e['robos:minLevel'] || 1,
      maxLevel: e['robos:maxLevel'] || 3,
      entries: e['robos:encounterEntries'] || []
    }));
    fs.writeFileSync(path.join(dataDir, 'encounters.json'), JSON.stringify(encountersData, null, 2), 'utf8');

    // 9. quests.json
    const questNodes = byType('robos:CRPGQuest');
    const questsData = questNodes.map(q => ({
      id: q['@id'].split(':').pop(),
      title: q['dcterms:title'],
      stages: q['robos:questStages'] || []
    }));
    fs.writeFileSync(path.join(dataDir, 'quests.json'), JSON.stringify(questsData, null, 2), 'utf8');

    // 10. dialogue.json
    const dialogueNodes = byType('robos:CRPGDialogueTree');
    const dialogueData = dialogueNodes.map(d => {
      const id = d['@id'].split(':').pop();
      let nodesMap = {};

      if (id === 'partner-confrontation') {
        nodesMap = {
          node_wake: {
            speaker: 'Elora',
            text: "You're finally awake! Where in the gods' names were you last night? You were called to the keep at midnight, and stumbled in before dawn covered in ash and blood! What happened?!",
            choices: [
              { text: "I... I honestly don't remember anything after midnight.", nextNode: 'node_amnesia' },
              { text: "Ash and blood?! Is anyone harmed in the village?", nextNode: 'node_danger' },
              { text: "Calm down. Let me grab my service blade from the footlocker.", nextNode: 'node_arm_up' }
            ]
          },
          node_amnesia: {
            speaker: 'Elora',
            text: "Amnesia?! You looked like a ghost when you staggered through the door! Grab your sword from the footlocker and check on Captain Malakor at the garrison!",
            choices: [{ text: "I will. Stay inside and bolt the door.", nextNode: 'node_exit' }]
          },
          node_danger: {
            speaker: 'Elora',
            text: "The village was silent, but strange howling echoed from the woods. Please, take your blade and be careful.",
            choices: [{ text: "I'm heading out now.", nextNode: 'node_exit' }]
          },
          node_arm_up: {
            speaker: 'Elora',
            text: "Your blade is in your footlocker, along with a healing draught. Find out what madness gripped the keep last night.",
            choices: [{ text: "Understood.", nextNode: 'node_exit' }]
          },
          node_exit: {
            speaker: 'Elora',
            text: "May the light watch over you, Lieutenant.",
            choices: []
          }
        };
      } else if (id === 'blacksmith-inquiry') {
        nodesMap = {
          node_blacksmith_start: {
            speaker: 'Blacksmith Brand',
            text: "Lieutenant! By the forge, you're alive! What in the Hells occurred at the garrison last night?!",
            choices: [
              { text: "Tell me what you saw, Brand.", nextNode: 'node_tell_me' },
              { text: "The garrison gates are barred. Can you help me enter?", nextNode: 'node_give_key' }
            ]
          },
          node_tell_me: {
            speaker: 'Blacksmith Brand',
            text: "Captain Malakor's unit hauled a warded sarcophagus from the crypts past midnight. You were with them, Lieutenant! But your eyes were glazed over with violet light! Then screams came from the keep...",
            choices: [{ text: "Give me the side-gate key. I need to get inside.", nextNode: 'node_give_key' }]
          },
          node_give_key: {
            speaker: 'Blacksmith Brand',
            text: "Here! Take my side-gate maintenance key. The main portcullis is deadlocked. Be careful in there... the guards didn't sound human anymore.",
            choices: [{ text: "Thank you, Brand. Stay inside.", nextNode: 'node_farewell' }]
          },
          node_farewell: {
            speaker: 'Blacksmith Brand',
            text: "Drive the darkness back, Lieutenant!",
            choices: []
          }
        };
      } else if (id === 'malakor-showdown') {
        nodesMap = {
          node_malakor_start: {
            speaker: 'Captain Malakor',
            text: "Ah... my faithful Lieutenant returns. Do you remember now? The Azrath relic has opened my eyes! Together we shall shatter the old order!",
            choices: [
              { text: "You've been corrupted by the vault, Captain. Stand down!", nextNode: 'node_defiance' },
              { text: "What was inside that sarcophagus?!", nextNode: 'node_lore' }
            ]
          },
          node_lore: {
            speaker: 'Captain Malakor',
            text: "The primordial slumber of ancient gods! It chose me as its vessel—and you were the one who broke the first seal!",
            choices: [{ text: "Then I will be the one who ends this madness!", nextNode: 'node_fight' }]
          },
          node_defiance: {
            speaker: 'Captain Malakor',
            text: "Disobedience is treason in the Royal Guard, Lieutenant. Perish with the weak!",
            choices: [{ text: "[Draw Weapon] To arms!", nextNode: 'node_fight' }]
          },
          node_fight: {
            speaker: 'Captain Malakor',
            text: "Death to all who defy the Void!",
            choices: []
          }
        };
      }

      return {
        id,
        title: d['dcterms:title'],
        rootNode: d['robos:rootNode'] || Object.keys(nodesMap)[0] || 'node_start',
        nodes: nodesMap
      };
    });
    fs.writeFileSync(path.join(dataDir, 'dialogue.json'), JSON.stringify(dialogueData, null, 2), 'utf8');

    return { dataDir, count: nodes.length };
  }

  generateSchemas() {
    const schemaDir = path.join(this.targetDir, 'schemas/v1');
    fs.mkdirSync(schemaDir, { recursive: true });

    const masterSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'RobOS CRPG Master Data Schema',
      type: 'object',
      required: ['game', 'classes', 'monsters', 'spells', 'items', 'zones'],
      properties: {
        game: { $ref: 'game.schema.json' },
        classes: { type: 'array', items: { $ref: 'classes.schema.json' } },
        npcs: { type: 'array', items: { $ref: 'npcs.schema.json' } },
        monsters: { type: 'array', items: { $ref: 'monsters.schema.json' } },
        spells: { type: 'array', items: { $ref: 'spells.schema.json' } },
        items: { type: 'array', items: { $ref: 'items.schema.json' } },
        zones: { type: 'array', items: { $ref: 'zones.schema.json' } }
      }
    };
    fs.writeFileSync(path.join(schemaDir, 'crpg_game_v1.schema.json'), JSON.stringify(masterSchema, null, 2), 'utf8');
  }

  generateGDScriptModels() {
    const srcDir = path.join(this.targetDir, 'src/generated/v1');
    fs.mkdirSync(srcDir, { recursive: true });

    // MonsterData.gd
    const monsterDataCode = `# Auto-generated by RobOS cRPG Game Builder
class_name MonsterData
extends RefCounted

var id: String = ""
var title: String = ""
var challenge_rating: String = "1/4"
var armor_class: int = 10
var hit_points: int = 10
var speed: int = 30
var abilities: Dictionary = {}
var attacks: Array = []
var sprite_config: Dictionary = {}

static func from_dict(d: Dictionary) -> MonsterData:
\tvar m = MonsterData.new()
\tm.id = str(d.get("id", ""))
\tm.title = str(d.get("title", ""))
\tm.challenge_rating = str(d.get("challengeRating", "1/4"))
\tm.armor_class = int(d.get("armorClass", 10))
\tm.hit_points = int(d.get("hitPoints", 10))
\tm.speed = int(d.get("speed", 30))
\tm.abilities = d.get("abilities", {})
\tm.attacks = d.get("attacks", [])
\tm.sprite_config = d.get("sprite", {})
\treturn m
`;
    fs.writeFileSync(path.join(srcDir, 'MonsterData.gd'), monsterDataCode, 'utf8');

    // SpellData.gd
    const spellDataCode = `# Auto-generated by RobOS cRPG Game Builder
class_name SpellData
extends RefCounted

var id: String = ""
var title: String = ""
var level: int = 1
var school: String = "Evocation"
var casting_time: String = "1 action"
var range_str: String = "60 feet"
var damage_formula: String = "1d6"
var damage_type: String = "force"
var icon_path: String = ""

static func from_dict(d: Dictionary) -> SpellData:
\tvar s = SpellData.new()
\ts.id = str(d.get("id", ""))
\ts.title = str(d.get("title", ""))
\ts.level = int(d.get("level", 1))
\ts.school = str(d.get("school", "Evocation"))
\ts.casting_time = str(d.get("castingTime", "1 action"))
\ts.range_str = str(d.get("range", "60 feet"))
\ts.damage_formula = str(d.get("damageFormula", "1d6"))
\ts.damage_type = str(d.get("damageType", "force"))
\ts.icon_path = str(d.get("icon", ""))
\treturn s
`;
    fs.writeFileSync(path.join(srcDir, 'SpellData.gd'), spellDataCode, 'utf8');

    // ItemData.gd
    const itemDataCode = `# Auto-generated by RobOS cRPG Game Builder
class_name ItemData
extends RefCounted

var id: String = ""
var title: String = ""
var category: String = "weapon"
var equip_slot: String = "main_hand"
var damage_dice: String = ""
var ac_bonus: int = 0
var cost: int = 10
var icon_path: String = ""

static func from_dict(d: Dictionary) -> ItemData:
\tvar item = ItemData.new()
\titem.id = str(d.get("id", ""))
\titem.title = str(d.get("title", ""))
\titem.category = str(d.get("category", "weapon"))
\titem.equip_slot = str(d.get("equipSlot", "main_hand"))
\titem.damage_dice = str(d.get("damageDice", ""))
\titem.ac_bonus = int(d.get("acBonus", 0))
\titem.cost = int(d.get("cost", 10))
\titem.icon_path = str(d.get("icon", ""))
\treturn item
`;
    fs.writeFileSync(path.join(srcDir, 'ItemData.gd'), itemDataCode, 'utf8');

    // NPCData.gd
    const npcDataCode = `# Auto-generated by RobOS cRPG Game Builder
class_name NPCData
extends RefCounted

var id: String = ""
var title: String = ""
var dialogue_tree: String = ""
var location: String = ""

static func from_dict(d: Dictionary) -> NPCData:
\tvar n = NPCData.new()
\tn.id = str(d.get("id", ""))
\tn.title = str(d.get("title", ""))
\tn.dialogue_tree = str(d.get("dialogueTree", ""))
\tn.location = str(d.get("location", ""))
\treturn n
`;
    fs.writeFileSync(path.join(srcDir, 'NPCData.gd'), npcDataCode, 'utf8');

    // DataStoreV1.gd (Autoload Singleton)
    const dataStoreCode = `# Auto-generated by RobOS cRPG Game Builder
# Central Data Singleton for CRPG Game Runtime
class_name DataStoreV1
extends Node

var game_config: Dictionary = {}
var classes: Dictionary = {} # id -> Dictionary
var npcs: Dictionary = {} # id -> NPCData
var monsters: Dictionary = {} # id -> MonsterData
var spells: Dictionary = {} # id -> SpellData
var items: Dictionary = {} # id -> ItemData
var zones: Dictionary = {} # id -> Dictionary
var dialogue_trees: Dictionary = {} # id -> Dictionary
var quests: Dictionary = {} # id -> Dictionary

func _ready() -> void:
\tload_all_data()

func load_json(rel_path: String) -> Variant:
\tvar path = "res://" + rel_path
\tif not FileAccess.file_exists(path):
\t\tpush_error("DataStore: File not found: " + path)
\t\treturn null
\tvar file = FileAccess.open(path, FileAccess.READ)
\tvar text = file.get_as_text()
\tvar parsed = JSON.parse_string(text)
\treturn parsed

func load_all_data() -> void:
\tgame_config = load_json("data/v1/game.json")
\t
\tvar class_list = load_json("data/v1/classes.json")
\tif class_list is Array:
\t\tfor c in class_list:
\t\t\tclasses[c["id"]] = c

\tvar npc_list = load_json("data/v1/npcs.json")
\tif npc_list is Array:
\t\tfor n in npc_list:
\t\t\tnpcs[n["id"]] = NPCData.from_dict(n)

\tvar monster_list = load_json("data/v1/monsters.json")
\tif monster_list is Array:
\t\tfor m in monster_list:
\t\t\tmonsters[m["id"]] = MonsterData.from_dict(m)

\tvar spell_list = load_json("data/v1/spells.json")
\tif spell_list is Array:
\t\tfor s in spell_list:
\t\t\tspells[s["id"]] = SpellData.from_dict(s)

\tvar item_list = load_json("data/v1/items.json")
\tif item_list is Array:
\t\tfor i in item_list:
\t\t\titems[i["id"]] = ItemData.from_dict(i)

\tvar zone_list = load_json("data/v1/zones.json")
\tif zone_list is Array:
\t\tfor z in zone_list:
\t\t\tzones[z["id"]] = z

\tvar dial_list = load_json("data/v1/dialogue.json")
\tif dial_list is Array:
\t\tfor d in dial_list:
\t\t\tdialogue_trees[d["id"]] = d

\tvar quest_list = load_json("data/v1/quests.json")
\tif quest_list is Array:
\t\tfor q in quest_list:
\t\t\tquests[q["id"]] = q

\tprint("DataStoreV1: Loaded ", monsters.size(), " monsters, ", spells.size(), " spells, ", items.size(), " items, ", npcs.size(), " npcs.")
`;
    fs.writeFileSync(path.join(srcDir, 'DataStoreV1.gd'), dataStoreCode, 'utf8');
  }

  generateGodotProject() {
    const scenesDir = path.join(this.targetDir, 'scenes');
    const scriptsDir = path.join(this.targetDir, 'scripts');
    const compScenesDir = path.join(scenesDir, 'components');
    fs.mkdirSync(scenesDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(compScenesDir, { recursive: true });

    const writeFileSafe = (filePath, content) => {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
    };

    // 1. project.godot
    const projectContent = `; Engine configuration file.
; RobOS cRPG Generator - Godot 4 GL Compatibility Project

config_version=5

[application]

config/name="Realm of Heroes: A Night Without Memory"
config/description="Early Access Vertical Slice cRPG powered by RobOS Dual-State KGraph"
run/main_scene="res://scenes/CharacterSelect.tscn"
config/features=PackedStringArray("4.3", "GL Compatibility")
config/icon="res://assets/icons/weapons/longsword.png"

[autoload]

DataStore="*res://src/generated/v1/DataStoreV1.gd"
GameState="*res://scripts/GameState.gd"
GameControlServer="*res://scripts/GameControlServer.gd"
AudioManager="*res://scripts/AudioManager.gd"
QAOverlay="*res://scripts/QAOverlay.gd"

[display]

window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"
window/stretch/aspect="keep"

[input]

toggle_pause={
"deadzone": 0.5,
"events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":0,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":32,"physical_keycode":0,"key_label":0,"unicode":32,"echo":false,"script":null)
]
}

[rendering]

renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
`;
    fs.writeFileSync(path.join(this.targetDir, 'project.godot'), projectContent, 'utf8');

    // 2. GameState.gd (Autoload Singleton)
    const gameStateCode = `class_name GameStateSingleton
extends Node

signal quest_advanced(stage: int)
signal inventory_changed
signal hero_damaged(current_hp: int, max_hp: int)

var hero_name: String = "Vance"
var hero_class: String = "fighter"
var hero_hp: int = 12
var hero_max_hp: int = 12
var hero_ac: int = 16
var hero_level: int = 1
var gold: int = 25

var inventory: Array = ["potion-healing"]
var equipped_weapon: String = "service-sword"
var equipped_armor: String = "chain-mail"

var quest_stage: int = 1
var flags: Dictionary = {
\t"partner_conversed": false,
\t"footlocker_looted": false,
\t"village_hounds_slain": false,
\t"blacksmith_conversed": false,
\t"garrison_unlocked": false,
\t"garrison_skirmishers_slain": false,
\t"malakor_slain": false
}

var stats: Dictionary = {
\t"kills": 0,
\t"chests": 0,
\t"damage_dealt": 0
}

func init_hero(p_name: String, p_class: String) -> void:
\thero_name = p_name if p_name.strip_edges() != "" else "Lieutenant Vance"
\thero_class = p_class
\t
\tmatch p_class:
\t\t"fighter":
\t\t\thero_max_hp = 12
\t\t\thero_ac = 16
\t\t\tequipped_weapon = "service-sword"
\t\t\tequipped_armor = "chain-mail"
\t\t"rogue":
\t\t\thero_max_hp = 9
\t\t\thero_ac = 13
\t\t\tequipped_weapon = "dagger"
\t\t\tequipped_armor = "leather-armor"
\t\t"wizard":
\t\t\thero_max_hp = 7
\t\t\thero_ac = 11
\t\t\tequipped_weapon = "quarterstaff"
\t\t\tequipped_armor = "robe"
\t\t"cleric":
\t\t\thero_max_hp = 9
\t\t\thero_ac = 15
\t\t\tequipped_weapon = "mace"
\t\t\tequipped_armor = "chain-mail"
\t\t_:
\t\t\thero_max_hp = 10
\t\t\thero_ac = 12

\thero_hp = hero_max_hp
\tquest_stage = 1
\tflags.clear()
\tstats.kills = 0
\tstats.chests = 0
\tstats.damage_dealt = 0
\tinventory = ["potion-healing"]
\tprint("GameState: Hero initialized -> ", hero_name, " (", hero_class, ") HP=", hero_hp, " AC=", hero_ac)

func has_item(item_id: String) -> bool:
\treturn inventory.has(item_id) or equipped_weapon == item_id or equipped_armor == item_id

func add_item(item_id: String) -> void:
\tinventory.append(item_id)
\tinventory_changed.emit()

func remove_item(item_id: String) -> void:
\tinventory.erase(item_id)
\tinventory_changed.emit()

func add_kill() -> void:
\tstats.kills += 1

func add_chest() -> void:
\tstats.chests += 1

func advance_quest(p_stage: int) -> void:
\tif p_stage > quest_stage:
\t\tquest_stage = p_stage
\t\tquest_advanced.emit(p_stage)
\t\tprint("Quest Advanced to Stage ", p_stage)

func take_damage(amount: int) -> void:
\thero_hp = max(0, hero_hp - amount)
\thero_damaged.emit(hero_hp, hero_max_hp)

func heal(amount: int) -> void:
\thero_hp = min(hero_max_hp, hero_hp + amount)
\thero_damaged.emit(hero_hp, hero_max_hp)
`;
    writeFileSafe(path.join(scriptsDir, 'GameState.gd'), gameStateCode, 'utf8');

    // 3. CombatManager.gd
    const combatManagerCode = `class_name CombatManager
extends Node

signal attack_resolved(attacker_name: String, target_name: String, hit: bool, damage: int)

var is_paused: bool = false

func set_paused(paused: bool) -> void:
\tis_paused = paused

func roll_d20() -> int:
\treturn (randi() % 20) + 1

func execute_attack(attacker_name: String, attack_bonus: int, damage_dice_min: int, damage_dice_max: int, target_name: String, target_ac: int) -> Dictionary:
\tvar d20 = roll_d20()
\tvar is_crit = (d20 == 20)
\tvar is_fumble = (d20 == 1)
\tvar total_attack = d20 + attack_bonus
\tvar is_hit = (d20 == 20) or (d20 != 1 and total_attack >= target_ac)
\tvar damage = 0

\tif is_hit:
\t\tdamage = randi_range(damage_dice_min, damage_dice_max)
\t\tif is_crit:
\t\t\tdamage += randi_range(damage_dice_min, damage_dice_max)

\tattack_resolved.emit(attacker_name, target_name, is_hit, damage)
\treturn {
\t\t"d20": d20,
\t\t"total_attack": total_attack,
\t\t"hit": is_hit,
\t\t"crit": is_crit,
\t\t"damage": damage
\t}
`;
    writeFileSafe(path.join(scriptsDir, 'CombatManager.gd'), combatManagerCode, 'utf8');

    // 4. CharacterSelect scene and script
    const charSelectGd = `extends Control

@onready var name_input = $VBoxContainer/NameEdit
@onready var class_btn_fighter = $VBoxContainer/ClassGrid/BtnFighter
@onready var class_btn_rogue = $VBoxContainer/ClassGrid/BtnRogue
@onready var class_btn_wizard = $VBoxContainer/ClassGrid/BtnWizard
@onready var class_btn_cleric = $VBoxContainer/ClassGrid/BtnCleric
@onready var desc_label = $VBoxContainer/DescLabel
@onready var embark_btn = $VBoxContainer/EmbarkBtn

var selected_class: String = "fighter"

func _ready() -> void:
\tclass_btn_fighter.pressed.connect(func(): select_class("fighter"))
\tclass_btn_rogue.pressed.connect(func(): select_class("rogue"))
\tclass_btn_wizard.pressed.connect(func(): select_class("wizard"))
\tclass_btn_cleric.pressed.connect(func(): select_class("cleric"))
\tembark_btn.pressed.connect(embark)
\tselect_class("fighter")

func select_class(p_class: String) -> void:
\tselected_class = p_class
\tmatch p_class:
\t\t"fighter":
\t\t\tdesc_label.text = "FIGHTER: Master of arms and heavy armor. High survivability with d10 hit die. (HP: 12, AC: 16)"
\t\t"rogue":
\t\t\tdesc_label.text = "ROGUE: Agile skirmisher specializing in finesse blades and stealth. (HP: 9, AC: 13)"
\t\t"wizard":
\t\t\tdesc_label.text = "WIZARD: Wielder of arcane devastation. Casts Magic Missile and Fireball. (HP: 7, AC: 11)"
\t\t"cleric":
\t\t\tdesc_label.text = "CLERIC: Holy warrior of the Dawnfather. Can heal wounds and smite darkness. (HP: 9, AC: 15)"

func embark() -> void:
\tvar h_name = name_input.text.strip_edges()
\tif h_name == "": h_name = "Lieutenant Vance"
\tGameState.init_hero(h_name, selected_class)
\tget_tree().change_scene_to_file("res://scenes/Homestead.tscn")
`;
    writeFileSafe(path.join(scriptsDir, 'CharacterSelect.gd'), charSelectGd, 'utf8');

    const charSelectTscn = `[gd_scene load_steps=2 format=3 uid="uid://charselect01"]

[ext_resource type="Script" path="res://scripts/CharacterSelect.gd" id="1_cs"]

[node name="CharacterSelect" type="Control"]
layout_mode = 3
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2
script = ExtResource("1_cs")

[node name="Background" type="ColorRect" parent="."]
layout_mode = 1
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
color = Color(0.04, 0.06, 0.09, 1)

[node name="VBoxContainer" type="VBoxContainer" parent="."]
layout_mode = 1
anchors_preset = 8
anchor_left = 0.5
anchor_top = 0.5
anchor_right = 0.5
anchor_bottom = 0.5
offset_left = -380.0
offset_top = -280.0
offset_right = 380.0
offset_bottom = 280.0
theme_override_constants/separation = 24

[node name="Title" type="Label" parent="VBoxContainer"]
layout_mode = 2
theme_override_font_sizes/font_size = 32
theme_override_colors/font_color = Color(0, 0.8, 0.9, 1)
text = "REALM OF HEROES: A NIGHT WITHOUT MEMORY"
horizontal_alignment = 1

[node name="Subtitle" type="Label" parent="VBoxContainer"]
layout_mode = 2
theme_override_font_sizes/font_size = 18
theme_override_colors/font_color = Color(0.7, 0.8, 0.85, 1)
text = "Early Access Vertical Slice — Choose Your Hero"
horizontal_alignment = 1

[node name="NameEdit" type="LineEdit" parent="VBoxContainer"]
layout_mode = 2
placeholder_text = "Enter Hero Name (e.g. Lieutenant Vance)"
alignment = 1

[node name="ClassGrid" type="HBoxContainer" parent="VBoxContainer"]
layout_mode = 2
theme_override_constants/separation = 16
alignment = 1

[node name="BtnFighter" type="Button" parent="VBoxContainer/ClassGrid"]
custom_minimum_size = Vector2(160, 60)
layout_mode = 2
text = "⚔️ Fighter"

[node name="BtnRogue" type="Button" parent="VBoxContainer/ClassGrid"]
custom_minimum_size = Vector2(160, 60)
layout_mode = 2
text = "🗡️ Rogue"

[node name="BtnWizard" type="Button" parent="VBoxContainer/ClassGrid"]
custom_minimum_size = Vector2(160, 60)
layout_mode = 2
text = "🔮 Wizard"

[node name="BtnCleric" type="Button" parent="VBoxContainer/ClassGrid"]
custom_minimum_size = Vector2(160, 60)
layout_mode = 2
text = "✨ Cleric"

[node name="DescLabel" type="Label" parent="VBoxContainer"]
custom_minimum_size = Vector2(0, 70)
layout_mode = 2
theme_override_colors/font_color = Color(1, 0.84, 0.4, 1)
text = "Class description..."
autowrap_mode = 2

[node name="EmbarkBtn" type="Button" parent="VBoxContainer"]
custom_minimum_size = Vector2(240, 50)
layout_mode = 2
size_flags_horizontal = 4
text = "EMBARK INTO OAKHAVEN ➔"
`;
    writeFileSafe(path.join(scenesDir, 'CharacterSelect.tscn'), charSelectTscn, 'utf8');

    // 5. Homestead scene & script (Map 1)
    const homesteadGd = `extends Node2D

@onready var dialogue_box = $CanvasLayer/DialogueBox
@onready var hud = $CanvasLayer/PartyHUD
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var chest = $Footlocker
@onready var partner = $EloraNPC
@onready var door = $FrontDoor

func _ready() -> void:
\tprint("Homestead loaded: Act 1 begins.")
\thud.update_display("Active Quest: A Night Without Memory (Stage 1: Talk to Elora)")
\tpartner.body_clicked.connect(talk_to_elora)
\tchest.chest_opened.connect(open_footlocker)
\tdoor.door_entered.connect(try_exit_to_village)
\t
\t# Auto-trigger opening dialogue on start
\ttalk_to_elora()

func talk_to_elora() -> void:
\tvar dial = DataStore.dialogue_trees.get("partner-confrontation", {})
\tdialogue_box.start_dialogue(dial, "node_wake")
\tGameState.flags.partner_conversed = true
\tGameState.advance_quest(2)
\thud.update_display("Active Quest: Loot footlocker & head outside")

func open_footlocker() -> void:
\tif not GameState.flags.get("footlocker_looted", false):
\t\tGameState.flags.footlocker_looted = true
\t\tGameState.add_item("service-sword")
\t\tGameState.add_item("potion-healing")
\t\tGameState.add_chest()
\t\tshow_notice("Acquired Royal Guard Service Sword and Potion of Healing!")
\t\thud.update_display("Active Quest: Step outside into Oakhaven Village")

func try_exit_to_village() -> void:
\tif not GameState.flags.get("footlocker_looted", false):
\t\tshow_notice("You should check your footlocker before heading out into danger!")
\t\treturn
\tget_tree().change_scene_to_file("res://scenes/VillageSquare.tscn")

func show_notice(text: String) -> void:
\tmsg_label.text = text
\tmsg_label.visible = true
\tawait get_tree().create_timer(3.0).timeout
\tmsg_label.visible = false
`;
    writeFileSafe(path.join(scriptsDir, 'Homestead.gd'), homesteadGd, 'utf8');

    // 6. VillageSquare scene & script (Map 2)
    const villageGd = `extends Node2D

@onready var dialogue_box = $CanvasLayer/DialogueBox
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr = $CombatManager
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var blacksmith = $BlacksmithBrand
@onready var garrison_gate = $GarrisonGate

func _ready() -> void:
\tprint("Oakhaven Village Square loaded: Act 2 begins.")
\thud.update_display("Active Quest: Investigate disturbance & speak to Blacksmith Brand")
\tblacksmith.body_clicked.connect(talk_to_blacksmith)
\tgarrison_gate.door_entered.connect(try_enter_garrison)

func talk_to_blacksmith() -> void:
\tvar dial = DataStore.dialogue_trees.get("blacksmith-inquiry", {})
\tdialogue_box.start_dialogue(dial, "node_blacksmith_start")
\tGameState.flags.blacksmith_conversed = true
\tGameState.add_item("garrison-key")
\tGameState.advance_quest(3)
\tshow_notice("Received Garrison Side-Gate Key from Blacksmith Brand!")
\thud.update_display("Active Quest: Unlock and enter Royal Garrison Keep")

func trigger_hound_combat() -> void:
\tif GameState.flags.get("village_hounds_slain", false): return
\tshow_notice("Attacked by Corrupted Shadow Hounds!")
\tvar hound = DataStore.monsters.get("corrupted-hound")
\tvar ac = hound.armor_class if hound else 12
\tvar res = combat_mgr.execute_attack(GameState.hero_name, 5, 2, 8, "Corrupted Hound", ac)
\tif res.hit:
\t\tshow_notice("Hit Corrupted Hound for " + str(res.damage) + " damage! Hound slain!")
\t\tGameState.add_kill()
\t\tGameState.flags.village_hounds_slain = true
\telse:
\t\tshow_notice("Attack missed! Counter-attack parried!")

func try_enter_garrison() -> void:
\tif not GameState.has_item("garrison-key"):
\t\tshow_notice("The massive iron portcullis is locked! Speak to Blacksmith Brand.")
\t\treturn
\tGameState.advance_quest(4)
\tget_tree().change_scene_to_file("res://scenes/GarrisonKeep.tscn")

func show_notice(text: String) -> void:
\tmsg_label.text = text
\tmsg_label.visible = true
\tawait get_tree().create_timer(3.0).timeout
\tmsg_label.visible = false
`;
    writeFileSafe(path.join(scriptsDir, 'VillageSquare.gd'), villageGd, 'utf8');

    // 7. GarrisonKeep scene & script (Map 3 - Dungeon & Boss)
    const garrisonGd = `extends Node2D

@onready var dialogue_box = $CanvasLayer/DialogueBox
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr = $CombatManager
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var malakor_npc = $MalakorBoss

var boss_fight_active: bool = false
var malakor_hp: int = 58

func _ready() -> void:
\tprint("Royal Garrison Keep loaded: Act 3 & 4 begins.")
\thud.update_display("Active Quest: Cleanse barracks & confront Captain Malakor")
\tmalakor_npc.body_clicked.connect(confront_malakor)

func confront_malakor() -> void:
\tif GameState.flags.get("malakor_slain", false): return
\tvar dial = DataStore.dialogue_trees.get("malakor-showdown", {})
\tdialogue_box.start_dialogue(dial, "node_malakor_start")
\tdialogue_box.dialogue_ended.connect(start_boss_battle, CONNECT_ONE_SHOT)

func start_boss_battle() -> void:
\tboss_fight_active = true
\tshow_notice("⚔️ BOSS BATTLE: Captain Malakor (Corrupted Commander) ⚔️")
\texecute_boss_round()

func execute_boss_round() -> void:
\tif not boss_fight_active: return
\tvar res = combat_mgr.execute_attack(GameState.hero_name, 6, 8, 16, "Captain Malakor", 16)
\tshow_notice("Hero attacks Malakor! Hit: " + str(res.hit) + " Damage: " + str(res.damage))
\tmalakor_hp -= res.damage
\t
\tif malakor_hp <= 0:
\t\tboss_fight_active = false
\t\tGameState.flags.malakor_slain = true
\t\tGameState.add_kill()
\t\tGameState.advance_quest(5)
\t\tshow_notice("★ Captain Malakor is vanquished! The breach is sealed! ★")
\t\tawait get_tree().create_timer(2.0).timeout
\t\tget_tree().change_scene_to_file("res://scenes/VictoryScreen.tscn")
\telse:
\t\tawait get_tree().create_timer(1.5).timeout
\t\texecute_boss_round()

func show_notice(text: String) -> void:
\tmsg_label.text = text
\tmsg_label.visible = true
\tawait get_tree().create_timer(3.0).timeout
\tmsg_label.visible = false
`;
    writeFileSafe(path.join(scriptsDir, 'GarrisonKeep.gd'), garrisonGd, 'utf8');

    // 8. VictoryScreen scene & script (Terminal Win State)
    const victoryGd = `extends Control

@onready var hero_label = $VBoxContainer/StatsBox/HeroLabel
@onready var kills_label = $VBoxContainer/StatsBox/KillsLabel
@onready var chests_label = $VBoxContainer/StatsBox/ChestsLabel
@onready var gold_label = $VBoxContainer/StatsBox/GoldLabel
@onready var replay_btn = $VBoxContainer/BtnReplay
@onready var quit_btn = $VBoxContainer/BtnQuit

func _ready() -> void:
\thero_label.text = "Hero: " + GameState.hero_name + " (" + GameState.hero_class.capitalize() + ")"
\tkills_label.text = "Enemies Defeated: " + str(GameState.stats.kills)
\tchests_label.text = "Chests Discovered: " + str(GameState.stats.chests)
\tgold_label.text = "Gold Acquired: " + str(GameState.gold)
\treplay_btn.pressed.connect(func(): get_tree().change_scene_to_file("res://scenes/CharacterSelect.tscn"))
\tquit_btn.pressed.connect(func(): get_tree().quit())
`;
    writeFileSafe(path.join(scriptsDir, 'VictoryScreen.gd'), victoryGd, 'utf8');

    const victoryTscn = `[gd_scene load_steps=2 format=3 uid="uid://victory01"]

[ext_resource type="Script" path="res://scripts/VictoryScreen.gd" id="1_vic"]

[node name="VictoryScreen" type="Control"]
layout_mode = 3
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2
script = ExtResource("1_vic")

[node name="ColorRect" type="ColorRect" parent="."]
layout_mode = 1
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
color = Color(0.03, 0.05, 0.08, 1)

[node name="VBoxContainer" type="VBoxContainer" parent="."]
layout_mode = 1
anchors_preset = 8
anchor_left = 0.5
anchor_top = 0.5
anchor_right = 0.5
anchor_bottom = 0.5
offset_left = -400.0
offset_top = -280.0
offset_right = 400.0
offset_bottom = 280.0
theme_override_constants/separation = 16

[node name="Title" type="Label" parent="VBoxContainer"]
layout_mode = 2
theme_override_font_sizes/font_size = 32
theme_override_colors/font_color = Color(1, 0.85, 0.2, 1)
text = "★ CHAPTER 1 COMPLETE ★"
horizontal_alignment = 1

[node name="SubTitle" type="Label" parent="VBoxContainer"]
layout_mode = 2
theme_override_font_sizes/font_size = 20
theme_override_colors/font_color = Color(0, 0.8, 0.9, 1)
text = "A Night Without Memory — Early Access Vertical Slice"
horizontal_alignment = 1

[node name="Epilogue" type="Label" parent="VBoxContainer"]
custom_minimum_size = Vector2(0, 100)
layout_mode = 2
theme_override_colors/font_color = Color(0.85, 0.9, 0.95, 1)
text = "With Captain Malakor defeated, you strike the iron alarm bell, rallying the surviving guards and sealing the ancient vault entrance before the darkness can spread. But the mystery deepens: who ordered Malakor to unearth the relic, and what did you whisper before you collapsed?"
autowrap_mode = 2

[node name="StatsBox" type="VBoxContainer" parent="VBoxContainer"]
layout_mode = 2
theme_override_constants/separation = 6

[node name="HeroLabel" type="Label" parent="VBoxContainer/StatsBox"]
layout_mode = 2
text = "Hero: Vance"

[node name="KillsLabel" type="Label" parent="VBoxContainer/StatsBox"]
layout_mode = 2
text = "Enemies Defeated: 2"

[node name="ChestsLabel" type="Label" parent="VBoxContainer/StatsBox"]
layout_mode = 2
text = "Chests Discovered: 1"

[node name="GoldLabel" type="Label" parent="VBoxContainer/StatsBox"]
layout_mode = 2
text = "Gold Acquired: 25"

[node name="BtnReplay" type="Button" parent="VBoxContainer"]
custom_minimum_size = Vector2(240, 45)
layout_mode = 2
size_flags_horizontal = 4
text = "PLAY AGAIN (NEW HERO)"

[node name="BtnQuit" type="Button" parent="VBoxContainer"]
custom_minimum_size = Vector2(240, 45)
layout_mode = 2
size_flags_horizontal = 4
text = "QUIT TO DESKTOP"
`;
    writeFileSafe(path.join(scenesDir, 'VictoryScreen.tscn'), victoryTscn, 'utf8');

    // 9. Component scenes: Reusable DialogueBox, TreasureChest, Door, PartyHUD
    const dialogueBoxGd = `class_name DialogueBox
extends Panel

signal dialogue_ended

@onready var speaker_label = $SpeakerLabel
@onready var text_label = $TextLabel
@onready var choices_container = $ChoicesContainer

var current_tree: Dictionary = {}
var current_node_id: String = ""

func start_dialogue(tree: Dictionary, root_id: String) -> void:
\tcurrent_tree = tree
\tcurrent_node_id = root_id
\tvisible = true
\tshow_node(root_id)

func show_node(node_id: String) -> void:
\tvar nodes = current_tree.get("nodes", {})
\tvar node_data = nodes.get(node_id, {})
\tif node_data.is_empty():
\t\tclose_dialogue()
\t\treturn
\t
\tspeaker_label.text = node_data.get("speaker", "Unknown")
\ttext_label.text = node_data.get("text", "")
\t
\tfor child in choices_container.get_children():
\t\tchild.queue_free()
\t
\tvar choices = node_data.get("choices", [])
\tif choices.size() == 0:
\t\tvar btn = Button.new()
\t\tbtn.text = "[Continue]"
\t\tbtn.pressed.connect(close_dialogue)
\t\tchoices_container.add_child(btn)
\telse:
\t\tfor c in choices:
\t\t\tvar btn = Button.new()
\t\t\tbtn.text = c.get("text", "...")
\t\t\tvar nxt = c.get("nextNode", null)
\t\t\tbtn.pressed.connect(func(): on_choice_selected(nxt))
\t\t\tchoices_container.add_child(btn)

func on_choice_selected(next_node: Variant) -> void:
\tif next_node == null:
\t\tclose_dialogue()
\telse:
\t\tshow_node(str(next_node))

func close_dialogue() -> void:
\tvisible = false
\tdialogue_ended.emit()
`;
    writeFileSafe(path.join(scriptsDir, 'DialogueBox.gd'), dialogueBoxGd, 'utf8');

    const dialogueBoxTscn = `[gd_scene load_steps=2 format=3 uid="uid://dialog01"]

[ext_resource type="Script" path="res://scripts/DialogueBox.gd" id="1_dlg"]

[node name="DialogueBox" type="Panel"]
custom_minimum_size = Vector2(800, 260)
offset_left = 240.0
offset_top = 440.0
offset_right = 1040.0
offset_bottom = 700.0
script = ExtResource("1_dlg")

[node name="SpeakerLabel" type="Label" parent="."]
layout_mode = 0
offset_left = 20.0
offset_top = 15.0
offset_right = 300.0
offset_bottom = 45.0
theme_override_font_sizes/font_size = 18
theme_override_colors/font_color = Color(0, 0.85, 0.95, 1)
text = "Speaker"

[node name="TextLabel" type="Label" parent="."]
layout_mode = 0
offset_left = 20.0
offset_top = 50.0
offset_right = 780.0
offset_bottom = 150.0
theme_override_font_sizes/font_size = 16
text = "Dialogue message text..."
autowrap_mode = 2

[node name="ChoicesContainer" type="VBoxContainer" parent="."]
layout_mode = 0
offset_left = 20.0
offset_top = 160.0
offset_right = 780.0
offset_bottom = 250.0
theme_override_constants/separation = 6
`;
    writeFileSafe(path.join(compScenesDir, 'DialogueBox.tscn'), dialogueBoxTscn, 'utf8');

    // 10. Clickable interactables: ClickableObject.gd
    const clickableGd = `class_name ClickableObject
extends Area2D

signal body_clicked

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
\tif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
\t\tbody_clicked.emit()
`;
    writeFileSafe(path.join(scriptsDir, 'ClickableObject.gd'), clickableGd, 'utf8');

    // 11. TreasureChest.gd
    const chestGd = `class_name TreasureChest
extends Area2D

signal chest_opened

@export var is_opened: bool = false
@onready var label = $Label

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
\tif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
\t\tif not is_opened:
\t\t\tis_opened = true
\t\t\tlabel.text = "[Chest Opened]"
\t\t\tchest_opened.emit()
`;
    writeFileSafe(path.join(scriptsDir, 'TreasureChest.gd'), chestGd, 'utf8');

    // 12. DoorPortal.gd
    const doorGd = `class_name DoorPortal
extends Area2D

signal door_entered

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
\tif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
\t\tdoor_entered.emit()
`;
    writeFileSafe(path.join(scriptsDir, 'DoorPortal.gd'), doorGd, 'utf8');

    // 13. PartyHUD.gd
    const hudGd = `class_name PartyHUD
extends Panel

signal pause_toggled

@onready var hero_name_label = $HeroNameLabel
@onready var hp_label = $HPLabel
@onready var quest_label = $QuestLabel
@onready var pause_btn = $BtnPause

var is_paused: bool = false

func _ready() -> void:
\tpause_btn.pressed.connect(toggle_pause)
\tupdate_hero_stats()
\tGameState.hero_damaged.connect(func(_cur, _max): update_hero_stats())

func update_hero_stats() -> void:
\thero_name_label.text = GameState.hero_name + " (" + GameState.hero_class.capitalize() + ")"
\thp_label.text = "HP: " + str(GameState.hero_hp) + " / " + str(GameState.hero_max_hp) + "  |  AC: " + str(GameState.hero_ac)

func update_display(quest_text: String) -> void:
\tquest_label.text = quest_text

func toggle_pause() -> void:
\tis_paused = !is_paused
\tpause_btn.text = "RESUME" if is_paused else "PAUSE"
\tpause_toggled.emit()
`;
    writeFileSafe(path.join(scriptsDir, 'PartyHUD.gd'), hudGd, 'utf8');

    // Homestead.tscn
    const homesteadTscn = `[gd_scene load_steps=8 format=3 uid="uid://homestead01"]

[ext_resource type="Script" path="res://scripts/Homestead.gd" id="1_hs"]
[ext_resource type="Script" path="res://scripts/ClickableObject.gd" id="2_co"]
[ext_resource type="Script" path="res://scripts/TreasureChest.gd" id="3_tc"]
[ext_resource type="Script" path="res://scripts/DoorPortal.gd" id="4_dp"]
[ext_resource type="PackedScene" path="res://scenes/components/DialogueBox.tscn" id="5_db"]
[ext_resource type="Script" path="res://scripts/PartyHUD.gd" id="6_hud"]

[sub_resource type="RectangleShape2D" id="RectangleShape2D_box"]
size = Vector2(80, 80)

[node name="Homestead" type="Node2D"]
script = ExtResource("1_hs")

[node name="RoomBG" type="ColorRect" parent="."]
offset_right = 1280.0
offset_bottom = 720.0
color = Color(0.12, 0.09, 0.07, 1)

[node name="Floor" type="ColorRect" parent="."]
offset_left = 140.0
offset_top = 100.0
offset_right = 1140.0
offset_bottom = 600.0
color = Color(0.25, 0.18, 0.13, 1)

[node name="EloraNPC" type="Area2D" parent="."]
position = Vector2(360, 280)
script = ExtResource("2_co")

[node name="ColorRect" type="ColorRect" parent="EloraNPC"]
offset_left = -30.0
offset_top = -30.0
offset_right = 30.0
offset_bottom = 30.0
color = Color(0.2, 0.7, 0.9, 1)

[node name="Label" type="Label" parent="EloraNPC"]
offset_left = -60.0
offset_top = -55.0
offset_right = 60.0
offset_bottom = -32.0
text = "Elora [Talk]"
horizontal_alignment = 1

[node name="CollisionShape2D" type="CollisionShape2D" parent="EloraNPC"]
shape = SubResource("RectangleShape2D_box")

[node name="Footlocker" type="Area2D" parent="."]
position = Vector2(220, 200)
script = ExtResource("3_tc")

[node name="ColorRect" type="ColorRect" parent="Footlocker"]
offset_left = -25.0
offset_top = -20.0
offset_right = 25.0
offset_bottom = 20.0
color = Color(0.8, 0.5, 0.1, 1)

[node name="Label" type="Label" parent="Footlocker"]
offset_left = -80.0
offset_top = -45.0
offset_right = 80.0
offset_bottom = -22.0
text = "Footlocker [Loot]"
horizontal_alignment = 1

[node name="CollisionShape2D" type="CollisionShape2D" parent="Footlocker"]
shape = SubResource("RectangleShape2D_box")

[node name="FrontDoor" type="Area2D" parent="."]
position = Vector2(640, 560)
script = ExtResource("4_dp")

[node name="ColorRect" type="ColorRect" parent="FrontDoor"]
offset_left = -40.0
offset_top = -20.0
offset_right = 40.0
offset_bottom = 20.0
color = Color(0.5, 0.3, 0.1, 1)

[node name="Label" type="Label" parent="FrontDoor"]
offset_left = -80.0
offset_top = -45.0
offset_right = 80.0
offset_bottom = -22.0
text = "Front Door [Exit]"
horizontal_alignment = 1

[node name="CollisionShape2D" type="CollisionShape2D" parent="FrontDoor"]
shape = SubResource("RectangleShape2D_box")

[node name="CanvasLayer" type="CanvasLayer" parent="."]

[node name="NoticeLabel" type="Label" parent="CanvasLayer"]
visible = false
offset_left = 340.0
offset_top = 40.0
offset_right = 940.0
offset_bottom = 80.0
theme_override_colors/font_color = Color(1, 0.9, 0.2, 1)
theme_override_font_sizes/font_size = 18
horizontal_alignment = 1

[node name="PartyHUD" type="Panel" parent="CanvasLayer"]
offset_top = 620.0
offset_right = 1280.0
offset_bottom = 720.0
script = ExtResource("6_hud")

[node name="HeroNameLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 20.0
offset_top = 15.0
offset_right = 300.0
offset_bottom = 40.0
text = "Lieutenant Vance"

[node name="HPLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 20.0
offset_top = 45.0
offset_right = 300.0
offset_bottom = 70.0
text = "HP: 12 / 12  |  AC: 16"

[node name="QuestLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 340.0
offset_top = 20.0
offset_right = 1000.0
offset_bottom = 60.0
text = "Active Quest: A Night Without Memory"

[node name="BtnPause" type="Button" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 1140.0
offset_top = 25.0
offset_right = 1250.0
offset_bottom = 65.0
text = "PAUSE"

[node name="DialogueBox" parent="CanvasLayer" instance=ExtResource("5_db")]
visible = false
`;
    writeFileSafe(path.join(scenesDir, 'Homestead.tscn'), homesteadTscn, 'utf8');

    // VillageSquare.tscn
    const villageTscn = `[gd_scene load_steps=8 format=3 uid="uid://village01"]

[ext_resource type="Script" path="res://scripts/VillageSquare.gd" id="1_vs"]
[ext_resource type="Script" path="res://scripts/ClickableObject.gd" id="2_co"]
[ext_resource type="Script" path="res://scripts/DoorPortal.gd" id="3_dp"]
[ext_resource type="Script" path="res://scripts/CombatManager.gd" id="4_cm"]
[ext_resource type="PackedScene" path="res://scenes/components/DialogueBox.tscn" id="5_db"]
[ext_resource type="Script" path="res://scripts/PartyHUD.gd" id="6_hud"]

[sub_resource type="RectangleShape2D" id="RectangleShape2D_box"]
size = Vector2(80, 80)

[node name="VillageSquare" type="Node2D"]
script = ExtResource("1_vs")

[node name="CombatManager" type="Node" parent="."]
script = ExtResource("4_cm")

[node name="Ground" type="ColorRect" parent="."]
offset_right = 1280.0
offset_bottom = 720.0
color = Color(0.18, 0.28, 0.15, 1)

[node name="Road" type="ColorRect" parent="."]
offset_left = 400.0
offset_right = 880.0
offset_bottom = 720.0
color = Color(0.35, 0.3, 0.22, 1)

[node name="BlacksmithBrand" type="Area2D" parent="."]
position = Vector2(300, 360)
script = ExtResource("2_co")

[node name="ColorRect" type="ColorRect" parent="BlacksmithBrand"]
offset_left = -30.0
offset_top = -30.0
offset_right = 30.0
offset_bottom = 30.0
color = Color(0.9, 0.5, 0.1, 1)

[node name="Label" type="Label" parent="BlacksmithBrand"]
offset_left = -80.0
offset_top = -55.0
offset_right = 80.0
offset_bottom = -32.0
text = "Blacksmith Brand [Talk]"
horizontal_alignment = 1

[node name="CollisionShape2D" type="CollisionShape2D" parent="BlacksmithBrand"]
shape = SubResource("RectangleShape2D_box")

[node name="GarrisonGate" type="Area2D" parent="."]
position = Vector2(640, 80)
script = ExtResource("3_dp")

[node name="ColorRect" type="ColorRect" parent="GarrisonGate"]
offset_left = -60.0
offset_top = -25.0
offset_right = 60.0
offset_bottom = 25.0
color = Color(0.3, 0.35, 0.4, 1)

[node name="Label" type="Label" parent="GarrisonGate"]
offset_left = -100.0
offset_top = -55.0
offset_right = 100.0
offset_bottom = -32.0
text = "Garrison Portcullis [Enter]"
horizontal_alignment = 1

[node name="CollisionShape2D" type="CollisionShape2D" parent="GarrisonGate"]
shape = SubResource("RectangleShape2D_box")

[node name="CanvasLayer" type="CanvasLayer" parent="."]

[node name="NoticeLabel" type="Label" parent="CanvasLayer"]
visible = false
offset_left = 340.0
offset_top = 40.0
offset_right = 940.0
offset_bottom = 80.0
theme_override_colors/font_color = Color(1, 0.9, 0.2, 1)
theme_override_font_sizes/font_size = 18
horizontal_alignment = 1

[node name="PartyHUD" type="Panel" parent="CanvasLayer"]
offset_top = 620.0
offset_right = 1280.0
offset_bottom = 720.0
script = ExtResource("6_hud")

[node name="HeroNameLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 20.0
offset_top = 15.0
offset_right = 300.0
offset_bottom = 40.0
text = "Lieutenant Vance"

[node name="HPLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 20.0
offset_top = 45.0
offset_right = 300.0
offset_bottom = 70.0
text = "HP: 12 / 12  |  AC: 16"

[node name="QuestLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 340.0
offset_top = 20.0
offset_right = 1000.0
offset_bottom = 60.0
text = "Active Quest: A Night Without Memory"

[node name="BtnPause" type="Button" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 1140.0
offset_top = 25.0
offset_right = 1250.0
offset_bottom = 65.0
text = "PAUSE"

[node name="DialogueBox" parent="CanvasLayer" instance=ExtResource("5_db")]
visible = false
`;
    writeFileSafe(path.join(scenesDir, 'VillageSquare.tscn'), villageTscn, 'utf8');

    // GarrisonKeep.tscn
    const garrisonTscn = `[gd_scene load_steps=7 format=3 uid="uid://garrison01"]

[ext_resource type="Script" path="res://scripts/GarrisonKeep.gd" id="1_gk"]
[ext_resource type="Script" path="res://scripts/ClickableObject.gd" id="2_co"]
[ext_resource type="Script" path="res://scripts/CombatManager.gd" id="3_cm"]
[ext_resource type="PackedScene" path="res://scenes/components/DialogueBox.tscn" id="4_db"]
[ext_resource type="Script" path="res://scripts/PartyHUD.gd" id="5_hud"]

[sub_resource type="RectangleShape2D" id="RectangleShape2D_box"]
size = Vector2(100, 100)

[node name="GarrisonKeep" type="Node2D"]
script = ExtResource("1_gk")

[node name="CombatManager" type="Node" parent="."]
script = ExtResource("3_cm")

[node name="DungeonFloor" type="ColorRect" parent="."]
offset_right = 1280.0
offset_bottom = 720.0
color = Color(0.1, 0.1, 0.13, 1)

[node name="MalakorBoss" type="Area2D" parent="."]
position = Vector2(800, 300)
script = ExtResource("2_co")

[node name="ColorRect" type="ColorRect" parent="MalakorBoss"]
offset_left = -40.0
offset_top = -40.0
offset_right = 40.0
offset_bottom = 40.0
color = Color(0.7, 0.1, 0.2, 1)

[node name="Label" type="Label" parent="MalakorBoss"]
offset_left = -120.0
offset_top = -65.0
offset_right = 120.0
offset_bottom = -40.0
theme_override_colors/font_color = Color(1, 0.2, 0.3, 1)
text = "Captain Malakor [Confront]"
horizontal_alignment = 1

[node name="CollisionShape2D" type="CollisionShape2D" parent="MalakorBoss"]
shape = SubResource("RectangleShape2D_box")

[node name="CanvasLayer" type="CanvasLayer" parent="."]

[node name="NoticeLabel" type="Label" parent="CanvasLayer"]
visible = false
offset_left = 340.0
offset_top = 40.0
offset_right = 940.0
offset_bottom = 80.0
theme_override_colors/font_color = Color(1, 0.9, 0.2, 1)
theme_override_font_sizes/font_size = 18
horizontal_alignment = 1

[node name="PartyHUD" type="Panel" parent="CanvasLayer"]
offset_top = 620.0
offset_right = 1280.0
offset_bottom = 720.0
script = ExtResource("5_hud")

[node name="HeroNameLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 20.0
offset_top = 15.0
offset_right = 300.0
offset_bottom = 40.0
text = "Lieutenant Vance"

[node name="HPLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 20.0
offset_top = 45.0
offset_right = 300.0
offset_bottom = 70.0
text = "HP: 12 / 12  |  AC: 16"

[node name="QuestLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 340.0
offset_top = 20.0
offset_right = 1000.0
offset_bottom = 60.0
text = "Active Quest: Confront Captain Malakor"

[node name="BtnPause" type="Button" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 1140.0
offset_top = 25.0
offset_right = 1250.0
offset_bottom = 65.0
text = "PAUSE"

[node name="DialogueBox" parent="CanvasLayer" instance=ExtResource("4_db")]
visible = false
`;
    writeFileSafe(path.join(scenesDir, 'GarrisonKeep.tscn'), garrisonTscn, 'utf8');

    // Headless test runner
    const testScriptCode = `extends SceneTree

func _init() -> void:
\tprint("=== RobOS cRPG Automated Headless Verification ===")
\tvar store = load("res://src/generated/v1/DataStoreV1.gd").new()
\tstore.load_all_data()

\tassert(store.monsters.size() > 0, "No monsters loaded")
\tassert(store.spells.size() > 0, "No spells loaded")
\tassert(store.items.size() > 0, "No items loaded")
\tassert(store.npcs.size() > 0, "No npcs loaded")
\tassert(store.monsters.has("captain-malakor-boss"), "Captain Malakor boss missing")

\tvar malakor = store.monsters["captain-malakor-boss"]
\tprint("✔ Verified Boss: ", malakor.title, " (CR: ", malakor.challenge_rating, ", HP: ", malakor.hit_points, ", AC: ", malakor.armor_class, ")")

\tvar combat = load("res://scripts/CombatManager.gd").new()
\tvar res = combat.execute_attack("Lieutenant Vance", 6, 8, 16, "Captain Malakor", malakor.armor_class)
\tprint("✔ Combat Test: D20 Roll=", res.d20, " Total=", res.total_attack, " Hit=", res.hit, " Damage=", res.damage)

\tprint("=== ALL CRPG AUTOMATED CHECKS PASSED ===")
\tquit(0)
`;
    fs.mkdirSync(path.join(this.targetDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(this.targetDir, 'tests/test_crpg_runner.gd'), testScriptCode, 'utf8');
  }

  createGame(gameId, metadata = {}) {
    const title = metadata.title || 'Realm of Heroes: A Night Without Memory';
    const ruleset = metadata.ruleset || 'dnd5e';
    const combatModel = metadata.combatModel || 'real-time-with-pause';

    const raw = JSON.parse(fs.readFileSync(this.kgraphPackagePath, 'utf8'));
    const nodes = raw['robos:nodes'] || [];
    let gameNode = nodes.find(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return types.includes('robos:CRPGGame');
    });

    if (!gameNode) {
      gameNode = {
        '@id': `urn:robos:crpg:game:${gameId}`,
        '@type': ['oslc_am:Resource', 'robos:CRPGGame', 'robos:PCGame', 'schema:VideoGame'],
        'dcterms:title': title,
        'robos:repository': `github.com/nddipiazza/${gameId}`,
        'robos:technology': 'Godot 4 / GDScript',
        'robos:gameEngine': 'Godot 4',
        'robos:targetPlatform': 'Linux, Windows, macOS',
        'robos:ruleset': ruleset,
        'robos:combatModel': combatModel,
        'robos:startingZone': 'urn:robos:crpg:zone:homestead',
        'robos:assetPackage': 'flareteam/flare-game',
        'robos:engineArchitecture': 'urn:robos:infinity:engine:gemrb-infinity',
        'robos:maxPartySize': 4,
        'robos:package': 'crpg',
        'robos:namespace': 'robos.crpg'
      };
      nodes.unshift(gameNode);
    } else {
      gameNode['dcterms:title'] = title;
      gameNode['robos:engineArchitecture'] = 'urn:robos:infinity:engine:gemrb-infinity';
      gameNode['robos:ruleset'] = ruleset;
      gameNode['robos:combatModel'] = combatModel;
    }
    raw['robos:nodes'] = nodes;
    fs.writeFileSync(this.kgraphPackagePath, JSON.stringify(raw, null, 2), 'utf8');

    return this.build();
  }

  build() {
    const nodes = this.loadGraph();
    const validation = this.validateGraph(nodes);
    if (!validation.valid) {
      throw new Error(`CRPG Graph validation failed:\n${validation.errors.join('\n')}`);
    }

    this.generateDataStore(nodes);
    this.generateSchemas();
    this.generateGDScriptModels();
    this.generateGodotProject();

    return {
      success: true,
      nodesEvaluated: nodes.length,
      warnings: validation.warnings,
      targetDir: this.targetDir
    };
  }
}

module.exports = { CRPGGameBuilder };
