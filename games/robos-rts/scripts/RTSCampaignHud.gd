extends CanvasLayer

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const CYAN := Color("#86e6f1")
const GOLD := Color("#ffcd77")

var battle: Node2D
var state: Dictionary = {}
var _objectives: PanelContainer
var _title: Label
var _primary: Label
var _bonus: Label
var _extra: Label
var _note: Label
var _timing: Label
var _captions: PanelContainer
var _speaker: Label
var _line: Label
var _skip: Label
var _top_bar: ColorRect
var _bottom_bar: ColorRect
var _result: PanelContainer
var _result_title: Label
var _result_reason: Label
var _result_bonus: Label
var _result_extra: Label
var _next: Button
var _retry: Button
var _restart_picker: PanelContainer
var _restart_heading: Label
var _restart_difficulty: OptionButton
var _restart_error: Label
var _restart_source: Control
var _restart_focus: Control
var _voice: AudioStreamPlayer
var _voice_started := false
var _cue_key := ""
var _camera_start := Vector2.ZERO
var _camera_height := 40.0
var _cinematic := false
var _skipped := false
var _reported_result := false

func _ready() -> void:
	layer = 9
	_objectives = _panel(Vector2(28, 92), 460)
	var objectives := _body(_objectives)
	_title = _label(objectives, 19, CYAN)
	_primary = _label(objectives, 22)
	_bonus = _label(objectives, 17, GOLD)
	_extra = _label(objectives, 17, GOLD)
	_note = _label(objectives, 17)
	_timing = _label(objectives, 17, CYAN)
	_top_bar = _bar(Vector2.ZERO, Vector2(1920, 106))
	_bottom_bar = _bar(Vector2(0, 883), Vector2(1920, 197))
	_captions = _panel(Vector2(455, 728), 1010)
	var captions := _body(_captions)
	_speaker = _label(captions, 19, CYAN)
	_line = _label(captions, 24)
	_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_skip = _label(captions, 16, Color("#a9bbca"))
	_skip.text = "Space or Esc to skip"
	_result = _panel(Vector2(613, 345), 694, true)
	var result := _body(_result)
	_result_title = _label(result, 38, CYAN)
	_result_reason = _label(result, 24)
	_result_bonus = _label(result, 20, GOLD)
	_result_extra = _label(result, 20, GOLD)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	result.add_child(buttons)
	_next = _button(buttons, "Next mission", _launch_next_mission)
	_retry = _button(buttons, "Retry mission", open_restart_picker)
	_button(buttons, "Main menu", _to_title)
	_build_restart_picker()
	_voice = AudioStreamPlayer.new()
	_voice.bus = "Master"
	add_child(_voice)
	reset()

func _build_restart_picker() -> void:
	_restart_picker = _panel(Vector2(680, 378), 560, true)
	var body := _body(_restart_picker)
	_restart_heading = _label(body, 30, CYAN)
	_label(body, 18).text = "Choose a difficulty for this mission."
	_restart_difficulty = OptionButton.new()
	_restart_difficulty.custom_minimum_size.y = 44
	_restart_difficulty.add_theme_font_size_override("font_size", 20)
	for difficulty in Campaign.DIFFICULTIES:
		_restart_difficulty.add_item(difficulty.capitalize())
	body.add_child(_restart_difficulty)
	_restart_error = _label(body, 16, Color("#ff9b91"))
	_restart_error.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	body.add_child(buttons)
	_button(buttons, "Restart mission", _restart_mission)
	_button(buttons, "Cancel", cancel_restart)

func _panel(at: Vector2, width: float, interactive: bool = false) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.position = at
	panel.custom_minimum_size.x = width
	panel.mouse_filter = Control.MOUSE_FILTER_STOP if interactive else Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.056, 0.091, 0.94)
	style.border_color = Color("#386577")
	style.set_border_width_all(1)
	style.border_width_left = 4
	style.set_content_margin_all(16)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	return panel

