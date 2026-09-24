class_name TacticalEnemy
extends CharacterBody2D

signal enemy_slain(enemy: TacticalEnemy)
signal corpse_looted(enemy: TacticalEnemy, looter: Node2D)
signal body_clicked(enemy: TacticalEnemy)
signal target_changed(enemy: TacticalEnemy, new_target: Node2D, target_name: String)
signal friend_aggravated(friend: TacticalEnemy, victim: TacticalEnemy, attacker: Node2D)
signal aggravated_by_proximity(enemy: TacticalEnemy, intruder: Node2D, distance: float)

@export var enemy_id: String = "enemy_1"
@export var enemy_name: String = "Corrupted Wolf Alpha"
@export var creature_type: String = "humanoid" # "humanoid", "beast", "construct", "undead"
@export var is_hostile: bool = true:
	set(val):
		is_hostile = val
		_update_ui()
@export var max_hp: int = 28
@export var armor_class: int = 13
@export var attack_bonus: int = 4
@export var damage_min: int = 4
@export var damage_max: int = 10
@export var dex_save_mod: int = 2
@export var wis_save_mod: int = 1
@export var con_save_mod: int = 1
@export var move_speed: float = 140.0
@export var aggro_radius: float = 280.0
@export var pack_friend_radius: float = 480.0
@export var pack_alert_radius: float = 950.0
@export var friends: Array[String] = []
@export var sprite_texture_path: String = "res://assets/sprites/enemies/wolf.png"
@export var sprite_scale: Vector2 = Vector2(0.38, 0.38)
@export var is_ranged: bool = false
@export var ranged_standoff_distance: float = 240.0
@export var waypoints: Array[Vector2] = []

@export var loot_gold: int = 25
@export var loot_items: Array[String] = ["potion-healing"]

enum State { PATROL, CHASE, ATTACK, DEAD }
var current_state: State = State.PATROL
var current_hp: int = 28
var is_looted: bool = false

# Infinity Engine Threat Table
var threat_table: Dictionary = {} # ActorName -> int
var direct_damage_table: Dictionary = {} # ActorName -> int
var current_target: Node2D = null
var current_target_name: String = ""

# Internal Timers
var current_wp_idx: int = 0
var wait_timer: float = 0.0
var attack_cooldown: float = 0.0
var target_eval_timer: float = 0.0

func _is_round_based_mode() -> bool:
	var cur_sc = get_tree().current_scene if get_tree() else null
	if cur_sc and "combat_mode" in cur_sc and cur_sc.combat_mode == 1:
		return true
	return false

@onready var sprite: Sprite2D = $Sprite
@onready var hp_bar: ProgressBar = find_child("HPBar", true, false)
@onready var hp_text: Label = find_child("HPText", true, false)
@onready var name_label: Label = find_child("NameLabel", true, false)
@onready var target_label: Label = find_child("TargetLabel", true, false)
@onready var selection_circle: Sprite2D = find_child("SelectionCircle", true, false)
@onready var loot_indicator: Sprite2D = find_child("LootIndicator", true, false)

var is_down_prone: bool = false
var orig_sprite_pos: Vector2 = Vector2.ZERO
var _was_prone: bool = false

func _ready() -> void:
	current_hp = max_hp
	_setup_sprite()
	_update_ui()
	GameState.settings_changed.connect(_update_ui)
	GameState.status_effects_changed.connect(_on_status_effects_changed)
	GameState.inventory_changed.connect(_update_visibility_visuals)
	_update_prone_state()
	_update_visibility_visuals()

func _on_status_effects_changed(_target: String) -> void:
	_update_prone_state()
	_update_visibility_visuals()
	_update_ui()

func is_invisible() -> bool:
	return GameState.is_invisible(enemy_name) or GameState.is_invisible(enemy_id)

func is_sanctuaried() -> bool:
	return GameState.has_status_effect(enemy_name, "sanctuary") or GameState.has_status_effect(enemy_id, "sanctuary")

