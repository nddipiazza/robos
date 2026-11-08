extends CanvasLayer

signal observe_requested
signal health_mode_changed(mode: int)

const DISPLAY_PREFS := "user://rts-display.cfg"

var panel: PanelContainer
var result_panel: PanelContainer
var map_picker: OptionButton
var deposit_rules: OptionButton
var health_bars: OptionButton
var difficulty: OptionButton
var strategy: OptionButton
var speed: OptionButton
var volume: OptionButton
var was_paused: bool = false
var _score_title: Label
var _score_detail: Label
var _score_values: Dictionary = {}
var _rematch: Button
var _show_results: Button
var _map_description: Label

func _ready() -> void:
	layer = 10
	panel = _make_panel(Vector2(630, 145), Vector2(660, 640))
	var box := _panel_body(panel)
	var title = Label.new()
	title.text = "SKIRMISH"
	title.add_theme_font_size_override("font_size", 32)
	box.add_child(title)
	_map_description = _label(box, "")
	map_picker = _option(box, "Battlefield", SimEngine.SKIRMISH_MAPS.values(), 0)
	deposit_rules = _option(box, "Resource deposits", ["Unlimited", "Finite"], 0)
	map_picker.item_selected.connect(_on_map_selected)
	_on_map_selected(0)
	difficulty = _option(box, "AI difficulty", ["Easy", "Normal", "Hard"], 1)
	strategy = _option(box, "AI strategy", ["Rush", "Balanced", "Economy", "Siege"], 1)
	speed = _option(box, "Game speed", ["1×", "2×", "4×", "8×"], 0)
	volume = _option(box, "Sound volume", ["100%", "70%", "40%", "Muted"], 0)
	volume.item_selected.connect(_on_volume_selected)
	var display := ConfigFile.new()
	display.load(DISPLAY_PREFS)
	health_bars = _option(box, "Overhead health bars", ["Selected or damaged", "Always", "Off"], clampi(int(display.get_value("display", "health_bars", 0)), 0, 2))
	health_bars.item_selected.connect(_on_health_selected)
	var start = Button.new()
	start.text = "Start new match"
	start.pressed.connect(_start)
	box.add_child(start)
	var resume = Button.new()
	resume.text = "Resume (F8)"
	resume.pressed.connect(toggle)
	box.add_child(resume)
	_show_results = _button(box, "Match results", _open_result)
	_show_results.hide()
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
	_create_scorecard()
	SimEngine.match_finished.connect(_open_result)
	var explicit_scenario = false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--scenario="):
			explicit_scenario = true
	if not explicit_scenario and SimEngine.rts_mode != "backend" and not SimEngine.editor_session.has("doc"):
		call_deferred("toggle")

func _make_panel(position: Vector2, minimum_size: Vector2) -> PanelContainer:
	var container := PanelContainer.new()
	container.position = position
	container.custom_minimum_size = minimum_size
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#111b27")
	style.border_color = Color("#426578")
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	container.add_theme_stylebox_override("panel", style)
	add_child(container)
	container.hide()
	return container

func _panel_body(container: PanelContainer) -> VBoxContainer:
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	container.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 18)
	margin.add_child(box)
	return box

func _label(container: Container, value: String, font_size: int = 18) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	container.add_child(label)
	return label

func _button(container: Container, value: String, handler: Callable) -> Button:
	var button := Button.new()
	button.text = value
	button.pressed.connect(handler)
	container.add_child(button)
	return button

