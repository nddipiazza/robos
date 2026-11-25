extends RefCounted

# RTSHubState.gd — 5-Layer State Machine for the Starfall Command Story-Mode Hub:
#   1. Macro Hub Location State: Stage 1 (Vesper Saloon) -> Stages 2-6 (MSV Starfall) -> Stage 7 (Cinderfall Forward Camp)
#   2. Compartment Gating & Tab Alert Badges ("!")
#   3. Exterior Viewport Planetary Skybox & Lighting Binding (Bridge observation window)
#   4. Progressive 3D Unit, Relic, Visitor & Trophy Wall Accumulation
#   5. Ephemeral Per-Mission Character Dialogue & 29-Mission FRN News Queue

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")

const RELIC_MISSIONS := [
	"campaign-white-ridge",
	"campaign-shattered-shrine",
	"campaign-vaultbreaker",
	"campaign-broken-archive",
	"campaign-fireline",
	"campaign-rift-silence",
]

const PROPHECY_INDICES := [18, 19, 20, 21] # Echoes in Stone, False Sanctuary, Memory of the Swarm, Last Light

const ARMORY_BAY_SLOTS := [
	{"unit_id": "torchguard", "title": "Torchguard", "subtitle": "Infantry Tech", "cat": "infantry", "requires": "campaign-last-road", "pos": Vector3(-5.8, 0.0, -0.8), "yaw": 0.55, "scale": 1.18},
	{"unit_id": "ridge_scout", "title": "Ridge Scout", "subtitle": "Infantry Tech", "cat": "infantry", "requires": "campaign-redstone-claim", "pos": Vector3(-6.8, 0.0, 1.8), "yaw": 0.65, "scale": 1.15},
	{"unit_id": "breacher", "title": "Breacher", "subtitle": "Infantry Tech", "cat": "infantry", "requires": "campaign-shattered-shrine", "pos": Vector3(5.8, 0.0, 1.6), "yaw": -0.65, "scale": 1.18},
	{"unit_id": "cinder_runner", "title": "Cinder Runner", "subtitle": "Vehicles Tech", "cat": "vehicles", "requires": "campaign-ashfall", "pos": Vector3(-5.6, 0.0, -4.2), "yaw": 0.42, "scale": 1.05},
	{"unit_id": "rail_skimmer", "title": "Rail Skimmer", "subtitle": "Vehicles Tech", "cat": "vehicles", "requires": "campaign-iron-intercept", "pos": Vector3(-3.2, 0.0, -6.2), "yaw": 0.35, "scale": 1.05},
	{"unit_id": "warden_walker", "title": "Warden Walker", "subtitle": "Vehicles Tech", "cat": "vehicles", "requires": "campaign-verdant-pressure", "pos": Vector3(4.8, 0.0, -4.6), "yaw": -0.45, "scale": 0.98},
	{"unit_id": "howitzer", "title": "Howitzer", "subtitle": "Vehicles Tech", "cat": "vehicles", "requires": "campaign-vaultbreaker", "pos": Vector3(6.8, 0.0, -1.8), "yaw": -0.52, "scale": 0.96},
	{"unit_id": "atlas_walker", "title": "Atlas Goliath", "subtitle": "Heavy Gantry", "cat": "vehicles", "requires": "campaign-colossus-run", "pos": Vector3(0.0, 0.0, -8.4), "yaw": 0.08, "scale": 1.05},
	{"unit_id": "kestrel_interceptor", "title": "Kestrel Fighter", "subtitle": "Starships Tech", "cat": "starships", "requires": "campaign-sanctuary-skies", "pos": Vector3(-4.2, 3.3, -5.6), "yaw": 0.38, "scale": 0.95},
	{"unit_id": "rampart_transport", "title": "Rampart Dropship", "subtitle": "Starships Tech", "cat": "starships", "requires": "campaign-broken-archive", "pos": Vector3(4.2, 3.4, -6.4), "yaw": -0.42, "scale": 0.92},
	{"unit_id": "night_harrier", "title": "Night Harrier", "subtitle": "Starships Tech", "cat": "starships", "requires": "campaign-fireline", "pos": Vector3(-1.8, 4.1, -8.2), "yaw": 0.22, "scale": 0.92},
	{"unit_id": "dreadnought", "title": "Dreadnought Rig", "subtitle": "Capital Tech", "cat": "starships", "requires": "campaign-rift-silence", "pos": Vector3(2.2, 4.4, -9.2), "yaw": -0.25, "scale": 0.62},
]

