extends SceneTree

# Headless validator for dynamically AI-generated Godot 4 `client.gd` scripts.
# Usage:
#   godot4 --headless --path <godot-dir> -s res://scripts/validate_client.gd -- <client.gd> [views.json]

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		printerr("VALIDATE_ERROR: Missing path to client.gd")
		quit(2)
		return

	var gd_path := args[0]
	if not FileAccess.file_exists(gd_path):
		printerr("VALIDATE_ERROR: File not found: " + gd_path)
		quit(2)
		return

	var source := FileAccess.get_file_as_string(gd_path)
	var dyn := GDScript.new()
	dyn.source_code = source
	var err := dyn.reload()
	if err != OK:
		printerr("VALIDATE_ERROR: GDScript reload failed with error code " + str(err))
		quit(3)
		return

	var inst_var: Variant = dyn.new()
	if not (inst_var is Control):
		printerr("VALIDATE_ERROR: Script must extend Control")
		quit(4)
		return

	var inst: Control = inst_var
	if not (inst.has_method("apply_view") or inst.has_method("render_view") or inst.has_method("update_state")):
		printerr("VALIDATE_ERROR: Script must define func apply_view(view: Dictionary, me: Dictionary, lobby: Dictionary)")
		quit(5)
		return

	var emitted_actions: Array = []
	if "send_action" in inst:
		inst.set("send_action", func(p: Variant): emitted_actions.append(p))

	inst.size = Vector2(960, 680)
	root.add_child(inst)

	if args.size() >= 2 and FileAccess.file_exists(args[1]):
		var raw_json := FileAccess.get_file_as_string(args[1])
		var parsed: Variant = JSON.parse_string(raw_json)
		if typeof(parsed) == TYPE_DICTIONARY:
			var samples: Array = parsed.get("samples", []) if typeof(parsed.get("samples")) == TYPE_ARRAY else []
			for sample in samples:
				if typeof(sample) == TYPE_DICTIONARY:
					var v: Dictionary = sample.get("view", {}) if typeof(sample.get("view")) == TYPE_DICTIONARY else {}
					var m: Dictionary = sample.get("me", {}) if typeof(sample.get("me")) == TYPE_DICTIONARY else {}
					var l: Dictionary = sample.get("lobby", {}) if typeof(sample.get("lobby")) == TYPE_DICTIONARY else {}
					if inst.has_method("apply_view"):
						inst.call("apply_view", v, m, l)
					elif inst.has_method("render_view"):
						inst.call("render_view", v, m, l)
					elif inst.has_method("update_state"):
						inst.call("update_state", v, m, l)

	print("VALIDATION_OK")
	inst.free()
	quit(0)