func can_be_seen_by_player() -> bool:
	if not is_invisible():
		return true
	# IE rule: true sight only pierces invisibility within the seer's visual range + LOS
	return GameState.can_see_invisible_at(global_position)

func can_be_targeted_by_player() -> bool:
	if current_state == State.DEAD:
		return false
	if is_invisible() and not can_be_seen_by_player():
		return false
	if is_sanctuaried():
		return false
	return true

func _update_visibility_visuals() -> void:
	if current_state == State.DEAD:
		visible = true
		if sprite:
			sprite.visible = true
		return

	if is_invisible():
		if not can_be_seen_by_player():
			# Invisible enemies are NOT visible at all!
			visible = false
			if sprite:
				sprite.visible = false
		else:
			# Player can see invisibility (via equipment or enchantment)
			visible = true
			if sprite:
				sprite.visible = true
				if not is_down_prone:
					# Ethereal true-sight shimmer: pale spectral tint, clearly readable but still "not really there"
					sprite.modulate = Color(0.95, 1.1, 1.45, 0.6)
	else:
		visible = true
		if sprite:
			sprite.visible = true
			if not is_down_prone:
				sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)

func is_prone() -> bool:
	return GameState.has_status_effect(enemy_name, "prone") or GameState.has_status_effect(enemy_id, "prone")

func _update_prone_state() -> void:
	if current_state == State.DEAD:
		return
	var should_be_prone = is_prone()
	if should_be_prone and not is_down_prone:
		knock_down_prone()
	elif not should_be_prone and is_down_prone:
		stand_up_from_prone()

func knock_down_prone() -> void:
	if is_down_prone or current_state == State.DEAD:
		return
	is_down_prone = true
	_was_prone = true
	velocity = Vector2.ZERO
	if target_label:
		target_label.text = "[PRONE - Down for Turn]"
		target_label.modulate = Color(1.0, 0.75, 0.2)
	
	if sprite:
		if orig_sprite_pos == Vector2.ZERO:
			orig_sprite_pos = sprite.position
		var tw = create_tween()
		var target_rot = -85.0 if sprite.flip_h else 85.0
		tw.parallel().tween_property(sprite, "rotation_degrees", target_rot, 0.25)
		tw.parallel().tween_property(sprite, "position", orig_sprite_pos + Vector2(0, 10.0), 0.25)
		tw.parallel().tween_property(sprite, "modulate", Color(0.9, 0.85, 0.75, 0.95), 0.25)
	
	if FloatingTextManager:
		FloatingTextManager.spawn_text(global_position + Vector2(0, -30), "KNOCKED DOWN!", Color(1.0, 0.8, 0.2))
	GameState.log_message("combat", "💥 %s was knocked down flat on the ground! (Prone - unable to attack or sprint for 1 turn)" % enemy_name)
	GameState.record_event("prone_start", {"actor": enemy_name, "actor_id": enemy_id, "actor_kind": "enemy", "position": [global_position.x, global_position.y]})

func stand_up_from_prone() -> void:
	if not is_down_prone or current_state == State.DEAD:
		return
	is_down_prone = false
	_was_prone = false
	if target_label:
		target_label.text = ("Target: %s" % current_target_name) if current_target_name != "" else ""
		target_label.modulate = Color(1.0, 0.35, 0.35)
	
	if sprite:
		var tw = create_tween()
		tw.parallel().tween_property(sprite, "rotation_degrees", 0.0, 0.30)
		tw.parallel().tween_property(sprite, "position", orig_sprite_pos if orig_sprite_pos != Vector2.ZERO else Vector2.ZERO, 0.30)
		tw.parallel().tween_property(sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.30)
	
	if FloatingTextManager:
		FloatingTextManager.spawn_text(global_position + Vector2(0, -30), "STANDS UP!", Color(0.4, 0.9, 1.0))
	GameState.log_message("combat", "🧍 %s spends effort and stands back up from prone." % enemy_name)
	GameState.record_event("prone_end", {"actor": enemy_name, "actor_id": enemy_id, "actor_kind": "enemy"})

