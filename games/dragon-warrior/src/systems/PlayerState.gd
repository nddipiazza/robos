extends Node

# PlayerState.gd — Data Container & State Persistence Manager for AI Dragon Warrior v2
# Tracks hero statistics, active equipment, inventory, current location, quest flags, and serialization.

var hero_name: String = "Loto"
var level: int = 1
var xp: int = 0
var gold: int = 120

var hp: int = 15
var max_hp: int = 15
var mp: int = 0
var max_mp: int = 0

var base_strength: int = 4
var base_agility: int = 4

var weapon_id: String = ""
var armor_id: String = ""
var shield_id: String = ""

var inventory: Array = [] # Array of item_ids (e.g. ["herb", "torch"])
var quest_flags: Dictionary = {
	"saved_princess": false,
	"has_gwaelin_love": false,
	"has_rainbow_drop": false,
	"dragonlord_defeated": false
}

var current_location_id: String = "tantegel_castle"
var current_floor_id: String = "1f"
var tile_position: Vector2i = Vector2i(8, 8)
var facing: String = "down"

func _ready():
	print("[PlayerState] Initialized player state manager.")

func calculate_attack_power() -> int:
	var atk = base_strength
	if weapon_id != "" and DataManager and DataManager.weapons.has(weapon_id):
		atk += int(DataManager.weapons[weapon_id].get("attack", 0))
	return atk

func calculate_defense_power() -> int:
	var def = base_agility / 2
	if armor_id != "" and DataManager and DataManager.armor.has(armor_id):
		def += int(DataManager.armor[armor_id].get("defense", 0))
	if shield_id != "" and DataManager and DataManager.shields.has(shield_id):
		def += int(DataManager.shields[shield_id].get("defense", 0))
	return def

func add_item(item_id: String) -> bool:
	if inventory.size() < 8:
		inventory.append(item_id)
		if EventBus:
			EventBus.item_added.emit(item_id)
		return true
	return false

func remove_item(item_id: String) -> bool:
	var idx = inventory.find(item_id)
	if idx != -1:
		inventory.remove_at(idx)
		if EventBus:
			EventBus.item_removed.emit(item_id)
		return true
	return false

func serialize() -> Dictionary:
	return {
		"hero_name": hero_name,
		"level": level,
		"xp": xp,
		"gold": gold,
		"hp": hp,
		"max_hp": max_hp,
		"mp": mp,
		"max_mp": max_mp,
		"base_strength": base_strength,
		"base_agility": base_agility,
		"weapon_id": weapon_id,
		"armor_id": armor_id,
		"shield_id": shield_id,
		"inventory": inventory,
		"quest_flags": quest_flags,
		"current_location_id": current_location_id,
		"current_floor_id": current_floor_id,
		"tile_position": [tile_position.x, tile_position.y],
		"facing": facing
	}

func deserialize(data: Dictionary) -> void:
	hero_name = data.get("hero_name", hero_name)
	level = int(data.get("level", level))
	xp = int(data.get("xp", xp))
	gold = int(data.get("gold", gold))
	hp = int(data.get("hp", hp))
	max_hp = int(data.get("max_hp", max_hp))
	mp = int(data.get("mp", mp))
	max_mp = int(data.get("max_mp", max_mp))
	base_strength = int(data.get("base_strength", base_strength))
	base_agility = int(data.get("base_agility", base_agility))
	weapon_id = data.get("weapon_id", weapon_id)
	armor_id = data.get("armor_id", armor_id)
	shield_id = data.get("shield_id", shield_id)
	inventory = data.get("inventory", []).duplicate()
	quest_flags = data.get("quest_flags", {}).duplicate()
	current_location_id = data.get("current_location_id", current_location_id)
	current_floor_id = data.get("current_floor_id", current_floor_id)
	var pos_arr = data.get("tile_position", [8, 8])
	if pos_arr is Array and pos_arr.size() >= 2:
		tile_position = Vector2i(int(pos_arr[0]), int(pos_arr[1]))
	facing = data.get("facing", facing)
	
	if EventBus:
		EventBus.player_stats_changed.emit(serialize())
