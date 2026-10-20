extends Control

# MapEditor.gd — Starfall Command Map Editor (scenes/MapEditor.tscn)
# Authors RTS maps/scenarios as `scenarios/<slug>.jsonld` in the exact format SimEngine loads:
# cliff walls, high-ground plateaus, ramps, mineral fields, vespene geysers, unit/structure spawns,
# player factions & starting resources, and RTSCommanderAI directives with target points.
# F5 playtests the map in the 2.5D RTSMain scene; F10 there returns here with undo history intact.
#
# Launch: ./map-editor.sh [slug-or-path]   (automation: GET|POST /editor on the GameControlServer port)

const MapCanvasScript = preload("res://scripts/editor/MapCanvas.gd")

const TOOLS = [
	{"id": "select", "label": "Select / Move", "key": KEY_Q},
	{"id": "obstacles", "label": "Cliff Wall", "key": KEY_W},
	{"id": "high_ground", "label": "High Ground", "key": KEY_E},
	{"id": "ramps", "label": "Ramp", "key": KEY_R},
	{"id": "mineral_field", "label": "Mineral Field", "key": KEY_M},
	{"id": "vespene_geyser", "label": "Vespene Geyser", "key": KEY_G},
	{"id": "unit", "label": "Unit / Structure", "key": KEY_U},
	{"id": "target", "label": "AI Target", "key": KEY_T},
	{"id": "erase", "label": "Erase", "key": KEY_X}
]
const SNAP_OPTIONS = [0.0, 0.5, 1.0, 2.0, 4.0]
const FACTION_LABELS = {"humans": "Humans", "monsters": "Monsters", "aliens": "Aliens"}

var doc: RTSMapDocument
var canvas: Control

var _tool_buttons: Dictionary = {}
var _unit_type_ids: Array[String] = []
var _unit_type_opt: OptionButton
var _unit_owner_opt: OptionButton
var _unit_count_spin: SpinBox
var _unit_spread_spin: SpinBox
var _unit_harvest_chk: CheckBox
var _target_player_opt: OptionButton
var _snap_opt: OptionButton

var _open_opt: OptionButton
var _open_paths: Array[String] = []
var _undo_btn: Button
var _redo_btn: Button

var _map_fields: Dictionary = {}       # key -> Control
var _player_fields: Dictionary = {}    # "pid:key" -> Control
var _directive_fields: Dictionary = {} # "pid:key" -> Control
var _inspector_box: VBoxContainer
var _inspector_fields: Dictionary = {} # key -> Control
var _inspector_ref: Dictionary = {}
var _issues_label: RichTextLabel
var _status_label: Label
var _cursor_label: Label

var _confirm: ConfirmationDialog
var _pending_confirm: Callable

func _ready() -> void:
	SimEngine.paused = true
	_build_ui()

	if SimEngine.editor_session.has("doc"):
		doc = SimEngine.editor_session["doc"]
		SimEngine.editor_session = {}
	else:
		doc = RTSMapDocument.new()
		var start = _cmdline_map_arg()
		if start != "":
			var path = SimEngine.resolve_scenario_path(start)
			if path != "":
				doc.load_file(path)
			else:
				_set_status("Map not found: %s — starting a blank map" % start)
	doc.changed.connect(_on_doc_changed)
	canvas.set_document(doc)
	_refresh_open_list()
	_on_doc_changed()
	_on_selection_changed({})
	_select_tool("select")

func _cmdline_map_arg() -> String:
	var args = OS.get_cmdline_user_args()
	for i in range(args.size()):
		if args[i].begins_with("--map="):
			return args[i].split("=", true, 1)[1]
		if args[i] == "--map" and i + 1 < args.size():
			return args[i + 1]
	return ""

# -------------------------------------------------------------------------
# UI construction
# -------------------------------------------------------------------------