func _body(parent: Container) -> VBoxContainer:
	var body := VBoxContainer.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_theme_constant_override("separation", 8)
	parent.add_child(body)
	return body

func _label(parent: Container, font_size: int, color: Color = Color.WHITE) -> Label:
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label

func _button(parent: Container, title: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = title
	button.custom_minimum_size = Vector2(140, 42)
	button.add_theme_font_size_override("font_size", 18)
	button.pressed.connect(callback)
	parent.add_child(button)
	return button

func _bar(at: Vector2, size: Vector2) -> ColorRect:
	var bar := ColorRect.new()
	bar.color = Color("#070d16")
	bar.position = at
	bar.size = size
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bar)
	return bar

func reset() -> void:
	_voice.stop()
	_cue_key = ""
	_voice_started = false
	_skipped = false
	_reported_result = false
	_set_cinematic(false, false)
	_objectives.hide()
	_captions.hide()
	_result.hide()
	_restart_picker.hide()
	_restart_source = null
	_restart_focus = null
	state = {}
	set_process(SimEngine.campaign != null)

func _process(_delta: float) -> void:
	if SimEngine.campaign == null:
		return
	state = SimEngine.campaign.snapshot(SimEngine, battle.viewing_player())
	var finished: bool = state.status != "playing"
	_update_cue(state.cue, finished)
	_objectives.visible = not _cinematic and not finished and not battle.hud_hidden
	_title.text = "MISSION %02d  /  %s" % [state.mission, state.title.to_upper()]
	_primary.text = state.primary
	_bonus.text = "Optional  •  %s  %d/%d" % [state.bonus, state.bonus_done, state.bonus_total]
	_extra.visible = state.extra_total > 0
	_extra.text = "Optional  •  %s  %d/%d" % [state.extra, state.extra_done, state.extra_total]
	_note.visible = not state.mission_note.is_empty()
	_note.text = state.mission_note
	_timing.visible = state.rescue_in >= 0
	if _timing.visible:
		var rescue := "Rescue in %s" % _clock(state.rescue_in) if state.rescue_tag == 0 else "Rescue inbound"
		var wave := "Wave %d/%d" % [state.waves_sent, state.wave_total]
		if state.next_wave_in >= 0:
			wave += "  •  Next in %s" % _clock(state.next_wave_in)
		_timing.text = "%s   |   %s" % [rescue, wave]
	if finished and not _reported_result:
		_show_result()

func _clock(seconds: int) -> String:
	return "%d:%02d" % [seconds / 60, seconds % 60]

func _update_cue(cue: Dictionary, finished: bool) -> void:
	var key := "%s:%d" % [cue.id, cue.start_tick] if not cue.is_empty() else ""
	if key != _cue_key:
		_set_cinematic(false)
		_voice.stop()
		_voice_started = false
		_cue_key = key
		_skipped = false
		if not cue.is_empty():
			_speaker.text = cue.speaker.to_upper()
			_line.text = cue.text
			_captions.reset_size()
			_set_cinematic(not cue.point.is_empty() and not finished)
			var elapsed := float(SimEngine.tick - int(cue.start_tick)) * SimEngine.TICK_DT
			if elapsed < 1.0 and RTSAudio.can_play_campaign_voice():
				var voice := RTSAudio.load_campaign_voice(cue.id)
				if voice != null:
					_voice.stream = voice
					_voice.play()
					_voice_started = true
	_voice.volume_db = -80.0 if RTSAudio.muted else RTSAudio.master_volume_db
	_voice.stream_paused = SimEngine.paused and not finished
	_captions.visible = not key.is_empty() and not _skipped
	_skip.visible = _cinematic
	if _cinematic:
		_captions.position.y = 895
		var elapsed := float(SimEngine.tick - int(cue.start_tick)) * SimEngine.TICK_DT
		var blend := smoothstep(0.0, 1.35, elapsed)
		var target := Vector2(cue.point[0], cue.point[1])
		battle._focus_camera(_camera_start.lerp(target, blend), lerpf(_camera_height, 22.5, blend))
	else:
		_captions.position.y = 711

