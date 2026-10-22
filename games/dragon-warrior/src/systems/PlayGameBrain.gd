extends RefCounted
## PlayGameBrain.gd — "Play the game" mode for the in-engine robos-jrpg AI.
##
## Seeks the ordered milestones in data/v1/milestones.json one after another
## (every chest, every weapon/armor/shield purchase, each quest, the Dragonlord)
## using nothing but real user inputs. Reads game state from GameState and the
## live scene, plans multi-map routes with RoutePlanner, keeps the hero alive
## (field HEAL, herbs, inns) and grinds levels / gold whenever a milestone
## demands more than the hero has.
##
## AIEngine owns the input plumbing; this class only returns decisions:
##   {kind:"tap", action}  or  {kind:"stride", action, target, len}

const MILESTONES_PATH := "res://data/v1/milestones.json"
const WORLD_KEY := "world-map"
const MENU_ITEMS := ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"]
const STUCK_TICKS := 60
const MAX_GOAL_FAILURES := 12
const HEAL_RATIO := 0.4
const INN_RATIO := 0.65
const HERB_TARGET := 4
const TORCH_TARGET := 2       # spare torches to carry into caves before RADIANT is learned
const TORCH_PRICE := 8
const DARK_MAP_PREFIXES := ["erdricks-cave", "mountain-cave", "garinham-b", "charlock-castle-b", "swamp-cave"]
const MAX_PACK_TOOLS := 8

# Towns that have an inn, by map key -> {tile, face, cost, world}
var _inns: Dictionary = {}
var _item_shops: Dictionary = {}  # map_key -> {tile, face, price}

var _milestones: Array = []
var _index: int = 0
var _done: Dictionary = {}
var _skipped: Dictionary = {}
var _log: Array = []
var status: String = "idle"  # idle | running | completed | failed
var error: String = ""
var _started_msec: int = 0
var _ticks: int = 0
# Deadlock watchdog: wall-clock seconds with no visible progress before the
# current objective is abandoned (Engine.time_scale does not affect it).
const STALL_SEC := 90.0
const MAX_STALLS_PER_MILESTONE := 3
var _wd_sig: Array = []
var _wd_last_ms: int = 0
var _stall_counts: Dictionary = {}  # milestone id -> stalls
var _battles: int = 0
var _deaths: int = 0
var _max_inputs: int = 0
var _in_battle_counted: bool = false

# Pending UI intentions
var _pending_cmd: String = ""
var _pending_cmd_ticks: int = 0
var _pending_item_id: String = ""
var _equip_fail_ticks: int = 0
var _boss_committed: bool = false
var _pending_shop_item: String = ""
var _pending_spell: String = ""
var _choice_answer: String = "YES"

# Navigation
var _planner: RefCounted = null
var _plan_legs: Array = []
var _plan_goal: String = ""
var _plan_leg_idx: int = -1
var _stuck_pos: Vector2i = Vector2i(-1, -1)
var _stuck_map: String = ""
var _stuck_ticks: int = 0
var _goal_failures: Dictionary = {}
var _nudge_dir: int = 0

# Current objective: {kind, map, tile, face, action, label}
var _objective: Dictionary = {}
var _grind_target: Dictionary = {}
var _grind_cell: Vector2i = Vector2i(-1, -1)
var _light_fail_ticks: int = 0
var _shop_missing: Dictionary = {}  # map_key -> {item_id: true} items a shop turned out not to sell
var _last_gold: int = -1
var _battle_heals: int = 0
var _battle_sleeps: int = 0
var _battle_stopspells: int = 0
var _deaths_seen: int = 0
var _grind_tier_penalty: int = 0   # zones stepped down after deaths; eased by level-ups
var _grind_tier_boost: int = 0     # zones stepped up when grind battles barely scratch us
var _recent_dmg: Array = []        # HP lost per recent grind battle (sliding window)
var _battle_open: bool = false
var _battle_hp_start: int = 0
const GRIND_DMG_WINDOW := 6
const GRIND_BOOST_MAX := 4
var _death_level_bump: Dictionary = {}   # milestone id -> level to reach before trying it again
var _penalty_level: int = 0
var _heal_fail_ticks: int = 0
var _last_heal_kind: String = ""
var _battle_no_herb: bool = false
var _heading_to_inn: bool = false
var _rng := RandomNumberGenerator.new()

var _tree: SceneTree = null


func setup(tree: SceneTree) -> void:
	_tree = tree
	_rng.randomize()
	_planner = preload("res://src/systems/RoutePlanner.gd").new()
	_planner.call("load_data")


func start(args: Dictionary) -> Dictionary:
	_load_milestones()
	if _milestones.is_empty():
		status = "failed"
		error = "milestones.json missing or empty"
		return {"ok": false, "error": error}
	_index = 0
	_done.clear()
	_skipped.clear()
	_log.clear()
	_goal_failures.clear()
	_shop_missing.clear()
	_plan_legs.clear()
	_plan_goal = ""
	_objective = {}
	_grind_target = {}
	_ticks = 0
	_battles = 0
	_deaths = 0
	_grind_tier_penalty = 0
	_grind_tier_boost = 0
	_recent_dmg.clear()
	_battle_open = false
	_death_level_bump = {}
	_stall_counts = {}
	_wd_sig = []
	_wd_last_ms = 0
	_penalty_level = 0
	_deaths_seen = int(_gs().get("deaths")) if _gs() and _gs().get("deaths") != null else 0
	_last_gold = -1
	_started_msec = Time.get_ticks_msec()
	_max_inputs = int(args.get("max_inputs", 0))
	var from_id := str(args.get("from_milestone", ""))
	if from_id != "":
		for i in range(_milestones.size()):
			if str(_milestones[i].get("id", "")) == from_id:
				_index = i
				break
	var ts := float(args.get("time_scale", 1.0))
	if ts > 0.0:
		Engine.time_scale = ts
	var gs: Node = _gs()
	if gs and "demo_mode_enabled" in gs:
		gs.set("demo_mode_enabled", false)
	status = "running"
	error = ""
	_log_event("start", "play_game started at milestone %d/%d" % [_index + 1, _milestones.size()])
	return {"ok": true, "milestones": _milestones.size(), "index": _index, "time_scale": Engine.time_scale}


func stop() -> void:
	if status == "running":
		status = "idle"
	Engine.time_scale = 1.0
	_log_event("stop", "play_game stopped")


func report() -> Dictionary:
	var cur: Dictionary = _milestones[_index] if _index < _milestones.size() else {}
	var done_ids: Array = []
	var skipped_ids: Array = []
	for m in _milestones:
		var mid := str(m.get("id", ""))
		if _done.has(mid):
			done_ids.append(mid)
		if _skipped.has(mid):
			skipped_ids.append(mid)
	return {
		"status": status,
		"error": error,
		"index": _index,
		"total": _milestones.size(),
		"current": {"id": cur.get("id", ""), "name": cur.get("name", ""), "type": cur.get("type", ""), "map": cur.get("map", ""), "tile": cur.get("tile", {})},
		"done": done_ids,
		"skipped": skipped_ids,
		"objective": _objective_summary(),
		"ticks": _ticks,
		"battles": _battles,
		"deaths": _deaths,
		"elapsed_sec": float(Time.get_ticks_msec() - _started_msec) / 1000.0 if _started_msec > 0 else 0.0,
		"time_scale": Engine.time_scale,
		"log": _log.slice(maxi(0, _log.size() - 40), _log.size()),
	}


func _objective_summary() -> Dictionary:
	if _objective.is_empty():
		return {}
	var t: Vector2i = _objective.get("tile", Vector2i(-1, -1))
	return {"kind": _objective.get("kind", ""), "label": _objective.get("label", ""), "map": _objective.get("map", ""), "tile": [t.x, t.y], "action": _objective.get("action", "")}


# ── Milestone data ──────────────────────────────────────────────────────────

func _load_milestones() -> void:
	_milestones.clear()
	_inns.clear()
	_item_shops.clear()
	var f := FileAccess.open(MILESTONES_PATH, FileAccess.READ)
	if not f:
		push_error("[PlayGameBrain] missing " + MILESTONES_PATH)
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if not (parsed is Dictionary):
		return
	for m in parsed.get("milestones", []):
		if m is Dictionary:
			_milestones.append(m)
	var inns: Dictionary = parsed.get("inns", {})
	for key: String in inns:
		var inn: Dictionary = inns[key]
		var tile: Dictionary = inn.get("tile", {})
		_inns[key] = {
			"map": str(inn.get("map", key)),
			"tile": Vector2i(int(tile.get("col", 0)), int(tile.get("row", 0))),
			"face": str(inn.get("face", "up")),
			"cost": int(inn.get("cost", 6)),
		}
	var shops: Dictionary = parsed.get("item_shops", {})
	for key: String in shops:
		var shop: Dictionary = shops[key]
		var stile: Dictionary = shop.get("tile", {})
		_item_shops[key] = {
			"tile": Vector2i(int(stile.get("col", 0)), int(stile.get("row", 0))),
			"face": str(shop.get("face", "up")),
			"price": int(shop.get("price", 24)),
		}
	for m in _milestones:
		if str(m.get("type", "")) == "buy" and str(m.get("item_id", "")) == "herb" and not _item_shops.has(str(m.get("map", ""))):
			var tile: Dictionary = m.get("tile", {})
			_item_shops[str(m.get("map", ""))] = {
				"tile": Vector2i(int(tile.get("col", 0)), int(tile.get("row", 0))),
				"face": str(m.get("face", "up")),
				"price": int(m.get("price", 24)),
			}


