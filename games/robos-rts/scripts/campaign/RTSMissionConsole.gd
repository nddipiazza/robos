extends Control

signal launch_requested(mission_index: int, difficulty: String)
signal mutators_requested
signal closed

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")
const ConsoleTheme = preload("res://scripts/campaign/RTSConsoleTheme.gd")
const PlanetShader = preload("res://scripts/campaign/rts_planet.gdshader")

var showcase: Node
var selected_index := 0
var mission_buttons: Array[Button] = []
var difficulty_picker: OptionButton
var launch_button: Button
var close_button: Button

var _planet_mat: ShaderMaterial
var _mission_title: Label
var _sector_badge: Label
var _objective_text: Label
var _credits_value: Label
var _research_badge: Label
var _mutator_btn: Button
var _contact_name: Label
var _portrait_rect: TextureRect
var _briefing_btn: Button
var _tech_name: Label
var _tech_icon: TextureRect
var _tech_desc: Label
var _error_label: Label
var _voice_player: AudioStreamPlayer
var _scan_overlay: Control

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	var chassis := ConsoleTheme.MonitorChassis.new()
	chassis.mode = ConsoleTheme.MonitorChassis.Mode.CRT_MISSION
	chassis.header_title = "MISSION SELECT"
	chassis.position = Vector2(76, 26)
	chassis.size = Vector2(1768, 1028)
	chassis.screen_rect = Rect2(118, 92, 1532, 736)
	add_child(chassis)

	# Planet & deep-space viewport inside the CRT bezel
	var space_rect := ColorRect.new()
	space_rect.position = Vector2(194, 118)
	space_rect.size = Vector2(1532, 736)
	space_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_planet_mat = ShaderMaterial.new()
	_planet_mat.shader = PlanetShader
	_planet_mat.set_shader_parameter("viewport_aspect", Vector2(1532.0 / 736.0, 1.0))
	space_rect.material = _planet_mat
	add_child(space_rect)

	_build_mission_strip()
	_build_briefing_overlay()
	_build_contact_box()
	_build_center_controls()
	_build_tech_box()

	_voice_player = AudioStreamPlayer.new()
	_voice_player.bus = "SFX"
	_voice_player.finished.connect(_on_voice_finished)
	add_child(_voice_player)

	if showcase and not showcase.ready_done:
		showcase.portraits_ready.connect(_refresh_selected_mission)
	set_process(DisplayServer.get_name() != "headless")

func _process(_delta: float) -> void:
	if _scan_overlay and visible:
		_scan_overlay.queue_redraw()
	if _briefing_btn and _voice_player:
		var expected := "STOP" if _voice_player.playing else "BRIEFING"
		if _briefing_btn.text != expected:
			_briefing_btn.text = expected

