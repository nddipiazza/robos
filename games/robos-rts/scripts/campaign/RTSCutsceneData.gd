extends RefCounted

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")

const MISSION_LANDING_POINTS := [
	Vector2(121, 119),   # 01 Cut the Signal
	Vector2(100, 124),   # 02 The White Ridge Job
	Vector2(120, 120),   # 03 Hold for Dawn
	Vector2(169.95, 225),# 04 The Last Road
	Vector2(108, 144.5), # 05 Ashfall Quarantine
	Vector2(70, 122),    # 06 Redstone Claim
	Vector2(104, 147),   # 07 The Shattered Shrine
	Vector2(92, 74),     # 08 Sanctuary Skies
	Vector2(108, 111),   # 09 Iron Intercept
	Vector2(183, 179),   # 10 Verdant Pressure
	Vector2(58, 169),    # 11 Vaultbreaker
]

const OPENING_CUES := [
	"arrival", "dig_brief", "siege", "evac_arrival", "quarantine_start",
	"redstone_start", "shrine_start", "sanctuary_start",
	"iron_intercept_start", "verdant_pressure_start", "vaultbreaker_start",
]

const DIORAMA_SPECS := {
	"m0_vesper": {
		"ground": Color("#2a323a"), "sky": Color("#0b1522"), "fog": Color("#152436"),
		"actors": [
			{"unit": "rampart_transport", "owner": 1, "pos": Vector3(-5.5, 4.2, -3.5), "vel": Vector3(1.1, -0.45, 0.6), "yaw": 0.45},
			{"unit": "rifleman", "owner": 1, "pos": Vector3(-2.4, 0.0, 2.6), "vel": Vector3(1.15, 0.0, -0.75), "yaw": -0.6, "fire_at": Vector3(4.5, 0.8, -2.2)},
			{"unit": "rifleman", "owner": 1, "pos": Vector3(-3.8, 0.0, 3.4), "vel": Vector3(1.15, 0.0, -0.75), "yaw": -0.6, "fire_at": Vector3(5.2, 0.8, -1.5)},
			{"unit": "rifleman", "owner": 1, "pos": Vector3(-1.2, 0.0, 3.6), "vel": Vector3(1.15, 0.0, -0.75), "yaw": -0.6, "fire_at": Vector3(4.0, 0.8, -2.8)},
			{"unit": "propaganda_statue", "owner": 2, "pos": Vector3(5.2, 0.0, -2.8), "vel": Vector3.ZERO, "yaw": 2.4},
			{"unit": "rifleman", "owner": 2, "pos": Vector3(4.2, 0.0, -1.6), "vel": Vector3.ZERO, "yaw": 2.5, "fire_at": Vector3(-2.0, 0.8, 2.4)},
			{"unit": "rifleman", "owner": 2, "pos": Vector3(5.6, 0.0, -1.0), "vel": Vector3.ZERO, "yaw": 2.5, "fire_at": Vector3(-3.0, 0.8, 3.0)},
		],
		"cam_from": Vector3(-8.5, 4.6, 9.2), "cam_to": Vector3(-4.2, 3.4, 6.4), "look": Vector3(1.2, 1.0, -0.4),
	},
	"m1_ridge": {
		"ground": Color("#6d7b88"), "sky": Color("#0f1c29"), "fog": Color("#1e3142"),
		"actors": [
			{"unit": "colony_hub", "owner": 1, "pos": Vector3(-4.6, 0.0, 1.8), "vel": Vector3.ZERO, "yaw": 0.2},
			{"unit": "pioneer", "owner": 1, "pos": Vector3(-1.6, 0.0, 2.8), "vel": Vector3(0.5, 0.0, -0.3), "yaw": -0.4},
			{"unit": "rifleman", "owner": 1, "pos": Vector3(-0.4, 0.0, 1.2), "vel": Vector3(0.95, 0.0, -0.45), "yaw": -0.5, "fire_at": Vector3(5.0, 0.8, -2.0)},
			{"unit": "triage_specialist", "owner": 1, "pos": Vector3(-1.8, 0.0, 1.6), "vel": Vector3(0.85, 0.0, -0.4), "yaw": -0.5},
			{"unit": "breacher", "owner": 2, "pos": Vector3(4.8, 0.0, -2.0), "vel": Vector3.ZERO, "yaw": 2.6, "fire_at": Vector3(-0.4, 0.8, 1.2)},
			{"unit": "aether_prism", "owner": 3, "pos": Vector3(6.4, 0.3, -3.2), "vel": Vector3.ZERO, "yaw": 0.8},
		],
		"cam_from": Vector3(-8.8, 5.2, 8.8), "cam_to": Vector3(-3.6, 3.8, 6.2), "look": Vector3(1.0, 1.1, -0.6),
	},
	"m2_bridges": {
		"ground": Color("#543828"), "sky": Color("#1a0f12"), "fog": Color("#2e1916"),
		"actors": [
			{"unit": "field_bunker", "owner": 1, "pos": Vector3(-3.4, 0.0, 1.4), "vel": Vector3.ZERO, "yaw": -0.5, "fire_at": Vector3(3.8, 0.5, -1.6)},
			{"unit": "sentry_turret", "owner": 1, "pos": Vector3(-5.2, 0.0, -0.8), "vel": Vector3.ZERO, "yaw": -0.4, "fire_at": Vector3(4.2, 2.8, -2.5)},
			{"unit": "rampart_transport", "owner": 1, "pos": Vector3(-6.5, 4.8, 3.0), "vel": Vector3(0.9, -0.35, -0.4), "yaw": -0.4},
			{"unit": "skitterling", "owner": 2, "pos": Vector3(3.4, 0.0, -1.2), "vel": Vector3(-1.5, 0.0, 0.65), "yaw": 2.7},
			{"unit": "skitterling", "owner": 2, "pos": Vector3(4.6, 0.0, -2.2), "vel": Vector3(-1.5, 0.0, 0.65), "yaw": 2.7},
			{"unit": "bile_crawler", "owner": 2, "pos": Vector3(5.5, 0.0, -0.6), "vel": Vector3(-1.0, 0.0, 0.45), "yaw": 2.7, "fire_at": Vector3(-3.4, 0.8, 1.4)},
			{"unit": "needlewing", "owner": 2, "pos": Vector3(4.4, 3.2, -2.6), "vel": Vector3(-1.1, -0.1, 0.5), "yaw": 2.6},
		],
		"cam_from": Vector3(-8.4, 4.8, 8.6), "cam_to": Vector3(-4.8, 3.6, 5.8), "look": Vector3(0.8, 1.0, -0.5),
	},
	"m3_convoy": {
		"ground": Color("#4b5836"), "sky": Color("#0e1a14"), "fog": Color("#1b2e22"),
		"actors": [
			{"unit": "settlement_truck", "owner": 1, "pos": Vector3(-4.5, 0.0, 2.2), "vel": Vector3(1.35, 0.0, -0.65), "yaw": -0.45},
			{"unit": "settlement_truck", "owner": 1, "pos": Vector3(-7.4, 0.0, 3.6), "vel": Vector3(1.35, 0.0, -0.65), "yaw": -0.45},
			{"unit": "torchguard", "owner": 1, "pos": Vector3(-1.8, 0.0, 0.6), "vel": Vector3(1.1, 0.0, -0.5), "yaw": -0.35, "flame": true},
			{"unit": "torchguard", "owner": 1, "pos": Vector3(-2.6, 0.0, 2.8), "vel": Vector3(1.1, 0.0, -0.5), "yaw": -0.55, "flame": true},
			{"unit": "skitterling", "owner": 2, "pos": Vector3(3.2, 0.0, -1.4), "vel": Vector3(-1.4, 0.0, 0.6), "yaw": 2.6},
			{"unit": "skitterling", "owner": 2, "pos": Vector3(4.2, 0.0, -0.2), "vel": Vector3(-1.4, 0.0, 0.6), "yaw": 2.6},
		],
		"cam_from": Vector3(-7.6, 4.4, 8.8), "cam_to": Vector3(-2.4, 3.3, 6.0), "look": Vector3(-0.2, 0.9, 0.4),
	},
	"m4_ashfall": {
		"ground": Color("#2d2628"), "sky": Color("#12090d"), "fog": Color("#291418"),
		"actors": [
			{"unit": "cinder_runner", "owner": 1, "pos": Vector3(-4.2, 0.0, 2.0), "vel": Vector3(1.8, 0.0, -0.8), "yaw": -0.42, "flame": true},
			{"unit": "cinder_runner", "owner": 1, "pos": Vector3(-5.8, 0.0, 0.4), "vel": Vector3(1.8, 0.0, -0.8), "yaw": -0.42, "flame": true},
			{"unit": "blighted_home", "owner": 2, "pos": Vector3(3.6, 0.0, -2.2), "vel": Vector3.ZERO, "yaw": 0.3},
			{"unit": "blighted_colonist", "owner": 2, "pos": Vector3(1.8, 0.0, -0.6), "vel": Vector3(-1.1, 0.0, 0.5), "yaw": 2.6},
			{"unit": "blighted_rifleman", "owner": 2, "pos": Vector3(2.9, 0.0, 0.8), "vel": Vector3(-0.9, 0.0, 0.4), "yaw": 2.6},
		],
		"cam_from": Vector3(-8.2, 4.2, 8.2), "cam_to": Vector3(-3.0, 3.1, 5.6), "look": Vector3(0.6, 0.9, -0.6),
	},
	"m5_redstone": {
		"ground": Color("#4a1b12"), "sky": Color("#1f0804"), "fog": Color("#471509"), "lava_glow": true,
		"actors": [
			{"unit": "ridge_scout", "owner": 1, "pos": Vector3(-3.2, 0.6, 1.8), "vel": Vector3(1.4, 0.35, -0.7), "yaw": -0.45, "fire_at": Vector3(3.6, 0.8, -1.6)},
			{"unit": "ridge_scout", "owner": 1, "pos": Vector3(-4.6, 0.2, 2.8), "vel": Vector3(1.4, 0.42, -0.7), "yaw": -0.45},
			{"unit": "pioneer", "owner": 1, "pos": Vector3(-1.4, 0.0, 3.0), "vel": Vector3(-0.9, 0.0, 0.5), "yaw": 2.4},
			{"unit": "carapace_bulwark", "owner": 2, "pos": Vector3(4.2, 0.0, -1.8), "vel": Vector3(-0.8, 0.0, 0.3), "yaw": 2.6},
		],
		"cam_from": Vector3(-8.0, 5.0, 8.6), "cam_to": Vector3(-3.8, 3.6, 5.8), "look": Vector3(0.5, 1.0, -0.4),
	},
	"m6_shrine": {
		"ground": Color("#24423b"), "sky": Color("#08171c"), "fog": Color("#133036"),
		"actors": [
			{"unit": "aether_prism", "owner": 3, "pos": Vector3(0.8, 0.2, -1.6), "vel": Vector3.ZERO, "yaw": 0.5},
			{"unit": "spire_walker", "owner": 3, "pos": Vector3(3.6, 0.0, -2.4), "vel": Vector3(-0.4, 0.0, 0.2), "yaw": 2.5, "fire_at": Vector3(-2.6, 0.9, 1.8)},
			{"unit": "breacher", "owner": 1, "pos": Vector3(-3.2, 0.0, 2.2), "vel": Vector3(0.95, 0.0, -0.55), "yaw": -0.5, "fire_at": Vector3(3.6, 1.2, -2.4)},
			{"unit": "breacher", "owner": 1, "pos": Vector3(-4.6, 0.0, 1.2), "vel": Vector3(0.95, 0.0, -0.55), "yaw": -0.5, "fire_at": Vector3(3.6, 1.2, -2.4)},
			{"unit": "skitterling", "owner": 2, "pos": Vector3(5.2, 0.0, 1.8), "vel": Vector3(-1.3, 0.0, -0.6), "yaw": -2.6},
		],
		"cam_from": Vector3(-8.2, 4.8, 8.4), "cam_to": Vector3(-3.8, 3.5, 5.6), "look": Vector3(0.8, 1.1, -1.2),
	},
	"m7_sanctuary": {
		"ground": Color("#1d3345"), "sky": Color("#071324"), "fog": Color("#112844"),
		"actors": [
			{"unit": "crownspire", "owner": 3, "pos": Vector3(4.2, 3.8, -2.4), "vel": Vector3(-0.35, 0.0, 0.15), "yaw": 2.6, "beam_to": Vector3(1.5, 0.0, 1.2)},
			{"unit": "colony_hub", "owner": 1, "pos": Vector3(1.5, 0.0, 1.2), "vel": Vector3.ZERO, "yaw": 0.2},
			{"unit": "kestrel_interceptor", "owner": 1, "pos": Vector3(-5.4, 4.2, 2.2), "vel": Vector3(1.9, -0.05, -0.85), "yaw": -0.45, "fire_at": Vector3(4.2, 3.8, -2.4)},
			{"unit": "kestrel_interceptor", "owner": 1, "pos": Vector3(-6.8, 4.7, 0.6), "vel": Vector3(1.9, -0.05, -0.85), "yaw": -0.45, "fire_at": Vector3(4.2, 3.8, -2.4)},
			{"unit": "kestrel_interceptor", "owner": 1, "pos": Vector3(-4.6, 3.7, 3.6), "vel": Vector3(1.9, -0.05, -0.85), "yaw": -0.45, "fire_at": Vector3(4.2, 3.8, -2.4)},
		],
		"cam_from": Vector3(-8.8, 5.8, 8.6), "cam_to": Vector3(-3.6, 4.8, 5.4), "look": Vector3(1.6, 2.8, -1.0),
	},
	"m8_trains": {
		"ground": Color("#694c31"), "sky": Color("#1c120a"), "fog": Color("#382414"),
		"actors": [
			{"unit": "rail_freight", "owner": 2, "pos": Vector3(-5.0, 0.0, -1.2), "vel": Vector3(2.2, 0.0, 0.0), "yaw": 0.0},
			{"unit": "rail_skimmer", "owner": 1, "pos": Vector3(-4.2, 0.0, 2.6), "vel": Vector3(2.1, 0.0, -0.15), "yaw": -0.1, "fire_at": Vector3(0.5, 0.8, -1.2)},
			{"unit": "rail_skimmer", "owner": 1, "pos": Vector3(-6.8, 0.0, 3.2), "vel": Vector3(2.1, 0.0, -0.15), "yaw": -0.1, "fire_at": Vector3(-1.2, 0.8, -1.2)},
			{"unit": "breacher", "owner": 2, "pos": Vector3(1.8, 0.0, -2.8), "vel": Vector3(1.2, 0.0, 0.0), "yaw": 1.4, "fire_at": Vector3(-3.0, 0.7, 2.6)},
		],
		"cam_from": Vector3(-7.5, 4.4, 8.5), "cam_to": Vector3(-1.0, 3.4, 6.2), "look": Vector3(0.5, 0.8, -0.8),
	},
	"m9_verdant": {
		"ground": Color("#1f472a"), "sky": Color("#071a10"), "fog": Color("#113320"),
		"actors": [
			{"unit": "gas_altar", "owner": 0, "pos": Vector3(0.4, 0.0, -1.2), "vel": Vector3.ZERO, "yaw": 0.0},
			{"unit": "pioneer", "owner": 1, "pos": Vector3(-1.2, 0.0, -0.4), "vel": Vector3.ZERO, "yaw": -0.4},
			{"unit": "warden_walker", "owner": 1, "pos": Vector3(-3.4, 0.0, 1.8), "vel": Vector3(0.75, 0.0, -0.35), "yaw": -0.45, "fire_at": Vector3(4.4, 3.2, -2.2)},
			{"unit": "warden_walker", "owner": 1, "pos": Vector3(-1.6, 0.0, 2.6), "vel": Vector3(0.75, 0.0, -0.35), "yaw": -0.45, "fire_at": Vector3(4.0, 0.6, -1.0)},
			{"unit": "prism_ray", "owner": 3, "pos": Vector3(4.4, 3.2, -2.2), "vel": Vector3(-0.85, 0.0, 0.35), "yaw": 2.6, "beam_to": Vector3(-3.4, 1.2, 1.8)},
			{"unit": "sunblade", "owner": 3, "pos": Vector3(4.0, 0.0, -1.0), "vel": Vector3(-1.2, 0.0, 0.5), "yaw": 2.6},
		],
		"cam_from": Vector3(-8.0, 4.8, 8.4), "cam_to": Vector3(-3.8, 3.6, 5.6), "look": Vector3(0.8, 1.3, -0.8),
	},
	"m10_vault": {
		"ground": Color("#383547"), "sky": Color("#0b0a17"), "fog": Color("#1c1930"),
		"actors": [
			{"unit": "vault_drill", "owner": 1, "pos": Vector3(-3.8, 0.0, 1.6), "vel": Vector3.ZERO, "yaw": -0.48, "beam_to": Vector3(5.2, 1.8, -3.2)},
			{"unit": "vault_gate", "owner": 3, "pos": Vector3(5.2, 0.0, -3.2), "vel": Vector3.ZERO, "yaw": 2.6},
			{"unit": "howitzer_emplaced", "owner": 1, "pos": Vector3(-5.6, 0.0, -0.6), "vel": Vector3.ZERO, "yaw": -0.4, "fire_at": Vector3(2.8, 0.8, -0.8)},
			{"unit": "spire_walker", "owner": 3, "pos": Vector3(2.8, 0.0, -0.8), "vel": Vector3(-0.9, 0.0, 0.45), "yaw": 2.6, "fire_at": Vector3(-3.8, 1.2, 1.6)},
			{"unit": "sunblade", "owner": 3, "pos": Vector3(1.8, 0.0, 0.8), "vel": Vector3(-1.2, 0.0, 0.4), "yaw": 2.6},
		],
		"cam_from": Vector3(-8.8, 5.4, 8.8), "cam_to": Vector3(-4.4, 4.0, 5.8), "look": Vector3(1.2, 1.4, -1.2),
	},
}

