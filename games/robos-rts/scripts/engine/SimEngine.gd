extends Node

const TerrainGrid = preload("res://scripts/engine/RTSTerrainGrid.gd")

class MoveFormation extends RefCounted:
	var slots := {}
	var bins := {}
	var spacing := 0.0
	var rings: Array[PackedVector2Array] = []
	var first_open_ring := {}

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
signal archon_merged(first_tag: int, second_tag: int, archon_tag: int)
signal scenario_loaded(scenario_name: String)
signal paused_step
signal notice(owner_id: int, text: String, kind: String)
signal unit_damaged(owner_id: int, pos: Vector2)
signal militia_recruited(owner_id: int)
signal order_path_resolved(unit: Dictionary, order: Dictionary, requested: Vector2, endpoint: Vector2, status: String)
signal weapon_attack(attacker: Dictionary, target: Dictionary, weapon: Dictionary, hit_shields: bool)
signal ability_triggered(unit: Dictionary, ability_id: String, pos: Vector2)
signal resource_gathered(unit: Dictionary, resource_type: String, pos: Vector2)
signal resource_depleted(owner_id: int, resource_type: String)
signal unit_production_finished(unit: Dictionary, structure: Dictionary)
signal structure_construction_finished(structure: Dictionary)
signal match_finished

const TICK_RATE: int = 64
const TICK_DT: float = 1.0 / float(TICK_RATE)
const SUPPLY_REQUIRED_NOTICE := "Supply required."
const SILO_RAISE_TICKS := TICK_RATE
const SPLASH_INNER_RADIUS_RATIO := 0.5
const SPATIAL_CELL_SIZE: float = 8.0
const PATH_CELL_SIZE: float = 2.0
const NARROW_PATH_CELL_SIZE := PATH_CELL_SIZE * 0.5
const FOOTPRINT_LATTICE_MARGIN := 0.15
const BRUSH_REVEAL_RADIUS := 6.0
const WATCH_STATION_CAPTURE := 4.0
const WATCH_STATION_SIGHT := 32.0
const FOOTPRINT_BIN_SIZE := 8.0
const INFANTRY_CLEARANCE := 0.85
const MAX_GROUND_CLEARANCE := 2.0
const WALK_TRACE_STEP := PATH_CELL_SIZE * 0.6
const NO_FOOTPRINTS: Array = []
const HARVEST_REACH := 1.2
const GAS_WORKER_SLOTS := 3
const INCOME_WINDOW := 60
const CRYSTAL_LINE_RADIUS := 26.0
const CONSTRUCTION_REFUND := 0.75
const REPAIR_HP_PER_SECOND := 12.0
const AUTO_REPAIR_RADIUS := 8.0
const MAX_RALLY_WAYPOINTS := 8
const ATTACHMENT_PAD_OFFSET := Vector2(5.5, 0.0)
const ATTACHMENT_LANDING_SNAP := 2.0
const PRODUCTION_FLIGHT_HEIGHT := 8.0
const PRODUCTION_QUEUE_CAPACITY := 5
const PRODUCTION_EXIT_RETRY_TICKS := 8
const MAX_UPGRADE_LEVEL := 3
const HUB_ENERGY_MAX := 200.0
const HUB_POWER_COST := 50.0
const HUB_OPERATIONS_OFFER := {"crystal": 150, "aether": 50, "supply": 0, "time": 35.0, "requires": ["muster_hall"]}
const PROSPECTOR_LIFETIME_TICKS := 45 * TICK_RATE
const TRANSPORT_PICKUP_RADIUS := 6.5
const FIGHTER_TRANSITION_TICKS := 96
const MIASMA_COST := 50.0
const MIASMA_RANGE := 17.0
const MIASMA_RADIUS := 6.0
const MIASMA_WARNING_TICKS := 64
const MIASMA_DURATION_TICKS := 8 * 64
const TUNNEL_CAPACITY := 6
const TUNNEL_TRAVEL_TICKS := 2 * 64
const TUNNEL_EXIT_RETRY_TICKS := 16
const CARAPACE_MORPH_TICKS := 6 * 64
const CARAPACE_MORPH_OFFER := {"crystal": 75, "aether": 50, "supply": 1, "time": 6.0, "requires": ["blight_spire"], "def_id": "carapace_bulwark"}
const PHASE_BARRIER_COST := 50.0
const PHASE_BARRIER_RANGE := 14.0
const LATTICE_BURST_COST := 75.0
const LATTICE_BURST_RANGE := 16.0
const LATTICE_BURST_RADIUS := 5.0
const LATTICE_BURST_WARNING_TICKS := 64
const LATTICE_BURST_DURATION_TICKS := 128
const LATTICE_BURST_PULSE_TICKS := 32
const LATTICE_BURST_DAMAGE := 18.0
const PRODUCTION_BOOST_COST := 50.0
const PRODUCTION_BOOST_TICKS := 12 * TICK_RATE
const PRODUCTION_BOOST_RATE := 1.5
const DEFENSIVE_RECALL_COST := 50.0
const DEFENSIVE_RECALL_RADIUS := 8.0
const DEFENSIVE_RECALL_TICKS := 3 * TICK_RATE
const FAST_DEPLOYMENT_COOLDOWN_TICKS := 20 * TICK_RATE
const SWEEP_RADIUS := 16.0
const SWEEP_TICKS := 10 * TICK_RATE
const SALVAGE_TICKS := 5 * TICK_RATE
const REINFORCED_SUPPLY := 8
const BROOD_SLOTS := 3
const BROOD_RECHARGE := 12.0
const BROOD_SLOT_CAP := 5
const BROOD_INJECT_COST := 25.0
const BROOD_INJECT_RANGE := 7.0
const BROOD_INJECT_DELAY := 12 * TICK_RATE
const BROOD_INJECT_SLOTS := 2
const BURROW_SIGHT := 8.0
const POWER_RADIUS := 18.0
const CARRIER_POWER_RADIUS := 12.0
const CARRIER_POWER_TICKS := 24 * TICK_RATE
const CARRIER_REARM_TICKS := 18 * TICK_RATE
const CLOAK_ENERGY_MAX := 100.0
const CLOAK_START_ENERGY := 25.0
const CLOAK_DRAIN := 4.0
const SKIRMISH_MAPS := {"frontier-hunters": "Frontier Hunters", "iron-narrows": "Iron Narrows", "glassline-basin": "Glassline Basin"}
const Vision = preload("res://scripts/engine/RTSVision.gd")
const LivingGround = preload("res://scripts/engine/RTSLivingGround.gd")
const VISION_UPDATE_TICKS := 8

enum CrystalSelection { LINE_ASSIGNMENT, OPEN_SLOT, REACHABLE_PATCH }

var tick: int = 0
var sim_time: float = 0.0
var rng_seed: int = 42
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
var weapon_rng := RandomNumberGenerator.new()
var paused: bool = false
var network_clock := false
var network_ai_events: Callable
const LadderRules = preload("res://scripts/engine/RTSLadderRules.gd")
var ladder_rules := false
var _ladder_last_progress_tick := 0
var ladder_no_headquarters_since := [-1, -1]
var decor_enabled: bool = true
var last_step_count: int = 1
var rts_mode: String = "human"
var sim_speed: float = 1.0
var manual_step_requests: int = 0

var map_width: float = 128.0
var terrain_grid: TerrainGrid
var map_height: float = 96.0
var scenario_name: String = "Starfall Canyon — Humans vs Monsters vs Aliens"

var terrain_obstacles: Array[Rect2] = []
var high_ground_zones: Array[Rect2] = []
var ramps: Array[Rect2] = []
var _ground_ledges: Array[Rect2] = []
var _ledge_plateaus: Array[Rect2] = []
var _ledge_ramps: Array[Rect2] = []
var water_polygons: Array[PackedVector2Array] = []
var land_bridges: Array[Rect2] = []
var water_cells: Dictionary = {}
var ground_regions: Array[PackedVector2Array] = []
var bridge_decks: Array[PackedVector2Array] = []
var unlimited_resources: bool = false
var terrain_tiles: Array = []
var _brush_cells: Dictionary = {}
var watch_stations: Array[Dictionary] = []
var miasma_zones: Array[Dictionary] = []
var canticle_storms: Array[Dictionary] = []
var fungal_projectiles: Array[Dictionary] = []
var fungal_infections: Dictionary = {}
var microbial_shrouds: Array[Dictionary] = []
var neural_tethers: Dictionary = {}
var brood_tunnel_cargo: Dictionary = {}
var blinding_clouds: Array[Dictionary] = []
var parasitic_clouds: Array[Dictionary] = []
var time_warps: Array[Dictionary] = []
var emp_projectiles: Array[Dictionary] = []
var watchkeeper_missiles: Array[Dictionary] = []
var sentinel_missiles: Array[Dictionary] = []
var sentry_missiles: Array[Dictionary] = []
var archon_approaches: Dictionary = {}
var guardian_shields: Dictionary = {}
var caustic_strikes: Array[Dictionary] = []
var unseen_weapon_hits: Dictionary = {}
var lattice_bursts: Array[Dictionary] = []
var ridge_charges: Array[Dictionary] = []
const RIDGE_CHARGE_RANGE := 12.5
const RIDGE_CHARGE_RADIUS := 5.0
const RIDGE_CHARGE_DELAY_TICKS := 2 * TICK_RATE
const RIDGE_CHARGE_COOLDOWN_TICKS := 14 * TICK_RATE

var players: Dictionary = {}
var next_tag: int = 1001
var units: Dictionary = {}
var resources: Dictionary = {}
var spatial_grid: Dictionary = {}
var _spatial_by_owner: Dictionary = {}
var astar_grid: AStarGrid2D = AStarGrid2D.new()
var nav_dirty: bool = true
var _navigation_revision := 0

var recent_events: Array[Dictionary] = []
var _defensive_recalls: Dictionary = {}
var command_history: Array[Dictionary] = []
var _accum_time: float = 0.0

# Map Editor <-> playtest handoff: holds the editor document while RTSMain playtests it.
var editor_session: Dictionary = {}
var startup_complete := false
var resume_from_title := false
var title_battle_view: Dictionary = {}
var match_state: Dictionary = {}
const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const Mutators = preload("res://scripts/engine/RTSCampaignMutators.gd")
var campaign: Campaign
var _skirmish_source: Dictionary = {}
var vision: Vision
var living_ground := LivingGround.new(128.0, 96.0)
var frame_sim_usec: int = 0
var frame_sim_ticks: int = 0
var profile_usec: Dictionary = {"navigation": 0, "orders": 0, "steering": 0, "ai": 0, "vision": 0}
var _static_structures: Array[Dictionary] = []
var _footprint_bins: Dictionary = {}
var _clearance_grids: Dictionary = {}
var _max_unit_radius: float = 4.5
var _town_halls: Array[Dictionary] = []
var _detectors: Array[Dictionary] = []
var _gas_source_by_tap: Dictionary = {}
var _gas_tap_by_vent: Dictionary = {}
var _income_buckets: Dictionary = {}

func _ready() -> void:
	var env_mode = OS.get_environment("RTS_MODE")
	if env_mode != "":
		rts_mode = env_mode.to_lower()
	elif DisplayServer.get_name() == "headless":
		rts_mode = "backend"
	rng.seed = rng_seed
	call_deferred("_load_startup_scenario")

func _load_startup_scenario() -> void:
	startup_complete = true
	var scene := get_tree().current_scene
	if scene and scene.has_method("waiting_on_title") and scene.waiting_on_title():
		scenario_name = "Starfall Command"
		paused = true
		return
	var args = OS.get_cmdline_user_args()
	for arg in args:
		if arg.begins_with("--scenario="):
			var res = load_scenario_file(arg.split("=", true, 1)[1])
			if bool(res.get("ok", false)):
				return
			push_warning("[SimEngine] %s" % res.get("error", "Failed to load scenario"))
	load_default_scenario()

func _process(delta: float) -> void:
	frame_sim_usec = 0
	frame_sim_ticks = 0
	if rts_mode == "backend" or network_clock or paused or _scenario_finished():
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
	ladder_rules = false
	_ladder_last_progress_tick = 0
	ladder_no_headquarters_since = [-1, -1]
	RTSData.ladder_active = false
	tick = 0
	sim_time = 0.0
	rng_seed = new_seed
	rng.seed = rng_seed
	weapon_rng.seed = rng_seed ^ 0x2406cb23
	map_width = width
	map_height = height
	living_ground = LivingGround.new(width, height)
	next_tag = 1001
	units.clear()
	resources.clear()
	_footprint_bins.clear()
	_income_buckets.clear()
	nav_dirty = true
	_navigation_revision = 0
	spatial_grid.clear()
	_spatial_by_owner.clear()
	terrain_obstacles.clear()
	terrain_grid = null
	high_ground_zones.clear()
	ramps.clear()
	_ground_ledges.clear()
	_ledge_plateaus.clear()
	_ledge_ramps.clear()
	water_polygons.clear()
	land_bridges.clear()
	water_cells.clear()
	ground_regions.clear()
	bridge_decks.clear()
	unlimited_resources = false
	terrain_tiles.clear()
	_brush_cells.clear()
	watch_stations.clear()
	miasma_zones.clear()
	canticle_storms.clear()
	fungal_projectiles.clear()
	fungal_infections.clear()
	microbial_shrouds.clear()
	neural_tethers.clear()
	brood_tunnel_cargo.clear()
	blinding_clouds.clear()
	parasitic_clouds.clear()
	time_warps.clear()
	emp_projectiles.clear()
	watchkeeper_missiles.clear()
	sentinel_missiles.clear()
	sentry_missiles.clear()
	archon_approaches.clear()
	guardian_shields.clear()
	caustic_strikes.clear()
	unseen_weapon_hits.clear()
	lattice_bursts.clear()
	ridge_charges.clear()
	recent_events.clear()
	_defensive_recalls.clear()
	command_history.clear()
	match_state.clear()
	campaign = null
	resume_from_title = false
	title_battle_view.clear()
	_skirmish_source = {}
	vision = null
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
			"upgrades": {"weapons": 0, "armor": 0},
			"surge_efficiency": false,
			"fast_deployment": false,
			"crystal_collected": 0,
			"aether_collected": 0,
			"units_killed": 0,
			"units_trained": 0,
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

func load_scenario_dict(data: Dictionary, campaign_index: int = -1, difficulty: String = "normal", mutations: Array = []) -> Dictionary:
	for id in mutations:
		if not Mutators.ACTIVE.has(id):
			return {"ok": false, "error": "Unknown or unavailable mutator: %s" % str(id)}
	if str(data.get("mode", "")) == "skirmish":
		return _load_skirmish(data)
	var s_seed = int(data.get("seed", 42))
	var map_cfg = data.get("map", {})
	var w = float(map_cfg.get("width", 128.0))
	var h = float(map_cfg.get("height", 96.0))
	var grid: TerrainGrid
	if map_cfg.has("terrain_grid"):
		grid = TerrainGrid.new()
		if w <= 0.0 or h <= 0.0 or not grid.load_grid(str(map_cfg.terrain_grid), Vector2i(w, h)):
			return {"ok": false, "error": "Invalid scenario terrain grid"}
	reset_state(s_seed, w, h)
	terrain_grid = grid
	ladder_rules = campaign_index < 0 and data.get("ruleset", "") == LadderRules.ID
	RTSData.ladder_active = ladder_rules
	scenario_name = str(data.get("name", data.get("rdfs:label", "Custom RTS Scenario")))
	paused = bool(data.get("paused", false))
	decor_enabled = bool(data.get("decor", true))
	unlimited_resources = bool(data.get("unlimited_resources", false))
	_configure_water(map_cfg)
	_configure_watch_stations(map_cfg)
	_spawn_route_blockers(map_cfg)
	if data.get("victory", "") == "all_structures":
		players.erase(3)
		match_state = {"mode": "annihilation_fixture", "status": "playing", "winner": 0, "reason": ""}

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
			str(res.get("id", "")),
			bool(res.get("rich", false))
		)

	for u in data.get("units", []):
		var count = int(u.get("count", 1))
		var base_x = float(u.get("x", 30.0))
		var base_y = float(u.get("y", 30.0))
		var utype = str(u.get("type", "rifleman"))
		var owner_id = int(u.get("owner", u.get("player", 1)))
		if campaign_index == Campaign.DEFENSE and difficulty == "casual" and owner_id == 1 and utype in Campaign.CASUAL_DISABLED_STRUCTURES:
			continue
		var spread = float(u.get("spread", 2.1))
		var cols = max(1, int(ceil(sqrt(float(count)))))
		for idx in range(count):
			var r = idx / cols
			var c = idx % cols
			var pos = Vector2(base_x + c * spread, base_y + r * spread) if count > 1 else Vector2(base_x, base_y)
			var spawned = spawn_unit(utype, owner_id, pos, str(u.get("id", "")) if count == 1 else "", float(u.get("build_progress", 1.0)))
			if campaign_index >= 0 and Campaign.CONSTRUCTION_TIMES.has(utype):
				spawned.build_total_time = Campaign.CONSTRUCTION_TIMES[utype]
			if u.has("hp"):
				spawned["hp"] = float(u.get("hp"))
			if u.has("shields"):
				spawned["shields"] = float(u.get("shields"))
			if bool(u.get("auto_harvest", false)):
				issue_SmartHarvest(spawned["tag"])

	_rebuild_astar_grid()
	_recompute_supplies()
	RTSCommanderAI.configure_from_scenario(data.get("directives", []))
	_start_vision(bool(data.get("fog_of_war", false)))
	if campaign_index >= 0:
		campaign = Campaign.new(self, campaign_index, difficulty)
		if not mutations.is_empty():
			var enabled := []
			for id in Mutators.ACTIVE:
				if id in mutations:
					enabled.append(id)
			campaign.mutators = Mutators.new(self, enabled)
		sim_speed = campaign.playback_speed()
		if campaign.mutators != null or difficulty in ["hard", "brutal"]:
			_refresh_vision()
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

func load_scenario_file(slug_or_path: String, difficulty: String = "normal", mutations: Array = []) -> Dictionary:
	if difficulty not in Campaign.DIFFICULTIES:
		return {"ok": false, "error": "Unknown campaign difficulty."}
	var file_path = resolve_scenario_path(slug_or_path)
	if file_path == "":
		return {"ok": false, "error": "Scenario file not found: " + slug_or_path}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(file_path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Scenario is not a JSON object: " + file_path}
	return load_scenario_dict(parsed, Campaign.mission_for_path(file_path), difficulty, mutations)

func start_campaign(index: int, difficulty: String = "normal", mutations: Array = []) -> Dictionary:
	if index < 0 or index >= Campaign.MISSIONS.size():
		return {"ok": false, "error": "Unknown campaign mission."}
	return load_scenario_file(Campaign.MISSIONS[index].id, difficulty, mutations)

func start_skirmish(map_id: String = "frontier-hunters", options: Dictionary = {}) -> Dictionary:
	if not SKIRMISH_MAPS.has(map_id):
		return {"ok": false, "error": "Unknown skirmish map."}
	var data := skirmish_map_config(map_id)
	if data.is_empty():
		return {"ok": false, "error": "Could not load the selected skirmish map."}
	for key in ["seed", "difficulty", "strategy", "unlimited_resources", "player_faction", "ai_faction"]:
		if options.has(key):
			data[key] = options[key]
	return _load_skirmish(data)

func start_online_match(map_id: String, match_seed: int, factions: Array, watch_ai := false) -> Dictionary:
	var data := skirmish_map_config(map_id)
	if data.is_empty() or factions.size() != 2:
		return {"ok": false, "error": "Invalid online match setup"}
	data.merge({"seed": match_seed, "player_faction": factions[0], "ai_faction": factions[1],
		"unlimited_resources": false, "fog_of_war": true, "online": true, "watch_ai": watch_ai,
		"difficulty": "hard" if watch_ai else data.get("difficulty", "normal"),
		"strategy": "rush" if watch_ai else data.get("strategy", "balanced")}, true)
	return _load_skirmish(data)

func skirmish_map_config(map_id: String) -> Dictionary:
	if not SKIRMISH_MAPS.has(map_id):
		return {}
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/%s.jsonld" % map_id))
	return data if data is Dictionary else {}

# Only the two assigned seats participate; unoccupied sites are expansions.
# A provided seed replays the same assignment; ordinary new games use fresh seeds.
func _load_skirmish(data: Dictionary) -> Dictionary:
	var map_cfg: Dictionary = data.get("map", {})
	var starts: Array = map_cfg.get("starts", [])
	var difficulty = str(data.get("difficulty", "normal"))
	var strategy = str(data.get("strategy", "balanced"))
	var player_faction := str(data.get("player_faction", RTSData.FACTION_HUMANS))
	var ai_faction := str(data.get("ai_faction", RTSData.FACTION_HUMANS))
	for choice in [player_faction, ai_faction]:
		if choice != "random" and not RTSData.faction_info.has(choice):
			return {"ok": false, "error": "Unknown skirmish faction."}
	if starts.size() < 2 or starts.size() > 8 or not difficulty in ["easy", "normal", "hard"] or not strategy in ["rush", "balanced", "economy", "siege"]:
		return {"ok": false, "error": "Expected 2–8 starts and a supported difficulty/strategy"}
	var match_seed = int(data.get("seed", Time.get_unix_time_from_system() * 1000.0 + Time.get_ticks_msec()))
	reset_state(match_seed, float(map_cfg.get("width", 256)), float(map_cfg.get("height", 256)))
	_skirmish_source = data.duplicate(true)
	_skirmish_source["seed"] = match_seed
	unlimited_resources = bool(data.get("unlimited_resources", true))
	_configure_water(map_cfg)
	_configure_watch_stations(map_cfg)
	_spawn_route_blockers(map_cfg)
	players.erase(3)
	var online := bool(data.get("online", false))
	var watch_ai := bool(data.get("watch_ai", false))
	ladder_rules = watch_ai
	RTSData.ladder_active = ladder_rules
	scenario_name = str(data.get("name", "Frontier Hunters — 1 Player vs AI"))
	if online:
		scenario_name = scenario_name.split(" — ", true, 1)[0] + " — Online 1v1"
	var slots: Array = range(starts.size())
	for i in range(starts.size() - 1, 0, -1):
		var j = rng.randi_range(0, i)
		var temp = slots[i]
		slots[i] = slots[j]
		slots[j] = temp
	# Faction rolls do not change which starting sites a given seed selects.
	var choices := {"1": player_faction, "2": ai_faction}
	var factions := resolve_factions(match_seed, choices)
	match_state = {"mode": "online_ai_1v1" if watch_ai else ("online_1v1" if online else "1p_vs_ai"), "status": "playing", "winner": 0, "reason": "", "seed": match_seed,
		"map_id": str(data.get("map_id", "custom")),
		"difficulty": difficulty, "strategy": strategy, "unlimited_resources": unlimited_resources,
		"starts": starts.duplicate(true), "expansions": map_cfg.get("expansions", []).duplicate(true),
		"assigned_starts": {"1": slots[0], "2": slots[1]}, "factions": factions, "faction_choices": choices}
	if ladder_rules:
		match_state["ruleset"] = LadderRules.ID
	for obs in map_cfg.get("obstacles", []):
		terrain_obstacles.append(Rect2(float(obs.x), float(obs.y), float(obs.w), float(obs.h)))
	var resource_sites = starts + map_cfg.get("expansions", [])
	var crystal_lines := {}
	var crystal_stock := 50000 if unlimited_resources else 1500
	var aether_stock := 50000 if unlimited_resources else LadderRules.GAS_STOCK
	for slot in range(resource_sites.size()):
		var site: Dictionary = resource_sites[slot]
		var base = Vector2(float(site.x), float(site.y))
		var outward = (base - Vector2(map_width, map_height) * 0.5).normalized()
		var tangent = Vector2(-outward.y, outward.x)
		for i in range(8):
			var stock: int = LadderRules.MINERAL_STOCK[i] if ladder_rules else crystal_stock
			var patch := spawn_resource("crystal_field", _resource_land_position(base + outward * 13.0 + tangent * (float(i) - 3.5) * 3.6), stock, "start_%d_crystal_%d" % [slot, i])
			patch["line_origin"] = base
			if i == 0:
				crystal_lines[slot] = patch
		for side in [-1, 1]:
			spawn_resource("aether_vent", _resource_land_position(base + tangent * side * 17.0), aether_stock, "start_%d_aether_%d" % [slot, side])
	if data.has("resources"):
		resources.clear()
		crystal_lines.clear()
		next_tag = 1001
		for resource in data.resources:
			spawn_resource(str(resource.type), Vector2(float(resource.x), float(resource.y)), int(resource.get("amount", 1500)), str(resource.get("id", "")), bool(resource.get("rich", false)))
	for pid in [1, 2]:
		var faction: String = factions[str(pid)]
		var roster: Dictionary = RTSData.faction_info[faction]
		players[pid]["faction"] = faction
		players[pid]["name"] = "Commander %d" % pid if online else ("Commander" if pid == 1 else "AI Commander")
		players[pid]["crystal"] = 50
		players[pid]["aether"] = 0
		var start: Dictionary = starts[slots[pid - 1]]
		var base = Vector2(float(start.x), float(start.y))
		var town_hall := spawn_unit(roster.town_hall, pid, base)
		if ladder_rules and faction == RTSData.FACTION_MONSTERS:
			_grant_larvae(town_hall, BROOD_SLOTS - town_hall.brood_slots)
			spawn_unit("drift_sac", pid, base + Vector2(0.0, -10.0))
		for i in range(12):
			var angle = TAU * float(i) / 12.0
			var worker = spawn_unit(roster.worker, pid, base + Vector2(cos(angle), sin(angle)) * 7.0)
			issue_SmartHarvest(worker.tag, crystal_lines.get(slots[pid - 1], {}))
	_rebuild_astar_grid()
	_recompute_supplies()
	RTSCommanderAI.configure_from_scenario([])
	if not online or watch_ai:
		RTSCommanderAI.set_skirmish_directive(2, difficulty, strategy)
	if watch_ai:
		RTSCommanderAI.set_skirmish_directive(1, difficulty, strategy)
	_start_vision(bool(data.get("fog_of_war", true)))
	emit_signal("scenario_loaded", scenario_name)
	return {"ok": true, "scenario": scenario_name, "match": match_state.duplicate(true)}

func resolve_factions(seed_value: int, choices: Dictionary) -> Dictionary:
	var ids := RTSData.faction_info.keys()
	var faction_rng := RandomNumberGenerator.new()
	faction_rng.seed = seed_value ^ 0x348ba701
	var factions := {}
	for seat in ["1", "2"]:
		var rolled: String = ids[faction_rng.randi_range(0, ids.size() - 1)]
		factions[seat] = rolled if choices[seat] == "random" else choices[seat]
	return factions

func _start_vision(enabled: bool) -> void:
	if not _brush_cells.is_empty() or not watch_stations.is_empty():
		_rebuild_spatial_grid()
	if enabled:
		vision = Vision.new(map_width, map_height, players.keys())
		if terrain_grid or not high_ground_zones.is_empty() or not ramps.is_empty():
			vision.configure_elevation(get_elevation_at)
	_refresh_vision()

func _configure_watch_stations(map_cfg: Dictionary) -> void:
	var bounds := Rect2(0, 0, map_width, map_height)
	var entries = map_cfg.get("watch_stations", [])
	if not entries is Array:
		return
	for entry in entries:
		if not entry is Dictionary:
			continue
		var position := Vector2(float(entry.get("x", -1)), float(entry.get("y", -1)))
		if bounds.has_point(position):
			watch_stations.append({"pos": position, "owner": 0})

func _refresh_vision() -> void:
	for station in watch_stations:
		var owner := 0
		for unit in query_units_in_radius(station.pos, WATCH_STATION_CAPTURE):
			if (unit.is_structure or unit.flight_height > 0.0 or unit.get("burrowed", false)
					or unit.get("nonblocking", false) or unit.hp <= 0.0 or not players.has(unit.owner)):
				continue
			if unit.pos.distance_squared_to(station.pos) > WATCH_STATION_CAPTURE * WATCH_STATION_CAPTURE:
				continue
			if owner != 0 and owner != unit.owner:
				owner = 0
				break
			owner = unit.owner
		station.owner = owner
	if vision != null:
		var started := Time.get_ticks_usec()
		vision.update(units, tick, watch_stations, WATCH_STATION_SIGHT, _public_ladder_structure if ladder_rules else Callable())
		profile_usec.vision += Time.get_ticks_usec() - started

func visible_watch_station_owner(station: Dictionary, player: int) -> int:
	return station.owner if can_see_position(player, station.pos) else 0

func _spawn_route_blockers(map_cfg: Dictionary) -> void:
	var bounds := Rect2(0, 0, map_width, map_height)
	var entries = map_cfg.get("route_blockers", [])
	if not entries is Array:
		return
	for entry in entries:
		if not entry is Dictionary:
			continue
		var position := Vector2(float(entry.get("x", -1)), float(entry.get("y", -1)))
		if bounds.has_point(position):
			spawn_unit("shale_barrier", 0, position, str(entry.get("id", "")))

func can_see_position(player: int, pos: Vector2) -> bool:
	return vision == null or player == 0 or vision.state_at(player, pos) == Vision.VISIBLE

func has_living_ground(position: Vector2, owner: int = 0) -> bool:
	return living_ground.covers(position, owner)

func has_active_living_ground(position: Vector2, owner: int) -> bool:
	return living_ground.covers(position, owner, true)

func visible_living_ground_cells(player: int) -> Array[Vector2i]:
	var visible: Array[Vector2i] = []
	for cell in living_ground.cells:
		if can_see_position(player, living_ground.cell_center(cell)):
			visible.append(cell)
	return visible

func _can_spread_living_ground(from: Vector2, to: Vector2) -> bool:
	if is_water_at(to, LivingGround.CELL_SIZE * 0.4) or is_water_at(from.lerp(to, 0.5), 0.45):
		return false
	for obstacle in terrain_obstacles:
		if obstacle.grow(1.25).has_point(to) or _walk_segment_enters_rect(from, to, obstacle):
			return false
	return true

func can_see_unit(player: int, unit: Dictionary) -> bool:
	if unit.get("dread_in_transit", false) or unit.get("gas_extracting", false):
		return false
	if player == 0 or unit.owner == player:
		return true
	if int(unit.get("revealed_to", {}).get(player, 0)) > tick:
		return true
	if unit.is_structure and _public_ladder_structure(unit):
		return true
	if not can_see_position(player, unit.pos):
		return false
	var burrow_conceals := bool(unit.get("burrowed", false))
	if unit.unit_type == "sentinel_mine_armed":
		burrow_conceals = int(unit.get("mine_ready", 0)) <= tick or bool(players[unit.owner].upgrades.get("drilling_claws", 0))
	var requires_detection := bool(unit.get("cloaked", false)) or burrow_conceals or flagship_cloaks(unit)
	if requires_detection and (fungal_grasp_active(unit) or int(unit.get("stasis_until", 0)) > tick):
		return true
	if requires_detection and systems_jammed(unit):
		return true
	if requires_detection and not unit.get("burrowed", false) and int(unit.get("emp_reveal_until", 0)) > tick:
		return true
	if requires_detection and neural_tethers.has(unit.tag):
		return true
	var concealed: bool = not _brush_cells.is_empty() and not unit.is_structure and not unit.is_worker and unit.flight_height <= 0.0 and unit.attributes.has("Biological") and _brush_cells.has(Vector2i((unit.pos / 4.0).floor()))
	if not requires_detection and not concealed:
		return true
	if _position_detected(player, unit.pos):
		return true
	if not requires_detection:
		for scout in query_units_in_radius(unit.pos, BRUSH_REVEAL_RADIUS):
			if scout.owner == player and scout.hp > 0.0 and scout.build_progress >= 1.0 and scout.pos.distance_squared_to(unit.pos) <= BRUSH_REVEAL_RADIUS * BRUSH_REVEAL_RADIUS:
				return true
	return false

func _position_detected(player: int, point: Vector2) -> bool:
	if vision != null and vision.sweep_detects(player, point):
		return true
	for detector in _detectors:
		if detector.owner == player and detector_is_active(detector) and point.distance_squared_to(detector.pos) <= detector.detection_radius ** 2:
			return true
	return false

func can_identify_hallucination(player: int, unit: Dictionary) -> bool:
	return (unit.get("hallucinated", false) and (player == 0 or player == unit.owner
		or (can_see_position(player, unit.pos) and _position_detected(player, unit.pos))))

func is_hostile_contact(player: int, unit: Dictionary) -> bool:
	return unit.owner > 0 and unit.owner != player and int(unit.get("disguise_owner", -1)) != player

func detector_is_active(detector: Dictionary) -> bool:
	return float(detector.get("detection_radius", 0.0)) > 0.0 and detector.hp > 0.0 and detector.build_progress >= 1.0 \
		and (not requires_power(detector.unit_type) or is_powered(detector.owner, detector.pos))

func remembered_buildings(player: int) -> Array:
	if vision == null:
		return []
	return vision.buildings_for(player).filter(func(building):
		return not can_see_position(player, building.pos) and not _public_ladder_structure(building))

func _check_match_result() -> void:
	if match_state.get("status", "") != "playing":
		return
	var remaining = {1: 0, 2: 0}
	var has_headquarters := [false, false]
	for u in units.values():
		if u.hp > 0 and remaining.has(u.owner) and _qualifies_for_elimination(u):
			remaining[u.owner] += 1
			if ladder_rules and u.get("is_town_hall", false):
				has_headquarters[int(u.owner) - 1] = true
	if ladder_rules:
		for index in range(has_headquarters.size()):
			if has_headquarters[index]:
				ladder_no_headquarters_since[index] = -1
			elif ladder_no_headquarters_since[index] < 0:
				ladder_no_headquarters_since[index] = tick
	if remaining[1] == 0 or remaining[2] == 0:
		var winner = 0 if remaining[1] == 0 and remaining[2] == 0 else (2 if remaining[1] == 0 else 1)
		_finish_match(winner, "all_structures_destroyed")
	elif ladder_rules and tick - _ladder_last_progress_tick >= LadderRules.STALEMATE_DRAW_SECONDS * TICK_RATE:
		_finish_match(0, "stalemate")

func _qualifies_for_elimination(unit: Dictionary) -> bool:
	return unit.is_structure and (not ladder_rules or unit.unit_type not in LadderRules.NON_ELIMINATION_STRUCTURES)

func ladder_structures_revealed(owner: int) -> bool:
	if not ladder_rules or owner < 1 or owner > 2:
		return false
	var since: int = ladder_no_headquarters_since[owner - 1]
	return since >= 0 and tick - since >= LadderRules.HEADQUARTERS_REVEAL_SECONDS * TICK_RATE

func _public_ladder_structure(building: Dictionary) -> bool:
	return ladder_structures_revealed(building.owner) and building.unit_type not in LadderRules.NON_ELIMINATION_STRUCTURES

func stalemate_seconds_remaining() -> int:
	var elapsed := tick - _ladder_last_progress_tick
	if not ladder_rules or match_state.get("status") != "playing" or elapsed < LadderRules.STALEMATE_WARNING_SECONDS * TICK_RATE:
		return 0
	return ceili(float(LadderRules.STALEMATE_DRAW_SECONDS * TICK_RATE - elapsed) / TICK_RATE)

func radar_contacts(owner: int) -> PackedVector2Array:
	var positions := PackedVector2Array()
	if not ladder_rules or vision == null or owner == 0:
		return positions
	var tracked := {}
	for beacon in units.values():
		if beacon.owner != owner or beacon.unit_type != "radar_beacon" or beacon.build_progress < 1.0:
			continue
		for contact in query_units_in_radius(beacon.pos, LadderRules.RADAR_RADIUS, owner):
			if (contact.is_structure or contact.get("nonblocking", false) or contact.get("cloaked", false)
					or contact.get("burrowed", false) or flagship_cloaks(contact) or tracked.has(contact.tag)):
				continue
			if (is_hostile_contact(owner, contact) and not can_see_unit(owner, contact)
					and beacon.pos.distance_squared_to(contact.pos) <= LadderRules.RADAR_RADIUS ** 2):
				tracked[contact.tag] = true
				positions.append(contact.pos)
	return positions

func surrender(player_id: int) -> Dictionary:
	if match_state.get("status", "") != "playing" or not player_id in [1, 2]:
		return {"ok": false, "error": "No active match for that player"}
	_finish_match(3 - player_id, "surrender")
	return {"ok": true, "match": match_state.duplicate(true)}

func rematch() -> Dictionary:
	if _skirmish_source.is_empty() or match_state.get("status") != "finished":
		return {"ok": false, "error": "Finish a skirmish before starting a same-seed rematch."}
	var speed := sim_speed
	var result := _load_skirmish(_skirmish_source)
	sim_speed = speed
	return result

func _finish_match(winner: int, reason: String) -> void:
	match_state["status"] = "finished"
	match_state["winner"] = winner
	match_state["reason"] = reason
	match_state["finished_tick"] = tick
	var scores := {}
	for owner in players:
		var row := {}
		for stat in ["crystal_collected", "aether_collected", "units_trained", "units_lost", "structures_built"]:
			row[stat] = players[owner][stat]
		scores[str(owner)] = row
	match_state["scorecard"] = scores
	emit_signal("notice", 1, "Victory" if winner == 1 else ("Draw" if winner == 0 else "Defeat"), "info")
	if match_state.get("mode") == "online_1v1":
		emit_signal("notice", 2, "Victory" if winner == 2 else ("Draw" if winner == 0 else "Defeat"), "info")
	emit_signal("match_finished")

func unit_definition_for(unit_type: String, owner_id: int) -> Dictionary:
	if unit_type == "sentry_turret" and owner_id == 1 and campaign != null and campaign.mission_index == Campaign.DEFENSE:
		return campaign.defense_turret_definition
	return RTSData.get_unit_def(unit_type)

func _can_build(worker: Dictionary, structure_type: String, pos: Vector2) -> bool:
	var def := unit_definition_for(structure_type, worker.owner)
	if not worker.is_worker or worker.unit_type == "prospector" or not bool(def.get("is_structure", false)) or def.has("attachment_for") or def.get("faction", "") != worker.faction:
		return false
	if def.get("campaign_only", false) and (campaign == null or worker.owner != 1):
		return false
	if def.get("morph_only", false) or (def.get("ladder_only", false) and not ladder_rules):
		return false
	if campaign != null and worker.owner == 1 and structure_type not in campaign.roster.structures:
		return false
	for required in def.get("requires", []):
		if not has_tech_structure(worker.owner, str(required)):
			return false
	if not alternative_tech_met(worker.owner, def.get("requires_any", [])):
		return false
	if requires_power(structure_type) and not is_powered(worker.owner, pos):
		return false
	if def.get("requires_living_ground", false) and (not can_see_position(worker.owner, pos) or not has_active_living_ground(pos, worker.owner)):
		return false
	return can_place_structure(structure_type, pos)

func alternative_tech_met(owner_id: int, alternatives: Array) -> bool:
	return alternatives.is_empty() or alternatives.any(func(required): return has_tech_structure(owner_id, str(required)))

func has_tech_structure(owner_id: int, type_id: String) -> bool:
	var retracted_type := type_id + "_retracted"
	for unit in units.values():
		if unit.owner != owner_id or not unit.is_structure or unit.build_progress < 1.0 or unit.get("campaign_reserve", false):
			continue
		if unit.unit_type == type_id or unit.unit_type == retracted_type or (type_id == "waystone" and unit.unit_type == "transit_waystone"):
			return true
		if type_id == "colony_hub" and unit.unit_type == "fortified_hub":
			return true
		if unit.has("structure_form"):
			var form: String = unit.structure_form
			if form == type_id or (type_id == "brood_lair" and form == "brood_hive"):
				return true
	return false

func requires_power(structure_type: String) -> bool:
	return structure_type in ["aegis_relay", "aegis_capacitor", "concord_core", "transit_waystone", "twilight_array",
		"prism_forge", "robotics_foundry", "robotics_annex", "canticle_archive", "veil_sanctum", "star_assembly", "fleet_spire"] \
		or (structure_type == "waystone" and (ladder_rules or not match_state.is_empty()))

func is_powered(owner_id: int, pos: Vector2) -> bool:
	for unit in units.values():
		if unit.owner == owner_id and (unit.unit_type == "resonator" or unit.unit_type == "lumen_carrier") and power_source_covers(unit, pos):
			return true
	return false

func power_source_radius(unit: Dictionary) -> float:
	if unit.build_progress < 1.0:
		return 0.0
	if unit.unit_type == "resonator":
		return float(RTSData.get_unit_def("resonator").get("power_radius", POWER_RADIUS))
	if unit.unit_type == "lumen_carrier" and carrier_power_active(unit):
		return LadderRules.CARRIER_FIELD_RADIUS if ladder_rules else CARRIER_POWER_RADIUS
	return 0.0

func power_source_covers(unit: Dictionary, pos: Vector2) -> bool:
	var radius := power_source_radius(unit)
	return radius > 0.0 and unit.pos.distance_squared_to(pos) <= radius * radius

func carrier_power_ticks(unit: Dictionary) -> int:
	return maxi(0, int(unit.get("power_field_until", 0)) - tick)

func carrier_power_active(unit: Dictionary) -> bool:
	return unit.get("carrier_anchored", false) or carrier_power_ticks(unit) > 0

func carrier_rearm_ticks(unit: Dictionary) -> int:
	return maxi(0, int(unit.get("power_field_rearm", 0)) - tick)

func carrier_field_block_reason(unit: Dictionary, deploy: bool) -> String:
	if unit.unit_type != "lumen_carrier" or unit.build_progress < 1.0:
		return "Select a completed Lumen Carrier."
	if unit.has("power_field_transition"):
		return "Lumen Carrier is transforming."
	if not deploy:
		return "The power field is folded." if not unit.is_immobile else ""
	if unit.is_immobile:
		return "The power field is already anchored."
	var remaining := carrier_rearm_ticks(unit)
	return "The field recharges in %.1fs." % (remaining * TICK_DT) if remaining > 0 else ""

func _set_carrier_field(unit: Dictionary, deploy: bool) -> void:
	unit["is_immobile"] = deploy
	if deploy:
		if ladder_rules:
			unit["carrier_anchored"] = true
		else:
			unit["power_field_until"] = tick + CARRIER_POWER_TICKS
		_stop_for_mode_change(unit)
	else:
		unit.erase("carrier_anchored")
		unit.erase("power_field_until")
		if not ladder_rules:
			unit["power_field_rearm"] = tick + CARRIER_REARM_TICKS
	ability_triggered.emit(unit, "deploy_power_field" if deploy else "retract_power_field", unit.pos)

func _stop_for_mode_change(unit: Dictionary) -> void:
	unit.orders.clear()
	unit.path.clear()
	unit.erase("choke_yield")
	unit.vel = Vector2.ZERO
	unit.has_home_pos = false

func uses_brood_slots(unit: Dictionary) -> bool:
	return unit.unit_type == "brood_nest" and not match_state.is_empty()

func brood_slot_cap() -> int:
	return LadderRules.LARVA_LIMIT if ladder_rules else BROOD_SLOT_CAP

func training_uses_brood_slot(producer: Dictionary, unit_type: String) -> bool:
	return uses_brood_slots(producer) and (not ladder_rules or unit_type != "brood_keeper")

func brood_inject_block_reason(keeper: Dictionary, nest: Dictionary) -> String:
	if keeper.unit_type != "brood_keeper" or keeper.energy < BROOD_INJECT_COST:
		return "Requires a Brood Keeper with 25 energy."
	if nest.is_empty() or nest.owner != keeper.owner or nest.build_progress < 1.0 or not uses_brood_slots(nest):
		return "Select a completed friendly Brood Nest."
	if ladder_rules:
		return ""
	if nest.get("brood_inject_finish", 0) > 0:
		return "A clutch is already growing at this Nest."
	if nest.brood_slots >= BROOD_SLOT_CAP:
		return "This Nest already has five brood slots."
	return ""

func brood_inject_remaining(nest: Dictionary) -> float:
	return maxf(0.0, float(int(nest.get("brood_inject_finish", 0)) - tick) * TICK_DT)

func burrow_block_reason(unit: Dictionary, underground: bool) -> String:
	if unit.flight_height > 0.0 or not RTSData.get_unit_def(unit.unit_type).get("abilities", []).has("burrow"):
		return "This unit cannot burrow."
	if unit.has("burrow_transition"):
		return "Burrow transition in progress."
	if unit.get("burrowed", false) == underground:
		return "Already burrowed." if underground else "Already on the surface."
	if underground:
		var upgrades: Dictionary = players[unit.owner].upgrades
		if ladder_rules and unit.unit_type != "spine_ambusher" and not upgrades.get("burrow", 0):
			return "Research Burrow at a Brood Nest."
		if not ladder_rules and unit.unit_type == "sporeburst" and not upgrades.get("spore_burrow", 0):
			return "Research Spore Burrow at the Spore Nursery."
	if _is_point_blocked_by_static(unit.pos, unit.radius):
		return "Burrow needs clear ground." if underground else "The surface is blocked."
	if not underground and nav_dirty:
		# A foundation created this tick can still be missing from the footprint index.
		for structure in units.values():
			if not structure.is_structure or structure.is_walkable_structure or structure.flight_height > 0.0:
				continue
			if unit.pos.distance_to(structure.pos) < unit.radius + structure.radius:
				return "The surface is blocked."
	return ""

func _set_burrowed(unit: Dictionary, underground: bool) -> void:
	var definition: Dictionary = RTSData.get_unit_def(unit.unit_type)
	unit["burrowed"] = underground
	if ladder_rules and unit.unit_type == "bile_crawler":
		unit["burrow_mobile"] = underground and players[unit.owner].upgrades.get("tunneling_claws", 0) > 0
	elif ladder_rules and unit.unit_type == "mireweaver":
		unit["burrow_mobile"] = underground
	unit.is_immobile = (underground and not unit.get("burrow_mobile", false)) or bool(definition.get("is_immobile", false))
	unit.sight_range = minf(float(definition.sight_range), BURROW_SIGHT) if underground and unit.unit_type != "spine_ambusher" else float(definition.sight_range)
	if underground and unit.unit_type == "mireweaver":
		unit.sight_range = 20.0
	unit.orders.clear()
	unit.path.clear()
	unit.erase("choke_yield")
	unit.vel = Vector2.ZERO
	unit.home_pos = unit.pos
	unit.has_home_pos = true
	unit.attack_state = "idle"
	unit.attack_state_timer = 0.0
	unit.attack_target_tag = 0

func _begin_burrow_transition(unit: Dictionary, underground: bool) -> void:
	var timing: Vector3 = LadderRules.BURROW_TIMINGS[unit.unit_type]
	if unit.unit_type == "spine_ambusher" and players[unit.owner].upgrades.get("adaptive_talons", 0):
		timing.x = LadderRules.AMBUSHER_TALONS_BURROW_SECONDS
	var delay := timing.x + rng.randf_range(0.0, timing.z) if underground \
		else timing.y + rng.randf_range(0.0, timing.z if unit.unit_type == "spine_ambusher" else LadderRules.UNBURROW_MAX_DELAY)
	unit["burrow_transition"] = {"down": underground, "start": tick,
		"finish": tick + ceili(delay * TICK_RATE), "orders": []}
	if unit.is_worker:
		_release_mining_slot(unit)
	_stop_for_mode_change(unit)
	unit.is_immobile = true
	unit.attack_state = "idle"
	unit.attack_state_timer = 0.0
	unit.attack_target_tag = 0

func _finish_burrow_transition(unit: Dictionary) -> void:
	var transition: Dictionary = unit.burrow_transition
	unit.erase("burrow_transition")
	var reason := burrow_block_reason(unit, transition.down)
	if not reason.is_empty():
		unit.is_immobile = (unit.get("burrowed", false) and not unit.get("burrow_mobile", false)) \
			or RTSData.get_unit_def(unit.unit_type).get("is_immobile", false)
		notice.emit(unit.owner, reason, "warn")
		return
	_set_burrowed(unit, transition.down)
	for order in transition.orders:
		issue_command([unit.tag], order.type, order.pos, order.tag, "", order.queue)

func can_place_structure(structure_type: String, pos: Vector2, ignore_tag: int = 0) -> bool:
	var def = RTSData.get_unit_def(structure_type)
	if def.is_empty() or not pos.is_finite():
		return false
	var radius = float(def.get("radius", 2.0))
	if terrain_grid and (_map_clamped_position(pos, radius) != pos or terrain_grid.overlaps(pos, radius, false, true)):
		return false
	if is_water_at(pos, radius):
		return false
	var extractor := bool(def.get("is_extractor", false))
	if extractor:
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
		if u.tag != ignore_tag and u.is_structure and u.flight_height <= 0.0 and pos.distance_to(u.pos) < radius + float(u.radius) + 1.0:
			return false
	for res in resources.values():
		if not deposit_present(res):
			continue
		if pos.distance_to(res.pos) < radius + float(res.radius) + 0.5:
			if not extractor or res.resource_type != "aether_vent":
				return false
	return true

func _ground_mobile_overlaps(point: Vector2, radius: float, ignored_tag: int = 0, other_ignored_tag: int = 0) -> bool:
	for unit in units.values():
		if (unit.tag != ignored_tag and unit.tag != other_ignored_tag and not unit.is_structure and unit.flight_height <= 0.0
				and not unit.get("burrowed", false) and not unit.get("nonblocking", false) and point.distance_to(unit.pos) < radius + unit.radius):
			return true
	return false

func silo_raise_block_reason(silo: Dictionary) -> String:
	if silo.has("silo_raise_until"):
		return "The silo is already raising."
	if _ground_mobile_overlaps(silo.pos, silo.radius):
		return "Move ground units off the Silo before raising it."
	return ""

func production_attachment_pad(producer: Dictionary) -> Vector2:
	return producer.pos + ATTACHMENT_PAD_OFFSET

func supports_meridian_attachments(structure_type: String) -> bool:
	return structure_type in LadderRules.MERIDIAN_MODULE_PRODUCERS if ladder_rules else structure_type == "muster_hall"

func _meridian_attachment_compatible(producer: Dictionary, attachment_type: String) -> bool:
	var definition := RTSData.get_unit_def(attachment_type)
	return (supports_meridian_attachments(producer.get("unit_type", "")) and definition.has("attachment_for")
		and producer.faction == definition.get("faction") and players.has(producer.owner))

func _attachment_link_valid(producer: Dictionary, attachment: Dictionary) -> bool:
	return not producer.is_empty() and not attachment.is_empty() and producer.hp > 0.0 and producer.flight_height <= 0.0 \
		and producer.build_progress >= 1.0 and producer.owner == attachment.owner \
		and int(producer.get("attachment_tag", 0)) == attachment.tag and int(attachment.get("attachment_parent_tag", 0)) == producer.tag \
		and attachment.pos.is_equal_approx(production_attachment_pad(producer))

func production_attachment(producer: Dictionary, completed_only: bool = true) -> Dictionary:
	var attachment: Dictionary = units.get(int(producer.get("attachment_tag", 0)), {})
	if not _attachment_link_valid(producer, attachment) or (completed_only and attachment.build_progress < 1.0):
		return {}
	return attachment

func attachment_under_construction(producer: Dictionary) -> bool:
	return production_attachment(producer, false).get("build_progress", 1.0) < 1.0

func _reactor_compatible_job(job: Dictionary) -> bool:
	if ladder_rules:
		return not job.has("upgrade") and not job.has("requires_attachment")
	var definition: Dictionary = RTSData.get_unit_def(str(job.get("unit_type", "")))
	return definition.get("attributes", []).has("Light")

func active_production_slots(producer: Dictionary) -> int:
	var queue: Array = producer.production_queue
	if queue.is_empty() or producer.flight_height > 0.0 or producer.has("flight_transition") or (requires_power(producer.unit_type) and not is_powered(producer.owner, producer.pos)):
		return 0
	if attachment_under_construction(producer):
		return 0
	var required_attachment := str(queue[0].get("requires_attachment", ""))
	if not required_attachment.is_empty() and production_attachment(producer).get("unit_type") != required_attachment:
		return 0
	if uses_brood_slots(producer):
		return queue.size()
	if queue.size() >= 2 and producer.has("attachment_tag") and production_attachment(producer).get("unit_type") == "fabrication_module":
		# Heavy units and research are FIFO barriers. Neither lane can skip a job.
		if _reactor_compatible_job(queue[0]) and _reactor_compatible_job(queue[1]):
			return 2
	return 1

func attachment_block_reason(producer: Dictionary, attachment_type: String) -> String:
	var definition: Dictionary = RTSData.get_unit_def(attachment_type)
	if producer.is_empty() or not units.has(producer.tag) or not _meridian_attachment_compatible(producer, attachment_type):
		return "This structure cannot build that attachment."
	if producer.build_progress < 1.0 or producer.hp <= 0.0 or producer.flight_height > 0.0:
		return "Requires a completed, grounded production structure."
	if not production_attachment(producer, false).is_empty():
		return "The attachment pad is already in use."
	var pad := production_attachment_pad(producer)
	if not can_see_position(producer.owner, pad):
		return "The attachment pad must be visible."
	if not can_place_structure(attachment_type, pad) or _ground_mobile_overlaps(pad, float(definition.radius)) \
		or not is_equal_approx(get_elevation_at(pad), get_elevation_at(producer.pos)):
		return "The attachment pad is blocked."
	var player: Dictionary = players[producer.owner]
	if player.crystal < int(definition.crystal_cost):
		return "Not enough crystal."
	if player.aether < int(definition.aether_cost):
		return "Not enough aether."
	return ""

func _start_production_attachment(producer: Dictionary, attachment_type: String) -> bool:
	var reason := attachment_block_reason(producer, attachment_type)
	if not reason.is_empty():
		notice.emit(producer.owner, reason, "error")
		return false
	var definition: Dictionary = RTSData.get_unit_def(attachment_type)
	var cost := Vector2i(definition.crystal_cost, definition.aether_cost)
	players[producer.owner].crystal -= cost.x
	players[producer.owner].aether -= cost.y
	var attachment := spawn_unit(attachment_type, producer.owner, production_attachment_pad(producer), "", 0.0)
	attachment["construction_cost"] = cost
	attachment["auto_summon"] = true
	_link_production_attachment(producer, attachment)
	return true

func _link_production_attachment(producer: Dictionary, attachment: Dictionary) -> void:
	attachment["attachment_parent_tag"] = producer.tag
	producer["attachment_tag"] = attachment.tag

func _unlink_attachment(attachment: Dictionary) -> void:
	var producer: Dictionary = units.get(int(attachment.get("attachment_parent_tag", 0)), {})
	if int(producer.get("attachment_tag", 0)) == attachment.tag:
		producer.erase("attachment_tag")
	attachment.erase("attachment_parent_tag")

func _orphan_attachment(attachment: Dictionary) -> void:
	_unlink_attachment(attachment)
	if ladder_rules:
		attachment.production_queue.clear()
	if attachment.build_progress < 1.0:
		_confirm_waiting_attack_loss(attachment)
		units.erase(attachment.tag)
		nav_dirty = true
		unit_destroyed.emit(attachment.duplicate(true))

func detach_production_attachment(producer: Dictionary) -> void:
	var attachment: Dictionary = units.get(int(producer.get("attachment_tag", 0)), {})
	if int(attachment.get("attachment_parent_tag", 0)) == producer.tag:
		_orphan_attachment(attachment)
	producer.erase("attachment_tag")

func lift_block_reason(producer: Dictionary) -> String:
	if producer.has("flight_transition"):
		return "Wait for the flight transition to finish."
	var definition: Dictionary = RTSData.get_unit_def(producer.unit_type)
	if not definition.has("lift_speed") or producer.flight_height > 0.0 or producer.build_progress < 1.0:
		return "Requires a completed, grounded Meridian production structure."
	if ladder_rules and producer.unit_type == "colony_hub" and not producer.production_queue.is_empty() \
			and producer.production_queue[0].get("upgrade") in ["hub_operations", "fortify_hub"]:
		return "Finish or cancel the Hub conversion before lifting."
	var attachment := production_attachment(producer, false)
	if not attachment.is_empty() and attachment.build_progress < 1.0:
		return "Finish or cancel the attachment before lifting."
	if ladder_rules and not attachment.is_empty() and not attachment.production_queue.is_empty():
		return "Finish or cancel the module research before lifting."
	return ""

func _begin_production_flight_transition(producer: Dictionary, kind: String, start_height: float, end_height: float) -> void:
	var definition := RTSData.get_unit_def(producer.unit_type)
	var duration_ms: float = definition.get("%s_duration_ms" % ("lift" if kind == "abort" else kind), 1000)
	var ticks := maxi(1, ceili(duration_ms * TICK_RATE / 1000.0))
	# Keep the current targeting and collision layer until the animation ends.
	producer["flight_transition"] = {
		"kind": kind, "start": tick, "end": tick + ticks,
		"from_height": start_height, "to_height": end_height,
	}
	producer.vel = Vector2.ZERO
	producer.path.clear()
	producer.has_home_pos = false
	producer.is_immobile = true

func _finish_production_flight_transition(producer: Dictionary) -> void:
	var transition: Dictionary = producer.flight_transition
	producer.erase("flight_transition")
	producer.is_immobile = bool(RTSData.get_unit_def(producer.unit_type).get("is_immobile", false))
	match transition.kind:
		"lift":
			detach_production_attachment(producer)
			_set_producer_airborne(producer, true)
		"land":
			var reason := landing_block_reason(producer, producer.pos)
			if reason.is_empty():
				_land_production(producer, producer.pos)
			else:
				producer.orders.clear()
				_begin_production_flight_transition(producer, "abort", transition.to_height, PRODUCTION_FLIGHT_HEIGHT)
				notice.emit(producer.owner, reason, "warn")

func _set_producer_airborne(producer: Dictionary, airborne: bool) -> void:
	var definition: Dictionary = RTSData.get_unit_def(producer.unit_type)
	producer.flight_height = PRODUCTION_FLIGHT_HEIGHT if airborne else 0.0
	producer.speed = float(definition.lift_speed) if airborne else float(definition.get("speed", 0.0))
	producer.orders.clear()
	producer.path.clear()
	producer.vel = Vector2.ZERO
	producer.has_home_pos = false
	nav_dirty = true

func _detached_module_at_pad(producer: Dictionary, center: Vector2, tolerance: float) -> Dictionary:
	if not supports_meridian_attachments(producer.unit_type):
		return {}
	var pad := center + ATTACHMENT_PAD_OFFSET
	var best := {}
	var nearest := tolerance * tolerance
	for module in units.values():
		if not module.is_structure or (not ladder_rules and module.owner != producer.owner) or module.has("attachment_parent_tag") \
			or module.build_progress < 1.0 or module.hp <= 0.0 or module.flight_height > 0.0:
			continue
		var distance: float = module.pos.distance_squared_to(pad)
		if distance > nearest or (not best.is_empty() and distance == nearest):
			continue
		if not _meridian_attachment_compatible(producer, module.unit_type):
			continue
		if not is_equal_approx(get_elevation_at(module.pos), get_elevation_at(module.pos - ATTACHMENT_PAD_OFFSET)):
			continue
		best = module
		nearest = distance
	return best

func production_landing_position(producer: Dictionary, requested: Vector2) -> Vector2:
	if not requested.is_finite():
		return requested
	var module := _detached_module_at_pad(producer, requested, ATTACHMENT_LANDING_SNAP)
	return module.pos - ATTACHMENT_PAD_OFFSET if not module.is_empty() else requested

func landing_block_reason(producer: Dictionary, position: Vector2) -> String:
	if producer.has("flight_transition"):
		return "Wait for the flight transition to finish."
	if not RTSData.get_unit_def(producer.unit_type).has("lift_speed") or producer.flight_height <= 0.0:
		return "Requires an airborne Meridian production structure."
	if not position.is_finite() or not can_see_position(producer.owner, position):
		return "Choose a visible landing site."
	if not can_place_structure(producer.unit_type, position) or _ground_mobile_overlaps(position, producer.radius):
		return "The landing footprint is blocked."
	return ""

func _land_production(producer: Dictionary, position: Vector2) -> void:
	producer.pos = position
	producer.prev_pos = position
	producer.facing = 0.0 if producer.owner == 1 else PI
	_set_producer_airborne(producer, false)
	# Movement later in this tick must already collide with the landed hull.
	_index_footprint(producer)
	var module := _detached_module_at_pad(producer, position, 0.01)
	if not module.is_empty() and module.pos.is_equal_approx(production_attachment_pad(producer)):
		module.owner = producer.owner
		_link_production_attachment(producer, module)

func is_build_tile_blocked(point: Vector2, player: int, allowed_vent: Vector2 = Vector2.INF) -> bool:
	if not can_see_position(player, point) or is_water_at(point):
		return true
	if not Rect2(0, 0, map_width, map_height).has_point(point):
		return true
	if terrain_grid and (not terrain_grid.bounds.has_point(point) or terrain_grid.overlaps(point, 0.0, false, true)):
		return true
	for obstacle in terrain_obstacles:
		if obstacle.has_point(point):
			return true
	for footprint in _footprint_bins.get(_footprint_bin(point), NO_FOOTPRINTS):
		if point.distance_squared_to(footprint.pos) >= footprint.radius * footprint.radius:
			continue
		if footprint.has("resource_type"):
			if deposit_present(footprint) and (footprint.resource_type != "aether_vent" or footprint.pos.distance_squared_to(allowed_vent) > 0.25):
				return true
		elif footprint.flight_height <= 0.0 and can_see_unit(player, footprint):
			return true
	return false

func _configure_water(map_cfg: Dictionary) -> void:
	terrain_tiles = map_cfg.get("terrain_tiles", []).duplicate(true)
	ground_regions.assign(_map_polygons(map_cfg.get("ground_regions", [])))
	bridge_decks.assign(_map_polygons(map_cfg.get("bridge_decks", [])))
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
			if not bridge_decks.is_empty() and bridge_decks.any(func(deck): return Geometry2D.is_point_in_polygon(pos, deck)):
				continue
			# Water and the terrain outside an authored ground outline share the
			# ground-blocking grid used by movement and placement.
			if not ground_regions.is_empty() and not ground_regions.any(func(region): return Geometry2D.is_point_in_polygon(pos, region)):
				water_cells[Vector2i(x, y)] = true
				continue
			for polygon in water_polygons:
				if Geometry2D.is_point_in_polygon(pos, polygon):
					water_cells[Vector2i(x, y)] = true
					break
	for tile in terrain_tiles:
		var rect = Rect2(float(tile.x), float(tile.y), 4, 4)
		if tile.terrain == "brush":
			_brush_cells[Vector2i((rect.position / 4.0).floor())] = true
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

func _map_polygons(definitions: Array) -> Array[PackedVector2Array]:
	var polygons: Array[PackedVector2Array] = []
	for definition in definitions:
		if not definition is Array:
			continue
		var polygon := PackedVector2Array()
		for point in definition:
			if point is Array and point.size() >= 2:
				polygon.append(Vector2(float(point[0]), float(point[1])))
		if polygon.size() >= 3:
			polygons.append(polygon)
	return polygons

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
	if terrain_grid and terrain_grid.overlaps(pos, radius, true, false, true):
		return true
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

func spawn_resource(res_type: String, pos: Vector2, amount: int = 1500, custom_id: String = "", rich: bool = false) -> Dictionary:
	var tag = next_tag
	next_tag += 1
	var r = {
		"tag": tag,
		"id": custom_id if custom_id != "" else "%s_%d" % [res_type, tag],
		"resource_type": res_type,
		"pos": pos,
		"amount": amount,
		"rich": rich,
		"radius": 1.8 if res_type == "crystal_field" else 2.6,
		"mining_worker": 0
	}
	resources[tag] = r
	nav_dirty = true
	return r

func deposit_present(deposit: Dictionary) -> bool:
	return unlimited_resources or deposit.resource_type != "crystal_field" or deposit.amount > 0

func deposit_yield(deposit: Dictionary) -> int:
	if deposit.resource_type == "crystal_field":
		return 7 if deposit.rich else 5
	return 6 if deposit.rich else 4

func unit_upgrade_detail(unit: Dictionary) -> String:
	if not ladder_rules:
		return ""
	if unit.get("rich_extractor", false):
		return "rich_extractor"
	if unit.unit_type == "brood_mimic":
		return unit.get("disguise_detail", "")
	var owner: int = unit.get("neural_original_owner", unit.owner)
	var upgrades: Dictionary = players.get(owner, {}).get("upgrades", {})
	if unit.unit_type == "rifleman" and upgrades.get("combat_shields", 0):
		return "combat_shield"
	if unit.unit_type == "skitterling" and upgrades.get("metabolic_boost", 0):
		return "wings"
	return ""

func spawn_unit(unit_type: String, owner_id: int, pos: Vector2, custom_id: String = "", build_progress: float = 1.0, hallucinated: bool = false) -> Dictionary:
	var def = RTSData.get_unit_def(unit_type)
	if def.is_empty():
		push_warning("[SimEngine] Unknown unit_type: " + unit_type)
		return {}
	if def.get("faction") == "neutral":
		owner_id = 0
		build_progress = 1.0

	var tag = next_tag
	next_tag += 1
	var max_hp = float(def.get("max_hp", 45.0))
	var max_shields = float(def.get("max_shields", 0.0))
	var durability_progress := build_progress
	if not ladder_rules and build_progress == 0.0 and def.get("is_structure", false):
		durability_progress = 0.1
	var start_hp = max_hp if build_progress >= 1.0 else max(10.0, max_hp * durability_progress)
	var start_shields = max_shields if build_progress >= 1.0 else max_shields * durability_progress

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
		"flight_height": float(def.get("flight_height", 0.0)),
		"push_priority": int(def.get("push_priority", 1)),
		"is_structure": bool(def.get("is_structure", false)),
		"is_town_hall": bool(def.get("is_town_hall", false)),
		"is_extractor": bool(def.get("is_extractor", false)),
		"is_walkable_structure": bool(def.get("is_walkable_structure", false)),
		"is_worker": bool(def.get("is_worker", false)),
		"is_immobile": bool(def.get("is_immobile", false)),
		"cliff_walk": bool(def.get("cliff_walk", false)),
		"vision_over_cliffs": bool(def.get("vision_over_cliffs", false)),
		"nonblocking": bool(def.get("nonblocking", false)),
		"armed_structure": bool(def.get("is_structure", false)) and def.has("weapon"),
		"detection_radius": float(def.get("detection_radius", 0.0)),
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
		"attack_windup_duration": 0.0,
		"surge_timer": 0.0,
		"charge_timer": 0.0,
		"phase_cooldown": 0.0,
		"slow_timer": 0.0,
		"cargo_type": "",
		"cargo_amount": 0,
		"harvest_timer": 0.0,
		"harvest_target_tag": 0,
		"energy": _starting_energy(unit_type),
		"build_progress": build_progress,
		"build_total_time": construction_time(unit_type) if def.get("is_structure", false) else float(def.get("build_time", 20.0)),
		"production_queue": [],
		"rally_route": [],
		"kills": 0,
		"damage_dealt": 0.0
	}
	if def.has("living_ground_radius"):
		u["living_ground_radius"] = def.living_ground_radius
	if ladder_rules and u.is_extractor:
		for deposit in resources.values():
			if deposit.rich and deposit.resource_type == "aether_vent" and deposit.pos.distance_squared_to(pos) <= 0.25:
				u["rich_extractor"] = true
				u.name = "Rich " + u.name
				break
	if unit_type == "fleet_carrier":
		u["fighter_reserve"] = LadderRules.CARRIER_FIGHTER_INITIAL
		u["active_fighters"] = []
		u["fighter_orders"] = 0
		u["auto_build_fighters"] = true
	elif unit_type == "locust_flying":
		u["auto_locust_swoop"] = true
	elif unit_type == "vortex_rover":
		u["auto_vortex_lock"] = true
	elif unit_type == "sentinel_mine_armed":
		u["burrowed"] = true
		u["auto_sentinel_missiles"] = true
	elif unit_type == "sentinel_mine":
		u["auto_sentinel_missiles"] = true
	elif unit_type == "crownspire" and ladder_rules and players.has(owner_id):
		players[owner_id]["crownspire_tag"] = tag
	if ladder_rules and unit_type == "rifleman" and players.get(owner_id, {}).get("upgrades", {}).get("combat_shields", 0):
		_apply_combat_shield(u)
	if def.has("living_ground_speed_bonus"):
		u["living_ground_speed_bonus"] = def.living_ground_speed_bonus
	if def.has("hp_regen"):
		u["hp_regen"] = def.hp_regen
		u["hp_regen_delay"] = def.get("hp_regen_delay", 0.0)
	if def.has("target_priority"):
		u["target_priority"] = def.target_priority
	if unit_type == "sporeburst" and players.get(owner_id, {}).get("upgrades", {}).get("rolling_spores", 0):
		_apply_rolling_spores(u)
	if unit_type == "brood_nest":
		u["brood_slots"] = 0 if ladder_rules else BROOD_SLOTS
		u["brood_seeded"] = false
		u["brood_larvae"] = []
		u["brood_bonus_slots"] = 0
		u["brood_recharge"] = 0.0
		u["worker_rally_route"] = []
	if u.unit_type == "pioneer":
		u["auto_repair"] = true
	if def.has("energy_profile"):
		u["energy_profile"] = def.energy_profile
		u["energy"] = def.energy_profile.start
	if def.has("support"):
		u["support"] = def.support
		u["energy"] = def.support.starting_energy
		u["support_target_tag"] = 0
		u["next_support_cue"] = 0
		if def.support.stat == "hp":
			u["auto_heal"] = true
		elif unit_type == "aegis_capacitor":
			u["auto_aegis"] = true
			if _near_friendly_heartstone(owner_id, pos):
				u.energy = def.support.max_energy
	if ladder_rules and unit_type == "sunblade":
		u["auto_charge"] = true
		if players.get(owner_id, {}).get("upgrades", {}).get("charge", 0):
			u.speed = LadderRules.SUNBLADE_UPGRADED_SPEED
	if ladder_rules and unit_type in ["farsight_wisp", "duskblade"]:
		u["cloaked"] = true
	if unit_type == "bastion_walker":
		u["auto_bastion_barrier"] = true
	if def.has("lifetime_seconds"):
		u["expires_tick"] = tick + int(def.lifetime_seconds) * TICK_RATE
	if hallucinated:
		u["hallucinated"] = true
		u["expires_tick"] = tick + LadderRules.HALLUCINATION_SECONDS * TICK_RATE
	units[tag] = u
	if campaign != null and campaign.mutators != null:
		campaign.mutators.on_spawn(u)
	if u.detection_radius > 0.0:
		_detectors.append(u)
	if u["is_structure"]:
		nav_dirty = true
	_recompute_supplies()
	emit_signal("unit_spawned", u)
	if unit_type == "brood_nest" and ladder_rules and build_progress >= 1.0:
		u.brood_seeded = true
		_grant_larvae(u, 1)
	return u

func _starting_energy(unit_type: String) -> float:
	match unit_type:
		"colony_hub": return 0.0 if ladder_rules else HUB_POWER_COST
		"heartstone": return PRODUCTION_BOOST_COST
		"skirmisher": return 0.0 if ladder_rules else 75.0
	return 0.0

func ramp_rises_east(ramp: Rect2, plateaus: Array[Rect2]) -> bool:
	var middle := ramp.get_center().y
	var west := Vector2(ramp.position.x - 0.01, middle)
	var east := Vector2(ramp.end.x + 0.01, middle)
	var east_is_high := false
	for plateau in plateaus:
		if plateau.has_point(west):
			return false
		east_is_high = east_is_high or plateau.has_point(east)
	return east_is_high

func get_elevation_at(pos: Vector2) -> float:
	if terrain_grid:
		return terrain_grid.elevation_at(pos)
	return _surface_elevation(pos, pos.x)

func _surface_elevation(region_point: Vector2, x: float) -> float:
	for rmp in ramps:
		if rmp.has_point(region_point):
			var t := clampf((x - rmp.position.x) / rmp.size.x, 0.0, 1.0)
			return 2.2 * (t if ramp_rises_east(rmp, high_ground_zones) else 1.0 - t)
	for hg in high_ground_zones:
		if hg.has_point(region_point):
			return 2.2
	return 0.0

func _rebuild_ground_ledges() -> void:
	if _ledge_plateaus == high_ground_zones and _ledge_ramps == ramps:
		return
	_ledge_plateaus = high_ground_zones.duplicate()
	_ledge_ramps = ramps.duplicate()
	_ground_ledges.clear()
	var surfaces := high_ground_zones + ramps
	for axis in range(2):
		var along := 1 - axis
		var limit := map_width if axis == 0 else map_height
		var edges := {0.0: true, limit: true}
		for surface in surfaces:
			edges[surface.position[axis]] = true
			edges[surface.end[axis]] = true
		var lines := edges.keys()
		lines.sort()
		for line_index in range(1, lines.size() - 1):
			var edge: float = lines[line_index]
			if edge <= 0.0 or edge >= limit:
				continue
			var cuts := {}
			for surface in surfaces:
				if surface.position[axis] <= edge and surface.end[axis] >= edge:
					cuts[surface.position[along]] = true
					cuts[surface.end[along]] = true
			var points := cuts.keys()
			points.sort()
			var start := INF
			var before := Vector2.ZERO
			var after := Vector2.ZERO
			before[axis] = (lines[line_index - 1] + edge) * 0.5
			after[axis] = (lines[line_index + 1] + edge) * 0.5
			for i in range(points.size() - 1):
				before[along] = (points[i] + points[i + 1]) * 0.5
				after[along] = before[along]
				# Compare the two surfaces at the seam, including both
				# ends when the seam runs along the ramp's slope.
				var x: float = edge if axis == 0 else points[i]
				var has_step := not is_equal_approx(_surface_elevation(before, x), _surface_elevation(after, x))
				if axis == 1 and not has_step:
					x = points[i + 1]
					has_step = not is_equal_approx(_surface_elevation(before, x), _surface_elevation(after, x))
				if has_step and not is_finite(start):
					start = points[i]
				if is_finite(start) and (not has_step or i == points.size() - 2):
					var end: float = points[i + 1] if has_step else points[i]
					var position := Vector2.ZERO
					var size := Vector2.ZERO
					position[axis] = edge - 0.005
					position[along] = start
					size[axis] = 0.01
					size[along] = end - start
					_ground_ledges.append(Rect2(position, size))
					start = INF

func unit_elevation(unit: Dictionary) -> float:
	return float(unit.flight_height) if unit.flight_height > 0.0 else get_elevation_at(unit.pos)

func unit_visual_elevation(unit: Dictionary) -> float:
	if unit.has("locust_descent"):
		var descent: Dictionary = unit.locust_descent
		var progress := smoothstep(float(descent.start), float(descent.ends), float(tick))
		return lerpf(unit.flight_height, get_elevation_at(descent.pos), progress)
	if ladder_rules and unit.has("fighter_mode_until"):
		var landing: bool = unit.unit_type == "kestrel_interceptor"
		var air_height := float(RTSData.get_unit_def("kestrel_interceptor").flight_height)
		var ground_height := get_elevation_at(unit.pos)
		var progress := smoothstep(float(unit.fighter_mode_started), float(unit.fighter_mode_until), float(tick))
		return lerpf(air_height, ground_height, progress) if landing else lerpf(ground_height, air_height, progress)
	if not unit.has("flight_transition"):
		return unit_elevation(unit)
	var transition: Dictionary = unit.flight_transition
	var progress := smoothstep(float(transition.start), float(transition.end), float(tick))
	return lerpf(transition.from_height, transition.to_height, progress)

func step_ticks(count: int = 1) -> void:
	last_step_count = count
	if paused:
		emit_signal("paused_step")
	for _i in range(count):
		if _scenario_finished():
			break
		_step_single_tick()

func _scenario_finished() -> bool:
	return match_state.get("status", "") == "finished" or (campaign != null and campaign.status != "playing")

func _step_single_tick() -> void:
	tick += 1
	sim_time = float(tick) * TICK_DT

	if nav_dirty:
		_rebuild_astar_grid()
		nav_dirty = false

	_rebuild_spatial_grid()

	if tick % 8 == 0:
		for tag in guardian_shields.keys():
			if tick >= int(guardian_shields[tag]):
				guardian_shields.erase(tag)
		var ai_started = Time.get_ticks_usec()
		if network_ai_events.is_valid():
			network_ai_events.call()
		else:
			RTSCommanderAI.step_ai(TICK_DT * 8.0)
		profile_usec.ai += Time.get_ticks_usec() - ai_started

	_update_structures(TICK_DT)

	var all_tags = units.keys()
	all_tags.sort()
	var orders_started = Time.get_ticks_usec()
	var mineral_walkers := {}
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u = units[tag]
		if u.unit_type == "brood_larva" and _update_larva_creep(u):
			continue
		if u.has("expires_tick") and tick >= int(u.expires_tick):
			_release_mining_slot(u)
			_confirm_waiting_attack_loss(u)
			units.erase(tag)
			if u.is_structure:
				nav_dirty = true
			_recompute_supplies()
			unit_destroyed.emit(u)
			continue
		u["prev_pos"] = u["pos"]
		if u.has("transit_finish"):
			_update_transit_projection(u)
			continue
		if u.unit_type == "rift_nova" and _finish_rift_nova_if_due(u):
			continue
		if u.unit_type == "mirage_shade" and _finish_mirage_shade_if_due(u):
			continue
		if u.has("archon_warp_finish"):
			var remaining: int = u.archon_warp_finish - tick
			if remaining > 0:
				u.build_progress = 1.0 - float(remaining) / ceili(LadderRules.ARCHON_WARP_SECONDS * TICK_RATE)
				continue
			u.erase("archon_warp_finish")
			u.is_immobile = false
			u.build_progress = 1.0
			ability_triggered.emit(u, "archon_ready", u.pos)
		_update_unit_timers(u, TICK_DT)
		if u.unit_type == "stasis_ward" and u.build_progress >= 1.0:
			_step_stasis_ward(u)
			continue
		if int(u.get("stasis_until", 0)) > tick:
			continue
		if u.has("recall_channel"):
			continue
		if u.has("support") and _step_support(u, TICK_DT):
			continue
		if u.is_structure and u.flight_height <= 0.0 and (not u.armed_structure or u.build_progress < 1.0):
			continue
		if u.armed_structure and requires_power(u.unit_type) and not is_powered(u.owner, u.pos):
			u.attack_state = "idle"
			continue
		_update_unit_orders(u, TICK_DT)
		if u.is_worker and not u.orders.is_empty() and u.orders[0].type in ["harvest", "return_cargo"]:
			var target_tag: int = u.orders[0].target_tag
			var deposit: Dictionary = resources.get(target_tag, {})
			var tap: Dictionary = units.get(target_tag, {}) if deposit.is_empty() else {}
			var gathering: bool = deposit.get("resource_type") in ["crystal_field", "aether_vent"] \
				or (tap.get("is_extractor", false) and tap.owner == u.owner)
			if u.cargo_type in ["crystal", "aether"] or (u.orders[0].type == "harvest" and u.cargo_amount == 0 and gathering):
				mineral_walkers[tag] = true

	profile_usec.orders += Time.get_ticks_usec() - orders_started
	var steering_started = Time.get_ticks_usec()
	_apply_steering_and_push_resolution(all_tags, TICK_DT, mineral_walkers)
	if not neural_tethers.is_empty():
		_step_neural_tethers()
	if not archon_approaches.is_empty():
		_step_archon_approaches()
	_step_miasma()
	if not canticle_storms.is_empty():
		_step_canticle_storms()
	if not fungal_projectiles.is_empty() or not fungal_infections.is_empty():
		_step_fungal_grasp()
	while not microbial_shrouds.is_empty() and tick >= int(microbial_shrouds[0].ends):
		microbial_shrouds.pop_front()
	while not blinding_clouds.is_empty() and tick >= int(blinding_clouds[0].ends):
		blinding_clouds.pop_front()
	while not time_warps.is_empty() and tick >= int(time_warps[0].ends):
		time_warps.pop_front()
	if not parasitic_clouds.is_empty():
		_step_parasitic_clouds()
	if not emp_projectiles.is_empty():
		_step_emp_projectiles()
	if not watchkeeper_missiles.is_empty():
		_step_watchkeeper_missiles()
	if not sentinel_missiles.is_empty():
		_step_sentinel_missiles()
	if not sentry_missiles.is_empty():
		_step_sentry_missiles()
	if not caustic_strikes.is_empty():
		_step_caustic_strikes()
	_step_lattice_bursts()
	if not ridge_charges.is_empty():
		_step_ridge_charges()
	profile_usec.steering += Time.get_ticks_usec() - steering_started
	var creep_interval := LadderRules.CREEP_SPREAD_TICKS if ladder_rules else LivingGround.UPDATE_TICKS
	if tick % creep_interval == 0:
		living_ground.update(units, tick, _can_spread_living_ground, LadderRules.CREEP_SPREAD_TICKS if ladder_rules else 0)
	if not _defensive_recalls.is_empty():
		_update_defensive_recalls()
	if tick % VISION_UPDATE_TICKS == 0 and (vision != null or not watch_stations.is_empty()):
		_refresh_vision()
	_check_match_result()
	if campaign != null:
		if campaign.mutators != null and campaign.status == "playing":
			campaign.mutators.step(self)
		campaign.step(self)
	emit_signal("simulation_ticked", tick)

func _rebuild_astar_grid() -> void:
	_navigation_revision += 1
	_rebuild_ground_ledges()
	_static_structures.clear()
	_footprint_bins.clear()
	_clearance_grids.clear()
	_detectors.clear()
	_town_halls.clear()
	_gas_source_by_tap.clear()
	_gas_tap_by_vent.clear()
	for deposit in resources.values():
		if deposit_present(deposit):
			_index_footprint(deposit)
	for u in units.values():
		if u.detection_radius > 0.0:
			_detectors.append(u)
		if u.is_structure and bool(RTSData.get_unit_def(u.unit_type).get("is_town_hall", false)):
			_town_halls.append(u)
		if u.is_extractor:
			for resource in resources.values():
				if resource.resource_type == "aether_vent" and resource.pos.distance_squared_to(u.pos) < 1.0:
					_gas_source_by_tap[u.tag] = resource.tag
					_gas_tap_by_vent[Vector2i(u.owner, resource.tag)] = u.tag
		if u["is_structure"] and not u["is_walkable_structure"] and u.flight_height <= 0.0 and not u.get("crawler_uprooted", false):
			_static_structures.append(u)
			_index_footprint(u)
		else:
			u.path.clear()
	_fill_navigation_grid(astar_grid, INFANTRY_CLEARANCE, false)

func _index_footprint(footprint: Dictionary) -> void:
	# Each trace segment checks the bins at its endpoint. Include a trace
	# step so a footprint crossed just before a bin boundary is still found.
	var reach := Vector2.ONE * (float(footprint.radius) + MAX_GROUND_CLEARANCE + WALK_TRACE_STEP)
	var first := _footprint_bin(footprint.pos - reach)
	var last := _footprint_bin(footprint.pos + reach)
	for x in range(first.x, last.x + 1):
		for y in range(first.y, last.y + 1):
			var cell := Vector2i(x, y)
			if not _footprint_bins.has(cell):
				_footprint_bins[cell] = []
			_footprint_bins[cell].append(footprint)

func _footprint_bin(pos: Vector2) -> Vector2i:
	return Vector2i(floori(pos.x / FOOTPRINT_BIN_SIZE), floori(pos.y / FOOTPRINT_BIN_SIZE))

func _fill_navigation_grid(grid: AStarGrid2D, clearance: float, ignore_cliffs: bool, cell_size: float = PATH_CELL_SIZE, lattice_offset: float = 0.5) -> void:
	grid.clear()
	grid.region = Rect2i(0, 0, ceili(map_width / cell_size), ceili(map_height / cell_size))
	grid.cell_size = Vector2.ONE * cell_size
	grid.offset = grid.cell_size * lattice_offset
	grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.update()
	if terrain_grid:
		var bounds := terrain_grid.bounds.grow(-clearance)
		_mark_navigation_rect(grid, Rect2(0, 0, bounds.position.x, map_height), cell_size)
		_mark_navigation_rect(grid, Rect2(bounds.end.x, 0, map_width - bounds.end.x, map_height), cell_size)
		_mark_navigation_rect(grid, Rect2(0, 0, map_width, bounds.position.y), cell_size)
		_mark_navigation_rect(grid, Rect2(0, bounds.end.y, map_width, map_height - bounds.end.y), cell_size)
		for row in terrain_grid.blocked_rows:
			for run in row:
				if terrain_grid.blocks(run[1], ignore_cliffs):
					var rect: Rect2 = run[0]
					_mark_navigation_rect(grid, rect.grow(clearance), cell_size)
	if not ignore_cliffs:
		for obs in terrain_obstacles:
			_mark_navigation_rect(grid, obs.grow(clearance), cell_size)
		for ledge in _ground_ledges:
			var expanded := ledge.grow(clearance)
			# A wall between adjacent lattice centers still blocks the edge
			# between them. Cover that span without narrowing ramp mouths.
			var crosswise := maxf(0.0, cell_size * 0.5 - clearance)
			if ledge.size.x < ledge.size.y:
				expanded = expanded.grow_side(SIDE_LEFT, crosswise).grow_side(SIDE_RIGHT, crosswise)
			else:
				expanded = expanded.grow_side(SIDE_TOP, crosswise).grow_side(SIDE_BOTTOM, crosswise)
			_mark_navigation_rect(grid, expanded, cell_size)
	var water_scale := roundi(PATH_CELL_SIZE / cell_size)
	for cell in water_cells:
		grid.fill_solid_region(Rect2i(cell * water_scale, Vector2i.ONE * water_scale).intersection(grid.region))
	for footprint in resources.values():
		if deposit_present(footprint):
			_mark_footprint(grid, footprint, clearance)
	for footprint in _static_structures:
		_mark_footprint(grid, footprint, clearance)

func _mark_navigation_rect(grid: AStarGrid2D, rect: Rect2, cell_size: float) -> void:
	var first := Vector2i(((rect.position - grid.offset) / cell_size).ceil())
	var last := Vector2i(((rect.end - grid.offset) / cell_size).ceil())
	grid.fill_solid_region(Rect2i(first, last - first).intersection(grid.region))

func _mark_footprint(grid: AStarGrid2D, footprint: Dictionary, clearance: float) -> void:
	# Leave a margin at lattice vertices so edges can round circular footprints.
	var reach := float(footprint.radius) + clearance + FOOTPRINT_LATTICE_MARGIN
	var first := _path_cell(grid, footprint.pos - Vector2.ONE * reach)
	var last := _path_cell(grid, footprint.pos + Vector2.ONE * reach)
	for x in range(first.x, last.x + 1):
		for y in range(first.y, last.y + 1):
			var cell := Vector2i(x, y)
			if grid.get_point_position(cell).distance_squared_to(footprint.pos) < reach * reach:
				grid.set_point_solid(cell)

func _navigation_grid(radius: float, ignore_cliffs: bool, cell_size: float = PATH_CELL_SIZE, lattice_offset: float = 0.5) -> AStarGrid2D:
	if cell_size == PATH_CELL_SIZE and not ignore_cliffs and is_equal_approx(radius, INFANTRY_CLEARANCE):
		return astar_grid
	var key := Vector4(radius, float(ignore_cliffs), cell_size, lattice_offset)
	if not _clearance_grids.has(key):
		var grid: AStarGrid2D
		if cell_size == PATH_CELL_SIZE or _has_off_grid_crossing(radius, lattice_offset):
			grid = AStarGrid2D.new()
			_fill_navigation_grid(grid, radius, ignore_cliffs, cell_size, lattice_offset)
		_clearance_grids[key] = grid
	return _clearance_grids[key]

func _has_off_grid_crossing(radius: float, lattice_offset: float) -> bool:
	# A continuous opening can fall entirely between coarse grid rows or columns.
	# Check for such a gap before allocating a second grid on a partial route.
	if terrain_grid or not _ground_ledges.is_empty():
		return true
	if terrain_obstacles.is_empty():
		return false
	var gates: Array[Rect2] = []
	for footprint in _static_structures:
		if footprint.unit_type == "silo":
			var extent := Vector2.ONE * (float(footprint.radius) + FOOTPRINT_LATTICE_MARGIN)
			gates.append(Rect2(footprint.pos - extent, extent * 2.0))
	for i in range(terrain_obstacles.size()):
		var a: Rect2 = terrain_obstacles[i]
		for j in range(i + 1, terrain_obstacles.size()):
			if _has_off_grid_gap_between(a, terrain_obstacles[j], radius, lattice_offset):
				return true
		for gate in gates:
			if _has_off_grid_gap_between(a, gate, radius, lattice_offset):
				return true
	return false

func _has_off_grid_gap_between(a: Rect2, b: Rect2, radius: float, lattice_offset: float) -> bool:
	for axis in range(2):
		var along := 1 - axis
		if maxf(a.position[along], b.position[along]) >= minf(a.end[along], b.end[along]):
			continue
		var first := minf(a.end[axis], b.end[axis]) + radius
		var last := maxf(a.position[axis], b.position[axis]) - radius
		if first < last and _first_path_center(first, PATH_CELL_SIZE) >= last and _first_path_center(first, NARROW_PATH_CELL_SIZE, lattice_offset) < last:
			return true
	return false

func _first_path_center(edge: float, cell_size: float, lattice_offset: float = 0.5) -> float:
	return (ceilf(edge / cell_size - lattice_offset) + lattice_offset) * cell_size

func _path_cell(grid: AStarGrid2D, pos: Vector2) -> Vector2i:
	var center_shift := grid.cell_size * 0.5 - grid.offset
	return Vector2i((pos + center_shift) / grid.cell_size).clamp(Vector2i.ZERO, grid.region.size - Vector2i.ONE)

func compute_smooth_path(start_pos: Vector2, end_pos: Vector2, unit_radius: float = 0.85, ignore_cliffs: bool = false, interaction_reach: float = INF) -> Array[Vector2]:
	var started = Time.get_ticks_usec()
	var result = _compute_smooth_path(start_pos, end_pos, unit_radius, ignore_cliffs, interaction_reach)
	profile_usec.navigation += Time.get_ticks_usec() - started
	return result

func _compute_smooth_path(start_pos: Vector2, end_pos: Vector2, unit_radius: float, ignore_cliffs: bool, interaction_reach: float) -> Array[Vector2]:
	if not end_pos.is_finite():
		return [start_pos]
	var goal := _project_destination(start_pos, end_pos, unit_radius, ignore_cliffs)
	if interaction_reach < INF and goal.distance_to(end_pos) >= interaction_reach - 0.12:
		goal = _interaction_destination(start_pos, end_pos, goal, unit_radius, interaction_reach, ignore_cliffs)
	if _has_clear_line_of_walk(start_pos, goal, unit_radius, ignore_cliffs):
		return [goal]

	var path := _trace_navigation_grid(_navigation_grid(unit_radius, ignore_cliffs), start_pos, goal, unit_radius, ignore_cliffs)
	if not path.back().is_equal_approx(goal):
		# An integer-centered lane avoids giving a one-unit passage two
		# parallel tracks. Try the half-cell lattice if the centered route fails.
		for lattice_offset in [0.0, 0.5]:
			var narrow_grid := _navigation_grid(unit_radius, ignore_cliffs, NARROW_PATH_CELL_SIZE, lattice_offset)
			if narrow_grid == null:
				continue
			var narrow_path := _trace_navigation_grid(narrow_grid, start_pos, goal, unit_radius, ignore_cliffs)
			if narrow_path.back().is_equal_approx(goal):
				return narrow_path
	return path

func _trace_navigation_grid(grid: AStarGrid2D, start_pos: Vector2, goal: Vector2, unit_radius: float, ignore_cliffs: bool) -> Array[Vector2]:
	# A unit displaced at a choke lip can be in an open cell with its center
	# across the cliff corner. Snap to a center the unit can actually reach.
	var on_ledge := not ignore_cliffs and _point_overlaps_ledge(start_pos, unit_radius)
	var can_escape_overlap := not on_ledge and _is_point_blocked_by_static(start_pos, unit_radius, ignore_cliffs)
	var start_clearance := -1.0 if can_escape_overlap else unit_radius
	var start := _find_nearest_walkable_cell(grid, start_pos, start_pos, start_clearance, ignore_cliffs)
	var end := _find_nearest_walkable_cell(grid, goal, start_pos)
	if grid.is_point_solid(start) or grid.is_point_solid(end):
		return [start_pos]
	var waypoints := grid.get_point_path(start, end, true)
	if waypoints.is_empty():
		return [start_pos]
	if waypoints[-1] == grid.get_point_position(end) and _has_clear_line_of_walk(waypoints[-1], goal, unit_radius, ignore_cliffs):
		waypoints.append(goal)

	var smoothed: Array[Vector2] = []
	var anchor: Vector2 = start_pos
	var idx := -1
	while idx < waypoints.size() - 1:
		var furthest = idx + 1
		# Grow visibility probes exponentially, then bisect the blocked interval.
		# Reverse-scanning a long cross-map path repeated hundreds of ray tests.
		var stride = 2
		var blocked = waypoints.size()
		while idx + stride < waypoints.size():
			var probe = idx + stride
			if not _has_clear_line_of_walk(anchor, waypoints[probe], unit_radius, ignore_cliffs):
				blocked = probe
				break
			furthest = probe
			stride *= 2
		var low = furthest + 1
		var high = mini(blocked - 1, waypoints.size() - 1)
		while low <= high:
			var probe = (low + high) / 2
			if _has_clear_line_of_walk(anchor, waypoints[probe], unit_radius, ignore_cliffs):
				furthest = probe
				low = probe + 1
			else:
				high = probe - 1
		if furthest == idx + 1 and not _has_clear_line_of_walk(anchor, waypoints[furthest], unit_radius, ignore_cliffs):
			# An authored spawn can overlap a footprint. Let it step out to its first cell.
			if idx >= 0 or not can_escape_overlap:
				break
		smoothed.append(waypoints[furthest])
		anchor = waypoints[furthest]
		idx = furthest
		if idx == waypoints.size() - 1:
			break
	if smoothed.is_empty():
		smoothed.append(start_pos)
	return smoothed

func _interaction_destination(from: Vector2, target: Vector2, fallback: Vector2, radius: float, reach: float, ignore_cliffs: bool) -> Vector2:
	# A neighboring deposit can block the direct approach even though the assigned
	# patch has open gathering space along its sides.
	var angle := (from - target).angle()
	var first_open := Vector2.INF
	for i in range(16):
		var turn := ((i + 1) / 2) * (1 if i % 2 == 1 else -1)
		var candidate := target + Vector2.from_angle(angle + float(turn) * TAU / 16.0) * (reach - 0.25)
		if _is_point_blocked_by_static(candidate, radius, ignore_cliffs):
			continue
		if _has_clear_line_of_walk(from, candidate, radius, ignore_cliffs):
			return candidate
		if not first_open.is_finite():
			first_open = candidate
	return first_open if first_open.is_finite() else fallback

func _project_destination(from: Vector2, requested: Vector2, radius: float, ignore_cliffs: bool) -> Vector2:
	var goal := _map_clamped_position(requested, radius)
	if not ignore_cliffs:
		for ledge in _ground_ledges:
			if not ledge.grow(radius).has_point(goal):
				continue
			# Keep a click near the lip on the elevation the player chose.
			var axis := 0 if ledge.size.x < ledge.size.y else 1
			var edge := ledge.get_center()[axis]
			var side := signf(goal[axis] - edge)
			if is_zero_approx(side):
				side = -1.0 if from[axis] < edge else 1.0
			goal[axis] = edge + side * (radius + 0.02)
		goal = _map_clamped_position(goal, radius)
	if not _is_point_blocked_by_static(goal, radius, ignore_cliffs):
		return goal
	# Search back from the click so a large obstacle uses the edge facing the unit.
	var distance := goal.distance_to(from)
	var steps := maxi(1, ceili(distance / PATH_CELL_SIZE))
	var blocked := goal
	for i in range(1, steps + 1):
		var point := goal.lerp(from, float(i) / float(steps))
		if _is_point_blocked_by_static(point, radius, ignore_cliffs):
			blocked = point
			continue
		for _probe in range(5):
			var middle := point.lerp(blocked, 0.5)
			if _is_point_blocked_by_static(middle, radius, ignore_cliffs):
				blocked = middle
			else:
				point = middle
		return point
	return goal

func _find_nearest_walkable_cell(grid: AStarGrid2D, pos: Vector2, approach: Vector2, clearance: float = -1.0, ignore_cliffs: bool = false) -> Vector2i:
	var cell := _path_cell(grid, pos)
	if not grid.is_point_solid(cell) and (clearance < 0.0 or _has_clear_line_of_walk(pos, grid.get_point_position(cell), clearance, ignore_cliffs)):
		return cell
	var size := grid.region.size
	var best := cell
	var best_distance := INF
	var best_approach := INF
	# Visibility is needed only for the local bridge from a physical start
	# to the lattice. Keep that search bounded on legitimately isolated terrain.
	var search_limit := 3 if clearance >= 0.0 else maxi(size.x, size.y)
	for radius in range(1, search_limit):
		for side in [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]:
			var along := Vector2i(-side.y, side.x)
			for offset in range(-radius, radius):
				var candidate: Vector2i = cell + side * radius + along * offset
				if not grid.region.has_point(candidate) or grid.is_point_solid(candidate):
					continue
				var point := grid.get_point_position(candidate)
				if clearance >= 0.0 and not _has_clear_line_of_walk(pos, point, clearance, ignore_cliffs):
					continue
				var distance := point.distance_squared_to(pos)
				var from_distance := point.distance_squared_to(approach)
				if distance < best_distance or (is_equal_approx(distance, best_distance) and from_distance < best_approach):
					best = candidate
					best_distance = distance
					best_approach = from_distance
		if best != cell:
			return best
	return cell

func _has_clear_line_of_walk(a: Vector2, b: Vector2, radius: float, ignore_cliffs: bool = false, ignore_phase_barriers: bool = false) -> bool:
	if b.x < radius or b.y < radius or b.x > map_width - radius or b.y > map_height - radius:
		return false
	if terrain_grid and (not terrain_grid.bounds.grow(-radius).has_point(b) or terrain_grid.blocks_segment(a, b, radius, ignore_cliffs, _walk_segment_enters_rect)):
		return false
	if not ignore_cliffs:
		for obstacle in terrain_obstacles:
			if _walk_segment_enters_rect(a, b, obstacle.grow(radius)):
				return false
		if _walk_segment_hits_ledge(a, b, radius):
			return false
	var check_water := not water_cells.is_empty()
	if not check_water and _footprint_bins.is_empty():
		return true
	var steps := maxi(1, ceili(a.distance_to(b) / WALK_TRACE_STEP))
	var previous := a
	for i in range(1, steps + 1):
		var p := a.lerp(b, float(i) / float(steps))
		if check_water and _walk_segment_hits_water(previous, p, radius * 0.5):
			return false
		for footprint in _footprint_bins.get(_footprint_bin(p), NO_FOOTPRINTS):
			if footprint.get("removed_phase_barrier", false) or (ignore_phase_barriers and footprint.get("unit_type") == "phase_barrier"):
				continue
			var reach: float = footprint.radius + radius
			var closest := Geometry2D.get_closest_point_to_segment(footprint.pos, previous, p)
			if closest.distance_squared_to(footprint.pos) < reach * reach:
				return false
		previous = p
	return true

func _walk_segment_hits_ledge(a: Vector2, b: Vector2, radius: float) -> bool:
	for ledge in _ground_ledges:
		var clearance := ledge.grow(radius)
		if not _walk_segment_enters_rect(a, b, clearance):
			continue
		if clearance.has_point(a):
			# Authored spawns and landing units may start too close to the
			# edge. They can move away from it on their own side.
			var from_edge := a.distance_squared_to(a.clamp(ledge.position, ledge.end))
			var to_edge := b.distance_squared_to(b.clamp(ledge.position, ledge.end))
			if to_edge > from_edge and (ledge.has_point(a) or not _walk_segment_enters_rect(a, b, ledge)):
				continue
		return true
	return false

func _point_overlaps_ledge(p: Vector2, radius: float) -> bool:
	for ledge in _ground_ledges:
		if ledge.grow(radius).has_point(p):
			return true
	return false

func _walk_segment_hits_water(a: Vector2, b: Vector2, clearance: float) -> bool:
	var margin := Vector2.ONE * clearance
	var first := Vector2i(((a.min(b) - margin) / PATH_CELL_SIZE).floor())
	var last := Vector2i(((a.max(b) + margin) / PATH_CELL_SIZE).floor())
	var cell_size := Vector2.ONE * PATH_CELL_SIZE
	var clearance_squared := clearance * clearance
	for x in range(first.x, last.x + 1):
		for y in range(first.y, last.y + 1):
			if not water_cells.has(Vector2i(x, y)):
				continue
			var cell := Rect2(Vector2(x, y) * PATH_CELL_SIZE, cell_size)
			if b.distance_squared_to(b.clamp(cell.position, cell.end)) <= clearance_squared:
				return true
			# Match is_water_at: straight sides and rounded corners.
			var horizontal := cell.grow_side(SIDE_LEFT, clearance).grow_side(SIDE_RIGHT, clearance)
			var vertical := cell.grow_side(SIDE_TOP, clearance).grow_side(SIDE_BOTTOM, clearance)
			if _walk_segment_enters_rect(a, b, horizontal) or _walk_segment_enters_rect(a, b, vertical):
				return true
			for corner in [cell.position, cell.end, Vector2(cell.position.x, cell.end.y), Vector2(cell.end.x, cell.position.y)]:
				if Geometry2D.get_closest_point_to_segment(corner, a, b).distance_squared_to(corner) <= clearance_squared:
					return true
	return false

func _walk_segment_enters_rect(a: Vector2, b: Vector2, rect: Rect2) -> bool:
	# Slab intersection catches brief diagonal corner crossings between grid
	# samples. A tangent that merely touches a boundary remains walkable.
	var motion := b - a
	var enter := 0.0
	var leave := 1.0
	for axis in range(2):
		if is_zero_approx(motion[axis]):
			if a[axis] <= rect.position[axis] or a[axis] >= rect.end[axis]:
				return false
			continue
		var first := (rect.position[axis] - a[axis]) / motion[axis]
		var last := (rect.end[axis] - a[axis]) / motion[axis]
		enter = maxf(enter, minf(first, last))
		leave = minf(leave, maxf(first, last))
		if enter >= leave:
			return false
	return true

func _is_point_blocked_by_static(p: Vector2, radius: float, ignore_cliffs: bool = false, vacated_tag: int = 0) -> bool:
	if terrain_grid and (not terrain_grid.bounds.grow(-radius).has_point(p) or terrain_grid.overlaps(p, radius, ignore_cliffs)):
		return true
	if p.x < radius or p.y < radius or p.x > map_width - radius or p.y > map_height - radius:
		return true
	if is_water_at(p, radius * 0.5):
		return true
	if not ignore_cliffs:
		for obs in terrain_obstacles:
			if obs.grow(radius).has_point(p):
				return true
		if _point_overlaps_ledge(p, radius):
			return true
	for footprint in _footprint_bins.get(_footprint_bin(p), NO_FOOTPRINTS):
		if footprint.get("removed_phase_barrier", false) or (vacated_tag != 0 and footprint.tag == vacated_tag):
			continue
		var reach := float(footprint.radius) + radius
		if p.distance_squared_to(footprint.pos) < reach * reach:
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
	var reach := radius + _max_unit_radius
	var x0 := floori((center.x - reach) / SPATIAL_CELL_SIZE)
	var x1 := floori((center.x + reach) / SPATIAL_CELL_SIZE)
	var y0 := floori((center.y - reach) / SPATIAL_CELL_SIZE)
	var y1 := floori((center.y + reach) / SPATIAL_CELL_SIZE)
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
				var tags: Variant = grid.get(Vector2i(x, y))
				if tags == null:
					continue
				for tag in tags:
					var unit: Variant = units.get(tag)
					if unit == null:
						continue
					var combined_radius: float = radius + unit.radius
					if center.distance_squared_to(unit.pos) <= combined_radius * combined_radius:
						result.append(unit)
	return result

func _update_structures(dt: float) -> void:
	var arrivals: Array[Dictionary] = []
	var silo_raised := false
	for u in units.values():
		if not u["is_structure"]:
			if u.unit_type == "brood_egg" and not u.production_queue.is_empty():
				var hatch: Dictionary = u.production_queue.front()
				hatch.progress = minf(hatch.progress + dt, hatch.total_time)
				if hatch.progress >= hatch.total_time:
					_try_finish_production(u, 0, arrivals)
			continue
		if u.has("silo_raise_until") and tick >= int(u.silo_raise_until):
			u.erase("silo_raise_until")
			var reason := silo_raise_block_reason(u)
			if reason.is_empty():
				_morph_unit_in_place(u, "silo")
				silo_raised = true
			else:
				notice.emit(u.owner, reason, "warn")
		if u.has("flight_transition"):
			if tick >= int(u.flight_transition.end):
				_finish_production_flight_transition(u)
			continue
		if u.has("attachment_parent_tag") and not _attachment_link_valid(units.get(u.attachment_parent_tag, {}), u):
			_orphan_attachment(u)
			continue
		if u["build_progress"] < 1.0:
			if bool(u.get("auto_summon", false)):
				if _advance_construction(u, dt):
					if u.unit_type == "brood_tunnel_worm":
						u.armor = float(RTSData.get_unit_def(u.unit_type).armor)
						ability_triggered.emit(u, "brood_worm_open", u.pos)
					if ladder_rules and u.unit_type == "brood_growth_node":
						u["burrowed"] = true
						u["growth_node_ready"] = tick + ceili(LadderRules.TUMOR_BUILD_SECONDS * TICK_RATE)
					if u.unit_type == "stasis_ward":
						u["cloaked"] = true
						u["expires_tick"] = tick + LadderRules.STASIS_WARD_LIFETIME * TICK_RATE
					players[u.owner].structures_built += 1
					if ladder_rules and _qualifies_for_elimination(u):
						_ladder_last_progress_tick = tick
					_recompute_supplies()
					emit_signal("structure_construction_finished", u)
			continue
		if u.has("transit_morph"):
			_step_transit_morph(u)
			continue
		if ladder_rules and u.faction == RTSData.FACTION_HUMANS and u.hp < u.max_hp / 3.0:
			u.hp = maxf(0.0, u.hp - LadderRules.TERRAN_BURN_DPS * dt)
			if u.hp <= 0.0:
				_remove_destroyed_unit(u)
				continue
		if float(u.get("transit_charge", 0.0)) > 0.0 and is_powered(u.owner, u.pos):
			var recharge_rate := PRODUCTION_BOOST_RATE if int(u.get("production_boost_until", -1)) >= tick else 1.0
			u.transit_charge = maxf(0.0, u.transit_charge - dt * recharge_rate)
		if u.unit_type == "colony_hub" and ladder_rules and u.get("hub_operations", false):
			u.energy = minf(HUB_ENERGY_MAX, u.energy + 0.7875 * dt)
		elif not ladder_rules and (u.unit_type == "colony_hub" or u.unit_type == "heartstone"):
			if not u.has("energy_profile"):
				u.energy = minf(HUB_ENERGY_MAX, u.energy + 0.75 * dt)
		if u.unit_type == "tunnel_mouth" and u.has("tunnel_arrival"):
			_step_tunnel_squad(u)
		if u.has("brood_tunnel_unload"):
			_step_brood_tunnel_unload(u)
		var salvage_finish: int = u.get("salvage_finish", 0)
		if salvage_finish > 0 and tick >= salvage_finish:
			var definition: Dictionary = RTSData.get_unit_def(u.unit_type)
			var cost: Vector2i = u.get("construction_cost", Vector2i(definition.crystal_cost, definition.aether_cost))
			if u.unit_type == "field_bunker" and not u.get("passengers", []).is_empty() and not _drop_ground_squad(u.passengers, u.pos):
				u.erase("salvage_finish")
				notice.emit(u.owner, "Clear space around the bunker before salvaging.", "warn")
				continue
			_refund_structure(u, cost)
			emit_signal("notice", u.owner, "%s salvaged." % u.name, "info")
			continue
		var queue: Array = u["production_queue"]
		var brood := uses_brood_slots(u)
		var contaminated := tick < int(u.get("contaminated_until", 0))
		if brood and not contaminated:
			_update_brood_slots(u, dt)
		elif brood:
			for timer in ["brood_inject_finish", "brood_release_tick"]:
				if int(u.get(timer, 0)) > 0:
					u[timer] += 1
		if contaminated and not brood:
			continue
		var active := active_production_slots(u)
		# The tick at the deadline consumes the final interval of the boost.
		var boost_active: bool = (active > 0 and int(u.get("production_boost_until", -1)) >= tick
			and (is_powered(u.owner, u.pos) or (ladder_rules and u.unit_type == "heartstone")))
		var index := 0
		var nest_lane_used := false
		while index < active:
			var item: Dictionary = queue[index]
			if contaminated and not item.has("egg_tag"):
				index += 1
				continue
			if brood and ladder_rules and not item.has("egg_tag"):
				if nest_lane_used:
					index += 1
					continue
				nest_lane_used = true
			if not _start_production_job(u, item):
				index += 1
				continue
			var progress_dt := dt * PRODUCTION_BOOST_RATE if boost_active and (ladder_rules or item.has("unit_type")) else dt
			item.progress = minf(item.progress + progress_dt, item.total_time)
			if item.progress < item.total_time or tick < int(item.get("exit_retry_tick", 0)):
				index += 1
			elif _try_finish_production(u, index, arrivals):
				active -= 1
			else:
				item["exit_retry_tick"] = tick + PRODUCTION_EXIT_RETRY_TICKS
				index += 1
	if silo_raised:
		_rebuild_astar_grid()
		nav_dirty = false

func production_supply_reserved(job: Dictionary) -> float:
	if not job.has("unit_type") or (float(job.progress) <= 0.0 and not job.has("egg_tag")):
		return 0.0
	return float(job.get("supply_cost", RTSData.get_unit_def(job.unit_type).get("supply_cost", 1)))

func _start_production_job(producer: Dictionary, job: Dictionary) -> bool:
	if not job.has("unit_type") or job.progress > 0.0 or job.has("egg_tag"):
		return true
	var cost := float(job.get("supply_cost", RTSData.get_unit_def(job.unit_type).get("supply_cost", 1)))
	var player: Dictionary = players[producer.get("neural_original_owner", producer.owner)]
	if cost > 0.0 and player.supply_used + cost > player.supply_cap:
		if not job.get("supply_blocked", false):
			job["supply_blocked"] = true
			_warn_supply_required(producer.owner)
		return false
	job.erase("supply_blocked")
	player.supply_used += cost
	return true

func _warn_supply_required(owner_id: int) -> void:
	var player: Dictionary = players[owner_id]
	if tick >= int(player.get("next_supply_notice_tick", 0)):
		player["next_supply_notice_tick"] = tick + 2 * TICK_RATE
		notice.emit(owner_id, SUPPLY_REQUIRED_NOTICE, "warn")

func _update_brood_slots(nest: Dictionary, dt: float) -> void:
	if ladder_rules:
		if not nest.brood_seeded:
			_grant_larvae(nest, 1)
			nest.brood_seeded = true
			return
		if nest.brood_slots < BROOD_SLOTS:
			nest.brood_recharge += dt
			if nest.brood_recharge >= LadderRules.NATURAL_LARVA_SECONDS:
				_grant_larvae(nest, 1)
				nest.brood_recharge -= LadderRules.NATURAL_LARVA_SECONDS
				if nest.brood_slots == BROOD_SLOTS:
					nest.brood_recharge = 0.0
		var deadline: int = nest.get("brood_inject_finish", 0)
		if deadline > 0 and tick >= deadline:
			nest["brood_release_remaining"] = LadderRules.INJECT_LARVAE
			nest["brood_release_tick"] = tick
			if int(nest.get("brood_inject_queued", 0)) > 0:
				nest.brood_inject_queued -= 1
				nest.brood_inject_finish = tick + ceili((LadderRules.INJECT_SECONDS + LadderRules.INJECT_HANDOFF_SECONDS) * TICK_RATE)
			else:
				nest.erase("brood_inject_finish")
		if int(nest.get("brood_release_remaining", 0)) > 0 and tick >= int(nest.brood_release_tick):
			if nest.brood_slots < LadderRules.LARVA_LIMIT:
				_grant_larvae(nest, 1)
			nest.brood_release_remaining -= 1
			nest.brood_release_tick = tick + ceili(LadderRules.INJECT_RELEASE_SECONDS * TICK_RATE)
		return
	if nest.brood_slots - nest.brood_bonus_slots < BROOD_SLOTS and nest.brood_slots < BROOD_SLOT_CAP:
		nest.brood_recharge += dt
		if nest.brood_recharge >= BROOD_RECHARGE:
			nest.brood_recharge = 0.0
			nest.brood_slots += 1
	var finish: int = nest.get("brood_inject_finish", 0)
	if finish > 0 and tick >= finish:
		var new_slots := mini(BROOD_INJECT_SLOTS, BROOD_SLOT_CAP - int(nest.brood_slots))
		nest.brood_slots += new_slots
		nest.brood_bonus_slots += new_slots
		nest.erase("brood_inject_finish")

func _grant_larvae(nest: Dictionary, count: int) -> void:
	if count <= 0:
		return
	var occupied := {}
	for tag in nest.brood_larvae:
		occupied[units[tag].brood_socket] = true
	for job in nest.production_queue:
		var egg: Dictionary = units.get(job.get("egg_tag", 0), {})
		if not egg.is_empty():
			occupied[egg.brood_socket] = true
	for socket in range(occupied.size() + count):
		if occupied.has(socket):
			continue
		var angle: float = TAU * float(socket % 24) / 24.0 + nest.facing
		var ring := floori(float(socket) / 24.0)
		var position: Vector2 = nest.pos + Vector2.from_angle(angle) * (nest.radius + 1.0 + float(ring) * 1.2)
		var larva := spawn_unit("brood_larva", nest.owner, _resource_land_position(position))
		larva["brood_parent"] = nest.tag
		larva["brood_socket"] = socket
		nest.brood_larvae.append(larva.tag)
		nest.brood_slots = nest.brood_larvae.size()
		if tick > 0:
			ability_triggered.emit(larva, "brood_larva_ready", larva.pos)
		count -= 1
		if count == 0:
			break

func _update_larva_creep(larva: Dictionary) -> bool:
	if has_living_ground(larva.pos):
		larva.erase("brood_off_creep_since")
		return false
	if not larva.has("brood_off_creep_since"):
		larva["brood_off_creep_since"] = tick
	if tick - int(larva.brood_off_creep_since) < ceili(LadderRules.LARVA_OFF_CREEP_SECONDS * TICK_RATE):
		return false
	_remove_destroyed_unit(larva)
	return true

func _try_finish_production(structure: Dictionary, index: int, arrivals: Array[Dictionary]) -> bool:
	var item: Dictionary = structure.production_queue[index]
	if item.get("unit_type") == "tactical_charge":
		structure.production_queue.remove_at(index)
		structure["tactical_charge_ready"] = true
		notice.emit(structure.owner, "Tactical Charge armed.", "info")
		return true
	if item.get("structure_evolution", false):
		var form: String = item.unit_type
		var definition := RTSData.get_unit_def(form)
		structure.production_queue.remove_at(index)
		structure["structure_form"] = form
		structure.name = definition.name
		structure.hp += float(definition.max_hp) - float(structure.max_hp)
		structure.max_hp = float(definition.max_hp)
		_ladder_last_progress_tick = tick
		notice.emit(structure.owner, "%s evolution complete." % structure.name, "info")
		return true
	if item.has("upgrade"):
		if ladder_rules and item.upgrade == "hub_operations" and not structure.get("passengers", []).is_empty() \
				and not _drop_ground_squad(structure.passengers, structure.pos):
			return false
		if ladder_rules:
			_ladder_last_progress_tick = tick
		structure.production_queue.remove_at(index)
		match item.upgrade:
			"combat_shields":
				players[structure.owner].upgrades["combat_shields"] = 1
				for unit in units.values():
					if unit.owner == structure.owner and unit.unit_type == "rifleman":
						_apply_combat_shield(unit)
					for passenger in unit.get("passengers", []):
						if passenger.owner == structure.owner and passenger.unit_type == "rifleman":
							_apply_combat_shield(passenger)
				notice.emit(structure.owner, "Combat Shields complete.", "info")
			"charge":
				players[structure.owner].upgrades["charge"] = 1
				for sunblade in units.values():
					if sunblade.owner == structure.owner and sunblade.unit_type == "sunblade":
						sunblade.speed = LadderRules.SUNBLADE_UPGRADED_SPEED
				notice.emit(structure.owner, "Charge research complete.", "info")
			"hub_operations":
				structure["hub_operations"] = true
				if ladder_rules:
					structure.name = "Operations Colony Hub"
					structure.energy = HUB_POWER_COST
				notice.emit(structure.owner, "Colony Hub operations upgraded.", "info")
			"fortify_hub":
				_morph_unit_in_place(structure, "fortified_hub")
				structure.armor = 2.0
				structure.armed_structure = true
				notice.emit(structure.owner, "Colony Hub fortification complete.", "info")
			"surge_efficiency":
				players[structure.owner].surge_efficiency = true
				notice.emit(structure.owner, "Efficient Surge complete.", "info")
			"fast_deployment":
				players[structure.owner].fast_deployment = true
				notice.emit(structure.owner, "Fast Deployment complete.", "info")
			"tunneling_claws":
				players[structure.owner].upgrades.tunneling_claws = 1
				for crawler in units.values():
					if crawler.owner == structure.owner and crawler.unit_type == "bile_crawler" and crawler.get("burrowed", false):
						crawler["burrow_mobile"] = true
						crawler.is_immobile = crawler.has("burrow_transition")
				notice.emit(structure.owner, "Tunneling Claws complete.", "info")
			"rolling_spores", "spore_burrow":
				players[structure.owner].upgrades[item.upgrade] = 1
				if item.upgrade == "rolling_spores":
					for fighter in units.values():
						if fighter.owner == structure.owner and fighter.unit_type == "sporeburst":
							_apply_rolling_spores(fighter)
						for passenger in fighter.get("passengers", []):
							if passenger.owner == structure.owner and passenger.unit_type == "sporeburst":
								_apply_rolling_spores(passenger)
				notice.emit(structure.owner, "%s complete." % str(item.upgrade).capitalize(), "info")
			_:
				players[structure.owner].upgrades[item.upgrade] = item.level
				notice.emit(structure.owner, "%s level %d complete." % [str(item.upgrade).capitalize(), item.level], "info")
		return true
	var utype: String = item.unit_type
	var egg_tag := int(item.get("egg_tag", 0))
	var spawn_origin: Dictionary = units.get(egg_tag, structure)
	var is_worker := bool(RTSData.get_unit_def(utype).get("is_worker", false))
	var route: Array = structure.rally_route
	if structure.unit_type == "brood_nest" and is_worker:
		route = structure.worker_rally_route
	var first := default_rally_position(structure)
	if not route.is_empty():
		first = rally_waypoint_position(route.front())
	var deployment: Vector2 = item.get("deployment_pos", Vector2.INF)
	var deploy_remotely := deployment.is_finite() and fast_deployment_ticks(structure) == 0 and is_powered(structure.owner, structure.pos) \
		and _fast_deployment_site_valid(structure.owner, deployment, utype, arrivals, true)
	var spawn_pos := deployment if deploy_remotely else _rally_spawn_position(spawn_origin, first, utype, arrivals)
	if not spawn_pos.is_finite():
		return false
	var positions := [spawn_pos]
	if int(item.get("hatch_count", 1)) == 2:
		var first_birth := {"pos": spawn_pos, "radius": RTSData.get_unit_def(utype).radius, "is_structure": false, "flight_height": 0.0}
		var occupied := arrivals.duplicate()
		occupied.append(first_birth)
		var second := _rally_spawn_position(spawn_origin, first, utype, occupied)
		if not second.is_finite():
			return false
		positions.append(second)
	# The job already reserves this supply. Remove it before spawn_unit counts
	# the recruit so the reservation is transferred exactly once.
	structure.production_queue.remove_at(index)
	if egg_tag != 0:
		ability_triggered.emit(spawn_origin, "brood_egg_hatch", spawn_origin.pos)
		units.erase(egg_tag)
	for position in positions:
		var new_unit := spawn_unit(utype, structure.owner, position)
		if new_unit.is_empty():
			continue
		arrivals.append(new_unit)
		players[structure.owner].units_trained += 1
		if ladder_rules:
			_ladder_last_progress_tick = tick
		if deploy_remotely:
			structure["fast_deployment_until"] = tick + FAST_DEPLOYMENT_COOLDOWN_TICKS
		unit_production_finished.emit(new_unit, structure)
		if deploy_remotely:
			continue
		if deployment.is_finite():
			notice.emit(structure.owner, "Deployment site unavailable. Unit used the normal exit.", "info")
		if not route.is_empty():
			_apply_rally_route(new_unit, route)
		elif is_worker and not match_state.is_empty():
			issue_SmartHarvest(new_unit.tag)
		elif first.distance_to(structure.pos) > structure.radius + 1.5:
			issue_command([new_unit.tag], "move", first)
	return true

func fast_deployment_ticks(structure: Dictionary) -> int:
	return maxi(0, int(structure.get("fast_deployment_until", 0)) - tick)

func transit_morph_block_reason(gate: Dictionary, command: String) -> String:
	var expected := "waystone" if command == "open_transit" else "transit_waystone"
	if not ladder_rules or gate.unit_type != expected or gate.build_progress < 1.0:
		return "Select a completed Waystone in the matching mode."
	if not players[gate.owner].upgrades.get("transit", 0):
		return "Research Transit at the Concord Core first."
	if gate.has("transit_morph") or not gate.production_queue.is_empty():
		return "Finish the current production job or transformation."
	return "" if is_powered(gate.owner, gate.pos) else "The Waystone needs a friendly power field."

func _step_transit_morph(gate: Dictionary) -> void:
	if not is_powered(gate.owner, gate.pos):
		return
	gate.transit_morph.ticks -= 1
	if gate.transit_morph.ticks <= 0:
		_morph_unit_in_place(gate, gate.transit_morph.target)
		gate.erase("transit_morph")
		ability_triggered.emit(gate, "transit_mode_ready", gate.pos)

func transit_deploy_block_reason(gate: Dictionary, unit_type: String) -> String:
	if not ladder_rules or gate.unit_type != "transit_waystone" or gate.build_progress < 1.0 or not LadderRules.TRANSIT_COOLDOWNS.has(unit_type):
		return "Select a completed Transit Waystone."
	if gate.has("transit_morph") or not is_powered(gate.owner, gate.pos):
		return "The Transit Waystone is unavailable."
	var charge: float = gate.get("transit_charge", 0.0)
	if charge > 0.0:
		return "Transit recharges in %.1fs." % charge
	for prerequisite in RTSData.get_unit_def(unit_type).get("requires", []):
		if not has_tech_structure(gate.owner, prerequisite):
			return "Requires a completed %s." % RTSData.get_unit_def(prerequisite).name
	return ""

func transit_field_time(owner: int, position: Vector2) -> float:
	var slow := false
	for source in units.values():
		if source.owner != owner or not power_source_covers(source, position):
			continue
		if source.unit_type == "lumen_carrier":
			return LadderRules.TRANSIT_FAST_SECONDS
		slow = true
		for anchor in units.values():
			if (anchor.owner == owner and anchor.unit_type in ["heartstone", "transit_waystone"]
					and anchor.build_progress >= 1.0 and power_source_covers(source, anchor.pos)):
				return LadderRules.TRANSIT_FAST_SECONDS
	return LadderRules.TRANSIT_SLOW_SECONDS if slow else 0.0

func _begin_transit_projection(gate: Dictionary, unit_type: String, point: Vector2) -> bool:
	if not transit_deploy_block_reason(gate, unit_type).is_empty():
		return false
	var definition := RTSData.get_unit_def(unit_type)
	if not _fast_deployment_site_valid(gate.owner, point, unit_type) or _ground_mobile_overlaps(point, definition.radius):
		return false
	var player: Dictionary = players[gate.owner]
	if player.crystal < definition.crystal_cost or player.aether < definition.aether_cost or player.supply_used + definition.supply_cost > player.supply_cap:
		return false
	var duration := ceili(transit_field_time(gate.owner, point) * TICK_RATE)
	player.crystal -= definition.crystal_cost
	player.aether -= definition.aether_cost
	gate["transit_charge"] = LadderRules.TRANSIT_COOLDOWNS[unit_type]
	var unit := spawn_unit(unit_type, gate.owner, point)
	unit.build_progress = 0.0
	unit.is_immobile = true
	unit["transit_source"] = gate.tag
	unit["transit_finish"] = tick + duration
	unit["transit_duration"] = duration
	ability_triggered.emit(unit, "transit_start", point)
	return true

func _update_transit_projection(unit: Dictionary) -> void:
	if not is_powered(unit.owner, unit.pos):
		_remove_destroyed_unit(unit)
		return
	var remaining: int = maxi(0, int(unit.transit_finish) - tick)
	unit.build_progress = 1.0 - float(remaining) / float(unit.transit_duration)
	if remaining > 0:
		return
	var producer: Dictionary = units.get(unit.transit_source, {})
	unit.erase("transit_finish")
	unit.erase("transit_duration")
	unit.erase("transit_source")
	unit.is_immobile = false
	players[unit.owner].units_trained += 1
	_ladder_last_progress_tick = tick
	unit_production_finished.emit(unit, producer)
	ability_triggered.emit(unit, "transit_ready", unit.pos)

func fast_deployment_block_reason(structure: Dictionary) -> String:
	if structure.unit_type != "waystone" or structure.build_progress < 1.0:
		return "Select a completed Waystone."
	if not players[structure.owner].get("fast_deployment", false):
		return "Research Fast Deployment first."
	if not is_powered(structure.owner, structure.pos):
		return "The Waystone needs a friendly power field."
	var remaining := fast_deployment_ticks(structure)
	if remaining > 0:
		return "Deployment recharges in %.1fs." % (remaining * TICK_DT)
	if structure.production_queue.is_empty() or not structure.production_queue[0].has("unit_type"):
		return "Queue a paid unit first."
	return ""

func _assign_fast_deployment(structure: Dictionary, pos: Vector2) -> bool:
	if not fast_deployment_block_reason(structure).is_empty():
		return false
	var item: Dictionary = structure.production_queue.front()
	if not _fast_deployment_site_valid(structure.owner, pos, item.unit_type):
		return false
	item["deployment_pos"] = pos
	return true

func _fast_deployment_site_valid(owner: int, pos: Vector2, unit_type: String, arrivals: Array[Dictionary] = [], check_mobiles: bool = false) -> bool:
	if not pos.is_finite() or not can_see_position(owner, pos) or not is_powered(owner, pos):
		return false
	var definition := RTSData.get_unit_def(unit_type)
	var radius: float = definition.get("radius", 0.85)
	var flying := float(definition.get("flight_height", 0.0)) > 0.0
	if _map_clamped_position(pos, radius) != pos or (not flying and _is_point_blocked_by_static(pos, radius)):
		return false
	if not check_mobiles:
		return true
	var nearby := query_units_in_radius(pos, radius)
	nearby.append_array(arrivals)
	for other in nearby:
		if other.is_structure or (other.flight_height > 0.0) != flying:
			continue
		var clearance: float = radius + other.radius
		if pos.distance_squared_to(other.pos) < clearance * clearance:
			return false
	return true

func _rally_spawn_position(structure: Dictionary, first: Vector2, unit_type: String, arrivals: Array[Dictionary] = []) -> Vector2:
	var definition: Dictionary = RTSData.get_unit_def(unit_type)
	var radius: float = definition.get("radius", 0.85)
	var flying: bool = float(definition.get("flight_height", 0.0)) > 0.0
	var cliff_walk := bool(RTSData.get_unit_def(unit_type).get("cliff_walk", false))
	var direction: Vector2 = (first - structure.pos).normalized()
	if direction.is_zero_approx():
		direction = Vector2.RIGHT if structure.owner == 1 else Vector2.LEFT
	var rim: float = structure.radius + radius + 0.05
	var distance: float = maxf(structure.radius + 1.8, rim)
	var distances := [distance]
	if structure.unit_type == "brood_egg":
		distances.append_array([distance + 2.0 * radius, distance + 4.0 * radius])
	var nearby := query_units_in_radius(structure.pos, float(distances.back()) + radius)
	# The spatial index is built before production. Account for earlier births
	# in this tick, including parallel jobs at the same Brood Nest.
	nearby.append_array(arrivals)
	for exit_distance in distances:
		for i in range(16):
			var turn := ((i + 1) / 2) * (1 if i % 2 == 1 else -1)
			var heading := direction.rotated(float(turn) * TAU / 16.0)
			var position: Vector2 = structure.pos + heading * float(exit_distance)
			if _map_clamped_position(position, radius) != position:
				continue
			if not flying and not _ground_production_exit_open(structure.pos + heading * rim, position, heading, radius, cliff_walk):
				continue
			var occupied := false
			for other in nearby:
				if (other.is_structure and other.flight_height <= 0.0) or other.get("burrowed", false) or other.get("nonblocking", false) or (other.flight_height > 0.0) != flying:
					continue
				var clearance: float = radius + other.radius
				if position.distance_squared_to(other.pos) < clearance * clearance:
					occupied = true
					break
			if not occupied:
				return position
	return Vector2.INF

func _ground_production_exit_open(rim: Vector2, position: Vector2, heading: Vector2, radius: float, cliff_walk: bool) -> bool:
	if _is_point_blocked_by_static(rim, radius, cliff_walk) or not _has_clear_line_of_walk(rim, position, radius, cliff_walk):
		return false
	# A free spawn point alone could be a pocket between footprints. Require
	# space to leave it, allowing a turn around an adjacent obstacle.
	for turn in [0.0, PI / 4.0, -PI / 4.0]:
		if _has_clear_line_of_walk(position, position + heading.rotated(turn) * PATH_CELL_SIZE, radius, cliff_walk):
			return true
	return false

func _update_unit_timers(u: Dictionary, dt: float) -> void:
	if u.has("stasis_until") and tick >= int(u.stasis_until):
		u.is_immobile = u.get("stasis_was_immobile", false)
		u.erase("stasis_until")
		u.erase("stasis_was_immobile")
	var regeneration := float(u.get("hp_regen", 0.0))
	if ladder_rules and u.unit_type == "bile_crawler" and u.get("burrowed", false):
		regeneration += LadderRules.BILE_CRAWLER_BURROW_REGEN
	if ladder_rules and LadderRules.CRAWLER_ROOT_SECONDS.has(u.unit_type) and u.build_progress >= 1.0 \
			and not u.get("crawler_uprooted", false) and not has_living_ground(u.pos):
		u.hp -= LadderRules.CRAWLER_OFF_CREEP_DAMAGE * dt
	elif regeneration > 0.0 and u.hp > 0.0 and u.hp < u.max_hp and u.out_of_combat_timer >= u.get("hp_regen_delay", 0.0):
		u.hp = minf(u.max_hp, u.hp + regeneration * dt)
	if u.has("transfuse_until"):
		if tick <= int(u.transfuse_until):
			u.hp = minf(u.max_hp, u.hp + 50.0 * dt / LadderRules.TRANSFUSE_SECONDS)
		else:
			u.erase("transfuse_until")
	if u.has("power_field_until") and carrier_power_ticks(u) == 0:
		_set_carrier_field(u, false)
	if u.has("power_field_transition") and tick >= int(u.power_field_transition.finish):
		var deploy: bool = u.power_field_transition.deploy
		u.erase("power_field_transition")
		_set_carrier_field(u, deploy)
	if u.has("energy_profile"):
		u.energy = minf(float(u.energy_profile.max), u.energy + float(u.energy_profile.regen) * dt)
	if u.get("pulsar_active", false):
		u.energy = maxf(0.0, u.energy - LadderRules.ORACLE_BEAM_DRAIN * dt)
		if u.energy == 0.0:
			_disable_pulsar_beam(u)
	if u.unit_type in ["shade_agent", "night_harrier"] and u.get("cloaked", false):
		u.energy = maxf(0.0, u.energy - LadderRules.AGENT_CLOAK_DRAIN * dt)
		if u.energy == 0.0:
			u["cloaked"] = false
	if u.unit_type == "skirmisher" and not ladder_rules:
		if u.get("cloaked", false):
			u.energy = maxf(0.0, u.energy - CLOAK_DRAIN * dt)
			if u.energy <= 0.0:
				u["cloaked"] = false
		else:
			u.energy = minf(CLOAK_ENERGY_MAX, u.energy + dt)
	if u["surge_timer"] > 0.0:
		u["surge_timer"] = max(0.0, u["surge_timer"] - dt)
	if u["charge_timer"] > 0.0:
		u["charge_timer"] = max(0.0, u["charge_timer"] - dt)
	if u["phase_cooldown"] > 0.0:
		u["phase_cooldown"] = max(0.0, u["phase_cooldown"] - dt)
	if u["slow_timer"] > 0.0:
		u["slow_timer"] = max(0.0, u["slow_timer"] - dt)

	u["out_of_combat_timer"] += dt
	var shield_delay := LadderRules.SHIELD_REGEN_DELAY_SECONDS if ladder_rules else 3.5
	if u["max_shields"] > 0.0 and u["shields"] < u["max_shields"] and u["out_of_combat_timer"] >= shield_delay:
		var shield_regeneration := LadderRules.SHIELD_REGEN_PER_SECOND if ladder_rules else 6.0
		u["shields"] = minf(u["max_shields"], u["shields"] + shield_regeneration * dt)

	if u["weapon_cooldown"] > 0.0:
		u["weapon_cooldown"] = max(0.0, u["weapon_cooldown"] - dt * _attack_speed_multiplier(u))

	if u["pushed_timer"] > 0.0:
		u["pushed_timer"] = max(0.0, u["pushed_timer"] - dt)

func _attack_speed_multiplier(unit: Dictionary) -> float:
	var multiplier := 1.5 if unit.surge_timer > 0.0 else 1.0
	if unit.unit_type == "mirage_adept" and players.get(unit.owner, {}).get("upgrades", {}).get("resonant_glaives", 0):
		multiplier *= 1.45
	if ladder_rules and unit.unit_type == "skitterling" and players[unit.owner].upgrades.get("adrenal_glands", 0):
		multiplier *= 1.4
	if _time_warp_covers(unit):
		multiplier *= 0.6
	return multiplier

func _update_unit_orders(u: Dictionary, dt: float) -> void:
	u["vel"] = Vector2.ZERO
	if u.unit_type == "dreadnought":
		if _step_dreadnought_ability(u):
			return
		_step_dreadnought_weapon(u)
	if u.unit_type == "fleet_carrier":
		_step_fleet_hangar(u)
	if u.unit_type == "pursuit_fighter":
		_step_pursuit_fighter(u, dt)
		return
	if u.has("vehicle_transition"):
		if tick >= int(u.vehicle_transition.finish):
			_finish_vehicle_mode(u)
		return
	if u.has("sky_transition"):
		if tick >= int(u.sky_transition.finish):
			_finish_sky_mode(u)
		return
	if u.unit_type == "sentinel_mine_armed":
		_step_sentinel_mine(u)
		return
	if u.unit_type == "vortex_rover":
		_step_vortex_lock(u)
	if u.has("agent_snipe"):
		_step_agent_snipe(u)
		return
	if u.has("agent_strike"):
		if tick >= int(u.agent_strike.ends):
			_finish_agent_strike(u)
		return
	if u.has("gravity_lifted_by"):
		return
	if u.has("gravity_lift_target"):
		if tick >= int(u.gravity_lift_ends):
			_end_gravity_lift(u)
		return
	if u.has("siphon_target"):
		_step_wyrm_siphon(u)
		return
	if u.unit_type == "locust_flying" and _step_flying_locust(u):
		return
	if u.has("caustic_spray"):
		_step_caustic_spray(u)
		return
	if u.unit_type == "brood_mimic" and not u.has("disguise_type") and tick % 8 == int(u.tag) % 8:
		_disguise_brood_mimic(u)
	if u.has("crawler_transition"):
		if tick >= int(u.crawler_transition.finish):
			_finish_crawler_transition(u)
		return
	if u.has("burrow_transition"):
		if tick >= int(u.burrow_transition.finish):
			_finish_burrow_transition(u)
		return
	if u.has("flight_transition"):
		return
	if u.unit_type == "field_bunker":
		_update_bunker_garrison(u, dt)
		return
	if u.unit_type == "sporeburst_cocoon":
		if tick >= int(u.get("sporeburst_morph_until", tick)):
			_finish_sporeburst_morph(u)
		return
	if u.has("brood_morph"):
		if tick >= int(u.brood_morph.finish):
			_finish_brood_morph(u)
		return
	if u.unit_type in ["rupture_cocoon", "ambusher_cocoon", "seer_cocoon", "hauler_cocoon", "siege_flyer_cocoon"]:
		return
	if u.has("carapace_morph_until"):
		if tick >= int(u.carapace_morph_until):
			_finish_carapace_morph(u)
		return
	if u.has("fighter_mode_until"):
		if tick >= int(u.fighter_mode_until):
			_finish_fighter_mode(u)
		return
	if u.get("burrowed", false) and u.unit_type != "spine_ambusher":
		if u.get("burrow_mobile", false) and not u.orders.is_empty():
			if u.orders[0].type == "move":
				_step_move_order(u, u.orders[0], dt)
			elif u.orders[0].type == "stop":
				u.orders.pop_front()
				u.path.clear()
		return

	if u["attack_state"] == "windup":
		var target = units.get(u["attack_target_tag"], {})
		if target.is_empty() or target["hp"] <= 0.0 or not can_see_unit(u.owner, target):
			u["attack_state"] = "idle"
		else:
			u["attack_state_timer"] -= dt
			_face_attack_target(u, target)
			if u["attack_state_timer"] <= 0.0:
				var wpn: Dictionary = u.get("windup_weapon", {})
				if wpn.is_empty():
					wpn = _active_weapon(u, target)
				var range_slop: float = LadderRules.WEAPON_RANGE_SLOP_OVERRIDES.get(u.unit_type, LadderRules.WEAPON_RANGE_SLOP)
				if (ladder_rules and _edge_distance(u, target) > weapon_range_against(u, target) + range_slop) \
						or not _execute_weapon_hit(u, target, {}, wpn):
					u.attack_state = "idle"
					return
				u.weapon_cooldown = _weapon_period(u, wpn)
				if ladder_rules:
					var windup_ticks := maxi(1, ceili(float(u.attack_windup_duration) * TICK_RATE))
					u.weapon_cooldown = maxf(0.0, u.weapon_cooldown - float(windup_ticks) / TICK_RATE * _attack_speed_multiplier(u))
				u["attack_state"] = "backswing"
				u["attack_state_timer"] = float(wpn.get("backswing", 0.25))
				if ladder_rules:
					u.attack_state_timer /= _attack_speed_multiplier(u)
			return

	elif u["attack_state"] == "backswing":
		u["attack_state_timer"] -= dt
		if u["attack_state_timer"] <= 0.0 or (ladder_rules and u.weapon_cooldown <= 0.0):
			u["attack_state"] = "idle"
		if (not ladder_rules or u.attack_state == "backswing") and u["orders"].size() > 0 and u["orders"][0]["type"] != "move":
			return

	_start_waiting_target_order(u)
	if u["orders"].is_empty():
		if u.get("auto_repair", false) and tick % 8 == u.tag % 8 and _begin_auto_repair(u):
			return
		# Skirmish guards fire in place until the director commits them.
		var range_only: bool = u.is_structure or u.unit_type == "spine_ambusher"
		if not range_only and not u.is_worker:
			var directive: Dictionary = RTSCommanderAI.player_directives.get(u.owner, {})
			range_only = directive.get("enabled", false) and directive.get("mode") == "skirmish"
		var enemy = _find_best_attack_target(u, range_only)
		if not enemy.is_empty():
			var wpn_range = weapon_range_against(u, enemy)
			var dist_edge = _edge_distance(u, enemy)
			if dist_edge <= wpn_range:
				_begin_attack_on(u, enemy)
				return
			elif not u["is_immobile"] and not u["is_worker"]:
				_try_automatic_charge(u, enemy)
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
		"sky_defender_mode":
			var point: Vector2 = order.target_pos
			var reach := sky_deploy_range(u)
			if u.pos.distance_squared_to(point) > reach * reach:
				_follow_order_path(u, point, dt, reach)
			else:
				_begin_sky_mode(u, point, true)
		"root_watch":
			var point: Vector2 = order.target_pos
			if u.pos.distance_squared_to(point) > 0.25:
				_follow_order_path(u, point, dt)
				return
			if not _crawler_root_site_valid(u, point):
				u.orders.pop_front()
				u.path.clear()
				notice.emit(u.owner, "Rooting requires clear living ground.", "warn")
				return
			u.pos = point
			u.prev_pos = point
			_begin_crawler_transition(u, true)
		"inject_brood":
			var nest: Dictionary = units.get(order.target_tag, {})
			if brood_inject_block_reason(u, nest).is_empty():
				var cast_range := 1.0 if ladder_rules else BROOD_INJECT_RANGE
				if _edge_distance(u, nest) > cast_range:
					_follow_order_path(u, nest.pos, dt, u.radius + nest.radius + cast_range)
					return
				u.energy -= BROOD_INJECT_COST
				u.facing = (nest.pos - u.pos).angle()
				if ladder_rules and nest.get("brood_inject_finish", 0) > 0:
					nest["brood_inject_queued"] = int(nest.get("brood_inject_queued", 0)) + 1
				else:
					nest["brood_inject_finish"] = tick + (ceili(LadderRules.INJECT_SECONDS * TICK_RATE) if ladder_rules else BROOD_INJECT_DELAY)
				ability_triggered.emit(u, "inject_brood", nest.pos)
			u.orders.pop_front()
			u.path.clear()

		"land":
			var position: Vector2 = order.target_pos
			if u.pos.distance_squared_to(position) > 0.04:
				_follow_order_path(u, position, dt)
				return
			var reason := landing_block_reason(u, position)
			if not reason.is_empty():
				u.orders.pop_front()
				u.path.clear()
				notice.emit(u.owner, reason, "warn")
				return
			u.pos = position
			u.prev_pos = position
			_begin_production_flight_transition(u, "land", u.flight_height, get_elevation_at(position))

		"move":
			_step_move_order(u, order, dt)
			if u.unit_type == "dawn_interceptor" and u.weapon_cooldown <= 0.0 and not u.vel.is_zero_approx():
				var target := _find_best_attack_target(u, true)
				if not target.is_empty() and _execute_weapon_hit(u, target):
					u.weapon_cooldown = _weapon_period(u, _active_weapon(u, target))

		"hold_position":
			if u.orders.size() > 1:
				u.orders.pop_front()
				u.path.clear()
				return
			var enemy = _find_best_attack_target(u, true)
			if not enemy.is_empty():
				_begin_attack_on(u, enemy)

		"stop":
			_release_mining_slot(u)
			u.orders.pop_front()
			u.path.clear()
			u.home_pos = u.pos

		"attack_move", "patrol":
			if otype == "patrol" and not order.has("patrol_origin"):
				order["patrol_origin"] = u.pos
			if u.has("skirmish_route"):
				u.skirmish_route.erase("blocked_pursuit")
			var range_only := bool(order.get("stay_on_route", false))
			var pursuit_origins: Dictionary = order.get("_pursuit_origins", {})
			var enemy := _find_best_attack_target(u, range_only, pursuit_origins)
			if not enemy.is_empty():
				if otype == "attack_move" and not range_only and not enemy.is_structure and not pursuit_origins.has(enemy.tag):
					# Preserve the acquisition point so a retreating target cannot
					# extend the chase just by staying within the moving scan radius.
					pursuit_origins[enemy.tag] = u.pos
					order["_pursuit_origins"] = pursuit_origins
				var wpn_range = weapon_range_against(u, enemy)
				if _edge_distance(u, enemy) <= wpn_range:
					_begin_attack_on(u, enemy)
				else:
					if not range_only:
						_try_automatic_charge(u, enemy)
					_approach_target(u, enemy["pos"], dt)
					if u.has("skirmish_route"):
						var reach: float = wpn_range + u.radius + enemy.radius + 0.75
						u.skirmish_route["blocked_pursuit"] = u.path.back().distance_squared_to(enemy.pos) > reach * reach
			else:
				var target_pos := _prepare_order_path(u, order)
				var arrival_rad: float = float(order.get("arrival_radius", 1.5))
				if u.path.size() == 1 and u.pos.distance_to(target_pos) <= arrival_rad:
					if not _can_finish_path_order(u, order):
						return
					if otype == "patrol" and target_pos.distance_to(order.patrol_origin) > arrival_rad:
						order.target_pos = order.patrol_origin
						order.patrol_origin = target_pos
						u.path.clear()
					else:
						u["orders"].pop_front()
						u.path.clear()
						u["home_pos"] = u["pos"]
				else:
					_follow_path(u, dt)

		"attack_target", "force_attack":
			var t_tag = int(order.get("target_tag", 0))
			var enemy: Dictionary = units.get(t_tag, {})
			var intercept: Dictionary = order.get("_defense_intercept", {})
			var target_lost := enemy.is_empty() or not can_see_unit(u.owner, enemy)
			if not intercept.is_empty() and (target_lost or enemy.pos.distance_squared_to(intercept.center) > intercept.radius_squared or not can_attack(u, enemy)):
				u.orders[0] = {"type": "move", "target_pos": intercept.origin}
				u.path.clear()
				return
			if target_lost:
				# Mobile units can continue to the last observed location of an enemy.
				if otype == "attack_target" and not u.is_immobile and order.has("target_pos") and (vision != null or not enemy.is_empty()):
					u.orders[0] = {"type": "attack_move", "target_pos": order.target_pos}
				else:
					u.orders.pop_front()
				u.path.clear()
				return
			if enemy.hp <= 0.0 or not can_attack(u, enemy):
				u["orders"].pop_front()
				u.path.clear()
				return
			order.target_pos = enemy.pos
			var wpn_range = weapon_range_against(u, enemy)
			if _edge_distance(u, enemy) <= wpn_range:
				_begin_attack_on(u, enemy)
			elif not u["is_immobile"]:
				_try_automatic_charge(u, enemy)
				_approach_target(u, enemy["pos"], dt)
			elif u.armed_structure or u.unit_type == "spine_ambusher":
				u.orders.pop_front()

		"harvest":
			_process_worker_harvest_order(u, order, dt)

		"return_cargo":
			if _deliver_worker_cargo(u, dt, order.target_tag):
				u.orders.pop_front()
				u.path.clear()
		"unload_transport":
			if u.pos.distance_squared_to(order.target_pos) > 1.0:
				_move_toward_point(u, order.target_pos, dt)
			else:
				if ladder_rules and u.unit_type == "rampart_transport":
					if not _step_rampart_unload(u, order):
						return
				elif not _unload_transport(u, order.target_pos):
					notice.emit(u.owner, "Deployment site blocked. Troops remain aboard.", "warn")
				u.orders.pop_front()
				u.path.clear()
				u.home_pos = u.pos

		"follow":
			var leader: Dictionary = units.get(order.target_tag, {})
			if not _is_friendly_mobile(leader, u.owner):
				u.orders.pop_front()
				u.path.clear()
			elif leader.unit_type == "settlement_truck" and _escort_engage(u):
				return
			elif _edge_distance(u, leader) > 1.5:
				if u.get("nav_goal", Vector2.INF).distance_squared_to(leader.pos) > 1.0:
					u.path.clear()
				_follow_order_path(u, leader.pos, dt)
			else:
				u.path.clear()
				if u.orders.size() > 1:
					u.orders.pop_front()

		"enter_bunker":
			var bunker: Dictionary = units.get(order.target_tag, {})
			if not can_enter_bunker(u, bunker):
				u.orders.pop_front()
				u.path.clear()
			elif _edge_distance(u, bunker) <= 1.2 and _has_carrier_access(u.pos, u.radius, bunker):
				var garrison: Array = bunker.get("passengers", [])
				_embark_ground_unit(garrison, u)
				bunker["passengers"] = garrison
			else:
				_follow_order_path(u, bunker.pos, dt, bunker.radius + u.radius + 1.2)

		"enter_rampart":
			var transport: Dictionary = units.get(order.target_tag, {})
			if not can_enter_rampart(u, transport):
				u.orders.pop_front()
				u.path.clear()
			elif _edge_distance(u, transport) <= 2.5:
				var cargo: Array = transport.get("passengers", [])
				_embark_ground_unit(cargo, u)
				transport["passengers"] = cargo
			else:
				_approach_target(u, transport.pos, dt)

		"enter_brood_tunnel":
			var endpoint: Dictionary = units.get(order.target_tag, {})
			if not can_enter_brood_tunnel(u, endpoint):
				u.orders.pop_front()
				u.path.clear()
			elif _edge_distance(u, endpoint) <= 1.2 and _has_carrier_access(u.pos, u.radius, endpoint):
				if tick >= int(endpoint.get("brood_tunnel_load_ready", 0)):
					if not brood_tunnel_cargo.has(u.owner):
						brood_tunnel_cargo[u.owner] = []
					_embark_ground_unit(brood_tunnel_cargo[u.owner], u)
					endpoint["brood_tunnel_load_ready"] = tick + ceili(LadderRules.BROOD_TUNNEL_LOAD_SECONDS * TICK_RATE)
			else:
				_approach_target(u, endpoint.pos, dt)

		"build":
			_process_worker_build_order(u, order, dt)

		"repair":
			_process_repair_order(u, order, dt)

func _start_waiting_target_order(unit: Dictionary) -> void:
	while not unit.orders.is_empty() and unit.orders[0].get("waiting_for_turn", false):
		var order: Dictionary = unit.orders[0]
		if _waiting_target_lost(unit, order):
			unit.orders.pop_front()
			unit.path.clear()
			continue
		order.erase("waiting_for_turn")
		if order.type == "harvest":
			unit.harvest_target_tag = order.target_tag
		break

func _waiting_target_lost(unit: Dictionary, order: Dictionary) -> bool:
	var target: Dictionary = units.get(order.target_tag, {})
	match order.type:
		"attack_target":
			# Treat an unobserved loss just like an enemy that moved out of sight.
			if target.is_empty():
				return vision == null or order.get("target_lost", false)
			return can_see_unit(unit.owner, target) and (target.hp <= 0.0 or not can_attack(unit, target))
		"force_attack":
			return target.is_empty() or target.hp <= 0.0 or target.owner != unit.owner or not can_attack(unit, target)
		"follow":
			return not _is_friendly_mobile(target, unit.owner)
		"enter_bunker":
			return not can_enter_bunker(unit, target)
		"enter_rampart":
			return not can_enter_rampart(unit, target)
		"enter_brood_tunnel":
			return not can_enter_brood_tunnel(unit, target)
		"harvest":
			var source: Dictionary = resources.get(order.target_tag, {})
			if source.is_empty():
				if target.is_empty() or not target.is_extractor or target.owner != unit.owner or target.hp <= 0.0:
					return true
				source = resources.get(_gas_source_by_tap.get(target.tag, 0), {})
			elif source.resource_type == "aether_vent":
				var tap_tag: int = _gas_tap_by_vent.get(Vector2i(unit.owner, source.tag), 0)
				var tap: Dictionary = units.get(tap_tag, {})
				if tap.is_empty() or tap.hp <= 0.0:
					return true
			return not source.is_empty() and not unlimited_resources and source.amount <= 0
	return false

func _confirm_waiting_attack_loss(target: Dictionary) -> void:
	if vision == null:
		return
	var visibility := {}
	for unit in units.values():
		for order in unit.orders:
			if order.type != "attack_target" or not order.get("waiting_for_turn", false) or order.target_tag != target.tag:
				continue
			if not visibility.has(unit.owner):
				visibility[unit.owner] = can_see_unit(unit.owner, target)
			if visibility[unit.owner]:
				order["target_lost"] = true

func _release_mining_slot(worker: Dictionary) -> void:
	var source_tag: int = worker.get("mining_source_tag", 0)
	var patch: Dictionary = resources.get(source_tag, units.get(source_tag, {}))
	if int(patch.get("mining_worker", 0)) == worker.tag:
		patch.mining_worker = 0
	if patch.has("gas_queue"):
		patch.gas_queue.erase(worker.tag)
	worker.erase("mining_source_tag")
	if worker.erase("gas_extracting"):
		worker.pos = worker.gas_exit_pos
		worker.prev_pos = worker.pos
		worker.erase("gas_exit_pos")
		worker.nonblocking = false
	worker.harvest_timer = 0.0

func _claim_mining_slot(worker: Dictionary, patch: Dictionary) -> bool:
	if ladder_rules and worker.unit_type == "prospector" and patch.get("resource_type") == "crystal_field":
		return true
	var holder: int = patch.get("mining_worker", 0)
	if holder == worker.tag:
		return true
	var miner: Dictionary = units.get(holder, {})
	if not miner.is_empty() and miner.hp > 0.0 and miner.cargo_amount == 0 and not miner.orders.is_empty():
		var active: Dictionary = miner.orders[0]
		if active.type == "harvest" and int(miner.get("mining_source_tag", 0)) == patch.tag:
			return false
	patch.mining_worker = worker.tag
	worker["mining_source_tag"] = patch.tag
	worker.harvest_timer = 0.0
	return true

func _enter_aether_extractor(worker: Dictionary, source: Dictionary, center: Vector2) -> bool:
	if worker.get("gas_extracting", false):
		return true
	if not source.has("gas_queue"):
		source["gas_queue"] = []
	var queue: Array = source.gas_queue
	if int(worker.get("mining_source_tag", 0)) != source.tag:
		_release_mining_slot(worker)
		worker["mining_source_tag"] = source.tag
		queue.append(worker.tag)
	if queue.is_empty() or queue.front() != worker.tag or not _claim_mining_slot(worker, source):
		return false
	queue.pop_front()
	worker["gas_exit_pos"] = worker.pos
	worker["gas_extracting"] = true
	worker.nonblocking = true
	worker.pos = center
	worker.path.clear()
	return true

func _deliver_worker_cargo(worker: Dictionary, dt: float, hall_tag: int = 0) -> bool:
	if worker.cargo_amount <= 0:
		return true
	var hall: Dictionary = units.get(hall_tag, {})
	if not is_dropoff(hall, worker.owner):
		hall = _find_nearest_town_hall(worker.owner, worker.pos)
	if hall.is_empty():
		return false
	if _edge_distance(worker, hall) > 1.6:
		_follow_order_path(worker, hall.pos, dt, worker.radius + hall.radius + 1.6)
		return false
	var player: Dictionary = players[worker.owner]
	var cargo: String = worker.cargo_type
	player[cargo] += worker.cargo_amount
	player[cargo + "_collected"] += worker.cargo_amount
	_record_income(worker.owner, cargo, worker.cargo_amount)
	worker.cargo_amount = 0
	worker.cargo_type = ""
	return true

func _record_income(owner_id: int, cargo: String, amount: int) -> void:
	if ladder_rules and amount > 0:
		_ladder_last_progress_tick = tick
	if not _income_buckets.has(owner_id):
		_income_buckets[owner_id] = {}
	var buckets: Dictionary = _income_buckets[owner_id]
	var second := floori(sim_time)
	var slot := second % INCOME_WINDOW
	var sample: Dictionary = buckets.get(slot, {})
	if sample.get("second", -1) != second:
		sample = {"second": second, "crystal": 0, "aether": 0}
		buckets[slot] = sample
	sample[cargo] += amount

func recent_income(owner_id: int) -> Dictionary:
	var totals := {"crystal": 0, "aether": 0}
	var second := floori(sim_time)
	for sample in _income_buckets.get(owner_id, {}).values():
		if second - sample.second < INCOME_WINDOW:
			totals.crystal += sample.crystal
			totals.aether += sample.aether
	return totals

func _harvest_dropoff(worker: Dictionary, order: Dictionary) -> int:
	var previous: int = order.get("dropoff_tag", 0)
	if is_dropoff(units.get(previous, {}), worker.owner):
		return previous
	if previous == 0:
		var target: Dictionary = resources.get(order.target_tag, units.get(order.target_tag, {}))
		var hall := _find_nearest_town_hall(worker.owner, target.get("pos", worker.pos))
		order["dropoff_tag"] = hall.get("tag", 0)
		return order.dropoff_tag
	if tick < int(order.get("dropoff_retry", 0)):
		return -1
	var replacement := _reachable_dropoff(worker)
	if replacement.is_empty():
		order["dropoff_retry"] = tick + TICK_RATE
		return -1
	order.erase("dropoff_retry")
	order.dropoff_tag = replacement.tag
	var patch := _pick_local_crystal({"tag": worker.tag, "owner": worker.owner, "pos": replacement.pos}, _find_nearest_crystal(replacement.pos))
	if not patch.is_empty():
		_release_mining_slot(worker)
		order.target_tag = patch.tag
		worker.harvest_target_tag = patch.tag
		worker.path.clear()
	return replacement.tag

func _reachable_dropoff(worker: Dictionary) -> Dictionary:
	var nearest := {}
	var best_distance := INF
	for hall in _town_halls:
		if not is_dropoff(hall, worker.owner):
			continue
		var distance: float = worker.pos.distance_squared_to(hall.pos)
		if distance >= best_distance:
			continue
		var reach: float = worker.radius + hall.radius + 1.6
		var path := compute_smooth_path(worker.pos, hall.pos, worker.radius, false, reach)
		if path.back().distance_to(hall.pos) <= reach:
			nearest = hall
			best_distance = distance
	return nearest

func _process_worker_harvest_order(u: Dictionary, order: Dictionary, dt: float) -> void:
	var hall_tag := _harvest_dropoff(u, order)
	if hall_tag < 0:
		_release_mining_slot(u)
		return
	var res_tag = int(order.get("target_tag", u["harvest_target_tag"]))
	if u["cargo_amount"] > 0:
		if int(u.get("harvest_leave_tick", 0)) > tick:
			return
		var crystal_trip: bool = u.cargo_type == "crystal"
		if _deliver_worker_cargo(u, dt, hall_tag):
			if u.orders.size() > 1:
				u.orders.pop_front()
				u.path.clear()
			elif crystal_trip:
				var patch: Dictionary = resources.get(res_tag, {})
				if patch.get("resource_type") == "crystal_field" and deposit_present(patch):
					_reassign_crystal_worker(u, order, patch, CrystalSelection.OPEN_SLOT)
		return

	var target_entity: Dictionary = {}
	var is_gas: bool = false
	if resources.has(res_tag):
		target_entity = resources[res_tag]
		is_gas = (target_entity["resource_type"] == "aether_vent")
	elif units.has(res_tag) and units[res_tag].is_extractor:
		target_entity = units[res_tag]
		is_gas = true
	else:
		_release_mining_slot(u)
		var nearest_res := _pick_local_crystal(u, _find_nearest_crystal(u.pos))
		if nearest_res.is_empty():
			u["orders"].pop_front()
			return
		order["target_tag"] = nearest_res["tag"]
		res_tag = nearest_res.tag
		u["harvest_target_tag"] = nearest_res["tag"]
		target_entity = nearest_res

	var dist = u["pos"].distance_to(target_entity["pos"]) - (u["radius"] + float(target_entity.get("radius", 1.8)))
	var source_tag = res_tag
	var extractor: Dictionary = {}
	if is_gas:
		# Links change only when structures change. Scanning the whole army and
		# every map deposit for each gas worker at 64 Hz dominated late-game CPU.
		var tap_tag = res_tag if units.has(res_tag) else int(_gas_tap_by_vent.get(Vector2i(u.owner, res_tag), 0))
		extractor = units.get(tap_tag, {})
		if extractor.is_empty() or extractor.owner != u.owner:
			_release_mining_slot(u)
			u.orders.pop_front()
			return
		if extractor.build_progress < 1.0:
			if dist > HARVEST_REACH:
				_follow_order_path(u, target_entity.pos, dt, u.radius + target_entity.radius + HARVEST_REACH)
			return
		source_tag = int(_gas_source_by_tap.get(tap_tag, res_tag))
		target_entity = extractor
		dist = _edge_distance(u, extractor)
	if resources.has(source_tag) and int(resources[source_tag].amount) <= 0 and not unlimited_resources:
		_release_mining_slot(u)
		u.orders.pop_front()
		if u.orders.is_empty():
			issue_SmartHarvest(u.tag)
		return
	if dist <= HARVEST_REACH:
		u["vel"] = Vector2.ZERO
		u["facing"] = (target_entity["pos"] - u["pos"]).angle()
		var mining_source: Dictionary = resources.get(source_tag, {})
		if not is_gas and campaign != null and campaign.mutators != null and campaign.mutators.mineral_shield_blocks(self, source_tag):
			_release_mining_slot(u)
			u.harvest_timer = 0.0
			return
		if is_gas:
			if not _enter_aether_extractor(u, mining_source if not mining_source.is_empty() else extractor, extractor.pos):
				return
		elif not mining_source.is_empty() and not _claim_mining_slot(u, mining_source):
			u.harvest_timer = 0.0
			return
		var prev_timer: float = float(u["harvest_timer"])
		u["harvest_timer"] += dt
		if not is_gas and prev_timer <= 0.0 and u["harvest_timer"] > 0.0:
			if not resources.has(source_tag) or int(resources[source_tag].amount) > 0 or unlimited_resources:
				emit_signal("resource_gathered", u, "crystal", target_entity["pos"])
		var gather_seconds := 1.75
		if ladder_rules:
			gather_seconds = LadderRules.AETHER_GATHER_SECONDS if is_gas else LadderRules.CRYSTAL_GATHER_SECONDS
		if u["harvest_timer"] >= gather_seconds:
			_release_mining_slot(u)
			if ladder_rules and not is_gas:
				u["harvest_leave_tick"] = tick + ceili(LadderRules.CRYSTAL_LEAVE_SECONDS * TICK_RATE)
			u.cargo_type = "aether" if is_gas else "crystal"
			var source: Dictionary = resources.get(source_tag, {})
			u.cargo_amount = deposit_yield(source) if not source.is_empty() else (4 if is_gas else 5)
			if u.unit_type == "prospector":
				u.cargo_amount = LadderRules.PROSPECTOR_LADDER_YIELD if ladder_rules else u.cargo_amount * 2
			if resources.has(source_tag) and not unlimited_resources:
				u.cargo_amount = mini(u.cargo_amount, int(source.amount))
				source.amount -= u.cargo_amount
				if source.amount == 0:
					if not deposit_present(source):
						nav_dirty = true
					resource_depleted.emit(u.owner, source.resource_type)
	else:
		_release_mining_slot(u)
		var reach: float = u.radius + target_entity.radius + HARVEST_REACH
		_prepare_path(u, target_entity.pos, 3.0, reach)
		if not is_gas and u.orders.size() == 1 and tick % TICK_RATE == u.tag % TICK_RATE:
			# Retry a partial route once per topology revision, spread over a
			# second so a closed gate cannot replan an entire line in one tick.
			if order.get("_blocked_crystal_revision", -1) != _navigation_revision and u.path.back().distance_squared_to(target_entity.pos) > reach * reach:
				order["_blocked_crystal_revision"] = _navigation_revision
				if _reassign_crystal_worker(u, order, target_entity, CrystalSelection.REACHABLE_PATCH):
					return
		_follow_path(u, dt)

func _reassign_crystal_worker(worker: Dictionary, order: Dictionary, current: Dictionary, mode: CrystalSelection) -> bool:
	var patch := _pick_local_crystal(worker, current, mode)
	if patch.tag == current.tag:
		return false
	order.target_tag = patch.tag
	worker.harvest_target_tag = patch.tag
	worker.path.clear()
	return true

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
				s_unit["builder_tag"] = u.tag
				s_unit["construction_cost"] = Vector2i(m_cost, v_cost)
				# Alien Motes summon in structures automatically and are immediately free!
				if u["unit_type"] == "mote":
					s_unit["auto_summon"] = true
					u["orders"].pop_front()
				elif u.unit_type == "forager":
					s_unit["auto_summon"] = true
					s_unit["morph_worker"] = {"id": u.id, "hp": u.hp, "cargo_type": u.cargo_type, "cargo_amount": u.cargo_amount}
					_release_mining_slot(u)
					_confirm_waiting_attack_loss(u)
					units.erase(u.tag)
					_recompute_supplies()
			else:
				emit_signal("notice", u["owner"], "Not enough %s to build." % ("crystal" if p["crystal"] < m_cost else "aether"), "error")
				u["orders"].pop_front()
		else:
			_approach_target(u, build_pos, dt)
	else:
		var s_unit: Dictionary = units.get(struct_tag, {})
		if not can_resume_construction(u, s_unit):
			u["orders"].pop_front()
			u.path.clear()
			return
		s_unit["builder_tag"] = u.tag
		var dist = _edge_distance(u, s_unit)
		if dist <= 1.8:
			u["vel"] = Vector2.ZERO
			u["facing"] = (s_unit["pos"] - u["pos"]).angle()
			if _advance_construction(s_unit, dt):
				players[u["owner"]]["structures_built"] += 1
				if ladder_rules and _qualifies_for_elimination(s_unit):
					_ladder_last_progress_tick = tick
				_recompute_supplies()
				emit_signal("notice", u["owner"], "%s complete." % s_unit["name"], "info")
				emit_signal("structure_construction_finished", s_unit)
				u["orders"].pop_front()
				if s_unit.is_extractor and u.orders.is_empty() and not worker_rally_resource(u.owner, s_unit.tag).is_empty():
					issue_command([u.tag], "harvest", s_unit.pos, s_unit.tag)
		else:
			_approach_target(u, s_unit["pos"], dt)

func _advance_construction(site: Dictionary, dt: float) -> bool:
	var rate := dt / maxf(1.0, float(site.build_total_time))
	site.hp = minf(site.max_hp, site.hp + site.max_hp * rate)
	site.build_progress = minf(1.0, site.build_progress + rate)
	if site.build_progress >= 1.0 - 0.0000001:
		site.build_progress = 1.0
		return true
	return false

func can_resume_construction(worker: Dictionary, site: Dictionary) -> bool:
	if site.is_empty() or not site.is_structure or site.owner != worker.owner or site.faction != worker.faction:
		return false
	if not worker.is_worker or worker.unit_type == "prospector" or worker.is_immobile or site.build_progress >= 1.0 or site.get("auto_summon", false):
		return false
	var builder := construction_builder(site)
	return builder.is_empty() or builder.tag == worker.tag

func construction_builder(site: Dictionary) -> Dictionary:
	var builder: Dictionary = units.get(site.get("builder_tag", 0), {})
	if builder.is_empty() or builder.orders.is_empty() or site.build_progress >= 1.0 or site.get("auto_summon", false):
		return {}
	var order: Dictionary = builder.orders[0]
	return builder if order.type == "build" and int(order.get("structure_tag", 0)) == site.tag else {}

func _cancel_construction(site: Dictionary) -> bool:
	if not units.has(site.tag) or not site.is_structure or site.build_progress >= 1.0 or (ladder_rules and site.unit_type == "brood_growth_node"):
		return false
	var costs: Vector2i = site.get("construction_cost", Vector2i.ZERO)
	_refund_structure(site, costs)
	if site.has("morph_worker"):
		var worker = spawn_unit("forager", site.owner, site.pos, site.morph_worker.id)
		for key in ["hp", "cargo_type", "cargo_amount"]:
			worker[key] = site.morph_worker[key]
	emit_signal("notice", site.owner, "%s construction cancelled." % site.name, "info")
	return true

func _refund_structure(site: Dictionary, costs: Vector2i) -> void:
	var player: Dictionary = players[site.owner]
	player.crystal += floori(costs.x * CONSTRUCTION_REFUND)
	player.aether += floori(costs.y * CONSTRUCTION_REFUND)
	_unlink_attachment(site)
	_lose_brood_tunnel_cargo_if_last(site)
	_confirm_waiting_attack_loss(site)
	units.erase(site.tag)
	nav_dirty = true
	_recompute_supplies()

func _is_finished_silo(unit: Dictionary, owner_id: int) -> bool:
	return not unit.is_empty() and unit.owner == owner_id and unit.unit_type in ["silo", "silo_retracted"] and unit.build_progress >= 1.0

func can_use_hub_power(unit: Dictionary) -> bool:
	return unit.unit_type == "colony_hub" and unit.build_progress >= 1.0 and unit.energy >= HUB_POWER_COST \
		and (not ladder_rules or (unit.get("hub_operations", false) and unit.flight_height <= 0.0 and not unit.has("flight_transition")))

func hub_upgrade_offer(ability: String) -> Dictionary:
	if ability == "fortify_hub":
		return LadderRules.FORTIFICATION_OFFER if ladder_rules else {}
	return LadderRules.OPERATIONS_OFFER if ladder_rules else HUB_OPERATIONS_OFFER

func hub_upgrade_block_reason(hub: Dictionary, ability: String = "upgrade_hub") -> String:
	if hub.unit_type != "colony_hub" or hub.build_progress < 1.0:
		return "Requires a completed Colony Hub."
	if ladder_rules and (hub.flight_height > 0.0 or hub.has("flight_transition")):
		return "The Colony Hub must be grounded."
	var offer := hub_upgrade_offer(ability)
	if offer.is_empty():
		return "This conversion requires ladder rules."
	if hub.get("hub_operations", false):
		return "Operations already upgraded."
	if hub.production_queue.any(func(item): return item.get("upgrade") in ["hub_operations", "fortify_hub"]):
		return "Upgrade already queued."
	for requirement in offer.requires:
		if not has_tech_structure(hub.owner, requirement):
			return "Requires %s." % RTSData.get_unit_def(requirement).name
	if hub.production_queue.size() >= PRODUCTION_QUEUE_CAPACITY:
		return "Colony Hub queue is full."
	var player: Dictionary = players[hub.owner]
	if player.crystal < offer.crystal:
		return "Not enough crystal."
	if player.aether < offer.aether:
		return "Not enough aether."
	return ""

func _enqueue_hub_upgrade(hub: Dictionary, ability: String) -> bool:
	if not hub_upgrade_block_reason(hub, ability).is_empty():
		return false
	var offer := hub_upgrade_offer(ability)
	var player: Dictionary = players[hub.owner]
	player.crystal -= offer.crystal
	player.aether -= offer.aether
	var upgrade := "fortify_hub" if ability == "fortify_hub" else "hub_operations"
	hub.production_queue.append({"upgrade": upgrade, "level": 1, "crystal_cost": offer.crystal,
		"aether_cost": offer.aether, "progress": 0.0, "total_time": offer.time})
	return true

func can_use_production_boost(unit: Dictionary) -> bool:
	return unit.unit_type == "heartstone" and unit.build_progress >= 1.0 and unit.energy >= PRODUCTION_BOOST_COST

func production_boost_ticks(unit: Dictionary) -> int:
	return maxi(0, int(unit.get("production_boost_until", 0)) - tick)

func production_boost_target_reason(owner: int, producer: Dictionary) -> String:
	if producer.is_empty() or producer.owner != owner or not producer.is_structure or producer.build_progress < 1.0:
		return "Select a completed friendly producer."
	if RTSData.get_unit_def(producer.unit_type).get("trains", []).is_empty() and not (ladder_rules and producer.unit_type in ["concord_core", "transit_waystone", "twilight_array", "prism_forge", "robotics_annex", "canticle_archive", "veil_sanctum"]):
		return "Select a completed friendly producer."
	if not (ladder_rules and producer.unit_type == "heartstone") and not is_powered(owner, producer.pos):
		return "The producer needs a friendly power field."
	if production_boost_ticks(producer) > 0:
		return "Production boost is already active."
	return ""

func _cast_production_boost(source: Dictionary, producer: Dictionary) -> bool:
	if not can_use_production_boost(source) or not production_boost_target_reason(source.owner, producer).is_empty():
		return false
	source.energy -= PRODUCTION_BOOST_COST
	producer["production_boost_until"] = tick + (LadderRules.CONCORD_BOOST_SECONDS * TICK_RATE if ladder_rules else PRODUCTION_BOOST_TICKS)
	return true

func energy_recharge_ticks(owner: int) -> int:
	return maxi(0, int(players.get(owner, {}).get("energy_recharge_ready", 0)) - tick)

func energy_recharge_radius() -> float:
	return LadderRules.ENERGY_RECHARGE_RANGE

func energy_recharge_block_reason(source: Dictionary) -> String:
	if not ladder_rules or source.unit_type != "heartstone" or source.build_progress < 1.0 or source.hp <= 0.0:
		return "Select a completed ladder Heartstone."
	if energy_recharge_ticks(source.owner) > 0:
		return "Energy Recharge ready in %.1fs." % (energy_recharge_ticks(source.owner) * TICK_DT)
	return "Requires 50 Heartstone energy." if source.energy < LadderRules.ENERGY_RECHARGE_COST else ""

func energy_recharge_target_reason(owner: int, target: Dictionary) -> String:
	if target.is_empty() or target.owner != owner or target.build_progress < 1.0 or target.hp <= 0.0 \
			or RTSData.get_unit_def(target.unit_type).get("faction", "") != RTSData.FACTION_ALIENS or _unit_energy_capacity(target) <= 0.0:
		return "Select a completed friendly Concord unit or structure with energy."
	if target.energy >= _unit_energy_capacity(target):
		return "This target already has full energy."
	return "" if _near_friendly_heartstone(owner, target.pos) else "Target must be near a completed friendly Heartstone."

func _near_friendly_heartstone(owner: int, point: Vector2) -> bool:
	for heartstone in units.values():
		if heartstone.owner == owner and heartstone.unit_type == "heartstone" and heartstone.build_progress >= 1.0 and heartstone.hp > 0.0 \
				and point.distance_squared_to(heartstone.pos) <= energy_recharge_radius() ** 2:
			return true
	return false

func _unit_energy_capacity(unit: Dictionary) -> float:
	return float(unit.get("energy_profile", {}).get("max", unit.get("support", {}).get("max_energy", 0.0)))

func _cast_energy_recharge(source: Dictionary, target: Dictionary) -> bool:
	if not energy_recharge_block_reason(source).is_empty() or not energy_recharge_target_reason(source.owner, target).is_empty():
		return false
	if source.tag == target.tag:
		return false
	source.energy -= LadderRules.ENERGY_RECHARGE_COST
	target.energy = minf(_unit_energy_capacity(target), target.energy + LadderRules.ENERGY_RECHARGE_AMOUNT)
	players[source.owner]["energy_recharge_ready"] = tick + LadderRules.ENERGY_RECHARGE_SECONDS * TICK_RATE
	ability_triggered.emit(target, "energy_recharge", target.pos)
	return true

func defensive_recall_block_reason(source: Dictionary) -> String:
	if source.unit_type != "heartstone" or source.build_progress < 1.0 or source.hp <= 0.0:
		return "Select a completed Heartstone."
	if _defensive_recalls.has(source.owner):
		return "A defensive recall is already in progress."
	var remaining := defensive_recall_cooldown_ticks(source.owner)
	if remaining > 0:
		return "Defensive Recall ready in %.1fs." % (remaining * TICK_DT)
	return "Requires 50 Heartstone energy." if source.energy < DEFENSIVE_RECALL_COST else ""

func defensive_recall_cooldown_ticks(owner: int) -> int:
	return maxi(0, int(players.get(owner, {}).get("defensive_recall_ready", 0)) - tick)

func defensive_recall_radius() -> float:
	return LadderRules.RECALL_RADIUS if ladder_rules else DEFENSIVE_RECALL_RADIUS

func defensive_recall_markers_for(owner: int) -> Array[Dictionary]:
	var markers: Array[Dictionary] = []
	for recall in _defensive_recalls.values():
		if owner != 0 and int(recall.owner) != owner:
			continue
		var position: Vector2 = recall.pos
		var remaining := maxi(0, int(recall.finish_tick) - tick)
		markers.append({"x": position.x, "y": position.y, "radius": recall.radius, "ticks": remaining})
	return markers

func _can_remain_in_recall(unit: Dictionary, owner: int, position: Vector2, radius: float) -> bool:
	return not unit.is_empty() and unit.owner == owner and not unit.is_structure and (not unit.is_immobile or unit.has("recall_channel")) \
		and unit.hp > 0.0 and unit.build_progress >= 1.0 \
		and position.distance_squared_to(unit.pos) <= radius * radius

func _cast_defensive_recall(source: Dictionary, position: Vector2, flagship := false) -> bool:
	if not flagship and not defensive_recall_block_reason(source).is_empty():
		return false
	if not position.is_finite() or not Rect2(0.0, 0.0, map_width, map_height).has_point(position) or not can_see_position(source.owner, position):
		return false
	var tags: Array[int] = []
	var radius := LadderRules.FLAGSHIP_RECALL_RADIUS if flagship else defensive_recall_radius()
	for unit in units.values():
		if (unit.tag != source.tag and not unit.has("recall_channel") and unit.unit_type != "pursuit_fighter"
				and _can_remain_in_recall(unit, source.owner, position, radius)):
			tags.append(unit.tag)
	if tags.is_empty():
		return false
	if not flagship:
		source.energy -= DEFENSIVE_RECALL_COST
	var duration := DEFENSIVE_RECALL_TICKS
	if ladder_rules:
		duration = (LadderRules.FLAGSHIP_RECALL_SECONDS if flagship else LadderRules.RECALL_CHANNEL_SECONDS) * TICK_RATE
		if not flagship:
			players[source.owner]["defensive_recall_ready"] = tick + LadderRules.RECALL_COOLDOWN_SECONDS * TICK_RATE
		for tag in tags:
			var unit: Dictionary = units[tag]
			unit["recall_channel"] = true
			unit.is_immobile = true
			unit.vel = Vector2.ZERO
			unit.attack_state = "idle"
	var key: int = source.tag if flagship else source.owner
	_defensive_recalls[key] = {"source_tag": source.tag, "owner": source.owner, "pos": position,
		"radius": radius, "finish_tick": tick + duration, "tags": tags}
	return true

func _release_recall_channel(unit: Dictionary) -> void:
	if unit.erase("recall_channel"):
		unit.is_immobile = false

func _update_defensive_recalls() -> void:
	for key in _defensive_recalls.keys():
		var recall: Dictionary = _defensive_recalls[key]
		var owner: int = recall.owner
		var source: Dictionary = units.get(recall.source_tag, {})
		if source.is_empty():
			for tag in recall.tags:
				_release_recall_channel(units.get(tag, {}))
			_defensive_recalls.erase(key)
			notice.emit(owner, "Recall cancelled. Its source was destroyed.", "warn")
			continue
		recall.tags = recall.tags.filter(func(tag):
			var unit: Dictionary = units.get(tag, {})
			var eligible := _can_remain_in_recall(unit, owner, recall.pos, recall.radius)
			if not eligible:
				_release_recall_channel(unit)
			return eligible)
		if tick < int(recall.finish_tick):
			continue
		_defensive_recalls.erase(key)
		var recalled := _finish_defensive_recall(source, recall.pos, recall.tags)
		var message := "Recalled one unit." if recalled == 1 else "Recalled %d units." % recalled
		if recall.tags.is_empty():
			message = "No units stayed inside the recall circle."
		elif recalled == 0:
			message = "Recall ended without a unit finding a clear exit."
		elif recalled < recall.tags.size():
			message += " Some exits were blocked."
		notice.emit(owner, message, "info")

func _finish_defensive_recall(source: Dictionary, position: Vector2, tags: Array) -> int:
	if tags.is_empty():
		return 0
	if nav_dirty:
		_rebuild_astar_grid()
		nav_dirty = false
	# Use positions after steering, and reserve each landing for this recall.
	_rebuild_spatial_grid()
	var arrivals: Array[Dictionary] = []
	for tag in tags:
		var unit: Dictionary = units[tag]
		_release_recall_channel(unit)
		var landing := _rally_spawn_position(source, position, unit.unit_type, arrivals)
		if not landing.is_finite():
			continue
		var origin: Vector2 = unit.pos
		_release_mining_slot(unit)
		unit.orders.clear()
		unit.path.clear()
		unit.erase("choke_yield")
		unit["vel"] = Vector2.ZERO
		unit["attack_state"] = "idle"
		unit["attack_target_tag"] = 0
		unit["pos"] = landing
		unit["prev_pos"] = landing
		unit["home_pos"] = landing
		unit["has_home_pos"] = true
		if ladder_rules:
			unit["recall_protection_until"] = tick + ceili(LadderRules.RECALL_ARRIVAL_PROTECTION_SECONDS * TICK_RATE)
		arrivals.append(unit)
		unit_phased.emit(origin, landing, tag)
	if not arrivals.is_empty():
		_rebuild_spatial_grid()
	return arrivals.size()

func _use_hub_power(hub: Dictionary, command: String, position: Vector2, target_tag: int) -> bool:
	if not can_use_hub_power(hub):
		return false
	if command == "recon_sweep":
		if vision == null or not position.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(position):
			return false
		var radius := LadderRules.LADDER_SWEEP_RADIUS if ladder_rules else SWEEP_RADIUS
		var duration := ceili(LadderRules.LADDER_SWEEP_SECONDS * TICK_RATE) if ladder_rules else SWEEP_TICKS
		vision.add_sweep(hub.owner, position, radius, tick + duration)
		_refresh_vision()
	elif command == "deploy_prospector":
		var deposit: Dictionary = resources.get(target_tag, {})
		if not hub.get("hub_operations", false):
			return false
		var radius: float = RTSData.get_unit_def("prospector").radius
		var landing := Vector2.INF
		if deposit.get("resource_type") == "crystal_field" and deposit_present(deposit) and can_see_position(hub.owner, deposit.pos):
			var dropoff: Vector2 = hub.pos
			if ladder_rules:
				for base in units.values():
					if is_dropoff(base, hub.owner) and base.pos.distance_squared_to(deposit.pos) < dropoff.distance_squared_to(deposit.pos):
						dropoff = base.pos
			landing = _interaction_destination(dropoff, deposit.pos, Vector2.INF, radius, radius + deposit.radius + HARVEST_REACH, false)
		elif ladder_rules and target_tag == 0 and position.is_finite() and Rect2(0, 0, map_width, map_height).has_point(position) \
				and can_see_position(hub.owner, position) and not _is_point_blocked_by_static(position, radius):
			landing = position
		if not landing.is_finite():
			return false
		var helper := spawn_unit("prospector", hub.owner, landing)
		helper["expires_tick"] = tick + (LadderRules.PROSPECTOR_LADDER_SECONDS * TICK_RATE if ladder_rules else PROSPECTOR_LIFETIME_TICKS)
		if not deposit.is_empty():
			issue_command([helper.tag], "harvest", deposit.pos, deposit.tag)
		ability_triggered.emit(helper, command, landing)
		unit_production_finished.emit(helper, hub)
	else:
		var silo: Dictionary = units.get(target_tag, {})
		if not _is_finished_silo(silo, hub.owner) or silo.get("supply_reinforced", false):
			return false
		silo["supply_reinforced"] = true
		if ladder_rules:
			silo.max_hp = 500.0
			silo.hp = 500.0
		_recompute_supplies()
		emit_signal("notice", hub.owner, "Provision Silo reinforced.", "info")
	hub.energy -= HUB_POWER_COST
	return true

func _toggle_salvage(structure: Dictionary) -> bool:
	var allowed: bool = structure.unit_type in ["field_bunker", "radar_beacon"] and structure.build_progress >= 1.0 if ladder_rules else _is_finished_silo(structure, structure.owner)
	if not allowed:
		return false
	if structure.get("salvage_finish", 0) > 0:
		structure.erase("salvage_finish")
		emit_signal("notice", structure.owner, "Salvage cancelled.", "info")
	else:
		structure["salvage_finish"] = tick + salvage_duration_ticks()
		emit_signal("notice", structure.owner, "Salvaging %s." % structure.name, "info")
	return true

func salvage_duration_ticks() -> int:
	return ceili(5.0 / 1.4 * TICK_RATE) if ladder_rules else SALVAGE_TICKS

func supply_from(unit: Dictionary) -> int:
	return int(RTSData.get_unit_def(unit.unit_type).get("supply_provided", 0)) + (REINFORCED_SUPPLY if unit.get("supply_reinforced", false) else 0)

func can_repair(worker: Dictionary, target: Dictionary) -> bool:
	var valid_worker: bool = worker.unit_type == "pioneer" or (ladder_rules and worker.unit_type == "prospector")
	return valid_worker and not target.is_empty() and target.owner == worker.owner and target.tag != worker.tag and target.build_progress >= 1.0 and target.hp < target.max_hp and target.attributes.has("Mechanical")

func _begin_auto_repair(worker: Dictionary) -> bool:
	if players[worker.owner].crystal <= 0:
		return false
	var best: Dictionary = {}
	var best_distance := AUTO_REPAIR_RADIUS
	for target in query_units_in_radius(worker.pos, AUTO_REPAIR_RADIUS + worker.radius):
		if not can_repair(worker, target):
			continue
		var distance := _edge_distance(worker, target)
		if distance <= best_distance:
			best = target
			best_distance = distance
	if best.is_empty():
		return false
	worker.orders.append({"type": "repair", "target_tag": best.tag, "automatic": true})
	return true

func _process_repair_order(worker: Dictionary, order: Dictionary, dt: float) -> void:
	var target: Dictionary = units.get(order.target_tag, {})
	var player: Dictionary = players[worker.owner]
	if not can_repair(worker, target) or (order.get("automatic", false) and (_edge_distance(worker, target) > AUTO_REPAIR_RADIUS or (player.crystal <= 0 and target.get("repair_credit", 0.0) <= 0.0))):
		worker.orders.pop_front()
		worker.path.clear()
		return
	if _edge_distance(worker, target) > 1.1:
		_follow_order_path(worker, target.pos, dt, target.radius + worker.radius + 1.1)
		return
	worker.facing = (target.pos - worker.pos).angle()
	if ladder_rules:
		_repair_ladder_target(target, player, dt)
		return
	var replacement_cost: float = RTSData.get_unit_def(target.unit_type).get("crystal_cost", 0)
	var price_per_hp: float = replacement_cost * 0.25 / target.max_hp
	var hp := minf(REPAIR_HP_PER_SECOND * dt, target.max_hp - target.hp)
	if price_per_hp > 0.0:
		var credit: float = target.get("repair_credit", 0.0)
		hp = minf(hp, (player.crystal + credit) / price_per_hp)
		var price := hp * price_per_hp
		var charge := clampi(ceili(price - credit - 0.000001), 0, player.crystal)
		player.crystal -= charge
		target["repair_credit"] = maxf(0.0, credit + charge - price)
	target.hp += hp

func _repair_ladder_target(target: Dictionary, player: Dictionary, dt: float) -> void:
	var definition := RTSData.get_unit_def(target.unit_type)
	var duration := maxf(1.0, float(definition.get("build_time", target.build_total_time)))
	var hp := minf(float(target.max_hp) / duration * dt, target.max_hp - target.hp)
	var prices := {
		"crystal": float(definition.get("crystal_cost", 0)) * 0.25 / target.max_hp,
		"aether": float(definition.get("aether_cost", 0)) * 0.25 / target.max_hp,
	}
	for resource in prices:
		var price_per_hp: float = prices[resource]
		if price_per_hp > 0.0:
			var credit: float = target.get("repair_credit_" + resource, 0.0)
			hp = minf(hp, (float(player[resource]) + credit) / price_per_hp)
	for resource in prices:
		var price_per_hp: float = prices[resource]
		if price_per_hp <= 0.0:
			continue
		var key: String = "repair_credit_" + resource
		var credit: float = target.get(key, 0.0)
		var payment: int = clampi(ceili(hp * price_per_hp - credit - 0.000001), 0, int(player[resource]))
		player[resource] -= payment
		target[key] = maxf(0.0, credit + payment - hp * price_per_hp)
	target.hp += hp

func can_restore(source: Dictionary, target: Dictionary) -> bool:
	if not source.has("support") or target.is_empty() or target.tag == source.tag:
		return false
	if target.owner != source.owner or target.hp <= 0.0 or target.build_progress < 1.0 or int(target.get("stasis_until", 0)) > tick:
		return false
	if source.support.stat == "hp":
		var reachable: bool = target.flight_height <= 0.0 or (source.unit_type == "rampart_transport" and target.has("gravity_lifted_by"))
		return not target.is_structure and reachable and target.attributes.has("Biological") and target.hp < target.max_hp
	if source.unit_type == "aegis_capacitor" and target.is_structure and target.unit_type != "aegis_relay":
		return false
	return target.shields < target.max_shields

func _step_support(source: Dictionary, dt: float) -> bool:
	var config: Dictionary = source.support
	var previous: int = source.support_target_tag
	source.support_target_tag = 0
	if source.build_progress < 1.0 or (source.is_structure and not is_powered(source.owner, source.pos)):
		return false
	var regen := float(config.regen)
	if source.unit_type == "rampart_transport" and players[source.owner].upgrades.get("rampart_reactor", 0):
		regen *= 2.0
	source.energy = minf(config.max_energy, source.energy + regen * dt)
	if systems_jammed(source):
		return false
	var order: Dictionary = source.orders.front() if not source.orders.is_empty() else {}
	var triage: bool = source.unit_type == "triage_specialist"
	var auto_heal: bool = config.stat == "hp" and source.get("auto_heal", false)
	var advancing: bool = auto_heal and order.get("type") == "attack_move"
	var target: Dictionary = {}
	if order.get("type") in ["restore_vitals", "restore_aegis"]:
		target = units.get(order.target_tag, {})
		if not can_restore(source, target):
			source.orders.pop_front()
			source.path.clear()
			return false
		source.vel = Vector2.ZERO
		if _edge_distance(source, target) > float(config.range):
			if source.is_structure:
				source.orders.pop_front()
				return false
			_follow_order_path(source, target.pos, dt, source.radius + target.radius + float(config.range))
			return true
		source.path.clear()
	elif advancing or order.is_empty() or (order.type == "hold_position" and source.orders.size() == 1):
		if auto_heal or (config.stat == "shields" and source.get("auto_aegis", true)):
			target = _automatic_support_target(source, previous, float(config.range), triage)
	if target.is_empty():
		return false
	var stat: String = config.stat
	var healing_multiplier: float = source.get("campaign_healing_multiplier", 1.0)
	var energy_yield := float(config.get("hp_per_energy", config.get("shield_per_energy", 1.0)))
	var amount := minf(minf(float(config.rate) * dt, source.energy * energy_yield) * healing_multiplier, float(target["max_" + stat]) - float(target[stat]))
	if amount <= 0.0:
		return false
	target[stat] += amount
	source.energy -= amount / (healing_multiplier * energy_yield)
	source.support_target_tag = target.tag
	if not advancing:
		source.vel = Vector2.ZERO
		if not source.is_structure:
			source.facing = (target.pos - source.pos).angle()
	if previous != target.tag and tick >= source.next_support_cue:
		source.next_support_cue = tick + 64
		ability_triggered.emit(source, config.ability, target.pos)
	return not advancing

func _automatic_support_target(source: Dictionary, previous: int, reach: float, prioritize_value: bool) -> Dictionary:
	var target: Dictionary = units.get(previous, {})
	if not can_restore(source, target) or _edge_distance(source, target) > reach:
		target = {}
	if tick % 8 != int(source.tag) % 8 or (not prioritize_value and not target.is_empty()):
		return target
	var best_value := -1
	var nearest := reach
	if not target.is_empty():
		var current := RTSData.get_unit_def(target.unit_type)
		best_value = int(current.get("crystal_cost", 0)) + int(current.get("aether_cost", 0))
		nearest = _edge_distance(source, target)
	for candidate in query_units_in_radius(source.pos, reach + float(source.radius)):
		if not can_restore(source, candidate):
			continue
		var distance := _edge_distance(source, candidate)
		if distance > reach:
			continue
		var value := 0
		if prioritize_value:
			var definition := RTSData.get_unit_def(candidate.unit_type)
			value = int(definition.get("crystal_cost", 0)) + int(definition.get("aether_cost", 0))
		if value > best_value or (value == best_value and distance <= nearest and target.get("tag") != previous):
			target = candidate
			best_value = value
			nearest = distance
	return target

func _approach_target(u: Dictionary, target_pos: Vector2, dt: float) -> void:
	_prepare_path(u, target_pos, 1.0)
	_follow_path(u, dt)

func _follow_order_path(u: Dictionary, target_pos: Vector2, dt: float, reach: float = INF) -> void:
	_prepare_path(u, target_pos, 3.0, reach)
	_follow_path(u, dt)

func _prepare_order_path(u: Dictionary, order: Dictionary) -> Vector2:
	var goal: Vector2 = order.get("target_pos", u.pos)
	if u.path.is_empty() and order.has("_formation") and not order.has("arrival_pos"):
		# A clear path through a slot to the requested anchor needs no second
		# full-distance scan. Obstructed approaches use the regular pathfinder.
		var anchor := _map_clamped_position(goal, u.radius)
		var flying: bool = u.flight_height > 0.0
		var cliff_walk: bool = u.get("cliff_walk", false)
		if flying or not _is_point_blocked_by_static(anchor, u.radius, cliff_walk):
			var slot := _find_group_arrival(u, order["_formation"], anchor)
			if slot.is_finite() and (flying or _has_clear_line_of_walk(u.pos, slot, u.radius, cliff_walk)):
				_reserve_group_arrival(u, order, anchor, slot)
				u.path = [slot]
				u["nav_goal"] = goal
				_update_path_reach(u, order, goal, anchor)
				return slot
	if _prepare_path(u, goal, 0.05):
		var endpoint: Vector2 = u.path.back()
		if order.has("_formation"):
			_apply_group_arrival(u, order)
		_update_path_reach(u, order, goal, endpoint)
	return u.path.back()

func _update_path_reach(u: Dictionary, order: Dictionary, requested: Vector2, endpoint: Vector2) -> void:
	if u.flight_height > 0.0:
		return
	var revised: bool = order.get("navigation_revision", -1) != _navigation_revision
	var show_feedback := not order_path_resolved.get_connections().is_empty()
	var shortened := requested.is_finite() and endpoint.distance_squared_to(requested) > 1.0
	var status := ""
	if revised or (show_feedback and shortened):
		var projected: Vector2 = _project_destination(u.pos, requested, u.radius, u.get("cliff_walk", false)) if requested.is_finite() else u.pos
		var reaches_goal := endpoint.distance_squared_to(projected) <= 1.0
		if revised:
			# A raised gate or new foundation can cover the click itself.
			# A newly projected edge does not complete a formerly exact leg.
			var displaced: bool = shortened and order.get("_reachable_request", Vector2.INF) == requested
			var reaches_active_leg := reaches_goal and not displaced
			order["waiting_for_route"] = order.get("route_was_reachable", false) and not reaches_active_leg
			order["route_was_reachable"] = order.get("route_was_reachable", false) or reaches_active_leg
			order["navigation_revision"] = _navigation_revision
		if show_feedback and shortened:
			status = "waiting" if order.get("waiting_for_route", false) else ("adjusted" if reaches_goal else "partial")
	if requested.is_finite() and not shortened:
		order["_reachable_request"] = requested
	if show_feedback:
		# Test reach against the unformed endpoint, then mark the actual slot.
		order_path_resolved.emit(u, order, requested, u.path.back(), status)

func _can_finish_path_order(u: Dictionary, order: Dictionary) -> bool:
	return u.flight_height > 0.0 or (not nav_dirty and not order.get("waiting_for_route", false))

func _prepare_path(u: Dictionary, target_pos: Vector2, tolerance: float, reach: float = INF) -> bool:
	if u.path.is_empty() or u.get("nav_goal", Vector2.INF).distance_squared_to(target_pos) > tolerance * tolerance:
		if u.flight_height > 0.0:
			u.path = [_map_clamped_position(target_pos, u.radius) if target_pos.is_finite() else u.pos]
		elif _can_crush_phase_barriers(u) and target_pos.is_finite() \
				and _has_clear_line_of_walk(u.pos, target_pos, u.radius, u.get("cliff_walk", false), true):
			u.path = [target_pos]
		else:
			u.path = compute_smooth_path(u.pos, target_pos, u.radius, u.get("cliff_walk", false), reach)
		u["nav_goal"] = target_pos
		return true
	return false

func _apply_group_arrival(u: Dictionary, order: Dictionary) -> void:
	# Allocate at the start of each leg, from the reachable endpoint of its
	# current path. Each queued click owns its own set of reservations.
	var formation: MoveFormation = order["_formation"]
	var anchor: Vector2 = u.path.back()
	var slot: Vector2 = order.get("arrival_pos", Vector2.INF)
	var flying: bool = u.flight_height > 0.0
	var cliff_walk: bool = u.get("cliff_walk", false)
	if not slot.is_finite() or not anchor.is_equal_approx(order.get("_formation_anchor", Vector2.INF)) or (not flying and not _has_clear_line_of_walk(anchor, slot, u.radius, cliff_walk)):
		if slot.is_finite() and int(formation.slots.get(slot, {}).get("tag", 0)) == int(u.tag):
			formation.slots.erase(slot)
			formation.bins[Vector2i((slot / formation.spacing).floor())].erase(slot)
			formation.first_open_ring.clear()
		slot = _find_group_arrival(u, formation, anchor)
		if slot.is_finite():
			_reserve_group_arrival(u, order, anchor, slot)
		else:
			slot = anchor
			order["_formation_anchor"] = anchor
			order["arrival_pos"] = slot
	if slot.is_equal_approx(anchor):
		return
	var approach: Vector2 = u.pos if u.path.size() == 1 else u.path[-2]
	if flying or _has_clear_line_of_walk(approach, slot, u.radius, cliff_walk):
		u.path[-1] = slot
	else:
		u.path.append(slot)

func _reserve_group_arrival(u: Dictionary, order: Dictionary, anchor: Vector2, slot: Vector2) -> void:
	var formation: MoveFormation = order["_formation"]
	formation.slots[slot] = {"tag": u.tag, "radius": u.radius}
	var cell := Vector2i((slot / formation.spacing).floor())
	var bin: Array = formation.bins.get(cell, [])
	bin.append(slot)
	formation.bins[cell] = bin
	order["_formation_anchor"] = anchor
	order["arrival_pos"] = slot

func _find_group_arrival(u: Dictionary, formation: MoveFormation, anchor: Vector2) -> Vector2:
	var flying: bool = u.flight_height > 0.0
	var cliff_walk: bool = u.get("cliff_walk", false)
	var anchor_key := Vector3(anchor.x, anchor.y, u.radius)
	var start_ring: int = formation.first_open_ring.get(anchor_key, 0)
	for ring in range(start_ring, formation.rings.size()):
		var best := Vector2.INF
		var best_score := INF
		var all_reserved := true
		for offset in formation.rings[ring]:
			var point := _map_clamped_position(anchor + offset, u.radius)
			if formation.slots.has(point):
				continue
			all_reserved = false
			var score: float = point.distance_to(anchor) + 0.25 * point.distance_to(u.pos)
			if score >= best_score or _group_arrival_overlaps(point, u.radius, formation):
				continue
			if not flying and not _has_clear_line_of_walk(anchor, point, u.radius, cliff_walk):
				continue
			best = point
			best_score = score
		if best.is_finite():
			return best
		if all_reserved and ring == int(formation.first_open_ring.get(anchor_key, 0)):
			formation.first_open_ring[anchor_key] = ring + 1
	return Vector2.INF

func _group_arrival_overlaps(point: Vector2, radius: float, formation: MoveFormation) -> bool:
	var cell := Vector2i((point / formation.spacing).floor())
	for y in range(-1, 2):
		for x in range(-1, 2):
			for slot: Vector2 in formation.bins.get(cell + Vector2i(x, y), []):
				var clearance: float = radius + float(formation.slots[slot].radius) + 1.5
				if point.distance_squared_to(slot) < clearance * clearance:
					return true
	return false

func _follow_path(u: Dictionary, dt: float) -> void:
	var path: Array = u.path
	var waypoint: Vector2 = path.front()
	if path.size() > 1 and u.pos.distance_to(waypoint) <= maxf(1.1, u.radius * 1.2):
		if _has_clear_line_of_walk(u.pos, path[1], u.radius, u.get("cliff_walk", false)):
			path.pop_front()
			waypoint = path.front()
	_move_toward_point(u, waypoint, dt)

func _move_toward_point(u: Dictionary, wp: Vector2, dt: float) -> void:
	if u["is_immobile"]:
		u["vel"] = Vector2.ZERO
		return
	var dir = (wp - u["pos"])
	if dir.length_squared() < 0.001:
		u["vel"] = Vector2.ZERO
		return
	dir = dir.normalized()
	var speed := effective_move_speed(u)
	var heading: float = dir.angle()
	var profile: Vector3 = LadderRules.MOVEMENT_PROFILES.get(u.unit_type, Vector3.ZERO) if ladder_rules else Vector3.ZERO
	if profile == Vector3.ZERO:
		u.vel = dir * speed
		u.facing = heading
		return
	var last_move_tick: int = u.get("motion_tick", -2)
	var previous_speed: float = u.get("motion_speed", 0.0) if last_move_tick >= tick - 1 else 0.0
	var turn_rate := profile.y if previous_speed > 0.05 else profile.z
	u.facing = rotate_toward(u.facing, heading, deg_to_rad(turn_rate * 1.4 * dt))
	if u.unit_type in LadderRules.TURN_BEFORE_MOVING and absf(angle_difference(u.facing, heading)) > deg_to_rad(11.25):
		u.vel = Vector2.ZERO
		u.erase("motion_speed")
		return
	var acceleration := profile.x * 1.4 * 1.4 * 2.5
	var next_speed := minf(speed, previous_speed + (0.0 if last_move_tick == tick else acceleration * dt))
	u.vel = dir * next_speed
	u["motion_tick"] = tick
	u["motion_speed"] = next_speed

func _step_move_order(unit: Dictionary, order: Dictionary, dt: float) -> void:
	var target := _prepare_order_path(unit, order)
	var radius: float = order.get("arrival_radius", 0.9)
	var arrived: bool = unit.path.size() == 1 and unit.pos.distance_to(target) <= radius
	var can_finish := _can_finish_path_order(unit, order)
	if can_finish and (arrived or _should_settle_in_group_arrival(unit, target, radius)):
		unit.orders.pop_front()
		unit.path.clear()
		unit.home_pos = unit.pos
		unit.has_home_pos = true
	elif not arrived:
		_follow_path(unit, dt)

func active_living_ground_speed_bonus(unit: Dictionary) -> float:
	var bonus := float(unit.get("living_ground_speed_bonus", 0.0))
	if ladder_rules and unit.unit_type == "blight_hurler" and players[unit.owner].upgrades.get("muscular_augments", 0):
		bonus = LadderRules.HURLER_UPGRADED_CREEP_BONUS
	if ladder_rules and unit.unit_type == "carapace_bulwark" and players[unit.owner].upgrades.get("anabolic_synthesis", 0):
		bonus = LadderRules.BULWARK_UPGRADED_CREEP_BONUS
	return bonus if bonus > 0.0 and not unit.is_immobile and unit.flight_height <= 0.0 and has_living_ground(unit.pos) else 0.0

func effective_move_speed(unit: Dictionary) -> float:
	if unit.is_immobile:
		return 0.0
	var speed: float = unit.speed
	if unit.get("crawler_uprooted", false):
		return LadderRules.CRAWLER_CREEP_SPEED if has_living_ground(unit.pos) else LadderRules.CRAWLER_MOBILE_SPEED
	if ladder_rules and LadderRules.DRIFT_UPGRADED_SPEED.has(unit.unit_type) and players[unit.owner].upgrades.get("pneumatized_carapace", 0):
		speed = LadderRules.DRIFT_UPGRADED_SPEED[unit.unit_type]
	if ladder_rules and unit.unit_type == "bile_crawler":
		var glial: bool = players[unit.owner].upgrades.get("glial_reconstitution", 0) > 0
		if unit.get("burrow_mobile", false):
			speed = LadderRules.BILE_CRAWLER_GLIAL_TUNNEL_SPEED if glial else LadderRules.BILE_CRAWLER_TUNNEL_SPEED
		elif glial:
			speed = LadderRules.BILE_CRAWLER_GLIAL_SPEED
	if ladder_rules and unit.unit_type == "blight_hurler" and players[unit.owner].upgrades.get("muscular_augments", 0):
		speed = LadderRules.HURLER_UPGRADED_SPEED
	if unit.unit_type == "mireweaver" and unit.get("burrow_mobile", false):
		speed = 2.0 * 1.4 * 2.5
	if ladder_rules and unit.unit_type == "skitterling" and players[unit.owner].upgrades.get("metabolic_boost", 0):
		speed = 6.58 * 2.5
	if unit.unit_type == "prism_ray":
		if int(unit.get("alignment_until", 0)) > tick:
			speed = 2.89 * 2.5
		elif players[unit.owner].upgrades.get("flux_vanes", 0):
			speed = 4.65 * 2.5
	if unit.unit_type == "rampart_transport" and int(unit.get("rampart_boost_until", 0)) > tick:
		speed = LadderRules.RAMPART_BOOST_SPEED
	if unit.unit_type == "night_harrier" and players[unit.owner].upgrades.get("harrier_rotors", 0):
		speed = 5.25 * 2.5
	if tick < int(unit.get("hurler_lunge_until", 0)):
		speed *= 2.0
	if ladder_rules and unit.unit_type == "spine_ambusher" and players[unit.owner].upgrades.get("adaptive_talons", 0):
		speed = LadderRules.AMBUSHER_UPGRADED_SPEED
	if ladder_rules and unit.unit_type == "carapace_bulwark" and players[unit.owner].upgrades.get("anabolic_synthesis", 0):
		speed = LadderRules.BULWARK_UPGRADED_SPEED
	if ladder_rules and unit.unit_type in ["farsight_wisp", "lumen_carrier"]:
		var upgrades: Dictionary = players.get(unit.owner, {}).get("upgrades", {})
		if unit.unit_type == "farsight_wisp" and upgrades.get("wisp_thrusters", 0):
			speed = LadderRules.WISP_UPGRADED_SPEED
		elif unit.unit_type == "lumen_carrier" and upgrades.get("lumen_drive", 0):
			speed = LadderRules.LUMEN_UPGRADED_SPEED
	if unit.surge_timer > 0.0:
		speed *= 1.5
	if unit.charge_timer > 0.0:
		speed = LadderRules.CHARGE_SPEED if ladder_rules else speed * 1.8
	if fungal_grasp_active(unit) and not _is_frenzied(unit):
		speed *= 0.25
	elif unit.slow_timer > 0.0:
		speed *= 0.5
	if _time_warp_covers(unit) and not _is_frenzied(unit):
		speed *= 0.6
	if campaign != null and campaign.mutators != null and Mutators.enemy(unit) and campaign.mutators.has("speed_freaks"):
		speed *= 1.5
	return speed * (1.0 + active_living_ground_speed_bonus(unit))

func concord_combat_research_block_reason(owner: int, upgrade: String) -> String:
	if ladder_rules and not players.get(owner, {}).get("upgrades", {}).get(upgrade, 0):
		if upgrade == "shadow_stride":
			return "Requires Shadow Stride research at a Veil Sanctum."
		return "Requires %s research at a Twilight Array." % ("Charge" if upgrade == "charge" else "Phase Step")
	return ""

func _try_automatic_charge(unit: Dictionary, target: Dictionary) -> void:
	if unit.get("auto_charge", false):
		_begin_ladder_charge(unit, target)

func _phase_step_site_valid(unit: Dictionary, point: Vector2) -> bool:
	return (unit.pos.distance_squared_to(point) <= LadderRules.PHASE_STEP_RANGE ** 2
		and can_see_position(unit.owner, point) and _map_clamped_position(point, unit.radius) == point
		and not _is_point_blocked_by_static(point, unit.radius) and not _ground_mobile_overlaps(point, unit.radius))

func _ladder_phase_step_landing(unit: Dictionary, requested: Vector2, spread: bool) -> Vector2:
	if not requested.is_finite() or unit.pos.distance_squared_to(requested) > LadderRules.PHASE_STEP_RANGE ** 2 \
			or not can_see_position(unit.owner, requested):
		return Vector2.INF
	if _phase_step_site_valid(unit, requested):
		return requested
	if spread:
		for ring in [2.8, 5.6, 8.4]:
			for spoke in range(12):
				var point: Vector2 = requested + Vector2.from_angle(spoke * TAU / 12.0) * ring
				if _phase_step_site_valid(unit, point):
					return point
	return Vector2.INF

func _begin_ladder_charge(unit: Dictionary, target: Dictionary) -> bool:
	if unit.unit_type != "sunblade" or unit.is_immobile or int(unit.get("charge_ready_tick", 0)) > tick \
			or not concord_combat_research_block_reason(unit.owner, "charge").is_empty():
		return false
	if target.is_empty() or target.owner <= 0 or target.owner == unit.owner or not can_attack(unit, target) or not can_see_unit(unit.owner, target):
		return false
	var distance := _edge_distance(unit, target)
	if distance <= weapon_range_against(unit, target) or distance > LadderRules.CHARGE_RANGE:
		return false
	unit.charge_timer = LadderRules.CHARGE_DURATION_SECONDS
	unit["charge_ready_tick"] = tick + ceili(LadderRules.CHARGE_COOLDOWN_SECONDS * TICK_RATE)
	ability_triggered.emit(unit, "charge", unit.pos)
	return true

func _should_settle_in_group_arrival(u: Dictionary, target_pos: Vector2, base_arrival: float) -> bool:
	var dist = u["pos"].distance_to(target_pos)
	if dist > base_arrival * 2.8:
		return false
	var neighbors = query_units_in_radius(u["pos"], u["radius"] * 2.4)
	for n in neighbors:
		if n["tag"] == u["tag"] or n["owner"] != u["owner"] or n.is_walkable_structure or n.get("burrowed", false):
			continue
		if (u.flight_height > 0.0) != (n.flight_height > 0.0):
			continue
		if n["orders"].is_empty() and n["home_pos"].distance_to(target_pos) <= base_arrival * 3.0:
			if u["pos"].distance_to(n["pos"]) <= (u["radius"] + n["radius"]) * 1.35:
				return true
	return false

func _start_choke_yield(leader: Dictionary, blocker: Dictionary, direction: Vector2, mineral_walkers: Dictionary) -> void:
	var across := direction.orthogonal()
	var gap: float = leader.radius + blocker.radius + 0.6
	var midpoint: Vector2 = (leader.pos + blocker.pos) * 0.5
	if direction.dot((blocker.pos - leader.pos).normalized()) < 0.65:
		return
	if not blocker.orders.is_empty():
		if blocker.vel.dot(direction) >= -0.25:
			return
		# A consistent direction wins a head-on tie across the whole line.
		if (direction.x if absf(direction.x) >= absf(direction.y) else direction.y) < 0.0:
			return
	var cliff_walk: bool = blocker.get("cliff_walk", false)
	if not (_is_point_blocked_by_static(midpoint + across * gap, blocker.radius, cliff_walk) and _is_point_blocked_by_static(midpoint - across * gap, blocker.radius, cliff_walk)):
		return
	for unit in query_units_in_radius(blocker.pos, 9.0):
		if unit.owner != leader.owner or unit.is_structure or unit.is_immobile or unit.flight_height > 0.0 or unit.has("choke_yield") or mineral_walkers.has(unit.tag):
			continue
		if unit.attack_state != "idle":
			continue
		var offset: Vector2 = unit.pos - leader.pos
		if offset.dot(direction) <= 0.0 or absf(offset.dot(across)) > gap or unit.vel.dot(direction) > 0.25:
			continue
		if not unit.orders.is_empty() and unit.vel.dot(direction) >= -0.25:
			continue
		var berth := _find_choke_berth(unit, direction, across, leader.radius + unit.radius + 0.8)
		if not berth.is_empty():
			unit["choke_yield"] = {"leader": leader.tag, "direction": direction, "turn": berth[0], "point": berth[1], "expires": tick + 6 * 64}

func _find_choke_berth(unit: Dictionary, direction: Vector2, across: Vector2, gap: float) -> Array[Vector2]:
	var from: Vector2 = unit.pos
	var radius: float = unit.radius
	var cliff_walk: bool = unit.get("cliff_walk", false)
	var side := 1.0 if unit.tag % 2 == 0 else -1.0
	for step in range(25):
		var turn := from + direction * float(step) * 0.5
		if _is_point_blocked_by_static(turn, radius, cliff_walk):
			break
		for sign_value in [side, -side]:
			var point := turn + across * gap * float(sign_value)
			if _has_clear_line_of_walk(turn, point, radius, cliff_walk):
				return [turn, point]
	return []

func _follow_choke_yield(unit: Dictionary, dt: float, mineral_walkers: Dictionary) -> void:
	var yield_order: Dictionary = unit.choke_yield
	var leader: Dictionary = units.get(yield_order.leader, {})
	var direction: Vector2 = yield_order.direction
	var point: Vector2 = yield_order.point
	if leader.is_empty() or unit.attack_state != "idle" or tick >= int(yield_order.expires) or _is_point_blocked_by_static(point, unit.radius, unit.get("cliff_walk", false)):
		unit.erase("choke_yield")
		unit.path.clear()
		return
	unit.pushed_timer = 0.35
	var turn: Vector2 = yield_order.turn
	if not yield_order.get("turn_reached", false) and unit.pos.distance_squared_to(turn) > 0.22:
		_move_toward_point(unit, turn, dt)
		return
	yield_order["turn_reached"] = true
	if unit.pos.distance_squared_to(point) > 0.16:
		_move_toward_point(unit, point, dt)
		return
	unit.vel = Vector2.ZERO
	if tick % 8 != int(unit.tag) % 8:
		return
	# The unit that opened the passage may have reached its own destination
	# short of this berth. It no longer needs to hold this unit aside.
	if (leader.pos - turn).dot(direction) < 1.0 and (not leader.orders.is_empty() or leader.vel.dot(direction) > 0.25):
		return
	for follower in query_units_in_radius(turn, 7.0):
		if follower.flight_height > 0.0 or mineral_walkers.has(follower.tag):
			continue
		if follower.owner == unit.owner and follower.vel.dot(direction) > 0.25 and (follower.pos - turn).dot(direction) < 1.0 and absf((follower.pos - turn).dot(direction.orthogonal())) < 2.5:
			return
	unit.erase("choke_yield")
	unit.path.clear()

func _apply_steering_and_push_resolution(all_tags: Array, dt: float, mineral_walkers: Dictionary = {}) -> void:
	var neighbors_by_tag: Dictionary = {}
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if (u.is_structure and u.flight_height <= 0.0 and not u.get("crawler_uprooted", false)) or u.is_immobile or u.get("gas_extracting", false) or u.get("campaign_road_vehicle", false):
			continue
		if u.unit_type in ["rift_nova", "mirage_shade"]:
			_move_on_terrain(u, u.pos + u.vel * dt)
			continue
		if u.has("choke_yield"):
			if mineral_walkers.has(tag):
				u.erase("choke_yield")
			else:
				_follow_choke_yield(u, dt, mineral_walkers)

		var position: Vector2 = u["pos"]
		var radius: float = u["radius"]
		var speed: float = u["speed"]
		var owner_id: int = u["owner"]
		var desired_vel: Vector2 = u["vel"]
		var is_moving: bool = desired_vel.length_squared() > 0.05
		var neighbors = query_units_in_radius(position, radius + 2.6)
		neighbors_by_tag[tag] = neighbors

		var steer_force: Vector2 = Vector2.ZERO
		var mineral_walking := mineral_walkers.has(tag)
		var flying: bool = u.flight_height > 0.0
		for neighbor in neighbors:
			var n: Dictionary = neighbor
			if n["tag"] == tag or flying != (n.flight_height > 0.0) or not _shares_burrow_collision_layer(u, n) or n.get("nonblocking", false) or n.get("campaign_road_vehicle", false):
				continue
			if n["is_structure"] and n["is_walkable_structure"]:
				continue
			# Mineral walking is a pair rule. Neither mobile gets to push the other.
			if not n.is_structure and (mineral_walking or mineral_walkers.has(n.tag)):
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

			if is_moving and (not n.is_structure or flying):
				if not flying and n.owner == owner_id and n.attack_state == "idle" and not n.is_immobile and not u.has("choke_yield") and not n.has("choke_yield") and tick % 4 == int(tag) % 4 and dist < min_sep * 2.0:
					_start_choke_yield(u, n, desired_vel.normalized(), mineral_walkers)
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
						_move_on_terrain(n, neighbor_position + push_vec * speed * dt * 0.9)
						n["pushed_timer"] = 0.35

		var final_vel = desired_vel + steer_force
		var max_spd := effective_move_speed(u)
		if final_vel.length() > max_spd and max_spd > 0.0:
			final_vel = final_vel.normalized() * max_spd

		if final_vel.length_squared() > 0.001:
			_move_on_terrain(u, position + final_vel * dt)
			u["vel"] = final_vel
		if not flying and is_moving and not u.path.is_empty() and not u.has("choke_yield") and tick % 16 == int(tag) % 16:
			# Crowd steering can move a unit off the clear segment it planned
			# through a choke. Replan from its new approach if the wall stops it.
			var minimum_progress := speed * dt * 0.2
			if position.distance_squared_to(u.pos) < minimum_progress * minimum_progress:
				var cliff_walk: bool = u.get("cliff_walk", false)
				if not _is_point_blocked_by_static(u.pos, radius, cliff_walk) and not _has_clear_line_of_walk(u.pos, u.path.front(), radius, cliff_walk):
					u.path.clear()

	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if (u.is_structure and u.flight_height <= 0.0 and not u.get("crawler_uprooted", false)) \
				or (u.get("burrowed", false) and not u.get("burrow_mobile", false)) or u.get("nonblocking", false) or u.get("campaign_road_vehicle", false):
			continue
		# Ground structures never moved between the passes; nearby mobiles moved by less
		# than a tick. The wider steering query already covers collision contacts.
		var neighbors: Array = neighbors_by_tag[tag] if neighbors_by_tag.has(tag) else query_units_in_radius(u["pos"], u["radius"] + 1.8)
		var mineral_walking := mineral_walkers.has(tag)
		var flying: bool = u.flight_height > 0.0
		for n in neighbors:
			if n["tag"] <= u["tag"] or flying != (n.flight_height > 0.0) or not _shares_burrow_collision_layer(u, n) or n.get("nonblocking", false) or n.get("campaign_road_vehicle", false):
				continue
			if n["is_structure"] and n["is_walkable_structure"]:
				continue
			if not n.is_structure and (mineral_walking or mineral_walkers.has(n.tag)):
				continue
			var diff: Vector2 = u["pos"] - n["pos"]
			var dist: float = diff.length()
			var min_dist: float = (u["radius"] + n["radius"]) * 0.92
			if dist < min_dist:
				var nrm = diff / dist if dist > 0.001 else Vector2.RIGHT
				var pen = min_dist - dist
				if u.is_immobile and n.is_immobile:
					continue
				if (n.is_structure and not flying and not n.get("crawler_uprooted", false)) or n.is_immobile:
					_move_on_terrain(u, u.pos + nrm * pen)
				elif u["is_immobile"]:
					_move_on_terrain(n, n.pos - nrm * pen)
				else:
					_move_on_terrain(u, u.pos + nrm * (pen * 0.5))
					_move_on_terrain(n, n.pos - nrm * (pen * 0.5))

func _shares_burrow_collision_layer(first: Dictionary, second: Dictionary) -> bool:
	if first.get("burrowed", false):
		return first.get("burrow_mobile", false) and (second.is_structure or second.get("burrow_mobile", false))
	return not second.get("burrowed", false)

func _move_on_terrain(unit: Dictionary, pos: Vector2) -> void:
	if unit.flight_height > 0.0:
		unit.pos = _map_clamped_position(pos, unit.radius)
	else:
		if _can_crush_phase_barriers(unit) and unit.pos != pos:
			_crush_phase_barriers_on_step(unit, pos)
		unit.pos = _clamp_to_walkable(pos, unit.radius, unit.get("cliff_walk", false), unit.pos)

func _can_crush_phase_barriers(unit: Dictionary) -> bool:
	return ladder_rules and not unit.get("burrowed", false) and unit.attributes.has("Massive")

func _crush_phase_barriers_on_step(unit: Dictionary, pos: Vector2) -> void:
	for field in _footprint_bins.get(_footprint_bin(pos), NO_FOOTPRINTS):
		if field.get("unit_type") != "phase_barrier" or not units.has(field.tag):
			continue
		var reach: float = unit.radius + field.radius
		var closest := Geometry2D.get_closest_point_to_segment(field.pos, unit.pos, pos)
		if closest.distance_squared_to(field.pos) < reach * reach \
				and _has_clear_line_of_walk(unit.pos, pos, unit.radius, unit.get("cliff_walk", false), true):
			_remove_destroyed_unit(field)

func _map_clamped_position(p: Vector2, radius: float) -> Vector2:
	if terrain_grid:
		var bounds := terrain_grid.bounds.grow(-radius - 0.01)
		return p.clamp(bounds.position, bounds.end)
	return Vector2(
		clampf(p.x, radius + 1.0, map_width - radius - 1.0),
		clampf(p.y, radius + 1.0, map_height - radius - 1.0)
	)

func _clamp_to_walkable(p: Vector2, radius: float, ignore_cliffs: bool = false, previous: Vector2 = Vector2.INF) -> Vector2:
	var res := _map_clamped_position(p, radius)
	if terrain_grid and previous.is_finite() and terrain_grid.blocks_segment(previous, res, radius, ignore_cliffs, _walk_segment_enters_rect):
		return _slide_along_static(previous, res, radius, ignore_cliffs)
	if not water_cells.is_empty():
		var clearance := radius * 0.5
		var touches_water := _walk_segment_hits_water(previous, res, clearance) if previous.is_finite() else is_water_at(res, clearance)
		if touches_water:
			if previous.is_finite() and not is_water_at(previous, clearance):
				return _slide_along_static(previous, res, radius, ignore_cliffs)
			if is_water_at(res, clearance):
				var grid := _navigation_grid(radius, ignore_cliffs)
				res = grid.get_point_position(_find_nearest_walkable_cell(grid, res, res))
	if not ignore_cliffs:
		for obs in terrain_obstacles:
			var exp_rect := obs.grow(radius)
			if previous.is_finite() and not exp_rect.has_point(previous) and _walk_segment_enters_rect(previous, res, exp_rect):
				return _slide_along_static(previous, res, radius, ignore_cliffs)
			if exp_rect.has_point(res):
				var dl := absf(res.x - exp_rect.position.x)
				var dr := absf(exp_rect.end.x - res.x)
				var dt_top := absf(res.y - exp_rect.position.y)
				var db := absf(exp_rect.end.y - res.y)
				var m := minf(minf(dl, dr), minf(dt_top, db))
				if m == dl:
					res.x = exp_rect.position.x - 0.05
				elif m == dr:
					res.x = exp_rect.end.x + 0.05
				elif m == dt_top:
					res.y = exp_rect.position.y - 0.05
				else:
					res.y = exp_rect.end.y + 0.05
		if previous.is_finite() and _walk_segment_hits_ledge(previous, res, radius):
			return _slide_along_static(previous, res, radius, ignore_cliffs)
	var before_collision := res
	for footprint in _footprint_bins.get(_footprint_bin(res), NO_FOOTPRINTS):
		if footprint.get("removed_phase_barrier", false):
			continue
		var separation := float(footprint.radius) + radius
		var delta: Vector2 = res - footprint.pos
		if delta.length_squared() >= separation * separation:
			if previous.is_finite() and previous.distance_squared_to(footprint.pos) >= separation * separation:
				var closest := Geometry2D.get_closest_point_to_segment(footprint.pos, previous, res)
				if closest.distance_squared_to(footprint.pos) < separation * separation:
					return _slide_along_static(previous, res, radius, ignore_cliffs)
			continue
		var origin: Vector2 = previous - footprint.pos
		if previous.is_finite() and (delta.is_zero_approx() or delta.dot(origin) < 0.0):
			delta = origin
		if delta.is_zero_approx():
			delta = Vector2.RIGHT
		res = footprint.pos + delta.normalized() * (separation + 0.02)
	if res != before_collision and previous.is_finite():
		if _is_point_blocked_by_static(res, radius, ignore_cliffs) or (not ignore_cliffs and _walk_segment_hits_ledge(previous, res, radius)):
			return previous
	return res

func _slide_along_static(previous: Vector2, target: Vector2, radius: float, ignore_cliffs: bool) -> Vector2:
	# Keep the move on its original side of the blocker rather than ejecting
	# to the nearest face, which can be across a diagonal corner.
	for slide in [Vector2(target.x, previous.y), Vector2(previous.x, target.y)]:
		if slide != previous and _has_clear_line_of_walk(previous, slide, radius, ignore_cliffs):
			return slide
	return previous

func weapon_range_against(unit: Dictionary, target: Dictionary = {}) -> float:
	if ladder_rules and unit.unit_type == "field_bunker":
		var occupied_range := 0.0
		for passenger in unit.get("passengers", []):
			var gun := _active_weapon(passenger, target)
			if not gun.is_empty() and (target.is_empty() or _weapon_can_hit(gun, target)):
				occupied_range = maxf(occupied_range, _bunker_weapon_range(unit, gun))
		return occupied_range
	var weapon := _active_weapon(unit, target)
	var reach := float(weapon.get("range", 0.0))
	if reach > 0.0 and unit.unit_type == "sky_sentry_defender" and players[unit.owner].upgrades.get("sky_ballistics", 0):
		reach += LadderRules.SKY_BALLISTICS_BONUS
	if unit.unit_type == "dawn_interceptor" and players[unit.owner].upgrades.get("pulse_crystals", 0):
		reach += 5.0
	if ladder_rules and unit.unit_type == "spire_walker" and players.get(unit.owner, {}).get("upgrades", {}).get("extended_prism", 0):
		reach += LadderRules.EXTENDED_PRISM_BONUS
	if ladder_rules and unit.unit_type == "blight_hurler" and players[unit.owner].upgrades.get("grooved_spines", 0):
		reach += LadderRules.HURLER_RANGE_BONUS
	if reach > 0.0 and unit.unit_type == "spine_ambusher" and players[unit.owner].upgrades.get("seismic_spines", 0):
		reach += LadderRules.AMBUSHER_RANGE_BONUS
	if ladder_rules and unit.unit_type in ["sentry_turret", "bastion_turret", "fortified_hub"] and players[unit.owner].upgrades.get("precision_tracking", 0):
		reach += 2.5
	if reach > 1.0 and _blinding_cloud_covers(unit):
		return 1.0
	if reach > 0.0 and campaign != null and campaign.mutators != null and Mutators.enemy(unit) \
			and campaign.mutators.has("long_range") and is_ranged_weapon(weapon):
		reach += 4.0
	return reach

func _blinding_cloud_covers(unit: Dictionary) -> bool:
	return unit.flight_height <= 0.0 and blinding_clouds.any(func(cloud):
		return tick < int(cloud.ends) and unit.pos.distance_squared_to(cloud.pos) <= LadderRules.BLINDING_CLOUD_RADIUS ** 2)

func _edge_distance(a: Dictionary, b: Dictionary) -> float:
	var position: Vector2 = a.pos
	return maxf(0.0, position.distance_to(b.pos) - (float(a.radius) + float(b.radius)))

func can_attack(attacker: Dictionary, target: Dictionary) -> bool:
	if attacker.unit_type == "field_bunker":
		return attacker.get("passengers", []).any(func(unit): return _weapon_can_hit(_active_weapon(unit, target), target))
	return _can_hit_with_weapon(attacker, _active_weapon(attacker, target), target)

func _active_weapon(unit: Dictionary, target: Dictionary = {}) -> Dictionary:
	if unit.has("vehicle_transition") or unit.has("sky_transition") or systems_jammed(unit):
		return {}
	if unit.unit_type == "sunseer" and not unit.get("pulsar_active", false):
		return {}
	if unit.get("crawler_uprooted", false) or unit.has("crawler_transition"):
		return {}
	var buried: bool = unit.get("burrowed", false)
	if unit.has("burrow_transition") or buried != (unit.unit_type == "spine_ambusher"):
		return {}
	var definition := unit_definition_for(unit.unit_type, unit.owner)
	if target.get("flight_height", 0.0) > 0.0 and definition.has("air_weapon"):
		return definition.air_weapon
	return definition.get("weapon", {})

func is_ranged_weapon(weapon: Dictionary) -> bool:
	return weapon.get("attack_type", "ranged" if float(weapon.get("range", 0.0)) > 3.5 else "melee") == "ranged"

func _weapon_can_hit(weapon: Dictionary, target: Dictionary) -> bool:
	var airborne: bool = target.flight_height > 0.0
	var tall_ground_unit: bool = ladder_rules and target.unit_type == "spire_walker"
	var matches_ground: bool = not airborne and weapon.get("targets_ground", true)
	var matches_air: bool = (airborne or tall_ground_unit) and weapon.get("targets_air", false)
	return target.get("unit_type") != "phase_barrier" and int(target.get("stasis_until", 0)) <= tick \
		and not target.get("nonblocking", false) and not weapon.is_empty() \
		and (not weapon.get("no_structures", false) or not target.is_structure) \
		and (matches_ground or matches_air)

func _can_hit_with_weapon(attacker: Dictionary, weapon: Dictionary, target: Dictionary) -> bool:
	if not _weapon_can_hit(weapon, target):
		return false
	if attacker.unit_type != "sky_sentry_defender":
		return true
	var zone: Dictionary = attacker.get("sky_zone", {})
	return not zone.is_empty() and target.pos.distance_squared_to(zone.pos) <= float(zone.radius) ** 2

func _howitzer_splash_is_safe(gun: Dictionary, target: Dictionary, weapon: Dictionary) -> bool:
	var radius := float(weapon.get("splash_radius", 0.0))
	if radius <= 0.0 or float(weapon.get("friendly_splash", 0.0)) <= 0.0:
		return true
	for ally in query_units_in_radius(target.pos, radius):
		if ally.owner == gun.owner and ally.tag != gun.tag and ally.hp > 0.0 and _weapon_can_hit(weapon, ally):
			return false
	return true

func _bunker_shot_in_range(bunker: Dictionary, weapon: Dictionary, target: Dictionary, range_slop: float = 0.0) -> bool:
	if target.is_empty() or target.hp <= 0.0 or not _weapon_can_hit(weapon, target):
		return false
	var distance := _edge_distance(bunker, target)
	return distance <= _bunker_weapon_range(bunker, weapon) + range_slop \
		and distance >= float(weapon.get("min_range", 0.0)) and can_see_unit(bunker.owner, target)

func _bunker_weapon_range(bunker: Dictionary, weapon: Dictionary) -> float:
	var reach := float(weapon.get("range", 5.0))
	if ladder_rules:
		return 1.0 if _blinding_cloud_covers(bunker) else reach + 2.5
	return minf(weapon_range_against(bunker), reach)

func _update_bunker_garrison(bunker: Dictionary, dt: float) -> void:
	_start_waiting_target_order(bunker)
	var focus: Dictionary = {}
	if not bunker.orders.is_empty():
		var order: Dictionary = bunker.orders[0]
		focus = units.get(order.get("target_tag", 0), {})
		if focus.is_empty() or not can_attack(bunker, focus) or not can_see_unit(bunker.owner, focus) \
			or _edge_distance(bunker, focus) > weapon_range_against(bunker, focus):
			bunker.orders.pop_front()
			focus = {}

	var ports := _active_weapon(bunker)
	for shooter in bunker.get("passengers", []):
		_update_unit_timers(shooter, dt)
		var weapon := _active_weapon(shooter)
		if weapon.is_empty():
			continue
		if shooter.attack_state == "windup":
			var target: Dictionary = units.get(shooter.attack_target_tag, {})
			if _bunker_shot_in_range(bunker, weapon, target, LadderRules.WEAPON_RANGE_SLOP if ladder_rules else 0.0):
				shooter.attack_state_timer -= dt
				if shooter.attack_state_timer > 0.0:
					continue
				_execute_weapon_hit(bunker, target, shooter)
				var period := _weapon_period(shooter, weapon)
				shooter.weapon_cooldown = maxf(0.0, period - float(weapon.get("damage_point", 0.0))) if ladder_rules else maxf(float(ports.period), period)
			shooter.attack_state = "idle"
		if shooter.weapon_cooldown > 0.0:
			continue
		var target := focus if not focus.is_empty() else _find_best_attack_target(bunker, true, {}, weapon)
		if _bunker_shot_in_range(bunker, weapon, target):
			bunker.facing = (target.pos - bunker.pos).angle()
			shooter.attack_state = "windup"
			shooter.attack_target_tag = target.tag
			var damage_point := float(weapon.get("damage_point", 0.08))
			shooter.attack_state_timer = damage_point if ladder_rules else maxf(float(ports.damage_point), damage_point)

func _find_best_attack_target(u: Dictionary, range_only: bool, pursuit_origins: Dictionary = {}, garrison_weapon: Dictionary = {}) -> Dictionary:
	if u.get("hold_fire", false):
		return {}
	var definition := RTSData.get_unit_def(u.unit_type)
	var wpn: Dictionary = _active_weapon(u) if garrison_weapon.is_empty() else garrison_weapon
	if wpn.is_empty():
		return {}
	var wpn_range := weapon_range_against(u) if garrison_weapon.is_empty() else float(wpn.get("range", 5.0))
	var air_weapon: Dictionary = {}
	if not garrison_weapon.is_empty():
		wpn_range = _bunker_weapon_range(u, wpn)
	else:
		air_weapon = definition.get("air_weapon", {})
	var air_range := float(air_weapon.get("range", 0.0))
	if air_range > 1.0 and _blinding_cloud_covers(u):
		air_range = 1.0
	var longest_range := maxf(wpn_range, air_range)
	var scan_radius: float = (longest_range if range_only else maxf(longest_range, float(u["sight_range"]))) + 2.5
	var focus_triage: bool = campaign != null and campaign.difficulty == "brutal" and u.owner == 2

	var candidates = query_units_in_radius(u["pos"], scan_radius, u["owner"])
	var best: Dictionary = {}
	var best_score: float = -999999.0

	for c in candidates:
		if not is_hostile_contact(u.owner, c) or c["hp"] <= 0.0:
			continue
		# The optional monuments are deliberate targets. Attack-move keeps
		# the squad on the mission route after it clears their guards.
		if c.unit_type == "propaganda_statue":
			continue
		var use_air_weapon: bool = not air_weapon.is_empty() and c.flight_height > 0.0
		var candidate_weapon := air_weapon if use_air_weapon else wpn
		var reach: float = air_range if use_air_weapon else wpn_range
		if not _can_hit_with_weapon(u, candidate_weapon, c):
			continue
		if u.unit_type == "sporeburst" and c.is_structure and not u.get("target_structures", false):
			continue
		var d_edge = _edge_distance(u, c)
		if d_edge < float(candidate_weapon.get("min_range", 0.0)):
			continue
		if range_only and d_edge > reach:
			continue
		if d_edge > reach and pursuit_origins.has(c.tag):
			var origin: Vector2 = pursuit_origins[c.tag]
			var limit := scan_radius + float(c.radius)
			if maxf(origin.distance_squared_to(c.pos), origin.distance_squared_to(u.pos)) > limit * limit:
				continue

		var prio = 200.0
		if c["is_structure"]:
			prio = 20.0
		elif c["is_worker"]:
			prio = 100.0
		if d_edge <= reach:
			prio += 50.0
			if focus_triage and c.unit_type == "triage_specialist":
				prio += 175.0
			var preferences: Dictionary = candidate_weapon.get("target_priority", {})
			for attr in preferences:
				if c.attributes.has(attr):
					prio += float(preferences[attr])
		var score = prio + float(c.get("target_priority", 0)) - d_edge * 2.5 - (c["hp"] / c["max_hp"]) * 10.0
		if u.unit_type == "sporeburst" or (ladder_rules and u.unit_type == "needlewing"):
			score = -d_edge
		# Only candidates that can win the current priority check need a fog query.
		if score > best_score and can_see_unit(u.owner, c):
			if u.unit_type == "howitzer_emplaced" and RTSCommanderAI.controls_howitzers(u.owner) and not _howitzer_splash_is_safe(u, c, wpn):
				continue
			best_score = score
			best = c

	return best

func _begin_attack_on(u: Dictionary, target: Dictionary) -> void:
	if u.has("vortex_lock_state") or u.unit_type == "dreadnought":
		return
	u["vel"] = Vector2.ZERO
	_face_attack_target(u, target)
	if not _within_needlewing_arc(u, target):
		return
	if ladder_rules and u.charge_timer > 0.0:
		u.charge_timer = 0.0
	if u["weapon_cooldown"] > 0.0:
		return
	var wpn := _active_weapon(u, target)
	if not _weapon_can_hit(wpn, target) or _edge_distance(u, target) < float(wpn.get("min_range", 0.0)):
		return
	if u.unit_type == "sporeburst":
		_detonate_sporeburst(u, target.tag)
		return
	var atk_speed_mult := _attack_speed_multiplier(u)
	u["attack_state"] = "windup"
	u["attack_target_tag"] = target["tag"]
	u["windup_weapon"] = wpn
	u["attack_windup_duration"] = float(wpn.get("damage_point", 0.08)) / atk_speed_mult
	u["attack_state_timer"] = u["attack_windup_duration"]

func _weapon_period(unit: Dictionary, weapon: Dictionary) -> float:
	var period := float(weapon.get("period", 0.8))
	if ladder_rules and unit.unit_type not in ["dreadnought", "crownspire", "pursuit_fighter"] and not weapon.get("carrier_launch", false):
		period += weapon_rng.randf_range(LadderRules.WEAPON_JITTER_MIN, LadderRules.WEAPON_JITTER_MAX)
	return period

func _face_attack_target(unit: Dictionary, target: Dictionary) -> void:
	var offset: Vector2 = target.pos - unit.pos
	unit.facing = (rotate_toward(unit.facing, offset.angle(), deg_to_rad(LadderRules.NEEDLEWING_TURN_DEGREES_PER_SECOND * TICK_DT))
		if ladder_rules and unit.unit_type == "needlewing" else offset.angle())

func _within_needlewing_arc(unit: Dictionary, target: Dictionary) -> bool:
	if not ladder_rules or unit.unit_type != "needlewing":
		return true
	var offset: Vector2 = target.pos - unit.pos
	return offset.is_zero_approx() or absf(angle_difference(unit.facing, offset.angle())) <= deg_to_rad(LadderRules.NEEDLEWING_WEAPON_ARC * 0.5)

func _execute_weapon_hit(attacker: Dictionary, primary_target: Dictionary, shooter: Dictionary = {}, committed_weapon: Dictionary = {}) -> bool:
	if shooter.is_empty():
		shooter = attacker
	if shooter.has("vortex_lock_state") or systems_jammed(shooter):
		return false
	var wpn := _active_weapon(shooter, primary_target) if committed_weapon.is_empty() else committed_weapon
	if not _can_hit_with_weapon(shooter, wpn, primary_target):
		return false
	if wpn.get("carrier_launch", false):
		shooter["fighter_target"] = primary_target.tag
		return _launch_pursuit_fighter(shooter, primary_target)
	if not _within_needlewing_arc(shooter, primary_target) or (_blinding_cloud_covers(attacker) and _edge_distance(attacker, primary_target) > 1.0):
		return false
	var minimum := float(wpn.get("min_range", 0.0))
	if minimum > 0.0 and _edge_distance(attacker, primary_target) < minimum:
		return false
	if shooter.unit_type == "howitzer_emplaced" and RTSCommanderAI.controls_howitzers(shooter.owner):
		if _edge_distance(attacker, primary_target) > float(wpn.range) or not _howitzer_splash_is_safe(attacker, primary_target, wpn):
			return false

	var upgrade := unit_upgrade_level(shooter, "weapons")
	var base_dmg := float(wpn.get("damage", 6.0)) + upgrade * float(wpn.get("damage_per_upgrade", 1))
	if shooter.unit_type == "prism_ray" and int(shooter.get("alignment_until", 0)) > tick and primary_target.attributes.has("Armored"):
		base_dmg += 6.0
	if shooter.unit_type == "horizon_lancer" and primary_target.is_structure and players[shooter.owner].upgrades.get("tectonic_resonance", 0):
		base_dmg += 40.0
	var bonus_dict: Dictionary = wpn.get("bonus", {})
	if upgrade > 0 and wpn.has("bonus_per_upgrade"):
		bonus_dict = bonus_dict.duplicate()
		for attribute in wpn.bonus_per_upgrade:
			bonus_dict[attribute] = float(bonus_dict.get(attribute, 0.0)) + upgrade * float(wpn.bonus_per_upgrade[attribute])
		wpn = wpn.duplicate()
		wpn["bonus"] = bonus_dict
	if shooter.unit_type in ["cinder_runner", "cinder_guard"] and players[shooter.owner].upgrades.get("infernal_catalyst", 0):
		bonus_dict = bonus_dict.duplicate()
		bonus_dict["Light"] = float(bonus_dict.get("Light", 0.0)) + (5.0 if shooter.unit_type == "cinder_runner" else 12.0)
	var attacks := int(wpn.get("attacks", 1)) if ladder_rules or shooter.unit_type == "ridge_scout" else 1
	if shooter.unit_type == "sentry_turret":
		_launch_sentry_volley(attacker, primary_target, wpn, base_dmg, bonus_dict, attacks)
		return true

	var splash_rad := float(wpn.get("splash_radius", 0.0))
	var slow_factor := float(wpn.get("concussive_slow", 0.0))
	var hit_shields: bool = float(primary_target.get("shields", 0.0)) > 0.0
	var durability_before: float = primary_target.hp + primary_target.shields
	for hit in range(attacks):
		if primary_target.hp <= 0.0:
			break
		_apply_damage_to_target(attacker, primary_target, base_dmg, bonus_dict, 1.0, wpn.get("ignores_armor", false), wpn)
	if (ladder_rules and primary_target.owner > 0 and attacker.owner != primary_target.owner
			and primary_target.hp + primary_target.shields < durability_before
			and not can_see_unit(primary_target.owner, attacker)):
		_note_unseen_weapon_hit(primary_target)
	if slow_factor > 0.0 and not primary_target["is_structure"] and not _is_frenzied(primary_target):
		primary_target["slow_timer"] = 2.0
	if ladder_rules and shooter.unit_type == "breacher" and players[shooter.owner].upgrades.get("concussive_shells", 0) \
			and not primary_target.is_structure and primary_target.flight_height <= 0.0 and not primary_target.attributes.has("Massive"):
		primary_target.slow_timer = maxf(primary_target.slow_timer, LadderRules.CONCUSSIVE_SECONDS)

	_apply_weapon_splash(attacker, primary_target.tag, primary_target.pos, wpn, base_dmg, [], primary_target.flight_height > 0.0)
	if wpn.has("bounce_falloff"):
		_apply_weapon_bounces(attacker, primary_target, wpn, base_dmg)
	if wpn.has("line_splash_width"):
		_apply_line_splash(attacker, primary_target, wpn, base_dmg, bonus_dict)
	if wpn.has("cone_angle"):
		_apply_cone_splash(attacker, primary_target, wpn, base_dmg, bonus_dict)
	if wpn.has("cleave_radius"):
		_apply_bulwark_cleave(attacker, primary_target, wpn, base_dmg)
	if wpn.has("spawn_broodlings"):
		_spawn_attack_broodlings(attacker, primary_target, int(wpn.spawn_broodlings))
	if wpn.has("secondary_targets"):
		_apply_flagship_secondary_targets(shooter, primary_target, wpn)

	_emit_weapon_fire(attacker, primary_target, wpn, hit_shields, splash_rad > 0.0)
	return true

func _emit_weapon_fire(attacker: Dictionary, primary_target: Dictionary, wpn: Dictionary, hit_shields: bool, splash: bool) -> void:
	var evt = {
		"tick": tick,
		"type": "weapon_fire",
		"attacker_tag": attacker["tag"],
		"target_tag": primary_target["tag"],
		"from": [attacker["pos"].x, attacker["pos"].y],
		"to": [primary_target["pos"].x, primary_target["pos"].y],
		"weapon": str(wpn.get("name", "Weapon")),
		"splash": splash,
		"owner": attacker["owner"]
	}
	recent_events.append(evt)
	if recent_events.size() > 80:
		recent_events.pop_front()
	emit_signal("weapon_attack", attacker, primary_target, wpn, hit_shields)
	emit_signal("projectile_fired", attacker["pos"], primary_target["pos"], str(wpn.get("name", "")), splash, attacker["owner"])

func _launch_sentry_volley(attacker: Dictionary, target: Dictionary, weapon: Dictionary, damage: float, bonuses: Dictionary, attacks: int) -> void:
	var distance: float = attacker.pos.distance_to(target.pos)
	var flight_ticks := ceili(clampf(0.17 + distance / 75.0, 0.19, 0.43) * TICK_RATE)
	# A twin volley shares one launch cue, with the second tube firing one tick later.
	for index in range(attacks):
		sentry_missiles.append({"source": attacker, "target": target.tag, "weapon": weapon,
			"damage": damage, "bonuses": bonuses, "impact": tick + flight_ticks + index})
	var first_tube := int(attacker.get("sentry_next_tube", 0))
	attacker["sentry_next_tube"] = (first_tube + attacks) % 2
	var volley := weapon.merged({"sentry_flight_ticks": flight_ticks, "sentry_volley_size": attacks, "sentry_first_tube": first_tube})
	_emit_weapon_fire(attacker, target, volley, false, false)

func _step_sentry_missiles() -> void:
	var pending: Array[Dictionary] = []
	for shot in sentry_missiles:
		if tick < int(shot.impact):
			pending.append(shot)
			continue
		var source: Dictionary = shot.source
		var target: Dictionary = units.get(shot.target, {})
		if target.is_empty() or target.hp <= 0.0 or target.owner == source.owner or not _weapon_can_hit(shot.weapon, target):
			continue
		var durability: float = target.hp + target.shields
		_apply_damage_to_target(source, target, shot.damage, shot.bonuses, 1.0, shot.weapon.get("ignores_armor", false), shot.weapon)
		if target.hp + target.shields < durability:
			if ladder_rules and target.owner > 0 and not can_see_unit(target.owner, source):
				_note_unseen_weapon_hit(target)
			ability_triggered.emit(target, "sentry_missile_impact", target.pos)
	sentry_missiles = pending

func _note_unseen_weapon_hit(victim: Dictionary) -> void:
	var previous: Dictionary = unseen_weapon_hits.get(victim.owner, {})
	var nearby: bool = (not previous.is_empty() and tick - int(previous.tick) <= 4 * TICK_RATE
		and victim.pos.distance_squared_to(previous.pos) <= 14.0 ** 2)
	unseen_weapon_hits[victim.owner] = {"pos": victim.pos, "tick": tick, "count": int(previous.count) + 1 if nearby else 1}

func _apply_line_splash(attacker: Dictionary, target: Dictionary, weapon: Dictionary, damage: float, bonuses: Dictionary) -> void:
	var origin: Vector2 = attacker.pos
	var direction := origin.direction_to(target.pos)
	var reach := float(weapon.get("line_splash_length", weapon_range_against(attacker, target) + float(attacker.radius)))
	var end := origin + direction * reach
	var width: float = weapon.line_splash_width
	for candidate in query_units_in_radius(origin, reach + 3.0, attacker.owner):
		if candidate.tag == target.tag or candidate.owner == 0 or candidate.hp <= 0.0 or not _weapon_can_hit(weapon, candidate):
			continue
		if (candidate.pos - origin).dot(direction) <= 0.0:
			continue
		var closest := Geometry2D.get_closest_point_to_segment(candidate.pos, origin, end)
		if closest.distance_squared_to(candidate.pos) <= (width + candidate.radius) ** 2:
			_apply_damage_to_target(attacker, candidate, damage, bonuses, 1.0, false, weapon)

func _apply_cone_splash(attacker: Dictionary, primary: Dictionary, weapon: Dictionary, damage: float, bonuses: Dictionary) -> void:
	var facing: Vector2 = attacker.pos.direction_to(primary.pos)
	var angle_limit := cos(deg_to_rad(float(weapon.cone_angle) * 0.5))
	for candidate in query_units_in_radius(attacker.pos, float(weapon.range) + float(attacker.radius), attacker.owner):
		if candidate.tag == primary.tag or candidate.owner == 0 or not _weapon_can_hit(weapon, candidate):
			continue
		if attacker.pos.direction_to(candidate.pos).dot(facing) >= angle_limit:
			_apply_damage_to_target(attacker, candidate, damage, bonuses, 1.0, false, weapon)

func _apply_bulwark_cleave(attacker: Dictionary, primary: Dictionary, weapon: Dictionary, damage: float) -> void:
	var facing: Vector2 = attacker.pos.direction_to(primary.pos)
	for target in query_units_in_radius(primary.pos, float(weapon.cleave_radius), attacker.owner):
		if target.tag != primary.tag and target.owner > 0 and target.hp > 0.0 and _weapon_can_hit(weapon, target) \
				and facing.dot(target.pos - attacker.pos) >= 0.0:
			_apply_damage_to_target(attacker, target, damage, {}, weapon.cleave_fraction, false, weapon)

func _is_frenzied(unit: Dictionary) -> bool:
	return ladder_rules and unit.unit_type == "carapace_bulwark"

func _spawn_attack_broodlings(attacker: Dictionary, target: Dictionary, count: int) -> void:
	var direction: Vector2 = attacker.pos.direction_to(target.pos)
	var arrivals: Array[Dictionary] = []
	for index in range(count):
		var side := -1.0 if index % 2 == 0 else 1.0
		var approach: Vector2 = target.pos - direction * 2.0 + direction.orthogonal() * side
		var site := _rally_spawn_position(target, approach, "broodling", arrivals)
		if not site.is_finite():
			continue
		var broodling := spawn_unit("broodling", attacker.owner, site)
		arrivals.append(broodling)
		if units.has(target.tag):
			issue_command([broodling.tag], "attack_target", target.pos, target.tag)

func _apply_weapon_bounces(attacker: Dictionary, first_target: Dictionary, weapon: Dictionary, damage: float) -> void:
	var hit_tags := [first_target.tag]
	var origin: Vector2 = first_target.pos
	var radius := float(weapon.bounce_range)
	for multiplier in weapon.bounce_falloff:
		var next_target := {}
		var closest := radius * radius
		for candidate in query_units_in_radius(origin, radius, attacker.owner):
			if candidate.owner == 0 or candidate.hp <= 0.0 or candidate.tag in hit_tags or not _weapon_can_hit(weapon, candidate):
				continue
			var distance := origin.distance_squared_to(candidate.pos)
			if distance > closest or not can_see_unit(attacker.owner, candidate):
				continue
			if next_target.is_empty() or distance < closest or candidate.tag < next_target.tag:
				next_target = candidate
				closest = distance
		if next_target.is_empty():
			break
		hit_tags.append(next_target.tag)
		origin = next_target.pos
		_apply_damage_to_target(attacker, next_target, damage, {}, float(multiplier), false, weapon)

func _apply_weapon_splash(attacker: Dictionary, direct_tag: int, center: Vector2, weapon: Dictionary, damage: float, wave: Array = [], air_target: bool = false) -> void:
	var radius := float(weapon.get("splash_radius", 0.0))
	if radius <= 0.0:
		return
	var friendly_scale := float(weapon.get("friendly_splash", 0.0))
	for target in query_units_in_radius(center, radius):
		if target.tag == direct_tag or target.tag == attacker.tag or target.hp <= 0.0 or not _weapon_can_hit(weapon, target):
			continue
		if not wave.is_empty() and target.tag not in wave:
			continue
		if weapon.get("splash_same_plane", false) and (target.flight_height > 0.0) != air_target:
			continue
		var allegiance := friendly_scale if target.owner == attacker.owner else 1.0
		if allegiance <= 0.0:
			continue
		# Both splash bands are measured from the edge of the target's footprint.
		var edge_distance: float = center.distance_to(target.pos) - float(target.radius)
		if weapon.get("uniform_splash", false):
			for hit in range(int(weapon.get("attacks", 1))):
				if target.hp <= 0.0:
					break
				_apply_damage_to_target(attacker, target, damage, weapon.get("bonus", {}), allegiance, false, weapon)
			continue
		var falloff := 0.5 if edge_distance <= float(weapon.get("half_splash_radius", radius * SPLASH_INNER_RADIUS_RATIO)) else 0.25
		if weapon.has("full_splash_radius") and edge_distance <= float(weapon.full_splash_radius):
			falloff = 1.0
		if not wave.is_empty():
			target["uprising_hit_tick"] = tick
			target["uprising_hit_origin"] = center
		_apply_damage_to_target(attacker, target, damage, weapon.get("bonus", {}), falloff * allegiance, false, weapon)

func apply_uprising_blast(source: Dictionary, target: Dictionary, center: Vector2, wave: Array) -> void:
	var mortar: Dictionary = RTSData.get_unit_def("howitzer_emplaced").weapon
	var direct_tag := 0
	if not target.is_empty() and target.tag in wave and center.distance_to(target.pos) <= 1.0 + float(target.radius):
		direct_tag = target.tag
		target["uprising_hit_tick"] = tick
		target["uprising_hit_origin"] = center
		_apply_damage_to_target(source, target, float(mortar.damage), mortar.bonus, 1.0)
	_apply_weapon_splash(source, direct_tag, center, mortar, float(mortar.damage), wave)

func _apply_damage_to_target(attacker: Dictionary, target: Dictionary, base_dmg: float, bonus_dict: Dictionary, mult: float, bypass_armor: bool = false, weapon: Dictionary = {}) -> void:
	if int(target.get("stasis_until", 0)) > tick or target.get("dread_in_transit", false) or target.get("gas_extracting", false):
		return
	# Stranded militia trade harmless fire while they wait for help.
	if attacker.get("hallucinated", false) or attacker.get("campaign_stranded", false) or int(target.get("rescue_cover_until", 0)) > tick:
		return
	if int(target.get("recall_protection_until", 0)) > tick or target.unit_type in ["rift_nova", "mirage_shade"]:
		return
	if campaign != null and attacker.owner == 1 and target.owner == 2 and not attacker.get("campaign_scripted", false):
		campaign.on_player_hit_enemy(self, target.tag)
	if target.has("agent_snipe"):
		_end_agent_snipe(target)
	var dmg = base_dmg
	var attrs: Array = target.get("attributes", [])
	for attr in bonus_dict.keys():
		if attrs.has(attr):
			dmg += float(bonus_dict[attr])
	if target.get("hallucinated", false):
		mult *= 2.0
	dmg = max(0.5, dmg * mult)
	if not weapon.is_empty() and is_ranged_weapon(weapon):
		if not guardian_shields.is_empty() and _guardian_covers(target):
			dmg = maxf(0.5, dmg - LadderRules.GUARDIAN_SHIELD_REDUCTION)
		if not microbial_shrouds.is_empty() and _microbial_shroud_covers(target):
			dmg = maxf(0.5, dmg * 0.5)

	target["out_of_combat_timer"] = 0.0
	if target.erase("salvage_finish"):
		emit_signal("notice", target.owner, "Damage interrupted salvage.", "warn")
	if target.owner != attacker.owner:
		emit_signal("unit_damaged", target["owner"], target["pos"])

	var mutations: Mutators = campaign.mutators if campaign != null and not attacker.get("campaign_scripted", false) else null
	var previous_hp: float = target.hp
	var previous_shields: float = target.shields
	if mutations != null:
		dmg = mutations.absorb_hit(target, dmg, tick, TICK_RATE)
		if dmg <= 0.0:
			return
	if target.unit_type == "bastion_walker":
		if target.get("auto_bastion_barrier", false):
			_activate_bastion_barrier(target)
		if int(target.get("bastion_barrier_until", 0)) > tick:
			var blocked := minf(dmg, float(target.get("bastion_barrier_hp", 0.0)))
			target.bastion_barrier_hp -= blocked
			dmg -= blocked
			if dmg <= 0.0:
				return

	# Aegis Shields absorb damage before HP
	var armor_penalty := 2.0 if not bypass_armor and int(target.get("armor_breaker_until", 0)) > tick else 0.0
	if target["shields"] > 0.0:
		var shield_armor := 0 if bypass_armor else unit_upgrade_level(target, "shields")
		dmg = maxf(0.5, dmg - shield_armor + armor_penalty)
		var shield_hit := float(dmg) + float(weapon.get("shield_bonus", 0.0)) * mult
		if target["shields"] >= shield_hit:
			target["shields"] -= shield_hit
			attacker["damage_dealt"] += shield_hit
			if mutations != null:
				mutations.on_hit(attacker, target, shield_hit)
			return
		else:
			var overflow := minf(dmg, shield_hit - target.shields)
			attacker["damage_dealt"] += target["shields"]
			target["shields"] = 0.0
			dmg = overflow

	var armor := 0.0 if bypass_armor else float(target.get("armor", 0.0)) + unit_upgrade_level(target, "armor")
	var hp_dmg = max(0.5, dmg - armor + armor_penalty)
	target["hp"] = max(0.0, target["hp"] - hp_dmg)
	attacker["damage_dealt"] += hp_dmg
	if mutations != null:
		mutations.on_hit(attacker, target, previous_hp + previous_shields - target.hp - target.shields)

	if target["hp"] <= 0.0:
		if mutations != null and mutations.revive(target):
			return
		var lost_count: int = 1 + (0 if ladder_rules and target.unit_type == "field_bunker" else target.get("passengers", []).size())
		if target.owner != 0 and attacker.owner != target.owner and not target.get("hallucinated", false):
			if ladder_rules and _qualifies_for_elimination(target):
				_ladder_last_progress_tick = tick
			attacker["kills"] += lost_count
			if players.has(attacker["owner"]):
				players[attacker["owner"]]["units_killed"] += lost_count
		if target.unit_type == "sporeburst":
			_detonate_sporeburst(target)
		else:
			_remove_destroyed_unit(target)

func _apply_mutation_damage(target: Dictionary, amount: float, bypass_shields: bool = false) -> void:
	if int(target.get("stasis_until", 0)) > tick or int(target.get("rescue_cover_until", 0)) > tick \
			or int(target.get("recall_protection_until", 0)) > tick or target.get("dread_in_transit", false):
		return
	target.out_of_combat_timer = 0.0
	if not bypass_shields:
		var blocked := minf(amount, target.shields)
		target.shields -= blocked
		amount -= blocked
	target.hp = maxf(0.0, target.hp - amount)
	if target.hp <= 0.0:
		if target.unit_type == "sporeburst":
			_detonate_sporeburst(target)
		else:
			_remove_destroyed_unit(target)

func bastion_barrier_ticks(unit: Dictionary) -> int:
	return maxi(0, int(unit.get("bastion_barrier_ready", 0)) - tick)

func _activate_bastion_barrier(unit: Dictionary) -> bool:
	if unit.unit_type != "bastion_walker" or unit.build_progress < 1.0 or bastion_barrier_ticks(unit) > 0:
		return false
	unit["bastion_barrier_until"] = tick + LadderRules.BASTION_BARRIER_SECONDS * TICK_RATE
	unit["bastion_barrier_ready"] = tick + LadderRules.BASTION_BARRIER_COOLDOWN * TICK_RATE
	unit["bastion_barrier_hp"] = LadderRules.BASTION_BARRIER_HP
	ability_triggered.emit(unit, "bastion_barrier", unit.pos)
	return true

func rift_nova_ticks(unit: Dictionary) -> int:
	return maxi(0, int(unit.get("rift_nova_ready", 0)) - tick)

func rift_nova_radius() -> float:
	return LadderRules.RIFT_NOVA_RADIUS

func _cast_rift_nova(engine: Dictionary, point: Vector2) -> bool:
	if engine.unit_type != "rift_engine" or engine.is_immobile or rift_nova_ticks(engine) > 0:
		return false
	if not point.is_finite() or engine.pos.distance_squared_to(point) > LadderRules.RIFT_NOVA_RANGE ** 2 \
			or not can_see_position(engine.owner, point) or not Rect2(0, 0, map_width, map_height).has_point(point):
		return false
	var nova := spawn_unit("rift_nova", engine.owner, engine.pos)
	nova["rift_engine"] = engine.tag
	nova["rift_finish"] = tick + ceili(LadderRules.RIFT_NOVA_SECONDS * TICK_RATE)
	engine["active_rift_nova"] = nova.tag
	engine["rift_nova_ready"] = tick + LadderRules.RIFT_NOVA_COOLDOWN * TICK_RATE
	_stop_for_mode_change(engine)
	engine.is_immobile = true
	issue_command([nova.tag], "move", point)
	ability_triggered.emit(engine, "rift_nova_cast", nova.pos)
	return true

func _finish_rift_nova_if_due(nova: Dictionary) -> bool:
	var engine: Dictionary = units.get(nova.get("rift_engine", 0), {})
	if not engine.is_empty() and tick < int(nova.rift_finish):
		return false
	if not engine.is_empty():
		engine.erase("active_rift_nova")
		engine.is_immobile = false
		var center: Vector2 = nova.pos
		for target in query_units_in_radius(center, LadderRules.RIFT_NOVA_RADIUS):
			if target.is_structure or target.flight_height > 0.0 or target.get("nonblocking", false):
				continue
			if center.distance_squared_to(target.pos) <= (LadderRules.RIFT_NOVA_RADIUS + target.radius) ** 2:
				var bonus := minf(LadderRules.RIFT_NOVA_SHIELD_DAMAGE, target.shields)
				_apply_damage_to_target(engine, target, LadderRules.RIFT_NOVA_DAMAGE + bonus, {}, 1.0, true)
		ability_triggered.emit(nova, "rift_nova_blast", center)
	units.erase(nova.tag)
	return true

func mirage_transfer_ticks(unit: Dictionary) -> int:
	return maxi(0, int(unit.get("mirage_transfer_ready", 0)) - tick)

func _cast_mirage_transfer(adept: Dictionary, point: Vector2) -> bool:
	if not ladder_rules or adept.unit_type != "mirage_adept" or adept.is_immobile or mirage_transfer_ticks(adept) > 0:
		return false
	if not point.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(point):
		return false
	var shade := spawn_unit("mirage_shade", adept.owner, adept.pos)
	shade["mirage_adept_tag"] = adept.tag
	shade["mirage_finish"] = tick + LadderRules.MIRAGE_SHADE_SECONDS * TICK_RATE
	adept["mirage_shade_tag"] = shade.tag
	adept["mirage_transfer_ready"] = tick + LadderRules.MIRAGE_SHADE_COOLDOWN * TICK_RATE
	issue_command([shade.tag], "move", point)
	ability_triggered.emit(adept, "mirage_transfer", adept.pos)
	return true

func _cancel_mirage_transfer(unit: Dictionary) -> bool:
	var adept: Dictionary = units.get(unit.get("mirage_adept_tag", 0), {}) if unit.unit_type == "mirage_shade" else unit
	if adept.get("unit_type") == "mirage_adept" and units.erase(adept.get("mirage_shade_tag", 0)):
		adept.erase("mirage_shade_tag")
		return true
	return false

func _finish_mirage_shade_if_due(shade: Dictionary) -> bool:
	var adept: Dictionary = units.get(shade.mirage_adept_tag, {})
	if not adept.is_empty() and tick < int(shade.mirage_finish):
		return false
	units.erase(shade.tag)
	if not adept.is_empty():
		adept.erase("mirage_shade_tag")
		var point: Vector2 = shade.pos
		var radius: float = adept.radius
		var candidates := PackedVector2Array([point])
		for offset in [radius * 2.0, radius * 4.0]:
			for spoke in range(8):
				candidates.append(point + Vector2.from_angle(spoke * TAU / 8.0) * offset)
		for candidate in candidates:
			if (_map_clamped_position(candidate, radius) != candidate
					or _is_point_blocked_by_static(candidate, radius)
					or (candidate != point and not _has_clear_line_of_walk(point, candidate, radius))
					or _ground_mobile_overlaps(candidate, radius, adept.tag)):
				continue
			_stop_for_mode_change(adept)
			adept.attack_state = "idle"
			adept.pos = candidate
			adept.prev_pos = candidate
			ability_triggered.emit(adept, "mirage_arrival", candidate)
			break
	return true

func _remove_destroyed_unit(unit: Dictionary) -> void:
	if unit.is_worker:
		_release_mining_slot(unit)
	if ladder_rules and unit.unit_type == "field_bunker" and not unit.get("passengers", []).is_empty():
		_drop_ground_squad(unit.passengers, unit.pos, {}, unit.tag)
	if unit.unit_type == "pursuit_fighter":
		var carrier: Dictionary = units.get(unit.get("carrier_parent", 0), {})
		if not carrier.is_empty():
			carrier.active_fighters.erase(unit.tag)
	elif unit.unit_type == "fleet_carrier":
		for tag in unit.active_fighters.duplicate():
			var fighter: Dictionary = units.get(tag, {})
			if not fighter.is_empty():
				_remove_destroyed_unit(fighter)
	if unit.has("gravity_lift_target"):
		_end_gravity_lift(unit)
	if unit.has("gravity_lifted_by"):
		var interceptor: Dictionary = units.get(unit.gravity_lifted_by, {})
		if not interceptor.is_empty():
			_end_gravity_lift(interceptor)
	if neural_tethers.has(unit.tag):
		_end_neural_tether(unit.tag)
	if unit.has("neural_caster"):
		_end_neural_tether(unit.neural_caster)
	for cloud in parasitic_clouds:
		if cloud.target == unit.tag:
			cloud.pos = unit.pos
			cloud.target = 0
	_lose_brood_tunnel_cargo_if_last(unit)
	if unit.unit_type == "phase_barrier":
		unit["removed_phase_barrier"] = true
	if ladder_rules:
		if unit.unit_type == "brood_larva":
			var nest: Dictionary = units.get(unit.get("brood_parent", 0), {})
			if not nest.is_empty():
				nest.brood_larvae.erase(unit.tag)
				nest.brood_slots = nest.brood_larvae.size()
		elif unit.unit_type == "brood_egg":
			var nest: Dictionary = units.get(unit.get("brood_parent", 0), {})
			if not nest.is_empty():
				var index := _brood_egg_index(nest, unit.tag)
				if index >= 0:
					nest.production_queue.remove_at(index)
		elif unit.unit_type == "brood_nest":
			for job in unit.production_queue:
				var egg: Dictionary = units.get(job.get("egg_tag", 0), {})
				if not egg.is_empty():
					egg.brood_parent = 0
					egg.production_queue.append(job)
					egg.rally_route = unit.worker_rally_route if RTSData.get_unit_def(job.unit_type).get("is_worker", false) else unit.rally_route
	if players.has(unit.owner) and not unit.get("hallucinated", false):
		players[unit.owner].units_lost += 1 + unit.get("passengers", []).size()
	var dead := unit.duplicate(true)
	if unit.has("attachment_tag"):
		detach_production_attachment(unit)
	if unit.has("attachment_parent_tag"):
		_unlink_attachment(unit)
	_confirm_waiting_attack_loss(unit)
	units.erase(unit.tag)
	if unit.detection_radius > 0.0:
		_detectors.erase(unit)
	if unit.is_structure:
		nav_dirty = true
	_recompute_supplies()
	if campaign != null and campaign.mutators != null:
		campaign.mutators.on_death(dead)
	unit_destroyed.emit(dead)

func _detonate_sporeburst(unit: Dictionary, contact_tag: int = 0) -> void:
	if not units.has(unit.tag) or unit.get("detonated", false):
		return
	unit["detonated"] = true
	unit.hp = 0.0
	var weapon: Dictionary = RTSData.get_unit_def(unit.unit_type).weapon
	ability_triggered.emit(unit, "detonate_sporeburst", unit.pos)
	recent_events.append({"tick": tick, "type": "sporeburst", "attacker_tag": unit.tag,
		"target_tag": contact_tag, "from": [unit.pos.x, unit.pos.y], "owner": unit.owner})
	if recent_events.size() > 80:
		recent_events.pop_front()
	var melee_level := int(players.get(unit.owner, {}).get("upgrades", {}).get("brood_melee", 0))
	# Units may have boarded or hatched since the last spatial rebuild.
	for target in query_units_in_radius(unit.pos, float(weapon.splash_radius), unit.owner):
		if not units.has(target.tag) or target.owner == 0 or target.hp <= 0.0 or not _weapon_can_hit(weapon, target):
			continue
		if target.is_structure:
			_apply_damage_to_target(unit, target, float(weapon.structure_damage) + 5.0 * melee_level, {}, 1.0, true)
		else:
			_apply_damage_to_target(unit, target, float(weapon.damage) + 2.0 * melee_level, weapon.bonus, 1.0)
	_remove_destroyed_unit(unit)

func _escort_engage(unit: Dictionary) -> bool:
	var enemy := _find_best_attack_target(unit, true)
	if enemy.is_empty():
		return false
	_begin_attack_on(unit, enemy)
	return true

func campaign_allows_ability(owner: int, ability_id: String) -> bool:
	if campaign == null or owner != 1:
		return ability_id not in ["build_field_bunker", "build_field_armory", "train_torchguard", "call_roadwardens"]
	return campaign.allows_ability(ability_id, RTSData.get_ability_def(ability_id))

func issue_command(unit_tags: Array, cmd_type: String, target_pos: Vector2 = Vector2.ZERO, target_tag: int = 0, extra: String = "", queue: bool = false, stay_on_route: bool = false) -> Dictionary:
	if _scenario_finished():
		return {"ok": false, "accepted": 0, "error": "Mission has finished" if campaign != null else "Match has finished"}
	var accepted: int = 0
	var valid_units: Array[Dictionary] = []
	var seen := {}
	for t in unit_tags:
		var tag_int = int(t)
		if units.has(tag_int) and not units[tag_int].get("campaign_scripted", false) and not seen.has(tag_int):
			seen[tag_int] = true
			valid_units.append(units[tag_int])

	if valid_units.is_empty():
		return {"ok": false, "accepted": 0, "error": "No valid unit tags"}
	if cmd_type == "fill_gas":
		return _fill_gas(valid_units, target_tag)
	if cmd_type == "merge_archon":
		var merged := _order_archon_merge(valid_units)
		return {"ok": merged, "accepted": 2 if merged else 0}

	var group_size = valid_units.size()
	var dynamic_arrival = clampf(0.85 + sqrt(float(group_size)) * 0.65, 0.85, 5.5)
	var formation: MoveFormation
	if cmd_type.to_lower() == "move" and group_size > 1 and target_pos.is_finite():
		var mobile := valid_units.filter(func(unit): return not unit.is_structure and not unit.is_immobile)
		if mobile.size() > 1:
			formation = MoveFormation.new()
			for unit in mobile:
				formation.spacing = maxf(formation.spacing, float(unit.radius) * 2.0 + 1.6)
			for ring in range(ceili(sqrt(float(mobile.size()))) + 1):
				var offsets := PackedVector2Array()
				for y in range(-ring, ring + 1):
					for x in range(-ring, ring + 1):
						if maxi(absi(x), absi(y)) == ring:
							offsets.append(Vector2(x, y) * formation.spacing)
				formation.rings.append(offsets)

	for u in valid_units:
		var ctype = cmd_type.to_lower()
		if ctype == "cancel_queued_build":
			if accepted == 0 and _cancel_queued_build(u, target_pos, extra):
				accepted += 1
			continue
		if ladder_rules and ctype == "larva_morph_unit" and u.unit_type == "brood_larva":
			ctype = "train_" + extra
		var phase_destination := target_pos
		if int(u.get("stasis_until", 0)) > tick:
			continue
		if u.has("dread_jump") or u.has("dread_beam"):
			continue
		if systems_jammed(u) and ctype not in ["move", "stop", "hold_position", "hold_fire", "patrol", "follow"]:
			continue
		if ctype in ["deploy_bastion_turret", "systems_jammer", "armor_breaker"]:
			if accepted == 0 and _cast_watchkeeper_spell(u, ctype, target_pos, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype in ["dreadnought_jump", "dreadnought_beam"]:
			if accepted == 0 and _cast_dreadnought_ability(u, ctype, target_pos, units.get(target_tag, {})):
				accepted += 1
			continue
		if LadderRules.VEHICLE_MODES.has(ctype):
			if _begin_vehicle_mode(u, ctype):
				accepted += 1
			continue
		if ctype == "vortex_lock":
			if accepted == 0 and _begin_vortex_lock(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "auto_vortex_lock":
			if u.unit_type == "vortex_rover":
				u.auto_vortex_lock = not u.auto_vortex_lock
				accepted += 1
			continue
		if ctype == "sentinel_missiles":
			if accepted == 0 and _begin_sentinel_missile(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "auto_sentinel_missiles":
			if u.unit_type == "sentinel_mine_armed":
				u.auto_sentinel_missiles = not u.auto_sentinel_missiles
				accepted += 1
			continue
		if u.unit_type == "sentinel_mine_armed" and ctype == "stop":
			u.erase("mine_target")
			accepted += 1
			continue
		if u.unit_type == "vortex_rover" and ctype == "stop":
			_end_vortex_lock(u)
		if u.has("agent_snipe"):
			if ctype in ["move", "stop", "hold_position", "patrol"] and not queue:
				_end_agent_snipe(u)
			else:
				continue
		if u.has("agent_strike"):
			if ctype in ["move", "stop", "hold_position", "patrol"] and not queue:
				u.erase("agent_strike")
				u.is_immobile = false
			else:
				continue
		if ctype in ["agent_cloak", "agent_snipe", "agent_emp", "agent_strike"]:
			if accepted == 0 and _cast_agent_spell(u, ctype, target_pos, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype in ["pulsar_beam", "end_pulsar_beam", "revelation", "seed_stasis_ward"]:
			if accepted == 0 and _cast_sunseer_spell(u, ctype, target_pos):
				accepted += 1
			continue
		if ctype in ["flagship_cloak", "time_warp", "flagship_recall"]:
			if accepted == 0 and _cast_flagship_spell(u, ctype, target_pos):
				accepted += 1
			continue
		if u.unit_type == "pursuit_fighter":
			continue
		if ctype == "build_pursuit_fighter":
			if _enqueue_pursuit_fighter(u):
				accepted += 1
			continue
		if ctype == "auto_build_fighters":
			if u.unit_type == "fleet_carrier":
				u.auto_build_fighters = not u.auto_build_fighters
				accepted += 1
			continue
		if u.unit_type == "fleet_carrier" and ctype in ["stop", "hold_fire"]:
			u.erase("fighter_target")
		if u.has("gravity_lifted_by"):
			continue
		if u.has("gravity_lift_target"):
			if ctype in ["move", "stop", "hold_position", "patrol"] and not queue:
				_end_gravity_lift(u)
			else:
				continue
		if neural_tethers.has(u.tag):
			if ctype == "stop":
				_end_neural_tether(u.tag)
				accepted += 1
			continue
		if u.has("siphon_target"):
			if ctype not in ["move", "stop", "hold_position", "patrol"] or queue:
				continue
			_end_wyrm_siphon(u)
		if u.has("transit_finish") or u.has("recall_channel") or u.has("active_rift_nova") or u.has("archon_warp_finish"):
			continue
		if u.has("burrow_transition"):
			var transition: Dictionary = u.burrow_transition
			if not transition.down and ctype in ["move", "attack", "attack_move", "attack_target", "patrol", "stop", "hold_position"]:
				if not queue:
					transition.orders.clear()
				transition.orders.append({"type": ctype, "pos": target_pos, "tag": target_tag, "queue": queue})
				accepted += 1
			continue
		if u.has("locust_descent"):
			continue
		var underground_move: bool = u.get("burrow_mobile", false) and ctype in ["move", "stop"]
		var underground_attack: bool = u.unit_type == "spine_ambusher" \
			and (ctype in ["attack_target", "hold_fire", "stop"] or (ctype == "attack" and target_tag > 0))
		if ladder_rules and u.get("burrowed", false) and not underground_move and not underground_attack \
				and ctype not in ["burrow", "surface", "detonate_sporeburst", "neural_tether", "launch_locusts", "spread_growth_node"]:
			continue
		if u.has("archon_partner") and not queue and ctype in ["move", "attack", "attack_move", "attack_target", "hold_position", "stop", "patrol"]:
			_cancel_archon_approach(mini(u.tag, int(u.archon_partner)))
		if u.get("nonblocking", false) and ctype not in RTSData.get_unit_def(u.unit_type).abilities:
			continue
		if u.get("hallucinated", false) and ctype not in ["move", "stop", "hold_position", "attack", "attack_move", "attack_target", "force_attack", "patrol", "follow", "hold_fire"]:
			continue
		if not campaign_allows_ability(u.owner, ctype):
			notice.emit(u.owner, "That command is unavailable in this mission.", "warn")
			continue
		if u.has("crawler_transition"):
			continue
		if u.has("caustic_spray") and not queue and ctype in ["move", "stop", "hold_position", "patrol", "attack", "attack_move", "attack_target"]:
			_end_caustic_spray(u)
		if ctype == "caustic_spray":
			if accepted == 0 and _begin_caustic_spray(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype in ["crawler_root", "crawler_uproot"]:
			var rooted: bool = ctype == "crawler_root"
			var reason := crawler_mode_block_reason(u, rooted)
			if reason.is_empty() and (not rooted or _crawler_root_site_valid(u, target_pos)):
				if rooted:
					if not queue:
						_stop_for_mode_change(u)
					u.orders.append({"type": "root_watch", "target_pos": target_pos})
				else:
					_begin_crawler_transition(u, false)
				accepted += 1
			else:
				notice.emit(u.owner, reason if not reason.is_empty() else "Rooting requires clear living ground.", "warn")
			continue
		if ctype in ["evolve_brood_lair", "evolve_brood_hive", "evolve_greater_blight_spire"]:
			var form: String = RTSData.get_ability_def(ctype).structure_evolution
			var reason := structure_evolution_block_reason(u, form)
			if reason.is_empty():
				_enqueue_structure_evolution(u, form)
				accepted += 1
			else:
				notice.emit(u.owner, reason, "warn")
			continue
		if ctype == "morph_carapace":
			var reason := carapace_morph_block_reason(u)
			if reason.is_empty():
				_begin_carapace_morph(u)
				accepted += 1
			else:
				notice.emit(u.owner, reason, "warn")
			continue
		if ctype == "cancel_carapace_morph":
			if _cancel_carapace_morph(u):
				accepted += 1
			continue
		if u.unit_type == "sporeburst_cocoon":
			if ctype == "cancel_sporeburst_morph" and u.has("sporeburst_morph_until"):
				_cancel_sporeburst_morph(u)
				accepted += 1
			continue
		if ctype == "morph_sporeburst":
			var reason := sporeburst_morph_block_reason(u)
			if reason.is_empty():
				_begin_sporeburst_morph(u)
				accepted += 1
			else:
				notice.emit(u.owner, reason, "warn")
			continue
		if u.has("brood_morph"):
			if ctype == brood_morph_cancel_command(u):
				_cancel_brood_morph(u)
				accepted += 1
			continue
		if ctype.begins_with("morph_"):
			var form := str(RTSData.get_ability_def(ctype).get("unit_morph", ""))
			if not form.is_empty():
				var reason := brood_morph_block_reason(u, form)
				if reason.is_empty():
					_begin_brood_morph(u, form)
					accepted += 1
				else:
					notice.emit(u.owner, reason, "warn")
				continue
		if ctype in ["seer_oversight", "seer_mobile"]:
			if ladder_rules and u.unit_type == "spore_seer" and u.is_immobile == (ctype == "seer_mobile"):
				u.is_immobile = ctype == "seer_oversight"
				u.sight_range = LadderRules.SEER_OVERSIGHT_SIGHT if u.is_immobile else LadderRules.SEER_MOBILE_SIGHT
				u.detection_radius = u.sight_range
				_stop_for_mode_change(u)
				_refresh_vision()
				accepted += 1
			continue
		if ctype == "contaminate_production":
			if accepted == 0 and _contaminate_production(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "spawn_brood_mimic":
			if _spawn_brood_mimic(u):
				accepted += 1
			continue
		if ctype == "generate_drift_creep":
			if drift_creep_block_reason(u).is_empty():
				u["generating_creep"] = not u.get("generating_creep", false)
				u["creep_half_extent"] = LadderRules.DRIFT_CREEP_HALF_EXTENT
				u["living_ground_radius"] = LadderRules.DRIFT_CREEP_HALF_EXTENT.length() + LivingGround.CELL_SIZE
				if u.generating_creep:
					_stop_for_mode_change(u)
				living_ground.update(units, tick, _can_spread_living_ground, LadderRules.CREEP_SPREAD_TICKS)
				accepted += 1
			continue
		if u.unit_type == "spore_seer" and u.is_immobile:
			continue
		if u.unit_type == "sporeburst" and ctype == "detonate_sporeburst":
			_detonate_sporeburst(u)
			accepted += 1
			continue
		if u.unit_type == "sporeburst" and ctype == "sporeburst_structures" and not u.get("burrowed", false):
			u["target_structures"] = not u.get("target_structures", false)
			accepted += 1
			continue
		if ctype == "link_tunnel":
			if not ladder_rules and accepted == 0 and _link_tunnel(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "send_tunnel_squad":
			if not ladder_rules and _send_tunnel_squad(u):
				accepted += 1
			continue
		if ctype == "summon_brood_worm":
			if accepted == 0 and _summon_brood_worm(u, target_pos):
				accepted += 1
			continue
		if ctype == "load_brood_tunnel":
			if accepted == 0 and can_enter_brood_tunnel(units.get(target_tag, {}), u):
				if issue_command([target_tag], "enter_brood_tunnel", u.pos, u.tag, "", queue).ok:
					accepted += 1
			continue
		if ctype == "stop" and u.erase("brood_tunnel_unload"):
			accepted += 1
			continue
		if ctype == "unload_brood_tunnel":
			if _start_brood_tunnel_unload(u):
				accepted += 1
			continue
		if ctype == "phase_barrier":
			if accepted == 0 and _cast_phase_barrier(u, target_pos):
				accepted += 1
			continue
		if ctype == "lattice_burst":
			if not ladder_rules and accepted == 0 and _cast_lattice_burst(u, target_pos):
				accepted += 1
			continue
		if ctype == "guardian_shield":
			if guardian_shield_block_reason(u).is_empty():
				u.energy -= LadderRules.GUARDIAN_SHIELD_COST
				guardian_shields[u.tag] = tick + ceili(LadderRules.GUARDIAN_SHIELD_SECONDS * TICK_RATE)
				ability_triggered.emit(u, "guardian_shield", u.pos)
				accepted += 1
			continue
		if ctype.begins_with("hallucinate_"):
			if accepted == 0 and _cast_hallucination(u, ctype.trim_prefix("hallucinate_")):
				accepted += 1
			continue
		if ctype == "corrosive_miasma":
			if not ladder_rules and accepted == 0 and _cast_miasma(u, target_pos):
				accepted += 1
			continue
		if ctype == "caustic_barrage":
			if accepted == 0 and _cast_caustic_barrage(u, target_pos):
				accepted += 1
			continue
		if ctype == "canticle_storm":
			if accepted == 0 and _cast_canticle_storm(u, target_pos):
				accepted += 1
			continue
		if ctype in ["fungal_grasp", "microbial_shroud"]:
			if accepted == 0 and _cast_mireweaver_spell(u, ctype, target_pos):
				accepted += 1
			continue
		if ctype == "neural_tether":
			if accepted == 0 and _cast_neural_tether(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "gravity_lift":
			if accepted == 0 and _begin_gravity_lift(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "prism_alignment":
			if prism_alignment_block_reason(u).is_empty():
				u["alignment_until"] = tick + ceili(LadderRules.PRISM_ALIGNMENT_SECONDS * TICK_RATE)
				u["alignment_ready"] = tick + ceili(LadderRules.PRISM_ALIGNMENT_COOLDOWN * TICK_RATE)
				ability_triggered.emit(u, ctype, u.pos)
				accepted += 1
			continue
		if ctype == "launch_locusts":
			if _launch_locusts(u, target_pos):
				accepted += 1
			continue
		if ctype in ["seed_growth_node", "spread_growth_node"]:
			if accepted == 0 and _seed_growth_node(u, ctype, target_pos):
				accepted += 1
			continue
		if ctype == "transfuse_brood":
			if accepted == 0 and _transfuse_brood(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype in ["siphon_structure", "wyrm_grasp", "blinding_cloud", "parasitic_cloud"]:
			if accepted == 0 and _cast_siphon_wyrm_spell(u, ctype, target_pos, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "locust_swoop":
			if u.unit_type == "locust_flying" and _begin_locust_swoop(u, target_pos):
				accepted += 1
			continue
		if ctype == "auto_locust_swoop":
			if u.unit_type == "locust_flying":
				u["auto_locust_swoop"] = not u.get("auto_locust_swoop", true)
				accepted += 1
			continue
		if u.unit_type == "locust_flying" and ctype in ["move", "stop", "hold_position"]:
			u.erase("locust_destination")
		if ctype == "scribe_feedback":
			if accepted == 0 and _cast_scribe_feedback(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype in ["fighter_assault", "fighter_intercept"]:
			var reason := fighter_mode_block_reason(u, ctype)
			if not reason.is_empty():
				notice.emit(u.owner, reason, "warn")
				continue
			var duration := FIGHTER_TRANSITION_TICKS
			if ladder_rules:
				var accelerated := bool(players[u.owner].upgrades.get("smart_servos", 0))
				duration = ceili((LadderRules.KESTREL_SERVOS_SECONDS if accelerated else LadderRules.KESTREL_MODE_SECONDS) * TICK_RATE)
			u.fighter_mode_started = tick
			u.fighter_mode_until = tick + duration
			u.is_immobile = true
			u.attack_state = "idle"
			u.attack_state_timer = 0.0
			u.orders.clear()
			u.path.clear()
			u.vel = Vector2.ZERO
			ability_triggered.emit(u, ctype, u.pos)
			accepted += 1
			continue
		if ctype == "rampart_boost":
			if rampart_boost_block_reason(u).is_empty():
				u["rampart_boost_until"] = tick + ceili(LadderRules.RAMPART_BOOST_SECONDS * TICK_RATE)
				u["rampart_boost_ready"] = tick + ceili(LadderRules.RAMPART_BOOST_COOLDOWN * TICK_RATE)
				ability_triggered.emit(u, ctype, u.pos)
				accepted += 1
			continue
		if ctype == "harrier_cloak":
			if harrier_cloak_block_reason(u).is_empty():
				_toggle_personal_cloak(u)
				ability_triggered.emit(u, ctype, u.pos)
				accepted += 1
			continue
		if ctype in ["sky_defender_mode", "sky_fighter_mode"]:
			if not sky_mode_block_reason(u, ctype).is_empty():
				continue
			if ctype == "sky_fighter_mode":
				_begin_sky_mode(u, u.pos, false)
			elif target_pos.is_finite() and Rect2(0.0, 0.0, map_width, map_height).has_point(target_pos):
				if not queue:
					_clear_controlled_unit_orders(u)
				u.orders.append({"type": ctype, "target_pos": target_pos})
			else:
				continue
			accepted += 1
			continue
		if ctype in ["deploy_power_field", "retract_power_field"]:
			var deploy: bool = ctype == "deploy_power_field"
			if carrier_field_block_reason(u, deploy).is_empty():
				if ladder_rules:
					var duration := LadderRules.CARRIER_ANCHOR_SECONDS if deploy else LadderRules.CARRIER_FOLD_SECONDS
					u["power_field_transition"] = {"deploy": deploy, "finish": tick + ceili(duration * TICK_RATE)}
					u.is_immobile = true
					_stop_for_mode_change(u)
				else:
					_set_carrier_field(u, deploy)
				accepted += 1
			continue
		if ctype == "surveillance_mode":
			if ladder_rules and u.unit_type == "farsight_wisp":
				u.is_immobile = not u.is_immobile
				u["cloaked"] = not u.is_immobile
				u.sight_range = LadderRules.WISP_SURVEILLANCE_SIGHT if u.is_immobile else LadderRules.WISP_MOBILE_SIGHT
				u.detection_radius = u.sight_range
				_stop_for_mode_change(u)
				_refresh_vision()
				accepted += 1
			continue
		if u.unit_type == "lumen_carrier" and u.is_immobile and ctype != "stop" \
				and not (u.get("carrier_anchored", false) and ctype in ["load_transport", "unload_transport"]):
			continue
		if u.unit_type == "farsight_wisp" and u.is_immobile and ctype != "stop":
			continue
		if ctype in ["burrow", "surface"]:
			var underground: bool = ctype == "burrow"
			var reason := burrow_block_reason(u, underground)
			if reason.is_empty():
				if ladder_rules:
					_begin_burrow_transition(u, underground)
				else:
					_set_burrowed(u, underground)
				ability_triggered.emit(u, ctype, u.pos)
				accepted += 1
			elif bool(u.get("burrowed", false)) != underground:
				notice.emit(u.owner, reason, "warn")
			continue
		if u.get("burrowed", false) and not underground_move and not underground_attack:
			continue
		if u.unit_type == "field_bunker" and ctype == "unload_bunker":
			if not u.get("passengers", []).is_empty() and _drop_ground_squad(u.passengers, u.pos):
				accepted += 1
			continue
		var boarding_bunker: bool = u.unit_type == "field_bunker" and ctype == "load_transport"
		if u.has("flight_transition") and ctype != "cancel_training":
			continue
		if u.armed_structure and not u.get("is_town_hall", false) and not u.get("crawler_uprooted", false) and not boarding_bunker and not ctype in ["attack", "attack_target", "force_attack", "hold_fire", "stop", "cancel_construction", "salvage"]:
			continue
		if u.armed_structure and (ctype == "attack_target" or ctype == "force_attack" or ctype == "attack") and (u.build_progress < 1.0 or target_tag <= 0):
			continue
		if ctype == "lift":
			var reason := lift_block_reason(u)
			if not reason.is_empty():
				notice.emit(u.owner, reason, "error")
				continue
			u.orders.clear()
			_begin_production_flight_transition(u, "lift", get_elevation_at(u.pos), PRODUCTION_FLIGHT_HEIGHT)
			accepted += 1
			continue
		if ctype == "land":
			var site := production_landing_position(u, target_pos)
			var reason := landing_block_reason(u, site)
			if not reason.is_empty():
				notice.emit(u.owner, reason, "error")
				continue
			if not queue:
				u.orders.clear()
				u.path.clear()
			u.orders.append({"type": "land", "target_pos": site})
			accepted += 1
			continue
		if u.is_structure and u.flight_height > 0.0 and not ctype in ["move", "stop", "cancel_training"]:
			continue
		if u.is_structure and u.flight_height <= 0.0 and ctype == "move" and not u.get("crawler_uprooted", false):
			continue
		if ctype == "undo_queued_order":
			if not u.is_structure and u.orders.size() > 1:
				u.orders.pop_back()
				accepted += 1
			continue
		if ctype == "reset_rally":
			if u.is_structure and u.build_progress >= 1.0 and RTSData.get_unit_def(u.unit_type).has("trains"):
				u.rally_route.clear()
				if u.has("worker_rally_route"):
					u.worker_rally_route.clear()
				accepted += 1
			continue
		if ctype == "phase_cloak":
			if u.unit_type != "skirmisher" or ladder_rules:
				continue
			if u.get("cloaked", false):
				u["cloaked"] = false
			elif u.energy >= CLOAK_START_ENERGY:
				u.energy -= CLOAK_START_ENERGY
				u["cloaked"] = true
			else:
				continue
			emit_signal("ability_triggered", u, ctype, u.pos)
			accepted += 1
			continue
		if ctype == "hold_fire":
			if u.is_worker or not RTSData.get_unit_def(u.unit_type).has("weapon") or u.build_progress < 1.0:
				continue
			u["hold_fire"] = not u.get("hold_fire", false)
			if u.hold_fire and u.attack_state == "windup" and (u.orders.is_empty() or not u.orders[0].type in ["attack_target", "force_attack"]):
				u.attack_state = "idle"
			accepted += 1
			continue
		if ctype in ["recon_sweep", "reinforce_supply", "deploy_prospector"]:
			if accepted == 0 and _use_hub_power(u, ctype, target_pos, target_tag):
				accepted += 1
			continue
		if ctype in ["upgrade_hub", "fortify_hub"]:
			if _enqueue_hub_upgrade(u, ctype):
				accepted += 1
			continue
		if ctype in ["load_hub_workers", "unload_hub_workers"]:
			if hub_worker_cargo_available(u, ctype):
				var changed := _board_ground_squad(u, 5) if ctype == "load_hub_workers" else _drop_ground_squad(u.passengers, u.pos)
				if changed:
					accepted += 1
			continue
		if ctype == "production_boost":
			if accepted == 0 and _cast_production_boost(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "energy_recharge":
			if accepted == 0 and _cast_energy_recharge(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype in ["open_transit", "close_transit"]:
			if transit_morph_block_reason(u, ctype).is_empty():
				u["transit_morph"] = {"target": "transit_waystone" if ctype == "open_transit" else "waystone",
					"ticks": ceili(LadderRules.TRANSIT_MORPH_SECONDS * TICK_RATE)}
				accepted += 1
			continue
		if ctype.begins_with("transit_"):
			if accepted == 0 and _begin_transit_projection(u, ctype.trim_prefix("transit_"), target_pos):
				accepted += 1
			continue
		if ctype == "load_transport":
			if _load_transport(u):
				accepted += 1
			elif RTSData.get_unit_def(u.unit_type).has("transport_capacity") and transport_slots_used(u) < RTSData.get_unit_def(u.unit_type).transport_capacity:
				notice.emit(u.owner, "No troops in boarding range.", "warn")
			continue
		if ctype == "unload_transport" and u.get("carrier_anchored", false):
			if u.pos.distance_squared_to(target_pos) <= 36.0 and _valid_unload_order(u, target_pos) and _unload_transport(u, target_pos):
				accepted += 1
			continue
		if ctype == "unload_transport" and not _valid_unload_order(u, target_pos):
			continue
		if ctype == "defensive_recall":
			if accepted == 0 and _cast_defensive_recall(u, target_pos):
				accepted += 1
			continue
		if ctype == "salvage":
			if _toggle_salvage(u):
				accepted += 1
			continue
		if ctype == "auto_repair":
			if u.unit_type == "pioneer":
				u["auto_repair"] = not u.get("auto_repair", false)
				if not u.auto_repair and not u.orders.is_empty() and u.orders[0].get("automatic", false):
					u.orders.pop_front()
					u.path.clear()
				accepted += 1
			continue
		if ctype == "auto_heal":
			if u.get("support", {}).get("stat") == "hp":
				u["auto_heal"] = not u.get("auto_heal", false)
				if not u.auto_heal and (u.orders.is_empty() or u.orders[0].type != "restore_vitals"):
					u.support_target_tag = 0
				accepted += 1
			continue
		if ctype == "auto_aegis":
			if u.unit_type == "aegis_capacitor":
				u["auto_aegis"] = not u.auto_aegis
				accepted += 1
			continue
		if ctype == "auto_charge":
			if ladder_rules and u.unit_type == "sunblade" and concord_combat_research_block_reason(u.owner, "charge").is_empty():
				u["auto_charge"] = not u.auto_charge
				accepted += 1
			continue
		if ctype == "bastion_barrier":
			if _activate_bastion_barrier(u):
				accepted += 1
			continue
		if ctype == "auto_bastion_barrier":
			if u.unit_type == "bastion_walker":
				u["auto_bastion_barrier"] = not u.auto_bastion_barrier
				accepted += 1
			continue
		if ctype == "rift_nova_cast":
			if accepted == 0 and _cast_rift_nova(u, target_pos):
				accepted += 1
			continue
		if ctype == "mirage_transfer":
			if _cast_mirage_transfer(u, target_pos):
				accepted += 1
			continue
		if ctype == "hurler_lunge":
			if hurler_lunge_block_reason(u).is_empty() and issue_command([u.tag], "move", target_pos).ok:
				u["hurler_lunge_until"] = tick + ceili(LadderRules.HURLER_LUNGE_SECONDS * TICK_RATE)
				u["hurler_lunge_ready"] = tick + LadderRules.HURLER_LUNGE_COOLDOWN * TICK_RATE
				ability_triggered.emit(u, "hurler_lunge", u.pos)
				accepted += 1
			continue
		if ctype == "cancel_mirage_transfer":
			if _cancel_mirage_transfer(u):
				accepted += 1
			continue
		if ctype == "cancel_construction":
			if _cancel_construction(u):
				accepted += 1
			continue
		if ctype.begins_with("attach_"):
			var ability: Dictionary = RTSData.get_ability_def(ctype)
			if ability.get("attachment", false) and _start_production_attachment(u, str(ability.structure)):
				accepted += 1
			continue
		if ctype == "resume_construction" and (accepted > 0 or not can_resume_construction(u, units.get(target_tag, {}))):
			continue
		if ctype == "repair" and not can_repair(u, units.get(target_tag, {})):
			continue
		if ctype == "restore_vitals" and (u.is_structure or not can_restore(u, units.get(target_tag, {}))):
			continue
		if ctype == "restore_aegis":
			var ally: Dictionary = units.get(target_tag, {})
			if u.unit_type != "aegis_capacitor" or not is_powered(u.owner, u.pos) or not can_restore(u, ally) or _edge_distance(u, ally) > u.support.range:
				continue
		if ctype == "charge" and ladder_rules:
			var enemy: Dictionary = units.get(target_tag, {})
			if _begin_ladder_charge(u, enemy) and issue_command([u.tag], "attack_target", enemy.pos, enemy.tag).ok:
				accepted += 1
			continue
		if ctype in ["phase_step", "shadow_stride"] and ladder_rules:
			var expected := "duskblade" if ctype == "shadow_stride" else "skirmisher"
			if fungal_grasp_active(u):
				continue
			if u.unit_type != expected or u.is_immobile or u.phase_cooldown > 0.0 \
					or not concord_combat_research_block_reason(u.owner, ctype).is_empty():
				continue
			phase_destination = _ladder_phase_step_landing(u, target_pos, group_size > 1)
			if not phase_destination.is_finite():
				continue
		if ctype == "inject_brood":
			if accepted > 0:
				continue
			var reason := brood_inject_block_reason(u, units.get(target_tag, {}))
			if not reason.is_empty():
				notice.emit(u.owner, reason, "warn")
				continue
		if ctype == "follow" and (u.is_structure or u.is_immobile or u.tag == target_tag or not _is_friendly_mobile(units.get(target_tag, {}), u.owner)):
			continue
		if ctype == "enter_bunker" and not can_enter_bunker(u, units.get(target_tag, {})):
			continue
		if ctype == "enter_rampart" and not can_enter_rampart(u, units.get(target_tag, {})):
			continue
		if ctype == "enter_brood_tunnel" and not can_enter_brood_tunnel(u, units.get(target_tag, {})):
			continue
		if ctype == "harvest" and (not u.is_worker or u.is_immobile):
			continue
		if ctype == "harvest" and u.unit_type == "prospector" and resources.get(target_tag, {}).get("resource_type") != "crystal_field":
			continue
		if ctype == "return_cargo":
			if not u.is_worker or u.is_immobile or u.cargo_amount <= 0 or (target_tag > 0 and not is_dropoff(units.get(target_tag, {}), u.owner)):
				continue
			var dropoff := {"type": "return_cargo", "target_tag": target_tag}
			if queue:
				u.orders.append(dropoff)
			else:
				if not u.orders.is_empty() and u.orders[0].type == "return_cargo":
					u.orders.pop_front()
				var current: Dictionary = u.orders.front() if not u.orders.is_empty() else {}
				u.orders.clear()
				u.orders.append(dropoff)
				if current.get("type") == "harvest":
					u.orders.append(current)
				u.path.clear()
			accepted += 1
			continue
		if ctype == "patrol" and (u.is_immobile or u.is_structure or not target_pos.is_finite()):
			continue
		if ctype == "force_attack":
			var friendly: Dictionary = units.get(target_tag, {})
			if friendly.is_empty() or friendly.owner != u.owner or friendly.tag == u.tag or not can_attack(u, friendly):
				continue
		elif ctype == "attack_target" or (ctype in ["attack", "attack_move"] and target_tag > 0):
			var target: Dictionary = units.get(target_tag, {})
			if target.is_empty() or target.owner == u.owner or not can_attack(u, target) or not can_see_unit(u.owner, target):
				continue
		if ctype.begins_with("build_") or ctype == "build":
			var stype_check = ctype.trim_prefix("build_") if ctype != "build" else extra
			if queue and u.unit_type == "forager" and u.orders.any(func(order): return order.type == "build"):
				continue
			if not _can_build(u, stype_check, target_pos):
				continue

		if queue and ctype in ["stop", "hold_position"]:
			u.orders.append({"type": ctype})
			accepted += 1
			continue

		if ctype == "ridge_charge":
			if accepted == 0 and _throw_ridge_charge(u, target_pos):
				accepted += 1
			continue

		# An appended order must leave the active shot and recovery alone.
		# Phase Step is an immediate ability even when Shift is held.
		var immediate := not queue or ctype in ["phase_step", "shadow_stride"]
		if immediate and u["attack_state"] == "backswing" and ctype in ["move", "attack_move", "patrol", "phase_step", "shadow_stride"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0
			if players.has(u["owner"]):
				players[u["owner"]]["stutter_step_cancels"] += 1
		elif immediate and u["attack_state"] == "windup" and ctype in ["move", "stop", "phase_step", "shadow_stride"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0

		if ctype == "surge":
			if surge_block_reason(u).is_empty():
				u["hp"] -= surge_hp_cost(u)
				u["surge_timer"] = float(RTSData.get_ability_def("surge").duration)
				if ladder_rules:
					u["surge_ready"] = tick + ceili(LadderRules.SURGE_COOLDOWN_SECONDS * TICK_RATE)
				emit_signal("ability_triggered", u, "surge", u["pos"])
				accepted += 1
			continue

		elif ctype == "charge":
			if u["unit_type"] == "sunblade":
				u["charge_timer"] = 3.5
				emit_signal("ability_triggered", u, "charge", u["pos"])
				accepted += 1
			continue

		elif ctype in ["phase_step", "shadow_stride"]:
			var stride: bool = ctype == "shadow_stride"
			var expected := "duskblade" if stride else "skirmisher"
			if u.unit_type == expected and u.phase_cooldown <= 0.0 and (ladder_rules or not stride):
				var old_pos: Vector2 = u["pos"]
				var delta_b: Vector2 = target_pos - old_pos
				if not ladder_rules and delta_b.length() > 18.0:
					delta_b = delta_b.normalized() * 18.0
				var dest := phase_destination if ladder_rules else _project_destination(old_pos, old_pos + delta_b, u.radius, true)
				u["pos"] = dest
				u["prev_pos"] = dest
				u["home_pos"] = dest
				u["phase_cooldown"] = LadderRules.SHADOW_STRIDE_COOLDOWN if stride else 7.0
				if stride:
					u.weapon_cooldown = maxf(u.weapon_cooldown, LadderRules.SHADOW_STRIDE_ATTACK_DELAY)
				u["orders"].clear()
				u["path"].clear()
				if players.has(u["owner"]):
					players[u["owner"]]["phase_steps_executed"] += 1
				emit_signal("unit_phased", old_pos, dest, u["tag"])
				emit_signal("ability_triggered", u, ctype, dest)
				accepted += 1
			continue

		elif ctype in ["emplace", "mobilize", "mobile_mode"]:
			var emplacing: bool = ctype == "emplace"
			if u.unit_type == ("howitzer" if emplacing else "howitzer_emplaced"):
				_morph_unit_in_place(u, "howitzer_emplaced" if emplacing else "howitzer")
				u.path.clear()
				u.attack_state = "idle"
				u.attack_target_tag = 0
				u.attack_state_timer = 0.0
				ability_triggered.emit(u, "emplace" if emplacing else "mobilize", u.pos)
				accepted += 1
			continue

		elif ctype in ["retract_silo", "extend_silo"]:
			var raising: bool = ctype == "extend_silo"
			if u.unit_type != ("silo_retracted" if raising else "silo") or u.build_progress < 1.0:
				continue
			if raising:
				var reason := silo_raise_block_reason(u)
				if not reason.is_empty():
					notice.emit(u.owner, reason, "warn")
					continue
				u["silo_raise_until"] = tick + SILO_RAISE_TICKS
			else:
				_morph_unit_in_place(u, "silo_retracted")
			ability_triggered.emit(u, ctype, u.pos)
			accepted += 1
			continue

		elif ctype.begins_with("train_"):
			var train_type = ctype.replace("train_", "")
			var producer: Dictionary = units.get(u.get("brood_parent", 0), {}) if u.unit_type == "brood_larva" else u
			var larva_tag: int = u.tag if u.unit_type == "brood_larva" else 0
			if not producer.is_empty() and _enqueue_unit_production(producer, train_type, larva_tag):
				accepted += 1
			continue
		elif ctype == "call_roadwardens":
			if campaign != null and campaign.evacuation != null and campaign.evacuation.call_roadwardens(self, u):
				accepted += 1
			continue

		elif ctype.begins_with("research_"):
			if _enqueue_research(u, ctype.trim_prefix("research_")):
				accepted += 1
			continue
		elif ctype == "fast_deploy":
			if accepted == 0 and _assign_fast_deployment(u, target_pos):
				accepted += 1
			continue

		elif ctype in ["cancel_training", "cancel_brood_egg"]:
			if ctype == "cancel_brood_egg" and u.unit_type != "brood_egg":
				continue
			var producer := u
			var index: int = int(extra) if not extra.is_empty() else u.production_queue.size() - 1
			if u.unit_type == "brood_egg" and u.get("brood_parent", 0) != 0:
				producer = units.get(u.brood_parent, {})
				index = _brood_egg_index(producer, u.tag)
			if not producer.is_empty() and (extra.is_empty() or extra.is_valid_int()) and _cancel_training(producer, index):
				accepted += 1
			continue

		elif ctype in ["rally", "rally_worker"]:
			if _set_rally(u, target_pos, target_tag, queue, ctype == "rally_worker"):
				accepted += 1
			continue

		elif ctype == "stop":
			_release_mining_slot(u)
			u.erase("choke_yield")
			u["orders"].clear()
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		elif ctype == "hold_position":
			_release_mining_slot(u)
			u.erase("choke_yield")
			u["orders"] = [{"type": "hold_position"}]
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		if not queue:
			_release_mining_slot(u)
			u.erase("choke_yield")
			u["orders"].clear()
			u["path"].clear()

		if ctype == "move":
			u["orders"].append({
				"type": "move",
				"target_pos": target_pos,
				"arrival_radius": dynamic_arrival
			})
			if formation != null and not u.is_structure and not u.is_immobile:
				u.orders.back()["_formation"] = formation
				u.orders.back()["arrival_radius"] = 0.9
			u["has_home_pos"] = false
			accepted += 1

		elif ctype == "patrol":
			u.orders.append({"type": "patrol", "target_pos": target_pos})
			u.has_home_pos = false
			accepted += 1

		elif ctype == "follow":
			_append_target_order(u, {"type": "follow", "target_tag": target_tag})
			u.has_home_pos = false
			accepted += 1

		elif ctype in ["enter_bunker", "enter_brood_tunnel", "enter_rampart"]:
			_append_target_order(u, {"type": ctype, "target_tag": target_tag, "target_pos": units[target_tag].pos})
			accepted += 1

		elif ctype in ["attack", "attack_move"]:
			if target_tag > 0 and units.has(target_tag):
				_append_target_order(u, {
					"type": "attack_target",
					"target_tag": target_tag,
					"target_pos": units[target_tag].pos
				})
			else:
				u["orders"].append({
					"type": "attack_move",
					"target_pos": target_pos,
					"arrival_radius": dynamic_arrival
				})
				if stay_on_route:
					u.orders.back()["stay_on_route"] = true
			accepted += 1

		elif ctype in ["attack_target", "force_attack"]:
			_append_target_order(u, {
				"type": ctype,
				"target_tag": target_tag,
				"target_pos": units[target_tag].pos
			})
			accepted += 1

		elif ctype == "harvest":
			var harvest_tag := target_tag
			var deposit: Dictionary = resources.get(target_tag, {})
			if group_size > 1 and not queue and deposit.get("resource_type") == "crystal_field":
				harvest_tag = _pick_local_crystal(u, deposit).tag
			if u.orders.is_empty():
				u["harvest_target_tag"] = harvest_tag
			_append_target_order(u, {
				"type": "harvest",
				"target_tag": harvest_tag
			})
			accepted += 1

		elif ctype == "resume_construction":
			var site: Dictionary = units[target_tag]
			u.orders.append({"type": "build", "structure_tag": site.tag, "target_pos": site.pos})
			if u.orders.size() == 1:
				site["builder_tag"] = u.tag
			accepted += 1

		elif ctype in ["repair", "restore_vitals", "restore_aegis", "inject_brood"]:
			u.orders.append({"type": ctype, "target_tag": target_tag})
			accepted += 1
		elif ctype == "unload_transport":
			u.orders.append({"type": ctype, "target_pos": target_pos})
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

func _cancel_queued_build(worker: Dictionary, point: Vector2, structure_type: String) -> bool:
	if not worker.is_worker:
		return false
	for index in worker.orders.size():
		var order: Dictionary = worker.orders[index]
		if (order.type != "build" or order.structure_tag != 0
				or order.target_pos != point or order.structure_type != structure_type):
			continue
		worker.orders.remove_at(index)
		if index == 0:
			worker.path.clear()
			worker.vel = Vector2.ZERO
			worker.erase("choke_yield")
		return true
	return false

func _append_target_order(unit: Dictionary, order: Dictionary) -> void:
	if not unit.orders.is_empty():
		order["waiting_for_turn"] = true
	unit.orders.append(order)

func _fill_gas(workers: Array[Dictionary], tap_tag: int) -> Dictionary:
	var tap: Dictionary = units.get(tap_tag, {})
	if tap.is_empty() or not tap.is_extractor or tap.hp <= 0.0:
		return {"ok": false, "accepted": 0}
	var vent_tag: int = _gas_source_by_tap.get(tap_tag, 0)
	var vent: Dictionary = resources.get(vent_tag, {})
	if vent.is_empty() or (not unlimited_resources and vent.amount <= 0):
		return {"ok": false, "accepted": 0}
	var assigned := {}
	for unit in units.values():
		if unit.owner == tap.owner and unit.is_worker:
			for order in unit.orders:
				if order.type == "harvest" and order.target_tag in [tap_tag, vent_tag]:
					assigned[unit.tag] = true
					break
	var slots := GAS_WORKER_SLOTS - assigned.size()
	var accepted := 0
	for worker in workers:
		if accepted >= slots:
			break
		if worker.is_worker and worker.owner == tap.owner and not assigned.has(worker.tag) and (worker.orders.is_empty() or worker.orders[0].type != "build"):
			if issue_command([worker.tag], "harvest", tap.pos, tap.tag).ok:
				accepted += 1
	return {"ok": accepted > 0, "accepted": accepted, "tick": tick}

func _is_friendly_mobile(unit: Dictionary, owner_id: int) -> bool:
	return not unit.is_empty() and unit.owner == owner_id and not unit.is_structure and unit.hp > 0.0 \
		and not unit.has("transit_finish") and not unit.has("recall_channel")

func warden_cast_block_reason(caster: Dictionary, cost: float) -> String:
	if caster.get("unit_type") != "aegis_warden" or caster.build_progress < 1.0:
		return "Select an Aegis Warden."
	if caster.energy < cost:
		return "Requires %d energy." % int(cost)
	return ""

func guardian_shield_ticks(caster: Dictionary) -> int:
	return maxi(0, int(guardian_shields.get(caster.tag, 0)) - tick)

func guardian_shield_block_reason(caster: Dictionary) -> String:
	if not ladder_rules:
		return "Guardian Shield is available under the ladder rules."
	if guardian_shield_ticks(caster) > 0:
		return "Guardian Shield is active."
	return warden_cast_block_reason(caster, LadderRules.GUARDIAN_SHIELD_COST)

func guardian_shield_radius() -> float:
	return LadderRules.GUARDIAN_SHIELD_RADIUS

func hallucination_block_reason(caster: Dictionary) -> String:
	if not ladder_rules or caster.get("hallucinated", false) or caster.get("is_immobile", false):
		return "Select an available ladder Aegis Warden."
	return warden_cast_block_reason(caster, LadderRules.HALLUCINATION_COST)

func hallucination_types() -> Array:
	return LadderRules.HALLUCINATIONS.keys()

func _cast_hallucination(caster: Dictionary, unit_type: String) -> bool:
	if not LadderRules.HALLUCINATIONS.has(unit_type) or not hallucination_block_reason(caster).is_empty():
		return false
	var definition := RTSData.get_unit_def(unit_type)
	var radius: float = definition.radius
	var flying := float(definition.get("flight_height", 0.0)) > 0.0
	var count: int = LadderRules.HALLUCINATIONS[unit_type].count
	var positions: Array[Vector2] = []
	for spoke in range(12):
		var direction := Vector2.from_angle(float(caster.facing) + spoke * TAU / 12.0)
		var point: Vector2 = caster.pos + direction * (caster.radius + radius + 1.5)
		if _map_clamped_position(point, radius) != point:
			continue
		if not flying and (_is_point_blocked_by_static(point, radius) or _ground_mobile_overlaps(point, radius)):
			continue
		if positions.any(func(other): return point.distance_squared_to(other) < (2.0 * radius) ** 2):
			continue
		positions.append(point)
		if positions.size() == count:
			break
	if positions.size() < count:
		return false
	caster.energy -= LadderRules.HALLUCINATION_COST
	for point in positions:
		spawn_unit(unit_type, caster.owner, point, "", 1.0, true)
	ability_triggered.emit(caster, "hallucination", caster.pos)
	return true

func phase_barrier_cast_range() -> float:
	return LadderRules.PHASE_BARRIER_CAST_RANGE if ladder_rules else PHASE_BARRIER_RANGE

func _guardian_covers(target: Dictionary) -> bool:
	if target.is_structure:
		return false
	for tag in guardian_shields:
		var caster: Dictionary = units.get(tag, {})
		if (not caster.is_empty() and caster.owner == target.owner and guardian_shield_ticks(caster) > 0
				and caster.pos.distance_squared_to(target.pos) <= LadderRules.GUARDIAN_SHIELD_RADIUS ** 2):
			return true
	return false

func _cast_phase_barrier(caster: Dictionary, point: Vector2) -> bool:
	if not warden_cast_block_reason(caster, PHASE_BARRIER_COST).is_empty() or not point.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(point):
		return false
	if caster.pos.distance_squared_to(point) > phase_barrier_cast_range() ** 2 or not can_see_position(caster.owner, point):
		return false
	var radius: float = RTSData.get_unit_def("phase_barrier").radius
	if _is_point_blocked_by_static(point, 0.0) or (not ladder_rules and _ground_mobile_overlaps(point, radius)):
		return false
	for unit in units.values():
		if not unit.is_structure or unit.is_walkable_structure or unit.flight_height > 0.0:
			continue
		var clearance: float = unit.radius + (radius if unit.unit_type == "phase_barrier" else 0.0)
		if unit.pos.distance_squared_to(point) < clearance * clearance:
			return false
	var crushed := false
	if ladder_rules:
		var occupants := units.values().filter(func(unit):
			return (not unit.is_structure and unit.flight_height <= 0.0 and not unit.get("burrowed", false)
				and not unit.get("nonblocking", false) and unit.pos.distance_squared_to(point) < (radius + unit.radius) ** 2))
		crushed = occupants.any(func(unit): return unit.attributes.has("Massive"))
		if not crushed and not _displace_phase_barrier_occupants(occupants, caster, point, radius):
			return false
	if not crushed:
		var barrier := spawn_unit("phase_barrier", 0, point)
		barrier["cast_owner"] = caster.owner
	caster.energy -= PHASE_BARRIER_COST
	ability_triggered.emit(caster, "phase_barrier", point)
	return true

func _displace_phase_barrier_occupants(occupants: Array, caster: Dictionary, point: Vector2, radius: float) -> bool:
	var destinations: Array[Dictionary] = []
	for unit in occupants:
		var offset: Vector2 = unit.pos - point
		var heading: float = caster.facing if offset.is_zero_approx() else offset.angle()
		var body: float = unit.radius
		var destination := Vector2.INF
		for spoke in range(12):
			var candidate := point + Vector2.from_angle(heading + spoke * TAU / 12.0) * (radius + body + 0.12)
			if (_map_clamped_position(candidate, body) != candidate or _ground_mobile_overlaps(candidate, body, unit.tag)
					or not _has_clear_line_of_walk(unit.pos, candidate, body, unit.get("cliff_walk", false))):
				continue
			if destinations.any(func(entry): return candidate.distance_squared_to(entry.pos) < (body + entry.unit.radius) ** 2):
				continue
			destination = candidate
			break
		if not destination.is_finite():
			return false
		destinations.append({"unit": unit, "pos": destination})
	for entry in destinations:
		entry.unit.pos = entry.pos
		entry.unit.prev_pos = entry.pos
		entry.unit.vel = Vector2.ZERO
		entry.unit.path.clear()
	return true

func visible_phase_barriers(perspective: int) -> Array[Dictionary]:
	var visible: Array[Dictionary] = []
	for unit in units.values():
		if unit.unit_type != "phase_barrier" or not unit.has("expires_tick"):
			continue
		if unit.get("cast_owner") == perspective or can_see_position(perspective, unit.pos):
			visible.append({"x": unit.pos.x, "y": unit.pos.y, "radius": unit.radius, "ticks": maxi(0, int(unit.expires_tick) - tick)})
	return visible

func _cast_lattice_burst(caster: Dictionary, point: Vector2) -> bool:
	if not warden_cast_block_reason(caster, LATTICE_BURST_COST).is_empty() or not point.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(point):
		return false
	if caster.pos.distance_squared_to(point) > LATTICE_BURST_RANGE * LATTICE_BURST_RANGE or not can_see_position(caster.owner, point):
		return false
	var starts := tick + LATTICE_BURST_WARNING_TICKS
	lattice_bursts.append({"pos": point, "source": caster, "starts": starts, "ends": starts + LATTICE_BURST_DURATION_TICKS})
	caster.energy -= LATTICE_BURST_COST
	ability_triggered.emit(caster, "lattice_burst", point)
	return true

func ridge_charge_remaining(unit: Dictionary) -> float:
	return float(maxi(0, int(unit.get("ridge_charge_ready", 0)) - tick)) * TICK_DT

func _throw_ridge_charge(scout: Dictionary, point: Vector2) -> bool:
	if scout.unit_type != "ridge_scout" or ridge_charge_remaining(scout) > 0.0:
		return false
	if not point.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(point) or not can_see_position(scout.owner, point):
		return false
	if scout.pos.distance_squared_to(point) > RIDGE_CHARGE_RANGE * RIDGE_CHARGE_RANGE:
		return false
	scout["ridge_charge_ready"] = tick + RIDGE_CHARGE_COOLDOWN_TICKS
	ridge_charges.append({"source": scout, "pos": point, "burst_tick": tick + RIDGE_CHARGE_DELAY_TICKS})
	ability_triggered.emit(scout, "ridge_charge", point)
	return true

func _step_ridge_charges() -> void:
	while not ridge_charges.is_empty() and tick >= int(ridge_charges[0].burst_tick):
		var charge: Dictionary = ridge_charges.pop_front()
		var center: Vector2 = charge.pos
		# Positions have already advanced for this tick.
		var targets := units.values()
		targets.sort_custom(func(a, b): return a.tag < b.tag)
		for target in targets:
			if target.hp <= 0.0 or target.owner == 0 or target.is_structure or target.flight_height > 0.0:
				continue
			if target.pos.distance_squared_to(center) > RIDGE_CHARGE_RADIUS * RIDGE_CHARGE_RADIUS:
				continue
			_apply_damage_to_target(charge.source, target, 5.0, {}, 1.0, true)
			if target.hp <= 0.0 or target.get("burrowed", false) or target.attributes.has("Massive") or target.is_immobile:
				continue
			var away: Vector2 = center.direction_to(target.pos)
			if away.is_zero_approx():
				away = Vector2.RIGHT.rotated(target.facing)
			target.pos = _clamp_to_walkable(target.pos + away * 3.0, target.radius, target.get("cliff_walk", false), target.pos)
			target.path.clear()
			target.pushed_timer = 0.35
		ability_triggered.emit(charge.source, "ridge_charge_impact", center)

func visible_ridge_charges(perspective: int) -> Array[Dictionary]:
	var visible: Array[Dictionary] = []
	for charge in ridge_charges:
		if perspective == charge.source.owner or can_see_position(perspective, charge.pos):
			visible.append({"pos": charge.pos, "ticks": int(charge.burst_tick) - tick})
	return visible

func visible_lattice_bursts(perspective: int) -> Array[Dictionary]:
	var visible: Array[Dictionary] = []
	for zone in lattice_bursts:
		if perspective == 0 or zone.source.owner == perspective or can_see_position(perspective, zone.pos):
			var warning := tick < int(zone.starts)
			visible.append({"x": zone.pos.x, "y": zone.pos.y, "radius": LATTICE_BURST_RADIUS,
				"warning": warning, "ticks": int(zone.starts if warning else zone.ends) - tick})
	return visible

func _step_lattice_bursts() -> void:
	for i in range(lattice_bursts.size() - 1, -1, -1):
		var zone: Dictionary = lattice_bursts[i]
		if tick >= int(zone.ends):
			lattice_bursts.remove_at(i)
		elif tick >= int(zone.starts) and (tick - int(zone.starts)) % LATTICE_BURST_PULSE_TICKS == 0:
			# Check positions after movement. Neither ownership nor altitude
			# protects a mobile unit whose center is still inside the warning.
			var targets := units.values()
			targets.sort_custom(func(a, b): return a.tag < b.tag)
			for target in targets:
				if target.owner > 0 and not target.is_structure and target.pos.distance_squared_to(zone.pos) <= LATTICE_BURST_RADIUS * LATTICE_BURST_RADIUS:
					_apply_damage_to_target(zone.source, target, LATTICE_BURST_DAMAGE, {}, 1.0)

func miasma_block_reason(caster: Dictionary) -> String:
	if caster.unit_type != "blight_hurler":
		return "Select a Blight Hurler."
	if not has_tech_structure(caster.owner, "blight_spire"):
		return "Requires a completed Blight Spire."
	if caster.energy < MIASMA_COST:
		return "Requires 50 energy."
	return ""

func _cast_miasma(caster: Dictionary, point: Vector2) -> bool:
	if not miasma_block_reason(caster).is_empty() or not point.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(point):
		return false
	if caster.pos.distance_to(point) > MIASMA_RANGE or not can_see_position(caster.owner, point) or is_water_at(point):
		return false
	var starts := tick + MIASMA_WARNING_TICKS
	miasma_zones.append({"pos": point, "source": caster, "starts": starts, "ends": starts + MIASMA_DURATION_TICKS})
	caster.energy -= MIASMA_COST
	ability_triggered.emit(caster, "corrosive_miasma", point)
	return true

func visible_miasma(perspective: int) -> Array[Dictionary]:
	var visible: Array[Dictionary] = []
	for zone in miasma_zones:
		if perspective == 0 or zone.source.owner == perspective or can_see_position(perspective, zone.pos):
			visible.append({"x": zone.pos.x, "y": zone.pos.y, "radius": MIASMA_RADIUS,
				"warning": tick < int(zone.starts), "ticks": int(zone.starts if tick < int(zone.starts) else zone.ends) - tick})
	return visible

func _step_miasma() -> void:
	for i in range(miasma_zones.size() - 1, -1, -1):
		var zone: Dictionary = miasma_zones[i]
		if tick >= int(zone.ends):
			miasma_zones.remove_at(i)
		elif tick >= int(zone.starts) and (tick - int(zone.starts)) % TICK_RATE == 0:
			var targets := query_units_in_radius(zone.pos, MIASMA_RADIUS, zone.source.owner)
			targets.sort_custom(func(a, b): return a.tag < b.tag)
			for target in targets:
				if target.owner > 0 and not target.is_structure and target.flight_height <= 0.0 and target.pos.distance_to(zone.pos) <= MIASMA_RADIUS:
					target.slow_timer = maxf(target.slow_timer, 1.0)
					_apply_damage_to_target(zone.source, target, 9.0, {}, 1.0)

func canticle_storm_block_reason(caster: Dictionary) -> String:
	if caster.unit_type != "storm_scribe" or caster.is_immobile:
		return "Select an available Storm Scribe."
	if not players.get(caster.owner, {}).get("upgrades", {}).get("canticle_storm", 0):
		return "Requires Canticle Storm research at a Canticle Archive."
	if caster.energy < LadderRules.STORM_ENERGY:
		return "Requires 75 energy."
	if tick < int(caster.get("canticle_storm_ready", 0)):
		return "Canticle Storm is recharging."
	return ""

func canticle_storm_radius() -> float:
	return LadderRules.STORM_RADIUS

func _cast_canticle_storm(caster: Dictionary, point: Vector2) -> bool:
	if not canticle_storm_block_reason(caster).is_empty() or not point.is_finite():
		return false
	if not Rect2(0, 0, map_width, map_height).has_point(point) or not can_see_position(caster.owner, point) \
			or caster.pos.distance_squared_to(point) > LadderRules.STORM_RANGE ** 2:
		return false
	caster.energy -= LadderRules.STORM_ENERGY
	caster["canticle_storm_ready"] = tick + ceili(LadderRules.STORM_COOLDOWN * TICK_RATE)
	canticle_storms.append({"pos": point, "source": caster, "ends": tick + LadderRules.STORM_SECONDS * TICK_RATE})
	ability_triggered.emit(caster, "canticle_storm", point)
	return true

func _cast_scribe_feedback(caster: Dictionary, target: Dictionary) -> bool:
	if caster.unit_type != "storm_scribe" or caster.is_immobile or caster.energy < LadderRules.FEEDBACK_ENERGY:
		return false
	if (target.is_empty() or target.owner <= 0 or target.owner == caster.owner or target.is_structure or target.energy <= 0.0
			or target.get("nonblocking", false) or not can_see_unit(caster.owner, target)
			or _edge_distance(caster, target) > LadderRules.FEEDBACK_RANGE):
		return false
	caster.energy -= LadderRules.FEEDBACK_ENERGY
	var damage: float = target.energy * 0.5
	target.energy = 0.0
	_apply_damage_to_target(caster, target, damage, {}, 1.0, true)
	ability_triggered.emit(caster, "scribe_feedback", target.pos)
	return true

func visible_canticle_storms(perspective: int) -> Array[Dictionary]:
	return canticle_storms.filter(func(zone):
		return zone.source.owner == perspective or can_see_position(perspective, zone.pos))

func _step_canticle_storms() -> void:
	var pulse_interval := TICK_RATE / 4
	var damage := LadderRules.STORM_DAMAGE / (LadderRules.STORM_SECONDS * 4.0)
	var hit: Dictionary = {}
	for index in range(canticle_storms.size() - 1, -1, -1):
		var zone := canticle_storms[index]
		if tick > int(zone.ends):
			canticle_storms.remove_at(index)
		elif tick % pulse_interval == 0:
			var targets := query_units_in_radius(zone.pos, LadderRules.STORM_RADIUS)
			targets.sort_custom(func(a, b): return a.tag < b.tag)
			for target in targets:
				if target.is_structure or target.hp <= 0.0 or target.get("nonblocking", false) or hit.has(target.tag):
					continue
				if target.pos.distance_squared_to(zone.pos) <= LadderRules.STORM_RADIUS ** 2:
					hit[target.tag] = true
					_apply_damage_to_target(zone.source, target, damage, {}, 1.0, true)

func mireweaver_spell_block_reason(caster: Dictionary, spell: String) -> String:
	if not ladder_rules or caster.unit_type != "mireweaver" or caster.is_immobile or caster.get("burrowed", false):
		return "Select a surfaced Mireweaver."
	if spell == "microbial_shroud" and not players[caster.owner].upgrades.get("microbial_shroud", 0):
		return "Evolve Microbial Shroud at an Infestation Pit."
	var cost := LadderRules.MICROBIAL_SHROUD_COST if spell == "microbial_shroud" else LadderRules.FUNGAL_GRASP_COST
	return "Requires %d energy." % cost if caster.energy < cost else ""

func _cast_mireweaver_spell(caster: Dictionary, spell: String, point: Vector2) -> bool:
	if not point.is_finite() or not mireweaver_spell_block_reason(caster, spell).is_empty():
		return false
	var shroud := spell == "microbial_shroud"
	var cast_range := LadderRules.MICROBIAL_SHROUD_RANGE if shroud else LadderRules.FUNGAL_GRASP_RANGE
	var distance: float = caster.pos.distance_to(point)
	if distance > cast_range or not can_see_position(caster.owner, point):
		return false
	caster.energy -= LadderRules.MICROBIAL_SHROUD_COST if shroud else LadderRules.FUNGAL_GRASP_COST
	if shroud:
		microbial_shrouds.append({"pos": point, "ends": tick + LadderRules.MICROBIAL_SHROUD_SECONDS * TICK_RATE})
	else:
		var travel_ticks := maxi(1, ceili(distance * TICK_RATE / LadderRules.FUNGAL_GRASP_PROJECTILE_SPEED))
		fungal_projectiles.append({"pos": point, "source": caster, "impact": tick + travel_ticks})
		projectile_fired.emit(caster.pos, point, "Fungal Grasp", true, caster.owner)
	ability_triggered.emit(caster, spell, point)
	return true

func fungal_grasp_active(unit: Dictionary) -> bool:
	return int(fungal_infections.get(unit.get("tag", 0), {}).get("ends", 0)) > tick

func _step_fungal_grasp() -> void:
	var interval := TICK_RATE / 4
	for index in range(fungal_projectiles.size() - 1, -1, -1):
		var shot := fungal_projectiles[index]
		if tick < int(shot.impact):
			continue
		fungal_projectiles.remove_at(index)
		ability_triggered.emit(shot.source, "fungal_impact", shot.pos)
		for target in query_units_in_radius(shot.pos, LadderRules.FUNGAL_GRASP_RADIUS, shot.source.owner):
			if (target.owner <= 0 or target.is_structure or target.hp <= 0.0 or target.get("nonblocking", false)
					or target.pos.distance_squared_to(shot.pos) > LadderRules.FUNGAL_GRASP_RADIUS ** 2):
				continue
			var next_pulse := int(fungal_infections.get(target.tag, {}).get("pulse", tick + interval))
			fungal_infections[target.tag] = {"source": shot.source, "pulse": next_pulse,
				"ends": tick + LadderRules.FUNGAL_GRASP_SECONDS * TICK_RATE}
	var tags := fungal_infections.keys()
	tags.sort()
	for tag in tags:
		var infection: Dictionary = fungal_infections[tag]
		var target: Dictionary = units.get(tag, {})
		if target.is_empty() or target.hp <= 0.0 or tick > int(infection.ends):
			fungal_infections.erase(tag)
		elif tick >= int(infection.pulse):
			infection.pulse += interval
			_apply_damage_to_target(infection.source, target, LadderRules.FUNGAL_GRASP_DAMAGE / (LadderRules.FUNGAL_GRASP_SECONDS * 4), {}, 1.0, true)

func visible_microbial_shrouds(perspective: int) -> Array[Dictionary]:
	return microbial_shrouds.filter(func(zone): return can_see_position(perspective, zone.pos))

func _microbial_shroud_covers(target: Dictionary) -> bool:
	if target.is_structure or target.flight_height > 0.0:
		return false
	return microbial_shrouds.any(func(zone):
		return tick < int(zone.ends) and target.pos.distance_squared_to(zone.pos) <= LadderRules.MICROBIAL_SHROUD_RADIUS ** 2)

func neural_tether_block_reason(caster: Dictionary) -> String:
	if not ladder_rules or caster.unit_type != "mireweaver" or caster.is_immobile or caster.has("burrow_transition"):
		return "Select an available Mireweaver."
	if not players[caster.owner].upgrades.get("neural_tether", 0):
		return "Evolve Neural Tether at an Infestation Pit."
	return "Requires 100 energy." if caster.energy < LadderRules.NEURAL_TETHER_COST else ""

func _cast_neural_tether(caster: Dictionary, target: Dictionary) -> bool:
	if not neural_tether_block_reason(caster).is_empty() or target.is_empty():
		return false
	if (target.owner <= 0 or target.owner == caster.owner or target.hp <= 0.0 or target.is_structure
			or target.attributes.has("Heroic") or _is_frenzied(target) or target.get("nonblocking", false)
			or target.unit_type in ["brood_egg", "brood_larva", "pursuit_fighter"] or target.has("brood_morph")
			or target.has("neural_original_owner") or neural_tethers.has(target.tag)
			or not can_see_unit(caster.owner, target) or _edge_distance(caster, target) > LadderRules.NEURAL_TETHER_RANGE):
		return false
	caster.energy -= LadderRules.NEURAL_TETHER_COST
	_clear_controlled_unit_orders(caster)
	caster.is_immobile = true
	_clear_controlled_unit_orders(target)
	target["neural_caster"] = caster.tag
	target["neural_original_owner"] = target.owner
	target.owner = caster.owner
	neural_tethers[caster.tag] = {"target": target.tag, "ends": tick + LadderRules.NEURAL_TETHER_SECONDS * TICK_RATE}
	_rebuild_spatial_grid()
	_refresh_vision()
	ability_triggered.emit(caster, "neural_tether", target.pos)
	return true

func _step_neural_tethers() -> void:
	var tags := neural_tethers.keys()
	tags.sort()
	for tag in tags:
		var tether: Dictionary = neural_tethers[tag]
		var caster: Dictionary = units.get(tag, {})
		var target: Dictionary = units.get(tether.target, {})
		if (caster.is_empty() or target.is_empty() or tick >= int(tether.ends)
				or _edge_distance(caster, target) > LadderRules.NEURAL_TETHER_LEASH):
			_end_neural_tether(tag)

func _end_neural_tether(tag: int) -> void:
	if not neural_tethers.has(tag):
		return
	var tether: Dictionary = neural_tethers[tag]
	neural_tethers.erase(tag)
	var caster: Dictionary = units.get(tag, {})
	if not caster.is_empty():
		caster.is_immobile = false
	var target: Dictionary = units.get(tether.target, {})
	if not target.is_empty():
		_clear_controlled_unit_orders(target)
		target.owner = target.neural_original_owner
		target.erase("neural_original_owner")
		target.erase("neural_caster")
	_rebuild_spatial_grid()
	_refresh_vision()

func _clear_controlled_unit_orders(unit: Dictionary) -> void:
	if unit.is_worker:
		_release_mining_slot(unit)
	unit.orders.clear()
	unit.path.clear()
	unit.vel = Vector2.ZERO
	unit.attack_state = "idle"
	unit.attack_state_timer = 0.0
	unit.attack_target_tag = 0
	unit.has_home_pos = false
	unit.erase("choke_yield")

func gravity_lift_block_reason(interceptor: Dictionary) -> String:
	if not ladder_rules or interceptor.unit_type != "dawn_interceptor" or interceptor.is_immobile:
		return "Select an available Dawn Interceptor."
	return "Requires 50 energy." if interceptor.energy < LadderRules.GRAVITY_LIFT_COST else ""

func _begin_gravity_lift(interceptor: Dictionary, target: Dictionary) -> bool:
	if not gravity_lift_block_reason(interceptor).is_empty() or target.is_empty():
		return false
	if (target.owner <= 0 or target.owner == interceptor.owner or target.hp <= 0.0 or target.is_structure or target.flight_height > 0.0
			or target.attributes.has("Massive") or target.attributes.has("Heroic") or target.get("nonblocking", false)
			or target.get("burrowed", false) or target.has("burrow_transition") or target.has("recall_channel")
			or target.unit_type in ["brood_larva", "brood_egg"] or not can_see_unit(interceptor.owner, target)
			or _edge_distance(interceptor, target) > LadderRules.GRAVITY_LIFT_RANGE):
		return false
	if neural_tethers.has(target.tag):
		_end_neural_tether(target.tag)
	_interrupt_displaced_channels(target)
	_clear_controlled_unit_orders(interceptor)
	_clear_controlled_unit_orders(target)
	interceptor.energy -= LadderRules.GRAVITY_LIFT_COST
	interceptor.facing = interceptor.pos.direction_to(target.pos).angle()
	interceptor.is_immobile = true
	interceptor["gravity_lift_target"] = target.tag
	interceptor["gravity_lift_ends"] = tick + ceili(LadderRules.GRAVITY_LIFT_SECONDS * TICK_RATE)
	target["gravity_lifted_by"] = interceptor.tag
	target["gravity_was_immobile"] = target.is_immobile
	target.is_immobile = true
	target.flight_height = get_elevation_at(target.pos) + 3.6
	ability_triggered.emit(interceptor, "gravity_lift", target.pos)
	return true

func _end_gravity_lift(interceptor: Dictionary) -> void:
	var target: Dictionary = units.get(interceptor.gravity_lift_target, {})
	interceptor.erase("gravity_lift_target")
	interceptor.erase("gravity_lift_ends")
	interceptor.is_immobile = false
	if target.is_empty():
		return
	target.flight_height = 0.0
	target.is_immobile = target.gravity_was_immobile
	target.erase("gravity_lifted_by")
	target.erase("gravity_was_immobile")

func prism_alignment_block_reason(ray: Dictionary) -> String:
	if not ladder_rules or ray.unit_type != "prism_ray":
		return "Select a Prism Ray."
	var remaining := int(ray.get("alignment_ready", 0)) - tick
	return "Prismatic Alignment ready in %d s." % ceili(remaining * TICK_DT) if remaining > 0 else ""

func carrier_fighter_count(carrier: Dictionary) -> int:
	return int(carrier.get("fighter_reserve", 0)) + carrier.get("active_fighters", []).size()

func pursuit_fighter_block_reason(carrier: Dictionary) -> String:
	if not ladder_rules or carrier.unit_type != "fleet_carrier":
		return "Select a Fleet Carrier."
	if carrier_fighter_count(carrier) + int(carrier.fighter_orders) >= LadderRules.CARRIER_FIGHTER_CAP:
		return "The hangar has reached its eight-fighter limit."
	return "Requires 15 crystal." if players[carrier.owner].crystal < LadderRules.CARRIER_FIGHTER_COST else ""

func _enqueue_pursuit_fighter(carrier: Dictionary) -> bool:
	if not pursuit_fighter_block_reason(carrier).is_empty():
		return false
	players[carrier.owner].crystal -= LadderRules.CARRIER_FIGHTER_COST
	carrier.fighter_orders += 1
	if not carrier.has("fighter_finish"):
		carrier["fighter_finish"] = tick + LadderRules.CARRIER_FIGHTER_BUILD_SECONDS * TICK_RATE
	return true

func _step_fleet_hangar(carrier: Dictionary) -> void:
	if carrier.has("fighter_finish") and tick >= int(carrier.fighter_finish):
		carrier.fighter_reserve += 1
		carrier.fighter_orders -= 1
		carrier.erase("fighter_finish")
		if carrier.fighter_orders > 0:
			carrier["fighter_finish"] = tick + LadderRules.CARRIER_FIGHTER_BUILD_SECONDS * TICK_RATE
	if carrier.auto_build_fighters and carrier.fighter_orders == 0:
		_enqueue_pursuit_fighter(carrier)
	var target: Dictionary = units.get(carrier.get("fighter_target", 0), {})
	if _carrier_can_engage(carrier, target):
		_launch_pursuit_fighter(carrier, target)
	else:
		carrier.erase("fighter_target")

func _carrier_can_engage(carrier: Dictionary, target: Dictionary) -> bool:
	return (not target.is_empty() and target.hp > 0.0 and target.owner != carrier.owner
		and _edge_distance(carrier, target) <= LadderRules.CARRIER_FIGHTER_LEASH and can_see_unit(carrier.owner, target))

func _launch_pursuit_fighter(carrier: Dictionary, target: Dictionary) -> bool:
	if (carrier.fighter_reserve <= 0 or tick < int(carrier.get("fighter_launch_ready", 0))
			or not _carrier_can_engage(carrier, target) or _edge_distance(carrier, target) > weapon_range_against(carrier, target)):
		return false
	var fighter := spawn_unit("pursuit_fighter", carrier.owner, carrier.pos)
	fighter["carrier_parent"] = carrier.tag
	fighter["fighter_target"] = target.tag
	carrier.active_fighters.append(fighter.tag)
	carrier.fighter_reserve -= 1
	carrier["fighter_launch_ready"] = tick + ceili(LadderRules.CARRIER_LAUNCH_INTERVAL * TICK_RATE)
	ability_triggered.emit(carrier, "pursuit_fighter_launch", carrier.pos)
	return true

func _step_pursuit_fighter(fighter: Dictionary, dt: float) -> void:
	var carrier: Dictionary = units.get(fighter.get("carrier_parent", 0), {})
	if carrier.is_empty():
		_remove_destroyed_unit(fighter)
		return
	var target: Dictionary = units.get(carrier.get("fighter_target", 0), {})
	if _carrier_can_engage(carrier, target):
		var distance := _edge_distance(fighter, target)
		if fighter.weapon_cooldown <= 0.0 and distance <= weapon_range_against(fighter, target):
			if _execute_weapon_hit(fighter, target):
				fighter.weapon_cooldown = _weapon_period(fighter, _active_weapon(fighter, target))
		if distance > 1.0:
			_move_toward_point(fighter, target.pos, dt)
		else:
			var angle := tick * TICK_DT * 3.0 + int(fighter.tag % 8) * TAU / 8.0
			_move_toward_point(fighter, target.pos + Vector2.from_angle(angle) * (float(target.radius) + 2.2), dt)
		return
	if _edge_distance(fighter, carrier) <= 1.0:
		carrier.active_fighters.erase(fighter.tag)
		carrier.fighter_reserve += 1
		units.erase(fighter.tag)
	else:
		_move_toward_point(fighter, carrier.pos, dt)

func flagship_production_block_reason(owner: int) -> String:
	var flagship: Dictionary = units.get(players[owner].get("crownspire_tag", 0), {})
	if not flagship.is_empty():
		return "Only one Crownspire can be active."
	for unit in units.values():
		if unit.owner == owner and unit.unit_type == "heartstone" and unit.production_queue.any(func(item): return item.get("unit_type") == "crownspire"):
			return "A Crownspire is already in production."
	return ""

func flagship_spell_block_reason(flagship: Dictionary, spell: String) -> String:
	if not ladder_rules or flagship.unit_type != "crownspire" or flagship.is_immobile:
		return "Select an available Crownspire."
	var remaining := int(flagship.get(spell + "_ready", 0)) - tick
	return "Ready in %d s." % ceili(remaining * TICK_DT) if remaining > 0 else ""

func _cast_flagship_spell(flagship: Dictionary, spell: String, point: Vector2) -> bool:
	if not flagship_spell_block_reason(flagship, spell).is_empty():
		return false
	match spell:
		"flagship_cloak":
			point = flagship.pos
			flagship["flagship_cloak_until"] = tick + LadderRules.FLAGSHIP_CLOAK_SECONDS * TICK_RATE
			flagship["flagship_cloak_ready"] = tick + LadderRules.FLAGSHIP_CLOAK_COOLDOWN * TICK_RATE
		"time_warp":
			if (not point.is_finite() or flagship.pos.distance_squared_to(point) > LadderRules.TIME_WARP_RANGE ** 2
					or not can_see_position(flagship.owner, point)):
				return false
			var activates := tick + ceili(LadderRules.TIME_WARP_ARMING * TICK_RATE)
			time_warps.append({"pos": point, "owner": flagship.owner, "activates": activates,
				"ends": activates + LadderRules.TIME_WARP_SECONDS * TICK_RATE})
			flagship["time_warp_ready"] = tick + LadderRules.TIME_WARP_COOLDOWN * TICK_RATE
		"flagship_recall":
			if not _cast_defensive_recall(flagship, point, true):
				return false
			flagship["flagship_recall_ready"] = tick + LadderRules.FLAGSHIP_RECALL_COOLDOWN * TICK_RATE
	ability_triggered.emit(flagship, spell, point)
	return true

func flagship_cloaks(unit: Dictionary) -> bool:
	if not ladder_rules or unit.faction != RTSData.FACTION_ALIENS or unit.unit_type == "crownspire":
		return false
	var flagship: Dictionary = units.get(players.get(unit.owner, {}).get("crownspire_tag", 0), {})
	return (not flagship.is_empty() and flagship.hp > 0.0 and int(flagship.get("flagship_cloak_until", 0)) > tick
		and unit.pos.distance_squared_to(flagship.pos) <= LadderRules.FLAGSHIP_CLOAK_RADIUS ** 2)

func _time_warp_covers(unit: Dictionary) -> bool:
	return time_warps.any(func(zone):
		return (zone.owner != unit.owner and tick >= int(zone.activates) and tick < int(zone.ends)
			and unit.pos.distance_squared_to(zone.pos) <= float(zone.get("radius", LadderRules.TIME_WARP_RADIUS)) ** 2))

func _apply_flagship_secondary_targets(flagship: Dictionary, primary: Dictionary, weapon: Dictionary) -> void:
	var range_limit := weapon_range_against(flagship, primary)
	var targets := query_units_in_radius(flagship.pos, range_limit, flagship.owner).filter(func(unit):
		return (unit.tag != primary.tag and unit.hp > 0.0 and is_hostile_contact(flagship.owner, unit)
			and _weapon_can_hit(weapon, unit) and _edge_distance(flagship, unit) <= range_limit and can_see_unit(flagship.owner, unit)))
	targets.sort_custom(func(a, b):
		var da: float = flagship.pos.distance_squared_to(a.pos)
		var db: float = flagship.pos.distance_squared_to(b.pos)
		return a.tag < b.tag if da == db else da < db)
	var secondary := weapon.duplicate()
	secondary.erase("secondary_targets")
	for index in range(mini(targets.size(), int(weapon.secondary_targets))):
		_execute_weapon_hit(flagship, targets[index], {}, secondary)

func sunseer_spell_block_reason(caster: Dictionary, spell: String) -> String:
	if not ladder_rules or caster.unit_type != "sunseer" or caster.is_immobile:
		return "Select an available Sunseer."
	if spell == "end_pulsar_beam":
		return ""
	if spell == "pulsar_beam" and caster.get("pulsar_active", false):
		return "The Pulsar Beam is already active."
	if spell == "revelation" and int(caster.get("revelation_ready", 0)) > tick:
		return "Revelation is recharging."
	return "Requires 25 energy." if caster.energy < LadderRules.ORACLE_CAST_ENERGY else ""

func _cast_sunseer_spell(caster: Dictionary, spell: String, point: Vector2) -> bool:
	if not sunseer_spell_block_reason(caster, spell).is_empty():
		return false
	match spell:
		"pulsar_beam":
			caster["pulsar_active"] = true
			point = caster.pos
		"end_pulsar_beam":
			_disable_pulsar_beam(caster)
			return true
		"revelation":
			if (not point.is_finite() or caster.pos.distance_squared_to(point) > LadderRules.REVELATION_RANGE ** 2
					or not can_see_position(caster.owner, point)):
				return false
			_rebuild_spatial_grid()
			for enemy in query_units_in_radius(point, LadderRules.REVELATION_RADIUS, caster.owner):
				if enemy.owner <= 0 or enemy.pos.distance_squared_to(point) > LadderRules.REVELATION_RADIUS ** 2:
					continue
				if not enemy.has("revealed_to"):
					enemy["revealed_to"] = {}
				enemy.revealed_to[caster.owner] = tick + LadderRules.REVELATION_SECONDS * TICK_RATE
			caster["revelation_ready"] = tick + LadderRules.REVELATION_COOLDOWN * TICK_RATE
		"seed_stasis_ward":
			if (not point.is_finite() or caster.pos.distance_squared_to(point) > LadderRules.STASIS_WARD_RANGE ** 2
					or not can_see_position(caster.owner, point) or not can_place_structure("stasis_ward", point)):
				return false
			var ward := spawn_unit("stasis_ward", caster.owner, point, "", 0.0)
			ward["auto_summon"] = true
	caster.energy -= LadderRules.ORACLE_CAST_ENERGY
	ability_triggered.emit(caster, spell, point)
	return true

func _disable_pulsar_beam(caster: Dictionary) -> void:
	caster.erase("pulsar_active")
	caster.attack_state = "idle"
	caster.attack_state_timer = 0.0

func _step_stasis_ward(ward: Dictionary) -> void:
	if tick % 4 != int(ward.tag) % 4:
		return
	var nearby := query_units_in_radius(ward.pos, LadderRules.STASIS_WARD_RADIUS, ward.owner).filter(func(unit):
		return (unit.owner > 0 and unit.hp > 0.0 and not unit.is_structure and unit.flight_height <= 0.0
			and not _is_frenzied(unit) and not unit.get("nonblocking", false)
			and int(unit.get("stasis_until", 0)) <= tick and unit.pos.distance_squared_to(ward.pos) <= LadderRules.STASIS_WARD_RADIUS ** 2))
	if not nearby.any(func(unit):
		return (unit.pos.distance_squared_to(ward.pos) <= LadderRules.STASIS_TRIGGER_RADIUS ** 2 and can_see_unit(ward.owner, unit))):
		return
	var until := tick + ceili(LadderRules.STASIS_SECONDS * TICK_RATE)
	for unit in nearby:
		if neural_tethers.has(unit.tag):
			_end_neural_tether(unit.tag)
		_interrupt_displaced_channels(unit)
		_clear_controlled_unit_orders(unit)
		unit["stasis_was_immobile"] = unit.is_immobile
		unit["stasis_until"] = until
		unit.is_immobile = true
	ability_triggered.emit(ward, "stasis_ward_detonate", ward.pos)
	units.erase(ward.tag)

func agent_spell_block_reason(agent: Dictionary, spell: String) -> String:
	if not ladder_rules or agent.unit_type != "shade_agent" or agent.is_immobile:
		return "Select an available Shade Agent."
	if spell == "agent_strike":
		return "Arm a Tactical Charge at a Specter Academy." if _ready_tactical_charge(agent.owner).is_empty() else ""
	if spell == "agent_cloak":
		if agent.get("cloaked", false):
			return ""
		if not players[agent.owner].upgrades.get("agent_cloak", 0):
			return "Research Personal Cloaking at the Specter Academy."
	var cost: float = {"agent_cloak": LadderRules.AGENT_CLOAK_COST, "agent_snipe": LadderRules.AGENT_SNIPE_COST,
		"agent_emp": LadderRules.AGENT_EMP_COST}[spell]
	return "Requires %d energy." % cost if agent.energy < cost else ""

func _cast_agent_spell(agent: Dictionary, spell: String, point: Vector2, target: Dictionary) -> bool:
	if not agent_spell_block_reason(agent, spell).is_empty():
		return false
	match spell:
		"agent_cloak":
			_toggle_personal_cloak(agent)
			point = agent.pos
		"agent_snipe":
			if not _valid_agent_snipe_target(agent, target, LadderRules.AGENT_SNIPE_RANGE):
				return false
			agent.energy -= LadderRules.AGENT_SNIPE_COST
			_clear_controlled_unit_orders(agent)
			agent.is_immobile = true
			point = target.pos
			agent.facing = agent.pos.direction_to(point).angle()
			agent["agent_snipe"] = {"target": target.tag, "ends": tick + ceili(LadderRules.AGENT_SNIPE_SECONDS * TICK_RATE)}
		"agent_emp":
			if (not point.is_finite() or agent.pos.distance_squared_to(point) > LadderRules.AGENT_EMP_RANGE ** 2
					or not can_see_position(agent.owner, point)):
				return false
			agent.energy -= LadderRules.AGENT_EMP_COST
			var flight := maxi(1, ceili(agent.pos.distance_to(point) * TICK_RATE / LadderRules.AGENT_EMP_PROJECTILE_SPEED))
			emp_projectiles.append({"source": agent, "pos": point, "impact": tick + flight})
		"agent_strike":
			if (not point.is_finite() or agent.pos.distance_squared_to(point) > LadderRules.AGENT_STRIKE_RANGE ** 2
					or not can_see_position(agent.owner, point)):
				return false
			_ready_tactical_charge(agent.owner).erase("tactical_charge_ready")
			_clear_controlled_unit_orders(agent)
			agent.is_immobile = true
			agent.facing = agent.pos.direction_to(point).angle()
			agent["agent_strike"] = {"pos": point, "ends": tick + LadderRules.AGENT_STRIKE_SECONDS * TICK_RATE}
			for owner in players:
				if owner != agent.owner:
					notice.emit(owner, "Tactical strike detected.", "warn")
	ability_triggered.emit(agent, spell, point)
	return true

func _valid_agent_snipe_target(agent: Dictionary, target: Dictionary, reach: float) -> bool:
	return (not target.is_empty() and target.owner > 0 and target.owner != agent.owner and target.hp > 0.0
		and not target.is_structure and target.attributes.has("Biological") and not target.get("nonblocking", false)
		and int(target.get("stasis_until", 0)) <= tick and can_see_unit(agent.owner, target) and _edge_distance(agent, target) <= reach)

func _step_agent_snipe(agent: Dictionary) -> void:
	var shot: Dictionary = agent.agent_snipe
	var target: Dictionary = units.get(shot.target, {})
	if not _valid_agent_snipe_target(agent, target, LadderRules.AGENT_SNIPE_LEASH):
		_end_agent_snipe(agent)
		return
	if tick >= int(shot.ends):
		_end_agent_snipe(agent)
		_apply_damage_to_target(agent, target, 130.0, {"Psionic": 40.0}, 1.0, true)
		ability_triggered.emit(agent, "agent_snipe_hit", target.pos)

func _end_agent_snipe(agent: Dictionary) -> void:
	agent.erase("agent_snipe")
	agent.is_immobile = false

func _ready_tactical_charge(owner: int) -> Dictionary:
	for structure in units.values():
		if structure.owner == owner and structure.unit_type == "specter_academy" and structure.get("tactical_charge_ready", false):
			return structure
	return {}

func _finish_agent_strike(agent: Dictionary) -> void:
	var center: Vector2 = agent.agent_strike.pos
	agent.erase("agent_strike")
	agent.is_immobile = false
	_rebuild_spatial_grid()
	for target in query_units_in_radius(center, LadderRules.AGENT_STRIKE_RADIUS):
		var distance: float = center.distance_to(target.pos)
		if target.hp <= 0.0 or target.get("nonblocking", false) or distance > LadderRules.AGENT_STRIKE_RADIUS:
			continue
		var fraction := 1.0 if distance <= 10.0 else (0.5 if distance <= 15.0 else 0.25)
		_apply_damage_to_target(agent, target, 500.0 if target.is_structure else 300.0, {}, fraction, true)
	ability_triggered.emit(agent, "agent_strike_impact", center)

func _step_emp_projectiles() -> void:
	for index in range(emp_projectiles.size() - 1, -1, -1):
		var shot := emp_projectiles[index]
		if tick < int(shot.impact):
			continue
		emp_projectiles.remove_at(index)
		for target in query_units_in_radius(shot.pos, LadderRules.AGENT_EMP_BARRIER_RADIUS):
			var distance: float = shot.pos.distance_squared_to(target.pos)
			if target.unit_type == "phase_barrier" and distance <= LadderRules.AGENT_EMP_BARRIER_RADIUS ** 2:
				_remove_destroyed_unit(target)
				continue
			if (target.owner <= 0 or target.hp <= 0.0
					or target.get("nonblocking", false) or int(target.get("stasis_until", 0)) > tick
					or distance > LadderRules.AGENT_EMP_RADIUS ** 2):
				continue
			target.energy = maxf(0.0, target.energy - 100.0)
			if target.shields > 0.0:
				target.shields = maxf(0.0, target.shields - 100.0)
				target.out_of_combat_timer = 0.0
				if target.has("agent_snipe"):
					_end_agent_snipe(target)
			if not target.get("burrowed", false):
				target["emp_reveal_until"] = tick + ceili(LadderRules.AGENT_EMP_REVEAL_SECONDS * TICK_RATE)
		ability_triggered.emit(shot.source, "agent_emp_impact", shot.pos)

func siphon_wyrm_spell_block_reason(caster: Dictionary, spell: String) -> String:
	if not ladder_rules or caster.unit_type != "siphon_wyrm" or caster.is_immobile:
		return "Select an available Siphon Wyrm."
	if spell == "siphon_structure":
		return "Energy is full." if caster.energy >= _unit_energy_capacity(caster) else ""
	var cost: float = {"wyrm_grasp": LadderRules.GRASP_COST, "blinding_cloud": LadderRules.BLINDING_CLOUD_COST,
		"parasitic_cloud": LadderRules.PARASITIC_CLOUD_COST}[spell]
	return "Requires %d energy." % cost if caster.energy < cost else ""

func _cast_siphon_wyrm_spell(caster: Dictionary, spell: String, point: Vector2, target: Dictionary) -> bool:
	if not siphon_wyrm_spell_block_reason(caster, spell).is_empty():
		return false
	if spell == "blinding_cloud":
		if (not point.is_finite() or caster.pos.distance_squared_to(point) > LadderRules.BLINDING_CLOUD_RANGE ** 2
				or not can_see_position(caster.owner, point)):
			return false
		blinding_clouds.append({"pos": point, "ends": tick + ceili(LadderRules.BLINDING_CLOUD_SECONDS * TICK_RATE)})
		caster.energy -= LadderRules.BLINDING_CLOUD_COST
	else:
		if target.is_empty() or target.tag == caster.tag or target.hp <= 0.0 or not can_see_unit(caster.owner, target):
			return false
		point = target.pos
		match spell:
			"siphon_structure":
				if not _can_siphon_structure(caster, target):
					return false
				_clear_controlled_unit_orders(caster)
				caster.is_immobile = true
				caster["siphon_target"] = target.tag
				caster["siphon_ends"] = tick + ceili(LadderRules.SIPHON_SECONDS * TICK_RATE)
			"wyrm_grasp":
				if not _grasp_unit(caster, target):
					return false
				caster.energy -= LadderRules.GRASP_COST
			"parasitic_cloud":
				if (target.owner <= 0 or target.owner == caster.owner or target.flight_height <= 0.0 or target.is_structure
						or target.get("nonblocking", false) or _edge_distance(caster, target) > LadderRules.PARASITIC_CLOUD_RANGE
						or parasitic_clouds.any(func(cloud): return cloud.target == target.tag)):
					return false
				parasitic_clouds.append({"source": caster, "target": target.tag, "pos": point,
					"ends": tick + LadderRules.PARASITIC_CLOUD_SECONDS * TICK_RATE})
				caster.energy -= LadderRules.PARASITIC_CLOUD_COST
	ability_triggered.emit(caster, spell, point)
	return true

func _can_siphon_structure(caster: Dictionary, target: Dictionary) -> bool:
	return (not target.is_empty() and target.owner == caster.owner and target.faction == RTSData.FACTION_MONSTERS
		and target.is_structure and target.build_progress >= 1.0 and target.hp > LadderRules.SIPHON_HP_FLOOR
		and _edge_distance(caster, target) <= LadderRules.SIPHON_RANGE)

func _step_wyrm_siphon(caster: Dictionary) -> void:
	var target: Dictionary = units.get(caster.siphon_target, {})
	var capacity := _unit_energy_capacity(caster)
	if not _can_siphon_structure(caster, target) or caster.energy >= capacity:
		_end_wyrm_siphon(caster)
		return
	var duration := ceili(LadderRules.SIPHON_SECONDS * TICK_RATE)
	var drain := minf(LadderRules.SIPHON_DRAIN / duration, minf(target.hp - LadderRules.SIPHON_HP_FLOOR, (capacity - caster.energy) * 4.0))
	target.hp = maxf(LadderRules.SIPHON_HP_FLOOR, target.hp - drain)
	caster.energy += drain * 0.25
	if tick >= int(caster.siphon_ends) or target.hp <= LadderRules.SIPHON_HP_FLOOR or caster.energy >= capacity:
		_end_wyrm_siphon(caster)

func _end_wyrm_siphon(caster: Dictionary) -> void:
	caster.erase("siphon_target")
	caster.erase("siphon_ends")
	caster.is_immobile = false

func _grasp_unit(caster: Dictionary, target: Dictionary) -> bool:
	if (target.owner <= 0 or target.is_structure or target.attributes.has("Heroic") or target.get("nonblocking", false)
			or target.get("burrowed", false) or target.has("flight_transition") or target.has("recall_channel")
			or target.has("gravity_lifted_by") or target.has("dread_jump")
			or target.unit_type in ["howitzer", "howitzer_emplaced", "brood_egg", "brood_larva"]
			or _edge_distance(caster, target) > LadderRules.GRASP_RANGE):
		return false
	var airborne: bool = target.flight_height > 0.0
	var landing := _map_clamped_position(caster.pos, target.radius)
	if not airborne and not _grasp_landing_clear(target, landing):
		landing = Vector2.INF
		for radius in [2.0, 4.0, 6.0]:
			for step in range(8):
				var candidate: Vector2 = caster.pos + Vector2.from_angle(step * TAU / 8.0) * radius
				if _grasp_landing_clear(target, candidate):
					landing = candidate
					break
			if landing.is_finite():
				break
	if not landing.is_finite():
		return false
	if neural_tethers.has(target.tag):
		_end_neural_tether(target.tag)
	_interrupt_displaced_channels(target)
	_clear_controlled_unit_orders(target)
	target.pos = landing
	target.prev_pos = landing
	target.home_pos = landing
	return true

func _interrupt_displaced_channels(unit: Dictionary) -> void:
	if unit.has("caustic_spray"):
		_end_caustic_spray(unit)
	if unit.has("siphon_target"):
		_end_wyrm_siphon(unit)
	if unit.has("agent_snipe"):
		_end_agent_snipe(unit)
	if unit.erase("agent_strike"):
		unit.is_immobile = false
	_end_vortex_lock(unit)
	unit.erase("mine_target")

func _grasp_landing_clear(unit: Dictionary, point: Vector2) -> bool:
	return (_map_clamped_position(point, unit.radius) == point and not _is_point_blocked_by_static(point, unit.radius)
		and not _ground_mobile_overlaps(point, unit.radius, unit.tag))

func _step_parasitic_clouds() -> void:
	var hit: Dictionary = {}
	var interval := TICK_RATE / 4
	for index in range(parasitic_clouds.size() - 1, -1, -1):
		var cloud := parasitic_clouds[index]
		if tick > int(cloud.ends):
			parasitic_clouds.remove_at(index)
			continue
		var anchor: Dictionary = units.get(cloud.target, {})
		if not anchor.is_empty():
			cloud.pos = anchor.pos
		if tick % interval != 0:
			continue
		var targets := query_units_in_radius(cloud.pos, LadderRules.PARASITIC_CLOUD_RADIUS, cloud.source.owner)
		targets.sort_custom(func(a, b): return a.tag < b.tag)
		for target in targets:
			if (target.owner <= 0 or target.flight_height <= 0.0 or target.is_structure or target.get("nonblocking", false)
					or target.hp <= 0.0 or hit.has(target.tag) or target.pos.distance_squared_to(cloud.pos) > LadderRules.PARASITIC_CLOUD_RADIUS ** 2):
				continue
			hit[target.tag] = true
			_apply_damage_to_target(cloud.source, target, LadderRules.PARASITIC_CLOUD_DAMAGE / (LadderRules.PARASITIC_CLOUD_SECONDS * 4), {}, 1.0, true)

func growth_node_block_reason(source: Dictionary, ability: String) -> String:
	if not ladder_rules:
		return "Growth Tumors are available in ladder games."
	if ability == "seed_growth_node":
		if source.unit_type != "brood_keeper" or source.is_immobile:
			return "Select a surfaced Brood Keeper."
		return "Requires 25 energy." if source.energy < LadderRules.TUMOR_ENERGY else ""
	if source.unit_type != "brood_growth_node" or source.build_progress < 1.0:
		return "The Growth Tumor is still forming."
	if source.get("growth_node_spent", false):
		return "This Tumor has already seeded a daughter."
	var remaining := int(source.get("growth_node_ready", 0)) - tick
	return "Ready in %d s." % ceili(remaining * TICK_DT) if remaining > 0 else ""

func _seed_growth_node(source: Dictionary, ability: String, point: Vector2) -> bool:
	if not growth_node_block_reason(source, ability).is_empty() or not point.is_finite():
		return false
	var parent := ability == "spread_growth_node"
	var reach := LadderRules.TUMOR_SPREAD_RANGE if parent else LadderRules.TUMOR_SEED_RANGE + float(source.radius)
	if (source.pos.distance_squared_to(point) > reach * reach or not has_living_ground(point)
			or not can_see_position(source.owner, point) or not can_place_structure("brood_growth_node", point)):
		return false
	var tumor := spawn_unit("brood_growth_node", source.owner, point, "", 0.0)
	tumor["auto_summon"] = true
	if parent:
		source["growth_node_spent"] = true
		tumor["growth_node_parent"] = source.tag
	else:
		source.energy -= LadderRules.TUMOR_ENERGY
	ability_triggered.emit(tumor, "growth_node_seeded", point)
	return true

func transfuse_block_reason(keeper: Dictionary) -> String:
	if not ladder_rules or keeper.unit_type != "brood_keeper" or keeper.is_immobile:
		return "Select a surfaced Brood Keeper."
	if keeper.energy < LadderRules.TRANSFUSE_ENERGY:
		return "Requires 50 energy."
	if int(keeper.get("transfuse_ready", 0)) > tick:
		return "Transfuse is recharging."
	return "The Keeper must be on living ground." if not has_living_ground(keeper.pos) else ""

func _transfuse_brood(keeper: Dictionary, target: Dictionary) -> bool:
	if not transfuse_block_reason(keeper).is_empty() or target.is_empty():
		return false
	if (target.tag == keeper.tag or target.owner != keeper.owner or target.hp <= 0.0 or target.hp >= target.max_hp
			or target.build_progress < 1.0 or not target.attributes.has("Biological")
			or _edge_distance(keeper, target) > LadderRules.TRANSFUSE_RANGE or not has_living_ground(target.pos)):
		return false
	keeper.energy -= LadderRules.TRANSFUSE_ENERGY
	keeper["transfuse_ready"] = tick + TICK_RATE
	target.hp = minf(target.max_hp, target.hp + 75.0)
	target["transfuse_until"] = tick + LadderRules.TRANSFUSE_SECONDS * TICK_RATE
	ability_triggered.emit(keeper, "transfuse_brood", target.pos)
	return true

func launch_locusts_block_reason(brooder: Dictionary) -> String:
	if not ladder_rules or brooder.unit_type != "locust_brooder" or brooder.has("burrow_transition"):
		return "Select a ready Locust Brooder."
	var remaining := int(brooder.get("locust_launch_ready", 0)) - tick
	return "Locusts ready in %d s." % ceili(remaining * TICK_DT) if remaining > 0 else ""

func _launch_locusts(brooder: Dictionary, point: Vector2) -> bool:
	if not launch_locusts_block_reason(brooder).is_empty() or not point.is_finite():
		return false
	var radius: float = RTSData.get_unit_def("locust_flying").radius
	if _map_clamped_position(point, 0.0) != point:
		return false
	var heading: Vector2 = brooder.pos.direction_to(point)
	if heading.is_zero_approx():
		heading = Vector2.RIGHT
	for side in [-1.0, 1.0]:
		var spawn := _map_clamped_position(brooder.pos + heading * 1.25 + heading.orthogonal() * side * radius, radius)
		var locust := spawn_unit("locust_flying", brooder.owner, spawn)
		issue_command([locust.tag], "move", point)
		locust["locust_destination"] = point
	brooder["locust_launch_ready"] = tick + LadderRules.LOCUST_LAUNCH_COOLDOWN * TICK_RATE
	ability_triggered.emit(brooder, "launch_locusts", brooder.pos)
	return true

func _locust_site_clear(locust: Dictionary, point: Vector2) -> bool:
	return (locust.pos.distance_squared_to(point) <= LadderRules.LOCUST_SWOOP_RANGE ** 2
		and _map_clamped_position(point, locust.radius) == point and can_see_position(locust.owner, point)
		and not _is_point_blocked_by_static(point, locust.radius) and not _ground_mobile_overlaps(point, locust.radius)
		and not _locust_landing_reserved(locust, point))

func _locust_landing_reserved(locust: Dictionary, point: Vector2) -> bool:
	for nearby in query_units_in_radius(point, LadderRules.LOCUST_SWOOP_RANGE + locust.radius * 2.0):
		if nearby.tag != locust.tag and nearby.has("locust_descent"):
			var combined: float = nearby.radius + locust.radius
			if point.distance_squared_to(nearby.locust_descent.pos) < combined * combined:
				return true
	return false

func _begin_locust_swoop(locust: Dictionary, point: Vector2, find_nearby := false) -> bool:
	if (not point.is_finite() or locust.pos.distance_squared_to(point) > LadderRules.LOCUST_SWOOP_RANGE ** 2
			or not can_see_position(locust.owner, point)):
		return false
	var landing := point if _locust_site_clear(locust, point) else Vector2.INF
	if not landing.is_finite() and find_nearby:
		for radius in [2.0, 4.0, 6.0, 8.0]:
			for step in range(8):
				var candidate: Vector2 = point + Vector2.from_angle(step * TAU / 8.0) * radius
				if _locust_site_clear(locust, candidate):
					landing = candidate
					break
			if landing.is_finite():
				break
	if not landing.is_finite():
		return false
	locust.orders.clear()
	locust.path.clear()
	locust.erase("locust_destination")
	locust.is_immobile = true
	locust["locust_descent"] = {"from": locust.pos, "pos": landing, "start": tick,
		"ends": tick + ceili(LadderRules.LOCUST_SWOOP_SECONDS * TICK_RATE)}
	ability_triggered.emit(locust, "locust_swoop", landing)
	return true

func _step_flying_locust(locust: Dictionary) -> bool:
	if locust.has("locust_descent"):
		var descent: Dictionary = locust.locust_descent
		var progress := inverse_lerp(float(descent.start), float(descent.ends), float(tick))
		locust.pos = descent.from.lerp(descent.pos, clampf(progress, 0.0, 1.0))
		if tick >= int(descent.ends):
			locust.erase("locust_descent")
			locust.is_immobile = false
			if _locust_site_clear(locust, locust.pos):
				_morph_unit_in_place(locust, "locust_landed")
				locust.flight_height = 0.0
				locust.attributes = RTSData.get_unit_def("locust_landed").attributes.duplicate()
				locust.living_ground_speed_bonus = 0.4
				locust.home_pos = locust.pos
				locust.has_home_pos = true
		return true
	if not locust.get("auto_locust_swoop", true) or tick % 8 != int(locust.tag) % 8:
		return false
	if locust.has("locust_destination"):
		var destination: Vector2 = locust.locust_destination
		if _begin_locust_swoop(locust, destination, true):
			return true
	for enemy in query_units_in_radius(locust.pos, LadderRules.LOCUST_SWOOP_RANGE, locust.owner):
		if (enemy.flight_height <= 0.0 and is_hostile_contact(locust.owner, enemy)
				and can_see_unit(locust.owner, enemy) and _begin_locust_swoop(locust, enemy.pos, true)):
			return true
	return false

func can_merge_archon_unit(unit: Dictionary) -> bool:
	return (ladder_rules and unit.unit_type in ["storm_scribe", "duskblade"] and unit.hp > 0.0
		and not unit.is_immobile and not unit.has("archon_partner") and not unit.get("hallucinated", false))

func _order_archon_merge(selection: Array[Dictionary]) -> bool:
	var owner: int = selection[0].owner
	var eligible := selection.filter(func(unit): return unit.owner == owner and can_merge_archon_unit(unit))
	if eligible.size() < 2:
		return false
	var first: Dictionary = eligible[0]
	var second: Dictionary = eligible[1]
	var radius: float = RTSData.get_unit_def("lattice_archon").radius
	var first_pos: Vector2 = first.pos
	var second_pos: Vector2 = second.pos
	for point in [first_pos.lerp(second_pos, 0.5), first_pos, second_pos]:
		if (_map_clamped_position(point, radius) != point or _is_point_blocked_by_static(point, radius)
				or _ground_mobile_overlaps(point, radius, first.tag, second.tag)):
			continue
		var reachable := true
		for unit in [first, second]:
			if unit.pos.distance_squared_to(point) > 9.0 and compute_smooth_path(unit.pos, point, unit.radius).is_empty():
				reachable = false
				break
		if not reachable:
			continue
		for unit in [first, second]:
			issue_command([unit.tag], "move", point, 0, "", false, true)
		first["archon_partner"] = second.tag
		second["archon_partner"] = first.tag
		archon_approaches[mini(first.tag, second.tag)] = {"second": maxi(first.tag, second.tag), "point": point}
		return true
	return false

func _cancel_archon_approach(tag: int) -> void:
	var approach: Dictionary = archon_approaches.get(tag, {})
	if approach.is_empty():
		return
	archon_approaches.erase(tag)
	for member in [tag, approach.second]:
		var unit: Dictionary = units.get(member, {})
		if not unit.is_empty():
			unit.erase("archon_partner")
			_stop_for_mode_change(unit)

func _step_archon_approaches() -> void:
	var radius: float = RTSData.get_unit_def("lattice_archon").radius
	for tag in archon_approaches.keys():
		var approach: Dictionary = archon_approaches[tag]
		var first: Dictionary = units.get(tag, {})
		var second: Dictionary = units.get(approach.second, {})
		if first.is_empty() or second.is_empty():
			_cancel_archon_approach(tag)
			continue
		var point: Vector2 = approach.point
		if first.pos.distance_squared_to(point) > 9.0 or second.pos.distance_squared_to(point) > 9.0:
			if first.orders.is_empty() and second.orders.is_empty():
				_cancel_archon_approach(tag)
			continue
		if _is_point_blocked_by_static(point, radius) or _ground_mobile_overlaps(point, radius, first.tag, second.tag):
			if first.orders.is_empty() and second.orders.is_empty():
				_cancel_archon_approach(tag)
			continue
		archon_approaches.erase(tag)
		units.erase(tag)
		units.erase(second.tag)
		var archon := spawn_unit("lattice_archon", first.owner, point)
		archon.build_progress = 0.0
		archon.is_immobile = true
		archon["archon_warp_finish"] = tick + ceili(LadderRules.ARCHON_WARP_SECONDS * TICK_RATE)
		archon_merged.emit(tag, second.tag, archon.tag)
		ability_triggered.emit(archon, "archon_warp", point)

func caustic_barrage_ticks(caster: Dictionary) -> int:
	return maxi(0, int(caster.get("caustic_barrage_ready", 0)) - tick)

func caustic_barrage_radius() -> float:
	return LadderRules.CAUSTIC_BARRAGE_RADIUS

func _cast_caustic_barrage(caster: Dictionary, point: Vector2) -> bool:
	if not ladder_rules or caster.unit_type != "rupture_crawler" or caster.is_immobile or caustic_barrage_ticks(caster) > 0:
		return false
	if (not point.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(point)
			or caster.pos.distance_squared_to(point) > LadderRules.CAUSTIC_BARRAGE_RANGE ** 2):
		return false
	var impact := tick + ceili(LadderRules.CAUSTIC_BARRAGE_DELAY * TICK_RATE)
	caster["caustic_barrage_ready"] = tick + LadderRules.CAUSTIC_BARRAGE_COOLDOWN * TICK_RATE
	caustic_strikes.append({"pos": point, "source": caster, "impact": impact})
	ability_triggered.emit(caster, "caustic_barrage", point)
	return true

func visible_caustic_strikes(perspective: int) -> Array[Dictionary]:
	return caustic_strikes.filter(func(strike):
		return strike.source.owner == perspective or can_see_position(perspective, strike.pos))

func _step_caustic_strikes() -> void:
	var radius := LadderRules.CAUSTIC_BARRAGE_RADIUS
	for index in range(caustic_strikes.size() - 1, -1, -1):
		var strike := caustic_strikes[index]
		if tick < int(strike.impact):
			continue
		caustic_strikes.remove_at(index)
		var hits := query_units_in_radius(strike.pos, radius)
		hits.sort_custom(func(a, b): return a.tag < b.tag)
		for target in hits:
			if not units.has(target.tag) or target.get("nonblocking", false) or strike.pos.distance_squared_to(target.pos) > (radius + target.radius) ** 2:
				continue
			if target.unit_type == "phase_barrier":
				_remove_destroyed_unit(target)
			else:
				_apply_damage_to_target(strike.source, target, LadderRules.CAUSTIC_BARRAGE_DAMAGE, {}, 1.0, true)
		ability_triggered.emit(strike.source, "caustic_impact", strike.pos)

func _load_transport(transport: Dictionary) -> bool:
	if transport.build_progress < 1.0:
		return false
	var capacity: int = RTSData.get_unit_def(transport.unit_type).get("transport_capacity", 0)
	return _board_ground_squad(transport, capacity)

func transport_slots_used(transport: Dictionary) -> int:
	var used := 0
	for passenger in transport.get("passengers", []):
		used += int(RTSData.get_unit_def(passenger.unit_type).get("cargo_size", 1))
	return used

func hub_worker_cargo_available(hub: Dictionary, ability: String) -> bool:
	if not ladder_rules or hub.unit_type not in ["colony_hub", "fortified_hub"] or hub.get("hub_operations", false) \
			or hub.build_progress < 1.0 or hub.flight_height > 0.0 or hub.has("flight_transition"):
		return false
	var passengers: Array = hub.get("passengers", [])
	return passengers.size() < 5 if ability == "load_hub_workers" else not passengers.is_empty()

func can_enter_bunker(unit: Dictionary, bunker: Dictionary) -> bool:
	if fungal_grasp_active(unit) or unit.has("neural_original_owner") or neural_tethers.has(unit.get("tag", 0)):
		return false
	if bunker.get("unit_type") != "field_bunker" or bunker.build_progress < 1.0 or bunker.hp <= 0.0:
		return false
	var occupied: int = transport_slots_used(bunker) if ladder_rules else bunker.get("passengers", []).size()
	var incoming := int(RTSData.get_unit_def(unit.unit_type).get("cargo_size", 1)) if ladder_rules else 1
	return _is_friendly_mobile(unit, bunker.owner) and is_bunker_infantry(unit) \
		and occupied + incoming <= RTSData.get_unit_def(bunker.unit_type).transport_capacity

func can_enter_rampart(unit: Dictionary, transport: Dictionary) -> bool:
	if not ladder_rules or transport.get("unit_type") != "rampart_transport" or transport.hp <= 0.0 or transport.build_progress < 1.0:
		return false
	if (not _is_friendly_mobile(unit, transport.owner) or unit.flight_height > 0.0 or unit.is_immobile
			or unit.get("nonblocking", false) or unit.get("burrowed", false) or fungal_grasp_active(unit)
			or unit.has("neural_original_owner") or neural_tethers.has(unit.tag)):
		return false
	return transport_slots_used(transport) + int(RTSData.get_unit_def(unit.unit_type).get("cargo_size", 1)) <= 8

func is_bunker_infantry(unit: Dictionary) -> bool:
	return unit.flight_height <= 0.0 and not unit.is_immobile and not unit.get("burrowed", false) \
		and not unit.get("campaign_scripted", false) and RTSData.get_unit_def(unit.unit_type).get("bunker_garrison", false)

func _embark_ground_unit(passengers: Array, passenger: Dictionary) -> void:
	if passenger.is_worker:
		_release_mining_slot(passenger)
	passenger.orders.clear()
	passenger.path.clear()
	passenger.attack_state = "idle"
	passenger.vel = Vector2.ZERO
	_confirm_waiting_attack_loss(passenger)
	passengers.append(passenger)
	units.erase(passenger.tag)

func _board_ground_squad(carrier: Dictionary, capacity: int, tunnel: bool = false) -> bool:
	var passengers: Array = carrier.get("passengers", [])
	var free_slots := capacity - (passengers.size() if tunnel else transport_slots_used(carrier))
	var restricted_unit := str(RTSData.get_unit_def(carrier.unit_type).get("transport_unit", ""))
	if free_slots <= 0:
		return false
	var accepts_worker: bool = ladder_rules and (carrier.get("is_town_hall", false) or carrier.unit_type in ["lumen_carrier", "drift_hauler", "rampart_transport"])
	var pickup := 12.5 if accepts_worker else TRANSPORT_PICKUP_RADIUS
	var candidates := units.values().filter(func(unit):
		if carrier.pos.distance_squared_to(unit.pos) > pickup * pickup:
			return false
		if carrier.unit_type == "field_bunker":
			return can_enter_bunker(unit, carrier)
		if fungal_grasp_active(unit) or unit.has("neural_original_owner") or neural_tethers.has(unit.tag):
			return false
		if not restricted_unit.is_empty() and unit.unit_type != restricted_unit:
			return false
		return _is_friendly_mobile(unit, carrier.owner) and unit.flight_height <= 0.0 and (not unit.is_worker or accepts_worker) and not unit.is_immobile \
			and not unit.get("campaign_scripted", false) \
			and ((not tunnel and not carrier.get("is_town_hall", false)) or _has_carrier_access(unit.pos, unit.radius, carrier)))
	candidates.sort_custom(func(a, b):
		var a_distance: float = carrier.pos.distance_squared_to(a.pos)
		var b_distance: float = carrier.pos.distance_squared_to(b.pos)
		return a.tag < b.tag if a_distance == b_distance else a_distance < b_distance)
	var loaded := false
	for passenger in candidates:
		if free_slots <= 0:
			break
		var size := int(RTSData.get_unit_def(passenger.unit_type).get("cargo_size", 1)) if not tunnel else 1
		if size > free_slots:
			continue
		_embark_ground_unit(passengers, passenger)
		free_slots -= size
		loaded = true
	if loaded:
		carrier["passengers"] = passengers
	return loaded

func _valid_unload_order(transport: Dictionary, point: Vector2) -> bool:
	if transport.get("passengers", []).is_empty() or not point.is_finite() or _map_clamped_position(point, transport.radius) != point:
		return false
	return not can_see_position(transport.owner, point) or not _is_point_blocked_by_static(point, INFANTRY_CLEARANCE)

func is_embarked(tag: int, owner: int) -> bool:
	if brood_tunnel_cargo.get(owner, []).any(func(passenger): return passenger.tag == tag):
		return true
	for unit in units.values():
		if unit.owner == owner and unit.has("passengers") and unit.passengers.any(func(passenger): return passenger.tag == tag):
			return true
	return false

func _unload_transport(transport: Dictionary, center: Vector2) -> bool:
	if _is_point_blocked_by_static(center, INFANTRY_CLEARANCE):
		return false
	return _drop_ground_squad(transport.passengers, center)

func _step_rampart_unload(transport: Dictionary, order: Dictionary) -> bool:
	if transport.passengers.is_empty():
		return true
	if tick < int(transport.get("rampart_drop_ready", 0)):
		return false
	var next_passenger: Array = [transport.passengers[0]]
	if not _drop_ground_squad(next_passenger, order.target_pos):
		notice.emit(transport.owner, "Deployment site blocked. Troops remain aboard.", "warn")
		return true
	transport.passengers.pop_front()
	transport["rampart_drop_ready"] = tick + ceili(TICK_RATE / 1.4)
	return transport.passengers.is_empty()

func _drop_ground_squad(passengers: Array, center: Vector2, mouth: Dictionary = {}, vacated_tag: int = 0) -> bool:
	var tunnel_exit := _is_brood_tunnel_endpoint(mouth)
	var search_radius := 16.0 if tunnel_exit else 10.0
	var ground := units.values().filter(func(unit):
		return (unit.tag != vacated_tag and unit.flight_height <= 0.0 and not unit.get("burrowed", false)
			and unit.pos.distance_squared_to(center) < search_radius * search_radius))
	var landing_order := passengers.duplicate()
	landing_order.sort_custom(func(a, b): return a.tag < b.tag if a.radius == b.radius else a.radius > b.radius)
	var positions: Array[Vector2] = []
	var candidates: Array[Vector2] = [center]
	var rings := [2.7, 5.4, 8.1, 10.8] if tunnel_exit else [2.7, 5.4]
	for distance in rings:
		for step in range(12):
			candidates.append(center + Vector2.from_angle(TAU * step / 12.0) * float(distance))
	for passenger in landing_order:
		var spot := Vector2.INF
		for candidate in candidates:
			if _map_clamped_position(candidate, passenger.radius) != candidate \
					or _is_point_blocked_by_static(candidate, passenger.radius, false, vacated_tag):
				continue
			if not mouth.is_empty() and not _has_carrier_access(candidate, passenger.radius, mouth):
				continue
			if ground.any(func(unit): return candidate.distance_squared_to(unit.pos) < pow(passenger.radius + unit.radius, 2.0)):
				continue
			var clear := true
			for i in range(positions.size()):
				if candidate.distance_squared_to(positions[i]) < pow(passenger.radius + landing_order[i].radius, 2.0):
					clear = false
					break
			if clear:
				spot = candidate
				break
		if not spot.is_finite():
			if vacated_tag == 0:
				return false
			spot = center
		positions.append(spot)
	for i in range(landing_order.size()):
		var passenger: Dictionary = landing_order[i]
		passenger.pos = positions[i]
		passenger.prev_pos = positions[i]
		passenger.home_pos = positions[i]
		passenger.attack_state = "idle"
		units[passenger.tag] = passenger
	passengers.clear()
	return true

func linked_tunnel(mouth: Dictionary) -> Dictionary:
	var partner: Dictionary = units.get(int(mouth.get("tunnel_partner", 0)), {})
	if not partner.is_empty() and partner.get("tunnel_partner") == mouth.tag:
		return partner
	return {}

func _ready_tunnel(mouth: Dictionary) -> bool:
	return mouth.get("unit_type") == "tunnel_mouth" and mouth.build_progress >= 1.0 and mouth.hp > 0.0

func _has_carrier_access(point: Vector2, radius: float, carrier: Dictionary) -> bool:
	var offset: Vector2 = point - carrier.pos
	var lip: Vector2 = carrier.pos + offset.normalized() * (carrier.radius + radius + 0.3)
	return _has_clear_line_of_walk(point, lip, radius)

func _link_tunnel(mouth: Dictionary, partner: Dictionary) -> bool:
	if not _ready_tunnel(mouth) or not _ready_tunnel(partner) or mouth.owner != partner.owner or mouth.tag == partner.tag:
		return false
	if not linked_tunnel(mouth).is_empty() or not linked_tunnel(partner).is_empty() or mouth.has("tunnel_arrival") or partner.has("tunnel_arrival"):
		return false
	mouth["tunnel_partner"] = partner.tag
	partner["tunnel_partner"] = mouth.tag
	return true

func tunnel_send_block_reason(mouth: Dictionary) -> String:
	var partner := linked_tunnel(mouth)
	if partner.is_empty():
		return "Link this entrance to a second Tunnel Mouth."
	if mouth.has("tunnel_arrival") or partner.has("tunnel_arrival"):
		return "A squad is already traveling through the link."
	return ""

func _send_tunnel_squad(mouth: Dictionary) -> bool:
	if not _ready_tunnel(mouth) or not tunnel_send_block_reason(mouth).is_empty():
		return false
	if not _board_ground_squad(mouth, TUNNEL_CAPACITY, true):
		notice.emit(mouth.owner, "No ground troops near this entrance.", "warn")
		return false
	mouth["tunnel_arrival"] = tick + TUNNEL_TRAVEL_TICKS
	ability_triggered.emit(mouth, "send_tunnel_squad", mouth.pos)
	return true

func _step_tunnel_squad(mouth: Dictionary) -> void:
	if tick < int(mouth.tunnel_arrival) or tick < int(mouth.get("tunnel_retry", 0)):
		return
	var exit := linked_tunnel(mouth)
	if exit.is_empty():
		exit = mouth
	if _drop_ground_squad(mouth.passengers, exit.pos, exit):
		mouth.erase("tunnel_arrival")
		mouth.erase("tunnel_retry")
	else:
		mouth["tunnel_retry"] = tick + TUNNEL_EXIT_RETRY_TICKS

func _is_brood_tunnel_endpoint(unit: Dictionary) -> bool:
	return ladder_rules and unit.get("unit_type", "") in ["tunnel_mouth", "brood_tunnel_worm"]

func brood_tunnel_cargo_count(endpoint: Dictionary) -> int:
	return brood_tunnel_cargo.get(endpoint.owner, []).size() if _is_brood_tunnel_endpoint(endpoint) else 0

func _lose_brood_tunnel_cargo_if_last(endpoint: Dictionary) -> void:
	if not _is_brood_tunnel_endpoint(endpoint) or not brood_tunnel_cargo.has(endpoint.owner):
		return
	if units.values().any(func(other):
		return (other.tag != endpoint.tag and other.owner == endpoint.owner and other.hp > 0.0
			and _is_brood_tunnel_endpoint(other))):
		return
	var lost: Array = brood_tunnel_cargo[endpoint.owner]
	players[endpoint.owner].units_lost += lost.size()
	brood_tunnel_cargo.erase(endpoint.owner)
	for passenger in lost:
		unit_destroyed.emit(passenger)

func can_enter_brood_tunnel(unit: Dictionary, endpoint: Dictionary) -> bool:
	return (_is_brood_tunnel_endpoint(endpoint) and endpoint.hp > 0.0 and endpoint.build_progress >= 1.0
		and _is_friendly_mobile(unit, endpoint.owner) and unit.flight_height <= 0.0
		and not unit.is_immobile and not unit.get("burrowed", false) and not unit.get("nonblocking", false)
		and not unit.has("neural_original_owner") and not fungal_grasp_active(unit)
		and unit.unit_type not in ["brood_larva", "brood_egg"] and brood_tunnel_cargo_count(endpoint) < LadderRules.BROOD_TUNNEL_CAPACITY)

func brood_worm_block_reason(network: Dictionary) -> String:
	if not _is_brood_tunnel_endpoint(network) or network.unit_type != "tunnel_mouth" or network.build_progress < 1.0:
		return "Select a completed Brood Tunnel Network."
	if tick < int(network.get("brood_worm_ready", 0)):
		return "The Network is still recovering."
	if players[network.owner].crystal < 75 or players[network.owner].aether < 75:
		return "Requires 75 crystal and 75 aether."
	return ""

func _summon_brood_worm(network: Dictionary, point: Vector2) -> bool:
	if not brood_worm_block_reason(network).is_empty() or not point.is_finite() or not can_see_position(network.owner, point):
		return false
	var definition := RTSData.get_unit_def("brood_tunnel_worm")
	if (not can_place_structure("brood_tunnel_worm", point) or _ground_mobile_overlaps(point, definition.radius)
			or not _has_clear_line_of_walk(point, point, definition.radius)):
		return false
	var worm := spawn_unit("brood_tunnel_worm", network.owner, point, "", 0.0)
	worm["auto_summon"] = true
	worm["armor"] = float(definition.armor) + 2.0
	worm["construction_cost"] = Vector2i(75, 75)
	players[network.owner].crystal -= 75
	players[network.owner].aether -= 75
	network["brood_worm_ready"] = tick + ceili(LadderRules.BROOD_TUNNEL_WORM_SECONDS * TICK_RATE)
	ability_triggered.emit(worm, "brood_worm_emerge", point)
	return true

func _start_brood_tunnel_unload(endpoint: Dictionary) -> bool:
	if (not _is_brood_tunnel_endpoint(endpoint) or endpoint.build_progress < 1.0 or endpoint.has("brood_tunnel_unload")
			or brood_tunnel_cargo_count(endpoint) <= 0):
		return false
	endpoint["brood_tunnel_unload"] = tick + ceili(LadderRules.BROOD_TUNNEL_UNLOAD_SECONDS * TICK_RATE)
	return true

func _step_brood_tunnel_unload(endpoint: Dictionary) -> void:
	if tick < int(endpoint.brood_tunnel_unload):
		return
	var cargo: Array = brood_tunnel_cargo.get(endpoint.owner, [])
	if cargo.is_empty():
		endpoint.erase("brood_tunnel_unload")
		return
	var disembarking := [cargo.front()]
	if _drop_ground_squad(disembarking, endpoint.pos, endpoint):
		var passenger: Dictionary = cargo.pop_front()
		_apply_rally_route(passenger, endpoint.rally_route)
		if cargo.is_empty():
			endpoint.erase("brood_tunnel_unload")
			return
	endpoint.brood_tunnel_unload = tick + ceili(LadderRules.BROOD_TUNNEL_UNLOAD_SECONDS * TICK_RATE)

func default_rally_position(structure: Dictionary) -> Vector2:
	return structure.pos + (Vector2(8.0, 0.0) if structure.owner == 1 else Vector2(-8.0, 0.0))

func rally_waypoint_position(waypoint: Dictionary) -> Vector2:
	if waypoint.kind == "follow" and units.has(waypoint.target_tag):
		return units[waypoint.target_tag].pos
	return waypoint.pos

func _set_rally(structure: Dictionary, position: Vector2, target_tag: int, append: bool, workers: bool = false) -> bool:
	if (not structure.is_structure or structure.build_progress < 1.0
			or (not RTSData.get_unit_def(structure.unit_type).has("trains") and not _is_brood_tunnel_endpoint(structure))):
		return false
	if workers and structure.unit_type != "brood_nest":
		return false
	var kind := "move"
	if target_tag > 0:
		var resource := worker_rally_resource(structure.owner, target_tag)
		var unit: Dictionary = units.get(target_tag, {})
		if not resource.is_empty() and can_see_position(structure.owner, resource.pos):
			kind = "harvest"
			position = resource.pos
		elif _is_friendly_mobile(unit, structure.owner):
			kind = "follow"
			position = unit.pos
		else:
			return false
	if not position.is_finite():
		return false
	var route: Array = structure.rally_route
	if structure.unit_type == "brood_nest" and (workers or kind == "harvest"):
		route = structure.worker_rally_route
	if append and route.size() >= MAX_RALLY_WAYPOINTS:
		notice.emit(structure.owner, "Rally route already has eight waypoints.", "warn")
		return false
	if not append:
		route.clear()
	elif not route.is_empty() and route.back().kind != "move":
		# A gather or follow order persists, so only the final waypoint may use it.
		route[-1] = {"kind": "move", "target_tag": 0, "pos": rally_waypoint_position(route.back())}
	route.append({"kind": kind, "target_tag": target_tag, "pos": position})
	return true

func _apply_rally_route(unit: Dictionary, route: Array) -> void:
	for waypoint in route:
		var target_tag: int = waypoint.target_tag
		var position := rally_waypoint_position(waypoint)
		var command := "move"
		if waypoint.kind == "follow" and _is_friendly_mobile(units.get(target_tag, {}), unit.owner):
			command = "follow"
		elif waypoint.kind == "harvest" and unit.is_worker and not worker_rally_resource(unit.owner, target_tag).is_empty():
			command = "harvest"
		issue_command([unit.tag], command, position, target_tag if command != "move" else 0, "", not unit.orders.is_empty())

func worker_rally_resource(owner_id: int, target_tag: int) -> Dictionary:
	var deposit: Dictionary = resources.get(target_tag, {})
	if not deposit.is_empty() and deposit.resource_type == "crystal_field" and (unlimited_resources or deposit.amount > 0):
		return deposit
	var tap: Dictionary = units.get(target_tag, {})
	if not tap.is_empty() and tap.owner == owner_id and tap.is_extractor and tap.hp > 0 and tap.build_progress >= 1.0:
		var vent: Dictionary = resources.get(_gas_source_by_tap.get(target_tag, 0), {})
		if not vent.is_empty() and (unlimited_resources or vent.amount > 0):
			return tap
	return {}

func issue_SmartHarvest(worker_tag: int, preferred: Dictionary = {}) -> void:
	if not units.has(worker_tag):
		return
	var u = units[worker_tag]
	var nearest := _worker_crystal(u, preferred)
	if not nearest.is_empty():
		issue_command([worker_tag], "harvest", nearest["pos"], nearest["tag"])

func _worker_crystal(worker: Dictionary, preferred: Dictionary = {}) -> Dictionary:
	return _pick_local_crystal(worker, _find_nearest_crystal(worker.pos) if preferred.is_empty() else preferred)

func default_worker_deposit(structure: Dictionary) -> Dictionary:
	if match_state.is_empty() or not is_dropoff(structure, structure.owner):
		return {}
	var route: Array = structure.get("worker_rally_route", structure.rally_route)
	if not route.is_empty():
		return {}
	var worker: String = RTSData.faction_info[structure.faction].worker
	var spawn := _rally_spawn_position(structure, default_rally_position(structure), worker)
	if not spawn.is_finite():
		return {}
	return _worker_crystal({"tag": 0, "owner": structure.owner, "pos": spawn})

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
	u.erase("motion_tick")
	u.erase("motion_speed")
	if u["is_structure"]:
		nav_dirty = true

func vehicle_mode_block_reason(unit: Dictionary, ability: String) -> String:
	var mode: Dictionary = LadderRules.VEHICLE_MODES.get(ability, {})
	if not ladder_rules or mode.is_empty() or unit.unit_type != mode.source:
		return "Select a vehicle in the matching mode."
	if unit.has("vehicle_transition"):
		return "Vehicle is unavailable for conversion."
	var tech := str(mode.get("tech", ""))
	if not tech.is_empty() and not has_tech_structure(unit.owner, tech):
		return "Requires a completed Vehicle Armory."
	if ability == "mine_surface" and (_is_point_blocked_by_static(unit.pos, unit.radius) or _ground_mobile_overlaps(unit.pos, unit.radius, unit.tag)):
		return "The surface above the mine is occupied."
	return ""

func _begin_vehicle_mode(unit: Dictionary, ability: String) -> bool:
	if not vehicle_mode_block_reason(unit, ability).is_empty():
		return false
	var mode: Dictionary = LadderRules.VEHICLE_MODES[ability]
	var accelerated := bool(players[unit.owner].upgrades.get(mode.upgrade, 0))
	var duration := float(mode.fast if accelerated else mode.duration)
	unit["vehicle_transition"] = {"ability": ability, "form": mode.form, "finish": tick + ceili(duration * TICK_RATE)}
	unit.is_immobile = true
	unit.attack_state = "idle"
	unit.erase("mine_target")
	ability_triggered.emit(unit, ability, unit.pos)
	return true

func _finish_vehicle_mode(unit: Dictionary) -> void:
	var change: Dictionary = unit.vehicle_transition
	unit.erase("vehicle_transition")
	if not vehicle_mode_block_reason(unit, change.ability).is_empty():
		unit.is_immobile = bool(RTSData.get_unit_def(unit.unit_type).get("is_immobile", false))
		return
	var pending: Array = unit.orders.duplicate() if change.form not in ["sentinel_mine_armed", "sentinel_mine"] else []
	_change_mobile_form(unit, change.form)
	unit["burrowed"] = change.form == "sentinel_mine_armed"
	unit.orders = pending
	ability_triggered.emit(unit, "vehicle_mode_ready", unit.pos)

func _valid_missile_target(source: Dictionary, target: Dictionary, reach: float, weapon: Dictionary) -> bool:
	return not target.is_empty() and is_hostile_contact(source.owner, target) and target.hp > 0.0 \
		and _weapon_can_hit(weapon, target) and _edge_distance(source, target) <= reach and can_see_unit(source.owner, target)

func _nearest_missile_target(source: Dictionary, reach: float, weapon: Dictionary, air_reach: float = INF) -> Dictionary:
	var best: Dictionary = {}
	var best_distance := INF
	for candidate in query_units_in_radius(source.pos, reach + float(source.radius), source.owner):
		var target_reach := minf(air_reach, reach) if candidate.flight_height > 0.0 else reach
		if not _valid_missile_target(source, candidate, target_reach, weapon):
			continue
		var distance := _edge_distance(source, candidate)
		if distance < best_distance or (distance == best_distance and int(candidate.tag) < int(best.tag)):
			best = candidate
			best_distance = distance
	return best

const SENTINEL_MISSILE := {"name": "Sentinel Missile", "sfx": "sentinel_missile", "targets_air": true, "targets_ground": true,
	"no_structures": true}
const VORTEX_MISSILE := {"name": "Vortex Lock", "sfx": "vortex_missile", "targets_air": true, "targets_ground": true}

func sentinel_missile_block_reason(mine: Dictionary) -> String:
	if mine.unit_type != "sentinel_mine_armed" or mine.has("vehicle_transition"):
		return "Select a burrowed Sentinel Mine."
	if mine.has("mine_target") or int(mine.get("mine_ready", 0)) > tick:
		return "Sentinel Missiles are engaged or recharging."
	return ""

func _begin_sentinel_missile(mine: Dictionary, target: Dictionary) -> bool:
	if not sentinel_missile_block_reason(mine).is_empty() or not _valid_missile_target(mine, target, LadderRules.MINE_RANGE, SENTINEL_MISSILE):
		return false
	mine["mine_target"] = {"tag": target.tag, "fire": tick + ceili(LadderRules.MINE_LAUNCH_SECONDS * TICK_RATE)}
	ability_triggered.emit(mine, "mine_lock", target.pos)
	return true

func _step_sentinel_mine(mine: Dictionary) -> void:
	if int(mine.get("mine_ready", 0)) > tick:
		return
	var lock_state: Dictionary = mine.get("mine_target", {})
	if lock_state.is_empty():
		if not mine.auto_sentinel_missiles or tick % 4 != int(mine.tag) % 4:
			return
		_begin_sentinel_missile(mine, _nearest_missile_target(mine, LadderRules.MINE_RANGE, SENTINEL_MISSILE))
		return
	var target: Dictionary = units.get(lock_state.tag, {})
	if not _valid_missile_target(mine, target, LadderRules.MINE_RANGE, SENTINEL_MISSILE):
		mine.erase("mine_target")
		return
	if tick < int(lock_state.fire):
		return
	mine.erase("mine_target")
	mine["mine_ready"] = tick + LadderRules.MINE_REARM_SECONDS * TICK_RATE
	sentinel_missiles.append({"source": mine, "target": target.tag, "pos": mine.pos, "speed": 0.0,
		"guidance_tick": tick + ceili(LadderRules.MINE_MISSILE_RISE_SECONDS * TICK_RATE)})
	weapon_attack.emit(mine, target, SENTINEL_MISSILE, false)
	projectile_fired.emit(mine.pos, target.pos, SENTINEL_MISSILE.name, true, mine.owner)

func _step_sentinel_missiles() -> void:
	for index in range(sentinel_missiles.size() - 1, -1, -1):
		var missile := sentinel_missiles[index]
		var target: Dictionary = units.get(missile.target, {})
		if target.is_empty() or not _weapon_can_hit(SENTINEL_MISSILE, target):
			sentinel_missiles.remove_at(index)
			continue
		if tick < int(missile.guidance_tick) or not _advance_guided_missile(missile, target.pos, LadderRules.MINE_MISSILE_ACCELERATION, LadderRules.MINE_MISSILE_MAX_SPEED):
			continue
		sentinel_missiles.remove_at(index)
		_resolve_sentinel_missile(missile.source, target)

func _resolve_sentinel_missile(mine: Dictionary, target: Dictionary) -> void:
	var center: Vector2 = target.pos
	_apply_damage_to_target(mine, target, 125.0, {}, 1.0, true, {"shield_bonus": 35.0})
	for nearby in query_units_in_radius(center, LadderRules.MINE_SPLASH):
		if nearby.tag == target.tag or nearby.tag == mine.tag or nearby.hp <= 0.0 or not _weapon_can_hit(SENTINEL_MISSILE, nearby):
			continue
		if nearby.owner == mine.owner and nearby.unit_type in ["sentinel_mine", "sentinel_mine_armed"]:
			continue
		_apply_damage_to_target(mine, nearby, 40.0, {}, 1.0, true, {"shield_bonus": 25.0})
	ability_triggered.emit(mine.merged({"visual_target_tag": target.tag}), "sentinel_impact", center)

func _advance_guided_missile(missile: Dictionary, destination: Vector2, acceleration: float, max_speed: float) -> bool:
	missile.speed = minf(max_speed, float(missile.speed) + acceleration * TICK_DT)
	var travel: float = missile.speed * TICK_DT
	if missile.pos.distance_squared_to(destination) <= travel * travel:
		return true
	missile.pos = missile.pos.move_toward(destination, travel)
	return false

func vortex_lock_block_reason(unit: Dictionary) -> String:
	if not ladder_rules or unit.unit_type != "vortex_rover" or unit.is_immobile:
		return "Select an available Vortex Rover."
	if unit.has("vortex_lock_state") or int(unit.get("vortex_lock_ready", 0)) > tick:
		return "Vortex Lock is engaged or recharging."
	return ""

func _begin_vortex_lock(unit: Dictionary, target: Dictionary, automatic: bool = false) -> bool:
	var reach := LadderRules.VORTEX_GROUND_AUTO_RANGE if automatic and target.get("flight_height", 0.0) <= 0.0 else LadderRules.VORTEX_LOCK_RANGE
	if not vortex_lock_block_reason(unit).is_empty() or not _valid_missile_target(unit, target, reach, VORTEX_MISSILE):
		return false
	unit["vortex_lock_state"] = {"tag": target.tag, "started": tick, "shots": 0}
	unit.attack_state = "idle"
	ability_triggered.emit(unit, "vortex_lock", target.pos)
	return true

func _end_vortex_lock(unit: Dictionary) -> void:
	if unit.erase("vortex_lock_state"):
		unit["vortex_lock_ready"] = tick + ceili(LadderRules.VORTEX_LOCK_COOLDOWN * TICK_RATE)

func _step_vortex_lock(unit: Dictionary) -> void:
	var lock_state: Dictionary = unit.get("vortex_lock_state", {})
	if lock_state.is_empty():
		if unit.auto_vortex_lock and int(unit.get("vortex_lock_ready", 0)) <= tick and tick % 4 == int(unit.tag) % 4:
			var candidate := _nearest_missile_target(unit, LadderRules.VORTEX_GROUND_AUTO_RANGE, VORTEX_MISSILE, LadderRules.VORTEX_LOCK_RANGE)
			if not candidate.is_empty():
				_begin_vortex_lock(unit, candidate, true)
		return
	var target: Dictionary = units.get(lock_state.tag, {})
	if not _valid_missile_target(unit, target, LadderRules.VORTEX_LOCK_LEASH, VORTEX_MISSILE):
		_end_vortex_lock(unit)
		return
	var next_shot := int(lock_state.started) + ceili((int(lock_state.shots) + 1) * LadderRules.VORTEX_LOCK_SHOT_SECONDS * TICK_RATE)
	if tick < next_shot:
		return
	var shield_hit: bool = target.shields > 0.0
	var damage := 30.0 if players[unit.owner].upgrades.get("mag_accelerator", 0) else 20.0
	_apply_damage_to_target(unit, target, damage, {}, 1.0, true)
	weapon_attack.emit(unit, target, VORTEX_MISSILE, shield_hit)
	projectile_fired.emit(unit.pos, target.pos, VORTEX_MISSILE.name, false, unit.owner)
	lock_state.shots += 1
	if int(lock_state.shots) >= LadderRules.VORTEX_LOCK_SHOTS or target.hp <= 0.0:
		_end_vortex_lock(unit)

func _fighter_landing_clear(fighter: Dictionary) -> bool:
	var point: Vector2 = fighter.pos
	return not _is_point_blocked_by_static(point, fighter.radius) and not _ground_mobile_overlaps(point, fighter.radius)

func fighter_mode_block_reason(fighter: Dictionary, ability: String) -> String:
	var expected := "kestrel_interceptor" if ability == "fighter_assault" else "kestrel_assault"
	if fighter.unit_type != expected:
		return "Select a Kestrel in the matching mode."
	if fighter.has("fighter_mode_until"):
		return "Kestrel is switching modes."
	if ability == "fighter_assault" and not _fighter_landing_clear(fighter):
		return "Move the Kestrel above clear ground first."
	return ""

func _finish_fighter_mode(fighter: Dictionary) -> void:
	fighter.erase("fighter_mode_until")
	fighter.erase("fighter_mode_started")
	fighter.is_immobile = false
	var landing: bool = fighter.unit_type == "kestrel_interceptor"
	if landing and not _fighter_landing_clear(fighter):
		notice.emit(fighter.owner, "Kestrel landing blocked. Interceptor mode retained.", "warn")
		return
	var next := "kestrel_assault" if landing else "kestrel_interceptor"
	var pending: Array = fighter.orders.duplicate()
	_morph_unit_in_place(fighter, next)
	fighter.orders = pending
	fighter.home_pos = fighter.pos
	var def: Dictionary = RTSData.get_unit_def(next)
	fighter.flight_height = float(def.flight_height)
	fighter.attributes = def.attributes.duplicate()

func rampart_boost_block_reason(transport: Dictionary) -> String:
	if not ladder_rules or transport.unit_type != "rampart_transport" or transport.is_immobile:
		return "Select an available Rampart Transport."
	return "Afterburners are recharging." if int(transport.get("rampart_boost_ready", 0)) > tick else ""

func systems_jammed(unit: Dictionary) -> bool:
	return int(unit.get("systems_jammed_until", 0)) > tick

func watchkeeper_spell_block_reason(unit: Dictionary, spell: String) -> String:
	if not ladder_rules or unit.unit_type != "watchkeeper" or unit.is_immobile or systems_jammed(unit):
		return "Select an available Watchkeeper."
	if spell == "systems_jammer" and not players[unit.owner].upgrades.get("systems_jamming", 0):
		return "Research Systems Jammer at an attached Research Module."
	var energy := 50.0 if spell == "deploy_bastion_turret" else 75.0
	return "Requires %d energy." % int(energy) if unit.energy < energy else ""

func _cast_watchkeeper_spell(unit: Dictionary, spell: String, point: Vector2, target: Dictionary) -> bool:
	if not watchkeeper_spell_block_reason(unit, spell).is_empty():
		return false
	if spell == "deploy_bastion_turret":
		var radius: float = RTSData.get_unit_def("bastion_turret").radius
		if (not point.is_finite() or unit.pos.distance_squared_to(point) > LadderRules.TURRET_DEPLOY_RANGE ** 2
				or not can_see_position(unit.owner, point) or not can_place_structure("bastion_turret", point)
				or _ground_mobile_overlaps(point, radius)):
			return false
		spawn_unit("bastion_turret", unit.owner, point)
		unit.energy -= 50.0
	else:
		var jamming := spell == "systems_jammer"
		var reach := LadderRules.SYSTEMS_JAM_RANGE if jamming else LadderRules.ARMOR_MISSILE_RANGE
		if (target.is_empty() or not is_hostile_contact(unit.owner, target) or target.is_structure
				or target.get("nonblocking", false) or int(target.get("stasis_until", 0)) > tick
				or not can_see_unit(unit.owner, target) or _edge_distance(unit, target) > reach):
			return false
		if jamming and (target.has("dread_jump") or (not target.attributes.has("Mechanical") and not target.attributes.has("Psionic"))
				or systems_jammed(target) or watchkeeper_missiles.any(func(shot): return shot.spell == spell and shot.target == target.tag)):
			return false
		point = target.pos
		var lifetime := ceili((5.0 if not jamming else 16.0) / 1.4 * TICK_RATE)
		watchkeeper_missiles.append({"spell": spell, "target": target.tag, "pos": unit.pos, "speed": 0.0,
			"expires": tick + lifetime, "source": unit})
		unit.energy -= 75.0
	var visual := unit if target.is_empty() else unit.merged({"visual_target_tag": target.tag})
	ability_triggered.emit(visual, spell, point)
	return true

func _step_watchkeeper_missiles() -> void:
	for index in range(watchkeeper_missiles.size() - 1, -1, -1):
		var shot := watchkeeper_missiles[index]
		var target: Dictionary = units.get(shot.target, {})
		if (tick >= int(shot.expires) or target.is_empty() or target.get("nonblocking", false)
				or int(target.get("stasis_until", 0)) > tick or (shot.spell == "systems_jammer" and target.has("dread_jump"))):
			watchkeeper_missiles.remove_at(index)
			continue
		if not _advance_guided_missile(shot, target.pos, LadderRules.WATCHKEEPER_MISSILE_ACCELERATION[shot.spell],
				LadderRules.WATCHKEEPER_MISSILE_MAX_SPEED[shot.spell]):
			continue
		watchkeeper_missiles.remove_at(index)
		if shot.spell == "systems_jammer":
			target["systems_jammed_until"] = tick + LadderRules.SYSTEMS_JAM_SECONDS * TICK_RATE
			_interrupt_displaced_channels(target)
			if target.has("gravity_lift_target"):
				_end_gravity_lift(target)
			if target.erase("dread_beam"):
				target.is_immobile = false
			target.attack_state = "idle"
		else:
			var expires := tick + ceili(LadderRules.ARMOR_MISSILE_SECONDS * TICK_RATE)
			for nearby in query_units_in_radius(target.pos, LadderRules.ARMOR_MISSILE_RADIUS):
				if (not nearby.is_structure and not nearby.get("nonblocking", false) and int(nearby.get("stasis_until", 0)) <= tick
						and nearby.pos.distance_squared_to(target.pos) <= LadderRules.ARMOR_MISSILE_RADIUS ** 2):
					nearby["armor_breaker_until"] = expires
		ability_triggered.emit(shot.source.merged({"visual_target_tag": target.tag}), str(shot.spell) + "_impact", target.pos)

func dreadnought_ability_block_reason(unit: Dictionary, ability: String) -> String:
	if not ladder_rules or unit.unit_type != "dreadnought" or unit.is_immobile or systems_jammed(unit):
		return "Select an available Dreadnought."
	if ability == "dreadnought_beam" and not players[unit.owner].upgrades.get("dreadnought_refit", 0):
		return "Research Weapon Refit at the Ignition Core."
	var ready := int(unit.get("dread_jump_ready" if ability == "dreadnought_jump" else "dread_beam_ready", 0))
	return "Ability is recharging." if ready > tick else ""

func _cast_dreadnought_ability(unit: Dictionary, ability: String, point: Vector2, target: Dictionary) -> bool:
	if not dreadnought_ability_block_reason(unit, ability).is_empty():
		return false
	if ability == "dreadnought_jump":
		if not point.is_finite() or not Rect2(0.0, 0.0, map_width, map_height).has_point(point):
			return false
		unit["dread_jump"] = {"pos": _map_clamped_position(point, unit.radius),
			"depart": tick + LadderRules.DREADNOUGHT_JUMP_WINDUP * TICK_RATE,
			"finish": tick + (LadderRules.DREADNOUGHT_JUMP_WINDUP + LadderRules.DREADNOUGHT_JUMP_TRANSIT) * TICK_RATE}
		unit["dread_jump_ready"] = tick + LadderRules.DREADNOUGHT_COOLDOWN * TICK_RATE
	else:
		if (target.is_empty() or not is_hostile_contact(unit.owner, target) or target.get("nonblocking", false)
				or not can_see_unit(unit.owner, target) or _edge_distance(unit, target) > LadderRules.DREADNOUGHT_BEAM_RANGE):
			return false
		point = target.pos
		unit["dread_beam"] = {"target": target.tag, "finish": tick + ceili(LadderRules.DREADNOUGHT_BEAM_SECONDS * TICK_RATE)}
		unit["dread_beam_ready"] = tick + LadderRules.DREADNOUGHT_COOLDOWN * TICK_RATE
		unit.facing = unit.pos.direction_to(point).angle()
	_clear_controlled_unit_orders(unit)
	unit.is_immobile = true
	ability_triggered.emit(unit, ability, unit.pos if ability == "dreadnought_jump" else point)
	return true

func _step_dreadnought_ability(unit: Dictionary) -> bool:
	if unit.has("dread_jump"):
		var jump: Dictionary = unit.dread_jump
		if tick >= int(jump.finish):
			unit.pos = jump.pos
			unit.prev_pos = jump.pos
			unit.home_pos = jump.pos
			unit.is_immobile = false
			unit.erase("dread_jump")
			unit.erase("dread_in_transit")
			unit.erase("nonblocking")
			_refresh_vision()
			ability_triggered.emit(unit, "dreadnought_arrival", unit.pos)
		elif tick >= int(jump.depart) and not unit.get("dread_in_transit", false):
			unit["dread_in_transit"] = true
			unit["nonblocking"] = true
			_refresh_vision()
		return true
	if not unit.has("dread_beam"):
		return false
	if tick >= int(unit.dread_beam.finish):
		var target: Dictionary = units.get(unit.dread_beam.target, {})
		unit.erase("dread_beam")
		unit.is_immobile = false
		if not target.is_empty() and not target.get("nonblocking", false) and can_see_unit(unit.owner, target):
			_apply_damage_to_target(unit, target, 240.0, {}, 1.0, true)
			ability_triggered.emit(unit.merged({"visual_target_tag": target.tag}), "dreadnought_beam_hit", target.pos)
	return true

func _step_dreadnought_weapon(unit: Dictionary) -> void:
	if unit.weapon_cooldown > 0.0 or systems_jammed(unit):
		return
	var target: Dictionary = {}
	if not unit.orders.is_empty() and unit.orders[0].type in ["attack_target", "force_attack"]:
		target = units.get(unit.orders[0].target_tag, {})
	if not _dreadnought_in_firing_range(unit, target) and not unit.get("hold_fire", false):
		target = units.get(unit.attack_target_tag, {})
	if not _dreadnought_in_firing_range(unit, target):
		target = _find_best_attack_target(unit, true)
	if not target.is_empty() and _execute_weapon_hit(unit, target):
		unit.attack_target_tag = target.tag
		unit.weapon_cooldown = float(_active_weapon(unit, target).period)
	else:
		unit.attack_target_tag = 0

func _dreadnought_in_firing_range(unit: Dictionary, target: Dictionary) -> bool:
	return (not target.is_empty() and target.hp > 0.0 and can_see_unit(unit.owner, target) and can_attack(unit, target)
		and _edge_distance(unit, target) <= weapon_range_against(unit, target))

func harrier_cloak_block_reason(harrier: Dictionary) -> String:
	if not ladder_rules or harrier.unit_type != "night_harrier" or harrier.is_immobile:
		return "Select an available Night Harrier."
	if harrier.get("cloaked", false):
		return ""
	if not players[harrier.owner].upgrades.get("harrier_cloaking", 0):
		return "Research Stealth Field at an attached Research Module."
	return "Requires 25 energy." if harrier.energy < LadderRules.AGENT_CLOAK_COST else ""

func _toggle_personal_cloak(unit: Dictionary) -> void:
	var activating: bool = not unit.get("cloaked", false)
	if activating:
		unit.energy -= LadderRules.AGENT_CLOAK_COST
	unit["cloaked"] = activating

func sky_mode_block_reason(gunship: Dictionary, ability: String) -> String:
	if not ladder_rules or gunship.unit_type != ("sky_sentry" if ability == "sky_defender_mode" else "sky_sentry_defender"):
		return "Select a Sky Sentry in the matching mode."
	return "Sky Sentry is switching modes." if gunship.has("sky_transition") else ""

func sky_deploy_range(gunship: Dictionary) -> float:
	return LadderRules.SKY_DEPLOY_RANGE + (LadderRules.SKY_BALLISTICS_BONUS if players[gunship.owner].upgrades.get("sky_ballistics", 0) else 0.0)

func _begin_sky_mode(gunship: Dictionary, point: Vector2, deploy: bool) -> void:
	_clear_controlled_unit_orders(gunship)
	gunship.is_immobile = true
	if deploy:
		gunship.facing = gunship.pos.direction_to(point).angle()
	else:
		gunship.erase("sky_zone")
	var duration := LadderRules.SKY_DEPLOY_SECONDS if deploy else LadderRules.SKY_MOBILE_SECONDS
	gunship["sky_transition"] = {"deploy": deploy, "pos": point, "finish": tick + ceili(duration * TICK_RATE)}
	ability_triggered.emit(gunship, "sky_defender_mode" if deploy else "sky_fighter_mode", point)

func _finish_sky_mode(gunship: Dictionary) -> void:
	var transition: Dictionary = gunship.sky_transition
	gunship.erase("sky_transition")
	_change_mobile_form(gunship, "sky_sentry_defender" if transition.deploy else "sky_sentry")
	if transition.deploy:
		gunship["sky_zone"] = {"pos": transition.pos, "radius": LadderRules.SKY_ZONE_RADIUS}
	_refresh_vision()

func carapace_morph_block_reason(unit: Dictionary) -> String:
	if ladder_rules or unit.unit_type != "bile_crawler" or unit.is_immobile or not players.has(unit.owner):
		return "Select a Bile Crawler ready to evolve."
	if not has_tech_structure(unit.owner, "blight_spire"):
		return "Requires a completed Blight Spire."
	var stock: Dictionary = players[unit.owner]
	if stock.crystal < CARAPACE_MORPH_OFFER.crystal or stock.aether < CARAPACE_MORPH_OFFER.aether:
		return "Requires 75 crystal and 50 aether."
	if stock.supply_used + CARAPACE_MORPH_OFFER.supply > stock.supply_cap:
		return "Requires one additional supply."
	return ""

func _begin_carapace_morph(unit: Dictionary) -> void:
	var stock: Dictionary = players[unit.owner]
	stock.crystal -= CARAPACE_MORPH_OFFER.crystal
	stock.aether -= CARAPACE_MORPH_OFFER.aether
	unit["carapace_morph_until"] = tick + CARAPACE_MORPH_TICKS
	unit.is_immobile = true
	unit.attack_state = "idle"
	unit.attack_state_timer = 0.0
	unit.orders.clear()
	unit.path.clear()
	unit.vel = Vector2.ZERO
	_recompute_supplies()
	ability_triggered.emit(unit, "morph_carapace", unit.pos)

func _cancel_carapace_morph(unit: Dictionary) -> bool:
	if not unit.erase("carapace_morph_until"):
		return false
	unit.is_immobile = false
	players[unit.owner].crystal += CARAPACE_MORPH_OFFER.crystal
	players[unit.owner].aether += CARAPACE_MORPH_OFFER.aether
	_recompute_supplies()
	return true

func _finish_carapace_morph(unit: Dictionary) -> void:
	unit.erase("carapace_morph_until")
	var health_ratio: float = unit.hp / unit.max_hp
	var pending: Array = unit.orders.duplicate()
	_morph_unit_in_place(unit, "carapace_bulwark")
	var evolved: Dictionary = RTSData.get_unit_def(unit.unit_type)
	unit.attributes = evolved.attributes.duplicate()
	unit.max_hp = evolved.max_hp
	unit.hp = evolved.max_hp * health_ratio
	unit.armor = evolved.armor
	unit.orders = pending
	unit.home_pos = unit.pos
	_recompute_supplies()
	ability_triggered.emit(unit, "carapace_ready", unit.pos)

func sporeburst_morph_block_reason(unit: Dictionary) -> String:
	if unit.unit_type != "skitterling" or unit.is_immobile or not players.has(unit.owner):
		return "Select a surfaced Skitterling."
	if not has_tech_structure(unit.owner, "spore_nursery"):
		return "Requires a completed Spore Nursery."
	var cost := RTSData.get_unit_def("sporeburst")
	var stock: Dictionary = players[unit.owner]
	if stock.crystal < cost.crystal_cost or stock.aether < cost.aether_cost:
		return "Requires 25 crystal and 25 aether."
	return ""

func brood_morph_block_reason(unit: Dictionary, form: String) -> String:
	var spec: Dictionary = LadderRules.BROOD_MORPHS[form]
	var source_type := str(unit.get("unit_type", ""))
	if not ladder_rules or (source_type != spec.source and source_type != spec.get("alternate_source")) or unit.is_immobile:
		return "Select an available %s." % RTSData.get_unit_def(spec.source).name
	if not unit.get("passengers", []).is_empty():
		return "Unload the passengers before morphing."
	var definition := RTSData.get_unit_def(form)
	for required in definition.requires:
		if not has_tech_structure(unit.owner, required):
			return "Requires a completed %s." % RTSData.get_unit_def(required).name
	var bank: Dictionary = players[unit.owner]
	if bank.crystal < definition.crystal_cost or bank.aether < definition.aether_cost:
		return "Requires %d crystal and %d aether." % [definition.crystal_cost, definition.aether_cost]
	var extra_supply := brood_morph_supply(form)
	if bank.supply_used + extra_supply > bank.supply_cap:
		return "Requires one additional supply."
	return ""

func brood_morph_supply(form: String) -> float:
	var source: String = LadderRules.BROOD_MORPHS[form].source
	return float(RTSData.get_unit_def(form).supply_cost) - float(RTSData.get_unit_def(source).supply_cost)

func brood_morph_cancel_command(unit: Dictionary) -> String:
	return LadderRules.BROOD_MORPHS[unit.brood_morph.form].cancel

func _begin_brood_morph(unit: Dictionary, form: String) -> void:
	var definition := RTSData.get_unit_def(form)
	var bank: Dictionary = players[unit.owner]
	bank.crystal -= definition.crystal_cost
	bank.aether -= definition.aether_cost
	unit["brood_morph"] = {"form": form, "origin_type": unit.unit_type, "origin_hp": unit.hp,
		"finish": tick + ceili(float(definition.build_time) * TICK_RATE)}
	_change_mobile_form(unit, LadderRules.BROOD_MORPHS[form].cocoon)
	unit.hp = unit.max_hp
	_recompute_supplies()

func _cancel_brood_morph(unit: Dictionary) -> void:
	var morph: Dictionary = unit.brood_morph
	var damage: float = unit.max_hp - unit.hp
	unit.erase("brood_morph")
	_change_mobile_form(unit, morph.origin_type)
	unit.hp = maxf(1.0, float(morph.origin_hp) - damage)
	var definition := RTSData.get_unit_def(morph.form)
	var bank: Dictionary = players[unit.owner]
	bank.crystal += definition.crystal_cost
	bank.aether += definition.aether_cost
	_recompute_supplies()

func _finish_brood_morph(unit: Dictionary) -> void:
	var form: String = unit.brood_morph.form
	var damage: float = unit.max_hp - unit.hp
	unit.erase("brood_morph")
	_change_mobile_form(unit, form)
	unit.hp = unit.max_hp - damage
	ability_triggered.emit(unit, LadderRules.BROOD_MORPHS[form].ready, unit.pos)

func _begin_sporeburst_morph(unit: Dictionary) -> void:
	var cost := RTSData.get_unit_def("sporeburst")
	players[unit.owner].crystal -= cost.crystal_cost
	players[unit.owner].aether -= cost.aether_cost
	unit["sporeburst_morph_until"] = tick + roundi(float(cost.build_time) / TICK_DT)
	_change_mobile_form(unit, "sporeburst_cocoon")

func _cancel_sporeburst_morph(unit: Dictionary) -> void:
	unit.erase("sporeburst_morph_until")
	var cost := RTSData.get_unit_def("sporeburst")
	players[unit.owner].crystal += cost.crystal_cost
	players[unit.owner].aether += cost.aether_cost
	_change_mobile_form(unit, "skitterling")

func _finish_sporeburst_morph(unit: Dictionary) -> void:
	unit.erase("sporeburst_morph_until")
	_change_mobile_form(unit, "sporeburst")
	if players.get(unit.owner, {}).get("upgrades", {}).get("rolling_spores", 0):
		_apply_rolling_spores(unit)
	ability_triggered.emit(unit, "sporeburst_ready", unit.pos)

func _change_mobile_form(unit: Dictionary, next: String) -> void:
	var health_ratio: float = unit.hp / unit.max_hp
	_morph_unit_in_place(unit, next)
	var definition := RTSData.get_unit_def(next)
	unit.max_hp = definition.max_hp
	unit.hp = unit.max_hp * health_ratio
	unit.radius = definition.radius
	unit.armor = float(definition.get("armor", 0.0))
	unit.living_ground_speed_bonus = float(definition.get("living_ground_speed_bonus", 0.0))
	unit["hp_regen"] = definition.get("hp_regen", 0.0)
	unit.erase("generating_creep")
	unit.erase("living_ground_radius")
	unit["detection_radius"] = definition.get("detection_radius", 0.0)
	if unit.detection_radius > 0.0 and not _detectors.has(unit):
		_detectors.append(unit)
	if definition.has("energy_profile"):
		unit["energy_profile"] = definition.energy_profile
		unit.energy = definition.energy_profile.start
	if int(definition.get("transport_capacity", 0)) > 0 and not unit.has("passengers"):
		unit["passengers"] = []
	unit["target_priority"] = definition.get("target_priority", 0)
	unit.attributes = definition.attributes.duplicate()
	unit.attack_state = "idle"
	unit.attack_state_timer = 0.0
	unit.attack_target_tag = 0
	unit.weapon_cooldown = 0.0
	unit.path.clear()
	unit.home_pos = unit.pos
	unit.erase("choke_yield")

func _apply_rolling_spores(unit: Dictionary) -> void:
	unit["rolling_spores"] = true
	unit.speed *= 4.13 / 3.5
	unit.max_hp += 5.0
	unit.hp += 5.0

func campaign_training_block_reason(structure: Dictionary, unit_type: String) -> String:
	if campaign == null or structure.owner != 1:
		return ""
	if not campaign.allows_training(unit_type):
		return "That unit is unavailable in this mission."
	if unit_type == "triage_specialist" and production_attachment(structure).get("unit_type") != "research_module":
		return "Requires an attached Research Module."
	return ""

func training_block_reason(structure: Dictionary, unit_type: String) -> String:
	if attachment_under_construction(structure):
		return "Training is paused while the attachment is under construction."
	var reason := campaign_training_block_reason(structure, unit_type)
	if not reason.is_empty():
		return reason
	if unit_type == "tactical_charge" and (structure.get("tactical_charge_ready", false)
			or structure.production_queue.any(func(item): return item.get("unit_type") == "tactical_charge")):
		return "This Academy already has a Tactical Charge."
	var required: String = RTSData.get_unit_def(unit_type).get("attachment_required", "")
	if not required.is_empty() and production_attachment(structure).get("unit_type") != required:
		return "Requires an attached %s." % RTSData.get_unit_def(required).name
	return ""

func _enqueue_unit_production(structure: Dictionary, unit_type: String, larva_tag := 0) -> bool:
	if not structure["is_structure"] or structure["build_progress"] < 1.0 or structure.flight_height > 0.0 or structure.has("transit_morph"):
		return false
	var u_def = RTSData.get_unit_def(unit_type)
	if u_def.is_empty():
		return false
	if not RTSData.get_unit_def(structure["unit_type"]).get("trains", []).has(unit_type):
		return false
	if unit_type == "crownspire" and ladder_rules and not flagship_production_block_reason(structure.owner).is_empty():
		return false
	var training_reason := training_block_reason(structure, unit_type)
	if not training_reason.is_empty():
		notice.emit(structure.owner, training_reason, "error")
		return false
	if requires_power(structure.unit_type) and not is_powered(structure.owner, structure.pos):
		notice.emit(structure.owner, "Waystone needs a friendly power field.", "error")
		return false
	for requirement in u_def.get("requires", []):
		if not has_tech_structure(structure.owner, requirement):
			notice.emit(structure.owner, "Requires %s." % RTSData.get_unit_def(requirement).name, "error")
			return false
	var consumes_larva := training_uses_brood_slot(structure, unit_type)
	if larva_tag != 0 and (not consumes_larva or not structure.brood_larvae.has(larva_tag)):
		return false
	if consumes_larva and structure.brood_slots <= 0:
		notice.emit(structure.owner, "No brood slots ready.", "error")
		return false
	var p = players.get(structure["owner"], {})
	if p.is_empty():
		return false
	var m_cost = int(u_def.get("crystal_cost", 50))
	var v_cost = int(u_def.get("aether_cost", 0))
	var hatch_count := int(u_def.get("hatch_count", 1))
	var s_cost := float(u_def.get("supply_cost", 1)) * hatch_count
	if p["crystal"] < m_cost:
		emit_signal("notice", structure["owner"], "Not enough crystal.", "error")
		return false
	if p["aether"] < v_cost:
		emit_signal("notice", structure["owner"], "Not enough aether.", "error")
		return false
	# Larva morph into active eggs as soon as the command is accepted.
	if ladder_rules and consumes_larva and s_cost > 0 and p.supply_used + s_cost > p.supply_cap:
		_warn_supply_required(structure.owner)
		return false
	var same_lane: int = structure.production_queue.size()
	if ladder_rules and uses_brood_slots(structure):
		same_lane = 0 if consumes_larva else _structure_lane_size(structure)
	if same_lane >= PRODUCTION_QUEUE_CAPACITY:
		emit_signal("notice", structure["owner"], "Production queue is full.", "error")
		return false
	p["crystal"] -= m_cost
	p["aether"] -= v_cost
	var bonus_slot := false
	if consumes_larva and not ladder_rules:
		bonus_slot = structure.brood_bonus_slots > 0
		if bonus_slot:
			structure.brood_bonus_slots -= 1
		structure.brood_slots -= 1
	var job := {
		"unit_type": unit_type,
		"crystal_cost": m_cost,
		"aether_cost": v_cost,
		"hatch_count": hatch_count,
		"supply_cost": s_cost,
		"progress": 0.0,
		"total_time": float(u_def.get("build_time", 12.0))
	}
	if u_def.has("attachment_required"):
		job["requires_attachment"] = u_def.attachment_required
	if bonus_slot:
		job["brood_bonus_slot"] = true
	if consumes_larva and ladder_rules:
		var larva: Dictionary = units[larva_tag if larva_tag != 0 else structure.brood_larvae.front()]
		structure.brood_larvae.erase(larva.tag)
		structure.brood_slots = structure.brood_larvae.size()
		_morph_unit_in_place(larva, "brood_egg")
		var egg_def := RTSData.get_unit_def("brood_egg")
		larva.radius = egg_def.radius
		larva.attributes = egg_def.attributes.duplicate()
		larva.hp = egg_def.max_hp
		larva.max_hp = egg_def.max_hp
		larva.erase("brood_off_creep_since")
		job["egg_tag"] = larva.tag
		ability_triggered.emit(larva, "brood_egg_morph", larva.pos)
	structure.production_queue.append(job)
	_recompute_supplies()
	return true

func unit_upgrade_level(unit: Dictionary, upgrade: String) -> int:
	var campaign_bonus := int(unit.get("campaign_" + upgrade, 0)) if campaign != null and unit.owner == 2 else 0
	var upgrades: Dictionary = players.get(unit.get("neural_original_owner", unit.owner), {}).get("upgrades", {})
	var airborne: bool = unit.flight_height > 0.0 and not unit.has("gravity_lifted_by")
	if ladder_rules and unit.faction == RTSData.FACTION_HUMANS:
		if unit.is_structure:
			return 2 if upgrade == "armor" and upgrades.get("reinforced_structure_armor", 0) else 0
		if upgrade == "shields":
			return 0
		if unit.unit_type == "pioneer":
			return int(upgrades.get("infantry_armor", 0)) if upgrade == "armor" else 0
		if unit.unit_type in LadderRules.MERIDIAN_INFANTRY:
			return int(upgrades.get("infantry_" + upgrade, 0))
		if unit.unit_type in LadderRules.MERIDIAN_VEHICLES:
			return int(upgrades.get("vehicle_weapons" if upgrade == "weapons" else "vehicle_plating", 0))
		if airborne or unit.unit_type == "kestrel_assault":
			return int(upgrades.get("ship_weapons" if upgrade == "weapons" else "vehicle_plating", 0))
		return 0
	if ladder_rules and unit.faction == RTSData.FACTION_ALIENS:
		if upgrade == "shields":
			return int(upgrades.get("concord_shields", 0))
		if not unit.is_structure and not airborne:
			return int(upgrades.get("concord_ground_" + upgrade, 0))
		if not unit.is_structure and airborne:
			return int(upgrades.get("concord_air_" + upgrade, 0))
		return 0
	if ladder_rules and unit.faction == RTSData.FACTION_MONSTERS:
		if airborne and unit.unit_type != "locust_flying" and upgrade in ["weapons", "armor"]:
			return int(upgrades.get("brood_air_" + upgrade, 0))
		if upgrade == "weapons":
			return int(upgrades.get(LadderRules.BROOD_WEAPON_UPGRADE.get(unit.unit_type, ""), 0))
		if upgrade == "armor" and (unit.is_worker or LadderRules.BROOD_WEAPON_UPGRADE.has(unit.unit_type)
				or unit.unit_type in ["locust_flying", "locust_brooder", "mireweaver"]):
			var plating := LadderRules.BULWARK_PLATING_ARMOR if _is_frenzied(unit) and upgrades.get("chitinous_plating", 0) else 0
			return int(upgrades.get("brood_carapace", 0)) + plating
		return 0
	if upgrade == "shields":
		return 0
	if upgrade == "armor" and unit.faction == "monsters" and not unit.is_structure and unit.flight_height <= 0.0:
		return campaign_bonus + int(upgrades.get("brood_carapace", 0))
	if unit.faction != "humans" or unit.is_structure or unit.is_worker:
		return campaign_bonus
	return campaign_bonus + int(upgrades.get(upgrade, 0))

func surge_hp_cost(unit: Dictionary) -> float:
	var base_cost := float(RTSData.get_ability_def("surge").hp_cost)
	if ladder_rules:
		return 20.0 if unit.unit_type == "breacher" else base_cost
	return base_cost * 0.5 if players.get(unit.owner, {}).get("surge_efficiency", false) else base_cost

func surge_block_reason(unit: Dictionary) -> String:
	if unit.unit_type not in ["rifleman", "breacher"]:
		return "Select a Rifleman or Breacher."
	if ladder_rules and not players[unit.owner].upgrades.get("stim_injectors", 0):
		return "Research Surge Injectors at a Muster Hall with a Research Module."
	if ladder_rules and int(unit.get("surge_ready", 0)) > tick:
		return "Surge is recharging."
	return "Not enough health." if unit.hp <= surge_hp_cost(unit) else ""

func _apply_combat_shield(rifleman: Dictionary) -> void:
	rifleman.max_hp += 10.0
	rifleman.hp += 10.0

func hurler_lunge_block_reason(unit: Dictionary) -> String:
	if not ladder_rules or unit.get("unit_type") != "blight_hurler" or unit.is_immobile or unit.has("burrow_transition"):
		return "Select a surfaced Blight Hurler."
	if not players[unit.owner].upgrades.get("nanomuscular_swell", 0):
		return "Research Nanomuscular Swell at a Spine Den."
	if tick < int(unit.get("hurler_lunge_ready", 0)):
		return "Lunge is recharging."
	return ""

func _contaminate_production(seer: Dictionary, target: Dictionary) -> bool:
	if not ladder_rules or seer.unit_type != "spore_seer" or seer.energy < LadderRules.CONTAMINATE_COST:
		return false
	if target.is_empty() or target.owner <= 0 or target.owner == seer.owner or not target.is_structure \
			or target.build_progress < 1.0 or target.hp <= 0.0 or tick < int(target.get("contaminated_until", 0)) \
			or not can_see_unit(seer.owner, target) or _edge_distance(seer, target) > LadderRules.CONTAMINATE_RANGE:
		return false
	var definition := RTSData.get_unit_def(target.unit_type)
	if definition.get("trains", []).is_empty() and not definition.get("abilities", []).any(func(id): return RTSData.get_ability_def(id).has("upgrade")):
		return false
	seer.energy -= LadderRules.CONTAMINATE_COST
	target["contaminated_until"] = tick + ceili(LadderRules.CONTAMINATE_SECONDS * TICK_RATE)
	ability_triggered.emit(seer, "contaminate_production", target.pos)
	return true

func caustic_spray_ready(unit: Dictionary) -> bool:
	return ladder_rules and unit.get("unit_type", "") == "corrosion_flyer" and not unit.is_immobile \
		and tick >= int(unit.get("caustic_spray_ready", 0))

func _valid_caustic_spray_target(caster: Dictionary, target: Dictionary) -> bool:
	return not target.is_empty() and target.owner > 0 and target.owner != caster.owner and target.is_structure \
		and target.hp > 0.0 and can_see_unit(caster.owner, target) and _edge_distance(caster, target) <= LadderRules.CAUSTIC_SPRAY_RANGE

func _begin_caustic_spray(caster: Dictionary, target: Dictionary) -> bool:
	if not caustic_spray_ready(caster) or not _valid_caustic_spray_target(caster, target):
		return false
	caster["caustic_spray"] = {"target": target.tag, "start": tick, "next_pulse": tick + LadderRules.CAUSTIC_SPRAY_PULSE_TICKS}
	caster["caustic_spray_ready"] = tick + ceili(LadderRules.CAUSTIC_SPRAY_COOLDOWN * TICK_RATE)
	caster.is_immobile = true
	caster.attack_state = "idle"
	caster.facing = caster.pos.direction_to(target.pos).angle()
	_stop_for_mode_change(caster)
	ability_triggered.emit(caster, "caustic_spray", target.pos)
	return true

func _step_caustic_spray(caster: Dictionary) -> void:
	var spray: Dictionary = caster.caustic_spray
	var target: Dictionary = units.get(spray.target, {})
	if not _valid_caustic_spray_target(caster, target):
		_end_caustic_spray(caster)
		return
	if tick < int(spray.next_pulse):
		return
	var pulse := LadderRules.CAUSTIC_SPRAY_PULSE_TICKS
	var elapsed: int = int(spray.next_pulse) - int(spray.start)
	var ramp := ceili(LadderRules.CAUSTIC_SPRAY_RAMP * TICK_RATE)
	var boosted := clampi(elapsed - ramp, 0, pulse)
	var damage := (float(pulse - boosted) * LadderRules.CAUSTIC_SPRAY_INITIAL_DPS + float(boosted) * LadderRules.CAUSTIC_SPRAY_RAMPED_DPS) * TICK_DT
	_apply_damage_to_target(caster, target, damage, {}, 1.0, true)
	spray.next_pulse += pulse
	if elapsed % (4 * pulse) == 0:
		ability_triggered.emit(caster, "caustic_spray_pulse", target.pos)

func _end_caustic_spray(caster: Dictionary) -> void:
	caster.erase("caustic_spray")
	caster.is_immobile = false

func drift_creep_block_reason(unit: Dictionary) -> String:
	if not ladder_rules or unit.get("unit_type", "") not in ["drift_sac", "drift_hauler"]:
		return "Requires a Drift Sac or Hauler."
	return "" if unit.get("generating_creep", false) or has_tech_structure(unit.owner, "brood_lair") else "Requires a completed Brood Lair."

func _spawn_brood_mimic(seer: Dictionary) -> bool:
	if not ladder_rules or seer.unit_type != "spore_seer" or seer.energy < LadderRules.BROOD_MIMIC_ENERGY:
		return false
	var site := _rally_spawn_position(seer, seer.pos + Vector2(3.0, 0.0), "brood_mimic", [])
	if not site.is_finite():
		return false
	seer.energy -= LadderRules.BROOD_MIMIC_ENERGY
	var mimic := spawn_unit("brood_mimic", seer.owner, site)
	ability_triggered.emit(mimic, "spawn_brood_mimic", site)
	return true

func _disguise_brood_mimic(mimic: Dictionary) -> void:
	var contact := {}
	var best := float(mimic.sight_range) ** 2
	for target in query_units_in_radius(mimic.pos, mimic.sight_range, mimic.owner):
		if not is_hostile_contact(mimic.owner, target) or target.hp <= 0.0 or not can_see_unit(mimic.owner, target):
			continue
		var distance: float = target.pos.distance_squared_to(mimic.pos)
		if distance < best:
			contact = target
			best = distance
	if contact.is_empty():
		return
	var form: String = LadderRules.BROOD_MIMIC_FORMS.get(players[contact.owner].faction, "rifleman")
	var definition := RTSData.get_unit_def(form)
	mimic["disguise_type"] = form
	mimic["disguise_owner"] = contact.owner
	mimic.radius = definition.radius
	mimic.speed = definition.speed
	mimic.sight_range = 20.0 if form == "skitterling" else 22.5
	var upgrades: Dictionary = players[contact.owner].upgrades
	if form == "rifleman" and upgrades.get("combat_shields", 0):
		mimic["disguise_detail"] = "combat_shield"
	elif form == "skitterling" and upgrades.get("metabolic_boost", 0):
		mimic["disguise_detail"] = "wings"
		mimic.speed = 6.58 * 2.5
	if definition.has("living_ground_speed_bonus"):
		mimic["living_ground_speed_bonus"] = definition.living_ground_speed_bonus

func crawler_mode_block_reason(unit: Dictionary, rooted: bool) -> String:
	if not ladder_rules or not LadderRules.CRAWLER_ROOT_SECONDS.has(unit.get("unit_type", "")) or unit.build_progress < 1.0:
		return "Requires a completed Gnarl defense."
	if unit.has("crawler_transition"):
		return "Defense transition in progress."
	if bool(unit.get("crawler_uprooted", false)) != rooted:
		return "Already rooted." if rooted else "Already uprooted."
	return ""

func _crawler_root_site_valid(unit: Dictionary, point: Vector2) -> bool:
	return (point.is_finite() and can_see_position(unit.owner, point) and has_living_ground(point)
		and can_place_structure(unit.unit_type, point, unit.tag))

func _begin_crawler_transition(unit: Dictionary, rooted: bool) -> void:
	var duration: float = LadderRules.CRAWLER_ROOT_SECONDS[unit.unit_type] if rooted else LadderRules.CRAWLER_UPROOT_SECONDS
	unit["crawler_transition"] = {"rooted": rooted, "start": tick, "finish": tick + ceili(duration * TICK_RATE)}
	unit["detection_radius"] = 0.0
	unit.is_immobile = true
	unit.attack_state = "idle"
	unit.attack_state_timer = 0.0
	unit.attack_target_tag = 0
	_stop_for_mode_change(unit)
	_refresh_vision()
	ability_triggered.emit(unit, "crawler_root" if rooted else "crawler_uproot", unit.pos)

func _finish_crawler_transition(unit: Dictionary) -> void:
	var rooted: bool = unit.crawler_transition.rooted
	unit.erase("crawler_transition")
	if rooted and (not _crawler_root_site_valid(unit, unit.pos) or _ground_mobile_overlaps(unit.pos, unit.radius, unit.tag)):
		unit.is_immobile = false
		notice.emit(unit.owner, "The rooting site became blocked.", "warn")
		return
	var definition := RTSData.get_unit_def(unit.unit_type)
	unit["crawler_uprooted"] = not rooted
	unit.is_immobile = rooted
	unit.speed = 0.0 if rooted else LadderRules.CRAWLER_MOBILE_SPEED
	unit["detection_radius"] = float(definition.get("detection_radius", 0.0)) if rooted else 0.0
	if unit.detection_radius > 0.0 and not _detectors.has(unit):
		_detectors.append(unit)
	nav_dirty = true
	_refresh_vision()

func research_offer(owner_id: int, upgrade: String) -> Dictionary:
	var player: Dictionary = players.get(owner_id, {})
	if player.is_empty():
		return {}
	var campaign_research := campaign != null and owner_id == 1
	if campaign_research and not campaign.allows_research(upgrade):
		return {}
	if upgrade == "surge_efficiency":
		return {} if ladder_rules or player.get("surge_efficiency", false) else {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 45.0, "requires": []}
	if upgrade == "fast_deployment":
		return {} if ladder_rules or player.get("fast_deployment", false) else {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 45.0, "requires": []}
	var upgrades: Dictionary = player.get("upgrades", {})
	if LadderRules.MERIDIAN_GROUP_RESEARCH.has(upgrade):
		var level := int(upgrades.get(upgrade, 0))
		if not ladder_rules or level >= MAX_UPGRADE_LEVEL:
			return {}
		var price: int = LadderRules.MERIDIAN_GROUP_RESEARCH[upgrade][level]
		return {"level": level + 1, "crystal": price, "aether": price, "supply": 0,
			"time": LadderRules.MERIDIAN_GROUP_TIMES[level], "requires": ["vehicle_armory"] if level > 0 and upgrade.begins_with("infantry_") else []}
	if LadderRules.MERIDIAN_SUPPORT_RESEARCH.has(upgrade):
		return LadderRules.MERIDIAN_SUPPORT_RESEARCH[upgrade] if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if ladder_rules and upgrade in ["weapons", "armor"]:
		return {}
	var factory_research: Dictionary = LadderRules.FACTORY_RESEARCH.get(upgrade, {})
	if not factory_research.is_empty():
		return factory_research if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "burrow":
		return LadderRules.BURROW_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade in ["tunneling_claws", "glial_reconstitution"]:
		return LadderRules.BILE_WARREN_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "grooved_spines":
		return LadderRules.GROOVED_SPINES_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "muscular_augments":
		return LadderRules.MUSCULAR_AUGMENTS_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "nanomuscular_swell":
		return LadderRules.NANOMUSCULAR_SWELL_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "adaptive_talons":
		return LadderRules.AMBUSHER_TALONS_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "seismic_spines":
		return LadderRules.AMBUSHER_SPINES_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "chitinous_plating":
		return LadderRules.CHITINOUS_PLATING_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "anabolic_synthesis":
		return LadderRules.ANABOLIC_SYNTHESIS_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "pneumatized_carapace":
		return LadderRules.PNEUMATIZED_CARAPACE_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "microbial_shroud":
		return LadderRules.MICROBIAL_SHROUD_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "neural_tether":
		return LadderRules.NEURAL_TETHER_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "transit":
		return LadderRules.TRANSIT_RESEARCH if ladder_rules and not upgrades.get("transit", 0) else {}
	if upgrade == "resonant_glaives":
		return LadderRules.GLAIVE_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "canticle_storm":
		return LadderRules.STORM_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "shadow_stride":
		return LadderRules.SHADOW_STRIDE_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade in ["charge", "phase_step"]:
		if not ladder_rules or upgrades.get(upgrade, 0):
			return {}
		return LadderRules.CHARGE_RESEARCH if upgrade == "charge" else LadderRules.PHASE_STEP_RESEARCH
	if LadderRules.ROBOTICS_UPGRADES.has(upgrade):
		return LadderRules.ROBOTICS_UPGRADES[upgrade] if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if LadderRules.CONCORD_FORGE_UPGRADES.has(upgrade):
		var completed := int(upgrades.get(upgrade, 0))
		if not ladder_rules or completed >= MAX_UPGRADE_LEVEL:
			return {}
		var price: int = LadderRules.CONCORD_FORGE_UPGRADES[upgrade][completed]
		return {"level": completed + 1, "crystal": price, "aether": price, "supply": 0,
			"time": LadderRules.CONCORD_FORGE_TIMES[completed], "requires": ["twilight_array"] if completed > 0 else []}
	if upgrade in ["rolling_spores", "spore_burrow"]:
		if ladder_rules:
			return LadderRules.ROLLING_SPORES_RESEARCH if upgrade == "rolling_spores" and not upgrades.get(upgrade, 0) else {}
		var rolling := upgrade == "rolling_spores"
		return {} if upgrades.get(upgrade, 0) else {"level": 1, "crystal": 100 if rolling else 50,
			"aether": 100 if rolling else 50, "supply": 0, "time": 71.0 if rolling else 45.0,
			"requires": ["blight_spire"] if rolling else []}
	if upgrade == "metabolic_boost":
		return LadderRules.METABOLIC_BOOST_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "adrenal_glands":
		return LadderRules.ADRENAL_GLANDS_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "pulse_crystals":
		return LadderRules.PULSE_CRYSTALS_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "flux_vanes":
		return LadderRules.FLUX_VANES_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "tectonic_resonance":
		return LadderRules.TECTONIC_RESONANCE_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade == "agent_cloak":
		return LadderRules.PERSONAL_CLOAK_RESEARCH if ladder_rules and not upgrades.get(upgrade, 0) else {}
	if upgrade in ["concord_air_weapons", "concord_air_armor"]:
		var level := int(upgrades.get(upgrade, 0))
		if not ladder_rules or level >= MAX_UPGRADE_LEVEL:
			return {}
		var cost := 100 + level * 75
		return {"level": level + 1, "crystal": cost, "aether": cost, "supply": 0,
			"time": LadderRules.CONCORD_AIR_TIMES[level], "requires": ["fleet_spire"] if level > 0 else []}
	if ladder_rules and upgrade in ["brood_melee", "brood_missiles", "brood_carapace", "brood_air_weapons", "brood_air_armor"]:
		var level := int(upgrades.get(upgrade, 0))
		if level >= MAX_UPGRADE_LEVEL:
			return {}
		var cost := 100 + level * 75 if upgrade.begins_with("brood_air_") else (150 if upgrade == "brood_carapace" else 100) + level * 50
		return {"level": level + 1, "crystal": cost, "aether": cost, "supply": 0,
			"time": LadderRules.BROOD_GROUND_UPGRADE_TIMES[level], "requires": LadderRules.BROOD_GROUND_UPGRADE_TECH[level]}
	if upgrade in ["brood_melee", "brood_carapace"]:
		var level := int(upgrades.get(upgrade, 0))
		return {} if level >= MAX_UPGRADE_LEVEL else {"level": level + 1, "crystal": 100 + level * 50,
			"aether": 100 + level * 50, "supply": 0, "time": 40.0 + level * 15.0,
			"requires": ["blight_spire"] if level > 0 else []}
	if not upgrades.has(upgrade):
		return {}
	var completed: int = upgrades[upgrade]
	var max_level := 1 if campaign_research else MAX_UPGRADE_LEVEL
	if completed >= max_level:
		return {}
	return {"level": completed + 1, "crystal": 100 + completed * 75, "aether": 100 + completed * 75,
		"supply": 0, "time": Campaign.INFANTRY_RESEARCH_SECONDS if campaign_research else 40.0 + completed * 15.0, "requires": []}

func research_block_reason(owner_id: int, upgrade: String) -> String:
	if research_offer(owner_id, upgrade).is_empty():
		return "Research already completed." if upgrade in ["surge_efficiency", "fast_deployment"] else "All levels researched."
	for structure in units.values():
		if structure.owner != owner_id or not structure.is_structure:
			continue
		for item in structure.production_queue:
			if item.get("upgrade") == upgrade:
				return "Research already queued."
	return ""

func _research_module_parent(module: Dictionary) -> Dictionary:
	var parent: Dictionary = units.get(int(module.get("attachment_parent_tag", 0)), {})
	return parent if _attachment_link_valid(parent, module) and not parent.has("flight_transition") else {}

func research_module_abilities(module: Dictionary) -> Array:
	var parent := _research_module_parent(module)
	if parent.is_empty():
		return []
	var abilities: Array = RTSData.get_unit_def(parent.unit_type).get("abilities", [])
	return abilities.filter(func(id): return RTSData.get_ability_def(id).get("requires_attachment") == "research_module")

func research_producer_block_reason(selected: Dictionary, upgrade: String) -> String:
	var ability: Dictionary = RTSData.get_ability_def("research_" + upgrade)
	var structure := selected
	if ladder_rules and selected.get("unit_type") == "research_module":
		if ability.get("requires_attachment") != "research_module":
			return "This research does not belong to a Research Module."
		structure = _research_module_parent(selected)
	var producer_matches: bool = structure.get("unit_type") == ability.get("producer") or (structure.get("unit_type") == "field_armory" and upgrade in ["weapons", "armor"])
	if structure.is_empty() or not producer_matches or structure.build_progress < 1.0 or structure.flight_height > 0.0 or structure.has("flight_transition"):
		return "Requires a completed research producer."
	if campaign != null and structure.owner == 1 and structure.unit_type != "field_armory":
		return "Campaign infantry research requires a Field Armory."
	for required in research_offer(structure.owner, upgrade).get("requires", []):
		if not has_tech_structure(structure.owner, required):
			return "Requires a completed %s." % RTSData.get_unit_def(required).name
	if requires_power(structure.unit_type) and not is_powered(structure.owner, structure.pos):
		return "The structure needs a friendly power field."
	var required_attachment := str(ability.get("requires_attachment", ""))
	var queue_owner := structure
	if not required_attachment.is_empty():
		var attachment := production_attachment(structure)
		if attachment.get("unit_type") != required_attachment:
			return "Requires a completed Research Module."
		if ladder_rules:
			queue_owner = attachment
	if _structure_lane_size(queue_owner) >= PRODUCTION_QUEUE_CAPACITY:
		return "%s queue is full." % queue_owner.name
	return ""

func _enqueue_research(selected: Dictionary, upgrade: String) -> bool:
	if not research_producer_block_reason(selected, upgrade).is_empty():
		return false
	var required_attachment: String = RTSData.get_ability_def("research_" + upgrade).get("requires_attachment", "")
	var structure := selected
	if ladder_rules and required_attachment == "research_module" and selected.unit_type != "research_module":
		structure = production_attachment(selected)
	if not research_block_reason(structure.owner, upgrade).is_empty():
		return false
	var offer := research_offer(structure.owner, upgrade)
	var player: Dictionary = players[structure.owner]
	if player.crystal < offer.crystal or player.aether < offer.aether:
		return false
	player.crystal -= offer.crystal
	player.aether -= offer.aether
	var job := {
		"upgrade": upgrade, "level": offer.level,
		"crystal_cost": offer.crystal, "aether_cost": offer.aether,
		"progress": 0.0, "total_time": offer.time * research_time_scale(structure.owner),
	}
	if not ladder_rules and not required_attachment.is_empty():
		job["requires_attachment"] = required_attachment
	structure.production_queue.append(job)
	return true

func structure_evolution_block_reason(producer: Dictionary, form: String) -> String:
	var source: String = LadderRules.GNARL_STRUCTURE_EVOLUTIONS[form]
	if not ladder_rules or producer.get("structure_form", producer.get("unit_type")) != source or producer.build_progress < 1.0:
		return "Requires a completed %s." % RTSData.get_unit_def(source).name
	if producer.production_queue.any(func(item): return item.get("structure_evolution", false)):
		return "This structure already has an evolution queued."
	if _structure_lane_size(producer) >= PRODUCTION_QUEUE_CAPACITY:
		return "%s queue is full." % producer.name
	var definition := RTSData.get_unit_def(form)
	for required in definition.requires:
		if not has_tech_structure(producer.owner, required):
			return "Requires a completed %s." % RTSData.get_unit_def(required).name
	var bank: Dictionary = players[producer.owner]
	if bank.crystal < definition.crystal_cost or bank.aether < definition.aether_cost:
		return "Requires %d crystal and %d aether." % [definition.crystal_cost, definition.aether_cost]
	return ""

func _enqueue_structure_evolution(producer: Dictionary, form: String) -> void:
	var definition := RTSData.get_unit_def(form)
	var bank: Dictionary = players[producer.owner]
	bank.crystal -= definition.crystal_cost
	bank.aether -= definition.aether_cost
	producer.production_queue.append({"unit_type": form, "structure_evolution": true, "supply_cost": 0,
		"crystal_cost": definition.crystal_cost, "aether_cost": definition.aether_cost,
		"progress": 0.0, "total_time": definition.build_time})

func _structure_lane_size(producer: Dictionary) -> int:
	if ladder_rules and uses_brood_slots(producer):
		return producer.production_queue.filter(func(item): return not item.has("egg_tag")).size()
	return producer.production_queue.size()

func _brood_egg_index(nest: Dictionary, tag: int) -> int:
	var jobs: Array = nest.get("production_queue", [])
	for index in range(jobs.size()):
		if jobs[index].get("egg_tag", 0) == tag:
			return index
	return -1

func _cancel_training(structure: Dictionary, index: int) -> bool:
	var queue: Array = structure.production_queue
	if (not structure.is_structure and structure.unit_type != "brood_egg") or index < 0 or index >= queue.size():
		return false
	var player: Dictionary = players.get(structure.owner, {})
	if player.is_empty():
		return false
	var item: Dictionary = queue.pop_at(index)
	units.erase(int(item.get("egg_tag", 0)))
	if not ladder_rules and uses_brood_slots(structure) and structure.brood_slots < BROOD_SLOT_CAP:
		if item.get("brood_bonus_slot", false):
			structure.brood_bonus_slots += 1
			structure.brood_slots += 1
		elif structure.brood_slots - structure.brood_bonus_slots < BROOD_SLOTS:
			structure.brood_slots += 1
			if structure.brood_slots - structure.brood_bonus_slots == BROOD_SLOTS:
				structure.brood_recharge = 0.0
	var definition: Dictionary = RTSData.get_unit_def(item.get("unit_type", ""))
	var refund := 0.75 if item.get("structure_evolution", false) else 1.0
	player.crystal += floori(int(item.get("crystal_cost", definition.get("crystal_cost", 50))) * refund)
	player.aether += floori(int(item.get("aether_cost", definition.get("aether_cost", 0))) * refund)
	_recompute_supplies()
	return true

func construction_time(unit_type: String) -> float:
	if campaign != null and Campaign.CONSTRUCTION_TIMES.has(unit_type):
		return Campaign.CONSTRUCTION_TIMES[unit_type]
	return float(RTSData.get_unit_def(unit_type).get("build_time", 20.0))

func research_time_scale(owner_id: int) -> float:
	return 1.0 if ladder_rules or not match_state.is_empty() or (campaign != null and owner_id == 1) else 0.25

func _recompute_supplies() -> void:
	for pid in players.keys():
		players[pid]["supply_used"] = 0
		players[pid]["supply_cap"] = 0

	for u in units.values():
		var pid = u.get("neural_original_owner", u.owner)
		if not players.has(pid) or u.get("campaign_reserve", false) or u.get("hallucinated", false):
			continue
		var def = RTSData.get_unit_def(u["unit_type"])
		if u.build_progress >= 1.0:
			players[pid]["supply_cap"] += supply_from(u)
		if u["is_structure"] or u.unit_type == "brood_egg":
			for q in u["production_queue"]:
				players[pid]["supply_used"] += production_supply_reserved(q)
		else:
			players[pid]["supply_used"] += def.get("supply_cost", 1)
			if u.has("carapace_morph_until"):
				players[pid]["supply_used"] += CARAPACE_MORPH_OFFER.supply
		for passenger in u.get("passengers", []):
			if not passenger.get("hallucinated", false):
				players[passenger.owner]["supply_used"] += RTSData.get_unit_def(passenger.unit_type).get("supply_cost", 1)
	for pid in players:
		for passenger in brood_tunnel_cargo.get(pid, []):
			if not passenger.get("hallucinated", false):
				players[pid]["supply_used"] += RTSData.get_unit_def(passenger.unit_type).get("supply_cost", 1)
		players[pid]["supply_cap"] = mini(200, players[pid]["supply_cap"])

func is_dropoff(unit: Dictionary, owner_id: int) -> bool:
	return (not unit.is_empty() and unit.owner == owner_id and unit.build_progress >= 1.0 and unit.hp > 0.0
		and unit.get("is_town_hall", false) and unit.flight_height <= 0.0 and not unit.has("flight_transition"))

func _find_nearest_town_hall(owner_id: int, pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for u in _town_halls:
		if is_dropoff(u, owner_id):
			var d = pos.distance_squared_to(u.pos)
			if d < best_d:
				best_d = d
				best = u
	return best

func worker_saturation(owner_id: int) -> Dictionary:
	var sites := {}
	var deposits := {}
	for unit in units.values():
		if unit.owner != owner_id or not unit.is_structure or unit.build_progress < 1.0:
			continue
		if unit.is_extractor:
			var vent: int = _gas_source_by_tap.get(unit.tag, 0)
			var source: Dictionary = resources.get(vent, {})
			if not source.is_empty() and (source.amount > 0 or unlimited_resources):
				sites[unit.tag] = {"assigned": 0, "ideal": GAS_WORKER_SLOTS, "type": "aether"}
				deposits[vent] = unit.tag
				deposits[unit.tag] = unit.tag
		elif is_dropoff(unit, owner_id):
			sites[unit.tag] = {"assigned": 0, "ideal": 0, "type": "crystal"}
	for patch in resources.values():
		if patch.resource_type != "crystal_field" or (patch.amount <= 0 and not unlimited_resources):
			continue
		if vision != null and vision.state_at(owner_id, patch.pos) == Vision.UNEXPLORED:
			continue
		var origin: Vector2 = patch.get("line_origin", patch.pos)
		var hall := _find_nearest_town_hall(owner_id, origin)
		if hall.is_empty():
			continue
		var reach: float = hall.radius + 2.0 if patch.has("line_origin") else CRYSTAL_LINE_RADIUS
		if hall.pos.distance_squared_to(origin) <= reach * reach:
			sites[hall.tag].ideal += 2
			deposits[patch.tag] = hall.tag
	for worker in units.values():
		if worker.owner != owner_id or not worker.is_worker:
			continue
		for order in worker.orders:
			if order.type == "return_cargo":
				continue
			if order.type == "harvest" and deposits.has(order.target_tag):
				sites[deposits[order.target_tag]].assigned += 1
			break
	return sites

func _find_nearest_crystal(pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for r in resources.values():
		if r["resource_type"] == "crystal_field" and (r["amount"] > 0 or unlimited_resources):
			var d = pos.distance_to(r["pos"])
			if d < best_d:
				best_d = d
				best = r
	return best

func _pick_local_crystal(worker: Dictionary, preferred: Dictionary, mode: CrystalSelection = CrystalSelection.LINE_ASSIGNMENT) -> Dictionary:
	if preferred.is_empty():
		return {}
	var assignments := {}
	for other in units.values():
		if other.tag == worker.tag or other.owner != worker.owner or not other.is_worker or other.orders.is_empty():
			continue
		var order: Dictionary = other.orders[0]
		if order.type == "harvest":
			assignments[order.target_tag] = int(assignments.get(order.target_tag, 0)) + 1
	var best := preferred
	var balance_slots := mode == CrystalSelection.OPEN_SLOT
	# The current patch count excludes this worker. A strictly smaller
	# alternative improves the balance after this worker changes patches.
	var best_count := int(assignments.get(preferred.tag, 0)) if balance_slots else 2147483647
	var best_distance := -INF if balance_slots else INF
	for patch in resources.values():
		if patch.resource_type != "crystal_field" or (patch.amount <= 0 and not unlimited_resources):
			continue
		if preferred.has("line_origin"):
			if patch.get("line_origin") != preferred.line_origin:
				continue
		elif patch.pos.distance_squared_to(preferred.pos) > CRYSTAL_LINE_RADIUS * CRYSTAL_LINE_RADIUS:
			continue
		if vision != null and vision.state_at(worker.owner, patch.pos) == Vision.UNEXPLORED:
			continue
		if balance_slots and patch.mining_worker != 0:
			continue
		var count: int = assignments.get(patch.tag, 0)
		var distance: float = patch.pos.distance_squared_to(worker.pos)
		if count < best_count or (count == best_count and distance < best_distance):
			if mode != CrystalSelection.LINE_ASSIGNMENT:
				if patch.tag == preferred.tag:
					continue
				var reach: float = worker.radius + patch.radius + HARVEST_REACH
				var path := compute_smooth_path(worker.pos, patch.pos, worker.radius, false, reach)
				if path.back().distance_squared_to(patch.pos) > reach * reach:
					continue
			best = patch
			best_count = count
			best_distance = distance
	return best

func _observed_orders(orders: Array) -> Array:
	var observed := orders.duplicate(true)
	for order in observed:
		order.erase("_formation")
		order.erase("_formation_anchor")
		order.erase("_reachable_request")
		order.erase("_pursuit_origins")
		order.erase("_blocked_crystal_revision")
		order.erase("_defense_intercept")
	return observed

func get_observation(perspective_player: int = 0) -> Dictionary:
	var limited := vision != null and perspective_player != 0
	var unit_list: Array = []
	var all_tags = units.keys()
	all_tags.sort()
	for tag in all_tags:
		var u = units[tag]
		if perspective_player != 0 and not can_see_unit(perspective_player, u):
			continue
		var disguised: bool = perspective_player > 0 and u.owner != perspective_player and u.has("disguise_type")
		var visible_type: String = u.disguise_type if disguised else u.unit_type
		var visible_owner: int = u.disguise_owner if disguised else u.owner
		var visible_definition := RTSData.get_unit_def(visible_type) if disguised else {}
		unit_list.append({
			"tag": u["tag"],
			"id": visible_type if disguised else u["id"],
			"unit_type": visible_type,
			"faction": visible_definition.faction if disguised else u["faction"],
			"name": visible_definition.name if disguised else u["name"],
			"owner": visible_owner,
			"pos": {"x": snappedf(u["pos"].x, 0.01), "y": snappedf(u["pos"].y, 0.01), "z": snappedf(unit_elevation(u), 0.01)},
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
			"orders": [] if limited and u.owner != perspective_player else _observed_orders(u.orders),
			"production_queue_len": 0 if limited and u.owner != perspective_player else u["production_queue"].size(),
			"kills": u["kills"]
		})
		var entry: Dictionary = unit_list.back()
		if can_identify_hallucination(perspective_player, u):
			entry["hallucinated"] = true
		if u.owner == perspective_player or perspective_player == 0:
			if u.has("disguise_type"):
				entry["disguised_as"] = u.disguise_type
			if u.get("campaign_scripted", false):
				entry["campaign_scripted"] = true
			if u.has("passengers"):
				entry["passengers"] = u.passengers.map(func(passenger): return passenger.tag)
			if _is_brood_tunnel_endpoint(u):
				entry["tunnel_cargo"] = brood_tunnel_cargo_count(u)
			elif u.unit_type == "tunnel_mouth":
				entry["tunnel_partner"] = linked_tunnel(u).get("tag", 0)
				if u.has("tunnel_arrival"):
					entry["tunnel_ticks"] = maxi(0, int(u.tunnel_arrival) - tick)
		if u.has("expires_tick") and not disguised:
			entry["lifetime_ticks"] = maxi(0, int(u.expires_tick) - tick)
		if u.get("burrowed", false):
			entry["burrowed"] = true
		if u.get("rich_extractor", false):
			entry["rich_extractor"] = true
		if u.has("structure_form"):
			entry["structure_form"] = u.structure_form
		if u.get("crawler_uprooted", false):
			entry["crawler_uprooted"] = true
		if u.has("crawler_transition"):
			entry["crawler_transition_ticks"] = maxi(0, int(u.crawler_transition.finish) - tick)
		if u.has("burrow_transition"):
			entry["burrow_transition"] = "down" if u.burrow_transition.down else "up"
			entry["burrow_transition_ticks"] = maxi(0, int(u.burrow_transition.finish) - tick)
		if u.has("living_ground_speed_bonus"):
			entry["effective_speed"] = snappedf(effective_move_speed(u), 0.01)
			entry["living_ground_speed_bonus"] = active_living_ground_speed_bonus(u)
		if u.flight_height > 0.0:
			entry["airborne"] = true
		if u.has("flight_transition"):
			entry["flight_transition"] = u.flight_transition.kind
			entry["flight_transition_ticks"] = maxi(0, int(u.flight_transition.end) - tick)
		if u.has("silo_raise_until"):
			entry["silo_raise_ticks"] = int(u.silo_raise_until) - tick
		if u.has("fighter_mode_until") and (not limited or u.owner == perspective_player):
			entry["fighter_mode_ticks"] = maxi(0, int(u.fighter_mode_until) - tick)
		if u.has("carapace_morph_until"):
			entry["carapace_morph_ticks"] = maxi(0, int(u.carapace_morph_until) - tick)
		if u.has("sporeburst_morph_until"):
			entry["sporeburst_morph_ticks"] = maxi(0, int(u.sporeburst_morph_until) - tick)
		if u.has("brood_morph") and (not limited or u.owner == perspective_player):
			entry["brood_morph_ticks"] = maxi(0, int(u.brood_morph.finish) - tick)
		if u.unit_type == "sporeburst":
			entry["target_structures"] = u.get("target_structures", false)
			entry["rolling_spores"] = u.get("rolling_spores", false)
		if u.get("hold_fire", false):
			entry["hold_fire"] = true
		match u.unit_type:
			"colony_hub", "heartstone":
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["hub_operations"] = u.get("hub_operations", false)
			"skirmisher":
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["cloaked"] = u.get("cloaked", false) or flagship_cloaks(u)
			"lumen_carrier":
				entry["power_field_active"] = carrier_power_active(u)
				if not limited or u.owner == perspective_player:
					entry["power_field_ticks"] = carrier_power_ticks(u)
					entry["power_field_rearm_ticks"] = carrier_rearm_ticks(u)
			"silo", "silo_retracted":
				entry["supply_reinforced"] = u.get("supply_reinforced", false)
		if u.has("salvage_finish"):
			entry["salvage_ticks"] = maxi(0, int(u.get("salvage_finish", 0)) - tick)
		if u.unit_type == "pioneer":
			entry["auto_repair"] = u.get("auto_repair", false)
		if not limited or u.owner == perspective_player:
			if u.unit_type == "waystone":
				entry["fast_deployment_ticks"] = fast_deployment_ticks(u)
				if not u.production_queue.is_empty() and u.production_queue[0].has("deployment_pos"):
					var deployment: Vector2 = u.production_queue[0].deployment_pos
					entry["deployment_target"] = {"x": deployment.x, "y": deployment.y}
			if u.has("production_boost_until"):
				entry["production_boost_ticks"] = production_boost_ticks(u)
			if u.has("energy_profile"):
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["max_energy"] = u.energy_profile.max
			if u.has("attachment_tag"):
				entry["attachment_tag"] = u.attachment_tag
			if u.has("attachment_parent_tag"):
				entry["attachment_parent_tag"] = u.attachment_parent_tag
			if u.has("support"):
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["max_energy"] = u.support.max_energy
				entry["support_target_tag"] = u.support_target_tag
				if u.support.stat == "hp":
					entry["auto_heal"] = u.get("auto_heal", false)
			if not u.rally_route.is_empty():
				entry["rally_route"] = _observed_rally(u.rally_route)
			if u.unit_type == "brood_nest" and not u.worker_rally_route.is_empty():
				entry["worker_rally_route"] = _observed_rally(u.worker_rally_route)
			if uses_brood_slots(u):
				entry["brood_slots"] = u.brood_slots
				entry["brood_inject_remaining"] = brood_inject_remaining(u)
			if requires_power(u.unit_type):
				entry["powered"] = is_powered(u.owner, u.pos)
			if u.is_structure and u.build_progress < 1.0:
				entry["builder_tag"] = construction_builder(u).get("tag", 0)
			if not u.production_queue.is_empty():
				entry["production_progress"] = u.production_queue.map(func(item): return snappedf(item.progress, 0.01))
				entry["production_active_slots"] = active_production_slots(u)

	var res_list: Array = []
	for r in resources.values():
		if limited and not can_see_position(perspective_player, r.pos):
			continue
		res_list.append({
			"tag": r["tag"],
			"id": r["id"],
			"resource_type": r["resource_type"],
			"pos": {"x": r["pos"].x, "y": r["pos"].y, "z": snappedf(get_elevation_at(r["pos"]), 0.01)},
			"amount": r["amount"],
			"rich": r.rich,
			"yield": deposit_yield(r),
			"present": deposit_present(r),
			"unlimited": unlimited_resources
		})

	var match_view := match_state.duplicate(true)
	var player_view := players.duplicate(true)
	var events := recent_events.slice(max(0, recent_events.size() - 15))
	if perspective_player != 0:
		events = []
	var memory := []
	if limited:
		if match_view.has("assigned_starts"):
			var slot = match_view.assigned_starts.get(str(perspective_player))
			match_view.assigned_starts = {str(perspective_player): slot} if slot != null else {}
		for player in player_view.keys():
			if player != perspective_player:
				player_view[player] = {"id": player, "name": players[player].name, "faction": players[player].faction}
		for building in remembered_buildings(perspective_player):
			var snapshot: Dictionary = building.duplicate()
			snapshot.pos = {"x": building.pos.x, "y": building.pos.y}
			memory.append(snapshot)
	var observation := {
		"tick": tick,
		"match": match_view,
		"campaign": campaign.snapshot(self, perspective_player) if campaign != null and perspective_player in [0, 1] else {},
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
			"water": _polygons_to_arrays(water_polygons), "bridges": _rects_to_dicts(land_bridges),
			"ground_regions": _polygons_to_arrays(ground_regions), "bridge_decks": _polygons_to_arrays(bridge_decks),
			"terrain_tiles": terrain_tiles.duplicate(true),
			"living_ground": {
				"cell_size": LivingGround.CELL_SIZE,
				"cells": visible_living_ground_cells(perspective_player).map(func(cell): return {"x": cell.x, "y": cell.y}),
			}
		},
		"players": player_view,
		"units": unit_list,
		"resources": res_list,
		"recall_markers": defensive_recall_markers_for(perspective_player),
		"recent_events": events
	}
	if not watch_stations.is_empty():
		observation.map["watch_stations"] = watch_stations.map(func(station):
			return {"x": station.pos.x, "y": station.pos.y, "owner": visible_watch_station_owner(station, perspective_player), "capture_radius": WATCH_STATION_CAPTURE, "sight_radius": WATCH_STATION_SIGHT}
		)
	if terrain_grid:
		var bounds := terrain_grid.bounds
		observation.map["playable_bounds"] = {"x": bounds.position.x, "y": bounds.position.y, "w": bounds.size.x, "h": bounds.size.y}
	if not miasma_zones.is_empty():
		observation["miasma"] = visible_miasma(perspective_player)
	if not lattice_bursts.is_empty():
		observation["lattice_bursts"] = visible_lattice_bursts(perspective_player)
	if limited:
		observation["vision"] = {
			"width": vision.size.x, "height": vision.size.y, "cell_size": Vision.CELL_SIZE,
			"cells": Array(vision.cells_for(perspective_player)),
			"last_seen_buildings": memory,
		}
	return observation

func _observed_rally(route: Array) -> Array:
	return route.map(func(waypoint):
		var position := rally_waypoint_position(waypoint)
		return {"kind": waypoint.kind, "target_tag": waypoint.target_tag, "x": position.x, "y": position.y})

func _polygons_to_arrays(polygons: Array[PackedVector2Array]) -> Array:
	var out: Array = []
	for polygon in polygons:
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
