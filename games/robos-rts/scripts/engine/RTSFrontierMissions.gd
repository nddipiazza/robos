extends RefCounted

const REDSTONE_QUOTA := [7000, 8000, 8000, 8000]
const LAVA_INTERVAL := [300, 300, 270, 240]
const LAVA_DURATION := 25
const SHRINE_GUARDIANS := ["map_149", "map_150", "map_151", "map_972", "map_2021", "map_2022"]
const SHIELD_LINKS := ["map_2466", "map_2819", "map_2915"]
const COLONIES := ["map_1678", "map_2722", "map_1594", "map_159"]
const PURIFIER_CHARGE := [90, 90, 60, 45]

var workshop_definition: Dictionary
var hall_definition: Dictionary
var roadwarden_contract = preload("res://scripts/engine/RTSEvacuation.gd").new()
var _difficulty: int
var _caches: Array
var _relics: Array
var _artifact := Vector2.ZERO
var _claimed := {}
var _recovered := {}
var _rescued := {}
var _reserve: Array[int] = []
var _lava_at := 0
var lava_active := false
var lava_level := 0.0
var _warning := false
var _next_attack := 0
var _guardians_awake := false
var _purifier_exposed := false
var _colony := 0
var _charge_at := 0

func _init(engine, campaign, data: Dictionary) -> void:
	_difficulty = campaign.DIFFICULTIES.find(campaign.difficulty)
	_caches = data.get("caches", [])
	_relics = data.get("relics", [])
	var artifact: Array = data.get("artifact", [0.0, 0.0])
	_artifact = Vector2(artifact[0], artifact[1])
	workshop_definition = engine.get_node("/root/RTSData").get_unit_def("workshop").duplicate(true)
	workshop_definition.trains = ["cinder_runner"]
	workshop_definition.abilities = ["train_cinder_runner", "rally", "lift"]
	workshop_definition.blurb = "Builds Cinder Runners."
	hall_definition = engine.get_node("/root/RTSData").get_unit_def("muster_hall").duplicate(true)
	hall_definition.trains.append("ridge_scout")
	hall_definition.abilities.append("train_ridge_scout")
	match campaign.mission_index:
		campaign.REDSTONE:
			for unit in engine.units.values():
				if unit.owner == 0 and unit.unit_type in ["pioneer", "ridge_scout", "colony_hub"]:
					_reserve.append(unit.tag)
					campaign._reserve(engine, unit)
			_set_health(campaign._named(engine, "map_407"), [400.0, 750.0, 1000.0, 1500.0][_difficulty])
			var hub: Dictionary = campaign._named(engine, "map_312")
			lava_level = engine.get_elevation_at(hub.pos) - 0.8
			var scouts: Array = engine.units.values().filter(func(unit):
				return unit.owner == 0 and unit.unit_type == "ridge_scout" and unit.pos.distance_to(hub.pos) < 76.0)
			scouts.sort_custom(func(a, b): return a.pos.distance_squared_to(hub.pos) < b.pos.distance_squared_to(hub.pos))
			for unit in scouts.slice(0, 2):
				unit.owner = 1
				_reserve.erase(unit.tag)
				campaign._release_reserves(engine, [unit.tag])
			_lava_at = LAVA_INTERVAL[_difficulty] * engine.TICK_RATE
			_next_attack = 125 * engine.TICK_RATE
			campaign._speak(engine, "redstone_start")
		campaign.SHRINE:
			for id in SHRINE_GUARDIANS:
				var guardian: Dictionary = campaign._named(engine, id)
				if guardian.is_empty():
					continue
				_set_health(guardian, [300.0, 500.0, 750.0, 1000.0][_difficulty])
				guardian["campaign_shielded"] = true
				campaign._reserve(engine, guardian)
			var hall: Dictionary = campaign._named(engine, "map_100")
			var module: Dictionary = campaign._named(engine, "map_462")
			if not hall.is_empty() and not module.is_empty():
				engine._link_production_attachment(hall, module)
			_next_attack = 115 * engine.TICK_RATE
			campaign._speak(engine, "shrine_start")
		campaign.SANCTUARY:
			var purifier: Dictionary = campaign._named(engine, "map_765")
			if not purifier.is_empty():
				_set_health(purifier, [4000.0, 6000.0, 7000.0, 8000.0][_difficulty])
				purifier.name = "Concord Purifier"
				purifier["max_shields"] = 0.0
				purifier.shields = 0.0
				purifier.speed = 2.5
				purifier["campaign_shielded"] = true
				purifier.hold_fire = true
			_next_attack = 75 * engine.TICK_RATE
			campaign._speak(engine, "sanctuary_start")

