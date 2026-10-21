extends "res://scripts/DungeonMap.gd"

const MAP_W := 22
const MAP_H := 22
const AXE_KNIGHT_TILE := Vector2i(19, 13)
const ERDRICKS_ARMOR_CHEST := "hauksness_axe_knight"

func _map_image_path() -> String:
	return "res://assets/maps/hauksness-1f.png"

func _get_map_w() -> int:
	return MAP_W

func _get_map_h() -> int:
	return MAP_H

func _get_music_path() -> String:
	return "res://assets/music/mp3/dungeon_1.mp3"

func _get_npcs() -> Array:
	return [
		{tile=Vector2i(10,10), sprite_id="guard",    facing="down",  speaker="Warrior",   pages=["This town was destroyed by\nthe Dragonlord's forces.\nOnly ruins remain."]},
		{tile=Vector2i(5,8),   sprite_id="sage",     facing="right", speaker="Wanderer",  pages=["Erdrick's Armor is hidden\nsomewhere in this ruined town.\nSeek it out, Hero."]},
		{tile=Vector2i(16,14), sprite_id="lady",     facing="left",  speaker="Survivor",  pages=["We have lost so much to\nthe Dragonlord's minions.\nAvenge us, Hero."]},
	]

func _ready() -> void:
	super._ready()

func _is_walkable(tile: Vector2i) -> bool:
	if tile.x < 0 or tile.y < 0 or tile.x >= MAP_W or tile.y >= MAP_H:
		return false
	if tile.x == 0 or tile.x == MAP_W - 1 or tile.y == 0 or tile.y == MAP_H - 1:
		return _pixel_is_walkable(tile)
	for npc in _npc_data:
		if npc.get("tile", Vector2i(-1, -1)) == tile:
			return false
	if not _tile_grid.is_empty() and int(_tile_grid[tile.y][tile.x]) == 32:
		return true
	return super._is_walkable(tile)

func _check_transitions() -> void:
	if _hero_tile.x == 0 or _hero_tile.x == MAP_W - 1 or _hero_tile.y == 0 or _hero_tile.y == MAP_H - 1:
		_transition_to("res://scenes/WorldMap.tscn", Vector2i(27, 91), "down", "world_map")
		return


func _on_step() -> void:
	if _hero_tile == AXE_KNIGHT_TILE and not _opened_chests.has(ERDRICKS_ARMOR_CHEST):
		_trigger_axe_knight_battle()
		return
	super._on_step()

func _trigger_axe_knight_battle() -> void:
	_move_enabled = false
	_battle_active = true
	if _music and _music.playing:
		_music.stop()

	var sfx := AudioStreamPlayer.new()
	var stinger := load("res://assets/music/mp3/monster_draws_near.mp3") as AudioStream
	if stinger:
		sfx.stream = stinger
		add_child(sfx)
		sfx.play()

	var flash_layer := CanvasLayer.new()
	flash_layer.layer = 15
	add_child(flash_layer)
	var flash_rect := ColorRect.new()
	flash_rect.color = Color.TRANSPARENT
	flash_rect.size = Vector2(VW, VH)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash_layer.add_child(flash_rect)

	var tw := create_tween()
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.06)
	tw.tween_property(flash_rect, "color", Color.BLACK, 0.06)
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.06)
	tw.tween_property(flash_rect, "color", Color.BLACK, 0.06)
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.06)
	tw.tween_property(flash_rect, "color", Color.BLACK, 0.06)
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.08)
	tw.tween_property(flash_rect, "color", Color(0, 0, 0, 1), 0.15)
	await tw.finished

	var mon_data := _get_monster("axe_knight")
	var overlay: Node = load(BATTLE_SCENE).instantiate()
	add_child(overlay)
	overlay.call("start_battle", "axe_knight", mon_data)

	var tw2 := create_tween()
	tw2.tween_property(flash_rect, "color:a", 0.0, 0.3)
	await tw2.finished
	flash_layer.queue_free()
	if is_instance_valid(sfx):
		sfx.queue_free()

	overlay.connect("battle_ended", func(result: String) -> void:
		overlay.queue_free()
		_battle_active = false
		_move_enabled = true
		var gs_after: Node = get_node_or_null("/root/GameState")
		if gs_after:
			_hero_gold = int(gs_after.gold)
		if result == "lost":
			_on_defeat()
			return
		if result == "won":
			_opened_chests[ERDRICKS_ARMOR_CHEST] = true
			_inventory.append({
				"name":  "Erdrick's Armor",
				"id":    "erdricks_armor",
				"type":  "armor",
				"desc":  "Legendary armor worn by Erdrick.\nReduces damage and protects\nagainst swamp poison.",
				"def":   7,
				"swamp_resist": true,
			})
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.inventory     = _inventory.duplicate(true)
				gs.opened_chests = _opened_chests.duplicate(true)
				if gs.has_method("equip_item"):
					gs.equip_item("erdricks_armor")
			_show_dialog("", ["Thou hast found\nErdrick's Armor!", "Thou art now wearing\nErdrick's Armor."])
		if _music:
			_music.play()
	)

func _get_monster(key: String) -> Dictionary:
	for m in _monsters_db:
		if m.get("key", "") == key:
			return m
	return {}
