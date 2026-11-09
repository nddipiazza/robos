extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_triage()
	_test_relay()
	_test_interrupted_support()
	print("Roadmap support checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _test_triage() -> void:
	sim.reset_state(42, 104, 64)
	var medic: Dictionary = sim.spawn_unit("triage_specialist", 1, Vector2(30, 25))
	var patient: Dictionary = sim.spawn_unit("breacher", 1, Vector2(34, 25))
	var machine: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(29, 28))
	patient.hp = 15.0
	machine.hp = 20.0
	sim.step_ticks(330)
	_check(patient.hp > 55.0 and patient.hp < patient.max_hp and medic.energy < 1.0, "Idle triage spends finite energy on a nearby ally")
	_check(machine.hp == 20.0, "Triage does not repair mechanical units")
	_check(not sim.issue_command([medic.tag], "restore_vitals", machine.pos, machine.tag).ok, "A manual order rejects an ineligible target")
	var end := Vector2(47, 25)
	sim.issue_command([medic.tag], "move", end)
	sim.step_ticks(250)
	_check(medic.pos.distance_to(end) < 2.0 and medic.energy > 3.0, "A move order interrupts treatment and energy recovers")

func _test_relay() -> void:
	sim.reset_state(42, 104, 64)
	var relay: Dictionary = sim.spawn_unit("aegis_relay", 1, Vector2(35, 25))
	var resonator: Dictionary = sim.spawn_unit("resonator", 1, Vector2(26, 25))
	var patient: Dictionary = sim.spawn_unit("spire_walker", 1, Vector2(40, 25))
	var distant: Dictionary = sim.spawn_unit("sunblade", 1, Vector2(55, 25))
	var attacker: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(95, 52))
	for target in [patient, distant]:
		target.shields = 1.0
		target.out_of_combat_timer = 0.0
	sim.step_ticks(72)
	_check(patient.shields > 20.0 and relay.energy < 35.0, "The powered relay restores shields during the natural regeneration delay")
	_check(distant.shields == 1.0, "The relay does not restore distant allies")
	sim._apply_damage_to_target(attacker, resonator, 1000.0, {}, 1.0)
	var shield_before: float = patient.shields
	var energy_before: float = relay.energy
	sim.step_ticks(64)
	_check(patient.shields == shield_before and relay.energy == energy_before and relay.support_target_tag == 0, "Losing power stops both restoration and recharge")

func _test_interrupted_support() -> void:
	sim.reset_state(42, 104, 64)
	var medic: Dictionary = sim.spawn_unit("triage_specialist", 1, Vector2(25, 25))
	var first: Dictionary = sim.spawn_unit("breacher", 1, Vector2(28, 25))
	var backup: Dictionary = sim.spawn_unit("breacher", 1, Vector2(29, 29))
	var attacker: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(95, 52))
	first.hp = 20.0
	backup.hp = 20.0
	sim.issue_command([medic.tag], "restore_vitals", first.pos, first.tag)
	sim.step_ticks(16)
	var energy: float = medic.energy
	sim._apply_damage_to_target(attacker, first, 1000.0, {}, 1.0)
	sim.step_ticks(24)
	_check(medic.orders.is_empty() and medic.support_target_tag == backup.tag, "A dead patient clears the manual order and lets triage find another ally")
	_check(is_equal_approx(medic.energy, energy + 24.0 / 64.0 - (backup.hp - 20.0)), "Interrupted treatment charges only for delivered healing")

	sim.reset_state(42, 104, 64)
	sim.spawn_unit("resonator", 1, Vector2(24, 25))
	var relay: Dictionary = sim.spawn_unit("aegis_relay", 1, Vector2(34, 25))
	first = sim.spawn_unit("spire_walker", 1, Vector2(39, 24))
	backup = sim.spawn_unit("spire_walker", 1, Vector2(37, 33))
	for patient in [first, backup]:
		patient.shields = 1.0
		patient.out_of_combat_timer = 0.0
	sim.step_ticks(16)
	_check(relay.support_target_tag == first.tag, "The relay initially treats the closer patient")
	sim.issue_command([first.tag], "move", Vector2(61, 24))
	sim.step_ticks(148)
	_check(relay.support_target_tag == backup.tag, "The relay changes targets when the first patient retreats")
	_check(is_equal_approx(relay.energy, 50.0 + 164.0 / 64.0 - (first.shields + backup.shields - 2.0)), "The relay spends energy only on actual shield restoration")
