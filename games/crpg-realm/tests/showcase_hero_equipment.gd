extends SceneTree

# Interactive / Visual Showcase for RobOS cRPG 3D Hero Equipment
# Renders a high-resolution 1920x1080 gallery of Hero models wielding 3D weapons, shields, and armor.

const CharacterModel3D = preload("res://scripts/CharacterModel3D.gd")

var frame_count: int = 0
var root_node: Node2D = null

func _init() -> void:
	print("⚔️ Starting 3D Hero Equipment Showcase Scene...")

	root_node = Node2D.new()
	root_node.name = "ShowcaseRoot"
	root.add_child(root_node)

	# 1. Dark fantasy tabletop background
	var bg = ColorRect.new()
	bg.size = Vector2(1920, 1080)
	bg.color = Color(0.06, 0.08, 0.12, 1.0) # Deep slate navy #0f141f
	root_node.add_child(bg)

	# Header Title
	var title_panel = Panel.new()
	title_panel.position = Vector2(40, 30)
	title_panel.size = Vector2(1840, 85)
	root_node.add_child(title_panel)

	var title_label = Label.new()
	title_label.text = "ROBOS cRPG — 3D HERO EQUIPMENT & RIG SOCKET ATTACHMENT SHOWCASE"
	title_label.position = Vector2(25, 12)
	title_label.add_theme_font_size_override("font_size", 28)
	title_label.add_theme_color_override("font_color", Color(0.0, 0.85, 0.95)) # Cyan
	title_panel.add_child(title_label)

	var subtitle_label = Label.new()
	subtitle_label.text = "Dual-State KGraph Linked glTF 2.0 Binary Meshes • Dynamic Character Rig Sockets (WeaponSocket, ShieldSocket, HelmSocket) • PBR Materials"
	subtitle_label.position = Vector2(26, 48)
	subtitle_label.add_theme_font_size_override("font_size", 16)
	subtitle_label.add_theme_color_override("font_color", Color(0.7, 0.75, 0.82))
	title_panel.add_child(subtitle_label)

	# Free QA overlay for pristine screenshot
	for child in root.get_children():
		if "QAOverlay" in child.name or "QA" in child.name:
			child.queue_free()

	# Showcase configurations (6 hero loadouts)
	var loadouts = [
		{
			"title": "HERO'S SWORD & SHIELD",
			"category": "Versatile Martial (1d8/1d10)",
			"model": "res://assets/models/character_knight_pawn.glb",
			"weapon": "heros-sword",
			"shield": "res://assets/models/armor_shield_heater.glb",
			"helmet": "res://assets/models/armor_helm_knight.glb",
			"armor_style": "plate",
			"facing": -0.38,
			"desc": "Legendary gold-pommeled blade with reinforced heater shield and knight greathelm."
		},
		{
			"title": "TWO-HANDED GREATSWORD",
			"category": "Heavy Two-Handed (2d6)",
			"model": "res://assets/models/character_knight_pawn.glb",
			"weapon": "greatsword",
			"shield": "",
			"helmet": "res://assets/models/armor_helm_iron.glb",
			"armor_style": "plate",
			"facing": -0.42,
			"desc": "Massive Zweihänder blade with crossguard lugs and fluted steel iron helm."
		},
		{
			"title": "WARHAMMER & TOWER SHIELD",
			"category": "Crushing Bludgeoning (1d8+STR)",
			"model": "res://assets/models/character_knight_pawn.glb",
			"weapon": "warhammer",
			"shield": "res://assets/models/armor_shield_tower.glb",
			"helmet": "res://assets/models/armor_helm_iron.glb",
			"armor_style": "chain",
			"facing": -0.30,
			"desc": "Heavy spiked warhammer paired with a full-body Roman/Norman tower pavise shield."
		},
		{
			"title": "BATTLEAXE & ROUND SHIELD",
			"category": "Viking Cleaver (1d8/1d10)",
			"model": "res://assets/models/character_knight_pawn.glb",
			"weapon": "battleaxe",
			"shield": "res://assets/models/armor_shield_round.glb",
			"helmet": "",
			"armor_style": "chain",
			"facing": -0.40,
			"desc": "Double-beveled crescent battleaxe paired with a wooden riveted round shield."
		},
		{
			"title": "RAPIER & LEATHER ARMOR",
			"category": "Finesse Duelist (1d8)",
			"model": "res://assets/models/character_rogue_pawn.glb",
			"weapon": "rapier",
			"shield": "",
			"helmet": "",
			"armor_style": "leather",
			"facing": -0.45,
			"desc": "Basket-hilted thrusting rapier equipped on agile rogue miniature in boiled leather."
		},
		{
			"title": "HEAVY CROSSBOW & BOLTS",
			"category": "Ranged Ammunition (1d10)",
			"model": "res://assets/models/character_knight_pawn.glb",
			"weapon": "crossbow",
			"shield": "",
			"helmet": "res://assets/models/armor_helm_iron.glb",
			"armor_style": "chain",
			"facing": -0.32,
			"desc": "Mechanical steel-prod arbalest crossbow with stirrup for long-range dungeon sniping."
		}
	]

	var col_width = 295
	var start_x = 185
	var y_pos = 450

	for i in range(loadouts.size()):
		var cfg = loadouts[i]
		var x_pos = start_x + (i * col_width)

		# Pedestal Card Panel
		var card = Panel.new()
		card.position = Vector2(x_pos - 135, 140)
		card.size = Vector2(275, 890)
		root_node.add_child(card)

		# Setup 3D Character Model
		var hero_m3d = CharacterModel3D.new()
		hero_m3d.name = "ShowcaseHero_" + str(i)
		hero_m3d.position = Vector2(x_pos, y_pos)
		root_node.add_child(hero_m3d)

		# Initialize model
		hero_m3d.setup_model(cfg["model"], "knight", 1.0)
		
		# Enhance viewport for showcase resolution & framing
		if hero_m3d.sub_viewport:
			hero_m3d.sub_viewport.size = Vector2i(260, 300)
			hero_m3d.sub_viewport.msaa_3d = Viewport.MSAA_8X
		if hero_m3d.camera_3d:
			hero_m3d.camera_3d.position = Vector3(0.0, 1.40, 2.15)
			hero_m3d.camera_3d.look_at_from_position(Vector3(0.0, 1.40, 2.15), Vector3(0.0, 0.40, 0.0), Vector3.UP)
			hero_m3d.camera_3d.fov = 34.0
		if hero_m3d.display_sprite:
			hero_m3d.display_sprite.scale = Vector2(1.0, 1.0)

		# Equip items into sockets
		if cfg["weapon"] != "":
			hero_m3d.equip_weapon(cfg["weapon"])
		if cfg["shield"] != "":
			hero_m3d.equip_shield(cfg["shield"])
		if cfg["helmet"] != "":
			hero_m3d.equip_helmet(cfg["helmet"])
		if cfg["armor_style"] != "":
			hero_m3d.apply_armor_styling(cfg["armor_style"])

		# Turn hero to 3/4 dramatic facing angle
		hero_m3d.target_facing_yaw = cfg["facing"]
		if hero_m3d.model_pivot:
			hero_m3d.model_pivot.rotation.y = cfg["facing"]

		# Top Card Header (Item Title)
		var h_label = Label.new()
		h_label.text = cfg["title"]
		h_label.position = Vector2(x_pos - 120, 155)
		h_label.size = Vector2(245, 45)
		h_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		h_label.add_theme_font_size_override("font_size", 14)
		h_label.add_theme_color_override("font_color", Color(1.0, 0.84, 0.0)) # Gold #ffd700
		root_node.add_child(h_label)

		# Category / Damage
		var cat_label = Label.new()
		cat_label.text = cfg["category"]
		cat_label.position = Vector2(x_pos - 120, 205)
		cat_label.size = Vector2(245, 30)
		cat_label.add_theme_font_size_override("font_size", 12)
		cat_label.add_theme_color_override("font_color", Color(0.4, 0.9, 0.6)) # Mint green
		root_node.add_child(cat_label)

		# Bottom Info Panel
		var info_y = 660
		var socket_info = Label.new()
		socket_info.text = "SOCKET ATTACHMENTS:\n• Weapon: %s\n• Shield: %s\n• Helm: %s\n• Armor PBR: %s" % [
			cfg["weapon"].get_file() if cfg["weapon"] != "" else "None",
			cfg["shield"].get_file() if cfg["shield"] != "" else "None",
			cfg["helmet"].get_file() if cfg["helmet"] != "" else "None",
			cfg["armor_style"].to_upper()
		]
		socket_info.position = Vector2(x_pos - 120, info_y)
		socket_info.size = Vector2(245, 95)
		socket_info.add_theme_font_size_override("font_size", 11)
		socket_info.add_theme_color_override("font_color", Color(0.75, 0.82, 0.9))
		root_node.add_child(socket_info)

		var desc_label = Label.new()
		desc_label.text = cfg["desc"]
		desc_label.position = Vector2(x_pos - 120, info_y + 110)
		desc_label.custom_minimum_size = Vector2(240, 80)
		desc_label.size = Vector2(240, 80)
		desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc_label.add_theme_font_size_override("font_size", 11)
		desc_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85))
		root_node.add_child(desc_label)

	# Connect process to wait for frame renders and screenshot
	process_frame.connect(_on_process_frame)

func _on_process_frame() -> void:
	frame_count += 1
	if frame_count >= 15:
		print("📸 Capturing high-resolution 1920x1080 Hero Equipment Showcase...")
		var vp = root.get_viewport()
		if vp:
			var img = vp.get_texture().get_image()
			if img:
				var shot_path = "/home/ndipiazza/source/robos/games/crpg-realm/assets/hero_equipment_showcase.png"
				img.save_png(shot_path)
				print("✨ Successfully saved Hero Equipment Showcase to: ", shot_path)
		quit(0)
