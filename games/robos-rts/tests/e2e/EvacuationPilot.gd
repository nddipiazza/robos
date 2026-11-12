extends RefCounted

const Mission = preload("res://scripts/engine/RTSEvacuation.gd")
const BUNKERS := ["road_bunker_west", "road_bunker_north"]
const SILOS := [Vector2(30, 147), Vector2(25, 135), Vector2(32, 137),
	Vector2(27, 133), Vector2(25, 128), Vector2(28, 128), Vector2(30, 129),
	Vector2(34, 127), Vector2(35, 123), Vector2(39, 124), Vector2(44, 131),
	Vector2(47, 136), Vector2(47, 146), Vector2(54, 142), Vector2(57, 139)]
const HALLS := [Vector2(60, 160), Vector2(31, 133), Vector2(35, 131), Vector2(28, 128), Vector2(32, 127)]
const ARMORIES := [Vector2(59, 132), Vector2(25, 135), Vector2(29, 136), Vector2(32, 128), Vector2(34, 129)]
const INFANTRY := ["rifleman", "torchguard", "triage_specialist"]
const MAX_SUPPLY := 200
const SUPPLY_BUFFER := 24
const MAX_HALLS := 7

var _guards := {}
var _repairers := {}
var _convoy_repairer := 0
var _building := {}
var _rejected_sites := {}

func play(engine) -> void:
	var campaign = engine.campaign
	var convoy = campaign.evacuation
	var forces: Array = engine.units.values().filter(func(unit):
		return unit.owner == 1 and unit.unit_type in INFANTRY)
	var workers: Array = engine.units.values().filter(func(unit):
		return unit.owner == 1 and unit.is_worker)
	_assign_strongpoints(engine, campaign, forces, workers)
	_manage_production(engine, campaign, forces, workers)
	_escort(engine, convoy, forces, workers)

func _manage_production(engine, campaign, troops: Array, workers: Array) -> void:
	var player: Dictionary = engine.players[1]
	var hub: Dictionary = campaign._named(engine, "settlement_hub")
	var gas: Dictionary = campaign._named(engine, "settlement_tap")
	var saturation: Dictionary = engine.worker_saturation(1)
	var crystal_slots: int = saturation.get(hub.get("tag", 0), {}).get("ideal", 0)
	var gas_slots: int = saturation.get(gas.get("tag", 0), {}).get("ideal", 0)
	# Keep spare workers for construction, both bunkers, and the convoy.
	var worker_target := crystal_slots + gas_slots + 5
	var available: Array = workers.filter(func(unit):
		return not unit.tag in _repairers.values() and unit.tag != _convoy_repairer \
			and (unit.orders.is_empty() or unit.orders.front().type == "harvest"))
	var halls := _structures(engine, "muster_hall")
	var pending_supply := 0
	for silo in _structures(engine, "silo"):
		if silo.build_progress < 1.0:
			pending_supply += engine.supply_from(silo)
	var projected_supply: int = mini(MAX_SUPPLY, player.supply_cap + pending_supply)
	var supply_buffer := clampi(8 + int(player.supply_used) / 2, 12, SUPPLY_BUFFER)
	if projected_supply < MAX_SUPPLY and projected_supply - player.supply_used < supply_buffer:
		_build(engine, available, "silo", SILOS)
	var hall_target := clampi(2 + int(player.supply_used) / 12, 2, MAX_HALLS)
	if halls.size() < hall_target and player.crystal >= (150 if halls.size() < 2 else 250):
		_build(engine, available, "muster_hall", HALLS)
	if not hub.is_empty() and workers.size() < worker_target and hub.production_queue.is_empty() \
			and player.crystal >= _construction_reserve(engine) + 50:
		engine.issue_command([hub.tag], "train_pioneer")
	if gas_slots > 0 and workers.size() >= 7:
		var assigned := 0
		for unit in workers:
			if (not unit.orders.is_empty() and unit.orders.front().type == "harvest"
					and unit.orders.front().get("target_tag", 0) == gas.tag):
				assigned += 1
		for unit in available:
			if assigned >= gas_slots:
				break
			if (unit.orders.is_empty() or (unit.orders.front().type == "harvest"
					and unit.orders.front().get("target_tag", 0) != gas.tag)):
				if engine.issue_command([unit.tag], "harvest", gas.pos, gas.tag).ok:
					assigned += 1
	for unit in available:
		if unit.orders.is_empty():
			engine.issue_SmartHarvest(unit.tag)
	var armories := _structures(engine, "field_armory")
	if player.aether >= 100 and player.crystal >= _construction_reserve(engine) + 200:
		if armories.is_empty():
			_build(engine, available, "field_armory", ARMORIES)
		else:
			for upgrade in ["weapons", "armor"]:
				if engine.research_block_reason(1, upgrade).is_empty():
					engine.issue_command([armories.front().tag], "research_" + upgrade)
	var post: Dictionary = campaign._named(engine, "roadwarden_post")
	if not post.is_empty() and player.crystal >= _construction_reserve(engine) + 300 \
			and player.supply_cap - player.supply_used >= 4:
		engine.issue_command([post.tag], "call_roadwardens")
	var counts := {"rifleman": 0, "torchguard": 0, "triage_specialist": 0}
	for unit in troops:
		counts[unit.unit_type] += 1
	for hall in halls:
		for job in hall.production_queue:
			if job.get("unit_type") in INFANTRY:
				counts[job.unit_type] += 1
	for hall in halls:
		if hall.build_progress < 1.0:
			continue
		if engine.production_attachment(hall, false).is_empty() and player.aether >= 150 \
				and player.crystal >= _construction_reserve(engine) + 175:
			if engine.attachment_block_reason(hall, "research_module").is_empty():
				engine.issue_command([hall.tag], "attach_research_module")
		if hall.production_queue.size() >= (2 if player.crystal >= 300 else 1):
			continue
		if player.crystal < _construction_reserve(engine) + 50:
			break
		var train := "rifleman"
		if not engine.production_attachment(hall).is_empty():
			if counts.triage_specialist * 4 < maxi(8, counts.rifleman + counts.torchguard):
				train = "triage_specialist"
			elif counts.torchguard * 3 < maxi(9, counts.rifleman):
				train = "torchguard"
		if player.crystal < _construction_reserve(engine) + engine.unit_definition_for(train, 1).crystal_cost:
			train = "rifleman"
		if engine.issue_command([hall.tag], "train_" + train).ok:
			counts[train] += 1
		elif train != "rifleman":
			engine.issue_command([hall.tag], "train_rifleman")