func _setup_sprite() -> void:
	if sprite and ResourceLoader.exists(sprite_texture_path):
		sprite.texture = load(sprite_texture_path)
		sprite.scale = sprite_scale

func _update_ui() -> void:
	if hp_bar:
		hp_bar.max_value = max_hp
		hp_bar.value = current_hp
		_style_hp_bar()
	if hp_text:
		hp_text.text = "%d/%d" % [current_hp, max_hp]
	if name_label:
		if not is_hostile and current_state != State.DEAD:
			name_label.text = "%s [Passive]" % enemy_name
			name_label.modulate = Color(0.75, 0.88, 0.75)
		else:
			name_label.text = enemy_name
			name_label.modulate = Color(1.0, 0.45, 0.45)
	if target_label:
		if current_state == State.DEAD:
			target_label.text = "[Lootable Corpse]" if not is_looted else "[Empty Corpse]"
			target_label.modulate = Color(1.0, 0.85, 0.2) if not is_looted else Color(0.6, 0.6, 0.6)
		elif is_down_prone:
			target_label.text = "[PRONE - Down for Turn]"
			target_label.modulate = Color(1.0, 0.75, 0.2)
		elif is_sanctuaried():
			target_label.text = "🕊️ [SANCTUARY - Untargetable]"
			target_label.modulate = Color(1.0, 0.85, 0.2)
		elif current_target_name != "":
			target_label.text = "Target: %s" % current_target_name
			target_label.modulate = Color(1.0, 0.35, 0.35)
		else:
			target_label.text = ""

	_update_visibility_visuals()

	var mode = GameState.settings.get("health_bar_mode", "always")
	var is_visible = true
	match mode:
		"always": is_visible = (current_state != State.DEAD)
		"injured_only": is_visible = (current_hp < max_hp and current_state != State.DEAD)
		"none": is_visible = false
	if hp_bar: hp_bar.visible = is_visible and can_be_seen_by_player()
	if hp_text: hp_text.visible = is_visible and can_be_seen_by_player()

var _hp_fill_style: StyleBoxFlat = null
var _hp_bg_style: StyleBoxFlat = null

func _style_hp_bar() -> void:
	# Infinity-Engine style hostile health bar: crimson fill that darkens as the creature weakens
	if _hp_fill_style == null:
		_hp_fill_style = StyleBoxFlat.new()
		_hp_fill_style.set_corner_radius_all(2)
		_hp_bg_style = StyleBoxFlat.new()
		_hp_bg_style.bg_color = Color(0.08, 0.06, 0.07, 0.9)
		_hp_bg_style.border_color = Color(0.0, 0.0, 0.0, 0.9)
		_hp_bg_style.set_border_width_all(1)
		_hp_bg_style.set_corner_radius_all(2)
		hp_bar.add_theme_stylebox_override("fill", _hp_fill_style)
		hp_bar.add_theme_stylebox_override("background", _hp_bg_style)
	var pct = float(current_hp) / max(1.0, float(max_hp))
	if not is_hostile:
		_hp_fill_style.bg_color = Color(0.55, 0.75, 0.55, 1.0)
	elif pct > 0.5:
		_hp_fill_style.bg_color = Color(0.9, 0.18, 0.16, 1.0)
	elif pct > 0.25:
		_hp_fill_style.bg_color = Color(0.95, 0.55, 0.12, 1.0)
	else:
		_hp_fill_style.bg_color = Color(0.6, 0.08, 0.08, 1.0)

var _vis_poll_timer: float = 0.0
var _last_seen_by_player: bool = true

