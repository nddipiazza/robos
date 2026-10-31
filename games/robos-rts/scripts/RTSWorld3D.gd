extends Node3D

# RTSWorld3D.gd — angled-perspective renderer for the 64Hz SimEngine world.
# The sim is the source of truth; this node only mirrors it in 3D:
# - textured low ground, sandstone plateaus, wedge ramps, rock cliffs and a rock rim around the map
# - composite models from RTSModels.gd (one silhouette per unit, team color on panels and gems)
# - animated crystal fields and aether vents, shield flashes, tracers, impact bursts, scorch marks

const Models = preload("res://scripts/RTSModels.gd")

const CAM_PITCH_DEG := 56.0
const CAM_MIN_H := 28.0
const CAM_MAX_H := 320.0
const GROUND_TOP := 2.2
const MAX_ACTIVE_FX := 192

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
var active_fx: Array[Dictionary] = []
var cam_height: float = 50.0
var anim_time: float = 0.0
var sync_ms: float = 0.0

var mat_cache: Dictionary = {}
var _last_pos: Dictionary = {}
var _unit_mesh_cache: Dictionary = {}
var _unit_batches: Dictionary = {}
var rifle_fx: Node3D

func _ready() -> void:
	_setup_environment_and_camera()
	for n in ["TerrainRoot", "DecorRoot", "ResourcesRoot", "UnitsRoot", "FXRoot"]:
		var node := Node3D.new()
		node.name = n
		add_child(node)
	terrain_root = get_node("TerrainRoot")
	decor_root = get_node("DecorRoot")
	resources_root = get_node("ResourcesRoot")
	units_root = get_node("UnitsRoot")
	fx_root = get_node("FXRoot")
	rifle_fx = preload("res://scripts/RTSRifleFX.gd").new()
	add_child(rifle_fx)

	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	SimEngine.projectile_fired.connect(_on_projectile_fired)
	SimEngine.unit_phased.connect(_on_unit_phased)
	SimEngine.unit_destroyed.connect(_on_unit_destroyed)
	SimEngine.paused_step.connect(_on_paused_step)
	_rebuild_static_3d_map()

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
	return Vector2(camera_3d.position.x, camera_3d.position.z - _z_offset(camera_3d.position.y))

func set_focus(focus: Vector2, height: float = -1.0) -> void:
	if height > 0.0:
		cam_height = clampf(height, CAM_MIN_H, CAM_MAX_H)
	var f := Vector2(
		clampf(focus.x, 12.0, maxf(12.0, SimEngine.map_width - 12.0)),
		clampf(focus.y, 8.0, maxf(8.0, SimEngine.map_height - 8.0))
	)
	camera_3d.position = Vector3(f.x, cam_height, f.y + _z_offset(cam_height))

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

