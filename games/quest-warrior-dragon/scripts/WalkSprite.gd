class_name WalkSprite
extends Node2D

## Two-frame toggling sprite — the classic NES "alive" animation.
## Toggle speed of 0.35s matches the original Quest: Warrior Dragon feel.
## Set `playing = false` to freeze on frame0 (idle pose).

@export var texture: Texture2D
@export var frame0_rect: Rect2 = Rect2(0, 0, 16, 16)
@export var frame1_rect: Rect2 = Rect2(20, 0, 16, 16)
@export var toggle_time: float = 0.35
@export var pixel_scale: float = 2.0
@export var x_offset: float = 0.0   # screen-pixel offset applied to the inner Sprite2D (use to re-center wider regions)
@export var playing: bool = true   # false = frozen on frame0 (idle)

var _sprite: Sprite2D
var _timer: float = 0.0
var _current_frame: int = 0


func _ready() -> void:
	_sprite = Sprite2D.new()
	_sprite.centered = false
	_sprite.region_enabled = true
	_sprite.scale = Vector2(pixel_scale, pixel_scale)
	_sprite.position = Vector2(x_offset, 0.0)
	if texture:
		_sprite.texture = texture
	_sprite.region_rect = frame0_rect
	add_child(_sprite)


func _process(delta: float) -> void:
	if not playing:
		return
	_timer += delta
	if _timer >= toggle_time:
		_timer -= toggle_time
		_current_frame = 1 - _current_frame
		_sprite.region_rect = frame1_rect if _current_frame == 1 else frame0_rect


## Change which direction/pose the sprite shows.
## Call with new frame rects to switch facing direction mid-game.
func set_frames(f0: Rect2, f1: Rect2) -> void:
	frame0_rect = f0
	frame1_rect = f1
	_current_frame = 0
	_timer = 0.0
	_sprite.region_rect = frame0_rect


## Freeze on frame0 and reset timer (call when movement stops).
func stop() -> void:
	playing = false
	_current_frame = 0
	_timer = 0.0
	_sprite.region_rect = frame0_rect


## Advance exactly one frame (call once per tile step for the hero).
## Resets the timer so time-based toggling doesn't fire mid-slide.
func step() -> void:
	_current_frame = 1 - _current_frame
	_sprite.region_rect = frame1_rect if _current_frame == 1 else frame0_rect
	_timer = 0.0
