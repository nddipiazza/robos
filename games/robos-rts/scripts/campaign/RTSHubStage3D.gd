extends Control

# RTSHubStage3D.gd — Real-Time 3D Story-Mode Hub Set Engine for Starfall Command
# Renders the 3 macro campaign environments and mutates props, Bridge orbital skyboxes,
# Armory unit floor spawns, Cantina visitors/trophies, and Lab Relic/Crystal state.

const Models = preload("res://scripts/RTSModels.gd")
const PlanetShader = preload("res://scripts/campaign/rts_planet.gdshader")
const HubState = preload("res://scripts/campaign/RTSHubState.gd")

var _planet_backdrop: ColorRect
var _planet_mat: ShaderMaterial
var _vp_container: SubViewportContainer
var _vp: SubViewport
var _env: Environment
var _key_light: DirectionalLight3D
var _rim_light: DirectionalLight3D
var _cam: Camera3D
var _world_root: Node3D

var _cam_goal := Vector3(0.0, 4.4, 11.2)
var _look_goal := Vector3(0.0, 1.8, -2.0)
var _look_cur := Vector3(0.0, 1.8, -2.0)
var _elapsed := 0.0
var _shell_cd := 1.5

var _spin_nodes: Array[Dictionary] = []
var _bob_nodes: Array[Dictionary] = []
var _cloak_nodes: Array[Node3D] = []
var _ash_particles: Array[Node3D] = []
var _orbital_drifters: Array[Dictionary] = []
var _tracers: Array[Dictionary] = []
var _built_signature := ""

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Dynamic planetary / space shader backdrop visible through the Bridge's transparent 3D viewport!
	_planet_backdrop = ColorRect.new()
	_planet_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_planet_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_planet_mat = ShaderMaterial.new()
	_planet_mat.shader = PlanetShader
	_planet_mat.set_shader_parameter("viewport_aspect", Vector2(1920.0 / 1080.0, 1.0))
	_planet_backdrop.material = _planet_mat
	_planet_backdrop.hide()
	add_child(_planet_backdrop)

	if DisplayServer.get_name() == "headless":
		set_process(false)
		return

	_vp_container = SubViewportContainer.new()
	_vp_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_vp_container.stretch = true
	_vp_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_vp_container)

	_vp = SubViewport.new()
	_vp.size = Vector2i(1920, 1080)
	_vp.own_world_3d = true
	_vp.msaa_3d = Viewport.MSAA_4X
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_vp_container.add_child(_vp)

	_env = Environment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#09111b")
	_env.tonemap_mode = Environment.TONE_MAPPER_ACES
	_env.tonemap_exposure = 0.98
	_env.tonemap_white = 4.8
	_env.glow_enabled = true
	_env.glow_hdr_threshold = 1.28
	_env.glow_intensity = 0.32
	_env.glow_bloom = 0.05
	_env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color("#8ba8c0")
	_env.ambient_light_energy = 0.68
	var we := WorldEnvironment.new()
	we.environment = _env
	_vp.add_child(we)

	_key_light = DirectionalLight3D.new()
	_key_light.rotation_degrees = Vector3(-38.0, -32.0, 0.0)
	_key_light.light_color = Color("#ffe8cc")
	_key_light.light_energy = 1.15
	_key_light.shadow_enabled = true
	_vp.add_child(_key_light)

	_rim_light = DirectionalLight3D.new()
	_rim_light.rotation_degrees = Vector3(-20.0, 148.0, 0.0)
	_rim_light.light_color = Color("#46dcff")
	_rim_light.light_energy = 0.68
	_vp.add_child(_rim_light)

	_cam = Camera3D.new()
	_cam.fov = 40.0
	_cam.near = 0.1
	_cam.far = 220.0
	_vp.add_child(_cam)

	_world_root = Node3D.new()
	_vp.add_child(_world_root)

	visibility_changed.connect(_sync_render_mode)

func _sync_render_mode() -> void:
	if _vp == null:
		return
	var active := is_visible_in_tree()
	set_process(active)
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if active else SubViewport.UPDATE_DISABLED

func set_active(active: bool) -> void:
	if _vp == null:
		return
	set_process(active and is_visible_in_tree())
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if (active and is_visible_in_tree()) else SubViewport.UPDATE_DISABLED

func configure_stage(room_id: String, snap: Dictionary) -> void:
	var macro := str(snap.macro_location)
	# In Stage 7 (Cinderfall Forward Trench Camp), all 4 tabs share one outdoor volcanic set and pan the camera!
	var scene_key := macro if macro in ["vesper_saloon", "cinderfall_camp"] else ("ship_" + room_id)
	var sig := "%s|st:%d|sub:%d|orb:%s|rel:%d|br:%d|lira:%s|ner:%s|cov:%s|voss:%s|tr:%s|u:%s" % [
		scene_key, int(snap.stage_num), int(snap.saloon_substage), str(snap.orbit_key),
		int(snap.relic_pieces), int(snap.brood_stage), str(snap.lira_present), str(snap.neral_crystal),
		str(snap.covert_mode), str(snap.voss_in_cantina), JSON.stringify(snap.trophies),
		JSON.stringify(snap.armory_units.map(func(x): return x.unlocked)),
	]

	if DisplayServer.get_name() == "headless" or _world_root == null:
		return

	if sig != _built_signature:
		_built_signature = sig
		_clear_world()
		match scene_key:
			"vesper_saloon":
				_build_vesper_saloon(snap)
			"cinderfall_camp":
				_build_cinderfall_camp(snap)
			"ship_bridge":
				_build_starfall_bridge(snap)
			"ship_armory":
				_build_starfall_armory(snap)
			"ship_cantina":
				_build_starfall_cantina(snap)
			"ship_laboratory":
				_build_starfall_lab(snap)
		_cam.position = _cam_goal + Vector3(0.0, 0.15, 0.55)
		_look_cur = _look_goal
		_cam.look_at(_look_cur, Vector3.UP)

	if macro == "cinderfall_camp":
		_apply_cinderfall_camera_focus(room_id)

func _apply_cinderfall_camera_focus(room_id: String) -> void:
	match room_id:
		"armory":
			_cam_goal = Vector3(-6.2, 4.1, 9.6)
			_look_goal = Vector3(-6.4, 1.4, -2.4)
		"laboratory":
			_cam_goal = Vector3(6.2, 4.2, 9.6)
			_look_goal = Vector3(6.4, 1.8, -2.4)
		"cantina":
			_cam_goal = Vector3(-1.8, 3.8, 10.6)
			_look_goal = Vector3(-2.6, 1.3, 1.6)
		_:
			# Wide panoramic Cinderfall Trench Camp overview centered on Vale & Arden's Command Tent!
			_cam_goal = Vector3(0.0, 5.4, 13.8)
			_look_goal = Vector3(0.0, 1.6, -1.8)