func _terrain_polygon(polygon: PackedVector2Array, height: float, material: Material) -> void:
	var indices = Geometry2D.triangulate_polygon(polygon)
	if indices.is_empty():
		return
	var surface = SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in indices:
		var point = polygon[index]
		surface.set_normal(Vector3.UP)
		surface.add_vertex(Vector3(point.x, height, point.y))
	var mesh = MeshInstance3D.new()
	mesh.mesh = surface.commit()
	mesh.material_override = material
	terrain_root.add_child(mesh)

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
	if rifle_fx:
		rifle_fx.clear()
	_clear_children(terrain_root)
	_clear_children(decor_root)
	_clear_children(resources_root)
	_clear_children(units_root)
	_clear_children(fx_root)
	unit_nodes.clear()
	_unit_batches.clear()
	resource_nodes.clear()
	active_fx.clear()
	_last_pos.clear()

	var mw := SimEngine.map_width
	var mh := SimEngine.map_height
	var low := _noise_mat("low_ground", Color("#33452a"), Color("#617243"), 0.012, 46.0)
	var high := _noise_mat("high_ground", Color("#625640"), Color("#b0a283"), 0.014, 40.0)
	var rock := _noise_mat("rock", Color("#3a3029"), Color("#5d4e42"), 0.03, 14.0, 4, 0.6)
	var path := _noise_mat("ramp", Color("#7d6b4b"), Color("#a08c64"), 0.02, 24.0)

	# Low ground
	_terrain_box(Vector3(mw, 1.0, mh), Vector3(mw * 0.5, -0.5, mh * 0.5), low)
	var water = _noise_mat("river_water", Color("#102c4b"), Color("#39718b"), 0.04, 16.0)
	water.cull_mode = BaseMaterial3D.CULL_DISABLED
	water.roughness = 0.35
	var shore = _noise_mat("river_bank", Color("#34352f"), Color("#8c8772"), 0.08, 10.0)
	shore.cull_mode = BaseMaterial3D.CULL_DISABLED
	for polygon in SimEngine.water_polygons:
		for bank in Geometry2D.offset_polygon(polygon, 1.1, Geometry2D.JOIN_ROUND):
			_terrain_polygon(bank, 0.025, shore)
		_terrain_polygon(polygon, 0.055, water)
	for bridge in SimEngine.land_bridges:
		_terrain_box(Vector3(bridge.size.x, 0.16, bridge.size.y), Vector3(bridge.get_center().x, 0.08, bridge.get_center().y), path)
	for rect in SimEngine.merged_terrain_rects("land"):
		_terrain_box(Vector3(rect.size.x, 0.16, rect.size.y), Vector3(rect.get_center().x, 0.08, rect.get_center().y), low)

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
			_terrain_box(Vector3(pc.size.x + 0.5, 0.34, pc.size.y + 0.5), Vector3(cx, GROUND_TOP - 0.17, cz), high)

	# Ramps are right-angle wedges: high edge on the west, sloping down to the east
	for rmp in SimEngine.ramps:
		var prism := PrismMesh.new()
		prism.size = Vector3(rmp.size.x, GROUND_TOP, rmp.size.y)
		prism.left_to_right = 0.0
		var rmi := MeshInstance3D.new()
		rmi.mesh = prism
		rmi.material_override = path
		rmi.position = Vector3(rmp.position.x + rmp.size.x * 0.5, GROUND_TOP * 0.5, rmp.position.y + rmp.size.y * 0.5)
		terrain_root.add_child(rmi)

	# Cliff walls: dark rock core, ragged boulders on top
	var rng := RandomNumberGenerator.new()
	rng.seed = 7731
	for obs in SimEngine.terrain_obstacles:
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
			var node = Models.build_resource(resource.resource_type, tag, bool(resource.get("rich",false)))
			resources_root.add_child(node)
			node.position = Vector3(resource.pos.x, SimEngine.get_elevation_at(resource.pos), resource.pos.y)
			resource_nodes[tag] = node
		_batch_static_geometry(resources_root)

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
		var radius: float = 20.0 if bool(RTSData.get_unit_def(u.unit_type).get("is_town_hall",false)) else float(u.radius)+4.5
		keep_out.append(Vector3(u.pos.x,u.pos.y,radius))
	# Reserve empty expansion pockets too: scenery must not obscure the arc or
	# the delivery lanes when a player later establishes a base here.
	for site in SimEngine.match_state.get("starts",[]) + SimEngine.match_state.get("expansions",[]):
		keep_out.append(Vector3(float(site.x),float(site.y),20.0))
	for r in SimEngine.resources.values():
		keep_out.append(Vector3(r["pos"].x, r["pos"].y, float(r["radius"]) + 3.5))

	var pine_trunk := _get_mat("pine_trunk", Color("#4b3626"), Color.BLACK, 0.0, 0.9)
	var pine_a := _get_mat("pine_a", Color("#2f5233"), Color.BLACK, 0.0, 0.85)
	var pine_b := _get_mat("pine_b", Color("#3b6a3f"), Color.BLACK, 0.0, 0.85)
	var rock_m := _get_mat("decor_rock", Color("#6e665c"), Color.BLACK, 0.05, 0.95)
	var rock_d := _get_mat("decor_rock_dark", Color("#4d463f"), Color.BLACK, 0.05, 0.95)
	var shrub := _get_mat("shrub", Color("#46602f"), Color.BLACK, 0.0, 0.9)
	var glow := Models.mat("decor_crystal", Color("#b3a0cf"), Color("#775393"), 0.5, 0.0, 0.2, 0.92)

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
func sync_3d_entities(selected_tags: Array[int], delta: float, local_player: int = 1) -> void:
	var sync_started = Time.get_ticks_usec()
	anim_time += delta

	# Resources
	for r_tag in SimEngine.resources.keys():
		var r: Dictionary = SimEngine.resources[r_tag]
		if not resource_nodes.has(r_tag):
			var node := Models.build_resource(str(r["resource_type"]), int(r_tag), bool(r.get("rich",false)))
			resources_root.add_child(node)
			resource_nodes[r_tag] = node
		var rn: Node3D = resource_nodes[r_tag]
		rn.position = Vector3(r["pos"].x, SimEngine.get_elevation_at(r["pos"]), r["pos"].y)
		if r["resource_type"] == "crystal_field":
			rn.visible = SimEngine.unlimited_resources or int(r.amount)>0
			var frac := clampf(float(r["amount"]) / 1500.0, 0.25, 1.0)
			rn.scale = Vector3(1.0, 0.45 + 0.55 * frac, 1.0)
		else:
			for i in range(3):
				var pl := rn.get_node_or_null("Plume%d" % i)
				if pl:
					pl.position.y = 1.2 + float(i) * 0.9 + sin(anim_time * 1.6 + float(i)) * 0.25
	for r_tag in resource_nodes.keys():
		if not SimEngine.resources.has(r_tag):
			resource_nodes[r_tag].queue_free()
			resource_nodes.erase(r_tag)

	# Units and structures
	var own_ring := Models.mat("ring_own", Color("#3fd97a"), Color("#22c55e"), 0.45, 0.0, 0.5)
	var foe_ring := Models.mat("ring_foe", Color("#f0645a"), Color("#ef4444"), 0.45, 0.0, 0.5)
	var human_transforms: Dictionary = {}
	for u_tag in SimEngine.units.keys():
		var u: Dictionary = SimEngine.units[u_tag]
		var u_node: Node3D
		if not unit_nodes.has(u_tag) or unit_nodes[u_tag].get_meta("unit_type", "") != u["unit_type"]:
			if unit_nodes.has(u_tag):
				unit_nodes[u_tag].queue_free()
			u_node = _create_unit_node_3d(u)
			units_root.add_child(u_node)
			unit_nodes[u_tag] = u_node
		else:
			u_node = unit_nodes[u_tag]

		# A generous camera margin retains edge shadows while preventing units
		# across the map from participating in every directional shadow pass.
		u_node.visible = _effect_near_view(u["pos"])
		if not u_node.visible:
			continue

		var draw_pos := display_position(u)
		var elev := SimEngine.get_elevation_at(draw_pos)
		var moving := false
		if _last_pos.has(u_tag):
			moving = (u["pos"] - _last_pos[u_tag]).length() > 0.004
		_last_pos[u_tag] = u["pos"]

		var bob := 0.0
		var ut := str(u["unit_type"])
		if moving and not u["is_structure"] and ut != "howitzer" and ut != "spire_walker" and ut != "mote":
			bob = absf(sin(anim_time * 13.0 + float(u_tag))) * 0.09
		u_node.position = Vector3(draw_pos.x, elev + bob, draw_pos.y)
		u_node.rotation.y = -float(u["facing"])

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
		var hover := u_node.get_node_or_null("Hover")
		if hover:
			hover.position.y = 1.1 + sin(anim_time * 2.4 + float(u_tag)) * 0.12

		var sel_ring: MeshInstance3D = u_node.get_node_or_null("SelectionRing")
		if sel_ring:
			sel_ring.visible = selected_tags.has(u_tag)
			sel_ring.material_override = own_ring if u["owner"] == local_player else foe_ring

		var shield_sphere: MeshInstance3D = u_node.get_node_or_null("ShieldBubble")
		if shield_sphere:
			shield_sphere.visible = u["shields"] > 0.5 and float(u["out_of_combat_timer"]) < 1.4
		if u.faction == "humans":
			var key = "%s:%s" % [u.unit_type, u.owner]
			if not human_transforms.has(key):
				human_transforms[key] = []
			human_transforms[key].append(u_node.transform)

	for u_tag in unit_nodes.keys():
		if not SimEngine.units.has(u_tag):
			unit_nodes[u_tag].queue_free()
			unit_nodes.erase(u_tag)
			_last_pos.erase(u_tag)

	_sync_human_batches(human_transforms)
	_update_fx(delta)
	sync_ms = (Time.get_ticks_usec() - sync_started) / 1000.0

