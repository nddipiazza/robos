extends Node2D

# ── Viewport ─────────────────────────────────────────────────────────────────
const VW            := 512
const VH            := 480
const DIALOG_H      := 152
const DIALOG_MARGIN := 10
const TYPING_SPEED  := 0.04

# ── Map / movement ────────────────────────────────────────────────────────────
const TILE_SIZE := 32
const MAP_W     := 12
const MAP_H     := 12

const MAP_GRID := [
	[90,90,90,90,90,90,90,90,90,90,90,90],
	[90, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,90],
	[90, 1, 3, 3, 3, 3, 3,30, 3, 3, 1,90],
	[90, 1, 3, 8, 8, 8, 8, 8, 8, 3, 1,90],
	[90, 1, 3, 8,91, 8, 8, 3, 8, 3, 1,90],
	[90, 1, 3, 3, 3,30,30, 3, 3, 3, 1,90],
	[90, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1,90],
	[90, 1, 3, 3,26, 3,73, 3, 3, 3, 1,90],
	[90, 1, 1, 1, 1,10, 1, 1, 1, 1, 1,90],
	[90, 1, 3, 3, 3, 3, 3, 3, 3,33, 1,90],
	[90, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,90],
	[90,90,90,90,90,90,90,90,90,90,90,90],
]

# Walkable tile IDs are defined in data/tile_walkability.json (shared across all maps)

const NPC_TILES: Array[Vector2i] = [
	Vector2i(4, 4),
	Vector2i(4, 7),
	Vector2i(6, 7),
]

# ── Sprite frames ─────────────────────────────────────────────────────────────
const FR_DOWN  := [Rect2(  0, 0, 16, 16), Rect2( 20, 0, 16, 16)]
const FR_LEFT  := [Rect2( 40, 0, 16, 16), Rect2( 60, 0, 16, 16)]
const FR_UP    := [Rect2( 80, 0, 16, 16), Rect2(100, 0, 16, 16)]
const FR_RIGHT := [Rect2(120, 0, 16, 16), Rect2(140, 0, 16, 16)]

const MOVE_DURATION := 0.12

# ── NPC dialog ────────────────────────────────────────────────────────────────
# Keys are encoded as col*100+row for fast lookup.
const NPC_DIALOGS := {
	404: {
		"speaker": "King Lorik",
		"pages": [
			"Descendant of Erdrick,\nwelcome. The Ball of Light\nmust be recovered from the\nDragonlord. Art thou prepared?",
			"Go forth with courage,\nhero. Alefgard's fate\nrests upon thy shoulders."
		]
	},
	407: {
		"speaker": "Guard",
		"pages": [
			"Beyond the castle walls\nlies great danger. Purchase\nequipment in Brecconary\nbefore venturing far."
		]
	},
	607: {
		"speaker": "Guard",
		"pages": [
			"The town of Brecconary\nlies to the south. The\npeople there may help\nthee on thy quest."
		]
	},
}

const LORIK_INTRO: Array[String] = [
	"Descendant of Erdrick, listen\nnow to my words. It is told\nthat in ages past Erdrick fought\ndemons with a Ball of Light.",
	"Then came the Dragonlord who\nstole the precious globe and\nhid it in the darkness.",
	"Now, Hero, thou must help us\nrecover the Ball of Light and\nrestore peace to our land.\nThe Dragonlord must be defeated.",
	"Take now whatever thou may\nfind in these Treasure Chests\nto aid thee in thy quest.",
	"Then speak with the guards, for\nthey have much knowledge that\nmay aid thee.",
	"May the light shine upon\nthee, Hero."
]

# ── Hero stats ────────────────────────────────────────────────────────────────
const HERO_STATS := {
	"name":   "ERDRICK",
	"level":  1,
	"hp":     15,
	"hp_max": 15,
	"mp":     0,
	"mp_max": 0,
	"str":    4,
	"agl":    4,
	"atk":    4,
	"def":    2,
	"exp":    0,
	"gold":   0,
}

# ── Chest contents  "col,row" → item ─────────────────────────────────────────
const CHEST_ITEMS := {
	"7,2": { "name": "120 Gold Pieces", "type": "gold", "amount": 120, "desc": "Starting funds for weapons and armor in town." },
	"5,5": { "name": "Torch",           "id": "torch",     "type": "tool", "desc": "Lights dark dungeons early in thy quest." },
	"6,5": { "name": "Magic Key",       "id": "magic_key", "type": "key",  "desc": "Opens the door at the bottom of the room." },
}
const MAX_INVENTORY := 8

# ── Command menu ──────────────────────────────────────────────────────────────
# 2-column NES layout:  TALK/DOOR  STATUS/TAKE  STAIRS/SPELL  SEARCH/ITEM
const MENU_ITEMS := ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"]
const MENU_COLS  := 2
const MENU_ROWS  := 4

# ── Node refs ─────────────────────────────────────────────────────────────────
var _bg:            TextureRect
var _king_ws:       NPCSprite
var _guard_l_ws:    NPCSprite
var _guard_r_ws:    NPCSprite
var _hero_ws:       WalkSprite
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

# ── Background image (kept for chest/door tile patching) ─────────────────────
var _bg_image:       Image
var _floor_tile_img: Image
var _brick_tile_img: Image

# ── Item panel state ──────────────────────────────────────────────────────────
var _item_open:  bool = false
var _item_index: int  = 0

# ── Dialog state ──────────────────────────────────────────────────────────────
var _dialog_active  := false
var _dialog_pages:  Array[String] = []
var _dialog_on_done := Callable()
var _current_page   := 0
var _char_index     := 0
var _typing_timer   := 0.0
var _is_typing      := false

# ── Menu state ────────────────────────────────────────────────────────────────
var _menu_open  := false
var _menu_index := 0

# ── Status state ──────────────────────────────────────────────────────────────
var _status_open := false

# ── Choice panel state ────────────────────────────────────────────────────────
var _choice_panel:   Panel
var _choice_open:    bool     = false
var _choice_index:   int      = 0 # 0=YES, 1=NO
var _choice_on_yes:  Callable = Callable()
var _choice_on_no:   Callable = Callable()
var _choice_yes_lbl: Label
var _choice_no_lbl:  Label

# ── Inventory / gold state ────────────────────────────────────────────────────
var _inventory:     Array      = []
var _hero_gold:     int        = 0
var _opened_chests: Dictionary = {}

# ── Movement / camera ─────────────────────────────────────────────────────────
var _move_enabled  := false

# ── Debug tile overlay ─────────────────────────────────────────────────────────
var _debug_overlay: CanvasLayer
var _debug_labels:  Array = []
var _debug_active:  bool  = false
var _door_unlocked := false
var _hero_tile     := Vector2i(4, 5)
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
	set(v): _hero_facing = v


