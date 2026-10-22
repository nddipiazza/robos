## WorldMap — the Alefgard overworld.
## Displays dw1-over2.png as a scrolling background.
## Hero walks on the map with tile-based movement.
extends Node2D

const TILE_SIZE := 32
const MAP_SRC_PX := 1984
const MAP_SCALE := 2.0
const MAP_DISPLAY_PX := int(MAP_SRC_PX * MAP_SCALE)
const MAP_TILES := 124
const VW := 512
const VH := 480
const MOVE_SPEED := 8.0
const TYPING_SPEED := 0.04
const DIALOG_H := 152
const DIALOG_MARGIN := 10
const MENU_ITEMS := ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"]
const MENU_COLS := 2
const MENU_ROWS := 4

const TANTEGEL_TILE  := Vector2i(45,  45)   # Tantegel Castle entrance
const BRECCONARY     := Vector2i(50,  43)   # Brecconary town
const GARINHAM       := Vector2i(4,   4)    # Garinham town
const KOL            := Vector2i(106, 12)   # Kol town
const RIMULDAR       := Vector2i(104, 74)   # Rimuldar town
const CANTLIN        := Vector2i(75,  104)  # Cantlin town
const HAUKSNESS      := Vector2i(27,  91)   # Hauksness ruins
const CHARLOCK       := Vector2i(50,  50)   # Charlock Castle entrance
const ERDRICK_CAVE   := Vector2i(30,  14)   # Erdrick's Cave entrance
const MOUNTAIN_CAVE  := Vector2i(31,  59)   # Mountain Cave entrance
const SWAMP_CAVE_N   := Vector2i(106, 46)   # Swamp Cave north entrance
const SWAMP_CAVE_S   := Vector2i(106, 51)   # Swamp Cave south entrance
const STAFF_RAIN_CAVE  := Vector2i(83,  3)  # Staff of Rain Cave (STAIRS)
const RAINBOW_CAVE     := Vector2i(110, 111) # Rainbow Drop Cave (STAIRS)
const BRIDGE_TILE      := Vector2i(66,  51)  # Rainbow Drop bridge location
const ERDRICK_TOKEN  := Vector2i(85,  114)  # Erdrick's Token burial spot (SEARCH)
const CASTLE_TILE    := TANTEGEL_TILE
const TANTEGEL_BASEMENT := Vector2i(-1, -1)

# Categorised transition map for debug overlay colouring
# category → color:  castle=cyan  town=green  dungeon=orange  charlock=red
const TRANSITION_TILES := {
	# x*1000+y → {label, scene, spawn, facing, cat}  — built at runtime below
}
const T_TOWN    := Color(0.2, 1.0, 0.3, 0.55)
const T_CASTLE  := Color(0.3, 0.8, 1.0, 0.55)
const T_DUNGEON := Color(1.0, 0.6, 0.1, 0.55)
const T_CHARLOCK:= Color(1.0, 0.2, 0.2, 0.55)

const BRECCONARY_SPAWN := Vector2i(1, 30)
const GARINHAM_SPAWN := Vector2i(9, 20)
const KOL_SPAWN := Vector2i(12, 24)
const RIMULDAR_SPAWN := Vector2i(1, 16)
const CANTLIN_SPAWN := Vector2i(13, 1)
const HAUKSNESS_SPAWN := Vector2i(8, 20)
const ERDRICKS_CAVE_SPAWN := Vector2i(4, 0)
const MOUNTAIN_CAVE_SPAWN := Vector2i(0, 7)
const SWAMP_CAVE_N_SPAWN := Vector2i(3, 0)
const SWAMP_CAVE_S_SPAWN := Vector2i(3, 31)
const CHARLOCK_SPAWN := Vector2i(10, 21)

# Spawns loaded from data/map_start_positions_from_world.json at runtime
var _map_spawns: Dictionary = {}  # map_id → {spawn: Vector2i, facing: String}

const FR_DOWN  := [Rect2(  0, 0, 16, 16), Rect2( 20, 0, 16, 16)]
const FR_LEFT  := [Rect2( 40, 0, 16, 16), Rect2( 60, 0, 16, 16)]
const FR_UP    := [Rect2( 80, 0, 16, 16), Rect2(100, 0, 16, 16)]
const FR_RIGHT := [Rect2(120, 0, 16, 16), Rect2(140, 0, 16, 16)]

const BLOCKED_TERRAIN := {0: true, 6: true}
const TERRAIN_RATE_KEY := {
	0: "none", 1: "forest", 2: "forest",
	3: "grass", 4: "plains", 5: "desert",
	6: "none", 7: "swamp", 8: "hills"
}
const BATTLE_SCENE := "res://scenes/BattleOverlay.tscn"

@export var spawn_tile: Vector2i = Vector2i(0x2d, 0x2e)
@export var spawn_facing: String = "down"

var _hero_tile: Vector2i = Vector2i(0x2d, 0x2e)
var _hero_facing: Vector2i = Vector2i(0, 1)
var _hero_moving := false
var _move_t := 0.0
var _cam_world := Vector2.ZERO
var _cam_from := Vector2.ZERO
var _cam_to := Vector2.ZERO

var _map_sprites: Array = []
var _hero_ws: WalkSprite
var _music: AudioStreamPlayer
var _sfx: AudioStreamPlayer
var _debug_overlay: CanvasLayer
var _debug_labels: Array = []
var _debug_rects: Array = []   # ColorRect pool for transition tile highlights
var _debug_active := false
var _terrain: Array = []
var _zone_data: Dictionary = {}
var _monsters_db: Array = []
var _battle_active := false

var _dialog_panel: Panel
var _speaker_label: Label
var _dialog_label: Label
var _prompt_label: Label
var _menu_panel: Panel
var _menu_labels: Array = []
var _status_panel: Panel
var _item_panel: Panel
var _item_labels: Array = []

var _dialog_active := false
var _dialog_pages: Array[String] = []
var _dialog_on_done := Callable()
var _current_page := 0
var _char_index := 0
var _is_typing := false

var _menu_open := false
var _menu_index := 0
var _status_open := false
var _item_open := false
var _item_index := 0

