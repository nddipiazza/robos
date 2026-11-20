extends RefCounted

# RTSBladeMelee.gd — Articulated melee strike choreography and procedural fanning blade sweeps.
# Presentation only; attack cadence, range, and damage remain strictly in SimEngine.

const SLICES := 26

const STYLES := {
	"sunblade": {
		"inner": Color(0.02, 0.24, 0.88),
		"mid": Color(0.05, 0.60, 1.00),
		"rib": Color(0.22, 0.88, 1.00),
		"edge": Color(0.60, 0.98, 1.00),
		"impact": Color(0.45, 0.94, 1.00),
		"pivot": Vector3(0.28, 1.24, 0.0),
		"r_hub": 0.28,
		"r_hilt": 0.56,
		"r_outer": 2.58,
		"edge_width": 0.32,
		"halo_width": 0.18,
		"arc_from_deg": -90.0,
		"arc_to_deg": 82.0,
		"tilt_roll_deg": -15.0,
		"tilt_pitch_deg": -5.0,
		"ribs": 7,
		"whip_time": 0.11,
		"sweep_duration": 0.28,
		"recovery": 0.288,
		"lunge": 0.38,
		"coil_back": 0.16,
		"torso_coil_deg": -24.0,
		"torso_follow_deg": 26.0,
	},
	"duskblade": {
		"inner": Color(0.22, 0.03, 0.66),
		"mid": Color(0.55, 0.12, 0.98),
		"rib": Color(0.80, 0.34, 1.00),
		"edge": Color(0.96, 0.68, 1.00),
		"impact": Color(0.84, 0.48, 1.00),
		"pivot": Vector3(0.32, 1.18, 0.0),
		"r_hub": 0.30,
		"r_hilt": 0.60,
		"r_outer": 2.86,
		"edge_width": 0.35,
		"halo_width": 0.20,
		"arc_from_deg": -94.0,
		"arc_to_deg": 84.0,
		"tilt_roll_deg": -17.0,
		"tilt_pitch_deg": -4.0,
		"ribs": 8,
		"whip_time": 0.125,
		"sweep_duration": 0.32,
		"recovery": 0.35,
		"lunge": 0.44,
		"coil_back": 0.20,
		"torso_coil_deg": -22.0,
		"torso_follow_deg": 24.0,
	},
	"bulwark": {
		"inner": Color(0.54, 0.09, 0.01),
		"mid": Color(0.94, 0.32, 0.04),
		"rib": Color(1.00, 0.62, 0.14),
		"edge": Color(1.00, 0.88, 0.44),
		"impact": Color(1.00, 0.68, 0.24),
		"pivot": Vector3(0.74, 0.96, 0.0),
		"r_hub": 0.46,
		"r_hilt": 0.96,
		"r_outer": 3.30,
		"edge_width": 0.38,
		"halo_width": 0.22,
		"arc_from_deg": -88.0,
		"arc_to_deg": 84.0,
		"tilt_roll_deg": -10.0,
		"tilt_pitch_deg": -3.0,
		"ribs": 7,
		"whip_time": 0.125,
		"sweep_duration": 0.32,
		"recovery": 0.35,
		"lunge": 0.46,
		"coil_back": 0.24,
		"torso_coil_deg": -16.0,
		"torso_follow_deg": 18.0,
	},
	"claw": {
		"inner": Color(0.45, 0.22, 0.03),
		"mid": Color(0.92, 0.56, 0.12),
		"rib": Color(1.00, 0.80, 0.34),
		"edge": Color(1.00, 0.93, 0.64),
		"impact": Color(1.00, 0.84, 0.45),
		"pivot": Vector3(0.26, 0.58, 0.0),
		"r_hub": 0.18,
		"r_hilt": 0.40,
		"r_outer": 1.62,
		"edge_width": 0.22,
		"halo_width": 0.13,
		"arc_from_deg": -72.0,
		"arc_to_deg": 68.0,
		"tilt_roll_deg": -18.0,
		"tilt_pitch_deg": -6.0,
		"ribs": 5,
		"whip_time": 0.072,
		"sweep_duration": 0.19,
		"recovery": 0.20,
		"lunge": 0.30,
		"coil_back": 0.12,
		"torso_coil_deg": -22.0,
		"torso_follow_deg": 24.0,
	},
}

