extends "res://scripts/DungeonMap.gd"

const MAP_W := 12
const MAP_H := 12

func _map_image_path() -> String:
    return "res://assets/maps/charlock-castle-b2.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dungeon_7.mp3"

func _check_transitions() -> void:
    pass

