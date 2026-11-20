extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

var sim: Node
var world: Node3D
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	world = load("res://scripts/RTSWorld3D.gd").new()
	root.add_child(world)
	await process_frame

	_test_sunblade_standard_fan()
	_test_sunblade_ladder_combo()
	_test_duskblade_fan_and_cloak()
	_test_bulwark_and_claw_melee()

	world.queue_free()
	await process_frame
	if failures.is_empty():
		print("PASS: Concord Sunblade and Duskblade fanning sweeps, Bulwark chitin cleave fan, and agile melee slash arcs")
	else:
		printerr("FAILURES: ", failures)
	quit(0 if failures.is_empty() else 1)

func _fan_vertex_count(trail: MeshInstance3D) -> int:
	if trail == null or not trail.visible or trail.mesh == null or trail.mesh.get_surface_count() != 1:
		return 0
	return trail.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX].size()

func _test_sunblade_standard_fan() -> void:
	sim.load_scenario_dict({
		"paused": true, "decor": false, "fog_of_war": false,
		"map": {"width": 72, "height": 64},
		"players": {"1": {"faction": "aliens"}, "2": {"faction": "humans"}},
	})
	var sunblade: Dictionary = sim.spawn_unit("sunblade", 1, Vector2(30, 30))
	var target: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(33, 30))
	target.max_hp = 2000.0
	target.hp = 2000.0
	sim.issue_command([target.tag], "hold_fire")
	world.set_focus(sunblade.pos, 42.0)
	var selected: Array[int] = []
	world.sync_3d_entities(selected, sim.TICK_DT)

	var node: Node3D = world.unit_nodes.get(sunblade.tag)
	var rig: Dictionary = node.get_meta("blade_rig", {}) if node else {}
	_check(not rig.is_empty() and is_same(rig, node.get_meta("sunblade_rig", {})), "Sunblade binds blade_rig and aliases sunblade_rig")
	if rig.is_empty():
		return

	var rest_tip_r: Vector3 = rig.arms[1].tip.global_position
	var rest_tip_l: Vector3 = rig.arms[0].tip.global_position
	var max_travel_r := 0.0
	var max_travel_l := 0.0
	var max_lunge := 0.0
	var peak_fan_verts := 0
	var hit_hands: Array[int] = []
	var last_strike := float(rig.strike_at)

	sim.issue_command([sunblade.tag], "attack_target", target.pos, target.tag)
	for _tick in range(130):
		sim.step_ticks(1)
		world.sync_3d_entities(selected, sim.TICK_DT)
		if float(rig.strike_at) > last_strike:
			last_strike = float(rig.strike_at)
			hit_hands.append(int(rig.last_hand))
		max_travel_r = maxf(max_travel_r, rest_tip_r.distance_to(rig.arms[1].tip.global_position))
		max_travel_l = maxf(max_travel_l, rest_tip_l.distance_to(rig.arms[0].tip.global_position))
		var model := node.get_node("AttackModel") as Node3D
		max_lunge = maxf(max_lunge, model.position.x)
		peak_fan_verts = maxi(peak_fan_verts, _fan_vertex_count(rig.get("trail")))
		if hit_hands.size() >= 2 and float(world.anim_time - last_strike) > 0.08:
			break

	_check(hit_hands == [1, 0], "Sunblade alternates right then left blade strikes (%s)" % [hit_hands])
	_check(max_travel_r > 1.8 and max_travel_l > 1.8, "Both Sunblade blades sweep through wide arcs (R=%.2f, L=%.2f)" % [max_travel_r, max_travel_l])
	_check(max_lunge > 0.25, "Sunblade lunges into melee contact (%.2f)" % max_lunge)
	_check(peak_fan_verts >= 120, "Sunblade renders a high-segment fanning sweep mesh (%d verts)" % peak_fan_verts)

	sim.issue_command([sunblade.tag], "hold_fire")
	for _tick in range(20):
		world.sync_3d_entities(selected, sim.TICK_DT)
	var trail: MeshInstance3D = rig.get("trail")
	_check(rig.samples.is_empty() and (trail == null or not trail.visible), "Sunblade fanning sweep fades cleanly after recovery")