var _inventory: Array = []
var _hero_gold := 0
var _opened_chests: Dictionary = {}
var _bridge_built := false
var _bridge_rect: ColorRect
var _bridge_animating := false
var _bridge_anim_t := 0.0
const BRIDGE_ANIM_DURATION := 2.5  # seconds of rainbow flash

func _ready() -> void:
	var gs := get_node_or_null("/root/GameState")
	if gs:
		_inventory = gs.inventory.duplicate(true)
		_hero_gold = gs.gold
		_opened_chests = gs.opened_chests.duplicate(true)
		_bridge_built = gs.bridge_built
		# Stepping outside puts the torch out. RADIANT is a step counter on the
		# NES and keeps ticking out here (see the move handler), so a hero who
		# lit the Swamp Cave and walks on to the next cave is still lit.
		if "torch_active" in gs:
			gs.torch_active = false
		if gs.come_from != "" or gs.spawn_tile != spawn_tile:
			_hero_tile = gs.spawn_tile
			_hero_facing = _facing_to_vec(gs.spawn_facing)
		else:
			_hero_tile = spawn_tile
			_hero_facing = _facing_to_vec(spawn_facing)
	else:
		_hero_tile = spawn_tile
		_hero_facing = _facing_to_vec(spawn_facing)

	_cam_world = _tile_center(_hero_tile)
	_cam_from = _cam_world
	_cam_to = _cam_world

	_build_bridge_overlay()
	_load_map_spawns()
	if not InputMap.has_action("cmd_menu"):
		InputMap.add_action("cmd_menu")
		var ev := InputEventKey.new()
		ev.keycode = KEY_B
		InputMap.action_add_event("cmd_menu", ev)

	_build_map()
	_build_hero()
	_build_debug_overlay()
	if gs and gs.tile_debug_enabled:
		_debug_active = true
		if _debug_overlay:
			_debug_overlay.visible = true
		_update_debug_overlay()
	_build_ui()
	_build_sfx_player()
	_load_terrain()
	_load_zone_data()
	_load_monsters_db()
	Input.action_release("move_up")
	Input.action_release("move_down")
	Input.action_release("move_left")
	Input.action_release("move_right")
	_draw_frame()
	_start_music()

func _load_map_spawns() -> void:
	var f := FileAccess.open("res://data/v1/map_start_positions_from_world.json", FileAccess.READ)
	if not f:
		return
	var data = JSON.parse_string(f.get_as_text())
	if not data is Dictionary:
		return
	for entry in data.get("map_entry_points", []):
		var mid: String = str(entry.get("map", ""))
		var wx = int(entry.get("world", {}).get("x", 0))
		var wy = int(entry.get("world", {}).get("y", 0))
		var facing: String = str(entry.get("facing", "down"))
		_map_spawns[mid] = {"spawn": Vector2i(wx, wy), "facing": facing}

func _spawn_for(map_id: String, fallback: Vector2i, fallback_facing: String = "up") -> Array:
	if _map_spawns.has(map_id):
		var e = _map_spawns[map_id]
		return [e["spawn"], e["facing"]]
	return [fallback, fallback_facing]

func _build_map() -> void:
	var tex := load("res://assets/maps/dw1-over2.png") as Texture2D
	if not tex:
		push_error("WorldMap: could not load dw1-over2.png")
		return

	var half := Vector2(VW * 0.5, VH * 0.5)
	var raw_offset := -_cam_world + half
	var ox := fmod(raw_offset.x, float(MAP_DISPLAY_PX))
	if ox > 0.0:
		ox -= float(MAP_DISPLAY_PX)
	var oy := fmod(raw_offset.y, float(MAP_DISPLAY_PX))
	if oy > 0.0:
		oy -= float(MAP_DISPLAY_PX)

	var offsets := [
		Vector2(ox, oy),
		Vector2(ox + MAP_DISPLAY_PX, oy),
		Vector2(ox, oy + MAP_DISPLAY_PX),
		Vector2(ox + MAP_DISPLAY_PX, oy + MAP_DISPLAY_PX)
	]

	for i in range(4):
		var sp := Sprite2D.new()
		sp.texture = tex
		sp.centered = false
		sp.scale = Vector2(MAP_SCALE, MAP_SCALE)
		sp.position = offsets[i]
		add_child(sp)
		_map_sprites.append(sp)

func _build_hero() -> void:
	_hero_ws = WalkSprite.new()
	_hero_ws.is_hero = true
	_hero_ws.pixel_scale = 2.0
	_hero_ws.toggle_time = 0.35
	_hero_ws.texture = load("res://assets/sprites/rgba/characters-3.png") as Texture2D
	var fr := _facing_frames(_hero_facing)
	_hero_ws.frame0_rect = fr[0]
	_hero_ws.frame1_rect = fr[1]
	add_child(_hero_ws)

func _build_sfx_player() -> void:
	_sfx = AudioStreamPlayer.new()
	add_child(_sfx)

func _build_bridge_overlay() -> void:
	_bridge_rect = ColorRect.new()
	_bridge_rect.size = Vector2(TILE_SIZE * MAP_SCALE, TILE_SIZE * MAP_SCALE)
	_bridge_rect.color = Color(0.55, 0.35, 0.15, 1.0)  # wooden bridge brown
	_bridge_rect.z_index = 1
	_bridge_rect.visible = _bridge_built
	add_child(_bridge_rect)

func _play_sfx(path: String) -> void:
	var stream := load(path) as AudioStream
	if stream and _sfx:
		_sfx.stream = stream
		_sfx.play()

func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	var bgm := load("res://assets/music/mp3/kingdom_of_alefgard.mp3") as AudioStream
	if bgm:
		_music.stream = bgm
		if _music.stream is AudioStreamMP3:
			(_music.stream as AudioStreamMP3).loop = true
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()

