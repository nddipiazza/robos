extends RefCounted

const Waves = preload("res://scripts/engine/RTSQuarantineWaves.gd")
const SPAWNERS := ["blighted_home", "blighted_complex"]
const TARGETS := 144
const HUB := "settlement_117"
const BARRICADE := "barricade_17"
const CARRIERS := ["carrier_1110", "carrier_927"]
const FIRST_DAY := [120, 120, 90, 90]
const DAY := [480, 360, 240, 180]
const NIGHT := [300, 300, 270, 270]
const TIERS := [13, 30, 50, 70, 90, 110, 144]
const POPULATION := [[50, 50, 70, 90], [50, 50, 55, 70], [50, 50, 60, 80],
	[50, 50, 70, 90], [50, 50, 80, 100], [50, 50, 80, 100], [50, 50, 90, 125]]
const RIFLES := [[0, 0, 0, 0], [4, 4, 5, 6], [4, 4, 5, 6],
	[6, 6, 8, 10], [8, 8, 10, 12], [10, 10, 12, 14], [12, 12, 14, 18]]
const COOLDOWN := [[45, 45, 35, 30], [40, 40, 30, 25], [35, 35, 25, 20]]
const APPROACHES := [Vector2(96.825, 80.82), Vector2(155.595, 115.41), Vector2(70.095, 162.225)]
const OPENING := [Vector2(83.295, 63.735), Vector2(183.75, 112.305)]
const BREACH_APPROACH := Vector2(66.12, 168.195)
const LANDING := Vector2(115.5, 123)
const WORKSHOP_PADS := [Vector2(103.5, 118.5), Vector2(102, 117), Vector2(102, 121.5)]
const REINFORCEMENT_RINGS := [0.0, 3.4, 6.8, 10.2, 13.6, 17.0]
const INFECTED := ["blighted_colonist", "blighted_rifleman", "carapace_bulwark"]

var night := false
var night_number := 0
var cleared := 0
var carriers_killed := 0
var carriers_active := false
var _difficulty := 1
var _phase_end := 0
var _phase_start := 0
var _next_hatch := 0
var _next_carrier_attack := 0
var _next_reaction := 0
var _wave_index := 0
var _wave_tier := 0
var _opening_sent := false
var _reinforcements := false
var _next_vehicle_attempt := 0
var _next_landing_attempt := 0
var _workshop_delivered := false
var _breach_attempted := false
var _breach_attackers: Array[int] = []
var _sites := {}
var _spawners: Array[int] = []
var _out_in_sun: Dictionary = {}
var _night_routes: Dictionary = {}
var roadwarden_contract = preload("res://scripts/engine/RTSEvacuation.gd").new()
var workshop_definition: Dictionary

func begin(engine, campaign) -> void:
	_difficulty = campaign.DIFFICULTIES.find(campaign.difficulty)
	_phase_end = FIRST_DAY[_difficulty] * engine.TICK_RATE
	workshop_definition = engine.get_node("/root/RTSData").get_unit_def("workshop").duplicate(true)
	workshop_definition.trains = ["cinder_runner"]
	workshop_definition.abilities = ["train_cinder_runner", "rally", "lift"]
	workshop_definition.blurb = "Builds Cinder Runners for clearing the streets."
	for unit in engine.units.values():
		if unit.id.begins_with("infected_"):
			_sites[unit.tag] = true
			if unit.unit_type in SPAWNERS:
				_spawners.append(unit.tag)
		elif unit.id.begins_with("carrier_"):
			engine._set_burrowed(unit, true)
	campaign._speak(engine, "quarantine_start")

