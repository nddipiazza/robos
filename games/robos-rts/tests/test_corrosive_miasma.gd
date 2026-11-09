extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	var center := Vector2(46, 26)
	sim.load_scenario_dict({"paused": true, "fog_of_war": true, "map": {"width": 104, "height": 64},
		"players": {"1": {"faction": "monsters"}}, "units": [
			{"type": "brood_nest", "owner": 1, "x": 18, "y": 26},
			{"type": "forager", "owner": 1, "x": 27, "y": 22},
			{"type": "blight_hurler", "owner": 1, "x": 36, "y": 26},
			{"type": "pioneer", "owner": 2, "x": 46, "y": 25},
			{"type": "pioneer", "owner": 2, "x": 54, "y": 26},
			{"type": "rampart_transport", "owner": 2, "x": 46, "y": 30},
			{"type": "forager", "owner": 1, "x": 46, "y": 32}
		]})
	var all: Array = sim.units.values()
	var caster: Dictionary = all[2]
	var enemy: Dictionary = all[3]
	_check(sim.issue_command([caster.tag], "hold_fire").ok, "Hold normal weapon fire to isolate the effect")
	_check(not sim.issue_command([caster.tag], "corrosive_miasma", center).ok and caster.energy == 50.0, "The spell is locked without a Spire")
	_check(sim.issue_command([all[1].tag], "build_blight_spire", Vector2(31, 18)).ok, "A Forager starts the paid Blight Spire")
	sim.step_ticks(140)
	_check(sim.players[1].crystal == 200 and sim.players[1].aether == 0, "The Spire is paid once")
	_check(not sim.issue_command([caster.tag], "corrosive_miasma", center).ok, "Incomplete Spire cannot unlock the spell")
	sim.step_ticks(900)
	_check(sim.has_tech_structure(1, "blight_spire"), "The paid Spire completes")
	_check(not sim.issue_command([caster.tag], "corrosive_miasma", Vector2(93, 24)).ok, "Out of range hidden targets are rejected")
	var before: float = caster.energy
	_check(sim.issue_command([caster.tag], "corrosive_miasma", center).ok and caster.energy == before - 50.0, "A valid area costs 50 energy")
	_check(sim.visible_miasma(1)[0].warning and sim.visible_miasma(1)[0].ticks == 64, "Warning exposes the exact starting delay")
	var hp: float = enemy.hp
	sim.step_ticks(63)
	_check(enemy.hp == hp, "Warning deals no damage")
	sim.step_ticks(1)
	_check(enemy.hp == hp - 9.0 and enemy.slow_timer > 0.0, "Active zone damages and slows the grounded enemy")
	_check(not sim.visible_miasma(1)[0].warning and sim.visible_miasma(1)[0].ticks == 512, "Active zone exposes its exact duration")
	_check(all[4].hp == all[4].max_hp and all[5].hp == all[5].max_hp and all[6].hp == all[6].max_hp,
		"Outside, flying, and allied units are unaffected")
	_check(sim.issue_command([enemy.tag], "move", Vector2(65, 34)).ok, "The target can withdraw")
	sim.step_ticks(300)
	_check(enemy.pos.distance_to(center) > 6.0 and enemy.hp > 0.0, "Movement lets a unit escape the hazard")
	hp = enemy.hp
	sim.step_ticks(211)
	_check(sim.visible_miasma(1)[0].ticks == 1 and enemy.hp == hp, "No damage follows a unit outside the radius")
	sim.step_ticks(1)
	_check(sim.visible_miasma(1).is_empty(), "The field expires at the exact final tick")
	print("Corrosive Miasma: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
