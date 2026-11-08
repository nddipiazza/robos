extends RefCounted

# One deterministic grid for scouting, target acquisition and both renderers.
const CELL_SIZE := 4.0
const UNEXPLORED := 0
const EXPLORED := 1
const VISIBLE := 2

class PlayerSight:
	var cells := PackedByteArray()
	var last_seen := PackedInt32Array()
	var row_deltas := PackedInt32Array()
	var buildings := {}

var size := Vector2i.ZERO
var revision := 0
var _players := {}
var _disks := {}

func _init(width: float, height: float, players: Array) -> void:
	size = Vector2i(ceili(width / CELL_SIZE), ceili(height / CELL_SIZE))
	for player in players:
		var sight := PlayerSight.new()
		sight.cells.resize(size.x * size.y)
		sight.last_seen.resize(size.x * size.y)
		sight.row_deltas.resize((size.x + 1) * size.y)
		_players[player] = sight

func _cell(pos: Vector2) -> Vector2i:
	return Vector2i((pos / CELL_SIZE).floor()).clamp(Vector2i.ZERO, size - Vector2i.ONE)

func state_at(player: int, pos: Vector2) -> int:
	var sight: PlayerSight = _players.get(player)
	if sight == null:
		return UNEXPLORED
	var cell := _cell(pos)
	return sight.cells[cell.y * size.x + cell.x]

func last_seen_at(player: int, pos: Vector2) -> int:
	var cell := _cell(pos)
	return _players[player].last_seen[cell.y * size.x + cell.x]

func cells_for(player: int) -> PackedByteArray:
	var sight: PlayerSight = _players.get(player)
	return sight.cells if sight != null else PackedByteArray()

func buildings_for(player: int) -> Array:
	var sight: PlayerSight = _players.get(player)
	return sight.buildings.values() if sight != null else []

func _disk(radius: float) -> PackedInt32Array:
	if not _disks.has(radius):
		var extent := floori(radius / CELL_SIZE)
		var radius_cells := radius / CELL_SIZE
		var spans := PackedInt32Array()
		for y in range(-extent, extent + 1):
			spans.append(floori(sqrt(radius_cells * radius_cells - y * y)))
		_disks[radius] = spans
	return _disks[radius]

func update(units: Dictionary, tick: int) -> void:
	var stride := size.x + 1
	for sight in _players.values():
		sight.row_deltas.fill(0)
	var structures: Array = []
	for unit in units.values():
		var sight: PlayerSight = _players.get(unit.owner)
		if sight == null or unit.hp <= 0.0:
			continue
		if unit.is_structure:
			structures.append(unit)
		var center := _cell(unit.pos)
		var spans := _disk(unit.sight_range)
		var top := center.y - (spans.size() >> 1)
		# Mark the ends of each covered row. Overlapping units cost O(radius)
		# each, regardless of how many tiles they reveal.
		for row in range(maxi(0, top), mini(size.y, top + spans.size())):
			var reach := spans[row - top]
			var offset := row * stride
			sight.row_deltas[offset + maxi(0, center.x - reach)] += 1
			sight.row_deltas[offset + mini(size.x, center.x + reach + 1)] -= 1

	for player in _players:
		var sight: PlayerSight = _players[player]
		for y in range(size.y):
			var coverage := 0
			for x in range(size.x):
				coverage += sight.row_deltas[y * stride + x]
				var index := y * size.x + x
				if coverage > 0:
					sight.cells[index] = VISIBLE
					sight.last_seen[index] = tick + 1
				elif sight.cells[index] == VISIBLE:
					sight.cells[index] = EXPLORED
		# A hidden building is a snapshot. Remove it only when its old site
		# comes into view and can be confirmed empty.
		for tag in sight.buildings.keys():
			var old: Dictionary = sight.buildings[tag]
			if state_at(player, old.pos) != VISIBLE:
				continue
			var live: Dictionary = units.get(tag, {})
			if live.is_empty() or live.hp <= 0.0 or not live.is_structure or live.pos != old.pos:
				sight.buildings.erase(tag)
		for building in structures:
			if building.owner != player and state_at(player, building.pos) == VISIBLE:
				sight.buildings[building.tag] = {
					"tag": building.tag, "owner": building.owner,
					"unit_type": building.unit_type, "name": building.name,
					"radius": building.radius, "pos": building.pos,
				}
	revision += 1
