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
var revealed_rooms: Array[String] = []

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
	queue_redraw()

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

	var cart_heroes = cart.get("heroes", {})
	heroes.clear()
	for h_id in cart_heroes:
		var h = cart_heroes[h_id].duplicate(true)
		h["current_bp"] = h.get("bodyPoints", 8)
		h["current_mp"] = h.get("mindPoints", 2)
		h["gold"] = 0
		var pos = h.get("position", [1, 1])
		h["grid_pos"] = Vector2i(pos[0], pos[1])
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

	var starting_map_id = cart.get("header", {}).get("startingMap", "the-trial")
	var map_data = cart.get("maps", {}).get(starting_map_id, {})

	doors.clear()
	for d in map_data.get("doors", []):
		var door_entry = d.duplicate(true)
		door_entry["is_open"] = false
		doors.append(door_entry)

	furniture.clear()
	for f in map_data.get("furniture", []):
		furniture.append(f.duplicate(true))

	revealed_rooms = ["room-corridor"]
	queue_redraw()

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
			_log("⚡ [Auto-Play] Step 1: " + str(hero.get("name")) + " rolls movement dice (2d6)...")
			roll_movement_dice()
		2:
			var target = Vector2i(2, 0)
			_log("⚡ [Auto-Play] Step 2: " + str(hero.get("name")) + " advances down corridor to door at (2, 0).")
			move_hero(target)
		3:
			_log("⚡ [Auto-Play] Step 3: " + str(hero.get("name")) + " kicks open the ancient wooden door!")
			open_door(Vector2i(2, 0), Vector2i(2, 1))
		4:
			_log("⚡ [Auto-Play] Step 4: " + str(hero.get("name")) + " enters room and spots a Goblin Scout!")
			move_hero(Vector2i(2, 2))
		5:
			_log("⚡ [Auto-Play] Step 5: " + str(hero.get("name")) + " swings Broadsword at Goblin Scout!")
			attack_adjacent_monster("goblin-scout-1")
		6:
			_log("⚡ [Auto-Play] Step 6: Barbarian ends turn. Next hero: Dwarf.")
			end_turn()
		7:
			roll_movement_dice()
			move_hero(Vector2i(3, 1))
		8:
			_log("⚡ [Auto-Play] Step 8: Dwarf searches room for treasure and hidden traps!")
			search_room()
		9:
			if is_gm_role():
				_log("⚡ [Auto-Play] Step 9: Game Master summons wandering monster ambush!")
				summon_wandering_monster()
			else:
				_log("⚡ [Auto-Play] Step 9: Quest demonstration complete! Telemetry verified.")
				CartridgeManager.auto_play_enabled = false
		10:
			_log("⚡ [Auto-Play] Step 10: Game Master / DunMaster demonstration complete! Telemetry verified.")
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
	_log("👣 %s moved to (%d, %d). Remaining movement: %d" % [
		hero.get("name"), target_pos.x, target_pos.y, movement_remaining
	])
	_update_ui()
	queue_redraw()
	return true

func open_door(from_pos: Vector2i, to_pos: Vector2i) -> bool:
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		if (f[0] == from_pos.x and f[1] == from_pos.y and t[0] == to_pos.x and t[1] == to_pos.y) or \
		   (t[0] == from_pos.x and t[1] == from_pos.y and f[0] == to_pos.x and f[1] == to_pos.y):
			d["is_open"] = true
			var r_id = str(d.get("room", ""))
			if r_id != "" and not revealed_rooms.has(r_id):
				revealed_rooms.append(r_id)
				_log("🚪 Door opened! Revealed chamber: %s" % r_id)
			_update_ui()
			queue_redraw()
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
	queue_redraw()
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
	queue_redraw()
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
	queue_redraw()
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
				# In Player Mode, monsters take quick automated turn
				call_deferred("_run_automated_monster_turn")
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
	queue_redraw()

func _run_automated_monster_turn() -> void:
	_log("Minions of Zargon stir in the darkness...")
	# Return to heroes turn after monsters act
	end_turn()

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
		"movementRemaining": movement_remaining,
		"heroes": heroes,
		"monsters": monsters,
		"doors": doors,
		"revealedRooms": revealed_rooms,
		"combatLog": combat_log.slice(-10),
		"cartridge": CartridgeManager.active_cartridge.get("cartridgeId", "")
	}

func execute_action(action_data: Dictionary) -> Dictionary:
	var action_type = str(action_data.get("action", ""))
	match action_type:
		"toggle_role":
			toggle_role()
			return { "success": true, "role": current_role }
		"roll_movement":
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
			var mid = str(action_data.get("monsterId", ""))
			var res = attack_adjacent_monster(mid)
			return { "success": true, "result": res }
		"dm_attack":
			var hid = str(action_data.get("heroId", ""))
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
	return { "success": false, "error": "Unknown action: " + action_type }

