extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
var sim: Node
var battle: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	if DisplayServer.get_name() != "headless":
		battle = load("res://scenes/RTSMain.tscn").instantiate()
		root.add_child(battle)
		await process_frame
	for index in range(Campaign.RAIL, Campaign.DRILL + 1):
		if not _check(sim.start_campaign(index).ok, "Mission %d loads" % (index + 1)):
			continue
		sim.paused = true
		var prior: Array[String] = [Campaign.MISSIONS[index - 1].id]
		_check(Campaign.mission_available(index, prior), "Mission %d unlocks after the previous victory" % (index + 1))
		for unit in sim.units.values():
			_check(not sim.terrain_grid.overlaps(unit.pos, unit.radius, false, unit.is_structure), "%s fits on the map" % unit.id)
		sim.step_ticks(5 * sim.TICK_RATE)
		_check(sim.players[1].crystal_collected > 0, "Starting Pioneers deliver crystal")
		var hall: Dictionary = _named("operation_hall")
		_check(sim.production_attachment(hall).get("unit_type") == "research_module", "Starting Muster Hall has its module")
		match index:
			Campaign.RAIL: _rail()
			Campaign.GAS: _gas()
			Campaign.DRILL: _drill()
	print("Campaign operations: ", "passed" if failures.is_empty() else failures)
	quit(int(not failures.is_empty()))

func _named(id: String) -> Dictionary:
	return sim.campaign._named(sim, id)

func _rail() -> void:
	var mission = sim.campaign.operation
	var skimmer := _named("abandoned_1")
	var scout: Dictionary = sim.spawn_unit("rifleman", 1, skimmer.pos + Vector2(0, 3))
	sim.step_ticks(8)
	_check(skimmer.owner == 1 and mission._salvaged.size() == 1, "Infantry recover a neutral Skimmer")
	_check(sim.issue_command([_workshop_tag()], "train_rail_skimmer").ok, "Workshop accepts paid Skimmer training")
	mission._next_event = sim.tick + 1
	sim.step_ticks(16)
	if not _check(mission._trains.size() == 1, "A scheduled train enters the route"):
		return
	var run: Dictionary = mission._trains.front()
	var train: Dictionary = sim.units[run.tag]
	var origin: Vector2 = train.pos
	var route: PackedVector2Array = mission.tracks[run.route]
	var gun: Dictionary = sim.spawn_unit("rail_skimmer", 1, origin + Vector2(5, 3))
	var health: float = train.hp
	sim.issue_command([gun.tag], "move", origin + Vector2(13, 4))
	sim.step_ticks(32)
	_check(train.pos.distance_to(route[0]) > 0.5, "The train travels along the track")
	_check(gun.pos.distance_to(origin + Vector2(5, 3)) > 1.0 and train.hp < health, "A moving Skimmer can hit the train")
	# Exercise the production mission callback with the same destruction path as combat.
	for i in range(mission.TRAIN_GOAL):
		if not _check(mission._trains.size() == 1, "There is a dispatched train to intercept"):
			return
		sim._apply_mutation_damage(sim.units[mission._trains[0].tag], 10000.0)
		mission._next_event = sim.tick + 1
		sim.step_ticks(8)
	_check(sim.campaign.status == "victory", "Eight destroyed trains win the operation")
	_check(sim.units.has(scout.tag), "The recovery scout remains playable")

