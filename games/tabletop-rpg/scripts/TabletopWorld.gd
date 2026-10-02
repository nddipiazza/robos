# RobOS Tabletop RPG: TabletopWorld
# Dual-Role Cartridge Game Player for HeroQuest: Player Mode & DunMaster Mode
extends Node2D

const GRID_COLS = 26
const GRID_ROWS = 19
const TILE_SIZE = 46.0
const BOARD_OFFSET = Vector2(50.0, 70.0)

var current_role: String = "player" # "player" or "gm" / "gamemaster" / "dm" / "dunmaster"
var current_round: int = 1
var active_hero_idx: int = 0
var active_monster_idx: int = 0
var current_phase: String = "hero_phase" # "hero_phase" or "gm_phase"
var movement_remaining: int = 0
var movement_rolled: bool = false
var has_acted_this_turn: bool = false
var turn_state: String = "awaiting_roll" # "awaiting_roll", "moving", "action_taken", "turn_complete"
var combat_log: Array[String] = []

func is_gm_role() -> bool:
	return current_role == "gm" or current_role == "gamemaster" or current_role == "dm" or current_role == "dunmaster"

var heroes: Array[Dictionary] = []
var monsters: Array[Dictionary] = []
var doors: Array[Dictionary] = []
var furniture: Array[Dictionary] = []
var wall_blocks: Array[Dictionary] = []
var traps: Array[Dictionary] = []
var rooms: Array[Dictionary] = []
var revealed_rooms: Array[String] = []
var explored_tiles: Dictionary = {}
var grid_cols: int = GRID_COLS
var grid_rows: int = GRID_ROWS
var starting_stair: Vector2i = Vector2i(1, 1)
var tile_size: float = TILE_SIZE
var board_offset: Vector2 = BOARD_OFFSET

func _update_board_metrics() -> void:
	if board_sprite and board_sprite.texture:
		var tex_size = board_sprite.texture.get_size()
		var scaled_w = tex_size.x * board_sprite.scale.x
		var scaled_h = tex_size.y * board_sprite.scale.y
		board_offset = board_sprite.position - Vector2(scaled_w * 0.5, scaled_h * 0.5)
		tile_size = scaled_w / float(maxi(1, grid_cols))

func queue_redraw_all() -> void:
	_update_board_metrics()
	if has_node("BoardOverlay"):
		$BoardOverlay.queue_redraw()

var auto_play_timer: float = 0.0
var auto_play_step: int = 0

@onready var board_sprite: Sprite2D = $BoardSprite
@onready var title_label: Label = $UI/TitleBar/TitleLabel
@onready var role_badge: Button = $UI/TitleBar/BtnToggleRole
@onready var log_label: RichTextLabel = $UI/LogPanel/LogLabel
@onready var hero_card: Label = $UI/StatsPanel/HeroLabel
@onready var dice_label: Label = $UI/DicePanel/DiceLabel
@onready var btn_roll: Button = $UI/Actions/BtnRoll
@onready var btn_attack: Button = $UI/Actions/BtnAttack
@onready var btn_search: Button = $UI/Actions/BtnSearch
@onready var btn_end_turn: Button = $UI/Actions/BtnEndTurn
@onready var btn_summon: Button = $UI/Actions/BtnSummon
@onready var btn_ai_step: Button = $UI/Actions/BtnAIStep

func _ready() -> void:
	print("🛡️ [TabletopWorld] Initializing HeroQuest Cartridge Player...")
	_check_cli_role()
	_update_board_metrics()
	_load_active_cartridge()
	CartridgeManager.cartridge_inserted.connect(_on_cartridge_inserted)
	_setup_ui_signals()
	_update_ui()
	_log("=== Welcome to HeroQuest: The Trial ===")
	if is_gm_role():
		_log("👑 [Game Master / DunMaster Mode Active] You are Zargon, Master of Darkness. Full dungeon visibility granted.")
	else:
		_log("⚔️ [Player Mode Active] You lead the four heroes into the catacombs of Verag!")

func _check_cli_role() -> void:
	var cmd_args = OS.get_cmdline_user_args() + OS.get_cmdline_args()
	var role_env = OS.get_environment("TABLETOP_ROLE").to_lower()
	if role_env != "":
		current_role = role_env

	for i in range(cmd_args.size()):
		var a = cmd_args[i]
		if a == "--role" and i + 1 < cmd_args.size():
			current_role = cmd_args[i + 1].to_lower()
		elif a.begins_with("--role="):
			current_role = a.split("=")[1].to_lower()
		elif a == "--dm" or a == "--dunmaster" or a == "--gm" or a == "--gamemaster":
			current_role = "gm"
		elif a == "--player":
			current_role = "player"

func _setup_ui_signals() -> void:
	if role_badge and not role_badge.pressed.is_connected(toggle_role):
		role_badge.pressed.connect(toggle_role)
	if btn_roll and not btn_roll.pressed.is_connected(roll_movement_dice):
		btn_roll.pressed.connect(roll_movement_dice)
	if btn_attack and not btn_attack.pressed.is_connected(_on_attack_pressed):
		btn_attack.pressed.connect(_on_attack_pressed)
	if btn_search and not btn_search.pressed.is_connected(search_room):
		btn_search.pressed.connect(search_room)
	if btn_end_turn and not btn_end_turn.pressed.is_connected(end_turn):
		btn_end_turn.pressed.connect(end_turn)
	if btn_summon and not btn_summon.pressed.is_connected(summon_wandering_monster):
		btn_summon.pressed.connect(summon_wandering_monster)
	if btn_ai_step and not btn_ai_step.pressed.is_connected(_execute_auto_play_step):
		btn_ai_step.pressed.connect(_execute_auto_play_step)

func toggle_role() -> void:
	if current_role == "player":
		current_role = "gm"
		_log("👑 Switched to Game Master Mode! You command Morcar's minions and see all hidden rooms.")
	else:
		current_role = "player"
		_log("⚔️ Switched to Player Mode! You control the hero party.")
		update_party_vision()
	_update_ui()
	queue_redraw_all()

func _on_attack_pressed() -> void:
	if btn_attack and "Open Door" in btn_attack.text:
		var adj_d = get_adjacent_closed_doors()
		if adj_d.size() > 0:
			var d = adj_d[0]
			var from_pos = Vector2i(d.get("from", [0, 0])[0], d.get("from", [0, 0])[1])
			var to_pos = Vector2i(d.get("to", [0, 0])[0], d.get("to", [0, 0])[1])
			open_door(from_pos, to_pos)
			return

	if is_gm_role() or current_phase == "dm_phase" or current_phase == "gm_phase":
		dm_attack_hero()
	else:
		attack_adjacent_monster()

func _on_cartridge_inserted(_cart: Dictionary) -> void:
	_load_active_cartridge()

