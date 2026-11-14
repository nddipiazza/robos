extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		printerr("Bunker garrison input test requires a rendered Godot window")
		quit(1)
		return
	await process_frame
	var sim := root.get_node("SimEngine")
	sim.load_scenario_dict({"paused": true, "decor": false, "map": {"width": 96, "height": 64}, "units": [
		{"type": "field_bunker", "id": "bunker", "owner": 1, "x": 42, "y": 28},
		{"type": "rifleman", "id": "rifle_a", "owner": 1, "x": 39, "y": 28},
		{"type": "rifleman", "id": "rifle_b", "owner": 1, "x": 46, "y": 28, "hp": 24},
		{"type": "triage_specialist", "id": "medic", "owner": 1, "x": 42, "y": 33},
	]})
	var bunker: Dictionary = sim.units.values().filter(func(unit): return unit.id == "bunker").front()
	if not sim.issue_command([bunker.tag], "load_transport").ok or bunker.passengers.size() != 3:
		printerr("Expected three passengers in the bunker")
		quit(1)
		return
	var original: Array = bunker.passengers.duplicate()
	var clicked: Dictionary = original[1]
	var hp: float = clicked.hp
	var supply: int = sim.players[1].supply_used
	var battle: Node = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	battle._select_tags([bunker.tag])

	_click(battle.hud._production_rect(3).get_center())
	_check(bunker.passengers == original, "Clicking an empty slot leaves the garrison alone")
	var obstruction := Rect2(bunker.pos - Vector2(6, 6), Vector2(12, 12))
	sim.terrain_obstacles.append(obstruction)
	_click(battle.hud._production_rect(1).get_center())
	_check(bunker.passengers == original and not sim.units.has(clicked.tag), "The passenger stays inside when there is no safe exit")
	sim.terrain_obstacles.erase(obstruction)
	_click(battle.hud._production_rect(1).get_center())
	_check(bunker.passengers == [original[0], original[2]], "Clicking a portrait unloads only that passenger")
	var deployed: Dictionary = sim.units.get(clicked.tag, {})
	_check(not deployed.is_empty() and deployed.hp == hp and deployed.pos.distance_to(bunker.pos) >= bunker.radius + deployed.radius,
		"The clicked unit returns on clear ground with its original health")
	_check(sim.players[1].supply_used == supply, "Unloading leaves supply unchanged")
	_check(not sim.issue_command([bunker.tag], "unload_bunker", Vector2.ZERO, clicked.tag).ok and bunker.passengers.size() == 2,
		"A stale passenger tag cannot unload anyone else")
	battle.inject_input({"type": "key", "key": "U"})
	_check(bunker.passengers.is_empty(), "The Unload Bunker hotkey still deploys the remaining garrison")

	print("Bunker garrison input: ", "passed" if failures.is_empty() else failures)
	battle.queue_free()
	await process_frame
	quit(int(not failures.is_empty()))

func _click(point: Vector2) -> void:
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.position = point
		event.global_position = point
		event.pressed = pressed
		root.push_input(event, true)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
