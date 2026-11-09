extends SceneTree

const NORTH_TARGET := Vector2(42, 24)
const SOUTH_TARGET := Vector2(42, 88)
const NORTH_WATCH := Vector2(72, 24)
const SOUTH_WATCH := Vector2(72, 88)
const SOUTH_RESERVE := Vector2(87, 88)

var sim: Node
var director: Node
var impacts := {}
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	director = root.get_node("RTSCommanderAI")
	sim.weapon_attack.connect(_on_attack)
	_test_paid_fronts()
	print("AI multi-front checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _test_paid_fronts() -> void:
	var result: Dictionary = sim.load_scenario_dict({
		"mode": "skirmish", "seed": 42, "difficulty": "hard", "strategy": "balanced",
		"map": {
			"width": 144, "height": 112, "starts": [{"x": 25, "y": 56}, {"x": 119, "y": 56}],
			"water_channels": [{"width": 10, "points": [[72, 0], [72, 112]]}],
			"bridges": [{"x": 58, "y": 14, "w": 28, "h": 20}, {"x": 58, "y": 78, "w": 28, "h": 20}],
			"watch_stations": [{"x": 72, "y": 24}, {"x": 72, "y": 88}],
		},
	})
	if not _check(result.ok, "The two-crossing skirmish starts"):
		return
	_check(_army().is_empty() and sim.players[2].crystal == 50, "The hard opponent has the ordinary opening economy and no free army")
	var watchers := _workers(2)
	var north_scout: Dictionary = watchers[-1]
	var south_scout: Dictionary = watchers[-2]
	_post_watcher(north_scout, NORTH_WATCH)
	_post_watcher(south_scout, SOUTH_WATCH)
	var north := {}
	var south := {}
	for _second in range(150):
		_build_outpost(NORTH_TARGET)
		_build_outpost(SOUTH_TARGET)
		sim.step_ticks(64)
		north = _outpost(NORTH_TARGET)
		south = _outpost(SOUTH_TARGET)
		if not north.is_empty() and not south.is_empty() and sim.can_see_unit(2, north) and sim.can_see_unit(2, south):
			break
	if not _check(not north.is_empty() and not south.is_empty() and sim.can_see_unit(2, north) and sim.can_see_unit(2, south),
		"Both player-built outposts can be revealed by ordinary watch-station capture"):
		return
	_post_watcher(south_scout, SOUTH_RESERVE)
	var config: Dictionary = director.player_directives[2]
	for _sample in range(1100):
		sim.step_ticks(16)
		if bool(config.get("attacking", false)):
			break
	var remembered := false
	for building in sim.remembered_buildings(2):
		remembered = remembered or building.tag == south.tag
	if not _check(bool(config.get("attacking", false)) and sim.can_see_unit(2, north) and not sim.can_see_unit(2, south) and remembered,
		"The army dispatches while the second target exists only in scouting memory"):
		print(JSON.stringify({"time": sim.sim_time, "attacking": config.get("attacking", false), "army": _army().size(),
			"north_visible": sim.can_see_unit(2, north), "south_visible": sim.can_see_unit(2, south), "south_remembered": remembered}))
		return
	_check(config.get("attack_fronts", []).is_empty(), "A remembered target alone cannot create a new second front")
	_post_watcher(south_scout, SOUTH_WATCH)

	var first_assignments := {}
	var routed_bridges := {}
	var stable := true
	var split_at := -1.0
	var observed_plans := {}
	for _sample in range(450):
		sim.step_ticks(16)
		var plan: String = str(config.get("attack_fronts", []))
		if not observed_plans.has(plan):
			observed_plans[plan] = [sim.sim_time, _army().size(), sim.can_see_unit(2, north), sim.can_see_unit(2, south)]
		var counts := {north.tag: 0, south.tag: 0}
		for soldier in _army():
			var tag: int = soldier.get("skirmish_route", {}).get("front_tag", 0)
			if first_assignments.has(soldier.tag) and sim.units.has(first_assignments[soldier.tag]):
				stable = stable and tag == first_assignments[soldier.tag]
			if not counts.has(tag):
				continue
			counts[tag] += 1
			if soldier.pos.x > 68.0 and soldier.pos.x < 76.0:
				var northern: bool = soldier.pos.y < 40.0
				var southern: bool = soldier.pos.y > 72.0
				if northern or southern:
					stable = stable and northern == (tag == north.tag)
					routed_bridges[tag] = true
		if first_assignments.is_empty() and counts[north.tag] >= 3 and counts[south.tag] >= 3:
			split_at = sim.sim_time
			_check(sim.can_see_unit(2, north) and sim.can_see_unit(2, south), "Two live visible targets trigger the split")
			_check(absi(counts[north.tag] - counts[south.tag]) <= 1, "The eligible paid army is divided evenly")
			for soldier in _army():
				var tag: int = soldier.get("skirmish_route", {}).get("front_tag", 0)
				if counts.has(tag):
					first_assignments[soldier.tag] = tag
		if impacts.has(north.tag) and impacts.has(south.tag):
			break
	_check(first_assignments.size() >= 8 and stable, "Both fronts keep stable assignments on their own routes")
	_check(routed_bridges.has(north.tag) and routed_bridges.has(south.tag), "Both groups use their separate river crossings")
	_check(impacts.has(north.tag) and impacts.has(south.tag), "Both paid groups reach and strike their actual objectives")
	var regrouped := false
	for _sample in range(320):
		sim.step_ticks(16)
		for soldier in _army():
			var old_target: int = first_assignments.get(soldier.tag, 0)
			if old_target == 0 or sim.units.has(old_target):
				continue
			var route: Dictionary = soldier.get("skirmish_route", {})
			regrouped = regrouped or (not soldier.orders.is_empty() and route.get("front_tag", 0) != old_target)
		if regrouped:
			break
	_check(regrouped, "Units leave a completed front and resume the attack")
	print(JSON.stringify({"split_at": split_at, "paid_army": first_assignments.size(), "crossings": routed_bridges.size(),
		"first_hits": impacts, "regrouped": regrouped, "ai_trained": sim.players[2].units_trained,
		"target_tags": [north.tag, south.tag], "observed_plans": observed_plans}))

func _on_attack(attacker: Dictionary, target: Dictionary, _weapon: Dictionary, _hit_shields: bool) -> void:
	if attacker.owner == 2 and attacker.get("skirmish_route", {}).get("front_tag", 0) == target.tag and not impacts.has(target.tag):
		impacts[target.tag] = sim.sim_time

func _post_watcher(worker: Dictionary, position: Vector2) -> void:
	sim.issue_command([worker.tag], "move", position)
	sim.issue_command([worker.tag], "hold_position", Vector2.ZERO, 0, "", true)

func _build_outpost(position: Vector2) -> void:
	if not _outpost(position).is_empty() or sim.players[1].crystal < 400:
		return
	var candidate := {}
	for worker in _workers(1):
		if not worker.orders.is_empty() and worker.orders[0].type == "build":
			if worker.orders[0].target_pos == position:
				return
		elif candidate.is_empty() or worker.pos.distance_squared_to(position) < candidate.pos.distance_squared_to(position):
			candidate = worker
	if not candidate.is_empty():
		sim.issue_command([candidate.tag], "build_colony_hub", position)

func _outpost(position: Vector2) -> Dictionary:
	for unit in sim.units.values():
		if unit.owner == 1 and unit.unit_type == "colony_hub" and unit.pos == position:
			return unit
	return {}

func _workers(owner_id: int) -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == owner_id and unit.is_worker)

func _army() -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == 2 and not unit.is_worker and not unit.is_structure)
