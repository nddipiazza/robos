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
	sim.spawn_unit("brood_nest", 1, Vector2(32, 42))
	var crawler: Dictionary = sim.spawn_unit("bile_crawler", 1, Vector2(70, 80))
	var bank: Dictionary = sim.players[1]
	var supply: float = bank.supply_used
	crawler.hp = 75.0
	_check(not sim.issue_command([crawler.tag], "morph_rupture_crawler").ok, "Morphing requires a Bile Warren")
	sim.spawn_unit("bile_warren", 1, Vector2(44, 50))
	_check(sim.issue_command([crawler.tag], "morph_rupture_crawler").ok and crawler.unit_type == "rupture_cocoon"
		and bank.crystal == 275 and bank.aether == 75 and bank.supply_used == supply + 1.0,
		"Morphing pays 25/75, reserves one supply and creates a cocoon")
	_check(crawler.is_immobile and crawler.hp == 100.0 and crawler.armor == 5.0
		and not sim.issue_command([crawler.tag], "move", Vector2(72, 82)).ok, "The cocoon has its own armor and cannot move")
	_check(sim.issue_command([crawler.tag], "cancel_rupture_morph").ok and crawler.unit_type == "bile_crawler"
		and crawler.hp == 75.0 and bank.supply_used == supply and bank.crystal == 300 and bank.aether == 150,
		"Cancel restores the wounded Bile Crawler and releases the reserved cost and supply")
	_check(sim.issue_command([crawler.tag], "morph_rupture_crawler").ok, "The Bile Crawler can start the morph again")
	var duration: int = ceili(Rules.RUPTURE_MORPH_SECONDS * sim.TICK_RATE)
	sim.step_ticks(duration - 1)
	_check(crawler.unit_type == "rupture_cocoon", "The cocoon remains for the full 12.14 seconds")
	sim.step_ticks(1)
	_check(crawler.unit_type == "rupture_crawler" and crawler.hp == 120.0 and bank.supply_used == supply + 1.0,
		"The cocoon completes into a three-supply Rupture Crawler")
	if crawler.unit_type == "rupture_crawler":
		_test_caustic_barrage(crawler)
	_finish()

func _test_caustic_barrage(crawler: Dictionary) -> void:
	var warden: Dictionary = sim.spawn_unit("aegis_warden", 2, Vector2(102, 82))
	var barrier_site := Vector2(87, 81)
	sim._refresh_vision()
	_check(sim.issue_command([warden.tag], "phase_barrier", barrier_site).ok, "The opposing Warden places a Phase Barrier")
	var barrier: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "phase_barrier").front()
	sim.issue_command([crawler.tag, warden.tag], "hold_position")
	_check(not sim.issue_command([crawler.tag], "caustic_barrage", Vector2(101, 81)).ok, "The cast has a 22.5-unit range")
	var commander := root.get_node("RTSCommanderAI")
	commander.skirmish_ai._try_caustic_barrage(1, crawler)
	_check(sim.caustic_strikes.is_empty(), "The commander cannot target the visible barrier off-camera")
	commander.look_at(1, crawler.pos)
	sim.step_ticks(16)
	commander.skirmish_ai._try_caustic_barrage(1, crawler)
	_check(sim.caustic_strikes.size() == 1 and sim.caustic_strikes.front().pos == barrier_site,
		"The commander targets the observed barrier after its camera arrives")
	var fuse: int = ceili(Rules.CAUSTIC_BARRAGE_DELAY * sim.TICK_RATE)
	sim.step_ticks(fuse - 1)
	_check(sim.units.has(barrier.tag), "The barrier remains until the impact tick")
	sim.step_ticks(1)
	_check(not sim.units.has(barrier.tag) and not sim.issue_command([crawler.tag], "caustic_barrage", barrier_site).ok,
		"One impact destroys the barrier and the caster remains on cooldown")
	sim.step_ticks(Rules.CAUSTIC_BARRAGE_COOLDOWN * sim.TICK_RATE - fuse)
	var point := Vector2(86, 74)
	_check(sim.issue_command([crawler.tag], "caustic_barrage", point).ok, "The caster can fire again after seven seconds")
	sim.step_ticks(fuse - 1)
	var air: Dictionary = sim.spawn_unit("rampart_transport", 2, point)
	var ally: Dictionary = sim.spawn_unit("bile_crawler", 1, point + Vector2(-1.0, 0.0))
	var enemy: Dictionary = sim.spawn_unit("breacher", 2, point + Vector2(0.0, -1.0))
	var building: Dictionary = sim.spawn_unit("silo", 2, point + Vector2(2.5, 0))
	sim.step_ticks(1)
	_check(air.hp == air.max_hp - 60.0 and ally.hp == ally.max_hp - 60.0 and enemy.hp == enemy.max_hp - 60.0
		and building.hp == building.max_hp - 60.0, "The impact bypasses armor and hits air, friendly ground, enemy ground, and structures")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)

func _finish() -> void:
	if failures.is_empty():
		print("PASS: paid cancellable cocoon morph, timed barrage, friendly fire, ground and air damage, and one-hit barrier destruction")
	quit(0 if failures.is_empty() else 1)
