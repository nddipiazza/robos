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
const HubState = preload("res://scripts/campaign/RTSHubState.gd")
const HubStage3D = preload("res://scripts/campaign/RTSHubStage3D.gd")
const ProphecyConsole = preload("res://scripts/campaign/RTSProphecyConsole.gd")

const ROOM_ORDER := ["armory", "bridge", "cantina", "laboratory"]
const ROOM_TITLES := {
	"armory": "Armory",
	"bridge": "Bridge",
	"cantina": "Cantina",
	"laboratory": "Laboratory",
}

var current_room := "bridge"
var active_console := ""
var last_hub_voice_cue := ""
var warp_transit_view := false

var showcase: Node
var stage_3d: Control
var mission_console: Control
var tech_console: Control
var prophecy_console: Control
var cutscene_theater: Control
var _hub_voice: AudioStreamPlayer
var jukebox_console: Control

var _rooms: Dictionary = {}
var _nav_buttons: Dictionary = {}
var _bar_housing: PanelContainer
var _stage_header_title: Label
var _stage_header_sub: Label
var _warp_btn: Button
var _credits_label: Label
var _research_pill: Label
var _top_mutator_btn: Button
var _bridge_map_hotspot: Control
var _cantina_job_hotspot: Control
var _quick_dock: HBoxContainer
var _quick_deploy_title: Label
var _quick_deploy_btn: Button
var _opening_launch_pending := false
var _hotspot_signature := ""
var _toast_panel: PanelContainer
var _toast_speaker: Label
var _toast_body: Label
var _toast_timer := 0.0

func _ready() -> void:
	visibility_changed.connect(func():
		if not is_visible_in_tree():
			_stop_jukebox_if_supported()
		if stage_3d:
			stage_3d.set_active(is_visible_in_tree() and active_console.is_empty()))
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	showcase = Showcase3D.new()
	add_child(showcase)

	var backdrop_base := ColorRect.new()
	backdrop_base.color = Color("#05090d")
	backdrop_base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop_base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(backdrop_base)

	stage_3d = HubStage3D.new()
	add_child(stage_3d)

	_build_rooms()
	_build_top_hud()
	_build_bottom_nav()
	_build_toast()
	_build_audio()
	_build_consoles()

	switch_room("bridge", false)
	set_process(true)

func _process(delta: float) -> void:
	if _toast_timer > 0.0:
		_toast_timer -= delta
		if _toast_timer <= 0.0 and _toast_panel:
			_toast_panel.hide()

func _build_rooms() -> void:
	for room_id in ROOM_ORDER:
		var layer := Control.new()
		layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer.hide()
		add_child(layer)
		_rooms[room_id] = layer

func _clear_layer(layer: Control) -> void:
	for child in layer.get_children():
		layer.remove_child(child)
		child.queue_free()

func _rebuild_room_hotspots(snap: Dictionary) -> void:
	var sig := "%s|st:%d|sub:%d|rel:%d|br:%d|lira:%s|ner:%s|cov:%s|voss:%s|kn:%s|ard:%s|u:%s|tr:%s" % [
		str(snap.macro_location), int(snap.stage_num), int(snap.saloon_substage),
		int(snap.relic_pieces), int(snap.brood_stage), str(snap.lira_present), str(snap.neral_crystal),
		str(snap.covert_mode), str(snap.voss_in_cantina), str(snap.voss_knife_trophy), str(snap.arden_comm),
		JSON.stringify(snap.armory_units.map(func(x): return x.unlocked)), JSON.stringify(snap.trophies),
	]
	if sig == _hotspot_signature:
		return
	_hotspot_signature = sig
	_bridge_map_hotspot = null
	_cantina_job_hotspot = null
	for room_id in ROOM_ORDER:
		_clear_layer(_rooms[room_id])

	var macro := str(snap.macro_location)
	if macro == "vesper_saloon":
		_populate_vesper_saloon(_rooms["cantina"], snap)
		_populate_bridge_ship(_rooms["bridge"], snap)
	elif macro == "cinderfall_camp":
		_populate_cinderfall_camp(snap)
	else:
		_populate_bridge_ship(_rooms["bridge"], snap)
		_populate_armory_ship(_rooms["armory"], snap)
		_populate_cantina_ship(_rooms["cantina"], snap)
		_populate_lab_ship(_rooms["laboratory"], snap)

