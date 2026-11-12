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
	sim.start_online_match("frontier-hunters", 3, ["monsters", "humans"], true)
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	var data := root.get_node("RTSData")
	var nest: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "brood_nest").front()
	var bank: Dictionary = sim.players[1]
	bank.crystal = 1200
	bank.aether = 1200
	_check(not sim.issue_command([nest.tag], "evolve_brood_lair").ok, "The Lair requires a Hatchling Pool")
	_check(not sim.issue_command([nest.tag], "evolve_brood_hive").ok, "The Hive requires a Lair")
	_check(not sim.issue_command([nest.tag], "train_blight_hurler").ok, "A Blight Hurler requires a Spine Den")
	var warren: Dictionary = sim.spawn_unit("bile_warren", 1, nest.pos + Vector2(12, 12))
	_check(not sim.issue_command([warren.tag], "research_tunneling_claws").ok, "Tunneling Claws requires a completed Lair")
	sim.spawn_unit("hatchling_pool", 1, nest.pos + Vector2(-13, 12))
	_check(sim.issue_command([nest.tag], "evolve_brood_lair").ok and bank.crystal == 1050 and bank.aether == 1100,
		"The Lair evolution costs 150/100")
	_check(not sim.issue_command([nest.tag], "evolve_brood_lair").ok, "One Nest cannot queue two evolutions")
	_check(sim.issue_command([nest.tag], "cancel_training", Vector2.ZERO, 0, "0").ok
		and bank.crystal == 1162 and bank.aether == 1175, "Canceling a structure evolution refunds 75 percent")
	_check(sim.issue_command([nest.tag], "evolve_brood_lair").ok
		and sim.issue_command([nest.tag], "research_burrow").ok
		and sim.issue_command([nest.tag], "train_forager").ok, "Evolution, research and larva morph can be queued together")
	var lair_ticks: int = ceili(float(data.get_unit_def("brood_lair").build_time) * sim.TICK_RATE)
	var supply: float = bank.supply_cap
	sim.step_ticks(lair_ticks - 1)
	_check(not sim.has_tech_structure(1, "brood_lair") and nest.max_hp == 1500.0, "The Lair grants tech and health only at completion")
	_check(nest.production_queue.size() == 2 and nest.production_queue[1].progress == 0.0,
		"An independent larva hatched while Burrow waited for the Nest lane")
	sim.step_ticks(1)
	_check(sim.has_tech_structure(1, "brood_lair") and nest.max_hp == 2000.0 and nest.name == "Brood Lair",
		"The Lair has 2000 max HP and unlocks advanced tech at completion")
	_check(sim.is_dropoff(nest, 1) and bank.supply_cap == supply and nest.brood_slots == 3,
		"The same town hall retains its supply, larva production and drop-off")
	_check(not sim.issue_command([nest.tag], "evolve_brood_hive").ok, "The Hive also needs an Infestation Pit")
	var pit: Dictionary = sim.spawn_unit("infestation_pit", 1, nest.pos + Vector2(-12, -8), "", 0.5)
	_check(not sim.issue_command([nest.tag], "evolve_brood_hive").ok, "An unfinished Infestation Pit does not unlock the Hive")
	pit.build_progress = 1.0
	var crystal: int = bank.crystal
	var aether: int = bank.aether
	_check(sim.issue_command([nest.tag], "evolve_brood_hive").ok and bank.crystal == crystal - 200 and bank.aether == aether - 150,
		"The Hive evolution costs 200/150")
	var hive_ticks: int = ceili(float(data.get_unit_def("brood_hive").build_time) * sim.TICK_RATE)
	var burrow_ticks: int = ceili(float(sim.research_offer(1, "burrow").time) * sim.TICK_RATE)
	sim.step_ticks(burrow_ticks + hive_ticks - 1)
	_check(not sim.has_tech_structure(1, "brood_hive") and bank.upgrades.get("burrow", 0) == 1,
		"The Hive waits for research and then uses its full duration")
	sim.step_ticks(1)
	_check(sim.has_tech_structure(1, "brood_hive") and sim.has_tech_structure(1, "brood_lair") and nest.max_hp == 2500.0,
		"The Hive grants both tech aliases and 2500 max HP")
	sim.spawn_unit("spine_den", 1, nest.pos + Vector2(-12, -15))
	sim.spawn_unit("drift_sac", 1, nest.pos + Vector2(-3, 8))
	_check(sim.issue_command([nest.tag], "train_blight_hurler").ok, "The completed Spine Den unlocks larva morphs into Blight Hurlers")
	_test_crawler_upgrades(warren)
	print("Gnarl Nest evolution: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_crawler_upgrades(warren: Dictionary) -> void:
	var bank: Dictionary = sim.players[1]
	bank.crystal = 500
	bank.aether = 500
	var crawler: Dictionary = sim.spawn_unit("bile_crawler", 1, Vector2(120, 125))
	_check(sim.issue_command([warren.tag], "research_tunneling_claws").ok
		and sim.issue_command([warren.tag], "research_glial_reconstitution").ok
		and bank.crystal == 300 and bank.aether == 300, "The Warren queues both paid upgrades")
	if not sim.issue_command([crawler.tag], "burrow").ok:
		failures.append("The crawler descends before research completes")
		return
	sim.step_ticks(crawler.burrow_transition.finish - sim.tick)
	_check(crawler.is_immobile, "Burrow alone does not allow movement")
	var upgrade_ticks: int = ceili(Rules.BILE_WARREN_RESEARCH.time * sim.TICK_RATE)
	var elapsed: int = roundi(warren.production_queue[0].progress * sim.TICK_RATE)
	sim.step_ticks(upgrade_ticks - elapsed - 1)
	_check(crawler.is_immobile, "The crawler waits for the full Tunneling Claws research")
	sim.step_ticks(1)
	_check(crawler.get("burrow_mobile", false) and not crawler.is_immobile
		and is_equal_approx(sim.effective_move_speed(crawler), Rules.BILE_CRAWLER_TUNNEL_SPEED),
		"Tunneling Claws updates an already buried crawler at the reference speed")
	var destination := Vector2(111, 125)
	_check(sim.issue_command([crawler.tag], "move", destination).ok, "The buried crawler accepts movement")
	_check(not sim.issue_command([crawler.tag], "attack_move", destination).ok, "The buried crawler cannot attack")
	sim.step_ticks(2 * sim.TICK_RATE)
	_check(crawler.pos.distance_to(destination) < 3.0 and crawler.burrowed,
		"The crawler moves while remaining underground (position %s, target %s)" % [crawler.pos, destination])
	sim.step_ticks(upgrade_ticks - 2 * sim.TICK_RATE)
	_check(is_equal_approx(sim.effective_move_speed(crawler), Rules.BILE_CRAWLER_GLIAL_TUNNEL_SPEED),
		"Glial Reconstitution speeds up the tunneled crawler after the next research completes")
	if sim.issue_command([crawler.tag], "surface").ok:
		sim.step_ticks(crawler.burrow_transition.finish - sim.tick)
	_check(not crawler.burrowed and is_equal_approx(sim.effective_move_speed(crawler), Rules.BILE_CRAWLER_GLIAL_SPEED),
		"Glial Reconstitution also increases speed on the surface")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
