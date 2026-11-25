extends Control

# RTSProphecyConsole.gd — Seer Neral's Memory Crystal Sub-Star-Map (Lab 01)
# Launches the 4 Aurelian Prophecy missions independently of the Bridge Star Map.

signal launch_prophecy(mission_index: int, difficulty: String)
signal replay_arrival_requested
signal closed

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const ConsoleTheme = preload("res://scripts/campaign/RTSConsoleTheme.gd")
const HubState = preload("res://scripts/campaign/RTSHubState.gd")

const PROPHECY_FALLBACK_INTEL := {
	18: "Seer Neral's stealth vision: evade Gnarl Brood patrols across Talion's ruined shrines to recover the ancient keepers' coordinates.",
	19: "Break stasis prisons across the sunken Concord sanctuary and defeat the corrupted Revenant guardian.",
	20: "Awaken ancient psionic tendrils across the badlands to read the Matriarch's origin memory before the Swarm closes in.",
	21: "Hold the Concord archive's final defensive bastion until every prophetic countermeasure is sealed into the Memory Crystal.",
}

var selected_mission_index := 18
var _node_buttons: Dictionary = {}
var _title_label: Label
var _status_label: Label
var _brief_label: Label
var _intel_label: Label
var _difficulty_picker: OptionButton
var _launch_btn: Button
var _lattice_canvas: Control