# Total yaw chain: body (-24..+26) + shoulder (-50..+42) + forearm (-16..+14) = -90..+82 deg (matches fan 1:1!)
const SUNBLADE_READY := [Vector3(0, -16, -8), Vector3(0, 12, 10), Vector3(0, 16, -8), Vector3(0, -12, 10)]
const SUNBLADE_COIL := [Vector3(-18, -50, 24), Vector3(-10, -16, 16), Vector3(10, 38, -16), Vector3(0, -20, 20)]
const SUNBLADE_FOLLOW := [Vector3(15, 42, -14), Vector3(8, 14, -10), Vector3(12, 42, -18), Vector3(0, -14, 24)]

static var _sweep_material: StandardMaterial3D

static func supports(unit_type: String, attack_profile: Dictionary) -> bool:
	if unit_type in ["sunblade", "duskblade", "carapace_bulwark"]:
		return true
	return str(attack_profile.get("kind", "")) == "melee"

static func bind(model: Node3D, unit_type: String = "sunblade", radius: float = 1.0, attack_profile: Dictionary = {}) -> Dictionary:
	var kind := _kind_for(unit_type)
	var style: Dictionary = STYLES[kind].duplicate()
	if kind == "claw":
		var scale := clampf(radius / 0.85, 0.62, 1.45)
		style.pivot = Vector3(0.24 * scale, maxf(0.38, 0.62 * scale), 0.0)
		style.r_hub = 0.16 * scale
		style.r_hilt = 0.38 * scale
		style.r_outer = 1.58 * scale
		style.edge_width = 0.21 * scale
		style.halo_width = 0.12 * scale
		var base_col := Color(str(attack_profile.get("color", "#ffb84d")))
		style.mid = Color(base_col.r * 0.92, base_col.g * 0.68, base_col.b * 0.25)
		style.inner = style.mid.darkened(0.55)
		style.rib = base_col
		style.edge = base_col.lightened(0.35)
		style.impact = base_col.lightened(0.25)
	var anim_player: AnimationPlayer = model.get_meta("robotics_animation", null) if model.has_meta("robotics_animation") else null
	var rig := {
		"kind": kind,
		"style": style,
		"model": model,
		"anim_player": anim_player,
		"arms": [],
		"next_hand": 1,
		"last_hand": 0,
		"strike_at": -100.0,
		"strike_attacks": 1,
		"active": true,
		"samples": [],
	}
	if kind == "sunblade":
		var arms := _bind_sunblade_arms(model)
		if arms.is_empty():
			return {}
		rig.arms = arms
	elif kind == "duskblade":
		var torso := model.find_child("Torso", true, false) as Node3D
		var arm_r := model.find_child("UpperArm_R", true, false) as Node3D
		var fore_r := model.find_child("Forearm_R", true, false) as Node3D
		var arm_l := model.find_child("UpperArm_L", true, false) as Node3D
		var tip := model.find_child("BladeTip", true, false) as Node3D
		if torso and arm_r and fore_r:
			rig["dusk_rig"] = {"torso": torso, "arm_r": arm_r, "fore_r": fore_r, "arm_l": arm_l, "tip": tip}
		else:
			var fallback_arms := _bind_sunblade_arms(model)
			if not fallback_arms.is_empty():
				rig.arms = fallback_arms
	elif kind == "bulwark":
		var head := model.find_child("Head", true, false) as Node3D
		var mand_l := model.find_child("MandibleLeft", true, false) as Node3D
		var mand_r := model.find_child("MandibleRight", true, false) as Node3D
		rig["bulwark_rig"] = {"head": head, "mand_l": mand_l, "mand_r": mand_r}
	return rig

