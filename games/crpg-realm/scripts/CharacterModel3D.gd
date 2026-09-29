extends Node2D
class_name CharacterModel3D

# RobOS cRPG 3D Character Miniature Renderer
# Renders 3D glTF/GLB models or procedural tabletop miniatures inside an anti-aliased SubViewport
# and projects them onto a 2D Sprite with dynamic 3D facing, idle breathing, and tabletop hop animations.

@export var model_asset_ref: String = ""
@export var model_type: String = "knight"
@export var model_scale_multiplier: float = 1.0
@export var model_tint: Color = Color.WHITE
@export var animation_stance: String = "tabletop_hop"

var sub_viewport: SubViewport = null
var camera_3d: Camera3D = null
var model_pivot: Node3D = null
var display_sprite: Sprite2D = null

var target_facing_yaw: float = 0.0
var is_moving: bool = false
var walk_timer: float = 0.0
var idle_timer: float = 0.0
var loaded_model_node: Node3D = null

var weapon_socket: Node3D = null
var shield_socket: Node3D = null
var helm_socket: Node3D = null

func _init() -> void:
	name = "CharacterModel3D"

func _ready() -> void:
	_setup_viewport_pipeline()
	if model_asset_ref != "" or model_type != "":
		setup_model(model_asset_ref, model_type, model_scale_multiplier, model_tint)

func _setup_viewport_pipeline() -> void:
	if sub_viewport:
		return

	sub_viewport = SubViewport.new()
	sub_viewport.name = "ModelSubViewport"
	sub_viewport.size = Vector2i(160, 160)
	sub_viewport.transparent_bg = true
	sub_viewport.own_world_3d = true
	sub_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	sub_viewport.msaa_3d = Viewport.MSAA_4X
	add_child(sub_viewport)

	# 3D Camera configured at isometric ~35 deg downward pitch
	camera_3d = Camera3D.new()
	camera_3d.name = "MiniatureCamera3D"
	camera_3d.position = Vector3(0.0, 1.45, 1.95)
	camera_3d.look_at_from_position(Vector3(0.0, 1.45, 1.95), Vector3(0.0, 0.45, 0.0), Vector3.UP)
	camera_3d.fov = 36.0
	camera_3d.near = 0.1
	camera_3d.far = 20.0
	sub_viewport.add_child(camera_3d)

	# Directional Key Light (warm high sunlight)
	var sun = DirectionalLight3D.new()
	sun.name = "KeySunLight"
	sun.rotation_degrees = Vector3(-45.0, 35.0, 0.0)
	sun.light_color = Color(1.0, 0.98, 0.92)
	sun.light_energy = 1.35
	sub_viewport.add_child(sun)

	# Soft Omni Fill Light (cool front-left fill)
	var fill = OmniLight3D.new()
	fill.name = "FillLight"
	fill.position = Vector3(-1.2, 1.0, 1.2)
	fill.light_color = Color(0.70, 0.80, 0.98)
	fill.light_energy = 0.65
	fill.omni_range = 6.0
	sub_viewport.add_child(fill)

	# Model Pivot for rotation and animated hopping
	model_pivot = Node3D.new()
	model_pivot.name = "ModelPivot"
	sub_viewport.add_child(model_pivot)

	# Equipment Sockets attached to ModelPivot (so they animate hop and rotate with character)
	weapon_socket = Node3D.new()
	weapon_socket.name = "WeaponSocket"
	weapon_socket.position = Vector3(0.24, 0.45, 0.12)
	model_pivot.add_child(weapon_socket)

	shield_socket = Node3D.new()
	shield_socket.name = "ShieldSocket"
	shield_socket.position = Vector3(-0.25, 0.46, 0.12)
	model_pivot.add_child(shield_socket)

	helm_socket = Node3D.new()
	helm_socket.name = "HelmSocket"
	helm_socket.position = Vector3(0.0, 0.78, 0.0)
	model_pivot.add_child(helm_socket)

	# Display 2D Sprite displaying the ViewportTexture
	display_sprite = Sprite2D.new()
	display_sprite.name = "DisplaySprite"
	display_sprite.texture = sub_viewport.get_texture()
	display_sprite.centered = true
	display_sprite.offset = Vector2(0, -18)
	display_sprite.scale = Vector2(0.85, 0.85)
	add_child(display_sprite)

