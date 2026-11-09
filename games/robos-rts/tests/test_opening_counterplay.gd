extends SceneTree

const OPENINGS := {
	"humans": {"tech": "breacher", "answer": "breacher"},
	"monsters": {"tech": "bile_crawler", "answer": "rifleman"},
	"aliens": {"tech": "skirmisher", "answer": "sentry_turret"},
}

var sim: Node
var data: Node
var home: Dictionary
var enemy_home: Dictionary
var enemy_roster: Dictionary
var opening: Dictionary
var timing: Dictionary
var posted: Dictionary
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	sim.structure_construction_finished.connect(_on_construction)
	sim.unit_production_finished.connect(_on_training)
	sim.weapon_attack.connect(_on_attack)
	for map_id in ["frontier-hunters", "iron-narrows"]:
		for faction in OPENINGS:
			_test_opening(map_id, faction)
	print("Opening counterplay checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _test_opening(map_id: String, faction: String) -> void:
	var label := "%s vs %s" % [map_id, faction]
	var loaded: Dictionary = sim.start_skirmish(map_id, {"seed": 42, "difficulty": "normal", "strategy": "economy", "ai_faction": faction})
	if not loaded.ok:
		failures.append(label + " could not start")
		return
	opening = OPENINGS[faction]
	enemy_roster = data.faction_info[faction]
	home = _owned(1, "colony_hub").front()
	enemy_home = _owned(2, enemy_roster.town_hall).front()
	posted = {}
	timing = {}
	var wave: Array[int] = []
	_check(_army(1).is_empty() and _army(2).is_empty() and sim.players[1].crystal == 50 and sim.players[2].crystal == 50,
		label + " starts with the ordinary economy and no army")
	for _second in range(520):
		_defend()
		sim.step_ticks(64)
		if wave.is_empty():
			for unit in _army(2):
				if not unit.orders.is_empty() and unit.orders[0].type == "attack_move":
					wave.append(unit.tag)
			if not wave.is_empty():
				timing["dispatch"] = sim.sim_time
		if not sim.units.has(home.tag) or sim.match_state.status != "playing":
			break
		if not wave.is_empty() and timing.has("contact") and sim.sim_time >= timing.contact + 45.0 and timing.has("tech") and timing.has("expansion"):
			break
	var lost := wave.filter(func(tag): return not sim.units.has(tag)).size()
	var alive: bool = sim.units.has(home.tag)
	print(JSON.stringify({"case": label, "timing": timing, "first_wave": wave.size(), "first_wave_defeated": lost,
		"home_alive": alive, "home_hp": home.hp, "defender_trained": sim.players[1].units_trained,
		"defender_crystal_collected": sim.players[1].crystal_collected, "opponent_trained": sim.players[2].units_trained}))
	_check(timing.has("dispatch") and timing.has("contact") and wave.size() >= 12, label + " sends a real opening army to the defender")
	_check(timing.has("expansion") and timing.has("extractor") and timing.has("tech"), label + " completes expansion, gas and an advanced unit")
	_check(alive and lost >= 6 and sim.players[1].units_trained >= 12, label + " leaves a viable paid defense against the opening")
	_check(timing.has("answer_hit"), label + " brings its paid counter into the fight")

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _owned(owner_id: int, kind: String) -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == owner_id and unit.unit_type == kind)

func _army(owner_id: int) -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == owner_id and not unit.is_worker and not unit.is_structure)

