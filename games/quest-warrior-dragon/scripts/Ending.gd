extends Node2D
## Ending — the NES epilogue. The hero (and Princess Gwaelin, if she came
## along) walk out of Tantegel's gate onto a peaceful Alefgard, the closing
## text box appears, the credits roll, and `GameState.game_completed` is set
## before returning to the title screen. Runs at real speed regardless of the
## playthrough time scale so the recorder captures it properly.

const VW := 512
const VH := 480
const TILE := 32                      # world map display tile (16px source x2)
const TANTEGEL := Vector2i(45, 45)    # castle entrance on dw1-over2.png
const WALK_TILES := 5
const STEP_TIME := 0.45
const DIALOG_MARGIN := 16
const DIALOG_H := 140
const TEXT_AUTO_ADVANCE := 8.0

const CLOSING_TEXT := "And thus the story ends.\nThe curtain falls on the\nstage of Alefgard.\nLong live the peace in\nour world!"

var _hero_ws: WalkSprite
var _gwaelin_ws: NPCSprite
var _with_gwaelin := false
var _music: AudioStreamPlayer

# Dialog fields named like the map scenes so the IPC state server (and the
# PlayGame brain) see the closing text as a normal dialog page.
var _dialog_panel: Panel
var _speaker_label: Label
var _dialog_label: Label
var _prompt_label: Label
var _dialog_active := false
var _dialog_pages: Array = []
var _current_page := 0
var _text_shown_at := 0.0
var _fade: ColorRect
var _credits_done := false


func _ready() -> void:
	Engine.time_scale = 1.0
	var gs := get_node_or_null("/root/GameState")
	_with_gwaelin = gs != null and "gwaelin_returned" in gs and bool(gs.gwaelin_returned)
	_build_map()
	_build_sprites()
	_build_dialog()
	_build_fade()
	_start_music()
	_run()


func _build_map() -> void:
	var tex := load("res://assets/maps/dw1-over2.png") as Texture2D
	if not tex:
		var bg := ColorRect.new()
		bg.color = Color(0.1, 0.5, 0.2)
		bg.size = Vector2(VW, VH)
		add_child(bg)
		return
	var sp := Sprite2D.new()
	sp.texture = tex
	sp.centered = false
	sp.scale = Vector2(2.0, 2.0)
	# Put the gate tile just below the top of the screen, centred.
	sp.position = Vector2(VW * 0.5 - TILE * 0.5 - TANTEGEL.x * TILE, 64 - TANTEGEL.y * TILE)
	add_child(sp)


func _tile_screen(col: int, row: int) -> Vector2:
	return Vector2(VW * 0.5 - TILE * 0.5 + (col - TANTEGEL.x) * TILE, 64 + (row - TANTEGEL.y) * TILE)


func _build_sprites() -> void:
	_hero_ws = WalkSprite.new()
	_hero_ws.texture = load("res://assets/sprites/rgba/characters-3.png") as Texture2D
	_hero_ws.frame0_rect = Rect2(0, 0, 16, 16)
	_hero_ws.frame1_rect = Rect2(20, 0, 16, 16)
	_hero_ws.pixel_scale = 2.0
	_hero_ws.playing = false
	_hero_ws.position = _tile_screen(TANTEGEL.x, TANTEGEL.y)
	add_child(_hero_ws)
	if _with_gwaelin:
		_gwaelin_ws = NPCSprite.new()
		_gwaelin_ws.character_id = "princess"
		_gwaelin_ws.facing = "down"
		_gwaelin_ws.pixel_scale = 2.0
		_gwaelin_ws.playing = false
		_gwaelin_ws.position = _tile_screen(TANTEGEL.x + 1, TANTEGEL.y)
		add_child(_gwaelin_ws)


func _make_box_style(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(3)
	sb.set_corner_radius_all(4)
	return sb


func _build_dialog() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 10
	add_child(canvas)
	_dialog_panel = Panel.new()
	_dialog_panel.name = "DialogBox"
	_dialog_panel.position = Vector2(DIALOG_MARGIN, VH - DIALOG_H - DIALOG_MARGIN)
	_dialog_panel.size = Vector2(VW - DIALOG_MARGIN * 2, DIALOG_H)
	_dialog_panel.visible = false
	_dialog_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.0, 0.0, 0.28, 0.95), Color(1.0, 0.85, 0.1)))
	canvas.add_child(_dialog_panel)
	_speaker_label = Label.new()
	_speaker_label.position = Vector2(12, 6)
	_speaker_label.size = Vector2(300, 22)
	_speaker_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.1))
	_speaker_label.add_theme_font_size_override("font_size", 15)
	_dialog_panel.add_child(_speaker_label)
	_dialog_label = Label.new()
	_dialog_label.position = Vector2(12, 10)
	_dialog_label.size = Vector2(VW - DIALOG_MARGIN * 2 - 24, DIALOG_H - 24)
	_dialog_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_label.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
	_dialog_label.add_theme_font_size_override("font_size", 14)
	_dialog_panel.add_child(_dialog_label)
	_prompt_label = Label.new()
	_prompt_label.text = "▼"
	_prompt_label.position = Vector2(VW - DIALOG_MARGIN * 2 - 32, DIALOG_H - 28)
	_prompt_label.add_theme_color_override("font_color", Color(1.0, 1.0, 0.3))
	_prompt_label.add_theme_font_size_override("font_size", 18)
	_dialog_panel.add_child(_prompt_label)


func _build_fade() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 15
	add_child(layer)
	_fade = ColorRect.new()
	_fade.color = Color.BLACK
	_fade.size = Vector2(VW, VH)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_fade)


