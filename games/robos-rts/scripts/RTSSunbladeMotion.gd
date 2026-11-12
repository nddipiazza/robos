extends RefCounted

const FOLLOW_THROUGH := 0.075
const RECOVERY := 0.26
const TRAIL_LIFETIME := 0.115
const READY := [Vector2(-17, -8), Vector2(12, 12), Vector2(17, -8), Vector2(-12, 12)]
const WINDUP := [Vector2(-54, 32), Vector2(-24, 24), Vector2(26, -12), Vector2(-29, 24)]
const CONTACT := [Vector2(8, -5), Vector2(12, -8), Vector2(34, -15), Vector2(-18, 27)]
const OVERSHOOT := [Vector2(40, -23), Vector2(23, -17), Vector2(42, -18), Vector2(-12, 30)]

static var _trail_material: StandardMaterial3D

static func bind(model: Node3D) -> Dictionary:
	var arms: Array[Dictionary] = []
	for side in ["Left", "Right"]:
		var shoulder := model.find_child("Sunblade%sArm" % side, true, false) as Node3D
		var forearm := model.find_child("Sunblade%sForearm" % side, true, false) as Node3D
		var base := model.find_child("%sBladeBase" % side, true, false) as Node3D
		var tip := model.find_child("%sBladeTip" % side, true, false) as Node3D
		if not shoulder or not forearm or not base or not tip:
			return {}
		arms.append({"shoulder": shoulder, "forearm": forearm, "base": base, "tip": tip})
	return {"arms": arms, "next_hand": 1, "last_hand": 0, "strike_at": -100.0, "active": true, "samples": []}

static func strike(rig: Dictionary, time: float) -> void:
	rig.last_hand = rig.next_hand
	rig.next_hand = 1 - rig.next_hand
	rig.strike_at = time

static func sync(node: Node3D, unit: Dictionary, rig: Dictionary, time: float) -> void:
	var age := time - float(rig.strike_at)
	var windup: bool = unit.attack_state == "windup"
	var swinging := windup or age < RECOVERY
	if not swinging and not rig.active and rig.samples.is_empty():
		return
	rig.active = swinging
	var hand: int = rig.next_hand if windup else rig.last_hand
	var from_pose: Array = READY
	var to_pose: Array = READY
	var blend := 0.0
	var draw_trail := false
	if windup:
		var duration := maxf(0.001, float(unit.attack_windup_duration))
		var progress := clampf(1.0 - float(unit.attack_state_timer) / duration, 0.0, 1.0)
		if progress < 0.55:
			to_pose = WINDUP
			blend = smoothstep(0.0, 0.55, progress)
		else:
			from_pose = WINDUP
			to_pose = CONTACT
			blend = smoothstep(0.55, 1.0, progress)
			draw_trail = true
	elif age < FOLLOW_THROUGH:
		from_pose = CONTACT
		to_pose = OVERSHOOT
		blend = smoothstep(0.0, FOLLOW_THROUGH, age)
		draw_trail = true
	elif age < RECOVERY:
		from_pose = OVERSHOOT
		blend = smoothstep(FOLLOW_THROUGH, RECOVERY, age)
	_apply_pose(rig.arms, hand, from_pose, to_pose, blend)
	_sync_trail(node, rig, hand, time, draw_trail)

static func _apply_pose(arms: Array, hand: int, from_pose: Array, to_pose: Array, blend: float) -> void:
	var yaw_mirror := 1.0 if hand == 1 else -1.0
	for index in range(2):
		var arm: Dictionary = arms[index]
		var offset := 0 if index == hand else 2
		var shoulder: Vector2 = from_pose[offset].lerp(to_pose[offset], blend)
		var forearm: Vector2 = from_pose[offset + 1].lerp(to_pose[offset + 1], blend)
		# Local +X points forward. +Y rotates toward -Z, and +Z lifts the blade.
		arm.shoulder.rotation_degrees = Vector3(0, shoulder.x * yaw_mirror, shoulder.y)
		arm.forearm.rotation_degrees = Vector3(0, forearm.x * yaw_mirror, forearm.y)

static func _sync_trail(node: Node3D, rig: Dictionary, hand: int, time: float, draw_trail: bool) -> void:
	var samples: Array = rig.samples
	while not samples.is_empty() and time - float(samples.front().time) > TRAIL_LIFETIME:
		samples.pop_front()
	if draw_trail:
		var arm: Dictionary = rig.arms[hand]
		var tip: Vector3 = arm.tip.global_position
		var base: Vector3 = arm.base.global_position
		if samples.is_empty() or tip.distance_squared_to(samples.back().tip) > 0.0016:
			samples.append({"time": time, "base": base.lerp(tip, 0.4), "tip": tip})
			if samples.size() > 12:
				samples.pop_front()
	var trail: MeshInstance3D = rig.get("trail")
	if samples.size() < 2:
		if trail:
			trail.hide()
		return
	if trail == null:
		trail = MeshInstance3D.new()
		trail.name = "SunbladeSlashTrail"
		trail.mesh = ImmediateMesh.new()
		trail.material_override = _slash_material()
		trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(trail)
		rig["trail"] = trail
	var mesh := trail.mesh as ImmediateMesh
	mesh.clear_surfaces()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in range(1, samples.size()):
		var older: Dictionary = samples[index - 1]
		var newer: Dictionary = samples[index]
		var older_strength := _trail_strength(older, index - 1, samples.size(), time)
		var newer_strength := _trail_strength(newer, index, samples.size(), time)
		_trail_vertex(mesh, node, older, older_strength, false)
		_trail_vertex(mesh, node, newer, newer_strength, false)
		_trail_vertex(mesh, node, newer, newer_strength, true)
		_trail_vertex(mesh, node, older, older_strength, false)
		_trail_vertex(mesh, node, newer, newer_strength, true)
		_trail_vertex(mesh, node, older, older_strength, true)
	mesh.surface_end()
	trail.show()

static func _trail_strength(sample: Dictionary, index: int, count: int, time: float) -> float:
	var tail := smoothstep(0.0, 0.5, float(index) / float(count - 1))
	return tail * (1.0 - smoothstep(0.0, TRAIL_LIFETIME, time - float(sample.time)))

static func _trail_vertex(mesh: ImmediateMesh, node: Node3D, sample: Dictionary, strength: float, edge: bool) -> void:
	var tint := Color("#278cff").lerp(Color("#63dcff"), strength) if edge else Color("#1b3fd6")
	tint.a = strength * (0.92 if edge else 0.16)
	mesh.surface_set_color(tint)
	mesh.surface_add_vertex(node.to_local(sample.tip if edge else sample.base))

static func _slash_material() -> StandardMaterial3D:
	if _trail_material == null:
		_trail_material = StandardMaterial3D.new()
		_trail_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_trail_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_trail_material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_trail_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_trail_material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
		_trail_material.vertex_color_use_as_albedo = true
	return _trail_material
