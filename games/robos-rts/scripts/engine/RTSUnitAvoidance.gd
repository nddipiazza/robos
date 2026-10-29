extends RefCounted

# Short-lived local routes complement terrain A*. A shared bounded grid serves
# at most one replan per owner per tick; mobile bodies never enter the terrain grid.
const HALF := 15
const SIDE := HALF * 2 + 1
var grid := AStarGrid2D.new()
var last_plan_tick: Dictionary = {}

func _init() -> void:
	grid.region = Rect2i(0, 0, SIDE, SIDE)
	grid.cell_size = Vector2.ONE
	grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.update()

func reset() -> void:
	last_plan_tick.clear()

func _relevant(u: Dictionary, n: Dictionary, direction: Vector2) -> bool:
	if n.tag == u.tag or n.get("is_walkable_structure", false):
		return false
	if n.owner == u.owner and not n.is_structure and not n.is_immobile:
		# Preserve higher-priority vehicles pushing idle workers aside. Moving
		# teammates sharing the lane can lead the way instead of becoming walls.
		if u.push_priority > n.push_priority and n.orders.is_empty():
			return false
		if n.vel.dot(direction) > u.speed * 0.6:
			return false
	return true

func _segment_distance_squared(point: Vector2, from: Vector2, to: Vector2) -> float:
	var delta = to - from
	var t = clampf((point - from).dot(delta) / maxf(delta.length_squared(), 0.0001), 0.0, 1.0)
	return point.distance_squared_to(from + delta * t)

func waypoint(sim: Node, u: Dictionary, goal: Vector2) -> Vector2:
	var path: Array = u.crowd_path
	if u.crowd_goal.distance_to(goal) > 4.0 or sim.tick >= u.crowd_until:
		path.clear()
	if not path.is_empty():
		var blocker: Dictionary = sim.units.get(u.crowd_blocker, {})
		if blocker.is_empty() or blocker.pos.distance_to(u.crowd_blocker_pos) > 1.5:
			path.clear()
	while not path.is_empty() and u.pos.distance_to(path[0]) < 0.4:
		path.pop_front()
	if not path.is_empty():
		return path[0]
	if sim.tick < u.crowd_retry_tick:
		return goal
	var direction: Vector2 = (goal - u.pos).normalized()
	var lookahead = minf(4.5, u.pos.distance_to(goal))
	var end: Vector2 = u.pos + direction * lookahead
	var blocked = false
	var blocking_tag = 0
	for n in sim.query_units_in_radius(u.pos, lookahead + u.radius):
		if n.owner != u.owner or not _relevant(u, n, direction):
			continue
		if (n.pos - u.pos).dot(direction) < 0.1:
			continue
		if _segment_distance_squared(n.pos, u.pos, end) < pow(u.radius + n.radius + 0.2, 2):
			blocked = true
			blocking_tag = n.tag
			break
	if not blocked or last_plan_tick.get(u.owner, -1) == sim.tick:
		return goal
	last_plan_tick[u.owner] = sim.tick
	u.crowd_retry_tick = sim.tick + 24 + u.tag % 8
	var route = _plan(sim, u, goal, direction)
	if route.is_empty():
		return goal
	u.crowd_path = route
	u.crowd_goal = goal
	u.crowd_until = sim.tick + 160
	u.crowd_blocker = blocking_tag
	u.crowd_blocker_pos = sim.units[blocking_tag].pos
	sim.battle_stats.count(u.tag, "allied_detours")
	return route[0]

func _plan(sim: Node, u: Dictionary, goal: Vector2, direction: Vector2) -> Array:
	var origin: Vector2 = u.pos - Vector2(HALF, HALF)
	var bodies: Array = []
	for n in sim.query_units_in_radius(u.pos, 22.0):
		if _relevant(u, n, direction):
			bodies.append(n)
	var cliff_walk: bool = u.unit_type == "spire_walker"
	for y in range(SIDE):
		for x in range(SIDE):
			var point = origin + Vector2(x, y)
			grid.set_point_solid(Vector2i(x, y), sim._is_point_blocked_by_static(point, u.radius) if not cliff_walk else (point.x < u.radius or point.y < u.radius or point.x > sim.map_width-u.radius or point.y > sim.map_height-u.radius))
	for n in bodies:
		var radius: float = u.radius + n.radius + 0.2
		var center: Vector2 = n.pos - origin
		for y in range(maxi(0, int(floor(center.y-radius))), mini(SIDE, int(ceil(center.y+radius))+1)):
			for x in range(maxi(0, int(floor(center.x-radius))), mini(SIDE, int(ceil(center.x+radius))+1)):
				if Vector2(x,y).distance_squared_to(center) < radius * radius:
					grid.set_point_solid(Vector2i(x,y), true)
	var start = Vector2i(HALF, HALF)
	grid.set_point_solid(start, false)
	var desired: Vector2 = u.pos + direction * minf(12.0, u.pos.distance_to(goal))
	var destination = Vector2i(roundi(desired.x-origin.x), roundi(desired.y-origin.y))
	if grid.is_point_solid(destination):
		var best = INF
		for y in range(SIDE):
			for x in range(SIDE):
				var cell = Vector2i(x,y)
				if grid.is_point_solid(cell):
					continue
				var score = (origin + Vector2(cell)).distance_squared_to(desired)
				if score < best:
					best = score
					destination = cell
	var raw = grid.get_point_path(start, destination)
	var route: Array = []
	var anchor: Vector2 = u.pos
	var index = 1
	while index < raw.size():
		var furthest = index
		for probe in range(index + 1, mini(index + 12, raw.size())):
			var next: Vector2 = origin + raw[probe]
			if not cliff_walk and not sim._has_clear_line_of_walk(anchor, next, u.radius):
				break
			var clear = true
			for n in bodies:
				if _segment_distance_squared(n.pos, anchor, next) < pow(u.radius + n.radius + 0.15, 2):
					clear = false
					break
			if not clear:
				break
			furthest = probe
		anchor = origin + raw[furthest]
		route.append(anchor)
		index = furthest + 1
	return route
