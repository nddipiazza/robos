extends SceneTree

var sim: Node
var failures: Array[String] = []
var arrivals: Array[Dictionary] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.unit_production_finished.connect(_record_arrival)
	_test_detour()
	_test_blocked_exit()
	_test_parallel_hatching()
	print("Production exit checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
		printerr(label)

func _record_arrival(unit: Dictionary, _producer: Dictionary) -> void:
	var position: Vector2 = unit.pos
	_check(not sim._is_point_blocked_by_static(position, unit.radius), "A ground recruit starts clear of footprints and terrain")
	arrivals.append({"position": position, "radius": unit.radius, "tick": sim.tick, "unit": unit})

func _test_detour() -> void:
	arrivals.clear()
	sim.load_scenario_dict({"paused": true, "map": {"width": 96, "height": 64}})
	sim.spawn_unit("colony_hub", 1, Vector2(14, 22))
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(28, 30))
	sim.spawn_resource("crystal_field", Vector2(33, 30))
	sim.spawn_unit("silo", 1, Vector2(37, 30))
	var goal := Vector2(49, 30)
	_check(sim.issue_command([hall.tag], "rally", goal).ok, "Set the rally across the blocked direct exit")
	for _slot in range(3):
		_check(sim.issue_command([hall.tag], "train_rifleman").ok, "Pay for each rifleman")
	sim.step_ticks(85 * sim.TICK_RATE)
	_check(arrivals.size() == 3 and hall.production_queue.is_empty(), "The full squad deploys around adjacent obstacles")
	for arrival in arrivals:
		_check(arrival.unit.orders.is_empty() and arrival.unit.pos.distance_to(goal) < 5.0,
			"The recruit completes the detour and settles with the squad at its original rally")

func _test_blocked_exit() -> void:
	arrivals.clear()
	sim.load_scenario_dict({"paused": true, "map": {"width": 96, "height": 64, "obstacles": [
		{"x": 33, "y": 22, "w": 4, "h": 16},
		{"x": 37, "y": 22, "w": 11, "h": 5},
		{"x": 37, "y": 33, "w": 11, "h": 5}
	]}})
	sim.spawn_unit("colony_hub", 1, Vector2(18, 40))
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(40, 30))
	var gate: Dictionary = sim.spawn_unit("silo", 1, Vector2(45, 30))
	var goal := Vector2(58, 30)
	_check(sim.issue_command([hall.tag], "rally", goal).ok, "Rally beyond the gate")
	var initial: int = sim.players[1].crystal
	for _slot in range(2):
		_check(sim.issue_command([hall.tag], "train_rifleman").ok, "Pay for a job at the enclosed hall")
	sim.step_ticks(25 * sim.TICK_RATE)
	var queue: Array = hall.production_queue
	_check(arrivals.is_empty() and queue.size() == 2 and queue[0].progress == queue[0].total_time and queue[1].progress == 0.0,
		"The completed job waits at the closed exit and the following job keeps its place")
	_check(sim.players[1].crystal == initial - 100 and sim.players[1].supply_used == 1, "Only the completed job waiting for an exit retains supply")
	_check(sim.issue_command([hall.tag], "cancel_training", Vector2.ZERO, 0, "0").ok and sim.players[1].crystal == initial - 50,
		"The completed blocked job can still be refunded")
	sim.step_ticks(25 * sim.TICK_RATE)
	_check(arrivals.is_empty() and queue.size() == 1 and queue[0].progress == queue[0].total_time, "The remaining job waits at the closed gate")
	_check(sim.issue_command([gate.tag], "retract_silo").ok, "The player opens the only exit")
	sim.step_ticks(320)
	_check(arrivals.size() == 1 and queue.is_empty() and arrivals[0].unit.pos.distance_to(goal) < 2.0,
		"Opening the gate releases one recruit and resumes its rally")
	_check(sim.players[1].crystal == initial - 50 and sim.players[1].supply_used == 1, "Deploying transfers reserved supply without another charge")

func _test_parallel_hatching() -> void:
	arrivals.clear()
	sim.load_scenario_dict({"paused": true, "victory": "all_structures", "map": {"width": 96, "height": 64}})
	sim.spawn_unit("colony_hub", 2, Vector2(80, 45))
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(24, 24))
	for _slot in range(3):
		_check(sim.issue_command([nest.tag], "train_skitterling").ok, "Buy a parallel Brood hatch")
	_check(nest.brood_slots == 0, "All three hatches use a Brood slot")
	sim.step_ticks(24 * sim.TICK_RATE)
	_check(arrivals.size() == 3 and nest.production_queue.is_empty() and sim.players[1].units_trained == 3, "Parallel hatches all deploy")
	for i in range(arrivals.size()):
		for j in range(i + 1, arrivals.size()):
			var first: Dictionary = arrivals[i]
			var second: Dictionary = arrivals[j]
			var distance: float = first.position.distance_to(second.position)
			_check(first.tick == second.tick and distance >= first.radius + second.radius, "Same-tick hatches use separate exits")
