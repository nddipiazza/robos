extends SceneTree

const AI_START := Vector2(116, 48)
const HIDDEN_AIR := Vector2(36, 48)
const CONTACT := Vector2(100, 66)

var sim: Node
var director: Node
var failures: Array[String] = []
var counter_producer := ""
var air_hit := false
var air_target := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	director = root.get_node("RTSCommanderAI")
	sim.unit_production_finished.connect(_on_training)
	sim.weapon_attack.connect(_on_attack)
	_test_air_counter()
	_test_detected_cloak()
	_test_dedicated_detector("monsters", "spore_watch")
	_test_dedicated_detector("aliens", "aegis_relay")
	print("AI threat counter checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _start(faction: String = "humans") -> void:
	var result: Dictionary = sim.load_scenario_dict({
		"mode": "skirmish", "seed": 42, "difficulty": "hard", "strategy": "rush", "ai_faction": faction,
		"map": {
			"width": 144, "height": 96,
			"starts": [{"x": 28, "y": 48}, {"x": AI_START.x, "y": AI_START.y}],
			"water_channels": [{"width": 26, "points": [[72, 0], [72, 96]]}],
		},
	})
	_check(result.ok and sim.players[2].crystal == 50 and sim.players[2].aether == 0, "The AI uses the normal starting bank")

func _evidence() -> Dictionary:
	return director.player_directives[2].get("counter_evidence", {})

func _owned(kind: String) -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == 2 and unit.unit_type == kind)

func _wait_for_unit(kind: String, seconds: int) -> Dictionary:
	for _second in range(seconds):
		for unit in _owned(kind):
			if unit.build_progress >= 1.0:
				return unit
		sim.step_ticks(64)
	return {}

func _test_air_counter() -> void:
	_start()
	counter_producer = ""
	air_hit = false
	# Only the enemy threat is authored. The AI must mine and pay for every
	# structure and unit it adds in response.
	var transport: Dictionary = sim.spawn_unit("rampart_transport", 1, HIDDEN_AIR)
	air_target = transport.tag
	sim.step_ticks(55 * 64)
	_check(not sim.can_see_unit(2, transport) and not _evidence().has("air_goal") and _owned("airframe_hangar").is_empty(),
		"An aircraft in fog cannot trigger air counter production")
	sim.issue_command([transport.tag], "move", Vector2(102, 52))
	for _sample in range(60):
		sim.step_ticks(16)
		if _evidence().has("air_goal"):
			break
	_check(sim.can_see_unit(2, transport) and _evidence().get("air_goal", 0) == 1, "A single visible aircraft creates a bounded response")
	sim.issue_command([transport.tag], "move", HIDDEN_AIR)
	var interceptor := _wait_for_unit("kestrel_interceptor", 215)
	if not _check(not interceptor.is_empty() and counter_producer == "airframe_hangar", "The AI trains a paid Kestrel from its Airframe Hangar"):
		print(JSON.stringify({"air_evidence": _evidence(), "player": sim.players[2],
			"workshops": _owned("workshop").size(), "hangars": _owned("airframe_hangar").size()}))
		return
	_check(sim.players[2].aether_collected >= 300 and not _owned("workshop").is_empty() and not _owned("sentry_turret").is_empty(),
		"Rush AI mines the aether and pays for both prerequisite structures and the air counter")
	_check(not interceptor.get("skirmish_route", {}).has("destination"), "An air-only fighter stays available for air defense")
	var flank_y := 12.0 if interceptor.pos.y < AI_START.y else 84.0
	sim.issue_command([transport.tag], "move", Vector2(HIDDEN_AIR.x, flank_y))
	sim.issue_command([transport.tag], "move", Vector2(interceptor.pos.x - 12.0, flank_y), 0, "", true)
	sim.issue_command([transport.tag], "move", interceptor.pos, 0, "", true)
	var intercepted := false
	for _sample in range(160):
		sim.step_ticks(16)
		intercepted = intercepted or (not interceptor.orders.is_empty() and interceptor.orders[0].get("target_tag", 0) == transport.tag)
		if air_hit:
			break
	_check(intercepted and air_hit, "The purchased interceptor is sent and fires on the returning aircraft")
	print(JSON.stringify({"air_counter": counter_producer, "intercepted": intercepted, "hit": air_hit,
		"aether_mined": sim.players[2].aether_collected, "transport_hp": transport.hp}))

