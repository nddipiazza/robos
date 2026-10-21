@tool
class_name NPCSpriteFiles
extends Node2D

## Animated NPC sprite that loads frames directly from explicit PNG file paths.
## Use this when you have pre-extracted individual PNG frames rather than
## pulling from a sprite sheet via NPCCharacterData.

@export_file("*.png") var down_frame_1: String = "":
	set(v): down_frame_1 = v; _reload()
@export_file("*.png") var down_frame_2: String = "":
	set(v): down_frame_2 = v; _reload()

@export_file("*.png") var left_frame_1: String = "":
	set(v): left_frame_1 = v; _reload()
@export_file("*.png") var left_frame_2: String = "":
	set(v): left_frame_2 = v; _reload()

@export_file("*.png") var up_frame_1: String = "":
	set(v): up_frame_1 = v; _reload()
@export_file("*.png") var up_frame_2: String = "":
	set(v): up_frame_2 = v; _reload()

@export_file("*.png") var right_frame_1: String = "":
	set(v): right_frame_1 = v; _reload()
@export_file("*.png") var right_frame_2: String = "":
	set(v): right_frame_2 = v; _reload()

@export_enum("down", "left", "right", "up") var facing: String = "down":
	set(v): facing = v; _reload()

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
	_reload()


func _process(delta: float) -> void:
	if not playing or _tex0 == null or _tex1 == null or _tex0 == _tex1:
		return
	_timer += delta
	if _timer >= toggle_time:
		_timer -= toggle_time
		_frame = 1 - _frame
		_sprite.texture = _tex1 if _frame == 1 else _tex0


func set_facing(direction: String) -> void:
	facing = direction


func stop() -> void:
	playing = false
	_frame = 0
	_timer = 0.0
	if _sprite and _tex0:
		_sprite.texture = _tex0


func play() -> void:
	playing = true


func _reload() -> void:
	if not _sprite:
		return
	var f0 := _path_for_facing(facing, 0)
	var f1 := _path_for_facing(facing, 1)
	_tex0 = load(f0) if f0 != "" else null
	_tex1 = load(f1) if f1 != "" else _tex0
	_frame = 0
	_timer = 0.0
	_sprite.texture = _tex0


func _path_for_facing(dir: String, frame_idx: int) -> String:
	match dir:
		"down":  return down_frame_1  if frame_idx == 0 else down_frame_2
		"left":  return left_frame_1  if frame_idx == 0 else left_frame_2
		"up":    return up_frame_1    if frame_idx == 0 else up_frame_2
		"right": return right_frame_1 if frame_idx == 0 else right_frame_2
	return ""
