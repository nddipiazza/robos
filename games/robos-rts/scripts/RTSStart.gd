extends Control

const BATTLE_SCENE := "res://scenes/RTSMain.tscn"
const EDITOR_SCENE := "res://scenes/MapEditor.tscn"
const BACKDROP := "res://assets/ui/starfall-orbit.webp"
const MatchMenu = preload("res://scripts/RTSMatchMenu.gd")
const GameInput = preload("res://scripts/RTSGameInput.gd")
const SCENARIOS := [
	["starfall-canyon", "Starfall Canyon", "Three-faction showcase"],
	["colony-macro-economy", "Colony Economy", "Gather, build, and train an army"],
	["stutter-step-micro", "Rifleman Maneuvers", "Practice movement between volleys"],
	["howitzer-canyon-defense", "Canyon Defense", "Hold a choke with Howitzers"],
	["phase-step-spire-walker-vs-monsters", "Aurelian Assault", "Practice Phase Step and cliff-walking"],
	["crowd-push-priority", "Choke Maneuvers", "Move mixed squads through tight ground"],
]

var _bypassing := false
var _leaving := false
var _page := "main"
var _home: Control
var _scenarios: Control
var _options: CanvasLayer
var _first_button: Button
var _back_focus: Button
var _menu_buttons: Dictionary = {}
var _scenario_buttons: Dictionary = {}
var _error: Label

func _ready() -> void:
	if not SimEngine.startup_complete and _direct_launch():
		_bypassing = true
		_change_scene(BATTLE_SCENE)
		return
	SimEngine.paused = true
	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	_build_background()
	var brand := _label(self, "ROBOS  /  REAL-TIME STRATEGY", 18, Color("#8bd5e0"))
	brand.position = Vector2(130, 104)
	var keys := _label(self, "↑ ↓  Navigate     Enter  Select     Esc  Back", 17, Color("#a4b5c6"))
	keys.position = Vector2(130, 972)
	_build_main_page()
	_build_scenario_page()
	_first_button.grab_focus()

func waiting_on_title() -> bool:
	return not _bypassing

func _direct_launch() -> bool:
	if DisplayServer.get_name() == "headless" or SimEngine.rts_mode == "backend":
		return true
	for arg in OS.get_cmdline_user_args():
		if arg == "--skip-title" or arg.begins_with("--scenario="):
			return true
	return false

func _build_background() -> void:
	var background := ColorRect.new()
	background.color = Color("#060d17")
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var picture := TextureRect.new()
	if ResourceLoader.exists(BACKDROP, "Texture2D"):
		picture.texture = load(BACKDROP)
	else:
		var art := Image.new()
		if art.load_webp_from_buffer(FileAccess.get_file_as_bytes(BACKDROP)) == OK:
			picture.texture = ImageTexture.create_from_image(art)
	picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(picture)
	picture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var shade := TextureRect.new()
	var gradient := Gradient.new()
	gradient.set_color(0, Color(0.01, 0.03, 0.05, 0.54))
	gradient.set_color(1, Color(0.01, 0.03, 0.05, 0.0))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_to = Vector2(0.57, 0.0)
	shade.texture = texture
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _build_main_page() -> void:
	_home = Control.new()
	add_child(_home)
	var headline := _label(_home, "STARFALL", 104, Color("#ecf5ff"))
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Bahnschrift", "DIN Alternate", "DejaVu Sans"])
	font.font_weight = 700
	headline.add_theme_font_override("font", font)
	headline.position = Vector2(124, 128)
	var subtitle := _label(_home, "C O M M A N D", 44, Color("#82d7e6"))
	subtitle.add_theme_font_override("font", font)
	subtitle.position = Vector2(130, 252)
	var rule := ColorRect.new()
	rule.position = Vector2(130, 333)
	rule.size = Vector2(510, 1)
	rule.color = Color("#3a6577")
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_home.add_child(rule)
	var buttons := _stack(_home, Vector2(130, 366), 510)
	if SimEngine.resume_from_title:
		_first_button = _add_menu_button(buttons, "resume", "Resume Match", "Paused battlefield", _resume)
	var skirmish := _add_menu_button(buttons, "skirmish", "Skirmish", "1 vs. AI", func(): _open_options(MatchMenu.Layout.SKIRMISH, "skirmish"))
	if not _first_button:
		_first_button = skirmish
	_add_menu_button(buttons, "scenarios", "Scenarios", "Practice and showcases", _open_scenarios)
	_add_menu_button(buttons, "editor", "Map Editor", "Create a battlefield", func(): _change_scene(EDITOR_SCENE))
	var gap := Control.new()
	gap.custom_minimum_size.y = 10
	buttons.add_child(gap)
	_add_menu_button(buttons, "settings", "Settings", "Sound and display", func(): _open_options(MatchMenu.Layout.SETTINGS, "settings"))
	_add_menu_button(buttons, "quit", "Quit", "", func(): get_tree().quit())