static func _bind_sunblade_arms(model: Node3D) -> Array[Dictionary]:
	var arms: Array[Dictionary] = []
	for side in ["Left", "Right"]:
		var shoulder := model.find_child("Sunblade%sArm" % side, true, false) as Node3D
		var forearm := model.find_child("Sunblade%sForearm" % side, true, false) as Node3D
		var base := model.find_child("%sBladeBase" % side, true, false) as Node3D
		var tip := model.find_child("%sBladeTip" % side, true, false) as Node3D
		if not shoulder or not forearm or not base or not tip:
			return []
		arms.append({"shoulder": shoulder, "forearm": forearm, "base": base, "tip": tip})
	return arms

static func _kind_for(unit_type: String) -> String:
	match unit_type:
		"sunblade":
			return "sunblade"
		"duskblade":
			return "duskblade"
		"carapace_bulwark":
			return "bulwark"
		_:
			return "claw"

static func strike(rig: Dictionary, time: float, attacks: int = 1) -> void:
	rig.last_hand = int(rig.next_hand)
	rig.next_hand = 1 - int(rig.next_hand)
	rig.strike_at = time
	rig.strike_attacks = maxi(1, attacks)
	rig.active = true

static func impact_color(rig: Dictionary) -> Color:
	var style: Dictionary = rig.get("style", {})
	return style.get("impact", Color("#80ebff"))

static func sync(node: Node3D, unit: Dictionary, rig: Dictionary, time: float) -> void:
	var style: Dictionary = rig.style
	var twin_combo: bool = str(rig.kind) == "sunblade" and int(rig.get("strike_attacks", 1)) >= 2 and not bool(unit.get("hold_fire", false))
	var combo_split := 0.22
	var total_recovery := 0.46 if twin_combo else float(style.recovery)
	var age := time - float(rig.strike_at)
	var windup: bool = str(unit.get("attack_state", "idle")) == "windup"
	var swinging := windup or (age >= 0.0 and age < total_recovery)
	if not swinging and not bool(rig.active) and rig.samples.is_empty():
		return

	var model: Node3D = rig.get("model")
	var anim_player: AnimationPlayer = rig.get("anim_player")
	var hand: int = int(rig.next_hand) if windup else int(rig.last_hand)
	var local_age := age
	var whip_time := float(style.whip_time)
	var sweep_duration := float(style.sweep_duration)
	var recovery := float(style.recovery)

	if not windup and twin_combo:
		if age < combo_split:
			whip_time = 0.088
			sweep_duration = 0.215
			recovery = combo_split
		else:
			hand = 1 - hand
			local_age = age - combo_split
			whip_time = 0.088
			sweep_duration = 0.225
			recovery = total_recovery - combo_split

	var side_sign := 1.0 if hand == 1 else -1.0

	# Master slash_u in [0..1] drives BOTH the physical blade arc and the leading edge of the fan!
	var phase := "rest"
	var coil_blend := 0.0
	var slash_u := 0.0
	var recover_blend := 0.0
	var draw_fan := false
	var head_u := 0.0
	var tail_u := 0.0
	var fan_intensity := 0.0

	if windup:
		var duration := maxf(0.001, float(unit.get("attack_windup_duration", 0.08)))
		var progress := clampf(1.0 - float(unit.get("attack_state_timer", 0.0)) / duration, 0.0, 1.0)
		if progress < 0.62:
			phase = "coil"
			coil_blend = smoothstep(0.0, 0.62, progress)
		else:
			phase = "slash"
			slash_u = lerpf(0.0, 0.48, smoothstep(0.62, 1.0, progress))
			draw_fan = slash_u > 0.06
			head_u = slash_u
			tail_u = 0.0
			fan_intensity = smoothstep(0.04, 0.35, slash_u) * 0.92
	elif local_age >= 0.0 and local_age < whip_time:
		phase = "slash"
		var whip_t := 1.0 - pow(1.0 - clampf(local_age / whip_time, 0.0, 1.0), 2.3)
		var start_u := 0.16 if (twin_combo and age >= combo_split) else 0.48
		slash_u = lerpf(start_u, 1.0, whip_t)
		draw_fan = true
		head_u = slash_u
		tail_u = smoothstep(0.045, whip_time, local_age) * 0.08
		fan_intensity = 1.0
	elif local_age >= 0.0 and local_age < recovery:
		phase = "recover"
		slash_u = 1.0
		recover_blend = smoothstep(whip_time, recovery, local_age)
		if local_age < sweep_duration:
			draw_fan = true
			var fade_t := clampf((local_age - whip_time) / maxf(0.001, sweep_duration - whip_time), 0.0, 1.0)
			head_u = 1.0
			tail_u = lerpf(0.08, 0.78, pow(fade_t, 0.85))
			fan_intensity = pow(1.0 - fade_t, 1.30)

	if swinging:
		if anim_player and anim_player.is_playing() and anim_player.current_animation in ["idle", "walk", "attack"]:
			anim_player.pause()
		_apply_body_motion(model, style, side_sign, phase, coil_blend, slash_u, recover_blend)
		_apply_limb_motion(rig, hand, side_sign, phase, coil_blend, slash_u, recover_blend)
	else:
		if model:
			model.transform = Transform3D.IDENTITY
		_reset_limbs(rig)
		if anim_player and not anim_player.is_playing():
			anim_player.play("idle", 0.08)

	_sync_fan_mesh(node, rig, side_sign, draw_fan, head_u, tail_u, fan_intensity)
	rig.active = swinging

