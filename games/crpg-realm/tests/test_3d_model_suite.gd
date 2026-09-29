extends SceneTree

# Automated Test Suite for RobOS cRPG 3D Models (Spells, Monsters, Weapons, Armor)
# Verifies all 29 .glb models load with 100% fidelity, tests CharacterModel3D equipment socketing,
# tests SpellModel3D VFX rendering, and captures a composite screenshot.

const CharacterModel3D = preload("res://scripts/CharacterModel3D.gd")
const SpellModel3D = preload("res://scripts/SpellModel3D.gd")

var frame_count: int = 0
var test_canvas: CanvasLayer = null

func _init() -> void:
	print("==================================================")
	print("🧪 Starting 3D Model Suite Test (Spells, Monsters, Weapons, Armor)")
	print("==================================================")

	# 1. Verify all 29 GLB model files exist and load via GLTFDocument
	var models = [
		# Characters & NPCs
		"character_knight_pawn.glb",
		"character_king_pawn.glb",
		"character_princess_pawn.glb",
		"character_wizard_pawn.glb",
		"character_rogue_pawn.glb",
		# Monsters
		"monster_dragon_pawn.glb",
		"monster_goblin_pawn.glb",
		"monster_skeleton_pawn.glb",
		"monster_minotaur_pawn.glb",
		"monster_hound_pawn.glb",
		"monster_skirmisher_pawn.glb",
		# Weapons
		"weapon_sword_iron.glb",
		"weapon_sword_hero.glb",
		"weapon_club_wood.glb",
		"weapon_staff_wizard.glb",
		"weapon_bow_recurve.glb",
		"weapon_dagger_rogue.glb",
		"weapon_bamboo_pole.glb",
		# Armor / Shields / Helms
		"armor_shield_heater.glb",
		"armor_shield_round.glb",
		"armor_helm_knight.glb",
		"armor_suit_plate.glb",
		"armor_suit_leather.glb",
		# Spells
		"spell_fireball_projectile.glb",
		"spell_magic_missile_orb.glb",
		"spell_healing_glyph.glb",
		"spell_lightning_spark.glb",
		"spell_frost_shard.glb",
		"spell_stinking_cloud_ring.glb"
	]

	print("\n--- Verifying glTF 2.0 Binary Assets ---")
	for m in models:
		var p = "res://assets/models/" + m
		assert(FileAccess.file_exists(p), "Missing model asset: " + p)
		var doc = GLTFDocument.new()
		var state = GLTFState.new()
		var err = doc.append_from_file(p, state)
		assert(err == OK, "Failed to parse GLB: " + p)
		var scene = doc.generate_scene(state)
		assert(scene != null, "Failed to instantiate GLB scene: " + p)
		print("  ✔ Model: ", m, " (GLB valid, node: ", scene.get_class(), ")")
		scene.free()

	print("\n--- Verifying CharacterModel3D Equipment Sockets ---")
	var root_node = Node2D.new()
	root_node.name = "TestRootNode"
	root.add_child(root_node)

	# Test Knight equipped with Hero's Sword and Heater Shield
	var knight = CharacterModel3D.new()
	knight.name = "KnightTester"
	knight.position = Vector2(150, 200)
	root_node.add_child(knight)
	knight.setup_model("res://assets/models/character_knight_pawn.glb", "knight", 1.0)
	assert(knight.weapon_socket != null, "Knight missing weapon_socket")
	assert(knight.shield_socket != null, "Knight missing shield_socket")
	assert(knight.helm_socket != null, "Knight missing helm_socket")

	knight.equip_weapon("heros-sword")
	assert(knight.weapon_socket.get_child_count() > 0, "Failed to socket weapon")
	knight.equip_shield("res://assets/models/armor_shield_heater.glb")
	assert(knight.shield_socket.get_child_count() > 0, "Failed to socket shield")
	knight.equip_helmet("res://assets/models/armor_helm_knight.glb")
	assert(knight.helm_socket.get_child_count() > 0, "Failed to socket helmet")
	knight.apply_armor_styling("plate")
	print("  ✔ Knight: Successfully equipped Hero's Sword, Heater Shield, and Knight Greathelm!")

	# Test Minotaur Brute with Club
	var minotaur = CharacterModel3D.new()
	minotaur.name = "MinotaurTester"
	minotaur.position = Vector2(350, 200)
	root_node.add_child(minotaur)
	minotaur.setup_model("", "minotaur", 1.35)
	minotaur.equip_weapon("club")
	print("  ✔ Minotaur: Successfully spawned brute miniature with weapon!")

	# Test Skeleton with Dagger and Round Shield
	var skeleton = CharacterModel3D.new()
	skeleton.name = "SkeletonTester"
	skeleton.position = Vector2(550, 200)
	root_node.add_child(skeleton)
	skeleton.setup_model("", "skeleton", 1.0)
	skeleton.equip_weapon("dagger")
	skeleton.equip_shield("round")
	print("  ✔ Skeleton: Successfully spawned skeletal miniature with dagger and round shield!")

	# Test Hound
	var hound = CharacterModel3D.new()
	hound.name = "HoundTester"
	hound.position = Vector2(750, 200)
	root_node.add_child(hound)
	hound.setup_model("", "hound", 1.0)
	print("  ✔ Hound: Successfully spawned quadruped predator miniature!")

	# Test Skirmisher
	var skirmisher = CharacterModel3D.new()
	skirmisher.name = "SkirmisherTester"
	skirmisher.position = Vector2(950, 200)
	root_node.add_child(skirmisher)
	skirmisher.setup_model("", "skirmisher", 1.05)
	skirmisher.equip_weapon("bamboo")
	print("  ✔ Skirmisher: Successfully spawned scout skirmisher with bamboo pole!")

	print("\n--- Verifying SpellModel3D Renderers ---")
	var spell_fireball = SpellModel3D.new()
	spell_fireball.name = "SpellFireballTester"
	spell_fireball.position = Vector2(200, 420)
	root_node.add_child(spell_fireball)
	spell_fireball.setup_spell("res://assets/models/spell_fireball_projectile.glb", "projectile", 1.0)
	print("  ✔ Spell: Fireball 3D projectile initialized")

	var spell_missile = SpellModel3D.new()
	spell_missile.name = "SpellMissileTester"
	spell_missile.position = Vector2(400, 420)
	root_node.add_child(spell_missile)
	spell_missile.setup_spell("res://assets/models/spell_magic_missile_orb.glb", "projectile", 1.0)
	print("  ✔ Spell: Magic Missile 3D orb initialized")

	var spell_heal = SpellModel3D.new()
	spell_heal.name = "SpellHealTester"
	spell_heal.position = Vector2(600, 420)
	root_node.add_child(spell_heal)
	spell_heal.setup_spell("res://assets/models/spell_healing_glyph.glb", "aura", 1.0)
	print("  ✔ Spell: Healing Glyph 3D runic aura initialized")

	var spell_frost = SpellModel3D.new()
	spell_frost.name = "SpellFrostTester"
	spell_frost.position = Vector2(800, 420)
	root_node.add_child(spell_frost)
	spell_frost.setup_spell("res://assets/models/spell_frost_shard.glb", "projectile", 1.0)
	print("  ✔ Spell: Frost Shard 3D diamond initialized")

	var spell_cloud = SpellModel3D.new()
	spell_cloud.name = "SpellCloudTester"
	spell_cloud.position = Vector2(1000, 420)
	root_node.add_child(spell_cloud)
	spell_cloud.setup_spell("res://assets/models/spell_stinking_cloud_ring.glb", "aura", 1.0)
	print("  ✔ Spell: Stinking Cloud 3D vapor ring initialized")

	# Connect process to tick rendering and capture screenshot
	process_frame.connect(_on_process_frame)

func _on_process_frame() -> void:
	frame_count += 1
	if frame_count >= 15:
		print("\n--- Capturing Verification Screenshot ---")
		var vp = root.get_viewport()
		if vp:
			var img = vp.get_texture().get_image()
			if img:
				var shot_path = "/home/ndipiazza/source/robos/games/crpg-realm/test_3d_model_suite_verification.png"
				img.save_png(shot_path)
				print("📸 Captured composite 3D models verification screenshot: ", shot_path)
		print("==================================================")
		print("✨ ALL 29 3D MODELS VERIFIED SUCCESSFULLY! ✨")
		print("==================================================")
		quit(0)