func _m_tile(m: Dictionary) -> Vector2i:
	var t: Dictionary = m.get("tile", {})
	return Vector2i(int(t.get("col", 0)), int(t.get("row", 0)))


func _is_milestone_done(m: Dictionary) -> bool:
	var gs: Node = _gs()
	if not gs:
		return false
	var dw: Dictionary = m.get("done_when", {})
	match str(dw.get("kind", "")):
		"flag":
			var flag := str(dw.get("flag", ""))
			if flag == "bridge_built":
				var sc: Node = _scene()
				if sc and sc.get("_bridge_built") == true:
					return true
			return flag in gs and bool(gs.get(flag))
		"chest":
			var key := "%s:%d,%d" % [str(dw.get("map", "")), int(dw.get("col", 0)), int(dw.get("row", 0))]
			var oc: Dictionary = gs.opened_chests
			if oc.has(key):
				return true
			var sc: Node = _scene()
			if sc:
				var loc: Variant = sc.get("_opened_chests")
				if loc is Dictionary and loc.has(key):
					return true
			return false
		"door":
			var ud: Dictionary = gs.unlocked_doors
			return bool(ud.get(str(dw.get("key", "")), false))
		"equipped_at_least":
			var slot := str(dw.get("slot", "weapon"))
			var eq := str(gs.get_equipped(slot))
			if eq == "":
				return false
			var info: Dictionary = gs.equipment_info(eq)
			var stat: int = int(info.get("attack", 0)) if slot == "weapon" else int(info.get("defense", 0))
			var want_id := str(dw.get("item_id", ""))
			if want_id != "" and eq == want_id:
				return true
			# Equal stats are not equal gear (Full Plate vs Magic Armor): a tie needs the item itself.
			return stat > int(dw.get("value", 0)) or (want_id == "" and stat >= int(dw.get("value", 0)))
		"has_item":
			return _has_item_id(str(dw.get("item_id", "")))
		"level":
			return _level() >= int(dw.get("value", 1))
	return false


func _advance_milestones() -> void:
	while _index < _milestones.size():
		var m: Dictionary = _milestones[_index]
		var mid := str(m.get("id", ""))
		if _is_milestone_done(m):
			if not _done.has(mid):
				_done[mid] = true
				_log_event("done", "%d/%d %s" % [_index + 1, _milestones.size(), str(m.get("name", mid))])
			_index += 1
			_objective = {}
			_plan_legs.clear()
			_plan_goal = ""
			continue
		# Optional purchases we cannot afford (or that got weaker than what we wear) are skipped.
		if str(m.get("type", "")) == "buy" and _buy_is_pointless(m):
			_skip_current("already wearing something at least as good")
			continue
		break
	if _index >= _milestones.size():
		status = "completed"
		Engine.time_scale = 1.0
		_log_event("complete", "all milestones reached in %d ticks, %d battles, %d deaths" % [_ticks, _battles, _deaths])


func _buy_is_pointless(m: Dictionary) -> bool:
	var gs: Node = _gs()
	if not gs:
		return false
	var slot := str(m.get("slot", ""))
	if slot == "":
		return false
	var eq := str(gs.get_equipped(slot))
	if eq == "":
		return false
	var want_id := str(m.get("item_id", ""))
	if eq == want_id:
		return true
	var cur: Dictionary = gs.equipment_info(eq)
	var want: Dictionary = gs.equipment_info(want_id)
	var key := "attack" if slot == "weapon" else "defense"
	var cur_v := int(cur.get(key, 0))
	var want_v := int(want.get(key, 0))
	if cur_v != want_v:
		return cur_v > want_v
	# A stat tie is still an upgrade when the target piece has a special the current one lacks (Magic Armor regen).
	return str(want.get("special", "")) == "" or str(cur.get("special", "")) != ""


## Returns the inventory item id of a weapon/armor/shield that beats what is equipped, or "".
func _better_gear_in_inventory() -> String:
	var gs: Node = _gs()
	if not gs or not gs.has_method("equipment_id_for"):
		return ""
	var best_id := ""
	var best_gain := 0
	for item in _inventory():
		var eq_id := str(gs.equipment_id_for(item))
		if eq_id == "":
			continue
		var slot := str(gs.equipment_slot(eq_id))
		var key := "attack" if slot == "weapon" else "defense"
		var cur := str(gs.get_equipped(slot))
		var cur_v := int(gs.equipment_info(cur).get(key, 0)) if cur != "" else 0
		var gain := int(gs.equipment_info(eq_id).get(key, 0)) - cur_v
		if gain > best_gain:
			best_gain = gain
			best_id = eq_id
	return best_id


func _skip_current(reason: String) -> void:
	if _index >= _milestones.size():
		return
	var m: Dictionary = _milestones[_index]
	var mid := str(m.get("id", ""))
	_skipped[mid] = true
	_log_event("skip", "%s — %s" % [mid, reason])
	_index += 1
	_objective = {}
	_plan_legs.clear()
	_plan_goal = ""


# ── Main decision entry ─────────────────────────────────────────────────────

func decide(state: Dictionary, screen: Dictionary) -> Dictionary:
	_ticks += 1
	if status != "running":
		return _none()
	var gs: Node = _gs()
	if not gs:
		return _none()

	_track_deaths(state)
	_track_gold(state)
	_advance_milestones()
	if status != "running":
		return _none()
	if _check_progress_watchdog(state):
		return _none()
	if _max_inputs > 0 and _ticks > _max_inputs:
		status = "failed"
		error = "max_inputs exceeded at milestone %s" % str(_milestones[_index].get("id", ""))
		Engine.time_scale = 1.0
		return _none()

	var sc_name := str(state.get("scene_shown", {}).get("name", ""))
	if sc_name in ["TitleScreen", "SaveSelect", "DebugLaunch", "Ending", "Credits"]:
		return _tap("ui_accept")

	# Battles first: nothing else matters while a monster is on screen.
	var battle: Dictionary = state.get("battle", {})
	if bool(battle.get("is_battle", false)):
		return _decide_battle(state, battle)

	var ui := _handle_ui(state)
	if not ui.is_empty():
		return ui

	var gsi: Dictionary = state.get("game_state", {})
	if gsi.has("move_enabled") and not bool(gsi.get("move_enabled", true)):
		# Intro cutscene (king's speech) still running.
		return _tap("ui_accept")

	# Survival before progress.
	var surv := _decide_survival(state)
	if not surv.is_empty():
		return surv

	# Pick / refresh the objective for the current milestone.
	_objective = _objective_for_current(state)
	if _objective.is_empty():
		return _none()
	return _pursue_objective(state, screen)


func _none() -> Dictionary:
	return {"kind": "tap", "action": ""}


func _tap(action: String) -> Dictionary:
	return {"kind": "tap", "action": action}


# ── UI windows ──────────────────────────────────────────────────────────────

func _handle_ui(state: Dictionary) -> Dictionary:
	var choice: Dictionary = state.get("choice_box", {})
	if bool(choice.get("is_showing", false)):
		var cur := str(choice.get("selected_option", "YES")).to_upper()
		if cur != _choice_answer:
			return _tap("move_down" if _choice_answer == "NO" else "move_up")
		_choice_answer = "YES"
		return _tap("ui_accept")

	var shop: Dictionary = state.get("shop_window", {})
	if bool(shop.get("is_showing", false)):
		var items: Array = shop.get("items", [])
		var idx := int(shop.get("selected_index", 0))
		var want_idx := -1
		for i in range(items.size()):
			if items[i] is Dictionary and str(items[i].get("id", "")) == _pending_shop_item:
				want_idx = i
				break
		if want_idx < 0:
			if _pending_shop_item != "":
				_log_event("shop", "%s not sold here" % _pending_shop_item)
				if str(_objective.get("kind", "")) == "supply":
					var smap := str(_objective.get("map", ""))
					if not _shop_missing.has(smap):
						_shop_missing[smap] = {}
					_shop_missing[smap][_pending_shop_item] = true
				_fail_objective("shop lacks " + _pending_shop_item)
			_pending_shop_item = ""
			return _tap("ui_cancel")
		if idx < want_idx:
			return _tap("move_down")
		if idx > want_idx:
			return _tap("move_up")
		_pending_shop_item = ""
		_choice_answer = "YES"
		return _tap("ui_accept")

	var item_win: Dictionary = state.get("item_window", {})
	if bool(item_win.get("is_showing", false)):
		var inv: Array = _inventory()
		var idx := int(item_win.get("selected_index", 0))
		var want_idx := _inventory_index_of(_pending_item_id)
		if want_idx < 0 or inv.is_empty():
			_pending_item_id = ""
			return _tap("ui_cancel")
		if idx < want_idx:
			return _tap("move_down")
		if idx > want_idx:
			return _tap("move_up")
		_pending_item_id = ""
		return _tap("ui_accept")

	var status_win: Dictionary = state.get("status_window", {})
	if bool(status_win.get("is_showing", false)):
		return _tap("ui_cancel")

	var dialog: Dictionary = state.get("dialog_box", {})
	if bool(dialog.get("is_showing", false)):
		return _tap("ui_accept")

	var cmd: Dictionary = state.get("command_window", {})
	if bool(cmd.get("is_showing", false)):
		if _pending_cmd == "":
			return _tap("ui_cancel")
		_pending_cmd_ticks += 1
		if _pending_cmd_ticks > 12:
			_pending_cmd = ""
			return _tap("ui_cancel")
		var items: Array = cmd.get("menu_items", MENU_ITEMS)
		var cur_idx := int(cmd.get("selected_index", 0))
		var tgt := items.find(_pending_cmd)
		if tgt < 0:
			_pending_cmd = ""
			return _tap("ui_cancel")
		if cur_idx == tgt:
			_pending_cmd = ""
			_pending_cmd_ticks = 0
			return _tap("ui_accept")
		if cur_idx % 2 < tgt % 2:
			return _tap("move_right")
		if cur_idx % 2 > tgt % 2:
			return _tap("move_left")
		return _tap("move_down" if cur_idx / 2 < tgt / 2 else "move_up")
	return {}