func _process(delta: float) -> void:
	if _bridge_animating:
		_bridge_anim_t += delta
		var frac := fmod(_bridge_anim_t * 4.0, 1.0)  # cycle hue 4×/sec
		_bridge_rect.color = Color.from_hsv(frac, 1.0, 1.0, 1.0)
		if _bridge_anim_t >= BRIDGE_ANIM_DURATION:
			_bridge_animating = false
			_bridge_built = true
			_bridge_rect.color = Color(0.55, 0.35, 0.15, 1.0)
			_bridge_rect.visible = true
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.bridge_built = true
	if _battle_active:
		_draw_frame()
		return
	if _hero_moving:
		var gs = get_node_or_null("/root/GameState")
		var mult: float = 2.0 if (gs and gs.double_speed) else 1.0
		_move_t = min(_move_t + delta * MOVE_SPEED * mult, 1.0)
		_cam_world = _cam_from.lerp(_cam_to, _move_t)
		if _move_t >= 1.0:
			_hero_moving = false
			var gs_regen = get_node_or_null("/root/GameState")
			if gs_regen and gs_regen.has_method("apply_step_regen"):
				gs_regen.apply_step_regen()
			if gs_regen and "radiant_steps_left" in gs_regen and int(gs_regen.radiant_steps_left) > 0:
				gs_regen.radiant_steps_left = int(gs_regen.radiant_steps_left) - 1
			_check_map_trigger()
	elif not _dialog_active and not _menu_open and not _status_open and not _item_open:
		_poll_move_input()
	_draw_frame()

func _draw_frame() -> void:
	var half := Vector2(VW * 0.5, VH * 0.5)
	var raw_offset := -_cam_world + half
	var ox := fmod(raw_offset.x, float(MAP_DISPLAY_PX))
	if ox > 0.0:
		ox -= float(MAP_DISPLAY_PX)
	var oy := fmod(raw_offset.y, float(MAP_DISPLAY_PX))
	if oy > 0.0:
		oy -= float(MAP_DISPLAY_PX)
	if _map_sprites.size() == 4:
		_map_sprites[0].position = Vector2(ox, oy)
		_map_sprites[1].position = Vector2(ox + MAP_DISPLAY_PX, oy)
		_map_sprites[2].position = Vector2(ox, oy + MAP_DISPLAY_PX)
		_map_sprites[3].position = Vector2(ox + MAP_DISPLAY_PX, oy + MAP_DISPLAY_PX)
	if _hero_ws:
		_hero_ws.position = Vector2(VW * 0.5 - 16.0, VH * 0.5 - 16.0)
	if _bridge_rect and (_bridge_built or _bridge_animating):
		var bridge_world := Vector2(BRIDGE_TILE.x * TILE_SIZE, BRIDGE_TILE.y * TILE_SIZE)
		_bridge_rect.position = _w2s(bridge_world)
	_update_debug_overlay()

func _poll_move_input() -> void:
	var dir := Vector2i.ZERO
	if Input.is_action_pressed("move_up"):
		dir = Vector2i(0, -1)
	elif Input.is_action_pressed("move_down"):
		dir = Vector2i(0, 1)
	elif Input.is_action_pressed("move_left"):
		dir = Vector2i(-1, 0)
	elif Input.is_action_pressed("move_right"):
		dir = Vector2i(1, 0)
	if dir == Vector2i.ZERO:
		return
	var prev_facing := _hero_facing
	_hero_facing = dir
	if _hero_ws:
		var fr := _facing_frames(dir)
		if dir != prev_facing:
			_hero_ws.set_frames(fr[0], fr[1])
		_hero_ws.step()
	var dest := Vector2i(posmod(_hero_tile.x + dir.x, MAP_TILES), posmod(_hero_tile.y + dir.y, MAP_TILES))
	if not _is_walkable(dest):
		_play_sfx("res://assets/music/mp3/bumping_walls.mp3")
		return
	_hero_tile = dest
	_cam_from = _cam_world
	var tile_world := _tile_center(dest)
	var dx := tile_world.x - _cam_from.x
	if abs(dx) > MAP_DISPLAY_PX * 0.5:
		dx -= sign(dx) * float(MAP_DISPLAY_PX)
	var dy := tile_world.y - _cam_from.y
	if abs(dy) > MAP_DISPLAY_PX * 0.5:
		dy -= sign(dy) * float(MAP_DISPLAY_PX)
	_cam_to = _cam_from + Vector2(dx, dy)
	_move_t = 0.0
	_hero_moving = true

func _check_map_trigger() -> void:
	match _hero_tile:
		CASTLE_TILE:
			var s = _spawn_for("tantegel-castle-1f", Vector2i(11, 30), "up")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/Castle1F.tscn")
		BRECCONARY:
			var s = _spawn_for("brecconary-1f", BRECCONARY_SPAWN, "up")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/Brecconary.tscn")
		GARINHAM:
			var s = _spawn_for("garinham-1f", GARINHAM_SPAWN, "up")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/Garinham.tscn")
		KOL:
			var s = _spawn_for("kol-1f", KOL_SPAWN, "up")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/Kol.tscn")
		RIMULDAR:
			var s = _spawn_for("rimuldar-1f", RIMULDAR_SPAWN, "right")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/Rimuldar.tscn")
		CANTLIN:
			# NES: the Golem guards Cantlin's gate until it is destroyed once.
			var gs_g = get_node_or_null("/root/GameState")
			if gs_g and "golem_defeated" in gs_g and not gs_g.golem_defeated \
					and not ("dragonlord_defeated" in gs_g and gs_g.dragonlord_defeated):
				_golem_gate_battle()
				return
			var s = _spawn_for("cantlin-1f", CANTLIN_SPAWN, "down")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/Cantlin.tscn")
		HAUKSNESS:
			var s = _spawn_for("hauksness", HAUKSNESS_SPAWN, "up")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/Hauksness.tscn")
		ERDRICK_CAVE:
			var s = _spawn_for("erdricks-cave-b1", ERDRICKS_CAVE_SPAWN, "down")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/ErdricksCaveB1.tscn")
		MOUNTAIN_CAVE:
			var s = _spawn_for("mountain-cave-b1", MOUNTAIN_CAVE_SPAWN, "right")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/MountainCaveB1.tscn")
		SWAMP_CAVE_N:
			var s = _spawn_for("swamp-cave-b1-entry-1", SWAMP_CAVE_N_SPAWN, "down")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/SwampCave.tscn")
		SWAMP_CAVE_S:
			var s = _spawn_for("swamp-cave-b1-entry-2", SWAMP_CAVE_S_SPAWN, "up")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/SwampCave.tscn")
		CHARLOCK:
			var s = _spawn_for("charlock-castle-1f", CHARLOCK_SPAWN, "up")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/CharlockCastle1F.tscn")
		TANTEGEL_BASEMENT:
			var s = _spawn_for("tantegel-basement", Vector2i(1, 1), "down")
			_save_state(s[0], s[1], "world_map")
			get_tree().change_scene_to_file.call_deferred("res://scenes/TantegelBasement.tscn")
		_:
			_check_encounter()

