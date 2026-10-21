extends "res://scripts/DungeonMap.gd"

const MAP_W := 8
const MAP_H := 32

## Princess Gwaelin is held in the cell at the east side of the cave (behind the door at (6,21)).
const GWAELIN_TILE := Vector2i(6, 19)

func _map_image_path() -> String:
    return "res://assets/maps/swamp-cave-b1.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dungeon_4.mp3"

func _get_npcs() -> Array:
    var gs := get_node_or_null("/root/GameState")
    if gs and "gwaelin_rescued" in gs and gs.gwaelin_rescued:
        return []
    return [
        {
            "tile": GWAELIN_TILE,
            "sprite_id": "princess",
            "facing": "down",
            "speaker": "Gwaelin",
            "on_talk": "_talk_gwaelin",
            "pages": [],
        },
    ]

func _talk_gwaelin() -> void:
    var gs := get_node_or_null("/root/GameState")
    var hero := "Erdrick"
    if gs:
        hero = str(gs.hero_stats.get("name", hero))
    _show_dialog("Gwaelin", [
        "Thou art brave indeed\nto rescue me, %s." % hero,
        "I am Gwaelin,\ndaughter of Lorik.",
        "Please take me back\nto my father.",
    ], Callable(self, "_rescue_gwaelin"))

func _rescue_gwaelin() -> void:
    var gs := get_node_or_null("/root/GameState")
    if gs:
        gs.gwaelin_rescued = true
        gs.inventory = _inventory.duplicate(true)
        gs.opened_chests = _opened_chests.duplicate(true)
    for i in range(_npc_sprites.size() - 1, -1, -1):
        if is_instance_valid(_npc_sprites[i]):
            _npc_sprites[i].queue_free()
    _npc_sprites.clear()
    _npc_data = []
    _show_dialog("", ["Princess Gwaelin\nclings to thee.\nTake her to King Lorik."])

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
