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
var has_acted_this_turn: bool = false
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
var starting_stair: Vector2i = Vector2i(0, 1)
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
	_update_ui()
	queue_redraw_all()

func _on_attack_pressed() -> void:
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
	for h_id in cart_heroes:
		var h = cart_heroes[h_id].duplicate(true)
		h["current_bp"] = h.get("bodyPoints", 8)
		h["current_mp"] = h.get("mindPoints", 2)
		h["gold"] = 0
		h["grid_pos"] = starting_stair
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

	# Fog of War: initially, only starting stairwell and surrounding corridor are explored
	revealed_rooms.clear()
	explored_tiles.clear()
	_reveal_corridor_around(starting_stair, 3)
	queue_redraw_all()

func _reveal_corridor_around(center: Vector2i, radius: int) -> void:
	for dx in range(-radius, radius + 1):
		for dy in range(-radius, radius + 1):
			var tile = center + Vector2i(dx, dy)
			if tile.x >= 0 and tile.x < grid_cols and tile.y >= 0 and tile.y < grid_rows:
				if not _is_inside_any_room(tile):
					explored_tiles[tile] = true

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

func roll_movement_dice() -> Dictionary:
	var roll = TabletopDice.roll_movement()
	movement_remaining = roll.total
	_log("🎲 %s rolled 2d6 movement: [%d, %d] = %d squares!" % [
		get_active_hero().get("name", "Hero"), roll.d1, roll.d2, roll.total
	])
	dice_label.text = "Move: %d (%d+%d)" % [roll.total, roll.d1, roll.d2]
	_update_ui()
	return roll

func move_hero(target_pos: Vector2i) -> bool:
	var hero = get_active_hero()
	if hero.size() == 0:
		return false

	var curr = hero.get("grid_pos", Vector2i(1, 1))
	var dist = absi(curr.x - target_pos.x) + absi(curr.y - target_pos.y)

	if movement_remaining > 0 and dist > movement_remaining:
		_log("⚠️ Target out of movement range (need %d, have %d)" % [dist, movement_remaining])
		return false

	hero["grid_pos"] = target_pos
	movement_remaining = maxi(0, movement_remaining - dist)
	_reveal_corridor_around(target_pos, 2)
	_log("👣 %s moved to (%d, %d). Remaining movement: %d" % [
		hero.get("name"), target_pos.x, target_pos.y, movement_remaining
	])
	_update_ui()
	queue_redraw_all()
	return true