func _process(delta: float) -> void:
	# Invisible creatures pop in/out of view as true-sight wearers move in or out of visual range
	if current_state == State.DEAD or not is_invisible():
		return
	_vis_poll_timer -= delta
	if _vis_poll_timer > 0.0:
		return
	_vis_poll_timer = 0.12
	var seen = can_be_seen_by_player()
	if seen != _last_seen_by_player:
		_last_seen_by_player = seen
		_update_ui()
		var seer = GameState.get_leader_node()
		var d = seer.global_position.distance_to(global_position) if seer else -1.0
		GameState.record_event("true_sight_reveal" if seen else "true_sight_lost", {
			"target_id": enemy_id, "target": enemy_name, "distance_px": d,
			"visual_range_px": GameState.VISUAL_RANGE_PX,
			"line_of_sight": GameState.has_line_of_sight(seer.global_position, global_position) if seer else false,
			"sprite_opacity": sprite.modulate.a if sprite else 1.0})
		if seen and FloatingTextManager:
			FloatingTextManager.spawn_text(global_position + Vector2(0, -40), "REVEALED BY TRUE SIGHT", Color(0.7, 0.85, 1.0))

func _physics_process(delta: float) -> void:
	if current_state == State.DEAD or GameState.is_game_paused:
		velocity = Vector2.ZERO
		return

	if is_prone() or is_down_prone:
		if not is_down_prone:
			knock_down_prone()
		velocity = Vector2.ZERO
		return

	if not is_prone() and is_down_prone:
		stand_up_from_prone()

	if GameState.has_status_effect(enemy_name, "paralyzed") or GameState.has_status_effect(enemy_name, "unconscious") or GameState.has_status_effect(enemy_name, "asleep"):
		velocity = Vector2.ZERO
		return

	if current_target and (GameState.is_invisible(current_target_name) or (current_target_name == GameState.hero_name and GameState.is_invisible(GameState.hero_name))):
		current_target = null
		current_target_name = ""
		current_state = State.PATROL
		_update_ui()

	target_eval_timer -= delta
	if target_eval_timer <= 0.0:
		target_eval_timer = 0.45
		_evaluate_proximity_aggro()
		_update_visibility_visuals()

	match current_state:
		State.PATROL:
			_process_patrol(delta)
		State.CHASE:
			_process_chase(delta)
		State.ATTACK:
			_process_attack(delta)

	if velocity.x < -4.0:
		sprite.flip_h = true
	elif velocity.x > 4.0:
		sprite.flip_h = false

# ── Infinity Engine Threat & Aggro System ─────────────────────────────────────

func _evaluate_proximity_aggro() -> void:
	if current_state == State.DEAD:
		return
	if not is_hostile:
		return
	
	var candidates: Array[Node2D] = _get_party_candidates()
	if candidates.is_empty():
		return

	if current_state == State.PATROL or current_target == null or not is_instance_valid(current_target):
		var closest: Node2D = null
		var min_d = aggro_radius
		for c in candidates:
			var d = global_position.distance_to(c.global_position)
			if d <= min_d:
				min_d = d
				closest = c
		if closest:
			current_state = State.CHASE
			_set_aggro_target(closest, 30, "Hostile Proximity")
			var intruder_name = _get_actor_name(closest)
			GameState.log_message("combat", "⚠️ %s is hostile and aggravated by proximity to %s (Distance: %dpx)!" % [
				enemy_name, intruder_name, int(min_d)
			])
			if FloatingTextManager:
				FloatingTextManager.spawn_text(global_position, "⚠️ AGGRAVATED!", Color(1.0, 0.45, 0.1, 1.0))
			aggravated_by_proximity.emit(self, closest, min_d)
			_alert_friends_proximity(closest, min_d)