func step(engine, campaign) -> void:
	if not engine.units.values().any(func(unit): return unit.owner == 1 and unit.is_structure and unit.hp > 0.0):
		campaign._finish(engine, false, "The settlement was overrun.")
		return
	if cleared == TARGETS:
		campaign._finish(engine, true, "The settlement is clear of infestation.", "quarantine_complete")
		return
	if engine.tick >= _phase_end:
		_change_phase(engine, campaign)
	_update_carriers(engine, campaign)
	if not night:
		_burn_in_sunlight(engine)
		return
	if not _opening_sent:
		_opening_sent = true
		for point in OPENING:
			_send(engine, campaign, point, [14, 0, 0])
	var elapsed := int((engine.tick - _phase_start) / engine.TICK_RATE)
	if not _reinforcements and (night_number > 1 or seconds_left(engine) <= 80):
		_deliver_vehicles(engine, campaign)
	if _reinforcements and not _workshop_delivered and (night_number > 1 or seconds_left(engine) <= 77):
		_land_workshop(engine)
	if not _breach_attempted and (night_number >= 3 or cleared >= 50) and seconds_left(engine) <= 60:
		_breach_attempted = true
		var barricade: Dictionary = campaign._named(engine, BARRICADE)
		if not barricade.is_empty():
			var counts := [[6, 8, 10, 12][_difficulty], [10, 12, 14, 16][_difficulty], [0, 0, 1, 2][_difficulty]]
			_breach_attackers = _send(engine, campaign, BREACH_APPROACH, counts, barricade.pos)
	if not _breach_attackers.is_empty():
		_step_breach(engine, campaign)
	if engine.tick % engine.TICK_RATE == 0:
		_recover_stalled_infected(engine, campaign)
	var schedule: Array = Waves.TIERS[_wave_tier]
	while _wave_index < schedule.size() and int(schedule[_wave_index][0][_difficulty]) <= elapsed:
		var wave: Array = schedule[_wave_index]
		_wave_index += 1
		var lane: int = wave[1]
		if lane >= 3:
			lane = lane - 3 if not campaign._named(engine, BARRICADE).is_empty() else 2
		_send(engine, campaign, APPROACHES[lane], [wave[2][_difficulty], wave[3][_difficulty], wave[4][_difficulty]])
	if engine.tick >= _next_hatch:
		_hatch(engine, campaign)
		_next_hatch = engine.tick + _spawn_interval(engine.TICK_RATE)
	if carriers_active and engine.tick >= _next_carrier_attack:
		_next_carrier_attack = engine.tick + 20 * engine.TICK_RATE
		for id in CARRIERS:
			var carrier: Dictionary = campaign._named(engine, id)
			if not carrier.is_empty() and campaign._squad_near(engine, carrier.pos, 17.0):
				engine.spawn_unit("blighted_rifleman", 2, carrier.pos + Vector2(2.0, 0.0))

func _change_phase(engine, campaign) -> void:
	night = not night
	_phase_start = engine.tick
	if night:
		night_number += 1
		_phase_end = engine.tick + NIGHT[_difficulty] * engine.TICK_RATE
		_wave_tier = _tier()
		if _difficulty >= 2 and (_wave_tier > 0 or night_number > 1):
			_wave_tier = maxi(1, mini(_wave_tier, night_number - 1))
		_wave_index = 0
		_next_hatch = engine.tick + _spawn_interval(engine.TICK_RATE)
		_next_carrier_attack = engine.tick + 15 * engine.TICK_RATE
		campaign._speak(engine, "quarantine_night")
	else:
		_phase_end = engine.tick + DAY[_difficulty] * engine.TICK_RATE
		campaign._speak(engine, "quarantine_day")

func _update_carriers(engine, campaign) -> void:
	var active: bool = night and night_number >= 2 and engine.tick >= _phase_start + (15 if night_number == 2 else 10) * engine.TICK_RATE
	if active == carriers_active:
		return
	carriers_active = active
	for id in CARRIERS:
		var carrier: Dictionary = campaign._named(engine, id)
		if not carrier.is_empty():
			engine._set_burrowed(carrier, not carriers_active)

func _tier() -> int:
	for index in TIERS.size():
		if cleared <= TIERS[index]:
			return index
	return TIERS.size() - 1

func _spawn_interval(tick_rate: int) -> int:
	var tier := _tier()
	var group := 0 if tier < 3 else 1 if tier < 5 else 2
	return COOLDOWN[group][_difficulty] * tick_rate

func _spawn(engine, campaign, kind: String, point: Vector2) -> int:
	var unit: Dictionary = engine.spawn_unit(kind, 2, point)
	campaign._tune_enemy(unit)
	if _difficulty >= 2:
		unit["campaign_weapons"] = clampi(night_number - 1, 0, 2)
		unit["campaign_armor"] = clampi(night_number - 2, 0, 2 if _difficulty == 3 else 1)
	_out_in_sun[unit.tag] = true
	return unit.tag

