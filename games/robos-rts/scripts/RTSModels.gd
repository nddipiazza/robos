extends RefCounted

# RTSModels.gd — low-poly models for units, structures and resources.
# Shared by the world renderer and by the portrait renderer used in the HUD, so the
# portraits always match what is on the battlefield. Local +X is the facing direction.

static var _mats: Dictionary = {}
static var _model_scenes: Dictionary = {}
const BAKED_MODELS := [
	"rifleman", "pioneer", "triage_specialist", "breacher", "prospector", "ridge_scout",
	"shade_agent", "specter_academy",
	"cinder_runner", "cinder_guard", "sentinel_mine", "sentinel_mine_armed", "vortex_rover", "atlas_walker", "atlas_walker_precision",
	"ignition_core", "night_harrier", "sky_sentry", "sky_sentry_defender",
	"watchkeeper", "bastion_turret", "dreadnought", "operations_hub", "fortified_hub", "radar_beacon", "vehicle_armory",
	"howitzer", "howitzer_emplaced", "kestrel_interceptor", "kestrel_assault", "rampart_transport",
	"colony_hub", "muster_hall", "silo", "silo_retracted", "aether_tap", "workshop", "airframe_hangar",
	"field_bunker", "field_armory", "sentry_turret", "fabrication_module", "research_module",
	"forager", "skitterling", "sporeburst", "sporeburst_cocoon", "bile_crawler", "carapace_bulwark", "blight_hurler", "brood_keeper", "drift_sac", "needlewing",
	"spore_seer", "drift_hauler", "seer_cocoon", "hauler_cocoon",
	"corrosion_flyer", "brood_siege_flyer", "siege_flyer_cocoon", "greater_blight_spire", "broodling",
	"mireweaver", "locust_brooder", "locust_flying", "locust_landed", "siphon_wyrm",
	"brood_nest", "brood_pod", "brood_growth_node", "spore_tap", "spore_watch", "thorn_watch", "blight_spire", "tunnel_mouth", "brood_tunnel_worm",
	"hatchling_pool", "bile_warren",
	"concord_core", "transit_waystone", "aegis_capacitor", "twilight_array", "prism_forge", "robotics_foundry", "aegis_relay_ladder",
	"robotics_annex", "bastion_walker", "rift_engine", "mirage_adept", "mirage_shade",
	"storm_scribe", "canticle_archive", "duskblade", "veil_sanctum", "lattice_archon",
	"dawn_interceptor", "prism_ray", "horizon_lancer", "star_assembly", "fleet_spire", "fleet_carrier", "pursuit_fighter", "sunseer", "stasis_ward",
	"rupture_crawler", "rupture_cocoon",
	"brood_lair", "brood_hive", "infestation_pit", "spine_den", "adaptation_chamber", "ambusher_den", "spine_ambusher", "carapace_cavern",
	"brood_larva", "brood_egg",
	"mote", "sunblade", "skirmisher", "aegis_warden", "veilseeker", "farsight_wisp", "lumen_carrier", "spire_walker", "crownspire",
	"heartstone", "resonator", "waystone", "aegis_relay", "aether_prism",
	"propaganda_statue", "phase_barrier", "shale_barrier", "mineral_shield",
]
const LIVE_ANIMATED_MODELS := [
	"torchguard",
	"bastion_walker", "rift_engine", "mirage_adept", "storm_scribe", "duskblade", "lattice_archon",
	"rupture_crawler", "spine_ambusher", "carapace_bulwark_ladder", "mireweaver", "locust_brooder",
	"locust_flying", "locust_landed", "corrosion_flyer", "brood_siege_flyer", "siphon_wyrm", "dawn_interceptor", "prism_ray",
	"horizon_lancer", "fleet_carrier", "pursuit_fighter", "sunseer", "shade_agent", "specter_academy",
	"cinder_runner", "cinder_guard", "sentinel_mine", "sentinel_mine_armed", "vortex_rover", "atlas_walker",
	"atlas_walker_precision", "night_harrier", "sky_sentry", "sky_sentry_defender", "watchkeeper", "bastion_turret", "dreadnought",
	"operations_hub", "fortified_hub", "radar_beacon", "vehicle_armory", "ignition_core",
	"stasis_ward", "star_assembly", "fleet_spire",
]

