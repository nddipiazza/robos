---
title: "5. Traps"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 5
permalink: /projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html
description: "How Trap.gd hides, detects, disarms and springs traps, and how to add a new trap to data/v1/traps.json and a scene."
---

# 5. Traps: Detection, Disarming and Triggers
{: .no_toc }

In this chapter you add a new trap to a dungeon. You will learn how a `Trap` node syncs its numbers from `data/v1/traps.json`, how the Find Traps mode and the Find Traps spell reveal it, how the disarm and save rolls work, and which distance checks decide whether a trap can be disarmed or sprung.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

A trap is an instance of `scenes/components/Trap.tscn`: an `Area2D` running `scripts/Trap.gd`, with a `HazardVisual` polygon, an `Outline` line, a `StatusLabel` and a 72×72 `CollisionShape2D`. The only shipped traps are the three instances in `scenes/AncientCatacombs.tscn`: `PoisonDartTrap`, `GlyphOfWarding` and `SpikePitTrap`.

A trap has four states, stored as exported booleans:

| State | Flags | What the player sees |
|:--|:--|:--|
| Concealed | all false | Nothing. `modulate` alpha is 0. |
| Detected | `is_detected` | Red tint, `⚠️ [TRAP] <name>` label, pulsing alpha tween. |
| Disarmed | `is_disarmed` | Green tint, `🔧 [DISARMED] <name>` label. Harmless. |
| Triggered | `is_triggered` | Hidden. Collision, `monitoring` and `monitorable` are switched off. |

`_update_visual_state()` applies these looks whenever a flag changes.

### Data: exports first, then traps.json

`Trap.gd` exports every number a trap needs. This is the real header:

[scripts/Trap.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/Trap.gd)
```gdscript
class_name Trap
extends Area2D

signal trap_detected(trap_node: Node2D, by_actor: String)
signal trap_disarmed(trap_node: Node2D, by_actor: String)
signal trap_triggered(trap_node: Node2D, victim_name: String)

@export var trap_id: String = "poison-dart-trap"
@export var trap_name: String = "Concealed Poison Dart Trap"
@export var trap_type: String = "floor" # "floor", "glyph", "container", "door"
@export var detect_dc: int = 13
@export var disarm_dc: int = 14
@export var save_stat: String = "CON"
@export var save_dc: int = 13
@export var damage_dice_min: int = 2
@export var damage_dice_max: int = 12
@export var damage_type: String = "poison"
@export var status_effect: String = "poisoned"
@export var status_duration: int = 3

@export var is_detected: bool = false
@export var is_disarmed: bool = false
@export var is_triggered: bool = false
@export var detection_radius: float = 650.0
@export var disarm_reach: float = 80.0
```

In `_ready()`, `_sync_data_store()` looks up `DataStore.traps[trap_id]`. If the id exists, the JSON values **overwrite** the exports. If it doesn't, the exports set on the scene instance are used as they are.

[scripts/Trap.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/Trap.gd) — `_sync_data_store()`
```gdscript
if ds and "traps" in ds and ds.traps.has(trap_id):
    var d = ds.traps[trap_id]
    trap_name = str(d.get("title", trap_name))
    detect_dc = int(d.get("detectDC", detect_dc))
    disarm_dc = int(d.get("disarmDC", disarm_dc))
    save_stat = str(d.get("saveStat", save_stat))
    save_dc = int(d.get("saveDC", save_dc))
    damage_dice_min = int(d.get("damageMin", damage_dice_min))
    damage_dice_max = int(d.get("damageMax", damage_dice_max))
    damage_type = str(d.get("damageType", damage_type))
    status_effect = str(d.get("statusEffect", status_effect))
    status_duration = int(d.get("statusDuration", status_duration))
```

`data/v1/traps.json` is a JSON **array**. `DataStoreV1.load_all_data()` turns it into a Dictionary keyed by `id`, and each value stays a plain Dictionary (there is no `TrapData` wrapper). The file ships four traps: `poison-dart-trap`, `glyph-of-warding`, `spike-pit-trap` and `acid-spray-trap`. The last one isn't placed in any scene.

