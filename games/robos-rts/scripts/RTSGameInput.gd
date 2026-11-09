extends RefCounted

# Translate control-service requests into the same events used by the viewport.
static func from_request(request: Dictionary) -> InputEvent:
	var kind := str(request.get("type", ""))
	var position := Vector2(float(request.get("x", 0.0)), float(request.get("y", 0.0)))
	var event: InputEventWithModifiers
	match kind:
		"mouse_button":
			var button := InputEventMouseButton.new()
			button.position = position
			button.global_position = position
			button.button_index = int(request.get("button", MOUSE_BUTTON_LEFT))
			button.pressed = bool(request.get("pressed", true))
			button.double_click = bool(request.get("double", false))
			event = button
		"mouse_motion":
			var motion := InputEventMouseMotion.new()
			motion.position = position
			motion.global_position = position
			motion.relative = Vector2(float(request.get("dx", 0.0)), float(request.get("dy", 0.0)))
			return motion
		"key":
			var key := InputEventKey.new()
			key.keycode = OS.find_keycode_from_string(str(request.get("key", "")))
			key.pressed = bool(request.get("pressed", true))
			event = key
		_:
			return null
	event.shift_pressed = bool(request.get("shift", false))
	event.ctrl_pressed = bool(request.get("ctrl", false))
	event.meta_pressed = bool(request.get("meta", false))
	event.alt_pressed = bool(request.get("alt", false))
	return event
