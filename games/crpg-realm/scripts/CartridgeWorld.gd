extends Node2D

# RobOS cRPG Cartridge World Runner
# Dynamically loads and renders any battle-map contained within the plugged-in Player Cartridge.

const TILE_SIZE: float = 48.0

@onready var canvas_layer: CanvasLayer = $CanvasLayer
@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud: Control = $CanvasLayer/PartyHUD
@onready var msg_label: Label = $CanvasLayer/NoticeLabel
@onready var dialog_box: PanelContainer = $CanvasLayer/DialogBox
@onready var dialog_speaker: Label = $CanvasLayer/DialogBox/VBox/SpeakerLabel
@onready var dialog_text: Label = $CanvasLayer/DialogBox/VBox/DialogText
@onready var dialog_buttons: HBoxContainer = $CanvasLayer/DialogBox/VBox/Buttons

var hero: Node2D = null
var current_map_slug: String = ""
var spawned_npcs: Dictionary = {}
var spawned_monsters: Dictionary = {}
var active_connections: Array = []

func _ready() -> void:
	print("📼 [CartridgeWorld] Initializing Cartridge Runner...")
	if not has_node("/root/CartridgeManager") or not CartridgeManager.is_cartridge_active:
		# If launched without a cartridge, auto-insert rescue-the-princess
		if has_node("/root/CartridgeManager"):
			CartridgeManager.insert_cartridge("rescue-the-princess")

	CartridgeManager.cartridge_map_transitioned.connect(_on_map_transitioned)
	_load_map(CartridgeManager.current_map_slug, CartridgeManager.current_spawn_coord)

func _load_map(map_slug: String, spawn_coords: Vector2) -> void:
	current_map_slug = map_slug
	print("🗺️ [CartridgeWorld] Loading map '%s' with spawn at %s" % [map_slug, spawn_coords])

	# Clear previous map dynamic elements
	for child in $MapElements.get_children():
		child.queue_free()

	spawned_npcs.clear()
	spawned_monsters.clear()
	active_connections.clear()

	var map_data = CartridgeManager.get_current_map()
	var map_w = int(map_data.get("robos:width", map_data.get("width", 40)))
	var map_h = int(map_data.get("robos:height", map_data.get("height", 30)))
	var map_title = str(map_data.get("dcterms:title", map_data.get("title", map_slug.capitalize())))
	var terrain = str(map_data.get("robos:terrain", map_data.get("terrain", "stone")))

	# 1. Update Camera Limits & Background
	var pixel_w = map_w * TILE_SIZE
	var pixel_h = map_h * TILE_SIZE
	_draw_map_background(pixel_w, pixel_h, terrain)

	# 2. Spawn Hero
	_spawn_hero(spawn_coords, pixel_w, pixel_h)

	# 3. Spawn Map Objects (Walls, Passages, Spawns)
	var objects = map_data.get("robos:mapObjects", map_data.get("objects", []))
	for obj in objects:
		_spawn_map_object(obj)

	# 4. Resolve Map Connections from Campaign
	var campaign = CartridgeManager.active_cartridge.get("campaign", {})
	var all_conns = campaign.get("robos:mapConnections", [])
	for conn in all_conns:
		if conn.get("fromMap") == map_slug or (conn.get("bidirectional", false) and conn.get("toMap") == map_slug):
			active_connections.append(conn)

	# 5. Spawn NPCs for this map
	_spawn_map_npcs(map_slug)

	# 6. Update HUD Quest display
	_update_hud_status(map_title)

	if action_log:
		action_log.add_entry("Entered: [b]%s[/b]" % map_title, "info")

func _draw_map_background(pixel_w: float, pixel_h: float, terrain: String) -> void:
	var bg = $Background
	if bg:
		bg.size = Vector2(pixel_w, pixel_h)
		var color = Color(0.1, 0.12, 0.16)
		match terrain:
			"stone", "dungeon": color = Color(0.08, 0.1, 0.14)
			"grass", "wilderness": color = Color(0.1, 0.18, 0.12)
			"lava", "lair": color = Color(0.18, 0.08, 0.08)
		bg.color = color

func _spawn_hero(coords: Vector2, pixel_w: float, pixel_h: float) -> void:
	if not hero:
		var hero_scene = load("res://scenes/HeroPlayer.tscn")
		hero = hero_scene.instantiate()
		$MapElements.add_child(hero)

	var spawn_pos = Vector2(coords.x * TILE_SIZE, coords.y * TILE_SIZE)
	hero.position = spawn_pos

	if hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, int(pixel_w), int(pixel_h))