# ── Helpers ───────────────────────────────────────────────────────────────────

func _tile_center_world(col: int, row: int) -> Vector2:
	return Vector2((col + 0.5) * TILE_SIZE, (row + 0.5) * TILE_SIZE)


func _w2s(world: Vector2) -> Vector2:
	return world - _cam_world + Vector2(VW * 0.5, VH * 0.5)


func _npc_screen_pos(col: int, row: int, disp_w: int, disp_h: int) -> Vector2:
	var world_tl := Vector2(col * TILE_SIZE, row * TILE_SIZE)
	var offset   := Vector2((TILE_SIZE - disp_w) * 0.5, TILE_SIZE - disp_h)
	return _w2s(world_tl + offset)


func _hero_screen_pos() -> Vector2:
	return Vector2(VW * 0.5 - TILE_SIZE * 0.5, VH * 0.5 - TILE_SIZE * 0.5)


func _is_walkable(col_or_pos: Variant, row_arg: int = -999) -> bool:
	var col: int = 0
	var row: int = 0
	if col_or_pos is Vector2i:
		col = (col_or_pos as Vector2i).x
		row = (col_or_pos as Vector2i).y
	else:
		col = int(col_or_pos)
		row = row_arg
	if row < 0 or row >= MAP_GRID.size():      return false
	if col < 0 or col >= MAP_GRID[row].size(): return false
	var tile: int = MAP_GRID[row][col]
	if tile == 10: return _door_unlocked
	if Vector2i(col, row) in NPC_TILES: return false
	return TileWalkability.is_walkable(tile)


func _facing_tile() -> Vector2i:
	return _hero_tile + _hero_facing


func _map_tile_at(pos: Vector2i) -> int:
	if pos.y < 0 or pos.y >= MAP_GRID.size():      return -1
	if pos.x < 0 or pos.x >= MAP_GRID[pos.y].size(): return -1
	var t: int = MAP_GRID[pos.y][pos.x]
	return t


func _npc_key(pos: Vector2i) -> int:
	return pos.x * 100 + pos.y


func unlock_door() -> void:
	_door_unlocked = true
	_blit_tile_to_bg(_floor_tile_img, Vector2i(5, 8))
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.unlocked_doors["throne_room"] = true


# ── Scene construction ────────────────────────────────────────────────────────

func _ready() -> void:
	if not InputMap.has_action("cmd_menu"):
		InputMap.add_action("cmd_menu")
		var ev := InputEventKey.new()
		ev.keycode = KEY_B
		InputMap.action_add_event("cmd_menu", ev)

	# Restore state from GameState if returning from another scene
	var gs := get_node_or_null("/root/GameState")
	if gs:
		if not gs.inventory.is_empty():
			_inventory = gs.inventory.duplicate(true)
		if gs.gold > 0:
			_hero_gold = gs.gold
		_opened_chests = gs.opened_chests.duplicate(true)
		_door_unlocked = gs.unlocked_doors.get("throne_room", false)
		if gs.come_from != "":
			_hero_tile     = gs.spawn_tile
			match gs.spawn_facing:
				"up":    _hero_facing = Vector2i( 0, -1)
				"down":  _hero_facing = Vector2i( 0,  1)
				"left":  _hero_facing = Vector2i(-1,  0)
				"right": _hero_facing = Vector2i( 1,  0)

	_cam_world = _tile_center_world(_hero_tile.x, _hero_tile.y)
	_cam_from  = _cam_world
	_cam_to    = _cam_world
	_build_background()
	# Restore visual state for opened chests and unlocked doors
	# (must run after _build_background so _floor_tile_img is ready)
	if _floor_tile_img:
		for coord: String in _opened_chests:
			var key_coord := coord
			if key_coord.begins_with("throne_room:"):
				key_coord = key_coord.trim_prefix("throne_room:")
			elif ":" in key_coord:
				continue
			var parts := key_coord.split(",")
			if parts.size() == 2:
				_blit_tile_to_bg(_floor_tile_img, Vector2i(int(parts[0]), int(parts[1])))
		if _door_unlocked:
			_blit_tile_to_bg(_floor_tile_img, Vector2i(5, 8))
	_build_debug_overlay()
	if gs and gs.tile_debug_enabled:
		_debug_active = true
		if _debug_overlay:
			_debug_overlay.visible = true
		_update_debug_overlay()
	_build_sprites()
	_update_scene_positions()
	_build_ui()
	_start_music()
	# Skip intro cutscene when returning from another scene or when intro has already occurred
	if (gs and gs.king_intro_done) or (gs and gs.come_from != "") or not _inventory.is_empty():
		_move_enabled = true
	else:
		_begin_intro()


func _make_walk_sprite(sheet_path: String, f0: Rect2, f1: Rect2, scale: float) -> WalkSprite:
	var ws  := WalkSprite.new()
	var tex: Texture2D = load(sheet_path) if ResourceLoader.exists(sheet_path) else null
	if tex == null:
		var img := Image.load_from_file(ProjectSettings.globalize_path(sheet_path))
		if img:
			tex = ImageTexture.create_from_image(img)
	ws.texture     = tex
	ws.frame0_rect = f0
	ws.frame1_rect = f1
	ws.pixel_scale = scale
	return ws


func _build_sprites() -> void:
	var hero_sheet := "res://assets/sprites/rgba/characters-3.png"

	_king_ws = NPCSprite.new()
	_king_ws.character_id = "king"
	_king_ws.facing       = "down"
	_king_ws.pixel_scale  = 2.0
	_king_ws.name         = "KingLorik"
	add_child(_king_ws)

	_guard_l_ws = NPCSprite.new()
	_guard_l_ws.character_id = "guard"
	_guard_l_ws.facing       = "right"
	_guard_l_ws.pixel_scale  = 2.0
	_guard_l_ws.name         = "GuardLeft"
	add_child(_guard_l_ws)

	_guard_r_ws = NPCSprite.new()
	_guard_r_ws.character_id = "guard"
	_guard_r_ws.facing       = "left"
	_guard_r_ws.pixel_scale  = 2.0
	_guard_r_ws.name         = "GuardRight"
	add_child(_guard_r_ws)

	var hero_f0 := FR_UP[0]
	var hero_f1 := FR_UP[1]
	match _hero_facing:
		Vector2i( 0,  1): hero_f0 = FR_DOWN[0];  hero_f1 = FR_DOWN[1]
		Vector2i(-1,  0): hero_f0 = FR_LEFT[0];  hero_f1 = FR_LEFT[1]
		Vector2i( 1,  0): hero_f0 = FR_RIGHT[0]; hero_f1 = FR_RIGHT[1]
	_hero_ws = _make_walk_sprite(hero_sheet, hero_f0, hero_f1, 2.0)
	_hero_ws.is_hero = true
	_hero_ws.name = "Hero"
	add_child(_hero_ws)


