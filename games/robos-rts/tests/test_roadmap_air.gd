extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_flight()
	_test_domains()
	print("Roadmap air checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _test_flight() -> void:
	sim.load_scenario_dict({
		"map": {
			"width": 96, "height": 64,
			"water_channels": [{"width": 12, "points": [[48, 0], [48, 64]]}],
			"watch_stations": [{"x": 48, "y": 26}]
		}
	})
	var aircraft: Dictionary = sim.spawn_unit("kestrel_interceptor", 1, Vector2(26, 26))
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(33, 26))
	var crossing := Vector2(48, 26)
	sim.issue_command([aircraft.tag], "move", crossing)
	sim.step_ticks(190)
	_check(aircraft.pos.distance_to(crossing) < 2.0 and sim.is_water_at(aircraft.pos), "Aircraft can stop over deep water")
	_check(soldier.pos == Vector2(33, 26), "An aircraft does not push ground troops aside")
	_check(sim.watch_stations[0].owner == 0, "Aircraft cannot claim a ground station")

func _test_domains() -> void:
	sim.reset_state(42, 96, 64)
	var fighter: Dictionary = sim.spawn_unit("kestrel_interceptor", 1, Vector2(23, 26))
	var enemy_air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(34, 26))
	var enemy_ground: Dictionary = sim.spawn_unit("breacher", 2, Vector2(26, 32))
	_check(not sim.issue_command([fighter.tag], "attack_target", enemy_ground.pos, enemy_ground.tag).ok, "A dedicated interceptor rejects ground targets")
	sim.step_ticks(32)
	_check(enemy_air.hp < enemy_air.max_hp and fighter.hp < fighter.max_hp, "Interceptors acquire and damage each other")
	_check(enemy_ground.hp == enemy_ground.max_hp, "An interceptor does not damage a closer ground target")
