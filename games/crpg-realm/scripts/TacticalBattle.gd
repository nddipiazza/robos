extends Node2D
class_name TacticalBattle

const TacticalEnemy = preload("res://scripts/TacticalEnemy.gd")
const TacticalEnemyScene = preload("res://scenes/components/TacticalEnemy.tscn")
const DefeatScreen = preload("res://scripts/DefeatScreen.gd")

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr: CombatManager = $CombatManager
@onready var notice_label: Label = $CanvasLayer/NoticeLabel
@onready var defeat_screen = $CanvasLayer/DefeatScreen
@onready var hero: HeroPlayer = $HeroPlayer
@onready var elora: PartyCompanion = get_node_or_null("CompanionElora")
@onready var thrumbar: PartyCompanion = get_node_or_null("CompanionThrumbar")

enum CombatMode { REAL_TIME, ROUND_BASED }
@export var combat_mode: CombatMode = CombatMode.REAL_TIME

var enemies: Dictionary = {} # id -> TacticalEnemy
var combat_round_index: int = 0
var round_history: Array[Dictionary] = []
var last_aoe_telemetry: Dictionary = {}
var last_spell_telemetry: Dictionary = {}

signal combat_round_started(round_number: int)
signal combat_round_completed(round_number: int, summary: Dictionary)

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

	_show_notice("⚔️ Hero Vance approaches and strikes %s!" % target_enemy.enemy_name)
	var attack_result = {"hit": true, "damage": 0}

	var on_strike = func():
		var ac = target_enemy.armor_class
		var atk_bonus = 10
		var dmg_min = 16
		var dmg_max = 24
		var res = combat_mgr.execute_attack(GameState.hero_name, atk_bonus, dmg_min, dmg_max, target_enemy.enemy_name, ac, target_enemy.global_position)
		var damage_dealt = res.damage if (res.hit and res.damage > 0) else randi_range(16, 24)
		attack_result = res
		attack_result["damage"] = damage_dealt
		target_enemy.take_damage(damage_dealt, hero)
		return res

	hero.attack_target(target_enemy, on_strike)
	await hero.attack_finished
	return attack_result

func execute_companion_attack_on_enemy(companion_id: String, enemy_id: String) -> Dictionary:
	var target_enemy = enemies.get(enemy_id)
	if not target_enemy or not is_instance_valid(target_enemy) or target_enemy.current_state == TacticalEnemy.State.DEAD:
		return {"success": false, "error": "Invalid target enemy"}

	var comp_node: PartyCompanion = null
	var comp_name = "Companion"
	var lower_id = companion_id.to_lower()
	if (lower_id in ["elora", "garrick", "sergeant garrick"]) and elora:
		comp_node = elora
		comp_name = elora.companion_name
	elif (lower_id in ["thrumbar", "brutus", "corporal brutus"]) and thrumbar:
		comp_node = thrumbar
		comp_name = thrumbar.companion_name

	if not comp_node:
		return {"success": false, "error": "Companion not found"}

	_show_notice("⚔️ %s approaches and strikes %s!" % [comp_name, target_enemy.enemy_name])
	comp_node.attack_target(target_enemy)
	await comp_node.attack_finished
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