func _update_scene_positions() -> void:
	_bg.position         = _w2s(Vector2.ZERO)
	_king_ws.position    = _npc_screen_pos(4, 4, 32, 32)
	_guard_l_ws.position = _npc_screen_pos(4, 7, 32, 32)
	_guard_r_ws.position = _npc_screen_pos(6, 7, 32, 32)
	_hero_ws.position    = _hero_screen_pos()
	if _gwaelin_ws:
		_gwaelin_ws.position = _gwaelin_screen_pos()
	_update_debug_overlay()


func _build_background() -> void:
	_bg = TextureRect.new()
	_bg.name = "Background"
	var img := Image.load_from_file(
		ProjectSettings.globalize_path("res://assets/renders/throne_room_bg.png"))
	if img:
		_bg_image = img
		_bg.texture = ImageTexture.create_from_image(_bg_image)
		# Cache floor and brick tiles for runtime chest/door patching
		var src := Image.load_from_file(
			ProjectSettings.globalize_path("res://assets/maps/tantegel-castle-2f.png"))
		if src:
			var floor_px := src.get_region(Rect2i(2*16, 2*16, 16, 16))
			_floor_tile_img = floor_px.duplicate()
			_floor_tile_img.resize(TILE_SIZE, TILE_SIZE, Image.INTERPOLATE_NEAREST)
			var brick_px := src.get_region(Rect2i(1*16, 1*16, 16, 16))
			_brick_tile_img = brick_px.duplicate()
			_brick_tile_img.resize(TILE_SIZE, TILE_SIZE, Image.INTERPOLATE_NEAREST)
	_bg.stretch_mode = TextureRect.STRETCH_KEEP
	_bg.size = Vector2(MAP_W * TILE_SIZE, MAP_H * TILE_SIZE)
	add_child(_bg)


func _make_box_style(bg: Color, border: Color, radius: int = 4) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color    = bg
	s.border_color = border
	for side in [SIDE_LEFT, SIDE_RIGHT, SIDE_TOP, SIDE_BOTTOM]:
		s.set_border_width(side, 3)
	s.corner_radius_top_left     = radius
	s.corner_radius_top_right    = radius
	s.corner_radius_bottom_left  = radius
	s.corner_radius_bottom_right = radius
	return s


func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "UI"
	canvas.layer = 10
	add_child(canvas)
	_build_dialog_ui(canvas)
	_build_menu_ui(canvas)
	_build_status_ui(canvas)
	_build_item_ui(canvas)
	_build_choice_ui(canvas)


func _build_dialog_ui(canvas: CanvasLayer) -> void:
	_dialog_panel = Panel.new()
	_dialog_panel.name     = "DialogBox"
	_dialog_panel.position = Vector2(DIALOG_MARGIN, VH - DIALOG_H - DIALOG_MARGIN)
	_dialog_panel.size     = Vector2(VW - DIALOG_MARGIN * 2, DIALOG_H)
	_dialog_panel.visible  = false
	_dialog_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.0, 0.0, 0.28, 0.95), Color(1.0, 0.85, 0.1)))
	_dialog_panel.clip_contents = true
	canvas.add_child(_dialog_panel)

	_speaker_label = Label.new()
	_speaker_label.position = Vector2(12, 6)
	_speaker_label.size     = Vector2(300, 22)
	_speaker_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.1))
	_speaker_label.add_theme_font_size_override("font_size", 15)
	_dialog_panel.add_child(_speaker_label)

	var divider := ColorRect.new()
	divider.position = Vector2(8, 28)
	divider.size     = Vector2(VW - DIALOG_MARGIN * 2 - 16, 2)
	divider.color    = Color(1.0, 0.85, 0.1, 0.6)
	_dialog_panel.add_child(divider)

	_dialog_label = Label.new()
	_dialog_label.position      = Vector2(12, 34)
	_dialog_label.size          = Vector2(VW - DIALOG_MARGIN * 2 - 24, DIALOG_H - 50)
	_dialog_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_label.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
	_dialog_label.add_theme_font_size_override("font_size", 14)
	_dialog_panel.add_child(_dialog_label)

	_prompt_label = Label.new()
	_prompt_label.text     = "▼"
	_prompt_label.position = Vector2(VW - DIALOG_MARGIN * 2 - 32, DIALOG_H - 28)
	_prompt_label.add_theme_color_override("font_color", Color(1.0, 1.0, 0.3))
	_prompt_label.add_theme_font_size_override("font_size", 18)
	_prompt_label.visible = false
	_dialog_panel.add_child(_prompt_label)


func _build_menu_ui(canvas: CanvasLayer) -> void:
	const ITEM_W  := 90
	const ITEM_H  := 24
	const PAD     := 10
	const PANEL_W := ITEM_W * MENU_COLS + PAD * 3
	const PANEL_H := ITEM_H * MENU_ROWS + PAD * 2 + 22

	_menu_panel = Panel.new()
	_menu_panel.name     = "CommandMenu"
	_menu_panel.size     = Vector2(PANEL_W, PANEL_H)
	_menu_panel.position = Vector2(VW - PANEL_W - DIALOG_MARGIN, DIALOG_MARGIN)
	_menu_panel.visible  = false
	_menu_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.0, 0.0, 0.28, 0.97), Color(1.0, 0.85, 0.1)))
	canvas.add_child(_menu_panel)

	var title := Label.new()
	title.text     = "COMMAND"
	title.position = Vector2(PAD, 5)
	title.add_theme_color_override("font_color", Color(1.0, 0.85, 0.1))
	title.add_theme_font_size_override("font_size", 13)
	_menu_panel.add_child(title)

	var title_div := ColorRect.new()
	title_div.position = Vector2(PAD, 22)
	title_div.size     = Vector2(PANEL_W - PAD * 2, 2)
	title_div.color    = Color(1.0, 0.85, 0.1, 0.5)
	_menu_panel.add_child(title_div)

	_menu_labels = []
	for i in range(MENU_ITEMS.size()):
		var col := i % MENU_COLS
		var row := i / MENU_COLS
		var lbl := Label.new()
		lbl.text     = MENU_ITEMS[i]
		lbl.position = Vector2(PAD + col * (ITEM_W + PAD), 28 + row * ITEM_H)
		lbl.size     = Vector2(ITEM_W, ITEM_H)
		lbl.add_theme_font_size_override("font_size", 14)
		_menu_panel.add_child(lbl)
		_menu_labels.append(lbl)

	_update_menu_cursor()


