extends Node2D

const VW := 512
const VH := 480
const MENU_OPTIONS := ["NEW GAME", "CONTINUE"]

var _selected_index: int = 0
var _cursor_lbl: Label
var _option_labels: Array[Label] = []
var _advancing: bool = false
var _music: AudioStreamPlayer

const PROLOGUE_TEXT := (
	"The world is veiled in\n" +
	"darkness. The wind stops,\n" +
	"the sea is wild, and the\n" +
	"earth begins to rot.\n\n" +
	"The people wait, their\n" +
	"only hope, a prophecy....\n\n" +
	"'When the world is in\n" +
	"darkness Four Warriors\n" +
	"will come....'\n\n" +
	"After a long journey, four\n" +
	"young warriors arrive,\n" +
	"each holding an ORB."
)

func _ready() -> void:
	_build_ui()
	_start_music()

func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.0, 0.08, 0.48, 1.0)
	bg.size = Vector2(VW, VH)
	add_child(bg)

	var top_banner := NESWindow.make_panel(Vector2(24, 16), Vector2(VW - 48, 86), Color(0.02, 0.04, 0.20, 1.0))
	add_child(top_banner)

	var title_lbl := NESWindow.make_label("FANTASY: LIGHT WARRIORS", Vector2(0, 14), Vector2(VW - 48, 38), 24, NESWindow.NES_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	top_banner.add_child(title_lbl)

	var sub_lbl := NESWindow.make_label("8-BIT PARTY RPG (WIP)  •  FOUR LIGHT WARRIORS", Vector2(0, 54), Vector2(VW - 48, 22), 12, NESWindow.NES_DIM, HORIZONTAL_ALIGNMENT_CENTER)
	top_banner.add_child(sub_lbl)

	var story_panel := NESWindow.make_panel(Vector2(24, 114), Vector2(276, 292), NESWindow.NES_BLUE)
	add_child(story_panel)

	var story_lbl := NESWindow.make_label(PROLOGUE_TEXT, Vector2(16, 14), Vector2(244, 264), 13, NESWindow.NES_WHITE)
	story_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	story_panel.add_child(story_lbl)

	var menu_panel := NESWindow.make_panel(Vector2(312, 114), Vector2(176, 150), NESWindow.NES_DARK)
	add_child(menu_panel)

	var menu_hdr := NESWindow.make_label("SELECT MODE", Vector2(0, 14), Vector2(176, 22), 14, NESWindow.NES_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	menu_panel.add_child(menu_hdr)

	for i in range(MENU_OPTIONS.size()):
		var opt_lbl := NESWindow.make_label(MENU_OPTIONS[i], Vector2(44, 52 + i * 36), Vector2(120, 26), 15, NESWindow.NES_WHITE)
		menu_panel.add_child(opt_lbl)
		_option_labels.append(opt_lbl)

	_cursor_lbl = NESWindow.make_label("▶", Vector2(20, 52), Vector2(24, 26), 15, NESWindow.NES_GOLD)
	menu_panel.add_child(_cursor_lbl)

	var preview_panel := NESWindow.make_panel(Vector2(312, 276), Vector2(176, 130), NESWindow.NES_DARK)
	add_child(preview_panel)
	var prev_hdr := NESWindow.make_label("LIGHT WARRIORS", Vector2(0, 10), Vector2(176, 20), 12, NESWindow.NES_DIM, HORIZONTAL_ALIGNMENT_CENTER)
	preview_panel.add_child(prev_hdr)

	var slugs := ["fighter", "thief", "white_mage", "black_mage"]
	for i in range(4):
		var p := "res://assets/sprites/classes/%s_battle.png" % slugs[i]
		var abs_p := ProjectSettings.globalize_path(p)
		var tex: Texture2D = null
		if FileAccess.file_exists(abs_p):
			var im := Image.load_from_file(abs_p)
			if im != null:
				tex = ImageTexture.create_from_image(im)
		elif ResourceLoader.exists(p):
			tex = load(p)
		if tex != null:
			var tr := TextureRect.new()
			tr.texture = tex
			tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			tr.position = Vector2(16 + i * 38, 42)
			tr.size = Vector2(32, 48)
			preview_panel.add_child(tr)

	var prompt := NESWindow.make_label("PRESS ENTER / START TO BEGIN NEW GAME", Vector2(0, 428), Vector2(VW, 28), 14, NESWindow.NES_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	prompt.name = "PromptLabel"
	add_child(prompt)

	_update_cursor()

func _start_music() -> void:
	var path := "res://assets/music/1_-_the_prelude.mp3"
	if ResourceLoader.exists(path):
		_music = AudioStreamPlayer.new()
		_music.stream = load(path)
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()

func _update_cursor() -> void:
	if _cursor_lbl:
		_cursor_lbl.position.y = 52 + _selected_index * 36
	for i in range(_option_labels.size()):
		_option_labels[i].add_theme_color_override("font_color", NESWindow.NES_GOLD if i == _selected_index else NESWindow.NES_WHITE)

func _unhandled_input(event: InputEvent) -> void:
	if _advancing:
		return
	if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up") or event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
		_selected_index = 1 - _selected_index
		_update_cursor()
	elif event.is_action_pressed("ui_accept"):
		_start_selected_mode()

func _start_selected_mode() -> void:
	_advancing = true
	if _music:
		_music.stop()
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.reset_to_new_game()
	if _selected_index == 0:
		get_tree().change_scene_to_file.call_deferred("res://scenes/PartyCreate.tscn")
	else:
		if gs:
			gs.party_created = true
		get_tree().change_scene_to_file.call_deferred("res://scenes/Coneria.tscn")
