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
var discovered_monster_ids: Dictionary = {}
var grid_cols: int = GRID_COLS
var grid_rows: int = GRID_ROWS
var starting_stair: Vector2i = Vector2i(1, 1)
var tile_size: float = TILE_SIZE
var board_offset: Vector2 = BOARD_OFFSET

var active_vfx: Array[Dictionary] = []
var floating_texts: Array[Dictionary] = []
var active_dice_animation: Dictionary = {}
var last_spell_result: Dictionary = {}
var last_combat_result: Dictionary = {}

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
@onready var hero_cards_grid: GridContainer = get_node_or_null("UI/StatsPanel/HeroCardsGrid")
@onready var enemies_panel: Panel = get_node_or_null("UI/EnemiesPanel")
@onready var enemies_header_label: Label = get_node_or_null("UI/EnemiesPanel/HeaderLabel")
@onready var enemies_empty_label: Label = get_node_or_null("UI/EnemiesPanel/EmptyLabel")
@onready var enemy_cards_grid: GridContainer = get_node_or_null("UI/EnemiesPanel/ScrollContainer/EnemyCardsGrid")
@onready var dice_label: Label = $UI/DicePanel/DiceLabel
@onready var btn_roll: Button = $UI/Actions/BtnRoll
@onready var btn_attack: Button = $UI/Actions/BtnAttack
@onready var btn_search: Button = $UI/Actions/BtnSearch
@onready var btn_end_turn: Button = $UI/Actions/BtnEndTurn
@onready var btn_summon: Button = $UI/Actions/BtnSummon
@onready var btn_ai_step: Button = $UI/Actions/BtnAIStep

@onready var ai_confirm_modal: ColorRect = $UI/AIConfirmModal
@onready var ai_modal_card: PanelContainer = $UI/AIConfirmModal/Card
@onready var ai_modal_step_badge: Label = $UI/AIConfirmModal/Card/Margin/VBox/Header/StepBadge
@onready var ai_modal_cmd_banner: PanelContainer = $UI/AIConfirmModal/Card/Margin/VBox/CommandBanner
@onready var ai_modal_cmd_text: Label = $UI/AIConfirmModal/Card/Margin/VBox/CommandBanner/CommandMargin/CommandText
@onready var ai_modal_action_title: Label = $UI/AIConfirmModal/Card/Margin/VBox/ActionTitle
@onready var ai_modal_action_desc: Label = $UI/AIConfirmModal/Card/Margin/VBox/ActionDescription
@onready var ai_modal_details_panel: PanelContainer = $UI/AIConfirmModal/Card/Margin/VBox/DetailsPanel
@onready var ai_modal_details_text: Label = $UI/AIConfirmModal/Card/Margin/VBox/DetailsPanel/DetailsMargin/DetailsText
@onready var btn_ai_confirm: Button = $UI/AIConfirmModal/Card/Margin/VBox/ButtonBox/BtnConfirm
@onready var btn_ai_cancel: Button = $UI/AIConfirmModal/Card/Margin/VBox/ButtonBox/BtnCancel

var is_ai_step_pending: bool = false
var pending_ai_command: Dictionary = {}

func _ready() -> void:
	print("🛡️ [TabletopWorld] Initializing HeroQuest Cartridge Player...")
	_check_cli_role()
	_update_board_metrics()
	_load_active_cartridge()
	CartridgeManager.cartridge_inserted.connect(_on_cartridge_inserted)
	_setup_ui_signals()
	_setup_ai_modal_styles()
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
	if btn_ai_step and not btn_ai_step.pressed.is_connected(propose_ai_step):
		btn_ai_step.pressed.connect(propose_ai_step)
	if btn_ai_confirm and not btn_ai_confirm.pressed.is_connected(confirm_and_execute_ai_step):
		btn_ai_confirm.pressed.connect(confirm_and_execute_ai_step)
	if btn_ai_cancel and not btn_ai_cancel.pressed.is_connected(cancel_ai_step):
		btn_ai_cancel.pressed.connect(cancel_ai_step)

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
	var h_idx = 0
	for h_id in cart_heroes:
		var h = cart_heroes[h_id].duplicate(true)
		h["current_bp"] = h.get("bodyPoints", 8)
		h["current_mp"] = h.get("mindPoints", 2)
		h["gold"] = 0

		# Standard HeroQuest Loadouts
		match str(h.get("id")):
			"barbarian":
				h["equipped_weapon"] = "broadsword"
				h["equipped_armor"] = []
				h["inventory"] = ["broadsword"]
				h["spells"] = []
			"dwarf":
				h["equipped_weapon"] = "shortsword"
				h["equipped_armor"] = []
				h["inventory"] = ["shortsword"]
				h["spells"] = []
			"elf":
				h["equipped_weapon"] = "shortsword"
				h["equipped_armor"] = []
				h["inventory"] = ["shortsword"]
				h["spells"] = ["genie", "swift_wind", "tempest"]
			"wizard":
				h["equipped_weapon"] = "dagger"
				h["equipped_armor"] = []
				h["inventory"] = ["dagger", "staff"]
				h["spells"] = [
					"ball_of_flame", "fire_of_wrath", "courage",
					"rock_skin", "heal_body", "pass_through_rock",
					"water_of_healing", "sleep", "veil_of_mist"
				]
			_:
				h["equipped_weapon"] = "broadsword"
				h["equipped_armor"] = []
				h["inventory"] = ["broadsword"]
				h["spells"] = []

		h["courage_active"] = false
		h["rock_skin_active"] = false
		h["pass_through_rock_active"] = false
		h["veil_of_mist_active"] = false
		h["swift_wind_active"] = false

		if h_idx == 0:
			# The active starting hero begins on the board at the spiral staircase
			h["is_on_board"] = true
			h["grid_pos"] = starting_stair
		else:
			# Other heroes remain OFF the board until their first turn arrives
			h["is_on_board"] = false
			h["grid_pos"] = Vector2i(-1, -1)
		heroes.append(h)
		h_idx += 1

	var cart_monsters = cart.get("monsters", {})
	monsters.clear()
	for m_id in cart_monsters:
		var m = cart_monsters[m_id].duplicate(true)
		m["current_bp"] = m.get("bodyPoints", 1)
		var pos = m.get("position", [12, 9])
		m["grid_pos"] = Vector2i(pos[0], pos[1])
		m["is_alive"] = true
		m["is_sleeping"] = false
		m["tempest_stunned"] = false
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
	discovered_monster_ids.clear()
	if is_gm_role():
		for m in monsters:
			discovered_monster_ids[str(m.get("id"))] = true
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

func is_border_tile(tile: Vector2i) -> bool:
	return tile.x <= 0 or tile.x >= grid_cols - 1 or tile.y <= 0 or tile.y >= grid_rows - 1

# --- HeroQuest Miniature Occupancy Rules ---
func get_hero_at(tile: Vector2i) -> Dictionary:
	for h in heroes:
		if h.get("is_on_board", false) and h.get("current_bp", 0) > 0 and h.get("grid_pos") == tile:
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
		if h.get("is_on_board", false) and h.get("current_bp", 0) > 0 and h.get("grid_pos") == tile:
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
		if h.get("is_on_board", false) and h.get("current_bp", 1) > 0:
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

	# Check for any monsters newly brought into line of sight
	for m in monsters:
		if is_monster_currently_visible(m):
			discovered_monster_ids[str(m.get("id"))] = true

func is_monster_currently_visible(m: Dictionary) -> bool:
	if is_gm_role():
		return true

	var r_id = str(m.get("roomId", ""))
	var pos = m.get("grid_pos", Vector2i(-1, -1))
	var rm = _get_room_at(pos)
	var effective_room = r_id if r_id != "" else str(rm.get("id", ""))
	if effective_room != "":
		return revealed_rooms.has(effective_room)

	# Corridor monster: must have line of sight from at least one living hero on the board
	for h in heroes:
		if h.get("is_on_board", false) and int(h.get("current_bp", 1)) > 0:
			var h_pos = h.get("grid_pos", Vector2i(-1, -1))
			if has_line_of_sight(h_pos, pos):
				return true

	return false

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

	# Discover and log any monsters residing in this newly revealed chamber
	var found_m: Array[String] = []
	for m in monsters:
		var pos = m.get("grid_pos", Vector2i(0, 0))
		var rm = _get_room_at(pos)
		var m_room = str(m.get("roomId", ""))
		var eff_room = m_room if m_room != "" else str(rm.get("id", ""))
		if eff_room == r_id:
			discovered_monster_ids[str(m.get("id"))] = true
			if m.get("is_alive", false):
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

	var needs_redraw = false
	if active_vfx.size() > 0:
		var remaining_vfx: Array[Dictionary] = []
		for vfx in active_vfx:
			vfx["time"] = float(vfx.get("time", 0.0)) + delta
			if vfx["time"] < float(vfx.get("duration", 0.5)):
				remaining_vfx.append(vfx)
			else:
				var on_comp = str(vfx.get("on_complete", ""))
				if on_comp == "fire_burst":
					spawn_burst_vfx(vfx.get("to", Vector2.ZERO), Color(0.95, 0.4, 0.1), 48.0, 0.4)
				elif on_comp == "genie_burst":
					spawn_burst_vfx(vfx.get("to", Vector2.ZERO), Color(0.1, 0.7, 0.9), 60.0, 0.5)
		active_vfx = remaining_vfx
		needs_redraw = true

	if floating_texts.size() > 0:
		var remaining_texts: Array[Dictionary] = []
		for ft in floating_texts:
			ft["time"] = float(ft.get("time", 0.0)) + delta
			var dur = float(ft.get("duration", 1.0))
			if ft["time"] < dur:
				var vel = ft.get("vel", Vector2(0, -35))
				ft["pos"] = ft.get("pos", Vector2.ZERO) + vel * delta
				ft["alpha"] = clampf(1.0 - (ft["time"] / dur), 0.0, 1.0)
				remaining_texts.append(ft)
		floating_texts = remaining_texts
		needs_redraw = true

	if not active_dice_animation.is_empty():
		var t = float(active_dice_animation.get("time", 0.0)) + delta
		active_dice_animation["time"] = t
		var roll_dur = float(active_dice_animation.get("roll_duration", 0.8))
		var tot_dur = float(active_dice_animation.get("total_duration", 2.2))
		
		if t >= tot_dur:
			active_dice_animation = {}
		else:
			var progress = clampf(t / roll_dur, 0.0, 1.0)
			var is_settled = (progress >= 1.0)
			active_dice_animation["settled"] = is_settled
			
			for die in active_dice_animation.get("dice", []):
				if not is_settled:
					# Rolling & tumbling phase
					var p_ease = ease(progress, -2.0)
					var t_pos = die.get("target_pos", Vector2.ZERO)
					var i_pos = die.get("init_pos", t_pos)
					die["pos"] = i_pos.lerp(t_pos, p_ease)
					var bounces = float(die.get("bounces", 2.5))
					var max_z = float(die.get("z", 40.0))
					var bounce_h = maxf(0.0, sin(progress * PI * bounces) * max_z * (1.0 - progress))
					die["current_z"] = bounce_h
					var spin = float(die.get("spin_speed", 10.0))
					die["angle"] = spin * (1.0 - progress) * (1.0 - progress)
					if fmod(t, 0.06) < delta * 1.5:
						if die.get("type") == "movement_red":
							die["current_face"] = randi_range(1, 6)
						else:
							die["current_face"] = ["skull", "white_shield", "black_shield"][randi() % 3]
				else:
					die["settled"] = true
					die["pos"] = die.get("target_pos", Vector2.ZERO)
					die["current_z"] = 0.0
					die["angle"] = 0.0
					if die.get("type") == "movement_red":
						die["current_face"] = die.get("final_value", 1)
					else:
						die["current_face"] = die.get("final_face", "skull")
		needs_redraw = true

func _setup_ai_modal_styles() -> void:
	if not ai_modal_card:
		return
	var card_sb = StyleBoxFlat.new()
	card_sb.bg_color = Color(0.09, 0.12, 0.17, 0.98)
	card_sb.set_corner_radius_all(12)
	card_sb.border_width_left = 2
	card_sb.border_width_top = 2
	card_sb.border_width_right = 2
	card_sb.border_width_bottom = 2
	card_sb.border_color = Color(0.0, 0.74, 0.83, 0.8)
	card_sb.shadow_color = Color(0, 0, 0, 0.75)
	card_sb.shadow_size = 20
	ai_modal_card.add_theme_stylebox_override("panel", card_sb)

	if ai_modal_cmd_banner:
		var cmd_sb = StyleBoxFlat.new()
		cmd_sb.bg_color = Color(0.05, 0.07, 0.11, 1.0)
		cmd_sb.set_corner_radius_all(6)
		cmd_sb.border_width_left = 4
		cmd_sb.border_color = Color(0.0, 0.74, 0.83, 0.9)
		ai_modal_cmd_banner.add_theme_stylebox_override("panel", cmd_sb)

	if ai_modal_details_panel:
		var det_sb = StyleBoxFlat.new()
		det_sb.bg_color = Color(0.06, 0.08, 0.12, 0.9)
		det_sb.set_corner_radius_all(6)
		det_sb.border_width_left = 1
		det_sb.border_width_top = 1
		det_sb.border_width_right = 1
		det_sb.border_width_bottom = 1
		det_sb.border_color = Color(0.25, 0.3, 0.4, 0.6)
		ai_modal_details_panel.add_theme_stylebox_override("panel", det_sb)

	if btn_ai_confirm:
		var conf_sb = StyleBoxFlat.new()
		conf_sb.bg_color = Color(0.06, 0.45, 0.28, 1.0)
		conf_sb.set_corner_radius_all(6)
		conf_sb.border_width_left = 1
		conf_sb.border_width_top = 1
		conf_sb.border_width_right = 1
		conf_sb.border_width_bottom = 1
		conf_sb.border_color = Color(0.1, 0.7, 0.4, 1.0)
		btn_ai_confirm.add_theme_stylebox_override("normal", conf_sb)

	if btn_ai_cancel:
		var canc_sb = StyleBoxFlat.new()
		canc_sb.bg_color = Color(0.18, 0.22, 0.28, 1.0)
		canc_sb.set_corner_radius_all(6)
		canc_sb.border_width_left = 1
		canc_sb.border_width_top = 1
		canc_sb.border_width_right = 1
		canc_sb.border_width_bottom = 1
		canc_sb.border_color = Color(0.35, 0.4, 0.48, 0.8)
		btn_ai_cancel.add_theme_stylebox_override("normal", canc_sb)

