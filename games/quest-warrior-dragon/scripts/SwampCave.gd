extends "res://scripts/DungeonMap.gd"

const MAP_W := 8
const MAP_H := 32

func _map_image_path() -> String:
    return "res://assets/maps/swamp-cave-b1.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dungeon_4.mp3"

func _get_npcs() -> Array:
    return [
        {
            "tile": Vector2i(6, 19),
            "sprite_id": "princess",
            "facing": "down",
            "speaker": "Princess Gwaelin",
            "pages": [
                "Thou art brave indeed to\nrescue me from this dread\nSwamp Cave, Hero!",
                "Take me now to my father,\nKing Lorik, at Tantegel\nCastle!"
            ]
        }
    ]

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    if (tile == Vector2i(3, 0)) or (tile == Vector2i(3, MAP_H - 1)):
        return _pixel_is_walkable(tile)
    return super._is_walkable(tile)

func _check_transitions() -> void:
    if _hero_tile == Vector2i(3, 0):
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(106, 46), _vec_to_facing(_hero_facing), "world_map")
        return
    if _hero_tile == Vector2i(3, MAP_H - 1):
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(106, 51), _vec_to_facing(_hero_facing), "world_map")
        return

