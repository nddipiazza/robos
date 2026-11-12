extends SceneTree

# Geometry proof supplements the API playthroughs: every ordered pair of starts
# must have a land route, and every smoothed segment must respect the waterways.
func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.start_online_match("frontier-hunters", 3, ["humans", "monsters"], true)
	sim.units.clear()
	sim._rebuild_astar_grid()
	var failures: Array = []
	var starts: Array = sim.match_state.starts
	var expansions: Array = sim.match_state.expansions
	if sim.map_width != 256.0 or sim.map_height != 256.0 or starts.size() != 8 or expansions.size() != 10 or sim.land_bridges.size() != 12:
		failures.append("Frontier Hunters layout dimensions or site counts changed")
	var routes = 0
	for site in starts + expansions:
		var center := Vector2(float(site.x), float(site.y))
		for hall in ["colony_hub", "brood_nest", "heartstone"]:
			if not sim.can_place_structure(hall, center):
				failures.append("%s cannot fit at %s" % [hall, center])
	for a in starts:
		var from = Vector2(float(a.x), float(a.y))
		if sim.is_water_at(from, 5):
			failures.append("Start overlaps water: %s" % from)
		if not _has_production_space(sim, from):
			failures.append("No dry production and add-on site near %s" % from)
		for b in starts + expansions:
			if a == b:
				continue
			var target = Vector2(float(b.x), float(b.y))
			var path = sim.compute_smooth_path(from, target, 0.85)
			if path.is_empty() or not path.back().is_equal_approx(target):
				failures.append("Route stops short: %s -> %s" % [from, target])
			var previous = from
			for point in path:
				if not sim._has_clear_line_of_walk(previous, point, 0.85):
					failures.append("Blocked segment in route %s -> %s at %s -> %s" % [from, target, previous, point])
				previous = point
			routes += 1
	var sites := starts + expansions
	var resource_routes := 0
	for resource in sim.resources.values():
		if sim.is_water_at(resource.pos, resource.radius):
			failures.append("Resource overlaps water: %s" % resource.id)
		if resource.resource_type == "aether_vent" and not sim.can_place_structure("aether_tap", resource.pos):
			failures.append("Gas extractor cannot fit on %s" % resource.id)
		var base: Dictionary = sites[int(resource.id.split("_")[1])]
		var reach: float = resource.radius + 1.5
		var path: Array = sim.compute_smooth_path(Vector2(base.x, base.y), resource.pos, 0.7, false, reach)
		if path.is_empty() or path.back().distance_to(resource.pos) > reach:
			failures.append("Worker cannot reach %s" % resource.id)
		resource_routes += 1
	print(JSON.stringify({"routes_checked": routes, "resource_routes": resource_routes, "map_width": sim.map_width, "water_cells": sim.water_cells.size(), "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _has_production_space(sim: Node, base: Vector2) -> bool:
	for radius in [11.0, 16.0, 22.0]:
		for index in range(16):
			var site: Vector2 = base + Vector2.from_angle(TAU * float(index) / 16.0) * radius
			var pad: Vector2 = site + sim.ATTACHMENT_PAD_OFFSET
			if sim.can_place_structure("muster_hall", site) and sim.can_place_structure("research_module", pad):
				return true
	return false
