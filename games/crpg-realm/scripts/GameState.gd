class_name GameStateSingleton
extends Node

signal quest_advanced(stage: int)
signal inventory_changed
signal hero_damaged(current_hp: int, max_hp: int)
signal settings_changed
signal message_logged(category: String, message: String)
signal party_changed
signal party_selection_changed(indices: Array)
signal party_leader_changed(leader_index: int, leader_data: Dictionary)
signal party_formation_changed(formation_id: String)
signal status_effects_changed(target_name: String)
signal pause_toggled(is_paused: bool)
signal gold_changed(current_gold: int)
signal party_defeated
signal trap_detected(trap_id: String, detector_name: String)
signal trap_disarmed(trap_id: String, disarmer_name: String)
signal trap_triggered(trap_id: String, victim_name: String)

var settings: Dictionary = {
	"health_bar_mode": "always", # "always", "injured_only", "none"
	"floating_text": true,
	"auto_pause_combat": false,
	"auto_pause_injured": false,
	"fog_of_war": true
}

var is_game_paused: bool = false
var is_party_defeated: bool = false
var is_detecting_traps: bool = false
var trap_pulse_accumulator: float = 0.0
var party_members: Array[Dictionary] = []
var selected_party_indices: Array[int] = [0]
var party_leader_index: int = 0
var current_formation: String = "rank"

const FORMATIONS: Dictionary = {
	"rank": [
		Vector2(0, 0),
		Vector2(48, 0),
		Vector2(0, 48),
		Vector2(48, 48),
		Vector2(0, 96),
		Vector2(48, 96)
	],
	"wedge": [
		Vector2(0, 0),
		Vector2(-48, 44),
		Vector2(48, 44),
		Vector2(-96, 88),
		Vector2(96, 88),
		Vector2(0, 75)
	],
	"line": [
		Vector2(0, 0),
		Vector2(48, 0),
		Vector2(-48, 0),
		Vector2(96, 0),
		Vector2(-96, 0),
		Vector2(144, 0)
	],
	"column": [
		Vector2(0, 0),
		Vector2(0, 48),
		Vector2(0, 96),
		Vector2(0, 144),
		Vector2(0, 192),
		Vector2(0, 240)
	],
	"square": [
		Vector2(-35, 0),
		Vector2(35, 0),
		Vector2(-35, 70),
		Vector2(35, 70),
		Vector2(0, 35),
		Vector2(0, 100)
	],
	"scatter": [
		Vector2(0, 0),
		Vector2(-70, 35),
		Vector2(65, 50),
		Vector2(-40, 85),
		Vector2(80, 100),
		Vector2(0, 120)
	]
}
var status_effects: Dictionary = {}
var status_durations: Dictionary = {}
var status_realtime_timeouts: Dictionary = {}
var status_tick_accumulator: float = 0.0
var activity_log_history: Array[Dictionary] = []
var spawn_position: Vector2 = Vector2.ZERO

var hero_name: String = "Vance"
var hero_race: String = "human"
var hero_class: String = "fighter"
var selected_spells: Array = []
var hero_hp: int = 12
var hero_max_hp: int = 12
var hero_ac: int = 16
var hero_level: int = 1
var gold: int = 150

var inventory: Array = ["potion-healing"]
var equipped_weapon: String = "service-sword"
var equipped_armor: String = "chain-mail"

var quest_stage: int = 1
var flags: Dictionary = {
	"partner_conversed": false,
	"footlocker_looted": false,
	"village_hounds_slain": false,
	"blacksmith_conversed": false,
	"garrison_unlocked": false,
	"garrison_skirmishers_slain": false,
	"malakor_slain": false
}

var stats: Dictionary = {
	"kills": 0,
	"chests": 0,
	"damage_dealt": 0
}

var ability_scores: Dictionary = {
	"STR": 16,
	"DEX": 14,
	"CON": 15,
	"INT": 10,
	"WIS": 12,
	"CHA": 11
}

func roll_dnd_stat() -> int:
	var rolls: Array[int] = []
	for i in range(4):
		rolls.append(randi_range(1, 6))
	rolls.sort()
	return rolls[1] + rolls[2] + rolls[3]

func roll_all_stats() -> Dictionary:
	ability_scores = {
		"STR": roll_dnd_stat(),
		"DEX": roll_dnd_stat(),
		"CON": roll_dnd_stat(),
		"INT": roll_dnd_stat(),
		"WIS": roll_dnd_stat(),
		"CHA": roll_dnd_stat()
	}
	return ability_scores

func get_stat_modifier(val: int) -> int:
	return int(floor((val - 10) / 2.0))

func reset_flags() -> void:
	flags = {
		"partner_conversed": false,
		"footlocker_looted": false,
		"village_hounds_slain": false,
		"blacksmith_conversed": false,
		"garrison_unlocked": false,
		"garrison_skirmishers_slain": false,
		"malakor_slain": false
	}

