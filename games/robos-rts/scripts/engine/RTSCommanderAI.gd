extends Node

var skirmish_ai = preload("res://scripts/engine/RTSSkirmishAI.gd").new()
const CommanderView = preload("res://scripts/engine/RTSCommanderView.gd")
const HOWITZER_REDEPLOY_TICKS := 2 * 64
const HOWITZER_IDLE_TICKS := 4 * 64

var _views := {}
var record_orders := false
var recorded_orders: Array = []

func _view(pid: int) -> RefCounted:
	if not _views.has(pid):
		_views[pid] = CommanderView.new()
	return _views[pid]

func look_at(pid: int, point: Vector2) -> bool:
	var difficulty: String = player_directives.get(pid, {}).get("difficulty", "hard")
	return _view(pid).focus(point, SimEngine.tick, {"easy": 256, "normal": 128, "hard": 64}[difficulty])

func sees_enemy(pid: int, enemy: Dictionary) -> bool:
	# A visible minimap contact can prompt a pan. Read its details on screen.
	return SimEngine.is_hostile_contact(pid, enemy) and SimEngine.can_see_unit(pid, enemy) and look_at(pid, enemy.pos)

func is_on_camera(pid: int, point: Vector2) -> bool:
	return _view(pid).contains(point, SimEngine.tick)

func camera_center(pid: int) -> Vector2:
	return _view(pid).center

func observed_enemy_buildings(pid: int) -> Array:
	var view := _view(pid)
	var live := {}
	for tag in view.buildings.keys():
		var point: Vector2 = view.buildings[tag].pos
		if view.contains(point, SimEngine.tick) and SimEngine.can_see_position(pid, point):
			view.buildings.erase(tag)
	for unit in SimEngine.units.values():
		if unit.owner == 0 or unit.owner == pid or not SimEngine.can_see_unit(pid, unit):
			continue
		if view.contains(unit.pos, SimEngine.tick) and unit.is_structure:
			view.buildings[unit.tag] = {"tag": unit.tag, "pos": unit.pos, "radius": unit.radius}
			live[unit.tag] = unit
	var result := live.values()
	for tag in view.buildings:
		if not live.has(tag):
			result.append(view.buildings[tag])
	return result

func issue_order(tags: Array, command: String, point := Vector2.ZERO, target_tag := 0,
		extra := "", queued := false, stay_on_route := false) -> Dictionary:
	var actor: Dictionary = SimEngine.units.get(int(tags[0]), {}) if not tags.is_empty() else {}
	if actor.is_empty():
		return {"ok": false}
	var pid: int = actor.owner
	var view := _view(pid)
	var ground_move := command in ["move", "attack_move", "patrol"] and target_tag == 0
	var target_type: String = RTSData.get_ability_def(command).get("target", "none")
	var targeted := target_tag != 0 or ground_move or command.begins_with("build_") or target_type != "none"
	var visible_unit_target := false
	if target_tag != 0:
		var target: Dictionary = SimEngine.units.get(target_tag, {})
		if not target.is_empty():
			if not SimEngine.can_see_unit(pid, target):
				return {"ok": false}
			point = target.pos
			visible_unit_target = target.owner != pid
		else:
			var resource: Dictionary = SimEngine.resources.get(target_tag, {})
			if resource.is_empty():
				return {"ok": false}
			point = resource.pos
	if targeted and not ground_move and not visible_unit_target and not SimEngine.can_see_position(pid, point):
		return {"ok": false}
	var chosen: Array = []
	for tag in tags:
		var unit: Dictionary = SimEngine.units.get(int(tag), {})
		if unit.is_empty() or unit.owner != pid or not SimEngine.can_see_unit(pid, unit):
			continue
		var on_screen: bool = view.contains(unit.pos, SimEngine.tick)
		if on_screen:
			view.selected[tag] = true
		if on_screen or (targeted and view.selected.has(tag)):
			chosen.append(tag)
	if chosen.is_empty():
		look_at(pid, actor.pos)
		return {"ok": false, "camera_pending": true}
	if targeted and not view.contains(point, SimEngine.tick):
		if view.contains(actor.pos, SimEngine.tick) and not view.selection_pan:
			view.acted(SimEngine.tick)
			view.selection_pan = true
		look_at(pid, point)
		return {"ok": false, "camera_pending": true}
	var result := SimEngine.issue_command(chosen, command, point, target_tag, extra, queued, stay_on_route)
	if record_orders:
		recorded_orders.append([chosen, command, point.x, point.y, target_tag, extra, queued, stay_on_route])
	if result.ok:
		view.acted(SimEngine.tick)
	return result

