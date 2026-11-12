extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	sim.load_scenario_dict({"paused": true, "fog_of_war": true, "map": {
		"width": 112, "height": 64, "obstacles": [{"x": 46, "y": 0, "w": 8, "h": 64}]
	}, "players": {"1": {"faction": "monsters"}}, "units": [
		{"type": "brood_nest", "owner": 1, "x": 19, "y": 27},
		{"type": "skitterling", "owner": 1, "x": 12, "y": 42, "count": 16},
		{"type": "pioneer", "owner": 2, "x": 75, "y": 27}
	]})
	var nest: Dictionary = sim.units.values()[0]
	var worker: Dictionary = sim.units.values().back()
	var player: Dictionary = sim.players[1]
	_check(player.supply_used == 16 and player.supply_cap == 15, "Fixture begins supply blocked")
	_check(sim.issue_command([nest.tag], "train_needlewing").ok and player.crystal == 300, "The Nest accepts a paid flier over capacity")
	sim.step_ticks(1)
	_check(nest.production_queue[0].progress == 0.0 and player.supply_used == 16, "Supply blocks the start of the paid combat flier")
	_check(sim.issue_command([nest.tag], "cancel_training", Vector2.ZERO, 0, "0").ok and player.crystal == 400, "A waiting flier refunds its costs")
	_check(sim.issue_command([nest.tag], "train_drift_sac").ok and player.crystal == 300, "A zero-supply Drift Sac can recover from oversupply")
	_check(player.supply_cap == 15, "Queued Drift Sac does not count early")
	sim.step_ticks(25 * sim.TICK_RATE)
	var scout: Dictionary = _unit(sim, "drift_sac")
	if _check(not scout.is_empty() and player.supply_cap == 23 and player.supply_used == 16, "Hatched Drift Sac grants eight supply"):
		_check(not sim.can_see_unit(1, worker), "Enemy worker starts outside sight")
		_check(sim.issue_command([scout.tag], "move", Vector2(66, 27)).ok, "Drift Sac scouts across the wall")
		sim.step_ticks(840)
		_check(scout.pos.x > 63.0 and sim.can_see_unit(1, worker), "The airborne scout reveals the enemy worker")
		_check(not sim.issue_command([scout.tag], "attack_target", worker.pos, worker.tag).ok, "The scout is unarmed")
		_check(sim.issue_command([nest.tag], "train_needlewing").ok and player.crystal == 200 and player.aether == 50 and player.supply_used == 16,
			"The Nest pays full resources to order a Needlewing")
		sim.step_ticks(33 * sim.TICK_RATE)
		var raider: Dictionary = _unit(sim, "needlewing")
		if _check(not raider.is_empty() and raider.flight_height > 0.0, "Paid raider is airborne"):
			_check(sim.issue_command([raider.tag], "attack_target", worker.pos, worker.tag).ok, "Needlewing can use the scout's sight")
			sim.step_ticks(430)
			_check(raider.pos.x > 55.0 and worker.hp < worker.max_hp, "Harasser crosses the wall and damages ground targets")
			var counter: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(81, 31))
			sim.step_ticks(8)
			_check(not sim.can_attack(raider, counter) and sim.can_attack(counter, raider), "Needlewing cannot return anti-air fire")
			_check(sim.issue_command([counter.tag], "attack_target", raider.pos, raider.tag).ok, "Dedicated interceptor engages the raider")
			sim.step_ticks(420)
			_check(not sim.units.has(raider.tag), "The dedicated counter kills the raider")
			_check(sim.issue_command([counter.tag], "attack_target", scout.pos, scout.tag).ok, "Interceptor also engages the supply flyer")
			sim.step_ticks(560)
			_check(not sim.units.has(scout.tag) and player.supply_cap == 15 and player.supply_used == 16, "Losing the flyer immediately removes its supply")
			_check(not sim.issue_command([nest.tag], "train_needlewing").ok, "Supply blocks another combat flier again")
	print("Brood air checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _unit(sim: Node, type: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.unit_type == type:
			return unit
	return {}

func _check(ok: bool, message: String) -> bool:
	if not ok:
		failures.append(message)
	return ok
