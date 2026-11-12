extends RefCounted

const CELL_SIZE := preload("res://scripts/engine/RTSVision.gd").CELL_SIZE
const UPDATE_TICKS := 32
const SPREAD_TICKS := 128
const DECAY_DELAY_TICKS := 192
const DECAY_RING_TICKS := 64
const DIRECTIONS := [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]

var extent: Vector2
var size: Vector2i
var revision := 0
var cells: Dictionary = {} # Cell -> owner -> covering source count.
var _sources: Dictionary = {}
var _decaying: Dictionary = {} # Cell -> owner -> expiry tick.

func _init(width: float, height: float) -> void:
	extent = Vector2(width, height)
	size = Vector2i((extent / CELL_SIZE).ceil())

func _cell_at(position: Vector2) -> Vector2i:
	return Vector2i((position / CELL_SIZE).floor())

func cell_rect(cell: Vector2i) -> Rect2:
	return Rect2(Vector2(cell) * CELL_SIZE, Vector2.ONE * CELL_SIZE).intersection(Rect2(Vector2.ZERO, extent))

func cell_center(cell: Vector2i) -> Vector2:
	return cell_rect(cell).get_center()

func covers(position: Vector2, owner: int = 0, require_source: bool = false) -> bool:
	if not Rect2(Vector2.ZERO, extent).has_point(position):
		return false
	var counts: Dictionary = cells.get(_cell_at(position), {})
	if require_source:
		return int(counts.get(owner, 0)) > 0
	return not counts.is_empty() if owner == 0 else counts.has(owner)

func update(units: Dictionary, tick: int, can_spread: Callable, ladder_interval: int = 0) -> void:
	for tag in _sources.keys():
		var unit: Dictionary = units.get(tag, {})
		var source: Dictionary = _sources[tag]
		if not _eligible(unit) or unit.owner != source.owner or _cell_at(unit.pos) != source.origin:
			_retire_source(source, tick, ladder_interval)
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
			if unit.get("generating_creep", false):
				_sources[tag]["half_extent"] = unit.creep_half_extent
			_add_coverage(origin, unit.owner)
		var source: Dictionary = _sources[tag]
		if tick >= source.next_tick and not source.frontier.is_empty():
			_spread(source, can_spread)
			var interval := UPDATE_TICKS if source.has("half_extent") else SPREAD_TICKS
			source.next_tick = tick + (ladder_interval if ladder_interval > 0 else interval)
	_expire_coverage(tick)

func _eligible(unit: Dictionary) -> bool:
	return (float(unit.get("living_ground_radius", 0.0)) > 0.0 and unit.hp > 0.0
		and unit.build_progress >= 1.0 and unit.owner > 0 and
		(unit.flight_height <= 0.0 or (unit.get("generating_creep", false) and unit.orders.is_empty() and unit.vel.length_squared() < 0.01)))

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
			if source.has("half_extent"):
				var delta := (to - origin).abs()
				# A cell touched by the footprint contributes cover on the coarse vision grid.
				if delta.x > float(source.half_extent.x) + CELL_SIZE * 0.5 or delta.y > float(source.half_extent.y) + CELL_SIZE * 0.5:
					continue
			covered[candidate] = true
			next_frontier.append(candidate)
			_add_coverage(candidate, source.owner)
	source.frontier = next_frontier

func _add_coverage(cell: Vector2i, owner: int) -> void:
	var counts: Dictionary = cells.get(cell, {})
	if not counts.has(owner):
		revision += 1
	counts[owner] = int(counts.get(owner, 0)) + 1
	cells[cell] = counts
	if _decaying.has(cell):
		var expires: Dictionary = _decaying[cell]
		expires.erase(owner)
		if expires.is_empty():
			_decaying.erase(cell)

func _retire_source(source: Dictionary, tick: int, ladder_interval: int) -> void:
	var owner: int = source.owner
	var origin := cell_center(source.origin)
	var delay := ladder_interval if ladder_interval > 0 else DECAY_DELAY_TICKS
	var interval := ladder_interval if ladder_interval > 0 else DECAY_RING_TICKS
	for cell in source.covered:
		var counts: Dictionary = cells[cell]
		counts[owner] = int(counts[owner]) - 1
		if counts[owner] == 0:
			var rings := floori(maxf(0.0, float(source.radius) - origin.distance_to(cell_center(cell))) / CELL_SIZE)
			var expires: Dictionary = _decaying.get(cell, {})
			expires[owner] = tick + delay + rings * interval
			_decaying[cell] = expires

func _expire_coverage(tick: int) -> void:
	for cell in _decaying.keys():
		var expires: Dictionary = _decaying[cell]
		var counts: Dictionary = cells[cell]
		for owner in expires.keys():
			if tick >= int(expires[owner]):
				expires.erase(owner)
				counts.erase(owner)
				revision += 1
		if expires.is_empty():
			_decaying.erase(cell)
		if counts.is_empty():
			cells.erase(cell)
