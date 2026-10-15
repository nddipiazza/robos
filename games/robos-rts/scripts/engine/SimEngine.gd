extends Node

# SimEngine.gd — SnowPlay & StarCraft II Inspired Deterministic 64Hz RTS Simulation Engine
# Supports 3 Factions:
# - HUMANS ("humans" / Terran Vanguard): Stimpack, Lower/Raise Supply Depots, Siege Tanks, SCV Construction
# - MONSTERS ("monsters" / Xenomorph Swarm): High-speed Swarmling packs, Roaches, Ravagers
# - ALIENS ("aliens" / Celestial Armada): Regenerating Plasma Shields, Stalker Blink teleport, Zealot Charge, Thermal Lance Colossus

signal simulation_ticked(tick: int)
signal unit_spawned(unit: Dictionary)
signal unit_destroyed(unit: Dictionary)
signal projectile_fired(from_pos: Vector2, to_pos: Vector2, weapon_name: String, is_splash: bool, owner_id: int)
signal unit_blinked(from_pos: Vector2, to_pos: Vector2, unit_tag: int)
signal scenario_loaded(scenario_name: String)

const TICK_RATE: int = 64
const TICK_DT: float = 1.0 / float(TICK_RATE)
const SPATIAL_CELL_SIZE: float = 4.0
const PATH_CELL_SIZE: float = 2.0

var tick: int = 0
var sim_time: float = 0.0
var rng_seed: int = 42
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
var paused: bool = false
var rts_mode: String = "human"
var sim_speed: float = 1.0

var map_width: float = 128.0
var map_height: float = 96.0
var scenario_name: String = "Starfall Canyon — Humans vs Monsters vs Aliens"

var terrain_obstacles: Array[Rect2] = []
var high_ground_zones: Array[Rect2] = []
var ramps: Array[Rect2] = []

var players: Dictionary = {}
var next_tag: int = 1001
var units: Dictionary = {}
var resources: Dictionary = {}
var spatial_grid: Dictionary = {}
var astar_grid: AStarGrid2D = AStarGrid2D.new()
var nav_dirty: bool = true

var recent_events: Array[Dictionary] = []
var command_history: Array[Dictionary] = []
var _accum_time: float = 0.0

func _ready() -> void:
	var env_mode = OS.get_environment("RTS_MODE")
	if env_mode != "":
		rts_mode = env_mode.to_lower()
	elif DisplayServer.get_name() == "headless":
		rts_mode = "backend"
	rng.seed = rng_seed
	load_default_scenario()

func _process(delta: float) -> void:
	if rts_mode == "backend" or paused:
		return
	_accum_time += delta * sim_speed
	var max_steps = 8
	var steps = 0
	while _accum_time >= TICK_DT and steps < max_steps:
		_accum_time -= TICK_DT
		step_ticks(1)
		steps += 1

func reset_state(new_seed: int = 42, width: float = 128.0, height: float = 96.0) -> void:
	tick = 0
	sim_time = 0.0
	rng_seed = new_seed
	rng.seed = rng_seed
	map_width = width
	map_height = height
	next_tag = 1001
	units.clear()
	resources.clear()
	spatial_grid.clear()
	terrain_obstacles.clear()
	high_ground_zones.clear()
	ramps.clear()
	recent_events.clear()
	command_history.clear()

	var default_factions = {
		1: {"name": "Humans (Terran Vanguard)", "faction": "humans"},
		2: {"name": "Monsters (Xenomorph Swarm)", "faction": "monsters"},
		3: {"name": "Aliens (Celestial Armada)", "faction": "aliens"}
	}
	players.clear()
	for pid in [1, 2, 3]:
		players[pid] = {
			"id": pid,
			"name": default_factions[pid]["name"],
			"faction": default_factions[pid]["faction"],
			"minerals": 400,
			"vespene": 150,
			"supply_used": 0,
			"supply_cap": 0,
			"minerals_collected": 0,
			"vespene_collected": 0,
			"units_killed": 0,
			"units_lost": 0,
			"structures_built": 0,
			"stutter_step_cancels": 0,
			"blinks_executed": 0
		}
	_rebuild_astar_grid()

func load_default_scenario() -> void:
	reset_state(42, 128.0, 96.0)
	scenario_name = "Starfall Canyon — Humans vs Monsters vs Aliens"

	terrain_obstacles.append(Rect2(60.0, 0.0, 6.0, 34.0))
	terrain_obstacles.append(Rect2(60.0, 62.0, 6.0, 34.0))
	high_ground_zones.append(Rect2(0.0, 0.0, 60.0, 96.0))
	ramps.append(Rect2(56.0, 34.0, 14.0, 28.0))

	# Player 1: HUMANS (Terran Vanguard) at West High Ground
	spawn_unit("command_center", 1, Vector2(20.0, 48.0))
	spawn_unit("supply_depot", 1, Vector2(34.0, 34.0))
	spawn_unit("supply_depot", 1, Vector2(34.0, 62.0))
	spawn_unit("barracks", 1, Vector2(36.0, 48.0))
	spawn_unit("factory", 1, Vector2(28.0, 66.0))

	for i in range(6):
		spawn_resource("mineral_field", Vector2(10.0, 33.0 + i * 5.5), 1500)
	spawn_resource("vespene_geyser", Vector2(14.0, 68.0), 2250)
	spawn_unit("refinery", 1, Vector2(14.0, 68.0))

	for i in range(6):
		var scv = spawn_unit("scv", 1, Vector2(15.0, 35.0 + i * 3.8))
		issue_SmartHarvest(scv["tag"])

	for i in range(6):
		var row = i / 3
		var col = i % 3
		spawn_unit("marine", 1, Vector2(44.0 + col * 2.2, 43.0 + row * 2.5))
	spawn_unit("marauder", 1, Vector2(48.0, 50.0))
	spawn_unit("siege_tank", 1, Vector2(41.0, 48.0))

	# Player 2: MONSTERS (Xenomorph Swarm) at South-East Low Ground
	spawn_unit("hatchery", 2, Vector2(106.0, 68.0))
	for i in range(4):
		spawn_resource("mineral_field", Vector2(118.0, 58.0 + i * 5.5), 1500)
	for i in range(4):
		var drone = spawn_unit("drone", 2, Vector2(112.0, 60.0 + i * 4.0))
		issue_SmartHarvest(drone["tag"])
	for i in range(8):
		var row = i / 4
		var col = i % 4
		spawn_unit("swarmling", 2, Vector2(84.0 + col * 2.2, 56.0 + row * 2.5))
	spawn_unit("roach", 2, Vector2(92.0, 60.0))
	spawn_unit("ravager", 2, Vector2(94.0, 65.0))

	# Player 3: ALIENS (Celestial Armada) at North-East Outpost
	spawn_unit("nexus", 3, Vector2(104.0, 22.0))
	spawn_unit("pylon", 3, Vector2(92.0, 20.0))
	spawn_unit("gateway", 3, Vector2(90.0, 28.0))
	for i in range(3):
		spawn_resource("mineral_field", Vector2(116.0, 14.0 + i * 5.5), 1500)
	for i in range(3):
		var probe = spawn_unit("probe", 3, Vector2(110.0, 16.0 + i * 4.0))
		issue_SmartHarvest(probe["tag"])
	spawn_unit("zealot", 3, Vector2(80.0, 26.0))
	spawn_unit("zealot", 3, Vector2(80.0, 30.0))
	spawn_unit("stalker", 3, Vector2(84.0, 24.0))
	spawn_unit("stalker", 3, Vector2(84.0, 28.0))
	spawn_unit("colossus", 3, Vector2(88.0, 26.0))

	_rebuild_astar_grid()
	_recompute_supplies()
	emit_signal("scenario_loaded", scenario_name)

