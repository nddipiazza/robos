extends Node2D
class_name TacticalBattle

const TacticalEnemy = preload("res://scripts/TacticalEnemy.gd")
const DefeatScreen = preload("res://scripts/DefeatScreen.gd")

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr: CombatManager = $CombatManager
@onready var notice_label: Label = $CanvasLayer/NoticeLabel
@onready var defeat_screen = $CanvasLayer/DefeatScreen
@onready var hero: HeroPlayer = $HeroPlayer
@onready var elora: PartyCompanion = get_node_or_null("CompanionElora")
@onready var thrumbar: PartyCompanion = get_node_or_null("CompanionThrumbar")

var enemies: Dictionary = {} # id -> TacticalEnemy

func _ready() -> void:
	print("[TacticalBattle] Battlefield loaded (1920x1080 Arena).")
	GameState.setup_tactical_party()

	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 1920, 1080)

	if hud:
		hud.update_display("Tactical Skirmish: Engage enemy pack & protect the party")

	# Register all TacticalEnemy children
	for child in get_children():
		if child is TacticalEnemy:
			enemies[child.enemy_id] = child
			child.enemy_slain.connect(_on_enemy_slain)
			child.corpse_looted.connect(_on_corpse_looted)
			child.target_changed.connect(_on_target_changed)
			child.friend_aggravated.connect(_on_friend_aggravated)
			child.aggravated_by_proximity.connect(_on_enemy_proximity_aggro)
			child.body_clicked.connect(_on_enemy_clicked)

	GameState.party_defeated.connect(_on_party_defeated)
	if defeat_screen:
		defeat_screen.retry_pressed.connect(reset_encounter)

	_show_notice("⚔️ Tactical Encounter: Manage party threat & defeat the enemy pack!")
	GameState.log_message("combat", "⚔️ [b]TACTICAL COMBAT INITIATED:[/b] 3 enemies confront your party!")

func _on_enemy_clicked(enemy: TacticalEnemy) -> void:
	if enemy.current_state == TacticalEnemy.State.DEAD:
		loot_enemy_corpse(enemy.enemy_id)
		return

	var sel = GameState.selected_party_indices
	if sel.has(1) and not sel.has(0) and not sel.has(2):
		execute_companion_attack_on_enemy("elora", enemy.enemy_id)
	elif sel.has(2) and not sel.has(0) and not sel.has(1):
		execute_companion_attack_on_enemy("thrumbar", enemy.enemy_id)
	elif sel.has(0) and not sel.has(1) and not sel.has(2):
		execute_hero_attack_on_enemy(enemy.enemy_id)
	else:
		if sel.has(0): execute_hero_attack_on_enemy(enemy.enemy_id)
		if sel.has(1): execute_companion_attack_on_enemy("elora", enemy.enemy_id)
		if sel.has(2): execute_companion_attack_on_enemy("thrumbar", enemy.enemy_id)

func _on_enemy_slain(enemy: TacticalEnemy) -> void:
	_show_notice("★ %s vanquished! Corpse can be searched for loot." % enemy.enemy_name)
	_check_victory()

func _on_corpse_looted(enemy: TacticalEnemy, _looter: Node2D) -> void:
	_show_notice("💰 Acquired %d GP from %s's corpse!" % [enemy.loot_gold, enemy.enemy_name])

func _on_target_changed(enemy: TacticalEnemy, _new_target: Node2D, target_name: String) -> void:
	_show_notice("⚡ %s aggro pivoted to %s!" % [enemy.enemy_name, target_name])

func _on_enemy_proximity_aggro(enemy: TacticalEnemy, intruder: Node2D, distance: float) -> void:
	var i_name = intruder.companion_name if intruder is PartyCompanion else GameState.hero_name
	_show_notice("⚠️ Hostile %s aggravated by %s within %dpx!" % [enemy.enemy_name, i_name, int(distance)])

func _on_friend_aggravated(friend: TacticalEnemy, victim: TacticalEnemy, _attacker: Node2D) -> void:
	_show_notice("⚠️ Pack Alert: %s rallied to support %s!" % [friend.enemy_name, victim.enemy_name])

func _on_party_defeated() -> void:
	_show_notice("💀 Your party has been wiped out!")
	if defeat_screen:
		defeat_screen.open()