func _build_status_ui(canvas: CanvasLayer) -> void:
	const SW := 280
	const SH := 220
	_status_panel = Panel.new()
	_status_panel.name     = "StatusPanel"
	_status_panel.size     = Vector2(SW, SH)
	_status_panel.position = Vector2((VW - SW) / 2.0, (VH - SH) / 2.0)
	_status_panel.visible  = false
	_status_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.0, 0.0, 0.28, 0.97), Color(1.0, 0.85, 0.1)))
	canvas.add_child(_status_panel)


func _build_item_ui(canvas: CanvasLayer) -> void:
	_item_panel = Panel.new()
	_item_panel.name     = "ItemPanel"
	_item_panel.size     = Vector2(280, 220)
	_item_panel.position = Vector2((VW - 280) / 2.0, (VH - 220) / 2.0)
	_item_panel.visible  = false
	_item_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.0, 0.0, 0.28, 0.97), Color(1.0, 0.85, 0.1)))
	canvas.add_child(_item_panel)
	_item_labels = []


func _refresh_item_panel() -> void:
	for child in _item_panel.get_children():
		_item_panel.remove_child(child)
		child.queue_free()
	_item_labels = []

	var title := Label.new()
	title.text = "ITEMS"
	title.position = Vector2(16, 10)
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color(1.0, 0.85, 0.1))
	_item_panel.add_child(title)

	if _inventory.is_empty():
		var empty := Label.new()
		empty.text = "Nothing."
		empty.position = Vector2(16, 36)
		empty.add_theme_font_size_override("font_size", 13)
		empty.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
		_item_panel.add_child(empty)
	else:
		for i in _inventory.size():
			var lbl := Label.new()
			lbl.text = _inventory[i]["name"]
			lbl.position = Vector2(28, 36 + i * 20)
			lbl.add_theme_font_size_override("font_size", 13)
			_item_panel.add_child(lbl)
			_item_labels.append(lbl)

	var desc := Label.new()
	desc.name = "ItemDesc"
	desc.position = Vector2(16, 180)
	desc.size = Vector2(248, 36)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_font_size_override("font_size", 12)
	desc.add_theme_color_override("font_color", Color(0.7, 0.9, 1.0))
	_item_panel.add_child(desc)


func _refresh_item_cursor() -> void:
	for i in _item_labels.size():
		var color := Color(1.0, 0.85, 0.1) if i == _item_index else Color.WHITE
		_item_labels[i].add_theme_color_override("font_color", color)
	var desc_node := _item_panel.get_node_or_null("ItemDesc") as Label
	if desc_node and _item_index < _inventory.size():
		desc_node.text = _inventory[_item_index].get("desc", "")


func _build_choice_ui(canvas: CanvasLayer) -> void:
	const CW := 130
	const CH := 72
	_choice_panel = Panel.new()
	_choice_panel.name = "ChoiceBox"
	_choice_panel.size = Vector2(CW, CH)
	_choice_panel.position = Vector2(VW - CW - DIALOG_MARGIN - 20, VH - DIALOG_H - DIALOG_MARGIN - CH - 10)
	_choice_panel.visible = false
	_choice_panel.add_theme_stylebox_override("panel",
		_make_box_style(Color(0.0, 0.0, 0.28, 0.97), Color(1.0, 0.85, 0.1)))
	canvas.add_child(_choice_panel)

	_choice_yes_lbl = Label.new()
	_choice_yes_lbl.position = Vector2(14, 10)
	_choice_yes_lbl.add_theme_font_size_override("font_size", 14)
	_choice_panel.add_child(_choice_yes_lbl)

	_choice_no_lbl = Label.new()
	_choice_no_lbl.position = Vector2(14, 38)
	_choice_no_lbl.add_theme_font_size_override("font_size", 14)
	_choice_panel.add_child(_choice_no_lbl)


func _open_choice(on_yes: Callable, on_no: Callable) -> void:
	_choice_on_yes = on_yes
	_choice_on_no  = on_no
	_choice_index  = 0
	_choice_open   = true
	if _choice_panel:
		_choice_panel.visible = true
	_update_choice_cursor()


func _update_choice_cursor() -> void:
	if _choice_index == 0:
		_choice_yes_lbl.text = "► YES"
		_choice_yes_lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 0.0))
		_choice_no_lbl.text  = "  NO"
		_choice_no_lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
	else:
		_choice_yes_lbl.text = "  YES"
		_choice_yes_lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
		_choice_no_lbl.text  = "► NO"
		_choice_no_lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 0.0))


func _close_choice() -> void:
	_choice_open = false
	_choice_panel.visible = false


# ── Dialog system ─────────────────────────────────────────────────────────────

func _show_dialog(speaker: String, pages: Array, on_done: Callable = Callable()) -> void:
	var pages_str: Array[String] = []
	for p in pages:
		pages_str.append(str(p))
	_dialog_pages   = pages_str
	_dialog_on_done = on_done
	_speaker_label.text   = speaker
	_dialog_active        = true
	_current_page         = 0
	_dialog_panel.visible = true
	_menu_panel.visible   = false
	_menu_open = false
	_type_page()


func _type_page() -> void:
	_dialog_label.text    = ""
	_prompt_label.visible = false
	_char_index   = 0
	_typing_timer = 0.0
	_is_typing    = true


func _finish_typing() -> void:
	_is_typing            = false
	_dialog_label.text    = _dialog_pages[_current_page]
	_char_index           = _dialog_pages[_current_page].length()
	_prompt_label.visible = true


func _advance_dialog() -> void:
	if _is_typing:
		_finish_typing()
		return
	_current_page += 1
	if _current_page < _dialog_pages.size():
		_type_page()
	else:
		_dialog_active        = false
		_dialog_panel.visible = false
		if _dialog_on_done.is_valid():
			_dialog_on_done.call()


func _begin_intro() -> void:
	_show_dialog("King Lorik", LORIK_INTRO, func():
		_move_enabled = true
		var gs := get_node_or_null("/root/GameState")
		if gs:
			gs.king_intro_done = true
	)


# ── Command menu ──────────────────────────────────────────────────────────────

func _open_menu() -> void:
	_menu_index         = 0
	_menu_panel.visible = true
	_menu_open          = true
	_update_menu_cursor()


func _close_menu() -> void:
	_menu_panel.visible = false
	_menu_open          = false


func _update_menu_cursor() -> void:
	for i in range(_menu_labels.size()):
		var lbl: Label = _menu_labels[i]
		if i == _menu_index:
			lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 0.0))
			lbl.text = "► " + MENU_ITEMS[i]
		else:
			lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
			lbl.text = "  " + MENU_ITEMS[i]


func _navigate_menu(dir: Vector2i) -> void:
	if dir.x != 0:
		_menu_index = _menu_index ^ 1
	elif dir.y == -1:
		_menu_index = (_menu_index - MENU_COLS + MENU_ITEMS.size()) % MENU_ITEMS.size()
	elif dir.y == 1:
		_menu_index = (_menu_index + MENU_COLS) % MENU_ITEMS.size()
	_update_menu_cursor()