func load_scenario_dict(data: Dictionary) -> Dictionary:
	var s_seed = int(data.get("seed", 42))
	var map_cfg = data.get("map", {})
	var w = float(map_cfg.get("width", 128.0))
	var h = float(map_cfg.get("height", 96.0))
	reset_state(s_seed, w, h)
	scenario_name = str(data.get("name", data.get("rdfs:label", "Custom RTS Scenario")))

	for obs in map_cfg.get("obstacles", []):
		terrain_obstacles.append(Rect2(
			float(obs.get("x", 0.0)),
			float(obs.get("y", 0.0)),
			float(obs.get("w", obs.get("width", 4.0))),
			float(obs.get("h", obs.get("height", 4.0)))
		))
	for hg in map_cfg.get("high_ground", []):
		high_ground_zones.append(Rect2(
			float(hg.get("x", 0.0)),
			float(hg.get("y", 0.0)),
			float(hg.get("w", 20.0)),
			float(hg.get("h", 20.0))
		))

	var p_cfg = data.get("players", {})
	for pid_key in p_cfg.keys():
		var pid = int(pid_key)
		if players.has(pid):
			var pd = p_cfg[pid_key]
			players[pid]["minerals"] = int(pd.get("minerals", 400))
			players[pid]["vespene"] = int(pd.get("vespene", 150))
			if pd.has("faction"):
				players[pid]["faction"] = str(pd["faction"])

	for res in data.get("resources", []):
		spawn_resource(
			str(res.get("type", "mineral_field")),
			Vector2(float(res.get("x", 20.0)), float(res.get("y", 20.0))),
			int(res.get("amount", 1500)),
			str(res.get("id", ""))
		)

	for u in data.get("units", []):
		var count = int(u.get("count", 1))
		var base_x = float(u.get("x", 30.0))
		var base_y = float(u.get("y", 30.0))
		var utype = str(u.get("type", "marine"))
		var owner_id = int(u.get("owner", u.get("player", 1)))
		var spread = float(u.get("spread", 2.1))
		var cols = max(1, int(ceil(sqrt(float(count)))))
		for idx in range(count):
			var r = idx / cols
			var c = idx % cols
			var pos = Vector2(base_x + c * spread, base_y + r * spread) if count > 1 else Vector2(base_x, base_y)
			var spawned = spawn_unit(utype, owner_id, pos, str(u.get("id", "")) if count == 1 else "")
			if u.has("hp"):
				spawned["hp"] = float(u.get("hp"))
			if u.has("shields"):
				spawned["shields"] = float(u.get("shields"))
			if bool(u.get("auto_harvest", false)):
				issue_SmartHarvest(spawned["tag"])

	_rebuild_astar_grid()
	_recompute_supplies()
	RTSCommanderAI.configure_from_scenario(data.get("directives", []))
	emit_signal("scenario_loaded", scenario_name)
	return {"ok": true, "scenario": scenario_name, "unit_count": units.size()}

func spawn_resource(res_type: String, pos: Vector2, amount: int = 1500, custom_id: String = "") -> Dictionary:
	var tag = next_tag
	next_tag += 1
	var r = {
		"tag": tag,
		"id": custom_id if custom_id != "" else "%s_%d" % [res_type, tag],
		"resource_type": res_type,
		"pos": pos,
		"amount": amount,
		"radius": 1.8 if res_type == "mineral_field" else 2.6,
		"harvesters": []
	}
	resources[tag] = r
	nav_dirty = true
	return r

func spawn_unit(unit_type: String, owner_id: int, pos: Vector2, custom_id: String = "", build_progress: float = 1.0) -> Dictionary:
	var def = RTSData.get_unit_def(unit_type)
	if def.is_empty():
		push_warning("[SimEngine] Unknown unit_type: " + unit_type)
		return {}

	var tag = next_tag
	next_tag += 1
	var max_hp = float(def.get("max_hp", 45.0))
	var max_shields = float(def.get("max_shields", 0.0))
	var start_hp = max_hp if build_progress >= 1.0 else max(10.0, max_hp * build_progress)
	var start_shields = max_shields if build_progress >= 1.0 else max_shields * build_progress

	var u = {
		"tag": tag,
		"id": custom_id if custom_id != "" else "%s_%d" % [unit_type, tag],
		"unit_type": unit_type.to_lower(),
		"name": str(def.get("name", unit_type)),
		"faction": str(def.get("faction", "humans")),
		"owner": owner_id,
		"pos": pos,
		"prev_pos": pos,
		"vel": Vector2.ZERO,
		"facing": 0.0 if owner_id == 1 else PI,
		"hp": start_hp,
		"max_hp": max_hp,
		"shields": start_shields,
		"max_shields": max_shields,
		"out_of_combat_timer": 10.0,
		"armor": float(def.get("armor", 0.0)),
		"radius": float(def.get("radius", 0.85)),
		"speed": float(def.get("speed", 7.0)),
		"sight_range": float(def.get("sight_range", 20.0)),
		"push_priority": int(def.get("push_priority", 1)),
		"is_structure": bool(def.get("is_structure", false)),
		"is_walkable_structure": bool(def.get("is_walkable_structure", false)),
		"is_worker": bool(def.get("is_worker", false)),
		"is_immobile": bool(def.get("is_immobile", false)),
		"attributes": def.get("attributes", []).duplicate(),
		"orders": [],
		"path": [],
		"home_pos": pos,
		"has_home_pos": true,
		"pushed_timer": 0.0,
		"attack_state": "idle",
		"attack_state_timer": 0.0,
		"attack_target_tag": 0,
		"weapon_cooldown": 0.0,
		"stim_timer": 0.0,
		"charge_timer": 0.0,
		"blink_cooldown": 0.0,
		"slow_timer": 0.0,
		"cargo_type": "",
		"cargo_amount": 0,
		"harvest_timer": 0.0,
		"harvest_target_tag": 0,
		"build_progress": build_progress,
		"build_total_time": float(def.get("build_time", 20.0)),
		"production_queue": [],
		"rally_pos": pos + (Vector2(8.0, 0.0) if owner_id == 1 else Vector2(-8.0, 0.0)),
		"kills": 0,
		"damage_dealt": 0.0
	}
	units[tag] = u
	if u["is_structure"]:
		nav_dirty = true
	_recompute_supplies()
	emit_signal("unit_spawned", u)
	return u

