extends RefCounted

const ACTIVE := {
	"barrier": ["Barrier", "Shield after the\nfirst hit"],
	"black_death": ["Black Death", "Dead carriers\nspread plague"],
	"mineral_shields": ["Mineral Shields", "Shields block\ncrystal mining"],
	"time_warp": ["Time Warp", "Fields slow moves\nand attacks"],
	"going_nuclear": ["Going Nuclear", "Incoming\norbital strikes"],
	"speed_freaks": ["Speed Freaks", "Enemies move\n50% faster"],
	"long_range": ["Long Range", "Enemy guns\nreach farther"],
	"concussive_attacks": ["Concussive Attacks", "Enemy hits\nslow your units"],
	"just_die": ["Just Die!", "Each enemy\nrevives once"],
	"walking_infested": ["Walking Infested", "Dead enemies\nspawn Broodlings"],
	"self_destruction": ["Self Destruction", "Enemies explode\nafter death"],
	"scorched_earth": ["Scorched Earth", "Dead enemies\nleave fires"],
	"life_leech": ["Life Leech", "Enemies heal\nby dealing damage"],
	"shortsighted": ["Shortsighted", "Your forces see\nless of the map"],
}

const UPCOMING := [
	"Afraid of the Dark", "Aggressive Deployment", "Alien Incubation", "Avenger",
	"Blizzard", "Boom Bots", "Chaos Studios", "Cold Is the Void", "Darkness", "Diffusion",
	"Double Edged", "Eminent Domain", "Evasive Maneuvers", "Fatal Attraction", "Fear",
	"Fireworks", "Fowl Play", "Gift Exchange", "Hardened Will", "Heroes from the Storm", "Inspiration", "Kill Bots",
	"Laser Drill", "Lava Burst", "Magneficent", "Micro Transactions", "Missile Command",
	"Moment of Silence", "Mutually Assured Destruction", "Orbital Strike", "Outbreak",
	"Photon Overload", "Polarity", "Power Overwhelming", "Propagators", "Purifier Beam",
	"Random Yet Memorable", "Sharing Is Caring", "Slim Pickings", "Snow Brawl", "Temporal Field",
	"Transmutation", "Trick or Treat", "Twister", "Vertigo", "Void Reanimators",
	"Void Rifts", "We Move Unseen",
]

const HAZARDS := {
	"time_warp": [8.0, 2, 10],
	"going_nuclear": [10.0, 5, 0],
	"self_destruction": [4.0, 2, 0],
	"scorched_earth": [4.0, 0, 12],
}

var ids: Array
var zones: Array[Dictionary] = []
var _rng := RandomNumberGenerator.new()
var _next_events := {}
var _deaths: Array[Dictionary] = []
var _shielded_deposits := {}
var _plagued := {}

func _init(engine, enabled: Array) -> void:
	ids = enabled.duplicate()
	_rng.seed = engine.rng_seed ^ 0x316f9e8a
	for id in ["time_warp", "going_nuclear", "mineral_shields"]:
		if has(id):
			_next_events[id] = engine.tick + (18 if id == "mineral_shields" else 25) * engine.TICK_RATE
	for unit in engine.units.values():
		on_spawn(unit)

func has(id: String) -> bool:
	return id in ids

static func enemy(unit: Dictionary) -> bool:
	return unit.owner == 2 and not unit.is_structure and not unit.get("nonblocking", false)

static func protected_unit(unit: Dictionary) -> bool:
	return (unit.get("campaign_scripted", false) or unit.get("campaign_stranded", false)
		or unit.get("nonblocking", false) or unit.has("embarked_in"))

func on_spawn(unit: Dictionary) -> void:
	if unit.owner == 1 and has("shortsighted"):
		unit.sight_range = minf(unit.sight_range, maxf(5.0, unit.sight_range * 0.55))
	if has("black_death") and enemy(unit) and int(unit.tag) % 3 == 0:
		unit["mutation_carrier"] = true

