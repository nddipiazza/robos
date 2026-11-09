extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_detection_and_mobility()
	_test_occupied_surface()
	_test_living_ground_bonus()
	_test_splash()
	print("Brood burrow checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _visible(player: int, tag: int) -> bool:
	return sim.get_observation(player).units.any(func(unit): return unit.tag == tag)

func _test_detection_and_mobility() -> void:
	sim.load_scenario_dict({
		"paused": true, "fog_of_war": true, "map": {"width": 100, "height": 72},
		"units": [
			{"type": "rifleman", "owner": 1, "x": 36, "y": 29},
			{"type": "skitterling", "owner": 2, "x": 44, "y": 32},
		],
	})
	var units: Array = sim.units.values()
	var rifle: Dictionary = units[0]
	var ling: Dictionary = units[1]
	var site: Vector2 = ling.pos
	var full_sight: float = ling.sight_range
	_check(_visible(1, ling.tag), "An enemy in ordinary sight sees a surfaced Skitterling")
	sim.issue_command([rifle.tag], "hold_fire")
	sim.issue_command([ling.tag], "move", Vector2(60, 32))
	sim.issue_command([ling.tag], "move", Vector2(64, 44), 0, "", true)
	_check(sim.issue_command([ling.tag], "burrow").ok, "An eligible ground unit can burrow")
	_check(not sim.issue_command([rifle.tag], "burrow").ok, "Other factions cannot issue Burrow to their units")
	_check(ling.orders.is_empty() and ling.is_immobile and ling.sight_range < full_sight, "Burrow clears the old route, stops movement and reduces sight")
	_check(not sim.issue_command([ling.tag], "move", Vector2(65, 32)).ok and not sim.issue_command([ling.tag], "attack_target", rifle.pos, rifle.tag).ok, "Burrowed units reject new movement and attack orders")
	_check(not _visible(1, ling.tag) and _visible(2, ling.tag) and _visible(0, ling.tag), "Only its owner, spectators or detectors can see the burrowed unit")

	var scout: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(40, 32))
	sim.issue_command([scout.tag], "move", Vector2(55, 32))
	sim.step_ticks(96)
	_check(scout.pos.x > 49.5 and absf(scout.pos.y - 32.0) < 0.1 and ling.pos == site, "An undetected unit neither blocks passing ground troops nor gets shoved")
	_check(not _visible(1, ling.tag) and not sim.issue_command([rifle.tag], "attack_target", site, ling.tag).ok, "Close sight and a direct target tag cannot bypass detection")
	var tower: Dictionary = sim.spawn_unit("sentry_turret", 1, Vector2(43, 42))
	sim.issue_command([tower.tag], "hold_fire")
	sim.step_ticks(8)
	_check(_visible(1, ling.tag) and ling.burrowed, "A completed detector reveals the unit without surfacing it")
	_check(sim.issue_command([rifle.tag], "attack_target", site, ling.tag).ok, "A detected burrowed unit is a valid direct target")
	sim.step_ticks(24)
	_check(ling.hp < ling.max_hp and ling.pos == site, "The direct shot damages the detected unit while it stays underground")
	sim.issue_command([rifle.tag], "stop")
	var gun: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(58, 45))
	sim.issue_command([gun.tag], "hold_fire")
	sim.step_ticks(8)
	tower.hp = 1.0
	_check(sim.issue_command([gun.tag], "attack_target", tower.pos, tower.tag).ok, "The artillery can target the detector")
	sim.step_ticks(32)
	_check(not sim.units.has(tower.tag) and not _visible(1, ling.tag), "Losing the detector hides the unit again while ordinary sight remains")
	_check(sim.issue_command([ling.tag], "surface").ok and not ling.is_immobile and ling.sight_range == full_sight, "Surface restores normal mobility and sight")
	sim.issue_command([ling.tag], "move", Vector2(61, 28))
	sim.step_ticks(32)
	_check(ling.pos.distance_to(site) > 4.0 and _visible(1, ling.tag), "The surfaced unit moves normally and shows up in ordinary sight")

func _test_occupied_surface() -> void:
	sim.reset_state(42, 96, 64)
	var ling: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(37, 31))
	sim.issue_command([ling.tag], "burrow")
	sim.spawn_unit("silo", 1, ling.pos)
	_check(not sim.issue_command([ling.tag], "surface").ok, "A new footprint blocks surfacing before the navigation rebuild")
	sim.step_ticks(1)
	_check(not sim.issue_command([ling.tag], "surface").ok and ling.burrowed, "A unit cannot surface inside a newly occupied static footprint")

func _test_living_ground_bonus() -> void:
	sim.reset_state(42, 96, 64)
	sim.spawn_unit("brood_nest", 2, Vector2(30, 30))
	var ling: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(43, 31))
	sim.step_ticks(1600)
	_check(sim.active_living_ground_speed_bonus(ling) > 0.0, "The surfaced unit gains the living ground bonus")
	sim.issue_command([ling.tag], "burrow")
	_check(sim.effective_move_speed(ling) == 0.0 and sim.active_living_ground_speed_bonus(ling) == 0.0, "The movement bonus shows as inactive underground")
	sim.issue_command([ling.tag], "surface")
	_check(is_equal_approx(sim.effective_move_speed(ling), 12.74), "Surfacing restores the boosted movement rate")

func _test_splash() -> void:
	sim.load_scenario_dict({
		"paused": true, "fog_of_war": true, "map": {"width": 96, "height": 72},
		"units": [
			{"type": "howitzer_emplaced", "owner": 1, "x": 31, "y": 32},
			{"type": "bile_crawler", "owner": 2, "x": 54, "y": 32},
			{"type": "skitterling", "owner": 2, "x": 54, "y": 34},
		],
	})
	var units: Array = sim.units.values()
	var gun: Dictionary = units[0]
	var crawler: Dictionary = units[1]
	var ling: Dictionary = units[2]
	ling.hp = 1.0
	sim.issue_command([ling.tag], "burrow")
	_check(not _visible(1, ling.tag) and sim.issue_command([gun.tag], "attack_target", crawler.pos, crawler.tag).ok, "An area attack can target a visible neighbor without seeing the buried unit")
	sim.step_ticks(32)
	_check(not sim.units.has(ling.tag) and sim.players[2].supply_used == 2, "Lethal area damage removes the hidden unit and frees its supply")
	_check(not _visible(1, ling.tag) and sim.get_observation(1).recent_events.is_empty(), "Undetected collateral death exposes no unit or combat telemetry to the other player")
