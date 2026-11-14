extends SceneTree

const SITE := Vector2(40, 30)
const NEXT_SITE := Vector2(36, 44)
var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_friendly_clearance()
	_test_builder_in_footprint()
	_test_timeout()
	print("Build site clearance: ", "passed" if failures.is_empty() else failures)
	quit(int(not failures.is_empty()))

func _fixture() -> Dictionary:
	sim.reset_state(42, 96, 64)
	sim.paused = true
	return sim.spawn_unit("pioneer", 1, SITE + Vector2(-3.3, 0))

func _silo_at(point: Vector2) -> Dictionary:
	for unit in sim.units.values():
		if unit.unit_type == "silo" and unit.pos == point:
			return unit
	return {}

func _test_friendly_clearance() -> void:
	var worker := _fixture()
	var blocker: Dictionary = sim.spawn_unit("rifleman", 1, SITE)
	var second: Dictionary = sim.spawn_unit("rifleman", 1, SITE + Vector2(1.3, 0))
	sim.issue_command([blocker.tag], "hold_position")
	sim.issue_command([second.tag], "move", SITE + Vector2(0, -12))
	var existing_orders: Array = second.orders.duplicate()
	var crystal: int = sim.players[1].crystal
	_check(sim.issue_command([worker.tag], "build_silo", SITE).ok, "Order accepts a site occupied by friendly infantry")
	sim.step_ticks(1)
	_check(_silo_at(SITE).is_empty() and sim.players[1].crystal == crystal, "No foundation or charge while the footprint is occupied")
	var start_tick: int = sim.tick
	for _i in sim.BUILD_CLEAR_TIMEOUT_TICKS:
		sim.step_ticks(1)
		if not _silo_at(SITE).is_empty():
			break
	_check(not _silo_at(SITE).is_empty() and sim.tick - start_tick < sim.TICK_RATE, "Construction starts promptly after the infantry move aside")
	for unit in [blocker, second]:
		_check(unit.pos.distance_to(SITE) >= 1.8 + unit.radius, "No unit is caught inside the foundation")
	_check(sim.players[1].crystal == crystal - 100, "Construction charges for the Silo once")
	_check(blocker.orders.size() == 1 and blocker.orders[0].type == "hold_position" and second.orders == existing_orders,
		"Temporary movement preserves existing orders")
	sim.step_ticks(3 * sim.TICK_RATE)
	_check(second.pos.distance_to(SITE + Vector2(0, -12)) < 1.6, "The interrupted move resumes")

func _test_timeout() -> void:
	var worker := _fixture()
	var blocker: Dictionary = sim.spawn_unit("rifleman", 2, SITE)
	blocker.is_immobile = true
	blocker.hold_fire = true
	var crystal: int = sim.players[1].crystal
	_check(sim.issue_command([worker.tag], "build_silo", SITE).ok, "Order accepts a mobile unit's occupied footprint")
	_check(sim.issue_command([worker.tag], "build_silo", NEXT_SITE, 0, "", true).ok, "Another building queues behind it")
	sim.step_ticks(sim.BUILD_CLEAR_TIMEOUT_TICKS)
	_check(worker.orders.size() == 2 and _silo_at(SITE).is_empty(), "Blocked order waits for the full timeout")
	sim.step_ticks(1)
	_check(worker.orders.size() == 1 and worker.orders.front().target_pos == NEXT_SITE
		and sim.players[1].crystal == crystal and blocker.pos == SITE, "Timeout drops only the blocked order without charging or moving the enemy")
	sim.step_ticks(6 * sim.TICK_RATE)
	_check(not _silo_at(NEXT_SITE).is_empty() and _silo_at(SITE).is_empty()
		and sim.players[1].crystal == crystal - 100, "The next queued building proceeds normally")

func _test_builder_in_footprint() -> void:
	var worker := _fixture()
	worker.pos = SITE
	_check(sim.issue_command([worker.tag], "build_silo", SITE).ok, "Order accepts the builder's own position")
	sim.step_ticks(1)
	_check(_silo_at(SITE).is_empty(), "The builder must clear its own footprint")
	sim.step_ticks(sim.TICK_RATE)
	_check(not _silo_at(SITE).is_empty() and worker.pos.distance_to(SITE) >= 1.8 + worker.radius,
		"The builder steps out and starts the foundation")

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
