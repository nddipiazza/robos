extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	for count in [12, 24, 36]:
		_test_line(count, false)
		_test_line(count, true)
	_test_blocked_line()
	print("Mineral saturation checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _test_line(count: int, unlimited: bool) -> void:
	sim.reset_state(42, 112, 96)
	sim.unlimited_resources = unlimited
	var hall: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(20, 44))
	var patches: Array[Dictionary] = []
	var stock := 0
	for i in range(8):
		var amount := 1 if unlimited else 23 + i * 7
		var patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(40, 26 + i * 5), amount)
		patch["line_origin"] = hall.pos
		patches.append(patch)
		stock += amount
	var workers: Array[Dictionary] = []
	var tags: Array[int] = []
	for i in range(count):
		var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(27 + i % 4 * 2, 25 + floori(i / 4.0) * 4))
		workers.append(worker)
		tags.append(worker.tag)
	_check(sim.issue_command(tags, "harvest", patches[3].pos, patches[3].tag).accepted == count, "All workers accept group harvest")
	var label := "%d %s miners" % [count, "unlimited" if unlimited else "finite"]
	var assignments := {}
	for worker in workers:
		var target: int = worker.orders[0].target_tag
		assignments[target] = int(assignments.get(target, 0)) + 1
	_check(assignments.size() == 8 and assignments.values().max() - assignments.values().min() <= 1, "%s spread across all eight patches" % label)
	sim.step_ticks(1)
	var saturation: Dictionary = sim.worker_saturation(1)[hall.tag]
	_check(saturation.assigned == count and saturation.ideal == 16, "%s are reflected in the saturation count" % label)

	var prior_cargo := {}
	var mined := {}
	var delivered := 0
	var initial_bank: int = sim.players[1].crystal
	var ledger_ok := true
	var slots_ok := true
	var redistributed := false
	var previous_targets := {}
	for _tick in range(3200):
		sim.step_ticks(1)
		var outstanding := 0
		var slots := {}
		for worker in workers:
			var cargo: int = worker.cargo_amount
			var previous: int = prior_cargo.get(worker.tag, 0)
			if cargo > 0:
				mined[worker.tag] = true
			if previous > 0 and cargo == 0:
				delivered += previous
			prior_cargo[worker.tag] = cargo
			outstanding += cargo
			if worker.orders.is_empty():
				continue
			var target: int = worker.orders[0].target_tag
			var old_target: int = previous_targets.get(worker.tag, target)
			redistributed = redistributed or (old_target != target and sim.resources[old_target].amount == 0)
			previous_targets[worker.tag] = target
			if worker.harvest_timer > 0.0:
				slots_ok = slots_ok and not slots.has(target)
				slots[target] = worker.tag
		var remaining := 0
		for patch in patches:
			remaining += patch.amount
			slots_ok = slots_ok and patch.mining_worker == int(slots.get(patch.tag, 0))
		ledger_ok = ledger_ok and sim.players[1].crystal == initial_bank + delivered and sim.players[1].crystal_collected == delivered
		ledger_ok = ledger_ok and (remaining == stock if unlimited else remaining + outstanding + delivered == stock)
		if delivered >= stock and not unlimited:
			break
		if unlimited and mined.size() == count and delivered >= count * 10:
			break
	_check(ledger_ok, "%s deliver each load once and conserve deposit stock" % label)
	_check(slots_ok, "%s keep exactly one active drill per patch" % label)
	_check(mined.size() == count, "%s all obtain a load (%d did)" % [label, mined.size()])
	_check(delivered >= count * 10 if unlimited else delivered == stock, "%s sustain delivery (%d collected)" % [label, delivered])
	if unlimited:
		_test_freed_patch(workers, patches[0], label)
	else:
		_check(redistributed, "%s redistribute when a finite patch depletes" % label)

func _test_freed_patch(workers: Array[Dictionary], patch: Dictionary, label: String) -> void:
	var released: Array[int] = []
	for worker in workers:
		if not worker.orders.is_empty() and worker.orders[0].target_tag == patch.tag:
			released.append(worker.tag)
	sim.issue_command(released, "stop")
	var filled := false
	for _tick in range(640):
		sim.step_ticks(1)
		for worker in workers:
			if worker.tag not in released and not worker.orders.is_empty() and worker.orders[0].target_tag == patch.tag:
				filled = true
				break
		if filled:
			break
	_check(filled, "%s use a neighboring patch when its workers leave" % label)

func _test_blocked_line() -> void:
	sim.reset_state(42, 112, 88)
	sim.terrain_obstacles.append(Rect2(48, 0, 8, 42))
	sim.terrain_obstacles.append(Rect2(48, 46, 8, 42))
	sim.spawn_unit("colony_hub", 1, Vector2(22, 44))
	var gate: Dictionary = sim.spawn_unit("silo", 1, Vector2(52, 44))
	var patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(63, 44), 60)
	var workers: Array[Dictionary] = []
	var tags: Array[int] = []
	for i in range(12):
		var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(32 + i % 3 * 2, 39 + floori(i / 3.0) * 3))
		workers.append(worker)
		tags.append(worker.tag)
	sim.issue_command(tags, "harvest", patch.pos, patch.tag)
	sim.step_ticks(320)
	_check(workers.all(func(worker): return worker.pos.x < 52 and worker.cargo_amount == 0), "Mining orders cannot cross the raised gate")
	_check(sim.players[1].crystal_collected == 0 and patch.amount == 60, "A blocked line delivers no phantom cargo")
	var alternative: Dictionary = sim.spawn_resource("crystal_field", Vector2(39, 36), 17)
	for _sample in range(100):
		sim.step_ticks(32)
		if sim.players[1].crystal_collected == 17:
			break
	_check(sim.players[1].crystal_collected == 17 and alternative.amount == 0 and patch.amount == 60,
		"Workers switch to a reachable patch while the requested patch is blocked")
	sim.issue_command([gate.tag], "retract_silo")
	var returning := {}
	for _tick in range(1600):
		sim.step_ticks(1)
		if not sim.silo_raise_block_reason(gate).is_empty():
			continue
		for worker in workers:
			if worker.pos.x > 56.0 and worker.cargo_amount > 0:
				returning = worker
				break
		if not returning.is_empty():
			break
	_check(not returning.is_empty(), "A loaded worker returns while the gate is clear")
	if not returning.is_empty():
		var load: int = returning.cargo_amount
		_check(sim.issue_command([gate.tag], "extend_silo").ok, "Raise the gate while its footprint is clear")
		sim.step_ticks(320)
		_check(returning.cargo_amount == load and returning.pos.x > gate.pos.x, "The blocked worker stays across the gate with its cargo intact")
		sim.issue_command([gate.tag], "retract_silo")
	for _sample in range(180):
		sim.step_ticks(32)
		if sim.players[1].crystal_collected == 77:
			break
	_check(sim.players[1].crystal_collected == 77 and patch.amount == 0, "Mining resumes and delivers every load when the gate opens")
