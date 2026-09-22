class_name TreasureChest
extends Area2D

signal chest_opened

@export var is_opened: bool = false
@onready var label = $Label

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		if not is_opened:
			is_opened = true
			label.text = "[Chest Opened]"
			chest_opened.emit()