func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var bg = ColorRect.new()
	bg.color = Color("#0b1220")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var root = VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	root.add_child(_build_top_bar())

	var body = HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 0)
	root.add_child(body)

	# The canvas exists before the side panels so their initial values can configure it.
	canvas = MapCanvasScript.new()
	canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	canvas.selection_changed.connect(_on_selection_changed)
	canvas.cursor_moved.connect(_on_cursor_moved)
	canvas.target_picked.connect(_on_target_picked)
	body.add_child(_wrap_panel(_build_tool_panel(), 230))
	body.add_child(canvas)
	body.add_child(_wrap_panel(_build_properties_panel(), 340))

	var status_bar = PanelContainer.new()
	status_bar.add_theme_stylebox_override("panel", _panel_style(Color("#0f172a"), 6))
	var sb = HBoxContainer.new()
	status_bar.add_child(sb)
	_status_label = Label.new()
	_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status_label.add_theme_color_override("font_color", Color("#94a3b8"))
	sb.add_child(_status_label)
	_cursor_label = Label.new()
	_cursor_label.add_theme_color_override("font_color", Color("#38bdf8"))
	sb.add_child(_cursor_label)
	root.add_child(status_bar)

	_confirm = ConfirmationDialog.new()
	_confirm.title = "Map Editor"
	_confirm.confirmed.connect(func(): if _pending_confirm.is_valid(): _pending_confirm.call())
	add_child(_confirm)

func _panel_style(col: Color, margin: int) -> StyleBoxFlat:
	var s = StyleBoxFlat.new()
	s.bg_color = col
	s.content_margin_left = margin
	s.content_margin_right = margin
	s.content_margin_top = margin
	s.content_margin_bottom = margin
	return s

func _wrap_panel(content: Control, width: int) -> Control:
	var panel = PanelContainer.new()
	panel.custom_minimum_size.x = width
	panel.add_theme_stylebox_override("panel", _panel_style(Color("#111a2e"), 10))
	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(content)
	panel.add_child(scroll)
	return panel

func _build_top_bar() -> Control:
	var bar = PanelContainer.new()
	bar.add_theme_stylebox_override("panel", _panel_style(Color("#0f172a"), 8))
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	bar.add_child(h)

	var title = Label.new()
	title.text = "STARFALL COMMAND // MAP EDITOR"
	title.add_theme_color_override("font_color", Color("#00bcd4"))
	h.add_child(title)
	h.add_child(VSeparator.new())

	h.add_child(_button("New", _on_new_pressed, "Ctrl+N"))
	_open_opt = OptionButton.new()
	_open_opt.custom_minimum_size.x = 260
	h.add_child(_open_opt)
	h.add_child(_button("Open", _on_open_pressed))
	h.add_child(_button("Save", _on_save_pressed, "Ctrl+S — writes scenarios/<map id>.jsonld"))
	h.add_child(VSeparator.new())
	_undo_btn = _button("Undo", func(): doc.undo(), "Ctrl+Z")
	_redo_btn = _button("Redo", func(): doc.redo(), "Ctrl+Shift+Z / Ctrl+Y")
	h.add_child(_undo_btn)
	h.add_child(_redo_btn)
	h.add_child(_button("Fit View", func(): canvas.fit_to_view(), "F"))

	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(spacer)
	var play = _button("▶ Playtest (F5)", _playtest, "Load this map into the 2.5D game. Press F10 in-game to come back.")
	play.add_theme_color_override("font_color", Color("#4ade80"))
	h.add_child(play)
	return bar

func _button(text: String, cb: Callable, tip: String = "") -> Button:
	var b = Button.new()
	b.text = text
	b.tooltip_text = tip
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	return b

func _section(parent: Container, text: String) -> void:
	var l = Label.new()
	l.text = text
	l.add_theme_color_override("font_color", Color("#00bcd4"))
	l.add_theme_font_size_override("font_size", 13)
	parent.add_child(l)

func _row(parent: Container, label_text: String, control: Control) -> Control:
	var h = HBoxContainer.new()
	var l = Label.new()
	l.text = label_text
	l.custom_minimum_size.x = 92
	l.add_theme_color_override("font_color", Color("#94a3b8"))
	h.add_child(l)
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(control)
	parent.add_child(h)
	return control

func _spin(min_v: float, max_v: float, step: float, value: float, cb: Callable) -> SpinBox:
	var s = SpinBox.new()
	s.min_value = min_v
	s.max_value = max_v
	s.step = step
	s.value = value
	s.value_changed.connect(cb)
	return s

func _line(cb: Callable) -> LineEdit:
	var e = LineEdit.new()
	e.text_submitted.connect(func(_t): cb.call(e.text))
	e.focus_exited.connect(func(): cb.call(e.text))
	return e