func _execute_command() -> void:
	var cmd: String = MENU_ITEMS[_menu_index]
	_close_menu()
	match cmd:
		"TALK":   _cmd_talk()
		"STATUS": _cmd_status()
		"STAIRS": _cmd_stairs()
		"SEARCH": _cmd_search()
		"DOOR":   _cmd_door()
		"TAKE":   _cmd_take()
		"SPELL":  _cmd_spell()
		"ITEM":   _cmd_item()


# ── Command implementations ───────────────────────────────────────────────────

func _count_pack_tools() -> int:
	var n := 0
	for it in _inventory:
		if it is Dictionary and str(it.get("type", "tool")) in ["weapon", "armor", "shield", "quest"]:
			continue
		n += 1
	return n


func _cmd_talk() -> void:
	var ft  := _facing_tile()
	var key := _npc_key(ft)
	if key == 404:
		_cmd_talk_king()
	elif NPC_DIALOGS.has(key):
		var data: Dictionary = NPC_DIALOGS[key]
		var gs := get_node_or_null("/root/GameState")
		if gs and "dragonlord_defeated" in gs and gs.dragonlord_defeated:
			_show_dialog(data["speaker"], ["Hurrah! Hurrah!\nLong live %s!\nThe Dragonlord is no more." % _hero_name()])
		else:
			_show_dialog(data["speaker"], data["pages"])
	else:
		_show_dialog("", ["There is no one there."])


func _hero_name() -> String:
	var gs := get_node_or_null("/root/GameState")
	if gs:
		return str(gs.hero_stats.get("name", "Erdrick"))
	return "Erdrick"


func _cmd_talk_king() -> void:
	var gs := get_node_or_null("/root/GameState")
	if gs and "dragonlord_defeated" in gs and gs.dragonlord_defeated:
		gs.king_intro_done = true
		gs.inventory = _inventory.duplicate(true)
		gs.gold = _hero_gold
		gs.opened_chests = _opened_chests.duplicate(true)
		_begin_ending(gs)
		return
	if gs:
		gs.king_intro_done = true
		gs.inventory = _inventory.duplicate(true)
		gs.gold = _hero_gold
		gs.opened_chests = _opened_chests.duplicate(true)

	var exp_needed := 7
	if gs:
		exp_needed = gs.get_exp_to_next_level()

	var exp_msg := ""
	if exp_needed > 0:
		exp_msg = "Before reaching thy next level\nof experience thou must gain\n" + str(exp_needed) + " points."
	else:
		exp_msg = "Thou hast attained the highest\nlevel of experience!"

	var pages: Array = ["I am greatly pleased that thou\nhast returned, Hero."]
	if gs and "gwaelin_rescued" in gs and gs.gwaelin_rescued and not gs.gwaelin_returned:
		gs.gwaelin_returned = true
		pages.append("Thou hast rescued my\ndaughter Gwaelin!\nI am forever grateful.")
		pages.append("Gwaelin: Take this\nGwaelin's Love as a\ntoken of my affection.")
		if _inventory.size() < MAX_INVENTORY:
			_inventory.append({"name": "Gwaelin's Love", "id": "gwaelins_love", "type": "quest", "desc": "A token from Princess Gwaelin. Reveals the way to Charlock."})
			gs.inventory = _inventory.duplicate(true)
	pages.append(exp_msg)
	_show_dialog("King Lorik", pages, func():
		_ask_king_save()
	)


func _ask_king_save() -> void:
	_show_dialog("King Lorik", [
		"Will thou tell me now of thy\ndeeds so they won't be forgotten?"
	])
	call_deferred("_open_choice",
		func():
			_close_choice()
			_show_dialog("King Lorik", [
				"Thy deeds have been recorded\non the Imperial Scrolls of Honor."
			], func():
				var gs := get_node_or_null("/root/GameState")
				if gs:
					gs.save_to_disk("adventure_log.json")
				_ask_king_continue()
			),
		func():
			_close_choice()
			_ask_king_continue()
	)


func _ask_king_continue() -> void:
	_show_dialog("King Lorik", [
		"Dost thou wish to continue\nthy quest?"
	])
	call_deferred("_open_choice",
		func():
			_close_choice()
			_show_dialog("King Lorik", [
				"Goodbye now, Hero. Take care\nand tempt not the Fates."
			], func():
				_move_enabled = true
			),
		func():
			_close_choice()
			_show_dialog("King Lorik", [
				"Rest then for awhile."
			], func():
				get_tree().change_scene_to_file("res://scenes/TitleScreen.tscn")
			)
	)


# ── Ending (NES epilogue) ────────────────────────────────────────────────────
# King Lorik offers the throne, the hero declines, Princess Gwaelin (if she was
# brought home) insists on coming along, and the pair walk out of the throne
# room. `game_completed` is only set once the Ending scene's credits finish so
# the whole sequence is captured by the playthrough recorder.

var _ending_active := false
var _gwaelin_ws: NPCSprite = null
var _gwaelin_tile := Vector2i(-1, -1)
var _gwaelin_from := Vector2.ZERO
var _gwaelin_to   := Vector2.ZERO
var _gwaelin_t    := 1.0

func _begin_ending(gs: Node) -> void:
	_ending_active = true
	_move_enabled  = false
	var hero := _hero_name()
	_show_dialog("King Lorik", [
		"Thou hast done well in\ndefeating the Dragonlord,\n%s." % hero,
		"The Ball of Light shines\nonce more upon Alefgard,\nand peace has returned\nto our land.",
		"Come, %s, I shall\ngive up my throne to thee." % hero,
	], func():
		_show_dialog("", [
			"%s replies:\n'If there is a country\nwhere I can rule, I shall\nfind it myself.'" % hero,
		], func():
			if "gwaelin_returned" in gs and gs.gwaelin_returned:
				_gwaelin_steps_forward()
			else:
				_show_dialog("King Lorik", [
					"Then go, %s, with\nmy blessing. May thy\njourney be a glorious one." % hero,
				], Callable(self, "_ending_walk_out"))
		)
	)


func _gwaelin_steps_forward() -> void:
	_gwaelin_ws = NPCSprite.new()
	_gwaelin_ws.character_id = "princess"
	_gwaelin_ws.facing       = "left"
	_gwaelin_ws.pixel_scale  = 2.0
	_gwaelin_ws.name         = "Gwaelin"
	add_child(_gwaelin_ws)
	# She steps down from beside the throne to the hero's side.
	_gwaelin_tile = Vector2i(5, 5)
	_gwaelin_from = Vector2(5 * TILE_SIZE, 4 * TILE_SIZE)
	_gwaelin_to   = Vector2(5 * TILE_SIZE, 5 * TILE_SIZE)
	_gwaelin_t    = 0.0
	_update_scene_positions()
	var tw := create_tween()
	tw.tween_method(func(v: float):
		_gwaelin_t = v
		_update_scene_positions(), 0.0, 1.0, MOVE_DURATION * 2.0)
	await tw.finished
	_gwaelin_ws.set_facing("left")
	_ask_gwaelin()


