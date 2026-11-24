extends Control

signal state_changed
signal mutators_changed
signal cutscene_requested(cutscene_id: String, ctx: Dictionary)
signal closed

const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")
const Mutators = preload("res://scripts/engine/RTSCampaignMutators.gd")
const MutatorIcon = preload("res://scripts/RTSMutatorIcon.gd")
const ConsoleTheme = preload("res://scripts/campaign/RTSConsoleTheme.gd")
const CutsceneData = preload("res://scripts/campaign/RTSCutsceneData.gd")

var showcase: Node
var close_button: Button

var _chassis: ConsoleTheme.MonitorChassis
var _mode := "armory"
var _cat_index := 0
var _unit_index := 0
var _upg_index := 0
var _merc_index := 1
var _lab_track := "brood"
var _lab_tier := 0
var _lab_choice := 0

var _upper_area: Control
var _lower_area: Control
var _mutator_area: Control
var _live_host: PanelContainer
var _live_widget: Control

var _cat_buttons: Array[Button] = []
var _columns_box: HBoxContainer
var _detail_title: Label
var _detail_summary: Label
var _detail_desc: Label
var _avail_caption: Label
var _avail_value: Label
var _cost_caption: Label
var _cost_value: Label
var _buy_button: Button
var _status_msg: Label
var _hover_tip: PanelContainer
var _hover_tip_title: Label
var _hover_tip_sub: Label

var _mutator_buttons: Dictionary = {}
var _mutator_count_label: Label
var _archive_area: Control
var _archive_list: GridContainer

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	_chassis = ConsoleTheme.MonitorChassis.new()
	_chassis.mode = ConsoleTheme.MonitorChassis.Mode.TECH_ARMORY
	_chassis.header_title = "TECH PURCHASE"
	_chassis.position = Vector2(90, 30)
	_chassis.size = Vector2(1740, 1020)
	_chassis.screen_rect = Rect2(96, 108, 1516, 818)
	_chassis.split_y = 564.0
	add_child(_chassis)

	_upper_area = Control.new()
	_upper_area.position = Vector2(198, 150)
	_upper_area.size = Vector2(1492, 430)
	add_child(_upper_area)

	_lower_area = Control.new()
	_lower_area.position = Vector2(198, 608)
	_lower_area.size = Vector2(1492, 336)
	add_child(_lower_area)

	_build_lower_deck()
	_build_mutator_deck()
	_build_archive_deck()
	_build_hover_tooltip()

	close_button = Button.new()
	close_button.text = "CLOSE"
	close_button.position = Vector2(1580, 968)
	close_button.size = Vector2(228, 44)
	ConsoleTheme.apply_emerald_button(close_button, 19, false)
	close_button.pressed.connect(func():
		_hide_tip()
		closed.emit())
	add_child(close_button)

	if showcase and not showcase.ready_done:
		showcase.portraits_ready.connect(_rebuild_upper_deck)

