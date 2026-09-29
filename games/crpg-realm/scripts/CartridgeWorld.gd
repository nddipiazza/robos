extends Node2D

const CharacterModel3D = preload("res://scripts/CharacterModel3D.gd")

# RobOS cRPG Cartridge World Runner
# Dynamically loads and renders any battle-map contained within the plugged-in Player Cartridge.

const TILE_SIZE: float = 48.0

@onready var canvas_layer: CanvasLayer = $CanvasLayer
@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud: Control = $CanvasLayer/PartyHUD
@onready var msg_label: Label = $CanvasLayer/NoticeLabel
@onready var dialog_box: PanelContainer = $CanvasLayer/DialogBox
@onready var dialog_speaker: Label = $CanvasLayer/DialogBox.find_child("SpeakerLabel", true, false)
@onready var dialog_text: Label = $CanvasLayer/DialogBox.find_child("DialogText", true, false)
@onready var dialog_buttons: HBoxContainer = $CanvasLayer/DialogBox.find_child("Buttons", true, false)
@onready var dialog_portrait: TextureRect = $CanvasLayer/DialogBox.find_child("PortraitRect", true, false)

var hero: Node2D = null
var current_map_slug: String = ""
var spawned_npcs: Dictionary = {}
var spawned_monsters: Dictionary = {}
var active_connections: Array = []
var has_background_art: bool = false
var is_auto_playing: bool = false
var _auto_play_generation: int = 0
var auto_play_banner: PanelContainer = null
var auto_play_label: Label = null
var auto_play_btn: Button = null

func _load_texture_safe(path: String) -> Texture2D:
	if path == "":
		return null
	var norm_path = path
	if not norm_path.begins_with("res://") and not norm_path.begins_with("user://") and not norm_path.begins_with("/"):
		norm_path = "res://" + norm_path.trim_prefix("/")
	if norm_path.begins_with("res://") and ResourceLoader.exists(norm_path):
		var res = load(norm_path)
		if res is Texture2D:
			return res
	var abs_p = ProjectSettings.globalize_path(norm_path) if norm_path.begins_with("res://") else norm_path
	if FileAccess.file_exists(abs_p) or FileAccess.file_exists(norm_path):
		var check_path = abs_p if FileAccess.file_exists(abs_p) else norm_path
		var img = Image.load_from_file(check_path)
		if img and not img.is_empty():
			return ImageTexture.create_from_image(img)
	return null

func _ready() -> void:
	print("📼 [CartridgeWorld] Initializing Cartridge Runner...")
	if $Background:
		$Background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not has_node("/root/CartridgeManager") or not CartridgeManager.is_cartridge_active:
		# If launched without a cartridge, auto-insert dragonwarrior-1-usa
		if has_node("/root/CartridgeManager"):
			CartridgeManager.insert_cartridge("dragonwarrior-1-usa")

	CartridgeManager.cartridge_map_transitioned.connect(_on_map_transitioned)
	_setup_auto_play_banner()
	_load_map(CartridgeManager.current_map_slug, CartridgeManager.current_spawn_coord)

	var cmd_args = OS.get_cmdline_user_args() + OS.get_cmdline_args()
	var wants_auto = (
		CartridgeManager.auto_play_enabled or
		"--auto-play" in cmd_args or
		"--real-demo" in cmd_args or
		"--demo=real" in cmd_args or
		"--demo" in cmd_args or
		OS.get_environment("CRPG_AUTO_PLAY") == "1"
	)
	if wants_auto:
		call_deferred("start_auto_play")
	else:
		_set_auto_play_status("Interactive Mode: Click to move or press [Auto-Play]")
		_update_hud_auto_play_btn(false)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var click_pos = get_global_mouse_position()
		if is_auto_playing:
			pause_auto_play("Manual player control")
		_move_hero_to(click_pos)
	elif event is InputEventKey and event.pressed:
		if event.keycode == KEY_SPACE or event.keycode == KEY_P:
			toggle_auto_play()

func _setup_auto_play_banner() -> void:
	if auto_play_banner:
		return
	auto_play_banner = PanelContainer.new()
	auto_play_banner.name = "AutoPlayBanner"
	auto_play_banner.custom_minimum_size = Vector2(760, 42)
	auto_play_banner.anchors_preset = Control.PRESET_TOP_WIDE
	auto_play_banner.anchor_left = 0.5
	auto_play_banner.anchor_right = 0.5
	auto_play_banner.anchor_top = 0.0
	auto_play_banner.anchor_bottom = 0.0
	auto_play_banner.offset_left = -380.0
	auto_play_banner.offset_right = 380.0
	auto_play_banner.offset_top = 16.0
	auto_play_banner.offset_bottom = 58.0
	auto_play_banner.grow_horizontal = Control.GROW_DIRECTION_BOTH

	var sb = StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.08, 0.14, 0.94)
	sb.border_width_left = 2
	sb.border_width_top = 2
	sb.border_width_right = 2
	sb.border_width_bottom = 2
	sb.border_color = Color(0.2, 0.7, 0.9, 0.9)
	sb.corner_radius_top_left = 6
	sb.corner_radius_top_right = 6
	sb.corner_radius_bottom_left = 6
	sb.corner_radius_bottom_right = 6
	sb.shadow_color = Color(0.1, 0.4, 0.8, 0.4)
	sb.shadow_size = 8
	auto_play_banner.add_theme_stylebox_override("panel", sb)

	var hbox = HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 12)
	auto_play_banner.add_child(hbox)

	var spacer_left = Control.new()
	spacer_left.custom_minimum_size = Vector2(10, 0)
	hbox.add_child(spacer_left)

	auto_play_label = Label.new()
	auto_play_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_play_label.text = "🎮 Auto-Playing Cartridge..."
	auto_play_label.add_theme_font_size_override("font_size", 13)
	auto_play_label.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0))
	hbox.add_child(auto_play_label)

	auto_play_btn = Button.new()
	auto_play_btn.text = "⏸ Manual (Space)"
	auto_play_btn.custom_minimum_size = Vector2(140, 30)
	auto_play_btn.add_theme_font_size_override("font_size", 12)
	auto_play_btn.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3))
	auto_play_btn.pressed.connect(toggle_auto_play)
	hbox.add_child(auto_play_btn)

	var spacer_right = Control.new()
	spacer_right.custom_minimum_size = Vector2(8, 0)
	hbox.add_child(spacer_right)

	$CanvasLayer.add_child(auto_play_banner)

func _move_hero_to(dest: Vector2, on_reached: Callable = Callable()) -> void:
	if not hero or not is_instance_valid(hero):
		return
	var m3d = hero.get_node_or_null("CharacterModel3D") as CharacterModel3D
	if m3d:
		var dir = hero.global_position.direction_to(dest)
		m3d.update_facing(dir * 100.0)
		m3d.set_moving(true)
	if hero.has_method("move_to_point"):
		hero.move_to_point(dest, func():
			if is_instance_valid(hero):
				var m = hero.get_node_or_null("CharacterModel3D") as CharacterModel3D
				if m: m.set_moving(false)
			if on_reached.is_valid(): on_reached.call()
		)
	elif hero.has_method("move_to"):
		hero.move_to(dest)
		if on_reached.is_valid():
			_wait_for_arrival(dest, on_reached)
	else:
		hero.position = dest
		if m3d: m3d.set_moving(false)
		if on_reached.is_valid():
			on_reached.call()

func _wait_for_arrival(dest: Vector2, on_reached: Callable, timeout: float = 8.0) -> void:
	var timer = 0.0
	while timer < timeout and is_instance_valid(hero):
		if hero.global_position.distance_to(dest) < 35.0:
			break
		await get_tree().create_timer(0.1).timeout
		timer += 0.1
	if is_instance_valid(hero):
		var m3d = hero.get_node_or_null("CharacterModel3D") as CharacterModel3D
		if m3d: m3d.set_moving(false)
		if on_reached.is_valid():
			on_reached.call()

