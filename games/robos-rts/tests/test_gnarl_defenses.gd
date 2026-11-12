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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 160, "height": 140},
		"players": {"1": {"faction": "monsters", "crystal": 300}, "2": {"faction": "monsters"}},
		"units": [{"type": "brood_nest", "owner": 1, "x": 45, "y": 55}],
	})
	var forager: Dictionary = sim.spawn_unit("forager", 1, Vector2(53, 52))
	var origin := Vector2(58, 55)
	var new_site := Vector2(64, 58)
	sim.step_ticks(12 * sim.TICK_RATE)
	_check(not sim._can_build(forager, "spore_watch", origin), "The Spore Watch needs early Gnarl tech")
	sim.spawn_unit("adaptation_chamber", 1, Vector2(43, 41))
	_check(sim._can_build(forager, "spore_watch", origin) and not sim._can_build(forager, "thorn_watch", new_site),
		"The Chamber alone unlocks Spore Watch and the Thorn Watch still requires the Pool")
	sim.spawn_unit("hatchling_pool", 1, Vector2(42, 69))
	_check(sim._can_build(forager, "thorn_watch", new_site), "The Pool unlocks Thorn Watch")
	var spore: Dictionary = sim.spawn_unit("spore_watch", 1, origin)
	var thorn: Dictionary = sim.spawn_unit("thorn_watch", 1, Vector2(63, 47))
	var flyer: Dictionary = sim.spawn_unit("needlewing", 2, Vector2(72, 59))
	var ground: Dictionary = sim.spawn_unit("bile_crawler", 2, Vector2(73, 48))
	var dusk: Dictionary = sim.spawn_unit("duskblade", 2, Vector2(70, 62))
	sim.issue_command([flyer.tag, ground.tag, spore.tag, thorn.tag, dusk.tag], "hold_fire")
	sim._refresh_vision()
	_check(sim._execute_weapon_hit(spore, flyer) and flyer.hp == flyer.max_hp - 30.0
		and not sim.can_attack(spore, ground), "Spore acid deals 20 plus ten against biological air units")
	_check(sim._execute_weapon_hit(thorn, ground) and ground.hp == ground.max_hp - 29.0
		and not sim.can_attack(thorn, flyer), "Thorn hits armored ground and skips air")
	_check(not sim.issue_command([spore.tag], "move", new_site).ok, "The rooted Spore Watch cannot walk")
	_check(sim.can_see_unit(1, dusk), "A rooted Spore Watch reveals the cloaked contact")
	_check(sim.issue_command([spore.tag], "crawler_uproot").ok and not sim.can_attack(spore, flyer)
		and not sim.can_see_unit(1, dusk),
		"Uprooting suspends weapons and detection")
	var uproot_ticks: int = ceili(Rules.CRAWLER_UPROOT_SECONDS * sim.TICK_RATE)
	sim.step_ticks(uproot_ticks - 1)
	_check(not spore.get("crawler_uprooted", false), "The defense takes its full uproot time")
	sim.step_ticks(1)
	_check(spore.get("crawler_uprooted", false) and not spore.is_immobile, "The uprooted defense can walk")
	_check(not sim.issue_command([spore.tag], "crawler_root", Vector2(110, 90)).ok, "Rooting requires living ground")
	_check(sim.issue_command([spore.tag], "crawler_root", new_site).ok, "The mobile defense can root at another site")
	for step in 3 * sim.TICK_RATE:
		if spore.has("crawler_transition"):
			break
		sim.step_ticks(1)
	if spore.has("crawler_transition"):
		var remaining: int = spore.crawler_transition.finish - sim.tick
		_check(remaining == ceili(Rules.CRAWLER_ROOT_SECONDS.spore_watch * sim.TICK_RATE), "The Spore Watch takes its longer root time")
		sim.step_ticks(remaining)
		_check(spore.pos == new_site and not spore.crawler_uprooted and sim.can_see_unit(1, dusk) and sim.can_attack(spore, flyer),
			"Rooting restores the footprint, weapon and detection at the new position (%s, mobile %s, detector %s, contact %s)" %
			[spore.pos, spore.crawler_uprooted, spore.detection_radius, dusk.pos])
	else:
		failures.append("The Spore Watch reached its rooting site")
	print("Gnarl rooted defenses: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