# -----------------------------------------------------------------------------
# STAGE 1 HOTSPOTS: VESPER OUTPOST SALOON (Single-Room Frontier Hub)
# -----------------------------------------------------------------------------
func _populate_vesper_saloon(room: Control, snap: Dictionary) -> void:
	_cantina_job_hotspot = _add_hotspot(
		room, Rect2(1430, 520, 360, 290), "Job Board", "Select Operation",
		Vector2(-75, -110), Vector2(0, -15), func(): open_console("mission_select")
	)
	_add_hotspot(
		room, Rect2(980, 120, 320, 210), "Frontier News", "FRN Special Broadcast",
		Vector2(85, 105), Vector2(10, 20), func():
			HubState.mark_news_seen()
			trigger_cutscene("frn_broadcast")
	)
	_add_hotspot(
		room, Rect2(220, 260, 250, 320), "Jukebox", "Saloon Rock & Blues",
		Vector2(65, -95), Vector2(0, -10), _pulse_jukebox
	)
	_add_hotspot(
		room, Rect2(1060, 380, 220, 260), "Marshal Badge", "Captain Vale's Star",
		Vector2(45, -105), Vector2(0, -10), func(): _speak_ephemeral("marshal_badge")
	)
	if int(snap.saloon_substage) >= 1:
		var sub_lbl := "Artifact Crate & Extraction" if int(snap.saloon_substage) >= 2 else "White Ridge Contract"
		_add_hotspot(
			room, Rect2(560, 440, 310, 340), "Corporal Rook", sub_lbl,
			Vector2(-65, -125), Vector2(0, -25), func(): _speak_ephemeral("rook_saloon")
		)
	_add_hotspot(
		room, Rect2(1480, 95, 330, 175), "Cinema Archive", "Replay Cutscenes",
		Vector2(-45, 95), Vector2(0, 15), func(): open_console("cutscenes")
	)

# -----------------------------------------------------------------------------
# STAGES 2–6 HOTSPOTS: MSV STARFALL FLAGSHIP (Bridge, Armory, Cantina, Lab)
# -----------------------------------------------------------------------------
func _populate_bridge_ship(room: Control, snap: Dictionary) -> void:
	_bridge_map_hotspot = _add_hotspot(
		room, Rect2(680, 460, 390, 340), "Mission Console", "Sector Star Map",
		Vector2(0, -155), Vector2(0, -20), func(): open_console("mission_select")
	)
	_add_hotspot(
		room, Rect2(1095, 380, 230, 310), "Captain Vale", "Strategic Briefing",
		Vector2(75, -120), Vector2(-10, -30), func(): trigger_cutscene("bridge_vale")
	)
	_add_hotspot(
		room, Rect2(430, 390, 220, 290), "Pilot Sable", "Orbital Telemetry",
		Vector2(-75, -118), Vector2(10, -25), func(): _speak_sable_or_briefing(snap)
	)
	_add_hotspot(
		room, Rect2(120, 470, 270, 310), "Mission Archive", "Battle Reports & Replays",
		Vector2(45, -125), Vector2(0, -15), func():
			if "archive_mode" in mission_console:
				mission_console.set("archive_mode", true)
			open_console("mission_select")
	)
	_add_hotspot(
		room, Rect2(1360, 560, 330, 220), "Mutator Matrix", "Tactical Modifiers",
		Vector2(15, -95), Vector2(-15, 10), func(): open_console("mutators")
	)
	if bool(snap.arden_comm):
		_add_hotspot(
			room, Rect2(1380, 170, 340, 260), "Marshal Arden", "Incoming Fleet Hololink",
			Vector2(-55, 118), Vector2(0, 15), func():
				HubState.mark_arden_comm_heard()
				trigger_cutscene("arden_bridge_comm")
		)

