---
title: "10. Aggro & Pack AI"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 10
permalink: /projects/crpg-realm/create-your-own-game/10-aggro-tactics-and-pack-ai.html
description: "How TacticalEnemy picks targets: proximity aggro, the threat table, taunts and pack alerts, and how to tune or link enemies."
---

# 10. Aggro, Threat and Pack AI
{: .no_toc }

In this chapter you place a linked pack of enemies and tune how they react. You will learn the four `TacticalEnemy` states, how proximity aggro and the threat table choose a target, how a taunt forces a switch, and how one enemy pulls its allies into the fight.
{: .fs-6 .fw-300 }

![A BDD run of the pack aggro scenario in TacticalBattle]({{ '/assets/images/crpg-realm/threat_aggro_splash.png' | relative_url }}){: .robos-zoomable-img }
*Feature 06 running in TacticalBattle: the "Pack enemies aggravate and rally to attack when their ally is struck" scenario.*

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

### Which enemies use this AI

The game has two enemy scripts:

| Script | Scene | Used in | AI |
|:--|:--|:--|:--|
| `scripts/TacticalEnemy.gd` (`class_name TacticalEnemy`) | `scenes/components/TacticalEnemy.tscn` | `TacticalBattle.tscn` (`EnemyWolfAlpha`, `EnemySkeletonArcher`, `EnemyShadowStalker`), plus the enemies `TacticalBattle.gd` reconfigures or spawns for the golem, goblin and spell test encounters | Threat table, proximity aggro, pack alerts. This chapter. |
| `scripts/ShadowHound.gd` (`class_name ShadowHound`) | `scenes/ShadowHound.tscn` | `VillageSquare`, `WhisperingForest` (`DireWolf`, `ForestStalker`), `AncientCatacombs` (`SkeletonArcher`, `CryptGuardian`) | Patrols, chases the hero when closer than 190 px, plays an attack animation. No threat table, no pack logic, and its strike deals no damage. The location script kills it when clicked. |

Everything below is about `TacticalEnemy`. It does not read `data/v1/monsters.json`. Every stat is an `@export` set on the instance in the `.tscn` file.

### Exports that shape behaviour

[scripts/TacticalEnemy.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/TacticalEnemy.gd)
```gdscript
@export var enemy_id: String = "enemy_1"
@export var enemy_name: String = "Corrupted Wolf Alpha"
# ...
@export var is_hostile: bool = true:
	set(val):
		is_hostile = val
		_update_ui()
@export var max_hp: int = 28
@export var armor_class: int = 13
@export var attack_bonus: int = 4
@export var damage_min: int = 4
@export var damage_max: int = 10
# ...
@export var move_speed: float = 140.0
@export var aggro_radius: float = 280.0
@export var pack_friend_radius: float = 480.0
@export var pack_alert_radius: float = 950.0
@export var friends: Array[String] = []
# ...
@export var is_ranged: bool = false
@export var ranged_standoff_distance: float = 240.0
@export var waypoints: Array[Vector2] = []

enum State { PATROL, CHASE, ATTACK, DEAD }
```

| Export | Used by | Meaning |
|:--|:--|:--|
| `aggro_radius` (280) | `_evaluate_proximity_aggro()` | A hostile patrolling enemy targets the closest party member inside this radius. |
| `pack_friend_radius` (480) | `_alert_friends_proximity()` | When an enemy aggros by proximity, allies inside this radius rally. |
| `pack_alert_radius` (950) | `_alert_friends()` | When an enemy takes damage from an attacker, allies inside this radius join in. |
| `friends` | both alert functions | `enemy_id`s that always count as allies, at any distance. The link works in both directions. |
| `is_hostile` | all aggro functions | `false` ignores proximity and ally alerts. Damage still adds threat. |

No shipped scene sets `friends`. The three `TacticalBattle` enemies rely on distance only.

### The state machine

`_physics_process()` re-evaluates proximity every 0.45 s, then runs one state:

