# RobOS Tabletop RPG: CartridgeManager Singleton
# Autoload singleton: discovers, loads, and manages tabletop player cartridges (.cartridge.json).
class_name TabletopCartridgeManager
extends Node

signal cartridge_inserted(cartridge: Dictionary)
signal cartridge_event(event_name: String, event_data: Dictionary)

var active_cartridge: Dictionary = {}
var is_cartridge_active: bool = false
var auto_play_enabled: bool = false
var current_cartridge_slug: String = ""

func _ready() -> void:
	print("🛡️ [TabletopCartridgeManager] Ready for Tabletop Player Cartridges.")
	call_deferred("_check_cli_cartridge")

func _check_cli_cartridge() -> void:
	var cmd_args = OS.get_cmdline_user_args() + OS.get_cmdline_args()
	var cart_arg: String = OS.get_environment("CRPG_CARTRIDGE")
	if cart_arg == "":
		cart_arg = OS.get_environment("TABLETOP_CARTRIDGE")

	for i in range(cmd_args.size()):
		var a = cmd_args[i]
		if (a == "--cartridge" or a == "--campaign") and i + 1 < cmd_args.size():
			cart_arg = cmd_args[i + 1]
		elif a.begins_with("--cartridge="):
			cart_arg = a.split("=")[1]

	var wants_auto = (
		"--auto-play" in cmd_args or
		"--demo" in cmd_args or
		OS.get_environment("CRPG_AUTO_PLAY") == "1" or
		OS.get_environment("TABLETOP_AUTO_PLAY") == "1"
	)
	auto_play_enabled = wants_auto

	if cart_arg == "":
		cart_arg = "heroquest-the-trial"

	insert_cartridge(cart_arg)

func discover_cartridges() -> Array[Dictionary]:
	var list: Array[Dictionary] = []
	var search_dirs = ["res://cartridges/", "user://cartridges/"]

	for dir_path in search_dirs:
		if not DirAccess.dir_exists_absolute(dir_path):
			continue
		var dir = DirAccess.open(dir_path)
		if not dir:
			continue
		dir.list_dir_begin()
		var file_name = dir.get_next()
		while file_name != "":
			if not dir.current_is_dir() and file_name.ends_with(".cartridge.json"):
				var full_path = dir_path + file_name
				var cart = _load_json_file(full_path)
				if cart.size() > 0:
					var h = cart.get("header", {})
					list.append({
						"id": str(cart.get("cartridgeId", file_name.get_basename())),
						"file": file_name,
						"path": full_path,
						"title": str(h.get("title", file_name)),
						"ruleset": str(h.get("ruleset", "heroquest")),
						"gameType": str(h.get("gameType", "tabletop")),
						"heroCount": int(h.get("heroCount", 0)),
						"monsterCount": int(h.get("monsterCount", 0))
					})
			file_name = dir.get_next()
	return list

func insert_cartridge(target: String) -> bool:
	var clean_slug = target.replace(".cartridge.json", "").replace(".json", "")
	var paths_to_try = [
		"res://cartridges/" + clean_slug + ".cartridge.json",
		"user://cartridges/" + clean_slug + ".cartridge.json"
	]

	var loaded_cart: Dictionary = {}
	for p in paths_to_try:
		if FileAccess.file_exists(p):
			loaded_cart = _load_json_file(p)
			if loaded_cart.size() > 0:
				break

	if loaded_cart.size() == 0:
		print("❌ [TabletopCartridgeManager] Could not find cartridge: ", target)
		return false

	active_cartridge = loaded_cart
	is_cartridge_active = true
	current_cartridge_slug = clean_slug

	print("📼 [TabletopCartridgeManager] Plugged in cartridge: ", loaded_cart.get("header", {}).get("title", clean_slug))
	cartridge_inserted.emit(active_cartridge)
	return true

func _load_json_file(file_path: String) -> Dictionary:
	var file = FileAccess.open(file_path, FileAccess.READ)
	if not file:
		return {}
	var text = file.get_as_text()
	var json = JSON.new()
	var err = json.parse(text)
	if err == OK and json.data is Dictionary:
		return json.data
	return {}
