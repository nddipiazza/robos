class_name ActionLog
extends Panel

signal log_height_changed(is_expanded: bool)
signal dialogue_ended

enum SizeMode { SMALL, MEDIUM, LARGE }
var current_size_mode: SizeMode = SizeMode.SMALL

const HEIGHT_SMALL: float = 124.0
const HEIGHT_MEDIUM: float = 240.0
const HEIGHT_LARGE: float = 420.0
const BASE_BOTTOM_Y: float = 604.0

@onready var rich_label: RichTextLabel = find_child("LogRichText", true, false)
@onready var choices_container: VBoxContainer = find_child("ChoicesContainer", true, false)
@onready var btn_size_small: Button = find_child("BtnSizeSmall", true, false)
@onready var btn_size_med: Button = find_child("BtnSizeMed", true, false)
@onready var btn_size_large: Button = find_child("BtnSizeLarge", true, false)
@onready var btn_cycle_size: Button = find_child("BtnCycleSize", true, false)

# Icon Textures for Small, Medium, Large size modes
var tex_small_normal: Texture2D = preload("res://assets/props/icon_log_size_small.png")
var tex_small_active: Texture2D = preload("res://assets/props/icon_log_size_small_active.png")
var tex_med_normal: Texture2D = preload("res://assets/props/icon_log_size_med.png")
var tex_med_active: Texture2D = preload("res://assets/props/icon_log_size_med_active.png")
var tex_large_normal: Texture2D = preload("res://assets/props/icon_log_size_large.png")
var tex_large_active: Texture2D = preload("res://assets/props/icon_log_size_large_active.png")

# Dialogue State
var is_dialogue_active: bool = false
var current_tree: Dictionary = {}
var current_node_id: String = ""
var current_speaker: String = ""
var current_text: String = ""
var current_choices: Array = []
var prev_size_before_dialogue: SizeMode = SizeMode.SMALL

func _ready() -> void:
	if rich_label:
		rich_label.scroll_following = false
	if btn_size_small:
		btn_size_small.text = ""
		btn_size_small.tooltip_text = "Small Log (124px)"
		btn_size_small.pressed.connect(func(): set_size_mode(SizeMode.SMALL, true))
	if btn_size_med:
		btn_size_med.text = ""
		btn_size_med.tooltip_text = "Medium Log (240px)"
		btn_size_med.pressed.connect(func(): set_size_mode(SizeMode.MEDIUM, true))
	if btn_size_large:
		btn_size_large.text = ""
		btn_size_large.tooltip_text = "Large Log (420px)"
		btn_size_large.pressed.connect(func(): set_size_mode(SizeMode.LARGE, true))
	if btn_cycle_size:
		btn_cycle_size.visible = false
		btn_cycle_size.pressed.connect(cycle_size_mode)
	
	GameState.message_logged.connect(_on_message_logged)
	position.x = 24.0
	custom_minimum_size.x = 880.0
	size.x = 880.0
	set_size_mode(SizeMode.SMALL, false)
	
	# Initial welcome message in authentic Infinity Engine style
	add_log_entry("system", "[color=#ecf0f1]*** Infinity Engine Runtime Initialized (6.0s Round Timer Active) ***[/color]")

# =============================================================================
# SIZING SYSTEM (3 MODES: SMALL, MEDIUM, LARGE)
# =============================================================================

func get_base_bottom_y() -> float:
	var vp_h = get_viewport_rect().size.y if is_inside_tree() else 1080.0
	return vp_h - 70.0