func _build_mission_strip() -> void:
	var strip_panel := PanelContainer.new()
	strip_panel.position = Vector2(216, 134)
	strip_panel.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.02, 0.06, 0.08, 0.82), Color("#2c5c69"), 1, 3, 10, 6))
	add_child(strip_panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	strip_panel.add_child(row)

	var tag := Label.new()
	tag.text = "OPERATIONS:"
	tag.add_theme_font_override("font", ConsoleTheme.title_font())
	tag.add_theme_font_size_override("font_size", 14)
	tag.add_theme_color_override("font_color", Color("#76a8b8"))
	row.add_child(tag)

	for idx in Campaign.MISSIONS.size():
		var btn := Button.new()
		btn.toggle_mode = true
		btn.text = "%02d" % (idx + 1)
		btn.custom_minimum_size = Vector2(46, 32)
		btn.tooltip_text = "%02d · %s" % [idx + 1, Campaign.MISSIONS[idx].title]
		ConsoleTheme.apply_teal_tab_button(btn, 15)
		btn.pressed.connect(_select_mission.bind(idx))
		row.add_child(btn)
		mission_buttons.append(btn)

func _build_briefing_overlay() -> void:
	var col := VBoxContainer.new()
	col.position = Vector2(226, 194)
	col.custom_minimum_size = Vector2(640, 360)
	col.add_theme_constant_override("separation", 4)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)

	var m_lbl := _small_cap(col, "MISSION:")
	m_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_mission_title = Label.new()
	_mission_title.add_theme_font_override("font", ConsoleTheme.title_font())
	_mission_title.add_theme_font_size_override("font_size", 46)
	_mission_title.add_theme_color_override("font_color", Color("#f2f8ff"))
	_mission_title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	_mission_title.add_theme_constant_override("shadow_offset_x", 2)
	_mission_title.add_theme_constant_override("shadow_offset_y", 2)
	col.add_child(_mission_title)

	_sector_badge = Label.new()
	_sector_badge.add_theme_font_override("font", ConsoleTheme.body_font())
	_sector_badge.add_theme_font_size_override("font_size", 15)
	_sector_badge.add_theme_color_override("font_color", Color("#56e885"))
	col.add_child(_sector_badge)

	var sp1 := Control.new()
	sp1.custom_minimum_size.y = 10
	col.add_child(sp1)

	_small_cap(col, "MISSION OBJECTIVE:")
	_objective_text = Label.new()
	_objective_text.custom_minimum_size.x = 610
	_objective_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_objective_text.add_theme_font_override("font", ConsoleTheme.body_font())
	_objective_text.add_theme_font_size_override("font_size", 22)
	_objective_text.add_theme_color_override("font_color", Color("#dceaf5"))
	_objective_text.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	col.add_child(_objective_text)

	var sp2 := Control.new()
	sp2.custom_minimum_size.y = 12
	col.add_child(sp2)

	_small_cap(col, "REWARD IN CREDITS:")
	var reward_row := HBoxContainer.new()
	reward_row.add_theme_constant_override("separation", 18)
	col.add_child(reward_row)

	_credits_value = Label.new()
	_credits_value.add_theme_font_override("font", ConsoleTheme.title_font())
	_credits_value.add_theme_font_size_override("font_size", 30)
	_credits_value.add_theme_color_override("font_color", Color("#ffffff"))
	reward_row.add_child(_credits_value)

	_research_badge = Label.new()
	_research_badge.add_theme_font_override("font", ConsoleTheme.title_font())
	_research_badge.add_theme_font_size_override("font_size", 18)
	_research_badge.add_theme_color_override("font_color", Color("#65f0ff"))
	reward_row.add_child(_research_badge)

	var sp3 := Control.new()
	sp3.custom_minimum_size.y = 14
	col.add_child(sp3)

	_mutator_btn = Button.new()
	_mutator_btn.custom_minimum_size = Vector2(260, 36)
	_mutator_btn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_mutator_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	ConsoleTheme.apply_teal_tab_button(_mutator_btn, 15)
	_mutator_btn.pressed.connect(func(): mutators_requested.emit())
	col.add_child(_mutator_btn)

func _build_contact_box() -> void:
	var frame := PanelContainer.new()
	frame.position = Vector2(194, 590)
	frame.size = Vector2(252, 306)
	frame.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#081318"), Color("#3e7987"), 2, 2, 4, 4))
	add_child(frame)

	var inner := Control.new()
	frame.add_child(inner)

	_portrait_rect = TextureRect.new()
	_portrait_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_portrait_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	inner.add_child(_portrait_rect)

	_scan_overlay = Control.new()
	_scan_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_scan_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scan_overlay.draw.connect(_draw_portrait_hud)
	inner.add_child(_scan_overlay)

	_contact_name = Label.new()
	_contact_name.position = Vector2(10, 8)
	_contact_name.add_theme_font_override("font", ConsoleTheme.title_font())
	_contact_name.add_theme_font_size_override("font_size", 17)
	_contact_name.add_theme_color_override("font_color", Color("#d7f5ff"))
	_contact_name.add_theme_color_override("font_outline_color", Color("#030a0d"))
	_contact_name.add_theme_constant_override("outline_size", 4)
	inner.add_child(_contact_name)

	_briefing_btn = Button.new()
	_briefing_btn.text = "BRIEFING"
	_briefing_btn.position = Vector2(226, 904)
	_briefing_btn.size = Vector2(188, 42)
	ConsoleTheme.apply_teal_tab_button(_briefing_btn, 16)
	_briefing_btn.pressed.connect(_toggle_briefing_audio)
	add_child(_briefing_btn)

func _draw_portrait_hud() -> void:
	var sz := _scan_overlay.size
	for y in range(0, int(sz.y), 4):
		_scan_overlay.draw_line(Vector2(0, y), Vector2(sz.x, y), Color(0.05, 0.25, 0.28, 0.16), 1.0)
	_scan_overlay.draw_rect(Rect2(0, 0, sz.x, 34), Color(0.02, 0.08, 0.11, 0.62), true)
	if _voice_player and _voice_player.playing:
		var t := Time.get_ticks_msec() * 0.012
		for i in 12:
			var h := 6.0 + absf(sin(t + i * 0.7)) * 20.0
			var bx := sz.x - 94.0 + i * 7.0
			_scan_overlay.draw_rect(Rect2(bx, sz.y - 10.0 - h, 4.5, h), Color("#4eff7b"), true)

