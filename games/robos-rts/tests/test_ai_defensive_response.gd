extends SceneTree

var sim: Node
var data: Node
var raider_tag := 0
var defense_hit := -1.0
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	sim.weapon_attack.connect(_on_attack)
	_test_paid_raid()
	print("AI defensive response: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _test_paid_raid() -> void:
	var loaded: Dictionary = sim.start_skirmish("iron-narrows", {"seed": 42, "difficulty": "normal", "strategy": "economy"})
	if not _check(loaded.ok, "The raid fixture starts"):
		return
	var home: Dictionary = _owned(1, "colony_hub").front()
	var defended: Dictionary = _owned(2, "colony_hub").front()
	_check(_army(1).is_empty() and _army(2).is_empty() and sim.players[1].crystal == 50, "The match starts without military or bonus resources")
	var raider := _train_raider(home)
	if not _check(not raider.is_empty() and sim.players[1].units_trained == 1 and sim.players[1].aether_collected >= 25, "The raider is a paid Breacher"):
		return
	for _second in range(60):
		if _army(2).size() >= 5:
			break
		sim.step_ticks(64)
	var ready := _army(2)
	if not _check(ready.size() >= 5 and not sim.can_see_unit(2, raider), "The AI has an available army while the raider is still hidden"):
		return
	var eastbound: bool = home.pos.x < defended.pos.x
	var far_bank := Vector2(79, 24) if eastbound else Vector2(49, 24)
	var raid_point: Vector2 = defended.pos + (far_bank - defended.pos).normalized() * 26.0
	raider_tag = raider.tag
	_move_via_northern_bridge(raider, raid_point, eastbound)
	sim.issue_command([raider.tag], "hold_position", Vector2.ZERO, 0, "", true)
	var raid_started: float = sim.sim_time
	var first_seen := -1.0
	var closest := INF
	var assigned := {}
	var max_interceptors := 0
	var paid_progress := -1.0
	var income := 0
	var contact := false
	var hidden_order := false
	var economy_during_raid := false
	var spare_guards_held := true
	var damage := false
	for _sample in range(1000):
		sim.step_ticks(4)
		var visible: bool = sim.can_see_unit(2, raider)
		if visible and first_seen < 0.0:
			first_seen = sim.sim_time
		closest = minf(closest, raider.pos.distance_to(defended.pos))
		var interceptors := _interceptors()
		hidden_order = hidden_order or (not contact and not visible and not interceptors.is_empty())
		max_interceptors = maxi(max_interceptors, interceptors.size())
		if not interceptors.is_empty():
			if not contact:
				contact = true
				paid_progress = _paid_progress()
				income = sim.players[2].crystal_collected
			economy_during_raid = economy_during_raid or (sim.players[2].crystal_collected > income and _paid_progress() > paid_progress)
			spare_guards_held = spare_guards_held and _army(2).all(func(unit): return not unit.orders.is_empty() or unit.vel.is_zero_approx())
			for soldier in interceptors:
				_check(soldier.orders[0].target_tag == raider.tag, "Defense targets the hostile raider")
				assigned[soldier.tag] = soldier.orders[0]._defense_intercept.origin
			if not damage and defense_hit >= 0.0:
				damage = true
				_move_via_northern_bridge(raider, home.pos, not eastbound)
		if contact and damage and raider.pos.distance_to(defended.pos) > 28.0 and interceptors.is_empty():
			break
	_check(contact and damage and not hidden_order, "A visible raid is intercepted, with no defensive order in fog")
	_check(max_interceptors == 2 and assigned.size() <= 2 and ready.size() > max_interceptors and spare_guards_held,
		"The AI detaches two idle defenders for one raider while spare guards stay at their posts")
	_check(economy_during_raid, "Mining income and paid production advance during the interception")
	_check(sim.units.has(raider.tag) and raider.pos.distance_to(defended.pos) > 28.0, "The raider can retreat alive beyond the protected area")
	if not contact:
		print(JSON.stringify({"start": raid_started, "first_seen": first_seen, "closest": closest,
			"raider_pos": raider.pos, "raider_hp": raider.hp, "orders": raider.orders}))
	var returned := false
	var resumed_attack := false
	for _second in range(175):
		sim.step_ticks(64)
		returned = returned or (not assigned.is_empty() and assigned.keys().all(func(tag):
			var unit: Dictionary = sim.units.get(tag, {})
			return not unit.is_empty() and (unit.orders.is_empty() or not unit.orders[0].has("_defense_intercept")) and unit.pos.distance_squared_to(assigned[tag]) < 4.0))
		resumed_attack = resumed_attack or assigned.keys().any(func(tag): return sim.units.get(tag, {}).has("skirmish_route"))
		if returned and resumed_attack:
			break
	_check(returned and resumed_attack, "Released defenders return to their posts and can join the paid attack")
	print(JSON.stringify({"raider_paid": true, "first_damage": defense_hit, "interceptors": max_interceptors,
		"raider_hp": raider.hp, "returned": returned, "resumed_attack": resumed_attack, "income_and_production": economy_during_raid}))

func _move_via_northern_bridge(unit: Dictionary, goal: Vector2, eastbound: bool) -> void:
	var near_bank := Vector2(49, 24) if eastbound else Vector2(79, 24)
	var far_bank := Vector2(79, 24) if eastbound else Vector2(49, 24)
	sim.issue_command([unit.tag], "move", near_bank)
	sim.issue_command([unit.tag], "move", far_bank, 0, "", true)
	sim.issue_command([unit.tag], "move", goal, 0, "", true)

func _on_attack(attacker: Dictionary, target: Dictionary, _weapon: Dictionary, _hit_shields: bool) -> void:
	if defense_hit < 0.0 and target.tag == raider_tag and not attacker.orders.is_empty() and attacker.orders[0].has("_defense_intercept"):
		defense_hit = sim.sim_time

func _train_raider(home: Dictionary) -> Dictionary:
	for _second in range(180):
		var army := _army(1)
		if not army.is_empty():
			return army.front()
		var muster := _owned(1, "muster_hall")
		var taps := _owned(1, "aether_tap")
		var silos := _owned(1, "silo")
		if silos.is_empty():
			_build(home.pos, "silo")
		elif silos[0].build_progress >= 1.0 and muster.is_empty():
			_build(home.pos, "muster_hall")
		if taps.is_empty():
			_build(home.pos, "aether_tap")
		elif taps[0].build_progress >= 1.0:
			var workers := _owned(1, "pioneer")
			var tap: Dictionary = taps[0]
			var gas_workers := workers.filter(func(worker): return not worker.orders.is_empty() and worker.orders[0].get("target_tag", 0) == tap.tag).size()
			for worker in workers:
				if gas_workers >= 3:
					break
				if worker.orders.is_empty() or (worker.orders[0].type == "harvest" and worker.orders[0].target_tag != tap.tag):
					if sim.issue_command([worker.tag], "harvest", tap.pos, tap.tag).ok:
						gas_workers += 1
		for worker in _owned(1, "pioneer"):
			if worker.orders.is_empty():
				sim.issue_SmartHarvest(worker.tag)
		if not muster.is_empty() and muster[0].production_queue.is_empty():
			sim.issue_command([muster[0].tag], "train_breacher")
		sim.step_ticks(64)
	return {}

func _build(base: Vector2, kind: String) -> void:
	if sim.players[1].crystal < int(data.get_unit_def(kind).crystal_cost):
		return
	var builder := {}
	for worker in _owned(1, "pioneer"):
		if not worker.orders.is_empty() and worker.orders[0].type == "build":
			if worker.orders[0].structure_type == kind:
				return
		elif builder.is_empty():
			builder = worker
	if builder.is_empty():
		return
	if kind == "aether_tap":
		for deposit in sim.resources.values():
			if deposit.resource_type == "aether_vent" and deposit.pos.distance_squared_to(base) < 24.0 * 24.0:
				if sim.issue_command([builder.tag], "build_" + kind, deposit.pos).ok:
					return
	else:
		for i in range(16):
			var point := base + Vector2.from_angle(TAU * float(i) / 16.0) * 11.0
			if sim.can_place_structure(kind, point) and sim.issue_command([builder.tag], "build_" + kind, point).ok:
				return

func _owned(owner_id: int, kind: String) -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == owner_id and unit.unit_type == kind)

func _army(owner_id: int) -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == owner_id and not unit.is_worker and not unit.is_structure)

func _interceptors() -> Array:
	return _army(2).filter(func(unit): return not unit.orders.is_empty() and unit.orders[0].has("_defense_intercept"))

func _paid_progress() -> float:
	var progress: float = sim.players[2].units_trained * 1000.0
	for unit in sim.units.values():
		if unit.owner == 2 and unit.is_structure:
			for item in unit.production_queue:
				progress += float(item.progress)
	return progress
