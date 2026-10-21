extends "res://scripts/DungeonMap.gd"

const MAP_W := 32
const MAP_H := 32

func _map_image_path() -> String:
    return "res://assets/maps/brecconary-1f.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/peaceful_village.mp3"

func _get_npcs() -> Array:
    return [
        {tile=Vector2i(18,8),  sprite_id="sage_alt", facing="down",  speaker="Shopkeeper", pages=["Welcome! Enter the shop and\nspeak to its keeper across\nthe desk."]},
        {tile=Vector2i(9,22),  sprite_id="sage_alt", facing="down",  speaker="Merchant",   pages=["Watch thy Hit Points\nwhen in the Poisonous Marsh."]},
        {tile=Vector2i(5,5),   sprite_id="minister", facing="down",  speaker="Innkeeper",  pages=["Go north to the seashore, then\nfollow the coastline west until\nthou hath reached Garinham."], inn_cost=6},
        {tile=Vector2i(6,5),   sprite_id="sage_alt", facing="down",  speaker="Merchant",   shop_id="bre001"},
        {tile=Vector2i(26,26), sprite_id="sage_alt", facing="left",  speaker="Merchant",   shop_id="bre002"},
        {tile=Vector2i(25,5),  sprite_id="lady",     facing="left",  speaker="Lady",       shop_id="bre003"},
        {tile=Vector2i(15,2),  sprite_id="guard",    facing="down",  speaker="Guard",      pages=["Thou art most welcome\nin Brecconary."]},
        {tile=Vector2i(20,15), sprite_id="lady",     facing="down",  speaker="Villager",   pages=["No, I am not Princess Gwaelin."]},
        {tile=Vector2i(25,20), sprite_id="guard",    facing="left",  speaker="Soldier",    pages=["Many have been the warriors\nwho have perished on this quest.\nBut for thee I wish success,\nHero."]},
        {tile=Vector2i(8,28),  sprite_id="sage",     facing="down",  speaker="Old Man",    pages=["If thou art cursed, come again."]},
        {tile=Vector2i(22,8),  sprite_id="minister", facing="down",  speaker="Wise Man",   pages=["There is a town where magic\nkeys can be purchased."]},
        {tile=Vector2i(4,18),  sprite_id="lady",     facing="right", speaker="Villager",   pages=["Art thou the descendant\nof Erdrick? Hast thou\nany proof?"]},
        {tile=Vector2i(28,26), sprite_id="guard",    facing="left",  speaker="Soldier",    pages=["Beware the bridges! Danger\ngrows when thou crosses."]},
    ]

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    if tile.x == 0 or tile.x == MAP_W - 1 or tile.y == 0 or tile.y == MAP_H - 1:
        return _pixel_is_walkable(tile)
    return super._is_walkable(tile)

func _check_transitions() -> void:
    if _hero_tile.x == 0 or _hero_tile.x == MAP_W - 1 or _hero_tile.y == 0 or _hero_tile.y == MAP_H - 1:
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(50, 43), "down", "world_map")
        return



