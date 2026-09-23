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

		"find-traps":
			_log_combat("magic", "✨ %s casts [b]Find Traps[/b]! Divine divination radiates across the area." % caster_name)
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
			var revealed_count = 0
			if Engine.get_main_loop() is SceneTree:
				var tree = Engine.get_main_loop() as SceneTree
				var cur_sc = tree.current_scene
				if cur_sc:
					for child in cur_sc.get_children():
						if child.has_method("reveal_trap") and not child.get("is_disarmed"):
							child.reveal_trap(caster_name)
							revealed_count += 1
			_log_combat("system", "✨ Find Traps illuminated %d concealed hazards in red runic light!" % revealed_count)
			return {"success": true, "spell": "find-traps", "revealed_count": revealed_count}

		"knock":
			_log_combat("magic", "✨ %s casts [b]Knock[/b]! Resonant arcane vibrations bypass locks and traps." % caster_name)
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
			return {"success": true, "spell": "knock"}

		_:
			_log_combat("combat", "%s casts %s!" % [caster_name, spell_id])
			if am and am.has_method("play_sfx"):
				am.play_sfx("spell_cast")
			return {"success": true, "spell": spell_id}

func resolve_trap_detection(detector_name: String, perception_bonus: int, trap_dc: int, trap_name: String = "Concealed Trap") -> Dictionary:
	var d20 = max(10, roll_d20()) # D&D 5e Passive Perception floor (10 + bonus) for active search
	var total = d20 + perception_bonus
	var is_success = (total >= trap_dc)
	if is_success:
		_log_combat("system", "⚠️ [TRAP DETECTED] %s spotted %s! [Perception d20: %d + %d = %d vs DC %d]" % [detector_name, trap_name, d20, perception_bonus, total, trap_dc])
	else:
		_log_combat("system", "%s searched the area but failed to notice any hidden hazards. [d20: %d + %d = %d vs DC %d]" % [detector_name, d20, perception_bonus, total, trap_dc])
	return {
		"d20": d20,
		"total": total,
		"success": is_success,
		"dc": trap_dc
	}

func resolve_trap_disarm(disarmer_name: String, tools_bonus: int, disarm_dc: int, trap_name: String = "Concealed Trap", force_fumble: bool = false) -> Dictionary:
	var d20 = 1 if force_fumble else max(10, roll_d20()) # Reliable Talent / Take 10 for stationary trap disarming
	var total = d20 + tools_bonus
	var is_success = false if force_fumble else (total >= disarm_dc)
	var is_fumble = force_fumble or (d20 == 1)

	if is_success:
		_log_combat("system", "🔧 [TRAP DISARMED] %s safely disarmed %s with Thieves' Tools! [d20: %d + %d = %d vs DC %d]" % [disarmer_name, trap_name, d20, tools_bonus, total, disarm_dc])
	elif is_fumble:
		_log_combat("combat", "💥 [TRAP ACCIDENTAL TRIGGER] %s fumbled the disarm mechanism! %s springs! [d20: %d + %d = %d vs DC %d]" % [disarmer_name, trap_name, d20, tools_bonus, total, disarm_dc])
	else:
		_log_combat("system", "%s failed to disarm %s, but avoided triggering the mechanism. [d20: %d + %d = %d vs DC %d]" % [disarmer_name, trap_name, d20, tools_bonus, total, disarm_dc])

	return {
		"d20": d20,
		"total": total,
		"success": is_success,
		"fumble": is_fumble,
		"dc": disarm_dc
	}

func resolve_trap_trigger(victim_name: String, save_stat: String, save_bonus: int, save_dc: int, damage_min: int, damage_max: int, damage_type: String, status_effect: String = "", trap_name: String = "Trap", force_fail_save: bool = false) -> Dictionary:
	var d20 = 2 if force_fail_save else roll_d20()
	var total_save = d20 + save_bonus
	var save_passed = false if force_fail_save else (total_save >= save_dc)
	var raw_damage = randi_range(damage_min, damage_max)
	var final_damage = raw_damage

	if save_passed:
		final_damage = int(ceil(raw_damage / 2.0))
		_log_combat("combat", "💥 [TRAP TRIGGERED] %s stepped on %s! 🛡️ Succeeds on %s save [d20: %d + %d = %d vs DC %d] (Half damage: %d %s)" % [victim_name, trap_name, save_stat, d20, save_bonus, total_save, save_dc, final_damage, damage_type])
	else:
		_log_combat("combat", "💥 [TRAP TRIGGERED] %s stepped on %s! Failed %s save [d20: %d + %d = %d vs DC %d]. Takes %d %s damage!" % [victim_name, trap_name, save_stat, d20, save_bonus, total_save, save_dc, final_damage, damage_type])

	var gs = _get_game_state()
	if gs:
		if victim_name == gs.hero_name:
			gs.take_damage(final_damage)
		else:
			for m in gs.party_members:
				if m.get("name") == victim_name or m.get("id") == victim_name.to_lower():
					m["hp"] = max(0, int(m.get("hp", 10)) - final_damage)
					gs.party_changed.emit()
					break

		if not save_passed and status_effect != "":
			if gs.has_method("apply_status_effect"):
				gs.apply_status_effect(victim_name, status_effect, 3)
				_log_combat("damage", "%s is afflicted with condition: [%s]!" % [victim_name, status_effect.to_upper()])

	return {
		"d20": d20,
		"total_save": total_save,
		"save_passed": save_passed,
		"damage": final_damage,
		"damage_type": damage_type,
		"status_applied": (not save_passed and status_effect != "")
	}

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