func add_threat(source: Node2D, amount: int, reason: String = "Damage") -> void:
	if not source or not is_instance_valid(source) or current_state == State.DEAD:
		return

	var s_name = _get_actor_name(source)
	var prev_threat = int(threat_table.get(s_name, 0))
	var new_threat = prev_threat + amount
	threat_table[s_name] = new_threat

	var cur_threat = int(threat_table.get(current_target_name, 0))
	var should_switch = false

	if current_target == null or not is_instance_valid(current_target):
		should_switch = true
	elif source != current_target:
		var cur_direct = int(direct_damage_table.get(current_target_name, 0))
		var new_direct = int(direct_damage_table.get(s_name, 0))
		if cur_direct == 0 and new_direct > 0:
			should_switch = true
		elif new_threat > int(cur_threat * 1.15) + 3:
			should_switch = true

	if should_switch:
		_set_aggro_target(source, new_threat, reason)

func force_taunt(source: Node2D, taunt_threat: int = 50) -> void:
	if not source or not is_instance_valid(source) or current_state == State.DEAD:
		return
	var s_name = _get_actor_name(source)
	threat_table[s_name] = int(threat_table.get(s_name, 0)) + taunt_threat
	_set_aggro_target(source, threat_table[s_name], "Taunt")
	GameState.log_message("combat", "🛡️ %s taunted %s! Aggro forcefully diverted!" % [s_name, enemy_name])

func _set_aggro_target(new_target: Node2D, threat_val: int, reason: String) -> void:
	var t_name = _get_actor_name(new_target)
	if GameState.is_invisible(t_name) or (t_name == GameState.hero_name and GameState.is_invisible(GameState.hero_name)):
		return

	var old_target_name = current_target_name
	current_target = new_target
	current_target_name = _get_actor_name(new_target)
	current_state = State.CHASE
	_update_ui()
	target_changed.emit(self, new_target, current_target_name)

	if old_target_name != "" and old_target_name != current_target_name:
		GameState.log_message("combat", "⚡ %s switches target to %s (Aggravated by %s, Threat: %d)!" % [
			enemy_name, current_target_name, reason, threat_val
		])
	else:
		GameState.log_message("combat", "⚡ %s targets %s (%s, Threat: %d)!" % [
			enemy_name, current_target_name, reason, threat_val
		])

func _get_party_candidates() -> Array[Node2D]:
	var res: Array[Node2D] = []
	var cur_sc = get_tree().current_scene if get_tree() else null
	if not cur_sc:
		return res
	
	var hero = cur_sc.find_child("HeroPlayer", true, false)
	if hero and is_instance_valid(hero):
		var h_name = hero.get("character_name") if ("character_name" in hero and hero.character_name != "") else GameState.hero_name
		if not GameState.has_status_effect(h_name, "unconscious") and not GameState.is_invisible(h_name) and not GameState.is_invisible(GameState.hero_name):
			res.append(hero)

	for child in cur_sc.get_children():
		if child is PartyCompanion and is_instance_valid(child):
			var c_name = child.companion_name
			if not GameState.has_status_effect(c_name, "unconscious") and not GameState.is_invisible(c_name):
				res.append(child)
	return res

func _get_actor_name(actor: Node2D) -> String:
	if actor is HeroPlayer:
		return GameState.hero_name
	if actor is PartyCompanion:
		return actor.companion_name
	return actor.name

# ── Movement & Combat Logic ───────────────────────────────────────────────────

func _process_patrol(delta: float) -> void:
	if _is_round_based_mode():
		velocity = Vector2.ZERO
		return
	if waypoints.size() == 0:
		velocity = Vector2.ZERO
		return
	if wait_timer > 0.0:
		wait_timer -= delta
		velocity = Vector2.ZERO
		return

	var dest = waypoints[current_wp_idx]
	var dist = global_position.distance_to(dest)
	if dist > 8.0:
		velocity = global_position.direction_to(dest) * (move_speed * 0.6)
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		wait_timer = randf_range(1.5, 3.0)
		current_wp_idx = (current_wp_idx + 1) % waypoints.size()

