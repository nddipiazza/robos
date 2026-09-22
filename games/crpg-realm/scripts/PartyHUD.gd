class_name PartyHUD
extends Panel

signal pause_toggled

@onready var hero_name_label = find_child("HeroNameLabel", true, false)
@onready var hp_bar = find_child("HPBar", true, false)
@onready var hp_label = find_child("HPLabel", true, false)
@onready var quest_label = find_child("QuestLabel", true, false)
@onready var pause_btn = find_child("BtnPause", true, false)
@onready var options_btn = find_child("BtnOptions", true, false)
@onready var inventory_btn = find_child("BtnInventory", true, false)

var is_paused: bool = false
var pause_banner: PanelContainer = null

func _ready() -> void:
	# Anchor cleanly across bottom edge
	anchors_preset = Control.PRESET_BOTTOM_WIDE
	anchor_top = 1.0
	anchor_bottom = 1.0
	anchor_left = 0.0
	anchor_right = 1.0
	offset_top = -64.0
	offset_bottom = 0.0
	offset_left = 0.0
	offset_right = 0.0
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BEGIN

	if pause_btn:
		pause_btn.anchor_left = 1.0
		pause_btn.anchor_right = 1.0
		pause_btn.offset_left = -140.0
		pause_btn.offset_right = -30.0
		pause_btn.pressed.connect(toggle_pause)
	if inventory_btn:
		inventory_btn.anchor_left = 1.0
		inventory_btn.anchor_right = 1.0
		inventory_btn.offset_left = -265.0
		inventory_btn.offset_right = -155.0
		inventory_btn.pressed.connect(toggle_inventory)
	if options_btn:
		options_btn.anchor_left = 1.0
		options_btn.anchor_right = 1.0
		options_btn.offset_left = -390.0
		options_btn.offset_right = -280.0
		options_btn.pressed.connect(toggle_options)

	var char_btn = find_child("BtnCharacter", true, false)
	if not char_btn:
		char_btn = Button.new()
		char_btn.name = "BtnCharacter"
		char_btn.text = "Sheet (C)"
		char_btn.custom_minimum_size = Vector2(115, 36)
		char_btn.anchor_left = 1.0
		char_btn.anchor_right = 1.0
		char_btn.anchor_top = 0.5
		char_btn.anchor_bottom = 0.5
		char_btn.offset_left = -525.0
		char_btn.offset_right = -410.0
		char_btn.offset_top = -18.0
		char_btn.offset_bottom = 18.0
		char_btn.add_theme_font_size_override("font_size", 12)
		char_btn.add_theme_color_override("font_color", Color(1.0, 0.9, 0.5, 1.0))
		add_child(char_btn)
	char_btn.pressed.connect(func(): toggle_character_status())

	# Clean up any legacy single-hero status block if present in scenes
	for legacy_name in ["HeroNameLabel", "HeroLabel", "HPBar", "HPLabel"]:
		var legacy_node = find_child(legacy_name, true, false)
		if legacy_node:
			legacy_node.queue_free()
	hero_name_label = null
	hp_bar = null
	hp_label = null

	if quest_label:
		quest_label.offset_left = 20.0
		quest_label.offset_top = 4.0
		quest_label.offset_right = 720.0
		quest_label.offset_bottom = 22.0
		quest_label.add_theme_font_size_override("font_size", 12)

	update_hero_stats()
	GameState.hero_damaged.connect(func(_cur, _max): update_hero_stats())
	GameState.pause_toggled.connect(_on_pause_toggled)

	call_deferred("_setup_pause_banner")
	call_deferred("_setup_toolbars")
	_on_pause_toggled(GameState.is_game_paused)

func _setup_pause_banner() -> void:
	var canvas = get_parent()
	if not canvas:
		return
	pause_banner = canvas.find_child("PauseBanner", true, false)
	if not pause_banner:
		pause_banner = PanelContainer.new()
		pause_banner.name = "PauseBanner"
		pause_banner.visible = GameState.is_game_paused
		pause_banner.custom_minimum_size = Vector2(680, 52)
		pause_banner.anchors_preset = Control.PRESET_TOP_WIDE
		pause_banner.anchor_left = 0.5
		pause_banner.anchor_right = 0.5
		pause_banner.anchor_top = 0.0
		pause_banner.anchor_bottom = 0.0
		pause_banner.offset_left = -340.0
		pause_banner.offset_right = 340.0
		pause_banner.offset_top = 24.0
		pause_banner.offset_bottom = 76.0
		pause_banner.grow_horizontal = Control.GROW_DIRECTION_BOTH

		var sb = StyleBoxFlat.new()
		sb.bg_color = Color(0.12, 0.08, 0.16, 0.94)
		sb.border_width_left = 2
		sb.border_width_top = 2
		sb.border_width_right = 2
		sb.border_width_bottom = 2
		sb.border_color = Color(1.0, 0.8, 0.2, 1.0)
		sb.corner_radius_top_left = 6
		sb.corner_radius_top_right = 6
		sb.corner_radius_bottom_left = 6
		sb.corner_radius_bottom_right = 6
		sb.shadow_color = Color(0.9, 0.7, 0.1, 0.45)
		sb.shadow_size = 10
		pause_banner.add_theme_stylebox_override("panel", sb)

		var lbl = Label.new()
		lbl.text = "⏸️ [ PAUSED - REAL TIME WITH PAUSE (SPACEBAR TO RESUME) ]"
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lbl.add_theme_font_size_override("font_size", 14)
		lbl.add_theme_color_override("font_color", Color(1.0, 0.9, 0.35, 1.0))
		lbl.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 1.0))
		lbl.add_theme_constant_override("shadow_offset_y", 2)
		pause_banner.add_child(lbl)

		canvas.add_child(pause_banner)

