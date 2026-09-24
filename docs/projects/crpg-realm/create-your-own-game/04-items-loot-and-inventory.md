---
title: "4. Items & Inventory"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 4
permalink: /projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html
description: The real items.json format, ItemData, inventory and equip slots, how AC is set, and how to place ground items and chests.
---

# 4. Items, Inventory & D&D 5e Equipment System
{: .no_toc }

In this chapter you add a new weapon to `data/v1/items.json`, leave it on the floor of the Sunken Vault, and put gold and a potion in a chest. You'll learn which item fields the game actually reads, how equipping works, and which item behaviours are still hard-coded by id.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

![Ground item labels in VillageSquare during a BDD run]({{ '/assets/images/crpg-realm/house_wall_navigation.png' | relative_url }}){: .robos-zoomable-img }
*`GroundItem` nodes in VillageSquare: "Militia Shortsword" and "Lesser Healing Draught" are labels set from each node's `item_name`.*

### items.json

`data/v1/items.json` is a **JSON array** of item objects. `DataStoreV1.load_all_data()` loops over it and stores each one as `DataStore.items[id] = ItemData.from_dict(entry)`. A real entry:

[data/v1/items.json](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/data/v1/items.json)

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

`ItemData.from_dict()` copies these keys; everything else in the JSON is dropped at load time:

[src/generated/v1/ItemData.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/src/generated/v1/ItemData.gd)

| JSON key | `ItemData` property | Default | Used by |
|:---|:---|:---|:---|
| `id` | `id` | `""` | everything |
| `title` | `title` | `""` | inventory, shop, log messages |
| `category` | `category` | `"weapon"` | `use_item()`, `equip_item()` |
| `equipSlot` | `equip_slot` | `"main_hand"` | stored only |
| `damageDice` | `damage_dice` | `""` | shown in inventory and character sheet |
| `damageType` | `damage_type` | `""` | stored only |
| `acBonus` | `ac_bonus` | `0` | sets `hero_ac` when armour is equipped |
| `cost` | `cost` | `10` | shop buy price; sell price is half |
| `icon` | `icon_path` and `icon` | `""` | inventory and shop icons (`"res://"` is prepended) |
| `description` | `description` | `""` | inventory details |
| `properties` | `properties` | `[]` | `"see_invisibility"` / `"truesight"` checked by `can_see_invisible()` |
| `weight` | `weight` | `0` | stored only |

Keys that appear in the file but are **not** read: `weaponType`, `armorType`, `range`, `effect`, `effectValue`, `healDice`, `grants_see_invisibility`.

Categories in use: `weapon`, `armor`, `consumable`, `accessory`, `tool`, `quest`, `key`. `equipSlot` values in use: `main_hand`, `off_hand`, `chest`, `head`, `ring`, `belt`, `bag`, `accessory`, `none`.

### Inventory and equip slots

All inventory state lives in `GameState`:

[scripts/GameState.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GameState.gd)

```gdscript
var inventory: Array = ["potion-healing"]
var equipped_weapon: String = "service-sword"
var equipped_armor: String = "chain-mail"
var equipped_accessory: String = ""
```

`inventory` is a flat Array of item ids; duplicates are separate entries (three healing potions = three `"potion-healing"` strings). `add_item(item_id)` appends one id, emits `inventory_changed` and logs "Acquired item: …". `remove_item(item_id)` erases one. `has_item(item_id)` checks the inventory and all three slots.

`InventoryWindow` (opened with the ITEMS button on the HUD; `I`, `B` or `Esc` closes it) shows the first 16 entries, a weapon slot and an armour slot, with Use, Equip and Drop buttons.

### Equipping and AC

`GameState.equip_item()` picks the slot from `category`, swaps the old item back into the inventory, and for armour sets AC directly:

```gdscript
	if item.category == "weapon":
		var old_weap = equipped_weapon
		inventory.erase(item_id)
		equipped_weapon = item_id
		# ...
	elif item.category == "armor":
		var old_arm = equipped_armor
		inventory.erase(item_id)
		equipped_armor = item_id
		hero_ac = item.ac_bonus if item.ac_bonus > 0 else (12 + get_stat_modifier(ability_scores.get("DEX", 10)))
		# ...
	elif item.category in ["accessory", "equipment", "gear", "head", "ring"] or item.get("equipSlot") in ["accessory", "head", "ring", "belt", "eyes"]:
		var old_acc = equipped_accessory
		# ...
```