static func _apply_body_motion(
	model: Node3D, style: Dictionary, side_sign: float,
	phase: String, coil_blend: float, slash_u: float, recover_blend: float
) -> void:
	if model == null:
		return
	var coil_yaw := deg_to_rad(float(style.torso_coil_deg)) * side_sign
	var follow_yaw := deg_to_rad(float(style.torso_follow_deg)) * side_sign
	var coil_back := float(style.coil_back)
	var lunge := float(style.lunge)

	var pos := Vector3.ZERO
	var euler := Vector3.ZERO
	match phase:
		"coil":
			pos = Vector3(-coil_back * coil_blend, 0.02 * coil_blend, 0.05 * side_sign * coil_blend)
			euler = Vector3(deg_to_rad(5.0) * side_sign * coil_blend, coil_yaw * coil_blend, deg_to_rad(5.0) * coil_blend)
		"slash":
			pos = Vector3(lerpf(-coil_back, lunge, slash_u), lerpf(0.02, -0.05, slash_u), lerpf(0.05, -0.05, slash_u) * side_sign)
			euler = Vector3(
				deg_to_rad(lerpf(5.0, -8.0, slash_u)) * side_sign,
				lerpf(coil_yaw, follow_yaw, slash_u),
				deg_to_rad(lerpf(5.0, -9.0, slash_u))
			)
		"recover":
			var keep := 1.0 - recover_blend
			pos = Vector3(lunge * keep, -0.05 * keep, -0.05 * side_sign * keep)
			euler = Vector3(deg_to_rad(-8.0) * side_sign * keep, follow_yaw * keep, deg_to_rad(-9.0) * keep)
	model.transform = Transform3D(Basis.from_euler(euler), pos)

static func _apply_limb_motion(
	rig: Dictionary, hand: int, side_sign: float,
	phase: String, coil_blend: float, slash_u: float, recover_blend: float
) -> void:
	var kind := str(rig.kind)
	if not rig.arms.is_empty():
		var from_pose: Array = SUNBLADE_READY
		var to_pose: Array = SUNBLADE_READY
		var blend := 0.0
		match phase:
			"coil":
				from_pose = SUNBLADE_READY
				to_pose = SUNBLADE_COIL
				blend = coil_blend
			"slash":
				from_pose = SUNBLADE_COIL
				to_pose = SUNBLADE_FOLLOW
				blend = slash_u
			"recover":
				from_pose = SUNBLADE_FOLLOW
				to_pose = SUNBLADE_READY
				blend = recover_blend
		_apply_sunblade_arms(rig.arms, hand, side_sign, from_pose, to_pose, blend)
	elif kind == "duskblade" and rig.has("dusk_rig"):
		_apply_duskblade_limbs(rig.dusk_rig, side_sign, phase, coil_blend, slash_u, recover_blend)
	elif kind == "bulwark" and rig.has("bulwark_rig"):
		_apply_bulwark_limbs(rig.bulwark_rig, side_sign, phase, coil_blend, slash_u, recover_blend)