func _open_command(cmd_name: String) -> Dictionary:
	_pending_cmd = cmd_name
	_pending_cmd_ticks = 0
	if cmd_name == "SPELL" or (cmd_name == "ITEM" and _pending_item_id in ["herb", "torch"]):
		_log_event("field", "%s%s (hp %d/%d mp %d)" % [cmd_name, (" " + _pending_item_id) if cmd_name == "ITEM" else "", _hp(), _hp_max(), _mp()])
	return _tap("cmd_menu")


# ── Battle AI ───────────────────────────────────────────────────────────────

func _decide_battle(state: Dictionary, battle: Dictionary) -> Dictionary:
	var phase := str(battle.get("phase_name", ""))
	if bool(battle.get("anim_lock", false)) or phase in ["INTRO", "VICTORY", "DEFEAT", "FLED"]:
		if phase == "INTRO" and not _in_battle_counted:
			_in_battle_counted = true
			_battles += 1
			_battle_heals = 0
			_battle_sleeps = 0
			_battle_stopspells = 0
			_battle_no_herb = false
			_battle_open = true
			_battle_hp_start = int(battle.get("battle_scene_info", {}).get("hero_hp", _hp()))
		if phase != "INTRO":
			_in_battle_counted = false
		if phase in ["VICTORY", "FLED", "DEFEAT"] and _battle_open:
			_battle_open = false
			_record_grind_damage(int(battle.get("battle_scene_info", {}).get("hero_hp", _hp())), phase)
		return _tap("ui_accept")

	if str(battle.get("msg_text", "")).begins_with("Nothing to use"):
		_battle_no_herb = true   # the pack mirror lags the real inventory during a fight
	var info: Dictionary = battle.get("battle_scene_info", {})
	var hp := int(info.get("hero_hp", _hp()))
	var mp := int(info.get("hero_mp", _mp()))
	var hp_max := _hp_max()
	var mon := str(info.get("monster_key", ""))
	var mon_hp := int(info.get("monster_hp", 0))
	var boss := mon in ["dragonlord", "dragonlord_form1", "dragonlord_form2", "dragonlord2", "axe_knight", "golem"]
	var known: Array = battle.get("known_spells", [])
	if bool(battle.get("hero_stopspelled", false)):
		known = []   # STOPSPELL: casting only wastes the turn

	if phase == "SPELL_SELECT":
		var cur := int(battle.get("spell_cursor", 0))
		var want := -1
		for i in range(known.size()):
			if known[i] is Dictionary and str(known[i].get("id", "")) == _pending_spell:
				want = i
				break
		if want < 0:
			_pending_spell = ""
			return _tap("ui_cancel")
		if cur < want:
			return _tap("move_down")
		if cur > want:
			return _tap("move_up")
		_pending_spell = ""
		return _tap("ui_accept")

	if phase != "PLAYER_MENU":
		return _tap("ui_accept")

	# Damage estimates follow data/v1/combat_formulas.json.
	var mon_atk := int(info.get("monster_atk", 0))
	var mon_agl := int(info.get("monster_def", 0))
	var my_def := int(_gs().hero_stats.get("def", 2))
	var my_atk := int(_gs().hero_stats.get("atk", 2))
	var max_hit := 0
	if my_def >= mon_atk:
		max_hit = (mon_atk + 4) / 6
	else:
		max_hit = (mon_atk - my_def / 2) / 2
	max_hit = maxi(2, max_hit)
	var phys_hit := max_hit
	var spell_hit := _monster_spell_hit(mon)
	max_hit = maxi(max_hit, spell_hit)
	var my_max_dmg := maxi(1, (my_atk - mon_agl / 2) / 2)
	var turns_to_kill := int(ceil(float(mon_hp) / maxf(1.0, float(my_max_dmg) * 0.75)))
	var asleep := bool(battle.get("monster_asleep", false))
	var mon_data: Dictionary = DataManager.get_monster(mon)
	# Expected damage per monster turn (spells land about half the time).
	var avg_hit := maxf(1.0, float(phys_hit) * 0.75)
	if spell_hit > 0 and not bool(battle.get("monster_stopspelled", false)):
		avg_hit = maxf(avg_hit, 0.5 * float(spell_hit) + 0.5 * float(phys_hit) * 0.75)
	var turns_to_die := int(float(hp) / avg_hit)
	var turns_after_full := int(float(hp_max) / avg_hit)
	# Against the Dragonlord every heal is a turn not spent attacking: only heal when
	# the next hit could kill us (NES wisdom: HEALMORE below ~55 HP, otherwise swing).
	var critical := hp <= max_hit + (10 if boss else 2)
	var can_finish := mon_hp <= maxi(1, my_max_dmg / 2)
	var winning := turns_to_kill < turns_to_die or (turns_to_kill == 1 and turns_to_die >= 1)
	var winnable_at_full := turns_to_kill < turns_after_full
	var herbs := 0 if _battle_no_herb else _count_item("herb")
	var conserving := _conserving_mp(state)
	var has_heal := _has_spell_mp(known, "healmore", mp) or _has_spell_mp(known, "heal", mp) or herbs > 0
	var heal_amount := 0
	if _has_spell_mp(known, "healmore", mp):
		heal_amount = 85
	elif herbs > 0:
		heal_amount = 23
	elif _has_spell_mp(known, "heal", mp):
		heal_amount = 10
	var heal_useful := heal_amount > int(avg_hit) and (boss or winnable_at_full)
	var casts := spell_hit > 0 or str(mon_data.get("pattern", "")).contains("spell_")
	var target := 0  # FIGHT
	if asleep and not critical:
		target = 0
	elif can_finish and not (critical and boss):
		target = 0
	elif ((critical and not boss) or (not winning and not boss)) and heal_useful and has_heal and _battle_heals < 4:
		# Cheapest heal that still out-paces the monster: HEAL (10-17) only vs weak hitters,
		# a herb (23-30) next, HEALMORE (85+) when the deficit or the damage demands it.
		var deficit := hp_max - hp
		if _has_spell_mp(known, "heal", mp) and avg_hit < 12.0 and deficit <= 30:
			_pending_spell = "heal"
		elif herbs > 0 and avg_hit < 22.0 and deficit <= 45:
			target = 2
		elif _has_spell_mp(known, "healmore", mp):
			_pending_spell = "healmore"
		elif herbs > 0:
			target = 2
		elif _has_spell_mp(known, "heal", mp):
			_pending_spell = "heal"
		else:
			target = 2
		if target == 0:
			target = 1
		_battle_heals += 1
	elif casts and not boss and not bool(battle.get("monster_stopspelled", false)) and _battle_stopspells < 1 \
			and int(mon_data.get("resist_stopspell", 16)) <= 8 and _has_spell_mp(known, "stopspell", mp) and turns_to_kill >= 2:
		_pending_spell = "stopspell"
		_battle_stopspells += 1
		target = 1
	elif not winning and not asleep and _battle_sleeps < 2 and int(mon_data.get("resist_sleep", 16)) <= 8 \
			and (not critical or int(mon_data.get("resist_sleep", 16)) <= 2) and _has_spell_mp(known, "sleep", mp):
		_pending_spell = "sleep"
		_battle_sleeps += 1
		target = 1
	elif not winning and not boss:
		target = 3   # cannot out-race it and cannot heal our way through: run
	elif boss and critical and has_heal:
		if _has_spell_mp(known, "healmore", mp):
			_pending_spell = "healmore"
			target = 1
		elif herbs > 0:
			target = 2   # herb (23-30) beats HEAL (10-17)
		elif _has_spell_mp(known, "heal", mp) and max_hit < 17:
			_pending_spell = "heal"
			target = 1
		else:
			target = 0   # a HEAL cannot out-pace the damage: keep swinging
		_battle_heals += 1
	elif not boss and mon_hp > 0 and _has_spell_mp(known, "hurtmore", mp) and mon_hp >= 40 and mp >= 15 \
			and int(mon_data.get("resist_hurt", 0)) <= 4 and (not conserving or turns_to_kill >= 4):
		_pending_spell = "hurtmore"
		target = 1
	elif not boss and mon_hp > 0 and _has_spell_mp(known, "hurt", mp) and mon_hp >= 14 and _level() < 12 and mp >= 8 \
			and int(mon_data.get("resist_hurt", 0)) <= 4:
		_pending_spell = "hurt"
		target = 1
	if target == 1 and _pending_spell == "":
		target = 0
	if target in [1, 2] and cur_cursor_is(battle, target):
		_log_event("cast", "%s vs %s (hp %d/%d mp %d)" % [_pending_spell if target == 1 else "herb", mon, hp, hp_max, mp])
	var cur_cursor := int(battle.get("cursor", 0))
	if cur_cursor == target:
		return _tap("ui_accept")
	if (cur_cursor ^ 2) == target:
		return _tap("move_down")
	return _tap("move_right")


