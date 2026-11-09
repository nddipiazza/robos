extends RefCounted

# RTSModels.gd — procedural low-poly models for every unit, structure and resource.
# Shared by the world renderer and by the portrait renderer used in the HUD, so the
# portraits always match what is on the battlefield. Local +X is the facing direction.

static var _mats: Dictionary = {}

# ---------------------------------------------------------------------------
# Palettes
# ---------------------------------------------------------------------------
const STEEL := Color("#8d98a6")
const STEEL_DARK := Color("#2c333d")
const STEEL_LIGHT := Color("#c7d0db")
const WORK_SUIT := Color("#d98a2b")
const VISOR := Color("#7dd3fc")

const CHITIN := Color("#4b3a54")
const CHITIN_LIGHT := Color("#7b5a8c")
const CHITIN_DARK := Color("#2a2130")
const ACID := Color("#5f9a1a")

const IVORY := Color("#bdb297")
const GOLD := Color("#b68d2c")
const CRYSTAL := Color("#4fd1ff")
const GAS := Color("#53dea0")
const STONE_DARK := Color("#3a4150")

static func mat(key: String, color: Color, emit: Color = Color.BLACK, emit_energy: float = 1.0, metallic: float = 0.15, rough: float = 0.7, alpha: float = 1.0) -> StandardMaterial3D:
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(color.r, color.g, color.b, alpha)
	m.metallic = metallic
	m.roughness = rough
	if emit != Color.BLACK:
		m.emission_enabled = true
		m.emission = emit
		m.emission_energy_multiplier = emit_energy
	if alpha < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mats[key] = m
	return m

static func team_mat(owner_id: int) -> StandardMaterial3D:
	var c: Color = RTSData.get_player_color(owner_id)
	return mat("team_%d" % owner_id, c, c, 0.35, 0.25, 0.5)

static func team_glow(owner_id: int) -> StandardMaterial3D:
	var c: Color = RTSData.get_player_color(owner_id)
	return mat("teamglow_%d" % owner_id, c, c, 2.2, 0.0, 0.3)

