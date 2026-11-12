extends RefCounted

const Waves = preload("res://scripts/engine/RTSEvacuationWaves.gd")

# Converted from the settlement and convoy coordinates in THanson01.
const SETTLEMENT := Vector2(33.5, 158.3)
const INSERTION_ROAD := [Vector2(113.3, 150), Vector2(105.3, 150), Vector2(90, 151),
	Vector2(74, 154), Vector2(61, 155), Vector2(48, 154), SETTLEMENT]
const ROUTE := [Vector2(43.1, 153.1), Vector2(39.2, 149.5), Vector2(35.7, 145.6),
	Vector2(36.3, 139.6), Vector2(41.1, 134), Vector2(46.4, 126.7), Vector2(50.6, 120.1),
	Vector2(57.7, 114.6), Vector2(62.5, 110), Vector2(65.8, 106.4), Vector2(70.8, 101.2),
	Vector2(74.4, 96.2), Vector2(77.2, 91.3), Vector2(78.6, 85.1), Vector2(77.9, 79.8),
	Vector2(75.2, 73.4), Vector2(74.4, 67.2), Vector2(78.2, 61.9), Vector2(82.9, 57.3),
	Vector2(87.2, 53.3), Vector2(98.5, 41.3), Vector2(100, 40.1)]
# Interior points keep the truck centered through narrow bends and ramp mouths.
const ROAD_BENDS := {17: Vector2(75, 67), 20: Vector2(90, 50)}
const SPACEPORT := Vector2(100, 40.1)
const DOCK_ENTRANCE := Rect2(93, 36, 11, 11)
const SAMPLES := [Vector2(26.3, 100.3), Vector2(88.5, 112), Vector2(91.6, 57.3)]
const SAFE_QUOTA := 50
const LOSS_LIMIT := 20
const ROADWARDEN_COST := 250
const ROADWARDEN_SQUAD := 4
const ROADWARDEN_LIMIT := 3
const ROADWARDEN_COOLDOWN := 300
const MANIFESTS := [10, 10, 10, 12, 12, 16]
const DEPARTURE_DELAY := {"casual": 50, "normal": 50, "hard": 25, "brutal": 15}
const DIFFICULTY_INDEX := {"casual": 0, "normal": 1, "hard": 2, "brutal": 3}
const TUNNEL_INTERVALS := [12, 12, 9, 8]
const TUNNEL_HP := [200.0, 200.0, 350.0, 500.0]
const BROOD_BASES := ["evac_east_nest_1", "evac_east_nest_2", "evac_west_nest_1",
	"evac_west_nest_2", "evac_east_hive", "evac_west_hive", "evac_north_hive"]

var safe := 0
var lost := 0
var convoys_sent := 0
var truck_tag := 0
var roadwardens_called := 0
var attacks_sent := 0
var samples_collected: Array[int] = []
var _depart_at := 0
var _passengers := 0
var _encounter_tier := 0
var _upgraded_tier := 0
var _brutal_variant := false
var _waypoint := 0
var _bend_reached := false
var _ambush := 0
var _last_truck_pos := Vector2.ZERO
var _survivors: Array[int] = []
var _settlement_tags: Array[int] = []
var _roadwardens_ready := 0
var _attackers := {}
var _retreating := {}
var _tunnels: Array[Dictionary] = []

func begin(engine, campaign) -> void:
	for unit in engine.units.values():
		if unit.owner == 0:
			_settlement_tags.append(unit.tag)
			campaign._reserve(engine, unit)
	var hall: Dictionary = campaign._named(engine, "evac_muster")
	var module: Dictionary = campaign._named(engine, "evac_research")
	if not hall.is_empty() and not module.is_empty():
		engine._link_production_attachment(hall, module)
	engine._recompute_supplies()
	campaign._speak(engine, "evac_arrival")

func step(engine, campaign) -> void:
	var hub: Dictionary = campaign._named(engine, "settlement_hub")
	if hub.is_empty():
		campaign._finish(engine, false, "The settlement's Colony Hub was destroyed.")
		return
	_collect_samples(engine, campaign)
	_step_retreat(engine)
	_step_tunnels(engine, campaign)
	if campaign.stage == 0:
		if campaign._squad_near(engine, SETTLEMENT, 7.5):
			campaign.stage = 1
			for tag in _settlement_tags:
				if engine.units.has(tag):
					engine.units[tag].owner = 1
			campaign._release_reserves(engine, _settlement_tags)
			engine.nav_dirty = true
			for tag in _settlement_tags:
				if engine.units.get(tag, {}).get("is_worker", false):
					engine.issue_SmartHarvest(tag)
			_schedule_departure(engine, campaign)
			_roadwardens_ready = engine.tick + 60 * engine.TICK_RATE
			campaign._speak(engine, "evac_settlement")
		elif not engine.units.values().any(campaign._is_ground_squad):
			campaign._finish(engine, false, "The advance party was lost before it reached the settlement.")
		return
	if truck_tag != 0:
		_step_truck(engine, campaign)
	elif not _survivors.is_empty():
		_step_survivors(engine, campaign)
	elif engine.tick >= _depart_at:
		_depart(engine, campaign)
	if campaign.difficulty in ["hard", "brutal"] and lost >= LOSS_LIMIT:
		campaign._finish(engine, false, "Twenty colonists were lost on the road.")
	elif safe >= SAFE_QUOTA:
		campaign.stage = 2
		campaign._finish(engine, true, "%d colonists reached the colony ships." % safe, "evac_complete")

