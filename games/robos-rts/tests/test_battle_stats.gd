extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	var failures: Array = []
	sim.load_scenario_dict({"mode": "unit_battle", "map": {"width": 96, "height": 64}, "units": [
		{"type": "rifleman", "owner": 1, "x": 30, "y": 32},
		{"type": "breacher", "owner": 2, "x": 50, "y": 32, "hp": 5, "shields": 3}]})
	sim.start_unit_battle()
	var attacker = sim.units[1001]
	var target = sim.units[1002]
	# An explicit tiny fixture: 12 raw = 3 shields + 5 HP + 1 armor + 3 overkill.
	sim.tick = 64
	sim._apply_damage_to_target(attacker, target, 12.0, {}, 1.0, true)
	sim._check_match_result()
	var report = sim.match_state.results
	var blue = report.sides["1"]
	if blue.hp_damage != 5 or blue.shield_damage != 3 or blue.overkill != 3 or blue.armor_blocked != 1 or blue.splash_damage != 8 or blue.direct_damage != 0:
		failures.append("HP/shield/armor/overkill/splash accounting is incorrect")
	if blue.crystal_destroyed != 100 or blue.aether_destroyed != 25 or blue.supply_destroyed != 2 or report.units.size() != 2:
		failures.append("Dead-unit value or retained roster is incorrect")
	var frozen = report.duplicate(true)
	sim.step_ticks(128)
	if sim.match_state.results != frozen:
		failures.append("A finished report changed after completion")
	sim.reset_unit_battle()
	if sim.match_state.has("results") or not sim.battle_stats.records.is_empty():
		failures.append("Reset retained telemetry")
	# Measure actual shield restoration, including the cap, rather than estimating it.
	sim.load_scenario_dict({"mode": "unit_battle", "units": [
		{"type": "rifleman", "owner": 1, "x": 30, "y": 32},
		{"type": "skirmisher", "owner": 2, "x": 50, "y": 32}]})
	sim.start_unit_battle()
	attacker = sim.units[1001]
	target = sim.units[1002]
	sim._apply_damage_to_target(attacker, target, 12.0, {}, 1.0)
	target.out_of_combat_timer = 4.0
	sim._update_unit_timers(target, 1.0)
	if sim.battle_stats.records[target.tag].shields_regenerated != 6.0:
		failures.append("Shield restoration was not measured")
	# A cancelled paid foundation is neither a combat casualty nor surviving value.
	sim.load_scenario_dict({"paused":true,"victory":"all_structures","players":{"1":{"crystal":500}},"units":[
		{"type":"pioneer","owner":1,"x":35,"y":35},{"type":"silo","owner":1,"x":20,"y":50},
		{"type":"brood_nest","owner":2,"x":100,"y":80}]})
	sim.battle_stats.begin(sim.units,sim.tick)
	sim.issue_command([1001],"build_muster_hall",Vector2(40,35))
	sim.step_ticks(2*64)
	sim.issue_command([1001],"cancel_build")
	report = sim.battle_stats.finish(sim.units,sim.tick,42)
	blue = report.sides["1"]
	if blue.cancelled != 1 or blue.refunded_crystal != 112 or blue.lost != 0 or blue.crystal_lost != 0 or blue.surviving_crystal != 150:
		failures.append("Cancelled construction polluted combat loss/refund/survivor accounting")
	print(JSON.stringify({"suite":"battle_stats", "failures": failures, "checked": ["overkill", "armor", "HP", "shields", "splash", "resource values", "freeze", "reset", "regeneration", "construction refunds"]}))
	quit(0 if failures.is_empty() else 1)
