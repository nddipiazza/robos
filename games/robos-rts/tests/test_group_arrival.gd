extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_mixed_and_queued_moves()
	_test_blocked_group_target()
	_test_single_move()
	print("Group arrival checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _test_mixed_and_queued_moves() -> void:
	sim.reset_state(42, 112, 96)
	var army: Array[Dictionary] = []
	var roster := ["pioneer", "rifleman", "breacher", "howitzer", "spire_walker", "skirmisher", "kestrel_interceptor"]
	for i in range(roster.size()):
		army.append(sim.spawn_unit(roster[i], 1, Vector2(16 + (i % 2) * 6, 22 + i * 5)))
	var tags := army.map(func(unit): return unit.tag)
	var first := Vector2(62, 42)
	var second := Vector2(80, 70)
	sim.issue_command(tags, "move", first)
	sim.issue_command(tags, "move", second, 0, "", true)
	sim.step_ticks(1)
	var first_slots := {}
	for unit in army:
		var order: Dictionary = unit.orders[0]
		first_slots[unit.tag] = order.arrival_pos
		_check(order.target_pos == first and unit.orders[1].target_pos == second and not unit.orders[1].has("arrival_pos"), "Queued destinations stay raw until their leg starts")
	_check_distinct(first_slots, "First mixed formation")
	for entry in sim.get_observation().units:
		_check(not entry.orders[0].has("_formation") and entry.orders[0].has("arrival_pos"), "Observation exposes the arrival point without internal reservations")
	var second_slots := {}
	for _tick in range(1600):
		sim.step_ticks(1)
		for unit in army:
			if not second_slots.has(unit.tag) and unit.orders.size() == 1 and unit.orders[0].target_pos == second:
				_check(unit.pos.distance_to(first_slots[unit.tag]) < 2.5, "A unit reaches its first slot before starting its queued move")
				if unit.orders[0].has("arrival_pos"):
					second_slots[unit.tag] = unit.orders[0].arrival_pos
		if army.all(func(unit): return unit.orders.is_empty()):
			break
	_check(second_slots.size() == army.size(), "Each unit starts its queued move")
	_check_distinct(second_slots, "Second mixed formation")
	for unit in army:
		_check(unit.orders.is_empty() and second_slots.has(unit.tag) and unit.pos.distance_to(second_slots[unit.tag]) < 2.5, "%s finishes at its second slot" % unit.unit_type)
	var settled := army.map(func(unit): return unit.pos)
	sim.step_ticks(64)
	for i in range(army.size()):
		_check(army[i].pos.distance_to(settled[i]) < 0.2, "Settled units do not circle")
		for j in range(i):
			_check(army[i].pos.distance_to(army[j].pos) > float(army[i].radius + army[j].radius), "Settled formation keeps units apart")

func _test_blocked_group_target() -> void:
	sim.reset_state(42, 112, 96)
	sim.terrain_obstacles.append(Rect2(48, 12, 26, 72))
	var army: Array[Dictionary] = []
	for i in range(5):
		army.append(sim.spawn_unit("rifleman" if i < 4 else "howitzer", 1, Vector2(22, 30 + i * 5)))
	sim.issue_command(army.map(func(unit): return unit.tag), "move", Vector2(59, 44))
	sim.step_ticks(1)
	var slots := {}
	for unit in army:
		var slot: Vector2 = unit.orders[0].arrival_pos
		slots[unit.tag] = slot
		_check(slot.x < 48 and not sim._is_point_blocked_by_static(slot, unit.radius), "A blocked click reserves only slots on the reachable edge")
	_check_distinct(slots, "Blocked formation")
	sim.step_ticks(700)
	for unit in army:
		_check(unit.orders.is_empty() and unit.pos.distance_to(slots[unit.tag]) < 2.5, "A unit settles at its distinct reachable slot")

func _test_single_move() -> void:
	sim.reset_state(42, 96, 64)
	var unit: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(18, 24))
	var goal := Vector2(40, 24)
	sim.issue_command([unit.tag], "move", goal)
	sim.step_ticks(1)
	_check(not unit.orders[0].has("arrival_pos") and unit.path.back() == goal, "A single mover keeps its exact target")
	sim.step_ticks(400)
	_check(unit.orders.is_empty() and unit.pos.distance_to(goal) < 2.0, "A single mover settles normally")

func _check_distinct(slots: Dictionary, label: String) -> void:
	for tag in slots:
		for other in slots:
			if other < tag:
				_check(slots[tag].distance_to(slots[other]) > 1.5, "%s keeps arrival points distinct" % label)
