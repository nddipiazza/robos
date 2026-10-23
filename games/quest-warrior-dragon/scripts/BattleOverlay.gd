## BattleOverlay — Quest: Warrior Dragon 1-on-1 combat overlay.
## Spawned over the WorldMap when a random encounter triggers.
## Emits battle_ended("won"|"fled"|"lost") when combat concludes.
extends CanvasLayer

signal battle_ended(result: String)

const VW          : int   = 512
const VH          : int   = 480
const MSG_DELAY   : float = 0.9

# 2×2 command grid matching original DW1 layout:
#   FIGHT  SPELL
#   ITEM   RUN
const MENU_ITEMS  : Array = ["FIGHT", "SPELL", "ITEM", "RUN"]
# cursor layout: 0=FIGHT 1=SPELL 2=ITEM 3=RUN
# col = cursor & 1,  row = cursor >> 1

enum Phase { INTRO, PLAYER_MENU, SPELL_SELECT, PLAYER_ACT, ENEMY_ACT, VICTORY, DEFEAT, FLED }
var _phase     : Phase  = Phase.INTRO
var _cursor    : int    = 0
var _msg_q     : Array  = []
var _msg_t     : float  = 0.0
var _anim_lock : bool   = false
var _skip_requested : bool = false   # set by Enter/Select to skip current delay

var _mon_key          : String = ""
var _mon_name         : String = ""
var _mon_hp           : int    = 0
var _mon_str          : int    = 0
var _mon_agl          : int    = 0
var _mon_def          : int    = 0
var _mon_dodge        : int    = 1
var _mon_run_group    : int    = 1       # flee difficulty group (combat_formulas.json "running")
var _mon_is_boss      : bool   = false
var _mon_xp           : int    = 0
var _mon_gp           : int    = 0
var _mon_asleep       : bool   = false   # enemy sleep state
var _mon_stopspelled  : bool   = false   # enemy can't cast spells
var _mon_resist_sleep : int    = 0       # X/16 chance to shrug off SLEEP
var _mon_resist_stop  : int    = 0       # X/16 chance to shrug off STOPSPELL
var _mon_resist_hurt  : int    = 0       # X/16 chance to shrug off HURT / HURTMORE
var _mon_pattern      : Array  = []      # action pattern from monsters.json
var _last_enemy_action: String = ""

var _hero_hp         : int    = 15
var _hero_hp_max_val : int    = 15
var _hero_mp         : int    = 0
var _hero_mp_max     : int    = 0
var _hero_atk        : int    = 4
var _hero_def        : int    = 2
var _hero_agi        : int    = 4
var _hero_str        : int    = 4
var _hero_ailment    : String = ""
var _hero_stopspelled : bool  = false   # hero's spells blocked by enemy
var _hero_armor       : String = ""     # e.g. "Erdrick's Armor"

# Spell system
var _known_spells  : Array = []   # [{ id, name, mp_cost, target }, ...]
var _spell_cursor  : int   = 0
var _spell_panel   : Panel
var _spell_lbls    : Array = []

var _bg           : ColorRect
var _enemy_sprite : TextureRect
var _enemy_lbl    : Label
var _msg_box      : Panel
var _msg_lbl      : Label
var _menu_box     : Panel
var _menu_lbls    : Array = []
var _music        : AudioStreamPlayer
var _sfx          : AudioStreamPlayer

# Status bar nodes (top of screen)
var _status_panel   : Panel
var _spell_overlay  : TextureRect
var _hp_lbl         : Label
var _mp_lbl         : Label
var _gold_lbl: Label
var _exp_lbl: Label
var _ailment_lbl    : Label


func _ready() -> void:
	layer = 20
	if not InputMap.has_action("cmd_menu"):
		InputMap.add_action("cmd_menu")
		var ev := InputEventKey.new()
		ev.keycode = KEY_B
		InputMap.action_add_event("cmd_menu", ev)
	_build_ui()
	_start_music()


# ── Audio ──────────────────────────────────────────────────────────────────
func _start_music() -> void:
	_music = AudioStreamPlayer.new()
	var bgm := load("res://assets/music/mp3/monster_battle.mp3") as AudioStream
	if bgm:
		_music.stream = bgm
		if _music.stream is AudioStreamMP3:
			(_music.stream as AudioStreamMP3).loop = true
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()

	_sfx = AudioStreamPlayer.new()
	_sfx.volume_db = -3.0
	add_child(_sfx)


func _stop_music() -> void:
	if _music and _music.playing:
		_music.stop()


func _play_sfx(name: String) -> void:
	var path : String = "res://assets/music/mp3/%s.mp3" % name
	var stream := load(path) as AudioStream
	if stream:
		_sfx.stream = stream
		_sfx.play()