# ---------------------------------------------------------------------------
# Part helpers
# ---------------------------------------------------------------------------
static func _add(parent: Node3D, mesh: Mesh, m: Material, pos: Vector3, rot: Vector3, scl: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = m
	mi.position = pos
	mi.rotation_degrees = rot
	mi.scale = scl
	parent.add_child(mi)
	return mi

static func box(parent: Node3D, size: Vector3, m: Material, pos: Vector3 = Vector3.ZERO, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var b := BoxMesh.new()
	b.size = size
	return _add(parent, b, m, pos, rot, Vector3.ONE)

static func cyl(parent: Node3D, r_top: float, r_bot: float, h: float, m: Material, pos: Vector3 = Vector3.ZERO, rot: Vector3 = Vector3.ZERO, seg: int = 14) -> MeshInstance3D:
	var c := CylinderMesh.new()
	c.top_radius = r_top
	c.bottom_radius = r_bot
	c.height = h
	c.radial_segments = seg
	c.rings = 1
	return _add(parent, c, m, pos, rot, Vector3.ONE)

static func sph(parent: Node3D, r: float, m: Material, pos: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE, seg: int = 16) -> MeshInstance3D:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = seg
	s.rings = max(4, seg / 2)
	return _add(parent, s, m, pos, Vector3.ZERO, scl)

static func caps(parent: Node3D, r: float, h: float, m: Material, pos: Vector3 = Vector3.ZERO, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var c := CapsuleMesh.new()
	c.radius = r
	c.height = h
	c.radial_segments = 12
	c.rings = 4
	return _add(parent, c, m, pos, rot, Vector3.ONE)

static func cone(parent: Node3D, r: float, h: float, m: Material, pos: Vector3 = Vector3.ZERO, rot: Vector3 = Vector3.ZERO, seg: int = 8) -> MeshInstance3D:
	return cyl(parent, 0.0, r, h, m, pos, rot, seg)

static func ring(parent: Node3D, inner: float, outer: float, m: Material, pos: Vector3 = Vector3.ZERO, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var t := TorusMesh.new()
	t.inner_radius = inner
	t.outer_radius = outer
	t.rings = 24
	t.ring_segments = 8
	return _add(parent, t, m, pos, rot, Vector3.ONE)

static func quad(parent: Node3D, size: Vector2, m: Material, pos: Vector3 = Vector3.ZERO, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var q := QuadMesh.new()
	q.size = size
	return _add(parent, q, m, pos, rot, Vector3.ONE)

# Six thin legs / spokes spread around Y; used by bugs and walkers.
static func _legs(parent: Node3D, m: Material, pairs: int, spread: float, leg_len: float, leg_r: float, y: float, x_off: float, tilt: float) -> void:
	for i in range(pairs):
		var x := x_off + (float(i) - float(pairs - 1) * 0.5) * spread
		for side in [-1.0, 1.0]:
			cyl(parent, leg_r * 0.6, leg_r, leg_len, m, Vector3(x, y, side * leg_len * 0.38), Vector3(side * tilt, 0.0, 0.0), 6)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
static func build(unit_type: String, owner_id: int) -> Node3D:
	var root := Node3D.new()
	var d: Dictionary = RTSData.get_unit_def(unit_type)
	var r: float = float(d.get("radius", 0.85))
	var team := team_mat(owner_id)
	var glow := team_glow(owner_id)
	match unit_type:
		"pioneer": _pioneer(root, team)
		"prospector": _prospector(root, team, glow)
		"rifleman": _rifleman(root, team)
		"breacher": _breacher(root, team)
		"triage_specialist": _triage_specialist(root, team)
		"kestrel_interceptor": _kestrel_interceptor(root, team, glow)
		"kestrel_assault": _kestrel_assault(root, team, glow)
		"rampart_transport": _rampart_transport(root, team, glow)
		"howitzer": _howitzer(root, r, team, false)
		"howitzer_emplaced": _howitzer(root, r, team, true)
		"colony_hub": _colony_hub(root, r, team)
		"silo": _silo(root, r, team, false)
		"silo_retracted": _silo(root, r, team, true)
		"aether_tap": _aether_tap(root, r, team)
		"muster_hall": _muster_hall(root, r, team)
		"fabrication_module": _fabrication_module(root, team)
		"research_module": _research_module(root, team, glow)
		"workshop": _workshop(root, r, team)
		"airframe_hangar": _airframe_hangar(root, team, glow)
		"sentry_turret": _sentry_turret(root, r, team)
		"forager": _forager(root, glow)
		"skitterling": _skitterling(root, glow)
		"bile_crawler": _bile_crawler(root, glow)
		"blight_hurler": _blight_hurler(root, glow)
		"drift_sac": _drift_sac(root, glow)
		"needlewing": _needlewing(root, glow)
		"blight_spire": _blight_spire(root, glow)
		"brood_nest": _brood_nest(root, r, glow)
		"brood_pod", "spore_tap": _brood_fixture(root, r, glow, unit_type == "spore_tap")
		"brood_growth_node": _brood_growth_node(root, r, glow)
		"mote": _mote(root, glow)
		"lumen_carrier": _lumen_carrier(root, team)
		"sunblade": _sunblade(root, team)
		"skirmisher": _skirmisher(root, team)
		"spire_walker": _spire_walker(root, team)
		"heartstone": _heartstone(root, r, team)
		"resonator": _resonator(root, team)
		"aegis_relay": _aegis_relay(root, r, glow)
		"waystone": _waystone(root, r, team)
		"aether_prism": _aether_prism(root, r, glow)
		"shale_barrier": _shale_barrier(root)
		_: box(root, Vector3(r * 1.5, 1.4, r * 1.5), mat("fallback", STEEL), Vector3(0, 0.7, 0))
	return root

static func _shale_barrier(root: Node3D) -> void:
	var dark := mat("shale_dark", Color("#494449"))
	var light := mat("shale_light", Color("#80756c"))
	for offset in [-3.2, 0.0, 3.2]:
		var slab := sph(root, 2.3, dark, Vector3(offset * 0.38, 1.35, offset), Vector3(1.08, 0.9, 0.8), 7)
		slab.rotation_degrees = Vector3(12, offset * 12, 25)
		sph(root, 1.45, light, Vector3(offset * 0.38 - 0.7, 2.5, offset + 0.6), Vector3(0.95, 0.65, 1.2), 7)

static func _triage_specialist(root: Node3D, team: Material) -> void:
	var shell := mat("triage_shell", Color("#d7e0dc"))
	var mint := mat("triage_kit", Color("#65e6a2"), Color("#2a7452"))
	var boots := mat("triage_boots", Color("#263341"))
	sph(root, 0.36, shell, Vector3(0.12, 1.92, 0.0))
	box(root, Vector3(0.66, 0.78, 0.69), team, Vector3(0.0, 1.23, 0.0))
	box(root, Vector3(0.42, 0.78, 0.69), shell, Vector3(-0.42, 1.2, 0.0))
	box(root, Vector3(0.08, 0.46, 0.12), mint, Vector3(-0.66, 1.22, 0.0))
	box(root, Vector3(0.08, 0.12, 0.45), mint, Vector3(-0.66, 1.22, 0.0))
	for side in [-1.0, 1.0]:
		box(root, Vector3(0.42, 0.73, 0.23), boots, Vector3(0.1, 0.38, side * 0.21))
	box(root, Vector3(0.7, 0.22, 0.27), mint, Vector3(0.54, 1.18, 0.24))

static func _aegis_relay(root: Node3D, radius: float, glow: Material) -> void:
	var ceramic := mat("relay_ceramic", Color("#877dc6"), Color("#231d4d"))
	var crystal := mat("relay_crystal", Color("#84d8f8"), Color("#3d89a9"))
	cyl(root, radius * 0.66, radius, 0.52, ceramic, Vector3(0, 0.26, 0), Vector3.ZERO, 6)
	for i in range(3):
		var angle := TAU * float(i) / 3.0
		box(root, Vector3(0.24, 1.85, 0.42), glow, Vector3(cos(angle) * radius * 0.62, 1.12, sin(angle) * radius * 0.62), Vector3(0, -rad_to_deg(angle), 12))
	cone(root, 0.69, 1.18, crystal, Vector3(0, 2.18, 0), Vector3.ZERO, 6)
	cone(root, 0.69, 0.81, crystal, Vector3(0, 1.26, 0), Vector3(180, 0, 0), 6)

static func _kestrel_interceptor(root: Node3D, team: Material, glow: Material) -> void:
	var hull := mat("kestrel_hull", Color("#8a9aac"))
	var glass := mat("kestrel_canopy", Color("#16364c"), Color("#285876"))
	cyl(root, 0.13, 0.58, 2.65, hull, Vector3(0.12, 0.28, 0.0), Vector3(0, 0, -90), 6)
	sph(root, 0.43, glass, Vector3(0.44, 0.57, 0), Vector3(1.4, 0.64, 0.87))
	for side in [-1.0, 1.0]:
		box(root, Vector3(1.28, 0.16, 1.15), team, Vector3(-0.23, 0.27, side * 0.76), Vector3(0, side * 26.0, 0))
		cyl(root, 0.24, 0.32, 1.55, hull, Vector3(-0.36, 0.36, side * 0.84), Vector3(0, 0, -90), 8)
		sph(root, 0.20, glow, Vector3(-1.15, 0.36, side * 0.84), Vector3(0.48, 1, 1))

static func _rampart_transport(root: Node3D, team: Material, glow: Material) -> void:
	var hull := mat("rampart_hull", STEEL_DARK)
	var glass := mat("rampart_glass", Color("#183648"), Color("#3a6e84"))
	box(root, Vector3(2.8, 0.72, 1.48), hull, Vector3(-0.15, 0.37, 0))
	box(root, Vector3(1.82, 0.21, 1.5), team, Vector3(-0.27, 0.82, 0))
	box(root, Vector3(0.55, 0.43, 1.16), glass, Vector3(1.27, 0.49, 0), Vector3(0, 0, -13))
	box(root, Vector3(0.7, 0.1, 1.25), hull, Vector3(-1.43, 0.23, 0), Vector3(0, 0, 18))
	for side in [-1.0, 1.0]:
		box(root, Vector3(1.5, 0.16, 0.62), team, Vector3(-0.25, 0.51, side * 0.94))
		cyl(root, 0.33, 0.38, 1.75, hull, Vector3(-0.31, 0.48, side * 1.15), Vector3(0, 0, -90), 8)
		sph(root, 0.26, glow, Vector3(-1.24, 0.48, side * 1.15), Vector3(0.46, 1, 1))

static func _kestrel_assault(root: Node3D, team: Material, glow: Material) -> void:
	_kestrel_interceptor(root, team, glow)
	var strut := mat("kestrel_strut", STEEL_DARK)
	for side in [-1.0, 1.0]:
		box(root, Vector3(0.15, 0.34, 0.17), strut, Vector3(0.21, 0.16, side * 0.62))
		box(root, Vector3(0.57, 0.10, 0.25), team, Vector3(0.29, 0.06, side * 0.64))
		cyl(root, 0.11, 0.16, 0.82, strut, Vector3(0.94, 0.45, side * 0.69), Vector3(0, 0, -90), 8)

static func _airframe_hangar(root: Node3D, team: Material, glow: Material) -> void:
	var steel := mat("airframe_steel", STEEL_DARK)
	var door := mat("airframe_door", Color("#101d29"))
	box(root, Vector3(5.8, 0.26, 5.8), steel, Vector3(0, 0.13, 0))
	box(root, Vector3(4.5, 2.0, 4.8), steel, Vector3(-0.28, 1.14, 0))
	box(root, Vector3(4.56, 0.38, 5.03), team, Vector3(-0.28, 2.24, 0))
	box(root, Vector3(0.14, 1.54, 3.38), door, Vector3(2.0, 0.94, 0))
	for side in [-1.0, 1.0]:
		box(root, Vector3(4.8, 0.32, 0.28), team, Vector3(-0.17, 1.88, side * 2.3))
		box(root, Vector3(0.15, 1.56, 0.09), glow, Vector3(2.12, 0.94, side * 1.77))
		box(root, Vector3(0.56, 0.045, 0.11), glow, Vector3(2.56, 0.28, side * 0.82))

# ---------------------------------------------------------------------------
# Humans — Meridian Guard
# ---------------------------------------------------------------------------
static func _pioneer(root: Node3D, team: Material) -> void:
	var suit := mat("h_suit", WORK_SUIT, Color.BLACK, 1.0, 0.1, 0.8)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var helm := mat("h_helm", STEEL_LIGHT, Color.BLACK, 1.0, 0.3, 0.5)
	var visor := mat("h_visor", VISOR, VISOR, 1.6, 0.0, 0.2)
	caps(root, 0.34, 1.25, suit, Vector3(0, 0.72, 0))
	sph(root, 0.28, helm, Vector3(0.03, 1.5, 0))
	box(root, Vector3(0.16, 0.14, 0.34), visor, Vector3(0.24, 1.52, 0))
	box(root, Vector3(0.34, 0.62, 0.5), dark, Vector3(-0.3, 0.95, 0))
	box(root, Vector3(0.24, 0.12, 0.74), team, Vector3(0.0, 1.22, 0))
	box(root, Vector3(0.7, 0.13, 0.13), dark, Vector3(0.5, 0.95, 0.32), Vector3(0, -12, 0))
	var tip := mat("h_weld", Color("#ffb347"), Color("#ff8a1f"), 3.0, 0.0, 0.3)
	sph(root, 0.1, tip, Vector3(0.88, 0.95, 0.3))

static func _prospector(root: Node3D, team: Material, glow: Material) -> void:
	var steel := mat("prospector_chassis", STEEL_DARK, Color.BLACK, 1.0, 0.45, 0.48)
	for side in [-1.0, 1.0]:
		box(root, Vector3(1.44, 0.38, 0.36), steel, Vector3(-0.05, 0.23, 0.51 * side))
		for x in [-0.52, 0.0, 0.52]:
			cyl(root, 0.13, 0.13, 0.14, team, Vector3(x, 0.24, 0.69 * side), Vector3(90, 0, 0), 8)
	box(root, Vector3(1.16, 0.51, 0.96), team, Vector3(-0.15, 0.52, 0))
	box(root, Vector3(0.71, 0.24, 0.72), steel, Vector3(-0.31, 0.89, 0))
	cyl(root, 0.10, 0.27, 0.72, steel, Vector3(0.73, 0.57, 0), Vector3(0, 0, -90), 8)
	sph(root, 0.14, glow, Vector3(0.43, 0.88, 0))

static func _rifleman(root: Node3D, team: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var visor := mat("h_visor", VISOR, VISOR, 1.6, 0.0, 0.2)
	caps(root, 0.3, 1.3, armor, Vector3(0, 0.75, 0))
	sph(root, 0.25, armor, Vector3(0.02, 1.52, 0))
	box(root, Vector3(0.14, 0.12, 0.3), visor, Vector3(0.22, 1.54, 0))
	box(root, Vector3(0.26, 0.22, 0.24), team, Vector3(0.0, 1.27, 0.36))
	box(root, Vector3(0.26, 0.22, 0.24), team, Vector3(0.0, 1.27, -0.36))
	box(root, Vector3(0.28, 0.55, 0.4), dark, Vector3(-0.28, 0.95, 0))
	box(root, Vector3(1.15, 0.12, 0.12), dark, Vector3(0.58, 1.02, 0.18))
	box(root, Vector3(0.3, 0.2, 0.14), armor, Vector3(0.28, 0.98, 0.18))
	box(root, Vector3(0.12, 0.08, 0.1), mat("h_muzzle", Color("#ffe29a"), Color("#ffcc55"), 1.5), Vector3(1.2, 1.02, 0.18))

static func _breacher(root: Node3D, team: Material) -> void:
	var armor := mat("h_armor_heavy", Color("#6f7b8a"), Color.BLACK, 1.0, 0.45, 0.5)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var visor := mat("h_visor", VISOR, VISOR, 1.6, 0.0, 0.2)
	caps(root, 0.46, 1.55, armor, Vector3(0, 0.9, 0))
	sph(root, 0.3, armor, Vector3(0.04, 1.85, 0))
	box(root, Vector3(0.16, 0.14, 0.4), visor, Vector3(0.3, 1.88, 0))
	box(root, Vector3(0.46, 0.34, 0.42), team, Vector3(0.0, 1.55, 0.58))
	box(root, Vector3(0.46, 0.34, 0.42), team, Vector3(0.0, 1.55, -0.58))
	box(root, Vector3(0.4, 0.8, 0.7), dark, Vector3(-0.38, 1.1, 0))
	cyl(root, 0.17, 0.2, 1.25, dark, Vector3(0.6, 1.5, 0.52), Vector3(0, 0, -90), 10)
	cyl(root, 0.26, 0.26, 0.3, armor, Vector3(0.05, 1.5, 0.52), Vector3(90, 0, 0), 10)
	cyl(root, 0.1, 0.1, 0.9, dark, Vector3(0.2, 0.55, -0.48), Vector3(0, 0, -90), 8)

static func _howitzer(root: Node3D, r: float, team: Material, emplaced: bool) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var y0 := 0.0 if not emplaced else -0.15
	for side in [-1.0, 1.0]:
		box(root, Vector3(r * 1.9, 0.6, 0.55), dark, Vector3(0, 0.32 + y0, side * r * 0.62))
		for i in range(5):
			cyl(root, 0.17, 0.17, 0.62, armor, Vector3((float(i) - 2.0) * r * 0.42, 0.32 + y0, side * r * 0.62), Vector3(90, 0, 0), 8)
	box(root, Vector3(r * 1.6, 0.75, r * 1.05), armor, Vector3(0, 0.85 + y0, 0))
	box(root, Vector3(r * 1.2, 0.08, 0.34), team, Vector3(-0.15, 1.25 + y0, 0))
	var turret := Node3D.new()
	turret.position = Vector3(-0.1, 1.45 + y0, 0)
	root.add_child(turret)
	box(turret, Vector3(r * 0.95, 0.6, r * 0.85), armor, Vector3.ZERO)
	sph(turret, 0.42, armor, Vector3(-0.2, 0.32, 0), Vector3(1.3, 0.55, 1.0))
	var gun := Node3D.new()
	gun.position = Vector3(r * 0.4, 0.1, 0)
	gun.rotation_degrees = Vector3(0, 0, 4.0 if not emplaced else 26.0)
	turret.add_child(gun)
	var blen := 2.8 if not emplaced else 4.2
	cyl(gun, 0.17, 0.2, blen, dark, Vector3(blen * 0.5, 0, 0), Vector3(0, 0, -90), 10)
	cyl(gun, 0.3, 0.3, 0.45, armor, Vector3(blen, 0, 0), Vector3(0, 0, -90), 10)
	cyl(gun, 0.28, 0.28, 0.5, armor, Vector3(0.3, 0, 0), Vector3(0, 0, -90), 10)
	if emplaced:
		for sx in [-1.0, 1.0]:
			for sz in [-1.0, 1.0]:
				box(root, Vector3(0.28, 0.26, 1.7), dark, Vector3(sx * r * 0.78, 0.32, sz * r * 0.96), Vector3(0, -sx * sz * 18.0, 0))
				box(root, Vector3(0.7, 0.14, 0.7), armor, Vector3(sx * r * 0.92, 0.06, sz * r * 1.55))

static func _colony_hub(root: Node3D, r: float, team: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var light := mat("h_win", Color("#ffe6a8"), Color("#ffd27a"), 1.6, 0.0, 0.4)
	var w := r * 1.8
	box(root, Vector3(w, 0.5, w), dark, Vector3(0, 0.25, 0))
	box(root, Vector3(w * 0.78, 2.7, w * 0.78), armor, Vector3(0, 1.85, 0))
	box(root, Vector3(w * 0.86, 0.35, w * 0.86), dark, Vector3(0, 3.35, 0))
	box(root, Vector3(w * 0.78, 0.12, 0.7), team, Vector3(0, 3.57, 0))
	sph(root, 1.7, armor, Vector3(0, 3.5, 0), Vector3(1, 0.6, 1), 18)
	cyl(root, 0.07, 0.1, 3.2, dark, Vector3(1.2, 5.4, -1.0), Vector3.ZERO, 6)
	sph(root, 0.2, team, Vector3(1.2, 7.1, -1.0))
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			box(root, Vector3(0.9, 3.0, 0.9), dark, Vector3(sx * w * 0.42, 1.7, sz * w * 0.42))
			box(root, Vector3(0.98, 0.16, 0.98), team, Vector3(sx * w * 0.42, 3.15, sz * w * 0.42))
	box(root, Vector3(0.12, 1.9, 2.2), dark, Vector3(w * 0.4, 1.45, 0))
	for i in range(4):
		box(root, Vector3(0.1, 0.4, 0.5), light, Vector3(w * 0.4 + 0.04, 2.6, (float(i) - 1.5) * 1.3))
		box(root, Vector3(0.5, 0.4, 0.1), light, Vector3((float(i) - 1.5) * 1.3, 2.6, w * 0.4 + 0.04))

static func _silo(root: Node3D, r: float, team: Material, retracted: bool) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	if retracted:
		cyl(root, r * 0.85, r * 0.9, 0.3, armor, Vector3(0, 0.15, 0), Vector3.ZERO, 20)
		ring(root, r * 0.55, r * 0.7, team, Vector3(0, 0.32, 0))
		cyl(root, r * 0.5, r * 0.5, 0.06, dark, Vector3(0, 0.33, 0), Vector3.ZERO, 16)
		return
	cyl(root, r * 0.72, r * 0.78, 2.4, armor, Vector3(0, 1.2, 0), Vector3.ZERO, 20)
	cyl(root, r * 0.8, r * 0.8, 0.22, team, Vector3(0, 0.55, 0), Vector3.ZERO, 20)
	cyl(root, r * 0.8, r * 0.8, 0.22, dark, Vector3(0, 1.6, 0), Vector3.ZERO, 20)
	sph(root, r * 0.72, armor, Vector3(0, 2.4, 0), Vector3(1, 0.4, 1), 18)
	cyl(root, 0.35, 0.35, 0.12, dark, Vector3(0, 2.72, 0), Vector3.ZERO, 10)
	for i in range(3):
		var a := TAU * float(i) / 3.0
		box(root, Vector3(0.22, 0.5, 0.22), dark, Vector3(cos(a) * r * 0.7, 0.25, sin(a) * r * 0.7))

static func _sentry_turret(root: Node3D, r: float, team: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var sensor := mat("sentry_sensor", Color("#8cf2fc"), Color("#22d3ee"), 1.7)
	cyl(root, r * 0.85, r, 0.45, dark, Vector3(0, 0.23, 0), Vector3.ZERO, 12)
	cyl(root, 0.72, 1.03, 1.4, armor, Vector3(0, 1.0, 0), Vector3.ZERO, 10)
	box(root, Vector3(1.65, 0.68, 1.35), armor, Vector3(0, 1.9, 0))
	box(root, Vector3(1.3, 0.12, 1.2), team, Vector3(0, 2.26, 0))
	for side in [-1, 1]:
		box(root, Vector3(1.85, 0.24, 0.26), dark, Vector3(1.18, 1.92, side * 0.42))
		box(root, Vector3(0.16, 0.13, 0.16), sensor, Vector3(2.1, 1.92, side * 0.42))
	cyl(root, 0.06, 0.1, 0.5, dark, Vector3(-0.48, 2.5, 0), Vector3.ZERO, 8)
	sph(root, 0.24, sensor, Vector3(-0.48, 2.82, 0))

static func _aether_tap(root: Node3D, r: float, team: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var core := mat("aether_core", Color("#6ee7a8"), Color("#34d399"), 2.4, 0.0, 0.3)
	cyl(root, r * 0.9, r * 1.0, 0.45, dark, Vector3(0, 0.22, 0), Vector3.ZERO, 18)
	for i in range(4):
		var a := TAU * float(i) / 4.0 + 0.4
		cyl(root, 0.1, 0.16, 3.6, armor, Vector3(cos(a) * 1.15, 1.9, sin(a) * 1.15), Vector3(-sin(a) * 14.0, 0, cos(a) * 14.0), 6)
	cyl(root, 0.42, 0.5, 3.4, armor, Vector3(0, 1.9, 0), Vector3.ZERO, 12)
	cyl(root, 0.5, 0.5, 0.28, team, Vector3(0, 2.4, 0), Vector3.ZERO, 12)
	sph(root, 0.55, core, Vector3(0, 3.75, 0))
	sph(root, 0.9, armor, Vector3(1.55, 0.95, 0.3), Vector3.ONE, 14)
	cyl(root, 0.1, 0.1, 1.6, dark, Vector3(1.0, 1.4, 0.15), Vector3(0, 0, 70), 6)

static func _muster_hall(root: Node3D, r: float, team: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var light := mat("h_win", Color("#ffe6a8"), Color("#ffd27a"), 1.6, 0.0, 0.4)
	box(root, Vector3(r * 1.75, 0.35, r * 1.5), dark, Vector3(0, 0.17, 0))
	box(root, Vector3(r * 1.55, 1.95, r * 1.25), armor, Vector3(0, 1.3, 0))
	box(root, Vector3(r * 1.7, 0.28, r * 1.4), dark, Vector3(0, 2.4, 0))
	box(root, Vector3(r * 1.5, 0.1, 0.55), team, Vector3(0, 2.58, 0))
	box(root, Vector3(0.1, 1.45, 1.7), dark, Vector3(r * 0.78, 1.1, 0))
	for i in range(3):
		box(root, Vector3(0.1, 0.3, 0.45), light, Vector3(r * 0.78 + 0.03, 1.9, (float(i) - 1.0) * 0.75))
	cyl(root, 0.06, 0.06, 3.4, dark, Vector3(-r * 0.6, 4.0, r * 0.5), Vector3.ZERO, 6)
	box(root, Vector3(0.05, 0.6, 1.0), team, Vector3(-r * 0.6, 5.3, r * 0.5 + 0.5))
	for i in range(4):
		sph(root, 0.28, mat("h_sand", Color("#b9a67a"), Color.BLACK, 1.0, 0.0, 0.95), Vector3(r * 0.95, 0.28, (float(i) - 1.5) * 0.7), Vector3(1.2, 0.8, 1.0), 8)

static func _fabrication_module(root: Node3D, team: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var light := mat("h_win", Color("#ffe6a8"), Color("#ffd27a"), 1.6, 0.0, 0.4)
	box(root, Vector3(2.55, 0.34, 2.3), dark, Vector3(0, 0.17, 0))
	box(root, Vector3(2.18, 1.0, 1.74), armor, Vector3(0, 0.82, 0))
	box(root, Vector3(0.3, 0.74, 1.2), team, Vector3(-1.06, 0.58, 0))
	for side in [-0.52, 0.52]:
		cyl(root, 0.3, 0.38, 0.85, dark, Vector3(0.24, 1.52, side), Vector3.ZERO, 10)
		cyl(root, 0.29, 0.29, 0.12, team, Vector3(0.24, 1.99, side), Vector3.ZERO, 10)
		box(root, Vector3(0.07, 0.18, 0.27), light, Vector3(1.1, 0.92, side))

static func _research_module(root: Node3D, team: Material, glow: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	box(root, Vector3(2.55, 0.34, 2.3), dark, Vector3(0, 0.17, 0))
	box(root, Vector3(2.0, 0.95, 1.72), armor, Vector3(0, 0.8, 0))
	box(root, Vector3(0.32, 0.66, 1.25), team, Vector3(-1.03, 0.57, 0))
	cyl(root, 0.2, 0.28, 0.65, dark, Vector3(0.32, 1.56, 0), Vector3.ZERO, 10)
	cyl(root, 0.62, 0.38, 0.23, team, Vector3(0.39, 1.96, 0), Vector3(0, 0, -30), 14)
	cyl(root, 0.045, 0.065, 0.42, dark, Vector3(0.52, 2.24, 0), Vector3(0, 0, -30), 7)
	sph(root, 0.1, glow, Vector3(0.62, 2.47, 0))

static func _workshop(root: Node3D, r: float, team: Material) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	box(root, Vector3(r * 1.8, 0.35, r * 1.6), dark, Vector3(0, 0.17, 0))
	box(root, Vector3(r * 1.6, 2.2, r * 1.35), armor, Vector3(0, 1.45, 0))
	for i in range(2):
		var roof := box(root, Vector3(r * 0.72, 0.9, r * 1.4), dark, Vector3((float(i) - 0.5) * r * 0.8, 2.85, 0))
		roof.rotation_degrees = Vector3(0, 0, 0)
	box(root, Vector3(r * 1.6, 0.1, 0.5), team, Vector3(0, 2.57, r * 0.45))
	for i in range(2):
		cyl(root, 0.26, 0.34, 2.4, dark, Vector3(-r * 0.55 + i * 0.9, 4.2, -r * 0.4), Vector3.ZERO, 10)
		cyl(root, 0.3, 0.3, 0.12, team, Vector3(-r * 0.55 + i * 0.9, 5.45, -r * 0.4), Vector3.ZERO, 10)
	cyl(root, 0.85, 0.85, 0.28, team, Vector3(r * 0.82, 1.6, 0), Vector3(0, 0, 90), 14)
	box(root, Vector3(0.1, 1.5, 2.0), dark, Vector3(r * 0.84, 0.95, r * 0.35))
	box(root, Vector3(2.2, 0.16, 0.16), dark, Vector3(0.4, 3.2, r * 0.8))
	cyl(root, 0.05, 0.05, 1.0, dark, Vector3(1.4, 2.7, r * 0.8), Vector3.ZERO, 6)

# ---------------------------------------------------------------------------
# Monsters — Gnarl Brood
# ---------------------------------------------------------------------------
static func _bug_mats() -> Array:
	return [
		mat("m_chitin", CHITIN, Color.BLACK, 1.0, 0.25, 0.45),
		mat("m_chitin_light", CHITIN_LIGHT, Color.BLACK, 1.0, 0.2, 0.5),
		mat("m_chitin_dark", CHITIN_DARK, Color.BLACK, 1.0, 0.3, 0.5),
		mat("m_acid", ACID, ACID, 0.22, 0.0, 0.55),
	]

static func _forager(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, 0.5, m[0], Vector3(0, 0.55, 0), Vector3(1.3, 0.72, 0.95))
	sph(root, 0.3, m[1], Vector3(0.68, 0.62, 0), Vector3(1.0, 0.85, 1.0))
	sph(root, 0.06, glow, Vector3(0.88, 0.72, 0.13))
	sph(root, 0.06, glow, Vector3(0.88, 0.72, -0.13))
	sph(root, 0.3, m[2], Vector3(-0.55, 0.75, 0), Vector3(1.2, 0.8, 0.9))
	_legs(root, m[2], 3, 0.38, 0.95, 0.06, 0.32, -0.05, 52.0)
	for side in [-1.0, 1.0]:
		cone(root, 0.08, 0.55, m[1], Vector3(0.95, 0.4, side * 0.24), Vector3(0, 0, -80), 6)

static func _skitterling(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, 0.42, m[0], Vector3(0, 0.5, 0), Vector3(1.5, 0.6, 0.8))
	sph(root, 0.26, m[1], Vector3(0.62, 0.52, 0), Vector3(1.0, 0.8, 1.0))
	sph(root, 0.05, glow, Vector3(0.8, 0.6, 0.1))
	sph(root, 0.05, glow, Vector3(0.8, 0.6, -0.1))
	for side in [-1.0, 1.0]:
		cone(root, 0.11, 1.05, m[1], Vector3(0.9, 0.65, side * 0.3), Vector3(side * 12.0, 0, -72), 6)
	_legs(root, m[2], 2, 0.5, 0.8, 0.05, 0.3, -0.05, 48.0)
	for i in range(3):
		cone(root, 0.07, 0.3, m[2], Vector3(-0.3 + i * 0.3, 0.9, 0), Vector3.ZERO, 5)

static func _bile_crawler(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, 0.8, m[0], Vector3(0, 0.8, 0), Vector3(1.4, 0.78, 1.05))
	sph(root, 0.42, m[1], Vector3(1.05, 0.78, 0), Vector3(1.1, 0.85, 1.0))
	sph(root, 0.07, glow, Vector3(1.38, 0.9, 0.17))
	sph(root, 0.07, glow, Vector3(1.38, 0.9, -0.17))
	sph(root, 0.5, m[3], Vector3(-0.3, 1.5, 0), Vector3(1.15, 1.0, 1.0))
	for i in range(3):
		sph(root, 0.34, m[1], Vector3(0.35 - i * 0.55, 1.35, 0), Vector3(0.9, 0.35, 1.4))
	_legs(root, m[2], 3, 0.7, 1.35, 0.09, 0.5, -0.05, 50.0)
	for side in [-1.0, 1.0]:
		cone(root, 0.08, 0.6, m[2], Vector3(1.4, 0.45, side * 0.22), Vector3(0, 0, -100), 6)

static func _blight_hurler(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	var blight := mat("m_blight", Color("#6aa81f"), Color("#5a9a14"), 0.25, 0.0, 0.55, 0.94)
	sph(root, 0.9, m[0], Vector3(0.1, 1.0, 0), Vector3(1.25, 0.85, 1.0))
	sph(root, 0.5, m[1], Vector3(1.2, 1.1, 0))
	sph(root, 0.07, glow, Vector3(1.55, 1.2, 0.2))
	sph(root, 0.07, glow, Vector3(1.55, 1.2, -0.2))
	sph(root, 1.0, blight, Vector3(-0.75, 1.95, 0), Vector3(1.0, 1.1, 1.0))
	for i in range(5):
		var a := TAU * float(i) / 5.0
		cone(root, 0.12, 0.7, m[2], Vector3(-0.75 + cos(a) * 0.55, 2.7, sin(a) * 0.55), Vector3(sin(a) * 30.0, 0, -cos(a) * 30.0), 5)
	cyl(root, 0.12, 0.26, 1.4, m[2], Vector3(0.7, 2.0, 0), Vector3(0, 0, -38), 8)
	_legs(root, m[2], 3, 0.8, 1.6, 0.1, 0.6, 0.0, 48.0)

static func _drift_sac(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, 1.04, m[0], Vector3(-0.15, 0.62, 0), Vector3(1.17, 0.87, 1.13))
	sph(root, 0.83, m[3], Vector3(-0.28, 0.32, 0), Vector3(1.14, 0.72, 1.16))
	sph(root, 0.48, m[1], Vector3(0.86, 0.53, 0), Vector3(1.03, 0.74, 0.87))
	for side in [-1.0, 1.0]:
		sph(root, 0.10, glow, Vector3(1.11, 0.62, side * 0.27))
		for segment in range(3):
			var x := 0.42 - float(segment) * 0.47
			cone(root, 0.15, 1.0 + segment * 0.12, m[2], Vector3(x, 0.06, side * 0.66), Vector3(-side * 18, 0, -34 - segment * 9), 6)
			sph(root, 0.17, m[1], Vector3(x, 1.24, side * 0.38), Vector3(1.0, 0.55, 1.17))

static func _needlewing(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, 0.42, m[0], Vector3(0.04, 0.39, 0), Vector3(1.63, 0.72, 0.91))
	sph(root, 0.25, m[1], Vector3(0.68, 0.41, 0))
	cone(root, 0.20, 1.12, m[2], Vector3(-0.76, 0.35, 0), Vector3(0, 0, 97), 6)
	for side in [-1.0, 1.0]:
		sph(root, 0.07, glow, Vector3(0.8, 0.48, side * 0.13))
		var wing := sph(root, 0.64, m[3], Vector3(-0.31, 0.39, side * 0.73), Vector3(1.22, 0.12, 1.45))
		wing.rotation_degrees.y = -side * 34.0
		cone(root, 0.12, 1.68, m[2], Vector3(-0.37, 0.44, side * 0.68), Vector3(side * 68.0, -side * 16.0, 28.0), 6)
		cone(root, 0.08, 0.54, m[1], Vector3(0.83, 0.32, side * 0.28), Vector3(0, 0, -84), 5)

static func _blight_spire(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, 2.3, m[0], Vector3(0, 0.28, 0), Vector3(1, 0.36, 1))
	cyl(root, 0.47, 0.91, 3.2, m[1], Vector3(0, 1.88, 0), Vector3.ZERO, 7)
	sph(root, 0.88, m[3], Vector3(0, 3.27, 0), Vector3(0.83, 1.0, 0.83))
	for index in range(5):
		var angle := TAU * index / 5.0
		var outward := Vector3(cos(angle), 0, sin(angle))
		cone(root, 0.25, 2.65, m[2], outward * 1.48 + Vector3(0, 1.6, 0), Vector3(18 * sin(angle), 0, -18 * cos(angle)), 6)
		sph(root, 0.15, glow, outward * 0.8 + Vector3(0, 3.3, 0))

static func _brood_nest(root: Node3D, r: float, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, r * 0.9, m[0], Vector3(0, 0.0, 0), Vector3(1, 0.6, 1), 24)
	sph(root, r * 0.55, m[1], Vector3(0, 0.8, 0), Vector3(1, 0.75, 1), 18)
	for i in range(11):
		var a := TAU * float(i) / 11.0
		var h := 2.2 + float(i % 3) * 0.7
		cone(root, 0.36, h, m[2], Vector3(cos(a) * r * 0.8, 0.9 + h * 0.4, sin(a) * r * 0.8), Vector3(sin(a) * 18.0, 0, -cos(a) * 18.0), 6)
	cone(root, 1.1, 3.8, m[1], Vector3(0, 3.0, 0), Vector3.ZERO, 8)
	sph(root, 1.05, m[3], Vector3(r * 0.82, 0.9, 0), Vector3(0.9, 1.0, 1.1))
	for i in range(5):
		var a2 := TAU * float(i) / 5.0 + 0.3
		sph(root, 0.45, glow, Vector3(cos(a2) * r * 0.55, 0.35, sin(a2) * r * 0.55), Vector3(1, 0.8, 1), 8)
	for i in range(6):
		var a3 := TAU * float(i) / 6.0
		cyl(root, 0.1, 0.2, 2.4, m[1], Vector3(cos(a3) * r * 0.98, 0.45, sin(a3) * r * 0.98), Vector3(sin(a3) * 80.0, 0, -cos(a3) * 80.0), 5)

static func _brood_growth_node(root: Node3D, radius: float, glow: Material) -> void:
	var materials := _bug_mats()
	sph(root, radius * 0.84, materials[0], Vector3.UP * 0.27, Vector3(1, 0.58, 1))
	sph(root, radius * 0.52, glow, Vector3.UP * 0.9, Vector3(1, 1.2, 1), 10)
	for i in range(5):
		var angle := TAU * float(i) / 5.0
		var radial := Vector3(cos(angle), 0, sin(angle))
		sph(root, radius * 0.42, materials[1], radial * radius * 0.72 + Vector3.UP * 0.24, Vector3(1, 0.5, 1), 8)
		cone(root, radius * 0.15, radius * 0.9, materials[2], radial * radius * 0.67 + Vector3.UP * 0.73, Vector3.ZERO, 5)

static func _brood_fixture(root: Node3D, radius: float, glow: Material, extractor: bool) -> void:
	var m := _bug_mats()
	sph(root, radius, m[0], Vector3(0, 0.25, 0), Vector3(1, 0.44, 1))
	for i in range(5):
		var angle := TAU * float(i) / 5.0
		var pos := Vector3(cos(angle), 0, sin(angle)) * (radius * 0.67)
		cone(root, 0.23, 1.3, m[2], pos + Vector3.UP * 0.85, Vector3.ZERO, 5)
		if not extractor:
			sph(root, 0.48, glow, pos * 0.8 + Vector3.UP * 0.83, Vector3(0.9, 1.35, 0.9))
	if extractor:
		var gas := mat("spore_aether", GAS, GAS, 0.8, 0.05, 0.55)
		cyl(root, 0.65, 0.95, 1.9, m[1], Vector3(0, 1.35, 0), Vector3.ZERO, 8)
		ring(root, 0.4, 0.71, gas, Vector3(0, 2.36, 0), Vector3.ZERO)
		sph(root, 0.35, gas, Vector3(0, 2.45, 0), Vector3(1, 0.65, 1))

# ---------------------------------------------------------------------------
# Aliens — Aurelian Concord
# ---------------------------------------------------------------------------
static func _alien_mats() -> Array:
	return [
		mat("a_ivory", IVORY, Color.BLACK, 1.0, 0.2, 0.4),
		mat("a_gold", GOLD, Color.BLACK, 1.0, 0.75, 0.3),
		mat("a_crystal", CRYSTAL, CRYSTAL, 1.1, 0.0, 0.2, 0.92),
		mat("a_stone", STONE_DARK, Color.BLACK, 1.0, 0.3, 0.6),
		mat("a_blade", Color("#f0dfa0"), Color("#ffd666"), 1.4, 0.0, 0.2),
	]

static func _mote(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	var hover := Node3D.new()
	hover.name = "Hover"
	hover.position = Vector3(0, 1.1, 0)
	root.add_child(hover)
	sph(hover, 0.3, m[2], Vector3.ZERO)
	ring(hover, 0.4, 0.5, m[1], Vector3.ZERO, Vector3(90, 0, 0))
	ring(hover, 0.5, 0.56, team, Vector3.ZERO, Vector3(60, 0, 20))
	for side in [-1.0, 1.0]:
		cone(hover, 0.12, 0.5, m[0], Vector3(-0.2, 0.0, side * 0.38), Vector3(side * 70.0, 0, 90), 4)
	cone(root, 0.3, 0.7, mat("a_beam", CRYSTAL, CRYSTAL, 1.2, 0.0, 0.5, 0.25), Vector3(0, 0.4, 0), Vector3(180, 0, 0), 10)

static func _lumen_carrier(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	var violet := mat("lumen_field", Color("#cda1ff"), Color("#a36bff"), 2.2, 0.1, 0.25)
	var hover := Node3D.new()
	hover.name = "Hover"
	hover.position.y = 1.1
	root.add_child(hover)
	cyl(hover, 0.90, 1.24, 0.34, m[0], Vector3.ZERO, Vector3.ZERO, 8)
	ring(hover, 0.92, 1.13, m[1], Vector3(0, 0.16, 0))
	sph(hover, 0.53, m[2], Vector3(0, 0.42, 0), Vector3(1.0, 0.8, 1.0), 10)
	for side in [-1.0, 1.0]:
		box(hover, Vector3(1.75, 0.22, 0.48), team, Vector3(-0.15, 0.0, side * 0.98), Vector3(0, side * 18.0, 0))
		cone(hover, 0.22, 0.65, m[1], Vector3(0.66, 0.02, side * 0.78), Vector3(0, 0, -90), 4)
	var mast := Node3D.new()
	mast.name = "PowerMast"
	root.add_child(mast)
	mast.hide()
	cyl(mast, 0.18, 0.34, 1.5, m[1], Vector3(0, 1.75, 0), Vector3.ZERO, 8)
	ring(mast, 0.68, 0.84, violet, Vector3(0, 2.66, 0), Vector3(0, 0, 20))
	ring(mast, 0.94, 1.03, m[1], Vector3(0, 2.66, 0), Vector3(0, 0, -20))
	sph(mast, 0.42, violet, Vector3(0, 2.66, 0), Vector3(0.7, 1.2, 0.7), 8)
	for side in [-1.0, 1.0]:
		box(mast, Vector3(0.38, 0.18, 1.08), m[0], Vector3(0, 0.20, side * 1.0))
		box(mast, Vector3(0.22, 0.95, 0.24), m[1], Vector3(0, 0.56, side * 0.95), Vector3(side * 24.0, 0, 0))

static func _sunblade(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	caps(root, 0.3, 1.7, m[0], Vector3(0, 1.1, 0))
	sph(root, 0.24, m[0], Vector3(0.02, 2.0, 0))
	cone(root, 0.12, 0.7, m[1], Vector3(-0.12, 2.35, 0), Vector3(0, 0, 25), 5)
	sph(root, 0.1, team, Vector3(0.28, 1.5, 0))
	box(root, Vector3(0.5, 0.1, 0.55), team, Vector3(0.0, 1.55, 0), Vector3(0, 0, 18))
	for side in [-1.0, 1.0]:
		sph(root, 0.2, m[1], Vector3(0, 1.75, side * 0.42), Vector3(1, 0.7, 1))
		box(root, Vector3(1.5, 0.07, 0.2), m[4], Vector3(0.75, 1.2, side * 0.62), Vector3(0, side * -8.0, 0))
		box(root, Vector3(0.3, 0.12, 0.12), m[1], Vector3(0.1, 1.2, side * 0.58))
	box(root, Vector3(0.1, 1.3, 0.8), m[0], Vector3(-0.32, 0.9, 0), Vector3(0, 0, -6))
	for side2 in [-1.0, 1.0]:
		cyl(root, 0.07, 0.1, 0.8, m[1], Vector3(0, 0.4, side2 * 0.14), Vector3.ZERO, 6)

static func _skirmisher(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	caps(root, 0.3, 1.7, m[0], Vector3(0, 1.45, 0), Vector3(0, 0, -8))
	sph(root, 0.26, m[0], Vector3(0.15, 2.45, 0))
	box(root, Vector3(0.12, 0.1, 0.3), m[2], Vector3(0.36, 2.48, 0))
	sph(root, 0.1, team, Vector3(0.28, 1.8, 0))
	for side in [-1.0, 1.0]:
		cyl(root, 0.08, 0.14, 1.4, m[1], Vector3(-0.05, 0.62, side * 0.24), Vector3(side * 8.0, 0, 14), 6)
		cyl(root, 0.06, 0.08, 0.6, m[1], Vector3(0.12, 0.12, side * 0.28), Vector3(0, 0, -50), 6)
		cone(root, 0.14, 0.9, m[1], Vector3(-0.35, 2.0, side * 0.2), Vector3(0, 0, 35), 4)
	cyl(root, 0.06, 0.08, 2.5, m[3], Vector3(1.0, 1.75, 0.3), Vector3(0, 0, -86), 8)
	sph(root, 0.1, m[2], Vector3(2.28, 1.72, 0.3))
	box(root, Vector3(0.5, 0.2, 0.18), m[1], Vector3(0.3, 1.72, 0.3))

static func _spire_walker(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	for i in range(3):
		var a := TAU * float(i) / 3.0 + 0.5
		var dx := cos(a)
		var dz := sin(a)
		cyl(root, 0.1, 0.2, 4.2, m[1], Vector3(dx * 1.3, 2.1, dz * 1.3), Vector3(dz * 22.0, 0, -dx * 22.0), 6)
		cone(root, 0.18, 0.5, m[3], Vector3(dx * 1.9, 0.2, dz * 1.9), Vector3(180, 0, 0), 5)
	sph(root, 1.15, m[0], Vector3(0, 4.0, 0), Vector3(1.0, 0.8, 1.0), 20)
	ring(root, 1.0, 1.3, m[1], Vector3(0, 3.8, 0), Vector3.ZERO)
	ring(root, 0.95, 1.0, team, Vector3(0, 4.15, 0), Vector3.ZERO)
	sph(root, 0.55, m[2], Vector3(1.0, 4.0, 0), Vector3(0.8, 1.0, 1.0))
	for i in range(4):
		var a2 := TAU * float(i) / 4.0
		cone(root, 0.2, 1.3 + float(i % 2) * 0.5, m[2], Vector3(cos(a2) * 0.45 - 0.2, 5.0, sin(a2) * 0.45), Vector3(sin(a2) * 12.0, 0, -cos(a2) * 12.0), 5)

static func _heartstone(root: Node3D, r: float, team: Material) -> void:
	var m := _alien_mats()
	cyl(root, r * 0.98, r, 0.32, m[3], Vector3(0, 0.16, 0), Vector3.ZERO, 24)
	cyl(root, r * 0.8, r * 0.85, 0.32, m[0], Vector3(0, 0.48, 0), Vector3.ZERO, 24)
	cyl(root, r * 0.6, r * 0.64, 0.32, m[1], Vector3(0, 0.8, 0), Vector3.ZERO, 24)
	cyl(root, 0.0, 1.4, 6.0, m[2], Vector3(0, 3.8, 0), Vector3.ZERO, 6)
	for i in range(5):
		var a := TAU * float(i) / 5.0 + 0.3
		cyl(root, 0.0, 0.5, 2.4, m[2], Vector3(cos(a) * 2.3, 1.9, sin(a) * 2.3), Vector3(sin(a) * 18.0, 0, -cos(a) * 18.0), 5)
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			box(root, Vector3(0.55, 3.1, 0.55), m[0], Vector3(sx * r * 0.72, 2.2, sz * r * 0.72))
			box(root, Vector3(0.7, 0.24, 0.7), m[1], Vector3(sx * r * 0.72, 3.85, sz * r * 0.72))
			sph(root, 0.16, team, Vector3(sx * r * 0.72, 4.15, sz * r * 0.72))
	for i in range(6):
		var a2 := TAU * float(i) / 6.0
		var shard := Node3D.new()
		shard.name = "Shard%d" % i
		shard.position = Vector3(cos(a2) * 3.3, 2.6 + float(i % 3) * 0.9, sin(a2) * 3.3)
		root.add_child(shard)
		cyl(shard, 0.0, 0.26, 1.0, m[2], Vector3.ZERO, Vector3.ZERO, 5)
		cyl(shard, 0.26, 0.0, 0.5, m[2], Vector3(0, 0.75, 0), Vector3.ZERO, 5)

static func _resonator(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	cyl(root, 0.9, 1.0, 0.3, m[3], Vector3(0, 0.15, 0), Vector3.ZERO, 16)
	cyl(root, 0.4, 0.62, 3.0, m[0], Vector3(0, 1.8, 0), Vector3.ZERO, 4)
	cyl(root, 0.62, 0.62, 0.22, m[1], Vector3(0, 0.55, 0), Vector3.ZERO, 4)
	cyl(root, 0.45, 0.45, 0.2, m[1], Vector3(0, 3.35, 0), Vector3.ZERO, 4)
	cyl(root, 0.0, 0.32, 1.0, m[2], Vector3(0, 3.95, 0), Vector3.ZERO, 5)
	cyl(root, 0.32, 0.0, 0.5, m[2], Vector3(0, 4.7, 0), Vector3.ZERO, 5)
	var halo := ring(root, 0.75, 0.82, team, Vector3(0, 2.7, 0), Vector3.ZERO)
	halo.name = "Halo"

static func _waystone(root: Node3D, r: float, team: Material) -> void:
	var m := _alien_mats()
	var portal := mat("a_portal", CRYSTAL, CRYSTAL, 0.9, 0.0, 0.2, 0.5)
	box(root, Vector3(r * 1.9, 0.35, r * 1.5), m[3], Vector3(0, 0.17, 0))
	box(root, Vector3(r * 1.7, 0.12, r * 1.3), m[0], Vector3(0, 0.42, 0))
	for side in [-1.0, 1.0]:
		box(root, Vector3(0.9, 4.0, 0.9), m[0], Vector3(side * r * 0.62, 2.4, 0))
		box(root, Vector3(1.05, 0.3, 1.05), m[1], Vector3(side * r * 0.62, 0.6, 0))
		box(root, Vector3(1.05, 0.3, 1.05), m[1], Vector3(side * r * 0.62, 4.35, 0))
		cone(root, 0.3, 0.9, m[2], Vector3(side * r * 0.62, 5.0, 0), Vector3.ZERO, 5)
	box(root, Vector3(r * 1.7, 0.8, 1.1), m[1], Vector3(0, 4.65, 0))
	sph(root, 0.26, team, Vector3(0, 4.65, 0.58))
	quad(root, Vector2(r * 1.05, 3.7), portal, Vector3(0, 2.4, 0), Vector3.ZERO)

static func _aether_prism(root: Node3D, radius: float, glow: Material) -> void:
	var m := _alien_mats()
	var gas := mat("prism_aether", GAS, GAS, 0.9, 0.1, 0.35)
	cyl(root, radius * 0.85, radius, 0.42, m[3], Vector3.UP * 0.23, Vector3.ZERO, 6)
	for i in range(3):
		var angle := TAU * float(i) / 3.0
		var pos := Vector3(cos(angle), 0, sin(angle)) * (radius * 0.62)
		cyl(root, 0.2, 0.33, 2.2, m[0], pos + Vector3.UP * 1.24, Vector3.ZERO, 4)
		sph(root, 0.18, glow, pos + Vector3.UP * 2.44)
	cyl(root, 0.0, 0.72, 1.35, gas, Vector3.UP * 2.35, Vector3.ZERO, 6)
	cyl(root, 0.72, 0.0, 0.8, gas, Vector3.UP * 1.28, Vector3.ZERO, 6)
	ring(root, 1.02, 1.12, m[1], Vector3.UP * 1.67, Vector3.ZERO)

# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
static func build_resource(res_type: String, seed_val: int, rich: bool = false) -> Node3D:
	var root := Node3D.new()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_val
	if res_type == "crystal_field":
		var cm := [
			mat("res_crystal_a", Color("#2dd4bf"), Color("#14b8a6"), 1.6, 0.0, 0.2, 0.95),
			mat("res_crystal_b", Color("#38bdf8"), Color("#0ea5e9"), 1.6, 0.0, 0.2, 0.95),
		]
		if rich:
			cm = [
				mat("res_rich_gold", Color("#ffcf61"), Color("#f7a820"), 1.6, 0.0, 0.2, 0.95),
				mat("res_rich_amber", Color("#ffab42"), Color("#ee8426"), 1.6, 0.0, 0.2, 0.95),
			]
		var rock := mat("res_rock", Color("#4a4540"), Color.BLACK, 1.0, 0.1, 0.95)
		for i in range(3):
			var a := rng.randf() * TAU
			sph(root, 0.55 + rng.randf() * 0.3, rock, Vector3(cos(a) * 1.0, 0.18, sin(a) * 1.0), Vector3(1.0, 0.45, 1.0), 8)
		for i in range(7):
			var a2 := TAU * float(i) / 7.0 + rng.randf() * 0.5
			var rad := 0.2 + rng.randf() * 0.9
			var h := 1.2 + rng.randf() * 1.7
			var c := cyl(root, 0.0, 0.3 + rng.randf() * 0.25, h, cm[i % 2], Vector3(cos(a2) * rad, h * 0.5, sin(a2) * rad), Vector3(rng.randf_range(-14, 14), rng.randf() * 360.0, rng.randf_range(-14, 14)), 5)
			c.name = "Crystal%d" % i
	else:
		var rock2 := mat("res_rock", Color("#4a4540"), Color.BLACK, 1.0, 0.1, 0.95)
		var green := mat("res_aether_rich", Color("#c6f77d"), Color("#a3e635"), 2.2, 0.0, 0.3) if rich else mat("res_aether", Color("#6ee7a8"), Color("#34d399"), 2.2, 0.0, 0.3)
		ring(root, 1.5, 2.7, rock2, Vector3(0, 0.35, 0))
		cyl(root, 1.55, 1.55, 0.12, green, Vector3(0, 0.28, 0), Vector3.ZERO, 18)
		for i in range(3):
			var plume := mat("res_plume_rich", Color("#e5ffa8"), Color("#a3e635"), 0.9, 0.0, 0.6, 0.35) if rich else mat("res_plume", Color("#9ff3c8"), Color("#34d399"), 0.9, 0.0, 0.6, 0.35)
			var p := sph(root, 0.7 + float(i) * 0.12, plume, Vector3(0, 1.2 + float(i) * 0.9, 0), Vector3.ONE, 10)
			p.name = "Plume%d" % i
	return root

static func footprint_half(unit_type: String) -> float:
	return float(RTSData.get_unit_def(unit_type).get("radius", 1.0))
