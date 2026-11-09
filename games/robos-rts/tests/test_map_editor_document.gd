extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var Model = load("res://scripts/editor/RTSMapDocument.gd")
	var doc = Model.new()
	var source: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/frontier-hunters.jsonld"))
	source["campaign"] = {"mission": "arrival", "objectives": [{"id": "hold_crossing", "event": "area_control", "target": 9}]}
	source["map"]["multiplayer"] = {"slots": 8, "teams": [1, 2], "version": 3}
	source["map"]["watch_stations"] = [{"x": 60, "y": 68}]
	source["map"]["route_blockers"] = [{"x": 52, "y": 40, "id": "shale_cut"}]
	source["players"] = {"1": {"faction": "humans", "team": "alpha"}, "8": {"faction": "aliens", "team": "beta", "controller": "network"}}
	source["units"] = [{"type": "pioneer", "owner": 1, "x": 32, "y": 32, "mission_tag": "hero", "build_progress": 1.0}]
	doc.load_scenario(source)
	var failures: Array = []
	var exported: Dictionary = doc.to_scenario()
	if exported.campaign != source.campaign or exported.map.multiplayer != source.map.multiplayer:
		failures.append("Campaign and multiplayer metadata was lost")
	if exported.map.watch_stations != source.map.watch_stations:
		failures.append("Watch station placements were lost")
	if exported.map.route_blockers != source.map.route_blockers:
		failures.append("Route blocker placements were lost")
	if exported.players["8"] != source.players["8"] or exported.players["1"].team != "alpha" or exported.units[0].mission_tag != "hero":
		failures.append("Player slots or unit metadata was lost")
	doc.set_map_property("label", "Edited Hunters")
	exported = doc.to_scenario()
	var sites: int = source.map.starts.size() + source.map.expansions.size()
	if exported.name != "Edited Hunters" or exported.map.starts != source.map.starts or exported.map.expansions != source.map.expansions or exported.resources.size() != sites * 10:
		failures.append("Editable map fields did not round-trip")
	doc.paint_terrain(Vector2(96, 112), "water", 1)
	var round_trip = Model.new()
	round_trip.load_scenario(doc.to_scenario())
	if round_trip.to_scenario() != doc.to_scenario():
		failures.append("Save/reload changed the document")
	doc.undo()
	if not doc.data.terrain_tiles.is_empty():
		failures.append("Undo failed to restore terrain")
	doc.redo()
	if doc.data.terrain_tiles.size() != 1:
		failures.append("Redo failed to restore terrain")
	doc.paint_terrain(Vector2(100, 112), "brush", 1)
	round_trip.load_scenario(doc.to_scenario())
	if round_trip.terrain_at(Vector2i(25, 28)) != "brush":
		failures.append("Brush painting did not survive a map round-trip")
	var large = Model.new()
	large.new_blank(256, 256)
	if large.fill_terrain(Vector2(4, 4), "water") != 4096:
		failures.append("Large fill did not cover the map")
	var sim = root.get_node("SimEngine")
	sim.load_scenario_dict(large.to_scenario())
	if sim.water_cells.size() != 16384 or sim.water_polygons.size() > 64:
		failures.append("Large fill did not compile into bounded terrain geometry")
	print(JSON.stringify({"map_document_roundtrip": true, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