func _check_encounter() -> void:
	var gs = get_node_or_null("/root/GameState")
	if gs and gs.encounters_disabled:
		return
	# NES: once the Dragonlord falls the monsters vanish from Alefgard.
	if gs and "dragonlord_defeated" in gs and gs.dragonlord_defeated:
		return
	if _terrain.is_empty() or _zone_data.is_empty():
		return
	var tid := int(_terrain[_hero_tile.y][_hero_tile.x])
	var rate_key: String = TERRAIN_RATE_KEY.get(tid, "grass")
	if rate_key == "none":
		return

	var zone_grid: Array = _zone_data.get("grid", [])
	if zone_grid.is_empty():
		return
	var gc := int(_hero_tile.x * 8.0 / MAP_TILES)
	var gr := int(_hero_tile.y * 8.0 / MAP_TILES)
	gc = clamp(gc, 0, 7)
	gr = clamp(gr, 0, 7)
	var zone_id := int(zone_grid[gr][gc])

	var rates: Dictionary = _zone_data.get("encounter_rates", {})
	var zone_rates: Dictionary = rates.get("zone0" if zone_id == 0 else "other", {})
	var denom: int = zone_rates.get(rate_key, 24)
	if denom <= 0 or randi() % denom != 0:
		return

	var sets: Dictionary = _zone_data.get("monster_sets", {})
	var pool: Array = sets.get(str(zone_id), [])
	if pool.is_empty():
		return
	var mon_key: String = pool[randi() % pool.size()]
	var mon_data: Dictionary = _get_monster(mon_key)
	if mon_data.is_empty():
		return
	_start_battle(mon_key, mon_data)

## Cantlin's gatekeeper. Winning opens the town for good; fleeing (or dying)
## leaves the hero on the gate tile so stepping on it again re-triggers the fight.
func _golem_gate_battle() -> void:
	var mon := _get_monster("golem")
	if mon.is_empty():
		mon = {"name": "Golem", "hp_min": 70, "hp_max": 70, "strength": 120, "agility": 60, "is_boss": true}
	_golem_gate_pending = true
	_start_battle("golem", mon)

var _golem_gate_pending := false

func _on_golem_gate_result(result: String) -> void:
	if not _golem_gate_pending:
		return
	_golem_gate_pending = false
	if result != "won":
		return
	var gs = get_node_or_null("/root/GameState")
	if gs and "golem_defeated" in gs:
		gs.golem_defeated = true
	_show_dialog("", ["The Golem crumbles to dust.\nThe gate of Cantlin\nstands open."], func():
		var s = _spawn_for("cantlin-1f", CANTLIN_SPAWN, "down")
		_save_state(s[0], s[1], "world_map")
		get_tree().change_scene_to_file.call_deferred("res://scenes/Cantlin.tscn")
	)

func _get_monster(key: String) -> Dictionary:
	for m in _monsters_db:
		if m.get("key", "") == key:
			return m
	return {}

func _start_battle(mon_key: String, mon_data: Dictionary) -> void:
	_battle_active = true
	# The battle overlay reads/consumes herbs from GameState: sync the scene copy first.
	var gs_pre: Node = get_node_or_null("/root/GameState")
	if gs_pre:
		gs_pre.inventory = _inventory.duplicate(true)
	if _music and _music.playing:
		_music.stop()

	var sfx := AudioStreamPlayer.new()
	var stinger := load("res://assets/music/mp3/monster_draws_near.mp3") as AudioStream
	if stinger:
		sfx.stream = stinger
		sfx.volume_db = 0.0
		add_child(sfx)
		sfx.play()

	var flash_layer := CanvasLayer.new()
	flash_layer.layer = 15
	add_child(flash_layer)
	var flash_rect := ColorRect.new()
	flash_rect.color = Color.TRANSPARENT
	flash_rect.size = Vector2(512, 480)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash_layer.add_child(flash_rect)

	var tw := create_tween()
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.06)
	tw.tween_property(flash_rect, "color", Color.BLACK, 0.06)
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.06)
	tw.tween_property(flash_rect, "color", Color.BLACK, 0.06)
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.06)
	tw.tween_property(flash_rect, "color", Color.BLACK, 0.06)
	tw.tween_property(flash_rect, "color", Color.WHITE, 0.08)
	tw.tween_property(flash_rect, "color", Color(0, 0, 0, 1), 0.15)
	await tw.finished

	var overlay: Node = load(BATTLE_SCENE).instantiate()
	add_child(overlay)
	overlay.call("start_battle", mon_key, mon_data)

	var tw2 := create_tween()
	tw2.tween_property(flash_rect, "color:a", 0.0, 0.3)
	await tw2.finished
	flash_layer.queue_free()
	if is_instance_valid(sfx):
		sfx.queue_free()

	overlay.connect("battle_ended", func(result: String):
		overlay.queue_free()
		_battle_active = false
		var gs_after: Node = get_node_or_null("/root/GameState")
		if gs_after:
			_hero_gold = int(gs_after.gold)   # battle rewards live in GameState
			_inventory = gs_after.inventory.duplicate(true)   # herbs used in battle
		if _music:
			_music.play()
		if result == "lost":
			_golem_gate_pending = false
			_on_defeat()
		elif _golem_gate_pending:
			_on_golem_gate_result(result)
	)

func _on_defeat() -> void:
	var gs: Node = get_node_or_null("/root/GameState")
	if gs:
		gs.inventory = _inventory.duplicate(true)
		gs.opened_chests = _opened_chests.duplicate(true)
		gs.bridge_built = _bridge_built
		gs.gold = int(gs.gold) / 2
		gs.hero_stats["hp"] = gs.hero_stats.get("hp_max", 15)
		gs.spawn_tile = Vector2i(11, 30)
		gs.spawn_facing = "down"
		gs.come_from = "defeat"
		gs.deaths = int(gs.deaths) + 1
	get_tree().change_scene_to_file.call_deferred("res://scenes/Castle1F.tscn")

