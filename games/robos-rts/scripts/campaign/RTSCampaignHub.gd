extends Control

signal launch_mission(mission_index: int, difficulty: String, mutators: Array)
signal back_to_title

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")
const ConsoleTheme = preload("res://scripts/campaign/RTSConsoleTheme.gd")
const Showcase3D = preload("res://scripts/campaign/RTSUnitShowcase3D.gd")
const MissionConsole = preload("res://scripts/campaign/RTSMissionConsole.gd")
const TechConsole = preload("res://scripts/campaign/RTSTechConsole.gd")
const CutsceneData = preload("res://scripts/campaign/RTSCutsceneData.gd")
const CutsceneTheater = preload("res://scripts/campaign/RTSCutsceneTheater.gd")

const ROOM_ORDER := ["armory", "bridge", "cantina", "laboratory"]
const ROOM_TITLES := {
	"armory": "Armory",
	"bridge": "Bridge",
	"cantina": "Cantina",
	"laboratory": "Laboratory",
}
const ROOM_ART := {
	"armory": "res://assets/ui/campaign/armory_bay.webp",
	"bridge": "res://assets/ui/campaign/bridge_deck.webp",
	"cantina": "res://assets/ui/campaign/cantina_lounge.webp",
	"laboratory": "res://assets/ui/campaign/laboratory_deck.webp",
}

var current_room := "bridge"
var active_console := ""

var showcase: Node
var mission_console: Control
var tech_console: Control
var cutscene_theater: Control

var _rooms: Dictionary = {}
var _nav_buttons: Dictionary = {}
var _credits_label: Label
var _research_pill: Label
var _top_mutator_btn: Button
var _bridge_map_hotspot: Control
var _quick_deploy_title: Label
var _quick_deploy_btn: Button
var _holo_fx: Control
var _toast_panel: PanelContainer
var _toast_speaker: Label
var _toast_body: Label
var _toast_timer := 0.0
var _news_cursor := -1
var _rook_cursor := 0

const ROOK_LINES := [
	"Rook: \"Directorate patrols double their armor past White Ridge. Grab Ballistic Shields in the Armory before dropping hot.\"",
	"Rook: \"Those Bracken Roadwardens fight like cornered wolves. Keep four supply open if the road starts crawling.\"",
	"Rook: \"Dr. Aster's cooking up carapace plating down in the Lab. Ugly as sin, stops acid cold.\"",
	"Rook: \"Sable says the Tarsus freight crews run escort walkers now. Hit 'em on the move with Rail Skimmers.\"",
]

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	showcase = Showcase3D.new()
	add_child(showcase)

	var backdrop_base := ColorRect.new()
	backdrop_base.color = Color("#05090d")
	backdrop_base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop_base)

	_build_rooms()
	_build_top_hud()
	_build_bottom_nav()
	_build_toast()
	_build_consoles()

	switch_room("bridge")
	set_process(true)

func _process(delta: float) -> void:
	if _holo_fx and visible and current_room == "bridge" and active_console.is_empty():
		_holo_fx.queue_redraw()
	if _toast_timer > 0.0:
		_toast_timer -= delta
		if _toast_timer <= 0.0 and _toast_panel:
			_toast_panel.hide()

func _build_rooms() -> void:
	for room_id in ROOM_ORDER:
		var layer := Control.new()
		layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		layer.hide()
		add_child(layer)

		var bg := TextureRect.new()
		bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		bg.texture = showcase.load_art_texture(ROOM_ART[room_id])
		layer.add_child(bg)

		_rooms[room_id] = layer

	_populate_bridge(_rooms["bridge"])
	_populate_armory(_rooms["armory"])
	_populate_cantina(_rooms["cantina"])
	_populate_laboratory(_rooms["laboratory"])