const DIORAMA_KEYS := [
	"m0_vesper", "m1_ridge", "m2_bridges", "m3_convoy", "m4_ashfall",
	"m5_redstone", "m6_shrine", "m7_sanctuary", "m8_trains", "m9_verdant", "m10_vault",
]

static func _load_config() -> ConfigFile:
	var cfg := ConfigFile.new()
	cfg.load(Campaign._progress_path())
	return cfg

static func seen_cutscenes() -> Array[String]:
	var cfg := _load_config()
	var res: Array[String] = []
	for item in cfg.get_value("hub_cutscenes", "seen", []):
		res.append(str(item))
	return res

static func has_seen(id: String) -> bool:
	return id in seen_cutscenes()

static func mark_seen(id: String) -> void:
	var seen := seen_cutscenes()
	if id in seen:
		return
	seen.append(id)
	var cfg := _load_config()
	cfg.set_value("hub_cutscenes", "seen", seen)
	cfg.save(Campaign._progress_path())

static func is_opening_cue(cue_id: String) -> bool:
	return cue_id in OPENING_CUES

static func landing_point(mission_index: int) -> Vector2:
	return MISSION_LANDING_POINTS[clampi(mission_index, 0, MISSION_LANDING_POINTS.size() - 1)]

static func mission_intro_movie(mission_index: int) -> Dictionary:
	var idx := clampi(mission_index, 0, Campaign.MISSIONS.size() - 1)
	var mission: Dictionary = Campaign.MISSIONS[idx]
	var meta := HubData.mission_meta(idx)
	var cue_id: String = str(meta.voice_cue)
	var cue_line: Array = Campaign.CUES.get(cue_id, [meta.contact, mission.brief, 7.5])
	var speaker := str(cue_line[0])
	var voice_text := str(cue_line[1])
	var diorama_key: String = DIORAMA_KEYS[idx]

	return {
		"id": "mission_intro_%02d" % (idx + 1),
		"title": "OPERATION %02d  ·  %s" % [idx + 1, str(mission.title).to_upper()],
		"voice_cue": cue_id,
		"planet": meta.planet,
		"portrait": str(meta.portrait),
		"shots": [
			{
				"kind": "orbital_fleet",
				"duration": 3.0,
				"telemetry": "MSV STARFALL  //  ORBITAL INSERTION  //  %s" % str(meta.planet_name),
				"speaker": "FLEET NAVIGATION",
				"line": "Entering %s high orbit. Strike group cleared for atmospheric descent." % str(meta.sector),
			},
			{
				"kind": "plate",
				"plate": "res://assets/ui/campaign/dropship_launch_bay.webp",
				"zoom_from": 1.0,
				"zoom_to": 1.10,
				"pan": Vector2(0.0, 14.0),
				"duration": 2.8,
				"telemetry": "LAUNCH BAY 02  //  %s" % str(mission.title).to_upper(),
				"speaker": speaker.to_upper(),
				"portrait": str(meta.portrait),
				"line": voice_text,
			},
			{
				"kind": "diorama_3d",
				"diorama": diorama_key,
				"duration": 3.8,
				"telemetry": "SURFACE CONTACT  //  %s" % str(meta.sector).to_upper(),
				"speaker": speaker.to_upper(),
				"portrait": str(meta.portrait),
				"line": str(mission.brief),
			},
		],
	}