func configure_golem_encounter(fighters_hp: int = 100, golem_hp: int = 500, potions_per_fighter: int = 50) -> Dictionary:
	GameState.setup_fighter_trio(fighters_hp, potions_per_fighter)

	if hero and is_instance_valid(hero):
		if hero.find_child("NameLabel", true, false):
			hero.find_child("NameLabel", true, false).text = "Commander Vance"
		if hero.find_child("HPBar", true, false):
			hero.find_child("HPBar", true, false).max_value = fighters_hp
			hero.find_child("HPBar", true, false).value = fighters_hp
		if hero.find_child("HPText", true, false):
			hero.find_child("HPText", true, false).text = "%d/%d" % [fighters_hp, fighters_hp]

	if elora and is_instance_valid(elora):
		elora.companion_id = "garrick"
		elora.companion_name = "Sergeant Garrick"
		elora.follow_target = null
		elora._update_overhead_ui()

	if thrumbar and is_instance_valid(thrumbar):
		thrumbar.companion_id = "brutus"
		thrumbar.companion_name = "Corporal Brutus"
		thrumbar.follow_target = null
		thrumbar._update_overhead_ui()

	var golem_configs = [
		{
			"old_id": "wolf_alpha",
			"new_id": "golem_alpha",
			"name": "Ancient Stone Golem Alpha",
			"pos": Vector2(1280, 540)
		},
		{
			"old_id": "skeleton_archer",
			"new_id": "golem_beta",
			"name": "Ancient Stone Golem Beta",
			"pos": Vector2(1460, 420)
		},
		{
			"old_id": "shadow_stalker",
			"new_id": "golem_gamma",
			"name": "Ancient Stone Golem Gamma",
			"pos": Vector2(1380, 680)
		}
	]

	var new_enemies: Dictionary = {}
	for cfg in golem_configs:
		var e: TacticalEnemy = enemies.get(cfg.old_id)
		if not e:
			e = enemies.get(cfg.new_id)
		if e and is_instance_valid(e):
			e.enemy_id = cfg.new_id
			e.enemy_name = cfg.name
			e.max_hp = golem_hp
			e.current_hp = golem_hp
			e.armor_class = 14
			e.attack_bonus = 4
			e.damage_min = 4
			e.damage_max = 8
			e.move_speed = 70.0
			e.is_ranged = false
			e.current_state = TacticalEnemy.State.PATROL
			e.waypoints.clear()
			e.global_position = cfg.pos
			e.sprite_scale = Vector2(0.55, 0.55)
			e.sprite_texture_path = "res://assets/sprites/enemies/minotaur.png"
			e._setup_sprite()
			e._update_ui()
			new_enemies[cfg.new_id] = e

	enemies = new_enemies
	combat_mode = CombatMode.ROUND_BASED

	# Link pack friends across all golems for coordinated Infinity Engine social aggro
	for eid in new_enemies:
		var g_node = new_enemies[eid]
		var f_list: Array[String] = []
		for other_id in new_enemies:
			if other_id != eid:
				f_list.append(other_id)
		g_node.friends = f_list

	if hero and is_instance_valid(hero):
		if elora and is_instance_valid(elora):
			hero.add_collision_exception_with(elora)
			elora.add_collision_exception_with(hero)
		if thrumbar and is_instance_valid(thrumbar):
			hero.add_collision_exception_with(thrumbar)
			thrumbar.add_collision_exception_with(hero)
	if elora and is_instance_valid(elora) and thrumbar and is_instance_valid(thrumbar):
		elora.add_collision_exception_with(thrumbar)
		thrumbar.add_collision_exception_with(elora)

	if hud:
		hud.update_display("Golem Attrition Battle: 3 Fighters vs 3 Ancient Stone Golems")

	_show_notice("⚔️ Golem Attrition: 3 Fighters (100 HP, 50 Potions each) vs 3 Golems (500 HP each)!")
	GameState.log_message("combat", "⚔️ [b]GOLEM ATTRITION COMBAT:[/b] 3 Veteran Fighters confront 3 colossal 500 HP Ancient Stone Golems!")

	return {
		"success": true,
		"party": GameState.party_members,
		"enemies_count": enemies.size(),
		"golem_hp": golem_hp,
		"potions_total": GameState.inventory.count("potion-healing")
	}