static func _apply_sunblade_arms(arms: Array, hand: int, side_sign: float, from_pose: Array, to_pose: Array, blend: float) -> void:
	for index in range(2):
		var arm: Dictionary = arms[index]
		var offset := 0 if index == hand else 2
		var sh: Vector3 = from_pose[offset].lerp(to_pose[offset], blend)
		var fa: Vector3 = from_pose[offset + 1].lerp(to_pose[offset + 1], blend)
		arm.shoulder.rotation_degrees = Vector3(sh.x * side_sign, sh.y * side_sign, sh.z)
		arm.forearm.rotation_degrees = Vector3(fa.x * side_sign, fa.y * side_sign, fa.z)

static func _apply_duskblade_limbs(
	dusk: Dictionary, side_sign: float, phase: String,
	coil_blend: float, slash_u: float, recover_blend: float
) -> void:
	var torso: Node3D = dusk.torso
	var arm_r: Node3D = dusk.arm_r
	var fore_r: Node3D = dusk.fore_r
	var arm_l: Node3D = dusk.arm_l
	# Total yaw chain: body (-22..+24) + torso (-14..+14) + arm_r (-44..+34) + fore_r (-14..+12) = -94..+84 deg!
	var coil_sh := Vector3(14.0 * side_sign, -44.0 * side_sign, 22.0)
	var follow_sh := Vector3(-14.0 * side_sign, 34.0 * side_sign, -14.0)
	var coil_fa := Vector3(0.0, -14.0 * side_sign, 14.0)
	var follow_fa := Vector3(0.0, 12.0 * side_sign, -10.0)

	var sh := Vector3.ZERO
	var fa := Vector3.ZERO
	var torso_yaw := 0.0
	match phase:
		"coil":
			sh = Vector3.ZERO.lerp(coil_sh, coil_blend)
			fa = Vector3.ZERO.lerp(coil_fa, coil_blend)
			torso_yaw = -14.0 * side_sign * coil_blend
		"slash":
			sh = coil_sh.lerp(follow_sh, slash_u)
			fa = coil_fa.lerp(follow_fa, slash_u)
			torso_yaw = lerpf(-14.0, 14.0, slash_u) * side_sign
		"recover":
			var keep := 1.0 - recover_blend
			sh = follow_sh * keep
			fa = follow_fa * keep
			torso_yaw = 14.0 * side_sign * keep
	if torso:
		torso.rotation_degrees = Vector3(0.0, torso_yaw, -4.0 * absf(torso_yaw) / 14.0)
	if arm_r:
		arm_r.rotation_degrees = sh
	if fore_r:
		fore_r.rotation_degrees = fa
	if arm_l:
		arm_l.rotation_degrees = Vector3(0.0, -sh.y * 0.45, -14.0)

static func _apply_bulwark_limbs(
	bulwark: Dictionary, _side_sign: float, phase: String,
	coil_blend: float, slash_u: float, recover_blend: float
) -> void:
	var head: Node3D = bulwark.head
	var mand_l: Node3D = bulwark.mand_l
	var mand_r: Node3D = bulwark.mand_r
	var spread := 0.0
	var head_pitch := 0.0
	match phase:
		"coil":
			spread = 54.0 * coil_blend
			head_pitch = 15.0 * coil_blend
		"slash":
			spread = lerpf(54.0, -48.0, slash_u)
			head_pitch = lerpf(15.0, -14.0, slash_u)
		"recover":
			var keep := 1.0 - recover_blend
			spread = -48.0 * keep
			head_pitch = -14.0 * keep
	if head:
		head.rotation_degrees = Vector3(0.0, 0.0, head_pitch)
	if mand_l:
		mand_l.rotation_degrees = Vector3(0.0, spread, 6.0)
	if mand_r:
		mand_r.rotation_degrees = Vector3(0.0, -spread, 6.0)