# ── Battle start ───────────────────────────────────────────────────────────
func start_battle(monster_key: String, monster_data: Dictionary) -> void:
	_mon_key          = monster_key
	_mon_name         = monster_data.get("name", monster_key)
	_mon_hp           = _roll(int(monster_data.get("hp_min", 5)), int(monster_data.get("hp_max", 5)))
	_mon_str          = int(monster_data.get("strength", 10))
	_mon_agl          = int(monster_data.get("agility", 5))
	_mon_def          = int(monster_data.get("agility", 5))
	_mon_dodge        = int(monster_data.get("dodge", 1))
	_mon_run_group    = clampi(int(monster_data.get("run_group", 1)), 1, 4)
	_mon_is_boss      = bool(monster_data.get("is_boss", false)) or monster_key.begins_with("dragonlord") or monster_key == "golem"
	_mon_xp           = int(monster_data.get("xp", 1))
	_mon_gp           = _roll(int(monster_data.get("gp_min", 1)), int(monster_data.get("gp_max", 5)))
	_mon_asleep       = false
	_mon_stopspelled  = false
	_mon_resist_sleep = int(monster_data.get("resist_sleep", 0))
	_mon_resist_stop  = int(monster_data.get("resist_stopspell", 0))
	_mon_resist_hurt  = int(monster_data.get("resist_hurt", 0))
	_mon_pattern      = monster_data.get("pattern", [])
	_hero_stopspelled = false
	_hero_ailment     = ""

	var gs : Node = get_node_or_null("/root/GameState")
	if gs:
		_hero_hp          = int(gs.hero_stats.get("hp",     15))
		_hero_hp_max_val  = int(gs.hero_stats.get("hp_max", 15))
		_hero_mp          = int(gs.hero_stats.get("mp",      0))
		_hero_mp_max      = int(gs.hero_stats.get("mp_max",  0))
		_hero_atk         = int(gs.hero_stats.get("atk",     4))
		_hero_def         = int(gs.hero_stats.get("def",     2))
		_hero_agi         = int(gs.hero_stats.get("agl",     4))
		_hero_str         = int(gs.hero_stats.get("str",     4))
		_known_spells     = _load_known_spells(gs.spells)
		_hero_armor       = gs.armor

	_enemy_lbl.text    = _mon_name.to_upper()
	_enemy_lbl.modulate = Color.WHITE   # reset alpha in case previous battle faded it
	_phase            = Phase.INTRO
	_cursor           = 0
	_msg_box.visible  = true
	_menu_box.visible = false
	_enemy_sprite.modulate = Color.WHITE  # reset in case previous battle faded it
	_load_enemy_sprite(monster_key)
	_update_status_bar()
	_push_msg("A %s draws near!" % _mon_name)
	_push_msg("Command?")


# ── Main loop ──────────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	if not _anim_lock:
		_tick_messages(delta)


func _unhandled_input(event: InputEvent) -> void:
	if _anim_lock:
		# Allow Enter/Select to skip the current delay/sound
		if event.is_action_pressed("ui_accept") or event.is_action_pressed("cmd_menu"):
			_skip_requested = true
			if _sfx.playing:
				_sfx.stop()
			get_viewport().set_input_as_handled()
		return
	if _phase == Phase.INTRO:
		if event.is_action_pressed("ui_accept") or event.is_action_pressed("cmd_menu"):
			get_viewport().set_input_as_handled()
			if _msg_q.is_empty():
				_phase = Phase.PLAYER_MENU
				_show_menu()
			else:
				_msg_t = 0.0
				_msg_lbl.text = _msg_q.pop_front()
		return
	if _phase == Phase.PLAYER_MENU and _msg_q.is_empty():
		if event.is_action_pressed("move_up") or event.is_action_pressed("move_down") or event.is_action_pressed("ui_up") or event.is_action_pressed("ui_down"):
			_cursor = _cursor ^ 2   # toggle row: 0↔2, 1↔3
			_update_menu_cursor()
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("move_left") or event.is_action_pressed("move_right") or event.is_action_pressed("ui_left") or event.is_action_pressed("ui_right"):
			_cursor = _cursor ^ 1   # toggle col: 0↔1, 2↔3
			_update_menu_cursor()
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("ui_accept") or event.is_action_pressed("cmd_menu"):
			get_viewport().set_input_as_handled()
			_execute_command()
	elif _phase == Phase.SPELL_SELECT:
		if event.is_action_pressed("move_up") or event.is_action_pressed("ui_up"):
			_spell_cursor = max(0, _spell_cursor - 1)
			_update_spell_cursor()
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("move_down") or event.is_action_pressed("ui_down"):
			_spell_cursor = min(_known_spells.size() - 1, _spell_cursor + 1)
			_update_spell_cursor()
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("ui_accept") or event.is_action_pressed("cmd_menu"):
			get_viewport().set_input_as_handled()
			_cast_spell(_known_spells[_spell_cursor])
		elif event.is_action_pressed("ui_cancel"):
			get_viewport().set_input_as_handled()
			_close_spell_menu()
	elif _phase == Phase.VICTORY or _phase == Phase.DEFEAT or _phase == Phase.FLED:
		if event.is_action_pressed("ui_accept") or event.is_action_pressed("cmd_menu"):
			get_viewport().set_input_as_handled()
			_finish()


# ── Message helpers ────────────────────────────────────────────────────────
# Queue-based: used only for INTRO "draws near!" sequence
func _push_msg(text: String) -> void:
	_msg_q.append(text)

# Immediate: sets text right now — used during combat turns
func _set_msg(text: String) -> void:
	_msg_t = 0.0
	_msg_lbl.text = text


func _tick_messages(delta: float) -> void:
	if _phase != Phase.INTRO:
		return
	if _msg_q.is_empty():
		_phase = Phase.PLAYER_MENU
		_show_menu()
		return
	_msg_t += delta
	if _msg_t >= MSG_DELAY:
		_msg_t = 0.0
		_msg_lbl.text = _msg_q.pop_front()


# ── Commands ───────────────────────────────────────────────────────────────
func _execute_command() -> void:
	_menu_box.visible = false
	match _cursor:
		0: _phase = Phase.PLAYER_ACT; _do_fight()
		1: _open_spell_menu()
		2: _phase = Phase.PLAYER_ACT; _do_item()
		3: _phase = Phase.PLAYER_ACT; _do_run()


func _open_spell_menu() -> void:
	if _hero_stopspelled:
		_phase = Phase.PLAYER_ACT
		_set_msg("%s's spells are blocked!" % _hero_name())
		await _wait_delay(1.0)
		_phase = Phase.PLAYER_MENU
		_set_msg("Command?")
		_show_menu()
		return
	if _known_spells.is_empty():
		_phase = Phase.PLAYER_ACT
		_set_msg("%s knows no spells!" % _hero_name())
		await _wait_delay(1.0)
		_phase = Phase.PLAYER_MENU
		_set_msg("Command?")
		_show_menu()
		return
	_phase = Phase.SPELL_SELECT
	_spell_cursor = 0
	_rebuild_spell_panel()
	_spell_panel.visible = true
	_update_spell_cursor()


func _close_spell_menu() -> void:
	_spell_panel.visible = false
	_phase = Phase.PLAYER_MENU
	_set_msg("Command?")
	_show_menu()


