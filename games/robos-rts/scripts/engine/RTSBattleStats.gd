extends RefCounted

# Battle-only telemetry. Dead-unit records survive removal from the live sim.
var active := false
var records: Dictionary = {}
var timeline: Array = []
var start_tick := 0
var bin_tick := 0
var last_sample_tick := 0
var bin_damage := {1: 0.0, 2: 0.0}

func reset() -> void:
	active = false
	records.clear()
	timeline.clear()
	bin_damage = {1: 0.0, 2: 0.0}

func begin(units: Dictionary, at_tick: int) -> void:
	reset()
	start_tick = at_tick
	bin_tick = at_tick
	last_sample_tick = at_tick
	active = true
	for u in units.values():
		var def = RTSData.get_unit_def(u.unit_type)
		records[u.tag] = {"tag": u.tag, "name": u.name, "unit_type": u.unit_type, "owner": u.owner,
			"crystal": def.get("crystal_cost", 0), "aether": def.get("aether_cost", 0), "supply": def.get("supply_cost", 0),
			"initial_hp": u.hp, "initial_shields": u.shields, "hp": u.hp, "shields": u.shields,
			"kills": 0, "shots": 0, "attack_starts": 0, "windup_cancels": 0, "recovery_cancels": 0,
			"hp_damage": 0.0, "shield_damage": 0.0, "damage_taken": 0.0, "overkill": 0.0,
			"armor_blocked": 0.0, "direct_damage": 0.0, "splash_damage": 0.0,
			"hp_healed": 0.0, "shields_regenerated": 0.0, "self_damage": 0.0, "surge_uses": 0,
			"crystal_destroyed": 0, "aether_destroyed": 0, "supply_destroyed": 0,
			"distance": 0.0, "moving_seconds": 0.0, "windup_seconds": 0.0, "recovery_seconds": 0.0,
			"first_shot_tick": -1, "last_shot_tick": -1, "death_tick": -1, "alive": true,
			"last_position": u.pos}

func count(tag: int, metric: String, amount: float = 1.0) -> void:
	if active and records.has(tag):
		records[tag][metric] += amount

func shot(unit: Dictionary, at_tick: int) -> void:
	if not active or not records.has(unit.tag):
		return
	var r = records[unit.tag]
	r.shots += 1
	if r.first_shot_tick < 0:
		r.first_shot_tick = at_tick
	r.last_shot_tick = at_tick

func restored(unit: Dictionary, hp: float, shields: float) -> void:
	count(unit.tag, "hp_healed", hp)
	count(unit.tag, "shields_regenerated", shields)

func damage(attacker: Dictionary, target: Dictionary, hp: float, shields: float, overkill: float, blocked: float, splash: bool, at_tick: int) -> void:
	if not active or not records.has(attacker.tag) or not records.has(target.tag):
		return
	var a = records[attacker.tag]
	var t = records[target.tag]
	a.hp_damage += hp
	a.shield_damage += shields
	a.overkill += overkill
	a.armor_blocked += blocked
	a["splash_damage" if splash else "direct_damage"] += hp + shields
	t.damage_taken += hp + shields
	t.hp = target.hp
	t.shields = target.shields
	bin_damage[attacker.owner] += hp + shields
	if target.hp <= 0 and t.alive:
		t.alive = false
		t.death_tick = at_tick
		a.kills += 1
		a.crystal_destroyed += t.crystal
		a.aether_destroyed += t.aether
		a.supply_destroyed += t.supply

func sample(units: Dictionary, at_tick: int) -> void:
	if not active or at_tick <= last_sample_tick:
		return
	last_sample_tick = at_tick
	for u in units.values():
		if not records.has(u.tag):
			continue
		var r = records[u.tag]
		var distance: float = u.pos.distance_to(r.last_position)
		r.distance += distance
		r.last_position = u.pos
		if distance > 0.0001:
			r.moving_seconds += 1.0 / 64.0
		if u.attack_state == "windup":
			r.windup_seconds += 1.0 / 64.0
		elif u.attack_state == "backswing":
			r.recovery_seconds += 1.0 / 64.0
		r.hp = u.hp
		r.shields = u.shields
	if at_tick - bin_tick >= 64:
		_close_bin(at_tick)

func _close_bin(at_tick: int) -> void:
	if at_tick <= bin_tick:
		return
	var duration = float(at_tick - bin_tick) / 64.0
	timeline.append({"from": float(bin_tick - start_tick) / 64.0, "to": float(at_tick - start_tick) / 64.0,
		"blue_dps": bin_damage[1] / duration, "red_dps": bin_damage[2] / duration})
	bin_damage = {1: 0.0, 2: 0.0}
	bin_tick = at_tick

