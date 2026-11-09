extends Node2D

const VW := 512
const VH := 480

const BASE_CLASSES := ["Fighter", "Thief", "Black Belt", "Red Mage", "White Mage", "Black Mage"]
const CLASS_SLUGS := {
	"Fighter": "fighter",
	"Thief": "thief",
	"Black Belt": "black_belt",
	"Red Mage": "red_mage",
	"White Mage": "white_mage",
	"Black Mage": "black_mage"
}
const DEFAULT_NAMES := ["ZEST", "SAIL", "ROBO", "MAGE"]

var _step_mode: String = "class_select"
var _active_slot: int = 0
var _slot_class_indices: Array[int] = [0, 1, 4, 5] # Fighter, Thief, White Mage, Black Mage
var _slot_names: Array[String] = ["ZEST", "SAIL", "ROBO", "MAGE"]
var _slot_confirmed: Array[bool] = [false, false, false, false]

var _cards: Array[Panel] = []
var _class_labels: Array[Label] = []
var _name_labels: Array[Label] = []
var _stat_labels: Array[Label] = []
var _sprites: Array[TextureRect] = []
var _status_banner: Label
var _music: AudioStreamPlayer

func _ready() -> void:
	_build_ui()
	_refresh_ui()
	_start_music()

func _start_music() -> void:
	var path := "res://assets/music/12_-_menu_screen.mp3"
	if ResourceLoader.exists(path):
		_music = AudioStreamPlayer.new()
		_music.stream = load(path)
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()

