extends SceneTree

var failures: Array[String] = []
var sim: Node

func _initialize() -> void:
	call_deferred("_run")

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		printerr(message)

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_detection()
	_test_fire_control()
	_test_duel()
	print("Defense and skirmish checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_detection() -> void:
	sim.load_scenario_dict({"fog_of_war": true, "paused": true, "map": {"width": 96, "height": 64}})
	var hub: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(16, 24))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(27, 24))
	var sentry: Dictionary = sim.spawn_unit("sentry_turret", 1, Vector2(31, 28), "", 0.1)
	var scout: Dictionary = sim.spawn_unit("skirmisher", 3, Vector2(42, 24))
	sim.issue_command([scout.tag, rifle.tag], "hold_fire")
	sim.vision.update(sim.units, sim.tick)
	check(sim.can_see_unit(1, scout), "The uncloaked scout is in sight")
	check(sim.issue_command([scout.tag], "phase_cloak").ok, "The Skirmisher can cloak")
	check(scout.energy == 50.0 and scout.cloaked, "Cloak spends the activation cost")
	check(not sim.can_see_unit(1, scout) and sim.can_see_unit(3, scout), "A foundation cannot detect cloak")
	check(not sim.issue_command([rifle.tag], "attack_target", scout.pos, scout.tag).ok, "Blind target orders are rejected")
	sentry.build_progress = 1.0
	sentry.hp = sentry.max_hp
	check(sim.can_see_unit(1, scout), "The completed Sentry detects cloak in sight")
	sim.step_ticks(48)
	check(scout.shields < scout.max_shields, "The stationary Sentry fires on the detected unit")
	sim._apply_damage_to_target(scout, sentry, 1000.0, {}, 1.0)
	check(not sim.can_see_unit(1, scout), "Destroyed detectors stop revealing cloak immediately")
	check(sim.issue_command([hub.tag], "recon_sweep", scout.pos).ok, "The player can sweep the area")
	check(sim.can_see_unit(1, scout), "A sweep reveals cloak")
	sim.step_ticks(640)
	check(scout.cloaked and not sim.can_see_unit(1, scout), "The scout hides again when the sweep expires")
	sim.step_ticks(115)
	check(not scout.cloaked and sim.can_see_unit(1, scout), "Cloak drops when energy runs out")

func _test_fire_control() -> void:
	sim.load_scenario_dict({"paused": true, "map": {"width": 96, "height": 64}})
	var gun: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(22, 24))
	var ally: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(25, 27))
	var foe: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(31, 24))
	sim.issue_command([gun.tag], "hold_fire")
	sim.step_ticks(64)
	check(foe.hp == foe.max_hp, "Hold Fire suppresses automatic fire")
	check(sim.issue_command([gun.tag], "attack_target", foe.pos, foe.tag).ok, "Hold Fire still accepts explicit attack orders")
	sim.step_ticks(64)
	check(foe.hp < foe.max_hp, "Explicit fire works while holding")
	check(not sim.issue_command([gun.tag], "attack_target", ally.pos, ally.tag).ok, "Normal attack cannot target an ally")
	check(sim.issue_command([gun.tag], "force_attack", ally.pos, ally.tag).ok, "Force Attack can target a friendly unit")
	sim.step_ticks(640)
	check(not sim.units.has(ally.tag) and sim.players[1].units_killed == 0, "Friendly fire deals damage without awarding enemy kills")

func _test_duel() -> void:
	check(sim.start_skirmish("iron-narrows", {"seed": 9}).ok, "Iron Narrows can start")
	var opening: Dictionary = sim.match_state.duplicate(true)
	check(opening.map_id == "iron-narrows" and opening.starts.size() == 2 and not sim.unlimited_resources, "Iron Narrows defaults to a finite duel")
	var crystal_before := 0
	for deposit in sim.resources.values():
		check(not sim.is_water_at(deposit.pos), "Deposits sit on traversable ground")
		if deposit.resource_type == "crystal_field":
			crystal_before += deposit.amount
			check(deposit.amount == 1500, "Finite crystal patches start at 1500")
		else:
			check(deposit.amount == 2250, "Finite vents start at 2250")
	for y in [24, 72]:
		var route: Array = sim.compute_smooth_path(Vector2(42, y), Vector2(85, y))
		check(not route.is_empty() and route.back() == Vector2(85, y) and not sim.is_water_at(Vector2(64, y)), "Both routes cross the river")
	sim.step_ticks(640)
	var crystal_after := 0
	for deposit in sim.resources.values():
		if deposit.resource_type == "crystal_field":
			crystal_after += deposit.amount
	check(crystal_after < crystal_before and sim.players[1].crystal_collected > 0 and sim.players[2].crystal_collected > 0, "Both sides mine finite deposits")
	sim.surrender(1)
	check(sim.rematch().ok, "The duel can rematch")
	check(sim.match_state.assigned_starts == opening.assigned_starts and not sim.unlimited_resources, "Rematch preserves the map, deposits and seats")
	check(sim.start_skirmish("iron-narrows", {"seed": 9, "unlimited_resources": true}).ok and sim.unlimited_resources, "The duel also supports unlimited deposits")