func _sync_human_batches(transforms: Dictionary) -> void:
	for key in transforms:
		if not _unit_batches.has(key):
			var batches: Array = []
			for part in _unit_mesh_cache[key]:
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
		var poses: Array = transforms.get(key, [])
		for instance in _unit_batches[key]:
			var mesh: MultiMesh = instance.multimesh
			if mesh.instance_count < poses.size():
				# Grow geometrically rather than reallocating GPU storage per recruit.
				mesh.instance_count = maxi(16, int(pow(2, ceil(log(float(poses.size())) / log(2.0)))))
			mesh.visible_instance_count = poses.size()
			for i in range(poses.size()):
				mesh.set_instance_transform(i, poses[i])

func _create_unit_node_3d(u: Dictionary) -> Node3D:
	var rad := float(u["radius"])
	var cache_key = "%s:%s" % [u.unit_type, u.owner]
	var root: Node3D
	if u.faction == "humans":
		root = Node3D.new()
		if not _unit_mesh_cache.has(cache_key):
			var model = Models.build(str(u["unit_type"]), int(u["owner"]))
			_batch_static_geometry(model, false)
			var parts: Array = []
			for child in model.get_children():
				if child is MeshInstance3D:
					parts.append({"mesh": child.mesh, "material": child.material_override, "shadow": child.cast_shadow})
			_unit_mesh_cache[cache_key] = parts
			model.free()
	else:
		root = Models.build(str(u["unit_type"]), int(u["owner"]))
	root.set_meta("unit_type", u["unit_type"])

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

	if u["max_shields"] > 0.0:
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

