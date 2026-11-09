extends SceneTree

const HOME := Vector2(24, 32)
const ISLAND := Vector2(96, 28)
const OPPONENT := Vector2(132, 102)
const EMPTY_START := Vector2(25, 98)

var sim: Node
var director: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	director = root.get_node("RTSCommanderAI")
	_test_scout_returns()
	_test_scout_loss()
	print("AI worker scout checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _start_match() -> Dictionary:
	var result: Dictionary = sim.load_scenario_dict({
		"mode": "skirmish", "seed": 42, "difficulty": "normal", "strategy": "rush",
		"map": {
			"width": 160, "height": 128,
			"starts": [_site(HOME), _site(ISLAND), _site(OPPONENT), _site(EMPTY_START)],
			"obstacles": [{"x": 60, "y": 0, "w": 20, "h": 72}, {"x": 80, "y": 52, "w": 80, "h": 20}],
		},
	})
	if not _check(result.ok, "The scout fixture loads"):
		return {}
	var hall: Dictionary = sim.units.values().filter(func(unit): return unit.owner == 1 and unit.unit_type == "colony_hub").front()
	_check(hall.pos == OPPONENT and not sim.can_see_unit(2, hall), "The actual opponent starts behind fog")
	return hall

func _site(point: Vector2) -> Dictionary:
	return {"x": point.x, "y": point.y}

func _mission() -> Dictionary:
	return director.player_directives[2].get("worker_scout", {})

func _wait_for_scout() -> Dictionary:
	for _sample in range(120):
		sim.step_ticks(32)
		var mission := _mission()
		if mission.has("tag"):
			return sim.units.get(mission.tag, {})
	return {}

func _test_scout_returns() -> void:
	var hall := _start_match()
	if hall.is_empty():
		return
	var scout := _wait_for_scout()
	if not _check(not scout.is_empty(), "The skirmish AI sends an ordinary worker to scout"):
		return
	var mission := _mission()
	_check(scout.is_worker and scout.cargo_amount == 0 and scout.orders[0].type == "move", "One empty-handed worker receives a scout move")
	_check(mission.site == EMPTY_START and not sim.can_see_unit(2, hall), "The reachable empty start is checked before the hidden opponent")
	var waypoint: Vector2 = scout.orders[0].target_pos
	var path: Array[Vector2] = sim.compute_smooth_path(scout.pos, waypoint, scout.radius)
	_check(path.back().distance_squared_to(waypoint) < 1.0, "The scouting waypoint has a complete route")
	var starting_income: int = sim.players[2].crystal_collected
	var saw_opponent := false
	var max_scouts := 0
	for _sample in range(180):
		sim.step_ticks(32)
		saw_opponent = saw_opponent or sim.can_see_unit(2, hall)
		var moving_workers: Array = sim.units.values().filter(func(unit):
			return unit.owner == 2 and unit.is_worker and not unit.orders.is_empty() and unit.orders[0].type == "move")
		max_scouts = maxi(max_scouts, moving_workers.size())
		if mission.get("finished", false):
			break
	_check(max_scouts == 1 and mission.attempted.has(ISLAND) and sim.vision.last_seen_at(2, ISLAND) == 0,
		"A single scout skips the unreachable start without revealing it")
	_check(sim.vision.last_seen_at(2, EMPTY_START) > 0 and saw_opponent and mission.get("finished", false),
		"The worker checks the empty start, sees the opponent, and ends its scout")
	_check(sim.players[2].crystal_collected > starting_income + 100, "The mineral economy keeps running during the scout")
	if not _check(sim.units.has(scout.tag) and not scout.orders.is_empty() and scout.orders[0].type == "harvest", "The same worker resumes harvest"):
		return
	var original_patch: Dictionary = sim.resources[mission.home_patch]
	var next_patch: Dictionary = sim.resources[scout.orders[0].target_tag]
	_check(next_patch.line_origin == original_patch.line_origin and next_patch.line_origin == HOME, "The scout returns to its home mineral line")
	var picked_up := false
	var delivered := false
	var attacked_known_site := false
	for _sample in range(220):
		sim.step_ticks(32)
		picked_up = picked_up or scout.cargo_amount > 0
		delivered = delivered or (picked_up and scout.cargo_amount == 0 and scout.pos.distance_to(HOME) < 8.0)
		attacked_known_site = attacked_known_site or sim.units.values().any(func(unit):
			var route: Dictionary = unit.get("skirmish_route", {})
			return unit.owner == 2 and not route.is_empty() and not route.searching and route.destination.distance_to(OPPONENT) < 4.0)
		if delivered and attacked_known_site:
			break
	_check(delivered, "The returned worker completes a mining trip")
	_check(attacked_known_site, "The paid army uses the scouted enemy location")

func _test_scout_loss() -> void:
	if _start_match().is_empty():
		return
	var scout := _wait_for_scout()
	if not _check(not scout.is_empty(), "A second match independently sends its own scout"):
		return
	var attacker: Dictionary = sim.units.values().filter(func(unit): return unit.owner == 1 and unit.is_worker).front()
	sim._apply_damage_to_target(attacker, scout, 1000.0, {}, 1.0)
	var income: int = sim.players[2].crystal_collected
	var trained: int = sim.players[2].units_trained
	sim.step_ticks(70 * 64)
	var mission := _mission()
	_check(mission.get("finished", false) and mission.tag == scout.tag and not sim.units.has(scout.tag), "The AI closes a lost scouting mission without spending another worker")
	_check(sim.players[2].crystal_collected > income + 200 and sim.players[2].units_trained > trained,
		"Scout loss leaves mining and paid production running")
