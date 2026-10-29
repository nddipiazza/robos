extends Node2D

# RTSHud.gd — screen-space HUD, laid out like a conventional RTS:
#   top-right   resources for the viewed player (crystal, aether, supply) and the game clock
#   bottom-left minimap with the camera frustum and under-attack pings
#   bottom-mid  selection panel: portrait + stats for one unit, an icon grid for a squad,
#               production queue for structures
#   bottom-right 5x3 command card with hotkeys, costs and tooltips
# Nothing here is decorative filler: every element reads live sim state.

var main: Node2D
var font: Font
var draw_ms: float = 0.0
var _minimap_viewport: SubViewport
var production_scroll: ScrollContainer
var production_list: ProductionQueueList

class ProductionQueueList extends Control:
	var hud: Node2D
	var producers: Array[Dictionary] = []
	const ROW_HEIGHT := 72.0
	func _draw() -> void:
		var font := ThemeDB.fallback_font
		var first := maxi(0, int(get_parent().scroll_vertical / ROW_HEIGHT))
		var last := mini(producers.size(), first + 4)
		for row in range(first, last):
			var u: Dictionary = producers[row]
			var y := row * ROW_HEIGHT
			draw_rect(Rect2(0, y, size.x, ROW_HEIGHT - 3), Color("#151e29"))
			draw_string(font, Vector2(10, y + 23), "%s #%d" % [u.name, u.tag], HORIZONTAL_ALIGNMENT_LEFT, 230, 17, Color("#e9eef4"))
			var queue: Array = u.production_queue
			var status := "Idle" if u.build_progress >= 1.0 else "Under construction"
			if not queue.is_empty():
				status = "Training · %d%%   |   %d queued" % [int(100.0 * queue[0].progress / maxf(0.1, queue[0].total_time)), queue.size() - 1]
			draw_string(font, Vector2(10, y + 48), status, HORIZONTAL_ALIGNMENT_LEFT, 230, 15, Color("#95a2b3"))
			for i in range(queue.size()):
				var item: Dictionary = queue[i]
				var x := 255.0 + i * 114.0
				var icon := Rect2(x + 26, y + 4, 44, 44)
				var tex: Texture2D = hud._icon_for(str(item.unit_type))
				if tex:
					draw_texture_rect(tex, icon, false)
				draw_rect(icon, Color("#e6b83e") if i == 0 else Color("#5b687b"), false, 1.0)
				var label := str(RTSData.get_unit_def(str(item.unit_type)).name)
				draw_string(font, Vector2(x, y + 65), label, HORIZONTAL_ALIGNMENT_CENTER, 100, 13, Color("#e9eef4"))
				if i == 0:
					var progress := clampf(float(item.progress) / maxf(0.1, item.total_time), 0.0, 1.0)
					if progress > 0:
						draw_rect(Rect2(icon.position + Vector2(0, 46), Vector2(44 * progress, 3)), Color("#4ade80"))

class MinimapTerrain extends Node2D:
	var hud: Node2D
	func _draw() -> void:
		hud._draw_minimap_terrain(self)

func _ready() -> void:
	SimEngine.scenario_loaded.connect(_invalidate_minimap)
	production_scroll = ScrollContainer.new()
	production_scroll.position = main.SEL_PANEL.position + Vector2(290, 38)
	production_scroll.size = Vector2(926, 160)
	production_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	production_scroll.hide()
	add_child(production_scroll)
	production_list = ProductionQueueList.new()
	production_list.hud = self
	production_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	production_list.mouse_filter = Control.MOUSE_FILTER_IGNORE
	production_scroll.add_child(production_list)

func _invalidate_minimap(_scenario_name: String = "") -> void:
	if _minimap_viewport:
		remove_child(_minimap_viewport)
		_minimap_viewport.queue_free()
		_minimap_viewport = null

func _minimap_texture() -> Texture2D:
	if not _minimap_viewport:
		_minimap_viewport = SubViewport.new()
		_minimap_viewport.size = Vector2i(main.MINIMAP.size)
		_minimap_viewport.disable_3d = true
		_minimap_viewport.transparent_bg = true
		_minimap_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
		add_child(_minimap_viewport)
		var terrain = MinimapTerrain.new()
		terrain.hud = self
		terrain.position = -main.MINIMAP.position
		_minimap_viewport.add_child(terrain)
	return _minimap_viewport.get_texture()

const C_TOP := Color("#1b2029")
const C_BOT := Color("#0e1217")
const C_EDGE := Color("#3a4350")
const C_EDGE_HI := Color("#5b687b")
const C_TEXT := Color("#e9eef4")
const C_MUTED := Color("#95a2b3")
const C_GOLD := Color("#e6b83e")
const C_CRYSTAL := Color("#35d3c0")
const C_AETHER := Color("#52e08a")
const C_RED := Color("#f0645a")

func _draw() -> void:
	var started = Time.get_ticks_usec()
	if main == null:
		return
	font = ThemeDB.fallback_font
	if SimEngine.match_state.get("mode", "") != "unit_battle":
		_draw_resource_bar()
		_draw_faction_label()
		_draw_banner()
	_draw_messages()
	_draw_idle_worker_button()
	_draw_group_tabs()
	_draw_bottom_panel()
	_draw_tooltip()
	_draw_caption()
	_draw_match_status()
	if main.show_help:
		_draw_help()
	draw_ms = (Time.get_ticks_usec() - started) / 1000.0

# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------
func _text(pos: Vector2, s: String, size: int, col: Color = C_TEXT, align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	draw_string(font, pos + Vector2(1, 1), s, align, width, size, Color(0, 0, 0, 0.7))
	draw_string(font, pos, s, align, width, size, col)

func _draw_match_status() -> void:
	var state: Dictionary = SimEngine.match_state
	if state.is_empty() or state.get("mode", "") in ["unit_battle", "campaign"]:
		return
	_text(Vector2(32, 55), "1 vs AI · %s · %s · %.0f×   |   F8 Match menu" % [str(state.get("difficulty", "normal")).capitalize(), str(state.get("strategy", "balanced")).capitalize(), SimEngine.sim_speed], 17, C_MUTED)
	if state.status == "finished":
		_frame(Rect2(650, 345, 620, 180))
		var result = "VICTORY" if int(state.winner) == 1 else ("DRAW" if int(state.winner) == 0 else "DEFEAT")
		_text(Vector2(650, 410), result, 42, C_GOLD, HORIZONTAL_ALIGNMENT_CENTER, 620)
		_text(Vector2(650, 455), "Surrender" if state.reason == "surrender" else "All opposing structures destroyed", 20, C_TEXT, HORIZONTAL_ALIGNMENT_CENTER, 620)
		_text(Vector2(650, 494), "F8 — Play again", 19, C_MUTED, HORIZONTAL_ALIGNMENT_CENTER, 620)

func _text_r(right: float, y: float, s: String, size: int, col: Color = C_TEXT) -> void:
	_text(Vector2(right - _text_w(s, size), y), s, size, col)

func _text_w(s: String, size: int) -> float:
	return font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x

func _vgrad(r: Rect2, top: Color, bot: Color) -> void:
	draw_polygon(
		PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]),
		PackedColorArray([top, top, bot, bot])
	)

func _frame(r: Rect2, fill_alpha: float = 0.9) -> void:
	_vgrad(r, Color(C_TOP.r, C_TOP.g, C_TOP.b, fill_alpha), Color(C_BOT.r, C_BOT.g, C_BOT.b, fill_alpha))
	draw_rect(r, C_EDGE, false, 1.0)
	draw_line(r.position + Vector2(1, 1), Vector2(r.end.x - 1, r.position.y + 1), Color(1, 1, 1, 0.07), 1.0)

func _bar(r: Rect2, frac: float, col: Color, label: String = "") -> void:
	draw_rect(r, Color(0.05, 0.06, 0.08, 0.95))
	draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(frac, 0.0, 1.0), r.size.y)), col)
	draw_line(r.position, Vector2(r.end.x, r.position.y), Color(1, 1, 1, 0.18), 1.0)
	draw_rect(r, Color(0, 0, 0, 0.9), false, 1.0)
	if label != "":
		_text(Vector2(r.position.x, r.position.y + r.size.y - 3.0), label, int(r.size.y - 3.0), C_TEXT, HORIZONTAL_ALIGNMENT_CENTER, r.size.x)

func _icon_for(type_id: String) -> Texture2D:
	if main.icons == null:
		return null
	return main.icons.get_icon(type_id)

func _player_color() -> Color:
	return RTSData.get_player_color(main.local_player)

func _fmt_time(sec: float) -> String:
	var s := int(sec)
	return "%d:%02d" % [s / 60, s % 60]

# ---------------------------------------------------------------------------
# Resource glyphs
# ---------------------------------------------------------------------------
func _gem(c: Vector2, s: float) -> void:
	var pts := PackedVector2Array([c + Vector2(0, -s), c + Vector2(s * 0.8, -s * 0.3), c + Vector2(s * 0.62, s * 0.7), c + Vector2(0, s), c + Vector2(-s * 0.62, s * 0.7), c + Vector2(-s * 0.8, -s * 0.3)])
	draw_colored_polygon(pts, C_CRYSTAL)
	draw_colored_polygon(PackedVector2Array([c + Vector2(0, -s), c + Vector2(s * 0.8, -s * 0.3), c + Vector2(0, s * 0.05), c + Vector2(-s * 0.8, -s * 0.3)]), Color("#8af2e6"))
	draw_colored_polygon(PackedVector2Array([c + Vector2(0, s * 0.05), c + Vector2(s * 0.8, -s * 0.3), c + Vector2(s * 0.62, s * 0.7), c + Vector2(0, s)]), Color("#1ba698"))
	draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[0]]), Color(0, 0, 0, 0.55), 1.0)

func _drop(c: Vector2, s: float) -> void:
	var pts := PackedVector2Array([c + Vector2(0, -s), c + Vector2(s * 0.62, s * 0.15), c + Vector2(s * 0.5, s * 0.62), c + Vector2(0, s), c + Vector2(-s * 0.5, s * 0.62), c + Vector2(-s * 0.62, s * 0.15)])
	draw_colored_polygon(pts, C_AETHER)
	draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.2, -s * 0.2), c + Vector2(0, -s * 0.7), c + Vector2(-s * 0.05, s * 0.2)]), Color("#c5f7da"))
	draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[0]]), Color(0, 0, 0, 0.5), 1.0)

func _person(c: Vector2, s: float, col: Color) -> void:
	draw_circle(c + Vector2(0, -s * 0.55), s * 0.38, col)
	draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.7, s * 0.9), c + Vector2(-s * 0.5, -s * 0.05), c + Vector2(s * 0.5, -s * 0.05), c + Vector2(s * 0.7, s * 0.9)]), col)

# ---------------------------------------------------------------------------
# Top-right resources, faction label, banner, messages
# ---------------------------------------------------------------------------
func _draw_resource_bar() -> void:
	var p: Dictionary = SimEngine.players.get(main.local_player, {})
	if p.is_empty():
		return
	var strip := Rect2(1180.0, 0.0, 740.0, 46.0)
	draw_polygon(
		PackedVector2Array([strip.position, Vector2(strip.end.x, 0), strip.end, Vector2(strip.position.x, strip.end.y)]),
		PackedColorArray([Color(0, 0, 0, 0.0), Color(0, 0, 0, 0.72), Color(0, 0, 0, 0.72), Color(0, 0, 0, 0.0)])
	)
	var x := 1896.0
	var y := 31.0
	var clock := _fmt_time(SimEngine.sim_time)
	_text(Vector2(x - _text_w(clock, 20), y), clock, 20, C_MUTED)
	x -= _text_w(clock, 20) + 40.0

	var supply_used := int(p.get("supply_used", 0))
	var supply_cap := int(p.get("supply_cap", 0))
	var sup_txt := "%d/%d" % [supply_used, supply_cap]
	var blocked := supply_cap > 0 and supply_used >= supply_cap
	var sup_col := C_RED if blocked else C_TEXT
	_text(Vector2(x - _text_w(sup_txt, 24), y), sup_txt, 24, sup_col)
	x -= _text_w(sup_txt, 24) + 24.0
	_person(Vector2(x, y - 8.0), 11.0, sup_col)
	x -= 50.0

	var aether_txt := str(int(p.get("aether", 0)))
	_text(Vector2(x - _text_w(aether_txt, 24), y), aether_txt, 24)
	x -= _text_w(aether_txt, 24) + 24.0
	_drop(Vector2(x, y - 9.0), 13.0)
	x -= 52.0

	var crystal_txt := str(int(p.get("crystal", 0)))
	_text(Vector2(x - _text_w(crystal_txt, 24), y), crystal_txt, 24)
	x -= _text_w(crystal_txt, 24) + 24.0
	_gem(Vector2(x, y - 9.0), 13.0)

