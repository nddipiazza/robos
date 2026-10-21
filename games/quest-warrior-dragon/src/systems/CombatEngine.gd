extends Node

# CombatEngine.gd — Specification-Driven Combat Calculator & State Machine for AI Quest: Warrior Dragon v2
# Executes turn-based combat logic based on monster data schemas and NES formulas.

enum CombatState {
	INACTIVE,
	PLAYER_TURN,
	MONSTER_TURN,
	VICTORY,
	DEFEAT,
	FLED
}

var current_state: CombatState = CombatState.INACTIVE
var active_monster: Dictionary = {}
var monster_current_hp: int = 0

func _ready():
	print("[CombatEngine] Initialized turn-based combat engine.")

func start_battle(monster_id: String) -> void:
	if DataManager and DataManager.monsters.has(monster_id):
		active_monster = DataManager.monsters[monster_id].duplicate()
	else:
		active_monster = {
			"name": monster_id.capitalize(),
			"hp": 5,
			"str": 4,
			"ag": 3,
			"exp": 1,
			"gold": 2
		}
	
	var hp_min := int(active_monster.get("hp_min", active_monster.get("hp", 5)))
	var hp_max := int(active_monster.get("hp_max", hp_min))
	monster_current_hp = randi_range(hp_min, hp_max)
	current_state = CombatState.PLAYER_TURN
	print("[CombatEngine] Battle started against: %s (HP: %d)" % [active_monster.get("name", "Unknown"), monster_current_hp])
	
	if EventBus:
		EventBus.battle_started.emit(active_monster)

func execute_player_attack() -> Dictionary:
	if current_state != CombatState.PLAYER_TURN:
		return {"success": false, "message": "Not player's turn."}
	
	var hero_atk = PlayerState.calculate_attack_power() if PlayerState else 4
	var monster_def = int(active_monster.get("agility", active_monster.get("ag", 3))) / 2
	
	# NES DW formula estimate: max(1, (hero_atk - monster_def) / 2 to / 4)
	var base_dmg = max(1, hero_atk - monster_def)
	var dmg = randi_range(max(1, base_dmg / 4), max(1, base_dmg / 2))
	
	monster_current_hp -= dmg
	var msg = "%s attacks! Deals %d damage." % [PlayerState.hero_name if PlayerState else "Hero", dmg]
	
	if monster_current_hp <= 0:
		current_state = CombatState.VICTORY
		var exp_gained := int(active_monster.get("xp", active_monster.get("exp", 1)))
		var gp_min := int(active_monster.get("gp_min", active_monster.get("gold", 2)))
		var gp_max := int(active_monster.get("gp_max", gp_min))
		var gold_gained := randi_range(gp_min, gp_max)
		if PlayerState:
			PlayerState.xp += exp_gained
			PlayerState.gold += gold_gained
		if EventBus:
			EventBus.battle_ended.emit(true, exp_gained, gold_gained)
		return {"success": true, "message": msg + " Defeated the enemy!", "state": current_state, "damage": dmg}
	else:
		current_state = CombatState.MONSTER_TURN
		return {"success": true, "message": msg, "state": current_state, "damage": dmg}

func execute_monster_turn() -> Dictionary:
	if current_state != CombatState.MONSTER_TURN:
		return {"success": false, "message": "Not monster's turn."}
	
	var monster_str = int(active_monster.get("strength", active_monster.get("str", 4)))
	var hero_def = PlayerState.calculate_defense_power() if PlayerState else 2
	var base_dmg = max(1, monster_str - hero_def)
	var dmg = randi_range(max(1, base_dmg / 4), max(1, base_dmg / 2))
	
	if PlayerState:
		PlayerState.hp = max(0, PlayerState.hp - dmg)
		if PlayerState.hp <= 0:
			current_state = CombatState.DEFEAT
			if EventBus:
				EventBus.battle_ended.emit(false, 0, 0)
			return {"success": true, "message": "%s strikes! Hero is defeated." % active_monster.get("name", "Enemy"), "state": current_state, "damage": dmg}
	
	current_state = CombatState.PLAYER_TURN
	return {"success": true, "message": "%s attacks for %d damage!" % [active_monster.get("name", "Enemy"), dmg], "state": current_state, "damage": dmg}

func attempt_run() -> Dictionary:
	if current_state != CombatState.PLAYER_TURN:
		return {"success": false, "message": "Cannot run right now."}
	
	var hero_ag = PlayerState.base_agility if PlayerState else 4
	var monster_ag = int(active_monster.get("agility", active_monster.get("ag", 3)))
	
	var run_success = (hero_ag * randf()) > (monster_ag * 0.5)
	if run_success:
		current_state = CombatState.FLED
		if EventBus:
			EventBus.battle_ended.emit(false, 0, 0)
		return {"success": true, "ran": true, "message": "Ran away safely!", "state": current_state}
	else:
		current_state = CombatState.MONSTER_TURN
		return {"success": true, "ran": false, "message": "Blocked from running!", "state": current_state}