[data/v1/traps.json](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/data/v1/traps.json)
```json
[
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
    "description": "A pressure plate hidden beneath loose dungeon flagstones. Stepping on it launches poisoned iron darts from the wall."
  }
]
```

`Trap.gd` ignores `type`, `damageFormula` and `description`. Damage is a flat `randi_range(damageMin, damageMax)`, not a dice roll.

### Detection

There are two ways to find a trap.

**1. Find Traps mode (skill check).** A rogue hero has a **👁️ Find Traps** button on the action toolbar (`ActionToolbar.gd` calls `GameState.set_detect_traps_mode()`). While the mode is on, `GameState._process()` calls `pulse_trap_detection()` every 1.5 seconds. That function calls `attempt_detection(thief_name)` on every direct child of the current scene that has the method and isn't already detected or disarmed. The "thief" comes from `GameState.get_thief_member_name()`: the first party member whose class is `rogue`, or the hero if there is none.

`attempt_detection()` does nothing if the searcher is more than `detection_radius` (650 px) away. Otherwise it picks a perception bonus and calls `CombatManager.resolve_trap_detection()`:

[scripts/CombatManager.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/CombatManager.gd) — `resolve_trap_detection()`
```gdscript
var d20 = max(10, roll_d20()) # D&D 5e Passive Perception floor (10 + bonus) for active search
var total = d20 + perception_bonus
var is_success = (total >= trap_dc)
```

The perception bonus is:

- **Hero:** `max(4, WIS modifier + proficiency)`. Proficiency is 4 if `GameState.hero_class` is `rogue`, otherwise 2.
- **"Bramble Ironheart" or "Bramble"** (when not the hero): 5.
- **Anyone else:** 4.

The d20 floor of 10 means the lowest possible total is 14. So any trap with `detectDC` 14 or lower is always spotted on the first pulse once the searcher is within 650 px.

**2. The Find Traps spell (no check).** Casting `find-traps` calls `reveal_trap()` on every direct child of the scene that has it. No roll is made. How the call gets there depends on where it starts:

