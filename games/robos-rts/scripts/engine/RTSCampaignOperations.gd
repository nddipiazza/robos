extends RefCounted

const TRAIN_GOAL := 8
const GAS_GOAL := 7
const DRILL_HULL := "helix_drill"
var workshop_definition: Dictionary
var tracks: Array[PackedVector2Array] = []
var _data: Dictionary
var _difficulty: int
var _next_event := 0
var _next_raid := 0
var _raid := 0
var _dispatches := 0
var _trains: Array[Dictionary] = []
var _intercepted := 0
var _escaped := 0
var _salvaged := {}
var _vents: Array[Dictionary] = []
var _delivered := 0
var _sealed := 0
var _seal := {}
var _samples := {}
var _drill_target := 0
var _next_beam := 0
var roadwarden_contract = preload("res://scripts/engine/RTSEvacuation.gd").new()

func _init(engine, campaign, data: Dictionary) -> void:
	_data = data
	_difficulty = campaign.DIFFICULTIES.find(campaign.difficulty)
	var hall: Dictionary = campaign._named(engine, "operation_hall")
	var module: Dictionary = campaign._named(engine, "operation_module")
	if not hall.is_empty() and not module.is_empty():
		engine._link_production_attachment(hall, module)
	workshop_definition = engine.get_node("/root/RTSData").get_unit_def("workshop").duplicate(true)
	for pair in [["cinder_runner", "train_cinder_runner"], ["rail_skimmer", "train_rail_skimmer"], ["warden_walker", "train_warden_walker"]]:
		if campaign.allows_training(pair[0]):
			workshop_definition.trains.append(pair[0])
			workshop_definition.abilities.append(pair[1])
	_next_raid = engine.tick + [130, 100, 85, 70][_difficulty] * engine.TICK_RATE
	match campaign.mission_index:
		campaign.RAIL:
			for id in data.skimmers:
				var skimmer: Dictionary = campaign._named(engine, id)
				skimmer.hold_fire = true
				campaign._reserve(engine, skimmer)
			for route in data.tracks:
				var track := PackedVector2Array()
				for point in route:
					track.append(_point(point))
				tracks.append(track)
			_next_event = engine.tick + 55 * engine.TICK_RATE
			campaign._speak(engine, "iron_intercept_start")
		campaign.GAS:
			for id in data.vents:
				_vents.append({"id": id, "status": "open", "worker": 0, "ready": 0})
			_next_event = engine.tick + [95, 43, 37, 30][_difficulty] * engine.TICK_RATE
			campaign._speak(engine, "verdant_pressure_start")
		campaign.DRILL:
			var gate: Dictionary = campaign._named(engine, "vault_seal")
			gate["campaign_shielded"] = true
			_next_raid = 0
			campaign._speak(engine, "vaultbreaker_start")

func step(engine, campaign) -> void:
	if not engine.units.values().any(func(unit): return unit.owner == 1 and unit.hp > 0.0):
		campaign._finish(engine, false, "The expedition was lost.")
		return
	_collect_samples(engine, campaign)
	match campaign.mission_index:
		campaign.RAIL: _step_rail(engine, campaign)
		campaign.GAS: _step_gas(engine, campaign)
		campaign.DRILL: _step_drill(engine, campaign)
	if campaign.status == "playing" and _next_raid > 0 and engine.tick >= _next_raid:
		_send_raid(engine, campaign)

func _point(pair: Array) -> Vector2:
	return Vector2(float(pair[0]), float(pair[1]))

func move_trains(engine) -> void:
	for run in _trains:
		var train: Dictionary = engine.units.get(run.tag, {})
		if train.is_empty() or run.get("at_terminal", false):
			continue
		var route: PackedVector2Array = tracks[run.route]
		var waypoint: Vector2 = route[run.next]
		var speed: float = [4.6, 5.2, 6.0, 7.0][_difficulty]
		train.facing = (waypoint - train.pos).angle()
		train.pos = train.pos.move_toward(waypoint, speed / engine.TICK_RATE)
		if train.pos.is_equal_approx(waypoint):
			run.next += 1
			run["at_terminal"] = run.next == route.size()

