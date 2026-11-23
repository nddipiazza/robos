extends Node

const Models = preload("res://scripts/RTSModels.gd")
const PORTRAIT_SIZE := 240

signal portraits_ready

var portraits: Dictionary = {}
var ready_done := false

var _vp: SubViewport
var _cam: Camera3D

# Live tactical preview members
var _live_vp: SubViewport
var _live_cam: Camera3D
var _live_stage: Node3D
var _live_subject: Node3D
var _live_ring: MeshInstance3D
var _live_angle := 0.35
var _live_radius := 8.5
var _live_center := Vector3(0.0, 0.8, 0.0)
var _live_floating := false

func _ready() -> void:
	if DisplayServer.get_name() == "headless":
		ready_done = true
		return
	_generate_portraits.call_deferred()

func get_portrait(unit_id: String) -> Texture2D:
	return portraits.get(unit_id, null)

func load_art_texture(res_path: String) -> Texture2D:
	if DisplayServer.get_name() == "headless":
		return null
	if ResourceLoader.exists(res_path, "Texture2D"):
		var loaded = load(res_path)
		if loaded is Texture2D:
			return loaded
	if FileAccess.file_exists(res_path):
		var bytes := FileAccess.get_file_as_bytes(res_path)
		var img := Image.new()
		var ext := res_path.get_extension().to_lower()
		var err := ERR_FILE_UNRECOGNIZED
		if ext == "webp":
			err = img.load_webp_from_buffer(bytes)
		elif ext == "png":
			err = img.load_png_from_buffer(bytes)
		elif ext == "jpg" or ext == "jpeg":
			err = img.load_jpg_from_buffer(bytes)
		if err == OK and not img.is_empty():
			return ImageTexture.create_from_image(img)
	return null

func _needed_unit_ids() -> Array[String]:
	var ids: Array[String] = [
		"pioneer", "rifleman", "triage_specialist", "torchguard", "ridge_scout", "breacher",
		"cinder_runner", "rail_skimmer", "warden_walker", "howitzer", "atlas_walker",
		"rampart_transport", "sky_sentry", "kestrel_interceptor", "night_harrier", "dreadnought",
		"shade_agent", "sentinel_mine", "vortex_rover", "bastion_turret", "radar_beacon",
		"colony_hub", "field_bunker", "sentry_turret", "silo", "aether_tap",
		"muster_hall", "research_module", "quarantine_relay", "field_armory",
	]
	return ids

func _generate_portraits() -> void:
	_vp = SubViewport.new()
	_vp.size = Vector2i(PORTRAIT_SIZE, PORTRAIT_SIZE)
	_vp.own_world_3d = true
	_vp.transparent_bg = true
	_vp.msaa_3d = Viewport.MSAA_4X
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_vp)

	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#b8d4e3")
	env.ambient_light_energy = 0.85
	var we := WorldEnvironment.new()
	we.environment = env
	_vp.add_child(we)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-38.0, -32.0, 0.0)
	key_light.light_color = Color("#fff4e4")
	key_light.light_energy = 1.32
	_vp.add_child(key_light)

	var rim_light := DirectionalLight3D.new()
	rim_light.rotation_degrees = Vector3(-18.0, 148.0, 0.0)
	rim_light.light_color = Color("#54f0b4")
	rim_light.light_energy = 0.85
	_vp.add_child(rim_light)

	_cam = Camera3D.new()
	_cam.fov = 29.0
	_cam.near = 0.1
	_cam.far = 200.0
	_vp.add_child(_cam)

	_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw

	for unit_id in _needed_unit_ids():
		if not RTSData.units.has(unit_id):
			continue
		var model: Node3D = Models.build(unit_id, 1, false)
		_vp.add_child(model)
		_frame_camera(_cam, model, 1.04)
		for _attempt in range(2):
			_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
			await RenderingServer.frame_post_draw
			var img: Image = _vp.get_texture().get_image()
			if img and img.get_used_rect().has_area():
				portraits[unit_id] = ImageTexture.create_from_image(img)
				break
		model.queue_free()

	if is_instance_valid(_vp):
		_vp.queue_free()
	_vp = null
	ready_done = true
	portraits_ready.emit()