- **PATROL** — walks the `waypoints` loop at 60 % speed, waiting 1.5–3 s at each point. With no waypoints it stands still.
- **CHASE** — walks straight at `current_target` (no pathfinder) until within 50 px, or within `ranged_standoff_distance` when `is_ranged`. Then switches to ATTACK.
- **ATTACK** — every 2.4 s calls `_strike_target()`: d20 + `attack_bonus` against the target's AC, damage `randi_range(damage_min, damage_max)`. Falls back to CHASE if the target moves beyond 65 px (ranged: standoff + 40).
- **DEAD** — set by `die()`. The corpse stays and can be looted with `loot_corpse()`.

A target that becomes invisible sends the enemy back to PATROL. In round-based mode (`combat_mode == 1` on the scene) PATROL and CHASE do not move.

### Proximity aggro

[scripts/TacticalEnemy.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/TacticalEnemy.gd)
```gdscript
func _evaluate_proximity_aggro() -> void:
	if current_state == State.DEAD:
		return
	if not is_hostile:
		return

	var candidates: Array[Node2D] = _get_party_candidates()
	# ...
	if current_state == State.PATROL or current_target == null or not is_instance_valid(current_target):
		var closest: Node2D = null
		var min_d = aggro_radius
		for c in candidates:
			var d = global_position.distance_to(c.global_position)
			if d <= min_d:
				min_d = d
				closest = c
		if closest:
			current_state = State.CHASE
			_set_aggro_target(closest, 30, "Hostile Proximity")
			# ... log "⚠️ %s is hostile and aggravated by proximity to %s (Distance: %dpx)!"
			aggravated_by_proximity.emit(self, closest, min_d)
			_alert_friends_proximity(closest, min_d)
```

`_get_party_candidates()` returns the node found by `find_child("HeroPlayer")` plus every `PartyCompanion` that is a **direct child** of the current scene, skipping anyone unconscious or invisible.

### The threat table

Each enemy keeps two dictionaries keyed by actor name (`GameState.hero_name` for the hero, `companion_name` for companions):

- `threat_table` — accumulated threat.
- `direct_damage_table` — total damage that actor has dealt to this enemy.

`take_damage(amount, attacker)` feeds both, then alerts the pack:

[scripts/TacticalEnemy.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/TacticalEnemy.gd)
```gdscript
	if attacker:
		var a_name = _get_actor_name(attacker)
		direct_damage_table[a_name] = int(direct_damage_table.get(a_name, 0)) + amount
		add_threat(attacker, amount * 2 + 10, "Attack Damage")
		_alert_friends(attacker, amount)
```

`add_threat()` decides whether to switch target:

[scripts/TacticalEnemy.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/TacticalEnemy.gd)
```gdscript
	if current_target == null or not is_instance_valid(current_target):
		should_switch = true
	elif source != current_target:
		var cur_direct = int(direct_damage_table.get(current_target_name, 0))
		var new_direct = int(direct_damage_table.get(s_name, 0))
		if cur_direct == 0 and new_direct > 0:
			should_switch = true
		elif new_threat > int(cur_threat * 1.15) + 3:
			should_switch = true

	if should_switch:
		_set_aggro_target(source, new_threat, reason)
```

So a hit is worth `damage × 2 + 10` threat, and the enemy switches when:

1. it has no valid target, or
2. its current target has dealt no damage yet and the new source has (the first real attacker always wins over a proximity pick), or
3. the new source's threat exceeds `int(current × 1.15) + 3`.

Worked example from feature 06: Vance hits the wolf for 16–24; say 20 (threat 50). Elora's bow hits for 12–16 each (threat 34–42 each). After one arrow she is below `int(50 × 1.15) + 3 = 60`. After two she is above it, and the wolf logs `switches target to Elora`.

### Taunt

[scripts/TacticalEnemy.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/TacticalEnemy.gd)
```gdscript
func force_taunt(source: Node2D, taunt_threat: int = 50) -> void:
	if not source or not is_instance_valid(source) or current_state == State.DEAD:
		return
	var s_name = _get_actor_name(source)
	threat_table[s_name] = int(threat_table.get(s_name, 0)) + taunt_threat
	_set_aggro_target(source, threat_table[s_name], "Taunt")
	GameState.log_message("combat", "🛡️ %s taunted %s! Aggro forcefully diverted!" % [s_name, enemy_name])
```