# ---------------------------------------------------------------------------
# Palettes
# ---------------------------------------------------------------------------
const STEEL := Color("#8d98a6")
const STEEL_DARK := Color("#2c333d")
const STEEL_LIGHT := Color("#c7d0db")
const WORK_SUIT := Color("#d98a2b")
const VISOR := Color("#7dd3fc")
const VALE_GOLD := Color("#edb84f")

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
static func build(unit_type: String, owner_id: int, is_vale: bool = false) -> Node3D:
	if unit_type == "aegis_relay" and RTSData.ladder_active:
		var relay := _build_baked_model("aegis_relay_ladder", owner_id, false)
		if relay:
			return relay
	if unit_type == "carapace_bulwark" and RTSData.ladder_active:
		var bulwark := _build_baked_model("carapace_bulwark_ladder", owner_id, false)
		if bulwark:
			return bulwark
	if unit_type in BAKED_MODELS:
		var model := _build_baked_model(unit_type, owner_id, is_vale)
		if model:
			return model
	var root := Node3D.new()
	var d: Dictionary = RTSData.get_unit_def(unit_type)
	var r: float = float(d.get("radius", 0.85))
	var team := team_mat(owner_id)
	var glow := team_glow(owner_id)
	match unit_type:
		"pioneer": _pioneer(root, team)
		"prospector": _prospector(root, team, glow)
		"rifleman": _rifleman(root, team, is_vale)
		"ridge_scout": _rifleman(root, team, false)
		"shade_agent":
			_rifleman(root, team, false)
			box(root, Vector3(0.52, 0.68, 0.12), mat("shade_mantle", Color("#333a49")), Vector3(-0.13, 1.25, -0.18))
		"specter_academy":
			_waystone(root, r, team)
			box(root, Vector3(0.12, 2.7, 0.12), team, Vector3(-1.45, 3.5, 0.8))
		"resistance_civilian": _resistance_civilian(root)
		"evacuee": _resistance_civilian(root, false)
		"resistance_gate": _resistance_gate(root)
		"torchguard": _torchguard(root, team)
		"settlement_truck": _settlement_truck(root)
		"contract_post":
			_field_armory(root, team, glow)
			box(root, Vector3(0.22, 1.76, 1.35), mat("contract_post_sign", Color("#ad7f42")), Vector3(1.9, 1.5, 0))
		"breacher": _breacher(root, team)
		"triage_specialist": _triage_specialist(root, team)
		"kestrel_interceptor": _kestrel_interceptor(root, team, glow)
		"kestrel_assault": _kestrel_assault(root, team, glow)
		"rampart_transport": _rampart_transport(root, team, glow)
		"howitzer": _howitzer(root, r, team, false)
		"howitzer_emplaced": _howitzer(root, r, team, true)
		"colony_hub": _colony_hub(root, r, team)
		"operations_hub":
			_colony_hub(root, 4.2, team)
			cyl(root, 0.45, 0.75, 1.5, team, Vector3(0.0, 3.1, 0.0))
			cyl(root, 1.1, 0.75, 0.3, glow, Vector3(0.0, 3.9, 0.0), Vector3(0.35, 0.0, 0.0))
		"fortified_hub":
			_colony_hub(root, r, team)
			_sentry_turret(root, 1.9, team, false)
		"silo": _silo(root, r, team, false)
		"silo_retracted": _silo(root, r, team, true)
		"aether_tap": _aether_tap(root, r, team)
		"muster_hall": _muster_hall(root, r, team)
		"fabrication_module": _fabrication_module(root, team)
		"research_module": _research_module(root, team, glow)
		"workshop": _workshop(root, r, team)
		"airframe_hangar": _airframe_hangar(root, team, glow)
		"sentry_turret": _sentry_turret(root, r, team)
		"field_bunker": _field_bunker(root, team)
		"field_armory": _field_armory(root, team, glow)
		"forager": _forager(root, glow)
		"skitterling": _skitterling(root, glow)
		"brood_larva":
			for i in range(3):
				sph(root, 0.2, glow, Vector3((i - 1) * 0.24, 0.20, 0.0), Vector3(1.1, 0.9, 0.85), 8)
		"brood_egg":
			sph(root, 0.44, glow, Vector3(0.0, 0.52, 0.0), Vector3(0.90, 1.18, 0.85), 10)
		"sporeburst", "sporeburst_cocoon": _sporeburst(root, glow, unit_type.ends_with("_cocoon"))
		"bile_crawler": _bile_crawler(root, glow)
		"rupture_crawler": _bile_crawler(root, glow)
		"spine_ambusher": _bile_crawler(root, glow)
		"mireweaver":
			_bile_crawler(root, glow)
			for side in [-1.0, 1.0]:
				sph(root, 0.56, glow, Vector3(0.28, 1.1, side * 0.75), Vector3(0.6, 1.5, 0.85))
		"locust_brooder":
			_bile_crawler(root, glow)
			for side in [-1.0, 1.0]:
				sph(root, 0.67, glow, Vector3(-0.67, 0.95, side * 0.86), Vector3(1.0, 1.12, 0.73))
		"locust_flying", "locust_landed":
			var body := Node3D.new()
			if unit_type == "locust_flying":
				_needlewing(body, glow)
			else:
				_skitterling(body, glow)
			body.scale *= 0.65
			root.add_child(body)
		"ambusher_cocoon":
			var cocoon := build("rupture_cocoon", owner_id)
			root.add_child(cocoon)
		"rupture_cocoon": _sporeburst(root, glow, true)
		"carapace_bulwark": _carapace_bulwark(root, glow)
		"blight_hurler": _blight_hurler(root, glow)
		"drift_sac": _drift_sac(root, glow)
		"spore_seer":
			_drift_sac(root, glow)
			sph(root, 0.64, glow, Vector3(1.1, 0.85, 0.0), Vector3(0.85, 0.72, 1.0))
		"drift_hauler":
			_drift_sac(root, glow)
			for side in [-1.0, 1.0]:
				sph(root, 0.62, glow, Vector3(0.15, 0.55, side * 0.98), Vector3(1.25, 1.05, 0.75))
		"seer_cocoon", "hauler_cocoon", "siege_flyer_cocoon":
			sph(root, 1.35, glow, Vector3(0, 1.1, 0), Vector3(1.15, 0.85, 0.90))
		"corrosion_flyer":
			_needlewing(root, glow)
			sph(root, 0.6, glow, Vector3(0.58, 0.86, 0), Vector3(0.8, 0.8, 1.4))
		"siphon_wyrm":
			_needlewing(root, glow)
			for index in range(4):
				sph(root, 0.42 - index * 0.05, glow, Vector3(-0.3 - index * 0.47, 0.65 + index * 0.23, 0.0))
		"brood_siege_flyer":
			_drift_sac(root, glow)
			for side in [-1.0, 1.0]:
				sph(root, 0.85, glow, Vector3(-0.2, 1.6, side * 1.45), Vector3(1.65, 0.75, 0.68))
		"broodling":
			var body := build("skitterling", owner_id)
			body.scale *= 0.7
			root.add_child(body)
		"needlewing": _needlewing(root, glow)
		"blight_spire": _blight_spire(root, glow)
		"greater_blight_spire":
			_blight_spire(root, glow)
			ring(root, 1.1, 1.35, glow, Vector3(0, 3.8, 0), Vector3.ZERO)
		"tunnel_mouth": _tunnel_mouth(root, glow)
		"brood_tunnel_worm":
			_tunnel_mouth(root, glow)
			sph(root, 1.5, glow, Vector3(0, 2.1, 0), Vector3(0.8, 1.6, 0.8))
		"brood_keeper": _brood_keeper(root, glow)
		"brood_nest": _brood_nest(root, r, glow)
		"brood_lair", "brood_hive":
			_brood_nest(root, r, glow)
			var height := 4.6 if unit_type == "brood_hive" else 3.3
			for angle in [0.0, TAU / 3.0, TAU * 2.0 / 3.0]:
				sph(root, 0.95, glow, Vector3(cos(angle) * 2.1, height * 0.5, sin(angle) * 2.1), Vector3(0.8, height * 0.48, 0.8))
		"infestation_pit", "spine_den", "adaptation_chamber", "ambusher_den", "carapace_cavern":
			_brood_fixture(root, r, glow, false)
			var height := 1.8 if unit_type == "infestation_pit" else 2.5
			for side in [-1.0, 1.0]:
				sph(root, 0.75, glow, Vector3(-0.4, height, side * 1.1), Vector3(0.8, 1.35, 0.75))
		"brood_pod", "spore_tap": _brood_fixture(root, r, glow, unit_type == "spore_tap")
		"brood_growth_node": _brood_growth_node(root, r, glow)
		"brood_mimic":
			sph(root, 0.56, glow, Vector3(0.0, 0.40, 0.0), Vector3(1.25, 0.75, 0.8))
			sph(root, 0.23, glow, Vector3(0.46, 0.62, 0.0), Vector3(1.0, 1.15, 1.0))
		"spore_nursery":
			_brood_fixture(root, r, glow, false)
			for side in [-1.0, 1.0]:
				sph(root, 0.72, mat("sporeburst_sac", ACID, Color("#6bcf1b"), 1.2), Vector3(-0.3, 1.5, side * 0.9), Vector3(1.1, 1.25, 0.8))
		"spore_watch":
			_brood_fixture(root, r, glow, false)
			ring(root, r * 0.45, r * 0.57, glow, Vector3(0, 1.65, 0), Vector3.ZERO)
		"thorn_watch":
			_brood_fixture(root, r, glow, false)
			sph(root, 0.5, glow, Vector3(0, 2.1, 0), Vector3(0.75, 2.8, 0.75))
		"mote": _mote(root, glow)
		"veilseeker": _veilseeker(root, team)
		"farsight_wisp": _farsight_wisp(root, team)
		"lumen_carrier": _lumen_carrier(root, team)
		"aegis_warden": _aegis_warden(root, team)
		"storm_scribe": _aegis_warden(root, team)
		"sunblade": _sunblade(root, team, true)
		"duskblade": _sunblade(root, team)
		"skirmisher": _skirmisher(root, team)
		"crownspire": _crownspire(root, team)
		"dawn_interceptor": _kestrel_interceptor(root, team, glow)
		"prism_ray": _crownspire(root, team)
		"horizon_lancer":
			_crownspire(root, team)
			sph(root, 0.65, glow, Vector3(1.7, 1.2, 0.0), Vector3(1.5, 0.7, 0.7))
		"fleet_carrier":
			_crownspire(root, team)
			for side in [-1.0, 1.0]:
				box(root, Vector3(3.7, 0.85, 0.92), team, Vector3(-0.15, 0.8, side * 1.15))
		"pursuit_fighter":
			var hull := Node3D.new()
			_kestrel_interceptor(hull, team, glow)
			hull.scale *= 0.42
			root.add_child(hull)
		"sunseer":
			_kestrel_interceptor(root, team, glow)
			sph(root, 0.72, glow, Vector3(0.0, 1.0, 0.0), Vector3(1.0, 0.55, 1.0))
		"stasis_ward":
			box(root, Vector3(1.4, 0.22, 1.4), team, Vector3(0.0, 0.11, 0.0))
			sph(root, 0.49, glow, Vector3(0.0, 0.6, 0.0), Vector3(1.0, 1.1, 1.0))
		"star_assembly", "fleet_spire":
			_waystone(root, r, glow)
			sph(root, 0.75, glow, Vector3(0.0, 3.8, 0.0), Vector3(1.05, 1.4, 1.05))
		"spire_walker": _spire_walker(root, team)
		"heartstone": _heartstone(root, r, team)
		"resonator": _resonator(root, team)
		"aegis_relay": _aegis_relay(root, r, glow)
		"waystone": _waystone(root, r, team)
		"canticle_archive": _waystone(root, r, team)
		"veil_sanctum": _waystone(root, r, team)
		"aether_prism": _aether_prism(root, r, glow)
		"propaganda_statue": _propaganda_statue(root, team)
		"shale_barrier": _shale_barrier(root)
		"mineral_shield":
			var shell := mat("mineral_shield_shell", Color("#ffd372"), Color("#ffac43"), 1.0, 0.0, 0.25, 0.30)
			var rim := mat("mineral_shield_rim", Color("#ffe7a3"), Color("#ffb951"), 1.2)
			sph(root, 2.25, shell, Vector3(0, 0.15, 0), Vector3(1.0, 1.12, 1.0), 24)
			ring(root, 1.88, 2.13, rim, Vector3(0, 0.16, 0))
		"phase_barrier": _phase_barrier(root, r)
		"rift_nova":
			sph(root, 0.43, mat("rift_nova_core", Color("#f4d5ff"), Color("#de89ff"), 2.2), Vector3(0.0, 0.62, 0.0))
			ring(root, 0.48, 0.62, mat("rift_nova_ring", Color("#d289ff"), Color("#be65ff"), 2.0), Vector3(0.0, 0.62, 0.0))
		"lattice_archon":
			var plasma := mat("archon_plasma", Color("#a3caff"), Color("#6e9fff"), 2.3, 0.0, 0.45, 0.44)
			sph(root, 1.25, plasma, Vector3(0, 1.8, 0))
			sph(root, 0.56, glow, Vector3(0, 2.15, 0))
			ring(root, 1.2, 1.38, glow, Vector3(0, 1.08, 0))
		_: box(root, Vector3(r * 1.5, 1.4, r * 1.5), mat("fallback", STEEL), Vector3(0, 0.7, 0))
	return root