func get_elevation_at(pos: Vector2) -> float:
	for rmp in ramps:
		if rmp.has_point(pos):
			var t = clampf((pos.x - rmp.position.x) / max(1.0, rmp.size.x), 0.0, 1.0)
			return lerp(2.2, 0.0, t)
	for hg in high_ground_zones:
		if hg.has_point(pos):
			return 2.2
	return 0.0

func step_ticks(count: int = 1) -> void:
	for _i in range(count):
		_step_single_tick()

func _step_single_tick() -> void:
	tick += 1
	sim_time = float(tick) * TICK_DT

	if nav_dirty:
		_rebuild_astar_grid()
		nav_dirty = false

	_rebuild_spatial_grid()

	if tick % 8 == 0:
		RTSCommanderAI.step_ai(TICK_DT * 8.0)

	_update_structures(TICK_DT)

	var all_tags = units.keys()
	all_tags.sort()
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u = units[tag]
		u["prev_pos"] = u["pos"]
		_update_unit_timers(u, TICK_DT)
		if u["is_structure"]:
			continue
		_update_unit_orders(u, TICK_DT)

	_apply_steering_and_push_resolution(all_tags, TICK_DT)
	emit_signal("simulation_ticked", tick)

func _rebuild_astar_grid() -> void:
	var cols = int(ceil(map_width / PATH_CELL_SIZE))
	var rows = int(ceil(map_height / PATH_CELL_SIZE))
	astar_grid.region = Rect2i(0, 0, cols, rows)
	astar_grid.cell_size = Vector2(PATH_CELL_SIZE, PATH_CELL_SIZE)
	astar_grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	astar_grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	astar_grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	astar_grid.update()

	for obs in terrain_obstacles:
		_set_rect_solid(obs, true)

	for u in units.values():
		if u["is_structure"] and not u["is_walkable_structure"]:
			var r = u["radius"]
			var rect = Rect2(u["pos"].x - r, u["pos"].y - r, r * 2.0, r * 2.0)
			_set_rect_solid(rect, true)

func _set_rect_solid(rect: Rect2, solid: bool) -> void:
	var x0 = clampi(int(floor(rect.position.x / PATH_CELL_SIZE)), 0, astar_grid.region.size.x - 1)
	var y0 = clampi(int(floor(rect.position.y / PATH_CELL_SIZE)), 0, astar_grid.region.size.y - 1)
	var x1 = clampi(int(ceil(rect.end.x / PATH_CELL_SIZE)) - 1, 0, astar_grid.region.size.x - 1)
	var y1 = clampi(int(ceil(rect.end.y / PATH_CELL_SIZE)) - 1, 0, astar_grid.region.size.y - 1)
	for x in range(x0, x1 + 1):
		for y in range(y0, y1 + 1):
			astar_grid.set_point_solid(Vector2i(x, y), solid)

func compute_smooth_path(start_pos: Vector2, end_pos: Vector2, unit_radius: float = 0.85) -> Array[Vector2]:
	if _has_clear_line_of_walk(start_pos, end_pos, unit_radius):
		return [end_pos]

	var cols = astar_grid.region.size.x
	var rows = astar_grid.region.size.y
	var s_cell = Vector2i(
		clampi(int(start_pos.x / PATH_CELL_SIZE), 0, cols - 1),
		clampi(int(start_pos.y / PATH_CELL_SIZE), 0, rows - 1)
	)
	var e_cell = Vector2i(
		clampi(int(end_pos.x / PATH_CELL_SIZE), 0, cols - 1),
		clampi(int(end_pos.y / PATH_CELL_SIZE), 0, rows - 1)
	)
	s_cell = _find_nearest_walkable_cell(s_cell)
	e_cell = _find_nearest_walkable_cell(e_cell)

	var raw_pts = astar_grid.get_point_path(s_cell, e_cell)
	if raw_pts.size() == 0:
		return [end_pos]

	var waypoints: Array[Vector2] = []
	for pt in raw_pts:
		waypoints.append(Vector2(pt.x + PATH_CELL_SIZE * 0.5, pt.y + PATH_CELL_SIZE * 0.5))
	waypoints[waypoints.size() - 1] = end_pos

	if waypoints.size() <= 2:
		return [end_pos]

	var smoothed: Array[Vector2] = []
	var anchor: Vector2 = start_pos
	var idx: int = 0
	while idx < waypoints.size() - 1:
		var furthest = idx
		for probe in range(waypoints.size() - 1, idx, -1):
			if _has_clear_line_of_walk(anchor, waypoints[probe], unit_radius):
				furthest = probe
				break
		smoothed.append(waypoints[furthest])
		anchor = waypoints[furthest]
		idx = furthest
		if idx == waypoints.size() - 1:
			break
	if smoothed.is_empty() or smoothed[smoothed.size() - 1].distance_to(end_pos) > 0.1:
		smoothed.append(end_pos)
	return smoothed

func _find_nearest_walkable_cell(cell: Vector2i) -> Vector2i:
	if not astar_grid.is_point_solid(cell):
		return cell
	var cols = astar_grid.region.size.x
	var rows = astar_grid.region.size.y
	for rad in range(1, 10):
		for dx in range(-rad, rad + 1):
			for dy in range(-rad, rad + 1):
				var c = Vector2i(clampi(cell.x + dx, 0, cols - 1), clampi(cell.y + dy, 0, rows - 1))
				if not astar_grid.is_point_solid(c):
					return c
	return cell

func _has_clear_line_of_walk(a: Vector2, b: Vector2, radius: float) -> bool:
	var dist = a.distance_to(b)
	if dist < 0.5:
		return true
	var steps = int(ceil(dist / (PATH_CELL_SIZE * 0.6)))
	for i in range(1, steps + 1):
		var p = a.lerp(b, float(i) / float(steps))
		if _is_point_blocked_by_static(p, radius * 0.7):
			return false
	return true

func _is_point_blocked_by_static(p: Vector2, radius: float) -> bool:
	if p.x < radius or p.y < radius or p.x > map_width - radius or p.y > map_height - radius:
		return true
	for obs in terrain_obstacles:
		var expanded = obs.grow(radius * 0.75)
		if expanded.has_point(p):
			return true
	for u in units.values():
		if u["is_structure"] and not u["is_walkable_structure"]:
			if p.distance_to(u["pos"]) < (u["radius"] + radius * 0.65):
				return true
	return false

func _rebuild_spatial_grid() -> void:
	spatial_grid.clear()
	for tag in units.keys():
		var u = units[tag]
		var cell = Vector2i(int(floor(u["pos"].x / SPATIAL_CELL_SIZE)), int(floor(u["pos"].y / SPATIAL_CELL_SIZE)))
		if not spatial_grid.has(cell):
			spatial_grid[cell] = []
		spatial_grid[cell].append(tag)

