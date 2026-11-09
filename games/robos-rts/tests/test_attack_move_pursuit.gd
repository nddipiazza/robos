extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_retreating_target()
	print("Attack-move pursuit checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _test_retreating_target() -> void:
	sim.reset_state(42, 128, 112)
	var starts := [Vector2(20, 60), Vector2(22, 61), Vector2(18, 61)]
	var squad: Array[Dictionary] = []
	var tags: Array[int] = []
	for start in starts:
		var soldier: Dictionary = sim.spawn_unit("rifleman", 1, start)
		squad.append(soldier)
		tags.append(soldier.tag)
	var hold_point := Vector2(30, 51)
	var guard: Dictionary = sim.spawn_unit("rifleman", 1, hold_point)
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(20, 42))
	var destination := Vector2(104, 60)
	var queued_destination := Vector2(104, 88)
	var retreat := Vector2(20, 8)
	_check(sim.issue_command(tags, "attack_move", destination).accepted == tags.size(), "The squad accepts its attack-move")
	_check(sim.issue_command(tags, "move", queued_destination, 0, "", true).accepted == tags.size(), "The squad accepts a queued move")
	sim.issue_command([guard.tag], "hold_position")
	sim.issue_command([enemy.tag], "move", retreat)

	sim.step_ticks(32)
	for i in range(squad.size()):
		_check(squad[i].pos.y < starts[i].y - 2.0, "Soldier %d initially pursues the retreat" % i)
	var resumed := {}
	var held: bool = guard.pos.is_equal_approx(hold_point)
	for _tick in range(220):
		sim.step_ticks(1)
		held = held and guard.pos.is_equal_approx(hold_point)
		for i in range(squad.size()):
			var soldier := squad[i]
			var acquisition_range: float = soldier.sight_range + 2.5 + enemy.radius
			if soldier.pos.x > starts[i].x + 3.0 and soldier.pos.distance_to(enemy.pos) < acquisition_range:
				resumed[soldier.tag] = true
	_check(resumed.size() == squad.size(), "The squad turns toward its destination while the retreating enemy is still nearby")
	for soldier in squad:
		_check(soldier.orders.size() == 2 and soldier.orders[0].target_pos == destination, "The chase preserves the active attack-move and its queue")
	_check(held and guard.orders[0].type == "hold_position", "The guard holds its position throughout the same encounter")
	_check(enemy.hp < enemy.max_hp and enemy.hp > 0.0, "The guard fires in range and the target survives to retreat")

	var completed_original := {}
	for _tick in range(1100):
		sim.step_ticks(1)
		for soldier in squad:
			if soldier.orders.size() == 1 and soldier.orders[0].type == "move" and not completed_original.has(soldier.tag):
				completed_original[soldier.tag] = soldier.pos.distance_to(destination) < 2.5
	for soldier in squad:
		_check(completed_original.get(soldier.tag, false), "The queued move starts only after arrival at the original destination")
		_check(soldier.orders.is_empty() and soldier.pos.distance_to(queued_destination) < 5.0, "The squad completes the original leg and then the queued move")
