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
	var route = sim.compute_smooth_path(Vector2(38,58),Vector2(132,56))
	var route_length := 0.0
	var previous := Vector2(38,58)
	for point in route:
		route_length += previous.distance_to(point)
		previous = point
	check(route.size()>=6 and route_length>120 and previous.distance_to(Vector2(132,56))<2,"Three offset passes require a reachable winding route: length %s, points %s" % [route_length,route])
	check(count_units(2) == 46, "Garrison must not grow or attack during buildup")
	for u in sim.units.values():
		if u.owner == 2:
			check(u.is_structure or u.pos.distance_to(u.guard_center) <= u.guard_radius, "Defender left its encounter during buildup")
	check(sim.players[1].crystal_collected > 100, "Starting workers must gather real resources")
	check(sim.restart_campaign().ok and sim.tick == 0 and sim.match_state.status == "briefing", "Restart resets mission")
	# Explicit combat fixtures: settled rally groups match normal production; also check a spread 40-unit formation.
	# The full paid build-order proof is separate.
	var outcomes: Array = []
	for case in [{"army":28,"rallied":true},{"army":36,"rallied":true},{"army":40,"rallied":true},{"army":40}]:
		var size: int = case.army
		var rally_fixture: bool = case.get("rallied",false)
		sim.load_scenario_file("campaign-first-strike")
		sim.start_campaign()
		var tags: Array[int] = []
		for i in range(size):
			var rifle = sim.spawn_unit("rifleman", 1, Vector2(38,58) if rally_fixture else Vector2(39 + (i % 7) * 2.2, 49 + (i / 7) * 2.2))
			tags.append(rifle.tag)
		if rally_fixture: sim.step_ticks(30*64)
		sim.issue_command(tags, "attack_move", Vector2(132, 56))
		var cleared_posts: Array = []
		for second in range(300):
			sim.step_ticks(64)
			for post in ["Western sentries","Northern ambush"]:
				if not cleared_posts.has(post) and not sim.units.values().any(func(u): return u.get("encounter", "")==post):
					cleared_posts.append(post)
			if sim.match_state.status == "finished" or count_units(1, "rifleman") == 0:
				break
		var result = {"rallied":rally_fixture,"army": size, "survivors": count_units(1, "rifleman"), "enemies": count_units(2), "seconds": sim.sim_time, "winner": sim.match_state.winner}
		outcomes.append(result)
		if not "--probe" in OS.get_cmdline_user_args():
			if size == 28:
				check(result.survivors == 0 and result.enemies >= 3, "%d Riflemen must lose a straight assault" % size)
			else:
				check(cleared_posts==["Western sentries","Northern ambush"],"An assembled army clears both mini fights in route order")
				check(result.winner == 1 and result.enemies == 0, "An assembled 36–40 Rifleman army must clear the stronghold")
				check(result.survivors >= 1 and result.survivors <= 24, "A roughly 40-supply army should win with meaningful losses")
				check(result.seconds >= 20 and result.seconds <= 150, "Assault duration threshold")
				check(sim.match_state.results.sides["1"].started == 13+size, "Results must include every deployed unit")
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
	if not "--probe" in OS.get_cmdline_user_args():
		_test_paid_gas_units()
	print(JSON.stringify({"suite": "campaign", "probe_only": "--probe" in OS.get_cmdline_user_args(), "checks": checks, "outcomes": outcomes, "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _test_paid_gas_units() -> void:
	sim.load_scenario_file("campaign-first-strike")
	sim.start_campaign()
	var workers: Array = []
	var vent: Dictionary = {}
	for u in sim.units.values():
		if u.owner == 1 and u.is_worker: workers.append(u.tag)
	for r in sim.resources.values():
		if r.resource_type == "aether_vent": vent = r
	check(not vent.is_empty() and vent.pos.distance_to(Vector2(28,56)) < 26,"Campaign has a usable base gas vent")
	if vent.is_empty(): return
	var builder: int = workers.back()
	sim.issue_command([builder],"stop")
	check(sim.issue_command([builder],"build_aether_tap",vent.pos).accepted == 1,"Campaign worker accepts paid Tap construction")
	sim.step_ticks(40*64)
	var tap := _owned_structure("aether_tap")
	check(not tap.is_empty() and tap.build_progress >= 1,"Campaign Tap completes at real build time")
	if tap.is_empty(): return
	for tag in workers.slice(0,3):
		sim.issue_command([tag],"harvest",vent.pos,tap.tag)
	sim.step_ticks(40*64)
	check(sim.players[1].aether_collected >= 25,"Three workers deliver gas from the campaign vent")
	sim.issue_command([builder],"build_silo",Vector2(40,48))
	sim.step_ticks(30*64)
	sim.issue_command([builder],"build_muster_hall",Vector2(43,59))
	sim.step_ticks(55*64)
	var hall := _owned_structure("muster_hall")
	check(not hall.is_empty() and hall.build_progress >= 1,"Paid campaign production chain completes")
	if hall.is_empty(): return
	var gas_before: int = sim.players[1].aether
	check(sim.issue_command([hall.tag],"train_breacher").accepted==1 and sim.players[1].aether==gas_before-25,"Breacher consumes 25 earned gas")
	sim.step_ticks(22*64)
	check(count_units(1,"breacher")==1,"Gas-funded Breacher actually spawns")
	check(sim.issue_command([builder],"build_workshop",Vector2(43,77)).accepted==1,"Workshop consumes earned gas")
	sim.step_ticks(52*64)
	var workshop := _owned_structure("workshop")
	check(not workshop.is_empty() and workshop.build_progress >= 1,"Paid Workshop completes")
	if workshop.is_empty(): return
	for _second in range(120):
		if sim.players[1].aether >= 125: break
		sim.step_ticks(64)
	gas_before = sim.players[1].aether
	check(sim.issue_command([workshop.tag],"train_howitzer").accepted==1 and sim.players[1].aether==gas_before-125,"Howitzer consumes 125 earned gas: %s" % sim.players[1])
	sim.step_ticks(33*64)
	check(count_units(1,"howitzer")==1 and sim.players[1].aether_collected>=250,"Campaign supports both gas units without resource injection")

func _owned_structure(kind: String) -> Dictionary:
	for u in sim.units.values():
		if u.owner==1 and u.unit_type==kind: return u
	return {}