func _process_chase(_delta: float) -> void:
	if _is_round_based_mode():
		velocity = Vector2.ZERO
		return
	if not current_target or not is_instance_valid(current_target) or GameState.is_invisible(current_target_name) or (current_target_name == GameState.hero_name and GameState.is_invisible(GameState.hero_name)):
		current_state = State.PATROL
		current_target = null
		current_target_name = ""
		_update_ui()
		return

	var dist = global_position.distance_to(current_target.global_position)
	var stop_dist = ranged_standoff_distance if is_ranged else 50.0

	if dist <= stop_dist:
		velocity = Vector2.ZERO
		current_state = State.ATTACK
		attack_cooldown = 0.4
	else:
		velocity = global_position.direction_to(current_target.global_position) * move_speed
		move_and_slide()

func _process_attack(delta: float) -> void:
	velocity = Vector2.ZERO
	if _is_round_based_mode() or is_prone() or is_down_prone:
		return
	if not current_target or not is_instance_valid(current_target) or GameState.is_invisible(current_target_name) or (current_target_name == GameState.hero_name and GameState.is_invisible(GameState.hero_name)):
		current_state = State.PATROL
		current_target = null
		current_target_name = ""
		_update_ui()
		return

	var dist = global_position.distance_to(current_target.global_position)
	var max_engage_dist = (ranged_standoff_distance + 40.0) if is_ranged else 65.0
	if dist > max_engage_dist:
		current_state = State.CHASE
		return

	attack_cooldown -= delta
	if attack_cooldown <= 0.0:
		attack_cooldown = 2.4
		_strike_target()

func _strike_target() -> void:
	if current_state == State.DEAD or not current_target or GameState.is_game_paused or is_prone() or is_down_prone or GameState.is_invisible(current_target_name) or (current_target_name == GameState.hero_name and GameState.is_invisible(GameState.hero_name)):
		return

	if is_sanctuaried():
		GameState.remove_status_effect(enemy_name, "sanctuary")
		GameState.remove_status_effect(enemy_id, "sanctuary")
		GameState.log_message("combat", "🕊️ %s attacked! Sanctuary ward is broken." % enemy_name)
		_update_ui()

	if is_invisible():
		GameState.remove_status_effect(enemy_name, "invisible")
		GameState.remove_status_effect(enemy_id, "invisible")
		GameState.log_message("combat", "✨ Invisibility broke! %s made an attack." % enemy_name)
		_update_visibility_visuals()

	var t_name = current_target_name
	var t_ac = 14
	if current_target is HeroPlayer:
		t_ac = GameState.hero_ac
	elif current_target is PartyCompanion:
		var m_data = current_target._get_member_data()
		t_ac = m_data.get("ac", 14)

	var d20 = (randi() % 20) + 1
	var total_atk = d20 + attack_bonus
	var hit = (d20 == 20) or (d20 != 1 and total_atk >= t_ac)
	var dmg = randi_range(damage_min, damage_max) if hit else 0

	var tw = create_tween()
	var orig_pos = sprite.position
	var lunge_dir = global_position.direction_to(current_target.global_position)
	tw.tween_property(sprite, "position", orig_pos + lunge_dir * 12.0, 0.12)
	tw.tween_property(sprite, "position", orig_pos, 0.16)

	if hit:
		GameState.log_message("combat", "%s strikes %s! [d20: %d + %d = %d vs AC %d] HIT for %d damage!" % [
			enemy_name, t_name, d20, attack_bonus, total_atk, t_ac, dmg
		])
		if current_target is HeroPlayer:
			GameState.take_damage(dmg)
		else:
			GameState.damage_party_member(t_name, dmg)

		if FloatingTextManager:
			FloatingTextManager.spawn_damage(current_target.global_position, dmg)
		if current_target.has_method("play_hit_reaction"):
			current_target.play_hit_reaction()
	else:
		GameState.log_message("combat", "%s attacks %s [d20: %d + %d = %d vs AC %d] - MISSED!" % [
			enemy_name, t_name, d20, attack_bonus, total_atk, t_ac
		])
		if FloatingTextManager:
			FloatingTextManager.spawn_miss(current_target.global_position)

