extends Node3D

# RTSWorld3D.gd — 2.5D Angled 3D Perspective Renderer for RobOS RTS (StarCraft II / Stormgate Camera)
# Renders the 64Hz SimEngine world in true 3D perspective (`fov = 42 deg`, pitched `-56 deg`):
# - Elevated 3D High-Ground Plateaus, Sloped Ramps, and Canyon Cliff Walls
# - Distinct 3D Meshes for HUMANS (Terran cyan/steel), MONSTERS (Swarm purple/chitin), and ALIENS (Golden/Plasma)
# - Ground Selection Tori, Mineral Crystals, Vespene Plumes, 3D Laser Beams, and Blink Teleport Rings.

var camera_3d: Camera3D
var dir_light: DirectionalLight3D
var world_env: WorldEnvironment

var terrain_root: Node3D
var resources_root: Node3D
var units_root: Node3D
var fx_root: Node3D

var unit_nodes: Dictionary = {}     # tag (int) -> Node3D
var resource_nodes: Dictionary = {} # tag (int) -> Node3D
var active_fx: Array[Dictionary] = []

var mat_cache: Dictionary = {}

func _ready() -> void:
	_setup_environment_and_camera()
	terrain_root = Node3D.new()
	terrain_root.name = "TerrainRoot"
	add_child(terrain_root)

	resources_root = Node3D.new()
	resources_root.name = "ResourcesRoot"
	add_child(resources_root)

	units_root = Node3D.new()
	units_root.name = "UnitsRoot"
	add_child(units_root)

	fx_root = Node3D.new()
	fx_root.name = "FXRoot"
	add_child(fx_root)

	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	SimEngine.projectile_fired.connect(_on_projectile_fired)
	SimEngine.unit_blinked.connect(_on_unit_blinked)
	_rebuild_static_3d_map()

func _setup_environment_and_camera() -> void:
	world_env = WorldEnvironment.new()
	var env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#070b14")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#475569")
	env.ambient_light_energy = 1.25
	world_env.environment = env
	add_child(world_env)

	dir_light = DirectionalLight3D.new()
	dir_light.rotation_degrees = Vector3(-58.0, -32.0, 0.0)
	dir_light.light_energy = 1.45
	dir_light.light_color = Color("#f8fafc")
	dir_light.shadow_enabled = true
	add_child(dir_light)

	# Classic StarCraft II / Stormgate 2.5D Angled 3D Perspective Camera (-56 degree pitch)
	camera_3d = Camera3D.new()
	camera_3d.fov = 42.0
	camera_3d.near = 1.0
	camera_3d.far = 400.0
	camera_3d.position = Vector3(64.0, 68.0, 92.0)
	camera_3d.rotation_degrees = Vector3(-56.0, 0.0, 0.0)
	camera_3d.current = true
	add_child(camera_3d)

func _get_mat(key: String, albedo: Color, emission: Color = Color.BLACK, metallic: float = 0.2, roughness: float = 0.6) -> StandardMaterial3D:
	if mat_cache.has(key):
		return mat_cache[key]
	var m = StandardMaterial3D.new()
	m.albedo_color = albedo
	m.metallic = metallic
	m.roughness = roughness
	if emission != Color.BLACK:
		m.emission_enabled = true
		m.emission = emission
		m.emission_energy_multiplier = 1.4
	mat_cache[key] = m
	return m

func _on_scenario_loaded(_name: String) -> void:
	_rebuild_static_3d_map()

