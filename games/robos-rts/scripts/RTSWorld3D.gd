extends Node3D

# RTSWorld3D.gd — angled-perspective renderer for the 64Hz SimEngine world.
# The sim is the source of truth; this node only mirrors it in 3D:
# - textured low ground, sandstone plateaus, wedge ramps, rock cliffs and a rock rim around the map
# - composite models from RTSModels.gd (one silhouette per unit, team color on panels and gems)
# - animated crystal fields and aether vents, shield flashes, tracers, impact bursts, scorch marks

const Models = preload("res://scripts/RTSModels.gd")
const LadderRules = preload("res://scripts/engine/RTSLadderRules.gd")

const CAM_PITCH_DEG := 56.0
const CAM_MIN_H := 28.0
const CAM_MAX_H := 320.0
const GROUND_TOP := 2.2
const MAX_ACTIVE_FX := 192
const DESTRUCTION_SMOKE := Color(0.15, 0.17, 0.19, 0.32)
const FOG_ALPHA := [255, 152, 0]
const CAMPAIGN_PICKUP_KINDS := ["crystal_cache", "aether_cache", "artifact", "brood_sample"]
const WALK_LEGS := [&"LeftLeg", &"RightLeg"]
const AttackMotion = preload("res://scripts/RTSAttackMotion.gd")
const SunbladeMotion = preload("res://scripts/RTSSunbladeMotion.gd")
const SIEGE_RECOIL_KICK := 0.048
const SIEGE_RECOIL_END := 0.22

var camera_3d: Camera3D
var dir_light: DirectionalLight3D
var world_env: WorldEnvironment

var terrain_root: Node3D
var decor_root: Node3D
var resources_root: Node3D
var units_root: Node3D
var fx_root: Node3D

var unit_nodes: Dictionary = {}     # tag -> Node3D
var resource_nodes: Dictionary = {} # tag -> Node3D
var _campaign_pickups: Dictionary = {}
var build_blueprints: Dictionary = {} # position -> Node3D
var _blueprint_material: StandardMaterial3D
var _blueprint_outline: StandardMaterial3D
var active_fx: Array[Dictionary] = []
var _sentry_dart_mesh: CapsuleMesh
var _sentry_plume_mesh: CylinderMesh
var cam_height: float = 50.0
var anim_time: float = 0.0
var sync_ms: float = 0.0
var fog_sync_ms: float = 0.0

var mat_cache: Dictionary = {}
var _last_pos: Dictionary = {}
var _unit_mesh_cache: Dictionary = {}
var _unit_pick_bounds: Dictionary = {}
var _unit_batches: Dictionary = {}
var _crystal_cargo_mesh: BoxMesh
var fog_texture: ImageTexture
var _fog_quad: MeshInstance3D
var _fog_material: ShaderMaterial
var _fog_revision := -1
var _fog_cells := PackedByteArray()
var living_ground_texture: ImageTexture
var living_ground_visible_count := 0
var _living_ground_mesh: MeshInstance3D
var _living_ground_material: ShaderMaterial
var _living_ground_revision := -1
var _living_ground_sight_revision := -1
var _living_ground_cells: Array[Vector2i] = []
var _viewing_player := 1
var _storm_visual_pulse := -1
var _tether_visual_pulse := -1

func _ready() -> void:
	_setup_environment_and_camera()
	if DisplayServer.get_name() != "headless":
		_setup_fog()
		_setup_living_ground()
	for n in ["TerrainRoot", "DecorRoot", "ResourcesRoot", "UnitsRoot", "FXRoot"]:
		var node := Node3D.new()
		node.name = n
		add_child(node)
	terrain_root = get_node("TerrainRoot")
	decor_root = get_node("DecorRoot")
	resources_root = get_node("ResourcesRoot")
	units_root = get_node("UnitsRoot")
	fx_root = get_node("FXRoot")

	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	SimEngine.weapon_attack.connect(_on_weapon_attack)
	SimEngine.unit_phased.connect(_on_unit_phased)
	SimEngine.unit_destroyed.connect(_on_unit_destroyed)
	SimEngine.ability_triggered.connect(_on_visual_ability)
	SimEngine.paused_step.connect(_on_paused_step)
	_rebuild_static_3d_map()

func _setup_fog() -> void:
	_fog_quad = MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(2.0, 2.0)
	_fog_quad.mesh = quad
	_fog_quad.extra_cull_margin = 4096.0
	_fog_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fog_material = ShaderMaterial.new()
	_fog_material.shader = preload("res://scripts/rts_fog.gdshader")
	_fog_material.render_priority = 127
	_fog_quad.material_override = _fog_material
	_fog_quad.hide()
	add_child(_fog_quad)

func _sync_fog(local_player: int) -> void:
	if _fog_quad == null:
		return
	var sight = SimEngine.vision
	if sight == null or local_player == 0:
		_fog_quad.hide()
		fog_texture = null
		_fog_cells.clear()
		_fog_revision = -1
		return
	if _fog_revision == sight.revision and _viewing_player == local_player:
		return
	var cells: PackedByteArray = sight.cells_for(local_player)
	_fog_revision = sight.revision
	if fog_texture != null and fog_texture.get_size() == Vector2(sight.size) and _fog_cells == cells:
		return
	_fog_cells = cells.duplicate()
	var pixels := PackedByteArray()
	pixels.resize(sight.size.x * sight.size.y * 4)
	for index in range(sight.size.x * sight.size.y):
		var state: int = cells[index] if index < cells.size() else 0
		pixels[index * 4 + 3] = FOG_ALPHA[state]
	var mask := Image.create_from_data(sight.size.x, sight.size.y, false, Image.FORMAT_RGBA8, pixels)
	if fog_texture == null or fog_texture.get_size() != Vector2(sight.size):
		fog_texture = ImageTexture.create_from_image(mask)
		_fog_material.set_shader_parameter("sight_mask", fog_texture)
		_fog_material.set_shader_parameter("grid_extent", Vector2(sight.size) * SimEngine.Vision.CELL_SIZE)
	else:
		fog_texture.update(mask)
	_fog_quad.show()

func _setup_living_ground() -> void:
	_living_ground_mesh = MeshInstance3D.new()
	_living_ground_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_living_ground_material = ShaderMaterial.new()
	_living_ground_material.shader = preload("res://scripts/rts_living_ground.gdshader")
	var pattern := _noise_mat("living_ground", Color("#251626"), Color("#704465"), 0.024, 15.0, 4)
	_living_ground_material.set_shader_parameter("ground_pattern", pattern.albedo_texture)
	_living_ground_mesh.material_override = _living_ground_material
	add_child(_living_ground_mesh)

func _sync_living_ground(local_player: int) -> void:
	if _living_ground_mesh == null:
		return
	var ground := SimEngine.living_ground
	var sight_revision: int = SimEngine.vision.revision if SimEngine.vision != null else 0
	if ground.revision == _living_ground_revision and sight_revision == _living_ground_sight_revision and _viewing_player == local_player:
		return
	_living_ground_revision = ground.revision
	_living_ground_sight_revision = sight_revision
	var visible_cells := SimEngine.visible_living_ground_cells(local_player)
	if visible_cells == _living_ground_cells:
		return
	_living_ground_cells = visible_cells
	living_ground_visible_count = visible_cells.size()
	if visible_cells.is_empty():
		_living_ground_mesh.mesh = null
		living_ground_texture = null
		return
	var mask := Image.create(ground.size.x, ground.size.y, false, Image.FORMAT_RGBA8)
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for cell in visible_cells:
		mask.set_pixelv(cell, Color("#9a5a91"))
		var rect := ground.cell_rect(cell)
		var top_right := Vector2(rect.end.x, rect.position.y)
		var bottom_left := Vector2(rect.position.x, rect.end.y)
		for point in [rect.position, top_right, bottom_left, top_right, rect.end, bottom_left]:
			var elevation := SimEngine.get_elevation_at(point.lerp(rect.get_center(), 0.001))
			surface.add_vertex(Vector3(point.x, elevation + 0.18, point.y))
	surface.generate_normals()
	_living_ground_mesh.mesh = surface.commit()
	if living_ground_texture == null:
		living_ground_texture = ImageTexture.create_from_image(mask)
		_living_ground_material.set_shader_parameter("ground_mask", living_ground_texture)
		_living_ground_material.set_shader_parameter("grid_extent", Vector2(ground.size) * SimEngine.LivingGround.CELL_SIZE)
	else:
		living_ground_texture.update(mask)

func _setup_environment_and_camera() -> void:
	world_env = WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#2b241f")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#c9d3e3")
	env.ambient_light_energy = 0.30
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	world_env.environment = env
	add_child(world_env)

	dir_light = DirectionalLight3D.new()
	dir_light.rotation_degrees = Vector3(-52.0, -38.0, 0.0)
	dir_light.light_energy = 0.6
	dir_light.light_color = Color("#fff0d8")
	dir_light.shadow_enabled = true
	dir_light.directional_shadow_max_distance = 190.0
	dir_light.shadow_bias = 0.06
	dir_light.shadow_blur = 1.4
	add_child(dir_light)

	camera_3d = Camera3D.new()
	camera_3d.fov = 42.0
	camera_3d.near = 1.0
	camera_3d.far = 1200.0
	camera_3d.rotation_degrees = Vector3(-CAM_PITCH_DEG, 0.0, 0.0)
	camera_3d.current = true
	add_child(camera_3d)
	set_focus(Vector2(SimEngine.map_width * 0.5, SimEngine.map_height * 0.5), cam_height)

# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------
func _z_offset(h: float) -> float:
	return h / tan(deg_to_rad(CAM_PITCH_DEG))

func get_focus() -> Vector2:
	return Vector2(camera_3d.position.x, camera_3d.position.z - _z_offset(cam_height))

func set_focus(focus: Vector2, height: float = -1.0) -> void:
	if height > 0.0:
		cam_height = clampf(height, CAM_MIN_H, CAM_MAX_H)
	var f := Vector2(
		clampf(focus.x, 12.0, maxf(12.0, SimEngine.map_width - 12.0)),
		clampf(focus.y, 8.0, maxf(8.0, SimEngine.map_height - 8.0))
	)
	var ground := 0.0
	if SimEngine.terrain_grid:
		var bounds := SimEngine.terrain_grid.bounds
		f = f.clamp(bounds.position, bounds.end)
		ground = maxf(SimEngine.get_elevation_at(f), SimEngine.terrain_grid.WATER_SURFACE)
	camera_3d.position = Vector3(f.x, cam_height + ground, f.y + _z_offset(cam_height))

func pan(delta_world: Vector2) -> void:
	set_focus(get_focus() + delta_world)

