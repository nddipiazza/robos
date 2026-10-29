extends Node

# SimEngine.gd — Deterministic 64Hz RTS Simulation Engine (fixed-step, seeded, renderer-independent)
# Supports 3 Factions:
# - HUMANS ("humans" / Meridian Guard): Surge Injector, Retract/Extend Provision Silos, Howitzers, Pioneer Construction
# - MONSTERS ("monsters" / Gnarl Brood): High-speed Skitterling packs, Bile Crawlers, Blight Hurlers
# - ALIENS ("aliens" / Aurelian Concord): Regenerating Aegis Shields, Skirmisher Phase Step teleport, Sunblade Charge, Prism Beam Spire Walker

signal simulation_ticked(tick: int)
signal unit_spawned(unit: Dictionary)
signal unit_destroyed(unit: Dictionary)
signal projectile_fired(from_pos: Vector2, to_pos: Vector2, weapon_name: String, is_splash: bool, owner_id: int)
signal unit_phased(from_pos: Vector2, to_pos: Vector2, unit_tag: int)
signal scenario_loaded(scenario_name: String)
signal paused_step
signal notice(owner_id: int, text: String, kind: String)
signal unit_damaged(owner_id: int, pos: Vector2)

const TICK_RATE: int = 64
const TICK_DT: float = 1.0 / float(TICK_RATE)
const SPATIAL_CELL_SIZE: float = 8.0
const PATH_CELL_SIZE: float = 2.0

var tick: int = 0
var sim_time: float = 0.0
var rng_seed: int = 42
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
var paused: bool = false
var decor_enabled: bool = true
var last_step_count: int = 1
var rts_mode: String = "human"
var sim_speed: float = 1.0
var manual_step_requests: int = 0

var map_width: float = 128.0
var map_height: float = 96.0
var scenario_name: String = "Starfall Canyon — Humans vs Monsters vs Aliens"

var terrain_obstacles: Array[Rect2] = []
var high_ground_zones: Array[Rect2] = []
var ramps: Array[Rect2] = []
var water_polygons: Array[PackedVector2Array] = []
var land_bridges: Array[Rect2] = []
var water_cells: Dictionary = {}
var unlimited_resources: bool = false
var terrain_tiles: Array = []

var players: Dictionary = {}
var next_tag: int = 1001
var units: Dictionary = {}
var resources: Dictionary = {}
var spatial_grid: Dictionary = {}
var _spatial_by_owner: Dictionary = {}
var astar_grid: AStarGrid2D = AStarGrid2D.new()
var nav_dirty: bool = true

var recent_events: Array[Dictionary] = []
var command_history: Array[Dictionary] = []
var _accum_time: float = 0.0

# Map Editor <-> playtest handoff: holds the editor document while RTSMain playtests it.
var editor_session: Dictionary = {}
var match_state: Dictionary = {}
var battle_scenario: Dictionary = {}
var battle_stats = preload("res://scripts/engine/RTSBattleStats.gd").new()
var unit_avoidance = preload("res://scripts/engine/RTSUnitAvoidance.gd").new()
var frame_sim_usec: int = 0
var frame_sim_ticks: int = 0
var profile_usec: Dictionary = {"navigation": 0, "crowd_navigation": 0, "orders": 0, "steering": 0, "ai": 0}
var _static_structures: Array[Dictionary] = []
var _max_unit_radius: float = 4.5
var _town_halls: Array[Dictionary] = []
var _gas_source_by_tap: Dictionary = {}
var _gas_tap_by_vent: Dictionary = {}

func _ready() -> void:
	var env_mode = OS.get_environment("RTS_MODE")
	if env_mode != "":
		rts_mode = env_mode.to_lower()
	elif DisplayServer.get_name() == "headless":
		rts_mode = "backend"
	rng.seed = rng_seed
	call_deferred("_load_startup_scenario")

func _load_startup_scenario() -> void:
	load_default_scenario()

	var args = OS.get_cmdline_user_args()
	for arg in args:
		if arg.begins_with("--scenario="):
			var res = load_scenario_file(arg.split("=", true, 1)[1])
			if not bool(res.get("ok", false)):
				push_warning("[SimEngine] %s" % res.get("error", "Failed to load scenario"))

func _process(delta: float) -> void:
	frame_sim_usec = 0
	frame_sim_ticks = 0
	if rts_mode == "backend" or paused or match_state.get("status", "") == "finished":
		return
	var started = Time.get_ticks_usec()
	# Keep input/rendering responsive when fast-forward or a slow capture exhausts
	# the CPU. The fixed simulation tick is unchanged; overload slows wall-clock
	# playback instead of creating an unbounded catch-up frame.
	_accum_time = minf(_accum_time + delta * sim_speed, 1.0)
	var max_steps = 64
	var steps = 0
	while _accum_time >= TICK_DT and steps < max_steps:
		_accum_time -= TICK_DT
		step_ticks(1)
		steps += 1
		if Time.get_ticks_usec() - started >= 8000:
			break
	frame_sim_usec = Time.get_ticks_usec() - started
	frame_sim_ticks = steps

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
	water_polygons.clear()
	land_bridges.clear()
	water_cells.clear()
	unlimited_resources = false
	terrain_tiles.clear()
	recent_events.clear()
	command_history.clear()
	match_state.clear()
	battle_scenario.clear()
	battle_stats.reset()
	unit_avoidance.reset()
	_accum_time = 0.0
	sim_speed = 1.0
	manual_step_requests = 0
	paused = false
	decor_enabled = true

	var default_factions = {
		1: {"name": "Humans (Meridian Guard)", "faction": "humans"},
		2: {"name": "Monsters (Gnarl Brood)", "faction": "monsters"},
		3: {"name": "Aliens (Aurelian Concord)", "faction": "aliens"}
	}
	players.clear()
	for pid in [1, 2, 3]:
		players[pid] = {
			"id": pid,
			"name": default_factions[pid]["name"],
			"faction": default_factions[pid]["faction"],
			"crystal": 400,
			"aether": 150,
			"supply_used": 0,
			"supply_cap": 0,
			"crystal_collected": 0,
			"aether_collected": 0,
			"units_killed": 0,
			"units_lost": 0,
			"structures_built": 0,
			"stutter_step_cancels": 0,
			"phase_steps_executed": 0
		}
	_rebuild_astar_grid()

func load_default_scenario() -> void:
	load_scenario_file("frontier-hunters")