func _navigate_and_interact(target_pos: Vector2, on_reached: Callable) -> void:
	if not hero or not is_instance_valid(hero):
		return
	var cur_pos = hero.global_position
	var dist = cur_pos.distance_to(target_pos)
	if dist <= 60.0:
		if on_reached.is_valid():
			on_reached.call()
		return

	var dir = (cur_pos - target_pos).normalized()
	if dir.length() < 0.1:
		dir = Vector2(0, 1)
	var stand_pos = target_pos + dir * 45.0
	_move_hero_to(stand_pos, on_reached)

func _load_map(map_slug: String, spawn_coords: Vector2) -> void:
	current_map_slug = map_slug
	print("🗺️ [CartridgeWorld] Loading map '%s' with spawn at %s" % [map_slug, spawn_coords])

	# Clear previous map dynamic elements
	for child in $MapElements.get_children():
		child.queue_free()

	spawned_npcs.clear()
	spawned_monsters.clear()
	active_connections.clear()

	var map_data = CartridgeManager.get_current_map()
	var map_w = int(map_data.get("robos:width", map_data.get("width", 40)))
	var map_h = int(map_data.get("robos:height", map_data.get("height", 30)))
	var map_title = str(map_data.get("dcterms:title", map_data.get("title", map_slug.capitalize())))
	var terrain = str(map_data.get("robos:terrain", map_data.get("terrain", "stone")))

	# 1. Update Camera Limits & Background
	var pixel_w = map_w * TILE_SIZE
	var pixel_h = map_h * TILE_SIZE
	_draw_map_background(pixel_w, pixel_h, terrain, map_data, map_slug)

	# 2. Spawn Hero
	_spawn_hero(spawn_coords, pixel_w, pixel_h)

	# 3. Spawn Map Objects (Walls, Passages, Spawns)
	var objects = map_data.get("robos:mapObjects", map_data.get("objects", []))
	for obj in objects:
		_spawn_map_object(obj)

	# 4. Resolve Map Connections from Campaign
	var campaign = CartridgeManager.active_cartridge.get("campaign", {})
	var all_conns = campaign.get("robos:mapConnections", [])
	for conn in all_conns:
		if conn.get("fromMap") == map_slug or (conn.get("bidirectional", false) and conn.get("toMap") == map_slug):
			active_connections.append(conn)

	# 5. Spawn NPCs for this map
	_spawn_map_npcs(map_slug)

	# 6. Update HUD Quest display
	_update_hud_status(map_title)

	if action_log:
		action_log.add_entry("Entered: [b]%s[/b]" % map_title, "info")

func _draw_map_background(pixel_w: float, pixel_h: float, terrain: String, map_data: Dictionary = {}, map_slug: String = "") -> void:
	var bg = $Background
	has_background_art = false
	if bg:
		bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		bg.size = Vector2(pixel_w, pixel_h)
		var color = Color(0.1, 0.12, 0.16)
		match terrain:
			"stone", "dungeon": color = Color(0.08, 0.1, 0.14)
			"grass", "wilderness": color = Color(0.1, 0.18, 0.12)
			"lava", "lair", "cave": color = Color(0.18, 0.08, 0.08)
		bg.color = color

		# Real high-definition background artwork underlay
		var bg_img_path = str(map_data.get("robos:backgroundImage", map_data.get("backgroundImage", "")))
		if bg_img_path == "" or "blockouts" in bg_img_path:
			var s = map_slug.to_lower()
			if "tantegel" in s or "throne" in s:
				bg_img_path = "res://assets/backgrounds/tantegel_throne_room.png"
			elif "charlock" in s or "catacomb" in s or "antechamber" in s or "corridor" in s or "crypt" in s or "cavern" in s or "lair" in s:
				bg_img_path = "res://assets/backgrounds/ancient_catacombs_2560.png"
			elif "forest" in s or "wilderness" in s or "candlekeep" in s:
				bg_img_path = "res://assets/backgrounds/forest_wilderness_2560.png"
			elif "village" in s or "town" in s or "square" in s or "castle" in s or "homestead" in s or "overworld" in s:
				bg_img_path = "res://assets/backgrounds/village_open_world_2560.png"
			elif "garrison" in s:
				bg_img_path = "res://assets/backgrounds/garrison_dungeon_2560.png"

		if bg_img_path != "":
			var underlay_tex = _load_texture_safe(bg_img_path)
			if underlay_tex:
				var underlay = bg.get_node_or_null("MapArtUnderlay") as TextureRect
				if not underlay:
					underlay = TextureRect.new()
					underlay.name = "MapArtUnderlay"
					underlay.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
					underlay.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
					underlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
					bg.add_child(underlay)
				underlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
				underlay.size = Vector2(pixel_w, pixel_h)
				underlay.texture = underlay_tex
				underlay.visible = true
				has_background_art = true
				print("🎨 [CartridgeWorld] Successfully loaded pretty background artwork: ", bg_img_path)
			else:
				push_warning("[CartridgeWorld] Failed loading background underlay at: " + bg_img_path)

func _spawn_hero(coords: Vector2, pixel_w: float, pixel_h: float) -> void:
	if not hero:
		var hero_scene = load("res://scenes/HeroPlayer.tscn")
		hero = hero_scene.instantiate()
		hero.name = "HeroPlayer"
		$MapElements.add_child(hero)

	var spawn_pos = Vector2(coords.x * TILE_SIZE, coords.y * TILE_SIZE)
	hero.position = spawn_pos

	if hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, int(pixel_w), int(pixel_h))

	# Update Hero name and token from active cartridge
	var camp = CartridgeManager.active_cartridge.get("campaign", {})
	var heroes_list = camp.get("robos:heroes", camp.get("heroes", []))
	var h_data = {}
	if heroes_list.size() > 0 and (heroes_list[0] is Dictionary):
		h_data = heroes_list[0]
	var h_name = str(h_data.get("name", h_data.get("dcterms:title", "")))
	if h_name != "":
		hero.character_name = h_name
		var nl = hero.find_child("NameLabel", true, false)
		if nl and nl is Label:
			nl.text = h_name

	var h_token_path = str(h_data.get("tokenAssetRef", h_data.get("robos:tokenAssetRef", "")))
	if h_token_path == "":
		if "alefgard" in current_map_slug or "tantegel" in current_map_slug or "charlock" in current_map_slug or "dw" in str(camp.get("slug", "")):
			h_token_path = "res://assets/tokens/token_hero-alefgard-token.png"
	if h_token_path != "":
		var h_tex = _load_texture_safe(h_token_path)
		if h_tex:
			var spr = hero.get_node_or_null("Sprite") as Sprite2D
			if spr:
				spr.texture = h_tex
				var sz = h_tex.get_size()
				var s = 52.0 / max(sz.x, sz.y)
				spr.scale = Vector2(s, s)
				spr.offset = Vector2(0, 0)
			var token_spr = hero.get_node_or_null("HeroTokenRing") as Sprite2D
			if not token_spr:
				token_spr = Sprite2D.new()
				token_spr.name = "HeroTokenRing"
				hero.add_child(token_spr)
				hero.move_child(token_spr, 0)
			token_spr.texture = h_tex
			var sz = h_tex.get_size()
			var s = 48.0 / max(sz.x, sz.y)
			token_spr.scale = Vector2(s, s)
			token_spr.position = Vector2(0, 0)

	# 3D Model Miniature Rendering in Godot 4
	var render_mode = str(h_data.get("robos:renderMode", h_data.get("renderMode", "3d_model")))
	var model_ref = str(h_data.get("robos:modelAssetRef", h_data.get("modelAssetRef", "")))
	var model_type = str(h_data.get("robos:modelType", h_data.get("modelType", "knight")))
	var model_scale = float(h_data.get("robos:modelScale", h_data.get("modelScale", 1.0)))
	var model_tint_str = str(h_data.get("robos:modelTint", h_data.get("modelTint", "#ffffff")))
	var model_tint = Color.from_string(model_tint_str, Color.WHITE)

	if render_mode == "3d_model" or model_ref != "" or model_type != "":
		var model_node = hero.get_node_or_null("CharacterModel3D") as CharacterModel3D
		if not model_node:
			model_node = CharacterModel3D.new()
			model_node.name = "CharacterModel3D"
			hero.add_child(model_node)
		model_node.setup_model(model_ref, model_type, model_scale, model_tint)
		var weapon_ref = str(h_data.get("robos:equippedWeapon", h_data.get("equippedWeapon", h_data.get("weapon", ""))))
		if weapon_ref != "":
			model_node.equip_weapon(weapon_ref)
		var shield_ref = str(h_data.get("robos:equippedShield", h_data.get("equippedShield", h_data.get("shield", ""))))
		if shield_ref != "":
			model_node.equip_shield(shield_ref)
		var helm_ref = str(h_data.get("robos:equippedHelmet", h_data.get("equippedHelmet", h_data.get("helmet", ""))))
		if helm_ref != "":
			model_node.equip_helmet(helm_ref)
		var armor_ref = str(h_data.get("robos:equippedArmor", h_data.get("equippedArmor", h_data.get("armor", ""))))
		if armor_ref != "":
			model_node.apply_armor_styling(armor_ref)

		model_node.visible = true
		var spr = hero.get_node_or_null("Sprite") as Sprite2D
		if spr: spr.visible = false
		var token_spr = hero.get_node_or_null("HeroTokenRing") as Sprite2D
		if token_spr: token_spr.visible = false