func _draw_faction_label() -> void:
	var p: Dictionary = SimEngine.players.get(main.local_player, {})
	if p.is_empty():
		return
	var col := _player_color()
	draw_rect(Rect2(14, 14, 10, 10), col)
	draw_rect(Rect2(14, 14, 10, 10), Color(0, 0, 0, 0.8), false, 1.0)
	_text(Vector2(32, 25), RTSData.get_faction_name(str(p.get("faction", "humans"))), 17, C_TEXT)

func _draw_banner() -> void:
	if main.banner_ttl <= 0.0:
		return
	var a := clampf(main.banner_ttl / 1.2, 0.0, 1.0)
	var name := SimEngine.scenario_name
	var w := _text_w(name, 34)
	var pos := Vector2(960.0 - w * 0.5, 110.0)
	var band := Rect2(960.0 - w * 0.5 - 60.0, 70.0, w + 120.0, 70.0)
	var mid := Rect2(band.position.x + 40.0, band.position.y, band.size.x - 80.0, band.size.y)
	var fill := Color(0.03, 0.04, 0.06, 0.62 * a)
	var clear := Color(0.03, 0.04, 0.06, 0.0)
	draw_rect(mid, fill)
	draw_polygon(PackedVector2Array([band.position, mid.position, Vector2(mid.position.x, mid.end.y), Vector2(band.position.x, band.end.y)]), PackedColorArray([clear, fill, fill, clear]))
	draw_polygon(PackedVector2Array([Vector2(mid.end.x, mid.position.y), Vector2(band.end.x, band.position.y), band.end, mid.end]), PackedColorArray([fill, clear, clear, fill]))
	draw_string(font, pos + Vector2(2, 2), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 34, Color(0, 0, 0, 0.6 * a))
	draw_string(font, pos, name, HORIZONTAL_ALIGNMENT_LEFT, -1, 34, Color(C_TEXT.r, C_TEXT.g, C_TEXT.b, a))
	draw_line(Vector2(960.0 - w * 0.5, 124.0), Vector2(960.0 + w * 0.5, 124.0), Color(C_GOLD.r, C_GOLD.g, C_GOLD.b, a * 0.9), 2.0)

func _draw_messages() -> void:
	var y: float = main.HUD_TOP - 56.0 - 26.0 * float(maxi(0, main.messages.size() - 1))
	for m in main.messages:
		var a := clampf(float(m["ttl"]), 0.0, 1.0)
		var col := C_TEXT
		match str(m["kind"]):
			"error": col = C_RED
			"warn": col = C_GOLD
		_text(Vector2(310, y), str(m["text"]), 19, Color(col.r, col.g, col.b, a))
		y += 26.0

func _draw_caption() -> void:
	if GameControlServer.bdd_step_text == "" and GameControlServer.bdd_proof_text == "":
		return
	var r := Rect2(320.0, main.HUD_TOP - 74.0, 1280.0, 56.0)
	draw_rect(r, Color(0.05, 0.06, 0.09, 0.88))
	draw_rect(r, C_EDGE_HI, false, 1.0)
	_text(Vector2(r.position.x + 16, r.position.y + 24), GameControlServer.bdd_step_text, 18, C_TEXT)
	_text(Vector2(r.position.x + 16, r.position.y + 46), GameControlServer.bdd_proof_text, 15, Color("#8fd9a8"))

# ---------------------------------------------------------------------------
# Idle workers and control groups
# ---------------------------------------------------------------------------
func _draw_idle_worker_button() -> void:
	var idle: Array[Dictionary] = main.idle_workers()
	if idle.is_empty():
		return
	var r: Rect2 = main.IDLE_BTN
	_frame(r, 0.92)
	var worker_id := str(RTSData.faction_info.get(str(SimEngine.players[main.local_player].get("faction", "humans")), {}).get("worker", "pioneer"))
	var tex := _icon_for(worker_id)
	if tex:
		draw_texture_rect(tex, Rect2(r.position + Vector2(4, 3), Vector2(40, 40)), false)
	_text(Vector2(r.position.x + 52, r.position.y + 31), str(idle.size()), 24, C_GOLD)

func group_tab_rects() -> Dictionary:
	var out := {}
	var keys: Array = main.control_groups.keys()
	keys.sort()
	var i := 0
	for g in keys:
		if main.control_groups[g].is_empty():
			continue
		out[g] = Rect2(main.SEL_PANEL.position.x + float(i) * 78.0, main.HUD_TOP - 38.0, 72.0, 30.0)
		i += 1
	return out

func _draw_group_tabs() -> void:
	var rects := group_tab_rects()
	for g in rects.keys():
		var r: Rect2 = rects[g]
		_frame(r, 0.92)
		_text(Vector2(r.position.x + 7, r.position.y + 22), str(g), 18, C_GOLD)
		var first: Dictionary = SimEngine.units.get(main.control_groups[g][0], {})
		if not first.is_empty():
			var tex := _icon_for(str(first["unit_type"]))
			if tex:
				draw_texture_rect(tex, Rect2(r.position + Vector2(22, 2), Vector2(26, 26)), false)
		_text(Vector2(r.position.x + 52, r.position.y + 22), str(main.control_groups[g].size()), 15, C_TEXT)