func _process(delta: float) -> void:
	if not model_pivot:
		return

	# Smooth 3D Yaw Rotation towards target facing
	model_pivot.rotation.y = lerp_angle(model_pivot.rotation.y, target_facing_yaw, 14.0 * delta)

	# Animation stances: Tabletop hop vs idle breathing sway
	if is_moving:
		walk_timer += delta * 15.0
		var hop = abs(sin(walk_timer)) * 0.14
		model_pivot.position.y = hop
		model_pivot.rotation.z = sin(walk_timer) * 0.06
	else:
		idle_timer += delta * 2.8
		var sway = sin(idle_timer) * 0.03
		model_pivot.position.y = sway
		model_pivot.rotation.z = lerp(model_pivot.rotation.z, 0.0, 10.0 * delta)

func setup_model(asset_path: String, type_name: String = "", scale_mul: float = 1.0, tint: Color = Color.WHITE) -> void:
	model_asset_ref = asset_path
	model_type = type_name
	model_scale_multiplier = scale_mul
	model_tint = tint

	if not sub_viewport:
		_setup_viewport_pipeline()

	# Clear previous loaded model
	if loaded_model_node and is_instance_valid(loaded_model_node):
		loaded_model_node.queue_free()
		loaded_model_node = null

	var resolved_path = _resolve_model_path(asset_path, type_name)
	var loaded_scene: Node = null

	if resolved_path != "":
		loaded_scene = _load_glb_scene(resolved_path)

	if loaded_scene:
		loaded_model_node = loaded_scene as Node3D
		if loaded_model_node:
			model_pivot.add_child(loaded_model_node)
			var final_scale = Vector3.ONE * (0.85 * model_scale_multiplier)
			loaded_model_node.scale = final_scale
			if tint != Color.WHITE:
				_apply_tint_to_meshes(loaded_model_node, tint)
			print("🧊 [CharacterModel3D] Successfully attached 3D Model: ", resolved_path)
			return

	# Fallback procedural miniature if GLB failed
	_build_procedural_fallback_miniature(type_name, tint)

func _resolve_model_path(path: String, type_name: String) -> String:
	if path != "" and (path.ends_with(".glb") or path.ends_with(".gltf")):
		var check_p = _ensure_res_path(path)
		if FileAccess.file_exists(check_p) or ResourceLoader.exists(check_p):
			return check_p

	# Archetype mapping
	var t = (type_name + " " + path).to_lower()
	if "dragonlord" in t or "dragon" in t or "wyrm" in t or "boss" in t or "malakor" in t:
		return "res://assets/models/monster_dragon_pawn.glb"
	elif "skeleton" in t or "undead" in t or "bone" in t:
		return "res://assets/models/monster_skeleton_pawn.glb"
	elif "minotaur" in t or "beast" in t or "brute" in t or "ogre" in t:
		return "res://assets/models/monster_minotaur_pawn.glb"
	elif "hound" in t or "wolf" in t or "dire" in t or "dog" in t:
		return "res://assets/models/monster_hound_pawn.glb"
	elif "skirmisher" in t or "brigand" in t or "bandit" in t or "scout" in t:
		return "res://assets/models/monster_skirmisher_pawn.glb"
	elif "goblin" in t or "skulker" in t or "creature" in t:
		return "res://assets/models/monster_goblin_pawn.glb"
	elif "king" in t or "lorik" in t or "loric" in t or "alden" in t or "monarch" in t:
		return "res://assets/models/character_king_pawn.glb"
	elif "princess" in t or "gwaelin" in t or "jennifer" in t or "royal" in t:
		return "res://assets/models/character_princess_pawn.glb"
	elif "wizard" in t or "mage" in t or "sorcerer" in t or "elora" in t or "ignis" in t:
		return "res://assets/models/character_wizard_pawn.glb"
	elif "rogue" in t or "thief" in t or "assassin" in t or "imoen" in t:
		return "res://assets/models/character_rogue_pawn.glb"
	else:
		return "res://assets/models/character_knight_pawn.glb"