func init_hero(p_name: String, p_class: String, p_stats: Dictionary = {}, p_race: String = "human", p_spells: Array = []) -> void:
	hero_name = p_name if p_name.strip_edges() != "" else "Lieutenant Vance"
	hero_class = p_class
	hero_race = p_race if p_race.strip_edges() != "" else "human"
	selected_spells = p_spells.duplicate()
	
	if p_stats.size() > 0:
		ability_scores = p_stats.duplicate()
	else:
		ability_scores = roll_all_stats()

	# Apply racial ability score modifiers
	match hero_race:
		"human":
			for s in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]:
				ability_scores[s] = int(ability_scores.get(s, 10)) + 1
		"elf":
			ability_scores["DEX"] = int(ability_scores.get("DEX", 10)) + 2
			ability_scores["INT"] = int(ability_scores.get("INT", 10)) + 1
		"dwarf":
			ability_scores["CON"] = int(ability_scores.get("CON", 10)) + 2
			ability_scores["STR"] = int(ability_scores.get("STR", 10)) + 1
		"halfling":
			ability_scores["DEX"] = int(ability_scores.get("DEX", 10)) + 2
			ability_scores["CHA"] = int(ability_scores.get("CHA", 10)) + 1
		"dragonborn":
			ability_scores["STR"] = int(ability_scores.get("STR", 10)) + 2
			ability_scores["CHA"] = int(ability_scores.get("CHA", 10)) + 1
		"gnome":
			ability_scores["INT"] = int(ability_scores.get("INT", 10)) + 2
			ability_scores["DEX"] = int(ability_scores.get("DEX", 10)) + 1
		"half-elf":
			ability_scores["CHA"] = int(ability_scores.get("CHA", 10)) + 2
			ability_scores["DEX"] = int(ability_scores.get("DEX", 10)) + 1
			ability_scores["CON"] = int(ability_scores.get("CON", 10)) + 1
		"half-orc":
			ability_scores["STR"] = int(ability_scores.get("STR", 10)) + 2
			ability_scores["CON"] = int(ability_scores.get("CON", 10)) + 1
		"tiefling":
			ability_scores["CHA"] = int(ability_scores.get("CHA", 10)) + 2
			ability_scores["INT"] = int(ability_scores.get("INT", 10)) + 1

	var con_mod = get_stat_modifier(int(ability_scores.get("CON", 10)))
	var dex_mod = get_stat_modifier(int(ability_scores.get("DEX", 10)))

	match p_class:
		"barbarian":
			hero_max_hp = 12 + con_mod
			hero_ac = 10 + dex_mod + con_mod
			equipped_weapon = "greatsword"
			equipped_armor = "leather-armor"
		"bard":
			hero_max_hp = 8 + con_mod
			hero_ac = 11 + dex_mod
			equipped_weapon = "rapier"
			equipped_armor = "leather-armor"
			if selected_spells.is_empty():
				selected_spells = ["cure-wounds"]
		"cleric":
			hero_max_hp = 8 + con_mod
			hero_ac = 14 + min(2, dex_mod)
			equipped_weapon = "mace"
			equipped_armor = "chain-mail"
			if selected_spells.is_empty():
				selected_spells = ["cure-wounds"]
		"druid":
			hero_max_hp = 8 + con_mod
			hero_ac = 12 + min(2, dex_mod)
			equipped_weapon = "quarterstaff"
			equipped_armor = "leather-armor"
			if selected_spells.is_empty():
				selected_spells = ["cure-wounds"]
		"fighter":
			hero_max_hp = 10 + con_mod
			hero_ac = 16
			equipped_weapon = "service-sword"
			equipped_armor = "chain-mail"
		"monk":
			hero_max_hp = 8 + con_mod
			hero_ac = 10 + dex_mod + get_stat_modifier(int(ability_scores.get("WIS", 10)))
			equipped_weapon = "quarterstaff"
			equipped_armor = "robe"
		"paladin":
			hero_max_hp = 10 + con_mod
			hero_ac = 16
			equipped_weapon = "service-sword"
			equipped_armor = "chain-mail"
			if selected_spells.is_empty():
				selected_spells = ["cure-wounds"]
		"ranger":
			hero_max_hp = 10 + con_mod
			hero_ac = 12 + dex_mod
			equipped_weapon = "hunting-bow"
			equipped_armor = "leather-armor"
		"rogue":
			hero_max_hp = 8 + con_mod
			hero_ac = 11 + dex_mod
			equipped_armor = "leather-armor"
			if hero_race in ["halfling", "elf"]:
				equipped_weapon = "hunting-bow"
			else:
				equipped_weapon = "service-sword"
		"sorcerer":
			hero_max_hp = 6 + con_mod
			hero_ac = 10 + dex_mod
			equipped_weapon = "dagger"
			equipped_armor = "robe"
			if selected_spells.is_empty():
				selected_spells = ["fireball"]
		"warlock":
			hero_max_hp = 8 + con_mod
			hero_ac = 11 + dex_mod
			equipped_weapon = "dagger"
			equipped_armor = "leather-armor"
			if selected_spells.is_empty():
				selected_spells = ["magic-missile"]
		"wizard":
			hero_max_hp = 6 + con_mod
			hero_ac = 10 + dex_mod
			equipped_weapon = "quarterstaff"
			equipped_armor = "robe"
			if selected_spells.is_empty():
				selected_spells = ["magic-missile", "fireball"]
		_:
			hero_max_hp = 10 + con_mod
			hero_ac = 10 + dex_mod
			equipped_weapon = "service-sword"
			equipped_armor = "chain-mail"

	# Racial traits adjustments
	if hero_race in ["dwarf", "half-orc"]:
		hero_max_hp += 1 # Dwarven Toughness / Relentless Endurance
	elif hero_race in ["halfling", "gnome"]:
		hero_ac += 1 # Halfling Nimbleness dodge bonus

	hero_max_hp = max(6, hero_max_hp)
	hero_hp = hero_max_hp
	quest_stage = 1
	reset_flags()
	settings["fog_of_war"] = true
	if has_meta("fog_cache"):
		set_meta("fog_cache", {})
	stats.kills = 0
	stats.chests = 0
	stats.damage_dealt = 0
	inventory = ["potion-healing"]
	if equipped_weapon == "hunting-bow":
		inventory.append("service-sword")
	
	var portrait_path = "res://assets/portraits/portrait_%s.png" % hero_class
	if not ResourceLoader.exists(portrait_path):
		portrait_path = "res://assets/portraits/portrait_fighter.png"
	
	party_members = [
		{
			"id": "hero",
			"name": hero_name,
			"race": hero_race,
			"class": hero_class,
			"hp": hero_hp,
			"max_hp": hero_max_hp,
			"ac": hero_ac,
			"level": 1,
			"portrait": portrait_path,
			"weapon": equipped_weapon,
			"armor": equipped_armor,
			"spells": selected_spells.duplicate(),
			"status_effects": []
		}
	]
	selected_party_indices = [0]
	status_effects = {hero_name: []}
	status_durations.clear()
	status_realtime_timeouts.clear()
	activity_log_history.clear()
	gold = 150
	is_game_paused = false
	party_changed.emit()
	party_selection_changed.emit(selected_party_indices)
	print("GameState: Hero initialized -> ", hero_name, " (", hero_race, " ", hero_class, ") HP=", hero_hp, " AC=", hero_ac, " Spells=", selected_spells, " Stats=", ability_scores)