func set_defense_intercept(soldier: Dictionary, center: Vector2, radius_squared: float) -> void:
	soldier.orders[0]["_defense_intercept"] = {"origin": soldier.pos, "center": center, "radius_squared": radius_squared}
	if record_orders:
		recorded_orders.append(["intercept", soldier.tag, center.x, center.y, radius_squared])

func set_attack_arrival(soldier: Dictionary) -> void:
	soldier.orders[0]["arrival_radius"] = 0.45
	if record_orders:
		recorded_orders.append(["arrival", soldier.tag])

func harvest(worker: Dictionary, preferred: Dictionary = {}) -> Dictionary:
	var patch := SimEngine._worker_crystal(worker, preferred)
	if patch.is_empty() or not SimEngine.can_see_position(worker.owner, patch.pos):
		return {"ok": false}
	return issue_order([worker.tag], "harvest", patch.pos, patch.tag)

func set_skirmish_directive(pid: int, difficulty: String, strategy: String) -> void:
	player_directives[pid] = {"enabled": true, "mode": "skirmish", "difficulty": difficulty, "strategy": strategy}

# RTSCommanderAI.gd — Built-in scripted AI director (the same directives are exposed over the bot API)
# Supports all 3 Factions (Player 1 = Humans, Player 2 = Monsters, Player 3 = Aliens):
# - "stutter_step_kite": Humans Riflemen/Breachers fire (`damage_point`), immediately cancel `backswing` (recovery) by stepping
#   away from melee Skitterlings while `weapon_cooldown` ticks down, then fire again!
# - "phase_skirmisher_micro": Aliens Skirmishers & Sunblades engage; when a Skirmisher's Aegis Shields drop to 0,
#   it immediately casts `phase_step` backward 10 units behind the healthy front line so enemy focus-fire resets!
# - "swarm_rush": Monsters Skitterling/Bile Crawler/Blight Hurler aggressive surround & attack-move
# - "macro_build": Harvest crystal/gas, auto-train units from Muster Hall/Waystone/Brood Nest
# - "emplace_defend": Automatically morph Howitzers into Emplaced Mode and hold choke point

var player_directives: Dictionary = {
	1: {"enabled": false, "mode": "idle", "target_pos": Vector2(64.0, 48.0)},
	2: {"enabled": false, "mode": "idle", "target_pos": Vector2(36.0, 48.0)},
	3: {"enabled": false, "mode": "idle", "target_pos": Vector2(64.0, 48.0)}
}

func configure_from_scenario(directives: Array) -> void:
	_views.clear()
	player_directives = {
		1: {"enabled": false, "mode": "idle", "target_pos": Vector2(64.0, 48.0)},
		2: {"enabled": false, "mode": "idle", "target_pos": Vector2(36.0, 48.0)},
		3: {"enabled": false, "mode": "idle", "target_pos": Vector2(64.0, 48.0)}
	}
	for d in directives:
		var pid = int(d.get("player", d.get("owner", 2)))
		var mode = str(d.get("mode", d.get("strategy", "swarm_rush"))).to_lower()
		var tx = float(d.get("target_x", 64.0 if pid != 2 else 36.0))
		var ty = float(d.get("target_y", 48.0))
		player_directives[pid] = {
			"enabled": bool(d.get("enabled", true)),
			"mode": mode,
			"target_pos": Vector2(tx, ty),
			"use_surge": bool(d.get("use_surge", true))
		}

func set_directive(player_id: int, mode: String, enabled: bool = true, target_pos: Vector2 = Vector2(64.0, 48.0)) -> void:
	player_directives[player_id] = {
		"enabled": enabled,
		"mode": mode.to_lower(),
		"target_pos": target_pos,
		"use_surge": true
	}