func _spawn_map_object(obj: Dictionary) -> void:
	var o_type = str(obj.get("robos:objectType", obj.get("type", "wall")))
	var pos = obj.get("robos:position", [obj.get("x", 0), obj.get("y", 0)])
	var sz = obj.get("robos:size", [obj.get("w", 2), obj.get("h", 2)])
	var obj_id = str(obj.get("robos:objectId", obj.get("id", "")))
	var title = str(obj.get("dcterms:title", obj.get("label", obj_id)))

	var px = float(pos[0]) * TILE_SIZE
	var py = float(pos[1]) * TILE_SIZE
	var pw = float(sz[0]) * TILE_SIZE
	var ph = float(sz[1]) * TILE_SIZE

	if o_type in ["wall", "pillar", "dais"]:
		var sb = StaticBody2D.new()
		sb.name = "Wall_" + obj_id
		sb.position = Vector2(px + pw/2, py + ph/2)

		var cs = CollisionShape2D.new()
		var shape = RectangleShape2D.new()
		shape.size = Vector2(pw, ph)
		cs.shape = shape
		sb.add_child(cs)

		var visual = ColorRect.new()
		visual.position = Vector2(-pw/2, -ph/2)
		visual.size = Vector2(pw, ph)
		if has_background_art:
			visual.color = Color(0.2, 0.25, 0.35, 0.0)
		else:
			visual.color = Color(0.2, 0.25, 0.35, 0.8)
		sb.add_child(visual)

		$MapElements.add_child(sb)

	elif o_type in ["chest"] or "chest" in obj_id:
		var area = Area2D.new()
		area.name = "Chest_" + obj_id
		area.position = Vector2(px + pw/2, py + ph/2)

		var cs = CollisionShape2D.new()
		var shape = RectangleShape2D.new()
		shape.size = Vector2(pw, ph)
		cs.shape = shape
		area.add_child(cs)

		var is_opened = GameState.world_flags.get("chest_" + obj_id, false)
		var chest_spr = Sprite2D.new()
		chest_spr.name = "ChestSprite"
		var chest_tex = _load_texture_safe("res://assets/props/chest_open.png" if is_opened else "res://assets/props/chest_closed.png")
		if chest_tex:
			chest_spr.texture = chest_tex
			var csz = chest_tex.get_size()
			var target_size = max(pw * 0.65, 48.0)
			var cs_scale = target_size / max(csz.x, csz.y)
			chest_spr.scale = Vector2(cs_scale, cs_scale)
			chest_spr.position = Vector2(0, 0)
			area.add_child(chest_spr)
		else:
			var visual = ColorRect.new()
			visual.position = Vector2(-pw/2, -ph/2)
			visual.size = Vector2(pw, ph)
			visual.color = Color(0.9, 0.7, 0.1, 0.9)
			area.add_child(visual)

		var clean_chest = title
		clean_chest = clean_chest.replace("Treasure Chest (", "").replace(")", "").replace("Treasure Chest", "Chest")
		if clean_chest.to_lower().ends_with("gold"):
			clean_chest = clean_chest.substr(0, clean_chest.length() - 4).strip_edges() + "G"

		var lbl = Label.new()
		lbl.name = "ChestLabel"
		lbl.text = "Empty" if is_opened else ("📦 " + clean_chest)
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lbl.add_theme_font_size_override("font_size", 9)
		lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6, 0.7) if is_opened else Color(0.9, 0.9, 0.95, 0.95))

		var style = StyleBoxFlat.new()
		style.bg_color = Color(0.06, 0.08, 0.12, 0.82)
		style.border_color = Color(0.25, 0.35, 0.48, 0.5)
		style.set_border_width_all(1)
		style.set_corner_radius_all(3)
		style.content_margin_left = 5
		style.content_margin_right = 5
		style.content_margin_top = 1
		style.content_margin_bottom = 1
		lbl.add_theme_stylebox_override("normal", style)
		lbl.custom_minimum_size = Vector2(70, 16)
		lbl.position = Vector2(-35, -pw * 0.35 - 16)
		area.add_child(lbl)

		area.input_pickable = true
		area.input_event.connect(func(_vp, event, _shape_idx):
			if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
				get_viewport().set_input_as_handled()
				if is_auto_playing:
					pause_auto_play("Manual chest interaction")
				_navigate_and_interact(area.global_position, func():
					_on_chest_opened(obj_id, title)
				)
		)

		area.body_entered.connect(func(body):
			if body == hero or body.name == "HeroPlayer":
				_on_chest_opened(obj_id, title)
		)

		$MapElements.add_child(area)

	elif o_type in ["passage", "door", "portal"] or "door" in obj_id or "stairs" in obj_id:
		var area = Area2D.new()
		area.name = "Passage_" + obj_id
		area.position = Vector2(px + pw/2, py + ph/2)

		var cs = CollisionShape2D.new()
		var shape = RectangleShape2D.new()
		shape.size = Vector2(pw, ph)
		cs.shape = shape
		area.add_child(cs)

		var visual = ColorRect.new()
		visual.position = Vector2(-pw/2, -ph/2)
		visual.size = Vector2(pw, ph)
		if has_background_art:
			visual.color = Color(0.2, 0.8, 0.4, 0.0)
		else:
			visual.color = Color(0.2, 0.8, 0.4, 0.3)
		area.add_child(visual)

		var clean_door = title
		clean_door = clean_door.replace("Royal Locked Door", "Locked Door").replace("Door to ", "").replace("Stairs Down to ", "Stairs: ")

		var lbl = Label.new()
		lbl.name = "PassageLabel"
		lbl.text = "🚪 " + clean_door
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lbl.add_theme_font_size_override("font_size", 9)
		lbl.add_theme_color_override("font_color", Color(0.4, 0.9, 0.95, 0.95))

		var p_style = StyleBoxFlat.new()
		p_style.bg_color = Color(0.06, 0.08, 0.12, 0.82)
		p_style.border_color = Color(0.1, 0.5, 0.6, 0.5)
		p_style.set_border_width_all(1)
		p_style.set_corner_radius_all(3)
		p_style.content_margin_left = 5
		p_style.content_margin_right = 5
		p_style.content_margin_top = 1
		p_style.content_margin_bottom = 1
		lbl.add_theme_stylebox_override("normal", p_style)
		lbl.custom_minimum_size = Vector2(90, 16)
		lbl.position = Vector2(-45, -ph/2 - 16)
		area.add_child(lbl)

		area.input_pickable = true
		area.input_event.connect(func(_vp, event, _shape_idx):
			if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
				get_viewport().set_input_as_handled()
				if is_auto_playing:
					pause_auto_play("Manual passage interaction")
				_navigate_and_interact(area.global_position, func():
					_on_passage_entered(obj_id)
				)
		)

		area.body_entered.connect(func(body):
			if body == hero or body.name == "HeroPlayer":
				_on_passage_entered(obj_id)
		)

		$MapElements.add_child(area)

