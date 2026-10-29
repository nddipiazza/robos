extends SceneTree

var failures: Array = []
var checks := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)

func mouse(main: Node, pos: Vector2, pressed: bool, double_click := false, shift := false) -> void:
	var event := InputEventMouseButton.new()
	event.position = pos
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	event.double_click = double_click
	event.shift_pressed = shift
	main._on_mouse_button(event)

func double_click(main: Node, pos: Vector2, shift := false) -> void:
	mouse(main, pos, true)
	mouse(main, pos, false)
	mouse(main, pos, true, true, shift)
	# Native release events do not repeat the double-click flag.
	mouse(main, pos, false)

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	var main = load("res://scripts/RTSMain.gd").new()
	root.add_child(main)
	sim.load_scenario_dict({"paused": true, "map": {"width": 256, "height": 256}, "units": [
		{"type": "rifleman", "owner": 1, "x": 20, "y": 20},
		{"type": "rifleman", "owner": 1, "x": 25, "y": 20},
		{"type": "rifleman", "owner": 1, "x": 220, "y": 120},
		{"type": "rifleman", "owner": 2, "x": 30, "y": 35},
		{"type": "breacher", "owner": 1, "x": 18, "y": 32},
		{"type": "muster_hall", "owner": 1, "x": 40, "y": 20},
		{"type": "muster_hall", "owner": 1, "x": 50, "y": 20},
		{"type": "muster_hall", "owner": 1, "x": 210, "y": 140},
		{"type": "muster_hall", "owner": 2, "x": 70, "y": 20},
		{"type": "workshop", "owner": 1, "x": 60, "y": 25}]})
	double_click(main, Vector2(270, 270))
	check(main.selected_tags == [1001, 1002, 1003], "Double press selects matching owned Riflemen, including offscreen, after a plain release")
	double_click(main, Vector2(540, 270))
	check(main.selected_tags == [1006, 1007, 1008], "Structures use the same type selection, without enemies or other buildings")
	main._select_tags([1005])
	mouse(main, Vector2(270, 270), true, true, true)
	mouse(main, Vector2(270, 270), false)
	check(main.selected_tags == [1005, 1001, 1002, 1003], "Shift double-click adds the matching class")
	double_click(main, Vector2(405, 472.5))
	check(main.selected_tags == [1004], "Enemy inspection must not select a controllable enemy army")
	var bounds := Rect2(0, 0, 1920, 1080)
	for entry in [[Vector2(0, 500), Vector2.LEFT], [Vector2(1919, 500), Vector2.RIGHT],
		[Vector2(960, 0), Vector2.UP], [Vector2(960, 1079), Vector2.DOWN],
		[Vector2(1919, 0), Vector2(1, -1)], [Vector2(960, 540), Vector2.ZERO],
		[Vector2(-1, 540), Vector2.ZERO], [Vector2(1920, 540), Vector2.ZERO]]:
		check(main._edge_scroll_direction(entry[0], bounds) == entry[1], "Edge direction/inside-window contract: %s" % entry[0])
	main.mouse_scroll_speed = 50
	var keyboard: Vector2 = main._camera_pan_delta(Vector2.RIGHT, Vector2.ZERO, 50.0, 1.0)
	var normal: Vector2 = main._camera_pan_delta(Vector2.ZERO, Vector2.RIGHT, 50.0, 1.0)
	check(keyboard.is_equal_approx(Vector2(46, 0)) and normal.is_equal_approx(keyboard), "Default edge speed matches arrow keys")
	main.mouse_scroll_speed = 100
	check(main._camera_pan_delta(Vector2.ZERO, Vector2.RIGHT, 50.0, 1.0).is_equal_approx(normal * 2), "Mouse speed scales independently")
	check(main._camera_pan_delta(Vector2.RIGHT, Vector2.RIGHT, 50.0, 1.0).is_equal_approx(keyboard), "Mouse setting must not accelerate arrow-key input")
	check(is_equal_approx(main._camera_pan_delta(Vector2.ZERO, Vector2(1, 1), 50.0, 1.0).length(), 92), "Corners must not scroll faster diagonally")
	check(main._camera_pan_delta(Vector2.ZERO, Vector2.RIGHT, 100.0, 0.5).is_equal_approx(normal * 2), "Zoom and frame duration scale panning")
	main.mouse_scroll_speed = 0
	check(main._camera_pan_delta(Vector2.ZERO, Vector2.RIGHT, 50.0, 1.0) == Vector2.ZERO, "Zero disables edge scrolling")
	check(main._camera_pan_delta(Vector2.RIGHT, Vector2.ZERO, 50.0, 1.0) == keyboard, "Disabling edge scroll keeps arrow keys working")
	_production(sim, main)
	_construction(sim, main)
	print(JSON.stringify({"suite": "player_controls", "checks": checks, "failures": failures}))
	main.queue_free()
	quit(0 if failures.is_empty() else 1)

