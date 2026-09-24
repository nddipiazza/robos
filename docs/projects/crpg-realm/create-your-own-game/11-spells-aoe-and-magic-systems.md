---
title: "11. Spells & Area Effects"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 11
permalink: /projects/crpg-realm/create-your-own-game/11-spells-aoe-and-magic-systems.html
description: "How CombatManager resolves spells by id, how Fireball rolls 8d6 against DEX saves, and how to add a new spell with data, code and a test."
---

# 11. Spells, Area Effects and Magic
{: .no_toc }

In this chapter you add a new spell, Ray of Frost, and prove it works with a feature file. You will learn where spell behaviour actually lives (a `match` block in `CombatManager.gd`), what `data/v1/spells.json` does and does not do, how Fireball finds and damages every enemy in its radius, and where the casting visuals come from.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

### CombatManager is a scene node

`scripts/CombatManager.gd` starts with `class_name CombatManager` / `extends Node`. It is **not** an autoload. Each location scene has a child node named `CombatManager` with this script, and scene scripts reach it with `@onready var combat_mgr = $CombatManager`. `Trap.gd` finds it with `find_child("CombatManager")` and creates a throwaway `CombatManager.new()` if the scene has none.

Two methods resolve spells:

| Method | Signature | Handles |
|:--|:--|:--|
| `execute_cast_spell` | `(caster_name: String, spell_id: String, target_name: String = "", target_node: Node = null) -> Dictionary` | Every spell id. Single-target spells are resolved here. AoE ids are forwarded to `execute_aoe_spell` with a fixed radius and `caster_node = null`. |
| `execute_aoe_spell` | `(caster_name: String, spell_id: String, target_center: Vector2, radius: float = 180.0, save_dc: int = 14, save_stat: String = "DEX", caster_node: Node = null) -> Dictionary` | `fireball`, `burning-hands`, `thunderwave`, `lightning-bolt`, `blizzard`, `stinking-cloud`, `sleep`. |

Fighter manoeuvres `tremor-stomp`, `crushing-cleave` and `rallying-stomp` also go through `execute_cast_spell`, which forwards them to `execute_fighter_ability()`.

### Behaviour is a `match` on the spell id

Before the `match`, `execute_cast_spell` rejects targets that are invisible (unless the caster can see invisible) or protected by Sanctuary (except for `cure-wounds`, `healing-word` and `sanctuary`). Dispel variants skip both checks. Then:

[scripts/CombatManager.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/CombatManager.gd)
```gdscript
	match spell_id:
		"magic-missile":
			# ...
			var d1 = randi_range(1, 4) + 1
			var d2 = randi_range(1, 4) + 1
			var d3 = randi_range(1, 4) + 1
			var total_dmg = d1 + d2 + d3
			_log_combat("combat", "✨ %s casts [b]Magic Missile[/b] at %s!" % [caster_name, tgt])
			_log_combat("damage", "Arcane energy darts strike %s for %d force damage (%d + %d + %d)!" % [tgt, total_dmg, d1, d2, d3])
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
				am.play_sfx("spell_impact")
			if target_node:
				if "global_position" in target_node and FloatingTextManager:
					FloatingTextManager.spawn_damage(target_node.global_position, total_dmg)
				if target_node.has_method("take_damage"):
					target_node.take_damage(total_dmg)
			return {"success": true, "spell": "magic-missile", "damage": total_dmg, "hit": true, "darts": [d1, d2, d3]}
		# ... 23 more branches ...
		_:
			_log_combat("combat", "%s casts %s!" % [caster_name, spell_id])
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
			return {"success": true, "spell": spell_id}
```

The branches are: `magic-missile`, `cure-wounds`, `healing-word`, `shield`, `sleep`, `mage-armor`, `burning-hands`, `thunderwave`, `bless`, `hold-person`, `spiritual-weapon`, `fireball`, `lightning-bolt`, `blizzard`, `stinking-cloud`, `haste`, `counterspell`, `find-traps`, `knock`, `invisibility`, `dispel-magic`, `sanctuary`, `see-invisibility`, and the three fighter abilities. Any other id hits `_`: it logs "X casts Y!", plays `spell_cast`, and returns `success: true` without doing anything.

### What spells.json is for

