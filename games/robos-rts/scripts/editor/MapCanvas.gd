extends Control

# MapCanvas.gd — Top-down 2D editing surface for the Starfall Command Map Editor.
# Draws terrain layers, resources, unit spawns, and AI directive targets from an RTSMapDocument,
# and turns mouse input into tool actions (select/move/resize, paint rects, place, erase, pick target).
# Wheel zooms around the cursor; middle-drag (or Space + left-drag) pans.

signal selection_changed(ref: Dictionary)
signal cursor_moved(world_pos: Vector2)
signal target_picked(player_id: int, world_pos: Vector2)
signal terrain_sampled(terrain: String)

const OWNER_COLORS = {1: Color("#22d3ee"), 2: Color("#c084fc"), 3: Color("#facc15")}
const COLOR_BG = Color("#070b14")
const COLOR_LOW = Color("#365034")
const COLOR_HIGH = Color("#1e3a5f")
const COLOR_RAMP = Color("#3b6e8f")
const COLOR_CLIFF = Color("#475569")
const COLOR_GRID = Color(1, 1, 1, 0.045)
const COLOR_GRID_MAJOR = Color(1, 1, 1, 0.1)
const COLOR_MINERAL = Color("#38bdf8")
const COLOR_GEYSER = Color("#4ade80")
const COLOR_SELECT = Color("#ffffff")
const HANDLE_PX = 9.0

var doc: RTSMapDocument
var tool: String = "select"          # select | obstacles | high_ground | ramps | crystal_field | aether_vent | unit | erase | target
var snap: float = 1.0
var unit_type: String = "rifleman"
var unit_owner: int = 1
var unit_count: int = 1
var unit_spread: float = 2.1
var unit_auto_harvest: bool = false
var target_player: int = 2
var selected: Dictionary = {}
var terrain_brush: String = "water"
var brush_size: int = 3
var visible_layers: Dictionary = {"grid": true, "resources": true, "units": true, "markers": true}
var _brush_erasing: bool = false

var view_scale: float = 8.0          # pixels per world unit
var view_offset: Vector2 = Vector2(40, 40)

var _drag_mode: String = ""          # "" | pan | move | resize | paint
var _drag_start_world: Vector2
var _drag_item_origin: Vector2
var _drag_snapshot: Dictionary = {}
var _drag_moved: bool = false
var _paint_rect: Rect2
var _hover_world: Vector2 = Vector2(-1, -1)
var _needs_fit: bool = true

func _ready() -> void:
	focus_mode = Control.FOCUS_CLICK
	clip_contents = true
	mouse_default_cursor_shape = Control.CURSOR_CROSS

func set_document(d: RTSMapDocument) -> void:
	doc = d
	selected = {}
	_needs_fit = true
	fit_to_view()

func fit_to_view() -> void:
	if doc == null or size.x < 10.0:
		return
	_needs_fit = false
	var w = float(doc.data["width"])
	var h = float(doc.data["height"])
	view_scale = max(0.5, min((size.x - 40.0) / w, (size.y - 40.0) / h))
	view_offset = (size - Vector2(w, h) * view_scale) * 0.5
	queue_redraw()

func world_to_screen(p: Vector2) -> Vector2:
	return view_offset + p * view_scale

func screen_to_world(p: Vector2) -> Vector2:
	return (p - view_offset) / view_scale

func snap_point(p: Vector2) -> Vector2:
	if snap <= 0.0:
		return p
	return Vector2(snappedf(p.x, snap), snappedf(p.y, snap))

func select(ref: Dictionary) -> void:
	selected = ref if doc and doc.is_valid_ref(ref) else {}
	emit_signal("selection_changed", selected)
	queue_redraw()

# -------------------------------------------------------------------------
# Input
# -------------------------------------------------------------------------

func _gui_input(event: InputEvent) -> void:
	if doc == null:
		return
	if event is InputEventMouseButton:
		_on_mouse_button(event as InputEventMouseButton)
	elif event is InputEventMouseMotion:
		_on_mouse_motion(event as InputEventMouseMotion)

