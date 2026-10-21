extends "res://scripts/DungeonMap.gd"

const MAP_W := 12
const MAP_H := 12

func _map_image_path() -> String:
	return "res://assets/maps/southern-cave-b1.png"

func _get_map_w() -> int:
	return MAP_W

func _get_map_h() -> int:
	return MAP_H

func _get_music_path() -> String:
	return "res://assets/music/mp3/tantegel_castle_lower.mp3"

func _get_npcs() -> Array:
	return [
		{
			"tile": Vector2i(6, 5),
			"sprite_id": "sage",
			"facing": "down",
			"speaker": "Sanctum Elder",
			"pages": [
				"Thou hast proven thy lineage\nwith the Token of Erdrick!",
				"In the name of the ancients,\ntake the Rainbow Drop and span\nthe sea to Charlock!"
			]
		}
	]

func _is_walkable(tile: Vector2i) -> bool:
	if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
		return false
	if tile == Vector2i(1, 5):
		return true
	return super._is_walkable(tile)

func _check_transitions() -> void:
	pass
