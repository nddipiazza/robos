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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true,
		"map": {"width": 256, "height": 128},
		"players": {"1": {"faction": "aliens", "crystal": 600, "aether": 700}, "2": {"faction": "humans"}},
	})
	var base := Vector2(50, 45)
	sim.spawn_unit("heartstone", 1, base)
	sim.spawn_unit("resonator", 1, base + Vector2(0, 10))
	var mote: Dictionary = sim.spawn_unit("mote", 1, base + Vector2(-4, 8))
	var gate: Dictionary = sim.spawn_unit("waystone", 1, base + Vector2(7, 11))
	var archive_site := base + Vector2(-8, 13)
	sim._refresh_vision()
	_check(not sim.issue_command([gate.tag], "train_storm_scribe").ok, "The Waystone requires a Canticle Archive")
	_check(not sim.issue_command([mote.tag], "build_canticle_archive", archive_site).ok, "The Archive requires a Twilight Array")
	sim.spawn_unit("twilight_array", 1, base + Vector2(5, 18))
	_check(sim.issue_command([mote.tag], "build_canticle_archive", archive_site).ok, "Mote can start the powered Archive")
	sim.step_ticks(40 * sim.TICK_RATE)
	var archives: Array = sim.units.values().filter(func(unit): return unit.unit_type == "canticle_archive" and unit.build_progress >= 1.0)
	if archives.is_empty():
		_check(false, "The Archive completes")
		_finish()
		return
	var archive: Dictionary = archives.front()
	var bank: Dictionary = sim.players[1]
	_check(sim.issue_command([gate.tag], "train_storm_scribe").ok and gate.production_queue.front().total_time == 40.0
		and bank.crystal == 400 and bank.aether == 350, "The Archive unlocks a paid 40-second Storm Scribe")
	var scribe: Dictionary = sim.spawn_unit("storm_scribe", 1, Vector2(85, 92))
	var second: Dictionary = sim.spawn_unit("storm_scribe", 1, Vector2(85, 98))
	_check(scribe.energy == 50.0, "Scribes start with 50 energy")
	var point := Vector2(103, 95)
	sim._refresh_vision()
	_check(not sim.issue_command([scribe.tag], "canticle_storm", point).ok, "Storm requires research")
	_check(sim.issue_command([archive.tag], "research_canticle_storm").ok and bank.crystal == 200 and bank.aether == 150,
		"The Archive queues Storm at 200 crystal and 200 aether")
	sim.step_ticks(ceili(float(Rules.STORM_RESEARCH.time) * sim.TICK_RATE) + 1)
	_check(bank.upgrades.get("canticle_storm", 0) == 1, "The paid Storm research completes")
	var air: Dictionary = sim.spawn_unit("rampart_transport", 2, point + Vector2(1, 0))
	var ally: Dictionary = sim.spawn_unit("mote", 1, point + Vector2(-3, 0))
	var depot: Dictionary = sim.spawn_unit("silo", 2, point + Vector2(4, 0))
	ally.max_hp = 200.0
	ally.hp = 200.0
	var air_hp: float = air.hp
	var depot_hp: float = depot.hp
	sim.issue_command([scribe.tag, second.tag, ally.tag], "hold_position")
	sim._refresh_vision()
	_check(not sim.issue_command([scribe.tag], "canticle_storm", point + Vector2(3, 0)).ok, "Storm cannot exceed its cast range")
	var pre_cast_energy: float = scribe.energy
	_check(sim.issue_command([scribe.tag], "canticle_storm", point).ok and scribe.energy == pre_cast_energy - 75.0,
		"Storm pays its energy cost on cast")
	_check(sim.issue_command([second.tag], "canticle_storm", point).ok, "A second Scribe can cast over the same area")
	sim.step_ticks(Rules.STORM_SECONDS * sim.TICK_RATE + 1)
	_check(is_equal_approx(air.hp, air_hp - 110.0) and is_equal_approx(ally.hp + ally.shields, 110.0)
		and depot.hp == depot_hp, "Storm result, expected 40 aircraft HP, 110 allied durability, and an intact depot. Got %s, %s, %s." %
		[air.hp, ally.hp + ally.shields, depot.hp])
	_check(sim.visible_canticle_storms(1).is_empty(), "The Storm ends after six seconds")
	scribe.energy = 50.0
	var keeper: Dictionary = sim.spawn_unit("brood_keeper", 2, Vector2(81, 86))
	keeper.energy = 40.0
	var keeper_hp: float = keeper.hp
	sim._refresh_vision()
	_check(sim.issue_command([scribe.tag], "scribe_feedback", keeper.pos, keeper.tag).ok and keeper.energy == 0.0
		and is_equal_approx(keeper.hp, keeper_hp - 20.0) and scribe.energy == 0.0,
		"Feedback drains energy and deals half the drained amount, bypassing armor")
	_test_camera_cast(scribe)
	_finish()

func _test_camera_cast(scribe: Dictionary) -> void:
	var commander := root.get_node("RTSCommanderAI")
	var crowd := Vector2(88, 80)
	for offset in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
		var enemy: Dictionary = sim.spawn_unit("rifleman", 2, crowd + offset)
		sim.issue_command([enemy.tag], "hold_position")
	scribe.energy = 150.0
	sim._refresh_vision()
	commander.skirmish_ai._try_scribe_spell(1, scribe)
	_check(sim.canticle_storms.is_empty(), "A fog-visible crowd does not receive a Storm before the commander looks")
	commander.look_at(1, scribe.pos)
	commander.skirmish_ai._try_scribe_spell(1, scribe)
	_check(sim.canticle_storms.is_empty(), "The commander cannot cast while the camera is panning")
	sim.step_ticks(16)
	commander.skirmish_ai._try_scribe_spell(1, scribe)
	_check(sim.canticle_storms.size() == 1, "The commander can cast on the observed crowd after the camera arrives")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)

func _finish() -> void:
	if failures.is_empty():
		print("PASS: powered Canticle Archive, paid Storm Scribe and research, Feedback, and non-stacking Storm damage")
	quit(0 if failures.is_empty() else 1)
