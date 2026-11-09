extends RefCounted

const ROUTE_CHECK_TICKS := 3 * 64
const ROUTE_CHECK_DISTANCE_SQUARED := 2.25
const MAX_RECOVERIES_PER_UPDATE := 4
const RECOVERY_WORKER_TARGET := 4
const MINERAL_WORKERS_BEFORE_GAS := 3
const WORKER_SCOUT_START_TICKS := 40 * 64
const WORKER_SCOUT_DURATION_TICKS := 90 * 64
const WORKERS_BEFORE_SCOUT := 12
const DEFENSE_RADIUS := 28.0
const DEFENDER_CALL_DISTANCE := 36.0
const MAX_DEFENDERS := 4

# Macro decisions use the same paid commands as the player. Difficulty changes
# cadence, worker targets and army size, never damage, income or starting assets.
func step_player(pid: int, cfg: Dictionary) -> void:
	if SimEngine.tick < int(cfg.get("next_tick", 0)):
		return
	var difficulty = str(cfg.get("difficulty", "normal"))
	var cadence = {"easy": 256, "normal": 128, "hard": 64}[difficulty]
	cfg["next_tick"] = SimEngine.tick + cadence
	var strategy = str(cfg.get("strategy", "balanced"))
	var p: Dictionary = SimEngine.players.get(pid, {})
	var roster: Dictionary = RTSData.faction_info.get(p.get("faction", ""), {})
	if roster.is_empty():
		return
	var mine: Array = []
	var workers: Array = []
	var army: Array = []
	var halls: Array = []
	var counts: Dictionary = {}
	for u in SimEngine.units.values():
		if u.owner != pid:
			continue
		mine.append(u)
		counts[u.unit_type] = int(counts.get(u.unit_type, 0)) + 1
		if u.is_worker:
			workers.append(u)
		elif not u.is_structure:
			army.append(u)
		if u.unit_type == roster.town_hall:
			halls.append(u)
	_step_defense(pid, army, halls)
	if halls.is_empty():
		_attack(pid, army, cfg, true)
		return
	if workers.size() < RECOVERY_WORKER_TARGET:
		_train_recovery_workers(halls, roster.worker, workers.size())
	var base: Vector2 = halls[0].pos
	var scout_tag := _step_worker_scout(pid, cfg, workers, base)
	# Include pending construction orders to avoid repeatedly replacing builders.
	var available_workers := workers.size() - (1 if scout_tag != 0 else 0)
	for worker in workers:
		if not worker.orders.is_empty() and worker.orders[0].type == "build":
			available_workers -= 1
		for order in worker.orders:
			if order.type == "build" and int(order.get("structure_tag", 0)) == 0:
				counts[order.structure_type] = int(counts.get(order.structure_type, 0)) + 1
	var gas_workers := 0
	var gas_limit := mini(3, maxi(0, available_workers - MINERAL_WORKERS_BEFORE_GAS))
	var gas_tap: Dictionary = {}
	for u in mine:
		if u.unit_type == roster.extractor and u.build_progress >= 1.0 and (SimEngine.unlimited_resources or not SimEngine.worker_rally_resource(pid, u.tag).is_empty()):
			gas_tap = u
	for worker in workers:
		if worker.tag == scout_tag or (not worker.orders.is_empty() and worker.orders[0].type == "build"):
			continue
		if not gas_tap.is_empty() and gas_workers < gas_limit:
			gas_workers += 1
			if worker.orders.is_empty() or worker.harvest_target_tag != gas_tap.tag:
				SimEngine.issue_command([worker.tag], "harvest", Vector2.ZERO, gas_tap.tag)
		else:
			var target: Dictionary = SimEngine.units.get(worker.harvest_target_tag, {})
			if worker.orders.is_empty() or (worker.orders[0].type == "harvest" and target.get("unit_type") == roster.extractor):
				SimEngine.issue_SmartHarvest(worker.tag)
	if p.faction != RTSData.FACTION_HUMANS:
		_step_asymmetric_macro(pid, cfg, mine, workers, army, halls, counts)
		return
	var pending_supply = int(counts.get("silo", 0)) + int(counts.get("silo_retracted", 0))
	var finished_supply = 0
	for u in mine:
		if u.unit_type in ["silo", "silo_retracted"] and u.build_progress >= 1:
			finished_supply += 1
	var needs_muster_hall := int(counts.get("muster_hall", 0)) == 0
	var needs_supply: bool = p.supply_cap < 200 and p.supply_cap - p.supply_used <= 4 and pending_supply == finished_supply
	if needs_supply or (needs_muster_hall and pending_supply == 0):
		_build(workers, "silo", base)
		return
	if needs_muster_hall:
		_build(workers, "muster_hall", base)
		return
	if strategy != "rush" and int(counts.get("aether_tap", 0)) == 0:
		_build(workers, "aether_tap", base)
		return
	# Reserve the expansion cost instead of spending every income tick on units.
	var planned_expansion := strategy == "economy" and int(counts.get("colony_hub", 0)) < 2 and workers.size() >= 18 and SimEngine.sim_time >= 90
	var depleted := not SimEngine.unlimited_resources and workers.size() >= 12 and int(counts.get("colony_hub", 0)) == halls.size() and _needs_new_mineral_line(halls)
	if planned_expansion or depleted:
		var expansion = _expansion_position(pid, base)
		if expansion != Vector2.ZERO:
			_build(workers, "colony_hub", expansion, true)
			_attack(pid, army, cfg, false)
			return
	if strategy == "siege" and int(counts.get("workshop", 0)) == 0:
		_build(workers, "workshop", base)
		# Keep paying for infantry while waiting for the technology requirement.
	var production_target = 3 if difficulty == "hard" or strategy == "rush" else 2
	if strategy == "siege":
		production_target = 1
	if int(counts.get("muster_hall", 0)) < production_target and p.crystal >= 150:
		_build(workers, "muster_hall", base)
	var worker_target = {"easy": 14, "normal": 20, "hard": 24}[difficulty]
	if strategy == "economy":
		worker_target += 8
	for hall in halls:
		if workers.size() < worker_target and hall.production_queue.is_empty():
			SimEngine.issue_command([hall.tag], "train_pioneer")
	for u in mine:
		if not u.is_structure or u.build_progress < 1.0 or not u.production_queue.is_empty():
			continue
		if u.unit_type == "workshop":
			SimEngine.issue_command([u.tag], "train_howitzer")
		elif u.unit_type == "muster_hall":
			# Siege reserves gas for the Workshop and its Howitzers.
			var unit_type = "breacher" if strategy in ["economy", "balanced"] and army.size() % 3 == 2 and p.aether >= 25 else "rifleman"
			SimEngine.issue_command([u.tag], "train_" + unit_type)
	_attack(pid, army, cfg, false)

