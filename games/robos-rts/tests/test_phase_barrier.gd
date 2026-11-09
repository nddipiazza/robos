extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_barrier_crossing()
	print("Phase barrier checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _test_barrier_crossing() -> void:
	sim.reset_state(42, 112, 72)
	sim.terrain_obstacles.append(Rect2(58, 0, 12, 30.5))
	sim.terrain_obstacles.append(Rect2(58, 37.5, 12, 34.5))
	sim.spawn_unit("heartstone", 1, Vector2(19, 56))
	sim.spawn_unit("resonator", 1, Vector2(27, 56))
	var waystone: Dictionary = sim.spawn_unit("waystone", 1, Vector2(34, 55))
	sim.players[1].crystal = 100
	sim.players[1].aether = 75
	if not _check(sim.issue_command([waystone.tag], "train_aegis_warden").ok, "A Waystone accepts the paid Warden"):
		return
	_check(sim.players[1].crystal == 0 and sim.players[1].aether == 0 and sim.players[1].supply_used == 2,
		"Training spends 100 crystal, 75 aether and reserves two supply")
	sim.step_ticks(31 * 64)
	var wardens: Array = sim.units.values().filter(func(unit): return unit.unit_type == "aegis_warden")
	if not _check(wardens.size() == 1 and sim.players[1].units_trained == 1, "Paid training completes one Warden"):
		return
	var warden: Dictionary = wardens[0]
	sim.issue_command([warden.tag], "move", Vector2(53, 28))
	sim.step_ticks(440)
	var ground: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(43, 34))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 1, Vector2(48, 34))
	var first := Vector2(90, 34)
	var second := Vector2(96, 52)
	var center := Vector2(64, 34)
	sim.issue_command([ground.tag], "move", first)
	sim.issue_command([ground.tag], "move", second, 0, "", true)
	sim.step_ticks(1)
	_check(ground.orders[0].get("route_was_reachable", false), "The ground route is open before the cast")

	var energy: float = warden.energy
	_check(not sim.issue_command([ground.tag], "phase_barrier", center).ok, "An ordinary soldier cannot cast the barrier")
	_check(not sim.issue_command([warden.tag], "phase_barrier", first).ok, "An out-of-range cast is rejected")
	_check(not sim.issue_command([warden.tag], "phase_barrier", ground.pos).ok, "A barrier cannot trap a ground unit already inside its radius")
	_check(warden.energy == energy and sim.visible_phase_barriers(1).is_empty(), "Invalid casts spend no energy and create no blocker")
	if not _check(sim.issue_command([warden.tag], "phase_barrier", center).ok, "A legal cast seals the crossing"):
		return
	var barrier: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "phase_barrier").front()
	var fields: Array = sim.visible_phase_barriers(1)
	_check(warden.energy == energy - 50.0 and fields.size() == 1 and fields[0].radius == 3.0 and fields[0].ticks == 512,
		"The cast spends energy and publishes its actual radius and eight-second lifetime")
	_check(not sim.can_attack(ground, barrier), "Weapons cannot destroy the temporary field early")
	sim.issue_command([air.tag], "move", first)
	sim.step_ticks(6 * 64)
	_check(air.pos.x > 82.0 and ground.pos.x < center.x, "Aircraft cross while the ground unit waits on its original side")
	_check(ground.orders.size() == 2 and ground.orders[0].target_pos == first and ground.orders[0].get("waiting_for_route", false),
		"The field preserves the blocked order and its queued follow-up")
	_check(sim.visible_phase_barriers(1)[0].ticks == 128, "The displayed timer tracks simulation time")
	sim.step_ticks(129)
	_check(not sim.units.has(barrier.tag) and sim.visible_phase_barriers(1).is_empty(), "The field expires and leaves the battlefield")
	var crossed_before_followup := false
	for _tick in range(900):
		sim.step_ticks(1)
		if ground.orders.size() == 1 and ground.orders[0].target_pos == second and ground.pos.distance_to(first) < 2.0:
			crossed_before_followup = true
		if ground.orders.is_empty():
			break
	_check(crossed_before_followup and ground.pos.distance_to(second) < 2.0, "The original crossing completes before the queued move after expiry")
