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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 130, "height": 100},
		"players": {"1": {"faction": "aliens"}, "2": {"faction": "humans"}},
	})
	var warden: Dictionary = sim.spawn_unit("aegis_warden", 1, Vector2(42, 48))
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(56, 48))
	var supply: float = sim.players[1].supply_used
	_check(not sim.issue_command([warden.tag], "hallucinate_sunblade").ok, "The cast requires 75 energy")
	warden.energy = 75.0
	_check(sim.issue_command([warden.tag], "hallucinate_sunblade").ok and warden.energy == 0.0, "The Warden pays for Hallucination")
	var clones: Array = sim.units.values().filter(func(unit): return unit.get("hallucinated", false))
	if clones.size() != 2:
		_check(false, "Sunblade Hallucination produces two copies")
		_finish()
		return
	var clone: Dictionary = clones.front()
	_check(sim.players[1].supply_used == supply and clone.unit_type == "sunblade", "The copies look like Sunblades and reserve no supply")
	_check(sim.issue_command([clone.tag], "move", Vector2(35, 44)).ok, "The player can move a Hallucination")
	var foe_hp: float = enemy.hp
	var clone_shields: float = clone.shields
	sim._apply_damage_to_target(clone, enemy, 25.0, {}, 1.0)
	sim._apply_damage_to_target(enemy, clone, 5.0, {}, 1.0)
	_check(enemy.hp == foe_hp and clone.shields == clone_shields - 10.0, "A Hallucination deals zero damage and takes double damage")
	sim._refresh_vision()
	_check(sim.can_identify_hallucination(1, clone) and sim.can_see_unit(2, clone) and not sim.can_identify_hallucination(2, clone),
		"The owner knows the copy while an enemy without detection sees a regular Sunblade")
	sim.spawn_unit("sentry_turret", 2, Vector2(54, 54))
	sim._refresh_vision()
	_check(sim.can_identify_hallucination(2, clone), "An enemy detector identifies the Hallucination")
	var second: Dictionary = sim.spawn_unit("aegis_warden", 1, Vector2(18, 78))
	second.energy = 75.0
	_check(sim.issue_command([second.tag], "hallucinate_lumen_carrier").ok, "A Warden can make one flying Lumen Carrier copy")
	var carrier: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "lumen_carrier").front()
	_check(carrier.flight_height > 0 and not sim.issue_command([carrier.tag], "deploy_power_field").ok,
		"The copy flies and cannot use the original's power ability")
	var lifetime: int = Rules.HALLUCINATION_SECONDS * sim.TICK_RATE
	sim.step_ticks(lifetime - 1)
	_check(sim.units.has(carrier.tag), "The flying copy survives one tick before expiry")
	sim.step_ticks(1)
	_check(not sim.units.has(carrier.tag), "The copy expires after 43 seconds")
	_finish()

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)

func _finish() -> void:
	if failures.is_empty():
		print("PASS: Hallucination costs, copies, no supply or outgoing damage, double incoming damage, detection, and timed expiry")
	quit(0 if failures.is_empty() else 1)