func _process(delta: float) -> void:
	if _cam == null:
		return
	_elapsed += delta
	var w := 1.0 - exp(-delta * 4.5)
	_cam.position = _cam.position.lerp(_cam_goal, w)
	_look_cur = _look_cur.lerp(_look_goal, w)
	var sway := Vector3(sin(_elapsed * 0.45) * 0.03, cos(_elapsed * 0.37) * 0.02, 0.0)
	if _cam.position.distance_squared_to(_look_cur) > 0.05:
		_cam.look_at(_look_cur + sway, Vector3.UP)

	for s in _spin_nodes:
		var n: Node3D = s.node
		if is_instance_valid(n):
			n.rotate_y(delta * float(s.speed))

	for b in _bob_nodes:
		var n: Node3D = b.node
		if is_instance_valid(n):
			n.position.y = float(b.base_y) + sin(_elapsed * float(b.freq) + float(b.phase)) * float(b.amp)

	# Periodic stealth cloak/decloak cycle for Shade Agent Voss in the Armory covert corner!
	for cn in _cloak_nodes:
		if is_instance_valid(cn):
			var cyc := sin(_elapsed * 1.15)
			cn.visible = cyc > -0.35

	for ap in _ash_particles:
		if is_instance_valid(ap):
			ap.position += Vector3(-0.35, -1.15, 0.25) * delta
			if ap.position.y < 0.05:
				ap.position.y = 7.5
				ap.position.x = fposmod(ap.position.x + 13.0, 26.0) - 13.0

	for dr in _orbital_drifters:
		var dn: Node3D = dr.node
		if is_instance_valid(dn):
			dn.position += (dr.vel as Vector3) * delta
			if bool(dr.get("tumble", false)):
				dn.rotate_x(delta * 0.25)
				dn.rotate_y(delta * 0.38)
			if dn.position.x > 22.0:
				dn.position.x = -22.0
			elif dn.position.x < -22.0:
				dn.position.x = 22.0

	if _built_signature.begins_with("cinderfall_camp"):
		_shell_cd -= delta
		if _shell_cd <= 0.0:
			_shell_cd = 1.85
			_spawn_camp_shell()

	for i in range(_tracers.size() - 1, -1, -1):
		var tr: Dictionary = _tracers[i]
		tr.life = float(tr.life) - delta
		var tn: Node3D = tr.node
		if float(tr.life) <= 0.0 or not is_instance_valid(tn):
			if is_instance_valid(tn):
				tn.queue_free()
			_tracers.remove_at(i)
		else:
			var u := 1.0 - float(tr.life) / float(tr.max_life)
			tn.position = (tr.from as Vector3).lerp(tr.to as Vector3, u) + Vector3(0.0, sin(u * PI) * 4.2, 0.0)

func _spawn_camp_shell() -> void:
	if _world_root == null:
		return
	var shell := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.16
	sm.height = 0.32
	shell.mesh = sm
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color("#ff9d3b")
	shell.material_override = mat
	var p0 := Vector3(-8.4, 1.4, -5.8)
	var p1 := Vector3(8.0, 9.5, -26.0)
	shell.position = p0
	_world_root.add_child(shell)
	_tracers.append({"node": shell, "from": p0, "to": p1, "life": 0.85, "max_life": 0.85})

func _clear_world() -> void:
	_spin_nodes.clear()
	_bob_nodes.clear()
	_cloak_nodes.clear()
	_ash_particles.clear()
	_orbital_drifters.clear()
	_tracers.clear()
	_planet_backdrop.hide()
	if _vp:
		_vp.transparent_bg = false
	if _env:
		_env.background_mode = Environment.BG_COLOR
		_env.fog_enabled = true
		_env.fog_density = 0.014
		_env.ambient_light_color = Color("#8ba8c0")
		_env.ambient_light_energy = 0.68
	if _key_light:
		_key_light.light_color = Color("#ffe8cc")
		_key_light.light_energy = 1.15
		_key_light.rotation_degrees = Vector3(-38.0, -32.0, 0.0)
	if _rim_light:
		_rim_light.light_color = Color("#46dcff")
		_rim_light.light_energy = 0.68
	if _world_root == null:
		return
	for c in _world_root.get_children():
		c.queue_free()

func _load_tex(res_path: String) -> Texture2D:
	if DisplayServer.get_name() == "headless" or res_path.is_empty():
		return null
	if ResourceLoader.exists(res_path, "Texture2D"):
		var t = load(res_path)
		if t is Texture2D:
			return t
	if FileAccess.file_exists(res_path):
		var img := Image.new()
		if img.load_webp_from_buffer(FileAccess.get_file_as_bytes(res_path)) == OK:
			return ImageTexture.create_from_image(img)
	return null

func _floor_plane(tex_path: String, tint: Color, rough: float = 0.62, sz: float = 80.0, uv_s: float = 12.0) -> void:
	var mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(sz, sz)
	mi.mesh = pm
	var m := StandardMaterial3D.new()
	var tex := _load_tex(tex_path)
	if tex:
		m.albedo_texture = tex
		m.uv1_scale = Vector3(uv_s, uv_s, 1.0)
	m.albedo_color = tint
	m.roughness = rough
	m.metallic = 0.25 if rough < 0.6 else 0.06
	mi.material_override = m
	_world_root.add_child(mi)

const UNIT_FALLBACKS := {
	"captain_vale": "rifleman",
	"commander_rook": "breacher",
	"engineer_holt": "torchguard",
	"doctor_aster": "triage_specialist",
	"seer_neral": "duskblade",
	"marshal_arden": "breacher",
	"brood_matriarch": "mireweaver",
	"atlas_walker": "warden_walker",
	"rampart_transport": "kestrel_interceptor",
	"night_harrier": "kestrel_interceptor",
	"dreadnought": "kestrel_interceptor",
}

func _spawn_unit(uid: String, owner_id: int, pos: Vector3, yaw_rad: float = 0.0, scl: float = 1.0) -> Node3D:
	if _world_root == null:
		return null
	var resolved := uid
	if not RTSData.units.has(resolved) and resolved not in Models.BAKED_MODELS:
		resolved = str(UNIT_FALLBACKS.get(resolved, ""))
	if resolved.is_empty() or (not RTSData.units.has(resolved) and resolved not in Models.BAKED_MODELS):
		return null
	var n: Node3D = Models.build(resolved, owner_id)
	if n == null:
		return null
	n.position = pos
	n.rotation.y = yaw_rad
	n.scale = Vector3(scl, scl, scl)
	_world_root.add_child(n)
	return n

func _omni(pos: Vector3, col: Color, energy: float, rng: float) -> OmniLight3D:
	var l := OmniLight3D.new()
	l.position = pos
	l.light_color = col
	l.light_energy = energy
	l.omni_range = rng
	_world_root.add_child(l)
	return l

