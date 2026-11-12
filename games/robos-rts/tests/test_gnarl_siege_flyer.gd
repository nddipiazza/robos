extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 150, "height": 120},
		"players": {"1": {"faction": "monsters", "crystal": 800, "aether": 800}, "2": {"faction": "humans"}},
	})
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(25, 30))
	var spire: Dictionary = sim.spawn_unit("blight_spire", 1, Vector2(37, 42))
	var flyer: Dictionary = sim.spawn_unit("corrosion_flyer", 1, Vector2(70, 55))
	_check(not sim.issue_command([spire.tag], "evolve_greater_blight_spire").ok, "The Greater Spire requires a Hive")
	_check(not sim.issue_command([flyer.tag], "morph_brood_siege_flyer").ok, "Siege Flyers require the Greater Spire")
	nest["structure_form"] = "brood_hive"
	_check(sim.issue_command([spire.tag], "evolve_greater_blight_spire").ok
		and sim.players[1].crystal == 650 and sim.players[1].aether == 600, "Greater Spire evolution costs 150/200")
	var evolution: int = ceili(100.0 / 1.4 * sim.TICK_RATE)
	sim.step_ticks(evolution - 1)
	_check(not sim.has_tech_structure(1, "greater_blight_spire"), "The evolution grants no tech before completion")
	sim.step_ticks(1)
	_check(sim.has_tech_structure(1, "greater_blight_spire") and sim.has_tech_structure(1, "blight_spire")
		and spire.max_hp == 1000.0, "The Greater Spire retains the base Spire's tech and gains health")
	_test_spray(flyer)
	_test_siege_flyer(flyer)
	print("Gnarl siege flyers: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_spray(flyer: Dictionary) -> void:
	var target: Dictionary = sim.spawn_unit("silo", 2, Vector2(84, 55))
	var ground: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(83, 61))
	sim.issue_command([ground.tag], "hold_fire")
	sim._refresh_vision()
	_check(not sim.issue_command([flyer.tag], "caustic_spray", ground.pos, ground.tag).ok, "Spray targets enemy structures only")
	_check(sim.issue_command([flyer.tag], "caustic_spray", target.pos, target.tag).ok and flyer.is_immobile,
		"The Flyer holds position to channel")
	sim.step_ticks(4 * sim.TICK_RATE)
	_check(is_equal_approx(target.hp, target.max_hp - 28.0), "The first four seconds apply seven armor-bypassing damage per second")
	sim.step_ticks(2 * sim.TICK_RATE)
	var ramp_ticks: int = ceili(Rules.CAUSTIC_SPRAY_RAMP * sim.TICK_RATE)
	var total: float = (ramp_ticks * 7.0 + (6 * sim.TICK_RATE - ramp_ticks) * 35.0) / sim.TICK_RATE
	_check(is_equal_approx(target.hp, target.max_hp - total), "The damage ramps to 35 per second on schedule")
	_check(sim.issue_command([flyer.tag], "stop").ok and not flyer.has("caustic_spray") and not flyer.is_immobile,
		"Stop ends the channel immediately")
	_check(not sim.issue_command([flyer.tag], "caustic_spray", target.pos, target.tag).ok, "The channel has a cooldown")

func _test_siege_flyer(flyer: Dictionary) -> void:
	var bank: Dictionary = sim.players[1]
	var supply: float = bank.supply_used
	_check(sim.issue_command([flyer.tag], "morph_brood_siege_flyer").ok and flyer.unit_type == "siege_flyer_cocoon"
		and bank.supply_used == supply + 2 and bank.crystal == 500 and bank.aether == 450,
		"The airborne cocoon costs 150/150 and reserves two more supply")
	var duration: int = ceili(34.0 / 1.4 * sim.TICK_RATE)
	sim.step_ticks(duration)
	_check(flyer.unit_type == "brood_siege_flyer" and flyer.hp == 225.0 and flyer.flight_height > 0.0,
		"The 225 HP siege flyer emerges after 24.29 seconds")
	var target: Dictionary = sim.spawn_unit("muster_hall", 2, Vector2(90, 62))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(85, 60))
	sim.issue_command([air.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(not sim.can_attack(flyer, air) and sim._execute_weapon_hit(flyer, target)
		and target.hp == target.max_hp - 38.0, "The two impacts deal ground damage through armor")
	var broodlings: Array = sim.units.values().filter(func(unit): return unit.unit_type == "broodling")
	_check(broodlings.size() == 2 and bank.supply_used == supply + 2, "Both Broodlings appear without consuming supply")
	sim.issue_command([flyer.tag], "hold_fire")
	sim.step_ticks(ceili(5.0 / 1.4 * sim.TICK_RATE))
	_check(not sim.units.values().any(func(unit): return unit.unit_type == "broodling"), "Broodlings expire at 3.57 seconds")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
