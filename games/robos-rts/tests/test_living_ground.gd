extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_completed_source()
	_test_connected_terrain()
	_test_fog()
	_test_source_loss()
	print("Living ground checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _observed_cells(player: int) -> Array:
	return sim.get_observation(player).map.living_ground.cells

func _test_completed_source() -> void:
	sim.reset_state(42, 96, 64)
	var nest_position := Vector2(30, 30)
	var forager: Dictionary = sim.spawn_unit("forager", 2, Vector2(25, 30))
	_check(sim.issue_command([forager.tag], "build_brood_nest", nest_position).ok, "A Forager places a paid Brood Nest")
	sim.step_ticks(512)
	_check(not sim.units.has(forager.tag) and sim.players[2].crystal == 100, "The morph consumes its Forager and pays the Nest cost")
	_check(not sim.has_living_ground(nest_position) and _observed_cells(0).is_empty(), "A growing Nest emits no living ground")
	sim.step_ticks(512)
	_check(sim.has_living_ground(nest_position, 2) and not sim.has_living_ground(nest_position, 1), "The completed Nest seeds its owner's ground")
	_check(_observed_cells(0).size() == 5, "The first pulse seeds the origin and four neighbors")
	sim.step_ticks(127)
	_check(not sim.has_living_ground(Vector2(38, 30)), "The next ring waits for its simulation pulse")
	sim.step_ticks(1)
	_check(sim.has_living_ground(Vector2(38, 30), 2), "The next ring advances exactly 128 ticks after the first pulse")
	sim.step_ticks(2304)
	_check(_observed_cells(0).size() == 113 and sim.has_living_ground(Vector2(54, 30), 2) and not sim.has_living_ground(Vector2(58, 30)), "Growth stops at the source radius")
	var revision: int = sim.living_ground.revision
	sim.step_ticks(512)
	_check(sim.living_ground.revision == revision, "Mature terrain requires no further mask updates")

func _test_connected_terrain() -> void:
	var scenario := {
		"paused": true,
		"map": {
			"width": 96, "height": 64,
			"obstacles": [{"x": 20, "y": 0, "w": 2, "h": 64}],
			"water_channels": [{"width": 4, "points": [[42, 0], [42, 64]]}],
		},
		"units": [{"type": "brood_nest", "owner": 2, "x": 30, "y": 30}],
	}
	sim.load_scenario_dict(scenario)
	sim.step_ticks(1600)
	var first := _observed_cells(0)
	_check(sim.has_living_ground(Vector2(34, 42), 2), "The frontier grows through connected dry ground")
	_check(not sim.has_living_ground(Vector2(18, 30)) and not sim.has_living_ground(Vector2(46, 30)), "A wall and water each stop the connected frontier")
	sim.load_scenario_dict(scenario)
	sim.step_ticks(1600)
	_check(_observed_cells(0) == first, "The same scenario and ticks produce the same ordered coverage")

func _test_fog() -> void:
	sim.load_scenario_dict({
		"paused": true, "fog_of_war": true, "map": {"width": 100, "height": 64},
		"units": [
			{"id": "scout", "type": "pioneer", "owner": 1, "x": 24, "y": 32},
			{"type": "brood_nest", "owner": 2, "x": 74, "y": 32},
		],
	})
	var scout: Dictionary = sim.units.values()[0]
	sim.step_ticks(1600)
	_check(_observed_cells(0).size() > 0 and _observed_cells(1).is_empty(), "Fog hides the enemy's spread and spectators see it")
	sim.issue_command([scout.tag], "move", Vector2(47, 32))
	sim.step_ticks(640)
	var visible := _observed_cells(1)
	_check(visible.size() > 0 and visible.size() < _observed_cells(0).size(), "A scout reveals only the living cells inside sight")
	sim.issue_command([scout.tag], "move", Vector2(24, 32))
	sim.step_ticks(640)
	_check(_observed_cells(1).is_empty() and sim.vision.state_at(1, Vector2(50, 34)) == sim.Vision.EXPLORED, "Exploration alone does not show the enemy's current spread")

func _test_source_loss() -> void:
	sim.reset_state(42, 100, 64)
	var first: Dictionary = sim.spawn_unit("brood_nest", 2, Vector2(30, 30))
	sim.spawn_unit("brood_nest", 2, Vector2(62, 30))
	sim.step_ticks(1600)
	var shared := Vector2(46, 30)
	var lost := Vector2(30, 30)
	_check(sim.has_living_ground(shared, 2) and sim.has_living_ground(lost, 2), "Two completed Nests establish overlapping cover")
	var attacker: Dictionary = sim.spawn_unit("howitzer_emplaced", 1, Vector2(30, 50))
	first.hp = 1.0
	sim.issue_command([attacker.tag], "attack_target", first.pos, first.tag)
	sim.step_ticks(96)
	_check(not sim.units.has(first.tag), "The enemy kills the first Nest with a real attack")
	_check(sim.has_living_ground(shared, 2) and not sim.has_living_ground(lost, 2), "Source loss clears exclusive coverage and retains shared cells")