func set_size_mode(mode: SizeMode, is_user_action: bool = false) -> void:
	current_size_mode = mode
	if is_user_action:
		prev_size_before_dialogue = mode
	var target_h: float = HEIGHT_SMALL
	var label_txt: String = "SIZE: SML ▲"
	
	match current_size_mode:
		SizeMode.SMALL:
			target_h = HEIGHT_SMALL
			label_txt = "SIZE: SML ▲"
		SizeMode.MEDIUM:
			target_h = HEIGHT_MEDIUM
			label_txt = "SIZE: MED ▲"
		SizeMode.LARGE:
			target_h = HEIGHT_LARGE
			label_txt = "SIZE: LRG ▼"
	
	custom_minimum_size.y = target_h
	size.y = target_h
	position.y = get_base_bottom_y() - target_h
	
	if btn_cycle_size:
		btn_cycle_size.text = label_txt
	
	# Update mode button highlights
	_update_size_button_styles()
	
	log_height_changed.emit(current_size_mode != SizeMode.SMALL)
	_update_layout_for_choices()
	_scroll_to_bottom()

func cycle_size_mode() -> void:
	match current_size_mode:
		SizeMode.SMALL:
			set_size_mode(SizeMode.MEDIUM, true)
		SizeMode.MEDIUM:
			set_size_mode(SizeMode.LARGE, true)
		SizeMode.LARGE:
			set_size_mode(SizeMode.SMALL, true)

func toggle_height() -> void:
	cycle_size_mode()

func _update_size_button_styles() -> void:
	if btn_size_small:
		btn_size_small.icon = tex_small_active if current_size_mode == SizeMode.SMALL else tex_small_normal
	if btn_size_med:
		btn_size_med.icon = tex_med_active if current_size_mode == SizeMode.MEDIUM else tex_med_normal
	if btn_size_large:
		btn_size_large.icon = tex_large_active if current_size_mode == SizeMode.LARGE else tex_large_normal

# =============================================================================
# IN-LOG DIALOGUE SYSTEM
# =============================================================================

func start_dialogue(tree: Dictionary, root_id: String) -> void:
	current_tree = tree
	current_node_id = root_id
	is_dialogue_active = true
	
	# Auto-expand to MEDIUM if currently compact so choices are immediately visible
	prev_size_before_dialogue = current_size_mode
	if current_size_mode == SizeMode.SMALL:
		set_size_mode(SizeMode.MEDIUM, false)
	
	show_dialogue_node(root_id)

func show_dialogue_node(node_id: String) -> void:
	var nodes = current_tree.get("nodes", {})
	var node_data = nodes.get(node_id, {})
	if node_data.is_empty():
		close_dialogue()
		return
	
	current_node_id = node_id
	current_speaker = node_data.get("speaker", "Unknown")
	current_text = node_data.get("text", "")
	
	# Stream speech directly to the Activity Log
	GameState.log_message("dialogue", "[b]%s:[/b] \"%s\"" % [current_speaker, current_text])
	
	if not choices_container:
		return
	
	for child in choices_container.get_children():
		child.queue_free()
	
	var choices = node_data.get("choices", [])
	current_choices = choices
	
	if choices.size() == 0:
		# End/Farewell node: Provide single continue/dismiss option
		var btn = _create_choice_button(0, "[Continue / End Dialogue]", null)
		btn.pressed.connect(close_dialogue)
		choices_container.add_child(btn)
	else:
		# Render each choice as an interactive numbered option in the log
		for i in range(choices.size()):
			var c = choices[i]
			var c_text = str(c.get("text", "..."))
			var nxt = c.get("nextNode", null)
			var btn = _create_choice_button(i, c_text, nxt)
			btn.pressed.connect(func():
				_on_choice_selected(c_text, nxt)
			)
			choices_container.add_child(btn)
	
	_update_layout_for_choices()

