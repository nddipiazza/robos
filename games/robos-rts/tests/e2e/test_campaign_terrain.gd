extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
var _sim: Node
var _failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	_sim = root.get_node("SimEngine")
	if DisplayServer.get_name() != "headless":
		change_scene_to_file("res://scenes/RTSMain.tscn")
		await process_frame
		await process_frame
	_sim.paused = true
	_check(_sim.start_campaign(Campaign.EVACUATION).ok, "The Last Road loads")
	await _cross(Vector2(135, 75), Vector2(142.5, 67.5), "The Last Road dock ramp")
	_check(_sim.start_campaign(Campaign.QUARANTINE).ok, "Ashfall Quarantine loads")
	await _cross(Vector2(108, 122), Vector2(96.825, 80.82), "Ashfall northern approach")
	await _cross(Vector2(142, 118), Vector2(155.595, 115.41), "Ashfall eastern approach")
	await _night_waves()
	print("Campaign terrain: ", "passed" if _failures.is_empty() else _failures)
	quit(int(not _failures.is_empty()))

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)

func _cross(from: Vector2, destination: Vector2, label: String) -> void:
	var unit: Dictionary = _sim.spawn_unit("rifleman", 1, from)
	unit.hold_fire = true
	var battle: Node
	if DisplayServer.get_name() != "headless":
		battle = current_scene
		_sim.paused = true
		battle._focus_camera(from.lerp(destination, 0.5), 50.0)
		battle._select_tags([unit.tag])
		var screen: Vector2 = battle.world_3d.world_to_screen(destination)
		var picked: Vector2 = battle.world_3d.screen_to_world(screen)
		_check(picked.distance_to(destination) < 0.3, "%s click hits the rendered ground" % label)
		battle.pending_ability = "move"
		battle._execute_pending_ability_at(picked, false, false, false, screen)
	else:
		_check(_sim.issue_command([unit.tag], "move", destination).ok, label + " accepts a move command")
	var clear := true
	for tick in 16 * _sim.TICK_RATE:
		_sim.step_ticks(1)
		if not _sim.units.has(unit.tag):
			clear = false
			break
		if _sim.terrain_grid.overlaps(unit.pos, 0.0, false):
			clear = false
		if unit.pos.distance_to(destination) <= 1.6:
			break
	_check(clear and unit.pos.distance_to(destination) <= 1.6,
		"%s crosses without clipping or stopping (ended at %s, orders %s)" % [label, unit.pos, unit.orders])

func _night_waves() -> void:
	_sim.start_campaign(Campaign.QUARANTINE, "normal")
	var mission = _sim.campaign.quarantine
	var hub: Dictionary = _sim.campaign._named(_sim, mission.HUB)
	for unit in _sim.units.values():
		if unit.owner == 1 and not unit.is_structure and not unit.is_worker:
			_sim.issue_command([unit.tag], "hold_position")
	_sim.tick = mission._phase_end - 1
	var arrivals := {}
	var stuck_since := {}
	var previous := {}
	var spawn_lanes := {}
	for _sample in range(55):
		_sim.step_ticks(4 * _sim.TICK_RATE)
		for unit in _sim.units.values():
			if unit.owner != 2 or unit.unit_type not in mission.INFECTED:
				continue
			var tag: int = unit.tag
			if unit.pos.distance_to(hub.pos) < 28.0:
				arrivals[tag] = true
			elif previous.has(tag) and unit.pos.distance_to(previous[tag]) < 1.5:
				stuck_since[tag] = int(stuck_since.get(tag, 0)) + 4
			else:
				stuck_since.erase(tag)
			if not previous.has(tag):
				for lane in range(mission.OPENING.size()):
					if unit.pos.distance_to(mission.OPENING[lane]) < 25.0:
						spawn_lanes[lane] = int(spawn_lanes.get(lane, 0)) + 1
			previous[tag] = unit.pos
	var trapped: Array = _sim.units.values().filter(func(unit): return int(stuck_since.get(unit.tag, 0)) >= 28)
	_check(spawn_lanes.size() == 2, "Infected enter from both opening lanes")
	_check(arrivals.size() >= 65 and hub.hp < hub.max_hp, "Night waves reach and damage the settlement")
	_check(trapped.is_empty(), "No surviving infected stay trapped outside the perimeter")
	print("Ashfall night: %d infected reached the perimeter, %d remained trapped" % [arrivals.size(), trapped.size()])