func _defend() -> void:
	var workers := _owned(1, "pioneer")
	var army := _army(1)
	var muster := _owned(1, "muster_hall")
	var tap := _owned(1, "aether_tap")
	var player: Dictionary = sim.players[1]
	var center := Vector2(sim.map_width, sim.map_height) * 0.5
	var forward: Vector2 = (center - home.pos).normalized()
	if player.supply_cap - player.supply_used <= 4:
		var silos := _owned(1, "silo")
		if silos.all(func(silo): return silo.build_progress >= 1.0):
			_build(workers, "silo", home.pos)
	if muster.size() < 3:
		_build(workers, "muster_hall", home.pos)
	if muster.size() >= 1 and tap.is_empty():
		_build(workers, "aether_tap", home.pos)
	if not tap.is_empty() and tap[0].build_progress >= 1.0:
		var gas_tag: int = tap[0].tag
		var gas_workers := workers.filter(func(worker): return not worker.orders.is_empty() and worker.orders[0].type == "harvest" and worker.orders[0].target_tag == gas_tag).size()
		for worker in workers:
			if gas_workers >= 3:
				break
			if worker.orders.is_empty() or (worker.orders[0].type == "harvest" and worker.orders[0].target_tag != gas_tag):
				if sim.issue_command([worker.tag], "harvest", tap[0].pos, gas_tag).ok:
					gas_workers += 1
	for worker in workers:
		if worker.orders.is_empty():
			sim.issue_SmartHarvest(worker.tag)
	if muster.size() >= 2 and workers.size() < 18 and home.production_queue.is_empty():
		sim.issue_command([home.tag], "train_pioneer")

	if opening.answer == "sentry_turret" and _owned(1, "sentry_turret").size() < 3:
		_build(workers, "sentry_turret", home.pos + forward * 6.0, forward)
	for producer in muster:
		if not producer.production_queue.is_empty() or army.size() >= 42:
			continue
		var use_breachers: bool = opening.answer == "breacher" and _owned(1, "breacher").size() < maxi(2, army.size() / 3)
		if not use_breachers or not sim.issue_command([producer.tag], "train_breacher").ok:
			sim.issue_command([producer.tag], "train_rifleman")
	var intruders := _army(2).filter(func(unit):
		return unit.pos.distance_squared_to(home.pos) <= 34.0 * 34.0 and sim.can_see_unit(1, unit))
	for unit in army:
		if not posted.has(unit.tag):
			var index := posted.size()
			var angle := (float(index % 13) / 12.0 - 0.5) * 2.4
			var radius := 7.0 + 2.5 * float(index % 3)
			posted[unit.tag] = home.pos + forward.rotated(angle) * radius
			sim.issue_command([unit.tag], "move", posted[unit.tag])
		elif not intruders.is_empty():
			var target: Dictionary = intruders[0]
			for intruder in intruders:
				if unit.pos.distance_squared_to(intruder.pos) < unit.pos.distance_squared_to(target.pos):
					target = intruder
			if unit.orders.is_empty() or unit.orders[0].get("target_tag", 0) != target.tag:
				sim.issue_command([unit.tag], "attack_target", target.pos, target.tag)
		elif not unit.orders.is_empty() and unit.orders[0].type in ["attack_target", "attack_move"]:
			sim.issue_command([unit.tag], "move", posted[unit.tag])
		elif unit.orders.is_empty():
			sim.issue_command([unit.tag], "hold_position")

func _build(workers: Array, kind: String, center: Vector2, facing: Vector2 = Vector2.RIGHT) -> void:
	var definition: Dictionary = data.get_unit_def(kind)
	var player: Dictionary = sim.players[1]
	if player.crystal < definition.crystal_cost or player.aether < definition.get("aether_cost", 0):
		return
	var builder := {}
	for worker in workers:
		if not worker.orders.is_empty() and worker.orders[0].type == "build":
			if worker.orders[0].structure_type == kind and worker.orders[0].get("structure_tag", 0) == 0:
				return
		elif builder.is_empty() or worker.pos.distance_squared_to(center) < builder.pos.distance_squared_to(center):
			builder = worker
	if builder.is_empty():
		return
	if kind == "aether_tap":
		for deposit in sim.resources.values():
			if deposit.resource_type == "aether_vent" and deposit.pos.distance_squared_to(center) < 24.0 * 24.0:
				if sim.issue_command([builder.tag], "build_" + kind, deposit.pos).ok:
					return
	else:
		for radius in [11.0, 16.0, 22.0]:
			for i in range(16):
				var point := center + facing.rotated(TAU * float(i) / 16.0) * float(radius)
				if sim.can_place_structure(kind, point) and sim.issue_command([builder.tag], "build_" + kind, point).ok:
					return

func _on_construction(structure: Dictionary) -> void:
	if structure.owner != 2:
		return
	if structure.unit_type == enemy_roster.town_hall and structure.pos.distance_to(enemy_home.pos) >= 20.0 and not timing.has("expansion"):
		timing["expansion"] = sim.sim_time
	elif structure.unit_type == enemy_roster.extractor and not timing.has("extractor"):
		timing["extractor"] = sim.sim_time

func _on_training(unit: Dictionary, _producer: Dictionary) -> void:
	if unit.owner == 2 and unit.unit_type == opening.tech and not timing.has("tech"):
		timing["tech"] = sim.sim_time

func _on_attack(attacker: Dictionary, target: Dictionary, _weapon: Dictionary, _hit_shields: bool) -> void:
	if attacker.owner == target.owner or attacker.owner == 0 or target.owner == 0:
		return
	var enemy := attacker if attacker.owner == 2 else target
	if not enemy.has("skirmish_route"):
		return
	if attacker.pos.distance_squared_to(home.pos) > 40.0 * 40.0:
		return
	if not timing.has("contact"):
		timing["contact"] = sim.sim_time
	if attacker.owner == 1 and attacker.unit_type == opening.answer and not timing.has("answer_hit"):
		timing["answer_hit"] = sim.sim_time
