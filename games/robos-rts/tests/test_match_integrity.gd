extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_unfinished_structure()
	_test_mutual_destruction()
	_test_skirmish_rematch()
	print("Match integrity: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_unfinished_structure() -> void:
	_load_annihilation([
		{"id": "base", "type": "colony_hub", "owner": 1, "x": 22, "y": 24},
		{"id": "gun", "type": "howitzer_emplaced", "owner": 1, "x": 41, "y": 30},
		{"id": "enemy_base", "type": "colony_hub", "owner": 2, "x": 57, "y": 23, "hp": 1},
		{"id": "foundation", "type": "silo", "owner": 2, "x": 59, "y": 38, "hp": 1, "build_progress": 0.1}
	])
	var gun := _unit_named("gun")
	var enemy_base := _unit_named("enemy_base")
	var foundation := _unit_named("foundation")
	sim.issue_command([gun.tag], "hold_fire")
	sim.issue_command([gun.tag], "attack_target", enemy_base.pos, enemy_base.tag)
	sim.step_ticks(64)
	_check(not sim.units.has(enemy_base.tag) and sim.units.has(foundation.tag) and sim.match_state.status == "playing", "An unfinished enemy foundation keeps annihilation running")
	sim.issue_command([gun.tag], "attack_target", foundation.pos, foundation.tag)
	sim.step_ticks(256)
	_check(not sim.units.has(foundation.tag) and sim.match_state.winner == 1 and sim.match_state.reason == "all_structures_destroyed", "Losing the last foundation resolves the match as annihilation")

func _test_mutual_destruction() -> void:
	_load_annihilation([
		{"id": "gun", "type": "howitzer_emplaced", "owner": 1, "x": 32, "y": 28},
		{"id": "friendly_silo", "type": "silo", "owner": 1, "x": 49, "y": 29, "hp": 1},
		{"id": "enemy_silo", "type": "silo", "owner": 2, "x": 49, "y": 26, "hp": 1}
	])
	var gun := _unit_named("gun")
	var friendly := _unit_named("friendly_silo")
	var enemy := _unit_named("enemy_silo")
	sim.issue_command([gun.tag], "attack_target", enemy.pos, enemy.tag)
	sim.step_ticks(100)
	_check(not sim.units.has(friendly.tag) and not sim.units.has(enemy.tag), "One impact destroys both players' final structures")
	_check(sim.match_state.status == "finished" and sim.match_state.winner == 0 and sim.match_state.reason == "all_structures_destroyed", "Simultaneous annihilation is a draw")
	_check(sim.tick == sim.match_state.finished_tick and not sim.surrender(1).ok, "A terminal draw freezes the tick and rejects a new result")

func _test_skirmish_rematch() -> void:
	_check(sim.start_skirmish("iron-narrows", {"seed": 64, "difficulty": "normal", "strategy": "rush"}).ok, "A regular skirmish can start")
	var opening: Dictionary = sim.get_observation()
	var opening_commands: Array = sim.command_history.duplicate(true)
	sim.step_ticks(640)
	var ai_opening: Array = sim.command_history.duplicate(true)
	_check(not ai_opening.is_empty() and sim.players[2].crystal_collected > 0, "The AI has paid opening orders and delivered income")
	var hub: Dictionary = sim.units.values().filter(func(unit): return unit.owner == 1 and unit.unit_type == "colony_hub").front()
	_check(sim.issue_command([hub.tag], "train_pioneer").ok and hub.production_queue.size() == 1, "The surrender fixture has paid queue state")
	var result: Dictionary = sim.surrender(1)
	_check(result.ok and result.match.winner == 2 and result.match.reason == "surrender", "Surrender preserves the correct winner and reason")
	sim.step_ticks(64)
	_check(sim.tick == 640 and not sim.issue_command([hub.tag], "train_pioneer").ok, "A surrendered match cannot progress or receive more paid orders")
	_check(sim.rematch().ok, "The finished match can be replayed")
	var restored: Dictionary = sim.get_observation()
	for key in opening:
		_check(restored[key] == opening[key], "Rematch restores the opening %s" % key)
	_check(sim.command_history == opening_commands, "Rematch keeps only the fresh opening orders")
	sim.step_ticks(640)
	_check(sim.command_history == ai_opening, "The same seeded rematch restarts the AI from its original opening")

func _load_annihilation(units: Array) -> void:
	sim.load_scenario_dict({"paused": true, "victory": "all_structures", "map": {"width": 96, "height": 64}, "units": units})

func _unit_named(id: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.id == id:
			return unit
	return {}

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