# ── Damage, Death & Looting ───────────────────────────────────────────────────

func take_damage(amount: int, attacker: Node2D = null) -> void:
	if current_state == State.DEAD:
		return

	if GameState.has_status_effect(enemy_name, "asleep"):
		GameState.remove_status_effect(enemy_name, "asleep")
		if FloatingTextManager:
			FloatingTextManager.spawn_text(global_position + Vector2(0, -25), "AWAKENED!", Color(1.0, 0.8, 0.2))

	var hp_before = current_hp
	current_hp = max(0, current_hp - amount)
	GameState.record_event("damage_applied", {"target_id": enemy_id, "target": enemy_name, "amount": amount, "hp_before": hp_before, "hp_after": current_hp, "attacker": _get_actor_name(attacker) if attacker else ""})
	_update_ui()
	
	if FloatingTextManager:
		FloatingTextManager.spawn_damage(global_position, amount)

	var tw = create_tween()
	tw.tween_property(sprite, "modulate", Color(2.5, 0.3, 0.3, 1.0), 0.10)
	tw.tween_property(sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.18)

	if attacker:
		var a_name = _get_actor_name(attacker)
		direct_damage_table[a_name] = int(direct_damage_table.get(a_name, 0)) + amount
		add_threat(attacker, amount * 2 + 10, "Attack Damage")
		_alert_friends(attacker, amount)

	if current_hp <= 0:
		die()

func _alert_friends(attacker: Node2D, damage: int) -> void:
	var cur_sc = get_tree().current_scene if get_tree() else null
	if not cur_sc:
		return

	for child in cur_sc.get_children():
		if child is TacticalEnemy and child != self and is_instance_valid(child):
			if child.current_state != State.DEAD and child.is_hostile:
				var dist = global_position.distance_to(child.global_position)
				var is_linked_friend = friends.has(child.enemy_id) or child.friends.has(enemy_id)
				if is_linked_friend or dist <= pack_alert_radius:
					child.aggravate_on_friend_attack(self, attacker, damage)

func aggravate_on_friend_attack(friend: TacticalEnemy, attacker: Node2D, damage: int) -> void:
	if current_state == State.DEAD or not attacker or not is_instance_valid(attacker) or not is_hostile:
		return

	var a_name = _get_actor_name(attacker)
	var is_explicit_friend = friends.has(friend.enemy_id) or friend.friends.has(enemy_id)
	var friend_threat = int(damage * 0.75) + (35 if is_explicit_friend else 20)

	var prev_threat = int(threat_table.get(a_name, 0))
	var new_threat = prev_threat + friend_threat
	threat_table[a_name] = new_threat

	var cur_target_threat = int(threat_table.get(current_target_name, 0))
	var should_switch = false
	if current_target == null or not is_instance_valid(current_target):
		should_switch = true
	elif attacker != current_target:
		if new_threat > int(cur_target_threat * 1.15) + 3:
			should_switch = true

	if should_switch or current_state == State.PATROL:
		_set_aggro_target(attacker, new_threat, "Defending Ally %s" % friend.enemy_name)
		current_state = State.CHASE

	GameState.log_message("combat", "⚠️ %s alerted! Aggravated to defend %s against %s!" % [
		enemy_name, friend.enemy_name, a_name
	])

	if FloatingTextManager:
		FloatingTextManager.spawn_text(global_position, "⚠️ AGGRAVATED!", Color(1.0, 0.45, 0.2, 1.0))

	friend_aggravated.emit(self, friend, attacker)

func _alert_friends_proximity(intruder: Node2D, _dist_to_intruder: float) -> void:
	var cur_sc = get_tree().current_scene if get_tree() else null
	if not cur_sc:
		return

	for child in cur_sc.get_children():
		if child is TacticalEnemy and child != self and is_instance_valid(child):
			if child.current_state != State.DEAD and child.is_hostile:
				var friend_dist = global_position.distance_to(child.global_position)
				var is_linked_friend = friends.has(child.enemy_id) or child.friends.has(enemy_id)
				if is_linked_friend or friend_dist <= pack_friend_radius:
					child.aggravate_on_friend_proximity(self, intruder, friend_dist)

