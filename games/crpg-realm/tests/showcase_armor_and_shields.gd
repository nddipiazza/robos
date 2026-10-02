extends SceneTree

# RobOS cRPG 3D Miniature Equipment & Armor Deflection Showcase (Refined)
# Demonstrates:
# 1. Authentic tabletop miniature scaling with circular stone pedestals
# 2. Deliberate, developer-friendly pacing (~5 seconds per stage, ~30s total)
# 3. 6 progression stages: Unarmored (12) -> Leather (13) -> Heater Shield (15) -> Chain + Round Shield (18) -> Full Plate + Tower Shield + Greathelm (20)
# 4. Detailed 2-strike combat deflection with animated d20 rolls and SFX

const CharacterModel3D = preload("res://scripts/CharacterModel3D.gd")

var frame_count: int = 0
var root_node: Node2D = null

# UI Elements for dynamic updates
var hero_m3d: CharacterModel3D = null
var enemy_m3d: CharacterModel3D = null
var ac_val_label: Label = null
var ac_formula_label: Label = null
var slot_weapon_label: Label = null
var slot_shield_label: Label = null
var slot_armor_label: Label = null
var slot_helmet_label: Label = null
var stage_badge: Label = null
var stage_subbadge: Label = null
var log_vbox: VBoxContainer = null
var projectile_node: Line2D = null
var deflection_label: Label = null
var spark_ring: Node2D = null

# Dice Roll Panel elements
var dice_panel: Panel = null
var dice_roll_label: Label = null
var dice_calc_label: Label = null
var dice_result_label: Label = null

var projectile_active: bool = false
var projectile_t: float = 0.0
var strike_phase: int = 0