func _step_rail(engine, campaign) -> void:
	for id in _data.skimmers:
		var unit: Dictionary = campaign._named(engine, id)
		if not unit.is_empty() and unit.owner == 0 and campaign._squad_near(engine, unit.pos, 5.5):
			unit.owner = 1
			unit.hold_fire = false
			_salvaged[id] = true
			campaign._release_reserves(engine, [unit.tag])
			engine.notice.emit(1, "Rail Skimmer recovered.", "info")
	for index in range(_trains.size() - 1, -1, -1):
		var run: Dictionary = _trains[index]
		var train: Dictionary = engine.units.get(run.tag, {})
		if train.is_empty():
			_intercepted += 1
			engine.players[1].crystal += 100
			_trains.remove_at(index)
			continue
		if run.get("at_terminal", false):
			engine._remove_destroyed_unit(train)
			_escaped += 1
			_trains.remove_at(index)
	if _intercepted >= TRAIN_GOAL:
		campaign._finish(engine, true, "The Directorate freight line is cut.")
	elif _escaped > 2:
		campaign._finish(engine, false, "Three freight trains reached the terminal.")
	elif _dispatches < TRAIN_GOAL + 2 and engine.tick >= _next_event:
		var route_index: int = [1, 0, 2, 1, 2, 0, 1, 2, 0, 1][_dispatches]
		var route: PackedVector2Array = tracks[route_index]
		var train: Dictionary = engine.spawn_unit("rail_freight", 2, route[0])
		train.max_hp = [680.0, 880.0, 1130.0, 1400.0][_difficulty] + 42.0 * _dispatches
		train.hp = train.max_hp
		train["campaign_road_vehicle"] = true
		train["campaign_scripted"] = true
		train.facing = (route[1] - route[0]).angle()
		_trains.append({"tag": train.tag, "route": route_index, "next": 1})
		var escort: Array[int] = campaign._spawn_force(engine, 2, route[0] + Vector2(7, -5),
			{"rifleman": 1 + _difficulty + int(_dispatches / 3), "breacher": int((_dispatches + _difficulty) / 3)})
		for index in range(1, route.size()):
			engine.issue_command(escort, "attack_move", route[index] + Vector2(0, -3.5), 0, "", index > 1, true)
		_dispatches += 1
		_next_event = engine.tick + [61, 53, 46, 40][_difficulty] * engine.TICK_RATE
		engine.notice.emit(1, "Freight has entered rail line %d." % (route_index + 1), "warn")

func can_collect(worker: Dictionary, target: Dictionary) -> bool:
	if target.get("unit_type") != "gas_altar" or worker.owner != 1 or worker.unit_type != "pioneer" or worker.has("campaign_canister"):
		return false
	return _vents.any(func(vent): return vent.id == target.id and vent.status == "open")