func _build_tool_panel() -> Control:
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	_section(v, "TOOLS")
	var group = ButtonGroup.new()
	for t in TOOLS:
		var b = Button.new()
		b.text = "%s  [%s]" % [t["label"], OS.get_keycode_string(t["key"])]
		b.toggle_mode = true
		b.button_group = group
		b.focus_mode = Control.FOCUS_NONE
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var tool_id: String = t["id"]
		b.pressed.connect(func(): _select_tool(tool_id))
		_tool_buttons[tool_id] = b
		v.add_child(b)

	_snap_opt = OptionButton.new()
	for s in SNAP_OPTIONS:
		_snap_opt.add_item("off" if s == 0.0 else str(s))
	_snap_opt.select(SNAP_OPTIONS.find(1.0))
	_snap_opt.item_selected.connect(func(i): canvas.snap = SNAP_OPTIONS[i])
	_row(v, "Snap", _snap_opt)

	v.add_child(HSeparator.new())
	_section(v, "UNIT BRUSH")
	_unit_type_opt = OptionButton.new()
	for faction in RTSMapDocument.FACTIONS:
		_unit_type_opt.add_separator(FACTION_LABELS[faction])
		_unit_type_ids.append("")
		for uid in RTSData.units.keys():
			var def: Dictionary = RTSData.units[uid]
			if def.get("faction") == faction:
				_unit_type_opt.add_item("%s%s" % [def.get("name", uid), " ▣" if def.get("is_structure", false) else ""])
				_unit_type_ids.append(uid)
	_unit_type_opt.item_selected.connect(_on_brush_type_selected)
	_row(v, "Type", _unit_type_opt)
	_unit_owner_opt = OptionButton.new()
	for pid in [1, 2, 3]:
		_unit_owner_opt.add_item("Player %d" % pid, pid)
	_unit_owner_opt.item_selected.connect(func(i): canvas.unit_owner = i + 1)
	_row(v, "Owner", _unit_owner_opt)
	_unit_count_spin = _spin(1, 64, 1, 1, func(val): canvas.unit_count = int(val))
	_row(v, "Count", _unit_count_spin)
	_unit_spread_spin = _spin(0.5, 10, 0.1, 2.1, func(val): canvas.unit_spread = val)
	_row(v, "Spread", _unit_spread_spin)
	_unit_harvest_chk = CheckBox.new()
	_unit_harvest_chk.text = "auto-harvest (workers)"
	_unit_harvest_chk.toggled.connect(func(on): canvas.unit_auto_harvest = on)
	v.add_child(_unit_harvest_chk)
	_set_brush_type("marine")

	v.add_child(HSeparator.new())
	_section(v, "AI TARGET TOOL")
	_target_player_opt = OptionButton.new()
	for pid in [1, 2, 3]:
		_target_player_opt.add_item("Player %d" % pid, pid)
	_target_player_opt.select(1)
	_target_player_opt.item_selected.connect(func(i): canvas.target_player = i + 1)
	_row(v, "Player", _target_player_opt)

	v.add_child(HSeparator.new())
	var help = Label.new()
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.add_theme_color_override("font_color", Color("#64748b"))
	help.add_theme_font_size_override("font_size", 12)
	help.text = "Drag to paint terrain rects; click to place.\nRight-click erases.\nWheel zooms, middle-drag or Space+drag pans.\nDrag a selected rect's corner handle to resize.\nDel delete · Ctrl+D duplicate · arrows nudge.\nRamps descend west → east (high ground on the left)."
	v.add_child(help)
	return v

func _set_brush_type(uid: String) -> void:
	var idx = _unit_type_ids.find(uid)
	if idx >= 0:
		_unit_type_opt.select(idx)
		_on_brush_type_selected(idx)

func _on_brush_type_selected(idx: int) -> void:
	var uid = _unit_type_ids[idx]
	if uid == "":
		return
	canvas.unit_type = uid
	var def = RTSData.get_unit_def(uid)
	# Default the owner to the player whose faction fields this unit.
	for pid in [1, 2, 3]:
		if doc and str(doc.data["players"][str(pid)]["faction"]) == str(def.get("faction", "")):
			_unit_owner_opt.select(pid - 1)
			canvas.unit_owner = pid
			break
	var worker = bool(def.get("is_worker", false))
	_unit_harvest_chk.disabled = not worker
	_unit_harvest_chk.button_pressed = worker
	canvas.unit_auto_harvest = worker