func build_live_preview(size: Vector2i) -> Control:
	if DisplayServer.get_name() == "headless":
		var placeholder := ColorRect.new()
		placeholder.color = Color("#081410")
		placeholder.custom_minimum_size = Vector2(size)
		return placeholder

	var container := SubViewportContainer.new()
	container.stretch = true
	container.custom_minimum_size = Vector2(size)
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_live_vp = SubViewport.new()
	_live_vp.size = size
	_live_vp.own_world_3d = true
	_live_vp.msaa_3d = Viewport.MSAA_2X
	_live_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	container.add_child(_live_vp)

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#0a1512")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#7ea696")
	env.ambient_light_energy = 0.72
	env.fog_enabled = true
	env.fog_light_color = Color("#11261e")
	env.fog_density = 0.018
	var we := WorldEnvironment.new()
	we.environment = env
	_live_vp.add_child(we)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-46.0, -36.0, 0.0)
	sun.light_color = Color("#ffe9cf")
	sun.light_energy = 1.35
	_live_vp.add_child(sun)

	var rim := DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-22.0, 142.0, 0.0)
	rim.light_color = Color("#3eff78")
	rim.light_energy = 0.72
	_live_vp.add_child(rim)

	_live_stage = Node3D.new()
	_live_vp.add_child(_live_stage)

	# Textured battlefield terrain pad + canyon plateau + thin RTS selection ring
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(36.0, 36.0)
	ground.mesh = plane
	var gmat := StandardMaterial3D.new()
	var badlands_tex := load_art_texture("res://assets/terrain/badlands.webp")
	if badlands_tex:
		gmat.albedo_texture = badlands_tex
		gmat.albedo_color = Color("#70946c")
		gmat.uv1_scale = Vector3(5.0, 5.0, 1.0)
	else:
		gmat.albedo_color = Color("#243628")
	gmat.roughness = 0.90
	ground.material_override = gmat
	_live_stage.add_child(ground)

	# Elevated canyon ridge backdrop & outcrops for authentic RTS battlefield depth
	var rock_mat := StandardMaterial3D.new()
	rock_mat.albedo_color = Color("#364538")
	if badlands_tex:
		rock_mat.albedo_texture = badlands_tex
	rock_mat.roughness = 0.88
	var cliff := MeshInstance3D.new()
	var cliff_box := BoxMesh.new()
	cliff_box.size = Vector3(14.0, 1.4, 5.5)
	cliff.mesh = cliff_box
	cliff.position = Vector3(-4.5, 0.7, -6.5)
	cliff.rotation.y = 0.35
	cliff.material_override = rock_mat
	_live_stage.add_child(cliff)

	for spec in [
		[Vector3(-3.8, 0.35, -2.9), Vector3(1.8, 0.9, 1.4), 0.4],
		[Vector3(4.2, 0.28, -2.5), Vector3(1.5, 0.7, 1.3), -0.5],
		[Vector3(-3.2, 0.22, 3.4), Vector3(1.2, 0.55, 1.1), 1.1],
	]:
		var rock := MeshInstance3D.new()
		var box := PrismMesh.new()
		box.size = spec[1]
		rock.mesh = box
		rock.position = spec[0]
		rock.rotation.y = spec[2]
		rock.material_override = rock_mat
		_live_stage.add_child(rock)

	var crystal_mat := StandardMaterial3D.new()
	crystal_mat.albedo_color = Color("#4be8ff")
	crystal_mat.emission_enabled = true
	crystal_mat.emission = Color("#24b8d6")
	crystal_mat.emission_energy_multiplier = 0.95
	for idx in 4:
		var shard := MeshInstance3D.new()
		var prism := CylinderMesh.new()
		prism.top_radius = 0.04
		prism.bottom_radius = 0.28
		prism.height = 1.10 + idx * 0.22
		prism.radial_segments = 6
		shard.mesh = prism
		shard.position = Vector3(3.4 + idx * 0.42, 0.48, 2.6 - idx * 0.32)
		shard.rotation = Vector3(0.18 * (idx - 1), idx * 0.8, -0.15)
		shard.material_override = crystal_mat
		_live_stage.add_child(shard)

	_live_ring = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 2.18
	torus.outer_radius = 2.24
	_live_ring.mesh = torus
	_live_ring.position = Vector3(0.0, 0.03, 0.0)
	var rmat := StandardMaterial3D.new()
	rmat.albedo_color = Color("#46ff72")
	rmat.emission_enabled = true
	rmat.emission = Color("#34e860")
	rmat.emission_energy_multiplier = 1.3
	_live_ring.material_override = rmat
	_live_stage.add_child(_live_ring)

	_live_cam = Camera3D.new()
	_live_cam.fov = 33.0
	_live_cam.near = 0.1
	_live_cam.far = 120.0
	_live_vp.add_child(_live_cam)

	set_process(true)
	return container