func _rebuild_static_3d_map() -> void:
	for c in terrain_root.get_children():
		c.queue_free()
	for c in resources_root.get_children():
		c.queue_free()
	for c in units_root.get_children():
		c.queue_free()
	unit_nodes.clear()
	resource_nodes.clear()
	active_fx.clear()

	# Base Low-Ground Floor Mesh
	var floor_mi = MeshInstance3D.new()
	var floor_box = BoxMesh.new()
	floor_box.size = Vector3(SimEngine.map_width, 1.0, SimEngine.map_height)
	floor_mi.mesh = floor_box
	floor_mi.position = Vector3(SimEngine.map_width * 0.5, -0.5, SimEngine.map_height * 0.5)
	floor_mi.material_override = _get_mat("floor_low", Color("#0f172a"), Color.BLACK, 0.1, 0.85)
	terrain_root.add_child(floor_mi)

	# High-Ground Plateaus (Elevated 2.2 units up in 3D!)
	for hg in SimEngine.high_ground_zones:
		var hg_mi = MeshInstance3D.new()
		var hg_box = BoxMesh.new()
		hg_box.size = Vector3(hg.size.x, 2.2, hg.size.y)
		hg_mi.mesh = hg_box
		hg_mi.position = Vector3(hg.position.x + hg.size.x * 0.5, 1.1, hg.position.y + hg.size.y * 0.5)
		hg_mi.material_override = _get_mat("floor_high", Color("#1e293b"), Color.BLACK, 0.15, 0.75)
		terrain_root.add_child(hg_mi)

	# Sloped Ramps connecting High Ground and Low Ground
	for rmp in SimEngine.ramps:
		var rmp_mi = MeshInstance3D.new()
		var rmp_box = BoxMesh.new()
		rmp_box.size = Vector3(rmp.size.x, 0.6, rmp.size.y)
		rmp_mi.mesh = rmp_box
		rmp_mi.position = Vector3(rmp.position.x + rmp.size.x * 0.5, 1.0, rmp.position.y + rmp.size.y * 0.5)
		rmp_mi.rotation_degrees = Vector3(0.0, 0.0, -10.5)
		rmp_mi.material_override = _get_mat("ramp_mat", Color("#334155"), Color.BLACK, 0.2, 0.7)
		terrain_root.add_child(rmp_mi)

	# Canyon Cliff Walls
	for obs in SimEngine.terrain_obstacles:
		var obs_mi = MeshInstance3D.new()
		var obs_box = BoxMesh.new()
		obs_box.size = Vector3(obs.size.x, 5.2, obs.size.y)
		obs_mi.mesh = obs_box
		obs_mi.position = Vector3(obs.position.x + obs.size.x * 0.5, 2.6, obs.position.y + obs.size.y * 0.5)
		obs_mi.material_override = _get_mat("cliff_rock", Color("#334155"), Color.BLACK, 0.1, 0.9)
		terrain_root.add_child(obs_mi)

func sync_3d_entities(selected_tags: Array[int], delta: float) -> void:
	# 1. Sync Resource Nodes (Mineral Crystals & Vespene Geysers)
	for r_tag in SimEngine.resources.keys():
		var r = SimEngine.resources[r_tag]
		if not resource_nodes.has(r_tag):
			var r_node = _create_resource_node_3d(r)
			resources_root.add_child(r_node)
			resource_nodes[r_tag] = r_node
		var elev = SimEngine.get_elevation_at(r["pos"])
		resource_nodes[r_tag].position = Vector3(r["pos"].x, elev, r["pos"].y)

	# Remove depleted/deleted resources
	for r_tag in resource_nodes.keys():
		if not SimEngine.resources.has(r_tag):
			resource_nodes[r_tag].queue_free()
			resource_nodes.erase(r_tag)

	# 2. Sync Units & Structures
	for u_tag in SimEngine.units.keys():
		var u = SimEngine.units[u_tag]
		var u_node: Node3D
		if not unit_nodes.has(u_tag) or unit_nodes[u_tag].get_meta("unit_type", "") != u["unit_type"]:
			if unit_nodes.has(u_tag):
				unit_nodes[u_tag].queue_free()
			u_node = _create_unit_node_3d(u)
			units_root.add_child(u_node)
			unit_nodes[u_tag] = u_node
		else:
			u_node = unit_nodes[u_tag]

		var elev = SimEngine.get_elevation_at(u["pos"])
		u_node.position = Vector3(u["pos"].x, elev, u["pos"].y)
		u_node.rotation.y = -u["facing"]

		var sel_ring: MeshInstance3D = u_node.get_node_or_null("SelectionRing")
		if sel_ring:
			sel_ring.visible = selected_tags.has(u_tag)

		var shield_sphere: MeshInstance3D = u_node.get_node_or_null("ShieldBubble")
		if shield_sphere:
			shield_sphere.visible = (u["shields"] > 0.5)

	for u_tag in unit_nodes.keys():
		if not SimEngine.units.has(u_tag):
			unit_nodes[u_tag].queue_free()
			unit_nodes.erase(u_tag)

	# 3. Update temporary 3D FX (Laser beams & Blink rings)
	for i in range(active_fx.size() - 1, -1, -1):
		active_fx[i]["ttl"] -= delta
		if active_fx[i]["ttl"] <= 0.0:
			if is_instance_valid(active_fx[i]["node"]):
				active_fx[i]["node"].queue_free()
			active_fx.remove_at(i)

