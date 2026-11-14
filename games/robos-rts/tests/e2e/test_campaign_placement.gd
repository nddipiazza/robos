extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const MOVE_TOLERANCE := 1.6
# Each row uses authored ground near a starting base. Keep the production
# building off the lane, then place a separate Silo across the lane.
const LAYOUTS := {
	Campaign.RECOVERY: [Vector2(89, 122), Vector2(98, 138), Vector2.DOWN],
	Campaign.DEFENSE: [Vector2(132, 120), Vector2(119, 112), Vector2(0.707107, 0.707107)],
	Campaign.EVACUATION: [Vector2(81, 213), Vector2(64, 237), Vector2.DOWN],
	Campaign.QUARANTINE: [Vector2(107, 125), Vector2(132, 122), Vector2.LEFT],
	Campaign.REDSTONE: [Vector2(68, 129), Vector2(75, 125), Vector2(-0.707107, 0.707107)],
	Campaign.SHRINE: [Vector2(116, 146), Vector2(128, 127), Vector2.RIGHT],
	Campaign.SANCTUARY: [Vector2(108, 75), Vector2(112, 62), Vector2.DOWN],
	Campaign.RAIL: [Vector2(110, 140), Vector2(130, 107), Vector2.UP],
	Campaign.GAS: [Vector2(183, 163), Vector2(173, 158), Vector2.UP],
	Campaign.DRILL: [Vector2(57, 138), Vector2(66, 137), Vector2.RIGHT],
}

var _sim: Node
var _failures: Array[String] = []
var _title := ""

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	_sim = root.get_node("SimEngine")
	if DisplayServer.get_name() != "headless":
		change_scene_to_file("res://scenes/RTSMain.tscn")
		await process_frame
		await process_frame
	for index in Campaign.MISSIONS.size():
		if not OS.get_cmdline_user_args().is_empty() and str(index + 1) not in OS.get_cmdline_user_args():
			continue
		_title = Campaign.MISSIONS[index].title
		var prior_failures := _failures.size()
		if not _check(_sim.start_campaign(index, "normal").ok, "loads"):
			continue
		_sim.paused = true
		_remove_combat_pressure(index)
		if index == Campaign.ASSAULT:
			_check_squad_mission()
		elif _check(LAYOUTS.has(index), "has a placement and choke fixture"):
			_check_layout(LAYOUTS[index])
		if index == Campaign.QUARANTINE:
			_check_ashfall_mineral_lane()
		_check(not _sim.units.values().any(func(unit): return unit.owner > 1 and not unit.hold_fire),
			"no active attackers entered the fixture")
		print(_title, ": ", "passed" if _failures.size() == prior_failures else _failures.slice(prior_failures))
	print("Campaign building placement: ", "passed" if _failures.is_empty() else _failures)
	quit(int(not _failures.is_empty()))

func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failures.append("%s: %s" % [_title, message])
	return condition

func _remove_combat_pressure(index: int) -> void:
	for unit in _sim.units.values().duplicate():
		if unit.owner > 1:
			if unit.is_structure or unit.id == "map_765":
				unit.hold_fire = true
			else:
				_sim._remove_destroyed_unit(unit)
	var campaign = _sim.campaign
	# Hold the encounter schedules past this test. The normal campaign
	# roster, construction, harvesting, placement and movement stay active.
	var after_test: int = 600 * _sim.TICK_RATE
	match index:
		Campaign.RECOVERY:
			campaign.camp_siege_tags.append(-1)
			campaign.waves_sent = campaign.RAIDS.size()
		Campaign.DEFENSE:
			campaign.waves_sent = campaign.WAVES.size()
			for squad in campaign.squads:
				squad.state = "rescued"
		Campaign.EVACUATION:
			var squad: Array = _sim.units.values().filter(func(unit): return unit.owner == 1).map(func(unit): return unit.tag)
			for point in campaign.evacuation.INSERTION_ROAD.slice(1):
				_sim.issue_command(squad, "move", point, 0, "", true)
			_sim.step_ticks(45 * _sim.TICK_RATE)
			_check(campaign.stage == 1, "escort claims the settlement")
			campaign.evacuation._depart_at = after_test
		Campaign.QUARANTINE:
			campaign.quarantine._phase_end = after_test
		Campaign.REDSTONE, Campaign.SHRINE, Campaign.SANCTUARY:
			campaign.frontier._next_attack = after_test
			if index == Campaign.REDSTONE:
				campaign.frontier._lava_at = after_test
		Campaign.RAIL, Campaign.GAS, Campaign.DRILL:
			campaign.operation._next_event = after_test
			campaign.operation._next_raid = after_test
	# Keep static objectives in missions whose completion depends on their survival.
	_sim._rebuild_astar_grid()
	_sim._rebuild_spatial_grid()
	_sim._refresh_vision()

func _check_squad_mission() -> void:
	var squad: Array = _sim.units.values().filter(func(unit): return unit.owner == 1)
	_check(not squad.any(func(unit): return unit.is_worker), "opens with a fixed squad")
	_check(not _sim.campaign_allows_ability(1, "build_silo"), "construction is unavailable")
	var vale: Dictionary = _sim.campaign._named(_sim, "captain_vale")
	_check(not _sim.issue_command([vale.tag], "build_silo", vale.pos + Vector2(3, 0)).ok, "construction order is rejected")

