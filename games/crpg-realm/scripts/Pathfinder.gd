extends RefCounted
class_name Pathfinder

## Pathfinder: Collision-aware intelligent navigation engine for RobOS cRPG.
## Computes collision-free routes around walls, through doorways, and around obstacles
## using line-of-sight raycasting, AStarGrid2D obstacle rasterization, and String-Pulling funnel smoothing.

static var _cached_grid: AStarGrid2D = null
static var _cached_scene_id: int = 0
static var _cached_cell_size: Vector2 = Vector2(20.0, 20.0)
static var _cached_bounds: Rect2 = Rect2(0, 0, 2560, 1440)

## Invalidates the cached AStarGrid2D, forcing a rebuild on next path query.
static func invalidate_grid() -> void:
	_cached_grid = null
	_cached_scene_id = 0

## Checks if a line between two positions is clear of obstacles on layer 1.
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
	q_center.collide_with_bodies = true
	q_center.collide_with_areas = false
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
	q_left.collide_with_bodies = true
	q_left.collide_with_areas = false
	q_left.exclude = exclude
	if not space.intersect_ray(q_left).is_empty():
		return false

	var q_right = PhysicsRayQueryParameters2D.create(from_pos - perp, to_pos - perp)
	q_right.collision_mask = 1
	q_right.collide_with_bodies = true
	q_right.collide_with_areas = false
	q_right.exclude = exclude
	if not space.intersect_ray(q_right).is_empty():
		return false

	return true

## Computes scene boundaries from hero camera limits, background rects, or default canvas.
static func get_scene_bounds(scene: Node) -> Rect2:
	if scene:
		var hero = scene.get_node_or_null("HeroPlayer")
		if hero and "camera_limit_right" in hero and hero.camera_limit_right > 0:
			return Rect2(
				float(hero.camera_limit_left),
				float(hero.camera_limit_top),
				float(hero.camera_limit_right - hero.camera_limit_left),
				float(hero.camera_limit_bottom - hero.camera_limit_top)
			)
		var room_bg = scene.get_node_or_null("RoomBG") as Control
		if room_bg and room_bg.size.x > 0:
			return Rect2(room_bg.position, room_bg.size)
		var bg = scene.get_node_or_null("Background") as Control
		if bg and bg.size.x > 0:
			return Rect2(bg.position, bg.size)
	return Rect2(0, 0, 2560, 1440)

## Builds or returns the cached AStarGrid2D for the current scene.
static func get_or_build_grid(world_2d: World2D, scene: Node = null) -> AStarGrid2D:
	var cur_id = scene.get_instance_id() if scene else 0
	if _cached_grid != null and _cached_scene_id == cur_id and cur_id != 0:
		return _cached_grid

	if not world_2d or not world_2d.direct_space_state:
		return null

	var bounds = get_scene_bounds(scene)
	var cell_sz = _cached_cell_size
	var cols = int(bounds.size.x / cell_sz.x) + 1
	var rows = int(bounds.size.y / cell_sz.y) + 1

	var grid = AStarGrid2D.new()
	grid.region = Rect2i(0, 0, cols, rows)
	grid.cell_size = cell_sz
	grid.offset = cell_sz * 0.5 + bounds.position
	grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_EUCLIDEAN
	grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_EUCLIDEAN
	grid.update()

	# Rasterize collision obstacles on Layer 1 using circle shape query for character body clearance
	var space = world_2d.direct_space_state
	var circle_shape = CircleShape2D.new()
	circle_shape.radius = 14.0
	var shape_query = PhysicsShapeQueryParameters2D.new()
	shape_query.shape = circle_shape
	shape_query.collision_mask = 1
	shape_query.collide_with_bodies = true
	shape_query.collide_with_areas = false

	var origin_x = bounds.position.x
	var origin_y = bounds.position.y

	for y in range(rows):
		for x in range(cols):
			var world_pos = Vector2(origin_x + x * cell_sz.x + cell_sz.x * 0.5, origin_y + y * cell_sz.y + cell_sz.y * 0.5)
			shape_query.transform = Transform2D(0.0, world_pos)
			var hits = space.intersect_shape(shape_query, 1)
			if not hits.is_empty():
				grid.set_point_solid(Vector2i(x, y), true)

	_cached_grid = grid
	_cached_scene_id = cur_id
	_cached_bounds = bounds
	return grid

## Finds the nearest walkable cell to the given cell within max_radius rings.
static func find_nearest_walkable_cell(grid: AStarGrid2D, cell: Vector2i, max_radius: int = 8) -> Vector2i:
	if not grid.is_point_solid(cell):
		return cell
	var best_cell = cell
	var min_dist_sq = INF
	for r in range(1, max_radius + 1):
		for dx in range(-r, r + 1):
			for dy in range(-r, r + 1):
				if maxi(absi(dx), absi(dy)) != r:
					continue
				var c = cell + Vector2i(dx, dy)
				if grid.region.has_point(c) and not grid.is_point_solid(c):
					var d = dx * dx + dy * dy
					if d < min_dist_sq:
						min_dist_sq = d
						best_cell = c
		if min_dist_sq < INF:
			return best_cell
	return cell