# =============================================================================
# STAGE 1: VESPER OUTPOST SALOON ("Joeyray's Bar" — Missions 1 to 3)
# =============================================================================
func _build_vesper_saloon(snap: Dictionary) -> void:
	_env.background_color = Color("#1c120d")
	_env.fog_light_color = Color("#342116")
	_env.fog_density = 0.020
	_env.ambient_light_color = Color("#c89b74")
	_env.ambient_light_energy = 0.62
	_key_light.light_color = Color("#ffbe76")
	_key_light.light_energy = 1.18
	_key_light.rotation_degrees = Vector3(-32.0, 42.0, 0.0)
	_rim_light.light_color = Color("#ff5838")
	_rim_light.light_energy = 0.58

	_floor_plane("res://assets/terrain/military-paving.webp", Color("#4e3829"), 0.78, 60.0, 10.0)

	var wood_dark := Models.mat("saloon_wood", Color("#3b261a"), Color.BLACK, 1.0, 0.12, 0.78)
	var steel_rust := Models.mat("saloon_steel", Color("#36302c"), Color.BLACK, 1.0, 0.45, 0.58)
	var neon_red := Models.mat("saloon_neon_red", Color("#ff4638"), Color("#e82418"), 1.9, 0.0, 0.2)
	var neon_amber := Models.mat("saloon_neon_amber", Color("#ffbe48"), Color("#e89218"), 1.8, 0.0, 0.2)
	var neon_cyan := Models.mat("saloon_neon_cyan", Color("#4af2ff"), Color("#18b8e0"), 1.8, 0.0, 0.2)
	var gold_badge := Models.mat("saloon_gold", Color("#f2c958"), Color("#b88618"), 0.8, 0.75, 0.25)

	# Enclosed frontier saloon walls + desert sunlight window slats on left wall
	Models.box(_world_root, Vector3(20.0, 6.8, 0.5), steel_rust, Vector3(0.0, 3.4, -7.2))
	Models.box(_world_root, Vector3(0.5, 6.8, 16.0), steel_rust, Vector3(-9.8, 3.4, 0.0))
	Models.box(_world_root, Vector3(0.5, 6.8, 16.0), steel_rust, Vector3(9.8, 3.4, 0.0))
	for s_i in 5:
		Models.box(_world_root, Vector3(0.12, 0.22, 3.2), neon_amber, Vector3(-9.45, 2.4 + float(s_i) * 0.42, -1.6))
	_omni(Vector3(-6.8, 3.2, -1.6), Color("#ffae58"), 1.35, 11.0)

	# Mounted Gnarl Skull Trophy on back wall wrapped in red neon + Wanted Posters!
	Models.box(_world_root, Vector3(2.1, 1.6, 0.18), wood_dark, Vector3(-4.6, 3.9, -6.85))
	Models.ring(_world_root, 0.72, 0.82, neon_red, Vector3(-4.6, 3.9, -6.72), Vector3(90, 0, 0))
	var skull := _spawn_unit("skitterling", 2, Vector3(-4.6, 3.55, -6.35), -PI * 0.5, 0.88)
	if skull:
		skull.rotation.x = 0.25
	# Wanted posters board
	Models.box(_world_root, Vector3(1.8, 1.3, 0.12), wood_dark, Vector3(-1.4, 3.4, -6.9))
	Models.box(_world_root, Vector3(0.52, 0.68, 0.14), Models.mat("poster_a", Color("#d8c8a8")), Vector3(-1.8, 3.45, -6.86))
	Models.box(_world_root, Vector3(0.52, 0.68, 0.14), Models.mat("poster_b", Color("#ccb896")), Vector3(-1.0, 3.38, -6.86))

	# Classic Glowing Jukebox (Back-Left)
	Models.box(_world_root, Vector3(1.45, 2.55, 0.95), wood_dark, Vector3(-6.8, 1.28, -4.8), Vector3(0, 22, 0))
	Models.cyl(_world_root, 0.68, 0.68, 0.92, neon_amber, Vector3(-6.8, 2.55, -4.8), Vector3(90, 22, 0), 18)
	Models.box(_world_root, Vector3(0.95, 1.05, 0.98), neon_cyan, Vector3(-6.8, 1.45, -4.8), Vector3(0, 22, 0))
	_omni(Vector3(-6.0, 2.1, -4.1), Color("#ff9e3d"), 1.1, 6.5)

	# Overhead Cracked FRN Flatscreen TV (Upper Center-Right)
	Models.box(_world_root, Vector3(3.1, 1.85, 0.24), steel_rust, Vector3(1.6, 4.35, -5.4), Vector3(12, -10, 0))
	Models.box(_world_root, Vector3(2.78, 1.52, 0.26), Models.mat("frn_screen_bg", Color("#1b3548"), Color("#286284"), 1.1), Vector3(1.6, 4.35, -5.38), Vector3(12, -10, 0))
	Models.box(_world_root, Vector3(2.78, 0.24, 0.28), neon_red, Vector3(1.6, 3.72, -5.32), Vector3(12, -10, 0))

	# Saloon Bar Counter + Framed Photo + Vale's Confederate/Rebel Marshal Badge!
	Models.box(_world_root, Vector3(6.2, 1.18, 1.15), steel_rust, Vector3(4.2, 0.59, -2.6))
	Models.box(_world_root, Vector3(6.5, 0.14, 1.38), wood_dark, Vector3(4.2, 1.24, -2.6))
	for b_i in 7:
		Models.cyl(_world_root, 0.07, 0.09, 0.42, neon_amber if b_i % 2 == 0 else neon_cyan, Vector3(2.1 + float(b_i) * 0.62, 1.52, -2.95))
	# Framed photo + gleaming gold Marshal Star Badge on the counter!
	Models.box(_world_root, Vector3(0.38, 0.46, 0.08), wood_dark, Vector3(2.3, 1.52, -2.25), Vector3(-16, -24, 0))
	Models.cyl(_world_root, 0.22, 0.22, 0.05, gold_badge, Vector3(1.65, 1.34, -2.15), Vector3.ZERO, 6)

	# Captain Vale standing at the bar counter
	var vale := _spawn_unit("captain_vale", 1, Vector3(1.2, 0.0, -1.1), -2.1, 1.22)
	if vale:
		_bob_nodes.append({"node": vale, "base_y": 0.0, "freq": 1.5, "amp": 0.012, "phase": 0.2})

	# Center Saloon Table + State-Driven Corporal Rook & White Ridge Artifact Crate!
	Models.cyl(_world_root, 1.15, 1.15, 0.14, wood_dark, Vector3(-1.4, 0.96, 0.8), Vector3.ZERO, 20)
	Models.cyl(_world_root, 0.24, 0.36, 0.92, steel_rust, Vector3(-1.4, 0.46, 0.8), Vector3.ZERO, 14)

	var sub := int(snap.saloon_substage)
	if sub >= 1:
		# After Cut the Signal: Corporal Rook spawns in heavy Breacher armor at the center table!
		var rook := _spawn_unit("commander_rook", 1, Vector3(-3.0, 0.0, 0.6), 0.35, 1.24)
		if rook:
			_bob_nodes.append({"node": rook, "base_y": 0.0, "freq": 1.3, "amp": 0.012, "phase": 1.4})
	if sub >= 2:
		# After White Ridge: Excavated 1st Aurelian Artifact Shard pulses inside an open armored crate!
		Models.box(_world_root, Vector3(1.05, 0.62, 0.85), steel_rust, Vector3(-1.4, 0.31, 2.35))
		var shard := Node3D.new()
		shard.position = Vector3(-1.4, 1.05, 2.35)
		Models.cone(shard, 0.26, 0.65, neon_cyan, Vector3(0, 0.18, 0), Vector3.ZERO, 5)
		_world_root.add_child(shard)
		_spin_nodes.append({"node": shard, "speed": 1.1})
		_omni(Vector3(-1.4, 1.2, 2.35), Color("#4af2ff"), 1.25, 5.0)

	# Adjutant / Resistance Job Board Terminal (Right-Foreground)
	Models.box(_world_root, Vector3(1.9, 1.35, 0.95), steel_rust, Vector3(4.15, 0.68, 1.15), Vector3(0, -28, 0))
	Models.box(_world_root, Vector3(1.55, 0.92, 0.12), neon_cyan, Vector3(4.02, 1.72, 1.08), Vector3(12, -28, 0))
	_omni(Vector3(3.8, 1.8, 1.6), Color("#4af2ff"), 0.95, 5.5)

	_cam_goal = Vector3(0.0, 3.65, 9.8)
	_look_goal = Vector3(0.0, 1.95, -2.2)