func _check_ashfall_mineral_lane() -> void:
	var hub: Dictionary = _sim.campaign._named(_sim, "settlement_117")
	var patches: Array = _sim.resources.values().filter(func(deposit):
		return deposit.resource_type == "crystal_field" and deposit.pos.distance_to(hub.pos) < 24.0)
	_check(patches.size() == 7, "all seven patches remain in the starting mineral line")
	for patch in patches:
		var clearance: float = hub.pos.distance_to(patch.pos) - hub.radius - patch.radius
		_check(clearance >= 11.0, "mineral patch %s leaves at least 11 units between footprints" % patch.pos)
		_check(not _sim.terrain_grid.overlaps(patch.pos, patch.radius + 0.85, false, true),
			"mineral patch %s and its mining edge fit on the plateau" % patch.pos)
	_check(_sim.players[1].crystal_collected > 0, "starting workers deliver crystal to the Colony Hub")

func _check_layout(layout: Array) -> void:
	var production: Vector2 = layout[0]
	var choke: Vector2 = layout[1]
	var direction: Vector2 = layout[2]
	var from := choke - direction * 4.5
	var to := choke + direction * 4.5
	_sim.step_ticks(2 * _sim.TICK_RATE)
	var workers: Array = _sim.units.values().filter(func(unit): return unit.owner == 1 and unit.is_worker)
	if not _check(not workers.is_empty(), "has workers for construction"):
		return
	var hall := _build(workers, "muster_hall", production)
	if hall.is_empty():
		return
	var radius: float = _sim.get_node("/root/RTSData").get_unit_def("rifleman").radius
	_check(_sim._has_clear_line_of_walk(from, to, radius), "off-lane production leaves the choke open")
	workers = workers.filter(func(unit): return _sim.units.has(unit.tag))
	if not _check(not workers.is_empty(), "workers remain available for the choke placement"):
		return
	var wall := _build(workers, "silo", choke)
	if wall.is_empty():
		return
	_check(not _sim._has_clear_line_of_walk(from, to, radius), "raised Silo blocks the direct lane")
	var detour: Array[Vector2] = _sim.compute_smooth_path(from, to, radius)
	_check(detour.is_empty() or detour.front().distance_to(to) > MOVE_TOLERANCE, "pathing stops or detours around the raised Silo")
	_check(_sim.issue_command([wall.tag], "retract_silo").ok, "can lower the Silo")
	_sim.step_ticks(1)
	_check(_sim._has_clear_line_of_walk(from, to, radius), "lowering the Silo opens the same lane")
	var scout: Dictionary = _sim.spawn_unit("rifleman", 1, from)
	_check(_sim.issue_command([scout.tag], "move", to).ok, "infantry accepts a move through the open lane")
	_sim.step_ticks(10 * _sim.TICK_RATE)
	var cleared: bool = (scout.pos - choke).dot(direction) > wall.radius
	if not _check(cleared, "infantry crosses the open lane from %s to %s (reached %s, path %s)" % [from, to, scout.pos, scout.path]):
		return

func _build(workers: Array, type: String, point: Vector2) -> Dictionary:
	if not _check(_sim.can_place_structure(type, point), "%s fits at %s" % [type, point]):
		return {}
	var approaches := {}
	for candidate in workers:
		var path: Array[Vector2] = _sim.compute_smooth_path(candidate.pos, point, candidate.radius)
		var distance: float = candidate.pos.distance_to(path.front()) if not path.is_empty() else INF
		for i in range(1, path.size()):
			distance += path[i - 1].distance_to(path[i])
		var is_reachable: bool = not path.is_empty() and path.back().distance_to(point) < 2.0
		var starts_clear: bool = not _sim._is_point_blocked_by_static(candidate.pos, candidate.radius)
		approaches[candidate.tag] = distance + (0.0 if starts_clear else 50.0) if is_reachable else INF
	workers.sort_custom(func(a, b): return approaches[a.tag] < approaches[b.tag])
	var worker: Dictionary = workers.front()
	if not _check(is_finite(approaches[worker.tag]), "a worker can route to %s at %s" % [type, point]):
		return {}
	var cost: int = _sim.get_node("/root/RTSData").get_unit_def(type).crystal_cost
	var result: Dictionary
	if current_scene != null:
		current_scene._focus_camera(point, 50.0)
		current_scene._select_tags([worker.tag])
		var screen: Vector2 = current_scene.world_3d.world_to_screen(point)
		var picked: Vector2 = current_scene.world_3d.screen_to_world(screen)
		current_scene.pending_ability = "build_" + type
		current_scene._execute_pending_ability_at(picked, false, false, false, screen)
	else:
		result = _sim.issue_command([worker.tag], "build_" + type, point)
	if not _check(not worker.orders.is_empty() and worker.orders.front().type == "build",
			"accepts the %s build order at %s (%s; worker at %s)" % [type, point, result, worker.pos]):
		return {}
	for _second in 85:
		_sim.step_ticks(_sim.TICK_RATE)
		for site in _sim.units.values():
			if site.owner == 1 and site.unit_type == type and site.pos.distance_to(point) <= 0.1 and site.build_progress >= 1.0:
				_check(site.construction_cost.x == cost, "charged the listed cost for %s" % type)
				_sim.issue_SmartHarvest(worker.tag)
				return site
		if worker.orders.is_empty():
			break
	_check(false, "worker reached and completed %s at %s (worker at %s, path %s)" % [type, point, worker.pos, worker.path])
	return {}