# ---------------------------------------------------------------------------
# Bottom panel
# ---------------------------------------------------------------------------
func _draw_bottom_panel() -> void:
	var top: float = main.HUD_TOP
	_vgrad(Rect2(0, top, 1920, 1080 - top), Color("#181d25"), Color("#0b0e12"))
	draw_line(Vector2(0, top), Vector2(1920, top), C_EDGE_HI, 2.0)
	draw_line(Vector2(0, top + 2), Vector2(1920, top + 2), Color(0, 0, 0, 0.6), 1.0)
	_draw_minimap()
	_frame(main.SEL_PANEL)
	_draw_selection_panel()
	_draw_command_card()

func _draw_minimap() -> void:
	var mm: Rect2 = main.MINIMAP
	draw_rect(mm.grow(6.0), Color("#07090c"))
	draw_rect(mm.grow(6.0), C_EDGE_HI, false, 1.5)
	draw_texture_rect(_minimap_texture(), mm, false)
	_draw_minimap_units()

func _draw_minimap_terrain(canvas: Node2D) -> void:
	var mm: Rect2 = main.MINIMAP
	var sx := mm.size.x / SimEngine.map_width
	var sy := mm.size.y / SimEngine.map_height
	canvas.draw_rect(mm, Color("#56683a"))
	for water in SimEngine.water_polygons:
		var points = PackedVector2Array()
		for point in water:
			points.append(mm.position + point * Vector2(sx, sy))
		canvas.draw_colored_polygon(points, Color("#16364f"))
	for bridge in SimEngine.land_bridges:
		canvas.draw_rect(Rect2(mm.position + bridge.position * Vector2(sx, sy), bridge.size * Vector2(sx, sy)), Color("#94815d"))
	for tile in SimEngine.terrain_tiles:
		var color: Color = {"land": Color("#56683a"), "water": Color("#16364f"), "cliff": Color("#3a3029"), "plateau": Color("#a8946b")}.get(str(tile.terrain), Color.WHITE)
		canvas.draw_rect(Rect2(mm.position + Vector2(float(tile.x), float(tile.y)) * Vector2(sx, sy), Vector2(4, 4) * Vector2(sx, sy)), color)
	for hg in SimEngine.high_ground_zones:
		canvas.draw_rect(Rect2(mm.position + hg.position * Vector2(sx, sy), hg.size * Vector2(sx, sy)), Color("#a8946b"))
	for rmp in SimEngine.ramps:
		canvas.draw_rect(Rect2(mm.position + rmp.position * Vector2(sx, sy), rmp.size * Vector2(sx, sy)), Color("#bba97d"))
	for obs in SimEngine.terrain_obstacles:
		canvas.draw_rect(Rect2(mm.position + obs.position * Vector2(sx, sy), obs.size * Vector2(sx, sy)), Color("#3a3029"))
	for r in SimEngine.resources.values():
		var p: Vector2 = main.world_to_minimap(r["pos"])
		canvas.draw_circle(p, 2.4, C_CRYSTAL if r["resource_type"] == "crystal_field" else C_AETHER)

func _draw_minimap_units() -> void:
	var mm: Rect2 = main.MINIMAP
	for u in SimEngine.units.values():
		var up: Vector2 = main.world_to_minimap(u["pos"])
		var col := RTSData.get_player_color(int(u["owner"]))
		if u["is_structure"]:
			draw_rect(Rect2(up - Vector2(3, 3), Vector2(6, 6)), col)
			draw_rect(Rect2(up - Vector2(3, 3), Vector2(6, 6)), Color(0, 0, 0, 0.8), false, 1.0)
		else:
			draw_rect(Rect2(up - Vector2(1.5, 1.5), Vector2(3, 3)), col)

	for a in main.alerts:
		var t: float = 1.0 - float(a["ttl"]) / float(a["max"])
		var ap: Vector2 = main.world_to_minimap(a["pos"])
		draw_arc(ap, 5.0 + t * 16.0, 0.0, TAU, 24, Color(1.0, 0.25, 0.2, 1.0 - t), 2.0, true)

	# Camera frustum
	var corners := [Vector2(0, 46), Vector2(1920, 46), Vector2(1920, main.HUD_TOP), Vector2(0, main.HUD_TOP)]
	var poly := PackedVector2Array()
	for c in corners:
		var w: Vector2 = main.screen_to_world(c)
		var mp: Vector2 = main.world_to_minimap(w)
		poly.append(Vector2(clampf(mp.x, mm.position.x, mm.end.x), clampf(mp.y, mm.position.y, mm.end.y)))
	poly.append(poly[0])
	draw_polyline(poly, Color(1, 1, 1, 0.92), 1.5)

# ---------------------------------------------------------------------------
# Selection panel
# ---------------------------------------------------------------------------
func selection_cells() -> Array:
	var cells: Array = []
	if main.selected_tags.size() < 2:
		return cells
	var tags: Array = main.selected_tags.duplicate()
	tags.sort_custom(func(a, b):
		var ua: Dictionary = SimEngine.units.get(a, {})
		var ub: Dictionary = SimEngine.units.get(b, {})
		var ta := str(ua.get("unit_type", ""))
		var tb := str(ub.get("unit_type", ""))
		if ta == tb:
			return a < b
		return ta < tb
	)
	var cols := 14
	if main.is_production_selection():
		cols = 3
	for i in range(mini(tags.size(), cols * 2)):
		var rx: float = main.SEL_PANEL.position.x + 16.0 + float(i % cols) * 86.0
		var ry: float = main.SEL_PANEL.position.y + 16.0 + float(i / cols) * 86.0
		cells.append({"tag": tags[i], "rect": Rect2(rx, ry, 80.0, 80.0)})
	return cells

