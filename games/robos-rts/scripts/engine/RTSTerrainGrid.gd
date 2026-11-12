extends RefCounted

# One byte per height vertex and per pathing cell, encoded by row in the
# scenario asset. Heights are signed sixteenths biased by 128.
const CLIFF := 1
const WATER := 2
const NO_BUILD := 3
const ROAD := 4
const WATER_SURFACE := -3.0

var size: Vector2i
var bounds: Rect2
var heights := PackedByteArray()
var cells := PackedByteArray()
var blocked_rows: Array[Array] = []

func load_grid(path: String, dimensions: Vector2i) -> bool:
	if not FileAccess.file_exists(path):
		return false
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not data is Dictionary:
		return false
	size = dimensions
	var region: Array = data.get("playable_bounds", [])
	if region.size() != 4:
		return false
	bounds = Rect2(region[0], region[1], region[2], region[3])
	if not bounds.has_area() or not Rect2(Vector2.ZERO, Vector2(size)).encloses(bounds):
		return false
	heights = _decode_rows(data.get("height_rows", []), size + Vector2i.ONE)
	cells = _decode_rows(data.get("pathing_rows", []), size)
	if heights.is_empty() or cells.is_empty():
		return false
	for y in size.y:
		var runs: Array = []
		var x := 0
		while x < size.x:
			var kind := cell_at(x, y)
			var end := x + 1
			while end < size.x and cell_at(end, y) == kind:
				end += 1
			if kind != 0:
				runs.append([Rect2(x, y, end - x, 1), kind])
			x = end
		blocked_rows.append(runs)
	return true

func _decode_rows(rows: Array, dimensions: Vector2i) -> PackedByteArray:
	var bytes := PackedByteArray()
	if rows.size() != dimensions.y:
		return bytes
	for row in rows:
		var decoded := Marshalls.base64_to_raw(row)
		if decoded.size() != dimensions.x:
			return PackedByteArray()
		bytes.append_array(decoded)
	return bytes

func cell_at(x: int, y: int) -> int:
	return cells[y * size.x + x] & 3

func road_at(x: int, y: int) -> bool:
	return (cells[y * size.x + x] & ROAD) != 0

func vertex_height(x: int, y: int) -> float:
	return (float(heights[y * (size.x + 1) + x]) - 128.0) / 16.0

func elevation_at(position: Vector2) -> float:
	var point := position.clamp(Vector2.ZERO, Vector2(size))
	var x := mini(floori(point.x), size.x - 1)
	var y := mini(floori(point.y), size.y - 1)
	var u := point.x - x
	var v := point.y - y
	var a := vertex_height(x, y)
	var b := vertex_height(x + 1, y)
	var c := vertex_height(x, y + 1)
	var d := vertex_height(x + 1, y + 1)
	# Match the diagonal used by the terrain mesh.
	if u + v <= 1.0:
		return a + (b - a) * u + (c - a) * v
	return d + (c - d) * (1.0 - u) + (b - d) * (1.0 - v)

func blocks(kind: int, ignore_cliffs: bool, building: bool = false) -> bool:
	return kind == WATER or (kind == CLIFF and not ignore_cliffs) or (kind == NO_BUILD and building)

func overlaps(point: Vector2, radius: float, ignore_cliffs: bool, building: bool = false, water_only: bool = false) -> bool:
	for y in range(maxi(0, floori(point.y - radius)), mini(size.y, floori(point.y + radius) + 1)):
		for run in blocked_rows[y]:
			var rect: Rect2 = run[0]
			if rect.position.x > point.x + radius:
				break
			var kind: int = run[1]
			if (kind == WATER if water_only else blocks(kind, ignore_cliffs, building)) and rect.grow(radius).has_point(point):
				return true
	return false

func blocks_segment(from: Vector2, to: Vector2, radius: float, ignore_cliffs: bool, enters_rect: Callable) -> bool:
	var left := minf(from.x, to.x) - radius
	var right := maxf(from.x, to.x) + radius
	for y in range(maxi(0, floori(minf(from.y, to.y) - radius)), mini(size.y, floori(maxf(from.y, to.y) + radius) + 1)):
		for run in blocked_rows[y]:
			var rect: Rect2 = run[0]
			if rect.position.x > right:
				break
			if rect.end.x < left or not blocks(run[1], ignore_cliffs):
				continue
			var margin := rect.grow(radius)
			if not enters_rect.call(from, to, margin):
				continue
			# A unit placed against the lip can move away on its own side.
			if margin.has_point(from) and not rect.has_point(from) and not enters_rect.call(from, to, rect):
				if to.distance_squared_to(to.clamp(rect.position, rect.end)) > from.distance_squared_to(from.clamp(rect.position, rect.end)):
					continue
			return true
	return false
