extends SceneTree

const COVERED_ABILITIES = ["cancel_build"]
var sim: Node
var main: Node
var failures: Array = []
var checks := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	main = load("res://scripts/RTSMain.gd").new()
	root.add_child(main)
	_build_then_gather()
	_single_worker_queue()
	_waypoints_and_targets()
	_selection_and_batch()
	_cancel()
	print(JSON.stringify({"suite":"shift_commands", "checks":checks, "failures":failures}))
	main.queue_free()
	quit(0 if failures.is_empty() else 1)

func _single_worker_queue() -> void:
	_fixture()
	sim.issue_command([1004,1005,1006],"stop")
	for pos in [Vector2(40,35),Vector2(52,35),Vector2(64,35)]:
		check(sim.issue_command([1004],"build_muster_hall",pos,0,"",true).accepted==1,"Single worker accepts each queued building")
	check(sim.issue_command([1004],"build_muster_hall",Vector2(40,35),0,"",true).accepted==0,"Overlapping queued foundation is rejected")
	sim.issue_command([1004],"harvest",Vector2.ZERO,1001,"",true)
	for _second in range(190):
		sim.step_ticks(64)
		if sim.players[1].structures_built==3 and sim.players[1].crystal_collected>=5: break
	check(sim.players[1].structures_built==3 and sim.players[1].crystal_collected>=5,"Single worker completes all three queued halls then delivers income within 190 seconds")
	check(1500 + sim.players[1].crystal_collected - sim.players[1].crystal == 450,"Single worker pays once per completed foundation")
	_fixture()
	sim.resources[1001].amount = 0
	sim.issue_command([1004],"move",Vector2(35,20),0,"",true)
	sim.step_ticks(10*64)
	check(sim.units[1004].pos.distance_to(Vector2(35,20))<3,"Depleted gathering yields to a queued move instead of replacing it")

func _fixture() -> void:
	sim.load_scenario_file("shift-workers")

func _build_then_gather() -> void:
	_fixture()
	main._select_tags([1004,1005,1006])
	main.pending_ability = "build_muster_hall"
	for pos in [Vector2(40,35), Vector2(52,35), Vector2(64,35)]:
		main._execute_pending_ability_at(pos, true)
		check(main.pending_ability == "build_muster_hall", "Shift placement keeps the build tool active")
	for tag in [1004,1005,1006]:
		check(sim.units[tag].orders.filter(func(o): return o.type=="build").size()==1, "Group placement distributes work instead of starving queued jobs")
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_RIGHT
	event.pressed = true
	event.shift_pressed = true
	event.position = Vector2(162,540)
	main._on_mouse_button(event)
	check(main.pending_ability == "", "Shift right-click resource exits placement and queues gathering in one action")
	check(main.command_feedback.accepted==3 and main.command_feedback.queued, "Positive gather acknowledgement reports accepted workers")
	for tag in [1004,1005,1006]:
		check(sim.units[tag].orders.map(func(o): return o.type) == ["harvest","build","harvest"], "Each worker preserves build-before-gather ordering")
	for _second in range(110):
		sim.step_ticks(64)
		if sim.players[1].structures_built == 3:
			break
	check(sim.players[1].structures_built == 3 and sim.sim_time < 110, "Three paid Muster Halls actually finish within a bounded time")
	var income: int = sim.players[1].crystal_collected
	sim.step_ticks(18*64)
	check(sim.players[1].crystal_collected > income, "Builders deliver new income after their queued buildings finish")
	for tag in [1004,1005,1006]:
		check(sim.units[tag].orders[0].type == "harvest", "All selected workers return to gathering")

