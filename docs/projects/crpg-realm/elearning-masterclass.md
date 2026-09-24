---
title: Engine Specification
nav_order: 7
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
description: Technical specification of the crpg-realm engine as implemented - runtime layout, dice and combat math, saves, spells, traps, fog of war, pathfinding, data and tests.
---

# Engine Specification
{: .no_toc }

A compact specification of what the `games/crpg-realm` engine actually does, taken from the code. It covers the runtime layout, the dice and combat math in `CombatManager.gd`, saves, spells, traps, fog of war, pathfinding, the data layer and the test harness. Where the game departs from D&D 5e, this page says so. For a guided course on the same material, see the [interactive eLearning app]({{ '/projects/crpg-realm/elearning/' | relative_url }}).
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Runtime layout

| Item | Value | Source |
|:---|:---|:---|
| Engine | Godot 4.3, `gl_compatibility` renderer | `project.godot` |
| Viewport | 1920x1080 | `project.godot` |
| Main scene | `res://scenes/CharacterSelect.tscn` | `project.godot` |
| Location maps | 2560x1440 background `TextureRect`, camera limits via `hero.set_camera_limits(0, 0, 2560, 1440)` | each location script's `_ready()` |

**Autoloads** (in `project.godot` order): `DataStore` (`src/generated/v1/DataStoreV1.gd`), `GameState`, `GameControlServer`, `AudioManager`, `QAOverlay`, `FloatingTextManager`.

**Per-scene nodes.** `CombatManager` is **not** an autoload. It is `class_name CombatManager`, added as a child node of each location scene and reached with `$CombatManager`. Location roots are flat `Node2D`s with `y_sort_enabled = true`; enemies, NPCs, traps and companions are direct children of the root.

**Camera.** `HeroPlayer.set_camera_limits()` sets the `Camera2D` limits and turns smoothing off:

```gdscript
func set_camera_limits(left: int, top: int, right: int, bottom: int) -> void:
	# ...
	if camera:
		camera.limit_left = left
		camera.limit_top = top
		camera.limit_right = right
		camera.limit_bottom = bottom
		camera.position_smoothing_enabled = false
		camera.offset = camera_current_offset
```

Source: [scripts/HeroPlayer.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/HeroPlayer.gd).

**Real-time with pause.** Space calls `GameState.toggle_pause()`, which sets `GameState.is_game_paused` and emits `pause_toggled`. `HeroPlayer`, `PartyCompanion`, `ShadowHound` and `TacticalEnemy` check that flag and stop processing. The Godot `SceneTree` itself is not paused.

---

## 2. Characters

Source: `GameState.init_hero()` in [scripts/GameState.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GameState.gd).

- **Ability scores:** `roll_dnd_stat()` rolls 4d6 and keeps the highest three.
- **Modifier:** `get_stat_modifier(val) = floor((val - 10) / 2)`.
- **Racial bonuses** are a `match` on the race id, not read from `races.json`. Examples: human +1 to all, elf DEX +2 / INT +1, dwarf CON +2 / STR +1, halfling DEX +2 / CHA +1.
- **Class HP and AC** are also a `match`, not read from `classes.json`:

| Class | Max HP | AC |
|:---|:---|:---|
| barbarian | 12 + CON | 10 + DEX + CON |
| fighter, paladin | 10 + CON | 16 |
| ranger | 10 + CON | 12 + DEX |
| cleric | 8 + CON | 14 + min(2, DEX) |
| druid | 8 + CON | 12 + min(2, DEX) |
| monk | 8 + CON | 10 + DEX + WIS |
| bard, rogue, warlock | 8 + CON | 11 + DEX |
| wizard, sorcerer | 6 + CON | 10 + DEX |

(CON, DEX, WIS mean the ability modifier.) Dwarves and half-orcs get +1 HP. There is no level, no proficiency bonus and no spell slots.

---

## 3. Attack rolls

Source: `execute_attack()` and `execute_ranged_attack()` in [scripts/CombatManager.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/CombatManager.gd).

