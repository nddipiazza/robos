# RobOS Tabletop RPG: HeroQuestEquipment Singleton
# Implements authentic HeroQuest standard weapons, armor, restrictions, and dice calculation.
extends Node

const WEAPONS: Dictionary = {
	"broadsword": {
		"id": "broadsword",
		"name": "Broadsword",
		"attack_dice": 3,
		"diagonal": false,
		"two_handed": false,
		"ranged": false,
		"cost": 250,
		"icon": "🗡️",
		"description": "Standard heavy steel blade. Rolls 3 combat dice in adjacent melee combat.",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	},
	"shortsword": {
		"id": "shortsword",
		"name": "Shortsword",
		"attack_dice": 2,
		"diagonal": true, # Can strike diagonally!
		"two_handed": false,
		"ranged": false,
		"cost": 150,
		"icon": "⚔️",
		"description": "Swift thrusting blade. Rolls 2 combat dice and can strike diagonally adjacent foes.",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	},
	"battle_axe": {
		"id": "battle_axe",
		"name": "Battle Axe",
		"attack_dice": 4,
		"diagonal": false,
		"two_handed": true, # Cannot be used with a shield!
		"ranged": false,
		"cost": 450,
		"icon": "🪓",
		"description": "Massive two-handed greataxe. Rolls 4 combat dice. Requires two hands (cannot use a shield).",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	},
	"crossbow": {
		"id": "crossbow",
		"name": "Crossbow",
		"attack_dice": 3,
		"diagonal": false,
		"two_handed": true,
		"ranged": true, # Fires at any target in direct LOS, cannot fire adjacent!
		"cost": 350,
		"icon": "🏹",
		"description": "Deadly missile weapon. Rolls 3 combat dice at any target in line of sight. Cannot shoot adjacent targets.",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	},
	"dagger": {
		"id": "dagger",
		"name": "Dagger",
		"attack_dice": 1,
		"diagonal": false,
		"two_handed": false,
		"ranged": true, # Can be thrown in LOS (consumed on throw)
		"cost": 25,
		"icon": "🗡",
		"description": "Swift hunting knife. Rolls 1 combat die. Can be used in melee or thrown at a distant foe in line of sight.",
		"allowed_heroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	"staff": {
		"id": "staff",
		"name": "Staff",
		"attack_dice": 1,
		"diagonal": true, # Diagonal melee!
		"two_handed": true, # Requires two hands
		"ranged": false,
		"cost": 100,
		"icon": "🪄",
		"description": "Carved hardwood staff. Rolls 1 combat die and can attack diagonally. Requires two hands.",
		"allowed_heroes": ["barbarian", "dwarf", "elf", "wizard"]
	}
}

const ARMOR: Dictionary = {
	"shield": {
		"id": "shield",
		"name": "Shield",
		"defend_bonus": 1,
		"slot": "shield",
		"incompatible_with_two_handed": true,
		"cost": 150,
		"icon": "🛡️",
		"description": "Sturdy wooden or iron shield. Adds 1 extra combat die in defense. Cannot be used with 2-handed weapons.",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	},
	"helmet": {
		"id": "helmet",
		"name": "Helmet",
		"defend_bonus": 1,
		"slot": "helmet",
		"cost": 120,
		"icon": "🪖",
		"description": "Forged iron helm. Adds 1 extra combat die in defense.",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	},
	"chain_mail": {
		"id": "chain_mail",
		"name": "Chain Mail",
		"base_defend_dice": 3,
		"slot": "body",
		"cost": 500,
		"icon": "⛓️",
		"description": "Interlocking metal rings. Sets base defense to 3 combat dice.",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	},
	"plate_mail": {
		"id": "plate_mail",
		"name": "Plate Mail",
		"base_defend_dice": 4,
		"movement_dice": 1, # Penalizes movement from 2d6 to 1d6!
		"slot": "body",
		"cost": 850,
		"icon": "🥋",
		"description": "Heavy fitted steel plate armor. Grants 4 combat dice in defense, but slows movement to 1 die.",
		"allowed_heroes": ["barbarian", "dwarf", "elf"]
	}
}