func has_item(item_id: String) -> bool:
	return inventory.has(item_id) or equipped_weapon == item_id or equipped_armor == item_id

func add_item(item_id: String) -> void:
	inventory.append(item_id)
	inventory_changed.emit()
	var it = get_item_data(item_id)
	var title = it.title if it else item_id
	log_message("item", "Acquired item: %s" % title)

func remove_item(item_id: String) -> void:
	inventory.erase(item_id)
	inventory_changed.emit()

func add_kill() -> void:
	stats.kills += 1

func add_chest() -> void:
	stats.chests += 1

func log_message(category: String, msg: String) -> void:
	activity_log_history.append({
		"category": category,
		"message": msg,
		"timestamp": Time.get_ticks_msec()
	})
	if activity_log_history.size() > 500:
		activity_log_history.pop_front()
	message_logged.emit(category, msg)

func update_setting(key: String, val) -> void:
	settings[key] = val
	settings_changed.emit()

func advance_quest(p_stage: int) -> void:
	if p_stage > quest_stage:
		quest_stage = p_stage
		quest_advanced.emit(p_stage)
		log_message("quest", "Journal updated (Stage %d)" % p_stage)
		print("Quest Advanced to Stage ", p_stage)

func take_damage(amount: int) -> void:
	hero_hp = max(0, hero_hp - amount)
	for m in party_members:
		if m.get("id") == "hero" or m.get("name") == hero_name:
			m["hp"] = hero_hp
			break
	hero_damaged.emit(hero_hp, hero_max_hp)
	party_changed.emit()
	log_message("damage", "%s suffers %d damage! (HP: %d/%d)" % [hero_name, amount, hero_hp, hero_max_hp])
	if hero_hp <= 0:
		apply_status_effect(hero_name, "unconscious")
		check_party_defeat()

func heal(amount: int) -> void:
	hero_hp = min(hero_max_hp, hero_hp + amount)
	hero_damaged.emit(hero_hp, hero_max_hp)
	log_message("item", "%s recovered %d HP! (HP: %d/%d)" % [hero_name, amount, hero_hp, hero_max_hp])

func get_item_data(item_id: String) -> ItemData:
	if DataStore.items.has(item_id):
		return DataStore.items[item_id]
	return null

func use_item(item_id: String) -> Dictionary:
	if not inventory.has(item_id):
		return {"success": false, "error": "Item not in inventory: %s" % item_id}
	
	var item = get_item_data(item_id)
	if item and item.category == "consumable":
		if item_id == "antidote" or item_id == "potion-antidote":
			remove_status_effect(hero_name, "poisoned")
			remove_item(item_id)
			if AudioManager:
				AudioManager.play_sfx("wood_open")
			log_message("item", "%s drank Antidote! Cured poison condition." % hero_name)
			return {
				"success": true,
				"item": item_id,
				"title": item.title,
				"action": "cured_poison"
			}
		
		# Healing Potions
		var healed = randi_range(1, 4) + randi_range(1, 4) + 2 # Potion of Healing: 2d4 + 2
		if item_id == "potion-greater-healing":
			healed = randi_range(1, 4) + randi_range(1, 4) + randi_range(1, 4) + randi_range(1, 4) + 4 # 4d4 + 4
		var prev_hp = hero_hp
		heal(healed)
		remove_item(item_id)
		if AudioManager:
			AudioManager.play_sfx("wood_open")
		print("GameState: Used %s! Restored %d HP (%d -> %d/%d)" % [item.title, hero_hp - prev_hp, prev_hp, hero_hp, hero_max_hp])
		return {
			"success": true,
			"item": item_id,
			"title": item.title,
			"action": "consumed",
			"hp_restored": hero_hp - prev_hp,
			"current_hp": hero_hp,
			"max_hp": hero_max_hp
		}
	elif item and (item.category == "weapon" or item.category == "armor"):
		return equip_item(item_id)
	
	return {"success": false, "error": "Item cannot be consumed directly"}

func equip_item(item_id: String) -> Dictionary:
	if not inventory.has(item_id):
		return {"success": false, "error": "Item not in inventory: %s" % item_id}
	
	var item = get_item_data(item_id)
	if not item:
		return {"success": false, "error": "Item data not found for %s" % item_id}
	
	if item.category == "weapon":
		var old_weap = equipped_weapon
		inventory.erase(item_id)
		equipped_weapon = item_id
		if old_weap != "":
			inventory.append(old_weap)
		inventory_changed.emit()
		if AudioManager:
			AudioManager.play_sfx("melee_attack")
		print("GameState: Equipped weapon %s (Swapped out %s)" % [item.title, old_weap])
		return {"success": true, "slot": "weapon", "equipped": item_id, "swapped": old_weap}
	elif item.category == "armor":
		var old_arm = equipped_armor
		inventory.erase(item_id)
		equipped_armor = item_id
		hero_ac = item.ac_bonus if item.ac_bonus > 0 else (12 + get_stat_modifier(ability_scores.get("DEX", 10)))
		if old_arm != "":
			inventory.append(old_arm)
		inventory_changed.emit()
		print("GameState: Equipped armor %s (Swapped out %s, AC=%d)" % [item.title, old_arm, hero_ac])
		return {"success": true, "slot": "armor", "equipped": item_id, "swapped": old_arm, "ac": hero_ac}

	return {"success": false, "error": "Item is not equippable"}

