extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_blocked_orders()
	_test_disconnected_destination()
	_test_solid_deposits()
	_test_cliff_detour()
	_test_elevation_ramp()
	_test_building_collision()
	print("Blocked navigation checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _test_blocked_orders() -> void:
	sim.reset_state(42, 160, 96)
	var cliff := Rect2(48, 16, 60, 64)
	sim.terrain_obstacles.append(cliff)
	var left: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(24, 40))
	var right: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(130, 52))
	var patrol: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(27, 62))
	var target := cliff.get_center()
	sim.issue_command([left.tag], "move", target)
	sim.issue_command([left.tag], "move", Vector2(30, 25), 0, "", true)
	sim.issue_command([right.tag], "attack_move", target)
	sim.issue_command([patrol.tag], "patrol", target)
	var left_edge := false
	var patrol_edge := false
	var patrol_return := false
	for _i in range(550):
		sim.step_ticks(1)
		left_edge = left_edge or left.pos.x >= 45.5
		patrol_edge = patrol_edge or patrol.pos.x >= 45.5
		patrol_return = patrol_return or (patrol_edge and patrol.pos.x < 29)
	_check(left_edge and left.orders.is_empty() and left.pos.distance_to(Vector2(30, 25)) < 2.0, "Move must finish at the near edge before running a queued waypoint")
	_check(right.orders.is_empty() and right.pos.x > cliff.end.x and right.pos.x < cliff.end.x + 3.0, "Attack-move must stop on its own side of a large cliff")
	_check(patrol_return and patrol.orders.size() == 1, "Patrol must turn at the reachable edge and return")

func _test_disconnected_destination() -> void:
	sim.reset_state(42, 128, 96)
	sim.terrain_obstacles.append(Rect2(55, 0, 8, 96))
	var unit: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(26, 46))
	sim.issue_command([unit.tag], "move", Vector2(100, 46))
	sim.step_ticks(600)
	_check(unit.orders.is_empty() and unit.pos.x > 50 and unit.pos.x < 55, "Unreachable ground beyond a wall must end on the reachable side, got %s with %s" % [unit.pos, unit.path])

func _test_solid_deposits() -> void:
	for type in ["rifleman", "howitzer", "spire_walker"]:
		sim.reset_state(42, 96, 64)
		var crystal: Dictionary = sim.spawn_resource("crystal_field", Vector2(34, 24))
		var vent: Dictionary = sim.spawn_resource("aether_vent", Vector2(48, 24))
		var unit: Dictionary = sim.spawn_unit(type, 1, Vector2(22, 24))
		sim.issue_command([unit.tag], "move", Vector2(62, 24))
		var clearance := INF
		for _i in range(840):
			sim.step_ticks(1)
			for deposit in [crystal, vent]:
				clearance = minf(clearance, unit.pos.distance_to(deposit.pos) - unit.radius - deposit.radius)
		_check(clearance >= -0.01, "%s must never step onto a crystal field or vent" % type)
		_check(unit.orders.is_empty() and unit.pos.distance_to(Vector2(62, 24)) < 2.0, "%s must complete the detour around both deposits" % type)
		sim.issue_command([unit.tag], "move", vent.pos)
		sim.step_ticks(400)
		_check(unit.orders.is_empty() and unit.pos.x >= vent.pos.x + vent.radius + unit.radius, "%s must settle outside a clicked vent" % type)

func _test_building_collision() -> void:
	sim.reset_state(42, 96, 64)
	var unit: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(23, 30))
	var building: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(45, 30))
	sim.issue_command([unit.tag], "move", building.pos)
	sim.step_ticks(500)
	_check(unit.orders.is_empty() and unit.pos.x > 37 and unit.pos.x <= building.pos.x - building.radius - unit.radius, "Moving onto a friendly building must stop outside its footprint")

func _test_cliff_detour() -> void:
	sim.reset_state(42, 96, 64)
	var cliff := Rect2(38, 17, 19, 29)
	sim.terrain_obstacles.append(cliff)
	var howitzer: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(20, 29))
	var walker: Dictionary = sim.spawn_unit("spire_walker", 1, Vector2(20, 35))
	sim.issue_command([howitzer.tag], "move", Vector2(68, 29))
	sim.issue_command([walker.tag], "move", Vector2(68, 35))
	var walked_cliff := false
	var howitzer_entered_cliff := false
	for _i in range(1250):
		sim.step_ticks(1)
		walked_cliff = walked_cliff or cliff.has_point(walker.pos)
		howitzer_entered_cliff = howitzer_entered_cliff or cliff.has_point(howitzer.pos)
	_check(walked_cliff and walker.orders.is_empty() and walker.pos.x > 66, "Cliff-walking remains available to the Spire Walker")
	_check(not howitzer_entered_cliff and howitzer.orders.is_empty() and howitzer.pos.x > 66, "A wide ground unit must detour around the cliff and finish")

func _test_elevation_ramp() -> void:
	var ramp := Rect2(103, 100, 6, 18)
	for uphill in [true, false]:
		sim.reset_state(42, 168, 161)
		sim.high_ground_zones.append(Rect2(109, 99, 45, 48))
		sim.ramps.append(ramp)
		var low := Vector2(99, 127)
		var high := Vector2(119, 127)
		var start := low if uphill else high
		var goal := high if uphill else low
		var marine: Dictionary = sim.spawn_unit("rifleman", 1, start)
		var jumper: Dictionary = sim.spawn_unit("spire_walker", 1, start + Vector2(0, 7))
		var jump_goal := goal + Vector2(0, 7)
		sim.issue_command([marine.tag], "move", goal)
		sim.issue_command([jumper.tag], "move", jump_goal)
		var marine_on_slope := false
		var marine_skipped_slope := false
		var jumper_on_slope := false
		for _i in range(1200):
			sim.step_ticks(1)
			marine_on_slope = marine_on_slope or ramp.has_point(marine.pos)
			jumper_on_slope = jumper_on_slope or ramp.has_point(jumper.pos)
			if not marine_on_slope and absf(sim.unit_elevation(marine) - (0.0 if uphill else 2.2)) > 0.01:
				marine_skipped_slope = true
			if marine.orders.is_empty() and jumper.orders.is_empty():
				break
		_check(marine_on_slope and not marine_skipped_slope and marine.pos.distance_to(goal) < 2.0,
			"Marine uses the ramp in both directions (uphill: %s, ended %s)" % [uphill, marine.pos])
		_check(not jumper_on_slope and jumper.pos.distance_to(jump_goal) < 2.0,
			"Spire Walker crosses the ledge directly (uphill: %s, ended %s)" % [uphill, jumper.pos])
		_check(not sim._has_clear_line_of_walk(Vector2(106, 122), Vector2(106, 111), marine.radius),
			"Marine cannot enter the raised side of the ramp")
		var near_top: Array = sim.compute_smooth_path(low, Vector2(109.2, 127), marine.radius)
		_check(near_top.back().distance_to(Vector2(109.2, 127)) < 2.0 and near_top.back().x > 109.0,
			"An uphill click near the cliff lip still routes to the high ground")
