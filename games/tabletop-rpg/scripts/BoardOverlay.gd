# RobOS Tabletop RPG: BoardOverlay
# Renders grid, dynamic Fog of War, doors, furniture, monsters, and heroes on top of the board sprite.
extends Node2D

@onready var world = get_parent()

func _draw() -> void:
	if world and world.has_method("_draw_board"):
		world._draw_board(self)
