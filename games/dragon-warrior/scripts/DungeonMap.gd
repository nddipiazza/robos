extends Node2D

const VW := 512
const VH := 480
const TILE_SIZE := 32
const MOVE_DURATION := 0.12
const TYPING_SPEED := 0.04
const DIALOG_H := 152
const DIALOG_MARGIN := 10
const MENU_ITEMS := ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"]
const MENU_COLS := 2
const MENU_ROWS := 4
const FR_DOWN  := [Rect2(  0, 0, 16, 16), Rect2( 20, 0, 16, 16)]
const FR_LEFT  := [Rect2( 40, 0, 16, 16), Rect2( 60, 0, 16, 16)]
const FR_UP    := [Rect2( 80, 0, 16, 16), Rect2(100, 0, 16, 16)]
const FR_RIGHT := [Rect2(120, 0, 16, 16), Rect2(140, 0, 16, 16)]
const BATTLE_SCENE := "res://scenes/BattleOverlay.tscn"
const MAX_INVENTORY := 8

@export var spawn_tile: Vector2i = Vector2i(1, 1)
@export var spawn_facing: String = "down"

var _bg: TextureRect
var _map_image: Image
var _hero_ws: WalkSprite
var _music: AudioStreamPlayer
var _sfx: AudioStreamPlayer
var _dialog_panel: Panel
var _speaker_label: Label
var _dialog_label: Label
var _prompt_label: Label
var _menu_panel: Panel
var _menu_labels: Array = []
var _status_panel: Panel
var _item_panel: Panel
var _item_labels: Array = []

var _monsters_db: Array = []
var _dungeons_db: Array = []
var _locations_db: Array = []
var _battle_active := false

var _dialog_active := false
var _dialog_pages: Array = []
var _dialog_on_done := Callable()
var _current_page := 0
var _char_index := 0
var _is_typing := false

var _menu_open := false
var _menu_index := 0
var _status_open := false
var _item_open := false
var _item_index := 0

# Shop
var _shops_db: Array = []
var _item_name_db: Dictionary = {}
var _shop_panel: Panel
var _shop_open := false
var _shop_items: Array = []
var _shop_index := 0

# Yes/No choice panel (used by shop confirm + inn)
var _choice_panel: Panel
var _choice_open := false
var _choice_index := 0       # 0=YES 1=NO
var _choice_prompt := ""
var _choice_callback: Callable

var _inventory: Array = []
var _hero_gold := 0
var _opened_chests: Dictionary = {}

var _tile_grid: Array = []

static var _stair_registry: Dictionary = {}   # full parsed JSON
static var _stair_by_id: Dictionary = {}      # id -> {map_key, tile, to, facing}
static var _chest_registry: Dictionary = {}

var _move_enabled := false
var _debug_overlay: CanvasLayer
var _debug_labels: Array = []
var _debug_active := false
var _hero_tile := Vector2i.ZERO
var _hero_moving := false
var _move_t := 0.0
var _cam_from := Vector2.ZERO
var _cam_to := Vector2.ZERO
var _cam_world := Vector2.ZERO
var _hero_facing := Vector2i(0, 1)

# NPC system
# Each entry: { tile: Vector2i, sprite_id: String, facing: String, speaker: String, pages: Array[String] }
var _npc_data: Array = []
var _npc_sprites: Array = []  # parallel Array of WalkSprite nodes

func _map_image_path() -> String:
	return ""

func _get_map_w() -> int:
	return 16

func _get_map_h() -> int:
	return 16

func _get_music_path() -> String:
	return "res://assets/music/mp3/dungeon_1.mp3"

# Override to return NPC list for this scene.
# Each dict: { tile:Vector2i, sprite_id:String, facing:String, speaker:String, pages:Array[String] }
# sprite_id maps to npc_characters.json ids: "guard","sage","minister","lady","sage_alt","red_guard","princess"
func _get_npcs() -> Array:
	return []

func _check_transitions() -> void:
	pass

func _on_step() -> void:
	if _radiant_steps_left > 0:
		_radiant_steps_left -= 1
		_update_darkness_mask()
	_check_transitions()
	_check_encounter()

func _encounters_enabled() -> bool:
	var key := _get_map_key()
	if key in [
		"brecconary-1f",
		"garinham-1f",
		"kol-1f",
		"rimuldar-1f",
		"cantlin-1f",
		"tantegel-castle-1f",
		"tantegel-castle-2f",
        "tantegel-castle-b1"
	] or key.begins_with("shrine") or key.ends_with("-shrine"):
		return false
	return true

func _get_encounter_pool() -> Array:
	if not _encounters_enabled():
		return []

	var key := _get_map_key()
	if key == "hauksness-1f":
		for loc in _locations_db:
			if loc.get("id", "") == "hauksness":
				return loc.get("encounters", [])
		return ["green_dragon", "starwyvern", "werewolf", "wizard"]

	var dungeon_id := ""
	var floor_idx := 1

	if key.begins_with("erdricks-cave-") or key == "northern-cave-b1":
		dungeon_id = "erdricks_cave"
		if key == "erdricks-cave-b2":
			floor_idx = 2
		else:
			floor_idx = 1
	elif key == "swamp-cave-b1":
		dungeon_id = "swamp_cave"
		floor_idx = 1
	elif key.begins_with("mountain-cave-") or key == "southern-cave-b1":
		dungeon_id = "mountain_cave"
		if key == "mountain-cave-b2":
			floor_idx = 2
		else:
			floor_idx = 1
	elif key.begins_with("garinham-b"):
		dungeon_id = "garins_grave"
		var floor_str := key.replace("garinham-b", "")
		floor_idx = int(floor_str) if floor_str.is_valid_int() else 1
	elif key.begins_with("charlock-castle-"):
		dungeon_id = "charlock_castle"
		if key == "charlock-castle-1f":
			floor_idx = 1
		elif key.begins_with("charlock-castle-b"):
			var b_str := key.replace("charlock-castle-b", "")
			if b_str.is_valid_int():
				floor_idx = int(b_str) + 1
			else:
				floor_idx = 1

	if dungeon_id != "":
		for dung in _dungeons_db:
			if dung.get("id", "") == dungeon_id:
				var floor_data: Array = dung.get("floor_data", [])
				for f_entry in floor_data:
					if int(f_entry.get("floor", 0)) == floor_idx:
						return f_entry.get("encounters", [])

	return []

func _check_encounter() -> void:
	var gs = get_node_or_null("/root/GameState")
	if gs and gs.encounters_disabled:
		return
	if _battle_active or _dialog_active or _menu_open or _status_open or _item_open or _shop_open or _choice_open:
		return
	if not _encounters_enabled():
		return

	var pool := _get_encounter_pool()
	if pool.is_empty():
		return

	var denom := 16
	if randi() % denom != 0:
		return

	var mon_key: String = pool[randi() % pool.size()]
	var mon_data := _get_monster(mon_key)
	if mon_data.is_empty():
		return
	_start_battle(mon_key, mon_data)

func _get_monster(key: String) -> Dictionary:
	for m in _monsters_db:
		if m.get("key", "") == key:
			return m
	return {}

func _start_battle(mon_key: String, mon_data: Dictionary) -> void:
	_battle_active = true
	_move_enabled = false
	if _music and _music.playing:
		_music.stop()

	var sfx := AudioStreamPlayer.new()
	var stinger := load("res://assets/music/mp3/monster_draws_near.mp3") as AudioStream
	if stinger:
		sfx.stream = stinger
		sfx.volume_db = 0.0
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

	var overlay: Node = load(BATTLE_SCENE).instantiate()
	add_child(overlay)
	overlay.call("start_battle", mon_key, mon_data)

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
		if result == "lost":
			_on_defeat()
		else:
			if _music:
				_music.play()
	)

func _on_defeat() -> void:
	var gs: Node = get_node_or_null("/root/GameState")
	if gs:
		gs.inventory = _inventory.duplicate(true)
		gs.opened_chests = _opened_chests.duplicate(true)
		gs.gold = int(gs.gold) / 2
		gs.hero_stats["hp"] = gs.hero_stats.get("hp_max", 15)
		gs.spawn_tile = Vector2i(11, 30)
		gs.spawn_facing = "down"
		gs.come_from = "defeat"
	get_tree().change_scene_to_file.call_deferred("res://scenes/Castle1F.tscn")

