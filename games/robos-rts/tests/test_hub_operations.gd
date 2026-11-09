extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	sim.load_scenario_dict({"paused": true, "fog_of_war": true, "map": {"width": 104, "height": 64},
		"units": [
			{"type": "colony_hub", "owner": 1, "x": 22, "y": 22},
			{"type": "colony_hub", "owner": 1, "x": 22, "y": 45},
			{"type": "silo", "owner": 1, "x": 36, "y": 19},
			{"type": "muster_hall", "owner": 1, "x": 36, "y": 33, "build_progress": 0.9},
			{"type": "pioneer", "owner": 1, "x": 41, "y": 33}
		]})
	var units: Array = sim.units.values()
	var hub: Dictionary = units[0]
	var backup: Dictionary = units[1]
	var silo: Dictionary = units[2]
	var hall: Dictionary = units[3]
	var builder: Dictionary = units[4]
	var player: Dictionary = sim.players[1]
	_check(not sim.issue_command([hub.tag], "upgrade_hub").ok and player.crystal == 400, "An unfinished Muster Hall cannot unlock the paid upgrade")
	_check(sim.issue_command([builder.tag], "resume_construction", hall.pos, hall.tag).ok, "A Pioneer completes the tech prerequisite")
	sim.step_ticks(160)
	_check(hall.build_progress == 1.0, "The Muster Hall is complete")
	_check(sim.issue_command([hub.tag], "train_pioneer").ok and sim.issue_command([hub.tag], "upgrade_hub").ok, "An existing worker and the paid upgrade share the normal Hub queue")
	_check(player.crystal == 200 and player.aether == 100 and hub.production_queue[1].get("upgrade") == "hub_operations", "The exact upgrade costs are reserved behind worker production")
	_check(not sim.issue_command([hub.tag], "upgrade_hub").ok, "The upgrade cannot be queued twice on the same Hub")
	_check(sim.issue_command([hub.tag], "cancel_training", Vector2.ZERO, 0, "1").ok and player.crystal == 350 and player.aether == 150, "Canceling refunds only the upgrade")
	_check(sim.issue_command([hub.tag], "upgrade_hub").ok, "The paid upgrade can be requeued after a cancel")
	sim.step_ticks(850)
	_check(hub.get("hub_operations", false) and not backup.get("hub_operations", false), "Only the paying Hub upgrades after completing the queue")
	_check(not sim.issue_command([hub.tag], "upgrade_hub").ok and hub.production_queue.is_empty(), "The completed upgrade cannot be bought again")
	var stored_energy: float = hub.energy
	_check(stored_energy > 50.0 and sim.issue_command([hub.tag], "recon_sweep", Vector2(76, 22)).ok and hub.energy == stored_energy - 50.0, "The upgraded Hub retains accumulated energy and Recon Sweep")
	var capacity: int = player.supply_cap
	sim.step_ticks(70 * 64)
	_check(sim.issue_command([hub.tag], "reinforce_supply", silo.pos, silo.tag).ok and player.supply_cap == capacity + 8, "The upgraded Hub can still reinforce supply")
	print("Hub operations: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
