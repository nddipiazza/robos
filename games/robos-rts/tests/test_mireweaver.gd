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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 180, "height": 140},
		"players": {"1": {"faction": "monsters", "crystal": 900, "aether": 900}, "2": {"faction": "aliens"}},
	})
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(30, 30))
	_check(not sim.issue_command([nest.tag], "train_mireweaver").ok, "Hatching requires a completed Infestation Pit")
	var pit: Dictionary = sim.spawn_unit("infestation_pit", 1, Vector2(44, 28))
	_check(sim.issue_command([nest.tag], "train_mireweaver").ok and sim.players[1].crystal == 800
		and sim.players[1].aether == 750, "The egg costs 100 crystal and 150 aether")
	_check(sim.issue_command([pit.tag], "research_microbial_shroud").ok and sim.players[1].crystal == 650
		and sim.players[1].aether == 600, "Shroud research costs 150/150 at the Pit")
	sim.step_ticks(ceili(50.0 / 1.4 * sim.TICK_RATE))
	var hatches: Array = sim.units.values().filter(func(unit): return unit.unit_type == "mireweaver")
	_check(hatches.size() == 1 and hatches[0].energy >= 75.0 and hatches[0].get("weapon", {}).is_empty(), "Paid hatch yields an unarmed caster with 75 energy")
	_check(sim.players[1].upgrades.get("microbial_shroud", 0) == 0, "Shroud requires the complete research timer")
	sim.step_ticks(ceili(110.0 / 1.4 * sim.TICK_RATE) - ceili(50.0 / 1.4 * sim.TICK_RATE))
	_check(sim.players[1].upgrades.get("microbial_shroud", 0) == 1, "Shroud unlocks after 78.57 seconds")
	_test_fungal()
	_test_shroud()
	_test_tether(pit)
	print("Mireweaver: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_fungal() -> void:
	var caster: Dictionary = sim.spawn_unit("mireweaver", 1, Vector2(75, 75))
	var target: Dictionary = sim.spawn_unit("skirmisher", 2, Vector2(90, 75))
	var cloaked: Dictionary = sim.spawn_unit("duskblade", 2, Vector2(91, 79))
	var air: Dictionary = sim.spawn_unit("farsight_wisp", 2, Vector2(93, 73))
	var ally: Dictionary = sim.spawn_unit("mireweaver", 1, Vector2(90, 72))
	sim.issue_command([target.tag, cloaked.tag], "hold_fire")
	sim.players[2].upgrades.phase_step = 1
	sim._refresh_vision()
	_check(not sim.can_see_unit(1, cloaked) and not sim.can_see_unit(1, air), "Cloaked targets start hidden")
	_check(not sim.issue_command([caster.tag], "fungal_grasp", Vector2(110, 75)).ok and caster.energy == 75.0, "Out-of-range casts spend no energy")
	var speed: float = sim.effective_move_speed(target)
	var shields: float = target.shields
	_check(sim.issue_command([caster.tag], "fungal_grasp", target.pos).ok and caster.energy == 0.0
		and not sim.fungal_grasp_active(target), "Fungal Grasp spends 75 energy and travels before applying its effect")
	var travel: int = ceili(15.0 * sim.TICK_RATE / Rules.FUNGAL_GRASP_PROJECTILE_SPEED)
	sim.step_ticks(travel)
	_check(sim.fungal_grasp_active(target) and sim.can_see_unit(1, cloaked) and sim.can_see_unit(1, air)
		and not sim.fungal_grasp_active(ally), "The impact reveals hostile ground and air units without infecting allies")
	_check(is_equal_approx(sim.effective_move_speed(target), speed * 0.25)
		and not sim.issue_command([target.tag], "phase_step", target.pos + Vector2(3, 0)).ok, "The infection slows and prevents Phase Step")
	sim.step_ticks(Rules.FUNGAL_GRASP_SECONDS * sim.TICK_RATE)
	_check(is_equal_approx(target.shields, shields - 30.0) and not sim.fungal_grasp_active(target)
		and not sim.can_see_unit(1, cloaked), "Twelve pulses total 30 damage, then slow and reveal expire")
	sim.players[1].upgrades.burrow = 1
	_check(sim.issue_command([caster.tag], "burrow").ok, "Shared Burrow research unlocks Mireweaver burrow")
	sim.step_ticks(sim.TICK_RATE * 2)
	_check(caster.burrow_mobile and caster.sight_range == 20.0
		and sim.issue_command([caster.tag], "move", caster.pos + Vector2(-6, 0)).ok, "The burrowed caster can move with reduced sight")

func _test_shroud() -> void:
	var caster: Dictionary = sim.spawn_unit("mireweaver", 1, Vector2(46, 99))
	var target: Dictionary = sim.spawn_unit("forager", 1, Vector2(60, 99))
	var flyer: Dictionary = sim.spawn_unit("drift_sac", 1, Vector2(60, 101))
	var attacker: Dictionary = sim.spawn_unit("skirmisher", 2, Vector2(73, 100))
	caster.energy = 100.0
	sim._refresh_vision()
	_check(sim.issue_command([caster.tag], "microbial_shroud", target.pos).ok and caster.energy == 0.0,
		"A researched Shroud costs 100 energy")
	var ranged := {"attack_type": "ranged"}
	var melee := {"attack_type": "melee"}
	var hp: float = target.hp
	sim._apply_damage_to_target(attacker, target, 10.0, {}, 1.0, false, ranged)
	_check(target.hp == hp - 5.0, "Ranged weapon damage to ground units inside is halved")
	sim._apply_damage_to_target(attacker, target, 10.0, {}, 1.0, false, melee)
	sim._apply_damage_to_target(attacker, target, 10.0, {}, 1.0, true)
	_check(target.hp == hp - 25.0, "Melee and spell damage retain full strength")
	var air_hp: float = flyer.hp
	sim._apply_damage_to_target(attacker, flyer, 10.0, {}, 1.0, false, ranged)
	_check(flyer.hp == air_hp - 10.0, "Air units gain no protection")
	target.pos += Vector2(-12, 0)
	sim._apply_damage_to_target(attacker, target, 10.0, {}, 1.0, false, ranged)
	_check(target.hp == hp - 35.0, "Damage reduction ends immediately outside the cloud")
	sim.issue_command([attacker.tag], "hold_fire")
	sim.step_ticks(Rules.MICROBIAL_SHROUD_SECONDS * sim.TICK_RATE)
	_check(sim.microbial_shrouds.is_empty(), "The cloud expires after 11 seconds")

func _test_tether(pit: Dictionary) -> void:
	var caster: Dictionary = sim.spawn_unit("mireweaver", 1, Vector2(113, 42))
	var target: Dictionary = sim.spawn_unit("bastion_walker", 2, Vector2(128, 42))
	var immune: Dictionary = sim.spawn_unit("carapace_bulwark", 2, Vector2(127, 48))
	var mine: Dictionary = sim.spawn_unit("brood_keeper", 1, Vector2(106, 43))
	sim.issue_command([target.tag, immune.tag, mine.tag], "hold_fire")
	caster.energy = 200.0
	sim._refresh_vision()
	_check(not sim.issue_command([caster.tag], "neural_tether", target.pos, target.tag).ok, "Neural Tether requires research")
	_check(sim.issue_command([pit.tag], "research_neural_tether").ok
		and sim.players[1].crystal == 500 and sim.players[1].aether == 450, "The Pit researches Tether for 150/150")
	sim.step_ticks(ceili(Rules.NEURAL_TETHER_RESEARCH.time * sim.TICK_RATE))
	caster.energy = 200.0
	sim._refresh_vision()
	_check(not sim.issue_command([caster.tag], "neural_tether", immune.pos, immune.tag).ok
		and caster.energy == 200.0, "Frenzied targets are immune")
	var supply: float = sim.players[2].supply_used
	_check(sim.issue_command([caster.tag], "neural_tether", target.pos, target.tag).ok
		and target.owner == 1 and caster.is_immobile and caster.energy == 100.0 and sim.players[2].supply_used == supply,
		"The tether transfers control while retaining the original owner's supply accounting")
	sim.issue_command([target.tag], "hold_fire")
	sim.step_ticks(Rules.NEURAL_TETHER_SECONDS * sim.TICK_RATE)
	_check(target.owner == 2 and not caster.is_immobile and sim.neural_tethers.is_empty(), "The tether releases after 11 seconds")
	_check(sim.issue_command([caster.tag], "neural_tether", target.pos, target.tag).ok, "A second tether can acquire the same unit")
	target.pos = Vector2(162, 42)
	sim.step_ticks(1)
	_check(target.owner == 2 and sim.neural_tethers.is_empty(), "Moving beyond the leash breaks the tether")
	target.pos = Vector2(127, 42)
	caster.energy = 200.0
	_check(sim.issue_command([caster.tag], "burrow").ok, "The caster can burrow before acquiring a target")
	sim.step_ticks(sim.TICK_RATE * 2)
	_check(caster.burrowed and sim.issue_command([caster.tag], "neural_tether", target.pos, target.tag).ok,
		"The caster can tether while burrowed")
	sim._remove_destroyed_unit(caster)
	_check(target.owner == 2 and sim.neural_tethers.is_empty(), "Killing the caster releases control immediately")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
