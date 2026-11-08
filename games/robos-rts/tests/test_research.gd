extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		printerr(message)

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.reset_state(42, 96, 64)
	sim.players[1].crystal = 2000
	sim.players[1].aether = 2000
	var lab: Dictionary = sim.spawn_unit("workshop", 1, Vector2(12, 20))
	var other_lab: Dictionary = sim.spawn_unit("workshop", 1, Vector2(12, 32))
	var friendly: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(22, 20))
	var opponent: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(80, 45))
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.issue_command([friendly.tag, opponent.tag], "hold_position")
	var supply: int = sim.players[1].supply_used
	check(sim.issue_command([lab.tag], "research_weapons").ok, "The first weapons level should queue")
	check(not sim.issue_command([other_lab.tag], "research_weapons").ok, "The same level cannot queue at a second Workshop")
	check(sim.issue_command([lab.tag], "research_armor").ok, "Armor can queue behind weapons")
	check(sim.players[1].supply_used == supply, "Research uses no supply")
	check(sim.issue_command([lab.tag], "cancel_training", Vector2.ZERO, 0, "1").ok, "A queued upgrade can be cancelled")
	check(sim.players[1].crystal == 1900 and sim.players[1].aether == 1900, "A cancelled upgrade refunds both resources")
	check(sim.unit_upgrade_level(friendly, "weapons") == 0, "Payment does not apply the upgrade early")
	sim.step_ticks(640)
	check(sim.unit_upgrade_level(friendly, "weapons") == 1, "Existing combat units gain the completed weapons level")
	check(sim.issue_command([lab.tag], "research_armor").ok, "Cancelled research can be started again")
	sim.step_ticks(640)
	check(sim.unit_upgrade_level(friendly, "armor") == 1, "Armor applies after research completes")
	var previous: float = opponent.hp
	sim._execute_weapon_hit(friendly, opponent)
	check(is_equal_approx(previous - opponent.hp, 7.0), "A researched Rifleman should deal 7 damage, got %f (initial HP %f)" % [previous - opponent.hp, previous])
	previous = friendly.hp
	sim._execute_weapon_hit(opponent, friendly)
	check(is_equal_approx(previous - friendly.hp, 5.0), "A researched Rifleman should receive 5 damage, got %f (initial HP %f)" % [previous - friendly.hp, previous])
	var newcomer: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(24, 30))
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(26, 30))
	check(sim.unit_upgrade_level(newcomer, "weapons") == 1, "Reinforcements inherit finished upgrades")
	check(sim.unit_upgrade_level(worker, "weapons") == 0, "Worker weapons are outside the combat upgrade")
	for level in [2, 3]:
		check(sim.issue_command([lab.tag], "research_weapons").ok, "The next weapons level should queue")
		sim.step_ticks(1120)
		check(sim.unit_upgrade_level(friendly, "weapons") == level, "Weapons must advance one level at a time")
	check(not sim.issue_command([lab.tag], "research_weapons").ok, "Research stops at level three")
	sim.reset_state()
	check(sim.players[1].upgrades.weapons == 0 and sim.players[1].upgrades.armor == 0, "A new game starts without upgrades")
	print("Research checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