func equip_weapon(weapon_ref: String) -> void:
	if not weapon_socket:
		return
	for c in weapon_socket.get_children():
		c.queue_free()
	if weapon_ref == "" or weapon_ref == "none":
		return
	var path = _resolve_weapon_path(weapon_ref)
	var scene = _load_glb_scene(path)
	if scene:
		weapon_socket.add_child(scene)
		print("⚔️ [CharacterModel3D] Equipped weapon: ", path)

func equip_shield(shield_ref: String) -> void:
	if not shield_socket:
		return
	for c in shield_socket.get_children():
		c.queue_free()
	if shield_ref == "" or shield_ref == "none":
		return
	var path = _resolve_shield_path(shield_ref)
	var scene = _load_glb_scene(path)
	if scene:
		shield_socket.add_child(scene)
		print("🛡️ [CharacterModel3D] Equipped shield: ", path)

func equip_helmet(helm_ref: String) -> void:
	if not helm_socket:
		return
	for c in helm_socket.get_children():
		c.queue_free()
	if helm_ref == "" or helm_ref == "none":
		return
	var path = _resolve_helm_path(helm_ref)
	var scene = _load_glb_scene(path)
	if scene:
		helm_socket.add_child(scene)
		print("🪖 [CharacterModel3D] Equipped helmet: ", path)

func apply_armor_styling(armor_type: String, armor_color: Color = Color.WHITE) -> void:
	if not loaded_model_node:
		return
	var a = armor_type.to_lower()
	var metallic = 0.4
	var roughness = 0.4
	var tint = armor_color
	if "plate" in a or "knight" in a or "steel" in a or "iron" in a:
		metallic = 0.85
		roughness = 0.2
		if tint == Color.WHITE:
			tint = Color(0.80, 0.83, 0.88)
	elif "leather" in a or "studded" in a or "hide" in a:
		metallic = 0.2
		roughness = 0.75
		if tint == Color.WHITE:
			tint = Color(0.48, 0.32, 0.20)
	elif "robe" in a or "cloth" in a or "linen" in a:
		metallic = 0.05
		roughness = 0.9
		if tint == Color.WHITE:
			tint = Color(0.55, 0.25, 0.85)

	_apply_material_styling(loaded_model_node, tint, metallic, roughness)

func _resolve_weapon_path(ref: String) -> String:
	if ref.ends_with(".glb") or ref.ends_with(".gltf"):
		return _ensure_res_path(ref)
	var r = ref.to_lower()
	if "hero" in r or "excalibur" in r or "erdrick" in r or "legendary" in r:
		return "res://assets/models/weapon_sword_hero.glb"
	elif "club" in r or "cudgel" in r or "mace" in r:
		return "res://assets/models/weapon_club_wood.glb"
	elif "staff" in r or "rod" in r or "wand" in r:
		return "res://assets/models/weapon_staff_wizard.glb"
	elif "bow" in r or "arrow" in r:
		return "res://assets/models/weapon_bow_recurve.glb"
	elif "dagger" in r or "knife" in r or "blade" in r:
		return "res://assets/models/weapon_dagger_rogue.glb"
	elif "bamboo" in r or "pole" in r or "spear" in r:
		return "res://assets/models/weapon_bamboo_pole.glb"
	else:
		return "res://assets/models/weapon_sword_iron.glb"