func _create_choice_button(index: int, choice_text: String, next_node: Variant) -> Button:
	var btn = Button.new()
	btn.name = "ChoiceBtn_%d" % index
	btn.text = "%d. %s" % [index + 1, choice_text]
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.add_theme_font_size_override("font_size", 12)
	btn.add_theme_color_override("font_color", Color(0.98, 0.88, 0.45, 1.0)) # Authentic IE Gold
	btn.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 1.0, 1.0))
	btn.add_theme_color_override("font_pressed_color", Color(1.0, 0.7, 0.2, 1.0))
	
	var normal_sb = StyleBoxFlat.new()
	normal_sb.bg_color = Color(0.06, 0.1, 0.16, 0.82)
	normal_sb.border_width_left = 3
	normal_sb.border_color = Color(0.6, 0.5, 0.2, 0.6)
	normal_sb.corner_radius_top_left = 3
	normal_sb.corner_radius_bottom_left = 3
	normal_sb.content_margin_left = 8
	normal_sb.content_margin_top = 4
	normal_sb.content_margin_bottom = 4
	btn.add_theme_stylebox_override("normal", normal_sb)
	
	var hover_sb = StyleBoxFlat.new()
	hover_sb.bg_color = Color(0.12, 0.18, 0.26, 0.95)
	hover_sb.border_width_left = 3
	hover_sb.border_color = Color(0.0, 0.85, 1.0, 1.0)
	hover_sb.corner_radius_top_left = 3
	hover_sb.corner_radius_bottom_left = 3
	hover_sb.content_margin_left = 8
	hover_sb.content_margin_top = 4
	hover_sb.content_margin_bottom = 4
	btn.add_theme_stylebox_override("hover", hover_sb)
	
	return btn

func _on_choice_selected(choice_text: String, next_node: Variant) -> void:
	# Log hero's selected reply into the dialogue log
	var speaker_name: String = GameState.hero_name if GameState.hero_name.strip_edges() != "" else "Hero"
	GameState.log_message("choice", "[b]%s:[/b] \"%s\"" % [speaker_name, choice_text])
	
	if next_node == null:
		close_dialogue()
	else:
		show_dialogue_node(str(next_node))

func close_dialogue() -> void:
	is_dialogue_active = false
	current_tree = {}
	current_node_id = ""
	current_speaker = ""
	current_text = ""
	current_choices = []
	
	if choices_container:
		for child in choices_container.get_children():
			child.queue_free()
		choices_container.visible = false
	
	set_size_mode(prev_size_before_dialogue, false)
	_update_layout_for_choices()
	dialogue_ended.emit()

func _update_layout_for_choices() -> void:
	if not choices_container:
		return
	
	var count = choices_container.get_child_count()
	if count == 0 or not is_dialogue_active:
		choices_container.visible = false
		if rich_label:
			rich_label.offset_bottom = -6.0
	else:
		choices_container.visible = true
		var tray_h: float = min(160.0, float(count * 26 + 10))
		choices_container.custom_minimum_size.y = tray_h
		choices_container.size.y = tray_h
		choices_container.offset_top = -tray_h - 6.0
		choices_container.offset_bottom = -6.0
		if rich_label:
			rich_label.offset_bottom = -tray_h - 10.0
	
	call_deferred("_scroll_to_bottom")

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and rich_label:
		var vbar = rich_label.get_v_scroll_bar()
		if vbar:
			if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
				vbar.value -= max(15.0, vbar.page * 0.25)
				accept_event()
			elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
				vbar.value += max(15.0, vbar.page * 0.25)
				accept_event()

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	
	# Key 1-9 to select active choice in log
	if is_dialogue_active and choices_container and choices_container.visible:
		if event.keycode >= KEY_1 and event.keycode <= KEY_9:
			var idx = event.keycode - KEY_1
			var children = choices_container.get_children()
			if idx >= 0 and idx < children.size() and children[idx] is Button:
				children[idx].emit_signal("pressed")
				get_viewport().set_input_as_handled()
				return
	
	# Hotkey 'Tab' or 'L' to cycle log size modes
	if event.keycode == KEY_TAB or event.keycode == KEY_L:
		cycle_size_mode()
		get_viewport().set_input_as_handled()
		return

	# PageUp / PageDown to scroll log history
	if rich_label:
		var vbar = rich_label.get_v_scroll_bar()
		if vbar and (event.keycode == KEY_PAGEUP or event.keycode == KEY_PAGEDOWN):
			if event.keycode == KEY_PAGEUP:
				vbar.value = max(0.0, vbar.value - max(30.0, vbar.page * 0.5))
			else:
				vbar.value = min(vbar.max_value, vbar.value + max(30.0, vbar.page * 0.5))
			get_viewport().set_input_as_handled()
			return