func _setup_toolbars() -> void:
	var canvas = get_parent()
	if not canvas:
		return

	if not canvas.find_child("PortraitToolbar", true, false):
		var pt_scene = load("res://scenes/components/PortraitToolbar.tscn")
		if pt_scene:
			var pt = pt_scene.instantiate()
			canvas.add_child(pt)

	var at = find_child("ActionToolbar", true, false)
	if not at and canvas:
		at = canvas.find_child("ActionToolbar", true, false)
	if not at:
		var at_scene = load("res://scenes/components/ActionToolbar.tscn")
		if at_scene:
			at = at_scene.instantiate()
			add_child(at)
	elif at.get_parent() != self:
		at.get_parent().remove_child(at)
		add_child(at)

	if at:
		at.custom_minimum_size = Vector2(660, 32)
		at.anchors_preset = Control.PRESET_TOP_LEFT
		at.anchor_left = 0.0
		at.anchor_right = 0.0
		at.anchor_top = 0.0
		at.anchor_bottom = 0.0
		at.offset_left = 20.0
		at.offset_top = 24.0
		at.offset_right = 680.0
		at.offset_bottom = 58.0
		at.grow_horizontal = Control.GROW_DIRECTION_END
		at.grow_vertical = Control.GROW_DIRECTION_END

	if not canvas.find_child("ShopWindow", true, false):
		var sw_scene = load("res://scenes/components/ShopWindow.tscn")
		if sw_scene:
			var sw = sw_scene.instantiate()
			sw.visible = false
			canvas.add_child(sw)

	if not canvas.find_child("CharacterStatusWindow", true, false):
		var cs_scene = load("res://scenes/components/CharacterStatusWindow.tscn")
		if cs_scene:
			var cs = cs_scene.instantiate()
			cs.name = "CharacterStatusWindow"
			cs.visible = false
			canvas.add_child(cs)

func update_hero_stats() -> void:
	if hero_name_label:
		hero_name_label.text = GameState.hero_name + " (" + GameState.hero_class.capitalize() + ")"
	if hp_bar:
		hp_bar.max_value = GameState.hero_max_hp
		hp_bar.value = GameState.hero_hp
		var pct = float(GameState.hero_hp) / max(1.0, float(GameState.hero_max_hp))
		var fill_col = Color(0.2, 0.88, 0.4, 1.0)
		if pct <= 0.25:
			fill_col = Color(0.95, 0.25, 0.25, 1.0)
		elif pct <= 0.5:
			fill_col = Color(1.0, 0.78, 0.2, 1.0)
		var fill_style = StyleBoxFlat.new()
		fill_style.bg_color = fill_col
		fill_style.corner_radius_top_left = 2
		fill_style.corner_radius_top_right = 2
		fill_style.corner_radius_bottom_left = 2
		fill_style.corner_radius_bottom_right = 2
		hp_bar.add_theme_stylebox_override("fill", fill_style)
		var bg_style = StyleBoxFlat.new()
		bg_style.bg_color = Color(0.1, 0.1, 0.12, 0.85)
		bg_style.corner_radius_top_left = 2
		bg_style.corner_radius_top_right = 2
		bg_style.corner_radius_bottom_left = 2
		bg_style.corner_radius_bottom_right = 2
		hp_bar.add_theme_stylebox_override("background", bg_style)
	if hp_label:
		hp_label.text = "%d/%d  |  AC: %d" % [GameState.hero_hp, GameState.hero_max_hp, GameState.hero_ac]

func update_display(quest_text: String) -> void:
	if quest_label:
		quest_label.text = quest_text

func toggle_pause() -> void:
	GameState.toggle_pause()

func _on_pause_toggled(p_paused: bool) -> void:
	is_paused = p_paused
	if pause_btn:
		pause_btn.text = "RESUME" if is_paused else "PAUSE"
		pause_btn.modulate = Color(1.2, 0.7, 0.4, 1.0) if is_paused else Color(1.0, 1.0, 1.0, 1.0)
	if not pause_banner:
		var canvas = get_parent()
		if canvas:
			pause_banner = canvas.find_child("PauseBanner", true, false)
	if pause_banner:
		pause_banner.visible = is_paused

func toggle_options() -> void:
	var sm = get_parent().find_child("SettingsModal", true, false)
	if sm:
		if sm.visible:
			sm.close()
		else:
			sm.open()

func toggle_inventory() -> void:
	var inv = get_parent().find_child("InventoryWindow", true, false)
	if inv:
		inv.toggle()


func toggle_character_status(member_idx: int = -1) -> void:
	var canvas = get_parent()
	if not canvas:
		return
	var csw = canvas.find_child("CharacterStatusWindow", true, false)
	if csw and csw.has_method("toggle"):
		csw.toggle(member_idx)