func _step_gas(engine, campaign) -> void:
	var open_vents := []
	for vent in _vents:
		if vent.status == "collected" and not engine.units.has(vent.worker):
			vent.status = "open"
			vent.worker = 0
			vent.ready = 0
		if vent.status != "open":
			continue
		var altar: Dictionary = campaign._named(engine, vent.id)
		if altar.is_empty():
			vent.status = "sealed"
			_sealed += 1
			continue
		var worker: Dictionary = engine.units.get(vent.worker, {})
		if not _extracting(worker, altar.tag) or worker.pos.distance_to(altar.pos) > 3.8:
			vent.worker = 0
			vent.ready = 0
			for unit in engine.query_units_in_radius(altar.pos, 3.8):
				if _extracting(unit, altar.tag) and unit.pos.distance_to(altar.pos) <= 3.8:
					vent.worker = unit.tag
					vent.ready = engine.tick + 6 * engine.TICK_RATE
					break
		elif engine.tick >= int(vent.ready):
			worker["campaign_canister"] = vent.id
			worker.orders[0] = {"type": "deliver_canister"}
			worker.path.clear()
			vent.status = "collected"
		if vent.status == "open":
			open_vents.append(vent)
	for worker in engine.units.values():
		if worker.owner != 1 or not worker.get("campaign_canister", false):
			continue
		var hub: Dictionary = engine._find_nearest_town_hall(1, worker.pos)
		if not hub.is_empty() and worker.pos.distance_to(hub.pos) <= hub.radius + worker.radius + 1.7:
			for vent in _vents:
				if vent.id == worker.campaign_canister:
					vent.status = "delivered"
					break
			worker.erase("campaign_canister")
			if not worker.orders.is_empty() and worker.orders[0].type == "deliver_canister":
				worker.orders.pop_front()
				worker.path.clear()
			_delivered += 1
			engine.notice.emit(1, "Canister delivered (%d/%d)." % [_delivered, GAS_GOAL], "info")
	if _delivered >= GAS_GOAL:
		campaign._finish(engine, true, "Seven canisters secured.")
		return
	var carrying: Array = engine.units.values().filter(func(unit): return unit.owner == 1 and unit.get("campaign_canister", false))
	if _sealed >= GAS_GOAL or _delivered + carrying.size() + open_vents.size() < GAS_GOAL:
		campaign._finish(engine, false, "Too few vents remain to complete the shipment.")
		return
	if not _seal.is_empty():
		_step_seal(engine, campaign)
	elif engine.tick >= _next_event and not open_vents.is_empty():
		_begin_seal(engine, campaign, open_vents.front())

func _extracting(worker: Dictionary, tag: int) -> bool:
	return (not worker.is_empty() and worker.hp > 0.0 and not worker.get("campaign_canister", false)
		and not worker.orders.is_empty() and worker.orders[0].type == "extract_canister"
		and worker.orders[0].target_tag == tag)

func _begin_seal(engine, campaign, vent: Dictionary) -> void:
	var altar: Dictionary = campaign._named(engine, vent.id)
	if altar.is_empty() or vent.status != "open":
		return
	var origin := _point(_data.seal_origin)
	var sealers: Array[int] = campaign._spawn_force(engine, 2, origin, {"mote": 1, "sunblade": 1 + _difficulty, "prism_ray": int(_difficulty >= 2)})
	var sealer: int = sealers.pop_front()
	var approach := _seal_approach(engine, sealer, altar)
	engine.issue_command([sealer], "move", approach)
	for tag in sealers:
		var escort: Dictionary = engine.units[tag]
		var flank: Vector2 = approach + (origin - altar.pos).normalized().orthogonal() * (5.0 if tag % 2 == 0 else -5.0)
		if engine._is_point_blocked_by_static(flank, escort.radius):
			flank = approach + (origin - altar.pos).normalized() * 6.0
		engine.issue_command([tag], "attack_move", flank)
	_seal = {"vent": vent, "tag": sealer, "ready": 0, "expires": engine.tick + 75 * engine.TICK_RATE}
	engine.notice.emit(1, "A Concord sealer is moving to a vent.", "warn")

func _seal_approach(engine, tag: int, altar: Dictionary) -> Vector2:
	var unit: Dictionary = engine.units[tag]
	var best: Vector2 = altar.pos
	var distance := INF
	for step in 12:
		var point: Vector2 = altar.pos + Vector2.from_angle(step * TAU / 12.0) * 3.2
		if engine._is_point_blocked_by_static(point, unit.radius):
			continue
		var path: Array[Vector2] = engine.compute_smooth_path(unit.pos, point, unit.radius)
		if path.is_empty() or path.back().distance_to(point) > 0.25:
			continue
		var length: float = unit.pos.distance_to(path.front())
		for index in range(1, path.size()):
			length += path[index - 1].distance_to(path[index])
		if length < distance:
			distance = length
			best = point
	return best