func _create_resource_node_3d(r: Dictionary) -> Node3D:
	var root = Node3D.new()
	if r["resource_type"] == "mineral_field":
		for i in range(3):
			var shard = MeshInstance3D.new()
			var prism = PrismMesh.new()
			prism.size = Vector3(1.2, 2.6 - i * 0.4, 1.2)
			shard.mesh = prism
			shard.position = Vector3((i - 1) * 0.75, 1.2, (i % 2) * 0.4)
			shard.rotation_degrees = Vector3(12.0 * (i - 1), i * 45.0, 15.0 * (1 - i))
			shard.material_override = _get_mat("mineral_crystal", Color("#38bdf8"), Color("#0284c7"), 0.6, 0.2)
			root.add_child(shard)
	else:
		var crater = MeshInstance3D.new()
		var cyl = CylinderMesh.new()
		cyl.top_radius = 1.8
		cyl.bottom_radius = 2.6
		cyl.height = 1.4
		crater.mesh = cyl
		crater.position = Vector3(0.0, 0.7, 0.0)
		crater.material_override = _get_mat("vespene_geyser", Color("#10b981"), Color("#059669"), 0.3, 0.5)
		root.add_child(crater)
	return root

func _create_unit_node_3d(u: Dictionary) -> Node3D:
	var root = Node3D.new()
	root.set_meta("unit_type", u["unit_type"])
	var rad = float(u["radius"])
	var faction = str(u.get("faction", "humans"))

	# Selection Ring (3D Ground Torus)
	var sel_mi = MeshInstance3D.new()
	sel_mi.name = "SelectionRing"
	var torus = TorusMesh.new()
	torus.inner_radius = rad + 0.15
	torus.outer_radius = rad + 0.42
	sel_mi.mesh = torus
	sel_mi.position = Vector3(0.0, 0.12, 0.0)
	var ring_col = Color("#22c55e") if u["owner"] == 1 else (Color("#ef4444") if u["owner"] == 2 else Color("#facc15"))
	sel_mi.material_override = _get_mat("sel_" + str(u["owner"]), ring_col, ring_col * 0.6, 0.1, 0.4)
	sel_mi.visible = false
	root.add_child(sel_mi)

	# Faction Palette
	var base_col = Color("#0ea5e9")
	var accent_col = Color("#bae6fd")
	if faction == "monsters":
		base_col = Color("#9333ea") if u["unit_type"] != "roach" else Color("#65a30d")
		accent_col = Color("#f0abfc")
	elif faction == "aliens":
		base_col = Color("#f59e0b")
		accent_col = Color("#38bdf8")

	if u["is_structure"]:
		var body_mi = MeshInstance3D.new()
		if faction == "aliens":
			var prism = PrismMesh.new()
			var h = 4.2 if u["unit_type"] == "nexus" else 3.4
			prism.size = Vector3(rad * 1.9, h, rad * 1.9)
			body_mi.mesh = prism
			body_mi.position = Vector3(0.0, h * 0.5, 0.0)
		elif faction == "monsters":
			var sph = SphereMesh.new()
			sph.radius = rad * 0.95
			sph.height = rad * 1.6
			body_mi.mesh = sph
			body_mi.position = Vector3(0.0, rad * 0.7, 0.0)
		else:
			var box = BoxMesh.new()
			var h = 0.35 if u["is_walkable_structure"] else (3.6 if u["unit_type"] == "command_center" else 2.5)
			box.size = Vector3(rad * 1.85, h, rad * 1.85)
			body_mi.mesh = box
			body_mi.position = Vector3(0.0, h * 0.5, 0.0)
		body_mi.material_override = _get_mat("struct_" + u["unit_type"], base_col, accent_col * 0.15, 0.5, 0.4)
		root.add_child(body_mi)
	else:
		# Mobile Unit 3D Silhouette
		var body_mi = MeshInstance3D.new()
		if u["unit_type"] == "colossus":
			# Tall Alien Colossus Walker towering over cliffs!
			var cyl = CylinderMesh.new()
			cyl.top_radius = 1.3
			cyl.bottom_radius = 0.7
			cyl.height = 5.5
			body_mi.mesh = cyl
			body_mi.position = Vector3(0.0, 2.75, 0.0)
		elif u["unit_type"] in ["siege_tank", "siege_tank_sieged"]:
			var hull = BoxMesh.new()
			hull.size = Vector3(rad * 1.7, 1.3, rad * 1.4)
			body_mi.mesh = hull
			body_mi.position = Vector3(0.0, 0.65, 0.0)
			# Cannon Turret
			var barrel = MeshInstance3D.new()
			var bcyl = CylinderMesh.new()
			bcyl.top_radius = 0.25
			bcyl.bottom_radius = 0.3
			bcyl.height = 2.8 if u["unit_type"] == "siege_tank_sieged" else 2.0
			barrel.mesh = bcyl
			barrel.rotation_degrees = Vector3(0.0, 0.0, -90.0)
			barrel.position = Vector3(1.2, 1.4, 0.0)
			barrel.material_override = _get_mat("tank_barrel", accent_col, Color.BLACK, 0.7, 0.3)
			root.add_child(barrel)
		elif faction == "monsters":
			var cap = SphereMesh.new()
			cap.radius = rad * 0.9
			cap.height = rad * 1.3
			body_mi.mesh = cap
			body_mi.position = Vector3(0.0, rad * 0.65, 0.0)
		elif faction == "aliens":
			var aprism = PrismMesh.new()
			aprism.size = Vector3(rad * 1.6, 2.2, rad * 1.5)
			body_mi.mesh = aprism
			body_mi.position = Vector3(0.0, 1.1, 0.0)
		else:
			var ucyl = CylinderMesh.new()
			ucyl.top_radius = rad * 0.75
			ucyl.bottom_radius = rad * 0.85
			ucyl.height = 1.9
			body_mi.mesh = ucyl
			body_mi.position = Vector3(0.0, 0.95, 0.0)
			# Forward visor/weapon barrel
			var gun = MeshInstance3D.new()
			var gbox = BoxMesh.new()
			gbox.size = Vector3(rad * 1.1, 0.3, 0.3)
			gun.mesh = gbox
			gun.position = Vector3(rad * 0.7, 1.1, 0.0)
			gun.material_override = _get_mat("gun_visor", Color.WHITE, Color("#38bdf8") * 0.4)
			root.add_child(gun)

		body_mi.material_override = _get_mat("unit_" + u["unit_type"], base_col, accent_col * 0.2, 0.45, 0.45)
		root.add_child(body_mi)

	# Translucent Plasma Shield Bubble for Aliens
	if u["max_shields"] > 0.0:
		var sh_mi = MeshInstance3D.new()
		sh_mi.name = "ShieldBubble"
		var ssph = SphereMesh.new()
		ssph.radius = rad * 1.25
		ssph.height = rad * 2.5
		sh_mi.mesh = ssph
		sh_mi.position = Vector3(0.0, rad * 1.1, 0.0)
		var smat = StandardMaterial3D.new()
		smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		smat.albedo_color = Color(0.22, 0.74, 0.97, 0.22)
		smat.emission_enabled = true
		smat.emission = Color("#38bdf8")
		smat.emission_energy_multiplier = 0.8
		sh_mi.material_override = smat
		root.add_child(sh_mi)

	return root

