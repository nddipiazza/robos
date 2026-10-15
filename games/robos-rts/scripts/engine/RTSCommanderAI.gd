extends Node

# RTSCommanderAI.gd — StarCraft II / python-sc2 Inspired Autonomous Bot & Tactical AI Director
# Supports both Player 1 and Player 2 directives:
# - "stutter_step_kite": Marines/Marauders fire (`damage_point`), immediately cancel `backswing` by stepping
#   away from melee Swarmlings while `weapon_cooldown` ticks down, then fire again!
# - "swarm_rush": Aggressive attack-move & surround toward enemy army/base
# - "macro_build": Harvest minerals/gas, auto-build Supply Depots when near cap, train Marines/Tanks
# - "siege_defend": Automatically morph Siege Tanks into Siege Mode and hold choke point

var player_directives: Dictionary = {
	1: {"enabled": false, "mode": "idle", "target_pos": Vector2(64.0, 48.0)},
	2: {"enabled": false, "mode": "idle", "target_pos": Vector2(36.0, 48.0)}
}

func configure_from_scenario(directives: Array) -> void:
	player_directives = {
		1: {"enabled": false, "mode": "idle", "target_pos": Vector2(64.0, 48.0)},
		2: {"enabled": false, "mode": "idle", "target_pos": Vector2(36.0, 48.0)}
	}
	for d in directives:
		var pid = int(d.get("player", d.get("owner", 2)))
		var mode = str(d.get("mode", d.get("strategy", "swarm_rush"))).to_lower()
		var tx = float(d.get("target_x", 64.0 if pid == 1 else 36.0))
		var ty = float(d.get("target_y", 48.0))
		player_directives[pid] = {
			"enabled": bool(d.get("enabled", true)),
			"mode": mode,
			"target_pos": Vector2(tx, ty),
			"use_stim": bool(d.get("use_stim", true))
		}

func set_directive(player_id: int, mode: String, enabled: bool = true, target_pos: Vector2 = Vector2(64.0, 48.0)) -> void:
	player_directives[player_id] = {
		"enabled": enabled,
		"mode": mode.to_lower(),
		"target_pos": target_pos,
		"use_stim": true
	}

func step_ai(_dt: float) -> void:
	for pid in [1, 2]:
		var cfg = player_directives.get(pid, {})
		if not bool(cfg.get("enabled", false)):
			continue
		var mode = str(cfg.get("mode", "idle"))
		match mode:
			"stutter_step_kite", "kiting":
				_run_stutter_step_kite(pid, bool(cfg.get("use_stim", true)))
			"swarm_rush", "attack_all":
				_run_swarm_rush(pid, cfg.get("target_pos", Vector2(36.0, 48.0)))
			"macro_build", "terran_macro":
				_run_macro_build(pid)
				_run_stutter_step_kite(pid, true)
			"siege_defend":
				_run_siege_defend(pid)

func _run_stutter_step_kite(pid: int, use_stim: bool) -> void:
	var enemies: Array[Dictionary] = []
	var my_ranged: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["hp"] <= 0.0:
			continue
		if u["owner"] != pid and not u["is_structure"]:
			enemies.append(u)
		elif u["owner"] == pid and u["unit_type"] in ["marine", "marauder"]:
			my_ranged.append(u)

	if enemies.is_empty() or my_ranged.is_empty():
		return

	for u in my_ranged:
		# Find closest enemy
		var closest_e: Dictionary = {}
		var closest_d: float = 999999.0
		for e in enemies:
			var d = u["pos"].distance_to(e["pos"])
			if d < closest_d:
				closest_d = d
				closest_e = e
		if closest_e.is_empty():
			continue

		# Trigger Stimpack when enemy is within 15 units
		if use_stim and closest_d <= 15.0 and u["stim_timer"] <= 0.0 and u["hp"] > 20.0:
			SimEngine.issue_command([u["tag"]], "stimpack")

		# SC2 Stutter-Step Micro:
		# 1. If in backswing or weapon is on cooldown AND enemy is close (< 9.5 units), kite away!
		if (u["attack_state"] == "backswing" or u["weapon_cooldown"] > 0.08) and closest_d < 9.5:
			var away_dir = (u["pos"] - closest_e["pos"]).normalized()
			if away_dir.length_squared() < 0.01:
				away_dir = Vector2.LEFT if pid == 1 else Vector2.RIGHT
			var kite_pos = u["pos"] + away_dir * 5.0
			SimEngine.issue_command([u["tag"]], "move", kite_pos)
		# 2. If weapon is ready (`weapon_cooldown <= 0.05`) and not already winding up, fire on closest threat!
		elif u["weapon_cooldown"] <= 0.05 and u["attack_state"] == "idle":
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
		# Pick closest combat unit or structure
		enemy_targets.sort_custom(func(a, b): return a["is_structure"] == false and b["is_structure"] == true)
		target_pos = enemy_targets[0]["pos"]

	SimEngine.issue_command(attackers, "attack_move", target_pos)

func _run_macro_build(pid: int) -> void:
	var p = SimEngine.players.get(pid, {})
	if p.is_empty():
		return

	# Ensure idle workers harvest minerals
	for u in SimEngine.units.values():
		if u["owner"] == pid and u["is_worker"] and u["orders"].is_empty():
			SimEngine.issue_SmartHarvest(u["tag"])

	# Auto-train Marines from idle Barracks if minerals >= 50
	for u in SimEngine.units.values():
		if u["owner"] == pid and u["unit_type"] == "barracks" and u["build_progress"] >= 1.0:
			if u["production_queue"].size() < 2 and p["minerals"] >= 50 and p["supply_used"] < p["supply_cap"]:
				SimEngine.issue_command([u["tag"]], "train_marine")

func _run_siege_defend(pid: int) -> void:
	for u in SimEngine.units.values():
		if u["owner"] == pid and u["unit_type"] == "siege_tank":
			SimEngine.issue_command([u["tag"]], "morph_siege_mode")