func _build_lower_deck() -> void:
	# Left upgrade description well (matching Image 2!)
	var desc_panel := PanelContainer.new()
	desc_panel.position = Vector2(0, 0)
	desc_panel.size = Vector2(566, 332)
	desc_panel.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#060e12"), Color("#2c5c66"), 2, 2, 20, 16))
	_lower_area.add_child(desc_panel)

	var desc_col := VBoxContainer.new()
	desc_col.add_theme_constant_override("separation", 10)
	desc_panel.add_child(desc_col)

	_detail_title = Label.new()
	_detail_title.add_theme_font_override("font", ConsoleTheme.title_font())
	_detail_title.add_theme_font_size_override("font_size", 24)
	_detail_title.add_theme_color_override("font_color", Color("#edf8ff"))
	desc_col.add_child(_detail_title)

	var rule := ColorRect.new()
	rule.custom_minimum_size.y = 2
	rule.color = Color("#24525c")
	desc_col.add_child(rule)

	_detail_summary = Label.new()
	_detail_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_summary.add_theme_font_override("font", ConsoleTheme.title_font())
	_detail_summary.add_theme_font_size_override("font_size", 17)
	_detail_summary.add_theme_color_override("font_color", Color("#4cff76"))
	desc_col.add_child(_detail_summary)

	_detail_desc = Label.new()
	_detail_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_desc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_detail_desc.add_theme_font_override("font", ConsoleTheme.body_font())
	_detail_desc.add_theme_font_size_override("font_size", 16)
	_detail_desc.add_theme_color_override("font_color", Color("#b8d2de"))
	desc_col.add_child(_detail_desc)

	# Center purchase stack ("Credits Available" / "Cost" / "PURCHASE")
	var mid_col := VBoxContainer.new()
	mid_col.position = Vector2(582, 8)
	mid_col.size = Vector2(284, 322)
	mid_col.add_theme_constant_override("separation", 12)
	_lower_area.add_child(mid_col)

	var avail_box := PanelContainer.new()
	avail_box.custom_minimum_size.y = 88
	avail_box.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#071116"), Color("#29535d"), 2, 2, 12, 8))
	mid_col.add_child(avail_box)
	var avail_v := VBoxContainer.new()
	avail_v.alignment = BoxContainer.ALIGNMENT_CENTER
	avail_box.add_child(avail_v)
	_avail_caption = Label.new()
	_avail_caption.text = "Credits Available:"
	_avail_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_avail_caption.add_theme_font_size_override("font_size", 14)
	_avail_caption.add_theme_color_override("font_color", Color("#7ca9b8"))
	avail_v.add_child(_avail_caption)
	_avail_value = Label.new()
	_avail_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_avail_value.add_theme_font_override("font", ConsoleTheme.title_font())
	_avail_value.add_theme_font_size_override("font_size", 28)
	_avail_value.add_theme_color_override("font_color", Color("#eefaff"))
	avail_v.add_child(_avail_value)

	var cost_box := PanelContainer.new()
	cost_box.custom_minimum_size.y = 88
	cost_box.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#071116"), Color("#29535d"), 2, 2, 12, 8))
	mid_col.add_child(cost_box)
	var cost_v := VBoxContainer.new()
	cost_v.alignment = BoxContainer.ALIGNMENT_CENTER
	cost_box.add_child(cost_v)
	_cost_caption = Label.new()
	_cost_caption.text = "Cost:"
	_cost_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cost_caption.add_theme_font_size_override("font_size", 14)
	_cost_caption.add_theme_color_override("font_color", Color("#7ca9b8"))
	cost_v.add_child(_cost_caption)
	_cost_value = Label.new()
	_cost_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cost_value.add_theme_font_override("font", ConsoleTheme.title_font())
	_cost_value.add_theme_font_size_override("font_size", 24)
	_cost_value.add_theme_color_override("font_color", Color("#64f2ff"))
	cost_v.add_child(_cost_value)

	_buy_button = Button.new()
	_buy_button.text = "PURCHASE"
	_buy_button.custom_minimum_size.y = 58
	ConsoleTheme.apply_emerald_button(_buy_button, 21, true)
	_buy_button.pressed.connect(_on_purchase_pressed)
	mid_col.add_child(_buy_button)

	_status_msg = Label.new()
	_status_msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_msg.add_theme_font_size_override("font_size", 14)
	_status_msg.add_theme_color_override("font_color", Color("#ff9488"))
	mid_col.add_child(_status_msg)

	# Right Live 3D Tactical Preview Viewport (matching Image 2!)
	_live_host = PanelContainer.new()
	_live_host.position = Vector2(882, 0)
	_live_host.size = Vector2(610, 332)
	_live_host.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#050d0a"), Color("#347060"), 2, 2, 4, 4))
	_lower_area.add_child(_live_host)

	if showcase:
		_live_widget = showcase.build_live_preview(Vector2i(600, 322))
		_live_host.add_child(_live_widget)

	var preview_tag := Label.new()
	preview_tag.text = "LIVE TACTICAL PREVIEW"
	preview_tag.position = Vector2(898, 10)
	preview_tag.add_theme_font_override("font", ConsoleTheme.title_font())
	preview_tag.add_theme_font_size_override("font_size", 13)
	preview_tag.add_theme_color_override("font_color", Color(0.55, 0.95, 0.72, 0.85))
	_lower_area.add_child(preview_tag)

func _build_mutator_deck() -> void:
	_mutator_area = Control.new()
	_mutator_area.position = Vector2(204, 152)
	_mutator_area.size = Vector2(1480, 790)
	_mutator_area.hide()
	add_child(_mutator_area)

	var header := HBoxContainer.new()
	header.position = Vector2(8, 0)
	header.size = Vector2(1464, 40)
	_mutator_area.add_child(header)

	var title := Label.new()
	title.text = "HAZARD MUTATORS  ·  OPTIONAL CAMPAIGN MODIFIERS"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_override("font", ConsoleTheme.title_font())
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color("#dff5ff"))
	header.add_child(title)

	_mutator_count_label = Label.new()
	_mutator_count_label.add_theme_font_override("font", ConsoleTheme.title_font())
	_mutator_count_label.add_theme_font_size_override("font_size", 18)
	_mutator_count_label.add_theme_color_override("font_color", Color("#4eff78"))
	header.add_child(_mutator_count_label)

	var clear_btn := Button.new()
	clear_btn.text = "CLEAR ALL"
	clear_btn.custom_minimum_size = Vector2(140, 36)
	ConsoleTheme.apply_teal_tab_button(clear_btn, 15)
	clear_btn.pressed.connect(func():
		for id in _mutator_buttons:
			_mutator_buttons[id].button_pressed = false
		_on_mutator_toggled())
	header.add_child(clear_btn)

	var scroll := ScrollContainer.new()
	scroll.position = Vector2(8, 50)
	scroll.size = Vector2(1464, 732)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	_mutator_area.add_child(scroll)

	var entries := VBoxContainer.new()
	entries.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	entries.add_theme_constant_override("separation", 14)
	scroll.add_child(entries)

	var active_grid := GridContainer.new()
	active_grid.columns = 7
	active_grid.add_theme_constant_override("h_separation", 10)
	active_grid.add_theme_constant_override("v_separation", 10)
	entries.add_child(active_grid)

	var initial: Array = SimEngine.campaign.selected_mutators() if SimEngine.campaign != null else []
	for id in Mutators.ACTIVE:
		var info: Array = Mutators.ACTIVE[id]
		var tile := _create_mutator_tile(id, info[0], info[1])
		tile.button_pressed = id in initial
		_mutator_buttons[id] = tile
		tile.toggled.connect(func(_p): _on_mutator_toggled())
		active_grid.add_child(tile)

	var up_lbl := Label.new()
	up_lbl.text = "CLASSIFIED ARCHIVE (UPCOMING MUTATORS)"
	up_lbl.add_theme_font_override("font", ConsoleTheme.title_font())
	up_lbl.add_theme_font_size_override("font_size", 17)
	up_lbl.add_theme_color_override("font_color", Color("#7b9dad"))
	entries.add_child(up_lbl)

	var upcoming_grid := GridContainer.new()
	upcoming_grid.columns = 7
	upcoming_grid.add_theme_constant_override("h_separation", 10)
	upcoming_grid.add_theme_constant_override("v_separation", 10)
	entries.add_child(upcoming_grid)
	for up_title in Mutators.UPCOMING:
		upcoming_grid.add_child(_create_mutator_tile("", up_title, ""))

	_update_mutator_label()

