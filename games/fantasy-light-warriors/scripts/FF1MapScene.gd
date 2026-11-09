extends Node2D

const VW := 512
const VH := 480
const TILE_SIZE := 32 # 2x scale of 16x16 NES tiles
const SRC_TILE_SIZE := 16

@export var map_json_path: String = "res://data/maps/map_00_coneria.json"
@export var map_image_path: String = "res://assets/maps/coneria.png"
@export var music_path: String = "res://assets/music/7_-_town.mp3"
@export var default_spawn_tile: Vector2i = Vector2i(16, 21)
@export var default_spawn_facing: String = "up"
@export var map_key_id: String = "coneria"

const MENU_ITEMS := ["TALK", "SEARCH", "STATUS", "ITEM", "MAGIC", "WARP"]

var _map_data: Dictionary = {}
var _grid: Array = []
var _tile_defs: Dictionary = {}
var _npcs: Array = []
var _chests: Array = []
var _teleports: Array = []
var _doors_shops: Array = []

var _world_root: Node2D
var _bg_sprite: Sprite2D
var _hero_sprite: Sprite2D
var _npc_sprites: Dictionary = {}
var _chest_markers: Dictionary = {}

var _hero_tile: Vector2i = Vector2i(16, 21)
var _hero_facing: Vector2i = Vector2i(0, -1)
var _move_enabled: bool = true

# UI & Dialog
var _ui_layer: CanvasLayer
var _hud_panel: Panel
var _hud_label: Label
var _dialog_panel: Panel
var _speaker_label: Label
var _dialog_label: Label
var _prompt_label: Label
var _dialog_active: bool = false
var _dialog_pages: Array[String] = []
var _current_page: int = 0
var _dialog_on_done: Callable = Callable()

# Command Menu
var _menu_panel: Panel
var _menu_open: bool = false
var _menu_index: int = 0
var _menu_item_labels: Array[Label] = []

# Status Panel
var _status_panel: Panel
var _status_open: bool = false
var _status_label: Label

# Authentic NES Shop Interior Overlay
var _shop_active: bool = false
var _shop_id: int = 0
var _shop_type_str: String = "WEAPON"
var _shop_cursor: int = 0
var _shop_bought_this_visit: bool = false
var _shop_panel: ColorRect
var _shop_header_panel: Panel
var _shop_type_label: Label
var _shop_msg_panel: Panel
var _shop_welcome_label: Label
var _shop_items_label: Label
var _shop_counter_tex: TextureRect
var _shop_party_sprites: Array[TextureRect] = []
var _shop_cmd_panel: Panel
var _shop_cmd_labels: Array[Label] = []
var _shop_hand_cursor: TextureRect
var _shop_gold_panel: Panel
var _shop_gold_label: Label
const SHOP_OPTIONS := ["Buy", "Sell", "Exit"]

# Battle Overlay
var _battle_active: bool = false
var _battle_panel: Panel
var _battle_enemy: Dictionary = {}
var _battle_enemy_hp: int = 0
var _battle_enemy_max_hp: int = 0
var _battle_msg_label: Label
var _battle_party_label: Label
var _battle_enemy_label: Label
var _battle_enemy_sprite: TextureRect
var _battle_cursor: int = 0
var _battle_phase: String = "INACTIVE"
var _battle_on_victory: Callable = Callable()

# Debug Overlay
var _debug_active: bool = false
var _debug_overlay: CanvasLayer
var _debug_label: Label

var _music: AudioStreamPlayer

func _ready() -> void:
	_load_map_json()
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.party_created = true
		if gs.spawn_tile != Vector2i(-1, -1):
			_hero_tile = gs.spawn_tile
			gs.spawn_tile = Vector2i(-1, -1)
		else:
			_hero_tile = default_spawn_tile
		_hero_facing = _str_to_facing(gs.spawn_facing if gs.spawn_facing != "" else default_spawn_facing)
		_debug_active = gs.tile_debug_enabled
	else:
		_hero_tile = default_spawn_tile
		_hero_facing = _str_to_facing(default_spawn_facing)

	_build_world()
	_build_ui()
	_update_camera_and_sprites()
	_start_music()

func _load_map_json() -> void:
	if FileAccess.file_exists(map_json_path):
		var f := FileAccess.open(map_json_path, FileAccess.READ)
		if f:
			var parsed = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				_map_data = parsed
				_grid = parsed.get("grid", [])
				_npcs = parsed.get("npcs", [])
				_chests = parsed.get("chests", [])
				_teleports = parsed.get("teleports", [])
				_doors_shops = parsed.get("doorsShopsAndTriggers", []) if parsed.get("doorsShopsAndTriggers") is Array else []
				var raw_tdefs = parsed.get("tileDefinitions", {})
				if raw_tdefs is Dictionary:
					for k in raw_tdefs.keys():
						var td = raw_tdefs[k]
						if td is Dictionary:
							_tile_defs[int(td.get("tileId", int(str(k))))] = td
				elif raw_tdefs is Array:
					for td in raw_tdefs:
						if td is Dictionary:
							_tile_defs[int(td.get("tileId", -1))] = td