func zoom_by(step: float) -> void:
	set_focus(get_focus(), cam_height + step)

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
func _get_mat(key: String, albedo: Color, emission: Color = Color.BLACK, metallic: float = 0.2, roughness: float = 0.6) -> StandardMaterial3D:
	if mat_cache.has(key):
		return mat_cache[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = albedo
	m.metallic = metallic
	m.roughness = roughness
	if emission != Color.BLACK:
		m.emission_enabled = true
		m.emission = emission
		m.emission_energy_multiplier = 1.4
	mat_cache[key] = m
	return m

func _noise_mat(key: String, c_dark: Color, c_light: Color, freq: float, tile: float, octaves: int = 5, gain: float = 0.55) -> StandardMaterial3D:
	if mat_cache.has(key):
		return mat_cache[key]
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = freq
	n.fractal_octaves = octaves
	n.fractal_gain = gain
	n.seed = hash(key) & 0xffff
	var g := Gradient.new()
	g.set_color(0, c_dark)
	g.set_color(1, c_light)
	var t := NoiseTexture2D.new()
	t.width = 512
	t.height = 512
	t.seamless = true
	t.noise = n
	t.color_ramp = g
	var m := StandardMaterial3D.new()
	m.albedo_texture = t
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3.ONE / tile
	m.roughness = 0.95
	m.metallic = 0.0
	mat_cache[key] = m
	return m

# ---------------------------------------------------------------------------
# Static terrain
# ---------------------------------------------------------------------------
func _on_scenario_loaded(_name: String) -> void:
	_fog_revision = -1
	_living_ground_revision = -1
	_living_ground_sight_revision = -1
	_living_ground_cells.clear()
	living_ground_visible_count = 0
	living_ground_texture = null
	if _living_ground_mesh != null:
		_living_ground_mesh.mesh = null
	_rebuild_static_3d_map()

func _clear_children(n: Node) -> void:
	for c in n.get_children():
		# Rebuilds may happen twice in one frame. Detach immediately so batching
		# cannot bake a queued-for-deletion map into its replacement.
		n.remove_child(c)
		c.queue_free()

func _terrain_box(size: Vector3, pos: Vector3, m: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.position = pos
	mi.material_override = m
	terrain_root.add_child(mi)
	return mi

func _terrain_polygon(polygon: PackedVector2Array, height: float, material: Material, uv_transform := Transform2D.IDENTITY) -> void:
	var indices = Geometry2D.triangulate_polygon(polygon)
	if indices.is_empty():
		return
	var surface = SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in indices:
		var point = polygon[index]
		surface.set_normal(Vector3.UP)
		surface.set_uv(uv_transform * point)
		surface.add_vertex(Vector3(point.x, height, point.y))
	var mesh = MeshInstance3D.new()
	mesh.mesh = surface.commit()
	mesh.material_override = material
	terrain_root.add_child(mesh)

func _campaign_bridge_uv(deck: PackedVector2Array) -> Transform2D:
	var axis := Vector2.RIGHT
	var longest := 0.0
	for i in deck.size():
		var edge := deck[(i + 1) % deck.size()] - deck[i]
		if edge.length_squared() > longest:
			longest = edge.length_squared()
			axis = edge.normalized()
	var across := axis.orthogonal()
	var left := INF
	var right := -INF
	for point in deck:
		var offset := point.dot(across)
		left = minf(left, offset)
		right = maxf(right, offset)
	var width := maxf(1.0, right - left)
	across /= width
	return Transform2D(Vector2(across.x, axis.x), Vector2(across.y, axis.y),
		Vector2(-left / width, -deck[0].dot(axis)))

func _campaign_texture(path: String) -> Texture2D:
	var art := Image.new()
	# Source launches can run without an editor import. Exports use the packed texture.
	if not FileAccess.file_exists(path):
		var imported := load(path) as Texture2D
		if imported == null:
			return null
		art = imported.get_image()
		if art.has_mipmaps():
			return imported
		if art.is_compressed() and art.decompress() != OK:
			return imported
	elif art.load_webp_from_buffer(FileAccess.get_file_as_bytes(path)) != OK:
		return null
	art.generate_mipmaps()
	return ImageTexture.create_from_image(art)

func _campaign_paving() -> StandardMaterial3D:
	var key := "campaign_paving"
	if mat_cache.has(key):
		return mat_cache[key]
	var material := StandardMaterial3D.new()
	material.albedo_texture = _campaign_texture("res://assets/terrain/military-paving.webp")
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	material.uv1_triplanar = true
	material.uv1_world_triplanar = true
	material.uv1_scale = Vector3(1.0 / 44.0, 1.0 / 39.0, 1.0 / 39.0)
	material.roughness = 0.95
	mat_cache[key] = material
	return material

func _campaign_badlands(assault: bool) -> ShaderMaterial:
	var key := "vesper_badlands" if assault else "frontier_badlands"
	if mat_cache.has(key):
		return mat_cache[key]
	var material := ShaderMaterial.new()
	material.shader = preload("res://scripts/rts_campaign_badlands.gdshader")
	material.set_shader_parameter("sandstone", _campaign_texture("res://assets/terrain/badlands.webp"))
	material.set_shader_parameter("shade", 0.9 if assault else 0.72)
	mat_cache[key] = material
	return material

func _campaign_bridge(paving: Texture2D) -> ShaderMaterial:
	var key := "campaign_bridge"
	if mat_cache.has(key):
		return mat_cache[key]
	var material := ShaderMaterial.new()
	material.shader = preload("res://scripts/rts_campaign_bridge.gdshader")
	material.set_shader_parameter("paving", paving)
	mat_cache[key] = material
	return material

func _subtract_rect(r: Rect2, hole: Rect2) -> Array[Rect2]:
	var out: Array[Rect2] = []
	var inter := r.intersection(hole)
	if inter.size.x <= 0.0 or inter.size.y <= 0.0:
		out.append(r)
		return out
	if inter.position.x > r.position.x:
		out.append(Rect2(r.position.x, r.position.y, inter.position.x - r.position.x, r.size.y))
	if inter.end.x < r.end.x:
		out.append(Rect2(inter.end.x, r.position.y, r.end.x - inter.end.x, r.size.y))
	if inter.position.y > r.position.y:
		out.append(Rect2(inter.position.x, r.position.y, inter.size.x, inter.position.y - r.position.y))
	if inter.end.y < r.end.y:
		out.append(Rect2(inter.position.x, inter.end.y, inter.size.x, r.end.y - inter.end.y))
	return out

func _rebuild_static_3d_map() -> void:
	_clear_children(terrain_root)
	_clear_children(decor_root)
	_clear_children(resources_root)
	_clear_children(units_root)
	_clear_children(fx_root)
	unit_nodes.clear()
	_unit_batches.clear()
	resource_nodes.clear()
	_campaign_pickups.clear()
	build_blueprints.clear()
	active_fx.clear()
	_last_pos.clear()

	var mw := SimEngine.map_width
	var mh := SimEngine.map_height
	var campaign := SimEngine.campaign != null
	var assault := campaign and SimEngine.campaign.mission_index == SimEngine.Campaign.ASSAULT
	var ground_material: Material
	var low: Material
	var high: StandardMaterial3D
	var rock: StandardMaterial3D
	var path: StandardMaterial3D
	var water: StandardMaterial3D
	var shore: StandardMaterial3D
	if campaign:
		ground_material = _campaign_badlands(assault)
		low = ground_material
		rock = _noise_mat("campaign_cliff", Color("#39291f"), Color("#85634d"), 0.047, 14.0, 5, 0.64)
		high = _campaign_paving()
		path = high
		water = _noise_mat("campaign_water", Color("#242e3e"), Color("#364353"), 0.014, 25.0, 3, 0.38)
		water.uv1_scale = Vector3(0.4, 1.0, 1.0) / 25.0
		shore = _noise_mat("campaign_shore", Color("#3a2c25"), Color("#786658"), 0.075, 9.0)
		if assault:
			low = high
		elif SimEngine.campaign.mission_index == SimEngine.Campaign.RECOVERY:
			low = _noise_mat("white_ridge_ground", Color("#5a4430"), Color("#a4845c"), 0.027, 32.0, 5, 0.64)
		elif SimEngine.campaign.mission_index == SimEngine.Campaign.EVACUATION:
			low = _noise_mat("bracken_grass", Color("#35442a"), Color("#798452"), 0.027, 29.0, 5, 0.6)
			rock = _noise_mat("bracken_cliff", Color("#423d35"), Color("#857b63"), 0.046, 13.0)
	else:
		low = _noise_mat("low_ground", Color("#33452a"), Color("#617243"), 0.012, 46.0)
		high = _noise_mat("high_ground", Color("#625640"), Color("#b0a283"), 0.014, 40.0)
		rock = _noise_mat("rock", Color("#3a3029"), Color("#5d4e42"), 0.03, 14.0, 4, 0.6)
		path = _noise_mat("ramp", Color("#7d6b4b"), Color("#a08c64"), 0.02, 24.0)
		water = _noise_mat("river_water", Color("#102c4b"), Color("#39718b"), 0.04, 16.0)
		shore = _noise_mat("river_bank", Color("#34352f"), Color("#8c8772"), 0.08, 10.0)
		if not SimEngine.ground_regions.is_empty():
			ground_material = _noise_mat("campaign_badlands", Color("#261e1d"), Color("#5b3729"), 0.022, 34.0)

	# Low ground
	if SimEngine.ground_regions.is_empty():
		ground_material = low
	else:
		if low is StandardMaterial3D:
			low.cull_mode = BaseMaterial3D.CULL_DISABLED
		for region in SimEngine.ground_regions:
			_terrain_polygon(region, 0.012, low)
	if SimEngine.terrain_grid:
		var road := _noise_mat("bracken_road", Color("#534937"), Color("#84765a"), 0.06, 16.0, 4)
		_build_terrain_grid(ground_material, rock, road, water)
	else:
		_terrain_box(Vector3(mw, 1.0, mh), Vector3(mw * 0.5, -0.5, mh * 0.5), ground_material)
	water.cull_mode = BaseMaterial3D.CULL_DISABLED
	water.roughness = 0.35
	shore.cull_mode = BaseMaterial3D.CULL_DISABLED
	for polygon in SimEngine.water_polygons:
		for bank in Geometry2D.offset_polygon(polygon, 1.1, Geometry2D.JOIN_ROUND):
			_terrain_polygon(bank, 0.025, shore)
		_terrain_polygon(polygon, 0.055, water)
	for bridge in SimEngine.land_bridges:
		_terrain_box(Vector3(bridge.size.x, 0.16, bridge.size.y), Vector3(bridge.get_center().x, 0.08, bridge.get_center().y), path)
	if not SimEngine.bridge_decks.is_empty():
		path.cull_mode = BaseMaterial3D.CULL_DISABLED
		for deck in SimEngine.bridge_decks:
			if campaign:
				_terrain_polygon(deck, 0.085, _campaign_bridge(high.albedo_texture), _campaign_bridge_uv(deck))
			else:
				_terrain_polygon(deck, 0.085, path)
	for rect in SimEngine.merged_terrain_rects("land"):
		_terrain_box(Vector3(rect.size.x, 0.16, rect.size.y), Vector3(rect.get_center().x, 0.08, rect.get_center().y), low)
	_build_brush_cover()
	if not SimEngine.watch_stations.is_empty():
		var platform := _get_mat("watch_platform", Color("#37414d"))
		var transmitter := _get_mat("watch_transmitter", Color("#8eafc1"), Color("#223e4a"))
		for station in SimEngine.watch_stations:
			var pos: Vector2 = station.pos
			var elevation := SimEngine.get_elevation_at(pos)
			_terrain_box(Vector3(3.4, 0.2, 3.4), Vector3(pos.x, elevation + 0.18, pos.y), platform)
			_terrain_box(Vector3(0.42, 3.1, 0.42), Vector3(pos.x - 1.2, elevation + 1.65, pos.y - 1.2), platform)
			_terrain_box(Vector3(1.4, 0.35, 0.65), Vector3(pos.x - 1.2, elevation + 3.18, pos.y - 1.2), transmitter)

	# Rock rim around the map so the camera never sees the void
	var rim := 18.0
	_terrain_box(Vector3(mw + rim * 2.0, 6.0, rim), Vector3(mw * 0.5, 2.0, -rim * 0.5), rock)
	_terrain_box(Vector3(mw + rim * 2.0, 6.0, rim), Vector3(mw * 0.5, 2.0, mh + rim * 0.5), rock)
	_terrain_box(Vector3(rim, 6.0, mh), Vector3(-rim * 0.5, 2.0, mh * 0.5), rock)
	_terrain_box(Vector3(rim, 6.0, mh), Vector3(mw + rim * 0.5, 2.0, mh * 0.5), rock)
	var rim_rng := RandomNumberGenerator.new()
	rim_rng.seed = 991
	for side in range(4):
		var n_b := int((mw if side < 2 else mh) / 2.6)
		for i in range(n_b):
			var along := (float(i) + rim_rng.randf()) / float(n_b) * (mw if side < 2 else mh)
			var depth := rim_rng.randf_range(0.5, 7.0)
			var bp := Vector3.ZERO
			match side:
				0: bp = Vector3(along, 0, -depth)
				1: bp = Vector3(along, 0, mh + depth)
				2: bp = Vector3(-depth, 0, along)
				3: bp = Vector3(mw + depth, 0, along)
			var bs := rim_rng.randf_range(1.8, 3.8)
			var b_mi := MeshInstance3D.new()
			var b_sph := SphereMesh.new()
			b_sph.radius = bs
			b_sph.height = bs * 1.6
			b_sph.radial_segments = 9
			b_sph.rings = 5
			b_mi.mesh = b_sph
			b_mi.material_override = rock
			b_mi.position = Vector3(bp.x, 4.4 + rim_rng.randf() * 0.8, bp.z)
			b_mi.rotation_degrees = Vector3(rim_rng.randf() * 40.0, rim_rng.randf() * 360.0, rim_rng.randf() * 40.0)
			terrain_root.add_child(b_mi)

	# Plateaus: carve the ramp footprints out so the ramp meets the lip cleanly
	for hg in SimEngine.high_ground_zones:
		var pieces: Array[Rect2] = [hg]
		for rmp in SimEngine.ramps:
			var next: Array[Rect2] = []
			for pc in pieces:
				next.append_array(_subtract_rect(pc, rmp))
			pieces = next
		for pc in pieces:
			if pc.size.x < 0.1 or pc.size.y < 0.1:
				continue
			var cx := pc.position.x + pc.size.x * 0.5
			var cz := pc.position.y + pc.size.y * 0.5
			_terrain_box(Vector3(pc.size.x, GROUND_TOP - 0.3, pc.size.y), Vector3(cx, (GROUND_TOP - 0.3) * 0.5, cz), rock)
			_terrain_box(Vector3(pc.size.x, 0.34, pc.size.y), Vector3(cx, GROUND_TOP - 0.17, cz), high)

	# The wedge's high end meets the plateau used by simulation elevation.
	for rmp in SimEngine.ramps:
		var prism := PrismMesh.new()
		prism.size = Vector3(rmp.size.x, GROUND_TOP, rmp.size.y)
		prism.left_to_right = 0.0
		var rmi := MeshInstance3D.new()
		rmi.mesh = prism
		rmi.material_override = path
		rmi.position = Vector3(rmp.position.x + rmp.size.x * 0.5, GROUND_TOP * 0.5, rmp.position.y + rmp.size.y * 0.5)
		if SimEngine.ramp_rises_east(rmp, SimEngine.high_ground_zones):
			rmi.rotation.y = PI
		terrain_root.add_child(rmi)

	# Cliff walls: dark rock core, ragged boulders on top
	var rng := RandomNumberGenerator.new()
	rng.seed = 7731
	for obs in SimEngine.terrain_obstacles:
		if assault:
			_vesper_block(obs)
			continue
		var h := 5.2
		var cx2 := obs.position.x + obs.size.x * 0.5
		var cz2 := obs.position.y + obs.size.y * 0.5
		_terrain_box(Vector3(obs.size.x, h, obs.size.y), Vector3(cx2, h * 0.5, cz2), rock)
		var long_axis_z := obs.size.y >= obs.size.x
		var length := obs.size.y if long_axis_z else obs.size.x
		var count := int(length / 2.2)
		for i in range(count):
			var t := (float(i) + rng.randf()) / float(maxi(1, count))
			var px := cx2 + (rng.randf_range(-0.35, 0.35) * obs.size.x if long_axis_z else (t - 0.5) * length)
			var pz := cz2 + ((t - 0.5) * length if long_axis_z else rng.randf_range(-0.35, 0.35) * obs.size.y)
			var s := rng.randf_range(1.5, 3.0)
			var boulder := MeshInstance3D.new()
			var sph := SphereMesh.new()
			sph.radius = s
			sph.height = s * 1.7
			sph.radial_segments = 9
			sph.rings = 5
			boulder.mesh = sph
			boulder.material_override = rock
			boulder.position = Vector3(px, h - 0.4 + rng.randf() * 0.5, pz)
			boulder.rotation_degrees = Vector3(rng.randf() * 40.0, rng.randf() * 360.0, rng.randf() * 40.0)
			terrain_root.add_child(boulder)

	if SimEngine.campaign != null:
		_campaign_landmark(assault)
	_scatter_decor()
	_batch_static_geometry(decor_root)
	_batch_static_geometry(terrain_root)
	if SimEngine.unlimited_resources:
		# Unlimited crystal fields never shrink or disappear. Bake their facets
		# into the same spatial batches; finite deposits retain independent meshes.
		for tag in SimEngine.resources:
			var resource: Dictionary = SimEngine.resources[tag]
			if resource.resource_type != "crystal_field":
				continue
			_add_resource_node(resource)
		_batch_static_geometry(resources_root)

func _add_resource_node(resource: Dictionary) -> Node3D:
	var node := Models.build_resource(resource.resource_type, resource.tag, resource.rich)
	if resource.resource_type == "crystal_field":
		var shards: Array[AABB] = []
		var cluster := AABB()
		for child in node.get_children():
			if child is MeshInstance3D and child.name.begins_with("Crystal"):
				var bounds: AABB = child.transform * child.get_aabb()
				cluster = cluster.merge(bounds) if not shards.is_empty() else bounds
				shards.append(bounds)
		# Keep these local bounds when the crystal meshes are baked into a batch.
		node.set_meta("crystal_pick_bounds", shards)
		node.set_meta("crystal_center_height", cluster.get_center().y)
	resources_root.add_child(node)
	node.position = Vector3(resource.pos.x, SimEngine.get_elevation_at(resource.pos), resource.pos.y)
	resource_nodes[resource.tag] = node
	return node

func crystal_at_screen(screen: Vector2, player: int) -> int:
	var origin := camera_3d.project_ray_origin(screen)
	var direction := camera_3d.project_ray_normal(screen)
	var best_tag := 0
	var best_depth := INF
	for tag in resource_nodes:
		var node: Node3D = resource_nodes[tag]
		if not node.has_meta("crystal_pick_bounds"):
			continue
		var resource: Dictionary = SimEngine.resources.get(tag, {})
		if resource.is_empty() or not SimEngine.deposit_present(resource) or not SimEngine.can_see_position(player, resource.pos):
			continue
		var transform := node.global_transform
		var local := transform.affine_inverse()
		var local_origin := local * origin
		var local_direction := local.basis * direction
		for bounds: AABB in node.get_meta("crystal_pick_bounds"):
			var hit: Variant = bounds.intersects_ray(local_origin, local_direction)
			if hit is Vector3:
				var depth := origin.distance_squared_to(transform * hit)
				if depth < best_depth:
					best_depth = depth
					best_tag = tag
	return best_tag

func crystal_center_height(tag: int) -> float:
	var node: Node3D = resource_nodes.get(tag)
	return float(node.get_meta("crystal_center_height", 0.0)) * node.scale.y if node else 0.0

func _vesper_block(footprint: Rect2) -> void:
	var center := footprint.get_center()
	var width := footprint.size.x
	var depth := footprint.size.y
	var wall := _get_mat("vesper_wall", Color("#555b68"))
	var steel := _get_mat("vesper_roof", Color("#2a3445"))
	var windows := _get_mat("vesper_windows", Color("#6bced6"), Color("#397883"))
	_terrain_box(Vector3(width, 5.2, depth), Vector3(center.x, 2.6, center.y), wall)
	_terrain_box(Vector3(width + 0.15, 0.32, depth + 0.15), Vector3(center.x, 5.3, center.y), steel)
	_terrain_box(Vector3(width * 0.35, 1.4, depth * 0.44), Vector3(center.x + width * 0.19, 6.12, center.y - depth * 0.1), steel)
	for offset in [-1, 1]:
		_terrain_box(Vector3(width - 1.7, 0.32, 0.14), Vector3(center.x, 3.55, center.y + offset * depth * 0.5), windows)
		_terrain_box(Vector3(0.14, 0.32, depth - 1.7), Vector3(center.x + offset * width * 0.5, 3.55, center.y), windows)

func _campaign_landmark(assault: bool) -> void:
	var steel := _get_mat("campaign_pad", Color("#2c3a48"))
	var lights := _get_mat("campaign_lights", Color("#8ceef1"), Color("#63b6c0"))
	var mission = SimEngine.campaign
	if assault:
		var hq: Vector2 = mission.CHECKPOINTS.back().point
		_terrain_box(Vector3(9, 0.12, 8), Vector3(hq.x, 0.06, hq.y), steel)
		_campaign_road(PackedVector2Array([
			Vector2(121, 114), Vector2(122, 132), Vector2(117, 142), Vector2(95, 141),
			Vector2(60, 140), Vector2(36, 129), Vector2(32, 118), Vector2(41, 104),
			Vector2(55, 95), Vector2(48, 82), Vector2(37, 75), Vector2(34, 69), Vector2(37, 59),
			Vector2(59, 55), Vector2(73, 46), Vector2(83, 34), Vector2(94, 11),
		]), Color("#333730"))
	elif mission.mission_index == mission.RECOVERY:
		var dig: Vector2 = mission.DIG_SITE
		_terrain_box(Vector3(9, 0.12, 7), Vector3(dig.x, 0.06, dig.y), steel)
		for offset in [-3.7, 3.7]:
			_terrain_box(Vector3(0.24, 0.17, 5.6), Vector3(dig.x + offset, 0.14, dig.y), lights)
		_campaign_road(PackedVector2Array([
			Vector2(106, 136), Vector2(114, 116), Vector2(113, 102), Vector2(105, 89),
			Vector2(88, 87), Vector2(70, 81), Vector2(59, 82), Vector2(49, 87),
			Vector2(36, 86), Vector2(34, 72), Vector2(32, 55), Vector2(39, 29),
		]), Color("#6f6250"))
		_campaign_road(PackedVector2Array([
			Vector2(31, 129), Vector2(41, 109), Vector2(42, 98), Vector2(49, 87),
		]), Color("#6f6250"))
	elif mission.mission_index == mission.EVACUATION:
		_bracken_landmarks(steel, lights)
	else:
		var pad: Vector2 = mission.LANDING_ZONE
		var height := SimEngine.get_elevation_at(pad)
		_terrain_box(Vector3(8.0, 0.14, 8.0), Vector3(pad.x, height + 0.07, pad.y), steel)
		for offset in [-3.7, 3.7]:
			_terrain_box(Vector3(0.24, 0.17, 6.9), Vector3(pad.x + offset, height + 0.14, pad.y), lights)
		_terrain_box(Vector3(2.2, 0.17, 0.24), Vector3(pad.x, height + 0.14, pad.y), lights)

func _build_terrain_grid(grass: Material, rock: Material, road: Material, water: Material) -> void:
	var grid := SimEngine.terrain_grid
	var materials := [grass, rock, road, water]
	for start_y in range(0, grid.size.y, 32):
		for start_x in range(0, grid.size.x, 32):
			var chunk := Vector3(start_x, 0.0, start_y)
			var surfaces := {}
			for y in range(start_y, mini(start_y + 32, grid.size.y)):
				for x in range(start_x, mini(start_x + 32, grid.size.x)):
					var a := Vector3(x, grid.vertex_height(x, y), y)
					var b := Vector3(x + 1, grid.vertex_height(x + 1, y), y)
					var c := Vector3(x, grid.vertex_height(x, y + 1), y + 1)
					var d := Vector3(x + 1, grid.vertex_height(x + 1, y + 1), y + 1)
					var surface := 2 if grid.road_at(x, y) else 0
					if grid.cell_at(x, y) == grid.WATER:
						var level := grid.WATER_SURFACE
						_grid_face(surfaces, 3, Vector3(a.x, level, a.z) - chunk, Vector3(b.x, level, b.z) - chunk, Vector3(c.x, level, c.z) - chunk)
						_grid_face(surfaces, 3, Vector3(d.x, level, d.z) - chunk, Vector3(c.x, level, c.z) - chunk, Vector3(b.x, level, b.z) - chunk)
					_grid_face(surfaces, surface, a - chunk, b - chunk, c - chunk)
					_grid_face(surfaces, surface, d - chunk, c - chunk, b - chunk)
			for surface in surfaces:
				var instance := MeshInstance3D.new()
				instance.position = chunk
				instance.mesh = surfaces[surface].commit()
				instance.material_override = materials[surface]
				terrain_root.add_child(instance)

func _grid_face(surfaces: Dictionary, material_index: int, a: Vector3, b: Vector3, c: Vector3) -> void:
	var normal := (c - a).cross(b - a).normalized()
	if normal.y < 0.76:
		material_index = 1
	if not surfaces.has(material_index):
		var surface := SurfaceTool.new()
		surface.begin(Mesh.PRIMITIVE_TRIANGLES)
		surfaces[material_index] = surface
	var tool: SurfaceTool = surfaces[material_index]
	for vertex in [a, b, c]:
		tool.set_normal(normal)
		tool.add_vertex(vertex)

func _bracken_landmarks(steel: Material, lights: Material) -> void:
	var dock := Vector2(105, 35)
	var dock_height := SimEngine.get_elevation_at(dock)
	_terrain_box(Vector3(17.0, 0.16, 13.0), Vector3(dock.x, dock_height + 0.1, dock.y), steel)
	for offset in [-9.0, 9.0]:
		_terrain_box(Vector3(0.20, 0.1, 12.0), Vector3(dock.x + offset, dock_height + 0.22, dock.y), lights)
	for center in [Vector2(109, 38), Vector2(103, 31)]:
		var ship := Models.build("rampart_transport", 1)
		ship.position = Vector3(center.x, dock_height + 1.1, center.y)
		ship.rotation.y = PI
		terrain_root.add_child(ship)
	var soil := _noise_mat("bracken_field", Color("#4f4530"), Color("#7e6b41"), 0.08, 17.0)
	var crops := _get_mat("bracken_crops", Color("#72834f"))
	for field in [Rect2(44, 161, 16, 10), Rect2(51, 131, 10, 11), Rect2(84, 122, 10, 10)]:
		for row in range(1, int(field.size.y), 2):
			for col in range(1, int(field.size.x), 2):
				var point: Vector2 = field.position + Vector2(col, row)
				if SimEngine._is_point_blocked_by_static(point, 0.55):
					continue
				var height := SimEngine.get_elevation_at(point)
				_terrain_box(Vector3(1.8, 0.025, 1.8), Vector3(point.x, height + 0.035, point.y), soil)
				_terrain_box(Vector3(1.5, 0.15, 0.36), Vector3(point.x, height + 0.12, point.y), crops)

func _campaign_road(points: PackedVector2Array, color: Color) -> void:
	var road := _noise_mat("campaign_road_%s" % color.to_html(false), color.darkened(0.22), color.lightened(0.10), 0.065, 16.0, 4, 0.62)
	road.cull_mode = BaseMaterial3D.CULL_DISABLED
	for polygon in Geometry2D.offset_polyline(points, 3.7, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
		_terrain_polygon(polygon, 0.035, road)

func _build_brush_cover() -> void:
	var tiles := SimEngine.terrain_tiles.filter(func(tile): return tile.terrain == "brush")
	if tiles.is_empty():
		return
	var ground := _get_mat("brush_ground", Color("#284937"), Color.BLACK, 0.0, 1.0)
	var blades := CylinderMesh.new()
	blades.top_radius = 0.0
	blades.bottom_radius = 0.62
	blades.height = 1.0
	blades.radial_segments = 3
	blades.rings = 0
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.use_colors = true
	instances.mesh = blades
	instances.instance_count = tiles.size() * 7
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 1.0
	var rng := RandomNumberGenerator.new()
	var index := 0
	for tile in tiles:
		var corner := Vector2(tile.x, tile.y)
		var center := corner + Vector2(2, 2)
		var elevation := SimEngine.get_elevation_at(center)
		_terrain_box(Vector3(4.0, 0.13, 4.0), Vector3(center.x, elevation + 0.065, center.y), ground)
		rng.seed = hash(Vector2i(corner))
		for _tuft in range(7):
			var point := corner + Vector2(rng.randf_range(0.45, 3.55), rng.randf_range(0.45, 3.55))
			var height := rng.randf_range(0.6, 1.7)
			var basis := Basis(Vector3.UP, rng.randf_range(0.0, TAU)).scaled(Vector3(1.0, height, 1.0))
			var origin := Vector3(point.x, SimEngine.get_elevation_at(point) + height * 0.5 + 0.12, point.y)
			instances.set_instance_transform(index, Transform3D(basis, origin))
			instances.set_instance_color(index, Color("#376d47").lerp(Color("#7a9b58"), rng.randf()))
			index += 1
	var cover := MultiMeshInstance3D.new()
	cover.multimesh = instances
	cover.material_override = mat
	cover.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	terrain_root.add_child(cover)

func _batch_static_geometry(root: Node3D, chunked: bool = true) -> void:
	# Merge static surfaces by material in small world chunks. Hundreds of tiny
	# boulders/trees previously submitted separate draws in every shadow pass.
	# Chunks retain frustum culling, unlike a single mesh for the entire 256 map.
	var batches: Dictionary = {}
	var pending: Array[Node] = [root]
	var sources: Array[MeshInstance3D] = []
	while not pending.is_empty():
		var node = pending.pop_back()
		pending.append_array(node.get_children())
		if not node is MeshInstance3D or not node.mesh:
			continue
		var instance: MeshInstance3D = node
		var transform = instance.transform
		var parent = instance.get_parent()
		while parent != root:
			transform = parent.transform * transform
			parent = parent.get_parent()
		var chunk = Vector2i(int(floor(transform.origin.x / 32.0)), int(floor(transform.origin.z / 32.0))) if chunked else Vector2i.ZERO
		for surface in range(instance.mesh.get_surface_count()):
			var material = instance.get_active_material(surface)
			var key = "%s:%s:%s" % [chunk, material.get_instance_id() if material else 0, instance.cast_shadow]
			if not batches.has(key):
				var tool = SurfaceTool.new()
				tool.begin(Mesh.PRIMITIVE_TRIANGLES)
				batches[key] = {"tool": tool, "material": material, "shadow": instance.cast_shadow}
			batches[key].tool.append_from(instance.mesh, surface, transform)
		sources.append(instance)
	for batch in batches.values():
		var instance = MeshInstance3D.new()
		instance.mesh = batch.tool.commit()
		instance.material_override = batch.material
		instance.cast_shadow = batch.shadow
		root.add_child(instance)
	for instance in sources:
		instance.get_parent().remove_child(instance)
		instance.queue_free()

func _scatter_decor() -> void:
	if not SimEngine.decor_enabled:
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = 424242 + int(SimEngine.map_width) * 31 + int(SimEngine.map_height)
	var keep_out: Array[Vector3] = []
	for u in SimEngine.units.values():
		keep_out.append(Vector3(u["pos"].x, u["pos"].y, float(u["radius"]) + 4.5))
	for r in SimEngine.resources.values():
		keep_out.append(Vector3(r["pos"].x, r["pos"].y, float(r["radius"]) + 3.5))

	var pine_trunk := _get_mat("pine_trunk", Color("#4b3626"), Color.BLACK, 0.0, 0.9)
	var pine_a := _get_mat("pine_a", Color("#2f5233"), Color.BLACK, 0.0, 0.85)
	var pine_b := _get_mat("pine_b", Color("#3b6a3f"), Color.BLACK, 0.0, 0.85)
	var rock_m := _get_mat("decor_rock", Color("#6e665c"), Color.BLACK, 0.05, 0.95)
	var rock_d := _get_mat("decor_rock_dark", Color("#4d463f"), Color.BLACK, 0.05, 0.95)
	var shrub := _get_mat("shrub", Color("#46602f"), Color.BLACK, 0.0, 0.9)
	var glow := Models.mat("decor_crystal", Color("#4fd1ff"), Color("#38bdf8"), 1.0, 0.0, 0.2, 0.92)

	var attempts := int(SimEngine.map_width * SimEngine.map_height / 10.0)
	var max_decor := int(SimEngine.map_width * SimEngine.map_height / 75.0)
	var placed := 0
	for _i in range(attempts):
		if placed >= max_decor:
			break
		var p := Vector2(rng.randf_range(2.0, SimEngine.map_width - 2.0), rng.randf_range(2.0, SimEngine.map_height - 2.0))
		if SimEngine.is_water_at(p, 3.0):
			continue
		var on_crossing = false
		for bridge in SimEngine.land_bridges:
			if bridge.grow(1.0).has_point(p):
				on_crossing = true
		if on_crossing:
			continue
		var blocked := false
		for o in keep_out:
			if p.distance_to(Vector2(o.x, o.y)) < o.z:
				blocked = true
				break
		if blocked:
			continue
		for obs in SimEngine.terrain_obstacles:
			if obs.grow(2.4).has_point(p):
				blocked = true
				break
		if blocked:
			continue
		for rmp in SimEngine.ramps:
			if rmp.grow(3.0).has_point(p):
				blocked = true
				break
		if blocked:
			continue
		var elev := SimEngine.get_elevation_at(p)
		var kind := rng.randf()
		var node := Node3D.new()
		node.position = Vector3(p.x, elev, p.y)
		node.rotation_degrees.y = rng.randf() * 360.0
		if elev < 1.0 and kind < 0.4:
			var s := rng.randf_range(0.5, 0.95)
			Models.cyl(node, 0.2 * s, 0.28 * s, 1.2 * s, pine_trunk, Vector3(0, 0.6 * s, 0), Vector3.ZERO, 6)
			Models.cone(node, 1.5 * s, 2.4 * s, pine_a, Vector3(0, 2.0 * s, 0), Vector3.ZERO, 7)
			Models.cone(node, 1.1 * s, 2.0 * s, pine_b, Vector3(0, 3.1 * s, 0), Vector3.ZERO, 7)
		elif kind < 0.78:
			var rs := rng.randf_range(0.6, 1.6)
			Models.sph(node, rs, rock_m if rng.randf() < 0.6 else rock_d, Vector3(0, rs * 0.3, 0), Vector3(1.0, 0.55, 0.8), 8)
			if rng.randf() < 0.5:
				Models.sph(node, rs * 0.55, rock_d, Vector3(rs * 0.9, rs * 0.15, rs * 0.3), Vector3(1.0, 0.6, 0.9), 7)
		elif kind < 0.9:
			var bs := rng.randf_range(0.4, 0.8)
			Models.sph(node, bs, shrub, Vector3(0, bs * 0.45, 0), Vector3(1.2, 0.7, 1.0), 8)
		else:
			for j in range(3):
				var h2 := rng.randf_range(0.9, 2.0)
				Models.cyl(node, 0.0, 0.26, h2, glow, Vector3(rng.randf_range(-0.5, 0.5), h2 * 0.5, rng.randf_range(-0.5, 0.5)), Vector3(rng.randf_range(-12, 12), 0, rng.randf_range(-12, 12)), 5)
		decor_root.add_child(node)
		placed += 1

# ---------------------------------------------------------------------------
# Per-frame sync with the sim
# ---------------------------------------------------------------------------
func sync_campaign_pickups(markers: Array) -> void:
	var visible := {}
	for marker in markers:
		var kind: String = marker.get("pickup", marker.kind)
		var kind_index := CAMPAIGN_PICKUP_KINDS.find(kind)
		if kind_index < 0:
			continue
		var point := Vector2(marker.point[0], marker.point[1])
		var key := Vector3(point.x, kind_index, point.y)
		visible[key] = true
		if not _campaign_pickups.has(key):
			var model := Models.build_brood_sample() if kind == "brood_sample" else Models.instantiate_model("campaign_pickups/" + kind)
			if model == null:
				continue
			model.position = Vector3(point.x, SimEngine.get_elevation_at(point), point.y)
			resources_root.add_child(model)
			_campaign_pickups[key] = model
	for key in _campaign_pickups.keys():
		if not visible.has(key):
			var model: Node3D = _campaign_pickups[key]
			model.hide()
			model.queue_free()
			_campaign_pickups.erase(key)

func sync_3d_entities(selected_tags: Array[int], delta: float, local_player: int = 1) -> void:
	var sync_started = Time.get_ticks_usec()
	_sync_fog(local_player)
	fog_sync_ms = (Time.get_ticks_usec() - sync_started) / 1000.0
	_sync_living_ground(local_player)
	anim_time += delta
	_viewing_player = local_player

	# Resources
	for r_tag in SimEngine.resources.keys():
		var r: Dictionary = SimEngine.resources[r_tag]
		if not SimEngine.deposit_present(r):
			continue
		var rn: Node3D = resource_nodes[r_tag] if resource_nodes.has(r_tag) else _add_resource_node(r)
		rn.position = Vector3(r["pos"].x, SimEngine.get_elevation_at(r["pos"]), r["pos"].y)
		if r["resource_type"] == "crystal_field":
			if not SimEngine.unlimited_resources:
				var frac := clampf(float(r["amount"]) / 1500.0, 0.25, 1.0)
				rn.scale = Vector3(1.0, 0.45 + 0.55 * frac, 1.0)
		else:
			for i in range(3):
				var pl := rn.get_node_or_null("Plume%d" % i)
				if pl:
					pl.position.y = 1.2 + float(i) * 0.9 + sin(anim_time * 1.6 + float(i)) * 0.25
	for r_tag in resource_nodes.keys():
		if not SimEngine.resources.has(r_tag) or not SimEngine.deposit_present(SimEngine.resources[r_tag]):
			resource_nodes[r_tag].queue_free()
			resource_nodes.erase(r_tag)

	# Units and structures
	var own_ring := Models.mat("ring_own", Color("#3fd97a"), Color("#22c55e"), 0.45, 0.0, 0.5)
	var foe_ring := Models.mat("ring_foe", Color("#f0645a"), Color("#ef4444"), 0.45, 0.0, 0.5)
	var human_transforms: Dictionary = {}
	var planned_sites: Dictionary = {}
	for u_tag in SimEngine.units.keys():
		var u: Dictionary = SimEngine.units[u_tag]
		if local_player > 0 and u.owner == local_player and u.is_worker:
			for order in u.orders:
				if order.type == "build" and int(order.structure_tag) == 0:
					var point: Vector2 = order.target_pos
					if not planned_sites.has(point):
						planned_sites[point] = true
						_sync_build_blueprint(u, order)
		if not SimEngine.can_see_unit(local_player, u):
			if unit_nodes.has(u_tag):
				unit_nodes[u_tag].hide()
			_last_pos.erase(u_tag)
			continue
		var u_node: Node3D
		var model_type := _appearance_type(u)
		var model_owner: int = u.get("disguise_owner", u.owner)
		var detail := SimEngine.unit_upgrade_detail(u)
		if (not unit_nodes.has(u_tag) or unit_nodes[u_tag].get_meta("model_type", "") != model_type
				or unit_nodes[u_tag].get_meta("model_owner", 0) != model_owner
				or unit_nodes[u_tag].get_meta("upgrade_detail", "") != detail):
			if unit_nodes.has(u_tag):
				unit_nodes[u_tag].queue_free()
			u_node = _create_unit_node_3d(u)
			units_root.add_child(u_node)
			unit_nodes[u_tag] = u_node
		else:
			u_node = unit_nodes[u_tag]
			if u_node.get_meta("unit_type") != u.unit_type:
				u_node.set_meta("unit_type", u.unit_type)

		# A generous camera margin retains edge shadows while preventing units
		# across the map from participating in every directional shadow pass.
		u_node.visible = _effect_near_view(u["pos"])
		if not u_node.visible:
			_last_pos.erase(u_tag)
			continue

		var elev := SimEngine.unit_visual_elevation(u)
		var silo_depth := 0.0
		if u.has("silo_raise_until"):
			var finish: float = u.silo_raise_until
			var progress := smoothstep(finish - SimEngine.SILO_RAISE_TICKS, finish, float(SimEngine.tick))
			var bounds: AABB = _unit_pick_bounds.get("silo", AABB())
			silo_depth = maxf(0.0, bounds.end.y - 0.25) * (1.0 - progress)
		var travel: float = u.pos.distance_to(_last_pos.get(u_tag, u.pos))
		var moving := travel > 0.004
		_last_pos[u_tag] = u["pos"]

		var bob := 0.0
		var ut := str(u["unit_type"])
		if u.get("crawler_uprooted", false):
			bob = 0.55 + (absf(sin(anim_time * 11.0 + float(u_tag))) * 0.18 if moving else 0.0)
		if u.has("crawler_transition"):
			var transition: Dictionary = u.crawler_transition
			var progress := clampf(inverse_lerp(float(transition.start), float(transition.finish), float(SimEngine.tick)), 0.0, 1.0)
			bob = 0.55 * (1.0 - progress if transition.rooted else progress)
		if moving and not u_node.has_meta("scout_animation") and not u_node.has_meta("robotics_animation") and not u_node.has_meta("leg_pivots") and not u["is_structure"] and ut != "howitzer" and ut != "spire_walker" and ut != "mote" and ut != "lumen_carrier":
			bob = absf(sin(anim_time * 13.0 + float(u_tag))) * 0.09
		u_node.position = Vector3(u["pos"].x, elev + bob - silo_depth, u["pos"].y)
		u_node.rotation.y = -float(u["facing"])
		if u.has("attachment_parent_tag") or u_node.has_node("ProductionDock"):
			_sync_production_dock(u_node, u, local_player)
		if u_node.has_meta("relay_turret"):
			var turret: Node3D = u_node.get_meta("relay_turret")
			u_node.rotation.y = 0.0
			turret.rotation.y = -float(u.facing)
		if ut == "ridge_scout" and u_node.has_meta("scout_animation"):
			var player: AnimationPlayer = u_node.get_meta("scout_animation")
			if moving and absf(elev - float(u_node.get_meta("scout_elevation", elev))) > 1.0:
				player.play("jump", 0.04)
			elif not player.is_playing() or player.current_animation in ["idle", "run"]:
				var clip := "run" if moving else "idle"
				if player.current_animation != clip:
					player.play(clip, 0.09)
			u_node.set_meta("scout_elevation", elev)
		if u_node.has_meta("robotics_animation"):
			var player: AnimationPlayer = u_node.get_meta("robotics_animation")
			var burrow_clip := "burrow" if u.get("burrow_transition", {}).get("down", false) else "surface"
			if u.has("burrow_transition") and player.has_animation(burrow_clip):
				var transition: Dictionary = u.burrow_transition
				if u_node.get_meta("burrow_animation_tick", -1) != transition.start:
					u_node.set_meta("burrow_animation_tick", transition.start)
					var remaining: float = (transition.finish - SimEngine.tick) * SimEngine.TICK_DT
					player.play(burrow_clip, 0.0, player.get_animation(burrow_clip).length / maxf(0.05, remaining))
			elif u.has("archon_warp_finish") and player.has_animation("warp"):
				if player.current_animation != "warp":
					var remaining: float = (u.archon_warp_finish - SimEngine.tick) * SimEngine.TICK_DT
					player.play("warp", 0.0, player.get_animation("warp").length / maxf(0.05, remaining))
			elif not player.is_playing() or player.current_animation in ["idle", "walk", "hover", "warp"]:
				var clip := ("hover" if player.has_animation("hover") else "walk") if moving else "idle"
				if player.has_animation(clip) and player.current_animation != clip:
					player.play(clip, 0.10)
		if u.has("uprising_hit_tick"):
			var recoil := clampf((SimEngine.tick - int(u.uprising_hit_tick)) * SimEngine.TICK_DT / 0.44, 0.0, 1.0)
			var lift := sin(recoil * PI)
			u_node.position.y += lift * 1.1
			u_node.rotation.z = -lift * 0.35
		if ut == "resistance_civilian":
			var arm := u_node.get_node("ThrowArm") as Node3D
			var since_throw := (SimEngine.tick - int(u.get("uprising_throw_tick", -100))) * SimEngine.TICK_DT
			arm.rotation.z = lerpf(1.65, -0.2, smoothstep(0.0, 0.26, since_throw)) if since_throw < 0.45 else (0.19 * sin(anim_time * 16.0 + float(u_tag)) if moving else 0.0)
			arm.get_node("Bottle").visible = since_throw >= 0.48
		if ut == "sporeburst" and u_node.has_meta("sporeburst_roll"):
			var roll: Node3D = u_node.get_meta("sporeburst_roll")
			var rolling: bool = u.get("rolling_spores", false) and moving and not u.get("burrowed", false)
			roll.rotation.z = fposmod(roll.rotation.z - travel / 0.56, TAU) if rolling else lerp_angle(roll.rotation.z, 0.0, 0.22)
			var legs: Array = u_node.get_meta("sporeburst_legs")
			for i in range(legs.size()):
				var leg: Node3D = legs[i]
				var rest: Vector3 = leg.get_meta("scuttle_rest")
				var stride := sin(anim_time * 24.0 + float(i) * PI + float(u_tag))
				leg.rotation = rest + Vector3(0.0, 0.12 * stride, 0.15 * stride) if moving and not rolling else rest
				leg.visible = not rolling
		if u_node.has_meta("siege_shot_time"):
			_sync_siege_recoil(u_node)

		if u["is_structure"]:
			var prog := float(u["build_progress"])
			u_node.scale = Vector3(1.0, clampf(0.2 + 0.8 * prog, 0.2, 1.0), 1.0) if prog < 1.0 else Vector3.ONE
			for i in range(6):
				var sh := u_node.get_node_or_null("Shard%d" % i)
				if sh:
					sh.position.y = 2.6 + float(i % 3) * 0.9 + sin(anim_time * 1.3 + float(i)) * 0.25
					sh.rotation.y = anim_time * 0.6 + float(i)
			var halo := u_node.get_node_or_null("Halo")
			if halo:
				halo.rotation.y = anim_time * 0.8
			if u.has("flight_transition") or u_node.has_node("FlightThrusters"):
				_sync_production_thrusters(u_node, u, elev)
		elif u.has("burrow_transition"):
			var transition: Dictionary = u.burrow_transition
			var progress := clampf(inverse_lerp(float(transition.start), float(transition.finish), float(SimEngine.tick)), 0.0, 1.0)
			var depth := progress if transition.down else 1.0 - progress
			u_node.scale = Vector3(1.0, lerpf(1.0, 0.28, depth), 1.0)
		elif u.has("burrowed") or (SimEngine.ladder_rules and u_node.scale.y < 1.0):
			u_node.scale = Vector3(1.0, 0.28, 1.0) if u.get("burrowed", false) and u.unit_type != "sentinel_mine_armed" else Vector3.ONE
		if u_node.has_node("TransitRing"):
			var transit_ring := u_node.get_node("TransitRing") as MeshInstance3D
			transit_ring.visible = u.has("transit_finish")
			if transit_ring.visible:
				var pulse := 1.0 + 0.08 * sin(anim_time * 7.0)
				transit_ring.scale = Vector3(pulse, 0.4, pulse)
		var model := u_node.get_node_or_null("AttackModel") as Node3D
		var hover := (model if model else u_node).get_node_or_null("Hover")
		if hover:
			hover.position.y = 1.1 + sin(anim_time * 2.4 + float(u_tag)) * 0.12
		if ut == "lumen_carrier":
			var field_active := SimEngine.carrier_power_active(u)
			u_node.get_node("PowerMast").visible = field_active
			if field_active:
				hover.position.y = 0.92
		if u.is_worker:
			var cargo := u_node.get_node("ResourceCargo") as MeshInstance3D
			cargo.visible = u.cargo_amount > 0
			if cargo.visible:
				cargo.material_override = cargo.get_meta(u.cargo_type)

		var sel_ring: MeshInstance3D = u_node.get_node_or_null("SelectionRing")
		if sel_ring:
			sel_ring.position.y = 0.08 + silo_depth
			sel_ring.visible = selected_tags.has(u_tag)
			sel_ring.material_override = own_ring if u["owner"] == local_player else foe_ring

		var shield_sphere: MeshInstance3D = u_node.get_node_or_null("ShieldBubble")
		if shield_sphere:
			var barrier: bool = int(u.get("bastion_barrier_until", 0)) > SimEngine.tick and u.get("bastion_barrier_hp", 0.0) > 0.0
			barrier = barrier or (int(u.get("mutation_barrier_until", 0)) > SimEngine.tick and u.get("mutation_barrier_hp", 0.0) > 0.0)
			shield_sphere.visible = barrier or (u["shields"] > 0.5 and float(u["out_of_combat_timer"]) < 1.4)
		var attack_pose := Transform3D.IDENTITY
		if u_node.has_meta("attack_profile") and not u_node.has_meta("robotics_animation"):
			var profile: Dictionary = u_node.get_meta("attack_profile")
			var age := anim_time - float(u_node.get_meta("attack_time", -100.0))
			if age < float(profile.recover) or u.attack_state == "windup":
				attack_pose = AttackMotion.pose(u, profile, age)
			if model:
				model.transform = attack_pose
			elif u_node.has_meta("siege_gun"):
				var gun := u_node.get_node("SiegeGun") as Node3D
				var rig: Dictionary = u_node.get_meta("siege_gun")
				gun.transform = rig.rest * attack_pose
				attack_pose = Transform3D.IDENTITY
		if u_node.has_meta("sunblade_rig"):
			SunbladeMotion.sync(u_node, u, u_node.get_meta("sunblade_rig"), anim_time)
		var key: String = u_node.get_meta("mesh_batch", "")
		if not key.is_empty():
			if not human_transforms.has(key):
				human_transforms[key] = [[], [], []]
			var poses: Array = human_transforms[key]
			if u_node.has_meta("leg_pivots"):
				_append_walk_pose(poses, u_node, u_tag, travel, delta, attack_pose)
			else:
				poses[0].append(u_node.transform * attack_pose)

	for u_tag in unit_nodes.keys():
		if not SimEngine.units.has(u_tag):
			unit_nodes[u_tag].queue_free()
			unit_nodes.erase(u_tag)
			_last_pos.erase(u_tag)
	for point in build_blueprints.keys():
		if not planned_sites.has(point):
			build_blueprints[point].hide()
			build_blueprints[point].queue_free()
			build_blueprints.erase(point)

	_sync_human_batches(human_transforms)
	_update_canticle_fx()
	_update_neural_tether_fx()
	_update_fx(delta)
	sync_ms = (Time.get_ticks_usec() - sync_started) / 1000.0

func _sync_build_blueprint(worker: Dictionary, order: Dictionary) -> void:
	var point: Vector2 = order.target_pos
	var structure_type: String = order.structure_type
	var existing: Node3D = build_blueprints.get(point)
	if existing != null and is_same(existing.get_meta("build_order"), order):
		return
	if existing != null:
		existing.hide()
		existing.queue_free()
	if _blueprint_material == null:
		_blueprint_material = _fx_mat(Color(0.28, 0.85, 1.0, 0.30))
		_blueprint_material.cull_mode = BaseMaterial3D.CULL_BACK
		_blueprint_outline = _fx_mat(Color(0.55, 0.93, 1.0, 0.83))
	var model := Models.build(structure_type, worker.owner)
	for part in model.find_children("*", "MeshInstance3D", true, false):
		part.material_override = _blueprint_material
		part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var radius: float = RTSData.get_unit_def(structure_type).get("radius", 2.0)
	var edge := radius * 2.0
	for side in [-radius, radius]:
		Models.box(model, Vector3(edge, 0.05, 0.10), _blueprint_outline, Vector3(0, 0.07, side)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		Models.box(model, Vector3(0.10, 0.05, edge), _blueprint_outline, Vector3(side, 0.07, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	model.position = Vector3(point.x, SimEngine.get_elevation_at(point), point.y)
	model.set_meta("structure_type", structure_type)
	model.set_meta("build_order", order)
	model.set_meta("worker_tag", worker.tag)
	_cache_pick_bounds("blueprint:" + structure_type, model)
	units_root.add_child(model)
	build_blueprints[point] = model

func build_blueprint_at_screen(screen: Vector2, blocking_unit: Dictionary) -> Node3D:
	var origin := camera_3d.project_ray_origin(screen)
	var direction := camera_3d.project_ray_normal(screen)
	var nearest := unit_pick_distance(blocking_unit, origin, direction) if not blocking_unit.is_empty() else INF
	var best: Node3D
	for blueprint: Node3D in build_blueprints.values():
		if not blueprint.visible:
			continue
		var bounds: AABB = _unit_pick_bounds.get("blueprint:" + str(blueprint.get_meta("structure_type")), AABB())
		var depth := _model_pick_distance(blueprint, bounds, origin, direction)
		if depth < nearest:
			nearest = depth
			best = blueprint
	return best

func _append_walk_pose(poses: Array, node: Node3D, tag: int, travel: float, delta: float, attack_pose: Transform3D) -> void:
	# Stable per-unit offsets vary breathing and weight shifts across a squad.
	var seed := fposmod(float(tag) * 2.399963, TAU)
	var gait: Vector2 = node.get_meta("gait", Vector2(seed, 0.0))
	var stride := clampf(travel / maxf(0.01, delta * 5.0), 0.0, 1.0)
	gait.y = lerpf(gait.y, stride, 1.0 - exp(-14.0 * delta))
	# Advance by distance so a faster unit takes steps faster. Limit jumps
	# from teleports or a unit becoming visible between frames.
	gait.x = fposmod(gait.x + minf(travel, 0.6) * TAU / 1.85, TAU)
	node.set_meta("gait", gait)
	var idle := 1.0 - gait.y
	var sway := sin(anim_time * (1.2 + float(tag % 7) * 0.11) + seed)
	var breath := sin(anim_time * 2.6 + seed * 1.8)
	var swing := sin(gait.x)
	var lift := cos(gait.x)
	var body_turn := Vector3(0.028 * sway * idle, 0.048 * swing * gait.y + 0.025 * sway * idle, -0.075 * gait.y + 0.016 * breath * idle)
	var body_offset := Vector3(0.0, 0.075 * absf(lift) * gait.y + 0.023 * breath * idle, 0.022 * sway * idle)
	var body := Transform3D(Basis.from_euler(body_turn), body_offset) * attack_pose
	poses[0].append(node.transform * body)
	var pivots: Array = node.get_meta("leg_pivots")
	for leg in range(WALK_LEGS.size()):
		var direction := 1.0 if leg == 0 else -1.0
		var angle := 0.39 * swing * direction * gait.y
		var offset: Vector3 = pivots[leg] + Vector3.UP * (0.13 * maxf(0.0, lift * direction) * gait.y)
		poses[leg + 1].append(node.transform * Transform3D(Basis(Vector3.BACK, angle), offset))
	var cargo := node.get_node_or_null("ResourceCargo") as Node3D
	if cargo:
		cargo.position = body * Vector3(-0.59, 0.96, 0.0)

func _sync_production_dock(node: Node3D, module: Dictionary, local_player: int) -> void:
	var dock := node.get_node_or_null("ProductionDock") as Node3D
	var producer: Dictionary = SimEngine.units.get(module.get("attachment_parent_tag", 0), {})
	if producer.has("flight_transition") or SimEngine.production_attachment(producer, false).get("tag", 0) != module.tag \
			or not SimEngine.can_see_unit(local_player, producer):
		if dock:
			dock.hide()
		return
	var offset: Vector2 = module.pos - producer.pos
	node.rotation.y = -offset.angle()
	if dock == null:
		dock = Models.add_production_dock(node, offset.length(), module.owner)
	dock.show()

func _sync_production_thrusters(node: Node3D, unit: Dictionary, elevation: float) -> void:
	var thrusters := node.get_node_or_null("FlightThrusters") as Node3D
	if thrusters == null:
		thrusters = Node3D.new()
		thrusters.name = "FlightThrusters"
		node.add_child(thrusters)
		var glow := Models.mat("production_thruster", Color("#61bff9"), Color("#38aefa"), 1.4, 0.0, 0.38)
		var spacing: float = unit.radius * 0.47
		for x in [-spacing, spacing]:
			for z in [-spacing, spacing]:
				var jet := Models.cyl(thrusters, 0.25, 0.04, 1.0, glow, Vector3(x, -0.5, z), Vector3.ZERO, 7)
				jet.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	thrusters.visible = unit.flight_height > 0.0 or unit.has("flight_transition")
	if thrusters.visible:
		var clearance := elevation - SimEngine.get_elevation_at(unit.pos)
		var flicker := 0.90 + 0.10 * sin(anim_time * 27.0 + float(unit.tag))
		thrusters.scale.y = clampf(clearance, 0.04, 1.0) * flicker

func _sync_human_batches(transforms: Dictionary) -> void:
	for key in transforms:
		if not _unit_batches.has(key):
			var batches: Array = []
			for part in _unit_mesh_cache[key].parts:
				var instance = MultiMeshInstance3D.new()
				var mesh = MultiMesh.new()
				mesh.transform_format = MultiMesh.TRANSFORM_3D
				mesh.mesh = part.mesh
				instance.multimesh = mesh
				instance.material_override = part.material
				instance.cast_shadow = part.shadow
				units_root.add_child(instance)
				batches.append(instance)
			_unit_batches[key] = batches
	for key in _unit_batches:
		var groups: Array = transforms.get(key, [[], [], []])
		for index in range(_unit_batches[key].size()):
			var instance: MultiMeshInstance3D = _unit_batches[key][index]
			var poses: Array = groups[_unit_mesh_cache[key].parts[index].group]
			var mesh: MultiMesh = instance.multimesh
			if mesh.instance_count < poses.size():
				# Grow geometrically rather than reallocating GPU storage per recruit.
				mesh.instance_count = maxi(16, int(pow(2, ceil(log(float(poses.size())) / log(2.0)))))
			mesh.visible_instance_count = poses.size()
			for i in range(poses.size()):
				mesh.set_instance_transform(i, poses[i])

func _appearance_type(unit: Dictionary) -> String:
	if unit.has("silo_raise_until"):
		return "silo"
	if SimEngine.ladder_rules and unit.unit_type == "colony_hub" and unit.get("hub_operations", false):
		return "operations_hub"
	return unit.get("disguise_type", unit.get("structure_form", unit.unit_type))

func _create_unit_node_3d(u: Dictionary) -> Node3D:
	var rad := float(u["radius"])
	var model_type := _appearance_type(u)
	var model_owner: int = u.get("disguise_owner", u.owner)
	var detail := SimEngine.unit_upgrade_detail(u)
	var cache_key = "%s:%s:%s" % [model_type, model_owner, detail]
	var is_vale: bool = u.id == "captain_vale"
	if is_vale:
		cache_key += ":vale"
	var attack := AttackMotion.profile(u.unit_type)
	var attack_anchors: Array[Vector3] = []
	var root: Node3D
	if u.faction == "humans" and u.unit_type not in ["resistance_civilian", "ridge_scout"] and model_type not in Models.LIVE_ANIMATED_MODELS:
		root = Node3D.new()
		root.set_meta("mesh_batch", cache_key)
		if not _unit_mesh_cache.has(cache_key):
			var model = Models.build(model_type, model_owner, is_vale)
			Models.add_upgrade_detail(model, detail, model_owner)
			_cache_pick_bounds(model_type, model)
			attack_anchors = AttackMotion.anchors(model, attack)
			var parts: Array = []
			var pivots: Array[Vector3] = []
			var siege_gun := _cache_siege_gun(model) if u.unit_type in ["howitzer", "howitzer_emplaced"] else {}
			var legs: Array[Node3D] = []
			for leg_name in WALK_LEGS:
				var leg := model.get_node_or_null(NodePath(leg_name)) as Node3D
				if leg:
					legs.append(leg)
			if legs.size() == WALK_LEGS.size():
				for leg in legs:
					pivots.append(leg.position)
					model.remove_child(leg)
					_cache_unit_mesh_parts(leg, parts, pivots.size())
					leg.free()
			_cache_unit_mesh_parts(model, parts, 0, not pivots.is_empty())
			_unit_mesh_cache[cache_key] = {
				"parts": parts, "pivots": pivots, "siege_gun": siege_gun, "attack_anchors": attack_anchors,
			}
			model.free()
		attack_anchors = _unit_mesh_cache[cache_key].attack_anchors
		if _unit_mesh_cache[cache_key].pivots.size() == WALK_LEGS.size():
			root.set_meta("leg_pivots", _unit_mesh_cache[cache_key].pivots)
		var siege_gun: Dictionary = _unit_mesh_cache[cache_key].siege_gun
		if not siege_gun.is_empty():
			var gun := Node3D.new()
			gun.name = "SiegeGun"
			gun.transform = siege_gun.rest
			root.add_child(gun)
			for part in siege_gun.parts:
				var mesh := MeshInstance3D.new()
				mesh.mesh = part.mesh
				mesh.material_override = part.material
				mesh.cast_shadow = part.shadow
				gun.add_child(mesh)
			root.set_meta("siege_gun", siege_gun)
	else:
		root = Models.build(model_type, model_owner)
		Models.add_upgrade_detail(root, detail, model_owner)
		_cache_pick_bounds(model_type, root)
		if u.unit_type == "aegis_relay" and SimEngine.ladder_rules:
			var turret := root.find_child("Turret", true, false) as Node3D
			var muzzle := root.find_child("Muzzle", true, false) as Node3D
			if turret and muzzle:
				root.set_meta("relay_turret", turret)
				root.set_meta("relay_muzzle", muzzle)
		if u.unit_type == "lumen_carrier":
			_cache_pick_bounds("lumen_carrier_anchored", root, true)
		if not attack.is_empty():
			attack_anchors = AttackMotion.anchors(root, attack)
			var model := root
			root = Node3D.new()
			model.name = "AttackModel"
			if model.has_meta("scout_animation"):
				root.set_meta("scout_animation", model.get_meta("scout_animation"))
			if model.has_meta("robotics_animation"):
				root.set_meta("robotics_animation", model.get_meta("robotics_animation"))
			root.add_child(model)
			if u.unit_type == "sunblade":
				var rig := SunbladeMotion.bind(model)
				if not rig.is_empty():
					root.set_meta("sunblade_rig", rig)
	if not attack.is_empty():
		root.set_meta("attack_profile", attack)
		root.set_meta("attack_anchors", attack_anchors)
	root.set_meta("unit_type", u["unit_type"])
	root.set_meta("model_type", model_type)
	root.set_meta("model_owner", model_owner)
	root.set_meta("upgrade_detail", detail)
	if u.unit_type == "resistance_civilian":
		root.get_node("LeaderDetails").visible = u.get("uprising_leader", false)
	if u.unit_type == "sporeburst":
		var roll := root.find_child("Roll", true, false) as Node3D
		if roll:
			var legs := root.find_children("Leg*", "MeshInstance3D", true, false)
			for leg in legs:
				leg.set_meta("scuttle_rest", leg.rotation)
			root.set_meta("sporeburst_roll", roll)
			root.set_meta("sporeburst_legs", legs)

	if u.is_worker:
		if _crystal_cargo_mesh == null:
			_crystal_cargo_mesh = BoxMesh.new()
			_crystal_cargo_mesh.size = Vector3(0.52, 0.66, 0.50)
		var cargo := MeshInstance3D.new()
		cargo.name = "ResourceCargo"
		cargo.mesh = _crystal_cargo_mesh
		cargo.position = Vector3(-0.59, 0.96, 0.0)
		cargo.rotation = Vector3(0.2, 0.45, 0.4)
		cargo.set_meta("crystal", Models.mat("worker_crystal_cargo", Color("#5eead4"), Color("#0d9488"), 0.9, 0.1, 0.35))
		cargo.set_meta("aether", Models.mat("worker_aether_cargo", Color("#a5f273"), Color("#65a30d"), 0.9, 0.1, 0.35))
		cargo.material_override = cargo.get_meta("crystal")
		cargo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		cargo.hide()
		root.add_child(cargo)

	var sel_mi := MeshInstance3D.new()
	sel_mi.name = "SelectionRing"
	var torus := TorusMesh.new()
	torus.inner_radius = rad + 0.18
	torus.outer_radius = rad + 0.5
	torus.rings = 32
	torus.ring_segments = 4
	sel_mi.mesh = torus
	sel_mi.scale = Vector3(1.0, 0.25, 1.0)
	sel_mi.position = Vector3(0.0, 0.08, 0.0)
	sel_mi.visible = false
	sel_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(sel_mi)
	if u.has("transit_finish"):
		var violet := Models.mat("transit_projection", Color("#d5bdff"), Color("#a080f5"), 1.8, 0.0, 0.45)
		var transit_ring := Models.ring(root, rad + 0.60, rad + 0.81, violet, Vector3(0.0, 0.09, 0.0))
		transit_ring.name = "TransitRing"
		transit_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var mutation_barrier: bool = u.owner == 2 and not u.is_structure and SimEngine.campaign != null \
		and SimEngine.campaign.mutators != null and SimEngine.campaign.mutators.has("barrier")
	if u["max_shields"] > 0.0 or mutation_barrier:
		var sh_mi := MeshInstance3D.new()
		sh_mi.name = "ShieldBubble"
		var ssph := SphereMesh.new()
		ssph.radius = rad * 1.2
		ssph.height = rad * (2.4 if not u["is_structure"] else 2.0)
		sh_mi.mesh = ssph
		sh_mi.position = Vector3(0.0, rad * (1.1 if not u["is_structure"] else 0.6), 0.0)
		sh_mi.material_override = Models.mat("shield_bubble", Color("#7dd3fc"), Color("#38bdf8"), 0.9, 0.0, 0.2, 0.2)
		sh_mi.visible = false
		sh_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(sh_mi)
	return root

func _cache_siege_gun(model: Node3D) -> Dictionary:
	var gun := model.get_node_or_null("Turret/Gun") as Node3D
	if gun == null:
		return {}
	var muzzle := gun.get_node_or_null("Muzzle") as Node3D
	if muzzle == null:
		return {}
	var turret := gun.get_parent() as Node3D
	var rest := turret.transform * gun.transform
	var muzzle_pos := muzzle.position
	var parts: Array = []
	# The hull and turret housing stay in the human MultiMeshes.
	turret.remove_child(gun)
	_cache_unit_mesh_parts(gun, parts, 0)
	gun.free()
	return {"rest": rest, "muzzle": muzzle_pos, "parts": parts}

func _sync_siege_recoil(unit: Node3D) -> void:
	var gun := unit.get_node("SiegeGun") as Node3D
	var rig: Dictionary = unit.get_meta("siege_gun")
	var elapsed := anim_time - float(unit.get_meta("siege_shot_time"))
	var pose: Transform3D = rig.rest
	if elapsed >= SIEGE_RECOIL_END:
		unit.remove_meta("siege_shot_time")
	else:
		var kick := smoothstep(0.0, SIEGE_RECOIL_KICK, elapsed)
		var return_progress := smoothstep(0.065, SIEGE_RECOIL_END, elapsed)
		var recoil := kick * (1.0 - return_progress)
		# The breech contacts the turret housing at 0.38 units of travel.
		pose.origin -= pose.basis.x.normalized() * (0.32 * recoil)
		pose.basis = pose.basis.rotated(Vector3.BACK, 0.045 * recoil)
	gun.transform = pose

func _cache_unit_mesh_parts(model: Node3D, parts: Array, group: int, animated_body: bool = true) -> void:
	_batch_static_geometry(model, false)
	# A rigid limb shares one instance transform across all its materials.
	var combined: ArrayMesh = ArrayMesh.new() if animated_body else null
	for child in model.get_children():
		if not child is MeshInstance3D:
			continue
		if combined and child.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_ON:
			combined.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, child.mesh.surface_get_arrays(0))
			combined.surface_set_material(combined.get_surface_count() - 1, child.material_override)
		else:
			parts.append({"mesh": child.mesh, "material": child.material_override, "shadow": child.cast_shadow, "group": group})
	if combined and combined.get_surface_count() > 0:
		parts.append({"mesh": combined, "material": null, "shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_ON, "group": group})

func _cache_pick_bounds(unit_type: String, model: Node3D, include_hidden: bool = false) -> void:
	if _unit_pick_bounds.has(unit_type):
		return
	var bounds := AABB()
	for child in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := child as MeshInstance3D
		var local := mesh.transform
		var parent := mesh.get_parent() as Node3D
		var visible_part := mesh.visible
		while parent != model:
			visible_part = visible_part and parent.visible
			local = parent.transform * local
			parent = parent.get_parent() as Node3D
		if not visible_part and not include_hidden:
			continue
		var part := local * mesh.get_aabb()
		bounds = bounds.merge(part) if bounds.has_volume() else part
	_unit_pick_bounds[unit_type] = bounds

func unit_pick_distance(unit: Dictionary, ray_origin: Vector3, ray_direction: Vector3) -> float:
	var node: Node3D = unit_nodes.get(unit.tag)
	var body_type: String = "lumen_carrier_anchored" if unit.unit_type == "lumen_carrier" and unit.is_immobile else _appearance_type(unit)
	var bounds: AABB = _unit_pick_bounds.get(body_type, AABB())
	if node == null or not node.visible or node.get_meta("unit_type") != unit.unit_type:
		return INF
	# Use the body transform without the selection ring, shields, or other effects.
	return _model_pick_distance(node, bounds, ray_origin, ray_direction)

func _model_pick_distance(node: Node3D, bounds: AABB, ray_origin: Vector3, ray_direction: Vector3) -> float:
	if not bounds.has_volume():
		return INF
	var local := node.global_transform.affine_inverse()
	var hit: Variant = bounds.intersects_ray(local * ray_origin, local.basis * ray_direction)
	return ray_origin.distance_squared_to(node.global_transform * hit) if hit is Vector3 else INF

# ---------------------------------------------------------------------------
# Effects
# ---------------------------------------------------------------------------
func _fx_mat(col: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = col
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m

func _spawn_burst(
	pos: Vector3, col: Color, radius: float, ttl: float,
	grow: float = 2.6, drift: Vector3 = Vector3.ZERO, additive: bool = false
) -> void:
	if active_fx.size() >= MAX_ACTIVE_FX:
		return
	var mi := MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = radius
	s.height = radius * 2.0
	s.radial_segments = 10
	s.rings = 5
	mi.mesh = s
	var m := _fx_mat(col)
	if additive:
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mi.material_override = m
	mi.position = pos
	fx_root.add_child(mi)
	# While paused (scripted captures) the effect is held still, so begin it part-way through.
	var start_ttl := ttl * (0.55 if SimEngine.paused else 1.0)
	active_fx.append({"node": mi, "mat": m, "ttl": start_ttl, "max": ttl, "kind": "burst", "col": col, "grow": grow, "origin": pos, "drift": drift})

func _spawn_scorch(pos: Vector3, radius: float) -> void:
	if active_fx.size() >= MAX_ACTIVE_FX:
		return
	var mi := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = radius
	c.bottom_radius = radius
	c.height = 0.03
	c.radial_segments = 14
	mi.mesh = c
	var col := Color(0.05, 0.04, 0.03, 0.55)
	var m := _fx_mat(col)
	mi.material_override = m
	mi.position = pos + Vector3(0, 0.05, 0)
	fx_root.add_child(mi)
	active_fx.append({"node": mi, "mat": m, "ttl": 16.0, "max": 16.0, "kind": "scorch", "col": col, "grow": 0.0})

# While the sim is paused (scripted captures) transient effects hold still, so a frame taken after a
# small step shows them; every further paused step clears the previous ones. Scorch marks always fade in real time.
func _skip_transient_fx() -> bool:
	return SimEngine.paused and SimEngine.last_step_count > 6

func _on_paused_step() -> void:
	for i in range(active_fx.size() - 1, -1, -1):
		if active_fx[i]["kind"] != "scorch":
			if is_instance_valid(active_fx[i]["node"]):
				active_fx[i]["node"].queue_free()
			active_fx.remove_at(i)

func _update_fx(delta: float) -> void:
	for i in range(active_fx.size() - 1, -1, -1):
		var fx: Dictionary = active_fx[i]
		if fx.kind == "sentry_missile":
			if not _update_sentry_missile(fx, delta):
				active_fx.remove_at(i)
			continue
		if not (SimEngine.paused and fx["kind"] != "scorch"):
			fx["ttl"] -= delta
		if fx["ttl"] <= 0.0 or not is_instance_valid(fx["node"]):
			if is_instance_valid(fx["node"]):
				fx["node"].queue_free()
			active_fx.remove_at(i)
			if fx.kind == "projectile" and fx.ttl <= 0.0 and float(fx.impact) > 0.0:
				_spawn_burst(fx.end, fx.col, fx.impact, 0.17, 2.0)
			continue
		var t: float = 1.0 - float(fx["ttl"]) / float(fx["max"])
		var col: Color = fx["col"]
		match str(fx["kind"]):
			"burst":
				fx["mat"].albedo_color = Color(col.r, col.g, col.b, (1.0 - t) * col.a)
				fx["node"].scale = Vector3.ONE * lerpf(0.5, float(fx["grow"]), t)
				if fx["drift"] != Vector3.ZERO:
					fx["node"].position = fx["origin"] + fx["drift"] * t
			"scorch":
				fx["mat"].albedo_color = Color(col.r, col.g, col.b, col.a * clampf((1.0 - t) * 2.0, 0.0, 1.0))
			"beam":
				fx["mat"].albedo_color = Color(col.r, col.g, col.b, 1.0 - t)
			"spine":
				var rise := sin(clampf((t - float(fx.delay)) / (1.0 - float(fx.delay)), 0.0, 1.0) * PI)
				fx.node.scale.y = maxf(0.01, rise)
				fx.node.position.y = float(fx.ground) + rise * 0.95
			"projectile":
				var start: Vector3 = fx.start
				var end: Vector3 = fx.end
				fx.node.position = start.lerp(end, t) + Vector3.UP * (float(fx.arc) * 4.0 * t * (1.0 - t))
			"tumble":
				fx.node.position = fx.origin + fx.drift * t + Vector3.UP * (sin(t * PI) * 2.4)
				fx.node.rotation.z = -1.65 * t

func _weapon_color(owner_id: int, is_splash: bool) -> Color:
	if is_splash:
		return Color("#ffa534") if owner_id != 2 else Color("#b7f23a")
	match owner_id:
		1: return Color("#bfe0ff")
		2: return Color("#a3e635")
		_: return Color("#ffe27a")

func _on_weapon_attack(attacker: Dictionary, target: Dictionary, weapon: Dictionary, _hit_shields: bool) -> void:
	if not SimEngine.can_see_unit(_viewing_player, attacker):
		return
	var from_pos: Vector2 = attacker.pos
	var to_pos: Vector2 = target.pos
	var is_splash := float(weapon.get("splash_radius", 0.0)) > 0.0
	if _skip_transient_fx() or (not _effect_near_view(from_pos) and not _effect_near_view(to_pos)):
		return
	if weapon.has("sentry_flight_ticks"):
		_render_sentry_volley(attacker, target, weapon)
		return
	if attacker.unit_type == "ridge_scout":
		_play_scout_animation(attacker.tag, "fire")
	elif attacker.unit_type == "spine_ambusher":
		_play_robotics_clip(attacker.tag, "attack")
		_render_spine_line(attacker, target)
		return
	elif attacker.unit_type in ["bastion_walker", "mirage_adept", "storm_scribe", "duskblade", "lattice_archon",
			"rupture_crawler", "carapace_bulwark", "corrosion_flyer", "brood_siege_flyer", "locust_landed",
			"dawn_interceptor", "prism_ray", "horizon_lancer", "pursuit_fighter", "shade_agent", "sunseer"]:
		_play_robotics_clip(attacker.tag, "attack")
	if attacker.unit_type == "aegis_relay" and SimEngine.ladder_rules:
		_render_relay_fire(attacker, target)
		return
	var p1 := Vector3(from_pos.x, SimEngine.unit_visual_elevation(attacker) + 1.3, from_pos.y)
	var siege_shot: bool = attacker.unit_type == "howitzer_emplaced"
	var profile := AttackMotion.profile(attacker.unit_type)
	if siege_shot:
		p1 = _fire_siege_gun(attacker)
	elif not profile.is_empty():
		_render_profiled_attack(attacker, target, profile, is_splash)
		return
	if not SimEngine.can_see_unit(_viewing_player, target) or active_fx.size() >= MAX_ACTIVE_FX:
		return
	var p2 := Vector3(to_pos.x, SimEngine.unit_visual_elevation(target) + 1.0, to_pos.y)
	if attacker.unit_type in ["torchguard", "cinder_runner", "cinder_guard", "sentinel_mine_armed", "vortex_rover", "atlas_walker", "atlas_walker_precision"]:
		_render_workshop_attack(attacker, weapon, p1, p2)
		return
	if attacker.unit_type in ["night_harrier", "sky_sentry", "sky_sentry_defender", "dreadnought", "bastion_turret", "fortified_hub"]:
		_render_meridian_air_attack(attacker, p1, p2)
		return
	if attacker.unit_type == "shade_agent":
		var muzzle := _shade_muzzle(attacker)
		_spawn_weapon_streak(muzzle, p2, Color("#efbb80"), 0.09, 0.12)
		_spawn_burst(muzzle, Color("#ffc278"), 0.28, 0.10, 1.9)
		return
	if attacker.unit_type in ["dawn_interceptor", "prism_ray", "horizon_lancer", "sunseer"]:
		var hull := unit_nodes.get(attacker.tag) as Node3D
		var emitters := ["LeftEmitter", "RightEmitter"] if attacker.unit_type == "dawn_interceptor" else ["BeamOrigin"]
		var tint := Color("#d7f1ff")
		if attacker.unit_type == "sunseer":
			tint = Color("#7beacc")
		if int(attacker.get("alignment_until", 0)) > SimEngine.tick:
			tint = Color("#f8d880")
		for emitter in emitters:
			var anchor := hull.find_child(emitter, true, false) as Node3D if hull else null
			var origin := anchor.global_position if anchor else p1
			_spawn_weapon_streak(origin, p2, tint, 0.32 if attacker.unit_type == "prism_ray" else 0.13, 0.19)
		_spawn_burst(p2, tint, 0.42, 0.18, 1.45)
		return
	if attacker.unit_type in ["corrosion_flyer", "brood_siege_flyer"]:
		var flight := 0.22 if attacker.unit_type == "corrosion_flyer" else 0.36
		var anchors := ["Muzzle"] if attacker.unit_type == "corrosion_flyer" else ["LeftLauncher", "RightLauncher"]
		var model := unit_nodes.get(attacker.tag) as Node3D
		for anchor_name in anchors:
			var anchor := model.find_child(anchor_name, true, false) as Node3D if model else null
			var origin := anchor.global_position if anchor else p1
			_spawn_attack_projectile(origin, p2, Color("#d3e17d"), flight, "lob", 0.0, 0.6)
		_spawn_burst(p2, Color("#d3e17d"), 0.65, 0.24, 1.7)
		return
	var dist := p1.distance_to(p2)
	if dist < 0.2:
		return
	var col := Color("#ffc074") if siege_shot else _weapon_color(attacker.owner, is_splash)
	var width := float(weapon.get("beam_width", 0.22 if is_splash else 0.12))
	_spawn_weapon_streak(p1, p2, col, width * (0.6 if siege_shot else 1.0), 0.075 if siege_shot else 0.16)
	if not siege_shot:
		_spawn_burst(p1, Color(col.r, col.g, col.b, 0.9), 0.35, 0.1, 1.6)
	_spawn_burst(p2, Color(col.r, col.g, col.b, 0.8), 1.4 if is_splash else 0.45, 0.22, 2.4 if is_splash else 1.8)

func _render_spine_line(attacker: Dictionary, target: Dictionary) -> void:
	var origin: Vector2 = attacker.pos
	var direction := origin.direction_to(target.pos)
	var reach := SimEngine.weapon_range_against(attacker, target) + float(attacker.radius)
	var material := _fx_mat(Color("#cf824e"))
	for distance in range(2, ceili(reach), 2):
		if active_fx.size() >= MAX_ACTIVE_FX:
			break
		var point := origin + direction * float(distance)
		if not SimEngine.can_see_position(_viewing_player, point):
			continue
		var spike := MeshInstance3D.new()
		var cone := CylinderMesh.new()
		cone.top_radius = 0.0
		cone.bottom_radius = 0.42
		cone.height = 1.9
		cone.radial_segments = 5
		spike.mesh = cone
		spike.material_override = material
		var ground := SimEngine.get_elevation_at(point)
		spike.position = Vector3(point.x, ground, point.y)
		spike.scale.y = 0.01
		fx_root.add_child(spike)
		active_fx.append({"node": spike, "kind": "spine", "ttl": 0.45, "max": 0.45, "ground": ground,
			"delay": float(distance) / reach * 0.42, "col": Color.WHITE})

func _render_sentry_volley(turret: Dictionary, target: Dictionary, weapon: Dictionary) -> void:
	if not SimEngine.can_see_unit(_viewing_player, target):
		return
	if _sentry_dart_mesh == null:
		_sentry_dart_mesh = CapsuleMesh.new()
		_sentry_dart_mesh.radius = 0.14
		_sentry_dart_mesh.height = 0.85
		_sentry_dart_mesh.radial_segments = 8
		_sentry_dart_mesh.rings = 3
		_sentry_plume_mesh = CylinderMesh.new()
		_sentry_plume_mesh.top_radius = 0.015
		_sentry_plume_mesh.bottom_radius = 0.12
		_sentry_plume_mesh.height = 1.75
		_sentry_plume_mesh.radial_segments = 6
	var origin := Vector3(turret.pos.x, SimEngine.unit_visual_elevation(turret), turret.pos.y)
	var heading := Basis(Vector3.UP, -float(turret.facing))
	for index in range(int(weapon.sentry_volley_size)):
		if active_fx.size() >= MAX_ACTIVE_FX:
			break
		var side := -1.0 if (int(weapon.sentry_first_tube) + index) % 2 == 0 else 1.0
		var muzzle := Models.SENTRY_MUZZLE
		muzzle.z *= side
		var start := origin + heading * muzzle
		var shot := Node3D.new()
		shot.position = start
		shot.visible = false
		fx_root.add_child(shot)
		var body := MeshInstance3D.new()
		body.mesh = _sentry_dart_mesh
		body.rotation.x = PI * 0.5
		body.material_override = Models.mat("sentry_dart", Color("#fff2ca"), Color("#ffb962"), 1.0)
		body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		shot.add_child(body)
		var trail := MeshInstance3D.new()
		trail.mesh = _sentry_plume_mesh
		trail.rotation.x = PI * 0.5
		trail.position.z = 1.04
		trail.material_override = Models.mat("sentry_exhaust", Color("#ffc574"), Color("#ff8f42"), 1.15, 0.0, 0.8, 0.65)
		trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		shot.add_child(trail)
		var launches := SimEngine.tick + index
		active_fx.append({"kind": "sentry_missile", "node": shot, "start": start, "end": _sentry_impact_point(target),
			"curve": Vector3.UP * 1.9 + heading * Vector3(0, 0, side * 0.9), "target": target.tag,
			"launches": launches, "ticks": int(weapon.sentry_flight_ticks), "last_tick": SimEngine.tick, "fraction": 0.0})

func _sentry_impact_point(target: Dictionary) -> Vector3:
	return Vector3(target.pos.x, SimEngine.unit_visual_elevation(target) + minf(1.1, target.radius), target.pos.y)

func _update_sentry_missile(fx: Dictionary, delta: float) -> bool:
	var shot: Node3D = fx.node
	if not is_instance_valid(shot):
		return false
	var elapsed_ticks: int = SimEngine.tick - int(fx.launches)
	if elapsed_ticks >= int(fx.ticks):
		shot.queue_free()
		return false
	if elapsed_ticks < 0:
		return true
	if int(fx.last_tick) != SimEngine.tick:
		fx.last_tick = SimEngine.tick
		fx.fraction = 0.0
	elif not SimEngine.paused:
		fx.fraction = minf(float(fx.fraction) + delta * SimEngine.TICK_RATE * SimEngine.sim_speed, 1.0)
	var target: Dictionary = SimEngine.units.get(fx.target, {})
	if not target.is_empty() and SimEngine.can_see_unit(_viewing_player, target):
		fx.end = _sentry_impact_point(target)
	var t := pow((elapsed_ticks + float(fx.fraction)) / float(fx.ticks), 1.30)
	var start: Vector3 = fx.start
	var finish: Vector3 = fx.end
	var curve: Vector3 = fx.curve
	var position := start.lerp(finish, t) + curve * (4.0 * t * (1.0 - t))
	var tangent := (finish - start) + curve * (4.0 - 8.0 * t)
	if not shot.visible:
		_spawn_burst(start, Color("#ffd897"), 0.24, 0.10, 2.0)
	shot.visible = true
	if tangent.length_squared() > 0.01:
		var up := Vector3.RIGHT if absf(tangent.normalized().y) > 0.98 else Vector3.UP
		shot.look_at_from_position(position, position + tangent, up)
	else:
		shot.global_position = position
	return true

func _render_relay_fire(relay: Dictionary, target: Dictionary) -> void:
	var start := Vector3(relay.pos.x, SimEngine.unit_visual_elevation(relay) + 2.26, relay.pos.y)
	var node := unit_nodes.get(relay.tag) as Node3D
	if node and node.has_meta("relay_muzzle"):
		var turret: Node3D = node.get_meta("relay_turret")
		var muzzle: Node3D = node.get_meta("relay_muzzle")
		turret.rotation.y = -float(relay.facing)
		start = muzzle.global_position
	var color := Color("#9ee9ff")
	_spawn_burst(start, color, 0.48, 0.095, 1.7, Vector3.ZERO, true)
	if SimEngine.can_see_unit(_viewing_player, target):
		var end := Vector3(target.pos.x, SimEngine.unit_visual_elevation(target) + 0.8, target.pos.y)
		_spawn_attack_projectile(start, end, color, 0.24, "missile", 0.35)

func _spawn_weapon_streak(p1: Vector3, p2: Vector3, col: Color, width: float, duration: float) -> void:
	var distance := p1.distance_to(p2)
	if distance < 0.2 or active_fx.size() >= MAX_ACTIVE_FX:
		return
	var beam := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(width, width, distance)
	beam.mesh = box
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var m := _fx_mat(col)
	beam.material_override = m
	fx_root.add_child(beam)
	var up := Vector3.RIGHT if absf((p2 - p1).y) / distance > 0.999 else Vector3.UP
	beam.look_at_from_position((p1 + p2) * 0.5, p2, up)
	active_fx.append({"node": beam, "mat": m, "ttl": duration, "max": duration, "kind": "beam", "col": col})

func _spawn_attack_projectile(
	start: Vector3, end: Vector3, col: Color, radius: float, kind: String, impact: float, travel_time: float = 0.0
) -> void:
	if active_fx.size() >= MAX_ACTIVE_FX:
		return
	var shot := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 8
	mesh.rings = 4
	shot.mesh = mesh
	if kind == "glaive":
		var disc := TorusMesh.new()
		disc.inner_radius = radius * 0.55
		disc.outer_radius = radius * 1.5
		disc.rings = 12
		disc.ring_segments = 6
		shot.mesh = disc
	shot.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shot.material_override = _fx_mat(col)
	shot.position = start
	fx_root.add_child(shot)
	if kind == "missile" and start.distance_squared_to(end) > 0.01:
		var aim := (end - start).normalized()
		var up := Vector3.RIGHT if absf(aim.y) > 0.99 else Vector3.UP
		shot.look_at(end, up)
		shot.scale = Vector3(0.65, 0.65, 2.7)
	var duration := travel_time if travel_time > 0.0 else (0.17 if kind == "lob" else 0.115)
	var arc := minf(3.5, start.distance_to(end) * 0.19) if kind == "lob" else 0.4
	active_fx.append({
		"node": shot, "ttl": duration, "max": duration, "kind": "projectile", "col": col,
		"start": start, "end": end, "arc": arc, "impact": impact,
	})

func _render_profiled_attack(attacker: Dictionary, target: Dictionary, profile: Dictionary, splash: bool) -> void:
	var node := unit_nodes.get(attacker.tag) as Node3D
	if node and node.has_meta("sunblade_rig"):
		SunbladeMotion.strike(node.get_meta("sunblade_rig"), anim_time)
		node.set_meta("attack_time", anim_time)
		if SimEngine.can_see_unit(_viewing_player, target):
			var impact := Vector3(target.pos.x, SimEngine.unit_visual_elevation(target) + minf(1.25, target.radius), target.pos.y)
			_spawn_burst(impact, Color("#b6f3ff"), 0.32, 0.12, 1.9)
		return
	var offsets: Array[Vector3] = []
	if node and node.has_meta("attack_anchors"):
		node.set_meta("attack_time", anim_time)
		offsets.assign(node.get_meta("attack_anchors"))
	if offsets.is_empty():
		offsets.append(Vector3(float(attacker.radius) * 0.78, float(attacker.radius) * 0.76, 0))
	var heading := Basis(Vector3.UP, -float(attacker.facing))
	var origin := Vector3(attacker.pos.x, SimEngine.unit_visual_elevation(attacker), attacker.pos.y)
	var end := Vector3(target.pos.x, SimEngine.unit_visual_elevation(target) + minf(2.0, float(target.radius)), target.pos.y)
	var color := Color(str(profile.color))
	var flash := float(profile.flash)
	var kind := str(profile.kind)
	var visible_target := SimEngine.can_see_unit(_viewing_player, target)
	var impact_radius := maxf(0.75, flash * 1.7) if splash else flash * 0.73
	var has_flight := kind in ["acid", "lob", "missile", "glaive"]
	for offset in offsets:
		var start := origin + heading * offset
		match kind:
			"ballistic", "cannon":
				_spawn_burst(start, color, flash, 0.078, 1.25, heading.x * 0.45, true)
				if kind == "cannon":
					_spawn_burst(start, Color(0.31, 0.28, 0.25, 0.48), flash * 0.65, 0.29, 2.0, Vector3.UP * 0.65)
				if visible_target:
					_spawn_weapon_streak(start, end, color, flash * 0.28, 0.062)
			"acid", "lob", "missile", "glaive":
				_spawn_burst(start, color, flash * 0.66, 0.095, 1.5)
				if visible_target:
					_spawn_attack_projectile(start, end, color, flash * 0.72, kind, impact_radius if offset == offsets[0] else 0.0)
			"beam", "arc":
				_spawn_burst(start, color, flash, 0.12, 1.4, Vector3.ZERO, true)
				if visible_target:
					_spawn_weapon_streak(start, end, color, flash * 0.66, 0.19 if kind == "beam" else 0.075)
			"shockwave":
				_spawn_burst(start, color, flash, 0.12, 1.7, Vector3.ZERO, true)
				if visible_target:
					_spawn_archon_lightning(start, end, color)
			"melee":
				if visible_target:
					var side := heading.z * flash * 1.6
					_spawn_weapon_streak(end - side - Vector3.UP * flash, end + side + Vector3.UP * flash, color, flash * 0.35, 0.09)
	if visible_target and not has_flight:
		_spawn_burst(end, Color(color.r, color.g, color.b, 0.78), impact_radius, 0.17, 2.0)

func _spawn_archon_lightning(start: Vector3, end: Vector3, color: Color) -> void:
	var sideways := (end - start).cross(Vector3.UP).normalized()
	var previous := start
	for segment in range(1, 6):
		var fraction := float(segment) / 5.0
		var bend := sin(fraction * PI) * 0.68
		var angle := SimEngine.tick * 0.81 + segment * 2.47
		var point := start.lerp(end, fraction) + (sideways * cos(angle) + Vector3.UP * sin(angle)) * bend
		_spawn_weapon_streak(previous, point, color, 0.18, 0.17)
		previous = point

func _fire_siege_gun(attacker: Dictionary) -> Vector3:
	var base := Vector3(attacker.pos.x, SimEngine.unit_visual_elevation(attacker), attacker.pos.y)
	var heading := Basis(Vector3.UP, -float(attacker.facing))
	var direction := heading * Vector3(0.9, 0.44, 0.0)
	var muzzle := base + heading * Vector3(3.7, 3.3, 0.0)
	var unit := unit_nodes.get(attacker.tag) as Node3D
	if unit and unit.has_meta("siege_gun"):
		var rig: Dictionary = unit.get_meta("siege_gun")
		var rest: Transform3D = rig.rest
		muzzle = base + heading * (rest * rig.muzzle)
		direction = heading * rest.basis.x.normalized()
		unit.set_meta("siege_shot_time", anim_time)
	if _effect_near_view(attacker.pos):
		_spawn_burst(muzzle, Color(1.0, 0.96, 0.79, 1.0), 0.83, 0.085, 1.4, direction * 0.25, true)
		_spawn_burst(muzzle + direction * 0.46, Color(1.0, 0.45, 0.09, 0.62), 0.88, 0.135, 1.9, direction * 0.9, true)
		_spawn_burst(muzzle, Color(0.30, 0.27, 0.24, 0.54), 0.44, 0.58, 3.2, direction * 1.8 + Vector3.UP * 0.8)
		var side := direction.cross(Vector3.UP).normalized()
		var brake := muzzle - direction * 0.4
		var jet := Color(1.0, 0.66, 0.24, 0.88)
		for lateral in [side, -side]:
			_spawn_burst(brake + lateral * 0.28, jet, 0.35, 0.095, 1.3, lateral * 1.6 - direction * 0.35, true)
	return muzzle

func _on_unit_phased(from_pos: Vector2, to_pos: Vector2, tag: int) -> void:
	if _skip_transient_fx():
		return
	var unit: Dictionary = SimEngine.units.get(tag, {})
	if unit.is_empty():
		return
	var endpoint := unit.duplicate()
	for p in [from_pos, to_pos]:
		endpoint.pos = p
		if not SimEngine.can_see_unit(_viewing_player, endpoint):
			continue
		_spawn_burst(Vector3(p.x, SimEngine.get_elevation_at(p) + 1.3, p.y), Color(0.4, 0.85, 1.0, 0.9), 0.9, 0.4, 2.6)

func _update_canticle_fx() -> void:
	if SimEngine.canticle_storms.is_empty() or _skip_transient_fx():
		_storm_visual_pulse = -1
		return
	var pulse := floori(SimEngine.tick / 9.0)
	if pulse == _storm_visual_pulse:
		return
	_storm_visual_pulse = pulse
	var radius := SimEngine.canticle_storm_radius()
	for zone in SimEngine.visible_canticle_storms(_viewing_player):
		if not _effect_near_view(zone.pos):
			continue
		for strike in range(3):
			var angle := pulse * 2.4 + strike * TAU / 3.0
			var point: Vector2 = zone.pos + Vector2.from_angle(angle) * radius * (0.3 + 0.2 * strike)
			var base := Vector3(point.x, SimEngine.get_elevation_at(point) + 0.15, point.y)
			var elbow := base + Vector3(cos(angle) * 0.52, 1.1, sin(angle) * 0.52)
			var tip := base + Vector3(sin(angle) * 0.7, 3.1, cos(angle) * 0.7)
			var tint := Color(0.55, 0.75, 1.0, 0.84)
			_spawn_weapon_streak(base, elbow, tint, 0.11, 0.13)
			_spawn_weapon_streak(elbow, tip, tint, 0.085, 0.13)

func _update_neural_tether_fx() -> void:
	if SimEngine.neural_tethers.is_empty() or _skip_transient_fx():
		return
	var pulse := floori(SimEngine.tick / 9.0)
	if pulse == _tether_visual_pulse:
		return
	_tether_visual_pulse = pulse
	for tag in SimEngine.neural_tethers:
		var caster: Dictionary = SimEngine.units.get(tag, {})
		var target: Dictionary = SimEngine.units.get(SimEngine.neural_tethers[tag].target, {})
		if (caster.is_empty() or target.is_empty() or not _effect_near_view(caster.pos)
				or not SimEngine.can_see_unit(_viewing_player, caster) or not SimEngine.can_see_unit(_viewing_player, target)):
			continue
		var origin := Vector3(caster.pos.x, SimEngine.unit_visual_elevation(caster) + 1.0, caster.pos.y)
		var endpoint := Vector3(target.pos.x, SimEngine.unit_visual_elevation(target) + 1.0, target.pos.y)
		_spawn_weapon_streak(origin, endpoint, Color("#cda2f2"), 0.14, 0.15)

func _render_workshop_attack(unit: Dictionary, weapon: Dictionary, from: Vector3, to: Vector3) -> void:
	_play_robotics_clip(unit.tag, "attack")
	var model := unit_nodes.get(unit.tag) as Node3D
	var muzzle_names := ["Muzzle_Main"]
	match unit.unit_type:
		"torchguard", "cinder_runner", "cinder_guard":
			muzzle_names = ["Muzzle_Flame_L", "Muzzle_Flame_R"]
		"sentinel_mine_armed":
			muzzle_names = ["Muzzle_Launch"]
		"atlas_walker", "atlas_walker_precision":
			match weapon.name:
				"Javelin Rack": muzzle_names = ["Muzzle_Missile_L1", "Muzzle_Missile_L2", "Muzzle_Missile_R1", "Muzzle_Missile_R2"]
				"Precision Punisher": muzzle_names = ["Muzzle_HeavyGun_L", "Muzzle_HeavyGun_R"]
				_: muzzle_names = ["Muzzle_Cannon_L", "Muzzle_Cannon_R"]
	for muzzle in muzzle_names:
		var anchor := model.find_child(muzzle, true, false) as Node3D if model else null
		var origin := anchor.global_position if anchor else from
		if unit.unit_type in ["torchguard", "cinder_runner", "cinder_guard"]:
			var direction := (to - origin).normalized()
			var reach := minf(origin.distance_to(to) + 2.0, float(weapon.get("line_splash_length", 7.0)))
			var end := origin + direction * reach
			_spawn_weapon_streak(origin, end, Color("#ff9e46"), 0.42, 0.23)
			_spawn_burst(end, Color("#ff782c"), 0.7, 0.28, 2.25, Vector3.UP, true)
		elif unit.unit_type == "sentinel_mine_armed":
			var travel := LadderRules.MINE_MISSILE_RISE_SECONDS + _missile_travel_time(origin.distance_to(to),
				LadderRules.MINE_MISSILE_ACCELERATION, LadderRules.MINE_MISSILE_MAX_SPEED)
			_spawn_attack_projectile(origin, to, Color("#ffcf86"), 0.22, "lob", 0.0, travel)
		else:
			_spawn_attack_projectile(origin, to, Color("#ffcf86"), 0.14, "missile", 0.7, 0.18)

func _shade_muzzle(unit: Dictionary) -> Vector3:
	var fallback := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 1.2, unit.pos.y)
	return _model_anchor(unit.tag, "Muzzle", fallback)

func _model_anchor(tag: int, name: String, fallback: Vector3) -> Vector3:
	var model := unit_nodes.get(tag) as Node3D
	var anchor := model.find_child(name, true, false) as Node3D if model else null
	return anchor.global_position if anchor else fallback

func _missile_travel_time(distance: float, acceleration: float, max_speed: float) -> float:
	var accel_distance := max_speed * max_speed / (2.0 * acceleration)
	return sqrt(2.0 * distance / acceleration) if distance <= accel_distance \
		else max_speed / acceleration + (distance - accel_distance) / max_speed

func _render_meridian_air_attack(unit: Dictionary, from: Vector3, to: Vector3) -> void:
	_play_robotics_clip(unit.tag, "attack")
	match unit.unit_type:
		"night_harrier", "sky_sentry":
			var tint := Color("#ffc27a") if unit.unit_type == "night_harrier" else Color("#a6ddff")
			for muzzle in ["MuzzleLeft", "MuzzleRight"]:
				var origin := _model_anchor(unit.tag, muzzle, from)
				_spawn_burst(origin, tint, 0.34, 0.10, 1.8, Vector3.ZERO, true)
				_spawn_attack_projectile(origin, to, tint, 0.17, "missile", 0.55, 0.20)
		"dreadnought", "bastion_turret":
			var muzzle := "MuzzleLeft" if posmod(SimEngine.tick, 2) == 0 else "MuzzleRight"
			var tint := Color("#ffb76a") if unit.unit_type == "dreadnought" else Color("#a3e5ff")
			var origin := _model_anchor(unit.tag, muzzle, from)
			_spawn_weapon_streak(origin, to, tint, 0.15, 0.10)
			_spawn_burst(origin, tint, 0.35, 0.11, 1.65)
		_:
			var origin := _model_anchor(unit.tag, "Muzzle", from)
			var tint := Color("#ffdbad")
			_spawn_weapon_streak(origin, to, tint, 0.27, 0.13)
			_spawn_burst(origin, tint, 0.63, 0.16, 2.0, Vector3.ZERO, true)
			_spawn_burst(to, tint, 0.77, 0.23, 2.35, Vector3.UP)

func _render_meridian_capital_ability(unit: Dictionary, ability: String, point: Vector2) -> void:
	var visible := SimEngine.can_see_unit(_viewing_player, unit)
	var from := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 0.8, unit.pos.y)
	if visible and ability in ["systems_jammer", "armor_breaker", "deploy_bastion_turret", "dreadnought_jump", "dreadnought_beam"]:
		_play_robotics_clip(unit.tag, "cast")
	if _skip_transient_fx() or not _effect_near_view(point) or not SimEngine.can_see_position(_viewing_player, point):
		return
	var to := Vector3(point.x, SimEngine.get_elevation_at(point) + 0.8, point.y)
	var target_tag: int = unit.get("visual_target_tag", unit.get("dread_beam", {}).get("target", 0))
	var target: Dictionary = SimEngine.units.get(target_tag, {})
	if not target.is_empty() and SimEngine.can_see_unit(_viewing_player, target):
		to.y = SimEngine.unit_visual_elevation(target) + 0.8
	match ability:
		"systems_jammer", "armor_breaker":
			if visible:
				var color := Color("#76dbff") if ability == "systems_jammer" else Color("#f2b154")
				var muzzle := _model_anchor(unit.tag, "Muzzle", from)
				var distance: float = unit.pos.distance_to(point)
				var acceleration: float = LadderRules.WATCHKEEPER_MISSILE_ACCELERATION[ability]
				var max_speed: float = LadderRules.WATCHKEEPER_MISSILE_MAX_SPEED[ability]
				var travel := _missile_travel_time(distance, acceleration, max_speed)
				_spawn_attack_projectile(muzzle, to, color, 0.25, "missile", 0.0, maxf(travel, SimEngine.TICK_DT))
		"systems_jammer_impact":
			_spawn_burst(to, Color("#7aebff"), 1.15, 0.42, 2.1, Vector3.UP, true)
		"armor_breaker_impact":
			_spawn_burst(to, Color("#ff9b3c"), 2.8, 0.52, 2.6, Vector3.UP, true)
		"sentinel_impact":
			_spawn_burst(to, Color("#ffb556"), 1.7, 0.38, 2.6, Vector3.UP, true)
		"deploy_bastion_turret":
			_spawn_burst(to, Color("#a7e6ff"), 0.9, 0.45, 2.0, Vector3.UP)
		"dreadnought_jump", "dreadnought_arrival":
			if visible:
				_spawn_burst(from, Color("#a7dcff"), 2.6, 0.68, 2.9, Vector3.ZERO, true)
		"dreadnought_beam":
			if visible:
				_spawn_burst(_model_anchor(unit.tag, "SiegeMuzzle", from), Color("#ffe1a2"), 0.85, 0.8, 1.65, Vector3.ZERO, true)
		"dreadnought_beam_hit":
			if visible:
				_spawn_weapon_streak(_model_anchor(unit.tag, "SiegeMuzzle", from), to, Color("#ffd896"), 0.68, 0.28)
			_spawn_burst(to, Color("#ffbc59"), 1.8, 0.48, 2.6, Vector3.UP, true)

func _on_visual_ability(unit: Dictionary, ability: String, p: Vector2) -> void:
	if ability == "sentry_missile_impact":
		if not _skip_transient_fx() and _effect_near_view(p) and SimEngine.can_see_position(_viewing_player, p):
			_spawn_burst(_sentry_impact_point(unit), Color("#ffdbaa"), 0.52, 0.15, 2.15)
		return
	if ability in ["mutation_nuclear_impact", "mutation_death_impact"]:
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var nuclear := ability == "mutation_nuclear_impact"
		var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.5, p.y)
		_spawn_burst(center, Color("#ffe8a3"), 9.0 if nuclear else 4.0, 0.7 if nuclear else 0.4, 3.2, Vector3.UP, true)
		_spawn_scorch(center - Vector3.UP * 0.5, 7.0 if nuclear else 3.0)
		return
	if ability in ["systems_jammer", "systems_jammer_impact", "armor_breaker", "armor_breaker_impact", "deploy_bastion_turret", "sentinel_impact",
			"dreadnought_jump", "dreadnought_arrival", "dreadnought_beam", "dreadnought_beam_hit"]:
		_render_meridian_capital_ability(unit, ability, p)
		return
	if ability in ["revelation", "seed_stasis_ward", "stasis_ward_detonate"]:
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var origin := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.45, p.y)
		if ability == "revelation":
			_spawn_burst(origin, Color("#a4f6d3"), 2.45, 0.50, 3.1, Vector3.UP, true)
		elif ability == "stasis_ward_detonate":
			_spawn_burst(origin, Color("#b7eaff"), 1.65, 0.55, 2.5, Vector3.UP, true)
		elif SimEngine.can_see_unit(_viewing_player, unit):
			_spawn_burst(origin, Color("#94e6d5"), 0.45, 0.36, 2.0, Vector3.UP)
		return
	if LadderRules.VEHICLE_MODES.has(ability) or ability in ["sky_defender_mode", "sky_fighter_mode", "harrier_cloak", "vortex_lock", "mine_lock", "rampart_boost"]:
		if not SimEngine.can_see_unit(_viewing_player, unit) or not _effect_near_view(unit.pos):
			return
		if LadderRules.VEHICLE_MODES.has(ability) or ability.begins_with("sky_"):
			_play_robotics_clip(unit.tag, "morph")
		else:
			_play_robotics_clip(unit.tag, "cast")
		if ability == "rampart_boost" and not _skip_transient_fx():
			var center := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 0.4, unit.pos.y)
			var rear := Vector2.from_angle(float(unit.facing)) * -2.2
			_spawn_burst(center + Vector3(rear.x, 0.0, rear.y), Color("#82dbff"), 0.7, 0.33, 2.4, Vector3(rear.x, 0.0, rear.y), true)
		return
	if ability in ["agent_cloak", "agent_snipe", "agent_snipe_hit", "agent_emp", "agent_emp_impact", "agent_strike", "agent_strike_impact"]:
		var can_see_agent := SimEngine.can_see_unit(_viewing_player, unit)
		if can_see_agent and ability in ["agent_cloak", "agent_snipe", "agent_emp", "agent_strike"]:
			_play_robotics_clip(unit.tag, "cast")
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.5, p.y)
		match ability:
			"agent_snipe_hit":
				if can_see_agent:
					_play_robotics_clip(unit.tag, "attack")
					_spawn_weapon_streak(_shade_muzzle(unit), center, Color("#ffe2a0"), 0.18, 0.18)
				_spawn_burst(center, Color("#f4bd64"), 0.55, 0.22, 2.3)
			"agent_emp":
				if can_see_agent:
					_spawn_attack_projectile(_shade_muzzle(unit), center, Color("#81dfff"), 0.24, "direct", 0.0,
						unit.pos.distance_to(p) / LadderRules.AGENT_EMP_PROJECTILE_SPEED)
			"agent_emp_impact":
				_spawn_burst(center, Color("#85e2ff"), 2.5, 0.48, 2.5, Vector3.UP, true)
			"agent_strike_impact":
				_spawn_burst(center, Color("#ffe8a3"), 7.5, 0.68, 3.4, Vector3.UP, true)
				_spawn_burst(center, Color("#df601a"), 4.5, 1.0, 3.0, Vector3.UP)
				_spawn_scorch(center - Vector3.UP * 0.5, 8.0)
		return
	if ability == "pursuit_fighter_launch":
		if SimEngine.can_see_unit(_viewing_player, unit):
			_play_robotics_clip(unit.tag, "attack")
		return
	if ability == "rift_nova_cast":
		if SimEngine.can_see_unit(_viewing_player, unit):
			_play_robotics_clip(unit.tag, "cast")
		return
	if ability in ["mirage_transfer", "mirage_arrival"]:
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_unit(_viewing_player, unit):
			return
		if ability == "mirage_transfer":
			_play_robotics_clip(unit.tag, "cast")
		var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.75, p.y)
		_spawn_burst(center, Color("#91ecff"), 0.8, 0.35, 2.25, Vector3.UP, true)
		return
	if ability in ["canticle_storm", "scribe_feedback"]:
		if SimEngine.can_see_unit(_viewing_player, unit):
			_play_robotics_clip(unit.tag, "cast")
		if not _skip_transient_fx() and _effect_near_view(p) and SimEngine.can_see_position(_viewing_player, p):
			var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.65, p.y)
			_spawn_burst(center, Color("#a1c7ff"), 0.75, 0.29, 2.05, Vector3.UP, true)
		return
	if ability in ["shadow_stride", "archon_warp", "archon_ready"]:
		if not SimEngine.can_see_unit(_viewing_player, unit):
			return
		if ability == "shadow_stride":
			_play_robotics_clip(unit.tag, "cast")
		if not _skip_transient_fx() and _effect_near_view(p):
			var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.75, p.y)
			var tint := Color("#d5bdff") if ability == "shadow_stride" else Color("#c5e8ff")
			_spawn_burst(center, tint, 0.72 if ability == "shadow_stride" else 1.5, 0.42, 2.25, Vector3.UP, true)
		return
	if ability in ["caustic_barrage", "caustic_impact"]:
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var point := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.25, p.y)
		var tint := Color("#e6ae51")
		if ability == "caustic_impact":
			_spawn_burst(point, tint, SimEngine.caustic_barrage_radius(), 0.48, 2.8, Vector3.UP, true)
		elif SimEngine.can_see_unit(_viewing_player, unit):
			_play_robotics_clip(unit.tag, "cast")
			var start := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 2.65, unit.pos.y)
			var model := unit_nodes.get(unit.tag) as Node3D
			var origin := model.find_child("BileOrigin", true, false) as Node3D if model else null
			if origin:
				start = origin.global_position
			_spawn_attack_projectile(start, point, tint, 0.39, "lob", 0.0, 2.5)
		return
	if ability in ["caustic_spray", "caustic_spray_pulse"]:
		if _skip_transient_fx() or not SimEngine.can_see_unit(_viewing_player, unit) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var start := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 0.7, unit.pos.y)
		if ability == "caustic_spray":
			_play_robotics_clip(unit.tag, "cast")
		var model := unit_nodes.get(unit.tag) as Node3D
		var nozzle := model.find_child("Muzzle", true, false) as Node3D if model else null
		if nozzle:
			start = nozzle.global_position
		var target := Vector3(p.x, SimEngine.get_elevation_at(p) + 1.2, p.y)
		_spawn_weapon_streak(start, target, Color("#c4e677"), 0.35, 0.42)
		_spawn_burst(target, Color("#c4e677"), 0.7, 0.30, 1.5)
		return
	if ability in ["fungal_grasp", "fungal_impact", "microbial_shroud"]:
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var target := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.3, p.y)
		var tint := Color("#a4da74")
		if ability == "fungal_grasp":
			if SimEngine.can_see_unit(_viewing_player, unit):
				_play_robotics_clip(unit.tag, "cast")
				var start := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 1.5, unit.pos.y)
				var flight: float = maxf(SimEngine.TICK_DT, unit.pos.distance_to(p) / LadderRules.FUNGAL_GRASP_PROJECTILE_SPEED)
				_spawn_attack_projectile(start, target, tint, flight, "lob", 0.0, 1.8)
		else:
			var radius := LadderRules.FUNGAL_GRASP_RADIUS if ability == "fungal_impact" else LadderRules.MICROBIAL_SHROUD_RADIUS
			_spawn_burst(target, tint, radius, 0.55, 2.1, Vector3.UP, true)
		return
	if ability in ["launch_locusts", "locust_swoop", "brood_worm_open"]:
		if not SimEngine.can_see_position(_viewing_player, p) or _skip_transient_fx() or not _effect_near_view(p):
			return
		_play_robotics_clip(unit.tag, "swoop" if ability == "locust_swoop" else "cast")
		var origin := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.5, p.y)
		_spawn_burst(origin, Color("#b9c66b"), 1.2, 0.45, 1.8, Vector3.UP)
		return
	if ability in ["siphon_structure", "wyrm_grasp", "blinding_cloud", "parasitic_cloud"]:
		if (_skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_unit(_viewing_player, unit)
				or not SimEngine.can_see_position(_viewing_player, p)):
			return
		_play_robotics_clip(unit.tag, "cast")
		var start := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 0.9, unit.pos.y)
		var endpoint := Vector3(p.x, SimEngine.get_elevation_at(p) + 1.2, p.y)
		_spawn_weapon_streak(start, endpoint, Color("#b5d47e"), 0.14, 0.33)
		_spawn_burst(endpoint, Color("#b5d47e"), 1.2, 0.38, 1.8, Vector3.UP)
		return
	if ability in ["gravity_lift", "prism_alignment"]:
		if _skip_transient_fx() or not SimEngine.can_see_unit(_viewing_player, unit) or not _effect_near_view(p):
			return
		_play_robotics_clip(unit.tag, "cast")
		var position := Vector3(p.x, SimEngine.get_elevation_at(p) + 1.0, p.y)
		if ability == "gravity_lift":
			var origin := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 0.8, unit.pos.y)
			_spawn_weapon_streak(origin, position, Color("#d3b6f6"), 0.22, 0.45)
		else:
			position.y = SimEngine.unit_visual_elevation(unit) + 0.8
		_spawn_burst(position, Color("#d9f0ff"), 1.25, 0.5, 2.0, Vector3.UP, true)
		return
	if ability == "rift_nova_blast":
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.5, p.y)
		_spawn_burst(center, Color("#f5b4ff"), SimEngine.rift_nova_radius() * 0.45, 0.35, 2.3, Vector3.UP, true)
		return
	if ability in ["transit_start", "transit_ready", "transit_mode_ready", "energy_recharge"]:
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_unit(_viewing_player, unit):
			return
		var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.8, p.y)
		var radius := 1.8 if ability == "transit_mode_ready" else 0.7
		var tint := Color("#93ffcf") if ability == "energy_recharge" else Color("#d2baff")
		_spawn_burst(center, tint, radius, 0.33, 2.0, Vector3.UP, true)
		return
	if ability in ["ridge_charge", "ridge_charge_impact"]:
		if _skip_transient_fx() or not _effect_near_view(p) or not SimEngine.can_see_position(_viewing_player, p):
			return
		var ground := Vector3(p.x, SimEngine.get_elevation_at(p), p.y)
		if ability == "ridge_charge":
			_play_scout_animation(unit.tag, "throw")
			var start := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 1.0, unit.pos.y)
			_spawn_attack_projectile(start, ground + Vector3.UP * 0.15, Color("#ffc278"), 0.13, "lob", 0.0, 0.34)
		else:
			_spawn_burst(ground + Vector3.UP * 0.24, Color("#ffbe75"), 0.9, 0.3, 2.6, Vector3.ZERO, true)
			_spawn_burst(ground + Vector3.UP * 0.55, Color(0.34, 0.28, 0.21, 0.6), 1.0, 0.7, 1.3, Vector3.UP)
		return
	if ability in ["uprising_throw", "uprising_impact"]:
		_render_uprising_ability(unit, ability, p)
		return
	if ability != "detonate_sporeburst" or _skip_transient_fx() or not _effect_near_view(p):
		return
	if unit.owner != _viewing_player and not SimEngine.can_see_position(_viewing_player, p):
		return
	var center := Vector3(p.x, SimEngine.get_elevation_at(p) + 0.48, p.y)
	_spawn_burst(center, Color(0.75, 1.0, 0.22, 0.88), 0.88, 0.2, 2.5, Vector3.ZERO, true)
	_spawn_burst(center, Color(0.22, 0.52, 0.05, 0.66), 0.9, 0.58, 1.8, Vector3(0, 0.6, 0))
	for i in range(8):
		var heading := float(i) * TAU / 8.0 + float(unit.tag)
		_spawn_burst(center, Color(0.38, 0.85, 0.08, 0.85), 0.19, 0.43, 0.28,
			Vector3(cos(heading) * 4.5, 0.9 + float(i % 3) * 0.85, sin(heading) * 4.5))
	_spawn_scorch(center - Vector3.UP * 0.48, 1.25)