static func hub_cutscene(id: String, ctx: Dictionary = {}) -> Dictionary:
	var completed := Campaign.completed_missions()
	var next_idx := mini(completed.size(), Campaign.MISSIONS.size() - 1)
	var meta := HubData.mission_meta(next_idx)

	match id:
		"hub_prologue":
			return {
				"id": "hub_prologue",
				"title": "PROLOGUE  ·  THE ASHFALL SIGNAL",
				"voice_cue": "arrival",
				"planet": HubData.mission_meta(0).planet,
				"shots": [
					{
						"kind": "orbital_fleet",
						"duration": 3.4,
						"telemetry": "OUTER RIM  //  VESPER SECTOR BLOCKADE",
						"speaker": "CAPTAIN VALE",
						"portrait": "vale",
						"line": "Three weeks ago the Directorate cut every subspace relay along the Rim and left the outer colonies in the dark.",
					},
					{
						"kind": "frn_broadcast",
						"diorama": "m0_vesper",
						"duration": 3.5,
						"headline": "VESPER SECTOR UNDER MARTIAL BLACKOUT",
						"ticker": "FRN SPECIAL REPORT  ·  DIRECTORATE GARRISONS LOCK DOWN VESPER GATE  ·  COLONIAL SHIPPING HALTED",
						"telemetry": "FRN INTERSTELLAR  //  EMERGENCY TRANSMISSION",
						"speaker": "ANCHOR KADE VANCE",
						"line": "Directorate High Command insists the Vesper comms shutdown is routine maintenance—even as renegade flotillas gather in orbit.",
					},
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/bridge_deck.webp",
						"zoom_from": 1.08,
						"zoom_to": 1.0,
						"pan": Vector2(-18.0, 0.0),
						"duration": 3.4,
						"telemetry": "MSV STARFALL  //  COMMAND BRIDGE",
						"speaker": "CAPTAIN VALE",
						"portrait": "vale",
						"line": "Prep the Ramparts. We break the relay at Vesper Gate first—then we bring every stranded colony home.",
					},
				],
			}
		"frn_broadcast":
			var news_idx := mini(completed.size(), HubData.NEWS_HEADLINES.size() - 1)
			var headline_pair: Array = HubData.NEWS_HEADLINES[news_idx]
			var feed_idx := maxi(0, completed.size() - 1)
			return {
				"id": "frn_broadcast",
				"title": "FRN INTERSTELLAR  ·  SECTOR BROADCAST",
				"voice_cue": "",
				"planet": HubData.mission_meta(feed_idx).planet,
				"shots": [
					{
						"kind": "frn_broadcast",
						"diorama": DIORAMA_KEYS[feed_idx],
						"duration": 4.4,
						"headline": str(headline_pair[0]),
						"ticker": str(headline_pair[1]),
						"telemetry": "FRN STUDIO 01  //  LIVE SECTOR FEED",
						"speaker": "ANCHOR KADE VANCE  ·  FRN LIVE",
						"line": str(headline_pair[1]).capitalize(),
					},
					{
						"kind": "diorama_3d",
						"diorama": DIORAMA_KEYS[feed_idx],
						"duration": 3.4,
						"telemetry": "RECON DRONE FEED  //  %s" % str(HubData.mission_meta(feed_idx).sector).to_upper(),
						"speaker": "ANCHOR KADE VANCE  ·  FRN LIVE",
						"line": "Orbital drone footage confirms heavy engagements across %s as Meridian Guard forces press deeper into the sector." % str(HubData.mission_meta(feed_idx).sector),
					},
				],
			}
		"cantina_rook":
			var cue_pick := "camp_siege" if completed.size() == 1 else ("distress_north" if completed.size() == 2 else "iron_intercept_start")
			return {
				"id": "cantina_rook",
				"title": "CANTINA  ·  CORPORAL ROOK",
				"voice_cue": cue_pick,
				"planet": meta.planet,
				"shots": [
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/cantina_lounge.webp",
						"zoom_from": 1.02,
						"zoom_to": 1.14,
						"pan": Vector2(-12.0, -10.0),
						"duration": 3.8,
						"telemetry": "MSV STARFALL  //  DECK 04 CANTINA",
						"speaker": "CORPORAL ROOK",
						"portrait": "rook",
						"line": "Half the frontier mercs on this deck owe Vale their lives. Put credits on the table and they'll drop into hell beside us.",
					},
					{
						"kind": "diorama_3d",
						"diorama": DIORAMA_KEYS[next_idx],
						"duration": 3.6,
						"telemetry": "TACTICAL PROJECTION  //  %s" % str(meta.sector).to_upper(),
						"speaker": "CORPORAL ROOK",
						"portrait": "rook",
						"line": "Next drop at %s won't be a parade. Hit Bay 07 for plating upgrades before we launch." % str(meta.sector),
					},
				],
			}
		"bridge_vale":
			return {
				"id": "bridge_vale",
				"title": "COMMAND BRIDGE  ·  STRATEGIC BRIEFING",
				"voice_cue": str(meta.voice_cue),
				"planet": meta.planet,
				"shots": [
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/bridge_deck.webp",
						"zoom_from": 1.0,
						"zoom_to": 1.12,
						"pan": Vector2(18.0, -8.0),
						"duration": 3.6,
						"telemetry": "MSV STARFALL  //  TACTICAL HOLO-TABLE",
						"speaker": "CAPTAIN VALE",
						"portrait": "vale",
						"line": str(Campaign.CUES.get(str(meta.voice_cue), ["Captain Vale", Campaign.MISSIONS[next_idx].brief])[1]),
					},
					{
						"kind": "orbital_fleet",
						"duration": 3.4,
						"telemetry": "TARGET SECTOR  //  %s" % str(meta.planet_name),
						"speaker": "PILOT SABLE",
						"portrait": "sable",
						"line": "Course plotted for %s. Dropships are fueled and awaiting your launch order on the Mission Console." % str(meta.sector),
					},
				],
			}
		"armory_intro":
			return {
				"id": "armory_intro",
				"title": "BAY 07  ·  CHIEF QUARTERMASTER VANE",
				"voice_cue": "",
				"planet": meta.planet,
				"shots": [
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/armory_bay.webp",
						"zoom_from": 1.10,
						"zoom_to": 1.0,
						"pan": Vector2(0.0, -14.0),
						"duration": 3.5,
						"telemetry": "MSV STARFALL  //  ORDNANCE BAY 07",
						"speaker": "QUARTERMASTER VANE",
						"line": "Welcome to Bay 07, Commander. Every credit you pull off Directorate contracts goes straight into heavier steel and hotter barrels.",
					},
					{
						"kind": "diorama_3d",
						"diorama": "m8_trains",
						"duration": 3.2,
						"telemetry": "ARMORY PROVING SIMULATION  //  MERIDIAN HARDWARE",
						"speaker": "QUARTERMASTER VANE",
						"line": "Step up to the Armory Console whenever you're ready to refit infantry suits, walkers, or starfighters.",
					},
				],
			}
		"cantina_intro":
			return {
				"id": "cantina_intro",
				"title": "DECK 04  ·  THE RUST & THRUSTER",
				"voice_cue": "",
				"planet": meta.planet,
				"shots": [
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/cantina_lounge.webp",
						"zoom_from": 1.10,
						"zoom_to": 1.0,
						"pan": Vector2(16.0, 0.0),
						"duration": 3.8,
						"telemetry": "MSV STARFALL  //  CREW LOUNGE & CONTRACT BOARD",
						"speaker": "CORPORAL ROOK",
						"portrait": "rook",
						"line": "Jukebox is warm, FRN's spinning propaganda on the screen, and the Rim's best mercenary crews are waiting at the holo-table.",
					},
				],
			}
		"lab_intro":
			return {
				"id": "lab_intro",
				"title": "XENOBIOLOGY & RELIC LABORATORY",
				"voice_cue": "sanctuary_start",
				"planet": meta.planet,
				"shots": [
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/laboratory_deck.webp",
						"zoom_from": 1.0,
						"zoom_to": 1.11,
						"pan": Vector2(-14.0, -6.0),
						"duration": 4.2,
						"telemetry": "MSV STARFALL  //  SCIENCE DECK",
						"speaker": "DR. ASTER",
						"portrait": "aster",
						"line": "Gnarl Brood tissue adapts under fire, and Concord crystal matrices store immense harmonic energy. Bring me samples from the field and we'll turn both to our advantage.",
					},
				],
			}
		"tech_unlock":
			var u_id := str(ctx.get("unit_id", "rifleman"))
			var upg_name := str(ctx.get("title", "Field Refit"))
			var summary := str(ctx.get("summary", "Systems upgraded."))
			return {
				"id": "tech_unlock",
				"title": "ARMORY REFIT  ·  %s" % upg_name.to_upper(),
				"voice_cue": "",
				"planet": meta.planet,
				"shots": [
					{
						"kind": "unit_trial_3d",
						"unit_id": u_id,
						"duration": 4.0,
						"telemetry": "BAY 07 FIELD TRIAL  //  %s ONLINE" % upg_name.to_upper(),
						"speaker": "QUARTERMASTER VANE",
						"line": "%s installed across the fleet. %s" % [upg_name, summary],
					},
				],
			}
		"merc_arrival":
			var m_unit := str(ctx.get("unit_id", "rifleman"))
			var m_name := str(ctx.get("title", "Mercenary Company"))
			return {
				"id": "merc_arrival",
				"title": "CHARTER SIGNED  ·  %s" % m_name.to_upper(),
				"voice_cue": "",
				"planet": meta.planet,
				"shots": [
					{
						"kind": "unit_trial_3d",
						"unit_id": m_unit,
						"dropship_entry": true,
						"duration": 4.4,
						"telemetry": "DOCKING RING 03  //  %s ABOARD" % m_name.to_upper(),
						"speaker": "CORPORAL ROOK",
						"portrait": "rook",
						"line": "%s just docked in Bay 07. Their dropships are standing by on our Contract Post frequency." % m_name,
					},
				],
			}
		"lab_breakthrough":
			var l_unit := str(ctx.get("unit_id", "field_bunker"))
			var l_name := str(ctx.get("title", "Research Breakthrough"))
			return {
				"id": "lab_breakthrough",
				"title": "LAB BREAKTHROUGH  ·  %s" % l_name.to_upper(),
				"voice_cue": "",
				"planet": meta.planet,
				"shots": [
					{
						"kind": "unit_trial_3d",
						"unit_id": l_unit,
						"duration": 4.0,
						"telemetry": "SCIENCE DECK  //  ADAPTATION VERIFIED",
						"speaker": "DR. ASTER",
						"portrait": "aster",
						"line": "Synthesis complete: %s is now integrated into all Meridian deployments." % l_name,
					},
				],
			}
		"arc_1_vesper":
			return {
				"id": "arc_1_vesper",
				"title": "ACT I  ·  THE SIGNAL BREAKS",
				"voice_cue": "signal_off",
				"planet": HubData.mission_meta(1).planet,
				"shots": [
					{
						"kind": "frn_broadcast",
						"diorama": "m0_vesper",
						"duration": 3.8,
						"headline": "VESPER GATE RELAY DESTROYED",
						"ticker": "COLONIAL UPRISING SPREADS ACROSS VESPER  ·  DIRECTORATE EXCAVATION REVEALED AT WHITE RIDGE",
						"telemetry": "FRN BREAKING REPORT  //  VESPER UPRISING",
						"speaker": "ANCHOR KADE VANCE",
						"line": "Subspace traffic is pouring out of Vesper Gate tonight after Captain Vale's raiders toppled the central Directorate relay tower.",
					},
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/bridge_deck.webp",
						"zoom_from": 1.0,
						"zoom_to": 1.10,
						"pan": Vector2(12.0, -6.0),
						"duration": 3.6,
						"telemetry": "MSV STARFALL  //  INTERCEPTED TRANSMISSION",
						"speaker": "CAPTAIN VALE",
						"portrait": "vale",
						"line": "With the blackout broken, we intercepted Directorate traffic from White Ridge. They've dug up an ancient artifact—and something else is waking up.",
					},
				],
			}
		"arc_2_dawn":
			return {
				"id": "arc_2_dawn",
				"title": "ACT II  ·  SHADOW OF THE BROOD",
				"voice_cue": "rescued",
				"planet": HubData.mission_meta(3).planet,
				"shots": [
					{
						"kind": "orbital_fleet",
						"duration": 3.6,
						"telemetry": "EMERGENCY EXTRACTION  //  DAWN REACH ORBIT",
						"speaker": "PILOT SABLE",
						"portrait": "sable",
						"line": "Last Rampart is aboard, Commander! Dawn Reach has fallen to the Gnarl Brood—distress beacons are lighting up all along the Bracken corridor.",
					},
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/laboratory_deck.webp",
						"zoom_from": 1.08,
						"zoom_to": 1.0,
						"pan": Vector2(-10.0, 0.0),
						"duration": 3.6,
						"telemetry": "MSV STARFALL  //  EMERGENCY TRIAGE",
						"speaker": "DR. ASTER",
						"portrait": "aster",
						"line": "Dr. Aster here—thousands of colonists at Bracken and Ashfall will be overrun unless we escort their convoys out immediately.",
					},
				],
			}
		"arc_3_sanctuary":
			return {
				"id": "arc_3_sanctuary",
				"title": "ACT III  ·  SPEAR OF SANCTUARY",
				"voice_cue": "sanctuary_exposed",
				"planet": HubData.mission_meta(8).planet,
				"shots": [
					{
						"kind": "diorama_3d",
						"diorama": "m7_sanctuary",
						"duration": 3.8,
						"telemetry": "SANCTUARY ORBIT  //  PURIFIER DOWN",
						"speaker": "PILOT SABLE",
						"portrait": "sable",
						"line": "Direct hit on the Concord Purifier core! Outer colony fleets are rallying to the Starfall's transponder.",
					},
					{
						"kind": "plate",
						"plate": "res://assets/ui/campaign/bridge_deck.webp",
						"zoom_from": 1.0,
						"zoom_to": 1.10,
						"pan": Vector2(-14.0, -6.0),
						"duration": 3.6,
						"telemetry": "MSV STARFALL  //  FINAL CAMPAIGN PUSH",
						"speaker": "CAPTAIN VALE",
						"portrait": "vale",
						"line": "Only Tarsus, Bel'Verdant, and the sealed vault on Aurelia Prime stand between the Rim and lasting freedom.",
					},
				],
			}
		"arc_4_victory":
			return {
				"id": "arc_4_victory",
				"title": "FINALE  ·  DAWN OVER AURELIA",
				"voice_cue": "evac_complete",
				"planet": HubData.mission_meta(10).planet,
				"shots": [
					{
						"kind": "diorama_3d",
						"diorama": "m10_vault",
						"duration": 4.0,
						"telemetry": "AURELIA PRIME  //  VAULT BREACHED",
						"speaker": "CAPTAIN VALE",
						"portrait": "vale",
						"line": "The vault seal is down, the Directorate line is broken, and the frontier worlds answer to no one but themselves.",
					},
					{
						"kind": "orbital_fleet",
						"duration": 4.0,
						"telemetry": "FREE FRONTIER CHARTER  //  MSV STARFALL",
						"speaker": "PILOT SABLE",
						"portrait": "sable",
						"line": "All colonies reporting clear skies, Commander. It was an honor flying the Ashfall Signal with you.",
					},
				],
			}
	return hub_cutscene("hub_prologue")