func _update_spell_cursor() -> void:
	var rows: Array = []
	for sp in _known_spells:
		var cost := int(sp.get("mp_cost", 0))
		rows.append({"text": str(sp.get("name", "?")), "value": "%dMP" % cost, "disabled": _hero_mp < cost})
	# Right-hand column under the status bar, clear of the monster and its name.
	MenuKit.render_list(_spell_panel, {"title": "SPELL", "rows": rows, "index": _spell_cursor,
		"width": 170, "max_rows": 9})
	_spell_panel.position = Vector2(VW - _spell_panel.size.x - 8, 44)


func _cast_spell(sp: Dictionary) -> void:
	_spell_panel.visible = false
	var cost : int = int(sp.get("mp_cost", 0))
	if _hero_mp < cost:
		_phase = Phase.PLAYER_ACT
		_set_msg("Not enough MP!")
		await _wait_delay(1.0)
		_open_spell_menu()
		return
	_phase = Phase.PLAYER_ACT
	_hero_mp -= cost
	var gs : Node = get_node_or_null("/root/GameState")
	if gs: gs.hero_stats["mp"] = _hero_mp
	_update_status_bar()

	var sid : String = sp.get("id", "")
	match sid:
		"heal", "healmore":
			var lo  : int = int(sp.get("hp_restore_min", 10))
			var hi  : int = int(sp.get("hp_restore_max", 17))
			var amt : int = randi_range(lo, hi)
			_hero_hp = min(_hero_hp + amt, _hero_hp_max())
			if gs: gs.hero_stats["hp"] = _hero_hp
			_set_msg("%s casts %s!" % [_hero_name(), sp.get("name","HEAL")])
			await _show_spell_anim(sid if sid == "heal" else "heal")
			_update_status_bar()
			_set_msg("%s casts %s! HP restored by %d." % [_hero_name(), sp.get("name","HEAL"), amt])
			await _wait_delay(1.1)
			_after_player_act()

		"hurt", "hurtmore":
			var lo  : int = int(sp.get("damage_min", 5))
			var hi  : int = int(sp.get("damage_max", 12))
			var dmg : int = randi_range(lo, hi)
			_set_msg("%s casts %s!" % [_hero_name(), sp.get("name","HURT")])
			await _show_spell_anim("hurt")
			if randi() % 16 < _mon_resist_hurt:
				_set_msg("But %s resisted!" % _mon_name)
				await _wait_delay(1.1)
			else:
				_flash_enemy()
				_play_sfx("receive_damage")
				_mon_hp = max(0, _mon_hp - dmg)
				_set_msg("The %s takes %d damage!" % [_mon_name, dmg])
				await _wait_sfx()
			_after_player_act()

		"sleep":
			_set_msg("%s casts SLEEP!" % _hero_name())
			await _show_spell_anim("sleep")
			if randi() % 16 < _mon_resist_sleep:
				_set_msg("But %s resisted!" % _mon_name)
			else:
				_mon_asleep = true
				_set_msg("The %s falls asleep!" % _mon_name)
			await _wait_delay(1.1)
			_after_player_act()

		"stopspell":
			_set_msg("%s casts STOPSPELL!" % _hero_name())
			await _show_spell_anim("stopspell")
			if randi() % 16 < _mon_resist_stop:
				_set_msg("But %s resisted!" % _mon_name)
			else:
				_mon_stopspelled = true
				_set_msg("The %s can no longer cast spells!" % _mon_name)
			await _wait_delay(1.1)
			_after_player_act()

		_:
			# Non-combat spells
			_set_msg("Can't use %s in battle!" % sp.get("name","that"))
			await _wait_delay(1.0)
			_open_spell_menu()



func _do_fight() -> void:
	_anim_lock = true

	# DW1 dodge check: randi() % 64 < monster.dodge
	var missed : bool = randi() % 64 < _mon_dodge
	# Excellent move: 1/32, ignores defence; never against Golem / Dragonlord.
	var excellent : bool = not missed and not _mon_is_boss and randi() % 32 == 0
	var dmg    : int  = 0
	if excellent:
		dmg = randi_range(maxi(1, _hero_atk / 2), _hero_atk)
	elif not missed:
		dmg = _calc_dmg(_hero_atk, _mon_def)

	# 1 — hero commits to strike: play attack sound immediately
	_set_msg("%s attacks %s!" % [_hero_name(), _mon_name])
	_play_sfx("attack")
	await _wait_sfx()
	if excellent:
		_set_msg("Excellent move!")
		await _wait_delay(0.6)

	# 2 — resolve hit/miss
	if dmg <= 0 or missed:
		_play_sfx("missed" if randi() % 2 == 0 else "missed2")
		_set_msg("...but the attack missed!")
	else:
		_play_sfx("receive_damage")
		_set_msg("The %s takes %d damage!" % [_mon_name, dmg])
		_flash_enemy()
		_mon_hp = max(0, _mon_hp - dmg)

	# 3 — wait for hit/miss sound to finish, then hand off
	await _wait_sfx()
	_anim_lock = false
	_after_player_act()


