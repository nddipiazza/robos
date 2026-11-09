extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_target_preferences()
	_test_emplaced_splash()
	_test_splash_boundaries()
	_test_other_splash()
	print("Roadmap combat checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _test_target_preferences() -> void:
	sim.reset_state(42, 96, 64)
	var shooter: Dictionary = sim.spawn_unit("breacher", 1, Vector2(20, 24))
	var light: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(26, 24))
	var armor: Dictionary = sim.spawn_unit("bile_crawler", 2, Vector2(33, 24))
	sim.step_ticks(1)
	_check(shooter.attack_target_tag == armor.tag, "Breachers acquire an in-range armored threat over a nearer light target")

	sim.reset_state(42, 96, 64)
	shooter = sim.spawn_unit("breacher", 1, Vector2(20, 24))
	light = sim.spawn_unit("rifleman", 2, Vector2(26, 24))
	armor = sim.spawn_unit("bile_crawler", 2, Vector2(33, 24))
	sim.issue_command([shooter.tag], "attack_target", light.pos, light.tag)
	sim.step_ticks(1)
	_check(shooter.attack_target_tag == light.tag, "Explicit targeting takes precedence")

	sim.reset_state(42, 96, 64)
	shooter = sim.spawn_unit("blight_hurler", 1, Vector2(20, 24))
	light = sim.spawn_unit("rifleman", 2, Vector2(27, 24))
	var building: Dictionary = sim.spawn_unit("muster_hall", 2, Vector2(32, 24))
	sim.step_ticks(1)
	_check(shooter.attack_target_tag == building.tag, "Blight Hurlers favor structures that they can hit")

func _test_emplaced_splash() -> void:
	sim.reset_state(42, 96, 64)
	var gun: Dictionary = sim.spawn_unit("howitzer_emplaced", 1, Vector2(20, 24))
	var target: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(42, 24))
	var inner_enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(42, 25))
	var inner_friend: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(42, 23))
	var outer_friend: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(42, 21))
	var outside: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(42, 19))
	sim._rebuild_spatial_grid()
	sim._execute_weapon_hit(gun, target)
	_check(target.max_hp - target.hp == 40.0, "Primary target takes full damage")
	_check(inner_enemy.max_hp - inner_enemy.hp == 20.0, "Enemy inner splash retains its full strength")
	_check(inner_friend.max_hp - inner_friend.hp == 10.0, "Friendly inner splash is halved")
	_check(outer_friend.max_hp - outer_friend.hp == 5.0, "Friendly outer splash is halved")
	_check(outside.max_hp == outside.hp, "Friendly troops outside the radius are safe")
	inner_friend.hp = 1.0
	sim._execute_weapon_hit(gun, target)
	_check(not sim.units.has(inner_friend.tag) and sim.players[1].units_killed == 1, "Only the hostile death counts as a kill")

	sim.reset_state(42, 96, 64)
	gun = sim.spawn_unit("howitzer_emplaced", 1, Vector2(20, 24))
	target = sim.spawn_unit("rifleman", 2, Vector2(25, 24))
	sim.issue_command([gun.tag], "attack_target", target.pos, target.tag)
	sim.step_ticks(25)
	_check(target.hp == target.max_hp and gun.attack_state == "idle", "Explicit fire still respects the minimum range")

func _test_splash_boundaries() -> void:
	sim.reset_state(42, 96, 64)
	var gun: Dictionary = sim.spawn_unit("howitzer_emplaced", 1, Vector2(20, 24))
	var target: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(42, 24))
	var inner_edge: Dictionary = sim.spawn_unit("howitzer", 2, Vector2(45.5, 24))
	var after_inner: Dictionary = sim.spawn_unit("howitzer", 2, Vector2(42, 27.55))
	var outer_edge: Dictionary = sim.spawn_unit("howitzer", 2, Vector2(36.75, 24))
	var after_outer: Dictionary = sim.spawn_unit("howitzer", 2, Vector2(42, 18.7))
	sim._rebuild_spatial_grid()
	sim._execute_weapon_hit(gun, target)
	_check(inner_edge.max_hp - inner_edge.hp == 34.0, "Touching the inner band takes inner damage")
	_check(after_inner.max_hp - after_inner.hp == 16.5, "A footprint beyond the inner band takes outer damage")
	_check(outer_edge.max_hp - outer_edge.hp == 16.5, "Touching the outer band takes outer damage")
	_check(after_outer.max_hp == after_outer.hp, "A footprint beyond the outer band is safe")

func _test_other_splash() -> void:
	sim.reset_state(42, 96, 64)
	var hurler: Dictionary = sim.spawn_unit("blight_hurler", 1, Vector2(20, 24))
	var target: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(32, 24))
	var friend: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(32, 25))
	sim._rebuild_spatial_grid()
	sim._execute_weapon_hit(hurler, target)
	_check(friend.max_hp == friend.hp, "Other splash weapons retain their friendly immunity")