func _ask_gwaelin() -> void:
	_show_dialog("Princess Gwaelin", [
		"Wait a minute, please.\nI wish to accompany thee\non thy journey. May I?",
	])
	call_deferred("_open_choice",
		func():
			_close_choice()
			_show_dialog("Princess Gwaelin", [
				"I am so happy.\nTogether we shall travel\nthe wide world to build up\na great power and spirit.",
			], Callable(self, "_ending_walk_out")),
		func():
			_close_choice()
			_show_dialog("Princess Gwaelin", ["But thou must!"], Callable(self, "_ask_gwaelin"))
	)


func _ending_walk_out() -> void:
	_play_sfx("res://assets/music/mp3/heroes_fanfare.mp3")
	await get_tree().create_timer(0.6).timeout
	# Hero stands at (4,5), (3,4) or (5,4) when talking to the king: line up on
	# column 4 first, then down through the door and along the bottom hall.
	var path: Array = []
	var t := _hero_tile
	while t.y < 6:
		t.y += 1
		path.append(t)
	while t.x != 4:
		t.x += 1 if t.x < 4 else -1
		path.append(t)
	for step in [Vector2i(5, 6), Vector2i(5, 7), Vector2i(5, 8), Vector2i(5, 9),
			Vector2i(6, 9), Vector2i(7, 9), Vector2i(8, 9), Vector2i(9, 9)]:
		path.append(step)
	for dest in path:
		await _scripted_step(dest)
	await get_tree().create_timer(0.3).timeout
	_play_sfx("res://assets/music/mp3/stairs_down.mp3")
	var layer := CanvasLayer.new()
	layer.layer = 15
	add_child(layer)
	var rect := ColorRect.new()
	rect.color = Color(0, 0, 0, 0)
	rect.size = Vector2(VW, VH)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(rect)
	var tw := create_tween()
	tw.tween_property(rect, "color", Color.BLACK, 1.0)
	await tw.finished
	get_tree().change_scene_to_file.call_deferred("res://scenes/Ending.tscn")


func _scripted_step(dest: Vector2i) -> void:
	var dir := dest - _hero_tile
	var prev := _hero_tile
	_set_hero_facing(dir)
	_hero_tile = dest
	_cam_from  = _cam_world
	_cam_to    = _tile_center_world(dest.x, dest.y)
	if _gwaelin_ws:
		var gdir := prev - _gwaelin_tile
		_gwaelin_ws.set_facing(_facing_name(gdir))
		_gwaelin_from = Vector2(_gwaelin_tile.x * TILE_SIZE, _gwaelin_tile.y * TILE_SIZE)
		_gwaelin_to   = Vector2(prev.x * TILE_SIZE, prev.y * TILE_SIZE)
		_gwaelin_tile = prev
	var t := 0.0
	var dur := MOVE_DURATION * 2.0
	while t < 1.0:
		await get_tree().process_frame
		t = minf(t + get_process_delta_time() / dur, 1.0)
		_cam_world = _cam_from.lerp(_cam_to, t)
		_gwaelin_t = t
		_update_scene_positions()
	if _hero_ws:
		_hero_ws.step()


func _set_hero_facing(dir: Vector2i) -> void:
	if dir == Vector2i.ZERO or dir == _hero_facing:
		return
	_hero_facing = dir
	var f0 := FR_DOWN[0]
	var f1 := FR_DOWN[1]
	match dir:
		Vector2i( 0, -1): f0 = FR_UP[0];    f1 = FR_UP[1]
		Vector2i(-1,  0): f0 = FR_LEFT[0];  f1 = FR_LEFT[1]
		Vector2i( 1,  0): f0 = FR_RIGHT[0]; f1 = FR_RIGHT[1]
	if _hero_ws:
		_hero_ws.set_frames(f0, f1)


func _facing_name(dir: Vector2i) -> String:
	if dir == Vector2i(0, -1): return "up"
	if dir == Vector2i(-1, 0): return "left"
	if dir == Vector2i(1, 0):  return "right"
	return "down"


func _gwaelin_screen_pos() -> Vector2:
	var tl := _gwaelin_from.lerp(_gwaelin_to, _gwaelin_t)
	return _w2s(tl + Vector2((TILE_SIZE - 32) * 0.5, TILE_SIZE - 32))


func _cmd_status() -> void:
	for child in _status_panel.get_children():
		_status_panel.remove_child(child)
		child.free()

	var s := HERO_STATS
	var lines: Array[String] = [
		"NAME:   " + s["name"],
		"LEVEL:  " + str(s["level"]),
		"",
		"HP:     " + str(s["hp"]) + " / " + str(s["hp_max"]),
		"MP:     " + str(s["mp"]) + " / " + str(s["mp_max"]),
		"",
		"STR:    " + str(s["str"]) + "    AGL:  " + str(s["agl"]),
		"ATK:    " + str(s["atk"]) + "    DEF:  " + str(s["def"]),
		"",
		"EXP:    " + str(s["exp"]),
		"GOLD:   " + str(s["gold"]) + "G",
	]

	var title := Label.new()
	title.text     = "── STATUS ──"
	title.position = Vector2(10, 8)
	title.add_theme_color_override("font_color", Color(1.0, 0.85, 0.1))
	title.add_theme_font_size_override("font_size", 14)
	_status_panel.add_child(title)

	for i in range(lines.size()):
		var lbl := Label.new()
		lbl.text     = lines[i]
		lbl.position = Vector2(14, 30 + i * 17)
		lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
		lbl.add_theme_font_size_override("font_size", 13)
		_status_panel.add_child(lbl)

	var hint := Label.new()
	hint.text     = "[ Press B or Esc to close ]"
	hint.position = Vector2(10, 195)
	hint.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	hint.add_theme_font_size_override("font_size", 11)
	_status_panel.add_child(hint)

	_status_open          = true
	_status_panel.visible = true


func _cmd_stairs() -> void:
	if _map_tile_at(_hero_tile) == 33:
		_play_sfx("res://assets/music/mp3/stairs_down.mp3")
		_show_dialog("", ["Thou descended the stairs."],
			func():
				_save_state(Vector2i(8, 8), "throne_room")
				get_tree().change_scene_to_file.call_deferred("res://scenes/Castle1F.tscn")
		)
	else:
		_show_dialog("", ["There are no stairs here."])


