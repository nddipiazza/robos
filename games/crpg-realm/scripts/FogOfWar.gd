class_name FogOfWar
extends Node2D

@export var map_width: int = 2560
@export var map_height: int = 1440
@export var grid_scale: int = 8
@export var vision_radius: float = 340.0
@export var inner_vision_radius: float = 240.0
@export var memory_darkness: float = 0.65
@export var shroud_color: Color = Color(0.02, 0.02, 0.04, 1.0)
@export var is_fog_enabled: bool = true

var grid_w: int = 320
var grid_h: int = 180
var brush_radius_cells: int = 42
var brush_size: int = 85
var brush_data: PackedFloat32Array = PackedFloat32Array()

var fog_image: Image
var fog_texture: ImageTexture
var fog_sprite: Sprite2D
var fog_material: ShaderMaterial

var hero_node: Node2D = null
var last_hero_world_pos: Vector2 = Vector2(-9999, -9999)
var last_vision_cells: Array[Vector2i] = []
var registered_actors: Array[Node2D] = []

func _ready() -> void:
	z_index = 25
	process_mode = PROCESS_MODE_ALWAYS

	grid_w = int(float(map_width) / float(grid_scale))
	grid_h = int(float(map_height) / float(grid_scale))
	brush_radius_cells = int(vision_radius / float(grid_scale))
	brush_size = brush_radius_cells * 2 + 1

	_precompute_brush()
	_create_fog_overlay()

	if not hero_node:
		hero_node = get_parent().find_child("HeroPlayer", true, false)
		if not hero_node:
			hero_node = get_tree().get_first_node_in_group("player")

	# Check persistent exploration cache
	_load_explored_cache()

	if hero_node:
		update_fog_at_position(hero_node.global_position, true)

func _precompute_brush() -> void:
	brush_data = PackedFloat32Array()
	brush_data.resize(brush_size * brush_size)
	var r_inner = inner_vision_radius / float(grid_scale)
	var r_outer = float(brush_radius_cells)
	var r_inner_sq = r_inner * r_inner
	var r_outer_sq = r_outer * r_outer

	for by in range(brush_size):
		var dy = by - brush_radius_cells
		for bx in range(brush_size):
			var dx = bx - brush_radius_cells
			var d_sq = float(dx * dx + dy * dy)
			var idx = by * brush_size + bx
			if d_sq <= r_inner_sq:
				brush_data[idx] = 1.0
			elif d_sq <= r_outer_sq:
				var dist = sqrt(d_sq)
				var t = (dist - r_inner) / (r_outer - r_inner)
				# Smooth cubic hermite curve
				brush_data[idx] = 1.0 - (t * t * (3.0 - 2.0 * t))
			else:
				brush_data[idx] = 0.0

func _create_fog_overlay() -> void:
	fog_image = Image.create(grid_w, grid_h, false, Image.FORMAT_RGBA8)
	fog_image.fill(Color(0.0, 0.0, 0.0, 1.0)) # Unexplored, not in active sight

	fog_texture = ImageTexture.create_from_image(fog_image)

	fog_sprite = Sprite2D.new()
	fog_sprite.name = "FogDisplay"
	fog_sprite.centered = false
	fog_sprite.position = Vector2.ZERO
	fog_sprite.scale = Vector2(float(grid_scale), float(grid_scale))
	fog_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	fog_sprite.texture = fog_texture
	fog_sprite.z_as_relative = false
	fog_sprite.z_index = 50

	var shader = load("res://shaders/fog_of_war.gdshader")
	if shader:
		fog_material = ShaderMaterial.new()
		fog_material.shader = shader
		fog_material.set_shader_parameter("shroud_color", shroud_color)
		fog_material.set_shader_parameter("memory_darkness", memory_darkness)
		var is_enabled = _is_fog_enabled()
		fog_material.set_shader_parameter("enabled", is_enabled)
		fog_sprite.material = fog_material

	add_child(fog_sprite)

func _process(_delta: float) -> void:
	var is_enabled = _is_fog_enabled()
	if fog_material:
		fog_material.set_shader_parameter("enabled", is_enabled)
	if not is_enabled:
		_reveal_all_actors()
		return

	if not hero_node or not is_instance_valid(hero_node):
		hero_node = get_parent().find_child("HeroPlayer", true, false)
		return

	var cur_pos = hero_node.global_position
	if cur_pos.distance_to(last_hero_world_pos) > 5.0:
		update_fog_at_position(cur_pos)

	_update_actor_visibility()

func update_fog_at_position(pos: Vector2, force: bool = false) -> void:
	if not force and pos.distance_to(last_hero_world_pos) < 5.0:
		return
	last_hero_world_pos = pos

	var hx = int(pos.x / float(grid_scale))
	var hy = int(pos.y / float(grid_scale))

	# 1. Clear previous active vision cells back to 0.0 (keeping their explored red channel)
	for cell in last_vision_cells:
		if cell.x >= 0 and cell.x < grid_w and cell.y >= 0 and cell.y < grid_h:
			var old_col = fog_image.get_pixel(cell.x, cell.y)
			fog_image.set_pixel(cell.x, cell.y, Color(old_col.r, 0.0, 0.0, 1.0))
	last_vision_cells.clear()

	# 2. Stamp new vision circle
	for by in range(brush_size):
		var gy = hy - brush_radius_cells + by
		if gy < 0 or gy >= grid_h: continue
		for bx in range(brush_size):
			var gx = hx - brush_radius_cells + bx
			if gx < 0 or gx >= grid_w: continue

			var v = brush_data[by * brush_size + bx]
			if v <= 0.0: continue

			var cur_col = fog_image.get_pixel(gx, gy)
			var new_explored = max(cur_col.r, v)
			fog_image.set_pixel(gx, gy, Color(new_explored, v, 0.0, 1.0))
			last_vision_cells.append(Vector2i(gx, gy))

	fog_texture.update(fog_image)
	_save_explored_cache()

