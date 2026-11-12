extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	_check_production()
	_check_mobility()
	_check_charge()
	print("Ridge Scout checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check_production() -> void:
	sim.start_online_match("frontier-hunters", 3, ["humans", "monsters"], true)
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	var hub: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "colony_hub")[0]
	var muster: Dictionary = sim.spawn_unit("muster_hall", 1, hub.pos + Vector2(0, 9))
	sim.players[1].crystal = 100
	sim.players[1].aether = 50
	var queued: Dictionary = sim.issue_command([muster.tag], "train_ridge_scout")
	_check(queued.ok and sim.players[1].crystal == 50 and sim.players[1].aether == 0,
		"Muster Hall trains the scout for 50 crystal and 50 aether without an add-on")
	sim.step_ticks(32 * sim.TICK_RATE - 1)
	_check(_scouts().is_empty(), "Scout is still training before 32 seconds")
	sim.step_ticks(1)
	_check(_scouts().size() == 1, "Scout finishes after 32 seconds")
	if not _scouts().is_empty():
		var scout: Dictionary = _scouts()[0]
		_check(scout.hp == 60.0 and scout.armor == 0.0, "Scout deploys with 60 health and no armor")

func _check_mobility() -> void:
	sim.load_scenario_dict({
		"name": "Scout Mobility", "paused": true,
		"map": {"width": 96, "height": 64,
			"high_ground": [{"x": 8, "y": 8, "w": 18, "h": 21}],
			"water_channels": [{"width": 9, "points": [[49, 0], [49, 64]]}],
			"bridges": [{"x": 40, "y": 39, "w": 20, "h": 12}]}
	})
	var scout: Dictionary = sim.spawn_unit("ridge_scout", 1, Vector2(34, 20))
	var plateau := Vector2(20, 20)
	sim._rebuild_astar_grid()
	_check(scout.cliff_walk and sim._has_clear_line_of_walk(scout.pos, plateau, scout.radius, scout.cliff_walk),
		"Scout can cross the ledge directly")
	_check(not sim._has_clear_line_of_walk(scout.pos, plateau, scout.radius),
		"The same ledge blocks ordinary infantry")
	sim.issue_command([scout.tag], "move", plateau)
	sim.step_ticks(140)
	_check(scout.pos.distance_to(plateau) < 2.0 and sim.unit_elevation(scout) > 2.0, "Scout reaches high ground, ended %s" % scout.pos)
	var opposite := Vector2(70, 20)
	_check(not sim._has_clear_line_of_walk(scout.pos, opposite, scout.radius, scout.cliff_walk), "River blocks cliff walkers")
	sim.issue_command([scout.tag], "move", opposite)
	for step in range(620):
		sim.step_ticks(1)
		if sim.is_water_at(scout.pos, 0.01):
			failures.append("Scout entered water")
			break
	_check(scout.pos.distance_to(opposite) < 2.0, "Scout follows the bridge to the opposite bank, ended %s" % scout.pos)

func _check_charge() -> void:
	sim.reset_state(3, 96, 64)
	var scout: Dictionary = sim.spawn_unit("ridge_scout", 1, Vector2(20, 20))
	var tank: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(32, 22))
	var structure: Dictionary = sim.spawn_unit("silo", 1, Vector2(36, 20))
	var flyer: Dictionary = sim.spawn_unit("needlewing", 1, Vector2(32, 18))
	_check(not sim.issue_command([scout.tag], "ridge_charge", Vector2(40, 20)).ok, "Charge rejects an out-of-range point")
	_check(sim.issue_command([scout.tag], "ridge_charge", Vector2(32, 20)).ok, "Scout throws the charge")
	_check(not sim.issue_command([scout.tag], "ridge_charge", Vector2(32, 20)).ok, "Cooldown rejects a second throw")
	sim.step_ticks(sim.RIDGE_CHARGE_DELAY_TICKS - 1)
	_check(tank.hp == tank.max_hp and sim.ridge_charges.size() == 1, "Charge stays pending for two seconds")
	sim.step_ticks(1)
	_check(tank.hp == tank.max_hp - 5.0 and tank.pos.y > 23.0, "Charge bypasses armor, hits allies, and knocks back ground units")
	_check(flyer.hp == flyer.max_hp and structure.hp == structure.max_hp, "Charge spares flyers and structures")
	scout.hp = 40.0
	scout.out_of_combat_timer = 0.0
	sim.step_ticks(7 * sim.TICK_RATE)
	_check(scout.hp == 40.0, "Scout remains damaged for seven seconds")
	sim.step_ticks(sim.TICK_RATE)
	_check(scout.hp > 42.0 and scout.hp < 43.0, "Scout regenerates after the delay")

func _scouts() -> Array:
	return sim.units.values().filter(func(unit): return unit.unit_type == "ridge_scout")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