func _set_health(unit: Dictionary, health: float) -> void:
	if not unit.is_empty():
		unit.max_hp = health
		unit.hp = health

func step(engine, campaign) -> void:
	if not engine.units.values().any(func(unit):
			return unit.owner == 1 and (unit.is_worker or unit.is_structure or not unit.weapon.is_empty())):
		campaign._finish(engine, false, "Your expedition was lost.")
		return
	for index in _caches.size():
		var cache: Array = _caches[index]
		var point := Vector2(cache[0][0], cache[0][1])
		if not _claimed.has(index) and campaign._squad_near(engine, point, 2.8):
			_claimed[index] = true
			var resource := "aether" if cache[1] else "crystal"
			engine.players[1][resource] += 100
			engine.notice.emit(1, "+100 %s" % resource, "info")
	match campaign.mission_index:
		campaign.REDSTONE: _step_redstone(engine, campaign)
		campaign.SHRINE: _step_shrine(engine, campaign)
		campaign.SANCTUARY: _step_sanctuary(engine, campaign)

func _step_redstone(engine, campaign) -> void:
	if engine.players[1].crystal >= REDSTONE_QUOTA[_difficulty]:
		campaign._finish(engine, true, "Crystal shipment secured.")
		return
	for tag in _reserve:
		if _rescued.has(tag) or not engine.units.has(tag):
			continue
		var unit: Dictionary = engine.units[tag]
		if engine.query_units_in_radius(unit.pos, 5.0).any(func(near):
				return near.owner == 1 and not near.is_structure and near.pos.distance_to(unit.pos) <= 5.0):
			unit.owner = 1
			_rescued[tag] = true
			campaign._release_reserves(engine, [tag])
			engine.nav_dirty = true
			if unit.is_worker:
				engine.issue_SmartHarvest(tag)
			elif unit.unit_type == "colony_hub":
				engine.set_starting_mineral_rally(unit)
	var seconds := _seconds_until(engine, _lava_at)
	if not lava_active and seconds <= 30 and not _warning:
		_warning = true
		campaign._speak(engine, "redstone_warning")
	if engine.tick >= _lava_at:
		lava_active = not lava_active
		_lava_at = engine.tick + (LAVA_DURATION if lava_active else LAVA_INTERVAL[_difficulty]) * engine.TICK_RATE
		if not lava_active:
			_warning = false
			campaign._speak(engine, "redstone_clear")
	if lava_active and engine.tick % engine.TICK_RATE == 0:
		for unit in engine.units.values().duplicate():
			if unit.flight_height <= 0.0 and not unit.has("embarked_in") and not unit.get("campaign_reserve", false) \
					and engine.get_elevation_at(unit.pos) < lava_level:
				engine._apply_mutation_damage(unit, 55.0, true)
	var base: Dictionary = campaign._named(engine, "map_312")
	if base.is_empty():
		for unit in engine.units.values():
			if unit.owner == 1 and unit.unit_type == "colony_hub":
				base = unit
				break
	if engine.tick >= _next_attack and not base.is_empty():
		_next_attack = engine.tick + [170, 140, 110, 90][_difficulty] * engine.TICK_RATE
		var nest: Dictionary = campaign._named(engine, "map_57")
		if not nest.is_empty():
			var tags := _spawn_attackers(engine, campaign, 2, Vector2(98, 119), {"skitterling": 3 + _difficulty})
			engine.issue_command(tags, "attack_move", base.pos)