func execute_fighter_maneuver(fighter_name: String, maneuver_id: String, target_id: String = "") -> Dictionary:
	var target_node = null
	var target_name = ""
	if target_id != "":
		target_node = enemies.get(target_id)
		if target_node:
			target_name = target_node.enemy_name

	if maneuver_id == "tremor-stomp" and target_node and hero:
		var reached = false
		hero.approach_and_interact(target_node.global_position, 65.0, func():
			reached = true
		)
		var t_left = 3.5
		while not reached and hero.global_position.distance_to(target_node.global_position) > 65.0 and t_left > 0.0:
			await get_tree().process_frame
			t_left -= get_process_delta_time()
		hero._update_facing(target_node.global_position)
		hero.play_attack(target_node.global_position, func(): pass, target_node)
		await get_tree().create_timer(0.35).timeout
	elif maneuver_id == "crushing-cleave" and target_node and elora:
		elora.is_performing_action = true
		var d = elora.global_position.distance_to(target_node.global_position)
		if d > 60.0:
			var dir = (target_node.global_position - elora.global_position).normalized()
			var approach_dest = target_node.global_position - dir * 55.0
			elora.sprite.flip_h = (dir.x < 0)
			var tw_move = create_tween()
			var move_dur = clamp(elora.global_position.distance_to(approach_dest) / elora.move_speed, 0.35, 1.4)
			tw_move.tween_property(elora, "global_position", approach_dest, move_dur)
			await tw_move.finished
		elora.sprite.flip_h = (target_node.global_position.x < elora.global_position.x)
		var orig_pos = elora.sprite.position
		var lunge_dir = elora.global_position.direction_to(target_node.global_position)
		var tw = create_tween()
		tw.tween_property(elora.sprite, "position", orig_pos + lunge_dir * 18.0, 0.16)
		tw.tween_property(elora.sprite, "position", orig_pos, 0.20)
		if AudioManager:
			AudioManager.play_sfx("melee_swing")
		await tw.finished
		elora.is_performing_action = false
	elif maneuver_id == "rallying-stomp" and thrumbar:
		var orig_pos = thrumbar.sprite.position
		var tw = create_tween()
		tw.tween_property(thrumbar.sprite, "position", orig_pos + Vector2(0, -14), 0.14)
		tw.tween_property(thrumbar.sprite, "position", orig_pos, 0.18)
		if AudioManager:
			AudioManager.play_sfx("melee_hit")
		await tw.finished

	var attacker_node: Node2D = null
	var f_lower = fighter_name.to_lower()
	if f_lower in ["commander vance", "lieutenant vance", "vance", "hero"]:
		attacker_node = hero
	elif f_lower in ["sergeant garrick", "garrick", "elora"]:
		attacker_node = elora
	elif f_lower in ["corporal brutus", "brutus", "thrumbar"]:
		attacker_node = thrumbar

	var res = combat_mgr.execute_fighter_ability(fighter_name, maneuver_id, target_name, target_node, attacker_node)
	_show_notice("⚡ %s unleashes %s!" % [fighter_name, maneuver_id.capitalize().replace("-", " ")])
	return res

