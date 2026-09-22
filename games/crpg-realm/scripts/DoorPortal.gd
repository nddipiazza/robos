class_name DoorPortal
extends Area2D

signal door_entered
signal door_unlocked

@export var door_id: String = "door-id-1"
@export var door_name: String = "Door"
@export var target_scene: String = ""
@export var target_spawn: Vector2 = Vector2.ZERO
@export var is_locked: bool = false
@export var required_key: String = ""
@export var opens_quest_stage: int = 0

@onready var sprite: Sprite2D = find_child("Sprite", true, false)
@onready var label: Label = find_child("Label", true, false)

func _ready() -> void:
	if label and door_name != "":
		label.text = door_name

func try_enter() -> bool:
	if is_locked:
		if required_key != "" and GameState.has_item(required_key):
			is_locked = false
			door_unlocked.emit()
			if label:
				label.text = "%s [Unlocked]" % door_name
			if opens_quest_stage > 0:
				GameState.advance_quest(opens_quest_stage)
			print("🚪 [DoorPortal] Unlocked '%s' (%s) using %s." % [door_name, door_id, required_key])
			GameState.log_message("system", "* Unlocked %s using %s." % [door_name, required_key])
		else:
			print("🔒 [DoorPortal] Door '%s' (%s) is locked. Requires key: %s." % [door_name, door_id, required_key])
			GameState.log_message("system", "* %s is locked! Requires key: %s." % [door_name, required_key])
			return false

	door_entered.emit()
	if target_spawn != Vector2.ZERO:
		GameState.spawn_position = target_spawn
	if target_scene != "":
		get_tree().change_scene_to_file(target_scene)
	return true

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		try_enter()