func _build_properties_panel() -> Control:
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)

	_section(v, "MAP")
	_map_fields["label"] = _row(v, "Name", _line(func(t): doc.set_map_property("label", t)))
	_map_fields["id"] = _row(v, "Map id", _line(func(t): doc.set_map_property("id", RTSMapDocument.slugify(t))))
	_map_fields["seed"] = _row(v, "Seed", _spin(0, 999999, 1, 42, func(val): doc.set_map_property("seed", int(val))))
	_map_fields["width"] = _row(v, "Width", _spin(32, 512, 8, 128, func(val): doc.set_map_property("width", float(val)); canvas.fit_to_view()))
	_map_fields["height"] = _row(v, "Height", _spin(32, 512, 8, 96, func(val): doc.set_map_property("height", float(val)); canvas.fit_to_view()))

	v.add_child(HSeparator.new())
	_section(v, "PLAYERS & AI DIRECTIVES")
	for pid in [1, 2, 3]:
		var p_id = pid
		var head = Label.new()
		head.text = "Player %d" % pid
		head.add_theme_color_override("font_color", MapCanvasScript.OWNER_COLORS[pid])
		v.add_child(head)
		var fac = OptionButton.new()
		for f in RTSMapDocument.FACTIONS:
			fac.add_item(FACTION_LABELS[f])
		fac.item_selected.connect(func(i): doc.set_player_property(p_id, "faction", RTSMapDocument.FACTIONS[i]))
		_player_fields["%d:faction" % pid] = _row(v, "Faction", fac)
		var res = HBoxContainer.new()
		_player_fields["%d:minerals" % pid] = _spin(0, 99999, 25, 400, func(val): doc.set_player_property(p_id, "minerals", int(val)))
		_player_fields["%d:vespene" % pid] = _spin(0, 99999, 25, 150, func(val): doc.set_player_property(p_id, "vespene", int(val)))
		res.add_child(_player_fields["%d:minerals" % pid])
		res.add_child(_player_fields["%d:vespene" % pid])
		_row(v, "Min / Gas", res)

		var dh = HBoxContainer.new()
		var en = CheckBox.new()
		en.text = "AI"
		en.toggled.connect(func(on): doc.set_directive(p_id, {"enabled": on}))
		_directive_fields["%d:enabled" % pid] = en
		dh.add_child(en)
		var mode = OptionButton.new()
		mode.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		for m in RTSMapDocument.DIRECTIVE_MODES:
			mode.add_item(m)
		mode.item_selected.connect(func(i): doc.set_directive(p_id, {"mode": RTSMapDocument.DIRECTIVE_MODES[i]}))
		_directive_fields["%d:mode" % pid] = mode
		dh.add_child(mode)
		_row(v, "Directive", dh)
		var th = HBoxContainer.new()
		_directive_fields["%d:target_x" % pid] = _spin(0, 512, 0.5, 64, func(val): doc.set_directive(p_id, {"target_x": float(val)}))
		_directive_fields["%d:target_y" % pid] = _spin(0, 512, 0.5, 48, func(val): doc.set_directive(p_id, {"target_y": float(val)}))
		th.add_child(_directive_fields["%d:target_x" % pid])
		th.add_child(_directive_fields["%d:target_y" % pid])
		var pick = _button("Pick", func(): _target_player_opt.select(p_id - 1); canvas.target_player = p_id; _select_tool("target"), "Click the map to set this target")
		th.add_child(pick)
		_row(v, "Target", th)

	v.add_child(HSeparator.new())
	_section(v, "SELECTION")
	_inspector_box = VBoxContainer.new()
	_inspector_box.add_theme_constant_override("separation", 6)
	v.add_child(_inspector_box)

	v.add_child(HSeparator.new())
	_section(v, "VALIDATION")
	_issues_label = RichTextLabel.new()
	_issues_label.bbcode_enabled = true
	_issues_label.fit_content = true
	_issues_label.scroll_active = false
	_issues_label.custom_minimum_size.x = 300
	v.add_child(_issues_label)
	return v

# -------------------------------------------------------------------------
# Selection inspector
# -------------------------------------------------------------------------

