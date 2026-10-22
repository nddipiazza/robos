extends CanvasLayer
## "Play the game" HUD: a band drawn *below* the 512x480 game viewport while the
## robos-jrpg AI plays, so screen recordings and screenshots carry the BDD-style
## objective, a wall-clock timer and the condensed hero stats the dashboard shows.
##
## The band never covers game UI: the window grows by BAND_H viewport pixels and
## the content scale aspect switches to KEEP_WIDTH, so every scene keeps drawing in
## the top 512x480 and this layer owns the extra rows underneath.

const VW := 512
const VH := 480
const BAND_H := 88          # keep in sync with HUD_BAND_H in tests/e2e/play_full_game.py
const REFRESH_MS := 200

const COL_BG      := Color(0.05, 0.07, 0.09, 1.0)
const COL_LINE    := Color(0.0, 0.74, 0.83, 0.8)
const COL_TITLE   := Color(0.0, 0.85, 0.95)
const COL_TEXT    := Color(0.92, 0.92, 0.92)
const COL_DIM     := Color(0.62, 0.66, 0.70)
const COL_GIVEN   := Color(0.55, 0.80, 1.00)
const COL_NOW     := Color(1.00, 0.88, 0.35)
const COL_HP_OK   := Color(0.4, 1.0, 0.4)
const COL_HP_MID  := Color(1.0, 0.9, 0.2)
const COL_HP_LOW  := Color(1.0, 0.35, 0.3)
const COL_MP      := Color(0.4, 0.7, 1.0)
const COL_GOLD    := Color(1.0, 0.82, 0.3)

var _bg: ColorRect
var _title_lbl: Label
var _timer_lbl: Label
var _bdd_lbl: Label
var _now_lbl: Label
var _stats_box: HBoxContainer
var _stat_lbls: Dictionary = {}
var _gear_lbl: Label
var _where_lbl: Label
var _last_refresh_ms := 0
var _prev_aspect := Window.CONTENT_SCALE_ASPECT_IGNORE
var _prev_size := Vector2i(1024, 960)


func _ready() -> void:
	layer = 90
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build()
	_grow_window()
	_refresh()


func _exit_tree() -> void:
	_restore_window()


func _process(_delta: float) -> void:
	var now := Time.get_ticks_msec()
	if now - _last_refresh_ms < REFRESH_MS:
		return
	_last_refresh_ms = now
	_refresh()


# ── Window ──────────────────────────────────────────────────────────────────
func _grow_window() -> void:
	var win := get_window()
	if not win:
		return
	_prev_aspect = win.content_scale_aspect
	_prev_size = win.size
	win.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	win.content_scale_size = Vector2i(VW, VH)
	win.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP_WIDTH
	var scale := maxi(1, int(round(float(_prev_size.x) / float(VW))))
	win.size = Vector2i(VW * scale, (VH + BAND_H) * scale)


func _restore_window() -> void:
	var win := get_window()
	if not win:
		return
	win.content_scale_aspect = _prev_aspect
	win.size = _prev_size


