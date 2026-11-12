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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 180, "height": 140},
		"players": {"1": {"faction": "monsters", "crystal": 800, "aether": 800}, "2": {"faction": "humans"}},
	})
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(31, 32))
	var stock: Dictionary = sim.players[1]
	_check(not sim.issue_command([nest.tag], "train_siphon_wyrm").ok, "The Wyrm is gated by Hive tech")
	nest["structure_form"] = "brood_hive"
	_check(sim.issue_command([nest.tag], "train_siphon_wyrm").ok and stock.crystal == 700 and stock.aether == 600,
		"The Hive enables paid 100/200 Wyrm hatching")
	sim.step_ticks(ceili(40.0 / 1.4 * sim.TICK_RATE))
	var wyrms: Array = sim.units.values().filter(func(unit): return unit.unit_type == "siphon_wyrm")
	_check(wyrms.size() == 1 and wyrms[0].hp == 150.0 and wyrms[0].energy >= 50.0,
		"The Wyrm hatches after 28.57 seconds with 150 HP and 50 energy")
	_test_siphon()
	_test_clouds_and_grasp()
	print("Siphon Wyrm: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_siphon() -> void:
	var wyrm: Dictionary = sim.spawn_unit("siphon_wyrm", 1, Vector2(57, 65))
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(68, 65))
	wyrm.energy_profile = wyrm.energy_profile.duplicate()
	wyrm.energy_profile.regen = 0.0
	nest.hp_regen = 0.0
	_check(sim.issue_command([wyrm.tag], "siphon_structure", nest.pos, nest.tag).ok and wyrm.is_immobile,
		"Siphon channels against a friendly Gnarl structure")
	sim.step_ticks(ceili(Rules.SIPHON_SECONDS * sim.TICK_RATE))
	_check(is_equal_approx(nest.max_hp - nest.hp, 200.0) and is_equal_approx(wyrm.energy, 100.0) and not wyrm.is_immobile,
		"A complete channel exchanges 200 structure HP for 50 energy")
	nest.hp = 8.0
	_check(sim.issue_command([wyrm.tag], "siphon_structure", nest.pos, nest.tag).ok, "A low-health structure can start a short channel")
	sim.step_ticks(10)
	_check(nest.hp == 7.5 and is_equal_approx(wyrm.energy, 100.125) and not wyrm.is_immobile,
		"Siphon releases at the 7.5 HP floor")
	nest.hp = 500.0
	sim.issue_command([wyrm.tag], "siphon_structure", nest.pos, nest.tag)
	_check(sim.issue_command([wyrm.tag], "stop").ok and not wyrm.has("siphon_target"), "Stop interrupts Siphon")

func _test_clouds_and_grasp() -> void:
	var wyrm: Dictionary = sim.spawn_unit("siphon_wyrm", 1, Vector2(117, 65))
	var other: Dictionary = sim.spawn_unit("siphon_wyrm", 1, Vector2(117, 72))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(130, 65))
	var tank: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(131, 73))
	var ally: Dictionary = sim.spawn_unit("blight_hurler", 1, Vector2(129, 61))
	var first: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(131, 59))
	var second: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(134, 60))
	var air: Dictionary = sim.spawn_unit("drift_sac", 1, Vector2(132, 56))
	sim.issue_command([rifle.tag, tank.tag, first.tag, second.tag, ally.tag], "hold_fire")
	sim._refresh_vision()
	wyrm.energy = 200.0
	_check(not sim.issue_command([wyrm.tag], "wyrm_grasp", tank.pos, tank.tag).ok and wyrm.energy == 200.0,
		"The 5.0.17 Grasp rule protects Siege Tanks")
	_check(sim.issue_command([wyrm.tag], "wyrm_grasp", rifle.pos, rifle.tag).ok and wyrm.energy == 125.0
		and rifle.pos.distance_to(wyrm.pos) <= 6.0, "Grasp pulls a visible ground unit to clear ground")
	_check(sim.issue_command([wyrm.tag], "blinding_cloud", ally.pos).ok and wyrm.energy == 25.0
		and sim.weapon_range_against(ally) == 1.0 and sim.weapon_range_against(first, air) > 1.0,
		"Blinding Cloud also reduces allied ground range and leaves air weapons intact")
	wyrm.energy = 125.0
	other.energy = 125.0
	first.hp = 9.0
	var second_hp: float = second.hp
	var air_hp: float = air.hp
	_check(sim.issue_command([wyrm.tag], "parasitic_cloud", first.pos, first.tag).ok
		and sim.issue_command([other.tag], "parasitic_cloud", second.pos, second.tag).ok,
		"Two clouds can attach to separate aircraft")
	sim.step_ticks(sim.TICK_RATE)
	_check(not sim.units.has(first.tag) and sim.parasitic_clouds.any(func(cloud): return cloud.target == 0),
		"The cloud lingers when its first anchor dies")
	_check(is_equal_approx(second.hp, second_hp - 120.0 / 7.0) and air.hp == air_hp,
		"Overlapping clouds apply one armor-bypassing dose to hostile air only")
	sim.step_ticks(6 * sim.TICK_RATE + 1)
	_check(sim.parasitic_clouds.is_empty() and sim.blinding_clouds.is_empty()
		and sim.weapon_range_against(ally) > 1.0, "Both cloud types expire on schedule")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