func _after_player_act() -> void:
	if _mon_hp <= 0:
		if _mon_key == "dragonlord_form1":
			await _dragonlord_transform()
			return
		_phase = Phase.VICTORY
		_anim_lock = true             # keep A from ending the battle before rewards are granted
		_stop_music()
		_play_sfx("victory")          # start victory music immediately as fade begins
		await _fade_enemy()           # fade sprite over 1 second in background
		if not is_inside_tree():
			return
		var gs : Node = get_node_or_null("/root/GameState")
		var level_ups : Array = []
		if gs:
			gs.hero_stats["hp"] = _hero_hp
			gs.hero_stats["mp"] = _hero_mp
			if gs.has_method("add_exp"):
				level_ups = gs.add_exp(_mon_xp)
			else:
				gs.hero_stats["exp"] = int(gs.hero_stats.get("exp", 0)) + _mon_xp
			gs.gold              = int(gs.gold) + _mon_gp
			if _mon_key == "dragonlord_form2" and "dragonlord_defeated" in gs:
				gs.dragonlord_defeated = true
		var msg := "Thou hast done well!\n%s earns %d XP and %d GP." % [_hero_name(), _mon_xp, _mon_gp]
		if _mon_key == "dragonlord_form2":
			msg = "Thou hast done well in\ndefeating the Dragonlord.\nFrom the hand of the Dragonlord,\n%s obtains the Ball of Light." % _hero_name()
		for lu in level_ups:
			if lu is Dictionary:
				msg += "\nCourage and wit have served thee well.\nThou hast been promoted to level %d!" % int(lu.get("level", 0))
				var sp := str(lu.get("spell", ""))
				if sp != "":
					msg += "\nThou hast learned %s!" % sp.to_upper()
				_hero_hp_max_val = int(gs.hero_stats.get("hp_max", _hero_hp_max_val))
				_hero_hp = int(gs.hero_stats.get("hp", _hero_hp))
				_hero_mp = int(gs.hero_stats.get("mp", _hero_mp))
				_hero_mp_max = int(gs.hero_stats.get("mp_max", _hero_mp_max))
		_update_status_bar()
		_set_msg(msg + "\n\nPress A to continue.")
		_menu_box.visible = false
		_anim_lock = false
	else:
		_anim_lock = false
		_phase = Phase.ENEMY_ACT
		_do_enemy_turn()


# Dragonlord form 1 → form 2 transformation sequence
func _dragonlord_transform() -> void:
	_anim_lock = true
	_phase     = Phase.VICTORY   # lock out input during transition
	_menu_box.visible = false
	_stop_music()

	# 1 — form1 fades out with fire flicker (orange modulate pulses)
	_set_msg("The Dragonlord staggers...")
	var flicker := create_tween()
	flicker.set_loops(4)
	flicker.tween_property(_enemy_sprite, "modulate", Color(2.0, 0.4, 0.0, 1.0), 0.08)
	flicker.tween_property(_enemy_sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.08)
	await _wait_delay(0.7)
	flicker.kill()

	# 2 — sprite fades out
	var fade := create_tween()
	fade.set_parallel(true)
	fade.tween_property(_enemy_sprite, "modulate:a", 0.0, 0.4)
	fade.tween_property(_enemy_lbl,    "modulate:a", 0.0, 0.4)
	await _wait_delay(0.5)

	_set_msg("Foolish hero...\nYou cannot defeat me that easily!")
	await _wait_delay(2.0)

	# 3 — full-screen fire flash: breathe_fire plays, red/orange flashes fill screen
	_play_sfx("breathe_fire")
	var flash_layer := CanvasLayer.new()
	flash_layer.layer = 25
	add_child(flash_layer)
	var flash_rect := ColorRect.new()
	flash_rect.size  = Vector2(VW, VH)
	flash_rect.color = Color(0, 0, 0, 0)
	flash_layer.add_child(flash_rect)

	var FIRE_COLORS : Array = [
		Color(1.0, 0.3, 0.0, 0.85),
		Color(1.0, 0.6, 0.0, 0.7),
		Color(1.0, 0.1, 0.0, 0.9),
		Color(1.0, 0.5, 0.0, 0.75),
		Color(1.0, 0.0, 0.0, 0.95),
		Color(0.2, 0.0, 0.0, 1.0),
		Color(0.0, 0.0, 0.0, 1.0),
	]
	for col in FIRE_COLORS:
		var tw := create_tween()
		tw.tween_property(flash_rect, "color", col, 0.12)
		await _wait_delay(0.13)

	# 4 — hold black, dramatic text
	_set_msg("BEHOLD MY TRUE FORM!")
	await _wait_delay(1.5)

	# 5 — load form2 data and restart battle
	var form2_data: Dictionary = DataManager.get_monster("dragonlord_form2")
	if form2_data.is_empty():
		var f2 := FileAccess.open("res://data/v1/monsters.json", FileAccess.READ)
		if f2:
			var parsed: Variant = JSON.parse_string(f2.get_as_text())
			var store := MonstersDataStoreV1.from_value(parsed)
			if store:
				for m in store.value:
					if m.key == "dragonlord_form2":
						form2_data = m.to_value()
						break

	# Fade flash out
	var fade_out := create_tween()
	fade_out.tween_property(flash_rect, "color", Color(0, 0, 0, 0), 0.5)
	await _wait_delay(0.6)
	flash_layer.queue_free()

	# Reset enemy label alpha
	_enemy_lbl.modulate    = Color.WHITE
	_enemy_sprite.modulate = Color.WHITE

	if form2_data.is_empty():
		# Fallback: normal victory if data missing
		_set_msg("Thou hast done well!\n\nPress A to continue.")
		_anim_lock = false
		return

	# Start Dragonlord music, unlock, restart battle with form2
	if _music:
		_music.stop()
	_music = AudioStreamPlayer.new()
	var bgm := load("res://assets/music/mp3/dragonlord.mp3") as AudioStream
	if bgm:
		_music.stream = bgm
		if _music.stream is AudioStreamMP3:
			(_music.stream as AudioStreamMP3).loop = true
		_music.volume_db = -6.0
		add_child(_music)
		_music.play()

	await _wait_delay(0.3)
	_anim_lock = false
	start_battle("dragonlord_form2", form2_data)