`data/v1/spells.json` is a JSON array of 26 objects:

[data/v1/spells.json](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/data/v1/spells.json)
```json
{
  "id": "magic-missile",
  "title": "Magic Missile",
  "level": 1,
  "school": "Evocation",
  "castingTime": "1 action",
  "range": "120 feet",
  "damageFormula": "3d4+3",
  "damageType": "force",
  "icon": "assets/icons/spells/magic_missile.png",
  "description": "You create three glowing darts of magical force. ..."
}
```

`DataStoreV1.load_all_data()` turns each entry into a `SpellData` (`src/generated/v1/SpellData.gd`) and stores it in `DataStore.spells[id]`. No gameplay script reads `DataStore.spells` today: damage, radius, DC and range are all hard-coded in the `match` branches. The JSON entry is the catalogue record for the spell (id, title, icon, rules text) and keeps the data set complete for tools and future UI. **Adding a spell needs both** an entry in `spells.json` and a branch in `CombatManager`.

Which spells a hero knows is `GameState.selected_spells`, an `Array` of ids. `CharacterSelect.gd` only wires three spell buttons (`magic-missile`, `cure-wounds`, `fireball`). Tests set any id through the HTTP API.

### Who calls it

| Caller | When | What it calls |
|:--|:--|:--|
| `TacticalBattle.execute_spell_cast(spell_id, target_id, target_pos)` | HTTP action `cast_spell` in TacticalBattle (all `spells/*.feature` files) | Plays `hero.play_cast_spell()`, then `execute_aoe_spell(..., hero)` for the seven AoE ids or `execute_cast_spell()` for the rest. |
| `TacticalBattle.execute_fireball_spell_cast(target_pos)` | HTTP action `cast_fireball` (feature 15) | `execute_aoe_spell("Ignis the Evoker", "fireball", target_pos, 180.0, 14, "DEX", hero)` |
| `VillageSquare._cast_spell_at_hound()` / `execute_heal_spell()` | A wizard clicks the hound, or the toolbar casts Cure Wounds | `execute_cast_spell()` |
| `ActionToolbar._on_action_clicked("spell")` | The toolbar Spell button | Only `cure-wounds` and `find-traps` do anything. See Gotchas. |

`TacticalBattle.execute_spell_cast()` picks these AoE parameters:

| Spell id | Radius (px) | Save |
|:--|:--|:--|
| `fireball` | 180 | DC 14 DEX |
| `burning-hands` | 150 | DC 14 DEX |
| `thunderwave` | 150 | DC 14 CON |
| `lightning-bolt` | 450 | DC 14 DEX |
| `sleep` | 160 | (no save) |
| `blizzard` | 140 | DC 14 DEX |
| `stinking-cloud` | 140 | DC 14 CON |

### Fireball step by step

[scripts/CombatManager.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/CombatManager.gd)
```gdscript
		"fireball":
			var dice_rolls: Array[int] = []
			var total_dmg: int = 0
			for _k in range(8):
				var r = randi_range(1, 6)
				dice_rolls.append(r)
				total_dmg += r
			# ... log the cast and the 8d6 roll, play "spell_cast" and "spell_impact"
			var tree = Engine.get_main_loop() as SceneTree
			var cur_sc = tree.current_scene if tree else null
			if cur_sc:
				var candidate_nodes: Array[Node] = []
				if "enemies" in cur_sc and cur_sc.enemies is Dictionary:
					for eid in cur_sc.enemies:
						# ... add each valid node
				for child in cur_sc.get_children():
					if child is TacticalEnemy and not candidate_nodes.has(child):
						candidate_nodes.append(child)

				for target in candidate_nodes:
					if not is_instance_valid(target) or target.current_state == TacticalEnemy.State.DEAD:
						continue

					var dist = target_center.distance_to(target.global_position)
					if dist <= radius:
						var d20 = roll_d20()
						var dex_save_mod = 2
						if "dex_save_mod" in target:
							dex_save_mod = target.dex_save_mod
						# ...
						var total_save = d20 + dex_save_mod
						var save_passed = (total_save >= save_dc)
						var dmg_taken = total_dmg
						if save_passed:
							dmg_taken = int(ceil(total_dmg / 2.0))
						# ... log the save, spawn floating damage
						target.take_damage(dmg_taken, caster_node)
						# ... record the hit in targets_hit
```