func _train_recovery_workers(halls: Array, worker_type: String, worker_count: int) -> void:
	var committed := worker_count
	for hall in halls:
		for job in hall.production_queue:
			if job.get("unit_type") == worker_type:
				committed += 1
	for hall in halls:
		if committed >= RECOVERY_WORKER_TARGET:
			return
		if not hall.production_queue.is_empty() and not SimEngine.uses_brood_slots(hall):
			continue
		if SimEngine.issue_command([hall.tag], "train_" + worker_type).ok:
			committed += 1

func _step_asymmetric_macro(pid: int, cfg: Dictionary, mine: Array, workers: Array, army: Array, halls: Array, counts: Dictionary) -> void:
	var p: Dictionary = SimEngine.players[pid]
	var roster: Dictionary = RTSData.faction_info[p.faction]
	var brood: bool = p.faction == RTSData.FACTION_MONSTERS
	var supply_type := "brood_pod" if brood else "resonator"
	var base: Vector2 = halls[0].pos
	var strategy: String = cfg.get("strategy", "balanced")
	var difficulty: String = cfg.get("difficulty", "normal")
	var completed_supply := mine.filter(func(u): return u.unit_type == supply_type and u.build_progress >= 1.0).size()
	var needs_power := not brood and int(counts.get(supply_type, 0)) == 0
	if needs_power or (p.supply_cap < 200 and p.supply_cap - p.supply_used <= 4):
		if int(counts.get(supply_type, 0)) == completed_supply:
			_build(workers, supply_type, base)
		_attack(pid, army, cfg, false)
		return
	if not brood and not mine.any(func(u): return u.unit_type == "waystone"):
		if int(counts.get("waystone", 0)) == 0:
			_build(workers, "waystone", base)
		_attack(pid, army, cfg, false)
		return
	if strategy != "rush" and int(counts.get(roster.extractor, 0)) == 0 and (brood or int(counts.get("waystone", 0)) > 0):
		_build(workers, roster.extractor, base)
	var pending_hall: bool = int(counts.get(roster.town_hall, 0)) > halls.size()
	var building_hall: bool = pending_hall or halls.any(func(u): return u.build_progress < 1.0)
	var wants_expansion: bool = strategy == "economy" and workers.size() >= 18 and SimEngine.sim_time >= 85 and halls.size() < 2
	var needs_expansion: bool = not SimEngine.unlimited_resources and workers.size() >= 12 and _needs_new_mineral_line(halls)
	if pending_hall and (wants_expansion or needs_expansion):
		_attack(pid, army, cfg, false)
		return
	if not building_hall and (wants_expansion or needs_expansion):
		var expansion := _expansion_position(pid, base, 12.0)
		if expansion != Vector2.ZERO:
			_build(workers, roster.town_hall, expansion, true)
			_attack(pid, army, cfg, false)
			return
	if not building_hall and brood and halls.size() < 3 and (strategy != "economy" or halls.size() > 1) and p.crystal >= 375 and workers.size() >= 13:
		_build(workers, roster.town_hall, base)
	if not brood and int(counts.get("waystone", 0)) < (3 if difficulty == "hard" else 2) and p.crystal >= 180:
		_build(workers, "waystone", base)
	var worker_target: int = {"easy": 14, "normal": 20, "hard": 24}[difficulty] + (5 if strategy == "economy" else 0)
	var committed_workers := workers.size()
	for hall in halls:
		for item in hall.production_queue:
			if item.get("unit_type") == roster.worker:
				committed_workers += 1
	for producer in mine:
		if producer.build_progress < 1.0:
			continue
		if brood and producer.unit_type == roster.town_hall:
			for i in range(int(producer.brood_slots)):
				var train := "skitterling"
				if committed_workers < worker_target and (workers.size() < 12 or producer.production_queue.size() == 0):
					train = roster.worker
				elif strategy == "siege":
					if p.aether >= 100:
						train = "blight_hurler"
				elif strategy != "rush" and p.aether >= 25:
					train = "bile_crawler"
				if not SimEngine.issue_command([producer.tag], "train_" + train).ok:
					break
				if train == roster.worker:
					committed_workers += 1
		elif not brood and producer.production_queue.is_empty():
			if producer.unit_type == roster.town_hall and committed_workers < worker_target:
				if SimEngine.issue_command([producer.tag], "train_" + roster.worker).ok:
					committed_workers += 1
			elif producer.unit_type == "waystone" and SimEngine.is_powered(pid, producer.pos):
				var train := "sunblade"
				if strategy == "siege":
					# A Waystone can still train a Sunblade with only a few
					# supply slots left, without spending the saved aether.
					if p.aether >= 200 and p.supply_cap - p.supply_used >= 6:
						train = "spire_walker"
				elif strategy != "rush" and p.aether >= 50:
					train = "skirmisher"
				SimEngine.issue_command([producer.tag], "train_" + train)
	_attack(pid, army, cfg, false)

