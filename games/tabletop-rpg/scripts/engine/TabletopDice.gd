# RobOS Tabletop RPG: TabletopDice Singleton
# Autoloaded singleton handling HeroQuest combat dice and 2d6 movement dice.
extends Node

const COMBAT_FACES: Array[String] = [
	"skull",
	"skull",
	"skull",
	"white_shield",
	"white_shield",
	"black_shield"
]

func roll_movement() -> Dictionary:
	var d1 = randi_range(1, 6)
	var d2 = randi_range(1, 6)
	return {
		"total": d1 + d2,
		"d1": d1,
		"d2": d2
	}

func roll_combat_dice(num_dice: int) -> Dictionary:
	var faces: Array[String] = []
	var skulls: int = 0
	var white_shields: int = 0
	var black_shields: int = 0

	for i in range(num_dice):
		var face = COMBAT_FACES[randi() % 6]
		faces.append(face)
		if face == "skull":
			skulls += 1
		elif face == "white_shield":
			white_shields += 1
		elif face == "black_shield":
			black_shields += 1

	return {
		"dice_count": num_dice,
		"faces": faces,
		"skulls": skulls,
		"white_shields": white_shields,
		"black_shields": black_shields
	}

func resolve_combat(attack_dice: int, defend_dice: int, is_hero_defending: bool, bonus_damage: int = 0) -> Dictionary:
	var atk = roll_combat_dice(attack_dice)
	var def = roll_combat_dice(defend_dice)

	var total_skulls = atk.skulls + bonus_damage
	var effective_shields = def.white_shields if is_hero_defending else def.black_shields
	var wounds = maxi(0, total_skulls - effective_shields)

	return {
		"attack": atk,
		"defense": def,
		"total_skulls": total_skulls,
		"effective_shields": effective_shields,
		"is_hero_defending": is_hero_defending,
		"wounds": wounds,
		"is_blocked": wounds == 0
	}
