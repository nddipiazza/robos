extends RefCounted

const BladeMelee = preload("res://scripts/RTSBladeMelee.gd")

static func bind(model: Node3D) -> Dictionary:
	return BladeMelee.bind(model, "sunblade", 1.0, {"kind": "melee", "color": "#2ea8ff"})

static func strike(rig: Dictionary, time: float, attacks: int = 1) -> void:
	BladeMelee.strike(rig, time, attacks)

static func sync(node: Node3D, unit: Dictionary, rig: Dictionary, time: float) -> void:
	BladeMelee.sync(node, unit, rig, time)
