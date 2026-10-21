extends "res://scripts/DungeonMap.gd"

const MAP_W := 22
const MAP_H := 22

func _map_image_path() -> String:
    return "res://assets/maps/garinham-b3.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dungeon_2.mp3"

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    return super._is_walkable(tile)

func _check_transitions() -> void:
    pass