func show_live_unit(unit_id: String, accent_purchased: bool = false) -> void:
	if _live_stage == null or not RTSData.units.has(unit_id):
		return
	if _live_subject and is_instance_valid(_live_subject):
		_live_subject.queue_free()
	_live_subject = Node3D.new()
	_live_stage.add_child(_live_subject)

	var def: Dictionary = RTSData.units[unit_id]
	var is_struct: bool = bool(def.get("is_structure", false))
	var radius: float = float(def.get("radius", 1.0))
	_live_floating = unit_id in ["rampart_transport", "sky_sentry", "kestrel_interceptor", "night_harrier", "dreadnought", "rail_skimmer"]

	if not is_struct and radius <= 1.05:
		# Squad formation of 3 for compact infantry/rovers so the tactical preview feels alive!
		var offsets := [Vector3(0.0, 0.0, 0.55), Vector3(-1.35, 0.0, -0.75), Vector3(1.35, 0.0, -0.75)]
		for off in offsets:
			var m: Node3D = Models.build(unit_id, 1, false)
			m.position = off
			_live_subject.add_child(m)
	else:
		var single: Node3D = Models.build(unit_id, 1, false)
		_live_subject.add_child(single)

	var acc: Array = []
	_merged_aabb(_live_subject, Transform3D.IDENTITY, acc)
	var box: AABB = acc[0] if not acc.is_empty() else AABB(Vector3(-1, 0, -1), Vector3(2, 2, 2))
	_live_center = box.get_center()
	var span := maxf(2.4, box.size.length() * 0.54)
	_live_radius = span / sin(deg_to_rad(_live_cam.fov * 0.5)) * 1.12
	if _live_ring:
		var ring_scale := clampf(box.size.x * 0.48, 0.72, 1.95)
		_live_ring.scale = Vector3(ring_scale, 1.0, ring_scale)
		var rmat := _live_ring.material_override as StandardMaterial3D
		if rmat:
			var col := Color("#55eeff") if accent_purchased else Color("#46ff72")
			rmat.albedo_color = col
			rmat.emission = col
	_update_live_camera(0.0)

func _process(delta: float) -> void:
	if _live_vp == null or not is_instance_valid(_live_vp) or not _live_vp.get_parent().is_visible_in_tree():
		return
	_live_angle += delta * 0.38
	if _live_subject and is_instance_valid(_live_subject) and _live_floating:
		_live_subject.position.y = 0.16 + sin(_live_angle * 3.2) * 0.10
	_update_live_camera(_live_angle)

func _update_live_camera(angle: float) -> void:
	if _live_cam == null:
		return
	var dir := Vector3(cos(angle) * 0.84, 0.56, sin(angle) * 0.84).normalized()
	_live_cam.position = _live_center + dir * _live_radius
	_live_cam.look_at(_live_center, Vector3.UP)

func _merged_aabb(node: Node3D, xf: Transform3D, acc: Array) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		if mi.mesh:
			var box: AABB = xf * mi.mesh.get_aabb()
			if acc.is_empty():
				acc.append(box)
			else:
				acc[0] = (acc[0] as AABB).merge(box)
	for c in node.get_children():
		if c is Node3D and c.visible:
			_merged_aabb(c, xf * (c as Node3D).transform, acc)

func _frame_camera(cam: Camera3D, model: Node3D, pad: float) -> void:
	var acc: Array = []
	_merged_aabb(model, Transform3D.IDENTITY, acc)
	var box: AABB = acc[0] if not acc.is_empty() else AABB(Vector3(-1, 0, -1), Vector3(2, 2, 2))
	var center: Vector3 = box.get_center()
	var radius: float = maxf(0.6, box.size.length() * 0.5)
	var dist: float = radius / sin(deg_to_rad(cam.fov * 0.5)) * pad
	var dir := Vector3(0.80, 0.58, 1.0).normalized()
	cam.position = center + dir * dist
	cam.look_at(center, Vector3.UP)