func _do_enemy_turn() -> void:
	_anim_lock = true

	# Check if enemy is asleep — 1/3 chance to wake each turn
	if _mon_asleep:
		var wake : bool = randi() % 3 == 0
		if wake:
			_mon_asleep = false
			_set_msg("The %s wakes up!" % _mon_name)
		else:
			_set_msg("The %s is fast asleep." % _mon_name)
		await _wait_delay(1.0)
		_anim_lock = false
		_after_enemy_act()
		return

	# Outclassed monsters (hero strength >= 2x theirs) run 25% of turns.
	if not _mon_is_boss and _hero_str >= 2 * _mon_str and randi() % 4 == 0:
		_set_msg("The %s is running away." % _mon_name)
		_play_sfx("stairs_down")
		await _wait_sfx()
		_phase = Phase.FLED
		_anim_lock = false
		_set_msg("The %s ran away!\n\nPress A to continue." % _mon_name)
		_menu_box.visible = false
		return

	# ── Select action from pattern ──────────────────────────────────────
	var action : String = "attack"
	for entry in _mon_pattern:
		var a    : String = entry.get("action", "attack")
		var cond : String = entry.get("condition", "")
		# Check condition
		var cond_ok : bool = true
		if cond == "hp_below_quarter":
			cond_ok = float(_mon_hp) / float(max(_mon_hp + 1, 1)) < 0.25
		elif cond == "hero_not_asleep":
			cond_ok = _hero_ailment != "asleep"
		elif cond == "hero_spell_not_blocked":
			cond_ok = not _hero_stopspelled
		if not cond_ok:
			continue
		var chance : Variant = entry.get("chance", 1.0)
		if typeof(chance) == TYPE_STRING and (chance as String) == "otherwise":
			action = a
			break
		if randf() < float(chance):
			action = a
			break

	# ── Execute chosen action ───────────────────────────────────────────
	_last_enemy_action = action
	match action:
		"fire_weak":
			var dmg : int = randi_range(10, 14) if _wearing_erdricks_armor() else randi_range(16, 23)
			_set_msg("The %s breathes fire!" % _mon_name)
			_play_sfx("breathe_fire")
			await _wait_sfx()
			_apply_hero_damage(dmg)
			_set_msg("%s takes %d damage from fire!" % [_hero_name(), dmg])
			await _wait_sfx()

		"fire_strong":
			var dmg : int = randi_range(42, 48) if _wearing_erdricks_armor() else randi_range(65, 72)
			_set_msg("The %s breathes fire!" % _mon_name)
			_play_sfx("breathe_fire")
			await _wait_sfx()
			_apply_hero_damage(dmg)
			_set_msg("%s takes %d damage from fire!" % [_hero_name(), dmg])
			await _wait_sfx()

		"spell_hurt":
			if _mon_stopspelled:
				_set_msg("The %s tries to cast HURT!\nBut the spell is blocked!" % _mon_name)
				await _wait_delay(1.0)
			else:
				var dmg : int = randi_range(2, 6) if _wearing_magic_armor() else randi_range(3, 10)
				_set_msg("The %s casts HURT!" % _mon_name)
				_play_sfx("cast_spell")
				await _wait_sfx()
				_apply_hero_damage(dmg)
				_set_msg("%s takes %d damage!" % [_hero_name(), dmg])
				await _wait_sfx()

		"spell_hurtmore":
			if _mon_stopspelled:
				_set_msg("The %s tries to cast HURTMORE!\nBut the spell is blocked!" % _mon_name)
				await _wait_delay(1.0)
			else:
				var dmg : int = randi_range(20, 30) if _wearing_magic_armor() else randi_range(30, 45)
				_set_msg("The %s casts HURTMORE!" % _mon_name)
				_play_sfx("cast_spell")
				await _wait_sfx()
				_apply_hero_damage(dmg)
				_set_msg("%s takes %d damage!" % [_hero_name(), dmg])
				await _wait_sfx()

		"spell_heal":
			if _mon_stopspelled:
				_set_msg("The %s tries to cast HEAL!\nBut the spell is blocked!" % _mon_name)
				await _wait_delay(1.0)
			else:
				var heal : int = randi_range(10, 17)
				_set_msg("The %s casts HEAL!" % _mon_name)
				_play_sfx("cast_spell")
				await _wait_sfx()
				_mon_hp += heal
				_set_msg("The %s recovers %d HP!" % [_mon_name, heal])
				await _wait_delay(1.0)

		"spell_healmore":
			if _mon_stopspelled:
				_set_msg("The %s tries to cast HEALMORE!\nBut the spell is blocked!" % _mon_name)
				await _wait_delay(1.0)
			else:
				var heal : int = randi_range(85, 100)
				_set_msg("The %s casts HEALMORE!" % _mon_name)
				_play_sfx("cast_spell")
				await _wait_sfx()
				_mon_hp += heal
				_set_msg("The %s recovers %d HP!" % [_mon_name, heal])
				await _wait_delay(1.0)

		"spell_sleep":
			if _mon_stopspelled or _hero_ailment == "asleep":
				_set_msg("The %s tries to cast SLEEP!\nBut the spell fails!" % _mon_name)
				await _wait_delay(1.0)
			else:
				_set_msg("The %s casts SLEEP!" % _mon_name)
				_play_sfx("cast_spell")
				await _wait_sfx()
				_hero_ailment = "asleep"
				_update_status_bar()
				_set_msg("%s falls asleep!" % _hero_name())
				await _wait_delay(1.0)

		"spell_stopspell":
			var erdrick_blocks := _wearing_erdricks_armor()
			if _mon_stopspelled or _hero_stopspelled or erdrick_blocks:
				var reason := "But the spell fails!"
				if erdrick_blocks:
					reason = "Erdrick's Armor deflects the spell!"
				_set_msg("The %s tries to cast STOPSPELL!\n%s" % [_mon_name, reason])
				await _wait_delay(1.0)
			else:
				_set_msg("The %s casts STOPSPELL!" % _mon_name)
				_play_sfx("cast_spell")
				await _wait_sfx()
				_hero_stopspelled = true
				_set_msg("%s's spells are blocked!" % _hero_name())
				await _wait_delay(1.0)

		_:  # "attack" or fallback
			var dmg : int = 0
			if _hero_def >= _mon_str:
				dmg = randi_range(0, (_mon_str + 4) / 6)   # enemy_attack_weak
			else:
				dmg = _calc_dmg(_mon_str, _hero_def)
			_set_msg("The %s attacks %s!" % [_mon_name, _hero_name()])
			_play_sfx("prepare_to_attack")
			await _wait_sfx()
			if dmg <= 0:
				_set_msg("The %s attacks... but misses!" % _mon_name)
				await _wait_delay(0.8)
			else:
				_apply_hero_damage(dmg)
				_set_msg("%s takes %d damage!" % [_hero_name(), dmg])
				await _wait_sfx()

	_anim_lock = false
	_after_enemy_act()