func _load_databases() -> void:
	if _monsters_db.is_empty():
		if DataManager and DataManager.is_loaded and not DataManager.monsters.is_empty():
			_monsters_db = DataManager.monsters.values()
		else:
			var fm := FileAccess.open("res://data/v1/monsters.json", FileAccess.READ)
			if fm:
				var parsed: Variant = JSON.parse_string(fm.get_as_text())
				var store := MonstersDataStoreV1.from_value(parsed)
				if store:
					_monsters_db = store.to_array()
	if _dungeons_db.is_empty():
		if DataManager and DataManager.is_loaded and not DataManager.dungeons.is_empty():
			_dungeons_db = DataManager.dungeons.values()
		else:
			var fd := FileAccess.open("res://data/v1/dungeons.json", FileAccess.READ)
			if fd:
				var parsed: Variant = JSON.parse_string(fd.get_as_text())
				if parsed is Array:
					_dungeons_db = parsed
	if _locations_db.is_empty():
		if DataManager and DataManager.is_loaded and not DataManager.locations.is_empty():
			_locations_db = DataManager.locations.values()
		else:
			var fl := FileAccess.open("res://data/v1/locations.json", FileAccess.READ)
			if fl:
				var parsed: Variant = JSON.parse_string(fl.get_as_text())
				var store := LocationsDataStoreV1.from_value(parsed)
				if store:
					_locations_db = store.to_array()

func _load_stair_entries() -> void:
	if not _stair_registry.is_empty():
		return
	var f := FileAccess.open("res://data/v1/stair_registry.json", FileAccess.READ)
	if not f:
		push_warning("DungeonMap: cannot open stair_registry.json")
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed == null or parsed is not Dictionary:
		push_warning("DungeonMap: stair_registry.json parse failed")
		return
	_stair_registry = parsed
	# Build flat id-index across all maps for fast partner lookup
	for map_key: String in parsed:
		if map_key.begins_with("_"):
			continue
		for stair: Dictionary in parsed[map_key]:
			_stair_by_id[stair["id"]] = {"map_key": map_key, "tile": stair["tile"],
										  "to": stair["to"], "facing": stair["facing"]}

func _try_stairs() -> bool:
	var map_key := _get_map_key()
	var map_stairs: Variant = _stair_registry.get(map_key)
	if map_stairs == null:
		return false
	for stair: Dictionary in map_stairs:
		var t: Dictionary = stair["tile"]
		if _hero_tile != Vector2i(t["col"], t["row"]):
			continue
		# Resolve destination via partner stair
		var partner: Variant = _stair_by_id.get(stair["to"])
		if partner == null:
			push_warning("DungeonMap: stair partner '%s' not found" % stair["to"])
			return false
		var scenes: Variant = _stair_registry.get("_scenes", {})
		var scene_name: String = scenes.get(partner["map_key"], "")
		if scene_name.is_empty():
			push_warning("DungeonMap: no scene for map key '%s'" % partner["map_key"])
			return false
		var to_scene := "res://scenes/" + scene_name + ".tscn"
		var pt: Dictionary = partner["tile"]
		var spawn := Vector2i(pt["col"], pt["row"])
		var facing: String = stair["facing"]
		var dialog: String
		var sfx: String
		if facing == "down":
			dialog = "Thou descendest the stairs."
			sfx = "res://assets/music/mp3/stairs_down.mp3"
		else:
			dialog = "Thou ascendest the stairs."
			sfx = "res://assets/music/mp3/stairs_up.mp3"
		_transition_to(to_scene, spawn, facing, stair["id"], dialog, sfx)
		return true
	return false

func _ready() -> void:
	_load_databases()
	_load_default_spawn_from_json()
	var gs := get_node_or_null("/root/GameState")
	if gs:
		_inventory = gs.inventory.duplicate(true)
		_hero_gold = gs.gold
		_opened_chests = gs.opened_chests.duplicate(true)
		if gs.come_from != "":
			_hero_tile = gs.spawn_tile
			_hero_facing = _facing_to_vec(gs.spawn_facing)
		else:
			_hero_tile = spawn_tile
			_hero_facing = _facing_to_vec(spawn_facing)
	else:
		_hero_tile = spawn_tile
		_hero_facing = _facing_to_vec(spawn_facing)

	_load_item_name_db()
	_load_shops_db()

	if not InputMap.has_action("cmd_menu"):
		InputMap.add_action("cmd_menu")
		var ev := InputEventKey.new()
		ev.keycode = KEY_B
		InputMap.action_add_event("cmd_menu", ev)

	_build_background()
	_load_tile_grid()
	_load_stair_entries()
	_build_hero_sprite()
	_build_debug_overlay()
	if gs and gs.tile_debug_enabled:
		_debug_active = true
		if _debug_overlay:
			_debug_overlay.visible = true
		_update_debug_overlay()
	_build_ui()
	_build_sfx_player()
	_build_npcs()
	_start_music()

	Input.action_release("move_up")
	Input.action_release("move_down")
	Input.action_release("move_left")
	Input.action_release("move_right")
	_cam_world = _tile_center_world(_hero_tile.x, _hero_tile.y)
	_cam_from = _cam_world
	_cam_to = _cam_world
	_move_enabled = true
	_draw_frame()

func _process(delta: float) -> void:
	if _hero_moving:
		var gs = get_node_or_null("/root/GameState")
		var mult: float = 2.0 if (gs and gs.double_speed) else 1.0
		_move_t = minf(_move_t + (delta * mult) / MOVE_DURATION, 1.0)
		_cam_world = _cam_from.lerp(_cam_to, _move_t)
		if _move_t >= 1.0:
			_hero_moving = false
			_on_step()
	elif _move_enabled and not _battle_active and not _dialog_active and not _menu_open and not _status_open and not _item_open and not _shop_open and not _choice_open:
		_poll_move_input()
	_draw_frame()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.keycode == KEY_X:
		if event.pressed and event.ctrl_pressed:
			_debug_active = true
			_debug_overlay.visible = true
			get_viewport().set_input_as_handled()
			return
		elif not event.pressed and _debug_active:
			_debug_active = false
			_debug_overlay.visible = false
			for lbl in _debug_labels:
				(lbl as Label).visible = false
			get_viewport().set_input_as_handled()
			return

	if _dialog_active:
		_handle_dialog_input(event)
		return
	if _status_open:
		if event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_status_panel.visible = false
			_status_open = false
		return
	if _item_open:
		_handle_item_input(event)
		return
	if _shop_open:
		_handle_shop_input(event)
		return
	if _choice_open:
		_handle_choice_input(event)
		return
	if _menu_open:
		_handle_menu_input(event)
		return
	if event.is_action_pressed("cmd_menu"):
		_open_menu()
		get_viewport().set_input_as_handled()

func _build_background() -> void:
	_bg = TextureRect.new()
	_bg.name = "Background"
	_bg.stretch_mode = TextureRect.STRETCH_SCALE
	_bg.size = Vector2(_get_map_w() * TILE_SIZE, _get_map_h() * TILE_SIZE)
	var tex := load(_map_image_path()) as Texture2D
	if tex:
		_bg.texture = tex
	add_child(_bg)

	var abs_path := ProjectSettings.globalize_path(_map_image_path())
	_map_image = Image.load_from_file(abs_path)

func _build_hero_sprite() -> void:
	_hero_ws = WalkSprite.new()
	_hero_ws.pixel_scale = 2.0
	_hero_ws.toggle_time = 0.35
	_hero_ws.texture = load("res://assets/sprites/rgba/characters-3.png") as Texture2D
	var fr := _facing_frames(_hero_facing)
	_hero_ws.frame0_rect = fr[0]
	_hero_ws.frame1_rect = fr[1]
	add_child(_hero_ws)
	_hero_ws.position = Vector2(VW * 0.5 - 16.0, VH * 0.5 - 16.0)

func _build_sfx_player() -> void:
	_sfx = AudioStreamPlayer.new()
	add_child(_sfx)