func step_ai(_dt: float) -> void:
	for pid in [1, 2, 3]:
		var cfg = player_directives.get(pid, {})
		if not bool(cfg.get("enabled", false)):
			continue
		var view := _view(pid)
		if not view.center.is_finite():
			# Start at the seat's base, or at its first controlled unit in a scenario.
			var start: Dictionary = SimEngine.match_state.get("assigned_starts", {})
			if start.has(str(pid)):
				var site: Dictionary = SimEngine.match_state.starts[start[str(pid)]]
				view.center = Vector2(site.x, site.y)
			else:
				for unit in SimEngine.units.values():
					if unit.owner == pid:
						view.center = unit.pos
						break
		var mode = str(cfg.get("mode", "idle"))
		match mode:
			"skirmish":
				if SimEngine.tick % 16 == 0:
					_run_howitzer_micro(pid, false)
				skirmish_ai.step_player(pid, cfg)
			"stutter_step_kite", "kiting":
				_run_stutter_step_kite(pid, bool(cfg.get("use_surge", true)))
			"phase_skirmisher_micro", "alien_micro", "phase_micro":
				_run_phase_skirmisher_micro(pid, cfg.get("target_pos", Vector2(64.0, 48.0)))
			"swarm_rush", "attack_all":
				_run_swarm_rush(pid, cfg.get("target_pos", Vector2(36.0, 48.0)))
			"macro_build", "colony_macro":
				_run_macro_build(pid)
				_run_stutter_step_kite(pid, true)
			"emplace_defend":
				_run_howitzer_micro(pid, true)

func _run_stutter_step_kite(pid: int, use_surge: bool) -> void:
	var enemies: Array[Dictionary] = []
	var my_ranged: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["hp"] <= 0.0:
			continue
		if u["owner"] != pid and sees_enemy(pid, u) and not u["is_structure"]:
			enemies.append(u)
		elif u["owner"] == pid and u["unit_type"] in ["rifleman", "breacher"]:
			my_ranged.append(u)

	if enemies.is_empty() or my_ranged.is_empty():
		return

	for u in my_ranged:
		var closest_e: Dictionary = {}
		var closest_d: float = 999999.0
		for e in enemies:
			var d = u["pos"].distance_to(e["pos"])
			if d < closest_d:
				closest_d = d
				closest_e = e
		if closest_e.is_empty():
			continue

		if use_surge and closest_d <= 15.0 and u["surge_timer"] <= 0.0 and u["hp"] > 20.0:
			issue_order([u["tag"]], "surge")

		if (u["attack_state"] == "backswing" or u["weapon_cooldown"] > 0.08) and closest_d < 9.5:
			var away_dir = (u["pos"] - closest_e["pos"]).normalized()
			if away_dir.length_squared() < 0.01:
				away_dir = Vector2.LEFT if pid == 1 else Vector2.RIGHT
			var kite_pos = u["pos"] + away_dir * 5.0
			issue_order([u["tag"]], "move", kite_pos)
		elif u["weapon_cooldown"] <= 0.05 and u["attack_state"] == "idle":
			issue_order([u["tag"]], "attack_target", closest_e["pos"], closest_e["tag"])

func _run_phase_skirmisher_micro(pid: int, fallback_target: Vector2) -> void:
	var enemies: Array[Dictionary] = []
	var my_aliens: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["hp"] <= 0.0:
			continue
		if u["owner"] != pid and sees_enemy(pid, u) and not u["is_structure"]:
			enemies.append(u)
		elif u["owner"] == pid and not u["is_structure"] and not u["is_worker"]:
			my_aliens.append(u)

	if my_aliens.is_empty():
		return

	for u in my_aliens:
		var closest_e: Dictionary = {}
		var closest_d: float = 999999.0
		for e in enemies:
			var d = u["pos"].distance_to(e["pos"])
			if d < closest_d:
				closest_d = d
				closest_e = e

		if closest_e.is_empty():
			if u["orders"].is_empty():
				issue_order([u["tag"]], "attack_move", fallback_target)
			continue

		# Sunblade Charge burst when closing into melee
		if u["unit_type"] == "sunblade" and closest_d <= 12.0 and u["charge_timer"] <= 0.0:
			issue_order([u["tag"]], "charge")

		# Phase Step Skirmisher micro:
		# When a Skirmisher's Aegis Shields are depleted (`shields <= 10.0`) and `phase_cooldown <= 0.0`,
		# Phase Step 11 units away from the enemy so shields can regenerate while healthy Skirmishers tank!
		if u["unit_type"] == "skirmisher" and u["shields"] <= 10.0 and u["phase_cooldown"] <= 0.0:
			var retreat_dir = (u["pos"] - closest_e["pos"]).normalized()
			if retreat_dir.length_squared() < 0.01:
				retreat_dir = Vector2.RIGHT
			var phase_dest = u["pos"] + retreat_dir * 11.0
			issue_order([u["tag"]], "phase_step", phase_dest)
			continue

		if u["weapon_cooldown"] <= 0.05 and u["attack_state"] == "idle":
			issue_order([u["tag"]], "attack_target", closest_e["pos"], closest_e["tag"])