const ORBIT_PROFILES := {
	"vesper": {
		"world_label": "VESPER IV  ·  FRONTIER BADLANDS",
		"phenomenon": "shuttles",
		"deck_tint": Color("#ffb978"),
		"space_bg": Color("#090d16"),
		"planet": {"primary": Color("#8b6748"), "secondary": Color("#3b4a58"), "accent": Color("#d4ad82"), "atmo": Color("#74b6e8"), "clouds": 0.36, "glow": Color("#ffab5e"), "glow_strength": 0.28, "seed": 1.1},
	},
	"spores": {
		"world_label": "AGRIA / ASHFALL  ·  SPORE CLOUD QUARANTINE",
		"phenomenon": "spores",
		"deck_tint": Color("#b4e68a"),
		"space_bg": Color("#0b1410"),
		"planet": {"primary": Color("#6d8246"), "secondary": Color("#324530"), "accent": Color("#c4b66c"), "atmo": Color("#9ce07e"), "clouds": 0.54, "glow": Color("#a8ff62"), "glow_strength": 0.34, "seed": 4.9},
	},
	"magma": {
		"world_label": "REDSTONE / FIRELINE  ·  SOLAR MAGMA ORBIT",
		"phenomenon": "magma",
		"deck_tint": Color("#ff7238"),
		"space_bg": Color("#1a0906"),
		"planet": {"primary": Color("#7c2818"), "secondary": Color("#2a0e0a"), "accent": Color("#ff6828"), "atmo": Color("#ff7438"), "clouds": 0.16, "glow": Color("#ff4400"), "glow_strength": 0.88, "seed": 7.5},
	},
	"shrine_asteroids": {
		"world_label": "TALION / AURELIA  ·  RELIC ASTEROID RING",
		"phenomenon": "asteroids",
		"deck_tint": Color("#62ecff"),
		"space_bg": Color("#071320"),
		"planet": {"primary": Color("#346864"), "secondary": Color("#1a3544"), "accent": Color("#8ce0cc"), "atmo": Color("#5ef0dc"), "clouds": 0.48, "glow": Color("#54f2ff"), "glow_strength": 0.44, "seed": 8.8},
	},
	"wreckage": {
		"world_label": "TARSUS ORBIT  ·  SHIPYARD DEBRIS GRAVEYARD",
		"phenomenon": "wreckage",
		"deck_tint": Color("#dba86e"),
		"space_bg": Color("#120f0d"),
		"planet": {"primary": Color("#966c44"), "secondary": Color("#4d3520"), "accent": Color("#deb078"), "atmo": Color("#dfa668"), "clouds": 0.22, "glow": Color("#ffae54"), "glow_strength": 0.28, "seed": 11.4},
	},
	"capital_city": {
		"world_label": "DIRECTORATE CORE  ·  ORBITAL CITY GRID",
		"phenomenon": "city_glow",
		"deck_tint": Color("#ffd478"),
		"space_bg": Color("#10111a"),
		"planet": {"primary": Color("#585c68"), "secondary": Color("#282c38"), "accent": Color("#ffd26a"), "atmo": Color("#f5c46c"), "clouds": 0.26, "glow": Color("#ffc246"), "glow_strength": 0.66, "seed": 15.6},
	},
	"cinderfall_dawn": {
		"world_label": "CINDERFALL HIGH ORBIT  ·  SECTOR LIBERATED",
		"phenomenon": "shuttles",
		"deck_tint": Color("#ffcb84"),
		"space_bg": Color("#0c121c"),
		"planet": {"primary": Color("#68483c"), "secondary": Color("#2c2228"), "accent": Color("#f2a868"), "atmo": Color("#84c8ff"), "clouds": 0.42, "glow": Color("#ff9848"), "glow_strength": 0.38, "seed": 19.2},
	},
	"warp_transit": {
		"world_label": "DEEP SPACE  ·  FTL WARP TRANSIT",
		"phenomenon": "warp",
		"deck_tint": Color("#84dcff"),
		"space_bg": Color("#050c18"),
		"planet": {"primary": Color("#223854"), "secondary": Color("#101c30"), "accent": Color("#74c8ff"), "atmo": Color("#54b8ff"), "clouds": 0.60, "glow": Color("#48c4ff"), "glow_strength": 0.50, "seed": 22.0},
	},
}