# ── NPC sprite sheet layout ────────────────────────────────────────────────────
# characters-3.png: 2 chars per row, 8 frames each, 20px stride, 16px width
# Row 0: hero_no_sword (x=0), minister (x=160)
# Row 1: hero_sword (x=0),    lady (x=160)
# Row 2: hero_no_sword_shield, sage (x=160)
# Row 3: hero_sword_shield,    sage_alt/merchant (x=160)
# Row 4: hero_sword_princess,  red_guard (x=160)
# Row 5: princess (x=0),       dragonlord (x=160)
# Row 6: guard (x=0)
# frames order: [d0,d1,l0,l1,u0,u1,r0,r1]
const NPC_SHEET_RECTS := {
	"minister":  [Rect2(160,0,16,16),Rect2(180,0,16,16),Rect2(200,0,16,16),Rect2(220,0,16,16),Rect2(240,0,16,16),Rect2(260,0,16,16),Rect2(280,0,16,16),Rect2(300,0,16,16)],
	"lady":      [Rect2(160,20,16,16),Rect2(180,20,16,16),Rect2(200,20,16,16),Rect2(220,20,16,16),Rect2(240,20,16,16),Rect2(260,20,16,16),Rect2(280,20,16,16),Rect2(300,20,16,16)],
	"sage":      [Rect2(160,40,16,16),Rect2(180,40,16,16),Rect2(200,40,16,16),Rect2(220,40,16,16),Rect2(240,40,16,16),Rect2(260,40,16,16),Rect2(280,40,16,16),Rect2(300,40,16,16)],
	"sage_alt":  [Rect2(160,60,16,16),Rect2(180,60,16,16),Rect2(200,60,16,16),Rect2(220,60,16,16),Rect2(240,60,16,16),Rect2(260,60,16,16),Rect2(280,60,16,16),Rect2(300,60,16,16)],
	"red_guard": [Rect2(160,80,16,16),Rect2(180,80,16,16),Rect2(200,80,16,16),Rect2(220,80,16,16),Rect2(240,80,16,16),Rect2(260,80,16,16),Rect2(280,80,16,16),Rect2(300,80,16,16)],
	"princess":  [Rect2(0,100,16,16),Rect2(20,100,16,16),Rect2(40,100,16,16),Rect2(60,100,16,16),Rect2(80,100,16,16),Rect2(100,100,16,16),Rect2(120,100,16,16),Rect2(140,100,16,16)],
	"guard":     [Rect2(0,120,16,16),Rect2(20,120,16,16),Rect2(40,120,16,16),Rect2(60,120,16,16),Rect2(80,120,16,16),Rect2(100,120,16,16),Rect2(120,120,16,16),Rect2(140,120,16,16)],
}
# Aliases for convenience in NPC definitions
const NPC_SPRITE_ALIASES := {
	"old_man": "sage",
	"soldier": "guard",
	"woman":   "lady",
	"merchant": "sage_alt",
	"innkeeper": "minister",
	"wise_man": "sage",
}

func _npc_facing_frames(sprite_id: String, facing: String) -> Array:
	var sid: String = NPC_SPRITE_ALIASES.get(sprite_id, sprite_id)
	var rects: Array = NPC_SHEET_RECTS.get(sid, NPC_SHEET_RECTS["guard"])
	# rects: [d0,d1,l0,l1,u0,u1,r0,r1]
	match facing:
		"up":    return [rects[4], rects[5]]
		"left":  return [rects[2], rects[3]]
		"right": return [rects[6], rects[7]]
		_:       return [rects[0], rects[1]]  # down default

func _bind_shops_to_npcs() -> void:
	var key := _get_map_key()
	for shop in _shops_db:
		var map_k: String = str(shop.get("map_key", ""))
		if map_k == key or map_k == key.replace("-1f", "") or key == map_k.replace("-1f", ""):
			var s_id: String = str(shop.get("id", ""))
			var n_tile_arr: Array = shop.get("npc_tile", []) if shop.get("npc_tile") != null else []
			var d_tile_arr: Array = shop.get("desk_tile", []) if shop.get("desk_tile") != null else []
			var n_tile := Vector2i(-1, -1)
			var d_tile := Vector2i(-1, -1)
			if n_tile_arr.size() >= 2:
				n_tile = Vector2i(int(n_tile_arr[0]), int(n_tile_arr[1]))
			if d_tile_arr.size() >= 2:
				d_tile = Vector2i(int(d_tile_arr[0]), int(d_tile_arr[1]))
			
			for npc in _npc_data:
				var tile: Vector2i = npc.get("tile", Vector2i(-1, -1))
				var shop_id: String = str(npc.get("shop_id", ""))
				if (s_id != "" and shop_id == s_id) or (n_tile != Vector2i(-1, -1) and tile == n_tile):
					npc["shop_id"] = s_id
					if d_tile != Vector2i(-1, -1):
						npc["desk_tile"] = d_tile
					break

func _clean_npc_bg_tiles() -> void:
	if not _map_image or _npc_data.is_empty():
		return

	var map_w := _get_map_w()
	var map_h := _get_map_h()
	if map_w <= 0 or map_h <= 0:
		return

	var tile_w: int = _map_image.get_width() / map_w
	var tile_h: int = _map_image.get_height() / map_h

	var npc_tiles := {}
	for npc in _npc_data:
		var tile: Vector2i = npc.get("tile", Vector2i(-1, -1))
		if tile.x >= 0 and tile.y >= 0:
			npc_tiles[tile] = true

	var ground_tiles: Array[int] = [3, 0, 4, 8, 30, 31, 33, 34, 18, 21]
	var image_modified := false

	for npc in _npc_data:
		var tile: Vector2i = npc.get("tile", Vector2i(-1, -1))
		if tile.x < 0 or tile.y < 0 or tile.x >= map_w or tile.y >= map_h:
			continue

		var clean_tile := Vector2i(-1, -1)

		var neighbors: Array[Vector2i] = [
			Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0),
			Vector2i(-1, -1), Vector2i(-1, 1), Vector2i(1, -1), Vector2i(1, 1)
		]
		for offset in neighbors:
			var n := tile + offset
			if n.x >= 0 and n.x < map_w and n.y >= 0 and n.y < map_h and not npc_tiles.has(n):
				if not _tile_grid.is_empty() and n.y < _tile_grid.size() and n.x < _tile_grid[n.y].size():
					var tid: int = _tile_grid[n.y][n.x]
					if tid in ground_tiles:
						clean_tile = n
						break

		if clean_tile == Vector2i(-1, -1) and not _tile_grid.is_empty():
			var min_dist := 999999
			for ry in range(_tile_grid.size()):
				var row: Array = _tile_grid[ry]
				for rx in range(row.size()):
					var pos := Vector2i(rx, ry)
					if not npc_tiles.has(pos) and row[rx] in ground_tiles:
						var dist: int = abs(rx - tile.x) + abs(ry - tile.y)
						if dist < min_dist:
							min_dist = dist
							clean_tile = pos

		if clean_tile == Vector2i(-1, -1):
			for offset in neighbors:
				var n := tile + offset
				if n.x >= 0 and n.x < map_w and n.y >= 0 and n.y < map_h and not npc_tiles.has(n):
					clean_tile = n
					break

		if clean_tile != Vector2i(-1, -1):
			var src_rect := Rect2i(clean_tile.x * tile_w, clean_tile.y * tile_h, tile_w, tile_h)
			var dst_pos := Vector2i(tile.x * tile_w, tile.y * tile_h)
			_map_image.blit_rect(_map_image, src_rect, dst_pos)
			image_modified = true

	if image_modified and _bg:
		_bg.texture = ImageTexture.create_from_image(_map_image)

func _build_npcs() -> void:
	_npc_data = _get_npcs()
	_bind_shops_to_npcs()
	_clean_npc_bg_tiles()
	var sheet := load("res://assets/sprites/rgba/characters-3.png") as Texture2D
	for npc in _npc_data:
		var ws := WalkSprite.new()
		ws.pixel_scale = 2.0
		ws.toggle_time = 0.5
		ws.texture = sheet
		var fr := _npc_facing_frames(npc.get("sprite_id", "guard"), npc.get("facing", "down"))
		ws.frame0_rect = fr[0]
		ws.frame1_rect = fr[1]
		add_child(ws)
		_npc_sprites.append(ws)

func _play_sfx(path: String) -> void:
	if not _sfx:
		return
	var stream := load(path) as AudioStream
	if stream:
		_sfx.stream = stream
		_sfx.play()