func load_legacy_scenario() -> void:
	reset_state(42, 128.0, 96.0)
	scenario_name = "Starfall Canyon — Humans vs Monsters vs Aliens"

	terrain_obstacles.append(Rect2(60.0, 0.0, 6.0, 34.0))
	terrain_obstacles.append(Rect2(60.0, 62.0, 6.0, 34.0))
	high_ground_zones.append(Rect2(0.0, 0.0, 60.0, 96.0))
	ramps.append(Rect2(56.0, 34.0, 14.0, 28.0))

	# Player 1: HUMANS (Meridian Guard) at West High Ground
	spawn_unit("colony_hub", 1, Vector2(20.0, 48.0))
	spawn_unit("silo", 1, Vector2(34.0, 34.0))
	spawn_unit("silo", 1, Vector2(34.0, 62.0))
	spawn_unit("muster_hall", 1, Vector2(36.0, 48.0))
	spawn_unit("workshop", 1, Vector2(28.0, 66.0))

	for i in range(6):
		spawn_resource("crystal_field", Vector2(10.0, 33.0 + i * 5.5), 1500)
	spawn_resource("aether_vent", Vector2(14.0, 68.0), 2250)
	spawn_unit("aether_tap", 1, Vector2(14.0, 68.0))

	for i in range(6):
		var pioneer = spawn_unit("pioneer", 1, Vector2(15.0, 35.0 + i * 3.8))
		issue_SmartHarvest(pioneer["tag"])

	for i in range(6):
		var row = i / 3
		var col = i % 3
		spawn_unit("rifleman", 1, Vector2(44.0 + col * 2.2, 43.0 + row * 2.5))
	spawn_unit("breacher", 1, Vector2(48.0, 50.0))
	spawn_unit("howitzer", 1, Vector2(41.0, 48.0))

	# Player 2: MONSTERS (Gnarl Brood) at South-East Low Ground
	spawn_unit("brood_nest", 2, Vector2(106.0, 68.0))
	for i in range(4):
		spawn_resource("crystal_field", Vector2(118.0, 58.0 + i * 5.5), 1500)
	for i in range(4):
		var forager = spawn_unit("forager", 2, Vector2(112.0, 60.0 + i * 4.0))
		issue_SmartHarvest(forager["tag"])
	for i in range(8):
		var row = i / 4
		var col = i % 4
		spawn_unit("skitterling", 2, Vector2(84.0 + col * 2.2, 56.0 + row * 2.5))
	spawn_unit("bile_crawler", 2, Vector2(92.0, 60.0))
	spawn_unit("blight_hurler", 2, Vector2(94.0, 65.0))

	# Player 3: ALIENS (Aurelian Concord) at North-East Outpost
	spawn_unit("heartstone", 3, Vector2(104.0, 22.0))
	spawn_unit("resonator", 3, Vector2(92.0, 20.0))
	spawn_unit("waystone", 3, Vector2(90.0, 28.0))
	for i in range(3):
		spawn_resource("crystal_field", Vector2(116.0, 14.0 + i * 5.5), 1500)
	for i in range(3):
		var mote = spawn_unit("mote", 3, Vector2(110.0, 16.0 + i * 4.0))
		issue_SmartHarvest(mote["tag"])
	spawn_unit("sunblade", 3, Vector2(80.0, 26.0))
	spawn_unit("sunblade", 3, Vector2(80.0, 30.0))
	spawn_unit("skirmisher", 3, Vector2(84.0, 24.0))
	spawn_unit("skirmisher", 3, Vector2(84.0, 28.0))
	spawn_unit("spire_walker", 3, Vector2(88.0, 26.0))

	_rebuild_astar_grid()
	_recompute_supplies()
	emit_signal("scenario_loaded", scenario_name)

func load_scenario_dict(data: Dictionary) -> Dictionary:
	if str(data.get("mode", "")) == "skirmish":
		return _load_skirmish(data)
	var s_seed = int(data.get("seed", 42))
	var map_cfg = data.get("map", {})
	var w = float(map_cfg.get("width", 128.0))
	var h = float(map_cfg.get("height", 96.0))
	reset_state(s_seed, w, h)
	scenario_name = str(data.get("name", data.get("rdfs:label", "Custom RTS Scenario")))
	paused = bool(data.get("paused", false))
	decor_enabled = bool(data.get("decor", true))
	unlimited_resources = bool(data.get("unlimited_resources", false))
	_configure_water(map_cfg)
	if data.get("victory", "") == "all_structures":
		players.erase(3)
		match_state = {"mode": "annihilation_fixture", "status": "playing", "winner": 0, "reason": ""}
	if str(data.get("mode", "")) == "unit_battle":
		players.erase(3)
		battle_scenario = data.duplicate(true)
		paused = true
		match_state = {"mode": "unit_battle", "status": "ready", "winner": 0, "reason": ""}
	if str(data.get("mode", "")) == "campaign":
		players.erase(3)
		battle_scenario = data.duplicate(true)
		paused = true
		match_state = {"mode": "campaign", "status": "briefing", "winner": 0, "reason": "",
			"mission": data.get("mission", {}).duplicate(true)}

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
	for rmp in map_cfg.get("ramps", []):
		ramps.append(Rect2(
			float(rmp.get("x", 0.0)),
			float(rmp.get("y", 0.0)),
			float(rmp.get("w", 10.0)),
			float(rmp.get("h", 10.0))
		))

	var p_cfg = data.get("players", {})
	for pid_key in p_cfg.keys():
		var pid = int(pid_key)
		if players.has(pid):
			var pd = p_cfg[pid_key]
			players[pid]["crystal"] = int(pd.get("crystal", 400))
			players[pid]["aether"] = int(pd.get("aether", 150))
			if pd.has("faction"):
				players[pid]["faction"] = str(pd["faction"])

	for res in data.get("resources", []):
		spawn_resource(
			str(res.get("type", "crystal_field")),
			Vector2(float(res.get("x", 20.0)), float(res.get("y", 20.0))),
			int(res.get("amount", 1500)),
			str(res.get("id", ""))
		)

	for u in data.get("units", []):
		var count = int(u.get("count", 1))
		var base_x = float(u.get("x", 30.0))
		var base_y = float(u.get("y", 30.0))
		var utype = str(u.get("type", "rifleman"))
		var owner_id = int(u.get("owner", u.get("player", 1)))
		var spread = float(u.get("spread", 2.1))
		var cols = max(1, int(ceil(sqrt(float(count)))))
		for idx in range(count):
			var r = idx / cols
			var c = idx % cols
			var pos = Vector2(base_x + c * spread, base_y + r * spread) if count > 1 else Vector2(base_x, base_y)
			var spawned = spawn_unit(utype, owner_id, pos, str(u.get("id", "")) if count == 1 else "", float(u.get("build_progress", 1.0)))
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

# Resolves a scenario slug (`scenarios/<slug>.jsonld|.json`) or an explicit file path and loads it.
func resolve_scenario_path(slug_or_path: String) -> String:
	if FileAccess.file_exists(slug_or_path):
		return slug_or_path
	for ext in [".jsonld", ".json"]:
		var candidate = "res://scenarios/%s%s" % [slug_or_path, ext]
		if FileAccess.file_exists(candidate):
			return candidate
	return ""