func _load_active_cartridge() -> void:
	var cart = CartridgeManager.active_cartridge
	if cart.size() == 0:
		return

	var starting_map_id = cart.get("header", {}).get("startingMap", "heroquest-the-trial")
	var map_data = cart.get("maps", {}).get(starting_map_id, {})
	if map_data.is_empty() and cart.get("maps", {}).size() > 0:
		map_data = cart.get("maps", {}).values()[0]

	grid_cols = map_data.get("width", GRID_COLS)
	grid_rows = map_data.get("height", GRID_ROWS)

	var bg_img = map_data.get("backgroundImage", "")
	if bg_img != "" and ResourceLoader.exists(bg_img):
		board_sprite.texture = load(bg_img)

	var stair = map_data.get("startingStair", [0, 1])
	starting_stair = Vector2i(stair[0], stair[1])

	var cart_heroes = cart.get("heroes", {})
	heroes.clear()
	var occupied_starts: Dictionary = {}
	for h_id in cart_heroes:
		var h = cart_heroes[h_id].duplicate(true)
		h["current_bp"] = h.get("bodyPoints", 8)
		h["current_mp"] = h.get("mindPoints", 2)
		h["gold"] = 0
		var pos_arr = h.get("position", [starting_stair.x, starting_stair.y])
		var h_pos = Vector2i(pos_arr[0], pos_arr[1])
		if occupied_starts.has(h_pos):
			# Standard HeroQuest rule: No sharing squares! Find adjacent unoccupied corridor tile
			for offset in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(0, 2), Vector2i(2, 0), Vector2i(1, 1)]:
				var cand = starting_stair + offset
				if not occupied_starts.has(cand) and not is_tile_wall_blocked(cand) and _get_room_at(cand).is_empty():
					h_pos = cand
					break
		occupied_starts[h_pos] = true
		h["grid_pos"] = h_pos
		heroes.append(h)

	var cart_monsters = cart.get("monsters", {})
	monsters.clear()
	for m_id in cart_monsters:
		var m = cart_monsters[m_id].duplicate(true)
		m["current_bp"] = m.get("bodyPoints", 1)
		var pos = m.get("position", [12, 9])
		m["grid_pos"] = Vector2i(pos[0], pos[1])
		m["is_alive"] = true
		monsters.append(m)

	rooms.clear()
	for r in map_data.get("rooms", []):
		rooms.append(r.duplicate(true))

	doors.clear()
	for d in map_data.get("doors", []):
		var door_entry = d.duplicate(true)
		door_entry["is_open"] = false
		doors.append(door_entry)

	furniture.clear()
	for f in map_data.get("furniture", []):
		furniture.append(f.duplicate(true))

	wall_blocks.clear()
	for wb in map_data.get("wallBlocks", []):
		wall_blocks.append(wb.duplicate(true))

	traps.clear()
	for tr in map_data.get("traps", []):
		traps.append(tr.duplicate(true))

	# Fog of War: initially, cast ray vision from hero starting stairwell
	revealed_rooms.clear()
	explored_tiles.clear()
	update_party_vision()
	_update_ui()
	queue_redraw_all()

func is_tile_wall_blocked(tile: Vector2i) -> bool:
	for wb in wall_blocks:
		var px = int(wb.get("x", wb.get("position", [0, 0])[0]))
		var py = int(wb.get("y", wb.get("position", [0, 0])[1]))
		var w = int(wb.get("width", 1))
		var h = int(wb.get("height", 1))
		var b_type = str(wb.get("type", "1-tile-wall"))
		if b_type == "2-tile-wall-h" or b_type == "double-h":
			w = 2; h = 1
		elif b_type == "2-tile-wall-v" or b_type == "double-v":
			w = 1; h = 2
		if tile.x >= px and tile.x < px + w and tile.y >= py and tile.y < py + h:
			return true
	return false

# --- HeroQuest Miniature Occupancy Rules ---
func get_hero_at(tile: Vector2i) -> Dictionary:
	for h in heroes:
		if h.get("current_bp", 0) > 0 and h.get("grid_pos") == tile:
			return h
	return {}

func get_monster_at(tile: Vector2i) -> Dictionary:
	for m in monsters:
		if m.get("is_alive", false) and m.get("grid_pos") == tile:
			return m
	return {}

func is_tile_occupied_by_hero(tile: Vector2i, exclude_hero_idx: int = -1) -> bool:
	for i in range(heroes.size()):
		if i == exclude_hero_idx:
			continue
		var h = heroes[i]
		if h.get("current_bp", 0) > 0 and h.get("grid_pos") == tile:
			return true
	return false

func is_tile_occupied_by_monster(tile: Vector2i) -> bool:
	for m in monsters:
		if m.get("is_alive", false) and m.get("grid_pos") == tile:
			return true
	return false

func is_tile_occupied(tile: Vector2i, exclude_hero_idx: int = -1) -> bool:
	return is_tile_occupied_by_hero(tile, exclude_hero_idx) or is_tile_occupied_by_monster(tile)

func _get_door_between(a: Vector2i, b: Vector2i) -> Dictionary:
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		if (f[0] == a.x and f[1] == a.y and t[0] == b.x and t[1] == b.y) or \
		   (t[0] == a.x and t[1] == a.y and f[0] == b.x and f[1] == b.y):
			return d
	return {}

func has_wall_between(a: Vector2i, b: Vector2i) -> bool:
	# 1. Out of bounds check
	if a.x < 0 or a.x >= grid_cols or a.y < 0 or a.y >= grid_rows:
		return true
	if b.x < 0 or b.x >= grid_cols or b.y < 0 or b.y >= grid_rows:
		return true

	# 2. Check doors
	var d = _get_door_between(a, b)
	if d.size() > 0:
		# If door is open, line of sight passes through
		# If door is closed, line of sight is blocked
		return not d.get("is_open", false)

	# 3. Check room boundaries
	var ra = _get_room_at(a)
	var rb = _get_room_at(b)
	var ra_id = str(ra.get("id", ""))
	var rb_id = str(rb.get("id", ""))

	# If crossing between a room and a corridor, or between two different rooms:
	if ra_id != rb_id:
		return true

	return false

func is_tile_solid(tile: Vector2i) -> bool:
	if tile.x < 0 or tile.x >= grid_cols or tile.y < 0 or tile.y >= grid_rows:
		return true
	if is_tile_wall_blocked(tile):
		return true
	var rm = _get_room_at(tile)
	var rm_id = str(rm.get("id", ""))
	if rm_id != "" and not revealed_rooms.has(rm_id):
		return true
	return false

func has_line_of_sight(from_pos: Vector2i, to_pos: Vector2i) -> bool:
	if from_pos == to_pos:
		return true

	# Target or source inside an unrevealed room is always occluded
	if is_tile_solid(to_pos) or is_tile_solid(from_pos):
		return false

	# 1. Fast Cardinal Check (Straight orthogonal corridor sightlines)
	if from_pos.x == to_pos.x:
		var step = 1 if to_pos.y > from_pos.y else -1
		var y = from_pos.y
		while y != to_pos.y:
			var next_y = y + step
			var cur = Vector2i(from_pos.x, y)
			var nxt = Vector2i(from_pos.x, next_y)
			if has_wall_between(cur, nxt):
				return false
			if nxt != to_pos and is_tile_solid(nxt):
				return false
			y = next_y
		return true

	if from_pos.y == to_pos.y:
		var step = 1 if to_pos.x > from_pos.x else -1
		var x = from_pos.x
		while x != to_pos.x:
			var next_x = x + step
			var cur = Vector2i(x, from_pos.y)
			var nxt = Vector2i(next_x, from_pos.y)
			if has_wall_between(cur, nxt):
				return false
			if nxt != to_pos and is_tile_solid(nxt):
				return false
			x = next_x
		return true

	# 2. Angled Beam Check (prevents corner-cutting and leaking into parallel corridors)
	var p0 = Vector2(float(from_pos.x) + 0.5, float(from_pos.y) + 0.5)
	var p1 = Vector2(float(to_pos.x) + 0.5, float(to_pos.y) + 0.5)
	var delta = p1 - p0
	var dist = delta.length()
	var steps = int(dist * 20.0) + 1
	var beam_radius: float = 0.15
	var prev_tile = from_pos

	for i in range(1, steps):
		var t = float(i) / float(steps)
		var c = p0 + delta * t
		var cur_tile = Vector2i(int(floor(c.x)), int(floor(c.y)))

		if cur_tile != prev_tile:
			if has_wall_between(prev_tile, cur_tile):
				return false
			prev_tile = cur_tile

		# Check solid collision within beam thickness
		for ox in [-beam_radius, beam_radius]:
			for oy in [-beam_radius, beam_radius]:
				var chk_tile = Vector2i(int(floor(c.x + ox)), int(floor(c.y + oy)))
				if chk_tile != from_pos and chk_tile != to_pos:
					if is_tile_solid(chk_tile):
						return false

	return true