func _resolve_shield_path(ref: String) -> String:
	if ref.ends_with(".glb") or ref.ends_with(".gltf"):
		return _ensure_res_path(ref)
	var r = ref.to_lower()
	if "round" in r or "buckler" in r or "viking" in r:
		return "res://assets/models/armor_shield_round.glb"
	else:
		return "res://assets/models/armor_shield_heater.glb"

func _resolve_helm_path(ref: String) -> String:
	if ref.ends_with(".glb") or ref.ends_with(".gltf"):
		return _ensure_res_path(ref)
	return "res://assets/models/armor_helm_knight.glb"

func _ensure_res_path(path: String) -> String:
	if not path.begins_with("res://") and not path.begins_with("/"):
		return "res://" + path.trim_prefix("/")
	return path

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
	_apply_material_styling(root, tint, 0.4, 0.4)

func _apply_material_styling(root: Node3D, tint: Color, metallic: float, roughness: float) -> void:
	for child in root.get_children():
		if child is MeshInstance3D and child.mesh:
			var mat = StandardMaterial3D.new()
			mat.albedo_color = tint
			mat.metallic = metallic
			mat.roughness = roughness
			child.material_override = mat
		elif child is Node3D:
			_apply_material_styling(child, tint, metallic, roughness)

func _build_procedural_fallback_miniature(type_name: String, tint: Color) -> void:
	var fallback_root = Node3D.new()
	fallback_root.name = "ProceduralPawnRoot"
	
	# Pedestal Base
	var base_inst = MeshInstance3D.new()
	var base_mesh = CylinderMesh.new()
	base_mesh.top_radius = 0.35
	base_mesh.bottom_radius = 0.38
	base_mesh.height = 0.08
	base_inst.mesh = base_mesh
	base_inst.position = Vector3(0, 0.04, 0)
	var base_mat = StandardMaterial3D.new()
	base_mat.albedo_color = Color(0.15, 0.18, 0.22)
	base_inst.material_override = base_mat
	fallback_root.add_child(base_inst)

	# Pawn Torso
	var body_inst = MeshInstance3D.new()
	var body_mesh = CapsuleMesh.new()
	body_mesh.radius = 0.18
	body_mesh.height = 0.50
	body_inst.mesh = body_mesh
	body_inst.position = Vector3(0, 0.38, 0)
	var body_mat = StandardMaterial3D.new()
	body_mat.albedo_color = tint if tint != Color.WHITE else Color(0.25, 0.65, 0.95)
	body_mat.metallic = 0.5
	body_mat.roughness = 0.35
	body_inst.material_override = body_mat
	fallback_root.add_child(body_inst)

	# Pawn Head
	var head_inst = MeshInstance3D.new()
	var head_mesh = SphereMesh.new()
	head_mesh.radius = 0.14
	head_mesh.height = 0.28
	head_inst.mesh = head_mesh
	head_inst.position = Vector3(0, 0.72, 0)
	head_inst.material_override = body_mat
	fallback_root.add_child(head_inst)

	model_pivot.add_child(fallback_root)
	loaded_model_node = fallback_root
	print("♟️ [CharacterModel3D] Built procedural tabletop miniature for: ", type_name)

func update_facing(velocity: Vector2) -> void:
	if velocity.length() > 5.0:
		is_moving = true
		# In 3D: -Z is forward, +X is right.
		# In 2D: Vector2(dir.x, dir.y) where +Y is down (towards camera), -Y is up (away from camera).
		target_facing_yaw = atan2(velocity.x, velocity.y)
	else:
		is_moving = false

func face_point(target_pos: Vector2) -> void:
	var dir = global_position.direction_to(target_pos)
	if dir.length() > 0.01:
		target_facing_yaw = atan2(dir.x, dir.y)

func set_moving(moving: bool) -> void:
	is_moving = moving
	if not moving:
		walk_timer = 0.0

func set_visible_in_game(is_vis: bool) -> void:
	visible = is_vis
	if display_sprite:
		display_sprite.visible = is_vis