func press_training(main: Node, ability: String, release := true) -> void:
	for button in main.get_card_buttons():
		if button.ability_id == ability:
			var event := InputEventKey.new()
			event.keycode = OS.find_keycode_from_string(button.def.hotkey)
			event.pressed = true
			main._handle_hotkey(event)
			if release:
				event.pressed = false
				main._input(event)
			return
	check(false, "Missing training command: " + ability)

func _production(sim: Node, main: Node) -> void:
	var data := {"victory": "all_structures", "paused": true, "map": {"width": 128, "height": 96},
		"players": {"1": {"crystal": 10000, "aether": 2000}}, "units": [
		{"type": "colony_hub", "owner": 1, "x": 20, "y": 20},
		{"type": "muster_hall", "owner": 1, "x": 35, "y": 20},
		{"type": "muster_hall", "owner": 1, "x": 45, "y": 20},
		{"type": "workshop", "owner": 1, "x": 55, "y": 20},
		{"type": "muster_hall", "owner": 1, "x": 65, "y": 20, "build_progress": 0.5},
		{"type": "brood_nest", "owner": 2, "x": 110, "y": 70},
		{"type": "muster_hall", "owner": 1, "x": 75, "y": 20},
		{"type": "silo", "owner": 1, "x": 20, "y": 35, "count": 5, "spread": 5}]}
	sim.load_scenario_dict(data)
	main._select_tags([1001, 1002, 1003, 1004, 1005])
	var abilities: Array = []
	var keys: Array = []
	for button in main.get_card_buttons():
		abilities.append(button.ability_id)
		check(not keys.has(button.def.hotkey), "Mixed producers need unique displayed hotkeys")
		keys.append(button.def.hotkey)
	for ability in ["train_pioneer", "train_rifleman", "train_breacher", "train_howitzer"]:
		check(abilities.has(ability), "Mixed production card contains " + ability)
	for _i in range(3):
		press_training(main, "train_rifleman")
	check(sim.units[1002].production_queue.size() == 2 and sim.units[1003].production_queue.size() == 1, "Repeated clicks/hotkeys distribute across compatible producers")
	press_training(main, "train_breacher")
	press_training(main, "train_howitzer")
	press_training(main, "train_pioneer")
	check(sim.units[1004].production_queue[0].unit_type == "howitzer" and sim.units[1001].production_queue[0].unit_type == "pioneer", "Conflicting default hotkeys can independently train both types")
	check(sim.units[1005].production_queue.is_empty() and sim.units[1007].production_queue.is_empty(), "Incomplete or unselected producers receive no units")
	check(sim.players[1].crystal == 9550 and sim.players[1].aether == 1850, "Every selected production command pays its normal cost exactly once")
	check(root.get_node("RTSData").get_ability_def("train_howitzer").hotkey == "S", "Selection hotkey remapping must not mutate the registry")
	check(main.ui_state().production.size() == 5, "Combined queue view includes every selected producer")
	for _i in range(6):
		press_training(main, "train_rifleman")
	var money: int = sim.players[1].crystal
	press_training(main, "train_rifleman", false)
	main._advance_training_repeat(0.25)
	main._advance_training_repeat(0.1)
	check(sim.units[1002].production_queue.size() == 5 and sim.units[1003].production_queue.size() == 5 and sim.players[1].crystal == money, "Full queues prevent extra orders and payment")
	sim.load_scenario_dict(data)
	main._select_tags([1002, 1003])
	press_training(main, "train_rifleman", false)
	check(sim.units[1002].production_queue.size() == 1, "Held key trains once immediately")
	main._advance_training_repeat(0.25)
	main._advance_training_repeat(0.099)
	check(sim.units[1003].production_queue.is_empty(), "No repeat before 350 ms")
	main._advance_training_repeat(0.001)
	check(sim.units[1003].production_queue.size() == 1, "First repeat at 350 ms")
	main._advance_training_repeat(0.074)
	check(sim.units[1002].production_queue.size() == 1, "Repeat interval must not fire early")
	main._advance_training_repeat(0.001)
	check(sim.units[1002].production_queue.size() == 2, "Further repeats occur every 75 ms")
	var released := InputEventKey.new()
	released.keycode = KEY_A
	released.pressed = false
	main._input(released)
	main._advance_training_repeat(1.0)
	check(sim.units[1003].production_queue.size() == 1, "Releasing immediately ends repeat")
	press_training(main, "train_rifleman", false)
	main._select_tags([1001])
	main._advance_training_repeat(1.0)
	check(sim.units[1001].production_queue.is_empty(), "Selection changes cancel the held training command")
	check(main.get_card_buttons().size() == 2, "Single producer keeps its normal train and rally card")

