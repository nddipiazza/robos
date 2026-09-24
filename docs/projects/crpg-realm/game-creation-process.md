---
title: Game Creation Process
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 8
description: How the crpg-realm game is assembled from a knowledge-graph package, JSON data files, a Node.js builder, open-source art and Godot scenes.
---

# Game Creation Process & Architecture
{: .no_toc }

How `games/crpg-realm` is put together: the knowledge-graph package it started from, the `crpg-builder` generator, the JSON data layer the game reads at runtime, where the art came from, and how a location scene is laid out. After reading this you will know which files are generated, which are hand-edited, and which ones you must not regenerate.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

The game was bootstrapped in four stages. Only the first two are automated; the rest of the current game is hand-written GDScript and hand-edited scenes.

| Stage | Input | Output | Tool |
|:---|:---|:---|:---|
| 1. Model | — | `.robos/kgraphs/crpg/package.jsonld` (46 nodes) | hand-written JSON-LD |
| 2. Generate | the package | `data/v1/*.json`, `schemas/v1/crpg_game_v1.schema.json`, `src/generated/v1/*.gd`, starter scenes/scripts, `project.godot` | [`packages/crpg-builder`](https://github.com/nddipiazza/robos/tree/main/packages/crpg-builder) |
| 3. Assets | Flare RPG repo + other sources | `assets/**` | Python scripts in `packages/crpg-builder/scripts/` (partial, see below) |
| 4. Compose | generated starters | the 12 scenes in `scenes/` (plus `scenes/components/`) and the 40 `.gd` files in `scripts/` | hand-edited |

Since stage 2 ran, the data files, `DataStoreV1.gd` and `project.godot` have all been edited by hand. They no longer match what the builder would produce.

![The four-stage generation pipeline]({{ '/assets/images/crpg-realm/game_generation_paradigm.png' | relative_url }}){: .robos-zoomable-img }
*Illustration of the four stages. It is a diagram, not a screenshot; the table above is authoritative.*

---

## The knowledge-graph package

The package lives at [`.robos/kgraphs/crpg/package.jsonld`](https://github.com/nddipiazza/robos/blob/main/.robos/kgraphs/crpg/package.jsonld). It holds the same 46 nodes twice: under `robos:nodes` (which the builder reads, in `loadGraph()`) and under `@graph`.

The root node is the game itself. This is the real node, with the long `robos:hasCertificate` list trimmed:

```json
{
  "@id": "urn:robos:crpg:game:realm-of-heroes",
  "@type": ["oslc_am:Resource", "robos:CRPGGame", "robos:PCGame", "schema:VideoGame"],
  "dcterms:title": "Realm of Heroes: A Night Without Memory",
  "robos:repository": "github.com/nddipiazza/realm-of-heroes",
  "robos:technology": "Godot 4 / GDScript",
  "robos:gameEngine": "Godot 4",
  "robos:targetPlatform": "Linux, Windows, macOS",
  "robos:ruleset": "dnd5e",
  "robos:combatModel": "real-time-with-pause",
  "robos:startingZone": "urn:robos:crpg:zone:homestead",
  "robos:assetPackage": "flareteam/flare-game",
  "robos:engineArchitecture": "urn:robos:infinity:engine:gemrb-infinity",
  "robos:maxPartySize": 4,
  "robos:hasELearning": ["urn:robos:elearning:course:robos-crpg"],
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg",
  "robos:hasCertificate": ["urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucuwt58", "..."]
}
```

A monster node looks like this (also real):

```json
{
  "@id": "urn:robos:crpg:monster:corrupted-hound",
  "@type": ["oslc_am:Resource", "robos:CRPGMonster", "schema:Person"],
  "dcterms:title": "Corrupted Shadow Hound",
  "robos:challengeRating": "1/4",
  "robos:armorClass": 12,
  "robos:hitPoints": 11,
  "robos:speed": 40,
  "robos:abilities": { "STR": 12, "DEX": 15, "CON": 12, "INT": 3, "WIS": 12, "CHA": 6 },
  "robos:spriteAssetRef": "flare:creature:wolf",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg"
}
```

What the package models, by type:

| `@type` | Count | Examples |
|:---|:---:|:---|
| `robos:CRPGGame` | 1 | `realm-of-heroes` |
| `robos:CRPGClass` | 4 | fighter, wizard, rogue, cleric |
| `robos:CRPGNPC` | 2 | elora, blacksmith-brand |
| `robos:CRPGMonster` | 5 | corrupted-hound, corrupted-guard, captain-malakor-boss, skeleton, zombie |
| `robos:CRPGSpell` | 3 | magic-missile, cure-wounds, fireball |
| `robos:CRPGItem` | 6 | service-sword, garrison-key, guard-journal, malakor-signet, chain-mail, potion-healing |
| `robos:CRPGMapZone` | 3 | homestead, village-square, garrison-keep |
| `robos:CRPGEncounterTable` | 2 | village-hounds, garrison-skirmishers |
| `robos:CRPGQuest` | 1 | night-without-memory |
| `robos:CRPGDialogueTree` | 3 | partner-confrontation, blacksmith-inquiry, malakor-showdown |
| `robos:CRPGFaction` | 2 | royal-guard, corrupted-cult |
| test/QA nodes | 14 | test suite, test plan, 5 features, 5 scenarios, agent session, QA player |

{: .note }
The package describes the original three-map slice. The shipped game has grown past it: 12 classes, 9 races, 26 spells, 46 items, 18 NPCs, two extra maps (Whispering Forest, Ancient Catacombs) and traps. None of that was added to the package.

---

## The builder: `packages/crpg-builder`

The CLI is [`bin/crpg-builder.js`](https://github.com/nddipiazza/robos/blob/main/packages/crpg-builder/bin/crpg-builder.js); the logic is class `CRPGGameBuilder` in [`lib/builder.js`](https://github.com/nddipiazza/robos/blob/main/packages/crpg-builder/lib/builder.js).

```
crpg-builder [generate|create-game <id>|validate] [--title <name>] [--target-dir <dir>] [--package-path <path>]
```

| Command | What it does |
|:---|:---|
| `generate` (alias `build`) | `build()`: validate, then `generateDataStore()`, `generateSchemas()`, `generateGDScriptModels()`, `generateGodotProject()`. |
| `validate` | `validateGraph()`: checks there is a `robos:CRPGGame` node, its `robos:startingZone` exists, and every monster has a `robos:spriteAssetRef`. Unknown sprite keys are warnings. |
| `create-game <id>` (alias `create`) | `createGame()`: sets the title, ruleset and combat model on the game node, **writes the package file back**, then runs `build()`. Default id `realm-of-heroes`. |

| Flag | Default |
|:---|:---|
| `--target-dir` (or `--target`) | `games/crpg-realm` |
| `--package-path` (or `--package`) | `.robos/kgraphs/crpg/package.jsonld` |
| `--title` (or `--name`) | `Realm of Heroes: A Night Without Memory` (create-game only) |
| `--ruleset`, `--combat` | `dnd5e`, `real-time-with-pause` (create-game only) |

`package.json` also defines `npm run generate`, `npm run validate` and `npm test` (`node --test tests/*.test.js`). It lists a `diff` script too, but the CLI has no `diff` command; it prints the usage line.

What `generate` writes, and whether it overwrites:

| Output | Overwrites existing file? |
|:---|:---|
| `data/v1/` game, classes, npcs, monsters, spells, items, zones, encounters, quests, dialogue `.json` | **Yes** |
| `schemas/v1/crpg_game_v1.schema.json` | **Yes** |
| `src/generated/v1/` `MonsterData.gd`, `SpellData.gd`, `ItemData.gd`, `NPCData.gd`, `DataStoreV1.gd` | **Yes** |
| `project.godot` | **Yes** (1280x720 viewport, five autoloads) |
| `tests/test_crpg_runner.gd` | **Yes** |
| starter scripts and scenes (`GameState.gd`, `CombatManager.gd`, `VillageSquare.tscn`, ...) | No, only if missing (`writeFileSafe`) |

{: .warning }
**Do not run `generate` or `create-game` against `games/crpg-realm`.** It would replace the hand-edited data (12 classes become 4, 26 spells become 3), drop `FloatingTextManager` from the autoloads and reset the viewport to 1280x720, and overwrite `DataStoreV1.gd` with a template that has no `races`, `traps`, `load_mods()` or `_load_single_mod()`. To try the builder, point it at a scratch folder: `node packages/crpg-builder/bin/crpg-builder.js generate --target-dir /tmp/crpg-scratch`.

---

## The data layer

### Files in `data/v1/`

Every file except `game.json` is a **JSON array of objects with an `id` field**.

| File | Records | Loaded by `DataStoreV1`? | Read at runtime by |
|:---|:---:|:---:|:---|
| `game.json` | object | yes (`game_config`) | — |
| `classes.json` | 12 | yes | — (class HP/AC are hard-coded in `GameState.init_hero`) |
| `races.json` | 9 | yes | — (racial bonuses are hard-coded in `GameState.init_hero`) |
| `spells.json` | 26 | yes | — (`CombatManager` matches spell ids in code) |
| `items.json` | 46 | yes | `GameState.get_item_data()`, inventory, shop |
| `monsters.json` | 6 | yes | — (`TacticalEnemy` does not read it) |
| `npcs.json` | 18 | yes | `NPCCharacter.interact()` (dialogue lookup) |
| `dialogue.json` | 18 | yes (`dialogue_trees`) | `NPCCharacter`, `Homestead.gd`, `VillageSquare.gd`, `GarrisonKeep.gd` |
| `traps.json` | 4 | yes | `Trap.gd` |
| `quests.json` | 1 | yes | — |
| `zones.json` | 3 | yes | — (no entries for the forest or catacombs) |
| `encounters.json` | 2 | **no** | — |
| `status_effects.json` | 17 | **no** | — |

The six monsters in `monsters.json`:

| id | title | CR | AC | HP |
|:---|:---|:---:|:---:|:---:|
| `corrupted-hound` | Corrupted Shadow Hound | 1/4 | 12 | 11 |
| `corrupted-guard` | Feral Guard Skirmisher | 1/2 | 14 | 16 |
| `captain-malakor-boss` | Captain Malakor (Corrupted Commander) | 3 | 16 | 58 |
| `skeleton` | Skeleton Warrior | 1/4 | 13 | 13 |
| `zombie` | Shambling Zombie | 1/4 | 8 | 22 |
| `ancient-stone-golem` | Ancient Stone Golem | 5 | 14 | 500 |

{: .note }
These stats are reference data only. In play, Malakor uses HP 48 / AC 14 hard-coded in `GarrisonKeep.gd`, and `TacticalEnemy` nodes get their stats from exported properties in the scene.

### Schemas

Only three schema files exist in `schemas/v1/`: `crpg_game_v1.schema.json`, `monsters.schema.json` and `races.schema.json`. `crpg_game_v1.schema.json` `$ref`s per-file schemas (`classes.schema.json`, `spells.schema.json`, ...) that were never written. The game does not validate anything at runtime. Despite its name, `tests/validate_schemas.py` does not use the schemas. It checks that ten data files exist and parse, plus a few spot values (Malakor HP 58 / AC 16, the `elora` NPC, fighter hit die `d10`).

### `DataStoreV1.gd`

The `DataStore` autoload is [`src/generated/v1/DataStoreV1.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/src/generated/v1/DataStoreV1.gd). Despite the "Auto-generated" header it is hand-edited. It loads each array and builds a dictionary keyed by `id`:

```gdscript
var npcs: Dictionary = {} # id -> NPCData
var monsters: Dictionary = {} # id -> MonsterData
var spells: Dictionary = {} # id -> SpellData
var items: Dictionary = {} # id -> ItemData
# ...
func _ready() -> void:
	load_all_data()
	load_mods()
# ...
	var spell_list = load_json("data/v1/spells.json")
	if spell_list is Array:
		for s in spell_list:
			spells[s["id"]] = SpellData.from_dict(s)
```

`npcs`, `monsters`, `spells` and `items` hold typed `RefCounted` wrappers (`NPCData`, `MonsterData`, `SpellData`, `ItemData`), so `DataStore.items["potion-healing"]` is an `ItemData`, not a `Dictionary`. `races`, `classes`, `zones`, `dialogue_trees`, `quests` and `traps` hold plain dictionaries.

The wrappers copy a fixed set of keys. [`SpellData.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/src/generated/v1/SpellData.gd), for example, keeps `id`, `title`, `level`, `school`, `castingTime`, `range`, `damageFormula`, `damageType` and `icon`; `description`, `condition`, `hazard` and `acBonus` from `spells.json` are dropped.

`load_mods()` scans `res://mods/` and `user://mods/` for folders with a `mod.json`. `_load_single_mod()` only merges a `traps_file` array into `traps`. See [`mods/catacomb-traps-mod/`](https://github.com/nddipiazza/robos/tree/main/games/crpg-realm/mods/catacomb-traps-mod).

---

## Assets and where they came from

There is **no CREDITS, LICENSE or attribution file** anywhere under `games/crpg-realm/`. The table below is reconstructed from the ingestion scripts and should be treated as incomplete.

| Folder | Contents | Provenance |
|:---|:---|:---|
| `backgrounds/` | `village_open_world_2560.png`, `homestead_interior.png`, `forest_wilderness_2560.png`, `ancient_catacombs_2560.png`, `garrison_dungeon_2560.png` (all 2560x1440) | **Unknown.** No script in the repo creates or downloads them. The buildings, fountain and roads you see in the village are painted into this image. |
| `backgrounds/` | `city_citadel.jpg`, `dungeon_keep.jpg`, `arrival_victory.jpg` (2560x1440) | Downloaded from `flareteam/flare-game` by `fetch-flare-open-art.py` (`fetch_backgrounds()`). |
| `backgrounds/` | `village_square_bg.png`, `garrison_keep_bg.png` (1280x720) | Unknown; not referenced by any current scene. |
| `sprites/characters/` | Walk cycles `*_walk_0..3.png` for exactly four characters: `hero_knight`, `elora_npc`, `blacksmith_brand`, `shadow_hound`. Plus `hero_knight_idle_*`, `hero_knight_attack_*`, `captain_malakor_attack_*`, `shadow_hound_attack_*`, single-frame `hero_mage/plate/rogue.png`. | Cut from Flare sprites by `fetch-flare-open-art.py` and `ingest-real-opensource-assets.py`. Malakor and the hound are recoloured Flare sprites. |
| `sprites/enemies/` | goblin, goblin_elite, minotaur, orc, skeleton, skeleton_archer, wolf, zombie | `ingest-real-opensource-assets.py`; its docstring names Flare and OpenGameArt (Danimal / Micket / Poss). |
| `sprites/npcs/` | 9 NPC sprites + `prop_obelisk.png` | Not produced by any script in the repo. |
| `portraits/` | class portraits, `portrait_male01..15`, `portrait_female01..10`, Elora, Brand, Malakor | The 12 class portraits plus Elora, Brand and Malakor are Flare `fantasycore` portraits (`fetch_portraits()` and `ingest_portraits()`). The numbered `portrait_male*/female*` files are not produced by any script in the repo. |
| `icons/` | weapons, armor, potions, spells, scrolls, tools, accessories, status_effects | Mixed. Some are 32x32 crops of Flare `icons.png` (`ingest_icons()`). Others are 48x48 letter tiles drawn by [`scripts/generate_item_icons.py`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/generate_item_icons.py). All 17 status icons are 48x48 tiles; `scripts/generate_status_icons.py` draws 15 of them (the SRD conditions), while `sanctuary.png` and `see_invisibility.png` are not produced by that script. |
| `structures/` | `building_*.png`, `stone_arch_gate.png`, `stone_bridge.png`, `stone_wall_section.png` | Unknown. Only `stone_arch_gate.png` is used (village and forest gates). |
| `props/`, `tilesets/`, `tiles/` | chests, door, reticle, selection circles, log-size icons, Flare tilesheets | Chests, door and `grassland_structures.png` come from Flare tilesheets (`fetch_props_and_chests()`). |

The ingestion script docstrings describe the Flare material as CC-BY-SA / GPL. If you redistribute the game, you need to add a proper attribution file first.

{: .note }
**Not implemented yet:** 8-direction animation. The builder's `flare-asset-catalog.js` and `monsters.json` describe 8-direction Flare sheets, but the game uses single-facing frames flipped with `flip_h`.

---

## Scene architecture

Each location is one flat scene. The root is a `Node2D` with `y_sort_enabled = true`; gameplay nodes (NPCs, enemies, doors, items, the hero) are **direct children of the root** so `GameState`, `GameControlServer` and fireball targeting can find them with `get_tree().current_scene.get_children()`.

This is the real top level of [`scenes/VillageSquare.tscn`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scenes/VillageSquare.tscn), in file order:

```
VillageSquare (Node2D, y_sort_enabled, VillageSquare.gd)
├── CombatManager (Node, CombatManager.gd)
├── Ground (TextureRect 2560x1440, mouse_filter = 2, village_open_world_2560.png)
├── VillageBoundaries (StaticBody2D)            # borders, walls, fountain, well, tree, anvil, stalls, benches
├── HouseBlacksmith (StaticBody2D) ── CollisionPolygon2D
├── HouseApothecary (StaticBody2D) ── CollisionPolygon2D, ApothecaryGarden, ApothecaryCartBench
├── HouseSWCottage (StaticBody2D) ── CollisionPolygon2D, SWCartFence
├── HouseTavernInn (StaticBody2D) ── CollisionPolygon2D, TavernBeerTables
├── HouseTownHall (StaticBody2D) ── CollisionPolygon2D
├── HouseEastThatched (StaticBody2D) ── CollisionPolygon2D
├── HouseBakeryOven (StaticBody2D) ── CollisionPolygon2D
├── HouseSouthMerchant (StaticBody2D) ── CollisionPolygon2D
├── HouseSouthThatched (StaticBody2D) ── CollisionPolygon2D
├── HouseSouthLower (StaticBody2D) ── CollisionPolygon2D
├── HouseEastCorner (StaticBody2D) ── CollisionPolygon2D
├── GarrisonGate, ForestGate (Area2D, DoorPortal.gd) ── Sprite, CollisionShape2D
├── DoorInn, DoorBlacksmith, DoorApothecary, DoorTownHall, DoorCottage,
│   DoorElder, DoorBarracks, DoorRanger, DoorShrine, DoorMill (Area2D, DoorPortal.gd)
├── GroundItem_Potion, GroundItem_Scroll, GroundItem_Sword (GroundItem.tscn)
├── BlacksmithBrand (Area2D, ClickableObject.gd, npc_id = "npc-id-1")
├── NPC_Innkeeper ... NPC_Elder (11 × NPCCharacter.tscn)
├── ShadowHound (ShadowHound.tscn)
├── HeroPlayer (HeroPlayer.tscn)
├── CanvasLayer
│   ├── NoticeLabel, PartyHUD (QuestLabel, BtnOptions, BtnInventory, BtnPause)
│   └── ActionLog, InventoryWindow, SettingsModal, CharacterStatusWindow
└── FogOfWar (FogOfWar.tscn)
```

The eleven houses are invisible collision polygons laid over the painted background. There are no building sprites in the scene. See [World Systems & Pathfinding]({{ '/projects/crpg-realm/world-systems-and-pathfinding.html' | relative_url }}) for their coordinates and for how the pathfinder routes around them.

![Tactical battle arena]({{ '/assets/images/crpg-realm/tactical_battle_splash.png' | relative_url }}){: .robos-zoomable-img }
*TacticalBattle scene: party sprites, selection rings and enemy markers.*

---

## Gotchas

- **Regenerating is destructive.** See the warning above. Edit `data/v1/*.json` and `DataStoreV1.gd` directly instead.
- **Data does not drive rules.** Adding a spell, class or monster to JSON changes lists and tooltips, not combat. Spells are `match` branches in `CombatManager.gd`; class and race numbers are in `GameState.init_hero`.
- **Two Brand records.** `npcs.json` has both `blacksmith-brand` (from the package) and `npc-id-1` (used by the scene). Both point to the `blacksmith-inquiry` dialogue.
- **Items that are not in `items.json`.** The village's `GroundItem_Sword` uses `item-id-iron-sword`, and `GameState.init_hero` equips `robe` for casters. Neither id exists in `items.json`, so `get_item_data()` returns `null` for them.
- **Keep scenes flat.** Nesting NPCs, enemies or traps under a group node hides them from the state API and area-of-effect spells.

[Next: Infinity AI Agent & Test Harness →]({{ '/projects/crpg-realm/infinity-ai-agent-harness.html' | relative_url }})