func _populate_armory_ship(room: Control, snap: Dictionary) -> void:
	_add_hotspot(
		room, Rect2(760, 575, 290, 285), "Armory Console", "Tech Purchase",
		Vector2(-10, -135), Vector2(0, -20), func(): open_console("armory")
	)
	_add_hotspot(
		room, Rect2(1070, 540, 235, 305), "Quartermaster Vane", "Bay 07 Cutscene",
		Vector2(65, -130), Vector2(-10, -35), func(): trigger_cutscene("armory_intro")
	)

	# Dynamic 3D Floor & Rafter Spawns — only unlocked units appear as interactive bays!
	var unit_rects := {
		"torchguard": Rect2(260, 430, 210, 220),
		"ridge_scout": Rect2(120, 590, 210, 230),
		"breacher": Rect2(1490, 560, 230, 250),
		"cinder_runner": Rect2(290, 295, 220, 130),
		"rail_skimmer": Rect2(530, 250, 230, 140),
		"warden_walker": Rect2(1320, 290, 230, 190),
		"howitzer": Rect2(1520, 390, 240, 165),
		"atlas_walker": Rect2(820, 200, 280, 240),
		"kestrel_interceptor": Rect2(440, 105, 240, 135),
		"rampart_transport": Rect2(1210, 105, 250, 145),
		"night_harrier": Rect2(695, 78, 210, 115),
		"dreadnought": Rect2(1015, 68, 210, 120),
	}
	var arm_units: Array = snap.armory_units
	for slot_v in arm_units:
		var slot: Dictionary = slot_v
		if not bool(slot.unlocked):
			continue
		var uid := str(slot.unit_id)
		if not unit_rects.has(uid):
			continue
		var cat := str(slot.cat)
		var u_rect: Rect2 = unit_rects[uid]
		var l_off := Vector2(0, -78)
		if uid == "night_harrier":
			l_off = Vector2(-95, 42)
		elif uid == "dreadnought":
			l_off = Vector2(95, 42)
		_add_hotspot(
			room, u_rect, str(slot.title), str(slot.subtitle),
			l_off, Vector2(0, 0), func(): open_console("armory", cat, uid)
		)

	var cov := str(snap.covert_mode)
	if cov == "voss_cloak":
		_add_hotspot(
			room, Rect2(55, 380, 195, 200), "Agent Voss", "Cloaked Covert Gear",
			Vector2(45, -85), Vector2(0, 0), func(): _speak_ephemeral("voss")
		)
	elif cov == "specter_rig":
		_add_hotspot(
			room, Rect2(55, 380, 195, 200), "Specter Rig", "Psionic Ordnance",
			Vector2(45, -85), Vector2(0, 0), func(): open_console("armory", "infantry", "rifleman")
		)

func _populate_cantina_ship(room: Control, snap: Dictionary) -> void:
	_add_hotspot(
		room, Rect2(310, 620, 360, 260), "Mercenaries", "Contract Board",
		Vector2(45, -108), Vector2(0, -12), func(): open_console("cantina")
	)
	_add_hotspot(
		room, Rect2(740, 430, 280, 370), "Corporal Rook", "Cantina Cutscene",
		Vector2(-55, -145), Vector2(0, -35), func(): trigger_cutscene("cantina_rook")
	)
	_add_hotspot(
		room, Rect2(950, 110, 340, 220), "Frontier News", "Live Sector Broadcast",
		Vector2(75, 108), Vector2(10, 20), func():
			HubState.mark_news_seen()
			trigger_cutscene("frn_broadcast")
	)
	_add_hotspot(
		room, Rect2(580, 220, 210, 210), "Jukebox", "Bloodlines Audio",
		Vector2(-65, -75), Vector2(0, 0), _pulse_jukebox
	)
	_add_hotspot(
		room, Rect2(85, 420, 220, 310), "Starfall Arcade", "Fighter High Scores",
		Vector2(45, -110), Vector2(0, -15), func(): _speak_ephemeral("arcade")
	)
	if bool(snap.voss_in_cantina):
		_add_hotspot(
			room, Rect2(1260, 480, 280, 340), "Agent Voss", "Covert Operations",
			Vector2(-35, -125), Vector2(0, -20), func(): _speak_ephemeral("voss")
		)
	elif bool(snap.voss_knife_trophy):
		_add_hotspot(
			room, Rect2(1260, 560, 240, 210), "Combat Knife", "Covert Trophy",
			Vector2(-25, -95), Vector2(0, 0), func(): _speak_ephemeral("trophy_wall")
		)
	_add_hotspot(
		room, Rect2(1420, 130, 360, 290), "Trophy Wall", "Campaign Mementos",
		Vector2(-55, 115), Vector2(0, 0), func(): _speak_ephemeral("trophy_wall")
	)