A taunt switches unconditionally. The only caller is `TacticalBattle.execute_taunt_on_enemy(source_name, enemy_id)`, which passes 60. There is no taunt button in the toolbar; it is reached through the HTTP API.

### Pack alerts

Two functions broadcast to allies. Both loop over `get_tree().current_scene.get_children()` and only consider hostile, living `TacticalEnemy` siblings:

| Trigger | Broadcaster | Ally condition | Ally reaction | Ally threat added |
|:--|:--|:--|:--|:--|
| Enemy takes damage from an attacker | `_alert_friends()` | linked in `friends`, or distance ≤ `pack_alert_radius` | `aggravate_on_friend_attack()` | `int(damage × 0.75) + 35` if linked, `+ 20` otherwise |
| Enemy aggros by proximity | `_alert_friends_proximity()` | linked in `friends`, or distance ≤ `pack_friend_radius` | `aggravate_on_friend_proximity()` | 25 |

[scripts/TacticalEnemy.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/TacticalEnemy.gd)
```gdscript
func _alert_friends(attacker: Node2D, damage: int) -> void:
	# ...
	for child in cur_sc.get_children():
		if child is TacticalEnemy and child != self and is_instance_valid(child):
			if child.current_state != State.DEAD and child.is_hostile:
				var dist = global_position.distance_to(child.global_position)
				var is_linked_friend = friends.has(child.enemy_id) or child.friends.has(enemy_id)
				if is_linked_friend or dist <= pack_alert_radius:
					child.aggravate_on_friend_attack(self, attacker, damage)
```

An ally that is patrolling always takes the attacker as its target. An ally that already has a target switches only if the new threat beats the same `× 1.15 + 3` rule. A proximity rally only retargets allies that are patrolling or have no target.

### Signals

`TacticalEnemy` emits `enemy_slain`, `corpse_looted`, `body_clicked`, `target_changed`, `friend_aggravated` and `aggravated_by_proximity`. `TacticalBattle._ready()` connects all of them to show notices and check for victory. A scene that uses `TacticalEnemy` must at least connect `body_clicked`, or clicking the enemy does nothing (chapter 12 shows a handler).

---

## Step by step: a linked pack

Do this in your own scene (chapter 12 builds one). Adding enemies to `TacticalBattle.tscn` breaks feature 06, which asserts `the tactical battle contains 3 enemies`.

1. **Instance the enemy scene.** In your location `.tscn`, add `scenes/components/TacticalEnemy.tscn` as an `ext_resource`, then add two instances as **direct children of the scene root**:

   New code — add to your scene file:
   ```
   [node name="GhoulLeader" parent="." instance=ExtResource("5_te")]
   position = Vector2(1500, 540)
   enemy_id = "ghoul_leader"
   enemy_name = "Vault Ghoul"
   max_hp = 30
   armor_class = 12
   attack_bonus = 4
   damage_min = 3
   damage_max = 8
   sprite_texture_path = "res://assets/sprites/enemies/zombie.png"
   friends = ["ghoul_lurker"]

   [node name="GhoulLurker" parent="." instance=ExtResource("5_te")]
   position = Vector2(1750, 300)
   enemy_id = "ghoul_lurker"
   enemy_name = "Vault Lurker"
   max_hp = 18
   armor_class = 13
   sprite_texture_path = "res://assets/sprites/enemies/orc.png"
   waypoints = [Vector2(1750, 300), Vector2(1750, 450)]
   ```
   `GhoulLurker` is about 350 px from the leader, which is inside `pack_friend_radius` anyway. The `friends` link matters once you move it further than 480 px (proximity rally) or 950 px (damage alert).

2. **Tune the radii if needed.** Smaller `aggro_radius` makes sneaking past possible. `pack_friend_radius` controls how far a proximity pull spreads. Set these per instance, e.g. `aggro_radius = 200.0`.

