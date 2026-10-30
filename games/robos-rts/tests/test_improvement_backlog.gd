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
	var catalog: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/improvement-backlog.json"))
	var ids: Array = []
	var completed: Array = []
	for task in catalog.tasks:
		check(not ids.has(task.id) and not str(task.id).is_empty(), "Backlog IDs must be unique")
		ids.append(task.id)
		check(task.status in ["todo", "done"] and task.priority in ["P0", "P1", "P2"] and task.acceptance.size() > 0, "Every todo needs status, priority and completion checks")
		if task.status == "done":
			completed.append(task.id)
			check(not task.evidence.is_empty(), "Completed work must have verification")
			for file in task.evidence:
				check(FileAccess.file_exists("res://" + file), "Completed evidence must exist: " + file)
	check(ids.size() >= 20 and ids.has("frame-budget") and ids.has("fog-of-war") and ids.has("save-resume"), "Backlog covers foundational gaps, not only cosmetic work")
	for id in ["army-selection", "queue-cancel", "resource-rallies"]:
		check(completed.has(id), "The first batch must actually ship: " + id)
	var backlog = load("res://scripts/RTSImprovementBacklog.gd").new()
	main.backlog = backlog
	main.add_child(backlog)
	check(backlog.filtered.size() == catalog.tasks.size(), "Empty search shows the entire backlog")
	backlog._set_status(2)
	check(backlog.filtered.size() == completed.size(), "Done filter shows only shipped work")
	backlog.search.text = "refund"
	backlog._rebuild()
	check(backlog.filtered.size() == 1 and backlog.filtered[0].id == "queue-cancel", "Search finds completion criteria as well as titles")
	backlog.search.text = "no-such-feature-xyz"
	backlog._rebuild()
	check(backlog.filtered.is_empty(), "Empty filter results do not retain a stale task")
	backlog.search.text = ""
	backlog._set_status(1)
	check(backlog.filtered.size() == catalog.tasks.size() - completed.size(), "Todo filter excludes shipped work")
	for i in range(backlog.category.item_count):
		if backlog.category.get_item_text(i) == "Performance":
			backlog.category.select(i)
	backlog._rebuild()
	check(backlog.filtered.size() == 1 and backlog.filtered[0].id == "frame-budget", "Area filter isolates the relevant next work")
	sim.paused = false
	backlog.open()
	check(sim.paused, "Backlog pauses normal play")
	backlog.close()
	check(not sim.paused, "Closing backlog restores normal play")
	sim.paused = true
	backlog.open()
	backlog.close()
	check(sim.paused, "Backlog does not unpause a previously paused mission")
	sim.load_scenario_dict({"paused": true, "map": {"width": 256, "height": 256}, "units": [
		{"type": "rifleman", "owner": 1, "x": 20, "y": 20},
		{"type": "pioneer", "owner": 1, "x": 25, "y": 20},
		{"type": "howitzer_emplaced", "owner": 1, "x": 220, "y": 180},
		{"type": "colony_hub", "owner": 1, "x": 40, "y": 40},
		{"type": "rifleman", "owner": 2, "x": 80, "y": 20},
		{"type": "rifleman", "owner": 1, "x": 30, "y": 30, "hp": 0}]})
	main.pending_ability = "move"
	var key := InputEventKey.new()
	key.keycode = KEY_F3
	key.pressed = true
	main._handle_hotkey(key)
	check(main.selected_tags == [1001, 1003] and main.pending_ability == "", "F3 selects living owned combat units, including offscreen siege, but not workers/buildings/enemies")
	_cancel(sim, main)
	_rallies(sim, main)
	print(JSON.stringify({"suite": "improvement_backlog", "checks": checks, "failures": failures}))
	main.queue_free()
	quit(0 if failures.is_empty() else 1)