func _set_cinematic(active: bool, restore: bool = true) -> void:
	if active and not _cinematic:
		_camera_start = battle.world_3d.get_focus()
		_camera_height = battle.world_3d.cam_height
		battle.is_box_selecting = false
		battle.mm_dragging = false
		battle.mid_dragging = false
	elif not active and _cinematic and restore:
		battle._focus_camera(_camera_start, _camera_height)
	_cinematic = active
	_top_bar.visible = active
	_bottom_bar.visible = active
	battle.hud.visible = not active

func blocks_battle_input() -> bool:
	return _cinematic or _result.visible or restart_picker_visible()

func restart_picker_visible() -> bool:
	return _restart_picker.visible

func open_restart_picker() -> void:
	if SimEngine.campaign == null or restart_picker_visible():
		return
	_restart_source = battle.match_menu.panel if battle.match_menu.panel.visible else _result
	_restart_focus = get_viewport().gui_get_focus_owner()
	_restart_source.hide()
	_restart_heading.text = "Restart %s" % Campaign.MISSIONS[SimEngine.campaign.mission_index].title
	_restart_difficulty.select(Campaign.DIFFICULTIES.find(SimEngine.campaign.difficulty))
	_restart_error.hide()
	_restart_picker.show()
	_restart_difficulty.grab_focus()

func cancel_restart() -> void:
	_restart_picker.hide()
	if _restart_source:
		_restart_source.show()
	if _restart_focus:
		_restart_focus.grab_focus()
	_restart_source = null
	_restart_focus = null

func _restart_mission() -> void:
	var difficulty: String = Campaign.DIFFICULTIES[_restart_difficulty.selected]
	var result := SimEngine.start_campaign(SimEngine.campaign.mission_index, difficulty)
	if not result.ok:
		_restart_error.text = result.error
		_restart_error.show()

func cinematic() -> bool:
	return _cinematic

func skip_cinematic() -> void:
	if _cinematic:
		_skipped = true
		_voice.stop()
		_captions.hide()
		_set_cinematic(false)

func _show_result() -> void:
	_reported_result = true
	var won: bool = state.status == "victory"
	_result_title.text = "Mission complete" if won else "Mission failed"
	_result_title.modulate = Color.WHITE if won else Color("#ff9b91")
	_result_reason.text = state.reason
	_result_bonus.text = "%s  •  %d/%d" % [state.bonus, state.bonus_done, state.bonus_total]
	_result_extra.visible = state.extra_total > 0
	_result_extra.text = "%s  •  %d/%d" % [state.extra, state.extra_done, state.extra_total]
	_next.visible = won and state.mission < Campaign.MISSIONS.size()
	_retry.text = "Replay mission" if won else "Retry mission"
	if won and Campaign.save_completion(state.mission - 1) != OK:
		_result_reason.text += "\nCampaign progress could not be saved."
	RTSAudio.play_ui("match_victory" if won else "match_defeat")
	_result.show()
	(_next if _next.visible else _retry).grab_focus()

func _launch_next_mission() -> void:
	var result := SimEngine.start_campaign(SimEngine.campaign.mission_index + 1, SimEngine.campaign.difficulty)
	if not result.ok:
		_result_reason.text = result.error

func _to_title() -> void:
	SimEngine.resume_from_title = false
	SimEngine.title_battle_view.clear()
	get_tree().change_scene_to_file("res://scenes/RTSStart.tscn")

func presentation_state() -> Dictionary:
	return {
		"cinematic": _cinematic, "caption_visible": _captions.visible,
		"voice_started": _voice_started, "result_visible": _result.visible,
		"restart_visible": restart_picker_visible(),
		"restart_difficulty": Campaign.DIFFICULTIES[_restart_difficulty.selected] if restart_picker_visible() else "",
	}