func _play_scout_animation(tag: int, clip: String) -> void:
	var node: Node3D = unit_nodes.get(tag)
	if node and node.has_meta("scout_animation"):
		var player: AnimationPlayer = node.get_meta("scout_animation")
		player.stop()
		player.play(clip, 0.04)

func _play_robotics_clip(tag: int, clip: String) -> void:
	var node: Node3D = unit_nodes.get(tag)
	if node and node.has_meta("robotics_animation"):
		var player: AnimationPlayer = node.get_meta("robotics_animation")
		if player.has_animation(clip) and (not player.is_playing() or player.current_animation != clip):
			player.stop()
			player.play(clip, 0.04)

func _render_uprising_ability(unit: Dictionary, ability: String, point: Vector2) -> void:
	if _skip_transient_fx() or not _effect_near_view(point) or not SimEngine.can_see_position(_viewing_player, point):
		return
	var ground := Vector3(point.x, SimEngine.get_elevation_at(point), point.y)
	if ability == "uprising_throw":
		var start := Vector3(unit.pos.x, SimEngine.unit_visual_elevation(unit) + 1.45, unit.pos.y)
		_spawn_attack_projectile(start, ground + Vector3.UP * 0.24, Color("#ffb94f"), 0.22, "lob", 0.0, 0.375)
		return
	var center := ground + Vector3.UP * 0.55
	_spawn_burst(center, Color(1.0, 0.61, 0.20, 0.95), 1.25, 0.28, 2.7, Vector3.ZERO, true)
	_spawn_burst(center, Color(0.32, 0.25, 0.21, 0.77), 1.15, 1.0, 2.5, Vector3(0, 2.0, 0))
	_spawn_scorch(ground, 2.5)
	for index in 6:
		var angle := float(index) * TAU / 6.0 + float(unit.tag)
		var scatter := Vector3(cos(angle) * 4.2, 0.4 + float(index % 3) * 0.5, sin(angle) * 4.2)
		_spawn_burst(center, Color(1.0, 0.38, 0.08, 0.82), 0.29, 0.51, 0.45, scatter, true)
	if active_fx.size() < MAX_ACTIVE_FX:
		var wave := Models.ring(fx_root, 0.91, 1.0, _fx_mat(Color(1.0, 0.73, 0.36, 0.8)), ground + Vector3.UP * 0.13)
		wave.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		active_fx.append({"node": wave, "mat": wave.material_override, "ttl": 0.31, "max": 0.31,
			"kind": "burst", "col": Color(1.0, 0.73, 0.36, 0.8), "grow": 3.5, "drift": Vector3.ZERO})