func _on_projectile_fired(from_pos: Vector2, to_pos: Vector2, _weapon_name: String, is_splash: bool, owner_id: int) -> void:
	var p1 = Vector3(from_pos.x, SimEngine.get_elevation_at(from_pos) + 1.2, from_pos.y)
	var p2 = Vector3(to_pos.x, SimEngine.get_elevation_at(to_pos) + 0.9, to_pos.y)
	var dist = p1.distance_to(p2)
	if dist < 0.1:
		return
	var beam = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = Vector3(0.18 if not is_splash else 0.38, 0.18 if not is_splash else 0.38, dist)
	beam.mesh = box
	var col = Color("#38bdf8") if owner_id == 1 else (Color("#a3e635") if owner_id == 2 else Color("#facc15"))
	if is_splash:
		col = Color("#f97316")
	beam.material_override = _get_mat("beam_" + str(owner_id) + str(is_splash), col, col, 0.0, 0.2)
	fx_root.add_child(beam)
	beam.look_at_from_position((p1 + p2) * 0.5, p2, Vector3.UP)
	active_fx.append({"node": beam, "ttl": 0.18})

func _on_unit_blinked(from_pos: Vector2, to_pos: Vector2, _tag: int) -> void:
	for p in [from_pos, to_pos]:
		var ring = MeshInstance3D.new()
		var torus = TorusMesh.new()
		torus.inner_radius = 0.9
		torus.outer_radius = 1.4
		ring.mesh = torus
		ring.position = Vector3(p.x, SimEngine.get_elevation_at(p) + 0.5, p.y)
		ring.material_override = _get_mat("blink_fx", Color("#38bdf8"), Color("#38bdf8"), 0.1, 0.1)
		fx_root.add_child(ring)
		active_fx.append({"node": ring, "ttl": 0.35})

func world_to_screen(wpos: Vector2, y_offset: float = 0.0) -> Vector2:
	var elev = SimEngine.get_elevation_at(wpos) + y_offset
	return camera_3d.unproject_position(Vector3(wpos.x, elev, wpos.y))

func screen_to_world(spos: Vector2) -> Vector2:
	var orig = camera_3d.project_ray_origin(spos)
	var dir = camera_3d.project_ray_normal(spos)
	if abs(dir.y) < 0.0001:
		return Vector2(orig.x, orig.z)
	var t = -orig.y / dir.y
	var hit = orig + dir * t
	return Vector2(hit.x, hit.z)
