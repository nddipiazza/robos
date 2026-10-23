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
		if u.unit_type == "colony_hub":
			halls.append(u)
	if halls.is_empty():
		_attack(pid, army, cfg, true)
		return
	var base: Vector2 = halls[0].pos
	var p: Dictionary = SimEngine.players[pid]
	# Include pending construction orders to avoid repeatedly replacing builders.
	for worker in workers:
		for order in worker.orders:
			if order.type == "build" and int(order.get("structure_tag", 0)) == 0:
				counts[order.structure_type] = int(counts.get(order.structure_type, 0)) + 1
	var gas_workers = 0
	var gas_tap: Dictionary = {}
	for u in mine:
		if u.unit_type == "aether_tap" and u.build_progress >= 1.0:
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
	if strategy == "economy" and int(counts.get("colony_hub", 0)) < 2 and workers.size() >= 18 and SimEngine.sim_time >= 90:
		var expansion = _expansion_position(base)
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
	elif structure_type == "aether_tap":
		for res in SimEngine.resources.values():
			if res.resource_type == "aether_vent" and res.pos.distance_to(base) < 24 and SimEngine.can_place_structure(structure_type, res.pos):
				candidate = res.pos
				break
	else:
		for radius in [11.0, 20.0, 29.0, 38.0]:
			for i in range(16):
				var angle = TAU * float(i) / 16.0
				var pos = base + Vector2(cos(angle), sin(angle)) * radius
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

func _expansion_position(base: Vector2) -> Vector2:
	var best = Vector2.ZERO
	var distance = INF
	for start in SimEngine.match_state.get("starts", []) + SimEngine.match_state.get("expansions", []):
		var pos = Vector2(float(start.x), float(start.y))
		var occupied = false
		for u in SimEngine.units.values():
			if u.is_structure and u.pos.distance_to(pos) < 26:
				occupied = true
		if not occupied and pos.distance_to(base) < distance:
			best = pos
			distance = pos.distance_to(base)
	return best

func _attack(pid: int, army: Array, cfg: Dictionary, desperate: bool) -> void:
	var threshold = {"rush": 6, "balanced": 10, "siege": 12, "economy": 18}[str(cfg.get("strategy", "balanced"))]
	if cfg.get("difficulty", "normal") == "easy":
		threshold += 6
	if army.size() < threshold and not desperate and not bool(cfg.get("attacking", false)):
		return
	cfg["attacking"] = true
	for soldier in army:
		if not soldier.orders.is_empty():
			continue
		var closest: Dictionary = {}
		var distance = INF
		for enemy in SimEngine.units.values():
			if enemy.owner != pid and enemy.is_structure and soldier.pos.distance_to(enemy.pos) < distance:
				closest = enemy
				distance = soldier.pos.distance_to(enemy.pos)
		if not closest.is_empty():
			SimEngine.issue_command([soldier.tag], "attack_move", closest.pos)