func cur_cursor_is(battle: Dictionary, target: int) -> bool:
	return int(battle.get("cursor", 0)) == target


func _has_spell_mp(known: Array, spell_id: String, mp: int) -> bool:
	for sp in known:
		if sp is Dictionary and str(sp.get("id", "")) == spell_id:
			return mp >= int(sp.get("mp_cost", 99))
	return false


# ── Survival ────────────────────────────────────────────────────────────────

# Worst single-turn magic / breath damage a monster can deal (combat_formulas.json
# spells_enemy); physical defence does nothing against these.
## True while walking the Dragonlord's castle towards the boss (not on an inn trip):
## every MP spent on the way is one less HEALMORE in the final fight.
func _conserving_mp(state: Dictionary) -> bool:
	if _heading_to_inn:
		return false
	if _cur_map(state).begins_with("charlock"):
		return true
	# Also on the road to Charlock: every HURTMORE spent on a wyvern is a HEALMORE missing against the Dragonlord.
	var m: Dictionary = _milestones[_index] if _index < _milestones.size() else {}
	return str(m.get("map", "")).begins_with("charlock")


## MP the Dragonlord fight realistically needs: ~11 hits with HEALMORE (10 MP) every other turn.
func _boss_mp_bar() -> int:
	# The Dragonlord's second form is an MP race (~10 HEALMOREs): set out nearly full.
	return _mp_max() - 5 if _mp_max() >= 100 else int(float(_mp_max()) * 0.9)


func _monster_spell_hit(mon: String) -> int:
	var worst := 0
	var data: Dictionary = DataManager.get_monster(mon) if DataManager.has_method("get_monster") else {}
	var armor := str(_gs().get_equipped("armor")) if _gs() else ""
	var erdrick := armor == "erdricks_armor"
	var magic := erdrick or armor == "magic_armor"
	for entry in data.get("pattern", []):
		match str(entry.get("action", "")):
			"spell_hurt": worst = maxi(worst, 6 if magic else 10)
			"spell_hurtmore": worst = maxi(worst, 30 if magic else 45)
			"fire_weak": worst = maxi(worst, 14 if erdrick else 23)
			"fire_strong": worst = maxi(worst, 48 if erdrick else 72)
	return worst


func _track_deaths(_state: Dictionary) -> void:
	var gs: Node = _gs()
	var total: int = int(gs.get("deaths")) if gs and gs.get("deaths") != null else 0
	if total > _deaths_seen:
		_deaths_seen = total
		_deaths += 1
		_plan_legs.clear()
		_plan_goal = ""
		_grind_target = {}
		_last_gold = _gold()
		_grind_tier_penalty = mini(_grind_tier_penalty + 1, 3)
		_penalty_level = _level()
		var note := ""
		# Dying on the way to a milestone means we went too early: level up once more before retrying.
		if str(_objective.get("kind", "")) != "grind" and _index < _milestones.size():
			var mid := str(_milestones[_index].get("id", ""))
			var bump := maxi(int(_death_level_bump.get(mid, 0)), _level() + 1)
			_death_level_bump[mid] = bump
			note = "; retry %s at L%d" % [mid, bump]
		_log_event("death", "hero fell; back at Tantegel with %d gold (grind tier -%d%s)" % [_gold(), _grind_tier_penalty, note])

func _track_gold(state: Dictionary) -> void:
	var g := _gold()
	if _last_gold >= 0 and g < _last_gold and not bool(state.get("battle", {}).get("is_battle", false)):
		_log_event("spend", "spent %d gold at %s (%d left)" % [_last_gold - g, _cur_map(state), g])
	_last_gold = g



func _decide_survival(state: Dictionary) -> Dictionary:
	var hp := _hp()
	var hp_max := _hp_max()
	var mp := _mp()
	var gs: Node = _gs()
	var sc_name := str(state.get("scene_shown", {}).get("name", ""))
	var in_battle_scene := sc_name in ["WorldMap"] or sc_name.begins_with("Charlock") or "Cave" in sc_name or "Basement" in sc_name or "Hauksness" in sc_name or sc_name == "SwampCave"
	if _heal_fail_ticks > 0:
		_heal_fail_ticks -= 1

	# Heal early enough to survive two worst-case turns from the local monsters.
	# Inside the Dragonlord's castle we save MP for the boss: survive one hit plus a margin.
	var danger := _zone_worst_hit(state)
	var conserving := _conserving_mp(state)
	var low := hp <= maxi(int(float(hp_max) * HEAL_RATIO), mini(danger * 2, int(float(hp_max) * 0.75)))
	if conserving:
		low = hp <= maxi(int(float(hp_max) * HEAL_RATIO), mini(danger + 15, int(float(hp_max) * 0.6)))
	var can_heal: bool = (gs.has_spell("heal") and mp >= 4) or (gs.has_spell("healmore") and mp >= 10) or _count_item("herb") > 0
	if low and can_heal and _heal_fail_ticks > 0 and danger > 0:
		return _none()   # stand still until the heal lands; stepping triggers encounters
	var pack_full: bool = _count_pack_tools() >= MAX_PACK_TOOLS and _count_item("herb") > 0
	if pack_full and hp_max - hp >= 20 and _heal_fail_ticks == 0:
		_last_heal_kind = "herb"
		_heal_fail_ticks = 6
		_pending_item_id = "herb"
		return _open_command("ITEM")
	if low and _heal_fail_ticks == 0:
		if conserving and _count_item("herb") > 0:
			_last_heal_kind = "herb"
			_heal_fail_ticks = 6
			_pending_item_id = "herb"
			return _open_command("ITEM")
		if gs.has_spell("healmore") and mp >= 10 and hp_max - hp > 30:
			_last_heal_kind = "spell"
			_heal_fail_ticks = 6
			return _open_command("SPELL")
		if gs.has_spell("heal") and mp >= 4:
			_last_heal_kind = "spell"
			_heal_fail_ticks = 6
			return _open_command("SPELL")
		if _count_item("herb") > 0:
			_last_heal_kind = "herb"
			_heal_fail_ticks = 6
			_pending_item_id = "herb"
			return _open_command("ITEM")

	# Equip better gear found in chests (e.g. Erdrick's Sword) as soon as it is safe.
	if _equip_fail_ticks > 0:
		_equip_fail_ticks -= 1
	else:
		var better := _better_gear_in_inventory()
		if better != "":
			_equip_fail_ticks = 12
			_pending_item_id = better
			_log_event("equip", "equipping %s" % better)
			return _open_command("ITEM")

	# Light up dark caves like a player would: RADIANT if known, else a torch.
	# Never walk blind: a torch goes on even when RADIANT is affordable but HP is
	# low enough that the field SPELL command would heal instead of lighting.
	var light: Dictionary = state.get("light_status", {})
	if _light_fail_ticks > 0:
		_light_fail_ticks -= 1
	var radius := int(light.get("light_radius", 0))
	if bool(light.get("is_dark", false)) and _light_fail_ticks == 0:
		var radiant_ok: bool = gs.has_spell("radiant") and mp >= 3
		if radius <= 0:
			if radiant_ok and hp_max - hp < hp_max / 2 and not (low and gs.has_spell("heal") and mp >= 4):
				_light_fail_ticks = 20
				_log_event("light", "casting RADIANT in %s" % _cur_map(state))
				return _open_command("SPELL")
			if _count_item("torch") > 0:
				_light_fail_ticks = 20
				_log_event("light", "lighting a torch in %s" % _cur_map(state))
				_pending_item_id = "torch"
				return _open_command("ITEM")
			if radiant_ok:
				_light_fail_ticks = 20
				return _open_command("SPELL")
		elif radius <= 1 and radiant_ok and hp == hp_max and mp >= 8 and not conserving \
				and int(light.get("radiant_steps_left", 0)) <= 50:
			# Fading RADIANT (or a dim torch): refresh while HP is full so SPELL does not heal instead.
			_light_fail_ticks = 20
			_log_event("light", "refreshing RADIANT in %s" % _cur_map(state))
			return _open_command("SPELL")

	# Top up with magic while MP is plentiful instead of trekking back to an inn.
	var topup: bool = hp <= int(float(hp_max) * INN_RATIO) and mp >= maxi(10, int(float(_mp_max()) * 0.3))
	if topup and _heal_fail_ticks == 0 and not _heading_to_inn and not conserving:
		if gs.has_spell("healmore") and mp >= 10 and hp_max - hp > 30:
			_last_heal_kind = "spell"
			_heal_fail_ticks = 6
			return _open_command("SPELL")
		if gs.has_spell("heal") and mp >= 4:
			_last_heal_kind = "spell"
			_heal_fail_ticks = 6
			return _open_command("SPELL")

	# Rest at an inn only when worn down *and* out of ways to heal on the road.
	var heal_mp_ok: bool = (gs.has_spell("heal") and mp >= 8) or (gs.has_spell("healmore") and mp >= 20)
	var worn: bool = hp <= int(float(hp_max) * INN_RATIO) and not heal_mp_ok and _count_item("herb") == 0
	worn = worn or (bool(gs.has_spell("heal")) and mp < 4 and hp < int(float(hp_max) * INN_RATIO))
	var inn := _nearest_inn(state)
	if not inn.is_empty() and _gold() >= int(inn.get("cost", 6)):
		var cur_map := _cur_map(state)
		var at_inn_town := cur_map == str(inn.get("map", ""))
		if (worn and (low or at_inn_town or in_battle_scene)) or _heading_to_inn:
			if hp >= hp_max and (mp >= _mp_max() or _mp_max() == 0):
				_heading_to_inn = false
				_boss_committed = false
			else:
				_heading_to_inn = true
				# Wings fly us to the Tantegel gate: use them when the walk home is long
				# (Brecconary's inn is next door). Frees a pack slot too.
				if cur_map == WORLD_KEY and _count_item("wings") > 0 and _heal_fail_ticks == 0 \
						and str(inn.get("map", "")).begins_with("brecconary"):
					var here := _hero_tile(state)
					if abs(here.x - 45) + abs(here.y - 45) > 30:
						_heal_fail_ticks = 6
						_last_heal_kind = "wings"
						_pending_item_id = "wings"
						_log_event("wings", "flying back to Tantegel from (%d, %d)" % [here.x, here.y])
						return _open_command("ITEM")
				_objective = {
					"kind": "inn", "label": "rest at inn (%s)" % str(inn.get("map", "")),
					"map": str(inn.get("map", "")), "tile": inn.get("tile", Vector2i()),
					"face": str(inn.get("face", "up")), "action": "inn",
				}
				return _pursue_objective(state, {})
	_heading_to_inn = false

	# Keep a stock of herbs (and torches before RADIANT) when we are in a town
	# with an item shop and have spare gold.
	var cur_map2 := _cur_map(state)
	if _item_shops.has(cur_map2):
		var shop: Dictionary = _item_shops[cur_map2]
		var reserve := _gold_needed_for_next_buy()
		var missing_here: Dictionary = _shop_missing.get(cur_map2, {})
		for want in [["torch", _torch_target(), TORCH_PRICE], ["herb", _herb_target(), int(shop.get("price", 24))]]:
			var item_id: String = want[0]
			if missing_here.has(item_id) or _count_item(item_id) >= int(want[1]):
				continue
			if _count_item(item_id) == 0 and _count_pack_tools() >= MAX_PACK_TOOLS:
				continue
			# Torches are cheap and walking blind is worse than a slightly later weapon.
			if _gold() - int(want[2]) < (0 if item_id == "torch" else reserve):
				continue
			_pending_shop_item = item_id
			_objective = {
				"kind": "supply", "label": "buy " + item_id, "map": cur_map2, "tile": shop.get("tile", Vector2i()),
				"face": str(shop.get("face", "up")), "action": "buy", "item_id": item_id,
			}
			return _pursue_objective(state, {})
	return {}


