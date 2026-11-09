extends RefCounted

const CELL_SIZE := preload("res://scripts/engine/RTSVision.gd").CELL_SIZE
const UPDATE_TICKS := 32
const SPREAD_TICKS := 128
const DIRECTIONS := [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]

var extent: Vector2
var size: Vector2i
var revision := 0
var cells: Dictionary = {} # Cell -> owner -> covering source count.
var _sources: Dictionary = {}

func _init(width: float, height: float) -> void:
	extent = Vector2(width, height)
	size = Vector2i((extent / CELL_SIZE).ceil())

func _cell_at(position: Vector2) -> Vector2i:
	return Vector2i((position / CELL_SIZE).floor())

func cell_rect(cell: Vector2i) -> Rect2:
	return Rect2(Vector2(cell) * CELL_SIZE, Vector2.ONE * CELL_SIZE).intersection(Rect2(Vector2.ZERO, extent))

func cell_center(cell: Vector2i) -> Vector2:
	return cell_rect(cell).get_center()

func covers(position: Vector2, owner: int = 0) -> bool:
	if not Rect2(Vector2.ZERO, extent).has_point(position):
		return false
	var counts: Dictionary = cells.get(_cell_at(position), {})
	return not counts.is_empty() if owner == 0 else counts.has(owner)

func update(units: Dictionary, tick: int, can_spread: Callable) -> void:
	for tag in _sources.keys():
		var unit: Dictionary = units.get(tag, {})
		var source: Dictionary = _sources[tag]
		if not _eligible(unit) or unit.owner != source.owner or _cell_at(unit.pos) != source.origin:
			for cell in source.covered:
				_change_coverage(cell, source.owner, -1)
			_sources.erase(tag)

	for unit in units.values():
		if not _eligible(unit):
			continue
		var tag: int = unit.tag
		if not _sources.has(tag):
			var origin := _cell_at(unit.pos)
			var center := cell_center(origin)
			if not Rect2i(Vector2i.ZERO, size).has_point(origin) or not can_spread.call(center, center):
				continue
			_sources[tag] = {
				"owner": unit.owner, "origin": origin, "radius": unit.living_ground_radius,
				"covered": {origin: true}, "frontier": [origin], "next_tick": tick,
			}
			_change_coverage(origin, unit.owner, 1)
		var source: Dictionary = _sources[tag]
		if tick >= source.next_tick and not source.frontier.is_empty():
			_spread(source, can_spread)
			source.next_tick = tick + SPREAD_TICKS

func _eligible(unit: Dictionary) -> bool:
	return float(unit.get("living_ground_radius", 0.0)) > 0.0 and unit.hp > 0.0 and unit.build_progress >= 1.0 and unit.owner > 0 and unit.flight_height <= 0.0

func _spread(source: Dictionary, can_spread: Callable) -> void:
	var origin := cell_center(source.origin)
	var radius_squared: float = source.radius * source.radius
	var covered: Dictionary = source.covered
	var next_frontier: Array[Vector2i] = []
	for cell in source.frontier:
		var from := cell_center(cell)
		for direction in DIRECTIONS:
			var candidate: Vector2i = cell + direction
			if covered.has(candidate) or not Rect2i(Vector2i.ZERO, size).has_point(candidate):
				continue
			var to := cell_center(candidate)
			if origin.distance_squared_to(to) > radius_squared or not can_spread.call(from, to):
				continue
			covered[candidate] = true
			next_frontier.append(candidate)
			_change_coverage(candidate, source.owner, 1)
	source.frontier = next_frontier

func _change_coverage(cell: Vector2i, owner: int, amount: int) -> void:
	var counts: Dictionary = cells.get(cell, {})
	var previous: int = counts.get(owner, 0)
	var count := previous + amount
	if count > 0:
		counts[owner] = count
		cells[cell] = counts
	else:
		counts.erase(owner)
		if counts.is_empty():
			cells.erase(cell)
	if previous == 0 or count == 0:
		revision += 1