func _init() -> void:
	print("🛡️ Launching Refined 3D Tabletop Miniature Equipment & Armor Deflection Showcase...")

	root_node = Node2D.new()
	root_node.name = "ArmorShieldsShowcaseRoot"
	root.add_child(root_node)

	# Free any leftover QA overlays
	for child in root.get_children():
		if "QAOverlay" in child.name or "QA" in child.name:
			child.queue_free()

	# Background: Deep tactical slate navy
	var bg = ColorRect.new()
	bg.size = Vector2(1920, 1080)
	bg.color = Color(0.06, 0.08, 0.12, 1.0)
	root_node.add_child(bg)

	# ── Header Panel ─────────────────────────────────────────────────────────────
	var header_panel = Panel.new()
	header_panel.position = Vector2(40, 20)
	header_panel.size = Vector2(1840, 90)
	root_node.add_child(header_panel)

	var title_lbl = Label.new()
	title_lbl.text = "ROBOS cRPG — 3D TABLETOP MINIATURE EQUIPMENT & ARMOR DEFLECTION SHOWCASE"
	title_lbl.position = Vector2(25, 14)
	title_lbl.add_theme_font_size_override("font_size", 25)
	title_lbl.add_theme_color_override("font_color", Color(0.3, 0.88, 1.0))
	header_panel.add_child(title_lbl)

	var sub_lbl = Label.new()
	sub_lbl.text = "Authentic D&D 5e AC Recalculation • Tabletop Miniature Scale • ShieldSocket & HelmSocket Rigging • PBR Material Progression"
	sub_lbl.position = Vector2(26, 50)
	sub_lbl.add_theme_font_size_override("font_size", 14)
	sub_lbl.add_theme_color_override("font_color", Color(0.75, 0.82, 0.90))
	header_panel.add_child(sub_lbl)

	# ── Left Column: Hero Loadout & AC Gauge (Width: 440) ─────────────────────────
	var left_panel = Panel.new()
	left_panel.position = Vector2(40, 125)
	left_panel.size = Vector2(440, 925)
	root_node.add_child(left_panel)

	var hero_title = Label.new()
	hero_title.text = "LIEUTENANT VANCE (HERO)"
	hero_title.position = Vector2(25, 18)
	hero_title.add_theme_font_size_override("font_size", 19)
	hero_title.add_theme_color_override("font_color", Color(1.0, 0.84, 0.2))
	left_panel.add_child(hero_title)

	var hero_meta = Label.new()
	hero_meta.text = "Human Fighter • Level 3 • HP 28/28\nSTR 16 (+3) | DEX 14 (+2) | CON 14 (+2)"
	hero_meta.position = Vector2(25, 52)
	hero_meta.add_theme_font_size_override("font_size", 13)
	hero_meta.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9))
	left_panel.add_child(hero_meta)

	# Big AC Display Box
	var ac_box = Panel.new()
	ac_box.position = Vector2(25, 110)
	ac_box.size = Vector2(390, 135)
	left_panel.add_child(ac_box)

	var ac_header = Label.new()
	ac_header.text = "ARMOR CLASS (AC)"
	ac_header.position = Vector2(20, 12)
	ac_header.add_theme_font_size_override("font_size", 13)
	ac_header.add_theme_color_override("font_color", Color(0.6, 0.7, 0.8))
	ac_box.add_child(ac_header)

	ac_val_label = Label.new()
	ac_val_label.text = "12"
	ac_val_label.position = Vector2(20, 30)
	ac_val_label.add_theme_font_size_override("font_size", 52)
	ac_val_label.add_theme_color_override("font_color", Color(0.2, 0.95, 0.5))
	ac_box.add_child(ac_val_label)

	ac_formula_label = Label.new()
	ac_formula_label.text = "Unarmored Base (10) + DEX Mod (+2) = 12"
	ac_formula_label.position = Vector2(20, 98)
	ac_formula_label.add_theme_font_size_override("font_size", 12)
	ac_formula_label.add_theme_color_override("font_color", Color(0.75, 0.85, 0.95))
	ac_box.add_child(ac_formula_label)

	# Equipment Slots Card
	var slots_hdr = Label.new()
	slots_hdr.text = "ACTIVE EQUIPMENT SLOTS"
	slots_hdr.position = Vector2(25, 260)
	slots_hdr.add_theme_font_size_override("font_size", 15)
	slots_hdr.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
	left_panel.add_child(slots_hdr)

	var slots_card = Panel.new()
	slots_card.position = Vector2(25, 290)
	slots_card.size = Vector2(390, 275)
	left_panel.add_child(slots_card)

	slot_weapon_label = Label.new()
	slot_weapon_label.text = "⚔️ Main Hand:  Royal Service Sword (1d8)"
	slot_weapon_label.position = Vector2(18, 18)
	slot_weapon_label.add_theme_font_size_override("font_size", 13)
	slot_weapon_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	slots_card.add_child(slot_weapon_label)

	slot_shield_label = Label.new()
	slot_shield_label.text = "🛡️ Off Hand:    None (Open Hand)"
	slot_shield_label.position = Vector2(18, 72)
	slot_shield_label.add_theme_font_size_override("font_size", 13)
	slot_shield_label.add_theme_color_override("font_color", Color(0.7, 0.75, 0.8))
	slots_card.add_child(slot_shield_label)

	slot_armor_label = Label.new()
	slot_armor_label.text = "🥋 Body Armor:  Traveler Tunic (Unarmored)"
	slot_armor_label.position = Vector2(18, 126)
	slot_armor_label.add_theme_font_size_override("font_size", 13)
	slot_armor_label.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
	slots_card.add_child(slot_armor_label)

	slot_helmet_label = Label.new()
	slot_helmet_label.text = "🪖 Head / Helm: None"
	slot_helmet_label.position = Vector2(18, 180)
	slot_helmet_label.add_theme_font_size_override("font_size", 13)
	slot_helmet_label.add_theme_color_override("font_color", Color(0.7, 0.75, 0.8))
	slots_card.add_child(slot_helmet_label)

	var socket_status = Label.new()
	socket_status.text = "• Sockets: WeaponSocket, ShieldSocket, HelmSocket"
	socket_status.position = Vector2(18, 235)
	socket_status.add_theme_font_size_override("font_size", 11)
	socket_status.add_theme_color_override("font_color", Color(0.4, 0.85, 0.6))
	slots_card.add_child(socket_status)

	# D&D 5e Rules Box
	var rules_card = Panel.new()
	rules_card.position = Vector2(25, 580)
	rules_card.size = Vector2(390, 325)
	left_panel.add_child(rules_card)

	var r_title = Label.new()
	r_title.text = "D&D 5E ARMOR & SHIELD SPECIFICATION"
	r_title.position = Vector2(18, 15)
	r_title.add_theme_font_size_override("font_size", 13)
	r_title.add_theme_color_override("font_color", Color(0.4, 0.9, 0.6))
	rules_card.add_child(r_title)

	var r_body = Label.new()
	r_body.text = "• Unarmored: 10 + Full DEX modifier (+2)\n• Light Armor: Base AC + Full DEX modifier (+2)\n• Medium Armor: Base AC + DEX modifier (Max +2)\n• Heavy Armor: Flat Base AC (No DEX modifier)\n• Shields: Flat +2 AC bonus when equipped in off-hand\n• Sockets: ShieldSocket, WeaponSocket, HelmSocket\n• Materials: PBR Metallic, Roughness & Albedo Tint\n• Deflection Rule: Hits only if Attack Roll >= AC"
	r_body.position = Vector2(18, 48)
	r_body.add_theme_font_size_override("font_size", 12)
	r_body.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9))
	rules_card.add_child(r_body)

	# ── Center Stage: 3D Battle Arena & Miniatures (Width: 920) ───────────────────
	var center_panel = Panel.new()
	center_panel.position = Vector2(500, 125)
	center_panel.size = Vector2(920, 925)
	root_node.add_child(center_panel)

	# Stage Banner
	stage_badge = Label.new()
	stage_badge.text = "STAGE 1: BASELINE UNARMORED / TRAVELER TUNIC (AC 12)"
	stage_badge.position = Vector2(25, 18)
	stage_badge.add_theme_font_size_override("font_size", 17)
	stage_badge.add_theme_color_override("font_color", Color(0.3, 0.88, 1.0))
	center_panel.add_child(stage_badge)

	stage_subbadge = Label.new()
	stage_subbadge.text = "Vance begins unarmored with Royal Guard Service Sword • AC = 10 + DEX mod (+2) = 12"
	stage_subbadge.position = Vector2(26, 48)
	stage_subbadge.add_theme_font_size_override("font_size", 13)
	stage_subbadge.add_theme_color_override("font_color", Color(0.7, 0.75, 0.82))
	center_panel.add_child(stage_subbadge)

	# Tabletop Arena Floor: Circular Stone Pedestals
	_create_miniature_pedestal(center_panel, Vector2(270, 560), 170.0, Color(0.18, 0.22, 0.28, 0.95), Color(0.3, 0.85, 1.0, 0.8))
	_create_miniature_pedestal(center_panel, Vector2(710, 560), 150.0, Color(0.18, 0.22, 0.28, 0.95), Color(1.0, 0.4, 0.4, 0.8))

	# Hero 3D Miniature (Smaller, Tabletop Proportions)
	hero_m3d = CharacterModel3D.new()
	hero_m3d.name = "ShowcaseHeroKnight"
	hero_m3d.position = Vector2(270, 500)
	center_panel.add_child(hero_m3d)
	hero_m3d.setup_model("res://assets/models/character_knight_pawn.glb", "knight", 0.95)
	hero_m3d.equip_weapon("res://assets/models/weapon_sword_iron.glb")
	hero_m3d.apply_armor_styling("cloth")
	hero_m3d.target_facing_yaw = -0.35
	if hero_m3d.sub_viewport:
		hero_m3d.sub_viewport.size = Vector2i(440, 480)
		hero_m3d.sub_viewport.msaa_3d = Viewport.MSAA_8X
	if hero_m3d.camera_3d:
		hero_m3d.camera_3d.position = Vector3(0.0, 1.45, 2.75)
		hero_m3d.camera_3d.look_at_from_position(Vector3(0.0, 1.45, 2.75), Vector3(0.0, 0.45, 0.0), Vector3.UP)
		hero_m3d.camera_3d.fov = 30.0
	if hero_m3d.display_sprite:
		hero_m3d.display_sprite.scale = Vector2(0.90, 0.90)

	var hero_lbl = Label.new()
	hero_lbl.text = "Lieutenant Vance (Tabletop Miniature)"
	hero_lbl.position = Vector2(165, 730)
	hero_lbl.add_theme_font_size_override("font_size", 14)
	hero_lbl.add_theme_color_override("font_color", Color(1.0, 0.84, 0.2))
	center_panel.add_child(hero_lbl)

	# Enemy 3D Miniature (Skirmisher, Tabletop Scale)
	enemy_m3d = CharacterModel3D.new()
	enemy_m3d.name = "ShowcaseEnemySkirmisher"
	enemy_m3d.position = Vector2(710, 500)
	center_panel.add_child(enemy_m3d)
	enemy_m3d.setup_model("res://assets/models/monster_skirmisher_pawn.glb", "skirmisher", 0.90)
	enemy_m3d.equip_weapon("res://assets/models/weapon_spear.glb")
	enemy_m3d.target_facing_yaw = 0.45
	if enemy_m3d.sub_viewport:
		enemy_m3d.sub_viewport.size = Vector2i(400, 480)
		enemy_m3d.sub_viewport.msaa_3d = Viewport.MSAA_8X
	if enemy_m3d.camera_3d:
		enemy_m3d.camera_3d.position = Vector3(0.0, 1.45, 2.75)
		enemy_m3d.camera_3d.look_at_from_position(Vector3(0.0, 1.45, 2.75), Vector3(0.0, 0.45, 0.0), Vector3.UP)
		enemy_m3d.camera_3d.fov = 30.0
	if enemy_m3d.display_sprite:
		enemy_m3d.display_sprite.scale = Vector2(0.85, 0.85)

	var enemy_lbl = Label.new()
	enemy_lbl.text = "Corrupted Skirmisher (Atk +4)"
	enemy_lbl.position = Vector2(620, 730)
	enemy_lbl.add_theme_font_size_override("font_size", 14)
	enemy_lbl.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
	center_panel.add_child(enemy_lbl)

	# Attack trajectory line
	projectile_node = Line2D.new()
	projectile_node.width = 3.5
	projectile_node.default_color = Color(1.0, 0.85, 0.3, 0.95)
	projectile_node.visible = false
	center_panel.add_child(projectile_node)

	# Spark deflection ring
	spark_ring = Node2D.new()
	spark_ring.position = Vector2(310, 500)
	spark_ring.visible = false
	center_panel.add_child(spark_ring)

	deflection_label = Label.new()
	deflection_label.text = "🛡️ DEFLECTED!\nRolled 14 vs AC 20 (Missed)"
	deflection_label.position = Vector2(170, 380)
	deflection_label.add_theme_font_size_override("font_size", 21)
	deflection_label.add_theme_color_override("font_color", Color(0.2, 1.0, 0.6))
	deflection_label.visible = false
	center_panel.add_child(deflection_label)

	# ── Animated Dice Roll HUD Panel (Bottom Center) ──────────────────────────────
	dice_panel = Panel.new()
	dice_panel.position = Vector2(180, 775)
	dice_panel.size = Vector2(560, 125)
	dice_panel.visible = false
	center_panel.add_child(dice_panel)

	dice_roll_label = Label.new()
	dice_roll_label.text = "🎲 D20 ATTACK ROLL: 13"
	dice_roll_label.position = Vector2(25, 12)
	dice_roll_label.add_theme_font_size_override("font_size", 18)
	dice_roll_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2))
	dice_panel.add_child(dice_roll_label)

	dice_calc_label = Label.new()
	dice_calc_label.text = "Formula: 13 (d20) + 4 (Skirmisher Attack Bonus) = 17"
	dice_calc_label.position = Vector2(25, 45)
	dice_calc_label.add_theme_font_size_override("font_size", 13)
	dice_calc_label.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9))
	dice_panel.add_child(dice_calc_label)

	dice_result_label = Label.new()
	dice_result_label.text = "Comparison: 17 < AC 20 -> DEFLECTED (0 Damage Taken)"
	dice_result_label.position = Vector2(25, 78)
	dice_result_label.add_theme_font_size_override("font_size", 15)
	dice_result_label.add_theme_color_override("font_color", Color(0.2, 1.0, 0.6))
	dice_panel.add_child(dice_result_label)

	# ── Right Column: Telemetry & Combat Event Feed (Width: 420) ──────────────────
	var right_panel = Panel.new()
	right_panel.position = Vector2(1440, 125)
	right_panel.size = Vector2(440, 925)
	root_node.add_child(right_panel)

	var feed_hdr = Label.new()
	feed_hdr.text = "EQUIPMENT & DEFLECTION LOG"
	feed_hdr.position = Vector2(25, 18)
	feed_hdr.add_theme_font_size_override("font_size", 18)
	feed_hdr.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
	right_panel.add_child(feed_hdr)

	var scroll = ScrollContainer.new()
	scroll.position = Vector2(25, 55)
	scroll.size = Vector2(390, 845)
	right_panel.add_child(scroll)

	log_vbox = VBoxContainer.new()
	log_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(log_vbox)

	_add_log("INIT", "Initialized 3D Tabletop Miniature Showcase", Color(0.6, 0.8, 1.0))
	_add_log("LOADOUT", "Vance clad in Traveler Tunic (Unarmored Base AC 12)", Color(0.8, 0.8, 0.8))

	process_frame.connect(_on_process_frame)