func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.02, 0.03, 0.12, 1.0)
	bg.size = Vector2(VW, VH)
	add_child(bg)

	var hdr_panel := NESWindow.make_panel(Vector2(16, 12), Vector2(VW - 32, 48), NESWindow.NES_BLUE)
	add_child(hdr_panel)
	var hdr_lbl := NESWindow.make_label("CREATE YOUR 4 LIGHT WARRIORS", Vector2(0, 12), Vector2(VW - 32, 24), 18, NESWindow.NES_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	hdr_panel.add_child(hdr_lbl)

	var positions := [
		Vector2(16, 70),
		Vector2(264, 70),
		Vector2(16, 244),
		Vector2(264, 244)
	]

	for i in range(4):
		var card := NESWindow.make_panel(positions[i], Vector2(232, 162), NESWindow.NES_BLUE)
		add_child(card)
		_cards.append(card)

		var slot_hdr := NESWindow.make_label("WARRIOR %d" % (i + 1), Vector2(12, 8), Vector2(120, 20), 12, NESWindow.NES_DIM)
		card.add_child(slot_hdr)

		var cls_lbl := NESWindow.make_label("◄ FIGHTER ►", Vector2(12, 30), Vector2(208, 24), 16, NESWindow.NES_GOLD)
		card.add_child(cls_lbl)
		_class_labels.append(cls_lbl)

		var spr := TextureRect.new()
		spr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		spr.position = Vector2(22, 64)
		spr.size = Vector2(48, 72)
		card.add_child(spr)
		_sprites.append(spr)

		var nm_lbl := NESWindow.make_label("NAME: ZEST", Vector2(84, 62), Vector2(138, 22), 14, NESWindow.NES_WHITE)
		card.add_child(nm_lbl)
		_name_labels.append(nm_lbl)

		var st_lbl := NESWindow.make_label("", Vector2(84, 86), Vector2(138, 68), 11, NESWindow.NES_DIM)
		card.add_child(st_lbl)
		_stat_labels.append(st_lbl)

	var footer_panel := NESWindow.make_panel(Vector2(16, 418), Vector2(VW - 32, 48), NESWindow.NES_DARK)
	add_child(footer_panel)
	_status_banner = NESWindow.make_label("", Vector2(8, 12), Vector2(VW - 48, 24), 13, NESWindow.NES_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	footer_panel.add_child(_status_banner)

func _refresh_ui() -> void:
	var gs := get_node_or_null("/root/GameState")
	for i in range(4):
		var cname: String = BASE_CLASSES[_slot_class_indices[i]]
		var is_active := (i == _active_slot and _step_mode != "ready")
		var prefix := "◄ " if (is_active and _step_mode == "class_select") else "  "
		var suffix := " ►" if (is_active and _step_mode == "class_select") else ""
		_class_labels[i].text = "%s%s%s" % [prefix, cname.to_upper(), suffix]
		_class_labels[i].add_theme_color_override("font_color", NESWindow.NES_GOLD if is_active else NESWindow.NES_WHITE)

		var name_prefix := "▶ NAME: " if (is_active and _step_mode == "name_entry") else "  NAME: "
		var confirmed_tag := " ✓" if _slot_confirmed[i] else ""
		_name_labels[i].text = "%s%s%s" % [name_prefix, _slot_names[i], confirmed_tag]
		_name_labels[i].add_theme_color_override("font_color", NESWindow.NES_GOLD if (is_active and _step_mode == "name_entry") else NESWindow.NES_WHITE)

		var slug: String = CLASS_SLUGS.get(cname, "fighter")
		var spr_path := "res://assets/sprites/classes/%s_battle.png" % slug
		var abs_p := ProjectSettings.globalize_path(spr_path)
		if FileAccess.file_exists(abs_p):
			var im := Image.load_from_file(abs_p)
			if im != null:
				_sprites[i].texture = ImageTexture.create_from_image(im)
		elif ResourceLoader.exists(spr_path):
			_sprites[i].texture = load(spr_path)

		if gs:
			var tpl: Dictionary = gs.get_class_template(cname)
			var st: Dictionary = tpl.get("startingStats", {})
			_stat_labels[i].text = "HP:%d  MP:%d\nSTR:%d AGI:%d\nINT:%d VIT:%d LCK:%d" % [
				int(st.get("hp", 30)), int(st.get("mpLv1", 0)),
				int(st.get("str", 10)), int(st.get("agi", 10)),
				int(st.get("int", 10)), int(st.get("vit", 10)), int(st.get("luck", 10))
			]

	if _step_mode == "class_select":
		_status_banner.text = "WARRIOR %d: ◄► CHANGE CLASS   ENTER CONFIRM CLASS" % (_active_slot + 1)
	elif _step_mode == "name_entry":
		_status_banner.text = "WARRIOR %d: ENTER CONFIRM NAME '%s'" % [_active_slot + 1, _slot_names[_active_slot]]
	else:
		_status_banner.text = "PARTY READY! PRESS ENTER TO BEGIN ADVENTURE IN CONERIA"

func _unhandled_input(event: InputEvent) -> void:
	if _step_mode == "class_select":
		if event.is_action_pressed("move_right") or event.is_action_pressed("ui_right"):
			_slot_class_indices[_active_slot] = (_slot_class_indices[_active_slot] + 1) % BASE_CLASSES.size()
			_refresh_ui()
		elif event.is_action_pressed("move_left") or event.is_action_pressed("ui_left"):
			_slot_class_indices[_active_slot] = (_slot_class_indices[_active_slot] - 1 + BASE_CLASSES.size()) % BASE_CLASSES.size()
			_refresh_ui()
		elif event.is_action_pressed("ui_accept"):
			_step_mode = "name_entry"
			_refresh_ui()
	elif _step_mode == "name_entry":
		if event.is_action_pressed("ui_accept"):
			_slot_confirmed[_active_slot] = true
			if _active_slot < 3:
				_active_slot += 1
				_step_mode = "class_select"
			else:
				_step_mode = "ready"
			_refresh_ui()
		elif event.is_action_pressed("ui_cancel"):
			_step_mode = "class_select"
			_refresh_ui()
	elif _step_mode == "ready":
		if event.is_action_pressed("ui_accept"):
			_finalize_party_and_start()

func configure_slot(slot_idx: int, class_name_str: String, char_name: String) -> void:
	if slot_idx < 0 or slot_idx >= 4:
		return
	for idx in range(BASE_CLASSES.size()):
		if BASE_CLASSES[idx].to_lower() == class_name_str.to_lower():
			_slot_class_indices[slot_idx] = idx
			break
	if char_name.strip_edges() != "":
		_slot_names[slot_idx] = char_name.strip_edges().substr(0, 4).to_upper()
	_slot_confirmed[slot_idx] = true
	_refresh_ui()

func _finalize_party_and_start() -> void:
	if _music:
		_music.stop()
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.party = []
		for i in range(4):
			var cname: String = BASE_CLASSES[_slot_class_indices[i]]
			var nstr: String = _slot_names[i]
			gs.party.append(gs.make_party_member(nstr, cname))
		gs.gold = 400
		gs.party_created = true
		gs.spawn_tile = Vector2i(16, 21)
		gs.spawn_facing = "up"
	get_tree().change_scene_to_file.call_deferred("res://scenes/Coneria.tscn")

func get_party_create_state() -> Dictionary:
	var slots: Array = []
	for i in range(4):
		slots.append({
			"slot": i + 1,
			"class": BASE_CLASSES[_slot_class_indices[i]],
			"name": _slot_names[i],
			"confirmed": _slot_confirmed[i]
		})
	return {
		"step_mode": _step_mode,
		"active_slot": _active_slot,
		"slots": slots
	}