func _cancel(sim: Node, main: Node) -> void:
	sim.load_scenario_dict({"paused": true, "victory": "all_structures", "players": {"1": {"crystal": 1000, "aether": 250}}, "units": [
		{"type": "colony_hub", "owner": 1, "x": 20, "y": 20},
		{"type": "muster_hall", "owner": 1, "x": 40, "y": 20},
		{"type": "workshop", "owner": 1, "x": 55, "y": 20},
		{"type": "silo", "owner": 1, "x": 20, "y": 35},
		{"type": "brood_nest", "owner": 2, "x": 110, "y": 70}]})
	for command in ["train_rifleman", "train_breacher", "train_rifleman"]:
		sim.issue_command([1002], command)
	sim.step_ticks(3 * 64)
	var producer: Dictionary = sim.units[1002]
	var progress: float = producer.production_queue[0].progress
	check(sim.issue_command([1002], "cancel_train", Vector2.ZERO, 0, "1").accepted == 1, "Waiting queue item can be cancelled")
	check(sim.players[1].crystal == 900 and sim.players[1].aether == 250 and sim.players[1].supply_used == 2, "Cancel refunds paid crystal/aether and reserved supply exactly")
	check(producer.production_queue.size() == 2 and producer.production_queue[0].progress == progress, "Removing a waiting item preserves current progress and other entries")
	for invalid in ["-1", "2", "oops"]:
		check(sim.issue_command([1002], "cancel_train", Vector2.ZERO, 0, invalid).accepted == 0 and sim.players[1].crystal == 900, "Invalid cancellation cannot create a refund")
	main._select_tags([1001])
	main.cancel_selected_production(1002, 0)
	check(producer.production_queue.size() == 2, "UI cancellation cannot affect an unselected producer")
	main._select_tags([1002])
	main.cancel_selected_production(1002, 0)
	check(producer.production_queue.size() == 1 and producer.production_queue[0].progress == 0 and sim.players[1].crystal == 950, "Cancelling the active item starts the next at zero and refunds only that item")
	sim.step_ticks(18 * 64)
	var rifles := 0
	for unit in sim.units.values():
		if unit.unit_type == "rifleman":
			rifles += 1
	check(rifles == 1 and producer.production_queue.is_empty(), "Cancelled units never spawn; remaining paid unit completes normally")
	check(sim.issue_command([1002], "cancel_train").accepted == 0 and sim.players[1].crystal == 950, "Empty queue cannot refund a completed unit")

func _rallies(sim: Node, main: Node) -> void:
	sim.load_scenario_dict({"paused": true, "victory": "all_structures", "players": {"1": {"crystal": 1000, "aether": 0}},
		"resources": [{"type": "crystal_field", "x": 12, "y": 20, "amount": 1500}, {"type": "crystal_field", "x": 70, "y": 20, "amount": 1500}, {"type": "aether_vent", "x": 45, "y": 60, "amount": 1500}],
		"units": [{"type": "colony_hub", "owner": 1, "x": 28, "y": 20}, {"type": "aether_tap", "owner": 1, "x": 45, "y": 60}, {"type": "brood_nest", "owner": 2, "x": 110, "y": 70}]})
	main._select_tags([1004])
	main._issue_smart_right_click(Vector2(70, 20), false)
	check(sim.units[1004].rally_target_tag == 1002, "Smart right-click stores the chosen crystal target")
	sim.issue_command([1004], "train_pioneer")
	sim.step_ticks(12 * 64)
	check(sim.units[1007].orders[0].type == "harvest" and sim.units[1007].orders[0].target_tag == 1002, "New worker honors chosen resource instead of nearest crystal")
	sim.step_ticks(20 * 64)
	check(sim.players[1].crystal_collected >= 5, "Resource rally produces real delivered income")
	sim.issue_command([1004], "rally", Vector2(90, 40))
	sim.issue_command([1004], "train_pioneer")
	sim.step_ticks(12 * 64)
	check(sim.units[1008].orders[0].type == "move" and sim.units[1008].orders[0].target_pos == Vector2(90, 40), "Explicit ground rally is not overwritten by automatic harvesting")
	main._issue_smart_right_click(Vector2(45, 60), false, sim.units[1005])
	sim.issue_command([1004], "train_pioneer")
	sim.step_ticks(12 * 64)
	check(sim.units[1009].orders[0].type == "harvest" and sim.units[1009].orders[0].target_tag == 1005, "Worker rally can target a completed friendly Aether Tap")
	sim.step_ticks(30 * 64)
	check(sim.players[1].aether_collected >= 4, "Aether rally produces real delivered income")
	sim.resources[1002].amount = 0
	sim.issue_command([1004], "rally", Vector2(70, 20), 1002)
	sim.issue_command([1004], "train_pioneer")
	sim.step_ticks(12 * 64)
	check(sim.units[1010].orders[0].type == "harvest" and sim.units[1010].orders[0].target_tag == 1001, "Depleted rally falls back to a usable deposit")
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(60, 40))
	sim.issue_command([hall.tag], "rally", Vector2(12, 20), 1001)
	sim.issue_command([hall.tag], "train_rifleman")
	sim.step_ticks(18 * 64)
	check(sim.units[1012].orders[0].type == "move", "Soldiers rallied to resources move rather than harvest")
