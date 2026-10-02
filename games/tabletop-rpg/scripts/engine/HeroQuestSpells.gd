# RobOS Tabletop RPG: HeroQuestSpells Singleton
# Implements authentic HeroQuest standard 12 elemental spells (Fire, Earth, Water, Air)
# plus Dread / Chaos spells used by Zargon / Game Master.
extends Node

const SPELLS: Dictionary = {
	# --- FIRE SPELLS ---
	"ball_of_flame": {
		"id": "ball_of_flame",
		"name": "Ball of Flame",
		"deck": "fire",
		"target_type": "monster",
		"range_type": "los",
		"damage": 2,
		"defend_dice": 2,
		"icon": "🔥",
		"description": "Engulfs target monster in a blazing sphere of fire. Inflicts 2 BP damage; target rolls 2 combat dice to defend.",
		"vfx": "projectile_fire_burst",
		"color": "#ea580c"
	},
	"fire_of_wrath": {
		"id": "fire_of_wrath",
		"name": "Fire of Wrath",
		"deck": "fire",
		"target_type": "monster",
		"range_type": "los",
		"damage": 1,
		"defend_dice": 1,
		"icon": "⚡",
		"description": "Blasts target monster anywhere in line of sight with holy flame. Inflicts 1 BP damage; target rolls 1 combat die to defend.",
		"vfx": "fire_beam",
		"color": "#f97316"
	},
	"courage": {
		"id": "courage",
		"name": "Courage",
		"deck": "fire",
		"target_type": "hero",
		"range_type": "los",
		"attack_bonus": 2,
		"icon": "🦁",
		"description": "Cast on any hero. Grants +2 extra attack dice on attacks until no monsters are visible.",
		"vfx": "flame_aura",
		"color": "#ef4444"
	},

	# --- EARTH SPELLS ---
	"rock_skin": {
		"id": "rock_skin",
		"name": "Rock Skin",
		"deck": "earth",
		"target_type": "hero",
		"range_type": "los",
		"defend_bonus": 1,
		"icon": "🪨",
		"description": "Hardens the target's skin like granite. Grants +1 extra combat die in defense until wounded.",
		"vfx": "stone_shield",
		"color": "#78716c"
	},
	"heal_body": {
		"id": "heal_body",
		"name": "Heal Body",
		"deck": "earth",
		"target_type": "hero",
		"range_type": "touch",
		"heal_amount": 4,
		"icon": "💚",
		"description": "Restores up to 4 lost Body Points to target hero (cannot exceed max BP).",
		"vfx": "healing_radiance",
		"color": "#22c55e"
	},
	"pass_through_rock": {
		"id": "pass_through_rock",
		"name": "Pass Through Rock",
		"deck": "earth",
		"target_type": "hero",
		"range_type": "touch",
		"icon": "👻",
		"description": "Enables target hero to phase through solid rock walls on their next move.",
		"vfx": "phase_mist",
		"color": "#a8a29e"
	},

	# --- WATER SPELLS ---
	"water_of_healing": {
		"id": "water_of_healing",
		"name": "Water of Healing",
		"deck": "water",
		"target_type": "hero",
		"range_type": "touch",
		"heal_amount": 4,
		"icon": "💧",
		"description": "Soothing holy waters restore up to 4 lost Body Points to target hero.",
		"vfx": "water_fountain",
		"color": "#06b6d4"
	},
	"sleep": {
		"id": "sleep",
		"name": "Sleep",
		"deck": "water",
		"target_type": "monster",
		"range_type": "los",
		"icon": "💤",
		"description": "Causes target monster to fall into deep enchanted slumber. Sleeping monsters cannot move, attack, or defend.",
		"vfx": "sleep_runes",
		"color": "#6366f1"
	},
	"veil_of_mist": {
		"id": "veil_of_mist",
		"name": "Veil of Mist",
		"deck": "water",
		"target_type": "hero",
		"range_type": "touch",
		"icon": "🌫️",
		"description": "Wraps hero in dense shroud of mist, allowing them to pass through monster-occupied squares unseen.",
		"vfx": "mist_veil",
		"color": "#94a3b8"
	},

	# --- AIR SPELLS ---
	"genie": {
		"id": "genie",
		"name": "Genie",
		"deck": "air",
		"target_type": "choice", # monster or door
		"range_type": "los",
		"attack_dice": 5,
		"icon": "🧞",
		"description": "Summons an ancient Genie to strike any monster in line of sight with 5 combat dice, or automatically open any door.",
		"vfx": "genie_blast",
		"color": "#0284c7"
	},
	"swift_wind": {
		"id": "swift_wind",
		"name": "Swift Wind",
		"deck": "air",
		"target_type": "hero",
		"range_type": "touch",
		"movement_dice_mult": 2,
		"icon": "💨",
		"description": "Gales of wind carry target hero forward at double movement speed (4d6 movement dice).",
		"vfx": "speed_trail",
		"color": "#38bdf8"
	},
	"tempest": {
		"id": "tempest",
		"name": "Tempest",
		"deck": "air",
		"target_type": "monster",
		"range_type": "los",
		"icon": "🌪️",
		"description": "Envelops target monster in a violent whirlwind, causing it to lose its next turn.",
		"vfx": "cyclone_vortex",
		"color": "#0ea5e9"
	},

	# --- DREAD / CHAOS SPELLS ---
	"command": {
		"id": "command",
		"name": "Command",
		"deck": "dread",
		"target_type": "hero",
		"range_type": "los",
		"icon": "👁️",
		"description": "Dread sorcery forcing target hero to make an attack roll against an adjacent hero.",
		"vfx": "chaos_eye",
		"color": "#9333ea"
	},
	"summon_undead": {
		"id": "summon_undead",
		"name": "Summon Undead",
		"deck": "dread",
		"target_type": "tile",
		"range_type": "los",
		"icon": "💀",
		"description": "Zargon summons a dread skeleton warrior into the dungeon.",
		"vfx": "undead_burst",
		"color": "#7e22ce"
	}
}

func get_spell(spell_id: String) -> Dictionary:
	return SPELLS.get(spell_id.to_lower().strip_edges(), {})

func get_spells_by_deck(deck: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for sid in SPELLS:
		if SPELLS[sid].get("deck") == deck:
			result.append(SPELLS[sid])
	return result

func get_all_spells() -> Dictionary:
	return SPELLS
