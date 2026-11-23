extends RefCounted

const EMERALD_BRIGHT := Color("#46ff70")
const EMERALD_EDGE := Color("#2fd85a")
const EMERALD_FILL := Color(0.055, 0.21, 0.115, 0.92)
const EMERALD_HOVER := Color(0.095, 0.33, 0.18, 0.96)
const EMERALD_DARK := Color(0.03, 0.11, 0.065, 0.90)
const TEAL_LINE := Color("#3a707a")
const TEAL_BRIGHT := Color("#6ce5f5")
const PANEL_BG := Color(0.025, 0.052, 0.066, 0.96)

static var _cached_title_font: Font
static var _cached_body_font: Font

static func title_font() -> Font:
	if _cached_title_font == null:
		var fv := FontVariation.new()
		fv.base_font = ThemeDB.fallback_font
		fv.variation_embolden = 0.28
		fv.spacing_glyph = 1
		_cached_title_font = fv
	return _cached_title_font

static func body_font() -> Font:
	if _cached_body_font == null:
		_cached_body_font = ThemeDB.fallback_font
	return _cached_body_font

static func style_box(bg: Color, border: Color, border_w: int = 2, radius: int = 2, pad_h: int = 16, pad_v: int = 8) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(border_w)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad_h
	s.content_margin_right = pad_h
	s.content_margin_top = pad_v
	s.content_margin_bottom = pad_v
	return s

static func apply_emerald_button(btn: Button, font_size: int = 20, primary_glow: bool = false) -> void:
	btn.add_theme_font_override("font", title_font())
	btn.add_theme_font_size_override("font_size", font_size)
	btn.add_theme_color_override("font_color", Color("#d8ffe2") if primary_glow else Color("#a7f0bc"))
	btn.add_theme_color_override("font_hover_color", Color.WHITE)
	btn.add_theme_color_override("font_pressed_color", Color.WHITE)
	btn.add_theme_color_override("font_focus_color", Color.WHITE)
	btn.add_theme_color_override("font_disabled_color", Color("#567066"))

	var normal := style_box(
		Color(0.08, 0.30, 0.15, 0.96) if primary_glow else EMERALD_FILL,
		EMERALD_BRIGHT if primary_glow else Color("#289c49"),
		2, 3, 18, 8
	)
	if primary_glow:
		normal.shadow_color = Color(0.18, 0.95, 0.38, 0.36)
		normal.shadow_size = 10
	var hover := style_box(Color(0.13, 0.43, 0.22, 0.98), Color("#7aff98"), 2, 3, 18, 8)
	hover.shadow_color = Color(0.22, 1.0, 0.44, 0.45)
	hover.shadow_size = 12
	var pressed := style_box(Color(0.17, 0.52, 0.27, 1.0), Color("#b4ffc4"), 3, 3, 18, 8)
	var disabled := style_box(Color(0.05, 0.09, 0.08, 0.85), Color("#2a3d38"), 1, 3, 18, 8)
	var focus := style_box(Color.TRANSPARENT, Color("#88ff9e"), 2, 3, 18, 8)
	focus.draw_center = false

	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("disabled", disabled)
	btn.add_theme_stylebox_override("focus", focus)

static func apply_teal_tab_button(btn: Button, font_size: int = 19) -> void:
	btn.add_theme_font_override("font", title_font())
	btn.add_theme_font_size_override("font_size", font_size)
	btn.add_theme_color_override("font_color", Color("#b2d8e4"))
	btn.add_theme_color_override("font_hover_color", Color("#eefbff"))
	btn.add_theme_color_override("font_pressed_color", Color("#ffffff"))
	btn.add_theme_color_override("font_focus_color", Color("#ffffff"))

	var normal := style_box(Color(0.035, 0.085, 0.115, 0.95), Color("#264c58"), 2, 2, 16, 10)
	var hover := style_box(Color(0.07, 0.17, 0.22, 0.98), Color("#54adc2"), 2, 2, 16, 10)
	var pressed := style_box(Color(0.11, 0.28, 0.34, 1.0), Color("#7cf0ff"), 2, 2, 16, 10)
	pressed.shadow_color = Color(0.28, 0.88, 1.0, 0.28)
	pressed.shadow_size = 8
	var focus := style_box(Color.TRANSPARENT, Color("#7cf0ff"), 2, 2, 16, 10)
	focus.draw_center = false

	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("hover_pressed", pressed)
	btn.add_theme_stylebox_override("focus", focus)