func _run_swarm_rush(pid: int, fallback_target: Vector2) -> void:
	var enemy_targets: Array[Dictionary] = []
	var attackers: Array[int] = []
	for u in SimEngine.units.values():
		if u.owner != 0 and u.owner != pid and sees_enemy(pid, u) and u.hp > 0.0:
			enemy_targets.append(u)
		elif u["owner"] == pid and not u["is_structure"] and not u["is_worker"]:
			if u["orders"].is_empty():
				attackers.append(u["tag"])

	if attackers.is_empty():
		return

	var target_pos = fallback_target
	if enemy_targets.size() > 0:
		enemy_targets.sort_custom(func(a, b): return a["is_structure"] == false and b["is_structure"] == true)
		target_pos = enemy_targets[0]["pos"]

	issue_order(attackers, "attack_move", target_pos)

func _run_macro_build(pid: int) -> void:
	var p = SimEngine.players.get(pid, {})
	if p.is_empty():
		return

	for u in SimEngine.units.values():
		if u["owner"] == pid and u["is_worker"] and u["orders"].is_empty():
			harvest(u)

	for u in SimEngine.units.values():
		if u["owner"] == pid and u["build_progress"] >= 1.0 and u["production_queue"].size() < 2:
			if u["unit_type"] == "muster_hall" and p["crystal"] >= 50 and p["supply_used"] < p["supply_cap"]:
				issue_order([u["tag"]], "train_rifleman")
			elif u["unit_type"] == "waystone" and p["crystal"] >= 125 and p["aether"] >= 50 and p["supply_used"] + 2 <= p["supply_cap"]:
				issue_order([u["tag"]], "train_skirmisher")
			elif u["unit_type"] == "brood_nest" and p["crystal"] >= 25 and p["supply_used"] < p["supply_cap"]:
				issue_order([u["tag"]], "train_skitterling")

func controls_howitzers(pid: int) -> bool:
	var directive: Dictionary = player_directives.get(pid, {})
	return directive.get("enabled", false) and directive.get("mode") in ["skirmish", "emplace_defend"]

func _run_howitzer_micro(pid: int, defend: bool) -> void:
	var mortar: Dictionary = RTSData.get_unit_def("howitzer_emplaced").weapon
	for gun in SimEngine.units.values():
		if gun.owner == pid and gun.unit_type in ["howitzer", "howitzer_emplaced"] and not gun.get("hold_fire", false):
			_evaluate_howitzer(gun, mortar, defend)

func _evaluate_howitzer(gun: Dictionary, mortar: Dictionary, defend: bool) -> void:
	var deployed: bool = gun.unit_type == "howitzer_emplaced"
	var mobile_weapon: Dictionary = RTSData.get_unit_def("howitzer").weapon
	var minimum := float(mortar.min_range)
	var maximum := float(mortar.range)
	var health: float = gun.hp + gun.shields
	var horizon := clampf(float(gun.weapon_cooldown) + float(mortar.damage_point), 0.7, 1.2)
	var allies := SimEngine.query_units_in_radius(gun.pos, maximum)
	var breach: Dictionary = {}
	var incoming_dps := 0.0
	var worst_threat := 0.0
	var safe_target := false
	var committed_support := {}
	for enemy in SimEngine.query_units_in_radius(gun.pos, maximum + float(gun.radius), gun.owner):
		if enemy.owner == 0 or enemy.hp <= 0.0 or not sees_enemy(gun.owner, enemy):
			continue
		var distance := SimEngine._edge_distance(gun, enemy)
		var offset: Vector2 = enemy.pos + enemy.vel * horizon - gun.pos
		var projected := maxf(0.0, offset.length() - float(gun.radius) - float(enemy.radius))
		if distance >= minimum and projected >= minimum and distance <= maximum and SimEngine._weapon_can_hit(mortar, enemy):
			safe_target = safe_target or SimEngine._howitzer_splash_is_safe(gun, enemy, mortar)
		if minf(distance, projected) >= minimum or not SimEngine.can_attack(enemy, gun):
			continue
		var weapon := SimEngine._active_weapon(enemy)
		if minf(distance, projected) > float(weapon.get("range", 0.0)):
			continue
		var pressure := _weapon_dps(enemy, gun, weapon)
		if pressure <= 0.0 or _howitzer_has_cover(gun, enemy, allies, minf(2.0, health / pressure * 0.5), committed_support):
			continue
		incoming_dps += pressure
		if pressure > worst_threat or (is_equal_approx(pressure, worst_threat) and enemy.tag < breach.get("tag", 0)):
			breach = enemy
			worst_threat = pressure
	if safe_target:
		gun["howitzer_contact_tick"] = SimEngine.tick
	elif not gun.has("howitzer_contact_tick"):
		gun["howitzer_contact_tick"] = SimEngine.tick
	if not deployed:
		if not breach.is_empty() or SimEngine.tick < int(gun.get("howitzer_redeploy_tick", 0)) or gun.attack_state == "windup":
			return
		if defend or safe_target:
			issue_order([gun.tag], "emplace")
			gun["howitzer_contact_tick"] = SimEngine.tick
		return
	if breach.is_empty():
		if defend or safe_target or SimEngine.tick - int(gun.howitzer_contact_tick) < HOWITZER_IDLE_TICKS:
			return
	elif gun.attack_state == "windup" and safe_target and health > incoming_dps * 1.5:
		var target: Dictionary = SimEngine.units.get(gun.attack_target_tag, {})
		if not target.is_empty() and sees_enemy(gun.owner, target):
			var impact: Vector2 = target.pos + target.vel * float(gun.attack_state_timer)
			var impact_range: float = gun.pos.distance_to(impact) - float(gun.radius) - float(target.radius)
			if impact_range >= minimum and impact_range <= maximum and SimEngine._howitzer_splash_is_safe(gun, target, mortar):
				return
	if not issue_order([gun.tag], "mobilize").ok:
		return
	gun["howitzer_redeploy_tick"] = SimEngine.tick + HOWITZER_REDEPLOY_TICKS
	if not breach.is_empty():
		if incoming_dps > _weapon_dps(gun, breach, mobile_weapon) or health < incoming_dps * 1.5:
			if _retreat_howitzer(gun, breach, minimum + float(mortar.splash_radius)):
				return
		issue_order([gun.tag], "attack_target", breach.pos, breach.tag)