func _draw_selection_panel() -> void:
	var production: bool = main.is_production_selection()
	production_scroll.visible = production
	if production:
		production_list.producers = main.selected_producers()
		production_list.custom_minimum_size = Vector2(900, production_list.producers.size() * ProductionQueueList.ROW_HEIGHT)
		production_list.queue_redraw()
	var sp: Rect2 = main.SEL_PANEL
	var tags: Array = main.selected_tags
	if tags.is_empty():
		_text_r(sp.end.x - 16, sp.end.y - 12, "F1  Controls", 14, Color(C_MUTED.r, C_MUTED.g, C_MUTED.b, 0.7))
		return
	if tags.size() == 1:
		var u: Dictionary = SimEngine.units.get(tags[0], {})
		if not u.is_empty():
			_draw_single(u)
		return
	_draw_multi()
	if production:
		var count := 0
		for producer in production_list.producers:
			count += producer.production_queue.size()
		_text(Vector2(main.SEL_PANEL.position.x + 300, main.SEL_PANEL.position.y + 24), "PRODUCTION · %d buildings · %d units training / queued · Scroll to see every queue" % [production_list.producers.size(), count], 17, C_TEXT)

func _draw_multi() -> void:
	var cells := selection_cells()
	var prim: String = main.primary_type()
	for c in cells:
		var u: Dictionary = SimEngine.units.get(c["tag"], {})
		if u.is_empty():
			continue
		var r: Rect2 = c["rect"]
		_vgrad(r, Color("#252c37"), Color("#141920"))
		var is_prim: bool = str(u["unit_type"]) == prim
		draw_rect(r, C_GOLD if is_prim else C_EDGE, false, 2.0 if is_prim else 1.0)
		var tex := _icon_for(str(u["unit_type"]))
		if tex:
			draw_texture_rect(tex, Rect2(r.position + Vector2(4, 2), Vector2(72, 70)), false)
		var ratio := clampf(u["hp"] / maxf(1.0, u["max_hp"]), 0.0, 1.0)
		var col := Color("#4ade80") if ratio > 0.5 else (Color("#f5b941") if ratio > 0.25 else Color("#ef4444"))
		if u["max_shields"] > 0.0:
			_bar(Rect2(r.position.x + 4, r.end.y - 11, r.size.x - 8, 3), clampf(u["shields"] / u["max_shields"], 0.0, 1.0), Color("#5ab8f5"))
		_bar(Rect2(r.position.x + 4, r.end.y - 7, r.size.x - 8, 4), ratio, col)
	if main.selected_tags.size() > cells.size():
		var right: float = main.SEL_PANEL.position.x + 272 if main.is_production_selection() else main.SEL_PANEL.end.x - 14
		_text_r(right, main.SEL_PANEL.end.y - 14, "+%d more" % (main.selected_tags.size() - cells.size()), 15, C_MUTED)

func _order_label(u: Dictionary) -> String:
	if u["orders"].is_empty():
		return "Idle"
	match str(u["orders"][0]["type"]):
		"move": return "Moving"
		"attack_move": return "Attack-moving"
		"attack_target": return "Attacking"
		"harvest": return "Gathering"
		"build": return "Constructing"
		"hold_position": return "Holding position"
	return "Active"