func get_next_ai_step_command() -> Dictionary:
	var next_step = auto_play_step + 1
	var hero = get_active_hero()
	var h_name = str(hero.get("name", "Hero"))
	var h_id = str(hero.get("id", "barbarian"))

	match next_step:
		1:
			return {
				"step": 1,
				"max_steps": 10,
				"action": "roll_movement",
				"command": "roll_movement_dice",
				"hero": h_name,
				"title": "🎲 %s Rolls 2d6 Movement Dice" % h_name,
				"action_name": "Roll Movement",
				"description": "%s rolls two red acrylic dice to determine available movement squares for this turn." % h_name,
				"parameters": {
					"action": "roll_movement_dice",
					"dice": "2d6",
					"hero": h_id
				},
				"rationale": "At the start of the turn, the active hero must roll movement dice before traversing dungeon corridors."
			}
		2:
			var target = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			return {
				"step": 2,
				"max_steps": 10,
				"action": "move",
				"command": "move_hero",
				"hero": h_name,
				"title": "👣 Advance Along Corridor to (%d, %d)" % [target.x, target.y],
				"action_name": "Move Hero",
				"description": "%s advances through the corridor toward the heavy wooden crypt door at (%d, %d)." % [h_name, target.x, target.y],
				"parameters": {
					"action": "move_hero",
					"destination": [target.x, target.y],
					"hero": h_id
				},
				"rationale": "Moving adjacent to the crypt door allows the hero to inspect and kick it open."
			}
		3:
			var door_from = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			var door_to = Vector2i(4, 2) if starting_stair == Vector2i(0, 1) else Vector2i(2, 1)
			return {
				"step": 3,
				"max_steps": 10,
				"action": "open_door",
				"command": "open_door",
				"hero": h_name,
				"title": "🚪 Kick Open Crypt Door (%d, %d) ➔ (%d, %d)" % [door_from.x, door_from.y, door_to.x, door_to.y],
				"action_name": "Open Door",
				"description": "%s kicks open the reinforced dungeon door, lifting the Fog of War and revealing the Northwest Crypt." % h_name,
				"parameters": {
					"action": "open_door",
					"from": [door_from.x, door_from.y],
					"to": [door_to.x, door_to.y]
				},
				"rationale": "Opening doors reveals interior rooms and exposes lurking enemy monsters."
			}
		4:
			var room_target = Vector2i(4, 3) if starting_stair == Vector2i(0, 1) else Vector2i(2, 2)
			return {
				"step": 4,
				"max_steps": 10,
				"action": "move",
				"command": "move_hero",
				"hero": h_name,
				"title": "👣 Enter Northwest Crypt at (%d, %d)" % [room_target.x, room_target.y],
				"action_name": "Move Into Room",
				"description": "%s strides through the doorway into the crypt chamber to engage the spotted skeletons." % h_name,
				"parameters": {
					"action": "move_hero",
					"destination": [room_target.x, room_target.y],
					"hero": h_id
				},
				"rationale": "Positioning adjacent to enemy skeletons enables melee weapon strikes."
			}
		5:
			return {
				"step": 5,
				"max_steps": 10,
				"action": "attack",
				"command": "attack_adjacent_monster",
				"hero": h_name,
				"title": "⚔️ Attack Crypt Skeleton with Broadsword",
				"action_name": "Melee Attack",
				"description": "%s swings Broadsword at adjacent Crypt Skeleton rolling combat dice (Skulls vs Black Shields)." % h_name,
				"parameters": {
					"action": "attack_adjacent_monster",
					"weapon": "broadsword",
					"target": "mon-skel-1"
				},
				"rationale": "Melee strike deals combat wounds and neutralizes dungeon threats."
			}
		6:
			return {
				"step": 6,
				"max_steps": 10,
				"action": "end_turn",
				"command": "end_turn",
				"hero": h_name,
				"title": "⏭️ Conclude Barbarian Turn & Handover to Dwarf",
				"action_name": "End Turn",
				"description": "%s concludes their turn. Active turn control advances to Dwarf at the dungeon stair." % h_name,
				"parameters": {
					"action": "end_turn",
					"current_hero": h_id,
					"next_hero": "dwarf"
				},
				"rationale": "Finishing turn allows next party member to enter and act."
			}
		7:
			var dwarf_pos = Vector2i(3, 3) if starting_stair == Vector2i(0, 1) else Vector2i(3, 1)
			return {
				"step": 7,
				"max_steps": 10,
				"action": "roll_and_move",
				"command": "roll_and_move",
				"hero": "Dwarf",
				"title": "🎲 Advance Dwarf into Crypt at (%d, %d)" % [dwarf_pos.x, dwarf_pos.y],
				"action_name": "Roll & Move",
				"description": "Dwarf rolls movement dice and advances into the crypt to support Barbarian.",
				"parameters": {
					"action": "roll_movement_and_move",
					"destination": [dwarf_pos.x, dwarf_pos.y],
					"hero": "dwarf"
				},
				"rationale": "Dwarf brings backup into the crypt chamber to assist in clearing threats."
			}
		8:
			return {
				"step": 8,
				"max_steps": 10,
				"action": "search",
				"command": "search_room",
				"hero": "Dwarf",
				"title": "🔍 Search Crypt for Treasure & Hidden Traps",
				"action_name": "Search Room",
				"description": "Dwarf searches the crypt chamber for gold coins, hidden loot chests, and traps.",
				"parameters": {
					"action": "search_room",
					"hero": "dwarf"
				},
				"rationale": "Searching explored chambers yields gold and rewards the party."
			}
		9:
			return {
				"step": 9,
				"max_steps": 10,
				"action": "monster_turn",
				"command": "ai_monster_turn",
				"hero": "Game Master (Zargon)",
				"title": "👑 Conclude Hero Phase & Begin Zargon AI Phase",
				"action_name": "Game Master Turn",
				"description": "All heroes finish their turns. Zargon AI activates surviving dungeon monsters for tactical counterattacks.",
				"parameters": {
					"action": "ai_monster_turn",
					"phase": "gm_phase"
				},
				"rationale": "Monsters take their turn after heroes conclude their actions."
			}
		10:
			return {
				"step": 10,
				"max_steps": 10,
				"action": "conclude_auto_play",
				"command": "conclude_auto_play",
				"hero": "System",
				"title": "🏁 Conclude Auto-Play & Begin Round 2",
				"action_name": "Finish Auto-Play",
				"description": "Completes the 10-step autonomous gameplay demonstration and transitions to active free-play mode.",
				"parameters": {
					"action": "conclude_auto_play"
				},
				"rationale": "Full turn cycle and tactical mechanics verified."
			}
		_:
			var cmd_name = "end_turn"
			var act_title = "⏭️ End Turn"
			var act_desc = "%s ends their turn." % h_name
			if turn_state == "awaiting_roll":
				cmd_name = "roll_movement_dice"
				act_title = "🎲 Roll Movement Dice"
				act_desc = "%s rolls 2d6 movement dice." % h_name
			elif get_adjacent_monsters().size() > 0 and not has_acted_this_turn:
				cmd_name = "attack_adjacent_monster"
				act_title = "⚔️ Attack Adjacent Monster"
				act_desc = "%s attacks adjacent monster." % h_name
			elif get_adjacent_closed_doors().size() > 0:
				cmd_name = "open_door"
				act_title = "🚪 Open Adjacent Door"
				act_desc = "%s opens adjacent door." % h_name
			elif can_search_room():
				cmd_name = "search_room"
				act_title = "🔍 Search Room"
				act_desc = "%s searches room for treasure." % h_name

			return {
				"step": next_step,
				"max_steps": next_step,
				"action": cmd_name,
				"command": cmd_name,
				"hero": h_name,
				"title": act_title,
				"action_name": act_title,
				"description": act_desc,
				"parameters": { "action": cmd_name, "hero": h_id },
				"rationale": "Dynamic AI behavior based on tactical situation."
			}

func propose_ai_step() -> Dictionary:
	var cmd_info = get_next_ai_step_command()
	pending_ai_command = cmd_info
	is_ai_step_pending = true

	if ai_modal_step_badge:
		ai_modal_step_badge.text = "STEP %d OF %d" % [int(cmd_info.get("step", 1)), int(cmd_info.get("max_steps", 10))]
	if ai_modal_cmd_text:
		ai_modal_cmd_text.text = "Command: %s" % str(cmd_info.get("command", ""))
	if ai_modal_action_title:
		ai_modal_action_title.text = str(cmd_info.get("title", ""))
	if ai_modal_action_desc:
		ai_modal_action_desc.text = str(cmd_info.get("description", ""))
	if ai_modal_details_text:
		var params_str = ""
		var p_dict: Dictionary = cmd_info.get("parameters", {})
		for k in p_dict.keys():
			params_str += "• %s: %s\n" % [str(k), str(p_dict[k])]
		ai_modal_details_text.text = "• Hero: %s\n• Action: %s\n%s• Rationale: %s" % [
			str(cmd_info.get("hero", "")),
			str(cmd_info.get("action_name", "")),
			params_str,
			str(cmd_info.get("rationale", ""))
		]

	if ai_confirm_modal:
		ai_confirm_modal.visible = true

	_log("🤖 [AI Step Proposal] Step %d: %s (Command: %s). Awaiting user confirmation..." % [
		int(cmd_info.get("step", 1)),
		str(cmd_info.get("title", "")),
		str(cmd_info.get("command", ""))
	])
	return { "success": true, "pending": true, "proposal": cmd_info }

func confirm_and_execute_ai_step() -> Dictionary:
	if not is_ai_step_pending and pending_ai_command.is_empty():
		propose_ai_step()

	var executed_cmd = pending_ai_command.duplicate(true)
	is_ai_step_pending = false
	if ai_confirm_modal:
		ai_confirm_modal.visible = false

	_log("⚡ [AI Step Confirmed] Executing Step %d: %s" % [
		int(executed_cmd.get("step", auto_play_step + 1)),
		str(executed_cmd.get("title", ""))
	])
	_execute_auto_play_step()
	pending_ai_command = {}
	return { "success": true, "executed": true, "step": auto_play_step, "command": executed_cmd }

func cancel_ai_step() -> Dictionary:
	var cancelled_step = int(pending_ai_command.get("step", auto_play_step + 1))
	is_ai_step_pending = false
	pending_ai_command = {}
	if ai_confirm_modal:
		ai_confirm_modal.visible = false
	_log("❌ [AI Step Cancelled] Proposal for Step %d cancelled by user." % cancelled_step)
	return { "success": true, "cancelled": true, "step": cancelled_step }

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
	if is_ai_step_pending:
		if event is InputEventKey and event.pressed:
			if event.keycode == KEY_ESCAPE:
				cancel_ai_step()
				get_viewport().set_input_as_handled()
				return
			elif event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
				confirm_and_execute_ai_step()
				get_viewport().set_input_as_handled()
				return
		return

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
	var hero = get_active_hero()
	var armors: Array = hero.get("equipped_armor", [])
	var has_plate = armors.has("plate_mail")
	var is_swift = hero.get("swift_wind_active", false)
	var roll = {}
	var dice_vals: Array = []

	if has_plate:
		var d1 = randi_range(1, 6)
		roll = { "total": d1, "d1": d1, "d2": 0, "plate_mail": true }
		dice_vals = [d1]
		_log("🎲 %s wears Plate Mail: movement restricted to 1d6: [%d] = %d squares!" % [
			hero.get("name", "Hero"), d1, d1
		])
	elif is_swift:
		var r1 = TabletopDice.roll_movement()
		var r2 = TabletopDice.roll_movement()
		var total = r1.total + r2.total
		roll = { "total": total, "d1": r1.total, "d2": r2.total, "swift_wind": true }
		dice_vals = [r1.d1, r1.d2, r2.d1, r2.d2]
		hero["swift_wind_active"] = false
		_log("💨 Swift Wind carries %s forward at double speed: 4d6 = %d squares!" % [
			hero.get("name", "Hero"), total
		])
	else:
		roll = TabletopDice.roll_movement()
		dice_vals = [roll.d1, roll.d2]
		_log("🎲 %s rolled 2d6 movement: [%d, %d] = %d squares!" % [
			hero.get("name", "Hero"), roll.d1, roll.d2, roll.total
		])

	movement_remaining = roll.total
	movement_rolled = true
	turn_state = "moving"
	trigger_movement_dice_roll(roll, str(hero.get("name", "Hero")), dice_vals)
	_update_ui()
	queue_redraw_all()
	return roll

func find_path(start: Vector2i, goal: Vector2i, moving_hero_idx: int = -1) -> Array[Vector2i]:
	if start == goal:
		return [start]
	# Rule 1: No sharing squares! Characters cannot finish their turn on a square occupied by another model.
	if is_tile_occupied(goal, moving_hero_idx):
		return []

	var pass_rock = false
	var veil_mist = false
	if moving_hero_idx >= 0 and moving_hero_idx < heroes.size():
		pass_rock = heroes[moving_hero_idx].get("pass_through_rock_active", false)
		veil_mist = heroes[moving_hero_idx].get("veil_of_mist_active", false)

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
			if not pass_rock:
				if has_wall_between(cur, nxt) or is_tile_wall_blocked(nxt):
					continue
				var rm = _get_room_at(nxt)
				var rm_id = str(rm.get("id", ""))
				if rm_id != "" and not revealed_rooms.has(rm_id):
					continue
			# Rule 2: Heroes generally cannot move through squares occupied by monsters unless Veil of Mist is active
			if not veil_mist and is_tile_occupied_by_monster(nxt):
				continue
			# Rule 3: Heroes CAN pass through friendly heroes, but cannot end on them
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

	if hero.get("pass_through_rock_active", false):
		hero["pass_through_rock_active"] = false
		_log("👻 Pass Through Rock fades away as %s materializes in solid space." % hero.get("name"))
	if hero.get("veil_of_mist_active", false):
		hero["veil_of_mist_active"] = false
		_log("🌫️ The Veil of Mist dissipates from around %s." % hero.get("name"))

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

# --- HeroQuest Combat & Equipment Calculations ---
func get_hero_attack_dice(h: Dictionary) -> int:
	var w_id = str(h.get("equipped_weapon", ""))
	var w = HeroQuestEquipment.get_weapon(w_id)
	var base_atk = int(w.get("attack_dice", h.get("attackDice", 1)))
	if h.get("courage_active", false):
		base_atk += 2
	return base_atk

func get_hero_defend_dice(h: Dictionary) -> int:
	var armors: Array = h.get("equipped_armor", [])
	var base_def = 2
	if armors.has("plate_mail"):
		base_def = 4
	elif armors.has("chain_mail"):
		base_def = 3
	else:
		base_def = int(h.get("defendDice", 2))

	if armors.has("helmet"):
		base_def += 1
	if armors.has("shield"):
		base_def += 1
	if h.get("rock_skin_active", false):
		base_def += 1

	return base_def

