extends Node2D

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var chest = $Footlocker
@onready var partner = $EloraNPC
@onready var partner_sprite: Sprite2D = $EloraNPC/Sprite
@onready var door = $FrontDoor
@onready var hero = $HeroPlayer

var elora_waypoints: Array[Vector2] = [Vector2(1180, 560), Vector2(1380, 560)]
var elora_wp_idx: int = 0
var elora_wait_timer: float = 2.0
var elora_anim_timer: float = 0.0
var elora_frame: int = 0
var elora_walk_textures: Array[Texture2D] = []
var elora_idle_textures: Array[Texture2D] = []

func _ready() -> void:
	print("Homestead loaded: Act 1 begins (2560x1440 Expansive Manor).")
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 2560, 1440)
	hud.update_display("Active Quest: A Night Without Memory (Stage 1: Talk to Elora)")
	partner.body_clicked.connect(talk_to_elora)
	chest.chest_opened.connect(open_footlocker)
	door.door_entered.connect(try_exit_to_village)
	
	_load_elora_textures()
	
	if has_node("FogOfWar"):
		if partner:
			$FogOfWar.register_actor(partner)
		if chest:
			$FogOfWar.register_actor(chest)
	
	# Auto-trigger opening dialogue on start
	talk_to_elora()

func get_nav_points() -> Array[Vector2]:
	return [
		# Barracks / Armory (West Room)
		Vector2(480, 680),   # Footlocker / chest
		Vector2(520, 560),   # North cots
		Vector2(520, 850),   # South weapon racks
		Vector2(760, 720),   # Barracks doorway west approach
		Vector2(870, 720),   # Doorway threshold
		# Great Hall (Center Room)
		Vector2(980, 720),   # Great Hall doorway east approach
		Vector2(1280, 560),  # Hearth / fireplace / Elora
		Vector2(1280, 720),  # Great Hall center
		Vector2(1280, 950),  # South archway entrance
		Vector2(1580, 720),  # East door approach
		Vector2(1690, 720),  # East doorway threshold
		# South Foyer
		Vector2(1280, 1080), # Foyer upper threshold
		Vector2(1280, 1200), # Foyer center
		Vector2(1280, 1280), # Front Door portal
		# East Wing (Study / Library)
		Vector2(1800, 720),  # Study doorway approach
		Vector2(2040, 720),  # Study scholar table
		Vector2(2040, 560),  # Study north
		Vector2(2040, 850),  # Study south
		# North Gallery
		Vector2(935, 400),   # Gallery west entry
		Vector2(1280, 300),  # Gallery center
		Vector2(1625, 400)   # Gallery east entry
	]

func _load_elora_textures() -> void:
	for i in range(4):
		var p_walk = "res://assets/sprites/characters/elora_npc_walk_%d.png" % i
		if ResourceLoader.exists(p_walk):
			elora_walk_textures.append(load(p_walk))
		var p_idle = "res://assets/sprites/characters/elora_npc_%d.png" % i
		if ResourceLoader.exists(p_idle):
			elora_idle_textures.append(load(p_idle))

func _process(delta: float) -> void:
	if action_log and action_log.is_dialogue_active:
		# Face hero during dialogue
		if partner_sprite and hero:
			partner_sprite.flip_h = (hero.global_position.x > partner.global_position.x)
		return

	if elora_wait_timer > 0.0:
		elora_wait_timer -= delta
		# Play gentle idle animation
		elora_anim_timer += delta
		if elora_anim_timer >= 0.4 and elora_idle_textures.size() > 0:
			elora_anim_timer = 0.0
			elora_frame = (elora_frame + 1) % elora_idle_textures.size()
			partner_sprite.texture = elora_idle_textures[elora_frame]
		return

	var dest = elora_waypoints[elora_wp_idx]
	var dist = partner.global_position.distance_to(dest)
	if dist > 4.0:
		var dir = partner.global_position.direction_to(dest)
		partner.global_position += dir * (70.0 * delta)
		partner_sprite.flip_h = (dir.x > 0)
		
		# Cycle walk frames
		elora_anim_timer += delta
		if elora_anim_timer >= 0.18 and elora_walk_textures.size() > 0:
			elora_anim_timer = 0.0
			elora_frame = (elora_frame + 1) % elora_walk_textures.size()
			partner_sprite.texture = elora_walk_textures[elora_frame]
	else:
		elora_wait_timer = randf_range(4.0, 7.0)
		elora_wp_idx = (elora_wp_idx + 1) % elora_waypoints.size()

func talk_to_elora() -> void:
	if hero and partner_sprite:
		partner_sprite.flip_h = (hero.global_position.x > partner.global_position.x)
	var dial = DataStore.dialogue_trees.get("partner-confrontation", {})
	if action_log:
		action_log.start_dialogue(dial, "node_wake")
	GameState.flags.partner_conversed = true
	GameState.advance_quest(2)
	hud.update_display("Active Quest: Loot footlocker & head outside")
	if GameState.party_members.size() < 2:
		GameState.add_party_member({
			"id": "elora",
			"name": "Elora",
			"race": "elf",
			"class": "rogue",
			"hp": 10,
			"max_hp": 10,
			"ac": 14,
			"level": 1,
			"portrait": "res://assets/portraits/portrait_elora.png",
			"weapon": "hunting-bow",
			"armor": "leather-armor",
			"spells": [],
			"status_effects": []
		})
		var comp_scene = load("res://scenes/PartyCompanion.tscn")
		if comp_scene and not has_node("PartyCompanion"):
			var comp = comp_scene.instantiate()
			comp.global_position = partner.global_position
			add_child(comp)
			partner.visible = false
			partner.process_mode = Node.PROCESS_MODE_DISABLED
			partner.position = Vector2(-9999, -9999)

func open_footlocker() -> void:
	if action_log and action_log.is_dialogue_active:
		action_log.close_dialogue()
	if not GameState.flags.get("footlocker_looted", false):
		GameState.flags.footlocker_looted = true
		if GameState.hero_class == "rogue":
			GameState.add_item("hunting-bow")
			GameState.equipped_weapon = "hunting-bow"
		GameState.add_item("service-sword")
		GameState.add_item("potion-healing")
		GameState.add_chest()
		show_notice("Acquired Equipment and Potion of Healing from Footlocker!")
		hud.update_display("Active Quest: Step outside into Oakhaven Village")

func try_exit_to_village() -> void:
	if not GameState.flags.get("footlocker_looted", false):
		show_notice("You should check your footlocker before heading out into danger!")
		return
	get_tree().change_scene_to_file("res://scenes/VillageSquare.tscn")

func show_notice(text: String) -> void:
	msg_label.text = text
	msg_label.visible = true
	await get_tree().create_timer(3.0).timeout
	msg_label.visible = false