# Apply damage to hero and play sound + flash
func _armor_id() -> String:
	return _hero_armor.to_lower().replace("'", "").replace(" ", "_")

func _wearing_erdricks_armor() -> bool:
	return _armor_id() == "erdricks_armor"

## Magic Armor and Erdrick's Armor both reduce HURT / HURTMORE damage by a third (NES).
func _wearing_magic_armor() -> bool:
	return _armor_id() in ["magic_armor", "erdricks_armor"]

func _apply_hero_damage(dmg: int) -> void:
	_play_sfx("receive_damage")
	_hero_hp = max(0, _hero_hp - dmg)
	var gs : Node = get_node_or_null("/root/GameState")
	if gs: gs.hero_stats["hp"] = _hero_hp
	_flash_hero_damage()
	_update_status_bar()



func _after_enemy_act() -> void:
	if _hero_hp <= 0:
		_phase = Phase.DEFEAT
		_stop_music()
		_play_sfx("thou_hast_died")
		_set_msg("%s has been defeated...\n\nPress A to continue." % _hero_name())
		_menu_box.visible = false
	else:
		_phase = Phase.PLAYER_MENU
		_set_msg("Command?")
		_show_menu()


func _has_fairy_flute() -> bool:
	var gs : Node = get_node_or_null("/root/GameState")
	if not gs:
		return false
	for it in gs.inventory:
		if it is Dictionary and str(it.get("id", "")).to_lower() == "fairy_flute":
			return true
	return false


func _do_item() -> void:
	var gs   : Node = get_node_or_null("/root/GameState")
	# NES: the Fairy Flute's melody puts the Golem to sleep, bypassing its resistance.
	# Against anything else it is just a pretty tune.
	if _mon_key == "golem" and _has_fairy_flute():
		_play_sfx("fairy_flute")
		_set_msg("%s plays the Fairy Flute." % _hero_name())
		await _wait_delay(1.2)
		if _mon_asleep:
			_set_msg("The Golem is already asleep.")
		else:
			_mon_asleep = true
			_set_msg("Quietly Golem closes his eyes\nand settles into sleep.\nThe Golem is asleep.")
		await _wait_delay(1.3)
		_after_player_act()
		return
	var herb : int  = -1
	if gs:
		for i in range(gs.inventory.size()):
			var n : String = str(gs.inventory[i].get("name", "")).to_lower()
			if n == "herb" or n == "medical herb":
				herb = i
				break
	if herb >= 0:
		var heal : int = randi_range(23, 30)
		_hero_hp = min(_hero_hp + heal, _hero_hp_max())
		if gs:
			gs.inventory.remove_at(herb)
			gs.hero_stats["hp"] = _hero_hp
		_update_status_bar()
		_set_msg("Used a Medical Herb! HP restored by %d." % heal)
		await _wait_delay(1.1)
		_after_player_act()
	else:
		_set_msg("Nothing to use!")
		await _wait_delay(0.8)
		_phase = Phase.PLAYER_MENU
		_set_msg("Command?")
		_show_menu()


const RUN_GROUP_FACTORS : Array = [0.25, 0.375, 0.5, 1.0]


func _do_run() -> void:
	# Blocked when hero_agility * RAND < enemy_agility * RAND * group_factor
	# (RAND 0-255). Sleeping monsters never block an escape.
	var factor : float = RUN_GROUP_FACTORS[_mon_run_group - 1]
	var escaped : bool = _mon_asleep or float(_hero_agi * (randi() % 256)) >= float(_mon_agl * (randi() % 256)) * factor
	if escaped:
		_phase = Phase.FLED
		_play_sfx("stairs_down")
		_set_msg("%s fled the battle!\n\nPress A to continue." % _hero_name())
		_menu_box.visible = false
	else:
		_set_msg("%s tried to flee but couldn't!" % _hero_name())
		await _wait_delay(1.0)
		_phase = Phase.ENEMY_ACT
		_do_enemy_turn()


# ── Sprite flash animation ─────────────────────────────────────────────────
# Called when hero's attack hits the enemy: red→white→red→white flash
func _flash_enemy() -> void:
	var tw : Tween = create_tween()
	tw.tween_property(_enemy_sprite, "modulate", Color(3.0, 0.2, 0.2, 1.0), 0.05)
	tw.tween_property(_enemy_sprite, "modulate", Color.WHITE,                0.10)
	tw.tween_property(_enemy_sprite, "modulate", Color(3.0, 0.2, 0.2, 1.0), 0.05)
	tw.tween_property(_enemy_sprite, "modulate", Color.WHITE,                0.15)


# Called when enemy dies: fade sprite and name label alpha 1→0 over 1 second
func _fade_enemy() -> void:
	var tw : Tween = create_tween()
	tw.set_parallel(true)
	tw.tween_property(_enemy_sprite, "modulate:a", 0.0, 1.0)
	tw.tween_property(_enemy_lbl,    "modulate:a", 0.0, 1.0)
	await tw.finished


# Called when hero takes damage: flash HP label red→white×2
func _flash_hero_damage() -> void:
	var tw : Tween = create_tween()
	tw.tween_property(_hp_lbl, "modulate", Color(1.0, 0.1, 0.1, 1.0), 0.06)
	tw.tween_property(_hp_lbl, "modulate", Color.WHITE,                0.12)
	tw.tween_property(_hp_lbl, "modulate", Color(1.0, 0.1, 0.1, 1.0), 0.06)
	tw.tween_property(_hp_lbl, "modulate", Color.WHITE,                0.20)


