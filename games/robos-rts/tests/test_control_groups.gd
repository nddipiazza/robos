extends SceneTree

# Exercise the view's actual keyboard, box-selection and HUD click handlers.
class CameraProbe extends Node3D:
	var focus := Vector2.ZERO
	var focus_calls := 0
	var cam_height := 40.0
	func set_focus(pos: Vector2, _height: float = -1.0) -> void:
		focus = pos
		focus_calls += 1
	func get_focus() -> Vector2:
		return focus

var failures: Array[String] = []
var checks := 0
var main: Node2D

func _initialize() -> void:
	call_deferred("_run")

func check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failures.append(label)
		printerr("FAIL: " + label)

func key(number: int, ctrl: bool = false, shift: bool = false, echo: bool = false) -> void:
	var event := InputEventKey.new()
	event.keycode = KEY_0 + number
	event.pressed = true
	event.ctrl_pressed = ctrl
	event.shift_pressed = shift
	event.echo = echo
	main._unhandled_input(event)

func click_group(number: int, ctrl: bool = false, shift: bool = false) -> void:
	var rect: Rect2 = main.hud.group_tab_rects()[number]
	var event := InputEventMouseButton.new()
	event.position = rect.get_center()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.ctrl_pressed = ctrl
	event.shift_pressed = shift
	main._unhandled_input(event)

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.load_scenario_dict({"name": "Control groups", "paused": true, "decor": false,
		"map": {"width": 128, "height": 96}, "units": [
			{"type": "rifleman", "owner": 1, "x": 20, "y": 20},
			{"type": "breacher", "owner": 1, "x": 30, "y": 20},
			{"type": "colony_hub", "owner": 1, "x": 40, "y": 20},
			{"type": "rifleman", "owner": 2, "x": 50, "y": 20}]})
	var tags: Array = sim.units.keys()
	main = load("res://scripts/RTSMain.gd").new()
	root.add_child(main)
	main.hud = load("res://scripts/RTSHud.gd").new()
	main.hud.main = main
	var camera := CameraProbe.new()
	main.world_3d = camera
	check(main.hud.group_tab_rects().size() == 9, "All nine slots are discoverable before assignment")
	# Null camera gives deterministic screen projection for the selection fixture.
	main.world_3d = null
	main._complete_box_selection(Vector2(250, 250), Vector2(570, 300), false, false)
	check(main.selected_tags == [tags[0], tags[1]], "Box selects owned mobile units ahead of structures")
	main.world_3d = camera
	key(1, true)
	main._select_tags([tags[2]])
	key(1)
	check(main.selected_tags == [tags[0], tags[1]], "Recall replaces selection with the assigned squad")
	check(camera.focus_calls == 0, "First recall leaves camera in place")
	key(1)
	check(camera.focus == Vector2(20, 20), "Second consecutive recall focuses the first surviving member")
	key(9, true)
	key(1)
	check(camera.focus_calls == 1, "Assignment interrupts double-tap recall")
	main._select_tags([tags[2]])
	key(1, false, true)
	check(main.selected_tags == [tags[2], tags[0], tags[1]], "Shift recall adds without replacing selection")
	main._select_tags([tags[2]])
	key(1, true, true)
	key(1)
	check(main.selected_tags == [tags[0], tags[1], tags[2]], "Ctrl Shift appends selection to the stored group")
	key(1, true, true)
	check(main.control_groups[1].size() == 3, "Appending does not duplicate members")
	main._select_tags([])
	key(1, true, true)
	check(main.control_groups[1].size() == 3, "Appending empty selection preserves the group")
	for number in range(2, 10):
		main._select_tags([tags[2]])
		key(number, true)
		main._select_tags([tags[0]])
		key(number)
		check(main.selected_tags == [tags[2]], "Slot %d assigns and recalls structures" % number)
	main._select_tags([tags[1]])
	key(4, true)
	main._select_tags([tags[0]])
	check(main.control_groups[4] == [tags[1]], "Group membership is independent of later selection changes")
	var alt_event := InputEventKey.new()
	alt_event.keycode = KEY_4
	alt_event.pressed = true
	alt_event.alt_pressed = true
	main._unhandled_input(alt_event)
	check(main.selected_tags == [tags[0]], "Alt number does not accidentally recall a group")
	var meta_event := InputEventKey.new()
	meta_event.keycode = KEY_4
	meta_event.pressed = true
	meta_event.meta_pressed = true
	main._unhandled_input(meta_event)
	check(main.control_groups[4] == [tags[0]], "Command key also assigns groups")
	main._select_tags([tags[3], tags[0], 999999])
	key(2, true)
	key(2)
	check(main.selected_tags == [tags[0]], "Groups accept only living owned units")
	main._select_tags([tags[2]])
	key(2, true, false, true)
	key(2)
	check(main.selected_tags == [tags[0]], "Key repeat cannot overwrite a group")
	# Slot 3 was assigned in the loop; clear it before checking empty recall.
	main._select_tags([])
	key(3, true)
	main._select_tags([tags[0]])
	key(3)
	check(main.selected_tags == [tags[0]], "Empty recall preserves selection")
	# The HUD must route the same modifiers as the keyboard, even for injected events.
	click_group(9, true)
	main._select_tags([tags[1]])
	click_group(9, true, true)
	main._select_tags([tags[2]])
	click_group(9, false, true)
	check(main.selected_tags == [tags[2], tags[0], tags[1]], "HUD supports assignment, append and additive recall")
	main._select_tags([])
	key(9, true)
	main._select_tags([tags[2]])
	key(9)
	check(main.selected_tags == [tags[2]], "Assigning empty selection clears the group")
	sim.units.erase(tags[0])
	main._last_group_press.clear()
	key(1)
	check(main.selected_tags == [tags[1], tags[2]], "Recall immediately removes destroyed members without a render frame")
	sim.units[tags[1]].hp = 0.0
	key(1)
	check(main.selected_tags == [tags[2]], "Recall skips dead members awaiting removal")
	main.pending_ability = "move"
	key(1)
	check(main.pending_ability == "", "Recall cancels targeting from the previous selection")
	sim.units.erase(tags[2])
	key(1)
	check(main.selected_tags.is_empty(), "All-dead group recall leaves no invalid selection")
	var replacement: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(20, 20))
	main._select_tags([replacement.tag])
	key(1, true)
	main.apply_ui_state({"local_player": 2})
	check(main.control_groups.is_empty() and main.selected_tags.is_empty(), "Changing player clears the previous player's groups and selection")
	main._select_tags([tags[3]])
	key(1, true)
	main._last_group_press[1] = Time.get_ticks_msec()
	main._on_scenario_loaded("reset")
	check(main.control_groups.is_empty() and main._last_group_press.is_empty(), "Scenario restart clears groups and double-tap history")
	main.hud.free()
	main.world_3d = null
	camera.free()
	main.free()
	print(JSON.stringify({"checks": checks, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
