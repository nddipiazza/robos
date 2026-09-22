class_name BuildingStructure
extends Node2D

@export var building_id: String = "building-1"
@export var building_name: String = "Building"
@export var building_texture: Texture2D = null

@onready var sprite: Sprite2D = find_child("Sprite", true, false)
@onready var label: Label = find_child("Label", true, false)

func _ready() -> void:
	if sprite and building_texture:
		sprite.texture = building_texture
	if label and building_name != "":
		label.text = building_name
