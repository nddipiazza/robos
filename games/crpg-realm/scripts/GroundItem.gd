class_name GroundItem
extends Area2D

signal item_picked_up(item_id: String, item_name: String)

@export var item_id: String = "item-1"
@export var item_name: String = "Item"
@export var quantity: int = 1
@export var is_picked_up: bool = false
@export var icon_texture: Texture2D = null

@onready var sprite: Sprite2D = find_child("Sprite", true, false)
@onready var label: Label = find_child("Label", true, false)

func _ready() -> void:
	if label and item_name != "":
		label.text = item_name
	if sprite and icon_texture:
		sprite.texture = icon_texture

func pickup() -> bool:
	if is_picked_up:
		return false
	is_picked_up = true
	GameState.add_item(item_id)
	item_picked_up.emit(item_id, item_name)
	print("📦 [GroundItem] Picked up '%s' (%s)." % [item_name, item_id])
	queue_free()
	return true

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		pickup()