func _build(workers: Array, structure_type: String, base: Vector2, exact: bool = false) -> void:
	if workers.is_empty():
		return
	var def = RTSData.get_unit_def(structure_type)
	var p: Dictionary = SimEngine.players[workers[0].owner]
	if p.crystal < int(def.get("crystal_cost", 0)) or p.aether < int(def.get("aether_cost", 0)):
		return
	var candidate = Vector2.ZERO
	if exact:
		candidate = base
	elif def.get("is_extractor", false):
		for res in SimEngine.resources.values():
			if res.resource_type == "aether_vent" and res.pos.distance_to(base) < 24 and SimEngine.can_place_structure(structure_type, res.pos):
				candidate = res.pos
				break
	else:
		for radius in [11.0, 20.0, 29.0, 38.0]:
			for i in range(16):
				var angle = TAU * float(i) / 16.0
				var pos = base + Vector2(cos(angle), sin(angle)) * radius
				if SimEngine.requires_power(structure_type) and not SimEngine.is_powered(workers[0].owner, pos):
					continue
				if SimEngine.can_place_structure(structure_type, pos):
					candidate = pos
					break
			if candidate != Vector2.ZERO:
				break
	if candidate == Vector2.ZERO:
		return
	for worker in workers:
		if worker.orders.is_empty() or worker.orders[0].type == "harvest":
			SimEngine.issue_command([worker.tag], "build_" + structure_type, candidate)
			return