func _on_unit_destroyed(dead: Dictionary) -> void:
	var p: Vector2 = dead["pos"]
	if dead.unit_type in ["phase_barrier", "sporeburst"] or not _effect_near_view(p) or not SimEngine.can_see_unit(_viewing_player, dead):
		return
	var ground := SimEngine.get_elevation_at(p)
	var height := SimEngine.unit_visual_elevation(dead)
	var airborne := height > ground + 0.05
	var base := Vector3(p.x, height, p.y)
	var rad := float(dead["radius"])
	var col := Color(1.0, 0.7, 0.3, 0.9)
	match str(dead.get("faction", "humans")):
		"monsters": col = Color(0.65, 0.92, 0.2, 0.9)
		"aliens": col = Color(0.5, 0.9, 1.0, 0.9)
		"neutral": col = Color(0.78, 0.7, 0.62, 0.8)
	if not _skip_transient_fx():
		_keep_robotics_death_animation(dead.tag)
		if not dead.is_structure and dead.attributes.has("Armored") and int(dead.get("uprising_hit_tick", -1)) == SimEngine.tick:
			_spawn_uprising_tumble(dead, base)
		_spawn_burst(base + Vector3(0, rad * 0.8, 0), col, rad * (1.2 if dead["is_structure"] else 0.9), 0.55, 2.8)
		if dead["is_structure"]:
			_spawn_burst(base + Vector3(rad * 0.3, rad * 1.2, 0), Color(1.0, 0.85, 0.5, 0.8), rad * 0.8, 0.8, 2.2)
			_spawn_burst(base + Vector3(0, rad * 1.55, 0), DESTRUCTION_SMOKE, rad * 0.6, 1.2, 2.7)
	if dead["unit_type"] != "shale_barrier" and not airborne:
		_spawn_scorch(base, rad * (1.1 if dead["is_structure"] else 0.8))