func _populate_lab_ship(room: Control, snap: Dictionary) -> void:
	_add_hotspot(
		room, Rect2(780, 450, 390, 360), "Dr. Aster", "Research Console",
		Vector2(10, -145), Vector2(0, -20), func(): open_console("laboratory", "brood", "console")
	)
	var b_sub := "Stage %d Xenobiology" % int(snap.brood_stage)
	_add_hotspot(
		room, Rect2(350, 200, 280, 520), "Brood Specimen", b_sub,
		Vector2(0, -165), Vector2(0, -10), func(): open_console("laboratory", "brood", "brood")
	)
	var r_sub := "Relic %d / 5 Pieces" % int(snap.relic_pieces)
	_add_hotspot(
		room, Rect2(1240, 200, 360, 540), "Concord Relic", r_sub,
		Vector2(0, -165), Vector2(0, -10), func(): open_console("laboratory", "concord", "concord")
	)
	if bool(snap.lira_present):
		_add_hotspot(
			room, Rect2(638, 430, 136, 300), "Dr. Lira", "Colonist Envoy",
			Vector2(-55, -125), Vector2(0, -20), func(): _speak_ephemeral("lira")
		)
	if bool(snap.neral_crystal):
		var p_sub := "Prophecy Visions (%d/4)" % int(snap.prophecy_done)
		_add_hotspot(
			room, Rect2(75, 430, 270, 380), "Memory Crystal", p_sub,
			Vector2(45, -135), Vector2(0, -15), func(): open_console("prophecy")
		)