func _spawn_map_npcs(map_slug: String) -> void:
	var characters = CartridgeManager.characters_cache
	for ch_slug in characters:
		var ch = characters[ch_slug]
		if not (ch is Dictionary):
			continue

		var loc = str(ch.get("robos:startingLocation", ch.get("location", ch.get("targetMap", ""))))
		var ctype = str(ch.get("characterType", ch.get("robos:characterType", ""))).to_lower()
		var is_boss = "boss" in ch_slug or ctype == "boss"
		var is_monster = "creature" in ch_slug or "goblin" in ch_slug or is_boss or ctype == "enemy"

		var should_spawn = false
		var spawn_coord = Vector2(25, 10)

		# Map-specific placements
		if map_slug == "throne-room" and ("king" in ch_slug or "alden" in ch_slug):
			should_spawn = true
			spawn_coord = Vector2(25, 6)
		elif map_slug == "throne-room" and "princess" in ch_slug and GameState.world_flags.get("princess_rescued", false):
			should_spawn = true
			spawn_coord = Vector2(28, 6)
		elif map_slug == "main-castle" and ("torvald" in ch_slug or "blacksmith" in ch_slug):
			should_spawn = true
			spawn_coord = Vector2(18, 12)
		elif map_slug == "main-castle" and "projection-goblin" in ch_slug and not GameState.world_flags.get("defeated_projection_goblin", false):
			should_spawn = true
			spawn_coord = Vector2(26, 12)
		elif map_slug == "dark-lord-lair" and ("malakor" in ch_slug or "boss" in ch_slug) and not GameState.world_flags.get("defeated_dark_lord", false):
			should_spawn = true
			spawn_coord = Vector2(25, 15)
		elif map_slug == "dark-lord-lair" and "princess" in ch_slug:
			should_spawn = true
			spawn_coord = Vector2(25, 8)
		# Dragon Warrior 1 USA placements:
		elif (map_slug == "tantegel-throne-room" or "tantegel" in map_slug) and ("king" in ch_slug or "loric" in ch_slug or "lorik" in ch_slug):
			should_spawn = true
			spawn_coord = Vector2(28, 8)
		elif (map_slug == "tantegel-throne-room" or "tantegel" in map_slug) and ("princess" in ch_slug or "gwaelin" in ch_slug) and GameState.world_flags.get("princess_rescued", false):
			should_spawn = true
			spawn_coord = Vector2(32, 8)
		elif ("charlock" in map_slug or "lair" in map_slug) and ("dragonlord" in ch_slug or "boss" in ch_slug) and not GameState.world_flags.get("defeated_dragonlord", false):
			should_spawn = true
			spawn_coord = Vector2(20, 15)
		elif ("charlock" in map_slug or "lair" in map_slug) and ("princess" in ch_slug or "gwaelin" in ch_slug):
			should_spawn = true
			spawn_coord = Vector2(20, 8)

		if should_spawn:
			_create_interactive_npc(ch_slug, ch, spawn_coord, is_monster)

func _create_interactive_npc(slug: String, ch_data: Dictionary, coord: Vector2, is_monster: bool) -> void:
	var name_str = str(ch_data.get("name", ch_data.get("dcterms:title", slug)))
	var npc_node = CharacterBody2D.new()
	npc_node.name = "NPC_" + slug
	npc_node.position = Vector2(coord.x * TILE_SIZE, coord.y * TILE_SIZE)

	var cs = CollisionShape2D.new()
	var shape = CircleShape2D.new()
	shape.radius = 20.0
	cs.shape = shape
	npc_node.add_child(cs)

	var token_path = str(ch_data.get("tokenAssetRef", ch_data.get("robos:tokenAssetRef", ch_data.get("token", ""))))
	if token_path == "":
		if "dragonlord" in slug:
			token_path = "res://assets/tokens/token_dragonlord.png"
		elif "king" in slug or "loric" in slug or "lorik" in slug:
			token_path = "res://assets/tokens/token_king_lorik.png"
		elif "princess" in slug or "gwaelin" in slug:
			token_path = "res://assets/tokens/token_princess_gwaelin.png"
		elif "malakor" in slug:
			token_path = "res://assets/tokens/token_malakor_boss.png"
		elif "goblin" in slug:
			token_path = "res://assets/tokens/token_rogue.png"
		elif "blacksmith" in slug or "torvald" in slug:
			token_path = "res://assets/tokens/token_fighter.png"

	var token_tex: Texture2D = _load_texture_safe(token_path)

	# 3D Model Miniature Rendering in Godot 4
	var render_mode = str(ch_data.get("robos:renderMode", ch_data.get("renderMode", "3d_model")))
	var model_ref = str(ch_data.get("robos:modelAssetRef", ch_data.get("modelAssetRef", "")))
	var model_type = str(ch_data.get("robos:modelType", ch_data.get("modelType", "")))
	var default_scale = 1.45 if (is_monster and ("dragonlord" in slug or "boss" in slug)) else 1.0
	var model_scale = float(ch_data.get("robos:modelScale", ch_data.get("modelScale", default_scale)))
	var model_tint_str = str(ch_data.get("robos:modelTint", ch_data.get("modelTint", "#ffffff")))
	var model_tint = Color.from_string(model_tint_str, Color.WHITE)

	if model_type == "":
		if "dragonlord" in slug or "boss" in slug or "malakor" in slug:
			model_type = "dragon"
		elif "skeleton" in slug or "undead" in slug or "bone" in slug:
			model_type = "skeleton"
		elif "minotaur" in slug or "beast" in slug or "ogre" in slug:
			model_type = "minotaur"
		elif "hound" in slug or "wolf" in slug or "dire" in slug:
			model_type = "hound"
		elif "skirmisher" in slug or "brigand" in slug or "bandit" in slug:
			model_type = "skirmisher"
		elif "goblin" in slug:
			model_type = "goblin"
		elif "king" in slug or "loric" in slug or "lorik" in slug or "alden" in slug:
			model_type = "king"
		elif "princess" in slug or "gwaelin" in slug or "jennifer" in slug:
			model_type = "princess"
		elif "wizard" in slug or "mage" in slug or "sorcerer" in slug:
			model_type = "wizard"
		elif "rogue" in slug or "thief" in slug or "assassin" in slug:
			model_type = "rogue"
		elif "blacksmith" in slug or "torvald" in slug:
			model_type = "knight"
		elif is_monster:
			model_type = "skeleton"
		else:
			model_type = "knight"

	if render_mode == "3d_model" or model_ref != "" or model_type != "":
		var model_node = CharacterModel3D.new()
		model_node.name = "CharacterModel3D"
		model_node.position = Vector2(0, 0)
		model_node.setup_model(model_ref, model_type, model_scale, model_tint)
		var w_ref = str(ch_data.get("robos:equippedWeapon", ch_data.get("equippedWeapon", ch_data.get("weapon", ""))))
		if w_ref != "":
			model_node.equip_weapon(w_ref)
		var s_ref = str(ch_data.get("robos:equippedShield", ch_data.get("equippedShield", ch_data.get("shield", ""))))
		if s_ref != "":
			model_node.equip_shield(s_ref)
		npc_node.add_child(model_node)
	elif token_tex:
		var spr = Sprite2D.new()
		spr.name = "TokenSprite"
		spr.texture = token_tex
		var tex_size = token_tex.get_size()
		var target_diameter = 52.0
		if is_monster and ("dragonlord" in slug or "boss" in slug):
			target_diameter = 72.0
		var s = target_diameter / max(tex_size.x, tex_size.y)
		spr.scale = Vector2(s, s)
		spr.position = Vector2(0, -6)
		npc_node.add_child(spr)
	else:
		var icon_lbl = Label.new()
		icon_lbl.text = "🐉" if "dragonlord" in slug else ("👑" if "king" in slug else ("👸" if "princess" in slug else ("🔨" if "blacksmith" in slug or "torvald" in slug else ("👹" if "goblin" in slug else ("💀" if "malakor" in slug else "👤")))))
		icon_lbl.add_theme_font_size_override("font_size", 24)
		icon_lbl.position = Vector2(-14, -28)
		npc_node.add_child(icon_lbl)

	var name_lbl = Label.new()
	name_lbl.text = name_str
	name_lbl.add_theme_font_size_override("font_size", 9)
	name_lbl.add_theme_color_override("font_color", Color(1.0, 0.88, 0.45) if not is_monster else Color(1.0, 0.45, 0.45))
	name_lbl.position = Vector2(-45, 22)
	name_lbl.custom_minimum_size = Vector2(90, 16)
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER

	var n_style = StyleBoxFlat.new()
	n_style.bg_color = Color(0.06, 0.08, 0.12, 0.82)
	n_style.border_color = Color(0.35, 0.35, 0.25, 0.5) if not is_monster else Color(0.5, 0.2, 0.2, 0.5)
	n_style.set_border_width_all(1)
	n_style.set_corner_radius_all(3)
	n_style.content_margin_left = 5
	n_style.content_margin_right = 5
	n_style.content_margin_top = 1
	n_style.content_margin_bottom = 1
	name_lbl.add_theme_stylebox_override("normal", n_style)
	npc_node.add_child(name_lbl)

	var trigger_area = Area2D.new()
	var t_shape = CircleShape2D.new()
	t_shape.radius = 50.0
	var t_cs = CollisionShape2D.new()
	t_cs.shape = t_shape
	trigger_area.add_child(t_cs)
	npc_node.add_child(trigger_area)

	trigger_area.input_pickable = true
	trigger_area.input_event.connect(func(_vp, event, _shape_idx):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			get_viewport().set_input_as_handled()
			if is_auto_playing:
				pause_auto_play("Manual NPC interaction")
			_navigate_and_interact(npc_node.global_position, func():
				_interact_with_npc(slug, ch_data, is_monster)
			)
	)

	trigger_area.body_entered.connect(func(body):
		if body == hero or body.name == "HeroPlayer":
			_interact_with_npc(slug, ch_data, is_monster)
	)

	$MapElements.add_child(npc_node)
	spawned_npcs[slug] = npc_node

