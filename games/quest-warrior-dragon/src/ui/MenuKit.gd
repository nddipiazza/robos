class_name MenuKit
## MenuKit — one look and one layout engine for every cursor-driven window in the game
## (command grid, item / spell / shop lists, YES-NO prompts, status tables).
##
## Scenes keep their own Panel nodes and cursor state; they call the render_* helpers
## to (re)fill a panel. Every renderer measures its text with the default font, clips
## anything that would overflow, scrolls long lists with ▲/▼ markers and sizes the
## panel to its content, so nothing spills outside a window.

const BG := Color(0.04, 0.06, 0.15, 0.96)
const BORDER := Color(0.92, 0.94, 1.0)
const TITLE := Color(1.0, 0.85, 0.3)
const TEXT := Color.WHITE
const HILITE := Color(1.0, 0.85, 0.3)
const DIM := Color(0.55, 0.58, 0.66)
const DESC := Color(0.7, 0.9, 1.0)
const GOLD := Color(0.6, 1.0, 0.6)
const CURSOR := "▶"

const FONT_SIZE := 13
const TITLE_SIZE := 13
const PAD := 12          # inner padding on every side
const ROW_H := 19        # list row pitch
const GUTTER := 16       # fixed cursor column, so the selected row never shifts sideways
const COL_GAP := 14      # gap between a row's text and its right-aligned value


static func style() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = BG
	s.border_color = BORDER
	s.set_border_width_all(2)
	s.set_corner_radius_all(6)
	return s


## Applies the shared window style to a panel (call once when it is built).
static func skin(panel: Panel) -> void:
	panel.add_theme_stylebox_override("panel", style())
	panel.clip_contents = true


static func label(text: String, size: int = FONT_SIZE, color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color.BLACK)
	l.add_theme_constant_override("shadow_offset_x", 1)
	l.add_theme_constant_override("shadow_offset_y", 1)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## Word-wrapped label of a fixed box. Wrapping is switched on *before* the size is set:
## otherwise Godot grows the label to the unwrapped line width and it overflows its window.
static func wrapped(text: String, size: int, color: Color, box: Vector2) -> Label:
	var l := label(text, size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.clip_text = true
	l.size = box
	return l


static func clear(panel: Control) -> void:
	for child in panel.get_children():
		panel.remove_child(child)
		child.queue_free()


## Measured with the font and spacing a Label actually renders with (the theme font), so
## right-aligned columns and wrapped boxes match what is drawn.
static func _probe(size: int) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size)
	return l


static func text_width(text: String, size: int = FONT_SIZE) -> float:
	if text == "":
		return 0.0
	var l := _probe(size)
	var font := l.get_theme_font("font")
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x + 2.0   # +shadow
	l.free()
	return ceilf(w)


