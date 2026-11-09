class_name NESWindow
extends RefCounted

const NES_BLUE := Color(0.0, 0.12, 0.56, 1.0)
const NES_DARK := Color(0.02, 0.03, 0.12, 1.0)
const NES_BORDER := Color(0.92, 0.93, 0.96, 1.0)
const NES_GOLD := Color(1.0, 0.86, 0.25, 1.0)
const NES_WHITE := Color(0.96, 0.97, 0.98, 1.0)
const NES_DIM := Color(0.68, 0.74, 0.88, 1.0)

static func make_panel(pos: Vector2, sz: Vector2, bg_col: Color = NES_BLUE) -> Panel:
	var p := Panel.new()
	p.position = pos
	p.size = sz
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg_col
	sb.border_color = NES_BORDER
	sb.set_border_width_all(3)
	sb.set_corner_radius_all(3)
	p.add_theme_stylebox_override("panel", sb)
	return p

static func make_label(txt: String, pos: Vector2, sz: Vector2, font_sz: int = 13, col: Color = NES_WHITE, align: int = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = txt
	l.position = pos
	l.size = sz
	l.horizontal_alignment = align
	l.add_theme_font_size_override("font_size", font_sz)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	l.add_theme_constant_override("shadow_offset_x", 1)
	l.add_theme_constant_override("shadow_offset_y", 1)
	return l
