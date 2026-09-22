extends RefCounted
class_name Pathfinder

## Pathfinder: Collision-aware intelligent navigation engine for RobOS cRPG.
## Computes collision-free routes around walls, through doorways, and around obstacles
## using line-of-sight raycasting, scene navigation nodes, and A* pathfinding.

static func is_line_clear(world_2d: World2D, from_pos: Vector2, to_pos: Vector2, check_radius: float = 12.0, exclude: Array[RID] = []) -> bool:
	if not world_2d:
		return true
	var space = world_2d.direct_space_state
	if not space:
		return true
	if from_pos.distance_to(to_pos) < 5.0:
		return true

	# 1. Center ray
	var q_center = PhysicsRayQueryParameters2D.create(from_pos, to_pos)
	q_center.collision_mask = 1
	q_center.exclude = exclude
	var hit = space.intersect_ray(q_center)
	if not hit.is_empty():
		return false

	# 2. Side offset rays (to ensure character body circle clears corners)
	var dir = (to_pos - from_pos).normalized()
	if dir == Vector2.ZERO:
		return true
	var perp = Vector2(-dir.y, dir.x) * check_radius

	var q_left = PhysicsRayQueryParameters2D.create(from_pos + perp, to_pos + perp)
	q_left.collision_mask = 1
	q_left.exclude = exclude
	if not space.intersect_ray(q_left).is_empty():
		return false

	var q_right = PhysicsRayQueryParameters2D.create(from_pos - perp, to_pos - perp)
	q_right.collision_mask = 1
	q_right.exclude = exclude
	if not space.intersect_ray(q_right).is_empty():
		return false

	return true

static func get_nav_path(world_2d: World2D, start_pos: Vector2, target_pos: Vector2, scene: Node = null, exclude: Array[RID] = []) -> PackedVector2Array:
	# 1. Direct clear line check: if no walls block the direct route, move directly!
	if is_line_clear(world_2d, start_pos, target_pos, 10.0, exclude):
		return PackedVector2Array([target_pos])

	# 2. Collect Scene Navigation Waypoints
	var nav_points: Array[Vector2] = []
	if scene and scene.has_method("get_nav_points"):
		nav_points = scene.get_nav_points()

	if nav_points.is_empty():
		return PackedVector2Array([target_pos])

	# 3. Build AStar2D graph connecting navigable points
	var astar = AStar2D.new()
	var start_id = 90001
	var target_id = 90002

	astar.add_point(start_id, start_pos)
	astar.add_point(target_id, target_pos)

	for i in range(nav_points.size()):
		astar.add_point(i + 1, nav_points[i])

	# Connect start to all visible scene nav points
	var connected_to_start = 0
	for i in range(nav_points.size()):
		var np = nav_points[i]
		if is_line_clear(world_2d, start_pos, np, 8.0, exclude):
			astar.connect_points(start_id, i + 1)
			connected_to_start += 1

	if connected_to_start == 0:
		var closest_idx = _find_closest(start_pos, nav_points)
		if closest_idx != -1:
			astar.connect_points(start_id, closest_idx + 1)

	# Connect target to all visible scene nav points
	var connected_to_target = 0
	for i in range(nav_points.size()):
		var np = nav_points[i]
		if is_line_clear(world_2d, np, target_pos, 8.0, exclude):
			astar.connect_points(i + 1, target_id)
			connected_to_target += 1

	if connected_to_target == 0:
		var closest_idx = _find_closest(target_pos, nav_points)
		if closest_idx != -1:
			astar.connect_points(closest_idx + 1, target_id)

	# Connect scene nav points to each other if line of sight is clear
	for i in range(nav_points.size()):
		for j in range(i + 1, nav_points.size()):
			var pA = nav_points[i]
			var pB = nav_points[j]
			if is_line_clear(world_2d, pA, pB, 8.0, exclude):
				astar.connect_points(i + 1, j + 1)

	# Query path from start to target
	var raw_path = astar.get_point_path(start_id, target_id)
	if raw_path.size() <= 1:
		return PackedVector2Array([target_pos])

	# 4. Funnel smoothing: skip intermediate nodes where direct line is clear
	var smoothed = smooth_path(world_2d, raw_path, exclude)

	# Exclude start_pos (first point) since character is already at start_pos
	if smoothed.size() > 1 and smoothed[0].distance_to(start_pos) < 5.0:
		return smoothed.slice(1)

	return smoothed

static func smooth_path(world_2d: World2D, raw_path: PackedVector2Array, exclude: Array[RID] = []) -> PackedVector2Array:
	if raw_path.size() <= 2:
		return raw_path

	var result: PackedVector2Array = []
	result.append(raw_path[0])

	var current_idx = 0
	while current_idx < raw_path.size() - 1:
		var furthest_idx = current_idx + 1
		for next_idx in range(raw_path.size() - 1, current_idx, -1):
			if is_line_clear(world_2d, raw_path[current_idx], raw_path[next_idx], 8.0, exclude):
				furthest_idx = next_idx
				break
		result.append(raw_path[furthest_idx])
		current_idx = furthest_idx

	return result

static func _find_closest(pos: Vector2, points: Array[Vector2]) -> int:
	var min_dist = INF
	var best_idx = -1
	for i in range(points.size()):
		var d = pos.distance_to(points[i])
		if d < min_dist:
			min_dist = d
			best_idx = i
	return best_idx