func _spawn_burst(pos: Vector3, col: Color, radius: float, ttl: float, grow: float = 2.6) -> void:
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
	mi.material_override = m
	mi.position = pos
	fx_root.add_child(mi)
	# While paused (scripted captures) the effect is held still, so begin it part-way through.
	var start_ttl := ttl * (0.55 if SimEngine.paused else 1.0)
	active_fx.append({"node": mi, "mat": m, "ttl": start_ttl, "max": ttl, "kind": "burst", "col": col, "grow": grow})

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
	if rifle_fx:
		rifle_fx.clear()
	for i in range(active_fx.size() - 1, -1, -1):
		if active_fx[i]["kind"] != "scorch":
			if is_instance_valid(active_fx[i]["node"]):
				active_fx[i]["node"].queue_free()
			active_fx.remove_at(i)

func _update_fx(delta: float) -> void:
	for i in range(active_fx.size() - 1, -1, -1):
		var fx: Dictionary = active_fx[i]
		if not (SimEngine.paused and fx["kind"] != "scorch"):
			fx["ttl"] -= delta
		if fx["ttl"] <= 0.0 or not is_instance_valid(fx["node"]):
			if is_instance_valid(fx["node"]):
				fx["node"].queue_free()
			active_fx.remove_at(i)
			continue
		var t: float = 1.0 - float(fx["ttl"]) / float(fx["max"])
		var col: Color = fx["col"]
		match str(fx["kind"]):
			"burst":
				fx["mat"].albedo_color = Color(col.r, col.g, col.b, (1.0 - t) * col.a)
				fx["node"].scale = Vector3.ONE * lerpf(0.5, float(fx["grow"]), t)
			"scorch":
				fx["mat"].albedo_color = Color(col.r, col.g, col.b, col.a * clampf((1.0 - t) * 2.0, 0.0, 1.0))
			"beam":
				fx["mat"].albedo_color = Color(col.r, col.g, col.b, 1.0 - t)

func _weapon_color(owner_id: int, is_splash: bool) -> Color:
	if is_splash:
		return Color("#ffa534") if owner_id != 2 else Color("#b7f23a")
	match owner_id:
		1: return Color("#bfe0ff")
		2: return Color("#a3e635")
		_: return Color("#ffe27a")