func _nearest_inn(state: Dictionary) -> Dictionary:
	var cur_map := _cur_map(state)
	if _inns.has(cur_map):
		return _inns[cur_map]
	var hero := _hero_tile(state)
	var world_pos: Vector2i = hero if cur_map == WORLD_KEY else _planner.call("world_tile_for_map", cur_map)
	if world_pos == Vector2i(-1, -1):
		world_pos = Vector2i(45, 45)
	var best: Dictionary = {}
	var best_d := 1 << 30
	for key: String in _inns:
		var wt: Vector2i = _planner.call("world_tile_for_map", key)
		if wt == Vector2i(-1, -1):
			continue
		var d: int = abs(wt.x - world_pos.x) + abs(wt.y - world_pos.y)
		if d < best_d:
			best_d = d
			best = _inns[key]
	return best


## Gold to keep in reserve for the upcoming required purchases (so herb
## restocking never starves the next weapon / armour upgrade).
func _gold_needed_for_next_buy() -> int:
	var total := 0
	var n := 0
	for i in range(_index, mini(_milestones.size(), _index + 8)):
		var m: Dictionary = _milestones[i]
		if str(m.get("type", "")) == "buy" and not bool(m.get("optional", false)) and str(m.get("item_id", "")) != "herb":
			total += int(m.get("price", 0))
			n += 1
			if n >= 3:
				break
	return total


## Torches to carry when dark maps are among the upcoming milestones: a pair
## before RADIANT is known, a single backup for when MP runs dry afterwards
## (a torch burns out when leaving a dungeon).
func _torch_target() -> int:
	for i in range(_index, mini(_milestones.size(), _index + 12)):
		var mkey := str(_milestones[i].get("map", ""))
		for prefix: String in DARK_MAP_PREFIXES:
			if mkey.begins_with(prefix):
				return 1 if _gs().has_spell("radiant") else TORCH_TARGET
	return 0


func _herb_target() -> int:
	if _level() < 5:
		return 2
	# A full stack for the Dragonlord's castle: herbs save HEALMORE MP for the boss.
	if _index < _milestones.size() and str(_milestones[_index].get("map", "")).begins_with("charlock"):
		return 6
	return HERB_TARGET


# ── Objective selection ─────────────────────────────────────────────────────

func _objective_for_current(state: Dictionary) -> Dictionary:
	if _index >= _milestones.size():
		return {}
	var m: Dictionary = _milestones[_index]
	var mtype := str(m.get("type", ""))
	var mid := str(m.get("id", ""))
	var lvl := _level()
	var min_level := maxi(int(m.get("min_level", 1)), int(_death_level_bump.get(mid, 0)))

	# Optional gear we cannot afford is skipped right away (never grind levels first for it);
	# later grinds revisit it through _affordable_skipped_buy once the gold is there.
	if mtype == "buy" and bool(m.get("optional", false)) and _gold() < int(m.get("price", 0)):
		_skip_current("cannot afford optional %s (%dG)" % [str(m.get("item_id", "")), int(m.get("price", 0))])
		return _objective_for_current(state)
	if mtype == "level" or lvl < min_level:
		# While grinding, go back for any optional gear we skipped as unaffordable.
		var revisit := _affordable_skipped_buy()
		if not revisit.is_empty():
			return revisit
	if mtype == "level":
		return _grind_objective(state, "level %d" % int(m.get("done_when", {}).get("value", 1)))
	if lvl < min_level:
		return _grind_objective(state, "level %d before %s" % [min_level, mid])
	if mtype == "buy":
		var price := int(m.get("price", 0))
		if _gold() < price:
			return _grind_objective(state, "%d gold for %s" % [price, str(m.get("item_id", ""))])
	if mtype == "chest" and _count_pack_tools() >= MAX_PACK_TOOLS:
		var contents := _chest_contents(state, m)
		var is_gold: bool = contents.has("gp_min") or str(contents.get("item", "")) == "gold"
		var citem := str(contents.get("item", ""))
		# Consumables slide into a stack we already carry (six per slot).
		var stacks: bool = citem in ["herb", "torch", "fairy_water", "wings", "magic_key"] 			and _count_item(citem) > 0 and _count_item(citem) % 6 != 0
		if not is_gold and not stacks:
			# Burn a tool so the chest can be taken.
			if _count_item("herb") > 0 and _hp() < _hp_max():
				_pending_item_id = "herb"
				return {"kind": "use", "label": "free a pack slot", "map": _cur_map(state), "tile": _hero_tile(state), "face": "", "action": "item"}
			if not contents.is_empty():
				# Same rule as the NES game: eight tool slots, no dropping. Leave it.
				_skip_current("pack full; cannot carry %s" % str(contents.get("item", "?")))
				return _objective_for_current(state)
	# Never set off for the Dragonlord's castle worn down: a player rests up before the final dungeon.
	var target_map := str(m.get("map", ""))
	if target_map.begins_with("charlock") and not _cur_map(state).begins_with("charlock") and not _heading_to_inn \
			and _mp_max() > 0 and (_mp() < _boss_mp_bar() or _hp() < int(float(_hp_max()) * 0.8)):
		_heading_to_inn = true
		_log_event("expedition", "resting before Charlock for %s (hp %d/%d mp %d/%d)" % [mid, _hp(), _hp_max(), _mp(), _mp_max()])
	if mtype == "boss" and not _heading_to_inn and _cur_map(state) == str(m.get("map", "")):
		# Commit once we arrive with enough MP for the fight; door heals may then dip below the bar.
		if not _boss_committed and _mp_max() > 0 and _mp() + 3 * _count_item("herb") < _boss_mp_bar() - 20:
			_heading_to_inn = true
			_log_event("boss", "not ready for %s (hp %d/%d mp %d/%d); resting first" % [mid, _hp(), _hp_max(), _mp(), _mp_max()])
		else:
			_boss_committed = true
			var hurt: bool = _hp() < int(float(_hp_max()) * 0.9)
			if hurt and _heal_fail_ticks == 0 and _gs().has_spell("heal") and _mp() >= 4 and _mp() - 10 >= 40:
				# Patch up at the door rather than walking all the way back to an inn.
				_heal_fail_ticks = 6
				_last_heal_kind = "spell"
				return {"kind": "use", "label": "heal before boss", "map": _cur_map(state), "tile": _hero_tile(state), "face": "", "action": "spell"}
			if hurt and _heal_fail_ticks > 0:
				return {"kind": "wait", "label": "waiting for heal", "map": _cur_map(state), "tile": _hero_tile(state), "face": "", "action": "wait"}
	var face := str(m.get("face", ""))
	var action := mtype
	return {
		"kind": "milestone", "id": mid, "label": str(m.get("name", mid)),
		"map": str(m.get("map", "")), "tile": _m_tile(m), "face": face, "action": action,
		"item_id": str(m.get("item_id", "")), "shop_id": str(m.get("shop_id", "")),
	}