# =============================================================================
# STAGES 2–6: MSV STARFALL COMMAND BRIDGE (Dynamic Planetary Orbit Window!)
# =============================================================================
func _build_starfall_bridge(snap: Dictionary) -> void:
	var orbit: Dictionary = snap.orbit
	var p: Dictionary = orbit.planet
	_planet_mat.set_shader_parameter("primary_color", p.primary)
	_planet_mat.set_shader_parameter("secondary_color", p.secondary)
	_planet_mat.set_shader_parameter("accent_color", p.accent)
	_planet_mat.set_shader_parameter("atmo_color", p.atmo)
	_planet_mat.set_shader_parameter("glow_color", p.glow)
	_planet_mat.set_shader_parameter("cloud_density", float(p.clouds))
	_planet_mat.set_shader_parameter("glow_strength", float(p.glow_strength))
	_planet_mat.set_shader_parameter("planet_seed", float(p.seed))
	_planet_backdrop.show()

	_vp.transparent_bg = true
	_env.background_mode = Environment.BG_CLEAR_COLOR
	_env.fog_enabled = false
	var tint: Color = orbit.deck_tint
	_env.ambient_light_color = Color("#6f8da8").lerp(tint, 0.28)
	_env.ambient_light_energy = 0.68
	_key_light.light_color = tint.lightened(0.22)
	_key_light.light_energy = 1.25
	_key_light.rotation_degrees = Vector3(-28.0, 165.0, 0.0) # Sunlight pouring in through the forward Bridge window!
	_rim_light.light_color = Color("#48f0a6")
	_rim_light.light_energy = 0.62

	var deck_steel := Models.mat("bridge_steel", Color("#1e2732"), Color.BLACK, 1.0, 0.58, 0.42)
	var trim_gold := Models.mat("bridge_gold", Color("#8a7448"), Color.BLACK, 1.0, 0.65, 0.35)
	var holo_green := Models.mat("bridge_emerald", Color("#46f592"), Color("#22c86a"), 1.8, 0.0, 0.2)
	var holo_cyan := Models.mat("bridge_cyan", Color("#4af0ff"), Color("#1cb8e8"), 1.9, 0.0, 0.2)

	# Bridge command deck floor + recessed lower helm trenches — stopping at z = -6.2 so space + planet fill the window!
	Models.box(_world_root, Vector3(24.0, 0.5, 14.0), deck_steel, Vector3(0.0, -0.25, 1.2))
	Models.box(_world_root, Vector3(11.0, 0.32, 9.2), deck_steel.duplicate(), Vector3(0.0, 0.16, 1.4))
	Models.box(_world_root, Vector3(26.0, 0.7, 13.0), deck_steel, Vector3(0.0, 6.8, 0.6))
	Models.cyl(_world_root, 3.2, 3.6, 0.22, holo_cyan, Vector3(0.0, 6.42, 0.2), Vector3.ZERO, 24)

	# Multi-paned Forward Starship Window Mullions & Bulkhead Ribs
	Models.box(_world_root, Vector3(24.0, 1.25, 0.65), deck_steel, Vector3(0.0, 0.62, -5.8))
	Models.box(_world_root, Vector3(24.0, 0.95, 0.75), deck_steel, Vector3(0.0, 6.1, -5.8))
	for wx in [-8.4, -3.6, 3.6, 8.4]:
		Models.box(_world_root, Vector3(0.58, 6.4, 0.68), deck_steel, Vector3(wx, 3.2, -5.8), Vector3(0, 0, -wx * 0.6))
		Models.box(_world_root, Vector3(0.14, 5.2, 0.72), trim_gold, Vector3(wx, 3.2, -5.75), Vector3(0, 0, -wx * 0.6))

	# Recessed Helm Crew Consoles along the forward window trench
	for hx in [-5.8, -1.8, 1.8, 5.8]:
		Models.box(_world_root, Vector3(1.65, 0.85, 0.85), deck_steel, Vector3(hx, 0.42, -4.4))
		Models.box(_world_root, Vector3(1.35, 0.45, 0.10), holo_green, Vector3(hx, 1.02, -4.55), Vector3(-25, 0, 0))
		_spawn_unit("pioneer", 1, Vector3(hx, 0.0, -3.55), PI * 0.5, 0.82)

	# Dynamic 3D Orbital Traffic & Planetary Phenomenon outside the forward glass!
	_populate_bridge_orbit_phenomenon(str(orbit.phenomenon))

	# Center-Foreground: Rotating 3D Sector Star Map Holo-Table!
	Models.cyl(_world_root, 2.05, 2.35, 0.96, deck_steel, Vector3(-0.6, 0.48, 1.0), Vector3.ZERO, 24)
	Models.ring(_world_root, 1.68, 1.92, holo_green, Vector3(-0.6, 0.98, 1.0))
	_omni(Vector3(-0.6, 1.85, 1.0), Color("#46f592"), 1.35, 7.0)

	var star_map := Node3D.new()
	star_map.position = Vector3(-0.6, 1.68, 1.0)
	_world_root.add_child(star_map)
	Models.ring(star_map, 1.15, 1.22, holo_green, Vector3.ZERO)
	Models.ring(star_map, 0.68, 0.74, holo_cyan, Vector3.ZERO, Vector3(22, 0, 14))
	for p_i in 5:
		var ang := TAU * float(p_i) / 5.0
		var orb_pt := Vector3(cos(ang) * 1.05, sin(float(p_i) * 1.5) * 0.18, sin(ang) * 1.05)
		Models.sph(star_map, 0.11, holo_cyan if p_i % 2 == 0 else holo_green, orb_pt)
	_spin_nodes.append({"node": star_map, "speed": 0.35})

	# Captain Vale & Pilot Sable flanking the Star Map
	var vale := _spawn_unit("captain_vale", 1, Vector3(1.85, 0.32, 1.15), 2.55, 1.18)
	var sable := _spawn_unit("triage_specialist", 1, Vector3(-3.05, 0.32, 0.95), 0.45, 1.15)
	if vale:
		_bob_nodes.append({"node": vale, "base_y": 0.32, "freq": 1.4, "amp": 0.012, "phase": 0.0})
	if sable:
		_bob_nodes.append({"node": sable, "base_y": 0.32, "freq": 1.6, "amp": 0.012, "phase": 1.3})

	# Left Foreground Bulkhead: Adjutant Battle Reports / Mission Archive Console
	Models.box(_world_root, Vector3(1.85, 2.35, 1.05), deck_steel, Vector3(-6.4, 1.18, 1.6), Vector3(0, 32, 0))
	Models.box(_world_root, Vector3(1.38, 0.92, 0.12), holo_cyan, Vector3(-6.05, 1.68, 1.38), Vector3(-10, 32, 0))

	# Right Foreground Pit: Mutator Matrix Console
	Models.box(_world_root, Vector3(2.2, 1.05, 1.1), deck_steel, Vector3(5.6, 0.52, 2.2), Vector3(0, -28, 0))
	Models.box(_world_root, Vector3(1.75, 0.55, 0.10), holo_green, Vector3(5.45, 1.18, 2.08), Vector3(-22, -28, 0))

	# Upper-Right Bulkhead: Bridge Holo-Communicator (Dormant until Stage 6 -> Marshal Arden Live Hologram!)
	Models.box(_world_root, Vector3(2.1, 1.65, 0.35), deck_steel, Vector3(6.8, 3.65, -2.2), Vector3(8, -32, 0))
	if bool(snap.arden_comm):
		Models.ring(_world_root, 0.68, 0.82, holo_cyan, Vector3(6.35, 2.65, -1.85))
		var arden_holo := _spawn_unit("marshal_arden", 1, Vector3(6.35, 2.68, -1.85), 2.45, 0.92)
		if arden_holo:
			for mi in arden_holo.find_children("*", "MeshInstance3D", true, false):
				mi.material_override = holo_cyan
			_spin_nodes.append({"node": arden_holo, "speed": 0.18})
		_omni(Vector3(6.1, 3.3, -1.6), Color("#4af0ff"), 1.35, 6.0)

	_cam_goal = Vector3(0.0, 4.15, 9.8)
	_look_goal = Vector3(0.0, 1.95, -2.6)

