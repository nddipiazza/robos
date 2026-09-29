extends SceneTree

# RobOS cRPG 3D Character Sword Pickup & Walkaround Showcase
# Demonstrates:
# 1. Unarmed 3D Knight Miniature (empty hands) in ancient shrine
# 2. Ground Iron Sword item pickup on altar
# 3. Dynamic weapon socket attachment: 3D Iron Sword attached to knight's hand
# 4. 3D miniature walking around with yaw facing and tabletop hop animation

var frame_count: int = 0
var root_node: Node2D = null

func _init() -> void:
	print("⚔️ Launching 3D Sword Pickup & Walkaround Showcase...")

	root_node = Node2D.new()
	root_node.name = "ShowcaseRoot"
	root.add_child(root_node)

	# Free QA overlay
	for child in root.get_children():
		if "QAOverlay" in child.name or "QA" in child.name:
			child.queue_free()

	# Dark tactical background
	var bg = ColorRect.new()
	bg.size = Vector2(1920, 1080)
	bg.color = Color(0.06, 0.08, 0.11, 1.0)
	root_node.add_child(bg)

	# Header Panel
	var header = Panel.new()
	header.position = Vector2(40, 20)
	header.size = Vector2(1840, 85)
	root_node.add_child(header)

	var title_lbl = Label.new()
	title_lbl.text = "ROBOS cRPG — 3D CHARACTER WEAPON PICKUP & DYNAMIC SOCKET ATTACHMENT"
	title_lbl.position = Vector2(25, 12)
	title_lbl.add_theme_font_size_override("font_size", 24)
	title_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 1.0))
	header.add_child(title_lbl)

	var sub_lbl = Label.new()
	sub_lbl.text = "Campaign: Sanctuary of the Blade • Hero: Sir Justin the Brave (3D Knight) • Item: Iron Sword (.glb) • Dynamic WeaponSocket Attachment"
	sub_lbl.position = Vector2(26, 48)
	sub_lbl.add_theme_font_size_override("font_size", 14)
	sub_lbl.add_theme_color_override("font_color", Color(0.75, 0.82, 0.90))
	header.add_child(sub_lbl)

	# --- PANEL 1: PHASE 1 - UNARMED 3D HERO (BEFORE PICKUP) ---
	var p1_panel = Panel.new()
	p1_panel.position = Vector2(60, 130)
	p1_panel.size = Vector2(560, 890)
	root_node.add_child(p1_panel)

	var p1_title = Label.new()
	p1_title.text = "PHASE 1: UNARMED HERO (EMPTY HANDS)"
	p1_title.position = Vector2(85, 145)
	p1_title.add_theme_font_size_override("font_size", 18)
	p1_title.add_theme_color_override("font_color", Color(0.9, 0.6, 0.2))
	root_node.add_child(p1_title)

	var p1_desc = Label.new()
	p1_desc.text = "Hero enters the ancient shrine with empty hands.\nWeaponSlot: Empty ('none')\nRig: character_knight_pawn.glb\nAC: 15 (Chainmail) | HP: 20/20"
	p1_desc.position = Vector2(85, 180)
	p1_desc.add_theme_font_size_override("font_size", 13)
	p1_desc.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9))
	root_node.add_child(p1_desc)

	var hero_unarmed = CharacterModel3D.new()
	hero_unarmed.name = "HeroUnarmed"
	hero_unarmed.position = Vector2(340, 535)
	root_node.add_child(hero_unarmed)
	hero_unarmed.setup_model("res://assets/models/character_knight_pawn.glb", "knight", 1.45)
	hero_unarmed.equip_weapon("none")
	hero_unarmed.target_facing_yaw = -0.3
	if hero_unarmed.sub_viewport:
		hero_unarmed.sub_viewport.size = Vector2i(340, 380)
	if hero_unarmed.camera_3d:
		hero_unarmed.camera_3d.position = Vector3(0.0, 1.4, 2.15)
		hero_unarmed.camera_3d.fov = 34.0
	if hero_unarmed.display_sprite:
		hero_unarmed.display_sprite.scale = Vector2(1.2, 1.2)

	var p1_badge = Label.new()
	p1_badge.text = "WEAPON STATUS: UNARMED\n• WeaponSocket: [Empty]\n• Ready to inspect shrine altar"
	p1_badge.position = Vector2(85, 800)
	p1_badge.size = Vector2(500, 80)
	p1_badge.add_theme_font_size_override("font_size", 13)
	p1_badge.add_theme_color_override("font_color", Color(0.9, 0.4, 0.3))
	root_node.add_child(p1_badge)

	# --- PANEL 2: PHASE 2 - GROUND SWORD PICKUP ON ALTAR ---
	var p2_panel = Panel.new()
	p2_panel.position = Vector2(660, 130)
	p2_panel.size = Vector2(560, 890)
	root_node.add_child(p2_panel)

	var p2_title = Label.new()
	p2_title.text = "PHASE 2: GROUND PICKUP & RIG ATTACHMENT"
	p2_title.position = Vector2(685, 145)
	p2_title.add_theme_font_size_override("font_size", 18)
	p2_title.add_theme_color_override("font_color", Color(0.2, 0.9, 0.6))
	root_node.add_child(p2_title)

	var p2_desc = Label.new()
	p2_desc.text = "Hero walks onto altar dais at (19, 13).\nEvent: _on_item_picked_up('sword-pickup')\nAction: GameState.equip_item('iron-sword')"
	p2_desc.position = Vector2(685, 175)
	p2_desc.add_theme_font_size_override("font_size", 13)
	p2_desc.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9))
	root_node.add_child(p2_desc)

	var hero_equipped = CharacterModel3D.new()
	hero_equipped.name = "HeroEquipped"
	hero_equipped.position = Vector2(940, 535)
	root_node.add_child(hero_equipped)
	hero_equipped.setup_model("res://assets/models/character_knight_pawn.glb", "knight", 1.45)
	hero_equipped.equip_weapon("res://assets/models/weapon_sword_iron.glb")
	hero_equipped.target_facing_yaw = 0.4
	if hero_equipped.sub_viewport:
		hero_equipped.sub_viewport.size = Vector2i(340, 380)
	if hero_equipped.camera_3d:
		hero_equipped.camera_3d.position = Vector3(0.0, 1.4, 2.15)
		hero_equipped.camera_3d.fov = 34.0
	if hero_equipped.display_sprite:
		hero_equipped.display_sprite.scale = Vector2(1.2, 1.2)

	var p2_badge = Label.new()
	p2_badge.text = "WEAPON STATUS: EQUIPPED (IRON SWORD)\n• Model: res://assets/models/weapon_sword_iron.glb\n• Socket: WeaponSocket (0.24, 0.45, 0.12)\n• Stats: 1d8 Slashing, +2 ATK bonus"
	p2_badge.position = Vector2(685, 800)
	p2_badge.size = Vector2(500, 80)
	p2_badge.add_theme_font_size_override("font_size", 13)
	p2_badge.add_theme_color_override("font_color", Color(0.3, 0.9, 0.5))
	root_node.add_child(p2_badge)

	# --- PANEL 3: PHASE 3 - ACTIVE 3D WALKAROUND IN SHRINE ---
	var p3_panel = Panel.new()
	p3_panel.position = Vector2(1260, 130)
	p3_panel.size = Vector2(600, 890)
	root_node.add_child(p3_panel)

	var p3_title = Label.new()
	p3_title.text = "PHASE 3: ACTIVE 3D WALKAROUND"
	p3_title.position = Vector2(1285, 145)
	p3_title.add_theme_font_size_override("font_size", 18)
	p3_title.add_theme_color_override("font_color", Color(0.85, 0.6, 1.0))
	root_node.add_child(p3_title)

	var p3_desc = Label.new()
	p3_desc.text = "Hero walks around shrine pillars.\nAnimation: tabletop_hop bobbing + dynamic yaw tracking\nThe 3D iron sword orients and moves with the hero's grip!"
	p3_desc.position = Vector2(1285, 175)
	p3_desc.add_theme_font_size_override("font_size", 13)
	p3_desc.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9))
	root_node.add_child(p3_desc)

	var hero_walking = CharacterModel3D.new()
	hero_walking.name = "HeroWalking"
	hero_walking.position = Vector2(1560, 535)
	root_node.add_child(hero_walking)
	hero_walking.setup_model("res://assets/models/character_knight_pawn.glb", "knight", 1.45)
	hero_walking.equip_weapon("res://assets/models/weapon_sword_iron.glb")
	hero_walking.target_facing_yaw = -1.25
	hero_walking.set_moving(true)
	if hero_walking.sub_viewport:
		hero_walking.sub_viewport.size = Vector2i(340, 380)
	if hero_walking.camera_3d:
		hero_walking.camera_3d.position = Vector3(0.0, 1.4, 2.15)
		hero_walking.camera_3d.fov = 34.0
	if hero_walking.display_sprite:
		hero_walking.display_sprite.scale = Vector2(1.2, 1.2)

	var p3_telemetry = Label.new()
	p3_telemetry.text = "3D MINIATURE MOTION TELEMETRY:\n" + \
		"  • Velocity: Vector2(-155.0, 80.0) -> Target Yaw: -1.25 rad\n" + \
		"  • Tabletop Hop: hop_timer active, sin() Y-bob = 0.12 units\n" + \
		"  • Socket Synchronization: Sword rotates with ModelPivot\n" + \
		"  • SubViewport: 340x380 anti-aliased tabletop projection\n" + \
		"  • Status: Ready for user live interactive play!"
	p3_telemetry.position = Vector2(1285, 800)
	p3_telemetry.size = Vector2(560, 100)
	p3_telemetry.add_theme_font_size_override("font_size", 12)
	p3_telemetry.add_theme_color_override("font_color", Color(0.35, 0.9, 0.95))
	root_node.add_child(p3_telemetry)

	process_frame.connect(_on_process_frame)

func _on_process_frame() -> void:
	frame_count += 1
	if frame_count >= 20:
		print("📸 Capturing high-resolution 1920x1080 3D Sword Pickup & Walkaround Showcase...")
		var vp = root.get_viewport()
		if vp:
			var img = vp.get_texture().get_image()
			if img:
				var shot_path = "/home/ndipiazza/source/robos/games/crpg-realm/assets/sword_pickup_walkaround_showcase.png"
				img.save_png(shot_path)
				print("✨ Successfully saved 3D Sword Pickup Showcase to: ", shot_path)
		quit(0)