func _populate_bridge(room: Control) -> void:
	# Animated holographic orbital scan overlay over the Bridge Star-Map Holo-Table
	_holo_fx = Control.new()
	_holo_fx.position = Vector2(540, 410)
	_holo_fx.size = Vector2(400, 320)
	_holo_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_holo_fx.draw.connect(_draw_bridge_holo)
	room.add_child(_holo_fx)

	_bridge_map_hotspot = _add_hotspot(
		room, Rect2(565, 435, 355, 375), "Mission Console", "Select Operation",
		Vector2(0, -172), Vector2(0, -24), func(): open_console("mission_select")
	)
	_add_hotspot(
		room, Rect2(415, 405, 145, 350), "Prologue", "Ashfall Signal Movie",
		Vector2(-75, -135), Vector2(10, -45), func(): trigger_cutscene("hub_prologue")
	)
	_add_hotspot(
		room, Rect2(845, 385, 165, 290), "Captain Vale", "Strategic Cutscene",
		Vector2(98, -118), Vector2(-12, -40), func(): trigger_cutscene("bridge_vale")
	)
	_add_hotspot(
		room, Rect2(1210, 545, 445, 215), "Mutator Matrix", "Tactical Modifiers",
		Vector2(28, -98), Vector2(-24, 12), func(): open_console("mutators")
	)

	# Lower-right emerald quick-action dock (styled like "Selling Artifacts" in Image 4!)
	var quick_dock := HBoxContainer.new()
	quick_dock.position = Vector2(1430, 902)
	quick_dock.size = Vector2(462, 68)
	quick_dock.alignment = BoxContainer.ALIGNMENT_END
	quick_dock.add_theme_constant_override("separation", 12)
	room.add_child(quick_dock)

	var text_col := VBoxContainer.new()
	text_col.alignment = BoxContainer.ALIGNMENT_CENTER
	text_col.add_theme_constant_override("separation", 1)
	quick_dock.add_child(text_col)

	var q_eyebrow := Label.new()
	q_eyebrow.text = "NEXT OPERATION"
	q_eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	q_eyebrow.add_theme_font_override("font", ConsoleTheme.title_font())
	q_eyebrow.add_theme_font_size_override("font_size", 13)
	q_eyebrow.add_theme_color_override("font_color", Color("#6cf596"))
	text_col.add_child(q_eyebrow)

	_quick_deploy_title = Label.new()
	_quick_deploy_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_quick_deploy_title.add_theme_font_override("font", ConsoleTheme.title_font())
	_quick_deploy_title.add_theme_font_size_override("font_size", 20)
	_quick_deploy_title.add_theme_color_override("font_color", Color("#eefaff"))
	_quick_deploy_title.add_theme_color_override("font_outline_color", Color("#030a07"))
	_quick_deploy_title.add_theme_constant_override("outline_size", 4)
	text_col.add_child(_quick_deploy_title)

	_quick_deploy_btn = Button.new()
	_quick_deploy_btn.text = "DEPLOY ▸"
	_quick_deploy_btn.custom_minimum_size = Vector2(146, 56)
	ConsoleTheme.apply_emerald_button(_quick_deploy_btn, 19, true)
	_quick_deploy_btn.pressed.connect(_trigger_quick_deploy)
	quick_dock.add_child(_quick_deploy_btn)

func _draw_bridge_holo() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var t := Time.get_ticks_msec() * 0.0018
	var center := Vector2(198, 146)
	var pulse := 0.55 + 0.45 * sin(t * 2.1)
	_holo_fx.draw_arc(center, 88.0 + pulse * 4.0, t, t + PI * 1.35, 36, Color(0.28, 1.0, 0.52, 0.24), 2.0)
	_holo_fx.draw_arc(center, 108.0, -t * 0.8, -t * 0.8 + PI * 0.9, 32, Color(0.38, 0.95, 0.72, 0.16), 1.5)
	var blip := center + Vector2(cos(t * 1.4) * 58.0, sin(t * 1.4) * 22.0)
	_holo_fx.draw_circle(blip, 4.0, Color(0.45, 1.0, 0.65, 0.75))

