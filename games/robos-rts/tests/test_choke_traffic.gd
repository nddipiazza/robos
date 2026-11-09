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
	_test_overhead_traffic()
	_test_crowded_entrance()
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
	var east_tags: Array = eastbound.map(func(unit): return unit.tag)
	var west_tags: Array = westbound.map(func(unit): return unit.tag)
	sim.issue_command(east_tags, "move", Vector2(73, 25))
	sim.issue_command(west_tags, "move", Vector2(26, 24))
	sim.issue_command(west_tags, "move", Vector2(21, 29), 0, "", true)
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

func _test_overhead_traffic() -> void:
	var clear_tick := _yield_release_tick(0)
	_check(clear_tick > 0, "The retreating rifleman yields and returns to its route")
	_check(_yield_release_tick(clear_tick) == clear_tick, "A Kestrel overhead does not hold up ground traffic")

func _yield_release_tick(flyer_arrival_tick: int) -> int:
	_corridor()
	var leader: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(40, 24))
	var retreat: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(55, 24))
	sim.issue_command([leader.tag], "move", Vector2(73, 24))
	sim.issue_command([retreat.tag], "move", Vector2(23, 24))
	var yielded := false
	for _step in range(640):
		if sim.tick + 1 == flyer_arrival_tick and retreat.has("choke_yield"):
			var turn: Vector2 = retreat.choke_yield.turn
			var flyer: Dictionary = sim.spawn_unit("kestrel_interceptor", 1, turn - Vector2(3, 0))
			sim.issue_command([flyer.tag], "move", turn + Vector2(16, 0))
		sim.step_ticks(1)
		if retreat.has("choke_yield"):
			yielded = true
		elif yielded:
			return sim.tick
	return -1

func _test_crowded_entrance() -> void:
	sim.reset_state(42, 96, 96)
	sim.terrain_obstacles.append(Rect2(0, 40, 47.5, 16))
	sim.terrain_obstacles.append(Rect2(50.5, 40, 45.5, 16))
	var advancing: Array[int] = []
	var retreating: Array[int] = []
	for offset in [Vector2.ZERO, Vector2(2, 0), Vector2(0, 2.3)]:
		advancing.append(sim.spawn_unit("rifleman", 1, Vector2(49, 36) + Vector2(offset.x, -offset.y)).tag)
		retreating.append(sim.spawn_unit("rifleman", 1, Vector2(49, 60) + offset).tag)
	sim.issue_command(advancing, "move", Vector2(49, 68))
	sim.issue_command(retreating, "move", Vector2(49, 28), 0, "", true)
	sim.step_ticks(1152)
	_check(advancing.all(func(tag): return sim.units[tag].pos.y > 56.0 and sim.units[tag].orders.is_empty()),
		"The advancing group returns to the lane after crowd steering displaces its approach")
	_check(retreating.all(func(tag): return sim.units[tag].pos.y < 40.0 and sim.units[tag].orders.is_empty()),
		"The retreating group also clears the crowded entrance")