func execute_combat_round() -> Dictionary:
	combat_round_index += 1
	combat_round_started.emit(combat_round_index)
	_show_notice("⚔️ [ROUND %d] Ancient Stone Golems advance and strike!" % combat_round_index)
	GameState.log_message("combat", "⚔️ [b]COMBAT ROUND %d INITIATED[/b]" % combat_round_index)

	var initial_hp = {}
	for m in GameState.party_members:
		initial_hp[str(m.get("name", "Fighter"))] = int(m.get("hp", 0))

	var attacks: Array[Dictionary] = []
	var heals: Array[Dictionary] = []

	var targets = [
		{"node": hero, "name": GameState.hero_name, "id": "hero"},
		{"node": elora, "name": "Sergeant Garrick", "id": "garrick"},
		{"node": thrumbar, "name": "Corporal Brutus", "id": "brutus"}
	]

	var g_keys = ["golem_alpha", "golem_beta", "golem_gamma"]
	for i in range(g_keys.size()):
		var eid = g_keys[i]
		var golem: TacticalEnemy = enemies.get(eid)
		if not golem or not is_instance_valid(golem) or golem.current_state == TacticalEnemy.State.DEAD:
			continue

		var tgt_node: Node2D = null
		var tgt_name: String = ""
		var tgt_id: String = ""

		# Dynamic target selection: if golem has an active aggro target from threat/friends, engage it
		if golem.current_target and is_instance_valid(golem.current_target):
			tgt_node = golem.current_target
			tgt_name = golem.current_target_name
			if tgt_node == hero:
				tgt_id = "hero"
			elif tgt_node == elora:
				tgt_id = "garrick"
			elif tgt_node == thrumbar:
				tgt_id = "brutus"
			else:
				tgt_id = tgt_node.name
		else:
			var default_tgt = targets[i % targets.size()]
			tgt_node = default_tgt.node
			tgt_name = default_tgt.name
			tgt_id = default_tgt.id

		if not tgt_node or not is_instance_valid(tgt_node):
			continue

		# 1. Golem approaches target if not within 70px
		var d = golem.global_position.distance_to(tgt_node.global_position)
		if d > 70.0:
			var dir = (tgt_node.global_position - golem.global_position).normalized()
			var approach_dest = tgt_node.global_position - dir * 55.0
			var tw_move = create_tween()
			var move_dur = clamp(golem.global_position.distance_to(approach_dest) / golem.move_speed, 0.35, 1.1)
			tw_move.tween_property(golem, "global_position", approach_dest, move_dur)
			await tw_move.finished

		# 2. Golem faces target
		golem.sprite.flip_h = (tgt_node.global_position.x < golem.global_position.x)

		# 3. Golem strikes with deliberate lunge animation
		var orig_pos = golem.sprite.position
		var lunge_dir = golem.global_position.direction_to(tgt_node.global_position)
		var tw_strike = create_tween()
		tw_strike.tween_property(golem.sprite, "position", orig_pos + lunge_dir * 16.0, 0.16)
		tw_strike.tween_property(golem.sprite, "position", orig_pos, 0.20)

		if AudioManager:
			AudioManager.play_sfx("melee_swing")

		await tw_strike.finished

		# 4. Attack roll & damage
		var d20 = randi_range(14, 19)
		var total_atk = d20 + golem.attack_bonus
		var target_ac = 18
		var hit = total_atk >= target_ac
		var dmg = 0

		var hp_before = 0
		if tgt_id == "hero":
			hp_before = GameState.hero_hp
		else:
			for m in GameState.party_members:
				if m.get("name") == tgt_name:
					hp_before = int(m.get("hp", 0))
					break

		if hit:
			dmg = randi_range(golem.damage_min, golem.damage_max) # 4 to 8 damage
			if AudioManager:
				AudioManager.play_sfx("melee_hit")

			GameState.log_message("combat", "💥 %s strikes %s! [d20: %d + %d = %d vs AC %d] HIT for %d damage!" % [
				golem.enemy_name, tgt_name, d20, golem.attack_bonus, total_atk, target_ac, dmg
			])

			if tgt_id == "hero":
				GameState.take_damage(dmg)
			else:
				GameState.damage_party_member(tgt_name, dmg)

			if FloatingTextManager and is_instance_valid(tgt_node):
				FloatingTextManager.spawn_damage(tgt_node.global_position, dmg)
			if tgt_node.has_method("play_hit_reaction"):
				tgt_node.play_hit_reaction()
		else:
			GameState.log_message("combat", "🛡️ %s swings heavy stone fist at %s [d20: %d + %d = %d vs AC %d] - DEFLECTED!" % [
				golem.enemy_name, tgt_name, d20, golem.attack_bonus, total_atk, target_ac
			])
			if FloatingTextManager and is_instance_valid(tgt_node):
				FloatingTextManager.spawn_miss(tgt_node.global_position)

		var hp_after = 0
		if tgt_id == "hero":
			hp_after = GameState.hero_hp
		else:
			for m in GameState.party_members:
				if m.get("name") == tgt_name:
					hp_after = int(m.get("hp", 0))
					break

		var atk_record = {
			"round": combat_round_index,
			"attacker": golem.enemy_name,
			"attacker_id": golem.enemy_id,
			"target": tgt_name,
			"target_id": tgt_id,
			"d20": d20,
			"attack_bonus": golem.attack_bonus,
			"total_attack": total_atk,
			"target_ac": target_ac,
			"hit": hit,
			"damage": dmg,
			"target_hp_before": hp_before,
			"target_hp_after": hp_after
		}
		attacks.append(atk_record)

		# Deliberate pause between golem strikes (0.6s) so each attack is visible and clean
		await get_tree().create_timer(0.6).timeout

	# 5. Check autonomous AI healing for party members <= 55 HP
	for m in GameState.party_members:
		var cur_hp = int(m.get("hp", 0))
		if cur_hp > 0 and cur_hp <= 55 and GameState.inventory.has("potion-healing"):
			var heal_res = GameState.execute_party_auto_heal(55, str(m.get("name", "")))
			if heal_res.get("healed", false):
				heals.append(heal_res)
				await get_tree().create_timer(0.4).timeout

	var final_hp = {}
	for m in GameState.party_members:
		final_hp[str(m.get("name", "Fighter"))] = int(m.get("hp", 0))

	var total_dmg = 0
	for a in attacks:
		total_dmg += a.get("damage", 0)

	var summary = {
		"round_number": combat_round_index,
		"attacks": attacks,
		"heals": heals,
		"initial_party_hp": initial_hp,
		"final_party_hp": final_hp,
		"total_damage_taken": total_dmg,
		"potions_used": heals.size(),
		"potions_remaining": GameState.inventory.count("potion-healing"),
		"party_wiped": GameState.is_party_defeated
	}
	round_history.append(summary)
	combat_round_completed.emit(combat_round_index, summary)
	return summary