func _howitzer_has_cover(
	gun: Dictionary, enemy: Dictionary, nearby: Array[Dictionary], seconds: float, committed: Dictionary
) -> bool:
	var remaining: float = enemy.hp + enemy.shields
	var allocation := {}
	for ally in nearby:
		if ally.owner != gun.owner or ally.tag == gun.tag or ally.hp <= 0.0 or ally.build_progress < 1.0 or not is_on_camera(gun.owner, ally.pos):
			continue
		if ally.get("hold_fire", false) or not SimEngine.can_attack(ally, enemy):
			continue
		var weapon := SimEngine._active_weapon(ally)
		var distance := SimEngine._edge_distance(ally, enemy)
		if distance < float(weapon.get("min_range", 0.0)) or distance > float(weapon.get("range", 0.0)):
			continue
		if float(weapon.get("friendly_splash", 0.0)) > 0.0 and not SimEngine._howitzer_splash_is_safe(ally, enemy, weapon):
			continue
		var dps := _weapon_dps(ally, enemy, weapon)
		if dps <= 0.0:
			continue
		var occupied := float(committed.get(ally.tag, 0.0))
		var available := maxf(0.0, seconds - float(ally.weapon_cooldown) - occupied)
		var used := minf(available, remaining / dps)
		allocation[ally.tag] = occupied + used
		remaining -= used * dps
		if remaining <= 0.01:
			committed.merge(allocation, true)
			return true
	return false

func _weapon_dps(attacker: Dictionary, target: Dictionary, weapon: Dictionary) -> float:
	if weapon.is_empty():
		return 0.0
	var damage := float(weapon.damage) + float(SimEngine.unit_upgrade_level(attacker, "weapons"))
	var bonus: Dictionary = weapon.get("bonus", {})
	for attribute in bonus:
		if attribute in target.attributes:
			damage += float(bonus[attribute])
	if target.shields <= 0.0:
		damage -= float(target.armor) + float(SimEngine.unit_upgrade_level(target, "armor"))
	return maxf(0.5, damage) / maxf(0.1, float(weapon.period))

func _retreat_howitzer(gun: Dictionary, threat: Dictionary, distance: float) -> bool:
	var away: Vector2 = gun.pos.direction_to(threat.pos) * -1.0
	if away.is_zero_approx():
		away = Vector2.from_angle(float(gun.facing) + PI)
	for turn in [0.0, PI / 4.0, -PI / 4.0]:
		var goal: Vector2 = gun.pos + away.rotated(turn) * distance
		var path := SimEngine.compute_smooth_path(gun.pos, goal, gun.radius, false, 1.0)
		if not path.is_empty() and path.back().distance_to(goal) <= 1.0:
			return issue_order([gun.tag], "move", goal).ok
	return false