func unequip_item(slot: String) -> Dictionary:
	if slot == "weapon" and equipped_weapon != "":
		var old = equipped_weapon
		inventory.append(old)
		equipped_weapon = ""
		inventory_changed.emit()
		return {"success": true, "slot": "weapon", "unequipped": old}
	elif slot == "armor" and equipped_armor != "":
		var old = equipped_armor
		inventory.append(old)
		equipped_armor = ""
		hero_ac = 10 + get_stat_modifier(ability_scores.get("DEX", 10))
		inventory_changed.emit()
		return {"success": true, "slot": "armor", "unequipped": old, "ac": hero_ac}
	return {"success": false, "error": "Slot is already empty"}
	return {"success": false, "error": "Slot is already empty"}

# ── Party Management ──────────────────────────────────────────────────────────

func add_party_member(member: Dictionary) -> void:
	for m in party_members:
		if m.get("id") == member.get("id"):
			return
	party_members.append(member)
	if not status_effects.has(member.get("name", "")):
		status_effects[member.get("name", "")] = []
	party_changed.emit()
	log_message("system", "%s has joined your party!" % member.get("name", "Companion"))

func remove_party_member(member_id: String) -> void:
	for i in range(party_members.size() - 1, -1, -1):
		if party_members[i].get("id") == member_id:
			party_members.remove_at(i)
			break
	party_changed.emit()

func select_party_member(idx: int) -> void:
	if idx >= 0 and idx < party_members.size():
		selected_party_indices = [idx]
		party_selection_changed.emit(selected_party_indices)

func toggle_party_member_selection(idx: int) -> void:
	if idx >= 0 and idx < party_members.size():
		if selected_party_indices.has(idx):
			if selected_party_indices.size() > 1:
				selected_party_indices.erase(idx)
		else:
			selected_party_indices.append(idx)
		party_selection_changed.emit(selected_party_indices)

func select_all_party_members() -> void:
	selected_party_indices = []
	for i in range(party_members.size()):
		selected_party_indices.append(i)
	party_selection_changed.emit(selected_party_indices)

func get_selected_party_members() -> Array[Dictionary]:
	var res: Array[Dictionary] = []
	for idx in selected_party_indices:
		if idx >= 0 and idx < party_members.size():
			res.append(party_members[idx])
	return res

func set_party_leader(idx: int) -> void:
	if idx >= 0 and idx < party_members.size():
		party_leader_index = idx
		var leader_data = party_members[idx]
		party_leader_changed.emit(party_leader_index, leader_data)
		party_changed.emit()
		log_message("system", "%s is now the party leader." % leader_data.get("name", "Companion"))

func get_party_leader() -> Dictionary:
	if party_leader_index >= 0 and party_leader_index < party_members.size():
		return party_members[party_leader_index]
	elif party_members.size() > 0:
		return party_members[0]
	return {}

func set_party_formation(formation_id: String) -> void:
	if FORMATIONS.has(formation_id):
		current_formation = formation_id
		party_formation_changed.emit(current_formation)
		var form_title = formation_id.capitalize()
		match formation_id:
			"rank": form_title = "Rank & File"
			"wedge": form_title = "Wedge (V-Formation)"
			"line": form_title = "Shield Wall (Abreast)"
			"column": form_title = "Marching Column"
			"square": form_title = "Defensive Square"
			"scatter": form_title = "Skirmish (Scatter)"
		log_message("system", "Tactical Formation ordered: [%s]" % form_title)

func get_party_formation() -> String:
	return current_formation

func get_formation_offsets(formation_id: String, count: int, travel_vector: Vector2) -> Array[Vector2]:
	var base_list: Array = FORMATIONS.get(formation_id, FORMATIONS["rank"])
	var delta_theta: float = 0.0
	if travel_vector.length() > 0.001:
		delta_theta = travel_vector.angle() + (PI / 2.0)
	
	var res: Array[Vector2] = []
	for i in range(count):
		var base_off = base_list[i] if i < base_list.size() else Vector2(0, 48 * i)
		var rot_off = base_off.rotated(delta_theta)
		res.append(rot_off)
	return res

func get_scene_party_nodes() -> Array[Node2D]:
	var res: Array[Node2D] = []
	var cur_sc = get_tree().current_scene
	if not cur_sc:
		return res

	# Node 0 corresponds to HeroPlayer
	var hero = cur_sc.get_node_or_null("HeroPlayer")
	if not hero:
		hero = cur_sc.find_child("HeroPlayer", true, false)
	if hero and hero is Node2D:
		res.append(hero)

	# Companions matching party_members[1..n]
	for idx in range(1, party_members.size()):
		var m = party_members[idx]
		var m_id = m.get("id", "").to_lower()
		var m_name = m.get("name", "").to_lower()
		var comp_node: Node2D = null

		# 1) Search children for PartyCompanion matching companion_id or companion_name
		for child in cur_sc.get_children():
			if child is CharacterBody2D and not res.has(child):
				var c_id = str(child.get("companion_id")).to_lower()
				var c_name = str(child.get("companion_name")).to_lower()
				if (c_id != "" and c_id == m_id) or (c_name != "" and c_name == m_name) or child.name.to_lower().contains(m_id) or child.name.to_lower().contains(m_name):
					comp_node = child
					break

		# 2) Fallback name search
		if not comp_node:
			var candidates = [
				m.get("id", ""),
				m.get("name", ""),
				"Companion" + m.get("name", ""),
				"Companion" + m.get("id", "").capitalize(),
				"PartyCompanion"
			]
			for c_name in candidates:
				var found = cur_sc.find_child(c_name, true, false)
				if found and found is Node2D and not res.has(found):
					comp_node = found
					break

		# 3) Fallback: any unused companion node
		if not comp_node:
			for child in cur_sc.get_children():
				if (child is PartyCompanion or (child.get_script() != null and "PartyCompanion" in str(child.get_script().resource_path))) and not res.has(child):
					comp_node = child
					break

		if comp_node:
			res.append(comp_node)

	return res

