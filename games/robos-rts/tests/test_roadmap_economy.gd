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

func _test_map_roundtrip() -> void:
	var model = load("res://scripts/editor/RTSMapDocument.gd")
	var document = model.new()
	document.add_resource("crystal_field", Vector2(20, 24), 900, true)
	document.add_resource("aether_vent", Vector2(32, 24), 1100, true)
	var copy = model.new()
	copy.load_scenario(document.to_scenario())
	_check(copy.data.resources.size() == 2 and copy.data.resources.all(func(r): return r.rich), "Authored rich deposit flags survive map round-tripping")
