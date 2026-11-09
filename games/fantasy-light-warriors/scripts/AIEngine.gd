extends Node

var enabled: bool = false

func set_enabled(v: bool) -> void:
	enabled = v
	var brain := get_node_or_null("/root/PlayGameBrain")
	if brain:
		if v and not brain.active:
			brain.start()
		elif not v and brain.active:
			brain.stop()
