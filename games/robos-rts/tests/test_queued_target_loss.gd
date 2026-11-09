extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_confirmed_attack_loss()
	_test_unseen_attack_loss()
	_test_depleted_harvest()
	_test_missing_extractor()
	_test_broken_follow()
	print("Queued target loss: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, description: String) -> void:
	if not ok:
		failures.append(description)

func _setup(fog: bool = false) -> void:
	sim.load_scenario_dict({"paused": true, "fog_of_war": fog, "map": {"width": 96, "height": 64}})

func _order(unit: Dictionary, type: String, position: Vector2, tag: int = 0, queue: bool = false) -> void:
	_check(sim.issue_command([unit.tag], type, position, tag, "", queue).ok, "Accepted %s order" % type)

func _wait_for_head(unit: Dictionary, type: String) -> void:
	for _tick in range(640):
		if unit.orders.is_empty() or unit.orders[0].type != type:
			return
		sim.step_ticks(1)

func _test_confirmed_attack_loss() -> void:
	_setup(true)
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(23, 20))
	var target: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(32, 20))
	sim.vision.update(sim.units, sim.tick)
	_order(soldier, "move", Vector2(13, 48))
	_order(soldier, "attack_target", target.pos, target.tag, true)
	_order(soldier, "move", Vector2(30, 48), 0, true)
	_order(soldier, "move", Vector2(50, 48), 0, true)
	sim._apply_damage_to_target(soldier, target, 1000.0, {}, 1.0)
	_check(soldier.orders[0].type == "move", "Target loss leaves the current move in place")
	_wait_for_head(soldier, "move")
	_check(not sim.can_see_position(1, target.pos), "The confirmed casualty later falls outside sight")
	sim.step_ticks(1)
	_check(soldier.orders.size() == 2 and soldier.orders[0].get("target_pos") == Vector2(30, 48) and soldier.vel.x > 0.0,
		"The next move starts immediately after a confirmed queued attack loss")
	sim.step_ticks(530)
	_check(soldier.orders.is_empty() and soldier.pos.distance_to(Vector2(50, 48)) < 2.0,
		"The two remaining waypoints finish in order")

func _test_unseen_attack_loss() -> void:
	for lost in [false, true]:
		_setup(true)
		var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(23, 20))
		var target: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(32, 20))
		var attacker: Dictionary = sim.spawn_unit("triage_specialist", 3, Vector2(78, 15))
		sim.vision.update(sim.units, sim.tick)
		var seen_position: Vector2 = target.pos
		_order(soldier, "move", Vector2(13, 48))
		_order(soldier, "attack_target", seen_position, target.tag, true)
		_order(soldier, "move", Vector2(30, 48), 0, true)
		target.pos = attacker.pos + Vector2(3, 0)
		if lost:
			sim._apply_damage_to_target(attacker, target, 1000.0, {}, 1.0)
		_wait_for_head(soldier, "move")
		sim.step_ticks(1)
		_check(sim.units.has(target.tag) != lost, "The live hidden target survives until the queued attack begins")
		_check(soldier.orders.size() == 2 and soldier.orders[0].type == "attack_move" and soldier.orders[0].target_pos == seen_position,
			"Hidden target loss keeps the same last-known order as a live unseen target")

func _test_depleted_harvest() -> void:
	_setup()
	sim.spawn_unit("colony_hub", 1, Vector2(14, 24))
	sim.spawn_unit("colony_hub", 2, Vector2(15, 45))
	var active: Dictionary = sim.spawn_resource("crystal_field", Vector2(35, 24), 5)
	var pending: Dictionary = sim.spawn_resource("crystal_field", Vector2(30, 42), 5)
	var miner: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(25, 24))
	var rival: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(27, 42))
	_order(miner, "harvest", active.pos, active.tag)
	_order(miner, "harvest", pending.pos, pending.tag, true)
	_order(miner, "move", Vector2(42, 29), 0, true)
	_order(rival, "harvest", pending.pos, pending.tag)
	_check(miner.harvest_target_tag == active.tag, "Queuing a gather keeps the current mining assignment")
	for _tick in range(640):
		if miner.orders.size() < 3:
			break
		sim.step_ticks(1)
	_check(pending.amount == 0 and sim.players[1].crystal_collected == 5, "The active gather pays before the next leg")
	sim.step_ticks(1)
	_check(miner.orders.size() == 1 and miner.orders[0].type == "move" and miner.vel.x > 0.0,
		"The next move begins as the depleted queued deposit is skipped")

func _test_missing_extractor() -> void:
	_setup()
	sim.spawn_unit("colony_hub", 1, Vector2(14, 24))
	sim.spawn_resource("crystal_field", Vector2(33, 24), 500)
	var vent: Dictionary = sim.spawn_resource("aether_vent", Vector2(33, 34), 100)
	var extractor: Dictionary = sim.spawn_unit("aether_tap", 1, vent.pos)
	var miner: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(25, 24))
	var enemy: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(75, 40))
	_order(miner, "move", Vector2(27, 27))
	_order(miner, "harvest", extractor.pos, extractor.tag, true)
	_order(miner, "harvest", vent.pos, vent.tag, true)
	_order(miner, "move", Vector2(45, 26), 0, true)
	sim._apply_damage_to_target(enemy, extractor, 1000.0, {}, 1.0)
	_wait_for_head(miner, "move")
	sim.step_ticks(1)
	_check(miner.orders.size() == 1 and miner.orders[0].type == "move" and miner.vel.x > 0.0,
		"Both dead gas legs are skipped without replacing them with unsolicited crystal mining")

func _test_broken_follow() -> void:
	_setup()
	var follower: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(22, 26))
	var leader: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(32, 35))
	var enemy: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(76, 42))
	_order(follower, "move", Vector2(27, 26))
	_order(follower, "follow", leader.pos, leader.tag, true)
	_order(follower, "move", Vector2(42, 26), 0, true)
	sim._apply_damage_to_target(enemy, leader, 1000.0, {}, 1.0)
	_wait_for_head(follower, "move")
	sim.step_ticks(1)
	_check(follower.orders.size() == 1 and follower.orders[0].type == "move" and follower.vel.x > 0.0,
		"A broken queued follow starts its successor in the same simulation step")
