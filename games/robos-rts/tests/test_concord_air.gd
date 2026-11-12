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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 200, "height": 150},
		"players": {"1": {"faction": "aliens", "crystal": 1800, "aether": 1800}, "2": {"faction": "humans"}},
	})
	var assembly: Dictionary = sim.spawn_unit("star_assembly", 1, Vector2(39, 33))
	var core: Dictionary = sim.spawn_unit("concord_core", 1, Vector2(35, 45))
	_check(not sim.issue_command([assembly.tag], "train_dawn_interceptor").ok, "A Star Assembly needs a power field")
	sim.spawn_unit("resonator", 1, Vector2(30, 37))
	_check(sim.issue_command([assembly.tag], "train_dawn_interceptor").ok and sim.issue_command([assembly.tag], "train_prism_ray").ok
		and sim.players[1].crystal == 1400 and sim.players[1].aether == 1550, "A powered Assembly queues the two paid aircraft")
	sim.step_ticks(35 * sim.TICK_RATE + ceili(60.2 * sim.TICK_RATE))
	_check(sim.units.values().any(func(unit): return unit.unit_type == "dawn_interceptor")
		and sim.units.values().any(func(unit): return unit.unit_type == "prism_ray"), "Both aircraft deploy after their full build times")
	_check(sim.issue_command([core.tag], "research_concord_air_weapons").ok, "The Concord Core researches air weapons")
	sim.step_ticks(ceili(Rules.CONCORD_AIR_TIMES[0] * sim.TICK_RATE))
	_check(not sim.issue_command([core.tag], "research_concord_air_weapons").ok, "Level two requires a Fleet Spire")
	_check(not sim.issue_command([assembly.tag], "train_horizon_lancer").ok, "The Lancer requires Fleet Spire tech")
	var fleet: Dictionary = sim.spawn_unit("fleet_spire", 1, Vector2(28, 49))
	_check(sim.issue_command([core.tag], "research_concord_air_weapons").ok
		and sim.issue_command([fleet.tag], "research_pulse_crystals").ok
		and sim.issue_command([fleet.tag], "research_flux_vanes").ok
		and sim.issue_command([fleet.tag], "research_tectonic_resonance").ok,
		"The Fleet Spire opens tier two and queues specialist upgrades")
	sim.step_ticks(ceili(Rules.PULSE_CRYSTALS_RESEARCH.time * sim.TICK_RATE) + ceili(Rules.FLUX_VANES_RESEARCH.time * sim.TICK_RATE)
		+ ceili(Rules.TECTONIC_RESONANCE_RESEARCH.time * sim.TICK_RATE))
	_test_aircraft()
	_test_lancer()
	print("Concord air: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_aircraft() -> void:
	var dawn: Dictionary = sim.spawn_unit("dawn_interceptor", 1, Vector2(106, 68))
	var escort: Dictionary = sim.spawn_unit("dawn_interceptor", 1, Vector2(107, 75))
	var ray: Dictionary = sim.spawn_unit("prism_ray", 1, Vector2(106, 88))
	var marine: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(115, 68))
	var tank: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(117, 90))
	sim.issue_command([marine.tag, tank.tag, escort.tag, ray.tag], "hold_fire")
	sim._refresh_vision()
	_check(sim.unit_upgrade_level(dawn, "weapons") == 2 and sim.weapon_range_against(dawn) == 17.5,
		"Air weapons and Pulse Crystals upgrade the fighter")
	_check(not sim.can_attack(escort, marine), "An unlifted ground unit is outside the fighter's target mask")
	_check(sim.issue_command([dawn.tag], "gravity_lift", marine.pos, marine.tag).ok and dawn.energy == 0.0
		and marine.is_immobile and marine.flight_height > 0.0 and sim.can_attack(escort, marine),
		"Gravity Lift spends 50 energy, disables its target and makes it vulnerable to anti-air")
	_check(not sim.issue_command([marine.tag], "move", marine.pos + Vector2(6, 0)).ok
		and sim.issue_command([dawn.tag], "stop").ok and marine.flight_height == 0.0 and not marine.is_immobile,
		"Stop releases the target and restores its movement")
	_check(is_equal_approx(sim.effective_move_speed(ray), 4.65 * 2.5), "Flux Vanes improves travel speed")
	var hp: float = tank.hp
	_check(sim.issue_command([ray.tag], "prism_alignment").ok and is_equal_approx(sim.effective_move_speed(ray), 2.89 * 2.5)
		and sim._execute_weapon_hit(ray, tank) and hp - tank.hp == 17.0,
		"Alignment reduces speed and adds six damage against armor")
	sim.step_ticks(ceili(Rules.PRISM_ALIGNMENT_SECONDS * sim.TICK_RATE))
	_check(is_equal_approx(sim.effective_move_speed(ray), 4.65 * 2.5)
		and not sim.issue_command([ray.tag], "prism_alignment").ok, "Alignment expires before its cooldown ends")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _test_lancer() -> void:
	var lancer: Dictionary = sim.spawn_unit("horizon_lancer", 1, Vector2(139, 110))
	var structure: Dictionary = sim.spawn_unit("silo", 2, Vector2(153, 110))
	var aircraft: Dictionary = sim.spawn_unit("brood_siege_flyer", 2, Vector2(155, 114))
	_check(sim.weapon_range_against(lancer, structure) == 25.0 and sim.weapon_range_against(lancer, aircraft) == 32.5,
		"The Lancer uses distinct ground and air ranges")
	var hp: float = structure.hp
	_check(sim._execute_weapon_hit(lancer, structure) and hp - structure.hp == 87.0,
		"Tectonic Resonance adds 40 structure damage alongside air weapon upgrades")
	hp = aircraft.hp
	_check(sim._execute_weapon_hit(lancer, aircraft) and hp - aircraft.hp == 57.0,
		"The air weapon deals Massive bonus damage with separate upgrade scaling")