func _on_mouse_button(mb: InputEventMouseButton) -> void:
	var wpos = screen_to_world(mb.position)
	if mb.pressed and (mb.button_index == MOUSE_BUTTON_WHEEL_UP or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN):
		var factor = 1.15 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / 1.15
		var new_scale = clampf(view_scale * factor, 0.8, 80.0)
		view_offset = mb.position - wpos * new_scale
		view_scale = new_scale
		accept_event()
		queue_redraw()
		return

	if mb.button_index == MOUSE_BUTTON_MIDDLE or (mb.button_index == MOUSE_BUTTON_LEFT and Input.is_key_pressed(KEY_SPACE)):
		_drag_mode = "pan" if mb.pressed else ""
		accept_event()
		return

	if mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
		if tool == "terrain_brush":
			_begin_brush(wpos, true)
			accept_event()
			return
		# Right-click erases whatever is under the cursor, in any tool.
		var hit = doc.hit_test(wpos)
		if not hit.is_empty():
			_erase(hit)
		accept_event()
		return
	if mb.button_index == MOUSE_BUTTON_RIGHT and not mb.pressed and _drag_mode == "brush":
		_on_left_release()
		return

	if mb.button_index != MOUSE_BUTTON_LEFT:
		return
	grab_focus()
	if mb.pressed:
		_on_left_press(wpos, mb.position)
	else:
		_on_left_release()
	accept_event()

func _on_left_press(wpos: Vector2, spos: Vector2) -> void:
	var sp = snap_point(wpos)
	match tool:
		"terrain_brush":
			_begin_brush(wpos, false)
		"terrain_fill":
			doc.fill_terrain(sp, terrain_brush)
		"terrain_sample":
			terrain_brush = doc.terrain_at(Vector2i(int(sp.x / RTSMapDocument.TERRAIN_CELL_SIZE), int(sp.y / RTSMapDocument.TERRAIN_CELL_SIZE)))
			tool = "terrain_brush"
			emit_signal("terrain_sampled", terrain_brush)
		"starts", "expansions":
			select(doc.add_marker(tool, sp))
		"select":
			if not selected.is_empty() and (selected["layer"] in RTSMapDocument.RECT_LAYERS or selected["layer"] == "bridges") and _resize_handle_hit(spos):
				_begin_item_drag("resize", wpos)
				return
			var hit = doc.hit_test(wpos)
			select(hit)
			if not hit.is_empty():
				_begin_item_drag("move", wpos)
		"obstacles", "high_ground", "ramps", "bridges":
			_drag_mode = "paint"
			_drag_start_world = sp
			_paint_rect = Rect2(sp, Vector2.ZERO)
		"crystal_field", "aether_vent":
			select(doc.add_resource(tool, sp))
		"unit":
			select(doc.add_unit(unit_type, unit_owner, sp, unit_count, unit_spread, unit_auto_harvest))
		"erase":
			var hit = doc.hit_test(wpos)
			if not hit.is_empty():
				_erase(hit)
		"target":
			emit_signal("target_picked", target_player, sp)
	queue_redraw()

func _begin_brush(pos: Vector2, erasing: bool) -> void:
	_drag_mode = "brush"
	_drag_snapshot = doc.data.duplicate(true)
	_drag_start_world = pos
	_brush_erasing = erasing
	_drag_moved = doc.paint_terrain(pos, "land" if erasing else terrain_brush, brush_size, false)

func _begin_item_drag(mode: String, wpos: Vector2) -> void:
	var item = doc.get_item(selected)
	_drag_mode = mode
	_drag_start_world = wpos
	_drag_item_origin = Vector2(float(item["x"]), float(item["y"]))
	_drag_snapshot = doc.data.duplicate(true)
	_drag_moved = false

func _on_left_release() -> void:
	match _drag_mode:
		"paint":
			var r = _paint_rect.abs()
			if r.size.x >= 1.0 and r.size.y >= 1.0:
				select(doc.add_rect(tool, r))
		"move", "resize", "brush":
			if _drag_moved:
				doc.commit_snapshot(_drag_snapshot)
	_drag_mode = ""
	_drag_snapshot = {}
	queue_redraw()