func load_scenario_file(slug_or_path: String) -> Dictionary:
	var file_path = resolve_scenario_path(slug_or_path)
	if file_path == "":
		return {"ok": false, "error": "Scenario file not found: " + slug_or_path}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(file_path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Scenario is not a JSON object: " + file_path}
	return load_scenario_dict(parsed)

# Only the two assigned seats participate; the six unoccupied pockets are expansions.
# A provided seed replays the same assignment; ordinary new games use fresh seeds.
func _load_skirmish(data: Dictionary) -> Dictionary:
	var map_cfg: Dictionary = data.get("map", {})
	var starts: Array = map_cfg.get("starts", [])
	var difficulty = str(data.get("difficulty", "normal"))
	var strategy = str(data.get("strategy", "balanced"))
	if starts.size() < 2 or starts.size() > 8 or not difficulty in ["easy", "normal", "hard"] or not strategy in ["rush", "balanced", "economy", "siege"]:
		return {"ok": false, "error": "Expected 2–8 starts and a supported difficulty/strategy"}
	var match_seed = int(data.get("seed", Time.get_unix_time_from_system() * 1000.0 + Time.get_ticks_msec()))
	reset_state(match_seed, float(map_cfg.get("width", 256)), float(map_cfg.get("height", 256)))
	unlimited_resources = bool(data.get("unlimited_resources", true))
	_configure_water(map_cfg)
	players.erase(3)
	scenario_name = str(data.get("name", "Frontier Hunters — 1 Player vs AI"))
	var slots: Array = range(starts.size())
	for i in range(starts.size() - 1, 0, -1):
		var j = rng.randi_range(0, i)
		var temp = slots[i]
		slots[i] = slots[j]
		slots[j] = temp
	match_state = {"mode": "1p_vs_ai", "status": "playing", "winner": 0, "reason": "", "seed": match_seed,
		"difficulty": difficulty, "strategy": strategy, "unlimited_resources": unlimited_resources,
		"starts": starts.duplicate(true), "expansions": map_cfg.get("expansions", []).duplicate(true),
		"assigned_starts": {"1": slots[0], "2": slots[1]}}
	for obs in map_cfg.get("obstacles", []):
		terrain_obstacles.append(Rect2(float(obs.x), float(obs.y), float(obs.w), float(obs.h)))
	var resource_sites = starts + map_cfg.get("expansions", [])
	for slot in range(resource_sites.size()):
		var site: Dictionary = resource_sites[slot]
		var base = Vector2(float(site.x), float(site.y))
		var outward = (base - Vector2(map_width, map_height) * 0.5).normalized()
		var tangent = Vector2(-outward.y, outward.x)
		for i in range(8):
			spawn_resource("crystal_field", _resource_land_position(base + outward * 13.0 + tangent * (float(i) - 3.5) * 3.6), 50000, "start_%d_crystal_%d" % [slot, i])
		for side in [-1, 1]:
			spawn_resource("aether_vent", _resource_land_position(base + tangent * side * 17.0), 50000, "start_%d_aether_%d" % [slot, side])
	if data.has("resources"):
		resources.clear()
		next_tag = 1001
		for resource in data.resources:
			spawn_resource(str(resource.type), Vector2(float(resource.x), float(resource.y)), int(resource.get("amount", 1500)), str(resource.get("id", "")))
	for pid in [1, 2]:
		players[pid]["faction"] = "humans"
		players[pid]["name"] = "Commander" if pid == 1 else "AI Commander"
		players[pid]["crystal"] = 50
		players[pid]["aether"] = 0
		var start: Dictionary = starts[slots[pid - 1]]
		var base = Vector2(float(start.x), float(start.y))
		spawn_unit("colony_hub", pid, base)
		for i in range(12):
			var angle = TAU * float(i) / 12.0
			var worker = spawn_unit("pioneer", pid, base + Vector2(cos(angle), sin(angle)) * 7.0)
			issue_SmartHarvest(worker.tag)
	_rebuild_astar_grid()
	_recompute_supplies()
	RTSCommanderAI.configure_from_scenario([])
	RTSCommanderAI.set_skirmish_directive(2, difficulty, strategy)
	emit_signal("scenario_loaded", scenario_name)
	return {"ok": true, "scenario": scenario_name, "match": match_state.duplicate(true)}

func start_unit_battle() -> Dictionary:
	if match_state.get("mode", "") != "unit_battle" or match_state.get("status", "") != "ready":
		return {"ok": false, "error": "Reset the arena before starting a new fight"}
	match_state["status"] = "playing"
	battle_stats.begin(units, tick)
	# Identical one-shot orders: normal targeting and movement resolve the fight.
	# No scripted micro, free reinforcements or forced result. The player can override blue.
	for pid in [1, 2]:
		var tags: Array[int] = []
		for u in units.values():
			if u.owner == pid:
				tags.append(u.tag)
		issue_command(tags, "attack_move", Vector2(map_width * 0.5, map_height * 0.5))
	_accum_time = 0.0
	paused = false
	return {"ok": true, "match": match_state.duplicate(true)}

func reset_unit_battle() -> Dictionary:
	if match_state.get("mode", "") != "unit_battle" or battle_scenario.is_empty():
		return {"ok": false, "error": "No unit battle is loaded"}
	# Copy before reset_state clears the stored scenario.
	return load_scenario_dict(battle_scenario.duplicate(true))

func start_campaign() -> Dictionary:
	if match_state.get("mode", "") != "campaign" or match_state.get("status", "") != "briefing":
		return {"ok": false, "error": "Load or restart a campaign mission first"}
	match_state["status"] = "playing"
	battle_stats.begin(units, tick)
	_accum_time = 0.0
	paused = false
	return {"ok": true, "match": match_state.duplicate(true)}

func restart_campaign() -> Dictionary:
	if match_state.get("mode", "") != "campaign" or battle_scenario.is_empty():
		return {"ok": false, "error": "No campaign mission is loaded"}
	return load_scenario_dict(battle_scenario.duplicate(true))

func _check_match_result() -> void:
	if match_state.get("status", "") != "playing":
		return
	if match_state.get("mode", "") == "campaign":
		var player_structures = 0
		var enemies = 0
		for u in units.values():
			if u.hp <= 0:
				continue
			if u.owner == 1 and u.is_structure:
				player_structures += 1
			elif u.owner == 2:
				enemies += 1
		if player_structures == 0:
			_finish_match(2, "base_destroyed")
		elif enemies == 0:
			_finish_match(1, "stronghold_cleared")
		return
	var remaining = {1: 0, 2: 0}
	for u in units.values():
		if (u.is_structure or match_state.get("mode", "") == "unit_battle") and u.hp > 0 and remaining.has(u.owner):
			remaining[u.owner] += 1
	if remaining[1] == 0 or remaining[2] == 0:
		var winner = 0 if remaining[1] == 0 and remaining[2] == 0 else (2 if remaining[1] == 0 else 1)
		_finish_match(winner, "army_eliminated" if match_state.get("mode", "") == "unit_battle" else "all_structures_destroyed")

func surrender(player_id: int) -> Dictionary:
	if match_state.get("status", "") != "playing" or not player_id in [1, 2]:
		return {"ok": false, "error": "No active match for that player"}
	_finish_match(3 - player_id, "surrender")
	return {"ok": true, "match": match_state.duplicate(true)}

func _finish_match(winner: int, reason: String) -> void:
	match_state["status"] = "finished"
	match_state["winner"] = winner
	match_state["reason"] = reason
	match_state["finished_tick"] = tick
	if match_state.get("mode", "") in ["unit_battle", "campaign"]:
		match_state["results"] = battle_stats.finish(units, tick, rng_seed)
		match_state.results["winner"] = winner
		match_state.results["reason"] = reason
		match_state.results["scenario"] = scenario_name
		match_state.results["mode"] = match_state.mode
	emit_signal("notice", 1, "Victory" if winner == 1 else ("Draw" if winner == 0 else "Defeat"), "info")

func _can_build(worker: Dictionary, structure_type: String, pos: Vector2) -> bool:
	var def = RTSData.get_unit_def(structure_type)
	if not worker.is_worker or not bool(def.get("is_structure", false)) or def.get("faction", "") != worker.faction:
		return false
	for required in def.get("requires", []):
		var found = false
		for u in units.values():
			if u.owner == worker.owner and u.unit_type == required and u.build_progress >= 1.0:
				found = true
		if not found:
			return false
	return can_place_structure(structure_type, pos)

func can_place_structure(structure_type: String, pos: Vector2) -> bool:
	var def = RTSData.get_unit_def(structure_type)
	if def.is_empty():
		return false
	var radius = float(def.get("radius", 2.0))
	if is_water_at(pos, radius):
		return false
	if structure_type == "aether_tap":
		var vent_found = false
		for res in resources.values():
			if res.resource_type == "aether_vent" and pos.distance_to(res.pos) <= 0.5:
				vent_found = true
		if not vent_found:
			return false
	if pos.x < radius + 1 or pos.y < radius + 1 or pos.x > map_width - radius - 1 or pos.y > map_height - radius - 1:
		return false
	for obs in terrain_obstacles:
		if obs.grow(radius).has_point(pos):
			return false
	for u in units.values():
		if u.is_structure and pos.distance_to(u.pos) < radius + float(u.radius) + 1.0:
			return false
	for res in resources.values():
		if pos.distance_to(res.pos) < radius + float(res.radius) + 0.5:
			if structure_type != "aether_tap" or res.resource_type != "aether_vent":
				return false
	return true

func _configure_water(map_cfg: Dictionary) -> void:
	terrain_tiles = map_cfg.get("terrain_tiles", []).duplicate(true)
	for bridge in map_cfg.get("bridges", []):
		land_bridges.append(Rect2(float(bridge.x), float(bridge.y), float(bridge.w), float(bridge.h)))
	for channel in map_cfg.get("water_channels", []):
		var points = PackedVector2Array()
		for point in channel.get("points", []):
			points.append(Vector2(float(point[0]), float(point[1])))
		if points.size() >= 2:
			for polygon in Geometry2D.offset_polyline(points, float(channel.get("width", 10)) * 0.5, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
				water_polygons.append(polygon)
	for x in range(int(ceil(map_width / PATH_CELL_SIZE))):
		for y in range(int(ceil(map_height / PATH_CELL_SIZE))):
			var pos = Vector2(x + 0.5, y + 0.5) * PATH_CELL_SIZE
			var on_bridge = false
			for bridge in land_bridges:
				if bridge.has_point(pos):
					on_bridge = true
			if on_bridge:
				continue
			for polygon in water_polygons:
				if Geometry2D.is_point_in_polygon(pos, polygon):
					water_cells[Vector2i(x, y)] = true
					break
	for tile in terrain_tiles:
		var rect = Rect2(float(tile.x), float(tile.y), 4, 4)
		for x in range(int(rect.position.x / PATH_CELL_SIZE), int(rect.end.x / PATH_CELL_SIZE)):
			for y in range(int(rect.position.y / PATH_CELL_SIZE), int(rect.end.y / PATH_CELL_SIZE)):
				if tile.terrain == "water":
					water_cells[Vector2i(x, y)] = true
				else:
					water_cells.erase(Vector2i(x, y))
	for kind in ["water", "cliff", "plateau"]:
		for rect in merged_terrain_rects(kind):
			match kind:
				"water":
					water_polygons.append(PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]))
				"cliff":
					terrain_obstacles.append(rect)
				"plateau":
					high_ground_zones.append(rect)

