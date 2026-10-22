extends "res://scripts/DungeonMap.gd"

const MAP_W := 30
const MAP_H := 31

## The Dragonlord waits upon his throne. The hero speaks to him from the carpet tile to the west.
const DRAGONLORD_TILE := Vector2i(16, 24)

func _map_image_path() -> String:
    return "res://assets/maps/charlock-castle-b7.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dragonlord.mp3"

func _get_npcs() -> Array:
    var gs := get_node_or_null("/root/GameState")
    if gs and "dragonlord_defeated" in gs and gs.dragonlord_defeated:
        return []
    return [
        {
            "tile": DRAGONLORD_TILE,
            "sprite_id": "dragonlord",
            "facing": "left",
            "speaker": "Dragonlord",
            "on_talk": "_talk_dragonlord",
            "pages": [],
        },
    ]

func _talk_dragonlord() -> void:
    var gs := get_node_or_null("/root/GameState")
    var hero := "Erdrick"
    if gs:
        hero = str(gs.hero_stats.get("name", hero))
    _show_dialog("Dragonlord", [
        "Welcome, %s.\nI am the Dragonlord,\nKing of Kings." % hero,
        "I have been waiting\nlong for one such\nas thee.",
        "If thou wilt join me,\nI will give thee half\nof the world.",
    ], Callable(self, "_ask_join_dragonlord"))

func _ask_join_dragonlord() -> void:
    var on_yes := func():
        _show_dialog("Dragonlord", [
            "Really?",
            "Then half of this\nworld is thine...",
            "...but thou art\ntoo pure of heart.\nThe darkness rejects thee!",
        ], Callable(self, "_begin_dragonlord_battle"))
    var on_no := func():
        _show_dialog("Dragonlord", [
            "Thou art a fool!",
            "Then thou shalt die\nby my hand!",
        ], Callable(self, "_begin_dragonlord_battle"))
    _open_choice("Wilt thou join me?", on_yes, on_no)

func _begin_dragonlord_battle() -> void:
    var mon := _get_monster("dragonlord_form1")
    if mon.is_empty():
        _show_dialog("", ["The Dragonlord\nvanishes in a puff\nof smoke..."])
        return
    _start_battle("dragonlord_form1", mon)

func _on_battle_won(mon_key: String) -> void:
    if not mon_key.begins_with("dragonlord"):
        return
    var gs := get_node_or_null("/root/GameState")
    if gs:
        gs.dragonlord_defeated = true
        # NES: the Ball of Light restores the hero fully for the walk home.
        gs.hero_stats["hp"] = int(gs.hero_stats.get("hp_max", 1))
        gs.hero_stats["mp"] = int(gs.hero_stats.get("mp_max", 0))
        gs.inventory = _inventory.duplicate(true)
        gs.opened_chests = _opened_chests.duplicate(true)
    # Remove the Dragonlord from the throne room.
    for i in range(_npc_sprites.size() - 1, -1, -1):
        if is_instance_valid(_npc_sprites[i]):
            _npc_sprites[i].queue_free()
    _npc_sprites.clear()
    _npc_data = []
    var hero := "Erdrick"
    if gs:
        hero = str(gs.hero_stats.get("name", hero))
    _show_dialog("", [
        "%s holds the Ball of\nLight aloft." % hero,
        "A brilliant flash covers\nAlefgard. The darkness\nof Charlock is no more.",
        "Return to Tantegel\nCastle and tell King\nLorik of thy victory!",
    ], Callable(self, "_ball_of_light_warp"))

## NES: after the Dragonlord falls the screen flashes white and the hero is
## standing outside Charlock Castle on a peaceful, monster-free Alefgard.
func _ball_of_light_warp() -> void:
    _move_enabled = false
    var layer := CanvasLayer.new()
    layer.layer = 15
    add_child(layer)
    var rect := ColorRect.new()
    rect.color = Color.TRANSPARENT
    rect.size = Vector2(VW, VH)
    rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
    layer.add_child(rect)
    _play_sfx("res://assets/music/mp3/special_item.mp3")
    var tw := create_tween()
    tw.tween_property(rect, "color", Color.WHITE, 0.4)
    tw.tween_interval(0.8)
    tw.tween_property(rect, "color", Color.BLACK, 0.6)
    await tw.finished
    _transition_to("res://scenes/WorldMap.tscn", Vector2i(50, 50), "down", "world_map")

func _check_transitions() -> void:
    pass