static func _build_baked_model(unit_type: String, owner_id: int, is_vale: bool) -> Node3D:
	var root := instantiate_model(unit_type)
	if root == null:
		return null
	var team := _vale_armor() if is_vale else team_mat(owner_id)
	var glow := team_glow(owner_id)
	if unit_type != "mirage_shade":
		for part in root.find_children("*Surf_TEAM*", "MeshInstance3D", true, false):
			part.material_override = team
		for part in root.find_children("*Surf_GLOW*", "MeshInstance3D", true, false):
			part.material_override = glow
	else:
		for part in root.find_children("*", "MeshInstance3D", true, false):
			part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if is_vale:
		for part in root.find_children("*Surf_armor*", "MeshInstance3D", true, false):
			part.material_override = team
	# glTF exports the carrier's deployable geometry in its visible state.
	var mast := root.get_node_or_null("PowerMast") as Node3D
	if mast:
		mast.hide()
	if unit_type in ["brood_larva", "brood_egg", "hatchling_pool", "bile_warren", "concord_core",
			"transit_waystone", "aegis_capacitor", "twilight_array", "prism_forge", "robotics_foundry", "aegis_relay_ladder", "robotics_annex",
			"canticle_archive", "veil_sanctum", "rupture_cocoon", "seer_cocoon", "hauler_cocoon", "siege_flyer_cocoon", "greater_blight_spire",
			"brood_lair", "brood_hive", "infestation_pit", "spine_den", "adaptation_chamber", "ambusher_den", "carapace_cavern"]:
		var player := root.find_child("AnimationPlayer", true, false) as AnimationPlayer
		var clip: String = {"brood_larva": "wriggle", "brood_egg": "pulse", "rupture_cocoon": "pulse",
			"seer_cocoon": "pulse", "hauler_cocoon": "pulse", "siege_flyer_cocoon": "pulse"}.get(unit_type, "idle")
		if player and player.has_animation(clip):
			player.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
			player.play(clip)
	elif unit_type == "mirage_shade":
		var player := root.find_child("AnimationPlayer", true, false) as AnimationPlayer
		if player and player.has_animation("drift"):
			player.get_animation("drift").loop_mode = Animation.LOOP_LINEAR
			player.play("drift")
	elif unit_type in LIVE_ANIMATED_MODELS:
		var player := root.find_child("AnimationPlayer", true, false) as AnimationPlayer
		if player:
			for clip in ["idle", "walk", "hover"]:
				if player.has_animation(clip):
					player.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
			player.play("idle")
			root.set_meta("robotics_animation", player)
	elif unit_type == "ridge_scout":
		var player := root.find_child("AnimationPlayer", true, false) as AnimationPlayer
		var wrapper := Node3D.new()
		root.scale = Vector3.ONE * 1.3
		wrapper.add_child(root)
		root = wrapper
		if player:
			for clip in ["idle", "run"]:
				if player.has_animation(clip):
					player.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
			player.play("idle")
			root.set_meta("scout_animation", player)
	return root

