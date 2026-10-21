extends "res://scripts/DungeonMap.gd"

const MAP_W := 26
const MAP_H := 26

func _map_image_path() -> String:
    return "res://assets/maps/kol-1f.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/peaceful_village.mp3"

func _get_npcs() -> Array:
    return [
        {tile=Vector2i(10,17), sprite_id="sage_alt", facing="down",  speaker="Shopkeeper", pages=["East of Hauksness there is a\ntown, 'tis said, where one may\npurchase weapons of extraordinary\nquality."]},
        {tile=Vector2i(21,6),  sprite_id="minister", facing="down",  speaker="Innkeeper",  pages=["This bath cures rheumatism.\nRest and be refreshed,\nweary traveler."], inn_cost=0},
        {tile=Vector2i(2,2),   sprite_id="sage",     facing="right", speaker="Elder",      pages=["This is the village of Kol."]},
        {tile=Vector2i(23,13), sprite_id="sage_alt", facing="down",  speaker="Shopkeeper", shop_id="kol001"},
        {tile=Vector2i(15,22), sprite_id="sage_alt", facing="down",  speaker="Shopkeeper", shop_id="kol002"},
        {tile=Vector2i(18,14), sprite_id="lady",     facing="left",  speaker="Villager",   pages=["Please, save us from the\nminions of the Dragonlord."]},
        {tile=Vector2i(6,20),  sprite_id="sage",     facing="up",    speaker="Wise Man",   pages=["In legends it is said that\nfairies know how to put\nGolem to sleep."]},
        {tile=Vector2i(22,20), sprite_id="guard",    facing="down",  speaker="Soldier",    pages=["Hast thou seen Nester? I\nthink he may need help."]},
        {tile=Vector2i(4,12),  sprite_id="lady",     facing="right", speaker="Villager",   pages=["Art thou the descendant\nof Erdrick? Hast thou\nany proof?"]},
    ]

func _is_walkable(tile: Vector2i) -> bool:
    if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
        return false
    if tile.x == 0 or tile.x == MAP_W - 1 or tile.y == 0 or tile.y == MAP_H - 1:
        return _pixel_is_walkable(tile)
    return super._is_walkable(tile)

func _check_transitions() -> void:
    if _hero_tile.x == 0 or _hero_tile.x == MAP_W - 1 or _hero_tile.y == 0 or _hero_tile.y == MAP_H - 1:
        _transition_to("res://scenes/WorldMap.tscn", Vector2i(106, 12), "down", "world_map")
        return


func _cmd_search() -> void:
    if _hero_tile == Vector2i(10, 7):
        if _opened_chests.get("kol_fairy_flute", false):
            _show_dialog("", ["Thou hast already found\nthe Fairy Flute here."])
        else:
            _opened_chests["kol_fairy_flute"] = true
            _inventory.append({"name": "Fairy Flute", "id": "fairy_flute",
                "desc": "A flute that puts\nGolem to sleep."})
            var gs := get_node_or_null("/root/GameState")
            if gs:
                gs.inventory = _inventory.duplicate(true)
                gs.opened_chests = _opened_chests.duplicate()
            _show_dialog("", ["Thou hast found the\nFairy Flute!"])
    else:
        super._cmd_search()