const NODE_POSITIONS := {
	18: Vector2(280, 310),
	19: Vector2(540, 220),
	20: Vector2(800, 310),
	21: Vector2(1060, 230),
}

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.02, 0.03, 0.08, 0.88)
	add_child(dim)

	var chassis := ConsoleTheme.MonitorChassis.new()
	chassis.mode = ConsoleTheme.MonitorChassis.Mode.TECH_ARMORY
	chassis.header_title = "MEMORY CRYSTAL  ·  PROPHECY"
	chassis.position = Vector2(90, 30)
	chassis.size = Vector2(1740, 1020)
	chassis.screen_rect = Rect2(96, 108, 1516, 818)
	add_child(chassis)

	var bg := ColorRect.new()
	bg.position = Vector2(186, 138)
	bg.size = Vector2(1516, 818)
	bg.color = Color("#070d1c")
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	_lattice_canvas = Control.new()
	_lattice_canvas.position = Vector2(186, 138)
	_lattice_canvas.size = Vector2(1516, 460)
	_lattice_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lattice_canvas.draw.connect(_draw_lattice)
	add_child(_lattice_canvas)

	var sub_hdr := Label.new()
	sub_hdr.text = "SEER NERAL'S HARMONIC MEMORY LATTICE  //  SELECT A PROPHECY VISION"
	sub_hdr.position = Vector2(226, 160)
	sub_hdr.add_theme_font_override("font", ConsoleTheme.title_font())
	sub_hdr.add_theme_font_size_override("font_size", 16)
	sub_hdr.add_theme_color_override("font_color", Color("#7be8ff"))
	add_child(sub_hdr)

	var replay_btn := Button.new()
	replay_btn.text = "REPLAY NERAL ARRIVAL"
	replay_btn.position = Vector2(1414, 152)
	replay_btn.size = Vector2(256, 38)
	ConsoleTheme.apply_teal_tab_button(replay_btn, 14)
	replay_btn.pressed.connect(func(): replay_arrival_requested.emit())
	add_child(replay_btn)

	for idx_v in HubState.PROPHECY_INDICES:
		var idx: int = int(idx_v)
		if idx < 0 or idx >= Campaign.MISSIONS.size():
			continue
		var btn := Button.new()
		btn.toggle_mode = true
		var pt: Vector2 = NODE_POSITIONS[idx]
		btn.position = Vector2(186, 138) + pt - Vector2(115, 44)
		btn.size = Vector2(230, 88)
		ConsoleTheme.apply_teal_tab_button(btn, 16)
		btn.pressed.connect(func(): _select_vision(idx))
		add_child(btn)
		_node_buttons[idx] = btn

	var detail_panel := PanelContainer.new()
	detail_panel.position = Vector2(244, 608)
	detail_panel.size = Vector2(1432, 238)
	detail_panel.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.04, 0.09, 0.17, 0.95), Color("#46c8e8"), 2, 4, 22, 16))
	add_child(detail_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	detail_panel.add_child(vbox)

	var top_row := HBoxContainer.new()
	vbox.add_child(top_row)

	_title_label = Label.new()
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title_label.add_theme_font_override("font", ConsoleTheme.title_font())
	_title_label.add_theme_font_size_override("font_size", 28)
	_title_label.add_theme_color_override("font_color", Color("#e8faff"))
	top_row.add_child(_title_label)

	_status_label = Label.new()
	_status_label.add_theme_font_override("font", ConsoleTheme.title_font())
	_status_label.add_theme_font_size_override("font_size", 16)
	_status_label.add_theme_color_override("font_color", Color("#64f5a2"))
	top_row.add_child(_status_label)

	_brief_label = Label.new()
	_brief_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_brief_label.add_theme_font_override("font", ConsoleTheme.body_font())
	_brief_label.add_theme_font_size_override("font_size", 20)
	_brief_label.add_theme_color_override("font_color", Color("#d4ecf7"))
	vbox.add_child(_brief_label)

	_intel_label = Label.new()
	_intel_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_intel_label.add_theme_font_override("font", ConsoleTheme.body_font())
	_intel_label.add_theme_font_size_override("font_size", 17)
	_intel_label.add_theme_color_override("font_color", Color("#9ee4ff"))
	vbox.add_child(_intel_label)

	var footer := HBoxContainer.new()
	footer.position = Vector2(244, 868)
	footer.size = Vector2(1432, 56)
	footer.add_theme_constant_override("separation", 18)
	add_child(footer)

	var diff_lbl := Label.new()
	diff_lbl.text = "DIFFICULTY:"
	diff_lbl.add_theme_font_override("font", ConsoleTheme.title_font())
	diff_lbl.add_theme_font_size_override("font_size", 16)
	diff_lbl.add_theme_color_override("font_color", Color("#8ec8dc"))
	footer.add_child(diff_lbl)

	_difficulty_picker = OptionButton.new()
	_difficulty_picker.custom_minimum_size = Vector2(180, 46)
	for d in Campaign.DIFFICULTIES:
		_difficulty_picker.add_item(d.capitalize())
	_difficulty_picker.select(Campaign.DIFFICULTIES.find("normal"))
	footer.add_child(_difficulty_picker)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(spacer)

	_launch_btn = Button.new()
	_launch_btn.text = "ENTER VISION ▸"
	_launch_btn.custom_minimum_size = Vector2(248, 52)
	ConsoleTheme.apply_emerald_button(_launch_btn, 20, true)
	_launch_btn.pressed.connect(_on_launch)
	footer.add_child(_launch_btn)

	var close_btn := Button.new()
	close_btn.text = "CLOSE"
	close_btn.custom_minimum_size = Vector2(156, 52)
	ConsoleTheme.apply_emerald_button(close_btn, 18, false)
	close_btn.pressed.connect(func(): closed.emit())
	footer.add_child(close_btn)

func open_crystal() -> void:
	var completed: Array[String] = Campaign.completed_missions()
	var pick := 18
	for idx_v in HubState.PROPHECY_INDICES:
		var idx: int = int(idx_v)
		if idx >= 0 and idx < Campaign.MISSIONS.size() and str(Campaign.MISSIONS[idx].id) not in completed and Campaign.mission_available(idx, completed):
			pick = idx
			break
	show()
	if pick < Campaign.MISSIONS.size():
		_select_vision(pick)
	if _launch_btn and not _launch_btn.disabled:
		_launch_btn.grab_focus()

func _select_vision(idx: int) -> void:
	if idx < 0 or idx >= Campaign.MISSIONS.size():
		return
	selected_mission_index = idx
	var completed: Array[String] = Campaign.completed_missions()
	for k_v in _node_buttons:
		var k: int = int(k_v)
		var b: Button = _node_buttons[k]
		var k_id := str(Campaign.MISSIONS[k].id)
		var done: bool = k_id in completed
		var avail: bool = Campaign.mission_available(k, completed)
		var badge := "✓ " if done else ("" if avail else "🔒 ")
		b.text = "%s%s" % [badge, str(Campaign.MISSIONS[k].title)]
		b.set_pressed_no_signal(k == idx)

	var m: Dictionary = Campaign.MISSIONS[idx]
	var lock_reason := ""
	var camp_obj: Object = Campaign
	if camp_obj.has_method("mission_lock_reason"):
		lock_reason = str(camp_obj.call("mission_lock_reason", idx, completed))
	elif not Campaign.mission_available(idx, completed):
		lock_reason = "Complete previous Prophecy vision"
	var is_done: bool = str(m.id) in completed
	_title_label.text = "PROPHECY %d / 4  ·  %s" % [HubState.PROPHECY_INDICES.find(idx) + 1, str(m.title).to_upper()]
	_status_label.text = "VISION COMPLETED (REPLAYABLE)" if is_done else ("UNLOCKED" if lock_reason.is_empty() else ("LOCKED — " + lock_reason.to_upper()))
	_status_label.add_theme_color_override("font_color", Color("#64f5a2") if lock_reason.is_empty() else Color("#ff8f7a"))
	_brief_label.text = str(m.brief)
	_intel_label.text = str(PROPHECY_FALLBACK_INTEL.get(idx, ""))
	if ResourceLoader.exists("res://scripts/engine/RTSRemainingCampaignData.gd"):
		var rem_script: Variant = load("res://scripts/engine/RTSRemainingCampaignData.gd")
		if rem_script != null:
			var local_idx: int = idx - int(rem_script.get("FIRST"))
			var intel_arr: Array = rem_script.get("INTEL")
			if local_idx >= 0 and local_idx < intel_arr.size():
				_intel_label.text = str(intel_arr[local_idx])
	_launch_btn.disabled = not lock_reason.is_empty()
	_launch_btn.text = "REPLAY VISION ▸" if is_done else "ENTER VISION ▸"
	if _lattice_canvas:
		_lattice_canvas.queue_redraw()

func _draw_lattice() -> void:
	var completed: Array[String] = Campaign.completed_missions()
	for i in range(HubState.PROPHECY_INDICES.size() - 1):
		var a_idx: int = int(HubState.PROPHECY_INDICES[i])
		var b_idx: int = int(HubState.PROPHECY_INDICES[i + 1])
		if b_idx >= Campaign.MISSIONS.size():
			continue
		var pa: Vector2 = NODE_POSITIONS[a_idx]
		var pb: Vector2 = NODE_POSITIONS[b_idx]
		var unlocked: bool = Campaign.mission_available(b_idx, completed)
		var col := Color(0.36, 0.92, 1.0, 0.78) if unlocked else Color(0.24, 0.36, 0.48, 0.42)
		_lattice_canvas.draw_line(pa, pb, col, 3.0, true)
	for idx_v in HubState.PROPHECY_INDICES:
		var idx: int = int(idx_v)
		if idx >= Campaign.MISSIONS.size():
			continue
		var pt: Vector2 = NODE_POSITIONS[idx]
		var sel: bool = idx == selected_mission_index
		_lattice_canvas.draw_arc(pt, 58.0 if sel else 48.0, 0.0, TAU, 36, Color(0.45, 0.96, 1.0, 0.55 if sel else 0.22), 2.0)

func _on_launch() -> void:
	var diff: String = Campaign.DIFFICULTIES[_difficulty_picker.selected]
	launch_prophecy.emit(selected_mission_index, diff)