const MISSION_ORBIT_MAP := {
	"campaign-cut-the-signal": "vesper",
	"campaign-white-ridge": "vesper",
	"campaign-hold-for-dawn": "vesper",
	"campaign-last-road": "spores",
	"campaign-ashfall": "spores",
	"campaign-cinder-haven": "spores",
	"campaign-redstone-claim": "magma",
	"campaign-fireline": "magma",
	"campaign-shattered-shrine": "shrine_asteroids",
	"campaign-sanctuary-skies": "shrine_asteroids",
	"campaign-verdant-pressure": "shrine_asteroids",
	"campaign-vaultbreaker": "shrine_asteroids",
	"campaign-echoes-stone": "shrine_asteroids",
	"campaign-false-sanctuary": "shrine_asteroids",
	"campaign-swarm-memory": "shrine_asteroids",
	"campaign-last-light": "shrine_asteroids",
	"campaign-rift-silence": "shrine_asteroids",
	"campaign-iron-intercept": "wreckage",
	"campaign-scrapyard-contract": "wreckage",
	"campaign-broken-archive": "wreckage",
	"campaign-colossus-run": "capital_city",
	"campaign-airwave-coup": "capital_city",
	"campaign-beneath-glass": "capital_city",
	"campaign-glass-knife": "capital_city",
	"campaign-blackgate": "capital_city",
	"campaign-cinderfall": "cinderfall_dawn",
	"campaign-into-deep": "cinderfall_dawn",
	"campaign-skybreaker": "cinderfall_dawn",
	"campaign-last-charge": "cinderfall_dawn",
}