func absorb_hit(unit: Dictionary, damage: float, tick: int, rate: int) -> float:
	if not has("barrier") or not enemy(unit):
		return damage
	if not unit.has("mutation_barrier_until"):
		unit["mutation_barrier_until"] = tick + 5 * rate
		unit["mutation_barrier_hp"] = 100.0
		return damage
	if tick >= int(unit.mutation_barrier_until):
		return damage
	var absorbed := minf(damage, unit.mutation_barrier_hp)
	unit.mutation_barrier_hp -= absorbed
	return damage - absorbed

func on_hit(attacker: Dictionary, target: Dictionary, dealt: float) -> void:
	if not enemy(attacker) or target.owner != 1:
		return
	if has("concussive_attacks") and not target.is_structure and not protected_unit(target):
		target.slow_timer = maxf(target.slow_timer, 2.0)
	if has("life_leech") and attacker.hp > 0.0:
		attacker.hp = minf(attacker.max_hp, attacker.hp + dealt * 0.5)

func revive(unit: Dictionary) -> bool:
	if not has("just_die") or not enemy(unit) or unit.get("mutation_revived", false):
		return false
	unit["mutation_revived"] = true
	unit.hp = unit.max_hp
	unit.shields = unit.max_shields
	return true

func on_death(unit: Dictionary) -> void:
	var infected: bool = _plagued.erase(unit.tag)
	if unit.get("mutation_spawn", false) or protected_unit(unit):
		return
	var hostile := enemy(unit)
	if hostile or infected:
		_deaths.append({"pos": unit.pos, "hostile": hostile,
			"spread": infected or unit.get("mutation_carrier", false),
			"large": unit.radius >= 2.0, "type": unit.unit_type})

func mineral_shield_blocks(engine, deposit: int) -> bool:
	return engine.units.has(_shielded_deposits.get(deposit, 0))

func can_see_zone(engine, viewer: int, zone: Dictionary) -> bool:
	if engine.can_see_position(viewer, zone.pos):
		return true
	if zone.kind != "going_nuclear":
		return false
	var range_squared: float = (zone.radius + 2.0) ** 2
	return engine.query_units_in_radius(zone.pos, zone.radius + 2.0).any(func(unit):
		return unit.owner == viewer and not protected_unit(unit) and unit.pos.distance_squared_to(zone.pos) <= range_squared)

func step(engine) -> void:
	if not _deaths.is_empty():
		# Damage can enqueue another death. Process those on the next tick.
		var deaths := _deaths
		_deaths = []
		for dead in deaths:
			_process_death(engine, dead)
	for id in _next_events:
		if engine.tick >= _next_events[id]:
			_run_event(engine, id)
	for index in range(zones.size() - 1, -1, -1):
		var zone := zones[index]
		if engine.tick < zone.impact:
			continue
		if zone.kind == "going_nuclear" or zone.kind == "self_destruction":
			zones.remove_at(index)
			_hit_zone(engine, zone, 250.0 if zone.kind == "going_nuclear" else 40.0)
		elif engine.tick >= zone.ends:
			zones.remove_at(index)
		elif zone.kind == "scorched_earth" and engine.tick % engine.TICK_RATE == 0:
			_hit_zone(engine, zone, 6.0)
	if not _plagued.is_empty() and engine.tick % engine.TICK_RATE == 0:
		for tag in _plagued.keys():
			var unit: Dictionary = engine.units.get(tag, {})
			if not unit.is_empty():
				engine._apply_mutation_damage(unit, unit.max_hp * 0.02, true)

func _process_death(engine, dead: Dictionary) -> void:
	if dead.spread:
		for unit in engine.query_units_in_radius(dead.pos, 7.0):
			if unit.owner == 1 and unit.hp > 0.0 and not unit.is_structure and not protected_unit(unit) \
					and dead.pos.distance_squared_to(unit.pos) <= 49.0:
				_plagued[unit.tag] = true
				unit["mutation_plagued"] = true
	if not dead.hostile:
		return
	if has("self_destruction"):
		_add_zone(engine, "self_destruction", dead.pos)
	if has("scorched_earth"):
		_add_zone(engine, "scorched_earth", dead.pos)
	if has("walking_infested") and dead.type != "broodling":
		for index in (2 if dead.large else 1):
			var point: Vector2 = engine._clamp_to_walkable(dead.pos + Vector2(index * 1.6, 0), 0.6)
			var broodling: Dictionary = engine.spawn_unit("broodling", 2, point)
			broodling["mutation_spawn"] = true
			broodling["expires_tick"] = engine.tick + 18 * engine.TICK_RATE