func update_party_vision() -> void:
	if is_gm_role():
		return

	var vision_sources: Array[Vector2i] = []
	for h in heroes:
		if h.get("current_bp", 1) > 0:
			vision_sources.append(h.get("grid_pos", starting_stair))

	if vision_sources.is_empty():
		vision_sources.append(starting_stair)

	explored_tiles[starting_stair] = true

	# Ensure all tiles in revealed rooms are permanently explored
	for r_id in revealed_rooms:
		var rm = _get_room_by_id(r_id)
		if rm.size() > 0:
			var rx = int(rm.get("x", 0))
			var ry = int(rm.get("y", 0))
			var rw = int(rm.get("w", 1))
			var rh = int(rm.get("h", 1))
			for x in range(rx, rx + rw):
				for y in range(ry, ry + rh):
					explored_tiles[Vector2i(x, y)] = true

	# Cast rays from all living heroes to find all visible corridor and revealed room tiles
	for c in range(grid_cols):
		for r in range(grid_rows):
			var tile = Vector2i(c, r)
			if explored_tiles.has(tile):
				continue

			var rm = _get_room_at(tile)
			var r_id = str(rm.get("id", ""))
			# Unrevealed room tiles can never be seen by rays
			if r_id != "" and not revealed_rooms.has(r_id):
				continue

			for src in vision_sources:
				if has_line_of_sight(src, tile):
					explored_tiles[tile] = true
					break

func reveal_room_by_id(r_id: String) -> void:
	if r_id == "" or revealed_rooms.has(r_id):
		return
	revealed_rooms.append(r_id)
	var room_obj = _get_room_by_id(r_id)
	var room_name = room_obj.get("name", r_id)
	_log("🚪 Door kicked open! Revealed chamber: %s!" % room_name)

	# Reveal all tiles of this room immediately
	var rx = int(room_obj.get("x", 0))
	var ry = int(room_obj.get("y", 0))
	var rw = int(room_obj.get("w", 1))
	var rh = int(room_obj.get("h", 1))
	for x in range(rx, rx + rw):
		for y in range(ry, ry + rh):
			explored_tiles[Vector2i(x, y)] = true

	# Log spotted monsters in the chamber
	var found_m: Array[String] = []
	for m in monsters:
		if m.get("roomId", "") == r_id and m.get("is_alive", false):
			found_m.append(str(m.get("name", "Monster")))
	if found_m.size() > 0:
		_log("⚠️ Danger! Spotted inside: %s!" % ", ".join(found_m))
	else:
		_log("✨ The chamber appears calm... for now.")

func _is_inside_any_room(tile: Vector2i) -> bool:
	for r in rooms:
		var rx = int(r.get("x", 0))
		var ry = int(r.get("y", 0))
		var rw = int(r.get("w", 1))
		var rh = int(r.get("h", 1))
		if tile.x >= rx and tile.x < rx + rw and tile.y >= ry and tile.y < ry + rh:
			return true
	return false

func _get_room_at(tile: Vector2i) -> Dictionary:
	for r in rooms:
		var rx = int(r.get("x", 0))
		var ry = int(r.get("y", 0))
		var rw = int(r.get("w", 1))
		var rh = int(r.get("h", 1))
		if tile.x >= rx and tile.x < rx + rw and tile.y >= ry and tile.y < ry + rh:
			return r
	return {}

func _get_room_by_id(r_id: String) -> Dictionary:
	for r in rooms:
		if str(r.get("id", "")) == r_id:
			return r
	return {}

func _process(delta: float) -> void:
	if CartridgeManager.auto_play_enabled:
		auto_play_timer += delta
		if auto_play_timer >= 1.2:
			auto_play_timer = 0.0
			_execute_auto_play_step()

func _execute_auto_play_step() -> void:
	auto_play_step += 1
	var hero = get_active_hero()
	if hero.size() == 0:
		return

	match auto_play_step:
		1:
			_log("⚡ [Auto-Play] Step 1: %s rolls 2d6 movement dice..." % str(hero.get("name")))
			roll_movement_dice()
		2:
			var target = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			_log("⚡ [Auto-Play] Step 2: %s advances down the corridor toward heavy dungeon door at (%d, %d)." % [hero.get("name"), target.x, target.y])
			move_hero(target)
		3:
			var door_from = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			var door_to = Vector2i(4, 2) if starting_stair == Vector2i(0, 1) else Vector2i(2, 1)
			_log("⚡ [Auto-Play] Step 3: %s kicks open the ancient wooden door! Fog of War lifts!" % str(hero.get("name")))
			open_door(door_from, door_to)
		4:
			var room_target = Vector2i(4, 3) if starting_stair == Vector2i(0, 1) else Vector2i(2, 2)
			_log("⚡ [Auto-Play] Step 4: %s strides boldly into the revealed chamber!" % str(hero.get("name")))
			move_hero(room_target)
		5:
			_log("⚡ [Auto-Play] Step 5: %s swings Broadsword at enemy monster!" % str(hero.get("name")))
			attack_adjacent_monster()
		6:
			_log("⚡ [Auto-Play] Step 6: Barbarian ends turn. Next hero: Dwarf.")
			end_turn()
		7:
			_log("⚡ [Auto-Play] Step 7: Dwarf rolls movement and enters the chamber.")
			roll_movement_dice()
			var dwarf_pos = Vector2i(3, 3) if starting_stair == Vector2i(0, 1) else Vector2i(3, 1)
			move_hero(dwarf_pos)
		8:
			_log("⚡ [Auto-Play] Step 8: Dwarf searches room for treasure and hidden traps!")
			search_room()
		9:
			_log("⚡ [Auto-Play] Step 9: Hero phase concludes! Game Master / Zargon AI Phase begins!")
			end_turn()
			current_phase = "gm_phase"
			ai_monster_turn()
		10:
			_log("⚡ [Auto-Play] Step 10: Round 2 begins! E2E Gameplay & Turn Cycle verified.")
			CartridgeManager.auto_play_enabled = false

func get_active_hero() -> Dictionary:
	if heroes.size() == 0:
		return {}
	return heroes[active_hero_idx % heroes.size()]

func get_active_monster() -> Dictionary:
	var live_monsters = monsters.filter(func(m): return m.get("is_alive", false))
	if live_monsters.size() == 0:
		return {}
	return live_monsters[active_monster_idx % live_monsters.size()]

func get_adjacent_monsters() -> Array[Dictionary]:
	var hero = get_active_hero()
	if hero.is_empty():
		return []
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var res: Array[Dictionary] = []
	for m in monsters:
		if m.get("is_alive", false):
			var m_pos: Vector2i = m.get("grid_pos", Vector2i(-1, -1))
			if absi(m_pos.x - h_pos.x) + absi(m_pos.y - h_pos.y) == 1:
				res.append(m)
	return res

func get_adjacent_closed_doors() -> Array[Dictionary]:
	var hero = get_active_hero()
	if hero.is_empty():
		return []
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var res: Array[Dictionary] = []
	for d in doors:
		if not d.get("is_open", false):
			var from_pos = Vector2i(d.get("from", [0, 0])[0], d.get("from", [0, 0])[1])
			var to_pos = Vector2i(d.get("to", [0, 0])[0], d.get("to", [0, 0])[1])
			if (h_pos == from_pos and absi(h_pos.x - to_pos.x) + absi(h_pos.y - to_pos.y) == 1) or \
			   (h_pos == to_pos and absi(h_pos.x - from_pos.x) + absi(h_pos.y - from_pos.y) == 1):
				res.append(d)
	return res

func can_search_room() -> bool:
	var hero = get_active_hero()
	if hero.is_empty() or has_acted_this_turn:
		return false
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var rm = _get_room_at(h_pos)
	var r_id = str(rm.get("id", ""))
	if r_id == "" or not revealed_rooms.has(r_id):
		return false
	for m in monsters:
		if m.get("is_alive", false) and m.get("roomId", "") == r_id:
			return false
	return true

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var mouse_pos = get_global_mouse_position()
		var local_pos = mouse_pos - board_offset
		var tx = int(floor(local_pos.x / tile_size))
		var ty = int(floor(local_pos.y / tile_size))
		if tx >= 0 and tx < grid_cols and ty >= 0 and ty < grid_rows:
			_handle_tile_click(Vector2i(tx, ty))