```gdscript
func roll_d20() -> int:
	return (randi() % 20) + 1

func execute_attack(attacker_name: String, attack_bonus: int, damage_dice_min: int, damage_dice_max: int, target_name: String, target_ac: int, target_pos: Vector2 = Vector2.ZERO) -> Dictionary:
	# ... advantage / disadvantage / buffs, see below
	var r1 = roll_d20()
	var r2 = roll_d20()
	var d20 = r1
	if has_adv and not has_disadv:
		d20 = max(r1, r2)
	elif has_disadv and not has_adv:
		d20 = min(r1, r2)

	var is_crit = (d20 == 20)
	if gs and gs.has_method("has_status_effect") and (gs.has_status_effect(target_name, "paralyzed") or gs.has_status_effect(target_name, "unconscious")):
		is_crit = true

	var is_fumble = (d20 == 1)
	var total_attack = d20 + attack_bonus
	var is_hit = is_crit or (not is_fumble and total_attack >= target_ac)
	var damage = 0

	if is_hit:
		damage = randi_range(damage_dice_min, damage_dice_max)
		if is_crit:
			damage += randi_range(damage_dice_min, damage_dice_max)
```

The rules this implements:

- **Hit:** `d20 + attack_bonus >= target_ac`. A natural 20 always hits; a natural 1 always misses.
- **Damage:** a uniform integer between `damage_dice_min` and `damage_dice_max`. There are no dice expressions and no separate ability modifier.
- **Critical hit:** the whole min–max range is rolled **twice** and added. In melee, a `paralyzed` or `unconscious` target is always critically hit. Ranged attacks have no automatic crit.
- **Advantage / disadvantage:** two d20s are always rolled; keep the higher or lower. If both apply, they cancel.

| | Melee (`execute_attack`) | Ranged (`execute_ranged_attack`) |
|:---|:---|:---|
| Attacker has disadvantage if | `blinded`, `poisoned`, `frightened`, `prone` | `blinded`, `poisoned`, `frightened` |
| Attacker has advantage if target is | `blinded`, `paralyzed`, `prone`, `stunned`, `unconscious` | `blinded`, `restrained`, `stunned`, `paralyzed`, `unconscious` |

| Effect | Where | Change |
|:---|:---|:---|
| `blessed` on attacker | both | + `randi_range(1, 4)` to the attack bonus |
| `shield` on target | both | target AC + 5 |
| `hasted` on target | both | target AC + 2 |

**The numbers come from the caller.** Every call site passes a hard-coded bonus and damage range:

| Caller | Attacker | Bonus | Damage | Target AC |
|:---|:---|:---:|:---:|:---|
| `VillageSquare._execute_hero_strike_on_hound()` | hero | +8 | 24–30 | hound's `armor_class` |
| `VillageSquare._fire_ranged_at_hound()` | hero | +6 + DEX | 24–30 | hound's `armor_class` |
| `WhisperingForest.gd` | hero | +7 | 20–30 | beast's AC |
| `AncientCatacombs.gd` | hero | +8 | 22–30 | target's AC |
| `GarrisonKeep.gd` | hero vs Malakor | +8 | 18–26 | 14 |
| `GarrisonKeep.gd` | Malakor vs hero | +5 | 2–6 | `GameState.hero_ac` |
| `TacticalBattle.execute_hero_attack_on_enemy()` | hero | +10 | 16–24 | enemy `armor_class` |

{: .warning }
Several callers ignore the result. `VillageSquare._execute_hero_strike_on_hound()` then calls `hound.take_damage(99)` whatever was rolled, and `TacticalBattle.execute_hero_attack_on_enemy()` applies `randi_range(16, 24)` damage even on a miss. Equipped weapons and the hero's ability scores do not feed into these rolls.

**Enemy attacks.** `TacticalEnemy` rolls its own attack every 2.4 s in the ATTACK state: `d20 + attack_bonus` vs the target's AC (natural 20 hits, natural 1 misses), damage `randi_range(damage_min, damage_max)`. No advantage, no crit doubling. `attack_bonus`, `damage_min`, `damage_max`, `armor_class` and `max_hp` are exports set per instance in the scene.

**Hit points.** At 0 HP the hero gets the `unconscious` status and `GameState.check_party_defeat()` runs. `cure-wounds` and `healing-word` remove `unconscious` when they heal.

