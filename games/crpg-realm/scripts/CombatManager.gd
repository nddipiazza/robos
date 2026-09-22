class_name CombatManager
extends Node

signal attack_resolved(attacker_name: String, target_name: String, hit: bool, damage: int)

var is_paused: bool = false

func set_paused(paused: bool) -> void:
	is_paused = paused

func roll_d20() -> int:
	return (randi() % 20) + 1

func execute_attack(attacker_name: String, attack_bonus: int, damage_dice_min: int, damage_dice_max: int, target_name: String, target_ac: int, target_pos: Vector2 = Vector2.ZERO) -> Dictionary:
	var gs = _get_game_state()
	var has_disadv = false
	var has_adv = false
	
	if gs and gs.has_method("has_status_effect"):
		if gs.has_status_effect(attacker_name, "blinded") or gs.has_status_effect(attacker_name, "poisoned") or gs.has_status_effect(attacker_name, "frightened") or gs.has_status_effect(attacker_name, "prone"):
			has_disadv = true
		if gs.has_status_effect(target_name, "blinded") or gs.has_status_effect(target_name, "paralyzed") or gs.has_status_effect(target_name, "prone") or gs.has_status_effect(target_name, "stunned") or gs.has_status_effect(target_name, "unconscious"):
			has_adv = true

	var r1 = roll_d20()
	var r2 = roll_d20()
	var d20 = r1
	if has_adv and not has_disadv:
		d20 = max(r1, r2)
	elif has_disadv and not has_adv:
		d20 = min(r1, r2)

	var is_crit = (d20 == 20)
	if gs and gs.has_method("has_status_effect") and (gs.has_status_effect(target_name, "paralyzed") or gs.has_status_effect(target_name, "unconscious")):
		is_crit = true
		
	var is_fumble = (d20 == 1)
	var total_attack = d20 + attack_bonus
	var is_hit = is_crit or (not is_fumble and total_attack >= target_ac)
	var damage = 0

	if is_hit:
		damage = randi_range(damage_dice_min, damage_dice_max)
		if is_crit:
			damage += randi_range(damage_dice_min, damage_dice_max)

	var adv_str = " (Advantage)" if (has_adv and not has_disadv) else (" (Disadvantage)" if (has_disadv and not has_adv) else "")

	if is_crit:
		_log_combat("combat", "%s attacks %s: [b]CRITICAL HIT![/b] [d20: %d + %d = %d vs AC %d]%s" % [attacker_name, target_name, d20, attack_bonus, total_attack, target_ac, adv_str])
		_log_combat("damage", "%s inflicts %d devastating critical damage on %s!" % [attacker_name, damage, target_name])
	elif is_fumble:
		_log_combat("combat", "%s attacks %s: [b]CRITICAL MISS![/b] [d20: 1 + %d = %d vs AC %d]%s" % [attacker_name, target_name, attack_bonus, total_attack, target_ac, adv_str])
	elif is_hit:
		_log_combat("combat", "%s attacks %s: [b]HIT[/b] [d20: %d + %d = %d vs AC %d]%s" % [attacker_name, target_name, d20, attack_bonus, total_attack, target_ac, adv_str])
		_log_combat("damage", "%s deals %d slashing damage to %s." % [attacker_name, damage, target_name])
	else:
		_log_combat("combat", "%s attacks %s: [b]MISSED[/b] [d20: %d + %d = %d vs AC %d]%s" % [attacker_name, target_name, d20, attack_bonus, total_attack, target_ac, adv_str])

	_play_combat_sfx(is_hit, is_crit)

	if target_pos != Vector2.ZERO:
		if is_hit:
			FloatingTextManager.spawn_damage(target_pos, damage, is_crit)
		else:
			FloatingTextManager.spawn_miss(target_pos)

	attack_resolved.emit(attacker_name, target_name, is_hit, damage)
	return {
		"d20": d20,
		"total_attack": total_attack,
		"hit": is_hit,
		"crit": is_crit,
		"damage": damage
	}

