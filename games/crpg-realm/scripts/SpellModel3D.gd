extends Node2D
class_name SpellModel3D

# RobOS cRPG 3D Spell Visual Effects & Projectile Renderer
# Renders 3D spell VFX/projectile models in an anti-aliased SubViewport
# and supports linear/arcing projectile movement, spinning runes, and pulsing auras.

@export var spell_asset_ref: String = ""
@export var spell_vfx_type: String = "projectile" # projectile, aura, burst, beam
@export var spell_scale_multiplier: float = 1.0
@export var spell_tint: Color = Color.WHITE

var sub_viewport: SubViewport = null
var camera_3d: Camera3D = null
var model_pivot: Node3D = null
var display_sprite: Sprite2D = null
var loaded_model_node: Node3D = null

var is_animating: bool = false
var anim_timer: float = 0.0
var spin_speed: float = 4.0
var pulse_speed: float = 6.0

func _init() -> void:
	name = "SpellModel3D"

func _ready() -> void:
	_setup_viewport_pipeline()
	if spell_asset_ref != "" or spell_vfx_type != "":
		setup_spell(spell_asset_ref, spell_vfx_type, spell_scale_multiplier, spell_tint)

func _setup_viewport_pipeline() -> void:
	if sub_viewport:
		return

	sub_viewport = SubViewport.new()
	sub_viewport.name = "SpellSubViewport"
	sub_viewport.size = Vector2i(128, 128)
	sub_viewport.transparent_bg = true
	sub_viewport.own_world_3d = true
	sub_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	sub_viewport.msaa_3d = Viewport.MSAA_4X
	add_child(sub_viewport)

	# 3D Camera looking directly at spell center
	camera_3d = Camera3D.new()
	camera_3d.name = "SpellCamera3D"
	camera_3d.position = Vector3(0.0, 1.2, 1.6)
	camera_3d.look_at_from_position(Vector3(0.0, 1.2, 1.6), Vector3(0.0, 0.0, 0.0), Vector3.UP)
	camera_3d.fov = 40.0
	camera_3d.near = 0.05
	camera_3d.far = 15.0
	sub_viewport.add_child(camera_3d)

	# Arcane Light
	var light = DirectionalLight3D.new()
	light.name = "SpellKeyLight"
	light.rotation_degrees = Vector3(-45.0, 30.0, 0.0)
	light.light_color = Color(1.0, 0.98, 0.95)
	light.light_energy = 1.4
	sub_viewport.add_child(light)

	var fill = OmniLight3D.new()
	fill.name = "SpellFillLight"
	fill.position = Vector3(0, 0, 1.0)
	fill.light_color = Color(0.8, 0.9, 1.0)
	fill.light_energy = 0.8
	fill.omni_range = 5.0
	sub_viewport.add_child(fill)

	# Model Pivot for spinning and pulsing
	model_pivot = Node3D.new()
	model_pivot.name = "SpellPivot"
	sub_viewport.add_child(model_pivot)

	# Display 2D Sprite displaying the ViewportTexture
	display_sprite = Sprite2D.new()
	display_sprite.name = "SpellSprite"
	display_sprite.texture = sub_viewport.get_texture()
	display_sprite.centered = true
	add_child(display_sprite)

func _process(delta: float) -> void:
	if not model_pivot:
		return

	anim_timer += delta
	# Continuous 3D rotation / spinning
	model_pivot.rotation.y += spin_speed * delta

	# Gentle pulsing scale
	if spell_vfx_type == "aura" or spell_vfx_type == "burst":
		var pulse = 1.0 + sin(anim_timer * pulse_speed) * 0.08
		model_pivot.scale = Vector3.ONE * (0.85 * spell_scale_multiplier * pulse)

func setup_spell(asset_path: String, vfx_type: String = "projectile", scale_mul: float = 1.0, tint: Color = Color.WHITE) -> void:
	spell_asset_ref = asset_path
	spell_vfx_type = vfx_type
	spell_scale_multiplier = scale_mul
	spell_tint = tint

	if not sub_viewport:
		_setup_viewport_pipeline()

	if loaded_model_node and is_instance_valid(loaded_model_node):
		loaded_model_node.queue_free()
		loaded_model_node = null

	var resolved_path = _resolve_spell_path(asset_path, vfx_type)
	var loaded_scene: Node = null

	if resolved_path != "":
		loaded_scene = _load_glb_scene(resolved_path)

	if loaded_scene:
		loaded_model_node = loaded_scene as Node3D
		if loaded_model_node:
			model_pivot.add_child(loaded_model_node)
			loaded_model_node.scale = Vector3.ONE * (0.85 * spell_scale_multiplier)
			if tint != Color.WHITE:
				_apply_tint_to_meshes(loaded_model_node, tint)
			print("✨ [SpellModel3D] Loaded 3D Spell Model: ", resolved_path)
			return

	# Fallback procedural spell mesh if GLB missing
	_build_fallback_spell_mesh(vfx_type, tint)