func get_leader_node() -> Node2D:
	var nodes = get_scene_party_nodes()
	if party_leader_index >= 0 and party_leader_index < nodes.size():
		return nodes[party_leader_index]
	elif nodes.size() > 0:
		return nodes[0]
	return null

func move_party_formation(target_pos: Vector2, queue: bool = false) -> Dictionary:
	var nodes = get_scene_party_nodes()
	if nodes.is_empty():
		return {"success": false, "error": "No party nodes found in scene"}

	var leader = get_leader_node()
	var leader_pos = leader.global_position if (leader and is_instance_valid(leader)) else Vector2.ZERO
	var travel_vec = (target_pos - leader_pos).normalized()
	if travel_vec.length() < 0.001:
		travel_vec = Vector2(0, -1)

	var offsets = get_formation_offsets(current_formation, max(nodes.size(), party_members.size()), travel_vec)
	var rank_slot = 1
	var dispatched: Array[Dictionary] = []

	for idx in range(nodes.size()):
		var node = nodes[idx]
		if not is_instance_valid(node):
			continue

		var slot = 0
		if idx == party_leader_index:
			slot = 0
		else:
			slot = rank_slot
			rank_slot += 1

		var slot_offset = offsets[slot] if slot < offsets.size() else Vector2.ZERO
		var slot_dest = target_pos + slot_offset

		if queue:
			if node.has_method("queue_move_point"):
				node.queue_move_point(slot_dest)
			elif node.has_method("move_to"):
				node.move_to(slot_dest)
		else:
			if node.has_method("move_to_point"):
				node.move_to_point(slot_dest)
			elif node.has_method("move_to"):
				node.move_to(slot_dest)

		dispatched.append({
			"index": idx,
			"slot": slot,
			"node": node.name,
			"target": [slot_dest.x, slot_dest.y],
			"offset": [slot_offset.x, slot_offset.y]
		})

	# Show movement reticle if hero is in scene
	var cur_sc = get_tree().current_scene
	var hero = cur_sc.find_child("HeroPlayer", true, false) if cur_sc else null
	if hero and hero.get("reticle"):
		var ret = hero.get("reticle")
		ret.global_position = target_pos
		ret.visible = true

	return {
		"success": true,
		"formation": current_formation,
		"leader_index": party_leader_index,
		"target": [target_pos.x, target_pos.y],
		"dispatched": dispatched
	}

# ── Status Effects ────────────────────────────────────────────────────────────

func apply_status_effect(target_name: String, effect_id: String, duration_rounds: int = 3) -> void:
	if not status_effects.has(target_name):
		status_effects[target_name] = []
	if not status_effects[target_name].has(effect_id):
		status_effects[target_name].append(effect_id)
		for m in party_members:
			if m.get("name") == target_name or (m.get("id") == "hero" and (target_name == "hero" or target_name.to_lower() == hero_name.to_lower())):
				if not m.get("status_effects", []).has(effect_id):
					m["status_effects"].append(effect_id)
		status_effects_changed.emit(target_name)
		party_changed.emit()
		log_message("combat", "%s is now afflicted with [%s]!" % [target_name, effect_id.to_upper()])
	status_durations[target_name + ":" + effect_id] = duration_rounds
	if effect_id == "invisible" and not status_realtime_timeouts.has(target_name + ":invisible"):
		status_realtime_timeouts[target_name + ":invisible"] = 60.0

func remove_status_effect(target_name: String, effect_id: String) -> void:
	var key = target_name + ":" + effect_id
	status_durations.erase(key)
	status_realtime_timeouts.erase(key)
	if status_effects.has(target_name) and status_effects[target_name].has(effect_id):
		status_effects[target_name].erase(effect_id)
		for m in party_members:
			if (m.get("name") == target_name or (m.get("id") == "hero" and (target_name == "hero" or target_name.to_lower() == hero_name.to_lower()))) and m.has("status_effects"):
				m["status_effects"].erase(effect_id)
		status_effects_changed.emit(target_name)
		party_changed.emit()
		log_message("combat", "%s is no longer afflicted with [%s]." % [target_name, effect_id])

func override_status_timeout(target_name: String, effect_id: String, duration_seconds: float) -> void:
	var key = target_name + ":" + effect_id
	status_realtime_timeouts[key] = duration_seconds
	log_message("system", "🛠️ [TEST HACK] Invisibility timeout for %s overridden to %.2f seconds for automated test scenario!" % [target_name, duration_seconds])

func has_status_effect(target_name: String, effect_id: String) -> bool:
	if status_effects.has(target_name) and status_effects[target_name].has(effect_id):
		return true
	if (target_name == "hero" or target_name.to_lower() == hero_name.to_lower()) and status_effects.has(hero_name):
		return status_effects[hero_name].has(effect_id)
	return false

func get_status_effects(target_name: String) -> Array:
	if status_effects.has(target_name):
		return status_effects[target_name]
	if (target_name == "hero" or target_name.to_lower() == hero_name.to_lower()) and status_effects.has(hero_name):
		return status_effects[hero_name]
	for m in party_members:
		if m.get("name", "").to_lower() == target_name.to_lower() or (target_name == "hero" and m.get("id") == "hero"):
			return m.get("status_effects", [])
	return []