func _create_miniature_pedestal(parent: CanvasItem, center_pos: Vector2, radius: float, fill_col: Color, rim_col: Color) -> void:
	var base_poly = Polygon2D.new()
	var points = PackedVector2Array()
	var segments = 40
	for i in range(segments):
		var ang = (float(i) / float(segments)) * TAU
		points.append(center_pos + Vector2(cos(ang) * radius, sin(ang) * (radius * 0.48)))
	base_poly.polygon = points
	base_poly.color = fill_col
	parent.add_child(base_poly)

	var rim = Line2D.new()
	rim.width = 2.5
	rim.default_color = rim_col
	for pt in points:
		rim.add_point(pt)
	rim.add_point(points[0])
	parent.add_child(rim)

func _add_log(prefix: String, text: String, color: Color) -> void:
	var lbl = Label.new()
	lbl.text = "[%s] %s" % [prefix, text]
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl.add_theme_font_size_override("font_size", 12)
	lbl.add_theme_color_override("font_color", color)
	log_vbox.add_child(lbl)

func _play_sfx(sfx_key: String) -> void:
	if root and root.has_node("AudioManager"):
		root.get_node("AudioManager").play_sfx(sfx_key)

func _on_process_frame() -> void:
	frame_count += 1

	# Gentle tabletop miniature breathing & facing oscillation
	if hero_m3d and hero_m3d.model_pivot:
		hero_m3d.model_pivot.rotation.y = -0.35 + sin(frame_count * 0.03) * 0.06
	if enemy_m3d and enemy_m3d.model_pivot:
		enemy_m3d.model_pivot.rotation.y = 0.45 + sin(frame_count * 0.03) * 0.05

	# ── STAGE 2 (Frame 120 / ~4.0s): Equips Cured Leather Armor ──────────────────
	if frame_count == 120:
		print("🥋 [Stage 2] Equipping Cured Leather Armor...")
		hero_m3d.apply_armor_styling("leather")
		ac_val_label.text = "13"
		ac_formula_label.text = "Leather Armor (11) + DEX Mod (+2) = 13"
		slot_armor_label.text = "🥋 Body Armor:  Cured Leather (Light, Base 11)"
		slot_armor_label.add_theme_color_override("font_color", Color(0.85, 0.65, 0.45))
		stage_badge.text = "STAGE 2: EQUIPPED CURED LEATHER ARMOR (AC 12 -> 13)"
		stage_subbadge.text = "PBR Material updated to boiled leather • Light armor grants full DEX modifier (+2)"
		_add_log("EQUIP", "Equipped 'leather-armor' into Body slot", Color(0.85, 0.65, 0.45))
		_add_log("PBR", "Applied 'leather' PBR shader (roughness: 0.75, metallic: 0.20)", Color(0.7, 0.8, 0.9))
		_add_log("AC", "AC Recalculated: 12 -> 13 (Light 11 + DEX 2)", Color(0.2, 0.95, 0.5))
		_play_sfx("melee_swing")

	# ── STAGE 3 (Frame 260 / ~8.6s): Equips Knightly Heater Shield ────────────────
	if frame_count == 260:
		print("🛡️ [Stage 3] Equipping Knightly Heater Shield into off-hand socket...")
		hero_m3d.equip_shield("res://assets/models/armor_shield_heater.glb")
		ac_val_label.text = "15"
		ac_formula_label.text = "Leather (11) + DEX (+2) + Heater Shield (+2) = 15"
		slot_shield_label.text = "🛡️ Off Hand:    Knightly Heater Shield (+2 AC)"
		slot_shield_label.add_theme_color_override("font_color", Color(0.3, 0.9, 1.0))
		stage_badge.text = "STAGE 3: EQUIPPED HEATER SHIELD (AC 13 -> 15)"
		stage_subbadge.text = "Attached 'armor_shield_heater.glb' to ShieldSocket (-0.25, 0.46, 0.12) • Off-hand +2 AC bonus"
		_add_log("SOCKET", "ShieldSocket attached 'armor_shield_heater.glb'", Color(0.3, 0.9, 1.0))
		_add_log("AC", "AC Recalculated: 13 -> 15 (+2 Shield Bonus)", Color(0.2, 0.95, 0.5))
		_play_sfx("melee_swing")

	# ── STAGE 4 (Frame 400 / ~13.3s): Equips Guard Chain Mail + Round Shield ───────
	if frame_count == 400:
		print("🥋 [Stage 4] Equipping Guard Chain Mail and Round Shield...")
		hero_m3d.apply_armor_styling("chain")
		hero_m3d.equip_shield("res://assets/models/armor_shield_round.glb")
		ac_val_label.text = "18"
		ac_formula_label.text = "Chain Mail Hauberk (16) + Round Shield (+2) = 18"
		slot_armor_label.text = "🥋 Body Armor:  Guard Chain Mail (Heavy, Base 16)"
		slot_armor_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
		slot_shield_label.text = "🛡️ Off Hand:    Iron-Rimmed Round Shield (+2 AC)"
		slot_shield_label.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
		stage_badge.text = "STAGE 4: GUARD CHAIN MAIL & ROUND SHIELD (AC 15 -> 18)"
		stage_subbadge.text = "PBR Material updated to interlocked steel rings • Heavy armor ignores DEX modifier"
		_add_log("EQUIP", "Swapped Armor to Chain Mail Hauberk (Base 16)", Color(0.7, 0.8, 0.9))
		_add_log("SOCKET", "Swapped ShieldSocket to 'armor_shield_round.glb'", Color(0.3, 0.9, 1.0))
		_add_log("AC", "AC Recalculated: 15 -> 18 (Chain Mail 16 + Shield 2)", Color(0.2, 0.95, 0.5))
		_play_sfx("melee_swing")

	# ── STAGE 5 (Frame 540 / ~18.0s): Equips Full Plate, Tower Shield, Greathelm ───
	if frame_count == 540:
		print("🏰 [Stage 5] Equipping Full Plate Armor, Tower Pavise & Knight Greathelm...")
		hero_m3d.apply_armor_styling("plate")
		hero_m3d.equip_shield("res://assets/models/armor_shield_tower.glb")
		hero_m3d.equip_helmet("res://assets/models/armor_helm_knight.glb")
		ac_val_label.text = "20"
		ac_formula_label.text = "Full Plate (18) + Tower Pavise Shield (+2) = 20"
		slot_armor_label.text = "🥋 Body Armor:  Full Plate Armor (Heavy, Base 18)"
		slot_armor_label.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0))
		slot_shield_label.text = "🛡️ Off Hand:    Tower Pavise Shield (+2 AC)"
		slot_shield_label.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0))
		slot_helmet_label.text = "🪖 Head / Helm: Knight Greathelm (Steel Mesh)"
		slot_helmet_label.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0))
		stage_badge.text = "STAGE 5: FULL PLATE + TOWER SHIELD + GREATHELM (AC 20)"
		stage_subbadge.text = "PBR Polished steel specular sheen • HelmSocket attached • Impenetrable knightly fortress"
		_add_log("EQUIP", "Swapped Armor to Full Plate (Base 18)", Color(0.9, 0.95, 1.0))
		_add_log("SOCKET", "ShieldSocket attached 'armor_shield_tower.glb'", Color(0.9, 0.95, 1.0))
		_add_log("SOCKET", "HelmSocket attached 'armor_helm_knight.glb'", Color(0.9, 0.95, 1.0))
		_add_log("AC", "AC Recalculated: 18 -> 20 (Full Plate 18 + Tower Shield 2)", Color(0.2, 1.0, 0.6))
		_play_sfx("melee_swing")

	# ── STAGE 6A (Frame 680 / ~22.6s): Strike 1 - Tower Shield Deflection ──────────
	if frame_count == 680:
		print("⚔️ [Stage 6A] Strike 1: Skirmisher thrusts spear toward Vance...")
		strike_phase = 1
		projectile_active = true
		projectile_t = 0.0
		projectile_node.visible = true
		dice_panel.visible = true
		dice_roll_label.text = "🎲 D20 ATTACK ROLL: 10"
		dice_calc_label.text = "Formula: 10 (d20) + 4 (Skirmisher Atk Bonus) = 14"
		dice_result_label.text = "Checking Deflection: 14 < AC 20..."
		stage_badge.text = "STAGE 6: INCOMING ATTACK 1 — TOWER SHIELD DEFLECTION"
		stage_subbadge.text = "Skirmisher attacks with Spear! Roll 14 is checked against Vance's AC 20"
		_add_log("COMBAT", "Corrupted Skirmisher thrusts Spear at Vance!", Color(1.0, 0.4, 0.4))
		_add_log("ROLL", "🎲 Attack Roll 1: d20(10) + 4 = 14 vs AC 20", Color(1.0, 0.8, 0.2))
		_play_sfx("melee_swing")

	# ── STAGE 6B (Frame 780 / ~26.0s): Strike 2 - Full Plate Deflection ────────────
	if frame_count == 780:
		print("⚔️ [Stage 6B] Strike 2: Skirmisher lunges with follow-up attack...")
		strike_phase = 2
		projectile_active = true
		projectile_t = 0.0
		projectile_node.visible = true
		deflection_label.visible = false
		dice_panel.visible = true
		dice_roll_label.text = "🎲 D20 ATTACK ROLL: 13"
		dice_calc_label.text = "Formula: 13 (d20) + 4 (Skirmisher Atk Bonus) = 17"
		dice_result_label.text = "Checking Deflection: 17 < AC 20..."
		stage_badge.text = "STAGE 6: INCOMING ATTACK 2 — FULL PLATE DEFLECTION"
		stage_subbadge.text = "Skirmisher executes furious follow-up strike! Roll 17 vs AC 20"
		_add_log("COMBAT", "Corrupted Skirmisher delivers follow-up strike!", Color(1.0, 0.4, 0.4))
		_add_log("ROLL", "🎲 Attack Roll 2: d20(13) + 4 = 17 vs AC 20", Color(1.0, 0.8, 0.2))
		_play_sfx("melee_swing")

	# Projectile flight animation for combat strikes
	if projectile_active:
		projectile_t += 0.06
		var start_p = Vector2(670, 500)
		var end_p = Vector2(320, 490)
		var curr_p = start_p.lerp(end_p, min(1.0, projectile_t))
		projectile_node.clear_points()
		projectile_node.add_point(curr_p + Vector2(25, -6))
		projectile_node.add_point(curr_p)

		if projectile_t >= 1.0:
			projectile_active = false
			projectile_node.visible = false
			spark_ring.visible = true
			deflection_label.visible = true
			if strike_phase == 1:
				deflection_label.text = "🛡️ DEFLECTED BY TOWER SHIELD!\nRolled 14 vs AC 20 (Missed)"
				dice_result_label.text = "Result: 14 < AC 20 -> DEFLECTED BY TOWER SHIELD! (0 Damage)"
				_add_log("RESULT", "🛡️ DEFLECTED! Attack Roll 14 < AC 20 (Missed)", Color(0.2, 1.0, 0.6))
				_add_log("COMBAT", "Tower Pavise Shield absorbed kinetic thrust! 0 Damage Taken.", Color(0.4, 0.95, 0.7))
			elif strike_phase == 2:
				deflection_label.text = "🛡️ DEFLECTED BY FULL PLATE!\nRolled 17 vs AC 20 (Glancing Blow)"
				dice_result_label.text = "Result: 17 < AC 20 -> DEFLECTED BY FULL PLATE! (0 Damage)"
				_add_log("RESULT", "🛡️ DEFLECTED! Attack Roll 17 < AC 20 (Glancing Blow)", Color(0.2, 1.0, 0.6))
				_add_log("COMBAT", "Full Plate curved breastplate deflected spear tip! 0 Damage Taken.", Color(0.4, 0.95, 0.7))
			_play_sfx("melee_miss")

	# ── Capture High-Resolution Screenshot Proof (Frame 840 / ~28.0s) ─────────────
	if frame_count == 840:
		print("📸 Capturing 1920x1080 High-Resolution Armor & Shields Showcase Screenshot...")
		var vp = root.get_viewport()
		if vp:
			var img = vp.get_texture().get_image()
			if img:
				var shot_path = "/home/ndipiazza/source/robos/games/crpg-realm/assets/armor_and_shields_showcase.png"
				img.save_png(shot_path)
				print("✨ Successfully saved Armor & Shields Showcase to: ", shot_path)

	var max_frames = 880
	if OS.has_environment("SHOWCASE_MAX_FRAMES"):
		max_frames = int(OS.get_environment("SHOWCASE_MAX_FRAMES"))
	if frame_count >= max_frames:
		print("✔ Refined Armor and Shields showcase demonstration complete.")
		quit(0)