func _populate_bridge_orbit_phenomenon(phenomenon: String) -> void:
	# Always fly an escort Kestrel patrol outside the forward glass
	for idx in 2:
		var kp := Vector3(-14.0 - float(idx) * 4.2, 3.6 + float(idx) * 0.8, -14.5 - float(idx) * 2.0)
		var ks := _spawn_unit("kestrel_interceptor", 1, kp, 0.0, 0.72)
		if ks:
			_orbital_drifters.append({"node": ks, "vel": Vector3(2.1, 0.0, 0.0), "tumble": false})

	match phenomenon:
		"spores":
			var spore_mat := Models.mat("orb_spore", Color("#a2ff58"), Color("#78d832"), 1.5, 0.0, 0.4, 0.55)
			for i in 10:
				var sp := Node3D.new()
				sp.position = Vector3(-16.0 + float(i) * 3.4, 1.8 + float(i % 4) * 1.1, -13.0 - float(i % 3) * 2.8)
				Models.sph(sp, 0.42 + float(i % 3) * 0.18, spore_mat, Vector3.ZERO)
				_world_root.add_child(sp)
				_orbital_drifters.append({"node": sp, "vel": Vector3(0.65, 0.02, 0.0), "tumble": true})
		"asteroids":
			var rock_mat := Models.mat("orb_rock", Color("#465868"), Color.BLACK, 1.0, 0.15, 0.85)
			var crys_mat := Models.mat("orb_crys", Color("#54f4ff"), Color("#2ad4f5"), 1.8, 0.1, 0.2)
			for i in 9:
				var ast := Node3D.new()
				ast.position = Vector3(-15.0 + float(i) * 3.6, 1.5 + float(i % 4) * 1.2, -12.5 - float(i % 3) * 2.5)
				Models.box(ast, Vector3(0.65, 0.48, 0.55), rock_mat)
				if i % 2 == 0:
					Models.cone(ast, 0.22, 0.58, crys_mat, Vector3(0.2, 0.3, 0.0), Vector3(25, 0, -18), 5)
				_world_root.add_child(ast)
				_orbital_drifters.append({"node": ast, "vel": Vector3(0.55, 0.0, 0.0), "tumble": true})
		"wreckage":
			var hull_mat := Models.mat("orb_wreck", Color("#4e423a"), Color.BLACK, 1.0, 0.55, 0.55)
			for i in 8:
				var wr := Node3D.new()
				wr.position = Vector3(-14.5 + float(i) * 3.8, 1.6 + float(i % 3) * 1.4, -13.0 - float(i % 2) * 3.0)
				Models.box(wr, Vector3(1.45, 0.24, 0.55), hull_mat)
				Models.box(wr, Vector3(0.28, 0.85, 0.28), hull_mat, Vector3(0.4, 0.2, 0.0))
				_world_root.add_child(wr)
				_orbital_drifters.append({"node": wr, "vel": Vector3(0.48, 0.0, 0.0), "tumble": true})
		"warp":
			var streak_mat := Models.mat("orb_warp", Color("#74dcff"), Color("#48b8ff"), 2.2, 0.0, 0.1)
			for i in 16:
				var st := Node3D.new()
				st.position = Vector3(-18.0 + float(i) * 2.4, 1.0 + float(i % 5) * 1.1, -11.5 - float(i % 3) * 2.2)
				Models.box(st, Vector3(3.8, 0.06, 0.06), streak_mat)
				_world_root.add_child(st)
				_orbital_drifters.append({"node": st, "vel": Vector3(14.5, 0.0, 0.0), "tumble": false})
		_:
			var tr := _spawn_unit("rampart_transport", 1, Vector3(-10.0, 2.6, -15.5), 0.0, 0.78)
			if tr:
				_orbital_drifters.append({"node": tr, "vel": Vector3(1.15, 0.0, 0.0), "tumble": false})

# =============================================================================
# STAGES 2–6: BAY 07 — THE ARMORY (Progressive 3D Unit Floor & Rafter Spawns!)
# =============================================================================
func _build_starfall_armory(snap: Dictionary) -> void:
	_env.background_color = Color("#0b121a")
	_env.fog_light_color = Color("#162330")
	_env.fog_density = 0.015
	_env.ambient_light_color = Color("#8aa4bc")
	_env.ambient_light_energy = 0.68
	_key_light.light_color = Color("#ffe2be")
	_key_light.light_energy = 1.18
	_rim_light.light_color = Color("#42dcff")
	_rim_light.light_energy = 0.68

	_floor_plane("res://assets/terrain/military-paving.webp", Color("#2a343e"), 0.52, 80.0, 14.0)

	var steel := Models.mat("arm_bay_steel", Color("#222b34"), Color.BLACK, 1.0, 0.58, 0.44)
	var hazard := Models.mat("arm_hazard", Color("#d89e32"), Color("#986814"), 0.5, 0.1, 0.6)
	var pad_cyan := Models.mat("arm_pad_cyan", Color("#44ecff"), Color("#1cb8e0"), 1.6, 0.0, 0.25)
	var pad_dim := Models.mat("arm_pad_dim", Color("#34424e"), Color.BLACK, 1.0, 0.2, 0.7)

	# Industrial hangar rear blast doors, side pillars & overhead yellow gantry crane!
	Models.box(_world_root, Vector3(26.0, 8.2, 0.7), steel, Vector3(0.0, 4.1, -12.6))
	for px in [-9.6, -4.8, 4.8, 9.6]:
		Models.box(_world_root, Vector3(0.65, 8.2, 0.85), steel, Vector3(px, 4.1, -11.8))
	Models.box(_world_root, Vector3(22.0, 0.42, 0.62), hazard, Vector3(0.0, 7.2, -9.8))

	# Foreground Catwalk: Armory Upgrade Console + Quartermaster Vane!
	Models.cyl(_world_root, 2.35, 2.65, 0.24, steel, Vector3(0.0, 0.12, 2.4), Vector3.ZERO, 24)
	Models.ring(_world_root, 1.95, 2.15, pad_cyan, Vector3(0.0, 0.26, 2.4))
	Models.box(_world_root, Vector3(1.55, 1.18, 0.85), steel, Vector3(-0.35, 0.78, 2.15))
	Models.box(_world_root, Vector3(1.25, 0.68, 0.10), pad_cyan, Vector3(-0.35, 1.52, 2.08), Vector3(-18, 0, 0))
	var vane := _spawn_unit("engineer_holt", 1, Vector3(1.45, 0.24, 2.25), 2.35, 1.16)
	if vane:
		_bob_nodes.append({"node": vane, "base_y": 0.24, "freq": 1.4, "amp": 0.012, "phase": 0.5})

	# Always-present baseline Rifleman & Field Bunker displays
	_spawn_unit("rifleman", 1, Vector3(-2.8, 0.0, 2.2), 0.55, 1.12)
	_spawn_unit("field_bunker", 1, Vector3(8.6, 0.0, -6.8), -0.65, 0.85)

	# Progressive 3D Unit Floor & Starship Gantry Spawns (Empty Reserved Pads until unlocked!)
	var arm_units: Array = snap.armory_units
	for slot_v in arm_units:
		var slot: Dictionary = slot_v
		var pos: Vector3 = slot.pos
		var unlocked := bool(slot.unlocked)
		var is_air := pos.y > 1.5
		if not is_air:
			Models.cyl(_world_root, 1.25, 1.38, 0.10, steel, Vector3(pos.x, 0.05, pos.z), Vector3.ZERO, 18)
			Models.ring(_world_root, 1.05, 1.18, pad_cyan if unlocked else hazard, Vector3(pos.x, 0.11, pos.z))
		if unlocked:
			var u := _spawn_unit(str(slot.unit_id), 1, pos + (Vector3(0, 0.10, 0) if not is_air else Vector3.ZERO), float(slot.yaw), float(slot.scale))
			if u and is_air:
				_bob_nodes.append({"node": u, "base_y": pos.y, "freq": 1.8, "amp": 0.08, "phase": pos.x})
		elif not is_air:
			Models.box(_world_root, Vector3(0.85, 0.04, 0.18), pad_dim, Vector3(pos.x, 0.12, pos.z))

	# Branching Covert Corner (Front-Left): Cloaking Shade Agent Voss vs Psionic Specter Rig!
	var cov := str(snap.covert_mode)
	if cov == "voss_cloak":
		Models.ring(_world_root, 0.88, 1.02, pad_cyan, Vector3(-5.9, 0.08, -2.2))
		var voss := _spawn_unit("seer_neral", 1, Vector3(-5.9, 0.10, -2.2), 0.65, 1.15)
		if voss:
			_cloak_nodes.append(voss)
	elif cov == "specter_rig":
		var psi_mat := Models.mat("arm_psi", Color("#b868ff"), Color("#9438f5"), 1.9, 0.0, 0.2)
		Models.ring(_world_root, 0.88, 1.02, psi_mat, Vector3(-5.9, 0.08, -2.2))
		_spawn_unit("resonator", 3, Vector3(-5.9, 0.10, -2.2), 0.4, 0.85)

	_cam_goal = Vector3(0.0, 4.55, 10.6)
	_look_goal = Vector3(0.0, 1.75, -2.6)