So armour `acBonus` is the **total AC**, not a bonus (`chain-mail` is 16, `leather-armor` is 11). There is no Dex cap or shield stacking. `unequip_item("armor")` resets AC to `10 + DEX modifier`.

### Using items

`GameState.use_item()` handles only `consumable` items, by id:

- `antidote` / `potion-antidote` — removes `poisoned`.
- `potion-invisibility` — applies `invisible` for 60 seconds.
- `potion-greater-healing` — heals 4d4+4.
- **any other consumable** — heals 2d4+2.

Weapons and armour passed to `use_item()` are equipped instead.

### Ground items

`scenes/components/GroundItem.tscn` is an `Area2D` with a 24 px circle, a `Sprite` and a `Label`.

[scripts/GroundItem.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GroundItem.gd)

```gdscript
class_name GroundItem
extends Area2D

signal item_picked_up(item_id: String, item_name: String)

@export var item_id: String = "item-1"
@export var item_name: String = "Item"
@export var quantity: int = 1
@export var is_picked_up: bool = false
@export var icon_texture: Texture2D = null
# ...

func pickup() -> bool:
	if is_picked_up:
		return false
	is_picked_up = true
	GameState.add_item(item_id)
	item_picked_up.emit(item_id, item_name)
	# ...
	queue_free()
	return true

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		pickup()
```

The label comes from `item_name` and the sprite from `icon_texture` — neither is looked up from `items.json`.

### Chests

`scripts/TreasureChest.gd` is small: a left click sets `is_opened`, changes `$Label` to "[Chest Opened]" and emits `chest_opened` once. The **scene script** decides what's inside:

[scripts/AncientCatacombs.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/AncientCatacombs.gd)

```gdscript
	if sarcophagus:
		sarcophagus.chest_opened.connect(func():
			GameState.add_item("garrison-key")
			show_notice("Recovered Ancient Garrison Key from the Royal Sarcophagus!")
			# ...
		)
```

`Homestead.gd` does the same for the footlocker in `open_footlocker()`.

Enemy corpses are a third loot source: `TacticalEnemy` has `@export var loot_gold` (25) and `@export var loot_items` (`["potion-healing"]`), handed out by `loot_corpse()`.

---

## Step by step: loot in the Sunken Vault

### 1. Add the item

Append an object to the array in `data/v1/items.json` (mind the comma after the previous entry):

```json
{
  "id": "drowned-kings-blade",
  "title": "Drowned King's Blade",
  "category": "weapon",
  "equipSlot": "main_hand",
  "damageDice": "1d8",
  "damageType": "slashing",
  "properties": ["versatile"],
  "weight": 3,
  "acBonus": 0,
  "cost": 120,
  "icon": "assets/icons/weapons/longsword.png",
  "description": "A corroded longsword recovered from the vault floor."
}
```

`icon` is relative to the project root with no `res://`.

### 2. Put it on the floor

In `scenes/SunkenVault.tscn`, instance `scenes/components/GroundItem.tscn` as a **direct child of the root** and set:

| Property | Value |
|:---|:---|
| name | `GroundItem_KingsBlade` |
| `position` | somewhere reachable, e.g. `Vector2(1280, 720)` |
| `item_id` | `drowned-kings-blade` |
| `item_name` | `Drowned King's Blade` |
| `icon_texture` | `res://assets/icons/weapons/longsword.png` |

### 3. Add a chest

Add an `Area2D` named `VaultChest` under the root, attach `scripts/TreasureChest.gd`, and give it three children (copy them from `GrandSarcophagus` in `AncientCatacombs.tscn`):

- `Sprite` (`Sprite2D`) with `res://assets/props/chest_closed.png`
- `CollisionShape2D` with an 80×80 `RectangleShape2D`
- `Label` (`Label`) — required, the script writes to `$Label`

Then fill it from the scene script. New code — add to `scripts/SunkenVault.gd`:

