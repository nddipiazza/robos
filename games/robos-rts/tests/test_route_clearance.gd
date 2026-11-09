extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_ramps()
	_test_off_grid_ramp()
	_test_gate()
	_test_off_grid_gate()
	_test_corner_sweeps()
	_test_visible_start_cell()
	print("Route clearance checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _layout(narrow_start: float, narrow_end: float) -> void:
	sim.reset_state(42, 128, 96)
	sim.terrain_obstacles.append(Rect2(58, 0, 12, narrow_start))
	sim.terrain_obstacles.append(Rect2(58, narrow_end, 12, 60.0 - narrow_end))
	sim.terrain_obstacles.append(Rect2(58, 74, 12, 22))
	sim.high_ground_zones.append(Rect2(0, 0, 58, 96))
	sim.ramps.append(Rect2(56, narrow_start, 16, narrow_end - narrow_start))
	sim.ramps.append(Rect2(56, 60, 16, 14))

func _test_ramps() -> void:
	for west_to_east in [true, false]:
		for kind in ["rifleman", "bile_crawler", "howitzer"]:
			_layout(21.7, 24.3)
			_cross(kind, west_to_east, kind != "howitzer")

func _test_off_grid_ramp() -> void:
	for vertical in [false, true]:
		for reverse in [false, true]:
			sim.reset_state(42, 96, 96)
			if vertical:
				sim.terrain_obstacles.append(Rect2(0, 42, 46.5, 12))
				sim.terrain_obstacles.append(Rect2(49.5, 42, 46.5, 12))
			else:
				sim.terrain_obstacles.append(Rect2(42, 0, 12, 46.5))
				sim.terrain_obstacles.append(Rect2(42, 49.5, 12, 46.5))
			var start := Vector2(26, 38)
			var goal := Vector2(70, 53)
			if vertical:
				start = Vector2(start.y, start.x)
				goal = Vector2(goal.y, goal.x)
			if reverse:
				var swap := start
				start = goal
				goal = swap
			var rifle: Dictionary = sim.spawn_unit("rifleman", 1, start)
			sim.issue_command([rifle.tag], "move", goal)
			for _tick in range(1800):
				sim.step_ticks(1)
				if rifle.orders.is_empty():
					break
			_check(rifle.pos.distance_to(goal) < 2.0, "Rifleman traverses the off-grid ramp from %s to %s" % [start, goal])

func _test_gate() -> void:
	for west_to_east in [true, false]:
		for gate_open in [false, true]:
			for kind in ["rifleman", "bile_crawler", "howitzer"]:
				_layout(18, 25)
				var gate: Dictionary = sim.spawn_unit("silo", 1, Vector2(64, 19.9))
				if gate_open:
					sim.issue_command([gate.tag], "retract_silo")
				_cross(kind, west_to_east, gate_open or kind != "howitzer")

func _test_off_grid_gate() -> void:
	for west_to_east in [true, false]:
		for kind in ["rifleman", "howitzer"]:
			sim.reset_state(42, 128, 96)
			sim.terrain_obstacles.append(Rect2(58, 0, 12, 18))
			sim.terrain_obstacles.append(Rect2(58, 25, 12, 71))
			var gate: Dictionary = sim.spawn_unit("silo_retracted", 1, Vector2(64, 20.6))
			var start := Vector2(30, 17) if west_to_east else Vector2(98, 29)
			var goal := Vector2(98, 29) if west_to_east else Vector2(30, 17)
			var unit: Dictionary = sim.spawn_unit(kind, 1, start)
			sim.issue_command([unit.tag], "move", goal)
			sim.step_ticks(75)
			_check(unit.path.back().is_equal_approx(goal), "Both sizes can reach the open crossing")
			sim.issue_command([gate.tag], "extend_silo")
			var clear := true
			for _tick in range(1400):
				sim.step_ticks(1)
				clear = clear and not sim._is_point_blocked_by_static(unit.pos, unit.radius)
				if unit.orders.is_empty():
					break
			var direction := "west to east" if west_to_east else "east to west"
			_check(clear, "%s stays out of the raised gate and cliffs" % kind)
			if kind == "rifleman":
				_check(unit.orders.is_empty() and unit.pos.distance_to(goal) < 2.0,
					"Rifleman crosses the off-grid gap %s (ended %s)" % [direction, unit.pos])
			else:
				_check(not unit.orders.is_empty() and unit.orders[0].waiting_for_route and (unit.pos.x < 64.0) == west_to_east,
					"Howitzer waits at the raised gate %s" % direction)
				_check(sim._navigation_grid(unit.radius, false, 1.0) == null,
					"A gap too small for the Howitzer does not require a finer grid")

func _cross(kind: String, west_to_east: bool, narrow: bool) -> void:
	var from := Vector2(30, 17) if west_to_east else Vector2(98, 29)
	var to := Vector2(98, 29) if west_to_east else Vector2(30, 17)
	var unit: Dictionary = sim.spawn_unit(kind, 1, from)
	sim.issue_command([unit.tag], "move", to)
	var crossed := false
	var correct_lane := true
	var clear := true
	for _tick in range(2200):
		sim.step_ticks(1)
		if unit.pos.x > 59.0 and unit.pos.x < 69.0:
			crossed = true
			correct_lane = correct_lane and (unit.pos.y < 30.0) == narrow
		clear = clear and not sim._is_point_blocked_by_static(unit.pos, unit.radius)
		if unit.orders.is_empty():
			break
	var description := "%s from %s via the %s lane" % [kind, "west" if west_to_east else "east", "narrow" if narrow else "wide"]
	_check(crossed and correct_lane and clear and unit.pos.distance_to(to) < 2.0, "%s finishes with clearance (ended %s)" % [description, unit.pos])

func _test_corner_sweeps() -> void:
	sim.reset_state(42, 96, 72)
	sim.terrain_obstacles.append(Rect2(40, 40, 12, 12))
	var start := Vector2(39.12, 39.94)
	var end := Vector2(39.94, 39.12)
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, start)
	sim.spawn_unit("silo", 1, Vector2(56, 30))
	sim.step_ticks(1)
	_check(not sim._is_point_blocked_by_static(start, rifle.radius) and not sim._is_point_blocked_by_static(end, rifle.radius), "Both diagonal endpoints are walkable")
	_check(not sim._has_clear_line_of_walk(start, end, rifle.radius), "A short diagonal segment cannot clip a cliff corner")
	_check(sim._has_clear_line_of_walk(start, end, rifle.radius, true), "Cliff-walk retains its terrain exception")
	sim._move_on_terrain(rifle, end)
	_check(is_equal_approx(rifle.pos.x, start.x), "Collision slides along the original side instead of stepping across the corner")
	var gate_start := Vector2(55.65, 27.37)
	var gate_end := Vector2(56.35, 27.37)
	_check(not sim._is_point_blocked_by_static(gate_start, rifle.radius) and not sim._is_point_blocked_by_static(gate_end, rifle.radius), "Both gate tangent endpoints are walkable")
	_check(not sim._has_clear_line_of_walk(gate_start, gate_end, rifle.radius), "A short segment cannot clip the edge of a raised gate")
	rifle.pos = gate_start
	sim._move_on_terrain(rifle, gate_end)
	_check(rifle.pos.is_equal_approx(gate_start), "Movement cannot sweep through the raised gate between walkable endpoints")

func _test_visible_start_cell() -> void:
	sim.reset_state(42, 96, 96)
	sim.terrain_obstacles.append(Rect2(31, 0, 34, 46))
	sim.terrain_obstacles.append(Rect2(31, 50, 34, 46))
	sim._rebuild_astar_grid()
	for start in [Vector2(30.10, 49.80), Vector2(65.90, 49.80)]:
		var goal := Vector2(77, 48) if start.x < 48.0 else Vector2(19, 48)
		var snapped: Vector2 = sim.astar_grid.get_point_position(sim._path_cell(sim.astar_grid, start))
		_check(not sim._is_point_blocked_by_static(snapped, 0.85) and not sim._has_clear_line_of_walk(start, snapped, 0.85), "The usual lattice center is walkable but hidden by the wall lip")
		var path: Array[Vector2] = sim.compute_smooth_path(start, goal)
		var previous: Vector2 = start
		_check(path.back().is_equal_approx(goal), "Route from the wall lip reaches the opposite bank")
		for point in path:
			_check(sim._has_clear_line_of_walk(previous, point, 0.85), "Route from the wall lip uses a visible start node")
			previous = point