func _play_sfx(path: String) -> void:
	if not _sfx or not is_inside_tree():
		return
	var stream := load(path) as AudioStream
	if stream:
		_sfx.stream = stream
		_sfx.play()


func _save_state(spawn: Vector2i, from_scene: String, facing: String = "right") -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	gs.inventory     = _inventory.duplicate(true)
	gs.gold          = _hero_gold
	gs.opened_chests = _opened_chests.duplicate(true)
	gs.spawn_tile    = spawn
	gs.come_from     = from_scene
	gs.spawn_facing  = facing


func _cmd_search() -> void:
	if _map_tile_at(_hero_tile) == 30:
		var coord := str(_hero_tile.x) + "," + str(_hero_tile.y)
		var map_key := "throne_room:" + coord
		if _opened_chests.has(map_key):
			_show_dialog("", ["The chest is\nalready empty."])
			return
		_opened_chests[map_key] = true
		_opened_chests["tantegel-castle-2f:" + coord] = true
		_blit_tile_to_bg(_floor_tile_img, _hero_tile)
		_play_sfx("res://assets/music/mp3/open_treasure.mp3")
		var gs := get_node_or_null("/root/GameState")
		if gs:
			gs.opened_chests[map_key] = true
			gs.opened_chests["tantegel-castle-2f:" + coord] = true
		if CHEST_ITEMS.has(coord):
			var item: Dictionary = CHEST_ITEMS[coord]
			if item["type"] == "gold":
				_hero_gold += int(item.get("amount", 0))
				if gs: gs.gold = _hero_gold
				if PlayerState: PlayerState.gold = _hero_gold
				_show_dialog("", ["Thou dost find a Treasure\nChest beneath thy feet!\nInside is " + item["name"] + "!"])
			else:
				var inv_item := item.duplicate()
				_inventory.append(inv_item)
				if gs: gs.inventory = _inventory.duplicate(true)
				if PlayerState: PlayerState.inventory.append(inv_item)
				_show_dialog("", ["Thou dost find a Treasure\nChest beneath thy feet!\nInside is a " + item["name"] + "!"])
		else:
			_show_dialog("", ["Thou dost find a Treasure\nChest beneath thy feet!\nBut it is empty."])
	else:
		_show_dialog("", ["Thou dost not find\nanything of interest."])


func _cmd_door() -> void:
	var ft := _facing_tile()
	var tile: int = _map_tile_at(ft)
	if tile == 10:
		if _door_unlocked:
			_show_dialog("", ["The door is already open."])
		else:
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
				_use_item(key_idx)
			else:
				_show_dialog("", ["The door is locked.\nThou dost need a\nMagic Key to open it."])
	else:
		_show_dialog("", ["There is no door\nin that direction."])


func _cmd_take() -> void:
	if _map_tile_at(_hero_tile) != 30:
		_show_dialog("", ["There is nothing\nto take here."])
		return
	var coord := str(_hero_tile.x) + "," + str(_hero_tile.y)
	var map_key := "throne_room:" + coord
	if _opened_chests.has(map_key):
		_show_dialog("", ["The chest is\nalready empty."])
		return
	_opened_chests[map_key] = true
	_opened_chests["tantegel-castle-2f:" + coord] = true
	_blit_tile_to_bg(_floor_tile_img, _hero_tile)
	_play_sfx("res://assets/music/mp3/open_treasure.mp3")
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.opened_chests[map_key] = true
		gs.opened_chests["tantegel-castle-2f:" + coord] = true
	if CHEST_ITEMS.has(coord):
		var item: Dictionary = CHEST_ITEMS[coord]
		if item["type"] == "gold":
			_hero_gold += int(item.get("amount", 0))
			if gs: gs.gold = _hero_gold
			if PlayerState: PlayerState.gold = _hero_gold
			_show_dialog("", ["Thou dost find\n" + item["name"] + "!"])
		else:
			if _count_pack_tools() < MAX_INVENTORY:
				var inv_item := item.duplicate()
				_inventory.append(inv_item)
				if gs: gs.inventory = _inventory.duplicate(true)
				if PlayerState: PlayerState.inventory.append(inv_item)
				_show_dialog("", ["Thou dost find\n" + item["name"] + "!"])
			else:
				_show_dialog("", ["Thy pack is full!\nThou canst carry\nno more items."])
	else:
		_show_dialog("", ["The chest is empty."])


func _cmd_spell() -> void:
	_show_dialog("", ["Thou hast not yet\nlearned any magic spells."])


func _cmd_item() -> void:
	_refresh_item_panel()
	_item_index = 0
	_item_open  = true
	_item_panel.visible = true
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
			if _item_panel:
				_item_panel.visible = false
			_item_open = false
			_play_sfx("res://assets/music/mp3/open_door.mp3")
			print("[ThroneRoom] Unlocking door at facing tile: ", ft)
			unlock_door()
			_show_dialog("", ["The door clicks open."])
		else:
			_show_dialog("", ["There is no door\nin that direction."])
	else:
		var desc_str = item.get("desc", "Thou usest the " + item_name + ".") if item is Dictionary else "Thou usest the " + item_name + "."
		_show_dialog("", [desc_str])


func _blit_tile_to_bg(tile_img: Image, pos: Vector2i) -> void:
	if not (_bg_image and tile_img):
		return
	var tile := tile_img.duplicate()
	if tile.get_format() != _bg_image.get_format():
		tile.convert(_bg_image.get_format())
	_bg_image.blit_rect(tile,
		Rect2i(0, 0, TILE_SIZE, TILE_SIZE),
		Vector2i(pos.x * TILE_SIZE, pos.y * TILE_SIZE))
	_bg.texture = ImageTexture.create_from_image(_bg_image)


# ── Movement ──────────────────────────────────────────────────────────────────

func move_hero(dir: Vector2i) -> void:
	print("[ThroneRoom] move_hero called dir=", dir, " _move_enabled=", _move_enabled, " _hero_moving=", _hero_moving, " _dialog_active=", _dialog_active)
	if not _move_enabled or _hero_moving:
		return
	var frames0 := FR_DOWN[0]
	var frames1 := FR_DOWN[1]
	match dir:
		Vector2i( 0, -1): frames0 = FR_UP[0];    frames1 = FR_UP[1]
		Vector2i( 0,  1): frames0 = FR_DOWN[0];  frames1 = FR_DOWN[1]
		Vector2i(-1,  0): frames0 = FR_LEFT[0];  frames1 = FR_LEFT[1]
		Vector2i( 1,  0): frames0 = FR_RIGHT[0]; frames1 = FR_RIGHT[1]

	if dir != _hero_facing:
		_hero_facing = dir
		if _hero_ws: _hero_ws.set_frames(frames0, frames1)

	var target := _hero_tile + dir
	var walkable := _is_walkable(target.x, target.y)
	print("[ThroneRoom] target=", target, " walkable=", walkable)
	if walkable:
		_hero_tile   = target
		var ps = get_node_or_null("/root/PlayerState")
		if ps: ps.tile_position = target
		_hero_moving = true
		_cam_from    = _cam_world
		_cam_to      = _tile_center_world(target.x, target.y)
		_move_t      = 0.0
		if _hero_ws: _hero_ws.step()