```gdscript
@onready var vault_chest = $VaultChest

# at the end of _ready():
	vault_chest.chest_opened.connect(func():
		GameState.add_gold(50)
		GameState.add_item("potion-healing")
		GameState.add_chest()
		GameState.log_message("item", "Found 50 gold and a Potion of Healing in the vault chest.")
	)
```

### 4. Optional: sell it in the shop

Blacksmith Brand's stock is a hard-coded list, `shop_items` in `scripts/ShopWindow.gd`. Add `"drowned-kings-blade"` to it. The buy price is `cost` (120); selling returns half, rounded down.

---

## Verify it

Existing coverage:

- Picking up a ground item — `item-id-1` in `VillageSquare`:
  ```bash
  python3 run_cucumber_tests.py tests/e2e/features/normal/10_house_wall_collision_pathfinding.feature
  ```
- Buying and selling, prices and inventory counts:
  ```bash
  python3 run_cucumber_tests.py tests/e2e/features/normal/04_shopkeeper_trading_economy_and_inventory.feature
  ```
- Equipping an accessory (`gem-of-seeing`):
  ```bash
  python3 run_cucumber_tests.py tests/e2e/features/normal/17_invisible_enemy_and_sanctuary_targeting.feature
  ```

For your changes, new code — `tests/e2e/features/normal/19_sunken_vault_loot.feature`:

```gherkin
@isolated @items
Feature: Sunken Vault loot

  Background:
    Given the cRPG game is running and healthy
    And an isolated test starting in scene "SunkenVault" with party "Lieutenant Vance" the "fighter"
    Then the current scene is "SunkenVault"

  Scenario: Pick up and equip the Drowned King's Blade
    When the infinity ai agent picks up item "drowned-kings-blade"
    Then the party has acquired item "drowned-kings-blade"
    When the hero equips item "drowned-kings-blade"
    Then the hero has item "drowned-kings-blade" equipped

  Scenario: Open the vault chest
    When the infinity ai agent picks up item "VaultChest"
    Then the player has 200 gold
    And the player inventory count for "potion-healing" is 2
```

```bash
python3 run_cucumber_tests.py tests/e2e/features/normal/19_sunken_vault_loot.feature
```

The `picks up item` step sends `pickup_item`. The server finds the target by `item_id`, `door_id`, `chest_id` and other id properties, or by node name, walks to it, and then calls `pickup()` if the node has it, otherwise emits `chest_opened` for a chest. That is why the node name `VaultChest` works. The isolated step starts you with 150 gold and one `potion-healing`.

---

## Gotchas

- **`damageDice` does not affect combat.** Attack damage is passed as numbers by each scene script (for example `combat_mgr.execute_attack(GameState.hero_name, 8, 22, 30, ...)` in `AncientCatacombs.gd`). The dice string is display-only.
- **The shield replaces your armour.** `shield` has `category: "armor"` and `acBonus: 2`, so equipping it puts it in `equipped_armor` and sets AC to 2.
- **New consumables heal by default.** Unless you add a branch for your id in `GameState.use_item()`, any `consumable` heals 2d4+2. `healDice` and `effect` in the JSON are ignored.
- **`GroundItem` doesn't validate `item_id`.** `VillageSquare`'s `GroundItem_Sword` uses `item-id-iron-sword`, which is not in `items.json`; after pickup the inventory shows the raw id. Always add the item to `items.json` first.
- **`quantity` is ignored.** `pickup()` adds exactly one copy.
- **Pickup has no range check.** A click on the item's collision circle picks it up wherever the hero is.
- **Chest properties in the `.tscn` do nothing.** `GrandSarcophagus` sets `chest_id`, `contains_item` and `contains_gold`, but `TreasureChest.gd` doesn't declare them. The loot comes from the `chest_opened` handler in the scene script.
- **Only 16 slots are shown.** `inventory` can grow beyond 16; `InventoryWindow` only draws the first 16.

---

[← Previous: 3. Maps and isometric geometry]({{ '/projects/crpg-realm/create-your-own-game/03-maps-and-isometric-geometry.html' | relative_url }}) · [Next: 5. Traps →]({{ '/projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html' | relative_url }})