const EXTENDED_NEWS := {
	"campaign-cinder-haven": ["CINDER HAVEN PURGED OF INFESTATION", "FRN BULLETIN  ·  MERIDIAN STRIKE TEAMS CONTAIN SPORE CARRIERS ACROSS HAVEN SETTLEMENTS"],
	"campaign-colossus-run": ["PROTOTYPE GOLIATH STOLEN FROM VALHALLA PROVING GROUNDS", "BREAKING  ·  AUTONOMOUS ATLAS COLOSSUS RAMPAGES THROUGH FIVE DIRECTORATE GARRISONS"],
	"campaign-airwave-coup": ["FRN BROADCAST TOWERS SEIZED IN SURPRISE BLITZ", "EMERGENCY FEED  ·  VALE REBELS BROADCAST CLASSIFIED DIRECTORATE ARCHIVES ACROSS CAPITAL"],
	"campaign-beneath-glass": ["BLACK-BUDGET SCIENCE COMPLEX DESTROYED", "CLASSIFIED LEAK  ·  SEISMIC COLLAPSE REPORTED BENEATH DIRECTORATE CONTAINMENT FACILITY"],
	"campaign-echoes-stone": ["ANCIENT SHRINES FLARE ACROSS DEAD WORLD", "DEEP-RIM SENSORS  ·  UNIDENTIFIED CONCORD STALKER SIGHTED EVADING BROOD SWARMS"],
	"campaign-false-sanctuary": ["CONCORD KEEPERS FREED FROM STASIS", "OUTER RIM  ·  REVENANT CONSTRUCT DEFEATED NEAR FORGOTTEN AURELIAN SANCTUARY"],
	"campaign-swarm-memory": ["MASSIVE PSIONIC ECHO DETECTED IN BADLANDS", "SCIENCE ALERT  ·  ANCIENT OVERMIND TENDRILS AWAKEN BRIEFLY BEFORE GOING DARK"],
	"campaign-last-light": ["PROPHETIC ARCHIVE SEALED IN FINAL STAND", "MEMORY CRYSTAL VISION COMPLETE  ·  MERIDIAN COMMAND PREPARES RELIC COUNTERMEASURE"],
	"campaign-broken-archive": ["FLOODED DATA VAULTS DEMOLISHED AHEAD OF SWARM", "EVACUATION COMPLETE  ·  BROOD MATRIARCH DENIED ACCESS TO RELIC COORDINATES"],
	"campaign-fireline": ["SOLAR FIRESTORM SWEEPS RELIC EXCAVATION", "SOLAR ALERT  ·  MERIDIAN MOBILE BASES OUTRUN CORONAL WAVE WITH FOURTH RELIC SHARD"],
	"campaign-rift-silence": ["CAPITAL FLEET BREACHES DISTORTION RIFT", "FINAL RELIC RECOVERED  ·  MARSHAL ARDEN STAGES ALLIED ARMADA FOR CINDERFALL INVASION"],
	"campaign-cinderfall": ["ALLIED FORCES ESTABLISH CINDERFALL BEACHHEAD", "FRONTLINE DISPATCH  ·  VALE BREAKS SIEGE AROUND MARSHAL ARDEN'S FORWARD TRENCH CAMP"],
	"campaign-into-deep": ["SEISMIC CHARGES FLOOD CINDERFALL BROOD TUNNELS", "SUBTERRANEAN VICTORY  ·  VALE'S FOUR SPECIALISTS CRIPPLE UNDERGROUND SWARM REINFORCEMENTS"],
	"campaign-skybreaker": ["ORBITAL COOLING PLATFORMS SHATTERED ABOVE CINDERFALL", "AIR SUPERIORITY SECURED  ·  STARFALL FLEET CLEARS LEVIATHANS FROM UPPER ATMOSPHERE"],
	"campaign-last-charge": ["CHARGED RELIC ERUPTS — CINDERFALL SWARM BROKEN!", "HISTORIC VICTORY  ·  MATRIARCH DEFEATED AS FREE FRONTIER COLONIES CELEBRATE ACROSS THE RIM"],
}

static func _load_cfg() -> ConfigFile:
	var cfg := ConfigFile.new()
	cfg.load(Campaign._progress_path())
	return cfg

static func _profile_compat() -> Dictionary:
	var camp_obj: Object = Campaign
	if camp_obj.has_method("profile"):
		var res: Variant = camp_obj.call("profile")
		if res is Dictionary:
			return res
	var completed: Array = Campaign.completed_missions()
	var totals: Dictionary = HubData.research_totals()
	return {
		"completed": completed,
		"credits": HubData.credits_available(),
		"brood": int(totals.get("brood", 0)),
		"concord": int(totals.get("concord", 0)),
		"upgrades": HubData.purchased_techs(),
		"mercenaries": HubData.hired_mercenaries(),
		"final_threat": "",
	}

