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
		"ruleset": Rules.ID, "paused": true, "map": {"width": 180, "height": 145},
		"players": {"1": {"faction": "monsters", "crystal": 2600, "aether": 2600}, "2": {"faction": "humans"}},
	})
	var chamber: Dictionary = sim.spawn_unit("adaptation_chamber", 1, Vector2(25, 25))
	var nursery: Dictionary = sim.spawn_unit("spore_nursery", 1, Vector2(25, 40))
	var den: Dictionary = sim.spawn_unit("spine_den", 1, Vector2(25, 58))
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(25, 90))
	var bank: Dictionary = sim.players[1]
	_check(not sim.issue_command([nursery.tag], "research_brood_melee").ok, "Ladder ground upgrades require an Adaptation Chamber")
	_check(sim.issue_command([chamber.tag], "research_brood_missiles").ok
		and sim.issue_command([chamber.tag], "research_brood_carapace").ok
		and sim.issue_command([chamber.tag], "research_brood_melee").ok
		and bank.crystal == 2250 and bank.aether == 2250, "Three paid level-one upgrades queue at the correct costs")
	var time: int = ceili(Rules.BROOD_GROUND_UPGRADE_TIMES[0] * sim.TICK_RATE)
	sim.step_ticks(time - 1)
	_check(bank.upgrades.get("brood_missiles", 0) == 0 and chamber.production_queue[1].progress == 0.0,
		"The Chamber uses a single FIFO research lane")
	sim.step_ticks(1)
	_check(bank.upgrades.get("brood_missiles", 0) == 1 and not sim.issue_command([chamber.tag], "research_brood_missiles").ok,
		"Level two is gated by Lair tech")
	_check(not sim.issue_command([den.tag], "research_muscular_augments").ok, "Muscular Augments needs a Lair")
	nest["structure_form"] = "brood_lair"
	_check(sim.issue_command([den.tag], "research_grooved_spines").ok and sim.issue_command([den.tag], "research_muscular_augments").ok,
		"The Spine Den queues range and movement upgrades")
	_check(sim.research_offer(1, "brood_missiles").crystal == 150 and sim.issue_command([chamber.tag], "research_brood_missiles").ok,
		"The completed Lair unlocks 150/150 level-two missiles")
	sim.step_ticks(time * 2 + ceili(Rules.BROOD_GROUND_UPGRADE_TIMES[1] * sim.TICK_RATE))
	_check(bank.upgrades.get("brood_missiles", 0) == 2 and bank.upgrades.get("brood_melee", 0) == 1
		and bank.upgrades.get("brood_carapace", 0) == 1, "Each queued level advances only its research line")
	_check(not sim.issue_command([chamber.tag], "research_brood_missiles").ok, "Level three is gated by Hive tech")
	_check(not sim.issue_command([den.tag], "research_nanomuscular_swell").ok, "Nanomuscular Swell requires Hive tech")
	nest.structure_form = "brood_hive"
	_check(sim.research_offer(1, "brood_carapace").crystal == 200 and sim.research_offer(1, "brood_missiles").crystal == 200
		and sim.issue_command([chamber.tag], "research_brood_missiles").ok, "The Hive unlocks 200/200 level-three missiles")
	_test_weapon_and_armor()
	_test_lunge(den)
	print("Gnarl ground upgrades: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_weapon_and_armor() -> void:
	var hurler: Dictionary = sim.spawn_unit("blight_hurler", 1, Vector2(95, 55))
	var crawler: Dictionary = sim.spawn_unit("bile_crawler", 1, Vector2(97, 51))
	var ling: Dictionary = sim.spawn_unit("skitterling", 1, Vector2(91, 48))
	var worker: Dictionary = sim.spawn_unit("forager", 1, Vector2(90, 58))
	var sac: Dictionary = sim.spawn_unit("drift_sac", 1, Vector2(93, 58))
	var rifleman: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(100, 55))
	var fighter: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(103, 57))
	_check(sim.can_attack(hurler, fighter) and not sim.can_attack(crawler, fighter)
		and sim.weapon_range_against(hurler, fighter) == 15.0, "Grooved Spines extends the Hurler's air and ground range")
	_check(is_equal_approx(sim.effective_move_speed(hurler), Rules.HURLER_UPGRADED_SPEED)
		and not sim.issue_command([hurler.tag], "corrosive_miasma", rifleman.pos).ok,
		"Muscular Augments increases speed and the ladder Hurler uses its needle weapon")
	_check(sim._execute_weapon_hit(hurler, rifleman) and rifleman.hp == rifleman.max_hp - 14.0,
		"Two missile levels add two to the Hurler's needle volley")
	rifleman.hp = rifleman.max_hp
	_check(sim._execute_weapon_hit(crawler, rifleman) and rifleman.hp == rifleman.max_hp - 20.0,
		"Two missile levels add four to the Bile Crawler's acid spit")
	rifleman.hp = rifleman.max_hp
	_check(sim._execute_weapon_hit(ling, rifleman) and rifleman.hp == rifleman.max_hp - 6.0,
		"The Skitterling receives only its single melee level")
	_check(sim.unit_upgrade_level(worker, "armor") == 1 and sim.unit_upgrade_level(sac, "armor") == 0,
		"Ground carapace applies to Foragers and leaves air armor separate")

func _test_lunge(den: Dictionary) -> void:
	var hurler: Dictionary = sim.spawn_unit("blight_hurler", 1, Vector2(105, 92))
	var target := Vector2(125, 92)
	_check(not sim.issue_command([hurler.tag], "hurler_lunge", target).ok, "Lunge is locked before research")
	_check(sim.issue_command([den.tag], "research_nanomuscular_swell").ok, "The Spine Den researches Lunge after Hive tech")
	sim.step_ticks(ceili(Rules.NANOMUSCULAR_SWELL_RESEARCH.time * sim.TICK_RATE))
	var speed: float = sim.effective_move_speed(hurler)
	_check(sim.issue_command([hurler.tag], "hurler_lunge", target).ok and hurler.orders[0].target_pos == target
		and is_equal_approx(sim.effective_move_speed(hurler), speed * 2.0), "Lunge moves toward the point at double speed")
	var boost: int = ceili(Rules.HURLER_LUNGE_SECONDS * sim.TICK_RATE)
	sim.step_ticks(boost)
	_check(is_equal_approx(sim.effective_move_speed(hurler), speed) and not sim.issue_command([hurler.tag], "hurler_lunge", target).ok,
		"Double speed ends after 0.71 seconds and Lunge keeps recharging")
	sim.step_ticks(Rules.HURLER_LUNGE_COOLDOWN * sim.TICK_RATE - boost)
	_check(sim.issue_command([hurler.tag], "hurler_lunge", Vector2(110, 96)).ok, "Lunge is ready again after ten seconds")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
