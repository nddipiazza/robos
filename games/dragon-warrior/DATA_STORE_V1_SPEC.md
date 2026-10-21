# Dragon Warrior NES — v1 Data Store Architecture & Specification

## Executive Overview

The Dragon Warrior (NES) recreation project uses a machine-readable, fully validated, AI generative-code ready **v1 Data Store**.

The **v1 Data Store Specifications** provide strict, Draft 2020-12 / Draft-07 compliant JSON Schemas for all 18 game data domains, save state milestones, and common shared definition objects. These schemas empower modern AI coding agents, game engines (Godot 4, Web, Python), type generators, and test suites to generate, validate, query, and refactor game data with zero ambiguity and strict structural guarantees.

---

## Directory Architecture

```
dragon-warrior/
├── schemas/
│   └── v1/                                  # ★ v1 JSON Schema Repository
│       ├── dragon_warrior_v1.schema.json    # Master root meta-schema
│       ├── common.schema.json               # ★ Shared $defs schema objects (NpcRole, TileType, FacingDirection, etc.)
│       ├── monsters.schema.json             # Monster stats, AI patterns, resistances
│       ├── spells.schema.json               # Player/Enemy spells & MP costs
│       ├── levels.schema.json               # Level 1–30 hero stat progression
│       ├── equipment.schema.json            # Weapons, armor, and shields
│       ├── items.schema.json                # Consumable and quest items
│       ├── locations.schema.json            # Towns, castles, dungeons metadata
│       ├── encounter_zones.schema.json      # World map zones & encounter pools
│       ├── map_grids.schema.json            # 2D tile matrix maps
│       ├── tiles_meta.schema.json           # Tile registry & walkability metadata
│       ├── registries.schema.json           # Spatial entity registries (stairs, doors, chests, shops, inns)
│       ├── npcs.schema.json                 # Unified NPC schema (placement, dialogue, interaction behavior)
│       ├── save_state.schema.json           # ★ Hero save state, boss defeat & story quest flags schema
│       ├── dialogue.schema.json             # NPC dialogue trees & branching
│       ├── combat_formulas.schema.json      # Physical combat, criticals, spell math
│       ├── name_system.schema.json          # Hero naming stat modifier tables
│       └── sprite_frames.schema.json        # Sprite sheet animation bounding boxes
│
├── data/
│   └── v1/                                  # ★ Validated v1 JSON Data Store
│
└── tools/
    └── validate_v1_schemas.py               # v1 Schema validation & data test suite (data + save states)
```

---

## Schema Contracts & Data Domains

### 1. Shared Definitions Schema (`common.schema.json`)
- **JSON Schema:** `https://json-schema.org/draft/2020-12/schema`
- **Identifier:** `https://dragonwarrior.org/schemas/v1/common.schema.json`
- **Purpose:** Centralized, reusable `$defs` schema enumerations imported via `$ref` across domain schemas:
  - `NpcRole`: Standardized NPC character role enum (`dragonlord`, `guard`, `king`, `lady`, `merchant`, `minister`, `pilgrim`, `princess`, `red_guard`, `sage`, `sage_alt`, `woman`, `man`, `soldier`, `trump_guard`).
  - `TileType`: Standardized terrain / map tile label enum (`barrier`, `brick`, `chest`, `dark`, `desert`, `dirt`, `door`, `forest`, `grass`, `hills`, `light_stone`, `misc`, `mountain`, `plains`, `roof`, `shore`, `stairs`, `stone`, `swamp`, `tree`, `wall`, `water`).
  - `FacingDirection`: Cardinal compass facing direction enum (`up`, `down`, `left`, `right`).
  - `EquipmentType`: Equipment type classification enum (`weapon`, `armor`, `shield`).
  - `ItemCategory`: Inventory item category enum (`consumable`, `quest`, `tool`, `key_item`, `equipment_bonus`, `cursed`).
  - `LocationType`: Location classification enum (`castle`, `town`, `cave`, `shrine`, `dungeon`, `castle_dungeon`).
  - `SpellTarget`: Spell target scope enum (`self`, `enemy`, `field`).
  - `InteractionType`: NPC interaction enum (`talk`, `save_game`, `restore_mp`, `shop`, `inn`, `princess_rescue`).

### 2. Master Root Schema (`dragon_warrior_v1.schema.json`)
- Entrypoint meta-schema linking all domain schemas and shared definitions via `$ref` pointers.

### 3. Save State & Story Flags Domain (`save_state.schema.json`)
Defines game save states, debug launcher milestones, and runtime hero progress snapshots:
- `name`, `description`, `scene`, `tile` (`"col,row"`), `facing` (`FacingDirection`).
- Hero stats: `heroName`, `heroLevel`, `heroHp`, `heroHpMax`, `heroMp`, `heroMpMax`, `heroStr`, `heroAgl`, `heroAtk`, `heroDef`, `heroExp`, `gold`.
- Equipment & Magic: `heroWeapon`, `heroArmor`, `heroShield`, `heroSpells`.
- Story & Quest Flags: `bridgeBuilt`/`bridge_built`, `kingIntroDone`/`king_intro_done`, `princessRescued`/`princess_rescued`.
- Boss Defeat Flags: `dragonlordDefeated`/`dragonlord_defeated`, `greenDragonDefeated`/`green_dragon_defeated`, `golemDefeated`/`golem_defeated`, `axeKnightDefeated`/`axe_knight_defeated`.
- World & Inventory flags: `items`, `openedChests`, `unlockedDoors`.