func _waypoints_and_targets() -> void:
	sim.load_scenario_dict({"paused":true,"units":[{"type":"rifleman","owner":1,"x":20,"y":20}]})
	var unit: Dictionary = sim.units[1001]
	sim.issue_command([1001],"move",Vector2(35,20))
	sim.issue_command([1001],"move",Vector2(35,45),0,"",true)
	sim.issue_command([1001],"attack_move",Vector2(55,45),0,"",true)
	check(unit.orders.map(func(o):return o.type)==["move","move","attack_move"], "Shift preserves finite move and attack-move waypoints")
	var first := false
	var second := false
	for _tick in range(64*15):
		sim.step_ticks(1)
		first = first or unit.pos.distance_to(Vector2(35,20))<3
		second = second or (first and unit.pos.distance_to(Vector2(35,45))<3)
	check(first and second and unit.pos.distance_to(Vector2(55,45))<3, "Queued waypoints are visited in order")
	sim.issue_command([1001],"move",Vector2(20,20))
	sim.issue_command([1001],"move",Vector2(80,20),0,"",true)
	sim.issue_command([1001],"stop")
	check(unit.orders.is_empty(), "Stop clears every queued waypoint")
	sim.load_scenario_dict({"paused":true,"units":[{"type":"rifleman","owner":1,"x":40,"y":40},
		{"type":"pioneer","owner":2,"x":60,"y":40},{"type":"pioneer","owner":2,"x":80,"y":40}]})
	sim.issue_command([1002,1003],"hold_position")
	sim.issue_command([1001],"attack_target",Vector2(60,40),1002)
	sim.issue_command([1001],"attack_target",Vector2(80,40),1003,"",true)
	var ordered := true
	for _second in range(35):
		sim.step_ticks(64)
		if sim.units.has(1002) and sim.units[1003].hp < 45: ordered=false
		if not sim.units.has(1003): break
	check(ordered and not sim.units.has(1002) and not sim.units.has(1003), "Queued attack targets are killed in requested order")

func _selection_and_batch() -> void:
	sim.load_scenario_dict({"paused":true,"players":{"1":{"crystal":2000,"aether":0}},"units":[
		{"type":"colony_hub","owner":1,"x":20,"y":40},{"type":"muster_hall","owner":1,"x":45,"y":40},
		{"type":"rifleman","owner":1,"x":20,"y":20},{"type":"rifleman","owner":1,"x":30,"y":20}]})
	main._select_tags([1003])
	main._complete_box_selection(Vector2(405,270),Vector2(405,270),true,false)
	check(main.selected_tags==[1003,1004], "Shift-click adds a unit to selection")
	main._complete_box_selection(Vector2(270,270),Vector2(270,270),true,false)
	check(main.selected_tags==[1004], "Shift-click on a selected unit removes it")
	var key := InputEventKey.new()
	key.keycode=KEY_1;key.pressed=true;key.ctrl_pressed=true
	main._handle_hotkey(key)
	main._select_tags([1003])
	key.ctrl_pressed=false;key.shift_pressed=true
	main._handle_hotkey(key)
	check(main.selected_tags.has(1003) and main.selected_tags.has(1004), "Shift control-group recall adds its membership")
	main._select_tags([1002])
	for button in main.get_card_buttons():
		if button.ability_id=="train_rifleman": main._trigger_card_button(button,true)
	check(sim.units[1002].production_queue.size()==5 and sim.players[1].crystal==1750, "Shift training queues five paid units without exceeding capacity")

func _cancel() -> void:
	_fixture()
	sim.issue_command([1004],"stop")
	main._select_tags([1004])
	sim.issue_command([1004],"build_muster_hall",Vector2(40,35))
	for _second in range(15):
		sim.step_ticks(64)
		if int(sim.units[1004].orders[0].get("structure_tag",0))>0: break
	var site_tag: int = sim.units[1004].orders[0].structure_tag
	var paid_balance: int = sim.players[1].crystal
	var key := InputEventKey.new()
	key.pressed=true;key.keycode=KEY_N
	main._handle_hotkey(key)
	check(not sim.units.has(site_tag) and sim.players[1].crystal==paid_balance+112, "Selected builder cancels its foundation and gets a 75% refund")
	check(sim.players[1].units_lost==0 and sim.can_place_structure("muster_hall",Vector2(40,35)), "Cancellation frees the footprint without a combat death")
	check(sim.issue_command([1004],"cancel_build").accepted==0 and sim.players[1].crystal==paid_balance+112, "Repeated cancellation cannot mint refunds")