func _spawn_map_object(obj: Dictionary) -> void:
	var o_type = str(obj.get("robos:objectType", obj.get("type", "wall")))
	var pos = obj.get("robos:position", [obj.get("x", 0), obj.get("y", 0)])
	var sz = obj.get("robos:size", [obj.get("w", 2), obj.get("h", 2)])
	var obj_id = str(obj.get("robos:objectId", obj.get("id", "")))
	var title = str(obj.get("dcterms:title", obj.get("label", obj_id)))

	var px = float(pos[0]) * TILE_SIZE
	var py = float(pos[1]) * TILE_SIZE
	var pw = float(sz[0]) * TILE_SIZE
	var ph = float(sz[1]) * TILE_SIZE

	if o_type in ["wall", "pillar", "dais"]:
		var sb = StaticBody2D.new()
		sb.name = "Wall_" + obj_id
		sb.position = Vector2(px + pw/2, py + ph/2)

		var cs = CollisionShape2D.new()
		var shape = RectangleShape2D.new()
		shape.size = Vector2(pw, ph)
		cs.shape = shape
		sb.add_child(cs)

		var visual = ColorRect.new()
		visual.position = Vector2(-pw/2, -ph/2)
		visual.size = Vector2(pw, ph)
		visual.color = Color(0.2, 0.25, 0.35, 0.8)
		sb.add_child(visual)

		$MapElements.add_child(sb)

	elif o_type in ["passage", "door", "portal"]:
		var area = Area2D.new()
		area.name = "Passage_" + obj_id
		area.position = Vector2(px + pw/2, py + ph/2)

		var cs = CollisionShape2D.new()
		var shape = RectangleShape2D.new()
		shape.size = Vector2(pw, ph)
		cs.shape = shape
		area.add_child(cs)

		var visual = ColorRect.new()
		visual.position = Vector2(-pw/2, -ph/2)
		visual.size = Vector2(pw, ph)
		visual.color = Color(0.2, 0.8, 0.4, 0.3)
		area.add_child(visual)

		var lbl = Label.new()
		lbl.text = "🚪 " + title
		lbl.position = Vector2(-pw/2, -ph/2 - 18)
		lbl.add_theme_font_size_override("font_size", 11)
		area.add_child(lbl)

		area.body_entered.connect(func(body):
			if body == hero or body.name == "HeroPlayer":
				_on_passage_entered(obj_id)
		)

		$MapElements.add_child(area)

func _spawn_map_npcs(map_slug: String) -> void:
	var characters = CartridgeManager.characters_cache
	for ch_slug in characters:
		var ch = characters[ch_slug]
		if not (ch is Dictionary):
			continue

		var loc = str(ch.get("robos:startingLocation", ch.get("location", ch.get("targetMap", ""))))
		var ctype = str(ch.get("characterType", ch.get("robos:characterType", ""))).to_lower()
		var is_boss = "boss" in ch_slug or ctype == "boss"
		var is_monster = "creature" in ch_slug or "goblin" in ch_slug or is_boss or ctype == "enemy"

		var should_spawn = false
		var spawn_coord = Vector2(25, 10)

		# Map-specific placements
		if map_slug == "throne-room" and ("king" in ch_slug or "alden" in ch_slug):
			should_spawn = true
			spawn_coord = Vector2(25, 6)
		elif map_slug == "throne-room" and "princess" in ch_slug and GameState.world_flags.get("princess_rescued", false):
			should_spawn = true
			spawn_coord = Vector2(28, 6)
		elif map_slug == "main-castle" and ("torvald" in ch_slug or "blacksmith" in ch_slug):
			should_spawn = true
			spawn_coord = Vector2(18, 12)
		elif map_slug == "main-castle" and "projection-goblin" in ch_slug and not GameState.world_flags.get("defeated_projection_goblin", false):
			should_spawn = true
			spawn_coord = Vector2(26, 12)
		elif map_slug == "dark-lord-lair" and ("malakor" in ch_slug or "boss" in ch_slug) and not GameState.world_flags.get("defeated_dark_lord", false):
			should_spawn = true
			spawn_coord = Vector2(25, 15)
		elif map_slug == "dark-lord-lair" and "princess" in ch_slug:
			should_spawn = true
			spawn_coord = Vector2(25, 8)

		if should_spawn:
			_create_interactive_npc(ch_slug, ch, spawn_coord, is_monster)