func _expansion_position(pid: int, base: Vector2, clearance: float = 26.0) -> Vector2:
	var best = Vector2.ZERO
	var distance = INF
	var known := _known_enemy_buildings(pid)
	for u in SimEngine.units.values():
		if u.owner == pid and u.is_structure:
			known.append(u)
	for start in SimEngine.match_state.get("starts", []) + SimEngine.match_state.get("expansions", []):
		var pos = Vector2(float(start.x), float(start.y))
		if not SimEngine.unlimited_resources and _crystal_near(pos) < 2500:
			continue
		var occupied = false
		for u in known:
			if u.pos.distance_to(pos) < clearance:
				occupied = true
		if not occupied and pos.distance_to(base) < distance:
			best = pos
			distance = pos.distance_to(base)
	return best

func _crystal_near(base: Vector2) -> int:
	var total := 0
	for deposit in SimEngine.resources.values():
		if deposit.resource_type != "crystal_field":
			continue
		var anchor: Vector2 = deposit.get("line_origin", deposit.pos)
		var reach := 6.0 if deposit.has("line_origin") else 26.0
		if anchor.distance_squared_to(base) <= reach * reach:
			total += deposit.amount
	return total

func _needs_new_mineral_line(halls: Array) -> bool:
	for hall in halls:
		if hall.build_progress < 1.0 or _crystal_near(hall.pos) >= 2500:
			return false
	return true

func _known_enemy_buildings(pid: int) -> Array:
	var known: Array = SimEngine.remembered_buildings(pid).filter(func(building): return building.owner != 0)
	for enemy in SimEngine.units.values():
		if enemy.owner != 0 and enemy.owner != pid and enemy.is_structure and SimEngine.can_see_unit(pid, enemy):
			known.append(enemy)
	return known

func _step_defense(pid: int, army: Array, halls: Array) -> void:
	if army.is_empty():
		return
	var threats := {}
	for hall in halls:
		if not SimEngine.is_dropoff(hall, pid):
			continue
		for enemy in SimEngine.query_units_in_radius(hall.pos, DEFENSE_RADIUS, pid):
			if enemy.owner == 0 or enemy.is_worker or enemy.is_structure or not SimEngine.can_see_unit(pid, enemy):
				continue
			var distance: float = hall.pos.distance_squared_to(enemy.pos)
			if distance <= DEFENSE_RADIUS * DEFENSE_RADIUS and distance < float(threats.get(enemy.tag, {}).get("distance", INF)):
				threats[enemy.tag] = {"enemy": enemy, "center": hall.pos, "distance": distance}
	var available: Array[Dictionary] = []
	var assigned := 0
	var limit := mini(MAX_DEFENDERS, threats.size() + 1)
	for soldier in army:
		var order: Dictionary = soldier.orders.front() if not soldier.orders.is_empty() else {}
		if not order.has("_defense_intercept"):
			if not threats.is_empty() and not soldier.is_immobile and order.is_empty():
				available.append(soldier)
			continue
		if assigned < limit and threats.has(order.target_tag):
			assigned += 1
			continue
		SimEngine.issue_command([soldier.tag], "move", order._defense_intercept.origin)
	if threats.is_empty() or available.is_empty():
		return
	if assigned >= limit:
		return
	var ordered: Array = threats.values()
	ordered.sort_custom(func(a, b): return a.distance < b.distance)
	for threat in ordered:
		var enemy: Dictionary = threat.enemy
		available.sort_custom(func(a, b): return a.pos.distance_squared_to(enemy.pos) < b.pos.distance_squared_to(enemy.pos))
		for soldier in available:
			if not soldier.orders.is_empty() or soldier.pos.distance_squared_to(enemy.pos) > DEFENDER_CALL_DISTANCE * DEFENDER_CALL_DISTANCE:
				continue
			if not SimEngine.can_attack(soldier, enemy) or not _can_intercept(soldier, enemy):
				continue
			if SimEngine.issue_command([soldier.tag], "attack_target", enemy.pos, enemy.tag).ok:
				soldier.erase("skirmish_route")
				soldier.orders[0]["_defense_intercept"] = {
					"origin": soldier.pos, "center": threat.center, "radius_squared": DEFENSE_RADIUS * DEFENSE_RADIUS,
				}
				assigned += 1
				if assigned >= limit:
					return

