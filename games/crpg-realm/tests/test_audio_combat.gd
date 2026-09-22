extends SceneTree

func _init() -> void:
	print("--- Testing Melee SFX Audio Registration ---")
	var am_script = load("res://scripts/AudioManager.gd")
	var am = am_script.new()
	assert(am.sound_effects.has("melee_hit"), "Missing melee_hit in AudioManager")
	assert(am.sound_effects.has("melee_miss"), "Missing melee_miss in AudioManager")
	assert(am.sound_effects.has("melee_crit"), "Missing melee_crit in AudioManager")
	assert(am.sound_effects.has("melee_swing"), "Missing melee_swing in AudioManager")
	
	for key in ["melee_hit", "melee_miss", "melee_crit", "melee_swing"]:
		var path = am.sound_effects[key]
		assert(ResourceLoader.exists(path), "File does not exist: " + path)
		var stream = load(path)
		assert(stream != null, "Failed to load audio stream: " + path)
		print("✔ Verified SFX [", key, "] -> ", path, " (Stream type: ", stream.get_class(), ")")
	
	print("--- Testing CombatManager Hit vs Miss Audio Triggering ---")
	var cm_script = load("res://scripts/CombatManager.gd")
	var cm = cm_script.new()
	
	# Test a guaranteed hit (attack bonus 100 vs AC 1, avoid d20 == 1 fumble if rolled)
	var hit_found = false
	for attempt in range(10):
		var hit_res = cm.execute_attack("Vance", 100, 5, 10, "Target", 1)
		if hit_res.hit:
			hit_found = true
			print("✔ CombatManager hit test passed: d20=", hit_res.d20, " hit=", hit_res.hit)
			break
	assert(hit_found, "Guaranteed hit failed")

	# Test a guaranteed miss (attack bonus -100 vs AC 100, avoid natural 20 if rolled)
	var miss_found = false
	for attempt in range(10):
		var miss_res = cm.execute_attack("Vance", -100, 5, 10, "Target", 100)
		if not miss_res.hit:
			miss_found = true
			print("✔ CombatManager miss test passed: d20=", miss_res.d20, " hit=", miss_res.hit)
			break
	assert(miss_found, "Guaranteed miss failed")

	print("=== ALL SFX AND COMBAT TESTS PASSED SUCCESSFULLY ===")
	quit(0)