- **HTTP API (`cast_spell` action), in a scene without `execute_spell_cast()`, such as AncientCatacombs.** `GameControlServer` looks for `cm.cast_spell`. `CombatManager` has no method with that name, so the `has_method` check fails. The server then runs its own fallback loop: it logs "casts Find Traps! Divine divination radiates across the area." and calls `reveal_trap()` on each child.
- **TacticalBattle.** The scene's `execute_spell_cast()` calls `CombatManager.execute_cast_spell(..., "find-traps", ...)`. That runs the `"find-traps"` branch of the spell `match`, which does the same loop and plays the `spell_cast` SFX.
- **Action toolbar Spell button**, when `find-traps` is the first prepared spell. `ActionToolbar.gd` calls `cm.cast_spell("find-traps", ...)` without checking `has_method`. See [Gotchas](#gotchas).

### Disarming

Clicking a **detected** trap (`Trap._input_event`) sends the party thief to disarm it through `approach_and_disarm()`. That function walks the actor to a point 55 px from the trap, turns them to face it, then calls `disarm_trap()`. Clicking a **concealed** trap just moves the hero to the mouse position, and they may walk straight onto it.

`disarm_trap()` refuses if the actor is further away than `disarm_reach` (80 px):

[scripts/Trap.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/Trap.gd) — `disarm_trap()`
```gdscript
var actor_node = _get_actor_node(disarmer_name)
if actor_node:
    var dist = global_position.distance_to(actor_node.global_position)
    if dist > disarm_reach:
        GameState.log_message("combat", "⚠️ [TOO FAR] %s must walk next to %s to disarm it! ..." % [...])
        return {"success": false, "error": "Must walk next to trap first! ...", "too_far": true, ...}

var cm = _get_combat_manager()
var tools_bonus = 5 # Standard thief sleight of hand (+3 DEX + 2 Prof)
if disarmer_name == GameState.hero_name:
    var dex_mod = GameState.get_stat_modifier(int(GameState.ability_scores.get("DEX", 14)))
    var prof = 4 if GameState.hero_class == "rogue" else 2 # Expertise with Thieves' Tools for Rogues
    tools_bonus = max(5, dex_mod + prof)

var res = cm.resolve_trap_disarm(disarmer_name, tools_bonus, disarm_dc, trap_name, force_fumble)
# ...
elif res.get("fumble", false):
    var trig_res = force_trigger(disarmer_name, false, true)
```

The roll itself is in `CombatManager`:

[scripts/CombatManager.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/CombatManager.gd) — `resolve_trap_disarm()`
```gdscript
var d20 = 1 if force_fumble else max(10, roll_d20()) # Reliable Talent / Take 10 for stationary trap disarming
var total = d20 + tools_bonus
var is_success = false if force_fumble else (total >= disarm_dc)
var is_fumble = force_fumble or (d20 == 1)
```

Two things follow from this code:

- **A natural fumble can't happen.** The roll is floored at 10, so `d20 == 1` only occurs when `force_fumble` is true. Only the test/API path (`disarm_trap` action with `"fumble": true` or `"critical_fumble": true`) makes a trap blow up in the disarmer's face.
- **The minimum total is 15.** `tools_bonus` is at least 5, so every trap with `disarmDC` 15 or lower is disarmed on the first try. All four shipped traps have a disarm DC of 13–15.

A normal failure (possible only if you raise `disarmDC` above 15) logs "failed to disarm ... but avoided triggering the mechanism" and leaves the trap armed.

### Triggering

A trap springs in `force_trigger()`. It has three callers:

| Path | Caller | Distance limit |
|:--|:--|:--|
| Walking over it | `_on_body_entered()` → `force_trigger(v_name, fail_save, false, true)` | 78 px (`is_physical_step`) |
| Scripted/API | `trigger_trap` action, `GameState.trigger_trap_by_id()`, `walk_over_and_trigger()` | 54 px |
| Fumbled disarm | `disarm_trap()` → `force_trigger(disarmer, false, true)` | **none** (`is_fumble` skips the check) |

[scripts/Trap.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/Trap.gd) — `force_trigger()`
```gdscript
var vic_node = _get_actor_node(victim_name)
if vic_node and not is_fumble:
    var dist = global_position.distance_to(vic_node.global_position)
    var max_dist = 78.0 if is_physical_step else 54.0
    if dist > max_dist:
        # ...logs "[TOO FAR] Cannot trigger ... from afar!"
        return {"triggered": false, "error": "Must walk over trap to trigger it! ...", "too_far": true, "distance": dist}

is_triggered = true
is_detected = true
_update_visual_state()
_spawn_sprung_vfx()
# ...stops the victim's movement, then:
var trig_res = cm.resolve_trap_trigger(victim_name, save_stat, save_bonus, save_dc, damage_dice_min, damage_dice_max, damage_type, status_effect, trap_name, force_fail_save)
```

`_on_body_entered()` fires for any `CharacterBody2D` whose node name doesn't contain "ghost" or "npc". The victim name is the body's `companion_name`, or its node name, or the hero's name for `HeroPlayer`.

The save bonus is 2 for everyone except the hero. For the hero it is the ability modifier for `save_stat`, plus 2 if their class is proficient: fighter STR/CON, rogue DEX/INT, any other class WIS/CHA. `resolve_trap_trigger()` rolls a d20 (or uses 2 when `force_fail_save` is set). On a successful save the hero takes half damage, rounded up. On a failed save they take full damage and get `status_effect` for **3** ticks. Damage only lands on the hero (`GameState.take_damage`) or on a matching entry in `GameState.party_members`.

### Signals

Each state change emits two signals. The node signals (`trap_detected`, `trap_disarmed`, `trap_triggered`) pass the trap node. The matching `GameState` signals pass `trap_id` instead. `AncientCatacombs.gd` connects the node signals to its on-screen notice:

[scripts/AncientCatacombs.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/AncientCatacombs.gd) — `_ready()`
```gdscript
const TrapClass = preload("res://scripts/Trap.gd")
# ...
for child in get_children():
    if child is TrapClass:
        child.trap_detected.connect(func(_t, by):
            show_notice("⚠️ Concealed Trap Spotted by %s!" % by)
        )
        child.trap_disarmed.connect(func(_t, by):
            show_notice("🔧 Trap Successfully Disarmed by %s!" % by)
        )
        child.trap_triggered.connect(func(_t, vic):
            show_notice("💥 TRAP SPRUNG on %s!" % vic)
        )
```

---

## Step by step: add a new trap

This example adds a falling-block trap to AncientCatacombs.

1. **Add the data.** Append an object to the array in `data/v1/traps.json`. Use a new, unique `id`. Keep `damageFormula` in sync with `damageMin`/`damageMax` so the file stays readable, even though the code only uses the min/max values.
   ```json
   {
     "id": "falling-block-trap",
     "title": "Falling Ceiling Block",
     "type": "floor",
     "detectDC": 14,
     "disarmDC": 16,
     "saveStat": "DEX",
     "saveDC": 13,
     "damageFormula": "2d10",
     "damageMin": 2,
     "damageMax": 20,
     "damageType": "bludgeoning",
     "statusEffect": "prone",
     "statusDuration": 1,
     "description": "A loose flagstone releases a stone block from the ceiling."
   }
   ```
   With `disarmDC` 16, a disarmer with the minimum +5 bonus fails whenever the d20 comes up 10 or lower (the floor turns those rolls into 10, for a total of 15). That is a 50% failure chance, which gives your players a real risk.

2. **Place the node.** Open `scenes/AncientCatacombs.tscn` in the Godot editor. Instance `scenes/components/Trap.tscn` as a **direct child of the scene root** (`AncientCatacombs`), not inside a group node. Give it a clear name, e.g. `FallingBlockTrap`, and move it onto a corridor the party will cross.

3. **Set the exports on the instance.** In the Inspector, set `trap_id` to `falling-block-trap`. Also set `trap_name`, `trap_type`, `detect_dc`, `disarm_dc`, `save_stat`, `save_dc`, `damage_dice_min`, `damage_dice_max`, `damage_type` and `status_effect` to the same values as the JSON. The JSON wins at runtime, but these are what the editor shows, and they are the fallback if the id ever goes missing. This matches how the three existing instances are written in the `.tscn`:
   ```
   [node name="SpikePitTrap" parent="." instance=ExtResource("19_trap")]
   position = Vector2(1780, 720)
   trap_id = "spike-pit-trap"
   trap_name = "Concealed Spike Pit"
   trap_type = "floor"
   detect_dc = 12
   disarm_dc = 13
   save_stat = "DEX"
   save_dc = 12
   damage_dice_min = 2
   damage_dice_max = 20
   damage_type = "piercing"
   ```

4. **Hook up the signals.** In AncientCatacombs there is nothing to do: the `for child in get_children()` loop in `_ready()` connects every `Trap` child. In a different scene, copy that loop (and the `TrapClass` preload) into your scene script's `_ready()`.

5. **Add a CombatManager if the scene lacks one.** `Trap._get_combat_manager()` searches the current scene for a `CombatManager` node. If none exists, it creates a bare `CombatManager.new()`. That instance is never added to the tree, so it leaks each time. Every location scene should have a `CombatManager` child, like `AncientCatacombs.tscn` does.

6. **Run it.** Start the game with `./play.sh` from `games/crpg-realm` and play to the catacombs, or jump there through the test API (see [Verify it](#verify-it)).

---

## Verify it

Two feature files cover traps:

- `tests/e2e/features/normal/12_infinity_engine_traps_detection_and_disarm.feature` has 7 scenarios in AncientCatacombs: Find Traps mode, the Find Traps spell, disarm, walking onto a trap, a forced fumble, disarming from afar (rejected) and triggering remotely (rejected).
- `tests/e2e/features/spells/spell_18_find_traps.feature` casts `find-traps` in TacticalBattle and checks that the spell resolves. That scene has no traps, so it only exercises the `CombatManager.execute_cast_spell` branch.

Run them from `games/crpg-realm`:

```bash
python3 run_cucumber_tests.py tests/e2e/features/normal/12_infinity_engine_traps_detection_and_disarm.feature
python3 run_cucumber_tests.py tests/e2e/features/spells/spell_18_find_traps.feature
```

To check your new trap, add a scenario to the traps feature. Every step below already exists in `tests/e2e/features/steps/crpg_steps.py`:

```gherkin
  Scenario: Falling block trap is revealed and disarmed
    Given an isolated test starting in scene "AncientCatacombs" with party "Bramble" the "rogue"
    When the trap "falling-block-trap" is revealed
    And the player orders "Bramble" to disarm trap "falling-block-trap"
    Then the party member is standing next to trap "falling-block-trap"
```

Don't assert `the trap "falling-block-trap" is disarmed` for a trap with `disarmDC` above 15, because that roll can now fail. The trap state is also visible at `GET /api/v1/state` under `traps`: one entry per trap, from `Trap.get_trap_info()`.

---

## Gotchas

- **Traps must be direct children of the scene root.** `GameState.pulse_trap_detection()`, `get_scene_traps()`, `disarm_trap_by_id()`, `trigger_trap_by_id()`, the Find Traps spell loops and the `traps` list in `/api/v1/state` all scan `get_tree().current_scene.get_children()`. A trap nested under a `Traps` group node is never detected, revealed or reported.
- **JSON overrides the Inspector.** If `trap_id` matches an entry in `traps.json` (or in a mod), changing DCs in the Inspector does nothing at runtime. Edit the JSON instead.
- **`statusDuration` is ignored.** `resolve_trap_trigger()` always calls `apply_status_effect(victim_name, status_effect, 3)`.
- **Disarm DC 15 or lower always succeeds.** The d20 is floored at 10 and the bonus is at least 5. Detection works the same way with a minimum of 14.
- **No natural fumbles.** Only `force_fumble` (the API's `fumble`/`critical_fumble` arg) detonates a trap during a disarm, and that detonation skips the distance check.
- **Two different trigger distances.** Walking into the collision shape allows up to 78 px. Scripted triggers allow only 54 px. Keep this in mind when writing tests that call `trigger_trap` with `no_walk`/`direct_only`.
- **Enemies can spring traps.** Any `CharacterBody2D` without "ghost" or "npc" in its node name triggers `_on_body_entered()`, including a patrolling `TacticalEnemy`. The enemy takes no damage (only the hero and `party_members` do), and the trap is used up.
- **The toolbar Spell button can error on Find Traps.** `ActionToolbar.gd` calls `cm.cast_spell("find-traps", ...)`, and `CombatManager` defines no `cast_spell`. In a scene with a `CombatManager` this is a runtime "nonexistent function" error. The HTTP API avoids it with a `has_method` check. To fix it, change the toolbar to call `cm.execute_cast_spell(GameState.hero_name, "find-traps")`.
- **The thief is the first rogue in the party.** With Elora (a rogue companion) in the party and a non-rogue hero, clicking a detected trap sends Elora to disarm it with the flat +5 bonus.

---

[← Previous: 4. Items and inventory]({{ '/projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html' | relative_url }}) · [Next: 6. Boss Fights →]({{ '/projects/crpg-realm/create-your-own-game/06-boss-fights-and-encounters.html' | relative_url }})