static func add_upgrade_detail(root: Node3D, detail: String, owner: int) -> void:
	var color := RTSData.get_player_color(owner)
	match detail:
		"combat_shield":
			var rim := mat("infantry_shield_rim", Color("#384550"))
			var plate := mat("infantry_shield_%s" % color.to_html(), color.darkened(0.20))
			box(root, Vector3(0.14, 0.81, 0.52), rim, Vector3(0.40, 0.99, -0.47))
			box(root, Vector3(0.07, 0.66, 0.42), plate, Vector3(0.48, 0.99, -0.47))
		"wings":
			var membrane := mat("skitterling_wing_%s" % color.to_html(), color.lightened(0.2), color, 0.17)
			for side in [-1.0, 1.0]:
				sph(root, 0.32, membrane, Vector3(-0.20, 0.58, side * 0.36), Vector3(1.2, 0.12, 1.25), 8)
		"rich_extractor":
			var gold := mat("rich_extractor_trim", Color("#d9a64c"), Color("#cf9036"), 0.12, 0.55)
			ring(root, 1.28, 1.45, gold, Vector3(0.0, 0.25, 0.0))

static func _vale_armor() -> StandardMaterial3D:
	return mat("vale_armor", VALE_GOLD, VALE_GOLD, 0.21, 0.3, 0.42)

static func instantiate_model(model_id: String) -> Node3D:
	if not _model_scenes.has(model_id):
		# A source launch can still have the imported Sunblade without its sword pivots.
		_model_scenes[model_id] = _load_model_scene("res://assets/models/%s.glb" % model_id, model_id == "sunblade")
	var scene: PackedScene = _model_scenes[model_id]
	return scene.instantiate() as Node3D if scene else null

static func _load_model_scene(path: String, prefer_source: bool = false) -> PackedScene:
	if ResourceLoader.exists(path, "PackedScene") and (not prefer_source or not FileAccess.file_exists(path)):
		return load(path) as PackedScene
	# The source launcher can run without an editor import.
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty() or document.append_from_buffer(bytes, path.get_base_dir(), state) != OK:
		return null
	var model := document.generate_scene(state)
	if model == null:
		return null
	var scene := PackedScene.new()
	var result := scene.pack(model)
	model.free()
	return scene if result == OK else null

static func _resistance_civilian(root: Node3D, armed: bool = true) -> void:
	var coat := mat("civilian_coat", Color("#967045"))
	var pants := mat("civilian_pants", Color("#39474d"))
	var boots := mat("civilian_boots", Color("#2d2523"))
	var skin := mat("civilian_skin", Color("#bd8967"))
	for side in [-1.0, 1.0]:
		caps(root, 0.14, 0.68, pants, Vector3(0, 0.46, side * 0.17))
		box(root, Vector3(0.34, 0.16, 0.25), boots, Vector3(0.09, 0.12, side * 0.17))
	box(root, Vector3(0.46, 0.55, 0.65), coat, Vector3(0, 0.98, 0))
	box(root, Vector3(0.48, 0.13, 0.65), boots, Vector3(0, 0.75, 0))
	sph(root, 0.22, skin, Vector3(0.06, 1.44, 0), Vector3(0.91, 1.16, 0.94))
	sph(root, 0.19, boots, Vector3(-0.02, 1.54, 0), Vector3(1, 0.62, 1))
	caps(root, 0.12, 0.59, coat, Vector3(0.07, 0.98, -0.39), Vector3(0, 0, 20))
	var arm := Node3D.new()
	arm.name = "ThrowArm"
	arm.position = Vector3(0.02, 1.15, 0.36)
	root.add_child(arm)
	caps(arm, 0.12, 0.46, coat, Vector3(0.17, -0.1, 0), Vector3(0, 0, 65))
	sph(arm, 0.105, skin, Vector3(0.39, -0.12, 0))
	if not armed:
		return
	var bottle := cyl(arm, 0.09, 0.105, 0.32, mat("civilian_glass", Color("#527453")), Vector3(0.40, -0.02, 0.05))
	bottle.name = "Bottle"
	sph(bottle, 0.075, mat("civilian_ember", Color("#ffab3d"), Color("#ff671a"), 1.5), Vector3(0, 0.19, 0))
	var leader := Node3D.new()
	leader.name = "LeaderDetails"
	root.add_child(leader)
	cyl(leader, 0.18, 0.23, 0.15, mat("civilian_scarf", Color("#a3332a")), Vector3(0.03, 1.24, 0))
	box(leader, Vector3(0.022, 0.13, 0.045), mat("civilian_scar", Color("#763c37")),
		Vector3(0.242, 1.44, 0.07), Vector3(23, 0, -10))