func _on_mouse_motion(mm: InputEventMouseMotion) -> void:
	_hover_world = screen_to_world(mm.position)
	emit_signal("cursor_moved", _hover_world)
	match _drag_mode:
		"brush":
			var distance = _drag_start_world.distance_to(_hover_world)
			var steps = maxi(1, int(ceil(distance / (RTSMapDocument.TERRAIN_CELL_SIZE * 0.5))))
			for i in range(1, steps + 1):
				var point = _drag_start_world.lerp(_hover_world, float(i) / float(steps))
				_drag_moved = doc.paint_terrain(point, "land" if _brush_erasing else terrain_brush, brush_size, false) or _drag_moved
			_drag_start_world = _hover_world
		"pan":
			view_offset += mm.relative
		"paint":
			var end = snap_point(_hover_world)
			_paint_rect = Rect2(_drag_start_world, end - _drag_start_world)
		"move":
			var target = snap_point(_drag_item_origin + (_hover_world - _drag_start_world))
			var item = doc.get_item(selected)
			if Vector2(float(item["x"]), float(item["y"])) != target:
				_drag_moved = true
				doc.move_item_to(selected, target)
		"resize":
			_drag_moved = true
			doc.resize_rect_to(selected, snap_point(_hover_world))
	queue_redraw()

func _resize_handle_hit(spos: Vector2) -> bool:
	var r = RTSMapDocument.item_rect(doc.get_item(selected))
	var corner = world_to_screen(r.end)
	return spos.distance_to(corner) <= HANDLE_PX * 1.4

func _erase(ref: Dictionary) -> void:
	doc.remove_item(ref)
	if selected.get("layer") == ref["layer"]:
		select({})

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and _needs_fit:
		fit_to_view()
	elif what == NOTIFICATION_MOUSE_EXIT:
		_hover_world = Vector2(-1, -1)
		queue_redraw()

# -------------------------------------------------------------------------
# Drawing
# -------------------------------------------------------------------------

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), COLOR_BG)
	if doc == null:
		return
	var font = get_theme_default_font()
	var d = doc.data
	var map_rect = Rect2(world_to_screen(Vector2.ZERO), Vector2(float(d["width"]), float(d["height"])) * view_scale)
	draw_rect(map_rect, COLOR_LOW)
	if visible_layers.grid:
		_draw_grid(map_rect)
	for polygon in doc.water_polygons():
		var points = PackedVector2Array()
		for point in polygon:
			points.append(world_to_screen(point))
		draw_colored_polygon(points, Color("#204967"))
	for i in range(d.bridges.size()):
		_draw_zone(d.bridges[i], Color("#8e7750"), "CROSSING", font, {"layer": "bridges", "index": i})
	for key in d.terrain_tiles:
		var coords = str(key).split(",")
		var pos = Vector2(float(coords[0]), float(coords[1])) * RTSMapDocument.TERRAIN_CELL_SIZE
		var color: Color = {"land": COLOR_LOW, "water": Color("#204967"), "cliff": COLOR_CLIFF, "plateau": COLOR_HIGH}.get(str(d.terrain_tiles[key]), COLOR_LOW)
		draw_rect(Rect2(world_to_screen(pos), Vector2.ONE * RTSMapDocument.TERRAIN_CELL_SIZE * view_scale), color)

	for i in range(d["high_ground"].size()):
		_draw_zone(d["high_ground"][i], COLOR_HIGH, "HIGH GROUND", font, {"layer": "high_ground", "index": i})
	for i in range(d["ramps"].size()):
		_draw_ramp(d["ramps"][i], font, {"layer": "ramps", "index": i})
	for i in range(d["obstacles"].size()):
		_draw_cliff(d["obstacles"][i], {"layer": "obstacles", "index": i})

	for i in range(d["resources"].size()):
		if visible_layers.resources:
			_draw_resource(d["resources"][i], {"layer": "resources", "index": i})
	for i in range(d["units"].size()):
		if visible_layers.units:
			_draw_unit_entry(d["units"][i], font, {"layer": "units", "index": i})
	if visible_layers.markers:
		for layer in ["starts", "expansions"]:
			for i in range(d[layer].size()):
				var marker: Dictionary = d[layer][i]
				var center = world_to_screen(Vector2(float(marker.x), float(marker.y)))
				var color = Color("#f8cf69") if layer == "starts" else Color("#7be2a3")
				draw_arc(center, 5 * view_scale, 0, TAU, 32, color, 2.0)
				draw_string(font, center + Vector2(8, -8), "%s %d" % ["START" if layer == "starts" else "EXP", i + 1], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, color)
				if _is_selected({"layer": layer, "index": i}):
					draw_arc(center, 6 * view_scale, 0, TAU, 32, Color.WHITE, 2.0)
	for dv in d["directives"]:
		_draw_directive(dv, font)

	draw_rect(map_rect, Color("#00bcd4"), false, 2.0)

	if _drag_mode == "paint":
		var pr = _paint_rect.abs()
		var col = {"obstacles": COLOR_CLIFF, "high_ground": COLOR_HIGH, "ramps": COLOR_RAMP}.get(tool, Color.WHITE)
		draw_rect(Rect2(world_to_screen(pr.position), pr.size * view_scale), Color(col, 0.55))
		draw_rect(Rect2(world_to_screen(pr.position), pr.size * view_scale), Color.WHITE, false, 1.5)
		draw_string(font, world_to_screen(pr.end) + Vector2(6, -4), "%d x %d" % [int(pr.size.x), int(pr.size.y)], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)

	_draw_tool_ghost(font)