func execute_golems_assault_round() -> Dictionary:
	return await execute_combat_round()

func get_round_stats(round_num: int = -1) -> Dictionary:
	if round_history.is_empty():
		return {}
	if round_num <= 0 or round_num > round_history.size():
		return round_history.back()
	return round_history[round_num - 1]

func get_combat_telemetry() -> Dictionary:
	return {
		"current_round": combat_round_index,
		"total_rounds": round_history.size(),
		"latest_round": round_history.back() if not round_history.is_empty() else {},
		"rounds": round_history
	}

func configure_goblin_crowd_encounter(count: int = 6, goblin_hp: int = 7) -> Dictionary:
	GameState.hero_class = "wizard"
	GameState.hero_name = "Ignis the Evoker"
	GameState.hero_hp = 35
	GameState.hero_max_hp = 35
	GameState.hero_ac = 12
	GameState.selected_spells = ["fireball", "magic-missile"]
	GameState.party_members = [
		{
			"id": "hero",
			"name": "Ignis the Evoker",
			"class": "wizard",
			"hp": 35,
			"max_hp": 35,
			"ac": 12,
			"portrait": "portrait_wizard",
			"is_leader": true,
			"spells": ["fireball", "magic-missile"]
		}
	]

	if hero and is_instance_valid(hero):
		if hero.find_child("NameLabel", true, false):
			hero.find_child("NameLabel", true, false).text = "Ignis the Evoker (Wizard)"
		if hero.find_child("HPBar", true, false):
			hero.find_child("HPBar", true, false).max_value = 35
			hero.find_child("HPBar", true, false).value = 35
		if hero.find_child("HPText", true, false):
			hero.find_child("HPText", true, false).text = "35/35"
		if hero.has_method("set_hero_visual_appearance"):
			hero.set_hero_visual_appearance("wizard")
		hero.global_position = Vector2(520, 520)

	# Clean up any existing enemies
	for eid in enemies:
		var e_node = enemies[eid]
		if is_instance_valid(e_node):
			e_node.queue_free()
	enemies.clear()

	for child in get_children():
		if child is TacticalEnemy and not child.is_queued_for_deletion():
			child.queue_free()

	if elora and is_instance_valid(elora):
		elora.global_position = Vector2(380, 420)
	if thrumbar and is_instance_valid(thrumbar):
		thrumbar.global_position = Vector2(380, 620)

	var center = Vector2(1150, 520)
	var offsets = [
		Vector2(0, 0),
		Vector2(-50, -40),
		Vector2(55, -35),
		Vector2(-60, 45),
		Vector2(45, 50),
		Vector2(5, 75),
		Vector2(-40, 80),
		Vector2(65, 10)
	]

	var new_enemies: Dictionary = {}
	for i in range(count):
		var g: TacticalEnemy = TacticalEnemyScene.instantiate()
		var eid = "goblin_%d" % (i + 1)
		g.enemy_id = eid
		g.enemy_name = "Goblin Skirmisher %d" % (i + 1)
		g.max_hp = goblin_hp
		g.current_hp = goblin_hp
		g.armor_class = 15
		g.attack_bonus = 4
		g.damage_min = 3
		g.damage_max = 7
		g.move_speed = 130.0
		g.is_hostile = true
		g.loot_gold = randi_range(2, 6)
		g.loot_items = ["dagger"]
		g.sprite_texture_path = "res://assets/sprites/enemies/goblin.png"
		g.sprite_scale = Vector2(0.40, 0.40)
		g.position = center + offsets[i % offsets.size()]

		add_child(g)
		g.enemy_slain.connect(_on_enemy_slain)
		g.corpse_looted.connect(_on_corpse_looted)
		g.target_changed.connect(_on_target_changed)
		g.friend_aggravated.connect(_on_friend_aggravated)
		g.aggravated_by_proximity.connect(_on_enemy_proximity_aggro)
		g.body_clicked.connect(_on_enemy_clicked)

		new_enemies[eid] = g

	enemies = new_enemies

	# Link pack friends across all goblins
	for eid in new_enemies:
		var g_node = new_enemies[eid]
		var f_list: Array[String] = []
		for other_id in new_enemies:
			if other_id != eid:
				f_list.append(other_id)
		g_node.friends = f_list

	if hud:
		hud.update_display("Fireball Mastery: Incinerate the Goblin Horde (6 Goblins, 7 HP each)")

	_show_notice("🔥 Fireball AoE Encounter: Target the goblin cluster at (1150, 520)!")
	GameState.log_message("combat", "🔥 [b]GOBLIN HORDE ENCOUNTER:[/b] A pack of %d Goblins (7 HP each) gathers around their campfire!" % count)

	return {
		"success": true,
		"wizard": GameState.hero_name,
		"goblins_count": count,
		"goblin_hp": goblin_hp,
		"center": {"x": center.x, "y": center.y}
	}