func _create_interactive_npc(slug: String, ch_data: Dictionary, coord: Vector2, is_monster: bool) -> void:
	var name_str = str(ch_data.get("name", ch_data.get("dcterms:title", slug)))
	var npc_node = CharacterBody2D.new()
	npc_node.name = "NPC_" + slug
	npc_node.position = Vector2(coord.x * TILE_SIZE, coord.y * TILE_SIZE)

	var cs = CollisionShape2D.new()
	var shape = CircleShape2D.new()
	shape.radius = 20.0
	cs.shape = shape
	npc_node.add_child(cs)

	var icon_lbl = Label.new()
	icon_lbl.text = "👑" if "king" in slug else ("👸" if "princess" in slug else ("🔨" if "blacksmith" in slug or "torvald" in slug else ("👹" if "goblin" in slug else ("💀" if "malakor" in slug else "👤"))))
	icon_lbl.add_theme_font_size_override("font_size", 24)
	icon_lbl.position = Vector2(-14, -28)
	npc_node.add_child(icon_lbl)

	var name_lbl = Label.new()
	name_lbl.text = name_str
	name_lbl.add_theme_font_size_override("font_size", 11)
	name_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4) if not is_monster else Color(1.0, 0.4, 0.4))
	name_lbl.position = Vector2(-40, 10)
	name_lbl.custom_minimum_size = Vector2(80, 20)
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	npc_node.add_child(name_lbl)

	var trigger_area = Area2D.new()
	var t_shape = CircleShape2D.new()
	t_shape.radius = 50.0
	var t_cs = CollisionShape2D.new()
	t_cs.shape = t_shape
	trigger_area.add_child(t_cs)
	npc_node.add_child(trigger_area)

	trigger_area.body_entered.connect(func(body):
		if body == hero or body.name == "HeroPlayer":
			_interact_with_npc(slug, ch_data, is_monster)
	)

	$MapElements.add_child(npc_node)
	spawned_npcs[slug] = npc_node

func _interact_with_npc(slug: String, ch_data: Dictionary, is_monster: bool) -> void:
	var name_str = str(ch_data.get("name", slug))
	print("💬 [CartridgeWorld] Interacting with NPC: ", name_str)

	if "king-alden" in slug:
		if GameState.world_flags.get("princess_rescued", false):
			_show_dialog(name_str, "By the heavens, you have delivered Princess Jennifer safely home! Caleb, you are the Savior of Eldoria! Total Victory is proclaimed across the realm!", [
				{"text": "🏆 Proclaim Victory", "action": func(): _trigger_victory()}
			])
		else:
			_show_dialog(name_str, "Sir Caleb! The wicked Dark Lord Malakor has kidnapped Princess Jennifer! Make haste to Master Torvald at the Dragonclaw Forge to claim the Hero's Sword, then slay the Dark Lord!", [
				{"text": "Accept Royal Quest", "action": func(): _on_accept_king_quest()}
			])

	elif "blacksmith-torvald" in slug:
		if GameState.world_flags.get("obtained_heros_sword", false):
			_show_dialog(name_str, "The Hero's Sword burns with true dragonfire in your hands, Caleb. The castle gates are open—venture into the World Realm and slay Malakor!", [
				{"text": "Understood", "action": func(): _close_dialog()}
			])
		elif GameState.world_flags.get("defeated_projection_goblin", false):
			_show_dialog(name_str, "Well fought! The projection broke beneath your blade. As promised, take the rune-forged Hero's Sword. The castle gate is unsealed.", [
				{"text": "🎁 Claim Hero's Sword", "action": func(): _on_claim_heros_sword()}
			])
		else:
			_show_dialog(name_str, "You seek the Hero's Sword for the King's quest? A blade like this is not given to the untested! Strike down my astral Projection Goblin to prove your valor!", [
				{"text": "⚔️ Begin Combat Trial", "action": func(): _on_begin_torvald_trial()}
			])

	elif "projection-goblin" in slug:
		_show_dialog("Projection Goblin", "Hsssk! Astral sparks crackle as the goblin lashes out!", [
			{"text": "⚔️ Attack with Steel", "action": func(): _on_defeat_projection_goblin(slug)}
		])

	elif "dark-lord-malakor" in slug:
		_show_dialog("Dark Lord Malakor", "Fools of Eldoria! Your kingdom will drown in shadows, and Princess Jennifer shall be my thrall!", [
			{"text": "⚔️ Strike with Hero's Sword", "action": func(): _on_defeat_dark_lord(slug)}
		])

	elif "princess-jennifer" in slug:
		if GameState.world_flags.get("defeated_dark_lord", false):
			_show_dialog("Princess Jennifer", "Sir Caleb! You came! You broke Malakor's shadow curse. Please, escort me back to Father in the Throne Room!", [
				{"text": "👸 Escort Princess Home", "action": func(): _on_escort_princess()}
			])
		else:
			_show_dialog("Princess Jennifer", "Beware, Sir Caleb! Dark Lord Malakor lurks nearby in the shadows!", [
				{"text": "Hold on Princess!", "action": func(): _close_dialog()}
			])