func call_roadwardens(engine, post: Dictionary) -> bool:
	if post.owner != 1 or post.unit_type != "contract_post" or post.build_progress < 1.0:
		return false
	var player: Dictionary = engine.players[1]
	var reason := ""
	if roadwardens_called >= ROADWARDEN_LIMIT:
		reason = "All three Roadwarden squads have deployed."
	elif engine.tick < _roadwardens_ready:
		reason = "Roadwardens available in %d seconds." % ceili(float(_roadwardens_ready - engine.tick) / engine.TICK_RATE)
	elif player.crystal < ROADWARDEN_COST:
		reason = "Not enough crystal."
	elif player.supply_used + ROADWARDEN_SQUAD > player.supply_cap:
		reason = "Four free supply is required."
	if not reason.is_empty():
		engine.notice.emit(1, reason, "error")
		return false
	var arrivals: Array[Dictionary] = []
	var exits: Array[Vector2] = []
	var rally: Vector2 = engine.default_rally_position(post)
	for _index in ROADWARDEN_SQUAD:
		var position: Vector2 = engine._rally_spawn_position(post, rally, "rifleman", arrivals)
		if not position.is_finite():
			engine.notice.emit(1, "Clear the area around the Contract Post.", "error")
			return false
		exits.append(position)
		arrivals.append({"pos": position, "radius": 0.85, "is_structure": false, "flight_height": 0.0})
	player.crystal -= ROADWARDEN_COST
	roadwardens_called += 1
	_roadwardens_ready = engine.tick + ROADWARDEN_COOLDOWN * engine.TICK_RATE
	for position in exits:
		var soldier: Dictionary = engine.spawn_unit("rifleman", 1, position)
		soldier.merge({"name": "Roadwarden", "hp": 65.0, "max_hp": 65.0}, true)
	engine.notice.emit(1, "Four Roadwardens deployed.", "info")
	return true

func _schedule_departure(engine, campaign) -> void:
	_depart_at = engine.tick + int(DEPARTURE_DELAY[campaign.difficulty]) * engine.TICK_RATE

func _depart(engine, campaign) -> void:
	_passengers = MANIFESTS[_encounter_tier]
	convoys_sent += 1
	if _encounter_tier == 5 and campaign.difficulty == "brutal":
		_brutal_variant = not _brutal_variant
	_waypoint = 0
	_bend_reached = false
	_ambush = 0
	_last_truck_pos = ROUTE.front()
	var truck: Dictionary = engine.spawn_unit("settlement_truck", 1, _last_truck_pos)
	truck_tag = truck.tag
	truck["campaign_scripted"] = true
	truck["campaign_road_vehicle"] = true
	if convoys_sent == 1:
		campaign._speak(engine, "evac_departure")

func _send_route(engine, unit: Dictionary, next: int) -> void:
	unit.erase("campaign_scripted")
	for index in range(next, ROUTE.size()):
		engine.issue_command([unit.tag], "move", ROUTE[index], 0, "", index != next)
	unit["campaign_scripted"] = true

func move_truck(engine) -> void:
	if truck_tag == 0:
		return
	var truck: Dictionary = engine.units.get(truck_tag, {})
	if truck.is_empty():
		return
	var next := mini(_waypoint + 1, ROUTE.size() - 1)
	var using_bend := not _bend_reached and ROAD_BENDS.has(next)
	var target: Vector2 = ROAD_BENDS[next] if using_bend else ROUTE[next]
	var heading: Vector2 = target - truck.pos
	if not heading.is_zero_approx():
		truck.facing = heading.angle()
	truck.pos = truck.pos.move_toward(target, truck.speed * engine.TICK_DT)
	_last_truck_pos = truck.pos
	if truck.pos == target:
		_bend_reached = using_bend
		if not using_bend:
			_waypoint = next