func _create_scorecard() -> void:
	result_panel = _make_panel(Vector2(600, 230), Vector2(720, 485))
	var box := _panel_body(result_panel)
	_score_title = _label(box, "", 36)
	_score_title.modulate = Color("#fbbf24")
	_score_detail = _label(box, "")
	var table := GridContainer.new()
	table.columns = 3
	table.add_theme_constant_override("v_separation", 9)
	table.add_theme_constant_override("h_separation", 24)
	box.add_child(table)
	_label(table, "Match totals").size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_label(table, "You").horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_label(table, "AI").horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var rows := {"crystal_collected": "Crystal collected", "aether_collected": "Aether collected",
		"units_trained": "Units trained", "units_lost": "Units lost", "structures_built": "Structures completed"}
	for key in rows:
		_label(table, rows[key]).modulate = Color("#a9bdd0")
		var values: Array[Label] = []
		for player in [1, 2]:
			var value := _label(table, "")
			value.custom_minimum_size.x = 100
			value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			values.append(value)
		_score_values[key] = values
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 12)
	box.add_child(actions)
	_rematch = _button(actions, "Rematch (Ctrl+Enter)", restart)
	_rematch.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_button(actions, "Match setup (F8)", toggle).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_button(actions, "Observe (O)", func(): observe_requested.emit()).size_flags_horizontal = Control.SIZE_EXPAND_FILL

func _open_result() -> void:
	var state: Dictionary = SimEngine.match_state
	if not state.has("scorecard"):
		return
	panel.hide()
	var outcome := "VICTORY" if state.winner == 1 else ("DRAW" if state.winner == 0 else "DEFEAT")
	_score_title.text = outcome
	var seconds := floori(state.finished_tick * SimEngine.TICK_DT)
	var reason := "Surrender" if state.reason == "surrender" else "Annihilation"
	_score_detail.text = "%s  ·  %d:%02d" % [reason, seconds / 60, seconds % 60]
	for stat in _score_values:
		for player in [1, 2]:
			_score_values[stat][player - 1].text = str(state.scorecard[str(player)][stat])
	_rematch.visible = state.mode == "1p_vs_ai"
	_show_results.show()
	result_panel.show()

func reset_views() -> void:
	panel.hide()
	result_panel.hide()
	_show_results.hide()
	var map_index := SimEngine.SKIRMISH_MAPS.keys().find(SimEngine.match_state.get("map_id", ""))
	if map_index >= 0:
		map_picker.select(map_index)
		_on_map_selected(map_index)
		deposit_rules.select(0 if SimEngine.unlimited_resources else 1)

func restart() -> void:
	SimEngine.rematch()

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

func _on_volume_selected(idx: int) -> void:
	var levels := [100, 70, 40, 0]
	if RTSAudio and idx >= 0 and idx < levels.size():
		RTSAudio.set_volume_percent(levels[idx])

func _on_map_selected(index: int) -> void:
	_map_description.text = "1 Player vs 1 AI · Meridian Guard\n"
	_map_description.text += "256 × 256 · Eight possible starts" if index == 0 else "128 × 96 · Two starts · Two river crossings"
	deposit_rules.select(0 if index == 0 else 1)

func _on_health_selected(mode: int) -> void:
	var display := ConfigFile.new()
	display.load(DISPLAY_PREFS)
	display.set_value("display", "health_bars", mode)
	display.save(DISPLAY_PREFS)
	health_mode_changed.emit(mode)

func toggle() -> void:
	result_panel.hide()
	if panel.visible:
		panel.hide()
		SimEngine.sim_speed = float(1 << speed.selected)
		_on_volume_selected(volume.selected)
		SimEngine.paused = was_paused
	else:
		was_paused = SimEngine.paused
		SimEngine.paused = true
		panel.show()
		map_picker.grab_focus()

func _start() -> void:
	var map_id: String = SimEngine.SKIRMISH_MAPS.keys()[map_picker.selected]
	var settings := {"difficulty": ["easy", "normal", "hard"][difficulty.selected],
		"strategy": ["rush", "balanced", "economy", "siege"][strategy.selected],
		"unlimited_resources": deposit_rules.selected == 0}
	if not SimEngine.start_skirmish(map_id, settings).ok:
		return
	SimEngine.sim_speed = float(1 << speed.selected)
	_on_volume_selected(volume.selected)
	panel.hide()
	SimEngine.paused = false