func _send(engine, campaign, origin: Vector2, counts: Array, destination := Vector2.INF) -> Array[int]:
	var tags: Array[int] = []
	for kind in INFECTED.size():
		var unit_type: String = INFECTED[kind]
		var radius: float = engine.get_node("/root/RTSData").get_unit_def(unit_type).radius
		for index in int(counts[kind]):
			var slot := tags.size()
			var point := origin + Vector2(float(slot % 9 - 4), float(slot / 9)) * 1.1
			# Keep the formation on the same side of a cliff as the approach lane.
			if engine._is_point_blocked_by_static(point, radius) or not engine._has_clear_line_of_walk(origin, point, radius):
				point = engine._project_destination(origin, point, radius, false)
			if not engine._is_point_blocked_by_static(point, radius):
				tags.append(_spawn(engine, campaign, unit_type, point))
	var hub: Dictionary = campaign._named(engine, HUB)
	var target: Vector2 = destination if destination.is_finite() else hub.get("pos", LANDING)
	engine.issue_command(tags, "attack_move", target)
	if not destination.is_finite():
		for tag in tags:
			_night_routes[tag] = {"point": engine.units[tag].pos, "since": engine.tick}
	return tags

func _step_breach(engine, campaign) -> void:
	_breach_attackers = _breach_attackers.filter(func(tag): return engine.units.has(tag))
	var barricade: Dictionary = campaign._named(engine, BARRICADE)
	if barricade.is_empty():
		var hub: Dictionary = campaign._named(engine, HUB)
		engine.issue_command(_breach_attackers, "attack_move", hub.get("pos", LANDING))
		_breach_attackers.clear()
	elif engine.can_see_unit(2, barricade):
		for tag in _breach_attackers:
			var attacker: Dictionary = engine.units[tag]
			var order: Dictionary = {} if attacker.orders.is_empty() else attacker.orders.front()
			if order.get("target_tag", 0) != barricade.tag:
				engine.issue_command([tag], "attack_target", barricade.pos, barricade.tag)

func _hatch(engine, campaign) -> void:
	var available := _spawners.filter(func(tag): return engine.units.has(tag))
	if available.is_empty():
		return
	var tier := _tier()
	var ranged := mini(RIFLES[tier][_difficulty], available.size())
	var total := mini(POPULATION[tier][_difficulty] + ranged, available.size())
	var start: int = (int(engine.tick / engine.TICK_RATE) + night_number * 11) % available.size()
	var tags: Array[int] = []
	for index in total:
		var building: Dictionary = engine.units[available[(start + index) % available.size()]]
		var kind: String = INFECTED[int(index < ranged)]
		var point: Vector2 = engine._rally_spawn_position(building, LANDING, kind)
		if point.is_finite():
			tags.append(_spawn(engine, campaign, kind, point))
	var hub: Dictionary = campaign._named(engine, HUB)
	engine.issue_command(tags, "attack_move", hub.get("pos", LANDING))
	for tag in tags:
		_night_routes[tag] = {"point": engine.units[tag].pos, "since": engine.tick}

func _recover_stalled_infected(engine, campaign) -> void:
	var hub: Dictionary = campaign._named(engine, HUB)
	if hub.is_empty():
		return
	for tag in _night_routes:
		var unit: Dictionary = engine.units.get(tag, {})
		if unit.is_empty() or unit.pos.distance_to(hub.pos) <= 26.0:
			continue
		var entry: Dictionary = _night_routes[tag]
		if unit.pos.distance_squared_to(entry.point) > 4.0 or unit.attack_state != "idle":
			entry.point = unit.pos
			entry.since = engine.tick
			continue
		if engine.tick - entry.since < 12 * engine.TICK_RATE:
			continue
		entry.since = engine.tick
		var approach := Vector2.INF
		var shortest := INF
		for offset in [Vector2(0, -9), Vector2(9, -4), Vector2(-8, -5), Vector2(4, 9)]:
			var goal: Vector2 = hub.pos + offset
			var route: Array[Vector2] = engine.compute_smooth_path(unit.pos, goal, unit.radius)
			if route.is_empty() or route.back().distance_to(goal) > 1.5:
				continue
			var length: float = unit.pos.distance_to(route.front())
			for index in range(1, route.size()):
				length += route[index - 1].distance_to(route[index])
			if length < shortest:
				shortest = length
				approach = goal
		if approach.is_finite():
			engine.issue_command([tag], "attack_move", approach)

