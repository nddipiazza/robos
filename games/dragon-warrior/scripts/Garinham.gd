extends "res://scripts/DungeonMap.gd"

const MAP_W := 22
const MAP_H := 22

func _map_image_path() -> String:
    return "res://assets/maps/garinham-1f.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/peaceful_village.mp3"

func _get_npcs() -> Array:
    return [
        {tile=Vector2i(13,8),  sprite_id="sage_alt", facing="down",  speaker="Shopkeeper", pages=["Garin, a wandering minstrel of\nlegendary fame, is said to have\nbuilt this town."]},
        {tile=Vector2i(4,15),  sprite_id="minister", facing="down",  speaker="Innkeeper",  pages=["Welcome to Garinham. May\nthy stay be a peaceful one."]},
        {tile=Vector2i(4,5),   sprite_id="sage",     facing="right", speaker="Elder",      pages=["Many believe that Princess\nGwaelin is hidden away in a cave."]},
        {tile=Vector2i(10,12), sprite_id="guard",    facing="down",  speaker="Soldier",    pages=["I have heard of one named\nNester. Dost thou know such one?"]},
        {tile=Vector2i(16,10), sprite_id="lady",     facing="left",  speaker="Villager",   pages=["It is said that the Princess\nwas kidnapped and taken eastward."]},
        {tile=Vector2i(17,17), sprite_id="guard",    facing="down",  speaker="Guard",      pages=["Garin's Grave lies to the east.\nOnly the brave dare enter."]},
        {tile=Vector2i(11,19), sprite_id="sage_alt", facing="down",  speaker="Merchant",   shop_id="gar002"},
        {tile=Vector2i(6,12),  sprite_id="sage_alt", facing="down",  speaker="Shopkeeper", shop_id="gar001"},
        {tile=Vector2i(6,3),   sprite_id="minister", facing="down",  speaker="Innkeeper",  inn_cost=6},
    ]

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    if tile.x == 0 or tile.x == MAP_W - 1 or tile.y == 0 or tile.y == MAP_H - 1:
        return _pixel_is_walkable(tile)
    return super._is_walkable(tile)

func _check_transitions() -> void:
    if _hero_tile.x == 0 or _hero_tile.x == MAP_W - 1 or _hero_tile.y == 0 or _hero_tile.y == MAP_H - 1:
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(4, 4), "down", "world_map")
        return