func _create_mutator_tile(id: String, title: String, desc: String) -> Button:
	var avail := not id.is_empty()
	var tile := Button.new()
	tile.custom_minimum_size = Vector2(198, 108 if avail else 76)
	tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tile.toggle_mode = true
	tile.disabled = not avail
	tile.clip_contents = true
	tile.tooltip_text = "%s\n%s" % [title, desc.replace("\n", " ") if avail else "Classified"]
	tile.add_theme_stylebox_override("normal", ConsoleTheme.style_box(Color("#0c1c26"), Color("#2c5163"), 1, 3, 8, 6))
	tile.add_theme_stylebox_override("hover", ConsoleTheme.style_box(Color("#142d3d"), Color("#63b4cc"), 2, 3, 8, 6))
	tile.add_theme_stylebox_override("pressed", ConsoleTheme.style_box(Color("#0f3822"), Color("#48ff73"), 3, 3, 8, 6))
	tile.add_theme_stylebox_override("hover_pressed", ConsoleTheme.style_box(Color("#164a2d"), Color("#8aff9f"), 3, 3, 8, 6))
	tile.add_theme_stylebox_override("disabled", ConsoleTheme.style_box(Color("#09131a"), Color("#1e323d"), 1, 3, 8, 6))

	var body := VBoxContainer.new()
	body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	body.offset_left = 8
	body.offset_right = -8
	body.alignment = BoxContainer.ALIGNMENT_CENTER
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_theme_constant_override("separation", 3)
	tile.add_child(body)

	var icon := MutatorIcon.new()
	icon.kind = id
	icon.custom_minimum_size = Vector2(28, 28)
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(icon)

	var n_lbl := Label.new()
	n_lbl.text = title
	n_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	n_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	n_lbl.add_theme_font_override("font", ConsoleTheme.title_font())
	n_lbl.add_theme_font_size_override("font_size", 14)
	n_lbl.add_theme_color_override("font_color", Color("#ecf8ff") if avail else Color("#6e8796"))
	body.add_child(n_lbl)

	if avail:
		var d_lbl := Label.new()
		d_lbl.text = desc.replace("\n", " ")
		d_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		d_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		d_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		d_lbl.add_theme_font_size_override("font_size", 12)
		d_lbl.add_theme_color_override("font_color", Color("#9cc0d1"))
		body.add_child(d_lbl)
	return tile

func _on_mutator_toggled() -> void:
	_update_mutator_label()
	mutators_changed.emit()

func _update_mutator_label() -> void:
	if _mutator_count_label:
		_mutator_count_label.text = "%d SELECTED" % selected_mutators().size()

func selected_mutators() -> Array:
	return _mutator_buttons.keys().filter(func(id): return _mutator_buttons[id].button_pressed)

func _build_hover_tooltip() -> void:
	_hover_tip = PanelContainer.new()
	_hover_tip.z_index = 40
	_hover_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hover_tip.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.03, 0.08, 0.11, 0.97), Color("#5bd4eb"), 2, 2, 12, 8))
	_hover_tip.hide()
	add_child(_hover_tip)

	var vb := VBoxContainer.new()
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_theme_constant_override("separation", 2)
	_hover_tip.add_child(vb)

	_hover_tip_title = Label.new()
	_hover_tip_title.add_theme_font_override("font", ConsoleTheme.title_font())
	_hover_tip_title.add_theme_font_size_override("font_size", 15)
	_hover_tip_title.add_theme_color_override("font_color", Color.WHITE)
	vb.add_child(_hover_tip_title)

	_hover_tip_sub = Label.new()
	_hover_tip_sub.custom_minimum_size.x = 240
	_hover_tip_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hover_tip_sub.add_theme_font_size_override("font_size", 13)
	_hover_tip_sub.add_theme_color_override("font_color", Color("#65ff8b"))
	vb.add_child(_hover_tip_sub)

