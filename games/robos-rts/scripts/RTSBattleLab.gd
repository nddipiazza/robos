extends CanvasLayer

# Arena controls sit above the battlefield; the ordinary HUD still controls blue.
var panel: PanelContainer
var score: Label
var hint: Label
var fight: Button
var pause_button: Button
var results: CanvasLayer
var results_button: Button
var results_shown := false

func _ready() -> void:
	layer = 5
	panel = PanelContainer.new()
	panel.position = Vector2(430, 18)
	panel.custom_minimum_size = Vector2(1060, 150)
	var style = StyleBoxFlat.new()
	style.bg_color = Color("#101a26", 0.96)
	style.border_color = Color("#526c85")
	style.set_border_width_all(1)
	style.set_content_margin_all(14)
	style.set_corner_radius_all(5)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	panel.add_child(box)
	score = Label.new()
	score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	score.add_theme_font_size_override("font_size", 27)
	box.add_child(score)
	hint = Label.new()
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(hint)
	var row = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 16)
	box.add_child(row)
	fight = _button(row, "Fight  [Enter]", func(): SimEngine.start_unit_battle())
	pause_button = _button(row, "Pause  [P]", _pause)
	_button(row, "Reset  [F9]", func(): SimEngine.reset_unit_battle())
	_button(row, "Frame armies", _frame_armies)
	results = preload("res://scripts/RTSBattleResults.gd").new()
	add_child(results)
	results_button = _button(row, "Results  [R]", func(): results.reopen())
	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	_on_scenario_loaded("")

func _button(row: HBoxContainer, text: String, action: Callable) -> Button:
	var button = Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(185, 36)
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(action)
	row.add_child(button)
	return button

func _on_scenario_loaded(_label: String) -> void:
	results_shown = false
	if results:
		results.dismiss()
		results.report = {}
	panel.visible = SimEngine.match_state.get("mode", "") == "unit_battle"
	if panel.visible:
		call_deferred("_frame_armies")

func _frame_armies() -> void:
	var main = get_parent()
	if main.world_3d:
		main.world_3d.set_focus(Vector2(SimEngine.map_width * 0.5, SimEngine.map_height * 0.5 + 5.0), 48.0)
	var tags: Array[int] = []
	for u in SimEngine.units.values():
		if u.owner == 1:
			tags.append(u.tag)
	main._select_tags(tags)

func _pause() -> void:
	if SimEngine.match_state.get("status", "") == "playing":
		SimEngine.paused = not SimEngine.paused
		SimEngine._accum_time = 0.0

func _unhandled_input(event: InputEvent) -> void:
	if not panel.visible or not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.alt_pressed or event.ctrl_pressed or event.meta_pressed:
		return
	match event.keycode:
		KEY_ENTER, KEY_KP_ENTER:
			if get_parent().world_3d.rifle_fx.warmup_complete:
				SimEngine.start_unit_battle()
		KEY_F9:
			SimEngine.reset_unit_battle()
		KEY_P:
			_pause()
		KEY_R:
			results.reopen()
		_:
			return
	get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	if not panel.visible:
		return
	var counts = {1: 0, 2: 0}
	for u in SimEngine.units.values():
		if counts.has(u.owner):
			counts[u.owner] += 1
	score.text = "BATTLE LAB     BLUE  %d    —    %d  RED     |     %.1f s" % [counts[1], counts[2], SimEngine.sim_time]
	var status = SimEngine.match_state.get("status", "")
	results_button.disabled = status != "finished"
	if status == "finished" and not results_shown:
		results_shown = true
		results.show_report(SimEngine.match_state.results)
	var warm = get_parent().world_3d.rifle_fx.warmup_complete
	fight.disabled = status != "ready" or not warm
	pause_button.disabled = status != "playing"
	pause_button.text = ("Resume" if SimEngine.paused else "Pause") + "  [P]"
	if status == "ready":
		hint.text = "10 Riflemen vs 10 Riflemen · Equal health, no upgrades · Press Fight to engage" if warm else "Preparing battlefield…"
	elif status == "finished":
		var winner = int(SimEngine.match_state.winner)
		hint.text = ("DRAW" if winner == 0 else ("BLUE WINS" if winner == 1 else "RED WINS")) + " · Army eliminated · F9 resets both squads"
	else:
		hint.text = ("PAUSED · " if SimEngine.paused else "") + "Watch, or command blue: right-click move/attack · A + click attack-move · F9 reset"