### 4. Monsters Domain (`monsters.schema.json`)
Defines the 40 combat monsters (Slime through Dragonlord):
- **Core Stats:** `id`, `key`, `name`, `strength`, `agility`, `hp_min`, `hp_max`, `xp`, `gp_min`, `gp_max`.
- **Combat Resistances:** `resist_sleep` (0–15), `resist_stopspell` (0–15), `resist_hurt` (0–15), `dodge` (0–64).
- **AI Action Patterns:** Evaluated in sequence; supports `attack`, `cast_spell`, `fire_breath`, `sleep`, `stopspell`, `heal`, `healmore`.
- **Run Chance Group:** `run_group` (1–4) for escape probability calculations.

### 5. Spells Domain (`spells.schema.json`)
Defines player and enemy magic:
- `id`, `name`, `mp_cost`, `level_learned`, `target` (`SpellTarget`), `effect`.
- Damage / Healing ranges (`damage_min`, `damage_max`, `hp_restore_min`, `hp_restore_max`).

### 6. Level Progression Domain (`levels.schema.json`)
Defines hero levels 1 through 30:
- `level` (1–30), `exp_required`.
- Stat growth bounds (`str_gain`, `agi_gain`, `hp_gain`, `mp_gain`).
- Unlocked `spell` name per level.

### 7. Equipment Domain (`equipment.schema.json`)
Unified schema for `weapons.json`, `armor.json`, and `shields.json`:
- `id`, `name`, `type` (`EquipmentType`).
- Stat bonuses: `attack` power, `defense` power.
- Economy: `cost` (Gold), `sold_in` locations list.

### 8. Items & Quest Items Domain (`items.schema.json`)
Unified schema for consumables and key story items:
- `id`, `name`, `category` (`ItemCategory`).
- `cost`, `stack_max`, `effect`, `duration_steps`, `summon_odds` (for Silver Harp).

### 9. Locations & Dungeons Domain (`locations.schema.json`)
Defines all 29 locations:
- `id`, `name`, `type` (`LocationType`).
- `inn_price`, `has_save`, `floors`, `npcs`, `shops`, `chests`, `floor_data`.

### 10. Encounter Zones Domain (`encounter_zones.schema.json`)
Defines overworld and dungeon random encounter mechanics:
- `grid`: 8x8 macro-zone grid for the 120x120 overworld map.
- `encounter_rates`: Step odds per terrain type.
- `monsters`: Monster encounter pool per zone.

### 11. Map Grids Domain (`map_grids.schema.json`)
Defines 2D tile matrix layouts (`rows`, `cols`, 2D `grid` tile ID arrays).

### 12. Tile Metadata Domain (`tiles_meta.schema.json`)
Metadata registry for all unique map tiles (`id`, `file`, `auto_label` -> `TileType`, `avg_rgb`, `maps`).

### 13. Spatial Entity Registries Domain (`registries.schema.json`)
Spatial positioning registries for stair connections, doors, chests, shops, and inns.

### 14. Non-Player Characters (NPCs) Domain (`npcs.schema.json`)
Unified schema for map NPCs:
- `id`, `col`, `row`, `facing` (`FacingDirection`), `role` (`NpcRole`), `tile` (`TileType`), `interaction_type` (`InteractionType`), `pages`.

### 15. Dialogue & Audio Domain (`dialogue.schema.json`)
NPC text trees and background music tracks (`music`, `npcs`).

### 16. Combat Engine Formulas Domain (`combat_formulas.schema.json`)
Mathematical specifications for physical attack formulas, critical hits, magic armor resistance, and run probabilities.

### 17. Hero Naming System Domain (`name_system.schema.json`)
Character-to-value mapping (0–15) and name modifier algorithms.

### 18. Sprite Frames Domain (`sprite_frames.schema.json`)
Sprite sheet animation bounding rectangles for hero, guards, citizens, princess, and battle monsters.

---

## AI Generative Code Workflow

The `v1` JSON Schemas are designed specifically for **AI Generative Code Workflows**:

1. **Automated Code & Type Generation:**
   Tools such as `quicktype`, `pydantic-encoder`, `ts-json-schema-generator`, or custom Godot GDScript generators can read `schemas/v1/*.schema.json` to generate strongly-typed DTOs and classes automatically.

2. **AI Model Prompting & Validation Context:**
   Passing `schemas/v1/*.schema.json` guarantees that AI generated JSON for new quests, save states, or monsters conforms to exact expected types.

---

## Validation Tooling

An automated validation suite is included in `tools/validate_v1_schemas.py`.

### Running Schema & Data Validation

To validate all 18 JSON Schemas, data files, and all 107 debug save states:

```bash
python3 tools/validate_v1_schemas.py
```