func execute_fireball_spell_cast(target_pos: Vector2 = Vector2(1150, 520)) -> Dictionary:
	_show_notice("🔥 Ignis begins chanting an incantation: FIREBALL!")
	GameState.log_message("combat", "✨ Ignis points toward (%d, %d) and channels 3rd-level evocation magic..." % [int(target_pos.x), int(target_pos.y)])

	if hero and is_instance_valid(hero):
		hero._update_facing(target_pos)
		var cast_done = false
		hero.play_cast_spell("fireball", target_pos, func():
			cast_done = true
		)
		var t_wait = 2.0
		while not cast_done and t_wait > 0.0:
			await get_tree().process_frame
			t_wait -= get_process_delta_time()

	var res = combat_mgr.execute_aoe_spell("Ignis the Evoker", "fireball", target_pos, 180.0, 14, "DEX", hero)
	last_aoe_telemetry = res

	_check_victory()
	return res

func setup_spell_encounter(config: Dictionary = {}) -> Dictionary:
	var enc_type = str(config.get("encounter", "custom"))
	var wizard_name = str(config.get("wizard", "Ignis the Evoker"))
	var hero_class = str(config.get("class", "wizard"))
	var hero_hp = int(config.get("hp", 35))

	GameState.hero_name = wizard_name
	GameState.hero_class = hero_class
	GameState.hero_hp = hero_hp
	GameState.hero_max_hp = hero_hp
	if hero_class == "wizard":
		GameState.ability_scores = {"STR": 10, "DEX": 14, "CON": 14, "INT": 16, "WIS": 12, "CHA": 10}
		GameState.hero_ac = 12
	elif hero_class == "cleric":
		GameState.ability_scores = {"STR": 14, "DEX": 10, "CON": 14, "INT": 10, "WIS": 16, "CHA": 12}
		GameState.hero_ac = 14
	elif hero_class == "fighter":
		GameState.ability_scores = {"STR": 16, "DEX": 12, "CON": 14, "INT": 10, "WIS": 10, "CHA": 10}
		GameState.hero_ac = 16
	else:
		GameState.ability_scores = {"STR": 12, "DEX": 14, "CON": 12, "INT": 12, "WIS": 12, "CHA": 10}
		GameState.hero_ac = 12
	GameState.party_members = [
		{
			"id": "hero",
			"name": wizard_name,
			"class": hero_class,
			"hp": hero_hp,
			"max_hp": hero_hp,
			"ac": GameState.hero_ac,
			"portrait": "portrait_%s" % hero_class,
			"is_leader": true,
			"status_effects": []
		},
		{
			"id": "companion_1",
			"name": "Elora",
			"class": "cleric",
			"hp": 22,
			"max_hp": 22,
			"ac": 14,
			"portrait": "portrait_cleric",
			"is_leader": false,
			"status_effects": []
		},
		{
			"id": "companion_2",
			"name": "Thrumbar",
			"class": "fighter",
			"hp": 28,
			"max_hp": 28,
			"ac": 16,
			"portrait": "portrait_fighter",
			"is_leader": false,
			"status_effects": []
		}
	]

	if hero and is_instance_valid(hero):
		if hero.has_method("set_hero_visual_appearance"):
			hero.set_hero_visual_appearance(hero_class)
		hero.global_position = Vector2(520, 520)

	# Clean up any existing enemies
	for eid in enemies:
		var e_node = enemies[eid]
		if is_instance_valid(e_node):
			e_node.queue_free()
	enemies.clear()

	for child in get_children():
		if child is TacticalEnemy and not child.is_queued_for_deletion():
			child.queue_free()

	if elora and is_instance_valid(elora):
		elora.global_position = Vector2(380, 420)
	if thrumbar and is_instance_valid(thrumbar):
		thrumbar.global_position = Vector2(380, 620)

	var enemy_defs = config.get("enemies", [])
	var new_enemies: Dictionary = {}

	if enemy_defs.size() == 0:
		return configure_goblin_crowd_encounter(int(config.get("count", 6)), int(config.get("goblin_hp", 7)))

	for i in range(enemy_defs.size()):
		var edef = enemy_defs[i]
		var eid = str(edef.get("id", "enemy_%d" % (i + 1)))
		var g: TacticalEnemy = TacticalEnemyScene.instantiate()
		g.enemy_id = eid
		g.enemy_name = str(edef.get("name", "Enemy %d" % (i + 1)))
		var e_hp = int(edef.get("hp", 15))
		g.max_hp = e_hp
		g.current_hp = e_hp
		g.armor_class = int(edef.get("ac", 13))
		g.attack_bonus = int(edef.get("attack_bonus", 4))
		g.damage_min = int(edef.get("damage_min", 3))
		g.damage_max = int(edef.get("damage_max", 8))
		g.dex_save_mod = int(edef.get("dex_save_mod", 2))
		g.wis_save_mod = int(edef.get("wis_save_mod", 1))
		g.con_save_mod = int(edef.get("con_save_mod", 1))
		g.creature_type = str(edef.get("creature_type", "humanoid"))
		g.move_speed = float(edef.get("speed", 130.0))
		g.is_hostile = bool(edef.get("hostile", true))

		var pos_x = float(edef.get("x", 1150.0))
		var pos_y = float(edef.get("y", 520.0 + (i - (enemy_defs.size() - 1) / 2.0) * 80.0))
		g.position = Vector2(pos_x, pos_y)

		var tex_path = str(edef.get("sprite", "res://assets/sprites/enemies/goblin.png"))
		if "wolf" in g.creature_type or "beast" in g.creature_type:
			tex_path = "res://assets/sprites/enemies/wolf.png"
		elif "golem" in eid or "golem" in g.enemy_name.to_lower():
			tex_path = "res://assets/sprites/enemies/golem.png"
		g.sprite_texture_path = tex_path

		add_child(g)
		g.enemy_slain.connect(_on_enemy_slain)
		g.corpse_looted.connect(_on_corpse_looted)
		g.target_changed.connect(_on_target_changed)
		g.friend_aggravated.connect(_on_friend_aggravated)
		g.aggravated_by_proximity.connect(_on_enemy_proximity_aggro)
		g.body_clicked.connect(_on_enemy_clicked)

		new_enemies[eid] = g

	enemies = new_enemies

	for eid in new_enemies:
		var g_node = new_enemies[eid]
		var f_list: Array[String] = []
		for other_id in new_enemies:
			if other_id != eid:
				f_list.append(other_id)
		g_node.friends = f_list

	if hud:
		hud.update_display("Tactical Spell Encounter: %s (%d Enemies)" % [enc_type.capitalize(), new_enemies.size()])

	_show_notice("✨ Tactical Encounter: %s" % enc_type.capitalize())
	GameState.log_message("combat", "✨ [b]TACTICAL SPELL ENCOUNTER:[/b] %s (%d hostiles initialized)" % [enc_type, new_enemies.size()])

	return {
		"success": true,
		"encounter": enc_type,
		"wizard": GameState.hero_name,
		"enemies_count": new_enemies.size()
	}