func _can_intercept(soldier: Dictionary, enemy: Dictionary) -> bool:
	var weapon: Dictionary = RTSData.get_unit_def(soldier.unit_type).get("weapon", {})
	var reach: float = float(weapon.get("range", 0.0)) + soldier.radius + enemy.radius
	if soldier.flight_height > 0.0 or soldier.pos.distance_squared_to(enemy.pos) <= reach * reach:
		return true
	var path: Array[Vector2] = SimEngine.compute_smooth_path(soldier.pos, enemy.pos, soldier.radius, soldier.unit_type == "spire_walker", reach)
	return path.back().distance_squared_to(enemy.pos) <= reach * reach

func _step_worker_scout(pid: int, cfg: Dictionary, workers: Array, base: Vector2) -> int:
	if SimEngine.vision == null or SimEngine.tick < WORKER_SCOUT_START_TICKS:
		return 0
	var mission: Dictionary = cfg.get("worker_scout", {})
	if mission.get("finished", false):
		return 0
	if mission.is_empty():
		if not _known_enemy_buildings(pid).is_empty() or SimEngine.tick >= WORKER_SCOUT_START_TICKS + WORKER_SCOUT_DURATION_TICKS:
			cfg["worker_scout"] = {"finished": true}
			return 0
		if workers.size() < WORKERS_BEFORE_SCOUT:
			return 0
		# The newest eligible miner is away from the front of the lists
		# used to assign gas workers and builders.
		for i in range(workers.size() - 1, -1, -1):
			var candidate: Dictionary = workers[i]
			if candidate.cargo_amount > 0 or candidate.orders.size() != 1 or candidate.orders[0].type != "harvest":
				continue
			var patch: Dictionary = SimEngine.resources.get(candidate.orders[0].target_tag, {})
			if patch.get("resource_type") != "crystal_field" or not SimEngine.deposit_present(patch):
				continue
			mission = {"tag": candidate.tag, "home_patch": patch.tag, "attempted": {},
				"deadline": SimEngine.tick + WORKER_SCOUT_DURATION_TICKS, "health": candidate.hp + candidate.shields}
			cfg["worker_scout"] = mission
			break
		if mission.is_empty():
			return 0
	var worker: Dictionary = SimEngine.units.get(mission.tag, {})
	if worker.is_empty():
		mission["finished"] = true
		return 0
	var health: float = worker.hp + worker.shields
	if SimEngine.tick >= int(mission.deadline) or health < float(mission.health) or not _known_enemy_buildings(pid).is_empty() or _worker_scout_sees_threat(pid, worker):
		_return_worker_scout(worker, mission, base)
		return 0
	mission.health = health
	var site: Vector2 = mission.get("site", Vector2.INF)
	if site.is_finite() and SimEngine.vision.last_seen_at(pid, site) == 0 and not worker.orders.is_empty() and worker.orders[0].type == "move":
		if SimEngine.tick < int(mission.check_tick):
			return worker.tag
		if worker.pos.distance_squared_to(mission.position) >= ROUTE_CHECK_DISTANCE_SQUARED:
			mission.position = worker.pos
			mission.check_tick = SimEngine.tick + ROUTE_CHECK_TICKS
			return worker.tag
	if site.is_finite():
		mission.attempted[site] = true
	if _send_worker_scout(pid, worker, mission):
		return worker.tag
	_return_worker_scout(worker, mission, base)
	return 0

func _worker_scout_sees_threat(pid: int, worker: Dictionary) -> bool:
	for enemy in SimEngine.query_units_in_radius(worker.pos, 9.0, pid):
		if enemy.owner != 0 and not enemy.is_worker and SimEngine.can_see_unit(pid, enemy) and SimEngine.can_attack(enemy, worker):
			return true
	return false

