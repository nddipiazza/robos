extends Node2D

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr = $CombatManager
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var hero = $HeroPlayer
@onready var wolf1 = $DireWolf
@onready var wolf2 = $ForestStalker

func _ready() -> void:
	print("Whispering Forest loaded: Act 3 begins (2560x1440 Wilderness).")
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 2560, 1440)
	hud.update_display("Active Quest: Traverse Whispering Forest & Reach Catacombs")

	if GameState.party_members.size() > 1 and not has_node("PartyCompanion"):
		var comp_scene = load("res://scenes/PartyCompanion.tscn")
		if comp_scene:
			var comp = comp_scene.instantiate()
			comp.global_position = hero.global_position + Vector2(-48, 24)
			add_child(comp)
			if has_node("FogOfWar"):
				$FogOfWar.register_actor(comp)

	if wolf1:
		var w1: Array[Vector2] = [Vector2(1000, 740), Vector2(1150, 720)]
		wolf1.waypoints = w1
		wolf1.hound_slain.connect(func(): _on_beast_slain("Dire Wolf"))
		wolf1.body_clicked.connect(func(): _engage_beast(wolf1))

	if wolf2:
		var w2: Array[Vector2] = [Vector2(1700, 680), Vector2(1850, 700)]
		wolf2.waypoints = w2
		wolf2.hound_slain.connect(func(): _on_beast_slain("Forest Stalker"))
		wolf2.body_clicked.connect(func(): _engage_beast(wolf2))

	if has_node("FogOfWar"):
		var fow = $FogOfWar
		if wolf1: fow.register_actor(wolf1)
		if wolf2: fow.register_actor(wolf2)
		for child in get_children():
			if child is CharacterBody2D and child != hero and child != wolf1 and child != wolf2:
				fow.register_actor(child)

func get_nav_points() -> Array[Vector2]:
	return [
		# West entrance & ruins
		Vector2(180, 720),
		Vector2(320, 720),
		Vector2(450, 720),
		Vector2(620, 720),
		Vector2(430, 880),
		Vector2(620, 880),
		# Approach to bridge
		Vector2(850, 720),
		Vector2(1050, 740),
		Vector2(1200, 750),
		# Stone Bridge Crossing (avoids deep river colliders)
		Vector2(1340, 750),
		Vector2(1440, 750),
		Vector2(1580, 750),
		# East riverbank
		Vector2(1750, 720),
		Vector2(1950, 680),
		Vector2(1950, 480),
		# Crypt approach & portal
		Vector2(2150, 520),
		Vector2(2380, 400)
	]

func _engage_beast(beast: Node2D) -> void:
	if not is_instance_valid(beast) or beast.get("current_state") == 3:
		return
	hero.approach_and_interact(beast.global_position, 60.0, func():
		hero.play_attack(beast.global_position, func():
			var ac = beast.armor_class if "armor_class" in beast else 12
			var res = combat_mgr.execute_attack(GameState.hero_name, 7, 20, 30, beast.name, ac)
			if is_instance_valid(beast):
				var comp = find_child("PartyCompanion", true, false)
				if comp and comp.has_method("attack_target"):
					comp.attack_target(beast)
				beast.take_damage(99)
			return res
		)
	)

func _on_beast_slain(beast_name: String) -> void:
	GameState.add_kill()
	show_notice("★ %s vanquished! ★" % beast_name)

func show_notice(text: String) -> void:
	msg_label.text = text
	msg_label.visible = true
	await get_tree().create_timer(3.0).timeout
	msg_label.visible = false