static func snapshot(warp_override: bool = false) -> Dictionary:
	var prof: Dictionary = _profile_compat()
	var completed: Array[String] = Campaign.completed_missions()
	var cfg := _load_cfg()
	var last_id := str(cfg.get_value("hub_state", "last_completed_id", ""))
	if last_id.is_empty() and not completed.is_empty():
		last_id = str(completed.back())

	var defense_done: bool = Campaign.MISSIONS[Campaign.DEFENSE].id in completed
	var cinderfall_landed: bool = "campaign-cinderfall" in completed
	var finale_done: bool = "campaign-last-charge" in completed
	var count := completed.size()

	# 1. Macro Location & 7-Stage Progression
	var macro := "starfall_ship"
	var stage_num := 2
	var stage_title := "STAGE 2  ·  BOARDING MSV STARFALL"
	if not defense_done:
		macro = "vesper_saloon"
		stage_num = 1
		stage_title = "STAGE 1  ·  VESPER OUTPOST SALOON"
	elif cinderfall_landed and not finale_done:
		macro = "cinderfall_camp"
		stage_num = 7
		stage_title = "STAGE 7  ·  CINDERFALL FORWARD TRENCH CAMP"
	else:
		var lab_open := _lab_unlocked(prof)
		if "campaign-fireline" in completed or "campaign-rift-silence" in completed or count >= 18 or finale_done:
			stage_num = 6
			stage_title = "STAGE 6  ·  FLEET ALLIANCE & RELIC ASSEMBLY"
		elif "campaign-vaultbreaker" in completed or count >= 7:
			stage_num = 5
			stage_title = "STAGE 5  ·  BRANCHING OPERATIONS & PROPHECY"
		elif lab_open:
			stage_num = 4
			stage_title = "STAGE 4  ·  XENO-RESEARCH & CONTAINMENT"
		elif count >= 4:
			stage_num = 3
			stage_title = "STAGE 3  ·  CREW & MERCENARIES"

	# 2. Orbit / Exterior Skybox Binding
	var orbit_key: String = "warp_transit" if warp_override else str(MISSION_ORBIT_MAP.get(last_id, "vesper"))
	var orbit: Dictionary = ORBIT_PROFILES.get(orbit_key, ORBIT_PROFILES["vesper"])

	# 3. Progressive Relic Pieces (0..5) & Lab Specimens
	var relic_pieces := 0
	for r_id in RELIC_MISSIONS:
		if r_id in completed:
			relic_pieces += 1
	relic_pieces = mini(5, relic_pieces)
	if cinderfall_landed:
		relic_pieces = 5

	var brood_pts := int(prof.brood)
	var brood_stage := 1
	if "campaign-beneath-glass" in completed or brood_pts >= 6:
		brood_stage = 3
	elif brood_pts >= 3:
		brood_stage = 2

	var lira_present: bool = ("campaign-last-road" in completed) and ("campaign-sanctuary-skies" not in completed) and ("campaign-cinder-haven" not in completed)
	var neral_crystal: bool = "campaign-vaultbreaker" in completed

	var prophecy_avail := 0
	var prophecy_done := 0
	for p_v in PROPHECY_INDICES:
		var p_idx: int = int(p_v)
		if p_idx < 0 or p_idx >= Campaign.MISSIONS.size():
			continue
		var pid: String = str(Campaign.MISSIONS[p_idx].id)
		if pid in completed:
			prophecy_done += 1
		elif Campaign.mission_available(p_idx, completed):
			prophecy_avail += 1

	# 4. Armory Dynamic 3D Unit Spawns
	var armory_units: Array[Dictionary] = []
	for slot_v in ARMORY_BAY_SLOTS:
		var slot: Dictionary = slot_v
		var req := str(slot.requires)
		var unlocked: bool = req in completed
		if str(slot.unit_id) == "rampart_transport" and count >= 6:
			unlocked = true
		var entry: Dictionary = slot.duplicate()
		entry["unlocked"] = unlocked
		armory_units.append(entry)

	var covert_mode := "none"
	if "campaign-glass-knife" in completed:
		covert_mode = "voss_cloak"
	elif "campaign-blackgate" in completed:
		covert_mode = "specter_rig"

	# 5. Cantina Visitors & Trophy Wall
	var voss_in_cantina: bool = ("campaign-redstone-claim" in completed) and ("campaign-glass-knife" not in completed or "campaign-blackgate" in completed)
	var voss_knife_trophy: bool = ("campaign-glass-knife" in completed) and ("campaign-blackgate" not in completed)
	var trophies := {
		"sanctuary_banner": "campaign-sanctuary-skies" in completed,
		"cinder_plaque": "campaign-cinder-haven" in completed,
		"blackgate_sign": "campaign-blackgate" in completed,
		"voss_dagger": voss_knife_trophy,
		"frn_studio_plaque": "campaign-airwave-coup" in completed,
	}

	var arden_comm: bool = stage_num >= 6 and macro == "starfall_ship"

	# 6. Compartment Locks & Alert ("!") Badges
	var locks := {
		"armory": room_lock_reason("armory", prof),
		"bridge": room_lock_reason("bridge", prof),
		"cantina": room_lock_reason("cantina", prof),
		"laboratory": room_lock_reason("laboratory", prof),
	}
	var alerts := _compute_alerts(prof, locks, neral_crystal and prophecy_avail > 0, arden_comm, last_id, cfg)

	return {
		"macro_location": macro,
		"stage_num": stage_num,
		"stage_title": stage_title,
		"completed_count": count,
		"last_completed_id": last_id,
		"saloon_substage": 2 if "campaign-white-ridge" in completed else (1 if "campaign-cut-the-signal" in completed else 0),
		"orbit_key": orbit_key,
		"orbit": orbit,
		"relic_pieces": relic_pieces,
		"brood_stage": brood_stage,
		"lira_present": lira_present,
		"neral_crystal": neral_crystal,
		"prophecy_avail": prophecy_avail,
		"prophecy_done": prophecy_done,
		"armory_units": armory_units,
		"covert_mode": covert_mode,
		"voss_in_cantina": voss_in_cantina,
		"voss_knife_trophy": voss_knife_trophy,
		"trophies": trophies,
		"arden_comm": arden_comm,
		"locks": locks,
		"alerts": alerts,
		"final_threat": str(prof.final_threat),
	}

