extends RefCounted

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
	if halls.is_empty():
		_attack(pid, army, cfg, true)
		return
	var base: Vector2 = halls[0].pos
	# Include pending construction orders to avoid repeatedly replacing builders.
	for worker in workers:
		for order in worker.orders:
			if order.type == "build" and int(order.get("structure_tag", 0)) == 0:
				counts[order.structure_type] = int(counts.get(order.structure_type, 0)) + 1
	var gas_workers = 0
	var gas_tap: Dictionary = {}
	for u in mine:
		if u.unit_type == roster.extractor and u.build_progress >= 1.0 and (SimEngine.unlimited_resources or not SimEngine.worker_rally_resource(pid, u.tag).is_empty()):
			gas_tap = u
	for worker in workers:
		if not worker.orders.is_empty() and worker.orders[0].type == "build":
			continue
		if not gas_tap.is_empty() and gas_workers < 3:
			gas_workers += 1
			if worker.harvest_target_tag != gas_tap.tag:
				SimEngine.issue_command([worker.tag], "harvest", Vector2.ZERO, gas_tap.tag)
		elif worker.orders.is_empty():
			SimEngine.issue_SmartHarvest(worker.tag)
	if p.faction != RTSData.FACTION_HUMANS:
		_step_asymmetric_macro(pid, cfg, mine, workers, army, halls, counts)
		return
	var pending_supply = int(counts.get("silo", 0)) + int(counts.get("silo_retracted", 0))
	var finished_supply = 0
	for u in mine:
		if u.unit_type in ["silo", "silo_retracted"] and u.build_progress >= 1:
			finished_supply += 1
	if p.supply_cap < 200 and p.supply_cap - p.supply_used <= 4 and pending_supply == finished_supply:
		_build(workers, "silo", base)
		return
	if int(counts.get("muster_hall", 0)) == 0:
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
			var unit_type = "breacher" if strategy != "rush" and army.size() % 3 == 2 and p.aether >= 25 else "rifleman"
			SimEngine.issue_command([u.tag], "train_" + unit_type)
	_attack(pid, army, cfg, false)

func _step_asymmetric_macro(pid: int, cfg: Dictionary, mine: Array, workers: Array, army: Array, halls: Array, counts: Dictionary) -> void:
	var p: Dictionary = SimEngine.players[pid]
	var roster: Dictionary = RTSData.faction_info[p.faction]
	var brood: bool = p.faction == RTSData.FACTION_MONSTERS
	var supply_type := "brood_pod" if brood else "resonator"
	var base: Vector2 = halls[0].pos
	var strategy: String = cfg.get("strategy", "balanced")
	var difficulty: String = cfg.get("difficulty", "normal")
	var completed_supply := mine.filter(func(u): return u.unit_type == supply_type and u.build_progress >= 1.0).size()
	if p.supply_cap < 200 and p.supply_cap - p.supply_used <= 4:
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
	var building_hall: bool = int(counts.get(roster.town_hall, 0)) > halls.size() or halls.any(func(u): return u.build_progress < 1.0)
	var wants_expansion: bool = strategy == "economy" and workers.size() >= 18 and SimEngine.sim_time >= 85 and halls.size() < 2
	var needs_expansion: bool = not SimEngine.unlimited_resources and workers.size() >= 12 and _needs_new_mineral_line(halls)
	if not building_hall and (wants_expansion or needs_expansion):
		var expansion := _expansion_position(pid, base)
		if expansion != Vector2.ZERO:
			_build(workers, roster.town_hall, expansion, true)
			_attack(pid, army, cfg, false)
			return
	if not building_hall and brood and halls.size() < 3 and p.crystal >= 375 and workers.size() >= 13:
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
				elif strategy == "siege" and p.aether >= 100:
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
				if strategy == "siege" and p.aether >= 200:
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

func _expansion_position(pid: int, base: Vector2) -> Vector2:
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
			if u.pos.distance_to(pos) < 26:
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
	var known: Array = SimEngine.remembered_buildings(pid)
	for enemy in SimEngine.units.values():
		if enemy.owner != pid and enemy.is_structure and SimEngine.can_see_unit(pid, enemy):
			known.append(enemy)
	return known

func _scout_position(pid: int, from: Vector2, cfg: Dictionary) -> Vector2:
	var previous: Vector2 = cfg.get("scout_position", Vector2.ZERO)
	if previous != Vector2.ZERO and SimEngine.vision.last_seen_at(pid, previous) == cfg.get("scout_seen", -1):
		return previous
	var best := Vector2.ZERO
	var best_seen := 2147483647
	var best_distance := INF
	# Check plausible bases first, without reading which start the opponent got.
	var sites: Array = SimEngine.match_state.get("starts", []) + SimEngine.match_state.get("expansions", [])
	for site in sites:
		var pos := Vector2(site.x, site.y)
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
				var cell := Vector2i(pos / SimEngine.PATH_CELL_SIZE)
				if SimEngine.astar_grid.is_point_solid(cell):
					continue
				var seen: int = SimEngine.vision.last_seen_at(pid, pos)
				var distance := from.distance_squared_to(pos)
				if seen < best_seen or (seen == best_seen and distance < best_distance):
					best = pos
					best_seen = seen
					best_distance = distance
	cfg["scout_position"] = best
	cfg["scout_seen"] = best_seen
	return best

func _attack(pid: int, army: Array, cfg: Dictionary, desperate: bool) -> void:
	var threshold = {"rush": 6, "balanced": 10, "siege": 12, "economy": 18}[str(cfg.get("strategy", "balanced"))]
	if cfg.get("difficulty", "normal") == "easy":
		threshold += 6
	if army.size() < threshold and not desperate and not bool(cfg.get("attacking", false)):
		return
	cfg["attacking"] = true
	var known := _known_enemy_buildings(pid)
	for soldier in army:
		if not soldier.orders.is_empty():
			continue
		var closest: Dictionary = {}
		var distance = INF
		for enemy in known:
			if soldier.pos.distance_to(enemy.pos) < distance:
				closest = enemy
				distance = soldier.pos.distance_to(enemy.pos)
		if not closest.is_empty():
			SimEngine.issue_command([soldier.tag], "attack_move", closest.pos)
		elif SimEngine.vision != null:
			var target := _scout_position(pid, soldier.pos, cfg)
			if target != Vector2.ZERO:
				SimEngine.issue_command([soldier.tag], "attack_move", target)