# -----------------------------------------------------------------------------
# STAGE 7 HOTSPOTS: CINDERFALL FORWARD TRENCH CAMP (Volcanic Outdoor Hub!)
# -----------------------------------------------------------------------------
func _populate_cinderfall_camp(snap: Dictionary) -> void:
	# 1. Command Tent (Bridge tab focus)
	_bridge_map_hotspot = _add_hotspot(
		_rooms["bridge"], Rect2(710, 440, 440, 340), "Mission Console", "Cinderfall Tactical Map",
		Vector2(0, -145), Vector2(0, -15), func(): open_console("mission_select")
	)
	_add_hotspot(
		_rooms["bridge"], Rect2(1170, 390, 260, 330), "Marshal Arden", "Surface Invasion Plan",
		Vector2(45, -125), Vector2(0, -20), func(): _speak_ephemeral("arden_camp")
	)
	_add_hotspot(
		_rooms["bridge"], Rect2(200, 420, 310, 320), "Field Depot", "Vane's Ordnance Rig",
		Vector2(0, -120), Vector2(0, -10), func(): open_console("armory")
	)
	_add_hotspot(
		_rooms["bridge"], Rect2(1460, 360, 340, 360), "Charged Relic", "Aster's Relic Generator",
		Vector2(-35, -135), Vector2(0, -15), func(): open_console("laboratory", "concord", "concord")
	)

	# 2. Vane's Field Depot (Armory tab focus)
	_add_hotspot(
		_rooms["armory"], Rect2(680, 430, 460, 380), "Armory Console", "Field Depot Refits",
		Vector2(0, -145), Vector2(0, -15), func(): open_console("armory")
	)
	_add_hotspot(
		_rooms["armory"], Rect2(1170, 430, 290, 340), "Quartermaster Vane", "Ordnance Status",
		Vector2(45, -125), Vector2(0, -20), func(): trigger_cutscene("armory_intro")
	)

	# 3. Drop Zone & Field Radio (Cantina tab focus)
	_add_hotspot(
		_rooms["cantina"], Rect2(540, 470, 420, 360), "Mercenaries", "Orbital Drop Beacon",
		Vector2(0, -135), Vector2(0, -15), func(): open_console("cantina")
	)
	_add_hotspot(
		_rooms["cantina"], Rect2(1040, 450, 380, 340), "Frontier News", "Frontline Field Radio",
		Vector2(35, -125), Vector2(0, -15), func():
			HubState.mark_news_seen()
			trigger_cutscene("frn_broadcast")
	)

	# 4. Mobile Science & Charged Relic Tent (Laboratory tab focus)
	_add_hotspot(
		_rooms["laboratory"], Rect2(430, 440, 360, 360), "Brood Specimen", "Field Xenobiology",
		Vector2(-25, -135), Vector2(0, -15), func(): open_console("laboratory", "brood", "brood")
	)
	_add_hotspot(
		_rooms["laboratory"], Rect2(860, 260, 480, 520), "Concord Relic", "Assembled Relic (5/5)",
		Vector2(0, -175), Vector2(0, -15), func(): open_console("laboratory", "concord", "concord")
	)
	if bool(snap.neral_crystal):
		_add_hotspot(
			_rooms["laboratory"], Rect2(120, 470, 270, 330), "Memory Crystal", "Prophecy Visions",
			Vector2(35, -120), Vector2(0, -10), func(): open_console("prophecy")
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

	# Top-Center Macro Hub Stage & Dynamic Planetary Orbit Telemetry Plate
	var stage_plate := PanelContainer.new()
	stage_plate.position = Vector2(670, 8)
	stage_plate.size = Vector2(580, 52)
	stage_plate.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.02, 0.09, 0.12, 0.86), Color("#3896a8"), 1, 3, 14, 5))
	add_child(stage_plate)

	var sp_row := HBoxContainer.new()
	sp_row.add_theme_constant_override("separation", 10)
	stage_plate.add_child(sp_row)

	var sp_col := VBoxContainer.new()
	sp_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sp_col.add_theme_constant_override("separation", 1)
	sp_row.add_child(sp_col)

	_stage_header_title = Label.new()
	_stage_header_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stage_header_title.add_theme_font_override("font", ConsoleTheme.title_font())
	_stage_header_title.add_theme_font_size_override("font_size", 15)
	_stage_header_title.add_theme_color_override("font_color", Color("#dbf7ff"))
	sp_col.add_child(_stage_header_title)

	_stage_header_sub = Label.new()
	_stage_header_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stage_header_sub.add_theme_font_override("font", ConsoleTheme.body_font())
	_stage_header_sub.add_theme_font_size_override("font_size", 13)
	_stage_header_sub.add_theme_color_override("font_color", Color("#6cf5a6"))
	sp_col.add_child(_stage_header_sub)

	_warp_btn = Button.new()
	_warp_btn.text = "FTL"
	_warp_btn.tooltip_text = "Toggle Bridge Orbit / FTL Warp Transit View"
	_warp_btn.custom_minimum_size = Vector2(54, 34)
	ConsoleTheme.apply_teal_tab_button(_warp_btn, 13)
	_warp_btn.pressed.connect(func():
		warp_transit_view = not warp_transit_view
		refresh_hub_state())
	sp_row.add_child(_warp_btn)

	# Top-right beveled emerald Credits readout
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

	# Persistent lower-right emerald Next Operation / Deploy dock across all staging rooms
	_quick_dock = HBoxContainer.new()
	_quick_dock.position = Vector2(1430, 902)
	_quick_dock.size = Vector2(462, 68)
	_quick_dock.alignment = BoxContainer.ALIGNMENT_END
	_quick_dock.add_theme_constant_override("separation", 12)
	add_child(_quick_dock)

	var text_col := VBoxContainer.new()
	text_col.alignment = BoxContainer.ALIGNMENT_CENTER
	text_col.add_theme_constant_override("separation", 1)
	_quick_dock.add_child(text_col)

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
	_quick_dock.add_child(_quick_deploy_btn)

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
	_bar_housing = PanelContainer.new()
	_bar_housing.position = Vector2(500, 1020)
	_bar_housing.size = Vector2(920, 54)
	var shell_style := ConsoleTheme.style_box(Color("#252d30"), Color("#687980"), 2, 4, 8, 6)
	_bar_housing.add_theme_stylebox_override("panel", shell_style)
	add_child(_bar_housing)

	var tabs_row := HBoxContainer.new()
	tabs_row.add_theme_constant_override("separation", 6)
	_bar_housing.add_child(tabs_row)

	for room_id in ROOM_ORDER:
		var btn := Button.new()
		btn.toggle_mode = true
		btn.text = ROOM_TITLES[room_id]
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.custom_minimum_size.y = 40
		ConsoleTheme.apply_emerald_button(btn, 18, false)
		btn.pressed.connect(switch_room.bind(room_id))
		tabs_row.add_child(btn)
		_nav_buttons[room_id] = btn

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
	_toast_panel.size = Vector2(920, 88)
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

func _show_toast(speaker: String, body: String, duration: float = 6.5) -> void:
	_toast_speaker.text = speaker
	_toast_body.text = body
	_toast_timer = duration
	_toast_panel.show()

func _build_audio() -> void:
	_hub_voice = AudioStreamPlayer.new()
	_hub_voice.bus = "SFX"
	add_child(_hub_voice)
	RTSMusic.watch_campaign_voice(_hub_voice)

func stop_hub_voice() -> void:
	if _hub_voice and _hub_voice.playing:
		_hub_voice.stop()

