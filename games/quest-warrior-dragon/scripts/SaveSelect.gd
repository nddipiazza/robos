extends Node2D
## SaveSelect — the Adventure Log. Lists every way to start playing:
##   • BEGIN A NEW QUEST
##   • the logs King Lorik recorded (user://saves/*.json, newest first)
##   • the chapter presets bundled with the game (res://data/v1/save-states/level-*.json)
## The highlighted entry's hero, location, equipment and quest progress are shown in a
## card beside the list. Both save spellings (camelCase logs and snake_case presets) are
## read through GameState.normalize_save_keys, the same path the game uses to load them.

const VW := 512
const VH := 480
const USER_SAVES_DIR := "user://saves"
const PRESET_DIR := "res://data/v1/save-states"
const PRESET_PREFIX := "level-"   # skip stair-*.json transition fixtures — not real "saves"
const MUSIC_PATH := "res://assets/music/mp3/overture.mp3"

const LIST_X := 16
const LIST_W := 212
const CARD_X := 236
const CARD_W := 260
const TOP := 72

var _entries: Array = []   # rows for MenuKit.render_list; selectable rows carry "kind" and "data"
var _index := 0
var _scroll := 0
var _music: AudioStreamPlayer
var _list_panel: Panel
var _card_panel: Panel


func _ready() -> void:
	_entries = _build_entries()
	_index = MenuKit.step_index(_entries, -1, 1)
	_build_ui()
	_refresh()
	_start_music()


# ── Save discovery ───────────────────────────────────────────────────────────
func _build_entries() -> Array:
	var rows: Array = [{"text": "BEGIN A NEW QUEST", "kind": "new", "data": {}}]
	var logs := _scan_dir(USER_SAVES_DIR, "")
	logs.sort_custom(func(a, b): return int(a["mtime"]) > int(b["mtime"]))
	if not logs.is_empty():
		rows.append({"text": "ADVENTURE LOGS", "header": true})
		for e in logs:
			rows.append(e)
	var presets := _scan_dir(PRESET_DIR, PRESET_PREFIX)
	presets.sort_custom(func(a, b): return String(a["file"]) < String(b["file"]))
	if not presets.is_empty():
		rows.append({"text": "CHAPTER PRESETS", "header": true})
		for e in presets:
			rows.append(e)
	return rows


func _scan_dir(dir_path: String, prefix_filter: String) -> Array:
	var out: Array = []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return out
	dir.list_dir_begin()
	var fname := dir.get_next()
	while fname != "":
		if not dir.current_is_dir() and fname.ends_with(".json") and (prefix_filter == "" or fname.begins_with(prefix_filter)):
			var full := dir_path.path_join(fname)
			var f := FileAccess.open(full, FileAccess.READ)
			if f:
				var parsed: Variant = JSON.parse_string(f.get_as_text())
				if parsed is Dictionary:
					var data: Dictionary = GameState.normalize_save_keys(parsed)
					var is_log := dir_path == USER_SAVES_DIR
					out.append({
						"text": _entry_title(data, fname, is_log),
						"value": "Lv %d" % int(data.get("heroLevel", 1)),
						"kind": "log" if is_log else "preset",
						"file": fname,
						"path": full,
						"mtime": FileAccess.get_modified_time(full),
						"data": data,
					})
		fname = dir.get_next()
	dir.list_dir_end()
	return out


func _entry_title(data: Dictionary, fname: String, is_log: bool) -> String:
	if is_log:
		return str(data.get("heroName", "ERDRICK")).to_upper()
	# Presets are named "Level 10 - Rimuldar": the level is already in the value column.
	var nm := str(data.get("name", fname.get_basename()))
	var dash := nm.find(" - ")
	return nm.substr(dash + 3) if dash >= 0 else nm


# ── UI ────────────────────────────────────────────────────────────────────────
func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.02, 0.03, 0.1)
	bg.size = Vector2(VW, VH)
	add_child(bg)

	var game := MenuKit.label("QUEST: WARRIOR DRAGON", 12, MenuKit.DESC)
	game.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	game.size = Vector2(VW, 18)
	game.position = Vector2(0, 14)
	add_child(game)

	var title := MenuKit.label("ADVENTURE LOG", 20, MenuKit.TITLE)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.size = Vector2(VW, 28)
	title.position = Vector2(0, 32)
	add_child(title)

	_list_panel = Panel.new()
	MenuKit.skin(_list_panel)
	_list_panel.position = Vector2(LIST_X, TOP)
	add_child(_list_panel)

	_card_panel = Panel.new()
	MenuKit.skin(_card_panel)
	_card_panel.position = Vector2(CARD_X, TOP)
	add_child(_card_panel)

	var hint := MenuKit.label("▲▼ CHOOSE     ENTER BEGIN", 12, MenuKit.DESC)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.size = Vector2(VW, 20)
	hint.position = Vector2(0, VH - 30)
	add_child(hint)


func _refresh() -> void:
	_scroll = MenuKit.render_list(_list_panel, {"rows": _entries, "index": _index, "width": LIST_W,
		"max_rows": 18, "scroll": _scroll})
	_refresh_card()


