extends SceneTree

func _initialize() -> void:
	var emoji = FontFile.new()
	var result = emoji.load_dynamic_font("res://assets/fonts/NotoEmoji.ttf")
	if result != OK:
		push_error("Bundled emoji font failed to load")
		quit(1)
		return
	for codepoint in [0x1F916, 0x2699, 0x1F3B2, 0x1F50D, 0x1F6E1, 0x1F5E1]:
		if not emoji.has_char(codepoint):
			push_error("Missing emoji glyph: %x" % codepoint)
			quit(1)
			return
	print("Bundled emoji glyph coverage passed")
	quit(0)