func _show_tip(ctrl: Control, title: String, sub: String) -> void:
	_hover_tip_title.text = title
	_hover_tip_sub.text = sub
	_hover_tip.reset_size()
	var gp := ctrl.global_position
	_hover_tip.position = Vector2(clampf(gp.x + 28, 210, 1460), clampf(gp.y - 68, 120, 860))
	_hover_tip.show()

func _hide_tip() -> void:
	if _hover_tip:
		_hover_tip.hide()

func open_armory(category_id: String = "", focus_unit_id: String = "") -> void:
	_mode = "armory"
	_chassis.header_title = "TECH PURCHASE"
	_chassis.split_y = 564.0
	_chassis.queue_redraw()
	_mutator_area.hide()
	_archive_area.hide()
	_upper_area.show()
	_lower_area.show()
	if not category_id.is_empty():
		for c_i in HubData.ARMORY_CATEGORIES.size():
			if HubData.ARMORY_CATEGORIES[c_i].id == category_id:
				_cat_index = c_i
				_unit_index = 0
				_upg_index = 0
				if not focus_unit_id.is_empty():
					var units: Array = HubData.ARMORY_CATEGORIES[c_i].units
					for u_i in units.size():
						if units[u_i].unit_id == focus_unit_id:
							_unit_index = u_i
							break
				break
	_status_msg.text = ""
	show()
	_rebuild_upper_deck()
	close_button.grab_focus()

func open_mercenaries() -> void:
	_mode = "cantina"
	_chassis.header_title = "MERCENARY CONTRACTS"
	_chassis.split_y = 564.0
	_chassis.queue_redraw()
	_mutator_area.hide()
	_archive_area.hide()
	_upper_area.show()
	_lower_area.show()
	_status_msg.text = ""
	show()
	_rebuild_upper_deck()
	close_button.grab_focus()

func open_laboratory(track: String = "brood") -> void:
	_mode = "laboratory"
	_lab_track = track if HubData.LAB_TRACKS.has(track) else "brood"
	_chassis.header_title = "RESEARCH CONSOLE"
	_chassis.split_y = 564.0
	_chassis.queue_redraw()
	_mutator_area.hide()
	_archive_area.hide()
	_upper_area.show()
	_lower_area.show()
	_status_msg.text = ""
	show()
	_rebuild_upper_deck()
	close_button.grab_focus()

func open_mutators() -> void:
	_mode = "mutators"
	_chassis.header_title = "MUTATOR MATRIX"
	_chassis.split_y = 0.0
	_chassis.queue_redraw()
	_upper_area.hide()
	_lower_area.hide()
	_archive_area.hide()
	_mutator_area.show()
	_update_mutator_label()
	show()
	close_button.grab_focus()

func open_cutscenes() -> void:
	_mode = "cutscenes"
	_chassis.header_title = "CINEMA ARCHIVE"
	_chassis.split_y = 0.0
	_chassis.queue_redraw()
	_upper_area.hide()
	_lower_area.hide()
	_mutator_area.hide()
	_rebuild_archive_list()
	_archive_area.show()
	show()
	close_button.grab_focus()

func _build_archive_deck() -> void:
	_archive_area = Control.new()
	_archive_area.position = Vector2(204, 152)
	_archive_area.size = Vector2(1480, 790)
	_archive_area.hide()
	add_child(_archive_area)

	var title := Label.new()
	title.text = "CAMPAIGN CUTSCENES & PRE-MISSION MOVIES"
	title.position = Vector2(8, 0)
	title.add_theme_font_override("font", ConsoleTheme.title_font())
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color("#dff5ff"))
	_archive_area.add_child(title)

	var scroll := ScrollContainer.new()
	scroll.position = Vector2(8, 46)
	scroll.size = Vector2(1464, 736)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_archive_area.add_child(scroll)

	_archive_list = GridContainer.new()
	_archive_list.columns = 3
	_archive_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_archive_list.add_theme_constant_override("h_separation", 12)
	_archive_list.add_theme_constant_override("v_separation", 10)
	scroll.add_child(_archive_list)

