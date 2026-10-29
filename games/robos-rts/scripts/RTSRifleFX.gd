extends Node3D

# Cosmetic only. Damage has already landed when fire() is called. Four fixed
# draw batches and three shared, shadow-free lights replace per-shot resources.
const CAPACITY := 128
const LIFETIME := 0.14
const TRACER_LENGTH := 0.28
var shots: Array[Dictionary] = []
var batches: Dictionary = {}
var lights: Array[OmniLight3D] = []
var warmup_complete := false
var camera: Camera3D

func _ready() -> void:
	var material = StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.vertex_color_use_as_albedo = true
	var box = BoxMesh.new()
	box.size = Vector3.ONE
	var muzzle_mesh = QuadMesh.new()
	muzzle_mesh.size = Vector2.ONE
	var muzzle_material = material.duplicate()
	muzzle_material.albedo_texture = _muzzle_texture()
	muzzle_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_batch("flash", muzzle_mesh, muzzle_material, CAPACITY)
	_batch("tracer", box, material, CAPACITY)
	_batch("spark", box, material, CAPACITY * 3)
	var halo = QuadMesh.new()
	halo.size = Vector2.ONE
	var halo_material = material.duplicate()
	var image = Image.create(32, 32, false, Image.FORMAT_RGBA8)
	for y in range(32):
		for x in range(32):
			var distance = Vector2(x - 15.5, y - 15.5).length() / 15.5
			image.set_pixel(x, y, Color(1, 1, 1, pow(maxf(0.0, 1.0 - distance), 2)))
	halo_material.albedo_texture = ImageTexture.create_from_image(image)
	halo_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_batch("halo", halo, halo_material, CAPACITY * 2)
	for _i in range(3):
		var light = OmniLight3D.new()
		light.light_color = Color("#ffbd65")
		light.omni_range = 6.0
		light.shadow_enabled = false
		light.visible = false
		add_child(light)
		lights.append(light)
	camera = get_parent().camera_3d
	call_deferred("_warm_up")

func _muzzle_texture() -> Texture2D:
	# A tapered jet with two small gas lobes, feathered into transparency. The
	# narrow white core and amber rim replace solid spherical "explosions".
	var image = Image.create(96, 64, false, Image.FORMAT_RGBA8)
	for y in range(64):
		for x in range(96):
			var p = Vector2(float(x) / 95.0, float(y) / 63.0)
			var d = p - Vector2(0.28, 0.5)
			var core = exp(-3.0 * (pow(d.x / 0.14, 2) + pow(d.y / 0.14, 2)))
			var jet = exp(-3.0 * (pow((p.x - 0.52) / 0.40, 2) + pow(d.y / 0.065, 2)))
			var lobes = 0.0
			for sign_y in [-1.0, 1.0]:
				var q = d.rotated(sign_y * 0.65) - Vector2(0.06, 0)
				lobes += exp(-3.0 * (pow(q.x / 0.18, 2) + pow(q.y / 0.045, 2))) * 0.6
			var alpha = clampf(core + jet * 0.85 + lobes, 0, 1)
			var color = Color("#ff8c28").lerp(Color("#fff8df"), clampf(core + jet * 0.65, 0, 1))
			color.a = alpha
			image.set_pixel(x, y, color)
	return ImageTexture.create_from_image(image)

func _warm_up() -> void:
	if DisplayServer.get_name() == "headless":
		warmup_complete = true
		return
	# Submit the transparent batches and each local-light variant while the
	# arena is still paused. Driver compilation belongs at loading, not firing.
	for count in range(4):
		var focus: Vector2 = get_parent().get_focus()
		var at = Vector3(focus.x, 1.0, focus.y)
		for key in batches:
			_place(key, 0, at, Vector3.ONE, Color(1, 1, 1, 0))
			batches[key].visible_instance_count = 1
		for index in range(lights.size()):
			lights[index].visible = index < count
			lights[index].position = at
			lights[index].light_energy = 0.001
		await RenderingServer.frame_post_draw
	clear()
	warmup_complete = true

func _batch(key: String, mesh: Mesh, material: Material, capacity: int) -> void:
	var node = MultiMeshInstance3D.new()
	node.multimesh = MultiMesh.new()
	node.multimesh.transform_format = MultiMesh.TRANSFORM_3D
	node.multimesh.use_colors = true
	node.multimesh.mesh = mesh
	node.multimesh.instance_count = capacity
	node.multimesh.visible_instance_count = 0
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	batches[key] = node.multimesh

func clear() -> void:
	shots.clear()
	for batch in batches.values():
		batch.visible_instance_count = 0
	for light in lights:
		light.visible = false