func _step_truck(engine, campaign) -> void:
	var truck: Dictionary = engine.units.get(truck_tag, {})
	if truck.is_empty():
		_spill_passengers(engine, campaign)
		return
	_dispatch_ambushes(engine, campaign)
	if DOCK_ENTRANCE.has_point(truck.pos):
		engine.units.erase(truck_tag)
		truck_tag = 0
		safe += _passengers
		_finish_convoy(engine, campaign)
		engine.notice.emit(1, "%d colonists reached the colony ships." % _passengers, "info")
		return

func _dispatch_ambushes(engine, campaign) -> void:
	var difficulty: int = DIFFICULTY_INDEX[campaign.difficulty]
	var convoy := _encounter_tier
	if convoy == 5 and difficulty == 3 and not _brutal_variant:
		convoy = 6
	var encounters: Array = Waves.CONVOYS[convoy]
	while _ambush < encounters.size():
		var wave: Array = encounters[_ambush]
		var checkpoint: Array = Waves.CHECKPOINTS[wave[0]]
		if _waypoint < checkpoint[0]:
			break
		_ambush += 1
		var composition := {}
		for type in wave[3]:
			var count: int = wave[3][type][difficulty]
			if count > 0:
				composition[type] = count
		if composition.is_empty():
			continue
		var origin: Vector2 = wave[2]
		var destination: Vector2 = ROUTE[mini(checkpoint[0] + 2, ROUTE.size() - 1)]
		if wave[1] in ["west", "east"]:
			var road: Vector2 = ROUTE[checkpoint[0]]
			var flank := (destination - road).normalized().orthogonal()
			origin = road + flank * (20.0 if wave[1] == "east" else -20.0) + (destination - road) * 0.5
		if wave[1] == "tunnel":
			if int(wave[4][difficulty]) <= 0:
				continue
			var opening: Vector2 = _wave_entry(engine, origin, destination, 1.2)
			var worm: Dictionary = engine.spawn_unit("brood_tunnel_worm", 2, opening)
			worm.max_hp = TUNNEL_HP[difficulty]
			worm.hp = worm.max_hp
			_tunnels.append({"tag": worm.tag, "point": opening, "target": destination,
				"units": composition, "packs": wave[4][difficulty], "at": engine.tick})
		else:
			_launch_wave(engine, campaign, origin, destination, composition)

func _wave_entry(engine, origin: Vector2, target: Vector2, radius: float) -> Vector2:
	# Some original entries used finer pathing than the one-unit terrain cells.
	# Stay on the authored side of the road and pick the nearest usable approach.
	var nearest := target
	var best := INF
	for step in range(17):
		var point := origin.lerp(target, float(step) / 16.0)
		if engine._is_point_blocked_by_static(point, radius):
			continue
		var path: Array[Vector2] = engine.compute_smooth_path(point, target, radius)
		if not path.is_empty() and path.back().distance_to(target) < 3.0:
			var distance := 0.0
			var previous := point
			for next in path:
				distance += previous.distance_to(next)
				previous = next
			if distance <= point.distance_to(target) * 2.0 + 7.0:
				return point
			if distance < best:
				best = distance
				nearest = point
	return nearest

func _launch_wave(engine, campaign, origin: Vector2, destination: Vector2, composition: Dictionary) -> void:
	var entry := _wave_entry(engine, origin, destination, 0.85)
	var tags: Array[int] = []
	for type in composition:
		for _index in int(composition[type]):
			var angle := float(tags.size()) * 2.39996323
			var point := entry + Vector2.from_angle(angle) * minf(4.0, sqrt(float(tags.size())))
			if engine._is_point_blocked_by_static(point, 0.9) or not engine._has_clear_line_of_walk(entry, point, 0.7):
				point = entry
			var enemy: Dictionary = engine.spawn_unit(type, 2, point)
			campaign._tune_enemy(enemy)
			_tune_brood(engine, enemy, campaign.difficulty)
			tags.append(enemy.tag)
			_attackers[enemy.tag] = entry
	engine.issue_command(tags, "attack_move", destination)
	attacks_sent += 1

func _step_tunnels(engine, campaign) -> void:
	var difficulty: int = DIFFICULTY_INDEX[campaign.difficulty]
	for index in range(_tunnels.size() - 1, -1, -1):
		var tunnel: Dictionary = _tunnels[index]
		if not engine.units.has(tunnel.tag):
			_tunnels.remove_at(index)
		elif tunnel.packs > 0 and engine.tick >= tunnel.at:
			_launch_wave(engine, campaign, tunnel.point, tunnel.target, tunnel.units)
			tunnel.packs -= 1
			tunnel.at = engine.tick + TUNNEL_INTERVALS[difficulty] * engine.TICK_RATE