func _rebuild_archive_list() -> void:
	for c in _archive_list.get_children():
		c.queue_free()
	for entry in CutsceneData.archive_entries():
		var unlocked: bool = bool(entry.unlocked)
		var card := PanelContainer.new()
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.custom_minimum_size = Vector2(468, 86)
		card.add_theme_stylebox_override("panel", ConsoleTheme.style_box(
			Color("#09161e") if unlocked else Color("#070e13"),
			Color("#2f6878") if unlocked else Color("#1b303a"), 2, 3, 14, 10
		))
		_archive_list.add_child(card)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		card.add_child(row)

		var vb := VBoxContainer.new()
		vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		vb.alignment = BoxContainer.ALIGNMENT_CENTER
		vb.add_theme_constant_override("separation", 2)
		row.add_child(vb)

		var cat_l := Label.new()
		cat_l.text = str(entry.category).to_upper()
		cat_l.add_theme_font_override("font", ConsoleTheme.title_font())
		cat_l.add_theme_font_size_override("font_size", 12)
		cat_l.add_theme_color_override("font_color", Color("#56e885") if unlocked else Color("#526c78"))
		vb.add_child(cat_l)

		var name_l := Label.new()
		name_l.text = str(entry.title)
		name_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		name_l.add_theme_font_override("font", ConsoleTheme.title_font())
		name_l.add_theme_font_size_override("font_size", 16)
		name_l.add_theme_color_override("font_color", Color("#edf8ff") if unlocked else Color("#66818f"))
		vb.add_child(name_l)

		var play_btn := Button.new()
		play_btn.text = "PLAY ▸" if unlocked else "LOCKED"
		play_btn.disabled = not unlocked
		play_btn.custom_minimum_size = Vector2(106, 44)
		play_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		ConsoleTheme.apply_emerald_button(play_btn, 15, unlocked)
		var entry_copy: Dictionary = entry.duplicate()
		play_btn.pressed.connect(func():
			cutscene_requested.emit(str(entry_copy.id), entry_copy))
		row.add_child(play_btn)

func _clear_upper() -> void:
	_hide_tip()
	for child in _upper_area.get_children():
		child.queue_free()

func _rebuild_upper_deck() -> void:
	_clear_upper()
	match _mode:
		"armory": _build_armory_upper()
		"cantina": _build_cantina_upper()
		"laboratory": _build_lab_upper()
	_refresh_lower_deck()

func _build_armory_upper() -> void:
	# Left 5-category stack matching Image 2 ("Base", "Infantry", "Vehicles", "Starships", "Special Ops")
	var left_col := VBoxContainer.new()
	left_col.position = Vector2(0, 8)
	left_col.size = Vector2(228, 412)
	left_col.add_theme_constant_override("separation", 10)
	_upper_area.add_child(left_col)

	_cat_buttons.clear()
	for idx in HubData.ARMORY_CATEGORIES.size():
		var cat: Dictionary = HubData.ARMORY_CATEGORIES[idx]
		var btn := Button.new()
		btn.toggle_mode = true
		btn.button_pressed = (idx == _cat_index)
		btn.text = str(cat.label)
		btn.custom_minimum_size.y = 72
		ConsoleTheme.apply_teal_tab_button(btn, 21)
		btn.pressed.connect(func():
			_cat_index = idx
			_unit_index = 0
			_upg_index = 0
			_status_msg.text = ""
			_rebuild_upper_deck())
		left_col.add_child(btn)
		_cat_buttons.append(btn)

	# Right horizontal unit columns strip
	var frame := PanelContainer.new()
	frame.position = Vector2(244, 0)
	frame.size = Vector2(1248, 424)
	frame.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#040a0e"), Color("#2c5f6b"), 2, 2, 12, 10))
	_upper_area.add_child(frame)

	var outer_v := VBoxContainer.new()
	outer_v.add_theme_constant_override("separation", 6)
	frame.add_child(outer_v)

	var hdr := Label.new()
	hdr.text = "TECH SELECTION  ·  %s" % str(HubData.ARMORY_CATEGORIES[_cat_index].label).to_upper()
	hdr.add_theme_font_override("font", ConsoleTheme.title_font())
	hdr.add_theme_font_size_override("font_size", 14)
	hdr.add_theme_color_override("font_color", Color("#6ca4b5"))
	outer_v.add_child(hdr)

	_columns_box = HBoxContainer.new()
	_columns_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_columns_box.add_theme_constant_override("separation", 10)
	outer_v.add_child(_columns_box)

	var bought := HubData.purchased_techs()
	var units: Array = HubData.ARMORY_CATEGORIES[_cat_index].units
	for u_i in units.size():
		var entry: Dictionary = units[u_i]
		var is_col_sel := (u_i == _unit_index)
		var card := PanelContainer.new()
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var card_style := ConsoleTheme.style_box(
			Color(0.05, 0.16, 0.09, 0.95) if is_col_sel else Color(0.025, 0.06, 0.08, 0.94),
			Color("#44ff68") if is_col_sel else Color("#20444f"),
			3 if is_col_sel else 1, 2, 8, 8
		)
		if is_col_sel:
			card_style.shadow_color = Color(0.22, 1.0, 0.42, 0.35)
			card_style.shadow_size = 10
		card.add_theme_stylebox_override("panel", card_style)
		_columns_box.add_child(card)

		var cv := VBoxContainer.new()
		cv.add_theme_constant_override("separation", 6)
		card.add_child(cv)

		var unit_btn := Button.new()
		unit_btn.flat = true
		unit_btn.text = str(entry.name)
		unit_btn.add_theme_font_override("font", ConsoleTheme.title_font())
		unit_btn.add_theme_font_size_override("font_size", 17)
		unit_btn.add_theme_color_override("font_color", Color("#ffffff") if is_col_sel else Color("#a7cddb"))
		unit_btn.pressed.connect(func():
			_unit_index = u_i
			_status_msg.text = ""
			_rebuild_upper_deck())
		cv.add_child(unit_btn)

		var pic_btn := Button.new()
		pic_btn.flat = true
		pic_btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
		pic_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		pic_btn.pressed.connect(func():
			_unit_index = u_i
			_status_msg.text = ""
			_rebuild_upper_deck())
		cv.add_child(pic_btn)

		var tex_rect := TextureRect.new()
		tex_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		tex_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tex_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tex_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if showcase:
			tex_rect.texture = showcase.get_portrait(str(entry.unit_id))
		pic_btn.add_child(tex_rect)

		# 2 square upgrade icon buttons side-by-side at bottom of unit column!
		var icons_row := HBoxContainer.new()
		icons_row.alignment = BoxContainer.ALIGNMENT_CENTER
		icons_row.add_theme_constant_override("separation", 12)
		cv.add_child(icons_row)

		var upgrades: Array = entry.upgrades
		for up_i in upgrades.size():
			var upg: Dictionary = upgrades[up_i]
			var g_btn := ConsoleTheme.TechIconGlyph.new()
			g_btn.glyph = str(upg.glyph)
			g_btn.purchased = upg.id in bought
			g_btn.selected_slot = is_col_sel and (up_i == _upg_index)
			g_btn.mouse_entered.connect(_show_tip.bind(g_btn, str(upg.name), str(upg.summary)))
			g_btn.mouse_exited.connect(_hide_tip)
			g_btn.pressed.connect(func():
				_unit_index = u_i
				_upg_index = up_i
				_status_msg.text = ""
				_rebuild_upper_deck())
			icons_row.add_child(g_btn)

