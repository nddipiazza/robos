extends "res://scripts/DungeonMap.gd"

const MAP_W := 22
const MAP_H := 22

func _map_image_path() -> String:
    return "res://assets/maps/charlock-castle-1f.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dungeon_6.mp3"

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    if (tile == Vector2i(10, MAP_H - 1)):
        return _pixel_is_walkable(tile)
    return super._is_walkable(tile)

func _check_transitions() -> void:
    if _hero_tile == Vector2i(10, MAP_H - 1):
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(50, 50), _vec_to_facing(_hero_facing), "world_map")
        return