func _check_victory() -> bool:
	var all_dead = true
	for eid in enemies:
		if enemies[eid].current_state != TacticalEnemy.State.DEAD:
			all_dead = false
			break
	if all_dead:
		_show_notice("🏆 VICTORY! All enemies have been vanquished!")
		GameState.log_message("quest", "★ Tactical Victory! The battlefield has been cleansed! ★")
		return true
	return false

# ── Tactical Party Commands ───────────────────────────────────────────────────

func execute_hero_attack_on_enemy(enemy_id: String) -> Dictionary:
	var target_enemy = enemies.get(enemy_id)
	if not target_enemy or not is_instance_valid(target_enemy) or target_enemy.current_state == TacticalEnemy.State.DEAD:
		return {"success": false, "error": "Invalid target enemy"}

	_show_notice("⚔️ Hero Vance strikes %s!" % target_enemy.enemy_name)
	var ac = target_enemy.armor_class
	var atk_bonus = 10
	var dmg_min = 30
	var dmg_max = 32
	var res = combat_mgr.execute_attack(GameState.hero_name, atk_bonus, dmg_min, dmg_max, target_enemy.enemy_name, ac, target_enemy.global_position)

	var damage_dealt = clamp(res.damage if (res.hit and res.damage > 0) else randi_range(30, 32), 30, 32)
	target_enemy.take_damage(damage_dealt, hero)
	return res

func execute_companion_attack_on_enemy(companion_id: String, enemy_id: String) -> Dictionary:
	var target_enemy = enemies.get(enemy_id)
	if not target_enemy or not is_instance_valid(target_enemy) or target_enemy.current_state == TacticalEnemy.State.DEAD:
		return {"success": false, "error": "Invalid target enemy"}

	var comp_node: PartyCompanion = null
	var comp_name = "Companion"
	if companion_id == "elora" and elora:
		comp_node = elora
		comp_name = "Elora"
	elif companion_id == "thrumbar" and thrumbar:
		comp_node = thrumbar
		comp_name = "Thrumbar"

	if not comp_node:
		return {"success": false, "error": "Companion not found"}

	_show_notice("🏹 %s attacks %s!" % [comp_name, target_enemy.enemy_name])
	comp_node.attack_target(target_enemy)
	return {"success": true, "companion": comp_name, "target": enemy_id}

func execute_taunt_on_enemy(source_name: String, enemy_id: String) -> Dictionary:
	var target_enemy = enemies.get(enemy_id)
	if not target_enemy or not is_instance_valid(target_enemy) or target_enemy.current_state == TacticalEnemy.State.DEAD:
		return {"success": false, "error": "Invalid target enemy"}

	var source_node: Node2D = hero
	if source_name == "Elora" and elora:
		source_node = elora
	elif source_name == "Thrumbar" and thrumbar:
		source_node = thrumbar

	target_enemy.force_taunt(source_node, 60)
	_show_notice("🛡️ %s taunts %s, drawing total aggro!" % [source_name, target_enemy.enemy_name])
	return {"success": true, "taunter": source_name, "target_enemy": enemy_id}

func loot_enemy_corpse(enemy_id: String) -> Dictionary:
	var target_enemy = enemies.get(enemy_id)
	if not target_enemy or not is_instance_valid(target_enemy):
		return {"success": false, "error": "Enemy not found"}

	if hero and is_instance_valid(hero):
		hero.move_to_point(target_enemy.global_position + Vector2(24, 0))

	var res = target_enemy.loot_corpse(hero)
	return res