class MonitorChassis extends Control:
	enum Mode { CRT_MISSION, TECH_ARMORY }
	var mode: int = Mode.CRT_MISSION
	var header_title := "MISSION SELECT"
	var screen_rect := Rect2(120, 88, 1528, 790)
	var split_y := 0.0
	var _pulse := 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		set_process(DisplayServer.get_name() != "headless")

	func _process(delta: float) -> void:
		_pulse += delta * 2.4
		queue_redraw()

	func _chamfer_poly(r: Rect2, cut: float) -> PackedVector2Array:
		return PackedVector2Array([
			Vector2(r.position.x + cut, r.position.y),
			Vector2(r.end.x - cut, r.position.y),
			Vector2(r.end.x, r.position.y + cut),
			Vector2(r.end.x, r.end.y - cut),
			Vector2(r.end.x - cut, r.end.y),
			Vector2(r.position.x + cut, r.end.y),
			Vector2(r.position.x, r.end.y - cut),
			Vector2(r.position.x, r.position.y + cut),
		])

	func _draw() -> void:
		var w := size.x
		var h := size.y
		var font := ThemeDB.fallback_font
		# Solid deep space-black surround outside the console chassis
		draw_rect(Rect2(-position.x, -position.y, 1920, 1080), Color(0.008, 0.014, 0.018, 0.98), true)

		if mode == Mode.CRT_MISSION:
			_draw_crt_mission(w, h, font)
		else:
			_draw_tech_armory(w, h, font)

	func _draw_crt_mission(w: float, h: float, font: Font) -> void:
		var outer := _chamfer_poly(Rect2(0, 0, w, h), 34.0)
		draw_colored_polygon(outer, Color("#242920"))
		var mid := _chamfer_poly(Rect2(10, 10, w - 20, h - 20), 28.0)
		draw_colored_polygon(mid, Color("#353b2e"))
		var inner_shell := _chamfer_poly(Rect2(24, 24, w - 48, h - 48), 22.0)
		draw_colored_polygon(inner_shell, Color("#1b2019"))

		# Metallic pipe rails around outer perimeter
		var closed_outer := outer.duplicate()
		closed_outer.append(outer[0])
		draw_polyline(closed_outer, Color("#575f4b"), 4.0, true)
		var closed_mid := mid.duplicate()
		closed_mid.append(mid[0])
		draw_polyline(closed_mid, Color("#141812"), 3.0, true)
		var closed_inner := inner_shell.duplicate()
		closed_inner.append(inner_shell[0])
		draw_polyline(closed_inner, Color("#4c5442"), 2.0, true)

		# Corner rivets + bottom 3 heavy bolts (like Image 5)
		var bolts := [
			Vector2(44, 44), Vector2(w - 44, 44), Vector2(44, h - 44), Vector2(w - 44, h - 44),
			Vector2(w * 0.44, h - 28), Vector2(w * 0.50, h - 28), Vector2(w * 0.56, h - 28),
		]
		for b in bolts:
			draw_circle(b, 9.0, Color("#141712"))
			draw_circle(b, 6.5, Color("#49503f"))
			draw_arc(b, 6.5, 0.0, TAU, 16, Color("#6a735c"), 1.5)

		# Top-left warm amber pilot lamp (Image 5!)
		var lamp := Vector2(88, 62)
		var glow := 0.86 + 0.14 * sin(_pulse * 1.7)
		draw_circle(lamp, 20.0, Color(0.95, 0.68, 0.18, 0.22 * glow))
		draw_circle(lamp, 13.0, Color("#2c2516"))
		draw_circle(lamp, 9.5, Color(1.0, 0.84, 0.36, glow))
		draw_circle(lamp - Vector2(2.5, 2.5), 3.5, Color(1.0, 0.98, 0.85, 0.95))
		draw_arc(lamp, 13.0, 0.0, TAU, 20, Color("#6d6649"), 2.0)

		# Left mechanical clamp & two red illuminated rocker switches (Image 5!)
		draw_rect(Rect2(14, h * 0.46, 36, 280), Color("#262b22"), true)
		draw_rect(Rect2(14, h * 0.46, 36, 280), Color("#4e5645"), false, 2.0)
		for idx in 2:
			var sy := h * 0.56 + idx * 78.0
			var sw := Rect2(44, sy, 26, 56)
			draw_rect(sw.grow(4), Color("#121511"), true)
			draw_rect(sw, Color(0.78, 0.12, 0.20, 0.95), true)
			draw_rect(Rect2(sw.position.x + 4, sw.position.y + 5, sw.size.x - 8, 18), Color(1.0, 0.42, 0.48, 0.85), true)
			draw_rect(sw, Color("#ff6b7a"), false, 1.5)

		# Right vertical 10-segment LED VU level meter (Image 5!)
		var vu_box := Rect2(w - 72, h * 0.41, 30, 152)
		draw_rect(vu_box.grow(5), Color("#121612"), true)
		draw_rect(vu_box.grow(5), Color("#4d5543"), false, 2.0)
		var active_bars := 7 + int(round(sin(_pulse * 2.3) * 1.5))
		for seg in 10:
			var seg_idx := 9 - seg
			var seg_rect := Rect2(vu_box.position.x + 4, vu_box.position.y + 5 + seg * 14.2, vu_box.size.x - 8, 10.0)
			var lit := seg_idx < active_bars
			var c := Color("#35e85c") if seg_idx < 4 else (Color("#f5c838") if seg_idx < 8 else Color("#f23a3a"))
			if not lit:
				c = c.darkened(0.78)
			draw_rect(seg_rect, c, true)

		# Top-right angled trapezoid header plate ("MISSION SELECT")
		var tab := PackedVector2Array([
			Vector2(w * 0.36, 86),
			Vector2(w * 0.40, 34),
			Vector2(w * 0.84, 34),
			Vector2(w * 0.87, 86),
		])
		draw_colored_polygon(tab, Color("#0b1417"))
		var tab_closed := tab.duplicate()
		tab_closed.append(tab[0])
		draw_polyline(tab_closed, Color("#3a6d75"), 2.5, true)
		draw_string(font, Vector2(w * 0.45, 70), header_title, HORIZONTAL_ALIGNMENT_CENTER, w * 0.36, 26, Color("#89bac7"))

		# Recessed screen well & cyan-teal inner chamfered bezel
		var well := screen_rect.grow(6.0)
		draw_rect(well, Color("#05090c"), true)
		draw_rect(well, Color("#366973"), false, 2.5)
		draw_rect(screen_rect.grow(1.0), Color("#1b3c44"), false, 1.5)

	func _draw_tech_armory(w: float, h: float, font: Font) -> void:
		var outer := _chamfer_poly(Rect2(0, 0, w, h), 30.0)
		draw_colored_polygon(outer, Color("#171d21"))
		var armor := _chamfer_poly(Rect2(10, 10, w - 20, h - 20), 24.0)
		draw_colored_polygon(armor, Color("#242d33"))
		var recess := _chamfer_poly(Rect2(24, 24, w - 48, h - 48), 18.0)
		draw_colored_polygon(recess, Color("#11171b"))

		var c_outer := outer.duplicate()
		c_outer.append(outer[0])
		draw_polyline(c_outer, Color("#495861"), 3.0, true)
		var c_armor := armor.duplicate()
		c_armor.append(armor[0])
		draw_polyline(c_armor, Color("#0b0f12"), 2.5, true)

		# Top-left 4 diagonal cooling vents (////) + hull serial (Image 2!)
		for i in 4:
			var vx := 180.0 + i * 34.0
			var vent := PackedVector2Array([
				Vector2(vx, 68), Vector2(vx + 22, 34), Vector2(vx + 36, 34), Vector2(vx + 14, 68),
			])
			draw_colored_polygon(vent, Color("#090d10"))
			draw_line(Vector2(vx + 14, 68), Vector2(vx + 36, 34), Color("#3c4a52"), 1.5)
		draw_string(font, Vector2(w * 0.56, 30), "MSV-07 // MERIDIAN ARMORY", HORIZONTAL_ALIGNMENT_LEFT, 360, 14, Color("#4c6069"))

		# Left amber power bar & mechanical clamp (Image 2!)
		draw_rect(Rect2(12, 240, 26, 190), Color("#0d1215"), true)
		draw_rect(Rect2(16, 250, 14, 150), Color(0.82, 0.72, 0.24, 0.78), true)
		draw_rect(Rect2(12, 240, 26, 190), Color("#46555e"), false, 2.0)

		# Right heavy clamp + 4 stacked square status buttons (Image 2!)
		draw_rect(Rect2(w - 58, 390, 48, 220), Color("#2c363d"), true)
		draw_rect(Rect2(w - 58, 390, 48, 220), Color("#566773"), false, 2.0)
		for b_i in 4:
			var br := Rect2(w - 54, 710 + b_i * 46, 34, 38)
			draw_rect(br, Color("#172026"), true)
			draw_rect(br, Color("#3f535e"), false, 1.5)
			draw_string(font, Vector2(br.position.x + 6, br.position.y + 24), "0%d" % (b_i + 1), HORIZONTAL_ALIGNMENT_LEFT, 26, 13, Color("#7faab8"))

		# Centered trapezoid header plate ("TECH PURCHASE")
		var tab := PackedVector2Array([
			Vector2(w * 0.36, 94),
			Vector2(w * 0.40, 44),
			Vector2(w * 0.68, 44),
			Vector2(w * 0.72, 94),
		])
		draw_colored_polygon(tab, Color("#091115"))
		var tab_c := tab.duplicate()
		tab_c.append(tab[0])
		draw_polyline(tab_c, Color("#3c7480"), 2.5, true)
		draw_string(font, Vector2(w * 0.39, 78), header_title, HORIZONTAL_ALIGNMENT_CENTER, w * 0.30, 24, Color("#96cad6"))

		# Screen well & horizontal deck divider rail + recessed CLOSE button bay (Image 2!)
		var well := screen_rect.grow(6.0)
		draw_rect(well, Color("#050a0e"), true)
		draw_rect(well, Color("#356d78"), false, 2.5)
		var close_bay := Rect2(w - 262, h - 90, 252, 62)
		draw_rect(close_bay, Color("#091115"), true)
		draw_rect(close_bay, Color("#356d78"), false, 2.0)
		if split_y > 0.0:
			draw_rect(Rect2(well.position.x, split_y - 8, well.size.x, 16), Color("#1a2429"), true)
			draw_line(Vector2(well.position.x, split_y - 8), Vector2(well.end.x, split_y - 8), Color("#386f7a"), 2.0)
			draw_line(Vector2(well.position.x, split_y + 8), Vector2(well.end.x, split_y + 8), Color("#386f7a"), 2.0)


