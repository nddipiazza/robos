---
title: "7. Modding"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 7
permalink: /projects/crpg-realm/create-your-own-game/07-modding-and-custom-content.html
description: "How DataStoreV1.load_mods() finds mod.json manifests in res://mods and user://mods, what it merges (traps only), and how to extend it."
---

# 7. Modding: Mod Folders and Trap Packs
{: .no_toc }

The game has a small mod loader. At startup it reads every `mod.json` it finds and merges that mod's traps into `DataStore.traps`. This chapter shows exactly what the loader does, walks through building a trap mod, explains where `user://mods` lives on disk, and shows how to extend the loader to merge items too.
{: .fs-6 .fw-300 }

![Illustration of the mod and trap data flow]({{ '/assets/images/crpg-realm/crpg_modding_and_traps_architecture.jpg' | relative_url }}){: .robos-zoomable-img }
*AI-generated overview illustration. The text on this page describes the actual code.*

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

The loader is part of the `DataStore` autoload, [src/generated/v1/DataStoreV1.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/src/generated/v1/DataStoreV1.gd). Autoloads are ready before the main scene, so mod data is in place before any `Trap` node runs `_ready()`.

```gdscript
var traps: Dictionary = {} # id -> Dictionary
var loaded_mods: Array[Dictionary] = []

func _ready() -> void:
    load_all_data()
    load_mods()
```

### Discovery: `load_mods()`

[src/generated/v1/DataStoreV1.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/src/generated/v1/DataStoreV1.gd)
```gdscript
func load_mods() -> void:
    var mod_dirs = ["res://mods/", "user://mods/"]
    for base_dir in mod_dirs:
        var dir = DirAccess.open(base_dir)
        if not dir:
            continue
        dir.list_dir_begin()
        var entry = dir.get_next()
        while entry != "":
            if dir.current_is_dir() and not entry.begins_with("."):
                var manifest_path = base_dir + entry + "/mod.json"
                if FileAccess.file_exists(manifest_path):
                    _load_single_mod(manifest_path, base_dir + entry + "/")
            entry = dir.get_next()
```