1. One 8d6 roll is shared by every target.
2. Candidates are the scene's `enemies` dictionary (TacticalBattle has one) plus every `TacticalEnemy` that is a direct child of the scene.
3. Each living enemy within `radius` pixels rolls d20 + `dex_save_mod` (an export on `TacticalEnemy`, default 2). Meeting the DC halves the damage, rounded up.
4. `take_damage(dmg_taken, caster_node)` applies damage and, when `caster_node` is not null, threat and pack alerts (chapter 10).

The return value:

```gdscript
			return {
				"success": true,
				"spell": "fireball",
				"center": {"x": target_center.x, "y": target_center.y},
				"radius": radius,
				"damage_dice": dice_rolls,
				"total_damage": total_dmg,
				"save_dc": save_dc,
				"targets_hit": targets_hit,
				"targets_hit_count": targets_hit.size(),
				"slain_count": slain_count,
				"all_slain": (targets_hit.size() > 0 and slain_count == targets_hit.size())
			}
```

Each `targets_hit` entry has `id`, `name`, `distance`, `d20`, `save_mod`, `total_save`, `save_passed`, `damage_taken`, `hp_before`, `hp_after` and `slain`. The HTTP API returns this dictionary as `telemetry`.

### Visuals and sound

The cast animation is `HeroPlayer.play_cast_spell(spell_id, target_pos, on_cast_callback)`. It plays `spell_cast`, draws a ring under the caster, then branches on the id. Most spells have their own `_spawn_*_vfx()` function (for example `_spawn_blizzard_vfx`, `_spawn_lightning_bolt_vfx`). Anything else, Fireball included, falls through to a generic orb that flies to `target_pos`:

[scripts/HeroPlayer.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/HeroPlayer.gd)
```gdscript
	else:
		var orb = Node2D.new()
		orb.top_level = true
		orb.global_position = global_position + Vector2(0, -10)
		var orb_col = Color(1.5, 0.6, 0.2, 1.0) if spell_id == "fireball" else Color(0.4, 0.8, 1.5, 1.0)
		# ... 16-point Polygon2D circle
		var flight_time = clamp(global_position.distance_to(target_pos) / 1400.0, 0.16, 0.26)
		var tw = create_tween()
		tw.tween_property(orb, "global_position", target_pos, flight_time)
		await tw.finished
		orb.queue_free()
		if spell_id == "fireball":
			_spawn_fireball_explosion_vfx(target_pos, 180.0)
		else:
			_spawn_spell_blast_vfx(target_pos, orb_col)
		if AudioManager:
			AudioManager.play_sfx("spell_impact")
		if on_cast_callback.is_valid():
			on_cast_callback.call()
```

`_spawn_fireball_explosion_vfx()` draws a 32-point `Line2D` ring at the radius, a jagged `Polygon2D` core and 12 sparks, then tweens scale and alpha. The spell SFX keys in `AudioManager.gd` are `spell_cast`, `spell_impact` and `heal_cast`.

The visual and the rules are separate. `play_cast_spell()` does not call `CombatManager`; the caller does that, usually from `on_cast_callback` or after waiting for it.

---

## Step by step: add Ray of Frost

Ray of Frost is a single-target spell: 1d8 cold damage to one creature.

1. **Add the data entry.** Append an object to the array in `data/v1/spells.json`. The `id` is what everything else keys on.

   New code — add to `data/v1/spells.json`:
   ```json
   {
     "id": "ray-of-frost",
     "title": "Ray of Frost",
     "level": 0,
     "school": "Evocation",
     "castingTime": "1 action",
     "range": "60 feet",
     "damageFormula": "1d8",
     "damageType": "cold",
     "icon": "assets/icons/spells/blizzard.png",
     "description": "A frigid beam of blue-white light streaks toward a creature within range, dealing 1d8 cold damage."
   }
   ```
   Check the file still parses: `python3 -m json.tool data/v1/spells.json > /dev/null`. A syntax error does not crash the game: `JSON.parse_string()` returns `null` and `DataStore.spells` ends up empty.