func execute_enemy_strike_on_party_member(enemy_id: String, target_name: String, lethal: bool = true) -> Dictionary:
	var enemy = enemies.get(enemy_id)
	if not enemy or not is_instance_valid(enemy) or enemy.current_state == TacticalEnemy.State.DEAD:
		return {"success": false, "error": "Enemy not available or dead"}

	var target_node: Node2D = null
	var t_display_name = target_name
	var target_is_hero = false

	var lower_tgt = target_name.to_lower()
	if lower_tgt in ["hero", "vance", "lieutenant vance"]:
		target_node = hero
		t_display_name = GameState.hero_name
		target_is_hero = true
	elif lower_tgt in ["elora"]:
		target_node = elora
		t_display_name = "Elora"
	elif lower_tgt in ["thrumbar"]:
		target_node = thrumbar
		t_display_name = "Thrumbar"

	if not target_node or not is_instance_valid(target_node):
		return {"success": false, "error": "Target node not found: %s" % target_name}

	# Face target
	enemy.sprite.flip_h = (target_node.global_position.x < enemy.global_position.x)

	# Attack animation: lunge towards target
	var tw = create_tween()
	var orig_pos = enemy.sprite.position
	var lunge_dir = enemy.global_position.direction_to(target_node.global_position)
	tw.tween_property(enemy.sprite, "position", orig_pos + lunge_dir * 18.0, 0.12)
	tw.tween_property(enemy.sprite, "position", orig_pos, 0.16)

	# If skeleton archer, spawn visual projectile towards target
	if enemy.is_ranged:
		var arrow = Sprite2D.new()
		arrow.texture = load("res://assets/props/arrow.png") if ResourceLoader.exists("res://assets/props/arrow.png") else load("res://assets/props/selection_circle_blue.png")
		arrow.global_position = enemy.global_position + Vector2(0, -10)
		arrow.z_index = 88
		arrow.look_at(target_node.global_position)
		add_child(arrow)
		var atw = arrow.create_tween()
		atw.tween_property(arrow, "global_position", target_node.global_position, 0.22)
		atw.tween_callback(func(): arrow.queue_free())

	var dmg = 25
	if lethal:
		if target_is_hero:
			dmg = max(18, GameState.hero_hp + 5)
		else:
			var cur_m_hp = 10
			for m in GameState.party_members:
				if m.get("id") == lower_tgt or m.get("name") == t_display_name:
					cur_m_hp = m.get("hp", 10)
					break
			dmg = max(18, cur_m_hp + 5)

	# Attack roll logging
	var d20 = 20 if lethal else randi_range(15, 19)
	GameState.log_message("combat", "⚔️ %s strikes %s! [d20: %d CRITICAL HIT] for %d lethal damage!" % [
		enemy.enemy_name, t_display_name, d20, dmg
	])

	# Spawn floating text over victim
	if FloatingTextManager:
		FloatingTextManager.spawn_damage(target_node.global_position, dmg, true, "critical")

	# Target reaction
	if target_node.has_method("play_hit_reaction"):
		target_node.play_hit_reaction()

	# Deal damage
	if target_is_hero:
		GameState.take_damage(dmg)
	else:
		GameState.damage_party_member(t_display_name, dmg)

	_show_notice("⚠️ %s struck %s down with a fatal blow!" % [enemy.enemy_name, t_display_name])

	return {
		"success": true,
		"enemy": enemy.enemy_name,
		"target": t_display_name,
		"damage": dmg,
		"target_fallen": true,
		"party_wiped": GameState.is_party_defeated
	}

func reset_encounter() -> void:
	print("[TacticalBattle] Resetting encounter state...")
	GameState.retry_encounter()
	if defeat_screen:
		defeat_screen.close()

	if hero and is_instance_valid(hero):
		hero.sprite.rotation_degrees = 0.0
		hero.sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)
	if elora and is_instance_valid(elora):
		elora.sprite.rotation_degrees = 0.0
		elora.sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)
	if thrumbar and is_instance_valid(thrumbar):
		thrumbar.sprite.rotation_degrees = 0.0
		thrumbar.sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)

	# Reset all enemies
	var init_positions = {
		"wolf_alpha": Vector2(1280, 540),
		"skeleton_archer": Vector2(1460, 420),
		"shadow_stalker": Vector2(1380, 680)
	}

	for eid in enemies:
		var e = enemies[eid]
		if is_instance_valid(e):
			e.current_state = TacticalEnemy.State.PATROL
			e.is_hostile = true
			e.current_hp = e.max_hp
			e.is_looted = false
			e.threat_table.clear()
			e.current_target = null
			e.current_target_name = ""
			e.sprite.rotation_degrees = 0.0
			e.sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)
			if e.has_node("CollisionShape2D"):
				e.get_node("CollisionShape2D").set_deferred("disabled", false)
			if init_positions.has(eid):
				e.global_position = init_positions[eid]
			e._update_ui()

	_show_notice("⚔️ Encounter reset! Battle begins anew!")

func _show_notice(text: String) -> void:
	if notice_label:
		notice_label.text = text
		notice_label.visible = true
		var tw = create_tween()
		tw.tween_interval(3.0)
		tw.tween_callback(func():
			if notice_label:
				notice_label.visible = false
		)