The loader checks two roots in this order: `res://mods/` (inside the project, `games/crpg-realm/mods/`) and then `user://mods/` (the per-user data folder, see [below](#where-user-is-on-disk)). Every subfolder that contains a `mod.json` is a mod. A missing root is skipped without error.

### Loading: `_load_single_mod()`

[src/generated/v1/DataStoreV1.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/src/generated/v1/DataStoreV1.gd)
```gdscript
func _load_single_mod(manifest_path: String, mod_dir: String) -> void:
    var f = FileAccess.open(manifest_path, FileAccess.READ)
    if not f:
        return
    var manifest = JSON.parse_string(f.get_as_text())
    if not manifest is Dictionary:
        return
    manifest["base_dir"] = mod_dir
    loaded_mods.append(manifest)
    print("DataStoreV1: Successfully loaded mod -> %s v%s" % [manifest.get("name", "Unknown"), manifest.get("version", "1.0.0")])

    # Merge custom traps from mod if present
    if manifest.has("traps_file"):
        var tf = mod_dir + manifest["traps_file"]
        if FileAccess.file_exists(tf):
            var file_trap = FileAccess.open(tf, FileAccess.READ)
            var parsed_traps = JSON.parse_string(file_trap.get_as_text())
            if parsed_traps is Array:
                for t in parsed_traps:
                    traps[t["id"]] = t
                    print("Mod [%s]: Registered custom trap -> %s" % [manifest.get("id", ""), t.get("id", "")])
```

What this means in practice:

- **`traps_file` is the only key that loads data.** It is a path relative to the mod folder, pointing to a JSON **array** of trap objects. These are the same shape as `data/v1/traps.json` (see [chapter 5]({{ '/projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html' | relative_url }})).
- **Other manifest keys are metadata.** `name` and `version` are printed. `id` is used in the per-trap print line. Everything else, like `author` and `description`, is stored in `DataStore.loaded_mods` along with an added `base_dir`, and nothing in the game reads it.
- **Later entries win.** `traps[t["id"]] = t` overwrites. A mod trap with the same `id` as a base trap replaces it. Because `user://mods/` is scanned after `res://mods/`, a user mod beats a bundled mod. Between two mods in the same root, the winner depends on the order `DirAccess` returns folders, which you shouldn't rely on.
- **Bad input fails quietly.** If `mod.json` doesn't parse to a Dictionary, the mod is skipped and the loader prints nothing about it. A trap file that isn't an array is ignored. There is no schema check.

### The shipped example

[mods/catacomb-traps-mod/mod.json](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/mods/catacomb-traps-mod/mod.json)
```json
{
  "id": "catacomb-traps-mod",
  "name": "Catacomb Traps & Dungeon Hazards Mod",
  "version": "1.0.0",
  "author": "Lead System Architect",
  "description": "Adds extra lethal dungeon traps (concealed thunder tripwires, corrosive acid spray), custom status conditions, and expanded disarm checks.",
  "traps_file": "traps.json"
}
```

[mods/catacomb-traps-mod/traps.json](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/mods/catacomb-traps-mod/traps.json)
```json
[
  {
    "id": "thunder-tripwire",
    "title": "Concealed Thunder Tripwire",
    "type": "floor",
    "detectDC": 14,
    "disarmDC": 14,
    "saveStat": "DEX",
    "saveDC": 13,
    "damageFormula": "2d8",
    "damageMin": 2,
    "damageMax": 16,
    "damageType": "thunder",
    "statusEffect": "stunned",
    "statusDuration": 1,
    "description": "A taut silver wire strung between dungeon flagstones. Severing it triggers a concussive thunderwave blast."
  }
]
```

The manifest's `description` promises "custom status conditions, and expanded disarm checks", but the mod only adds one trap, `thunder-tripwire`. No scene places that trap yet, so it has no effect in play (see the next section).

### A trap in data is not a trap in the world

Merging into `DataStore.traps` only registers the numbers. A trap appears in the game only when a `Trap.tscn` instance in a scene has its `trap_id` export set to that id. `Trap._sync_data_store()` then copies the values in `_ready()`. A mod therefore can't add a trap to a map on its own. Someone has to place a `Trap.tscn` instance with the matching `trap_id` in a scene.

The reverse is useful: a mod **can** change a trap that is already placed. For example, a `user://mods/harder-catacombs/traps.json` containing a `spike-pit-trap` entry with `"disarmDC": 18` makes the spike pit in AncientCatacombs harder to disarm, and you don't have to touch the scene.

---

## Step by step: make a trap mod

This example rebalances the existing glyph and adds a new trap that you place yourself.

1. **Create the folder.** For a mod you ship with the game, use `games/crpg-realm/mods/<your-mod-id>/`. For a local-only mod, use `<user data dir>/mods/<your-mod-id>/` ([see below](#where-user-is-on-disk)). The folder name must not start with `.`.

2. **Write `mod.json`:**
   ```json
   {
     "id": "deadly-glyphs",
     "name": "Deadly Glyphs",
     "version": "1.0.0",
     "author": "You",
     "description": "Harder Glyph of Warding plus a frost rune.",
     "traps_file": "traps.json"
   }
   ```

3. **Write `traps.json`** next to it. It must be a top-level array. Include every key `Trap._sync_data_store()` reads (`title`, `detectDC`, `disarmDC`, `saveStat`, `saveDC`, `damageMin`, `damageMax`, `damageType`, `statusEffect`, `statusDuration`), because an entry replaces the whole base object and doesn't merge field by field.
   ```json
   [
     {
       "id": "glyph-of-warding",
       "title": "Glyph of Warding (Explosive Runes)",
       "type": "glyph",
       "detectDC": 17, "disarmDC": 17,
       "saveStat": "DEX", "saveDC": 15,
       "damageFormula": "4d8", "damageMin": 4, "damageMax": 32,
       "damageType": "fire", "statusEffect": "", "statusDuration": 0,
       "description": "A stronger glyph."
     },
     {
       "id": "frost-rune",
       "title": "Frost Rune",
       "type": "glyph",
       "detectDC": 15, "disarmDC": 15,
       "saveStat": "CON", "saveDC": 14,
       "damageFormula": "3d6", "damageMin": 3, "damageMax": 18,
       "damageType": "cold", "statusEffect": "restrained", "statusDuration": 1,
       "description": "A pale rune that freezes whoever steps on it."
     }
   ]
   ```
   `glyph-of-warding` takes effect as soon as the game starts, because the glyph is already placed in AncientCatacombs.

4. **Place the new trap.** For `frost-rune`, open `scenes/AncientCatacombs.tscn` (or your own scene). Instance `scenes/components/Trap.tscn` as a **direct child of the scene root** and set its `trap_id` to `frost-rune`. Fill in the other exports too. They are used if the mod is missing, so the trap still has sensible values on a machine without it.

5. **Run the game** and check the log lines described in [Verify it](#verify-it).

---

## Where `user://` is on disk

`user://` is Godot's per-user data folder. This project doesn't set a custom user directory, so Godot uses its default location and builds the folder name from `config/name` in `project.godot`, which is `Realm of Heroes: A Night Without Memory`:

| OS | Default location of `user://` |
|:--|:--|
| Linux | `~/.local/share/godot/app_userdata/<project name>/` |
| Windows | `%APPDATA%\Godot\app_userdata\<project name>\` |
| macOS | `~/Library/Application Support/Godot/app_userdata/<project name>/` |

So user mods go in `.../app_userdata/<project name>/mods/<mod-id>/mod.json`.

{: .tip }
The project name contains a colon, which isn't allowed in folder names on some systems. Godot may change it when it creates the folder. Don't guess the path: in the editor, use **Project → Open User Data Folder**, or print `OS.get_user_data_dir()` from any script. Create a `mods` folder inside whatever that shows.

---

## Verify it

Each mod prints to Godot's standard output at startup:

```
DataStoreV1: Successfully loaded mod -> Catacomb Traps & Dungeon Hazards Mod v1.0.0
Mod [catacomb-traps-mod]: Registered custom trap -> thunder-tripwire
```

Run `./play.sh` from `games/crpg-realm` in a terminal to see these lines. During a test run they go to `tests/e2e/reports/godot_output.log`.

To check a placed trap's final numbers, open AncientCatacombs through the API and read its state. The `traps` array in `/api/v1/state` comes from `Trap.get_trap_info()` and includes `detect_dc`, `disarm_dc`, `save_stat` and `save_dc`:

```bash
curl -s -X POST localhost:8080/api/v1/setup_state -H 'Content-Type: application/json' \
     -d '{"state_spec": "catacombs"}'
curl -s localhost:8080/api/v1/state | python3 -c "import json,sys; [print(t['id'], t['detect_dc'], t['disarm_dc']) for t in json.load(sys.stdin)['traps']]"
```

After the Deadly Glyphs mod, `glyph-of-warding` should show `17 17`. The trap feature, `tests/e2e/features/normal/12_infinity_engine_traps_detection_and_disarm.feature`, still passes with that mod: its fumble scenario forces the result, and its disarm scenario uses `poison-dart-trap`. A mod that raises `poison-dart-trap` above disarm DC 15 can make "Thief uses Thieves' Tools to successfully disarm a detected trap" fail by chance.

---

## What mods can't do yet

{: .note }
Not implemented: `_load_single_mod()` only reads `traps_file`. Mods can't add or change items, spells, monsters, NPCs, dialogue, quests, races, classes, scenes or scripts, and they can't place traps on maps. `DataStore.loaded_mods` is filled in, but nothing reads it. There is no load order, no dependency handling and no enable/disable switch.

Also note:

- **Spells need code anyway.** Spell effects are `match` branches on the spell id in `CombatManager.execute_cast_spell()`. A new id in `spells.json` from any source would do nothing.
- **Monster stats aren't read by enemies.** `TacticalEnemy` and the Malakor fight don't use `DataStore.monsters` (see [chapter 6]({{ '/projects/crpg-realm/create-your-own-game/06-boss-fights-and-encounters.html' | relative_url }})), so a monsters merge wouldn't change combat.

### Extending it: merge items from a mod

Items are the easiest thing to add, because `DataStore.items` is looked up by id wherever items are used (`GameState.get_item_data()`, the inventory window, shops).

{: .important }
This is new code. Add it at the end of `_load_single_mod()` in `src/generated/v1/DataStoreV1.gd`. Edit that file by hand. **Don't regenerate it** with `packages/crpg-builder`: its template lacks `races`, `traps` and the mod loader, and would overwrite them.

```gdscript
	# New code — merge custom items from mod if present
	if manifest.has("items_file"):
		var itf = mod_dir + manifest["items_file"]
		if FileAccess.file_exists(itf):
			var parsed_items = JSON.parse_string(FileAccess.get_file_as_string(itf))
			if parsed_items is Array:
				for i in parsed_items:
					items[i["id"]] = ItemData.from_dict(i)
					print("Mod [%s]: Registered custom item -> %s" % [manifest.get("id", ""), i.get("id", "")])
```

The key difference from traps: `items` stores `ItemData` objects, not Dictionaries. `ItemData.from_dict()` converts the camelCase JSON keys (`equipSlot`, `damageDice`, `acBonus`, `icon`) into typed fields, exactly as `load_all_data()` does for `data/v1/items.json`.

Then add `"items_file": "items.json"` to a mod's `mod.json`, with an array like:

```json
[
  {
    "id": "frostbrand",
    "title": "Frostbrand",
    "category": "weapon",
    "weaponType": "melee",
    "equipSlot": "main_hand",
    "damageDice": "1d10",
    "damageType": "cold",
    "properties": ["versatile"],
    "weight": 3,
    "acBonus": 0,
    "cost": 120,
    "icon": "assets/icons/weapons/longsword.png",
    "description": "A longsword rimed with frost."
  }
]
```

`icon` is loaded as `"res://" + icon`, so point it at an image already inside the project. A mod in `user://` can't supply its own icon this way. To test it, give the item to the hero with `POST /api/v1/qa/give_item` and body `{"item_id": "frostbrand"}`, then open the inventory (`I`).

---

## Gotchas

- **Only traps load.** Any key other than `traps_file` is ignored, even if it looks meaningful (`items_file`, `spells_file` and so on) until you add code for it.
- **Whole-object replacement.** A mod entry with an existing id replaces the base entry entirely. Missing keys fall back to the `Trap.tscn` instance's exports, not to the base JSON.
- **Placed traps only.** A new trap id does nothing until a `Trap.tscn` instance with that `trap_id` sits directly under a scene root.
- **Quiet failures.** The loader prints no error for a malformed `mod.json`, a wrong `traps_file` path or a non-array trap file. If the "Registered custom trap" line is missing, check those three first.
- **Exported builds.** `res://mods/` is read through `DirAccess`. If you export the game, add the mod folders and their `.json` files to the export preset's non-resource file filter, or they won't be in the package. (The repo has no export preset yet.)

---

[← Previous: 6. Boss Fights]({{ '/projects/crpg-realm/create-your-own-game/06-boss-fights-and-encounters.html' | relative_url }}) · [Next: 8. Cucumber BDD Testing →]({{ '/projects/crpg-realm/create-your-own-game/08-cucumber-bdd-testing.html' | relative_url }})
