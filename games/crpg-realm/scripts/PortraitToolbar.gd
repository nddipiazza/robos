class_name PortraitToolbar
extends Control

@onready var members_container: VBoxContainer = $VBoxContainer

var portrait_cache: Dictionary = {}

func _ready() -> void:
	anchors_preset = Control.PRESET_RIGHT_WIDE
	anchor_left = 1.0
	anchor_right = 1.0
	anchor_top = 0.0
	anchor_bottom = 1.0
	offset_left = -140.0
	offset_right = -10.0
	offset_top = 20.0
	offset_bottom = -120.0
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	grow_vertical = Control.GROW_DIRECTION_BOTH

	GameState.party_changed.connect(refresh_party)
	GameState.party_selection_changed.connect(_on_selection_changed)
	GameState.status_effects_changed.connect(func(_name): refresh_party())
	GameState.hero_damaged.connect(func(_cur, _max): refresh_party())

	refresh_party()

func _on_selection_changed(_indices: Array) -> void:
	refresh_party()

func refresh_party() -> void:
	if not members_container:
		members_container = get_node_or_null("VBoxContainer")
	if not members_container:
		return

	# Clear previous children
	for child in members_container.get_children():
		child.queue_free()

	var members = GameState.party_members
	for i in range(members.size()):
		var m = members[i]
		var card = _create_member_card(i, m)
		members_container.add_child(card)

func _create_member_card(idx: int, member: Dictionary) -> PanelContainer:
	var is_selected = GameState.selected_party_indices.has(idx)
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(120, 130)

	var cur_hp = member.get("hp", GameState.hero_hp if idx == 0 else 10)
	var max_hp = member.get("max_hp", GameState.hero_max_hp if idx == 0 else 10)
	var is_dead = (int(cur_hp) <= 0) or GameState.has_status_effect(member.get("name", ""), "unconscious")

	var sb = StyleBoxFlat.new()
	if is_dead:
		sb.bg_color = Color(0.32, 0.05, 0.05, 0.95) # Deep blood red card background
		sb.border_color = Color(0.95, 0.15, 0.15, 1.0) # Bright red glowing border
		sb.border_width_left = 3
		sb.border_width_top = 3
		sb.border_width_right = 3
		sb.border_width_bottom = 3
		sb.shadow_color = Color(1.0, 0.1, 0.1, 0.6)
		sb.shadow_size = 6
	elif is_selected:
		sb.bg_color = Color(0.12, 0.14, 0.18, 0.90)
		sb.border_color = Color(1.0, 0.85, 0.25, 1.0) # Golden selection glow
		sb.shadow_color = Color(1.0, 0.8, 0.2, 0.4)
		sb.shadow_size = 4
		sb.border_width_left = 2
		sb.border_width_top = 2
		sb.border_width_right = 2
		sb.border_width_bottom = 2
	else:
		sb.bg_color = Color(0.12, 0.14, 0.18, 0.90)
		sb.border_color = Color(0.3, 0.35, 0.42, 0.8)
		sb.border_width_left = 2
		sb.border_width_top = 2
		sb.border_width_right = 2
		sb.border_width_bottom = 2

	sb.corner_radius_top_left = 4
	sb.corner_radius_top_right = 4
	sb.corner_radius_bottom_left = 4
	sb.corner_radius_bottom_right = 4
	card.add_theme_stylebox_override("panel", sb)
	card.set_meta("is_dead_hud_red", is_dead)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 6)
	margin.add_theme_constant_override("margin_right", 6)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_bottom", 6)
	card.add_child(margin)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 3)
	margin.add_child(vbox)

	# Header: Hotkey badge & name
	var header_hbox = HBoxContainer.new()
	var key_lbl = Label.new()
	key_lbl.text = "[%d]" % (idx + 1)
	if is_dead:
		key_lbl.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35, 1.0))
	elif is_selected:
		key_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3, 1.0))
	else:
		key_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7, 1.0))
	key_lbl.add_theme_font_size_override("font_size", 11)
	header_hbox.add_child(key_lbl)

	var name_lbl = Label.new()
	var m_name = member.get("name", "Hero")
	if is_dead:
		name_lbl.text = "💀 " + m_name
		name_lbl.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35, 1.0))
	else:
		name_lbl.text = m_name
		name_lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0, 1.0))
	name_lbl.clip_text = true
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lbl.add_theme_font_size_override("font_size", 11)
	header_hbox.add_child(name_lbl)
	vbox.add_child(header_hbox)

	# Portrait Image (centered)
	var portrait_box = CenterContainer.new()
	var portrait_rect = TextureRect.new()
	portrait_rect.custom_minimum_size = Vector2(56, 56)
	portrait_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED

	var p_path = member.get("portrait", "")
	if p_path != "" and ResourceLoader.exists(p_path):
		if not portrait_cache.has(p_path):
			portrait_cache[p_path] = load(p_path)
		portrait_rect.texture = portrait_cache[p_path]
	else:
		var cls = member.get("class", "fighter")
		var fallback_path = "res://assets/portraits/portrait_%s.png" % cls
		if ResourceLoader.exists(fallback_path):
			portrait_rect.texture = load(fallback_path)
		else:
			portrait_rect.texture = load("res://assets/portraits/portrait_fighter.png")

	if is_dead:
		portrait_rect.modulate = Color(1.0, 0.25, 0.25, 0.85) # Blood-red tint on portrait
	else:
		portrait_rect.modulate = Color(1.0, 1.0, 1.0, 1.0)

	portrait_box.add_child(portrait_rect)
	vbox.add_child(portrait_box)

	# HP Bar
	var hp_bar = ProgressBar.new()
	hp_bar.custom_minimum_size = Vector2(0, 10)
	hp_bar.show_percentage = false
	hp_bar.max_value = max_hp
	hp_bar.value = max(0, cur_hp)

	var pct = float(cur_hp) / max(1.0, float(max_hp))
	var fill_col = Color(0.2, 0.88, 0.4, 1.0)
	if is_dead:
		fill_col = Color(0.9, 0.15, 0.15, 1.0)
	elif pct <= 0.25:
		fill_col = Color(0.95, 0.25, 0.25, 1.0)
	elif pct <= 0.5:
		fill_col = Color(1.0, 0.78, 0.2, 1.0)

	var hp_fill = StyleBoxFlat.new()
	hp_fill.bg_color = fill_col
	hp_fill.corner_radius_top_left = 2
	hp_fill.corner_radius_top_right = 2
	hp_fill.corner_radius_bottom_left = 2
	hp_fill.corner_radius_bottom_right = 2
	hp_bar.add_theme_stylebox_override("fill", hp_fill)

	var hp_bg = StyleBoxFlat.new()
	hp_bg.bg_color = Color(0.22, 0.05, 0.05, 0.95) if is_dead else Color(0.08, 0.08, 0.1, 0.9)
	hp_bg.corner_radius_top_left = 2
	hp_bg.corner_radius_top_right = 2
	hp_bg.corner_radius_bottom_left = 2
	hp_bg.corner_radius_bottom_right = 2
	hp_bar.add_theme_stylebox_override("background", hp_bg)
	vbox.add_child(hp_bar)

	# HP Text
	var hp_text = Label.new()
	if is_dead:
		hp_text.text = "💀 DEAD (0/%d)" % max_hp
		hp_text.add_theme_color_override("font_color", Color(1.0, 0.25, 0.25, 1.0))
	else:
		hp_text.text = "%d/%d" % [cur_hp, max_hp]
		hp_text.add_theme_color_override("font_color", fill_col if pct <= 0.5 else Color(0.9, 0.95, 0.9, 1.0))
	hp_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hp_text.add_theme_font_size_override("font_size", 10)
	vbox.add_child(hp_text)

	# Status Effects Icons Container
	var effects = member.get("status_effects", [])
	if idx == 0 and GameState.status_effects.has(member.get("name", "")):
		effects = GameState.status_effects[member.get("name", "")]

	if effects.size() > 0:
		var effect_hbox = HBoxContainer.new()
		effect_hbox.alignment = BoxContainer.ALIGNMENT_CENTER
		effect_hbox.add_theme_constant_override("separation", 2)
		for eff in effects:
			var icon_rect = TextureRect.new()
			icon_rect.custom_minimum_size = Vector2(16, 16)
			icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			var icon_p = "res://assets/icons/status_effects/%s.png" % eff
			if ResourceLoader.exists(icon_p):
				icon_rect.texture = load(icon_p)
			icon_rect.tooltip_text = "Condition: %s