## Contents of a chest milestone, known only while standing in its map (the scene owns the tables).
func _chest_contents(state: Dictionary, m: Dictionary) -> Dictionary:
	if _cur_map(state) != str(m.get("map", "")):
		return {}
	var sc: Node = _scene()
	if not sc or not sc.has_method("_get_chest_entry"):
		return {}
	var t := _m_tile(m)
	var entry: Variant = sc.call("_get_chest_entry", t.x, t.y)
	return entry if entry is Dictionary else {}


func _affordable_skipped_buy() -> Dictionary:
	# Latest milestones first: later shops sell the better gear.
	for i in range(_index - 1, -1, -1):
		var m: Dictionary = _milestones[i]
		var mid := str(m.get("id", ""))
		if str(m.get("type", "")) != "buy" or _done.has(mid) or not bool(m.get("optional", false)):
			continue
		if _is_milestone_done(m):
			_skipped.erase(mid)
			_done[mid] = true
			_log_event("done", "%d/%d %s (revisited)" % [i + 1, _milestones.size(), str(m.get("name", mid))])
			continue
		var label := str(m.get("name", mid)) + " (revisit)"
		if _buy_is_pointless(m) or _gold() < int(m.get("price", 0)) or int(_goal_failures.get(label, 0)) >= MAX_GOAL_FAILURES:
			continue
		if _upgrade_pending_for_slot(str(m.get("slot", "")), i):
			continue   # a later, better piece for this slot is still ahead: save the gold for it

		return {
			"kind": "milestone", "id": mid, "label": label,
			"map": str(m.get("map", "")), "tile": _m_tile(m), "face": str(m.get("face", "")), "action": "buy",
			"item_id": str(m.get("item_id", "")), "shop_id": str(m.get("shop_id", "")),
		}
	return {}


## True when the milestone we are currently grinding for is a better piece for the same slot.
func _upgrade_pending_for_slot(slot: String, _before: int) -> bool:
	if slot == "" or _index >= _milestones.size():
		return false
	var cur: Dictionary = _milestones[_index]
	return str(cur.get("type", "")) == "buy" and str(cur.get("slot", "")) == slot and not _buy_is_pointless(cur)


## Pick a world tile in an encounter zone suited to our level and wander there.
func _grind_objective(state: Dictionary, why: String) -> Dictionary:
	var cur_map := _cur_map(state)
	var hero := _hero_tile(state)
	if not _grind_target.is_empty():
		var gt: Vector2i = _grind_target.get("tile", Vector2i(-1, -1))
		if cur_map == WORLD_KEY and hero == gt:
			_grind_target = {}
		elif cur_map == WORLD_KEY and not _planner.call("is_tile_walkable", WORLD_KEY, gt, _bridge_built()):
			_grind_target = {}
	if _grind_target.is_empty():
		var cell := _pick_grind_cell(state)
		var tile := Vector2i(-1, -1)
		var origin: Vector2i = hero if cur_map == WORLD_KEY else _planner.call("world_tile_for_map", cur_map)
		if origin == Vector2i(-1, -1):
			origin = Vector2i(45, 45)
		# Islands inside a zone cell (e.g. across the Charlock strait) are not
		# reachable: only accept a tile the planner can actually route to.
		for _attempt in range(6):
			var cand: Vector2i = _random_tile_in_cell(cell)
			if cand == Vector2i(-1, -1):
				break
			if not _planner.call("plan", WORLD_KEY, origin, WORLD_KEY, cand, _bridge_built()).is_empty():
				tile = cand
				break
		if tile == Vector2i(-1, -1):
			_grind_cell = Vector2i(-1, -1)
			tile = Vector2i(44, 44)
		_grind_target = {"tile": tile, "cell": cell}
	return {
		"kind": "grind", "label": "grind for %s" % why, "map": WORLD_KEY,
		"tile": _grind_target.get("tile", Vector2i(44, 44)), "face": "", "action": "wander",
	}


func _zone_tier_for_level(lvl: int) -> Array:
	if lvl <= 2: return [0, 1]
	if lvl <= 4: return [1, 2]
	if lvl <= 6: return [2, 3]
	if lvl <= 8: return [4, 5]
	if lvl <= 11: return [5, 6]
	if lvl <= 13: return [7, 8]
	if lvl <= 15: return [8, 9]
	if lvl <= 17: return [9, 10]   # knights/demon knights; starwyvern country waits for Erdrick's Armor
	return [11, 12]


func _pick_grind_cell(state: Dictionary) -> Vector2i:
	if _grind_tier_penalty > 0 and _level() > _penalty_level:
		_grind_tier_penalty -= 1
		_penalty_level = _level()
	var zones: Array = _zone_tier_for_level(_grind_level())
	var grid: Array = _zone_grid()
	if grid.is_empty():
		return Vector2i(2, 2)
	var cur_map := _cur_map(state)
	var here: Vector2i = _hero_tile(state) if cur_map == WORLD_KEY else _planner.call("world_tile_for_map", cur_map)
	if here == Vector2i(-1, -1):
		here = Vector2i(45, 45)
	if _grind_cell != Vector2i(-1, -1) and zones.has(int(grid[_grind_cell.y][_grind_cell.x])):
		return _grind_cell
	var best := Vector2i(2, 2)
	var best_score := 1 << 30
	for r in range(8):
		for c in range(8):
			var z := int(grid[r][c])
			if not zones.has(z):
				continue
			var center := Vector2i(int((c + 0.5) * 15.5), int((r + 0.5) * 15.5))
			if _random_tile_in_cell(Vector2i(c, r)) == Vector2i(-1, -1):
				continue
			var d: int = abs(center.x - here.x) + abs(center.y - here.y)
			var inn_d := _inn_distance(center)
			var score := d + inn_d / 2
			if _planner.call("plan", WORLD_KEY, Vector2i(45, 45), WORLD_KEY, _random_tile_in_cell(Vector2i(c, r)), _bridge_built()).is_empty():
				continue
			if score < best_score:
				best_score = score
				best = Vector2i(c, r)
	_grind_cell = best
	_log_event("grind", "grinding in zone cell %s (zone %d)" % [str(best), int(grid[best.y][best.x])])
	return best


## Level the zone table is read at: deaths pull it down, easy grinding pushes it up.
func _grind_level() -> int:
	return maxi(1, _level() - 2 * _grind_tier_penalty + 2 * _grind_tier_boost)


## Called when a battle ends. While grinding, keep a sliding window of HP lost
## per fight and move the grind up a tier when the local monsters barely
## scratch us (and the next tier is survivable), or back down when they hurt.
func _record_grind_damage(hp_end: int, phase: String) -> void:
	if str(_objective.get("kind", "")) != "grind" or phase == "DEFEAT":
		if phase == "DEFEAT":
			_grind_tier_boost = 0
			_recent_dmg.clear()
		return
	# Heals cast mid-fight hide damage: count each as a meaningful chunk.
	var dmg: int = maxi(0, _battle_hp_start - hp_end) + _battle_heals * maxi(15, _hp_max() / 4)
	_recent_dmg.append(dmg)
	while _recent_dmg.size() > GRIND_DMG_WINDOW:
		_recent_dmg.pop_front()
	if _recent_dmg.size() < GRIND_DMG_WINDOW:
		return
	var total := 0
	for d in _recent_dmg:
		total += int(d)
	var avg := float(total) / float(_recent_dmg.size())
	var hp_max := _hp_max()
	if avg <= float(hp_max) * 0.08 and _grind_tier_boost < GRIND_BOOST_MAX:
		var next_zones: Array = _zone_tier_for_level(_grind_level() + 2)
		if next_zones == _zone_tier_for_level(_grind_level()):
			return
		var worst := _worst_hit_for_zones(next_zones)
		if worst * 3 <= hp_max:
			_grind_tier_boost += 1
			_recent_dmg.clear()
			_grind_cell = Vector2i(-1, -1)
			_grind_target = {}
			_log_event("grind", "barely scratched (avg %.0f dmg/battle of %d hp): moving up to zones %s (worst hit %d)" % [avg, hp_max, str(next_zones), worst])
	elif avg >= float(hp_max) * 0.35 and _grind_tier_boost > 0:
		_grind_tier_boost -= 1
		_recent_dmg.clear()
		_grind_cell = Vector2i(-1, -1)
		_grind_target = {}
		_log_event("grind", "taking %.0f dmg/battle of %d hp: dropping back to zones %s" % [avg, hp_max, str(_zone_tier_for_level(_grind_level()))])


func _worst_hit_for_zones(zones: Array) -> int:
	if _zone_data_cache.is_empty():
		var f := FileAccess.open("res://data/v1/worldmap_zones.json", FileAccess.READ)
		if f:
			var parsed: Variant = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				_zone_data_cache = parsed
	var keys: Array = []
	for z in zones:
		keys.append_array(_zone_data_cache.get("monster_sets", {}).get(str(int(z)), []))
	return _worst_hit_for_monsters(keys)


func _inn_distance(pos: Vector2i) -> int:
	var best := 1 << 20
	for key: String in _inns:
		var wt: Vector2i = _planner.call("world_tile_for_map", key)
		if wt == Vector2i(-1, -1):
			continue
		best = mini(best, abs(wt.x - pos.x) + abs(wt.y - pos.y))
	return best


