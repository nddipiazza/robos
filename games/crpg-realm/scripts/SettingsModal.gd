class_name SettingsModal
extends Panel

signal settings_closed

@onready var btn_close: Button = find_child("BtnClose", true, false)
@onready var opt_health_bars: OptionButton = find_child("OptHealthBars", true, false)
@onready var chk_floating_text: CheckBox = find_child("ChkFloatingText", true, false)
@onready var chk_fog_of_war: CheckBox = find_child("ChkFogOfWar", true, false)
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
		chk_fog_of_war.toggled.connect(func(val): GameState.update_setting("fog_of_war", val))
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
	if chk_autopause_combat:
		chk_autopause_combat.button_pressed = GameState.settings.get("auto_pause_combat", false)
	if chk_autopause_injured:
		chk_autopause_injured.button_pressed = GameState.settings.get("auto_pause_injured", false)

func _on_health_bar_mode_selected(index: int) -> void:
	var mode = "always"
	match index:
		0: mode = "always"
		1: mode = "injured_only"
		2: mode = "none"
	GameState.update_setting("health_bar_mode", mode)
	GameState.log_message("system", "Gameplay Setting: Overhead Health Bars set to '%s'" % mode.replace("_", " ").capitalize())