const CONSUMABLES: Dictionary = {
	"healing_potion": {
		"id": "healing_potion",
		"name": "Potion of Healing",
		"type": "consumable",
		"heal_amount": 4,
		"icon": "🧪",
		"description": "Restores up to 4 lost Body Points to target hero (cannot exceed maximum BP).",
		"cost": 200
	},
	"potion_of_healing": {
		"id": "potion_of_healing",
		"name": "Potion of Healing",
		"type": "consumable",
		"heal_amount": 4,
		"icon": "🧪",
		"description": "Restores up to 4 lost Body Points to target hero (cannot exceed maximum BP).",
		"cost": 200
	},
	"potion_of_strength": {
		"id": "potion_of_strength",
		"name": "Potion of Strength",
		"type": "consumable",
		"attack_bonus": 2,
		"icon": "💪",
		"description": "Grants +2 extra Combat Dice on your next attack.",
		"cost": 300
	},
	"potion_of_speed": {
		"id": "potion_of_speed",
		"name": "Potion of Speed",
		"type": "consumable",
		"movement_bonus": 4,
		"icon": "⚡",
		"description": "Doubles movement or grants swift speed on your turn.",
		"cost": 250
	},
	"holy_water": {
		"id": "holy_water",
		"name": "Holy Water",
		"type": "consumable",
		"damage": 3,
		"target_type": "undead",
		"icon": "💧",
		"description": "Discards to inflict 3 direct damage on an undead creature in line of sight.",
		"cost": 400
	}
}

const TOOLS: Dictionary = {
	"tool_kit": {
		"id": "tool_kit",
		"name": "Tool Kit",
		"type": "tool",
		"icon": "🧰",
		"description": "Enables non-Dwarf heroes to disarm discovered traps. The Dwarf possesses innate disarm skill and does not require a tool kit.",
		"cost": 250,
		"allowed_heroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	"toolbox": {
		"id": "toolbox",
		"name": "Tool Kit",
		"type": "tool",
		"icon": "🧰",
		"description": "Enables non-Dwarf heroes to disarm discovered traps. The Dwarf possesses innate disarm skill and does not require a tool kit.",
		"cost": 250,
		"allowed_heroes": ["barbarian", "dwarf", "elf", "wizard"]
	}
}

func get_weapon(weapon_id: String) -> Dictionary:
	return WEAPONS.get(weapon_id.to_lower().strip_edges(), {})

func get_armor(armor_id: String) -> Dictionary:
	return ARMOR.get(armor_id.to_lower().strip_edges(), {})

func get_consumable(item_id: String) -> Dictionary:
	return CONSUMABLES.get(item_id.to_lower().strip_edges(), {})

func is_consumable(item_id: String) -> bool:
	return CONSUMABLES.has(item_id.to_lower().strip_edges())

func get_tool(tool_id: String) -> Dictionary:
	return TOOLS.get(tool_id.to_lower().strip_edges(), {})

func is_tool(tool_id: String) -> bool:
	return TOOLS.has(tool_id.to_lower().strip_edges())

func get_item(item_id: String) -> Dictionary:
	var key = item_id.to_lower().strip_edges()
	if CONSUMABLES.has(key):
		return CONSUMABLES[key]
	if TOOLS.has(key):
		return TOOLS[key]
	if WEAPONS.has(key):
		return WEAPONS[key]
	if ARMOR.has(key):
		return ARMOR[key]
	return {}

func get_all_equipment() -> Dictionary:
	return {
		"weapons": WEAPONS,
		"armor": ARMOR,
		"consumables": CONSUMABLES,
		"tools": TOOLS
	}

func can_hero_equip(hero_id: String, item_id: String) -> Dictionary:
	var item = get_weapon(item_id)
	if item.is_empty():
		item = get_armor(item_id)
	if item.is_empty():
		return { "can_equip": false, "reason": "Item not found: " + item_id }

	var allowed = item.get("allowed_heroes", [])
	if allowed.size() > 0 and not allowed.has(hero_id):
		return { "can_equip": false, "reason": "%s cannot equip %s due to class restrictions!" % [hero_id.capitalize(), item.get("name")] }

	return { "can_equip": true }