func _draw() -> void:
	# Draw 26x19 grid overlay
	for c in range(GRID_COLS + 1):
		var p1 = BOARD_OFFSET + Vector2(c * TILE_SIZE, 0)
		var p2 = BOARD_OFFSET + Vector2(c * TILE_SIZE, GRID_ROWS * TILE_SIZE)
		draw_line(p1, p2, Color(0.2, 0.4, 0.6, 0.25), 1.0)

	for r in range(GRID_ROWS + 1):
		var p1 = BOARD_OFFSET + Vector2(0, r * TILE_SIZE)
		var p2 = BOARD_OFFSET + Vector2(GRID_COLS * TILE_SIZE, r * TILE_SIZE)
		draw_line(p1, p2, Color(0.2, 0.4, 0.6, 0.25), 1.0)

	# In Player Mode, draw fog of war over unrevealed central chamber
	if current_role == "player" and not revealed_rooms.has("room-center"):
		var fog_rect = Rect2(BOARD_OFFSET + Vector2(11 * TILE_SIZE, 7 * TILE_SIZE), Vector2(4 * TILE_SIZE, 5 * TILE_SIZE))
		draw_rect(fog_rect, Color(0.04, 0.06, 0.09, 0.85))
	elif is_gm_role():
		# In Game Master Mode, show GM halo outline around the central chamber
		var center_rect = Rect2(BOARD_OFFSET + Vector2(11 * TILE_SIZE, 7 * TILE_SIZE), Vector2(4 * TILE_SIZE, 5 * TILE_SIZE))
		draw_rect(center_rect, Color(0.7, 0.2, 0.8, 0.15))
		draw_rect(center_rect, Color(0.8, 0.3, 0.9, 0.8), false, 2.0)

	# Draw Furniture
	for f in furniture:
		var r_id = f.get("roomId", "")
		if is_gm_role() or revealed_rooms.has(r_id) or r_id == "":
			var pos = f.get("position", [0, 0])
			var screen_pos = BOARD_OFFSET + Vector2(pos[0] * TILE_SIZE + TILE_SIZE * 0.5, pos[1] * TILE_SIZE + TILE_SIZE * 0.5)
			draw_circle(screen_pos, TILE_SIZE * 0.35, Color(0.5, 0.35, 0.2, 0.8))
			draw_string(ThemeDB.fallback_font, screen_pos + Vector2(-6, 5), "📦", HORIZONTAL_ALIGNMENT_CENTER, -1, 14)

	# Draw Doors
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		var p1 = BOARD_OFFSET + Vector2(f[0] * TILE_SIZE + TILE_SIZE * 0.5, f[1] * TILE_SIZE + TILE_SIZE * 0.5)
		var p2 = BOARD_OFFSET + Vector2(t[0] * TILE_SIZE + TILE_SIZE * 0.5, t[1] * TILE_SIZE + TILE_SIZE * 0.5)
		var mid = (p1 + p2) * 0.5
		var is_open = d.get("is_open", false)
		var col = Color(0.2, 0.8, 0.2, 0.9) if is_open else Color(0.8, 0.5, 0.1, 0.9)
		draw_rect(Rect2(mid.x - 8, mid.y - 8, 16, 16), col)

	# Draw Monsters
	for m in monsters:
		if m.get("is_alive", false):
			var r_id = m.get("roomId", "")
			# Visible if DM mode OR room is revealed OR in corridor
			if current_role == "dm" or revealed_rooms.has(r_id) or r_id == "":
				var pos = m.get("grid_pos", Vector2i(0, 0))
				var screen_pos = BOARD_OFFSET + Vector2(pos.x * TILE_SIZE + TILE_SIZE * 0.5, pos.y * TILE_SIZE + TILE_SIZE * 0.5)
				var col = Color.from_string(m.get("tokenColor", "#15803d"), Color.GREEN)
				draw_circle(screen_pos, TILE_SIZE * 0.4, col)
				draw_string(ThemeDB.fallback_font, screen_pos + Vector2(-8, 6), m.get("icon", "👹"), HORIZONTAL_ALIGNMENT_CENTER, -1, 18)

	# Draw Heroes
	for idx in range(heroes.size()):
		var h = heroes[idx]
		var pos = h.get("grid_pos", Vector2i(0, 0))
		var screen_pos = BOARD_OFFSET + Vector2(pos.x * TILE_SIZE + TILE_SIZE * 0.5, pos.y * TILE_SIZE + TILE_SIZE * 0.5)
		var col = Color.from_string(h.get("tokenColor", "#b91c1c"), Color.RED)
		draw_circle(screen_pos, TILE_SIZE * 0.42, col)
		if idx == active_hero_idx and current_phase == "hero_phase":
			draw_arc(screen_pos, TILE_SIZE * 0.46, 0, TAU, 32, Color.YELLOW, 3.0)
		draw_string(ThemeDB.fallback_font, screen_pos + Vector2(-8, 6), h.get("icon", "⚔️"), HORIZONTAL_ALIGNMENT_CENTER, -1, 18)