static func _torchguard(root: Node3D, team: Material) -> void:
	var shell := mat("torchguard_shell", Color("#a44830"))
	var iron := mat("torchguard_iron", Color("#323842"))
	var visor := mat("torchguard_visor", Color("#ffc667"), Color("#fdb24e"), 0.75)
	box(root, Vector3(0.83, 0.82, 0.98), shell, Vector3(0, 0.97, 0))
	sph(root, 0.32, iron, Vector3(0.09, 1.63, 0))
	box(root, Vector3(0.11, 0.16, 0.46), visor, Vector3(0.36, 1.65, 0))
	for side in [-1.0, 1.0]:
		box(root, Vector3(0.54, 0.59, 0.39), iron, Vector3(-0.02, 0.40, side * 0.26))
		box(root, Vector3(0.69, 0.19, 0.43), shell, Vector3(0.08, 0.13, side * 0.26))
		sph(root, 0.32, team, Vector3(-0.05, 1.31, side * 0.61))
		cyl(root, 0.17, 0.18, 0.84, iron, Vector3(-0.51, 1.18, side * 0.26))
		cyl(root, 0.13, 0.19, 0.88, iron, Vector3(0.49, 0.96, side * 0.62), Vector3(0, 0, 90))
		box(root, Vector3(0.17, 0.18, 0.16), visor, Vector3(0.91, 0.96, side * 0.62))
		var muzzle := Node3D.new()
		muzzle.name = "Muzzle_Flame_L" if side < 0 else "Muzzle_Flame_R"
		muzzle.position = Vector3(0.99, 0.96, side * 0.62)
		root.add_child(muzzle)

static func _settlement_truck(root: Node3D) -> void:
	var hull := mat("settlement_truck_hull", Color("#c5ae78"))
	var armor := mat("settlement_truck_armor", Color("#535956"))
	var rubber := mat("settlement_truck_tires", Color("#292d2b"))
	var glass := mat("settlement_truck_glass", Color("#445a60"))
	var lights := mat("settlement_truck_lamps", Color("#ffdd93"), Color("#ffc870"), 1.0)
	box(root, Vector3(4.25, 0.45, 2.04), armor, Vector3(0, 0.7, 0))
	box(root, Vector3(2.58, 1.5, 2.08), hull, Vector3(-0.61, 1.62, 0))
	box(root, Vector3(1.19, 1.15, 1.94), hull, Vector3(1.35, 1.36, 0))
	box(root, Vector3(0.16, 0.48, 1.64), glass, Vector3(1.97, 1.63, 0))
	for side in [-1.0, 1.0]:
		box(root, Vector3(2.52, 0.12, 0.05), armor, Vector3(-0.61, 1.43, side * 1.06))
		box(root, Vector3(0.16, 0.25, 0.30), lights, Vector3(2.13, 1.01, side * 0.68))
		for x in [-1.45, -0.58, 1.36]:
			cyl(root, 0.43, 0.43, 0.29, rubber, Vector3(x, 0.44, side * 1.05), Vector3(90, 0, 0))
			cyl(root, 0.20, 0.20, 0.31, armor, Vector3(x, 0.44, side * 1.08), Vector3(90, 0, 0))

static func build_brood_sample() -> Node3D:
	var root := Node3D.new()
	var shell := mat("brood_sample_shell", Color("#61503e"))
	var tissue := mat("brood_sample_tissue", Color("#a2ce73"), Color("#6d913e"), 0.65)
	sph(root, 0.71, shell, Vector3(0, 0.62, 0), Vector3(1.05, 1.18, 1.05))
	sph(root, 0.44, tissue, Vector3(0, 1.05, 0), Vector3(0.86, 1.48, 0.86))
	for index in 5:
		var direction := Vector2.from_angle(TAU * index / 5.0)
		var point := Vector3(direction.x * 0.44, 0.66, direction.y * 0.44)
		sph(root, 0.31, shell, point, Vector3(0.70, 1.75, 0.70))
	return root

static func _resistance_gate(root: Node3D) -> void:
	var frame := mat("civilian_gate_frame", Color("#4e5459"))
	var panel := mat("civilian_gate_panel", Color("#775744"))
	for side in [-1.0, 1.0]:
		box(root, Vector3(0.42, 2.35, 0.38), frame, Vector3(0, 1.17, side * 1.55))
	box(root, Vector3(0.22, 1.95, 2.85), panel, Vector3(0, 1.09, 0))
	for height in [0.35, 1.1, 1.9]:
		box(root, Vector3(0.32, 0.14, 2.95), frame, Vector3(0, height, 0))

static func _propaganda_statue(root: Node3D, team: Material) -> void:
	var stone := mat("directorate_stone", Color("#778194"))
	var trim := mat("directorate_trim", Color("#343e50"))
	box(root, Vector3(3.5, 0.32, 3.5), trim, Vector3(0, 0.16, 0))
	box(root, Vector3(2.55, 0.92, 2.55), stone, Vector3(0, 0.76, 0))
	box(root, Vector3(1.25, 0.32, 0.12), team, Vector3(0, 0.79, 1.32))
	for side in [-1, 1]:
		box(root, Vector3(0.48, 1.32, 0.60), stone, Vector3(side * 0.37, 1.88, 0))
	box(root, Vector3(1.42, 1.2, 0.78), stone, Vector3(0, 3.05, 0))
	box(root, Vector3(0.42, 1.40, 0.53), stone, Vector3(-0.86, 2.99, 0))
	box(root, Vector3(0.45, 1.75, 0.55), stone, Vector3(0.90, 3.56, 0), Vector3(0, 0, -15))
	sph(root, 0.40, stone, Vector3(0, 3.99, 0), Vector3(0.93, 1.15, 0.90), 8)

