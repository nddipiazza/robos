"""Build the checked-in ladder audit from Gemini's pinned 5.0.17 export."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


REFERENCE_SHA256 = "5a491517468e1a622b4f98e26cca5bff2bac2beda3f507c26f2fa28cc001fb34"
VALIDATOR_SHA256 = "1d5245fd447455131eebf6fcb590c83e17af01e0a8055596e0e0ca132ce9a61b"

# Existing counterparts. A link identifies where to audit, regardless of parity.
COUNTERPARTS = dict(pair.split(":") for pair in """
scv:pioneer mule:prospector marine:rifleman reaper:ridge_scout marauder:breacher siege_tank:howitzer
siege_tank_sieged:howitzer_emplaced viking_fighter:kestrel_interceptor
viking_assault:kestrel_assault medivac:rampart_transport command_center:colony_hub
command_center_flying:colony_hub orbital_command:colony_hub supply_depot:silo
orbital_command_flying:colony_hub planetary_fortress:fortified_hub sensor_tower:radar_beacon
sensor_tower_radar:radar_beacon command_center_load_scvs:load_hub_workers morph_to_planetary_fortress:fortify_hub
supply_depot_lowered:silo_retracted refinery:aether_tap barracks:muster_hall
refinery_rich:aether_tap extractor_rich:spore_tap assimilator_rich:aether_prism
barracks_flying:muster_hall bunker:field_bunker missile_turret:sentry_turret
factory:workshop factory_flying:workshop starport:airframe_hangar tech_lab:research_module
reactor:fabrication_module drone:forager larva:brood_larva egg:brood_egg queen:brood_keeper zergling:skitterling
ghost:shade_agent ghost_academy:specter_academy ghost_cloak:agent_cloak personal_cloaking:research_agent_cloak
steady_targeting:agent_snipe emp_round:agent_emp tactical_nuke:tactical_charge tac_nuke_strike:agent_strike
hellion:cinder_runner hellbat:cinder_guard widow_mine:sentinel_mine widow_mine_burrowed:sentinel_mine_armed
cyclone:vortex_rover thor:atlas_walker thor_high_impact:atlas_walker_precision armory:vehicle_armory
morph_to_hellion:cinder_runner_mode morph_to_hellbat:cinder_guard_mode widow_mine_activate:mine_burrow
widow_mine_deactivate:mine_surface sentinel_missiles_ability:sentinel_missiles cyclone_lock_on:vortex_lock
thor_high_impact_payload:atlas_precision_mode thor_explosive_payload:atlas_airburst_mode
drilling_claws:research_drilling_claws infernal_pre_igniter:research_infernal_catalyst
mag_field_accelerator:research_mag_accelerator smart_servos:research_smart_servos
engineering_bay:field_armory hi_sec_auto_tracking:research_precision_tracking neosteel_armor:research_reinforced_structure_armor
starport_flying:airframe_hangar fusion_core:ignition_core medivac_heal:restore_vitals ignite_afterburners:rampart_boost
transport_load_unload:load_transport caduceus_reactor:research_rampart_reactor
banshee:night_harrier banshee_cloak:harrier_cloak banshee_cloaking_field:research_harrier_cloaking hyperflight_rotors:research_harrier_rotors
liberator_fighter:sky_sentry liberator_defender:sky_sentry_defender liberator_defender_mode:sky_defender_mode
liberator_fighter_mode:sky_fighter_mode advanced_ballistics:research_sky_ballistics
raven:watchkeeper auto_turret:bastion_turret battlecruiser:dreadnought
build_auto_turret:deploy_bastion_turret interference_matrix:systems_jammer anti_armor_missile:armor_breaker
tactical_jump:dreadnought_jump yamato_cannon:dreadnought_beam
interference_matrix_upgrade:research_systems_jamming weapon_refit:research_dreadnought_refit
combat_shield_passive:rifleman combat_drugs:ridge_scout jet_pack_cliff_walk:ridge_scout detector_passive:sentry_turret
scv_build_basic:worker_basic scv_build_advanced:worker_advanced scv_halt:halt_construction
probe_warp_basic:worker_basic probe_warp_advanced:worker_advanced
drone_mutate_basic:worker_basic drone_mutate_advanced:worker_advanced
stimpack:research_stim_injectors stimpack_redirect:surge combat_shield:research_combat_shields
concussive_shells:research_concussive_shells concussive_shells_passive:breacher bunker_load_unload:load_transport
terran_infantry_weapons_1:research_infantry_weapons terran_infantry_weapons_2:research_infantry_weapons terran_infantry_weapons_3:research_infantry_weapons
terran_infantry_armor_1:research_infantry_armor terran_infantry_armor_2:research_infantry_armor terran_infantry_armor_3:research_infantry_armor
terran_vehicle_weapons_1:research_vehicle_weapons terran_vehicle_weapons_2:research_vehicle_weapons terran_vehicle_weapons_3:research_vehicle_weapons
terran_ship_weapons_1:research_ship_weapons terran_ship_weapons_2:research_ship_weapons terran_ship_weapons_3:research_ship_weapons
terran_vehicle_ship_plating_1:research_vehicle_plating terran_vehicle_ship_plating_2:research_vehicle_plating terran_vehicle_ship_plating_3:research_vehicle_plating
drone_burrowed:forager queen_burrowed:brood_keeper zergling_burrowed:skitterling baneling:sporeburst baneling_burrowed:sporeburst
baneling_cocoon:sporeburst_cocoon roach:bile_crawler hydralisk:blight_hurler
ravager:rupture_crawler ravager_cocoon:rupture_cocoon morph_ravager:morph_rupture_crawler corrosive_bile:caustic_barrage
roach_burrowed:bile_crawler ravager_burrowed:rupture_crawler hydralisk_burrowed:blight_hurler
ultralisk_burrowed:carapace_bulwark burrow:research_burrow rapid_regeneration_passive:bile_crawler
lair:brood_lair hive:brood_hive infestation_pit:infestation_pit hydralisk_den:spine_den
morph_lair:evolve_brood_lair morph_hive:evolve_brood_hive
tunneling_claws:research_tunneling_claws glial_reconstitution:research_glial_reconstitution
evolution_chamber:adaptation_chamber
zerg_melee_attacks_1:research_brood_melee zerg_melee_attacks_2:research_brood_melee zerg_melee_attacks_3:research_brood_melee
zerg_missile_attacks_1:research_brood_missiles zerg_missile_attacks_2:research_brood_missiles zerg_missile_attacks_3:research_brood_missiles
zerg_ground_carapace_1:research_brood_carapace zerg_ground_carapace_2:research_brood_carapace zerg_ground_carapace_3:research_brood_carapace
grooved_spines:research_grooved_spines muscular_augments:research_muscular_augments
nanomuscular_swell:research_nanomuscular_swell hydralisk_lunge:hurler_lunge
lurker_den:ambusher_den lurker:spine_ambusher lurker_burrowed:spine_ambusher lurker_cocoon:ambusher_cocoon
morph_lurker:morph_spine_ambusher lurker_burrow:burrow lurker_unburrow:surface weapons_free:hold_fire
adaptive_talons:research_adaptive_talons seismic_spines:research_seismic_spines
ultralisk_cavern:carapace_cavern chitinous_plating:research_chitinous_plating
anabolic_synthesis:research_anabolic_synthesis frenzied_passive:carapace_bulwark
spine_crawler:thorn_watch spine_crawler_uprooted:thorn_watch spore_crawler_uprooted:spore_watch
crawler_root:crawler_root crawler_uproot:crawler_uproot
overlord_transport:drift_hauler overlord_transport_cocoon:hauler_cocoon overseer:spore_seer
overseer_cocoon:seer_cocoon overseer_oversight:spore_seer
morph_overlord_transport:morph_drift_hauler morph_overseer:morph_spore_seer
pneumatized_carapace:research_pneumatized_carapace generate_creep:generate_drift_creep
overlord_load_unload:load_transport oversight_mode_enter:seer_oversight oversight_mode_exit:seer_mobile
contaminate:contaminate_production spawn_changeling:spawn_brood_mimic changeling:brood_mimic
changeling_zealot:brood_mimic changeling_marine:brood_mimic changeling_zergling:brood_mimic
changeling_marine_shield:brood_mimic changeling_zergling_wings:brood_mimic
zerg_flyer_attacks_1:research_brood_air_weapons zerg_flyer_attacks_2:research_brood_air_weapons zerg_flyer_attacks_3:research_brood_air_weapons
zerg_flyer_carapace_1:research_brood_air_armor zerg_flyer_carapace_2:research_brood_air_armor zerg_flyer_carapace_3:research_brood_air_armor
corruptor:corrosion_flyer brood_lord:brood_siege_flyer brood_lord_cocoon:siege_flyer_cocoon
broodling:broodling greater_spire:greater_blight_spire morph_greater_spire:evolve_greater_blight_spire
morph_brood_lord:morph_brood_siege_flyer caustic_spray:caustic_spray
infestor:mireweaver infestor_burrowed:mireweaver fungal_growth:fungal_grasp microbial_shroud:microbial_shroud
evolve_microbial_shroud:research_microbial_shroud neural_parasite:neural_tether neural_parasite_upgrade:research_neural_tether
swarm_host:locust_brooder swarm_host_burrowed:locust_brooder locust_flying:locust_flying locust_landed:locust_landed
spawn_locusts:launch_locusts locust_swoop:locust_swoop
viper:siphon_wyrm consume:siphon_structure abduct:wyrm_grasp blinding_cloud:blinding_cloud parasitic_bomb:parasitic_cloud
metabolic_boost:research_metabolic_boost adrenal_glands:research_adrenal_glands centrifugal_hooks:research_rolling_spores
creep_tumor_spread:spread_growth_node transfusion:transfuse_brood tissue_regeneration_passive:needlewing
ultralisk:carapace_bulwark overlord:drift_sac mutalisk:needlewing hatchery:brood_nest
extractor:spore_tap creep_tumor:brood_growth_node baneling_nest:spore_nursery
spawning_pool:hatchling_pool roach_warren:bile_warren
spore_crawler:spore_watch spire:blight_spire nydus_network:tunnel_mouth nydus_worm:brood_tunnel_worm
summon_nydus_worm:summon_brood_worm nydus_load_unload:load_brood_tunnel
probe:mote zealot:sunblade sentry:aegis_warden stalker:skirmisher dark_templar:duskblade
dark_shrine:veil_sanctum shadow_stride:shadow_stride shadow_stride_upgrade:research_shadow_stride
archon:lattice_archon archon_merge:merge_archon
adept:mirage_adept adept_phase_shift:mirage_shade psionic_transfer:mirage_transfer
psionic_transfer_cancel:cancel_mirage_transfer resonating_glaives:research_resonant_glaives
high_templar:storm_scribe templar_archives:canticle_archive feedback:scribe_feedback
psionic_storm:canticle_storm psionic_storm_upgrade:research_canticle_storm
observer:farsight_wisp warp_prism:lumen_carrier warp_prism_phasing:lumen_carrier
colossus:spire_walker mothership:crownspire nexus:heartstone pylon:resonator
phoenix:dawn_interceptor void_ray:prism_ray stargate:star_assembly fleet_beacon:fleet_spire
tempest:horizon_lancer tectonic_destabilizers:research_tectonic_resonance
carrier:fleet_carrier interceptor:pursuit_fighter build_interceptor:build_pursuit_fighter
oracle:sunseer stasis_ward:stasis_ward activate_pulsar_beam:pulsar_beam revelation:revelation
build_stasis_ward:seed_stasis_ward stasis_ward_detonate:stasis_ward
graviton_beam:gravity_lift prismatic_alignment:prism_alignment anion_pulse_crystals:research_pulse_crystals flux_vanes:research_flux_vanes
protoss_air_weapons_1:research_concord_air_weapons protoss_air_weapons_2:research_concord_air_weapons protoss_air_weapons_3:research_concord_air_weapons
protoss_air_armor_1:research_concord_air_armor protoss_air_armor_2:research_concord_air_armor protoss_air_armor_3:research_concord_air_armor
assimilator:aether_prism gateway:waystone photon_cannon:aegis_relay
cybernetics_core:concord_core warp_gate:transit_waystone warp_gate_research:research_transit
transform_to_warp_gate:open_transit transform_to_gateway:close_transit warp_in_gateway_unit:transit_sunblade
shield_battery:aegis_capacitor shield_battery_restore:restore_aegis
twilight_council:twilight_array charge:research_charge blink_upgrade:research_phase_step
forge:prism_forge robotics_facility:robotics_foundry observer_surveillance:farsight_wisp
robotics_bay:robotics_annex immortal:bastion_walker immortal_barrier:bastion_barrier
disruptor:rift_engine purification_nova:rift_nova purification_nova_cast:rift_nova_cast
gravitic_boosters:research_wisp_thrusters gravitic_drive:research_lumen_drive extended_thermal_lance:research_extended_prism
surveillance_mode_enter:surveillance_mode surveillance_mode_exit:surveillance_mode
warp_prism_load_unload:load_transport phasing_mode_enter:deploy_power_field phasing_mode_exit:retract_power_field
protoss_ground_weapons_1:research_concord_ground_weapons protoss_ground_weapons_2:research_concord_ground_weapons
protoss_ground_weapons_3:research_concord_ground_weapons protoss_ground_armor_1:research_concord_ground_armor
protoss_ground_armor_2:research_concord_ground_armor protoss_ground_armor_3:research_concord_ground_armor
protoss_shields_1:research_concord_shields protoss_shields_2:research_concord_shields protoss_shields_3:research_concord_shields
calldown_mule:deploy_prospector calldown_extra_supplies:reinforce_supply scanner_sweep:recon_sweep
stimpack_marine:surge stimpack_marauder:surge siege_mode:emplace unsiege:mobilize
kd8_charge:ridge_charge
viking_assault_mode:fighter_assault viking_fighter_mode:fighter_intercept
salvage:salvage lift_off:lift land_structure:land supply_depot_lower:retract_silo
supply_depot_raise:extend_silo scv_repair:repair scv_gather:harvest mule_gather:harvest
weapons_free_hold_fire:hold_fire morph_to_orbital_command:upgrade_hub
build_tech_lab:attach_research_module build_reactor:attach_fabrication_module
drone_gather:harvest zerg_burrow:burrow zerg_unburrow:surface hold_fire:hold_fire
spawn_larva:inject_brood spawn_creep_tumor_queen:seed_growth_node larva_morph_unit:larva_morph_unit
cliff_walk_colossus:spire_walker
morph_baneling:morph_sporeburst baneling_explode:detonate_sporeburst
baneling_building_attack_toggle:sporeburst_structures nydus_load_unload:send_tunnel_squad
set_worker_rally:rally_worker set_unit_rally:rally probe_gather:harvest
chrono_boost:production_boost energy_recharge:energy_recharge nexus_strategic_recall:defensive_recall charge_dash:charge
force_field:phase_barrier guardian_shield:guardian_shield hallucination:hallucination blink:phase_step cloaking_field:flagship_cloak
time_warp:time_warp mothership_mass_recall:flagship_recall
set_nexus_worker_rally:rally
""".split())

DEPENDENCIES = {
    "base_unit_id", "built_by", "built_from", "requires", "addon_required",
    "requires_upgrade", "casters", "researched_at",
}

# Claims here are scoped to checks in the named fixture or rendered demo.
# An absent check is pending, including on mapped rows.
EVIDENCE = {
    **{
        name: {"behavior": "Uses the rich form on a rich vent. Each mining trip collects six aether.",
               "tests": ["test_meridian_operations.gd"]}
        for name in ("refinery_rich", "extractor_rich", "assimilator_rich")
    },
    "cliff_walk_colossus": {
        "behavior": "Crosses ledges as a ground unit. Both ground and air weapons can target the Walker.",
        "tests": ["test_concord_robotics.gd"],
    },
    "changeling_marine_shield": {
        "behavior": "Copies the shield appearance after the observed opponent researches Combat Shields.",
        "tests": ["test_gnarl_scout_morphs.gd"],
    },
    "changeling_zergling_wings": {
        "behavior": "Copies wings and upgraded movement when disguising against a Gnarl opponent with Metabolic Boost.",
        "tests": ["test_gnarl_scout_morphs.gd"],
    },
    "larva_morph_unit": {
        "behavior": "Uses the selected physical larva to start an eligible Gnarl hatch.",
        "tests": ["test_ladder_opening.gd"],
    },
    "tech_lab": {
        "behavior": "Research advances concurrently with the parent building's production. Lift waits for research to finish or be canceled.",
        "tests": ["test_meridian_factory.gd", "test_relocatable_production.gd"],
    },
    "orbital_command": {
        "stats": "150 crystal, 25 seconds, 50 starting energy, and 0.7875 energy per second.",
        "behavior": "Operations unlocks scans, Prospectors and supply reinforcement.",
        "tests": ["test_meridian_operations.gd"],
    },
    "planetary_fortress": {
        "stats": "150/150 conversion with a Field Armory. Two armor and 1,500 HP.",
        "behavior": "Fires only at ground targets, retains worker production and supports five sheltered Pioneers.",
        "tests": ["test_meridian_operations.gd"],
    },
    "sensor_tower": {
        "behavior": "Shows positions of unobserved, uncloaked contacts without granting targeting vision. Can be salvaged.",
        "tests": ["test_meridian_operations.gd"],
    },
    "raven": {
        "behavior": "Detects, places temporary dual-plane turrets, and launches jamming and armor-reducing missiles.",
        "assets": "Original Antigravity GLB with five clips and distinct launch and impact cues.",
        "tests": ["test_meridian_capital.gd"],
    },
    "battlecruiser": {
        "behavior": "Fires while moving, has a 240-damage siege beam and jumps after a vulnerable windup.",
        "assets": "Original Antigravity GLB with five clips, paired batteries, and distinct beam and jump cues.",
        "tests": ["test_meridian_capital.gd"],
    },
    "medivac": {
        "stats": "100/100, two supply, 150 HP, 30 seconds and eight cargo slots.",
        "behavior": "Heals biological allies at 12.6 HP/s, boards on a targeted order and unloads in sequence.",
        "tests": ["test_meridian_airframe.gd"],
    },
    "viking_fighter": {
        "behavior": "135 HP, air-only dual missiles, timed landing, and Smart Servos. Both modes use ship upgrades.",
        "tests": ["test_meridian_airframe.gd"],
    },
    "banshee": {
        "behavior": "Requires a Research Module. Researched cloak drains energy and can be toggled.",
        "assets": "Original Antigravity GLB with separate rocket anchors and a distinct firing cue.",
        "tests": ["test_meridian_airframe.gd"],
    },
    "liberator_defender": {
        "behavior": "Remains airborne and can fire only on non-structure ground targets in its designated area.",
        "assets": "Original Antigravity Defender GLB with a ventral cannon anchor and a distinct firing cue.",
        "tests": ["test_meridian_airframe.gd"],
    },
    "engineering_bay": {
        "stats": "125 crystal, 850 HP and 25 seconds. Later infantry upgrades require a Vehicle Armory.",
        "behavior": "Queues infantry weapons and armor separately from vehicle and ship research.",
        "tests": ["test_meridian_research.gd"],
    },
    "combat_shield": {
        "behavior": "Increases both current and maximum health by 10 on existing and newly trained Riflemen.",
        "tests": ["test_meridian_research.gd"],
    },
    "bunker": {
        "behavior": "Four cargo slots. Adds weapon range and returns 75 crystal on salvage after ejecting the garrison.",
        "tests": ["test_meridian_research.gd"],
    },
    "ghost": {
        "stats": "125 HP. Rifle training requires a Research Module and a Specter Academy.",
        "behavior": "Cloak, interruptible precision shot, EMP, and an armed Tactical Strike use separate commands.",
        "assets": "Original Antigravity GLB and deterministic generator.",
        "tests": ["test_shade_agent.gd"],
    },
    "hellion": {
        "behavior": "The flame line hits hostile ground units. Completed Armory tech unlocks conversion.",
        "tests": ["test_meridian_factory.gd"],
    },
    "hellbat": {
        "behavior": "The flame cone applies the researched bonus against Light units once per hit.",
        "tests": ["test_meridian_factory.gd"],
    },
    "widow_mine_burrowed": {
        "behavior": "Arms a delayed attack with shield bonus and friendly splash, then reveals itself while reloading unless Drilling Claws is researched.",
        "tests": ["test_meridian_factory.gd"],
    },
    "cyclone": {
        "behavior": "Lock On bypasses armor and fires while moving. Magnetic Accelerator increases the missile damage.",
        "tests": ["test_meridian_factory.gd"],
    },
    "thor": {
        "behavior": "Four airburst hits splash on aircraft. Smart Servos shortens the precision-payload conversion.",
        "tests": ["test_meridian_factory.gd"],
    },
    "burrow": {
        "stats": "100 crystal, 100 aether and 100/1.4 seconds.",
        "behavior": "A Brood Nest at any evolution tier researches a single faction-wide unlock.",
        "tests": ["test_gnarl_burrow.gd"],
    },
    "zerg_burrow": {
        "behavior": "Eight existing Gnarl types use their individual Faster transition durations, bounded jitter and detection after descent. The commander burrows wounded Bile Crawlers only beside an observed threat on camera.",
        "tests": ["test_gnarl_burrow.gd"],
    },
    "zerg_unburrow": {
        "behavior": "A timed emergence restores surface collision and visibility. Basic orders issued while emerging run on completion.",
        "tests": ["test_gnarl_burrow.gd"],
    },
    "rapid_regeneration_passive": {
        "stats": "Seven bonus HP per Faster second while a Bile Crawler is buried.",
        "tests": ["test_gnarl_burrow.gd"],
    },
    "lair": {
        "stats": "150 crystal, 100 aether, 80/1.4 seconds, and 2,000 maximum HP.",
        "behavior": "Requires a Hatchling Pool. The Nest keeps its identity, supply, drop-off, and larva production.",
        "tests": ["test_gnarl_nest_evolution.gd"],
    },
    "hive": {
        "stats": "200 crystal, 150 aether, 100/1.4 seconds, and 2,500 maximum HP.",
        "behavior": "Requires an Infestation Pit and a Lair. Continues to satisfy Lair prerequisites.",
        "tests": ["test_gnarl_nest_evolution.gd"],
    },
    "tunneling_claws": {
        "stats": "100 crystal, 100 aether, 110/1.4 seconds, and 2.8 Faster map units per second before modifiers.",
        "behavior": "Research at a Bile Warren with Lair tech. Updates existing buried Bile Crawlers and lets them move underground with a separate mobile collision layer.",
        "tests": ["test_gnarl_nest_evolution.gd"],
    },
    "glial_reconstitution": {
        "stats": "100 crystal, 100 aether, 110/1.4 seconds. Changes Bile Crawler speed on the surface and while tunneling.",
        "tests": ["test_gnarl_nest_evolution.gd"],
    },
    "evolution_chamber": {
        "stats": "75 crystal, 25 seconds, and 750 maximum HP.",
        "behavior": "Separate melee, missile, and carapace levels. Level two requires a Lair and level three requires a Hive.",
        "tests": ["test_gnarl_ground_upgrades.gd"],
    },
    "hydralisk": {
        "stats": "100 crystal, 50 aether, two supply, 90 HP, and 33/1.4 second larva morph. Twelve damage per needle volley.",
        "behavior": "Spine Den gates production. Grooved Spines extends attack range. Muscular Augments changes speed on and off living ground.",
        "tests": ["test_gnarl_ground_upgrades.gd"],
    },
    "hydralisk_lunge": {
        "stats": "Double movement speed for 0.71 seconds and a ten-second cooldown.",
        "behavior": "Point-targeted move after Hive-gated research. The commander chooses a visible retreat point from threats in its camera.",
        "tests": ["test_gnarl_ground_upgrades.gd"],
    },
    "lurker": {
        "stats": "50 crystal, 100 aether, one extra supply, 25/1.4 second morph, and 190 HP.",
        "behavior": "Requires an Ambusher Den. Burrows innately. Only the buried form attacks, with a ground-only line and an armored bonus.",
        "tests": ["test_spine_ambusher.gd"],
    },
    "lurker_burrowed": {
        "behavior": "Can fire while immobile. The line hits ground enemies along the attack direction, with allies and air excluded. Seismic Spines extends the range.",
        "tests": ["test_spine_ambusher.gd"],
    },
    "ultralisk": {
        "stats": "275 crystal, 200 aether, six supply, 55/1.4 second larva morph, and 500 HP.",
        "behavior": "Hive-gated Cavern production, Massive barrier crushing, and frontal ground cleave. Chitinous Plating and Anabolic Synthesis are paid at the Cavern.",
        "tests": ["test_carapace_bulwark_ladder.gd", "test_guardian_shield.gd"],
    },
    "frenzied_passive": {
        "behavior": "The Bulwark ignores the existing Concussive Shells slow and Ridge Charge knockback. Other spell interactions remain to be audited as their casters are added.",
        "tests": ["test_carapace_bulwark_ladder.gd"],
    },
    "spore_crawler": {
        "stats": "75 crystal, 30/1.4 second build, 300 HP and anti-air 20 plus ten against Biological.",
        "behavior": "Either Hatchling Pool or Adaptation Chamber unlocks construction on living ground. Detection switches off during relocation and resumes after rooting.",
        "tests": ["test_gnarl_defenses.gd"],
    },
    "spine_crawler": {
        "stats": "100 crystal, 50/1.4 second build, 300 HP and ground-only 25 plus five against Armored.",
        "behavior": "Hatchling Pool gate, relocatable on ground, and living-ground rooting.",
        "tests": ["test_gnarl_defenses.gd"],
    },
    "overlord": {
        "stats": "0.9 unupgraded Faster speed, 200 HP and eight supply.",
        "behavior": "Lair-gated transport and detector morphs and stationary living-ground generation.",
        "tests": ["test_gnarl_scout_morphs.gd"],
    },
    "overseer": {
        "stats": "50 crystal, 50 aether, 17/1.4 second morph and eight retained supply.",
        "behavior": "Mobile detection, 25-percent wider stationary Oversight, Contaminate and temporary Mimics.",
        "tests": ["test_gnarl_scout_morphs.gd"],
    },
    "changeling": {
        "stats": "50 Seer energy, five HP, no supply, and 150/1.4 second lifetime.",
        "behavior": "Disguises once as basic infantry of the first seen enemy faction. The enemy observes the appearance and team color. Shield and wing variants remain open.",
        "tests": ["test_gnarl_scout_morphs.gd"],
    },
    "spire": {
        "stats": "150 crystal, 150 aether and 66 seconds.",
        "behavior": "Lair gate, Flyer Attacks and Carapace queues, and paid evolution behind Hive tech.",
        "tests": ["test_gnarl_air_upgrades.gd", "test_gnarl_siege_flyer.gd"],
    },
    "corruptor": {
        "stats": "150 crystal, 100 aether, two supply, 40/1.4 second production and 200 HP.",
        "behavior": "Anti-air weapon with a Massive bonus. Caustic Spray holds position and ramps against enemy structures.",
        "tests": ["test_gnarl_siege_flyer.gd"],
    },
    "brood_lord": {
        "stats": "150 crystal, 150 aether, two extra supply, 34/1.4 second morph and 225 HP.",
        "behavior": "Ground-only attack emits two 3.57-second Broodlings that use melee upgrades.",
        "tests": ["test_gnarl_siege_flyer.gd"],
    },
    "reaper": {
        "stats": "Paid production cost, duration, and initial HP. Movement scale still needs reference validation.",
        "behavior": "Cliff routes, bridge routes, timed recovery and point-targeted charge.",
        "assets": "Antigravity GLB with five clips, team panels, original audio and sixteen voice lines.",
        "tests": ["test_ridge_scout.gd", "test_audio_sfx.gd", "Ridge Scout vs Skitterlings rendered demo"],
    },
    "kd8_charge": {
        "behavior": "Range, delayed impact, cooldown, armor bypass, ground filtering and friendly damage.",
        "assets": "Point-target icon, warning ring, throw and impact effects, two audio cues.",
        "tests": ["test_ridge_scout.gd", "Ridge Scout vs Skitterlings rendered demo"],
    },
    "larva": {
        "behavior": "Nest-local natural cap, timed injections and consumption on production.",
        "assets": "Antigravity GLB with wriggle clip and a ready cue.",
        "tests": ["test_ladder_opening.gd", "test_audio_sfx.gd"],
    },
    "egg": {
        "behavior": "Targetable morph, cancellation refund, destruction without refund and independent hatching.",
        "assets": "Antigravity GLB with pulse clip and morph and hatch cues.",
        "tests": ["test_ladder_opening.gd", "test_audio_sfx.gd"],
    },
    "spawning_pool": {
        "stats": "200 crystal and 46.429 seconds.",
        "behavior": "Forager is consumed on active living ground. Completion gates Keepers and Skitterlings.",
        "assets": "Antigravity GLB with a looping idle clip, team panels and an original completion cue.",
        "tests": ["test_ladder_opening.gd", "Gnarl Tech gameplay screenshot"],
    },
    "roach_warren": {
        "stats": "150 crystal and 39.286 seconds.",
        "behavior": "Requires a completed Hatchling Pool. Completion unlocks Bile Crawlers.",
        "assets": "Antigravity GLB with a looping idle clip, team panels and an original completion cue.",
        "tests": ["test_ladder_opening.gd", "Gnarl Tech gameplay screenshot"],
    },
    "cybernetics_core": {
        "stats": "150 crystal with a 35.714-second build time.",
        "behavior": "Requires a Waystone and power. Completion gates Skirmisher and Aegis Warden training and Transit research.",
        "assets": "Antigravity GLB with team panels and a looping idle clip.",
        "tests": ["test_concord_transit.gd"],
    },
    "warp_gate": {
        "behavior": "Paid research unlocks a reversible, timed Waystone transformation. Deployment cooldown pauses when unpowered.",
        "assets": "Antigravity GLB with team panels and a looping idle clip.",
        "tests": ["test_concord_transit.gd"],
    },
    "warp_gate_research": {
        "stats": "50 crystal, 50 aether, and 100 seconds.",
        "behavior": "Queued at Concord Core, paused by power loss, and accelerated by Heartstone production boost.",
        "tests": ["test_concord_transit.gd"],
    },
    "warp_in_gateway_unit": {
        "behavior": "Sunblade, Skirmisher, and Aegis Warden use a paid, shared cooldown with fast and slow field times.",
        "assets": "Unit portraits, field timing preview, deployment ring and original audio cues.",
        "tests": ["test_concord_transit.gd", "test_audio_sfx.gd"],
    },
    "energy_recharge": {
        "stats": "50 energy cost, up to 50 energy restored, and a shared 45-second cooldown.",
        "behavior": "Friendly energy users must be within 30 world units of a completed Heartstone.",
        "tests": ["test_concord_transit.gd"],
    },
    "nexus_strategic_recall": {
        "stats": "50 energy cost, four-second channel, and a shared 130-second cooldown.",
        "behavior": "Nearby units cannot move or fire while channeling. They are vulnerable during the channel and briefly protected after landing.",
        "tests": ["test_concord_transit.gd"],
    },
    "shield_battery": {
        "stats": "100 crystal, 28.571-second build time, 200 health, and 200 shields.",
        "behavior": "Power and a completed Concord Core are required. Placement near a completed Heartstone sets initial energy to 100 instead of 50.",
        "assets": "Antigravity GLB with team panels and a looping idle clip.",
        "tests": ["test_concord_transit.gd", "Concord Research and Support gameplay screenshot"],
    },
    "shield_battery_restore": {
        "behavior": "Manual restore and default autocast with a 50.4 shield-per-second rate at three shields per energy.",
        "tests": ["test_concord_transit.gd"],
    },
    "twilight_council": {
        "stats": "150 crystal, 100 aether, 35.714-second build time, 500 health, and 500 shields.",
        "behavior": "Powered research offers for Charge and Phase Step.",
        "assets": "Antigravity GLB with team panels and a looping idle clip.",
        "tests": ["test_concord_transit.gd", "Concord Research and Support gameplay screenshot"],
    },
    "charge": {
        "stats": "100 crystal, 100 aether, and 100 seconds.",
        "behavior": "Unlocks Charge and increases the speed of current and future Sunblades.",
        "tests": ["test_concord_transit.gd"],
    },
    "blink_upgrade": {
        "stats": "150 crystal, 150 aether, and 121.429 seconds.",
        "behavior": "Unlocks Phase Step with visible ground targeting and distinct landings for group casts.",
        "tests": ["test_concord_transit.gd"],
    },
    "forge": {
        "stats": "150 crystal, 32.143-second build time, 400 health, and 400 shields.",
        "behavior": "Powered research queues ground weapons, ground armor, and shield armor. A completed Twilight Array gates the two higher levels.",
        "assets": "Antigravity GLB with an idle clip and team panels.",
        "tests": ["test_concord_forge.gd", "Concord industry gameplay screenshot"],
    },
    "photon_cannon": {
        "stats": "150 crystal, 28.571-second build time, 150 health, and 150 shields.",
        "behavior": "Requires a Forge and power. Targets air and ground and detects nearby hidden units. Projectile flight is currently visual.",
        "assets": "Antigravity turret and muzzle rig, a projectile effect, and a distinct original firing cue.",
        "tests": ["test_concord_forge.gd", "Concord industry gameplay screenshot"],
    },
    "robotics_facility": {
        "stats": "150 crystal, 100 aether, 46.429-second build time, 450 health, and 450 shields.",
        "behavior": "A powered Foundry trains Farsight Wisps, Lumen Carriers, and Bastion Walkers. Spire Walkers and Rift Engines require the Robotics Annex.",
        "assets": "Antigravity GLB with team panels and an idle clip.",
        "tests": ["test_concord_robotics.gd", "Concord industry gameplay screenshot"],
    },
    "observer_surveillance": {
        "behavior": "Surveillance anchors the Farsight Wisp, reveals it, and expands its detection and sight radius.",
        "tests": ["test_concord_robotics.gd"],
    },
    "warp_prism_phasing": {
        "behavior": "Timed transformation locks movement and powers a fast deployment field until folded or destroyed.",
        "tests": ["test_concord_robotics.gd"],
    },
    "robotics_bay": {
        "stats": "150 crystal, 150 aether, 46.429-second build time, 500 health, and 500 shields.",
        "behavior": "Unlocks Spire Walkers and Rift Engines and researches Wisp speed, Lumen speed, and Spire range.",
        "assets": "Antigravity GLB with a looping idle clip and team panels.",
        "tests": ["test_concord_robotics.gd"],
    },
    "immortal": {
        "stats": "250 crystal, 100 aether, four supply, 39.286-second build time, and an armored damage bonus.",
        "behavior": "Manual and automatic Barrier absorb the triggering hit and incoming damage up to a 100-point pool.",
        "assets": "Antigravity GLB with four animations, two muzzle anchors, original fire and Barrier cues, and sixteen voice lines.",
        "tests": ["test_concord_robotics.gd", "test_audio_sfx.gd", "Concord robotics rendered demo"],
    },
    "disruptor": {
        "stats": "150 crystal, 150 aether, four supply, and 35.714-second build time.",
        "behavior": "A completed Robotics Annex is required. The Rift Engine uses Nova as its only attack.",
        "assets": "Antigravity GLB with four animations, original launch and impact sounds, and sixteen voice lines.",
        "tests": ["test_concord_robotics.gd", "test_audio_sfx.gd", "Concord robotics rendered demo"],
    },
    "purification_nova_cast": {
        "behavior": "A steerable Nova immobilizes the caster during the fuse, then damages friendly and enemy ground troops. Buildings and air units are unaffected.",
        "tests": ["test_concord_robotics.gd", "test_audio_sfx.gd"],
    },
    "adept": {
        "stats": "100 crystal, 25 aether, two supply, 30-second production, and level-one damage of 11 plus 13 versus Light.",
        "behavior": "The Concord Core unlocks the Adept for Waystone production and Transit deployment. The glaive flight is visual.",
        "assets": "Antigravity GLB with idle, walk, attack, cast and death clips, original glaive and transfer sounds, and sixteen voice lines.",
        "tests": ["test_mirage_adept.gd", "test_audio_sfx.gd", "Mirage Adepts versus Riflemen rendered demo"],
    },
    "adept_phase_shift": {
        "behavior": "An independently steerable, untargetable Shade scouts during its seven-second lifetime. The Adept remains controllable until transfer.",
        "assets": "Antigravity GLB with a translucent matching silhouette and looping drift clip.",
        "tests": ["test_mirage_adept.gd", "Mirage Adepts versus Riflemen rendered demo"],
    },
    "psionic_transfer_cancel": {
        "behavior": "The caster and Shade can both cancel an active transfer.",
        "tests": ["test_mirage_adept.gd"],
    },
    "resonating_glaives": {
        "stats": "100 crystal, 100 aether, and 100 seconds of Twilight Array research for 45 percent faster attacks.",
        "tests": ["test_mirage_adept.gd"],
    },
    "high_templar": {
        "stats": "50 crystal, 150 aether, two supply, 40-second production, and 50 initial energy.",
        "behavior": "The Canticle Archive unlocks Storm Scribes at a Waystone. Feedback works immediately. Storm requires research. Scribes can fuse with other Scribes or Duskblades.",
        "assets": "Antigravity GLB with idle, walk, attack, cast and death clips, original effects, and sixteen voice lines.",
        "tests": ["test_storm_scribe.gd", "test_audio_sfx.gd", "Storm Scribes rendered demo"],
    },
    "templar_archives": {
        "behavior": "The Canticle Archive requires a completed Twilight Array and friendly power.",
        "assets": "Antigravity GLB with a looping idle clip.",
        "tests": ["test_storm_scribe.gd", "Storm Scribes rendered demo"],
    },
    "feedback": {
        "behavior": "Drains enemy unit energy and deals half the amount as armor-bypassing damage.",
        "tests": ["test_storm_scribe.gd"],
    },
    "psionic_storm": {
        "behavior": "Deals 110 damage over six seconds to friendly and hostile air and ground units. Buildings are immune and overlapping storms do not stack.",
        "tests": ["test_storm_scribe.gd"],
    },
    "dark_templar": {
        "stats": "125 crystal, 125 aether, two supply, 40-second Waystone production, and 40 health and 80 shields.",
        "behavior": "Permanent cloak with detector reveal. The Veil Sanctum unlocks production and researches Shadow Stride.",
        "assets": "Antigravity GLB with walk, idle, attack, cast and death clips, sixteen voice lines and a distinct blade cue.",
        "tests": ["test_duskblade.gd", "test_audio_sfx.gd", "Duskblade rendered demo"],
    },
    "shadow_stride": {
        "behavior": "Teleports to visible valid ground, preserves cloak, and starts a 14-second cooldown and a quarter-second attack delay.",
        "tests": ["test_duskblade.gd"],
    },
    "archon": {
        "stats": "10 health, 350 shields, and four supply.",
        "behavior": "Lattice Shockwave targets ground and air with a biological bonus and same-plane splash. Allied units take no splash.",
        "assets": "Antigravity translucent GLB with hover, attack, warp and death clips, original lightning and sound, and sixteen voice lines.",
        "tests": ["test_lattice_archon.gd", "test_audio_sfx.gd", "Lattice Archon rendered demo"],
    },
    "archon_merge": {
        "behavior": "Two selected Scribes or Duskblades walk together, consume both casters, preserve their four supply, and begin the timed warp. Damage during the warp carries through completion.",
        "tests": ["test_lattice_archon.gd"],
    },
    "sentry": {
        "stats": "50 crystal, 100 aether, 40 health, 40 shields, 50 starting energy, and a six-damage beam with four extra damage to shields.",
        "behavior": "The ladder Warden has Guardian Shield, Phase Barrier, and Hallucination for nine unit types currently in the roster.",
        "tests": ["test_guardian_shield.gd", "test_hallucination.gd"],
    },
    "guardian_shield": {
        "behavior": "The moving field spends 75 energy and reduces allied ranged hits by two per hit. Overlapping fields do not stack, and the reduction does not apply to melee or spells.",
        "tests": ["test_guardian_shield.gd"],
    },
    "hallucination": {
        "behavior": "Spend 75 energy on temporary copies. Copies reserve no supply, deal no damage, take double damage, and appear normal to enemies without detection. Three air forms remain pending.",
        "tests": ["test_hallucination.gd"],
    },
    "force_field": {
        "stats": "50 energy, 22.5 world-unit cast range, 3.75 world-unit radius, and 11-second lifetime under ladder rules.",
        "behavior": "Blocks ground movement, displaces ground occupants on placement, is crushed by Massive units, and shatters on one Caustic Barrage hit.",
        "tests": ["test_guardian_shield.gd", "test_rupture_crawler.gd"],
    },
    "ravager": {
        "stats": "120 health, one armor, three total supply, and a 16-damage ground attack.",
        "behavior": "A Bile Crawler morphs into a Rupture Crawler through a cancellable cocoon. Burrow and dedicated missile upgrades are pending.",
        "tests": ["test_rupture_crawler.gd"],
    },
    "ravager_cocoon": {
        "stats": "100 health, five armor, and an immobile 12.14-second morph.",
        "behavior": "Reserves the extra supply while morphing. Cancelling restores the original unit and returns the morph cost.",
        "tests": ["test_rupture_crawler.gd"],
    },
    "corrosive_bile": {
        "behavior": "A delayed 60-damage strike hits air, ground, buildings and friendly units. One strike removes a Phase Barrier. The commander targets a visible barrier after its camera arrives.",
        "tests": ["test_rupture_crawler.gd"],
    },
}


def dependencies(value, valid_ids):
    result = set()
    for key, item in value.items():
        if key in DEPENDENCIES:
            references = [item] if isinstance(item, str) else item
            if isinstance(references, list):
                result.update(i for i in references if isinstance(i, str) and i in valid_ids)
        elif isinstance(item, dict):
            result.update(dependencies(item, valid_ids))
    return result


def audit(source):
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != REFERENCE_SHA256:
        raise ValueError(f"Expected the pinned 5.0.17 export, got SHA-256 {digest}")
    validator = source.with_name("validate_sc2_ladder_dump.py")
    if source.name != "sc2_ladder_complete.json" or hashlib.sha256(validator.read_bytes()).hexdigest() != VALIDATOR_SHA256:
        raise ValueError("Use the original dump and pinned validator from the Gemini export")
    subprocess.run([sys.executable, "-B", str(validator.resolve())], check=True)
    dump = json.loads(raw)
    index = dump["id_index"]
    rows = []
    entries_by_id = {}
    for group in ("units", "structures", "abilities", "upgrades"):
        for entries in dump[group].values():
            for entry in entries:
                entity_id = entry["id"]
                entries_by_id[entity_id] = entry
                equivalent = COUNTERPARTS.get(entity_id)
                row = {"id": entity_id, "race": entry["race"], "kind": index[entity_id]["kind"],
                       "starfall": equivalent, "requires": sorted(dependencies(entry, index)),
                       "status": "audit" if equivalent else "unmapped"}
                if entity_id in EVIDENCE:
                    row["evidence"] = EVIDENCE[entity_id]
                rows.append(row)
                for weapon in entry.get("weapons", []):
                    rows.append({"id": weapon["id"], "kind": "weapon", "race": entry["race"],
                                 "source_entity": entity_id, "starfall": equivalent,
                                 "status": "audit" if equivalent else "unmapped"})
    entity_ids = {row["id"] for row in rows if row["kind"] != "weapon"}
    if entity_ids != set(index):
        raise ValueError("Entity lists and ID index do not agree")
    check_live_patch(dump, entries_by_id)
    return {"patch": dump["meta"]["patch_version"], "build": dump["meta"]["build_number"],
            "reference_sha256": digest, "rows": rows}


def check_live_patch(dump, entries):
    """Spot-check the 5.0.17 values against Blizzard's published balance notes."""
    economy = dump["economy_and_map_objects"]["standard_base_resources"]
    warp = entries["warp_in_gateway_unit"]["effects"]
    ghost = entries["ghost"]
    rifle = ghost["weapons"][0]
    adept = entries["adept"]
    glaive = adept["weapons"][0]
    checks = {
        "starting workers": (dump["engine_and_simulation_rules"]["starting_conditions"]["starting_workers"], 12),
        "large mineral field": (economy["large_mineral_patches"]["minerals_each"], 1800),
        "small mineral field": (economy["small_mineral_patches"]["minerals_each"], 900),
        "geyser": (economy["vespene_per_geyser"], 2250),
        "Reaper production": (entries["reaper"]["production"]["build_time_faster_s"], 32),
        "Ghost health, damage, range": ((ghost["vitals"]["hp"], rifle["damage"], rifle["range"]), (125, 10, 6)),
        "Ghost damage versus Light": (rifle["bonuses"][0]["total_damage_per_hit"], 20),
        "Adept production and attack scaling": (
            (adept["production"]["build_time_faster_s"], adept["production"]["warpgate_cooldown_faster_s"],
             glaive["damage_per_upgrade"], glaive["bonuses"][0]["bonus_per_upgrade"]), (30, 20, 1, 1)),
        "Psionic Storm damage": (entries["psionic_storm"]["effects"]["total_spell_damage"], 110),
        "Hatchery minerals": (entries["hatchery"]["cost"]["minerals"], 275),
        "fast Warp Gate time": (round(warp["fast_warp_in_time_faster_s"], 1), 3.6),
        "slow Warp Gate time": (round(warp["slow_warp_in_time_faster_s"]), 11),
    }
    for level, cost in enumerate((150, 200, 250), 1):
        carapace = entries[f"zerg_ground_carapace_{level}"]["cost"]
        checks[f"carapace {level}"] = ((carapace["minerals"], carapace["vespene"]), (cost, cost))
    for rule, (actual, expected) in checks.items():
        if actual != expected:
            raise ValueError(f"5.0.17 {rule}: expected {expected!r}, got {actual!r}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = audit(args.source)
    rows = result.pop("rows")
    header = json.dumps(result, indent=2).removesuffix("\n}")
    body = ",\n".join("    " + json.dumps(row, ensure_ascii=False) for row in rows)
    args.output.write_text(f'{header},\n  "rows": [\n{body}\n  ]\n}}\n', encoding="utf-8", newline="\n")
    print(f"Wrote {len(rows)} audit rows")


if __name__ == "__main__":
    main()