func _spawn_attackers(engine, campaign, owner: int, origin: Vector2, roster: Dictionary) -> Array[int]:
	var tags: Array[int] = []
	for kind in roster:
		var radius: float = engine.get_node("/root/RTSData").get_unit_def(kind).radius
		for index in roster[kind]:
			var point := origin + Vector2(float(index % 5 - 2), float(index / 5)) * 2.1
			if engine._is_point_blocked_by_static(point, radius):
				point = engine._clamp_to_walkable(point, radius)
			if engine._is_point_blocked_by_static(point, radius):
				continue
			var unit: Dictionary = engine.spawn_unit(kind, owner, point)
			campaign._tune_enemy(unit)
			tags.append(unit.tag)
	return tags

func _step_shrine(engine, campaign) -> void:
	for index in _relics.size():
		if not _recovered.has(index) and campaign._squad_near(engine, Vector2(_relics[index][0], _relics[index][1]), 3.0):
			_recovered[index] = true
			engine.notice.emit(1, "Relic recovered. +1 Concord research.", "info")
	if not _guardians_awake and (campaign._squad_near(engine, _artifact, 20.0) or _brood_near(engine, _artifact, 20.0)):
		_guardians_awake = true
		for id in SHRINE_GUARDIANS:
			var guard: Dictionary = campaign._named(engine, id)
			if not guard.is_empty():
				guard.owner = 2
				guard.erase("campaign_scripted")
				guard.erase("campaign_reserve")
				guard.erase("campaign_shielded")
				engine.issue_command([guard.tag], "hold_position")
		engine._refresh_vision()
		campaign._speak(engine, "shrine_guardians")
	if _guardians_awake and not campaign._any_named_alive(engine, SHRINE_GUARDIANS):
		if campaign._squad_near(engine, _artifact, 4.0):
			campaign._finish(engine, true, "The shrine artifact is secured.")
		elif _brood_near(engine, _artifact, 4.0):
			campaign._finish(engine, false, "The Brood reached the artifact first.")
	if engine.tick >= _next_attack and not campaign._named(engine, "map_44").is_empty():
		_next_attack = engine.tick + [155, 130, 105, 85][_difficulty] * engine.TICK_RATE
		var tags := _spawn_attackers(engine, campaign, 3, Vector2(127, 82), {"skitterling": 4 + _difficulty, "blight_hurler": _difficulty})
		engine.issue_command(tags, "attack_move", _artifact)

func _brood_near(engine, point: Vector2, distance: float) -> bool:
	return engine.query_units_in_radius(point, distance).any(func(unit):
		return unit.owner == 3 and not unit.is_structure and unit.flight_height <= 0.0 and unit.pos.distance_to(point) <= distance)

func _step_sanctuary(engine, campaign) -> void:
	var purifier: Dictionary = campaign._named(engine, "map_765")
	if purifier.is_empty():
		campaign._finish(engine, true, "The colonies are safe.")
		return
	if not _purifier_exposed and not campaign._any_named_alive(engine, SHIELD_LINKS):
		_purifier_exposed = true
		purifier.erase("campaign_shielded")
		purifier.hold_fire = false
		campaign._speak(engine, "sanctuary_exposed")
	if engine.tick < _next_attack:
		return
	var target: Dictionary = campaign._named(engine, COLONIES[_colony]) if _colony < COLONIES.size() \
		else campaign._named(engine, "map_14")
	if target.is_empty():
		_colony += 1
		_charge_at = 0
		if _colony >= COLONIES.size() and campaign._named(engine, "map_14").is_empty():
			campaign._finish(engine, false, "The Purifier destroyed the settlement.")
		return
	if purifier.pos.distance_to(target.pos) > 5.0:
		if purifier.orders.is_empty():
			engine.issue_command([purifier.tag], "move", target.pos)
		return
	if _charge_at == 0:
		_charge_at = engine.tick + PURIFIER_CHARGE[_difficulty] * engine.TICK_RATE
		campaign._speak(engine, "sanctuary_targeted")
	elif engine.tick >= _charge_at:
		engine.ability_triggered.emit(purifier, "sanctuary_purification", target.pos)
		engine._apply_mutation_damage(target, target.hp + target.shields)
		_charge_at = 0
		_colony += 1
		_next_attack = engine.tick + 15 * engine.TICK_RATE