func equip_item(hero_id: String, item_id: String) -> Dictionary:
	var hero: Dictionary = {}
	for h in heroes:
		if h.get("id") == hero_id:
			hero = h
			break
	if hero.is_empty():
		return { "success": false, "error": "Hero not found: " + hero_id }

	var can_res = HeroQuestEquipment.can_hero_equip(hero_id, item_id)
	if not can_res.get("can_equip", false):
		_log("❌ %s" % can_res.get("reason", "Cannot equip"))
		return { "success": false, "error": can_res.get("reason") }

	var w = HeroQuestEquipment.get_weapon(item_id)
	if not w.is_empty():
		var armors: Array = hero.get("equipped_armor", [])
		if w.get("two_handed", false) and armors.has("shield"):
			_log("❌ Cannot equip two-handed weapon %s while wielding a Shield!" % w.get("name"))
			return { "success": false, "error": "Cannot equip two-handed weapon while wielding a Shield" }
		hero["equipped_weapon"] = item_id
		var inv: Array = hero.get("inventory", [])
		if not inv.has(item_id):
			inv.append(item_id)
			hero["inventory"] = inv
		_log("⚔️ %s equipped %s (Attack Dice: %d)!" % [hero.get("name"), w.get("name"), get_hero_attack_dice(hero)])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "equipped": item_id, "attackDice": get_hero_attack_dice(hero) }

	var a = HeroQuestEquipment.get_armor(item_id)
	if not a.is_empty():
		var slot = str(a.get("slot", "body"))
		var armors: Array = hero.get("equipped_armor", [])
		if a.get("incompatible_with_two_handed", false):
			var cur_w = HeroQuestEquipment.get_weapon(hero.get("equipped_weapon", ""))
			if cur_w.get("two_handed", false):
				_log("❌ Cannot equip Shield while wielding two-handed %s!" % cur_w.get("name"))
				return { "success": false, "error": "Cannot equip Shield while wielding a two-handed weapon" }
		if slot == "body":
			armors.erase("chain_mail")
			armors.erase("plate_mail")
		if not armors.has(item_id):
			armors.append(item_id)
		hero["equipped_armor"] = armors
		var inv: Array = hero.get("inventory", [])
		if not inv.has(item_id):
			inv.append(item_id)
			hero["inventory"] = inv
		_log("🛡️ %s equipped %s (Defend Dice: %d)!" % [hero.get("name"), a.get("name"), get_hero_defend_dice(hero)])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "equipped": item_id, "defendDice": get_hero_defend_dice(hero) }

	return { "success": false, "error": "Unknown item: " + item_id }

func unequip_item(hero_id: String, item_id: String) -> Dictionary:
	var hero: Dictionary = {}
	for h in heroes:
		if h.get("id") == hero_id:
			hero = h
			break
	if hero.is_empty():
		return { "success": false, "error": "Hero not found: " + hero_id }

	if hero.get("equipped_weapon") == item_id:
		hero["equipped_weapon"] = "dagger" if hero.get("id") == "wizard" else "broadsword"
		_log("⚔️ %s unequipped weapon %s." % [hero.get("name"), item_id])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "unequipped": item_id }

	var armors: Array = hero.get("equipped_armor", [])
	if armors.has(item_id):
		armors.erase(item_id)
		hero["equipped_armor"] = armors
		_log("🛡️ %s unequipped armor %s." % [hero.get("name"), item_id])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "unequipped": item_id }

	return { "success": false, "error": "Item not equipped" }

# --- Hero & Monster Combat Resolution ---
func attack_adjacent_monster(monster_id: String = "", weapon_id: String = "") -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }

	if weapon_id != "":
		hero["equipped_weapon"] = weapon_id

	var cur_w_id = str(hero.get("equipped_weapon", "broadsword"))
	var w_def = HeroQuestEquipment.get_weapon(cur_w_id)
	var hero_pos = hero.get("grid_pos", Vector2i(-1, -1))

	var target_m: Dictionary = {}
	for m in monsters:
		if m.get("is_alive", false):
			if monster_id != "" and m.get("id") == monster_id:
				target_m = m
				break
			elif monster_id == "":
				var m_pos = m.get("grid_pos", Vector2i(-1, -1))
				var dx = absi(hero_pos.x - m_pos.x)
				var dy = absi(hero_pos.y - m_pos.y)
				if w_def.get("ranged", false):
					if not (dx <= 1 and dy <= 1) and has_line_of_sight(hero_pos, m_pos):
						target_m = m
						break
				elif w_def.get("diagonal", false):
					if dx <= 1 and dy <= 1 and (dx + dy > 0):
						target_m = m
						break
				else:
					if dx + dy == 1:
						target_m = m
						break

	if target_m.is_empty():
		_log("No monster in reach of %s!" % w_def.get("name", "weapon"))
		return { "success": false, "error": "No monster in weapon range" }

	var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
	var dx = absi(hero_pos.x - m_pos.x)
	var dy = absi(hero_pos.y - m_pos.y)

	# Validate weapon rules strictly
	if w_def.get("ranged", false):
		if cur_w_id == "crossbow":
			if dx <= 1 and dy <= 1:
				_log("❌ Crossbow cannot target adjacent monsters!")
				return { "success": false, "error": "Crossbow cannot target adjacent monsters" }
			if not has_line_of_sight(hero_pos, m_pos):
				_log("❌ No clear line of sight to target for Crossbow!")
				return { "success": false, "error": "No line of sight to target" }
			spawn_projectile_vfx(hero_pos, m_pos, Color(0.8, 0.7, 0.5), 0.3)
		elif cur_w_id == "dagger":
			if dx > 1 or dy > 1:
				if not has_line_of_sight(hero_pos, m_pos):
					_log("❌ No line of sight to throw Dagger!")
					return { "success": false, "error": "No line of sight to target" }
				spawn_projectile_vfx(hero_pos, m_pos, Color(0.85, 0.85, 0.95), 0.25)
				_log("🗡️ %s throws a dagger at %s!" % [hero.get("name"), target_m.get("name")])
	elif w_def.get("diagonal", false):
		if not (dx <= 1 and dy <= 1 and (dx + dy > 0)):
			_log("❌ Target is out of reach of %s!" % w_def.get("name"))
			return { "success": false, "error": "Target out of reach" }
		var center_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
		spawn_slash_vfx(center_screen, 0.785)
	else:
		if dx + dy != 1:
			_log("❌ %s cannot attack diagonally or at range!" % w_def.get("name", "Broadsword"))
			return { "success": false, "error": "Weapon requires orthogonal adjacency" }
		var center_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
		spawn_slash_vfx(center_screen, 0.0)

	var atk_dice = get_hero_attack_dice(hero)
	var def_dice = int(target_m.get("defendDice", 2))
	if target_m.get("is_sleeping", false):
		def_dice = 0

	var res = TabletopDice.resolve_combat(atk_dice, def_dice, false)
	trigger_combat_dice_roll(res, str(hero.get("name", "Hero")), str(target_m.get("name", "Monster")), false)
	_log("⚔️ %s attacks %s with %s (%d dice)! Rolled %d Skulls. %s defended with %d Black Shields." % [
		hero.get("name"), target_m.get("name"), w_def.get("name", "weapon"), atk_dice, res.total_skulls, target_m.get("name"), res.effective_shields
	])

	if res.wounds > 0:
		target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - res.wounds)
		_log("💥 Wounds inflicted: %d! %s HP: %d" % [res.wounds, target_m.get("name"), target_m.get("current_bp")])
		spawn_floating_text(m_pos, "-%d HP" % res.wounds, Color(0.95, 0.2, 0.2))
		if target_m.get("current_bp") <= 0:
			target_m["is_alive"] = false
			_log("💀 %s is DEFEATED!" % target_m.get("name"))
			spawn_floating_text(m_pos, "DEFEATED!", Color(1.0, 0.1, 0.1), 1.5)
	else:
		_log("🛡️ Attack was completely blocked by %s!" % target_m.get("name"))
		spawn_floating_text(m_pos, "BLOCKED!", Color(0.7, 0.8, 1.0))

	if cur_w_id == "dagger" and (dx > 1 or dy > 1):
		hero["equipped_weapon"] = "fists"

	has_acted_this_turn = true
	if movement_remaining == 0:
		turn_state = "turn_complete"
	else:
		turn_state = "action_taken"

	last_combat_result = res
	_update_ui()
	queue_redraw_all()
	return { "success": true, "result": res, "target": target_m.get("id"), "remaining_bp": target_m.get("current_bp") }

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
	var def_dice = get_hero_defend_dice(target_h)
	var h_pos = target_h.get("grid_pos", Vector2i(-1, -1))

	var res = TabletopDice.resolve_combat(atk_dice, def_dice, true)
	trigger_combat_dice_roll(res, str(monster.get("name", "Monster")), str(target_h.get("name", "Hero")), true)
	_log("👑 [Game Master] %s attacks %s! Rolled %d Skulls. %s rolled %d White Shields (Defend Dice: %d)." % [
		monster.get("name"), target_h.get("name"), res.total_skulls, target_h.get("name"), res.effective_shields, def_dice
	])

	if res.wounds > 0:
		target_h["current_bp"] = maxi(0, target_h.get("current_bp", 8) - res.wounds)
		_log("💥 %s takes %d wound(s)! Remaining HP: %d" % [target_h.get("name"), res.wounds, target_h.get("current_bp")])
		spawn_floating_text(h_pos, "-%d HP" % res.wounds, Color(0.95, 0.2, 0.2))
		if target_h.get("rock_skin_active", false):
			target_h["rock_skin_active"] = false
			_log("🪨 The wound shatters %s's Rock Skin spell!" % target_h.get("name"))
			spawn_floating_text(h_pos, "SHATTERED!", Color(0.8, 0.8, 0.8))
	else:
		_log("🛡️ %s successfully blocked the monster attack!" % target_h.get("name"))
		spawn_floating_text(h_pos, "BLOCKED!", Color(0.3, 0.8, 1.0))

	last_combat_result = res
	_update_ui()
	queue_redraw_all()
	return res