func _draw_single(u: Dictionary) -> void:
	var sp: Rect2 = main.SEL_PANEL
	var def: Dictionary = RTSData.get_unit_def(str(u["unit_type"]))
	var is_own: bool = u["owner"] == main.local_player
	var pcol := RTSData.get_player_color(int(u["owner"]))

	# Portrait
	var pr := Rect2(sp.position + Vector2(16, 16), Vector2(160, 160))
	_vgrad(pr, Color("#2b3340"), Color("#10141a"))
	var tex := _icon_for(str(u["unit_type"]))
	if tex:
		draw_texture_rect(tex, pr.grow(-4.0), false)
	draw_rect(pr, pcol, false, 3.0)
	draw_rect(pr.grow(1.0), Color(0, 0, 0, 0.8), false, 1.0)
	if int(u["kills"]) > 0:
		_text(Vector2(pr.position.x, pr.end.y + 22), "Kills  %d" % int(u["kills"]), 16, C_MUTED)

	var x0 := pr.end.x + 20.0
	var y0 := sp.position.y + 20.0
	_text(Vector2(x0, y0 + 24), str(u["name"]), 28, C_TEXT)
	var attrs: Array = u["attributes"]
	var sub := RTSData.get_faction_name(str(u["faction"]))
	if not attrs.is_empty():
		sub += "  ·  " + "  ·  ".join(PackedStringArray(attrs))
	if not is_own:
		sub = "Enemy  ·  " + sub
	_text(Vector2(x0, y0 + 48), sub, 15, C_MUTED)

	# Health / shield bars
	var by := y0 + 62.0
	if u["max_shields"] > 0.0:
		_bar(Rect2(x0, by, 360, 15), clampf(u["shields"] / u["max_shields"], 0.0, 1.0), Color("#4fa8f0"), "Shield  %d / %d" % [int(ceil(u["shields"])), int(u["max_shields"])])
		by += 19.0
	var ratio := clampf(u["hp"] / maxf(1.0, u["max_hp"]), 0.0, 1.0)
	var hcol := Color("#3fcf6a") if ratio > 0.5 else (Color("#f0b232") if ratio > 0.25 else Color("#ee4b3f"))
	_bar(Rect2(x0, by, 360, 15), ratio, hcol, "Health  %d / %d" % [int(ceil(u["hp"])), int(u["max_hp"])])
	by += 30.0

	# Stats: two columns, labels muted, values bright
	var wpn: Dictionary = def.get("weapon", {})
	var col_a: Array = []
	var col_b: Array = []
	if not wpn.is_empty():
		var dmg := float(wpn.get("damage", 0))
		var atk := int(wpn.get("attacks", 1))
		var dps := dmg * float(atk) / maxf(0.1, float(wpn.get("period", 1.0)))
		col_a.append(["Damage", "%d" % int(dmg) if atk == 1 else "%d x %d" % [int(dmg), atk]])
		col_b.append(["DPS", "%.1f" % dps])
		col_a.append(["Range", "%.1f" % float(wpn.get("range", 0))])
	col_a.append(["Armor", "%d" % int(u["armor"])])
	if float(def.get("speed", 0.0)) > 0.0:
		col_b.append(["Speed", "%.1f" % float(u["speed"])])
	for i in range(col_a.size()):
		var py := by + 8.0 + float(i) * 24.0
		_text(Vector2(x0, py), str(col_a[i][0]), 15, C_MUTED)
		_text(Vector2(x0 + 70.0, py), str(col_a[i][1]), 17, C_TEXT)
	for i in range(col_b.size()):
		var py2 := by + 8.0 + float(i) * 24.0
		_text(Vector2(x0 + 200.0, py2), str(col_b[i][0]), 15, C_MUTED)
		_text(Vector2(x0 + 258.0, py2), str(col_b[i][1]), 17, C_TEXT)
	if not wpn.is_empty():
		var wl := str(wpn.get("name", ""))
		var bonus: Dictionary = wpn.get("bonus", {})
		for k in bonus.keys():
			wl += "   +%d vs %s" % [int(bonus[k]), str(k)]
		if float(wpn.get("splash_radius", 0.0)) > 0.0:
			wl += "   splash"
		_text(Vector2(x0, by + 8.0 + float(col_a.size()) * 24.0 + 4.0), wl, 14, Color(C_MUTED.r, C_MUTED.g, C_MUTED.b, 0.9))

	# Right column: production, status, blurb
	var rx := sp.position.x + 600.0
	var ry := sp.position.y + 22.0
	var building: bool = u["is_structure"] and float(u["build_progress"]) < 1.0
	if building:
		_text(Vector2(rx, ry + 14), "Under construction", 18, C_TEXT)
		_bar(Rect2(rx, ry + 24, 420, 18), float(u["build_progress"]), C_GOLD, "%d%%" % int(float(u["build_progress"]) * 100.0))
		ry += 62.0
	elif def.has("trains") and is_own:
		_text(Vector2(rx, ry + 12), "Production", 15, C_MUTED)
		var queue: Array = u["production_queue"]
		for i in range(5):
			var qr := Rect2(rx + float(i) * 72.0, ry + 20.0, 66.0, 66.0)
			_vgrad(qr, Color("#252c37"), Color("#12161c"))
			draw_rect(qr, C_EDGE_HI if i < queue.size() else C_EDGE, false, 1.0)
			if i < queue.size():
				var qt := _icon_for(str(queue[i]["unit_type"]))
				if qt:
					draw_texture_rect(qt, qr.grow(-3.0), false)
				if i == 0:
					var prog := clampf(float(queue[i]["progress"]) / maxf(0.1, float(queue[i]["total_time"])), 0.0, 1.0)
					_bar(Rect2(qr.position.x, qr.end.y + 3, qr.size.x, 6), prog, Color("#e5e7eb"))
		ry += 98.0
	else:
		ry += 4.0

	var status: Array = []
	if is_own and not u["is_structure"]:
		status.append(_order_label(u))
		if int(u["cargo_amount"]) > 0:
			status.append("Carrying %d %s" % [int(u["cargo_amount"]), str(u["cargo_type"])])
		if float(u["surge_timer"]) > 0.0:
			status.append("Surge  %.0fs" % float(u["surge_timer"]))
		if float(u["phase_cooldown"]) > 0.0:
			status.append("Phase Step  %.0fs" % float(u["phase_cooldown"]))
	if u["is_structure"] and not building:
		var prov := int(def.get("supply_provided", 0))
		if prov > 0:
			status.append("Provides  +%d supply" % prov)
	var sx := rx
	for s in status:
		_text(Vector2(sx, ry + 16), str(s), 16, C_TEXT)
		sx += _text_w(str(s), 16) + 36.0

	var blurb := str(def.get("blurb", ""))
	if blurb != "":
		draw_multiline_string(font, Vector2(rx, sp.end.y - 52.0), blurb, HORIZONTAL_ALIGNMENT_LEFT, 640.0, 15, 3, C_MUTED)

# ---------------------------------------------------------------------------
# Command card
# ---------------------------------------------------------------------------
func _draw_command_card() -> void:
	var origin: Vector2 = main.CARD_ORIGIN
	var card_w: float = 5.0 * main.CARD_BTN + 4.0 * main.CARD_GAP
	var card_h: float = 3.0 * main.CARD_BTN + 2.0 * main.CARD_GAP
	_frame(Rect2(origin - Vector2(8, 8), Vector2(card_w + 16, card_h + 16)))
	var hover: Vector2 = main.hover_pos()
	var pu: Dictionary = main.primary_unit()
	for i in range(15):
		var er := Rect2(origin + Vector2(float(i % 5) * (main.CARD_BTN + main.CARD_GAP), float(i / 5) * (main.CARD_BTN + main.CARD_GAP)), Vector2(main.CARD_BTN, main.CARD_BTN))
		draw_rect(er, Color(0.05, 0.06, 0.08, 0.7))
		draw_rect(er, Color(C_EDGE.r, C_EDGE.g, C_EDGE.b, 0.55), false, 1.0)
	for btn in main.get_card_buttons():
		var r: Rect2 = btn["rect"]
		var blocked: bool = str(btn["blocked"]) != ""
		var pending: bool = main.pending_ability == btn["ability_id"]
		var hov := r.has_point(hover)
		_vgrad(r, Color("#2c3441"), Color("#161b22"))
		var adef: Dictionary = btn["def"]
		var def_id := str(adef.get("unit", adef.get("structure", "")))
		var tex: Texture2D = _icon_for(def_id) if def_id != "" else null
		if tex:
			draw_texture_rect(tex, r.grow(-3.0), false)
		else:
			_glyph(str(btn["ability_id"]), r)
		# cooldown sweep
		if str(btn["ability_id"]) == "phase_step" and not pu.is_empty() and float(pu["phase_cooldown"]) > 0.0:
			var f := clampf(float(pu["phase_cooldown"]) / 7.0, 0.0, 1.0)
			draw_rect(Rect2(r.position, Vector2(r.size.x, r.size.y * f)), Color(0, 0, 0, 0.6))
		if blocked:
			draw_rect(r, Color(0.03, 0.04, 0.06, 0.55))
		var border := C_EDGE
		var bw := 1.0
		if hov:
			border = C_EDGE_HI
			bw = 2.0
		if pending:
			border = C_GOLD
			bw = 3.0
		draw_rect(r, border, false, bw)
		var hk := str(adef.get("hotkey", ""))
		if hk != "":
			var badge := Rect2(r.position + Vector2(3, 3), Vector2(19, 19))
			draw_rect(badge, Color(0, 0, 0, 0.72))
			_text(Vector2(badge.position.x, badge.position.y + 15), hk, 14, C_GOLD if not blocked else C_MUTED, HORIZONTAL_ALIGNMENT_CENTER, badge.size.x)