class HubCalloutHotspot extends Button:
	var callout_title := ""
	var callout_subtitle := ""
	var target_offset := Vector2.ZERO
	var label_offset := Vector2(0, -28)
	var accent := Color("#46ff70")
	var _hovered := false
	var _pulse := 0.0

	func _ready() -> void:
		flat = true
		focus_mode = Control.FOCUS_ALL
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		mouse_entered.connect(func(): _hovered = true; queue_redraw())
		mouse_exited.connect(func(): _hovered = false; queue_redraw())
		focus_entered.connect(func(): queue_redraw())
		focus_exited.connect(func(): queue_redraw())
		set_process(DisplayServer.get_name() != "headless")

	func _process(delta: float) -> void:
		_pulse += delta * 2.8
		if _hovered or has_focus():
			queue_redraw()

	func _draw() -> void:
		var active := _hovered or has_focus()
		var font := ThemeDB.fallback_font
		var pulse_a := 0.78 + 0.22 * sin(_pulse)
		var line_col := Color("#88ff9e") if active else Color(accent.r, accent.g, accent.b, 0.88)
		var bg_col := Color(0.03, 0.14, 0.07, 0.88 if active else 0.72)

		if active:
			# Tactical corner brackets around interactive room prop
			var r := Rect2(Vector2.ZERO, size)
			var cl := 18.0
			var bc := Color(accent.r, accent.g, accent.b, 0.65 * pulse_a)
			draw_rect(r, Color(accent.r, accent.g, accent.b, 0.06), true)
			for corner in [
				[r.position, Vector2(cl, 0), Vector2(0, cl)],
				[Vector2(r.end.x, r.position.y), Vector2(-cl, 0), Vector2(0, cl)],
				[Vector2(r.position.x, r.end.y), Vector2(cl, 0), Vector2(0, -cl)],
				[r.end, Vector2(-cl, 0), Vector2(0, -cl)],
			]:
				draw_line(corner[0], corner[0] + corner[1], bc, 2.0)
				draw_line(corner[0], corner[0] + corner[2], bc, 2.0)

		var target := size * 0.5 + target_offset
		var anchor := size * 0.5 + label_offset
		var title_size := font.get_string_size(callout_title, HORIZONTAL_ALIGNMENT_LEFT, -1, 17)
		var sub_size := Vector2.ZERO if (not active or callout_subtitle.is_empty()) else font.get_string_size(callout_subtitle, HORIZONTAL_ALIGNMENT_LEFT, -1, 13)
		var box_w := maxf(title_size.x, sub_size.x) + 16.0
		var box_h := 26.0 if (not active or callout_subtitle.is_empty()) else 42.0
		var box := Rect2(anchor.x - box_w * 0.5, anchor.y - box_h * 0.5, box_w, box_h)

		# Sleek borderless SC2-style emerald underline + angled leader line (Image 3!)
		var line_y := box.position.y + 24.0
		var elbow_x := box.position.x if target.x < box.get_center().x else box.end.x
		if absf(target.x - box.get_center().x) < box_w * 0.35:
			elbow_x = box.get_center().x
		var elbow := Vector2(elbow_x, line_y)

		# Soft dark shadow behind leader line for contrast against bright highlights
		draw_line(target, elbow, Color(0, 0, 0, 0.72), 4.0, true)
		draw_line(Vector2(box.position.x, line_y), Vector2(box.end.x, line_y), Color(0, 0, 0, 0.72), 4.0)
		draw_line(target, elbow, line_col, 2.2 if active else 1.7, true)
		draw_line(Vector2(box.position.x, line_y), Vector2(box.end.x, line_y), line_col, 2.4 if active else 1.8)

		# Subtle glowing pin on the interactive prop
		draw_circle(target, 6.0 if active else 3.8, Color(line_col.r, line_col.g, line_col.b, 0.32 if active else 0.18))
		draw_circle(target, 2.6, line_col)

		if active:
			draw_rect(box.grow(4), bg_col, true)
			draw_rect(box.grow(4), Color(line_col.r, line_col.g, line_col.b, 0.55), false, 1.2)
		draw_string_outline(font, Vector2(box.position.x + 8, box.position.y + 18), callout_title, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, 5, Color("#020704"))
		draw_string(font, Vector2(box.position.x + 8, box.position.y + 18), callout_title, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color.WHITE if active else Color("#e6f7ec"))
		if active and not callout_subtitle.is_empty():
			draw_string_outline(font, Vector2(box.position.x + 8, box.position.y + 38), callout_subtitle, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 3, Color("#020704"))
			draw_string(font, Vector2(box.position.x + 8, box.position.y + 38), callout_subtitle, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("#7ef59c"))