func query_units_in_radius(center: Vector2, radius: float) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var rad_cells = int(ceil((radius + 4.5) / SPATIAL_CELL_SIZE))
	var cx = int(floor(center.x / SPATIAL_CELL_SIZE))
	var cy = int(floor(center.y / SPATIAL_CELL_SIZE))
	for dx in range(-rad_cells, rad_cells + 1):
		for dy in range(-rad_cells, rad_cells + 1):
			var cell = Vector2i(cx + dx, cy + dy)
			if spatial_grid.has(cell):
				for tag in spatial_grid[cell]:
					if units.has(tag):
						var u = units[tag]
						if center.distance_to(u["pos"]) <= radius + u["radius"]:
							result.append(u)
	return result

func _update_structures(dt: float) -> void:
	for u in units.values():
		if not u["is_structure"]:
			continue
		if u["build_progress"] < 1.0:
			continue
		var queue: Array = u["production_queue"]
		if queue.size() > 0:
			var item = queue[0]
			item["progress"] += dt
			if item["progress"] >= item["total_time"]:
				var utype = str(item["unit_type"])
				queue.pop_front()
				var spawn_dir = (u["rally_pos"] - u["pos"]).normalized()
				if spawn_dir.length_squared() < 0.01:
					spawn_dir = Vector2.RIGHT if u["owner"] == 1 else Vector2.LEFT
				var spawn_pos = u["pos"] + spawn_dir * (u["radius"] + 1.8)
				var new_unit = spawn_unit(utype, u["owner"], spawn_pos)
				if not new_unit.is_empty() and u["rally_pos"].distance_to(u["pos"]) > u["radius"] + 1.5:
					issue_command([new_unit["tag"]], "move", u["rally_pos"])

func _update_unit_timers(u: Dictionary, dt: float) -> void:
	if u["stim_timer"] > 0.0:
		u["stim_timer"] = max(0.0, u["stim_timer"] - dt)
	if u["charge_timer"] > 0.0:
		u["charge_timer"] = max(0.0, u["charge_timer"] - dt)
	if u["blink_cooldown"] > 0.0:
		u["blink_cooldown"] = max(0.0, u["blink_cooldown"] - dt)
	if u["slow_timer"] > 0.0:
		u["slow_timer"] = max(0.0, u["slow_timer"] - dt)

	# SC2 Alien / Protoss Plasma Shield Regeneration (2.0 shields/sec after 3.5s out of combat)
	u["out_of_combat_timer"] += dt
	if u["max_shields"] > 0.0 and u["shields"] < u["max_shields"] and u["out_of_combat_timer"] >= 3.5:
		u["shields"] = min(u["max_shields"], u["shields"] + 6.0 * dt)

	var atk_speed_mult = 1.5 if u["stim_timer"] > 0.0 else 1.0
	if u["weapon_cooldown"] > 0.0:
		u["weapon_cooldown"] = max(0.0, u["weapon_cooldown"] - dt * atk_speed_mult)

	if u["pushed_timer"] > 0.0:
		u["pushed_timer"] = max(0.0, u["pushed_timer"] - dt)

func _update_unit_orders(u: Dictionary, dt: float) -> void:
	u["vel"] = Vector2.ZERO

	if u["attack_state"] == "windup":
		var target = units.get(u["attack_target_tag"], {})
		if target.is_empty() or target["hp"] <= 0.0:
			u["attack_state"] = "idle"
		else:
			u["attack_state_timer"] -= dt
			u["facing"] = (target["pos"] - u["pos"]).angle()
			if u["attack_state_timer"] <= 0.0:
				_execute_weapon_hit(u, target)
				var def = RTSData.get_unit_def(u["unit_type"])
				var wpn = def.get("weapon", {})
				u["weapon_cooldown"] = float(wpn.get("period", 0.8))
				u["attack_state"] = "backswing"
				u["attack_state_timer"] = float(wpn.get("backswing", 0.25))
			return

	elif u["attack_state"] == "backswing":
		u["attack_state_timer"] -= dt
		if u["attack_state_timer"] <= 0.0:
			u["attack_state"] = "idle"
		if u["orders"].size() > 0 and u["orders"][0]["type"] != "move":
			return

	if u["orders"].is_empty():
		var enemy = _find_best_attack_target(u, false)
		if not enemy.is_empty():
			var wpn_range = _get_weapon_range(u)
			var dist_edge = _edge_distance(u, enemy)
			if dist_edge <= wpn_range:
				_begin_attack_on(u, enemy)
				return
			elif not u["is_immobile"] and not u["is_worker"]:
				_move_toward_point(u, enemy["pos"], dt)
				return

		if u["has_home_pos"] and u["pushed_timer"] <= 0.0 and not u["is_immobile"]:
			var d_home = u["pos"].distance_to(u["home_pos"])
			if d_home > 0.35 and d_home < 6.0:
				_move_toward_point(u, u["home_pos"], dt)
		return

	var order = u["orders"][0]
	var otype = str(order.get("type", "move"))

	match otype:
		"move":
			var target_pos: Vector2 = order.get("target_pos", u["pos"])
			var arrival_rad: float = float(order.get("arrival_radius", 0.9))
			if u["pos"].distance_to(target_pos) <= arrival_rad:
				u["orders"].pop_front()
				u["path"].clear()
				u["home_pos"] = u["pos"]
				u["has_home_pos"] = true
			else:
				if _should_settle_in_group_arrival(u, target_pos, arrival_rad):
					u["orders"].pop_front()
					u["path"].clear()
					u["home_pos"] = u["pos"]
					u["has_home_pos"] = true
				else:
					_follow_order_path(u, target_pos, dt)

		"hold_position":
			var enemy = _find_best_attack_target(u, true)
			if not enemy.is_empty():
				_begin_attack_on(u, enemy)

		"attack_move":
			var target_pos: Vector2 = order.get("target_pos", u["pos"])
			var enemy = _find_best_attack_target(u, false)
			if not enemy.is_empty():
				var wpn_range = _get_weapon_range(u)
				if _edge_distance(u, enemy) <= wpn_range:
					_begin_attack_on(u, enemy)
				else:
					_move_toward_point(u, enemy["pos"], dt)
			else:
				var arrival_rad: float = float(order.get("arrival_radius", 1.5))
				if u["pos"].distance_to(target_pos) <= arrival_rad:
					u["orders"].pop_front()
					u["home_pos"] = u["pos"]
				else:
					_follow_order_path(u, target_pos, dt)

		"attack_target":
			var t_tag = int(order.get("target_tag", 0))
			if not units.has(t_tag) or units[t_tag]["hp"] <= 0.0:
				u["orders"].pop_front()
				return
			var enemy = units[t_tag]
			var wpn_range = _get_weapon_range(u)
			if _edge_distance(u, enemy) <= wpn_range:
				_begin_attack_on(u, enemy)
			elif not u["is_immobile"]:
				_move_toward_point(u, enemy["pos"], dt)

		"harvest":
			_process_worker_harvest_order(u, order, dt)

		"build":
			_process_worker_build_order(u, order, dt)