func finish(units: Dictionary, at_tick: int, seed_value: int) -> Dictionary:
	sample(units, at_tick)
	_close_bin(at_tick)
	active = false
	var duration = float(at_tick - start_tick) / 64.0
	var sides: Dictionary = {}
	var roster: Array = []
	for pid in [1, 2]:
		var side = {"started": 0, "survivors": 0, "lost": 0, "starting_crystal": 0, "starting_aether": 0,
			"crystal_lost": 0, "aether_lost": 0, "starting_supply": 0, "surviving_supply": 0,
			"initial_hp": 0.0, "initial_shields": 0.0, "hp": 0.0, "shields": 0.0,
			"peak_dps": 0.0, "peak_from": 0.0, "peak_to": 0.0, "first_shot_seconds": -1.0,
			"mvp": {}, "lowest_damage_unit": {}, "types": {}}
		for key in ["kills", "shots", "attack_starts", "windup_cancels", "recovery_cancels", "hp_damage", "shield_damage", "damage_taken", "overkill", "armor_blocked", "direct_damage", "splash_damage", "hp_healed", "shields_regenerated", "self_damage", "surge_uses", "crystal_destroyed", "aether_destroyed", "supply_destroyed", "distance", "moving_seconds", "windup_seconds", "recovery_seconds"]:
			side[key] = 0.0
		for original in records.values():
			if original.owner != pid:
				continue
			var r = original.duplicate(true)
			r.erase("last_position")
			r.damage = r.hp_damage + r.shield_damage
			r.alive_seconds = float((r.death_tick if r.death_tick >= 0 else at_tick) - start_tick) / 64.0
			r.dps = r.damage / maxf(1.0 / 64.0, r.alive_seconds)
			r.mean_shot_interval = float(r.last_shot_tick - r.first_shot_tick) / 64.0 / float(r.shots - 1) if r.shots > 1 else null
			roster.append(r)
			side.started += 1
			side.survivors += int(r.alive)
			side.lost += int(not r.alive)
			side.starting_crystal += r.crystal
			side.starting_aether += r.aether
			side.starting_supply += r.supply
			side.surviving_supply += r.supply if r.alive else 0
			side.crystal_lost += 0 if r.alive else r.crystal
			side.aether_lost += 0 if r.alive else r.aether
			for key in r:
				if side.has(key) and key not in ["kills", "shots"] and typeof(side[key]) == TYPE_FLOAT and typeof(r[key]) in [TYPE_FLOAT, TYPE_INT]:
					side[key] += r[key]
			side.kills += r.kills
			side.shots += r.shots
			if r.first_shot_tick >= 0:
				var first = float(r.first_shot_tick - start_tick) / 64.0
				if side.first_shot_seconds < 0 or first < side.first_shot_seconds:
					side.first_shot_seconds = first
			if side.mvp.is_empty() or r.kills > side.mvp.kills or (r.kills == side.mvp.kills and r.damage > side.mvp.damage):
				side.mvp = r
			if side.lowest_damage_unit.is_empty() or r.damage < side.lowest_damage_unit.damage:
				side.lowest_damage_unit = r
			if not side.types.has(r.unit_type):
				side.types[r.unit_type] = {"name": r.name, "kills": 0, "damage": 0.0, "cost": 0, "lost": 0, "count": 0}
			var type = side.types[r.unit_type]
			type.kills += r.kills
			type.damage += r.damage
			type.cost += r.crystal + r.aether
			type.lost += int(not r.alive)
			type.count += 1
		for bin in timeline:
			var dps: float = bin["blue_dps" if pid == 1 else "red_dps"]
			if dps > side.peak_dps:
				side.peak_dps = dps
				side.peak_from = bin.from
				side.peak_to = bin.to
		side.damage = side.hp_damage + side.shield_damage
		side.dps = side.damage / maxf(duration, 1.0 / 64.0)
		side.damage_per_shot = side.damage / side.shots if side.shots > 0 else 0.0
		side.survival_percent = 100.0 * side.survivors / maxf(1.0, side.started)
		side.kill_loss_ratio = side.kills / side.lost if side.lost > 0 else null
		side.surviving_crystal = side.starting_crystal - side.crystal_lost
		side.surviving_aether = side.starting_aether - side.aether_lost
		side.best_type = {}
		side.least_effective_type = {}
		for type in side.types.values():
			type.kills_per_100_resources = 100.0 * type.kills / maxf(1.0, type.cost)
			type.damage_per_100_resources = 100.0 * type.damage / maxf(1.0, type.cost)
			if side.best_type.is_empty() or type.kills_per_100_resources > side.best_type.kills_per_100_resources:
				side.best_type = type
			if side.least_effective_type.is_empty() or type.damage_per_100_resources < side.least_effective_type.damage_per_100_resources:
				side.least_effective_type = type
		var lost_value = side.crystal_lost + side.aether_lost
		side.trade_ratio = float(side.crystal_destroyed + side.aether_destroyed) / lost_value if lost_value > 0 else null
		side.overkill_percent = 100.0 * side.overkill / (side.damage + side.overkill) if side.damage + side.overkill > 0 else 0.0
		sides[str(pid)] = side
	return {"schema_version": 1, "seed": seed_value, "ticks": at_tick - start_tick, "duration": duration,
		"sides": sides, "units": roster, "timeline": timeline,
		"definitions": {"damage": "Actual HP and shields removed; excludes overkill and armor prevention.",
			"peak_dps": "Highest fixed one-second bucket; final partial bucket divided by its actual duration.",
			"trade_ratio": "Crystal plus aether destroyed / lost, equal weighting; null means no losses.",
			"mvp": "Most kills, with effective damage as the tie-breaker.",
			"moving_seconds": "Time with measured displacement, including allied pushes and teleport displacement."}}