---

## 4. Saving throws

There is no spell save DC formula. Each effect uses a fixed DC and the target's exported save modifier:

| Effect | Save | DC | Target modifier | On success |
|:---|:---|:---:|:---|:---|
| Fireball (`execute_aoe_spell`) | DEX | 14 (default arg) | `dex_save_mod`, else `dex_mod`, else +2 | half damage (rounded up) |
| Burning Hands | DEX | 14 (default arg) | `dex_save_mod`, else +2 | half damage |
| Hold Person | WIS | 14 | `wis_save_mod`, else +1 | not paralyzed |
| Trap trigger (`resolve_trap_trigger`) | per trap | per trap instance | `save_bonus` argument | half damage, no status |

The save is `d20 + modifier >= DC`. There is no natural-20/natural-1 rule on saves.

---

## 5. Spells

`CombatManager.execute_cast_spell()` and `execute_aoe_spell()` are `match` blocks on the spell id. **Adding a spell to `spells.json` does nothing on its own**; it needs a branch here.

Before the `match`, `execute_cast_spell()` refuses the cast if the target is invisible and the caster cannot see invisible, or if the target has `sanctuary` (except `cure-wounds`, `healing-word` and `sanctuary`).

Single-target ids handled: `magic-missile`, `cure-wounds`, `healing-word`, `shield`, `sleep`, `mage-armor`, `burning-hands`, `thunderwave`, `bless`, `hold-person`, `spiritual-weapon`, `fireball`, `lightning-bolt`, `blizzard`, `stinking-cloud`, `haste`, `counterspell`, `find-traps`, `knock`, `invisibility`, `dispel-magic`, `sanctuary`, `see-invisibility`, `tremor-stomp`, `crushing-cleave`, `rallying-stomp`.

Area ids handled by `execute_aoe_spell()`: `fireball`, `burning-hands`, `thunderwave`, `lightning-bolt`, `blizzard`, `stinking-cloud`, `sleep`, `tremor-stomp`, `crushing-cleave`, `rallying-stomp`.

Formulas for the most-used spells:

| Spell | Effect |
|:---|:---|
| `magic-missile` | three darts of `randi_range(1, 4) + 1` force damage; 0 damage if the target has `shield` |
| `cure-wounds` | heal `randi_range(1, 8) + max(1, WIS mod)` |
| `healing-word` | heal `randi_range(1, 4) + max(1, WIS mod)` |
| `hold-person` | humanoids only; WIS save DC 14 or `paralyzed` |
| `fireball` | 8d6 (eight `randi_range(1, 6)`), radius 180 px (default arg), DEX DC 14, half on save |
| `burning-hands` | 3d6, DEX save, half on save |

Fireball targets are the scene's `enemies` dictionary (if it has one) plus every `TacticalEnemy` that is a **direct child** of the current scene, within `radius` of the chosen point.

---

## 6. Traps

Source: `resolve_trap_detection()`, `resolve_trap_disarm()`, `resolve_trap_trigger()` in `CombatManager.gd`.

| Roll | Formula | Notes |
|:---|:---|:---|
| Detect | `max(10, d20) + perception_bonus >= trap_dc` | the d20 has a floor of 10 |
| Disarm | `max(10, d20) + tools_bonus >= disarm_dc` | only `force_fumble = true` sets the d20 to 1 and sets off the trap; a normal failure is safe |
| Trigger | `d20 + save_bonus >= save_dc` → half damage | on a failed save, the trap's status effect is applied (`duration_rounds = 3`) |

DCs are set per trap instance in the scenes (for example in `AncientCatacombs.tscn`).

---

## 7. Fog of war

Source: [scripts/FogOfWar.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/FogOfWar.gd) and [shaders/fog_of_war.gdshader](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/shaders/fog_of_war.gdshader).

- 8 px cells (320x180 grid for a 2560x1440 map), red channel = explored, green = in sight.
- Vision circle around the `HeroPlayer` only: clear inside 240 px, smoothstep fade to 340 px.
- Shader alpha = `(1 - explored) + explored * (1 - in_vision) * memory_darkness`, with `memory_darkness = 0.65` and shroud colour `(0.02, 0.02, 0.04)`.
- Registered actors fade out when their cell is not in sight. Explored cells are cached per scene in `GameState` metadata.