static func _reset_limbs(rig: Dictionary) -> void:
	if not rig.arms.is_empty():
		_apply_sunblade_arms(rig.arms, 1, 1.0, SUNBLADE_READY, SUNBLADE_READY, 0.0)
	elif rig.has("dusk_rig"):
		var dusk: Dictionary = rig.dusk_rig
		for key in ["torso", "arm_r", "fore_r", "arm_l"]:
			var limb: Node3D = dusk.get(key)
			if limb:
				limb.rotation = Vector3.ZERO
	elif rig.has("bulwark_rig"):
		var bulwark: Dictionary = rig.bulwark_rig
		for key in ["head", "mand_l", "mand_r"]:
			var limb: Node3D = bulwark.get(key)
			if limb:
				limb.rotation = Vector3.ZERO

static func _sync_fan_mesh(
	node: Node3D, rig: Dictionary, side_sign: float, draw_fan: bool,
	head_u: float, tail_u: float, intensity: float
) -> void:
	var samples: Array = rig.samples
	samples.clear()
	var trail: MeshInstance3D = rig.get("trail")
	if not draw_fan or head_u - tail_u <= 0.025 or intensity <= 0.015:
		if trail:
			trail.hide()
		return
	samples.append({"head": head_u, "tail": tail_u, "intensity": intensity})
	if trail == null:
		trail = MeshInstance3D.new()
		trail.name = "BladeSweepFan"
		trail.mesh = ImmediateMesh.new()
		trail.material_override = _slash_material()
		trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(trail)
		rig["trail"] = trail

	var mesh := trail.mesh as ImmediateMesh
	mesh.clear_surfaces()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	var style: Dictionary = rig.style
	if str(rig.kind) == "bulwark":
		_emit_fan_arc(mesh, style, side_sign, head_u, tail_u, intensity * 0.86, 1.0)
		_emit_fan_arc(mesh, style, -side_sign, head_u, minf(head_u - 0.05, tail_u + 0.24), intensity * 0.48, 0.90)
	else:
		_emit_fan_arc(mesh, style, side_sign, head_u, tail_u, intensity, 1.0)
	mesh.surface_end()
	trail.show()