func _glyph(id: String, r: Rect2) -> void:
	var c := r.get_center()
	var u := r.size.x / 64.0
	var col := Color("#dbe4ee")
	var accent := Color("#6fb6ff")
	var P := func(pts: Array) -> PackedVector2Array:
		var out := PackedVector2Array()
		for p in pts:
			out.append(c + Vector2(p[0], p[1]) * u)
		return out
	match id:
		"move":
			draw_colored_polygon(P.call([[-20, -6], [3, -6], [3, -17], [22, 0], [3, 17], [3, 6], [-20, 6]]), accent)
		"stop":
			draw_rect(Rect2(c - Vector2(15, 15) * u, Vector2(30, 30) * u), Color("#e06a5e"))
			draw_rect(Rect2(c - Vector2(15, 15) * u, Vector2(30, 30) * u), Color(0, 0, 0, 0.5), false, 1.0)
		"hold_position":
			draw_colored_polygon(P.call([[-16, -17], [16, -17], [16, 3], [0, 19], [-16, 3]]), Color("#8aa0b8"))
			draw_colored_polygon(P.call([[-10, -11], [10, -11], [10, 1], [0, 12], [-10, 1]]), Color("#3a4a5e"))
		"attack":
			draw_line(c + Vector2(-17, 17) * u, c + Vector2(15, -15) * u, col, 5.0 * u)
			draw_line(c + Vector2(-17, -17) * u, c + Vector2(15, 15) * u, col, 5.0 * u)
			draw_line(c + Vector2(-20, 11) * u, c + Vector2(-11, 20) * u, Color("#e0b24a"), 4.0 * u)
			draw_line(c + Vector2(-20, -11) * u, c + Vector2(-11, -20) * u, Color("#e0b24a"), 4.0 * u)
		"harvest":
			_gem(c, 17.0 * u)
		"surge":
			draw_colored_polygon(P.call([[5, -22], [-13, 3], [-2, 3], [-6, 22], [14, -5], [2, -5]]), Color("#ffd24a"))
		"phase_step":
			draw_arc(c + Vector2(-10, 0) * u, 12.0 * u, 0.0, TAU, 24, Color(0.45, 0.8, 1.0, 0.55), 3.0 * u, true)
			draw_circle(c + Vector2(11, 0) * u, 12.0 * u, Color("#59c5ff"))
			draw_circle(c + Vector2(11, 0) * u, 6.0 * u, Color("#d9f3ff"))
		"charge":
			for i in range(3):
				draw_polyline(P.call([[-20 + i * 12, -13], [-8 + i * 12, 0], [-20 + i * 12, 13]]), Color("#ffd24a") if i == 2 else Color("#caa43a"), 5.0 * u)
		"emplace":
			draw_colored_polygon(P.call([[-20, 16], [20, 16], [13, 6], [-13, 6]]), Color("#8d98a6"))
			draw_line(c + Vector2(-4, 4) * u, c + Vector2(16, -14) * u, col, 7.0 * u)
			draw_colored_polygon(P.call([[-4, -20], [4, -20], [0, -12]]), Color("#e6b83e"))
		"mobilize":
			draw_rect(Rect2(c + Vector2(-18, -6) * u, Vector2(36, 12) * u), Color("#8d98a6"))
			draw_circle(c + Vector2(-12, 10) * u, 7.0 * u, Color("#3a4350"))
			draw_circle(c + Vector2(12, 10) * u, 7.0 * u, Color("#3a4350"))
			draw_line(c + Vector2(4, -6) * u, c + Vector2(22, -14) * u, col, 4.0 * u)
		"retract_silo":
			draw_rect(Rect2(c + Vector2(-14, -4) * u, Vector2(28, 18) * u), Color("#8d98a6"))
			draw_colored_polygon(P.call([[-8, -20], [8, -20], [8, -12], [14, -12], [0, -4], [-14, -12], [-8, -12]]), accent)
		"extend_silo":
			draw_rect(Rect2(c + Vector2(-14, -2) * u, Vector2(28, 18) * u), Color("#8d98a6"))
			draw_colored_polygon(P.call([[-8, -2], [8, -2], [8, -10], [14, -10], [0, -22], [-14, -10], [-8, -10]]), accent)
		"rally":
			draw_line(c + Vector2(-8, 18) * u, c + Vector2(-8, -18) * u, col, 3.0 * u)
			draw_colored_polygon(P.call([[-8, -18], [16, -10], [-8, -2]]), Color("#fbbf24"))
		_:
			draw_circle(c, 14.0 * u, Color("#5b687b"))