func _populate_armory(room: Control) -> void:
	_add_hotspot(
		room, Rect2(835, 600, 230, 265), "Armory Console", "Tech Purchase",
		Vector2(-10, -142), Vector2(0, -25), func(): open_console("armory")
	)
	_add_hotspot(
		room, Rect2(1070, 610, 175, 265), "Quartermaster Vane", "Bay 07 Cutscene",
		Vector2(70, -135), Vector2(-15, -55), func(): trigger_cutscene("armory_intro")
	)
	_add_hotspot(
		room, Rect2(130, 395, 420, 225), "Rail Skimmer", "Vehicles Tech",
		Vector2(-30, -118), Vector2(10, 5), func(): open_console("armory", "vehicles", "rail_skimmer")
	)
	_add_hotspot(
		room, Rect2(375, 325, 145, 130), "Torchguard", "Infantry Tech",
		Vector2(22, -82), Vector2(0, 0), func(): open_console("armory", "infantry", "torchguard")
	)
	_add_hotspot(
		room, Rect2(555, 405, 355, 145), "Kestrel Fighter", "Starships Tech",
		Vector2(0, -86), Vector2(0, 5), func(): open_console("armory", "starships", "kestrel_interceptor")
	)
	_add_hotspot(
		room, Rect2(1285, 275, 215, 230), "Warden Walker", "Vehicles Tech",
		Vector2(0, -124), Vector2(0, -15), func(): open_console("armory", "vehicles", "warden_walker")
	)
	_add_hotspot(
		room, Rect2(1420, 410, 365, 185), "Rampart Dropship", "Starships Tech",
		Vector2(18, -98), Vector2(-15, 10), func(): open_console("armory", "starships", "rampart_transport")
	)
	_add_hotspot(
		room, Rect2(1600, 545, 230, 290), "Breacher", "Infantry Tech",
		Vector2(-25, -150), Vector2(0, -20), func(): open_console("armory", "infantry", "breacher")
	)

func _populate_cantina(room: Control) -> void:
	_add_hotspot(
		room, Rect2(290, 745, 415, 205), "Mercenaries", "Contract Board",
		Vector2(85, 92), Vector2(0, -12), func(): open_console("cantina")
	)
	_add_hotspot(
		room, Rect2(815, 415, 260, 455), "Corporal Rook", "Cantina Cutscene",
		Vector2(-95, -195), Vector2(-10, -120), func(): trigger_cutscene("cantina_rook")
	)
	_add_hotspot(
		room, Rect2(980, 140, 315, 225), "Frontier News", "Live News Cutscene",
		Vector2(115, 118), Vector2(20, 45), func(): trigger_cutscene("frn_broadcast")
	)
	_add_hotspot(
		room, Rect2(720, 170, 185, 235), "Jukebox", "Bloodlines Audio",
		Vector2(-115, -55), Vector2(-5, 0), _pulse_jukebox
	)
	_add_hotspot(
		room, Rect2(1395, 40, 430, 260), "Cinema Archive", "Replay Cutscenes",
		Vector2(-65, 145), Vector2(10, 40), func(): open_console("cutscenes")
	)

func _populate_laboratory(room: Control) -> void:
	_add_hotspot(
		room, Rect2(770, 470, 590, 370), "Dr. Aster", "Research Console",
		Vector2(10, -178), Vector2(0, -25), func(): open_console("laboratory", "brood")
	)
	_add_hotspot(
		room, Rect2(355, 155, 320, 610), "Brood Specimen", "Xenobiology Track",
		Vector2(0, 292), Vector2(0, 80), func(): open_console("laboratory", "brood")
	)
	_add_hotspot(
		room, Rect2(1425, 265, 345, 435), "Concord Relic", "Relic Resonance Track",
		Vector2(0, 218), Vector2(0, 10), func(): open_console("laboratory", "concord")
	)

func _add_hotspot(
	parent: Control, rect: Rect2, title: String, subtitle: String,
	label_off: Vector2, target_off: Vector2, callback: Callable
) -> Control:
	var hs := ConsoleTheme.HubCalloutHotspot.new()
	hs.position = rect.position
	hs.size = rect.size
	hs.callout_title = title
	hs.callout_subtitle = subtitle
	hs.label_offset = label_off
	hs.target_offset = target_off
	hs.pressed.connect(callback)
	parent.add_child(hs)
	return hs