func _build_cantina_upper() -> void:
	var frame := PanelContainer.new()
	frame.position = Vector2(0, 0)
	frame.size = Vector2(1492, 424)
	frame.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#040a0e"), Color("#2c5f6b"), 2, 2, 14, 10))
	_upper_area.add_child(frame)

	var outer_v := VBoxContainer.new()
	outer_v.add_theme_constant_override("separation", 8)
	frame.add_child(outer_v)

	var hdr := Label.new()
	hdr.text = "MERIDIAN CONTRACT BOARD  ·  ELITE MERCENARY COMPANIES"
	hdr.add_theme_font_override("font", ConsoleTheme.title_font())
	hdr.add_theme_font_size_override("font_size", 15)
	hdr.add_theme_color_override("font_color", Color("#76b4c7"))
	outer_v.add_child(hdr)

	var row := HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	outer_v.add_child(row)

	var hired := HubData.hired_mercenaries()
	for m_i in HubData.MERCENARIES.size():
		var merc: Dictionary = HubData.MERCENARIES[m_i]
		var sel := (m_i == _merc_index)
		var is_hired: bool = merc.id in hired
		var card := PanelContainer.new()
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var st := ConsoleTheme.style_box(
			Color(0.05, 0.16, 0.09, 0.95) if sel else Color(0.025, 0.06, 0.08, 0.94),
			Color("#44ff68") if sel else (Color("#3cc9e8") if is_hired else Color("#20444f")),
			3 if sel else 1, 2, 8, 8
		)
		card.add_theme_stylebox_override("panel", st)
		row.add_child(card)

		var cv := VBoxContainer.new()
		cv.add_theme_constant_override("separation", 6)
		card.add_child(cv)

		var name_lbl := Label.new()
		name_lbl.text = str(merc.name)
		name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		name_lbl.custom_minimum_size.y = 42
		name_lbl.add_theme_font_override("font", ConsoleTheme.title_font())
		name_lbl.add_theme_font_size_override("font_size", 16)
		name_lbl.add_theme_color_override("font_color", Color.WHITE if sel else Color("#b6dce8"))
		cv.add_child(name_lbl)

		var pic_btn := Button.new()
		pic_btn.flat = true
		pic_btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
		pic_btn.pressed.connect(func():
			_merc_index = m_i
			_status_msg.text = ""
			_rebuild_upper_deck())
		cv.add_child(pic_btn)

		var tex := TextureRect.new()
		tex.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tex.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if showcase:
			tex.texture = showcase.get_portrait(str(merc.unit_id))
		pic_btn.add_child(tex)

		var badge := Button.new()
		badge.text = "CHARTERED ✓" if is_hired else ("%s CR" % HubData.format_credits(int(merc.cost)))
		badge.custom_minimum_size.y = 38
		if is_hired:
			ConsoleTheme.apply_teal_tab_button(badge, 14)
		else:
			ConsoleTheme.apply_emerald_button(badge, 14, sel)
		badge.pressed.connect(func():
			_merc_index = m_i
			_status_msg.text = ""
			_rebuild_upper_deck())
		cv.add_child(badge)

