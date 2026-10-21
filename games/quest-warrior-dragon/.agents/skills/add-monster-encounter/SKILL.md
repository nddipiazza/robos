---
name: add-monster-encounter
description: Workflow for defining monster stats in data/v1/monsters.json, configuring world map encounter zones, and testing battle mechanics.
---

# 👾 Add or Balance a Monster / World-Map Encounter Skill

Use this skill when adding new monsters, tuning enemy balance, adjusting encounter zones/rates, or setting up battle simulations.

## 📊 Monster Data Schema (`data/v1/monsters.json`)

Monsters are loaded at runtime by `BattleTest.gd` and `BattleOverlay.gd`:

```json
{
  "id": 0,
  "key": "slime",
  "name": "Slime",
  "strength": 5,
  "agility": 3,
  "hp_min": 3,
  "hp_max": 3,
  "xp": 1,
  "gp_min": 1,
  "gp_max": 1,
  "resist_sleep": 0,
  "resist_stopspell": 15,
  "resist_hurt": 0,
  "dodge": 1,
  "pattern": [ { "action": "attack", "chance": "always" } ],
  "run_group": 1
}
```

`key` is the string identifier used across code (`BattleOverlay.start_battle(monster_key, ...)`). Combat formulas are documented in `data/v1/combat_formulas.json` and `docs/formula_guide_ryan8bit.txt`.

---

## ⚔️ Testing a Monster in Isolation

Use `BattleTest.tscn` / `scripts/BattleTest.gd` via the debug runner:

```bash
./debug.sh --scene BattleTest --monster slime --hero-level 5 --hero-hp 20 --hero-hp-max 20
```

---

## 🗺️ World-Map Random Encounters

- **`data/v1/worldmap_zones.json`**: Maps the 124×124 overworld into an 8×8 grid of zone IDs (each cell covers 15×15 tiles).
- **`data/v1/encounter_zones.json`**: List of possible monster keys per zone pool.
- To modify encounter pools, update `monster_sets` in `data/v1/encounter_zones.json`.

---

## 🐲 Boss Monsters & Transformation

Scripted boss encounters (Green Dragon, Golem, Axe Knight, Dragonlord forms 1/2) are described in `data/bosses.json`. Multi-phase bosses use `BattleOverlay._dragonlord_transform()` logic for mid-fight transitions.