func fire(from: Vector3, to: Vector3, owner: int) -> void:
	if shots.size() >= CAPACITY:
		return
	var direction = Vector3(to.x - from.x, 0, to.z - from.z).normalized()
	# The model's barrel ends at local (1.2, 1.02, 0.18), facing +X.
	var muzzle = from + direction * 1.2 + Vector3(-direction.z, 0, direction.x) * 0.18 + Vector3.UP * 1.02
	shots.append({"from": muzzle, "to": to + Vector3.UP, "age": 0.0, "owner": owner})

func _place(key: String, index: int, at: Vector3, scale: Vector3, color: Color, basis: Basis = Basis.IDENTITY) -> void:
	var batch: MultiMesh = batches[key]
	batch.set_instance_transform(index, Transform3D(basis.scaled(scale), at))
	batch.set_instance_color(index, color)

func _segment(key: String, index: int, from: Vector3, to: Vector3, width: float, color: Color) -> void:
	var direction = to - from
	_place(key, index, (from + to) * 0.5, Vector3(width, width, maxf(0.001, direction.length())), color,
		Basis.looking_at(direction.normalized(), Vector3.UP))

func _process(delta: float) -> void:
	if not warmup_complete:
		return
	var counts = {"flash": 0, "tracer": 0, "spark": 0, "halo": 0}
	var light_positions = [Vector3.ZERO, Vector3.ZERO, Vector3.ZERO]
	var light_counts = [0, 0, 0]
	var light_energy = [0.0, 0.0, 0.0]
	for i in range(shots.size() - 1, -1, -1):
		if not SimEngine.paused:
			shots[i].age += delta
		var shot = shots[i]
		var age: float = shot.age
		if age >= LIFETIME:
			shots.remove_at(i)
			continue
		var muzzle: Vector3 = shot.from
		var impact: Vector3 = shot.to
		var view_basis = camera.global_transform.basis if camera else Basis.IDENTITY
		if age < 0.04:
			var alpha = pow(1.0 - age / 0.04, 0.7)
			var direction = (impact - muzzle).normalized()
			var screen_direction = Vector2(direction.dot(view_basis.x), direction.dot(view_basis.y))
			var muzzle_basis = view_basis * Basis(Vector3.BACK, screen_direction.angle())
			_place("flash", counts.flash, muzzle + direction * 0.18, Vector3(1.1, 0.7, 1) * (0.8 + alpha * 0.2), Color(1, 1, 1, alpha), muzzle_basis)
			counts.flash += 1
			_place("halo", counts.halo, Vector3(muzzle.x, muzzle.y - 0.97, muzzle.z), Vector3(2.1, 2.1, 2.1), Color(1, 0.55, 0.15, alpha * 0.18), Basis(Vector3.RIGHT, -PI * 0.5))
			counts.halo += 1
			var index = clampi(int(shot.owner) - 1, 0, 2)
			light_positions[index] += muzzle
			light_counts[index] += 1
			light_energy[index] = maxf(light_energy[index], alpha * 0.55)
		# A short moving streak is cosmetic: no projectile object or damage delay.
		var distance = muzzle.distance_to(impact)
		var travel = maxf(0.02, distance / 180.0)
		if age >= 0.012 and age < travel + 0.012:
			var head = clampf((age - 0.012) / travel, 0.001, 1.0)
			var tail = maxf(0.0, head - minf(0.08, TRACER_LENGTH / maxf(distance, 0.01)))
			_segment("tracer", counts.tracer, muzzle.lerp(impact, tail), muzzle.lerp(impact, head), 0.018, Color(1, 0.86, 0.6, 0.55))
			counts.tracer += 1
		if age < 0.07:
			var alpha = 1.0 - age / 0.07
			_place("halo", counts.halo, impact, Vector3(0.4, 0.4, 0.4), Color(1, 0.7, 0.3, alpha * 0.65), view_basis)
			counts.halo += 1
			for j in range(3):
				var direction = Vector3(cos(j * TAU / 3), 0.5, sin(j * TAU / 3))
				var tip = impact + direction * (0.07 + age * 4.0)
				_segment("spark", counts.spark, tip - direction * 0.10, tip, 0.015, Color(1, 0.7, 0.3, alpha))
				counts.spark += 1
	for key in counts:
		batches[key].visible_instance_count = counts[key]
	for index in range(lights.size()):
		lights[index].visible = light_counts[index] > 0
		if light_counts[index] > 0:
			lights[index].position = light_positions[index] / float(light_counts[index])
			lights[index].light_energy = light_energy[index]
