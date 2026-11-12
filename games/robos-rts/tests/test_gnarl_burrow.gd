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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 150, "height": 120},
		"players": {"1": {"faction": "monsters", "crystal": 300, "aether": 150}, "2": {"faction": "aliens"}},
	})
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(25, 28))
	var nursery: Dictionary = sim.spawn_unit("spore_nursery", 1, Vector2(32, 36))
	var crawler: Dictionary = sim.spawn_unit("bile_crawler", 1, Vector2(72, 75))
	var forager: Dictionary = sim.spawn_unit("forager", 1, Vector2(36, 25))
	var rupture: Dictionary = sim.spawn_unit("rupture_crawler", 1, Vector2(59, 55))
	var enemy: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(87, 75))
	sim.issue_command([enemy.tag, crawler.tag], "hold_position")
	_check(not sim.issue_command([crawler.tag, forager.tag], "burrow").ok, "Ground units need the faction's research")
	_check(not sim.issue_command([nursery.tag], "research_spore_burrow").ok, "Ladder research is unavailable at the legacy producer")
	_check(sim.issue_command([nest.tag], "research_burrow").ok and sim.players[1].crystal == 200 and sim.players[1].aether == 50,
		"The Brood Nest charges 100/100 to queue Burrow")
	_check(not sim.issue_command([nest.tag], "research_burrow").ok, "Burrow cannot be queued twice")
	var duration: int = ceili(Rules.BURROW_RESEARCH.time * sim.TICK_RATE)
	sim.step_ticks(duration - 1)
	_check(not sim.issue_command([forager.tag], "burrow").ok, "Burrow is locked for the full research time")
	sim.step_ticks(1)
	if not _check(sim.issue_command([crawler.tag, forager.tag, rupture.tag], "burrow").accepted == 3,
			"Research unlocks Burrow for workers and both crawler types"):
		_finish()
		return
	var start: int = sim.tick
	var timing: Vector3 = Rules.BURROW_TIMINGS.bile_crawler
	var down: int = crawler.burrow_transition.finish - start
	_check(down >= ceili(timing.x * sim.TICK_RATE) and down <= ceili((timing.x + timing.z) * sim.TICK_RATE),
		"Bile Crawler has its own bounded descent time")
	_check(crawler.is_immobile and sim.can_see_unit(2, crawler) and not sim.issue_command([crawler.tag], "move", Vector2(60, 75)).ok,
		"The descent immobilizes the crawler while it is still visible")
	sim.step_ticks(down)
	_check(crawler.get("burrowed", false) and not sim.can_see_unit(2, crawler), "A completed descent requires detection")
	var detector: Dictionary = sim.spawn_unit("farsight_wisp", 2, Vector2(78, 78))
	sim._refresh_vision()
	_check(sim.can_see_unit(2, crawler), "An enemy detector reveals the buried unit")
	sim._remove_destroyed_unit(detector)
	sim._refresh_vision()
	_check(not sim.can_see_unit(2, crawler), "Removing the detector hides the crawler again")
	crawler.hp = 60.0
	sim.step_ticks(sim.TICK_RATE)
	_check(is_equal_approx(crawler.hp, 60.0 + Rules.BROOD_REGEN_PER_SECOND + Rules.BILE_CRAWLER_BURROW_REGEN),
		"Buried Bile Crawler gains 7 HP per second above base regeneration")
	_check(not sim.issue_command([rupture.tag], "caustic_barrage", Vector2(60, 55)).ok
		and not sim.issue_command([forager.tag], "move", Vector2(50, 32)).ok, "Buried units cannot cast or move")
	if not _check(sim.issue_command([crawler.tag], "surface").ok, "Bile Crawler can start to emerge"):
		_finish()
		return
	var up: int = crawler.burrow_transition.finish - sim.tick
	_check(up >= ceili(timing.y * sim.TICK_RATE) and up <= ceili((timing.y + Rules.UNBURROW_MAX_DELAY) * sim.TICK_RATE),
		"Bile Crawler has a bounded emergence time")
	var destination := Vector2(60, 75)
	_check(sim.issue_command([crawler.tag], "move", destination).ok, "Movement can be issued during emergence")
	sim.step_ticks(up - 1)
	_check(crawler.get("burrowed", false) and crawler.pos == Vector2(72, 75), "The emerging crawler stays buried until the timer ends")
	sim.step_ticks(1)
	_check(not crawler.get("burrowed", true) and not crawler.is_immobile and sim.can_see_unit(2, crawler),
		"Emergence restores mobility and ordinary visibility")
	_check(not crawler.orders.is_empty() and crawler.orders.front().target_pos == destination, "The deferred movement order resumes")
	_test_commander(crawler, enemy)
	_finish()

func _test_commander(crawler: Dictionary, enemy: Dictionary) -> void:
	var commander := root.get_node("RTSCommanderAI")
	var opponent: Dictionary = sim.spawn_unit("spore_watch", 2, enemy.pos + Vector2(0, 3))
	sim._refresh_vision()
	crawler.hp = 30.0
	_check(not commander.skirmish_ai._try_crawler_burrow(1, crawler), "The commander cannot burrow a unit off-camera")
	commander.look_at(1, crawler.pos)
	sim.step_ticks(16)
	_check(not commander.skirmish_ai._try_crawler_burrow(1, crawler), "The commander avoids burrowing beside a visible detector")
	sim._remove_destroyed_unit(opponent)
	sim._refresh_vision()
	if not _check(commander.skirmish_ai._try_crawler_burrow(1, crawler), "The commander burrows a wounded unit beside an observed threat"):
		return
	sim.step_ticks(crawler.burrow_transition.finish - sim.tick)
	crawler.hp = crawler.max_hp
	commander.look_at(1, Vector2(130, 100))
	sim.step_ticks(16)
	_check(not commander.skirmish_ai._try_crawler_burrow(1, crawler), "The commander leaves a recovered crawler buried while off-camera")
	sim.step_ticks(64)
	commander.look_at(1, crawler.pos)
	sim.step_ticks(16)
	_check(commander.skirmish_ai._try_crawler_burrow(1, crawler), "The commander surfaces the crawler after bringing it back on-camera")

func _check(condition: bool, label: String) -> bool:
	if not condition:
		failures.append(label)
	return condition

func _finish() -> void:
	if failures.is_empty():
		print("PASS: shared Gnarl Burrow research, timed descent and emergence, detector reveal, regeneration, deferred move, and camera-gated AI")
	else:
		for failure in failures:
			push_error(failure)
	quit(0 if failures.is_empty() else 1)