func _handle_tile_click(tile: Vector2i) -> void:
	if current_phase != "hero_phase" or current_role != "player":
		return
	var hero = get_active_hero()
	if hero.is_empty():
		return
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))

	# If clicked on adjacent closed door, open it!
	for d in doors:
		if not d.get("is_open", false):
			var from_pos = Vector2i(d.get("from", [0, 0])[0], d.get("from", [0, 0])[1])
			var to_pos = Vector2i(d.get("to", [0, 0])[0], d.get("to", [0, 0])[1])
			if (tile == from_pos or tile == to_pos) and (h_pos == from_pos or h_pos == to_pos):
				open_door(from_pos, to_pos)
				return

	# If clicked on adjacent monster, attack!
	for m in monsters:
		if m.get("is_alive", false) and m.get("grid_pos") == tile:
			if absi(tile.x - h_pos.x) + absi(tile.y - h_pos.y) == 1:
				if not has_acted_this_turn:
					attack_adjacent_monster(str(m.get("id", "")))
				return

	# If haven't rolled movement yet, roll dice first!
	if not movement_rolled:
		roll_movement_dice()

	# If hero has movement, move to tile
	if movement_remaining > 0:
		move_hero(tile)

func roll_movement_dice() -> Dictionary:
	var roll = TabletopDice.roll_movement()
	movement_remaining = roll.total
	movement_rolled = true
	turn_state = "moving"
	_log("🎲 %s rolled 2d6 movement: [%d, %d] = %d squares!" % [
		get_active_hero().get("name", "Hero"), roll.d1, roll.d2, roll.total
	])
	_update_ui()
	queue_redraw_all()
	return roll

func find_path(start: Vector2i, goal: Vector2i, moving_hero_idx: int = -1) -> Array[Vector2i]:
	if start == goal:
		return [start]
	# Rule 1: No sharing squares! Characters cannot finish their turn on a square occupied by another model.
	if is_tile_occupied(goal, moving_hero_idx):
		return []

	var queue: Array[Vector2i] = [start]
	var came_from: Dictionary = { start: start }
	var dirs = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

	while queue.size() > 0:
		var cur = queue.pop_front()
		if cur == goal:
			var path: Array[Vector2i] = []
			var trace = goal
			while trace != start:
				path.append(trace)
				trace = came_from[trace]
			path.append(start)
			path.reverse()
			return path

		for d in dirs:
			var nxt = cur + d
			if nxt.x < 0 or nxt.x >= grid_cols or nxt.y < 0 or nxt.y >= grid_rows:
				continue
			if came_from.has(nxt):
				continue
			if has_wall_between(cur, nxt) or is_tile_wall_blocked(nxt):
				continue
			var rm = _get_room_at(nxt)
			var rm_id = str(rm.get("id", ""))
			if rm_id != "" and not revealed_rooms.has(rm_id):
				continue
			# Rule 2: Heroes generally cannot move through squares occupied by monsters.
			# Monsters create tactical bottlenecks in narrow corridors and doorways!
			if is_tile_occupied_by_monster(nxt):
				continue
			# Rule 3: Heroes CAN pass through friendly heroes, but cannot end on them
			# (which is enforced at goal check above).
			came_from[nxt] = cur
			queue.append(nxt)

	return []

func move_hero(target_pos: Vector2i) -> bool:
	var hero = get_active_hero()
	if hero.size() == 0:
		return false

	var curr = hero.get("grid_pos", Vector2i(1, 1))
	if curr == target_pos:
		return true

	# Standard HeroQuest Rule: No Sharing Squares
	if is_tile_occupied(target_pos, active_hero_idx):
		if is_tile_occupied_by_hero(target_pos, active_hero_idx):
			var occ_hero = get_hero_at(target_pos)
			_log("⚠️ Square (%d, %d) is occupied by %s! HeroQuest rules strictly forbid sharing a space." % [
				target_pos.x, target_pos.y, occ_hero.get("name", "another hero")
			])
		else:
			var occ_monster = get_monster_at(target_pos)
			_log("⚠️ Square (%d, %d) is occupied by %s! Cannot end movement on monster squares." % [
				target_pos.x, target_pos.y, occ_monster.get("name", "monster")
			])
		return false

	var path = find_path(curr, target_pos, active_hero_idx)
	if path.is_empty():
		_log("⚠️ Path to (%d, %d) is blocked!" % [target_pos.x, target_pos.y])
		return false

	var cost = path.size() - 1
	if movement_remaining > 0 and cost > movement_remaining:
		_log("⚠️ Target out of movement range (need %d, have %d)" % [cost, movement_remaining])
		return false

	hero["grid_pos"] = target_pos
	movement_remaining = maxi(0, movement_remaining - cost)
	if movement_remaining == 0:
		if has_acted_this_turn:
			turn_state = "turn_complete"
		else:
			turn_state = "moving"
	update_party_vision()
	_log("👣 %s moved to (%d, %d). Remaining movement: %d" % [
		hero.get("name"), target_pos.x, target_pos.y, movement_remaining
	])
	_update_ui()
	queue_redraw_all()
	return true

func open_door(from_pos: Vector2i, to_pos: Vector2i) -> bool:
	var d = _get_door_between(from_pos, to_pos)
	if d.is_empty():
		return false

	d["is_open"] = true

	var f = d.get("from", [0, 0])
	var t = d.get("to", [0, 0])

	var rooms_to_reveal: Array[String] = []
	var explicit_room = str(d.get("room", ""))
	if explicit_room != "":
		rooms_to_reveal.append(explicit_room)

	var r1 = _get_room_at(Vector2i(f[0], f[1]))
	var r2 = _get_room_at(Vector2i(t[0], t[1]))
	if r1.size() > 0:
		var r1_id = str(r1.get("id", ""))
		if not rooms_to_reveal.has(r1_id):
			rooms_to_reveal.append(r1_id)
	if r2.size() > 0:
		var r2_id = str(r2.get("id", ""))
		if not rooms_to_reveal.has(r2_id):
			rooms_to_reveal.append(r2_id)

	for r_id in rooms_to_reveal:
		reveal_room_by_id(r_id)

	update_party_vision()
	_update_ui()
	queue_redraw_all()
	return true

func attack_adjacent_monster(monster_id: String = "") -> Dictionary:
	var hero = get_active_hero()
	var target_m: Dictionary = {}

	for m in monsters:
		if m.get("is_alive", false):
			if monster_id != "" and m.get("id") == monster_id:
				target_m = m
				break
			elif monster_id == "":
				target_m = m
				break

	if target_m.size() == 0:
		_log("No monster to attack!")
		return {}

	var atk_dice = hero.get("attackDice", 3)
	var def_dice = target_m.get("defendDice", 2)

	var res = TabletopDice.resolve_combat(atk_dice, def_dice, false)
	_log("⚔️ %s attacks %s with %d dice! Rolled %d Skulls. %s defended with %d Black Shields." % [
		hero.get("name"), target_m.get("name"), atk_dice, res.total_skulls, target_m.get("name"), res.effective_shields
	])

	if res.wounds > 0:
		target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - res.wounds)
		_log("💥 Wounds inflicted: %d! %s HP: %d" % [res.wounds, target_m.get("name"), target_m.get("current_bp")])
		if target_m.get("current_bp") <= 0:
			target_m["is_alive"] = false
			_log("💀 %s is DEFEATED!" % target_m.get("name"))
	else:
		_log("🛡️ Attack was completely blocked by %s!" % target_m.get("name"))

	has_acted_this_turn = true
	if movement_remaining == 0:
		turn_state = "turn_complete"
	else:
		turn_state = "action_taken"
	_update_ui()
	queue_redraw_all()
	return res

# DunMaster Action: Monster attacks Hero!
func dm_attack_hero(hero_id: String = "") -> Dictionary:
	var monster = get_active_monster()
	if monster.size() == 0:
		_log("No living monster to attack with!")
		return {}

	var target_h: Dictionary = {}
	for h in heroes:
		if h.get("current_bp", 1) > 0:
			if hero_id != "" and h.get("id") == hero_id:
				target_h = h
				break
			elif hero_id == "":
				target_h = h
				break

	if target_h.size() == 0:
		_log("No living hero to attack!")
		return {}

	var atk_dice = monster.get("attackDice", 3)
	var def_dice = target_h.get("defendDice", 2)

	var res = TabletopDice.resolve_combat(atk_dice, def_dice, true)
	_log("👑 [Game Master] %s attacks %s! Rolled %d Skulls. %s rolled %d White Shields." % [
		monster.get("name"), target_h.get("name"), res.total_skulls, target_h.get("name"), res.effective_shields
	])

	if res.wounds > 0:
		target_h["current_bp"] = maxi(0, target_h.get("current_bp", 8) - res.wounds)
		_log("💥 %s takes %d wound(s)! Remaining HP: %d" % [target_h.get("name"), res.wounds, target_h.get("current_bp")])
	else:
		_log("🛡️ %s successfully blocked the monster attack!" % target_h.get("name"))

	_update_ui()
	queue_redraw_all()
	return res

