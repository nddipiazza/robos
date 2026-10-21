extends Node2D
## TitleScreen — the game's boot scene. Shows the boxed "QUEST: WARRIOR DRAGON" logo,
## plays the overture, and waits for any key/button press before moving on to
## the save-select screen (res://scenes/SaveSelect.tscn).

const VW := 512
const VH := 480
const TITLE_IMAGE := "res://assets/title-screen.png"
const MUSIC_PATH  := "res://assets/music/mp3/overture.mp3"
const NEXT_SCENE  := "res://scenes/SaveSelect.tscn"
const COPYRIGHT_TEXT := "ROBOS 2D JRPG ENGINE \u2022 100% OPEN SOURCE & PROCEDURAL ASSETS"

var _music: AudioStreamPlayer
var _prompt_label: Label
var _blink_t := 0.0
var _advancing := false


func _ready() -> void:
	_build_background()
	_build_ui()
	_start_music()


func _build_background() -> void:
	var bg := TextureRect.new()
	bg.name = "Background"
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	bg.size = Vector2(VW, VH)
	bg.position = Vector2.ZERO
	var tex := load(TITLE_IMAGE) as Texture2D
	if tex:
		bg.texture = tex
	add_child(bg)


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_prompt_label = Label.new()
	_prompt_label.name = "PromptLabel"
	_prompt_label.text = "PUSH START BUTTON"
	_prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_prompt_label.size = Vector2(300, 30)
	_prompt_label.position = Vector2((VW - 300) / 2, 380)
	_prompt_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2))
	layer.add_child(_prompt_label)

	var copy := Label.new()
	copy.name = "CopyrightLabel"
	copy.text = COPYRIGHT_TEXT
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	copy.size = Vector2(VW, 20)
	copy.position = Vector2(0, 440)
	copy.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	layer.add_child(copy)


func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	_music.name = "OverturePlayer"
	var bgm := load(MUSIC_PATH) as AudioStream
	if bgm:
		_music.stream = bgm
		if _music.stream is AudioStreamMP3:
			(_music.stream as AudioStreamMP3).loop = true
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()


func _process(delta: float) -> void:
	_blink_t += delta
	if _prompt_label:
		_prompt_label.visible = int(_blink_t * 2.0) % 2 == 0


func _unhandled_input(event: InputEvent) -> void:
	if _advancing:
		return
	var is_act: bool   = event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_select")
	var is_key: bool   = event is InputEventKey and event.pressed and not event.echo
	var is_joy: bool   = event is InputEventJoypadButton and event.pressed
	var is_mouse: bool = event is InputEventMouseButton and event.pressed
	if is_act or is_key or is_joy or is_mouse:
		_advancing = true
		if _music:
			_music.stop()
		get_tree().change_scene_to_file.call_deferred(NEXT_SCENE)