# --- FACTORY STATIC HELPERS (Reusable 3D Spell VFX API) ---

static func cast_spell_projectile(parent: Node, spell_id: String, start_pos: Vector2, target_pos: Vector2, speed: float = 700.0, on_hit: Callable = Callable()) -> Node2D:
	var script = load("res://scripts/SpellModel3D.gd")
	var fx = script.new()
	fx.name = "SpellProjectile_" + spell_id
	parent.add_child(fx)
	var tint = Color(1.0, 0.4, 0.1) if "fire" in spell_id else (Color(0.2, 0.7, 1.0) if "missile" in spell_id else (Color(0.6, 0.9, 1.0) if "frost" in spell_id else Color.WHITE))
	fx.setup_spell(spell_id, "projectile", 1.0, tint)
	fx.play_projectile(start_pos, target_pos, speed, on_hit)
	return fx

static func detonate_spell_explosion(parent: Node, spell_id: String, hit_pos: Vector2, radius: float = 180.0, duration: float = 0.55, on_complete: Callable = Callable()) -> Node2D:
	var script = load("res://scripts/SpellModel3D.gd")
	var fx = script.new()
	fx.name = "SpellExplosion_" + spell_id
	parent.add_child(fx)
	var asset = "res://assets/models/spell_fireball_explosion.glb" if "fire" in spell_id else ("res://assets/models/spell_water_splash.glb" if "water" in spell_id else "res://assets/models/spell_dispel_purge.glb")
	var tint = Color(1.0, 0.35, 0.05) if "fire" in spell_id else (Color(0.2, 0.65, 0.95) if "water" in spell_id else Color(0.75, 0.4, 0.98))
	fx.setup_spell(asset, "burst", 1.4, tint)
	fx.play_burst_explosion(hit_pos, radius, duration, on_complete)
	return fx

static func spawn_spell_aura(parent: Node, spell_id: String, center_pos: Vector2, radius: float = 120.0, duration: float = 3.0, on_complete: Callable = Callable()) -> Node2D:
	var script = load("res://scripts/SpellModel3D.gd")
	var fx = script.new()
	fx.name = "SpellAura_" + spell_id
	parent.add_child(fx)
	fx.setup_spell(spell_id, "aura", clamp(radius / 90.0, 1.0, 2.5), Color.WHITE)
	fx.play_area_aura(center_pos, duration, on_complete)
	return fx

func play_projectile(start_pos: Vector2, target_pos: Vector2, speed: float = 450.0, on_hit: Callable = Callable()) -> void:
	global_position = start_pos
	var distance = start_pos.distance_to(target_pos)
	var travel_time = max(0.1, distance / speed)

	# Calculate rotation towards target in 2D
	var dir = start_pos.direction_to(target_pos)
	rotation = dir.angle()

	var tween = create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "global_position", target_pos, travel_time)
	tween.tween_callback(func():
		if on_hit.is_valid():
			on_hit.call()
		_play_impact_and_free()
	)

func play_burst_explosion(pos: Vector2, radius: float = 180.0, duration: float = 0.55, on_complete: Callable = Callable()) -> void:
	global_position = pos
	spin_speed = 6.0
	pulse_speed = 8.0
	scale = Vector2(0.25, 0.25)
	modulate = Color(1.8, 1.2, 1.0, 1.0)
	
	# Target scale proportional to 180px radius
	var target_scale_val = clamp(radius / 75.0, 1.2, 3.2) * spell_scale_multiplier
	var target_scale = Vector2(target_scale_val, target_scale_val)

	var tween = create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(self, "scale", target_scale, duration * 0.45)
	tween.parallel().tween_property(self, "rotation", PI * 0.75, duration)
	tween.tween_interval(duration * 0.1)
	tween.tween_property(self, "modulate:a", 0.0, duration * 0.45)
	tween.tween_callback(func():
		if on_complete.is_valid():
			on_complete.call()
		queue_free()
	)

