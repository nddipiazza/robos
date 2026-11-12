extends RefCounted

const PROFILES = preload("res://scripts/RTSAttackProfiles.gd")

static func profile(unit_type: String) -> Dictionary:
	return PROFILES.WEAPONS.get(unit_type, {})

static func anchors(model: Node3D, attack: Dictionary) -> Array[Vector3]:
	var result: Array[Vector3] = []
	for key in ["socket", "secondary"]:
		var socket_name := str(attack.get(key, ""))
		if socket_name.is_empty():
			continue
		var socket := model.find_child(socket_name, true, false) as Node3D
		if socket:
			var offset := socket.position
			var parent := socket.get_parent() as Node3D
			while parent != model:
				offset = parent.transform * offset
				parent = parent.get_parent() as Node3D
			result.append(offset)
	return result

static func pose(unit: Dictionary, attack: Dictionary, age: float) -> Transform3D:
	var kick := float(attack.kick)
	var recovery := float(attack.recover)
	var strength := smoothstep(0.0, kick, age) * (1.0 - smoothstep(kick, recovery, age))
	var kind := str(attack.kind)
	var pitch := deg_to_rad(float(attack.pitch))
	if unit.attack_state == "windup" and strength < 0.01:
		var windup := float(unit.get("attack_state_timer", 0.0))
		var charge := 1.0 - smoothstep(0.0, 0.14, windup)
		return Transform3D(Basis(Vector3.BACK, -pitch * 0.38 * charge), Vector3(-0.09 * charge, 0, 0))
	var travel := float(attack.recoil) * strength * (1.0 if kind in ["melee", "arc"] else -1.0)
	return Transform3D(Basis(Vector3.BACK, pitch * strength), Vector3(travel, 0, 0))
