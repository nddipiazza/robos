extends SceneTree

var sim: Node
var battle: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		printerr("Production queue input test requires a rendered Godot window")
		quit(1)
		return
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.reset_state(42, 112, 64)
	sim.paused = true
	sim.spawn_unit("colony_hub", 1, Vector2(15, 18))
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(30, 30))
	if not _check(sim.issue_command([hall.tag], "attach_fabrication_module").ok, "Fixture can build its production module"):
		quit(1)
		return
	sim.step_ticks(ceili(float(root.get_node("RTSData").get_unit_def("fabrication_module").build_time) / sim.TICK_DT))
	for kind in ["triage_specialist", "rifleman", "breacher", "rifleman"]:
		_check(sim.issue_command([hall.tag], "train_" + kind).ok, "Fixture queues " + kind)
	if hall.production_queue.size() != 4:
		printerr(failures)
		quit(1)
		return
	sim.step_ticks(16)
	battle = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	battle._select_tags([hall.tag])

	var queue: Array = hall.production_queue
	var first: Dictionary = queue[0]
	var second: Dictionary = queue[1]
	var third: Dictionary = queue[2]
	var stock := _stock()
	var supply: int = sim.players[1].supply_used
	_check(first.progress > 0.0 and second.progress > 0.0 and third.progress == 0.0, "Fixture has active and waiting units")
	var second_progress: float = second.progress
	battle.pending_ability = "rally"
	_escape()
	_check(battle.pending_ability.is_empty() and queue.size() == 4 and _stock() == stock, "Escape exits rally placement first")
	_escape()
	_check(queue == [first, second, third] and _stock() == stock + _cost("rifleman")
		and sim.players[1].supply_used == supply, "Escape cancels only the last queued unit and refunds it")

	stock = _stock()
	_click_slot(0)
	_check(queue == [second, third] and second.progress == second_progress
		and _stock() == stock + _cost("triage_specialist") and sim.players[1].supply_used == supply - first.supply_cost,
		"Clicking an active unit refunds crystal and aether, frees supply, and preserves its neighbor")
	stock = _stock()
	_click_slot(1)
	_check(queue == [second] and _stock() == stock + _cost("breacher"),
		"Clicking a waiting unit cancels that specific slot")
	stock = _stock()
	_click_slot(1)
	_check(queue == [second] and _stock() == stock, "Clicking an empty slot does nothing")
	_escape()
	_check(queue.is_empty() and _stock() == stock + _cost("rifleman"), "Escape can cancel the only unit, even while it is active")

	print("Production queue input: ", "passed" if failures.is_empty() else failures)
	battle.queue_free()
	await process_frame
	quit(int(not failures.is_empty()))

func _escape() -> void:
	battle.inject_input({"type": "key", "key": "Escape"})
	battle.inject_input({"type": "key", "key": "Escape", "pressed": false})

func _click_slot(index: int) -> void:
	var point: Vector2 = battle.hud._production_rect(index).get_center()
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.position = point
		event.global_position = point
		event.pressed = pressed
		root.push_input(event, true)

func _stock() -> Vector2i:
	return Vector2i(sim.players[1].crystal, sim.players[1].aether)

func _cost(kind: String) -> Vector2i:
	var definition: Dictionary = root.get_node("RTSData").get_unit_def(kind)
	return Vector2i(definition.crystal_cost, definition.aether_cost)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok
