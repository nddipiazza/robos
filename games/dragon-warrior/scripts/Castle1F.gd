extends Node2D

# ── Viewport ──────────────────────────────────────────────────────────────────
const VW            := 512
const VH            := 480
const DIALOG_H      := 152
const DIALOG_MARGIN := 10
const TYPING_SPEED  := 0.04

# ── Map ───────────────────────────────────────────────────────────────────────
const TILE_SIZE := 32
const MAP_W     := 32
const MAP_H     := 32

const MAP_GRID := [
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 4, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 1, 0, 4, 0, 4, 4, 0, 4, 0, 1, 3, 3, 3, 3, 3, 1, 0, 1, 7, 1, 0, 0, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 1, 0, 1, 8, 1, 0, 0, 0, 0, 0],
	[0, 1, 3, 3, 1, 3, 3, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 3, 3, 1, 3, 3, 1, 0, 0, 0, 4, 4, 0, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 4, 4, 4, 0, 0, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 11, 0, 0, 0],
	[0, 1, 1, 1, 1, 1, 3, 1, 3, 88, 3, 3, 3, 3, 3, 3, 1, 1, 1, 10, 1, 1, 1, 1, 1, 3, 1, 1, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 1, 3, 1, 34, 3, 3, 3, 3, 3, 1, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0],
	[0, 1, 3, 88, 3, 3, 3, 1, 3, 89, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 1, 3, 1, 1, 1, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 0, 0, 0],
	[0, 1, 1, 1, 1, 1, 3, 1, 4, 4, 3, 3, 3, 3, 4, 4, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 1, 3, 1, 4, 4, 3, 3, 3, 3, 4, 4, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 1, 3, 1, 4, 0, 3, 3, 3, 3, 0, 4, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0],
	[0, 1, 30, 3, 3, 10, 3, 1, 0, 0, 3, 3, 3, 3, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0],
	[0, 1, 3, 30, 3, 1, 3, 1, 0, 0, 3, 3, 3, 3, 0, 0, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1, 0, 0, 0],
	[0, 1, 30, 3, 30, 1, 3, 1, 0, 3, 3, 3, 3, 3, 3, 0, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1, 3, 21, 1, 0, 0, 0],
	[0, 1, 1, 1, 1, 1, 3, 1, 0, 3, 6, 6, 6, 6, 3, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 6, 31, 31, 6, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 6, 31, 31, 6, 3, 3, 3, 3, 3, 3, 3, 3, 1, 31, 31, 31, 31, 31, 1, 0, 0, 0],
	[0, 1, 1, 1, 3, 3, 1, 1, 1, 3, 6, 6, 6, 6, 3, 1, 1, 3, 3, 3, 3, 3, 1, 31, 31, 31, 31, 31, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1, 89, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 0, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 3, 1, 1, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 3, 3, 1, 3, 3, 3, 3, 3, 1, 6, 0, 0],
	[0, 1, 3, 3, 1, 3, 3, 3, 3, 1, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 6, 0, 0],
	[0, 1, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 1, 6, 6, 6, 6, 6, 6, 6, 0, 0],
	[0, 1, 3, 6, 6, 3, 3, 1, 3, 1, 3, 3, 3, 3, 1, 3, 3, 1, 1, 1, 1, 1, 1, 6, 6, 6, 6, 6, 6, 6, 0, 0],
	[0, 1, 6, 6, 6, 6, 3, 3, 3, 1, 3, 3, 3, 3, 1, 3, 3, 1, 3, 3, 1, 3, 1, 6, 6, 6, 6, 6, 6, 6, 0, 0],
	[0, 1, 6, 6, 6, 6, 3, 3, 3, 1, 1, 3, 3, 1, 1, 3, 3, 3, 3, 3, 8, 73, 1, 6, 6, 6, 6, 6, 6, 6, 0, 0],
	[0, 1, 6, 6, 6, 6, 6, 3, 3, 1, 26, 3, 3, 89, 1, 3, 3, 1, 3, 3, 1, 3, 1, 6, 6, 6, 6, 6, 6, 6, 0, 0],
	[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 6, 6, 6, 6, 6, 6, 6, 0, 0],
	[0, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 6, 33, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
]

# Walkable tile IDs are defined in data/tile_walkability.json (shared across all maps)
const NPC_IDS  := { 26: true, 73: true, 86: true, 88: true, 89: true, 7: true, 11: true }

# Facing direction per NPC (key = col*100+row) — string facing for NPCSprite
const NPC_FACING := {
	909:  "up",    # Guard (9,9)
	309:  "down",  # Minister (3,9)
	907:  "down",  # Guard (9,7)
	1621: "right", # Guard (16,21)
	2127: "down",  # Wise Man (21,27)
	1028: "down",  # Guard (10,28)
	1328: "down",  # Guard (13,28)
	2502: "down",  # Merchant (25,2)
	2806: "down",  # Lady (28,6)
}

# Position overrides where tile ID alone doesn't identify the correct character
const NPC_CHAR_OVERRIDE := {
	907:  "guard",    # tile 88 at (9,7) is actually a guard
	2502: "merchant", # tile 7  at (25,2) is a merchant
	2806: "lady",     # tile 11 at (28,6) is a lady
}

# ── Sprite frames ──────────────────────────────────────────────────────────────
const FR_DOWN  := [Rect2(  0, 0, 16, 16), Rect2( 20, 0, 16, 16)]
const FR_LEFT  := [Rect2( 40, 0, 16, 16), Rect2( 60, 0, 16, 16)]
const FR_UP    := [Rect2( 80, 0, 16, 16), Rect2(100, 0, 16, 16)]
const FR_RIGHT := [Rect2(120, 0, 16, 16), Rect2(140, 0, 16, 16)]

const MOVE_DURATION := 0.12

# Stairs at (30,30) go back up to ThroneRoom; hero respawns at stair tile (9,9)
const STAIR_UP_DEST := Vector2i(9, 9)

# Default spawn: tile (8,8) = upper-left staircase from ThroneRoom
# World pixel (256,256), visible staircase in castle upper-left room

# ── NPC dialogs  (col*100+row) ────────────────────────────────────────────────
const NPC_DIALOGS := {
	907: {
		"speaker": "Minister",
		"pages": [
			"Many brave adventurers have\nleft this castle to fight\nthe Dragonlord. None have\nreturned.",
		]
	},
	1621: {
		"speaker": "Sage",
		"pages": [
			"The Princess Gwaelin was\nkidnapped by the Dragonlord.\nThe King despairs for her\nsafety.",
		]
	},
	2127: {
		"speaker": "Wise Man",
		"pages": [
			"Welcome, descendant of\nErdrick. The town of\nBrecconary lies to the\nsouth of the castle.",
			"Thou wilt find merchants\nthere who can outfit thee\nfor thy quest.",
		]
	},
	1028: {
		"speaker": "Guard",
		"pages": [
			"The stairs behind thee\nlead to the Throne Room\nwhere King Lorik awaits.",
		]
	},
	1328: {
		"speaker": "Guard",
		"pages": [
			"The treasury lies beyond\nthese doors. Only those\nwith a Magic Key may\nenter.",
		]
	},
	909: {
		"speaker": "Guard",
		"pages": [
			"None shall pass without\nthe king's leave.",
		]
	},
	309: {
		"speaker": "Attendant",
		"pages": [
			"The king awaits you in\nthe throne room above.",
			"Go now, hero. Your\ndestiny lies ahead.",
		]
	},
	2027: {
		"speaker": "",
		"pages": [
			"Hero's coming was foretold by\nlegend. May the light shine\nupon this brave warrior.",
		]
	},
}

# ── Command menu ───────────────────────────────────────────────────────────────
const MENU_ITEMS := ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"]
const MENU_COLS  := 2
const MENU_ROWS  := 4

# ── Spawn configuration (set in Godot editor or by scene loader) ───────────────
@export var spawn_tile:   Vector2i = Vector2i(8, 8)
@export_enum("down","up","left","right") var spawn_facing: String = "right"

# ── Node refs ──────────────────────────────────────────────────────────────────
var _bg:            TextureRect
var _hero_ws:       WalkSprite
var _npc_sprites:   Dictionary = {}
var _dialog_panel:  Panel
var _speaker_label: Label
var _dialog_label:  Label
var _prompt_label:  Label
var _menu_panel:    Panel
var _menu_labels:   Array
var _status_panel:  Panel
var _item_panel:    Panel
var _item_labels:   Array
var _music:         AudioStreamPlayer
var _sfx:           AudioStreamPlayer

# ── Dialog state ───────────────────────────────────────────────────────────────
var _dialog_active  := false
var _dialog_pages:  Array[String] = []
var _dialog_on_done := Callable()
var _current_page   := 0
var _char_index     := 0
var _typing_timer   := 0.0
var _is_typing      := false

# ── Panel state ────────────────────────────────────────────────────────────────
var _menu_open   := false
var _menu_index  := 0
var _status_open := false
var _item_open   := false
var _item_index  := 0

# ── Shop and Choice state ──────────────────────────────────────────────────────
var _shops_db: Array = []
var _item_name_db: Dictionary = {}
var _shop_panel: Panel
var _choice_panel: Panel
var _shop_open := false
var _shop_items: Array = []
var _shop_index := 0
var _choice_open := false
var _choice_index := 0
var _choice_prompt := ""
var _choice_callback := Callable()

# ── Runtime hero state (from GameState) ────────────────────────────────────────
var _inventory:     Array      = []
var _hero_gold:     int        = 0
var _opened_chests: Dictionary = {}

# ── Background image cache ─────────────────────────────────────────────────────
var _bg_image:       Image
var _floor_tile_img: Image

# ── Movement / camera ──────────────────────────────────────────────────────────
var _move_enabled  := false

# ── Debug tile overlay ─────────────────────────────────────────────────────────
var _debug_overlay: CanvasLayer
var _debug_labels:  Array = []
var _debug_active:  bool  = false
var _hero_tile     := Vector2i(0, 0)   # set from spawn_tile in _ready()
var hero_tile: Vector2i:
	get: return _hero_tile
	set(v): _hero_tile = v
var _hero_moving   := false
var _move_t        := 0.0
var _cam_from      := Vector2.ZERO
var _cam_to        := Vector2.ZERO
var _cam_world     := Vector2.ZERO
var _hero_facing   := Vector2i(0, -1)
var hero_facing: Vector2i:
	get: return _hero_facing
	set(v): _hero_facing = v   # set from spawn_facing in _ready()
var _npc_positions: Dictionary = {}



# ── Helpers ────────────────────────────────────────────────────────────────────
func _facing_to_vec(f: String) -> Vector2i:
	match f:
		"up":    return Vector2i( 0, -1)
		"left":  return Vector2i(-1,  0)
		"right": return Vector2i( 1,  0)
		_:       return Vector2i( 0,  1)  # "down"

func _facing_to_frames(f: String) -> Array:
	match f:
		"up":    return FR_UP
		"left":  return FR_LEFT
		"right": return FR_RIGHT
		_:       return FR_DOWN

func _vec_to_facing(v: Vector2i) -> String:
	if v == Vector2i(0, -1): return "up"
	if v == Vector2i(-1, 0): return "left"
	if v == Vector2i(1, 0): return "right"
	return "down"

func _facing_to_frames_from_vec(v: Vector2i) -> Array:
	if   v == Vector2i( 0, -1): return FR_UP
	elif v == Vector2i(-1,  0): return FR_LEFT
	elif v == Vector2i( 1,  0): return FR_RIGHT
	else:                        return FR_DOWN

func _tile_center_world(col: int, row: int) -> Vector2:
	return Vector2((col + 0.5) * TILE_SIZE, (row + 0.5) * TILE_SIZE)

func _w2s(world: Vector2) -> Vector2:
	return world - _cam_world + Vector2(VW / 2.0, VH / 2.0)

func _map_tile_at(pos: Vector2i) -> int:
	if pos.y < 0 or pos.y >= MAP_H or pos.x < 0 or pos.x >= MAP_W:
		return -1
	var coord := str(pos.x) + "," + str(pos.y)
	if _opened_chests.has("castle_1f:" + coord) or _opened_chests.has(coord):
		return 3
	return MAP_GRID[pos.y][pos.x]

func _is_walkable(pos: Vector2i) -> bool:
	# Outer map boundary is always void — never walkable regardless of tile
	if pos.x <= 0 or pos.y <= 0 or pos.x >= MAP_W - 1 or pos.y >= MAP_H - 1:
		return false
	if _npc_positions.has(pos):
		return false
	var t: int = _map_tile_at(pos)
	return TileWalkability.is_walkable(t)

func _facing_tile() -> Vector2i:
	return _hero_tile + _hero_facing


func _load_default_spawn_from_json() -> void:
	var key := "tantegel-castle-1f"
	var f := FileAccess.open("res://data/v1/map_start_positions_from_world.json", FileAccess.READ)
	if not f:
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	if not data is Dictionary:
		return
	for entry: Dictionary in data.get("map_entry_points", []):
		if str(entry.get("map", "")) == key:
			var w: Dictionary = entry.get("world", {})
			if w.has("x") and w.has("y"):
				spawn_tile = Vector2i(int(w["x"]), int(w["y"]))
			if entry.has("facing"):
				spawn_facing = str(entry["facing"])
			break

# ── Ready ──────────────────────────────────────────────────────────────────────
func _ready() -> void:
	if spawn_tile == Vector2i(8, 8):
		_load_default_spawn_from_json()
	var gs := get_node_or_null("/root/GameState")
	if gs:
		_inventory     = gs.inventory.duplicate(true)
		_hero_gold     = gs.gold
		_opened_chests = gs.opened_chests.duplicate(true)
		if gs.come_from != "":
			_hero_tile   = gs.spawn_tile
			_hero_facing = _facing_to_vec(gs.spawn_facing)
		else:
			_hero_tile   = spawn_tile
			_hero_facing = _facing_to_vec(spawn_facing)
	else:
		_hero_tile   = spawn_tile
		_hero_facing = _facing_to_vec(spawn_facing)

	if not InputMap.has_action("cmd_menu"):
		InputMap.add_action("cmd_menu")
		var ev := InputEventKey.new()
		ev.keycode = KEY_B
		InputMap.action_add_event("cmd_menu", ev)

	_build_npc_positions()
	_build_background()
	_build_hero_sprite()
	_build_npc_sprites()
	_build_debug_overlay()
	if gs and gs.tile_debug_enabled:
		_debug_active = true
		if _debug_overlay:
			_debug_overlay.visible = true
		_update_debug_overlay()
	_build_ui()
	_build_sfx_player()
	_start_music()

	_cam_world    = _tile_center_world(_hero_tile.x, _hero_tile.y)
	_move_enabled = true


func _build_npc_positions() -> void:
	for row in range(MAP_H):
		for col in range(MAP_W):
			var t: int = MAP_GRID[row][col]
			if NPC_IDS.has(t):
				_npc_positions[Vector2i(col, row)] = true


func _clean_npc_bg_tiles() -> void:
	if not _bg_image or _npc_positions.is_empty():
		return

	var tile_w: int = TILE_SIZE
	var tile_h: int = TILE_SIZE
	var ground_tiles: Array[int] = [3, 0, 4, 8, 10, 18, 21, 30, 31]
	var neighbors: Array[Vector2i] = [
		Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0),
		Vector2i(-1, -1), Vector2i(-1, 1), Vector2i(1, -1), Vector2i(1, 1)
	]

	for pos in _npc_positions.keys():
		if pos.x < 0 or pos.x >= MAP_W or pos.y < 0 or pos.y >= MAP_H:
			continue

		var clean_tile := Vector2i(-1, -1)

		for offset in neighbors:
			var n: Vector2i = pos + offset
			if n.x >= 0 and n.x < MAP_W and n.y >= 0 and n.y < MAP_H and not _npc_positions.has(n):
				var tid: int = MAP_GRID[n.y][n.x]
				if tid in ground_tiles:
					clean_tile = n
					break

		if clean_tile == Vector2i(-1, -1):
			for offset in neighbors:
				var n: Vector2i = pos + offset
				if n.x >= 0 and n.x < MAP_W and n.y >= 0 and n.y < MAP_H and not _npc_positions.has(n):
					clean_tile = n
					break

		if clean_tile != Vector2i(-1, -1):
			var src_rect := Rect2i(clean_tile.x * tile_w, clean_tile.y * tile_h, tile_w, tile_h)
			var dst_pos := Vector2i(pos.x * tile_w, pos.y * tile_h)
			_bg_image.blit_rect(_bg_image, src_rect, dst_pos)

func _build_background() -> void:
	_bg = TextureRect.new()
	_bg.name = "Background"
	var src := Image.load_from_file(
		ProjectSettings.globalize_path("res://assets/renders/tantegel_castle_1f.png"))
	if src:
		_bg_image = src.duplicate()
		_bg_image.resize(MAP_W * TILE_SIZE, MAP_H * TILE_SIZE, Image.INTERPOLATE_NEAREST)
		_clean_npc_bg_tiles()
		_bg.texture = ImageTexture.create_from_image(_bg_image)
		var map_src := Image.load_from_file(
			ProjectSettings.globalize_path("res://assets/maps/tantegel-castle-1f.png"))
		if map_src:
			# Grab a known floor tile pixel region for chest-open visuals
			var floor_px := map_src.get_region(Rect2i(2 * 16, 7 * 16, 16, 16))
			_floor_tile_img = floor_px.duplicate()
			_floor_tile_img.resize(TILE_SIZE, TILE_SIZE, Image.INTERPOLATE_NEAREST)
	_bg.stretch_mode = TextureRect.STRETCH_KEEP
	_bg.size         = Vector2(MAP_W * TILE_SIZE, MAP_H * TILE_SIZE)
	add_child(_bg)


func _make_walk_sprite(sheet_path: String, f0: Rect2, f1: Rect2, px_scale: float = 2.0, x_off: float = 0.0) -> WalkSprite:
	var ws  := WalkSprite.new()
	var tex: Texture2D = load(sheet_path) if ResourceLoader.exists(sheet_path) else null
	if tex == null:
		var img := Image.load_from_file(ProjectSettings.globalize_path(sheet_path))
		if img:
			tex = ImageTexture.create_from_image(img)
	ws.texture     = tex
	ws.frame0_rect = f0
	ws.frame1_rect = f1
	ws.pixel_scale = px_scale
	ws.x_offset    = x_off
	return ws


func _build_hero_sprite() -> void:
	var fr := _facing_to_frames_from_vec(_hero_facing)
	_hero_ws             = _make_walk_sprite("res://assets/sprites/rgba/characters-3.png", fr[0], fr[1])
	_hero_ws.toggle_time = 0.5
	_hero_ws.name        = "Hero"
	add_child(_hero_ws)
	# Set initial position immediately so hero doesn't flash at (0,0) on first frame
	_hero_ws.position = Vector2(VW / 2.0 - 16, VH / 2.0 - 16)


func _build_npc_sprites() -> void:
	# Map tile IDs to NPCSprite character_ids
	# 88 = minister, 73 = sage/wise man, 26/86/89 = guard
	const TILE_TO_CHAR := {
		88: "minister",
		73: "sage",
		26: "guard",
		86: "guard",
		89: "guard",
		7:  "minister",  # merchant/generic NPC — overridden by NPC_CHAR_OVERRIDE per pos
		11: "lady",
	}
	for pos in _npc_positions.keys():
		var t: int = MAP_GRID[pos.y][pos.x]
		var npc_key: int = pos.x * 100 + pos.y
		var char_id: String = NPC_CHAR_OVERRIDE.get(npc_key, TILE_TO_CHAR.get(t, "guard"))
		var facing: String  = NPC_FACING.get(npc_key, "down")
		var ns: Node2D
		if char_id == "merchant":
			var mf := NPCSpriteFiles.new()
			mf.down_frame_1  = "res://assets/sprites/npc/053_r3_c8.png"
			mf.down_frame_2  = "res://assets/sprites/npc/054_r3_c9.png"
			mf.left_frame_1  = "res://assets/sprites/npc/055_r3_c10.png"
			mf.left_frame_2  = "res://assets/sprites/npc/056_r3_c11.png"
			mf.up_frame_1    = "res://assets/sprites/npc/057_r3_c12.png"
			mf.up_frame_2    = "res://assets/sprites/npc/058_r3_c13.png"
			mf.right_frame_1 = "res://assets/sprites/npc/059_r3_c14.png"
			mf.right_frame_2 = "res://assets/sprites/npc/059_r3_c14.png"
			mf.facing        = facing
			mf.pixel_scale   = 2.0
			ns = mf
		else:
			var npc := NPCSprite.new()
			npc.character_id = char_id
			npc.facing       = facing
			npc.pixel_scale  = 2.0
			ns = npc
		_npc_sprites[pos] = ns
		add_child(ns)



func _build_debug_overlay() -> void:
	_debug_overlay = CanvasLayer.new()
	_debug_overlay.layer = 1
	_debug_overlay.visible = false
	add_child(_debug_overlay)
	# Pre-create enough labels to cover the viewport (worst case ~18x16 tiles at 32px)
	var cols_vis := int(ceil(float(VW) / TILE_SIZE)) + 2
	var rows_vis := int(ceil(float(VH) / TILE_SIZE)) + 2
	for _i in range(cols_vis * rows_vis):
		var lbl := Label.new()
		lbl.add_theme_font_size_override("font_size", 9)
		lbl.add_theme_color_override("font_color", Color(1, 1, 0, 1))
		lbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 1))
		lbl.add_theme_constant_override("shadow_offset_x", 1)
		lbl.add_theme_constant_override("shadow_offset_y", 1)
		lbl.add_theme_constant_override("shadow_outline_size", 1)
		lbl.visible = false
		_debug_overlay.add_child(lbl)
		_debug_labels.append(lbl)


func _update_debug_overlay() -> void:
	if not _debug_active:
		return
	# Figure out which tiles are currently on screen
	var cam := _cam_world
	var half_w := VW * 0.5
	var half_h := VH * 0.5
	var col_min := int(floor((cam.x - half_w) / TILE_SIZE))
	var row_min := int(floor((cam.y - half_h) / TILE_SIZE))
	var col_max := int(ceil((cam.x + half_w) / TILE_SIZE))
	var row_max := int(ceil((cam.y + half_h) / TILE_SIZE))
	var idx := 0
	for row in range(row_min, row_max + 1):
		for col in range(col_min, col_max + 1):
			if idx >= _debug_labels.size():
				break
			var lbl: Label = _debug_labels[idx]
			idx += 1
			if row < 0 or col < 0 or row >= MAP_H or col >= MAP_W:
				lbl.visible = false
				continue
			var screen_pos := _w2s(Vector2(col * TILE_SIZE, row * TILE_SIZE))
			lbl.position = screen_pos + Vector2(2, 2)
			lbl.text     = "%d,%d" % [col, row]
			lbl.visible  = true
	for i in range(idx, _debug_labels.size()):
		(_debug_labels[i] as Label).visible = false


func _build_sfx_player() -> void:
	_sfx = AudioStreamPlayer.new()
	add_child(_sfx)


func _play_sfx(path: String) -> void:
	var stream := load(path) as AudioStream
	if stream:
		_sfx.stream = stream
		_sfx.play()


func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	var bgm := load("res://assets/music/mp3/tantegel_castle.mp3") as AudioStream
	if bgm:
		_music.stream = bgm
		if _music.stream is AudioStreamMP3:
			(_music.stream as AudioStreamMP3).loop = true
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()


# ── UI ─────────────────────────────────────────────────────────────────────────
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


func _make_box_style(bg: Color, border: Color, radius: int = 4) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color                   = bg
	s.border_color               = border
	s.border_width_left          = 2
	s.border_width_right         = 2
	s.border_width_top           = 2
	s.border_width_bottom        = 2
	s.corner_radius_top_left     = radius
	s.corner_radius_top_right    = radius
	s.corner_radius_bottom_left  = radius
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
	_dialog_panel.size     = Vector2(VW - DIALOG_MARGIN * 2, DIALOG_H)
	_dialog_panel.position = Vector2(DIALOG_MARGIN, VH - DIALOG_H - DIALOG_MARGIN)
	_dialog_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.04, 0.06, 0.15, 0.95), Color(0.6, 0.8, 1.0)))
	_dialog_panel.visible = false

	_speaker_label          = _make_label("", 13, Color(1.0, 0.85, 0.3))
	_speaker_label.position = Vector2(12, 8)
	_dialog_panel.add_child(_speaker_label)

	_dialog_label               = _make_label("", 14)
	_dialog_label.position      = Vector2(12, 28)
	_dialog_label.size          = Vector2(_dialog_panel.size.x - 24, 90)
	_dialog_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_panel.add_child(_dialog_label)

	_prompt_label          = _make_label("▼", 13, Color(0.7, 0.9, 1.0))
	_prompt_label.position = Vector2(_dialog_panel.size.x - 24, DIALOG_H - 26)
	_dialog_panel.add_child(_prompt_label)
	canvas.add_child(_dialog_panel)


func _build_menu_panel(canvas: CanvasLayer) -> void:
	var pw := 180
	var ph := 140
	_menu_panel          = Panel.new()
	_menu_panel.size     = Vector2(pw, ph)
	_menu_panel.position = Vector2(VW - pw - 8, 8)
	_menu_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_menu_panel.visible = false
	_menu_labels = []
	for i in MENU_ITEMS.size():
		var col := i % MENU_COLS
		var row := i / MENU_COLS
		var lbl := _make_label(MENU_ITEMS[i], 14)
		lbl.position = Vector2(16 + col * 82, 12 + row * 28)
		_menu_panel.add_child(lbl)
		_menu_labels.append(lbl)
	canvas.add_child(_menu_panel)


func _build_status_panel(canvas: CanvasLayer) -> void:
	var gs    := get_node_or_null("/root/GameState")
	var stats : Dictionary
	if gs:
		stats = gs.hero_stats
	else:
		stats = {
			"name": "ERDRICK", "level": 1,
			"hp": 15, "hp_max": 15, "mp": 0, "mp_max": 0,
			"str": 4, "agl": 4, "atk": 4, "def": 2, "exp": 0
		}

	_status_panel          = Panel.new()
	_status_panel.size     = Vector2(240, 220)
	_status_panel.position = Vector2((VW - 240) / 2, (VH - 220) / 2)
	_status_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_status_panel.visible = false

	var rows_data := [
		["NAME",  stats.get("name", "ERDRICK")],
		["LEVEL", str(stats.get("level", 1))],
		["HP",    "%d / %d" % [stats.get("hp", 15),  stats.get("hp_max", 15)]],
		["MP",    "%d / %d" % [stats.get("mp", 0),   stats.get("mp_max", 0)]],
		["STR",   str(stats.get("str", 4))],
		["AGL",   str(stats.get("agl", 4))],
		["ATK",   str(stats.get("atk", 4))],
		["DEF",   str(stats.get("def", 2))],
		["EXP",   str(stats.get("exp", 0))],
		["GOLD",  str(_hero_gold)],
	]
	for i in rows_data.size():
		var kl := _make_label(rows_data[i][0], 13, Color(1.0, 0.85, 0.3))
		kl.position = Vector2(16, 12 + i * 19)
		_status_panel.add_child(kl)
		var vl := _make_label(rows_data[i][1], 13)
		vl.position = Vector2(110, 12 + i * 19)
		_status_panel.add_child(vl)
	canvas.add_child(_status_panel)


func _build_item_panel(canvas: CanvasLayer) -> void:
	_item_panel          = Panel.new()
	_item_panel.size     = Vector2(280, 220)
	_item_panel.position = Vector2((VW - 280) / 2, (VH - 220) / 2)
	_item_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_item_panel.visible = false
	_item_labels = []
	canvas.add_child(_item_panel)
	_refresh_item_panel()


func _refresh_item_panel() -> void:
	for child in _item_panel.get_children():
		_item_panel.remove_child(child)
		child.queue_free()
	_item_labels = []

	var title          := _make_label("ITEMS", 14, Color(1.0, 0.85, 0.3))
	title.position      = Vector2(16, 10)
	_item_panel.add_child(title)

	if _inventory.is_empty():
		var empty          := _make_label("Nothing.", 13, Color(0.7, 0.7, 0.7))
		empty.position      = Vector2(16, 36)
		_item_panel.add_child(empty)
	else:
		for i in _inventory.size():
			var lbl          := _make_label(_inventory[i]["name"], 13)
			lbl.position      = Vector2(28, 36 + i * 20)
			_item_panel.add_child(lbl)
			_item_labels.append(lbl)

	var desc               := _make_label("", 12, Color(0.7, 0.9, 1.0))
	desc.name               = "ItemDesc"
	desc.position           = Vector2(16, 180)
	desc.size               = Vector2(248, 36)
	desc.autowrap_mode      = TextServer.AUTOWRAP_WORD_SMART
	_item_panel.add_child(desc)


# ── Process ────────────────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	if _hero_moving:
		_move_t    = minf(_move_t + delta / MOVE_DURATION, 1.0)
		_cam_world = _cam_from.lerp(_cam_to, _move_t)
		if _move_t >= 1.0:
			_hero_moving = false
	elif _move_enabled and not _dialog_active and not _menu_open and not _status_open and not _item_open:
		_poll_move_input()
	_draw_frame()


func _draw_frame() -> void:
	_bg.position = _w2s(Vector2.ZERO)
	_hero_ws.position = Vector2(VW / 2.0 - 16, VH / 2.0 - 16)
	for pos in _npc_sprites.keys():
		var ws: Node2D = _npc_sprites[pos]
		ws.position = _w2s(Vector2(pos.x * TILE_SIZE, pos.y * TILE_SIZE))
	_update_debug_overlay()


func _poll_move_input() -> void:
	var dir := Vector2i.ZERO
	if   Input.is_action_pressed("move_up") or Input.is_action_pressed("ui_up"):    dir = Vector2i(0, -1)
	elif Input.is_action_pressed("move_down") or Input.is_action_pressed("ui_down"):  dir = Vector2i(0,  1)
	elif Input.is_action_pressed("move_left") or Input.is_action_pressed("ui_left"):  dir = Vector2i(-1, 0)
	elif Input.is_action_pressed("move_right") or Input.is_action_pressed("ui_right"): dir = Vector2i(1,  0)
	if dir == Vector2i.ZERO:
		return
	var new_frames: Array = FR_DOWN
	if   dir == Vector2i(0, -1): new_frames = FR_UP
	elif dir == Vector2i(0,  1): new_frames = FR_DOWN
	elif dir == Vector2i(-1, 0): new_frames = FR_LEFT
	elif dir == Vector2i(1,  0): new_frames = FR_RIGHT
	var prev_facing := _hero_facing
	_hero_facing     = dir
	if _hero_ws:
		if dir != prev_facing:
			_hero_ws.set_frames(new_frames[0], new_frames[1])
		_hero_ws.step()
	var dest := _hero_tile + dir
	# South exit: walking off row 30 cols 11-12 → World Map at Tantegel (0x2D,0x2D)
	if dest.y >= MAP_H - 1 and dest.x >= 11 and dest.x <= 12:
		_save_state(Vector2i(0x2d, 0x2d), "castle_1f", "down")
		get_tree().change_scene_to_file.call_deferred("res://scenes/WorldMap.tscn")
		return
	if not _is_walkable(dest):
		return
	_hero_tile   = dest
	_cam_from    = _cam_world
	_cam_to      = _tile_center_world(_hero_tile.x, _hero_tile.y)
	_move_t      = 0.0
	_hero_moving = true


# ── Input ──────────────────────────────────────────────────────────────────────
func _unhandled_input(event: InputEvent) -> void:
	# Ctrl+X: hold to show tile debug overlay
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
	if _choice_open:
		_handle_choice_input(event)
		return
	if _shop_open:
		_handle_shop_input(event)
		return
	if _dialog_active:
		_handle_dialog_input(event)
		return
	if _status_open:
		if event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_status_panel.visible = false
			_status_open          = false
		return
	if _item_open:
		_handle_item_input(event)
		return
	if _menu_open:
		_handle_menu_input(event)
		return
	_handle_move_input(event)


func _handle_move_input(event: InputEvent) -> void:
	if not _move_enabled or _hero_moving:
		return
	var dir := Vector2i.ZERO
	if   event.is_action_pressed("move_up"):    dir = Vector2i(0, -1)
	elif event.is_action_pressed("move_down"):  dir = Vector2i(0,  1)
	elif event.is_action_pressed("move_left"):  dir = Vector2i(-1, 0)
	elif event.is_action_pressed("move_right"): dir = Vector2i(1,  0)
	elif event.is_action_pressed("cmd_menu"):
		_open_menu()
		return
	elif event.is_action_pressed("ui_accept"):
		var ft  := _facing_tile()
		var key := ft.x * 100 + ft.y
		if NPC_DIALOGS.has(key):
			var nd: Dictionary = NPC_DIALOGS[key]
			var pages : Array[String] = []
			for p in nd["pages"]:
				pages.append(p as String)
			_show_dialog(nd["speaker"], pages)
		return

	if dir == Vector2i.ZERO:
		return

	var new_frames: Array = FR_DOWN
	if   dir == Vector2i(0, -1): new_frames = FR_UP
	elif dir == Vector2i(0,  1): new_frames = FR_DOWN
	elif dir == Vector2i(-1, 0): new_frames = FR_LEFT
	elif dir == Vector2i(1,  0): new_frames = FR_RIGHT

	var prev_facing := _hero_facing
	_hero_facing     = dir
	if _hero_ws:
		if dir != prev_facing:
			_hero_ws.set_frames(new_frames[0], new_frames[1])
		_hero_ws.step()

	var dest := _hero_tile + dir
	if not _is_walkable(dest):
		return

	_hero_tile   = dest
	_cam_from    = _cam_world
	_cam_to      = _tile_center_world(_hero_tile.x, _hero_tile.y)
	_move_t      = 0.0
	_hero_moving = true


func _handle_dialog_input(event: InputEvent) -> void:
	if not (event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel")):
		return
	if _is_typing:
		_char_index          = _dialog_pages[_current_page].length()
		_is_typing           = false
		_dialog_label.text   = _dialog_pages[_current_page]
		_prompt_label.visible = true
		return
	_current_page += 1
	if _current_page >= _dialog_pages.size():
		_dialog_panel.visible = false
		_dialog_active        = false
		if _dialog_on_done.is_valid():
			_dialog_on_done.call()
	else:
		_start_page(_current_page)


func _handle_menu_input(event: InputEvent) -> void:
	if event.is_action_pressed("move_up"):
		_menu_index = (_menu_index - MENU_COLS + MENU_ITEMS.size()) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_down"):
		_menu_index = (_menu_index + MENU_COLS) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_left"):
		_menu_index = (_menu_index - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_right"):
		_menu_index = (_menu_index + 1) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("ui_accept"):
		_menu_panel.visible = false
		_menu_open          = false
		_execute_menu_item(MENU_ITEMS[_menu_index])
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
		_menu_panel.visible = false
		_menu_open          = false


func _handle_item_input(event: InputEvent) -> void:
	if _inventory.is_empty():
		if event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_item_panel.visible = false
			_item_open          = false
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
		_item_open          = false


func _open_menu() -> void:
	_menu_index = 0
	_menu_open  = true
	_refresh_menu()
	_menu_panel.visible = true


func _refresh_menu() -> void:
	for i in _menu_labels.size():
		var color := Color(1.0, 0.85, 0.3) if i == _menu_index else Color.WHITE
		_menu_labels[i].add_theme_color_override("font_color", color)


func _refresh_item_cursor() -> void:
	for i in _item_labels.size():
		var color := Color(1.0, 0.85, 0.3) if i == _item_index else Color.WHITE
		_item_labels[i].add_theme_color_override("font_color", color)
	var desc_node := _item_panel.get_node_or_null("ItemDesc") as Label
	if desc_node and _item_index < _inventory.size():
		desc_node.text = _inventory[_item_index].get("desc", "")


func _execute_menu_item(cmd: String) -> void:
	match cmd:
		"TALK":   _cmd_talk()
		"DOOR":   _cmd_door()
		"STATUS": _cmd_status()
		"TAKE":   _cmd_take()
		"STAIRS": _cmd_stairs()
		"SPELL":  _cmd_spell()
		"SEARCH": _cmd_search()
		"ITEM":   _cmd_item()


func _load_item_name_db() -> void:
	if not _item_name_db.is_empty():
		return
	var f := FileAccess.open("res://data/v1/items.json", FileAccess.READ)
	if f:
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		var arr: Array = []
		if parsed is Array:
			arr = parsed
		elif parsed is Dictionary:
			var store := ItemsDataStoreV1.from_value(parsed)
			if store:
				arr = store.to_array()
		for item in arr:
			var iid := str(item.get("id", item.get("key", "")))
			var nm := str(item.get("name", iid))
			if iid != "":
				_item_name_db[iid] = nm

func _load_shops_db() -> void:
	if not _shops_db.is_empty():
		return
	var f := FileAccess.open("res://data/v1/shops.json", FileAccess.READ)
	if f:
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if parsed is Array:
			_shops_db = parsed

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
	_load_item_name_db()
	_load_shops_db()
	var shop: Dictionary = {}
	for s in _shops_db:
		var sid := str(s.get("id", ""))
		if sid == shop_id or (shop_id == "tantegel_key_shop" and (sid == "tan001" or s.get("type") == "key_shop")):
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

func _clear_panel(p: Panel) -> void:
	if not p:
		return
	for c in p.get_children():
		c.queue_free()

func _cmd_talk() -> void:
	var ft  := _facing_tile()
	var key := ft.x * 100 + ft.y
	if _hero_tile == Vector2i(25, 4) or _hero_tile == Vector2i(25, 3) or ft == Vector2i(25, 3) or ft == Vector2i(25, 2) or key == 2502 or key == 2503:
		_hero_facing = Vector2i(0, -1)
		if _hero_ws:
			var fr := _facing_to_frames_from_vec(_hero_facing)
			_hero_ws.set_frames(fr[0], fr[1])
		_open_shop("tantegel_key_shop")
		return
	if NPC_DIALOGS.has(key):
		var nd: Dictionary = NPC_DIALOGS[key]
		var pages : Array[String] = []
		for p in nd["pages"]:
			pages.append(p as String)
		_show_dialog(nd["speaker"], pages)
	else:
		_show_dialog("", ["There is no one there."])


func _cmd_status() -> void:
	_status_panel.visible = true
	_status_open          = true


func _cmd_stairs() -> void:
	if _hero_tile == Vector2i(13, 4):
		_play_sfx("res://assets/music/mp3/stairs_down.mp3")
		_show_dialog("", ["Thou descendest the stairs."],
			func():
				_save_state(Vector2i(0, 1), "castle_1f", "down")
				get_tree().change_scene_to_file.call_deferred("res://scenes/TantegelBasement.tscn")
		)
	elif _map_tile_at(_hero_tile) == 33:
		_play_sfx("res://assets/music/mp3/stairs_up.mp3")
		_show_dialog("", ["Thou ascendest the stairs."],
			func():
				_save_state(STAIR_UP_DEST, "castle_1f", "up")
				get_tree().change_scene_to_file("res://scenes/ThroneRoom.tscn")
		)
	else:
		_show_dialog("", ["There are no stairs here."])


func _cmd_search() -> void:
	if _map_tile_at(_hero_tile) == 30:
		_show_dialog("", ["Thou dost find a Treasure\nChest beneath thy feet!"])
	else:
		_show_dialog("", ["Thou dost not find\nanything of interest."])


func _cmd_door() -> void:
	var ft := _facing_tile()
	if _map_tile_at(ft) == 10:
		var key_idx := -1
		for i in range(_inventory.size()):
			var it = _inventory[i]
			var is_key := false
			if it is Dictionary:
				if it.get("type", "") == "key" or it.get("name", "") == "Magic Key":
					is_key = true
			elif it is String and it == "Magic Key":
				is_key = true
			if is_key:
				key_idx = i
				break
		if key_idx >= 0:
			_inventory.remove_at(key_idx)
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.inventory = _inventory.duplicate(true)
			_play_sfx("res://assets/music/mp3/open_door.mp3")
			_show_dialog("", ["The door clicks open."],
				func(): _open_door_visual(ft))
		else:
			_show_dialog("", ["Thou dost not have\na Magic Key."])
	else:
		_show_dialog("", ["There is no door\nin that direction."])


func _cmd_take() -> void:
	if _map_tile_at(_hero_tile) != 30:
		_show_dialog("", ["There is nothing\nto take here."])
		return
	var coord := str(_hero_tile.x) + "," + str(_hero_tile.y)
	var map_key := "castle_1f:" + coord
	if _opened_chests.has(map_key) or _opened_chests.has(coord):
		_show_dialog("", ["The chest is already\nempty."])
		return
	var gold_amount := 10 + randi() % 50
	_hero_gold += gold_amount
	_opened_chests[map_key] = true
	_opened_chests[coord] = true
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.opened_chests[map_key] = true
		gs.opened_chests[coord] = true
	_play_sfx("res://assets/music/mp3/open_treasure.mp3")
	_open_chest_visual(_hero_tile)
	_show_dialog("", ["Thou dost find\n" + str(gold_amount) + " Gold Pieces!"])


func _cmd_spell() -> void:
	_show_dialog("", ["Thou hast no spells\nto cast."])


func _cmd_item() -> void:
	_refresh_item_panel()
	_item_index = 0
	_item_panel.visible = true
	_item_open  = true
	_refresh_item_cursor()


func _use_item(idx: int) -> void:
	if idx >= _inventory.size():
		return
	var item = _inventory[idx]
	var item_type := ""
	var item_name := ""
	if item is Dictionary:
		item_type = str(item.get("type", ""))
		item_name = str(item.get("name", ""))
	elif item is String:
		item_name = str(item)
		if item_name == "Magic Key":
			item_type = "key"

	if item_type == "key" or item_name == "Magic Key":
		var ft := _facing_tile()
		if _map_tile_at(ft) == 10:
			_inventory.remove_at(idx)
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.inventory = _inventory.duplicate(true)
			_item_panel.visible = false
			_item_open          = false
			_play_sfx("res://assets/music/mp3/open_door.mp3")
			_show_dialog("", ["The door clicks open."],
				func(): _open_door_visual(ft))
		else:
			_show_dialog("", ["There is no door\nin that direction."])
	else:
		var desc_str: String = str(item.get("desc", "Thou usest the " + item_name + ".")) if item is Dictionary else "Thou usest the " + item_name + "."
		_show_dialog("", [desc_str])


func _open_chest_visual(pos: Vector2i) -> void:
	if not (_bg_image and _floor_tile_img):
		return
	var tile := _floor_tile_img.duplicate()
	if tile.get_format() != _bg_image.get_format():
		tile.convert(_bg_image.get_format())
	_bg_image.blit_rect(tile,
		Rect2i(0, 0, TILE_SIZE, TILE_SIZE),
		Vector2i(pos.x * TILE_SIZE, pos.y * TILE_SIZE))
	_bg.texture = ImageTexture.create_from_image(_bg_image)


func _open_door_visual(pos: Vector2i) -> void:
	if not (_bg_image and _floor_tile_img):
		return
	var tile := _floor_tile_img.duplicate()
	if tile.get_format() != _bg_image.get_format():
		tile.convert(_bg_image.get_format())
	_bg_image.blit_rect(tile,
		Rect2i(0, 0, TILE_SIZE, TILE_SIZE),
		Vector2i(pos.x * TILE_SIZE, pos.y * TILE_SIZE))
	_bg.texture = ImageTexture.create_from_image(_bg_image)


# ── Dialog system ──────────────────────────────────────────────────────────────
func _show_dialog(speaker: String, pages: Array[String],
		on_done: Callable = Callable()) -> void:
	_dialog_pages        = pages
	_dialog_on_done      = on_done
	_current_page        = 0
	_dialog_active       = true
	_speaker_label.text  = speaker
	_dialog_panel.visible = true
	_start_page(0)


func _start_page(idx: int) -> void:
	_dialog_label.text    = ""
	_char_index           = 0
	_typing_timer         = 0.0
	_is_typing            = true
	_prompt_label.visible = false
	_typing_process_on()


func _typing_process_on() -> void:
	var t := get_tree().create_timer(0.0)
	t.connect("timeout", _do_typing)


func _do_typing() -> void:
	if not _is_typing or not _dialog_active:
		return
	var full := _dialog_pages[_current_page]
	if _char_index < full.length():
		_char_index       += 1
		_dialog_label.text = full.substr(0, _char_index)
		var timer          := get_tree().create_timer(TYPING_SPEED)
		timer.connect("timeout", _do_typing)
	else:
		_is_typing            = false
		_prompt_label.visible = true


# ── Save state ─────────────────────────────────────────────────────────────────
func _save_state(spawn: Vector2i, from_scene: String, facing: String = "") -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	gs.inventory     = _inventory.duplicate(true)
	gs.gold          = _hero_gold
	gs.opened_chests = _opened_chests.duplicate(true)
	gs.spawn_tile    = spawn
	gs.spawn_facing  = facing if facing != "" else _vec_to_facing(_hero_facing)
	gs.come_from     = from_scene
