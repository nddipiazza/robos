extends SceneTree

var sim: Node
var ai: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	ai = root.get_node("RTSCommanderAI")
	_test_brood()
	_test_concord()
	print("Asymmetric skirmish checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> bool:
	if not condition:
		failures.append(label)
	return condition

func _open(faction: String) -> Dictionary:
	sim.start_skirmish("iron-narrows", {"player_faction": faction, "seed": 42})
	ai.set_directive(2, "idle", false)
	sim.players[1].crystal = 1000
	return _owned("brood_nest" if faction == "monsters" else "heartstone").front()

func _owned(type: String) -> Array:
	return sim.units.values().filter(func(u): return u.owner == 1 and u.unit_type == type)

func _nearest(type: String, pos: Vector2) -> Dictionary:
	var best := {}
	for unit in _owned(type):
		if best.is_empty() or unit.pos.distance_squared_to(pos) < best.pos.distance_squared_to(pos):
			best = unit
	return best

func _site(type: String, base: Vector2, must_power: bool = false) -> Vector2:
	for radius in [11.0, 16.0, 23.0]:
		for i in range(16):
			var pos := base + Vector2.from_angle(TAU * float(i) / 16.0) * float(radius)
			if sim.can_place_structure(type, pos) and (not must_power or sim.is_powered(1, pos)):
				return pos
	return Vector2.INF

func _build(worker_type: String, type: String, pos: Vector2) -> Dictionary:
	var worker := _nearest(worker_type, pos)
	if not _check(not worker.is_empty() and sim.issue_command([worker.tag], "build_" + type, pos).ok, "Order " + type):
		return {}
	for i in range(48):
		sim.step_ticks(16)
		for unit in _owned(type):
			if unit.pos.is_equal_approx(pos):
				return unit
	_check(false, "Foundation " + type)
	return {}

func _harvest_aether(worker_type: String, tap_type: String, base: Vector2) -> void:
	var vents: Array = sim.resources.values().filter(func(r): return r.resource_type == "aether_vent")
	vents.sort_custom(func(a, b): return a.pos.distance_squared_to(base) < b.pos.distance_squared_to(base))
	var tap := _build(worker_type, tap_type, vents.front().pos)
	if tap.is_empty():
		return
	sim.step_ticks(23 * 64)
	_check(tap.build_progress >= 1.0, "Completed " + tap_type)
	var miner := _nearest(worker_type, tap.pos)
	_check(sim.issue_command([miner.tag], "harvest", tap.pos, tap.tag).ok, "Gather from " + tap_type)
	sim.step_ticks(16 * 64)
	_check(sim.players[1].aether_collected > 0, "Paid aether from " + tap_type)
	_check(sim.worker_saturation(1).get(tap.tag, {}).get("assigned", 0) == 1, "Saturation for " + tap_type)

func _test_brood() -> void:
	var nest := _open("monsters")
	var pos := _site("brood_pod", nest.pos)
	var pod := _build("forager", "brood_pod", pos)
	if pod.is_empty():
		return
	_check(_owned("forager").size() == 11 and sim.players[1].units_lost == 0, "A morph consumes a worker without a combat loss")
	var crystal: int = sim.players[1].crystal
	_check(sim.issue_command([pod.tag], "cancel_construction").ok, "Cancel a growing Brood Pod")
	_check(_owned("forager").size() == 12 and sim.players[1].crystal == crystal + 56, "Cancel restores one worker and a 75% refund")
	pod = _build("forager", "brood_pod", pos)
	if pod.is_empty():
		return
	sim.step_ticks(21 * 64)
	_check(pod.build_progress == 1.0 and sim.players[1].supply_cap == 23, "Completed Brood Pod grants eight supply")

	var worker := _owned("forager").front() as Dictionary
	var patch: Dictionary = sim.resources[worker.harvest_target_tag]
	var army_goal: Vector2 = nest.pos.lerp(Vector2(64, 48), 0.75)
	_check(sim.issue_command([nest.tag], "rally", army_goal).ok, "Set army rally")
	_check(sim.issue_command([nest.tag], "rally", patch.pos, patch.tag).ok, "Deposit right-click sets worker rally")
	_check(nest.rally_route[0].pos == army_goal and nest.worker_rally_route[0].target_tag == patch.tag, "Rallies are independent")
	_check(sim.issue_command([nest.tag], "rally_worker", patch.pos, patch.tag).ok, "Explicit Forager rally")
	_check(sim.issue_command([nest.tag], "train_forager").ok, "Start hatching Forager")
	for i in range(2):
		_check(sim.issue_command([nest.tag], "train_skitterling").ok, "Start hatching Skitterling")
	_check(not sim.issue_command([nest.tag], "train_skitterling").ok, "Four immediate hatches exceed the available brood slots")
	sim.step_ticks(64)
	_check(nest.production_queue.all(func(job): return job.progress == 1.0), "All three jobs hatch in parallel")
	_check(sim.issue_command([nest.tag], "cancel_training", Vector2.ZERO, 0, "1").ok and nest.brood_slots == 1, "Cancel returns a brood slot")
	_check(sim.issue_command([nest.tag], "train_skitterling").ok, "Re-use returned slot")
	sim.step_ticks(11 * 64)
	_check(nest.brood_slots == 1, "One slot regenerates every twelve seconds")
	sim.step_ticks(8 * 64)
	_check(sim.players[1].units_trained == 3, "All three paid hatches finished")
	_check(_owned("skitterling").all(func(u): return u.pos.distance_to(army_goal) < 2.5 or (not u.orders.is_empty() and u.orders[0].target_pos == army_goal)), "Army units follow their own rally")
	_check(_owned("forager").back().harvest_target_tag == patch.tag, "New Forager follows its worker rally")
	_harvest_aether("forager", "spore_tap", nest.pos)

func _test_concord() -> void:
	var heartstone := _open("aliens")
	var power_pos := _site("resonator", heartstone.pos)
	var mote := _nearest("mote", power_pos)
	var unpowered := _site("waystone", heartstone.pos)
	_check(not sim.issue_command([mote.tag], "build_waystone", unpowered).ok, "Cannot place an unpowered Waystone")
	var power := _build("mote", "resonator", power_pos)
	if power.is_empty():
		return
	_check(_owned("mote").size() == 12 and sim.units.has(mote.tag) and mote.orders.is_empty(), "Mote leaves its summoning site")
	sim.step_ticks(19 * 64)
	var waystone := _build("mote", "waystone", _site("waystone", heartstone.pos, true))
	if waystone.is_empty():
		return
	sim.step_ticks(47 * 64)
	if not _check(sim.issue_command([waystone.tag], "train_sunblade").ok, "Powered Waystone accepts production"):
		return
	sim.step_ticks(2 * 64)
	var progress: float = waystone.production_queue.front().progress
	var attacker: Dictionary = sim.units.values().filter(func(u): return u.owner == 2).front()
	sim._apply_damage_to_target(attacker, power, 10000.0, {}, 1.0)
	sim.step_ticks(3 * 64)
	_check(waystone.production_queue.front().progress == progress, "Losing power pauses paid production")
	_check(not sim.issue_command([waystone.tag], "train_sunblade").ok, "Unpowered Waystone rejects new jobs")
	var replacement := _build("mote", "resonator", power_pos)
	if replacement.is_empty():
		return
	sim.step_ticks(45 * 64)
	_check(_owned("sunblade").size() == 1, "Restoring power finishes the original paid job")
	_harvest_aether("mote", "aether_prism", heartstone.pos)
