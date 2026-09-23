extends Node2D

const TrapClass = preload("res://scripts/Trap.gd")

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr = $CombatManager
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var hero = $HeroPlayer
@onready var sarcophagus = $GrandSarcophagus
@onready var archer = $SkeletonArcher
@onready var guardian = $CryptGuardian

func _ready() -> void:
	print("Ancient Catacombs loaded: Act 4 begins (2560x1440 Dungeon Crypt).")
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 2560, 1440)
	hud.update_display("Active Quest: Breach Royal Sarcophagus & Enter Citadel")

	if GameState.party_members.size() > 1 and not has_node("PartyCompanion"):
		var comp_scene = load("res://scenes/PartyCompanion.tscn")
		if comp_scene:
			var comp = comp_scene.instantiate()
			comp.global_position = hero.global_position + Vector2(-48, 24)
			add_child(comp)
			if has_node("FogOfWar"):
				$FogOfWar.register_actor(comp)

	if sarcophagus:
		sarcophagus.chest_opened.connect(func():
			GameState.add_item("garrison-key")
			show_notice("Recovered Ancient Garrison Key from the Royal Sarcophagus!")
			hud.update_display("Active Quest: Unlock Garrison Keep Vault Passage")
		)

	for child in get_children():
		if child is TrapClass:
			child.trap_detected.connect(func(_t, by):
				show_notice("⚠️ Concealed Trap Spotted by %s!" % by)
			)
			child.trap_disarmed.connect(func(_t, by):
				show_notice("🔧 Trap Successfully Disarmed by %s!" % by)
			)
			child.trap_triggered.connect(func(_t, vic):
				show_notice("💥 TRAP SPRUNG on %s!" % vic)
			)

	if archer:
		var wa: Array[Vector2] = [Vector2(1100, 640), Vector2(1200, 640)]
		archer.waypoints = wa
		archer.hound_slain.connect(func(): _on_undead_slain("Skeleton Archer"))
		archer.body_clicked.connect(func(): _engage_undead(archer))

	if guardian:
		var wg: Array[Vector2] = [Vector2(1700, 600), Vector2(1850, 600)]
		guardian.waypoints = wg
		guardian.hound_slain.connect(func(): _on_undead_slain("Crypt Guardian"))
		guardian.body_clicked.connect(func(): _engage_undead(guardian))

	if has_node("FogOfWar"):
		var fow = $FogOfWar
		if archer: fow.register_actor(archer)
		if guardian: fow.register_actor(guardian)
		for child in get_children():
			if child is CharacterBody2D and child != hero and child != archer and child != guardian:
				fow.register_actor(child)

func get_nav_points() -> Array[Vector2]:
	return [
		# West entrance vault
		Vector2(240, 680),
		Vector2(420, 680),
		# Subterranean main corridor (avoids tomb colliders)
		Vector2(650, 720),
		Vector2(950, 720),
		Vector2(1280, 720),
		Vector2(1600, 720),
		# Grand Sarcophagus dais
		Vector2(1280, 540),
		Vector2(1280, 420),
		# East vault & Secret passage approach
		Vector2(1950, 680),
		Vector2(2150, 560),
		Vector2(2350, 420)
	]

func _engage_undead(target: Node2D) -> void:
	if not is_instance_valid(target) or target.get("current_state") == 3:
		return
	hero.approach_and_interact(target.global_position, 60.0, func():
		hero.play_attack(target.global_position, func():
			var ac = target.armor_class if "armor_class" in target else 13
			var res = combat_mgr.execute_attack(GameState.hero_name, 8, 22, 30, target.name, ac)
			if is_instance_valid(target):
				var comp = find_child("PartyCompanion", true, false)
				if comp and comp.has_method("attack_target"):
					comp.attack_target(target)
				target.take_damage(99)
			return res
		)
	)

func _on_undead_slain(u_name: String) -> void:
	GameState.add_kill()
	show_notice("★ Undead %s destroyed! ★" % u_name)

func show_notice(text: String) -> void:
	msg_label.text = text
	msg_label.visible = true
	await get_tree().create_timer(3.0).timeout
	msg_label.visible = false