func _send_worker_scout(pid: int, worker: Dictionary, mission: Dictionary) -> bool:
	var sites: Array[Vector2] = []
	for entry in SimEngine.match_state.get("starts", []):
		var site := Vector2(entry.x, entry.y)
		if not mission.attempted.has(site) and SimEngine.vision.last_seen_at(pid, site) == 0:
			sites.append(site)
	var from: Vector2 = worker.pos
	sites.sort_custom(func(a, b): return from.distance_squared_to(a) < from.distance_squared_to(b))
	var reveal_distance := maxf(3.0, float(worker.sight_range) - 4.0)
	for site in sites:
		# Scout the site from an approach point. The site's center can be a
		# foundation, and a partial route can still reach viewing distance.
		var approach := (from - site).normalized() * minf(9.0, reveal_distance)
		for angle in [0.0, PI / 3.0, -PI / 3.0, PI * 0.5, -PI * 0.5]:
			var point := site + approach.rotated(angle)
			var path: Array[Vector2] = SimEngine.compute_smooth_path(from, point, worker.radius)
			var destination: Vector2 = path.back()
			if destination.distance_squared_to(site) <= reveal_distance * reveal_distance and from.distance_squared_to(destination) > 4.0:
				if SimEngine.issue_command([worker.tag], "move", destination).ok:
					mission["site"] = site
					mission["position"] = from
					mission["check_tick"] = SimEngine.tick + ROUTE_CHECK_TICKS
					return true
		mission.attempted[site] = true
	return false

func _return_worker_scout(worker: Dictionary, mission: Dictionary, base: Vector2) -> void:
	mission["finished"] = true
	var patch: Dictionary = SimEngine.resources.get(mission.home_patch, {})
	if patch.is_empty() or not SimEngine.deposit_present(patch):
		patch = SimEngine._find_nearest_crystal(base)
	if patch.is_empty():
		SimEngine.issue_command([worker.tag], "move", base)
	else:
		SimEngine.issue_SmartHarvest(worker.tag, patch)

func _scout_position(pid: int, from: Vector2, cfg: Dictionary, avoid: Vector2 = Vector2.INF) -> Vector2:
	var rerouting := avoid.is_finite()
	var previous: Vector2 = cfg.get("scout_position", Vector2.ZERO)
	if not rerouting and previous != Vector2.ZERO and SimEngine.vision.last_seen_at(pid, previous) == cfg.get("scout_seen", -1):
		return previous
	var best := Vector2.ZERO
	var best_seen := 2147483647
	var best_distance := INF
	# Check plausible bases first, without reading which start the opponent got.
	var sites: Array = SimEngine.match_state.get("starts", []) + SimEngine.match_state.get("expansions", [])
	for site in sites:
		var pos := Vector2(site.x, site.y)
		if rerouting and pos.distance_squared_to(avoid) < 16.0:
			continue
		var seen: int = SimEngine.vision.last_seen_at(pid, pos)
		var distance := from.distance_squared_to(pos)
		if seen < best_seen or (seen == best_seen and distance < best_distance):
			best = pos
			best_seen = seen
			best_distance = distance
	# Once the starts are checked, sweep walkable areas for off-site buildings.
	if best_seen > 0:
		for y in range(8, int(SimEngine.map_height), 20):
			for x in range(8, int(SimEngine.map_width), 20):
				var pos := Vector2(x, y)
				if rerouting and pos.distance_squared_to(avoid) < 16.0:
					continue
				var cell := Vector2i(pos / SimEngine.PATH_CELL_SIZE)
				if SimEngine.astar_grid.is_point_solid(cell):
					continue
				var seen: int = SimEngine.vision.last_seen_at(pid, pos)
				var distance := from.distance_squared_to(pos)
				if seen < best_seen or (seen == best_seen and distance < best_distance):
					best = pos
					best_seen = seen
					best_distance = distance
	if not rerouting:
		cfg["scout_position"] = best
		cfg["scout_seen"] = best_seen
	return best

func _route_has_stalled(soldier: Dictionary, route: Dictionary) -> bool:
	var blocked: bool = route.get("blocked_pursuit", false)
	if not blocked and SimEngine.tick < int(route.check_tick):
		return false
	var position: Vector2 = soldier.pos
	var stalled: bool = position.distance_squared_to(route.position) < ROUTE_CHECK_DISTANCE_SQUARED
	route.position = position
	route.check_tick = SimEngine.tick + ROUTE_CHECK_TICKS
	return (blocked or stalled) and soldier.attack_state == "idle" and soldier.weapon_cooldown <= 0.0