func _load_terrain() -> void:
	var f := FileAccess.open("res://assets/maps/worldmap_terrain.json", FileAccess.READ)
	if not f:
		push_error("WorldMap: missing worldmap_terrain.json — run tools/gen_worldmap_terrain.py")
		return
	var data := JSON.parse_string(f.get_as_text()) as Dictionary
	if data and data.has("terrain"):
		_terrain = data["terrain"]

func _load_zone_data() -> void:
	if DataManager and DataManager.is_loaded and DataManager.worldmap_zones:
		_zone_data = DataManager.worldmap_zones
		return
	var f := FileAccess.open("res://data/v1/worldmap_zones.json", FileAccess.READ)
	if not f:
		push_error("WorldMap: missing data/v1/worldmap_zones.json")
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	var store := EncounterZonesDataStoreV1.from_value(data)
	if store:
		_zone_data = store.to_value()
	else:
		push_error("WorldMap: invalid data/v1/worldmap_zones.json schema")

func _load_monsters_db() -> void:
	if DataManager and DataManager.is_loaded and not DataManager.monsters.is_empty():
		_monsters_db = DataManager.monsters.values()
		return
	var f := FileAccess.open("res://data/v1/monsters.json", FileAccess.READ)
	if not f:
		push_error("WorldMap: missing data/v1/monsters.json")
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	var store := MonstersDataStoreV1.from_value(data)
	if store:
		_monsters_db = store.to_array()
	else:
		push_error("WorldMap: invalid data/v1/monsters.json schema")

func _is_walkable(tile: Vector2i) -> bool:
	if tile.x < 0 or tile.y < 0 or tile.x >= MAP_TILES or tile.y >= MAP_TILES:
		return false
	if _bridge_built and tile == BRIDGE_TILE:
		return true
	if _terrain.is_empty():
		return true
	var tid := int(_terrain[tile.y][tile.x])
	return not BLOCKED_TERRAIN.has(tid)

func _tile_center(tile: Vector2i) -> Vector2:
	return Vector2(tile.x * TILE_SIZE + TILE_SIZE * 0.5, tile.y * TILE_SIZE + TILE_SIZE * 0.5)

func _w2s(world: Vector2) -> Vector2:
	return world - _cam_world + Vector2(VW * 0.5, VH * 0.5)

func _facing_to_vec(f: String) -> Vector2i:
	match f:
		"up":
			return Vector2i(0, -1)
		"left":
			return Vector2i(-1, 0)
		"right":
			return Vector2i(1, 0)
	return Vector2i(0, 1)

func _vec_to_facing(v: Vector2i) -> String:
	match v:
		Vector2i(0, -1):
			return "up"
		Vector2i(-1, 0):
			return "left"
		Vector2i(1, 0):
			return "right"
	return "down"

func _facing_frames(dir: Vector2i) -> Array:
	match dir:
		Vector2i(0, -1):
			return FR_UP
		Vector2i(-1, 0):
			return FR_LEFT
		Vector2i(1, 0):
			return FR_RIGHT
	return FR_DOWN

func _build_debug_overlay() -> void:
	_debug_overlay = CanvasLayer.new()
	_debug_overlay.layer = 1
	_debug_overlay.visible = false
	add_child(_debug_overlay)
	var cols_vis := int(ceil(float(VW) / TILE_SIZE)) + 2
	var rows_vis := int(ceil(float(VH) / TILE_SIZE)) + 2
	var pool := cols_vis * rows_vis
	for _i in range(pool):
		# Transition highlight rect (drawn below the label)
		var rect := ColorRect.new()
		rect.size    = Vector2(TILE_SIZE, TILE_SIZE)
		rect.visible = false
		_debug_overlay.add_child(rect)
		_debug_rects.append(rect)
		# Terrain label
		var lbl := Label.new()
		lbl.add_theme_font_size_override("font_size", 8)
		lbl.add_theme_color_override("font_color", Color(1, 1, 0, 1))
		lbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 1))
		lbl.add_theme_constant_override("shadow_offset_x", 1)
		lbl.add_theme_constant_override("shadow_offset_y", 1)
		lbl.visible = false
		_debug_overlay.add_child(lbl)
		_debug_labels.append(lbl)

func _transition_color(tile: Vector2i) -> Color:
	match tile:
		TANTEGEL_TILE:
			return T_CASTLE
		BRECCONARY, GARINHAM, KOL, RIMULDAR, CANTLIN, HAUKSNESS:
			return T_TOWN
		ERDRICK_CAVE, MOUNTAIN_CAVE, SWAMP_CAVE_N, SWAMP_CAVE_S:
			return T_DUNGEON
		STAFF_RAIN_CAVE, RAINBOW_CAVE:
			return T_DUNGEON
		CHARLOCK:
			return T_CHARLOCK
		_:
			return Color.TRANSPARENT

func _transition_label(tile: Vector2i) -> String:
	match tile:
		TANTEGEL_TILE:  return "CASTLE"
		BRECCONARY:     return "BREC"
		GARINHAM:       return "GAR"
		KOL:            return "KOL"
		RIMULDAR:       return "RIM"
		CANTLIN:        return "CANT"
		HAUKSNESS:      return "HAUK"
		ERDRICK_CAVE:   return "ERDC"
		MOUNTAIN_CAVE:  return "MTCV"
		SWAMP_CAVE_N:   return "SWN"
		SWAMP_CAVE_S:   return "SWS"
		STAFF_RAIN_CAVE: return "RAIN"
		RAINBOW_CAVE:   return "RBOW"
		CHARLOCK:       return "CHAR"
		_:              return ""