func _on_selection_changed(ref: Dictionary) -> void:
	_inspector_ref = ref
	for c in _inspector_box.get_children():
		c.queue_free()
	_inspector_fields.clear()
	if ref.is_empty():
		var l = Label.new()
		l.text = "Nothing selected."
		l.add_theme_color_override("font_color", Color("#64748b"))
		_inspector_box.add_child(l)
		return

	var layer: String = ref["layer"]
	var head = Label.new()
	head.text = {"obstacles": "Cliff Wall", "high_ground": "High Ground", "ramps": "Ramp", "resources": "Resource", "units": "Unit Spawn"}[layer] + " #%d" % (int(ref["index"]) + 1)
	_inspector_box.add_child(head)

	if layer == "units":
		var type_opt = OptionButton.new()
		for i in range(_unit_type_ids.size()):
			if _unit_type_ids[i] == "":
				type_opt.add_separator(_unit_type_opt.get_item_text(i))
			else:
				type_opt.add_item(_unit_type_opt.get_item_text(i))
		type_opt.item_selected.connect(func(i): if _unit_type_ids[i] != "": _set_field("type", _unit_type_ids[i]))
		_inspector_fields["type"] = _row(_inspector_box, "Type", type_opt)
		_inspector_fields["id"] = _row(_inspector_box, "Id", _line(func(t): _set_field("id", t.strip_edges())))
		var owner = OptionButton.new()
		for pid in [1, 2, 3]:
			owner.add_item("Player %d" % pid)
		owner.item_selected.connect(func(i): _set_field("owner", i + 1))
		_inspector_fields["owner"] = _row(_inspector_box, "Owner", owner)
		_inspector_fields["count"] = _row(_inspector_box, "Count", _spin(1, 64, 1, 1, func(val): _set_field("count", int(val))))
		_add_xy_fields()
		_inspector_fields["spread"] = _row(_inspector_box, "Spread", _spin(0.5, 10, 0.1, 2.1, func(val): _set_field("spread", float(val))))
		var harvest = CheckBox.new()
		harvest.text = "auto-harvest"
		harvest.toggled.connect(func(on): _set_field("auto_harvest", on))
		_inspector_fields["auto_harvest"] = harvest
		_inspector_box.add_child(harvest)
		for opt in ["hp", "shields"]:
			var key: String = opt
			var oh = HBoxContainer.new()
			var chk = CheckBox.new()
			chk.text = "override"
			var sp = _spin(0, 5000, 1, 0, func(val): _set_field(key, float(val)))
			chk.toggled.connect(func(on):
				if on:
					_set_field(key, float(sp.value))
				else:
					doc.clear_item_field(_inspector_ref, key))
			_inspector_fields[key + "_on"] = chk
			_inspector_fields[key] = sp
			oh.add_child(chk)
			oh.add_child(sp)
			_row(_inspector_box, "Start %s" % key, oh)
	elif layer == "resources":
		var type_opt = OptionButton.new()
		for t in RTSMapDocument.RESOURCE_TYPES:
			type_opt.add_item(t)
		type_opt.item_selected.connect(func(i): _set_field("type", RTSMapDocument.RESOURCE_TYPES[i]))
		_inspector_fields["type"] = _row(_inspector_box, "Type", type_opt)
		_inspector_fields["id"] = _row(_inspector_box, "Id", _line(func(t): _set_field("id", t.strip_edges())))
		_add_xy_fields()
		_inspector_fields["amount"] = _row(_inspector_box, "Amount", _spin(0, 100000, 50, 1500, func(val): _set_field("amount", int(val))))
	else:
		_add_xy_fields()
		_inspector_fields["w"] = _row(_inspector_box, "Width", _spin(1, 512, 0.5, 4, func(val): _set_field("w", float(val))))
		_inspector_fields["h"] = _row(_inspector_box, "Height", _spin(1, 512, 0.5, 4, func(val): _set_field("h", float(val))))

	var actions = HBoxContainer.new()
	actions.add_child(_button("Duplicate", _duplicate_selected, "Ctrl+D"))
	actions.add_child(_button("Delete", _delete_selected, "Del"))
	_inspector_box.add_child(actions)
	_refresh_inspector_values()

