extends CharacterBody2D
class_name NPCCharacter

signal body_clicked

@export var npc_id: String = "npc-1"
@export var npc_name: String = "NPC"
@export var move_speed: float = 85.0
@export var waypoints: Array[Vector2] = []
@export var wait_min: float = 3.0
@export var wait_max: float = 6.0
@export var custom_sprite_path: String = ""
@export var portrait_path: String = ""
@export var dialogue_speaker: String = ""
@export var dialogue_text: String = ""
@export var dialogue_choices: Array[String] = []

@onready var sprite: Sprite2D = $Sprite
@onready var selection_circle: Sprite2D = find_child("SelectionCircle", true, false)
@onready var name_label: Label = find_child("NameLabel", true, false)

var current_wp_idx: int = 0
var wait_timer: float = 0.0
var is_conversing: bool = false

var walk_textures: Array[Texture2D] = []
var idle_textures: Array[Texture2D] = []
var anim_timer: float = 0.0
var anim_frame: int = 0

func _ready() -> void:
	if name_label:
		name_label.text = npc_name
	_load_npc_textures()

func _load_npc_textures() -> void:
	if custom_sprite_path != "" and ResourceLoader.exists(custom_sprite_path):
		var custom_tex = load(custom_sprite_path)
		if sprite:
			sprite.texture = custom_tex
			return

	var prefix = npc_name.to_lower().replace(" ", "_")
	for i in range(4):
		var p_walk = "res://assets/sprites/characters/%s_walk_%d.png" % [prefix, i]
		if ResourceLoader.exists(p_walk):
			walk_textures.append(load(p_walk))
		var p_idle = "res://assets/sprites/characters/%s_%d.png" % [prefix, i]
		if ResourceLoader.exists(p_idle):
			idle_textures.append(load(p_idle))

	if idle_textures.size() > 0 and sprite:
		sprite.texture = idle_textures[0]

func _physics_process(delta: float) -> void:
	if is_conversing or waypoints.size() < 2:
		velocity = Vector2.ZERO
		return

	if wait_timer > 0.0:
		wait_timer -= delta
		velocity = Vector2.ZERO
		return

	var dest = waypoints[current_wp_idx]
	var dist = global_position.distance_to(dest)
	if dist > 8.0:
		velocity = global_position.direction_to(dest) * move_speed
		move_and_slide()
		
		# Facing
		if velocity.x < -5.0 and sprite:
			sprite.flip_h = false
		elif velocity.x > 5.0 and sprite:
			sprite.flip_h = true

		# Walk animation
		anim_timer += delta
		if anim_timer >= 0.2 and walk_textures.size() > 0:
			anim_timer = 0.0
			anim_frame = (anim_frame + 1) % walk_textures.size()
			sprite.texture = walk_textures[anim_frame]
	else:
		velocity = Vector2.ZERO
		wait_timer = randf_range(wait_min, wait_max)
		current_wp_idx = (current_wp_idx + 1) % waypoints.size()
		if idle_textures.size() > 0 and sprite:
			sprite.texture = idle_textures[0]

func set_conversing(conversing: bool, face_target: Vector2 = Vector2.ZERO) -> void:
	is_conversing = conversing
	if conversing and face_target != Vector2.ZERO and sprite:
		sprite.flip_h = (face_target.x > global_position.x)
	if not conversing and idle_textures.size() > 0 and sprite:
		sprite.texture = idle_textures[0]

func interact() -> void:
	body_clicked.emit()
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return

	var hero = cur_scene.find_child("HeroPlayer", true, false)
	if hero:
		set_conversing(true, hero.global_position)

	var al: ActionLog = cur_scene.find_child("ActionLog", true, false)
	if not al:
		return

	# Revert conversing state when dialogue closes
	if not al.dialogue_ended.is_connected(_on_dialogue_ended):
		al.dialogue_ended.connect(_on_dialogue_ended)

	# Check DataStore dialogue trees first
	var tree = null
	if DataStore.dialogue_trees.has(npc_id):
		tree = DataStore.dialogue_trees[npc_id]
	elif DataStore.dialogue_trees.has("dialogue-" + npc_id.replace("npc-id-", "").replace("npc-", "")):
		tree = DataStore.dialogue_trees["dialogue-" + npc_id.replace("npc-id-", "").replace("npc-", "")]
	elif DataStore.npcs.has(npc_id) and DataStore.dialogue_trees.has(DataStore.npcs[npc_id].dialogue_tree):
		tree = DataStore.dialogue_trees[DataStore.npcs[npc_id].dialogue_tree]

	if tree != null and not tree.is_empty():
		var root_id = str(tree.get("rootNode", "node_welcome"))
		al.start_dialogue(tree, root_id)
		return

	# Fallback to local exported dialogue_text
	if dialogue_text != "":
		var spk = dialogue_speaker if dialogue_speaker != "" else npc_name
		var ch_arr = []
		if dialogue_choices.size() > 0:
			for ch in dialogue_choices:
				ch_arr.append({"text": ch, "nextNode": null})
		var local_tree = {
			"id": npc_id,
			"rootNode": "root",
			"nodes": {
				"root": {
					"speaker": spk,
					"text": dialogue_text,
					"choices": ch_arr
				}
			}
		}
		al.start_dialogue(local_tree, "root")

func _on_dialogue_ended() -> void:
	set_conversing(false)

func _input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		interact()
