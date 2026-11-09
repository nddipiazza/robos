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
	_test_prospector(sim)
	print("Hub operations: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_prospector(sim: Node) -> void:
	sim.load_scenario_dict({"paused": true, "fog_of_war": true, "map": {"width": 104, "height": 64},
		"units": [{"type": "colony_hub", "owner": 1, "x": 20, "y": 22},
			{"type": "muster_hall", "owner": 1, "x": 23, "y": 38}],
		"resources": [{"type": "crystal_field", "x": 34, "y": 21, "amount": 21},
			{"type": "aether_vent", "x": 36, "y": 35}, {"type": "crystal_field", "x": 88, "y": 30}]})
	var hub: Dictionary = sim.units.values().front()
	var deposits: Array = sim.resources.values()
	var patch: Dictionary = deposits[0]
	var gas: Dictionary = deposits[1]
	var hidden: Dictionary = deposits[2]
	_check(not sim.issue_command([hub.tag], "deploy_prospector", patch.pos, patch.tag).ok and hub.energy == 50.0, "An unupgraded Hub cannot spend energy on a Prospector")
	_check(sim.issue_command([hub.tag], "upgrade_hub").ok, "The Hub pays for its deployment upgrade")
	sim.step_ticks(480)
	var energy: float = hub.energy
	_check(not sim.issue_command([hub.tag], "deploy_prospector", gas.pos, gas.tag).ok, "The cast rejects gas vents")
	_check(not sim.issue_command([hub.tag], "deploy_prospector", hidden.pos, hidden.tag).ok and hub.energy == energy, "Hidden targets do not consume energy")
	var player: Dictionary = sim.players[1]
	var supply: int = player.supply_used
	_check(sim.issue_command([hub.tag], "deploy_prospector", patch.pos, patch.tag).ok and hub.energy == energy - 50.0, "One valid deployment spends exactly 50 energy")
	var helpers: Array = sim.units.values().filter(func(unit): return unit.unit_type == "prospector")
	_check(helpers.size() == 1 and player.supply_used == supply, "A Prospector occupies no supply")
	if helpers.is_empty():
		return
	var helper: Dictionary = helpers.front()
	_check(helper.expires_tick - sim.tick == 45 * 64 and helper.orders[0].target_tag == patch.tag, "The timed helper immediately harvests the marked crystal field")
	_check(not sim.issue_command([helper.tag], "harvest", gas.pos, gas.tag).ok, "The helper cannot harvest aether")
	_check(not sim.issue_command([helper.tag], "build_silo", Vector2(44, 28)).ok, "The helper cannot place a foundation")
	sim.step_ticks(150)
	_check(helper.cargo_amount == 10 or player.crystal_collected == 10, "A normal Prospector load carries double crystal")
	sim.step_ticks(1000)
	_check(patch.amount == 0 and player.crystal_collected == 21, "Every finite crystal load is delivered once, including the remainder")
	sim.step_ticks(int(helper.expires_tick) - sim.tick - 1)
	_check(sim.units.has(helper.tag), "The helper stays present until its exact final tick")
	sim.step_ticks(1)
	_check(not sim.units.has(helper.tag) and patch.mining_worker == 0 and player.supply_used == supply, "Expiry releases the mining slot without touching supply")

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