# =============================================================================
# LOGGING & BBCODE FORMATTING
# =============================================================================

func _on_message_logged(category: String, message: String) -> void:
	add_log_entry(category, message)

func log_combat(text: String) -> void:
	add_log_entry("combat", text)

func log_damage(text: String) -> void:
	add_log_entry("damage", text)

func log_dialogue(speaker: String, text: String) -> void:
	add_log_entry("dialogue", "[b]%s:[/b] \"%s\"" % [speaker, text])

func log_quest(text: String) -> void:
	add_log_entry("quest", "[b]Journal:[/b] %s" % text)

func log_item(text: String) -> void:
	add_log_entry("item", text)

func log_system(text: String) -> void:
	add_log_entry("system", text)

func add_log(text: String, category: String = "system") -> void:
	add_log_entry(category, text)

func add_log_entry(category: String, bbcode_content: String) -> void:
	var color_hex = "#ecf0f1"
	var prefix = ""
	
	match category.to_lower():
		"combat":
			color_hex = "#f4d03f" # Classic BG gold for attack rolls
			prefix = "* "
		"damage":
			color_hex = "#e74c3c" # Vivid red for damage taken/dealt
			prefix = "* "
		"dialogue":
			color_hex = "#5dade2" # Cyan for character speech
			prefix = ""
		"choice", "reply":
			color_hex = "#f9e79f" # Warm gold for hero response selections
			prefix = "> "
		"quest":
			color_hex = "#58d68d" # Bright emerald green for quest updates
			prefix = ""
		"item":
			color_hex = "#af7ac5" # Mystic lavender/purple for inventory/potions
			prefix = "* "
		"system":
			color_hex = "#bdc3c7" # Slate/silver for engine status
			prefix = "* "
		_:
			color_hex = "#ffffff"
			prefix = ""

	var formatted_line = "[color=%s]%s%s[/color]" % [color_hex, prefix, bbcode_content]
	if rich_label:
		var vbar = rich_label.get_v_scroll_bar()
		var was_near_bottom: bool = true
		if vbar:
			var dist = vbar.max_value - vbar.page - vbar.value
			was_near_bottom = (dist <= 40.0) or (vbar.max_value <= vbar.page)

		rich_label.append_text(formatted_line + "\n")
		
		# Auto-scroll if user was already at the bottom or if a dialogue choice/reply was logged
		if was_near_bottom or category.to_lower() in ["choice", "reply"]:
			call_deferred("_scroll_to_bottom")

func _scroll_to_bottom() -> void:
	if rich_label:
		var vbar = rich_label.get_v_scroll_bar()
		if vbar:
			vbar.value = vbar.max_value

func get_scroll_info() -> Dictionary:
	if not rich_label:
		return {"value": 0.0, "max_value": 0.0, "page": 0.0, "is_at_bottom": true}
	var vbar = rich_label.get_v_scroll_bar()
	if not vbar:
		return {"value": 0.0, "max_value": 0.0, "page": 0.0, "is_at_bottom": true}
	var dist = vbar.max_value - vbar.page - vbar.value
	return {
		"value": vbar.value,
		"max_value": vbar.max_value,
		"page": vbar.page,
		"is_at_bottom": (dist <= 10.0 or vbar.max_value <= vbar.page)
	}

func scroll_log_by(delta_value: float) -> void:
	if rich_label:
		var vbar = rich_label.get_v_scroll_bar()
		if vbar:
			vbar.value = clamp(vbar.value + delta_value, 0.0, vbar.max_value)

func scroll_log_to_top() -> void:
	if rich_label:
		var vbar = rich_label.get_v_scroll_bar()
		if vbar:
			vbar.value = 0.0

func scroll_log_to_bottom() -> void:
	_scroll_to_bottom()