func _build_center_controls() -> void:
	# Recessed label strip matching Image 5 ("MISSION CONTACT" | "AVAILABLE TECHNOLOGY")
	var strip := PanelContainer.new()
	strip.position = Vector2(456, 818)
	strip.size = Vector2(974, 36)
	strip.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#081419"), Color("#2c5a66"), 2, 2, 18, 4))
	add_child(strip)

	var labels := HBoxContainer.new()
	strip.add_child(labels)

	var left_l := Label.new()
	left_l.text = "MISSION CONTACT"
	left_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_l.add_theme_font_override("font", ConsoleTheme.title_font())
	left_l.add_theme_font_size_override("font_size", 16)
	left_l.add_theme_color_override("font_color", Color("#79aebf"))
	labels.add_child(left_l)

	var right_l := Label.new()
	right_l.text = "AVAILABLE TECHNOLOGY"
	right_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	right_l.add_theme_font_override("font", ConsoleTheme.title_font())
	right_l.add_theme_font_size_override("font_size", 16)
	right_l.add_theme_color_override("font_color", Color("#79aebf"))
	labels.add_child(right_l)

	# Difficulty selector + glowing green LAUNCH button
	var action_row := HBoxContainer.new()
	action_row.position = Vector2(486, 872)
	action_row.size = Vector2(914, 62)
	action_row.alignment = BoxContainer.ALIGNMENT_CENTER
	action_row.add_theme_constant_override("separation", 18)
	add_child(action_row)

	var diff_caption := Label.new()
	diff_caption.text = "Select\nDifficulty"
	diff_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	diff_caption.add_theme_font_override("font", ConsoleTheme.body_font())
	diff_caption.add_theme_font_size_override("font_size", 15)
	diff_caption.add_theme_color_override("font_color", Color("#8ab6c4"))
	action_row.add_child(diff_caption)

	var arrow_ind := Control.new()
	arrow_ind.custom_minimum_size = Vector2(14, 32)
	arrow_ind.mouse_filter = Control.MOUSE_FILTER_IGNORE
	arrow_ind.draw.connect(func():
		arrow_ind.draw_colored_polygon(PackedVector2Array([
			Vector2(2, 6), Vector2(12, 16), Vector2(2, 26),
		]), Color("#67bdd1")))
	action_row.add_child(arrow_ind)

	difficulty_picker = OptionButton.new()
	difficulty_picker.custom_minimum_size = Vector2(236, 54)
	ConsoleTheme.apply_teal_tab_button(difficulty_picker, 21)
	for diff in Campaign.DIFFICULTIES:
		difficulty_picker.add_item(diff.to_upper())
	var current_diff := SimEngine.campaign.difficulty if SimEngine.campaign != null else "normal"
	difficulty_picker.select(maxi(0, Campaign.DIFFICULTIES.find(current_diff)))
	action_row.add_child(difficulty_picker)

	launch_button = Button.new()
	launch_button.text = "LAUNCH"
	launch_button.custom_minimum_size = Vector2(272, 58)
	ConsoleTheme.apply_emerald_button(launch_button, 25, true)
	launch_button.pressed.connect(func():
		stop_audio()
		launch_requested.emit(selected_index, Campaign.DIFFICULTIES[difficulty_picker.selected]))
	action_row.add_child(launch_button)

	_error_label = Label.new()
	_error_label.position = Vector2(486, 940)
	_error_label.size = Vector2(914, 28)
	_error_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_error_label.add_theme_font_size_override("font_size", 16)
	_error_label.add_theme_color_override("font_color", Color("#ff8f85"))
	add_child(_error_label)

func _build_tech_box() -> void:
	var frame := PanelContainer.new()
	frame.position = Vector2(1440, 590)
	frame.size = Vector2(286, 306)
	frame.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#081217"), Color("#3e7987"), 2, 2, 10, 8))
	add_child(frame)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	frame.add_child(vbox)

	_tech_name = Label.new()
	_tech_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_tech_name.add_theme_font_override("font", ConsoleTheme.title_font())
	_tech_name.add_theme_font_size_override("font_size", 18)
	_tech_name.add_theme_color_override("font_color", Color("#d7f5ff"))
	vbox.add_child(_tech_name)

	var icon_well := PanelContainer.new()
	icon_well.size_flags_vertical = Control.SIZE_EXPAND_FILL
	icon_well.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#040a0d"), Color("#1e404a"), 1, 2, 4, 4))
	vbox.add_child(icon_well)

	_tech_icon = TextureRect.new()
	_tech_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_tech_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon_well.add_child(_tech_icon)

	_tech_desc = Label.new()
	_tech_desc.custom_minimum_size = Vector2(258, 68)
	_tech_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tech_desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tech_desc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_tech_desc.add_theme_font_override("font", ConsoleTheme.body_font())
	_tech_desc.add_theme_font_size_override("font_size", 14)
	_tech_desc.add_theme_color_override("font_color", Color("#9cc0cf"))
	vbox.add_child(_tech_desc)

	close_button = Button.new()
	close_button.text = "CLOSE"
	close_button.position = Vector2(1468, 908)
	close_button.size = Vector2(238, 46)
	ConsoleTheme.apply_emerald_button(close_button, 20, false)
	close_button.pressed.connect(func():
		stop_audio()
		closed.emit())
	add_child(close_button)

