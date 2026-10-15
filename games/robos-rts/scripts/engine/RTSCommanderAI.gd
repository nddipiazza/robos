extends Node

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
		var mode = str(cfg.get("mode", "idle"))
		match mode:
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
				_run_emplace_defend(pid)

func _run_stutter_step_kite(pid: int, use_surge: bool) -> void:
	var enemies: Array[Dictionary] = []
	var my_ranged: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["hp"] <= 0.0:
			continue
		if u["owner"] != pid and not u["is_structure"]:
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
			SimEngine.issue_command([u["tag"]], "surge")

		if (u["attack_state"] == "backswing" or u["weapon_cooldown"] > 0.08) and closest_d < 9.5:
			var away_dir = (u["pos"] - closest_e["pos"]).normalized()
			if away_dir.length_squared() < 0.01:
				away_dir = Vector2.LEFT if pid == 1 else Vector2.RIGHT
			var kite_pos = u["pos"] + away_dir * 5.0
			SimEngine.issue_command([u["tag"]], "move", kite_pos)
		elif u["weapon_cooldown"] <= 0.05 and u["attack_state"] == "idle":
			SimEngine.issue_command([u["tag"]], "attack_target", closest_e["pos"], closest_e["tag"])

func _run_phase_skirmisher_micro(pid: int, fallback_target: Vector2) -> void:
	var enemies: Array[Dictionary] = []
	var my_aliens: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["hp"] <= 0.0:
			continue
		if u["owner"] != pid and not u["is_structure"]:
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
				SimEngine.issue_command([u["tag"]], "attack_move", fallback_target)
			continue

		# Sunblade Charge burst when closing into melee
		if u["unit_type"] == "sunblade" and closest_d <= 12.0 and u["charge_timer"] <= 0.0:
			SimEngine.issue_command([u["tag"]], "charge")

		# Phase Step Skirmisher micro:
		# When a Skirmisher's Aegis Shields are depleted (`shields <= 10.0`) and `phase_cooldown <= 0.0`,
		# Phase Step 11 units away from the enemy so shields can regenerate while healthy Skirmishers tank!
		if u["unit_type"] == "skirmisher" and u["shields"] <= 10.0 and u["phase_cooldown"] <= 0.0:
			var retreat_dir = (u["pos"] - closest_e["pos"]).normalized()
			if retreat_dir.length_squared() < 0.01:
				retreat_dir = Vector2.RIGHT
			var phase_dest = u["pos"] + retreat_dir * 11.0
			SimEngine.issue_command([u["tag"]], "phase_step", phase_dest)
			continue

		if u["weapon_cooldown"] <= 0.05 and u["attack_state"] == "idle":
			SimEngine.issue_command([u["tag"]], "attack_target", closest_e["pos"], closest_e["tag"])

func _run_swarm_rush(pid: int, fallback_target: Vector2) -> void:
	var enemy_targets: Array[Dictionary] = []
	var attackers: Array[int] = []
	for u in SimEngine.units.values():
		if u["owner"] != pid and u["hp"] > 0.0:
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

	SimEngine.issue_command(attackers, "attack_move", target_pos)

func _run_macro_build(pid: int) -> void:
	var p = SimEngine.players.get(pid, {})
	if p.is_empty():
		return

	for u in SimEngine.units.values():
		if u["owner"] == pid and u["is_worker"] and u["orders"].is_empty():
			SimEngine.issue_SmartHarvest(u["tag"])

	for u in SimEngine.units.values():
		if u["owner"] == pid and u["build_progress"] >= 1.0 and u["production_queue"].size() < 2:
			if u["unit_type"] == "muster_hall" and p["crystal"] >= 50 and p["supply_used"] < p["supply_cap"]:
				SimEngine.issue_command([u["tag"]], "train_rifleman")
			elif u["unit_type"] == "waystone" and p["crystal"] >= 125 and p["aether"] >= 50 and p["supply_used"] + 2 <= p["supply_cap"]:
				SimEngine.issue_command([u["tag"]], "train_skirmisher")
			elif u["unit_type"] == "brood_nest" and p["crystal"] >= 25 and p["supply_used"] < p["supply_cap"]:
				SimEngine.issue_command([u["tag"]], "train_skitterling")

func _run_emplace_defend(pid: int) -> void:
	for u in SimEngine.units.values():
		if u["owner"] == pid and u["unit_type"] == "howitzer":
			SimEngine.issue_command([u["tag"]], "emplace")
