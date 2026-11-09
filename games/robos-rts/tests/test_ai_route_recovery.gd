extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var sides := {}
	for seed in [42, 2]:
		var result: Dictionary = sim.load_scenario_dict(_scenario(seed))
		if not result.ok:
			failures.append("Could not start route recovery match")
			break
		var ai_slot: int = result.match.assigned_starts["2"]
		if not sides.has(ai_slot):
			sides[ai_slot] = true
			_play_opening(ai_slot)
	if sides.size() != 2:
		failures.append("The opening must be tested from both banks")
	print("AI route recovery: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _scenario(seed: int) -> Dictionary:
	return {
		"mode": "skirmish", "seed": seed, "difficulty": "hard", "strategy": "rush",
		"ai_faction": "monsters", "unlimited_resources": true,
		"map": {
			"width": 120, "height": 96,
			"starts": [{"x": 24, "y": 48}, {"x": 96, "y": 48}],
			"water_channels": [{"width": 24, "points": [[60, 0], [60, 96]]}],
			"bridges": [{"x": 46, "y": 44, "w": 28, "h": 8}, {"x": 46, "y": 68, "w": 28, "h": 16}],
			"route_blockers": [{"x": 60, "y": 48, "id": "closed_crossing"}],
			"terrain_tiles": [
				{"x": 56, "y": 56, "terrain": "land"},
				{"x": 60, "y": 56, "terrain": "land"}
			]
		}
	}

func _play_opening(ai_slot: int) -> void:
	var start: Dictionary = sim.match_state.starts[1 - ai_slot]
	var enemy_base := Vector2(start.x, start.y)
	# This isolated player worker is a fixed distraction. All AI units and
	# structures come from the ordinary paid skirmish opening.
	sim.spawn_unit("pioneer", 1, Vector2(60, 58), "stranded_worker")
	var crystals_before_recovery := -1
	var recovered_tags := {}
	var crossed_bridge := {}
	var crossed := false
	for _second in range(240):
		sim.step_ticks(64)
		for unit in sim.units.values():
			if unit.owner != 2 or unit.is_structure or unit.is_worker:
				continue
			if not unit.orders.is_empty() and unit.orders[0].get("stay_on_route", false):
				recovered_tags[unit.tag] = true
				if crystals_before_recovery < 0:
					crystals_before_recovery = sim.players[2].crystal_collected
			if recovered_tags.has(unit.tag) and unit.pos.x > 52.0 and unit.pos.x < 68.0 and unit.pos.y >= 68.0:
				crossed_bridge[unit.tag] = true
			if crossed_bridge.has(unit.tag) and unit.pos.distance_to(enemy_base) < 18.0:
				crossed = true
		if crossed:
			break
	var bank := "west" if ai_slot == 0 else "east"
	print("%s bank: %d recovered troops, reached enemy=%s, crystal=%d -> %d" % [
		bank, recovered_tags.size(), crossed, crystals_before_recovery, sim.players[2].crystal_collected
	])
	if not crossed:
		failures.append("The paid opening did not recover and cross from the %s bank" % bank)
	if crystals_before_recovery < 0 or sim.players[2].crystal_collected <= crystals_before_recovery or sim.players[2].units_trained < 6:
		failures.append("The %s economy did not fund the opening and keep mining through recovery" % bank)
	if not sim.units.values().any(func(unit): return unit.id == "closed_crossing" and unit.hp == unit.max_hp):
		failures.append("The %s opening must route around the intact barrier" % bank)