func _keep_robotics_death_animation(tag: int) -> void:
	var model: Node3D = unit_nodes.get(tag)
	if not model or not model.visible or not model.has_meta("robotics_animation") or active_fx.size() >= MAX_ACTIVE_FX:
		return
	var player: AnimationPlayer = model.get_meta("robotics_animation")
	if not player.has_animation("death"):
		return
	var duration := player.get_animation("death").length
	_play_robotics_clip(tag, "death")
	for name in ["SelectionRing", "ShieldBubble"]:
		var overlay := model.get_node_or_null(name) as Node3D
		if overlay:
			overlay.hide()
	model.reparent(fx_root, true)
	unit_nodes.erase(tag)
	_last_pos.erase(tag)
	active_fx.append({"node": model, "kind": "robotics_death", "ttl": duration, "max": duration, "col": Color.WHITE})

func _spawn_uprising_tumble(dead: Dictionary, base: Vector3) -> void:
	if active_fx.size() >= MAX_ACTIVE_FX:
		return
	var remains := Models.build(_appearance_type(dead), int(dead.get("disguise_owner", dead.owner)))
	fx_root.add_child(remains)
	remains.position = base
	remains.rotation.y = -float(dead.facing)
	var center: Vector2 = dead.uprising_hit_origin
	var away: Vector2 = (dead.pos - center).normalized()
	if away.is_zero_approx():
		away = Vector2.from_angle(dead.facing + PI)
	active_fx.append({"node": remains, "ttl": 0.59, "max": 0.59, "kind": "tumble", "col": Color.WHITE,
		"origin": base, "drift": Vector3(away.x, 0, away.y) * 2.5})