func _save_explored_cache() -> void:
	if not is_inside_tree(): return
	var cur_scene = get_tree().current_scene if get_tree() else null
	if not cur_scene: return
	var scene_name = cur_scene.name
	var gs = _get_game_state()
	if not gs: return
	if not gs.has_meta("fog_cache"):
		gs.set_meta("fog_cache", {})
	var cache = gs.get_meta("fog_cache")
	# Store explored bytes
	var exp_bytes = PackedByteArray()
	exp_bytes.resize(grid_w * grid_h)
	for y in range(grid_h):
		for x in range(grid_w):
			var c = fog_image.get_pixel(x, y)
			exp_bytes[y * grid_w + x] = int(c.r * 255.0)
	cache[scene_name] = exp_bytes

func _load_explored_cache() -> void:
	if not is_inside_tree(): return
	var cur_scene = get_tree().current_scene if get_tree() else null
	if not cur_scene: return
	var scene_name = cur_scene.name
	var gs = _get_game_state()
	if not gs or not gs.has_meta("fog_cache"): return
	var cache = gs.get_meta("fog_cache")
	if not cache.has(scene_name): return

	var exp_bytes: PackedByteArray = cache[scene_name]
	if exp_bytes.size() != grid_w * grid_h: return

	for y in range(grid_h):
		for x in range(grid_w):
			var e = float(exp_bytes[y * grid_w + x]) / 255.0
			fog_image.set_pixel(x, y, Color(e, 0.0, 0.0, 1.0))
	fog_texture.update(fog_image)

func is_point_in_vision(world_pos: Vector2) -> bool:
	if not _is_fog_enabled():
		return true
	var gx = int(world_pos.x / float(grid_scale))
	var gy = int(world_pos.y / float(grid_scale))
	if gx < 0 or gx >= grid_w or gy < 0 or gy >= grid_h:
		return false
	var c = fog_image.get_pixel(gx, gy)
	return c.g > 0.15

func is_point_explored(world_pos: Vector2) -> bool:
	if not _is_fog_enabled():
		return true
	var gx = int(world_pos.x / float(grid_scale))
	var gy = int(world_pos.y / float(grid_scale))
	if gx < 0 or gx >= grid_w or gy < 0 or gy >= grid_h:
		return false
	var c = fog_image.get_pixel(gx, gy)
	return c.r > 0.05

func _get_game_state() -> Node:
	if Engine.has_singleton("GameState"):
		return Engine.get_singleton("GameState")
	if Engine.get_main_loop() is SceneTree:
		var root = (Engine.get_main_loop() as SceneTree).root
		if root and root.has_node("GameState"):
			return root.get_node("GameState")
	return null

func _is_fog_enabled() -> bool:
	var gs = _get_game_state()
	if gs and "settings" in gs:
		return gs.settings.get("fog_of_war", true)
	return is_fog_enabled

func register_actor(actor: Node2D) -> void:
	if actor and not registered_actors.has(actor):
		registered_actors.append(actor)
		_update_single_actor(actor)

func _update_actor_visibility() -> void:
	for actor in registered_actors:
		if is_instance_valid(actor):
			_update_single_actor(actor)

func _update_single_actor(actor: Node2D) -> void:
	var in_vis = is_point_in_vision(actor.global_position)
	var target_alpha = 1.0 if in_vis else 0.0
	
	# Smoothly fade or set actor visibility
	if abs(actor.modulate.a - target_alpha) > 0.02:
		actor.modulate.a = move_toward(actor.modulate.a, target_alpha, 0.15)
	
	# If actor has overhead UI or selection circle, control visibility too
	var ui = actor.find_child("OverheadUI", true, false)
	if ui:
		ui.visible = (actor.modulate.a > 0.2)
	var sc = actor.find_child("SelectionCircle", true, false)
	if sc and not in_vis:
		sc.visible = false

func _reveal_all_actors() -> void:
	for actor in registered_actors:
		if is_instance_valid(actor):
			actor.modulate.a = 1.0
			var ui = actor.find_child("OverheadUI", true, false)
			if ui: ui.visible = true

func reveal_all() -> void:
	for y in range(grid_h):
		for x in range(grid_w):
			fog_image.set_pixel(x, y, Color(1.0, 1.0, 0.0, 1.0))
	fog_texture.update(fog_image)
	_reveal_all_actors()

func reset_fog() -> void:
	fog_image.fill(Color(0.0, 0.0, 0.0, 1.0))
	last_vision_cells.clear()
	fog_texture.update(fog_image)
	if hero_node:
		update_fog_at_position(hero_node.global_position, true)
