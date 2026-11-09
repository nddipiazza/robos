extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_crystal()
	_test_rich_aether()
	_test_reassignment()
	_test_gas_transfer()
	_test_builder_under_fire()
	_test_shared_repair_budget()
	_test_default_rally()
	_test_map_roundtrip()
	print("Roadmap economy checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _test_crystal() -> void:
	sim.reset_state(42, 104, 64)
	sim.spawn_unit("colony_hub", 1, Vector2(18, 24))
	var patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(34, 24), 7, "gold", true)
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(29, 24))
	sim.step_ticks(1)
	_check(sim.is_build_tile_blocked(patch.pos, 1), "A live deposit blocks its build tile")
	sim.issue_command([worker.tag], "harvest", patch.pos, patch.tag)
	sim.step_ticks(480)
	_check(patch.amount == 0 and sim.players[1].crystal_collected == 7, "Rich crystal pays its entire seven-unit load")
	_check(not sim.deposit_present(patch) and not sim.is_build_tile_blocked(patch.pos, 1), "Depleted crystal frees the world footprint")
	_check(sim.compute_smooth_path(Vector2(29, 24), patch.pos).back() == patch.pos, "Movement can reach the former patch center")
	_check(sim.recent_income(1).crystal == 7, "Income counts deliveries rather than mining or the starting bank")
	sim.step_ticks(61 * 64)
	_check(sim.recent_income(1).crystal == 0, "Old deliveries expire from the income window")

func _test_rich_aether() -> void:
	for roster in [["colony_hub", "aether_tap", "pioneer"], ["brood_nest", "spore_tap", "forager"], ["heartstone", "aether_prism", "mote"]]:
		sim.reset_state(42, 104, 64)
		sim.spawn_unit(roster[0], 1, Vector2(18, 24))
		var vent: Dictionary = sim.spawn_resource("aether_vent", Vector2(34, 24), 6, "", true)
		var tap: Dictionary = sim.spawn_unit(roster[1], 1, vent.pos)
		var worker: Dictionary = sim.spawn_unit(roster[2], 1, Vector2(29, 24))
		sim.step_ticks(1)
		_check(sim.is_build_tile_blocked(vent.pos, 1, vent.pos), "An occupied vent remains blocked")
		sim.issue_command([worker.tag], "harvest", tap.pos, tap.tag)
		sim.step_ticks(480)
		_check(vent.amount == 0 and sim.recent_income(1).aether == 6, "%s extracts a rich six-unit load" % roster[1])
		_check(sim.deposit_present(vent), "An empty vent retains its physical footprint")

func _test_reassignment() -> void:
	sim.reset_state(42, 104, 64)
	var home: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(18, 24))
	var backup: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(63, 24))
	var old_patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(30, 24))
	var new_patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(76, 24))
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(26, 24))
	sim.issue_command([worker.tag], "harvest", old_patch.pos, old_patch.tag)
	sim.step_ticks(16)
	_check(worker.orders[0].dropoff_tag == home.tag, "Workers remember the local drop-off")
	var enemy: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(99, 60))
	sim._apply_damage_to_target(enemy, home, 10000.0, {}, 1.0)
	sim.step_ticks(1800)
	_check(worker.orders[0].target_tag == new_patch.tag and worker.orders[0].dropoff_tag == backup.tag, "Workers transfer to a surviving base and its mineral line")
	_check(sim.players[1].crystal_collected > 0, "Transferred workers resume paying income")

func _test_gas_transfer() -> void:
	sim.reset_state(42, 104, 64)
	sim.spawn_unit("colony_hub", 1, Vector2(18, 24))
	var vent: Dictionary = sim.spawn_resource("aether_vent", Vector2(42, 24))
	var site: Dictionary = sim.spawn_unit("aether_tap", 1, vent.pos, "", 0.4)
	var crystal: Dictionary = sim.spawn_resource("crystal_field", Vector2(33, 36))
	var workers: Array[int] = []
	for i in range(5):
		var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(31, 22 + i * 2))
		workers.append(worker.tag)
		sim.issue_command([worker.tag], "harvest", crystal.pos, crystal.tag)
	sim.step_ticks(1)
	var transfer: Dictionary = sim.issue_command(workers, "fill_gas", site.pos, site.tag)
	_check(transfer.accepted == 3, "Transfer fills just three available gas slots")
	_check(not sim.issue_command(workers, "fill_gas", site.pos, site.tag).ok, "A second transfer does not overassign")
	_check(sim.units[workers[3]].orders[0].target_tag == crystal.tag, "Unassigned workers keep their previous job")
	sim.step_ticks(180)
	_check(sim.units[workers[0]].orders[0].target_tag == site.tag and sim.players[1].aether_collected == 0, "Gas workers wait for the extractor")
	var initial_crystal: int = sim.players[1].crystal
	sim.issue_command([workers[3]], "resume_construction", site.pos, site.tag)
	_check(sim.construction_builder(site).get("tag") == workers[3], "The foundation identifies its replacement builder immediately")
	sim.issue_command([workers[3]], "stop")
	_check(sim.construction_builder(site).is_empty(), "Stopping a builder releases the foundation")
	sim.issue_command([workers[4]], "resume_construction", site.pos, site.tag)
	_check(sim.construction_builder(site).get("tag") == workers[4], "Another Pioneer can claim the released foundation")
	sim.step_ticks(1200)
	_check(site.build_progress >= 1.0 and sim.players[1].crystal >= initial_crystal, "Handoff completes construction without an extra fee")
	_check(sim.players[1].aether_collected > 0, "Waiting workers begin gathering after completion")