static func _lab_unlocked(prof: Dictionary) -> bool:
	if Campaign.MISSIONS[Campaign.DEFENSE].id not in prof.completed:
		return false
	if int(prof.brood) > 0 or int(prof.concord) > 0:
		return true
	if "campaign-shattered-shrine" in prof.completed or prof.completed.size() >= 4:
		return true
	return false

static func room_lock_reason(room_id: String, prof: Dictionary = {}) -> String:
	var p: Dictionary = _profile_compat() if prof.is_empty() else prof
	if Campaign.MISSIONS[Campaign.DEFENSE].id not in p.completed:
		if room_id in ["armory", "laboratory"]:
			return "Complete Hold for Dawn to unlock the flagship facilities."
		return ""
	if room_id == "laboratory" and not _lab_unlocked(p):
		return "Recover research samples or complete 4 operations to unlock Lab 01."
	return ""

static func _compute_alerts(prof: Dictionary, locks: Dictionary, has_prophecy: bool, arden_comm: bool, last_id: String, cfg: ConfigFile) -> Dictionary:
	var camp_obj: Object = Campaign
	var hub_obj: Object = HubData
	var has_upg_lock_fn := camp_obj.has_method("upgrade_lock_reason")
	var has_merc_lock_fn := camp_obj.has_method("mercenary_lock_reason")
	var upg_dict: Dictionary = {}
	var maybe_upgs: Variant = hub_obj.get("UPGRADES")
	if maybe_upgs is Dictionary:
		upg_dict = maybe_upgs

	var armory_alert := false
	if str(locks.armory).is_empty():
		if not upg_dict.is_empty() and has_upg_lock_fn:
			for upg_id in upg_dict:
				var u: Dictionary = upg_dict[upg_id]
				if not u.has("track") and str(camp_obj.call("upgrade_lock_reason", upg_id, prof)).is_empty():
					armory_alert = true
					break
		else:
			for cat in HubData.ARMORY_CATEGORIES:
				for unit_entry in cat.units:
					for upg in unit_entry.upgrades:
						if str(upg.id) not in prof.upgrades and int(prof.credits) >= int(upg.cost):
							armory_alert = true
							break
					if armory_alert:
						break
				if armory_alert:
					break

	var lab_alert := has_prophecy
	if str(locks.laboratory).is_empty() and not lab_alert:
		if not upg_dict.is_empty() and has_upg_lock_fn:
			for upg_id in upg_dict:
				var u: Dictionary = upg_dict[upg_id]
				if u.has("track") and str(camp_obj.call("upgrade_lock_reason", upg_id, prof)).is_empty():
					lab_alert = true
					break
		else:
			var perks := HubData.selected_lab_perks()
			for track_key in HubData.LAB_TRACKS:
				var tiers: Array = HubData.LAB_TRACKS[track_key].tiers
				for t_i in tiers.size():
					var tier: Dictionary = tiers[t_i]
					if not perks.has("%s_%d" % [track_key, t_i]) and int(prof.get(track_key, 0)) >= int(tier.points):
						lab_alert = true
						break
				if lab_alert:
					break

	var cantina_alert := false
	if str(locks.cantina).is_empty():
		for offer_v in HubData.MERCENARIES:
			var offer: Dictionary = offer_v
			var m_id := str(offer.id)
			var m_locked := str(camp_obj.call("mercenary_lock_reason", m_id, prof)) if has_merc_lock_fn else ""
			if m_id not in prof.mercenaries and m_locked.is_empty() and int(prof.credits) >= int(offer.cost):
				cantina_alert = true
				break
		if not cantina_alert and not last_id.is_empty() and str(cfg.get_value("hub_state", "last_news_seen", "")) != last_id:
			cantina_alert = true

	var bridge_alert := arden_comm and not bool(cfg.get_value("hub_state", "arden_comm_heard", false))
	return {
		"armory": armory_alert,
		"bridge": bridge_alert,
		"cantina": cantina_alert,
		"laboratory": lab_alert,
	}

