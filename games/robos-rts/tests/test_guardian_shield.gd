extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 120, "height": 90},
		"players": {"1": {"faction": "aliens"}, "2": {"faction": "humans"}},
	})
	var warden: Dictionary = sim.spawn_unit("aegis_warden", 1, Vector2(45, 47))
	var second: Dictionary = sim.spawn_unit("aegis_warden", 1, Vector2(45, 52))
	var ally: Dictionary = sim.spawn_unit("sunblade", 1, Vector2(49, 50))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(62, 50))
	var light_ground: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(66, 52))
	var shielded_enemy: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(55, 43))
	var shield_before: float = ally.shields
	var ranged: Dictionary = sim._active_weapon(rifle)
	var melee: Dictionary = sim._active_weapon(light_ground)
	_check(warden.max_hp == 40.0 and warden.max_shields == 40.0 and warden.energy == 50.0
		and not warden.attributes.has("Light"), "Warden uses the ladder Sentry vitals and attributes")
	_check(not sim.issue_command([warden.tag], "guardian_shield").ok, "Guardian Shield requires 75 energy")
	sim._refresh_vision()
	var barrier_site: Vector2 = warden.pos + Vector2(0, 21)
	var occupant: Dictionary = sim.spawn_unit("sunblade", 1, barrier_site)
	_check(sim.issue_command([warden.tag], "phase_barrier", barrier_site).ok,
		"The ladder barrier can be placed at 21 range")
	var barriers: Array = sim.units.values().filter(func(unit): return unit.unit_type == "phase_barrier")
	_check(not barriers.is_empty() and barriers.front().radius == 3.75 and barriers.front().expires_tick == sim.tick + 11 * sim.TICK_RATE,
		"The ladder barrier uses the 3.75-world-unit radius and 11-second lifetime")
	_check(occupant.pos.distance_to(barrier_site) > occupant.radius + 3.75, "The barrier pushes ground occupants outside the circle")
	warden.energy = 75.0
	second.energy = 75.0
	_check(sim.issue_command([warden.tag, second.tag], "guardian_shield").accepted == 2
		and warden.energy == 0.0 and second.energy == 0.0, "Both wardens pay to cast their Guardian Shields")
	sim._apply_damage_to_target(rifle, ally, 6.0, {}, 1.0, false, ranged)
	_check(ally.shields == shield_before - 4.0, "Overlapping shields remove two damage total from a ranged hit")
	sim._apply_damage_to_target(light_ground, ally, 5.0, {}, 1.0, false, melee)
	_check(ally.shields == shield_before - 9.0, "Melee hits ignore Guardian Shield")
	sim._apply_damage_to_target(rifle, ally, 6.0, {}, 1.0, true)
	_check(ally.shields == shield_before - 15.0, "Spell damage ignores Guardian Shield")
	sim._refresh_vision()
	var beam: Dictionary = sim._active_weapon(warden, shielded_enemy)
	var enemy_shield: float = shielded_enemy.shields
	_check(sim._execute_weapon_hit(warden, shielded_enemy, {}, beam) and shielded_enemy.shields == enemy_shield - 10.0,
		"The Warden beam deals its extra four damage to shields")
	shielded_enemy.shields = 3.0
	var enemy_hp: float = shielded_enemy.hp
	_check(sim._execute_weapon_hit(warden, shielded_enemy, {}, beam) and shielded_enemy.shields == 0.0
		and shielded_enemy.hp == enemy_hp - (6.0 - shielded_enemy.armor), "Shield bonus damage never spills into health")
	_check(not sim.issue_command([warden.tag], "lattice_burst", rifle.pos).ok, "Legacy Lattice Burst is unavailable on the ladder")
	if not barriers.is_empty():
		var archon: Dictionary = sim.spawn_unit("lattice_archon", 1, barrier_site + Vector2(-13, 0))
		var crossing: Vector2 = barrier_site + Vector2(14, 0)
		_check(sim.issue_command([archon.tag], "move", crossing).ok, "A Massive unit can order a route through the barrier")
		sim.step_ticks(4 * sim.TICK_RATE)
		_check(not sim.units.has(barriers.front().tag) and archon.pos.x > barrier_site.x,
			"The Archon crushes the Phase Barrier on contact and continues through it")
	var duration: int = ceili(Rules.GUARDIAN_SHIELD_SECONDS * sim.TICK_RATE)
	sim.step_ticks(duration)
	_check(sim.guardian_shield_ticks(warden) == 0 and sim.guardian_shield_ticks(second) == 0, "Guardian Shield expires on its deadline")
	_finish()

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)

func _finish() -> void:
	if failures.is_empty():
		print("PASS: ladder Warden weapon, shield-only bonus, non-stacking Guardian Shield, spell and melee exceptions, expiry")
	quit(0 if failures.is_empty() else 1)