# NES Authentic Dungeon Darkness System
var _torch_active: bool = false
var _radiant_steps_left: int = 0
var _darkness_layer: CanvasLayer = null
var _dark_rect_top: ColorRect = null
var _dark_rect_bottom: ColorRect = null
var _dark_rect_left: ColorRect = null
var _dark_rect_right: ColorRect = null

func _is_dark() -> bool:
	var key := _get_map_key()
	return key.begins_with("erdricks-cave") or key.begins_with("mountain-cave") or key.begins_with("garinham-b") or key.begins_with("charlock-castle-b") or key.begins_with("swamp-cave")

func _get_current_light_radius() -> int:
	if _radiant_steps_left > 100:
		return 3  # 7x7 square
	elif _radiant_steps_left > 50:
		return 2  # 5x5 square
	elif _radiant_steps_left > 0:
		return 1  # 3x3 square
	elif _torch_active:
		return 1  # 3x3 square
	else:
		return 0  # 1x1 hero tile square

func _build_darkness_overlay() -> void:
	if not _is_dark():
		return
	_darkness_layer = CanvasLayer.new()
	_darkness_layer.name = "DarknessLayer"
	_darkness_layer.layer = 8
	add_child(_darkness_layer)

	_dark_rect_top = ColorRect.new()
	_dark_rect_bottom = ColorRect.new()
	_dark_rect_left = ColorRect.new()
	_dark_rect_right = ColorRect.new()

	for r in [_dark_rect_top, _dark_rect_bottom, _dark_rect_left, _dark_rect_right]:
		r.color = Color.BLACK
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_darkness_layer.add_child(r)

	_update_darkness_mask()

func _update_darkness_mask() -> void:
	if not _darkness_layer or not _is_dark():
		return
	var radius: int = _get_current_light_radius()
	var win_side: float = float((radius * 2 + 1) * 32)
	var half_side: float = win_side * 0.5
	var center_x: float = VW * 0.5
	var center_y: float = VH * 0.5

	var x1: float = clampf(center_x - half_side, 0.0, float(VW))
	var y1: float = clampf(center_y - half_side, 0.0, float(VH))
	var x2: float = clampf(center_x + half_side, 0.0, float(VW))
	var y2: float = clampf(center_y + half_side, 0.0, float(VH))

	_dark_rect_top.position = Vector2(0, 0)
	_dark_rect_top.size = Vector2(float(VW), y1)

	_dark_rect_bottom.position = Vector2(0, y2)
	_dark_rect_bottom.size = Vector2(float(VW), float(VH) - y2)

	_dark_rect_left.position = Vector2(0, y1)
	_dark_rect_left.size = Vector2(x1, y2 - y1)

	_dark_rect_right.position = Vector2(x2, y1)
	_dark_rect_right.size = Vector2(float(VW) - x2, y2 - y1)

func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	var bgm := load(_get_music_path()) as AudioStream
	if bgm:
		_music.stream = bgm
		if _music.stream is AudioStreamMP3:
			(_music.stream as AudioStreamMP3).loop = true
		_music.volume_db = -6.0
		_music.finished.connect(func(): _music.play())
		add_child(_music)
		_music.play()

func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "UI"
	canvas.layer = 10
	add_child(canvas)
	_build_dialog_panel(canvas)
	_build_menu_panel(canvas)
	_build_status_panel(canvas)
	_build_item_panel(canvas)
	_build_shop_panel(canvas)
	_build_choice_panel(canvas)
	_build_darkness_overlay()

func _make_box_style(bg: Color, border: Color, radius: int = 4) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.border_width_left = 2
	s.border_width_right = 2
	s.border_width_top = 2
	s.border_width_bottom = 2
	s.corner_radius_top_left = radius
	s.corner_radius_top_right = radius
	s.corner_radius_bottom_left = radius
	s.corner_radius_bottom_right = radius
	return s

func _make_label(txt: String, fsize: int = 14, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_size_override("font_size", fsize)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color.BLACK)
	l.add_theme_constant_override("shadow_offset_x", 1)
	l.add_theme_constant_override("shadow_offset_y", 1)
	return l

func _build_dialog_panel(canvas: CanvasLayer) -> void:
	_dialog_panel = Panel.new()
	_dialog_panel.size = Vector2(VW - DIALOG_MARGIN * 2, DIALOG_H)
	_dialog_panel.position = Vector2(DIALOG_MARGIN, VH - DIALOG_H - DIALOG_MARGIN)
	_dialog_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.95), Color(0.6, 0.8, 1.0)))
	_dialog_panel.visible = false

	_speaker_label = _make_label("", 13, Color(1.0, 0.85, 0.3))
	_speaker_label.position = Vector2(12, 8)
	_dialog_panel.add_child(_speaker_label)

	_dialog_label = _make_label("", 14)
	_dialog_label.position = Vector2(12, 28)
	_dialog_label.size = Vector2(_dialog_panel.size.x - 24, 90)
	_dialog_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_panel.add_child(_dialog_label)

	_prompt_label = _make_label("▼", 13, Color(0.7, 0.9, 1.0))
	_prompt_label.position = Vector2(_dialog_panel.size.x - 24, DIALOG_H - 26)
	_dialog_panel.add_child(_prompt_label)
	canvas.add_child(_dialog_panel)

func _build_menu_panel(canvas: CanvasLayer) -> void:
	var pw := 180
	var ph := 140
	_menu_panel = Panel.new()
	_menu_panel.size = Vector2(pw, ph)
	_menu_panel.position = Vector2(VW - pw - 8, 8)
	_menu_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_menu_panel.visible = false
	_menu_labels = []
	for i in range(MENU_ITEMS.size()):
		var col := i % MENU_COLS
		var row := i / MENU_COLS
		var lbl := _make_label(MENU_ITEMS[i], 14)
		lbl.position = Vector2(16 + col * 82, 12 + row * 28)
		_menu_panel.add_child(lbl)
		_menu_labels.append(lbl)
	canvas.add_child(_menu_panel)

func _clear_panel(panel: Control) -> void:
	for child in panel.get_children():
		panel.remove_child(child)
		child.queue_free()

func _build_status_panel(canvas: CanvasLayer) -> void:
	_status_panel = Panel.new()
	_status_panel.size = Vector2(240, 220)
	_status_panel.position = Vector2((VW - 240) / 2, (VH - 220) / 2)
	_status_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_status_panel.visible = false
	canvas.add_child(_status_panel)
	_refresh_status_panel()

func _refresh_status_panel() -> void:
	_clear_panel(_status_panel)
	var gs := get_node_or_null("/root/GameState")
	var stats: Dictionary = {
		"name": "ERDRICK", "level": 1,
		"hp": 15, "hp_max": 15, "mp": 0, "mp_max": 0,
		"str": 4, "agl": 4, "atk": 4, "def": 2, "exp": 0
	}
	if gs:
		stats = gs.hero_stats
	var rows_data := [
		["NAME", stats.get("name", "ERDRICK")],
		["LEVEL", str(stats.get("level", 1))],
		["HP", "%d / %d" % [stats.get("hp", 15), stats.get("hp_max", 15)]],
		["MP", "%d / %d" % [stats.get("mp", 0), stats.get("mp_max", 0)]],
		["STR", str(stats.get("str", 4))],
		["AGL", str(stats.get("agl", 4))],
		["ATK", str(stats.get("atk", 4))],
		["DEF", str(stats.get("def", 2))],
		["EXP", str(stats.get("exp", 0))],
		["GOLD", str(_hero_gold)],
	]
	for i in range(rows_data.size()):
		var kl := _make_label(rows_data[i][0], 13, Color(1.0, 0.85, 0.3))
		kl.position = Vector2(16, 12 + i * 19)
		_status_panel.add_child(kl)
		var vl := _make_label(rows_data[i][1], 13)
		vl.position = Vector2(110, 12 + i * 19)
		_status_panel.add_child(vl)

func _build_item_panel(canvas: CanvasLayer) -> void:
	_item_panel = Panel.new()
	_item_panel.size = Vector2(280, 220)
	_item_panel.position = Vector2((VW - 280) / 2, (VH - 220) / 2)
	_item_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_item_panel.visible = false
	canvas.add_child(_item_panel)
	_refresh_item_panel()

func _load_item_name_db() -> void:
	if DataManager and DataManager.is_loaded:
		for dict in [DataManager.weapons, DataManager.armor, DataManager.shields, DataManager.items, DataManager.quest_items]:
			for item in dict.values():
				var iid := str(item.get("id", item.get("key", "")))
				var nm := str(item.get("name", iid))
				if iid != "":
					_item_name_db[iid] = nm
		return

	for dataset in [{"file": "weapons.json", "type": "eq"}, {"file": "armor.json", "type": "eq"}, {"file": "shields.json", "type": "eq"}, {"file": "items.json", "type": "it"}, {"file": "quest_items.json", "type": "it"}]:
		var f := FileAccess.open("res://data/v1/" + dataset["file"], FileAccess.READ)
		if not f:
			continue
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		var arr: Array = []
		if dataset["type"] == "eq":
			var store := EquipmentDataStoreV1.from_value(parsed)
			if store:
				arr = store.to_array()
		else:
			var store := ItemsDataStoreV1.from_value(parsed)
			if store:
				arr = store.to_array()
		for item in arr:
			var iid := str(item.get("id", item.get("key", "")))
			var nm := str(item.get("name", iid))
			if iid != "":
				_item_name_db[iid] = nm

func _load_shops_db() -> void:
	var f := FileAccess.open("res://data/v1/shops.json", FileAccess.READ)
	if f:
		_shops_db = JSON.parse_string(f.get_as_text()) as Array

func _build_shop_panel(canvas: CanvasLayer) -> void:
	_shop_panel = Panel.new()
	_shop_panel.size = Vector2(300, 260)
	_shop_panel.position = Vector2((VW - 300) / 2, (VH - 260) / 2)
	_shop_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_shop_panel.visible = false
	canvas.add_child(_shop_panel)

func _build_choice_panel(canvas: CanvasLayer) -> void:
	_choice_panel = Panel.new()
	_choice_panel.size = Vector2(220, 100)
	_choice_panel.position = Vector2((VW - 220) / 2, (VH - 100) / 2)
	_choice_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_choice_panel.visible = false
	canvas.add_child(_choice_panel)

func _open_shop(shop_id: String) -> void:
	var shop: Dictionary = {}
	for s in _shops_db:
		if str(s.get("id", "")) == shop_id:
			shop = s
			break
	if shop.is_empty():
		_show_dialog("", ["There is no one there."])
		return
	_shop_items = []
	for entry in shop.get("inventory", []):
		var entry_dict: Dictionary = entry
		var iid := str(entry_dict.get("item_id", ""))
		var price := int(entry_dict.get("price", 0))
		var nm: String = str(_item_name_db.get(iid, iid.replace("_", " ").capitalize()))
		_shop_items.append({"id": iid, "name": nm, "price": price})
	_shop_index = 0
	_menu_panel.visible = false
	_menu_open = false
	_refresh_shop_panel()
	_shop_panel.visible = true
	_shop_open = true

func _refresh_shop_panel() -> void:
	_clear_panel(_shop_panel)
	var title := _make_label("WHAT DOST THOU WANT?", 13, Color(1.0, 0.85, 0.3))
	title.position = Vector2(12, 10)
	_shop_panel.add_child(title)
	var gold_lbl := _make_label("GOLD: %d" % _hero_gold, 12, Color(0.6, 1.0, 0.6))
	gold_lbl.position = Vector2(12, 240)
	_shop_panel.add_child(gold_lbl)
	for i in range(_shop_items.size()):
		var item: Dictionary = _shop_items[i]
		var color := Color(1.0, 0.85, 0.3) if i == _shop_index else Color.WHITE
		var cursor := "▶ " if i == _shop_index else "  "
		var lbl := _make_label("%s%-18s %4dG" % [cursor, item["name"], item["price"]], 13, color)
		lbl.position = Vector2(12, 34 + i * 22)
		_shop_panel.add_child(lbl)

func _handle_shop_input(event: InputEvent) -> void:
	if event.is_action_pressed("move_up"):
		_shop_index = maxi(_shop_index - 1, 0)
		_refresh_shop_panel()
	elif event.is_action_pressed("move_down"):
		_shop_index = mini(_shop_index + 1, _shop_items.size() - 1)
		_refresh_shop_panel()
	elif event.is_action_pressed("ui_accept"):
		if _shop_items.is_empty():
			return
		var item: Dictionary = _shop_items[_shop_index]
		_shop_panel.visible = false
		_shop_open = false
		var prompt := "The %s will cost\nthee %d gold.\nWilt thou buy it?" % [item["name"], item["price"]]
		var on_yes := func():
			if _hero_gold < item["price"]:
				_show_dialog("", ["Thou hast not\nenough gold!"])
			else:
				_hero_gold -= item["price"]
				_inventory.append({"name": item["name"], "id": item["id"], "desc": "Purchased in a shop."})
				var gs := get_node_or_null("/root/GameState")
				if gs:
					gs.gold = _hero_gold
					gs.inventory = _inventory.duplicate(true)
				_show_dialog("", ["Thou hast purchased\nthe %s!" % item["name"]])
		var on_no := func():
			_show_dialog("", ["Very well."])
		_open_choice(prompt, on_yes, on_no)
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
		_shop_panel.visible = false
		_shop_open = false
		_show_dialog("", ["Come again!"])

func _open_choice(prompt: String, on_yes: Callable, on_no: Callable) -> void:
	_choice_prompt = prompt
	_choice_index = 0
	_choice_callback = Callable()
	_clear_panel(_choice_panel)
	var plbl := _make_label(prompt, 12)
	plbl.position = Vector2(12, 8)
	plbl.size = Vector2(196, 60)
	plbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_choice_panel.add_child(plbl)
	var yes_lbl := _make_label("▶ YES", 13, Color(1.0, 0.85, 0.3))
	yes_lbl.name = "ChoiceYes"
	yes_lbl.position = Vector2(20, 68)
	_choice_panel.add_child(yes_lbl)
	var no_lbl := _make_label("  NO", 13, Color.WHITE)
	no_lbl.name = "ChoiceNo"
	no_lbl.position = Vector2(20, 82)
	_choice_panel.add_child(no_lbl)
	_choice_panel.visible = true
	_choice_open = true
	_choice_panel.set_meta("on_yes", on_yes)
	_choice_panel.set_meta("on_no", on_no)

func _handle_choice_input(event: InputEvent) -> void:
	var yes_lbl := _choice_panel.get_node_or_null("ChoiceYes") as Label
	var no_lbl := _choice_panel.get_node_or_null("ChoiceNo") as Label
	if event.is_action_pressed("move_up") or event.is_action_pressed("move_down"):
		_choice_index = 1 - _choice_index
		if yes_lbl:
			yes_lbl.text = "▶ YES" if _choice_index == 0 else "  YES"
			yes_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3) if _choice_index == 0 else Color.WHITE)
		if no_lbl:
			no_lbl.text = "▶ NO" if _choice_index == 1 else "  NO"
			no_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3) if _choice_index == 1 else Color.WHITE)
	elif event.is_action_pressed("ui_accept"):
		_choice_panel.visible = false
		_choice_open = false
		if _choice_index == 0:
			var cb: Callable = _choice_panel.get_meta("on_yes", Callable())
			if cb.is_valid():
				cb.call()
		else:
			var cb: Callable = _choice_panel.get_meta("on_no", Callable())
			if cb.is_valid():
				cb.call()
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
		_choice_panel.visible = false
		_choice_open = false
		var cb: Callable = _choice_panel.get_meta("on_no", Callable())
		if cb.is_valid():
			cb.call()

func _open_inn(cost: int) -> void:
	_menu_panel.visible = false
	_menu_open = false
	if cost == 0:
		var gs := get_node_or_null("/root/GameState")
		if gs:
			gs.hero_stats["hp"] = gs.hero_stats.get("hp_max", 15)
			gs.hero_stats["mp"] = gs.hero_stats.get("mp_max", 0)
		_show_dialog("", ["Thou hast been\nrestored at the bath."])
		return
	var on_yes := func():
		if _hero_gold < cost:
			_show_dialog("", ["Thou hast not\nenough gold!"])
		else:
			_hero_gold -= cost
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.gold = _hero_gold
				gs.hero_stats["hp"] = gs.hero_stats.get("hp_max", 15)
				gs.hero_stats["mp"] = gs.hero_stats.get("mp_max", 0)
			_show_dialog("", ["Good night.\nThee and thy companions\nhave been restored."])
	var on_no := func():
		_show_dialog("", ["Fare thee well!"])
	_open_choice("The inn will cost\nthee %d gold.\nWilt thou stay?" % cost, on_yes, on_no)