func _on_projectile_fired(from_pos: Vector2, to_pos: Vector2, weapon_name: String, is_splash: bool, owner_id: int) -> void:
	if _skip_transient_fx() or active_fx.size() >= MAX_ACTIVE_FX or (not _effect_near_view(from_pos) and not _effect_near_view(to_pos)):
		return
	if weapon_name == "R-9 Carbine":
		rifle_fx.fire(Vector3(from_pos.x, SimEngine.get_elevation_at(from_pos), from_pos.y),
			Vector3(to_pos.x, SimEngine.get_elevation_at(to_pos), to_pos.y), owner_id)
		return
	var p1 := Vector3(from_pos.x, SimEngine.get_elevation_at(from_pos) + 1.3, from_pos.y)
	var p2 := Vector3(to_pos.x, SimEngine.get_elevation_at(to_pos) + 1.0, to_pos.y)
	var dist := p1.distance_to(p2)
	if dist < 0.2:
		return
	var col := _weapon_color(owner_id, is_splash)
	var beam := MeshInstance3D.new()
	var box := BoxMesh.new()
	var w := 0.22 if is_splash else 0.12
	box.size = Vector3(w, w, dist)
	beam.mesh = box
	var m := _fx_mat(col)
	beam.material_override = m
	fx_root.add_child(beam)
	beam.look_at_from_position((p1 + p2) * 0.5, p2, Vector3.UP)
	active_fx.append({"node": beam, "mat": m, "ttl": 0.16, "max": 0.16, "kind": "beam", "col": col, "grow": 0.0})
	_spawn_burst(p1, Color(col.r, col.g, col.b, 0.9), 0.35, 0.1, 1.6)
	_spawn_burst(p2, Color(col.r, col.g, col.b, 0.8), 1.4 if is_splash else 0.45, 0.22, 2.4 if is_splash else 1.8)

func _on_unit_phased(from_pos: Vector2, to_pos: Vector2, _tag: int) -> void:
	if _skip_transient_fx():
		return
	for p in [from_pos, to_pos]:
		_spawn_burst(Vector3(p.x, SimEngine.get_elevation_at(p) + 1.3, p.y), Color(0.4, 0.85, 1.0, 0.9), 0.9, 0.4, 2.6)

func _on_unit_destroyed(dead: Dictionary) -> void:
	if bool(dead.get("cancelled", false)):
		return
	var p: Vector2 = dead["pos"]
	if not _effect_near_view(p):
		return
	var base := Vector3(p.x, SimEngine.get_elevation_at(p), p.y)
	var rad := float(dead["radius"])
	var col := Color(1.0, 0.7, 0.3, 0.9)
	match str(dead.get("faction", "humans")):
		"monsters": col = Color(0.65, 0.92, 0.2, 0.9)
		"aliens": col = Color(0.5, 0.9, 1.0, 0.9)
	if not _skip_transient_fx():
		_spawn_burst(base + Vector3(0, rad * 0.8, 0), col, rad * (1.2 if dead["is_structure"] else 0.9), 0.55, 2.8)
		if dead["is_structure"]:
			_spawn_burst(base + Vector3(rad * 0.3, rad * 1.2, 0), Color(1.0, 0.85, 0.5, 0.8), rad * 0.8, 0.8, 2.2)
	_spawn_scorch(base, rad * (1.1 if dead["is_structure"] else 0.8))

func _effect_near_view(pos: Vector2) -> bool:
	# Conservative margin includes beams crossing the view and tall structures.
	# Offscreen combat still runs fully in the simulation, without allocating FX.
	return get_focus().distance_squared_to(pos) <= pow(cam_height * 1.5 + 12.0, 2)

# ---------------------------------------------------------------------------
# Projection helpers
# ---------------------------------------------------------------------------
func display_position(unit: Dictionary) -> Vector2:
	if SimEngine.paused or SimEngine.rts_mode == "backend" or SimEngine.match_state.get("status", "") == "finished":
		return unit.pos
	# Render one tick behind the sim, smoothly covering the fractional remainder.
	# The authoritative position and all combat/pathfinding remain unchanged.
	var alpha = clampf(SimEngine._accum_time / SimEngine.TICK_DT, 0.0, 1.0)
	return Vector2(unit.get("prev_pos", unit.pos)).lerp(unit.pos, alpha)

func world_to_screen(wpos: Vector2, y_offset: float = 0.0) -> Vector2:
	var elev := SimEngine.get_elevation_at(wpos) + y_offset
	return camera_3d.unproject_position(Vector3(wpos.x, elev, wpos.y))

func screen_to_world(spos: Vector2) -> Vector2:
	var orig := camera_3d.project_ray_origin(spos)
	var dir := camera_3d.project_ray_normal(spos)
	if absf(dir.y) < 0.0001:
		return Vector2(orig.x, orig.z)
	var guess := Vector2.ZERO
	var elev := 0.0
	for _i in range(3):
		var t := (elev - orig.y) / dir.y
		var hit := orig + dir * t
		guess = Vector2(hit.x, hit.z)
		elev = SimEngine.get_elevation_at(guess)
	return guess
