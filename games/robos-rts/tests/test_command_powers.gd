extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		printerr(message)

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.load_scenario_dict({
		"fog_of_war": true, "paused": true,
		"map": {"width": 96, "height": 64, "high_ground": [{"x": 48, "y": 8, "w": 28, "h": 44}]}
	})
	var hub: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(14, 20))
	var backup: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(14, 44))
	var silo: Dictionary = sim.spawn_unit("silo", 1, Vector2(24, 18))
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(39, 24))
	var enemy: Dictionary = sim.spawn_unit("pioneer", 2, Vector2(53, 24))
	sim.vision.update(sim.units, sim.tick)
	check(not sim.can_see_unit(1, enemy) and sim.can_see_unit(2, worker), "Ground units can see downhill, but need a spotter to see uphill")
	var spotter: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(55, 37))
	sim.vision.update(sim.units, sim.tick)
	check(sim.can_see_unit(1, enemy), "A friendly spotter on the plateau provides shared sight")
	sim.units.erase(spotter.tag)
	sim.vision.update(sim.units, sim.tick)
	check(not sim.can_see_unit(1, enemy), "The plateau is hidden after losing the spotter")

	check(sim.issue_command([hub.tag, backup.tag], "recon_sweep", enemy.pos).accepted == 1, "A group issues one sweep")
	check(hub.energy == 0.0 and backup.energy == 50.0, "Only the casting hub spends energy")
	check(sim.can_see_unit(1, enemy) and sim.vision.sweeps_for(2).is_empty(), "A sweep reveals uphill targets for its owner")
	var cap: int = sim.players[1].supply_cap
	check(sim.issue_command([hub.tag, backup.tag], "reinforce_supply", silo.pos, silo.tag).accepted == 1, "The other hub spends energy to reinforce the Silo")
	check(sim.players[1].supply_cap == cap + 8 and backup.energy == 0.0, "Reinforcement adds eight supply")
	sim.issue_command([silo.tag], "retract_silo")
	check(sim.players[1].supply_cap == cap + 8, "Reinforcement survives a Silo morph")
	sim.step_ticks(640)
	check(not sim.can_see_unit(1, enemy) and sim.vision.sweeps_for(1).is_empty(), "A sweep expires after ten seconds")
	check(hub.energy > 0.0 and hub.energy < 50.0, "Hub energy regenerates over simulation time")

	var crystal: int = sim.players[1].crystal
	check(sim.issue_command([silo.tag], "salvage").ok, "A completed Silo can salvage")
	sim._apply_damage_to_target(enemy, silo, 5.0, {}, 1.0)
	sim.step_ticks(320)
	check(sim.units.has(silo.tag) and sim.players[1].crystal == crystal, "A hit interrupts the refund and keeps the Silo")
	check(sim.issue_command([silo.tag], "salvage").ok, "The player can restart salvage")
	sim.step_ticks(319)
	check(sim.units.has(silo.tag), "Salvage is delayed")
	sim.step_ticks(1)
	check(not sim.units.has(silo.tag) and sim.players[1].crystal == crystal + 75, "Salvage removes the Silo and refunds 75%")
	check(sim.players[1].supply_cap == cap - 8, "Salvage removes both the original and reinforced supply")

	var vehicle: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(42, 24))
	vehicle.hp -= 12.0
	sim.issue_command([worker.tag], "hold_position")
	check(sim.issue_command([worker.tag], "auto_repair").ok, "A Pioneer can enable auto-repair")
	sim.step_ticks(80)
	check(vehicle.hp < vehicle.max_hp, "Auto-repair respects an explicit hold order")
	sim.issue_command([worker.tag], "stop")
	sim.step_ticks(100)
	check(vehicle.hp == vehicle.max_hp and sim.players[1].crystal < crystal + 75, "An idle Pioneer pays to repair nearby friendly machinery")
	print("Command power checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