%s" % [eff.capitalize(), _get_condition_description(eff)]
			effect_hbox.add_child(icon_rect)
		vbox.add_child(effect_hbox)

	# Input handling for selection
	card.gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.pressed:
			if event.button_index == MOUSE_BUTTON_LEFT:
				if event.shift_pressed:
					GameState.toggle_party_member_selection(idx)
				else:
					GameState.select_party_member(idx)
			elif event.button_index == MOUSE_BUTTON_RIGHT:
				var canvas = get_parent()
				if canvas:
					var csw = canvas.find_child("CharacterStatusWindow", true, false)
					if csw and csw.has_method("open"):
						csw.open(idx)
	)

	return card


func _get_condition_description(eff: String) -> String:
	match eff:
		"blinded": return "Cannot see. Disadvantage on attacks; enemies have advantage."
		"charmed": return "Cannot attack the charmer. Charmer has advantage on social checks."
		"deafened": return "Cannot hear. Automatically fails checks that require hearing."
		"exhaustion": return "Fatigued. Speed halved; disadvantage on checks."
		"frightened": return "Terrified. Disadvantage on ability checks while source is in sight."
		"grappled": return "Held in place. Speed is 0."
		"incapacitated": return "Cannot take actions or reactions."
		"invisible": return "Unseen. Attacks against have disadvantage; sneak attack bonus."
		"paralyzed": return "Frozen. Incapacitated. Melee hits within 5ft are critical hits!"
		"petrified": return "Turned to solid stone. Incapacitated; immune to damage."
		"poisoned": return "Poison coursing through veins. Periodic damage and disadvantage."
		"prone": return "Knocked down. Crawling at half speed; melee attacks have advantage."
		"restrained": return "Bound. Speed 0; attacks against have advantage."
		"stunned": return "Dazed. Incapacitated, cannot move; attacks against have advantage."
		"unconscious": return "Knocked out. Incapacitated, drops items, prone."
		_: return "Active D&D 5e status condition."