func _build_lab_upper() -> void:
	var left_col := VBoxContainer.new()
	left_col.position = Vector2(0, 8)
	left_col.size = Vector2(228, 412)
	left_col.add_theme_constant_override("separation", 14)
	_upper_area.add_child(left_col)

	var totals := HubData.research_totals()
	for pair in [["brood", "Brood Xenobiology\n(%d Samples)" % int(totals.brood)], ["concord", "Concord Relics\n(%d Samples)" % int(totals.concord)]]:
		var t_id: String = pair[0]
		var btn := Button.new()
		btn.toggle_mode = true
		btn.button_pressed = (_lab_track == t_id)
		btn.text = pair[1]
		btn.custom_minimum_size.y = 104
		ConsoleTheme.apply_teal_tab_button(btn, 18)
		btn.pressed.connect(func():
			_lab_track = t_id
			_lab_tier = 0
			_lab_choice = 0
			_status_msg.text = ""
			_rebuild_upper_deck())
		left_col.add_child(btn)

	var frame := PanelContainer.new()
	frame.position = Vector2(244, 0)
	frame.size = Vector2(1248, 424)
	frame.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#040a0e"), Color("#2c5f6b"), 2, 2, 12, 10))
	_upper_area.add_child(frame)

	var outer_v := VBoxContainer.new()
	outer_v.add_theme_constant_override("separation", 8)
	frame.add_child(outer_v)

	var track_data: Dictionary = HubData.LAB_TRACKS[_lab_track]
	var hdr := Label.new()
	hdr.text = "%s  ·  %s" % [str(track_data.title), str(track_data.subtitle)]
	hdr.add_theme_font_override("font", ConsoleTheme.title_font())
	hdr.add_theme_font_size_override("font_size", 14)
	hdr.add_theme_color_override("font_color", track_data.color)
	outer_v.add_child(hdr)

	var row := HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	outer_v.add_child(row)

	var perks := HubData.selected_lab_perks()
	var tiers: Array = track_data.tiers
	var cur_pts := int(totals.get(_lab_track, 0))
	for t_i in tiers.size():
		var tier: Dictionary = tiers[t_i]
		var sel_col := (t_i == _lab_tier)
		var unlocked := cur_pts >= int(tier.points)
		var chosen_id: String = str(perks.get("%s_%d" % [_lab_track, t_i], ""))

		var card := PanelContainer.new()
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.add_theme_stylebox_override("panel", ConsoleTheme.style_box(
			Color(0.05, 0.16, 0.09, 0.95) if sel_col else Color(0.025, 0.06, 0.08, 0.94),
			Color("#44ff68") if sel_col else (track_data.color if unlocked else Color("#20444f")),
			3 if sel_col else 1, 2, 8, 8
		))
		row.add_child(card)

		var cv := VBoxContainer.new()
		cv.alignment = BoxContainer.ALIGNMENT_CENTER
		cv.add_theme_constant_override("separation", 10)
		card.add_child(cv)

		var t_lbl := Label.new()
		t_lbl.text = "TIER %d  ·  %d PTS" % [t_i + 1, int(tier.points)]
		t_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		t_lbl.add_theme_font_override("font", ConsoleTheme.title_font())
		t_lbl.add_theme_font_size_override("font_size", 16)
		t_lbl.add_theme_color_override("font_color", Color.WHITE if unlocked else Color("#6e8c99"))
		cv.add_child(t_lbl)

		var preview_unit: String = str(tier.choices[_lab_choice if sel_col else 0].unit_id)
		var tex := TextureRect.new()
		tex.size_flags_vertical = Control.SIZE_EXPAND_FILL
		tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		if showcase:
			tex.texture = showcase.get_portrait(preview_unit)
		cv.add_child(tex)

		var icons_row := HBoxContainer.new()
		icons_row.alignment = BoxContainer.ALIGNMENT_CENTER
		icons_row.add_theme_constant_override("separation", 12)
		cv.add_child(icons_row)

		for c_i in tier.choices.size():
			var choice: Dictionary = tier.choices[c_i]
			var g_btn := ConsoleTheme.TechIconGlyph.new()
			g_btn.glyph = str(choice.glyph)
			g_btn.purchased = (chosen_id == choice.id)
			g_btn.selected_slot = sel_col and (c_i == _lab_choice)
			g_btn.mouse_entered.connect(_show_tip.bind(g_btn, str(choice.name), str(choice.desc)))
			g_btn.mouse_exited.connect(_hide_tip)
			g_btn.pressed.connect(func():
				_lab_tier = t_i
				_lab_choice = c_i
				_status_msg.text = ""
				_rebuild_upper_deck())
			icons_row.add_child(g_btn)