func _add_xy_fields() -> void:
	_inspector_fields["x"] = _row(_inspector_box, "X", _spin(-64, 576, 0.5, 0, func(val): _set_field("x", float(val))))
	_inspector_fields["y"] = _row(_inspector_box, "Y", _spin(-64, 576, 0.5, 0, func(val): _set_field("y", float(val))))

func _set_field(key: String, value) -> void:
	doc.set_item_field(_inspector_ref, key, value)

func _refresh_inspector_values() -> void:
	if _inspector_ref.is_empty():
		return
	if not doc.is_valid_ref(_inspector_ref):
		canvas.select({})
		return
	var item = doc.get_item(_inspector_ref)
	for key in _inspector_fields.keys():
		var c: Control = _inspector_fields[key]
		if key.ends_with("_on"):
			(c as CheckBox).set_pressed_no_signal(item.has(key.trim_suffix("_on")))
			continue
		if not item.has(key):
			continue
		var val = item[key]
		if c is SpinBox:
			(c as SpinBox).set_value_no_signal(float(val))
		elif c is LineEdit:
			if not c.has_focus():
				(c as LineEdit).text = str(val)
		elif c is CheckBox:
			(c as CheckBox).set_pressed_no_signal(bool(val))
		elif c is OptionButton:
			var opt := c as OptionButton
			match key:
				"owner":
					opt.select(int(val) - 1)
				"type":
					if _inspector_ref["layer"] == "units":
						opt.select(_unit_type_ids.find(str(val)))
					else:
						opt.select(RTSMapDocument.RESOURCE_TYPES.find(str(val)))

# -------------------------------------------------------------------------
# Document sync
# -------------------------------------------------------------------------

func _on_doc_changed() -> void:
	var d = doc.data
	for key in ["label", "id"]:
		var le: LineEdit = _map_fields[key]
		if not le.has_focus():
			le.text = str(d[key])
	for key in ["seed", "width", "height"]:
		(_map_fields[key] as SpinBox).set_value_no_signal(float(d[key]))
	for pid in [1, 2, 3]:
		var p: Dictionary = d["players"][str(pid)]
		(_player_fields["%d:faction" % pid] as OptionButton).select(max(0, RTSMapDocument.FACTIONS.find(str(p["faction"]))))
		(_player_fields["%d:minerals" % pid] as SpinBox).set_value_no_signal(float(p["minerals"]))
		(_player_fields["%d:vespene" % pid] as SpinBox).set_value_no_signal(float(p["vespene"]))
		var dv = doc.get_directive(pid)
		(_directive_fields["%d:enabled" % pid] as CheckBox).set_pressed_no_signal(bool(dv["enabled"]))
		(_directive_fields["%d:mode" % pid] as OptionButton).select(max(0, RTSMapDocument.DIRECTIVE_MODES.find(str(dv["mode"]))))
		(_directive_fields["%d:target_x" % pid] as SpinBox).set_value_no_signal(float(dv["target_x"]))
		(_directive_fields["%d:target_y" % pid] as SpinBox).set_value_no_signal(float(dv["target_y"]))
	_refresh_inspector_values()

	var issues = doc.validate()
	if issues.is_empty():
		_issues_label.text = "[color=#4ade80]✔ Map is ready to play.[/color]"
	else:
		var lines: Array[String] = []
		for s in issues:
			lines.append("[color=#fbbf24]•[/color] " + s)
		_issues_label.text = "\n".join(lines)

	_undo_btn.disabled = not doc.can_undo()
	_redo_btn.disabled = not doc.can_redo()
	var sm = doc.summary()
	DisplayServer.window_set_title("%s%s — RobOS RTS Map Editor" % [sm["label"], " *" if doc.dirty else ""])
	if _status_label.text == "" or _status_label.text.begins_with("Map:"):
		_set_status("")
	canvas.queue_redraw()

func _set_status(msg: String) -> void:
	if msg == "":
		var sm = doc.summary()
		msg = "Map: %s%s  ·  %s  ·  %d×%d  ·  %d units in %d spawns, %d resources, %d cliffs, %d plateaus, %d ramps" % [
			sm["id"], " *" if sm["dirty"] else "", sm["path"] if sm["path"] != "" else "(unsaved)",
			int(sm["width"]), int(sm["height"]), sm["unit_total"], sm["unit_entries"], sm["resources"],
			sm["obstacles"], sm["high_ground"], sm["ramps"]]
	_status_label.text = msg

