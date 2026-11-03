extends SceneTree

func _initialize() -> void:
	call_deferred("_check_progress")

func _check_progress() -> void:
	var world = load("res://scenes/TabletopWorld.tscn").instantiate()
	root.add_child(world)
	await process_frame
	await process_frame
	var cartridge_manager = root.get_node("CartridgeManager")
	var menu_button = world.game_menu_modal.find_child("BtnSelectQuest", true, false)
	if not menu_button or menu_button.visible:
		push_error("Standalone menu exposes other campaigns")
		quit(1)
		return
	world.execute_action({"action": "end_turn"})
	world.execute_action({"action": "save_game"})
	var save_path = world.get_save_file_path()
	if not FileAccess.file_exists(save_path):
		push_error("Progress was not saved")
		quit(1)
		return
	var before = FileAccess.get_file_as_bytes(save_path)
	var quest_before = world.active_quest_id
	var cartridge_before = cartridge_manager.current_cartridge_slug
	world.switch_to_quest("heroquest-the-trial", "heroquest-the-trial")
	if not FileAccess.file_exists(save_path) or before != FileAccess.get_file_as_bytes(save_path) or world.active_quest_id != quest_before or cartridge_manager.current_cartridge_slug != cartridge_before:
		push_error("Rejected campaign switch changed saved progress")
		quit(1)
		return
	world.open_quest_selector_modal()
	if world.quest_selector_modal and world.quest_selector_modal.visible:
		push_error("Standalone quest selector opened")
		quit(1)
		return
	if not world.execute_action({"action": "load_game"}).get("success", false):
		push_error("Preserved progress could not be restored")
		quit(1)
		return
	print("Standalone campaign progress protection passed")
	quit(0)