func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	add_child(_music)
	var stream := load("res://assets/music/mp3/kingdom_of_alefgard.mp3") as AudioStream
	if stream:
		if stream is AudioStreamMP3:
			(stream as AudioStreamMP3).loop = true
		_music.stream = stream
		_music.volume_db = -6.0
		_music.play()


func _run() -> void:
	var tw := create_tween()
	tw.tween_property(_fade, "color", Color(0, 0, 0, 0), 1.2)
	await tw.finished
	await get_tree().create_timer(0.5).timeout
	# Step out of the gate onto the plains, then stroll west along the shore
	# (the tile south of the gate is the only land before the moat).
	await _walk(Vector2i(0, 1), 1)
	await _walk(Vector2i(-1, 0), WALK_TILES)
	if _gwaelin_ws:
		_gwaelin_ws.stop()
	await get_tree().create_timer(0.6).timeout
	_show_text(CLOSING_TEXT)
	_text_shown_at = Time.get_ticks_msec() / 1000.0
	while _dialog_active:
		await get_tree().process_frame
		if Time.get_ticks_msec() / 1000.0 - _text_shown_at > TEXT_AUTO_ADVANCE:
			_dialog_active = false
	_dialog_panel.visible = false
	var tw2 := create_tween()
	tw2.tween_property(_fade, "color", Color.BLACK, 1.5)
	await tw2.finished
	await _roll_credits()
	var gs := get_node_or_null("/root/GameState")
	if gs and "game_completed" in gs:
		gs.game_completed = true
		if gs.has_method("save_to_disk"):
			gs.save_to_disk("adventure_log.json")
	_credits_done = true
	await get_tree().create_timer(4.0).timeout
	get_tree().change_scene_to_file("res://scenes/TitleScreen.tscn")


func _set_frames_for(dir: Vector2i) -> void:
	var y := 0
	var fx := 0
	match dir:
		Vector2i(-1, 0): fx = 40
		Vector2i(0, -1): fx = 80
		Vector2i(1, 0):  fx = 120
	_hero_ws.set_frames(Rect2(fx, y, 16, 16), Rect2(fx + 20, y, 16, 16))
	if _gwaelin_ws:
		var names := {Vector2i(0, 1): "down", Vector2i(-1, 0): "left", Vector2i(0, -1): "up", Vector2i(1, 0): "right"}
		_gwaelin_ws.set_facing(names.get(dir, "down"))


func _walk(dir: Vector2i, tiles: int) -> void:
	_set_frames_for(dir)
	var delta := Vector2(dir.x * TILE, dir.y * TILE)
	for i in range(tiles):
		var hero_from := _hero_ws.position
		var hero_to := hero_from + delta
		var g_from := _gwaelin_ws.position if _gwaelin_ws else Vector2.ZERO
		var g_to := g_from + delta
		var t := 0.0
		while t < 1.0:
			await get_tree().process_frame
			t = minf(t + get_process_delta_time() / STEP_TIME, 1.0)
			_hero_ws.position = hero_from.lerp(hero_to, t)
			if _gwaelin_ws:
				_gwaelin_ws.position = g_from.lerp(g_to, t)
		_hero_ws.step()
		if _gwaelin_ws:
			_gwaelin_ws.play()


func _show_text(text: String) -> void:
	_dialog_pages = [text]
	_current_page = 0
	_speaker_label.text = ""
	_dialog_label.text = text
	_dialog_panel.visible = true
	_dialog_active = true


func _credit_lines() -> Array:
	var gs := get_node_or_null("/root/GameState")
	var hero := "Erdrick"
	var level := 0
	if gs:
		hero = str(gs.hero_stats.get("name", hero))
		level = int(gs.hero_stats.get("level", 0))
	var lines: Array = [
		"QUEST: WARRIOR DRAGON",
		"",
		"Thou hast completed thy quest.",
		"",
		"%s  -  Level %d" % [hero, level],
		"Descendant of Erdrick",
	]
	if _with_gwaelin:
		lines.append("Princess Gwaelin")
		lines.append("Daughter of King Lorik")
	lines += [
		"",
		"King Lorik of Tantegel",
		"The Dragonlord of Charlock",
		"The people of Alefgard",
		"",
		"RobOS 2D JRPG Engine",
		"100% open source and procedural assets",
		"",
		"Played by the RobOS AI Playthrough Engine",
		"",
		"THE END",
	]
	return lines


func _roll_credits() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	var box := VBoxContainer.new()
	box.size = Vector2(VW, 0)
	box.alignment = BoxContainer.ALIGNMENT_BEGIN
	box.add_theme_constant_override("separation", 10)
	for line in _credit_lines():
		var lbl := Label.new()
		lbl.text = str(line)
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.custom_minimum_size = Vector2(VW, 22)
		lbl.add_theme_font_size_override("font_size", 18 if line in ["QUEST: WARRIOR DRAGON", "THE END"] else 14)
		lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.1) if line in ["QUEST: WARRIOR DRAGON", "THE END"] else Color.WHITE)
		box.add_child(lbl)
	layer.add_child(box)
	await get_tree().process_frame
	var total_h := box.get_combined_minimum_size().y
	box.position = Vector2(0, VH)
	var end_y := VH * 0.5 - total_h + 40.0   # stop with THE END centred on screen
	var tw := create_tween()
	tw.tween_property(box, "position", Vector2(0, end_y), 22.0)
	await tw.finished


func _input(event: InputEvent) -> void:
	if _dialog_active and (event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel")):
		_dialog_active = false
		get_viewport().set_input_as_handled()
