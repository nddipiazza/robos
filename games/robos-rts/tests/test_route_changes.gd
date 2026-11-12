extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_gate()
	_test_foundation()
	_test_destroyed_barrier()
	print("Route changes: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _corridor(alternate: bool = false) -> void:
	sim.reset_state(42, 104, 72)
	sim.terrain_obstacles.append(Rect2(48, 0, 4, 22))
	sim.terrain_obstacles.append(Rect2(48, 26, 4, 30 if alternate else 46))
	if alternate:
		sim.terrain_obstacles.append(Rect2(48, 66, 4, 6))

func _queue_crossing(unit: Dictionary, command: String = "move") -> void:
	sim.issue_command([unit.tag], command, Vector2(76, 24))
	sim.issue_command([unit.tag], "move", Vector2(85, 36), 0, "", true)
	sim.step_ticks(75)

func _still_queued(unit: Dictionary, command: String) -> bool:
	return unit.orders.size() == 2 and unit.orders[0].type == command and unit.orders[1].target_pos == Vector2(85, 36)

func _test_gate() -> void:
	_corridor()
	var gate: Dictionary = sim.spawn_unit("silo_retracted", 1, Vector2(50, 24))
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(25, 24))
	_queue_crossing(soldier)
	_check(sim.issue_command([gate.tag], "extend_silo").ok, "The player can raise the gate during the move")
	_check(not sim.issue_command([gate.tag], "extend_silo").ok, "A second raise command cannot restart the timer")
	sim.step_ticks(63)
	_check(gate.is_walkable_structure and gate.unit_type == "silo_retracted", "The crossing stays open for the first 63 ticks")
	sim.step_ticks(1)
	_check(not gate.is_walkable_structure and gate.unit_type == "silo", "The gate blocks movement after one second")
	sim.step_ticks(356)
	_check(soldier.pos.x < 48 and _still_queued(soldier, "move"), "A raised gate pauses the current move at the near bank with its queue intact")
	_check(sim.issue_command([gate.tag], "retract_silo").ok, "The player can reopen the gate")
	sim.step_ticks(650)
	_check(soldier.orders.is_empty() and soldier.pos.distance_to(Vector2(85, 36)) < 2.0, "The soldier resumes the old route and then finishes the queued move")
	_check(sim.issue_command([gate.tag], "extend_silo").ok, "A clear gate begins raising")
	sim.step_ticks(63)
	sim.spawn_unit("rifleman", 1, gate.pos)
	sim.step_ticks(1)
	_check(gate.is_walkable_structure and not gate.has("silo_raise_until"), "A unit on the footprint prevents the gate from closing")

func _test_foundation() -> void:
	_corridor()
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(25, 24))
	_queue_crossing(soldier, "attack_move")
	var foundation: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(50, 24), "", 0.2)
	sim.step_ticks(410)
	_check(soldier.pos.x < 48 and _still_queued(soldier, "attack_move"), "An unfinished foundation invalidates an active attack-move without consuming it")
	_check(sim.issue_command([foundation.tag], "cancel_construction").ok, "The foundation can be removed")
	sim.step_ticks(650)
	_check(soldier.orders.is_empty() and soldier.pos.distance_to(Vector2(85, 36)) < 2.0, "Removing the foundation restores the active path and queue")

func _test_destroyed_barrier() -> void:
	_corridor(true)
	var barrier: Dictionary = sim.spawn_unit("shale_barrier", 0, Vector2(50, 24))
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(25, 24))
	var attacker: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(15, 12))
	_queue_crossing(soldier)
	_check(soldier.path.any(func(point): return point.y > 50), "The first route detours around the intact barrier")
	sim._apply_damage_to_target(attacker, barrier, 1000.0, {}, 1.0)
	sim.step_ticks(1)
	_check(_still_queued(soldier, "move") and soldier.path.all(func(point): return point.y < 32), "Destroying the barrier replaces the detour with the direct crossing")
	sim.step_ticks(700)
	_check(soldier.orders.is_empty() and soldier.pos.distance_to(Vector2(85, 36)) < 2.0, "The new shortcut and the queued move both complete")