func _process_worker_harvest_order(u: Dictionary, order: Dictionary, dt: float) -> void:
	var res_tag = int(order.get("target_tag", u["harvest_target_tag"]))
	if u["cargo_amount"] > 0:
		var th = _find_nearest_town_hall(u["owner"], u["pos"])
		if th.is_empty():
			return
		if _edge_distance(u, th) <= 1.6:
			if u["cargo_type"] == "vespene":
				players[u["owner"]]["vespene"] += u["cargo_amount"]
				players[u["owner"]]["vespene_collected"] += u["cargo_amount"]
			else:
				players[u["owner"]]["minerals"] += u["cargo_amount"]
				players[u["owner"]]["minerals_collected"] += u["cargo_amount"]
			u["cargo_amount"] = 0
			u["cargo_type"] = ""
		else:
			_move_toward_point(u, th["pos"], dt)
		return

	var target_entity: Dictionary = {}
	var is_gas: bool = false
	if resources.has(res_tag):
		target_entity = resources[res_tag]
		is_gas = (target_entity["resource_type"] == "vespene_geyser")
	elif units.has(res_tag) and units[res_tag].get("unit_type") == "refinery":
		target_entity = units[res_tag]
		is_gas = true
	else:
		var nearest_res = _find_nearest_mineral(u["pos"])
		if nearest_res.is_empty():
			u["orders"].pop_front()
			return
		order["target_tag"] = nearest_res["tag"]
		u["harvest_target_tag"] = nearest_res["tag"]
		target_entity = nearest_res

	var dist = u["pos"].distance_to(target_entity["pos"]) - (u["radius"] + float(target_entity.get("radius", 1.8)))
	if dist <= 1.2:
		u["vel"] = Vector2.ZERO
		u["facing"] = (target_entity["pos"] - u["pos"]).angle()
		u["harvest_timer"] += dt
		if u["harvest_timer"] >= 1.75:
			u["harvest_timer"] = 0.0
			if is_gas:
				u["cargo_type"] = "vespene"
				u["cargo_amount"] = 4
			else:
				u["cargo_type"] = "minerals"
				u["cargo_amount"] = 5
				if resources.has(res_tag):
					resources[res_tag]["amount"] = max(0, int(resources[res_tag]["amount"]) - 5)
	else:
		_move_toward_point(u, target_entity["pos"], dt)

func _process_worker_build_order(u: Dictionary, order: Dictionary, dt: float) -> void:
	var struct_type = str(order.get("structure_type", "supply_depot"))
	var build_pos: Vector2 = order.get("target_pos", u["pos"])
	var struct_tag = int(order.get("structure_tag", 0))

	if struct_tag == 0:
		var s_def = RTSData.get_unit_def(struct_type)
		var build_rad = float(s_def.get("radius", 2.0))
		if u["pos"].distance_to(build_pos) <= build_rad + u["radius"] + 1.5:
			var m_cost = int(s_def.get("mineral_cost", 100))
			var v_cost = int(s_def.get("vespene_cost", 0))
			var p = players[u["owner"]]
			if p["minerals"] >= m_cost and p["vespene"] >= v_cost:
				p["minerals"] -= m_cost
				p["vespene"] -= v_cost
				var s_unit = spawn_unit(struct_type, u["owner"], build_pos, "", 0.1)
				order["structure_tag"] = s_unit["tag"]
				# Alien Probes warp in structures automatically and are immediately free!
				if u["unit_type"] == "probe":
					s_unit["auto_warp"] = true
					u["orders"].pop_front()
			else:
				u["orders"].pop_front()
		else:
			_move_toward_point(u, build_pos, dt)
	else:
		if not units.has(struct_tag):
			u["orders"].pop_front()
			return
		var s_unit = units[struct_tag]
		if s_unit["build_progress"] >= 1.0:
			players[u["owner"]]["structures_built"] += 1
			_recompute_supplies()
			u["orders"].pop_front()
			return
		var dist = _edge_distance(u, s_unit)
		if dist <= 1.8:
			u["vel"] = Vector2.ZERO
			u["facing"] = (s_unit["pos"] - u["pos"]).angle()
			var rate = dt / max(1.0, float(s_unit["build_total_time"]) * 0.25)
			s_unit["build_progress"] = min(1.0, s_unit["build_progress"] + rate)
			s_unit["hp"] = min(s_unit["max_hp"], s_unit["hp"] + s_unit["max_hp"] * rate)
			if s_unit["build_progress"] >= 1.0:
				players[u["owner"]]["structures_built"] += 1
				_recompute_supplies()
				u["orders"].pop_front()
		else:
			_move_toward_point(u, s_unit["pos"], dt)

func _follow_order_path(u: Dictionary, target_pos: Vector2, dt: float) -> void:
	# Colossus has Cliff-Walk ("Massive" attribute walks directly over cliffs!)
	if u["unit_type"] == "colossus":
		_move_toward_point(u, target_pos, dt)
		return

	var path: Array = u["path"]
	if path.is_empty():
		u["path"] = compute_smooth_path(u["pos"], target_pos, u["radius"])
		path = u["path"]

	if path.size() > 0:
		var wp: Vector2 = path[0]
		if u["pos"].distance_to(wp) <= max(1.1, u["radius"] * 1.2) and path.size() > 1:
			path.pop_front()
			wp = path[0]
		_move_toward_point(u, wp, dt)
	else:
		_move_toward_point(u, target_pos, dt)

func _move_toward_point(u: Dictionary, wp: Vector2, _dt: float) -> void:
	if u["is_immobile"]:
		u["vel"] = Vector2.ZERO
		return
	var dir = (wp - u["pos"])
	if dir.length_squared() < 0.001:
		u["vel"] = Vector2.ZERO
		return
	dir = dir.normalized()
	var spd = float(u["speed"])
	if u["stim_timer"] > 0.0:
		spd *= 1.5
	if u["charge_timer"] > 0.0:
		spd *= 1.8
	if u["slow_timer"] > 0.0:
		spd *= 0.5
	u["vel"] = dir * spd
	u["facing"] = dir.angle()

func _should_settle_in_group_arrival(u: Dictionary, target_pos: Vector2, base_arrival: float) -> bool:
	var dist = u["pos"].distance_to(target_pos)
	if dist > base_arrival * 2.8:
		return false
	var neighbors = query_units_in_radius(u["pos"], u["radius"] * 2.4)
	for n in neighbors:
		if n["tag"] == u["tag"] or n["owner"] != u["owner"]:
			continue
		if n["orders"].is_empty() and n["home_pos"].distance_to(target_pos) <= base_arrival * 3.0:
			if u["pos"].distance_to(n["pos"]) <= (u["radius"] + n["radius"]) * 1.35:
				return true
	return false

