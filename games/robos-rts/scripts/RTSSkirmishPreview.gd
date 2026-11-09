extends Control

const LAND := Color("#273b3c")
const WATER := Color("#23475d")
const RIDGE := Color("#53616a")
const BRUSH := Color("#45624e")
const START := Color("#ffce72")
const EXPANSION := Color("#70def3")
const SPECIAL := Color("#f6a990")
const TEXT := Color("#d9e7ef")

var _data: Dictionary = {}

func set_map(data: Dictionary) -> void:
	_data = data
	queue_redraw()

func preview_state() -> Dictionary:
	if _data.is_empty() or not visible:
		return {}
	var layout: Dictionary = _data.map
	return {"map_id": _data.map_id, "starts": layout.starts.size(),
		"expansions": layout.get("expansions", []).size(), "bridges": layout.get("bridges", []).size(),
		"watch_stations": layout.get("watch_stations", []).size(), "route_blockers": layout.get("route_blockers", []).size()}

func _draw() -> void:
	if _data.is_empty():
		return
	var layout: Dictionary = _data.map
	var font := ThemeDB.fallback_font
	draw_rect(Rect2(Vector2.ZERO, size), Color("#111b27"))
	draw_rect(Rect2(Vector2.ZERO, size), Color("#426578"), false, 2.0)
	draw_string(font, Vector2(15, 33), "BATTLEFIELD PREVIEW", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, TEXT)
	var dimensions := Vector2(layout.width, layout.height)
	var space := Rect2(Vector2(14, 50), size - Vector2(28, 96))
	var scale_factor := minf(space.size.x / dimensions.x, space.size.y / dimensions.y)
	var field := Rect2(space.get_center() - dimensions * scale_factor * 0.5, dimensions * scale_factor)
	draw_rect(field, LAND)
	for channel in layout.get("water_channels", []):
		var points := PackedVector2Array()
		for point in channel.points:
			points.append(field.position + Vector2(point[0], point[1]) * scale_factor)
		if points.size() >= 2:
			draw_polyline(points, WATER, float(channel.width) * scale_factor, true)
	for bridge in layout.get("bridges", []):
		_draw_rect_feature(bridge, field.position, scale_factor, Color("#9a8c6a"))
	for layer in ["obstacles", "high_ground", "ramps"]:
		for feature in layout.get(layer, []):
			_draw_rect_feature(feature, field.position, scale_factor, RIDGE if layer != "ramps" else Color("#758679"))
	for tile in layout.get("terrain_tiles", []):
		var point := _point(tile, field.position, scale_factor)
		var color: Color = {"water": WATER, "brush": BRUSH, "cliff": RIDGE, "plateau": RIDGE}.get(tile.terrain, LAND)
		draw_rect(Rect2(point, Vector2.ONE * 4.0 * scale_factor), color)
	for station in layout.get("watch_stations", []):
		var point := _point(station, field.position, scale_factor)
		draw_colored_polygon(PackedVector2Array([point + Vector2.UP * 4, point + Vector2.RIGHT * 4,
			point + Vector2.DOWN * 4, point + Vector2.LEFT * 4]), SPECIAL)
	for blocker in layout.get("route_blockers", []):
		var point := _point(blocker, field.position, scale_factor)
		draw_line(point - Vector2(3, 3), point + Vector2(3, 3), SPECIAL, 1.5, true)
		draw_line(point + Vector2(3, -3), point + Vector2(-3, 3), SPECIAL, 1.5, true)
	for expansion in layout.get("expansions", []):
		draw_circle(_point(expansion, field.position, scale_factor), 4.0, EXPANSION)
	for i in range(layout.starts.size()):
		var point := _point(layout.starts[i], field.position, scale_factor)
		draw_rect(Rect2(point - Vector2(6, 6), Vector2(12, 12)), START)
		draw_string(font, point + Vector2(-3, 4), str(i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("#17222a"))
	draw_rect(field, Color("#647b87"), false, 1.0)
	_draw_legend(Vector2(18, size.y - 19), "Starts", START)
	_draw_legend(Vector2(103, size.y - 19), "Expansions", EXPANSION)
	_draw_legend(Vector2(229, size.y - 19), "Stations and blockers", SPECIAL)

func _draw_legend(point: Vector2, label: String, color: Color) -> void:
	draw_circle(point + Vector2(3, -5), 3.0, color)
	draw_string(ThemeDB.fallback_font, point + Vector2(13, 0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, TEXT)

func _draw_rect_feature(entry: Dictionary, origin: Vector2, scale_factor: float, color: Color) -> void:
	var dimensions := Vector2(entry.get("w", entry.get("width", 4)), entry.get("h", entry.get("height", 4)))
	draw_rect(Rect2(_point(entry, origin, scale_factor), dimensions * scale_factor), color)

func _point(entry: Dictionary, origin: Vector2, scale_factor: float) -> Vector2:
	return origin + Vector2(entry.x, entry.y) * scale_factor