# --- HeroQuest Standard Spells System ---
func cast_spell(spell_id: String, target_id: String = "", target_pos: Vector2i = Vector2i(-1, -1)) -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero to cast spell" }

	var spell = HeroQuestSpells.get_spell(spell_id)
	if spell.is_empty():
		return { "success": false, "error": "Unknown spell: " + spell_id }

	var hero_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var hero_screen = board_offset + Vector2((hero_pos.x + 0.5) * tile_size, (hero_pos.y + 0.5) * tile_size)
	var spell_name = str(spell.get("name", spell_id))
	var s_id = str(spell.get("id"))

	_log("🔮 %s invokes the ancient incantation: [b]%s[/b]!" % [hero.get("name"), spell_name])
	var res: Dictionary = { "success": true, "spell": s_id, "name": spell_name }

	match s_id:
		"ball_of_flame":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Ball of Flame" }
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			spawn_projectile_vfx(hero_pos, m_pos, Color(1.0, 0.45, 0.1), 0.35, "fire_burst")
			var def = TabletopDice.roll_combat_dice(2)
			var shields = def.black_shields
			var wounds = maxi(0, 2 - shields)
			var c_res = {
				"attack": { "dice_count": 2, "faces": ["skull", "skull"], "skulls": 2 },
				"defense": def,
				"total_skulls": 2,
				"effective_shields": shields,
				"wounds": wounds
			}
			trigger_combat_dice_roll(c_res, "Ball of Flame", str(target_m.get("name", "Monster")), false)
			target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - wounds)
			_log("🔥 Ball of Flame engulfs %s! Rolled %d Black Shields. Wounds: %d (Remaining BP: %d)" % [
				target_m.get("name"), shields, wounds, target_m.get("current_bp")
			])
			if wounds > 0:
				spawn_floating_text(m_pos, "-%d HP" % wounds, Color(1.0, 0.3, 0.1))
			else:
				spawn_floating_text(m_pos, "BLOCKED!", Color(0.6, 0.8, 1.0))
			if target_m.get("current_bp") <= 0:
				target_m["is_alive"] = false
				_log("💀 %s is incinerated by the Ball of Flame!" % target_m.get("name"))
				spawn_floating_text(m_pos, "INCINERATED!", Color(1.0, 0.2, 0.1), 1.5)
			res["target"] = target_m.get("id")
			res["wounds"] = wounds
			res["defended"] = shields
			res["killed"] = not target_m.get("is_alive", true)

		"fire_of_wrath":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Fire of Wrath" }
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			var m_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
			spawn_beam_vfx(hero_screen, m_screen, Color(1.0, 0.4, 0.1), 0.3)
			spawn_burst_vfx(m_screen, Color(1.0, 0.5, 0.1), 35.0, 0.3)
			var def = TabletopDice.roll_combat_dice(1)
			var shields = def.black_shields
			var wounds = maxi(0, 1 - shields)
			var c_res = {
				"attack": { "dice_count": 1, "faces": ["skull"], "skulls": 1 },
				"defense": def,
				"total_skulls": 1,
				"effective_shields": shields,
				"wounds": wounds
			}
			trigger_combat_dice_roll(c_res, "Fire of Wrath", str(target_m.get("name", "Monster")), false)
			target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - wounds)
			_log("⚡ Fire of Wrath strikes %s! Shield roll: %d. Wounds: %d (BP: %d)" % [
				target_m.get("name"), shields, wounds, target_m.get("current_bp")
			])
			if wounds > 0:
				spawn_floating_text(m_pos, "-%d HP" % wounds, Color(1.0, 0.4, 0.1))
			else:
				spawn_floating_text(m_pos, "BLOCKED!", Color(0.6, 0.8, 1.0))
			if target_m.get("current_bp") <= 0:
				target_m["is_alive"] = false
				_log("💀 %s was consumed by Fire of Wrath!" % target_m.get("name"))
			res["target"] = target_m.get("id")
			res["wounds"] = wounds
			res["defended"] = shields
			res["killed"] = not target_m.get("is_alive", true)

		"courage":
			var target_h = _find_spell_target_hero(target_id)
			target_h["courage_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.9, 0.2, 0.2), 40.0, 0.4)
			spawn_floating_text(th_pos, "+2 ATK DICE", Color(1.0, 0.3, 0.3))
			_log("🦁 %s is filled with Courage! +2 extra combat dice on attacks." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["courage_active"] = true

		"rock_skin":
			var target_h = _find_spell_target_hero(target_id)
			target_h["rock_skin_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.5, 0.5, 0.55), 38.0, 0.4)
			spawn_floating_text(th_pos, "+1 DEF DIE", Color(0.7, 0.7, 0.8))
			_log("🪨 %s's skin hardens like granite! +1 extra defend die until wounded." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["rock_skin_active"] = true

		"heal_body":
			var target_h = _find_spell_target_hero(target_id)
			var max_bp = int(target_h.get("bodyPoints", 8))
			var cur_bp = int(target_h.get("current_bp", 8))
			var healed = mini(4, max_bp - cur_bp)
			target_h["current_bp"] = cur_bp + healed
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_heal_vfx(th_screen, Color(0.2, 0.9, 0.4), 0.6)
			spawn_floating_text(th_pos, "+%d HP" % healed, Color(0.3, 1.0, 0.4))
			_log("💚 Heal Body restores %d Body Points to %s (Current: %d/%d)." % [
				healed, target_h.get("name"), target_h.get("current_bp"), max_bp
			])
			res["target"] = target_h.get("id")
			res["healed"] = healed
			res["current_bp"] = target_h.get("current_bp")

		"pass_through_rock":
			var target_h = _find_spell_target_hero(target_id)
			target_h["pass_through_rock_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.7, 0.7, 0.9), 35.0, 0.4)
			spawn_floating_text(th_pos, "PHASE SHIFT", Color(0.8, 0.8, 1.0))
			_log("👻 %s turns ethereal! Can phase through solid rock walls on next movement." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["pass_through_rock_active"] = true

		"water_of_healing":
			var target_h = _find_spell_target_hero(target_id)
			var max_bp = int(target_h.get("bodyPoints", 8))
			var cur_bp = int(target_h.get("current_bp", 8))
			var healed = mini(4, max_bp - cur_bp)
			target_h["current_bp"] = cur_bp + healed
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_heal_vfx(th_screen, Color(0.1, 0.75, 0.95), 0.6)
			spawn_floating_text(th_pos, "+%d HP" % healed, Color(0.2, 0.8, 1.0))
			_log("💧 Pure waters of healing bathe %s! Restored %d Body Points (Current: %d/%d)." % [
				target_h.get("name"), healed, target_h.get("current_bp"), max_bp
			])
			res["target"] = target_h.get("id")
			res["healed"] = healed
			res["current_bp"] = target_h.get("current_bp")

		"sleep":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Sleep" }
			target_m["is_sleeping"] = true
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			var m_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(m_screen, Color(0.4, 0.4, 0.9), 35.0, 0.5)
			spawn_floating_text(m_pos, "💤 SLEEP", Color(0.5, 0.5, 1.0))
			_log("💤 %s falls into deep enchanted sleep! Cannot move, attack, or defend." % target_m.get("name"))
			res["target"] = target_m.get("id")
			res["is_sleeping"] = true

		"veil_of_mist":
			var target_h = _find_spell_target_hero(target_id)
			target_h["veil_of_mist_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.65, 0.7, 0.8), 35.0, 0.4)
			spawn_floating_text(th_pos, "MIST SHROUD", Color(0.7, 0.8, 0.9))
			_log("🌫️ %s is enveloped in mist! Can move through monsters unseen." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["veil_of_mist_active"] = true

		"genie":
			if target_id.begins_with("door") or (target_pos.x >= 0 and is_door_at(target_pos)):
				for d in doors:
					if not d.get("is_open", false):
						d["is_open"] = true
						var tr = d.get("toRoom", "")
						if tr != "":
							reveal_room_by_id(tr)
						_log("🧞 Genie gestures and magically forces open the door!")
						spawn_burst_vfx(hero_screen, Color(0.2, 0.8, 1.0), 55.0, 0.5)
						res["door_opened"] = true
						break
			else:
				var target_m = _find_spell_target_monster(target_id, hero_pos)
				if target_m.is_empty():
					return { "success": false, "error": "No target monster in line of sight for Genie" }
				var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
				spawn_projectile_vfx(hero_pos, m_pos, Color(0.1, 0.8, 1.0), 0.35, "genie_burst")
				var combat_res = TabletopDice.resolve_combat(5, target_m.get("defendDice", 2), false)
				trigger_combat_dice_roll(combat_res, "Genie", str(target_m.get("name", "Monster")), false)
				target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - combat_res.wounds)
				_log("🧞 Genie manifests and attacks %s with 5 dice! Skulls: %d, Defended: %d, Wounds: %d (BP: %d)" % [
					target_m.get("name"), combat_res.total_skulls, combat_res.effective_shields, combat_res.wounds, target_m.get("current_bp")
				])
				if combat_res.wounds > 0:
					spawn_floating_text(m_pos, "-%d HP" % combat_res.wounds, Color(0.2, 0.8, 1.0))
				if target_m.get("current_bp") <= 0:
					target_m["is_alive"] = false
					_log("💀 %s is crushed by the Genie's wrath!" % target_m.get("name"))
					spawn_floating_text(m_pos, "OBLITERATED!", Color(0.3, 0.9, 1.0), 1.5)
				res["target"] = target_m.get("id")
				res["wounds"] = combat_res.wounds
				res["killed"] = not target_m.get("is_alive", true)

		"swift_wind":
			var target_h = _find_spell_target_hero(target_id)
			target_h["swift_wind_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_cyclone_vfx(th_screen, Color(0.3, 0.8, 1.0), 0.5)
			spawn_floating_text(th_pos, "2X SPEED (4d6)", Color(0.3, 0.9, 1.0))
			_log("💨 Swift Wind envelopes %s! Movement dice doubled to 4d6 on next turn." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["swift_wind_active"] = true

		"tempest":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Tempest" }
			target_m["tempest_stunned"] = true
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			var m_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
			spawn_cyclone_vfx(m_screen, Color(0.1, 0.7, 0.9), 0.6)
			spawn_floating_text(m_pos, "🌪️ STUNNED", Color(0.2, 0.8, 1.0))
			_log("🌪️ Tempest whirlwind traps %s! It will miss its next turn." % target_m.get("name"))
			res["target"] = target_m.get("id")
			res["tempest_stunned"] = true

		"command":
			var target_h = _find_spell_target_hero(target_id)
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.6, 0.1, 0.8), 40.0, 0.5)
			spawn_floating_text(th_pos, "CONTROLLED!", Color(0.7, 0.2, 0.9))
			_log("👁️ Dread Sorcery: %s is commanded by Zargon to strike an ally!" % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["commanded"] = true

		"summon_undead":
			var spawn_pos = target_pos if target_pos.x >= 0 else Vector2i(hero_pos.x + 1, hero_pos.y)
			summon_wandering_monster(spawn_pos)
			var s_screen = board_offset + Vector2((spawn_pos.x + 0.5) * tile_size, (spawn_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(s_screen, Color(0.4, 0.1, 0.6), 45.0, 0.5)
			res["summoned_pos"] = [spawn_pos.x, spawn_pos.y]

	has_acted_this_turn = true
	if movement_remaining == 0:
		turn_state = "turn_complete"
	else:
		turn_state = "action_taken"

	last_spell_result = res
	_update_ui()
	queue_redraw_all()
	return res

func _find_spell_target_monster(target_id: String, from_pos: Vector2i) -> Dictionary:
	for m in monsters:
		if m.get("is_alive", false):
			if target_id != "" and m.get("id") == target_id:
				return m
			elif target_id == "":
				var mp = m.get("grid_pos", Vector2i(-1, -1))
				if has_line_of_sight(from_pos, mp):
					return m
	return {}

func _find_spell_target_hero(target_id: String) -> Dictionary:
	if target_id != "":
		for h in heroes:
			if h.get("id") == target_id:
				return h
	return get_active_hero()

func is_door_at(tile: Vector2i) -> bool:
	for d in doors:
		var f = d.get("from", [-1, -1])
		var t = d.get("to", [-1, -1])
		if (tile.x == f[0] and tile.y == f[1]) or (tile.x == t[0] and tile.y == t[1]):
			return true
	return false

# --- Visual Effects & Animation Helpers ---
func spawn_projectile_vfx(from_tile: Vector2i, to_tile: Vector2i, color: Color, duration: float = 0.35, on_complete: String = "") -> void:
	var from_screen = board_offset + Vector2((from_tile.x + 0.5) * tile_size, (from_tile.y + 0.5) * tile_size)
	var to_screen = board_offset + Vector2((to_tile.x + 0.5) * tile_size, (to_tile.y + 0.5) * tile_size)
	active_vfx.append({
		"type": "projectile",
		"from": from_screen,
		"to": to_screen,
		"color": color,
		"time": 0.0,
		"duration": duration,
		"on_complete": on_complete
	})
	queue_redraw_all()

func spawn_burst_vfx(center_screen: Vector2, color: Color, max_radius: float = 45.0, duration: float = 0.4) -> void:
	active_vfx.append({
		"type": "burst",
		"center": center_screen,
		"color": color,
		"max_radius": max_radius,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_heal_vfx(center_screen: Vector2, color: Color = Color(0.2, 0.9, 0.4), duration: float = 0.6) -> void:
	active_vfx.append({
		"type": "heal",
		"center": center_screen,
		"color": color,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_cyclone_vfx(center_screen: Vector2, color: Color = Color(0.1, 0.7, 0.9), duration: float = 0.6) -> void:
	active_vfx.append({
		"type": "cyclone",
		"center": center_screen,
		"color": color,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_beam_vfx(from_screen: Vector2, to_screen: Vector2, color: Color = Color(1.0, 0.5, 0.1), duration: float = 0.3) -> void:
	active_vfx.append({
		"type": "beam",
		"from": from_screen,
		"to": to_screen,
		"color": color,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_slash_vfx(center_screen: Vector2, rotation: float = 0.0, duration: float = 0.25) -> void:
	active_vfx.append({
		"type": "slash",
		"center": center_screen,
		"rotation": rotation,
		"color": Color.WHITE,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_floating_text(tile: Vector2i, text: String, color: Color = Color.WHITE, duration: float = 1.0) -> void:
	var screen_pos = board_offset + Vector2((tile.x + 0.5) * tile_size, (tile.y + 0.2) * tile_size)
	floating_texts.append({
		"text": text,
		"pos": screen_pos,
		"vel": Vector2(0, -40),
		"color": color,
		"alpha": 1.0,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

# Game Master Action: Summon Wandering Monster Ambush
func summon_wandering_monster(spawn_pos: Vector2i = Vector2i(3, 0), bp: int = 1, m_name: String = "Wandering Orc") -> Dictionary:
	if is_tile_occupied(spawn_pos):
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(-1, 1)]:
			var cand = spawn_pos + d
			if not is_tile_occupied(cand) and not is_tile_wall_blocked(cand):
				spawn_pos = cand
				break

	var new_m = {
		"id": "wandering-orc-" + str(monsters.size() + 1),
		"name": m_name,
		"bodyPoints": bp,
		"current_bp": bp,
		"attackDice": 3,
		"defendDice": 2,
		"movementSquares": 8,
		"tokenColor": "#047857",
		"icon": "🧌",
		"grid_pos": spawn_pos,
		"is_alive": true
	}
	monsters.append(new_m)
	_update_ui()
	queue_redraw_all()
	var ret_m = new_m.duplicate(true)
	ret_m["grid_pos"] = [spawn_pos.x, spawn_pos.y]
	return { "success": true, "monster": ret_m }

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

func _check_hero_enter_board(idx: int) -> void:
	if idx < 0 or idx >= heroes.size():
		return
	var h = heroes[idx]
	if not h.get("is_on_board", false):
		h["is_on_board"] = true
		var spawn_tile = starting_stair
		if is_tile_occupied(spawn_tile):
			# If the stairway tile is currently occupied, enter on adjacent unoccupied corridor tile
			for offset in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(0, 2), Vector2i(2, 0), Vector2i(1, 1)]:
				var cand = starting_stair + offset
				if not is_tile_occupied(cand) and not is_tile_wall_blocked(cand) and _get_room_at(cand).is_empty():
					spawn_tile = cand
					break
		h["grid_pos"] = spawn_tile
		_log("🌟 %s descends the spiral stairway and enters the dungeon at (%d, %d)!" % [
			h.get("name"), spawn_tile.x, spawn_tile.y
		])

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
			_check_hero_enter_board(active_hero_idx)
	else:
		current_phase = "hero_phase"
		current_round += 1
		_log("--- Round %d begins (Heroes Turn) ---" % current_round)
		_log("Active hero: %s" % get_active_hero().get("name", "Hero"))
		_check_hero_enter_board(active_hero_idx)

	movement_remaining = 0
	movement_rolled = false
	has_acted_this_turn = false
	turn_state = "awaiting_roll"
	update_party_vision()
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
	# Character card legacy label update for backwards compatibility
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

	# Render Rich Hero Party Cards & Discovered Enemy Cards
	_update_character_and_enemy_cards()

	var log_text = ""
	for i in range(maxi(0, combat_log.size() - 8), combat_log.size()):
		log_text += combat_log[i] + "\n"
	if log_label:
		log_label.text = log_text

func _update_character_and_enemy_cards() -> void:
	if not hero_cards_grid:
		hero_cards_grid = get_node_or_null("UI/StatsPanel/HeroCardsGrid")
	if not enemies_header_label:
		enemies_header_label = get_node_or_null("UI/EnemiesPanel/HeaderLabel")
	if not enemies_empty_label:
		enemies_empty_label = get_node_or_null("UI/EnemiesPanel/EmptyLabel")
	if not enemy_cards_grid:
		enemy_cards_grid = get_node_or_null("UI/EnemiesPanel/ScrollContainer/EnemyCardsGrid")

	# Render Hero Party Cards (all 4 heroes in party)
	if hero_cards_grid:
		for c in hero_cards_grid.get_children():
			hero_cards_grid.remove_child(c)
			c.queue_free()
		for i in range(heroes.size()):
			var h = heroes[i]
			var is_act = (i == active_hero_idx and current_phase == "hero_phase" and current_role == "player")
			var card = _create_hero_card(h, is_act)
			hero_cards_grid.add_child(card)

	# Discover any currently visible monsters
	for m in monsters:
		if is_monster_currently_visible(m):
			discovered_monster_ids[str(m.get("id"))] = true

	var vis_count = 0
	var dead_count = 0
	var discovered_list: Array[Dictionary] = []

	for m in monsters:
		var mid = str(m.get("id"))
		if discovered_monster_ids.has(mid):
			var cur_bp = int(m.get("current_bp", 1))
			var alive = bool(m.get("is_alive", true)) and cur_bp > 0
			var vis = is_monster_currently_visible(m)
			if not alive:
				dead_count += 1
			elif vis:
				vis_count += 1
			discovered_list.append({ "monster": m, "is_visible": vis })

	if enemies_header_label:
		if discovered_list.is_empty():
			enemies_header_label.text = "👹 DISCOVERED FOES (0 Sighted)"
		else:
			enemies_header_label.text = "👹 DISCOVERED FOES (%d Sighted | %d Defeated)" % [vis_count, dead_count]

	if enemies_empty_label:
		enemies_empty_label.visible = discovered_list.is_empty()

	if enemy_cards_grid:
		for c in enemy_cards_grid.get_children():
			enemy_cards_grid.remove_child(c)
			c.queue_free()
		for item in discovered_list:
			var card = _create_enemy_card(item.monster, item.is_visible)
			enemy_cards_grid.add_child(card)

func _create_hero_card(h: Dictionary, is_active: bool) -> PanelContainer:
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(272, 116)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER

	var cur_bp = int(h.get("current_bp", 8))
	var max_bp = int(h.get("bodyPoints", 8))
	var cur_mp = int(h.get("current_mp", 2))
	var max_mp = int(h.get("mindPoints", 2))
	var is_dead = cur_bp <= 0
	var is_on_board = bool(h.get("is_on_board", false))

	var sb = StyleBoxFlat.new()
	sb.corner_radius_top_left = 6
	sb.corner_radius_top_right = 6
	sb.corner_radius_bottom_left = 6
	sb.corner_radius_bottom_right = 6

	if is_dead:
		sb.bg_color = Color(0.24, 0.05, 0.05, 0.95)
		sb.border_color = Color(0.9, 0.15, 0.15, 1.0)
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(0.9, 0.1, 0.1, 0.4)
		sb.shadow_size = 4
	elif is_active:
		sb.bg_color = Color(0.14, 0.18, 0.26, 0.96)
		sb.border_color = Color(1.0, 0.82, 0.2, 1.0) # Golden active turn glow
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(1.0, 0.8, 0.2, 0.45)
		sb.shadow_size = 4
	elif not is_on_board:
		sb.bg_color = Color(0.09, 0.11, 0.16, 0.75)
		sb.border_color = Color(0.25, 0.30, 0.38, 0.5)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
	else:
		sb.bg_color = Color(0.11, 0.14, 0.20, 0.92)
		sb.border_color = Color(0.28, 0.38, 0.50, 0.85)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1

	card.add_theme_stylebox_override("panel", sb)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_top", 5)
	margin.add_theme_constant_override("margin_bottom", 5)
	card.add_child(margin)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	margin.add_child(vbox)

	# Row 1: Header (Name & Status Badge)
	var hdr_row = HBoxContainer.new()
	var name_lbl = Label.new()
	name_lbl.text = str(h.get("name", "Hero"))
	name_lbl.add_theme_font_size_override("font_size", 12)
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lbl.clip_text = true
	if is_dead:
		name_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
		name_lbl.text = "💀 " + name_lbl.text
	elif is_active:
		name_lbl.add_theme_color_override("font_color", Color(1.0, 0.9, 0.3, 1.0))
	else:
		name_lbl.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0, 1.0))
	hdr_row.add_child(name_lbl)

	var status_tag = Label.new()
	status_tag.add_theme_font_size_override("font_size", 10)
	if is_dead:
		status_tag.text = "[DEAD]"
		status_tag.add_theme_color_override("font_color", Color(1.0, 0.2, 0.2, 1.0))
	elif is_active:
		status_tag.text = "★ ACTIVE"
		status_tag.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1.0))
	elif not is_on_board:
		status_tag.text = "[Off Board]"
		status_tag.add_theme_color_override("font_color", Color(0.55, 0.60, 0.70, 0.8))
	else:
		status_tag.text = "[On Board]"
		status_tag.add_theme_color_override("font_color", Color(0.3, 0.85, 0.45, 0.9))
	hdr_row.add_child(status_tag)
	vbox.add_child(hdr_row)

	# Row 2: BP Bar & Text
	var bp_row = HBoxContainer.new()
	bp_row.add_theme_constant_override("separation", 6)
	var bp_lbl = Label.new()
	bp_lbl.text = "BP %d/%d" % [cur_bp, max_bp]
	bp_lbl.add_theme_font_size_override("font_size", 10)
	bp_lbl.custom_minimum_size = Vector2(55, 0)
	bp_row.add_child(bp_lbl)

	var bp_bar = ProgressBar.new()
	bp_bar.custom_minimum_size = Vector2(0, 7)
	bp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bp_bar.show_percentage = false
	bp_bar.max_value = max_bp
	bp_bar.value = max(0, cur_bp)
	var bp_pct = float(cur_bp) / max(1.0, float(max_bp))
	var bp_col = Color(0.2, 0.85, 0.35, 1.0)
	if is_dead:
		bp_col = Color(0.85, 0.15, 0.15, 1.0)
	elif bp_pct <= 0.25:
		bp_col = Color(0.95, 0.25, 0.25, 1.0)
	elif bp_pct <= 0.5:
		bp_col = Color(1.0, 0.75, 0.2, 1.0)
	var bp_fill = StyleBoxFlat.new()
	bp_fill.bg_color = bp_col
	bp_fill.corner_radius_top_left = 2; bp_fill.corner_radius_top_right = 2
	bp_fill.corner_radius_bottom_left = 2; bp_fill.corner_radius_bottom_right = 2
	bp_bar.add_theme_stylebox_override("fill", bp_fill)
	var bp_bg = StyleBoxFlat.new()
	bp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	bp_bar.add_theme_stylebox_override("background", bp_bg)
	bp_row.add_child(bp_bar)
	vbox.add_child(bp_row)

	# Row 3: MP Bar & Text
	var mp_row = HBoxContainer.new()
	mp_row.add_theme_constant_override("separation", 6)
	var mp_lbl = Label.new()
	mp_lbl.text = "MP %d/%d" % [cur_mp, max_mp]
	mp_lbl.add_theme_font_size_override("font_size", 10)
	mp_lbl.custom_minimum_size = Vector2(55, 0)
	mp_row.add_child(mp_lbl)

	var mp_bar = ProgressBar.new()
	mp_bar.custom_minimum_size = Vector2(0, 7)
	mp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mp_bar.show_percentage = false
	mp_bar.max_value = max_mp
	mp_bar.value = max(0, cur_mp)
	var mp_fill = StyleBoxFlat.new()
	mp_fill.bg_color = Color(0.2, 0.7, 0.95, 1.0)
	mp_fill.corner_radius_top_left = 2; mp_fill.corner_radius_top_right = 2
	mp_fill.corner_radius_bottom_left = 2; mp_fill.corner_radius_bottom_right = 2
	mp_bar.add_theme_stylebox_override("fill", mp_fill)
	var mp_bg = StyleBoxFlat.new()
	mp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	mp_bar.add_theme_stylebox_override("background", mp_bg)
	mp_row.add_child(mp_bar)
	vbox.add_child(mp_row)

	# Row 4: Combat stats & equipment
	var atk_d = get_hero_attack_dice(h)
	var def_d = get_hero_defend_dice(h)
	var wep = str(h.get("equipped_weapon", "unarmed")).capitalize()
	var arm = h.get("equipped_armor", [])
	var stat_row = HBoxContainer.new()
	var dice_stat = Label.new()
	dice_stat.text = "⚔️%dd  🛡️%dd" % [atk_d, def_d]
	dice_stat.add_theme_font_size_override("font_size", 10)
	dice_stat.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dice_stat.add_theme_color_override("font_color", Color(0.85, 0.88, 0.95, 0.95))
	stat_row.add_child(dice_stat)

	var eq_str = wep
	if arm.size() > 0:
		eq_str += " | " + arm[0].capitalize()
	var eq_lbl = Label.new()
	eq_lbl.text = eq_str
	eq_lbl.clip_text = true
	eq_lbl.add_theme_font_size_override("font_size", 10)
	eq_lbl.add_theme_color_override("font_color", Color(0.7, 0.78, 0.88, 0.85))
	stat_row.add_child(eq_lbl)
	vbox.add_child(stat_row)

	# Row 5: Status Effects / Buffs pills
	var eff_list: Array[String] = []
	if h.get("rock_skin_active", false):
		eff_list.append("Rock Skin")
	if h.get("courage_active", false):
		eff_list.append("Courage")
	if h.get("swift_wind_active", false):
		eff_list.append("Swift Wind")
	if h.get("pass_through_rock_active", false):
		eff_list.append("Pass Rock")
	if h.get("veil_of_mist_active", false):
		eff_list.append("Veil Mist")
	if h.get("is_sleeping", false):
		eff_list.append("Sleep")

	if eff_list.size() > 0:
		var eff_row = HBoxContainer.new()
		eff_row.add_theme_constant_override("separation", 4)
		for eff in eff_list:
			var pill = PanelContainer.new()
			var psb = StyleBoxFlat.new()
			psb.bg_color = Color(0.18, 0.28, 0.42, 0.9)
			psb.border_color = Color(0.35, 0.65, 0.95, 0.9)
			psb.border_width_left = 1; psb.border_width_top = 1; psb.border_width_right = 1; psb.border_width_bottom = 1
			psb.corner_radius_top_left = 3; psb.corner_radius_top_right = 3
			psb.corner_radius_bottom_left = 3; psb.corner_radius_bottom_right = 3
			pill.add_theme_stylebox_override("panel", psb)
			var plbl = Label.new()
			plbl.text = eff
			plbl.add_theme_font_size_override("font_size", 9)
			plbl.add_theme_color_override("font_color", Color(0.85, 0.95, 1.0, 1.0))
			var pmarg = MarginContainer.new()
			pmarg.add_theme_constant_override("margin_left", 4)
			pmarg.add_theme_constant_override("margin_right", 4)
			pmarg.add_theme_constant_override("margin_top", 1)
			pmarg.add_theme_constant_override("margin_bottom", 1)
			pmarg.add_child(plbl)
			pill.add_child(pmarg)
			eff_row.add_child(pill)
		vbox.add_child(eff_row)

	return card

func _create_enemy_card(m: Dictionary, is_visible: bool) -> PanelContainer:
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(272, 105)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER

	var cur_bp = int(m.get("current_bp", 1))
	var max_bp = int(m.get("bodyPoints", 1))
	var is_alive = bool(m.get("is_alive", true)) and cur_bp > 0
	var is_sleeping = bool(m.get("is_sleeping", false))
	var is_stunned = bool(m.get("tempest_stunned", false))

	var sb = StyleBoxFlat.new()
	sb.corner_radius_top_left = 6
	sb.corner_radius_top_right = 6
	sb.corner_radius_bottom_left = 6
	sb.corner_radius_bottom_right = 6

	if not is_alive:
		# Defeated monster styling
		sb.bg_color = Color(0.20, 0.08, 0.08, 0.85)
		sb.border_color = Color(0.70, 0.20, 0.20, 0.75)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
		card.modulate = Color(0.85, 0.85, 0.85, 0.75)
	elif is_visible:
		# Currently visible enemy
		sb.bg_color = Color(0.12, 0.18, 0.16, 0.95)
		sb.border_color = Color(0.20, 0.85, 0.50, 1.0) # Emerald sightline glow
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(0.1, 0.8, 0.4, 0.3)
		sb.shadow_size = 3
		card.modulate = Color(1.0, 1.0, 1.0, 1.0)
	else:
		# No longer visible enemy
		sb.bg_color = Color(0.10, 0.12, 0.16, 0.75)
		sb.border_color = Color(0.35, 0.42, 0.52, 0.6)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
		card.modulate = Color(0.75, 0.75, 0.80, 0.65) # Dimmed opacity for out-of-sight

	card.add_theme_stylebox_override("panel", sb)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_top", 5)
	margin.add_theme_constant_override("margin_bottom", 5)
	card.add_child(margin)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	margin.add_child(vbox)

	# Row 1: Header (Name & Visibility Badge)
	var hdr_row = HBoxContainer.new()
	var name_lbl = Label.new()
	var m_name = str(m.get("name", "Monster"))
	name_lbl.text = m_name
	name_lbl.add_theme_font_size_override("font_size", 12)
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lbl.clip_text = true

	var vis_badge = Label.new()
	vis_badge.add_theme_font_size_override("font_size", 10)

	if not is_alive:
		name_lbl.add_theme_color_override("font_color", Color(0.85, 0.4, 0.4, 0.9))
		vis_badge.text = "[💀 DEFEATED]"
		vis_badge.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
	elif is_visible:
		name_lbl.add_theme_color_override("font_color", Color(0.9, 1.0, 0.95, 1.0))
		vis_badge.text = "[👁️ VISIBLE]"
		vis_badge.add_theme_color_override("font_color", Color(0.3, 0.95, 0.6, 1.0))
	else:
		name_lbl.add_theme_color_override("font_color", Color(0.75, 0.78, 0.85, 0.8))
		vis_badge.text = "[👁️‍🗨️ (not visible)]"
		vis_badge.add_theme_color_override("font_color", Color(0.65, 0.70, 0.80, 0.8))

	hdr_row.add_child(name_lbl)
	hdr_row.add_child(vis_badge)
	vbox.add_child(hdr_row)

	# Row 2: BP Bar & Text
	var bp_row = HBoxContainer.new()
	bp_row.add_theme_constant_override("separation", 6)
	var bp_lbl = Label.new()
	bp_lbl.text = "BP %d/%d" % [cur_bp, max_bp]
	bp_lbl.add_theme_font_size_override("font_size", 10)
	bp_lbl.custom_minimum_size = Vector2(55, 0)
	bp_row.add_child(bp_lbl)

	var bp_bar = ProgressBar.new()
	bp_bar.custom_minimum_size = Vector2(0, 7)
	bp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bp_bar.show_percentage = false
	bp_bar.max_value = max_bp
	bp_bar.value = max(0, cur_bp)
	var bp_fill = StyleBoxFlat.new()
	if not is_alive:
		bp_fill.bg_color = Color(0.6, 0.15, 0.15, 0.8)
	elif is_visible:
		bp_fill.bg_color = Color(0.85, 0.25, 0.25, 1.0)
	else:
		bp_fill.bg_color = Color(0.65, 0.4, 0.4, 0.7)
	bp_fill.corner_radius_top_left = 2; bp_fill.corner_radius_top_right = 2
	bp_fill.corner_radius_bottom_left = 2; bp_fill.corner_radius_bottom_right = 2
	bp_bar.add_theme_stylebox_override("fill", bp_fill)
	var bp_bg = StyleBoxFlat.new()
	bp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	bp_bar.add_theme_stylebox_override("background", bp_bg)
	bp_row.add_child(bp_bar)
	vbox.add_child(bp_row)

	# Row 3: Stats row
	var atk_d = int(m.get("attackDice", 2))
	var def_d = int(m.get("defendDice", 2))
	var mv_sq = int(m.get("moveSquares", 6))
	var stat_row = HBoxContainer.new()
	var stat_lbl = Label.new()
	stat_lbl.text = "⚔️%dd  🛡️%dd  👣%d mv" % [atk_d, def_d, mv_sq]
	stat_lbl.add_theme_font_size_override("font_size", 10)
	stat_lbl.add_theme_color_override("font_color", Color(0.8, 0.85, 0.92, 0.9))
	stat_row.add_child(stat_lbl)
	vbox.add_child(stat_row)

	# Row 4: Conditions (Sleep, Stun, etc.)
	var eff_list: Array[String] = []
	if is_sleeping:
		eff_list.append("💤 Sleeping")
	if is_stunned:
		eff_list.append("⚡ Stunned")

	if eff_list.size() > 0:
		var eff_row = HBoxContainer.new()
		eff_row.add_theme_constant_override("separation", 4)
		for eff in eff_list:
			var pill = PanelContainer.new()
			var psb = StyleBoxFlat.new()
			psb.bg_color = Color(0.35, 0.20, 0.10, 0.9) if "Sleep" in eff else Color(0.15, 0.25, 0.4, 0.9)
			psb.border_color = Color(0.9, 0.65, 0.2, 0.9) if "Sleep" in eff else Color(0.3, 0.7, 1.0, 0.9)
			psb.border_width_left = 1; psb.border_width_top = 1; psb.border_width_right = 1; psb.border_width_bottom = 1
			psb.corner_radius_top_left = 3; psb.corner_radius_top_right = 3
			psb.corner_radius_bottom_left = 3; psb.corner_radius_bottom_right = 3
			pill.add_theme_stylebox_override("panel", psb)
			var plbl = Label.new()
			plbl.text = eff
			plbl.add_theme_font_size_override("font_size", 9)
			plbl.add_theme_color_override("font_color", Color(1.0, 0.95, 0.8, 1.0))
			var pmarg = MarginContainer.new()
			pmarg.add_theme_constant_override("margin_left", 4)
			pmarg.add_theme_constant_override("margin_right", 4)
			pmarg.add_theme_constant_override("margin_top", 1)
			pmarg.add_theme_constant_override("margin_bottom", 1)
			pmarg.add_child(plbl)
			pill.add_child(pmarg)
			eff_row.add_child(pill)
		vbox.add_child(eff_row)

	return card

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

	var heroes_copy: Array = []
	var char_cards: Array = []
	for i in range(heroes.size()):
		var h = heroes[i]
		var hc = h.duplicate(true)
		var gp = h.get("grid_pos", Vector2i(-1, -1))
		hc["grid_pos"] = [gp.x, gp.y]
		var atk_dice = get_hero_attack_dice(h)
		var def_dice = get_hero_defend_dice(h)
		hc["attackDice"] = atk_dice
		hc["defendDice"] = def_dice
		heroes_copy.append(hc)

		var cur_bp = int(h.get("current_bp", 8))
		var max_bp = int(h.get("bodyPoints", 8))
		var cur_mp = int(h.get("current_mp", 2))
		var max_mp = int(h.get("mindPoints", 2))
		var is_act = (i == active_hero_idx and current_phase == "hero_phase" and current_role == "player")
		var effs: Array[String] = []
		if h.get("rock_skin_active", false): effs.append("rock_skin")
		if h.get("courage_active", false): effs.append("courage")
		if h.get("swift_wind_active", false): effs.append("swift_wind")
		if h.get("pass_through_rock_active", false): effs.append("pass_through_rock")
		if h.get("veil_of_mist_active", false): effs.append("veil_of_mist")
		if h.get("is_sleeping", false): effs.append("sleep")

		char_cards.append({
			"id": str(h.get("id")),
			"name": str(h.get("name")),
			"title": str(h.get("title", "")),
			"current_bp": cur_bp,
			"max_bp": max_bp,
			"current_mp": cur_mp,
			"max_mp": max_mp,
			"attackDice": atk_dice,
			"defendDice": def_dice,
			"gold": int(h.get("gold", 0)),
			"isActive": is_act,
			"isOnBoard": bool(h.get("is_on_board", false)),
			"isAlive": cur_bp > 0,
			"weapon": str(h.get("equipped_weapon", "unarmed")),
			"armor": h.get("equipped_armor", []),
			"statusEffects": effs
		})

	var monsters_copy: Array = []
	var enemy_cards: Array = []
	var vis_count = 0
	var dead_count = 0
	for m in monsters:
		var mc = m.duplicate(true)
		var mp = m.get("grid_pos", Vector2i(-1, -1))
		mc["grid_pos"] = [mp.x, mp.y]
		monsters_copy.append(mc)

		var mid = str(m.get("id"))
		if discovered_monster_ids.has(mid):
			var vis = is_monster_currently_visible(m)
			var cur_bp = int(m.get("current_bp", 1))
			var max_bp = int(m.get("bodyPoints", 1))
			var alive = bool(m.get("is_alive", true)) and cur_bp > 0
			var effs: Array[String] = []
			if m.get("is_sleeping", false): effs.append("sleep")
			if m.get("tempest_stunned", false): effs.append("tempest_stunned")

			var badge = "visible"
			if not alive:
				badge = "defeated"
				dead_count += 1
			elif vis:
				badge = "visible"
				vis_count += 1
			else:
				badge = "not_visible"

			enemy_cards.append({
				"id": mid,
				"name": str(m.get("name")),
				"type": str(m.get("type", "monster")),
				"current_bp": cur_bp,
				"max_bp": max_bp,
				"attackDice": int(m.get("attackDice", 2)),
				"defendDice": int(m.get("defendDice", 2)),
				"moveSquares": int(m.get("moveSquares", 6)),
				"isVisible": vis,
				"isAlive": alive,
				"statusBadge": badge,
				"statusEffects": effs,
				"grid_pos": [mp.x, mp.y],
				"roomId": str(m.get("roomId", ""))
			})

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
		"heroes": heroes_copy,
		"monsters": monsters_copy,
		"doors": doors,
		"rooms": rooms,
		"revealedRooms": revealed_rooms,
		"exploredCount": explored_tiles.size(),
		"exploredTiles": exp_tiles,
		"activeVfx": active_vfx,
		"floatingTexts": floating_texts,
		"lastSpellResult": last_spell_result,
		"lastCombatResult": last_combat_result,
		"characterCards": char_cards,
		"enemyCards": enemy_cards,
		"discoveredEnemiesCount": discovered_monster_ids.size(),
		"visibleEnemiesCount": vis_count,
		"defeatedEnemiesCount": dead_count,
		"activeDiceRoll": {
			"type": active_dice_animation.get("type", ""),
			"title": active_dice_animation.get("title", ""),
			"settled": active_dice_animation.get("settled", false),
			"diceCount": active_dice_animation.get("dice", []).size(),
			"summary": active_dice_animation.get("summary", "")
		} if not active_dice_animation.is_empty() else {},
		"combatLog": combat_log.slice(-10),
		"aiStepPending": is_ai_step_pending,
		"pendingAiCommand": pending_ai_command,
		"nextAiStep": get_next_ai_step_command(),
		"cartridge": CartridgeManager.active_cartridge.get("cartridgeId", "")
	}

func execute_action(action_data: Dictionary) -> Dictionary:
	var action_val = action_data.get("action", "")
	var action_type = ""
	if action_val is Dictionary:
		action_type = str(action_val.get("action", ""))
		for k in action_val:
			if not action_data.has(k):
				action_data[k] = action_val[k]
	else:
		action_type = str(action_val)
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
			var weapon = str(action_data.get("weapon", action_data.get("weaponId", "")))
			var res = attack_adjacent_monster(mid, weapon)
			return res
		"cast_spell":
			var spell_id = str(action_data.get("spell", action_data.get("spellId", "")))
			var target_id = str(action_data.get("target", action_data.get("targetId", "")))
			var tx = int(action_data.get("tile_x", -1))
			var ty = int(action_data.get("tile_y", -1))
			var res = cast_spell(spell_id, target_id, Vector2i(tx, ty))
			return res
		"equip", "equip_item":
			var h_id = str(action_data.get("heroId", action_data.get("hero", get_active_hero().get("id", ""))))
			var item_id = str(action_data.get("itemId", action_data.get("item", "")))
			var res = equip_item(h_id, item_id)
			return res
		"unequip", "unequip_item":
			var h_id = str(action_data.get("heroId", action_data.get("hero", get_active_hero().get("id", ""))))
			var item_id = str(action_data.get("itemId", action_data.get("item", "")))
			var res = unequip_item(h_id, item_id)
			return res
		"dm_attack":
			var hid = str(action_data.get("heroId", action_data.get("target", "")))
			var res = dm_attack_hero(hid)
			return { "success": true, "result": res }
		"summon_monster":
			var sx = int(action_data.get("x", 3))
			var sy = int(action_data.get("y", 0))
			var bp = int(action_data.get("bp", 1))
			var m_name = str(action_data.get("name", "Wandering Orc"))
			var res = summon_wandering_monster(Vector2i(sx, sy), bp, m_name)
			return res
		"set_monster_pos":
			var m_id = str(action_data.get("monsterId", ""))
			var px = int(action_data.get("x", 0))
			var py = int(action_data.get("y", 0))
			for m in monsters:
				if str(m.get("id")) == m_id:
					m["grid_pos"] = Vector2i(px, py)
					m["roomId"] = ""
					break
			update_party_vision()
			_update_ui()
			queue_redraw_all()
			return { "success": true }
		"discover_monster":
			var m_id = str(action_data.get("monsterId", ""))
			discovered_monster_ids[m_id] = true
			_update_ui()
			return { "success": true }
		"set_hero_bp":
			var h_id = str(action_data.get("heroId", "barbarian"))
			var bp_val = int(action_data.get("bp", 1))
			for h in heroes:
				if str(h.get("id")) == h_id:
					h["current_bp"] = bp_val
					break
			_update_ui()
			return { "success": true }
		"set_monster_bp":
			var m_id = str(action_data.get("monsterId", ""))
			var bp_val = int(action_data.get("bp", 1))
			for m in monsters:
				if str(m.get("id")) == m_id:
					m["current_bp"] = bp_val
					if bp_val <= 0:
						m["is_alive"] = false
					break
			_update_ui()
			return { "success": true }
		"search":
			var res = search_room()
			return res
		"end_turn":
			end_turn()
			return { "success": true }
		"ai_step":
			var auto_confirm = bool(action_data.get("confirm", false))
			if auto_confirm:
				return confirm_and_execute_ai_step()
			else:
				return propose_ai_step()
		"ai_step_propose":
			return propose_ai_step()
		"ai_step_confirm":
			return confirm_and_execute_ai_step()
		"ai_step_cancel":
			return cancel_ai_step()
		"monster_turn", "ai_monster_turn":
			var res = ai_monster_turn()
			return res
		"test_dice_roll":
			var d_type = str(action_data.get("type", "movement"))
			if d_type == "movement":
				var d1 = int(action_data.get("d1", randi_range(1, 6)))
				var d2 = int(action_data.get("d2", randi_range(1, 6)))
				var r_dat = { "total": d1 + d2, "d1": d1, "d2": d2 }
				trigger_movement_dice_roll(r_dat, str(action_data.get("hero", "Barbarian")), [d1, d2])
				return { "success": true, "type": "movement", "roll": r_dat }
			else:
				var atk_cnt = int(action_data.get("attackDice", 3))
				var def_cnt = int(action_data.get("defendDice", 2))
				var is_hero_def = bool(action_data.get("isHeroDefending", false))
				var c_res = TabletopDice.resolve_combat(atk_cnt, def_cnt, is_hero_def)
				trigger_combat_dice_roll(c_res, str(action_data.get("attacker", "Barbarian")), str(action_data.get("defender", "Crypt Skeleton")), is_hero_def)
				return { "success": true, "type": "combat", "result": c_res }
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
		# 1. Atmospheric translucent fog over unrevealed rooms (room's real image visible underneath, no objects, no "shrouded" text)
		for rm in rooms:
			var r_id = str(rm.get("id", ""))
			if not revealed_rooms.has(r_id):
				var rx = int(rm.get("x", 0))
				var ry = int(rm.get("y", 0))
				var rw = int(rm.get("w", 1))
				var rh = int(rm.get("h", 1))
				var r_rect = Rect2(board_offset + Vector2(rx * tile_size, ry * tile_size), Vector2(rw * tile_size, rh * tile_size))
				# Atmospheric translucent fog layer over the authentic room floor art
				canvas.draw_rect(r_rect, Color(0.04, 0.06, 0.10, 0.58))
				canvas.draw_rect(r_rect, Color(0.12, 0.18, 0.28, 0.35), false, 1.5)

		# 2. Unexplored corridor tiles shroud (always show border tiles!)
		for c in range(grid_cols):
			for r in range(grid_rows):
				var t = Vector2i(c, r)
				# Always show the perimeter border tiles of the board
				if is_border_tile(t):
					continue
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
		var f_pos = Vector2i(px, py)
		var rm = _get_room_at(f_pos)
		var effective_room = r_id if r_id != "" else str(rm.get("id", ""))
		var is_visible = false
		if is_gm_role():
			is_visible = true
		elif effective_room != "":
			is_visible = revealed_rooms.has(effective_room)
		else:
			is_visible = explored_tiles.has(f_pos)
		if is_visible:
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
			var is_visible = is_monster_currently_visible(m)
			if is_visible:
				var pos = m.get("grid_pos", Vector2i(0, 0))
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

				if m.get("is_sleeping", false):
					var z_txt = "💤 Zzz"
					var zw = ThemeDB.fallback_font.get_string_size(z_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 11).x
					canvas.draw_string(ThemeDB.fallback_font, Vector2(screen_pos.x - zw * 0.5, screen_pos.y - tile_size * 0.45), z_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(0.6, 0.7, 1.0))
				if m.get("tempest_stunned", false):
					canvas.draw_arc(screen_pos, tile_size * 0.46, 0, TAU, 16, Color(0.2, 0.8, 1.0, 0.85), 2.0)

	# Draw Starting Staircase Tile (Entrance / Exit)
	var stair_rect = Rect2(board_offset + Vector2(starting_stair.x * tile_size + 2, starting_stair.y * tile_size + 2), Vector2(tile_size - 4, tile_size - 4))
	canvas.draw_rect(stair_rect, Color(0.18, 0.22, 0.28, 0.95))
	canvas.draw_rect(stair_rect, Color(0.45, 0.60, 0.75, 1.0), false, 1.5)
	canvas.draw_arc(stair_rect.get_center(), tile_size * 0.36, 0, TAU, 24, Color(0.35, 0.45, 0.58, 0.8), 1.5)
	canvas.draw_arc(stair_rect.get_center(), tile_size * 0.20, 0, TAU, 16, Color(0.55, 0.68, 0.82, 0.9), 1.5)
	var st_w = ThemeDB.fallback_font.get_string_size("STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8).x
	canvas.draw_string(ThemeDB.fallback_font, Vector2(stair_rect.get_center().x - st_w * 0.5, stair_rect.get_center().y + 3), "STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.85, 0.9, 1.0, 0.85))

	# Draw Heroes (only heroes currently on the board are drawn)
	var heroes_by_tile: Dictionary = {}
	for idx in range(heroes.size()):
		var h = heroes[idx]
		if not h.get("is_on_board", false):
			continue
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
		if not heroes[idx].get("is_on_board", false):
			continue
		if idx != active_hero_idx:
			draw_indices.append(idx)
	if active_hero_idx >= 0 and active_hero_idx < heroes.size() and heroes[active_hero_idx].get("is_on_board", false):
		draw_indices.append(active_hero_idx)

	for idx in draw_indices:
		var h = heroes[idx]
		if not h.get("is_on_board", false):
			continue
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

		# Draw Hero Active Status Auras
		if h.get("rock_skin_active", false):
			for s in range(6):
				var a1 = (float(s) / 6.0) * TAU
				var a2 = (float(s + 1) / 6.0) * TAU
				var p1 = screen_pos + Vector2(cos(a1), sin(a1)) * (token_radius + 4.0)
				var p2 = screen_pos + Vector2(cos(a2), sin(a2)) * (token_radius + 4.0)
				canvas.draw_line(p1, p2, Color(0.7, 0.75, 0.85, 0.9), 2.5)
		if h.get("courage_active", false):
			canvas.draw_arc(screen_pos, token_radius + 5.0, 0, TAU, 24, Color(1.0, 0.25, 0.1, 0.8), 2.0)
			for s in range(6):
				var fa = (float(s) / 6.0) * TAU
				var fp = screen_pos + Vector2(cos(fa), sin(fa)) * (token_radius + 8.0)
				canvas.draw_line(screen_pos + Vector2(cos(fa), sin(fa)) * (token_radius + 4.0), fp, Color(1.0, 0.8, 0.2, 0.9), 2.0)
		if h.get("veil_of_mist_active", false):
			canvas.draw_arc(screen_pos, token_radius + 5.0, 0, TAU, 32, Color(0.8, 0.85, 0.95, 0.6), 3.0)

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

	# Draw active dynamic VFX and floating text banners
	_draw_vfx_effects(canvas)
	_draw_floating_texts(canvas)
	_draw_active_dice_roll(canvas)

func _draw_vfx_effects(canvas: CanvasItem) -> void:
	for vfx in active_vfx:
		var vfx_type = str(vfx.get("type", ""))
		var t = clampf(float(vfx.get("time", 0.0)) / maxf(0.001, float(vfx.get("duration", 0.5))), 0.0, 1.0)
		var col = vfx.get("color", Color.ORANGE)

		match vfx_type:
			"projectile":
				var from_pos = vfx.get("from", Vector2.ZERO)
				var to_pos = vfx.get("to", Vector2.ZERO)
				var cur_pos = from_pos.lerp(to_pos, t)
				canvas.draw_circle(cur_pos, 16.0 * (1.0 - t * 0.2), Color(col.r, col.g, col.b, 0.35))
				canvas.draw_circle(cur_pos, 8.0, col)
				canvas.draw_circle(cur_pos, 4.0, Color.WHITE)
				var dir = (from_pos - to_pos).normalized()
				var trail_len = 35.0 * (1.0 - t)
				canvas.draw_line(cur_pos, cur_pos + dir * trail_len, Color(col.r, col.g, col.b, 0.6), 4.0)

			"burst", "explosion":
				var center = vfx.get("center", Vector2.ZERO)
				var max_r = float(vfx.get("max_radius", 45.0))
				var cur_r = max_r * t
				var alpha = 1.0 - t
				canvas.draw_arc(center, cur_r, 0, TAU, 32, Color(col.r, col.g, col.b, alpha * 0.9), 3.0)
				if t < 0.6:
					canvas.draw_circle(center, cur_r * 0.7, Color(col.r, col.g, col.b, (1.0 - t / 0.6) * 0.5))
				for i in range(8):
					var angle = (float(i) / 8.0) * TAU + t * 2.0
					var spike_dir = Vector2(cos(angle), sin(angle))
					var spike_end = center + spike_dir * (cur_r * 1.25)
					canvas.draw_line(center + spike_dir * (cur_r * 0.5), spike_end, Color(1.0, 0.9, 0.4, alpha), 2.5)

			"heal":
				var center = vfx.get("center", Vector2.ZERO)
				var alpha = 1.0 - t
				var h = 60.0 * t
				var rect = Rect2(center.x - 20.0, center.y - h, 40.0, h)
				canvas.draw_rect(rect, Color(col.r, col.g, col.b, alpha * 0.35))
				var cross_col = Color(1.0, 1.0, 1.0, alpha)
				canvas.draw_line(Vector2(center.x, center.y - 30.0), Vector2(center.x, center.y - 10.0), cross_col, 4.0)
				canvas.draw_line(Vector2(center.x - 10.0, center.y - 20.0), Vector2(center.x + 10.0, center.y - 20.0), cross_col, 4.0)

			"cyclone", "whirlwind":
				var center = vfx.get("center", Vector2.ZERO)
				var alpha = 1.0 - t
				var spin = t * TAU * 4.0
				for r_step in [12.0, 22.0, 32.0]:
					var start_a = spin + r_step
					canvas.draw_arc(center, r_step, start_a, start_a + PI * 1.2, 16, Color(col.r, col.g, col.b, alpha * 0.8), 2.5)

			"beam":
				var from_pos = vfx.get("from", Vector2.ZERO)
				var to_pos = vfx.get("to", Vector2.ZERO)
				var alpha = 1.0 - t
				canvas.draw_line(from_pos, to_pos, Color(col.r, col.g, col.b, alpha * 0.4), 8.0)
				canvas.draw_line(from_pos, to_pos, Color.WHITE, 2.5)

			"slash":
				var center = vfx.get("center", Vector2.ZERO)
				var alpha = 1.0 - t
				var rot = float(vfx.get("rotation", 0.0))
				var p1 = center + Vector2(cos(rot - 0.8), sin(rot - 0.8)) * 26.0
				var p2 = center + Vector2(cos(rot + 0.8), sin(rot + 0.8)) * 26.0
				canvas.draw_line(p1, p2, Color(1.0, 1.0, 1.0, alpha), 3.5)

func _draw_floating_texts(canvas: CanvasItem) -> void:
	for ft in floating_texts:
		var font = ThemeDB.fallback_font
		var f_size = 18
		var col = Color(ft.color.r, ft.color.g, ft.color.b, ft.alpha)
		var txt = str(ft.get("text", ""))
		var tw = font.get_string_size(txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size).x
		canvas.draw_string(font, Vector2(ft.pos.x - tw * 0.5, ft.pos.y), txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size, col)

func trigger_movement_dice_roll(roll_data: Dictionary, hero_name: String, dice_values: Array) -> void:
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45)
	var num_dice = dice_values.size()
	var dice_arr: Array = []
	var spacing = 72.0
	var start_x = center.x - (float(maxi(1, num_dice) - 1) * spacing * 0.5)

	for i in range(num_dice):
		var target_pos = Vector2(start_x + i * spacing, center.y + 10.0)
		var init_pos = target_pos + Vector2(randf_range(-140.0, 140.0), -180.0 - randf_range(20.0, 80.0))
		var val = int(dice_values[i])
		dice_arr.append({
			"type": "movement_red",
			"init_pos": init_pos,
			"target_pos": target_pos,
			"pos": init_pos,
			"final_value": val,
			"current_face": randi_range(1, 6),
			"angle": randf_range(-PI, PI),
			"spin_speed": randf_range(8.0, 16.0) * (1.0 if randf() > 0.5 else -1.0),
			"bounces": 2.5 + randf() * 0.5,
			"z": 45.0 + randf() * 15.0,
			"current_z": 0.0,
			"settled": false
		})

	active_dice_animation = {
		"type": "movement",
		"title": "%s - Movement Roll (%dd6)" % [hero_name, num_dice],
		"summary": "Rolled %d square%s!" % [int(roll_data.get("total", 0)), "s" if int(roll_data.get("total", 0)) != 1 else ""],
		"dice": dice_arr,
		"time": 0.0,
		"roll_duration": 0.75,
		"total_duration": 2.4,
		"settled": false,
		"center": center,
		"tray_width": maxf(320.0, num_dice * spacing + 120.0),
		"tray_height": 180.0
	}
	queue_redraw_all()

func trigger_combat_dice_roll(combat_res: Dictionary, attacker_name: String, defender_name: String, is_hero_defending: bool) -> void:
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45)
	var atk_res = combat_res.get("attack", {})
	var def_res = combat_res.get("defense", {})
	var atk_faces = atk_res.get("faces", [])
	var def_faces = def_res.get("faces", [])
	var wounds = int(combat_res.get("wounds", 0))
	var skulls = int(combat_res.get("total_skulls", 0))
	var shields = int(combat_res.get("effective_shields", 0))

	var dice_arr: Array = []
	var spacing = 64.0

	# Attack dice row (centered vertically above centerline)
	var n_atk = atk_faces.size()
	var start_x_atk = center.x - (float(maxi(1, n_atk) - 1) * spacing * 0.5)
	for i in range(n_atk):
		var face = str(atk_faces[i])
		var target_pos = Vector2(start_x_atk + i * spacing, center.y - 25.0 if def_faces.size() > 0 else center.y + 10.0)
		var init_pos = target_pos + Vector2(randf_range(-120.0, 120.0), -200.0 - randf_range(10.0, 60.0))
		dice_arr.append({
			"type": "combat_white",
			"group": "attack",
			"init_pos": init_pos,
			"target_pos": target_pos,
			"pos": init_pos,
			"final_face": face,
			"current_face": ["skull", "white_shield", "black_shield"][randi() % 3],
			"angle": randf_range(-PI, PI),
			"spin_speed": randf_range(8.0, 16.0) * (1.0 if randf() > 0.5 else -1.0),
			"bounces": 2.5 + randf() * 0.5,
			"z": 45.0 + randf() * 15.0,
			"current_z": 0.0,
			"settled": false,
			"is_hit": face == "skull",
			"is_block": false
		})

	# Defend dice row (centered vertically below centerline)
	var n_def = def_faces.size()
	var start_x_def = center.x - (float(maxi(1, n_def) - 1) * spacing * 0.5)
	for i in range(n_def):
		var face = str(def_faces[i])
		var target_pos = Vector2(start_x_def + i * spacing, center.y + 45.0)
		var init_pos = target_pos + Vector2(randf_range(-120.0, 120.0), 180.0 + randf_range(10.0, 60.0))
		var is_block = (face == "white_shield" if is_hero_defending else face == "black_shield")
		dice_arr.append({
			"type": "combat_white",
			"group": "defense",
			"init_pos": init_pos,
			"target_pos": target_pos,
			"pos": init_pos,
			"final_face": face,
			"current_face": ["skull", "white_shield", "black_shield"][randi() % 3],
			"angle": randf_range(-PI, PI),
			"spin_speed": randf_range(8.0, 16.0) * (1.0 if randf() > 0.5 else -1.0),
			"bounces": 2.5 + randf() * 0.5,
			"z": 45.0 + randf() * 15.0,
			"current_z": 0.0,
			"settled": false,
			"is_hit": false,
			"is_block": is_block
		})

	var def_shield_name = "White Shield" if is_hero_defending else "Black Shield"
	var summary_txt = ""
	if wounds > 0:
		summary_txt = "%d Skull%s vs %d %s%s -> %d WOUND%s!" % [
			skulls, "s" if skulls != 1 else "",
			shields, def_shield_name, "s" if shields != 1 else "",
			wounds, "S" if wounds != 1 else ""
		]
	else:
		summary_txt = "%d Skull%s vs %d %s%s -> BLOCKED!" % [
			skulls, "s" if skulls != 1 else "",
			shields, def_shield_name, "s" if shields != 1 else ""
		]

	var max_dice_row = maxi(n_atk, n_def)
	active_dice_animation = {
		"type": "combat",
		"title": "%s attacks %s!" % [attacker_name, defender_name],
		"summary": summary_txt,
		"dice": dice_arr,
		"time": 0.0,
		"roll_duration": 0.8,
		"total_duration": 2.6,
		"settled": false,
		"center": center,
		"tray_width": maxf(360.0, max_dice_row * spacing + 120.0),
		"tray_height": 230.0 if n_def > 0 else 180.0,
		"wounds": wounds,
		"skulls": skulls,
		"shields": shields,
		"is_hero_defending": is_hero_defending
	}
	queue_redraw_all()

func _draw_active_dice_roll(canvas: CanvasItem) -> void:
	if active_dice_animation.is_empty():
		return

	var anim = active_dice_animation
	var center = anim.get("center", board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45))
	var tray_w = float(anim.get("tray_width", 380.0))
	var tray_h = float(anim.get("tray_height", 180.0))
	var tray_rect = Rect2(center.x - tray_w * 0.5, center.y - tray_h * 0.5, tray_w, tray_h)
	var settled = bool(anim.get("settled", false))
	var font = ThemeDB.fallback_font

	# 1. Outer Tray Shadow
	canvas.draw_rect(Rect2(tray_rect.position + Vector2(5.0, 7.0), tray_rect.size), Color(0.0, 0.0, 0.0, 0.65))

	# 2. Rich Walnut Wood Tray Rim
	canvas.draw_rect(tray_rect, Color(0.14, 0.08, 0.04, 0.96))
	canvas.draw_rect(tray_rect, Color(0.32, 0.18, 0.10, 1.0), false, 2.5)

	# 3. Inner Tabletop Velvet/Felt Inlay
	var felt_rect = Rect2(tray_rect.position + Vector2(8.0, 8.0), tray_rect.size - Vector2(16.0, 16.0))
	var felt_color = Color(0.05, 0.14, 0.08, 0.97) if anim.get("type") == "movement" else Color(0.06, 0.08, 0.15, 0.97)
	canvas.draw_rect(felt_rect, felt_color)

	# Gold/Brass Inlay Filigree Trim
	canvas.draw_rect(felt_rect, Color(0.85, 0.72, 0.25, 0.75), false, 1.8)

	# 4. Title Header Banner
	var title = str(anim.get("title", ""))
	var title_w = font.get_string_size(title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14).x
	canvas.draw_string(font, Vector2(center.x - title_w * 0.5, tray_rect.position.y + 24.0), title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(1.0, 0.90, 0.45, 1.0))

	# 5. Combat Section Labels (ATK / DEF) if applicable
	if anim.get("type") == "combat" and anim.get("dice", []).size() > 0:
		var has_def = false
		for d in anim.get("dice", []):
			if d.get("group") == "defense":
				has_def = true
				break
		if has_def:
			canvas.draw_string(font, Vector2(tray_rect.position.x + 14.0, center.y - 20.0), "ATK", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1.0, 0.45, 0.45, 0.85))
			canvas.draw_string(font, Vector2(tray_rect.position.x + 14.0, center.y + 50.0), "DEF", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.45, 0.80, 1.0, 0.85))

	# 6. Draw Dice
	for die in anim.get("dice", []):
		var d_type = str(die.get("type", "movement_red"))
		var d_pos = die.get("pos", center)
		var angle = float(die.get("angle", 0.0))
		var z = float(die.get("current_z", 0.0))
		var d_settled = bool(die.get("settled", false))

		if d_type == "movement_red":
			var pips = int(die.get("current_face", 1))
			_draw_red_movement_die(canvas, d_pos, 54.0, pips, angle, z, 1.0, d_settled)
		else:
			var face = str(die.get("current_face", "skull"))
			var is_hit = bool(die.get("is_hit", false))
			var is_block = bool(die.get("is_block", false))
			_draw_white_combat_die(canvas, d_pos, 52.0, face, angle, z, 1.0, d_settled, is_hit, is_block)

	# 7. Settled Outcome Summary Badge at Bottom of Tray
	if settled:
		var summary = str(anim.get("summary", ""))
		var sum_w = font.get_string_size(summary, HORIZONTAL_ALIGNMENT_CENTER, -1, 13).x
		var badge_rect = Rect2(center.x - sum_w * 0.5 - 12.0, tray_rect.end.y - 28.0, sum_w + 24.0, 20.0)
		canvas.draw_rect(badge_rect, Color(0.08, 0.10, 0.14, 0.95))
		var outline_col = Color(1.0, 0.85, 0.25, 0.9) if "WOUND" in summary or "square" in summary else Color(0.4, 0.8, 1.0, 0.9)
		canvas.draw_rect(badge_rect, outline_col, false, 1.5)
		canvas.draw_string(font, Vector2(center.x - sum_w * 0.5, tray_rect.end.y - 13.0), summary, HORIZONTAL_ALIGNMENT_CENTER, -1, 13, outline_col)

func _draw_red_movement_die(canvas: CanvasItem, center: Vector2, size: float, pips: int, angle: float, z: float, alpha: float, settled: bool) -> void:
	var hs = size * 0.5
	var die_ground = center
	var die_screen_pos = center - Vector2(0.0, z)

	# 1. Ground Drop Shadow (projected below tumbling die)
	var shadow_size = size * (1.0 - clampf(z / 150.0, 0.0, 0.3))
	var shadow_rect = Rect2(die_ground.x - shadow_size * 0.5 + 4.0, die_ground.y - shadow_size * 0.5 + 6.0 + z * 0.25, shadow_size, shadow_size)
	canvas.draw_rect(shadow_rect, Color(0.0, 0.0, 0.0, 0.45 * alpha))

	# 2. Rotated 3D Die Cube Face
	canvas.draw_set_transform(die_screen_pos, angle, Vector2.ONE)

	# Main Red Body Face
	var base_red = Color(0.85, 0.12, 0.12, alpha)
	canvas.draw_rect(Rect2(-hs, -hs, size, size), base_red)

	# 3D Bevel Highlights (Top & Left)
	var top_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(hs, -hs), Vector2(hs - 3.5, -hs + 3.5), Vector2(-hs + 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(top_bevel, Color(1.0, 0.38, 0.38, alpha * 0.8))
	var left_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(-hs + 3.5, -hs + 3.5), Vector2(-hs + 3.5, hs - 3.5), Vector2(-hs, hs)])
	canvas.draw_colored_polygon(left_bevel, Color(0.95, 0.28, 0.28, alpha * 0.6))

	# 3D Bevel Shading (Bottom & Right)
	var bot_bevel = PackedVector2Array([Vector2(-hs, hs), Vector2(-hs + 3.5, hs - 3.5), Vector2(hs - 3.5, hs - 3.5), Vector2(hs, hs)])
	canvas.draw_colored_polygon(bot_bevel, Color(0.45, 0.05, 0.05, alpha * 0.85))
	var right_bevel = PackedVector2Array([Vector2(hs, -hs), Vector2(hs, hs), Vector2(hs - 3.5, hs - 3.5), Vector2(hs - 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(right_bevel, Color(0.55, 0.06, 0.06, alpha * 0.75))

	# Outer Dark Crimson Border
	canvas.draw_rect(Rect2(-hs, -hs, size, size), Color(0.40, 0.04, 0.04, alpha), false, 2.0)

	if settled:
		# Settled Golden Specular Shimmer
		canvas.draw_rect(Rect2(-hs - 1.0, -hs - 1.0, size + 2.0, size + 2.0), Color(1.0, 0.88, 0.25, 0.4), false, 1.5)

	# 3. White Pips (1 to 6)
	var pr = size * 0.082
	var d = size * 0.27
	var pip_positions: Array[Vector2] = []

	match pips:
		1:
			pip_positions = [Vector2.ZERO]
		2:
			pip_positions = [Vector2(-d, -d), Vector2(d, d)]
		3:
			pip_positions = [Vector2(-d, -d), Vector2.ZERO, Vector2(d, d)]
		4:
			pip_positions = [Vector2(-d, -d), Vector2(d, -d), Vector2(-d, d), Vector2(d, d)]
		5:
			pip_positions = [Vector2(-d, -d), Vector2(d, -d), Vector2.ZERO, Vector2(-d, d), Vector2(d, d)]
		6:
			pip_positions = [Vector2(-d, -d), Vector2(d, -d), Vector2(-d, 0.0), Vector2(d, 0.0), Vector2(-d, d), Vector2(d, d)]
		_:
			pip_positions = [Vector2.ZERO]

	for p in pip_positions:
		# Recessed Dark Pip Socket
		canvas.draw_circle(p + Vector2(0.5, 0.8), pr + 0.8, Color(0.35, 0.03, 0.03, alpha * 0.85))
		# Authentic White Pip
		canvas.draw_circle(p, pr, Color(0.98, 0.98, 0.98, alpha))
		# Tiny Specular Shine Dot
		canvas.draw_circle(p - Vector2(1.0, 1.0), pr * 0.35, Color(1.0, 1.0, 1.0, alpha * 0.9))

	# Reset Canvas Transform
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_white_combat_die(canvas: CanvasItem, center: Vector2, size: float, face_type: String, angle: float, z: float, alpha: float, settled: bool, is_hit: bool, is_block: bool) -> void:
	var hs = size * 0.5
	var die_ground = center
	var die_screen_pos = center - Vector2(0.0, z)

	# 1. Ground Drop Shadow
	var shadow_size = size * (1.0 - clampf(z / 150.0, 0.0, 0.3))
	var shadow_rect = Rect2(die_ground.x - shadow_size * 0.5 + 4.0, die_ground.y - shadow_size * 0.5 + 6.0 + z * 0.25, shadow_size, shadow_size)
	canvas.draw_rect(shadow_rect, Color(0.0, 0.0, 0.0, 0.40 * alpha))

	# 2. Rotated 3D Bone White Die
	canvas.draw_set_transform(die_screen_pos, angle, Vector2.ONE)

	# Bone White / Ivory Face
	var base_ivory = Color(0.96, 0.96, 0.94, alpha)
	canvas.draw_rect(Rect2(-hs, -hs, size, size), base_ivory)

	# 3D Bevel Highlights (Top & Left)
	var top_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(hs, -hs), Vector2(hs - 3.5, -hs + 3.5), Vector2(-hs + 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(top_bevel, Color(1.0, 1.0, 1.0, alpha * 0.9))
	var left_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(-hs + 3.5, -hs + 3.5), Vector2(-hs + 3.5, hs - 3.5), Vector2(-hs, hs)])
	canvas.draw_colored_polygon(left_bevel, Color(0.92, 0.92, 0.90, alpha * 0.6))

	# 3D Bevel Shading (Bottom & Right)
	var bot_bevel = PackedVector2Array([Vector2(-hs, hs), Vector2(-hs + 3.5, hs - 3.5), Vector2(hs - 3.5, hs - 3.5), Vector2(hs, hs)])
	canvas.draw_colored_polygon(bot_bevel, Color(0.72, 0.72, 0.70, alpha * 0.8))
	var right_bevel = PackedVector2Array([Vector2(hs, -hs), Vector2(hs, hs), Vector2(hs - 3.5, hs - 3.5), Vector2(hs - 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(right_bevel, Color(0.78, 0.78, 0.76, alpha * 0.7))

	# Charcoal Border
	canvas.draw_rect(Rect2(-hs, -hs, size, size), Color(0.18, 0.18, 0.20, alpha), false, 2.2)

	# Settled Combat Sparks & Halos
	if settled:
		if is_hit:
			# Fiery Hit Glow
			canvas.draw_rect(Rect2(-hs - 2.0, -hs - 2.0, size + 4.0, size + 4.0), Color(1.0, 0.30, 0.10, 0.85), false, 2.2)
		elif is_block:
			# Radiant Defensive Deflection Glow
			var block_col = Color(0.20, 0.80, 1.0, 0.85) if face_type == "white_shield" else Color(0.85, 0.15, 0.40, 0.85)
			canvas.draw_rect(Rect2(-hs - 2.0, -hs - 2.0, size + 4.0, size + 4.0), block_col, false, 2.2)

	# 3. Authentic HeroQuest Combat Face (Skull, White Shield, Black Shield)
	var black_icon_col = Color(0.12, 0.12, 0.14, alpha)

	match face_type:
		"skull":
			# Skull Cranium
			canvas.draw_circle(Vector2(0.0, -size * 0.08), size * 0.24, black_icon_col)
			# Jaw Block
			var jaw_rect = Rect2(-size * 0.13, size * 0.04, size * 0.26, size * 0.18)
			canvas.draw_rect(jaw_rect, black_icon_col)

			# Cutouts: Eye Sockets (Bone Ivory)
			canvas.draw_circle(Vector2(-size * 0.09, -size * 0.07), size * 0.065, base_ivory)
			canvas.draw_circle(Vector2(size * 0.09, -size * 0.07), size * 0.065, base_ivory)

			# Cutout: Nasal Slit
			canvas.draw_line(Vector2(0.0, 0.0), Vector2(0.0, size * 0.06), base_ivory, 2.2)

			# Cutout: Tooth Slits in Jaw
			canvas.draw_line(Vector2(-size * 0.045, size * 0.08), Vector2(-size * 0.045, size * 0.18), base_ivory, 1.8)
			canvas.draw_line(Vector2(size * 0.045, size * 0.08), Vector2(size * 0.045, size * 0.18), base_ivory, 1.8)

			if settled and is_hit:
				# Red hit spark in pupils
				canvas.draw_circle(Vector2(-size * 0.09, -size * 0.07), size * 0.03, Color(1.0, 0.15, 0.1, alpha))
				canvas.draw_circle(Vector2(size * 0.09, -size * 0.07), size * 0.03, Color(1.0, 0.15, 0.1, alpha))

		"white_shield":
			# Knight Heater Shield with Cross (Hero Defense)
			var sw = size * 0.26
			var ty = -size * 0.26
			var my = size * 0.04
			var by = size * 0.30
			var shield_pts = PackedVector2Array([
				Vector2(-sw, ty),
				Vector2(sw, ty),
				Vector2(sw, my),
				Vector2(0.0, by),
				Vector2(-sw, my)
			])
			# White field inside shield
			canvas.draw_colored_polygon(shield_pts, Color(0.98, 0.98, 0.96, alpha))
			# Bold Black Shield Outline
			var shield_outline = PackedVector2Array([
				Vector2(-sw, ty), Vector2(sw, ty), Vector2(sw, my),
				Vector2(0.0, by), Vector2(-sw, my), Vector2(-sw, ty)
			])
			canvas.draw_polyline(shield_outline, black_icon_col, 2.8)

			# Black Knight's Cross
			canvas.draw_line(Vector2(0.0, ty + 2.0), Vector2(0.0, by - 4.0), black_icon_col, 3.8)
			var cross_y = ty + (my - ty) * 0.45
			canvas.draw_line(Vector2(-sw + 3.0, cross_y), Vector2(sw - 3.0, cross_y), black_icon_col, 3.8)

			if settled and is_block:
				# Radiant cyan cross center gleam
				canvas.draw_line(Vector2(0.0, ty + 4.0), Vector2(0.0, by - 6.0), Color(0.3, 0.85, 1.0, alpha), 1.5)
				canvas.draw_line(Vector2(-sw + 5.0, cross_y), Vector2(sw - 5.0, cross_y), Color(0.3, 0.85, 1.0, alpha), 1.5)

		"black_shield":
			# Solid Black Obsidian Heater Shield with Demonic Horns (Monster Defense)
			var sw = size * 0.26
			var ty = -size * 0.26
			var my = size * 0.04
			var by = size * 0.30
			var shield_pts = PackedVector2Array([
				Vector2(-sw, ty),
				Vector2(sw, ty),
				Vector2(sw, my),
				Vector2(0.0, by),
				Vector2(-sw, my)
			])
			# Solid Black Shield Fill
			canvas.draw_colored_polygon(shield_pts, black_icon_col)
			var shield_outline = PackedVector2Array([
				Vector2(-sw, ty), Vector2(sw, ty), Vector2(sw, my),
				Vector2(0.0, by), Vector2(-sw, my), Vector2(-sw, ty)
			])
			canvas.draw_polyline(shield_outline, Color(0.05, 0.05, 0.06, alpha), 2.8)

			# Demonic Horns / Spikes (Ivory White on Black Shield)
			canvas.draw_line(Vector2(-size * 0.16, ty + 4.0), Vector2(-size * 0.05, my), base_ivory, 2.4)
			canvas.draw_line(Vector2(size * 0.16, ty + 4.0), Vector2(size * 0.05, my), base_ivory, 2.4)
			canvas.draw_line(Vector2(-size * 0.05, my), Vector2(0.0, my + size * 0.12), base_ivory, 2.4)
			canvas.draw_line(Vector2(size * 0.05, my), Vector2(0.0, my + size * 0.12), base_ivory, 2.4)

			if settled and is_block:
				# Crimson evil flare
				canvas.draw_polyline(shield_outline, Color(0.9, 0.15, 0.35, alpha * 0.8), 2.2)

	# Reset Canvas Transform
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