func _build_top_hud() -> void:
	# Top-left translucent emerald command strip (matching Image 4!)
	var top_left := PanelContainer.new()
	top_left.position = Vector2(10, 8)
	top_left.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.02, 0.11, 0.06, 0.84), Color("#2d8a4b"), 1, 2, 10, 4))
	add_child(top_left)

	var tl_row := HBoxContainer.new()
	tl_row.add_theme_constant_override("separation", 8)
	top_left.add_child(tl_row)

	var ms_btn := _top_link_button("Mission Select (M)", func(): open_console("mission_select"))
	tl_row.add_child(ms_btn)
	_sep(tl_row)
	tl_row.add_child(_top_link_button("Cutscenes (C)", func(): open_console("cutscenes")))
	_sep(tl_row)
	_top_mutator_btn = _top_link_button("Mutators (0)", func(): open_console("mutators"))
	tl_row.add_child(_top_mutator_btn)
	_sep(tl_row)
	tl_row.add_child(_top_link_button("Main Menu (Esc)", func(): back_to_title.emit()))

	# Top-right beveled emerald Credits readout (matching "Credits: 270,000" in Images 3 & 4!)
	var credits_panel := PanelContainer.new()
	credits_panel.position = Vector2(1602, 8)
	credits_panel.size = Vector2(306, 42)
	credits_panel.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.03, 0.14, 0.07, 0.92), Color("#39d966"), 2, 2, 14, 6))
	add_child(credits_panel)

	var cr_row := HBoxContainer.new()
	credits_panel.add_child(cr_row)

	var cr_tag := Label.new()
	cr_tag.text = "Credits:"
	cr_tag.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cr_tag.add_theme_font_override("font", ConsoleTheme.title_font())
	cr_tag.add_theme_font_size_override("font_size", 18)
	cr_tag.add_theme_color_override("font_color", Color("#90f5ac"))
	cr_row.add_child(cr_tag)

	_credits_label = Label.new()
	_credits_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_credits_label.add_theme_font_override("font", ConsoleTheme.title_font())
	_credits_label.add_theme_font_size_override("font_size", 20)
	_credits_label.add_theme_color_override("font_color", Color("#ffffff"))
	cr_row.add_child(_credits_label)

	_research_pill = Label.new()
	_research_pill.position = Vector2(1602, 54)
	_research_pill.size = Vector2(306, 22)
	_research_pill.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_research_pill.add_theme_font_override("font", ConsoleTheme.body_font())
	_research_pill.add_theme_font_size_override("font_size", 14)
	_research_pill.add_theme_color_override("font_color", Color("#7be6ff"))
	_research_pill.add_theme_color_override("font_outline_color", Color("#030a08"))
	_research_pill.add_theme_constant_override("outline_size", 3)
	add_child(_research_pill)