func _random_tile_in_cell(cell: Vector2i) -> Vector2i:
	var x0 := int(cell.x * 15.5)
	var y0 := int(cell.y * 15.5)
	for _i in range(60):
		var t := Vector2i(x0 + _rng.randi_range(1, 14), y0 + _rng.randi_range(1, 14))
		if t.x >= 124 or t.y >= 124:
			continue
		if _planner.call("is_world_warp", t):
			continue
		if not _planner.call("is_tile_walkable", WORLD_KEY, t, _bridge_built()):
			continue
		var tid := int(_planner.call("tile_id", WORLD_KEY, t))
		if tid == 7:  # swamp hurts; never idle there
			continue
		return t
	return Vector2i(-1, -1)


var _zone_data_cache: Dictionary = {}

# Worst single-turn hit (physical or magic) among the monsters of the world
# zone the hero stands in; 0 off the world map.
func _zone_worst_hit(state: Dictionary) -> int:
	var keys: Array = []
	if _cur_map(state) == "world-map":
		if _zone_data_cache.is_empty():
			var f := FileAccess.open("res://data/v1/worldmap_zones.json", FileAccess.READ)
			if f:
				var parsed: Variant = JSON.parse_string(f.get_as_text())
				if parsed is Dictionary:
					_zone_data_cache = parsed
		var grid: Array = _zone_data_cache.get("grid", [])
		if grid.is_empty():
			return 0
		var hero := _hero_tile(state)
		var row := clampi(int(hero.y / 15.5), 0, grid.size() - 1)
		var col := clampi(int(hero.x / 15.5), 0, grid[row].size() - 1)
		var zone := str(int(grid[row][col]))
		keys = _zone_data_cache.get("monster_sets", {}).get(zone, [])
	else:
		# Dungeons: the scene knows its own encounter pool.
		var sc: Node = _scene()
		if sc and sc.has_method("_get_encounter_pool"):
			keys = sc.call("_get_encounter_pool")
	return _worst_hit_for_monsters(keys)


func _worst_hit_for_monsters(keys: Array) -> int:
	if keys.is_empty():
		return 0
	var my_def := int(_gs().hero_stats.get("def", 2))
	var worst := 0
	for key in keys:
		var m: Dictionary = DataManager.get_monster(str(key))
		if m.is_empty():
			continue
		var mon_str := int(m.get("strength", 0))
		var hit := (mon_str + 4) / 6 if my_def >= mon_str else (mon_str - my_def / 2) / 2
		worst = maxi(worst, maxi(hit, _monster_spell_hit(str(key))))
	return worst


func _zone_grid() -> Array:
	var f := FileAccess.open("res://data/v1/worldmap_zones.json", FileAccess.READ)
	if not f:
		return []
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary:
		return parsed.get("grid", [])
	return []


# ── Pursuing an objective ───────────────────────────────────────────────────

func _pursue_objective(state: Dictionary, _screen: Dictionary) -> Dictionary:
	var cur_map := _cur_map(state)
	var hero := _hero_tile(state)
	var facing := str(state.get("hero_position", {}).get("facing", "down"))
	var tgt_map := str(_objective.get("map", ""))
	var tgt: Vector2i = _objective.get("tile", Vector2i(-1, -1))
	var action := str(_objective.get("action", ""))

	_update_stuck(cur_map, hero)

	if cur_map == tgt_map and hero == tgt:
		_reset_stuck()
		match action:
			"wander":
				_grind_target = {}
				return _none()
			"step":
				# Standing on the trigger without result: step off and back on.
				var off := _any_walkable_neighbour(hero)
				if off != Vector2i(-1, -1):
					return _tap(_dir_action(off - hero))
				return _none()
			_:
				var face := str(_objective.get("face", ""))
				if face != "" and facing != face:
					return _tap("move_" + face)
				return _perform_action(action)

	return _navigate(state, cur_map, hero, tgt_map, tgt)


func _perform_action(action: String) -> Dictionary:
	match action:
		"talk", "boss", "inn":
			_choice_answer = "YES"
			return _open_command("TALK")
		"buy":
			_pending_shop_item = str(_objective.get("item_id", ""))
			_choice_answer = "YES"
			return _open_command("TALK")
		"chest":
			return _open_command("TAKE")
		"door":
			return _open_command("DOOR")
		"search":
			return _open_command("SEARCH")
		"spell":
			return _open_command("SPELL")
		"wait":
			return _none()
		"use_item", "item":
			if _pending_item_id == "":
				_pending_item_id = str(_objective.get("item_id", "herb"))
			return _open_command("ITEM")
	return _none()


func _navigate(state: Dictionary, cur_map: String, hero: Vector2i, tgt_map: String, tgt: Vector2i) -> Dictionary:
	var goal_key := "%s:%d,%d" % [tgt_map, tgt.x, tgt.y]
	if goal_key != _plan_goal or _plan_legs.is_empty() or not _plan_has_map(cur_map):
		_plan_legs = _planner.call("plan", cur_map, hero, tgt_map, tgt, _bridge_built())
		_plan_goal = goal_key
		_plan_leg_idx = -1
		if _plan_legs.is_empty():
			if not _planner.call("has_map", cur_map):
				_log_event("nav", "unknown map %s; nudging" % cur_map)
				return _nudge(hero)
			_fail_objective("no route from %s %s to %s" % [cur_map, str(hero), goal_key])
			return _nudge(hero)

	var leg_i := _leg_for_map(cur_map)
	if leg_i < 0:
		_plan_legs.clear()
		return _nudge(hero)
	var leg: Dictionary = _plan_legs[leg_i]
	var leg_target: Vector2i = leg.get("target", tgt)
	var via := str(leg.get("via", "arrive"))

	if hero == leg_target:
		if via == "stairs":
			return _open_command("STAIRS")
		if via.begins_with("step:"):
			return _tap("move_" + via.substr(5))
		if via == "auto":
			# Warp should have fired on arrival. Step away and back.
			var off := _any_walkable_neighbour(hero)
			if off != Vector2i(-1, -1):
				return _tap(_dir_action(off - hero))
		return _none()

	var sc: Node = _scene()
	var path: Array = []
	if sc and sc.has_method("_is_walkable"):
		var size: Vector2i = _map_size(cur_map, sc)
		var extra: Array = [leg_target]
		var blocked: Array = []
		if cur_map == WORLD_KEY:
			if _bridge_built():
				extra.append(Vector2i(66, 51))
			# Never path *through* a town / cave / castle door tile on the world map.
			blocked = _planner.call("world_warp_tiles")
		else:
			# Town border tiles warp to the world map the moment the hero steps on
			# them, so they may only ever be the last tile of a leg.
			for x in range(size.x):
				blocked.append(Vector2i(x, 0))
				blocked.append(Vector2i(x, size.y - 1))
			for y in range(1, size.y - 1):
				blocked.append(Vector2i(0, y))
				blocked.append(Vector2i(size.x - 1, y))
			blocked.erase(leg_target)
		path = _planner.call("bfs_live", hero, leg_target, size.x, size.y, Callable(sc, "_is_walkable"), extra, blocked)
	if path.size() < 2:
		# Live map disagrees with the planner; fall back to the planned path.
		var planned: Array = leg.get("path", [])
		var at := planned.find(hero)
		if at >= 0 and at + 1 < planned.size():
			path = [hero, planned[at + 1]]
		else:
			_plan_legs.clear()
			return _nudge(hero)

	var first_dir: Vector2i = path[1] - hero
	var end: Vector2i = path[1]
	var length := 1
	for i in range(2, path.size()):
		if path[i] - path[i - 1] == first_dir:
			end = path[i]
			length += 1
		else:
			break
	# Never stride across a tile that warps elsewhere mid-way; stop on it instead.
	return {"kind": "stride", "action": _dir_action(first_dir), "target": end, "len": length}


func _plan_has_map(cur_map: String) -> bool:
	for leg in _plan_legs:
		if str(leg.get("map", "")) == cur_map:
			return true
	return false


func _leg_for_map(cur_map: String) -> int:
	# Stay on the leg we are already walking (a route may visit the same map
	# twice, e.g. town -> world -> town; never bounce between those legs).
	if _plan_leg_idx >= 0 and _plan_leg_idx < _plan_legs.size() and str(_plan_legs[_plan_leg_idx].get("map", "")) == cur_map:
		return _plan_leg_idx
	# Otherwise prefer the next leg after the one we were on.
	for i in range(_plan_leg_idx + 1, _plan_legs.size()):
		if str(_plan_legs[i].get("map", "")) == cur_map:
			_plan_leg_idx = i
			return i
	for i in range(_plan_legs.size()):
		if str(_plan_legs[i].get("map", "")) == cur_map:
			_plan_leg_idx = i
			return i
	return -1


func _map_size(cur_map: String, sc: Node) -> Vector2i:
	if sc.has_method("_get_map_w") and sc.has_method("_get_map_h"):
		return Vector2i(int(sc.call("_get_map_w")), int(sc.call("_get_map_h")))
	var gsz: Vector2i = _planner.call("grid_size", cur_map)
	if gsz.x > 0:
		return gsz
	return Vector2i(124, 124)


func _any_walkable_neighbour(hero: Vector2i) -> Vector2i:
	var sc: Node = _scene()
	if not sc or not sc.has_method("_is_walkable"):
		return Vector2i(-1, -1)
	var dirs: Array[Vector2i] = [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]
	for d in dirs:
		var n: Vector2i = hero + d
		if bool(sc.call("_is_walkable", n)) and not (_cur_map_from_scene(sc) == WORLD_KEY and _planner.call("is_world_warp", n)):
			return n
	return Vector2i(-1, -1)


