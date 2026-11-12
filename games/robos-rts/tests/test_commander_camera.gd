extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim := root.get_node("SimEngine")
	var commander := root.get_node("RTSCommanderAI")
	sim.rts_mode = "backend"
	sim.load_scenario_dict({
		"name": "Commander Camera", "paused": true, "fog_of_war": true,
		"map": {"width": 140, "height": 64},
		"units": [
			{"id": "actor", "type": "rifleman", "owner": 1, "x": 25, "y": 20},
			{"id": "spotter", "type": "pioneer", "owner": 1, "x": 55, "y": 20},
			{"id": "visible", "type": "silo", "owner": 2, "x": 63, "y": 20},
			{"id": "hidden", "type": "silo", "owner": 2, "x": 112, "y": 20},
		],
	})
	var by_id := {}
	for unit in sim.units.values():
		by_id[unit.id] = unit
	var actor: Dictionary = by_id.actor
	var visible: Dictionary = by_id.visible
	var hidden: Dictionary = by_id.hidden
	var failures := []
	commander.look_at(1, actor.pos)
	sim.step_ticks(16)
	if not sim.can_see_unit(1, visible) or not commander.observed_enemy_buildings(1).is_empty():
		failures.append("A visible minimap contact became a known building before the camera arrived")
	var result: Dictionary = commander.issue_order([actor.tag], "attack_target", visible.pos, visible.tag)
	if result.ok or not result.get("camera_pending", false) or not actor.orders.is_empty():
		failures.append("An off-camera enemy received an attack order")
	sim.step_ticks(15)
	if commander.is_on_camera(1, visible.pos):
		failures.append("The camera was usable before its pan finished")
	sim.step_ticks(1)
	if not commander.observed_enemy_buildings(1).any(func(unit): return unit.tag == visible.tag):
		failures.append("A visible enemy was missing after the camera arrived")
	if not commander.issue_order([actor.tag], "attack_target", visible.pos, visible.tag).ok:
		failures.append("The commander could not attack with its previously selected unit")
	if commander.issue_order([actor.tag], "attack_target", hidden.pos, hidden.tag).ok:
		failures.append("A target inside fog received an attack order")
	result = commander.issue_order([actor.tag], "move", hidden.pos)
	if result.ok or not result.get("camera_pending", false):
		failures.append("The commander issued an off-camera ground order")
	sim.step_ticks(16)
	if not commander.issue_order([actor.tag], "move", hidden.pos).ok:
		failures.append("The commander could not issue a scout move into fog from the destination camera")
	print("Commander camera checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