static func mark_news_seen() -> void:
	var cfg := _load_cfg()
	var last_id := str(cfg.get_value("hub_state", "last_completed_id", ""))
	if last_id.is_empty():
		var c := Campaign.completed_missions()
		if not c.is_empty():
			last_id = str(c.back())
	cfg.set_value("hub_state", "last_news_seen", last_id)
	cfg.save(Campaign._progress_path())

static func mark_arden_comm_heard() -> void:
	var cfg := _load_cfg()
	cfg.set_value("hub_state", "arden_comm_heard", true)
	cfg.save(Campaign._progress_path())

static func latest_news_pair() -> Array:
	var snap := snapshot()
	var last_id := str(snap.last_completed_id)
	if EXTENDED_NEWS.has(last_id):
		return EXTENDED_NEWS[last_id]
	var idx := 0
	for m_i in Campaign.MISSIONS.size():
		if Campaign.MISSIONS[m_i].id == last_id:
			idx = mini(m_i + 1, HubData.NEWS_HEADLINES.size() - 1)
			break
	if last_id.is_empty():
		idx = 0
	return HubData.NEWS_HEADLINES[idx]

static func nav_labels_for_stage(macro_location: String) -> Dictionary:
	if macro_location == "cinderfall_camp":
		return {
			"armory": "Field Depot",
			"bridge": "Command Tent",
			"cantina": "Drop Zone",
			"laboratory": "Relic Tent",
		}
	return {
		"armory": "Armory",
		"bridge": "Bridge",
		"cantina": "Cantina",
		"laboratory": "Laboratory",
	}