func _nudge(hero: Vector2i) -> Dictionary:
	var dirs: Array[String] = ["move_down", "move_right", "move_up", "move_left"]
	_nudge_dir = (_nudge_dir + 1) % dirs.size()
	var n := _any_walkable_neighbour(hero)
	if n != Vector2i(-1, -1) and _nudge_dir % 2 == 0:
		return _tap(_dir_action(n - hero))
	return _tap(dirs[_nudge_dir])


func _update_stuck(cur_map: String, hero: Vector2i) -> void:
	if cur_map == _stuck_map and hero == _stuck_pos:
		_stuck_ticks += 1
		if _stuck_ticks >= STUCK_TICKS:
			_stuck_ticks = 0
			_plan_legs.clear()
			_plan_goal = ""
			_pending_cmd = ""
			_fail_objective("stuck at %s %s" % [cur_map, str(hero)])
	else:
		_stuck_map = cur_map
		_stuck_pos = hero
		_stuck_ticks = 0


func _reset_stuck() -> void:
	_stuck_ticks = 0


func _check_progress_watchdog(state: Dictionary) -> bool:
	var battle: Dictionary = state.get("battle", {})
	var sig: Array = [_index, _battles, _level(), _gold(), _cur_map(state), _hero_tile(state),
		_count_item("herb"), _hp(), str(battle.get("msg_text", ""))]
	var now := Time.get_ticks_msec()
	if sig != _wd_sig or _wd_last_ms == 0:
		_wd_sig = sig
		_wd_last_ms = now
		return false
	if now - _wd_last_ms < int(STALL_SEC * 1000.0):
		return false
	_wd_last_ms = now
	var m: Dictionary = _milestones[_index] if _index < _milestones.size() else {}
	var mid := str(m.get("id", ""))
	_stall_counts[mid] = int(_stall_counts.get(mid, 0)) + 1
	var what := str(_objective.get("label", "no objective"))
	_log_event("deadlock", "no progress for %ds on '%s' at %s %s (stall %d/%d for %s)" % [
		int(STALL_SEC), what, _cur_map(state), str(_hero_tile(state)), int(_stall_counts[mid]), MAX_STALLS_PER_MILESTONE, mid])
	if str(_objective.get("kind", "")) == "supply":
		_item_shops.erase(str(_objective.get("map", "")))
	_objective = {}
	_plan_legs.clear()
	_plan_goal = ""
	_pending_cmd = ""
	_pending_shop_item = ""
	_pending_item_id = ""
	_heading_to_inn = false
	_grind_target = {}
	_grind_cell = Vector2i(-1, -1)
	if int(_stall_counts[mid]) >= MAX_STALLS_PER_MILESTONE and not m.is_empty():
		if bool(m.get("optional", false)):
			_skip_current("deadlocked %d times" % MAX_STALLS_PER_MILESTONE)
		else:
			status = "failed"
			error = "deadlock: no progress on %s after %d stalls (last objective: %s)" % [mid, MAX_STALLS_PER_MILESTONE, what]
			Engine.time_scale = 1.0
	return true


func _fail_objective(reason: String) -> void:
	var key := str(_objective.get("label", "objective"))
	_goal_failures[key] = int(_goal_failures.get(key, 0)) + 1
	_log_event("fail", "%s (%d): %s" % [key, int(_goal_failures[key]), reason])
	if str(_objective.get("kind", "")) == "grind":
		_grind_target = {}
		_grind_cell = Vector2i(-1, -1)
		return
	if str(_objective.get("kind", "")) == "inn":
		_heading_to_inn = false
		_heal_fail_ticks = 200
		return
	if str(_objective.get("kind", "")) == "supply":
		# A shop we cannot reach: stop trying it this run and move on.
		if int(_goal_failures[key]) >= 3:
			var bad_map := str(_objective.get("map", ""))
			_item_shops.erase(bad_map)
			_log_event("supply", "giving up on the %s item shop" % bad_map)
		_objective = {}
		_plan_legs.clear()
		_plan_goal = ""
		return
	if str(_objective.get("label", "")).ends_with(" (revisit)"):
		# Revisiting a skipped optional purchase: give up quietly, keep grinding.
		_objective = {}
		_plan_legs.clear()
		_plan_goal = ""
		return
	if int(_goal_failures[key]) >= MAX_GOAL_FAILURES and str(_objective.get("kind", "")) == "milestone":
		var m: Dictionary = _milestones[_index] if _index < _milestones.size() else {}
		if bool(m.get("optional", false)):
			_skip_current("gave up after %d failures" % MAX_GOAL_FAILURES)
		else:
			status = "failed"
			error = "milestone %s unreachable after %d failures: %s" % [str(m.get("id", "")), MAX_GOAL_FAILURES, reason]
			Engine.time_scale = 1.0
			_log_event("failed", error)


# ── Game state helpers ──────────────────────────────────────────────────────

func _gs() -> Node:
	return _tree.root.get_node_or_null("GameState") if _tree else null


func _scene() -> Node:
	return _tree.current_scene if _tree else null


func _cur_map(state: Dictionary) -> String:
	var mk := str(state.get("scene_shown", {}).get("map_key", ""))
	if mk != "":
		return mk
	return _cur_map_from_scene(_scene())


func _cur_map_from_scene(sc: Node) -> String:
	if not sc:
		return ""
	if sc.has_method("_get_map_key"):
		return str(sc.call("_get_map_key"))
	match str(sc.name):
		"WorldMap": return WORLD_KEY
		"Castle1F": return "tantegel-castle-1f"
		"ThroneRoom": return "tantegel-castle-2f"
	return ""


func _hero_tile(state: Dictionary) -> Vector2i:
	var hp: Dictionary = state.get("hero_position", {})
	return Vector2i(int(hp.get("x", 0)), int(hp.get("y", 0)))


func _level() -> int:
	var gs: Node = _gs()
	return int(gs.hero_stats.get("level", 1)) if gs else 1


func _hp() -> int:
	var gs: Node = _gs()
	return int(gs.hero_stats.get("hp", 0)) if gs else 0


func _hp_max() -> int:
	var gs: Node = _gs()
	return maxi(1, int(gs.hero_stats.get("hp_max", 1))) if gs else 1


func _mp() -> int:
	var gs: Node = _gs()
	return int(gs.hero_stats.get("mp", 0)) if gs else 0


func _mp_max() -> int:
	var gs: Node = _gs()
	return int(gs.hero_stats.get("mp_max", 0)) if gs else 0


func _gold() -> int:
	var sc: Node = _scene()
	if sc and sc.get("_hero_gold") != null:
		return int(sc.get("_hero_gold"))
	var gs: Node = _gs()
	return int(gs.gold) if gs else 0


func _bridge_built() -> bool:
	var gs: Node = _gs()
	return bool(gs.bridge_built) if gs else false


func _inventory() -> Array:
	var sc: Node = _scene()
	if sc and sc.get("_inventory") is Array:
		return sc.get("_inventory")
	var gs: Node = _gs()
	return gs.inventory if gs else []


func _item_matches(it: Variant, item_id: String) -> bool:
	if it is Dictionary:
		if str(it.get("id", "")) == item_id:
			return true
		var n := str(it.get("name", "")).to_lower()
		if item_id == "herb" and "herb" in n:
			return true
		if item_id == "rainbow_drop" and "rainbow" in n:
			return true
		if n.replace("'", "").replace(" ", "_") == item_id:
			return true
	elif it is String:
		return str(it).to_lower().replace(" ", "_") == item_id
	return false


func _has_item_id(item_id: String) -> bool:
	return _inventory_index_of(item_id) >= 0


func _inventory_index_of(item_id: String) -> int:
	var inv := _inventory()
	for i in range(inv.size()):
		if _item_matches(inv[i], item_id):
			return i
	return -1


func _count_item(item_id: String) -> int:
	var n := 0
	for it in _inventory():
		if _item_matches(it, item_id):
			n += 1
	return n


func _count_pack_tools() -> int:
	var sc: Node = _scene()
	if sc and sc.has_method("_count_pack_tools"):
		return int(sc.call("_count_pack_tools"))
	var n := 0
	var stacks := {}
	for it in _inventory():
		if it is Dictionary and str(it.get("type", "tool")) in ["weapon", "armor", "shield", "quest"]:
			continue
		var iid := str(it.get("id", "")).to_lower() if it is Dictionary else str(it).to_lower()
		if iid in ["herb", "torch", "fairy_water", "wings", "magic_key"]:
			stacks[iid] = int(stacks.get(iid, 0)) + 1
			continue
		n += 1
	for iid in stacks:
		n += int(ceil(float(stacks[iid]) / 6.0))
	return n


func _dir_action(delta: Vector2i) -> String:
	if delta == Vector2i(0, -1): return "move_up"
	if delta == Vector2i(0, 1): return "move_down"
	if delta == Vector2i(-1, 0): return "move_left"
	if delta == Vector2i(1, 0): return "move_right"
	return "move_down"


func _log_event(kind: String, msg: String) -> void:
	var entry := {"t": _ticks, "kind": kind, "msg": msg, "level": _level(), "gold": _gold(), "hp": _hp()}
	_log.append(entry)
	if _log.size() > 400:
		_log = _log.slice(_log.size() - 400, _log.size())
	print("[PlayGame] %s: %s (L%d %dG hp%d)" % [kind, msg, _level(), _gold(), _hp()])