func stop_all_audio() -> void:
	stop_hub_voice()
	if mission_console:
		mission_console.stop_audio()
	if cutscene_theater:
		cutscene_theater.stop_all_media()

func play_hub_voice(cue_id: String) -> void:
	if cue_id.is_empty():
		return
	var stream := RTSAudio.load_campaign_voice(cue_id)
	if stream == null:
		return
	last_hub_voice_cue = cue_id
	stop_hub_voice()
	if RTSAudio.can_play_campaign_voice():
		_hub_voice.stream = stream
		_hub_voice.play()

func _build_consoles() -> void:
	mission_console = MissionConsole.new()
	mission_console.showcase = showcase
	mission_console.hide()
	mission_console.launch_requested.connect(func(idx: int, diff: String):
		stop_all_audio()
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

	prophecy_console = ProphecyConsole.new()
	prophecy_console.hide()
	prophecy_console.launch_prophecy.connect(func(idx: int, diff: String):
		stop_all_audio()
		launch_mission.emit(idx, diff, selected_mutators()))
	prophecy_console.replay_arrival_requested.connect(func():
		close_console()
		trigger_cutscene("neral_crystal_arrival"))
	prophecy_console.closed.connect(close_console)
	add_child(prophecy_console)

	if ResourceLoader.exists("res://scripts/campaign/RTSJukeboxConsole.gd"):
		var jb_script: Script = load("res://scripts/campaign/RTSJukeboxConsole.gd")
		if jb_script != null:
			jukebox_console = jb_script.new()
			jukebox_console.hide()
			jukebox_console.closed.connect(close_console)
			add_child(jukebox_console)

	cutscene_theater = CutsceneTheater.new()
	cutscene_theater.play_internal_voice = true
	cutscene_theater.movie_finished.connect(_on_hub_movie_finished)
	add_child(cutscene_theater)

func begin_opening_sequence() -> void:
	_opening_launch_pending = true
	switch_room("cantina", false)
	trigger_cutscene("intro_cinematic")
	if cutscene_theater:
		cutscene_theater.set_skip_label("START MISSION 01 ▸")

func _on_hub_movie_finished(movie_id: String, _skipped: bool) -> void:
	if movie_id == "intro_cinematic" and _opening_launch_pending:
		_opening_launch_pending = false
		if DisplayServer.get_name() != "headless":
			SimEngine.set_meta("skip_redundant_m0_movie", true)
			launch_mission.emit(0, current_difficulty(), selected_mutators())
			return
	if stage_3d:
		stage_3d.set_active(active_console.is_empty())
	if is_visible_in_tree() and _quick_deploy_btn and active_console.is_empty():
		_quick_deploy_btn.grab_focus()

func trigger_cutscene(cutscene_id: String, ctx: Dictionary = {}) -> void:
	if cutscene_theater == null:
		return
	stop_hub_voice()
	mission_console.stop_audio()
	if stage_3d:
		stage_3d.set_active(false)
	if ctx.has("mission_index"):
		cutscene_theater.play_movie_spec(CutsceneData.mission_intro_movie(int(ctx.mission_index)), true)
	else:
		cutscene_theater.play_movie_spec(CutsceneData.hub_cutscene(cutscene_id, ctx), true)

func check_milestone_cutscene() -> void:
	var milestone := CutsceneData.pending_milestone_cutscene()
	if not milestone.is_empty():
		trigger_cutscene(milestone)

func open_hub() -> void:
	if "archive_mode" in mission_console:
		mission_console.set("archive_mode", false)
	close_console()
	var snap := HubState.snapshot(warp_transit_view)
	var start_room := "cantina" if str(snap.macro_location) == "vesper_saloon" else "bridge"
	switch_room(start_room, false)
	refresh_hub_state()
	if _quick_deploy_btn:
		_quick_deploy_btn.grab_focus()

func switch_room(room_id: String, allow_room_cutscene: bool = true) -> void:
	if not _rooms.has(room_id):
		return
	var locked := _room_lock_reason(room_id, Campaign.completed_missions())
	if not locked.is_empty():
		_show_toast("COMMAND", locked)
		return
	close_console()
	current_room = room_id
	if room_id != "cantina":
		_stop_jukebox_if_supported()
	_toast_panel.hide()
	for id in _rooms:
		_rooms[id].visible = (id == room_id)
	refresh_hub_state()
	if allow_room_cutscene and is_visible_in_tree():
		var snap := HubState.snapshot(warp_transit_view)
		if str(snap.macro_location) == "cinderfall_camp":
			return
		var intro_map := {"armory": "armory_intro", "cantina": "cantina_intro", "laboratory": "lab_intro"}
		if intro_map.has(room_id) and not CutsceneData.has_seen(intro_map[room_id]):
			trigger_cutscene(intro_map[room_id])

func _room_lock_reason(room_id: String, _completed: Array) -> String:
	return HubState.room_lock_reason(room_id)

func open_console(kind: String, arg1: String = "", arg2: String = "") -> void:
	if cutscene_theater and cutscene_theater.is_playing:
		cutscene_theater.skip()
	stop_hub_voice()
	_toast_panel.hide()
	mission_console.stop_audio()
	mission_console.hide()
	tech_console.hide()
	prophecy_console.hide()
	if jukebox_console:
		jukebox_console.hide()
	active_console = kind
	match kind:
		"mission_select":
			mission_console.refresh_progress(selected_mutators().size())
			mission_console.show()
			mission_console.launch_button.grab_focus()
		"armory", "tech_purchase":
			active_console = "tech_purchase"
			tech_console.open_armory(arg1, arg2)
			var armory_cue := "ui_armory_%s" % arg2 if not arg2.is_empty() else "ui_armory_console"
			if RTSAudio.load_campaign_voice(armory_cue) == null:
				armory_cue = "ui_armory_console"
			play_hub_voice(armory_cue)
		"cantina", "mercenaries":
			active_console = "mercenaries"
			tech_console.open_mercenaries()
			play_hub_voice("ui_cantina_board")
		"laboratory":
			var track := arg1 if not arg1.is_empty() else "brood"
			tech_console.open_laboratory(track)
			var lab_cue := "ui_lab_brood" if arg2 == "brood" else ("ui_lab_concord" if arg2 == "concord" else "ui_lab_console")
			play_hub_voice(lab_cue)
		"prophecy":
			prophecy_console.open_crystal()
			play_hub_voice("neral_crystal_1")
		"mutators":
			tech_console.open_mutators()
			play_hub_voice("ui_mutators")
		"cutscenes":
			tech_console.open_cutscenes()
			play_hub_voice("ui_archive")
		"jukebox":
			if jukebox_console:
				jukebox_console.call("open_player")
			else:
				active_console = ""
				_show_toast("CANTINA JUKEBOX", "NOW PLAYING  ·  STARFALL COMMAND ORIGINAL SOUNDTRACK  (" + RTSMusic.CREDIT + ")", 5.5)
		_:
			active_console = ""
	if stage_3d:
		stage_3d.set_active(active_console.is_empty())
	if _quick_dock:
		_quick_dock.visible = active_console.is_empty()

func close_console() -> void:
	if jukebox_console:
		jukebox_console.hide()
	if prophecy_console:
		prophecy_console.hide()
	if mission_console:
		mission_console.stop_audio()
		if "archive_mode" in mission_console:
			mission_console.set("archive_mode", false)
		mission_console.hide()
	if tech_console:
		tech_console.hide()
	active_console = ""
	if stage_3d:
		stage_3d.set_active(is_visible_in_tree() and (cutscene_theater == null or not cutscene_theater.is_playing))
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
	var snap := HubState.snapshot(warp_transit_view)
	var macro := str(snap.macro_location)
	_rebuild_room_hotspots(snap)
	for id in _rooms:
		_rooms[id].visible = (id == current_room) and active_console.is_empty()
	if stage_3d:
		stage_3d.configure_stage(current_room, snap)

	# Stage 1 (Vesper Saloon) is a single frontier room with no starship room-switcher bar!
	if _bar_housing:
		_bar_housing.visible = (macro != "vesper_saloon")

	var nav_labels := HubState.nav_labels_for_stage(macro)
	var locks: Dictionary = snap.locks
	var alerts: Dictionary = snap.alerts
	for id in _nav_buttons:
		var tab: Button = _nav_buttons[id]
		var locked := str(locks.get(id, ""))
		tab.disabled = not locked.is_empty()
		tab.tooltip_text = locked
		var base_lbl := str(nav_labels.get(id, ROOM_TITLES[id]))
		var has_alert := bool(alerts.get(id, false)) and not tab.disabled
		tab.text = ("%s  !" % base_lbl) if has_alert else base_lbl
		var active: bool = str(id) == current_room and not tab.disabled
		tab.set_pressed_no_signal(active)
		ConsoleTheme.apply_emerald_button(tab, 18, active)
		if has_alert and not active:
			tab.add_theme_color_override("font_color", Color("#ffe066"))
		tab.add_theme_color_override("font_disabled_color", Color("#899199"))
		tab.add_theme_stylebox_override("disabled", ConsoleTheme.style_box(Color("#171c21"), Color("#3b4249"), 1, 3, 18, 8))

	if _stage_header_title:
		_stage_header_title.text = str(snap.stage_title)
	if _stage_header_sub:
		if macro == "vesper_saloon":
			_stage_header_sub.text = "VESPER IV  ·  FRONTIER RESISTANCE SAFEHOUSE"
		elif macro == "cinderfall_camp":
			_stage_header_sub.text = "VOLCANIC SURFACE  ·  MARSHAL ARDEN'S FORWARD CAMP"
		else:
			_stage_header_sub.text = str(snap.orbit.world_label)
	if _warp_btn:
		_warp_btn.visible = (macro == "starfall_ship" and current_room == "bridge")
		_warp_btn.set_pressed_no_signal(warp_transit_view)

	if _credits_label:
		_credits_label.text = HubData.format_credits(HubData.credits_available())
	var totals := HubData.research_totals()
	if _research_pill:
		_research_pill.text = "Brood Research: %d   ·   Concord Research: %d" % [int(totals.brood), int(totals.concord)]
	var mut_count := selected_mutators().size()
	if _top_mutator_btn:
		_top_mutator_btn.text = "Mutators (%d)" % mut_count
	if _quick_dock:
		_quick_dock.visible = active_console.is_empty()
	if mission_console:
		mission_console.refresh_progress(mut_count)
		var next_idx: int = mission_console.selected_index
		var m_title: String = Campaign.MISSIONS[next_idx].title
		if _quick_deploy_title:
			_quick_deploy_title.text = m_title
		if _bridge_map_hotspot:
			_bridge_map_hotspot.callout_subtitle = m_title
			_bridge_map_hotspot.queue_redraw()
		if _cantina_job_hotspot:
			_cantina_job_hotspot.callout_subtitle = m_title
			_cantina_job_hotspot.queue_redraw()

func _speak_ephemeral(speaker_key: String) -> void:
	var snap := HubState.snapshot(warp_transit_view)
	var info := HubState.ephemeral_line(speaker_key, snap)
	if info.is_empty():
		return
	var v := str(info.get("voice", ""))
	if not v.is_empty():
		play_hub_voice(v)
	_show_toast(str(info.get("speaker", "CREW")), str(info.get("line", "")), 7.5)

func _speak_sable_or_briefing(snap: Dictionary) -> void:
	var info := HubState.ephemeral_line("sable", snap)
	if not info.is_empty():
		_show_toast(str(info.speaker), str(info.line), 7.5)
	else:
		_show_toast("PILOT SABLE  ·  STARFALL HELM", "Holding steady in %s. Select any active sector branch on the Star Map when ready for drop." % str(snap.orbit.world_label), 6.5)

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
	if request.is_empty():
		return
	_opening_launch_pending = false
	if request.get("skip_cutscene", false) and cutscene_theater and cutscene_theater.is_playing:
		cutscene_theater.skip()
	if request.has("hub_warp"):
		warp_transit_view = bool(request.hub_warp)
		refresh_hub_state()
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

func _stop_jukebox_if_supported() -> void:
	var music_obj: Object = RTSMusic
	if music_obj.has_method("stop_jukebox"):
		music_obj.call("stop_jukebox")

func _pulse_jukebox() -> void:
	if current_room != "cantina":
		switch_room("cantina")
	open_console("jukebox")
	play_hub_voice("ui_jukebox")

func _show_service_record() -> void:
	play_hub_voice("ui_service_record")
	var snap := HubState.snapshot(warp_transit_view)
	var done := Campaign.completed_missions().size()
	var bought := HubData.purchased_techs().size()
	var hired := HubData.hired_mercenaries().size()
	_show_toast(
		"%s  ·  EXPEDITION SERVICE RECORD" % str(snap.stage_title),
		"Missions: %d / %d   ·   Relic Pieces: %d / 5   ·   Armory Refits: %d   ·   Mercs: %d   ·   Credits: %s" % [
			done, Campaign.MISSIONS.size(), int(snap.relic_pieces), bought, hired, HubData.format_credits(HubData.credits_available())
		],
		7.5
	)