func _update_debug_overlay() -> void:
	if not _debug_active:
		return
	var half_w := VW * 0.5
	var half_h := VH * 0.5
	var col_min := int(floor((_cam_world.x - half_w) / TILE_SIZE))
	var row_min := int(floor((_cam_world.y - half_h) / TILE_SIZE))
	var col_max := int(ceil((_cam_world.x + half_w) / TILE_SIZE))
	var row_max := int(ceil((_cam_world.y + half_h) / TILE_SIZE))
	var idx := 0
	for row in range(row_min, row_max + 1):
		for col in range(col_min, col_max + 1):
			if idx >= _debug_labels.size():
				break
			var lbl: Label     = _debug_labels[idx]
			var rect: ColorRect = _debug_rects[idx]
			idx += 1
			var wr := posmod(row, MAP_TILES)
			var wc := posmod(col, MAP_TILES)
			var screen_pos := _w2s(Vector2(col * TILE_SIZE, row * TILE_SIZE))
			var tile := Vector2i(wc, wr)
			# Transition highlight
			var tc := _transition_color(tile)
			if tc != Color.TRANSPARENT:
				rect.color    = tc
				rect.position = screen_pos
				rect.visible  = true
			else:
				rect.visible  = false
			# Terrain label
			lbl.position = screen_pos + Vector2(2, 2)
			var tid := int(_terrain[wr][wc]) if not _terrain.is_empty() else -1
			const TNAMES := ["~", "Fk", "Fm", "Gr", "Pl", "De", "Mt", "Sw", "Hi"]
			var tname: String = TNAMES[tid] if tid >= 0 and tid < TNAMES.size() else "?"
			var tlbl := _transition_label(tile)
			lbl.text = "%s,%s\n%s%s" % [_fmt(wc), _fmt(wr), tname, (" [" + tlbl + "]") if tlbl != "" else ""]
			lbl.add_theme_color_override("font_color", Color.WHITE if tlbl != "" else Color(1, 1, 0, 1))
			lbl.visible = true
	for i in range(idx, _debug_labels.size()):
		(_debug_labels[i] as Label).visible = false
		(_debug_rects[i] as ColorRect).visible = false

func _fmt(n: int) -> String:
	return "%x" % n if n >= 10 else str(n)

func _make_box_style(bg: Color, border: Color, radius: int = 4) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.border_width_left = 2
	s.border_width_right = 2
	s.border_width_top = 2
	s.border_width_bottom = 2
	s.corner_radius_top_left = radius
	s.corner_radius_top_right = radius
	s.corner_radius_bottom_left = radius
	s.corner_radius_bottom_right = radius
	return s

func _make_label(txt: String, fsize: int = 14, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_size_override("font_size", fsize)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color.BLACK)
	l.add_theme_constant_override("shadow_offset_x", 1)
	l.add_theme_constant_override("shadow_offset_y", 1)
	return l

func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "UI"
	canvas.layer = 10
	add_child(canvas)
	_build_dialog_panel(canvas)
	_build_menu_panel(canvas)
	_build_status_panel(canvas)
	_build_item_panel(canvas)

func _build_dialog_panel(canvas: CanvasLayer) -> void:
	_dialog_panel = Panel.new()
	_dialog_panel.size = Vector2(VW - DIALOG_MARGIN * 2, DIALOG_H)
	_dialog_panel.position = Vector2(DIALOG_MARGIN, VH - DIALOG_H - DIALOG_MARGIN)
	_dialog_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.95), Color(0.6, 0.8, 1.0)))
	_dialog_panel.visible = false

	_speaker_label = _make_label("", 13, Color(1.0, 0.85, 0.3))
	_speaker_label.position = Vector2(12, 8)
	_dialog_panel.add_child(_speaker_label)

	_dialog_label = _make_label("", 14)
	_dialog_label.position = Vector2(12, 28)
	_dialog_label.size = Vector2(_dialog_panel.size.x - 24, 90)
	_dialog_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_panel.add_child(_dialog_label)

	_prompt_label = _make_label("▼", 13, Color(0.7, 0.9, 1.0))
	_prompt_label.position = Vector2(_dialog_panel.size.x - 24, DIALOG_H - 26)
	_dialog_panel.add_child(_prompt_label)
	canvas.add_child(_dialog_panel)

func _build_menu_panel(canvas: CanvasLayer) -> void:
	var pw := 180
	var ph := 140
	_menu_panel = Panel.new()
	_menu_panel.size = Vector2(pw, ph)
	_menu_panel.position = Vector2(VW - pw - 8, 8)
	_menu_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_menu_panel.visible = false
	_menu_labels = []
	for i in range(MENU_ITEMS.size()):
		var col := i % MENU_COLS
		var row := i / MENU_COLS
		var lbl := _make_label(MENU_ITEMS[i], 14)
		lbl.position = Vector2(16 + col * 82, 12 + row * 28)
		_menu_panel.add_child(lbl)
		_menu_labels.append(lbl)
	canvas.add_child(_menu_panel)

func _clear_panel(panel: Control) -> void:
	for child in panel.get_children():
		panel.remove_child(child)
		child.queue_free()

func _build_status_panel(canvas: CanvasLayer) -> void:
	_status_panel = Panel.new()
	_status_panel.size = Vector2(240, 220)
	_status_panel.position = Vector2((VW - 240) / 2, (VH - 220) / 2)
	_status_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_status_panel.visible = false
	canvas.add_child(_status_panel)
	_refresh_status_panel()

func _refresh_status_panel() -> void:
	_clear_panel(_status_panel)
	var gs := get_node_or_null("/root/GameState")
	var stats: Dictionary = {
		"name": "ERDRICK", "level": 1,
		"hp": 15, "hp_max": 15, "mp": 0, "mp_max": 0,
		"str": 4, "agl": 4, "atk": 4, "def": 2, "exp": 0
	}
	if gs:
		stats = gs.hero_stats
	var rows_data := [
		["NAME", stats.get("name", "ERDRICK")],
		["LEVEL", str(stats.get("level", 1))],
		["HP", "%d / %d" % [stats.get("hp", 15), stats.get("hp_max", 15)]],
		["MP", "%d / %d" % [stats.get("mp", 0), stats.get("mp_max", 0)]],
		["STR", str(stats.get("str", 4))],
		["AGL", str(stats.get("agl", 4))],
		["ATK", str(stats.get("atk", 4))],
		["DEF", str(stats.get("def", 2))],
		["EXP", str(stats.get("exp", 0))],
		["GOLD", str(_hero_gold)],
	]
	for i in range(rows_data.size()):
		var kl := _make_label(rows_data[i][0], 13, Color(1.0, 0.85, 0.3))
		kl.position = Vector2(16, 12 + i * 19)
		_status_panel.add_child(kl)
		var vl := _make_label(rows_data[i][1], 13)
		vl.position = Vector2(110, 12 + i * 19)
		_status_panel.add_child(vl)