func _top_link_button(label_text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.flat = true
	b.text = label_text
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_override("font", ConsoleTheme.body_font())
	b.add_theme_font_size_override("font_size", 15)
	b.add_theme_color_override("font_color", Color("#a9f0bd"))
	b.add_theme_color_override("font_hover_color", Color.WHITE)
	b.pressed.connect(cb)
	return b

func _sep(parent: Container) -> void:
	var s := Label.new()
	s.text = "|"
	s.add_theme_color_override("font_color", Color("#2d7a47"))
	parent.add_child(s)

func _build_bottom_nav() -> void:
	# Iconic 4-tab metallic emerald bottom navigation bar ("Armory | Bridge | Cantina | Laboratory")
	var bar_housing := PanelContainer.new()
	bar_housing.position = Vector2(526, 1020)
	bar_housing.size = Vector2(868, 54)
	var shell_style := ConsoleTheme.style_box(Color("#252d30"), Color("#687980"), 2, 4, 8, 6)
	bar_housing.add_theme_stylebox_override("panel", shell_style)
	add_child(bar_housing)

	var tabs_row := HBoxContainer.new()
	tabs_row.add_theme_constant_override("separation", 6)
	bar_housing.add_child(tabs_row)

	for room_id in ROOM_ORDER:
		var btn := Button.new()
		btn.toggle_mode = true
		btn.text = ROOM_TITLES[room_id]
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.custom_minimum_size.y = 40
		ConsoleTheme.apply_emerald_button(btn, 19, false)
		btn.pressed.connect(switch_room.bind(room_id))
		tabs_row.add_child(btn)
		_nav_buttons[room_id] = btn

	# Bottom-right compact utility buttons (matching Image 3!)
	var right_cluster := PanelContainer.new()
	right_cluster.position = Vector2(1706, 1024)
	right_cluster.size = Vector2(202, 48)
	right_cluster.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#1f272a"), Color("#56666d"), 2, 3, 6, 5))
	add_child(right_cluster)

	var rc_row := HBoxContainer.new()
	rc_row.add_theme_constant_override("separation", 6)
	right_cluster.add_child(rc_row)

	var log_btn := Button.new()
	log_btn.text = "?"
	log_btn.tooltip_text = "Expedition Summary"
	log_btn.custom_minimum_size = Vector2(40, 36)
	ConsoleTheme.apply_emerald_button(log_btn, 17, false)
	log_btn.pressed.connect(_show_service_record)
	rc_row.add_child(log_btn)

	var snd_btn := Button.new()
	snd_btn.text = "♪"
	snd_btn.tooltip_text = "Soundtrack Info"
	snd_btn.custom_minimum_size = Vector2(40, 36)
	ConsoleTheme.apply_emerald_button(snd_btn, 17, false)
	snd_btn.pressed.connect(_pulse_jukebox)
	rc_row.add_child(snd_btn)

	var menu_btn := Button.new()
	menu_btn.text = "Menu"
	menu_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu_btn.custom_minimum_size.y = 36
	ConsoleTheme.apply_emerald_button(menu_btn, 17, false)
	menu_btn.pressed.connect(func(): back_to_title.emit())
	rc_row.add_child(menu_btn)

func _build_toast() -> void:
	_toast_panel = PanelContainer.new()
	_toast_panel.position = Vector2(490, 916)
	_toast_panel.size = Vector2(940, 88)
	_toast_panel.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.02, 0.08, 0.05, 0.94), Color("#3ee86c"), 2, 3, 18, 10))
	_toast_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_panel.hide()
	add_child(_toast_panel)

	var vb := VBoxContainer.new()
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_theme_constant_override("separation", 3)
	_toast_panel.add_child(vb)

	_toast_speaker = Label.new()
	_toast_speaker.add_theme_font_override("font", ConsoleTheme.title_font())
	_toast_speaker.add_theme_font_size_override("font_size", 15)
	_toast_speaker.add_theme_color_override("font_color", Color("#5dff87"))
	vb.add_child(_toast_speaker)

	_toast_body = Label.new()
	_toast_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_toast_body.add_theme_font_override("font", ConsoleTheme.body_font())
	_toast_body.add_theme_font_size_override("font_size", 17)
	_toast_body.add_theme_color_override("font_color", Color("#eaf9ef"))
	vb.add_child(_toast_body)

func _show_toast(speaker: String, body: String, duration: float = 6.0) -> void:
	_toast_speaker.text = speaker
	_toast_body.text = body
	_toast_timer = duration
	_toast_panel.show()

func _build_consoles() -> void:
	mission_console = MissionConsole.new()
	mission_console.showcase = showcase
	mission_console.hide()
	mission_console.launch_requested.connect(func(idx: int, diff: String):
		launch_mission.emit(idx, diff, selected_mutators()))
	mission_console.mutators_requested.connect(func(): open_console("mutators"))
	mission_console.closed.connect(close_console)
	add_child(mission_console)

	tech_console = TechConsole.new()
	tech_console.showcase = showcase
	tech_console.hide()
	tech_console.state_changed.connect(refresh_hub_state)
	tech_console.mutators_changed.connect(refresh_hub_state)
	tech_console.cutscene_requested.connect(trigger_cutscene)
	tech_console.closed.connect(close_console)
	add_child(tech_console)

	cutscene_theater = CutsceneTheater.new()
	cutscene_theater.play_internal_voice = true
	add_child(cutscene_theater)