# =============================================================================
# STAGES 3–6: DECK 04 — THE CANTINA (Trophy Wall, Arcade & Branching Voss!)
# =============================================================================
func _build_starfall_cantina(snap: Dictionary) -> void:
	_env.background_color = Color("#120b12")
	_env.fog_light_color = Color("#241422")
	_env.fog_density = 0.018
	_env.ambient_light_color = Color("#987e96")
	_env.ambient_light_energy = 0.60
	_key_light.light_color = Color("#ffbe82")
	_key_light.light_energy = 1.08
	_rim_light.light_color = Color("#ff4668")
	_rim_light.light_energy = 0.72

	_floor_plane("res://assets/terrain/military-paving.webp", Color("#2b242c"), 0.58, 70.0, 12.0)

	var steel := Models.mat("cant_steel", Color("#232830"), Color.BLACK, 1.0, 0.55, 0.45)
	var neon_red := Models.mat("cant_red", Color("#ff4258"), Color("#e01c38"), 1.9, 0.0, 0.2)
	var neon_cyan := Models.mat("cant_cyan", Color("#46eeff"), Color("#18b8e0"), 1.8, 0.0, 0.2)
	var neon_amber := Models.mat("cant_amber", Color("#ffbe48"), Color("#d88418"), 1.8, 0.0, 0.2)
	var neon_green := Models.mat("cant_green", Color("#54f598"), Color("#22c466"), 1.8, 0.0, 0.2)

	# Back & Starboard Bulkheads + Mezzanine Catwalk with Red Holo-Figure
	Models.box(_world_root, Vector3(22.0, 7.6, 0.6), steel, Vector3(0.0, 3.8, -8.4))
	Models.box(_world_root, Vector3(0.6, 7.6, 16.0), steel, Vector3(9.4, 3.8, -0.5))
	Models.box(_world_root, Vector3(7.5, 0.28, 3.4), steel, Vector3(-5.8, 3.6, -6.2))
	_omni(Vector3(-6.8, 4.8, -6.2), Color("#ff3852"), 1.4, 8.0)

	# Starfall Fighter Arcade Cabinet (Front-Left — Lost Viking counterpart!)
	Models.box(_world_root, Vector3(1.25, 2.35, 1.05), steel, Vector3(-5.15, 1.18, 0.35), Vector3(0, 34, 0))
	Models.box(_world_root, Vector3(0.95, 0.82, 0.12), neon_amber, Vector3(-4.88, 1.68, 0.18), Vector3(-16, 34, 0))
	_omni(Vector3(-4.4, 1.9, 0.8), Color("#ffae42"), 0.95, 5.0)

	# Carried-over Jukebox + Overhead FRN Live News Monitor
	Models.box(_world_root, Vector3(1.45, 2.55, 0.95), steel, Vector3(-2.4, 1.28, -5.8), Vector3(0, 12, 0))
	Models.cyl(_world_root, 0.68, 0.68, 0.92, neon_amber, Vector3(-2.4, 2.55, -5.8), Vector3(90, 12, 0), 18)
	Models.box(_world_root, Vector3(3.35, 1.95, 0.28), steel, Vector3(1.2, 4.55, -4.8), Vector3(14, -12, 0))
	Models.box(_world_root, Vector3(3.0, 1.62, 0.30), neon_cyan, Vector3(1.2, 4.55, -4.78), Vector3(14, -12, 0))

	# Mercenary Contract Holo-Table (Front-Left) + Corporal Rook at Center Table
	Models.cyl(_world_root, 1.35, 1.55, 0.88, steel, Vector3(-3.8, 0.44, 2.1), Vector3.ZERO, 20)
	Models.ring(_world_root, 1.08, 1.25, neon_cyan, Vector3(-3.8, 0.90, 2.1))
	Models.cyl(_world_root, 1.25, 1.42, 0.92, steel, Vector3(0.0, 0.46, 0.8), Vector3.ZERO, 20)
	var rook := _spawn_unit("commander_rook", 1, Vector3(-0.95, 0.0, 0.45), 0.45, 1.22)
	if rook:
		_bob_nodes.append({"node": rook, "base_y": 0.0, "freq": 1.3, "amp": 0.012, "phase": 0.8})

	# Branching Covert Booth (Front-Right): Shade Agent Voss OR Impaled Combat Knife Trophy!
	Models.cyl(_world_root, 1.15, 1.28, 0.88, steel, Vector3(4.2, 0.44, 1.8), Vector3.ZERO, 18)
	Models.ring(_world_root, 0.92, 1.05, neon_cyan, Vector3(4.2, 0.90, 1.8))
	if bool(snap.voss_in_cantina):
		var voss := _spawn_unit("seer_neral", 1, Vector3(5.35, 0.0, 1.55), -2.4, 1.18)
		if voss:
			_bob_nodes.append({"node": voss, "base_y": 0.0, "freq": 1.5, "amp": 0.014, "phase": 2.1})
	elif bool(snap.voss_knife_trophy):
		# Impaled combat knife left upright in the booth table!
		Models.box(_world_root, Vector3(0.06, 0.58, 0.14), neon_red, Vector3(4.2, 1.18, 1.8), Vector3(0, 25, 8))
		Models.box(_world_root, Vector3(0.24, 0.06, 0.16), steel, Vector3(4.2, 1.38, 1.8), Vector3(0, 25, 8))

	# Starboard Bulkhead Trophy Wall (Mounts permanent arc mementos in clear view!)
	Models.box(_world_root, Vector3(4.2, 3.2, 0.22), steel.duplicate(), Vector3(5.35, 3.65, -4.65), Vector3(0, -24, 0))
	_omni(Vector3(4.4, 3.9, -3.5), Color("#ffdca8"), 1.25, 6.5)
	var tr: Dictionary = snap.trophies
	if bool(tr.sanctuary_banner):
		Models.box(_world_root, Vector3(0.92, 1.55, 0.14), neon_green, Vector3(4.25, 3.55, -4.10), Vector3(0, -24, 0))
	if bool(tr.cinder_plaque):
		Models.cyl(_world_root, 0.46, 0.46, 0.14, neon_cyan, Vector3(5.25, 3.45, -4.52), Vector3(90, -24, 0), 8)
	if bool(tr.blackgate_sign):
		Models.box(_world_root, Vector3(1.25, 0.68, 0.14), neon_amber, Vector3(6.25, 3.35, -4.95), Vector3(0, -24, -5))
	if bool(tr.frn_studio_plaque):
		Models.box(_world_root, Vector3(1.55, 0.62, 0.14), neon_red, Vector3(5.35, 4.55, -4.55), Vector3(0, -24, 4))

	_cam_goal = Vector3(0.0, 3.85, 9.8)
	_look_goal = Vector3(0.2, 2.05, -2.2)