# ── Layout ──────────────────────────────────────────────────────────────────
func _label(parent: Node, pos: Vector2, size: Vector2, font_size: int, color: Color, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.position = pos
	l.size = size
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.horizontal_alignment = align
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	l.clip_text = true
	parent.add_child(l)
	return l


func _build() -> void:
	_bg = ColorRect.new()
	_bg.color = COL_BG
	_bg.position = Vector2(0, VH)
	_bg.size = Vector2(VW, BAND_H)
	add_child(_bg)
	var line := ColorRect.new()
	line.color = COL_LINE
	line.position = Vector2(0, 0)
	line.size = Vector2(VW, 1)
	_bg.add_child(line)

	# Row 1: milestone title + timer
	_title_lbl = _label(_bg, Vector2(6, 3), Vector2(392, 16), 12, COL_TITLE)
	_timer_lbl = _label(_bg, Vector2(398, 3), Vector2(108, 16), 12, COL_TEXT, HORIZONTAL_ALIGNMENT_RIGHT)
	# Row 2: Given / When / Then
	_bdd_lbl = _label(_bg, Vector2(6, 19), Vector2(500, 14), 10, COL_GIVEN)
	# Row 3: what the brain is doing right now
	_now_lbl = _label(_bg, Vector2(6, 33), Vector2(300, 14), 10, COL_NOW)
	# Row 4: condensed stats
	_stats_box = HBoxContainer.new()
	_stats_box.position = Vector2(6, 49)
	_stats_box.size = Vector2(500, 16)
	_stats_box.add_theme_constant_override("separation", 10)
	_bg.add_child(_stats_box)
	for key in ["lv", "hp", "mp", "gold", "exp", "atk", "def", "battles", "deaths", "inputs"]:
		var l := Label.new()
		l.add_theme_font_size_override("font_size", 11)
		l.add_theme_color_override("font_color", COL_TEXT)
		_stats_box.add_child(l)
		_stat_lbls[key] = l
	_stat_lbls["hp"].add_theme_color_override("font_color", COL_HP_OK)
	_stat_lbls["mp"].add_theme_color_override("font_color", COL_MP)
	_stat_lbls["gold"].add_theme_color_override("font_color", COL_GOLD)
	# Row 5: gear + pack, location on the right
	_gear_lbl = _label(_bg, Vector2(6, 67), Vector2(500, 14), 9, COL_DIM)
	_where_lbl = _label(_bg, Vector2(300, 33), Vector2(206, 14), 10, COL_DIM, HORIZONTAL_ALIGNMENT_RIGHT)


# ── Data ────────────────────────────────────────────────────────────────────
func _refresh() -> void:
	var ai: Node = get_node_or_null("/root/AIEngine")
	var gs: Node = get_node_or_null("/root/GameState")
	var rep: Dictionary = ai.call("get_milestone_report") if ai and ai.has_method("get_milestone_report") else {}
	var cur: Dictionary = rep.get("current", {})
	var idx := int(rep.get("index", 0))
	var total := int(rep.get("total", 0))
	var status := str(rep.get("status", "idle"))

	# Row 1
	var name := str(cur.get("name", ""))
	if status == "completed" or (total > 0 and idx >= total):
		_title_lbl.text = "ALL %d MILESTONES COMPLETE" % total
	elif name == "":
		_title_lbl.text = "robos-jrpg AI — play the game"
	else:
		var opt := " (optional)" if bool(cur.get("optional", false)) else ""
		_title_lbl.text = "Milestone %d/%d  %s%s" % [idx + 1, total, name, opt]
	var secs := int(rep.get("elapsed_sec", 0.0))
	var ts := float(rep.get("time_scale", Engine.time_scale))
	_timer_lbl.text = "%02d:%02d:%02d  x%s" % [secs / 3600, (secs / 60) % 60, secs % 60, _fmt_scale(ts)]

	# Row 2: Gherkin-style summary of the registry entry
	_bdd_lbl.text = _bdd_line(cur)

	# Row 3: live objective from the brain
	var obj: Dictionary = rep.get("objective", {})
	var label := str(obj.get("label", ""))
	if label == "":
		_now_lbl.text = ""
	else:
		var tgt: Array = obj.get("tile", [])
		var where := ""
		if str(obj.get("map", "")) != "" and tgt.size() == 2 and int(tgt[0]) >= 0:
			where = "  @ %s (%d,%d)" % [str(obj.get("map", "")), int(tgt[0]), int(tgt[1])]
		_now_lbl.text = "Now: %s%s" % [label, where]

	# Row 4: stats
	if gs:
		var hs: Dictionary = gs.hero_stats
		var hp := int(hs.get("hp", 0))
		var hp_max := int(hs.get("hp_max", 1))
		_stat_lbls["lv"].text = "L%d" % int(hs.get("level", 1))
		_stat_lbls["hp"].text = "HP %d/%d" % [hp, hp_max]
		var ratio := float(hp) / float(maxi(1, hp_max))
		_stat_lbls["hp"].add_theme_color_override("font_color", COL_HP_OK if ratio > 0.5 else (COL_HP_MID if ratio > 0.25 else COL_HP_LOW))
		_stat_lbls["mp"].text = "MP %d/%d" % [int(hs.get("mp", 0)), int(hs.get("mp_max", 0))]
		_stat_lbls["gold"].text = "G %d" % int(hs.get("gold", 0))
		_stat_lbls["exp"].text = "XP %d" % int(hs.get("exp", 0))
		_stat_lbls["atk"].text = "ATK %d" % int(hs.get("atk", 0))
		_stat_lbls["def"].text = "DEF %d" % int(hs.get("def", 0))
	_stat_lbls["battles"].text = "Battles %d" % int(rep.get("battles", 0))
	var deaths := int(rep.get("deaths", 0))
	_stat_lbls["deaths"].text = "Deaths %d" % deaths
	_stat_lbls["deaths"].add_theme_color_override("font_color", COL_HP_LOW if deaths > 0 else COL_TEXT)
	_stat_lbls["inputs"].text = "Inputs %d" % int(rep.get("ticks", 0))

	# Row 5: gear, pack and location
	if gs:
		var gear: Array[String] = []
		for slot in ["weapon", "armor", "shield"]:
			var eq := str(gs.get_equipped(slot))
			if eq != "":
				gear.append(str(gs.equipment_info(eq).get("name", eq.capitalize())))
		var counts: Dictionary = {}
		var order: Array[String] = []
		for it in gs.inventory:
			var nm := _item_name(it)
			if nm == "":
				continue
			if not counts.has(nm):
				order.append(nm)
			counts[nm] = int(counts.get(nm, 0)) + 1
		var pack: Array[String] = []
		for nm in order:
			pack.append(nm if counts[nm] == 1 else "%s x%d" % [nm, counts[nm]])
		var gear_txt := " / ".join(gear) if not gear.is_empty() else "no gear"
		_gear_lbl.text = gear_txt + ("  |  " + ", ".join(pack) if not pack.is_empty() else "")
	_where_lbl.text = _location_text()


func _bdd_line(cur: Dictionary) -> String:
	if cur.is_empty() or str(cur.get("id", "")) == "":
		return ""
	var tile: Dictionary = cur.get("tile", {})
	var given := "Given %s (%d,%d)" % [str(cur.get("map", "?")), int(tile.get("col", 0)), int(tile.get("row", 0))]
	var when := "When %s" % _when_text(str(cur.get("type", "")), cur)
	var then := "Then %s" % _then_text(cur.get("done_when", {}))
	return "%s  ·  %s  ·  %s" % [given, when, then]


func _when_text(mtype: String, cur: Dictionary) -> String:
	match mtype:
		"talk": return "I talk"
		"chest": return "I take the chest"
		"buy": return "I buy %s" % str(cur.get("item_id", "it")).replace("_", " ")
		"search": return "I search"
		"door": return "I open the door"
		"step": return "I step on the tile"
		"use_item": return "I use %s" % str(cur.get("item_id", "the item")).replace("_", " ")
		"boss": return "I fight the boss"
		"level": return "I grind"
		"inn": return "I rest at the inn"
		"spell": return "I cast the spell"
	return mtype if mtype != "" else "I act"


func _then_text(dw: Dictionary) -> String:
	match str(dw.get("kind", "")):
		"flag": return "flag %s is set" % str(dw.get("flag", ""))
		"level": return "level >= %d" % int(dw.get("value", 0))
		"has_item": return "pack has %s" % str(dw.get("item_id", "")).replace("_", " ")
		"chest": return "chest at (%d,%d) is opened" % [int(dw.get("col", 0)), int(dw.get("row", 0))]
		"door": return "door %s is unlocked" % str(dw.get("key", "")).replace("_", " ")
		"equipped_at_least":
			var want := str(dw.get("item_id", "")).replace("_", " ")
			return "%s equipped (%s >= %d)" % [want, str(dw.get("slot", "")), int(dw.get("value", 0))] if want != "" \
					else "%s >= %d" % [str(dw.get("slot", "")), int(dw.get("value", 0))]
		"": return "done"
	var parts: Array[String] = []
	for k in dw.keys():
		if k != "kind":
			parts.append("%s=%s" % [str(k), str(dw[k])])
	return "%s %s" % [str(dw.get("kind", "")), " ".join(parts)]


func _item_name(it: Variant) -> String:
	if it is Dictionary:
		return str(it.get("name", it.get("id", "")))
	return str(it)


func _location_text() -> String:
	var sc: Node = get_tree().current_scene if get_tree() else null
	if not sc:
		return ""
	var gcs: Node = get_node_or_null("/root/GameControlServer")
	var key := ""
	if gcs and gcs.has_method("_get_active_scene_map_key"):
		key = str(gcs.call("_get_active_scene_map_key", sc))
	if key == "":
		key = str(sc.name)
	var tile: Variant = sc.get("_hero_tile")
	if tile is Vector2i:
		return "%s (%d,%d)" % [key, tile.x, tile.y]
	return key


func _fmt_scale(ts: float) -> String:
	if absf(ts - roundf(ts)) < 0.01:
		return str(int(roundf(ts)))
	return "%.1f" % ts