func _structures(engine, type: String) -> Array:
	return engine.units.values().filter(func(unit):
		return unit.owner == 1 and unit.unit_type == type)

func _construction_reserve(engine) -> int:
	var reserve := 0
	for type in _building:
		var worker: Dictionary = engine.units.get(_building[type].tag, {})
		if not worker.is_empty() and not worker.orders.is_empty():
			var order: Dictionary = worker.orders.front()
			if order.type == "build" and order.structure_type == type and order.structure_tag == 0:
				reserve += int(engine.unit_definition_for(type, 1).crystal_cost)
	return reserve

func _build(engine, workers: Array, type: String, sites: Array) -> void:
	var previous: Dictionary = _building.get(type, {})
	if not previous.is_empty():
		var worker: Dictionary = engine.units.get(previous.tag, {})
		if not worker.is_empty() and not worker.orders.is_empty() and worker.orders.front().type == "build":
			var order: Dictionary = worker.orders.front()
			if int(order.get("structure_tag", 0)) == 0 and engine.tick - int(previous.tick) < 20 * engine.TICK_RATE:
				return
			if int(order.get("structure_tag", 0)) == 0:
				engine.issue_command([worker.tag], "stop")
				_rejected_sites[previous.point] = true
		_building.erase(type)
	var definition: Dictionary = engine.unit_definition_for(type, 1)
	if engine.players[1].crystal < _construction_reserve(engine) + definition.crystal_cost:
		return
	var candidates := workers.filter(func(unit):
		return unit.orders.is_empty() or unit.orders.front().type == "harvest")
	if candidates.is_empty():
		return
	var positions := sites.duplicate()
	for y in range(125, 164, 2):
		for x in range(23, 68, 2):
			positions.append(Vector2(x, y))
	for point in positions:
		if _rejected_sites.has(point) or not engine.can_see_position(1, point) or not engine.can_place_structure(type, point):
			continue
		var radius: float = definition.radius
		var overlaps_order := _building.values().any(func(site):
			return point.distance_to(site.point) < radius + float(site.radius) + 1.0)
		if overlaps_order:
			continue
		candidates.sort_custom(func(a, b):
			return a.pos.distance_squared_to(point) < b.pos.distance_squared_to(point))
		for worker in candidates:
			var path: Array[Vector2] = engine.compute_smooth_path(worker.pos, point, worker.radius)
			if path.is_empty() or path.back().distance_to(point) > 2.0:
				continue
			if engine.issue_command([worker.tag], "build_" + type, point).ok:
				_building[type] = {"tag": worker.tag, "point": point, "tick": engine.tick, "radius": radius}
				return

