extends RefCounted

const ID := "lotv-5.0.17"
const MINERAL_STOCK := [1800, 900, 1800, 900, 1800, 900, 1800, 900]
const GAS_STOCK := 2250
const NATURAL_LARVA_SECONDS := 15.0 / 1.4
const INJECT_SECONDS := 40.0 / 1.4
const INJECT_LARVAE := 3
const INJECT_HANDOFF_SECONDS := 1.0 / 22.4
const INJECT_RELEASE_SECONDS := 4.0 / 22.4
const LARVA_LIMIT := 19
const LARVA_OFF_CREEP_SECONDS := 4.7
const STALEMATE_WARNING_SECONDS := 129
const STALEMATE_DRAW_SECONDS := 258
const HEADQUARTERS_REVEAL_SECONDS := 30
const SHIELD_REGEN_PER_SECOND := 2.8
const SHIELD_REGEN_DELAY_SECONDS := 7.143
const BROOD_REGEN_PER_SECOND := 0.3828
const BURROW_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 100.0 / 1.4, "requires": []}
const BILE_CRAWLER_BURROW_REGEN := 7.0
const BILE_CRAWLER_SPEED := 2.25 * 1.4 * 2.5
const BILE_CRAWLER_GLIAL_SPEED := 4.2 * 2.5
const BILE_CRAWLER_TUNNEL_SPEED := 2.8 * 2.5
const BILE_CRAWLER_GLIAL_TUNNEL_SPEED := 3.85 * 2.5
const BILE_WARREN_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0,
	"time": 110.0 / 1.4, "requires": ["brood_lair"]}