func _refresh_item_panel() -> void:
	_clear_panel(_item_panel)
	_item_labels = []

	var title := _make_label("ITEMS", 14, Color(1.0, 0.85, 0.3))
	title.position = Vector2(16, 10)
	_item_panel.add_child(title)

	if _inventory.is_empty():
		var empty := _make_label("Nothing.", 13, Color(0.7, 0.7, 0.7))
		empty.position = Vector2(16, 36)
		_item_panel.add_child(empty)
	else:
		for i in range(_inventory.size()):
			var name := str(_inventory[i].get("name", "Item"))
			var lbl := _make_label(name, 13)
			lbl.position = Vector2(28, 36 + i * 20)
			_item_panel.add_child(lbl)
			_item_labels.append(lbl)

	var desc := _make_label("", 12, Color(0.7, 0.9, 1.0))
	desc.name = "ItemDesc"
	desc.position = Vector2(16, 180)
	desc.size = Vector2(248, 36)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_item_panel.add_child(desc)

func _draw_frame() -> void:
	if _bg:
		_bg.position = _w2s(Vector2.ZERO)
	if _hero_ws:
		_hero_ws.position = Vector2(VW * 0.5 - 16.0, VH * 0.5 - 16.0)
	# Draw NPCs relative to camera
	for i in _npc_sprites.size():
		var ws := _npc_sprites[i] as WalkSprite
		if not ws:
			continue
		var npc: Dictionary = _npc_data[i]
		var tile: Vector2i = npc.get("tile", Vector2i.ZERO)
		var world_pos := _tile_center_world(tile.x, tile.y)
		var screen_pos := _w2s(world_pos)
		ws.position = screen_pos - Vector2(16.0, 16.0)
		# Hide NPC if off-screen (small perf optimization)
		ws.visible = (screen_pos.x > -32 and screen_pos.x < VW + 32 and
					  screen_pos.y > -32 and screen_pos.y < VH + 32)
	_update_debug_overlay()

func _poll_move_input() -> void:
	var dir := Vector2i.ZERO
	if Input.is_action_pressed("move_up"):
		dir = Vector2i(0, -1)
	elif Input.is_action_pressed("move_down"):
		dir = Vector2i(0, 1)
	elif Input.is_action_pressed("move_left"):
		dir = Vector2i(-1, 0)
	elif Input.is_action_pressed("move_right"):
		dir = Vector2i(1, 0)
	if dir == Vector2i.ZERO:
		return

	var prev_facing := _hero_facing
	_hero_facing = dir
	if _hero_ws:
		var fr := _facing_frames(dir)
		if dir != prev_facing:
			_hero_ws.set_frames(fr[0], fr[1])
		_hero_ws.step()

	var dest := _hero_tile + dir
	if not _is_walkable(dest):
		_play_sfx("res://assets/music/mp3/bumping_walls.mp3")
		return

	_hero_tile = dest
	_cam_from = _cam_world
	_cam_to = _tile_center_world(_hero_tile.x, _hero_tile.y)
	_move_t = 0.0
	_hero_moving = true

