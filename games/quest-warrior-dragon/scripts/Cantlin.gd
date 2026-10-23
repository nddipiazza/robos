extends "res://scripts/DungeonMap.gd"

const MAP_W := 32
const MAP_H := 32

func _map_image_path() -> String:
    return "res://assets/maps/cantlin-1f.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/peaceful_village.mp3"

func _get_npcs() -> Array:
    return [
        {tile=Vector2i(23,25), sprite_id="sage_alt", facing="down",  speaker="Weapon Dealer", pages=["My shop carries the finest\nweapons in all Alefgard.\nOnly the bravest warriors\nshop here."]},
        {tile=Vector2i(9,11),  sprite_id="sage_alt", facing="down",  speaker="Armor Dealer",  pages=["Erdrick's Shield can block\nany blow. But that which\nyou seek lies elsewhere."]},
        {tile=Vector2i(5,5),   sprite_id="minister", facing="down",  speaker="Innkeeper",     pages=["Many brave souls have rested\nhere before setting forth\nto face the Dragonlord."]},
        {tile=Vector2i(15,5),  sprite_id="guard",    facing="down",  speaker="Guard",         pages=["Cantlin is the last town\nbefore the Dragonlord's lair.\nBe prepared, Hero."]},
        {tile=Vector2i(25,10), sprite_id="lady",     facing="left",  speaker="Villager",      pages=["The warriors here are brave.\nThey have vowed to fight\nthe Dragonlord's forces."]},
        {tile=Vector2i(8,20),  sprite_id="sage",     facing="right", speaker="Elder",         pages=["The Dragonlord's castle\nlies on an island to the\nnorth. Take heed, Hero."]},
        {tile=Vector2i(20,20), sprite_id="sage",     facing="up",    speaker="Wise Man",      pages=["With the Rainbow Drop thou\ncanst build a bridge to\nCharlock Castle."]},
        {tile=Vector2i(12,28), sprite_id="guard",    facing="down",  speaker="Soldier",       pages=["We stand guard against\nthe forces of evil.\nThey will not pass!"]},
        {tile=Vector2i(26,5),  sprite_id="red_guard",facing="left",  speaker="Guard Captain", pages=["All of Cantlin's warriors\nstand ready to defend\nagainst the Dragonlord."]},
        {tile=Vector2i(23,5),  sprite_id="sage_alt", facing="down",  speaker="Merchant",      shop_id="can001"},
        {tile=Vector2i(25,13), sprite_id="sage_alt", facing="down",  speaker="Merchant",      shop_id="can002"},
        {tile=Vector2i(28,7),  sprite_id="sage_alt", facing="down",  speaker="Shopkeeper",    shop_id="can004"},
        {tile=Vector2i(28,27), sprite_id="sage_alt", facing="down",  speaker="Shopkeeper",    shop_id="can005"},
        {tile=Vector2i(3,8),   sprite_id="sage_alt", facing="down",  speaker="Shopkeeper",    shop_id="can007"},
        {tile=Vector2i(4,26),  sprite_id="minister", facing="down",  speaker="Innkeeper",     inn_cost=6},
    ]

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    if tile.x == 0 or tile.x == MAP_W - 1 or tile.y == 0 or tile.y == MAP_H - 1:
        return _pixel_is_walkable(tile)
    return super._is_walkable(tile)

func _check_transitions() -> void:
    if _hero_tile.x == 0 or _hero_tile.x == MAP_W - 1 or _hero_tile.y == 0 or _hero_tile.y == MAP_H - 1:
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(75, 104), "down", "world_map")
        return