func _small_cap(parent: Container, text_val: String) -> Label:
	var l := Label.new()
	l.text = text_val
	l.add_theme_font_override("font", ConsoleTheme.title_font())
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_color", Color("#699eb0"))
	parent.add_child(l)
	return l

func refresh_progress(mutator_count: int = 0) -> void:
	var completed := Campaign.completed_missions()
	var first_uncompleted := -1
	for idx in Campaign.MISSIONS.size():
		var available := Campaign.mission_available(idx, completed)
		var btn := mission_buttons[idx]
		btn.disabled = not available
		var done: bool = str(Campaign.MISSIONS[idx].id) in completed
		btn.text = "%02d✓" % (idx + 1) if done else "%02d" % (idx + 1)
		if available and not done and first_uncompleted == -1:
			first_uncompleted = idx
	if first_uncompleted != -1 and (selected_index >= mission_buttons.size() or mission_buttons[selected_index].disabled):
		selected_index = first_uncompleted
	elif first_uncompleted != -1 and selected_index == 0 and Campaign.MISSIONS[0].id in completed:
		selected_index = first_uncompleted
	_mutator_btn.text = "MUTATORS: %d ACTIVE" % mutator_count if mutator_count > 0 else "MUTATORS: STANDARD"
	_select_mission(selected_index)

func set_error(msg: String) -> void:
	if _error_label:
		_error_label.text = msg

func stop_audio() -> void:
	if _voice_player and _voice_player.playing:
		_voice_player.stop()

func _toggle_briefing_audio() -> void:
	if not _voice_player:
		return
	if _voice_player.playing:
		_voice_player.stop()
		return
	var meta := HubData.mission_meta(selected_index)
	if RTSAudio.can_play_campaign_voice():
		var stream := RTSAudio.load_campaign_voice(str(meta.voice_cue))
		if stream != null:
			_voice_player.stream = stream
			_voice_player.play()

func _on_voice_finished() -> void:
	if _briefing_btn:
		_briefing_btn.text = "BRIEFING"

func _select_mission(idx: int) -> void:
	var completed := Campaign.completed_missions()
	if not Campaign.mission_available(idx, completed):
		return
	stop_audio()
	selected_index = idx
	for i in mission_buttons.size():
		mission_buttons[i].set_pressed_no_signal(i == idx)
	_refresh_selected_mission()

func _refresh_selected_mission() -> void:
	var mission: Dictionary = Campaign.MISSIONS[selected_index]
	var meta := HubData.mission_meta(selected_index)
	var completed := Campaign.completed_missions()
	var is_done: bool = mission.id in completed

	_mission_title.text = str(mission.title).to_upper()
	_sector_badge.text = "%s  ·  %s  ·  %s" % [
		str(meta.planet_name),
		str(meta.sector).to_upper(),
		"COMPLETED ✓" if is_done else "ACTIVE CONTRACT",
	]
	_sector_badge.add_theme_color_override("font_color", Color("#56e885") if is_done else Color("#7ce8ff"))
	_objective_text.text = str(mission.brief)
	_credits_value.text = HubData.format_credits(int(meta.credits))
	_research_badge.text = str(meta.research_label)
	_research_badge.visible = not str(meta.research_label).is_empty()

	_contact_name.text = str(meta.contact)
	if showcase:
		var portrait_path := "res://assets/ui/campaign/portrait_%s.webp" % str(meta.portrait)
		_portrait_rect.texture = showcase.load_art_texture(portrait_path)
		_tech_icon.texture = showcase.get_portrait(str(meta.tech_unit))

	_tech_name.text = str(meta.tech_title)
	_tech_desc.text = str(meta.tech_desc)

	var p: Dictionary = meta.planet
	if _planet_mat:
		_planet_mat.set_shader_parameter("primary_color", p.primary)
		_planet_mat.set_shader_parameter("secondary_color", p.secondary)
		_planet_mat.set_shader_parameter("accent_color", p.accent)
		_planet_mat.set_shader_parameter("atmo_color", p.atmo)
		_planet_mat.set_shader_parameter("glow_color", p.glow)
		_planet_mat.set_shader_parameter("cloud_density", float(p.clouds))
		_planet_mat.set_shader_parameter("glow_strength", float(p.glow_strength))
		_planet_mat.set_shader_parameter("planet_seed", float(p.seed))