func _on_accept_king_quest() -> void:
	GameState.world_flags["talked_to_king"] = true
	if action_log:
		action_log.add_entry("King Alden commanded you to claim the Hero's Sword from Master Torvald.", "quest")
	_update_hud_status("Quest: Seek Master Torvald at Dragonclaw Forge")
	_close_dialog()

func _on_claim_heros_sword() -> void:
	GameState.world_flags["obtained_heros_sword"] = true
	GameState.add_item("heros-sword")
	if action_log:
		action_log.add_entry("Obtained: [b]Hero's Sword[/b] (+3 Atk, Dragonslayer)!", "loot")
	_update_hud_status("Quest: Venture into the World Realm to the Cavern Maw")
	_close_dialog()

func _on_defeat_projection_goblin(slug: String) -> void:
	GameState.world_flags["defeated_projection_goblin"] = true
	if action_log:
		action_log.add_entry("Sir Caleb struck down the Projection Goblin with ease! (16 DMG)", "combat")
	if spawned_npcs.has(slug):
		spawned_npcs[slug].queue_free()
		spawned_npcs.erase(slug)
	_close_dialog()

func _on_defeat_dark_lord(slug: String) -> void:
	GameState.world_flags["defeated_dark_lord"] = true
	if action_log:
		action_log.add_entry("The Hero's Sword cleaved Malakor's dark wards! Dark Lord Malakor is slain!", "combat")
	if spawned_npcs.has(slug):
		spawned_npcs[slug].queue_free()
		spawned_npcs.erase(slug)
	_close_dialog()

func _on_escort_princess() -> void:
	GameState.world_flags["princess_rescued"] = true
	if action_log:
		action_log.add_entry("Princess Jennifer joins your party. Escort her to the Throne Room!", "quest")
	_close_dialog()
	CartridgeManager.transition_to_map("throne-room", Vector2(25, 30))

func _on_begin_torvald_trial() -> void:
	if action_log:
		action_log.add_entry("Master Torvald conjured an Astral Projection Goblin!", "combat")
	_close_dialog()

func _show_dialog(speaker: String, text: String, options: Array) -> void:
	if not dialog_box:
		return
	dialog_speaker.text = speaker
	dialog_text.text = text

	for child in dialog_buttons.get_children():
		child.queue_free()

	for opt in options:
		var btn = Button.new()
		btn.text = opt.get("text", "Continue")
		btn.add_theme_font_size_override("font_size", 12)
		var act = opt.get("action", null)
		if act is Callable:
			btn.pressed.connect(act)
		dialog_buttons.add_child(btn)

	dialog_box.visible = true

func _close_dialog() -> void:
	if dialog_box:
		dialog_box.visible = false

func _trigger_victory() -> void:
	_close_dialog()
	action_log.add_entry("🏆 [b]CAMPAIGN COMPLETE: Total Victory in The Rescue of Princess Jennifer![/b]", "info")
	_show_dialog("Victory Proclamation", "With Dark Lord Malakor vanquished and Princess Jennifer safely restored to the throne, the bells of the High Kingdom chime in celebration of Sir Caleb's valor. You have won the campaign!", [
		{"text": "Restart Campaign", "action": func(): _on_restart_campaign()}
	])

func _on_restart_campaign() -> void:
	CartridgeManager.insert_cartridge("rescue-the-princess")
	CartridgeManager.embark_cartridge()

func _on_passage_entered(object_id: String) -> void:
	print("🚪 [CartridgeWorld] Passage triggered: ", object_id)
	for conn in active_connections:
		var from_obj = conn.get("fromObjectId")
		var to_obj = conn.get("toObjectId")
		var is_forward = (from_obj == object_id and conn.get("fromMap") == current_map_slug)
		var is_reverse = (conn.get("bidirectional", false) and to_obj == object_id and conn.get("toMap") == current_map_slug)

		if is_forward or is_reverse:
			var req_flag = conn.get("requiredFlag")
			if req_flag and not GameState.world_flags.get(req_flag, false):
				action_log.add_entry("The passage is sealed! Requires: [b]%s[/b]" % req_flag, "warning")
				return

			var target_map = conn.get("toMap") if is_forward else conn.get("fromMap")
			var target_spawn_arr = conn.get("toSpawn", [25, 20]) if is_forward else [25, 20]
			var target_spawn = Vector2(float(target_spawn_arr[0]), float(target_spawn_arr[1]))

			CartridgeManager.transition_to_map(target_map, target_spawn)
			return

func _on_map_transitioned(from_map: String, to_map: String, spawn: Vector2) -> void:
	_load_map(to_map, spawn)

func _update_hud_status(status_text: String) -> void:
	if hud and hud.has_method("update_display"):
		hud.update_display(status_text)
