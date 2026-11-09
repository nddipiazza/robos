extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_opposing_convoys()
	_test_idle_and_cargo()
	print("Choke traffic: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _corridor() -> void:
	sim.reset_state(42, 96, 64)
	sim.terrain_obstacles.append(Rect2(38, 0, 20, 22))
	sim.terrain_obstacles.append(Rect2(38, 26, 20, 38))

func _test_opposing_convoys() -> void:
	_corridor()
	var eastbound: Array[Dictionary] = []
	var westbound: Array[Dictionary] = []
	for i in range(3):
		eastbound.append(sim.spawn_unit("rifleman", 1, Vector2(34 - 2 * i, 24)))
		westbound.append(sim.spawn_unit("rifleman", 1, Vector2(62 + 2 * i, 24)))
		sim.issue_command([eastbound.back().tag], "move", Vector2(73, 23 + 2 * i))
		sim.issue_command([westbound.back().tag], "move", Vector2(23, 23 + 2 * i), 0, "", true)
	sim.step_ticks(960)
	_check(eastbound.all(func(unit): return unit.pos.x > 63.0 and unit.orders.is_empty()), "The advancing squad crosses the one-lane opening")
	_check(westbound.all(func(unit): return unit.pos.x < 34.0 and unit.orders.is_empty()), "The retreating squad yields and finishes its queued route")
	if not failures.is_empty():
		print("Eastbound ", eastbound.map(func(unit): return [unit.pos, unit.get("choke_yield", {})]))
		print("Westbound ", westbound.map(func(unit): return [unit.pos, unit.get("choke_yield", {})]))

func _test_idle_and_cargo() -> void:
	_corridor()
	sim.spawn_unit("colony_hub", 1, Vector2(20, 24))
	var patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(67, 26))
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(65, 24))
	sim.issue_command([worker.tag], "harvest", patch.pos, patch.tag)
	for _i in range(220):
		sim.step_ticks(1)
		if worker.cargo_amount > 0:
			break
	_check(worker.cargo_amount > 0, "The worker begins the return trip with real cargo")
	var blocker: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(48, 24))
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(30, 24))
	sim.issue_command([soldier.tag], "move", Vector2(73, 24))
	sim.step_ticks(900)
	_check(soldier.pos.x > 63.0 and soldier.orders.is_empty(), "An idle blocker yields to an advancing soldier")
	_check(blocker.pos.x > 48.0, "The idle blocker clears the narrow lane instead of overlapping the soldier")
	_check(sim.players[1].crystal_collected > 0, "The returning worker deposits cargo through the same choke")