func _build_item_panel(canvas: CanvasLayer) -> void:
	_item_panel = Panel.new()
	_item_panel.size = Vector2(280, 220)
	_item_panel.position = Vector2((VW - 280) / 2, (VH - 220) / 2)
	_item_panel.add_theme_stylebox_override("panel", _make_box_style(Color(0.04, 0.06, 0.15, 0.97), Color(0.6, 0.8, 1.0)))
	_item_panel.visible = false
	canvas.add_child(_item_panel)
	_refresh_item_panel()

func _refresh_item_panel() -> void:
	_clear_panel(_item_panel)
	_item_labels = []

	var title := _make_label("ITEMS", 14, Color(1.0, 0.85, 0.3))
	title.position = Vector2(16, 10)
	_item_panel.add_child(title)

	if _inventory.is_empty():
		var empty := _make_label("Nothing.", 13, Color(0.7, 0.7, 0.7))
		empty.position = Vector2(16, 36)
		_item_panel.add_child(empty)
	else:
		for i in range(_inventory.size()):
			var lbl := _make_label(str(_inventory[i].get("name", "Item")), 13)
			lbl.position = Vector2(28, 36 + i * 20)
			_item_panel.add_child(lbl)
			_item_labels.append(lbl)

	var desc := _make_label("", 12, Color(0.7, 0.9, 1.0))
	desc.name = "ItemDesc"
	desc.position = Vector2(16, 180)
	desc.size = Vector2(248, 36)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_item_panel.add_child(desc)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.keycode == KEY_X:
		if event.pressed and event.ctrl_pressed:
			_debug_active = true
			_debug_overlay.visible = true
			get_viewport().set_input_as_handled()
			return
		elif not event.pressed and _debug_active:
			_debug_active = false
			_debug_overlay.visible = false
			for lbl in _debug_labels:
				(lbl as Label).visible = false
			get_viewport().set_input_as_handled()
			return

	if _battle_active:
		return
	if _dialog_active:
		_handle_dialog_input(event)
		return
	if _status_open:
		if event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_status_panel.visible = false
			_status_open = false
		return
	if _item_open:
		_handle_item_input(event)
		return
	if _menu_open:
		_handle_menu_input(event)
		return
	if event.is_action_pressed("cmd_menu"):
		_open_menu()
		get_viewport().set_input_as_handled()