static func _aegis_warden(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	cyl(root, 0.38, 0.69, 1.25, m[3], Vector3(0, 0.7, 0), Vector3.ZERO, 8)
	sph(root, 0.43, m[0], Vector3(0, 1.38, 0), Vector3(0.9, 1.15, 0.85))
	for side in [-1.0, 1.0]:
		cone(root, 0.33, 0.84, m[1], Vector3(side * 0.52, 1.22, 0), Vector3(0, 0, side * 28.0), 5)
	sph(root, 0.31, m[2], Vector3(0, 1.96, 0), Vector3(1, 1.2, 1), 12)
	ring(root, 0.45, 0.60, team, Vector3(0, 2.35, 0))

static func _phase_barrier(root: Node3D, radius: float) -> void:
	var color := Color("#78dfff")
	var shell := mat("phase_barrier_shell", color, color, 0.65, 0.0, 0.24, 0.23)
	var edge := mat("phase_barrier_edge", color, color, 1.7, 0.1, 0.3)
	cyl(root, radius * 0.95, radius, 1.65, shell, Vector3(0, 0.84, 0), Vector3.ZERO, 32)
	ring(root, radius * 0.95, radius, edge, Vector3(0, 0.09, 0))
	ring(root, radius * 0.90, radius * 0.96, edge, Vector3(0, 1.66, 0))

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
static func _field_bunker(root: Node3D, team: Material) -> void:
	var slab := mat("field_bunker_slab", Color("#68716b"))
	var ports := mat("field_bunker_ports", STEEL_DARK)
	box(root, Vector3(3.8, 0.35, 3.6), ports, Vector3(0, 0.18, 0))
	box(root, Vector3(3.1, 1.45, 3.0), slab, Vector3(0, 0.9, 0))
	box(root, Vector3(2.65, 0.29, 2.65), team, Vector3(0, 1.76, 0))
	for side in [-1.0, 1.0]:
		box(root, Vector3(2.4, 0.36, 0.12), ports, Vector3(0, 1.22, side * 1.52))
		box(root, Vector3(0.12, 0.36, 2.3), ports, Vector3(side * 1.56, 1.22, 0))

static func _field_armory(root: Node3D, team: Material, glow: Material) -> void:
	var casing := mat("field_armory_case", Color("#647283"))
	var steel := mat("field_armory_steel", STEEL_DARK)
	box(root, Vector3(4.4, 0.4, 4.1), steel, Vector3(0, 0.2, 0))
	box(root, Vector3(3.9, 2.05, 3.5), casing, Vector3(0, 1.18, 0))
	box(root, Vector3(3.7, 0.31, 3.4), team, Vector3(0, 2.28, 0))
	for side in [-1.0, 1.0]:
		box(root, Vector3(0.36, 0.42, 2.7), steel, Vector3(side * 1.2, 2.6, 0))
		box(root, Vector3(0.72, 0.2, 0.1), glow, Vector3(side * 1.1, 1.65, 1.77))
	box(root, Vector3(1.1, 1.35, 0.15), steel, Vector3(0, 0.94, 1.78))

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

static func _rifleman(root: Node3D, team: Material, is_vale: bool) -> void:
	var armor := _vale_armor() if is_vale else mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	if is_vale:
		team = armor
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
	turret.name = "Turret"
	turret.position = Vector3(-0.1, 1.45 + y0, 0)
	root.add_child(turret)
	box(turret, Vector3(r * 0.95, 0.6, r * 0.85), armor, Vector3.ZERO)
	sph(turret, 0.42, armor, Vector3(-0.2, 0.32, 0), Vector3(1.3, 0.55, 1.0))
	var gun := Node3D.new()
	gun.name = "Gun"
	gun.position = Vector3(r * 0.4, 0.1, 0)
	gun.rotation_degrees = Vector3(0, 0, 4.0 if not emplaced else 26.0)
	turret.add_child(gun)
	var blen := 2.8 if not emplaced else 4.2
	cyl(gun, 0.17, 0.2, blen, dark, Vector3(blen * 0.5, 0, 0), Vector3(0, 0, -90), 10)
	cyl(gun, 0.3, 0.3, 0.45, armor, Vector3(blen, 0, 0), Vector3(0, 0, -90), 10)
	cyl(gun, 0.28, 0.28, 0.5, armor, Vector3(0.3, 0, 0), Vector3(0, 0, -90), 10)
	var muzzle := Node3D.new()
	muzzle.name = "Muzzle"
	muzzle.position.x = blen + 0.22
	gun.add_child(muzzle)
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

const SENTRY_MUZZLE := Vector3(2.04, 2.25, 0.49)

static func _sentry_turret(root: Node3D, r: float, team: Material, missiles := true) -> void:
	var armor := mat("h_armor", STEEL, Color.BLACK, 1.0, 0.35, 0.55)
	var dark := mat("h_dark", STEEL_DARK, Color.BLACK, 1.0, 0.4, 0.6)
	var sensor := mat("sentry_sensor", Color("#8cf2fc"), Color("#22d3ee"), 1.7)
	cyl(root, r * 0.85, r, 0.45, dark, Vector3(0, 0.23, 0), Vector3.ZERO, 12)
	cyl(root, 0.72, 1.03, 1.4, armor, Vector3(0, 1.0, 0), Vector3.ZERO, 10)
	box(root, Vector3(1.65, 0.68, 1.35), armor, Vector3(0, 1.9, 0))
	box(root, Vector3(1.3, 0.12, 1.2), team, Vector3(0, 2.26, 0))
	for side in [-1, 1]:
		if not missiles:
			box(root, Vector3(1.85, 0.24, 0.26), dark, Vector3(1.18, 1.92, side * 0.42))
			box(root, Vector3(0.16, 0.13, 0.16), sensor, Vector3(2.1, 1.92, side * 0.42))
			continue
		var muzzle := Vector3(SENTRY_MUZZLE.x, SENTRY_MUZZLE.y, SENTRY_MUZZLE.z * side)
		var axis := Vector3(cos(0.21), sin(0.21), 0)
		var tilt := Vector3(0, 0, 0.21 - PI * 0.5)
		cyl(root, 0.27, 0.30, 1.63, armor, muzzle - axis * 0.83, tilt, 10)
		cyl(root, 0.30, 0.29, 0.16, team, muzzle - axis * 0.10, tilt, 10)
		cyl(root, 0.22, 0.22, 0.04, dark, muzzle, tilt, 10)
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

static func add_production_dock(module: Node3D, span: float, owner_id: int) -> Node3D:
	var dock := Node3D.new()
	dock.name = "ProductionDock"
	module.add_child(dock)
	# Inset both ends into the lower hulls so the dock reads as one solid join.
	var length := span - 1.95
	var center_x := -0.7 - length * 0.5
	var steel := mat("production_dock_steel", STEEL_DARK)
	var casing := mat("production_dock_casing", STEEL)
	box(dock, Vector3(length, 0.56, 1.36), steel, Vector3(center_x, 0.40, 0.0))
	box(dock, Vector3(length, 0.16, 1.16), casing, Vector3(center_x, 0.74, 0.0))
	for side in [-1.0, 1.0]:
		box(dock, Vector3(length, 0.12, 0.14), team_mat(owner_id), Vector3(center_x, 0.75, side * 0.59))
	return dock

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

static func _sporeburst(root: Node3D, glow: Material, cocoon: bool) -> void:
	var shell := mat("sporeburst_shell", CHITIN_DARK)
	var sac := mat("sporeburst_sac", ACID, Color("#6bcf1b"), 1.2)
	var roll := Node3D.new()
	roll.name = "Roll"
	roll.position.y = 0.56
	root.add_child(roll)
	sph(roll, 0.53, shell, Vector3.ZERO, Vector3(1.28, 1.0, 0.8))
	if cocoon:
		for i in range(5):
			var angle := float(i) * TAU / 5.0
			sph(roll, 0.24, sac, Vector3(cos(angle) * 0.43, 0.13, sin(angle) * 0.33))
		return
	for side in [-1.0, 1.0]:
		for i in range(3):
			sph(roll, 0.30 - float(i) * 0.045, sac, Vector3(-0.46 + i * 0.31, 0.13, side * 0.28))
			var leg := cyl(roll, 0.035, 0.087, 0.51, shell, Vector3(-0.43 + i * 0.39, -0.23, side * 0.38), Vector3(side * -51.0, 0.0, 0.0), 6)
			leg.name = "Leg%s%d" % ["L" if side < 0 else "R", i]
	sph(roll, 0.24, shell, Vector3(0.52, -0.12, 0.0))
	for side in [-1.0, 1.0]:
		sph(roll, 0.06, glow, Vector3(0.68, -0.06, side * 0.13))

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

static func _carapace_bulwark(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	sph(root, 0.89, m[0], Vector3(-0.17, 0.75, 0), Vector3(1.29, 0.78, 1.09))
	sph(root, 0.45, m[2], Vector3(0.72, 0.82, 0), Vector3(1.14, 0.88, 1.03))
	_legs(root, m[2], 3, 0.63, 1.21, 0.09, 0.48, -0.06, 53.0)
	for index in range(3):
		var x := 0.45 - index * 0.51
		sph(root, 0.5, m[1], Vector3(x, 1.31, 0), Vector3(0.84, 0.40, 1.76))
		cone(root, 0.10, 0.48, m[2], Vector3(x, 1.55, 0), Vector3(0, 0, 15), 6)
	for side in [-1.0, 1.0]:
		sph(root, 0.09, glow, Vector3(0.99, 0.94, side * 0.25))
		caps(root, 0.23, 0.96, m[2], Vector3(0.78, 0.59, side * 0.76), Vector3(0, 0, -68))
		cone(root, 0.16, 0.69, m[1], Vector3(1.27, 0.66, side * 0.66), Vector3(side * 11, 0, -98), 6)

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

static func _tunnel_mouth(root: Node3D, glow: Material) -> void:
	var m := _bug_mats()
	var shadow := mat("tunnel_interior", Color("#171022"))
	sph(root, 2.15, m[0], Vector3(0, 0.31, 0), Vector3(1.02, 0.48, 0.94))
	cyl(root, 1.24, 1.36, 0.27, shadow, Vector3(0.22, 1.24, 0), Vector3.ZERO, 9)
	for index in range(7):
		var angle := TAU * index / 7.0
		var radial := Vector3(cos(angle), 0, sin(angle))
		cone(root, 0.33, 1.42, m[2], radial * 1.41 + Vector3(0, 1.0, 0), Vector3(-21 * sin(angle), 0, 21 * cos(angle)), 6)
		sph(root, 0.14, glow, radial * 1.31 + Vector3(0, 1.36, 0))

static func _brood_keeper(root: Node3D, glow: Material) -> void:
	var materials := _bug_mats()
	sph(root, 0.87, materials[0], Vector3(-0.38, 0.8, 0), Vector3(1.32, 0.72, 0.96))
	sph(root, 0.59, materials[1], Vector3(0.53, 1.22, 0), Vector3(0.8, 1.25, 0.76))
	sph(root, 0.42, materials[2], Vector3(0.91, 1.65, 0), Vector3(0.95, 0.68, 0.84))
	_legs(root, materials[2], 3, 0.55, 1.15, 0.1, 0.40, -0.16, 58.0)
	for side in [-1.0, 1.0]:
		sph(root, 0.10, glow, Vector3(1.14, 1.76, side * 0.22))
		cone(root, 0.18, 0.88, materials[1], Vector3(0.27, 1.59, side * 0.57), Vector3(0, 0, 15), 6)
		for i in range(2):
			sph(root, 0.23, glow, Vector3(-0.46 - i * 0.44, 1.30, side * 0.42), Vector3(1, 1.24, 0.88), 8)

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

static func _veilseeker(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	var scan := mat("veilseeker_scan", Color("#6dffed"), Color("#19c2cc"), 1.65, 0.12, 0.25)
	var hover := Node3D.new()
	hover.name = "Hover"
	hover.position.y = 1.1
	root.add_child(hover)
	cyl(hover, 0.65, 0.92, 0.28, m[0], Vector3.ZERO, Vector3.ZERO, 6)
	cyl(hover, 0.38, 0.52, 0.47, m[1], Vector3(0, 0.23, 0), Vector3.ZERO, 6)
	ring(hover, 0.49, 0.60, team, Vector3(0.12, 0.62, 0), Vector3(0, 0, 52))
	ring(hover, 0.29, 0.36, scan, Vector3(0.18, 0.67, 0), Vector3(0, 0, 52))
	sph(hover, 0.24, scan, Vector3(0.22, 0.68, 0), Vector3(0.85, 0.80, 1.0), 8)
	for side in [-1.0, 1.0]:
		box(hover, Vector3(0.57, 0.16, 0.41), m[1], Vector3(-0.38, -0.03, side * 0.70), Vector3(0, side * 25.0, 0))
		sph(hover, 0.10, scan, Vector3(-0.45, -0.01, side * 0.88), Vector3.ONE, 6)

static func _farsight_wisp(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	var lens := mat("wisp_lens", Color("#dcfff4"), Color("#63ead5"), 2.3, 0.1, 0.2)
	sph(root, 0.36, m[0], Vector3(0, 0.5, 0), Vector3(1.15, 0.72, 0.95), 8)
	ring(root, 0.30, 0.42, team, Vector3(0.18, 0.52, 0), Vector3(0, 0, 80))
	sph(root, 0.23, lens, Vector3(0.34, 0.54, 0), Vector3(0.68, 1, 1), 8)
	for side in [-1.0, 1.0]:
		box(root, Vector3(0.74, 0.13, 0.22), m[1], Vector3(-0.15, 0.54, side * 0.36), Vector3(0, side * -29.0, side * 18.0))
		sph(root, 0.09, lens, Vector3(-0.40, 0.64, side * 0.58), Vector3.ONE, 6)

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

static func _sunblade(root: Node3D, team: Material, articulated: bool = false) -> void:
	var m := _alien_mats()
	caps(root, 0.3, 1.7, m[0], Vector3(0, 1.1, 0))
	sph(root, 0.24, m[0], Vector3(0.02, 2.0, 0))
	cone(root, 0.12, 0.7, m[1], Vector3(-0.12, 2.35, 0), Vector3(0, 0, 25), 5)
	sph(root, 0.1, team, Vector3(0.28, 1.5, 0))
	box(root, Vector3(0.5, 0.1, 0.55), team, Vector3(0.0, 1.55, 0), Vector3(0, 0, 18))
	for side in [-1.0, 1.0]:
		if articulated:
			_sunblade_arm(root, side, m[1])
		else:
			sph(root, 0.2, m[1], Vector3(0, 1.75, side * 0.42), Vector3(1, 0.7, 1))
			box(root, Vector3(1.5, 0.07, 0.2), m[4], Vector3(0.75, 1.2, side * 0.62), Vector3(0, side * -8.0, 0))
			box(root, Vector3(0.3, 0.12, 0.12), m[1], Vector3(0.1, 1.2, side * 0.58))
	box(root, Vector3(0.1, 1.3, 0.8), m[0], Vector3(-0.32, 0.9, 0), Vector3(0, 0, -6))
	for side2 in [-1.0, 1.0]:
		cyl(root, 0.07, 0.1, 0.8, m[1], Vector3(0, 0.4, side2 * 0.14), Vector3.ZERO, 6)

static func _sunblade_arm(root: Node3D, side: float, armor: Material) -> void:
	var side_name := "Left" if side < 0.0 else "Right"
	var arm := Node3D.new()
	arm.name = "Sunblade%sArm" % side_name
	arm.position = Vector3(0, 1.69, side * 0.50)
	root.add_child(arm)
	sph(arm, 0.25, armor, Vector3.ZERO, Vector3(1, 0.8, 1))
	var forearm := Node3D.new()
	forearm.name = "Sunblade%sForearm" % side_name
	forearm.position = Vector3(0.10, -0.22, side * 0.04)
	arm.add_child(forearm)
	box(forearm, Vector3(0.27, 0.40, 0.25), armor, Vector3(0.14, -0.16, side * 0.05), Vector3(0, 0, 27))
	var edge := mat("sunblade_edge", Color("#2ea8ff"), Color("#2384ff"), 1.7)
	var core := mat("sunblade_core", Color("#c8faff"), Color("#c8faff"), 1.65)
	var grip := Vector3(0.29, -0.29, side * 0.12)
	cone(forearm, 0.18, 1.64, edge, grip + Vector3(0.82, 0, 0), Vector3(0, 0, -90), 4)
	cone(forearm, 0.08, 1.53, core, grip + Vector3(0.77, 0.11, 0), Vector3(0, 0, -90), 4)
	for suffix in ["Base", "Tip"]:
		var marker := Marker3D.new()
		marker.name = side_name + "Blade" + suffix
		marker.position = grip + (Vector3(1.64, 0, 0) if suffix == "Tip" else Vector3.ZERO)
		forearm.add_child(marker)

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

static func _crownspire(root: Node3D, team: Material) -> void:
	var m := _alien_mats()
	var flux := mat("crown_flux", Color("#97fffd"), Color("#4bd9ed"), 2.15, 0.2, 0.22)
	var dark := mat("crown_inset", Color("#254052"), Color.BLACK, 1.0, 0.35, 0.55)
	cyl(root, 0.52, 1.01, 4.2, m[0], Vector3(-0.45, 0.65, 0), Vector3(0, 0, -90), 6)
	cyl(root, 0.33, 0.56, 2.0, dark, Vector3(1.52, 0.70, 0), Vector3(0, 0, -90), 8)
	ring(root, 0.49, 0.63, m[1], Vector3(1.26, 0.70, 0), Vector3(0, 0, 90))
	ring(root, 0.25, 0.36, flux, Vector3(2.47, 0.70, 0), Vector3(0, 0, 90))
	sph(root, 0.29, flux, Vector3(2.55, 0.70, 0), Vector3(0.60, 1.0, 1.0), 8)
	box(root, Vector3(1.2, 0.24, 0.76), team, Vector3(-0.51, 1.48, 0))
	sph(root, 0.29, flux, Vector3(-0.39, 1.63, 0), Vector3(1.48, 0.43, 0.8), 8)
	for side in [-1.0, 1.0]:
		box(root, Vector3(2.68, 0.34, 0.61), m[1], Vector3(-0.55, 0.76, side * 1.19), Vector3(0, side * -31.0, side * 8.0))
		cyl(root, 0.21, 0.44, 1.62, m[0], Vector3(-1.45, 0.62, side * 1.52), Vector3(0, 0, -90), 6)
		sph(root, 0.31, flux, Vector3(-2.20, 0.61, side * 1.52), Vector3(0.60, 1.0, 1.0), 8)
		box(root, Vector3(1.16, 0.24, 0.19), team, Vector3(-0.34, 0.87, side * 1.68), Vector3(0, side * -28.0, 0))

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
