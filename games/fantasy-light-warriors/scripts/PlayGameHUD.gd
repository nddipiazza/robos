extends CanvasLayer

const GAME_W: int = 512
const GAME_H: int = 480
const BAND_H: int = 88

var _panel: ColorRect
var _top_border: ColorRect
var _row_milestone: Label
var _row_timer: Label
var _row_bdd: Label
var _row_now: Label
var _row_map: Label
var _row_stats: Label
var _row_items: Label

var _start_msec: int = 0
var _accum: float = 0.0

func _ready() -> void:
	layer = 120
	process_mode = Node.PROCESS_MODE_ALWAYS
	_start_msec = Time.get_ticks_msec()
	_build()
	_refresh()

func _build() -> void:
	_panel = ColorRect.new()
	_panel.position = Vector2(0, GAME_H)
	_panel.size = Vector2(GAME_W, BAND_H)
	_panel.color = Color(0.05, 0.06, 0.10, 1.0)
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_panel)

	_top_border = ColorRect.new()
	_top_border.position = Vector2(0, GAME_H)
	_top_border.size = Vector2(GAME_W, 2)
	_top_border.color = Color(0.95, 0.78, 0.22, 1.0)
	_top_border.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top_border)

	_row_milestone = _make_label(Vector2(6, GAME_H + 4), Vector2(GAME_W - 110, 16), 11, Color(1.0, 0.88, 0.35))
	_row_timer = _make_label(Vector2(GAME_W - 104, GAME_H + 4), Vector2(98, 16), 11, Color(0.70, 0.85, 1.0))
	_row_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

	_row_bdd = _make_label(Vector2(6, GAME_H + 20), Vector2(GAME_W - 12, 16), 10, Color(0.82, 0.90, 0.98))
	_row_now = _make_label(Vector2(6, GAME_H + 36), Vector2(GAME_W - 150, 16), 10, Color(0.55, 0.95, 0.65))
	_row_map = _make_label(Vector2(GAME_W - 144, GAME_H + 36), Vector2(138, 16), 10, Color(0.75, 0.78, 0.88))
	_row_map.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

	_row_stats = _make_label(Vector2(6, GAME_H + 52), Vector2(GAME_W - 12, 16), 10, Color(0.95, 0.95, 0.98))
	_row_items = _make_label(Vector2(6, GAME_H + 68), Vector2(GAME_W - 12, 16), 10, Color(0.78, 0.82, 0.90))

func _make_label(pos: Vector2, sz: Vector2, font_px: int, col: Color) -> Label:
	var l := Label.new()
	l.position = pos
	l.size = sz
	l.clip_text = true
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_size_override("font_size", font_px)
	l.add_theme_color_override("font_color", col)
	add_child(l)
	return l

func _process(delta: float) -> void:
	_accum += delta
	if _accum < 0.15:
		return
	_accum = 0.0
	_refresh()

func _refresh() -> void:
	var brain := get_node_or_null("/root/PlayGameBrain")
	var gs := get_node_or_null("/root/GameState")
	var sc := get_tree().current_scene

	var elapsed_s: int = int((Time.get_ticks_msec() - _start_msec) / 1000.0)
	var hh: int = elapsed_s / 3600
	var mm: int = (elapsed_s % 3600) / 60
	var ss: int = elapsed_s % 60
	var tscale: int = int(round(Engine.time_scale))
	_row_timer.text = "%02d:%02d:%02d  x%d" % [hh, mm, ss, tscale]

	if brain:
		var m: Dictionary = brain.current_milestone()
		var idx: int = int(m.get("index", brain.current_milestone_index))
		var total: int = int(brain.total_milestones)
		var mname: String = str(m.get("name", "All milestones complete"))
		_row_milestone.text = "Milestone %d/%d  %s" % [idx, total, mname]
		_row_bdd.text = "Given %s  ·  When %s  ·  Then %s" % [
			str(m.get("given", "—")),
			str(m.get("when", "—")),
			str(m.get("then", "—"))
		]
		_row_now.text = "Now: %s" % str(brain.current_action_description)
	else:
		_row_milestone.text = "Fantasy: Light Warriors (WIP) — Autonomous AI Playthrough"
		_row_bdd.text = ""
		_row_now.text = ""

	var map_name := str(sc.name) if sc else "TitleScreen"
	var pos_str := ""
	if sc and "_hero_tile" in sc:
		pos_str = " (%d,%d)" % [sc._hero_tile.x, sc._hero_tile.y]
	_row_map.text = "%s%s" % [map_name, pos_str]

	if gs:
		var h: Dictionary = gs.hero_stats_summary()
		var inputs_cnt: int = int(brain.total_inputs_sent) if brain else 0
		_row_stats.text = "L%d  HP %d/%d  MP %d/%d  G %d  XP %d  ATK %d  DEF %d  Battles %d  Deaths %d  Inputs %d" % [
			int(h.get("level", 1)),
			int(h.get("hp", 35)), int(h.get("hp_max", 35)),
			int(h.get("mp", 2)), int(h.get("mp_max", 2)),
			int(h.get("gold", 400)), int(h.get("exp", 0)),
			int(h.get("attack", 14)), int(h.get("defense", 2)),
			gs.battles_won, gs.deaths, inputs_cnt
		]
		var inv_names: Array[String] = []
		for it in gs.inventory:
			if it is Dictionary:
				inv_names.append(str(it.get("name", "")))
		var sp_names: Array = h.get("spells", [])
		var sp_str := ", ".join(sp_names) if not sp_names.is_empty() else "—"
		var pack_str := ", ".join(inv_names) if not inv_names.is_empty() else "(empty)"
		_row_items.text = "Wpn: %s   Arm: %s   Spells: %s   Pack: %s" % [
			str(h.get("weapon", "Short Sword")),
			str(h.get("armor", "Cloth")),
			sp_str,
			pack_str
		]
