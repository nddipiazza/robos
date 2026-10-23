extends "res://scripts/DungeonMap.gd"

const MAP_W := 32
const MAP_H := 32

func _map_image_path() -> String:
    return "res://assets/maps/rimuldar-1f.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/peaceful_village.mp3"

func _get_npcs() -> Array:
    return [
        {tile=Vector2i(27,14), sprite_id="sage_alt", facing="down",  speaker="Key Merchant",  pages=["Magic Keys unlock any door.\nBuy some before exploring\nthe dungeons."]},
        {tile=Vector2i(12,22), sprite_id="sage_alt", facing="down",  speaker="Weapon Dealer", pages=["A warrior without a good sword\nis no warrior at all.\nBrowse my finest wares."]},
        {tile=Vector2i(17,19),   sprite_id="sage_alt", facing="right",  speaker="Innkeeper",     pages=["Rest here and restore\nthy strength, weary traveler."], inn_cost=6},
        {tile=Vector2i(15,5),  sprite_id="guard",    facing="down",  speaker="Guard",         pages=["Rimuldar is the only place\nto buy Magic Keys in all\nof Alefgard."]},
        {tile=Vector2i(22,15), sprite_id="lady",     facing="left",  speaker="Villager",      pages=["The swamps to the north\nare treacherous. Watch\nthy step, Hero."]},
        {tile=Vector2i(7,27),  sprite_id="sage",     facing="up",    speaker="Elder",         pages=["The Golem blocks the path\nto Cantlin. Find the Silver\nFlute to pass."]},
        {tile=Vector2i(28,25), sprite_id="sage",     facing="down",  speaker="Wise Man",      pages=["The Stones of Sunlight\nand Rain will reveal a\npath across the sea."]},
        {tile=Vector2i(18,27), sprite_id="guard",    facing="right", speaker="Soldier",       pages=["Keys of magic can open\nany lock. Buy them here\nin Rimuldar."]},
        {tile=Vector2i(24,8),  sprite_id="sage_alt", facing="down",  speaker="Merchant",      shop_id="rim001"},
        {tile=Vector2i(5,8),   sprite_id="sage_alt", facing="down",  speaker="Shopkeeper",    shop_id="rim002"},
    ]

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    if tile.x == 0 or tile.x == MAP_W - 1 or tile.y == 0 or tile.y == MAP_H - 1:
        return _pixel_is_walkable(tile)
    return super._is_walkable(tile)

func _check_transitions() -> void:
    if _hero_tile.x == 0 or _hero_tile.x == MAP_W - 1 or _hero_tile.y == 0 or _hero_tile.y == MAP_H - 1:
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(104, 74), "down", "world_map")
        return