func aggravate_on_friend_proximity(friend: TacticalEnemy, intruder: Node2D, friend_dist: float) -> void:
	if current_state == State.DEAD or not intruder or not is_instance_valid(intruder) or not is_hostile:
		return

	var i_name = _get_actor_name(intruder)
	var rally_threat = 25
	var prev_threat = int(threat_table.get(i_name, 0))
	threat_table[i_name] = prev_threat + rally_threat

	var was_patrolling = (current_state == State.PATROL or current_target == null or not is_instance_valid(current_target))
	if was_patrolling:
		_set_aggro_target(intruder, threat_table[i_name], "Rallying with %s" % friend.enemy_name)
		current_state = State.CHASE

	GameState.log_message("combat", "⚠️ %s rallies with close ally %s! Aggravated by intruder %s (Friend distance: %dpx)!" % [
		enemy_name, friend.enemy_name, i_name, int(friend_dist)
	])

	if FloatingTextManager:
		FloatingTextManager.spawn_text(global_position, "⚠️ RALLIED!", Color(1.0, 0.6, 0.1, 1.0))

	friend_aggravated.emit(self, friend, intruder)

func die() -> void:
	current_state = State.DEAD
	is_down_prone = false
	velocity = Vector2.ZERO
	GameState.log_message("damage", "☠ %s was slain! Its corpse can be looted." % enemy_name)
	GameState.record_event("creature_slain", {"target_id": enemy_id, "target": enemy_name})
	GameState.add_kill()

	if hp_bar: hp_bar.visible = false
	if hp_text: hp_text.visible = false
	if selection_circle: selection_circle.visible = false
	if loot_indicator: loot_indicator.visible = true

	_update_ui()
	enemy_slain.emit(self)

	var tw = create_tween()
	tw.parallel().tween_property(sprite, "rotation_degrees", 85.0, 0.35)
	tw.parallel().tween_property(sprite, "modulate", Color(0.65, 0.55, 0.55, 0.85), 0.35)

	if has_node("CollisionShape2D"):
		get_node("CollisionShape2D").set_deferred("disabled", true)

func loot_corpse(looter: Node2D = null) -> Dictionary:
	if current_state != State.DEAD:
		return {"success": false, "error": "Enemy is still alive!"}
	if is_looted:
		GameState.log_message("item", "The corpse of %s has already been stripped of valuables." % enemy_name)
		return {"success": false, "error": "already_looted", "message": "Already looted"}

	is_looted = true
	GameState.add_gold(loot_gold)
	for item_id in loot_items:
		GameState.add_item(item_id)

	if loot_indicator:
		loot_indicator.visible = false
	_update_ui()

	var looter_name = _get_actor_name(looter) if looter else GameState.hero_name
	var item_names: Array[String] = []
	for it in loot_items:
		var it_data = GameState.get_item_data(it)
		item_names.append(it_data.title if it_data else it)

	var items_str = ", ".join(item_names) if item_names.size() > 0 else "no items"
	GameState.log_message("item", "💰 %s searched %s's corpse: Looted %d Gold and %s!" % [
		looter_name, enemy_name, loot_gold, items_str
	])

	if FloatingTextManager:
		FloatingTextManager.spawn_heal(global_position + Vector2(0, -20), loot_gold)
	if AudioManager:
		AudioManager.play_sfx("wood_open")

	corpse_looted.emit(self, looter)
	return {
		"success": true,
		"enemy_id": enemy_id,
		"enemy_name": enemy_name,
		"gold": loot_gold,
		"items": loot_items
	}

func _input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		if is_invisible() and not can_be_seen_by_player():
			return
		body_clicked.emit(self)