# Show a spell animation overlay: fade in → hold → fade out
# spell_name matches filenames in assets/images/spells/<name>.png
func _show_spell_anim(spell_name: String) -> void:
	var path : String = "res://assets/images/spells/%s.png" % spell_name
	var f := FileAccess.open(path, FileAccess.READ)
	if f:
		var buf : PackedByteArray = f.get_buffer(f.get_length())
		var img : Image = Image.new()
		if img.load_png_from_buffer(buf) == OK:
			_spell_overlay.texture = ImageTexture.create_from_image(img)
	_spell_overlay.modulate = Color(1, 1, 1, 0)
	_spell_overlay.visible  = true
	_play_sfx("cast_spell")
	var tw : Tween = create_tween()
	tw.tween_property(_spell_overlay, "modulate:a", 1.0, 0.2)
	tw.tween_interval(0.7)
	tw.tween_property(_spell_overlay, "modulate:a", 0.0, 0.4)
	await tw.finished
	_spell_overlay.visible = false


# ── Spell helpers ──────────────────────────────────────────────────────────
const SPELL_DB : Dictionary = {
	"heal":       { "id": "heal",       "name": "HEAL",      "mp_cost":  4, "target": "self",  "hp_restore_min": 10, "hp_restore_max": 17 },
	"hurt":       { "id": "hurt",       "name": "HURT",      "mp_cost":  2, "target": "enemy", "damage_min": 5,  "damage_max": 12 },
	"sleep":      { "id": "sleep",      "name": "SLEEP",     "mp_cost":  2, "target": "enemy" },
	"stopspell":  { "id": "stopspell",  "name": "STOPSPELL", "mp_cost":  2, "target": "enemy" },
	"radiant":    { "id": "radiant",    "name": "RADIANT",   "mp_cost":  3, "target": "field" },
	"outside":    { "id": "outside",    "name": "OUTSIDE",   "mp_cost":  6, "target": "field" },
	"return":     { "id": "return",     "name": "RETURN",    "mp_cost":  8, "target": "field" },
	"repel":      { "id": "repel",      "name": "REPEL",     "mp_cost":  2, "target": "field" },
	"healmore":   { "id": "healmore",   "name": "HEALMORE",  "mp_cost": 10, "target": "self",  "hp_restore_min": 85, "hp_restore_max": 100 },
	"hurtmore":   { "id": "hurtmore",   "name": "HURTMORE",  "mp_cost":  5, "target": "enemy", "damage_min": 58, "damage_max": 65 },
}

func _load_known_spells(spell_ids: Array) -> Array:
	var result : Array = []
	for sid in spell_ids:
		if SPELL_DB.has(sid):
			result.append(SPELL_DB[sid])
	return result


func _rebuild_spell_panel() -> void:
	_spell_lbls.clear()
	_update_spell_cursor()


# ── Helpers ────────────────────────────────────────────────────────────────
# Waits for sfx to finish OR skip requested; polls per-frame so Enter cancels it
func _wait_sfx() -> void:
	_skip_requested = false
	if not _sfx.playing:
		await _wait_delay(0.15)
		return
	while _sfx.playing and not _skip_requested:
		await get_tree().process_frame
	_skip_requested = false


# Waits for `secs` seconds or until Enter/Select is pressed
func _wait_delay(secs: float) -> void:
	_skip_requested = false
	var timer := get_tree().create_timer(secs)
	while timer.time_left > 0.0 and not _skip_requested:
		await get_tree().process_frame
	_skip_requested = false


## DW1 damage formula: rand(base/2 .. base), base = atk - def/2
# data/v1/combat_formulas.json: damage in [(atk - def/2)/4, (atk - def/2)/2];
# when the maximum is below 1 the blow does 0 or 1 (coin flip).
func _calc_dmg(atk: int, def: int) -> int:
	var base : int = atk - def / 2
	if base / 2 < 1:
		return randi() % 2
	return randi_range(base / 4, base / 2)


func _hero_name() -> String:
	var gs : Node = get_node_or_null("/root/GameState")
	if gs:
		return str(gs.hero_stats.get("name", "Hero"))
	return "Hero"


func _hero_hp_max() -> int:
	return _hero_hp_max_val if _hero_hp_max_val > 0 else 15


func _roll(lo: int, hi: int) -> int:
	return randi_range(lo, hi)


func _update_status_bar() -> void:
	_hp_lbl.text  = "HP: %d/%d" % [_hero_hp, _hero_hp_max()]
	_mp_lbl.text  = "MP: %d/%d" % [_hero_mp, _hero_mp_max]
	if _hero_ailment.is_empty():
		_ailment_lbl.text = ""
	else:
		_ailment_lbl.text = _hero_ailment
	var gs: Node = get_node_or_null("/root/GameState")
	if gs:
		_gold_lbl.text = "G %d" % int(gs.gold)
		_exp_lbl.text  = "E %d" % int(gs.hero_stats.get("exp", 0))
	# HP color: green when healthy, yellow at half, red at low
	var ratio : float = float(_hero_hp) / float(max(1, _hero_hp_max()))
	if ratio > 0.5:
		_hp_lbl.add_theme_color_override("font_color", Color(0.4, 1.0, 0.4))
	elif ratio > 0.25:
		_hp_lbl.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))
	else:
		_hp_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))


func _finish() -> void:
	_stop_music()
	match _phase:
		Phase.VICTORY: emit_signal("battle_ended", "won")
		Phase.DEFEAT:  emit_signal("battle_ended", "lost")
		Phase.FLED:    emit_signal("battle_ended", "fled")