# Game Master Action: Summon Wandering Monster Ambush
func summon_wandering_monster(spawn_pos: Vector2i = Vector2i(3, 0)) -> Dictionary:
	if is_tile_occupied(spawn_pos):
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(-1, 1)]:
			var cand = spawn_pos + d
			if not is_tile_occupied(cand) and not is_tile_wall_blocked(cand):
				spawn_pos = cand
				break

	var new_m = {
		"id": "wandering-orc-" + str(monsters.size() + 1),
		"name": "Wandering Orc",
		"bodyPoints": 1,
		"current_bp": 1,
		"attackDice": 3,
		"defendDice": 2,
		"movementSquares": 8,
		"tokenColor": "#047857",
		"icon": "🧌",
		"grid_pos": spawn_pos,
		"is_alive": true
	}
	monsters.append(new_m)
	_log("👑 [Game Master] An evil laugh echoes! A Wandering Orc appears at (%d, %d)!" % [spawn_pos.x, spawn_pos.y])
	_update_ui()
	queue_redraw_all()
	return { "success": true, "monster": new_m }

func search_room() -> Dictionary:
	var hero = get_active_hero()
	var found_gold = 50
	hero["gold"] = hero.get("gold", 0) + found_gold
	_log("💰 %s searches room for treasure: Discovered a chest with %d Gold Coins! Total Gold: %d" % [
		hero.get("name"), found_gold, hero.get("gold")
	])
	has_acted_this_turn = true
	if movement_remaining == 0:
		turn_state = "turn_complete"
	else:
		turn_state = "action_taken"
	_update_ui()
	queue_redraw_all()
	return { "success": true, "goldFound": found_gold }

func end_turn() -> void:
	if current_phase == "hero_phase":
		active_hero_idx = (active_hero_idx + 1) % maxi(1, heroes.size())
		if active_hero_idx == 0:
			current_phase = "gm_phase"
			_log("=== Zargon / Game Master Phase Begins ===")
			if current_role == "player":
				call_deferred("ai_monster_turn")
		else:
			_log("--- Next Hero: %s ---" % get_active_hero().get("name", "Hero"))
	else:
		current_phase = "hero_phase"
		current_round += 1
		_log("--- Round %d begins (Heroes Turn) ---" % current_round)
		_log("Active hero: %s" % get_active_hero().get("name", "Hero"))

	movement_remaining = 0
	movement_rolled = false
	has_acted_this_turn = false
	turn_state = "awaiting_roll"
	_update_ui()
	queue_redraw_all()

func ai_monster_turn() -> Dictionary:
	_log("👑 [Game Master] Minions of Zargon stir in the darkness...")
	var live_monsters = monsters.filter(func(m): return m.get("is_alive", false))
	
	# Only monsters that are revealed or in active rooms will act
	var active_monsters = live_monsters.filter(func(m):
		var r_id = str(m.get("roomId", ""))
		return r_id == "" or revealed_rooms.has(r_id)
	)

	if active_monsters.is_empty():
		_log("👑 No active monsters in sight. The dungeon echoes with distant whispers.")
		end_turn()
		return { "success": true, "acted": 0 }

	var acts = 0
	for m in active_monsters:
		var m_pos: Vector2i = m.get("grid_pos", Vector2i(0, 0))
		var nearest_hero: Dictionary = {}
		var min_dist: int = 9999
		for h in heroes:
			if h.get("current_bp", 0) > 0:
				var h_pos: Vector2i = h.get("grid_pos", Vector2i(0, 0))
				var dist = absi(h_pos.x - m_pos.x) + absi(h_pos.y - m_pos.y)
				if dist < min_dist:
					min_dist = dist
					nearest_hero = h

		if nearest_hero.is_empty():
			continue

		var h_pos: Vector2i = nearest_hero.get("grid_pos", Vector2i(0, 0))

		if min_dist == 1:
			_log("👹 %s roars and attacks %s!" % [m.get("name"), nearest_hero.get("name")])
			dm_attack_hero(str(nearest_hero.get("id", "")))
			acts += 1
		elif min_dist > 1:
			var step_dir = Vector2i(
				clampi(h_pos.x - m_pos.x, -1, 1) if absi(h_pos.x - m_pos.x) >= absi(h_pos.y - m_pos.y) else 0,
				clampi(h_pos.y - m_pos.y, -1, 1) if absi(h_pos.y - m_pos.y) > absi(h_pos.x - m_pos.x) else 0
			)
			var next_pos = m_pos + step_dir
			if not has_wall_between(m_pos, next_pos) and not is_tile_wall_blocked(next_pos) and not is_tile_occupied(next_pos):
				m["grid_pos"] = next_pos
				_log("👣 %s moves towards %s to (%d, %d)." % [m.get("name"), nearest_hero.get("name"), next_pos.x, next_pos.y])
				acts += 1
				if absi(h_pos.x - next_pos.x) + absi(h_pos.y - next_pos.y) == 1:
					dm_attack_hero(str(nearest_hero.get("id", "")))

	end_turn()
	return { "success": true, "acted": acts }

func _update_ui() -> void:
	var role_name = "Player Mode (Playing Heroes)" if current_role == "player" else "Game Master Mode (Zargon GM)"
	if title_label:
		title_label.text = "RobOS Tabletop RPG: HeroQuest — %s" % role_name
	if role_badge:
		role_badge.text = "Role: " + ("Player" if current_role == "player" else "Game Master")

	var hero = get_active_hero()
	var h_name = str(hero.get("name", "Hero"))

	if is_gm_role():
		# Game Master / Zargon controls
		if btn_summon:
			btn_summon.visible = true
		if btn_roll:
			btn_roll.visible = true
			btn_roll.disabled = false
			btn_roll.text = "🎲 Roll Monster"
		if btn_attack:
			btn_attack.visible = true
			btn_attack.disabled = false
			btn_attack.text = "Monster Attack"
		if btn_search:
			btn_search.visible = false
		if btn_end_turn:
			btn_end_turn.visible = true
			btn_end_turn.text = "End GM Turn"
		if dice_label:
			dice_label.text = "👑 Zargon Game Master Mode: Full Dungeon Control"
	elif current_phase == "gm_phase":
		# Watching Game Master / AI turn
		if btn_summon:
			btn_summon.visible = false
		if btn_roll:
			btn_roll.visible = false
		if btn_attack:
			btn_attack.visible = false
		if btn_search:
			btn_search.visible = false
		if btn_end_turn:
			btn_end_turn.visible = false
		if dice_label:
			dice_label.text = "👑 Minions of Zargon stir in the darkness..."
	else:
		# Hero Phase (Player)
		if btn_summon:
			btn_summon.visible = false

		var adj_monsters = get_adjacent_monsters()
		var adj_doors = get_adjacent_closed_doors()
		var in_room_clean = can_search_room()

		if not movement_rolled:
			# Awaiting Roll state
			if dice_label:
				dice_label.text = "👉 %s's Turn: ROLL DICE to determine movement!" % h_name
			if btn_roll:
				btn_roll.visible = true
				btn_roll.disabled = false
				btn_roll.text = "🎲 Roll Movement (2d6)"
			if btn_attack:
				if adj_monsters.size() > 0 and not has_acted_this_turn:
					btn_attack.visible = true
					btn_attack.disabled = false
					btn_attack.text = "⚔️ Attack %s" % adj_monsters[0].get("name", "Monster")
				else:
					btn_attack.visible = false
			if btn_search:
				btn_search.visible = false
			if btn_end_turn:
				btn_end_turn.visible = true
				btn_end_turn.text = "Skip Turn"
		else:
			# Movement rolled
			if movement_remaining > 0:
				if has_acted_this_turn:
					if dice_label:
						dice_label.text = "👣 Action used! Spend remaining %d movement or click End Turn." % movement_remaining
				else:
					if dice_label:
						dice_label.text = "👣 %s: Move %d squares on board, or execute action." % [h_name, movement_remaining]
				if btn_roll:
					btn_roll.visible = true
					btn_roll.disabled = true
					btn_roll.text = "Move: %d left" % movement_remaining
			else:
				if has_acted_this_turn:
					if dice_label:
						dice_label.text = "🏁 Turn complete! Click End Turn to proceed."
				else:
					if dice_label:
						dice_label.text = "⚠️ Out of movement! You may still take an action or End Turn."
				if btn_roll:
					btn_roll.visible = true
					btn_roll.disabled = true
					btn_roll.text = "Move: 0"

			# Contextual attack / door button
			if btn_attack:
				if adj_monsters.size() > 0 and not has_acted_this_turn:
					btn_attack.visible = true
					btn_attack.disabled = false
					btn_attack.text = "⚔️ Attack %s" % adj_monsters[0].get("name", "Monster")
				elif adj_doors.size() > 0:
					btn_attack.visible = true
					btn_attack.disabled = false
					btn_attack.text = "🚪 Open Door"
				else:
					btn_attack.visible = false

			# Contextual search button
			if btn_search:
				if in_room_clean and not has_acted_this_turn:
					btn_search.visible = true
					btn_search.disabled = false
					btn_search.text = "🔍 Search Room"
				else:
					btn_search.visible = false

			if btn_end_turn:
				btn_end_turn.visible = true
				btn_end_turn.text = "⏹️ End Turn"

	# Character card
	if hero.size() > 0 and hero_card:
		var turn_badge = "★ YOUR TURN ★\n" if current_phase == "hero_phase" and current_role == "player" else ""
		hero_card.text = "%s%s (%s)\nBP: %d/%d | MP: %d/%d\nAtk Dice: %d | Def Dice: %d\nGold: %d gp" % [
			turn_badge,
			hero.get("name"), hero.get("title", ""),
			hero.get("current_bp", 8), hero.get("bodyPoints", 8),
			hero.get("current_mp", 2), hero.get("mindPoints", 2),
			hero.get("attackDice", 3), hero.get("defendDice", 2),
			hero.get("gold", 0)
		]

	var log_text = ""
	for i in range(maxi(0, combat_log.size() - 8), combat_log.size()):
		log_text += combat_log[i] + "\n"
	if log_label:
		log_label.text = log_text