func _build_world() -> void:
	_world_root = Node2D.new()
	_world_root.name = "WorldRoot"
	add_child(_world_root)

	_bg_sprite = Sprite2D.new()
	_bg_sprite.centered = false
	_bg_sprite.scale = Vector2(2.0, 2.0)
	_bg_sprite.texture = _load_png_tex(map_image_path)
	_world_root.add_child(_bg_sprite)

	var gs := get_node_or_null("/root/GameState")

	var obj_to_gfx := {}
	if FileAccess.file_exists("res://assets/sprites/npcs/obj_to_gfx.json"):
		var f := FileAccess.open("res://assets/sprites/npcs/obj_to_gfx.json", FileAccess.READ)
		if f:
			var p = JSON.parse_string(f.get_as_text())
			if p is Dictionary:
				obj_to_gfx = p

	for npc in _npcs:
		if npc is Dictionary:
			var oid := int(npc.get("objectId", 0))
			if oid == 0:
				continue
			if oid == 2 and gs and gs.garland_defeated:
				continue
			if oid == 3 and gs and gs.garland_defeated:
				continue
			var nx := int(npc.get("x", 0))
			var ny := int(npc.get("y", 0))
			var gfx_id := int(obj_to_gfx.get(str(oid), oid % 28))
			var spr_path := "res://assets/sprites/npcs/gfx_%02d.png" % (gfx_id % 28)
			var nspr := Sprite2D.new()
			nspr.centered = false
			nspr.scale = Vector2(2.0, 2.0)
			var ntex := _load_png_tex(spr_path)
			if ntex != null:
				nspr.texture = ntex
				nspr.region_enabled = true
				nspr.region_rect = Rect2(0, 0, 16, 16)
			nspr.position = Vector2(nx * TILE_SIZE, ny * TILE_SIZE)
			_world_root.add_child(nspr)
			_npc_sprites["%d,%d" % [nx, ny]] = {"sprite": nspr, "data": npc}

	# Opened chest overlay markers so opened chests show a subtle gold check
	for ch in _chests:
		if ch is Dictionary:
			var cx := int(ch.get("x", 0))
			var cy := int(ch.get("y", 0))
			var cr := ColorRect.new()
			cr.position = Vector2(cx * TILE_SIZE, cy * TILE_SIZE)
			cr.size = Vector2(TILE_SIZE, TILE_SIZE)
			var is_open: bool = gs != null and (bool(gs.opened_chests.has("%s:%d,%d" % [map_key_id, cx, cy])) or bool(gs.opened_chests.has("%d,%d" % [cx, cy])))
			cr.color = Color(0.2, 0.85, 0.25, 0.35) if is_open else Color(0, 0, 0, 0)
			_world_root.add_child(cr)
			_chest_markers["%d,%d" % [cx, cy]] = cr

	_hero_sprite = Sprite2D.new()
	_hero_sprite.centered = false
	_hero_sprite.scale = Vector2(2.0, 2.0)
	_refresh_hero_sprite_texture()
	_world_root.add_child(_hero_sprite)

func _refresh_hero_sprite_texture() -> void:
	var gs := get_node_or_null("/root/GameState")
	var slug := "fighter"
	if gs and not gs.party.is_empty():
		slug = str(gs.party[0].get("sprite_slug", "fighter"))
	var p := "res://assets/sprites/classes/%s_walk.png" % slug
	var htex := _load_png_tex(p)
	if htex != null:
		_hero_sprite.texture = htex
		_hero_sprite.region_enabled = true
		var frame_idx := 0
		if _hero_facing == Vector2i(0, -1):
			frame_idx = 1
		elif _hero_facing.x != 0:
			frame_idx = 2
		_hero_sprite.region_rect = Rect2(frame_idx * 16, 0, 16, 16)
		_hero_sprite.flip_h = (_hero_facing == Vector2i(1, 0))