Details: [World Systems & Pathfinding]({{ '/projects/crpg-realm/world-systems-and-pathfinding.html' | relative_url }}#fog-of-war).

---

## 8. Pathfinding

Source: [scripts/Pathfinder.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/Pathfinder.gd).

- `is_line_clear()` casts three rays on collision mask 1 (centre plus two offset by `check_radius`).
- `get_nav_path()` returns the target directly if the line is clear. Otherwise it builds an `AStar2D` over the scene's `get_nav_points() -> Array[Vector2]`, connecting points with clear lines, and smooths the result.
- No `NavigationServer2D`, `NavigationRegion2D` or navigation mesh is used. A scene without `get_nav_points()` gets straight-line movement.
- Only `HeroPlayer` uses it. Companions follow formation slots in a straight line and slide along walls.

---

## 9. Data layer

- `data/v1/*.json` files are JSON arrays of objects with an `id` field (except `game.json`).
- The `DataStore` autoload iterates each array into a dictionary keyed by id. `npcs`, `monsters`, `spells` and `items` hold `NPCData`, `MonsterData`, `SpellData` and `ItemData` objects; the rest hold plain dictionaries.
- Runtime reads: items (`GameState.get_item_data()`), dialogue trees, NPC records, traps. Spells, monsters, classes and races are loaded but their numbers are not used by combat or character creation.
- Three schemas exist in `schemas/v1/`; nothing validates at runtime.
- Mods: `DataStoreV1.load_mods()` scans `res://mods/` and `user://mods/`; `_load_single_mod()` merges only a `traps_file` array.
- `packages/crpg-builder` generated the first version of these files. Do not re-run it against the game; it overwrites the hand-edited data, `DataStoreV1.gd` and `project.godot`.

Details: [Game Creation Process]({{ '/projects/crpg-realm/game-creation-process.html' | relative_url }}).

---

## 10. Test harness

- `GameControlServer` (autoload) serves HTTP on port 8080 by default (`CRPG_WEB_SERVICE_PORT` or `--port` override, next nine ports tried if busy). Routes at `/x` and `/api/v1/x`, including `/health`, `/state`, `/screen_state`, `/action`, `/setup_state`, `/reset`.
- `QAOverlay` draws a virtual cursor that moves on a quadratic Bézier curve with cubic ease-out before each simulated click.
- `python3 run_cucumber_tests.py [--normal|--spells|--playthrough|--all] [feature]` runs behave. Suites: normal 17 features, spells 24, full playthroughs 6 (47 features, 75 scenarios).
- `environment.py` starts Xvfb `:99` at 1920x1080x24, launches Godot windowed with `--port 18090`, and records every scenario with ffmpeg (`x11grab`, 30 fps, libx264) to `tests/e2e/reports/videos/`.
- The Python `InfinityAIAgent` is a scripted player: fixed sequences of HTTP calls with small class-based branches.

Details: [Infinity AI Agent & Test Harness]({{ '/projects/crpg-realm/infinity-ai-agent-harness.html' | relative_url }}).

---

## 11. Not implemented

{: .note }
The following are often assumed from D&D 5e or Infinity Engine games but **do not exist** in the code:
initiative; turn order or 6-second rounds (the action log prints "6.0s Round Timer Active", but no timer exists); action / bonus action / reaction budgets; proficiency bonus and `8 + proficiency + modifier` save DCs; dice-expression damage (`1d8+3`); death saving throws; levels and spell slots; `NavigationServer2D` navigation meshes; roof or wall occlusion fading; companion or light-source vision; building interiors; 8-direction sprites; typed code-generated data singletons (`DataStoreV1` is a hand-edited loader, not a code generator's output).

![Combat in the tactical battle scene]({{ '/assets/images/crpg-realm/combat_battlefield.png' | relative_url }}){: .robos-zoomable-img }
*TacticalBattle: party and enemies in real-time combat with the activity log below.*