func _build_scenario_page() -> void:
	_scenarios = Control.new()
	add_child(_scenarios)
	var title := _label(_scenarios, "Scenarios", 54, Color("#ecf5ff"))
	title.position = Vector2(126, 156)
	var buttons := _stack(_scenarios, Vector2(130, 255), 590)
	for entry in SCENARIOS:
		var slug: String = entry[0]
		_scenario_buttons[slug] = _menu_button(buttons, entry[1], entry[2], _play_scenario.bind(slug))
	_menu_button(buttons, "Back", "", _show_home)
	_error = _label(buttons, "", 18, Color("#ff948c"))
	_scenarios.hide()

func _stack(parent: Control, at: Vector2, width: float) -> VBoxContainer:
	var stack := VBoxContainer.new()
	stack.position = at
	stack.custom_minimum_size.x = width
	stack.add_theme_constant_override("separation", 10)
	parent.add_child(stack)
	return stack

func _label(parent: Control, title: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = title
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label

func _button_style(fill: Color, edge: Color, accent_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(1)
	style.border_width_left = accent_width
	style.content_margin_left = 22.0
	style.content_margin_right = 22.0
	return style

func _add_menu_button(parent: VBoxContainer, id: String, title: String, detail: String, callback: Callable) -> Button:
	var button := _menu_button(parent, title, detail, callback)
	_menu_buttons[id] = button
	return button

func _menu_button(parent: VBoxContainer, title: String, detail: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = title
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.custom_minimum_size.y = 64
	button.add_theme_font_size_override("font_size", 26)
	button.add_theme_color_override("font_color", Color("#e8f3fc"))
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_focus_color", Color.WHITE)
	button.add_theme_stylebox_override("normal", _button_style(Color(0.035, 0.075, 0.12, 0.87), Color("#294757"), 2))
	button.add_theme_stylebox_override("hover", _button_style(Color("#133143"), Color("#529cac"), 4))
	button.add_theme_stylebox_override("pressed", _button_style(Color("#1c4053"), Color("#8adce6"), 4))
	var focus := _button_style(Color.TRANSPARENT, Color("#83d7e5"), 4)
	focus.draw_center = false
	button.add_theme_stylebox_override("focus", focus)
	button.pressed.connect(callback)
	parent.add_child(button)
	if not detail.is_empty():
		var caption := _label(button, detail, 16, Color("#a4c4d4"))
		caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		caption.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		caption.offset_right = -22.0
	return button

func _open_scenarios() -> void:
	_back_focus = _menu_buttons.scenarios
	_page = "scenarios"
	_home.hide()
	_scenarios.show()
	_error.text = ""
	_scenario_buttons[SCENARIOS[0][0]].grab_focus()

func _open_options(layout: int, page: String) -> void:
	_back_focus = _menu_buttons[page]
	_page = page
	_home.hide()
	_options = MatchMenu.new()
	_options.layout = layout
	_options.back_requested.connect(_show_home)
	add_child(_options)
	_options.open_title_panel()

func _show_home() -> void:
	if _options:
		_options.panel.hide()
		_options.queue_free()
		_options = null
	_scenarios.hide()
	_page = "main"
	_home.show()
	if _back_focus:
		_back_focus.grab_focus()
	else:
		_first_button.grab_focus()

func _play_scenario(slug: String) -> void:
	if slug == "starfall-canyon":
		SimEngine.load_legacy_scenario()
		RTSCommanderAI.configure_from_scenario([])
		return
	var result := SimEngine.load_scenario_file(slug)
	if not result.ok:
		_error.text = result.error

func _on_scenario_loaded(_name: String) -> void:
	if SimEngine.editor_session.has("doc"):
		SimEngine.editor_session["menu_doc"] = SimEngine.editor_session["doc"]
		SimEngine.editor_session.erase("doc")
	_change_scene(BATTLE_SCENE)

func _resume() -> void:
	SimEngine.resume_from_title = false
	SimEngine.paused = false
	_change_scene(BATTLE_SCENE)

func _change_scene(path: String) -> void:
	if not _leaving:
		_leaving = true
		get_tree().call_deferred("change_scene_to_file", path)

func _unhandled_key_input(event: InputEvent) -> void:
	if event.pressed and event.keycode == KEY_ESCAPE and _page != "main":
		_show_home()
		get_viewport().set_input_as_handled()

func inject_input(request: Dictionary) -> void:
	var event := GameInput.from_request(request)
	if event:
		get_viewport().push_input(event)

func ui_state() -> Dictionary:
	return {"screen": "title", "page": _page, "resume_available": SimEngine.resume_from_title}

func apply_ui_state(_request: Dictionary) -> Dictionary:
	return ui_state()
