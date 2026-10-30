extends CanvasLayer

var panel: PanelContainer
var difficulty: OptionButton
var strategy: OptionButton
var speed: OptionButton
var mouse_scroll: HSlider
var volume: OptionButton
var was_paused: bool = false

func _ready() -> void:
	layer = 10
	panel = PanelContainer.new()
	panel.position = Vector2(670, 180)
	panel.custom_minimum_size = Vector2(580, 500)
	var style = StyleBoxFlat.new()
	style.bg_color = Color("#111b27")
	style.border_color = Color("#426578")
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var margin = MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	panel.add_child(margin)
	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 18)
	margin.add_child(box)
	var title = Label.new()
	title.text = "FRONTIER HUNTERS"
	title.add_theme_font_size_override("font_size", 32)
	box.add_child(title)
	var description = Label.new()
	description.text = "1 Player vs 1 AI · Meridian Guard\n256 × 256 · Unlimited resources · Eight start sites\n12 workers per side · Destroy all enemy structures."
	box.add_child(description)
	difficulty = _option(box, "AI difficulty", ["Easy", "Normal", "Hard"], 1)
	strategy = _option(box, "AI strategy", ["Rush", "Balanced", "Economy", "Siege"], 1)
	speed = _option(box, "Game speed", ["1×", "2×", "4×", "8×"], 0)
	var mouse_row = HBoxContainer.new()
	var mouse_label = Label.new()
	mouse_label.text = "Mouse scroll speed"
	mouse_label.custom_minimum_size.x = 210
	mouse_row.add_child(mouse_label)
	mouse_scroll = HSlider.new()
	mouse_scroll.min_value = 0
	mouse_scroll.max_value = 100
	mouse_scroll.step = 5
	mouse_scroll.value = get_parent().mouse_scroll_speed
	mouse_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_scroll.tooltip_text = "Camera speed at the screen edges. 0 disables mouse scrolling. Arrow key speed stays unchanged."
	mouse_row.add_child(mouse_scroll)
	var mouse_value = Label.new()
	mouse_value.custom_minimum_size.x = 50
	mouse_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	mouse_value.text = "%d%%" % mouse_scroll.value if mouse_scroll.value > 0 else "Off"
	mouse_row.add_child(mouse_value)
	mouse_scroll.value_changed.connect(func(value):
		get_parent().set_mouse_scroll_speed(value)
		mouse_value.text = "%d%%" % value if value > 0 else "Off")
	box.add_child(mouse_row)
	volume = _option(box, "Sound volume · F11 mute", ["100%", "70%", "40%", "Muted"], 0)
	volume.item_selected.connect(func(index):
		RTSAudio.set_volume_percent([100, 70, 40, 0][index])
		RTSAudio.play_ui("ui_select"))
	var start = Button.new()
	start.text = "Start new match"
	start.pressed.connect(_start)
	box.add_child(start)
	var mission = Button.new()
	mission.text = "Campaign: First Strike · Build a 40-supply army"
	mission.pressed.connect(func():
		SimEngine.load_scenario_file("campaign-first-strike")
		panel.hide())
	box.add_child(mission)
	var battle = Button.new()
	battle.text = "Battle Lab: 10 Riflemen vs 10 Riflemen"
	battle.pressed.connect(func():
		SimEngine.load_scenario_file("riflemen-vs-riflemen")
		panel.hide())
	box.add_child(battle)
	var resume = Button.new()
	resume.text = "Resume (F8)"
	resume.pressed.connect(toggle)
	box.add_child(resume)
	var surrender_button = Button.new()
	surrender_button.text = "Surrender"
	surrender_button.pressed.connect(func():
		SimEngine.surrender(1)
		panel.hide()
		SimEngine.paused = false)
	box.add_child(surrender_button)
	var editor_button = Button.new()
	editor_button.text = "Map editor"
	editor_button.pressed.connect(func(): get_tree().change_scene_to_file("res://scenes/MapEditor.tscn"))
	box.add_child(editor_button)
	panel.hide()
	var explicit_scenario = false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--scenario="):
			explicit_scenario = true
	if not explicit_scenario and SimEngine.rts_mode != "backend" and not SimEngine.editor_session.has("doc"):
		call_deferred("toggle")

func _option(box: VBoxContainer, label_text: String, choices: Array, selected: int) -> OptionButton:
	var row = HBoxContainer.new()
	var label = Label.new()
	label.text = label_text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var option = OptionButton.new()
	option.custom_minimum_size.x = 210
	for choice in choices:
		option.add_item(choice)
	option.selected = selected
	row.add_child(option)
	box.add_child(row)
	return option

func toggle() -> void:
	if panel.visible:
		panel.hide()
		SimEngine.sim_speed = float(1 << speed.selected)
		SimEngine.paused = was_paused
	else:
		was_paused = SimEngine.paused
		SimEngine.paused = true
		volume.selected = 3 if RTSAudio.muted else ([100, 70, 40].find(RTSAudio.volume_percent))
		panel.show()

func _start() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/frontier-hunters.jsonld"))
	data["difficulty"] = ["easy", "normal", "hard"][difficulty.selected]
	data["strategy"] = ["rush", "balanced", "economy", "siege"][strategy.selected]
	SimEngine.load_scenario_dict(data)
	SimEngine.sim_speed = float(1 << speed.selected)
	panel.hide()
	SimEngine.paused = false
