extends SceneTree

var checks := 0
var failures: Array = []

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	var main = load("res://scripts/RTSMain.gd").new()
	root.add_child(main)
	# Layout is UI-free logic: do not initialize a renderer for this regression test.
	var hud = load("res://scripts/RTSHud.gd").new()
	hud.main = main
	for count in [100, 200]:
		sim.load_scenario_dict({"paused": true, "units": [{"type": "rifleman", "owner": 1, "count": count, "x": 20, "y": 20, "spread": 2}]})
		main._select_tags(sim.units.keys())
		var cells: Array = hud.selection_cells().duplicate(true)
		var builds: int = hud.selection_layout_builds
		for _frame in range(300):
			check(hud.selection_cells() == cells, "Stable large selections preserve cell geometry")
		check(hud.selection_layout_builds == builds, "Stable selection must not sort or rebuild layout each frame")
		check(cells.size() == 28 and cells[0].tag == 1001 and cells[27].tag == 1028, "Selection sorting and visible-cell cap remain unchanged")
		sim.units[1001].hp -= 5
		sim.units[1001].pos += Vector2(1, 1)
		check(hud.selection_cells() == cells and hud.selection_layout_builds == builds, "Health and movement stay live without invalidating layout")
		main.selected_tags.reverse()
		check(hud.selection_cells() == cells and hud.selection_layout_builds == builds + 1, "Changed selection order rebuilds once with stable sorted display")
		main.selected_tags.erase(1001)
		sim.units.erase(1001)
		cells = hud.selection_cells().duplicate(true)
		check(cells[0].tag == 1002, "Deaths cannot leave a stale portrait")
		# Explicit type change isolates morph invalidation from combat mechanics.
		sim.units[1002].unit_type = "sunblade"
		check(hud.selection_cells()[0].tag == 1003, "Unit type changes invalidate sorting")
	sim.load_scenario_dict({"paused": true, "units": [
		{"type": "muster_hall", "owner": 1, "x": 20, "y": 20, "count": 4, "spread": 10}]})
	main._select_tags(sim.units.keys())
	var cells: Array = hud.selection_cells().duplicate(true)
	check(cells[3].rect.position.y > cells[0].rect.position.y, "Production selection retains the three-column portrait layout")
	var builds: int = hud.selection_layout_builds
	sim.units[1001].build_progress = 0.5
	check(hud.selection_cells() == cells and hud.selection_layout_builds == builds, "Construction progress does not rebuild unchanged portrait geometry")
	sim.units[1001].owner = 2
	cells = hud.selection_cells()
	check(cells[3].rect.position.y == cells[0].rect.position.y, "Ownership changes invalidate production layout")
	main._select_tags([])
	check(hud.selection_cells().is_empty(), "Clearing selection removes every portrait")
	print(JSON.stringify({"suite": "selection_layout", "checks": checks, "failures": failures}))
	hud.free()
	main.queue_free()
	quit(0 if failures.is_empty() else 1)