func _test_detected_cloak() -> void:
	_start()
	sim.step_ticks(52 * 64)
	var enemy: Dictionary = sim.spawn_unit("skirmisher", 1, CONTACT)
	sim.issue_command([enemy.tag], "hold_fire")
	sim.issue_command([enemy.tag], "hold_position")
	sim.issue_command([enemy.tag], "phase_cloak")
	sim.step_ticks(96)
	_check(sim.can_see_position(2, CONTACT) and not sim.can_see_unit(2, enemy)
		and not _evidence().has("stealth_until") and _owned("sentry_turret").is_empty(),
		"Cloak in visible terrain alone creates no AI sighting or purchase")
	sim.issue_command([enemy.tag], "phase_cloak")
	for _sample in range(12):
		sim.step_ticks(16)
		if _evidence().get("cloak_track", {}).get("tag", 0) == enemy.tag:
			break
	var tracked: Dictionary = _evidence().get("cloak_track", {})
	if not _check(tracked.get("tag", 0) == enemy.tag, "The AI can remember the position it actually saw"):
		return
	var observed: Vector2 = tracked.pos
	sim.issue_command([enemy.tag], "phase_cloak")
	sim.issue_command([enemy.tag], "move", CONTACT + Vector2(-4, 3))
	for _sample in range(16):
		sim.step_ticks(16)
		if _evidence().get("cloak_visible", false):
			break
	var sweeps: Array = sim.vision.sweeps_for(2)
	_check(not sweeps.is_empty() and sweeps[0].pos == observed and _evidence().get("cloak_visible", false),
		"Recon uses the last visible point and escalates only after detecting the cloak")
	var detector := _wait_for_unit("sentry_turret", 90)
	_check(not detector.is_empty() and sim.players[2].crystal_collected > 125, "The AI mines and pays for a detector")
	if not detector.is_empty():
		_assert_detects(detector, "Meridian Sentry")

func _test_dedicated_detector(faction: String, kind: String) -> void:
	_start(faction)
	sim.step_ticks(42 * 64)
	var enemy: Dictionary = sim.spawn_unit("skirmisher", 1, CONTACT)
	sim.issue_command([enemy.tag], "hold_fire")
	sim.issue_command([enemy.tag], "hold_position")
	var detector := _wait_for_unit(kind, 88)
	if _check(not detector.is_empty() and sim.players[2].crystal_collected > 100, faction + " buys dedicated detection after seeing a cloak-capable unit"):
		_assert_detects(detector, kind)

func _assert_detects(detector: Dictionary, label: String) -> void:
	var unit: Dictionary = sim.spawn_unit("skirmisher", 1, detector.pos + Vector2(4, 0))
	sim.issue_command([unit.tag], "hold_fire")
	sim.issue_command([unit.tag], "phase_cloak")
	sim.step_ticks(8)
	_check(unit.cloaked and sim.can_see_unit(2, unit), label + " actually reveals a cloaked threat")

func _on_training(unit: Dictionary, producer: Dictionary) -> void:
	if unit.owner == 2 and unit.unit_type == "kestrel_interceptor":
		counter_producer = producer.unit_type

func _on_attack(attacker: Dictionary, target: Dictionary, _weapon: Dictionary, _hit_shields: bool) -> void:
	if attacker.owner == 2 and attacker.unit_type == "kestrel_interceptor" and target.tag == air_target:
		air_hit = true