func _assign_strongpoints(engine, campaign, troops: Array, workers: Array) -> void:
	var staffed := 0
	for id in BUNKERS:
		var bunker: Dictionary = campaign._named(engine, id)
		var pending: Array = _guards.get(id, [])
		pending = pending.filter(func(tag):
			return engine.units.has(tag) and not bunker.is_empty() and engine.units[tag].orders.any(func(order):
				return order.type == "enter_bunker" and order.get("target_tag", 0) == bunker.tag))
		_guards[id] = pending
		if bunker.is_empty() or bunker.owner != 1:
			_repairers.erase(id)
			continue
		var occupants: Array = bunker.get("passengers", [])
		staffed += occupants.size() + pending.size()
	var deployment_limit := mini(8, (troops.size() + staffed) / 2)
	for id in BUNKERS:
		var bunker: Dictionary = campaign._named(engine, id)
		if bunker.is_empty() or bunker.owner != 1:
			continue
		var pending: Array = _guards[id]
		var occupants: Array = bunker.get("passengers", [])
		if not engine.can_see_position(1, bunker.pos) and pending.is_empty() and occupants.is_empty():
			continue
		if staffed < deployment_limit and pending.size() + occupants.size() < 4:
			var has_torch := (occupants.any(func(unit): return unit.unit_type == "torchguard")
				or pending.any(func(tag): return engine.units[tag].unit_type == "torchguard"))
			var desired := "rifleman" if has_torch else "torchguard"
			var candidates := troops.filter(func(unit):
				return unit.unit_type == desired and not _reserved(unit.tag) \
					and unit.pos.distance_squared_to(bunker.pos) < 576.0)
			candidates.sort_custom(func(a, b):
				return a.pos.distance_squared_to(bunker.pos) < b.pos.distance_squared_to(bunker.pos))
			if not candidates.is_empty():
				var guard: Dictionary = candidates.front()
				if engine.issue_command([guard.tag], "enter_bunker", bunker.pos, bunker.tag).ok:
					pending.append(guard.tag)
					staffed += 1
		if pending.is_empty() and occupants.is_empty():
			continue
		var worker: Dictionary = engine.units.get(_repairers.get(id, 0), {})
		if worker.is_empty() and workers.size() >= 6:
			var available := workers.filter(func(unit): return unit.tag != _convoy_repairer and not unit.tag in _repairers.values() \
				and (unit.orders.is_empty() or unit.orders.front().type == "harvest"))
			available.sort_custom(func(a, b):
				return a.pos.distance_squared_to(bunker.pos) < b.pos.distance_squared_to(bunker.pos))
			if not available.is_empty():
				worker = available.front()
				_repairers[id] = worker.tag
		if worker.is_empty():
			continue
		if bunker.hp < bunker.max_hp and (worker.orders.is_empty() or worker.orders.front().type != "repair"):
			engine.issue_command([worker.tag], "repair", bunker.pos, bunker.tag)
		elif worker.orders.is_empty() or worker.orders.front().type == "harvest":
			var reach: float = bunker.radius + worker.radius + 2.0
			if worker.pos.distance_to(bunker.pos) > reach:
				var path: Array[Vector2] = engine.compute_smooth_path(worker.pos, bunker.pos, worker.radius, false, reach)
				if not path.is_empty() and path.back().distance_to(bunker.pos) <= reach:
					engine.issue_command([worker.tag], "move", path.back())

func _reserved(tag: int) -> bool:
	return _guards.values().any(func(assigned): return tag in assigned)

func _escort(engine, convoy, forces: Array, workers: Array) -> void:
	var truck: Dictionary = engine.units.get(convoy.truck_tag, {})
	var road: Vector2 = Mission.ROUTE[clampi(convoy._waypoint + 3, 6, Mission.ROUTE.size() - 1)]
	if truck.is_empty():
		road = Mission.ROUTE[6]
		var former: Dictionary = engine.units.get(_convoy_repairer, {})
		if not former.is_empty() and (former.orders.is_empty() or former.orders.front().type != "harvest"):
			engine.issue_SmartHarvest(former.tag)
		_convoy_repairer = 0
	var guards := forces.filter(func(unit): return not _reserved(unit.tag))
	var lead: Array[int] = []
	var followers: Array[int] = []
	for guard in guards:
		if not truck.is_empty() and (guard.unit_type == "triage_specialist" or guard.tag % 3 == 0):
			if guard.orders.is_empty() or guard.orders.front().get("target_tag", 0) != truck.tag:
				followers.append(guard.tag)
		elif guard.orders.is_empty() or guard.orders.front().type != "attack_move" \
				or guard.orders.front().target_pos.distance_squared_to(road) > 4.0:
			lead.append(guard.tag)
	if not lead.is_empty():
		engine.issue_command(lead, "attack_move", road)
	if not followers.is_empty():
		engine.issue_command(followers, "follow", truck.pos, truck.tag)
	if truck.is_empty() or workers.size() < 7:
		return
	var worker: Dictionary = engine.units.get(_convoy_repairer, {})
	if worker.is_empty():
		var repairers := workers.filter(func(unit):
			return (not unit.tag in _repairers.values() and unit.pos.distance_squared_to(truck.pos) < 900.0
				and (unit.orders.is_empty() or unit.orders.front().type == "harvest")))
		repairers.sort_custom(func(a, b):
			return a.pos.distance_squared_to(truck.pos) < b.pos.distance_squared_to(truck.pos))
		if repairers.is_empty():
			return
		worker = repairers.front()
		_convoy_repairer = worker.tag
	var action := "repair" if truck.hp < truck.max_hp else "follow"
	if worker.orders.is_empty() or worker.orders.front().type != action:
		engine.issue_command([worker.tag], action, truck.pos, truck.tag)
