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
		"players": {"1": {"faction": "monsters", "crystal": 450, "aether": 400}, "2": {"faction": "humans"}},
	})
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(25, 25))
	var hurler: Dictionary = sim.spawn_unit("blight_hurler", 1, Vector2(73, 70))
	var bank: Dictionary = sim.players[1]
	_check(not sim.issue_command([hurler.tag], "morph_spine_ambusher").ok, "The morph needs a completed Ambusher Den")
	var den: Dictionary = sim.spawn_unit("ambusher_den", 1, Vector2(42, 35))
	_check(not sim.issue_command([den.tag], "research_adaptive_talons").ok
		and not sim.issue_command([den.tag], "research_seismic_spines").ok, "Both Ambusher upgrades require a Hive")
	hurler.hp = 60.0
	_check(sim.issue_command([hurler.tag], "morph_spine_ambusher").ok and hurler.unit_type == "ambusher_cocoon"
		and bank.crystal == 400 and bank.aether == 300 and bank.supply_used == 3, "The cocoon costs 50/100 and reserves one supply")
	_check(hurler.is_immobile and not sim.issue_command([hurler.tag], "move", Vector2(74, 70)).ok, "The cocoon cannot move")
	_check(sim.issue_command([hurler.tag], "cancel_ambusher_morph").ok and hurler.unit_type == "blight_hurler"
		and hurler.hp == 60.0 and bank.crystal == 450 and bank.aether == 400 and bank.supply_used == 2,
		"Cancel restores the Blight Hurler and refunds the resources and supply")
	if not sim.issue_command([hurler.tag], "morph_spine_ambusher").ok:
		failures.append("The morph restarts after cancellation")
		_finish()
		return
	var duration: int = 25 * sim.TICK_RATE
	sim.step_ticks(duration - 1)
	_check(hurler.unit_type == "ambusher_cocoon", "The cocoon remains for the full morph duration")
	sim.step_ticks(1)
	_check(hurler.unit_type == "spine_ambusher" and hurler.hp == 190.0 and bank.supply_used == 3, "The Ambusher completes at 190 HP and three supply")
	nest["structure_form"] = "brood_hive"
	_check(sim.issue_command([den.tag], "research_adaptive_talons").ok and sim.issue_command([den.tag], "research_seismic_spines").ok,
		"The Hive unlocks the two paid Ambusher upgrades")
	var research_ticks: int = ceili(Rules.AMBUSHER_TALONS_RESEARCH.time * sim.TICK_RATE)
	sim.step_ticks(research_ticks * 2)
	_check(is_equal_approx(sim.effective_move_speed(hurler), Rules.AMBUSHER_UPGRADED_SPEED), "Adaptive Talons increases surface speed")
	_test_spine_line(hurler)
	_finish()

func _test_spine_line(ambusher: Dictionary) -> void:
	var primary: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(86, 70))
	var armored: Dictionary = sim.spawn_unit("howitzer", 2, Vector2(94, 70))
	var side: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(86, 75))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(88, 70))
	var friendly: Dictionary = sim.spawn_unit("skitterling", 1, Vector2(92, 70))
	sim.issue_command([primary.tag, armored.tag, side.tag, air.tag, friendly.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(not sim.can_attack(ambusher, primary), "A surfaced Ambusher cannot attack")
	if not sim.issue_command([ambusher.tag], "burrow").ok:
		failures.append("The Ambusher can descend without faction-wide research")
		return
	var down: int = ambusher.burrow_transition.finish - sim.tick
	_check(down <= ceili((Rules.AMBUSHER_TALONS_BURROW_SECONDS + 0.089) * sim.TICK_RATE), "Adaptive Talons accelerates descent")
	sim.step_ticks(down)
	_check(ambusher.is_immobile and not sim.can_see_unit(2, ambusher) and sim.can_attack(ambusher, primary),
		"An undetected buried Ambusher can fire while immobile")
	_check(sim.weapon_range_against(ambusher, primary) == 25.0, "Seismic Spines extends the ground weapon by two reference tiles")
	_check(sim._execute_weapon_hit(ambusher, primary) and primary.hp == primary.max_hp - 20.0
		and armored.hp == armored.max_hp - 29.0, "The spine line hits a second enemy and applies its armored bonus")
	_check(side.hp == side.max_hp and air.hp == air.max_hp and friendly.hp == friendly.max_hp,
		"The spine line skips units off the line, air, and allies")
	_check(sim.issue_command([ambusher.tag], "hold_fire").ok and not sim.issue_command([ambusher.tag], "move", Vector2(75, 70)).ok,
		"The buried Ambusher accepts hold fire while movement is unavailable")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _finish() -> void:
	print("Spine Ambusher: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
