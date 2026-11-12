extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim := root.get_node("SimEngine")
	var commander := root.get_node("RTSCommanderAI")
	sim.rts_mode = "backend"
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 130, "height": 100},
		"players": {"1": {"faction": "humans"}, "2": {"faction": "aliens"}},
	})
	var hub: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(43, 46))
	var victim: Dictionary = sim.spawn_unit("breacher", 1, Vector2(54, 46))
	var blade: Dictionary = sim.spawn_unit("duskblade", 2, Vector2(56, 46))
	sim._refresh_vision()
	var failures: Array[String] = []
	if not sim.can_see_position(1, blade.pos) or sim.can_see_unit(1, blade):
		failures.append("The concealed attacker must be on visible ground")
	var cfg: Dictionary = {}
	var mine := [hub, victim]
	var counts := {"colony_hub": 1, "breacher": 1}
	sim._execute_weapon_hit(blade, victim)
	if not commander.skirmish_ai._counter_orders(1, cfg, "humans", mine, [hub], counts).detector.is_empty():
		failures.append("A single unseen hit immediately caused a detector order")
	sim._execute_weapon_hit(blade, victim)
	var clue: Dictionary = sim.unseen_weapon_hits.get(1, {})
	if clue.get("pos") != victim.pos or clue.get("count") != 2 or clue.size() != 3:
		failures.append("The event must contain the victim's location, timestamp, and count only")
	if not commander.skirmish_ai._counter_orders(1, cfg, "humans", mine, [hub], counts).detector.is_empty():
		failures.append("The commander reacted before the camera arrived")
	sim.step_ticks(16)
	var response: Dictionary = commander.skirmish_ai._counter_orders(1, cfg, "humans", mine, [hub], counts)
	if response.detector != "sentry_turret" or response.detector_site != hub.pos + Vector2(7, 0):
		failures.append("The commander did not investigate the observed attack on its own base")
	var turret: Dictionary = sim.spawn_unit("sentry_turret", 1, Vector2(50, 41))
	mine.append(turret)
	counts.sentry_turret = 1
	sim._refresh_vision()
	if not sim.can_see_unit(1, blade):
		failures.append("A working detector should reveal the attacker")
	sim._execute_weapon_hit(blade, victim)
	if sim.unseen_weapon_hits.get(1, {}).get("count") != 2:
		failures.append("Hits from the now-visible attacker should not create more unseen clues")
	print("Unseen combat checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
