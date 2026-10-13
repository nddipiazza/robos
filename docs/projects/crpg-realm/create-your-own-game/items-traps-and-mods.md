---
title: Items, traps and mods
layout: default
parent: Extending the CRPG
grand_parent: Realm of Heroes CRPG
nav_order: 2
description: The items.json format and what the code reads from it, equipment and AC, ground items and chests, how Trap nodes detect, disarm and spring, and what the mod loader merges.
redirect_from:
  - /projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html
  - /projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html
  - /projects/crpg-realm/create-your-own-game/07-modding-and-custom-content.html
---

# Items, traps and mods
{: .no_toc }

How items, loot, traps and mods work in the hand-built scenes of `games/crpg-realm`, with the steps to add each. The scenario engine reads some of the same data differently; see the [reference]({{ '/projects/crpg-realm/reference.html#data-v1-files' | relative_url }}).
{: .fs-6 }

## Items

### items.json

`data/v1/items.json` is a JSON array. `DataStoreV1.load_all_data()` turns each entry into `DataStore.items[id] = ItemData.from_dict(entry)`. A record:

```json
{
  "id": "service-sword",
  "title": "Royal Guard Service Sword",
  "category": "weapon",
  "weaponType": "melee",
  "equipSlot": "main_hand",
  "damageDice": "1d8",
  "damageType": "slashing",
  "properties": ["versatile"],
  "weight": 3,
  "acBonus": 0,
  "cost": 15,
  "icon": "assets/icons/weapons/longsword.png",
  "description": "Standard-issue steel military arming sword of the Oakhaven Royal Guard."
}
```

`ItemData` (`src/generated/v1/ItemData.gd`) keeps these keys and drops the rest. It also accepts the `robos:`-prefixed keys of the editor's JSON-LD items.

| Key | `ItemData` field | Used by |
|:---|:---|:---|
| `id`, `title`, `description` | `id`, `title`, `description` | Inventory, shop, log messages |
| `category` | `category` | `GameState.equip_item()` and `use_item()`: `weapon`, `armor`, `consumable`, `accessory`, and so on |
| `equipSlot` | `equip_slot` | Picks the shield (`off_hand`), helmet (`head`) and accessory (`accessory`, `ring`, `belt`, `eyes`) slots |
| `armorType` | `armor_type` | AC rules (below); `shield` and `helmet` select those slots |
| `acBonus` | `ac_bonus` | Armor base AC; shield bonus |
| `damageDice`, `damageType` | `damage_dice`, `damage_type` | Shown in the inventory, shop and character sheet. Combat damage does not use them. |
| `cost` | `cost` | Shop buy price (15 if the cost is 0). Selling pays half, rounded down. |
| `icon` | `icon_path`, `icon` | Icons. `res://` is prepended, so give a project-relative path. |
| `properties` | `properties` | `see_invisibility` and `truesight` are checked by `GameState` |
| `weight` | `weight` | Stored only |
| `model3dAsset`, `model3dSocket`, `model3dScale`, `model3dTint` | `model_3d_*` | Stored only. No GDScript reads them. |

The mesh shown on a pawn comes from `CharacterModel3D`, which matches the item id (an id containing `greatsword` gets `weapon_greatsword.glb`) or accepts a path ending in `.glb`. The keys `weaponType`, `range`, `healDice` and `use` in the file are not read by `ItemData`. (`ScenarioEngine` reads `rangeFeet`, `use` and `grants` from the raw data.)

### Inventory, slots and AC

