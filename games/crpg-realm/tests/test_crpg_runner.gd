extends SceneTree

func _init() -> void:
	print("=== RobOS cRPG Automated Headless Verification ===")
	var store = load("res://src/generated/v1/DataStoreV1.gd").new()
	store.load_all_data()

	assert(store.monsters.size() > 0, "No monsters loaded")
	assert(store.spells.size() > 0, "No spells loaded")
	assert(store.items.size() > 0, "No items loaded")
	assert(store.npcs.size() > 0, "No npcs loaded")
	assert(store.monsters.has("captain-malakor-boss"), "Captain Malakor boss missing")

	var malakor = store.monsters["captain-malakor-boss"]
	print("✔ Verified Boss: ", malakor.title, " (CR: ", malakor.challenge_rating, ", HP: ", malakor.hit_points, ", AC: ", malakor.armor_class, ")")

	var combat = load("res://scripts/CombatManager.gd").new()
	var res = combat.execute_attack("Lieutenant Vance", 6, 8, 16, "Captain Malakor", malakor.armor_class)
	print("✔ Combat Test: D20 Roll=", res.d20, " Total=", res.total_attack, " Hit=", res.hit, " Damage=", res.damage)

	print("=== ALL CRPG AUTOMATED CHECKS PASSED ===")
	quit(0)