const GROOVED_SPINES_RESEARCH := {"level": 1, "crystal": 75, "aether": 75, "supply": 0, "time": 50.0, "requires": []}
const MUSCULAR_AUGMENTS_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 90.0 / 1.4, "requires": ["brood_lair"]}
const NANOMUSCULAR_SWELL_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 90.0 / 1.4, "requires": ["brood_hive"]}
const HURLER_LUNGE_SECONDS := 0.71
const HURLER_LUNGE_COOLDOWN := 10
const HURLER_UPGRADED_SPEED := 4.13 * 2.5
const HURLER_UPGRADED_CREEP_BONUS := 0.17
const HURLER_RANGE_BONUS := 2.5
const AMBUSHER_TALONS_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 80.0 / 1.4, "requires": ["brood_hive"]}
const AMBUSHER_SPINES_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 80.0 / 1.4, "requires": ["brood_hive"]}
const AMBUSHER_UPGRADED_SPEED := 4.5478 * 2.5
const AMBUSHER_RANGE_BONUS := 5.0
const AMBUSHER_TALONS_BURROW_SECONDS := 1.071
const CHITINOUS_PLATING_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 110.0 / 1.4, "requires": []}
const ANABOLIC_SYNTHESIS_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 60.0 / 1.4, "requires": []}
const BULWARK_UPGRADED_SPEED := 4.725 * 2.5
const BULWARK_UPGRADED_CREEP_BONUS := 0.1376
const BULWARK_PLATING_ARMOR := 2
const CRAWLER_UPROOT_SECONDS := 0.71
const CRAWLER_ROOT_SECONDS := {"spore_watch": 12.0 / 1.4, "thorn_watch": 5.0 / 1.4}
const CRAWLER_MOBILE_SPEED := 1.4 * 2.5
const CRAWLER_CREEP_SPEED := 3.5 * 2.5
const CRAWLER_OFF_CREEP_DAMAGE := 3.82
const PNEUMATIZED_CARAPACE_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 60.0 / 1.4, "requires": []}
const DRIFT_UPGRADED_SPEED := {"drift_sac": 2.63 * 2.5, "drift_hauler": 3.0 * 2.5, "spore_seer": 4.72 * 2.5}
const SEER_MOBILE_SIGHT := 11.0 * 2.5
const SEER_OVERSIGHT_SIGHT := 13.75 * 2.5
const CONTAMINATE_RANGE := 7.0 * 2.5
const CONTAMINATE_COST := 125.0
const CONTAMINATE_SECONDS := 30.0 / 1.4
const DRIFT_CREEP_HALF_EXTENT := Vector2(5.0, 3.75)
const BROOD_MIMIC_ENERGY := 50.0
const BROOD_MIMIC_SECONDS := 150.0 / 1.4
const BROOD_MIMIC_FORMS := {"humans": "rifleman", "aliens": "sunblade", "monsters": "skitterling"}
const GNARL_STRUCTURE_EVOLUTIONS := {"brood_lair": "brood_nest", "brood_hive": "brood_lair", "greater_blight_spire": "blight_spire"}
const CAUSTIC_SPRAY_RANGE := 15.0
const CAUSTIC_SPRAY_RAMP := 6.0 / 1.4
const CAUSTIC_SPRAY_COOLDOWN := 45.0 / 1.4
const CAUSTIC_SPRAY_PULSE_TICKS := 8
const CAUSTIC_SPRAY_INITIAL_DPS := 7.0
const CAUSTIC_SPRAY_RAMPED_DPS := 35.0
const FUNGAL_GRASP_COST := 75.0
const FUNGAL_GRASP_RANGE := 25.0
const FUNGAL_GRASP_RADIUS := 5.625
const FUNGAL_GRASP_SECONDS := 3
const FUNGAL_GRASP_DAMAGE := 30.0
const FUNGAL_GRASP_PROJECTILE_SPEED := 50.0
const MICROBIAL_SHROUD_COST := 100.0
const MICROBIAL_SHROUD_RANGE := 22.5
const MICROBIAL_SHROUD_RADIUS := 8.75
const MICROBIAL_SHROUD_SECONDS := 11
const MICROBIAL_SHROUD_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 110.0 / 1.4, "requires": []}
const NEURAL_TETHER_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 110.0 / 1.4, "requires": []}
const NEURAL_TETHER_COST := 100.0
const NEURAL_TETHER_RANGE := 20.0
const NEURAL_TETHER_LEASH := 35.0
const NEURAL_TETHER_SECONDS := 11
const LOCUST_LIFETIME_SECONDS := 18
const LOCUST_LAUNCH_COOLDOWN := 43
const LOCUST_SWOOP_RANGE := 15.0
const LOCUST_SWOOP_SECONDS := 0.55
const BROOD_TUNNEL_CAPACITY := 255
const BROOD_TUNNEL_LOAD_SECONDS := 0.18
const BROOD_TUNNEL_UNLOAD_SECONDS := 0.36
const BROOD_TUNNEL_WORM_SECONDS := 20.0
const SIPHON_RANGE := 15.0
const SIPHON_SECONDS := 20.0 / 1.4
const SIPHON_DRAIN := 200.0
const SIPHON_HP_FLOOR := 7.5
const GRASP_COST := 75.0
const GRASP_RANGE := 22.5
const BLINDING_CLOUD_COST := 100.0
const BLINDING_CLOUD_RANGE := 27.5
const BLINDING_CLOUD_RADIUS := 5.0
const BLINDING_CLOUD_SECONDS := 8.0 / 1.4
const PARASITIC_CLOUD_COST := 125.0
const PARASITIC_CLOUD_RANGE := 20.0
const PARASITIC_CLOUD_RADIUS := 7.5
const PARASITIC_CLOUD_SECONDS := 7
const PARASITIC_CLOUD_DAMAGE := 120.0
const METABOLIC_BOOST_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 110.0 / 1.4, "requires": []}
const ADRENAL_GLANDS_RESEARCH := {"level": 1, "crystal": 200, "aether": 200, "supply": 0, "time": 130.0 / 1.4, "requires": ["brood_hive"]}
const ROLLING_SPORES_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 100.0 / 1.4, "requires": ["brood_lair"]}
const TUMOR_BUILD_SECONDS := 15.0
const TUMOR_SEED_RANGE := 2.5
const TUMOR_SPREAD_RANGE := 25.0
const TUMOR_ENERGY := 25.0
const CREEP_SPREAD_TICKS := 29
const TRANSFUSE_ENERGY := 50.0
const TRANSFUSE_RANGE := 17.5
const TRANSFUSE_SECONDS := 7
const NEEDLEWING_WEAPON_ARC := 45.0
const NEEDLEWING_TURN_DEGREES_PER_SECOND := 999.8437 * 1.4
const CONCORD_AIR_TIMES := [180.0 / 1.4, 215.0 / 1.4, 250.0 / 1.4]
const PULSE_CRYSTALS_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 90.0 / 1.4, "requires": []}
const FLUX_VANES_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 80.0 / 1.4, "requires": []}
const TECTONIC_RESONANCE_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 100.0, "requires": []}
const GRAVITY_LIFT_COST := 50.0
const GRAVITY_LIFT_RANGE := 10.0
const GRAVITY_LIFT_SECONDS := 10.0 / 1.4
const PRISM_ALIGNMENT_SECONDS := 20.0 / 1.4
const PRISM_ALIGNMENT_COOLDOWN := 60.0 / 1.4
const CARRIER_FIGHTER_COST := 15
const CARRIER_FIGHTER_CAP := 8
const CARRIER_FIGHTER_INITIAL := 4
const CARRIER_FIGHTER_BUILD_SECONDS := 12
const CARRIER_FIGHTER_LEASH := 35.0
const CARRIER_LAUNCH_INTERVAL := 0.27
const ORACLE_CAST_ENERGY := 25.0
const ORACLE_BEAM_DRAIN := 2.8
const REVELATION_RANGE := 22.5
const REVELATION_RADIUS := 15.0
const REVELATION_SECONDS := 20
const REVELATION_COOLDOWN := 10
const STASIS_WARD_RANGE := 10.0
const STASIS_WARD_BUILD_SECONDS := 5.6
const STASIS_WARD_LIFETIME := 90
const STASIS_TRIGGER_RADIUS := 3.75
const STASIS_WARD_RADIUS := 8.75
const STASIS_SECONDS := 30.0 / 1.4
const FLAGSHIP_CLOAK_RADIUS := 12.5
const FLAGSHIP_CLOAK_SECONDS := 20
const FLAGSHIP_CLOAK_COOLDOWN := 50
const TIME_WARP_RANGE := 22.5
const TIME_WARP_RADIUS := 8.75
const TIME_WARP_ARMING := 2.5 / 1.4
const TIME_WARP_SECONDS := 10
const TIME_WARP_COOLDOWN := 60
const FLAGSHIP_RECALL_RADIUS := 12.5
const FLAGSHIP_RECALL_SECONDS := 4
const FLAGSHIP_RECALL_COOLDOWN := 89
const MERIDIAN_MODULE_PRODUCERS := ["muster_hall", "workshop", "airframe_hangar"]
const PERSONAL_CLOAK_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 120.0 / 1.4, "requires": []}
const AGENT_CLOAK_COST := 25.0
const AGENT_CLOAK_DRAIN := 1.26
const AGENT_SNIPE_COST := 50.0
const AGENT_SNIPE_RANGE := 25.0
const AGENT_SNIPE_LEASH := 35.0
const AGENT_SNIPE_SECONDS := 2.0 / 1.4
const AGENT_EMP_COST := 75.0
const AGENT_EMP_RANGE := 25.0
const AGENT_EMP_RADIUS := 3.75
const AGENT_EMP_BARRIER_RADIUS := 5.0
const AGENT_EMP_REVEAL_SECONDS := 10.0 / 1.4
const AGENT_EMP_PROJECTILE_SPEED := 75.0
const AGENT_STRIKE_SECONDS := 14
const AGENT_STRIKE_RANGE := 30.0
const AGENT_STRIKE_RADIUS := 20.0
const VEHICLE_MODE_SECONDS := 4.0 / 1.4
const SMART_SERVOS_MODE_SECONDS := 2.0 / 1.4
const MINE_LAUNCH_SECONDS := 1.5 / 1.4
const MINE_REARM_SECONDS := 29
const INFERNAL_CATALYST_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 110.0 / 1.4, "requires": []}
const SMART_SERVOS_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 110.0 / 1.4, "requires": ["vehicle_armory"]}
const DRILLING_CLAWS_RESEARCH := {"level": 1, "crystal": 75, "aether": 75, "supply": 0, "time": 110.0 / 1.4, "requires": ["vehicle_armory"]}
const MAG_ACCELERATOR_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 100.0, "requires": []}
const FACTORY_RESEARCH := {"infernal_catalyst": INFERNAL_CATALYST_RESEARCH, "smart_servos": SMART_SERVOS_RESEARCH,
	"drilling_claws": DRILLING_CLAWS_RESEARCH, "mag_accelerator": MAG_ACCELERATOR_RESEARCH}
const MERIDIAN_INFANTRY := ["rifleman", "breacher", "ridge_scout", "shade_agent"]
const MERIDIAN_VEHICLES := ["howitzer", "howitzer_emplaced", "cinder_runner", "cinder_guard", "sentinel_mine",
	"sentinel_mine_armed", "vortex_rover", "atlas_walker", "atlas_walker_precision"]
