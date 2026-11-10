extends Node

var _previous_mode := Window.MODE_WINDOWED

func _input(event: InputEvent) -> void:
	if not event is InputEventKey:
		return
	var enter_shortcut: bool = event.alt_pressed and event.keycode in [KEY_ENTER, KEY_KP_ENTER]
	var function_shortcut: bool = event.shift_pressed and event.keycode == KEY_F11
	if not enter_shortcut and not function_shortcut:
		return
	get_viewport().set_input_as_handled()
	if event.pressed and not event.echo:
		toggle_fullscreen()

func is_fullscreen() -> bool:
	return get_window().mode in [Window.MODE_FULLSCREEN, Window.MODE_EXCLUSIVE_FULLSCREEN]

func toggle_fullscreen() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var window := get_window()
	if is_fullscreen():
		window.mode = _previous_mode
	else:
		_previous_mode = window.mode
		window.mode = Window.MODE_FULLSCREEN