class TechIconGlyph extends Button:
	var glyph := "shield_hex"
	var purchased := false
	var selected_slot := false
	var hover_title := ""
	var hover_summary := ""

	func _ready() -> void:
		flat = true
		custom_minimum_size = Vector2(60, 60)
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		mouse_entered.connect(queue_redraw)
		mouse_exited.connect(queue_redraw)
		focus_entered.connect(queue_redraw)
		focus_exited.connect(queue_redraw)

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		var hovered := is_hovered() or has_focus()
		# Authentic Image 2 palette: cyan for purchased, deep crimson-amber for unpurchased, bright neon green border when selected!
		var base_bg := Color("#08242e") if purchased else Color("#240b0d")
		var fg := Color("#4ce8ff") if purchased else Color("#eb5038")
		if hovered:
			fg = fg.lightened(0.22)
			base_bg = base_bg.lightened(0.12)

		draw_rect(r, base_bg, true)
		draw_rect(r.grow(-4), Color(fg.r, fg.g, fg.b, 0.14), true)

		var border_col := Color("#44ff68") if selected_slot else (Color("#3cc9e8") if purchased else Color("#6e2e2b"))
		if hovered and not selected_slot:
			border_col = Color("#9dffb0")
		draw_rect(r, border_col, false, 3.0 if selected_slot else 2.0)

		var c := size * 0.5
		_draw_vector_glyph(c, fg)

		if purchased:
			# Crisp corner purchased indicator pip
			var badge := Rect2(size.x - 15, 3, 12, 12)
			draw_rect(badge, Color("#114b59"), true)
			draw_line(badge.position + Vector2(2, 6), badge.position + Vector2(5, 9), Color("#7cf4ff"), 2.0)
			draw_line(badge.position + Vector2(5, 9), badge.position + Vector2(10, 3), Color("#7cf4ff"), 2.0)

	func _draw_vector_glyph(c: Vector2, col: Color) -> void:
		match glyph:
			"riot_shield", "shield_hex", "armor_plate":
				var pts := PackedVector2Array([
					c + Vector2(0, -18), c + Vector2(15, -10), c + Vector2(13, 8),
					c + Vector2(0, 19), c + Vector2(-13, 8), c + Vector2(-15, -10),
				])
				draw_colored_polygon(pts, Color(col.r, col.g, col.b, 0.28))
				pts.append(pts[0])
				draw_polyline(pts, col, 2.5, true)
				draw_line(c + Vector2(0, -12), c + Vector2(0, 12), col, 2.0)
			"syringe":
				draw_line(c + Vector2(-13, 13), c + Vector2(9, -9), col, 5.0)
				draw_line(c + Vector2(9, -9), c + Vector2(16, -16), col, 2.0)
				draw_line(c + Vector2(-17, 17), c + Vector2(-10, 10), col, 2.5)
				draw_line(c + Vector2(-19, 13), c + Vector2(-13, 19), col, 2.5)
			"med_cross":
				draw_rect(Rect2(c.x - 5, c.y - 16, 10, 32), col, true)
				draw_rect(Rect2(c.x - 16, c.y - 5, 32, 10), col, true)
			"flame_jet":
				var flame := PackedVector2Array([
					c + Vector2(0, -19), c + Vector2(12, -3), c + Vector2(9, 14),
					c + Vector2(0, 18), c + Vector2(-9, 14), c + Vector2(-12, -3),
				])
				draw_colored_polygon(flame, Color(col.r, col.g, col.b, 0.45))
				flame.append(flame[0])
				draw_polyline(flame, col, 2.2, true)
			"multi_missile", "artillery_shell":
				for off in [-9.0, 0.0, 9.0]:
					draw_line(c + Vector2(off - 4, 13), c + Vector2(off + 4, -12), col, 3.2)
					draw_circle(c + Vector2(off + 4, -13), 2.5, col)
			"range_scope", "crosshair_dual":
				draw_arc(c, 14.0, 0.0, TAU, 24, col, 2.2)
				draw_circle(c, 3.0, col)
				for d in [Vector2(18, 0), Vector2(-18, 0), Vector2(0, 18), Vector2(0, -18)]:
					draw_line(c + d * 0.45, c + d, col, 2.0)
			"bunker_plus":
				draw_rect(Rect2(c.x - 16, c.y - 6, 32, 18), Color(col.r, col.g, col.b, 0.32), true)
				draw_rect(Rect2(c.x - 16, c.y - 6, 32, 18), col, false, 2.2)
				draw_rect(Rect2(c.x - 10, c.y - 14, 20, 8), col, false, 2.0)
			"rail_bolt", "plasma_spark":
				var bolt := PackedVector2Array([
					c + Vector2(4, -18), c + Vector2(-11, 2), c + Vector2(-1, 2),
					c + Vector2(-5, 18), c + Vector2(12, -2), c + Vector2(2, -2),
				])
				draw_colored_polygon(bolt, col)
			"battery_plus", "supply_crate":
				draw_rect(Rect2(c.x - 13, c.y - 12, 26, 26), Color(col.r, col.g, col.b, 0.25), true)
				draw_rect(Rect2(c.x - 13, c.y - 12, 26, 26), col, false, 2.2)
				draw_line(c + Vector2(-7, 1), c + Vector2(7, 1), col, 2.5)
				draw_line(c + Vector2(0, -6), c + Vector2(0, 8), col, 2.5)
			"radar_pulse", "concussive_wave":
				draw_circle(c, 3.5, col)
				draw_arc(c, 9.0, -PI * 0.75, PI * 0.75, 18, col, 2.0)
				draw_arc(c, 15.5, -PI * 0.75, PI * 0.75, 22, col, 2.0)
			"cloak_eye":
				draw_arc(c + Vector2(0, 5), 17.0, PI * 1.18, PI * 1.82, 18, col, 2.2)
				draw_arc(c + Vector2(0, -5), 17.0, PI * 0.18, PI * 0.82, 18, col, 2.2)
				draw_circle(c, 4.5, col)
			"drop_arrow", "wing_boot":
				draw_line(c + Vector2(0, -16), c + Vector2(0, 12), col, 3.2)
				draw_line(c + Vector2(-11, 2), c + Vector2(0, 14), col, 3.0)
				draw_line(c + Vector2(11, 2), c + Vector2(0, 14), col, 3.0)
				draw_line(c + Vector2(-13, 18), c + Vector2(13, 18), col, 2.2)
			_:
				draw_arc(c, 11.0, 0.0, TAU, 20, col, 3.0)
				for i in 6:
					var a := i * TAU / 6.0
					draw_line(c + Vector2.from_angle(a) * 11.0, c + Vector2.from_angle(a) * 17.0, col, 2.8)
