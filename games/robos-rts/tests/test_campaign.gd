extends SceneTree

var failures: Array = []
var checks := 0
var sim: Node

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)

func count_units(owner: int, kind: String = "") -> int:
	var count = 0
	for u in sim.units.values():
		if u.owner == owner and (kind == "" or u.unit_type == kind):
			count += 1
	return count

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.load_scenario_file("campaign-first-strike")
	check(sim.match_state.status == "briefing" and sim.paused, "Mission must open paused on briefing")
	sim.step_ticks(128)
	check(sim.tick == 0, "Briefing must not advance the simulation")
	check(count_units(1, "pioneer") == 12 and count_units(1, "rifleman") == 0, "Start with workers and no free army")
	check(sim.players[1].crystal == 150 and sim.players[1].aether == 0, "Starting economy")
	check(sim.players[1].supply_used == 12 and sim.players[1].supply_cap == 15, "Initial supply")
	check(sim.start_campaign().ok, "Mission starts")
	check(not sim.start_campaign().ok, "Cannot start twice")
	sim.step_ticks(64 * 30)
	check(count_units(2) == 33, "Garrison must not grow or attack during buildup")
	for u in sim.units.values():
		if u.owner == 2:
			check(u.pos.x >= 105, "Defender left its territory during buildup")
	check(sim.players[1].crystal_collected > 100, "Starting workers must gather real resources")
	check(sim.restart_campaign().ok and sim.tick == 0 and sim.match_state.status == "briefing", "Restart resets mission")
	# Explicit combat-only balance fixtures. Paid build-order proof is separate.
	var outcomes: Array = []
	for size in [28, 36, 40]:
		sim.load_scenario_file("campaign-first-strike")
		sim.start_campaign()
		var tags: Array[int] = []
		for i in range(size):
			var rifle = sim.spawn_unit("rifleman", 1, Vector2(53 + (i % 7) * 2.2, 47 + (i / 7) * 2.2))
			tags.append(rifle.tag)
		sim.issue_command(tags, "attack_move", Vector2(132, 56))
		for second in range(180):
			sim.step_ticks(64)
			if sim.match_state.status == "finished" or count_units(1, "rifleman") == 0:
				break
		var result = {"army": size, "survivors": count_units(1, "rifleman"), "enemies": count_units(2), "seconds": sim.sim_time, "winner": sim.match_state.winner}
		outcomes.append(result)
		if not "--probe" in OS.get_cmdline_user_args():
			if size < 40:
				check(result.survivors == 0 and result.enemies >= 3, "%d Riflemen must lose a straight assault" % size)
			else:
				check(result.winner == 1 and result.enemies == 0, "40 Riflemen must clear the stronghold")
				check(result.survivors >= 3 and result.survivors <= 22, "40 supply should win with meaningful losses")
				check(result.seconds >= 20 and result.seconds <= 150, "Assault duration threshold")
				check(sim.match_state.results.sides["1"].started == 53, "Results must include the 40 produced units")
	# The nest alone is insufficient; losing soldiers alone is recoverable.
	sim.load_scenario_file("campaign-first-strike")
	sim.start_campaign()
	for u in sim.units.values().duplicate():
		if u.owner == 2 and u.is_structure:
			sim.units.erase(u.tag)
	sim._check_match_result()
	check(sim.match_state.status == "playing", "Nest sniping must not skip the defenders")
	for u in sim.units.values().duplicate():
		if u.owner == 1 and u.is_structure:
			sim.units.erase(u.tag)
	sim._check_match_result()
	check(sim.match_state.winner == 2 and sim.match_state.reason == "base_destroyed", "Losing the base fails the mission")
	sim.restart_campaign()
	check(sim.battle_stats.records.is_empty() and not sim.match_state.has("results"), "Restart clears results")
	print(JSON.stringify({"suite": "campaign", "probe_only": "--probe" in OS.get_cmdline_user_args(), "checks": checks, "outcomes": outcomes, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
