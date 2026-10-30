extends CanvasLayer

var briefing: PanelContainer
var objectives: PanelContainer
var status_label: Label
var objective_toggle: Button
var objective_details: VBoxContainer
var objectives_collapsed := false
var results: CanvasLayer
var results_shown := false
var update_time := 0.0

func _ready() -> void:
	layer = 5
	briefing = _panel(Vector2(510, 240), Vector2(900, 0))
	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 20)
	briefing.add_child(box)
	_label(box, "FIRST STRIKE", 38)
	_label(box, "Mission 01 · Canyon Stronghold", 23)
	_label(box, "Build your base, clear two sentry posts, then break through\nthe winding canyon to the Gnarl Brood stronghold.", 21)
	_label(box, "1. Your 12 Pioneers are already gathering crystal.\n2. Build Provision Silos and Muster Halls with a Pioneer.\n3. Assemble about 40 Riflemen (40 army supply).\n4. Follow the passes south, north, then south; clear every enemy.", 22)
	_label(box, "40 Riflemen + 12 workers = 52 total supply; aim for 55 capacity.\nBuild an Aether Tap on the vent northeast of your base for gas units.\nThe defenders hold their posts. There is no time limit.\nA + click attacks · F1 controls · F8 menu · P pause · F9 restart", 18)
	_button(box, "Begin mission  [Enter]", func(): SimEngine.start_campaign())
	objectives = _panel(Vector2(28, 72), Vector2(620, 0))
	var live = VBoxContainer.new()
	live.add_theme_constant_override("separation", 6)
	objectives.add_child(live)
	objective_toggle = Button.new()
	objective_toggle.focus_mode = Control.FOCUS_NONE
	objective_toggle.alignment = HORIZONTAL_ALIGNMENT_LEFT
	objective_toggle.pressed.connect(func():
		objectives_collapsed = not objectives_collapsed
		_refresh())
	live.add_child(objective_toggle)
	objective_details = VBoxContainer.new()
	objective_details.add_theme_constant_override("separation", 6)
	live.add_child(objective_details)
	status_label = _label(objective_details, "", 18)
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	objective_details.add_child(row)
	_button(row, "Select Riflemen", _select_army)
	_button(row, "Enemy base", _show_enemy)
	_button(row, "Results [R]", func(): results.reopen())
	results = preload("res://scripts/RTSBattleResults.gd").new()
	add_child(results)
	SimEngine.scenario_loaded.connect(_loaded)
	_loaded("")

func _panel(pos: Vector2, minimum: Vector2) -> PanelContainer:
	var p = PanelContainer.new()
	p.position = pos
	p.custom_minimum_size = minimum
	var style = StyleBoxFlat.new()
	style.bg_color = Color("#111d2c", 0.97)
	style.border_color = Color("#52758f")
	style.set_border_width_all(1)
	style.set_content_margin_all(20)
	style.set_corner_radius_all(6)
	p.add_theme_stylebox_override("panel", style)
	add_child(p)
	return p

func _label(parent: Node, text: String, font_size: int) -> Label:
	var label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)
	return label

func _button(parent: Node, text: String, action: Callable) -> void:
	var b = Button.new()
	b.text = text
	b.custom_minimum_size.y = 36
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(action)
	parent.add_child(b)

func _loaded(_name: String) -> void:
	results_shown = false
	results.dismiss()
	results.report = {}
	update_time = 0.0
	_refresh()

func _select_army() -> void:
	var tags: Array[int] = []
	for u in SimEngine.units.values():
		if u.owner == 1 and u.unit_type == "rifleman":
			tags.append(u.tag)
	get_parent()._select_tags(tags)

func _show_enemy() -> void:
	get_parent().world_3d.set_focus(Vector2(128, 56), 48.0)

func _unhandled_input(event: InputEvent) -> void:
	if SimEngine.match_state.get("mode", "") != "campaign" or not event is InputEventKey or not event.pressed or event.echo:
		return
	if get_parent().match_menu.panel.visible:
		return
	if event.alt_pressed or event.ctrl_pressed or event.meta_pressed:
		return
	match event.keycode:
		KEY_ENTER, KEY_KP_ENTER: SimEngine.start_campaign()
		KEY_F9: SimEngine.restart_campaign()
		KEY_P:
			if SimEngine.match_state.status == "playing":
				SimEngine.paused = not SimEngine.paused
		KEY_R:
			# R remains a building/ability hotkey throughout ordinary play.
			if SimEngine.match_state.status != "finished":
				return
			results.reopen()
		_: return
	get_viewport().set_input_as_handled()

func _process(delta: float) -> void:
	update_time -= delta
	if update_time <= 0:
		update_time = 0.2
		_refresh()

func _refresh() -> void:
	var active = SimEngine.match_state.get("mode", "") == "campaign"
	briefing.visible = active and SimEngine.match_state.get("status", "") == "briefing"
	objectives.visible = active and not briefing.visible
	objective_details.visible = not objectives_collapsed
	objective_toggle.text = "Show objectives  [+]" if objectives_collapsed else "Hide objectives  [−]"
	var width := 0.0 if objectives_collapsed else 620.0
	if objectives.custom_minimum_size.x != width:
		objectives.custom_minimum_size.x = width
		# Containers otherwise retain the expanded width after their children hide.
		objectives.size = Vector2.ZERO
	if not active:
		return
	var rifles = 0
	var defenders = 0
	var nest = false
	var posts: Dictionary = {}
	for u in SimEngine.units.values():
		if u.owner == 1 and u.unit_type == "rifleman":
			rifles += 1
		if u.owner == 2:
			if not str(u.get("encounter", "")).is_empty():
				posts[u.encounter] = true
			if u.is_structure:
				nest = true
			else:
				defenders += 1
	var state = SimEngine.match_state.status
	var heading = "FIRST STRIKE" if state != "finished" else ("MISSION COMPLETE" if SimEngine.match_state.winner == 1 else "MISSION FAILED · F9 to retry")
	status_label.text = "%s   %s\nArmy: %d Riflemen / ~40 recommended army supply\nSentry posts: %s · %s\nClear all enemies: %d defenders · Brood Nest %s\nProtect your base · Follow the canyon passes" % [heading, "[PAUSED]" if SimEngine.paused else "", rifles, "West standing" if posts.has("Western sentries") else "West cleared", "North standing" if posts.has("Northern ambush") else "North cleared", defenders, "standing" if nest else "destroyed"]
	if state == "finished" and not results_shown:
		results_shown = true
		results.show_report(SimEngine.match_state.results)