static func _emit_fan_arc(
	mesh: ImmediateMesh, style: Dictionary, side_sign: float,
	head_u: float, tail_u: float, intensity: float, radius_scale: float
) -> void:
	var arc_from := deg_to_rad(float(style.arc_from_deg)) * side_sign
	var arc_to := deg_to_rad(float(style.arc_to_deg)) * side_sign
	var theta_tail := lerpf(arc_from, arc_to, tail_u)
	var theta_head := lerpf(arc_from, arc_to, head_u)
	var plane := Basis.from_euler(Vector3(
		deg_to_rad(float(style.tilt_roll_deg)) * side_sign,
		0.0,
		deg_to_rad(float(style.tilt_pitch_deg))
	))
	var pivot: Vector3 = style.pivot + Vector3(0.0, 0.0, 0.08 * side_sign)
	var inner_col: Color = style.inner
	var mid_col: Color = style.mid
	var rib_col: Color = style.rib
	var edge_col: Color = style.edge
	var ribs := float(style.ribs)

	var prev_pts: Array[Vector3] = []
	var prev_cols: Array[Color] = []

	for i in range(SLICES + 1):
		var u := float(i) / float(SLICES)
		var arc_t := lerpf(tail_u, head_u, u)
		var theta := lerpf(theta_tail, theta_head, u)

		# Crisp radial fan spokes locked in slash-arc angle + leading sword spoke at u -> 1.
		var spoke := pow(maxf(0.0, cos((arc_t * ribs - 0.30) * PI)), 11.0)
		var lead_blade := smoothstep(0.86, 0.99, u)
		var reach := (1.0 + 0.14 * maxf(0.0, cos(theta))) * radius_scale
		# Taper BOTH the trailing tail (u -> 0) and leading scimitar tip (u -> 1) into sleek crescent points!
		var crescent_arch := smoothstep(0.0, 0.22, u) * (1.0 - 0.24 * pow(smoothstep(0.85, 1.0, u), 1.6))
		var scallop := 1.0 + 0.075 * spoke

		var r3 := float(style.r_outer) * reach * lerpf(0.68, 1.0, crescent_arch) * scallop
		var r4 := r3 + float(style.halo_width) * radius_scale
		var edge_w := float(style.edge_width) * radius_scale * smoothstep(0.0, 0.22, u) * (1.0 - 0.55 * smoothstep(0.90, 1.0, u))
		var r2 := maxf(float(style.r_hub) * radius_scale + 0.06, r3 - edge_w)
		var open_fan := sin(pow(u, 0.68) * PI * 0.92)
		var r1 := lerpf(r2 * 0.94, float(style.r_hilt) * radius_scale, clampf(open_fan * 1.08, 0.0, 1.0))
		var r0 := float(style.r_hub) * radius_scale

		var bend := deg_to_rad(8.0) * side_sign
		var dir_hub := plane * Vector3(cos(theta + bend * 0.5), 0.0, -sin(theta + bend * 0.5))
		var dir_mid := plane * Vector3(cos(theta), 0.0, -sin(theta))
		var dir_rim := plane * Vector3(cos(theta - bend * 0.35), 0.0, -sin(theta - bend * 0.35))

		var env := smoothstep(0.0, 0.12, u) * (1.0 - 0.35 * smoothstep(0.95, 1.0, u)) * (0.34 + 0.66 * pow(u, 1.15)) * intensity
		var spoke_boost := clampf(spoke * 0.85 + lead_blade * 0.75, 0.0, 1.0)

		var c0 := Color(inner_col.r, inner_col.g, inner_col.b, 0.0)
		var c1 := inner_col.lerp(rib_col, spoke_boost)
		c1.a = clampf(env * (0.12 + 0.58 * spoke + 0.42 * lead_blade), 0.0, 0.86)
		var c2 := mid_col.lerp(rib_col, spoke_boost * 0.8)
		c2.a = clampf(env * (0.42 + 0.44 * spoke + 0.32 * lead_blade), 0.0, 0.94)
		var c3 := mid_col.lerp(edge_col, 0.65 + 0.35 * spoke_boost)
		c3.a = clampf(env * (0.86 + 0.22 * spoke_boost), 0.0, 0.98)
		var c4 := Color(mid_col.r, mid_col.g, mid_col.b, 0.0)

		var cur_pts: Array[Vector3] = [
			pivot + dir_hub * r0,
			pivot + dir_hub.lerp(dir_mid, 0.5).normalized() * r1,
			pivot + dir_mid * r2,
			pivot + dir_rim * r3,
			pivot + dir_rim * r4,
		]
		var cur_cols: Array[Color] = [c0, c1, c2, c3, c4]

		if not prev_pts.is_empty():
			for band in range(4):
				mesh.surface_set_color(prev_cols[band])
				mesh.surface_add_vertex(prev_pts[band])
				mesh.surface_set_color(cur_cols[band])
				mesh.surface_add_vertex(cur_pts[band])
				mesh.surface_set_color(cur_cols[band + 1])
				mesh.surface_add_vertex(cur_pts[band + 1])

				mesh.surface_set_color(prev_cols[band])
				mesh.surface_add_vertex(prev_pts[band])
				mesh.surface_set_color(cur_cols[band + 1])
				mesh.surface_add_vertex(cur_pts[band + 1])
				mesh.surface_set_color(prev_cols[band + 1])
				mesh.surface_add_vertex(prev_pts[band + 1])

		prev_pts = cur_pts
		prev_cols = cur_cols

static func _slash_material() -> StandardMaterial3D:
	if _sweep_material == null:
		_sweep_material = StandardMaterial3D.new()
		_sweep_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_sweep_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_sweep_material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_sweep_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_sweep_material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
		_sweep_material.vertex_color_use_as_albedo = true
	return _sweep_material