func _run_event(engine, id: String) -> void:
	var interval := 38 if id == "going_nuclear" else 27 if id == "time_warp" else 50
	_next_events[id] = engine.tick + interval * engine.TICK_RATE
	if id == "mineral_shields":
		_shield_minerals(engine)
		return
	var troops: Array = engine.units.values().filter(func(unit):
		return unit.owner == 1 and not unit.is_structure and not unit.is_worker and not protected_unit(unit))
	var point := Vector2(_rng.randf_range(10.0, engine.map_width - 10.0), _rng.randf_range(10.0, engine.map_height - 10.0))
	if not troops.is_empty() and (id == "time_warp" or _rng.randf() < 0.65):
		var unit: Dictionary = troops[_rng.randi_range(0, troops.size() - 1)]
		point = unit.pos + Vector2.from_angle(_rng.randf_range(0.0, TAU)) * _rng.randf_range(2.0, 9.0)
	var radius: float = HAZARDS[id][0]
	point = point.clamp(Vector2.ONE * radius, Vector2(engine.map_width, engine.map_height) - Vector2.ONE * radius)
	if id == "going_nuclear":
		# Evacuation hubs and other immovable mission objectives need a safe footprint.
		for unit in engine.units.values():
			if unit.owner == 1 and unit.is_structure and unit.pos.distance_to(point) < radius + 4.0:
				_next_events[id] = engine.tick + 4 * engine.TICK_RATE
				return
	_add_zone(engine, id, point)

func _shield_minerals(engine) -> void:
	var deposits: Array = engine.resources.values().filter(func(deposit):
		return (deposit.resource_type == "crystal_field" and engine.deposit_present(deposit)
			and engine.can_see_position(1, deposit.pos) and not mineral_shield_blocks(engine, deposit.tag)))
	for index in mini(2, deposits.size()):
		var deposit: Dictionary = deposits.pop_at(_rng.randi_range(0, deposits.size() - 1))
		var shield: Dictionary = engine.spawn_unit("mineral_shield", 0, deposit.pos)
		shield["expires_tick"] = engine.tick + 35 * engine.TICK_RATE
		_shielded_deposits[deposit.tag] = shield.tag

func _add_zone(engine, kind: String, point: Vector2) -> void:
	var spec: Array = HAZARDS[kind]
	var impact: int = engine.tick + int(spec[1]) * engine.TICK_RATE
	var ends: int = impact + int(spec[2]) * engine.TICK_RATE
	var zone := {"kind": kind, "pos": point, "radius": spec[0], "impact": impact, "ends": ends}
	zones.append(zone)
	if kind == "time_warp":
		engine.time_warps.append({"owner": 2, "pos": point, "radius": spec[0], "activates": impact, "ends": ends})
	elif kind == "going_nuclear" and can_see_zone(engine, 1, zone):
		engine.ability_triggered.emit({}, "mutation_nuclear_warning", point)

func _hit_zone(engine, zone: Dictionary, damage: float) -> void:
	var hits: Array = engine.query_units_in_radius(zone.pos, zone.radius)
	hits.sort_custom(func(a, b): return a.tag < b.tag)
	for target in hits:
		if target.owner != 1 or target.hp <= 0.0 or not engine.units.has(target.tag) or protected_unit(target):
			continue
		if zone.kind == "scorched_earth" and target.flight_height > 0.0:
			continue
		var distance: float = zone.pos.distance_to(target.pos)
		if distance <= zone.radius:
			var amount := damage * 0.5 if zone.kind == "going_nuclear" and distance > zone.radius * 0.55 else damage
			engine._apply_mutation_damage(target, amount)
	if zone.kind in ["going_nuclear", "self_destruction"]:
		var effect := "mutation_nuclear_impact" if zone.kind == "going_nuclear" else "mutation_death_impact"
		engine.ability_triggered.emit({}, effect, zone.pos)