# ---------------------------------------------------------------------------
# Tooltip
# ---------------------------------------------------------------------------
func _draw_tooltip() -> void:
	var hover: Vector2 = main.hover_pos()
	var hit: Dictionary = {}
	for btn in main.get_card_buttons():
		if btn["rect"].has_point(hover):
			hit = btn
			break
	if hit.is_empty():
		return
	var adef: Dictionary = hit["def"]
	var cost: Dictionary = hit["cost"]
	var w := 372.0
	var inner_w := w - 28.0
	var desc := str(adef.get("desc", ""))
	var stats := ""
	if desc == "" and not cost.is_empty():
		var d: Dictionary = RTSData.get_unit_def(str(cost["def_id"]))
		desc = str(d.get("blurb", ""))
		var wp: Dictionary = d.get("weapon", {})
		stats = "Health %d" % int(d.get("max_hp", 0))
		if float(d.get("max_shields", 0.0)) > 0.0:
			stats += "   Shield %d" % int(d["max_shields"])
		if not wp.is_empty():
			stats += "   Damage %d   Range %.1f" % [int(wp.get("damage", 0)), float(wp.get("range", 0))]
	var desc_h := font.get_multiline_string_size(desc, HORIZONTAL_ALIGNMENT_LEFT, inner_w, 15).y if desc != "" else 0.0
	var h := 14.0 + 24.0
	if not cost.is_empty():
		h += 30.0
	if stats != "":
		h += 24.0
	h += desc_h + (10.0 if desc_h > 0.0 else 0.0)
	if str(hit["blocked"]) != "":
		h += 26.0
	h += 12.0
	var card_right: float = main.CARD_ORIGIN.x + 5.0 * main.CARD_BTN + 4.0 * main.CARD_GAP
	var r := Rect2(card_right - w, main.CARD_ORIGIN.y - 16.0 - h, w, h)
	draw_rect(Rect2(r.position + Vector2(3, 3), r.size), Color(0, 0, 0, 0.45))
	draw_rect(r, Color("#10141a", 0.97))
	draw_rect(r, C_EDGE_HI, false, 1.5)
	var y := r.position.y + 28.0
	_text(Vector2(r.position.x + 14, y), str(adef.get("name", "")), 20, C_TEXT)
	var hk := str(adef.get("hotkey", ""))
	if hk != "":
		_text_r(r.end.x - 14, y, "[%s]" % hk, 18, C_GOLD)
	y += 10.0
	if not cost.is_empty():
		var x := r.position.x + 14.0
		y += 22.0
		var p: Dictionary = SimEngine.players.get(main.local_player, {})
		if int(cost["crystal"]) > 0:
			_gem(Vector2(x + 8, y - 6), 8.0)
			var cc := C_RED if int(p.get("crystal", 0)) < int(cost["crystal"]) else C_TEXT
			_text(Vector2(x + 22, y), str(cost["crystal"]), 17, cc)
			x += 22.0 + _text_w(str(cost["crystal"]), 17) + 18.0
		if int(cost["aether"]) > 0:
			_drop(Vector2(x + 8, y - 6), 9.0)
			var ac := C_RED if int(p.get("aether", 0)) < int(cost["aether"]) else C_TEXT
			_text(Vector2(x + 22, y), str(cost["aether"]), 17, ac)
			x += 22.0 + _text_w(str(cost["aether"]), 17) + 18.0
		if int(cost["supply"]) > 0:
			_person(Vector2(x + 8, y - 6), 7.0, C_TEXT)
			_text(Vector2(x + 22, y), str(cost["supply"]), 17, C_TEXT)
			x += 22.0 + _text_w(str(cost["supply"]), 17) + 18.0
		if float(cost["time"]) > 0.0:
			var secs: float = maxf(2.5, float(cost["time"]) * 0.25) if adef.has("unit") else float(cost["time"]) * 0.25
			_text_r(r.end.x - 14, y, "%.0f s" % secs, 16, C_MUTED)
		y += 8.0
	if stats != "":
		y += 22.0
		_text(Vector2(r.position.x + 14, y), stats, 15, Color("#b9c4d2"))
	if desc != "":
		y += 12.0
		draw_multiline_string(font, Vector2(r.position.x + 14, y + 16.0), desc, HORIZONTAL_ALIGNMENT_LEFT, inner_w, 15, -1, C_MUTED)
		y += desc_h
	if str(hit["blocked"]) != "":
		y += 28.0
		_text(Vector2(r.position.x + 14, y), str(hit["blocked"]), 16, C_RED)

# ---------------------------------------------------------------------------
# Help overlay
# ---------------------------------------------------------------------------
func _draw_help() -> void:
	var r := Rect2(430.0, 120.0, 1060.0, 600.0)
	draw_rect(Rect2(0, 0, 1920, 1080), Color(0, 0, 0, 0.45))
	_frame(r, 0.97)
	_text(Vector2(r.position.x + 28, r.position.y + 48), "Controls", 32)
	draw_line(r.position + Vector2(28, 64), r.position + Vector2(r.size.x - 28, 64), C_EDGE_HI, 1.0)
	var left := [
		["Left click / drag", "Select units, drag a box for a squad"],
		["Double click", "Select all your units or structures of that type"],
		["Right click", "Move, attack, gather or set a rally point"],
		["Shift + click", "Queue orders, add to or remove from selection"],
		["Mouse wheel", "Zoom"],
		["Middle drag", "Pan the camera"],
		["Minimap", "Left click jumps there, right click orders"],
		["Command card", "Click, or press the letter in the corner"],
	]
	var right := [
		["Arrow keys / screen edges", "Pan camera; mouse scroll speed in F8 menu"],
		["Ctrl + 1-9", "Set a control group; press 1-9 to recall"],
		["Tab", "Cycle the active unit type in a mixed selection"],
		[".", "Select the next idle worker"],
		["Space", "Jump to the last attack alert, or home"],
		["Esc", "Cancel placement or targeting"],
		["F2", "Switch the viewed faction"],
		["F5  F6  F7", "Toggle the built-in AI for each faction"],
	]
	if not SimEngine.match_state.is_empty():
		right[6] = ["F8", "Match setup, speed, restart and surrender"]
		right[7] = ["Victory", "Destroy every enemy structure"]
	for i in range(left.size()):
		var y := r.position.y + 106.0 + float(i) * 56.0
		_text(Vector2(r.position.x + 28, y), str(left[i][0]), 19, C_GOLD)
		_text(Vector2(r.position.x + 28, y + 24), str(left[i][1]), 16, C_MUTED)
		_text(Vector2(r.position.x + 548, y), str(right[i][0]), 19, C_GOLD)
		_text(Vector2(r.position.x + 548, y + 24), str(right[i][1]), 16, C_MUTED)