func _handle_dialog_input(event: InputEvent) -> void:
	if not (event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu")):
		return
	if _is_typing:
		_char_index = _dialog_pages[_current_page].length()
		_is_typing = false
		_dialog_label.text = _dialog_pages[_current_page]
		_prompt_label.visible = true
		return
	_current_page += 1
	if _current_page >= _dialog_pages.size():
		_dialog_panel.visible = false
		_dialog_active = false
		if _dialog_on_done.is_valid():
			_dialog_on_done.call()
	else:
		_start_page(_current_page)

func _handle_menu_input(event: InputEvent) -> void:
	if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up"):
		_menu_index = (_menu_index - MENU_COLS + MENU_ITEMS.size()) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
		_menu_index = (_menu_index + MENU_COLS) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_left") or event.is_action_pressed("ui_left"):
		_menu_index = (_menu_index - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("move_right") or event.is_action_pressed("ui_right"):
		_menu_index = (_menu_index + 1) % MENU_ITEMS.size()
		_refresh_menu()
	elif event.is_action_pressed("ui_accept"):
		_menu_panel.visible = false
		_menu_open = false
		_execute_menu_item(MENU_ITEMS[_menu_index])
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
		_menu_panel.visible = false
		_menu_open = false

func _handle_item_input(event: InputEvent) -> void:
	if _inventory.is_empty():
		if event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
			_item_panel.visible = false
			_item_open = false
		return
	if event.is_action_pressed("move_up"):
		_item_index = maxi(_item_index - 1, 0)
		_refresh_item_cursor()
	elif event.is_action_pressed("move_down"):
		_item_index = mini(_item_index + 1, _inventory.size() - 1)
		_refresh_item_cursor()
	elif event.is_action_pressed("ui_accept"):
		_use_item(_item_index)
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("cmd_menu"):
		_item_panel.visible = false
		_item_open = false

func _open_menu() -> void:
	_menu_index = 0
	_menu_open = true
	_refresh_menu()
	_menu_panel.visible = true

func _refresh_menu() -> void:
	for i in range(_menu_labels.size()):
		var color := Color(1.0, 0.85, 0.3) if i == _menu_index else Color.WHITE
		(_menu_labels[i] as Label).add_theme_color_override("font_color", color)

func _refresh_item_cursor() -> void:
	for i in range(_item_labels.size()):
		var color := Color(1.0, 0.85, 0.3) if i == _item_index else Color.WHITE
		(_item_labels[i] as Label).add_theme_color_override("font_color", color)
	var desc_node := _item_panel.get_node_or_null("ItemDesc") as Label
	if desc_node and _item_index < _inventory.size():
		desc_node.text = str(_inventory[_item_index].get("desc", ""))

func _execute_menu_item(cmd: String) -> void:
	match cmd:
		"TALK":
			_show_dialog("", ["There is no one there."])
		"DOOR":
			_show_dialog("", ["There is no door\nin that direction."])
		"STATUS":
			_refresh_status_panel()
			_status_panel.visible = true
			_status_open = true
		"TAKE":
			_show_dialog("", ["There is nothing\nto take here."])
		"STAIRS":
			match _hero_tile:
				STAFF_RAIN_CAVE:
					_save_state(Vector2i(5, 10), "down", "world_map")
					get_tree().change_scene_to_file.call_deferred("res://scenes/StaffOfRainCave.tscn")
				RAINBOW_CAVE:
					_save_state(Vector2i(5, 10), "down", "world_map")
					get_tree().change_scene_to_file.call_deferred("res://scenes/RainbowDropCave.tscn")
				_:
					_show_dialog("", ["There are no stairs here."])
		"SPELL":
			_cmd_spell()
		"SEARCH":
			_cmd_search()
		"ITEM":
			_refresh_item_panel()
			_item_index = 0
			_item_panel.visible = true
			_item_open = true
			_refresh_item_cursor()

func _cmd_search() -> void:
	if _hero_tile == ERDRICK_TOKEN and not _has_inventory_item("Erdrick's Token"):
		_inventory.append({
			"name": "Erdrick's Token",
			"id": "erdricks_token",
			"type": "quest",
			"desc": "A small token buried in the southern swamp."
		})
		var gs_t := get_node_or_null("/root/GameState")
		if gs_t:
			gs_t.inventory = _inventory.duplicate(true)
		_show_dialog("", ["Thou hast found\nErdrick's Token!"])
	else:
		_show_dialog("", ["Thou dost not find\nanything of interest."])

func _has_inventory_item(item_name: String) -> bool:
	for item in _inventory:
		if str(item.get("name", "")) == item_name:
			return true
	return false

func _use_item(idx: int) -> void:
	if idx >= _inventory.size():
		return
	var item: Dictionary = _inventory[idx]
	var item_name := str(item.get("name", ""))
	match item_name:
		"Rainbow Drop":
			_item_panel.visible = false
			_item_open = false
			if _bridge_built:
				_show_dialog("", ["The rainbow bridge\nalready spans\nthe waters."])
				return
			# The bridge tile itself is open water: the drop is used from either shore.
			var on_shore := _hero_tile == BRIDGE_TILE + Vector2i(-1, 0) or _hero_tile == BRIDGE_TILE + Vector2i(1, 0)
			if _hero_tile != BRIDGE_TILE and not on_shore:
				_show_dialog("", ["This is not the\nplace to use it."])
				return
			_inventory.remove_at(idx)
			_bridge_rect.visible = true
			_bridge_animating = true
			_bridge_anim_t = 0.0
		"Herb", "Medical Herb":
			var gs_h := get_node_or_null("/root/GameState")
			if gs_h:
				var hp := int(gs_h.hero_stats.get("hp", 0))
				var hp_max := int(gs_h.hero_stats.get("hp_max", 1))
				if hp >= hp_max:
					_show_dialog("", ["Thy HP is already\nfull."])
					return
				var amt := 23 + (randi() % 8)
				gs_h.hero_stats["hp"] = mini(hp_max, hp + amt)
				_inventory.remove_at(idx)
				gs_h.inventory = _inventory.duplicate(true)
				_item_panel.visible = false
				_item_open = false
				_show_dialog("", ["Thou hast eaten the\nMedical Herb.\nHP restored by %d." % mini(amt, hp_max - hp)])
		"Wings":
			# NES: same as RETURN — fly back to the Tantegel gate; the wings are used up.
			_inventory.remove_at(idx)
			var gs_w := get_node_or_null("/root/GameState")
			if gs_w:
				gs_w.inventory = _inventory.duplicate(true)
			_item_panel.visible = false
			_item_open = false
			_hero_tile = TANTEGEL_TILE + Vector2i(0, 1)
			_cam_world = _tile_center(_hero_tile)
			_cam_from = _cam_world
			_cam_to = _cam_world
			_draw_frame()
			_show_dialog("", ["Thou hast spread the\nWings and soared back\nto Tantegel Castle!"])
		_:
			_show_dialog("", [str(item.get("desc", "Thou usest the item."))])

## Field magic on the overworld: HEALMORE / HEAL when wounded.
func _cmd_spell() -> void:
	var gs := get_node_or_null("/root/GameState")
	var known: Array = gs.spells if gs and gs.spells is Array else []
	if known.is_empty():
		_show_dialog("", ["Thou hast no spells\nto cast."])
		return
	var mp := int(gs.hero_stats.get("mp", 0))
	var hp := int(gs.hero_stats.get("hp", 0))
	var hp_max := int(gs.hero_stats.get("hp_max", 1))
	var missing := hp_max - hp
	if missing <= 0:
		_show_dialog("", ["There is no need to\ncast a spell here."])
		return
	if gs.has_spell("healmore") and mp >= 10 and missing > 30:
		gs.hero_stats["mp"] = mp - 10
		gs.hero_stats["hp"] = hp_max
		_show_dialog("", ["Thou hast cast HEALMORE!\nThy wounds are fully healed."])
		return
	if gs.has_spell("heal") and mp >= 4:
		var amt := 10 + (randi() % 8)
		gs.hero_stats["mp"] = mp - 4
		gs.hero_stats["hp"] = mini(hp_max, hp + amt)
		_show_dialog("", ["Thou hast cast HEAL!\nHP restored by %d." % mini(amt, missing)])
		return
	_show_dialog("", ["Thou hast not enough\nMagic Points!"])

func _show_dialog(speaker: String, pages: Array[String], on_done: Callable = Callable()) -> void:
	_dialog_pages = pages
	_dialog_on_done = on_done
	_current_page = 0
	_dialog_active = true
	_speaker_label.text = speaker
	_dialog_panel.visible = true
	_start_page(0)

func _start_page(_idx: int) -> void:
	_dialog_label.text = ""
	_char_index = 0
	_is_typing = true
	_prompt_label.visible = false
	_do_typing()

func _do_typing() -> void:
	if not _is_typing or not _dialog_active:
		return
	var full := _dialog_pages[_current_page]
	if _char_index < full.length():
		_char_index += 1
		_dialog_label.text = full.substr(0, _char_index)
		var timer := get_tree().create_timer(TYPING_SPEED)
		timer.connect("timeout", _do_typing)
	else:
		_is_typing = false
		_prompt_label.visible = true

func _save_state(spawn: Vector2i, facing: String, come_from: String) -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	gs.inventory = _inventory.duplicate(true)
	gs.gold = _hero_gold
	gs.opened_chests = _opened_chests.duplicate(true)
	gs.bridge_built = _bridge_built
	gs.spawn_tile = spawn
	gs.spawn_facing = facing
	gs.come_from = come_from
