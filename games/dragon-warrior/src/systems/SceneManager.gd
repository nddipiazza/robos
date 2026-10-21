extends Node

# SceneManager.gd — Declarative Scene & Location Transition Manager for AI Dragon Warrior v2

var current_scene: Node = null

func _ready():
	print("[SceneManager] Initialized declarative scene manager.")

func transition_to_location(location_id: String, floor_id: String, target_tile: Vector2i) -> void:
	print("[SceneManager] Transitioning to location: %s, floor: %s, tile: %s" % [location_id, floor_id, target_tile])
	if PlayerState:
		PlayerState.current_location_id = location_id
		PlayerState.current_floor_id = floor_id
		PlayerState.tile_position = target_tile
	
	if EventBus:
		EventBus.map_changed.emit(location_id, floor_id, target_tile)

func change_scene_to_file(scene_path: String) -> void:
	print("[SceneManager] Changing scene to file: %s" % scene_path)
	var tree = get_tree()
	if tree:
		tree.change_scene_to_file(scene_path)
	else:
		push_warning("[SceneManager] No SceneTree active.")