# ── RTwP Pause Control ────────────────────────────────────────────────────────

func toggle_pause() -> void:
	set_paused(!is_game_paused)

func set_paused(val: bool) -> void:
	is_game_paused = val
	pause_toggled.emit(is_game_paused)
	log_message("system", "Game Paused (Spacebar RTwP)" if is_game_paused else "Game Resumed")

# ── Gold & Shop Economy ───────────────────────────────────────────────────────

func add_gold(amount: int) -> void:
	gold += amount
	gold_changed.emit(gold)

func spend_gold(amount: int) -> bool:
	if gold >= amount:
		gold -= amount
		gold_changed.emit(gold)
		return true
	return false

func buy_item(item_id: String) -> bool:
	var it = get_item_data(item_id)
	if not it:
		return false
	var cost = it.cost if it.cost > 0 else 10
	if spend_gold(cost):
		add_item(item_id)
		if AudioManager:
			AudioManager.play_sfx("wood_open")
		log_message("item", "Purchased %s for %d GP." % [it.title, cost])
		return true
	return false

func sell_item(item_id: String) -> bool:
	if not inventory.has(item_id):
		return false
	var it = get_item_data(item_id)
	var price = int(floor(float(it.cost if it and it.cost > 0 else 10) * 0.5))
	remove_item(item_id)
	add_gold(price)
	if AudioManager:
		AudioManager.play_sfx("wood_open")
	log_message("item", "Sold %s for %d GP." % [it.title if it else item_id, price])
	return true



func _process(delta: float) -> void:
	if is_game_paused:
		return
	status_tick_accumulator += delta
	if status_tick_accumulator >= 3.0:
		status_tick_accumulator = 0.0
		_tick_status_effects()

	# Process real-time status timeouts
	var timeout_keys = status_realtime_timeouts.keys().duplicate()
	for key in timeout_keys:
		var remaining = float(status_realtime_timeouts[key]) - delta
		if remaining <= 0.0:
			status_realtime_timeouts.erase(key)
			var parts = key.split(":")
			if parts.size() >= 2:
				var target_name = parts[0]
				var effect_id = parts[1]
				remove_status_effect(target_name, effect_id)
				log_message("combat", "⏳ %s expired naturally for %s!" % [effect_id.capitalize(), target_name])
		else:
			status_realtime_timeouts[key] = remaining

	if is_detecting_traps:
		trap_pulse_accumulator += delta
		if trap_pulse_accumulator >= 1.5:
			trap_pulse_accumulator = 0.0
			pulse_trap_detection()

func _tick_status_effects() -> void:
	var keys = status_durations.keys().duplicate()
	for key in keys:
		var parts = key.split(":")
		if parts.size() < 2:
			continue
		var target_name = parts[0]
		var effect_id = parts[1]
		if effect_id == "poisoned":
			var dmg = randi_range(1, 4)
			var victim_pos = Vector2.ZERO
			var cur_sc = get_tree().current_scene if get_tree() else null
			if target_name == hero_name:
				take_damage(dmg)
				if cur_sc:
					var h_node = cur_sc.find_child("HeroPlayer", true, false)
					if h_node:
						victim_pos = h_node.global_position
			else:
				damage_party_member(target_name, dmg)
				if cur_sc:
					var comp = cur_sc.find_child("PartyCompanion", true, false)
					if comp:
						victim_pos = comp.global_position
			if victim_pos != Vector2.ZERO and FloatingTextManager:
				FloatingTextManager.spawn_damage(victim_pos, dmg, false, "poison")
		status_durations[key] = int(status_durations[key]) - 1
		if status_durations[key] <= 0:
			remove_status_effect(target_name, effect_id)

func is_incapacitated(target_name: String) -> bool:
	return has_status_effect(target_name, "paralyzed") or has_status_effect(target_name, "petrified") or has_status_effect(target_name, "stunned") or has_status_effect(target_name, "unconscious")

func is_invisible(target_name: String) -> bool:
	return has_status_effect(target_name, "invisible")

func damage_party_member(target_id_or_name: String, amount: int) -> void:
	if target_id_or_name == hero_name or target_id_or_name == "hero":
		take_damage(amount)
		return
	for m in party_members:
		if m.get("id") == target_id_or_name or m.get("name") == target_id_or_name:
			var prev_hp = m.get("hp", 10)
			m["hp"] = max(0, prev_hp - amount)
			party_changed.emit()
			log_message("damage", "%s suffers %d damage! (HP: %d/%d)" % [m.get("name"), amount, m["hp"], m.get("max_hp", 10)])
			if m["hp"] <= 0:
				apply_status_effect(m.get("name"), "unconscious")
				check_party_defeat()
			break

func heal_party_member(target_id_or_name: String, amount: int) -> void:
	if target_id_or_name == hero_name or target_id_or_name == "hero":
		heal(amount)
		return
	for m in party_members:
		if m.get("id") == target_id_or_name or m.get("name") == target_id_or_name:
			var prev_hp = m.get("hp", 10)
			var max_hp = m.get("max_hp", 10)
			m["hp"] = min(max_hp, prev_hp + amount)
			party_changed.emit()
			log_message("item", "%s recovered %d HP! (HP: %d/%d)" % [m.get("name"), amount, m["hp"], max_hp])
			break

func get_party_member(target_id_or_name: String) -> Dictionary:
	var t_lower = target_id_or_name.to_lower()
	for m in party_members:
		if m.get("id", "").to_lower() == t_lower or m.get("name", "").to_lower() == t_lower or t_lower in m.get("name", "").to_lower():
			return m
	if t_lower in ["hero", "vance", hero_name.to_lower()]:
		for m in party_members:
			if m.get("id") == "hero":
				return m
	return {}