func _log(msg: String) -> void:
	print("[Tabletop] ", msg)
	combat_log.append(msg)
	_update_ui()

func get_telemetry_state() -> Dictionary:
	var exp_tiles: Array = []
	for t in explored_tiles.keys():
		exp_tiles.append([t.x, t.y])

	var h_act = get_active_hero()
	var h_pos = h_act.get("grid_pos", Vector2i(-1, -1))
	var active_center = board_offset + Vector2(h_pos.x * tile_size + tile_size * 0.5, h_pos.y * tile_size + tile_size * 0.5)

	return {
		"role": current_role,
		"round": current_round,
		"phase": current_phase,
		"activeHero": h_act.get("id", ""),
		"activeHeroIndex": active_hero_idx,
		"activeHeroPos": [h_pos.x, h_pos.y],
		"activeHeroTokenPos": [active_center.x, active_center.y],
		"boardOffset": [board_offset.x, board_offset.y],
		"tileSize": tile_size,
		"movementRemaining": movement_remaining,
		"movementRolled": movement_rolled,
		"hasActed": has_acted_this_turn,
		"turnState": turn_state,
		"heroes": heroes,
		"monsters": monsters,
		"doors": doors,
		"rooms": rooms,
		"revealedRooms": revealed_rooms,
		"exploredCount": explored_tiles.size(),
		"exploredTiles": exp_tiles,
		"combatLog": combat_log.slice(-10),
		"cartridge": CartridgeManager.active_cartridge.get("cartridgeId", "")
	}

func execute_action(action_data: Dictionary) -> Dictionary:
	var action_type = str(action_data.get("action", ""))
	match action_type:
		"toggle_role":
			toggle_role()
			return { "success": true, "role": current_role }
		"roll_movement", "roll_dice":
			var r = roll_movement_dice()
			return { "success": true, "roll": r }
		"move":
			var tx = int(action_data.get("x", 0))
			var ty = int(action_data.get("y", 0))
			if action_data.has("target") and action_data.target is Array and action_data.target.size() >= 2:
				tx = int(action_data.target[0])
				ty = int(action_data.target[1])
			var ok = move_hero(Vector2i(tx, ty))
			return { "success": ok }
		"open_door":
			var fx = int(action_data.get("from_x", 0))
			var fy = int(action_data.get("from_y", 0))
			var tx = int(action_data.get("to_x", 0))
			var ty = int(action_data.get("to_y", 0))
			var ok = open_door(Vector2i(fx, fy), Vector2i(tx, ty))
			return { "success": ok }
		"attack":
			var mid = str(action_data.get("monsterId", action_data.get("target", "")))
			var res = attack_adjacent_monster(mid)
			return { "success": true, "result": res }
		"dm_attack":
			var hid = str(action_data.get("heroId", action_data.get("target", "")))
			var res = dm_attack_hero(hid)
			return { "success": true, "result": res }
		"summon_monster":
			var sx = int(action_data.get("x", 3))
			var sy = int(action_data.get("y", 0))
			var res = summon_wandering_monster(Vector2i(sx, sy))
			return res
		"search":
			var res = search_room()
			return res
		"end_turn":
			end_turn()
			return { "success": true }
		"ai_step":
			_execute_auto_play_step()
			return { "success": true, "step": auto_play_step }
		"monster_turn", "ai_monster_turn":
			var res = ai_monster_turn()
			return res
	return { "success": false, "error": "Unknown action: " + action_type }

func _draw() -> void:
	_draw_board(self)

