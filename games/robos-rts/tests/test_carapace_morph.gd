extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	sim.load_scenario_dict({"paused": true, "map": {"width": 104, "height": 64}, "units": [
		{"type": "brood_nest", "owner": 1, "x": 14, "y": 24},
		{"type": "bile_crawler", "owner": 1, "x": 36, "y": 25, "hp": 72.5},
		{"type": "skitterling", "owner": 1, "x": 11, "y": 43, "count": 13},
		{"type": "silo", "owner": 2, "x": 54, "y": 25},
		{"type": "rampart_transport", "owner": 2, "x": 55, "y": 30}
	]})
	var units: Array = sim.units.values()
	var crawler: Dictionary = units[1]
	var target: Dictionary = units[units.size() - 2]
	var aircraft: Dictionary = units.back()
	var player: Dictionary = sim.players[1]
	_check(not sim.issue_command([crawler.tag], "morph_carapace").ok, "Unresearched tech blocks the evolution")
	sim.spawn_unit("blight_spire", 1, Vector2(23, 17))
	_check(player.supply_used == 15 and not sim.issue_command([crawler.tag], "morph_carapace").ok, "Evolution reserves one additional supply")
	sim.spawn_unit("brood_pod", 1, Vector2(24, 31))
	_check(sim.can_attack(crawler, aircraft), "Original Bile Crawler retains its anti-air role")
	_check(sim.issue_command([crawler.tag], "morph_carapace").ok and player.crystal == 325 and player.aether == 100 and player.supply_used == 16, "Morph pays once and reserves supply")
	_check(not sim.issue_command([crawler.tag], "morph_carapace").ok, "An evolving unit cannot double-pay")
	_check(sim.issue_command([crawler.tag], "cancel_carapace_morph").ok and player.crystal == 400 and player.aether == 150 and player.supply_used == 15, "Cancel returns the exact reservation")
	_check(sim.issue_command([crawler.tag], "morph_carapace").ok, "A canceled Crawler can restart the morph")
	var original: Vector2 = crawler.pos
	var tag: int = crawler.tag
	_check(sim.issue_command([tag], "move", Vector2(43, 25), 0, "", true).ok, "A post-morph move can be queued")
	sim.step_ticks(sim.CARAPACE_MORPH_TICKS - 1)
	_check(crawler.unit_type == "bile_crawler" and crawler.pos == original, "Morphing remains stationary until the final tick")
	sim.step_ticks(1)
	_check(crawler.unit_type == "carapace_bulwark" and crawler.tag == tag and sim.units.has(tag), "The same unit completes the evolution")
	_check(crawler.hp == 117.5 and crawler.max_hp == 235.0 and crawler.armor == 2.0 and player.supply_used == 16, "Health percentage and final supply are consistent")
	_check(not sim.can_attack(crawler, aircraft) and sim.can_attack(crawler, target), "The evolved role gives up air coverage for ground combat")
	sim.step_ticks(160)
	_check(crawler.pos.x > original.x + 3.0, "The queued movement resumes after the morph")
	_check(sim.issue_command([tag], "attack_target", target.pos, target.tag).ok, "The evolved unit closes on an armored target")
	sim.step_ticks(240)
	_check(target.hp <= target.max_hp - 30.0, "Heavy melee takes effect through the normal attack path")
	print("Carapace morph: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