func _build_ui() -> void:
	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 10
	add_child(_ui_layer)

	_hud_panel = NESWindow.make_panel(Vector2(8, 8), Vector2(VW - 16, 36), Color(0.0, 0.08, 0.42, 0.92))
	_ui_layer.add_child(_hud_panel)
	_hud_label = NESWindow.make_label("", Vector2(10, 7), Vector2(VW - 36, 22), 12, NESWindow.NES_WHITE)
	_hud_panel.add_child(_hud_label)

	_dialog_panel = NESWindow.make_panel(Vector2(16, VH - 148), Vector2(VW - 32, 134), NESWindow.NES_BLUE)
	_dialog_panel.visible = false
	_ui_layer.add_child(_dialog_panel)

	_speaker_label = NESWindow.make_label("", Vector2(14, 8), Vector2(VW - 60, 20), 14, NESWindow.NES_GOLD)
	_dialog_panel.add_child(_speaker_label)

	_dialog_label = NESWindow.make_label("", Vector2(14, 32), Vector2(VW - 60, 82), 14, NESWindow.NES_WHITE)
	_dialog_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_panel.add_child(_dialog_label)

	_prompt_label = NESWindow.make_label("▼ PRESS ENTER", Vector2(VW - 150, 106), Vector2(110, 20), 11, NESWindow.NES_GOLD)
	_dialog_panel.add_child(_prompt_label)

	_menu_panel = NESWindow.make_panel(Vector2(VW - 164, 52), Vector2(152, 188), NESWindow.NES_BLUE)
	_menu_panel.visible = false
	_ui_layer.add_child(_menu_panel)
	for i in range(MENU_ITEMS.size()):
		var ml := NESWindow.make_label(MENU_ITEMS[i], Vector2(16, 12 + i * 28), Vector2(124, 24), 14, NESWindow.NES_WHITE)
		_menu_panel.add_child(ml)
		_menu_item_labels.append(ml)

	_status_panel = NESWindow.make_panel(Vector2(28, 56), Vector2(VW - 56, 340), NESWindow.NES_DARK)
	_status_panel.visible = false
	_ui_layer.add_child(_status_panel)
	_status_label = NESWindow.make_label("", Vector2(16, 14), Vector2(VW - 88, 312), 13, NESWindow.NES_WHITE)
	_status_panel.add_child(_status_label)

	# Authentic NES Shop Interior Overlay (matches FFI_NES_Weapon_Shop.webp & FF1_NES_Shop.webp)
	_shop_panel = ColorRect.new()
	_shop_panel.position = Vector2.ZERO
	_shop_panel.size = Vector2(VW, VH)
	_shop_panel.color = Color(0.0, 0.0, 0.0, 1.0)
	_shop_panel.visible = false
	_ui_layer.add_child(_shop_panel)

	_shop_header_panel = NESWindow.make_panel(Vector2(194, 22), Vector2(124, 56), Color(0.55, 0.0, 0.55, 1.0))
	_shop_panel.add_child(_shop_header_panel)
	_shop_type_label = NESWindow.make_label("WEAPON", Vector2(0, 15), Vector2(124, 28), 18, NESWindow.NES_WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	_shop_header_panel.add_child(_shop_type_label)

	_shop_msg_panel = NESWindow.make_panel(Vector2(18, 54), Vector2(148, 200), Color(0.11, 0.09, 0.56, 1.0))
	_shop_panel.add_child(_shop_msg_panel)
	_shop_welcome_label = NESWindow.make_label("Welcome", Vector2(12, 12), Vector2(124, 24), 16, NESWindow.NES_WHITE)
	_shop_msg_panel.add_child(_shop_welcome_label)
	_shop_items_label = NESWindow.make_label("", Vector2(12, 42), Vector2(124, 148), 12, NESWindow.NES_WHITE)
	_shop_items_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_shop_msg_panel.add_child(_shop_items_label)

	_shop_counter_tex = TextureRect.new()
	_shop_counter_tex.position = Vector2(172, 92)
	_shop_counter_tex.size = Vector2(168, 152)
	_shop_counter_tex.stretch_mode = TextureRect.STRETCH_SCALE
	_shop_panel.add_child(_shop_counter_tex)

	_shop_cmd_panel = NESWindow.make_panel(Vector2(96, 278), Vector2(142, 152), Color(0.11, 0.09, 0.56, 1.0))
	_shop_panel.add_child(_shop_cmd_panel)
	for i in range(SHOP_OPTIONS.size()):
		var sl := NESWindow.make_label(SHOP_OPTIONS[i], Vector2(22, 22 + i * 36), Vector2(104, 28), 18, NESWindow.NES_WHITE)
		_shop_cmd_panel.add_child(sl)
		_shop_cmd_labels.append(sl)

	_shop_hand_cursor = TextureRect.new()
	_shop_hand_cursor.texture = _load_png_tex("res://assets/sprites/shops/hand_cursor.png")
	_shop_hand_cursor.position = Vector2(76, 298)
	_shop_hand_cursor.size = Vector2(36, 32)
	_shop_hand_cursor.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_shop_panel.add_child(_shop_hand_cursor)

	_shop_gold_panel = NESWindow.make_panel(Vector2(290, 374), Vector2(156, 56), Color(0.0, 0.34, 0.0, 1.0))
	_shop_panel.add_child(_shop_gold_panel)
	_shop_gold_label = NESWindow.make_label("400 G", Vector2(12, 15), Vector2(130, 28), 18, NESWindow.NES_WHITE, HORIZONTAL_ALIGNMENT_RIGHT)
	_shop_gold_panel.add_child(_shop_gold_label)

	_battle_panel = NESWindow.make_panel(Vector2(12, 48), Vector2(VW - 24, VH - 60), NESWindow.NES_DARK)
	_battle_panel.visible = false
	_ui_layer.add_child(_battle_panel)

	var btl_backdrop := NESWindow.make_panel(Vector2(16, 14), Vector2(276, 190), Color(0.02, 0.02, 0.05, 1.0))
	_battle_panel.add_child(btl_backdrop)

	_battle_enemy_sprite = TextureRect.new()
	_battle_enemy_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_battle_enemy_sprite.position = Vector2(78, 28)
	_battle_enemy_sprite.size = Vector2(120, 120)
	btl_backdrop.add_child(_battle_enemy_sprite)

	_battle_enemy_label = NESWindow.make_label("", Vector2(12, 154), Vector2(252, 28), 14, NESWindow.NES_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	btl_backdrop.add_child(_battle_enemy_label)

	var party_box := NESWindow.make_panel(Vector2(304, 14), Vector2(168, 260), NESWindow.NES_BLUE)
	_battle_panel.add_child(party_box)
	_battle_party_label = NESWindow.make_label("", Vector2(10, 10), Vector2(148, 240), 12, NESWindow.NES_WHITE)
	party_box.add_child(_battle_party_label)

	var btl_msg_box := NESWindow.make_panel(Vector2(16, 284), Vector2(456, 120), NESWindow.NES_BLUE)
	_battle_panel.add_child(btl_msg_box)
	_battle_msg_label = NESWindow.make_label("", Vector2(14, 12), Vector2(428, 96), 14, NESWindow.NES_WHITE)
	_battle_msg_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	btl_msg_box.add_child(_battle_msg_label)

	_debug_overlay = CanvasLayer.new()
	_debug_overlay.layer = 20
	_debug_overlay.visible = _debug_active
	add_child(_debug_overlay)
	_debug_label = NESWindow.make_label("", Vector2(12, VH - 28), Vector2(VW - 24, 22), 12, Color(0.2, 1.0, 0.4))
	_debug_overlay.add_child(_debug_label)

func _start_music() -> void:
	if music_path != "" and ResourceLoader.exists(music_path):
		_music = AudioStreamPlayer.new()
		_music.stream = load(music_path)
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()

func _update_camera_and_sprites() -> void:
	_refresh_hero_sprite_texture()
	_hero_sprite.position = Vector2(_hero_tile.x * TILE_SIZE, _hero_tile.y * TILE_SIZE)
	var center_offset := Vector2(VW * 0.5 - (_hero_tile.x + 0.5) * TILE_SIZE, VH * 0.5 - (_hero_tile.y + 0.5) * TILE_SIZE)
	_world_root.position = center_offset

	var gs := get_node_or_null("/root/GameState")
	var leader_str := "ZEST Lv1"
	var gold_val := 400
	if gs:
		gold_val = gs.gold
		if not gs.party.is_empty():
			var l: Dictionary = gs.party[0]
			leader_str = "%s (%s) HP:%d/%d" % [l.get("name", "ZEST"), l.get("class", "Fighter"), int(l.get("hp", 35)), int(l.get("hp_max", 35))]
	_hud_label.text = "%s   |   %s   |   %d G" % [str(_map_data.get("name", map_key_id)).to_upper(), leader_str, gold_val]
	_update_debug_overlay()

func _update_debug_overlay() -> void:
	if _debug_overlay:
		_debug_overlay.visible = _debug_active
	if _debug_label:
		_debug_label.text = "[TILE DEBUG] Scene=%s Pos=(%d,%d) Facing=%s" % [name, _hero_tile.x, _hero_tile.y, _facing_to_str(_hero_facing)]

func _str_to_facing(s: String) -> Vector2i:
	match s.to_lower():
		"up": return Vector2i(0, -1)
		"down": return Vector2i(0, 1)
		"left": return Vector2i(-1, 0)
		"right": return Vector2i(1, 0)
	return Vector2i(0, -1)

func _facing_to_str(v: Vector2i) -> String:
	if v == Vector2i(0, -1): return "up"
	if v == Vector2i(0, 1): return "down"
	if v == Vector2i(-1, 0): return "left"
	if v == Vector2i(1, 0): return "right"
	return "down"

func _is_walkable(tx: int, ty: int) -> bool:
	if ty < 0 or ty >= _grid.size():
		return false
	if tx < 0 or tx >= (_grid[ty] as Array).size():
		return false
	var npc_key := "%d,%d" % [tx, ty]
	if _npc_sprites.has(npc_key):
		return false
	var tid := int(_grid[ty][tx]) & 0x7F
	if _tile_defs.has(tid):
		var td: Dictionary = _tile_defs[tid]
		var sp := str(td.get("specialType", td.get("special", "")))
		if sp in ["open_door_or_shop", "close_door", "treasure_chest"]:
			return true
		if sp == "locked_door_mystic_key":
			return _has_item("Mystic Key")
		return bool(td.get("walkable", true))
	return true

func _teleport_at(pos: Vector2i) -> Variant:
	for tp in _teleports:
		if tp is Dictionary and int(tp.get("x", -1)) == pos.x and int(tp.get("y", -1)) == pos.y:
			return tp
	return null

func find_path_to(goal: Vector2i) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if _hero_tile == goal:
		return result
	var h := _grid.size()
	if h == 0:
		return result
	var w := (_grid[0] as Array).size()
	var queue: Array = [_hero_tile]
	var came_from: Dictionary = {_hero_tile: Vector2i(-999, -999)}
	var dirs := [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]
	var found := false
	while not queue.is_empty():
		var cur: Vector2i = queue.pop_front()
		if cur == goal:
			found = true
			break
		for d in dirs:
			var nxt: Vector2i = cur + d
			if nxt.x < 0 or nxt.x >= w or nxt.y < 0 or nxt.y >= h:
				continue
			if came_from.has(nxt):
				continue
			if nxt != goal and (_shop_at(nxt) != null or _teleport_at(nxt) != null):
				continue
			if nxt == goal or _is_walkable(nxt.x, nxt.y):
				came_from[nxt] = cur
				queue.append(nxt)
	if not found:
		return result
	var step := goal
	while step != _hero_tile:
		result.push_front(step)
		step = came_from[step]
	return result

func _unhandled_input(event: InputEvent) -> void:
	if _battle_active:
		_handle_battle_input(event)
		return
	if _shop_active:
		_handle_shop_input(event)
		return
	if _dialog_active:
		if event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel"):
			_advance_dialog()
		return
	if _status_open:
		if event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel"):
			_status_open = false
			_status_panel.visible = false
		return
	if _menu_open:
		if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up"):
			_menu_index = (_menu_index - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
			_update_menu_cursor()
		elif event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
			_menu_index = (_menu_index + 1) % MENU_ITEMS.size()
			_update_menu_cursor()
		elif event.is_action_pressed("ui_accept"):
			_execute_command()
		elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_menu_open = false
			_menu_panel.visible = false
		return

	if event.is_action_pressed("cmd_menu"):
		_open_menu()
		return
	if event.is_action_pressed("ui_accept"):
		_interact_in_front()
		return

	var move_dir := Vector2i.ZERO
	if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up"):
		move_dir = Vector2i(0, -1)
	elif event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
		move_dir = Vector2i(0, 1)
	elif event.is_action_pressed("move_left") or event.is_action_pressed("ui_left"):
		move_dir = Vector2i(-1, 0)
	elif event.is_action_pressed("move_right") or event.is_action_pressed("ui_right"):
		move_dir = Vector2i(1, 0)

	if move_dir != Vector2i.ZERO:
		_step_direction(move_dir)

func _step_direction(dir: Vector2i) -> void:
	_hero_facing = dir
	var next_tile := _hero_tile + dir
	if _is_walkable(next_tile.x, next_tile.y):
		_hero_tile = next_tile
		_update_camera_and_sprites()
		_check_tile_triggers(_hero_tile)
	else:
		_update_camera_and_sprites()

func _shop_at(pos: Vector2i) -> Variant:
	for tr in _doors_shops:
		if tr is Dictionary and int(tr.get("x", -1)) == pos.x and int(tr.get("y", -1)) == pos.y:
			if tr.get("shopId") != null and int(tr.get("shopId", 0)) > 0:
				return tr
	return null

func _step_out_of_shop() -> void:
	if _shop_at(_hero_tile) != null and _is_walkable(_hero_tile.x, _hero_tile.y + 1):
		_hero_tile = Vector2i(_hero_tile.x, _hero_tile.y + 1)
		_hero_facing = Vector2i(0, 1)
	_update_camera_and_sprites()

func _load_png_tex(res_path: String) -> Texture2D:
	var abs_p := ProjectSettings.globalize_path(res_path)
	if FileAccess.file_exists(abs_p):
		var img := Image.load_from_file(abs_p)
		if img != null:
			return ImageTexture.create_from_image(img)
	if ResourceLoader.exists(res_path):
		return load(res_path)
	return null

func _update_shop_cursor() -> void:
	if _shop_hand_cursor:
		_shop_hand_cursor.position = Vector2(76, 298 + _shop_cursor * 36)
	var gs := get_node_or_null("/root/GameState")
	if _shop_gold_label and gs:
		_shop_gold_label.text = "%d G" % gs.gold

func _trigger_shop(shop_id: int) -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	_shop_active = true
	_shop_id = shop_id
	_shop_cursor = 0
	_shop_bought_this_visit = false
	_dialog_active = true
	_dialog_panel.visible = false
	_hud_panel.visible = false
	_shop_panel.visible = true

	var speaker_title := "Coneria Weapon Shop"
	var items_catalog := ""
	var use_weapon_counter := false

	match shop_id:
		1:
			_shop_type_str = "WEAPON"
			speaker_title = "Coneria Weapon Shop"
			use_weapon_counter = true
			items_catalog = "Nunchaku  10G\nSm.Knife   5G\nStaff      5G\nRapier    10G\nHammer    10G"
		11:
			_shop_type_str = "ARMOR"
			speaker_title = "Coneria Armor Shop"
			use_weapon_counter = true
			items_catalog = "Cloth     10G\nWd.Armor  50G\nChain     80G\nLeather   30G\nShield    15G"
		21:
			_shop_type_str = "WHITE"
			speaker_title = "Coneria White Magic Shop"
			items_catalog = "CURE     100G\nHARM     100G\nFOG      100G\nRUSE     100G"
		31:
			_shop_type_str = "BLACK"
			speaker_title = "Coneria Black Magic Shop"
			items_catalog = "FIRE     100G\nSLEP     100G\nLOCK     100G\nLIT      100G"
		51:
			_shop_type_str = "INN"
			speaker_title = "Coneria Inn"
			items_catalog = "Stay:    30G\nRestores all\nHP and MP\novernight."
		61:
			_shop_type_str = "ITEM"
			speaker_title = "Coneria Item Shop"
			items_catalog = "Heal      60G\nPure      75G\nSoft     800G\nTent      75G"
		_:
			_shop_type_str = "CLINIC"
			speaker_title = "Coneria Clinic"
			items_catalog = "Revive fallen\nLight Warriors\nwith the ORB's\nblessing."

	var counter_path := "res://assets/sprites/shops/weapon_counter.png" if use_weapon_counter else "res://assets/sprites/shops/item_counter.png"
	_shop_counter_tex.texture = _load_png_tex(counter_path)

	_shop_type_label.text = _shop_type_str
	_shop_welcome_label.text = "Welcome"
	_shop_items_label.text = items_catalog
	_speaker_label.text = speaker_title
	_dialog_label.text = "Welcome to the %s!\n%s" % [speaker_title, items_catalog]
	_dialog_pages = [_dialog_label.text]
	_current_page = 0
	_update_shop_cursor()

func _execute_shop_purchase(shop_id: int) -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	var summary := ""
	match shop_id:
		1: # Coneria Weapon Shop
			if not gs.bought_weapon_coneria:
				gs.gold = max(0, gs.gold - 20)
			if not gs.party.is_empty():
				gs.party[0]["weapon"] = "Rapier"
				gs.party[0]["attack"] = 19
			if gs.party.size() > 2:
				gs.party[2]["weapon"] = "Hammer"
				gs.party[2]["attack"] = 14
			gs.bought_weapon_coneria = true
			summary = "Bought & Equipped:\nRapier  +9ATK\nHammer  +9ATK\nCost: 20 G"
		11: # Coneria Armor Shop
			if not gs.bought_armor_coneria:
				gs.gold = max(0, gs.gold - 110)
			if not gs.party.is_empty():
				gs.party[0]["armor"] = "Chain Mail"
				gs.party[0]["defense"] = 15
			if gs.party.size() > 1:
				gs.party[1]["armor"] = "Leather Armor"
				gs.party[1]["defense"] = 4
			gs.bought_armor_coneria = true
			summary = "Bought & Equipped:\nChain Mail\nLeather Armor\nCost: 110 G"
		21: # Coneria White Magic Shop
			if not gs.bought_white_magic_coneria:
				gs.gold = max(0, gs.gold - 100)
			if gs.party.size() > 2:
				var sp_arr: Array = gs.party[2].get("spells", [])
				if not ("CURE" in sp_arr): sp_arr.append("CURE")
				if not ("RUSE" in sp_arr): sp_arr.append("RUSE")
				gs.party[2]["spells"] = sp_arr
			gs.bought_white_magic_coneria = true
			summary = "Learned Lv1:\nCURE\nRUSE\nCost: 100 G"
		31: # Coneria Black Magic Shop
			if not gs.bought_black_magic_coneria:
				gs.gold = max(0, gs.gold - 100)
			if gs.party.size() > 3:
				var sp_arr: Array = gs.party[3].get("spells", [])
				if not ("FIRE" in sp_arr): sp_arr.append("FIRE")
				if not ("LIT" in sp_arr): sp_arr.append("LIT")
				gs.party[3]["spells"] = sp_arr
			gs.bought_black_magic_coneria = true
			summary = "Learned Lv1:\nFIRE\nLIT\nCost: 100 G"
		51: # Coneria Inn
			gs.gold = max(0, gs.gold - 30)
			for m in gs.party:
				if m is Dictionary:
					m["hp"] = m.get("hp_max", 35)
					m["mp"] = m.get("mp_max", 2)
			gs.used_inn_coneria = true
			summary = "Rested well!\nAll HP & MP\nrestored!\nCost: 30 G"
		61: # Coneria Item Shop
			gs.gold = max(0, gs.gold - 60)
			if not _has_item("HEAL Potion"):
				gs.inventory.append({"name": "HEAL Potion", "type": "item", "desc": "Restores 30 HP."})
			summary = "Purchased:\nHEAL Potion\nCost: 60 G"
		_:
			summary = "All four\nLight Warriors\nare healthy!"

	_shop_bought_this_visit = true
	_shop_welcome_label.text = "Thank you!"
	_shop_items_label.text = summary
	_dialog_label.text = "%s: %s" % [_speaker_label.text, summary.replace("\n", " ")]
	_current_page = 1
	_shop_cursor = 2 # Move pointing glove cursor to Exit
	_update_shop_cursor()
	_update_camera_and_sprites()

func _close_shop() -> void:
	_shop_active = false
	_dialog_active = false
	_shop_panel.visible = false
	_dialog_panel.visible = false
	_hud_panel.visible = true
	_step_out_of_shop()

func _handle_shop_input(event: InputEvent) -> void:
	if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up"):
		_shop_cursor = (_shop_cursor - 1 + SHOP_OPTIONS.size()) % SHOP_OPTIONS.size()
		_update_shop_cursor()
	elif event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
		_shop_cursor = (_shop_cursor + 1) % SHOP_OPTIONS.size()
		_update_shop_cursor()
	elif event.is_action_pressed("ui_cancel"):
		_close_shop()
	elif event.is_action_pressed("ui_accept"):
		if _shop_cursor == 0:
			_execute_shop_purchase(_shop_id)
		elif _shop_cursor == 1:
			_shop_welcome_label.text = "Sell"
			_shop_items_label.text = "Nothing to\nsell right\nnow."
			_shop_cursor = 2
			_update_shop_cursor()
		else:
			_close_shop()

func _check_tile_triggers(pos: Vector2i) -> void:
	var gs := get_node_or_null("/root/GameState")

	# 1. Check Shop Doors in Coneria
	var shop_tr = _shop_at(pos)
	if shop_tr != null:
		_trigger_shop(int(shop_tr.get("shopId", 1)))
		return

	# 2. Check Teleports & Exits
	for tp in _teleports:
		if tp is Dictionary and int(tp.get("x", -1)) == pos.x and int(tp.get("y", -1)) == pos.y:
			var ttype := str(tp.get("type", ""))
			if ttype == "enter_map":
				var target_scene := str(tp.get("targetScene", "Coneria"))
				if gs:
					gs.spawn_tile = Vector2i(int(tp.get("targetX", 16)), int(tp.get("targetY", 21)))
					gs.spawn_facing = "up"
				get_tree().change_scene_to_file.call_deferred("res://scenes/%s.tscn" % target_scene)
				return
			elif ttype == "normal_teleport":
				var tmap_name := str(tp.get("targetMapName", ""))
				if "Coneria Castle 2F" in tmap_name:
					if gs:
						gs.spawn_tile = Vector2i(12, 17)
						gs.spawn_facing = "up"
					get_tree().change_scene_to_file.call_deferred("res://scenes/ConeriaCastle2F.tscn")
					return
				elif "Coneria Castle 1F" in tmap_name:
					if gs:
						gs.spawn_tile = Vector2i(12, 19)
						gs.spawn_facing = "down"
					get_tree().change_scene_to_file.call_deferred("res://scenes/ConeriaCastle1F.tscn")
					return
			elif ttype in ["exit_to_overworld", "warp_previous_floor"]:
				if name == "Coneria":
					if gs:
						gs.spawn_tile = Vector2i(41, 50)
						gs.spawn_facing = "down"
					get_tree().change_scene_to_file.call_deferred("res://scenes/WorldMap.tscn")
					return
				elif name == "ConeriaCastle1F":
					if gs:
						gs.spawn_tile = Vector2i(41, 48)
						gs.spawn_facing = "down"
					get_tree().change_scene_to_file.call_deferred("res://scenes/WorldMap.tscn")
					return
				elif name == "TempleOfFiends":
					if gs:
						gs.spawn_tile = Vector2i(18, 12)
						gs.spawn_facing = "down"
					get_tree().change_scene_to_file.call_deferred("res://scenes/WorldMap.tscn")
					return

	# 3. Overworld Random Encounter along road to Temple of Fiends
	if name == "WorldMap" and gs:
		gs.overworld_steps += 1
		if not gs.first_encounter_won and gs.overworld_steps >= 14:
			_start_battle("IMP", {}, func():
				gs.first_encounter_won = true
			)

func _open_menu() -> void:
	_menu_open = true
	_menu_panel.visible = true
	_update_menu_cursor()

func _update_menu_cursor() -> void:
	for i in range(_menu_item_labels.size()):
		var prefix := "▶ " if i == _menu_index else "  "
		_menu_item_labels[i].text = prefix + MENU_ITEMS[i]
		_menu_item_labels[i].add_theme_color_override("font_color", NESWindow.NES_GOLD if i == _menu_index else NESWindow.NES_WHITE)

func _execute_command() -> void:
	var cmd: String = MENU_ITEMS[_menu_index]
	_menu_open = false
	_menu_panel.visible = false
	match cmd:
		"TALK":
			_cmd_talk()
		"SEARCH":
			_cmd_search()
		"STATUS":
			_cmd_status()
		"ITEM":
			_cmd_item()
		"MAGIC":
			_cmd_magic()
		"WARP":
			_cmd_warp()

func _interact_in_front() -> void:
	var f_tile := _hero_tile + _hero_facing
	var shop_here = _shop_at(_hero_tile)
	if shop_here == null:
		shop_here = _shop_at(f_tile)
	if shop_here != null:
		_trigger_shop(int(shop_here.get("shopId", 1)))
		return
	if _npc_sprites.has("%d,%d" % [f_tile.x, f_tile.y]):
		_cmd_talk()
	elif _chest_at(_hero_tile) != null or _chest_at(f_tile) != null:
		_cmd_search()
	else:
		_cmd_talk()

func _cmd_talk() -> void:
	var f_tile := _hero_tile + _hero_facing
	var shop_here = _shop_at(_hero_tile)
	if shop_here == null:
		shop_here = _shop_at(f_tile)
	if shop_here != null:
		_trigger_shop(int(shop_here.get("shopId", 1)))
		return

	var key := "%d,%d" % [f_tile.x, f_tile.y]
	var entry: Dictionary = _npc_sprites.get(key, {})
	if entry.is_empty():
		for d in [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]:
			var k2 := "%d,%d" % [_hero_tile.x + d.x, _hero_tile.y + d.y]
			if _npc_sprites.has(k2):
				entry = _npc_sprites[k2]
				key = k2
				break
	if entry.is_empty():
		_show_dialog("System", ["There is no one there."])
		return

	var npc: Dictionary = entry.get("data", {})
	var oid := int(npc.get("objectId", 0))
	var dlgs: Dictionary = npc.get("dialogues", {})
	var gs := get_node_or_null("/root/GameState")

	# 1. King of Coneria (objectId 1 in ConeriaCastle2F)
	if oid == 1:
		if gs and gs.princess_rescued:
			_show_dialog("King of Coneria", [
				"Thank you for saving the Princess! Without a doubt, you are the LIGHT WARRIORS.",
				"Please accept my gratitude. I shall order my men to build the bridge to the north continent!"
			], func():
				if gs:
					gs.bridge_built = true
			)
		else:
			var d1 := str(dlgs.get("dialogue_1", "LIGHT WARRIORS.. Just as in Lukahn's prophecy, you have come! Please rescue Princess Sara from Garland at the Temple of Fiends!"))
			_show_dialog("King of Coneria", [d1], func():
				if gs:
					gs.king_intro_done = true
			)
		return

	# 2. Princess Sara in Castle (objectId 18)
	if oid == 18:
		_show_dialog("Princess Sara", [
			"This LUTE has been passed down from Queen to Princess for 2000 years. Please accept it as a token of my appreciation!"
		], func():
			if gs:
				gs.lute_obtained = true
				if not _has_item("Lute"):
					gs.inventory.append({"name": "Lute", "type": "key", "desc": "Passed down from Queen to Princess."})
		)
		return

	# 3. Garland Boss in Temple of Fiends (objectId 2)
	if oid == 2:
		var g_text := str(dlgs.get("dialogue_1", "No one touches my Princess!! LIGHT WARRIORS?? You impertinent fools. Come on, I, Garland, will knock you all down!!"))
		_show_dialog("Garland", [g_text], func():
			_start_battle("GARLAND", {}, func():
				if _npc_sprites.has(key):
					var spr_node = _npc_sprites[key].get("sprite")
					if spr_node:
						spr_node.visible = false
					_npc_sprites.erase(key)
				_show_dialog("Princess Sara", [
					"So, you are the LIGHT WARRIORS! Thank you. Now let us return to Coneria Castle!"
				], func():
					if gs:
						gs.garland_defeated = true
						gs.princess_rescued = true
				)
			)
		)
		return

	# Default NPC dialogue from NES ROM
	var first_text := "Welcome to Coneria!"
	for k in ["dialogue_1", "dialogue_2", "dialogue_3"]:
		if dlgs.has(k) and str(dlgs[k]).strip_edges() != "":
			first_text = str(dlgs[k])
			break
	_show_dialog("Villager", [first_text], func():
		if gs and name == "Coneria":
			gs.talked_coneria_guard = true
	)

func _chest_at(pos: Vector2i) -> Variant:
	for ch in _chests:
		if ch is Dictionary and int(ch.get("x", -1)) == pos.x and int(ch.get("y", -1)) == pos.y:
			return ch
	return null

func _cmd_search() -> void:
	var ch = _chest_at(_hero_tile)
	if ch == null:
		ch = _chest_at(_hero_tile + _hero_facing)
	if ch == null:
		for d in [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]:
			ch = _chest_at(_hero_tile + d)
			if ch != null:
				break
	if ch == null:
		_show_dialog("Search", ["Nothing found here."])
		return

	var cx := int(ch.get("x", 0))
	var cy := int(ch.get("y", 0))
	var key := "%s:%d,%d" % [map_key_id, cx, cy]
	var gs := get_node_or_null("/root/GameState")
	if gs and gs.opened_chests.has(key):
		_show_dialog("Treasure Chest", ["The treasure chest is empty."])
		return

	var contents := str(ch.get("contents", "HEAL Potion"))
	if gs:
		if contents.ends_with("G") and contents.split(" ")[0].is_valid_int():
			gs.gold += contents.split(" ")[0].to_int()
		else:
			gs.inventory.append({"name": contents, "type": "item", "desc": "Found in %s." % map_key_id})

	var marker_key := "%d,%d" % [cx, cy]
	if _chest_markers.has(marker_key):
		_chest_markers[marker_key].color = Color(0.2, 0.85, 0.25, 0.35)
	_update_camera_and_sprites()
	_show_dialog("Treasure Chest", ["In the treasure chest, the LIGHT WARRIORS found %s!" % contents], func():
		if gs:
			gs.opened_chests[key] = true
			gs.opened_chests["%d,%d" % [cx, cy]] = true
	)

func _cmd_status() -> void:
	var gs := get_node_or_null("/root/GameState")
	var lines: Array[String] = ["=== LIGHT WARRIORS PARTY STATUS ==="]
	if gs:
		lines.append("GOLD: %d G    BRIDGE: %s    LUTE: %s" % [
			gs.gold,
			"BUILT" if gs.bridge_built else "NO",
			"YES" if gs.lute_obtained else "NO"
		])
		lines.append("")
		for m in gs.party:
			if m is Dictionary:
				lines.append("%s (%s Lv.%d)  HP:%d/%d  MP:%d/%d  ATK:%d DEF:%d  WPN:%s ARM:%s" % [
					str(m.get("name", "")), str(m.get("class", "")), int(m.get("level", 1)),
					int(m.get("hp", 0)), int(m.get("hp_max", 0)),
					int(m.get("mp", 0)), int(m.get("mp_max", 0)),
					int(m.get("attack", 10)), int(m.get("defense", 0)),
					str(m.get("weapon", "")), str(m.get("armor", ""))
				])
	_status_label.text = "\n".join(lines)
	_status_open = true
	_status_panel.visible = true

func _cmd_item() -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs or gs.inventory.is_empty():
		_show_dialog("Items", ["Your party carries no items yet."])
		return
	var names: Array[String] = []
	for it in gs.inventory:
		if it is Dictionary:
			names.append(str(it.get("name", "Item")))
	_show_dialog("Items", ["Inventory: " + ", ".join(names)])

func _cmd_magic() -> void:
	var gs := get_node_or_null("/root/GameState")
	if gs and not gs.party.is_empty():
		for m in gs.party:
			if m is Dictionary:
				m["hp"] = m["hp_max"]
		_update_camera_and_sprites()
		_show_dialog("Magic", ["White Mage cast CURE! Party HP restored."])

func _cmd_warp() -> void:
	if name == "Coneria":
		get_tree().change_scene_to_file.call_deferred("res://scenes/ConeriaCastle2F.tscn")
	elif name == "ConeriaCastle2F":
		get_tree().change_scene_to_file.call_deferred("res://scenes/TempleOfFiends.tscn")
	else:
		get_tree().change_scene_to_file.call_deferred("res://scenes/Coneria.tscn")

func _has_item(item_name: String) -> bool:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return false
	for it in gs.inventory:
		if it is Dictionary and str(it.get("name", "")).to_lower() == item_name.to_lower():
			return true
	return false

func _show_dialog(speaker: String, pages: Array, on_done: Callable = Callable()) -> void:
	_dialog_pages.clear()
	for p in pages:
		_dialog_pages.append(str(p))
	_current_page = 0
	_dialog_active = true
	_dialog_on_done = on_done
	_speaker_label.text = speaker
	_dialog_label.text = _dialog_pages[0] if not _dialog_pages.is_empty() else ""
	_dialog_panel.visible = true

func _advance_dialog() -> void:
	_current_page += 1
	if _current_page < _dialog_pages.size():
		_dialog_label.text = _dialog_pages[_current_page]
	else:
		_dialog_active = false
		_dialog_panel.visible = false
		if _dialog_on_done.is_valid():
			var cb := _dialog_on_done
			_dialog_on_done = Callable()
			cb.call()

# ── Turn-Based NES Battle Engine ──────────────────────────────────────────────
func _start_battle(enemy_name: String, override_data: Dictionary = {}, on_victory: Callable = Callable()) -> void:
	var gs := get_node_or_null("/root/GameState")
	var edata: Dictionary = override_data
	if edata.is_empty() and gs:
		edata = gs.get_enemy_by_name(enemy_name)
	_battle_enemy = edata
	_battle_enemy_hp = int(edata.get("hp", 8))
	_battle_enemy_max_hp = _battle_enemy_hp
	_battle_active = true
	_battle_phase = "PLAYER_MENU"
	_battle_cursor = 0
	_battle_on_victory = on_victory
	_battle_panel.visible = true

	var spr_slug := str(edata.get("romName", enemy_name)).to_lower().replace(" ", "")
	var spr_path := "res://assets/sprites/enemies/%s.png" % spr_slug
	var etex := _load_png_tex(spr_path)
	if etex == null:
		etex = _load_png_tex("res://assets/sprites/enemies/imp.png")
	if etex != null:
		_battle_enemy_sprite.texture = etex

	_refresh_battle_ui("%s approaches! Command: ▶ FIGHT   MAGIC   ITEM   RUN" % str(edata.get("name", enemy_name)))

func _refresh_battle_ui(msg: String) -> void:
	_battle_enemy_label.text = "%s   HP: %d / %d" % [str(_battle_enemy.get("name", "IMP")), max(0, _battle_enemy_hp), _battle_enemy_max_hp]
	var gs := get_node_or_null("/root/GameState")
	var plines: Array[String] = []
	if gs:
		for m in gs.party:
			if m is Dictionary:
				plines.append("%s  %s\nHP: %d/%d  MP: %d" % [
					str(m.get("name", "ZEST")), str(m.get("class", "Fighter")).substr(0, 6),
					int(m.get("hp", 35)), int(m.get("hp_max", 35)), int(m.get("mp", 0))
				])
	_battle_party_label.text = "\n\n".join(plines)
	_battle_msg_label.text = msg

func _handle_battle_input(event: InputEvent) -> void:
	if not event.is_action_pressed("ui_accept"):
		return
	if _battle_phase == "VICTORY":
		_battle_active = false
		_battle_phase = "INACTIVE"
		_battle_panel.visible = false
		_update_camera_and_sprites()
		if _battle_on_victory.is_valid():
			var cb := _battle_on_victory
			_battle_on_victory = Callable()
			cb.call()
		return

	var gs := get_node_or_null("/root/GameState")
	var logs: Array[String] = []
	var enemy_def := int(_battle_enemy.get("defense", 4))
	if gs:
		for m in gs.party:
			if _battle_enemy_hp <= 0:
				break
			var cname := str(m.get("class", "Fighter"))
			var spells: Array = m.get("spells", [])
			if cname == "Black Mage" and ("FIRE" in spells) and int(m.get("mp", 0)) > 0:
				m["mp"] = int(m.get("mp", 1)) - 1
				var f_dmg := 24 + (randi() % 12)
				_battle_enemy_hp -= f_dmg
				logs.append("%s casts FIRE for %d DMG!" % [str(m.get("name", "MAGE")), f_dmg])
			else:
				var atk: int = int(m.get("attack", 14))
				var dmg: int = int(max(4, atk + (randi() % max(4, atk)) - enemy_def))
				_battle_enemy_hp -= dmg
				logs.append("%s strikes for %d DMG!" % [str(m.get("name", "HERO")), dmg])

	if _battle_enemy_hp <= 0:
		_battle_enemy_hp = 0
		_battle_phase = "VICTORY"
		var xp_gain: int = int(_battle_enemy.get("xp", 6))
		var gp_gain: int = int(_battle_enemy.get("gold", 6))
		if gs:
			gs.gold += gp_gain
			gs.battles_won += 1
			for m in gs.party:
				m["exp"] = int(m.get("exp", 0)) + xp_gain
		logs.append("Mostavelous! Defeated %s! Gained %d EXP and %d G! (Press ENTER)" % [
			str(_battle_enemy.get("name", "Enemy")), xp_gain, gp_gain
		])
		_refresh_battle_ui("\n".join(logs))
	else:
		var eatk: int = int(_battle_enemy.get("attack", 4))
		var pdef: int = int(gs.party[0].get("defense", 2)) if (gs and not gs.party.is_empty()) else 2
		var edmg: int = int(max(1, eatk - int(pdef / 2)))
		if gs and not gs.party.is_empty():
			gs.party[0]["hp"] = max(5, int(gs.party[0].get("hp", 35)) - edmg)
		logs.append("%s attacks for %d DMG! Press ENTER to continue." % [str(_battle_enemy.get("name", "Enemy")), edmg])
		_refresh_battle_ui("\n".join(logs))