func _handle_dialog_input(event: InputEvent) -> void:
	if not (event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu")):
		return
	if _is_typing:
		_char_index = _dialog_pages[_current_page].length()
		_is_typing = false
		_dialog_label.text = _dialog_pages[_current_page]
		_prompt_label.visible = true
		return
	_current_page += 1
	if _current_page >= _dialog_pages.size():
		_dialog_panel.visible = false
		_dialog_active = false
		if _dialog_on_done.is_valid():
			_dialog_on_done.call()
	else:
		_start_page(_current_page)

func _handle_menu_input(event: InputEvent) -> void:
	if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up"):
		_menu_index = (_menu_index - MENU_COLS + MENU_ITEMS.size()) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
		_menu_index = (_menu_index + MENU_COLS) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_left") or event.is_action_pressed("ui_left"):
		_menu_index = (_menu_index - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_right") or event.is_action_pressed("ui_right"):
		_menu_index = (_menu_index + 1) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("ui_accept"):
		_menu_panel.visible = false
		_menu_open = false
		_execute_menu_item(MENU_ITEMS[_menu_index])
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
		_menu_panel.visible = false
		_menu_open = false

func _handle_item_input(event: InputEvent) -> void:
	if _inventory.is_empty():
		if event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_item_panel.visible = false
			_item_open = false
		return
	if event.is_action_pressed("move_up"):
		_item_index = maxi(_item_index - 1, 0)
		_refresh_item_cursor()
	elif event.is_action_pressed("move_down"):
		_item_index = mini(_item_index + 1, _inventory.size() - 1)
		_refresh_item_cursor()
	elif event.is_action_pressed("ui_accept"):
		_use_item(_item_index)
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
		_item_panel.visible = false
		_item_open = false

func _open_menu() -> void:
	_menu_index = 0
	_menu_open = true
	_refresh_menu()
	_menu_panel.visible = true

func _refresh_menu() -> void:
	for i in range(_menu_labels.size()):
		var color := Color(1.0, 0.85, 0.3) if i == _menu_index else Color.WHITE
		(_menu_labels[i] as Label).add_theme_color_override("font_color", color)

func _refresh_item_cursor() -> void:
	for i in range(_item_labels.size()):
		var color := Color(1.0, 0.85, 0.3) if i == _item_index else Color.WHITE
		(_item_labels[i] as Label).add_theme_color_override("font_color", color)
	var desc_node := _item_panel.get_node_or_null("ItemDesc") as Label
	if desc_node and _item_index < _inventory.size():
		desc_node.text = str(_inventory[_item_index].get("desc", ""))

func _execute_menu_item(cmd: String) -> void:
	match cmd:
		"TALK":
			_cmd_talk()
		"DOOR":
			_cmd_door()
		"STATUS":
			_cmd_status()
		"TAKE":
			_cmd_take()
		"STAIRS":
			_cmd_stairs()
		"SPELL":
			_cmd_spell()
		"SEARCH":
			_cmd_search()
		"ITEM":
			_cmd_item()

func _cmd_talk() -> void:
	var face_tile := _hero_tile + _hero_facing
	for npc in _npc_data:
		var npc_tile: Vector2i = npc.get("tile", Vector2i(-1, -1))
		var desk_tile: Vector2i = npc.get("desk_tile", Vector2i(-1, -1))
		if face_tile == npc_tile or (desk_tile != Vector2i(-1, -1) and face_tile == desk_tile):
			if npc.has("shop_id"):
				_open_shop(str(npc.get("shop_id")))
				return
			if npc.has("inn_cost"):
				_open_inn(int(npc.get("inn_cost", 6)))
				return
			var pages: Array = []
			for p in npc.get("pages", ["..."]):
				pages.append(str(p))
			_show_dialog(str(npc.get("speaker", "")), pages)
			return
	_show_dialog("", ["There is no one there."])

func _cmd_door() -> void:
	_show_dialog("", ["There is no door\nin that direction."])

func _cmd_status() -> void:
	_refresh_status_panel()
	_status_panel.visible = true
	_status_open = true

func _load_chest_entries() -> void:
	if not _chest_registry.is_empty():
		return
	var f := FileAccess.open("res://data/v1/chest_registry.json", FileAccess.READ)
	if not f:
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary:
		_chest_registry = parsed

func _get_chest_entry(col: int, row: int) -> Dictionary:
	_load_chest_entries()
	_load_databases()
	var key := _get_map_key()
	var map_chests: Array = _chest_registry.get(key, [])
	var chest_index := -1
	for i in range(map_chests.size()):
		var c: Dictionary = map_chests[i]
		if int(c.get("col", -1)) == col and int(c.get("row", -1)) == row:
			chest_index = i
			break
	print("[DungeonMap] _get_chest_entry col=", col, " row=", row, " key=", key, " map_chests=", map_chests, " chest_index=", chest_index, " _dungeons_db.size()=", _dungeons_db.size())
	if chest_index < 0:
		return {}

	var dungeon_id := ""
	var floor_idx := 1
	if key.begins_with("erdricks-cave-") or key == "northern-cave-b1":
		dungeon_id = "erdricks_cave"
		floor_idx = 2 if key == "erdricks-cave-b2" else 1
	elif key == "swamp-cave-b1":
		dungeon_id = "swamp_cave"
		floor_idx = 1
	elif key.begins_with("mountain-cave-") or key == "southern-cave-b1":
		dungeon_id = "mountain_cave"
		floor_idx = 2 if key == "mountain-cave-b2" else 1
	elif key.begins_with("garinham-b"):
		dungeon_id = "garins_grave"
		var floor_str := key.replace("garinham-b", "")
		floor_idx = int(floor_str) if floor_str.is_valid_int() else 1
	elif key.begins_with("charlock-castle-"):
		dungeon_id = "charlock_castle"
		if key.begins_with("charlock-castle-b"):
			var b_str := key.replace("charlock-castle-b", "")
			floor_idx = int(b_str) if b_str.is_valid_int() else 1
		else:
			floor_idx = 1

	if dungeon_id != "":
		for dung in _dungeons_db:
			var d_id: String = str(dung.get("id", ""))
			if d_id == dungeon_id:
				var floor_data: Array = dung.get("floor_data", [])
				for f_entry in floor_data:
					var f_num: int = int(f_entry.get("floor", 0))
					if f_num == floor_idx:
						var chests: Array = f_entry.get("chests", [])
						if chest_index < chests.size():
							var res: Dictionary = {}
							var c_val = chests[chest_index]
							if c_val is Dictionary:
								res = c_val.duplicate(true)
							elif c_val is Object:
								var i_val = c_val.get("item")
								if i_val != null: res["item"] = str(i_val)
								var t_val = c_val.get("type")
								if t_val != null: res["type"] = str(t_val)
								var gmin = c_val.get("gp_min")
								if gmin != null: res["gp_min"] = gmin
								var gmax = c_val.get("gp_max")
								if gmax != null: res["gp_max"] = gmax
							return res
	return {}

func _find_target_chest_tile() -> Vector2i:
	var info := _get_chest_entry(_hero_tile.x, _hero_tile.y)
	if not info.is_empty():
		return _hero_tile
	var face_tile := _hero_tile + _hero_facing
	var face_info := _get_chest_entry(face_tile.x, face_tile.y)
	if not face_info.is_empty():
		return face_tile
	return Vector2i(-1, -1)

func _cmd_take() -> void:
	print("[DungeonMap] _cmd_take hero_tile=", _hero_tile)
	var target_tile := _find_target_chest_tile()
	if target_tile == Vector2i(-1, -1):
		target_tile = _hero_tile
	var chest_info := _get_chest_entry(target_tile.x, target_tile.y)
	print("[DungeonMap] _cmd_take chest_info=", chest_info)
	if chest_info.is_empty():
		_show_dialog("", ["There is nothing\nto take here."])
		return

	if _is_chest_opened(target_tile.x, target_tile.y):
		_show_dialog("", ["The chest is\nalready empty."])
		return

	_mark_chest_opened(target_tile.x, target_tile.y)
	_play_sfx("res://assets/music/mp3/open_treasure.mp3")

	var item_id: String = str(chest_info.get("item", ""))
	var gp_min = chest_info.get("gp_min", null)
	var gp_max = chest_info.get("gp_max", null)

	if item_id == "gold" or (gp_min != null and gp_max != null):
		var min_val := int(gp_min) if gp_min != null else 10
		var max_val := int(gp_max) if gp_max != null else 50
		var amount := min_val
		if max_val > min_val:
			amount = min_val + (randi() % (max_val - min_val + 1))
		_hero_gold += amount
		var gs := get_node_or_null("/root/GameState")
		if gs:
			gs.gold = _hero_gold
		_show_dialog("", ["Thou dost find\n" + str(amount) + " Gold Pieces!"])
	elif item_id != "":
		_load_item_name_db()
		var item_name: String = str(_item_name_db.get(item_id, item_id.replace("_", " ").capitalize()))
		var item_dict := {
			"id": item_id,
			"name": item_name,
			"type": "quest" if chest_info.get("type", "") == "quest_item" else "tool"
		}
		if _inventory.size() < MAX_INVENTORY:
			_inventory.append(item_dict)
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.inventory = _inventory.duplicate(true)
			_show_dialog("", ["Thou dost find\nthe " + item_name + "!"])
		else:
			_show_dialog("", ["Thy pack is full!\nThou canst carry\nno more items."])
	else:
		_show_dialog("", ["The chest is empty."])

func _cmd_stairs() -> void:
	if not _try_stairs():
		_show_dialog("", ["There are no stairs here."])

func _cmd_spell() -> void:
	var gs := get_node_or_null("/root/GameState")
	var spells: Array = gs.hero_spells if (gs and gs.hero_spells != null) else []
	var has_radiant := false
	for s in spells:
		if str(s).to_lower() == "radiant":
			has_radiant = true
			break
	if has_radiant or (gs and gs.hero_mp >= 3):
		if gs and gs.hero_mp < 3:
			_show_dialog("", ["Thou hast not enough\nMagic Points!"])
			return
		if gs: gs.hero_mp -= 3
		_radiant_steps_left = 200
		_update_darkness_mask()
		_show_dialog("", ["Thou hast cast Radiant!\nA bright light fills the cavern."])
	else:
		_show_dialog("", ["Thou hast no spells\nto cast."])

func _is_chest_opened(col: int, row: int) -> bool:
	var map_key := _get_map_key()
	var coord := str(col) + "," + str(row)
	var key := map_key + ":" + coord
	return _opened_chests.has(key) or _opened_chests.has(coord)

func _mark_chest_opened(col: int, row: int) -> void:
	var map_key := _get_map_key()
	var coord := str(col) + "," + str(row)
	var key := map_key + ":" + coord
	_opened_chests[key] = true
	_opened_chests[coord] = true
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.opened_chests[key] = true
		gs.opened_chests[coord] = true

func _cmd_search() -> void:
	print("[DungeonMap] _cmd_search hero_tile=", _hero_tile)
	var target_tile := _find_target_chest_tile()
	if target_tile != Vector2i(-1, -1):
		_cmd_take()
	else:
		_show_dialog("", ["Thou dost not find\nanything of interest."])

func _cmd_item() -> void:
	_refresh_item_panel()
	_item_index = 0
	_item_panel.visible = true
	_item_open = true
	_refresh_item_cursor()

func _use_item(idx: int) -> void:
	if idx >= _inventory.size():
		return
	var item: Dictionary = _inventory[idx]
	var item_id := str(item.get("id", "")).to_lower()
	var item_name := str(item.get("name", item_id)).to_lower()
	var gs := get_node_or_null("/root/GameState")

	if item_id == "torch" or item_name == "torch" or "torch" in item_id or "torch" in item_name:
		_torch_active = true
		_update_darkness_mask()
		_show_dialog("", ["Thou hast lit a Torch.\nA warm glow fills the area!"])
		_inventory.remove_at(idx)
		if gs: gs.inventory = _inventory.duplicate(true)
		return

	var is_weapon: bool = ("sword" in item_id or "club" in item_id or "axe" in item_id or "staff" in item_id or String(item.get("type", "")) == "weapon")
	var is_armor: bool = ("armor" in item_id or "clothes" in item_id or "mail" in item_id or "plate" in item_id or String(item.get("type", "")) == "armor")
	var is_shield: bool = ("shield" in item_id or String(item.get("type", "")) == "shield")

	if is_weapon:
		if gs and gs.weapon == item_id:
			gs.weapon = ""
			_show_dialog("", ["Thou hast unequipped\nthe %s." % item.get("name", item_id)])
		else:
			if gs: gs.weapon = item_id
			_show_dialog("", ["Thou hast equipped\nthe %s!" % item.get("name", item_id)])
		return
	elif is_armor:
		if gs and gs.armor == item_id:
			gs.armor = ""
			_show_dialog("", ["Thou hast unequipped\nthe %s." % item.get("name", item_id)])
		else:
			if gs: gs.armor = item_id
			_show_dialog("", ["Thou hast equipped\nthe %s!" % item.get("name", item_id)])
		return

	match item.get("type", ""):
		"key":
			_show_dialog("", ["There is no door\nin that direction."])
		_:
			var desc := str(item.get("desc", "Thou usest the %s." % item_name))
			_show_dialog("", [desc])

class DarknessMask extends Node2D:
	var map
	func _init(m) -> void:
		map = m
	func _draw() -> void:
		if not map or not map.has_method("_is_dark") or not map._is_dark():
			return
		var radius_px: float = float(map._light_radius * 16) + 12.0
		var center := Vector2(128.0, 120.0)
		var steps := 36
		var points := PackedVector2Array()
		for i in range(steps):
			var angle := float(i) * TAU / float(steps)
			points.append(center + Vector2(cos(angle), sin(angle)) * radius_px)
		draw_rect(Rect2(0, 0, 256, 240), Color(0, 0, 0, 0.94))
		draw_colored_polygon(points, Color(0, 0, 0, -0.94))

func _show_dialog(speaker: String, pages: Array, on_done: Callable = Callable()) -> void:
	_dialog_pages = pages
	_dialog_on_done = on_done
	_current_page = 0
	_dialog_active = true
	_speaker_label.text = speaker
	_dialog_panel.visible = true
	_start_page(0)

func _start_page(idx: int) -> void:
	_dialog_label.text = ""
	_char_index = 0
	_is_typing = true
	_prompt_label.visible = false
	_do_typing()

func _do_typing() -> void:
	if not _is_typing or not _dialog_active:
		return
	var full: String = str(_dialog_pages[_current_page])
	if _char_index < full.length():
		_char_index += 1
		_dialog_label.text = full.substr(0, _char_index)
		var timer := get_tree().create_timer(TYPING_SPEED)
		timer.connect("timeout", _do_typing)
	else:
		_is_typing = false
		_prompt_label.visible = true

func _transition_to(scene_path: String, spawn: Vector2i, facing: String, come_from: String, dialog_text: String = "", sfx_path: String = "") -> void:
	_save_state(spawn, facing, come_from)
	var do_change := func():
		get_tree().change_scene_to_file.call_deferred(scene_path)
	if sfx_path != "":
		_play_sfx(sfx_path)
	if dialog_text != "":
		_show_dialog("", [dialog_text], do_change)
	else:
		do_change.call()

func _save_state(spawn: Vector2i, facing: String, come_from: String) -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	gs.inventory = _inventory.duplicate(true)
	gs.gold = _hero_gold
	gs.opened_chests = _opened_chests.duplicate(true)
	gs.spawn_tile = spawn
	gs.spawn_facing = facing
	gs.come_from = come_from

func _get_map_key() -> String:
	var p := _map_image_path()
	p = p.replace("res://assets/maps/", "")
	p = p.replace(".png", "")
	return p

func _load_default_spawn_from_json() -> void:
	var key := _get_map_key()
	var alt_key := key.replace("-1f", "")
	var f := FileAccess.open("res://data/v1/map_start_positions_from_world.json", FileAccess.READ)
	if not f:
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	if not data is Dictionary:
		return
	for entry: Dictionary in data.get("map_entry_points", []):
		var emap := str(entry.get("map", ""))
		if emap == key or emap == alt_key:
			var w: Dictionary = entry.get("world", {})
			if w.has("x") and w.has("y"):
				spawn_tile = Vector2i(int(w["x"]), int(w["y"]))
			if entry.has("facing"):
				spawn_facing = str(entry["facing"])
			break

func _load_tile_grid() -> void:
	var map_grids_dict: Dictionary = {}
	if DataManager and DataManager.is_loaded and not DataManager.map_grids.is_empty():
		map_grids_dict = DataManager.map_grids
	else:
		var f := FileAccess.open("res://data/v1/map_grids.json", FileAccess.READ)
		if not f:
			push_warning("DungeonMap: cannot open data/v1/map_grids.json")
			return
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		var store := MapGridsDataStoreV1.from_value(parsed)
		if store:
			map_grids_dict = store.to_value()
		else:
			push_warning("DungeonMap: map_grids.json parse failed")
			return
	var key := _get_map_key()
	var maps: Variant = map_grids_dict.get("maps", {})
	if not maps.has(key):
		push_warning("DungeonMap: no tile grid for map key: " + key)
		return
	_tile_grid = maps[key]["grid"]

func _pixel_is_walkable(tile: Vector2i) -> bool:
	if not _tile_grid.is_empty():
		var tid: int = _tile_grid[tile.y][tile.x]
		return TileWalkability.is_walkable(tid)
	# Fallback: pixel-luminance sampling (used when grid data is missing)
	if not _map_image:
		return true
	var px := clampi(tile.x * 16 + 8, 0, _map_image.get_width() - 1)
	var py := clampi(tile.y * 16 + 8, 0, _map_image.get_height() - 1)
	var c := _map_image.get_pixel(px, py)
	if c.a < 0.05:
		return false
	var lum := c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
	return lum > 0.05

func _is_walkable(tile: Vector2i) -> bool:
	if tile.x < 0 or tile.y < 0 or tile.x >= _get_map_w() or tile.y >= _get_map_h():
		return false
	if tile.x <= 0 or tile.y <= 0 or tile.x >= _get_map_w() - 1 or tile.y >= _get_map_h() - 1:
		return false
	# NPC tiles are impassable
	for npc in _npc_data:
		if npc.get("tile", Vector2i(-1,-1)) == tile:
			return false
	return _pixel_is_walkable(tile)

func _tile_center_world(col: int, row: int) -> Vector2:
	return Vector2((col + 0.5) * TILE_SIZE, (row + 0.5) * TILE_SIZE)

func _w2s(world: Vector2) -> Vector2:
	return world - _cam_world + Vector2(VW * 0.5, VH * 0.5)

func _facing_to_vec(f: String) -> Vector2i:
	match f:
		"up":
			return Vector2i(0, -1)
		"left":
			return Vector2i(-1, 0)
		"right":
			return Vector2i(1, 0)
	return Vector2i(0, 1)

func _vec_to_facing(v: Vector2i) -> String:
	match v:
		Vector2i(0, -1):
			return "up"
		Vector2i(-1, 0):
			return "left"
		Vector2i(1, 0):
			return "right"
	return "down"

func _facing_frames(dir: Vector2i) -> Array:
	match dir:
		Vector2i(0, -1):
			return FR_UP
		Vector2i(-1, 0):
			return FR_LEFT
		Vector2i(1, 0):
			return FR_RIGHT
	return FR_DOWN

func _build_debug_overlay() -> void:
	_debug_overlay = CanvasLayer.new()
	_debug_overlay.layer = 1
	_debug_overlay.visible = false
	add_child(_debug_overlay)
	var cols_vis := int(ceil(float(VW) / TILE_SIZE)) + 2
	var rows_vis := int(ceil(float(VH) / TILE_SIZE)) + 2
	for _i in range(cols_vis * rows_vis):
		var lbl := Label.new()
		lbl.add_theme_font_size_override("font_size", 9)
		lbl.add_theme_color_override("font_color", Color(1, 1, 0, 1))
		lbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 1))
		lbl.add_theme_constant_override("shadow_offset_x", 1)
		lbl.add_theme_constant_override("shadow_offset_y", 1)
		lbl.visible = false
		_debug_overlay.add_child(lbl)
		_debug_labels.append(lbl)

func _update_debug_overlay() -> void:
	if not _debug_active:
		return
	var half_w := VW * 0.5
	var half_h := VH * 0.5
	var col_min := int(floor((_cam_world.x - half_w) / TILE_SIZE))
	var row_min := int(floor((_cam_world.y - half_h) / TILE_SIZE))
	var col_max := int(ceil((_cam_world.x + half_w) / TILE_SIZE))
	var row_max := int(ceil((_cam_world.y + half_h) / TILE_SIZE))
	var idx := 0
	for row in range(row_min, row_max + 1):
		for col in range(col_min, col_max + 1):
			if idx >= _debug_labels.size():
				break
			var lbl: Label = _debug_labels[idx]
			idx += 1
			if row < 0 or col < 0 or row >= _get_map_h() or col >= _get_map_w():
				lbl.visible = false
				continue
			lbl.position = _w2s(Vector2(col * TILE_SIZE, row * TILE_SIZE)) + Vector2(2, 2)
			lbl.text = "%d,%d" % [col, row]
			lbl.visible = true
	for i in range(idx, _debug_labels.size()):
		(_debug_labels[i] as Label).visible = false
