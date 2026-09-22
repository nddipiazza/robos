extends Node2D

@onready var combat_manager = $CombatManager
@onready var hud = $CanvasLayer/PartyHUD

var is_paused: bool = false

func _ready() -> void:
	print("Realm of Heroes: Initializing cRPG Runtime...")
	connect_hud_signals()
	spawn_party()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_pause"):
		toggle_pause_state()

func toggle_pause_state() -> void:
	is_paused = !is_paused
	combat_manager.set_paused(is_paused)
	hud.set_pause_indicator(is_paused)
	print("Combat Pause State: ", "PAUSED" if is_paused else "ACTIVE")

func connect_hud_signals() -> void:
	hud.pause_toggled.connect(toggle_pause_state)

func spawn_party() -> void:
	print("Party initialized: Fighter, Cleric, Wizard, Rogue ready for adventure.")