func _interact_with_npc(slug: String, ch_data: Dictionary, is_monster: bool) -> void:
	var name_str = str(ch_data.get("name", slug))
	print("💬 [CartridgeWorld] Interacting with NPC: ", name_str)

	# Mutual 3D facing orientation
	if spawned_npcs.has(slug) and is_instance_valid(hero):
		var npc_node = spawned_npcs[slug]
		var npc_m3d = npc_node.get_node_or_null("CharacterModel3D") as CharacterModel3D
		if npc_m3d:
			npc_m3d.face_point(hero.global_position)
		var hero_m3d = hero.get_node_or_null("CharacterModel3D") as CharacterModel3D
		if hero_m3d:
			hero_m3d.face_point(npc_node.global_position)

	if "king-alden" in slug:
		if GameState.world_flags.get("princess_rescued", false):
			_show_dialog(name_str, "By the heavens, you have delivered Princess Jennifer safely home! Caleb, you are the Savior of Eldoria! Total Victory is proclaimed across the realm!", [
				{"text": "🏆 Proclaim Victory", "action": func(): _trigger_victory()}
			])
		else:
			_show_dialog(name_str, "Sir Caleb! The wicked Dark Lord Malakor has kidnapped Princess Jennifer! Make haste to Master Torvald at the Dragonclaw Forge to claim the Hero's Sword, then slay the Dark Lord!", [
				{"text": "Accept Royal Quest", "action": func(): _on_accept_king_quest()}
			])

	elif "blacksmith-torvald" in slug:
		if GameState.world_flags.get("obtained_heros_sword", false):
			_show_dialog(name_str, "The Hero's Sword burns with true dragonfire in your hands, Caleb. The castle gates are open—venture into the World Realm and slay Malakor!", [
				{"text": "Understood", "action": func(): _close_dialog()}
			])
		elif GameState.world_flags.get("defeated_projection_goblin", false):
			_show_dialog(name_str, "Well fought! The projection broke beneath your blade. As promised, take the rune-forged Hero's Sword. The castle gate is unsealed.", [
				{"text": "🎁 Claim Hero's Sword", "action": func(): _on_claim_heros_sword()}
			])
		else:
			_show_dialog(name_str, "You seek the Hero's Sword for the King's quest? A blade like this is not given to the untested! Strike down my astral Projection Goblin to prove your valor!", [
				{"text": "⚔️ Begin Combat Trial", "action": func(): _on_begin_torvald_trial()}
			])

	elif "projection-goblin" in slug:
		_show_dialog("Projection Goblin", "Hsssk! Astral sparks crackle as the goblin lashes out!", [
			{"text": "⚔️ Attack with Steel", "action": func(): _on_defeat_projection_goblin(slug)}
		])

	elif "dark-lord-malakor" in slug:
		_show_dialog("Dark Lord Malakor", "Fools of Eldoria! Your kingdom will drown in shadows, and Princess Jennifer shall be my thrall!", [
			{"text": "⚔️ Strike with Hero's Sword", "action": func(): _on_defeat_dark_lord(slug)}
		])

	elif "princess-jennifer" in slug:
		if GameState.world_flags.get("defeated_dark_lord", false):
			_show_dialog("Princess Jennifer", "Sir Caleb! You came! You broke Malakor's shadow curse. Please, escort me back to Father in the Throne Room!", [
				{"text": "👸 Escort Princess Home", "action": func(): _on_escort_princess()}
			])
		else:
			_show_dialog("Princess Jennifer", "Beware, Sir Caleb! Dark Lord Malakor lurks nearby in the shadows!", [
				{"text": "Hold on Princess!", "action": func(): _close_dialog()}
			])

	# Dragon Warrior 1 USA NPCs
	elif "king-loric" in slug or "king-lorik" in slug or ("king" in slug and "loric" in slug):
		if GameState.world_flags.get("princess_rescued", false) or GameState.world_flags.get("defeated_dragonlord", false):
			_show_dialog(name_str, "Descendant of Erdrick! Thou hast vanquished the Dragonlord, restored the Ball of Light, and returned Princess Gwaelin safely to Tantegel! All Alefgard rejoices in thy eternal glory! Total Victory!", [
				{"text": "🏆 Proclaim Total Victory", "action": func(): _trigger_victory()}
			])
		else:
			_show_dialog(name_str, "Descendant of Erdrick! The foul Dragonlord hath stolen the sacred Ball of Light and captured Princess Gwaelin! Take the 120 Gold and Magic Key from my treasure chests, venture forth to Charlock Castle, and slay the fiend!", [
				{"text": "Accept Royal Quest of Erdrick", "action": func(): _on_accept_loric_quest()}
			])

	elif "dragonlord" in slug:
		_show_dialog("The Dragonlord", "Descendant of Erdrick! If thou wilt take my side, I will give thee half each of the world! What sayest thou? Wilt thou join me, or perish in dragonflame?", [
			{"text": "⚔️ Strike Down the Dragonlord", "action": func(): _on_defeat_dragonlord(slug)}
		])

	elif "princess-gwaelin" in slug or "gwaelin" in slug:
		if GameState.world_flags.get("defeated_dragonlord", false):
			_show_dialog("Princess Gwaelin", "Thou hast saved me from the Dragonlord's grasp, brave Erdrick! Forever shall I accompany thee! Let us return to Father King Lorik in Tantegel Castle!", [
				{"text": "👸 Escort Princess to Tantegel Castle", "action": func(): _on_escort_gwaelin()}
			])
		else:
			_show_dialog("Princess Gwaelin", "Brave descendant of Erdrick, defeat the Dragonlord to break my prison seal!", [
				{"text": "I shall free thee!", "action": func(): _close_dialog()}
			])