2. **Add the behaviour.** In `scripts/CombatManager.gd`, inside `execute_cast_spell()`, add a branch to `match spell_id:` **above** the final `_:` branch. It follows the `magic-missile` pattern.

   New code — add to the `match` in `execute_cast_spell()`:
   ```gdscript
   		"ray-of-frost":
   			var tgt = target_name if target_name != "" else "target"
   			var dmg = randi_range(1, 8)
   			_log_combat("combat", "❄️ %s casts [b]Ray of Frost[/b] at %s!" % [caster_name, tgt])
   			_log_combat("damage", "A frigid beam strikes %s for %d cold damage!" % [tgt, dmg])
   			if am and am.has_method("play_sfx"):
   				am.play_sfx("spell_cast")
   				am.play_sfx("spell_impact")
   			if target_node:
   				if "global_position" in target_node and FloatingTextManager:
   					FloatingTextManager.spawn_damage(target_node.global_position, dmg)
   				if target_node.has_method("take_damage"):
   					target_node.take_damage(dmg)
   			return {"success": true, "spell": "ray-of-frost", "damage": dmg, "hit": true}
   ```
   `am` and `gs` are already defined at the top of the function. `take_damage(dmg)` is called with one argument because `ShadowHound.take_damage(amount)` accepts only one; `TacticalEnemy.take_damage(amount, attacker = null)` accepts both.

3. **Visuals: nothing to do.** `HeroPlayer.play_cast_spell()` has no `"ray-of-frost"` branch, so it uses the generic blue orb and `_spawn_spell_blast_vfx()`. Add an `elif spell_id == "ray-of-frost":` branch with your own `_spawn_*_vfx()` function only if you want a custom look. Keep the `on_cast_callback.call()` at the end of it, as the other VFX functions do.

4. **Routing: nothing to do.** `TacticalBattle.execute_spell_cast()` sends every id that is not in its AoE list to `execute_cast_spell()`, with the enemy node looked up from `enemies[target_id]`.

5. **(Optional) Let players pick it.** To offer it at character creation, add a `BtnSpellRayOfFrost` button to the `SpellGrid` in `scenes/CharacterSelect.tscn` and add `"ray-of-frost"` to the list in the `for sp in [...]` loop in `CharacterSelect.gd`. The loop builds the button name from the id with `"BtnSpell" + _pascal_case(sp.replace("-", "_"))`.

---

## Verify it

Fireball has a dedicated feature, [tests/e2e/features/normal/15_classic_fireball_goblin_crowd_decimation.feature](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/tests/e2e/features/normal/15_classic_fireball_goblin_crowd_decimation.feature). It sets up six 7-HP goblins around (1150, 520), casts through `cast_fireball`, and checks the 8d6 roll, the DC 14 DEX saves, and that all six die.

```bash
cd games/crpg-realm
python3 run_cucumber_tests.py tests/e2e/features/normal/15_classic_fireball_goblin_crowd_decimation.feature
```

Every spell also has a short feature in `tests/e2e/features/spells/`. Run them all with `python3 run_cucumber_tests.py --spells`.

| Feature | Spell id | Encounter preset |
|:--|:--|:--|
| `spell_01_magic_missile` | `magic-missile` | `evasion_scout` |
| `spell_02_cure_wounds` | `cure-wounds` | `combat_dummy` |
| `spell_03_healing_word` | `healing-word` | `combat_dummy` |
| `spell_04_shield` | `shield` | `incoming_striker` |
| `spell_05_sleep` | `sleep` | `boss_and_minions` |
| `spell_06_mage_armor` | `mage-armor` | `combat_dummy` |
| `spell_07_burning_hands` | `burning-hands` | `charging_pack` |
| `spell_08_thunderwave` | `thunderwave` | `charging_pack` |
| `spell_09_bless` | `bless` | `combat_dummy` |
| `spell_10_hold_person` | `hold-person` | `humanoid_and_beast` |
| `spell_11_invisibility` | `invisibility` | `combat_dummy` |
| `spell_12_spiritual_weapon` | `spiritual-weapon` | `combat_dummy` |
| `spell_13_fireball` | `fireball` | `goblin_crowd` |
| `spell_14_lightning_bolt` | `lightning-bolt` | `corridor_column` |
| `spell_15_haste` | `haste` | `combat_dummy` |
| `spell_16_counterspell` | `counterspell` | `dueling_caster` |
| `spell_17_dispel_magic` | `dispel-magic` (after `mage-armor`) | `combat_dummy` |
| `spell_18_find_traps` | `find-traps` | `combat_dummy` |
| `spell_19_knock` | `knock` | `combat_dummy` |
| `spell_20_tremor_stomp` | `tremor-stomp` | `combat_dummy` |
| `spell_21_crushing_cleave` | `crushing-cleave` | `combat_dummy` |
| `spell_22_rallying_stomp` | `rallying-stomp` | `combat_dummy` |
| `spell_23_blizzard` | `blizzard` | `incoming_striker` |
| `spell_24_stinking_cloud` | `stinking-cloud` | `incoming_striker` |