func trigger_cutscene(cutscene_id: String, ctx: Dictionary = {}) -> void:
	if cutscene_theater == null:
		return
	mission_console.stop_audio()
	if ctx.has("mission_index"):
		cutscene_theater.play_movie_spec(CutsceneData.mission_intro_movie(int(ctx.mission_index)), true)
	else:
		cutscene_theater.play_movie_spec(CutsceneData.hub_cutscene(cutscene_id, ctx), true)

func check_milestone_cutscene() -> void:
	var milestone := CutsceneData.pending_milestone_cutscene()
	if not milestone.is_empty():
		trigger_cutscene(milestone)

func open_hub() -> void:
	close_console()
	switch_room("bridge", false)
	refresh_hub_state()
	if _quick_deploy_btn:
		_quick_deploy_btn.grab_focus()

func switch_room(room_id: String, allow_room_cutscene: bool = true) -> void:
	if not _rooms.has(room_id):
		return
	close_console()
	current_room = room_id
	_toast_panel.hide()
	for id in _rooms:
		_rooms[id].visible = (id == room_id)
	for id in _nav_buttons:
		var active: bool = str(id) == room_id
		_nav_buttons[id].set_pressed_no_signal(active)
		ConsoleTheme.apply_emerald_button(_nav_buttons[id], 19, active)
	refresh_hub_state()
	if allow_room_cutscene and is_visible_in_tree():
		var intro_map := {"armory": "armory_intro", "cantina": "cantina_intro", "laboratory": "lab_intro"}
		if intro_map.has(room_id) and not CutsceneData.has_seen(intro_map[room_id]):
			trigger_cutscene(intro_map[room_id])

func open_console(kind: String, arg1: String = "", arg2: String = "") -> void:
	if cutscene_theater and cutscene_theater.is_playing:
		cutscene_theater.skip()
	_toast_panel.hide()
	mission_console.stop_audio()
	mission_console.hide()
	tech_console.hide()
	active_console = kind
	match kind:
		"mission_select":
			mission_console.refresh_progress(selected_mutators().size())
			mission_console.show()
			mission_console.launch_button.grab_focus()
		"armory", "tech_purchase":
			active_console = "tech_purchase"
			tech_console.open_armory(arg1, arg2)
		"cantina", "mercenaries":
			active_console = "mercenaries"
			tech_console.open_mercenaries()
		"laboratory":
			tech_console.open_laboratory(arg1 if not arg1.is_empty() else "brood")
		"mutators":
			tech_console.open_mutators()
		"cutscenes":
			tech_console.open_cutscenes()
		_:
			active_console = ""

func close_console() -> void:
	if mission_console:
		mission_console.stop_audio()
		mission_console.hide()
	if tech_console:
		tech_console.hide()
	active_console = ""
	refresh_hub_state()
	if is_visible_in_tree() and _quick_deploy_btn and current_room == "bridge":
		_quick_deploy_btn.grab_focus()

func handle_escape() -> bool:
	if cutscene_theater and cutscene_theater.is_playing:
		cutscene_theater.skip()
		return true
	if not active_console.is_empty():
		close_console()
		return true
	return false

func handle_shortcut(keycode: int) -> bool:
	if cutscene_theater and cutscene_theater.is_playing:
		if keycode in [KEY_SPACE, KEY_ENTER]:
			cutscene_theater.skip()
			return true
		return false
	if not active_console.is_empty():
		return false
	if keycode == KEY_M:
		open_console("mission_select")
		return true
	if keycode == KEY_C:
		open_console("cutscenes")
		return true
	return false