func _on_accept_loric_quest() -> void:
	GameState.world_flags["talked_to_king"] = true
	if action_log:
		action_log.add_entry("King Lorik bestowed the Quest of Erdrick: recover the Ball of Light and rescue Princess Gwaelin.", "quest")
	_update_hud_status("Quest: Open chests, claim Magic Key, and venture to Charlock Castle")
	_close_dialog()

func _on_defeat_dragonlord(slug: String) -> void:
	GameState.world_flags["defeated_dragonlord"] = true
	GameState.world_flags["obtained_ball_of_light"] = true
	if action_log:
		action_log.add_entry("Erdrick struck down the Dragonlord! The Ball of Light shines brightly once more!", "combat")
	if spawned_npcs.has(slug):
		spawned_npcs[slug].queue_free()
		spawned_npcs.erase(slug)
	_close_dialog()
	_update_hud_status("Quest: Rescue Princess Gwaelin from the Lair")

func _on_escort_gwaelin() -> void:
	GameState.world_flags["princess_rescued"] = true
	if action_log:
		action_log.add_entry("Princess Gwaelin joins your party. Returning to Tantegel Castle Throne Room!", "quest")
	_close_dialog()
	CartridgeManager.transition_to_map("tantegel-throne-room", Vector2(28, 20))

func _on_chest_opened(obj_id: String, title: String) -> void:
	if GameState.world_flags.get("chest_" + obj_id, false):
		return
	GameState.world_flags["chest_" + obj_id] = true
	if "120g" in obj_id:
		GameState.add_gold(120)
		if action_log:
			action_log.add_entry("Found [b]120 Gold[/b] in King's Treasure Chest!", "loot")
	elif "key" in obj_id:
		GameState.add_item("magic-key")
		GameState.world_flags["has_magic_key"] = true
		if action_log:
			action_log.add_entry("Found [b]Magic Key[/b]! Royal castle gates can now be unlocked.", "loot")
	elif "torch" in obj_id:
		GameState.add_item("torch")
		if action_log:
			action_log.add_entry("Found [b]Torch[/b] to illuminate dark dungeons!", "loot")
	elif "herb" in obj_id:
		GameState.add_item("herb")
		if action_log:
			action_log.add_entry("Found healing [b]Herb[/b]!", "loot")
	else:
		if action_log:
			action_log.add_entry("Opened chest: " + title, "loot")

	# Update visual sprite and label dynamically
	var chest_node = $MapElements.get_node_or_null("Chest_" + obj_id)
	if chest_node:
		var spr = chest_node.get_node_or_null("ChestSprite") as Sprite2D
		var open_tex = _load_texture_safe("res://assets/props/chest_open.png")
		if spr and open_tex:
			spr.texture = open_tex
		var clbl = chest_node.get_node_or_null("ChestLabel") as Label
		if clbl:
			clbl.text = "Empty"
			clbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6, 0.7))

func _on_accept_king_quest() -> void:
	GameState.world_flags["talked_to_king"] = true
	if action_log:
		action_log.add_entry("King Alden commanded you to claim the Hero's Sword from Master Torvald.", "quest")
	_update_hud_status("Quest: Seek Master Torvald at Dragonclaw Forge")
	_close_dialog()

func _on_claim_heros_sword() -> void:
	GameState.world_flags["obtained_heros_sword"] = true
	GameState.add_item("heros-sword")
	if action_log:
		action_log.add_entry("Obtained: [b]Hero's Sword[/b] (+3 Atk, Dragonslayer)!", "loot")
	_update_hud_status("Quest: Venture into the World Realm to the Cavern Maw")
	_close_dialog()

func _on_defeat_projection_goblin(slug: String) -> void:
	GameState.world_flags["defeated_projection_goblin"] = true
	if action_log:
		action_log.add_entry("Sir Caleb struck down the Projection Goblin with ease! (16 DMG)", "combat")
	if spawned_npcs.has(slug):
		spawned_npcs[slug].queue_free()
		spawned_npcs.erase(slug)
	_close_dialog()

func _on_defeat_dark_lord(slug: String) -> void:
	GameState.world_flags["defeated_dark_lord"] = true
	if action_log:
		action_log.add_entry("The Hero's Sword cleaved Malakor's dark wards! Dark Lord Malakor is slain!", "combat")
	if spawned_npcs.has(slug):
		spawned_npcs[slug].queue_free()
		spawned_npcs.erase(slug)
	_close_dialog()

func _on_escort_princess() -> void:
	GameState.world_flags["princess_rescued"] = true
	if action_log:
		action_log.add_entry("Princess Jennifer joins your party. Escort her to the Throne Room!", "quest")
	_close_dialog()
	CartridgeManager.transition_to_map("throne-room", Vector2(25, 30))

func _on_begin_torvald_trial() -> void:
	if action_log:
		action_log.add_entry("Master Torvald conjured an Astral Projection Goblin!", "combat")
	_close_dialog()

func _show_dialog(speaker: String, text: String, options: Array, portrait_ref: Variant = null) -> void:
	if not dialog_box:
		return
	if dialog_speaker:
		dialog_speaker.text = speaker
	if dialog_text:
		dialog_text.text = text

	var p_path = ""
	if portrait_ref is String and portrait_ref != "":
		p_path = portrait_ref
	elif portrait_ref is Texture2D:
		if dialog_portrait:
			dialog_portrait.texture = portrait_ref
			dialog_portrait.visible = true

	if p_path == "":
		var sp_low = speaker.to_lower()
		if "lorik" in sp_low or "loric" in sp_low or "king" in sp_low:
			p_path = "res://assets/portraits/portrait_male01.png"
		elif "gwaelin" in sp_low or "princess" in sp_low or "jennifer" in sp_low:
			p_path = "res://assets/portraits/portrait_female04.png"
		elif "dragonlord" in sp_low or "malakor" in sp_low or "dark lord" in sp_low:
			p_path = "res://assets/portraits/portrait_malakor.png"
		elif "torvald" in sp_low or "blacksmith" in sp_low:
			p_path = "res://assets/portraits/portrait_brand.png"
		elif "victory" in sp_low:
			p_path = "res://assets/portraits/portrait_female04.png"
		else:
			p_path = "res://assets/portraits/portrait_fighter.png"

	if p_path != "":
		var p_tex = _load_texture_safe(p_path)
		if p_tex and dialog_portrait:
			dialog_portrait.texture = p_tex
			dialog_portrait.visible = true

	if dialog_buttons:
		for child in dialog_buttons.get_children():
			child.queue_free()

		for opt in options:
			var btn = Button.new()
			btn.text = opt.get("text", "Continue")
			btn.add_theme_font_size_override("font_size", 12)
			var act = opt.get("action", null)
			if act is Callable:
				btn.pressed.connect(act)
			dialog_buttons.add_child(btn)

	dialog_box.visible = true

func _close_dialog() -> void:
	if dialog_box:
		dialog_box.visible = false

func _trigger_victory() -> void:
	is_auto_playing = false
	_auto_play_generation += 1
	_update_hud_auto_play_btn(false)
	_close_dialog()
	var h = CartridgeManager.active_cartridge.get("header", {})
	var title = str(h.get("title", "Campaign"))
	action_log.add_entry("🏆 [b]CAMPAIGN COMPLETE: Total Victory in %s![/b]" % title, "info")
	_show_dialog("Victory Proclamation", "The realm is saved! The darkness has lifted, the Ball of Light restored, and the royal lineage secured. You have won the campaign!", [
		{"text": "Restart Campaign", "action": func(): _on_restart_campaign()}
	], "res://assets/portraits/portrait_female04.png")

func _on_restart_campaign() -> void:
	CartridgeManager.insert_cartridge("rescue-the-princess")
	CartridgeManager.embark_cartridge()

