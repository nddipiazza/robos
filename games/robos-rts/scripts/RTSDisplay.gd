extends Node

# Keep HUD/input coordinates at 1080p, scaling to the active display. Tests and
# explicit windowed launches get a centered window that fits the usable desktop.
func _ready() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var args = OS.get_cmdline_args()
	var windowed = "--windowed" in args or "-w" in args or OS.get_environment("RTS_MODE") != ""
	if not windowed:
		return
	var window = get_window()
	window.mode = Window.MODE_WINDOWED
	var available = DisplayServer.screen_get_usable_rect(window.current_screen)
	var scale_factor = minf(1.0, minf((available.size.x - 80.0) / 1600.0, (available.size.y - 80.0) / 900.0))
	window.size = Vector2i(Vector2(1600, 900) * scale_factor)
	window.position = available.position + (available.size - window.size) / 2