3. **Make a bystander.** Set `is_hostile = false` on an instance. It ignores proximity and ally alerts, but hitting it still builds threat and turns it on the attacker.

4. **Handle clicks.** Connect `body_clicked` in your scene script and call `take_damage(amount, attacker_node)` with a real attacker node. See `_on_enemy_clicked()` in chapter 12. Passing `null` as the attacker skips threat and pack alerts.

5. **(Optional) Taunt from code.** Call `enemy.force_taunt(hero, 60)` from your scene script, for example from a button or a dialogue outcome.

---

## Verify it

[tests/e2e/features/normal/06_infinity_aggro_threat_and_target_switching.feature](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/tests/e2e/features/normal/06_infinity_aggro_threat_and_target_switching.feature) covers all of this in `TacticalBattle`:

1. **Threat switching and taunt.** Vance attacks `wolf_alpha`, Elora attacks three times, the wolf switches to Elora, then Vance taunts it back.
2. **Pack alert on damage.** One hit on `wolf_alpha` turns `skeleton_archer` and `shadow_stalker` onto Vance.
3. **Proximity aggro and rally.** `shadow_stalker` is moved to (2200, 680). Vance approaches to 220 px of the wolf. The wolf and the nearby archer aggro. The distant stalker stays on patrol.
4. **Passive enemy.** With `wolf_alpha` set to passive, approaching it triggers nothing.

```bash
cd games/crpg-realm
python3 run_cucumber_tests.py tests/e2e/features/normal/06_infinity_aggro_threat_and_target_switching.feature
```

The state steps read the `battle.enemies` list in `/api/v1/state`. `GameControlServer.gd` builds it from every direct child of the current scene that has `loot_corpse()` and an `enemy_id`, so the same steps work in your own scene. For the pack from the steps above:

```gherkin
  Scenario: Approaching the ghoul pulls its linked ally
    Given an isolated scenario starting in scene "SunkenVault"
    Then all tactical enemies are on patrol with no targets
    When the player approaches within proximity distance of enemy "ghoul_leader"
    Then enemy "ghoul_leader" becomes aggravated with target "Lieutenant Vance"
    And close pack friend "ghoul_lurker" also aggros on "Lieutenant Vance"
    And the activity log contains message "rallies with close ally"
```

---

## Gotchas

- **Direct children only.** Party candidates, pack alerts, fireball targets and the `battle.enemies` API list all scan `current_scene.get_children()`. An enemy under an `Enemies` group node never gets alerted and never shows up in tests. A companion under a group node is never targeted.
- **No attacker, no threat.** `take_damage(amount)` with no attacker only lowers HP. `CombatManager.execute_cast_spell()` passes `null` to its AoE helper, so spells cast through it (outside `TacticalBattle.execute_spell_cast()`) neither build threat nor alert the pack.
- **Proximity aggro does not write threat.** `_set_aggro_target(closest, 30, ...)` only logs 30. The threat table entry stays at 0, so the first party member to deal damage takes the enemy over (rule 2 above).
- **Threat is keyed by display name.** Two actors with the same `companion_name` share one entry.
- **Enemies walk in straight lines.** CHASE and PATROL use `move_and_slide()` toward the target with no pathfinding. Place walls so enemies cannot get pinned behind them.
- **Enemies spring traps.** A patrolling `TacticalEnemy` that walks over a `Trap` triggers it (chapter 5). Keep patrol routes clear of traps.
- **`monsters.json` is not wired in.** Editing a monster there changes nothing for `TacticalEnemy`. Set the exports on the instance.
- **ShadowHound is not TacticalEnemy.** Scenes that use `ShadowHound.tscn` get none of the behaviour in this chapter, and those enemies do not appear in `battle.enemies`.

---

[← Previous: 9. Party dynamics and formations]({{ '/projects/crpg-realm/create-your-own-game/09-party-dynamics-and-formations.html' | relative_url }}) · [Next: 11. Spells, AoE and magic →]({{ '/projects/crpg-realm/create-your-own-game/11-spells-aoe-and-magic-systems.html' | relative_url }})