func _seconds_until(engine, when: int) -> int:
	return maxi(0, ceili(float(when - engine.tick) / engine.TICK_RATE))

func objectives(engine, campaign) -> Dictionary:
	var result := {"primary": "", "note": "", "bonus": "", "bonus_done": 0, "bonus_total": 0, "markers": []}
	var markers: Array = result.markers
	match campaign.mission_index:
		campaign.REDSTONE:
			result.primary = "Stockpile crystal  %d/%d" % [engine.players[1].crystal, REDSTONE_QUOTA[_difficulty]]
			result.bonus = "Slay the lava behemoth"
			result.bonus_total = 1
			var beast: Dictionary = campaign._named(engine, "map_407")
			result.bonus_done = int(beast.is_empty())
			if not beast.is_empty():
				markers.append(campaign._marker(beast.pos, "Lava behemoth", true))
			for tag in _reserve:
				if not _rescued.has(tag) and engine.units.has(tag) and engine.units[tag].unit_type == "colony_hub":
					markers.append(campaign._marker(engine.units[tag].pos, "Missing miners", true))
		campaign.SHRINE:
			result.primary = "Defeat the shrine guardians" if _guardians_awake and campaign._any_named_alive(engine, SHRINE_GUARDIANS) else "Reach the shrine artifact before the Brood"
			result.bonus = "Collect Concord relics"
			result.bonus_done = _recovered.size()
			result.bonus_total = _relics.size()
			markers.append(campaign._marker(_artifact, "Shrine artifact", false, "artifact"))
			for index in _relics.size():
				if not _recovered.has(index):
					markers.append(campaign._marker(Vector2(_relics[index][0], _relics[index][1]), "Concord relic", true, "artifact"))
		campaign.SANCTUARY:
			var broken := 0
			for id in SHIELD_LINKS:
				var link: Dictionary = campaign._named(engine, id)
				if link.is_empty():
					broken += 1
				else:
					markers.append(campaign._marker(link.pos, "Shield link"))
			result.primary = "Destroy the Concord Purifier" if _purifier_exposed else "Destroy the shield links  %d/3" % broken
			result.bonus = "Save the colony ships"
			result.bonus_done = COLONIES.filter(func(id): return not campaign._named(engine, id).is_empty()).size()
			result.bonus_total = COLONIES.size()
			var purifier: Dictionary = campaign._named(engine, "map_765")
			if not purifier.is_empty():
				markers.append(campaign._marker(purifier.pos, "Concord Purifier"))
	for index in _caches.size():
		if not _claimed.has(index):
			var entry: Array = _caches[index]
			var marker: Dictionary = campaign._marker(Vector2(entry[0][0], entry[0][1]), "Aether cache" if entry[1] else "Crystal cache", true, "cache")
			marker["pickup"] = "aether_cache" if entry[1] else "crystal_cache"
			markers.append(marker)
	return result

func telemetry(engine, campaign) -> Dictionary:
	match campaign.mission_index:
		campaign.REDSTONE:
			return {"lava_active": lava_active, "lava_in": _seconds_until(engine, _lava_at),
				"brood_research": 3 if campaign._named(engine, "map_407").is_empty() else 0}
		campaign.SHRINE:
			return {"concord_research": _recovered.size()}
		campaign.SANCTUARY:
			var survivors := COLONIES.filter(func(id): return not campaign._named(engine, id).is_empty()).size()
			return {"purifier_charge_in": _seconds_until(engine, _charge_at) if _charge_at > 0 else -1,
				"brood_research": mini(3, survivors)}
	return {}
