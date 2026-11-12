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
	var commander = root.get_node("RTSCommanderAI")
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(16, 24))
	sim.match_state.starts = [{"x": 40, "y": 32}, {"x": 72, "y": 20}]
	var ai_state := {}
	ai._attack(1, [soldier], ai_state, true)
	check(soldier.orders.is_empty(), "The commander must pan to select the army before giving it an order")
	sim.step_ticks(16)
	ai._attack(1, [soldier], ai_state, true)
	check(not soldier.orders.is_empty() and soldier.orders[0].target_pos == Vector2(40, 32), "AI may click unexplored ground to scout a candidate site")
	scout.pos = Vector2(64, 20)
	sim.vision.update(sim.units, sim.tick)
	check(sim.can_see_unit(1, outpost) and sim.can_see_unit(1, guard), "Scout must reveal both types of enemy")
	check(commander.observed_enemy_buildings(1).is_empty(), "Faction vision alone must not add off-camera intelligence")
	var camera_order: Dictionary = commander.issue_order([soldier.tag], "attack_target", outpost.pos, outpost.tag)
	check(not camera_order.ok and camera_order.get("camera_pending", false), "A visible contact outside the camera must wait for the pan")
	check(not commander.is_on_camera(1, outpost.pos), "The commander cannot act while its camera is panning")
	check(not commander.is_on_camera(2, outpost.pos), "The two commanders have independent cameras")
	sim.step_ticks(16)
	check(commander.observed_enemy_buildings(1).size() == 1, "The commander identifies the building once it is in view")
	ai._attack(1, [soldier], ai_state, true)
	var firing_reach: float = soldier.radius + outpost.radius + sim.weapon_range_against(soldier, outpost)
	check(soldier.orders[0].type == "attack_move" and soldier.orders[0].target_pos.distance_to(outpost.pos) <= firing_reach, "AI targets the base or its firing approach once an allied scout reveals it")
	var accepted: Dictionary = commander.issue_order([scout.tag], "attack_target", Vector2.ZERO, guard.tag)
	check(accepted.get("accepted", 0) == 1, "The AI can focus fire once both faction vision and camera focus are present")
	var last_position: Vector2 = guard.pos
	guard.pos = Vector2(108, 20)
	sim.vision.update(sim.units, sim.tick)
	check(not commander.issue_order([soldier.tag], "attack_target", guard.pos, guard.tag).ok, "An off-camera target that returns to fog cannot be targeted")
	var blind_cast: Dictionary = commander.issue_order([soldier.tag], "recon_sweep", guard.pos)
	check(not blind_cast.ok and not blind_cast.get("camera_pending", false), "Ground abilities require faction vision before requesting camera focus")
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