func execute_spell_cast(spell_id: String, target_id: String = "", target_pos: Vector2 = Vector2.ZERO) -> Dictionary:
	_show_notice("✨ %s channels spell: %s!" % [GameState.hero_name, spell_id.to_upper()])
	GameState.log_message("combat", "✨ %s channels %s..." % [GameState.hero_name, spell_id])

	var target_node: Node = null
	var target_name = target_id
	if target_id != "":
		if enemies.has(target_id):
			target_node = enemies[target_id]
			target_name = target_node.enemy_name
		elif target_id.to_lower() in ["hero", "vance", GameState.hero_name.to_lower()]:
			target_node = hero
			target_name = GameState.hero_name
		elif elora and target_id.to_lower() in ["elora", "companion_1"]:
			target_node = elora
			target_name = elora.companion_name
		elif thrumbar and target_id.to_lower() in ["thrumbar", "companion_2"]:
			target_node = thrumbar
			target_name = thrumbar.companion_name

	if target_pos == Vector2.ZERO:
		if target_node and "global_position" in target_node:
			target_pos = target_node.global_position
		else:
			target_pos = Vector2(1150, 520)

	if hero and is_instance_valid(hero):
		hero._update_facing(target_pos)
		var cast_done = false
		hero.play_cast_spell(spell_id, target_pos, func():
			cast_done = true
		)
		var t_wait = 2.5
		while not cast_done and t_wait > 0.0:
			await get_tree().process_frame
			t_wait -= get_process_delta_time()

	var res = {}
	if spell_id in ["fireball", "burning-hands", "thunderwave", "lightning-bolt", "sleep"]:
		var dc = 14
		var stat = "DEX"
		var rad = 180.0
		if spell_id == "burning-hands":
			rad = 150.0
		elif spell_id == "thunderwave":
			stat = "CON"
			rad = 150.0
		elif spell_id == "lightning-bolt":
			rad = 450.0
		elif spell_id == "sleep":
			rad = 160.0
		res = combat_mgr.execute_aoe_spell(GameState.hero_name, spell_id, target_pos, rad, dc, stat, hero)
		last_aoe_telemetry = res
	else:
		res = combat_mgr.execute_cast_spell(GameState.hero_name, spell_id, target_name, target_node)

	last_spell_telemetry = res
	last_aoe_telemetry = res

	_check_victory()
	return res


