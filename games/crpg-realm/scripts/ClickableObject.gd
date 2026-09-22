class_name ClickableObject
extends Area2D

signal body_clicked

@export var npc_id: String = ""
@export var target_id: String = ""

func interact() -> void:
	body_clicked.emit()

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		body_clicked.emit()