## Height of `text` wrapped to `width` (honours explicit \n), including Label line spacing.
static func text_height(text: String, width: float, size: int = FONT_SIZE) -> float:
	if text == "":
		return 0.0
	var l := _probe(size)
	var font := l.get_theme_font("font")
	var spacing := float(l.get_theme_constant("line_spacing"))
	l.free()
	var line_h := font.get_height(size)
	var lines := 0
	for para in text.split("\n"):
		var w := font.get_string_size(para, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		# Word breaks waste part of each line: assume 90% fill so the box never comes up short.
		lines += maxi(1, int(ceil(w / maxf((width - 4.0) * 0.9, 1.0))))
	return ceilf(lines * (line_h + spacing))


## First visible row so `index` stays on screen in a window of `visible` rows.
static func scroll_for(index: int, count: int, visible: int, current: int = 0) -> int:
	if count <= visible:
		return 0
	var first := clampi(current, 0, count - visible)
	if index < first:
		first = index
	elif index >= first + visible:
		first = index - visible + 1
	return clampi(first, 0, count - visible)


## Groups a pack into one row per kind, NES style ("Herb  ×5"). Each row remembers the raw
## inventory index of its first item, which is what a scene's _use_item(idx) expects.
static func stack_inventory(inventory: Array) -> Array:
	var rows: Array = []
	var by_key := {}
	for i in range(inventory.size()):
		var it: Variant = inventory[i]
		var iid := ""
		var nm := ""
		var desc := ""
		var typ := ""
		if it is Dictionary:
			iid = str(it.get("id", ""))
			nm = str(it.get("name", iid))
			desc = str(it.get("desc", ""))
			typ = str(it.get("type", ""))
		else:
			nm = str(it)
		var key := iid if iid != "" else nm.to_lower()
		# Equipment is listed per piece; tools and keys stack.
		var stacks := typ not in ["weapon", "armor", "shield"]
		if stacks and by_key.has(key):
			var row: Dictionary = rows[by_key[key]]
			row["count"] = int(row["count"]) + 1
			row["value"] = "×%d" % int(row["count"])
			continue
		by_key[key] = rows.size()
		rows.append({"text": nm, "value": "", "id": iid, "index": i, "count": 1, "desc": desc})
	return rows


## Fills `panel` with a vertical list.
## opts: title, rows [{text, value?, disabled?}], index, width, max_rows (default 9),
##       desc (wrapped help line under the list), footer (left text on the last line),
##       footer_value (right text on the last line), empty_text, scroll (current first row,
##       returned value is the new one).
static func render_list(panel: Panel, opts: Dictionary) -> int:
	clear(panel)
	var rows: Array = opts.get("rows", [])
	var index := int(opts.get("index", 0))
	var width := float(opts.get("width", 260))
	var max_rows := int(opts.get("max_rows", 9))
	var title := str(opts.get("title", ""))
	var inner := width - PAD * 2
	var y := float(PAD) - 2.0

	if title != "":
		var tl := label(title, TITLE_SIZE, TITLE)
		tl.position = Vector2(PAD, y)
		tl.size = Vector2(inner, ROW_H)
		tl.clip_text = true
		panel.add_child(tl)
		y += ROW_H + 4

	var first := scroll_for(index, rows.size(), max_rows, int(opts.get("scroll", 0)))
	var shown := mini(rows.size() - first, max_rows)
	var value_w := 0.0
	for r in rows:
		value_w = maxf(value_w, text_width(str(r.get("value", ""))))
	# A list that scrolls keeps a narrow column on the right for its ▲/▼ markers.
	var marker_w := 10.0 if rows.size() > max_rows else 0.0
	var right := width - PAD - marker_w
	var text_w := inner - marker_w - GUTTER - (value_w + COL_GAP if value_w > 0.0 else 0.0)
	var list_top := y

	if rows.is_empty():
		var el := label(str(opts.get("empty_text", "Nothing.")), FONT_SIZE, DIM)
		el.position = Vector2(PAD + GUTTER, y)
		panel.add_child(el)
		y += ROW_H
	for k in range(shown):
		var i := first + k
		var r: Dictionary = rows[i]
		if bool(r.get("header", false)):
			# Section heading inside a list: never selectable, no cursor.
			var hl := label(str(r.get("text", "")), 11, DESC)
			hl.position = Vector2(PAD, y + 3)
			hl.size = Vector2(inner, ROW_H)
			hl.clip_text = true
			panel.add_child(hl)
			y += ROW_H
			continue
		var sel := i == index
		var color := DIM if bool(r.get("disabled", false)) else (HILITE if sel else TEXT)
		if sel:
			var cl := label(CURSOR, FONT_SIZE, HILITE)
			cl.position = Vector2(PAD, y)
			panel.add_child(cl)
		var tl := label(str(r.get("text", "")), FONT_SIZE, color)
		tl.position = Vector2(PAD + GUTTER, y)
		tl.size = Vector2(text_w, ROW_H)
		tl.clip_text = true
		tl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		panel.add_child(tl)
		var v := str(r.get("value", ""))
		if v != "":
			# Box wider than the measured text, right edge pinned: a label narrower than its
			# text grows to the right, so measuring errors must never decide the right edge.
			var vl := label(v, FONT_SIZE, color)
			vl.size = Vector2(value_w + 40.0, ROW_H)
			vl.position = Vector2(right - vl.size.x, y)
			vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			panel.add_child(vl)
		y += ROW_H

	# Scroll markers in the right margin, beside the first / last visible rows.
	if first > 0:
		var up := label("▲", 10, DESC)
		up.position = Vector2(width - PAD - 8, list_top + 2)
		panel.add_child(up)
	if first + shown < rows.size():
		var dn := label("▼", 10, DESC)
		dn.position = Vector2(width - PAD - 8, y - ROW_H + 4)
		panel.add_child(dn)

	var desc := str(opts.get("desc", ""))
	if opts.has("desc"):
		y += 4
		var line := ColorRect.new()
		line.color = Color(BORDER, 0.35)
		line.position = Vector2(PAD, y)
		line.size = Vector2(inner, 1)
		panel.add_child(line)
		y += 5
		# Reserve two lines so the window does not jump as the cursor moves.
		var dh := maxf(text_height(desc, inner, 12), 32.0)
		var dl := wrapped(desc, 12, DESC, Vector2(inner, dh))
		dl.position = Vector2(PAD, y)
		panel.add_child(dl)
		y += dh

	var footer := str(opts.get("footer", ""))
	var footer_value := str(opts.get("footer_value", ""))
	if footer != "" or footer_value != "":
		y += 6
		if footer != "":
			var fl := label(footer, 12, GOLD)
			fl.position = Vector2(PAD, y)
			panel.add_child(fl)
		if footer_value != "":
			var fv := label(footer_value, 12, GOLD)
			fv.position = Vector2(PAD, y)
			fv.size = Vector2(inner, ROW_H)
			fv.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			panel.add_child(fv)
		y += ROW_H - 2

	panel.size = Vector2(width, y + PAD - 2)
	return first


## Command grid (TALK / STATUS / ... in `cols` columns) with a fixed cursor gutter per cell.
static func render_grid(panel: Panel, items: Array, index: int, cols: int = 2, title: String = "COMMAND", col_w: float = 84.0) -> void:
	clear(panel)
	var y := float(PAD) - 2.0
	var width := PAD * 2 + col_w * cols
	if title != "":
		var tl := label(title, TITLE_SIZE, TITLE)
		tl.position = Vector2(PAD, y)
		panel.add_child(tl)
		y += ROW_H + 4
	var row_h := 22.0
	for i in range(items.size()):
		var cx := PAD + (i % cols) * col_w
		var cy := y + (i / cols) * row_h
		var sel := i == index
		if sel:
			var cl := label(CURSOR, FONT_SIZE + 1, HILITE)
			cl.position = Vector2(cx, cy)
			panel.add_child(cl)
		var l := label(str(items[i]), FONT_SIZE + 1, HILITE if sel else TEXT)
		l.position = Vector2(cx + GUTTER, cy)
		l.size = Vector2(col_w - GUTTER, row_h)
		l.clip_text = true
		panel.add_child(l)
	var rows := int(ceil(float(items.size()) / float(cols)))
	panel.size = Vector2(width, y + rows * row_h + PAD - 4)


## YES / NO style prompt. The prompt wraps to the window width and the window grows to fit
## both the prompt and every option.
static func render_choice(panel: Panel, prompt: String, options: Array, index: int, width: float = 240.0) -> void:
	clear(panel)
	var inner := width - PAD * 2
	var y := float(PAD) - 2.0
	if prompt != "":
		var ph := text_height(prompt, inner)
		var pl := wrapped(prompt, FONT_SIZE, TEXT, Vector2(inner, ph))
		pl.position = Vector2(PAD, y)
		panel.add_child(pl)
		y += ph + 6
	for i in range(options.size()):
		var sel := i == index
		if sel:
			var cl := label(CURSOR, FONT_SIZE, HILITE)
			cl.position = Vector2(PAD + 8, y)
			panel.add_child(cl)
		var ol := label(str(options[i]), FONT_SIZE, HILITE if sel else TEXT)
		ol.position = Vector2(PAD + 8 + GUTTER, y)
		panel.add_child(ol)
		y += ROW_H
	panel.size = Vector2(width, y + PAD - 4)


## Two-column key / value table (STATUS). Keys gold on the left, values right-aligned.
static func render_table(panel: Panel, title: String, rows: Array, width: float = 230.0, footer: String = "") -> void:
	clear(panel)
	var inner := width - PAD * 2
	var y := float(PAD) - 2.0
	if title != "":
		var tl := label(title, TITLE_SIZE, TITLE)
		tl.position = Vector2(PAD, y)
		panel.add_child(tl)
		y += ROW_H + 4
	for r in rows:
		var kl := label(str(r[0]), FONT_SIZE, TITLE)
		kl.position = Vector2(PAD, y)
		panel.add_child(kl)
		var vl := label(str(r[1]), FONT_SIZE, TEXT)
		vl.position = Vector2(PAD, y)
		vl.size = Vector2(inner, ROW_H)
		vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		vl.clip_text = true
		panel.add_child(vl)
		y += ROW_H
	if footer != "":
		y += 6
		var fl := label(footer, 11, DIM)
		fl.position = Vector2(PAD, y)
		fl.size = Vector2(inner, ROW_H)
		fl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		panel.add_child(fl)
		y += ROW_H - 4
	panel.size = Vector2(width, y + PAD - 2)


## Hero STATUS rows shared by every scene.
static func status_rows(stats: Dictionary, gold: int, equipment: Dictionary = {}) -> Array:
	var rows: Array = [
		["NAME", str(stats.get("name", "ERDRICK")).to_upper()],
		["LEVEL", str(stats.get("level", 1))],
		["HP", "%d / %d" % [int(stats.get("hp", 0)), int(stats.get("hp_max", 0))]],
		["MP", "%d / %d" % [int(stats.get("mp", 0)), int(stats.get("mp_max", 0))]],
		["STRENGTH", str(stats.get("str", 0))],
		["AGILITY", str(stats.get("agl", 0))],
		["ATTACK", str(stats.get("atk", 0))],
		["DEFENSE", str(stats.get("def", 0))],
		["EXP", str(stats.get("exp", 0))],
		["GOLD", str(gold)],
	]
	for slot in ["weapon", "armor", "shield"]:
		if equipment.has(slot):
			rows.append([slot.to_upper(), str(equipment[slot]) if str(equipment[slot]) != "" else "—"])
	return rows


## Next selectable row from `index` in direction `step` (skips heading rows); stays put at the ends.
static func step_index(rows: Array, index: int, step: int) -> int:
	var i := index + step
	while i >= 0 and i < rows.size():
		if not bool(rows[i].get("header", false)):
			return i
		i += step
	return index


## Screen position helpers (viewport 512 x 480).
static func centered(panel: Control, vw: float = 512.0, vh: float = 480.0) -> void:
	panel.position = Vector2(round((vw - panel.size.x) / 2.0), round((vh - panel.size.y) / 2.0))
