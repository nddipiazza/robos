extends SceneTree

# Geometry proof supplements the API playthroughs: every ordered pair of starts
# must have a land route, and every smoothed segment must respect the waterways.
func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.load_scenario_file("frontier-hunters")
	sim.units.clear()
	sim._rebuild_astar_grid()
	var failures: Array = []
	var starts: Array = sim.match_state.starts
	var routes = 0
	for a in starts:
		var from = Vector2(float(a.x), float(a.y))
		if sim.is_water_at(from, 5):
			failures.append("Start overlaps water: %s" % from)
		for b in starts:
			if a == b:
				continue
			var target = Vector2(float(b.x), float(b.y))
			var path = sim.compute_smooth_path(from, target, 0.85)
			var previous = from
			for point in path:
				if not sim._has_clear_line_of_walk(previous, point, 0.0):
					failures.append("Water crossing in route %s -> %s at %s -> %s" % [from, target, previous, point])
				previous = point
			routes += 1
	for resource in sim.resources.values():
		if sim.is_water_at(resource.pos, resource.radius):
			failures.append("Resource overlaps water: %s" % resource.id)
	print(JSON.stringify({"routes_checked": routes, "map_width": sim.map_width, "water_cells": sim.water_cells.size(), "failures": failures}))
	quit(0 if failures.is_empty() else 1)