func play_area_aura(pos: Vector2, duration: float = 3.0, on_complete: Callable = Callable()) -> void:
	global_position = pos
	spin_speed = 2.0
	pulse_speed = 4.0
	modulate = Color(1, 1, 1, 0)
	var tween = create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 0.3)
	tween.tween_interval(max(0.5, duration - 0.6))
	tween.tween_property(self, "modulate:a", 0.0, 0.3)
	tween.tween_callback(func():
		if on_complete.is_valid():
			on_complete.call()
		queue_free()
	)

func _play_impact_and_free() -> void:
	var tween = create_tween()
	tween.tween_property(self, "scale", scale * 1.5, 0.15)
	tween.parallel().tween_property(self, "modulate:a", 0.0, 0.15)
	tween.tween_callback(queue_free)

func _resolve_spell_path(path: String, vfx_type: String) -> String:
	if path != "" and (path.ends_with(".glb") or path.ends_with(".gltf")):
		var check_p = path
		if not check_p.begins_with("res://") and not check_p.begins_with("/"):
			check_p = "res://" + check_p.trim_prefix("/")
		if FileAccess.file_exists(check_p) or ResourceLoader.exists(check_p):
			return check_p

	var p = (path + " " + vfx_type).to_lower()
	if "explosion" in p or "detonat" in p:
		return "res://assets/models/spell_fireball_explosion.glb"
	elif "fireball" in p or "fire" in p or "flame" in p or "ignis" in p or "blast" in p:
		if vfx_type == "burst":
			return "res://assets/models/spell_fireball_explosion.glb"
		return "res://assets/models/spell_fireball_projectile.glb"
	elif "water" in p or "splash" in p or "hydro" in p or "tidal" in p:
		return "res://assets/models/spell_water_splash.glb"
	elif "blizzard" in p or "vortex" in p or "cyclone" in p:
		return "res://assets/models/spell_blizzard_vortex.glb"
	elif "dispel" in p or "purge" in p or "counter" in p or "null" in p or "abjur" in p:
		return "res://assets/models/spell_dispel_purge.glb"
	elif "missile" in p or "magic_missile" in p or "arcane" in p or "force" in p:
		return "res://assets/models/spell_magic_missile_orb.glb"
	elif "heal" in p or "cure" in p or "glyph" in p or "holy" in p or "restore" in p:
		return "res://assets/models/spell_healing_glyph.glb"
	elif "lightning" in p or "spark" in p or "shock" in p or "thunder" in p or "electric" in p:
		return "res://assets/models/spell_lightning_spark.glb"
	elif "frost" in p or "ice" in p or "cold" in p or "shard" in p:
		return "res://assets/models/spell_frost_shard.glb"
	elif "stinking_cloud" in p or "cloud" in p or "poison" in p or "gas" in p or "miasma" in p:
		return "res://assets/models/spell_stinking_cloud_ring.glb"
	else:
		return "res://assets/models/spell_magic_missile_orb.glb"

func _load_glb_scene(path: String) -> Node:
	if not FileAccess.file_exists(path) and not ResourceLoader.exists(path):
		return null
	var doc = GLTFDocument.new()
	var state = GLTFState.new()
	var err = doc.append_from_file(path, state)
	if err == OK:
		return doc.generate_scene(state)
	return null

func _apply_tint_to_meshes(root: Node3D, tint: Color) -> void:
	for child in root.get_children():
		if child is MeshInstance3D and child.mesh:
			var mat = StandardMaterial3D.new()
			mat.albedo_color = tint
			mat.metallic = 0.2
			mat.roughness = 0.2
			mat.emission_enabled = true
			mat.emission = tint
			mat.emission_energy_multiplier = 1.8
			child.material_override = mat
		elif child is Node3D:
			_apply_tint_to_meshes(child, tint)

func _build_fallback_spell_mesh(vfx_type: String, tint: Color) -> void:
	var fallback_root = Node3D.new()
	fallback_root.name = "ProceduralSpellRoot"

	var inst = MeshInstance3D.new()
	var mesh = SphereMesh.new()
	mesh.radius = 0.20
	mesh.height = 0.40
	inst.mesh = mesh
	var mat = StandardMaterial3D.new()
	mat.albedo_color = tint if tint != Color.WHITE else Color(0.2, 0.7, 1.0)
	mat.metallic = 0.2
	mat.roughness = 0.2
	mat.emission_enabled = true
	mat.emission = mat.albedo_color
	mat.emission_energy_multiplier = 1.5
	inst.material_override = mat
	fallback_root.add_child(inst)

	model_pivot.add_child(fallback_root)
	loaded_model_node = fallback_root