func _burn_in_sunlight(engine) -> void:
	if engine.tick % engine.TICK_RATE != 0:
		return
	for tag in _out_in_sun.keys():
		var unit: Dictionary = engine.units.get(tag, {})
		if unit.is_empty():
			_out_in_sun.erase(tag)
		else:
			unit.hp -= unit.max_hp / 5.0

func _deliver_vehicles(engine, campaign) -> void:
	if engine.tick < _next_vehicle_attempt:
		return
	_next_vehicle_attempt = engine.tick + engine.TICK_RATE
	var radius: float = engine.get_node("/root/RTSData").get_unit_def("cinder_runner").radius
	var count: int = [4, 4, 3, 3][_difficulty]
	var positions: Array[Vector2] = []
	for distance in REINFORCEMENT_RINGS:
		for direction in (1 if distance == 0.0 else 16):
			var point := LANDING + Vector2.from_angle(TAU * direction / 16.0) * float(distance)
			if point.distance_to(WORKSHOP_PADS[0]) < radius + 3.0:
				continue
			if engine._is_point_blocked_by_static(point, radius) or engine._ground_mobile_overlaps(point, radius):
				continue
			if positions.any(func(placed): return placed.distance_to(point) < radius * 2.0 + 0.2):
				continue
			positions.append(point)
			if positions.size() == count:
				break
		if positions.size() == count:
			break
	if positions.size() < count:
		return
	_reinforcements = true
	campaign.roster.units.append("cinder_runner")
	campaign.roster.structures.append("workshop")
	for point in positions:
		engine.spawn_unit("cinder_runner", 1, point)
	campaign._speak(engine, "quarantine_vehicles")

func _land_workshop(engine) -> void:
	if engine.tick < _next_landing_attempt:
		return
	_next_landing_attempt = engine.tick + engine.TICK_RATE
	for point in WORKSHOP_PADS:
		if engine.can_place_structure("workshop", point) and not engine._ground_mobile_overlaps(point, 3.0):
			engine.spawn_unit("workshop", 1, point, "quarantine_workshop")
			_workshop_delivered = true
			return

func on_death(engine, campaign, dead: Dictionary) -> void:
	_out_in_sun.erase(dead.tag)
	_night_routes.erase(dead.tag)
	if dead.id in CARRIERS:
		carriers_killed += 1
	if not _sites.erase(dead.tag):
		return
	cleared += 1
	for index in [2, 3, 4, 6][_difficulty]:
		var point: Vector2 = dead.pos + Vector2.from_angle(TAU * index / 6.0) * 1.4
		var broodling: Dictionary = engine.spawn_unit("broodling", 2, point)
		campaign._tune_enemy(broodling)

func on_building_hit(engine, campaign, building: Dictionary, attacker: Dictionary) -> void:
	if not night or engine.tick < _next_reaction or building.unit_type not in SPAWNERS:
		return
	_next_reaction = engine.tick + [16, 12, 8, 8][_difficulty] * engine.TICK_RATE
	var defenders := [2, 2, 3, 4] if cleared < 50 else [2, 3, 4, 5] if cleared < 100 else [3, 4, 2, 3]
	var arrivals: Array[Dictionary] = []
	var tags: Array[int] = []
	for index in defenders[_difficulty]:
		var point: Vector2 = engine._rally_spawn_position(building, attacker.pos, "blighted_rifleman", arrivals)
		if point.is_finite():
			var tag := _spawn(engine, campaign, "blighted_rifleman", point)
			tags.append(tag)
			arrivals.append(engine.units[tag])
	engine.issue_command(tags, "attack_move", attacker.pos)

func seconds_left(engine) -> int:
	return maxi(0, ceili(float(_phase_end - engine.tick) / engine.TICK_RATE))

func daylight(engine) -> float:
	var phase_remaining: float = float(_phase_end - engine.tick) / engine.TICK_RATE
	var transition := clampf(phase_remaining / 40.0, 0.0, 1.0)
	return 1.0 - transition if night else transition