func _refresh_card() -> void:
	var e: Dictionary = _entries[_index] if _index >= 0 and _index < _entries.size() else {}
	if str(e.get("kind", "")) == "new":
		MenuKit.render_table(_card_panel, "A NEW QUEST", [
			["HERO", "ERDRICK"], ["LEVEL", "1"], ["HP", "15 / 15"], ["GOLD", "0"], ["START", "Tantegel Castle"],
		], CARD_W, "King Lorik awaits thee.")
		return
	var d: Dictionary = e.get("data", {})
	var rows: Array = [
		["HERO", str(d.get("heroName", "ERDRICK")).to_upper()],
		["LEVEL", str(int(d.get("heroLevel", 1)))],
		["HP", "%d / %d" % [int(d.get("heroHp", 0)), int(d.get("heroHpMax", 0))]],
		["MP", "%d / %d" % [int(d.get("heroMp", 0)), int(d.get("heroMpMax", 0))]],
		["GOLD", str(int(d.get("gold", 0)))],
		["EXP", str(int(d.get("heroExp", 0)))],
		["WHERE", _place_name(str(d.get("scene", "ThroneRoom")))],
		["WEAPON", _gear_name(str(d.get("heroWeapon", "")))],
		["ARMOR", _gear_name(str(d.get("heroArmor", "")))],
		["SHIELD", _gear_name(str(d.get("heroShield", "")))],
		["SPELLS", str((d.get("heroSpells", []) as Array).size()) if d.get("heroSpells", []) is Array else "0"],
		["QUEST", _quest_progress(d)],
	]
	var footer := ""
	if str(e.get("kind", "")) == "log":
		footer = "Recorded " + Time.get_datetime_string_from_unix_time(int(e.get("mtime", 0)), true)
	else:
		footer = str(d.get("description", ""))
	MenuKit.render_table(_card_panel, str(e.get("text", "")).to_upper(), rows, CARD_W, "")
	if footer != "":
		# Wrapped note under the table (descriptions are long sentences).
		var inner := CARD_W - MenuKit.PAD * 2
		var y := _card_panel.size.y - MenuKit.PAD + 4
		var fh := minf(MenuKit.text_height(footer, inner, 11), 44.0)
		var fl := MenuKit.wrapped(footer, 11, MenuKit.DIM, Vector2(inner, fh))
		fl.position = Vector2(MenuKit.PAD, y)
		_card_panel.add_child(fl)
		_card_panel.size.y = y + fh + MenuKit.PAD - 2


func _gear_name(id: String) -> String:
	if id == "":
		return "—"
	var gs := get_node_or_null("/root/GameState")
	if gs and gs.has_method("equipment_info"):
		var info: Dictionary = gs.equipment_info(id)
		if info.has("name"):
			return str(info["name"])
	return id.replace("_", " ").capitalize()


func _place_name(scene: String) -> String:
	match scene:
		"ThroneRoom": return "Tantegel Throne Room"
		"Castle1F": return "Tantegel Castle"
		"TantegelBasement": return "Tantegel Basement"
		"WorldMap": return "Alefgard"
		"CharlockThroneRoom": return "Charlock Throne"
	var out := ""
	for i in range(scene.length()):
		var ch := scene[i]
		if i > 0 and ch == ch.to_upper() and ch != ch.to_lower() and scene[i - 1] == scene[i - 1].to_lower():
			out += " "
		out += ch
	return out


func _quest_progress(d: Dictionary) -> String:
	if bool(d.get("dragonlordDefeated", false)):
		return "Dragonlord slain"
	if bool(d.get("bridgeBuilt", false)):
		return "Rainbow Bridge"
	if bool(d.get("golemDefeated", false)):
		return "Golem defeated"
	if bool(d.get("gwaelinReturned", false)):
		return "Gwaelin home"
	if bool(d.get("gwaelinRescued", false)):
		return "Gwaelin rescued"
	return "Just begun"


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
	if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up"):
		_index = MenuKit.step_index(_entries, _index, -1)
		_refresh()
	elif event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
		_index = MenuKit.step_index(_entries, _index, 1)
		_refresh()
	elif event.is_action_pressed("ui_accept"):
		_confirm_selection()


func _confirm_selection() -> void:
	if _index < 0 or _index >= _entries.size():
		return
	var entry: Dictionary = _entries[_index]
	if bool(entry.get("header", false)):
		return
	if _music:
		_music.stop()
	var gs := get_node_or_null("/root/GameState")
	if str(entry.get("kind", "")) == "new":
		if gs:
			gs.call("reset_to_new_game")
		get_tree().change_scene_to_file.call_deferred("res://scenes/ThroneRoom.tscn")
		return
	var data: Dictionary = entry.get("data", {})
	if gs:
		gs.call("reset_to_new_game")
		gs.call("load_state_dict", data)
	var scene_name := str(data.get("scene", "ThroneRoom"))
	get_tree().change_scene_to_file.call_deferred("res://scenes/%s.tscn" % scene_name)