func _effect_near_view(pos: Vector2) -> bool:
	# Conservative margin includes beams crossing the view and tall structures.
	# Offscreen combat still runs fully in the simulation, without allocating FX.
	return get_focus().distance_squared_to(pos) <= pow(cam_height * 1.5 + 12.0, 2)

# ---------------------------------------------------------------------------
# Projection helpers
# ---------------------------------------------------------------------------
func world_to_screen(wpos: Vector2, y_offset: float = 0.0) -> Vector2:
	var elev := SimEngine.get_elevation_at(wpos) + y_offset
	return camera_3d.unproject_position(Vector3(wpos.x, elev, wpos.y))

func screen_to_world(spos: Vector2) -> Vector2:
	var orig := camera_3d.project_ray_origin(spos)
	var dir := camera_3d.project_ray_normal(spos)
	if absf(dir.y) < 0.0001:
		return Vector2(orig.x, orig.z)
	if SimEngine.terrain_grid:
		var near := maxf(0.0, (8.0 - orig.y) / dir.y)
		var limit := (-8.1 - orig.y) / dir.y
		var step := 0.5 / maxf(0.5, Vector2(dir.x, dir.z).length())
		var t := near
		while t <= limit + step:
			var hit := orig + dir * t
			if hit.y <= _terrain_pick_height(Vector2(hit.x, hit.z)):
				var lo := maxf(near, t - step)
				var hi := t
				for _probe in 8:
					var middle := (lo + hi) * 0.5
					hit = orig + dir * middle
					if hit.y > _terrain_pick_height(Vector2(hit.x, hit.z)):
						lo = middle
					else:
						hi = middle
				hit = orig + dir * hi
				return Vector2(hit.x, hit.z)
			t += step
	var guess := Vector2.ZERO
	var elev := 0.0
	for _i in range(3):
		var t := (elev - orig.y) / dir.y
		var hit := orig + dir * t
		guess = Vector2(hit.x, hit.z)
		elev = SimEngine.get_elevation_at(guess)
	return guess

func _terrain_pick_height(point: Vector2) -> float:
	var height := SimEngine.get_elevation_at(point)
	return maxf(height, SimEngine.terrain_grid.WATER_SURFACE) if SimEngine.is_water_at(point) else height