func _on_passage_entered(object_id: String) -> void:
	print("🚪 [CartridgeWorld] Passage triggered: ", object_id)
	for conn in active_connections:
		var from_obj = conn.get("fromObjectId")
		var to_obj = conn.get("toObjectId")
		var is_forward = (from_obj == object_id and conn.get("fromMap") == current_map_slug)
		var is_reverse = (conn.get("bidirectional", false) and to_obj == object_id and conn.get("toMap") == current_map_slug)

		if is_forward or is_reverse:
			var req_flag = conn.get("requiredFlag")
			if req_flag and not GameState.world_flags.get(req_flag, false):
				action_log.add_entry("The passage is sealed! Requires: [b]%s[/b]" % req_flag, "warning")
				return

			var target_map = conn.get("toMap") if is_forward else conn.get("fromMap")
			var target_spawn_arr = conn.get("toSpawn", [25, 20]) if is_forward else [25, 20]
			var target_spawn = Vector2(float(target_spawn_arr[0]), float(target_spawn_arr[1]))

			CartridgeManager.transition_to_map(target_map, target_spawn)
			return

	# Fallback transition for standard Dragon Warrior 1 / dungeon objects
	if object_id in ["royal-door", "stairs-down"] or "door" in object_id or "stairs" in object_id:
		if current_map_slug == "tantegel-throne-room" or "tantegel" in current_map_slug:
			if not GameState.world_flags.get("has_magic_key", false) and not GameState.has_item("magic-key"):
				if action_log:
					action_log.add_entry("The royal door is locked! You need a Magic Key from the King's chests.", "warning")
				return
			CartridgeManager.transition_to_map("charlock-castle", Vector2(20, 25))
		elif current_map_slug == "charlock-castle":
			CartridgeManager.transition_to_map("tantegel-throne-room", Vector2(28, 20))

func _on_map_transitioned(from_map: String, to_map: String, spawn: Vector2) -> void:
	_load_map(to_map, spawn)
	if is_auto_playing:
		get_tree().create_timer(0.8).timeout.connect(func():
			if is_auto_playing:
				_trigger_auto_play_for_current_map()
		)

func _update_hud_status(status_text: String) -> void:
	if hud and hud.has_method("update_display"):
		hud.update_display(status_text)

# ══════════════════════════════════════════════════════════════════════════════
# Autonomous Auto-Play Engine
# ══════════════════════════════════════════════════════════════════════════════

func toggle_auto_play() -> void:
	if is_auto_playing:
		pause_auto_play("User paused")
	else:
		start_auto_play()

func start_auto_play() -> void:
	is_auto_playing = true
	_auto_play_generation += 1
	var current_gen = _auto_play_generation
	_update_hud_auto_play_btn(true)
	var h = CartridgeManager.active_cartridge.get("header", {})
	var cart_title = str(h.get("title", "Active Cartridge"))
	_set_auto_play_status("🎮 Auto-Playing: %s (Space to Pause)" % cart_title)
	print("⚡ [CartridgeWorld] Auto-Play started (generation %d) for cartridge '%s'" % [current_gen, cart_title])
	_trigger_auto_play_for_current_map()

func pause_auto_play(reason: String = "") -> void:
	if not is_auto_playing:
		return
	is_auto_playing = false
	_auto_play_generation += 1
	_update_hud_auto_play_btn(false)
	var reason_str = (" (%s)" % reason) if reason != "" else ""
	_set_auto_play_status("⏸️ Manual Control%s · Press [Auto-Play] to Resume" % reason_str)
	print("⏸️ [CartridgeWorld] Auto-Play paused: %s" % reason)

func _is_auto_valid(gen: int) -> bool:
	return is_auto_playing and gen == _auto_play_generation and is_inside_tree()

func _set_auto_play_status(txt: String) -> void:
	if auto_play_label:
		auto_play_label.text = txt
	if action_log:
		action_log.add_entry(txt, "info")
	_update_hud_status(txt)

func _update_hud_auto_play_btn(is_auto: bool) -> void:
	if auto_play_btn:
		if is_auto:
			auto_play_btn.text = "⏸ Manual (Space)"
			auto_play_btn.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3))
		else:
			auto_play_btn.text = "▶ Auto-Play (Space)"
			auto_play_btn.add_theme_color_override("font_color", Color(0.35, 0.95, 0.55))
	if hud and hud.has_method("set_autoplay_button_state"):
		hud.set_autoplay_button_state(is_auto)

func _auto_walk_to(dest: Vector2, gen: int, timeout: float = 6.5) -> void:
	if not hero or not is_instance_valid(hero):
		return
	var arrived := false
	_move_hero_to(dest, func(): arrived = true)
	var elapsed := 0.0
	while not arrived and elapsed < timeout and _is_auto_valid(gen) and is_instance_valid(hero):
		if hero.global_position.distance_to(dest) < 42.0:
			arrived = true
			break
		await get_tree().create_timer(0.1).timeout
		elapsed += 0.1
	if is_instance_valid(hero) and not arrived and _is_auto_valid(gen):
		hero.global_position = dest

func _trigger_auto_play_for_current_map() -> void:
	if not is_auto_playing:
		return
	var gen = _auto_play_generation
	var cart_id = str(CartridgeManager.active_cartridge.get("cartridgeId", ""))
	if cart_id == "dragonwarrior-1-usa" or "dragonwarrior" in cart_id or "dw" in cart_id or "tantegel" in current_map_slug or "charlock" in current_map_slug:
		_run_dragonwarrior_auto_play(gen)
	elif cart_id == "rescue-the-princess" or "rescue" in cart_id or "eldoria" in cart_id or current_map_slug in ["throne-room", "main-castle", "dark-lord-lair"]:
		_run_rescue_princess_auto_play(gen)
	else:
		_run_generic_auto_play(gen)