func _load_enemy_sprite(key: String) -> void:
	# Explicit overrides for keys whose filenames differ from the key
	const KEY_OVERRIDES : Dictionary = {
		"dragonlord_form1": "dragonlord1",   # human / wizard form
		"dragonlord_form2": "dragonlord",    # dragon form
	}
	var candidates : Array = []
	if KEY_OVERRIDES.has(key):
		candidates.append(KEY_OVERRIDES[key])
	candidates.append(key)
	if "_form" in key:
		candidates.append(key.split("_form")[0])
	candidates.append("slime")
	for c in candidates:
		for dir_prefix in ["res://assets/sprites/bestiary/", "res://assets/reference/mikesrpgcenter/bestiary/"]:
			var path : String = "%s%s.png" % [dir_prefix, c]
			var f := FileAccess.open(path, FileAccess.READ)
			if f:
				var buf  : PackedByteArray = f.get_buffer(f.get_length())
				var img  : Image           = Image.new()
				if img.load_png_from_buffer(buf) == OK:
					_enemy_sprite.texture = ImageTexture.create_from_image(img)
					return


# ── UI construction ────────────────────────────────────────────────────────
func _build_ui() -> void:
	_bg = ColorRect.new()
	_bg.color = Color(0, 0, 0, 1)
	_bg.size  = Vector2(VW, VH)
	add_child(_bg)

	# ── Hero status bar (top of screen) ──────────────────────────────────
	_status_panel          = Panel.new()
	_status_panel.position = Vector2(0, 0)
	_status_panel.size     = Vector2(VW, 36)
	var bar := StyleBoxFlat.new()
	bar.bg_color = MenuKit.BG
	bar.border_color = MenuKit.BORDER
	bar.border_width_bottom = 2
	_status_panel.add_theme_stylebox_override("panel", bar)
	add_child(_status_panel)

	_hp_lbl          = Label.new()
	_hp_lbl.position = Vector2(12, 8)
	_hp_lbl.size     = Vector2(160, 22)
	_hp_lbl.add_theme_font_size_override("font_size", 15)
	_hp_lbl.add_theme_color_override("font_color", Color(0.4, 1.0, 0.4))
	_status_panel.add_child(_hp_lbl)

	_mp_lbl          = Label.new()
	_mp_lbl.position = Vector2(200, 8)
	_mp_lbl.size     = Vector2(160, 22)
	_mp_lbl.add_theme_font_size_override("font_size", 15)
	_mp_lbl.add_theme_color_override("font_color", Color(0.4, 0.7, 1.0))
	_status_panel.add_child(_mp_lbl)

	_ailment_lbl          = Label.new()
	_ailment_lbl.position = Vector2(300, 8)
	_ailment_lbl.size     = Vector2(90, 22)
	_ailment_lbl.add_theme_font_size_override("font_size", 14)
	_ailment_lbl.add_theme_color_override("font_color", Color(1.0, 0.5, 0.1))
	_status_panel.add_child(_ailment_lbl)

	_gold_lbl                      = Label.new()
	_gold_lbl.position             = Vector2(392, 2)
	_gold_lbl.size                 = Vector2(114, 16)
	_gold_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_gold_lbl.add_theme_font_size_override("font_size", 12)
	_gold_lbl.add_theme_color_override("font_color", Color(1.0, 0.82, 0.3))
	_status_panel.add_child(_gold_lbl)

	_exp_lbl                      = Label.new()
	_exp_lbl.position             = Vector2(392, 18)
	_exp_lbl.size                 = Vector2(114, 16)
	_exp_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_exp_lbl.add_theme_font_size_override("font_size", 12)
	_exp_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95))
	_status_panel.add_child(_exp_lbl)

	# ── Enemy sprite + label ─────────────────────────────────────────────
	_enemy_sprite                = TextureRect.new()
	_enemy_sprite.size           = Vector2(107, 107)
	_enemy_sprite.position       = Vector2((VW - 107) / 2.0, 120)
	_enemy_sprite.stretch_mode   = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_enemy_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(_enemy_sprite)

	_enemy_lbl                      = Label.new()
	_enemy_lbl.position             = Vector2(VW / 2.0 - 80, 235)
	_enemy_lbl.size                 = Vector2(160, 24)
	_enemy_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_enemy_lbl.add_theme_color_override("font_color", Color(1, 0.9, 0.5))
	_enemy_lbl.add_theme_font_size_override("font_size", 16)
	add_child(_enemy_lbl)

	# Spell animation overlay — centered, covers combat area, hidden by default
	_spell_overlay                = TextureRect.new()
	_spell_overlay.size           = Vector2(VW, VH - 36)   # full width, below status bar
	_spell_overlay.position       = Vector2(0, 36)
	_spell_overlay.stretch_mode   = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_spell_overlay.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_spell_overlay.modulate       = Color(1, 1, 1, 0)
	_spell_overlay.visible        = false
	add_child(_spell_overlay)

	_msg_box          = Panel.new()
	_msg_box.position = Vector2(8, VH - 140)
	_msg_box.size     = Vector2(VW - 16, 128)
	MenuKit.skin(_msg_box)
	add_child(_msg_box)

	_msg_lbl               = Label.new()
	_msg_lbl.position      = Vector2(14, 10)
	_msg_lbl.size          = Vector2(VW - 44, 108)
	_msg_lbl.clip_text     = true
	_msg_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_msg_lbl.add_theme_color_override("font_color", Color.WHITE)
	_msg_lbl.add_theme_font_size_override("font_size", 16)
	_msg_box.add_child(_msg_lbl)

	# 2×2 command menu — FIGHT/SPELL on top, ITEM/RUN on bottom (drawn by MenuKit)
	_menu_box         = Panel.new()
	_menu_box.visible = false
	MenuKit.skin(_menu_box)
	add_child(_menu_box)

	# Spell submenu panel (positioned above command menu, hidden by default)
	_spell_panel         = Panel.new()
	_spell_panel.visible = false
	MenuKit.skin(_spell_panel)
	add_child(_spell_panel)   # size/position set dynamically in _rebuild_spell_panel


func _show_menu() -> void:
	_menu_box.visible = true
	_update_menu_cursor()


func _update_menu_cursor() -> void:
	MenuKit.render_grid(_menu_box, MENU_ITEMS, _cursor, 2, "", 92.0)
	_menu_box.position = Vector2(VW - _menu_box.size.x - 8, _msg_box.position.y - _menu_box.size.y - 6)