func refresh_hub_state() -> void:
	if _credits_label:
		_credits_label.text = HubData.format_credits(HubData.credits_available())
	var totals := HubData.research_totals()
	if _research_pill:
		_research_pill.text = "Brood Research: %d   ·   Concord Research: %d" % [int(totals.brood), int(totals.concord)]
	var mut_count := selected_mutators().size()
	if _top_mutator_btn:
		_top_mutator_btn.text = "Mutators (%d)" % mut_count
	if mission_console:
		mission_console.refresh_progress(mut_count)
		var next_idx: int = mission_console.selected_index
		var m_title: String = Campaign.MISSIONS[next_idx].title
		if _quick_deploy_title:
			_quick_deploy_title.text = "%02d · %s" % [next_idx + 1, m_title]
		if _bridge_map_hotspot:
			_bridge_map_hotspot.callout_subtitle = "%02d · %s" % [next_idx + 1, m_title]
			_bridge_map_hotspot.queue_redraw()

func _trigger_quick_deploy() -> void:
	mission_console.refresh_progress(selected_mutators().size())
	var idx: int = mission_console.selected_index
	var diff: String = Campaign.DIFFICULTIES[mission_console.difficulty_picker.selected]
	launch_mission.emit(idx, diff, selected_mutators())

func set_launch_error(err: String) -> void:
	if mission_console and mission_console.visible:
		mission_console.set_error(err)
	else:
		_show_toast("COMMAND ALERT", err, 5.0)

func selected_mutators() -> Array:
	return tech_console.selected_mutators() if tech_console else []

func current_difficulty() -> String:
	if mission_console and mission_console.difficulty_picker:
		return Campaign.DIFFICULTIES[mission_console.difficulty_picker.selected]
	return "normal"

func unlocked_missions() -> Array:
	var completed := Campaign.completed_missions()
	var res := []
	for idx in Campaign.MISSIONS.size():
		res.append(Campaign.mission_available(idx, completed))
	return res

func apply_control(request: Dictionary) -> void:
	if request.get("skip_cutscene", false) and cutscene_theater and cutscene_theater.is_playing:
		cutscene_theater.skip()
	if request.has("hub_room"):
		switch_room(str(request.hub_room), bool(request.get("auto_cutscene", true)))
	if request.has("hub_mission") and mission_console:
		mission_console._select_mission(int(request.hub_mission))
	if request.has("hub_console"):
		var c := str(request.hub_console)
		if c.is_empty() or c == "none":
			close_console()
		else:
			open_console(c, str(request.get("hub_category", "")), str(request.get("hub_unit", "")))
	if request.has("play_cutscene"):
		trigger_cutscene(str(request.play_cutscene), request.get("cutscene_ctx", {}))

func _speak_rook() -> void:
	var line: String = ROOK_LINES[_rook_cursor % ROOK_LINES.size()]
	_rook_cursor += 1
	_show_toast("CORPORAL ROOK  ·  CANTINA TABLE", line, 7.0)

func _cycle_news_broadcast() -> void:
	if _news_cursor < 0:
		_news_cursor = mini(Campaign.completed_missions().size(), HubData.NEWS_HEADLINES.size() - 1)
	else:
		_news_cursor = (_news_cursor + 1) % HubData.NEWS_HEADLINES.size()
	var item: Array = HubData.NEWS_HEADLINES[_news_cursor]
	_show_toast("FRONTIER BROADCAST NETWORK  ·  " + str(item[0]), str(item[1]), 8.0)

func _pulse_jukebox() -> void:
	RTSMusic.seek_for_capture(18.0)
	_show_toast("CANTINA JUKEBOX", "Now Playing: %s  ·  Master %d%%" % [RTSMusic.CREDIT, RTSMusic.volume_percent], 5.0)

func _show_service_record() -> void:
	var done := Campaign.completed_missions().size()
	var bought := HubData.purchased_techs().size()
	var hired := HubData.hired_mercenaries().size()
	_show_toast(
		"MERIDIAN GUARD  ·  ASHFALL SIGNAL SERVICE RECORD",
		"Missions Cleared: %d / %d   ·   Armory Upgrades: %d   ·   Chartered Squads: %d   ·   Treasury: %s Cr" % [
			done, Campaign.MISSIONS.size(), bought, hired, HubData.format_credits(HubData.credits_available())
		],
		7.0
	)