# Compile brush cells into rectangles so a large bucket fill does not create
# thousands of terrain meshes or repeated shoreline geometry.
func merged_terrain_rects(kind: String) -> Array[Rect2]:
	var mask: Dictionary = {}
	for tile in terrain_tiles:
		if str(tile.terrain) == kind:
			mask[Vector2i(int(float(tile.x) / 4.0), int(float(tile.y) / 4.0))] = true
	var result: Array[Rect2] = []
	for y in range(int(ceil(map_height / 4.0))):
		for x in range(int(ceil(map_width / 4.0))):
			if not mask.has(Vector2i(x, y)):
				continue
			var width = 1
			while mask.has(Vector2i(x + width, y)):
				width += 1
			var height = 1
			var extend = true
			while extend:
				for dx in range(width):
					if not mask.has(Vector2i(x + dx, y + height)):
						extend = false
						break
				if extend:
					height += 1
			for dx in range(width):
				for dy in range(height):
					mask.erase(Vector2i(x + dx, y + dy))
			result.append(Rect2(x * 4, y * 4, width * 4, height * 4))
	return result

func is_water_at(pos: Vector2, radius: float = 0.0) -> bool:
	for x in range(int(floor((pos.x - radius) / PATH_CELL_SIZE)), int(floor((pos.x + radius) / PATH_CELL_SIZE)) + 1):
		for y in range(int(floor((pos.y - radius) / PATH_CELL_SIZE)), int(floor((pos.y + radius) / PATH_CELL_SIZE)) + 1):
			if water_cells.has(Vector2i(x, y)):
				var nearest = Vector2(clampf(pos.x, x * PATH_CELL_SIZE, (x + 1) * PATH_CELL_SIZE), clampf(pos.y, y * PATH_CELL_SIZE, (y + 1) * PATH_CELL_SIZE))
				if nearest.distance_squared_to(pos) <= radius * radius:
					return true
	return false

func _resource_land_position(pos: Vector2) -> Vector2:
	if not is_water_at(pos, 3.0):
		return pos
	for radius in range(2, 24, 2):
		for i in range(16):
			var candidate = pos + Vector2.from_angle(TAU * float(i) / 16.0) * radius
			if candidate.x > 4 and candidate.y > 4 and candidate.x < map_width - 4 and candidate.y < map_height - 4 and not is_water_at(candidate, 3.0):
				return candidate
	return pos