static func pending_milestone_cutscene() -> String:
	var completed := Campaign.completed_missions()
	var milestones := [
		["campaign-vaultbreaker", "arc_4_victory"],
		["campaign-sanctuary-skies", "arc_3_sanctuary"],
		["campaign-hold-for-dawn", "arc_2_dawn"],
		["campaign-cut-the-signal", "arc_1_vesper"],
	]
	for pair in milestones:
		if pair[0] in completed and not has_seen(pair[1]):
			return pair[1]
	return ""

static func archive_entries() -> Array[Dictionary]:
	var completed := Campaign.completed_missions()
	var items: Array[Dictionary] = [
		{"id": "hub_prologue", "title": "Prologue: The Ashfall Signal", "category": "Story Cutscene", "unlocked": true},
		{"id": "bridge_vale", "title": "Command Bridge: Strategic Briefing", "category": "Bridge Cutscene", "unlocked": true},
		{"id": "armory_intro", "title": "Bay 07: Quartermaster Vane", "category": "Armory Cutscene", "unlocked": true},
		{"id": "cantina_rook", "title": "Cantina: Corporal Rook's Briefing", "category": "Cantina Cutscene", "unlocked": true},
		{"id": "frn_broadcast", "title": "FRN Live: Sector News Broadcast", "category": "News Cutscene", "unlocked": true},
		{"id": "lab_intro", "title": "Science Deck: Dr. Aster's Lab", "category": "Laboratory Cutscene", "unlocked": true},
		{"id": "arc_1_vesper", "title": "Act I: The Signal Breaks", "category": "Milestone Cutscene", "unlocked": "campaign-cut-the-signal" in completed},
		{"id": "arc_2_dawn", "title": "Act II: Shadow of the Brood", "category": "Milestone Cutscene", "unlocked": "campaign-hold-for-dawn" in completed},
		{"id": "arc_3_sanctuary", "title": "Act III: Spear of Sanctuary", "category": "Milestone Cutscene", "unlocked": "campaign-sanctuary-skies" in completed},
		{"id": "arc_4_victory", "title": "Finale: Dawn Over Aurelia", "category": "Milestone Cutscene", "unlocked": "campaign-vaultbreaker" in completed},
	]
	for idx in Campaign.MISSIONS.size():
		var avail := Campaign.mission_available(idx, completed)
		items.append({
			"id": "mission_intro_%d" % idx,
			"mission_index": idx,
			"title": "Mission %02d Movie: %s" % [idx + 1, Campaign.MISSIONS[idx].title],
			"category": "Pre-Mission Movie",
			"unlocked": avail,
		})
	return items
