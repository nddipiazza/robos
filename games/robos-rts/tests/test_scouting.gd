extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		printerr(label)

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.load_scenario_dict({"fog_of_war": true, "paused": true, "units": [
		{"id": "scout", "type": "pioneer", "owner": 1, "x": 16, "y": 20},
		{"id": "outpost", "type": "colony_hub", "owner": 2, "x": 72, "y": 20},
		{"id": "guard", "type": "pioneer", "owner": 2, "x": 76, "y": 20},
	]})
	var tags: Array = sim.units.keys()
	var scout: Dictionary = sim.units[tags[0]]
	var outpost: Dictionary = sim.units[tags[1]]
	var guard: Dictionary = sim.units[tags[2]]
	check(not sim.can_see_unit(1, outpost) and not sim.can_see_unit(2, scout), "Sight must start separately for both players")
	check(sim.get_observation(1).units.size() == 1 and sim.get_observation(0).units.size() == 3, "Player observation must omit hidden targets")
	sim.issue_command([scout.tag], "move", Vector2(24, 20))
	var rejected: Dictionary = sim.issue_command([scout.tag], "attack_target", Vector2.ZERO, guard.tag)
	check(rejected.accepted == 0 and scout.orders[0].type == "move", "Blind focus fire must fail without clearing orders")
	var ai = load("res://scripts/engine/RTSSkirmishAI.gd").new()
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(16, 24))
	sim.match_state.starts = [{"x": 40, "y": 32}, {"x": 72, "y": 20}]
	var ai_state := {}
	ai._attack(1, [soldier], ai_state, true)
	check(soldier.orders[0].target_pos == Vector2(40, 32), "AI must search a candidate site instead of targeting the hidden base")
	scout.pos = Vector2(64, 20)
	sim.vision.update(sim.units, sim.tick)
	check(sim.can_see_unit(1, outpost) and sim.can_see_unit(1, guard), "Scout must reveal both types of enemy")
	soldier.orders.clear()
	ai._attack(1, [soldier], ai_state, true)
	var firing_reach: float = soldier.radius + outpost.radius + sim._get_weapon_range(soldier)
	check(soldier.orders[0].type == "attack_move" and soldier.orders[0].target_pos.distance_to(outpost.pos) <= firing_reach, "AI targets the base or its firing approach once an allied scout reveals it")
	var accepted: Dictionary = sim.issue_command([scout.tag], "attack_target", Vector2.ZERO, guard.tag)
	check(accepted.accepted == 1, "Focus fire must work on visible enemies")
	var last_position: Vector2 = guard.pos
	guard.pos = Vector2(108, 20)
	sim.vision.update(sim.units, sim.tick)
	sim.step_ticks(1)
	check(scout.orders[0].type == "attack_move" and scout.orders[0].target_pos == last_position, "Lost targets must fall back to their observed location")
	scout.pos = Vector2(16, 20)
	sim.vision.update(sim.units, sim.tick)
	check(sim.remembered_buildings(1).size() == 1, "Remember buildings only after scouting")
	sim.units.erase(outpost.tag)
	sim.vision.update(sim.units, sim.tick)
	check(sim.remembered_buildings(1).size() == 1, "A hidden demolition must not erase the scouting record")
	scout.pos = Vector2(64, 20)
	sim.vision.update(sim.units, sim.tick)
	check(sim.remembered_buildings(1).is_empty(), "Revisiting an empty site must clear the old marker")
	sim.load_scenario_file("frontier-hunters")
	check(sim.vision != null, "Frontier Hunters enables fog by default")
	check(sim.get_observation(1).match.assigned_starts.size() == 1, "The player view must not reveal the enemy spawn slot")
	check(sim.get_observation(1).vision.last_seen_buildings.is_empty(), "New matches must clear scouting history")
	sim.load_legacy_scenario()
	check(sim.vision == null and sim.get_observation(1).units.size() == sim.units.size(), "Legacy scenarios keep the original visibility")
	print("Scouting integration checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