func set_party_member_hp(target_id_or_name: String, hp: int) -> void:
	var t_lower = target_id_or_name.to_lower()
	for m in party_members:
		if m.get("id", "").to_lower() == t_lower or m.get("name", "").to_lower() == t_lower or t_lower in m.get("name", "").to_lower():
			m["hp"] = hp
			if hp <= 0:
				apply_status_effect(m.get("name"), "unconscious")
			else:
				remove_status_effect(m.get("name"), "unconscious")
			party_changed.emit()
			return
	if t_lower in ["hero", "vance", hero_name.to_lower()]:
		hero_hp = hp
		if hp <= 0:
			apply_status_effect(hero_name, "unconscious")
		else:
			remove_status_effect(hero_name, "unconscious")

func check_party_defeat() -> bool:
	var all_fallen = true
	for m in party_members:
		if int(m.get("hp", 0)) > 0:
			all_fallen = false
			break
	if all_fallen and not is_party_defeated:
		trigger_party_defeat()
		return true
	return false

func trigger_party_defeat() -> void:
	is_party_defeated = true
	log_message("system", "💀 ALL PARTY MEMBERS HAVE FALLEN! Your party has been wiped out.")
	party_defeated.emit()

func retry_encounter() -> void:
	is_party_defeated = false
	hero_hp = hero_max_hp
	remove_status_effect(hero_name, "unconscious")
	for m in party_members:
		m["hp"] = m.get("max_hp", 10)
		var comp_name = m.get("name", "")
		if comp_name != "":
			remove_status_effect(comp_name, "unconscious")
	hero_damaged.emit(hero_hp, hero_max_hp)
	party_changed.emit()
	log_message("system", "⚔️ Party revived and restored! Encounter ready to resume.")

func setup_tactical_party() -> void:
	is_party_defeated = false
	hero_hp = hero_max_hp
	remove_status_effect(hero_name, "unconscious")
	for m in party_members:
		if m.get("id") == "hero" or m.get("name") == hero_name:
			m["hp"] = hero_hp
			m["max_hp"] = hero_max_hp
			break
	
	var has_elora = false
	var has_thrumbar = false
	for m in party_members:
		if m.get("id") == "elora": has_elora = true
		if m.get("id") == "thrumbar": has_thrumbar = true
	
	if not has_elora:
		add_party_member({
			"id": "elora",
			"name": "Elora",
			"race": "half-elf",
			"class": "rogue",
			"hp": 16,
			"max_hp": 16,
			"ac": 14,
			"level": 2,
			"portrait": "res://assets/portraits/portrait_elora.png",
			"weapon": "hunting-bow",
			"armor": "leather-armor",
			"spells": [],
			"status_effects": []
		})
	else:
		for m in party_members:
			if m.get("id") == "elora":
				m["hp"] = m.get("max_hp", 16)
				remove_status_effect("Elora", "unconscious")

	if not has_thrumbar:
		add_party_member({
			"id": "thrumbar",
			"name": "Thrumbar",
			"race": "dwarf",
			"class": "cleric",
			"hp": 20,
			"max_hp": 20,
			"ac": 16,
			"level": 2,
			"portrait": "res://assets/portraits/portrait_cleric.png",
			"weapon": "mace",
			"armor": "chain-mail",
			"spells": ["cure-wounds"],
			"status_effects": []
		})
	else:
		for m in party_members:
			if m.get("id") == "thrumbar":
				m["hp"] = m.get("max_hp", 20)
				remove_status_effect("Thrumbar", "unconscious")

	party_leader_index = 0
	current_formation = "rank"
	selected_party_indices = [0]
	party_changed.emit()
	if party_members.size() > 0:
		party_leader_changed.emit(party_leader_index, party_members[0])
	party_formation_changed.emit(current_formation)
	party_selection_changed.emit(selected_party_indices)

func setup_fighter_trio(fighter_hp: int = 100, potions_per_fighter: int = 50) -> void:
	is_party_defeated = false
	hero_name = "Commander Vance"
	hero_class = "fighter"
	hero_race = "human"
	hero_max_hp = fighter_hp
	hero_hp = fighter_hp
	hero_ac = 18
	equipped_weapon = "service-sword"
	equipped_armor = "plate-armor"
	selected_spells = ["tremor-stomp"]
	remove_status_effect(hero_name, "unconscious")

	party_members = [
		{
			"id": "hero",
			"name": hero_name,
			"race": "human",
			"class": "fighter",
			"hp": hero_hp,
			"max_hp": hero_max_hp,
			"ac": hero_ac,
			"level": 5,
			"portrait": "res://assets/portraits/portrait_fighter.png",
			"weapon": "service-sword",
			"armor": "plate-armor",
			"spells": ["tremor-stomp"],
			"potions": potions_per_fighter,
			"status_effects": []
		},
		{
			"id": "garrick",
			"name": "Sergeant Garrick",
			"race": "human",
			"class": "fighter",
			"hp": fighter_hp,
			"max_hp": fighter_hp,
			"ac": 18,
			"level": 5,
			"portrait": "res://assets/portraits/portrait_fighter.png",
			"weapon": "greatsword",
			"armor": "plate-armor",
			"spells": ["crushing-cleave"],
			"potions": potions_per_fighter,
			"status_effects": []
		},
		{
			"id": "brutus",
			"name": "Corporal Brutus",
			"race": "dwarf",
			"class": "fighter",
			"hp": fighter_hp,
			"max_hp": fighter_hp,
			"ac": 18,
			"level": 5,
			"portrait": "res://assets/portraits/portrait_fighter.png",
			"weapon": "warhammer",
			"armor": "plate-armor",
			"spells": ["rallying-stomp"],
			"potions": potions_per_fighter,
			"status_effects": []
		}
	]

	inventory.clear()
	for i in range(potions_per_fighter * 3):
		inventory.append("potion-healing")

	selected_party_indices = [0]
	status_effects = {hero_name: [], "Sergeant Garrick": [], "Corporal Brutus": []}
	status_durations.clear()
	status_realtime_timeouts.clear()
	party_changed.emit()
	party_selection_changed.emit(selected_party_indices)
	hero_damaged.emit(hero_hp, hero_max_hp)
	log_message("system", "⚔️ [TRIO DEPLOYED] 3 Hero Fighters (100 HP each, 50 Potions each in toolbelts) enter the fray!")