func execute_ranged_attack(attacker_name: String, attack_bonus: int, damage_dice_min: int, damage_dice_max: int, target_name: String, target_ac: int, target_pos: Vector2 = Vector2.ZERO) -> Dictionary:
	var gs = _get_game_state()
	var has_disadv = false
	var has_adv = false
	
	if gs and gs.has_method("has_status_effect"):
		if gs.has_status_effect(attacker_name, "blinded") or gs.has_status_effect(attacker_name, "poisoned") or gs.has_status_effect(attacker_name, "frightened"):
			has_disadv = true
		if gs.has_status_effect(target_name, "blinded") or gs.has_status_effect(target_name, "restrained") or gs.has_status_effect(target_name, "stunned"):
			has_adv = true

	var r1 = roll_d20()
	var r2 = roll_d20()
	var d20 = r1
	if has_adv and not has_disadv:
		d20 = max(r1, r2)
	elif has_disadv and not has_adv:
		d20 = min(r1, r2)

	var is_crit = (d20 == 20)
	var is_fumble = (d20 == 1)
	var total_attack = d20 + attack_bonus
	var is_hit = is_crit or (not is_fumble and total_attack >= target_ac)
	var damage = 0

	if is_hit:
		damage = randi_range(damage_dice_min, damage_dice_max)
		if is_crit:
			damage += randi_range(damage_dice_min, damage_dice_max)

	var adv_str = " (Advantage)" if (has_adv and not has_disadv) else (" (Disadvantage)" if (has_disadv and not has_adv) else "")

	if is_crit:
		_log_combat("combat", "%s fires ranged weapon at %s: [b]CRITICAL HIT![/b] [d20: %d + %d = %d vs AC %d]%s" % [attacker_name, target_name, d20, attack_bonus, total_attack, target_ac, adv_str])
		_log_combat("damage", "%s inflicts %d devastating piercing damage on %s!" % [attacker_name, damage, target_name])
	elif is_fumble:
		_log_combat("combat", "%s fires ranged weapon at %s: [b]CRITICAL MISS![/b] [d20: 1 + %d = %d vs AC %d]%s" % [attacker_name, target_name, attack_bonus, total_attack, target_ac, adv_str])
	elif is_hit:
		_log_combat("combat", "%s fires ranged weapon at %s: [b]HIT[/b] [d20: %d + %d = %d vs AC %d]%s" % [attacker_name, target_name, d20, attack_bonus, total_attack, target_ac, adv_str])
		_log_combat("damage", "%s deals %d piercing damage to %s." % [attacker_name, damage, target_name])
	else:
		_log_combat("combat", "%s fires ranged weapon at %s: [b]MISSED[/b] [d20: %d + %d = %d vs AC %d]%s" % [attacker_name, target_name, d20, attack_bonus, total_attack, target_ac, adv_str])

	_play_combat_sfx(is_hit, is_crit)

	if target_pos != Vector2.ZERO:
		if is_hit:
			FloatingTextManager.spawn_damage(target_pos, damage, is_crit)
		else:
			FloatingTextManager.spawn_miss(target_pos)

	attack_resolved.emit(attacker_name, target_name, is_hit, damage)
	return {
		"d20": d20,
		"total_attack": total_attack,
		"hit": is_hit,
		"crit": is_crit,
		"damage": damage,
		"type": "ranged"
	}