func _draw_grid(map_rect: Rect2) -> void:
	var step = 2.0 if view_scale >= 6.0 else 8.0
	var w = float(doc.data["width"])
	var h = float(doc.data["height"])
	var x = 0.0
	while x <= w:
		var major = is_zero_approx(fmod(x, 16.0))
		var sx = world_to_screen(Vector2(x, 0)).x
		draw_line(Vector2(sx, map_rect.position.y), Vector2(sx, map_rect.end.y), COLOR_GRID_MAJOR if major else COLOR_GRID, 1.0)
		x += step
	var y = 0.0
	while y <= h:
		var major = is_zero_approx(fmod(y, 16.0))
		var sy = world_to_screen(Vector2(0, y)).y
		draw_line(Vector2(map_rect.position.x, sy), Vector2(map_rect.end.x, sy), COLOR_GRID_MAJOR if major else COLOR_GRID, 1.0)
		y += step

func _screen_rect(item: Dictionary) -> Rect2:
	var r = RTSMapDocument.item_rect(item)
	return Rect2(world_to_screen(r.position), r.size * view_scale)

func _is_selected(ref: Dictionary) -> bool:
	return not selected.is_empty() and selected["layer"] == ref["layer"] and int(selected["index"]) == int(ref["index"])

func _draw_selection_outline(sr: Rect2, with_handle: bool) -> void:
	draw_rect(sr.grow(2.0), COLOR_SELECT, false, 2.0)
	if with_handle:
		draw_rect(Rect2(sr.end - Vector2(HANDLE_PX, HANDLE_PX) * 0.5, Vector2(HANDLE_PX, HANDLE_PX)), COLOR_SELECT)

func _draw_zone(item: Dictionary, col: Color, label: String, font: Font, ref: Dictionary) -> void:
	var sr = _screen_rect(item)
	draw_rect(sr, Color(col, 0.85))
	draw_rect(sr, col.lightened(0.35), false, 1.5)
	if sr.size.x > 90 and sr.size.y > 24:
		draw_string(font, sr.position + Vector2(6, 16), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1, 0.45))
	if _is_selected(ref):
		_draw_selection_outline(sr, true)

func _draw_ramp(item: Dictionary, font: Font, ref: Dictionary) -> void:
	var sr = _screen_rect(item)
	# Engine ramps descend west -> east (elevation lerps 2.2 -> 0 along +x), so shade high to low.
	var bands = 8
	for b in range(bands):
		var t = float(b) / float(bands)
		var band = Rect2(sr.position + Vector2(sr.size.x * t, 0), Vector2(sr.size.x / bands + 0.5, sr.size.y))
		draw_rect(band, COLOR_HIGH.lerp(COLOR_LOW, t).lerp(COLOR_RAMP, 0.45))
	draw_rect(sr, COLOR_RAMP.lightened(0.3), false, 1.5)
	var mid_y = sr.get_center().y
	if sr.size.x > 24:
		var a = Vector2(sr.position.x + 6, mid_y)
		var b2 = Vector2(sr.end.x - 6, mid_y)
		draw_line(a, b2, Color(1, 1, 1, 0.55), 1.5)
		draw_line(b2, b2 + Vector2(-7, -5), Color(1, 1, 1, 0.55), 1.5)
		draw_line(b2, b2 + Vector2(-7, 5), Color(1, 1, 1, 0.55), 1.5)
	if sr.size.x > 60 and sr.size.y > 30:
		draw_string(font, sr.position + Vector2(6, 16), "RAMP ↓", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1, 0.6))
	if _is_selected(ref):
		_draw_selection_outline(sr, true)