func _gas() -> void:
	var mission = sim.campaign.operation
	var hub := _named("operation_hub")
	_check(sim.issue_command([_workshop_tag()], "train_warden_walker").ok, "Workshop accepts paid Warden training")
	var vent := _named("vent_2")
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, vent.pos + Vector2(0, 6))
	sim.step_ticks(16)
	if battle != null:
		battle._select_tags([worker.tag])
		battle._issue_smart_right_click(vent.pos, false)
	else:
		sim.issue_command([worker.tag], "extract_canister", vent.pos, vent.tag)
	if not _check(not worker.orders.is_empty() and worker.orders[0].type == "extract_canister", "Pioneer accepts an order to extract from a scouted vent"):
		return
	sim.step_ticks(20 * sim.TICK_RATE)
	_check(mission._delivered == 1 and not worker.has("campaign_canister") and worker.pos.distance_to(hub.pos) < 8.0, "Worker walks to the vent, extracts, and returns a canister")
	mission._next_event = sim.tick + 1
	sim.step_ticks(8)
	_check(not mission._seal.is_empty() and sim.units.has(mission._seal.tag), "The Concord sends a live sealer")
	if not mission._seal.is_empty():
		var altar := _named(mission._seal.vent.id)
		for _second in 40:
			if mission._sealed > 0:
				break
			sim.step_ticks(sim.TICK_RATE)
		_check(mission._sealed == 1 and not sim.issue_command([worker.tag], "extract_canister", altar.pos, altar.tag).ok,
			"A completed seal disables that vent. Sealer %s at %s" % [mission._seal, sim.units.get(mission._seal.get("tag", 0), {}).get("pos")])
	for hostile in sim.units.values():
		if hostile.owner == 2:
			sim._remove_destroyed_unit(hostile)
	mission._next_event = sim.tick + 180 * sim.TICK_RATE
	mission._next_raid = mission._next_event
	var extra_workers: Array[Dictionary] = []
	for id in ["vent_3", "vent_4", "vent_5", "vent_6", "vent_7", "vent_8"]:
		var next_vent := _named(id)
		var origin: Vector2 = next_vent.pos + Vector2(-4, 0)
		origin = sim._clamp_to_walkable(origin, 0.85)
		extra_workers.append({"worker": sim.spawn_unit("pioneer", 1, origin), "vent": next_vent})
	sim.step_ticks(16)
	for pair in extra_workers:
		_check(sim.issue_command([pair.worker.tag], "extract_canister", pair.vent.pos, pair.vent.tag).ok, "Accepts extraction from " + pair.vent.id)
	sim.step_ticks(55 * sim.TICK_RATE)
	_check(sim.campaign.status == "victory" and mission._delivered == 7, "Seven delivered canisters win Verdant Pressure")

func _drill() -> void:
	var mission = sim.campaign.operation
	var drill := _named("helix_drill")
	var seal := _named("vault_seal")
	var squad: Array = sim.units.values().filter(func(unit): return unit.owner == 1 and unit.unit_type == "howitzer")
	sim.issue_command(squad.map(func(unit): return unit.tag), "move", drill.pos)
	sim.step_ticks(4 * sim.TICK_RATE)
	if not _check(drill.owner == 1 and seal.hp < seal.max_hp, "Approaching the drill recovers it and starts cutting"):
		return
	var guard: Dictionary = sim.spawn_unit("sunblade", 2, drill.pos + Vector2(4, 8))
	guard.hold_fire = true
	sim.step_ticks(16)
	var seal_hp: float = seal.hp
	if battle != null:
		battle._select_tags([drill.tag])
		battle._issue_smart_right_click(guard.pos, false)
	else:
		sim.issue_command([drill.tag], "attack_target", guard.pos, guard.tag)
	_check(mission._drill_target == guard.tag, "Drill accepts a visible enemy target")
	sim.step_ticks(sim.TICK_RATE)
	_check(not sim.units.has(guard.tag) and seal.hp == seal_hp, "The redirected beam hits the enemy and pauses cutting")
	_check(sim.issue_command([drill.tag], "stop").ok, "Stop clears the manual target")
	seal.hp = 75.0
	sim.step_ticks(sim.TICK_RATE)
	_check(sim.campaign.status == "victory", "Destroying the seal wins Vaultbreaker")
	_check(mission._drill_target == 0, "Drill finishes on its default target")

func _workshop_tag() -> int:
	for unit in sim.units.values():
		if unit.owner == 1 and unit.unit_type == "workshop":
			return unit.tag
	return 0

func _check(ok: bool, message: String) -> bool:
	if not ok:
		failures.append(message)
	return ok
