extends "res://scripts/DungeonMap.gd"

const MAP_W := 30
const MAP_H := 31

func _map_image_path() -> String:
    return "res://assets/maps/charlock-castle-b7.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dragonlord.mp3"

func _get_npcs() -> Array:
    return [
        {
            "tile": Vector2i(16, 24),
            "sprite_id": "dragonlord",
            "facing": "left",
            "speaker": "Dragonlord",
            "pages": [
                "Welcome, descendant of\nErdrick! I am the Dragonlord,\nKing of Kings!",
                "I give thee a choice: rule\nhalf the world at my side,\nor perish in flames!"
            ]
        }
    ]

func _check_transitions() -> void:
    pass