## Main entry point: Computes collision-free path from start_pos to target_pos.
static func get_nav_path(world_2d: World2D, start_pos: Vector2, target_pos: Vector2, scene: Node = null, exclude: Array[RID] = []) -> PackedVector2Array:
	# 1. Direct clear line check: if direct route is unobstructed, go directly!
	if is_line_clear(world_2d, start_pos, target_pos, 10.0, exclude):
		return PackedVector2Array([target_pos])

	# 2. Get or construct AStarGrid2D
	var grid = get_or_build_grid(world_2d, scene)
	if not grid:
		return _legacy_nav_points_path(world_2d, start_pos, target_pos, scene, exclude)

	var cell_sz = _cached_cell_size
	var origin = _cached_bounds.position
	var start_cell = Vector2i(int((start_pos.x - origin.x) / cell_sz.x), int((start_pos.y - origin.y) / cell_sz.y))
	var target_cell = Vector2i(int((target_pos.x - origin.x) / cell_sz.x), int((target_pos.y - origin.y) / cell_sz.y))

	start_cell.x = clampi(start_cell.x, grid.region.position.x, grid.region.end.x - 1)
	start_cell.y = clampi(start_cell.y, grid.region.position.y, grid.region.end.y - 1)
	target_cell.x = clampi(target_cell.x, grid.region.position.x, grid.region.end.x - 1)
	target_cell.y = clampi(target_cell.y, grid.region.position.y, grid.region.end.y - 1)

	var target_was_solid = grid.is_point_solid(target_cell)
	start_cell = find_nearest_walkable_cell(grid, start_cell, 8)
	target_cell = find_nearest_walkable_cell(grid, target_cell, 8)

	var raw_path = grid.get_point_path(start_cell, target_cell)
	if raw_path.is_empty():
		return PackedVector2Array()

	# 3. Assemble full path: start_pos -> grid waypoints -> (target_pos if not solid)
	var full_path: PackedVector2Array = []
	full_path.append(start_pos)
	for pt in raw_path:
		full_path.append(pt)

	if not target_was_solid and is_line_clear(world_2d, full_path[full_path.size() - 1], target_pos, 8.0, exclude):
		full_path.append(target_pos)

	# 4. Funnel smoothing (String-Pulling)
	var smoothed = smooth_path(world_2d, full_path, exclude)

	# Exclude start_pos (first point) since character is already at start_pos
	if smoothed.size() > 1 and smoothed[0].distance_to(start_pos) < 8.0:
		return smoothed.slice(1)

	return smoothed

## String-Pulling Funnel Algorithm: Eliminates grid stair-stepping by raycasting forward to the furthest visible waypoint.
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

## Legacy fallback pathfinding using hand-placed nav points if world_2d space state is unavailable.
static func _legacy_nav_points_path(world_2d: World2D, start_pos: Vector2, target_pos: Vector2, scene: Node = null, exclude: Array[RID] = []) -> PackedVector2Array:
	var nav_points: Array[Vector2] = []
	if scene and scene.has_method("get_nav_points"):
		nav_points = scene.get_nav_points()

	if nav_points.is_empty():
		return PackedVector2Array([target_pos])

	var astar = AStar2D.new()
	var start_id = 90001
	var target_id = 90002

	astar.add_point(start_id, start_pos)
	astar.add_point(target_id, target_pos)

	for i in range(nav_points.size()):
		astar.add_point(i + 1, nav_points[i])

	for i in range(nav_points.size()):
		var np = nav_points[i]
		if is_line_clear(world_2d, start_pos, np, 8.0, exclude):
			astar.connect_points(start_id, i + 1)

	for i in range(nav_points.size()):
		var np = nav_points[i]
		if is_line_clear(world_2d, np, target_pos, 8.0, exclude):
			astar.connect_points(i + 1, target_id)

	for i in range(nav_points.size()):
		for j in range(i + 1, nav_points.size()):
			var pA = nav_points[i]
			var pB = nav_points[j]
			if is_line_clear(world_2d, pA, pB, 8.0, exclude):
				astar.connect_points(i + 1, j + 1)

	var raw_path = astar.get_point_path(start_id, target_id)
	if raw_path.size() <= 1:
		return PackedVector2Array([target_pos])

	var smoothed = smooth_path(world_2d, raw_path, exclude)
	if smoothed.size() > 1 and smoothed[0].distance_to(start_pos) < 5.0:
		return smoothed.slice(1)

	return smoothed