func _apply_steering_and_push_resolution(all_tags: Array, dt: float) -> void:
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u = units[tag]
		if u["is_structure"] or u["is_immobile"]:
			continue

		var desired_vel: Vector2 = u["vel"]
		var is_moving: bool = desired_vel.length_squared() > 0.05
		var neighbors = query_units_in_radius(u["pos"], u["radius"] + 2.6)

		var steer_force: Vector2 = Vector2.ZERO
		for n in neighbors:
			if n["tag"] == u["tag"]:
				continue
			if n["is_structure"] and n["is_walkable_structure"]:
				continue

			var delta_p: Vector2 = u["pos"] - n["pos"]
			var dist: float = delta_p.length()
			var min_sep: float = u["radius"] + n["radius"]
			if dist < 0.001:
				var angle = float((u["tag"] * 73) % 360) * PI / 180.0
				delta_p = Vector2(cos(angle), sin(angle))
				dist = 0.01

			var normal = delta_p / dist

			if is_moving and not n["is_structure"]:
				if dist < min_sep * 1.55:
					var overlap_ratio = (min_sep * 1.55 - dist) / (min_sep * 1.55)
					steer_force += normal * overlap_ratio * u["speed"] * 0.85

				if n["owner"] == u["owner"] and n["orders"].is_empty() and n["attack_state"] == "idle" and not n["is_immobile"]:
					if u["push_priority"] >= n["push_priority"] and dist < min_sep * 1.25:
						var move_dir = desired_vel.normalized()
						var perp = Vector2(-move_dir.y, move_dir.x)
						if perp.dot(n["pos"] - u["pos"]) < 0.0:
							perp = -perp
						var push_vec = (perp * 0.75 + (-normal) * 0.25).normalized()
						n["pos"] = _clamp_to_walkable(n["pos"] + push_vec * u["speed"] * dt * 0.9, n["radius"], n["unit_type"] == "colossus")
						n["pushed_timer"] = 0.35

		var final_vel = desired_vel + steer_force
		var max_spd = u["speed"] * (1.5 if u["stim_timer"] > 0.0 else 1.0) * (1.8 if u["charge_timer"] > 0.0 else 1.0) * (0.5 if u["slow_timer"] > 0.0 else 1.0)
		if final_vel.length() > max_spd and max_spd > 0.0:
			final_vel = final_vel.normalized() * max_spd

		if final_vel.length_squared() > 0.001:
			u["pos"] = _clamp_to_walkable(u["pos"] + final_vel * dt, u["radius"], u["unit_type"] == "colossus")
			u["vel"] = final_vel

	for tag in all_tags:
		if not units.has(tag):
			continue
		var u = units[tag]
		if u["is_structure"]:
			continue
		var neighbors = query_units_in_radius(u["pos"], u["radius"] + 1.8)
		for n in neighbors:
			if n["tag"] <= u["tag"]:
				continue
			if n["is_structure"] and n["is_walkable_structure"]:
				continue
			var diff: Vector2 = u["pos"] - n["pos"]
			var dist: float = diff.length()
			var min_dist: float = (u["radius"] + n["radius"]) * 0.92
			if dist < min_dist:
				var nrm = diff / dist if dist > 0.001 else Vector2.RIGHT
				var pen = min_dist - dist
				if n["is_structure"] or n["is_immobile"]:
					u["pos"] = _clamp_to_walkable(u["pos"] + nrm * pen, u["radius"], u["unit_type"] == "colossus")
				elif u["is_immobile"]:
					n["pos"] = _clamp_to_walkable(n["pos"] - nrm * pen, n["radius"], n["unit_type"] == "colossus")
				else:
					u["pos"] = _clamp_to_walkable(u["pos"] + nrm * (pen * 0.5), u["radius"], u["unit_type"] == "colossus")
					n["pos"] = _clamp_to_walkable(n["pos"] - nrm * (pen * 0.5), n["radius"], n["unit_type"] == "colossus")

func _clamp_to_walkable(p: Vector2, radius: float, ignore_cliffs: bool = false) -> Vector2:
	var res = Vector2(
		clampf(p.x, radius + 1.0, map_width - radius - 1.0),
		clampf(p.y, radius + 1.0, map_height - radius - 1.0)
	)
	if ignore_cliffs:
		return res
	for obs in terrain_obstacles:
		var exp_rect = obs.grow(radius * 0.7)
		if exp_rect.has_point(res):
			var dl = abs(res.x - exp_rect.position.x)
			var dr = abs(exp_rect.end.x - res.x)
			var dt_top = abs(res.y - exp_rect.position.y)
			var db = abs(exp_rect.end.y - res.y)
			var m = min(min(dl, dr), min(dt_top, db))
			if m == dl:
				res.x = exp_rect.position.x - 0.05
			elif m == dr:
				res.x = exp_rect.end.x + 0.05
			elif m == dt_top:
				res.y = exp_rect.position.y - 0.05
			else:
				res.y = exp_rect.end.y + 0.05
	return res

func _get_weapon_range(u: Dictionary) -> float:
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	return float(wpn.get("range", 0.0))

func _edge_distance(a: Dictionary, b: Dictionary) -> float:
	return max(0.0, a["pos"].distance_to(b["pos"]) - (float(a["radius"]) + float(b["radius"])))

func _find_best_attack_target(u: Dictionary, range_only: bool) -> Dictionary:
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return {}
	var wpn_range = float(wpn.get("range", 5.0))
	var min_range = float(wpn.get("min_range", 0.0))
	var scan_rad = wpn_range if range_only else max(wpn_range, float(u["sight_range"]))

	var candidates = query_units_in_radius(u["pos"], scan_rad + 2.5)
	var best: Dictionary = {}
	var best_score: float = -999999.0

	for c in candidates:
		if c["owner"] == u["owner"] or c["hp"] <= 0.0:
			continue
		var d_edge = _edge_distance(u, c)
		if d_edge < min_range:
			continue
		if range_only and d_edge > wpn_range:
			continue

		var prio = 200.0
		if c["is_structure"]:
			prio = 20.0
		elif c["is_worker"]:
			prio = 100.0
		var in_range_bonus = 50.0 if d_edge <= wpn_range else 0.0
		var score = prio + in_range_bonus - d_edge * 2.5 - (c["hp"] / c["max_hp"]) * 10.0
		if score > best_score:
			best_score = score
			best = c

	return best

func _begin_attack_on(u: Dictionary, target: Dictionary) -> void:
	u["vel"] = Vector2.ZERO
	u["facing"] = (target["pos"] - u["pos"]).angle()
	if u["weapon_cooldown"] > 0.0:
		return
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return
	var atk_speed_mult = 1.5 if u["stim_timer"] > 0.0 else 1.0
	u["attack_state"] = "windup"
	u["attack_target_tag"] = target["tag"]
	u["attack_state_timer"] = float(wpn.get("damage_point", 0.08)) / atk_speed_mult