# =============================================================================
# STAGES 4–6: LAB 01 — XENOBIOLOGY & RELIC LAB (5-Piece Relic & Memory Crystal!)
# =============================================================================
func _build_starfall_lab(snap: Dictionary) -> void:
	_env.background_color = Color("#06121a")
	_env.fog_light_color = Color("#0d2534")
	_env.fog_density = 0.016
	_env.ambient_light_color = Color("#76b4cc")
	_env.ambient_light_energy = 0.68
	_key_light.light_color = Color("#d8f6ff")
	_key_light.light_energy = 1.12
	_rim_light.light_color = Color("#4cf2b8")
	_rim_light.light_energy = 0.75

	_floor_plane("res://assets/terrain/military-paving.webp", Color("#1e313d"), 0.42, 70.0, 14.0)

	var steel := Models.mat("lab_steel", Color("#20303c"), Color.BLACK, 1.0, 0.58, 0.38)
	var bio_green := Models.mat("lab_green", Color("#76ff68"), Color("#3cd438"), 1.8, 0.0, 0.2)
	var relic_cyan := Models.mat("lab_cyan", Color("#52f4ff"), Color("#24c4f0"), 1.9, 0.0, 0.2)
	var relic_gold := Models.mat("lab_gold", Color("#ffd86b"), Color("#d49c24"), 1.5, 0.65, 0.25)
	var crys_violet := Models.mat("lab_violet", Color("#b278ff"), Color("#823cf5"), 2.0, 0.1, 0.2)
	var glass := Models.mat("lab_glass", Color("#58b4c8"), Color("#3894ac"), 0.2, 0.1, 0.2, 0.18)

	Models.box(_world_root, Vector3(24.0, 7.6, 0.6), steel, Vector3(0.0, 3.8, -8.8))

	# Center Research Console + Dr. Aster (+ Colonist Envoy Dr. Lira during Colonist Arc!)
	Models.box(_world_root, Vector3(2.8, 1.05, 1.15), steel, Vector3(0.0, 0.52, 0.8))
	Models.box(_world_root, Vector3(2.35, 0.68, 0.10), relic_cyan, Vector3(0.0, 1.24, 0.65), Vector3(-20, 0, 0))
	var aster := _spawn_unit("doctor_aster", 1, Vector3(0.95, 0.0, -0.35), -1.8, 1.18)
	if aster:
		_bob_nodes.append({"node": aster, "base_y": 0.0, "freq": 1.5, "amp": 0.012, "phase": 0.3})
	if bool(snap.lira_present):
		var lira := _spawn_unit("triage_specialist", 1, Vector3(-1.15, 0.0, -0.45), -1.2, 1.14)
		if lira:
			_bob_nodes.append({"node": lira, "base_y": 0.0, "freq": 1.7, "amp": 0.012, "phase": 1.9})

	# Left-Center: Evolving Brood Biostasis Cylinder (Stage 1 -> 2 -> 3 Brood Matriarch!)
	var bx := -3.8
	Models.cyl(_world_root, 1.45, 1.65, 0.72, steel, Vector3(bx, 0.36, -1.2), Vector3.ZERO, 24)
	Models.ring(_world_root, 1.22, 1.38, bio_green, Vector3(bx, 0.74, -1.2))
	Models.cyl(_world_root, 1.22, 1.22, 3.2, glass, Vector3(bx, 2.34, -1.2), Vector3.ZERO, 24)
	Models.cyl(_world_root, 1.38, 1.45, 0.38, steel, Vector3(bx, 4.05, -1.2), Vector3.ZERO, 24)
	_omni(Vector3(bx, 2.2, -1.2), Color("#6aff5e"), 1.35, 6.5)

	var b_stage := int(snap.brood_stage)
	var b_unit := "brood_matriarch" if b_stage >= 3 else ("bile_crawler" if b_stage == 2 else "skitterling")
	var b_scl := 0.58 if b_stage >= 3 else (0.78 if b_stage == 2 else 0.92)
	var spec := _spawn_unit(b_unit, 2, Vector3(bx, 1.55, -1.2), 0.4, b_scl)
	if spec:
		_spin_nodes.append({"node": spec, "speed": 0.28})
		_bob_nodes.append({"node": spec, "base_y": 1.55, "freq": 1.4, "amp": 0.08, "phase": 0.0})

	# Right-Center: Progressive 5-Piece Aurelian Relic Containment Field!
	var rx := 4.2
	Models.cyl(_world_root, 1.55, 1.78, 0.72, steel, Vector3(rx, 0.36, -1.2), Vector3.ZERO, 24)
	Models.ring(_world_root, 1.28, 1.46, relic_cyan, Vector3(rx, 0.74, -1.2))
	Models.cyl(_world_root, 1.38, 1.55, 0.38, steel, Vector3(rx, 4.35, -1.2), Vector3.ZERO, 24)

	var pieces := int(snap.relic_pieces)
	var relic_assy := _build_relic_assembly(Vector3(rx, 2.35, -1.2), pieces, relic_cyan, relic_gold)
	if pieces > 0:
		_omni(Vector3(rx, 2.35, -1.2), Color("#52f4ff"), 0.75 + float(pieces) * 0.22, 5.5 + float(pieces) * 0.8)
	if relic_assy:
		_spin_nodes.append({"node": relic_assy, "speed": 0.42 + float(pieces) * 0.08})

	# Far-Left Pedestal: Seer Neral's Memory Crystal (Spawns after Vaultbreaker -> Clickable Prophecy Sub-Map!)
	if bool(snap.neral_crystal):
		var cx := -5.15
		var cz := 1.45
		Models.cyl(_world_root, 0.82, 0.98, 1.05, steel, Vector3(cx, 0.52, cz), Vector3.ZERO, 16)
		Models.ring(_world_root, 0.65, 0.78, crys_violet, Vector3(cx, 1.08, cz))
		var crystal := Node3D.new()
		crystal.position = Vector3(cx, 1.82, cz)
		Models.cone(crystal, 0.36, 0.85, crys_violet, Vector3(0, 0.28, 0), Vector3.ZERO, 6)
		Models.cone(crystal, 0.36, 0.62, relic_cyan, Vector3(0, -0.34, 0), Vector3(180, 0, 0), 6)
		Models.ring(crystal, 0.56, 0.62, crys_violet, Vector3.ZERO, Vector3(32, 0, -18))
		_world_root.add_child(crystal)
		_spin_nodes.append({"node": crystal, "speed": 0.85})
		_bob_nodes.append({"node": crystal, "base_y": 1.82, "freq": 2.1, "amp": 0.07, "phase": 0.6})
		_omni(Vector3(cx, 1.9, cz), Color("#a86cff"), 1.45, 5.5)

	_cam_goal = Vector3(0.0, 3.95, 9.8)
	_look_goal = Vector3(0.0, 1.95, -1.6)

func _build_relic_assembly(at_pos: Vector3, pieces: int, cyan_mat: Material, gold_mat: Material) -> Node3D:
	var root_n := Node3D.new()
	root_n.position = at_pos
	_world_root.add_child(root_n)
	if pieces <= 0:
		return root_n
	# Piece 1: Central floating prismatic shard
	Models.cone(root_n, 0.38, 0.95, cyan_mat, Vector3(0, 0.22, 0), Vector3.ZERO, 5)
	Models.cone(root_n, 0.38, 0.65, cyan_mat, Vector3(0, -0.42, 0), Vector3(180, 0, 0), 5)
	if pieces >= 2:
		# Piece 2: Lower golden containment ring
		Models.ring(root_n, 0.72, 0.86, gold_mat, Vector3(0, -0.35, 0), Vector3(16, 0, 0))
	if pieces >= 3:
		# Piece 3: Upper inverted harmonic crown spire
		Models.cone(root_n, 0.46, 0.88, gold_mat, Vector3(0, 0.92, 0), Vector3.ZERO, 6)
		Models.ring(root_n, 0.64, 0.76, cyan_mat, Vector3(0, 0.55, 0), Vector3(-18, 0, 12))
	if pieces >= 4:
		# Piece 4: Four orbiting lattice blades
		for b_i in 4:
			var a := TAU * float(b_i) / 4.0
			Models.box(root_n, Vector3(0.14, 1.35, 0.28), gold_mat, Vector3(cos(a) * 0.98, 0.1, sin(a) * 0.98), Vector3(0, rad_to_deg(-a), 14))
	if pieces >= 5:
		# Piece 5: Full towering Aurelian Relic outer halo & energy core!
		Models.ring(root_n, 1.18, 1.32, cyan_mat, Vector3(0, 0.12, 0), Vector3(68, 22, 0))
		Models.sph(root_n, 0.30, cyan_mat, Vector3(0, 0.12, 0))
	return root_n

