extends Node

# RTSIcons.gd — renders a portrait for every unit/structure type from its own 3D model.
# One offscreen SubViewport is reused; each type takes one frame. Skipped in headless mode.

const Models = preload("res://scripts/RTSModels.gd")
const ICON_SIZE := 192

signal icons_ready

var icons: Dictionary = {}
var is_ready: bool = false

var _vp: SubViewport
var _cam: Camera3D

func _ready() -> void:
	if DisplayServer.get_name() == "headless":
		return
	_generate.call_deferred()

func get_icon(type_id: String) -> Texture2D:
	return icons.get(type_id, null)

func _owner_for_faction(faction: String) -> int:
	match faction:
		"monsters": return 2
		"aliens": return 3
	return 1

func _generate() -> void:
	_vp = SubViewport.new()
	_vp.size = Vector2i(ICON_SIZE, ICON_SIZE)
	_vp.own_world_3d = true
	_vp.transparent_bg = true
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_vp)

	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#d7dee9")
	env.ambient_light_energy = 0.8
	var we := WorldEnvironment.new()
	we.environment = env
	_vp.add_child(we)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-42.0, -28.0, 0.0)
	light.light_energy = 1.15
	_vp.add_child(light)

	_cam = Camera3D.new()
	_cam.fov = 30.0
	_cam.near = 0.1
	_cam.far = 200.0
	_vp.add_child(_cam)

	for type_id in RTSData.units.keys():
		var def: Dictionary = RTSData.units[type_id]
		var model: Node3D = Models.build(str(type_id), _owner_for_faction(str(def.get("faction", "humans"))))
		_vp.add_child(model)
		_frame_camera(model)
		_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
		await RenderingServer.frame_post_draw
		var img: Image = _vp.get_texture().get_image()
		if img:
			icons[type_id] = ImageTexture.create_from_image(img)
		model.queue_free()

	_vp.queue_free()
	is_ready = true
	emit_signal("icons_ready")

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
		if c is Node3D:
			_merged_aabb(c, xf * (c as Node3D).transform, acc)

func _frame_camera(model: Node3D) -> void:
	var acc: Array = []
	_merged_aabb(model, Transform3D.IDENTITY, acc)
	var box: AABB = acc[0] if not acc.is_empty() else AABB(Vector3(-1, 0, -1), Vector3(2, 2, 2))
	var center: Vector3 = box.get_center()
	var radius: float = box.size.length() * 0.5
	var dist: float = radius / sin(deg_to_rad(_cam.fov * 0.5)) * 1.02
	var dir := Vector3(0.82, 0.62, 1.0).normalized()
	_cam.position = center + dir * dist
	_cam.look_at(center, Vector3.UP)