func _run_dragonwarrior_auto_play(gen: int) -> void:
	if current_map_slug == "tantegel-throne-room" or "tantegel" in current_map_slug:
		# If not talked to King Lorik yet:
		if not GameState.world_flags.get("talked_to_king", false):
			_set_auto_play_status("Erdrick approaches King Lorik's Throne...")
			await _auto_walk_to(Vector2(28 * 48, 9 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("npc-king-loric", {"name": "King Lorik"}, false)
			_set_auto_play_status("Audience with King Lorik: Receiving Quest of Erdrick...")
			await get_tree().create_timer(2.2).timeout
			if not _is_auto_valid(gen): return
			_on_accept_loric_quest()
			await get_tree().create_timer(1.0).timeout
			if not _is_auto_valid(gen): return

		# Open 120g chest
		if not GameState.world_flags.get("chest_chest-120g", false):
			_set_auto_play_status("Opening Royal Chest (120 Gold)...")
			await _auto_walk_to(Vector2(18 * 48 + 72, 10 * 48 + 72), gen)
			if not _is_auto_valid(gen): return
			_on_chest_opened("chest-120g", "King's Gold Chest (120 Gold)")
			await get_tree().create_timer(1.0).timeout
			if not _is_auto_valid(gen): return

		# Open torch chest
		if not GameState.world_flags.get("chest_chest-torch", false):
			_set_auto_play_status("Opening Royal Chest (Torch)...")
			await _auto_walk_to(Vector2(22 * 48 + 72, 10 * 48 + 72), gen)
			if not _is_auto_valid(gen): return
			_on_chest_opened("chest-torch", "Chest with Torch")
			await get_tree().create_timer(1.0).timeout
			if not _is_auto_valid(gen): return

		# Open magic key chest
		if not GameState.world_flags.get("chest_chest-magic-key", false):
			_set_auto_play_status("Claiming the Magic Key...")
			await _auto_walk_to(Vector2(26 * 48 + 72, 10 * 48 + 72), gen)
			if not _is_auto_valid(gen): return
			_on_chest_opened("chest-magic-key", "Chest with Magic Key")
			await get_tree().create_timer(1.0).timeout
			if not _is_auto_valid(gen): return

		# If dragonlord is not defeated yet, go to Charlock Castle
		if not GameState.world_flags.get("defeated_dragonlord", false):
			_set_auto_play_status("Unlocking Royal Gate with Magic Key...")
			await _auto_walk_to(Vector2(28 * 48 + 96, 22 * 48 + 48), gen)
			if not _is_auto_valid(gen): return
			await get_tree().create_timer(0.8).timeout
			if not _is_auto_valid(gen): return

			_set_auto_play_status("Descending Stairs to Charlock Castle...")
			await _auto_walk_to(Vector2(28 * 48 + 96, 25 * 48 + 96), gen)
			if not _is_auto_valid(gen): return
			CartridgeManager.transition_to_map("charlock-castle", Vector2(20, 25))
			return

		# If dragonlord was defeated and princess was rescued, conclude campaign!
		if GameState.world_flags.get("princess_rescued", false) or GameState.world_flags.get("defeated_dragonlord", false):
			if GameState.world_flags.get("campaign_victory", false):
				return
			GameState.world_flags["campaign_victory"] = true
			_set_auto_play_status("Presenting Princess Gwaelin to King Lorik...")
			await _auto_walk_to(Vector2(28 * 48, 9 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("npc-king-loric", {"name": "King Lorik"}, false)
			await get_tree().create_timer(2.5).timeout
			if not _is_auto_valid(gen): return
			_trigger_victory()
			_set_auto_play_status("🏆 TOTAL VICTORY: Erdrick restored the Ball of Light and saved Alefgard!")
			return

	elif current_map_slug == "charlock-castle" or "charlock" in current_map_slug:
		if not GameState.world_flags.get("defeated_dragonlord", false):
			_set_auto_play_status("Erdrick confronts the Dragonlord in his Throne Room...")
			await _auto_walk_to(Vector2(20 * 48, 16 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("dragonlord", {"name": "The Dragonlord"}, true)
			await get_tree().create_timer(2.4).timeout
			if not _is_auto_valid(gen): return
			_on_defeat_dragonlord("dragonlord")
			_set_auto_play_status("Dragonlord Vanquished! Sacred Ball of Light Restored!")
			await get_tree().create_timer(1.5).timeout
			if not _is_auto_valid(gen): return

		if not GameState.world_flags.get("princess_rescued", false):
			_set_auto_play_status("Rescuing Princess Gwaelin from the Lair...")
			await _auto_walk_to(Vector2(20 * 48, 9 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("npc-princess-gwaelin", {"name": "Princess Gwaelin"}, false)
			await get_tree().create_timer(2.2).timeout
			if not _is_auto_valid(gen): return
			_on_escort_gwaelin()
			return

func _run_rescue_princess_auto_play(gen: int) -> void:
	if current_map_slug == "throne-room":
		if not GameState.world_flags.get("talked_to_king", false):
			_set_auto_play_status("Sir Caleb approaches King Alden...")
			await _auto_walk_to(Vector2(25 * 48, 7 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("king-alden", {"name": "King Alden"}, false)
			await get_tree().create_timer(2.2).timeout
			if not _is_auto_valid(gen): return
			_on_accept_king_quest()
			await get_tree().create_timer(1.0).timeout
			if not _is_auto_valid(gen): return

		if not GameState.world_flags.get("obtained_heros_sword", false):
			_set_auto_play_status("Heading to Main Castle Forge...")
			await _auto_walk_to(Vector2(25 * 48, 28 * 48), gen)
			if not _is_auto_valid(gen): return
			_on_passage_entered("passage-main-castle")
			return

		if GameState.world_flags.get("princess_rescued", false):
			if GameState.world_flags.get("campaign_victory", false):
				return
			GameState.world_flags["campaign_victory"] = true
			_set_auto_play_status("Returning Princess Jennifer to King Alden...")
			await _auto_walk_to(Vector2(25 * 48, 7 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("king-alden", {"name": "King Alden"}, false)
			await get_tree().create_timer(2.5).timeout
			if not _is_auto_valid(gen): return
			_trigger_victory()
			_set_auto_play_status("🏆 TOTAL VICTORY: Princess Jennifer rescued and Eldoria saved!")
			return

	elif current_map_slug == "main-castle":
		if not GameState.world_flags.get("defeated_projection_goblin", false):
			_set_auto_play_status("Speaking with Master Torvald at the Forge...")
			await _auto_walk_to(Vector2(18 * 48, 13 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("blacksmith-torvald", {"name": "Master Torvald"}, false)
			await get_tree().create_timer(2.0).timeout
			if not _is_auto_valid(gen): return
			_on_begin_torvald_trial()

			_set_auto_play_status("Fighting the Projection Goblin...")
			await _auto_walk_to(Vector2(26 * 48, 13 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("projection-goblin", {"name": "Projection Goblin"}, true)
			await get_tree().create_timer(1.8).timeout
			if not _is_auto_valid(gen): return
			_on_defeat_projection_goblin("projection-goblin")
			await get_tree().create_timer(1.0).timeout
			if not _is_auto_valid(gen): return

		if not GameState.world_flags.get("obtained_heros_sword", false):
			_set_auto_play_status("Claiming the Hero's Sword from Torvald...")
			await _auto_walk_to(Vector2(18 * 48, 13 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("blacksmith-torvald", {"name": "Master Torvald"}, false)
			await get_tree().create_timer(2.0).timeout
			if not _is_auto_valid(gen): return
			_on_claim_heros_sword()
			await get_tree().create_timer(1.0).timeout
			if not _is_auto_valid(gen): return

		_set_auto_play_status("Journeying to Dark Lord Malakor's Lair...")
		await _auto_walk_to(Vector2(35 * 48, 15 * 48), gen)
		if not _is_auto_valid(gen): return
		_on_passage_entered("passage-dark-lair")
		return

	elif current_map_slug == "dark-lord-lair":
		if not GameState.world_flags.get("defeated_dark_lord", false):
			_set_auto_play_status("Confronting Dark Lord Malakor...")
			await _auto_walk_to(Vector2(25 * 48, 16 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("dark-lord-malakor", {"name": "Dark Lord Malakor"}, true)
			await get_tree().create_timer(2.2).timeout
			if not _is_auto_valid(gen): return
			_on_defeat_dark_lord("dark-lord-malakor")
			_set_auto_play_status("Dark Lord Malakor Slain by the Hero's Sword!")
			await get_tree().create_timer(1.5).timeout
			if not _is_auto_valid(gen): return

		if not GameState.world_flags.get("princess_rescued", false):
			_set_auto_play_status("Freeing Princess Jennifer from shadow bonds...")
			await _auto_walk_to(Vector2(25 * 48, 9 * 48), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc("princess-jennifer", {"name": "Princess Jennifer"}, false)
			await get_tree().create_timer(2.2).timeout
			if not _is_auto_valid(gen): return
			_on_escort_princess()
			return

func _run_generic_auto_play(gen: int) -> void:
	_set_auto_play_status("Exploring map for points of interest...")
	await get_tree().create_timer(1.0).timeout
	if not _is_auto_valid(gen): return

	for slug in spawned_npcs:
		var npc_node = spawned_npcs[slug]
		if is_instance_valid(npc_node):
			var ch_data = CartridgeManager.characters_cache.get(slug, {})
			var name_str = str(ch_data.get("name", slug))
			_set_auto_play_status("Approaching %s..." % name_str)
			await _auto_walk_to(npc_node.global_position + Vector2(0, 36), gen)
			if not _is_auto_valid(gen): return
			_interact_with_npc(slug, ch_data, false)
			await get_tree().create_timer(2.0).timeout
			if not _is_auto_valid(gen): return
			_close_dialog()

	for child in $MapElements.get_children():
		if child is Area2D and "Chest_" in child.name:
			var obj_id = child.name.replace("Chest_", "")
			if not GameState.world_flags.get("chest_" + obj_id, false):
				_set_auto_play_status("Opening %s..." % child.name)
				await _auto_walk_to(child.global_position, gen)
				if not _is_auto_valid(gen): return
				_on_chest_opened(obj_id, "Treasure Chest")
				await get_tree().create_timer(1.0).timeout
				if not _is_auto_valid(gen): return

	for child in $MapElements.get_children():
		if child is Area2D and "Passage_" in child.name:
			var obj_id = child.name.replace("Passage_", "")
			_set_auto_play_status("Entering passage: %s..." % child.name)
			await _auto_walk_to(child.global_position, gen)
			if not _is_auto_valid(gen): return
			_on_passage_entered(obj_id)
			return