func _draw_cliff(item: Dictionary, ref: Dictionary) -> void:
	var sr = _screen_rect(item)
	draw_rect(sr, COLOR_CLIFF)
	# Diagonal hatching marks impassable terrain.
	var spacing = 10.0
	var off = 0.0
	while off < sr.size.x + sr.size.y:
		var p1 = sr.position + Vector2(off, 0)
		var p2 = sr.position + Vector2(off - sr.size.y, sr.size.y)
		var seg = _clip_segment_to_rect(p1, p2, sr)
		if seg.size() == 2:
			draw_line(seg[0], seg[1], Color(0, 0, 0, 0.35), 1.0)
		off += spacing
	draw_rect(sr, COLOR_CLIFF.lightened(0.35), false, 1.5)
	if _is_selected(ref):
		_draw_selection_outline(sr, true)

func _clip_segment_to_rect(a: Vector2, b: Vector2, r: Rect2) -> Array:
	# Liang–Barsky clip for the hatch lines.
	var t0 = 0.0
	var t1 = 1.0
	var dx = b.x - a.x
	var dy = b.y - a.y
	for edge in [[-dx, a.x - r.position.x], [dx, r.end.x - a.x], [-dy, a.y - r.position.y], [dy, r.end.y - a.y]]:
		var p = float(edge[0])
		var q = float(edge[1])
		if is_zero_approx(p):
			if q < 0.0:
				return []
			continue
		var t = q / p
		if p < 0.0:
			t0 = max(t0, t)
		else:
			t1 = min(t1, t)
		if t0 > t1:
			return []
	return [a + Vector2(dx, dy) * t0, a + Vector2(dx, dy) * t1]

func _draw_resource(item: Dictionary, ref: Dictionary) -> void:
	var c = world_to_screen(Vector2(float(item["x"]), float(item["y"])))
	var rad = float(RTSMapDocument.RESOURCE_RADIUS.get(item["type"], 2.0)) * view_scale
	if item["type"] == "crystal_field":
		var pts = PackedVector2Array([c + Vector2(0, -rad), c + Vector2(rad * 0.8, 0), c + Vector2(0, rad), c + Vector2(-rad * 0.8, 0)])
		draw_colored_polygon(pts, COLOR_MINERAL)
		pts.append(pts[0])
		draw_polyline(pts, COLOR_MINERAL.lightened(0.5), 1.0)
	else:
		draw_circle(c, rad, Color(COLOR_GEYSER, 0.35))
		draw_arc(c, rad, 0, TAU, 24, COLOR_GEYSER, 2.0)
		draw_circle(c, rad * 0.35, COLOR_GEYSER)
	if _is_selected(ref):
		draw_arc(c, rad + 4.0, 0, TAU, 24, COLOR_SELECT, 2.0)

