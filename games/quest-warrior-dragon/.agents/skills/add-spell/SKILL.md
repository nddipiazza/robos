---
name: add-spell
description: Workflow for defining spell stats in data/v1/spells.json, implementing battle and overworld spell handlers, and testing spell casting.
---

# 🪄 Add or Balance a Spell Skill

Use this skill when modifying spell stats, adding new magic spells, or adjusting battle spell effects.

## 📊 Data Source (`data/v1/spells.json`)

Spells are loaded at runtime by `BattleOverlay.gd` via `_load_known_spells(spell_ids)`:

```json
{
  "id": "hurt",
  "name": "HURT",
  "mp_cost": 2,
  "level_learned": 4,
  "target": "enemy",
  "effect": "Deals 5-12 magic damage to one enemy",
  "damage_min": 5,
  "damage_max": 12,
  "blocked_by": "resist_hurt (X/16)"
}
```

The 10 NES spells (`heal`, `hurt`, `sleep`, `radiant`, `stopspell`, `outside`, `return`, `repel`, `healmore`, `hurtmore`) are defined in `data/v1/spells.json`.

---

## ⚙️ Where Spell Logic Lives

- **Known Spells**: `GameState.spells: Array` holds unlocked spell IDs (e.g. `["heal", "hurt"]`).
- **Battle Spells**: `BattleOverlay._cast_spell(sp: Dictionary)` dispatches damage, healing, status effects, MP deduction, resistance checks (`resist_sleep`, `resist_stopspell`, `resist_hurt`), and spell animations (`_show_spell_anim()`).
- **Overworld Spells**: Non-combat spells (`outside`, `return`, `repel`) require handlers in map scripts' `_cmd_spell()`.

---

## 🧪 Testing Spells

Use `BattleTest` with the `--hero-spells` debug flag:

```bash
./debug.sh --scene BattleTest --monster slime --hero-spells "heal;hurt" --hero-mp 10 --hero-mp-max 10
```