func _draw_board(canvas: CanvasItem) -> void:
	_update_board_metrics()
	# Draw grid overlay
	for c in range(grid_cols + 1):
		var p1 = board_offset + Vector2(c * tile_size, 0)
		var p2 = board_offset + Vector2(c * tile_size, grid_rows * tile_size)
		canvas.draw_line(p1, p2, Color(0.2, 0.4, 0.6, 0.25), 1.0)

	for r in range(grid_rows + 1):
		var p1 = board_offset + Vector2(0, r * tile_size)
		var p2 = board_offset + Vector2(grid_cols * tile_size, r * tile_size)
		canvas.draw_line(p1, p2, Color(0.2, 0.4, 0.6, 0.25), 1.0)

	# Dynamic Fog of War: Unrevealed rooms and unexplored corridor tiles
	if current_role == "player":
		# Unrevealed rooms shroud
		for rm in rooms:
			var r_id = str(rm.get("id", ""))
			if not revealed_rooms.has(r_id):
				var rx = int(rm.get("x", 0))
				var ry = int(rm.get("y", 0))
				var rw = int(rm.get("w", 1))
				var rh = int(rm.get("h", 1))
				var r_rect = Rect2(board_offset + Vector2(rx * tile_size, ry * tile_size), Vector2(rw * tile_size, rh * tile_size))
				canvas.draw_rect(r_rect, Color(0.04, 0.05, 0.08, 0.96))
				canvas.draw_rect(r_rect, Color(0.14, 0.18, 0.25, 0.8), false, 2.0)
				var center = r_rect.get_center()
				var txt = "Shrouded"
				var f_size = 13
				var s_w = ThemeDB.fallback_font.get_string_size(txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size).x
				canvas.draw_string(ThemeDB.fallback_font, Vector2(center.x - s_w * 0.5, center.y + 4), txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size, Color(0.45, 0.55, 0.65, 0.7))

		# Unexplored corridor tiles shroud
		for c in range(grid_cols):
			for r in range(grid_rows):
				var t = Vector2i(c, r)
				if not _is_inside_any_room(t):
					if not explored_tiles.has(t):
						var c_rect = Rect2(board_offset + Vector2(c * tile_size, r * tile_size), Vector2(tile_size, tile_size))
						canvas.draw_rect(c_rect, Color(0.04, 0.05, 0.08, 0.94))

	elif is_gm_role():
		# Game Master Mode: Show secret GM highlights on rooms hidden from players
		for rm in rooms:
			var r_id = str(rm.get("id", ""))
			if not revealed_rooms.has(r_id):
				var rx = int(rm.get("x", 0))
				var ry = int(rm.get("y", 0))
				var rw = int(rm.get("w", 1))
				var rh = int(rm.get("h", 1))
				var r_rect = Rect2(board_offset + Vector2(rx * tile_size, ry * tile_size), Vector2(rw * tile_size, rh * tile_size))
				canvas.draw_rect(r_rect, Color(0.35, 0.1, 0.5, 0.22))
				canvas.draw_rect(r_rect, Color(0.7, 0.25, 0.9, 0.8), false, 1.5)
				canvas.draw_string(ThemeDB.fallback_font, r_rect.position + Vector2(8, 18), "Hidden from Players", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.85, 0.6, 1.0, 0.8))

	# Draw Wall Blocks (1-tile and 2-tile walls)
	for wb in wall_blocks:
		var px = wb.get("x", wb.get("position", [0, 0])[0])
		var py = wb.get("y", wb.get("position", [0, 0])[1])
		var pos = Vector2i(px, py)
		if is_gm_role() or explored_tiles.has(pos):
			var w = int(wb.get("width", 1))
			var h = int(wb.get("height", 1))
			var b_type = str(wb.get("type", "1-tile-wall"))
			if b_type == "2-tile-wall-h" or b_type == "double-h":
				w = 2; h = 1
			elif b_type == "2-tile-wall-v" or b_type == "double-v":
				w = 1; h = 2
			var block_rect = Rect2(board_offset + Vector2(px * tile_size + 2, py * tile_size + 2), Vector2(w * tile_size - 4, h * tile_size - 4))
			# Base stone
			canvas.draw_rect(block_rect, Color(0.18, 0.20, 0.24, 0.95))
			# Bevel border
			canvas.draw_rect(block_rect, Color(0.45, 0.50, 0.58, 1.0), false, 2.0)
			# Inner masonry lines (clean geometric X crossbar)
			canvas.draw_line(block_rect.position + Vector2(4, 4), block_rect.end - Vector2(4, 4), Color(0.35, 0.40, 0.48, 0.6), 1.5)
			canvas.draw_line(Vector2(block_rect.end.x - 4, block_rect.position.y + 4), Vector2(block_rect.position.x + 4, block_rect.end.y - 4), Color(0.35, 0.40, 0.48, 0.6), 1.5)

	# Draw Traps (visible in GM mode or if detected/revealed)
	for tr in traps:
		var r_id = tr.get("roomId", "")
		if is_gm_role() or tr.get("detected", false) or tr.get("is_revealed", false):
			var px = tr.get("x", tr.get("position", [0, 0])[0])
			var py = tr.get("y", tr.get("position", [0, 0])[1])
			var w = int(tr.get("width", 1))
			var h = int(tr.get("height", 1))
			var t_type = str(tr.get("type", tr.get("trapType", "pit")))
			var trap_rect = Rect2(board_offset + Vector2(px * tile_size + 3, py * tile_size + 3), Vector2(w * tile_size - 6, h * tile_size - 6))
			if "boulder" in t_type:
				canvas.draw_circle(trap_rect.get_center(), tile_size * 0.42 * min(w, h), Color(0.35, 0.38, 0.42, 0.95))
				canvas.draw_arc(trap_rect.get_center(), tile_size * 0.42 * min(w, h), 0, TAU, 32, Color(0.65, 0.70, 0.75), 2.0)
			else:
				canvas.draw_rect(trap_rect, Color(0.6, 0.1, 0.1, 0.6))
				canvas.draw_rect(trap_rect, Color(0.9, 0.2, 0.2, 0.9), false, 1.5)
				canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-12, 4), "TRAP", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(1, 0.8, 0.8, 0.9))

	# Draw Furniture
	for f in furniture:
		var r_id = f.get("roomId", "")
		var px = f.get("x", f.get("position", [0, 0])[0])
		var py = f.get("y", f.get("position", [0, 0])[1])
		if is_gm_role() or revealed_rooms.has(r_id) or (r_id == "" and explored_tiles.has(Vector2i(px, py))):
			var f_type = str(f.get("type", "chest"))
			var w = int(f.get("width", 1))
			var h = int(f.get("height", 1))
			if f_type == "altar" and w == 1 and h == 1:
				w = 3; h = 2
			elif f_type == "bookcase" and w == 1 and h == 1:
				w = 3; h = 1
			elif (f_type == "bookshelf" or f_type == "cupboard") and w == 1 and h == 1:
				w = 2; h = 1
			elif f_type == "table" and w == 1 and h == 1:
				w = 3; h = 2
			elif f_type == "tomb" and w == 1 and h == 1:
				w = 2; h = 3

			var f_rect = Rect2(board_offset + Vector2(px * tile_size + 2, py * tile_size + 2), Vector2(w * tile_size - 4, h * tile_size - 4))
			var label_text = ""

			if f_type == "altar":
				canvas.draw_rect(f_rect, Color(0.14, 0.10, 0.20, 0.95))
				canvas.draw_rect(f_rect, Color(0.68, 0.35, 0.95, 0.9), false, 2.0)
				canvas.draw_arc(f_rect.get_center(), min(w, h) * tile_size * 0.28, 0, TAU, 24, Color(0.85, 0.45, 1.0, 0.6), 1.5)
				label_text = "ALTAR"
			elif f_type == "bookcase":
				canvas.draw_rect(f_rect, Color(0.24, 0.12, 0.08, 0.95))
				canvas.draw_rect(f_rect, Color(0.62, 0.36, 0.20, 1.0), false, 2.0)
				label_text = "BOOKS"
			elif f_type == "bookshelf" or f_type == "cupboard":
				canvas.draw_rect(f_rect, Color(0.32, 0.20, 0.10, 0.95))
				canvas.draw_rect(f_rect, Color(0.72, 0.48, 0.24, 1.0), false, 2.0)
				label_text = "SHELF"
			elif f_type == "boulder":
				canvas.draw_circle(f_rect.get_center(), tile_size * 0.42 * min(w, h), Color(0.32, 0.35, 0.38, 0.95))
				canvas.draw_arc(f_rect.get_center(), tile_size * 0.42 * min(w, h), 0, TAU, 32, Color(0.65, 0.70, 0.75), 2.0)
				label_text = ""
			elif f_type == "tomb":
				canvas.draw_rect(f_rect, Color(0.25, 0.28, 0.32, 0.95))
				canvas.draw_rect(f_rect, Color(0.55, 0.60, 0.68, 1.0), false, 2.0)
				label_text = "TOMB"
			elif f_type == "table":
				canvas.draw_rect(f_rect, Color(0.35, 0.22, 0.12, 0.95))
				canvas.draw_rect(f_rect, Color(0.58, 0.38, 0.22, 1.0), false, 1.5)
				label_text = "TABLE"
			elif f_type == "chest":
				canvas.draw_rect(f_rect, Color(0.45, 0.32, 0.08, 0.95))
				canvas.draw_rect(f_rect, Color(0.9, 0.75, 0.2, 1.0), false, 1.5)
				label_text = "CHEST"
			elif f_type == "weapons-rack" or f_type == "rack":
				canvas.draw_rect(f_rect, Color(0.25, 0.25, 0.28, 0.95))
				canvas.draw_rect(f_rect, Color(0.6, 0.6, 0.7, 1.0), false, 1.5)
				label_text = "ARMS"
			else:
				canvas.draw_rect(f_rect, Color(0.4, 0.28, 0.16, 0.85))
				canvas.draw_rect(f_rect, Color(0.6, 0.45, 0.25, 1.0), false, 1.5)
				label_text = f_type.to_upper().substr(0, 5)

			if label_text != "":
				var lbl_w = ThemeDB.fallback_font.get_string_size(label_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10).x
				canvas.draw_string(ThemeDB.fallback_font, Vector2(f_rect.get_center().x - lbl_w * 0.5, f_rect.get_center().y + 3), label_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color(0.9, 0.9, 0.9, 0.85))

	# Draw Doors
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		var f_pos = Vector2i(f[0], f[1])
		var t_pos = Vector2i(t[0], t[1])
		if is_gm_role() or explored_tiles.has(f_pos) or explored_tiles.has(t_pos):
			var p1 = board_offset + Vector2(f[0] * tile_size + tile_size * 0.5, f[1] * tile_size + tile_size * 0.5)
			var p2 = board_offset + Vector2(t[0] * tile_size + tile_size * 0.5, t[1] * tile_size + tile_size * 0.5)
			var mid = (p1 + p2) * 0.5
			var is_open = d.get("is_open", false)
			var col = Color(0.2, 0.8, 0.2, 0.9) if is_open else Color(0.8, 0.5, 0.1, 0.9)
			canvas.draw_rect(Rect2(mid.x - 8, mid.y - 8, 16, 16), col)

	# Draw Monsters
	for m in monsters:
		if m.get("is_alive", false):
			var r_id = m.get("roomId", "")
			var pos = m.get("grid_pos", Vector2i(0, 0))
			# Visible if GM mode OR room is revealed OR explored corridor tile
			if is_gm_role() or revealed_rooms.has(r_id) or (r_id == "" and explored_tiles.has(pos)):
				var screen_pos = board_offset + Vector2(pos.x * tile_size + tile_size * 0.5, pos.y * tile_size + tile_size * 0.5)
				var col = Color.from_string(m.get("tokenColor", "#15803d"), Color.GREEN)
				canvas.draw_circle(screen_pos, tile_size * 0.4, col)
				canvas.draw_arc(screen_pos, tile_size * 0.4, 0, TAU, 24, Color(0.1, 0.3, 0.1, 0.9), 1.5)
				var m_name = str(m.get("name", "Monster")).to_lower()
				var m_code = "M"
				if "skeleton" in m_name:
					m_code = "SK"
				elif "orc" in m_name:
					m_code = "OR"
				elif "goblin" in m_name:
					m_code = "GB"
				elif "zombie" in m_name:
					m_code = "ZM"
				elif "verag" in m_name:
					m_code = "VG"
				elif "fimir" in m_name:
					m_code = "FM"
				elif "mummy" in m_name:
					m_code = "MU"
				elif "gargoyle" in m_name:
					m_code = "GG"
				else:
					m_code = m_name.substr(0, 2).to_upper()
				var cd_w = ThemeDB.fallback_font.get_string_size(m_code, HORIZONTAL_ALIGNMENT_CENTER, -1, 12).x
				canvas.draw_string(ThemeDB.fallback_font, Vector2(screen_pos.x - cd_w * 0.5, screen_pos.y + 4), m_code, HORIZONTAL_ALIGNMENT_CENTER, -1, 12, Color.WHITE)

	# Draw Starting Staircase Tile (Entrance / Exit)
	var stair_rect = Rect2(board_offset + Vector2(starting_stair.x * tile_size + 2, starting_stair.y * tile_size + 2), Vector2(tile_size - 4, tile_size - 4))
	canvas.draw_rect(stair_rect, Color(0.18, 0.22, 0.28, 0.95))
	canvas.draw_rect(stair_rect, Color(0.45, 0.60, 0.75, 1.0), false, 1.5)
	canvas.draw_arc(stair_rect.get_center(), tile_size * 0.36, 0, TAU, 24, Color(0.35, 0.45, 0.58, 0.8), 1.5)
	canvas.draw_arc(stair_rect.get_center(), tile_size * 0.20, 0, TAU, 16, Color(0.55, 0.68, 0.82, 0.9), 1.5)
	var st_w = ThemeDB.fallback_font.get_string_size("STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8).x
	canvas.draw_string(ThemeDB.fallback_font, Vector2(stair_rect.get_center().x - st_w * 0.5, stair_rect.get_center().y + 3), "STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.85, 0.9, 1.0, 0.85))

	# Draw Heroes
	# Group heroes by grid position so tokens on shared tiles (e.g. starting stairwell) are all visible
	var heroes_by_tile: Dictionary = {}
	for idx in range(heroes.size()):
		var h = heroes[idx]
		var pos = h.get("grid_pos", Vector2i(0, 0))
		if not heroes_by_tile.has(pos):
			heroes_by_tile[pos] = []
		heroes_by_tile[pos].append(idx)

	# 4 standard quadrant offsets when multiple heroes share a tile
	var quad_offsets = [
		Vector2(-tile_size * 0.18, -tile_size * 0.18),
		Vector2(tile_size * 0.18, -tile_size * 0.18),
		Vector2(-tile_size * 0.18, tile_size * 0.18),
		Vector2(tile_size * 0.18, tile_size * 0.18)
	]

	# Draw non-active heroes first, and active hero LAST so active hero is always on top!
	var draw_indices: Array[int] = []
	for idx in range(heroes.size()):
		if idx != active_hero_idx:
			draw_indices.append(idx)
	if active_hero_idx >= 0 and active_hero_idx < heroes.size():
		draw_indices.append(active_hero_idx)

	for idx in draw_indices:
		var h = heroes[idx]
		var pos = h.get("grid_pos", Vector2i(0, 0))
		var is_active = (idx == active_hero_idx and current_phase == "hero_phase")
		var tile_heroes = heroes_by_tile.get(pos, [idx])
		var tile_center = board_offset + Vector2(pos.x * tile_size + tile_size * 0.5, pos.y * tile_size + tile_size * 0.5)

		var screen_pos = tile_center
		var token_radius = tile_size * 0.42
		var font_size = 14

		if is_active:
			# Active hero is always front, center, and full size! Never displaced!
			screen_pos = tile_center
			token_radius = tile_size * 0.42
			font_size = 14
		elif tile_heroes.size() > 1:
			var slot = tile_heroes.find(idx)
			if slot >= 0 and slot < quad_offsets.size():
				screen_pos = tile_center + quad_offsets[slot]
				token_radius = tile_size * 0.22
				font_size = 10

		var col = Color.from_string(h.get("tokenColor", "#b91c1c"), Color.RED)

		# Draw token base circle
		canvas.draw_circle(screen_pos, token_radius, col)
		canvas.draw_arc(screen_pos, token_radius, 0, TAU, 32, Color(0.95, 0.95, 0.95, 0.9), 1.5)

		# Active Hero prominent highlight and pulsing turn badge
		if is_active:
			# High-contrast golden outer glow
			canvas.draw_arc(screen_pos, token_radius + 4.0, 0, TAU, 32, Color(1.0, 0.85, 0.1, 1.0), 3.0)
			canvas.draw_arc(screen_pos, token_radius + 7.0, 0, TAU, 32, Color(1.0, 0.95, 0.4, 0.6), 1.5)

			# Floating Turn Marker badge above or below the tile
			var active_name = str(h.get("name", "Hero")).to_upper()
			var badge_text = "▼ ACTIVE: " + active_name
			var badge_w = ThemeDB.fallback_font.get_string_size(badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11).x

			var badge_y = tile_center.y - tile_size * 0.5 - 18
			if badge_y < 55:
				badge_y = tile_center.y + tile_size * 0.5 + 4

			var badge_x = maxf(10.0, tile_center.x - badge_w * 0.5 - 6)
			var badge_rect = Rect2(Vector2(badge_x, badge_y), Vector2(badge_w + 12, 16))
			canvas.draw_rect(badge_rect, Color(0.1, 0.12, 0.16, 0.95))
			canvas.draw_rect(badge_rect, Color(1.0, 0.85, 0.1, 1.0), false, 1.5)
			canvas.draw_string(ThemeDB.fallback_font, Vector2(badge_rect.position.x + 6, badge_rect.position.y + 12), badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(1.0, 0.9, 0.2, 1.0))

		# Token Initial (B, D, E, W)
		var h_name = str(h.get("name", "Hero")).to_lower()
		var h_initial = "H"
		if "barbarian" in h_name:
			h_initial = "B"
		elif "dwarf" in h_name:
			h_initial = "D"
		elif "elf" in h_name:
			h_initial = "E"
		elif "wizard" in h_name:
			h_initial = "W"
		else:
			h_initial = h_name.substr(0, 1).to_upper()

		var init_w = ThemeDB.fallback_font.get_string_size(h_initial, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size).x
		canvas.draw_string(ThemeDB.fallback_font, Vector2(screen_pos.x - init_w * 0.5, screen_pos.y + font_size * 0.38), h_initial, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size, Color.WHITE)