func spawn_resource(res_type: String, pos: Vector2, amount: int = 1500, custom_id: String = "") -> Dictionary:
	var tag = next_tag
	next_tag += 1
	var r = {
		"tag": tag,
		"id": custom_id if custom_id != "" else "%s_%d" % [res_type, tag],
		"resource_type": res_type,
		"pos": pos,
		"amount": amount,
		"radius": 1.8 if res_type == "crystal_field" else 2.6,
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
		"crowd_path": [],
		"crowd_goal": Vector2.INF,
		"crowd_until": 0,
		"crowd_retry_tick": 0,
		"crowd_blocker": 0,
		"crowd_blocker_pos": Vector2.ZERO,
		"home_pos": pos,
		"has_home_pos": true,
		"pushed_timer": 0.0,
		"attack_state": "idle",
		"attack_state_timer": 0.0,
		"attack_cycle_elapsed": 0.0,
		"attack_target_tag": 0,
		"weapon_cooldown": 0.0,
		"surge_timer": 0.0,
		"charge_timer": 0.0,
		"phase_cooldown": 0.0,
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
	battle_stats.register_unit(u, tick)
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
	if match_state.get("status", "") in ["ready", "briefing"]:
		return
	last_step_count = count
	if paused:
		emit_signal("paused_step")
	for _i in range(count):
		if match_state.get("status", "") == "finished":
			break
		_step_single_tick()

func _step_single_tick() -> void:
	tick += 1
	sim_time = float(tick) * TICK_DT

	if nav_dirty:
		_rebuild_astar_grid()
		nav_dirty = false

	_rebuild_spatial_grid()

	if tick % 8 == 0:
		var ai_started = Time.get_ticks_usec()
		RTSCommanderAI.step_ai(TICK_DT * 8.0)
		profile_usec.ai += Time.get_ticks_usec() - ai_started

	_update_structures(TICK_DT)

	var all_tags = units.keys()
	all_tags.sort()
	var orders_started = Time.get_ticks_usec()
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u = units[tag]
		u["prev_pos"] = u["pos"]
		_update_unit_timers(u, TICK_DT)
		if u["is_structure"]:
			continue
		_update_unit_orders(u, TICK_DT)

	profile_usec.orders += Time.get_ticks_usec() - orders_started
	var steering_started = Time.get_ticks_usec()
	_apply_steering_and_push_resolution(all_tags, TICK_DT)
	profile_usec.steering += Time.get_ticks_usec() - steering_started
	battle_stats.sample(units, tick)
	_check_match_result()
	emit_signal("simulation_ticked", tick)

func _rebuild_astar_grid() -> void:
	_static_structures.clear()
	_town_halls.clear()
	_gas_source_by_tap.clear()
	_gas_tap_by_vent.clear()
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
	for cell in water_cells:
		astar_grid.set_point_solid(cell, true)

	for u in units.values():
		if u.is_structure and bool(RTSData.get_unit_def(u.unit_type).get("is_town_hall", false)):
			_town_halls.append(u)
		if u.unit_type == "aether_tap":
			for resource in resources.values():
				if resource.resource_type == "aether_vent" and resource.pos.distance_squared_to(u.pos) < 1.0:
					_gas_source_by_tap[u.tag] = resource.tag
					_gas_tap_by_vent[Vector2i(u.owner, resource.tag)] = u.tag
		if u["is_structure"] and not u["is_walkable_structure"]:
			_static_structures.append(u)
			var r = u["radius"]
			var rect = Rect2(u["pos"].x - r, u["pos"].y - r, r * 2.0, r * 2.0)
			_set_rect_solid(rect, true)
		else:
			u.path.clear()

func _set_rect_solid(rect: Rect2, solid: bool) -> void:
	var x0 = clampi(int(floor(rect.position.x / PATH_CELL_SIZE)), 0, astar_grid.region.size.x - 1)
	var y0 = clampi(int(floor(rect.position.y / PATH_CELL_SIZE)), 0, astar_grid.region.size.y - 1)
	var x1 = clampi(int(ceil(rect.end.x / PATH_CELL_SIZE)) - 1, 0, astar_grid.region.size.x - 1)
	var y1 = clampi(int(ceil(rect.end.y / PATH_CELL_SIZE)) - 1, 0, astar_grid.region.size.y - 1)
	for x in range(x0, x1 + 1):
		for y in range(y0, y1 + 1):
			astar_grid.set_point_solid(Vector2i(x, y), solid)

func compute_smooth_path(start_pos: Vector2, end_pos: Vector2, unit_radius: float = 0.85) -> Array[Vector2]:
	var started = Time.get_ticks_usec()
	var result = _compute_smooth_path(start_pos, end_pos, unit_radius)
	profile_usec.navigation += Time.get_ticks_usec() - started
	return result

func _compute_smooth_path(start_pos: Vector2, end_pos: Vector2, unit_radius: float) -> Array[Vector2]:
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
		# Always advance at least one waypoint; without this a unit hugging a cliff corner (no clear
		# line to any later waypoint) would loop here forever.
		var furthest = idx + 1
		# Grow visibility probes exponentially, then bisect the blocked interval.
		# Reverse-scanning a long cross-map path repeated hundreds of ray tests.
		var stride = 2
		var blocked = waypoints.size()
		while idx + stride < waypoints.size():
			var probe = idx + stride
			if not _has_clear_line_of_walk(anchor, waypoints[probe], unit_radius):
				blocked = probe
				break
			furthest = probe
			stride *= 2
		var low = furthest + 1
		var high = mini(blocked - 1, waypoints.size() - 1)
		while low <= high:
			var probe = (low + high) / 2
			if _has_clear_line_of_walk(anchor, waypoints[probe], unit_radius):
				furthest = probe
				low = probe + 1
			else:
				high = probe - 1
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
	if is_water_at(p, radius):
		return true
	if p.x < radius or p.y < radius or p.x > map_width - radius or p.y > map_height - radius:
		return true
	for obs in terrain_obstacles:
		var expanded = obs.grow(radius * 0.75)
		if expanded.has_point(p):
			return true
	for u in _static_structures:
		if p.distance_squared_to(u["pos"]) < pow(float(u["radius"]) + radius * 0.65, 2):
			return true
	return false

func _rebuild_spatial_grid() -> void:
	spatial_grid.clear()
	_spatial_by_owner.clear()
	_max_unit_radius = 0.0
	for tag in units.keys():
		var u = units[tag]
		_max_unit_radius = maxf(_max_unit_radius, u.radius)
		var cell = Vector2i(int(floor(u["pos"].x / SPATIAL_CELL_SIZE)), int(floor(u["pos"].y / SPATIAL_CELL_SIZE)))
		if not spatial_grid.has(cell):
			spatial_grid[cell] = []
		spatial_grid[cell].append(tag)
		if not _spatial_by_owner.has(u.owner):
			_spatial_by_owner[u.owner] = {}
		var owner_grid: Dictionary = _spatial_by_owner[u.owner]
		if not owner_grid.has(cell):
			owner_grid[cell] = []
		owner_grid[cell].append(tag)

func query_units_in_radius(center: Vector2, radius: float, exclude_owner: int = 0) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var reach = radius + _max_unit_radius
	var x0 = int(floor((center.x - reach) / SPATIAL_CELL_SIZE))
	var x1 = int(floor((center.x + reach) / SPATIAL_CELL_SIZE))
	var y0 = int(floor((center.y - reach) / SPATIAL_CELL_SIZE))
	var y1 = int(floor((center.y + reach) / SPATIAL_CELL_SIZE))
	var grids: Array = [spatial_grid]
	if exclude_owner != 0:
		grids.clear()
		for owner_id in _spatial_by_owner:
			if owner_id != exclude_owner:
				grids.append(_spatial_by_owner[owner_id])
	for grid_value in grids:
		var grid: Dictionary = grid_value
		for x in range(x0, x1 + 1):
			for y in range(y0, y1 + 1):
				var cell = Vector2i(x, y)
				if grid.has(cell):
					for tag in grid[cell]:
						if units.has(tag):
							var u: Dictionary = units[tag]
							var combined_radius: float = radius + u["radius"]
							if center.distance_squared_to(u["pos"]) <= combined_radius * combined_radius:
								result.append(u)
	return result

func _update_structures(dt: float) -> void:
	for u in units.values():
		if not u["is_structure"]:
			continue
		if u["build_progress"] < 1.0:
			if bool(u.get("auto_summon", false)):
				var rate = dt / maxf(1.0, float(u.build_total_time) * _build_time_scale())
				u.build_progress = minf(1.0, u.build_progress + rate)
				u.hp = minf(u.max_hp, u.hp + u.max_hp * rate)
				if u.build_progress >= 1.0:
					players[u.owner].structures_built += 1
					_recompute_supplies()
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
				if new_unit.get("is_worker", false) and not match_state.is_empty():
					issue_SmartHarvest(new_unit.tag)
				elif not new_unit.is_empty() and u["rally_pos"].distance_to(u["pos"]) > u["radius"] + 1.5:
					issue_command([new_unit["tag"]], "move", u["rally_pos"])

func _update_unit_timers(u: Dictionary, dt: float) -> void:
	if u["surge_timer"] > 0.0:
		u["surge_timer"] = max(0.0, u["surge_timer"] - dt)
	if u["charge_timer"] > 0.0:
		u["charge_timer"] = max(0.0, u["charge_timer"] - dt)
	if u["phase_cooldown"] > 0.0:
		u["phase_cooldown"] = max(0.0, u["phase_cooldown"] - dt)
	if u["slow_timer"] > 0.0:
		u["slow_timer"] = max(0.0, u["slow_timer"] - dt)

	# Aegis Shield Regeneration (2.0 shields/sec after 3.5s out of combat)
	u["out_of_combat_timer"] += dt
	if u["max_shields"] > 0.0 and u["shields"] < u["max_shields"] and u["out_of_combat_timer"] >= 3.5:
		var before_shields: float = u["shields"]
		u["shields"] = min(u["max_shields"], u["shields"] + 6.0 * dt)
		battle_stats.restored(u, 0.0, u["shields"] - before_shields)

	var atk_speed_mult = 1.5 if u["surge_timer"] > 0.0 else 1.0
	if u["weapon_cooldown"] > 0.0:
		# Retain the fractional tick remainder so repeated shots do not drift to
		# the next whole tick on every cycle.
		u["weapon_cooldown"] -= dt * atk_speed_mult

	if u["pushed_timer"] > 0.0:
		u["pushed_timer"] = max(0.0, u["pushed_timer"] - dt)

func _update_unit_orders(u: Dictionary, dt: float) -> void:
	u["vel"] = Vector2.ZERO

	if u["attack_state"] == "windup":
		var attack_rate = 1.5 if u["surge_timer"] > 0.0 else 1.0
		u["attack_cycle_elapsed"] += dt * attack_rate
		var target = units.get(u["attack_target_tag"], {})
		if target.is_empty() or target["hp"] <= 0.0:
			battle_stats.count(u.tag, "windup_cancels")
			u["attack_state"] = "idle"
		else:
			u["attack_state_timer"] -= dt * attack_rate
			u["facing"] = (target["pos"] - u["pos"]).angle()
			if u["attack_state_timer"] <= 0.0:
				_execute_weapon_hit(u, target)
				var def = RTSData.get_unit_def(u["unit_type"])
				var wpn = def.get("weapon", {})
				# Period is the complete shot-to-shot interval, including wind-up.
				# Hitscan damage occurs now; rendering cannot delay or repeat it.
				u["weapon_cooldown"] += maxf(0.0, float(wpn.get("period", 0.8)) - float(u["attack_cycle_elapsed"]))
				u["attack_state"] = "backswing"
				u["attack_state_timer"] = float(wpn.get("backswing", 0.25))
			return

	elif u["attack_state"] == "backswing":
		u["attack_state_timer"] -= dt * (1.5 if u["surge_timer"] > 0.0 else 1.0)
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
				_approach_target(u, enemy["pos"], dt)
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
					_approach_target(u, enemy["pos"], dt)
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
				_approach_target(u, enemy["pos"], dt)

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
			if u["cargo_type"] == "aether":
				players[u["owner"]]["aether"] += u["cargo_amount"]
				players[u["owner"]]["aether_collected"] += u["cargo_amount"]
			else:
				players[u["owner"]]["crystal"] += u["cargo_amount"]
				players[u["owner"]]["crystal_collected"] += u["cargo_amount"]
			u["cargo_amount"] = 0
			u["cargo_type"] = ""
		else:
			_approach_target(u, th["pos"], dt)
		return

	var target_entity: Dictionary = {}
	var is_gas: bool = false
	if resources.has(res_tag):
		target_entity = resources[res_tag]
		is_gas = (target_entity["resource_type"] == "aether_vent")
	elif units.has(res_tag) and units[res_tag].get("unit_type") == "aether_tap":
		target_entity = units[res_tag]
		is_gas = true
	else:
		var nearest_res = _find_nearest_crystal(u["pos"])
		if nearest_res.is_empty():
			u["orders"].pop_front()
			return
		order["target_tag"] = nearest_res["tag"]
		u["harvest_target_tag"] = nearest_res["tag"]
		target_entity = nearest_res

	var dist = u["pos"].distance_to(target_entity["pos"]) - (u["radius"] + float(target_entity.get("radius", 1.8)))
	var source_tag = res_tag
	if is_gas:
		# Links change only when structures change. Scanning the whole army and
		# every map deposit for each gas worker at 64 Hz dominated late-game CPU.
		var tap_tag = res_tag if units.has(res_tag) else int(_gas_tap_by_vent.get(Vector2i(u.owner, res_tag), 0))
		var extractor: Dictionary = units.get(tap_tag, {})
		if extractor.is_empty() or extractor.owner != u.owner or extractor.build_progress < 1.0:
			u.orders.pop_front()
			return
		source_tag = int(_gas_source_by_tap.get(tap_tag, res_tag))
	if resources.has(source_tag) and int(resources[source_tag].amount) <= 0 and not unlimited_resources:
		u.orders.pop_front()
		issue_SmartHarvest(u.tag)
		return
	if dist <= 1.2:
		u["vel"] = Vector2.ZERO
		u["facing"] = (target_entity["pos"] - u["pos"]).angle()
		u["harvest_timer"] += dt
		if u["harvest_timer"] >= 1.75:
			u["harvest_timer"] = 0.0
			if is_gas:
				u["cargo_type"] = "aether"
				u["cargo_amount"] = 4
			else:
				u["cargo_type"] = "crystal"
				u["cargo_amount"] = 5
			if resources.has(source_tag) and not unlimited_resources:
				u.cargo_amount = mini(u.cargo_amount, int(resources[source_tag].amount))
				resources[source_tag].amount -= u.cargo_amount
	else:
		_approach_target(u, target_entity["pos"], dt)

func _process_worker_build_order(u: Dictionary, order: Dictionary, dt: float) -> void:
	var struct_type = str(order.get("structure_type", "silo"))
	var build_pos: Vector2 = order.get("target_pos", u["pos"])
	var struct_tag = int(order.get("structure_tag", 0))

	if struct_tag == 0:
		var s_def = RTSData.get_unit_def(struct_type)
		if not _can_build(u, struct_type, build_pos):
			u.orders.pop_front()
			return
		var build_rad = float(s_def.get("radius", 2.0))
		if u["pos"].distance_to(build_pos) <= build_rad + u["radius"] + 1.5:
			var m_cost = int(s_def.get("crystal_cost", 100))
			var v_cost = int(s_def.get("aether_cost", 0))
			var p = players[u["owner"]]
			if p["crystal"] >= m_cost and p["aether"] >= v_cost:
				p["crystal"] -= m_cost
				p["aether"] -= v_cost
				var s_unit = spawn_unit(struct_type, u["owner"], build_pos, "", 0.0)
				order["structure_tag"] = s_unit["tag"]
				# Alien Motes summon in structures automatically and are immediately free!
				if u["unit_type"] == "mote":
					s_unit["auto_summon"] = true
					u["orders"].pop_front()
			else:
				emit_signal("notice", u["owner"], "Not enough %s to build." % ("crystal" if p["crystal"] < m_cost else "aether"), "error")
				u["orders"].pop_front()
		else:
			_approach_target(u, build_pos, dt)
	else:
		if not units.has(struct_tag):
			u["orders"].pop_front()
			return
		var s_unit = units[struct_tag]
		if s_unit["build_progress"] >= 1.0:
			players[u["owner"]]["structures_built"] += 1
			_recompute_supplies()
			emit_signal("notice", u["owner"], "%s complete." % s_unit["name"], "info")
			u["orders"].pop_front()
			return
		var dist = _edge_distance(u, s_unit)
		if dist <= 1.8:
			u["vel"] = Vector2.ZERO
			u["facing"] = (s_unit["pos"] - u["pos"]).angle()
			var rate = dt / max(1.0, float(s_unit["build_total_time"]) * _build_time_scale())
			s_unit["build_progress"] = min(1.0, s_unit["build_progress"] + rate)
			s_unit["hp"] = min(s_unit["max_hp"], s_unit["hp"] + s_unit["max_hp"] * rate)
			if s_unit["build_progress"] >= 1.0:
				players[u["owner"]]["structures_built"] += 1
				_recompute_supplies()
				emit_signal("notice", u["owner"], "%s complete." % s_unit["name"], "info")
				u["orders"].pop_front()
		else:
			_approach_target(u, s_unit["pos"], dt)

func _approach_target(u: Dictionary, target_pos: Vector2, dt: float) -> void:
	# Dry-map chases also need routes around cliffs and structures.
	_follow_order_path(u, target_pos, dt)

func _follow_order_path(u: Dictionary, target_pos: Vector2, dt: float) -> void:
	# Spire Walker has Cliff-Walk ("Massive" attribute walks directly over cliffs!)
	if u["unit_type"] == "spire_walker":
		_move_toward_point(u, target_pos, dt)
		return

	var path: Array = u["path"]
	if path.is_empty() or u.get("nav_goal", Vector2.INF).distance_to(target_pos) > 3.0:
		u["path"] = compute_smooth_path(u["pos"], target_pos, u["radius"])
		u["nav_goal"] = target_pos
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
	var crowd_started = Time.get_ticks_usec()
	var local_goal = unit_avoidance.waypoint(self, u, wp)
	profile_usec.crowd_navigation += Time.get_ticks_usec() - crowd_started
	var dir = (local_goal - u["pos"])
	if dir.length_squared() < 0.001:
		u["vel"] = Vector2.ZERO
		return
	dir = dir.normalized()
	var spd = float(u["speed"])
	if u["surge_timer"] > 0.0:
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
	var neighbors_by_tag: Dictionary = {}
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if u["is_structure"] or u["is_immobile"]:
			continue

		var position: Vector2 = u["pos"]
		var radius: float = u["radius"]
		var speed: float = u["speed"]
		var owner_id: int = u["owner"]
		var desired_vel: Vector2 = u["vel"]
		var is_moving: bool = desired_vel.length_squared() > 0.05
		var neighbors = query_units_in_radius(position, radius + 2.6)
		neighbors_by_tag[tag] = neighbors

		var steer_force: Vector2 = Vector2.ZERO
		for neighbor in neighbors:
			var n: Dictionary = neighbor
			if n["tag"] == tag:
				continue
			if n["is_structure"] and n["is_walkable_structure"]:
				continue

			var neighbor_position: Vector2 = n["pos"]
			var delta_p: Vector2 = position - neighbor_position
			var dist: float = delta_p.length()
			var min_sep: float = radius + float(n["radius"])
			if dist < 0.001:
				var angle = float((u["tag"] * 73) % 360) * PI / 180.0
				delta_p = Vector2(cos(angle), sin(angle))
				dist = 0.01

			var normal = delta_p / dist

			if is_moving and not n["is_structure"]:
				if dist < min_sep * 1.55:
					var overlap_ratio = (min_sep * 1.55 - dist) / (min_sep * 1.55)
					steer_force += normal * overlap_ratio * speed * 0.85

				if n["owner"] == owner_id and n["orders"].is_empty() and n["attack_state"] == "idle" and not n["is_immobile"]:
					if u["push_priority"] >= n["push_priority"] and dist < min_sep * 1.25:
						var move_dir = desired_vel.normalized()
						var perp = Vector2(-move_dir.y, move_dir.x)
						if perp.dot(neighbor_position - position) < 0.0:
							perp = -perp
						var push_vec = (perp * 0.75 + (-normal) * 0.25).normalized()
						n["pos"] = _clamp_to_walkable(neighbor_position + push_vec * speed * dt * 0.9, n["radius"], n["unit_type"] == "spire_walker")
						n["pushed_timer"] = 0.35

		var final_vel = desired_vel + steer_force
		var max_spd: float = speed * (1.5 if u["surge_timer"] > 0.0 else 1.0) * (1.8 if u["charge_timer"] > 0.0 else 1.0) * (0.5 if u["slow_timer"] > 0.0 else 1.0)
		if final_vel.length() > max_spd and max_spd > 0.0:
			final_vel = final_vel.normalized() * max_spd

		if final_vel.length_squared() > 0.001:
			u["pos"] = _clamp_to_walkable(position + final_vel * dt, radius, u["unit_type"] == "spire_walker")
			u["vel"] = final_vel

	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if u["is_structure"]:
			continue
		# Structures never moved between the passes; nearby mobiles moved by less
		# than a tick. The wider steering query already covers collision contacts.
		var neighbors: Array = neighbors_by_tag[tag] if neighbors_by_tag.has(tag) else query_units_in_radius(u["pos"], u["radius"] + 1.8)
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
				if n["is_structure"] or n["is_immobile"] or (not n.orders.is_empty() and n.orders[0].type == "hold_position"):
					u["pos"] = _clamp_to_walkable(u["pos"] + nrm * pen, u["radius"], u["unit_type"] == "spire_walker")
				elif u["is_immobile"] or (not u.orders.is_empty() and u.orders[0].type == "hold_position"):
					n["pos"] = _clamp_to_walkable(n["pos"] - nrm * pen, n["radius"], n["unit_type"] == "spire_walker")
				else:
					u["pos"] = _clamp_to_walkable(u["pos"] + nrm * (pen * 0.5), u["radius"], u["unit_type"] == "spire_walker")
					n["pos"] = _clamp_to_walkable(n["pos"] - nrm * (pen * 0.5), n["radius"], n["unit_type"] == "spire_walker")

func _clamp_to_walkable(p: Vector2, radius: float, ignore_cliffs: bool = false) -> Vector2:
	var res = Vector2(
		clampf(p.x, radius + 1.0, map_width - radius - 1.0),
		clampf(p.y, radius + 1.0, map_height - radius - 1.0)
	)
	if ignore_cliffs:
		return res
	if is_water_at(res, radius * 0.5):
		var cell = _find_nearest_walkable_cell(Vector2i(int(res.x / PATH_CELL_SIZE), int(res.y / PATH_CELL_SIZE)))
		res = (Vector2(cell) + Vector2(0.5, 0.5)) * PATH_CELL_SIZE
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

	var candidates = query_units_in_radius(u["pos"], scan_rad + 2.5, u["owner"])
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
	u.crowd_path.clear()
	u["vel"] = Vector2.ZERO
	u["facing"] = (target["pos"] - u["pos"]).angle()
	if u["weapon_cooldown"] > 0.0:
		return
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return
	u["attack_state"] = "windup"
	battle_stats.count(u.tag, "attack_starts")
	u["attack_target_tag"] = target["tag"]
	u["attack_cycle_elapsed"] = 0.0
	u["attack_state_timer"] = float(wpn.get("damage_point", 0.08))

func _execute_weapon_hit(attacker: Dictionary, primary_target: Dictionary) -> void:
	var def = RTSData.get_unit_def(attacker["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return

	var base_dmg = float(wpn.get("damage", 6.0))
	battle_stats.shot(attacker, tick)
	var bonus_dict: Dictionary = wpn.get("bonus", {})
	var splash_rad = float(wpn.get("splash_radius", 0.0))
	var slow_factor = float(wpn.get("concussive_slow", 0.0))

	var splashed: Array = []
	if splash_rad > 0.0:
		splashed = query_units_in_radius(primary_target["pos"], splash_rad)
	# A volley can contain multiple strikes. Resolve armor/shields per strike,
	# preserving one fire event (and audio cue) for the complete weapon attack.
	for _hit in range(maxi(1, int(wpn.get("attacks", 1)))):
		if primary_target["hp"] > 0.0:
			_apply_damage_to_target(attacker, primary_target, base_dmg, bonus_dict, 1.0)
			if slow_factor > 0.0 and not primary_target["is_structure"]:
				primary_target["slow_timer"] = 2.0
		for s in splashed:
			if s["tag"] == primary_target["tag"] or s["hp"] <= 0.0:
				continue
			if s["owner"] == attacker["owner"]:
				continue
			var d = primary_target["pos"].distance_to(s["pos"])
			if d > splash_rad:
				continue
			var mult = 0.5 if d <= splash_rad * 0.5 else 0.25
			_apply_damage_to_target(attacker, s, base_dmg, bonus_dict, mult, true)

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

func _apply_damage_to_target(attacker: Dictionary, target: Dictionary, base_dmg: float, bonus_dict: Dictionary, mult: float, splash: bool = false) -> void:
	if target["hp"] <= 0.0:
		return
	var before_hp: float = target["hp"]
	var before_shields: float = target["shields"]
	var dmg = base_dmg
	var attrs: Array = target.get("attributes", [])
	for attr in bonus_dict.keys():
		if attrs.has(attr):
			dmg += float(bonus_dict[attr])
	dmg = max(0.5, dmg * mult)

	target["out_of_combat_timer"] = 0.0
	emit_signal("unit_damaged", target["owner"], target["pos"])

	# Aegis Shields absorb damage before HP
	if target["shields"] > 0.0:
		if target["shields"] >= dmg:
			target["shields"] -= dmg
			attacker["damage_dealt"] += dmg
			battle_stats.damage(attacker, target, 0.0, dmg, 0.0, 0.0, splash, tick)
			return
		else:
			var overflow = dmg - target["shields"]
			attacker["damage_dealt"] += target["shields"]
			target["shields"] = 0.0
			dmg = overflow

	var hp_dmg = max(0.5, dmg - float(target.get("armor", 0.0)))
	target["hp"] = max(0.0, target["hp"] - hp_dmg)
	attacker["damage_dealt"] += hp_dmg
	battle_stats.damage(attacker, target, before_hp - target["hp"], before_shields - target["shields"],
		maxf(0.0, hp_dmg - before_hp), maxf(0.0, dmg - hp_dmg), splash, tick)

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
	if match_state.get("status", "") == "finished":
		return {"ok": false, "accepted": 0, "error": "Match has finished"}
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
		# Reject unavailable special abilities before canceling attack animations.
		if ctype == "phase_step" and (u.unit_type != "skirmisher" or u.phase_cooldown > 0.0):
			continue
		if ctype == "surge" and (u.unit_type not in ["rifleman", "breacher"] or u.hp <= 10.0):
			continue
		if ctype == "charge" and u.unit_type != "sunblade":
			continue
		if ctype == "move" and (u.is_structure or u.is_immobile):
			continue
		if ctype == "harvest" and not u.is_worker:
			continue
		if ctype == "rally" and RTSData.get_unit_def(u.unit_type).get("trains", []).is_empty():
			continue
		if ctype.begins_with("build_") or ctype == "build":
			var stype_check = ctype.trim_prefix("build_") if ctype != "build" else extra
			if not _can_build(u, stype_check, target_pos):
				continue

		if u["attack_state"] == "backswing" and ctype in ["move", "attack_move", "phase_step"]:
			battle_stats.count(u.tag, "recovery_cancels")
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0
			if players.has(u["owner"]):
				players[u["owner"]]["stutter_step_cancels"] += 1
		elif u["attack_state"] == "windup" and ctype in ["move", "stop", "phase_step"]:
			battle_stats.count(u.tag, "windup_cancels")
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0

		if ctype == "surge":
			if u["unit_type"] in ["rifleman", "breacher"] and u["hp"] > 10.0:
				u["hp"] -= 10.0
				battle_stats.count(u.tag, "self_damage", 10.0)
				battle_stats.count(u.tag, "surge_uses")
				u["surge_timer"] = 11.0
				accepted += 1
			continue

		elif ctype == "charge":
			if u["unit_type"] == "sunblade":
				u["charge_timer"] = 3.5
				accepted += 1
			continue

		elif ctype == "phase_step":
			if u["unit_type"] == "skirmisher" and u["phase_cooldown"] <= 0.0:
				var old_pos: Vector2 = u["pos"]
				var delta_b: Vector2 = target_pos - old_pos
				if delta_b.length() > 18.0:
					delta_b = delta_b.normalized() * 18.0
				var dest = _clamp_to_walkable(old_pos + delta_b, u["radius"], true)
				u["pos"] = dest
				u["prev_pos"] = dest
				u["home_pos"] = dest
				u["phase_cooldown"] = 7.0
				u["orders"].clear()
				u["path"].clear()
				u.crowd_path.clear()
				u.crowd_retry_tick = 0
				if players.has(u["owner"]):
					players[u["owner"]]["phase_steps_executed"] += 1
				emit_signal("unit_phased", old_pos, dest, u["tag"])
				accepted += 1
			continue

		elif ctype in ["emplace", "emplace"]:
			if u["unit_type"] == "howitzer":
				_morph_unit_in_place(u, "howitzer_emplaced")
				accepted += 1
			continue

		elif ctype in ["mobilize", "mobile_mode"]:
			if u["unit_type"] == "howitzer_emplaced":
				_morph_unit_in_place(u, "howitzer")
				accepted += 1
			continue

		elif ctype == "retract_silo":
			if u["unit_type"] == "silo":
				_morph_unit_in_place(u, "silo_retracted")
				accepted += 1
			continue

		elif ctype == "extend_silo":
			if u["unit_type"] == "silo_retracted":
				_morph_unit_in_place(u, "silo")
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
			u.crowd_path.clear()
			u.crowd_retry_tick = 0

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
				"structure_type": extra if extra != "" else "silo",
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

	return {"ok": accepted > 0, "accepted": accepted, "tick": tick}

func issue_SmartHarvest(worker_tag: int) -> void:
	if not units.has(worker_tag):
		return
	var u = units[worker_tag]
	var nearest = _find_nearest_crystal(u["pos"])
	if not nearest.is_empty():
		issue_command([worker_tag], "harvest", nearest["pos"], nearest["tag"])

func _morph_unit_in_place(u: Dictionary, new_type: String) -> void:
	var def = RTSData.get_unit_def(new_type)
	if def.is_empty():
		return
	u["unit_type"] = new_type
	u["name"] = str(def.get("name", new_type))
	u["speed"] = float(def.get("speed", 0.0))
	u["radius"] = float(def.get("radius", u.radius))
	u["sight_range"] = float(def.get("sight_range", u["sight_range"]))
	u["push_priority"] = int(def.get("push_priority", u["push_priority"]))
	u["is_immobile"] = bool(def.get("is_immobile", false))
	u["is_walkable_structure"] = bool(def.get("is_walkable_structure", false))
	# A mode switch cannot turn an unfinished old-gun wind-up into an early
	# shot from the new weapon. Preserve cooldown debt, cancel the animation.
	u["attack_state"] = "idle"
	u["attack_state_timer"] = 0.0
	u["attack_cycle_elapsed"] = 0.0
	u["orders"].clear()
	u["path"].clear()
	u.crowd_path.clear()
	u.crowd_retry_tick = 0
	u["vel"] = Vector2.ZERO
	if u["is_structure"]:
		nav_dirty = true

func _enqueue_unit_production(structure: Dictionary, unit_type: String) -> bool:
	if not structure["is_structure"] or structure["build_progress"] < 1.0:
		return false
	var u_def = RTSData.get_unit_def(unit_type)
	if u_def.is_empty():
		return false
	if not RTSData.get_unit_def(structure["unit_type"]).get("trains", []).has(unit_type):
		return false
	var p = players.get(structure["owner"], {})
	if p.is_empty():
		return false
	var m_cost = int(u_def.get("crystal_cost", 50))
	var v_cost = int(u_def.get("aether_cost", 0))
	var s_cost = int(u_def.get("supply_cost", 1))
	if p["crystal"] < m_cost:
		emit_signal("notice", structure["owner"], "Not enough crystal.", "error")
		return false
	if p["aether"] < v_cost:
		emit_signal("notice", structure["owner"], "Not enough aether.", "error")
		return false
	if p["supply_used"] + s_cost > p["supply_cap"]:
		emit_signal("notice", structure["owner"], "Supply blocked. Build more Provision Silos.", "error")
		return false
	if structure["production_queue"].size() >= 5:
		emit_signal("notice", structure["owner"], "Production queue is full.", "error")
		return false
	p["crystal"] -= m_cost
	p["aether"] -= v_cost
	structure["production_queue"].append({
		"unit_type": unit_type,
		"progress": 0.0,
		"total_time": max(2.5, float(u_def.get("build_time", 12.0)) * _build_time_scale())
	})
	_recompute_supplies()
	return true

func _build_time_scale() -> float:
	return 1.0 if not match_state.is_empty() else 0.25

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
	for pid in players:
		players[pid]["supply_cap"] = mini(200, players[pid]["supply_cap"])

func _find_nearest_town_hall(owner_id: int, pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for u in _town_halls:
		if u.owner == owner_id and u.build_progress >= 1.0 and u.hp > 0:
			var d = pos.distance_squared_to(u.pos)
			if d < best_d:
				best_d = d
				best = u
	return best

func _find_nearest_crystal(pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for r in resources.values():
		if r["resource_type"] == "crystal_field" and r["amount"] > 0:
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
			"phase_cooldown": snappedf(u["phase_cooldown"], 0.01),
			"attack_state": u["attack_state"],
			"surge_timer": snappedf(u["surge_timer"], 0.01),
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
			"amount": r["amount"],
			"unlimited": unlimited_resources
		})

	return {
		"tick": tick,
		"match": match_state.duplicate(true),
		"sim_time": snappedf(sim_time, 0.01),
		"scenario": scenario_name,
		"rts_mode": rts_mode,
		"perspective_player": perspective_player,
		"map": {
			"width": map_width,
			"height": map_height,
			"obstacles": _rects_to_dicts(terrain_obstacles),
			"high_ground": _rects_to_dicts(high_ground_zones),
			"ramps": _rects_to_dicts(ramps),
			"water": _water_to_arrays(), "bridges": _rects_to_dicts(land_bridges),
			"terrain_tiles": terrain_tiles.duplicate(true)
		},
		"players": players.duplicate(true),
		"units": unit_list,
		"resources": res_list,
		"recent_events": recent_events.slice(max(0, recent_events.size() - 15))
	}

func _water_to_arrays() -> Array:
	var out: Array = []
	for polygon in water_polygons:
		var points: Array = []
		for point in polygon:
			points.append([point.x, point.y])
		out.append(points)
	return out

func _rects_to_dicts(rects: Array[Rect2]) -> Array:
	var out: Array = []
	for r in rects:
		out.append({"x": r.position.x, "y": r.position.y, "w": r.size.x, "h": r.size.y})
	return out