The presets are defined in the step `an isolated tactical spell encounter "{enc_type}" with hero "{hero_name}" class "{hero_class}" and {hp:d} HP` in `tests/e2e/features/steps/crpg_steps.py`. `sanctuary` and `see-invisibility` have no file here; they are exercised by `normal/17_invisible_enemy_and_sanctuary_targeting.feature`.

For Ray of Frost, create `tests/e2e/features/spells/spell_25_ray_of_frost.feature`. All steps exist already:

```gherkin
@spells @ray_of_frost
Feature: Spell 25 - Ray of Frost (Cantrip)
  As a wizard
  I want to hit a single enemy with a beam of cold
  So that I have a reliable damage option

  Scenario: Frigid beam damages the combat dummy
    Given an isolated tactical spell encounter "combat_dummy" with hero "Ignis" class "wizard" and 35 HP
    When the hero targets "dummy_1" and casts spell "ray-of-frost"
    Then the spell "ray-of-frost" resolves successfully
    And enemy "dummy_1" takes 1 damage
    And the activity log contains message "cold damage"
```

```bash
python3 run_cucumber_tests.py tests/e2e/features/spells/spell_25_ray_of_frost.feature
```

`resolves successfully` alone proves nothing, because the `_` fallback also returns `success: true`. The damage and log checks fail if your branch is missing or misspelled.

---

## Gotchas

- **JSON alone does nothing.** A new id in `spells.json` without a `match` branch falls into `_`, logs "casts", and reports success.
- **Branch order matters.** A branch placed after `_:` never runs.
- **Only `TacticalEnemy` is hit by the blast.** Every AoE loop in `execute_aoe_spell` collects `TacticalEnemy` nodes only, so `ShadowHound`, NPCs and the party take no blast damage. The lingering hazards are different: Blizzard and Stinking Cloud leave `IcePatch` / `StinkingCloud` nodes that also affect party members who walk into them (see `spell_23_blizzard.feature` and `spell_24_stinking_cloud.feature`).
- **Enemies must be direct children of the scene root.** Otherwise they are not candidates (unless the scene script lists them in an `enemies` dictionary, as TacticalBattle does).
- **Radius is in pixels.** The "20ft radius" in the Fireball log is text. There is no range check between caster and target, and no spell slots or cast cooldown.
- **`execute_cast_spell` passes `caster_node = null` to AoE spells.** Damage then builds no threat and alerts no pack. `TacticalBattle.execute_spell_cast()` avoids this by calling `execute_aoe_spell(..., hero)` directly.
- **The toolbar Spell button is limited.** `ActionToolbar._on_action_clicked("spell")` only uses `selected_spells[0]`. For damage spells it looks for a node named `BlightHound`, which no scene has, so nothing happens. For `find-traps` it calls `cm.cast_spell()`, which `CombatManager` does not define. `cure-wounds` works.
- **Sleep ignores `save_dc`.** The `sleep` branch of `execute_aoe_spell` rolls a 5d8 HP pool and puts the lowest-HP enemies in range to sleep, whatever DC the caller passes (see `spell_05_sleep.feature`).

---

[← Previous: 10. Aggro, tactics and pack AI]({{ '/projects/crpg-realm/create-your-own-game/10-aggro-tactics-and-pack-ai.html' | relative_url }}) · [Next: 12. Build a dungeon end to end →]({{ '/projects/crpg-realm/create-your-own-game/12-step-by-step-game-creation-recipe.html' | relative_url }})