func _step_seal(engine, campaign) -> void:
	var vent: Dictionary = _seal.vent
	var sealer: Dictionary = engine.units.get(_seal.tag, {})
	var altar: Dictionary = campaign._named(engine, vent.id)
	if sealer.is_empty() or altar.is_empty() or vent.status != "open" or engine.tick >= int(_seal.expires):
		_seal.clear()
		_next_event = engine.tick + [85, 65, 51, 42][_difficulty] * engine.TICK_RATE
		return
	if sealer.pos.distance_to(altar.pos) > 4.7:
		_seal.ready = 0
		return
	if _seal.ready == 0:
		_seal.ready = engine.tick + [15, 12, 10, 8][_difficulty] * engine.TICK_RATE
	elif engine.tick >= int(_seal.ready):
		vent.status = "sealed"
		_sealed += 1
		altar.name = "Sealed Verdant Vent"
		altar["campaign_vent_sealed"] = true
		sealer.orders.clear()
		sealer.path.clear()
		_seal.clear()
		_next_event = engine.tick + [85, 65, 51, 42][_difficulty] * engine.TICK_RATE
		engine.notice.emit(1, "The Concord sealed a vent.", "warn")

func drill_order(engine, source: Dictionary, command: String, target: Dictionary) -> bool:
	if source.owner != 1 or source.unit_type != "vault_drill":
		return false
	if command == "stop":
		_drill_target = 0
		return true
	if target.is_empty() or target.owner != 2 or target.unit_type == "vault_gate" or not engine.can_see_unit(1, target):
		return false
	_drill_target = target.tag
	return true

func _step_drill(engine, campaign) -> void:
	var drill: Dictionary = campaign._named(engine, DRILL_HULL)
	var gate: Dictionary = campaign._named(engine, "vault_seal")
	if drill.is_empty():
		campaign._finish(engine, false, "The Helix Drill was destroyed.")
		return
	if drill.owner == 0:
		if not campaign._squad_near(engine, drill.pos, 10.0):
			return
		drill.owner = 1
		engine.nav_dirty = true
		_next_raid = engine.tick + [88, 69, 57, 48][_difficulty] * engine.TICK_RATE
		engine.notice.emit(1, "Helix Drill online. Target visible enemies or let it cut the vault.", "info")
	if gate.is_empty():
		campaign._finish(engine, true, "The vault is open.")
		return
	if engine.tick < _next_beam:
		return
	_next_beam = engine.tick + engine.TICK_RATE
	var target: Dictionary = engine.units.get(_drill_target, {})
	if target.is_empty() or not engine.can_see_unit(1, target):
		_drill_target = 0
		target = gate
	drill.facing = (target.pos - drill.pos).angle()
	engine.ability_triggered.emit(drill, "vault_drill_beam", target.pos)
	if target.tag == gate.tag:
		gate.hp = maxf(0.0, gate.hp - 75.0)
		if gate.hp <= 0.0:
			engine._remove_destroyed_unit(gate)
			campaign._finish(engine, true, "The vault is open.")
	else:
		engine._apply_mutation_damage(target, 180.0)

func _send_raid(engine, campaign) -> void:
	var points: Array = _data.raid_origins
	var origin := _point(points[_raid % points.size()])
	var target := _point(_data.defend)
	if campaign.mission_index == campaign.DRILL:
		target = campaign._named(engine, DRILL_HULL).get("pos", target)
	var composition := {"rifleman": 2 + _difficulty + mini(1 + _difficulty, _raid),
		"breacher": 1 + mini(_difficulty, int(_raid / 3))} if campaign.mission_index == campaign.RAIL else {
		"sunblade": 2 + _difficulty + mini(5, _raid), "skirmisher": 1 + int((_raid + _difficulty) / 2)}
	if campaign.mission_index != campaign.RAIL and _raid >= 2:
		composition["prism_ray" if campaign.mission_index == campaign.GAS else "spire_walker"] = 1 + int(_difficulty == 3)
	engine.issue_command(campaign._spawn_force(engine, 2, origin, composition), "attack_move", target)
	_raid += 1
	_next_raid = engine.tick + [83, 70, 60, 50][_difficulty] * engine.TICK_RATE