![Item data flow from items.json through DataStoreV1 to ground items, the inventory and the character sheet]({{ '/assets/images/crpg-realm/crpg_items_inventory_pipeline.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today: `GameState.inventory` is a flat array of item ids, not a dictionary of slots, and a ground item takes its label and icon from its own exports rather than from `items.json`.*

All inventory state is in `GameState`: `inventory` is a flat array of item ids (three potions are three `"potion-healing"` entries), plus `equipped_weapon`, `equipped_armor`, `equipped_shield`, `equipped_helmet` and `equipped_accessory`. `add_item(id)` appends one id and logs "Acquired item". `has_item(id)` checks the inventory and the weapon, armor and accessory slots.

`equip_item()` chooses the slot in this order: weapon category, then shield, then helmet, then armor, then accessory. It swaps the old item back into the inventory.

`recalculate_hero_ac()` sets AC. With no armor, AC is 10 plus the DEX modifier. With armor, by `armorType`: `light` is `acBonus` plus DEX; `medium` is `acBonus` plus DEX capped at 2; `heavy` is `acBonus`; anything else is `acBonus` if above 0. A shield adds its `acBonus` (2 if that is 0). For example `chain-mail` is heavy with `acBonus` 16, and `shield` is `armorType: "shield"` with `acBonus` 2.

`use_item()` handles only consumables: `antidote` and `potion-antidote` remove `poisoned`; `potion-invisibility` applies `invisible` for 60 seconds; `potion-greater-healing` heals 4d4+4; any other consumable heals 2d4+2. The `use` and `healDice` keys are ignored.

The inventory window shows a 16-slot backpack grid with a weapon and an armor slot.

### Ground items, chests and corpses

![Ground item labels in VillageSquare during a test run]({{ '/assets/images/crpg-realm/house_wall_navigation.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`GroundItem` nodes in VillageSquare: "Militia Shortsword" and "Lesser Healing Draught" are labels set from each node's `item_name`.*

- `GroundItem` (`scenes/components/GroundItem.tscn`) exports `item_id`, `item_name`, `quantity`, `is_picked_up` and `icon_texture`. A left-click calls `pickup()`, which adds one copy of `item_id`, emits `item_picked_up` and frees the node. The label comes from `item_name` and the sprite from `icon_texture`, not from `items.json`. `quantity` is ignored, and there is no range check.
- `TreasureChest` (`scripts/TreasureChest.gd`) is an `Area2D` that, on the first left-click, sets `is_opened`, changes its `Label` to "[Chest Opened]" and emits `chest_opened`. The scene script decides what is inside: `AncientCatacombs.gd` connects the signal and calls `GameState.add_item("garrison-key")`. The node needs a child `Label`.
- Enemy corpses: `TacticalEnemy` exports `loot_gold` (25) and `loot_items` (`["potion-healing"]`), handed out by `loot_corpse()`.
- The shop: Blacksmith Brand's stock is the `shop_items` array in `scripts/ShopWindow.gd`, not data.

### Add an item

1. Append an object to `data/v1/items.json`. Mind the comma. Check the file with `python3 -m json.tool data/v1/items.json > /dev/null`.
2. To place it on the floor, instance `GroundItem.tscn` as a direct child of a scene root and set `item_id`, `item_name` and `icon_texture`. Always add the item to `items.json` first. The village's `GroundItem_Sword` uses `item-id-iron-sword`, which is not in `items.json`, so after pickup the inventory shows the raw id.
3. To put it in a chest, connect `chest_opened` in the scene script and call `GameState.add_gold()` and `GameState.add_item()`.
4. To sell it, add the id to `shop_items` in `ShopWindow.gd`.

Test it with steps that exist in `crpg_steps.py` and `infinity_ai_steps.py`:

```gherkin
Scenario: Pick up and equip the new sword
  Given an isolated test starting in scene "VillageSquare" with party "Lieutenant Vance" the "fighter"
  When the infinity ai agent picks up item "your-item-id"
  Then the party has acquired item "your-item-id"
  When the hero equips item "your-item-id"
  Then the hero has item "your-item-id" equipped
```

Other steps in `normal/04_shopkeeper_trading_economy_and_inventory.feature` cover shop prices and inventory counts.

## Traps

A trap is an instance of `scenes/components/Trap.tscn`: an `Area2D` running `scripts/Trap.gd`. The shipped scene `AncientCatacombs.tscn` places three: `PoisonDartTrap`, `GlyphOfWarding` and `SpikePitTrap`.

### Data

`Trap.gd` exports every number it needs: `trap_id`, `trap_name`, `trap_type`, `detect_dc` (13), `disarm_dc` (14), `save_stat` (`CON`), `save_dc` (13), `damage_dice_min` (2), `damage_dice_max` (12), `damage_type`, `status_effect`, `status_duration`, `detection_radius` (650 px) and `disarm_reach` (80 px). In `_ready()`, if `DataStore.traps` has an entry for `trap_id`, its values overwrite the exports. `data/v1/traps.json` has four: `poison-dart-trap`, `glyph-of-warding`, `spike-pit-trap` and `acid-spray-trap`. The last is not placed in any scene.

```json
{
  "id": "poison-dart-trap",
  "title": "Concealed Poison Dart Trap",
  "type": "floor",
  "detectDC": 13,
  "disarmDC": 14,
  "saveStat": "CON",
  "saveDC": 13,
  "damageFormula": "2d6",
  "damageMin": 2,
  "damageMax": 12,
  "damageType": "poison",
  "statusEffect": "poisoned",
  "statusDuration": 3,
  "description": "A pressure plate hidden beneath loose dungeon flagstones."
}
```

The code reads `title`, `detectDC`, `disarmDC`, `saveStat`, `saveDC`, `damageMin`, `damageMax`, `damageType`, `statusEffect` and `statusDuration`. Damage is a flat random integer between `damageMin` and `damageMax`, not a dice roll, and `type`, `damageFormula` and `description` are ignored. `statusDuration` is also ignored: a failed save always applies the status for 3.

### States

![Trap lifecycle from concealed, to sprung, to the state the HTTP API reports]({{ '/assets/images/crpg-realm/crpg_trap_disappear_lifecycle.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today: the JSON field names in the right-hand panel are illustrative, and a trap that has been disarmed or sprung is remembered in `GameState.neutralized_traps`.*

A trap is concealed (invisible), detected (red tint, pulsing, with a "[TRAP]" label), disarmed or triggered. A disarmed or sprung trap flashes (green or orange), fades out and is removed from play. `GameState.neutralized_traps` remembers it per scene, so it stays gone when you re-enter.

### Detection

A trap is found in one of two ways.

1. Find Traps mode. The rogue's toolbar button (`Find Traps`, then `Traps (ON)`) calls `GameState.set_detect_traps_mode()`. While it is on, `GameState` calls `pulse_trap_detection()` every 1.5 seconds. That calls `attempt_detection(name)` on every direct child of the scene that has it. The searcher is the first party member whose class is `rogue`, or the hero. `attempt_detection` fails if the searcher is more than `detection_radius` away, or if fog of war is on and the trap's position has not been explored or seen. Otherwise it calls `CombatManager.resolve_trap_detection()`, which rolls `max(10, d20)` plus the perception bonus against `detect_dc`. The bonus is `max(4, WIS modifier + proficiency)` for the hero (proficiency 4 for a rogue, else 2), 5 for "Bramble", and 4 for anyone else. The floor of 10 means the lowest total is 14, so a trap with `detectDC` 14 or less is always found on the first pulse in range.
2. The Find Traps spell. `find-traps` calls `reveal_trap()` on every direct child that has it, with no roll. When fog of war is on, it skips traps in unexplored, unseen areas. The route differs by scene: the HTTP `cast_spell` action runs its own loop when the scene's `CombatManager` has no `cast_spell` method, and `TacticalBattle` goes through the `"find-traps"` branch of `CombatManager.execute_cast_spell`. The toolbar Spell button calls `cm.cast_spell("find-traps", ...)`, and `CombatManager` defines no method of that name, so from the toolbar it raises a runtime error in any scene that has a `CombatManager`.

### Disarming

Left-clicking a detected trap sends the thief to `approach_and_disarm()`, which walks to 55 px from the trap and calls `disarm_trap()`. Clicking a concealed trap just moves the hero there, and they may walk onto it. `disarm_trap()` refuses beyond `disarm_reach` (80 px). The roll is `max(10, d20)` plus a tools bonus (`max(5, DEX modifier + proficiency)` for the hero, 5 for everyone else) against `disarm_dc`. Two consequences: the lowest total is 15, so every trap with a disarm DC of 15 or less is disarmed on the first try, and a natural fumble cannot happen. Only the test API's `fumble` argument forces one, and a forced fumble springs the trap on the disarmer.

### Springing

`force_trigger()` has three callers. Walking onto the trap (`_on_body_entered`) allows up to 78 px. Scripted triggers (`trigger_trap` action, `walk_over_and_trigger`) allow 54 px. A fumbled disarm has no limit. Any `CharacterBody2D` whose name does not contain "ghost" or "npc" springs it, including a patrolling enemy.

The save bonus is 2 for everyone except the hero, whose bonus is the ability modifier for `save_stat` plus 2 if the class is proficient (fighter: STR and CON; rogue: DEX and INT; others: WIS and CHA). `resolve_trap_trigger()` rolls a d20 against `save_dc`. A passed save halves the damage, rounded up. A failed save takes full damage and applies the status. Damage lands on the hero or on a matching `party_members` entry.

### Add a trap

1. Append an entry to `data/v1/traps.json` with a unique `id` and the keys above.
2. Instance `Trap.tscn` as a direct child of the scene root, name it, and set `trap_id`. Set the other exports to the same values: the JSON wins at runtime, but the exports are the fallback and what the editor shows.
3. In a scene other than `AncientCatacombs`, copy its loop in `_ready()` that connects `trap_detected`, `trap_disarmed` and `trap_triggered` on every `Trap` child (with `const TrapClass = preload("res://scripts/Trap.gd")`).
4. Give the scene a `CombatManager` child. Without one, `Trap` builds a detached `CombatManager.new()` each time.

Verify with the steps in `normal/12_infinity_engine_traps_detection_and_disarm.feature`:

```gherkin
Scenario: The new trap is revealed and disarmed
  Given an isolated test starting in scene "AncientCatacombs" with party "Bramble" the "rogue"
  When the trap "your-trap-id" is revealed
  And the player orders "Bramble" to disarm trap "your-trap-id"
  Then the party member is standing next to trap "your-trap-id"
```

Do not assert `the trap "..." is disarmed` for a trap whose disarm DC is above 15, because that roll can fail.

## Mods

![Mod and trap data flow from mod.json and traps.json through DataStoreV1 to the Trap node and its detect, disarm and trigger steps]({{ '/assets/images/crpg-realm/crpg_modding_and_traps_architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today: the mod loader reads only `traps_file` from a `mod.json`.*

`DataStoreV1.load_mods()` scans `res://mods/` (inside the project) and then `user://mods/`. Every subfolder that has a `mod.json` is a mod. A missing folder is skipped without error. `_load_single_mod()` stores the manifest in `DataStore.loaded_mods` and prints the mod's `name` and `version`. The only key that loads data is `traps_file`, a path relative to the mod folder to a JSON array of trap objects, in the same shape as `traps.json`.

The shipped example is `mods/catacomb-traps-mod/`:

```json
{
  "id": "catacomb-traps-mod",
  "name": "Catacomb Traps & Dungeon Hazards Mod",
  "version": "1.0.0",
  "author": "Lead System Architect",
  "description": "Adds extra lethal dungeon traps ...",
  "traps_file": "traps.json"
}
```

Its `traps.json` adds one trap, `thunder-tripwire`, which no scene places. The manifest's description mentions "custom status conditions and expanded disarm checks", but the loader does not read them.

What a mod can do:

- Replace a placed trap's numbers. An entry with an existing id replaces the whole base entry, so include every key. A `user://mods/<id>/traps.json` entry for `spike-pit-trap` with a higher `disarmDC` changes the spike pit in `AncientCatacombs` without touching the scene. `user://mods/` is read after `res://mods/`, so it wins. The order between two mods in one folder is whatever `DirAccess` returns.
- Register a new trap id. It does nothing until a `Trap.tscn` instance with that `trap_id` sits in a scene.

What it cannot do: add items, spells, monsters, NPCs, dialogue, quests, scenes or scripts, place anything on a map, or be disabled. A malformed `mod.json`, a wrong `traps_file` path or a non-array file fails silently. Success prints `DataStoreV1: Successfully loaded mod -> ...` and `Mod [id]: Registered custom trap -> ...` to Godot's output (`tests/e2e/reports/godot_output.log` under the tests).

`user://` is Godot's per-user data folder, named after `config/name` in `project.godot`. On Linux it is `~/.local/share/godot/app_userdata/<project name>/`. The project name contains a colon, which some systems do not allow, so in the editor use Project, Open User Data Folder to find the real path, and create `mods/` there.

The web export preset (`export_presets.cfg`) includes `*.json` and `*.jsonld` files, so mods placed under `mods/` in the project are packed into a browser build.