const MERIDIAN_GROUP_RESEARCH := {
	"infantry_weapons": [100, 150, 200], "infantry_armor": [100, 150, 200],
	"vehicle_weapons": [100, 175, 250], "ship_weapons": [100, 175, 250], "vehicle_plating": [100, 175, 250],
}
const MERIDIAN_GROUP_TIMES := [160.0 / 1.4, 190.0 / 1.4, 220.0 / 1.4]
const MERIDIAN_SUPPORT_RESEARCH := {
	"stim_injectors": {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 100.0, "requires": []},
	"combat_shields": {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 110.0 / 1.4, "requires": []},
	"concussive_shells": {"level": 1, "crystal": 50, "aether": 50, "supply": 0, "time": 60.0 / 1.4, "requires": []},
	"precision_tracking": {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 80.0 / 1.4, "requires": []},
	"reinforced_structure_armor": {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 100.0, "requires": []},
	"rampart_reactor": {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 75.0 / 1.4, "requires": []},
	"harrier_cloaking": {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 110.0 / 1.4, "requires": []},
	"harrier_rotors": {"level": 1, "crystal": 125, "aether": 125, "supply": 0, "time": 79.0, "requires": []},
	"sky_ballistics": {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 110.0 / 1.4, "requires": []},
	"systems_jamming": {"level": 1, "crystal": 50, "aether": 50, "supply": 0, "time": 80.0 / 1.4, "requires": []},
	"dreadnought_refit": {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 100.0, "requires": []},
}
const SURGE_COOLDOWN_SECONDS := 1.0 / 1.4
const CONCUSSIVE_SECONDS := 1.5 / 1.4
const TERRAN_BURN_DPS := 1.52
const OPERATIONS_OFFER := {"crystal": 150, "aether": 0, "supply": 0, "time": 35.0, "requires": ["muster_hall"]}
const FORTIFICATION_OFFER := {"crystal": 150, "aether": 150, "supply": 0, "time": 50.0, "requires": ["field_armory"]}
const RADAR_RADIUS := 55.0
const LADDER_SWEEP_RADIUS := 32.5
const LADDER_SWEEP_SECONDS := 16.0 / 1.4
const PROSPECTOR_LADDER_SECONDS := 63
const PROSPECTOR_LADDER_YIELD := 25
const CRYSTAL_GATHER_SECONDS := 2.78 / 1.4
const CRYSTAL_LEAVE_SECONDS := 0.5 / 1.4
const AETHER_GATHER_SECONDS := 1.981 / 1.4
const KESTREL_MODE_SECONDS := 3.0 / 1.4
const KESTREL_SERVOS_SECONDS := 1.5 / 1.4
const RAMPART_BOOST_SPEED := 5.95 * 2.5
const RAMPART_BOOST_SECONDS := 6.0 / 1.4
const RAMPART_BOOST_COOLDOWN := 20.0 / 1.4
const SKY_ZONE_RADIUS := 12.5
const SKY_DEPLOY_RANGE := 12.5
const SKY_BALLISTICS_BONUS := 5.0
const SKY_DEPLOY_SECONDS := 4.0 / 1.4
const SKY_MOBILE_SECONDS := 2.0 / 1.4
const TURRET_DEPLOY_RANGE := 5.0
const TURRET_LIFETIME := 11.0 / 1.4
const SYSTEMS_JAM_RANGE := 22.5
const SYSTEMS_JAM_SECONDS := 11
const ARMOR_MISSILE_RANGE := 25.0
const ARMOR_MISSILE_RADIUS := 7.2
const ARMOR_MISSILE_SECONDS := 30.0 / 1.4
const WATCHKEEPER_MISSILE_ACCELERATION := {"systems_jammer": 16.0 * 4.9, "armor_breaker": 4.0 * 4.9}
const WATCHKEEPER_MISSILE_MAX_SPEED := {"systems_jammer": 30.0 * 3.5, "armor_breaker": 16.0 * 3.5}
const DREADNOUGHT_COOLDOWN := 71
const DREADNOUGHT_BEAM_RANGE := 25.0
const DREADNOUGHT_BEAM_SECONDS := 3.0 / 1.4
const DREADNOUGHT_JUMP_WINDUP := 1
const DREADNOUGHT_JUMP_TRANSIT := 3
const WEAPON_JITTER_MIN := -0.0625 / 1.4
const WEAPON_JITTER_MAX := 0.125 / 1.4
const WEAPON_RANGE_SLOP := 2.5
const WEAPON_RANGE_SLOP_OVERRIDES := {
	"sentry_turret": 0.0, "sky_sentry_defender": 0.0, "spore_watch": 0.0, "thorn_watch": 0.0,
	"aegis_relay": 0.0, "spire_walker": 0.0, "carapace_bulwark": 3.125, "needlewing": 5.0,
	"prism_ray": 5.0, "crownspire": 10.0,
}
# Acceleration, moving turn rate, and stationary turn rate in catalog Normal units.
const MOVEMENT_PROFILES := {
	"pioneer": Vector3(2.5, 999.8437, 999.8437), "forager": Vector3(2.5, 999.8437, 999.8437),
	"mote": Vector3(2.5, 999.8437, 999.8437), "rifleman": Vector3(1000, 999.8437, 999.8437),
	"ridge_scout": Vector3(1000, 999.8437, 999.8437), "howitzer": Vector3(1000, 360, 720),
	"cinder_runner": Vector3(1000, 720, 1499.9414), "cinder_guard": Vector3(1000, 720, 1499.9414),
	"vortex_rover": Vector3(1000, 360, 720), "atlas_walker": Vector3(1000, 360, 720),
	"atlas_walker_precision": Vector3(1000, 360, 720), "kestrel_assault": Vector3(1000, 720, 999.8437),
	"kestrel_interceptor": Vector3(2.625, 999.8437, 999.8437), "rampart_transport": Vector3(2.25, 999.8437, 999.8437),
	"night_harrier": Vector3(3.25, 1499.9414, 1499.9414), "watchkeeper": Vector3(2, 999.8437, 999.8437),
	"dreadnought": Vector3(1, 720, 720), "needlewing": Vector3(3.5, 1499.9414, 1499.9414),
	"spire_walker": Vector3(1000, 720, 720), "prism_ray": Vector3(2, 999.8437, 999.8437),
	"sunseer": Vector3(3, 999.8437, 999.8437), "dawn_interceptor": Vector3(3.25, 1499.9414, 1499.9414),
	"horizon_lancer": Vector3(3, 720, 720), "fleet_carrier": Vector3(1.0625, 720, 720),
	"crownspire": Vector3(1.375, 720, 720),
}
const TURN_BEFORE_MOVING := ["howitzer", "atlas_walker", "atlas_walker_precision"]
const MINE_RANGE := 12.5
const MINE_SPLASH := 3.75
const MINE_MISSILE_RISE_SECONDS := 1.425 / (3.0 * 1.4)
const MINE_MISSILE_ACCELERATION := 56.0 * 4.9
const MINE_MISSILE_MAX_SPEED := 28.0 * 3.5
const VORTEX_LOCK_RANGE := 17.5
const VORTEX_GROUND_AUTO_RANGE := 18.75
const VORTEX_LOCK_LEASH := 37.5
const VORTEX_LOCK_SHOTS := 20
const VORTEX_LOCK_SHOT_SECONDS := 1.0 / 1.4
const VORTEX_LOCK_COOLDOWN := 6.0 / 1.4
const VEHICLE_MODES := {
	"cinder_guard_mode": {"source": "cinder_runner", "form": "cinder_guard", "duration": VEHICLE_MODE_SECONDS,
		"tech": "vehicle_armory", "upgrade": "smart_servos", "fast": SMART_SERVOS_MODE_SECONDS},
	"cinder_runner_mode": {"source": "cinder_guard", "form": "cinder_runner", "duration": VEHICLE_MODE_SECONDS,
		"upgrade": "smart_servos", "fast": SMART_SERVOS_MODE_SECONDS},
	"mine_burrow": {"source": "sentinel_mine", "form": "sentinel_mine_armed", "duration": 3.0 / 1.4,
		"upgrade": "drilling_claws", "fast": 1.0 / 1.4},
	"mine_surface": {"source": "sentinel_mine_armed", "form": "sentinel_mine", "duration": 2.0 / 1.4,
		"upgrade": "drilling_claws", "fast": 1.0 / 1.4},
	"atlas_precision_mode": {"source": "atlas_walker", "form": "atlas_walker_precision", "duration": 2.5 / 1.4,
		"upgrade": "smart_servos", "fast": 1.0 / 1.4},
	"atlas_airburst_mode": {"source": "atlas_walker_precision", "form": "atlas_walker", "duration": 2.5 / 1.4,
		"upgrade": "smart_servos", "fast": 1.0 / 1.4},
}
const BROOD_GROUND_UPGRADE_TIMES := [160.0 / 1.4, 190.0 / 1.4, 220.0 / 1.4]
const BROOD_GROUND_UPGRADE_TECH := [[], ["brood_lair"], ["brood_hive"]]
const BROOD_WEAPON_UPGRADE := {
	"locust_landed": "brood_missiles",
	"skitterling": "brood_melee", "sporeburst": "brood_melee", "carapace_bulwark": "brood_melee", "broodling": "brood_melee",
	"brood_keeper": "brood_missiles", "bile_crawler": "brood_missiles", "rupture_crawler": "brood_missiles",
	"blight_hurler": "brood_missiles", "spine_ambusher": "brood_missiles",
}
# Faster seconds for descent, emergence, and the maximum additional descent delay.
const BURROW_TIMINGS := {
	"forager": Vector3(0.952, 0.357, 0.179),
	"brood_keeper": Vector3(1.429, 0.714, 0.179),
	"skitterling": Vector3(0.952, 0.469, 0.179),
	"sporeburst": Vector3(0.952, 0.357, 0.179),
	"bile_crawler": Vector3(1.071, 0.714, 0.357),
	"rupture_crawler": Vector3(1.250, 0.536, 0.179),
	"blight_hurler": Vector3(0.952, 0.595, 0.179),
	"carapace_bulwark": Vector3(1.786, 0.714, 0.179),
	"spine_ambusher": Vector3(2.0, 0.714, 0.089),
	"mireweaver": Vector3(1.071, 0.714, 0.179),
	"locust_brooder": Vector3(1.071, 0.714, 0.179),
}
const UNBURROW_MAX_DELAY := 0.179
const TRANSIT_MORPH_SECONDS := 5.6
const TRANSIT_FAST_SECONDS := 5.0
const TRANSIT_SLOW_SECONDS := 16.0
const TRANSIT_COOLDOWNS := {
	"sunblade": 28.0, "skirmisher": 32.2, "aegis_warden": 32.2, "mirage_adept": 28.0,
	"storm_scribe": 44.8, "duskblade": 44.8,
}
const TRANSIT_RESEARCH := {"level": 1, "crystal": 50, "aether": 50, "supply": 0, "time": 100.0, "requires": []}
const CHARGE_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 100.0, "requires": []}
const PHASE_STEP_RESEARCH := {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 121.429, "requires": []}
const GLAIVE_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 100.0, "requires": []}
const MIRAGE_SHADE_SECONDS := 7
const MIRAGE_SHADE_COOLDOWN := 11
const STORM_RESEARCH := {"level": 1, "crystal": 200, "aether": 200, "supply": 0, "time": 78.571, "requires": []}
const STORM_DAMAGE := 110.0
const STORM_SECONDS := 6
const STORM_RADIUS := 5.0
const STORM_RANGE := 20.0
const STORM_COOLDOWN := 1.43
const STORM_ENERGY := 75.0
const FEEDBACK_RANGE := 25.0
const FEEDBACK_ENERGY := 50.0
const SHADOW_STRIDE_RESEARCH := {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 100.0, "requires": []}
const SHADOW_STRIDE_COOLDOWN := 14.0
const SHADOW_STRIDE_ATTACK_DELAY := 0.25
const ARCHON_WARP_SECONDS := 12.0
const GUARDIAN_SHIELD_SECONDS := 12.86
const GUARDIAN_SHIELD_COST := 75.0
const GUARDIAN_SHIELD_RADIUS := 11.25
const GUARDIAN_SHIELD_REDUCTION := 2.0
const PHASE_BARRIER_CAST_RANGE := 22.5
const HALLUCINATION_COST := 75.0
const HALLUCINATION_SECONDS := 43
const RUPTURE_MORPH_SECONDS := 17.0
const RUPTURE_CRYSTAL_COST := 25
const RUPTURE_AETHER_COST := 75
const BROOD_MORPHS := {
	"rupture_crawler": {"source": "bile_crawler", "cocoon": "rupture_cocoon", "cancel": "cancel_rupture_morph", "ready": "rupture_ready"},
	"spine_ambusher": {"source": "blight_hurler", "cocoon": "ambusher_cocoon", "cancel": "cancel_ambusher_morph", "ready": "ambusher_ready"},
	"spore_seer": {"source": "drift_sac", "alternate_source": "drift_hauler", "cocoon": "seer_cocoon", "cancel": "cancel_seer_morph", "ready": "seer_ready"},
	"drift_hauler": {"source": "drift_sac", "cocoon": "hauler_cocoon", "cancel": "cancel_hauler_morph", "ready": "hauler_ready"},
	"brood_siege_flyer": {"source": "corrosion_flyer", "cocoon": "siege_flyer_cocoon", "cancel": "cancel_siege_flyer_morph", "ready": "siege_flyer_ready"},
}
const CAUSTIC_BARRAGE_RANGE := 22.5
const CAUSTIC_BARRAGE_RADIUS := 1.25
const CAUSTIC_BARRAGE_DELAY := 2.5
const CAUSTIC_BARRAGE_COOLDOWN := 7
const CAUSTIC_BARRAGE_DAMAGE := 60.0
const HALLUCINATIONS := {
	"sunblade": {"count": 2, "hotkey": "Z"},
	"skirmisher": {"count": 2, "hotkey": "S"},
	"mirage_adept": {"count": 2, "hotkey": "H"},
	"storm_scribe": {"count": 2, "hotkey": "T"},
	"lattice_archon": {"count": 1, "hotkey": "A"},
	"bastion_walker": {"count": 1, "hotkey": "I"},
	"spire_walker": {"count": 1, "hotkey": "C"},
	"lumen_carrier": {"count": 1, "hotkey": "W"},
	"rift_engine": {"count": 1, "hotkey": "D"},
}
const SUNBLADE_SPEED := 3.15 * 2.5
const SUNBLADE_UPGRADED_SPEED := 4.725 * 2.5
const CHARGE_SPEED := 10.4 * 2.5
const CHARGE_COOLDOWN_SECONDS := 7.0
const CHARGE_DURATION_SECONDS := 2.5
const CHARGE_RANGE := 10.0
const PHASE_STEP_RANGE := 20.0
const CONCORD_FORGE_UPGRADES := {
	"concord_ground_weapons": [100, 150, 200],
	"concord_ground_armor": [100, 150, 200],
	"concord_shields": [150, 200, 250],
}
const CONCORD_FORGE_TIMES := [121.429, 144.643, 167.857]
const WISP_MOBILE_SIGHT := 27.5
const WISP_SURVEILLANCE_SIGHT := 37.5
const CARRIER_ANCHOR_SECONDS := 1.21
const CARRIER_FOLD_SECONDS := 0.79
const CARRIER_FIELD_RADIUS := 9.375
const ROBOTICS_UPGRADES := {
	"wisp_thrusters": {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 57.143, "requires": []},
	"lumen_drive": {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 57.143, "requires": []},
	"extended_prism": {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 100.0, "requires": []},
}
const WISP_UPGRADED_SPEED := 4.23 * 2.5
const LUMEN_UPGRADED_SPEED := 5.36 * 2.5
const EXTENDED_PRISM_BONUS := 5.0
const BASTION_BARRIER_HP := 100.0
const BASTION_BARRIER_SECONDS := 2
const BASTION_BARRIER_COOLDOWN := 32
const RIFT_NOVA_SECONDS := 2.1
const RIFT_NOVA_COOLDOWN := 17
const RIFT_NOVA_RANGE := 27.5
const RIFT_NOVA_RADIUS := 3.75
const RIFT_NOVA_DAMAGE := 100.0
const RIFT_NOVA_SHIELD_DAMAGE := 100.0
const CONCORD_BOOST_SECONDS := 20
const ENERGY_RECHARGE_COST := 50.0
const ENERGY_RECHARGE_AMOUNT := 50.0
const ENERGY_RECHARGE_SECONDS := 45
const ENERGY_RECHARGE_RANGE := 30.0
const RECALL_RADIUS := 6.25
const RECALL_CHANNEL_SECONDS := 4
const RECALL_COOLDOWN_SECONDS := 130
const RECALL_ARRIVAL_PROTECTION_SECONDS := 0.7
const NON_ELIMINATION_STRUCTURES := ["brood_growth_node", "stasis_ward", "bastion_turret"]
# Costs, vitals, and weapon timings below use the pinned 5.0.17 data.
# Weapon distances still use the game's existing world scale.
const UNITS := {
	"pioneer": {"cargo_size": 1, "speed": 2.8125 * 3.5,
		"additional_abilities": ["build_specter_academy", "build_vehicle_armory", "build_ignition_core", "build_radar_beacon"],
		"weapon": {"period": 1.071, "damage_point": 0.1193, "backswing": 0.3571, "damage_per_upgrade": 0}},
	"rifleman": {"cargo_size": 1, "speed": 2.25 * 1.4 * 2.5,
		"weapon": {"range": 12.5, "period": 0.615, "damage_point": 0.05 / 1.4, "backswing": 0.75 / 1.4}},
	"ridge_scout": {"bunker_garrison": true, "cargo_size": 1},
	"muster_hall": {"trains": ["rifleman", "ridge_scout", "breacher", "shade_agent"],
		"abilities": ["train_rifleman", "train_ridge_scout", "train_breacher", "train_shade_agent", "rally", "attach_fabrication_module",
			"attach_research_module", "research_stim_injectors", "research_combat_shields", "research_concussive_shells", "lift"]},
	"research_module": {"crystal_cost": 50, "aether_cost": 25, "max_hp": 400.0,
		"blurb": "Enables advanced units and research for its attached Meridian producer."},
	"fabrication_module": {"crystal_cost": 50, "aether_cost": 50, "max_hp": 400.0,
		"blurb": "Adds a second line for units that require no Research Module."},
	"workshop": {"trains": ["howitzer", "cinder_runner", "cinder_guard", "sentinel_mine", "vortex_rover", "atlas_walker"],
		"abilities": ["train_howitzer", "rally", "lift", "attach_fabrication_module", "attach_research_module", "train_cinder_runner", "train_cinder_guard",
			"train_sentinel_mine", "train_vortex_rover", "train_atlas_walker", "research_infernal_catalyst", "research_smart_servos",
			"research_drilling_claws", "research_mag_accelerator"]},
	"field_armory": {"campaign_only": false, "max_hp": 850.0, "radius": 3.125, "sight_range": 22.5,
		"blurb": "Researches infantry weapons, infantry armor and upgrades for Meridian structures.",
		"abilities": ["research_infantry_weapons", "research_infantry_armor", "research_precision_tracking", "research_reinforced_structure_armor"]},
	"vehicle_armory": {"abilities": ["research_vehicle_weapons", "research_ship_weapons", "research_vehicle_plating"]},
	"sentry_turret": {"requires": ["field_armory"], "crystal_cost": 100,
		"max_hp": 250.0, "armor": 0.0, "radius": 1.875, "sight_range": 27.5, "detection_radius": 27.5,
		"blurb": "Detects cloaked and burrowed units and fires twin missiles at aircraft. Requires a Field Armory.",
		"weapon": {"name": "Longbow Missiles", "targets_ground": false, "attacks": 2, "range": 17.5,
			"period": 0.861 / 1.4, "damage_point": 0.167 / 1.4, "backswing": 0.5 / 1.4}},
	"field_bunker": {"campaign_only": false, "max_hp": 400.0, "radius": 3.125, "sight_range": 25.0,
		"additional_abilities": ["salvage"]},
	"silo": {"abilities": ["retract_silo"]},
	"silo_retracted": {"abilities": ["extend_silo"]},
	"airframe_hangar": {"max_hp": 1300.0, "lift_speed": 2.35, "lift_duration_ms": 900, "land_duration_ms": 1000,
		"trains": ["kestrel_interceptor", "rampart_transport", "night_harrier", "sky_sentry", "watchkeeper", "dreadnought"],
		"additional_abilities": ["attach_fabrication_module", "attach_research_module", "lift", "train_night_harrier", "train_sky_sentry",
			"research_harrier_cloaking", "research_harrier_rotors", "train_watchkeeper", "train_dreadnought", "research_systems_jamming"]},
	"kestrel_interceptor": {"crystal_cost": 125, "aether_cost": 75, "supply_cost": 2, "max_hp": 135.0, "armor": 0.0,
		"radius": 1.875, "speed": 2.75 * 1.4 * 2.5, "sight_range": 25.0,
		"weapon": {"damage": 10.0, "attacks": 2, "bonus": {"Armored": 4.0}, "range": 22.5,
			"period": 2.0 / 1.4, "damage_point": 0.05 / 1.4, "backswing": 0.5 / 1.4}},
	"kestrel_assault": {"supply_cost": 2, "max_hp": 135.0, "armor": 0.0, "radius": 1.875,
		"speed": 2.25 * 1.4 * 2.5, "sight_range": 25.0, "cargo_size": 2,
		"weapon": {"damage": 12.0, "attacks": 1, "bonus": {"Mechanical": 8.0}, "bonus_per_upgrade": {"Mechanical": 1.0},
			"range": 15.0, "period": 1.0 / 1.4, "damage_point": 0.167 / 1.4, "backswing": 0.5 / 1.4}},
	"rampart_transport": {"speed": 3.5 * 2.5, "radius": 1.875, "transport_capacity": 8, "sight_range": 27.5,
		"blurb": "Flying eight-slot transport with an automatic healing beam and short afterburner boost.",
		"additional_abilities": ["hold_position", "restore_vitals", "rampart_boost"],
		"support": {"stat": "hp", "ability": "restore_vitals", "starting_energy": 50.0, "max_energy": 200.0,
			"regen": 0.7875, "rate": 12.6, "hp_per_energy": 3.0, "range": 10.0}},
	"breacher": {"cargo_size": 2, "speed": 2.25 * 1.4 * 2.5, "attachment_required": "research_module",
		"weapon": {"range": 15.0, "period": 1.071, "damage_point": 0.0, "backswing": 0.0,
			"concussive_slow": 0.0, "bonus_per_upgrade": {"Armored": 1.0}}},
	"howitzer": {"speed": 2.25 * 3.5, "attachment_required": "research_module", "weapon": {"period": 0.743, "damage_point": 0.1193,
		"backswing": 0.3571, "damage_per_upgrade": 2, "bonus_per_upgrade": {"Armored": 1.0}}},
	"howitzer_emplaced": {"weapon": {"damage": 40.0, "period": 2.14, "damage_point": 0.1193,
		"backswing": 0.3571, "damage_per_upgrade": 4, "bonus": {"Armored": 30.0}, "bonus_per_upgrade": {"Armored": 1.0}}},
	"brood_nest": {"crystal_cost": 275, "supply_provided": 6,
		"hp_regen": BROOD_REGEN_PER_SECOND, "sight_range": 30.0, "living_ground_radius": 32.5,
		"trains": ["forager", "skitterling", "bile_crawler", "blight_hurler", "drift_sac", "needlewing", "brood_keeper",
			"carapace_bulwark", "corrosion_flyer", "mireweaver", "locust_brooder", "siphon_wyrm"],
		"additional_abilities": ["research_burrow", "research_pneumatized_carapace", "train_carapace_bulwark",
			"train_corrosion_flyer", "train_mireweaver", "train_locust_brooder", "train_siphon_wyrm"]},
	"brood_larva": {"additional_abilities": ["train_carapace_bulwark", "train_corrosion_flyer", "train_mireweaver", "train_locust_brooder", "train_siphon_wyrm"]},
	"forager": {"max_hp": 40.0, "speed": 2.8125 * 3.5, "hp_regen": BROOD_REGEN_PER_SECOND,
		"abilities": ["move", "stop", "hold_position", "attack", "harvest", "build_brood_nest", "build_brood_pod",
			"build_spore_tap", "build_blight_spire", "build_spore_watch", "build_tunnel_mouth", "build_spore_nursery"],
		"additional_abilities": ["build_hatchling_pool", "build_bile_warren", "build_infestation_pit", "build_spine_den",
			"build_adaptation_chamber", "build_ambusher_den", "build_carapace_cavern", "build_thorn_watch"],
		"weapon": {"damage": 5.0, "period": 1.071, "damage_point": 0.1193, "backswing": 0.3571, "damage_per_upgrade": 0}},
	"brood_keeper": {"crystal_cost": 175, "aether_cost": 0, "max_hp": 175.0,
		"requires": ["hatchling_pool"],
		"hp_regen": BROOD_REGEN_PER_SECOND, "speed": 0.9375 * 1.4 * 2.5, "living_ground_speed_bonus": 1.6667,
		"radius": 2.1875, "sight_range": 22.5, "cargo_size": 2,
		"additional_abilities": ["seed_growth_node", "transfuse_brood"],
		"energy_profile": {"max": 200.0, "start": 25.0, "regen": 0.7875},
		"weapon": {"name": "Brood Talons", "damage": 4.0, "attacks": 2, "range": 12.5,
			"period": 0.714, "damage_point": 0.1193, "backswing": 0.3571, "targets_air": false},
		"air_weapon": {"name": "Caustic Spines", "sfx": "acid_spit", "attack_type": "ranged", "damage": 9.0,
			"attacks": 1, "range": 17.5, "period": 0.714, "damage_point": 0.1193, "backswing": 0.3571,
			"targets_air": true, "targets_ground": false}},
	"skitterling": {"crystal_cost": 50, "supply_cost": 0.5, "hatch_count": 2,
		"requires": ["hatchling_pool"],
		"max_hp": 35.0, "hp_regen": BROOD_REGEN_PER_SECOND, "speed": 2.9531 * 1.4 * 2.5, "radius": 0.9375,
		"weapon": {"damage": 5.0, "period": 0.497, "damage_point": 0.1193, "backswing": 0.3571}},
	"sporeburst": {"supply_cost": 0.5, "speed": 3.5 * 2.5, "radius": 0.9375,
		"sight_range": 20.0, "hp_regen": BROOD_REGEN_PER_SECOND, "weapon": {"splash_radius": 5.5}},
	"brood_growth_node": {"name": "Growth Tumor", "morph_only": true, "crystal_cost": 0,
		"blurb": "A burrowed living-ground source. Each mature Tumor can seed one daughter.",
		"attributes": ["Light", "Biological", "Structure"], "max_hp": 50.0, "hp_regen": BROOD_REGEN_PER_SECOND,
		"radius": 1.25, "sight_range": 27.5, "footprint": Vector2i.ONE, "living_ground_radius": 26.25,
		"abilities": ["spread_growth_node"]},
	"drift_sac": {"crystal_cost": 100, "max_hp": 200.0, "radius": 2.1875,
		"speed": 0.9 * 2.5, "sight_range": SEER_MOBILE_SIGHT, "hp_regen": BROOD_REGEN_PER_SECOND,
		"blurb": "Unarmed supply scout. Can morph into a transport or detector after Lair tech.",
		"transport_capacity": 0, "transport_unit": "",
		"abilities": ["move", "stop", "hold_position", "morph_spore_seer", "morph_drift_hauler", "generate_drift_creep"]},
	"bile_crawler": {"hp_regen": BROOD_REGEN_PER_SECOND, "requires": ["bile_warren"], "speed": BILE_CRAWLER_SPEED,
		"abilities": ["move", "stop", "hold_position", "attack"],
		"additional_abilities": ["morph_rupture_crawler"],
		"weapon": {"targets_air": false, "range": 10.0, "period": 1.429, "damage_point": 0.1193, "backswing": 0.3571,
			"damage_per_upgrade": 2}},
	"bile_warren": {"additional_abilities": ["research_tunneling_claws", "research_glial_reconstitution"]},
	"tunnel_mouth": {"name": "Brood Tunnel Network", "requires": ["brood_lair"], "requires_living_ground": true,
		"crystal_cost": 150, "aether_cost": 150, "max_hp": 850.0, "radius": 3.75,
		"hp_regen": BROOD_REGEN_PER_SECOND, "sight_range": 25.0,
		"blurb": "Grows Worm exits on visible ground. All your endpoints share the same tunnel cargo.",
		"abilities": ["summon_brood_worm", "load_brood_tunnel", "unload_brood_tunnel", "stop", "rally"]},
	"carapace_bulwark": {"requires": ["carapace_cavern"], "blurb": "Massive Gnarl ground unit with a cleaving melee strike.",
		"crystal_cost": 275, "aether_cost": 200, "supply_cost": 6,
		"max_hp": 500.0, "armor": 2.0, "radius": 2.5, "sight_range": 22.5, "cargo_size": 8,
		"hp_regen": BROOD_REGEN_PER_SECOND, "speed": 2.9531 * 1.4 * 2.5,
		"attributes": ["Armored", "Biological", "Massive"], "push_priority": 5,
		"weapon": {"name": "Chitin Blades", "damage": 35.0, "damage_per_upgrade": 3.0, "bonus": {},
			"range": 2.5, "period": 0.615, "damage_point": 0.238, "backswing": 0.3571,
			"cleave_radius": 5.0, "cleave_fraction": 0.33}},
	"blight_hurler": {"requires": ["spine_den"], "hp_regen": BROOD_REGEN_PER_SECOND,
		"blurb": "Fast ranged support with needle volleys that target ground and air.",
		"crystal_cost": 100, "aether_cost": 50, "supply_cost": 2,
		"max_hp": 90.0, "armor": 0.0, "speed": 2.25 * 1.4 * 2.5, "attributes": ["Light", "Biological"],
		"abilities": ["move", "stop", "hold_position", "attack", "morph_spine_ambusher", "hurler_lunge"],
		"weapon": {"name": "Needle Volley", "damage": 12.0, "range": 12.5, "period": 0.589,
			"damage_point": 0.1, "backswing": 0.4005, "targets_ground": true, "targets_air": true,
			"bonus": {}, "target_priority": {}, "splash_radius": 0.0, "damage_per_upgrade": 1}},
	"spore_nursery": {"requires": ["hatchling_pool"], "hp_regen": BROOD_REGEN_PER_SECOND,
		"abilities": ["research_rolling_spores"]},
	"spore_tap": {"crystal_cost": 25},
	"spore_watch": {"requires": [], "requires_any": ["hatchling_pool", "adaptation_chamber"], "requires_living_ground": true,
		"blurb": "A rooted detector with a rapid anti-air acid attack.",
		"crystal_cost": 75, "armor": 1.0, "radius": 2.5, "sight_range": 27.5,
		"detection_radius": 27.5, "hp_regen": BROOD_REGEN_PER_SECOND, "abilities": ["attack", "crawler_uproot"],
		"weapon": {"name": "Airborne Acid", "sfx": "acid_spit", "attack_type": "ranged",
			"damage": 20.0, "bonus": {"Biological": 10.0}, "range": 17.5, "period": 0.615,
			"damage_point": 0.1193, "backswing": 0.3571, "targets_ground": false, "targets_air": true}},
	"blight_spire": {"requires": ["brood_lair"], "requires_living_ground": true,
		"blurb": "Grows on living ground and unlocks Needlewing production.",
		"crystal_cost": 150, "aether_cost": 150,
		"max_hp": 850.0, "hp_regen": BROOD_REGEN_PER_SECOND,
		"abilities": ["research_brood_air_weapons", "research_brood_air_armor", "evolve_greater_blight_spire"]},
	"needlewing": {"requires": ["blight_spire"], "max_hp": 120.0, "hp_regen": 1.4,
		"armor": 0.0, "speed": 4.0 * 1.4 * 2.5, "radius": 1.25, "sight_range": 27.5,
		"weapon": {"damage": 9.0, "damage_per_upgrade": 1, "bonus": {}, "targets_air": true, "period": 1.089, "damage_point": 0.0, "backswing": 0.3571,
			"range": 7.5, "bounce_range": 7.5, "bounce_falloff": [1.0 / 3.0, 1.0 / 9.0]}},
	"mote": {"max_hp": 20.0, "max_shields": 20.0, "armor": 0.0, "cargo_size": 1, "speed": 2.8125 * 3.5,
		"additional_abilities": ["build_concord_core", "build_aegis_capacitor", "build_twilight_array", "build_prism_forge",
			"build_robotics_foundry", "build_robotics_annex", "build_canticle_archive", "build_veil_sanctum", "build_star_assembly", "build_fleet_spire"],
		"weapon": {"damage": 5.0, "period": 1.071, "damage_point": 0.1193, "backswing": 0.3571, "damage_per_upgrade": 0}},
	"sunblade": {"speed": SUNBLADE_SPEED, "cargo_size": 2, "weapon": {"damage": 8.0, "attacks": 2,
		"period": 0.857, "damage_point": 0.0, "backswing": 0.3571}},
	"skirmisher": {"cargo_size": 2, "speed": 2.9531 * 3.5, "requires": ["concord_core"], "abilities": ["move", "stop", "hold_position", "attack", "phase_step"],
		"weapon": {"period": 1.336, "damage_point": 0.1193,
		"backswing": 0.3571, "bonus_per_upgrade": {"Armored": 1.0}}},
	"aegis_warden": {"requires": ["concord_core"], "cargo_size": 2,
		"blurb": "Support caster with an anti-shield beam, temporary barriers and a moving ranged-damage shield.",
		"attributes": ["Mechanical", "Psionic"], "crystal_cost": 50, "aether_cost": 100,
		"max_hp": 40.0, "max_shields": 40.0, "armor": 1.0, "radius": 1.25, "speed": 8.75, "sight_range": 25.0,
		"energy_profile": {"start": 50.0, "max": 200.0, "regen": 0.7875},
		"abilities": ["move", "stop", "hold_position", "attack", "phase_barrier", "guardian_shield", "hallucination"],
		"weapon": {"name": "Disruption Beam", "attack_type": "ranged", "damage": 6.0, "shield_bonus": 4.0, "damage_per_upgrade": 1.0,
			"range": 12.5, "period": 0.714, "targets_air": true, "damage_point": 0.1193, "backswing": 0.3571, "sfx": "prism_beam"}},
	"phase_barrier": {"radius": 3.75, "lifetime_seconds": 11},
	"waystone": {"requires": ["resonator"],
		"trains": ["sunblade", "skirmisher", "mirage_adept", "storm_scribe", "duskblade", "aegis_warden"],
		"abilities": ["train_sunblade", "train_skirmisher", "train_mirage_adept", "train_storm_scribe", "rally", "open_transit", "train_duskblade", "train_aegis_warden"]},
	"crownspire": {"blurb": "The Concord flagship. Can cloak nearby allies, slow enemies, or recall allies to its position.",
		"crystal_cost": 400, "aether_cost": 400, "supply_cost": 8, "requires": ["fleet_spire"],
		"max_hp": 350.0, "max_shields": 350.0, "armor": 2.0, "radius": 3.4375, "speed": 2.25 * 2.5, "sight_range": 35.0,
		"attributes": ["Armored", "Mechanical", "Massive", "Heroic", "Air"],
		"additional_abilities": ["flagship_cloak", "time_warp", "flagship_recall"],
		"weapon": {"name": "Purifier Beam", "damage": 6.0, "attacks": 4, "secondary_targets": 3, "bonus": {}, "range": 17.5,
			"period": 1.129, "damage_point": 0.0, "backswing": 0.3571}},
	"farsight_wisp": {"blurb": "A cloaked flying detector. Surveillance reveals it and increases sight and detection.",
		"crystal_cost": 25, "aether_cost": 75, "max_hp": 40.0, "max_shields": 30.0,
		"armor": 0.0, "speed": 7.05, "sight_range": WISP_MOBILE_SIGHT, "detection_radius": WISP_MOBILE_SIGHT,
		"lifetime_seconds": 0, "abilities": ["move", "stop", "surveillance_mode"]},
	"lumen_carrier": {"blurb": "A flying transport that anchors in place to provide a persistent fast deployment field.",
		"crystal_cost": 250, "aether_cost": 0, "supply_cost": 2, "max_hp": 80.0, "max_shields": 100.0,
		"armor": 0.0, "speed": 2.9531 * 1.4 * 2.5, "flight_height": 5.2, "transport_capacity": 8,
		"abilities": ["move", "stop", "load_transport", "unload_transport", "deploy_power_field", "retract_power_field"]},
	"spire_walker": {"crystal_cost": 300, "aether_cost": 200, "supply_cost": 6, "speed": 2.25 * 1.4 * 2.5,
		"max_hp": 250.0, "max_shields": 100.0, "armor": 1.0, "cargo_size": 8, "requires": ["robotics_annex"],
		"vision_over_cliffs": true,
		"weapon": {"damage": 10.0, "attacks": 2, "bonus": {"Light": 5.0}, "damage_per_upgrade": 1,
			"range": 17.5, "targets_air": false, "targets_ground": true}},
	"resonator": {"power_radius": 16.25},
	"aether_prism": {"max_hp": 300.0, "max_shields": 300.0},
	"aegis_relay": {"blurb": "A powered defense that attacks ground and air units and detects nearby cloaked enemies.",
		"requires": ["prism_forge"], "crystal_cost": 150, "radius": 2.5,
		"sight_range": 27.5, "detection_radius": 27.5, "support": {},
		"abilities": ["attack", "hold_fire"],
		"weapon": {"name": "Prism Bolt", "damage": 20.0, "damage_per_upgrade": 0, "targets_air": true,
			"targets_ground": true, "range": 17.5, "period": 0.893, "damage_point": 0.1193, "backswing": 0.3571,
			"sfx": "forge_relay_fire", "attack_type": "ranged"}},
	"colony_hub": {"crystal_cost": 400, "supply_provided": 15,
		"sight_range": 27.5, "transport_capacity": 5, "transport_unit": "pioneer",
		"lift_speed": 2.35, "lift_duration_ms": 2680, "land_duration_ms": 2680,
		"abilities": ["train_pioneer", "rally", "recon_sweep", "reinforce_supply", "upgrade_hub", "fortify_hub",
			"deploy_prospector", "lift", "load_hub_workers", "unload_hub_workers"]},
	"prospector": {"max_hp": 60.0, "speed": 2.8125 * 1.4 * 2.5, "radius": 0.9375, "sight_range": 20.0,
		"blurb": "Temporary mining machine. Hauls 25 crystal per trip and can repair friendly mechanical units.",
		"additional_abilities": ["repair"]},
	"heartstone": {"crystal_cost": 400, "supply_provided": 15,
		"trains": ["mote", "crownspire"], "additional_abilities": ["energy_recharge", "train_crownspire"],
		"energy_profile": {"max": 200.0, "start": 50.0, "regen": 0.7875}},
}