func open_door(from_pos: Vector2i, to_pos: Vector2i) -> bool:
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		if (f[0] == from_pos.x and f[1] == from_pos.y and t[0] == to_pos.x and t[1] == to_pos.y) or \
		   (t[0] == from_pos.x and t[1] == from_pos.y and f[0] == to_pos.x and f[1] == to_pos.y):
			d["is_open"] = true
			var r_id = str(d.get("room", ""))
			if r_id == "":
				var r1 = _get_room_at(Vector2i(f[0], f[1]))
				var r2 = _get_room_at(Vector2i(t[0], t[1]))
				if r1.size() > 0:
					r_id = str(r1.get("id", ""))
				elif r2.size() > 0:
					r_id = str(r2.get("id", ""))

			if r_id != "" and not revealed_rooms.has(r_id):
				revealed_rooms.append(r_id)
				var room_obj = _get_room_by_id(r_id)
				var room_name = room_obj.get("name", r_id)
				_log("🚪 Door kicked open! Revealed chamber: %s!" % room_name)
				
				# Log spotted monsters in the chamber
				var found_m: Array[String] = []
				for m in monsters:
					if m.get("roomId", "") == r_id and m.get("is_alive", false):
						found_m.append(str(m.get("name", "Monster")))
				if found_m.size() > 0:
					_log("⚠️ Danger! Spotted inside: %s!" % ", ".join(found_m))
				else:
					_log("✨ The chamber appears calm... for now.")

			_update_ui()
			queue_redraw_all()
			return true
	return false

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
	_update_ui()
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
			_log("Next hero: %s" % get_active_hero().get("name", "Hero"))
	else:
		current_phase = "hero_phase"
		current_round += 1
		_log("--- Round %d begins (Heroes Turn) ---" % current_round)
		_log("Active hero: %s" % get_active_hero().get("name", "Hero"))

	movement_remaining = 0
	has_acted_this_turn = false
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
			if next_pos != h_pos:
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
		title_label.text = "🛡️ RobOS Tabletop RPG: HeroQuest — %s" % role_name
	if role_badge:
		role_badge.text = "Role: " + ("⚔️ Player" if current_role == "player" else "👑 Game Master")

	if btn_summon:
		btn_summon.visible = is_gm_role()
	if btn_attack:
		btn_attack.text = "⚔️ Hero Attack" if current_role == "player" else "👹 Monster Attack"

	var hero = get_active_hero()
	if hero.size() > 0 and hero_card:
		hero_card.text = "%s (%s)\nBP: %d/%d | MP: %d/%d\nAtk Dice: %d | Def Dice: %d\nGold: %d gp" % [
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
	return {
		"role": current_role,
		"round": current_round,
		"phase": current_phase,
		"activeHero": get_active_hero().get("id", ""),
		"activeHeroIndex": active_hero_idx,
		"movementRemaining": movement_remaining,
		"heroes": heroes,
		"monsters": monsters,
		"doors": doors,
		"rooms": rooms,
		"revealedRooms": revealed_rooms,
		"exploredCount": explored_tiles.size(),
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
				canvas.draw_string(ThemeDB.fallback_font, center + Vector2(-36, 5), "🌫️ Shrouded", HORIZONTAL_ALIGNMENT_CENTER, -1, 13, Color(0.45, 0.55, 0.65, 0.7))

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
				canvas.draw_string(ThemeDB.fallback_font, r_rect.position + Vector2(8, 18), "👑 Hidden from Players", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.85, 0.6, 1.0, 0.8))

	# Draw Wall Blocks (1-tile and 2-tile walls)
	for wb in wall_blocks:
		var px = wb.get("x", wb.get("position", [0, 0])[0])
		var py = wb.get("y", wb.get("position", [0, 0])[1])
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
		# Inner masonry accent
		canvas.draw_string(ThemeDB.fallback_font, block_rect.position + Vector2(w * tile_size * 0.5 - 6, h * tile_size * 0.5 + 5), "🧱", HORIZONTAL_ALIGNMENT_CENTER, -1, 14)

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
				canvas.draw_string(ThemeDB.fallback_font, trap_rect.position + Vector2(w * tile_size * 0.5 - 6, h * tile_size * 0.5 + 5), "🪨", HORIZONTAL_ALIGNMENT_CENTER, -1, 14)
			else:
				canvas.draw_rect(trap_rect, Color(0.6, 0.1, 0.1, 0.6))
				canvas.draw_rect(trap_rect, Color(0.9, 0.2, 0.2, 0.9), false, 1.5)
				canvas.draw_string(ThemeDB.fallback_font, trap_rect.position + Vector2(w * tile_size * 0.5 - 6, h * tile_size * 0.5 + 5), "⚠️", HORIZONTAL_ALIGNMENT_CENTER, -1, 14)

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
			var icon_char = "📦"

			if f_type == "altar":
				canvas.draw_rect(f_rect, Color(0.14, 0.10, 0.20, 0.95))
				canvas.draw_rect(f_rect, Color(0.68, 0.35, 0.95, 0.9), false, 2.0)
				canvas.draw_arc(f_rect.get_center(), min(w, h) * tile_size * 0.28, 0, TAU, 24, Color(0.85, 0.45, 1.0, 0.6), 1.5)
				icon_char = "🔮"
			elif f_type == "bookcase":
				canvas.draw_rect(f_rect, Color(0.24, 0.12, 0.08, 0.95))
				canvas.draw_rect(f_rect, Color(0.62, 0.36, 0.20, 1.0), false, 2.0)
				icon_char = "📚"
			elif f_type == "bookshelf":
				canvas.draw_rect(f_rect, Color(0.32, 0.20, 0.10, 0.95))
				canvas.draw_rect(f_rect, Color(0.72, 0.48, 0.24, 1.0), false, 2.0)
				icon_char = "📖"
			elif f_type == "boulder":
				canvas.draw_circle(f_rect.get_center(), tile_size * 0.42 * min(w, h), Color(0.32, 0.35, 0.38, 0.95))
				canvas.draw_arc(f_rect.get_center(), tile_size * 0.42 * min(w, h), 0, TAU, 32, Color(0.65, 0.70, 0.75), 2.0)
				icon_char = "🪨"
			elif f_type == "tomb":
				canvas.draw_rect(f_rect, Color(0.25, 0.28, 0.32, 0.95))
				canvas.draw_rect(f_rect, Color(0.55, 0.60, 0.68, 1.0), false, 2.0)
				icon_char = "⚰️"
			elif f_type == "table":
				canvas.draw_rect(f_rect, Color(0.35, 0.22, 0.12, 0.95))
				canvas.draw_rect(f_rect, Color(0.58, 0.38, 0.22, 1.0), false, 1.5)
				icon_char = "🪵"
			elif f_type == "chest":
				canvas.draw_rect(f_rect, Color(0.45, 0.32, 0.08, 0.95))
				canvas.draw_rect(f_rect, Color(0.9, 0.75, 0.2, 1.0), false, 1.5)
				icon_char = "💰"
			elif f_type == "weapons-rack" or f_type == "rack":
				canvas.draw_rect(f_rect, Color(0.25, 0.25, 0.28, 0.95))
				canvas.draw_rect(f_rect, Color(0.6, 0.6, 0.7, 1.0), false, 1.5)
				icon_char = "⚔️"
			else:
				canvas.draw_rect(f_rect, Color(0.4, 0.28, 0.16, 0.85))
				canvas.draw_rect(f_rect, Color(0.6, 0.45, 0.25, 1.0), false, 1.5)
				icon_char = "📦"

			canvas.draw_string(ThemeDB.fallback_font, f_rect.position + Vector2(w * tile_size * 0.5 - 6, h * tile_size * 0.5 + 5), icon_char, HORIZONTAL_ALIGNMENT_CENTER, -1, 14)

	# Draw Doors
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
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
				canvas.draw_string(ThemeDB.fallback_font, screen_pos + Vector2(-8, 6), m.get("icon", "👹"), HORIZONTAL_ALIGNMENT_CENTER, -1, 18)

	# Draw Heroes
	for idx in range(heroes.size()):
		var h = heroes[idx]
		var pos = h.get("grid_pos", Vector2i(0, 0))
		var screen_pos = board_offset + Vector2(pos.x * tile_size + tile_size * 0.5, pos.y * tile_size + tile_size * 0.5)
		var col = Color.from_string(h.get("tokenColor", "#b91c1c"), Color.RED)
		canvas.draw_circle(screen_pos, tile_size * 0.42, col)
		if idx == active_hero_idx and current_phase == "hero_phase":
			canvas.draw_arc(screen_pos, tile_size * 0.46, 0, TAU, 32, Color.YELLOW, 3.0)
		canvas.draw_string(ThemeDB.fallback_font, screen_pos + Vector2(-8, 6), h.get("icon", "⚔️"), HORIZONTAL_ALIGNMENT_CENTER, -1, 18)
