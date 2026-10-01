# RobOS Tabletop RPG: TabletopWorld
# Cartridge Game Player for HeroQuest and Tabletop Dungeon Crawlers
extends Node2D

const GRID_COLS = 26
const GRID_ROWS = 19
const TILE_SIZE = 46.0
const BOARD_OFFSET = Vector2(50.0, 70.0)

var current_round: int = 1
var active_hero_idx: int = 0
var movement_remaining: int = 0
var has_acted_this_turn: bool = false
var combat_log: Array[String] = []

var heroes: Array[Dictionary] = []
var monsters: Array[Dictionary] = []
var doors: Array[Dictionary] = []
var furniture: Array[Dictionary] = []
var revealed_rooms: Array[String] = []

var auto_play_timer: float = 0.0
var auto_play_step: int = 0

@onready var board_sprite: Sprite2D = $BoardSprite
@onready var log_label: RichTextLabel = $UI/LogPanel/LogLabel
@onready var hero_card: Label = $UI/StatsPanel/HeroLabel
@onready var dice_label: Label = $UI/DicePanel/DiceLabel
@onready var btn_roll: Button = $UI/Actions/BtnRoll
@onready var btn_attack: Button = $UI/Actions/BtnAttack
@onready var btn_search: Button = $UI/Actions/BtnSearch
@onready var btn_end_turn: Button = $UI/Actions/BtnEndTurn

func _ready() -> void:
	print("🛡️ [TabletopWorld] Initializing HeroQuest Cartridge Player...")
	_load_active_cartridge()
	CartridgeManager.cartridge_inserted.connect(_on_cartridge_inserted)
	_update_ui()
	_log("=== Welcome to HeroQuest: The Trial ===")
	_log("Four heroes embark into the ancient catacombs to face the Orc Warlord Verag!")

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
			# Move Barbarian forward toward North Door
			var target = Vector2i(2, 0)
			_log("⚡ [Auto-Play] Step 2: " + str(hero.get("name")) + " advances down corridor to door at (2, 0).")
			move_hero(target)
		3:
			# Open door to Northwest room
			_log("⚡ [Auto-Play] Step 3: " + str(hero.get("name")) + " kicks open the ancient wooden door!")
			open_door(Vector2i(2, 0), Vector2i(2, 1))
		4:
			# Move inside Northwest room
			_log("⚡ [Auto-Play] Step 4: " + str(hero.get("name")) + " enters room and spots a Goblin Scout!")
			move_hero(Vector2i(2, 2))
		5:
			# Attack Goblin Scout
			_log("⚡ [Auto-Play] Step 5: " + str(hero.get("name")) + " swings Broadsword at Goblin Scout!")
			attack_adjacent_monster("goblin-scout-1")
		6:
			# End turn to Dwarf
			_log("⚡ [Auto-Play] Step 6: Barbarian ends turn. Next hero: Dwarf.")
			end_turn()
		7:
			# Dwarf rolls movement and enters room
			roll_movement_dice()
			move_hero(Vector2i(3, 1))
		8:
			# Dwarf searches room for treasure
			_log("⚡ [Auto-Play] Step 8: Dwarf searches room for treasure and hidden traps!")
			search_room()
		9:
			_log("⚡ [Auto-Play] Step 9: Quest demonstration complete! Telemetry verified.")
			CartridgeManager.auto_play_enabled = false

func get_active_hero() -> Dictionary:
	if heroes.size() == 0:
		return {}
	return heroes[active_hero_idx % heroes.size()]

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

	# In auto-play or manual, clamp to movement or allow reasonable step
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
	active_hero_idx = (active_hero_idx + 1) % maxi(1, heroes.size())
	if active_hero_idx == 0:
		current_round += 1
		_log("--- Round %d begins ---" % current_round)
	movement_remaining = 0
	has_acted_this_turn = false
	_log("Active turn passed to: %s" % get_active_hero().get("name", "Next Hero"))
	_update_ui()
	queue_redraw()

func _update_ui() -> void:
	var hero = get_active_hero()
	if hero.size() > 0:
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
	log_label.text = log_text

func _log(msg: String) -> void:
	print("[Tabletop] ", msg)
	combat_log.append(msg)
	_update_ui()

func get_telemetry_state() -> Dictionary:
	return {
		"round": current_round,
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

	# Draw Furniture
	for f in furniture:
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
		if idx == active_hero_idx:
			draw_arc(screen_pos, TILE_SIZE * 0.46, 0, TAU, 32, Color.YELLOW, 3.0)
		draw_string(ThemeDB.fallback_font, screen_pos + Vector2(-8, 6), h.get("icon", "⚔️"), HORIZONTAL_ALIGNMENT_CENTER, -1, 18)