func _on_cursor_moved(wpos: Vector2) -> void:
	_cursor_label.text = "x %.1f   y %.1f   zoom %.1fx" % [wpos.x, wpos.y, canvas.view_scale]

func _on_target_picked(pid: int, wpos: Vector2) -> void:
	var dv = doc.get_directive(pid)
	var fields = {"target_x": wpos.x, "target_y": wpos.y}
	if str(dv["mode"]) == "idle":
		fields["mode"] = "swarm_rush"
		fields["enabled"] = true
	doc.set_directive(pid, fields)
	_set_status("Player %d AI target set to (%.1f, %.1f)" % [pid, wpos.x, wpos.y])

func _select_tool(tool_id: String) -> void:
	canvas.tool = tool_id
	if _tool_buttons.has(tool_id):
		(_tool_buttons[tool_id] as Button).button_pressed = true # goes through the ButtonGroup; emits toggled, not pressed
	canvas.queue_redraw()

# -------------------------------------------------------------------------
# Commands
# -------------------------------------------------------------------------

func _ask(text: String, cb: Callable) -> void:
	_pending_confirm = cb
	_confirm.dialog_text = text
	_confirm.popup_centered()

func _on_new_pressed() -> void:
	if doc.dirty:
		_ask("Discard unsaved changes and start a new map?", _do_new)
	else:
		_do_new()

func _do_new() -> void:
	doc.new_blank()
	canvas.set_document(doc)
	canvas.select({})
	_set_status("New blank map — set its Map id before saving.")

func _refresh_open_list() -> void:
	_open_opt.clear()
	_open_paths = RTSMapDocument.list_scenarios()
	for p in _open_paths:
		_open_opt.add_item(p.get_file())
	var idx = _open_paths.find(doc.file_path)
	if idx >= 0:
		_open_opt.select(idx)

func _on_open_pressed() -> void:
	if _open_opt.selected < 0 or _open_opt.selected >= _open_paths.size():
		return
	var path = _open_paths[_open_opt.selected]
	if doc.dirty:
		_ask("Discard unsaved changes and open %s?" % path.get_file(), func(): _open_path(path))
	else:
		_open_path(path)

func _open_path(path: String) -> Dictionary:
	var res = doc.load_file(path)
	if bool(res["ok"]):
		canvas.set_document(doc)
		canvas.select({})
		_set_status("Opened %s" % path)
	else:
		_set_status(str(res["error"]))
	return res

func _on_save_pressed() -> void:
	var target = doc.default_save_path()
	if target != doc.file_path and FileAccess.file_exists(target):
		_ask("%s already exists. Overwrite it?" % target.get_file(), func(): _do_save(target))
	else:
		_do_save(target)

func _do_save(path: String) -> Dictionary:
	var res = doc.save_file(path)
	if bool(res["ok"]):
		_refresh_open_list()
		var issues = doc.validate()
		_set_status("Saved %s%s" % [path, "" if issues.is_empty() else "  (%d validation warnings)" % issues.size()])
	else:
		_set_status(str(res["error"]))
	return res

func _delete_selected() -> void:
	if not canvas.selected.is_empty():
		doc.remove_item(canvas.selected)
		canvas.select({})

func _duplicate_selected() -> void:
	if not canvas.selected.is_empty():
		canvas.select(doc.duplicate_item(canvas.selected, Vector2(max(canvas.snap, 1.0), max(canvas.snap, 1.0)) * 2.0))

func _nudge_selected(delta: Vector2) -> void:
	var item = doc.get_item(canvas.selected)
	if item.is_empty():
		return
	doc.checkpoint()
	doc.move_item_to(canvas.selected, Vector2(float(item["x"]), float(item["y"])) + delta)

