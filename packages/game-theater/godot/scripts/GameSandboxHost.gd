extends PanelContainer
class_name GameSandboxHost

signal action_dispatched(payload: Dictionary)

var _loaded_game_id: String = ""
var _loaded_version: int = -1
var _loaded_code_hash: int = 0
var _active_instance: Control = null
var _welcome_box: CenterContainer = null
var _welcome_title: Label = null
var _status_label: Label = null
var _stage_holder: Control = null
var _emoji_enabled: bool = false

func _ready() -> void:
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color("#111722")
	panel_style.border_color = Color("#263244")
	panel_style.set_border_width_all(1)
	panel_style.set_corner_radius_all(12)
	panel_style.set_content_margin_all(16)
	add_theme_stylebox_override("panel", panel_style)

	_stage_holder = Control.new()
	_stage_holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_stage_holder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_stage_holder)

	_build_welcome_view()

func _build_welcome_view() -> void:
	_welcome_box = CenterContainer.new()
	_welcome_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_stage_holder.add_child(_welcome_box)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(560, 280)
	var card_style := StyleBoxFlat.new()
	card_style.bg_color = Color("#161b22")
	card_style.border_color = Color("#00bcd4")
	card_style.set_border_width_all(1)
	card_style.set_corner_radius_all(14)
	card_style.set_content_margin_all(28)
	card.add_theme_stylebox_override("panel", card_style)
	_welcome_box.add_child(card)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	card.add_child(vbox)

	_welcome_title = Label.new()
	_welcome_title.text = ("🎭 " if _emoji_enabled else "") + "Stage Ready — Generate Any Multiplayer Game!"
	_welcome_title.add_theme_font_size_override("font_size", 22)
	_welcome_title.add_theme_color_override("font_color", Color("#00bcd4"))
	_welcome_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(_welcome_title)

	_status_label = Label.new()
	_status_label.text = (
		"Welcome to RobOS AI Multiplayer Game Theater.\n\n"
		+ "Any connected RobOS Game User can use the AI Game Builder panel on the left to:\n"
		+ "  1. Dynamically generate a brand-new multiplayer game server + Godot 4 client\n"
		+ "  2. Claim seats in the lobby and play live matches together\n"
		+ "  3. Ask the RobOS Agent to evolve rules, turns, or visuals at any time!"
	)
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.add_theme_font_size_override("font_size", 15)
	_status_label.add_theme_color_override("font_color", Color("#cbd5e1"))
	vbox.add_child(_status_label)

func set_emoji_enabled(enabled: bool) -> void:
	_emoji_enabled = enabled
	if is_instance_valid(_welcome_title):
		_welcome_title.text = ("🎭 " if _emoji_enabled else "") + "Stage Ready — Generate Any Multiplayer Game!"

func clear_game_stage(message: String = "") -> void:
	if is_instance_valid(_active_instance):
		_active_instance.queue_free()
		_active_instance = null
	_loaded_game_id = ""
	_loaded_version = -1
	_loaded_code_hash = 0
	if is_instance_valid(_welcome_box):
		_welcome_box.visible = true
	if message != "" and is_instance_valid(_status_label):
		_status_label.text = message

func sync_dynamic_game(active_game: Variant, game_view: Variant, me: Dictionary, lobby: Dictionary) -> void:
	if active_game == null or typeof(active_game) != TYPE_DICTIONARY:
		clear_game_stage()
		return

	var game_dict: Dictionary = active_game
	var gid := String(game_dict.get("id", ""))
	var ver := int(game_dict.get("version", 1))
	var gd_code := String(game_dict.get("clientGd", ""))
	var code_hash := gd_code.hash()

	if gid == "" or gd_code.strip_edges() == "":
		clear_game_stage("Active game has no Godot 4 client script yet.")
		return

	if _active_instance == null or gid != _loaded_game_id or ver != _loaded_version or code_hash != _loaded_code_hash:
		_mount_gdscript(gid, ver, code_hash, gd_code)

	if is_instance_valid(_active_instance):
		var safe_view: Dictionary = game_view if typeof(game_view) == TYPE_DICTIONARY else {}
		if _active_instance.has_method("apply_view"):
			_active_instance.call("apply_view", safe_view, me, lobby)
		elif _active_instance.has_method("render_view"):
			_active_instance.call("render_view", safe_view, me, lobby)
		elif _active_instance.has_method("update_state"):
			_active_instance.call("update_state", safe_view, me, lobby)

func _mount_gdscript(gid: String, ver: int, code_hash: int, gd_code: String) -> void:
	if is_instance_valid(_active_instance):
		_active_instance.queue_free()
		_active_instance = null

	var dyn_script := GDScript.new()
	dyn_script.source_code = gd_code
	var err := dyn_script.reload()
	if err != OK:
		var pfx := "⚠ " if _emoji_enabled else "[Error] "
		clear_game_stage(pfx + "Failed to compile dynamic Godot 4 script for '" + gid + "' (error " + str(err) + ").")
		return

	var inst_variant: Variant = dyn_script.new()
	if not (inst_variant is Control):
		var pfx2 := "⚠ " if _emoji_enabled else "[Error] "
		clear_game_stage(pfx2 + "Dynamic script for '" + gid + "' must extend Control.")
		return

	var inst: Control = inst_variant
	inst.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	inst.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inst.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var dispatch_cb := func(payload: Variant) -> void:
		if typeof(payload) == TYPE_DICTIONARY:
			action_dispatched.emit(payload)

	if "send_action" in inst:
		inst.set("send_action", dispatch_cb)
	if inst.has_signal("game_action"):
		inst.connect("game_action", dispatch_cb)

	if is_instance_valid(_welcome_box):
		_welcome_box.visible = false

	_stage_holder.add_child(inst)
	_active_instance = inst
	_loaded_game_id = gid
	_loaded_version = ver
	_loaded_code_hash = code_hash
