extends Node2D
## SaveSelect — lets the player choose an existing game-state file to resume,
## or begin a brand-new quest. Real saves are scanned from user://saves/*.json
## (the intended location for a future in-game "save" feature). If none are
## found there yet, it falls back to the milestone save-state fixtures already
## on disk at res://data/v1/save-states/*.json so the picker is
## demonstrably useful today. Each file uses the same schema consumed by
## GameState.load_state_dict() / the --save-state-file debug.sh flag.

const VW := 512
const VH := 480
const USER_SAVES_DIR := "user://saves"
const FALLBACK_SAVES_DIR := "res://data/v1/save-states"
const FALLBACK_PREFIX := "level-"   # skip stair-*.json transition fixtures — not real "saves"
const VISIBLE_ROWS := 8
const ROW_H := 40
const MUSIC_PATH := "res://assets/music/mp3/overture.mp3"

var _entries: Array = []       # [{ "new_game": true }] or { "name", "description", "data" }
var _index := 0
var _scroll := 0
var _music: AudioStreamPlayer
var _list_panel: Panel
var _row_labels: Array = []
var _hint_label: Label


func _ready() -> void:
	_entries = _scan_saves()
	_entries.push_front({"new_game": true, "name": "BEGIN A NEW QUEST", "description": "Start thy journey anew from Tantegel Castle."})
	_build_background()
	_build_ui()
	_refresh_list()
	_start_music()


# ── Save discovery ───────────────────────────────────────────────────────────
func _scan_saves() -> Array:
	var results: Array = []
	_scan_dir(USER_SAVES_DIR, results)
	if results.is_empty():
		_scan_dir(FALLBACK_SAVES_DIR, results, FALLBACK_PREFIX)
	results.sort_custom(func(a, b): return String(a["file"]) < String(b["file"]))
	return results


func _scan_dir(dir_path: String, out: Array, prefix_filter: String = "") -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var fname := dir.get_next()
	while fname != "":
		if not dir.current_is_dir() and fname.ends_with(".json"):
			if prefix_filter == "" or fname.begins_with(prefix_filter):
				var full := dir_path.path_join(fname)
				var f := FileAccess.open(full, FileAccess.READ)
				if f:
					var parsed: Variant = JSON.parse_string(f.get_as_text())
					if typeof(parsed) == TYPE_DICTIONARY:
						out.append({
							"file": fname,
							"path": full,
							"new_game": false,
							"name": str(parsed.get("name", fname)),
							"description": str(parsed.get("description", "")),
							"data": parsed,
						})
		fname = dir.get_next()
	dir.list_dir_end()


# ── UI ────────────────────────────────────────────────────────────────────────
func _build_background() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.02, 0.03, 0.1)
	bg.size = Vector2(VW, VH)
	add_child(bg)

	var title := _make_label("WHICH ADVENTURE LOG DOST\nTHOU WISH TO CONTINUE?", 16, Color(1.0, 0.85, 0.3))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.size = Vector2(VW, 40)
	title.position = Vector2(0, 24)
	add_child(title)


func _build_ui() -> void:
	var pw := VW - 64
	var ph := VISIBLE_ROWS * ROW_H + 16
	_list_panel = Panel.new()
	_list_panel.size = Vector2(pw, ph)
	_list_panel.position = Vector2((VW - pw) / 2.0, 84)
	_list_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	add_child(_list_panel)

	_row_labels.clear()
	for i in range(VISIBLE_ROWS):
		var lbl := _make_label("", 13)
		lbl.position = Vector2(16, 8 + i * ROW_H)
		lbl.size = Vector2(pw - 32, ROW_H)
		_list_panel.add_child(lbl)
		_row_labels.append(lbl)

	_hint_label = _make_label("\u25B2\u25BC MOVE   ENTER SELECT", 12, Color(0.7, 0.9, 1.0))
	_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint_label.size = Vector2(VW, 20)
	_hint_label.position = Vector2(0, VH - 32)
	add_child(_hint_label)


func _make_box_style(bg: Color, border: Color, radius: int = 4) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.border_width_left = 2
	s.border_width_right = 2
	s.border_width_top = 2
	s.border_width_bottom = 2
	s.corner_radius_top_left = radius
	s.corner_radius_top_right = radius
	s.corner_radius_bottom_left = radius
	s.corner_radius_bottom_right = radius
	return s


func _make_label(txt: String, fsize: int = 14, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_size_override("font_size", fsize)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color.BLACK)
	l.add_theme_constant_override("shadow_offset_x", 1)
	l.add_theme_constant_override("shadow_offset_y", 1)
	return l


func _refresh_list() -> void:
	if _index < _scroll:
		_scroll = _index
	elif _index >= _scroll + VISIBLE_ROWS:
		_scroll = _index - VISIBLE_ROWS + 1

	for i in range(VISIBLE_ROWS):
		var entry_idx := _scroll + i
		var lbl: Label = _row_labels[i]
		if entry_idx >= _entries.size():
			lbl.text = ""
			continue
		var e: Dictionary = _entries[entry_idx]
		var cursor := "\u25B6 " if entry_idx == _index else "  "
		if e.get("new_game", false):
			lbl.text = "%s%s" % [cursor, e["name"]]
		else:
			var data: Dictionary = e.get("data", {})
			var level := int(data.get("heroLevel", 1))
			var gp := int(data.get("gold", 0))
			lbl.text = "%s%s\n   Lv.%d  %dG  %s" % [cursor, e["name"], level, gp, e["description"]]
		lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3) if entry_idx == _index else Color.WHITE)


func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	var bgm := load(MUSIC_PATH) as AudioStream
	if bgm:
		_music.stream = bgm
		if _music.stream is AudioStreamMP3:
			(_music.stream as AudioStreamMP3).loop = true
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()


# ── Input ────────────────────────────────────────────────────────────────────
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("move_up"):
		_index = maxi(_index - 1, 0)
		_refresh_list()
	elif event.is_action_pressed("move_down"):
		_index = mini(_index + 1, _entries.size() - 1)
		_refresh_list()
	elif event.is_action_pressed("ui_accept"):
		_confirm_selection()


func _confirm_selection() -> void:
	if _entries.is_empty():
		return
	var entry: Dictionary = _entries[_index]
	if _music:
		_music.stop()
	var gs := get_node_or_null("/root/GameState")
	if entry.get("new_game", false):
		if gs:
			gs.call("reset_to_new_game")
		get_tree().change_scene_to_file.call_deferred("res://scenes/ThroneRoom.tscn")
		return

	var data: Dictionary = entry.get("data", {})
	if gs:
		gs.call("load_state_dict", data)
	var scene_name := str(data.get("scene", "ThroneRoom"))
	var path := "res://scenes/%s.tscn" % scene_name
	get_tree().change_scene_to_file.call_deferred(path)
