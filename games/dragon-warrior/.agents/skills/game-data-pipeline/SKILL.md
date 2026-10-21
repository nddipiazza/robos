---
name: game-data-pipeline
description: Workflow and instructions for editing JSON Schemas, validating game data, understanding live vs reference datasets, and generating typed GDScript model classes under src/generated/v1/.
---

# 📊 Game Data Pipeline & Schema Generation Skill

Use this skill when modifying game data schemas, JSON datasets (monsters, items, spells, shops, maps), or regenerating typed GDScript data classes.

## 🗂️ Three Layers of Project Data

1. **Scraped Source Pages** (`monsters/`, `spells/`, `arms/`, `items/`, `locations/`, etc.): Reference material scraped from strategy guide archives. Treat as read-only background documentation.
2. **Consolidated Clean JSON** (`data/v1/*.json`):
   - **Live Runtime Datasets**: Loaded dynamically at runtime by scripts (`data/v1/monsters.json`, `data/v1/spells.json`, `data/v1/weapons.json`, `data/v1/armor.json`, `data/v1/shields.json`, `data/v1/items.json`, `data/v1/shops.json`, `data/v1/combat_formulas.json`, `data/v1/encounter_zones.json`).
3. **Per-Map Registries** (`data/v1/chest_registry.json`, `data/v1/door_registry.json`, `data/v1/npcs.json`, `data/v1/stair_registry.json`, `data/v1/dialogue.json`):
   - Reference coordinate & dialogue records. Note that some older maps hardcode tile interactions directly in GDScript; keep data JSON and scripts aligned.

---

## 📁 Schema Architecture & GDScript Generation

- **JSON Schemas**: `schemas/v1/*.json`
- **Game Data Files**: `data/v1/*.json`
- **Generated GDScript Classes**: `src/generated/v1/*.gd`
- **Generator Script**: `./generate-schema-classes.sh`

---

## 🔄 Regenerating GDScript Data Models

Whenever you add, modify, or remove fields in `schemas/v1/`:

1. Run the generation script:
   ```bash
   ./generate-schema-classes.sh
   ```
2. Verify that updated GDScript files in `src/generated/v1/` compile clean without syntax errors.

> [!WARNING]
> Do NOT manually edit files under `src/generated/v1/` as they will be overwritten by `generate-schema-classes.sh`.
