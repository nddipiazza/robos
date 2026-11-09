extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		printerr("High-ground engagements require a rendered Godot window")
		quit(1)
		return
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	sim.rts_mode = "human"
	sim.load_scenario_dict({
		"name": "High-ground engagements", "paused": true, "fog_of_war": true, "decor": false,
		"map": {"width": 96, "height": 64,
			"high_ground": [{"x": 12, "y": 8, "w": 36, "h": 44}],
			"ramps": [{"x": 44, "y": 19, "w": 8, "h": 23}]},
		"units": [
			{"id": "gun", "type": "howitzer_emplaced", "owner": 1, "x": 66, "y": 24},
			{"id": "target", "type": "pioneer", "owner": 2, "x": 49, "y": 24},
			{"id": "spotter", "type": "pioneer", "owner": 1, "x": 55, "y": 35}
		]
	})
	var battle: Node = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	battle.world_3d.set_focus(Vector2(52, 27), 60.0)
	var gun := _unit_named(sim, "gun")
	var target := _unit_named(sim, "target")
	var spotter := _unit_named(sim, "spotter")
	var initial_hp: float = target.hp
	await process_frame
	if not battle.icons.is_ready:
		await battle.icons.icons_ready

	sim.issue_command([gun.tag], "hold_position")
	sim.step_ticks(1)
	_check(gun.attack_state == "windup" and gun.attack_target_tag == target.tag, "The low-ground gun starts a shot while the target is visible")
	_check(_warning_count(battle) == 1, "The visible target has a warning before it retreats")
	sim.issue_command([target.tag], "move", Vector2(38, 24))
	for _tick in range(32):
		sim.step_ticks(1)
		if not sim.can_see_unit(1, target):
			break
	_check(sim.unit_elevation(target) > 1.1 and not sim.can_see_unit(1, target), "Climbing the ramp breaks low-ground sight")
	_check(_warning_count(battle) == 0, "Fog removes the warning on the visibility update")
	sim.step_ticks(1)
	_check(gun.attack_state == "idle" and target.hp == initial_hp, "Losing sight cancels the uncommitted shot")
	_check(battle.world_3d.active_fx.is_empty() and sim.recent_events.is_empty(), "The cancelled shot creates neither a projectile cue nor a fire event")
	_check(not _is_observed(sim, target.tag), "The player observation agrees that the retreating target is hidden")

	sim.issue_command([spotter.tag], "move", Vector2(42, 35))
	var beam_visible := false
	for _tick in range(200):
		sim.step_ticks(1)
		if target.hp < initial_hp:
			beam_visible = battle.world_3d.active_fx.any(func(effect): return effect.kind == "beam")
			break
	_check(sim.unit_elevation(spotter) > 1.1 and sim.can_see_unit(1, target) and _is_observed(sim, target.tag), "The spotter restores uphill vision for the low-ground gun")
	_check(target.hp < initial_hp and gun.pos.is_equal_approx(Vector2(66, 24)), "The stationary gun hits its reacquired target")
	_check(beam_visible and sim.recent_events.any(func(event): return event.type == "weapon_fire" and event.target_tag == target.tag), "The revealed shot has both a rendered beam and fire event")
	print("High-ground engagements: ", "passed" if failures.is_empty() else failures)
	for player in root.get_node("RTSAudio").get_children():
		if player is AudioStreamPlayer:
			player.stop()
	battle.queue_free()
	await create_timer(0.15).timeout
	quit.call_deferred(0 if failures.is_empty() else 1)

func _unit_named(sim: Node, id: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.id == id:
			return unit
	return {}

func _warning_count(battle: Node) -> int:
	return battle.ui_state().area_warnings.size()

func _is_observed(sim: Node, tag: int) -> bool:
	return sim.get_observation(1).units.any(func(unit): return unit.tag == tag)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
