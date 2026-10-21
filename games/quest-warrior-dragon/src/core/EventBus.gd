extends Node

# EventBus.gd — Central Signal Hub for AI Quest: Warrior Dragon v2
# Decouples engine subsystems from UI and scene views.

# Data Signals
signal data_loaded()

# Exploration & Map Signals
signal map_changed(location_id: String, floor_id: String, tile_pos: Vector2i)
signal player_moved(tile_pos: Vector2i, facing: String)
signal encounter_triggered(zone_id: int, monster_id: String)
signal door_unlocked(location_id: String, door_pos: Vector2i)
signal chest_opened(location_id: String, chest_id: String, item_id: String)

# Combat Signals
signal battle_started(monster_data: Dictionary)
signal battle_round_started()
signal battle_message(text: String)
signal battle_ended(victory: bool, exp_gained: int, gold_gained: int)

# Dialogue & Shop Signals
signal dialogue_started(npc_id: String, lines: Array)
signal dialogue_line_changed(speaker: String, text: String)
signal dialogue_ended()
signal shop_opened(shop_id: String, inventory: Array)
signal shop_closed()

# Progression & State Signals
signal player_stats_changed(stats: Dictionary)
signal item_added(item_id: String)
signal item_removed(item_id: String)
signal level_up(level: int, hp_gain: int, mp_gain: int, spell_learned: String)
signal game_saved(save_data: Dictionary)
signal game_loaded(save_data: Dictionary)

func _ready():
	print("[EventBus] Initialized central signal hub.")