func _recovery_destination(soldier: Dictionary, goal: Vector2, reach: float, previous: Vector2) -> Vector2:
	if soldier.flight_height > 0.0:
		return goal
	var from: Vector2 = soldier.pos
	var cliff_walk: bool = soldier.unit_type == "spire_walker"
	if previous.is_finite():
		# A route that was already tried can still be jammed. Prefer a different
		# authored crossing that advances toward the objective.
		var crossings: Array[Vector2] = []
		var direction := (goal - from).normalized()
		for bridge in SimEngine.land_bridges:
			var point: Vector2 = bridge.get_center()
			if (point - from).dot(direction) >= 4.0 and point.distance_squared_to(previous) > 36.0:
				crossings.append(point)
		crossings.sort_custom(func(a, b): return from.distance_to(a) + a.distance_to(goal) < from.distance_to(b) + b.distance_to(goal))
		for i in range(mini(3, crossings.size())):
			var point := crossings[i]
			var path: Array[Vector2] = SimEngine.compute_smooth_path(from, point, soldier.radius, cliff_walk)
			if path.back().distance_squared_to(point) < 4.0:
				return path.back()
	var path: Array[Vector2] = SimEngine.compute_smooth_path(from, goal, soldier.radius, cliff_walk, reach if reach > 3.0 else INF)
	var destination: Vector2 = path.back()
	if destination.distance_to(goal) <= reach and from.distance_squared_to(destination) > 4.0:
		return destination
	return Vector2.INF

func _attack(pid: int, army: Array, cfg: Dictionary, desperate: bool) -> void:
	var threshold = {"rush": 6, "balanced": 10, "siege": 12, "economy": 18}[str(cfg.get("strategy", "balanced"))]
	if cfg.get("difficulty", "normal") == "easy":
		threshold += 6
	if army.size() < threshold and not desperate and not bool(cfg.get("attacking", false)):
		return
	cfg["attacking"] = true
	var known := _known_enemy_buildings(pid)
	var recoveries := 0
	for soldier in army:
		if soldier.is_immobile:
			continue
		var route: Dictionary = soldier.get("skirmish_route", {})
		var recovering := false
		var found_target: bool = route.get("searching", false) and not known.is_empty()
		if not soldier.orders.is_empty():
			var order: Dictionary = soldier.orders.front()
			if route.is_empty() or order.type != "attack_move" or order.target_pos != route.destination:
				continue
			recovering = not found_target and _route_has_stalled(soldier, route)
			if not recovering and not found_target:
				continue
		elif not route.is_empty():
			recovering = not found_target and soldier.pos.distance_squared_to(route.destination) > 9.0
		if recovering and recoveries >= MAX_RECOVERIES_PER_UPDATE:
			continue
		if not found_target and SimEngine.tick < int(route.get("retry_tick", 0)):
			continue
		var closest: Dictionary = {}
		var distance = INF
		for enemy in known:
			if soldier.pos.distance_to(enemy.pos) < distance:
				closest = enemy
				distance = soldier.pos.distance_to(enemy.pos)
		var goal := Vector2.ZERO
		var reach := 3.0
		if not closest.is_empty():
			goal = closest.pos
			var weapon: Dictionary = RTSData.get_unit_def(soldier.unit_type).get("weapon", {})
			reach = maxf(reach, float(weapon.get("range", 0.0)) + soldier.radius + closest.radius)
		elif SimEngine.vision != null:
			goal = _scout_position(pid, soldier.pos, cfg)
		if goal == Vector2.ZERO:
			continue
		var destination := goal
		if recovering:
			recoveries += 1
			var previous: Vector2 = route.destination if route.get("recovery", false) else Vector2.INF
			destination = _recovery_destination(soldier, goal, reach, previous)
			if not destination.is_finite() and SimEngine.vision != null:
				var scout := _scout_position(pid, soldier.pos, cfg, goal)
				if scout != Vector2.ZERO:
					destination = _recovery_destination(soldier, scout, 3.0, Vector2.INF)
			if not destination.is_finite():
				route.retry_tick = SimEngine.tick + ROUTE_CHECK_TICKS
				continue
		if SimEngine.issue_command([soldier.tag], "attack_move", destination, 0, "", false, recovering).ok:
			soldier["skirmish_route"] = {
				"destination": destination, "position": soldier.pos, "recovery": recovering,
				"check_tick": SimEngine.tick + ROUTE_CHECK_TICKS, "searching": closest.is_empty()
			}
