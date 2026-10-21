---
name: add-item-or-equipment
description: Guidelines and instructions for adding consumables, key items, weapons, armor, or shields to data files and code handlers.
---

# 🛡️ Add an Item, Weapon, Armor, or Shield Skill

Use this skill when adding or modifying consumables, key items, weapons, armor, or shields in the Dragon Warrior project.

## 📊 Data Files (Loaded at runtime for shops)

| File | Item Type | Key Fields |
|---|---|---|
| `data/v1/items.json` | Consumables & key items (Herb, Torch, Magic Key, Fairy Water, etc.) | `id`, `name`, `category` (`consumable`/`key_item`/`tool`), `cost`, `effect`, `stack_max`, `sold_in` |
| `data/v1/weapons.json` | Weapons | `id`, `name`, `type: "weapon"`, `attack`, `cost`, `sold_in` |
| `data/v1/armor.json` | Body armor | `id`, `name`, `type: "armor"`, `defense`, `cost`, `sold_in` |
| `data/v1/shields.json` | Shields | `id`, `name`, `type: "shield"`, `defense`, `cost`, `sold_in` |

`sold_in` is a list of town names — keep it consistent with any `data/v1/shops.json` entries that reference the item's `id` (see `add-shop` skill).

---

## 🎒 Inventory Representation in Code

Non-equipped inventory items are plain dicts appended to `_inventory` in map scripts — e.g. `{"name": "Herb", "type": "consumable", "desc": "Restores HP."}`. The `type` field drives special handling in `_use_item()`:
- `"key"` → consumed to open a door (see `add-locked-door` skill).
- anything else → shows `item.get("desc", ...)` as a generic-use dialog line.

---

## ⚔️ Equipping Weapons / Armor

- `GameState.weapon: String` / `GameState.armor: String` hold the currently equipped item id (set via debug flags `--hero-weapon` / `--hero-armor`, or from a save state).
- Combat math already expects these fields: see `hero_attack_power` / `hero_defense_power` formulas in `data/v1/combat_formulas.json` (`hero_strength + weapon_attack`, `floor(hero_agility/2) + armor_defense + shield_defense + dragons_scale_bonus`).

---

## 📋 Steps to Add a Brand-New Item

1. Add an entry to the correct `data/v1/*.json` file above, matching the existing schema exactly.
2. If it should be purchasable, add an `{ "item_id": ..., "price": ... }` entry to the relevant shop(s) in `data/v1/shops.json`.
3. If it has a unique battle/overworld effect (e.g., Fairy Flute putting Golem to sleep, Rainbow Drop building the bridge), implement that effect directly in the relevant scene/battle script.
