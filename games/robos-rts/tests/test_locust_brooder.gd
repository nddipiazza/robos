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
	var nest: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "brood_nest").front()
	var bank: Dictionary = sim.players[1]
	bank.crystal = 500
	bank.aether = 500
	_check(not sim.issue_command([nest.tag], "train_locust_brooder").ok, "The Infestation Pit is required")
	sim.spawn_unit("infestation_pit", 1, nest.pos + Vector2(-12, 7))
	sim.spawn_unit("drift_sac", 1, nest.pos + Vector2(-7, 4))
	var larva: Dictionary = sim.units[nest.brood_larvae.front()]
	var supply: float = bank.supply_used
	_check(sim.issue_command([larva.tag], "train_locust_brooder").ok and larva.unit_type == "brood_egg"
		and bank.crystal == 400 and bank.aether == 425 and bank.supply_used == supply + 3,
		"The larva becomes a paid 100/75 egg reserving three supply")
	sim.step_ticks(ceili(40.0 / 1.4 * sim.TICK_RATE))
	var brooders: Array = sim.units.values().filter(func(unit): return unit.unit_type == "locust_brooder")
	_check(brooders.size() == 1 and brooders[0].hp == 160.0, "A 160 HP Brooder hatches after 28.57 seconds")
	_test_summons()
	print("Locust Brooder: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_summons() -> void:
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 170, "height": 140},
		"players": {"1": {"faction": "monsters"}, "2": {"faction": "humans"}},
	})
	var brooder: Dictionary = sim.spawn_unit("locust_brooder", 1, Vector2(40, 50))
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(71, 50))
	sim.issue_command([enemy.tag], "hold_fire")
	sim.players[1].upgrades.burrow = 1
	sim.players[1].upgrades.brood_carapace = 1
	sim.players[1].upgrades.brood_missiles = 1
	_check(sim.issue_command([brooder.tag], "burrow").ok, "A Brooder can research and use shared Burrow")
	sim.step_ticks(2 * sim.TICK_RATE)
	var born: int = sim.tick
	var supply: float = sim.players[1].supply_used
	_check(brooder.burrowed and sim.issue_command([brooder.tag], "launch_locusts", enemy.pos).ok
		and sim.players[1].supply_used == supply, "A buried Brooder can launch two zero-supply locusts")
	var summons: Array = sim.units.values().filter(func(unit): return unit.unit_type == "locust_flying")
	_check(summons.size() == 2 and summons.all(func(unit): return unit.hp == 50.0 and unit.expires_tick == born + 18 * sim.TICK_RATE),
		"Both Flying Locusts have 50 HP and a fixed 18-second lifetime")
	if summons.size() != 2:
		return
	var locust: Dictionary = summons[0]
	var partner: Dictionary = summons[1]
	_check(sim.unit_upgrade_level(locust, "armor") == 1 and not sim.can_attack(locust, enemy), "Flying Locusts have ground carapace and no weapon")
	_check(not sim.issue_command([locust.tag], "locust_swoop", enemy.pos).ok, "Manual Swoop rejects a distant point")
	_check(sim.issue_command([locust.tag], "auto_locust_swoop").ok, "Automatic Swoop can be turned off")
	sim.step_ticks(sim.TICK_RATE * 7)
	_check(locust.unit_type == "locust_flying" and partner.unit_type == "locust_landed",
		"Only the Locust with automatic Swoop enabled lands near the destination")
	var landing: Vector2 = locust.pos + Vector2(0, 4)
	_check(sim.issue_command([locust.tag], "locust_swoop", landing).ok and locust.has("locust_descent"),
		"Manual Swoop begins a visible descent to nearby clear ground")
	sim.step_ticks(ceili(Rules.LOCUST_SWOOP_SECONDS * sim.TICK_RATE))
	_check(locust.unit_type == "locust_landed" and locust.flight_height == 0.0
		and sim.unit_upgrade_level(locust, "weapons") == 1 and locust.expires_tick == born + 18 * sim.TICK_RATE,
		"Landing activates the ground weapon and preserves the lifetime")
	sim.step_ticks(born + 18 * sim.TICK_RATE - sim.tick)
	_check(not sim.units.has(locust.tag) and not sim.units.has(partner.tag), "Both Locusts expire on schedule")
	_check(not sim.issue_command([brooder.tag], "launch_locusts", enemy.pos).ok, "The 43-second launch cooldown is enforced")
	sim.step_ticks(born + 43 * sim.TICK_RATE - sim.tick)
	_check(sim.issue_command([brooder.tag], "launch_locusts", enemy.pos).ok, "The next launch is available at 43 seconds")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
