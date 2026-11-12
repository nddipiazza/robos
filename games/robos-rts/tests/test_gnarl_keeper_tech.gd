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
		"players": {"1": {"faction": "monsters", "crystal": 900, "aether": 900}, "2": {"faction": "humans"}},
	})
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(30, 50))
	_test_growth_and_heal(nest)
	_test_upgrades(nest)
	print("Gnarl Keeper tech: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_growth_and_heal(nest: Dictionary) -> void:
	var keeper: Dictionary = sim.spawn_unit("brood_keeper", 1, Vector2(37, 50))
	var scout: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(49, 63))
	sim.issue_command([scout.tag], "hold_fire")
	keeper.energy_profile = keeper.energy_profile.duplicate()
	keeper.energy_profile.regen = 0.0
	var site := Vector2(41, 50)
	sim._refresh_vision()
	_check(not sim.issue_command([keeper.tag], "seed_growth_node", site).ok and keeper.energy == 25.0,
		"A Keeper cannot seed outside living ground")
	sim.step_ticks(3 * Rules.CREEP_SPREAD_TICKS)
	_check(sim.issue_command([keeper.tag], "seed_growth_node", site).ok and keeper.energy == 0.0,
		"The Keeper seeds a visible Tumor for 25 energy after creep reaches the site")
	var nodes: Array = sim.units.values().filter(func(unit): return unit.unit_type == "brood_growth_node")
	if nodes.is_empty():
		return
	var node: Dictionary = nodes[0]
	_check(not node.get("burrowed", false) and not sim.issue_command([node.tag], "cancel_construction").ok,
		"The growing Tumor is visible and committed")
	var duration: int = ceili(Rules.TUMOR_BUILD_SECONDS * sim.TICK_RATE)
	sim.step_ticks(duration)
	_check(node.build_progress == 1.0 and node.burrowed and not sim.can_see_unit(2, node),
		"The completed Tumor hides from enemies without detection")
	_check(not sim.issue_command([node.tag], "spread_growth_node", Vector2(54, 50)).ok,
		"The completed Tumor has a separate arming timer")
	sim.step_ticks(duration)
	_check(sim.issue_command([node.tag], "spread_growth_node", Vector2(54, 50)).ok
		and not sim.issue_command([node.tag], "spread_growth_node", Vector2(50, 56)).ok,
		"A ready Tumor can seed exactly one daughter")
	_check(sim.units.values().any(func(unit): return unit.get("growth_node_parent", 0) == node.tag),
		"The daughter retains the parent identity for control-group inheritance")
	keeper.energy = 50.0
	nest.hp_regen = 0.0
	nest.hp -= 150.0
	var before: float = nest.hp
	_check(sim.issue_command([keeper.tag], "transfuse_brood", nest.pos, nest.tag).ok
		and nest.hp == before + 75.0 and keeper.energy == 0.0, "Transfuse spends 50 energy and heals 75 HP immediately")
	sim.step_ticks(Rules.TRANSFUSE_SECONDS * sim.TICK_RATE)
	_check(is_equal_approx(nest.hp, before + 125.0), "Transfuse restores another 50 HP across seven seconds")
	keeper.energy = 50.0
	keeper.pos = Vector2(130, 90)
	_check(not sim.transfuse_block_reason(keeper).is_empty(), "A Keeper off living ground cannot Transfuse")

func _test_upgrades(nest: Dictionary) -> void:
	var pool: Dictionary = sim.spawn_unit("hatchling_pool", 1, Vector2(28, 65))
	var nursery: Dictionary = sim.spawn_unit("spore_nursery", 1, Vector2(30, 78))
	var ling: Dictionary = sim.spawn_unit("skitterling", 1, Vector2(123, 97))
	var burst: Dictionary = sim.spawn_unit("sporeburst", 1, Vector2(121, 92))
	_check(not sim.issue_command([pool.tag], "research_adrenal_glands").ok
		and not sim.issue_command([nursery.tag], "research_rolling_spores").ok, "Adrenal requires Hive and Rolling Spores requires Lair")
	nest["structure_form"] = "brood_lair"
	_check(sim.issue_command([nursery.tag], "research_rolling_spores").ok and sim.issue_command([pool.tag], "research_metabolic_boost").ok,
		"Lair tech enables paid Rolling Spores and the Pool researches Metabolic Boost")
	nest.structure_form = "brood_hive"
	_check(sim.issue_command([pool.tag], "research_adrenal_glands").ok, "Adrenal queues behind Metabolic Boost once Hive tech is complete")
	sim.step_ticks(ceili(Rules.METABOLIC_BOOST_RESEARCH.time * sim.TICK_RATE) + ceili(Rules.ADRENAL_GLANDS_RESEARCH.time * sim.TICK_RATE))
	_check(is_equal_approx(sim.effective_move_speed(ling), 6.58 * 2.5) and sim._attack_speed_multiplier(ling) == 1.4,
		"The Skitterling speed and attack upgrades affect live units")
	_check(burst.max_hp == 35.0 and is_equal_approx(burst.speed, 4.13 * 2.5)
		and sim.spawn_unit("sporeburst", 1, Vector2(118, 92)).max_hp == 35.0,
		"Rolling Spores changes existing and newly spawned Sporebursts")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