func _test_sunblade_ladder_combo() -> void:
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "decor": false, "fog_of_war": false,
		"map": {"width": 72, "height": 64},
		"players": {"1": {"faction": "aliens"}, "2": {"faction": "humans"}},
	})
	var sunblade: Dictionary = sim.spawn_unit("sunblade", 1, Vector2(30, 30))
	var target: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(33, 30))
	target.max_hp = 2000.0
	target.hp = 2000.0
	sim.issue_command([target.tag], "hold_fire")
	world.set_focus(sunblade.pos, 42.0)
	var selected: Array[int] = []
	world.sync_3d_entities(selected, sim.TICK_DT)
	var node: Node3D = world.unit_nodes[sunblade.tag]
	var rig: Dictionary = node.get_meta("blade_rig")

	var first_half_fan := false
	var second_half_fan := false
	sim.issue_command([sunblade.tag], "attack_target", target.pos, target.tag)
	for _tick in range(60):
		sim.step_ticks(1)
		world.sync_3d_entities(selected, sim.TICK_DT)
		var age: float = float(world.anim_time) - float(rig.strike_at)
		if float(rig.strike_at) > 0.0:
			var verts := _fan_vertex_count(rig.get("trail"))
			if age > 0.03 and age < 0.16 and verts >= 120:
				first_half_fan = true
			if age > 0.25 and age < 0.40 and verts >= 120:
				second_half_fan = true
	_check(int(rig.strike_attacks) == 2 and first_half_fan and second_half_fan,
		"Ladder Sunblade executes a 1-2 twin-blade fanning combo for its double-hit strike")

func _test_duskblade_fan_and_cloak() -> void:
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "decor": false, "fog_of_war": true,
		"map": {"width": 72, "height": 64},
		"players": {"1": {"faction": "aliens"}, "2": {"faction": "humans"}},
	})
	var duskblade: Dictionary = sim.spawn_unit("duskblade", 1, Vector2(30, 30))
	var target: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(32.5, 30))
	target.max_hp = 2000.0
	target.hp = 2000.0
	sim.issue_command([target.tag], "hold_fire")
	sim._refresh_vision()
	world.set_focus(duskblade.pos, 42.0)
	var selected: Array[int] = []
	world.sync_3d_entities(selected, sim.TICK_DT, 1)

	var node: Node3D = world.unit_nodes.get(duskblade.tag)
	var rig: Dictionary = node.get_meta("blade_rig", {}) if node else {}
	_check(not rig.is_empty() and rig.has("dusk_rig"), "Duskblade binds articulated dusk_rig and blade_rig")
	if rig.is_empty():
		return

	var tip: Node3D = rig.dusk_rig.tip
	var rest_tip := tip.global_position
	var max_tip_travel := 0.0
	var peak_fan_verts := 0
	sim.issue_command([duskblade.tag], "attack_target", target.pos, target.tag)
	for _tick in range(55):
		sim.step_ticks(1)
		world.sync_3d_entities(selected, sim.TICK_DT, 1)
		max_tip_travel = maxf(max_tip_travel, rest_tip.distance_to(tip.global_position))
		peak_fan_verts = maxi(peak_fan_verts, _fan_vertex_count(rig.get("trail")))

	_check(max_tip_travel > 1.6 and peak_fan_verts >= 120,
		"Duskblade sweeps its Veil blade across a wide arc (%.2f) with a fanning trail (%d verts)" % [max_tip_travel, peak_fan_verts])

	# Verify enemy player without detection cannot see the cloaked Duskblade or its sweep fan.
	world.sync_3d_entities(selected, sim.TICK_DT, 2)
	_check(not node.visible, "Undetected cloaked Duskblade hides both body and sweep fan from enemy view")

func _test_bulwark_and_claw_melee() -> void:
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "decor": false, "fog_of_war": false,
		"map": {"width": 96, "height": 64},
		"players": {"1": {"faction": "monsters"}, "2": {"faction": "humans"}},
	})
	var types := ["carapace_bulwark", "skitterling", "broodling", "forager"]
	var attackers: Array[Dictionary] = []
	for i in range(types.size()):
		var y := 16.0 + i * 10.0
		var atk: Dictionary = sim.spawn_unit(types[i], 1, Vector2(30, y))
		var tgt: Dictionary = sim.spawn_unit("field_bunker", 2, Vector2(33.5, y))
		tgt.max_hp = 3000.0
		tgt.hp = 3000.0
		sim.issue_command([atk.tag], "attack_target", tgt.pos, tgt.tag)
		attackers.append(atk)

	world.set_focus(Vector2(32, 32), 55.0)
	var selected: Array[int] = []
	var seen_fan := {}
	for _tick in range(70):
		sim.step_ticks(1)
		world.sync_3d_entities(selected, sim.TICK_DT)
		for atk in attackers:
			var u_node: Node3D = world.unit_nodes.get(atk.tag)
			var rig: Dictionary = u_node.get_meta("blade_rig", {}) if u_node else {}
			if not rig.is_empty() and _fan_vertex_count(rig.get("trail")) >= 100:
				seen_fan[atk.unit_type] = true

	for t in types:
		_check(seen_fan.get(t, false), "%s renders a melee fanning sweep on strike" % t)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)