func _finish_convoy(engine, campaign) -> void:
	_schedule_departure(engine, campaign)
	if safe >= (_encounter_tier + 1) * 8:
		_upgraded_tier = _encounter_tier + 1
		_encounter_tier = mini(_encounter_tier + 1, MANIFESTS.size() - 1)
	if campaign.difficulty in ["hard", "brutal"]:
		for enemy in engine.units.values():
			_tune_brood(engine, enemy, campaign.difficulty)
	for tunnel in _tunnels:
		if engine.units.has(tunnel.tag):
			engine._remove_destroyed_unit(engine.units[tunnel.tag])
	_tunnels.clear()
	for tag in _attackers:
		if engine.units.has(tag):
			engine.issue_command([tag], "move", _attackers[tag])
			_retreating[tag] = _attackers[tag]
	_attackers.clear()

func _step_retreat(engine) -> void:
	for tag in _retreating.keys():
		var unit: Dictionary = engine.units.get(tag, {})
		if unit.is_empty():
			_retreating.erase(tag)
		elif unit.pos.distance_squared_to(_retreating[tag]) <= 16.0 and not engine.can_see_position(1, unit.pos):
			engine.units.erase(tag)
			_retreating.erase(tag)

func _spill_passengers(engine, campaign) -> void:
	truck_tag = 0
	var escaped := floori(_passengers * 0.5)
	lost += _passengers - escaped
	for index in escaped:
		var offset := Vector2.from_angle(TAU * index / escaped) * 1.7
		var spawn: Vector2 = engine._clamp_to_walkable(_last_truck_pos + offset, 0.6, false, _last_truck_pos)
		var civilian: Dictionary = engine.spawn_unit("evacuee", 1, spawn)
		_send_route(engine, civilian, mini(_waypoint + 1, ROUTE.size() - 1))
		_survivors.append(civilian.tag)
	campaign._speak(engine, "evac_truck_lost")

func _step_survivors(engine, campaign) -> void:
	for index in range(_survivors.size() - 1, -1, -1):
		var tag := _survivors[index]
		var civilian: Dictionary = engine.units.get(tag, {})
		if civilian.is_empty():
			lost += 1
		elif DOCK_ENTRANCE.has_point(civilian.pos):
			safe += 1
			engine.units.erase(tag)
		else:
			if civilian.orders.is_empty():
				_send_route(engine, civilian, ROUTE.size() - 1)
			continue
		_survivors.remove_at(index)
	if _survivors.is_empty():
		_finish_convoy(engine, campaign)

func _collect_samples(engine, campaign) -> void:
	for index in SAMPLES.size():
		if index in samples_collected or not campaign._squad_near(engine, SAMPLES[index], 2.8):
			continue
		samples_collected.append(index)
		engine.notice.emit(1, "Brood sample recovered. +1 Brood research.", "info")

func _tune_brood(engine, unit: Dictionary, difficulty: String) -> void:
	if unit.owner != 2 or not difficulty in ["hard", "brutal"]:
		return
	var tier := _upgraded_tier
	var airborne: bool = unit.flight_height > 0.0
	var ranged: bool = engine.is_ranged_weapon(engine._active_weapon(unit))
	var first := 1 if ranged and not airborne else 2
	var second := 5 if airborne else 4
	unit["campaign_weapons"] = int(tier >= first) + int(tier >= second)
	unit["campaign_armor"] = int(tier >= 3) + int(tier >= 6 and difficulty == "brutal")

func objectives(engine, campaign) -> Dictionary:
	var markers: Array[Dictionary] = []
	var primary := "Reach the Bracken settlement"
	var note := ""
	if campaign.stage == 0:
		markers.append(campaign._marker(SETTLEMENT, "Bracken settlement"))
	else:
		primary = "Evacuate colonists  %d/%d" % [safe, SAFE_QUOTA]
		note = "Colonists lost  %d/%d" % [lost, LOSS_LIMIT] if campaign.difficulty in ["hard", "brutal"] else "Colonists lost  %d" % lost
		markers.append(campaign._marker(SPACEPORT, "Colony ships"))
		var truck: Dictionary = engine.units.get(truck_tag, {})
		if not truck.is_empty():
			markers.append(campaign._marker(truck.pos, "Convoy • %d colonists" % _passengers))
		for tag in _survivors:
			var civilian: Dictionary = engine.units.get(tag, {})
			if not civilian.is_empty():
				markers.append(campaign._marker(civilian.pos, "Colonist on foot"))
				break
	for index in SAMPLES.size():
		if index not in samples_collected:
			markers.append(campaign._marker(SAMPLES[index], "Brood sample", true, "brood_sample"))
	return {"primary": primary, "note": note, "markers": markers}