func _handle_move_input() -> void:
	if Input.is_action_pressed("ui_up") or Input.is_action_pressed("move_up"):
		move_hero(Vector2i(0, -1))
	elif Input.is_action_pressed("ui_down") or Input.is_action_pressed("move_down"):
		move_hero(Vector2i(0, 1))
	elif Input.is_action_pressed("ui_left") or Input.is_action_pressed("move_left"):
		move_hero(Vector2i(-1, 0))
	elif Input.is_action_pressed("ui_right") or Input.is_action_pressed("move_right"):
		move_hero(Vector2i(1, 0))


func _update_hero_movement(delta: float) -> void:
	_move_t    = minf(_move_t + delta / MOVE_DURATION, 1.0)
	_cam_world = _cam_from.lerp(_cam_to, _move_t)
	_update_scene_positions()
	if _move_t >= 1.0:
		_hero_moving = false
		_hero_ws.playing = true   # keep idle animation pulsing between steps
		if _move_enabled and not _dialog_active and not _menu_open and not _status_open and not _item_open and not _choice_open:
			_handle_move_input()


# ── Music ─────────────────────────────────────────────────────────────────────

func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	_music.name = "Music"
	add_child(_music)
	var stream: AudioStream = load("res://assets/music/mp3/tantegel_castle.mp3")
	if stream:
		if stream is AudioStreamMP3:
			stream.loop = true
		_music.stream    = stream
		_music.volume_db = -8.0
		_music.play()
	# SFX player (one-shot, no loop)
	_sfx = AudioStreamPlayer.new()
	_sfx.name = "SFX"
	add_child(_sfx)


# ── Debug tile overlay ────────────────────────────────────────────────────────

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
		lbl.add_theme_constant_override("shadow_outline_size", 1)
		lbl.visible = false
		_debug_overlay.add_child(lbl)
		_debug_labels.append(lbl)


func _update_debug_overlay() -> void:
	if not _debug_active:
		return
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


# ── Main loop ─────────────────────────────────────────────────────────────────

func _process(delta: float) -> void:
	if _is_typing:
		_typing_timer += delta
		if _typing_timer >= TYPING_SPEED:
			_typing_timer -= TYPING_SPEED
			var full: String = _dialog_pages[_current_page]
			if _char_index < full.length():
				_char_index += 1
				_dialog_label.text = full.substr(0, _char_index)
			else:
				_finish_typing()

	if not _is_typing and _prompt_label.visible:
		_prompt_label.modulate.a = 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.006)

	if _move_enabled and not _dialog_active and not _menu_open and not _status_open and not _item_open and not _choice_open:
		if _hero_moving:
			_update_hero_movement(delta)
		else:
			_handle_move_input()


func _input(event: InputEvent) -> void:
	# Ctrl+X: hold to show tile debug overlay
	if event is InputEventKey and event.keycode == KEY_X:
		if event.pressed and event.ctrl_pressed:
			_debug_active = true
			_debug_overlay.visible = true
			_update_debug_overlay()
			get_viewport().set_input_as_handled()
			return
		elif not event.pressed and _debug_active:
			_debug_active = false
			_debug_overlay.visible = false
			for lbl in _debug_labels:
				(lbl as Label).visible = false
			get_viewport().set_input_as_handled()
			return
	# Status screen absorbs all input until closed
	if _status_open:
		if event.is_action_pressed("cmd_menu") or event.is_action_pressed("ui_cancel") \
				or event.is_action_pressed("ui_accept"):
			_status_panel.visible = false
			_status_open = false
			get_viewport().set_input_as_handled()
		return

	# Item panel absorbs input until closed
	if _item_open:
		if event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_item_panel.visible = false
			_item_open = false
		elif event.is_action_pressed("ui_up") or event.is_action_pressed("move_up"):
			_item_index = maxi(_item_index - 1, 0)
			_refresh_item_cursor()
		elif event.is_action_pressed("ui_down") or event.is_action_pressed("move_down"):
			_item_index = mini(_item_index + 1, _inventory.size() - 1)
			_refresh_item_cursor()
		elif event.is_action_pressed("ui_accept"):
			_use_item(_item_index)
		get_viewport().set_input_as_handled()
		return

	# Choice prompt input
	if _choice_open:
		get_viewport().set_input_as_handled()
		if event.is_action_pressed("ui_up") or event.is_action_pressed("move_up") \
				or event.is_action_pressed("ui_down") or event.is_action_pressed("move_down"):
			_choice_index = 1 - _choice_index
			_update_choice_cursor()
		elif event.is_action_pressed("ui_accept"):
			var cb_yes := _choice_on_yes
			var cb_no := _choice_on_no
			var idx := _choice_index
			_close_choice()
			if idx == 0:
				if cb_yes.is_valid():
					cb_yes.call()
			else:
				if cb_no.is_valid():
					cb_no.call()
		elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			var cb_no := _choice_on_no
			_close_choice()
			if cb_no.is_valid():
				cb_no.call()
		return

	# Dialog absorbs accept/cancel
	if _dialog_active:
		if event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel"):
			get_viewport().set_input_as_handled()
			_advance_dialog()
		return

	# Command menu navigation
	if _menu_open:
		if event.is_action_pressed("cmd_menu") or event.is_action_pressed("ui_cancel"):
			_close_menu()
		elif event.is_action_pressed("ui_accept"):
			_execute_command()
		elif event.is_action_pressed("ui_up") or event.is_action_pressed("move_up"):
			_navigate_menu(Vector2i(0,-1))
		elif event.is_action_pressed("ui_down") or event.is_action_pressed("move_down"):
			_navigate_menu(Vector2i(0, 1))
		elif event.is_action_pressed("ui_left") or event.is_action_pressed("move_left"):
			_navigate_menu(Vector2i(-1,0))
		elif event.is_action_pressed("ui_right") or event.is_action_pressed("move_right"):
			_navigate_menu(Vector2i( 1,0))
		get_viewport().set_input_as_handled()
		return

	# Walking — B or Space/Enter opens the command menu
	if _move_enabled and not _hero_moving:
		if event.is_action_pressed("cmd_menu") or event.is_action_pressed("ui_accept"):
			_open_menu()
			get_viewport().set_input_as_handled()