func _draw_unit_entry(u: Dictionary, font: Font, ref: Dictionary) -> void:
	var def = RTSData.get_unit_def(str(u["type"]))
	var col: Color = OWNER_COLORS.get(int(u["owner"]), Color.WHITE)
	var rad = float(def.get("radius", 0.85)) * view_scale
	var is_struct = bool(def.get("is_structure", false))
	var unknown = def.is_empty()
	var positions = RTSMapDocument.unit_spawn_positions(u)
	for p in positions:
		var c = world_to_screen(p)
		if is_struct:
			var sr = Rect2(c - Vector2(rad, rad), Vector2(rad, rad) * 2.0)
			draw_rect(sr, Color(col, 0.35))
			draw_rect(sr, col, false, 2.0)
		else:
			draw_circle(c, max(rad, 2.5), Color(col, 0.85) if not unknown else Color.RED)
			draw_arc(c, max(rad, 2.5), 0, TAU, 16, Color(0, 0, 0, 0.6), 1.0)
	var anchor = world_to_screen(positions[0])
	if view_scale >= 14.0 or _is_selected(ref):
		var label = str(def.get("name", u["type"]))
		if int(u["count"]) > 1:
			label += " ×%d" % int(u["count"])
		if str(u["id"]) != "":
			label += "  [%s]" % u["id"]
		draw_string(font, anchor + Vector2(-rad, -rad - 4.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, col.lightened(0.3))
	if _is_selected(ref):
		var bb = Rect2(positions[0], Vector2.ZERO)
		for p in positions:
			bb = bb.expand(p)
		var sr = Rect2(world_to_screen(bb.position) - Vector2(rad, rad), bb.size * view_scale + Vector2(rad, rad) * 2.0)
		draw_rect(sr.grow(3.0), COLOR_SELECT, false, 2.0)
		if bool(u.get("auto_harvest", false)):
			draw_string(font, sr.position + Vector2(0, sr.size.y + 14), "auto-harvest", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, COLOR_MINERAL)

func _draw_directive(dv: Dictionary, font: Font) -> void:
	var pid = int(dv["player"])
	var col: Color = OWNER_COLORS.get(pid, Color.WHITE)
	if not bool(dv["enabled"]):
		col = Color(col, 0.4)
	var c = world_to_screen(Vector2(float(dv["target_x"]), float(dv["target_y"])))
	draw_line(c + Vector2(-9, 0), c + Vector2(9, 0), col, 2.0)
	draw_line(c + Vector2(0, -9), c + Vector2(0, 9), col, 2.0)
	draw_arc(c, 6.0, 0, TAU, 16, col, 1.5)
	draw_line(c, c + Vector2(0, -26), col, 1.5)
	draw_colored_polygon(PackedVector2Array([c + Vector2(0, -26), c + Vector2(14, -21), c + Vector2(0, -16)]), col)
	draw_string(font, c + Vector2(16, -16), "P%d %s" % [pid, dv["mode"]], HORIZONTAL_ALIGNMENT_LEFT, -1, 11, col)

func _draw_tool_ghost(font: Font) -> void:
	if _hover_world.x < 0.0 or _drag_mode != "":
		return
	var c = world_to_screen(snap_point(_hover_world))
	match tool:
		"terrain_brush", "terrain_fill", "terrain_sample":
			var cell = Vector2(floor(_hover_world.x / RTSMapDocument.TERRAIN_CELL_SIZE), floor(_hover_world.y / RTSMapDocument.TERRAIN_CELL_SIZE))
			var corner = (cell - Vector2.ONE * int(brush_size / 2)) * RTSMapDocument.TERRAIN_CELL_SIZE
			draw_rect(Rect2(world_to_screen(corner), Vector2.ONE * brush_size * RTSMapDocument.TERRAIN_CELL_SIZE * view_scale), Color(0.5, 0.85, 1, 0.2))
		"starts", "expansions":
			draw_arc(c, 5 * view_scale, 0, TAU, 24, Color("#f8cf69"), 2)
		"unit":
			var preview = {"type": unit_type, "x": snap_point(_hover_world).x, "y": snap_point(_hover_world).y, "count": unit_count, "spread": unit_spread}
			var rad = RTSMapDocument.unit_radius(unit_type) * view_scale
			var col: Color = OWNER_COLORS.get(unit_owner, Color.WHITE)
			for p in RTSMapDocument.unit_spawn_positions(preview):
				draw_arc(world_to_screen(p), max(rad, 2.5), 0, TAU, 16, Color(col, 0.7), 1.5)
		"crystal_field", "aether_vent":
			var rad2 = float(RTSMapDocument.RESOURCE_RADIUS[tool]) * view_scale
			draw_arc(c, rad2, 0, TAU, 20, Color(1, 1, 1, 0.5), 1.5)
		"target":
			var col2: Color = OWNER_COLORS.get(target_player, Color.WHITE)
			draw_arc(c, 8.0, 0, TAU, 16, col2, 1.5)
			draw_string(font, c + Vector2(12, -8), "P%d target" % target_player, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, col2)
		"obstacles", "high_ground", "ramps":
			draw_line(c + Vector2(-6, 0), c + Vector2(6, 0), Color(1, 1, 1, 0.6), 1.0)
			draw_line(c + Vector2(0, -6), c + Vector2(0, 6), Color(1, 1, 1, 0.6), 1.0)
