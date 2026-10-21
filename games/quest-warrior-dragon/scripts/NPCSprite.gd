@tool
class_name NPCSprite
extends Node2D

## Animated NPC sprite using individual 16×16 PNG frame files.
## @tool lets the sprite preview live inside the Godot editor.
## Configure character_id and facing to set which NPC type and direction.
## Calls set_facing() at runtime to change direction (e.g. when an NPC turns).

@export var character_id: String = "soldier":
	set(v):
		character_id = v
		if _sprite:
			_load_facing(facing)

@export_enum("down", "left", "right", "up") var facing: String = "down":
	set(v):
		facing = v
		if _sprite:
			_load_facing(v)

@export var pixel_scale: float = 2.0:
	set(v):
		pixel_scale = v
		if _sprite:
			_sprite.scale = Vector2(v, v)

@export var toggle_time: float = 0.35
@export var playing: bool = true

var _sprite: Sprite2D
var _tex0: Texture2D
var _tex1: Texture2D
var _timer: float = 0.0
var _frame: int = 0


func _ready() -> void:
	_sprite = Sprite2D.new()
	_sprite.centered = false
	_sprite.scale = Vector2(pixel_scale, pixel_scale)
	add_child(_sprite)
	_load_facing(facing)


func _process(delta: float) -> void:
	if not playing or _tex0 == _tex1:
		return
	_timer += delta
	if _timer >= toggle_time:
		_timer -= toggle_time
		_frame = 1 - _frame
		_sprite.texture = _tex1 if _frame == 1 else _tex0


## Change facing direction (down / left / right / up).
func set_facing(direction: String) -> void:
	facing = direction
	_load_facing(direction)


## Freeze on frame 0.
func stop() -> void:
	playing = false
	_frame = 0
	_timer = 0.0
	if _tex0:
		_sprite.texture = _tex0


## Resume animation.
func play() -> void:
	playing = true


func _load_facing(direction: String) -> void:
	var paths: Array = NPCCharacterData.get_frames(character_id, direction)
	_tex0 = load(paths[0])
	_tex1 = load(paths[1])
	_frame = 0
	_timer = 0.0
	if _sprite:
		_sprite.texture = _tex0