func _collect_samples(engine, campaign) -> void:
	for index in _data.samples.size():
		if _samples.has(index):
			continue
		var entry: Dictionary = _data.samples[index]
		if not entry.get("guard", "").is_empty() and not campaign._named(engine, entry.guard).is_empty():
			continue
		if campaign._squad_near(engine, _point(entry.point), 4.2):
			_samples[index] = true
			engine.notice.emit(1, "Research sample recovered.", "info")

func research_rewards(campaign) -> Dictionary:
	return {"brood_research" if campaign.mission_index == campaign.RAIL else "concord_research": _samples.size()}

func objectives(engine, campaign) -> Dictionary:
	var result := {"primary": "", "note": "", "bonus": "Recover research samples", "bonus_done": _samples.size(),
		"bonus_total": _data.samples.size(), "extra": "", "extra_done": 0, "extra_total": 0, "markers": []}
	for index in _data.samples.size():
		if not _samples.has(index):
			var entry: Dictionary = _data.samples[index]
			var marker: Dictionary = campaign._marker(_point(entry.point), "Research sample", true)
			if campaign._named(engine, entry.get("guard", "")).is_empty():
				marker["pickup"] = "brood_sample" if campaign.mission_index == campaign.RAIL else "artifact"
			result.markers.append(marker)
	match campaign.mission_index:
		campaign.RAIL:
			result.primary = "Intercept Directorate freight (%d/%d)" % [_intercepted, TRAIN_GOAL]
			result.note = "Trains escaped %d/3" % _escaped
			result.extra = "Recover abandoned Rail Skimmers"
			result.extra_done = _salvaged.size()
			result.extra_total = _data.skimmers.size()
			for run in _trains:
				var train: Dictionary = engine.units.get(run.tag, {})
				if not train.is_empty():
					result.markers.append(campaign._marker(train.pos, "Freight train"))
			for id in _data.skimmers:
				var skimmer: Dictionary = campaign._named(engine, id)
				if not skimmer.is_empty() and skimmer.owner == 0:
					result.markers.append(campaign._marker(skimmer.pos, "Abandoned Rail Skimmer", true))
		campaign.GAS:
			result.primary = "Return gas canisters to a Colony Hub (%d/%d)" % [_delivered, GAS_GOAL]
			result.note = "Vents sealed %d/7" % _sealed
			if not _seal.is_empty() and int(_seal.ready) > 0:
				var threatened: Dictionary = campaign._named(engine, _seal.vent.id)
				if not threatened.is_empty() and engine.can_see_position(1, threatened.pos):
					var remaining := ceili(float(_seal.ready - engine.tick) / engine.TICK_RATE)
					result.note += "  •  Seal in %ds" % remaining
			for vent in _vents:
				var altar: Dictionary = campaign._named(engine, vent.id)
				if not altar.is_empty() and vent.status == "open":
					var label := "Sealing in progress" if not _seal.is_empty() and is_same(_seal.vent, vent) else "Verdant Vent"
					result.markers.append(campaign._marker(altar.pos, label))
		campaign.DRILL:
			var drill: Dictionary = campaign._named(engine, DRILL_HULL)
			var gate: Dictionary = campaign._named(engine, "vault_seal")
			result.primary = "Reach the Helix Laser Drill" if drill.get("owner", 0) == 0 else "Defend the drill until the vault opens"
			if not gate.is_empty() and drill.get("owner", 0) == 1:
				result.note = "Vault seal %d%% remaining" % ceili(100.0 * gate.hp / gate.max_hp)
			if not drill.is_empty():
				result.markers.append(campaign._marker(drill.pos, "Helix Laser Drill"))
			if not gate.is_empty() and drill.get("owner", 0) == 1:
				result.markers.append(campaign._marker(gate.pos, "Vault seal"))
	return result