# =============================================================================
# STAGE 7: CINDERFALL FORWARD TRENCH CAMP ("Char Forward Camp" — Act III Finale!)
# =============================================================================
func _build_cinderfall_camp(snap: Dictionary) -> void:
	_env.background_color = Color("#1b0b08")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#3a160e")
	_env.fog_density = 0.017
	_env.ambient_light_color = Color("#b87c68")
	_env.ambient_light_energy = 0.64
	_key_light.light_color = Color("#ff8e48")
	_key_light.light_energy = 1.25
	_key_light.rotation_degrees = Vector3(-34.0, -28.0, 0.0)
	_rim_light.light_color = Color("#4af0ff")
	_rim_light.light_energy = 0.65

	_floor_plane("res://assets/terrain/badlands.webp", Color("#3c2620"), 0.92, 160.0, 18.0)

	var basalt := Models.mat("cf_basalt", Color("#221816"), Color.BLACK, 1.0, 0.15, 0.92)
	var lava_mat := Models.mat("cf_lava", Color("#ff5412"), Color("#ff3800"), 2.2, 0.0, 0.3)
	var steel := Models.mat("cf_steel", Color("#2a3238"), Color.BLACK, 1.0, 0.52, 0.50)
	var tent_olive := Models.mat("cf_tent", Color("#3a463c"), Color.BLACK, 1.0, 0.12, 0.82)
	var holo_cyan := Models.mat("cf_cyan", Color("#4cf2ff"), Color("#1cb8e8"), 1.9, 0.0, 0.2)
	var relic_gold := Models.mat("cf_gold", Color("#ffd86b"), Color("#d49c24"), 1.6, 0.65, 0.25)

	# Glowing rivers of molten magma & volcanic crater cliffs
	Models.box(_world_root, Vector3(38.0, 0.06, 2.8), lava_mat, Vector3(0.0, 0.02, -9.8), Vector3(0, -8, 0))
	Models.box(_world_root, Vector3(3.2, 0.06, 24.0), lava_mat, Vector3(11.8, 0.02, -2.0), Vector3(0, 14, 0))
	for r_spec in [
		[Vector3(24.0, 6.8, 6.0), Vector3(-12.0, 3.0, -18.0), 0.18],
		[Vector3(26.0, 8.2, 7.0), Vector3(11.0, 3.8, -19.5), -0.22],
	]:
		Models.box(_world_root, r_spec[0], basalt, r_spec[1], Vector3(0, rad_to_deg(float(r_spec[2])), 0))

	# MSV Starfall Dreadnought holding orbital defense high in the volcanic sky!
	var starfall := _spawn_unit("dreadnought", 1, Vector3(-4.2, 6.2, -19.5), 0.35, 0.95)
	if starfall:
		_bob_nodes.append({"node": starfall, "base_y": 6.2, "freq": 1.1, "amp": 0.12, "phase": 0.0})

	# 1. CENTER: Command Tent & Briefing Table (Captain Vale + Cybernetic-Arm Marshal Arden!)
	Models.box(_world_root, Vector3(5.6, 0.22, 4.4), steel, Vector3(0.0, 0.11, -1.6))
	Models.box(_world_root, Vector3(5.8, 0.18, 4.6), tent_olive, Vector3(0.0, 3.35, -1.6), Vector3(6, 0, 0))
	for tx in [-2.6, 2.6]:
		for tz in [-3.6, 0.4]:
			Models.cyl(_world_root, 0.08, 0.08, 3.3, steel, Vector3(tx, 1.65, tz))
	Models.cyl(_world_root, 1.35, 1.52, 0.88, steel, Vector3(0.0, 0.55, -1.5), Vector3.ZERO, 20)
	Models.ring(_world_root, 1.08, 1.24, holo_cyan, Vector3(0.0, 1.02, -1.5))
	_omni(Vector3(0.0, 2.1, -1.5), Color("#4cf2ff"), 1.35, 7.5)

	_spawn_unit("captain_vale", 1, Vector3(-1.75, 0.22, -1.35), 0.25, 1.16)
	var arden := _spawn_unit("marshal_arden", 1, Vector3(1.75, 0.22, -1.35), 2.85, 1.18)
	if arden:
		# Cybernetic silver prosthetic arm accent on Marshal Arden!
		Models.box(arden, Vector3(0.24, 0.52, 0.24), Models.mat("arden_cyber", Color("#d8e6f2"), Color("#58d8ff"), 0.5, 0.85, 0.2), Vector3(0.28, 1.05, 0.36))

	# 2. LEFT: Vane's Field Ordnance Depot + Emplaced Howitzers shelling the sky!
	_spawn_unit("field_bunker", 1, Vector3(-9.8, 0.0, -5.2), 0.4, 0.92)
	_spawn_unit("howitzer_emplaced", 1, Vector3(-8.4, 0.0, -6.2), 0.55, 0.98)
	_spawn_unit("atlas_walker", 1, Vector3(-9.2, 0.0, -1.4), 0.48, 0.82)
	Models.box(_world_root, Vector3(1.85, 1.12, 0.95), steel, Vector3(-6.2, 0.56, -2.2), Vector3(0, 26, 0))
	Models.box(_world_root, Vector3(1.42, 0.62, 0.10), holo_cyan, Vector3(-6.05, 1.28, -2.1), Vector3(-18, 26, 0))
	_spawn_unit("engineer_holt", 1, Vector3(-4.8, 0.0, -2.4), 2.3, 1.14)

	# 3. RIGHT: Aster's Mobile Science Tent & Fully Assembled 5-Piece Aurelian Relic Rig!
	Models.cyl(_world_root, 1.65, 1.88, 0.68, steel, Vector3(6.6, 0.34, -2.4), Vector3.ZERO, 22)
	Models.ring(_world_root, 1.35, 1.52, holo_cyan, Vector3(6.6, 0.70, -2.4))
	var full_relic := _build_relic_assembly(Vector3(6.6, 2.25, -2.4), 5, holo_cyan, relic_gold)
	_spin_nodes.append({"node": full_relic, "speed": 0.82})
	_omni(Vector3(6.6, 2.4, -2.4), Color("#52f4ff"), 1.85, 8.5)
	Models.box(_world_root, Vector3(1.75, 1.05, 0.92), steel, Vector3(4.5, 0.52, -1.2), Vector3(0, -28, 0))
	_spawn_unit("doctor_aster", 1, Vector3(4.2, 0.0, -2.6), -1.9, 1.14)

	# 4. FOREGROUND: Rook's Mercenary Drop Beacon & Frontline FRN Field Radio!
	Models.cyl(_world_root, 0.95, 1.12, 0.35, steel, Vector3(-3.2, 0.18, 2.4), Vector3.ZERO, 16)
	Models.ring(_world_root, 0.72, 0.88, Models.mat("cf_green", Color("#54ff9a"), Color("#22c868"), 1.8), Vector3(-3.2, 0.38, 2.4))
	_spawn_unit("commander_rook", 1, Vector3(-1.9, 0.0, 2.2), 2.2, 1.16)
	Models.box(_world_root, Vector3(1.35, 0.95, 0.78), steel, Vector3(2.8, 0.48, 2.4), Vector3(0, -22, 0))

	# Continuously falling volcanic ash particles across the crater!
	var ash_mat := StandardMaterial3D.new()
	ash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ash_mat.albedo_color = Color(0.82, 0.76, 0.72, 0.55)
	ash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	for a_i in 34:
		var flake := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.04
		sm.height = 0.08
		flake.mesh = sm
		flake.material_override = ash_mat
		flake.position = Vector3(-12.0 + float(a_i % 12) * 2.1, float(a_i % 7) * 1.1, -6.0 + float(a_i % 5) * 2.2)
		_world_root.add_child(flake)
		_ash_particles.append(flake)

	_cam_goal = Vector3(0.0, 5.4, 13.8)
	_look_goal = Vector3(0.0, 1.6, -1.8)
