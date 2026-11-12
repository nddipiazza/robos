extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim := root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "map": {"width": 145, "height": 125},
		"players": {"1": {"faction": "monsters", "crystal": 700, "aether": 700}, "2": {"faction": "humans"}},
	})
	var spire: Dictionary = sim.spawn_unit("blight_spire", 1, Vector2(25, 25))
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(25, 40))
	var bank: Dictionary = sim.players[1]
	assert(sim.issue_command([spire.tag], "research_brood_air_weapons").ok)
	assert(sim.issue_command([spire.tag], "research_brood_air_armor").ok)
	assert(bank.crystal == 500 and bank.aether == 500)
	var first_tier := ceili(Rules.BROOD_GROUND_UPGRADE_TIMES[0] * sim.TICK_RATE)
	sim.step_ticks(first_tier)
	assert(bank.upgrades.get("brood_air_weapons", 0) == 1 and not bank.upgrades.get("brood_air_armor", 0))
	assert(not sim.issue_command([spire.tag], "research_brood_air_weapons").ok)
	nest["structure_form"] = "brood_lair"
	assert(sim.research_offer(1, "brood_air_weapons").crystal == 175)
	assert(sim.issue_command([spire.tag], "research_brood_air_weapons").ok)
	sim.step_ticks(first_tier + ceili(Rules.BROOD_GROUND_UPGRADE_TIMES[1] * sim.TICK_RATE))
	assert(bank.upgrades.get("brood_air_weapons", 0) == 2 and bank.upgrades.get("brood_air_armor", 0) == 1)
	assert(not sim.issue_command([spire.tag], "research_brood_air_weapons").ok)
	nest.structure_form = "brood_hive"
	assert(sim.research_offer(1, "brood_air_weapons").crystal == 250)
	assert(sim.issue_command([spire.tag], "research_brood_air_weapons").ok)
	var flyer: Dictionary = sim.spawn_unit("needlewing", 1, Vector2(90, 55))
	var sac: Dictionary = sim.spawn_unit("drift_sac", 1, Vector2(88, 51))
	var ground: Dictionary = sim.spawn_unit("skitterling", 1, Vector2(90, 50))
	var first: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(95, 55))
	var second: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(99, 55))
	var third: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(104, 55))
	sim._rebuild_spatial_grid()
	assert(sim._execute_weapon_hit(flyer, first))
	assert(is_equal_approx(first.hp, first.max_hp - 11.0))
	assert(is_equal_approx(second.hp, second.max_hp - 11.0 / 3.0))
	assert(is_equal_approx(third.hp, third.max_hp - 11.0 / 9.0))
	assert(sim.unit_upgrade_level(sac, "armor") == 1 and sim.unit_upgrade_level(ground, "armor") == 0)
	print("Gnarl flyer upgrades: passed")
	quit()
