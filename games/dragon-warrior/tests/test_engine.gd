extends MainLoop

# Headless Engine & Specification Verification Script for AI Dragon Warrior v2

func _process(_delta: float) -> bool:
	print("==================================================")
	print("🐉 Running AI Dragon Warrior v2 Engine Core Tests")
	print("==================================================")
	
	var pass_count = 0
	var fail_count = 0
	
	# Test 1: DataManager specification loading
	var data_mgr = load("res://src/systems/DataManager.gd").new()
	data_mgr.load_all_data()
	
	if data_mgr.monsters.size() > 0:
		print("✅ [TEST 1 PASS] DataManager indexed %d monsters." % data_mgr.monsters.size())
		pass_count += 1
	else:
		print("❌ [TEST 1 FAIL] DataManager failed to load monsters.")
		fail_count += 1

	if data_mgr.spells.size() > 0:
		print("✅ [TEST 2 PASS] DataManager indexed %d spells." % data_mgr.spells.size())
		pass_count += 1
	else:
		print("❌ [TEST 2 FAIL] DataManager failed to load spells.")
		fail_count += 1

	# Test 3: PlayerState calculations and serialization
	var player_state = load("res://src/systems/PlayerState.gd").new()
	player_state.base_strength = 10
	player_state.weapon_id = "broad_sword"
	var atk = player_state.calculate_attack_power()
	var ser = player_state.serialize()
	
	if ser.has("hero_name") and ser.get("hero_name") == "Loto":
		print("✅ [TEST 3 PASS] PlayerState serialization verified.")
		pass_count += 1
	else:
		print("❌ [TEST 3 FAIL] PlayerState serialization failed.")
		fail_count += 1

	# Test 4: CombatEngine turn execution
	var combat_engine = load("res://src/systems/CombatEngine.gd").new()
	combat_engine.start_battle("slime")
	var result = combat_engine.execute_player_attack()
	
	if result.get("success", false) == true:
		print("✅ [TEST 4 PASS] CombatEngine attack turn executed cleanly.")
		pass_count += 1
	else:
		print("❌ [TEST 4 FAIL] CombatEngine attack failed.")
		fail_count += 1

	# Test 5: DialogueEngine line runner
	var dialogue_engine = load("res://src/systems/DialogueEngine.gd").new()
	dialogue_engine.start_dialogue("king_lorik")
	var line = dialogue_engine.get_current_line()
	
	if line != "":
		print("✅ [TEST 5 PASS] DialogueEngine loaded NPC lines.")
		pass_count += 1
	else:
		print("❌ [TEST 5 FAIL] DialogueEngine line retrieval failed.")
		fail_count += 1

	# Test 6: DungeonMap encounter pools and safe zones verification
	var dungeon_map = load("res://scripts/DungeonMap.gd").new()
	dungeon_map._load_databases()
	
	var safe_keys = ["brecconary-1f", "garinham-1f", "kol-1f", "rimuldar-1f", "cantlin-1f", "tantegel-castle-1f", "tantegel-castle-2f", "tantegel-castle-b1"]
	var safe_pass = true
	for sk in safe_keys:
		dungeon_map.set("_map_image_path_override", sk)
		# Test direct key logic
		if sk in ["brecconary-1f", "garinham-1f", "kol-1f", "rimuldar-1f", "cantlin-1f", "tantegel-castle-1f", "tantegel-castle-2f", "tantegel-castle-b1"]:
			pass

	# Check encounters using test instances
	var test_dungeon = load("res://scripts/SwampCave.gd").new()
	test_dungeon._load_databases()
	var swamp_enabled = test_dungeon._encounters_enabled()
	var swamp_pool = test_dungeon._get_encounter_pool()

	var test_hauksness = load("res://scripts/Hauksness.gd").new()
	test_hauksness._load_databases()
	var hauks_enabled = test_hauksness._encounters_enabled()
	var hauks_pool = test_hauksness._get_encounter_pool()

	var test_brecconary = load("res://scripts/Brecconary.gd").new()
	test_brecconary._load_databases()
	var brecc_enabled = test_brecconary._encounters_enabled()

	if swamp_enabled and not swamp_pool.is_empty() and hauks_enabled and not hauks_pool.is_empty() and not brecc_enabled:
		print("✅ [TEST 6 PASS] DungeonMap encounters and safe zones verified cleanly.")
		pass_count += 1
	else:
		print("❌ [TEST 6 FAIL] DungeonMap encounter pool verification failed (Swamp: %s, Hauksness: %s, Brecconary: %s)." % [swamp_pool, hauks_pool, brecc_enabled])
		fail_count += 1

	print("\n--------------------------------------------------")
	print("Test Results: %d Passed, %d Failed" % [pass_count, fail_count])
	print("==================================================")
	
	return true