func _construction(sim: Node, main: Node) -> void:
	sim.load_scenario_dict({"victory": "all_structures", "paused": true, "players": {"1": {"crystal": 1000, "aether": 0}}, "units": [
		{"type": "pioneer", "owner": 1, "x": 35, "y": 40},
		{"type": "pioneer", "owner": 1, "x": 35, "y": 45},
		{"type": "colony_hub", "owner": 1, "x": 20, "y": 40},
		{"type": "brood_nest", "owner": 2, "x": 110, "y": 70},
		{"type": "silo", "owner": 1, "x": 20, "y": 55}]})
	check(sim.issue_command([1001], "build_muster_hall", Vector2(40, 40)).accepted == 1, "Builder accepts a paid valid foundation")
	sim.step_ticks(64)
	var site: Dictionary = sim.units[1006]
	var before: float = site.build_progress
	mouse(main, Vector2(472.5, 540), true)
	mouse(main, Vector2(472.5, 540), false)
	check(main.get_card_buttons().size() >= 5, "Selecting one builder retains its construction and Stop commands")
	sim.step_ticks(64)
	check(site.build_progress > before and sim.units[1001].orders[0].type == "build", "Clicking the builder preserves ongoing construction")
	check(sim.issue_command([1001], "move", Vector2(10, 10)).accepted == 0, "Moving cannot silently replace an active build")
	check(sim.issue_command([1001], "hold_position").accepted == 0, "Only Stop/Halt interrupts active building")
	check(sim.issue_command([1002], "resume_build", site.pos, site.tag).accepted == 0, "A second worker cannot overwrite the active builder")
	check(sim.issue_command([1001], "halt").accepted == 1, "Halt explicitly releases the builder")
	before = site.build_progress
	sim.step_ticks(64)
	check(is_equal_approx(site.build_progress, before), "An abandoned foundation retains and freezes progress")
	main._select_tags([1002])
	main._issue_smart_right_click(site.pos, false, site)
	check(sim.units[1002].orders[0].get("structure_tag", 0) == site.tag, "Right-click on unfinished structure resumes the same foundation")
	check(sim.issue_command([1002], "resume_build", site.pos, site.tag, "", true).accepted == 1 and sim.units[1002].orders.size() == 1, "Repeated resume is idempotent")
	sim.step_ticks(2 * 64)
	check(site.build_progress > before and sim.players[1].crystal == 850, "Replacement worker advances construction without charging again")
	check(sim.issue_command([1002], "move", Vector2(20, 45), 0, "", true).accepted == 1 and sim.units[1002].orders[0].type == "build", "A queued follow-up preserves construction")
	sim.step_ticks(48 * 64)
	check(site.build_progress == 1.0 and sim.players[1].structures_built == 1, "Resumed structure completes once within its build duration")
	check(sim.units[1002].pos.distance_to(Vector2(20, 45)) < 3.0, "Queued follow-up runs after construction completes")
	check(sim.issue_command([1001], "resume_build", site.pos, site.tag).accepted == 0, "Finished structures cannot resume or duplicate completion")