func _refresh_lower_deck() -> void:
	if _mode == "armory":
		var unit_entry: Dictionary = HubData.ARMORY_CATEGORIES[_cat_index].units[_unit_index]
		var upg: Dictionary = unit_entry.upgrades[_upg_index]
		var bought: bool = str(upg.id) in HubData.purchased_techs()
		var avail := HubData.credits_available()
		var cost := int(upg.cost)

		_detail_title.text = str(upg.name)
		_detail_summary.text = str(upg.summary)
		_detail_desc.text = str(upg.desc)
		_avail_caption.text = "Credits Available:"
		_avail_value.text = HubData.format_credits(avail)
		_cost_caption.text = "Status:" if bought else "Cost:"
		_cost_value.text = "Purchased" if bought else HubData.format_credits(cost)
		_cost_value.add_theme_color_override("font_color", Color("#4cff76") if bought else Color("#64f2ff"))
		_buy_button.text = "PURCHASED" if bought else "PURCHASE"
		_buy_button.disabled = bought or avail < cost
		if showcase:
			showcase.show_live_unit(str(unit_entry.unit_id), bought)

	elif _mode == "cantina":
		var merc: Dictionary = HubData.MERCENARIES[_merc_index]
		var hired: bool = str(merc.id) in HubData.hired_mercenaries()
		var avail := HubData.credits_available()
		var cost := int(merc.cost)

		_detail_title.text = str(merc.name)
		_detail_summary.text = str(merc.squad_label)
		_detail_desc.text = "%s\n\n%s" % [str(merc.summary), str(merc.desc)]
		_avail_caption.text = "Credits Available:"
		_avail_value.text = HubData.format_credits(avail)
		_cost_caption.text = "Contract:" if hired else "Charter Cost:"
		_cost_value.text = "Active" if hired else HubData.format_credits(cost)
		_cost_value.add_theme_color_override("font_color", Color("#4cff76") if hired else Color("#64f2ff"))
		_buy_button.text = "CONTRACTED" if hired else "HIRE SQUAD"
		_buy_button.disabled = hired or avail < cost
		if showcase:
			showcase.show_live_unit(str(merc.unit_id), hired)

	elif _mode == "laboratory":
		var track_data: Dictionary = HubData.LAB_TRACKS[_lab_track]
		var tier: Dictionary = track_data.tiers[_lab_tier]
		var choice: Dictionary = tier.choices[_lab_choice]
		var totals := HubData.research_totals()
		var cur_pts := int(totals.get(_lab_track, 0))
		var req_pts := int(tier.points)
		var perks := HubData.selected_lab_perks()
		var active_id := str(perks.get("%s_%d" % [_lab_track, _lab_tier], ""))
		var is_chosen: bool = active_id == str(choice.id)

		_detail_title.text = str(choice.name)
		_detail_summary.text = "Tier %d %s Adaptation" % [_lab_tier + 1, _lab_track.capitalize()]
		_detail_desc.text = str(choice.desc)
		_avail_caption.text = "%s Samples:" % _lab_track.capitalize()
		_avail_value.text = "%d" % cur_pts
		_cost_caption.text = "Requirement:"
		_cost_value.text = "Active" if is_chosen else ("%d Samples" % req_pts)
		_cost_value.add_theme_color_override("font_color", Color("#4cff76") if is_chosen else track_data.color)
		_buy_button.text = "ACTIVE" if is_chosen else "RESEARCH"
		_buy_button.disabled = is_chosen or cur_pts < req_pts
		if showcase:
			showcase.show_live_unit(str(choice.unit_id), is_chosen)

func _on_purchase_pressed() -> void:
	var res := {}
	var cut_id := ""
	var cut_ctx := {}
	if _mode == "armory":
		var unit_entry: Dictionary = HubData.ARMORY_CATEGORIES[_cat_index].units[_unit_index]
		var upg: Dictionary = unit_entry.upgrades[_upg_index]
		res = HubData.purchase_tech(str(upg.id))
		cut_id = "tech_unlock"
		cut_ctx = {"upg_id": str(upg.id), "unit_id": str(unit_entry.unit_id), "title": str(upg.name), "summary": str(upg.summary)}
	elif _mode == "cantina":
		var merc: Dictionary = HubData.MERCENARIES[_merc_index]
		res = HubData.hire_mercenary(str(merc.id))
		cut_id = "merc_arrival"
		cut_ctx = {"merc_id": str(merc.id), "unit_id": str(merc.unit_id), "title": str(merc.name)}
	elif _mode == "laboratory":
		var choice: Dictionary = HubData.LAB_TRACKS[_lab_track].tiers[_lab_tier].choices[_lab_choice]
		res = HubData.select_lab_perk(_lab_track, _lab_tier, str(choice.id))
		cut_id = "lab_breakthrough"
		cut_ctx = {"perk_id": str(choice.id), "unit_id": str(choice.unit_id), "title": str(choice.name)}

	if bool(res.get("ok", false)):
		RTSAudio.play_ui("match_victory")
		_status_msg.text = ""
		state_changed.emit()
		_rebuild_upper_deck()
		if not cut_id.is_empty():
			cutscene_requested.emit(cut_id, cut_ctx)
	else:
		_status_msg.text = str(res.get("error", "Action unavailable."))