func _playtest() -> Dictionary:
	SimEngine.editor_session = {"doc": doc}
	var res = SimEngine.load_scenario_dict(doc.to_scenario())
	SimEngine.paused = false
	get_tree().change_scene_to_file("res://scenes/RTSMain.tscn")
	return res

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed:
		return
	var ke := event as InputEventKey
	var viewport = get_viewport() # F5 swaps scenes, after which this node has no viewport.
	var handled = true
	if ke.ctrl_pressed or ke.meta_pressed:
		match ke.keycode:
			KEY_Z:
				if ke.shift_pressed:
					doc.redo()
				else:
					doc.undo()
			KEY_Y:
				doc.redo()
			KEY_S:
				_on_save_pressed()
			KEY_N:
				_on_new_pressed()
			KEY_D:
				_duplicate_selected()
			_:
				handled = false
	else:
		var step = max(canvas.snap, 0.5) * (4.0 if ke.shift_pressed else 1.0)
		match ke.keycode:
			KEY_DELETE, KEY_BACKSPACE:
				_delete_selected()
			KEY_F5:
				_playtest()
			KEY_F:
				canvas.fit_to_view()
			KEY_ESCAPE:
				canvas.select({})
				_select_tool("select")
			KEY_LEFT:
				_nudge_selected(Vector2(-step, 0))
			KEY_RIGHT:
				_nudge_selected(Vector2(step, 0))
			KEY_UP:
				_nudge_selected(Vector2(0, -step))
			KEY_DOWN:
				_nudge_selected(Vector2(0, step))
			_:
				handled = false
				for t in TOOLS:
					if ke.keycode == t["key"] and not ke.echo:
						_select_tool(t["id"])
						handled = true
	if handled:
		viewport.set_input_as_handled()

# -------------------------------------------------------------------------
# Automation API (GameControlServer `/editor`) — used by E2E tests and scripted map generation
# -------------------------------------------------------------------------

func handle_control_request(req: Dictionary) -> Dictionary:
	var action = str(req.get("action", "state"))
	var out: Dictionary = {"ok": true}
	match action:
		"state":
			pass
		"new":
			doc.new_blank(float(req.get("width", 128.0)), float(req.get("height", 96.0)))
			canvas.set_document(doc)
		"load":
			var path = SimEngine.resolve_scenario_path(str(req.get("path", req.get("slug", ""))))
			if path == "":
				return {"ok": false, "error": "Scenario not found"}
			out = _open_path(path)
		"set_map":
			doc.set_map_property(str(req["key"]), req["value"])
		"set_player":
			doc.set_player_property(int(req["player"]), str(req["key"]), req["value"])
		"set_directive":
			var fields: Dictionary = req.duplicate()
			fields.erase("action")
			fields.erase("player")
			doc.set_directive(int(req["player"]), fields)
		"add_rect":
			out["ref"] = doc.add_rect(str(req["layer"]), Rect2(float(req["x"]), float(req["y"]), float(req["w"]), float(req["h"])))
		"add_resource":
			out["ref"] = doc.add_resource(str(req.get("type", "mineral_field")), Vector2(float(req["x"]), float(req["y"])), int(req.get("amount", -1)))
		"add_unit":
			out["ref"] = doc.add_unit(str(req["type"]), int(req.get("owner", 1)), Vector2(float(req["x"]), float(req["y"])),
				int(req.get("count", 1)), float(req.get("spread", 2.1)), bool(req.get("auto_harvest", false)))
			if req.has("id"):
				doc.set_item_field(out["ref"], "id", str(req["id"]))
		"set_field":
			var ref = {"layer": str(req["layer"]), "index": int(req["index"])}
			if not doc.is_valid_ref(ref):
				return {"ok": false, "error": "Invalid item ref"}
			doc.set_item_field(ref, str(req["key"]), req["value"])
		"remove":
			var ref2 = {"layer": str(req["layer"]), "index": int(req["index"])}
			if not doc.is_valid_ref(ref2):
				return {"ok": false, "error": "Invalid item ref"}
			doc.remove_item(ref2)
			canvas.select({})
		"undo":
			out["ok"] = doc.undo()
		"redo":
			out["ok"] = doc.redo()
		"save":
			var target = str(req.get("path", doc.default_save_path()))
			if target != doc.file_path and FileAccess.file_exists(target) and not bool(req.get("overwrite", false)):
				return {"ok": false, "error": "%s exists; pass overwrite=true" % target}
			out = _do_save(target)
		"playtest":
			out = _playtest()
		_:
			return {"ok": false, "error": "Unknown editor action: " + action}
	out["summary"] = doc.summary()
	out["issues"] = doc.validate()
	out["scenario"] = doc.to_scenario()
	return out