func execute_party_auto_heal(threshold_hp: int = 55, preferred_target: String = "") -> Dictionary:
	var injured_member: Dictionary = {}
	if preferred_target != "":
		for m in party_members:
			if (m.get("id") == preferred_target or m.get("name") == preferred_target) and int(m.get("hp", 0)) > 0 and int(m.get("hp", 0)) <= threshold_hp:
				injured_member = m
				break

	if injured_member.is_empty():
		for m in party_members:
			var cur_hp = int(m.get("hp", 0))
			if cur_hp > 0 and cur_hp <= threshold_hp:
				injured_member = m
				break

	if injured_member.is_empty():
		return {"healed": false, "reason": "No party member below HP threshold"}

	if not inventory.has("potion-healing"):
		return {"healed": false, "reason": "No healing potions remaining in inventory"}

	inventory.erase("potion-healing")
	inventory_changed.emit()

	var heal_roll = randi_range(2, 4) + randi_range(2, 4) + 4 # 8-12 HP restored
	var t_name = str(injured_member.get("name", "Fighter"))
	var prev_hp = int(injured_member.get("hp", 0))
	var max_hp = int(injured_member.get("max_hp", 100))
	var new_hp = min(max_hp, prev_hp + heal_roll)
	injured_member["hp"] = new_hp

	if injured_member.get("id") == "hero" or t_name == hero_name:
		hero_hp = new_hp
		hero_damaged.emit(hero_hp, hero_max_hp)

	party_changed.emit()

	var cur_sc = get_tree().current_scene if get_tree() else null
	if cur_sc:
		var target_node: Node2D = null
		if injured_member.get("id") == "hero" or t_name == hero_name:
			target_node = cur_sc.find_child("HeroPlayer", true, false)
		else:
			for child in cur_sc.get_children():
				if "companion_name" in child and (child.get("companion_name") == t_name or child.name.to_lower().contains(injured_member.get("id"))):
					target_node = child
					break
		if target_node and "global_position" in target_node and FloatingTextManager:
			FloatingTextManager.spawn_heal(target_node.global_position, heal_roll)

	if AudioManager:
		AudioManager.play_sfx("wood_open")

	var potions_left = inventory.count("potion-healing")
	log_message("item", "🧪 [AI HEAL] %s drinks Healing Potion! Restored %d HP (%d -> %d/%d). [%d Potions remaining]" % [
		t_name, heal_roll, prev_hp, new_hp, max_hp, potions_left
	])

	return {
		"healed": true,
		"target": t_name,
		"healed_amount": heal_roll,
		"target_hp_before": prev_hp,
		"target_hp_after": new_hp,
		"current_hp": new_hp,
		"max_hp": max_hp,
		"potions_remaining": potions_left
	}

func set_detect_traps_mode(enabled: bool) -> void:
	is_detecting_traps = enabled
	var th_name = get_thief_member_name()
	if enabled:
		log_message("system", "👁️ [FIND TRAPS] %s actively searches for concealed dungeon traps and hazards." % th_name)
		pulse_trap_detection()
	else:
		log_message("system", "[FIND TRAPS] Find Traps mode deactivated.")

func get_thief_member_name() -> String:
	for m in party_members:
		if m.get("class") == "rogue":
			return str(m.get("name", "Thief"))
	return hero_name

func pulse_trap_detection() -> void:
	if Engine.get_main_loop() is SceneTree:
		var tree = Engine.get_main_loop() as SceneTree
		var cur_sc = tree.current_scene
		if cur_sc:
			var th_name = get_thief_member_name()
			for child in cur_sc.get_children():
				if child.has_method("attempt_detection") and not child.get("is_disarmed") and not child.get("is_detected"):
					child.attempt_detection(th_name)

func get_scene_traps() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if Engine.get_main_loop() is SceneTree:
		var tree = Engine.get_main_loop() as SceneTree
		var cur_sc = tree.current_scene
		if cur_sc:
			for child in cur_sc.get_children():
				if child.has_method("get_trap_info"):
					result.append(child.get_trap_info())
	return result

func disarm_trap_by_id(p_trap_id: String, disarmer_name: String = "", force_fumble: bool = false) -> Dictionary:
	var actor = disarmer_name if disarmer_name != "" else get_thief_member_name()
	if Engine.get_main_loop() is SceneTree:
		var tree = Engine.get_main_loop() as SceneTree
		var cur_sc = tree.current_scene
		if cur_sc:
			for child in cur_sc.get_children():
				if child.has_method("disarm_trap") and (child.get("trap_id") == p_trap_id or child.name == p_trap_id):
					return child.disarm_trap(actor, force_fumble)
	return {"success": false, "error": "Trap not found: %s" % p_trap_id}

func trigger_trap_by_id(p_trap_id: String, victim_name: String = "", force_fail_save: bool = false) -> Dictionary:
	var victim = victim_name if victim_name != "" else hero_name
	if Engine.get_main_loop() is SceneTree:
		var tree = Engine.get_main_loop() as SceneTree
		var cur_sc = tree.current_scene
		if cur_sc:
			for child in cur_sc.get_children():
				if child.has_method("force_trigger") and (child.get("trap_id") == p_trap_id or child.name == p_trap_id):
					return child.force_trigger(victim, force_fail_save)
	return {"success": false, "error": "Trap not found: %s" % p_trap_id}

