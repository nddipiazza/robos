class_name FloatingTextManagerSingleton
extends Node

static var instance: FloatingTextManagerSingleton = null

func _enter_tree() -> void:
	instance = self

func _ready() -> void:
	instance = self

static func spawn_damage(world_pos: Vector2, amount: int, is_crit: bool = false, dmg_type: String = "slashing", node_context: Node = null) -> void:
	var txt = "-%d HP" % amount
	if is_crit:
		txt = "-%d HP CRIT!" % amount
	
	var col = Color(0.98, 0.25, 0.25, 1.0) # Default physical red
	if is_crit:
		col = Color(1.0, 0.85, 0.15, 1.0) # Golden critical
	elif dmg_type == "poison":
		col = Color(0.65, 0.95, 0.20, 1.0) # Acid lime green
		txt = "-%d HP POISON" % amount
	elif dmg_type == "fire":
		col = Color(1.0, 0.55, 0.15, 1.0) # Flame orange
		txt = "-%d HP FIRE" % amount
	elif dmg_type == "radiant":
		col = Color(1.0, 0.92, 0.35, 1.0) # Divine radiant
		txt = "-%d HP RADIANT" % amount
	elif dmg_type == "force":
		col = Color(0.35, 0.85, 1.0, 1.0) # Arcane force
		txt = "-%d HP ARCANE" % amount

	spawn_text(world_pos, txt, col, is_crit, node_context)

static func spawn_heal(world_pos: Vector2, amount: int, node_context: Node = null) -> void:
	var txt = "+%d HP" % amount
	var col = Color(0.25, 0.95, 0.45, 1.0) # Emerald green
	spawn_text(world_pos, txt, col, false, node_context)

static func spawn_miss(world_pos: Vector2, node_context: Node = null) -> void:
	var col = Color(0.78, 0.82, 0.88, 0.92) # Silver grey
	spawn_text(world_pos, "MISS", col, false, node_context)

static func spawn_status(world_pos: Vector2, status_name: String, node_context: Node = null) -> void:
	var col = Color(0.85, 0.45, 0.95, 1.0) # Status purple
	spawn_text(world_pos, status_name.to_upper(), col, true, node_context)

static func spawn_text(world_pos: Vector2, text: String, color: Color = Color.WHITE, is_crit: bool = false, node_context: Node = null) -> void:
	var tree = Engine.get_main_loop() as SceneTree
	if not tree:
		return
	var root = tree.root
	var target_parent: Node = null
	if node_context and is_instance_valid(node_context):
		target_parent = node_context.get_parent()
	if not target_parent:
		target_parent = tree.current_scene
	if not target_parent:
		target_parent = root

	var container = Node2D.new()
	container.top_level = true
	container.z_index = 95
	
	var drift_x = randf_range(-26.0, 26.0)
	var spawn_pos = world_pos + Vector2(randf_range(-10.0, 10.0), -24.0)
	container.global_position = spawn_pos
	container.scale = Vector2(0.3, 0.3)

	var label = Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color(0.04, 0.04, 0.06, 0.98))
	label.add_theme_constant_override("outline_size", 5 if is_crit else 4)
	label.add_theme_font_size_override("font_size", 22 if is_crit else 17)
	
	label.position = Vector2(-90.0, -16.0)
	label.size = Vector2(180.0, 32.0)
	container.add_child(label)
	
	target_parent.add_child(container)

	var tw = container.create_tween()
	var peak_scale = Vector2(1.45, 1.45) if is_crit else Vector2(1.20, 1.20)
	
	tw.parallel().tween_property(container, "scale", peak_scale, 0.20).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(container, "global_position:y", spawn_pos.y - 42.0, 0.20).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(container, "global_position:x", spawn_pos.x + drift_x * 0.5, 0.20).set_trans(Tween.TRANS_LINEAR)
	
	tw.tween_property(container, "scale", Vector2(1.05, 0.90), 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(container, "global_position:y", spawn_pos.y - 12.0, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(container, "global_position:x", spawn_pos.x + drift_x * 0.8, 0.18).set_trans(Tween.TRANS_LINEAR)

	tw.tween_property(container, "scale", Vector2(1.10, 1.10), 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(container, "global_position:y", spawn_pos.y - 28.0, 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(container, "global_position:x", spawn_pos.x + drift_x, 0.16).set_trans(Tween.TRANS_LINEAR)

	tw.tween_property(container, "global_position:y", spawn_pos.y - 48.0, 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(container, "modulate:a", 0.0, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	
	tw.tween_callback(container.queue_free)