func _execute_weapon_hit(attacker: Dictionary, primary_target: Dictionary) -> void:
	var def = RTSData.get_unit_def(attacker["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return

	var base_dmg = float(wpn.get("damage", 6.0))
	var bonus_dict: Dictionary = wpn.get("bonus", {})
	var splash_rad = float(wpn.get("splash_radius", 0.0))
	var slow_factor = float(wpn.get("concussive_slow", 0.0))

	_apply_damage_to_target(attacker, primary_target, base_dmg, bonus_dict, 1.0)
	if slow_factor > 0.0 and not primary_target["is_structure"]:
		primary_target["slow_timer"] = 2.0

	if splash_rad > 0.0:
		var splashed = query_units_in_radius(primary_target["pos"], splash_rad)
		for s in splashed:
			if s["tag"] == primary_target["tag"] or s["hp"] <= 0.0:
				continue
			if s["owner"] == attacker["owner"]:
				continue
			var d = primary_target["pos"].distance_to(s["pos"])
			var mult = 0.5 if d <= splash_rad * 0.5 else 0.25
			_apply_damage_to_target(attacker, s, base_dmg, bonus_dict, mult)

	var evt = {
		"tick": tick,
		"type": "weapon_fire",
		"attacker_tag": attacker["tag"],
		"target_tag": primary_target["tag"],
		"from": [attacker["pos"].x, attacker["pos"].y],
		"to": [primary_target["pos"].x, primary_target["pos"].y],
		"weapon": str(wpn.get("name", "Weapon")),
		"splash": splash_rad > 0.0,
		"owner": attacker["owner"]
	}
	recent_events.append(evt)
	if recent_events.size() > 80:
		recent_events.pop_front()
	emit_signal("projectile_fired", attacker["pos"], primary_target["pos"], str(wpn.get("name", "")), splash_rad > 0.0, attacker["owner"])

func _apply_damage_to_target(attacker: Dictionary, target: Dictionary, base_dmg: float, bonus_dict: Dictionary, mult: float) -> void:
	var dmg = base_dmg
	var attrs: Array = target.get("attributes", [])
	for attr in bonus_dict.keys():
		if attrs.has(attr):
			dmg += float(bonus_dict[attr])
	dmg = max(0.5, dmg * mult)

	target["out_of_combat_timer"] = 0.0

	# SC2 Plasma Shields absorb damage before HP!
	if target["shields"] > 0.0:
		if target["shields"] >= dmg:
			target["shields"] -= dmg
			attacker["damage_dealt"] += dmg
			return
		else:
			var overflow = dmg - target["shields"]
			attacker["damage_dealt"] += target["shields"]
			target["shields"] = 0.0
			dmg = overflow

	var hp_dmg = max(0.5, dmg - float(target.get("armor", 0.0)))
	target["hp"] = max(0.0, target["hp"] - hp_dmg)
	attacker["damage_dealt"] += hp_dmg

	if target["hp"] <= 0.0:
		attacker["kills"] += 1
		if players.has(attacker["owner"]):
			players[attacker["owner"]]["units_killed"] += 1
		if players.has(target["owner"]):
			players[target["owner"]]["units_lost"] += 1
		var dead = target.duplicate(true)
		units.erase(target["tag"])
		if dead["is_structure"]:
			nav_dirty = true
		_recompute_supplies()
		emit_signal("unit_destroyed", dead)

func issue_command(unit_tags: Array, cmd_type: String, target_pos: Vector2 = Vector2.ZERO, target_tag: int = 0, extra: String = "", queue: bool = false) -> Dictionary:
	var accepted: int = 0
	var valid_units: Array[Dictionary] = []
	for t in unit_tags:
		var tag_int = int(t)
		if units.has(tag_int):
			valid_units.append(units[tag_int])

	if valid_units.is_empty():
		return {"ok": false, "accepted": 0, "error": "No valid unit tags"}

	var group_size = valid_units.size()
	var dynamic_arrival = clampf(0.85 + sqrt(float(group_size)) * 0.65, 0.85, 5.5)

	for u in valid_units:
		var ctype = cmd_type.to_lower()

		if u["attack_state"] == "backswing" and ctype in ["move", "attack_move", "blink"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0
			if players.has(u["owner"]):
				players[u["owner"]]["stutter_step_cancels"] += 1
		elif u["attack_state"] == "windup" and ctype in ["move", "stop", "blink"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0

		if ctype == "stimpack":
			if u["unit_type"] in ["marine", "marauder"] and u["hp"] > 10.0:
				u["hp"] -= 10.0
				u["stim_timer"] = 11.0
				accepted += 1
			continue

		elif ctype == "charge":
			if u["unit_type"] == "zealot":
				u["charge_timer"] = 3.5
				accepted += 1
			continue

		elif ctype == "blink":
			if u["unit_type"] == "stalker" and u["blink_cooldown"] <= 0.0:
				var old_pos: Vector2 = u["pos"]
				var delta_b: Vector2 = target_pos - old_pos
				if delta_b.length() > 18.0:
					delta_b = delta_b.normalized() * 18.0
				var dest = _clamp_to_walkable(old_pos + delta_b, u["radius"], true)
				u["pos"] = dest
				u["prev_pos"] = dest
				u["home_pos"] = dest
				u["blink_cooldown"] = 7.0
				u["orders"].clear()
				u["path"].clear()
				if players.has(u["owner"]):
					players[u["owner"]]["blinks_executed"] += 1
				emit_signal("unit_blinked", old_pos, dest, u["tag"])
				accepted += 1
			continue

		elif ctype in ["morph_siege_mode", "siege_mode"]:
			if u["unit_type"] == "siege_tank":
				_morph_unit_in_place(u, "siege_tank_sieged")
				accepted += 1
			continue

		elif ctype in ["morph_tank_mode", "tank_mode", "unsiege"]:
			if u["unit_type"] == "siege_tank_sieged":
				_morph_unit_in_place(u, "siege_tank")
				accepted += 1
			continue

		elif ctype == "lower_depot":
			if u["unit_type"] == "supply_depot":
				_morph_unit_in_place(u, "supply_depot_lowered")
				accepted += 1
			continue

		elif ctype == "raise_depot":
			if u["unit_type"] == "supply_depot_lowered":
				_morph_unit_in_place(u, "supply_depot")
				accepted += 1
			continue

		elif ctype.begins_with("train_"):
			var train_type = ctype.replace("train_", "")
			if _enqueue_unit_production(u, train_type):
				accepted += 1
			continue

		elif ctype == "rally":
			if u["is_structure"]:
				u["rally_pos"] = target_pos
				accepted += 1
			continue

		elif ctype == "stop":
			u["orders"].clear()
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		elif ctype == "hold_position":
			u["orders"] = [{"type": "hold_position"}]
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		if not queue:
			u["orders"].clear()
			u["path"].clear()

		if ctype == "move":
			u["orders"].append({
				"type": "move",
				"target_pos": target_pos,
				"arrival_radius": dynamic_arrival
			})
			u["has_home_pos"] = false
			accepted += 1

		elif ctype in ["attack", "attack_move"]:
			if target_tag > 0 and units.has(target_tag):
				u["orders"].append({
					"type": "attack_target",
					"target_tag": target_tag
				})
			else:
				u["orders"].append({
					"type": "attack_move",
					"target_pos": target_pos,
					"arrival_radius": dynamic_arrival
				})
			accepted += 1

		elif ctype == "attack_target":
			u["orders"].append({
				"type": "attack_target",
				"target_tag": target_tag
			})
			accepted += 1

		elif ctype == "harvest":
			u["harvest_target_tag"] = target_tag
			u["orders"].append({
				"type": "harvest",
				"target_tag": target_tag
			})
			accepted += 1

		elif ctype.begins_with("build_"):
			var stype = ctype.replace("build_", "")
			u["orders"].append({
				"type": "build",
				"structure_type": stype,
				"target_pos": target_pos,
				"structure_tag": 0
			})
			accepted += 1
		elif ctype == "build":
			u["orders"].append({
				"type": "build",
				"structure_type": extra if extra != "" else "supply_depot",
				"target_pos": target_pos,
				"structure_tag": 0
			})
			accepted += 1

	command_history.append({
		"tick": tick,
		"cmd": cmd_type,
		"tags": unit_tags,
		"pos": [target_pos.x, target_pos.y],
		"target_tag": target_tag
	})
	if command_history.size() > 100:
		command_history.pop_front()

	return {"ok": true, "accepted": accepted, "tick": tick}

func issue_SmartHarvest(worker_tag: int) -> void:
	if not units.has(worker_tag):
		return
	var u = units[worker_tag]
	var nearest = _find_nearest_mineral(u["pos"])
	if not nearest.is_empty():
		issue_command([worker_tag], "harvest", nearest["pos"], nearest["tag"])

func _morph_unit_in_place(u: Dictionary, new_type: String) -> void:
	var def = RTSData.get_unit_def(new_type)
	if def.is_empty():
		return
	u["unit_type"] = new_type
	u["name"] = str(def.get("name", new_type))
	u["speed"] = float(def.get("speed", 0.0))
	u["sight_range"] = float(def.get("sight_range", u["sight_range"]))
	u["push_priority"] = int(def.get("push_priority", u["push_priority"]))
	u["is_immobile"] = bool(def.get("is_immobile", false))
	u["is_walkable_structure"] = bool(def.get("is_walkable_structure", false))
	u["orders"].clear()
	u["vel"] = Vector2.ZERO
	if u["is_structure"]:
		nav_dirty = true

func _enqueue_unit_production(structure: Dictionary, unit_type: String) -> bool:
	if not structure["is_structure"] or structure["build_progress"] < 1.0:
		return false
	var u_def = RTSData.get_unit_def(unit_type)
	if u_def.is_empty():
		return false
	var p = players.get(structure["owner"], {})
	if p.is_empty():
		return false
	var m_cost = int(u_def.get("mineral_cost", 50))
	var v_cost = int(u_def.get("vespene_cost", 0))
	var s_cost = int(u_def.get("supply_cost", 1))
	if p["minerals"] < m_cost or p["vespene"] < v_cost:
		return false
	if p["supply_used"] + s_cost > p["supply_cap"]:
		return false
	p["minerals"] -= m_cost
	p["vespene"] -= v_cost
	structure["production_queue"].append({
		"unit_type": unit_type,
		"progress": 0.0,
		"total_time": max(2.5, float(u_def.get("build_time", 12.0)) * 0.25)
	})
	_recompute_supplies()
	return true

func _recompute_supplies() -> void:
	for pid in players.keys():
		players[pid]["supply_used"] = 0
		players[pid]["supply_cap"] = 0

	for u in units.values():
		var pid = u["owner"]
		if not players.has(pid):
			continue
		var def = RTSData.get_unit_def(u["unit_type"])
		if u["is_structure"]:
			if u["build_progress"] >= 1.0:
				players[pid]["supply_cap"] += int(def.get("supply_provided", 0))
			for q in u["production_queue"]:
				var q_def = RTSData.get_unit_def(str(q["unit_type"]))
				players[pid]["supply_used"] += int(q_def.get("supply_cost", 1))
		else:
			players[pid]["supply_used"] += int(def.get("supply_cost", 1))

func _find_nearest_town_hall(owner_id: int, pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for u in units.values():
		if u["owner"] == owner_id and u["is_structure"] and u["build_progress"] >= 1.0:
			var def = RTSData.get_unit_def(u["unit_type"])
			if bool(def.get("is_town_hall", false)):
				var d = pos.distance_to(u["pos"])
				if d < best_d:
					best_d = d
					best = u
	return best

func _find_nearest_mineral(pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for r in resources.values():
		if r["resource_type"] == "mineral_field" and r["amount"] > 0:
			var d = pos.distance_to(r["pos"])
			if d < best_d:
				best_d = d
				best = r
	return best

func get_observation(perspective_player: int = 0) -> Dictionary:
	var unit_list: Array = []
	var all_tags = units.keys()
	all_tags.sort()
	for tag in all_tags:
		var u = units[tag]
		unit_list.append({
			"tag": u["tag"],
			"id": u["id"],
			"unit_type": u["unit_type"],
			"faction": u["faction"],
			"name": u["name"],
			"owner": u["owner"],
			"pos": {"x": snappedf(u["pos"].x, 0.01), "y": snappedf(u["pos"].y, 0.01), "z": snappedf(get_elevation_at(u["pos"]), 0.01)},
			"hp": snappedf(u["hp"], 0.1),
			"max_hp": u["max_hp"],
			"shields": snappedf(u["shields"], 0.1),
			"max_shields": u["max_shields"],
			"radius": u["radius"],
			"is_structure": u["is_structure"],
			"is_walkable_structure": u["is_walkable_structure"],
			"is_worker": u["is_worker"],
			"build_progress": snappedf(u["build_progress"], 0.01),
			"weapon_cooldown": snappedf(u["weapon_cooldown"], 0.01),
			"blink_cooldown": snappedf(u["blink_cooldown"], 0.01),
			"attack_state": u["attack_state"],
			"stim_timer": snappedf(u["stim_timer"], 0.01),
			"cargo_type": u["cargo_type"],
			"cargo_amount": u["cargo_amount"],
			"orders": u["orders"].duplicate(true),
			"production_queue_len": u["production_queue"].size(),
			"kills": u["kills"]
		})

	var res_list: Array = []
	for r in resources.values():
		res_list.append({
			"tag": r["tag"],
			"id": r["id"],
			"resource_type": r["resource_type"],
			"pos": {"x": r["pos"].x, "y": r["pos"].y, "z": snappedf(get_elevation_at(r["pos"]), 0.01)},
			"amount": r["amount"]
		})

	return {
		"tick": tick,
		"sim_time": snappedf(sim_time, 0.01),
		"scenario": scenario_name,
		"rts_mode": rts_mode,
		"perspective_player": perspective_player,
		"map": {
			"width": map_width,
			"height": map_height
		},
		"players": players.duplicate(true),
		"units": unit_list,
		"resources": res_list,
		"recent_events": recent_events.slice(max(0, recent_events.size() - 15))
	}