func execute_cast_spell(caster_name: String, spell_id: String, target_name: String = "", target_node: Node = null) -> Dictionary:
	var am = _get_audio_manager()
	var gs = _get_game_state()

	match spell_id:
		"magic-missile":
			var d1 = randi_range(1, 4) + 1
			var d2 = randi_range(1, 4) + 1
			var d3 = randi_range(1, 4) + 1
			var total_dmg = d1 + d2 + d3
			_log_combat("combat", "✨ %s casts [b]Magic Missile[/b] at %s!" % [caster_name, target_name if target_name != "" else "target"])
			_log_combat("damage", "Arcane energy darts strike %s for %d force damage (%d + %d + %d)!" % [target_name if target_name != "" else "target", total_dmg, d1, d2, d3])
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
				am.play_sfx("spell_impact")
			if target_node:
				if "global_position" in target_node:
					FloatingTextManager.spawn_damage(target_node.global_position, total_dmg)
				if target_node.has_method("take_damage"):
					target_node.take_damage(total_dmg)
			return {"success": true, "spell": "magic-missile", "damage": total_dmg, "hit": true}

		"cure-wounds":
			var wis_mod = 2
			if gs and "ability_scores" in gs:
				wis_mod = gs.get_stat_modifier(int(gs.ability_scores.get("WIS", 12)))
			var heal_amount = randi_range(1, 8) + max(1, wis_mod)
			var prev_hp = gs.hero_hp if gs else 10
			if gs and gs.has_method("heal"):
				gs.heal(heal_amount)
			elif gs:
				gs.hero_hp = min(gs.hero_max_hp, gs.hero_hp + heal_amount)
			var cur_hp = gs.hero_hp if gs else 12
			var max_hp = gs.hero_max_hp if gs else 12
			_log_combat("combat", "✨ %s casts [b]Cure Wounds[/b]!" % caster_name)
			_log_combat("damage", "Radiant holy vitality restores %d Hit Points to %s (%d -> %d/%d)!" % [heal_amount, caster_name, prev_hp, cur_hp, max_hp])
			if target_node and "global_position" in target_node:
				FloatingTextManager.spawn_heal(target_node.global_position, heal_amount)
			if am and am.has_method("play_sfx"):
				am.play_sfx("heal_cast")
			return {"success": true, "spell": "cure-wounds", "healed": heal_amount, "current_hp": cur_hp, "max_hp": max_hp}

		"fireball":
			var total_dmg = 0
			for k in range(8):
				total_dmg += randi_range(1, 6)
			_log_combat("combat", "🔥 %s casts [b]Fireball[/b] at %s!" % [caster_name, target_name if target_name != "" else "the battlefield"])
			_log_combat("damage", "An explosive fiery detonation erupts, dealing %d fire damage!" % total_dmg)
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
				am.play_sfx("spell_impact")
			if target_node:
				if "global_position" in target_node:
					FloatingTextManager.spawn_damage(target_node.global_position, total_dmg)
				if target_node.has_method("take_damage"):
					target_node.take_damage(total_dmg)
			return {"success": true, "spell": "fireball", "damage": total_dmg, "hit": true}

		_:
			_log_combat("combat", "%s casts %s!" % [caster_name, spell_id])
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
			return {"success": true, "spell": spell_id}

func _play_combat_sfx(is_hit: bool, is_crit: bool) -> void:
	var am = _get_audio_manager()
	if am and am.has_method("play_sfx"):
		if is_crit:
			am.play_sfx("melee_crit")
		elif is_hit:
			am.play_sfx("melee_hit")
		else:
			am.play_sfx("melee_miss")

func _get_audio_manager() -> Node:
	if Engine.has_singleton("AudioManager"):
		return Engine.get_singleton("AudioManager")
	if Engine.get_main_loop() is SceneTree:
		var root = (Engine.get_main_loop() as SceneTree).root
		if root and root.has_node("AudioManager"):
			return root.get_node("AudioManager")
	return null

func _log_combat(category: String, message: String) -> void:
	var gs = _get_game_state()
	if gs and gs.has_method("log_message"):
		gs.log_message(category, message)

func _get_game_state() -> Node:
	if Engine.has_singleton("GameState"):
		return Engine.get_singleton("GameState")
	if Engine.get_main_loop() is SceneTree:
		var root = (Engine.get_main_loop() as SceneTree).root
		if root and root.has_node("GameState"):
			return root.get_node("GameState")
	return null
