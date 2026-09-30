class_name SettingsModal
extends Panel

signal settings_closed

@onready var btn_close: Button = find_child("BtnClose", true, false)
@onready var opt_health_bars: OptionButton = find_child("OptHealthBars", true, false)
@onready var chk_floating_text: CheckBox = find_child("ChkFloatingText", true, false)
@onready var chk_fog_of_war: CheckBox = find_child("ChkFogOfWar", true, false)
@onready var slider_fog_radius: HSlider = find_child("SliderFogRadius", true, false)
@onready var lbl_fog_radius_val: Label = find_child("LblFogRadiusVal", true, false)
@onready var lbl_map_fog_status: Label = find_child("LblMapFogStatus", true, false)
@onready var btn_toggle_map_fog: Button = find_child("BtnToggleMapFog", true, false)
@onready var chk_autopause_combat: CheckBox = find_child("ChkAutoPauseCombat", true, false)
@onready var chk_autopause_injured: CheckBox = find_child("ChkAutoPauseInjured", true, false)

func _ready() -> void:
	visible = false
	if btn_close:
		btn_close.pressed.connect(close)
	
	if opt_health_bars:
		opt_health_bars.clear()
		opt_health_bars.add_item("Always Visible", 0)
		opt_health_bars.add_item("Damaged Only", 1)
		opt_health_bars.add_item("Disabled", 2)
		opt_health_bars.item_selected.connect(_on_health_bar_mode_selected)
	
	if chk_floating_text:
		chk_floating_text.toggled.connect(func(val): GameState.update_setting("floating_text", val))
	if chk_fog_of_war:
		chk_fog_of_war.toggled.connect(func(val):
			GameState.update_setting("fog_of_war", val)
			_update_map_fog_ui()
		)
	if slider_fog_radius:
		slider_fog_radius.value_changed.connect(_on_fog_radius_changed)
	if btn_toggle_map_fog:
		btn_toggle_map_fog.pressed.connect(_on_toggle_map_fog_pressed)
	if chk_autopause_combat:
		chk_autopause_combat.toggled.connect(func(val): GameState.update_setting("auto_pause_combat", val))
	if chk_autopause_injured:
		chk_autopause_injured.toggled.connect(func(val): GameState.update_setting("auto_pause_injured", val))

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if (event.keycode == KEY_O or event.keycode == KEY_ESCAPE) and visible:
			close()
			get_viewport().set_input_as_handled()

func open() -> void:
	visible = true
	var vp_size = get_viewport_rect().size
	position = (vp_size - size) * 0.5
	_load_current_values()
	if AudioManager:
		AudioManager.play_sfx("wood_open")

func close() -> void:
	visible = false
	settings_closed.emit()

func _load_current_values() -> void:
	var mode = GameState.settings.get("health_bar_mode", "always")
	if opt_health_bars:
		match mode:
			"always": opt_health_bars.selected = 0
			"injured_only": opt_health_bars.selected = 1
			"none": opt_health_bars.selected = 2
			_: opt_health_bars.selected = 0
	
	if chk_floating_text:
		chk_floating_text.button_pressed = GameState.settings.get("floating_text", true)
	if chk_fog_of_war:
		chk_fog_of_war.button_pressed = GameState.settings.get("fog_of_war", true)
	var rad = float(GameState.settings.get("fog_of_war_radius", 425.0))
	if slider_fog_radius:
		slider_fog_radius.value = rad
	if lbl_fog_radius_val:
		var mult = rad / 340.0
		lbl_fog_radius_val.text = "%d px (%.2fx)" % [int(rad), mult]
	_update_map_fog_ui()
	if chk_autopause_combat:
		chk_autopause_combat.button_pressed = GameState.settings.get("auto_pause_combat", false)
	if chk_autopause_injured:
		chk_autopause_injured.button_pressed = GameState.settings.get("auto_pause_injured", false)

func _on_fog_radius_changed(val: float) -> void:
	if lbl_fog_radius_val:
		var mult = val / 340.0
		lbl_fog_radius_val.text = "%d px (%.2fx)" % [int(val), mult]
	GameState.update_setting("fog_of_war_radius", val)

func _update_map_fog_ui() -> void:
	var cur_scene = get_tree().current_scene if get_tree() else null
	var fow = cur_scene.find_child("FogOfWar", true, false) if cur_scene else null
	var fog_on = false
	if fow and fow.has_method("_is_fog_enabled"):
		fog_on = fow._is_fog_enabled()
	elif cur_scene and "is_town_or_interior" in cur_scene:
		fog_on = not bool(cur_scene.get("is_town_or_interior"))

	if lbl_map_fog_status:
		if fog_on:
			lbl_map_fog_status.text = "🌫️ ON (Active)"
			lbl_map_fog_status.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0, 1.0))
		else:
			lbl_map_fog_status.text = "☀️ OFF (Town/House)"
			lbl_map_fog_status.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3, 1.0))

func _on_toggle_map_fog_pressed() -> void:
	var cur_scene = get_tree().current_scene if get_tree() else null
	var fow = cur_scene.find_child("FogOfWar", true, false) if cur_scene else null
	if fow and fow.has_method("toggle_map_fog"):
		var new_st = fow.toggle_map_fog()
		GameState.log_message("system", "Fog of War toggled %s for current area." % ("ON" if new_st else "OFF"))
	elif fow and fow.has_method("set_map_fog_enabled"):
		fow.set_map_fog_enabled(not fow._is_fog_enabled())
	_update_map_fog_ui()

func _on_health_bar_mode_selected(index: int) -> void:
	var mode = "always"
	match index:
		0: mode = "always"
		1: mode = "injured_only"
		2: mode = "none"
	GameState.update_setting("health_bar_mode", mode)
	GameState.log_message("system", "Gameplay Setting: Overhead Health Bars set to '%s'" % mode.replace("_", " ").capitalize())