static func ephemeral_line(speaker_id: String, snap: Dictionary) -> Dictionary:
	var last_id := str(snap.last_completed_id)
	var macro := str(snap.macro_location)
	match speaker_id:
		"rook_saloon":
			if int(snap.saloon_substage) >= 2:
				return {"speaker": "CORPORAL ROOK  ·  ARTIFACT CRATE", "voice": "cantina_rook_1", "line": "That White Ridge relic is humming right through the lead lining, Vale. Sable's inbound to Dawn Reach—hold the bridges and we're off this rock!"}
			return {"speaker": "CORPORAL ROOK  ·  WHITE RIDGE CONTRACT", "voice": "cantina_early_1", "line": "Directorate dug up an ancient Concord artifact at White Ridge, Vale. Hit their excavation before they ship it off-world and we split the bounty!"}
		"voss":
			return {"speaker": "SHADE AGENT VOSS  ·  COVERT BOOTH", "voice": "voss_cantina_1", "line": "Directorate intelligence keeps its darkest secrets behind Blackgate's walls and black-budget labs. Give the word when you're ready to strike from the shadows."}
		"lira":
			return {"speaker": "DR. LIRA  ·  COLONIST EVACUATION DELEGATION", "voice": "lira_lab_1", "line": "Refugee transports from Bracken and Ashfall are crowding the sector. Until we break the Sanctuary blockade or purge the Haven infestation, every colony remains at risk."}
		"arden_camp":
			var threat_note := "Brood sky leviathans are neutralized—watch the tunnels!" if str(snap.final_threat) == "tunnels" else "Underground tunnels are flooded—watch the skies!"
			if "campaign-into-deep" not in Campaign.completed_missions() and "campaign-skybreaker" not in Campaign.completed_missions():
				threat_note = "Choose Into the Deep to flood the Brood tunnels, or Skybreaker to shatter their orbital platforms before we charge the Relic!"
			return {"speaker": "MARSHAL ARDEN  ·  CINDERFALL COMMAND TENT", "voice": "cinderfall_camp_1", "line": "Starfall is holding orbital defense overhead while we dig in here. " + threat_note}
		"marshal_badge":
			return {"speaker": "CAPTAIN VALE'S MARSHAL BADGE", "voice": "", "line": "\"Frontier Marshal — Vesper Sector.\" Tarnished neosteel, kept beside a worn photograph of the outer colonies before the Directorate blackout."}
		"arcade":
			return {"speaker": "STARFALL FIGHTER  ·  ARCADE CABINET", "voice": "", "line": "HIGH SCORE: 99,400 (SABLE)  ·  2ND: 64,200 (ROOK)  ·  INSERT CREDIT TO CHALLENGE KESTREL DEEP-SPACE GAUNTLET"}
		"trophy_wall":
			var earned: Array[String] = []
			var tr: Dictionary = snap.trophies
			if tr.sanctuary_banner: earned.append("Sanctuary Colonist Banner")
			if tr.cinder_plaque: earned.append("Haven Purification Plaque")
			if tr.blackgate_sign: earned.append("Blackgate Sector 04 Sign")
			if tr.voss_dagger: earned.append("Covert Combat-Knife Trophy")
			if tr.frn_studio_plaque: earned.append("FRN Studio 01 Broadcast Sign")
			var msg := "Campaign Trophies Mounted: " + (", ".join(earned) if not earned.is_empty() else "Complete major Colony, Covert, and Rebellion arcs to mount war mementos.")
			return {"speaker": "STARFALL CANTINA  ·  BULKHEAD TROPHY WALL", "voice": "", "line": msg}
	if macro == "cinderfall_camp" and speaker_id == "vale":
		return ephemeral_line("arden_camp", snap)
	if last_id == "campaign-redstone-claim" and speaker_id == "sable":
		return {"speaker": "PILOT SABLE  ·  ORBITAL TELEMETRY", "voice": "", "line": "Redstone's magma plumes are lighting up the whole forward viewport. Shade Agent Voss just docked on Deck Four asking for a private word."}
	return {}
