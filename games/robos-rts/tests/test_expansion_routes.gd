extends SceneTree

const INFANTRY_RADIUS := 0.85
const MAIN_DEFENSE_RADIUS := 12.0
const MAX_DEFENSE_DISTANCE := 90.0

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var results := {}
	for map_id in sim.SKIRMISH_MAPS:
		results[map_id] = _check_map(map_id)
	print(JSON.stringify({"maps": results, "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _check_map(map_id: String) -> Dictionary:
	sim.load_scenario_file(map_id)
	# Assess the authored routes before either side blocks them with buildings.
	# Neutral route blockers and the actual mineral and gas footprints stay.
	for tag in sim.units.keys():
		if sim.units[tag].owner != 0:
			sim.units.erase(tag)
	sim._rebuild_astar_grid()
	var starts: Array = sim.match_state.starts.map(_position)
	var expansions: Array = sim.match_state.expansions.map(_position)
	var raid_pairs := 0
	var longest_defense := 0.0
	for defender in starts:
		var protected_site := Vector2.INF
		var defense_distance := INF
		for expansion in expansions:
			var route := _route(defender, expansion)
			if route.is_empty():
				continue
			var length := _route_length(defender, route)
			if length < defense_distance:
				protected_site = expansion
				defense_distance = length
		if defense_distance > MAX_DEFENSE_DISTANCE:
			failures.append("%s start %s lacks a nearby defendable expansion" % [map_id, defender])
			continue
		longest_defense = maxf(longest_defense, defense_distance)
		for raider in starts:
			if raider == defender:
				continue
			if _raid_route(raider, protected_site, defender):
				raid_pairs += 1
			else:
				failures.append("%s start %s cannot raid %s without passing the main at %s" % [map_id, raider, protected_site, defender])
	return {"starts": starts.size(), "raid_pairs": raid_pairs, "longest_defense": snappedf(longest_defense, 0.01)}

func _raid_route(raider: Vector2, expansion: Vector2, defender: Vector2) -> bool:
	if _avoids_main(raider, _route(raider, expansion), defender):
		return true
	# A waypoint can skirt the defender's main when the shortest route would
	# pass through it. Test different approach angles from the real pathfinder.
	for i in range(16):
		var waypoint := defender + Vector2.from_angle(TAU * i / 16.0) * (MAIN_DEFENSE_RADIUS + 9.0)
		if _avoids_main(raider, _route(raider, waypoint), defender) and _avoids_main(waypoint, _route(waypoint, expansion), defender):
			return true
	return false

func _avoids_main(from: Vector2, route: Array[Vector2], main: Vector2) -> bool:
	if route.is_empty():
		return false
	for point in route:
		if from.distance_squared_to(point) > 0.0001:
			var closest := Geometry2D.get_closest_point_to_segment(main, from, point)
			if closest.distance_squared_to(main) < MAIN_DEFENSE_RADIUS * MAIN_DEFENSE_RADIUS:
				return false
		from = point
	return true

func _route(from: Vector2, destination: Vector2) -> Array[Vector2]:
	var path: Array[Vector2] = sim.compute_smooth_path(from, destination, INFANTRY_RADIUS)
	if not path.is_empty() and not path.back().is_equal_approx(destination):
		path.clear()
	return path

func _route_length(from: Vector2, route: Array[Vector2]) -> float:
	var length := 0.0
	for point in route:
		length += from.distance_to(point)
		from = point
	return length

func _position(entry: Dictionary) -> Vector2:
	return Vector2(entry.x, entry.y)