func _test_default_rally() -> void:
	sim.start_skirmish("iron-narrows", {"seed": 42})
	root.get_node("RTSCommanderAI").set_directive(2, "idle", false)
	var hall: Dictionary = sim.units.values().filter(func(u): return u.unit_type == "colony_hub" and u.owner == 1).front()
	var expected: Dictionary = sim.default_worker_deposit(hall)
	var start_tags: Array = sim.units.keys()
	_check(not expected.is_empty() and sim.issue_command([hall.tag], "train_pioneer").ok, "The default worker rally previews an actual deposit")
	sim.step_ticks(1200)
	var recruits: Array = sim.units.values().filter(func(u): return u.is_worker and u.owner == 1 and not start_tags.has(u.tag))
	_check(recruits.size() == 1 and recruits[0].harvest_target_tag == expected.get("tag"), "The trained Pioneer gathers from the previewed deposit")

func _test_builder_under_fire() -> void:
	sim.load_scenario_dict({
		"paused": true, "map": {"width": 104, "height": 64},
		"players": {"1": {"crystal": 250, "aether": 40}},
		"units": [
			{"type": "pioneer", "owner": 1, "x": 32, "y": 24, "hp": 3},
			{"type": "pioneer", "owner": 1, "x": 38, "y": 24},
			{"type": "rifleman", "owner": 2, "x": 22, "y": 24}
		]
	})
	var tags: Array = sim.units.keys()
	var location := Vector2(35, 24)
	var builder: Dictionary = sim.units[tags[0]]
	var replacement: Dictionary = sim.units[tags[1]]
	var raider: Dictionary = sim.units[tags[2]]
	_check(sim.issue_command([builder.tag], "build_silo", location).ok, "The first Pioneer receives the placement order")
	_check(sim.issue_command([replacement.tag], "build_silo", location).ok, "A second Pioneer can order the same still-empty site")
	sim.issue_command([raider.tag], "attack_target", builder.pos, builder.tag)
	sim.step_ticks(1)
	var foundations: Array = sim.units.values().filter(func(unit): return unit.unit_type == "silo")
	_check(foundations.size() == 1 and sim.players[1].crystal == 150, "Simultaneous placement charges exactly one foundation")
	if foundations.size() != 1:
		return
	var site: Dictionary = foundations.front()
	_check(sim.construction_builder(site).get("tag") == builder.tag, "The original Pioneer claims the foundation")
	sim.step_ticks(6)
	_check(not sim.units.has(builder.tag) and sim.construction_builder(site).is_empty(), "A weapon kill releases the unfinished foundation")
	var progress: float = site.build_progress
	sim.issue_command([raider.tag], "stop")
	sim.issue_command([raider.tag], "hold_fire")
	sim.step_ticks(8)
	_check(site.build_progress == progress, "Construction waits while the dead builder is unassigned")
	_check(sim.issue_command([replacement.tag], "resume_construction", location, site.tag).ok, "The surviving Pioneer claims the same foundation")
	sim.step_ticks(1600)
	_check(site.build_progress == 1.0 and sim.players[1].structures_built == 1, "The replacement finishes the original structure once")
	_check(sim.players[1].crystal == 150 and sim.players[1].aether == 40, "Taking over the foundation costs nothing extra")

func _test_shared_repair_budget() -> void:
	sim.reset_state(42, 104, 64)
	sim.players[1].crystal = 2
	var tank: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(50, 30))
	tank.hp = 60.0
	var repairers: Array[int] = []
	for i in range(3):
		var worker: Dictionary = sim.spawn_unit("pioneer", 1, tank.pos + Vector2.from_angle(TAU * i / 3.0) * 3.0)
		repairers.append(worker.tag)
	_check(sim.issue_command(repairers, "repair", tank.pos, tank.tag).accepted == 3, "All three Pioneers receive the repair order")
	sim.step_ticks(8)
	_check(tank.hp > 63.0, "Multiple Pioneers repair concurrently")
	sim.step_ticks(160)
	var affordable_hp: float = 2.0 * tank.max_hp / (150.0 * 0.25)
	_check(sim.players[1].crystal == 0 and is_equal_approx(tank.hp, 60.0 + affordable_hp), "Concurrent repair spends only the shared balance and restores exactly what it paid for")
	var hp: float = tank.hp
	sim.step_ticks(120)
	_check(tank.hp == hp and sim.players[1].crystal == 0, "Repair pauses at zero crystal without free healing or debt")

func _test_map_roundtrip() -> void:
	var model = load("res://scripts/editor/RTSMapDocument.gd")
	var document = model.new()
	document.add_resource("crystal_field", Vector2(20, 24), 900, true)
	document.add_resource("aether_vent", Vector2(32, 24), 1100, true)
	var copy = model.new()
	copy.load_scenario(document.to_scenario())
	_check(copy.data.resources.size() == 2 and copy.data.resources.all(func(r): return r.rich), "Authored rich deposit flags survive map round-tripping")
